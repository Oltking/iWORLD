/**
 * A quick confetti burst for the moments that deserve it — minting, claiming, a sale.
 * Pure DOM, no deps, self-cleaning, and silent when the user prefers reduced motion.
 */
const COLORS = ['#8b5cf6', '#22d3ee', '#ec4899', '#fbbf24', '#34d399', '#fb7185']

export function celebrate(count = 90): void {
  if (typeof document === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  const root = document.createElement('div')
  root.className = 'confetti-root'
  root.setAttribute('aria-hidden', 'true')
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span')
    p.className = 'confetti'
    p.style.left = Math.random() * 100 + 'vw'
    p.style.background = COLORS[i % COLORS.length]
    p.style.animationDelay = Math.random() * 0.35 + 's'
    p.style.animationDuration = 1.8 + Math.random() * 1.2 + 's'
    p.style.setProperty('--spin', Math.random() * 720 - 360 + 'deg')
    root.appendChild(p)
  }
  document.body.appendChild(root)
  setTimeout(() => root.remove(), 3200)
}
