/**
 * Compute-relay config (approach C — shared, private, metered TEE chat).
 *
 * One HOUSE wallet opens ONE funded 0G Compute ledger that everyone draws from. The
 * relay mints a CONTENT-FREE session token per request (signed by the house wallet,
 * never touching message text), so the browser talks to the TEE provider directly and
 * the relay never sees a conversation. Per-user metering caps the shared pool.
 */
import { config as loadDotenv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../../../..')
loadDotenv({ path: resolve(repoRoot, '.env') })

function required(name: string): string {
  const v = process.env[name]
  if (!v || v.trim() === '' || v.includes('your_')) {
    throw new Error(`Missing required env var ${name}. Set it in .env before running the relay.`)
  }
  return v.trim()
}
const optional = (name: string, fallback: string) => (process.env[name]?.trim() || fallback)

export interface RelayConfig {
  port: number
  evmRpc: string
  chainId: number
  /** Dedicated HOUSE wallet (NOT a user's). Funds the shared compute ledger. Secret. */
  houseKey: string
  /** Optional: pin a TeeML provider. */
  providerAddr?: string
  /** Messages per user per day (metering). */
  dailyQuota: number
  webOrigin: string
}

let cached: RelayConfig | null = null

export function getRelayConfig(): RelayConfig {
  if (cached) return cached
  cached = {
    port: Number(optional('RELAY_PORT', '8788')),
    evmRpc: optional('ZG_EVM_RPC', 'https://evmrpc-testnet.0g.ai'),
    chainId: Number(optional('ZG_CHAIN_ID', '16602')),
    // Use a dedicated HOUSE_PRIVATE_KEY if set; otherwise reuse the wallet already in
    // .env (ZG_PRIVATE_KEY) — handy when its compute ledger is already funded.
    houseKey: (process.env.HOUSE_PRIVATE_KEY?.trim() || required('ZG_PRIVATE_KEY')),
    providerAddr: process.env.ZG_COMPUTE_PROVIDER_ADDR?.trim() || undefined,
    dailyQuota: Number(optional('RELAY_DAILY_QUOTA', '50')),
    webOrigin: optional('RELAY_WEB_ORIGIN', 'http://localhost:5173'),
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(cached.houseKey)) {
    throw new Error('HOUSE_PRIVATE_KEY must be a 0x-prefixed 32-byte private key.')
  }
  return cached
}

/** The message a user signs to prove their address to the relay (day-scoped, no popup spam). */
export function relayAuthMessage(day: string): string {
  return `iWORLD compute access\nDay: ${day}`
}

export const utcDay = (): string => new Date().toISOString().slice(0, 10)
