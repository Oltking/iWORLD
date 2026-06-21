/**
 * Active-companion session — lightweight continuity across refreshes.
 *
 * Stores only non-secret pointers (name, version, rootHash, owner) so that after a
 * reload + reconnect the companion comes back and the chat can re-load its memory
 * from 0G with the user's key. No content, no keys — those stay on 0G / in the wallet.
 *
 * Lives here (not in screens/Chat) so it's importable without pulling the lazily-
 * loaded Chat chunk (and the heavy compute SDK) into the initial bundle.
 */
export interface ActiveCompanion {
  ownerAddr: string
  name: string
  modelId: string
  version: string
  personalityRootHash: string
  /** ERC-7857 token id once the agent is minted on-chain (Phase 2). */
  tokenId?: string
}

export const conversationHeadKey = (ownerAddr: string) => `kipr.conv.head.${ownerAddr}`

const SESSION_KEY = 'kipr.session.companion'

export function saveSession(c: ActiveCompanion): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(c))
  } catch {
    /* ignore */
  }
}

export function loadSession(): ActiveCompanion | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as ActiveCompanion
    return c && c.ownerAddr && c.personalityRootHash ? c : null
  } catch {
    return null
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}
