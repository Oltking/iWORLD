/**
 * Phase 2 — mint the agent as an on-chain token (AgentNFT, ERC-7857-shaped).
 *
 * Commits the agent's personality version (the dataHash @kipr/core already computes)
 * + its 0G brain rootHash to a token the user owns. Active only once the AgentNFT
 * contract is deployed and its address is set in VITE_AGENT_NFT_ADDRESS — until then
 * the UI shows it as a gated next step (no faked ownership).
 */
import { Contract, type JsonRpcSigner } from 'ethers'

const ADDRESS = (import.meta.env.VITE_AGENT_NFT_ADDRESS as string | undefined) || ''

const ABI = [
  'function mint(tuple(string dataDescription, bytes32 dataHash)[] iDatas, string rootHash, address to) payable returns (uint256)',
  'function mintFee() view returns (uint256)',
  'function primaryDataHash(uint256 tokenId) view returns (bytes32)',
  'event AgentMinted(uint256 indexed tokenId, address indexed to, bytes32 dataHash, string rootHash)',
]

export const agentNftConfigured = (): boolean => /^0x[0-9a-fA-F]{40}$/.test(ADDRESS)

export interface MintResult {
  tokenId: string
  txHash: string
}

/** Mint the agent token committing to its version hash + 0G brain rootHash. */
export async function mintAgent(
  signer: JsonRpcSigner,
  opts: { dataDescription: string; dataHash: string; rootHash: string; to: string },
): Promise<MintResult> {
  if (!agentNftConfigured()) throw new Error('AgentNFT contract is not deployed yet.')
  const c = new Contract(ADDRESS, ABI, signer)
  const fee: bigint = await c.mintFee!().catch(() => 0n)
  const tx = await c.mint!(
    [{ dataDescription: opts.dataDescription, dataHash: opts.dataHash }],
    opts.rootHash,
    opts.to,
    { value: fee },
  )
  const receipt = await tx.wait()

  // Pull the tokenId from the AgentMinted event.
  let tokenId = ''
  for (const log of receipt?.logs ?? []) {
    try {
      const parsed = c.interface.parseLog(log)
      if (parsed?.name === 'AgentMinted') {
        tokenId = parsed.args.tokenId.toString()
        break
      }
    } catch {
      /* not our event */
    }
  }
  return { tokenId, txHash: tx.hash }
}
