/**
 * Wallet connection via the injected provider (MetaMask et al.). The private key
 * NEVER leaves the wallet — we only ever hold a signer. Ensures the wallet is on
 * 0G Galileo testnet, adding the network if the user doesn't have it yet.
 */
import { BrowserProvider, type JsonRpcSigner } from 'ethers'
import { OG_TESTNET } from './og'

export interface Connection {
  provider: BrowserProvider
  signer: JsonRpcSigner
  address: string
  chainId: number
}

export function hasInjectedWallet(): boolean {
  return typeof window !== 'undefined' && !!window.ethereum
}

const RPC_REGISTERED_KEY = 'kipr.og.rpc.registered.v1'

const ogChainParams = {
  chainId: OG_TESTNET.chainIdHex,
  chainName: OG_TESTNET.name,
  nativeCurrency: OG_TESTNET.nativeCurrency,
  rpcUrls: [OG_TESTNET.evmRpc],
  blockExplorerUrls: [OG_TESTNET.explorer],
}

/**
 * Put the wallet on 0G Galileo with the KNOWN-GOOD RPC. The common failure mode is
 * a wallet that already has 0G saved against a stale/dead RPC (transactions then fail
 * with "RPC endpoint unavailable") — and wallet_switchEthereumChain alone won't fix
 * that. So on the first connect we call wallet_addEthereumChain, which registers and
 * selects our working endpoint; a localStorage guard keeps it to a one-time prompt.
 */
async function ensureOgNetwork(provider: BrowserProvider): Promise<void> {
  const eth = window.ethereum
  if (!eth) throw new Error('No injected wallet found.')
  const net = await provider.getNetwork()
  const onChain = Number(net.chainId) === OG_TESTNET.chainId
  const registered = (() => {
    try {
      return localStorage.getItem(RPC_REGISTERED_KEY) === '1'
    } catch {
      return false
    }
  })()

  if (!onChain || !registered) {
    try {
      // addEthereumChain both adds the good RPC and switches to the chain.
      await eth.request({ method: 'wallet_addEthereumChain', params: [ogChainParams] })
      try {
        localStorage.setItem(RPC_REGISTERED_KEY, '1')
      } catch {
        /* ignore storage errors */
      }
      return
    } catch (err) {
      const code = (err as { code?: number })?.code
      if (code === 4001) {
        throw new Error('You rejected the 0G network request in your wallet.')
      }
      // -32602: the wallet already has 0G added with a different symbol/params. That's
      // fine — the network works; we just can't re-register it. Mark done, don't retry.
      if (code === -32602) {
        try {
          localStorage.setItem(RPC_REGISTERED_KEY, '1')
        } catch {
          /* ignore */
        }
        return
      }
      // Some wallets won't re-add an existing chain — fall back to a plain switch.
      if (!onChain) {
        await eth.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: OG_TESTNET.chainIdHex }],
        })
      }
    }
  }
}

export async function connectWallet(): Promise<Connection> {
  if (!hasInjectedWallet()) {
    throw new Error('No wallet detected. Install MetaMask (or another EVM wallet) to continue.')
  }
  const provider = new BrowserProvider(window.ethereum!)
  await provider.send('eth_requestAccounts', [])
  await ensureOgNetwork(provider)

  // Re-create the provider after a possible network switch so it sees the new chain.
  const fresh = new BrowserProvider(window.ethereum!)
  const signer = await fresh.getSigner()
  const address = await signer.getAddress()
  const chainId = Number((await fresh.getNetwork()).chainId)
  return { provider: fresh, signer, address, chainId }
}
