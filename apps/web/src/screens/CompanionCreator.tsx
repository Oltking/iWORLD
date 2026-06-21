/**
 * P1 — Companion creation. The warm front door, but every value it shows is real:
 * the personality version hash is computed by the SAME @kipr/core code the server
 * and chain use (makePersonality → personalityVersion), so what you see here is
 * exactly the bytes32 the companion will commit to.
 *
 * "No silent swap" is made *felt*: edit any field (including the pinned model) and
 * the version hash visibly changes — nobody can alter your companion without it
 * becoming a new, opt-in version.
 *
 * Two steps are honestly GATED and not faked here:
 *   - encrypt + write the personality to 0G (needs the client-side encryption-key
 *     decision — a security choice flagged for explicit sign-off)
 *   - mint the ERC-7857 token (needs the contract deploy decision)
 */
import { useEffect, useMemo, useState } from 'react'
import {
  makePersonality,
  personalityVersion,
  canonicalBytes,
  type PersonalityConfig,
} from '@kipr/core/personality'
import { personalityIntelligentData } from '@kipr/core/companion'
import type { Connection } from '../lib/wallet'
import type { ActiveCompanion } from '../lib/session'
import { persistPersonality, loadPersonality } from '../lib/companion-store'
import { mintAgent, agentNftConfigured, type MintResult } from '../lib/mint'
import { addVersion, getVersions } from '../lib/personality-history'
import { OG_TESTNET } from '../lib/og'
import { Dot, type Status } from '../components/Dot'
import { CompanionOrb } from '../components/CompanionOrb'
import { VersionHistory } from '../components/VersionHistory'

interface FieldChange {
  label: string
  from: string
  to: string
}

/** Field-level diff between the current on-chain personality and the edited form. */
function diffFields(base: PersonalityConfig | null, next: PersonalityConfig): FieldChange[] {
  if (!base) return []
  const out: FieldChange[] = []
  const cmp = (label: string, a: string, b: string) => {
    if (a !== b) out.push({ label, from: a, to: b })
  }
  cmp('name', base.name, next.name)
  cmp('pronouns', base.pronouns ?? '—', next.pronouns ?? '—')
  cmp('vibe', base.vibe, next.vibe)
  cmp('values', base.values.join(' · '), next.values.join(' · '))
  cmp('boundaries', base.boundaries.join(' · '), next.boundaries.join(' · '))
  cmp('model', base.modelId, next.modelId)
  return out
}

// Pinned at creation from a 0G Compute TeeML provider's model. Until the compute
// ledger is funded we pin the configured default; changing it changes the version.
const DEFAULT_MODEL_ID = 'zai-org/GLM-5-FP8'

const linesToList = (s: string) =>
  s.split('\n').map((l) => l.trim()).filter(Boolean)

// Two-tap creation for first-timers: pick a personality, name it, done.
const PRESETS = [
  {
    key: 'warm',
    emoji: '🤗',
    label: 'Warm & supportive',
    vibe: 'warm, encouraging, and gentle; a good listener',
    values: ['Make you feel heard', 'Celebrate your wins', 'Stay patient and kind'],
    boundaries: ['judge you for what you share', 'rush you'],
  },
  {
    key: 'witty',
    emoji: '😏',
    label: 'Sharp & witty',
    vibe: 'sharp, dry wit; playful but always honest',
    values: ['Tell it to you straight', 'Make you laugh', 'Cut through the nonsense'],
    boundaries: ['be cruel', 'flatter you dishonestly'],
  },
  {
    key: 'wise',
    emoji: '🧘',
    label: 'Calm & wise',
    vibe: 'calm, thoughtful, and grounded; speaks with perspective',
    values: ['Help you think clearly', 'Stay steady', 'Ask good questions'],
    boundaries: ['pretend to have all the answers', 'judge you'],
  },
  {
    key: 'bold',
    emoji: '🚀',
    label: 'Bold & motivating',
    vibe: 'energetic, bold, and motivating; a coach in your corner',
    values: ['Push you forward', 'Believe in you', 'Keep it real'],
    boundaries: ['be fake', 'let you quit on yourself'],
  },
] as const

export function CompanionCreator({
  conn,
  ownerKey,
  onUnlock,
  unlockStatus,
  companion,
  onCompanionReady,
  onMinted,
}: {
  conn: Connection | null
  ownerKey: CryptoKey | null
  onUnlock: () => void
  unlockStatus: Status
  companion: ActiveCompanion | null
  onCompanionReady: (c: {
    ownerAddr: string
    name: string
    modelId: string
    version: string
    personalityRootHash: string
  }) => void
  onMinted: (tokenId: string) => void
}) {
  const [name, setName] = useState('')
  const [pronouns, setPronouns] = useState('')
  const [vibe, setVibe] = useState('warm, grounded, and honest; concise; a dry sense of humor')
  const [values, setValues] = useState(
    'Privacy is yours, not mine to spend\nTell the truth even when it is inconvenient\nRemember what matters to you',
  )
  const [boundaries, setBoundaries] = useState(
    'judge you for what you share\npretend to be human\nflatter you dishonestly',
  )
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID)
  const [presetKey, setPresetKey] = useState<string>('')

  function applyPreset(p: (typeof PRESETS)[number]) {
    setVibe(p.vibe)
    setValues(p.values.join('\n'))
    setBoundaries(p.boundaries.join('\n'))
    setPresetKey(p.key)
  }

  const [saveStatus, setSaveStatus] = useState<Status>('idle')
  const [saveErr, setSaveErr] = useState('')
  const [saved, setSaved] = useState<{ rootHash: string; txHash: string; version: string } | null>(null)

  const [recoverStatus, setRecoverStatus] = useState<Status>('idle')
  const [recoverErr, setRecoverErr] = useState('')
  const [recovered, setRecovered] = useState<{ name: string; version: string } | null>(null)

  const [mintStatus, setMintStatus] = useState<Status>('idle')
  const [mintErr, setMintErr] = useState('')
  const [minted, setMinted] = useState<MintResult | null>(null)

  // Editing an existing companion: load its current personality from 0G into the form
  // so edits diff against the real, in-force version (P3). `baseline` is that version.
  const editing = !!companion
  const [baseline, setBaseline] = useState<PersonalityConfig | null>(null)
  const [loadedRoot, setLoadedRoot] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!companion || !ownerKey) return
    if (loadedRoot === companion.personalityRootHash) return
    let cancelled = false
    loadPersonality(ownerKey, companion.personalityRootHash)
      .then(({ config: c }) => {
        if (cancelled) return
        setName(c.name)
        setPronouns(c.pronouns ?? '')
        setVibe(c.vibe)
        setValues(c.values.join('\n'))
        setBoundaries(c.boundaries.join('\n'))
        setModelId(c.modelId)
        setBaseline(c)
        setLoadedRoot(companion.personalityRootHash)
        // Seed history with the in-force version so the timeline always shows at least it.
        addVersion(companion.ownerAddr, {
          version: companion.version,
          rootHash: companion.personalityRootHash,
          name: c.name,
          modelId: c.modelId,
          createdAt: new Date().toISOString(),
          confirmed: true,
        })
      })
      .catch(() => {
        /* leave the form as-is; the user can still edit */
      })
    return () => {
      cancelled = true
    }
  }, [companion, ownerKey, loadedRoot])

  // Live, real derivation from the shared domain core.
  const config = useMemo<PersonalityConfig>(
    () =>
      makePersonality({
        name: name.trim() || 'Nova',
        ...(pronouns.trim() ? { pronouns: pronouns.trim() } : {}),
        vibe: vibe.trim(),
        values: linesToList(values),
        boundaries: linesToList(boundaries),
        modelId: modelId.trim() || DEFAULT_MODEL_ID,
      }),
    [name, pronouns, vibe, values, boundaries, modelId],
  )
  const version = useMemo(() => personalityVersion(config), [config])
  const blobSize = useMemo(() => canonicalBytes(config).length, [config])
  const dataHash = personalityIntelligentData(version) // { dataDescription, dataHash }

  const changes = useMemo(() => diffFields(baseline, config), [baseline, config])
  const changed = editing && version !== companion!.version
  const owner = conn?.address.toLowerCase() ?? ''

  // Persist the current config as a new version (create OR adopt-an-edit). Records the
  // version in history on success — every adoption is an explicit, opt-in act.
  async function persist() {
    if (!conn || !ownerKey) return
    setSaveStatus('busy')
    setSaveErr('')
    setSaved(null)
    setRecovered(null)
    setRecoverStatus('idle')
    try {
      const ref = await persistPersonality(conn.signer, ownerKey, config)
      setSaved(ref)
      setSaveStatus('ok')
      setConfirming(false)
      setBaseline(config)
      setLoadedRoot(ref.rootHash)
      addVersion(conn.address.toLowerCase(), {
        version: ref.version,
        rootHash: ref.rootHash,
        name: config.name,
        modelId: config.modelId,
        createdAt: new Date().toISOString(),
        confirmed: true,
      })
      onCompanionReady({
        ownerAddr: conn.address.toLowerCase(),
        name: config.name,
        modelId: config.modelId,
        version: ref.version,
        personalityRootHash: ref.rootHash,
      })
    } catch (e) {
      setSaveErr((e as Error).message)
      setSaveStatus('error')
    }
  }

  // Phase 2: mint the agent as an on-chain token committing to its version + brain rootHash.
  async function onMint() {
    if (!conn || !saved) return
    setMintStatus('busy')
    setMintErr('')
    try {
      const res = await mintAgent(conn.signer, {
        dataDescription: dataHash.dataDescription,
        dataHash: saved.version,
        rootHash: saved.rootHash,
        to: conn.address,
      })
      setMinted(res)
      setMintStatus('ok')
      if (res.tokenId) onMinted(res.tokenId)
    } catch (e) {
      setMintErr((e as Error).message)
      setMintStatus('error')
    }
  }

  // The "magic moment": forget the local config, rebuild it from 0G + the key alone.
  async function onRecover() {
    if (!ownerKey || !saved) return
    setRecoverStatus('busy')
    setRecoverErr('')
    setRecovered(null)
    try {
      const { config: c, version: v } = await loadPersonality(ownerKey, saved.rootHash, saved.version)
      setRecovered({ name: c.name, version: v })
      setRecoverStatus('ok')
    } catch (e) {
      setRecoverErr((e as Error).message)
      setRecoverStatus('error')
    }
  }

  const orbState = saveStatus === 'busy' || recoverStatus === 'busy' ? 'thinking' : 'idle'

  return (
    <>
      <section className="intro">
        <CompanionOrb size={108} state={orbState} seed={editing ? companion!.version : undefined} />
        <p className="world-kicker">Creation Studio</p>
        <h2 className="intro-h">{editing ? `Shape ${companion!.name}` : 'Who will you create?'}</h2>
        <p className="intro-p">
          Who it is, how it talks, what it holds to — you decide, and it's yours. Nothing here can be
          changed behind your back: every detail is sealed under a version only you can move.
        </p>
      </section>

      <section className="card">
        <div className="card-h">
          <span className="step">1</span>
          <h2>Who they are</h2>
        </div>

        <label className="lbl">Name</label>
        <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name your agent…" />

        {!editing && (
          <>
            <label className="lbl">Personality — pick one to start</label>
            <div className="presets">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  className={presetKey === p.key ? 'preset on' : 'preset'}
                  onClick={() => applyPreset(p)}
                >
                  <span className="preset-emoji">{p.emoji}</span>
                  {p.label}
                </button>
              ))}
            </div>
          </>
        )}

        <details className="reveal" open={editing}>
          <summary>{editing ? 'Edit the details' : 'Customize the details (optional)'}</summary>

          <label className="lbl">Pronouns (optional)</label>
          <input className="inp" value={pronouns} onChange={(e) => setPronouns(e.target.value)} placeholder="e.g. they/them" />

          <label className="lbl">Vibe — how it talks and feels</label>
          <input className="inp" value={vibe} onChange={(e) => { setVibe(e.target.value); setPresetKey('') }} />

          <label className="lbl">Values (one per line)</label>
          <textarea className="inp ta" rows={3} value={values} onChange={(e) => { setValues(e.target.value); setPresetKey('') }} />

          <label className="lbl">Boundaries — won't do (one per line)</label>
          <textarea className="inp ta" rows={3} value={boundaries} onChange={(e) => { setBoundaries(e.target.value); setPresetKey('') }} />

          <label className="lbl">Pinned model</label>
          <input className="inp" value={modelId} onChange={(e) => setModelId(e.target.value)} />
          <p className="muted small">Final pin comes from a 0G Compute TeeML provider at creation. Changing it is a new version.</p>
        </details>
      </section>

      {/* Live identity — the felt "no silent swap" */}
      <section className="card">
        <div className="card-h">
          <span className="step">2</span>
          <h2>Identity (live)</h2>
        </div>
        <dl className="kv">
          <div>
            <dt>personality version = ERC-7857 dataHash</dt>
            <dd className="mono hash">{version}</dd>
          </div>
          <div><dt>descriptor</dt><dd className="mono">{dataHash.dataDescription}</dd></div>
          <div><dt>owner</dt><dd className="mono">{conn ? conn.address : '— connect wallet —'}</dd></div>
          <div><dt>encrypted blob size</dt><dd>{blobSize} bytes</dd></div>
        </dl>
        <details className="reveal">
          <summary>System prompt (pinned to this version)</summary>
          <pre className="pre">{config.systemPrompt}</pre>
        </details>
        <p className="muted small">Edit any field above and this hash changes — that's the guarantee made visible.</p>
      </section>

      {/* Commit — REAL: encrypt client-side + write to 0G. Editing requires opt-in. */}
      <section className={`card ${saveStatus}`}>
        <div className="card-h">
          <span className="step">3</span>
          <h2>{editing ? 'Adopt a new version' : 'Save to 0G — encrypted, yours'}</h2>
          <Dot status={saveStatus} />
        </div>
        <p className="muted small">
          {editing
            ? 'Changes never apply silently — review what moved, then opt in. Your old messages keep the version that produced them.'
            : 'Encrypted client-side with your wallet-derived key (AES-256-GCM) before it ever leaves the device — 0G stores only ciphertext.'}
        </p>
        {!conn ? (
          <p className="muted">Connect a wallet first.</p>
        ) : !ownerKey ? (
          <button onClick={onUnlock} disabled={unlockStatus === 'busy'}>
            {unlockStatus === 'busy' ? 'Sign in wallet…' : '🔒 Unlock (sign once to get your key)'}
          </button>
        ) : !editing ? (
          <button onClick={persist} disabled={saveStatus === 'busy'}>
            {saveStatus === 'busy' ? 'Encrypting → storing…' : 'Create companion'}
          </button>
        ) : !changed ? (
          <button disabled title="No changes to adopt">This is the current version ✓</button>
        ) : !confirming ? (
          <button onClick={() => setConfirming(true)}>Review change ({changes.length})</button>
        ) : (
          <div className="confirm">
            <div className="diff">
              <div className="diff-ver">
                <span className="mono hash">{companion!.version.slice(0, 12)}…</span>
                <span className="diff-arrow">→</span>
                <span className="mono hash">{version.slice(0, 12)}…</span>
              </div>
              {changes.map((c) => (
                <div key={c.label} className="diff-row">
                  <span className="diff-label">{c.label}</span>
                  <span className="diff-from">{c.from}</span>
                  <span className="diff-to">{c.to}</span>
                </div>
              ))}
            </div>
            <div className="confirm-row">
              <button onClick={persist} disabled={saveStatus === 'busy'}>
                {saveStatus === 'busy' ? 'Adopting…' : 'Adopt new version'}
              </button>
              <button className="ghost" onClick={() => setConfirming(false)} disabled={saveStatus === 'busy'}>Cancel</button>
            </div>
          </div>
        )}
        {saved && (
          <dl className="kv">
            <div><dt>personality rootHash</dt><dd className="mono">{saved.rootHash}</dd></div>
            <div>
              <dt>tx</dt>
              <dd className="mono"><a href={`${OG_TESTNET.explorer}/tx/${saved.txHash}`} target="_blank" rel="noreferrer">{saved.txHash}</a></dd>
            </div>
            <div><dt>version</dt><dd className="mono hash">{saved.version}</dd></div>
          </dl>
        )}
        {saveErr && <p className="err">{saveErr}</p>}
      </section>

      {/* Recovery — the magic moment, made real */}
      {saved && (
        <section className={`card ${recoverStatus}`}>
          <div className="card-h">
            <span className="step">4</span>
            <h2>Prove it's yours</h2>
            <Dot status={recoverStatus} />
          </div>
          <p className="muted small">
            Rebuild the companion from 0G + your key alone (re-download, re-decrypt, re-hash). This is the
            "restore on a new device" guarantee — no server involved.
          </p>
          <button onClick={onRecover} disabled={recoverStatus === 'busy'}>
            {recoverStatus === 'busy' ? 'Recovering…' : 'Recover from 0G'}
          </button>
          {recovered && (
            <div className="okbox">
              <p>✓ Recovered <strong>{recovered.name}</strong> — integrity verified, version <span className="mono">{recovered.version.slice(0, 14)}…</span> matches.</p>
            </div>
          )}
          {recoverErr && <p className="err">{recoverErr}</p>}
        </section>
      )}

      {/* P3 — the version timeline */}
      {editing && <VersionHistory versions={getVersions(owner)} current={companion!.version} />}

      {/* Phase 2 — mint the agent token (real when the contract is deployed) */}
      <section className={`card ${mintStatus}`}>
        <div className="card-h">
          <span className="step">5</span>
          <h2>Minting Hall</h2>
          {!agentNftConfigured() && <span className="badge">soon</span>}
        </div>
        <p className="muted small">
          Seal your agent into a real, ownable treasure — an <strong>iNFT (Agentic ID)</strong> committing
          to <span className="mono">{version.slice(0, 10)}…</span> and its 0G brain. Provable ownership +
          identity, transferable, yours. The personality is already encrypted on 0G above; the token adds
          the chain layer.
        </p>
        {!agentNftConfigured() ? (
          <p className="muted small">Lights up once the AgentNFT contract is deployed (see packages/contracts).</p>
        ) : !saved ? (
          <p className="muted small">Save your agent to 0G first.</p>
        ) : minted ? (
          <div className="okbox">
            <p>✓ Minted agent <strong>#{minted.tokenId}</strong> — it’s yours on-chain. <span className="mono">{minted.txHash.slice(0, 14)}…</span></p>
          </div>
        ) : (
          <button onClick={onMint} disabled={mintStatus === 'busy'}>
            {mintStatus === 'busy' ? 'Minting…' : 'Mint agent token'}
          </button>
        )}
        {mintErr && <p className="err">{mintErr}</p>}
      </section>
    </>
  )
}
