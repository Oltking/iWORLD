/**
 * Connection health — catch a wrong network or a dead wallet RPC the moment you connect,
 * so you get a clear banner up front instead of a confusing "network error" mid-create.
 */
import type { Connection } from './wallet'
import { OG_TESTNET } from './og'

export interface Health {
  ok: boolean
  kind?: 'wrong-network' | 'rpc-unreachable'
  message?: string
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])
}

/** Is the wallet on 0G, and can it actually reach the chain? */
export async function diagnoseConnection(conn: Connection): Promise<Health> {
  if (conn.chainId !== OG_TESTNET.chainId) {
    return {
      ok: false,
      kind: 'wrong-network',
      message: `Your wallet is on chain ${conn.chainId}, not 0G Galileo (${OG_TESTNET.chainId}). Switch networks to create and save your agent.`,
    }
  }
  try {
    await withTimeout(conn.provider.getBlockNumber(), 8000)
    return { ok: true }
  } catch {
    return {
      ok: false,
      kind: 'rpc-unreachable',
      message: `Your wallet can’t reach the 0G network. Set its RPC URL to ${OG_TESTNET.evmRpc} (chain 16602), remove any others, then reconnect.`,
    }
  }
}

/** (Re)register 0G with the known-good RPC on an injected wallet. */
export async function fixNetwork(): Promise<void> {
  const eth = window.ethereum
  if (!eth) throw new Error('No injected wallet to fix. Set the RPC manually in your wallet.')
  await eth.request({
    method: 'wallet_addEthereumChain',
    params: [
      {
        chainId: OG_TESTNET.chainIdHex,
        chainName: OG_TESTNET.name,
        nativeCurrency: OG_TESTNET.nativeCurrency,
        rpcUrls: [OG_TESTNET.evmRpc],
        blockExplorerUrls: [OG_TESTNET.explorer],
      },
    ],
  })
}
