/**
 * Grand Arenas (slice #3 + ladder) — your agent climbs a ladder of default champion
 * agents that are always present to duel (no second human needed). Each duel is a
 * fair, deterministic, auditable best-of-5 (see lib/arena); beat champions above you
 * and you rise past them on the leaderboard. Play-money XP only.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Connection } from '../lib/wallet'
import type { ActiveCompanion } from '../lib/session'
import { agentIdOf } from '../lib/session'
import { addResult } from '../lib/record'
import { runDuel, styleFromText, TACTIC_ICON, type Fighter, type MatchResult } from '../lib/arena'
import { champions, type Champion } from '../lib/champions'
import { loadPersonality } from '../lib/companion-store'
import { addXP, getXP, levelFromXP } from '../lib/progress'
import { ownedStyleBoost, ownedXpBonus, rollDrop, addItem, type Item } from '../lib/items'
import { encryptOwned } from '../lib/crypto'
import { uploadBytes } from '../lib/storage'
import { arenaLogConfigured, anchorMatch, getRecord, fetchLeaderboard, type RankRow, type MatchResult as ChainResult } from '../lib/arena-log'
import { toast, humanizeError } from '../lib/toast'
import { CompanionOrb } from '../components/CompanionOrb'
import { CopyButton } from '../components/CopyButton'
import { OG_TESTNET } from '../lib/og'
import type { Status } from '../components/Dot'

const ROSTER = champions()

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
  const [opponent, setOpponent] = useState<Champion | null>(null)
  const [result, setResult] = useState<MatchResult | null>(null)
  const [shown, setShown] = useState(0)
  const [fighting, setFighting] = useState(false)
  const [xp, setXp] = useState(() => getXP(companion.ownerAddr))
  const [matchXp, setMatchXp] = useState(0)
  const [drop, setDrop] = useState<Item | null>(null)
  const [saveStatus, setSaveStatus] = useState<Status>('idle')
  const [savedRoot, setSavedRoot] = useState<string | null>(null)
  const [saveErr, setSaveErr] = useState('')
  const [anchorStatus, setAnchorStatus] = useState<Status>('idle')
  const [anchored, setAnchored] = useState(false)
  const [record, setRecord] = useState<{ matches: number; wins: number } | null>(null)
  const [hof, setHof] = useState<RankRow[] | null>(null)
  const timers = useRef<number[]>([])

  const loadRecord = useCallback(() => {
    if (!arenaLogConfigured()) return
    getRecord(conn.provider, conn.address).then(setRecord).catch(() => {})
    fetchLeaderboard(conn.provider).then(setHof).catch(() => setHof([]))
  }, [conn])
  useEffect(() => loadRecord(), [loadRecord])

  useEffect(() => {
    if (!ownerKey) return
    loadPersonality(ownerKey, companion.personalityRootHash)
      .then(({ config }) => setStyleText(`${config.vibe} ${config.values.join(' ')}`))
      .catch(() => {})
  }, [ownerKey, companion.personalityRootHash])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const myLevel = levelFromXP(xp)

  function fight(champ: Champion) {
    timers.current.forEach(clearTimeout)
    const owner = companion.ownerAddr
    const seed = `${companion.version}:${champ.id}:${Date.now()}:${Math.floor(Math.random() * 1e9)}`

    // The agent's character + its owned gear shape its fighting style.
    const style = { ...styleFromText(styleText || companion.name) }
    const boost = ownedStyleBoost(owner)
    for (const k of Object.keys(boost) as (keyof typeof style)[]) style[k] += boost[k] ?? 0
    const me: Fighter = { name: companion.name, style }
    const res = runDuel(me, champ, seed)

    const baseXp = res.winner === 'a' ? 14 + champ.level * 3 : res.winner === 'draw' ? 8 + champ.level : 4

    setOpponent(champ)
    setResult(res)
    setShown(0)
    setFighting(true)
    setSavedRoot(null)
    setSaveErr('')
    setDrop(null)
    setAnchored(false)
    setAnchorStatus('idle')

    addResult(agentIdOf(companion), {
      kind: 'duel',
      opponent: `${champ.name} ${champ.title}`,
      result: res.winner === 'a' ? 'win' : res.winner === 'draw' ? 'tie' : 'loss',
      detail: `Lv ${champ.level}`,
      at: new Date().toISOString(),
      hash: res.transcriptHash,
    })

    res.rounds.forEach((_, i) => {
      timers.current.push(window.setTimeout(() => setShown(i + 1), (i + 1) * 800))
    })
    timers.current.push(
      window.setTimeout(() => {
        setFighting(false)
        let earned = Math.round(baseXp * (1 + ownedXpBonus(owner)))
        if (res.winner === 'a') {
          const loot = rollDrop(champ.level)
          if (loot) {
            if (addItem(owner, loot.id) === 'new') setDrop(loot)
            else earned += 8 // duplicate → bonus XP
          }
        }
        setMatchXp(earned)
        setXp(addXP(owner, earned))
      }, res.rounds.length * 800 + 300),
    )
  }

  async function saveMatch() {
    if (!ownerKey || !result || !opponent) return
    setSaveStatus('busy')
    setSaveErr('')
    try {
      const transcript = JSON.stringify({
        kind: 'kipr.match.v1',
        agent: companion.name,
        rival: `${opponent.name} ${opponent.title}`,
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
      setSaveErr(humanizeError(e))
      setSaveStatus('error')
    }
  }

  async function anchorOnChain() {
    if (!result || !opponent) return
    setAnchorStatus('busy')
    try {
      const r: ChainResult = result.winner === 'a' ? 1 : result.winner === 'draw' ? 2 : 0
      await anchorMatch(conn.signer, `${opponent.name} ${opponent.title}`, result.transcriptHash, r)
      setAnchored(true)
      setAnchorStatus('ok')
      toast.success('Match anchored on-chain ⛓️')
      loadRecord()
    } catch (e) {
      setAnchorStatus('error')
      toast.error(humanizeError(e))
    }
  }

  const done = result && !fighting
  const won = result?.winner === 'a'
  const draw = result?.winner === 'draw'

  // Leaderboard: champions + you, ranked by level.
  const board = [
    ...ROSTER.map((c) => ({ kind: 'champ' as const, id: c.id, name: `${c.name} ${c.title}`, level: c.level, icon: c.icon, champ: c })),
    { kind: 'you' as const, id: 'you', name: companion.name, level: myLevel, icon: '⭐', champ: null },
  ].sort((a, b) => b.level - a.level)

  return (
    <div className="arena">
      <section className="intro">
        <p className="world-kicker">Grand Arenas</p>
        <h2 className="intro-h">Climb the ladder</h2>
        <p className="intro-p">
          Challenge the champions — always here to test you. Best of five, hidden tactics, your agent’s
          character in the fight. Beat those above you and rise. Provably fair, play-money only.
        </p>
        <div className="lvl">
          <span className="lvl-badge">⭐ Level {myLevel}</span>
          <span className="muted small">{xp} XP</span>
          {record && record.matches > 0 && (
            <span className="lvl-badge" title="Your provable record, anchored on-chain">⛓️ {record.wins}W / {record.matches} on-chain</span>
          )}
        </div>
      </section>

      {/* active duel */}
      {opponent && result && (
        <>
          <section className="card matchup">
            <div className="fighter">
              <CompanionOrb size={60} state={fighting ? 'thinking' : 'idle'} seed={companion.version} />
              <strong>{companion.name}</strong>
              <span className="score">{result.aScore}</span>
            </div>
            <span className="vs">VS</span>
            <div className="fighter">
              <CompanionOrb size={60} state={fighting ? 'thinking' : 'idle'} seed={opponent.id} />
              <strong>{opponent.icon} {opponent.name}</strong>
              <span className="muted small">Lv {opponent.level}</span>
              <span className="score">{result.bScore}</span>
            </div>
          </section>

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
              <>
                <div className={`result ${won ? 'won' : draw ? 'draw' : 'lost'}`}>
                  {won ? `🏆 ${companion.name} beats ${opponent.name}! +${matchXp} XP` : draw ? `⚖️ A draw with ${opponent.name}. +${matchXp} XP` : `💪 ${opponent.name} held. +${matchXp} XP`}
                </div>
                {drop && (
                  <div className={`loot-drop ${drop.rarity}`}>
                    <span className="loot-ic">{drop.icon}</span>
                    <div>
                      <strong>Loot! {drop.name}</strong>
                      <p className="muted small">{drop.rarity} · {drop.flavor}</p>
                    </div>
                  </div>
                )}
                <div className="memrow">
                  {ownerKey && (
                    <button className="ghost" onClick={saveMatch} disabled={saveStatus === 'busy' || !!savedRoot}>
                      {saveStatus === 'busy' ? 'Recording…' : savedRoot ? 'Recorded ✓' : 'Record on 0G'}
                    </button>
                  )}
                  {arenaLogConfigured() && (
                    <button className="ghost" onClick={anchorOnChain} disabled={anchorStatus === 'busy' || anchored} title="Commit the result hash on-chain">
                      {anchorStatus === 'busy' ? 'Anchoring…' : anchored ? 'Anchored ⛓️' : 'Anchor on-chain'}
                    </button>
                  )}
                </div>
                <p className="muted small center">
                  provably fair · <span className="mono hash">{result.transcriptHash.slice(0, 16)}…</span>
                  {savedRoot && <> · on 0G <a className="mono" href={OG_TESTNET.explorer} target="_blank" rel="noreferrer">{savedRoot.slice(0, 12)}…</a></>}
                </p>
                {saveErr && <p className="err">{saveErr}</p>}
              </>
            )}
          </section>
        </>
      )}

      {/* the ladder / leaderboard */}
      <section className="card">
        <div className="card-h">
          <span className="step">🏆</span>
          <h2>The Ladder</h2>
        </div>
        <ol className="ladder">
          {board.map((row, i) => (
            <li key={row.id} className={`lrow ${row.kind === 'you' ? 'you' : ''}`}>
              <span className="lrank">#{i + 1}</span>
              <span className="lic">{row.icon}</span>
              <span className="lname">{row.name}{row.kind === 'you' && <span className="lyou"> · you</span>}</span>
              <span className="llvl">Lv {row.level}</span>
              {row.kind === 'champ' ? (
                <button className="ghost lduel" onClick={() => fight(row.champ!)} disabled={fighting}>Duel</button>
              ) : (
                <span className="lduel-spacer" />
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* Hall of Fame — global, on-chain records (arena + debate verdicts) */}
      {arenaLogConfigured() && hof && hof.length > 0 && (
        <section className="card">
          <div className="card-h">
            <span className="step">👑</span>
            <h2>Hall of Fame</h2>
            <span className="muted small" style={{ marginLeft: 'auto' }}>on-chain · global</span>
          </div>
          <p className="muted small">Top records anchored on-chain — arena duels and debate verdicts combined.</p>
          <ol className="ladder">
            {hof.map((r, i) => {
              const me = r.addr === conn.address.toLowerCase()
              return (
                <li key={r.addr} className={`lrow ${me ? 'you' : ''}`}>
                  <span className="lrank">{i === 0 ? '👑' : `#${i + 1}`}</span>
                  <span className="lname mono">{r.addr.slice(0, 6)}…{r.addr.slice(-4)}<CopyButton text={r.addr} label="Copy address" />{me && <span className="lyou"> · you</span>}</span>
                  <span className="llvl">{r.wins}W / {r.matches}</span>
                  <span className="lduel-spacer" />
                </li>
              )
            })}
          </ol>
        </section>
      )}
    </div>
  )
}
