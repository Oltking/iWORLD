/**
 * Training Grounds (iWORLD Phase 1) — teach your agent and watch it grow. Knowledge
 * you add here is encrypted client-side, stored on 0G (owned, recoverable), and
 * injected into the agent's context so it actually uses it in chat. No retrain — the
 * same brain, getting richer.
 */
import { useEffect, useRef, useState } from 'react'
import type { Connection } from '../lib/wallet'
import type { ActiveCompanion } from '../lib/session'
import {
  appendKnowledge,
  loadKnowledge,
  knowledgeHeadKey,
  type KnowledgeItem,
  type KnowledgeKind,
} from '../lib/knowledge-store'
import { CompanionOrb } from '../components/CompanionOrb'
import type { Status } from '../components/Dot'

const now = () => new Date().toISOString()

const FEEDBACK_PRESETS = [
  'Be warmer and more encouraging',
  'Be more concise',
  'Ask me thoughtful questions',
  'Challenge me when I’m wrong',
  'Use a drier sense of humour',
]

const STARTERS = ['My name is ', 'I’m working on ', 'Something I love is ', 'Please never ']
const FACT_ACKS = ['Got it — I’ll remember that.', 'Noted. That stays with me.', 'Locked in. ✨', 'Thank you — I won’t forget.']
const FB_ACKS = ['Okay — I’ll be more like that.', 'Understood. You’ll feel the difference.', 'Got it. Adjusting.']
const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)]

export function Train({
  conn,
  ownerKey,
  companion,
}: {
  conn: Connection
  ownerKey: CryptoKey | null
  companion: ActiveCompanion
}) {
  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [head, setHead] = useState<string | null>(() =>
    localStorage.getItem(knowledgeHeadKey(companion.ownerAddr)),
  )
  const [text, setText] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [err, setErr] = useState('')
  const [ack, setAck] = useState('')
  const loadedRef = useRef(false)
  const taRef = useRef<HTMLTextAreaElement>(null)

  // Pull what's already been taught from 0G.
  useEffect(() => {
    if (loadedRef.current || !ownerKey || !head) return
    loadedRef.current = true
    loadKnowledge(ownerKey, head)
      .then(setItems)
      .catch(() => {})
  }, [ownerKey, head])

  async function teach(newItems: KnowledgeItem[]) {
    if (!ownerKey) return
    setStatus('busy')
    setErr('')
    setAck('')
    try {
      const ref = await appendKnowledge(conn.signer, ownerKey, {
        companion: companion.ownerAddr,
        head,
        items: newItems,
      })
      setHead(ref.head)
      localStorage.setItem(knowledgeHeadKey(companion.ownerAddr), ref.head)
      setItems((prev) => [...prev, ...newItems])
      setStatus('ok')
      setAck(pick(newItems[0].kind === 'fact' ? FACT_ACKS : FB_ACKS))
    } catch (e) {
      setErr((e as Error).message)
      setStatus('error')
    }
  }

  function useStarter(s: string) {
    setText(s)
    setAck('')
    taRef.current?.focus()
  }

  function teachFact() {
    const t = text.trim()
    if (!t) return
    setText('')
    void teach([{ text: t, kind: 'fact', createdAt: now() }])
  }

  function teachFeedback(t: string, kind: KnowledgeKind = 'feedback') {
    void teach([{ text: t, kind, createdAt: now() }])
  }

  const busy = status === 'busy'

  return (
    <div className="train">
      <section className="intro">
        <CompanionOrb size={96} state={busy ? 'thinking' : 'idle'} />
        <h2 className="intro-h">Train {companion.name}</h2>
        <p className="intro-p">
          Teach it what matters — facts about you, how you want it to be. It’s encrypted, stored on 0G,
          and yours. What you teach here, it remembers, and uses.
        </p>
      </section>

      {!ownerKey ? (
        <section className="card"><p className="muted">Unlock to teach your agent.</p></section>
      ) : (
        <>
          <section className={`card ${status}`}>
            <div className="card-h">
              <span className="step">＋</span>
              <h2>Teach a fact</h2>
            </div>
            <textarea
              ref={taRef}
              className="inp ta"
              rows={3}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                if (ack) setAck('')
              }}
              placeholder="e.g. My dog is Biscuit. I’m learning the guitar. I hate small talk."
            />
            {items.length === 0 && !text && (
              <div className="chips">
                {STARTERS.map((s) => (
                  <button key={s} className="chip-feedback" onClick={() => useStarter(s)} disabled={busy}>
                    {s.trim()}…
                  </button>
                ))}
              </div>
            )}
            <button onClick={teachFact} disabled={busy || !text.trim()}>
              {busy ? 'Teaching → 0G…' : `Teach ${companion.name}`}
            </button>
            {ack && (
              <div className="ack">
                <CompanionOrb size={28} state="idle" />
                <span>{ack}</span>
              </div>
            )}
            {err && <p className="err">{err}</p>}
          </section>

          <section className="card">
            <div className="card-h">
              <span className="step">✎</span>
              <h2>Shape how it acts</h2>
            </div>
            <p className="muted small">Quick guidance — applied the next time you chat.</p>
            <div className="chips">
              {FEEDBACK_PRESETS.map((f) => (
                <button key={f} className="chip-feedback" onClick={() => teachFeedback(f)} disabled={busy}>
                  {f}
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {items.length > 0 && (
        <section className="card">
          <div className="card-h">
            <span className="step">🧠</span>
            <h2>What {companion.name} knows</h2>
            <span className="badge">{items.length}</span>
          </div>
          <ul className="knowledge">
            {[...items].reverse().map((it, i) => (
              <li key={i} className={`kitem ${it.kind}`}>
                <span className="kkind">{it.kind === 'fact' ? '✦' : '✎'}</span>
                {it.text}
              </li>
            ))}
          </ul>
          {head && (
            <p className="muted small center">encrypted on 0G · head {head.slice(0, 12)}… · yours</p>
          )}
        </section>
      )}
    </div>
  )
}
