import { useEffect, useState } from 'react'
import { subscribe, dismiss, type Toast } from '../lib/toast'

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([])
  useEffect(() => subscribe(setToasts), [])
  if (toasts.length === 0) return null
  return (
    <div className="toaster" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} className={`toast ${t.kind}`} onClick={() => dismiss(t.id)}>
          {t.kind === 'success' ? '✓' : t.kind === 'error' ? '⚠' : 'ℹ'} <span>{t.message}</span>
        </button>
      ))}
    </div>
  )
}
