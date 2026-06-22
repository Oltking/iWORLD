/**
 * Debate Arena — your agent argues a motion with its real personality (live TEE
 * inference), a neutral judge scores it, and the verdict can be anchored on-chain.
 */
import { useEffect, useState } from 'react'
import type { Connection } from '../lib/wallet'
import type { ActiveCompanion } from '../lib/session'
import { loadPersonality } from '../lib/companion-store'
import { relayConfigured } from '../lib/compute-relay'
import {
  runDebate,
  randomMotion,
  MOTIONS,
  DEBATE_OPPONENTS,
  type DebateOpponent,
  type DebateLine,
  type Verdict,
} from '../lib/debate'
import { arenaLogConfigured, anchorMatch, type MatchResult } from '../lib/arena-log'
import { addXP, getXP, levelFromXP } from '../lib/progress'
import { toast, humanizeError } from '../lib/toast'
import { celebrate } from '../lib/celebrate'
import { CompanionOrb } from '../components/CompanionOrb'
import type { PersonalityConfig } from '@kipr/core/personality'
import type { Status } from '../components/Dot'

export function Debate({ conn, ownerKey, companion }: { conn: Connection; ownerKey: CryptoKey | null; companion: ActiveCompanion }) {
  const [config, setConfig] = useState<PersonalityConfig | null>(null)
  const [motion, setMotion] = useState<string>(randomMotion)
  const [opp, setOpp] = useState<DebateOpponent>(DEBATE_OPPONENTS[0])
  const [lines, setLines] = useState<DebateLine[]>([])
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [running, setRunning] = useState(false)
  const [waitingFor, setWaitingFor] = useState<string>('')
  const [transcriptHash, setTranscriptHash] = useState<string>('')
  const [anchorStatus, setAnchorStatus] = useState<Status>('idle')
  const [anchored, setAnchored] = useState(false)
  const [xp, setXp] = useState(() => getXP(companion.ownerAddr))

  useEffect(() => {
    if (!ownerKey) return
    loadPersonality(ownerKey, companion.personalityRootHash)
      .then(({ config }) => setConfig(config))
      .catch(() => {})
  }, [ownerKey, companion.personalityRootHash])

  async function start() {
    if (!config) return
    setRunning(true)
    setLines([])
    setVerdict(null)
    setAnchored(false)
    setAnchorStatus('idle')
    setTranscriptHash('')
    setWaitingFor(companion.name)
    try {
      let pushed = 0
      const res = await runDebate(conn.signer, { name: companion.name, config }, opp, motion, (line) => {
        setLines((ls) => [...ls, line])
        pushed += 1
        // who speaks next: 1→opp, 2→me, 3→opp, 4→judge
        setWaitingFor(pushed >= 4 ? 'the judge' : pushed % 2 === 1 ? opp.name : companion.name)
      })
      setVerdict(res.verdict)
      setTranscriptHash(res.transcriptHash)
      setWaitingFor('')
      if (res.verdict.winner === 'you') {
        const gained = 12
        setXp(addXP(companion.ownerAddr, gained))
        celebrate()
        toast.success(`${companion.name} won the debate! +${gained} XP 🎤`)
      } else if (res.verdict.winner === 'tie') {
        setXp(addXP(companion.ownerAddr, 6))
        toast.info('A dead heat — the judge called it a tie.')
      } else {
        setXp(addXP(companion.ownerAddr, 4))
        toast.info(`${opp.name} took this one. +4 XP for showing up.`)
      }
    } catch (e) {
      toast.error(humanizeError(e))
      setWaitingFor('')
    } finally {
      setRunning(false)
    }
  }

  async function anchor() {
    if (!verdict || !transcriptHash) return
    setAnchorStatus('busy')
    try {
      const r: MatchResult = verdict.winner === 'you' ? 1 : verdict.winner === 'tie' ? 2 : 0
      await anchorMatch(conn.signer, `Debate vs ${opp.name}`, transcriptHash, r)
      setAnchored(true)
      setAnchorStatus('ok')
      toast.success('Verdict anchored on-chain ⛓️')
    } catch (e) {
      setAnchorStatus('error')
      toast.error(humanizeError(e))
    }
  }

  const level = levelFromXP(xp)

  if (!relayConfigured()) {
    return (
      <div className="debate">
        <section className="intro">
          <p className="world-kicker">Debate Arena 🎤</p>
          <h2 className="intro-h">Live thinking required</h2>
          <p className="intro-p">
            Debates use real TEE inference. Turn on shared chat (run the relay / set the compute relay URL)
            and your agent can step into the ring.
          </p>
        </section>
      </div>
    )
  }

  return (
    <div className="debate">
      <section className="intro">
        <p className="world-kicker">Debate Arena 🎤</p>
        <h2 className="intro-h">Argue, judged for real</h2>
        <p className="intro-p">
          {companion.name} debates with its own character — live, private inference. A neutral judge scores
          both sides; the verdict can be anchored on-chain.
        </p>
        <div className="lvl"><span className="lvl-badge">⭐ Level {level}</span><span className="muted small">{xp} XP</span></div>
      </section>

      {/* setup */}
      <section className="card">
        <label className="lbl">The motion</label>
        <textarea className="inp ta" rows={2} value={motion} onChange={(e) => setMotion(e.target.value)} disabled={running} />
        <div className="memrow" style={{ marginTop: 6 }}>
          <button className="ghost" onClick={() => setMotion(randomMotion())} disabled={running} style={{ width: 'auto', padding: '7px 14px' }}>🎲 Shuffle</button>
          <select className="inp" value={motion} onChange={(e) => setMotion(e.target.value)} disabled={running} style={{ flex: 1 }}>
            {MOTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <label className="lbl" style={{ marginTop: 12 }}>Opponent</label>
        <div className="debate-opps">
          {DEBATE_OPPONENTS.map((o) => (
            <button key={o.id} className={`debate-opp ${opp.id === o.id ? 'on' : ''}`} onClick={() => setOpp(o)} disabled={running}>
              <span className="debate-opp-ic">{o.icon}</span>
              <strong>{o.name}</strong>
              <span className="muted small">{o.persona.split(' who ')[1] ?? o.persona}</span>
            </button>
          ))}
        </div>

        <button onClick={start} disabled={running || !config || !motion.trim()} style={{ marginTop: 14 }}>
          {running ? 'In the ring…' : config ? `Send ${companion.name} to debate` : 'Loading character…'}
        </button>
      </section>

      {/* the debate */}
      {(lines.length > 0 || running) && (
        <section className="card">
          <div className="debate-motion">“{motion}”</div>
          <div className="debate-thread">
            {lines.map((l, i) => (
              <div key={i} className={`debate-line ${l.side === 'for' ? 'mine' : 'theirs'}`}>
                <div className="debate-who">
                  <CompanionOrb size={28} state="idle" seed={l.side === 'for' ? companion.version : opp.id} />
                  <strong>{l.speaker}</strong>
                  <span className="debate-side">{l.side === 'for' ? 'FOR' : 'AGAINST'}</span>
                </div>
                <p className="debate-text">{l.text}</p>
              </div>
            ))}
            {running && waitingFor && (
              <p className="muted small center">{waitingFor} is thinking…</p>
            )}
          </div>

          {verdict && (
            <div className={`debate-verdict ${verdict.winner}`}>
              <div className="debate-scores">
                <span>{companion.name} <strong>{verdict.you}</strong></span>
                <span className="debate-vs">⚖️</span>
                <span><strong>{verdict.opp}</strong> {opp.name}</span>
              </div>
              <p className="debate-call">
                {verdict.winner === 'you' ? `🏆 ${companion.name} wins!` : verdict.winner === 'tie' ? '⚖️ A tie.' : `${opp.name} wins.`}
              </p>
              <p className="muted small">“{verdict.reason}”</p>
              {arenaLogConfigured() && (
                <button className="ghost" onClick={anchor} disabled={anchorStatus === 'busy' || anchored} style={{ marginTop: 8 }}>
                  {anchorStatus === 'busy' ? 'Anchoring…' : anchored ? 'Verdict anchored ⛓️' : 'Anchor verdict on-chain'}
                </button>
              )}
              <p className="muted small center mono">{transcriptHash.slice(0, 18)}…</p>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
