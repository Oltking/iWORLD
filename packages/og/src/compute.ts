/**
 * 0G Compute — Direct path, TEE-verified inference (KIPR's privacy core).
 *
 * Verified against research/RESEARCH_FULL.md + cloned @0gfoundation/0g-compute-ts-sdk
 * (0.9.0-beta.0) source:
 *   - createZGComputeNetworkBroker(signer) -> { ledger, inference, fineTuning? }
 *   - inference.listService() -> ServiceStructOutput[] (provider, serviceType, url,
 *       model, verifiability, teeSignerAddress, teeSignerAcknowledged, ...)
 *   - inference.getServiceMetadata(provider, model?) -> { endpoint, model }
 *   - inference.getRequestHeaders(provider, content?) -> wallet-signed headers
 *   - inference.processResponse(provider, chatID?, content?) -> boolean | null  (THE proof)
 *   - ledger.addLedger(balanceOG) / depositFund(amountOG) / transferFund(provider,'inference',wei)
 *
 * KIPR uses ONLY verifiability === 'TeeML' providers in production: the model runs
 * inside the TEE and signs each response, so processResponse() proves which model
 * produced it ("no silent swap", non-negotiable #4). 'TeeTLS' (TEE-proxied centralized
 * LLM) and the Router are NOT the verified path.
 */
import { createRequire } from 'node:module'
import type { ChainContext } from './chain.js'
import { ONE_0G } from './chain.js'

// The SDK's ESM build has a broken re-export that Node 22 rejects (Render); its CommonJS
// build is fine. Load it via require() so it works across Node versions.
const { createZGComputeNetworkBroker } = createRequire(import.meta.url)(
  '@0gfoundation/0g-compute-ts-sdk',
) as typeof import('@0gfoundation/0g-compute-ts-sdk')

export type Broker = Awaited<ReturnType<typeof createZGComputeNetworkBroker>>

export interface InferenceService {
  provider: string
  serviceType: string
  url: string
  model: string
  verifiability: string
  teeSignerAddress: string
  teeSignerAcknowledged: boolean
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatResult {
  content: string
  model: string
  provider: string
  endpoint: string
  chatID: string | null
  /** processResponse result: true=TEE-verified, false=verification failed, null=skipped (no chatID). */
  teeVerified: boolean | null
}

export async function createBroker(ctx: ChainContext): Promise<Broker> {
  return createZGComputeNetworkBroker(ctx.wallet)
}

/** All inference services advertised on-chain. */
export async function listServices(broker: Broker): Promise<InferenceService[]> {
  const services = (await broker.inference.listService()) as unknown as InferenceService[]
  return services
}

/**
 * Pick a verifiable (TeeML) chatbot provider. Honors an explicit pin
 * (ZG_COMPUTE_PROVIDER_ADDR) but still asserts it is TeeML.
 */
export async function pickTeeMLProvider(
  broker: Broker,
  preferProvider?: string,
): Promise<InferenceService> {
  const services = await listServices(broker)
  const teeml = services.filter((s) => s.verifiability === 'TeeML')

  if (preferProvider) {
    const pinned = teeml.find((s) => s.provider.toLowerCase() === preferProvider.toLowerCase())
    if (!pinned) {
      throw new Error(
        `Pinned provider ${preferProvider} is not an available TeeML service. ` +
          `TeeML providers: ${teeml.map((s) => s.provider).join(', ') || '(none)'}`,
      )
    }
    return pinned
  }

  const chatbot = teeml.find((s) => s.serviceType === 'chatbot') ?? teeml[0]
  if (!chatbot) {
    throw new Error(
      `No TeeML (verifiable) providers available. Found ${services.length} services, ` +
        `none with verifiability=TeeML. KIPR requires TeeML for production inference.`,
    )
  }
  return chatbot
}

/**
 * Ensure the ledger exists and the provider sub-account is funded for inference.
 * Spends real testnet 0G. Idempotent-ish: creates the ledger if missing, tops up
 * if below target, then transfers to the provider (auto-acknowledges its TEE signer).
 * Defaults follow MASTER_SPEC §6: >=3 0G ledger, >=1 0G per provider.
 */
export async function ensureInferenceFunding(
  broker: Broker,
  provider: string,
  opts: { ledgerOG?: number; providerOG?: number } = {},
): Promise<void> {
  const ledgerOG = opts.ledgerOG ?? 3
  const providerOG = opts.providerOG ?? 1

  let hasLedger = true
  try {
    await broker.ledger.getLedger()
  } catch {
    hasLedger = false
  }

  if (!hasLedger) {
    console.log(`No ledger found — creating with ${ledgerOG} 0G...`)
    await broker.ledger.addLedger(ledgerOG)
  }

  console.log(`Transferring ${providerOG} 0G to provider ${provider} (inference)...`)
  await broker.ledger.transferFund(provider, 'inference', BigInt(providerOG) * ONE_0G)
}

/**
 * Run one TEE-verified chat completion and verify it.
 * Returns the answer plus provenance (provider, model, chatID, teeVerified).
 */
export async function chat(
  broker: Broker,
  service: InferenceService,
  messages: ChatMessage[],
): Promise<ChatResult> {
  const provider = service.provider
  const { endpoint, model } = await broker.inference.getServiceMetadata(provider)

  // Sign the request content (last user/system message content drives billing/auth).
  const signedContent = messages.map((m) => m.content).join('\n')
  const headers = await broker.inference.getRequestHeaders(provider, signedContent)

  const response = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(headers as unknown as Record<string, string>) },
    body: JSON.stringify({ model, messages }),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Inference request failed: HTTP ${response.status} ${body.slice(0, 300)}`)
  }
  const data: any = await response.json()
  const content: string = data?.choices?.[0]?.message?.content ?? ''
  if (!content) throw new Error('No content received from provider.')

  // chatID: prefer the signed ZG-Res-Key header, fall back to the completion id.
  const chatID: string | null =
    response.headers.get('ZG-Res-Key') ||
    response.headers.get('zg-res-key') ||
    data?.id ||
    data?.chatID ||
    null

  // THE proof: verify the TEE signature over this response.
  const teeVerified = chatID
    ? await broker.inference.processResponse(provider, chatID, content)
    : null

  return { content, model, provider, endpoint, chatID, teeVerified }
}
