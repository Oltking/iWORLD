/**
 * Per-agent track record — every duel and debate an agent has fought, so each agent
 * carries a visible story (the bred champion you trained has a history). Local + keyed
 * by agentId; the on-chain anchor (ArenaLog) is the public, provable counterpart.
 */
export interface MatchRecord {
  kind: 'duel' | 'debate'
  opponent: string
  result: 'win' | 'loss' | 'tie'
  detail: string
  at: string
  hash: string
}

const key = (agentId: string) => `iworld.record.${agentId}`

export function addResult(agentId: string, entry: MatchRecord): void {
  try {
    const list = getResults(agentId)
    list.unshift(entry)
    localStorage.setItem(key(agentId), JSON.stringify(list.slice(0, 50)))
  } catch {
    /* ignore */
  }
}

export function getResults(agentId: string): MatchRecord[] {
  try {
    const list = JSON.parse(localStorage.getItem(key(agentId)) || '[]') as MatchRecord[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export interface Tally {
  w: number
  l: number
  t: number
}
export interface RecordSummary {
  duels: Tally
  debates: Tally
  total: number
}

export function summarize(entries: MatchRecord[]): RecordSummary {
  const blank = (): Tally => ({ w: 0, l: 0, t: 0 })
  const duels = blank()
  const debates = blank()
  for (const e of entries) {
    const t = e.kind === 'duel' ? duels : debates
    if (e.result === 'win') t.w += 1
    else if (e.result === 'loss') t.l += 1
    else t.t += 1
  }
  return { duels, debates, total: entries.length }
}
