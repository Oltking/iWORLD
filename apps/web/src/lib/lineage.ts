/** Local lineage record — who a bred agent came from. Shown on the hub. */
export interface Lineage {
  parentA: string
  parentB: string
  bornAt: string
}

const key = (agentId: string) => `iworld.lineage.${agentId}`

export function setLineage(agentId: string, l: Lineage): void {
  try {
    localStorage.setItem(key(agentId), JSON.stringify(l))
  } catch {
    /* ignore */
  }
}

export function getLineage(agentId: string): Lineage | null {
  try {
    const raw = localStorage.getItem(key(agentId))
    return raw ? (JSON.parse(raw) as Lineage) : null
  } catch {
    return null
  }
}
