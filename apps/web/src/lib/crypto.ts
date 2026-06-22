/**
 * Client-side encryption (non-negotiable #3). The browser can't read the wallet's
 * private key (MetaMask only signs), so — unlike the server's ECIES-to-self path —
 * iWORLD derives a symmetric key from a DETERMINISTIC wallet signature:
 *
 *   sig = wallet.sign(fixed message bound to the account)   ← deterministic (RFC 6979)
 *   key = HKDF-SHA256(sig)                                  ← AES-256-GCM key
 *
 * The key never leaves the device and is reproducible on any device by re-signing
 * the same message with the same wallet — that's the "recover with my key alone"
 * (P4) promise. AES-GCM is authenticated: a wrong key fails loudly on decrypt
 * (no silent ciphertext, unlike the storage SDK's ECIES path).
 *
 * ⚠️ Reproducibility relies on the wallet producing deterministic ECDSA signatures
 * (true for MetaMask and most wallets). `keyCheckValue()` lets the app detect a
 * non-deterministic wallet before trusting the key for real data.
 */
import { getBytes } from 'ethers'

/** Anything that can sign a message — JsonRpcSigner (browser) or Wallet (tests). */
export type MessageSigner = { signMessage(message: string | Uint8Array): Promise<string> }

const MAGIC = [0x4b, 0x49, 0x50, 0x52] as const // "KIPR"
const VERSION = 1
const enc = new TextEncoder()

// TS 5.7 types typed-arrays as Uint8Array<ArrayBufferLike>, which the DOM's
// BufferSource (ArrayBuffer-backed) won't accept. Runtime values are always
// ArrayBuffer-backed here, so coerce for the Web Crypto calls.
const bs = (u: Uint8Array): BufferSource => u as unknown as BufferSource

/** The exact message the user signs to unlock — its signature IS the encryption key. */
export function keyDerivationMessage(address: string): string {
  return [
    'iWORLD key derivation v1',
    '',
    'Sign to unlock your private agents.',
    'This signature is your encryption key — it never leaves your device.',
    'Only sign this on iWORLD.',
    `Account: ${address.toLowerCase()}`,
  ].join('\n')
}

/** The original (pre-rebrand) message — kept so agents created before the rebrand still
 * decrypt. Derived on demand only when a new-key decrypt fails; never change these bytes. */
function legacyKeyDerivationMessage(address: string): string {
  return [
    'KIPR key derivation v1',
    '',
    'Sign to unlock your private companion.',
    'This signature is your encryption key — it never leaves your device.',
    'Only sign this on KIPR.',
    `Account: ${address.toLowerCase()}`,
  ].join('\n')
}

async function keyFromSignature(signature: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', bs(getBytes(signature)), 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: bs(enc.encode('kipr.storage.salt.v1')), // internal salt — keep stable (invisible to users)
      info: bs(enc.encode('kipr:aes-256-gcm')),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

// Remember who's unlocked so we can lazily derive the legacy (KIPR) key — signing the old
// message only if a pre-rebrand blob fails to open with the new key.
let _signer: MessageSigner | null = null
let _address: string | null = null
let _legacyKey: CryptoKey | null = null

/** Derive the AES-256-GCM owner key from a one-time wallet signature. */
export async function deriveOwnerKey(signer: MessageSigner, address: string): Promise<CryptoKey> {
  _signer = signer
  _address = address.toLowerCase()
  _legacyKey = null
  return keyFromSignature(await signer.signMessage(keyDerivationMessage(address)))
}

/** Lazily derive (and cache) the legacy key for reading pre-rebrand data. */
async function legacyOwnerKey(): Promise<CryptoKey | null> {
  if (_legacyKey) return _legacyKey
  if (!_signer || !_address) return null
  _legacyKey = await keyFromSignature(await _signer.signMessage(legacyKeyDerivationMessage(_address)))
  return _legacyKey
}

/**
 * A short, non-secret fingerprint of the derived key — to detect a mismatched
 * re-derivation (e.g. a wallet that signs non-deterministically). Deterministic by
 * construction: encrypts a fixed probe under a fixed zero IV, then hashes. Used ONLY
 * for this check value, never for real data (a zero IV would be unsafe to reuse there).
 */
export async function keyCheckValue(key: CryptoKey): Promise<string> {
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: new Uint8Array(12) }, key, bs(enc.encode('kipr-kcv'))),
  )
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bs(ct)))
  return (
    '0x' +
    Array.from(digest.slice(0, 6))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  )
}

/** Encrypt to an owned blob: MAGIC(4) ‖ version(1) ‖ iv(12) ‖ ciphertext+tag. */
export async function encryptOwned(key: CryptoKey, plaintext: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bs(iv) }, key, bs(plaintext)))
  const out = new Uint8Array(4 + 1 + 12 + ct.length)
  out.set(MAGIC, 0)
  out[4] = VERSION
  out.set(iv, 5)
  out.set(ct, 17)
  return out
}

/** Decrypt an owned blob. Throws on a wrong key or tampering (GCM auth). */
export async function decryptOwned(key: CryptoKey, blob: Uint8Array): Promise<Uint8Array> {
  if (blob.length < 17 || !MAGIC.every((b, i) => blob[i] === b)) {
    throw new Error('Not a KIPR encrypted blob (bad magic).')
  }
  if (blob[4] !== VERSION) throw new Error(`Unsupported KIPR blob version ${blob[4]}.`)
  const iv = blob.subarray(5, 17)
  const ct = blob.subarray(17)
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bs(iv) }, key, bs(ct)))
  } catch {
    // Might be a pre-rebrand (KIPR-key) blob — derive the legacy key on demand and retry.
    // Any subsequent re-save uses the new key, migrating the data forward automatically.
    const lk = await legacyOwnerKey().catch(() => null)
    if (lk) {
      try {
        return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bs(iv) }, lk, bs(ct)))
      } catch {
        /* legacy key didn't work either */
      }
    }
    throw new Error('Decryption failed — wrong key or corrupt data.')
  }
}
