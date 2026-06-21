/**
 * Marketplace Square (slice #4) — list, buy, and sell agents on-chain. TESTNET DEMO of
 * the economy mechanics; tokens have no real value, so the regulated real-money concerns
 * don't apply here (mainnet would need legal review).
 */
import { useCallback, useEffect, useState } from 'react'
import { formatEther, parseEther } from 'ethers'
import type { Connection } from '../lib/wallet'
import type { ActiveCompanion } from '../lib/session'
import { fetchListings, listAgent, buyAgent, cancelListing, type Listing } from '../lib/market'
import { OG_TESTNET } from '../lib/og'
import { CompanionOrb } from '../components/CompanionOrb'
import type { Status } from '../components/Dot'

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export function Market({ conn, companion }: { conn: Connection; companion: ActiveCompanion | null }) {
  const me = conn.address.toLowerCase()
  const [listings, setListings] = useState<Listing[] | null>(null)
  const [err, setErr] = useState('')
  const [price, setPrice] = useState('')
  const [listStatus, setListStatus] = useState<Status>('idle')
  const [busyToken, setBusyToken] = useState<string>('')

  const refresh = useCallback(async () => {
    setErr('')
    try {
      setListings(await fetchListings(conn.provider))
    } catch (e) {
      setErr((e as Error).message)
      setListings([])
    }
  }, [conn.provider])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const myTokenListed =
    !!companion?.tokenId && (listings ?? []).some((l) => l.tokenId === companion.tokenId)

  async function onList() {
    if (!companion?.tokenId || !price) return
    setListStatus('busy')
    setErr('')
    try {
      await listAgent(conn.signer, companion.tokenId, parseEther(price))
      setPrice('')
      setListStatus('ok')
      await refresh()
    } catch (e) {
      setErr((e as Error).message)
      setListStatus('error')
    }
  }

  async function onBuy(l: Listing) {
    setBusyToken(l.tokenId)
    setErr('')
    try {
      await buyAgent(conn.signer, l.tokenId, l.price)
      await refresh()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusyToken('')
    }
  }

  async function onCancel(l: Listing) {
    setBusyToken(l.tokenId)
    setErr('')
    try {
      await cancelListing(conn.signer, l.tokenId)
      await refresh()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusyToken('')
    }
  }

  return (
    <div className="market">
      <section className="intro">
        <p className="world-kicker">Marketplace Square</p>
        <h2 className="intro-h">Trade agents</h2>
        <p className="intro-p">
          List your agent for sale, or buy a trained one. Ownership transfers on-chain. Testnet demo —
          play-money only.
        </p>
      </section>

      {/* sell your agent */}
      <section className={`card ${listStatus}`}>
        <div className="card-h">
          <span className="step">🏷️</span>
          <h2>Sell your agent</h2>
        </div>
        {!companion?.tokenId ? (
          <p className="muted small">Mint your agent first (Minting Hall in the Studio) to list it here.</p>
        ) : myTokenListed ? (
          <p className="muted small">Agent #{companion.tokenId} is listed below.</p>
        ) : (
          <>
            <p className="muted small">List <strong>{companion.name}</strong> (Agent #{companion.tokenId}). One approval + one listing tx.</p>
            <div className="composer">
              <input className="inp" type="number" min="0" step="0.001" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price in 0G" />
              <button className="send" onClick={onList} disabled={listStatus === 'busy' || !price} title="List for sale" style={{ width: 'auto', borderRadius: 12, padding: '0 18px' }}>
                {listStatus === 'busy' ? '…' : 'List'}
              </button>
            </div>
          </>
        )}
      </section>

      {/* listings */}
      <section className="card">
        <div className="card-h">
          <span className="step">🛒</span>
          <h2>For sale</h2>
          <button className="ghost" onClick={refresh} style={{ width: 'auto', marginLeft: 'auto', padding: '6px 12px', fontSize: 12 }}>Refresh</button>
        </div>
        {listings === null ? (
          <p className="muted small">Loading the square…</p>
        ) : listings.length === 0 ? (
          <p className="muted small">No agents listed yet. Be the first to put one up.</p>
        ) : (
          <div className="listings">
            {listings.map((l) => {
              const mine = l.seller.toLowerCase() === me
              return (
                <div key={l.tokenId} className="listing">
                  <CompanionOrb size={44} state="idle" seed={l.dataHash || l.tokenId} />
                  <div className="l-info">
                    <strong>Agent #{l.tokenId}</strong>
                    <span className="muted small mono">{(l.dataHash || '').slice(0, 12)}…</span>
                    <span className="muted small">by {mine ? 'you' : short(l.seller)}</span>
                  </div>
                  <div className="l-buy">
                    <span className="l-price">{formatEther(l.price)} 0G</span>
                    {mine ? (
                      <button className="ghost" onClick={() => onCancel(l)} disabled={busyToken === l.tokenId}>
                        {busyToken === l.tokenId ? '…' : 'Cancel'}
                      </button>
                    ) : (
                      <button onClick={() => onBuy(l)} disabled={busyToken === l.tokenId}>
                        {busyToken === l.tokenId ? 'Buying…' : 'Buy'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {err && <p className="err">{err}</p>}
      </section>

      <p className="muted small center">
        contracts on 0G ·{' '}
        <a className="mono" href={OG_TESTNET.explorer} target="_blank" rel="noreferrer">market</a>
      </p>
    </div>
  )
}
