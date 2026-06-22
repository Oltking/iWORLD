/**
 * On-chain anchoring for Grand Arena matches. The duel is deterministic and produces a
 * keccak transcript hash; committing it here makes a result tamper-proof and public —
 * your wins live on-chain, replayable by anyone. Play-money only (no wagering).
 */
import { Contract, keccak256, toUtf8Bytes, type JsonRpcSigner, type Provider } from 'ethers'

const ADDR = (import.meta.env.VITE_ARENA_LOG_ADDRESS as string | undefined) || ''
const ABI = [
  'function logMatch(bytes32 opponentId, bytes32 transcriptHash, uint8 result)',
  'function matchCount(address) view returns (uint256)',
  'function wins(address) view returns (uint256)',
  'event MatchLogged(address indexed player, bytes32 indexed opponentId, bytes32 transcriptHash, uint8 result, uint64 timestamp)',
]

export const arenaLogConfigured = (): boolean => /^0x[0-9a-fA-F]{40}$/.test(ADDR)

export interface RankRow {
  addr: string
  wins: number
  matches: number
}

/** Global Hall of Fame, aggregated from every anchored match (arena + debate). */
export async function fetchLeaderboard(provider: Provider): Promise<RankRow[]> {
  const c = new Contract(ADDR, ABI, provider)
  let events
  try {
    events = await c.queryFilter!(c.filters!.MatchLogged!())
  } catch {
    const latest = await provider.getBlockNumber()
    events = await c.queryFilter!(c.filters!.MatchLogged!(), Math.max(0, latest - 9000), latest)
  }
  const tally = new Map<string, { wins: number; matches: number }>()
  for (const ev of events) {
    const args = (ev as unknown as { args?: { player: string; result: bigint } }).args
    if (!args) continue
    const addr = args.player.toLowerCase()
    const t = tally.get(addr) ?? { wins: 0, matches: 0 }
    t.matches += 1
    if (Number(args.result) === 1) t.wins += 1
    tally.set(addr, t)
  }
  return [...tally.entries()]
    .map(([addr, v]) => ({ addr, ...v }))
    .sort((a, b) => b.wins - a.wins || b.matches - a.matches)
    .slice(0, 20)
}

export type MatchResult = 0 | 1 | 2 // loss | win | draw

export async function anchorMatch(
  signer: JsonRpcSigner,
  opponentName: string,
  transcriptHash: string,
  result: MatchResult,
): Promise<string> {
  const c = new Contract(ADDR, ABI, signer)
  const tx = await c.logMatch!(keccak256(toUtf8Bytes(opponentName)), transcriptHash, result)
  await tx.wait()
  return tx.hash
}

export async function getRecord(provider: Provider, player: string): Promise<{ matches: number; wins: number }> {
  const c = new Contract(ADDR, ABI, provider)
  const [m, w] = await Promise.all([c.matchCount!(player), c.wins!(player)])
  return { matches: Number(m), wins: Number(w) }
}
