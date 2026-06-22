/**
 * Tiny global toast bus — unified, human feedback instead of raw error strings
 * scattered per screen. Screens call toast.success/error/info from anywhere.
 */
export type ToastKind = 'success' | 'error' | 'info'
export interface Toast {
  id: number
  kind: ToastKind
  message: string
}

let toasts: Toast[] = []
const listeners = new Set<(t: Toast[]) => void>()
let nextId = 1

function emit() {
  for (const l of listeners) l([...toasts])
}
export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}
function push(kind: ToastKind, message: string, ttl: number) {
  const id = nextId++
  toasts = [...toasts.slice(-3), { id, kind, message }]
  emit()
  setTimeout(() => dismiss(id), ttl)
}

export const toast = {
  success: (m: string) => push('success', m, 4000),
  error: (m: string) => push('error', m, 6500),
  info: (m: string) => push('info', m, 4000),
}

export function subscribe(l: (t: Toast[]) => void): () => void {
  listeners.add(l)
  l([...toasts])
  return () => listeners.delete(l)
}

/** Map raw wallet/RPC/contract errors to something a human understands. */
export function humanizeError(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e)
  // Already a friendly, actionable message we wrote — don't flatten it.
  if (/faucet|RPC URL|the 0G network|couldn’t reach the 0G|0G, so it can/i.test(msg)) {
    return msg.length > 240 ? msg.slice(0, 240) + '…' : msg
  }
  if (/user rejected|user denied|action_rejected|\b4001\b/i.test(msg)) return 'You declined in your wallet.'
  if (/insufficient funds|insufficient balance|exceeds balance|gas required|0 0G/i.test(msg))
    return 'Not enough 0G for gas — top up your wallet at faucet.0g.ai.'
  if (/could not coalesce|RPC|network|failed to fetch|ECONN|timeout|-32603/i.test(msg))
    return 'Network hiccup — please try again in a moment.'
  if (/not registered/i.test(msg)) return "They haven't registered to receive agents yet."
  return msg.length > 140 ? msg.slice(0, 140) + '…' : msg
}
