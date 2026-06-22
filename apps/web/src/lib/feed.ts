/**
 * The Square — a global activity feed read straight from on-chain events (mints, market
 * listings/sales, anchored match wins). Social proof that the world is alive, with zero
 * backend: everything is already public on 0G.
 */
import { Contract, formatEther, type Provider, type EventLog } from 'ethers'

const NFT = (import.meta.env.VITE_AGENT_NFT_ADDRESS as string | undefined) || ''
const MARKET = (import.meta.env.VITE_AGENT_MARKET_ADDRESS as string | undefined) || ''
const ARENA = (import.meta.env.VITE_ARENA_LOG_ADDRESS as string | undefined) || ''

const ok = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a)
export const feedConfigured = (): boolean => ok(NFT) || ok(MARKET) || ok(ARENA)

const NFT_ABI = ['event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)']
const MARKET_ABI = [
  'event Listed(uint256 indexed tokenId, address indexed seller, uint256 price)',
  'event Bought(uint256 indexed tokenId, address indexed buyer, address indexed seller, uint256 price)',
]
const ARENA_ABI = ['event MatchLogged(address indexed player, bytes32 indexed opponentId, bytes32 transcriptHash, uint8 result, uint64 timestamp)']

export interface FeedItem {
  icon: string
  text: string
  block: number
  key: string
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

async function pull(c: Contract, name: string, provider: Provider): Promise<EventLog[]> {
  try {
    return (await c.queryFilter!(c.filters![name]!())) as EventLog[]
  } catch {
    const latest = await provider.getBlockNumber()
    return (await c.queryFilter!(c.filters![name]!(), Math.max(0, latest - 9000), latest)) as EventLog[]
  }
}

/** Newest-first activity across iWORLD's contracts. */
export async function fetchFeed(provider: Provider): Promise<FeedItem[]> {
  const items: FeedItem[] = []
  const ZERO = '0x0000000000000000000000000000000000000000'

  if (ok(MARKET)) {
    const m = new Contract(MARKET, MARKET_ABI, provider)
    for (const e of await pull(m, 'Bought', provider)) {
      const a = e.args as unknown as { tokenId: bigint; price: bigint }
      items.push({ icon: '🪙', text: `Agent #${a.tokenId} sold for ${formatEther(a.price)} 0G`, block: e.blockNumber, key: `b${e.transactionHash}${e.index}` })
    }
    for (const e of await pull(m, 'Listed', provider)) {
      const a = e.args as unknown as { tokenId: bigint; price: bigint }
      items.push({ icon: '🏷️', text: `Agent #${a.tokenId} listed for ${formatEther(a.price)} 0G`, block: e.blockNumber, key: `l${e.transactionHash}${e.index}` })
    }
  }

  if (ok(ARENA)) {
    const ar = new Contract(ARENA, ARENA_ABI, provider)
    for (const e of await pull(ar, 'MatchLogged', provider)) {
      const a = e.args as unknown as { player: string; result: bigint }
      const won = Number(a.result) === 1
      items.push({ icon: won ? '🏆' : '⚔️', text: `${short(a.player)} ${won ? 'won a match' : 'fought in the arena'}`, block: e.blockNumber, key: `m${e.transactionHash}${e.index}` })
    }
  }

  if (ok(NFT)) {
    const nft = new Contract(NFT, NFT_ABI, provider)
    for (const e of await pull(nft, 'Transfer', provider)) {
      const a = e.args as unknown as { from: string; tokenId: bigint }
      if (a.from === ZERO) items.push({ icon: '✨', text: `Agent #${a.tokenId} was minted into iWORLD`, block: e.blockNumber, key: `t${e.transactionHash}${e.index}` })
    }
  }

  return items.sort((a, b) => b.block - a.block).slice(0, 30)
}
