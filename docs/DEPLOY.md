# Deploying iWORLD — the economical way

**TL;DR:** the iWORLD client is a static app. Hosting it costs **$0** and needs **zero
0G**. 0G is only spent by users (their own wallets) and, optionally, by the funder
service. So launch the frontend free, skip the funder for now, and let users
faucet-fund themselves. Turn on sponsored onboarding later when 0G is easier to get.

---

## What costs what

| Piece | Cost | Needs 0G? |
|---|---|---|
| **Frontend (apps/web)** — static SPA | **Free** (Cloudflare Pages / Vercel free tier) | **No** |
| **Users** — save to 0G, TEE chat | their own wallet | Yes (they faucet / fund themselves) |
| **Funder service** (optional, sponsored onboarding) | a tiny server + a funded sponsor wallet | Yes — **defer until 0G is plentiful** |

---

## Recommended: Cloudflare Pages (free, static, global CDN)

Most generous free tier, no cold starts, ideal for a static SPA.

1. Push to GitHub (done — `github.com/Oltking/iWORLD`).
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** →
   pick the `iWORLD` repo.
3. Build settings:
   - **Framework preset:** None / Vite
   - **Build command:** `pnpm install && pnpm --filter @kipr/web build`
   - **Build output directory:** `apps/web/dist`
   - **Root directory:** *(leave as repo root)*
   - **Environment variables:**
     - `VITE_PRIVY_APP_ID` = your Privy app id (the public client id)
     - *(leave `VITE_FUNDER_URL` UNSET — no funder at launch)*
   - **Node version:** set `NODE_VERSION = 22` (or higher) in env vars.
4. Deploy. You get a free `*.pages.dev` URL (add a custom domain later, free).

### One required step in Privy
Add your deployed origin to **Privy dashboard → your app → Allowed origins / domains**
(e.g. `https://iworld.pages.dev`). Otherwise email/passkey login is blocked on the
live site.

---

## Alternative: Vercel CLI (run it yourself)

```bash
npm i -g vercel
vercel            # log in, link the project
# When prompted: Build command  → pnpm --filter @kipr/web build
#                Output dir      → apps/web/dist
vercel --prod
```
Set `VITE_PRIVY_APP_ID` in the Vercel project's Environment Variables.

---

## When you're ready to sponsor onboarding (later, costs 0G)

1. Fund a **dedicated sponsor wallet** with some 0G.
2. Deploy `packages/server`'s funder on a free tier (Render/Railway/Fly), with env:
   `SPONSOR_PRIVATE_KEY`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `FUNDER_DRIP_OG`,
   `FUNDER_WEB_ORIGIN=https://<your-site>`.
3. Set `VITE_FUNDER_URL=https://<your-funder>` in the frontend env and redeploy.
   The "Get free starter 0G" button lights up; until then, users see the faucet link.

Keep `FUNDER_DRIP_OG` small (e.g. `0.05`) to stretch scarce 0G — that's enough for
storage. Compute (TEE chat) needs more per user; sponsor it only when supply allows.
