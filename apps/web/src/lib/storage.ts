/**
 * Browser ↔ 0G Storage. Uses the same SDK surface as @kipr/og (Indexer + MemData +
 * downloadToBlob) but with the injected-wallet SIGNER. MemData and downloadToBlob
 * are in-memory, so they work in the browser (unlike indexer.download, which needs fs).
 *
 * These move OPAQUE bytes — KIPR encrypts client-side (lib/crypto) BEFORE upload, so
 * 0G only ever sees ciphertext (the SDK's own encryption is unused here; our key is
 * wallet-signature-derived, which ECIES-to-self can't be in the browser).
 */
import type { JsonRpcSigner } from 'ethers'
import { Indexer, MemData } from '@0gfoundation/0g-storage-ts-sdk'
import { OG_TESTNET } from './og'

function makeIndexer(): Indexer {
  return new Indexer(OG_TESTNET.indexerRpc)
}

/** Turn an opaque wallet/RPC submit failure into actionable guidance. */
function explainUploadError(raw: unknown): Error {
  const msg = (raw as { message?: string })?.message ?? String(raw)
  const code = (raw as { code?: number | string })?.code
  const looksLikeRpc =
    code === -32603 ||
    code === 'NETWORK_ERROR' ||
    /endpoint not found or unavailable|RPC submit|could not coalesce|failed to fetch|ECONNREFUSED|network error|could not detect network|noNetwork|missing response/i.test(
      msg,
    )
  if (looksLikeRpc) {
    return new Error(
      `Your wallet couldn't reach the 0G network to submit the transaction — this is a wallet RPC ` +
        `setting, not your funds. Fix it in your wallet: open the “0G-Galileo-Testnet” network and set ` +
        `its RPC URL to ${OG_TESTNET.evmRpc} (remove any others), then retry. (We confirmed 0G itself is up.)`,
    )
  }
  return new Error(`Couldn't save to 0G: ${msg}`)
}

export interface UploadRef {
  rootHash: string
  txHash: string
}

/** Reject a promise if it doesn't settle in `ms` — so a lagging node can't hang forever. */
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `${what} didn't finalize in ${Math.round(ms / 1000)}s — the 0G storage node is likely lagging. ` +
                `Your transaction may already be on-chain; please try again in a moment.`,
            ),
          ),
        ms,
      ),
    ),
  ])
}

/** Upload opaque bytes to 0G. Bytes should already be encrypted for production data. */
export async function uploadBytes(signer: JsonRpcSigner, data: Uint8Array): Promise<UploadRef> {
  // Pre-flight: an empty wallet stalls silently at tx submission — fail clearly instead.
  const addr = await signer.getAddress()
  let balance: bigint
  try {
    balance = await signer.provider.getBalance(addr)
  } catch (e) {
    // Reaching the chain for a balance read failed → it's the wallet's RPC, not the data.
    throw explainUploadError(e)
  }
  if (balance === 0n) {
    throw new Error(
      `This wallet has 0 0G, so it can't pay for storage. Get testnet 0G from https://faucet.0g.ai, then retry.`,
    )
  }

  const indexer = makeIndexer()
  const mem = new MemData(data)
  const [tree, treeErr] = await mem.merkleTree()
  if (treeErr !== null || !tree) throw new Error(`merkleTree failed: ${treeErr ?? 'no tree'}`)

  const [res, upErr] = await withTimeout(
    indexer.upload(mem, OG_TESTNET.evmRpc, signer),
    120_000,
    'Storing on 0G',
  )
  if (upErr !== null) throw explainUploadError(upErr)
  // single result, or fragmented (>4GB) — narrow it.
  const rootHash = 'rootHashes' in res ? res.rootHashes[0] : res.rootHash
  const txHash = 'rootHashes' in res ? res.txHashes[0] : res.txHash
  return { rootHash, txHash }
}

/** Download opaque bytes from 0G by rootHash (in-memory, browser-safe). */
export async function downloadBytes(rootHash: string): Promise<Uint8Array> {
  const indexer = makeIndexer()
  const [blob, dlErr] = await indexer.downloadToBlob(rootHash, { proof: true })
  if (dlErr !== null) throw new Error(`download failed: ${dlErr.message ?? String(dlErr)}`)
  return new Uint8Array(await blob.arrayBuffer())
}

// ── P0 harness: a plaintext round-trip just to prove the pipe ──────────────────
export interface StorageRoundTrip {
  rootHash: string
  txHash: string
  uploadedBytes: number
  downloadedBytes: number
  match: boolean
}

export async function storageRoundTrip(signer: JsonRpcSigner, text: string): Promise<StorageRoundTrip> {
  const data = new TextEncoder().encode(text)
  const { rootHash, txHash } = await uploadBytes(signer, data)
  const downloaded = await downloadBytes(rootHash)
  const match = downloaded.length === data.length && downloaded.every((b, i) => b === data[i])
  return { rootHash, txHash, uploadedBytes: data.length, downloadedBytes: downloaded.length, match }
}
