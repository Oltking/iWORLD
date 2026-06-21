/**
 * P2 — the chat surface. The core companion experience: talk, and it remembers.
 *
 * Memory is real and owned: "Save to 0G" encrypts the conversation client-side and
 * appends it to the on-chain snapshot chain; "Reload from 0G" rebuilds it from the
 * head + your key alone — proving the conversation lives with you, not a server.
 *
 * Inference is REAL when the compute ledger is active: the reply comes straight from
 * a 0G TeeML provider (browser → provider; our server never sees it) and processResponse
 * gives a genuine ✓ TEE-verified badge. Funding is an explicit one-time step (never a
 * mid-chat popup). If compute is unavailable/unfunded, KIPR falls back to a local
 * preview reply — no content leaves the device and no badge is faked.
 */
import { useEffect, useRef, useState } from 'react'
import type { Connection } from '../lib/wallet'
import {
  appendMessages,
  loadConversation,
  type MemoryMessage,
  type MessageProvenance,
} from '../lib/conversation-store'
import {
  createBroker,
  pickTeeMLProvider,
  ledgerStatus,
  activateFunding,
  chat as runInference,
  type Broker,
  type InferenceService,
} from '../lib/compute'
import { relayConfigured, relayChat } from '../lib/compute-relay'
import { loadPersonality } from '../lib/companion-store'
import { loadKnowledge, knowledgeHeadKey, knowledgePromptBlock } from '../lib/knowledge-store'
import { conversationHeadKey, type ActiveCompanion } from '../lib/session'
import { ProvenanceBadge } from '../components/ProvenanceBadge'
import { CompanionOrb } from '../components/CompanionOrb'
import { OG_TESTNET } from '../lib/og'
import type { Status } from '../components/Dot'

type ComputeState = 'checking' | 'inactive' | 'active' | 'unavailable'

const now = () => new Date().toISOString()
const headKey = (c: ActiveCompanion) => conversationHeadKey(c.ownerAddr)

export function Chat({
  conn,
  ownerKey,
  companion,
  initial,
}: {
  conn: Connection
  ownerKey: CryptoKey | null
  companion: ActiveCompanion
  initial?: { messages: MemoryMessage[]; head: string | null }
}) {
  const localProv = (): MessageProvenance => ({
    modelId: companion.modelId,
    providerAddr: '0x0000000000000000000000000000000000000000',
    chatId: null,
    teeVerified: null, // local message → no TEE claim
    personalityVersion: companion.version,
  })

  const [messages, setMessages] = useState<MemoryMessage[]>(
    initial?.messages.length
      ? initial.messages
      : [
          {
            role: 'assistant',
            content: `Hi — I'm ${companion.name}. This space is just ours: private, and yours to keep. Tell me anything.`,
            createdAt: now(),
            provenance: localProv(),
          },
        ],
  )
  const [input, setInput] = useState('')
  const [head, setHead] = useState<string | null>(
    initial?.head ?? localStorage.getItem(headKey(companion)),
  )
  const [savedCount, setSavedCount] = useState(initial?.messages.length ?? 0)
  const [saveStatus, setSaveStatus] = useState<Status>('idle')
  const [saveErr, setSaveErr] = useState('')

  const [compute, setCompute] = useState<ComputeState>('checking')
  const [activateStatus, setActivateStatus] = useState<Status>('idle')
  const [activateErr, setActivateErr] = useState('')
  const [thinking, setThinking] = useState(false)
  const [knownCount, setKnownCount] = useState(0)

  const brokerRef = useRef<Broker | null>(null)
  const providerRef = useRef<InferenceService | null>(null)
  const systemPromptRef = useRef<string>('')
  const endRef = useRef<HTMLDivElement>(null)
  const autoLoadedRef = useRef(false)
  const greetedRef = useRef(false)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  // Set up the compute broker + provider, check the ledger, and load the system prompt.
  useEffect(() => {
    if (!ownerKey) return
    let cancelled = false
    setCompute('checking')
    ;(async () => {
      try {
        const broker = await createBroker(conn.signer)
        const provider = await pickTeeMLProvider(broker, ctx_provider())
        const status = await ledgerStatus(broker)
        if (cancelled) return
        brokerRef.current = broker
        providerRef.current = provider
        try {
          const { config } = await loadPersonality(ownerKey, companion.personalityRootHash)
          let prompt = config.systemPrompt
          // Inject what the agent has been taught (Training Grounds) so it actually uses it.
          const knowHead = localStorage.getItem(knowledgeHeadKey(companion.ownerAddr))
          if (knowHead) {
            try {
              prompt += knowledgePromptBlock(await loadKnowledge(ownerKey, knowHead))
            } catch {
              /* knowledge load failed — proceed with base persona */
            }
          }
          systemPromptRef.current = prompt
        } catch {
          /* fall back to no system prompt */
        }
        setCompute(status.exists && Number(status.balance0G) > 0 ? 'active' : 'inactive')
      } catch {
        if (!cancelled) setCompute('unavailable')
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerKey, companion.personalityRootHash])

  // Continuity: if there's a saved head and we weren't seeded from a restore, pull the
  // conversation back from 0G once the key is available — "it just remembers".
  useEffect(() => {
    if (autoLoadedRef.current) return
    if (initial?.messages.length) {
      autoLoadedRef.current = true
      return
    }
    if (!ownerKey || !head) return
    autoLoadedRef.current = true
    loadConversation(ownerKey, head)
      .then((restored) => {
        if (restored.length) {
          setMessages(restored)
          setSavedCount(restored.length)
        }
      })
      .catch(() => {
        /* keep the greeting if reload fails */
      })
  }, [ownerKey, head, initial])

  // Always know how much we've been taught (for the "remembers you" signal), even in
  // preview mode where the compute setup doesn't run.
  useEffect(() => {
    if (!ownerKey) return
    const knowHead = localStorage.getItem(knowledgeHeadKey(companion.ownerAddr))
    if (!knowHead) return
    let cancelled = false
    loadKnowledge(ownerKey, knowHead)
      .then((items) => !cancelled && setKnownCount(items.length))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [ownerKey, companion.ownerAddr])

  // Return bonding: if this is a fresh chat (no saved history) but the agent has been
  // taught things, greet so it feels like coming back to someone who knows you.
  useEffect(() => {
    if (greetedRef.current) return
    if (initial?.messages.length || head || savedCount > 0 || messages.length > 1) return
    if (knownCount <= 0) return
    greetedRef.current = true
    setMessages([
      {
        role: 'assistant',
        content:
          `Good to see you again. I’ve got the ${knownCount} thing${knownCount === 1 ? '' : 's'} ` +
          `you’ve taught me close — what’s on your mind?`,
        createdAt: now(),
        provenance: localProv(),
      },
    ])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knownCount, head, savedCount, initial])

  const unsaved = messages.length - savedCount
  const sharedTee = relayConfigured() // shared pool available → chat works without self-funding

  async function onActivate() {
    const broker = brokerRef.current
    const provider = providerRef.current
    if (!broker || !provider) return
    setActivateStatus('busy')
    setActivateErr('')
    try {
      await activateFunding(broker, provider.provider)
      setCompute('active')
      setActivateStatus('ok')
    } catch (e) {
      setActivateErr((e as Error).message)
      setActivateStatus('error')
    }
  }

  async function send() {
    const text = input.trim()
    if (!text || thinking) return
    setInput('')
    const user: MemoryMessage = { role: 'user', content: text, createdAt: now() }
    const next = [...messages, user]
    setMessages(next)

    const broker = brokerRef.current
    const provider = providerRef.current
    const ownActive = compute === 'active' && !!broker && !!provider
    const useRelay = !ownActive && relayConfigured()

    if (ownActive || useRelay) {
      setThinking(true)
      try {
        const history = next
          .filter((m) => m.role !== 'system')
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
        const msgs = systemPromptRef.current
          ? [{ role: 'system' as const, content: systemPromptRef.current }, ...history]
          : history
        const res = ownActive
          ? await runInference(broker!, provider!, msgs)
          : await relayChat(conn.signer, msgs)
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content: res.content,
            createdAt: now(),
            provenance: {
              modelId: res.model,
              providerAddr: res.provider,
              chatId: res.chatID,
              teeVerified: res.teeVerified, // own path: earned; shared path: null (honest)
              personalityVersion: companion.version,
            },
          },
        ])
      } catch (e) {
        const msg = (e as Error).message
        if (ownActive && /sub-account|ledger|insufficient|fund/i.test(msg)) setCompute('inactive')
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content: `(I couldn't reach the TEE provider just now: ${msg})`,
            createdAt: now(),
            provenance: localProv(),
          },
        ])
      } finally {
        setThinking(false)
      }
    } else {
      // Preview fallback — local, no content leaves the device, no faked TEE badge.
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content:
            `I've got that — turn on TEE chat above and I'll think it through for real, ` +
            `verifiably and privately. For now your words are safe with you.`,
          createdAt: now(),
          provenance: localProv(),
        },
      ])
    }
  }

  async function onSave() {
    if (!ownerKey || unsaved <= 0) return
    setSaveStatus('busy')
    setSaveErr('')
    try {
      const delta = messages.slice(savedCount)
      const ref = await appendMessages(conn.signer, ownerKey, {
        companion: companion.ownerAddr,
        head,
        messages: delta,
      })
      setHead(ref.head)
      localStorage.setItem(headKey(companion), ref.head)
      setSavedCount(messages.length)
      setSaveStatus('ok')
    } catch (e) {
      setSaveErr((e as Error).message)
      setSaveStatus('error')
    }
  }

  async function onReload() {
    if (!ownerKey || !head) return
    setSaveStatus('busy')
    setSaveErr('')
    try {
      const restored = await loadConversation(ownerKey, head)
      setMessages(restored)
      setSavedCount(restored.length)
      setSaveStatus('ok')
    } catch (e) {
      setSaveErr((e as Error).message)
      setSaveStatus('error')
    }
  }

  return (
    <div className="chat">
      <div className="chat-head">
        <CompanionOrb size={40} state={thinking || saveStatus === 'busy' ? 'thinking' : 'idle'} seed={companion.version} />
        <div className="chat-id">
          <strong>{companion.name}</strong>
          <span className="muted small">
            🔒 private{knownCount > 0 ? ` · 🧠 remembers ${knownCount}` : ' · owned on 0G'}
          </span>
        </div>
        <ComputeBadge state={compute} shared={sharedTee} />
      </div>

      {/* Activation — only a hard blocker when there's no shared pool to fall back on. */}
      {ownerKey && compute === 'inactive' && !sharedTee && (
        <div className={`tee-panel ${activateStatus}`}>
          <p className="muted small">
            <strong>Turn on TEE chat.</strong> One-time setup opens your 0G Compute ledger and funds a
            verifiable TeeML provider (~4 0G + gas, two wallet confirmations). After that, replies are
            real and ✓ TEE-verified — straight from the enclave, never through a server.
          </p>
          <button onClick={onActivate} disabled={activateStatus === 'busy'}>
            {activateStatus === 'busy' ? 'Confirm in wallet…' : 'Activate TEE chat'}
          </button>
          {activateErr && <p className="err">{activateErr}</p>}
        </div>
      )}
      {sharedTee && compute !== 'active' && (
        <p className="muted small center">
          🔒 Shared TEE chat — real, private inference on a shared pool.{' '}
          {ownerKey && compute === 'inactive' && (
            <button className="linklike" onClick={onActivate} disabled={activateStatus === 'busy'}>
              {activateStatus === 'busy' ? 'activating…' : 'go unlimited & fully private →'}
            </button>
          )}
        </p>
      )}
      {compute === 'unavailable' && !sharedTee && (
        <p className="muted small center">Compute is offline right now — chatting in private preview mode.</p>
      )}

      <div className="thread">
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            <div className="bubble-text">{m.content}</div>
            {m.provenance && <ProvenanceBadge p={m.provenance} currentVersion={companion.version} />}
          </div>
        ))}
        {thinking && (
          <div className="bubble assistant">
            <div className="bubble-text typing"><span /><span /><span /></div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="composer">
        <input
          className="inp"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={`Message ${companion.name}…`}
          disabled={thinking}
        />
        <button className="send" onClick={send} disabled={!input.trim() || thinking}>↑</button>
      </div>

      <div className="memrow">
        {!ownerKey ? (
          <p className="muted small">Unlock to save this conversation to 0G.</p>
        ) : (
          <>
            <button className="ghost" onClick={onSave} disabled={saveStatus === 'busy' || unsaved <= 0}>
              {saveStatus === 'busy' ? 'Encrypting → 0G…' : unsaved > 0 ? `Save ${unsaved} to 0G` : 'All saved ✓'}
            </button>
            <button className="ghost" onClick={onReload} disabled={saveStatus === 'busy' || !head}>
              Reload from 0G
            </button>
          </>
        )}
      </div>
      {head && (
        <p className="muted small center">
          memory head <a className="mono" href={`${OG_TESTNET.explorer}`} target="_blank" rel="noreferrer">{head.slice(0, 14)}…</a> · encrypted, yours
        </p>
      )}
      {saveErr && <p className="err">{saveErr}</p>}
    </div>
  )
}

/** Optional provider pin from build-time env (not required). */
function ctx_provider(): string | undefined {
  return (import.meta.env.VITE_ZG_COMPUTE_PROVIDER_ADDR as string | undefined) || undefined
}

function ComputeBadge({ state, shared }: { state: ComputeState; shared: boolean }) {
  // Own funded ledger wins; otherwise the shared pool keeps chat live + private.
  const m =
    state === 'active'
      ? { cls: 'ok', label: '✓ TEE on' }
      : shared
        ? { cls: 'ok', label: '🔒 TEE · shared' }
        : state === 'checking'
          ? { cls: 'pending', label: '◌ TEE…' }
          : state === 'unavailable'
            ? { cls: 'error', label: '✕ offline' }
            : { cls: 'pending', label: '○ TEE off' }
  return <span className={`tee-badge ${m.cls}`}>{m.label}</span>
}
