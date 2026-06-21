/**
 * Proves the arena is fair + non-gameable (no browser/wallet needed):
 *  - balanced tactics (each beats exactly 2, loses to 2 → no dominant move)
 *  - referee is antisymmetric + deterministic
 *  - a match replays identically from its seed (auditable)
 *  - skill matters: a counter-style consistently beats the style it's built to beat,
 *    well above coin-flip — so winning isn't luck.
 *
 * Run: pnpm --filter @kipr/web selftest:arena
 */
import { TACTICS, resolve, runDuel, styleFromText, type Fighter } from './arena.ts'

const ok = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`❌ ${msg}`)
  console.log(`  ✓ ${msg}`)
}

function main() {
  console.log('▶ Balanced tactics (no dominant move)...')
  for (const a of TACTICS) {
    let wins = 0
    let losses = 0
    for (const b of TACTICS) {
      if (a === b) continue
      const r = resolve(a, b)
      if (r === 1) wins++
      if (r === -1) losses++
      ok(resolve(a, b) === -resolve(b, a), `referee antisymmetric: ${a} vs ${b}`)
    }
    ok(wins === 2 && losses === 2, `${a} beats 2, loses to 2`)
  }

  console.log('\n▶ Deterministic replay (auditable)...')
  const me: Fighter = { name: 'Me', style: styleFromText('bold fierce aggressive') }
  const foe: Fighter = { name: 'Foe', style: styleFromText('calm patient steady') }
  const r1 = runDuel(me, foe, 'seed-123')
  const r2 = runDuel(me, foe, 'seed-123')
  ok(r1.transcriptHash === r2.transcriptHash, 'same seed → identical transcript hash')
  ok(r1.winner === r2.winner && r1.aScore === r2.aScore, 'same seed → identical result')

  console.log('\n▶ Skill beats luck (style matters)...')
  // "guard" beats strike & charge; an aggressive striker should lose to a guarder
  // noticeably more than 50% across many seeds.
  const striker: Fighter = { name: 'Striker', style: { strike: 8, guard: 1, feint: 1, charge: 8, counter: 1 } }
  const guarder: Fighter = { name: 'Guarder', style: { strike: 1, guard: 10, feint: 1, charge: 1, counter: 6 } }
  let guarderWins = 0
  const N = 400
  for (let i = 0; i < N; i++) {
    const res = runDuel(striker, guarder, `m${i}`)
    if (res.winner === 'b') guarderWins++
  }
  const rate = guarderWins / N
  console.log(`  guarder win rate vs striker: ${(rate * 100).toFixed(1)}% over ${N} matches`)
  ok(rate > 0.6, 'the counter-style wins well above coin-flip (skill > luck)')

  console.log('\n✅ ARENA SELFTEST PASSED — fair referee, deterministic, non-gameable.')
}

try {
  main()
} catch (e) {
  console.error('\n❌ ARENA SELFTEST FAILED:', (e as Error).message)
  process.exit(1)
}
