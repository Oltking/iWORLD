/**
 * The agent's owned KNOWLEDGE — what you teach it in the Training Grounds. Durable
 * facts ("my dog is Biscuit") and behavioural feedback ("be warmer"), encrypted
 * client-side and stored on 0G as an append-only chain, separate from the chat log.
 *
 * This is how an iWORLD agent "grows" without a retrain (master plan Q9): knowledge
 * accumulates on 0G and is injected into the agent's context at inference time, so it
 * genuinely knows what you taught it. Owned + recoverable from head + key alone.
 */
import type { JsonRpcSigner } from 'ethers'
import { encryptOwned, decryptOwned } from './crypto'
import { uploadBytes, downloadBytes } from './storage'

export type KnowledgeKind = 'fact' | 'feedback'

export interface KnowledgeItem {
  text: string
  kind: KnowledgeKind
  createdAt: string
}

interface KnowledgeSnapshot {
  schemaVersion: 1
  companion: string
  prev: string | null
  items: KnowledgeItem[]
  updatedAt: string
}

export interface KnowledgeRef {
  head: string
  txHash: string
  added: number
}

export const knowledgeHeadKey = (ownerAddr: string) => `kipr.know.head.${ownerAddr}`

const encode = (s: KnowledgeSnapshot): Uint8Array => new TextEncoder().encode(JSON.stringify(s))

function decode(bytes: Uint8Array, rootHash: string): KnowledgeSnapshot {
  let s: KnowledgeSnapshot
  try {
    s = JSON.parse(new TextDecoder().decode(bytes)) as KnowledgeSnapshot
  } catch {
    throw new Error(`Knowledge snapshot at ${rootHash} did not decrypt to JSON — wrong key or corrupt.`)
  }
  if (s?.schemaVersion !== 1 || !Array.isArray(s.items)) {
    throw new Error(`Invalid knowledge snapshot at ${rootHash}.`)
  }
  return s
}

/** Append taught items, encrypted, as one new snapshot. Returns the new head. */
export async function appendKnowledge(
  signer: JsonRpcSigner,
  key: CryptoKey,
  opts: { companion: string; head: string | null; items: KnowledgeItem[] },
): Promise<KnowledgeRef> {
  if (opts.items.length === 0) throw new Error('Nothing to teach.')
  const snapshot: KnowledgeSnapshot = {
    schemaVersion: 1,
    companion: opts.companion,
    prev: opts.head,
    items: opts.items,
    updatedAt: new Date().toISOString(),
  }
  const encrypted = await encryptOwned(key, encode(snapshot))
  const { rootHash, txHash } = await uploadBytes(signer, encrypted)
  return { head: rootHash, txHash, added: opts.items.length }
}

/** Rebuild all taught knowledge from the head rootHash + key alone (oldest-first). */
export async function loadKnowledge(key: CryptoKey, head: string): Promise<KnowledgeItem[]> {
  const chain: KnowledgeSnapshot[] = []
  const seen = new Set<string>()
  let cursor: string | null = head
  while (cursor) {
    if (seen.has(cursor)) throw new Error(`Cycle detected in knowledge chain at ${cursor}.`)
    seen.add(cursor)
    const bytes = await decryptOwned(key, await downloadBytes(cursor))
    const snap = decode(bytes, cursor)
    chain.push(snap)
    cursor = snap.prev
  }
  return chain.reverse().flatMap((s) => s.items)
}

/** Build the context block injected into the agent's system prompt at inference time. */
export function knowledgePromptBlock(items: KnowledgeItem[]): string {
  const facts = items.filter((i) => i.kind === 'fact').map((i) => i.text)
  const feedback = items.filter((i) => i.kind === 'feedback').map((i) => i.text)
  let out = ''
  if (facts.length) out += `\n\nWhat you know about your person (remember and use these):\n- ${facts.join('\n- ')}`
  if (feedback.length) out += `\n\nHow they want you to be:\n- ${feedback.join('\n- ')}`
  return out
}
