/**
 * iWORLD — the living-world home (Phase 1 of the iWORLD master plan: the "one magic
 * agent" hub, "My Agents" dashboard). Your companion stands here as an OWNED, GROWING
 * agent: real identity + provenance from 0G, real growth (memory + versions, never a
 * retrain), and an honest teaser of the phases to come. No battles/economy yet —
 * depth before breadth.
 */
import { useEffect, useMemo, useState } from 'react'
import type { ActiveCompanion } from '../lib/session'
import { conversationHeadKey } from '../lib/session'
import { loadPersonality } from '../lib/companion-store'
import { loadKnowledge, knowledgeHeadKey } from '../lib/knowledge-store'
import { getVersions } from '../lib/personality-history'
import { getXP, levelFromXP } from '../lib/progress'
import { ownedItems } from '../lib/items'
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
  onTalk,
  onTrain,
  onArena,
  onMarket,
  onShape,
  onVault,
}: {
  ownerKey: CryptoKey | null
  companion: ActiveCompanion
  onTalk: () => void
  onTrain: () => void
  onArena: () => void
  onMarket: () => void
  onShape: () => void
  onVault: () => void
}) {
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
    const knowHead = localStorage.getItem(knowledgeHeadKey(companion.ownerAddr))
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

  const versions = useMemo(() => getVersions(companion.ownerAddr), [companion.ownerAddr])
  const born = versions[0]?.createdAt
  const age = daysSince(born)
  const hasMemory = !!localStorage.getItem(conversationHeadKey(companion.ownerAddr))

  return (
    <div className="world">
      <section className="world-hero">
        <p className="world-kicker">My Agents · iWORLD</p>
        <h2 className="world-title">Your living world of agents</h2>
        <p className="intro-p">One agent, truly yours — created, owned on 0G, and growing as you go.</p>
      </section>

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
          <button className="ghost" onClick={onMarket}>Market</button>
          <button className="ghost" onClick={onShape}>Shape</button>
          <button className="ghost" onClick={onVault}>Yours</button>
        </div>
      </section>

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
