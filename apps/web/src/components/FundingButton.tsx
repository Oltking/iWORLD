/**
 * "Get free starter 0G" — for embedded (email/passkey) users with an empty wallet.
 * Sends the user's Privy access token to the funder, which drips a one-time bit of 0G
 * so they can save to 0G without ever touching crypto. Rendered only inside PrivyProvider.
 */
import { useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { requestFunding } from '../lib/funder'
import { humanizeError } from '../lib/toast'

export function FundingButton({ address, onFunded }: { address: string; onFunded: () => void }) {
  const { getAccessToken } = usePrivy()
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [err, setErr] = useState('')

  async function go() {
    setStatus('busy')
    setErr('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Please sign in again.')
      await requestFunding(token, address)
      setStatus('done')
      setTimeout(onFunded, 1500) // let the drip settle, then refresh balance
    } catch (e) {
      setErr(humanizeError(e))
      setStatus('error')
    }
  }

  if (status === 'done') return <p className="muted small">✓ Starter 0G sent — you’re funded.</p>
  return (
    <>
      <button className="ghost" onClick={go} disabled={status === 'busy'}>
        {status === 'busy' ? 'Sending…' : '🎁 Get free starter 0G'}
      </button>
      {err && <p className="err">{err}</p>}
    </>
  )
}
