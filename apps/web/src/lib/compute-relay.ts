/**
 * Shared TEE chat via the compute relay (approach C). When a user hasn't funded their
 * own 0G Compute ledger, they chat through one shared house ledger — but PRIVATELY:
 * the relay only mints a content-free billing token; the message itself goes from the
 * browser straight to the TeeML provider. The relay never sees a word.
 */
import type { JsonRpcSigner } from 'ethers'
import { relayAuthSig } from './relay-auth'
import type { ChatMessage, ChatResult } from './compute'

const RELAY = (import.meta.env.VITE_COMPUTE_RELAY_URL as string | undefined) || ''
export const relayConfigured = (): boolean => !!RELAY

interface RelayToken {
  authorization: string
  endpoint: string
  model: string
  provider: string
}
// The 0G session token is reusable for a while, so cache it to avoid hitting the relay
// (a serverless function with a cold start) on every single message.
let cachedToken: { token: RelayToken; at: number } | null = null
const TOKEN_TTL = 4 * 60_000

async function getToken(signer: JsonRpcSigner, force = false): Promise<RelayToken> {
  if (!force && cachedToken && Date.now() - cachedToken.at < TOKEN_TTL) return cachedToken.token
  const sig = await relayAuthSig(signer)
  const tr = await fetch(`${RELAY}/token`, { method: 'POST', headers: { 'x-iworld-auth': sig } })
  const td = (await tr.json().catch(() => ({}))) as Partial<RelayToken> & { error?: string }
  if (!tr.ok) throw new Error(td?.error || `Relay token failed (HTTP ${tr.status}).`)
  if (!td.authorization || !td.endpoint || !td.model || !td.provider) throw new Error('Relay returned an incomplete token.')
  const token = td as RelayToken
  cachedToken = { token, at: Date.now() }
  return token
}

/** Run one chat completion through the shared pool. Browser → provider direct (private). */
export async function relayChat(signer: JsonRpcSigner, messages: ChatMessage[]): Promise<ChatResult> {
  let { authorization, endpoint, model, provider } = await getToken(signer)

  let r = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authorization },
    body: JSON.stringify({ model, messages }),
  })
  // A stale cached token → mint a fresh one once and retry.
  if (r.status === 401 || r.status === 403) {
    ;({ authorization, endpoint, model, provider } = await getToken(signer, true))
    r = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authorization },
      body: JSON.stringify({ model, messages }),
    })
  }
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
