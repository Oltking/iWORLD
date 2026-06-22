/**
 * Public listing cards — the marketplace shop-window. A seller opts to reveal a small
 * PUBLIC (unencrypted) card (name, blurb, level) stored on 0G, pointed to on-chain via
 * AgentMeta. The agent's private brain stays encrypted; this is only what the seller
 * chooses to show buyers so listings aren't anonymous "Agent #7".
 */
import { Contract, type JsonRpcSigner, type Provider } from 'ethers'
import { uploadBytes, downloadBytes } from './storage'

const META = (import.meta.env.VITE_AGENT_META_ADDRESS as string | undefined) || ''
const ABI = [
  'function setCard(uint256 tokenId, string rootHash)',
  'function cardOf(uint256 tokenId) view returns (string)',
]

export const metaConfigured = (): boolean => /^0x[0-9a-fA-F]{40}$/.test(META)

export interface AgentCard {
  name: string
  blurb: string
  level: number
}

export async function publishCard(signer: JsonRpcSigner, tokenId: string, card: AgentCard): Promise<void> {
  const { rootHash } = await uploadBytes(signer, new TextEncoder().encode(JSON.stringify(card)))
  const c = new Contract(META, ABI, signer)
  const tx = await c.setCard!(tokenId, rootHash)
  await tx.wait()
}

export async function fetchCard(provider: Provider, tokenId: string): Promise<AgentCard | null> {
  try {
    const c = new Contract(META, ABI, provider)
    const root: string = await c.cardOf!(tokenId)
    if (!root) return null
    const bytes = await downloadBytes(root)
    const card = JSON.parse(new TextDecoder().decode(bytes)) as AgentCard
    return card && typeof card.name === 'string' ? card : null
  } catch {
    return null
  }
}
