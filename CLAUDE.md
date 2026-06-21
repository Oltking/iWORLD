# CLAUDE.md — KIPR (read this first)

> **iWORLD** is the umbrella project (a living world of owned, evolving AI agents on 0G — see `README.md` + `docs/iWORLD_master_plan.md`). **KIPR is its Phase-1 pillar**: the one magic agent (create · own · talk · grow). Repo: github.com/Oltking/iWORLD. Discipline = depth before breadth.

## What we're building
**KIPR** — a private AI companion that's truly yours. Conversations run inside a TEE so they're never harvested, and the companion's memory + personality live in storage the user owns, so no company can alter, censor, or take it away. Built on **0G (Zero Gravity)**: 0G Compute for TEE-verified inference, 0G Storage for user-owned encrypted memory, 0G Chain (EVM) for identity/settlement.

## Read these, in this order, before writing any code
1. `research/RESEARCH_FULL.md` — **source of truth** for every 0G API. Verify every 0G call against this (or live docs at docs.0g.ai) before using it. **Never invent an API.**
2. `docs/MASTER_SPEC.md` — product, architecture, data model, phased build order, non-negotiables.
3. `docs/API_APPENDIX.md` — verified 0G signatures (storage, compute, chain).
4. `docs/FRONTEND_ATTACK_PLAN.md` — UI build order and component plan.
5. `design/` — design tokens + screens, if present.

If any of files 1–4 are missing, **stop and tell me** — do not proceed from memory.

## Non-negotiables (these override convenience every time)
1. **Privacy is load-bearing.** All companion inference runs through 0G Compute TEE-verified inference. No conversation content ever touches a non-TEE third-party model on a production path. (`DEV_FALLBACK_MODEL_KEY` is local-dev only, behind an explicit flag.)
2. **The user owns the companion.** Memory, personality config, and history persist to 0G Storage under keys the user controls. Our DB is a cache/index only — **never the source of truth.** A user must be able to recover their companion from 0G with their own key alone.
3. **Client-side encryption.** Everything written to 0G Storage is encrypted client-side with a key derived from the user's wallet/passphrase. Storage nodes can never read it.
4. **No silent swaps.** Record model + system prompt + personality **version (hash)** per response. Personality changes need explicit user opt-in. Old messages keep the version that produced them.
5. **No training on user data. No selling/sharing.** Stated in-product, enforced architecturally.
6. **Export & real delete.** Full encrypted export from 0G + local decrypt; true delete.
7. **Human approval before destructive actions** (wipe memory, delete companion).
8. **Real, no mocks in production paths.** If a credential or capability is missing, stop and ask — don't stub around it.

## Tech stack (verified from research)
- **Inference:** 0G Compute Direct path, `@0gfoundation/0g-compute-ts-sdk` (`createZGComputeNetworkBroker`), TeeML provider, `processResponse()` per message for the verifiability guarantee. Node >= 22.
- **Encrypted storage:** `@0gfoundation/0g-storage-ts-sdk` (v1.2.6+) with ECIES encrypt-to-self (wallet key). `ethers` peer dep.
- **Owned identity:** ERC-7857 "Agent NFT" (`0g-agent-nft` repo) — companion = token, personality = private encrypted metadata.
- **Memory:** 0g-memory (EverMemOS) REST API at `localhost:1995`, encrypted on-chain, user-keyed. (`0gmem` is the lighter fallback.)
- **Chain:** 0G Galileo testnet (chain ID 16602 — confirm vs 16601), ethers v6.
- ⚠️ Do NOT use the deprecated `@0glabs/0g-ts-sdk` / `@0glabs/0g-serving-broker` package names.

## Rules of engagement
- Live docs win over our appendix if they conflict; note the discrepancy and proceed.
- Secrets never in code, logs, or output. Never commit `.env`.
- Small, phase-scoped commits. Stop for review at the end of each phase with a real end-to-end smoke test (real data through 0G, not just "it compiles").
