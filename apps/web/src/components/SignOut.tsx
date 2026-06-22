/**
 * Sign out — clears the local session and, for embedded (Privy) users, logs them out of
 * Privy too. The plain-button branch is used when Privy isn't enabled (MetaMask only).
 */
import { usePrivy } from '@privy-io/react-auth'

export function SignOut({ privyEnabled, onSignOut }: { privyEnabled: boolean; onSignOut: () => void }) {
  return privyEnabled ? (
    <PrivySignOut onSignOut={onSignOut} />
  ) : (
    <button className="signout" onClick={onSignOut}>
      ↩ Sign out
    </button>
  )
}

function PrivySignOut({ onSignOut }: { onSignOut: () => void }) {
  const { logout } = usePrivy()
  return (
    <button
      className="signout"
      onClick={async () => {
        try {
          await logout()
        } catch {
          /* ignore — clear locally regardless */
        }
        onSignOut()
      }}
    >
      ↩ Sign out
    </button>
  )
}
