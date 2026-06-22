/**
 * Vercel serverless storage fetch — downloads bytes from 0G by rootHash (Node can reach
 * the HTTP storage nodes; the browser can't on HTTPS). Returns base64; the browser
 * decrypts with the user's key. Public read — no auth needed.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Indexer } from '@0gfoundation/0g-storage-ts-sdk'

const INDEXER = 'https://indexer-storage-testnet-turbo.0g.ai'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const rootHash = String(req.query.rootHash ?? '')
    if (!rootHash) return res.status(400).json({ error: 'Missing rootHash.' })
    const indexer = new Indexer(INDEXER)
    const [blob, err] = await indexer.downloadToBlob(rootHash, { proof: true })
    if (err || !blob) return res.status(500).json({ error: String((err as { message?: string })?.message ?? 'download failed') })
    const buf = Buffer.from(await blob.arrayBuffer())
    return res.json({ data: buf.toString('base64') })
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message })
  }
}
