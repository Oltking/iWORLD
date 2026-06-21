/**
 * Re-keyed brain transfer (the moat) — let a buyer decrypt an agent's brain they did
 * NOT encrypt, with no TEE oracle and no raw private keys in the browser.
 *
 * How: each user deterministically derives a secp256k1 TRANSFER KEYPAIR from a wallet
 * signature (re-derivable forever, never leaves the device). The recipient publishes
 * their transfer PUBLIC key; the seller ECIES-encrypts the agent's brain to it; the
 * recipient re-derives their transfer PRIVATE key and decrypts. Standard ECIES
 * (ephemeral ECDH → AES-256-GCM), so only the recipient can open it.
 *
 * This is seller-assisted (the seller, who can read the brain, does the re-encryption).
 * The fully-offline marketplace version is the canonical ERC-7857 TEE-oracle flow; this
 * achieves the same guarantee — "the trained mind transfers to the buyer" — today.
 */
import { SigningKey, getBytes, hexlify, randomBytes, keccak256 } from 'ethers'

export type MessageSigner = { signMessage(message: string | Uint8Array): Promise<string> }

const TRANSFER_MESSAGE = (address: string): string =>
  [
    'iWORLD agent transfer key v1',
    '',
    'Sign to derive your agent-transfer keypair.',
    'This lets others hand you a trained agent that only you can open.',
    'It never leaves your device.',
    `Account: ${address.toLowerCase()}`,
  ].join('\n')

// TS5.7 typed-array generic vs DOM BufferSource — runtime is always ArrayBuffer-backed.
const bs = (u: Uint8Array): BufferSource => u as unknown as BufferSource

/** Derive the user's deterministic transfer keypair from a one-time wallet signature. */
export async function deriveTransferKey(signer: MessageSigner, address: string): Promise<SigningKey> {
  const sig = await signer.signMessage(TRANSFER_MESSAGE(address))
  const priv = keccak256(getBytes(sig)) // 32-byte private key
  return new SigningKey(priv)
}

/** The public key others encrypt to (compressed, 33 bytes hex). Safe to publish. */
export function transferPubKey(key: SigningKey): string {
  return key.compressedPublicKey
}

async function aesKeyFromShared(sharedHex: string): Promise<CryptoKey> {
  const material = getBytes(keccak256(sharedHex)) // 32-byte AES-256 key from the ECDH secret
  return crypto.subtle.importKey('raw', bs(material), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

const MAGIC = [0x49, 0x58, 0x46, 0x52] as const // "IXFR"

/** ECIES-encrypt bytes to a recipient's transfer public key. Output: MAGIC ‖ ephPub(33) ‖ iv(12) ‖ ct. */
export async function sealToRecipient(recipientPubKey: string, plaintext: Uint8Array): Promise<Uint8Array> {
  const eph = new SigningKey(hexlify(randomBytes(32)))
  const shared = eph.computeSharedSecret(recipientPubKey)
  const aesKey = await aesKeyFromShared(shared)
  const iv = randomBytes(12)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bs(iv) }, aesKey, bs(plaintext)))
  const ephPub = getBytes(eph.compressedPublicKey) // 33 bytes
  const out = new Uint8Array(4 + 33 + 12 + ct.length)
  out.set(MAGIC, 0)
  out.set(ephPub, 4)
  out.set(iv, 37)
  out.set(ct, 49)
  return out
}

/** Open a sealed bundle with your re-derived transfer private key. Throws on wrong key/tamper. */
export async function openSealed(myKey: SigningKey, blob: Uint8Array): Promise<Uint8Array> {
  if (blob.length < 49 || !MAGIC.every((b, i) => blob[i] === b)) {
    throw new Error('Not an iWORLD transfer bundle.')
  }
  const ephPub = blob.subarray(4, 37)
  const iv = blob.subarray(37, 49)
  const ct = blob.subarray(49)
  const shared = myKey.computeSharedSecret(hexlify(ephPub))
  const aesKey = await aesKeyFromShared(shared)
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bs(iv) }, aesKey, bs(ct)))
  } catch {
    throw new Error('Could not open the transfer — wrong key or corrupt bundle.')
  }
}
