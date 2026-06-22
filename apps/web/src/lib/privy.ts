/**
 * Privy embedded-wallet config — the "no MetaMask" front door (Phase 1 of scale).
 *
 * Email/passkey login mints a self-custodial embedded wallet on 0G Galileo. That
 * wallet exposes an EIP-1193 provider, which we wrap into the SAME `Connection` the
 * rest of KIPR already consumes — so encryption, storage, memory and compute all work
 * unchanged. Ownership is preserved: the key is the user's (exportable via Privy), and
 * our wallet-signature key derivation works identically with an embedded signer.
 */
import { defineChain } from 'viem'
import { BrowserProvider } from 'ethers'
import { OG_TESTNET } from './og'
import type { Connection } from './wallet'

export const ogGalileo = defineChain({
  id: OG_TESTNET.chainId,
  name: OG_TESTNET.name,
  nativeCurrency: { decimals: 18, name: '0G', symbol: '0G' },
  rpcUrls: { default: { http: [OG_TESTNET.evmRpc] } },
  blockExplorers: { default: { name: '0G Scan', url: OG_TESTNET.explorer } },
  testnet: true,
})

/** PrivyProvider config: pin 0G as the only chain, email + passkey, auto embedded wallet. */
export const privyConfig = {
  defaultChain: ogGalileo,
  supportedChains: [ogGalileo],
  loginMethods: ['email', 'passkey'],
  // 'all-users' (not 'users-without-wallets'): always mint an embedded wallet on login,
  // so an email/passkey user uses THAT — never falling back to MetaMask.
  embeddedWallets: { ethereum: { createOnLogin: 'all-users' } },
  appearance: { theme: 'dark', accentColor: '#8b5cf6', walletChainType: 'ethereum-only' },
} as const

/** Minimal shape we need from a Privy ConnectedWallet. */
export interface PrivyWalletLike {
  address: string
  walletClientType?: string
  getEthereumProvider: () => Promise<unknown>
  switchChain?: (chainId: number) => Promise<void>
}

/** Bridge a Privy embedded wallet into KIPR's wallet-agnostic Connection. */
export async function connectionFromPrivyWallet(wallet: PrivyWalletLike): Promise<Connection> {
  try {
    await wallet.switchChain?.(OG_TESTNET.chainId)
  } catch {
    /* embedded wallet defaults to the configured chain anyway */
  }
  const eip1193 = (await wallet.getEthereumProvider()) as ConstructorParameters<typeof BrowserProvider>[0]
  const provider = new BrowserProvider(eip1193)
  const signer = await provider.getSigner()
  const address = await signer.getAddress()
  const chainId = Number((await provider.getNetwork()).chainId)
  return { provider, signer, address, chainId }
}
