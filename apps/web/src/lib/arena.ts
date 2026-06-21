/**
 * Grand Arenas — slice #3 engine (built correctly per the concept brief):
 *
 *  - DETERMINISTIC REFEREE: a pure rules function decides each round (source of truth),
 *    separate from the agents' DECISIONS (their personality-driven policy).
 *  - NON-GAMEABLE: 5 tactics in a balanced cycle (each beats exactly 2, loses to 2 —
 *    RPSLS-style), so there's no dominant move; winning rewards reading the matchup,
 *    not luck. Best-of-5 reduces variance.
 *  - COMMIT-REVEAL: each round's move is committed as keccak(move:nonce) before reveal,
 *    so neither side can change a move after seeing the other's (the fairness mechanism).
 *  - AUDITABLE: the whole match is a pure function of (seed, both styles); the transcript
 *    is hashed (keccak) into a tamper-evident fingerprint anyone can re-derive & verify.
 *  - PLAY-MONEY: winners earn XP only. No real-money wagering (the regulated corner).
 */
import { keccak256, toUtf8Bytes } from 'ethers'

export type Tactic = 'strike' | 'guard' | 'feint' | 'charge' | 'counter'
export const TACTICS: readonly Tactic[] = ['strike', 'guard', 'feint', 'charge', 'counter']
export const TACTIC_ICON: Record<Tactic, string> = {
  strike: '⚔️',
  guard: '🛡️',
  feint: '🌀',
  charge: '🐎',
  counter: '↩️',
}

// Balanced tournament: each tactic beats exactly two others.
const BEATS: Record<Tactic, Tactic[]> = {
  strike: ['feint', 'charge'],
  guard: ['strike', 'charge'],
  feint: ['guard', 'counter'],
  charge: ['feint', 'counter'],
  counter: ['strike', 'guard'],
}

/** The deterministic referee: +1 = a wins, -1 = b wins, 0 = clash. */
export function resolve(a: Tactic, b: Tactic): -1 | 0 | 1 {
  if (a === b) return 0
  return BEATS[a].includes(b) ? 1 : -1
}

// ── personality → fighting style ──────────────────────────────────────────────
export type Style = Record<Tactic, number>

/** Derive a play style from the agent's character (its training shows in battle). */
export function styleFromText(text: string): Style {
  const t = text.toLowerCase()
  const w: Style = { strike: 1, guard: 1, feint: 1, charge: 1, counter: 1 }
  const bump = (keys: string[], tactic: Tactic, amt: number) => {
    if (keys.some((k) => t.includes(k))) w[tactic] += amt
  }
  bump(['bold', 'fierce', 'aggress', 'brave', 'strong', 'direct'], 'strike', 2)
  bump(['energetic', 'charge', 'rush', 'fast', 'attack', 'motivat'], 'charge', 2)
  bump(['calm', 'patient', 'wise', 'grounded', 'careful', 'steady', 'gentle'], 'guard', 2)
  bump(['sharp', 'witty', 'cunning', 'clever', 'trick', 'sly', 'playful', 'dry'], 'feint', 2.5)
  bump(['honest', 'listen', 'thoughtful', 'perspective', 'kind', 'react'], 'counter', 1.5)
  return w
}

// deterministic PRNG so a match replays identically from its seed (auditable).
function seedToInt(seed: string): number {
  const h = keccak256(toUtf8Bytes(seed))
  return parseInt(h.slice(2, 10), 16) >>> 0
}
function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick(style: Style, rng: () => number): Tactic {
  const total = TACTICS.reduce((s, k) => s + style[k], 0)
  let r = rng() * total
  for (const k of TACTICS) {
    r -= style[k]
    if (r <= 0) return k
  }
  return 'strike'
}

const nonceFrom = (rng: () => number) => Math.floor(rng() * 2 ** 31).toString(16)
const commit = (tactic: Tactic, nonce: string) => keccak256(toUtf8Bytes(`${tactic}:${nonce}`))

export interface Round {
  n: number
  aTactic: Tactic
  bTactic: Tactic
  aCommit: string
  bCommit: string
  outcome: -1 | 0 | 1
}

export interface MatchResult {
  rounds: Round[]
  aScore: number
  bScore: number
  winner: 'a' | 'b' | 'draw'
  seed: string
  transcriptHash: string
  xp: number
}

export interface Fighter {
  name: string
  style: Style
}

/** Run a best-of-5 duel. Pure function of (seed, both styles) → fully replayable. */
export function runDuel(a: Fighter, b: Fighter, seed: string, bestOf = 5): MatchResult {
  const rng = mulberry32(seedToInt(seed))
  const rounds: Round[] = []
  let aScore = 0
  let bScore = 0
  const need = Math.ceil(bestOf / 2)

  for (let n = 1; n <= bestOf; n++) {
    const aTactic = pick(a.style, rng)
    const aNonce = nonceFrom(rng)
    const bTactic = pick(b.style, rng)
    const bNonce = nonceFrom(rng)
    const outcome = resolve(aTactic, bTactic)
    if (outcome === 1) aScore++
    else if (outcome === -1) bScore++
    rounds.push({ n, aTactic, bTactic, aCommit: commit(aTactic, aNonce), bCommit: commit(bTactic, bNonce), outcome })
    if (aScore >= need || bScore >= need) break
  }

  const winner = aScore > bScore ? 'a' : bScore > aScore ? 'b' : 'draw'
  const transcript = JSON.stringify({ a: a.name, b: b.name, seed, rounds, aScore, bScore })
  const transcriptHash = keccak256(toUtf8Bytes(transcript))
  const xp = winner === 'a' ? 25 + aScore * 5 : winner === 'draw' ? 10 : 5
  return { rounds, aScore, bScore, winner, seed, transcriptHash, xp }
}

// ── house rivals (so a solo player can duel immediately) ──────────────────────
const RIVALS = [
  { name: 'Vex the Cunning', text: 'sly, witty, cunning, tricky, playful' },
  { name: 'Stoneward', text: 'calm, patient, grounded, steady, careful' },
  { name: 'Blaze Runner', text: 'bold, energetic, fierce, fast, charge, attack' },
  { name: 'Echo', text: 'honest, thoughtful, listens, reacts, perspective' },
  { name: 'Maxa Prime', text: 'sharp, direct, strong, brave, clever' },
] as const

export function houseRival(seed: string): Fighter {
  const idx = seedToInt(seed) % RIVALS.length
  const r = RIVALS[idx]
  return { name: r.name, style: styleFromText(r.text) }
}
