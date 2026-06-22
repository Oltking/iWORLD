/**
 * Proves breeding: the child blends both parents, is a valid hashable config, and is
 * deterministic (same parents + name → same version).
 *
 * Run: pnpm --filter @kipr/web selftest:breed
 */
import { makePersonality, personalityVersion } from '@kipr/core/personality'
import { breedConfig, suggestChildName } from './breed.ts'

const ok = (c: boolean, m: string) => {
  if (!c) throw new Error(`❌ ${m}`)
  console.log(`  ✓ ${m}`)
}

const alice = makePersonality({
  name: 'Nova',
  vibe: 'warm, curious, playful',
  values: ['Be kind', 'Stay curious', 'Tell the truth'],
  boundaries: ['lie', 'judge'],
  modelId: 'qwen/qwen2.5-omni-7b',
})
const bram = makePersonality({
  name: 'Pebble',
  vibe: 'stoic, precise, dry humor',
  values: ['Be precise', 'Stay curious', 'Protect privacy'],
  boundaries: ['flatter', 'judge'],
  modelId: 'qwen/qwen2.5-omni-7b',
})

console.log('▶ Blend two parents…')
const child = breedConfig(alice, bram, 'Sprout')
ok(child.name === 'Sprout', 'child takes the chosen name')
ok(/warm/.test(child.vibe) && /stoic/.test(child.vibe), 'vibe carries traits from BOTH parents')
ok(child.values.includes('Be kind') && child.values.includes('Be precise'), 'values inherited from both')
ok(new Set(child.values).size === child.values.length, 'no duplicate values (Stay curious deduped)')
ok(child.systemPrompt.includes('Sprout') && child.systemPrompt.length > 40, 'system prompt assembled')
ok(child.modelId === alice.modelId, 'model pinned from parent')

console.log('\n▶ Deterministic…')
const again = breedConfig(alice, bram, 'Sprout')
ok(personalityVersion(child) === personalityVersion(again), 'same parents + name → identical version hash')

console.log('\n▶ Name suggestion…')
const n = suggestChildName('Nova', 'Pebble')
ok(/^[A-Z][a-z]+$/.test(n), `suggested name is well-formed (${n})`)
ok(suggestChildName('Nova', 'Pebble') === n, 'name suggestion is deterministic')

console.log('\n✅ BREED SELFTEST PASSED — children blend both parents, valid + deterministic.')
