# NoteBot MCP

MCP servers for the BUTEX NoteBot family, served from **https://ai.butexnotebot.com**:

| Endpoint | Who | What |
| --- | --- | --- |
| `/butex/mcp` | anyone (free key or OAuth) | official butex.edu.bd notices: class routines, exam schedules, results, admission, department notices, with scanned notices read for the model |
| `/analytics/mcp` | owner only (admin key) | NoteBot usage analytics via notebot-analytics-go |
| `/` | humans | dashboard: get a free key with an email, copy client configs, install the skill, check or revoke a key |

Works in **Claude** (web, desktop, mobile: custom connector over OAuth), **ChatGPT** (web and app: developer-mode connector over OAuth, plus the `search`/`fetch` pair), **Claude Code**, **Cursor**, **VS Code**, and any Streamable-HTTP client.

Built to keep working when things break: per-upstream circuit breakers, retries with backoff, stale-cache fallback, a warm offline archive for search, Redis falling back to memory, and HMAC-signed keys that validate even with Postgres down. Every tool returns a readable error instead of throwing.

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
   ```
   The service creates its own `mcp` schema in Postgres on boot and touches nothing else.
3. **Networking → Custom domain → `ai.butexnotebot.com`**, then add the CNAME Railway shows in Cloudflare (DNS-only/grey cloud is simplest; proxied also works).
4. Check `https://ai.butexnotebot.com/health`, then add the connector in Claude or ChatGPT with `https://ai.butexnotebot.com/butex/mcp`.

## Skill

`skill/butex-notebot/` is served at `/skill/*`, with `install.sh`, `install.ps1` and a zip for claude.ai. It self-updates from `/skill/version.json`. Bump the version comment in its `SKILL.md` to release.
