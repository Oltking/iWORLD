/**
 * Re-keyed brain transfer — the full flow. Hands an agent (brain and all) to another
 * person so they truly own AND can use it. Seller-assisted (no TEE oracle):
 *
 *   register : publish your transfer pubkey so others can hand you agents
 *   send     : seal your agent's brain (personality + knowledge + conversation) to the
 *              recipient's pubkey, store it on 0G, record the handoff, transfer the token
 *   claim    : open the sealed brain with your key, re-encrypt it under YOUR key, and
 *              re-point the on-chain token to it
 *
 * TESTNET. v1 of the canonical ERC-7857 transfer; the fully-offline marketplace version
 * uses a TEE oracle — this achieves the same guarantee today.
 */
import { Contract, type JsonRpcSigner, type Provider } from 'ethers'
import { deriveTransferKey, transferPubKey, sealToRecipient, openSealed } from './transfer-crypto'
import { loadPersonality, persistPersonality } from './companion-store'
import { loadKnowledge, appendKnowledge, knowledgeHeadKey } from './knowledge-store'
import { loadConversation, appendMessages } from './conversation-store'
import { conversationHeadKey, type ActiveCompanion } from './session'
import { uploadBytes, downloadBytes } from './storage'
import { personalityIntelligentData } from '@kipr/core/companion'
import type { PersonalityConfig } from '@kipr/core/personality'
import type { MemoryMessage } from './conversation-store'
import type { KnowledgeItem } from './knowledge-store'

const REGISTRY = (import.meta.env.VITE_TRANSFER_REGISTRY_ADDRESS as string | undefined) || ''
const NFT = (import.meta.env.VITE_AGENT_NFT_ADDRESS as string | undefined) || ''

const REG_ABI = [
  'function setPubKey(bytes pubKey)',
  'function pubKeyOf(address user) view returns (bytes)',
  'function hasPubKey(address user) view returns (bool)',
  'function setHandoff(uint256 tokenId, string sealedRootHash)',
  'function handoffOf(uint256 tokenId) view returns (string)',
]
const NFT_ABI = [
  'function transferFrom(address from, address to, uint256 tokenId)',
  'function update(uint256 tokenId, tuple(string dataDescription, bytes32 dataHash)[] newDatas, string rootHash)',
  'function ownerOf(uint256 tokenId) view returns (address)',
]

export const transferConfigured = (): boolean =>
  /^0x[0-9a-fA-F]{40}$/.test(REGISTRY) && /^0x[0-9a-fA-F]{40}$/.test(NFT)

interface BrainBundle {
  v: 1
  name: string
  modelId: string
  personality: PersonalityConfig
  knowledge: KnowledgeItem[]
  conversation: MemoryMessage[]
}

/** Has this address published a transfer pubkey (can it receive agents)? */
export async function hasTransferKey(provider: Provider, address: string): Promise<boolean> {
  const reg = new Contract(REGISTRY, REG_ABI, provider)
  return reg.hasPubKey!(address)
}

/** One-time: derive + publish your transfer pubkey so others can hand you agents. */
export async function registerToReceive(signer: JsonRpcSigner, address: string): Promise<void> {
  const key = await deriveTransferKey(signer, address)
  const reg = new Contract(REGISTRY, REG_ABI, signer)
  const tx = await reg.setPubKey!(transferPubKey(key))
  await tx.wait()
}

/** Send an agent (brain and all) to a recipient who has registered. */
export async function transferAgent(
  signer: JsonRpcSigner,
  ownerKey: CryptoKey,
  companion: ActiveCompanion,
  recipient: string,
): Promise<{ txHash: string }> {
  if (!companion.tokenId) throw new Error('Mint the agent first — only minted agents can transfer with their token.')
  const reg = new Contract(REGISTRY, REG_ABI, signer)
  const recipientPub: string = await reg.pubKeyOf!(recipient)
  if (!recipientPub || recipientPub === '0x') {
    throw new Error('Recipient hasn’t registered to receive agents yet.')
  }

  // Gather the whole trained brain.
  const owner = companion.ownerAddr
  const { config } = await loadPersonality(ownerKey, companion.personalityRootHash)
  const knowHead = localStorage.getItem(knowledgeHeadKey(owner))
  const knowledge = knowHead ? await loadKnowledge(ownerKey, knowHead) : []
  const convHead = localStorage.getItem(conversationHeadKey(owner))
  const conversation = convHead ? await loadConversation(ownerKey, convHead) : []

  const bundle: BrainBundle = { v: 1, name: companion.name, modelId: companion.modelId, personality: config, knowledge, conversation }
  const sealed = await sealToRecipient(recipientPub, new TextEncoder().encode(JSON.stringify(bundle)))
  const { rootHash } = await uploadBytes(signer, sealed)

  const txH = await reg.setHandoff!(companion.tokenId, rootHash)
  await txH.wait()
  const nft = new Contract(NFT, NFT_ABI, signer)
  const txT = await nft.transferFrom!(signer.address, recipient, companion.tokenId)
  await txT.wait()
  return { txHash: txT.hash }
}

/** Claim an agent transferred to you: open the brain, re-own it under your key, re-point the token. */
export async function claimAgent(
  signer: JsonRpcSigner,
  ownerKey: CryptoKey,
  tokenId: string,
): Promise<ActiveCompanion> {
  const me = signer.address.toLowerCase()
  const reg = new Contract(REGISTRY, REG_ABI, signer)
  const sealedRoot: string = await reg.handoffOf!(tokenId)
  if (!sealedRoot) throw new Error('No transferred brain found for this agent.')

  const transferKey = await deriveTransferKey(signer, signer.address)
  const sealed = await downloadBytes(sealedRoot)
  const bundle = JSON.parse(new TextDecoder().decode(await openSealed(transferKey, sealed))) as BrainBundle

  // Re-encrypt the brain under MY key (so my normal flow works), and re-point the token.
  const { rootHash: persRoot, version } = await persistPersonality(signer, ownerKey, bundle.personality)
  if (bundle.knowledge?.length) {
    const r = await appendKnowledge(signer, ownerKey, { companion: me, head: null, items: bundle.knowledge })
    localStorage.setItem(knowledgeHeadKey(me), r.head)
  }
  if (bundle.conversation?.length) {
    const r = await appendMessages(signer, ownerKey, { companion: me, head: null, messages: bundle.conversation })
    localStorage.setItem(conversationHeadKey(me), r.head)
  }

  const nft = new Contract(NFT, NFT_ABI, signer)
  const id = personalityIntelligentData(version)
  const tx = await nft.update!(tokenId, [{ dataDescription: id.dataDescription, dataHash: version }], persRoot)
  await tx.wait()

  return {
    ownerAddr: me,
    name: bundle.name,
    modelId: bundle.modelId,
    version,
    personalityRootHash: persRoot,
    tokenId,
  }
}
