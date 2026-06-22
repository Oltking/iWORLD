/**
 * Onboarding gate — shown right after connect, before unlock. Makes the sequence
 * obvious (Connect ✓ → Unlock → Create) and explains *why* you sign, so the unlock
 * step never feels mysterious.
 */
import { CompanionOrb } from '../components/CompanionOrb'
import type { Status } from '../components/Dot'

export function Welcome({
  onUnlock,
  unlockStatus,
  address,
}: {
  onUnlock: () => void
  unlockStatus: Status
  address: string
}) {
  return (
    <div className="welcome">
      <CompanionOrb size={120} state={unlockStatus === 'busy' ? 'thinking' : 'idle'} />
      <p className="world-kicker">You’re in</p>
      <h2 className="intro-h">Unlock your private space</h2>
      <p className="intro-p">
        One quick signature creates your private key. It <strong>never leaves this device</strong> — it’s
        what keeps your agents readable by you alone. No gas, no transaction, just a signature.
      </p>
      <button className="cta" onClick={onUnlock} disabled={unlockStatus === 'busy'}>
        {unlockStatus === 'busy' ? 'Check your wallet…' : '🔓 Unlock & continue'}
      </button>
      <div className="steps-mini">
        <span className="sm-done">✓ Connect</span>
        <span className="sm-arrow">→</span>
        <span className="sm-now">Unlock</span>
        <span className="sm-arrow">→</span>
        <span className="sm-next">Create your agent</span>
      </div>
      <p className="muted small">{address.slice(0, 6)}…{address.slice(-4)}</p>
    </div>
  )
}
