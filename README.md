# NoteBot MCP

MCP servers for the BUTEX NoteBot family, served from **https://ai.butexnotebot.com**:

| Endpoint | Who | What |
| --- | --- | --- |
| `/butex/mcp` | anyone (free key or OAuth) | the BUTEX MCP: the official butex.edu.bd site. Notices (class routines, exam schedules, results, admission, with scanned notices read for the model), plus departments, teachers, offices, halls and programs |
| `/notebot/mcp` | anyone (same key) | the NoteBot knowledge base via notebot-engine-v2: notes, books, lab reports, question banks, syllabus, TexGPT answers, study plans, recommendations |
| `/analytics/mcp` | owner only (admin key) | NoteBot usage analytics via notebot-analytics-go |
| `/` | humans | dashboard: get a free key with an email (a repeat email gets its key *emailed*, never shown), copy client configs, install the skill, check or revoke a key |

Works in **Claude** (web, desktop, mobile: custom connector over OAuth), **ChatGPT** (web and app: developer-mode connector over OAuth, plus the `search`/`fetch` pair), **Claude Code**, **Cursor**, **VS Code**, and any Streamable-HTTP client.

Built to keep working when things break: per-upstream circuit breakers, retries with backoff, stale-cache fallback, a warm offline archive for search, Redis falling back to memory, and HMAC-signed keys that validate even with Postgres down. Every tool returns a readable error instead of throwing.

User setup: [docs/setup-guide.md](docs/setup-guide.md). What each server can do, with use cases: [docs/use-cases.md](docs/use-cases.md). Owner setup for the analytics server: [docs/analytics-setup.md](docs/analytics-setup.md). Public tool calls are reported to NoteBot analytics as platform `ai`. Every email that requests a key is kept in `mcp.contacts` (unsubscribe honoured; export at `/api/admin/contacts.csv` with `X-Admin-Key`).

See [AGENTS.md](AGENTS.md) for architecture and invariants, [design.md](design.md) for UI rules, and [docs/butex-site-audit.md](docs/butex-site-audit.md) for what the BUTEX site does and doesn't provide.

## Run locally

```bash
bun install
cp .env.example .env     # everything optional locally
bun run dev              # http://localhost:8080
bun test && bunx tsc --noEmit
BASE=http://localhost:8080 ADMIN_API_KEY=<yours> bun run smoke
```

## Deploy on Railway (notebot project)

1. **New service → GitHub repo → `TriptoAfsin/notebot-mcp`** in the existing notebot project. Railpack detects Bun; `railway.json` sets the start command and the `/health` check.
2. **Variables:**
   ```
   PUBLIC_URL=https://ai.butexnotebot.com
   KEY_SIGNING_SECRET=<openssl rand -base64 48>     # required; never rotate casually
   ADMIN_API_KEY=<a long random string only you know>
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   REDIS_URL=${{Redis.REDIS_URL}}
   ANALYTICS_API_URL=http://${{notebot-anlaytics-go.RAILWAY_PRIVATE_DOMAIN}}:${{notebot-anlaytics-go.PORT}}
   ANALYTICS_ADMIN_KEY=${{notebot-anlaytics-go.ADMIN_KEY}}
   ENGINE_API_URL=http://${{notebot-engine-v2.RAILWAY_PRIVATE_DOMAIN}}:${{notebot-engine-v2.PORT}}
   RESEND_API_KEY=${{notebot-engine-v2.RESEND_API_KEY}}
   MAIL_FROM=NoteBot <notebot@t21.dev>
   MAIL_REPLY_TO=afsintripto@gmail.com
   ```
   The service creates its own `mcp` schema in Postgres on boot and touches nothing else.
3. **Networking → Custom domain → `ai.butexnotebot.com`**, then add the CNAME Railway shows in Cloudflare (DNS-only/grey cloud is simplest; proxied also works).
4. Check `https://ai.butexnotebot.com/health` (`database: ok`, `email: configured`), then add the connectors in Claude or ChatGPT with `/butex/mcp` and `/notebot/mcp`.

## Skill

`skill/butex-notebot/` is served at `/skill/*`, with `install.sh`, `install.ps1` and a zip for claude.ai. It self-updates from `/skill/version.json`. Bump the version comment in its `SKILL.md` to release.
