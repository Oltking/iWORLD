/**
 * Breeding — combine two agents you own into a child whose character is a deterministic
 * blend of both parents. The child is a brand-new agent (its own id, memory, version);
 * lineage is recorded so you always know who it came from.
 */
import { makePersonality, type PersonalityConfig } from '@kipr/core/personality'

const splitDescriptors = (s: string): string[] =>
  s
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean)

/** Take a couple of traits from each parent — A leads, B adds flavor. */
function blendVibe(a: string, b: string): string {
  const da = splitDescriptors(a)
  const db = splitDescriptors(b)
  const picked: string[] = []
  const add = (x?: string) => {
    if (x && !picked.some((p) => p.toLowerCase() === x.toLowerCase())) picked.push(x)
  }
  add(da[0])
  add(db[0])
  add(da[1])
  add(db[1])
  return (picked.length ? picked : da.concat(db)).slice(0, 4).join(', ')
}

/** Interleave both parents' lists, dedupe (case-insensitive), cap. */
function blendList(a: string[], b: string[], cap: number): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max; i++) {
    for (const x of [a[i], b[i]]) {
      const k = x?.trim().toLowerCase()
      if (x && k && !seen.has(k)) {
        seen.add(k)
        out.push(x.trim())
      }
    }
  }
  return out.slice(0, cap)
}

const alpha = (s: string) => s.replace(/[^a-zA-Z]/g, '')

/** A suggested name from both parents' names (first half of A + second half of B). */
export function suggestChildName(a: string, b: string): string {
  const an = alpha(a)
  const bn = alpha(b)
  const head = an.slice(0, Math.max(1, Math.ceil(an.length / 2)))
  const tail = bn.slice(Math.floor(bn.length / 2))
  const raw = (head + tail) || 'Sprout'
  return raw[0].toUpperCase() + raw.slice(1).toLowerCase()
}

/** Deterministically blend two parents into a child config (user can override the name). */
export function breedConfig(a: PersonalityConfig, b: PersonalityConfig, childName: string): PersonalityConfig {
  return makePersonality({
    name: childName.trim() || suggestChildName(a.name, b.name),
    pronouns: a.pronouns || b.pronouns,
    vibe: blendVibe(a.vibe, b.vibe),
    values: blendList(a.values, b.values, 5),
    boundaries: blendList(a.boundaries, b.boundaries, 4),
    modelId: a.modelId,
  })
}
