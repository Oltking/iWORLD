/**
 * Vercel serverless storage relay — uploads already-encrypted bytes to 0G from Node, so
 * an HTTPS page isn't blocked by 0G's HTTP storage nodes (the "network error" on create).
 * Same-origin, so no CORS and no separate hosting. The house wallet (ZG_PRIVATE_KEY) pays
 * the tiny gas and only ever sees ciphertext.
 *
 * Set on Vercel: ZG_PRIVATE_KEY (secret) + VITE_STORAGE_RELAY_URL=/api
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Wallet, JsonRpcProvider, verifyMessage } from 'ethers'
import { Indexer, MemData } from '@0gfoundation/0g-storage-ts-sdk'

const RPC = process.env.ZG_EVM_RPC || 'https://evmrpc-testnet.0g.ai'
const CHAIN = Number(process.env.ZG_CHAIN_ID || '16602')
const INDEXER = 'https://indexer-storage-testnet-turbo.0g.ai'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const key = process.env.ZG_PRIVATE_KEY
  if (!key) return res.status(503).json({ error: 'Storage not configured (set ZG_PRIVATE_KEY on the server).' })
  try {
    const sig = String(req.headers['x-iworld-auth'] ?? '')
    const day = new Date().toISOString().slice(0, 10)
    try {
      verifyMessage(`iWORLD compute access\nDay: ${day}`, sig)
    } catch {
      return res.status(401).json({ error: 'Invalid auth signature.' })
    }

    const data = (req.body as { data?: string })?.data
    if (!data) return res.status(400).json({ error: 'Missing data.' })
    const bytes = new Uint8Array(Buffer.from(data, 'base64'))

    const wallet = new Wallet(key, new JsonRpcProvider(RPC, CHAIN))
    const indexer = new Indexer(INDEXER)
    const mem = new MemData(bytes)
    const [, treeErr] = await mem.merkleTree()
    if (treeErr) return res.status(500).json({ error: 'merkleTree failed' })

    // finalityRequired:false → return as soon as it's submitted (fast, fits the function
    // timeout); the data finalizes in the background before the user reads it back.
    const [up, upErr] = await indexer.upload(mem, RPC, wallet, { finalityRequired: false } as never)
    if (upErr) return res.status(500).json({ error: String((upErr as { message?: string })?.message ?? upErr) })
    const rootHash = 'rootHashes' in up ? up.rootHashes[0] : up.rootHash
    const txHash = 'rootHashes' in up ? up.txHashes[0] : up.txHash
    return res.json({ rootHash, txHash })
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message })
  }
}
