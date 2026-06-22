/**
 * The companion's version timeline (P3). Every adopted personality version, newest
 * first, with the one in force now marked. Reinforces "no one changed it behind your
 * back" — each version is a deliberate, recorded choice.
 */
import type { VersionEntry } from '../lib/personality-history'

export function VersionHistory({ versions, current }: { versions: VersionEntry[]; current: string }) {
  if (versions.length === 0) return null
  const ordered = [...versions].reverse()
  return (
    <section className="card">
      <div className="card-h">
        <span className="step">⌚</span>
        <h2>Version history</h2>
      </div>
      <p className="muted small">Every version your agent has been — each one you chose, on the record.</p>
      <ol className="timeline">
        {ordered.map((v, i) => (
          <li key={v.version} className={v.version === current ? 'tl on' : 'tl'}>
            <span className="tl-dot" />
            <div className="tl-body">
              <div className="tl-top">
                <strong>{v.name}</strong>
                {v.version === current ? <span className="tl-now">in force now</span> : <span className="tl-old">v{ordered.length - i}</span>}
              </div>
              <div className="tl-meta">
                <span className="mono hash">{v.version.slice(0, 18)}…</span>
                <span className="muted small">{new Date(v.createdAt).toLocaleString()} · {v.modelId.split('/').pop()}</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
