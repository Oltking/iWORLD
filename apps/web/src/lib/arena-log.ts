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
]

export const arenaLogConfigured = (): boolean => /^0x[0-9a-fA-F]{40}$/.test(ADDR)

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
