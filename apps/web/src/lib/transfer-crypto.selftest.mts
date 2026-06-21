/**
 * Proves the re-keyed brain transfer (no browser/wallet needed). Alice owns an agent
 * brain encrypted to HER; she hands it to Bob; ONLY Bob can open it; a stranger can't;
 * and Bob can re-derive his key on a fresh device and still open it.
 *
 * Run: pnpm --filter @kipr/web selftest:transfer
 */
import { Wallet } from 'ethers'
import { deriveTransferKey, transferPubKey, sealToRecipient, openSealed } from './transfer-crypto.ts'

const eq = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i])
const ok = (c: boolean, m: string) => {
  if (!c) throw new Error(`❌ ${m}`)
  console.log(`  ✓ ${m}`)
}

async function main() {
  const alice = Wallet.createRandom()
  const bob = Wallet.createRandom()
  const brain = new TextEncoder().encode(
    JSON.stringify({ name: 'Biscuit', vibe: 'warm', memory: ['learned guitar', 'dog named Biscuit'] }),
  )

  console.log('▶ Bob publishes his transfer public key...')
  const bobKey = await deriveTransferKey(bob, bob.address)
  const bobPub = transferPubKey(bobKey)
  ok(bobPub.startsWith('0x') && bobPub.length === 68, 'compressed pubkey (33 bytes) derived')

  console.log('\n▶ Alice seals the agent brain to Bob...')
  const sealed = await sealToRecipient(bobPub, brain)
  ok(!eq(sealed, brain) && sealed.length > brain.length, 'sealed bundle is ciphertext, not plaintext')

  console.log('\n▶ Bob opens it (the brain transfers)...')
  const opened = await openSealed(bobKey, sealed)
  ok(eq(opened, brain), 'Bob recovers the exact brain — the trained mind transferred')

  console.log('\n▶ Fresh device: Bob re-derives his key and still opens it...')
  const bobAgain = await deriveTransferKey(bob, bob.address)
  ok(transferPubKey(bobAgain) === bobPub, 're-derived key is identical (recoverable)')
  ok(eq(await openSealed(bobAgain, sealed), brain), 'opens on a fresh device with key alone')

  console.log('\n▶ A stranger cannot open it...')
  let threw = false
  try {
    await openSealed(await deriveTransferKey(Wallet.createRandom(), '0x0'), sealed)
  } catch {
    threw = true
  }
  ok(threw, 'wrong key fails (only the intended recipient can open)')

  console.log('\n▶ Alice herself cannot re-open it (it was sealed to Bob)...')
  let aliceThrew = false
  try {
    await openSealed(await deriveTransferKey(alice, alice.address), sealed)
  } catch {
    aliceThrew = true
  }
  ok(aliceThrew, 'sealed to Bob only — not even the sender can re-open')

  console.log('\n✅ TRANSFER SELFTEST PASSED — agents transfer brain-and-all, no TEE oracle needed.')
}

main().catch((e) => {
  console.error('\n❌ TRANSFER SELFTEST FAILED:', e.message ?? e)
  process.exit(1)
})
