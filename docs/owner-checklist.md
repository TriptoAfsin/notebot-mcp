# Owner checklist: what's left for you

Everything in code is done and pushed (CI green). These steps need your personal Railway, Cloudflare and Facebook accounts. The Railway CLI on this machine is logged into the work account, so Claude can't do them.

## 1. Railway: create the service (about 10 min)

- [ ] Open the **notebot** project on your **personal** Railway account.
- [ ] **New → GitHub repo → `TriptoAfsin/notebot-mcp`**. Railpack picks up Bun. `railway.json` already sets the start command and the `/health` check.
- [ ] **Variables** tab → Raw editor → paste the block below, then fill in the two `<…>` values:

```
PUBLIC_URL=https://ai.butexnotebot.com
KEY_SIGNING_SECRET=<openssl rand -base64 48>
ADMIN_API_KEY=<another openssl rand -base64 48>
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
ANALYTICS_API_URL=http://${{notebot-anlaytics-go.RAILWAY_PRIVATE_DOMAIN}}:${{notebot-anlaytics-go.PORT}}
ANALYTICS_ADMIN_KEY=${{notebot-anlaytics-go.ADMIN_KEY}}
ENGINE_API_URL=http://${{notebot-engine-v2.RAILWAY_PRIVATE_DOMAIN}}:${{notebot-engine-v2.PORT}}
RESEND_API_KEY=${{notebot-engine-v2.RESEND_API_KEY}}
MAIL_FROM=NoteBot <notebot@t21.dev>
MAIL_REPLY_TO=afsintripto@gmail.com
```

Notes:
- **KEY_SIGNING_SECRET:** set it once and never change it. Changing it breaks every free key already handed out.
- **ADMIN_API_KEY:** your private key for the analytics MCP. Save it in your password manager. On your own machine, also keep it in a `NOTEBOT_ADMIN_KEY` environment variable.
- **Service names:** if a service has a different name in your project (for example `Postgres`, `Redis`, or `notebot-anlaytics-go` with its typo), change the `${{…}}` references to match.
- **Database:** the service creates its own `mcp` schema in Postgres and touches nothing else.

## 2. Domain: ai.butexnotebot.com (about 5 min)

- [ ] On the new service, go to **Settings → Networking → Custom domain** and enter `ai.butexnotebot.com`.
- [ ] In **Cloudflare DNS** for butexnotebot.com, add the CNAME that Railway shows (`ai` → `xxxx.up.railway.app`). DNS-only (grey cloud) is simplest.
- [ ] Wait until Railway shows the certificate as issued.

## 3. Check it's live (2 min)

- [ ] Open https://ai.butexnotebot.com/health. You should see `database: ok` and `email: configured`.
- [ ] Open https://ai.butexnotebot.com. The dashboard loads, and "Get a free key" works with your email.
- [ ] Request the key again with the same email. This time it should be **emailed**, not shown on screen.
- [ ] Tell Claude "deployed". Claude runs the smoke suite against production (`bun run scripts/smoke.ts https://ai.butexnotebot.com`).

## 4. Connect it yourself

- [ ] **Claude:** Settings → Connectors → Add custom connector →
  - `https://ai.butexnotebot.com/butex/mcp`
  - `https://ai.butexnotebot.com/notebot/mcp`
- [ ] **ChatGPT:** Settings → Apps & Connectors → Developer mode → Create (OAuth), with the same two URLs.
- [ ] **Analytics (admin only):** follow [analytics-setup.md](analytics-setup.md) with your `ADMIN_API_KEY`.

## 5. Related services

- [ ] Make sure **notebot-anlaytics-go** and the **analytics dashboard** are running the latest main. That build has the privacy fix and the login that uses the server-side `ADMIN_KEY`. Once confirmed, you can delete the old `VITE_SECRET_PASS` variable from the dashboard service.
- [ ] Make sure `t21.dev` is still verified in **Resend**, or key-recovery emails won't send.

## 6. Facebook launch

Files are in `T:\personal-projects\notebot\notebot-marketing\posts\05-mcp-launch\`:
- `post-facebook.md` (or `post-facebook.docx`) has five posts with captions.
- `images/` holds the posters (40–52). Dark versions are in `images/dark/`.

- [ ] Post the launch post (posters 40, 43, 44) **after step 3 passes**, so the links work.
- [ ] Space out the follow-ups and the two how-it-works carousels (45–48 BUTEX, 49–52 NoteBot) over the next days.

## If something goes wrong

| Symptom | Fix |
| --- | --- |
| `/health` says `database: down` | `DATABASE_URL` reference is wrong, or Postgres is a different service name |
| `email: not configured` | `RESEND_API_KEY` is missing |
| Notes tools fail | `ENGINE_API_URL` is wrong (check the engine's service name and PORT) |
| Analytics MCP returns 401 | You're not using `ADMIN_API_KEY`; free keys are refused by design |
| Analytics user/error tools come back empty | `ANALYTICS_ADMIN_KEY` doesn't match analytics-go's `ADMIN_KEY` |
| A leaked admin key | Change `ADMIN_API_KEY`, then run `UPDATE mcp.api_keys SET revoked_at = now() WHERE tier = 'admin' AND revoked_at IS NULL;` |
