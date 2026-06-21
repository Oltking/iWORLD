/**
 * The companion's visual presence — a living, breathing gradient orb. It's the one
 * element that makes KIPR feel like a companion rather than a form. State changes its
 * motion: calm when idle, quicker + brighter when thinking/saving.
 *
 * `seed` (the agent's version hash) gives each agent its OWN colour — so your agent
 * looks like a distinct being, not a generic icon.
 */
export type OrbState = 'idle' | 'thinking' | 'speaking'

function hueFromSeed(seed?: string): number {
  if (!seed) return 0
  let h = 0
  for (let i = 2; i < Math.min(seed.length, 14); i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return h
}

export function CompanionOrb({
  size = 132,
  state = 'idle',
  seed,
}: {
  size?: number
  state?: OrbState
  seed?: string
}) {
  const hue = hueFromSeed(seed)
  return (
    <div
      className={`orb orb-${state}`}
      style={{ width: size, height: size, filter: hue ? `hue-rotate(${hue}deg)` : undefined }}
      aria-hidden="true"
    >
      <span className="orb-glow" />
      <span className="orb-core" />
      <span className="orb-sheen" />
    </div>
  )
}
