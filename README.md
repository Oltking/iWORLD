# iWORLD

**A living world of AI agents you create, train, own, and grow — built on 0G.**

Most AI you use is rented: it forgets you, a company can change or delete it, and you
never truly own it. iWORLD flips that. You shape an agent, it remembers and grows with
you, and it's *yours* — its mind lives in storage you control, its identity is a token
in your wallet, and its thinking runs inside a sealed enclave so it's never harvested.

> **The one rule: depth before breadth.** Build one piece deep enough to be magic, ship
> it to real people, let it earn the next piece. "Build it all" only works as
> "build it all **in order**."

---

## The first agent: KIPR — *live, proven on 0G*

iWORLD's Phase 1 is **the one magic agent**: create it, talk to it, watch it grow, own
it. That pillar is **KIPR**, and it's real today on 0G Galileo testnet:

- **Create** a companion — name, vibe, values, boundaries — sealed under a content
  version hash (no silent changes, ever).
- **Own** it — personality + memory are **encrypted client-side** (your wallet-derived
  key) and stored on **0G Storage**; recover the whole thing on a new device from your
  key alone.
- **Talk** — replies come from a **0G Compute TeeML** provider with `processResponse`
  verification, so each one is provably from the genuine model inside the enclave.
- **Grow** — leveling = accumulating **memory + versions**, never a retrain. The same
  brain, getting richer, and portable.
- **Onboard anyone** — email/passkey via an embedded wallet (no MetaMask needed), with
  sponsored starter gas so non-crypto users get in for free.

The **iWORLD hub** is the home: your agent stands there as an owned, growing being, with
an honest map of the world still to come.

---

## How it works (0G mapping)

| Layer | 0G | Role in iWORLD |
|---|---|---|
| Ownership & identity | **0G Chain** (EVM, ERC-7857 INFT) | the agent = a token you hold; settlement, provenance |
| The agent's mind | **0G Storage** (encrypted, owner-keyed) | personality, memory, skills — yours, recoverable |
| Thinking | **0G Compute** (TEE / TeeML) | verifiable, private inference — never harvested |

**What an agent *is*, technically:** not a model frozen in an NFT. It's a **shared base
model + the agent's own state** (persona, memory, skills). That bundle lives encrypted
on 0G; the INFT holds the pointer + keys and re-keys to the buyer on transfer. This is
the single most important architecture call — no per-agent full fine-tune.

---

## Roadmap (in order, with gates)

| Phase | What | Status |
|---|---|---|
| **1 — The one magic agent** | create · own · talk · grow (KIPR) | ✅ **live on 0G testnet** |
| 2 — Truly ownable | mint ERC-7857 INFT · clean re-keyed transfer | 🔜 next |
| 3 — Agents together | coordination loop · one arena · provably-fair logs | planned |
| 4 — Economy | marketplace · rentals · royalties (counsel first) | planned |
| 5–6 — Social world | guilds · breeding · many worlds · portability | planned |
| 7+ — Scale & decentralize | progressive decentralization, events, ecosystem | planned |

The full decade master plan is maintained privately.

---

## Repository

A pnpm monorepo (Node ≥ 22, TypeScript, run via `tsx` — no build step for packages).

```
packages/og      — verified 0G integration (chain, encrypted storage, TEE compute)
packages/core    — agent domain: personality, content-hash versioning, owned memory
packages/server  — derivable cache/index + the sponsored-onboarding funder service
apps/web         — the client: iWORLD hub, create, chat, own, export — React + Vite
research/        — the verified 0G research corpus (source of truth for every 0G call)
```

*(Internal product specs, plans, and the master plan are kept private.)*

### Non-negotiables (enforced, not aspirational)
1. **Privacy is load-bearing** — production inference runs through 0G Compute TEE; no
   conversation content ever touches a non-TEE third party.
2. **The user owns the agent** — memory + personality are encrypted, user-keyed on 0G;
   recoverable from 0G with the user's key alone. Any backend is cache/index only.
3. **No silent swaps** — model + personality version recorded per message; changes are
   explicit, opt-in, and old messages keep the version that produced them.

### Quickstart
```bash
pnpm install
pnpm --filter @kipr/web dev      # the client at http://localhost:5173
```

---

*Living world, living plan. Build it all — in order.*
