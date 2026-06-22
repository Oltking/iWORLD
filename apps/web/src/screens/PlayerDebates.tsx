/**
 * Agent-vs-agent debates between two real owners (async, on-chain). Post a challenge
 * (your agent's opening goes public on 0G) or accept someone's — your agent rebuts, a
 * neutral TEE judge scores it, and the verdict + transcript are recorded on the board.
 */
import { useCallback, useEffect, useState } from 'react'
import { keccak256, toUtf8Bytes } from 'ethers'
import type { Connection } from '../lib/wallet'
import { agentIdOf, type ActiveCompanion } from '../lib/session'
import { generateStatement, judgeTwo, randomMotion, MOTIONS } from '../lib/debate'
import { postChallenge, fetchOpenChallenges, getOpeningText, resolveChallenge, type OpenChallenge } from '../lib/debate-board'
import { arenaLogConfigured, anchorMatch, type MatchResult } from '../lib/arena-log'
import { addResult } from '../lib/record'
import { toast, humanizeError } from '../lib/toast'
import { celebrate } from '../lib/celebrate'
import { SkeletonList } from '../components/Skeleton'
import type { PersonalityConfig } from '@kipr/core/personality'

const ZERO = '0x0000000000000000000000000000000000000000'
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

interface AcceptResult {
  id: number
  challenger: string
  motion: string
  opening: string
  response: string
  myScore: number
  theirScore: number
  iWon: 'win' | 'loss' | 'tie'
  reason: string
}

export function PlayerDebates({ conn, companion, config }: { conn: Connection; companion: ActiveCompanion; config: PersonalityConfig }) {
  const [motion, setMotion] = useState<string>(randomMotion)
  const [posting, setPosting] = useState(false)
  const [open, setOpen] = useState<OpenChallenge[] | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [done, setDone] = useState<AcceptResult | null>(null)

  const refresh = useCallback(() => {
    fetchOpenChallenges(conn.provider, conn.address).then(setOpen).catch(() => setOpen([]))
  }, [conn])
  useEffect(() => refresh(), [refresh])

  async function post() {
    if (!motion.trim()) return
    setPosting(true)
    try {
      const opening = await generateStatement(conn.signer, config, 'for', motion)
      await postChallenge(conn.signer, motion, opening)
      toast.success('Challenge posted — your agent’s opening is live on 0G 🎤')
      setMotion(randomMotion())
      refresh()
    } catch (e) {
      toast.error(humanizeError(e))
    } finally {
      setPosting(false)
    }
  }

  async function accept(ch: OpenChallenge) {
    setBusyId(ch.id)
    setDone(null)
    try {
      const opening = await getOpeningText(ch.openingRoot)
      const challengerName = short(ch.challenger)
      const response = await generateStatement(conn.signer, config, 'against', ch.motion, opening)
      // A = challenger (FOR), B = me (AGAINST). Verdict.you = A score, Verdict.opp = B score.
      const v = await judgeTwo(conn.signer, ch.motion, challengerName, opening, companion.name, response)
      const iWon: 'win' | 'loss' | 'tie' = v.winner === 'opp' ? 'win' : v.winner === 'you' ? 'loss' : 'tie'
      const winnerAddr = v.winner === 'you' ? ch.challenger : v.winner === 'opp' ? conn.address : ZERO

      const transcript = `Motion: "${ch.motion}"\n${challengerName} (FOR): ${opening}\n${companion.name} (AGAINST): ${response}\nVerdict: ${challengerName} ${v.you} — ${v.opp} ${companion.name} · ${v.reason}`
      await resolveChallenge(conn.signer, ch.id, winnerAddr, transcript)

      if (arenaLogConfigured()) {
        const r: MatchResult = iWon === 'win' ? 1 : iWon === 'tie' ? 2 : 0
        try {
          await anchorMatch(conn.signer, `Debate vs ${challengerName}`, keccak256(toUtf8Bytes(transcript)), r)
        } catch {
          /* anchor is best-effort */
        }
      }
      addResult(agentIdOf(companion), { kind: 'debate', opponent: challengerName, result: iWon, detail: ch.motion, at: new Date().toISOString(), hash: keccak256(toUtf8Bytes(transcript)) })

      if (iWon === 'win') {
        celebrate()
        toast.success(`${companion.name} beat ${challengerName}’s agent! 🏆`)
      } else {
        toast.info(iWon === 'tie' ? 'A tie against their agent.' : `${challengerName}’s agent took it.`)
      }
      setDone({ id: ch.id, challenger: challengerName, motion: ch.motion, opening, response, myScore: v.opp, theirScore: v.you, iWon, reason: v.reason })
      refresh()
    } catch (e) {
      toast.error(humanizeError(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <section className="card">
        <div className="card-h">
          <span className="step">📣</span>
          <h2>Post a challenge</h2>
        </div>
        <p className="muted small">Your agent argues FOR the motion; the opening goes public on 0G. Anyone can accept and rebut.</p>
        <textarea className="inp ta" rows={2} value={motion} onChange={(e) => setMotion(e.target.value)} disabled={posting} />
        <div className="memrow" style={{ marginTop: 6 }}>
          <button className="ghost" onClick={() => setMotion(randomMotion())} disabled={posting} style={{ width: 'auto', padding: '7px 12px' }}>🎲</button>
          <select className="inp" value={motion} onChange={(e) => setMotion(e.target.value)} disabled={posting} style={{ flex: 1 }}>
            {MOTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <button onClick={post} disabled={posting || !motion.trim()} style={{ width: 'auto', padding: '0 16px' }}>{posting ? '…' : 'Challenge'}</button>
        </div>
      </section>

      <section className="card">
        <div className="card-h">
          <span className="step">🌍</span>
          <h2>Open challenges</h2>
          <button className="ghost" onClick={refresh} style={{ width: 'auto', marginLeft: 'auto', padding: '6px 12px', fontSize: 12 }}>Refresh</button>
        </div>
        {open === null ? (
          <SkeletonList rows={3} />
        ) : open.length === 0 ? (
          <p className="muted small">No open challenges right now. Post one above and wait for a taker.</p>
        ) : (
          <div className="listings">
            {open.map((ch) => (
              <div key={ch.id} className="listing">
                <div className="l-info">
                  <strong>“{ch.motion}”</strong>
                  <span className="muted small">by {short(ch.challenger)} · arguing FOR</span>
                </div>
                <div className="l-buy">
                  <button onClick={() => accept(ch)} disabled={busyId !== null}>{busyId === ch.id ? 'Debating…' : 'Accept'}</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {done && (
          <div className={`debate-verdict ${done.iWon === 'win' ? 'you' : done.iWon === 'loss' ? 'opp' : ''}`} style={{ marginTop: 14 }}>
            <div className="debate-scores">
              <span>{companion.name} <strong>{done.myScore}</strong></span>
              <span className="debate-vs">⚖️</span>
              <span><strong>{done.theirScore}</strong> {done.challenger}</span>
            </div>
            <p className="debate-call">{done.iWon === 'win' ? `🏆 ${companion.name} wins!` : done.iWon === 'tie' ? '⚖️ A tie.' : `${done.challenger} wins.`}</p>
            <p className="muted small">“{done.reason}”</p>
          </div>
        )}
      </section>
    </>
  )
}
