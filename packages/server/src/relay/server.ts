/**
 * iWORLD compute relay (approach C) — shared, private, metered TEE chat.
 *
 * POST /token  — header x-iworld-auth: <wallet signature of today's auth message>.
 *   1. recover the caller's address from the signature (proves who they are, cheaply)
 *   2. enforce a per-user daily message quota (so one user can't drain the shared pool)
 *   3. mint a CONTENT-FREE 0G Compute session token from the house ledger + return the
 *      provider endpoint/model. The browser then calls the TeeML provider DIRECTLY with
 *      that token — the relay never sees the conversation.
 * GET /health — house address, ledger balance, provider, quota.
 *
 * Run: pnpm --filter @kipr/server relay   (needs HOUSE_PRIVATE_KEY in .env + a funded
 * house wallet; ~4 0G opens the shared ledger).
 */
import express from 'express'
import cors from 'cors'
import { ethers } from 'ethers'
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk'
import {
  pickTeeMLProvider,
  ensureInferenceFunding,
  getChainContext,
  uploadBytes as ogUpload,
  downloadBytes as ogDownload,
  type ChainContext,
} from '@kipr/og'
import { getRelayConfig, relayAuthMessage, utcDay } from './config.js'

type Broker = Awaited<ReturnType<typeof createZGComputeNetworkBroker>>

const quota = new Map<string, { day: string; count: number }>()
const storeQuota = new Map<string, { day: string; count: number }>()

function take(map: Map<string, { day: string; count: number }>, addr: string, limit: number): boolean {
  const day = utcDay()
  const q = map.get(addr)
  if (!q || q.day !== day) {
    map.set(addr, { day, count: 1 })
    return true
  }
  if (q.count >= limit) return false
  q.count++
  return true
}
const takeQuota = (addr: string, limit: number) => take(quota, addr, limit)

function recover(sig: string): string {
  return ethers.verifyMessage(relayAuthMessage(utcDay()), sig).toLowerCase()
}

async function main() {
  const cfg = getRelayConfig()
  const provider = new ethers.JsonRpcProvider(cfg.evmRpc, cfg.chainId)
  const house = new ethers.Wallet(cfg.houseKey, provider)
  console.log(`▶ iWORLD compute relay — house ${house.address}`)

  const broker: Broker = await createZGComputeNetworkBroker(house)
  const service = await pickTeeMLProvider(broker, cfg.providerAddr)
  console.log(`  provider ${service.provider} · model ${service.model} · ack ${service.teeSignerAcknowledged}`)
  // If the provider is already acknowledged, the shared ledger is set up — don't
  // re-fund (that would drain it on every restart). Otherwise open/fund it once.
  if (!service.teeSignerAcknowledged) {
    console.log('  setting up the shared ledger (spends house 0G, one-time)…')
    await ensureInferenceFunding(broker, service.provider)
  } else {
    console.log('  shared ledger already funded — reusing it.')
  }
  const { endpoint, model } = await broker.inference.getServiceMetadata(service.provider)
  console.log(`  shared ledger ready · endpoint ${endpoint}`)

  // Storage relay: upload/serve ciphertext to/from 0G from Node (HTTP nodes, no browser
  // mixed-content block). The house wallet pays the tiny gas; it only sees ciphertext.
  let storeCtx: ChainContext | null = null
  try {
    storeCtx = getChainContext()
    console.log(`  storage relay ready · payer ${storeCtx.address}`)
  } catch (e) {
    console.warn('  storage relay disabled (set ZG_PRIVATE_KEY to enable):', (e as Error).message)
  }

  const app = express()
  app.use(cors({ origin: cfg.webOrigin }))
  app.use(express.json({ limit: '8mb' }))

  app.post('/store', async (req, res) => {
    if (!storeCtx) return res.status(503).json({ error: 'Storage relay not configured.' })
    try {
      const sig = String(req.headers['x-iworld-auth'] ?? '')
      let addr: string
      try {
        addr = recover(sig)
      } catch {
        return res.status(401).json({ error: 'Invalid auth signature.' })
      }
      if (!take(storeQuota, addr, cfg.dailyQuota * 8)) {
        return res.status(429).json({ error: 'Daily storage limit reached. Try again tomorrow.' })
      }
      const b64 = String((req.body as { data?: string }).data ?? '')
      if (!b64) return res.status(400).json({ error: 'Missing data.' })
      const bytes = new Uint8Array(Buffer.from(b64, 'base64'))
      // Bytes are already encrypted client-side — store as opaque (no extra encryption).
      const { rootHash, txHash } = await ogUpload(storeCtx, bytes, { encryptToSelf: false })
      res.json({ rootHash, txHash })
    } catch (e) {
      console.error('store error:', (e as Error).message)
      res.status(500).json({ error: `Couldn't store to 0G: ${(e as Error).message}` })
    }
  })

  app.get('/fetch/:rootHash', async (req, res) => {
    if (!storeCtx) return res.status(503).json({ error: 'Storage relay not configured.' })
    try {
      const bytes = await ogDownload(storeCtx, req.params.rootHash, { decrypt: false })
      res.json({ data: Buffer.from(bytes).toString('base64') })
    } catch (e) {
      res.status(500).json({ error: `Couldn't fetch from 0G: ${(e as Error).message}` })
    }
  })

  app.get('/health', async (_req, res) => {
    const bal = await provider.getBalance(house.address).catch(() => 0n)
    res.json({ ok: true, house: house.address, houseBalance0G: ethers.formatEther(bal), provider: service.provider, model, dailyQuota: cfg.dailyQuota })
  })

  app.post('/token', async (req, res) => {
    try {
      const sig = String(req.headers['x-iworld-auth'] ?? '')
      if (!sig) return res.status(401).json({ error: 'Missing auth signature.' })
      let addr: string
      try {
        addr = ethers.verifyMessage(relayAuthMessage(utcDay()), sig).toLowerCase()
      } catch {
        return res.status(401).json({ error: 'Invalid or expired auth signature.' })
      }
      if (!takeQuota(addr, cfg.dailyQuota)) {
        return res.status(429).json({ error: `Daily free message limit reached (${cfg.dailyQuota}). Fund your own ledger for unlimited.` })
      }
      // Content-free billing token — the relay never sees the message.
      const headers = (await broker.inference.getRequestHeaders(service.provider)) as unknown as Record<string, string>
      res.json({ authorization: headers.Authorization ?? headers.authorization, endpoint, model, provider: service.provider })
    } catch (e) {
      console.error('token error:', (e as Error).message)
      res.status(500).json({ error: 'Could not issue a compute token. Try again.' })
    }
  })

  app.listen(cfg.port, () => console.log(`  listening on http://localhost:${cfg.port}`))
}

main().catch((e) => {
  console.error('\n❌ Relay failed to start:', (e as Error).message)
  process.exit(1)
})
