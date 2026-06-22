/**
 * Breeding — combine two agents you own into a child whose character blends both. The
 * child is born as a brand-new agent (its own memory + version), with lineage recorded.
 */
import { useEffect, useMemo, useState } from 'react'
import type { Connection } from '../lib/wallet'
import { agentIdOf, type ActiveCompanion } from '../lib/session'
import type { RosterAgent } from '../lib/roster'
import { genAgentId } from '../lib/roster'
import { loadPersonality, persistPersonality } from '../lib/companion-store'
import { breedConfig, suggestChildName } from '../lib/breed'
import { setLineage } from '../lib/lineage'
import { celebrate } from '../lib/celebrate'
import { toast, humanizeError } from '../lib/toast'
import { CompanionOrb } from '../components/CompanionOrb'
import type { PersonalityConfig } from '@kipr/core/personality'
import type { Status } from '../components/Dot'

export function Breed({
  conn,
  ownerKey,
  companion,
  roster,
  onBorn,
}: {
  conn: Connection
  ownerKey: CryptoKey | null
  companion: ActiveCompanion
  roster: RosterAgent[]
  onBorn: (child: ActiveCompanion) => void
}) {
  const [aId, setAId] = useState(agentIdOf(companion))
  const [bId, setBId] = useState(() => {
    const other = roster.find((r) => agentIdOf(r) !== agentIdOf(companion))
    return other ? agentIdOf(other) : ''
  })
  const [aCfg, setACfg] = useState<PersonalityConfig | null>(null)
  const [bCfg, setBCfg] = useState<PersonalityConfig | null>(null)
  const [childName, setChildName] = useState('')
  const [touchedName, setTouchedName] = useState(false)
  const [status, setStatus] = useState<Status>('idle')

  const find = (id: string) => roster.find((r) => agentIdOf(r) === id)

  // Load each parent's personality from 0G when chosen.
  useEffect(() => {
    if (!ownerKey) return
    const a = find(aId)
    if (!a) return
    setACfg(null)
    loadPersonality(ownerKey, a.personalityRootHash).then(({ config }) => setACfg(config)).catch(() => {})
  }, [aId, ownerKey])

  useEffect(() => {
    if (!ownerKey) return
    const b = find(bId)
    if (!b) {
      setBCfg(null)
      return
    }
    setBCfg(null)
    loadPersonality(ownerKey, b.personalityRootHash).then(({ config }) => setBCfg(config)).catch(() => {})
  }, [bId, ownerKey])

  // Suggest a name from both parents (until the user types their own).
  useEffect(() => {
    if (!touchedName && aCfg && bCfg) setChildName(suggestChildName(aCfg.name, bCfg.name))
  }, [aCfg, bCfg, touchedName])

  const child = useMemo(
    () => (aCfg && bCfg ? breedConfig(aCfg, bCfg, childName) : null),
    [aCfg, bCfg, childName],
  )

  if (roster.length < 2) {
    return (
      <div className="breed">
        <section className="intro">
          <p className="world-kicker">Breeding 🧬</p>
          <h2 className="intro-h">You need two agents</h2>
          <p className="intro-p">
            Breeding blends two agents you own into a new one. Create or claim another agent first, then
            come back here to combine them.
          </p>
        </section>
      </div>
    )
  }

  async function bringToLife() {
    if (!ownerKey || !child || !aCfg || !bCfg) return
    if (aId === bId) {
      toast.error('Pick two different parents.')
      return
    }
    setStatus('busy')
    try {
      const { rootHash, version } = await persistPersonality(conn.signer, ownerKey, child)
      const agentId = genAgentId()
      setLineage(agentId, { parentA: aCfg.name, parentB: bCfg.name, bornAt: new Date().toISOString() })
      const born: ActiveCompanion = {
        ownerAddr: conn.address.toLowerCase(),
        name: child.name,
        modelId: child.modelId,
        version,
        personalityRootHash: rootHash,
        agentId,
      }
      celebrate()
      toast.success(`${child.name} is born — child of ${aCfg.name} × ${bCfg.name} 🧬`)
      onBorn(born)
    } catch (e) {
      setStatus('error')
      toast.error(humanizeError(e))
    }
  }

  const others = roster

  return (
    <div className="breed">
      <section className="intro">
        <p className="world-kicker">Breeding 🧬</p>
        <h2 className="intro-h">Combine two agents</h2>
        <p className="intro-p">
          The child inherits a blend of both parents’ character. It’s born as its own agent — new memory,
          new version, lineage on record.
        </p>
      </section>

      <section className="card">
        <div className="breed-parents">
          <label className="breed-pick">
            <span className="lbl">Parent A</span>
            <select className="inp" value={aId} onChange={(e) => setAId(e.target.value)}>
              {others.map((r) => (
                <option key={agentIdOf(r)} value={agentIdOf(r)}>{r.name}</option>
              ))}
            </select>
          </label>
          <span className="breed-x">×</span>
          <label className="breed-pick">
            <span className="lbl">Parent B</span>
            <select className="inp" value={bId} onChange={(e) => setBId(e.target.value)}>
              <option value="">— choose —</option>
              {others.map((r) => (
                <option key={agentIdOf(r)} value={agentIdOf(r)}>{r.name}</option>
              ))}
            </select>
          </label>
        </div>

        {child ? (
          <div className="breed-preview">
            <CompanionOrb size={84} state="idle" seed={child.systemPrompt} />
            <label className="lbl">Child’s name</label>
            <input
              className="inp"
              value={childName}
              onChange={(e) => {
                setChildName(e.target.value)
                setTouchedName(true)
              }}
            />
            <p className="muted small"><strong>Manner:</strong> {child.vibe}</p>
            {child.values.length > 0 && (
              <ul className="agent-values">
                {child.values.slice(0, 4).map((v) => (
                  <li key={v}>✦ {v}</li>
                ))}
              </ul>
            )}
            <button onClick={bringToLife} disabled={status === 'busy' || !childName.trim() || aId === bId}>
              {status === 'busy' ? 'Bringing to life…' : `Bring ${childName.trim() || 'the child'} to life`}
            </button>
          </div>
        ) : (
          <p className="muted small">Choose a second parent to preview the child.</p>
        )}
      </section>
    </div>
  )
}
