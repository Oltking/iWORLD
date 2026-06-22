/**
 * Vercel serverless compute relay — mints a CONTENT-FREE 0G Compute session token from
 * the shared house ledger, so chat works for everyone (shared private pool) without each
 * user funding their own ~4 0G ledger. The browser then calls the TeeML provider DIRECTLY
 * with this token; the relay never sees a message.
 *
 * Set on Vercel: ZG_PRIVATE_KEY (the funded house wallet) + VITE_COMPUTE_RELAY_URL=/api
 * Optional: ZG_COMPUTE_PROVIDER_ADDR to pin a provider.
 */
import { createRequire } from 'node:module'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Wallet, JsonRpcProvider, verifyMessage } from 'ethers'
// SDK's ESM build is broken on Node 22; load the working CommonJS build via require().
const { createZGComputeNetworkBroker } = createRequire(import.meta.url)(
  '@0gfoundation/0g-compute-ts-sdk',
) as typeof import('@0gfoundation/0g-compute-ts-sdk')

const RPC = process.env.ZG_EVM_RPC || 'https://evmrpc-testnet.0g.ai'
const CHAIN = Number(process.env.ZG_CHAIN_ID || '16602')
// The funded TeeML provider (model qwen/qwen2.5-omni-7b). Override via env if 0G rotates.
const PROVIDER = process.env.ZG_COMPUTE_PROVIDER_ADDR || '0xa48f01287233509FD694a22Bf840225062E67836'

type Broker = Awaited<ReturnType<typeof createZGComputeNetworkBroker>>
// Module-scoped cache: Vercel keeps the container warm, so the broker is set up once and
// reused across requests (the first/cold call is slow; warm calls are fast).
let cached: { broker: Broker; endpoint: string; model: string } | null = null

async function ready(): Promise<{ broker: Broker; endpoint: string; model: string }> {
  if (cached) return cached
  const wallet = new Wallet(process.env.ZG_PRIVATE_KEY as string, new JsonRpcProvider(RPC, CHAIN))
  const broker = await createZGComputeNetworkBroker(wallet)
  try {
    await broker.inference.acknowledgeProviderSigner(PROVIDER)
  } catch {
    /* already acknowledged on the funded wallet */
  }
  const { endpoint, model } = await broker.inference.getServiceMetadata(PROVIDER)
  cached = { broker, endpoint, model }
  return cached
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!process.env.ZG_PRIVATE_KEY) return res.status(503).json({ error: 'Compute not configured (set ZG_PRIVATE_KEY).' })
  try {
    const sig = String(req.headers['x-iworld-auth'] ?? '')
    const day = new Date().toISOString().slice(0, 10)
    try {
      verifyMessage(`iWORLD compute access\nDay: ${day}`, sig)
    } catch {
      return res.status(401).json({ error: 'Invalid auth signature.' })
    }
    const { broker, endpoint, model } = await ready()
    const headers = (await broker.inference.getRequestHeaders(PROVIDER)) as unknown as Record<string, string>
    return res.json({ authorization: headers.Authorization ?? headers.authorization, endpoint, model, provider: PROVIDER })
  } catch (e) {
    cached = null // reset so a transient failure doesn't poison the warm cache
    return res.status(500).json({ error: `Couldn't issue a compute token: ${(e as Error).message}` })
  }
}
