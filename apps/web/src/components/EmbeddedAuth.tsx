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
    const embedded =
      (wallets.find((w) => w.walletClientType === 'privy') as PrivyWalletLike | undefined) ??
      (wallets[0] as PrivyWalletLike | undefined)
    if (!embedded) return // wallet still being created after login — effect re-runs when it lands
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
