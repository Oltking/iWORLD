/**
 * Loot — rewards earned from Arena wins. Items tune your agent's fighting style and
 * speed its growth ("gear snaps on and makes it stronger"). Owned items apply
 * passively. NON-TRADEABLE and play-money by design — the reward loop without the
 * regulated marketplace (slice #4 stays gated on legal clearance).
 */
import type { Tactic } from './arena'

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'
export type Boost = Partial<Record<Tactic, number>>

export interface Item {
  id: string
  name: string
  icon: string
  rarity: Rarity
  boost: Boost
  /** Fractional bonus added to match XP just by owning it. */
  xpBonus: number
  flavor: string
}

export const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary']
const RARITY_XP: Record<Rarity, number> = { common: 0.02, rare: 0.05, epic: 0.1, legendary: 0.2 }

const item = (id: string, name: string, icon: string, rarity: Rarity, boost: Boost, flavor: string): Item => ({
  id, name, icon, rarity, boost, xpBonus: RARITY_XP[rarity], flavor,
})

export const CATALOG: Item[] = [
  item('boots', 'Swift Boots', '👢', 'common', { charge: 2 }, 'Strike first, strike fast.'),
  item('rune', 'Guard Rune', '🪬', 'common', { guard: 2 }, 'Weather any storm.'),
  item('blade', 'Fine Blade', '🗡️', 'rare', { strike: 3 }, 'Forged for the bold.'),
  item('coin', "Trickster's Coin", '🪙', 'rare', { feint: 3 }, 'Heads they lose, tails they lose.'),
  item('mirror', 'Mirror Shard', '🔮', 'rare', { counter: 3 }, 'Their move becomes yours.'),
  item('crystal', 'Wisdom Crystal', '💎', 'epic', { feint: 2, counter: 2 }, 'See the move before it is made.'),
  item('banner', 'War Banner', '🚩', 'epic', { strike: 2, charge: 2 }, 'Forward, always forward.'),
  item('aegis', 'The Aegis', '🛡️', 'epic', { guard: 3, counter: 1 }, 'Unbroken, unbreakable.'),
  item('jetpack', 'Jetpack', '🚀', 'legendary', { charge: 4 }, 'Gravity is a suggestion.'),
  item('phoenix', 'Phoenix Feather', '🪶', 'legendary', { strike: 1, guard: 1, feint: 1, charge: 1, counter: 1 }, 'Rise, every time.'),
]

const byId = new Map(CATALOG.map((i) => [i.id, i]))
export const getItem = (id: string) => byId.get(id)

// ── inventory (local, per owner; unique items) ────────────────────────────────
const key = (owner: string) => `kipr.items.${owner.toLowerCase()}`

export function getItems(owner: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(key(owner)) || '[]') as string[]
  } catch {
    return []
  }
}

/** Add an item. Returns 'new' if newly owned, 'dup' if already owned. */
export function addItem(owner: string, id: string): 'new' | 'dup' {
  const owned = getItems(owner)
  if (owned.includes(id)) return 'dup'
  owned.push(id)
  try {
    localStorage.setItem(key(owner), JSON.stringify(owned))
  } catch {
    /* ignore */
  }
  return 'new'
}

export function ownedItems(owner: string): Item[] {
  return getItems(owner)
    .map((id) => byId.get(id))
    .filter((x): x is Item => !!x)
}

/** Summed style boost from all owned items. */
export function ownedStyleBoost(owner: string): Boost {
  const b: Boost = {}
  for (const it of ownedItems(owner)) {
    for (const k of Object.keys(it.boost) as Tactic[]) b[k] = (b[k] ?? 0) + (it.boost[k] ?? 0)
  }
  return b
}

/** Summed XP bonus from owned items, capped so it can't run away. */
export function ownedXpBonus(owner: string): number {
  return Math.min(0.6, ownedItems(owner).reduce((s, i) => s + i.xpBonus, 0))
}

/** Roll a drop after a win — chance + quality scale with the champion's level. */
export function rollDrop(championLevel: number): Item | null {
  if (Math.random() > 0.4 + Math.min(0.45, championLevel * 0.03)) return null
  // rarity weights shift toward better loot vs stronger foes
  const lvl = championLevel
  const weights: Record<Rarity, number> = {
    common: 60,
    rare: 25 + lvl,
    epic: 8 + lvl * 0.8,
    legendary: 1 + lvl * 0.4,
  }
  const total = RARITY_ORDER.reduce((s, r) => s + weights[r], 0)
  let roll = Math.random() * total
  let chosen: Rarity = 'common'
  for (const r of RARITY_ORDER) {
    roll -= weights[r]
    if (roll <= 0) {
      chosen = r
      break
    }
  }
  const pool = CATALOG.filter((i) => i.rarity === chosen)
  return pool[Math.floor(Math.random() * pool.length)] ?? null
}
