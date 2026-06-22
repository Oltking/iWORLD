/**
 * Shared relay auth — a once-a-day wallet signature that proves who you are to the
 * compute + storage relays (no per-request popup). Must match the server's
 * relayAuthMessage().
 */
import type { JsonRpcSigner } from 'ethers'

const utcDay = () => new Date().toISOString().slice(0, 10)
const authMessage = (day: string) => `iWORLD compute access\nDay: ${day}`

let cached: { day: string; sig: string } | null = null

export async function relayAuthSig(signer: JsonRpcSigner): Promise<string> {
  const day = utcDay()
  if (cached?.day === day) return cached.sig
  const sig = await signer.signMessage(authMessage(day))
  cached = { day, sig }
  return sig
}

/** base64 ⇄ bytes, chunked so large blobs don't overflow the call stack. */
export function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
