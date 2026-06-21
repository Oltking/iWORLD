/**
 * App shell — KIPR's product surface. A warm hero invites you in; once you're
 * connected + unlocked, you create and own your companion. The P0 plumbing harness
 * still exists but is demoted to a "developer tools" view off the footer, so the
 * primary experience reads like a companion, not a test bench.
 */
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { connectWallet, hasInjectedWallet, type Connection } from './lib/wallet'
import { deriveOwnerKey, keyCheckValue } from './lib/crypto'
import { OG_TESTNET } from './lib/og'
import { CompanionCreator } from './screens/CompanionCreator'
import {
  conversationHeadKey,
  loadSession,
  saveSession,
  clearSession,
  type ActiveCompanion,
} from './lib/session'
import { CompanionOrb } from './components/CompanionOrb'
import { EmbeddedAuth } from './components/EmbeddedAuth'
import { FundingButton } from './components/FundingButton'
import type { MemoryMessage } from './lib/conversation-store'
import type { KiprExport } from './lib/export'
import type { Status } from './components/Dot'

// Lazy so the heavy compute SDK (chat) and storage SDK aren't in the first paint.
const World = lazy(() => import('./screens/World').then((m) => ({ default: m.World })))
const Chat = lazy(() => import('./screens/Chat').then((m) => ({ default: m.Chat })))
const Train = lazy(() => import('./screens/Train').then((m) => ({ default: m.Train })))
const Vault = lazy(() => import('./screens/Vault').then((m) => ({ default: m.Vault })))
const Harness = lazy(() => import('./screens/Harness').then((m) => ({ default: m.Harness })))

type View = 'world' | 'create' | 'chat' | 'train' | 'vault'

// Sponsored funding is optional — only offered when a funder service is configured.
const funderConfigured = !!(import.meta.env.VITE_FUNDER_URL as string | undefined)

export function App({ privyEnabled }: { privyEnabled: boolean }) {
  const [conn, setConn] = useState<Connection | null>(null)
  const [walletStatus, setWalletStatus] = useState<Status>('idle')
  const [walletErr, setWalletErr] = useState('')
  const [ownerKey, setOwnerKey] = useState<CryptoKey | null>(null)
  const [kcv, setKcv] = useState('')
  const [unlockStatus, setUnlockStatus] = useState<Status>('idle')
  const [unlockErr, setUnlockErr] = useState('')
  const [showDev, setShowDev] = useState(false)
  const [companion, setCompanion] = useState<ActiveCompanion | null>(null)
  const [view, setView] = useState<View>('create')
  const [restoredInitial, setRestoredInitial] = useState<{ messages: MemoryMessage[]; head: string | null } | null>(null)
  const [bootSession] = useState(loadSession)

  // Continuity across refreshes: once the same wallet reconnects, bring the companion back.
  useEffect(() => {
    if (companion || !conn || !bootSession) return
    if (bootSession.ownerAddr === conn.address.toLowerCase()) {
      setCompanion(bootSession)
      setView('world')
    }
  }, [conn, companion, bootSession])

  // Persist the active companion pointer (non-secret) so it survives a reload.
  useEffect(() => {
    if (companion) saveSession(companion)
  }, [companion])

  const onRestore = useCallback(
    (exp: KiprExport) => {
      if (!conn) return
      const owner = conn.address.toLowerCase()
      const sameOwner = exp.owner.toLowerCase() === owner
      // Same wallet → its on-chain head still decrypts; different wallet → load from the
      // file's plaintext and let them re-Save to re-own it under this key.
      const head = sameOwner ? exp.companion.conversationHead : null
      setCompanion({
        ownerAddr: owner,
        name: exp.companion.name,
        modelId: exp.personality.modelId,
        version: exp.companion.personalityVersion,
        personalityRootHash: exp.companion.personalityRootHash,
      })
      setRestoredInitial({ messages: exp.conversation, head })
      if (head) localStorage.setItem(conversationHeadKey(owner), head)
      setView('chat')
    },
    [conn],
  )

  const onDelete = useCallback(() => {
    if (companion) localStorage.removeItem(conversationHeadKey(companion.ownerAddr))
    clearSession()
    setCompanion(null)
    setRestoredInitial(null)
    setView('create')
  }, [companion])

  const [balance, setBalance] = useState<string | null>(null)

  const refreshBalance = useCallback(async (c: Connection) => {
    try {
      const wei = await c.provider.getBalance(c.address)
      setBalance((Number(wei) / 1e18).toFixed(3))
    } catch {
      /* leave balance unknown */
    }
  }, [])

  const [walletKind, setWalletKind] = useState<'metamask' | 'embedded' | null>(null)

  // One place both wallet sources (MetaMask + Privy embedded) funnel into.
  const applyConnection = useCallback(
    (c: Connection, kind: 'metamask' | 'embedded') => {
      setConn(c)
      setWalletKind(kind)
      setWalletStatus('ok')
      void refreshBalance(c)
    },
    [refreshBalance],
  )

  const onConnect = useCallback(async () => {
    setWalletStatus('busy')
    setWalletErr('')
    try {
      applyConnection(await connectWallet(), 'metamask')
    } catch (e) {
      setWalletErr((e as Error).message)
      setWalletStatus('error')
    }
  }, [applyConnection])

  const onUnlock = useCallback(async () => {
    if (!conn) return
    setUnlockStatus('busy')
    setUnlockErr('')
    try {
      const key = await deriveOwnerKey(conn.signer, conn.address)
      setOwnerKey(key)
      setKcv(await keyCheckValue(key))
      setUnlockStatus('ok')
      void refreshBalance(conn)
    } catch (e) {
      setUnlockErr((e as Error).message)
      setUnlockStatus('error')
    }
  }, [conn, refreshBalance])

  const short = conn ? `${conn.address.slice(0, 6)}…${conn.address.slice(-4)}` : null

  return (
    <>
      <div className="aurora" aria-hidden="true">
        <span className="blob b1" />
        <span className="blob b2" />
        <span className="blob b3" />
        <span className="blob b4" />
      </div>

      <main className="wrap">
        {/* ── HERO (pre-connect) ───────────────────────────────────────────── */}
        {!conn && !showDev ? (
          <section className="hero">
            <CompanionOrb size={150} state="idle" />
            <h1 className="brand">iWORLD</h1>
            <p className="tagline">Agents you create, own, and grow.</p>
            <p className="lede">
              A living world of AI agents that are truly yours. Private by design — your agent thinks
              in a sealed enclave, and its memory &amp; personality live in storage <em>you</em> own.
              No company can read it, change it, or take it away.
            </p>
            <div className="cta-group">
              {privyEnabled && (
                <EmbeddedAuth connected={!!conn} onConnection={(c) => applyConnection(c, 'embedded')} />
              )}
              {hasInjectedWallet() ? (
                <button
                  className={privyEnabled ? 'cta-secondary' : 'cta'}
                  onClick={onConnect}
                  disabled={walletStatus === 'busy'}
                >
                  {walletStatus === 'busy' ? 'Connecting…' : privyEnabled ? 'or connect a wallet' : 'Begin'}
                </button>
              ) : (
                !privyEnabled && <p className="muted small">iWORLD needs an EVM wallet like MetaMask.</p>
              )}
            </div>
            {walletErr && <p className="err">{walletErr}</p>}
            <div className="trust">
              <span>🔒 TEE-private</span>
              <span>🔑 You hold the keys</span>
              <span>♾️ Yours to keep</span>
            </div>
          </section>
        ) : (
          <>
            {/* ── HEADER (connected) ─────────────────────────────────────────── */}
            <header className="hd">
              <div className="hd-row">
                <div className="hd-brand">
                  <CompanionOrb size={42} state={unlockStatus === 'busy' ? 'thinking' : 'idle'} />
                  <div>
                    <h1 className="brand sm">iWORLD</h1>
                    <p className="sub">private · yours</p>
                  </div>
                </div>
                {!conn ? (
                  <button className="chip-btn" onClick={onConnect} disabled={walletStatus === 'busy'}>
                    {walletStatus === 'busy' ? 'Connecting…' : 'Connect'}
                  </button>
                ) : ownerKey ? (
                  <span className="chip" title={`${conn.address}\n${balance ?? '?'} 0G\nkey ${kcv}`}>
                    <span className="statusdot ok" /> {short} · {balance ?? '…'} 0G · 🔓
                  </span>
                ) : (
                  <button className="chip-btn" onClick={onUnlock} disabled={unlockStatus === 'busy'} title="Sign once to derive your encryption key">
                    {unlockStatus === 'busy' ? 'Sign in wallet…' : `🔒 Unlock`}
                  </button>
                )}
              </div>
              {unlockErr && <p className="err">{unlockErr}</p>}
              {conn && balance !== null && Number(balance) < 0.05 && (
                <div className="lowfunds">
                  <span>⚠ Low on 0G ({balance}). Saving to 0G needs a little gas.</span>
                  {walletKind === 'embedded' && privyEnabled && funderConfigured ? (
                    <FundingButton address={conn.address} onFunded={() => void refreshBalance(conn)} />
                  ) : (
                    <a href="https://faucet.0g.ai" target="_blank" rel="noreferrer">get some free →</a>
                  )}
                </div>
              )}
              {!showDev && (
                <nav className="tabs">
                  {companion ? (
                    <>
                      <button className={view === 'world' ? 'tab on' : 'tab'} onClick={() => setView('world')}>World</button>
                      <button className={view === 'chat' ? 'tab on' : 'tab'} onClick={() => setView('chat')}>Chat</button>
                      <button className={view === 'train' ? 'tab on' : 'tab'} onClick={() => setView('train')}>Train</button>
                      <button className={view === 'vault' ? 'tab on' : 'tab'} onClick={() => setView('vault')}>Yours</button>
                    </>
                  ) : (
                    <>
                      <button className={view === 'create' ? 'tab on' : 'tab'} onClick={() => setView('create')}>Create</button>
                      <button className={view === 'vault' ? 'tab on' : 'tab'} onClick={() => setView('vault')}>Yours</button>
                    </>
                  )}
                </nav>
              )}
            </header>

            <Suspense fallback={<ScreenLoading />}>
              {showDev ? (
                <Harness conn={conn} walletStatus={walletStatus} walletErr={walletErr} onConnect={onConnect} />
              ) : companion && view === 'world' && conn ? (
                <World
                  ownerKey={ownerKey}
                  companion={companion}
                  onTalk={() => setView('chat')}
                  onTrain={() => setView('train')}
                  onShape={() => setView('create')}
                  onVault={() => setView('vault')}
                />
              ) : companion && view === 'train' && conn ? (
                <Train conn={conn} ownerKey={ownerKey} companion={companion} />
              ) : view === 'vault' && conn ? (
                <Vault conn={conn} ownerKey={ownerKey} companion={companion} onRestore={onRestore} onDelete={onDelete} />
              ) : companion && view === 'chat' && conn ? (
                <Chat
                  key={companion.ownerAddr}
                  conn={conn}
                  ownerKey={ownerKey}
                  companion={companion}
                  initial={restoredInitial ?? undefined}
                />
              ) : (
                <CompanionCreator
                  conn={conn}
                  ownerKey={ownerKey}
                  onUnlock={onUnlock}
                  unlockStatus={unlockStatus}
                  companion={companion}
                  onCompanionReady={(c) => {
                    const firstTime = !companion
                    setCompanion(c)
                    if (firstTime) {
                      setRestoredInitial(null)
                      setView('world')
                    }
                  }}
                />
              )}
            </Suspense>
          </>
        )}

        <footer className="ft">
          <span className="ftdot" /> 0G Galileo testnet · chainId {OG_TESTNET.chainId}
          <button className="devlink" onClick={() => setShowDev((v) => !v)}>
            {showDev ? '← back to iWORLD' : 'developer tools'}
          </button>
        </footer>
      </main>
    </>
  )
}

function ScreenLoading() {
  return (
    <div className="screen-loading">
      <CompanionOrb size={64} state="thinking" />
      <p className="muted small">one moment…</p>
    </div>
  )
}
