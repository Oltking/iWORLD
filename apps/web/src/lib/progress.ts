/**
 * Agent XP + level (play-money progression). Local, derivable — the source of truth
 * for "real, ownable" progression would be on-chain results later; this is the cache
 * that makes leveling felt now. Per agent owner.
 */
const key = (ownerAddr: string) => `kipr.xp.${ownerAddr.toLowerCase()}`

export function getXP(ownerAddr: string): number {
  try {
    return Number(localStorage.getItem(key(ownerAddr)) || '0') || 0
  } catch {
    return 0
  }
}

export function addXP(ownerAddr: string, amount: number): number {
  const next = getXP(ownerAddr) + Math.max(0, Math.floor(amount))
  try {
    localStorage.setItem(key(ownerAddr), String(next))
  } catch {
    /* ignore */
  }
  return next
}

/** Simple curve: 100 XP per level. */
export function levelFromXP(xp: number): number {
  return 1 + Math.floor(xp / 100)
}

/** Progress (0..1) toward the next level. */
export function levelProgress(xp: number): number {
  return (xp % 100) / 100
}
