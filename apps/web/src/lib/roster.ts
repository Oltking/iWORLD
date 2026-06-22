/**
 * My Agents — the roster that turns iWORLD from "your one companion" into a world of
 * agents you own and switch between. Stores non-secret pointers per agent; each agent's
 * memory/knowledge/history is keyed by its agentId (see agentIdOf in session).
 *
 * Legacy/first agent uses the wallet address as its id (so existing memory stays put);
 * additional agents get a fresh id.
 */
import type { ActiveCompanion } from './session'

export interface RosterAgent extends ActiveCompanion {
  createdAt: string
}

const key = (owner: string) => `iworld.roster.${owner.toLowerCase()}`

export function getRoster(owner: string): RosterAgent[] {
  try {
    const list = JSON.parse(localStorage.getItem(key(owner)) || '[]') as RosterAgent[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function genAgentId(): string {
  return 'a_' + Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-5)
}

function indexOfAgent(list: RosterAgent[], a: ActiveCompanion): number {
  return list.findIndex(
    (x) => (a.agentId && x.agentId === a.agentId) || (!!a.tokenId && x.tokenId === a.tokenId),
  )
}

/** Insert or update an agent (matched by agentId, or tokenId for minted). */
export function upsertAgent(owner: string, agent: ActiveCompanion): void {
  const list = getRoster(owner)
  const i = indexOfAgent(list, agent)
  const entry: RosterAgent = { ...agent, createdAt: i >= 0 ? list[i].createdAt : new Date().toISOString() }
  if (i >= 0) list[i] = entry
  else list.push(entry)
  try {
    localStorage.setItem(key(owner), JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

export function removeAgent(owner: string, agent: ActiveCompanion): void {
  const list = getRoster(owner)
  const i = indexOfAgent(list, agent)
  if (i < 0) return
  list.splice(i, 1)
  try {
    localStorage.setItem(key(owner), JSON.stringify(list))
  } catch {
    /* ignore */
  }
}
