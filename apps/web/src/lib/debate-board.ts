/**
 * Async agent-vs-agent debates between two real owners, via DebateBoard. A challenger
 * posts a motion + their agent's opening (public on 0G); anyone can accept, rebut, judge,
 * and record the result. The opening/transcript are public (not encrypted) so anyone can
 * re-run the judge to verify.
 */
import { Contract, type JsonRpcSigner, type Provider, type EventLog } from 'ethers'
import { uploadBytes, downloadBytes } from './storage'

const ADDR = (import.meta.env.VITE_DEBATE_BOARD_ADDRESS as string | undefined) || ''
const ABI = [
  'function post(string motion, string openingRoot) returns (uint256)',
  'function resolve(uint256 id, address winner, string transcriptRoot)',
  'function count() view returns (uint256)',
  'function challenges(uint256) view returns (address challenger, string motion, string openingRoot, bool resolved, address acceptor, address winner, string transcriptRoot)',
  'event Posted(uint256 indexed id, address indexed challenger, string motion)',
]

export const debateBoardConfigured = (): boolean => /^0x[0-9a-fA-F]{40}$/.test(ADDR)

export interface OpenChallenge {
  id: number
  challenger: string
  motion: string
  openingRoot: string
}

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (b: Uint8Array) => new TextDecoder().decode(b)

/** Post a challenge: store the opening (public) on 0G, then record it on-chain. */
export async function postChallenge(signer: JsonRpcSigner, motion: string, openingText: string): Promise<number> {
  const { rootHash } = await uploadBytes(signer, enc(openingText))
  const c = new Contract(ADDR, ABI, signer)
  const tx = await c.post!(motion, rootHash)
  const receipt = await tx.wait()
  for (const log of receipt?.logs ?? []) {
    try {
      const parsed = c.interface.parseLog(log)
      if (parsed?.name === 'Posted') return Number(parsed.args.id)
    } catch {
      /* not ours */
    }
  }
  return Number(await c.count!()) - 1
}

export async function getOpeningText(rootHash: string): Promise<string> {
  return dec(await downloadBytes(rootHash))
}

/** Accept + record: store the transcript (public), set the winner on-chain. */
export async function resolveChallenge(
  signer: JsonRpcSigner,
  id: number,
  winner: string,
  transcriptText: string,
): Promise<void> {
  const { rootHash } = await uploadBytes(signer, enc(transcriptText))
  const c = new Contract(ADDR, ABI, signer)
  const tx = await c.resolve!(id, winner, rootHash)
  await tx.wait()
}

/** Open challenges not posted by me, newest first. */
export async function fetchOpenChallenges(provider: Provider, me: string): Promise<OpenChallenge[]> {
  const c = new Contract(ADDR, ABI, provider)
  let events: EventLog[]
  try {
    events = (await c.queryFilter!(c.filters!.Posted!())) as EventLog[]
  } catch {
    const latest = await provider.getBlockNumber()
    events = (await c.queryFilter!(c.filters!.Posted!(), Math.max(0, latest - 9000), latest)) as EventLog[]
  }
  const out: OpenChallenge[] = []
  for (const e of [...events].reverse()) {
    const args = e.args as unknown as { id: bigint; challenger: string; motion: string }
    if (args.challenger.toLowerCase() === me.toLowerCase()) continue
    const ch = await c.challenges!(args.id)
    if (ch.resolved) continue
    out.push({ id: Number(args.id), challenger: args.challenger, motion: args.motion, openingRoot: ch.openingRoot as string })
    if (out.length >= 15) break
  }
  return out
}
