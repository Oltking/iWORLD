/**
 * Centralised, validated 0G configuration.
 *
 * Loads from the repo-root .env (see env.example). Fails loud and early if a
 * required value is missing — per the non-negotiable "if a credential/capability
 * is missing, stop and ask; never stub around it." Secrets are NEVER logged.
 *
 * Network constants verified against research/RESEARCH_FULL.md (harvested 2026-06-19):
 *   Galileo testnet chainId 16602; Aristotle mainnet 16661.
 */
import { config as loadDotenv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
// repo root is two levels up from packages/og/src
const repoRoot = resolve(__dirname, '../../..')
loadDotenv({ path: resolve(repoRoot, '.env') })

export type NetworkName = 'testnet' | 'mainnet'

export interface KiprOgConfig {
  evmRpc: string
  chainId: number
  /** 0x-prefixed private key. Treat as a secret — never log this. */
  privateKey: string
  indexerRpc: string
  /** Optional override; the SDK auto-discovers the flow contract from the indexer. */
  storageFlowContract?: string
  /** Optional: pin a TeeML provider for deterministic builds. */
  computeProviderAddr?: string
  /** Optional: pin a model id. */
  computeModelId?: string
  network: NetworkName
}

function required(name: string): string {
  const v = process.env[name]
  if (!v || v.trim() === '' || v.startsWith('0x_your_') || v.includes('your_')) {
    throw new Error(
      `Missing required env var ${name}. Copy env.example to .env and fill it in. ` +
        `(Compute needs a funded testnet wallet — see MASTER_SPEC §6.)`,
    )
  }
  return v.trim()
}

function optional(name: string): string | undefined {
  const v = process.env[name]
  if (!v || v.trim() === '' || v.includes('your_')) return undefined
  return v.trim()
}

let cached: KiprOgConfig | null = null

// Public 0G Galileo testnet constants — sane defaults so only ZG_PRIVATE_KEY is required
// (a hosted relay shouldn't need the operator to set every network URL by hand).
const DEFAULT_RPC = 'https://evmrpc-testnet.0g.ai'
const DEFAULT_CHAIN_ID = 16602
const DEFAULT_INDEXER = 'https://indexer-storage-testnet-turbo.0g.ai'

export function getConfig(): KiprOgConfig {
  if (cached) return cached

  const chainId = Number(optional('ZG_CHAIN_ID') ?? DEFAULT_CHAIN_ID)
  if (!Number.isInteger(chainId)) {
    throw new Error(`ZG_CHAIN_ID must be an integer, got "${process.env.ZG_CHAIN_ID}"`)
  }
  const network: NetworkName = chainId === 16661 ? 'mainnet' : 'testnet'

  const privateKey = required('ZG_PRIVATE_KEY')
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error('ZG_PRIVATE_KEY must be a 0x-prefixed 32-byte (64 hex char) private key.')
  }

  cached = {
    evmRpc: optional('ZG_EVM_RPC') ?? DEFAULT_RPC,
    chainId,
    privateKey,
    indexerRpc: optional('ZG_INDEXER_RPC') ?? DEFAULT_INDEXER,
    storageFlowContract: optional('ZG_STORAGE_FLOW_CONTRACT'),
    computeProviderAddr: optional('ZG_COMPUTE_PROVIDER_ADDR'),
    computeModelId: optional('ZG_COMPUTE_MODEL_ID'),
    network,
  }
  return cached
}

/** Safe, secret-free view of config for logging. */
export function redactedConfig(c: KiprOgConfig) {
  return {
    network: c.network,
    chainId: c.chainId,
    evmRpc: c.evmRpc,
    indexerRpc: c.indexerRpc,
    storageFlowContract: c.storageFlowContract ?? '(auto-discover)',
    computeProviderAddr: c.computeProviderAddr ?? '(pick at runtime)',
    computeModelId: c.computeModelId ?? '(provider default)',
    privateKey: '***redacted***',
  }
}
