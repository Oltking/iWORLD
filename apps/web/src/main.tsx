import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivyProvider } from '@privy-io/react-auth'
import { App } from './App'
import { privyConfig } from './lib/privy'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID as string | undefined

// Privy powers the email/passkey "no MetaMask" path. Without an app ID the app still
// runs (MetaMask only) — so a missing key degrades gracefully instead of crashing.
createRoot(root).render(
  <StrictMode>
    {privyAppId ? (
      <PrivyProvider appId={privyAppId} config={privyConfig as never}>
        <App privyEnabled />
      </PrivyProvider>
    ) : (
      <App privyEnabled={true} />
    )}
  </StrictMode>,
)
