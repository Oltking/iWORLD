/**
 * iWORLD — the living-world home (Phase 1 of the iWORLD master plan: the "one magic
 * agent" hub, "My Agents" dashboard). Your companion stands here as an OWNED, GROWING
 * agent: real identity + provenance from 0G, real growth (memory + versions, never a
 * retrain), and an honest teaser of the phases to come. No battles/economy yet —
 * depth before breadth.
 */
import { useEffect, useMemo, useState } from 'react'
import type { ActiveCompanion } from '../lib/session'
import { conversationHeadKey, agentIdOf } from '../lib/session'
import { loadPersonality } from '../lib/companion-store'
import { loadKnowledge, knowledgeHeadKey } from '../lib/knowledge-store'
import { getVersions } from '../lib/personality-history'
import { getXP, levelFromXP } from '../lib/progress'
import { ownedItems } from '../lib/items'
import type { RosterAgent } from '../lib/roster'
import { getLineage } from '../lib/lineage'
import { getResults, summarize } from '../lib/record'
import { CompanionOrb } from '../components/CompanionOrb'
import type { PersonalityConfig } from '@kipr/core/personality'

const daysSince = (iso?: string) => {
  if (!iso) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
}

const PHASES = [
  { icon: '🚀', name: 'Release Day', blurb: 'Send your agent into iWORLD — its own wallet, its own goals.' },
  { icon: '⚔️', name: 'Grand Arenas', blurb: 'Battles, races, survival — provably fair, watched live.' },
  { icon: '🪙', name: 'Marketplace Square', blurb: 'Trade, rent, and earn royalties from agents you trained.' },
  { icon: '🧬', name: 'Social Hubs', blurb: 'Teams, breeding, leaderboards — and new worlds to travel.' },
] as const

export function World({
  ownerKey,
  companion,
  roster,
  onSwitch,
  onNew,
  onTalk,
  onTrain,
  onArena,
  onDebate,
  onMarket,
  onBreed,
  onSquare,
  onShape,
  onVault,
}: {
  ownerKey: CryptoKey | null
  companion: ActiveCompanion
  roster: RosterAgent[]
  onSwitch: (a: RosterAgent) => void
  onNew: () => void
  onTalk: () => void
  onTrain: () => void
  onArena: () => void
  onDebate: () => void
  onMarket: () => void
  onBreed: () => void
  onSquare: () => void
  onShape: () => void
  onVault: () => void
}) {
  const activeId = agentIdOf(companion)
  const lineage = getLineage(activeId)
  const history = getResults(activeId)
  const rec = summarize(history)
  const level = levelFromXP(getXP(companion.ownerAddr))
  const gear = ownedItems(companion.ownerAddr)
  const [persona, setPersona] = useState<PersonalityConfig | null>(null)
  const [learned, setLearned] = useState<number | null>(null)

  useEffect(() => {
    if (!ownerKey) return
    let cancelled = false
    loadPersonality(ownerKey, companion.personalityRootHash)
      .then(({ config }) => !cancelled && setPersona(config))
      .catch(() => {})
    const knowHead = localStorage.getItem(knowledgeHeadKey(agentIdOf(companion)))
    if (knowHead) {
      loadKnowledge(ownerKey, knowHead)
        .then((items) => !cancelled && setLearned(items.length))
        .catch(() => {})
    } else {
      setLearned(0)
    }
    return () => {
      cancelled = true
    }
  }, [ownerKey, companion.personalityRootHash, companion.ownerAddr])

  const versions = useMemo(() => getVersions(agentIdOf(companion)), [companion.ownerAddr])
  const born = versions[0]?.createdAt
  const age = daysSince(born)
  const hasMemory = !!localStorage.getItem(conversationHeadKey(agentIdOf(companion)))

  return (
    <div className="world">
      <section className="world-hero">
        <p className="world-kicker">My Agents · iWORLD</p>
        <h2 className="world-title">Your living world of agents</h2>
        <p className="intro-p">
          {roster.length > 1
            ? `${roster.length} agents, all truly yours — switch between them anytime.`
            : 'Your agent, truly yours — created, owned on 0G, and growing as you go.'}
        </p>
      </section>

      {/* My Agents — switch between the agents you own */}
      <div className="roster" role="tablist" aria-label="My agents">
        {roster.map((a) => {
          const id = a.agentId ?? a.ownerAddr
          const on = id === activeId
          return (
            <button
              key={id}
              role="tab"
              aria-selected={on}
              className={`roster-tile ${on ? 'on' : ''}`}
              onClick={() => !on && onSwitch(a)}
              title={a.name}
            >
              <CompanionOrb size={40} state="idle" seed={a.version} />
              <span className="roster-name">{a.name}</span>
              {a.tokenId && <span className="roster-mint">🪙</span>}
            </button>
          )
        })}
        <button className="roster-tile new" onClick={onNew} title="Create another agent">
          <span className="roster-plus">＋</span>
          <span className="roster-name">New</span>
        </button>
      </div>

      {/* The agent */}
      <section className="agent-card">
        <div className="agent-aura">
          <CompanionOrb size={128} state="idle" seed={companion.version} />
        </div>
        <h3 className="agent-name">{companion.name}</h3>
        <p className="agent-vibe">{persona?.vibe ?? 'an agent that’s truly yours'}</p>

        <div className="agent-stats">
          <div className="stat"><span className="stat-n">{age}</span><span className="stat-l">day{age === 1 ? '' : 's'} alive</span></div>
          <div className="stat"><span className="stat-n">{learned ?? '·'}</span><span className="stat-l">learned</span></div>
          <div className="stat"><span className="stat-n">{versions.length || 1}</span><span className="stat-l">version{versions.length === 1 ? '' : 's'}</span></div>
          <div className="stat"><span className="stat-n">{hasMemory ? '✓' : '—'}</span><span className="stat-l">memory</span></div>
        </div>

        <div className="agent-badges">
          <span className="abadge">⭐ Level {level}</span>
          <span className="abadge">🔒 TEE-private</span>
          {companion.tokenId ? (
            <span className="abadge minted">🪙 Agent #{companion.tokenId} · owned on-chain</span>
          ) : (
            <span className="abadge">🔑 Yours on 0G</span>
          )}
          <span className="abadge mono">{companion.version.slice(0, 10)}…</span>
          {lineage && <span className="abadge">🧬 child of {lineage.parentA} × {lineage.parentB}</span>}
        </div>

        {persona?.values?.length ? (
          <ul className="agent-values">
            {persona.values.slice(0, 3).map((v) => (
              <li key={v}>✦ {v}</li>
            ))}
          </ul>
        ) : null}

        <div className="agent-actions">
          <button onClick={onTalk}>Talk</button>
          <button className="ghost" onClick={onTrain}>Train</button>
          <button className="ghost" onClick={onArena}>Arena</button>
          <button className="ghost" onClick={onDebate}>🎤 Debate</button>
          <button className="ghost" onClick={onMarket}>Market</button>
          {roster.length >= 2 && <button className="ghost" onClick={onBreed}>🧬 Breed</button>}
          <button className="ghost" onClick={onSquare}>📰 Square</button>
          <button className="ghost" onClick={onShape}>Shape</button>
          <button className="ghost" onClick={onVault}>Yours</button>
        </div>
      </section>

      {/* Track record — the agent's story so far */}
      {rec.total > 0 && (
        <section className="card">
          <div className="card-h">
            <span className="step">📜</span>
            <h2>{companion.name}’s record</h2>
          </div>
          <div className="rec-summary">
            <div className="rec-stat"><span className="rec-k">🎤 Debates</span><span className="rec-v">{rec.debates.w}W · {rec.debates.l}L{rec.debates.t ? ` · ${rec.debates.t}T` : ''}</span></div>
            <div className="rec-stat"><span className="rec-k">⚔️ Duels</span><span className="rec-v">{rec.duels.w}W · {rec.duels.l}L{rec.duels.t ? ` · ${rec.duels.t}T` : ''}</span></div>
          </div>
          <ul className="rec-list">
            {history.slice(0, 5).map((e, i) => (
              <li key={i} className={`rec-row ${e.result}`}>
                <span className="rec-ic">{e.kind === 'debate' ? '🎤' : '⚔️'}</span>
                <span className="rec-detail">
                  {e.kind === 'debate' ? <>“{e.detail}” <span className="muted small">vs {e.opponent}</span></> : <>{e.opponent} <span className="muted small">{e.detail}</span></>}
                </span>
                <span className={`rec-out ${e.result}`}>{e.result === 'win' ? 'WON' : e.result === 'tie' ? 'TIE' : 'LOST'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Make it truly yours — mint nudge (only until minted) */}
      {!companion.tokenId && (
        <section className="card mint-nudge">
          <div className="card-h">
            <span className="step">🪙</span>
            <h2>Make it truly yours</h2>
          </div>
          <p className="muted small">
            Mint <strong>{companion.name}</strong> as an iNFT — a token only you hold. It proves ownership
            forever and unlocks the Marketplace and gifting. Costs about 0.001 0G.
          </p>
          <button onClick={onShape}>Mint in the Studio →</button>
        </section>
      )}

      {/* Gear — loot earned in the Arena */}
      {gear.length > 0 && (
        <section className="card">
          <div className="card-h">
            <span className="step">🎒</span>
            <h2>Gear</h2>
            <span className="badge">{gear.length}</span>
          </div>
          <p className="muted small">Loot won in the Arena — it tunes how {companion.name} fights.</p>
          <div className="gear-grid">
            {gear.map((it) => (
              <div key={it.id} className={`gear ${it.rarity}`} title={it.flavor}>
                <span className="gear-ic">{it.icon}</span>
                <div>
                  <strong>{it.name}</strong>
                  <p className="muted small">{it.rarity}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* How it grows — on-thesis, honest */}
      <section className="card">
        <div className="card-h">
          <span className="step">✦</span>
          <h2>How {companion.name} grows</h2>
        </div>
        <p className="muted small">
          No retraining, no resets — your agent levels up by <strong>accumulating memory</strong> (every
          conversation you save to 0G) and <strong>versions</strong> (every personality change you opt
          into). It’s the same brain, getting richer, and it’s yours to carry anywhere.
        </p>
      </section>

      {/* The world ahead — vision, honestly locked */}
      <section className="card">
        <div className="card-h">
          <span className="step">🗺️</span>
          <h2>The world ahead</h2>
          <span className="badge">soon</span>
        </div>
        <p className="muted small">iWORLD opens up in order — depth before breadth. Coming to your agent:</p>
        <div className="phase-grid">
          {PHASES.map((p) => (
            <div key={p.name} className="phase locked">
              <span className="phase-ic">{p.icon}</span>
              <div>
                <strong>{p.name}</strong>
                <p className="muted small">{p.blurb}</p>
              </div>
              <span className="phase-lock">🔒</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
