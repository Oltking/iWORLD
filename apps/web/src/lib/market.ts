/**
 * Marketplace Square (slice #4) — list, buy, and sell agents on-chain, via the deployed
 * AgentMarket. TESTNET DEMO: tokens have no real value, so this prototypes the economy
 * mechanics without the regulated real-money concerns (mainnet would need legal review).
 *
 * v1 moves the ownership token + settles payment on-chain. The full ERC-7857 re-keyed
 * brain transfer (re-encrypting the agent's memory to the buyer) is the deeper step.
 */
import { Contract, type JsonRpcSigner, type Provider } from 'ethers'

const MARKET = (import.meta.env.VITE_AGENT_MARKET_ADDRESS as string | undefined) || ''
const NFT = (import.meta.env.VITE_AGENT_NFT_ADDRESS as string | undefined) || ''

const MARKET_ABI = [
  'function list(uint256 tokenId, uint256 price)',
  'function cancel(uint256 tokenId)',
  'function buy(uint256 tokenId) payable',
  'function isListed(uint256 tokenId) view returns (bool)',
  'function listings(uint256 tokenId) view returns (address seller, uint256 price)',
  'function feeBps() view returns (uint96)',
  'event Listed(uint256 indexed tokenId, address indexed seller, uint256 price)',
  'event Cancelled(uint256 indexed tokenId, address indexed seller)',
  'event Bought(uint256 indexed tokenId, address indexed buyer, address indexed seller, uint256 price)',
]
const NFT_ABI = [
  'function approve(address to, uint256 tokenId)',
  'function getApproved(uint256 tokenId) view returns (address)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function primaryDataHash(uint256 tokenId) view returns (bytes32)',
  'function brainRootHash(uint256 tokenId) view returns (string)',
]

export const marketConfigured = (): boolean => /^0x[0-9a-fA-F]{40}$/.test(MARKET) && /^0x[0-9a-fA-F]{40}$/.test(NFT)

export interface Listing {
  tokenId: string
  seller: string
  price: bigint
  dataHash: string
}

/** List an agent: approve the market for the token (if needed), then list. */
export async function listAgent(signer: JsonRpcSigner, tokenId: string, priceWei: bigint): Promise<void> {
  const nft = new Contract(NFT, NFT_ABI, signer)
  const approved: string = await nft.getApproved!(tokenId)
  if (approved.toLowerCase() !== MARKET.toLowerCase()) {
    const txA = await nft.approve!(MARKET, tokenId)
    await txA.wait()
  }
  const market = new Contract(MARKET, MARKET_ABI, signer)
  const tx = await market.list!(tokenId, priceWei)
  await tx.wait()
}

export async function buyAgent(signer: JsonRpcSigner, tokenId: string, priceWei: bigint): Promise<string> {
  const market = new Contract(MARKET, MARKET_ABI, signer)
  const tx = await market.buy!(tokenId, { value: priceWei })
  await tx.wait()
  return tx.hash
}

export async function cancelListing(signer: JsonRpcSigner, tokenId: string): Promise<void> {
  const market = new Contract(MARKET, MARKET_ABI, signer)
  const tx = await market.cancel!(tokenId)
  await tx.wait()
}

/** Read all currently-active listings (from Listed events, filtered by isListed). */
export async function fetchListings(provider: Provider): Promise<Listing[]> {
  const market = new Contract(MARKET, MARKET_ABI, provider)
  const nft = new Contract(NFT, NFT_ABI, provider)
  const events = await market.queryFilter!(market.filters!.Listed!())
  const seen = new Set<string>()
  const out: Listing[] = []
  // newest first
  for (const ev of [...events].reverse()) {
    const tokenId = (ev as unknown as { args: { tokenId: bigint } }).args.tokenId.toString()
    if (seen.has(tokenId)) continue
    seen.add(tokenId)
    const active: boolean = await market.isListed!(tokenId)
    if (!active) continue
    const l = await market.listings!(tokenId)
    let dataHash = ''
    try {
      dataHash = await nft.primaryDataHash!(tokenId)
    } catch {
      /* ignore */
    }
    out.push({ tokenId, seller: l.seller as string, price: l.price as bigint, dataHash })
  }
  return out
}
