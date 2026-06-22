/**
 * The Square — iWORLD's social hub (v1): a live, global activity feed pulled from the
 * chain. Mints, listings, sales, match wins — everyone's, in one place.
 */
import { useCallback, useEffect, useState } from 'react'
import type { Connection } from '../lib/wallet'
import { feedConfigured, fetchFeed, type FeedItem } from '../lib/feed'
import { SkeletonList } from '../components/Skeleton'

export function Square({ conn }: { conn: Connection }) {
  const [items, setItems] = useState<FeedItem[] | null>(null)

  const refresh = useCallback(() => {
    if (!feedConfigured()) {
      setItems([])
      return
    }
    fetchFeed(conn.provider).then(setItems).catch(() => setItems([]))
  }, [conn.provider])

  useEffect(() => refresh(), [refresh])

  return (
    <div className="square">
      <section className="intro">
        <p className="world-kicker">The Square · iWORLD</p>
        <h2 className="intro-h">What’s happening</h2>
        <p className="intro-p">Everything agents do on-chain, as it happens — mints, trades, and arena wins across the whole world.</p>
      </section>

      <section className="card">
        <div className="card-h">
          <span className="step">📰</span>
          <h2>Live feed</h2>
          <button className="ghost" onClick={refresh} style={{ width: 'auto', marginLeft: 'auto', padding: '6px 12px', fontSize: 12 }}>Refresh</button>
        </div>
        {items === null ? (
          <SkeletonList rows={4} />
        ) : items.length === 0 ? (
          <p className="muted small">Quiet for now. Mint, list, or win a match and you’ll show up here first.</p>
        ) : (
          <ul className="feed">
            {items.map((it) => (
              <li key={it.key} className="feed-row">
                <span className="feed-ic">{it.icon}</span>
                <span className="feed-text">{it.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
