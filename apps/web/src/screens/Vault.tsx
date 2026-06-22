/**
 * P4 — "Yours": export, restore, delete. The surfaces that make ownership tangible.
 *
 * Export  — pull your companion + conversation from 0G, decrypt locally, download a
 *           readable file. Yours, readable by you alone.
 * Restore — import an export file (integrity-verified) and re-seat the companion.
 * Delete  — a deliberate two-step guard (non-negotiable #7). Honest about on-chain
 *           permanence: the encrypted blobs persist on 0G but are useless without your
 *           key — discarding the key/pointers is a cryptographic erasure.
 */
import { useEffect, useRef, useState } from 'react'
import { isAddress } from 'ethers'
import type { Connection } from '../lib/wallet'
import { buildExport, downloadJson, parseExport, type KiprExport } from '../lib/export'
import { conversationHeadKey, agentIdOf, type ActiveCompanion } from '../lib/session'
import { transferConfigured, hasTransferKey, registerToReceive, transferAgent, claimAgent } from '../lib/transfer'
import { toast, humanizeError } from '../lib/toast'
import { celebrate } from '../lib/celebrate'
import type { Status } from '../components/Dot'

export function Vault({
  conn,
  ownerKey,
  companion,
  onRestore,
  onDelete,
  onClaimed,
}: {
  conn: Connection
  ownerKey: CryptoKey | null
  companion: ActiveCompanion | null
  onRestore: (exp: KiprExport) => void
  onDelete: () => void
  onClaimed: (c: ActiveCompanion) => void
}) {
  const [exportStatus, setExportStatus] = useState<Status>('idle')
  const [exportErr, setExportErr] = useState('')
  const [importErr, setImportErr] = useState('')
  const [importOk, setImportOk] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [registered, setRegistered] = useState<boolean | null>(null)
  const [regStatus, setRegStatus] = useState<Status>('idle')
  const [sendTo, setSendTo] = useState('')
  const [sendStatus, setSendStatus] = useState<Status>('idle')
  const [transferMsg, setTransferMsg] = useState('')
  const [transferErr, setTransferErr] = useState('')
  const [claimToken, setClaimToken] = useState('')
  const [claimStatus, setClaimStatus] = useState<Status>('idle')

  useEffect(() => {
    if (!transferConfigured()) return
    hasTransferKey(conn.provider, conn.address).then(setRegistered).catch(() => setRegistered(false))
  }, [conn])

  async function onRegister() {
    setRegStatus('busy')
    setTransferErr('')
    try {
      await registerToReceive(conn.signer, conn.address)
      setRegistered(true)
      setRegStatus('ok')
      toast.success('Registered — people can now hand you agents 🤝')
    } catch (e) {
      setTransferErr((e as Error).message)
      setRegStatus('error')
      toast.error(humanizeError(e))
    }
  }

  async function onSend() {
    if (!ownerKey || !companion || !isAddress(sendTo)) return
    setSendStatus('busy')
    setTransferErr('')
    setTransferMsg('')
    try {
      const id = companion.tokenId
      await transferAgent(conn.signer, ownerKey, companion, sendTo)
      setTransferMsg(`✓ ${companion.name} sent — brain and all. Tell them: open iWORLD → Yours → "Claim an agent" → enter token #${id}.`)
      setSendStatus('ok')
      toast.success(`${companion.name} sent — brain and all 🤝`)
      setTimeout(onDelete, 2500) // you gave it away; clear local state
    } catch (e) {
      setTransferErr((e as Error).message)
      setSendStatus('error')
      toast.error(humanizeError(e))
    }
  }

  async function onClaim() {
    if (!ownerKey || !claimToken) return
    setClaimStatus('busy')
    setTransferErr('')
    setTransferMsg('')
    try {
      const c = await claimAgent(conn.signer, ownerKey, claimToken)
      setTransferMsg(`✓ Claimed ${c.name} (Agent #${c.tokenId}) — it’s yours now, brain and all.`)
      setClaimStatus('ok')
      celebrate()
      toast.success(`Claimed ${c.name} — brain and all 🎉`)
      onClaimed(c)
    } catch (e) {
      setTransferErr((e as Error).message)
      setClaimStatus('error')
      toast.error(humanizeError(e))
    }
  }

  async function onExport() {
    if (!ownerKey || !companion) return
    setExportStatus('busy')
    setExportErr('')
    try {
      const head = localStorage.getItem(conversationHeadKey(agentIdOf(companion)))
      const bundle = await buildExport(ownerKey, {
        owner: conn.address.toLowerCase(),
        personalityRootHash: companion.personalityRootHash,
        conversationHead: head,
      })
      const date = new Date().toISOString().slice(0, 10)
      downloadJson(bundle, `iworld-${companion.name.toLowerCase()}-${date}.json`)
      setExportStatus('ok')
    } catch (e) {
      setExportErr((e as Error).message)
      setExportStatus('error')
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    setImportErr('')
    setImportOk('')
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const exp = parseExport(await file.text())
      onRestore(exp)
      setImportOk(`Restored ${exp.companion.name} — ${exp.conversation.length} messages, integrity verified.`)
    } catch (err) {
      setImportErr((err as Error).message)
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <>
      <section className="intro">
        <h2 className="intro-h">Yours to keep</h2>
        <p className="intro-p">
          Take your agent with you, bring one back, or truly let go. No lock-in — this is the whole point of iWORLD.
        </p>
      </section>

      {/* Export */}
      <section className={`card ${exportStatus}`}>
        <div className="card-h">
          <span className="step">↓</span>
          <h2>Export</h2>
        </div>
        <p className="muted small">
          Download a decrypted, readable copy of {companion ? companion.name : 'your agent'} —
          personality + full conversation, pulled from 0G and unlocked with your key.
        </p>
        {!ownerKey ? (
          <p className="muted">Unlock to export.</p>
        ) : !companion ? (
          <p className="muted">Create an agent first.</p>
        ) : (
          <button onClick={onExport} disabled={exportStatus === 'busy'}>
            {exportStatus === 'busy' ? 'Gathering from 0G…' : 'Export my agent'}
          </button>
        )}
        {exportStatus === 'ok' && <div className="okbox"><p>✓ Downloaded. That file is readable by you alone.</p></div>}
        {exportErr && <p className="err">{exportErr}</p>}
      </section>

      {/* Restore */}
      <section className="card">
        <div className="card-h">
          <span className="step">↑</span>
          <h2>Restore</h2>
        </div>
        <p className="muted small">
          Bring an agent back from an export file — on a new device or wallet. We verify its integrity
          before trusting it.
        </p>
        <button onClick={() => fileRef.current?.click()}>Choose export file…</button>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={onPickFile} style={{ display: 'none' }} />
        {importOk && <div className="okbox"><p>✓ {importOk}</p></div>}
        {importErr && <p className="err">{importErr}</p>}
      </section>

      {/* Transfer — the re-keyed brain handoff */}
      {transferConfigured() && (
        <section className={`card ${sendStatus}`}>
          <div className="card-h">
            <span className="step">🤝</span>
            <h2>Transfer &amp; receive</h2>
          </div>
          <p className="muted small">
            Hand an agent to someone — <strong>brain and all</strong>. It’s re-sealed so only they can open it.
            Register once to be able to receive agents yourself.
          </p>

          {registered === false ? (
            <button onClick={onRegister} disabled={regStatus === 'busy'}>
              {regStatus === 'busy' ? 'Sign + register…' : 'Register to receive agents'}
            </button>
          ) : registered ? (
            <p className="muted small">✓ Registered to receive agents.</p>
          ) : (
            <p className="muted small">Checking…</p>
          )}

          {companion?.tokenId && (
            <div style={{ marginTop: 12 }}>
              <label className="lbl">Send {companion.name} (Agent #{companion.tokenId}) to</label>
              <div className="composer">
                <input className="inp" value={sendTo} onChange={(e) => setSendTo(e.target.value)} placeholder="0x recipient address" />
                <button className="send" onClick={onSend} disabled={sendStatus === 'busy' || !ownerKey || !isAddress(sendTo)} style={{ width: 'auto', borderRadius: 12, padding: '0 16px' }}>
                  {sendStatus === 'busy' ? '…' : 'Send'}
                </button>
              </div>
              <p className="muted small">The recipient must have registered first.</p>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <label className="lbl">Claim an agent sent to you</label>
            <div className="composer">
              <input className="inp" value={claimToken} onChange={(e) => setClaimToken(e.target.value)} placeholder="Agent token # you now own" inputMode="numeric" />
              <button className="send" onClick={onClaim} disabled={claimStatus === 'busy' || !ownerKey || !claimToken} style={{ width: 'auto', borderRadius: 12, padding: '0 16px' }}>
                {claimStatus === 'busy' ? '…' : 'Claim'}
              </button>
            </div>
          </div>

          {transferMsg && <div className="okbox"><p>{transferMsg}</p></div>}
          {transferErr && <p className="err">{transferErr}</p>}
        </section>
      )}

      {/* Delete */}
      <section className="card danger">
        <div className="card-h">
          <span className="step danger-step">⚠</span>
          <h2>Delete locally</h2>
        </div>
        <p className="muted small">
          Removes this companion and its memory pointers from this device. The encrypted blobs on 0G
          can’t be un-published from a decentralized network — but they’re useless without your key, so
          letting go of the key is a real, cryptographic erasure. <strong>Export first</strong> if you
          might want it back.
        </p>
        {!confirmDelete ? (
          <button className="ghost danger-btn" onClick={() => setConfirmDelete(true)} disabled={!companion}>
            Delete companion
          </button>
        ) : (
          <div className="confirm">
            <p className="muted small"><strong>Are you sure?</strong> This clears it from this device.</p>
            <div className="confirm-row">
              <button className="danger-btn" onClick={() => { onDelete(); setConfirmDelete(false) }}>Yes, delete</button>
              <button className="ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          </div>
        )}
      </section>
    </>
  )
}
