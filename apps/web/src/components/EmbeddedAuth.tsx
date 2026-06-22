/**
 * Email/passkey sign-in via Privy (no MetaMask). Rendered only inside PrivyProvider.
 * On login it grabs the user's embedded wallet, bridges it to a KIPR Connection, and
 * hands it up — from there everything (unlock, create, chat, own) is identical.
 */
import { useEffect } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { connectionFromPrivyWallet, type PrivyWalletLike } from '../lib/privy'
import { toast, humanizeError } from '../lib/toast'
import type { Connection } from '../lib/wallet'

export function EmbeddedAuth({
  connected,
  onConnection,
}: {
  connected: boolean
  onConnection: (c: Connection) => void
}) {
  const { ready, authenticated, login } = usePrivy()
  const { wallets } = useWallets()

  useEffect(() => {
    if (!ready || !authenticated || connected) return
    // Strictly the Privy EMBEDDED wallet — never silently bridge an injected wallet
    // (e.g. MetaMask) on the email/passkey path. If it isn't ready yet, wait: the
    // effect re-runs when `wallets` updates and the embedded wallet appears.
    const embedded = wallets.find(
      (w) => w.walletClientType === 'privy' || (w as { connectorType?: string }).connectorType === 'embedded',
    ) as PrivyWalletLike | undefined
    if (!embedded) return
    let cancelled = false
    connectionFromPrivyWallet(embedded)
      .then((c) => {
        if (!cancelled) onConnection(c)
      })
      .catch((e) => {
        if (!cancelled) toast.error(`Couldn't open your wallet on 0G: ${humanizeError(e)}`)
      })
    return () => {
      cancelled = true
    }
  }, [ready, authenticated, wallets, connected, onConnection])

  if (connected) return null
  return (
    <button className="cta-alt" onClick={login} disabled={!ready}>
      {ready ? '✉️ Continue with email or passkey' : 'Loading…'}
    </button>
  )
}
