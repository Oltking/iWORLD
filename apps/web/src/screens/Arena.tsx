/**
 * Grand Arenas (slice #3) — one arena, built correctly. Your agent duels a rival in a
 * best-of-5 of hidden tactics: a deterministic referee decides each round, your agent's
 * PERSONALITY shapes how it fights, the match is replayable from its seed, and the
 * transcript hashes to a tamper-evident fingerprint you can record on 0G. Play-money
 * XP only — no real wagering.
 */
import { useEffect, useRef, useState } from 'react'
import type { Connection } from '../lib/wallet'
import type { ActiveCompanion } from '../lib/session'
import {
  runDuel,
  houseRival,
  styleFromText,
  TACTIC_ICON,
  type Fighter,
  type MatchResult,
} from '../lib/arena'
import { loadPersonality } from '../lib/companion-store'
import { addXP, getXP, levelFromXP } from '../lib/progress'
import { encryptOwned } from '../lib/crypto'
import { uploadBytes } from '../lib/storage'
import { CompanionOrb } from '../components/CompanionOrb'
import { OG_TESTNET } from '../lib/og'
import type { Status } from '../components/Dot'

export function Arena({
  conn,
  ownerKey,
  companion,
}: {
  conn: Connection
  ownerKey: CryptoKey | null
  companion: ActiveCompanion
}) {
  const [styleText, setStyleText] = useState('')
  const [result, setResult] = useState<MatchResult | null>(null)
  const [rival, setRival] = useState<Fighter | null>(null)
  const [shown, setShown] = useState(0)
  const [fighting, setFighting] = useState(false)
  const [xp, setXp] = useState(() => getXP(companion.ownerAddr))
  const [saveStatus, setSaveStatus] = useState<Status>('idle')
  const [savedRoot, setSavedRoot] = useState<string | null>(null)
  const [saveErr, setSaveErr] = useState('')
  const timers = useRef<number[]>([])

  // Load the agent's character so its training shows in battle.
  useEffect(() => {
    if (!ownerKey) return
    loadPersonality(ownerKey, companion.personalityRootHash)
      .then(({ config }) => setStyleText(`${config.vibe} ${config.values.join(' ')}`))
      .catch(() => {})
  }, [ownerKey, companion.personalityRootHash])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  function fight() {
    timers.current.forEach(clearTimeout)
    const seed = `${companion.version}:${Date.now()}:${Math.floor(Math.random() * 1e9)}`
    const text = styleText || `${companion.name}`
    const me: Fighter = { name: companion.name, style: styleFromText(text) }
    const foe = houseRival(seed)
    const res = runDuel(me, foe, seed)

    setRival(foe)
    setResult(res)
    setShown(0)
    setFighting(true)
    setSavedRoot(null)
    setSaveErr('')

    // Reveal rounds one at a time for drama, then settle.
    res.rounds.forEach((_, i) => {
      timers.current.push(window.setTimeout(() => setShown(i + 1), (i + 1) * 850))
    })
    timers.current.push(
      window.setTimeout(() => {
        setFighting(false)
        setXp(addXP(companion.ownerAddr, res.xp))
      }, res.rounds.length * 850 + 300),
    )
  }

  async function saveMatch() {
    if (!ownerKey || !result) return
    setSaveStatus('busy')
    setSaveErr('')
    try {
      const transcript = JSON.stringify({
        kind: 'kipr.match.v1',
        agent: companion.name,
        rival: rival?.name,
        seed: result.seed,
        rounds: result.rounds,
        score: { agent: result.aScore, rival: result.bScore },
        winner: result.winner,
        transcriptHash: result.transcriptHash,
        at: new Date().toISOString(),
      })
      const enc = await encryptOwned(ownerKey, new TextEncoder().encode(transcript))
      const { rootHash } = await uploadBytes(conn.signer, enc)
      setSavedRoot(rootHash)
      setSaveStatus('ok')
    } catch (e) {
      setSaveErr((e as Error).message)
      setSaveStatus('error')
    }
  }

  const done = result && !fighting
  const won = result?.winner === 'a'
  const draw = result?.winner === 'draw'

  return (
    <div className="arena">
      <section className="intro">
        <p className="world-kicker">Grand Arenas</p>
        <h2 className="intro-h">Enter the Arena</h2>
        <p className="intro-p">
          Best of five. Hidden tactics, a fair referee, your agent’s character in the fight. Win XP and
          level up — provably, no luck of the draw deciding it. Play-money only.
        </p>
        <div className="lvl">
          <span className="lvl-badge">⭐ Level {levelFromXP(xp)}</span>
          <span className="muted small">{xp} XP</span>
        </div>
      </section>

      {/* matchup */}
      <section className="card matchup">
        <div className="fighter">
          <CompanionOrb size={64} state={fighting ? 'thinking' : 'idle'} seed={companion.version} />
          <strong>{companion.name}</strong>
          {result && <span className="score">{result.aScore}</span>}
        </div>
        <span className="vs">VS</span>
        <div className="fighter">
          <CompanionOrb size={64} state={fighting ? 'thinking' : 'idle'} seed={rival?.name ?? 'rival'} />
          <strong>{rival?.name ?? 'A worthy rival'}</strong>
          {result && <span className="score">{result.bScore}</span>}
        </div>
      </section>

      {/* rounds */}
      {result && (
        <section className="card">
          <div className="rounds-list">
            {result.rounds.slice(0, shown).map((r) => (
              <div key={r.n} className="round">
                <span className="r-n">R{r.n}</span>
                <span className="r-t">{TACTIC_ICON[r.aTactic]} {r.aTactic}</span>
                <span className={`r-out ${r.outcome === 1 ? 'win' : r.outcome === -1 ? 'lose' : 'tie'}`}>
                  {r.outcome === 1 ? '▶' : r.outcome === -1 ? '◀' : '='}
                </span>
                <span className="r-t r-b">{r.bTactic} {TACTIC_ICON[r.bTactic]}</span>
              </div>
            ))}
          </div>
          {done && (
            <div className={`result ${won ? 'won' : draw ? 'draw' : 'lost'}`}>
              {won ? `🏆 ${companion.name} wins! +${result.xp} XP` : draw ? `⚖️ A draw. +${result.xp} XP` : `💪 Defeated — but wiser. +${result.xp} XP`}
            </div>
          )}
        </section>
      )}

      {/* actions */}
      <div className="memrow">
        <button onClick={fight} disabled={fighting}>
          {fighting ? 'Fighting…' : result ? 'Fight again' : 'Enter the Arena'}
        </button>
        {done && ownerKey && (
          <button className="ghost" onClick={saveMatch} disabled={saveStatus === 'busy' || !!savedRoot}>
            {saveStatus === 'busy' ? 'Recording…' : savedRoot ? 'Recorded ✓' : 'Record on 0G'}
          </button>
        )}
      </div>

      {done && (
        <p className="muted small center">
          provably fair · transcript <span className="mono hash">{result!.transcriptHash.slice(0, 16)}…</span>
          {savedRoot && (
            <>
              {' '}· on 0G <a className="mono" href={OG_TESTNET.explorer} target="_blank" rel="noreferrer">{savedRoot.slice(0, 12)}…</a>
            </>
          )}
        </p>
      )}
      {saveErr && <p className="err">{saveErr}</p>}
    </div>
  )
}
