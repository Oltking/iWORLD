/**
 * Shared TEE chat via the compute relay (approach C). When a user hasn't funded their
 * own 0G Compute ledger, they chat through one shared house ledger — but PRIVATELY:
 * the relay only mints a content-free billing token; the message itself goes from the
 * browser straight to the TeeML provider. The relay never sees a word.
 */
import type { JsonRpcSigner } from 'ethers'
import type { ChatMessage, ChatResult } from './compute'

const RELAY = (import.meta.env.VITE_COMPUTE_RELAY_URL as string | undefined) || ''
export const relayConfigured = (): boolean => !!RELAY

// Must match the relay server's relayAuthMessage().
const utcDay = () => new Date().toISOString().slice(0, 10)
const authMessage = (day: string) => `iWORLD compute access\nDay: ${day}`

let cachedSig: { day: string; sig: string } | null = null

/** Sign (once/day, cached — no popup spam) to prove identity to the relay. */
async function authSig(signer: JsonRpcSigner): Promise<string> {
  const day = utcDay()
  if (cachedSig?.day === day) return cachedSig.sig
  const sig = await signer.signMessage(authMessage(day))
  cachedSig = { day, sig }
  return sig
}

/** Run one chat completion through the shared pool. Browser → provider direct (private). */
export async function relayChat(signer: JsonRpcSigner, messages: ChatMessage[]): Promise<ChatResult> {
  const sig = await authSig(signer)
  const tr = await fetch(`${RELAY}/token`, { method: 'POST', headers: { 'x-iworld-auth': sig } })
  const td = (await tr.json().catch(() => ({}))) as {
    authorization?: string
    endpoint?: string
    model?: string
    provider?: string
    error?: string
  }
  if (!tr.ok) throw new Error(td?.error || `Relay token failed (HTTP ${tr.status}).`)
  const { authorization, endpoint, model, provider } = td
  if (!authorization || !endpoint || !model || !provider) throw new Error('Relay returned an incomplete token.')

  const r = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authorization },
    body: JSON.stringify({ model, messages }),
  })
  if (!r.ok) {
    const b = await r.text().catch(() => '')
    throw new Error(`Inference failed: HTTP ${r.status} ${b.slice(0, 150)}`)
  }
  const data: { choices?: { message?: { content?: string } }[]; id?: string } = await r.json()
  const content = data?.choices?.[0]?.message?.content ?? ''
  if (!content) throw new Error('Provider returned an empty response.')
  const chatID = r.headers.get('ZG-Res-Key') || r.headers.get('zg-res-key') || data?.id || null
  // Ran on a real TeeML provider via the shared pool; per-response processResponse
  // verification isn't run client-side here, so we label it honestly (not a fake ✓).
  return { content, model, provider, chatID, teeVerified: null }
}
