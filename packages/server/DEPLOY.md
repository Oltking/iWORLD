# Deploying the iWORLD relay (one service = private TEE chat + storage)

The relay does two jobs for the **live** site:

1. **Compute** — mints content-free TEE session tokens (shared private chat).
2. **Storage** — uploads/serves your **encrypted** bytes to 0G from Node, so an HTTPS
   page isn't blocked by 0G's HTTP storage nodes (the "network error" on create).

It only ever sees **ciphertext**, and the house wallet pays the tiny storage gas — so
**users need no 0G to create, train, chat, or save.** Mint/market/transfer still use the
user's own wallet.

---

## Deploy on Render (free, ~3 min)

1. **render.com → New → Web Service** → connect `github.com/Oltking/iWORLD`.
2. Settings:
   - **Runtime:** Node
   - **Build Command:** `corepack enable && pnpm install`
   - **Start Command:** `pnpm --filter @kipr/server relay`
   - **Health Check Path:** `/health`
3. **Environment variables** (Settings → Environment):

   | Key | Value |
   |---|---|
   | `ZG_PRIVATE_KEY` | `0x…` the funded house wallet (the one with the compute ledger). **Secret.** |
   | `RELAY_WEB_ORIGIN` | `https://iworld-ai.vercel.app` (or `*` to allow any origin) |
   | `NODE_VERSION` | `22` (the 0G compute SDK needs Node ≥ 22) |
   | `RELAY_DAILY_QUOTA` | `50` (optional — free messages/user/day) |

4. Deploy. When live you'll get a URL like `https://iworld-relay.onrender.com`.
   Check it: open `https://<your-url>/health` — you should see JSON with the house address.

---

## Point the site at it

In **Vercel → iWORLD → Settings → Environment Variables**, set **both** to the relay URL,
then redeploy:

```
VITE_COMPUTE_RELAY_URL = https://iworld-relay.onrender.com
VITE_STORAGE_RELAY_URL = https://iworld-relay.onrender.com
```

That's it — chat goes live and "create" stops throwing the network error.

---

## Notes

- **Cold starts:** Render's free tier sleeps after ~15 min idle; the first request then
  takes ~30–60s (the relay also initialises the 0G compute broker on boot). Fine for a
  beta; upgrade the instance if you want it always-warm.
- **Funding the house wallet:** keep a little 0G in it for storage gas (each write is
  ~0.0001 0G) and top up the compute ledger as chat usage grows.
- **Fly.io / Railway** work the same way — same start command, same env vars; they inject
  `PORT`, which the relay already honors.
- **Privy email login** is separate: enable **Email** as a login method in the Privy
  dashboard and add your origins (`http://localhost:5173` and the Vercel URL) under
  allowed origins.
