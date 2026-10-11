# AGENTS.md

Guidelines for two kinds of agents: those **using** the NoteBot MCP servers, and those **working on** this repo.

---

## Part 1 — Using the MCP servers

### `butex` — `https://ai.butexnotebot.com/butex/mcp` (public, free key or OAuth)

The server sends these as MCP `instructions` on connect (source of truth: `BUTEX_INSTRUCTIONS` in `src/mcp/handler.ts`):

- **Pick the narrowest tool.** `butex_schedules` for class routines, class start/completion and exam routines; `butex_results` for results; `butex_department_notices` for one department; `butex_latest_notices` for "what's new"; `butex_search_notices` for everything else.
- **Listings are titles only.** Before stating a date, time, room, fee, deadline or eligibility rule, call `butex_read_notice`. Most notices are scanned images (about 80%) or PDFs (about 20%), and the tool returns the scan as an image plus any PDF text.
- **Levels and terms are tokens.** `L-2 T-1`, `L2T1` and `Level-2 Term-1` all match the same notices, because spacing and hyphens are ignored.
- **Dates matter.** Every listing prints today's date in Asia/Dhaka. Say how old a notice is and flag stale matches.
- **Cite the source.** Include the official notice link, and quote dates exactly as printed.
- **⚠️ cached** means butex.edu.bd was unreachable, so the answer may lag. Say so.
- **On error**, retry once with simpler arguments, then switch tools. `butex_status` explains outages.
- NoteBot is a student project, not an official BUTEX service.

### `notebot` — `https://ai.butexnotebot.com/notebot/mcp` (public, same key)

Source of truth: `NOTEBOT_INSTRUCTIONS` in `src/notebot/tools.ts`.

- **Find material:** use `notebot_search` for named topics. To explore a level, go `notebot_browse` → `notebot_subject`. Use `notebot_lab_reports` for labs and `notebot_question_banks` for previous questions.
- **Explain concepts:** `notebot_ask` (TexGPT). Cite the library sources it returns, and point to matching notes.
- **Plan studying:** `notebot_study_plan` gathers the material; the agent writes a realistic day-by-day plan with exact links. `notebot_recommend` gives what's popular.
- Levels are 1–4. Subjects take names or codes (`Math-I` = `math1`). Never invent links.
- Official notices, exam dates and new results come from the `butex` server. NoteBot's routines and results are an archive.

### `analytics` — `https://ai.butexnotebot.com/analytics/mcp` (owner only)

Accepts only the admin key, or an admin-tier OAuth token issued against it. Start with `analytics_overview`. `mcp_signups` shows who requested keys. The `analytics_users`, `analytics_find_users` and `analytics_error_logs` tools return personal data, so summarise them and show individual emails only when asked.

### Skill

`skill/butex-notebot/` is the installable agent skill. It runs `scripts/check_update.py` first, which compares against `/skill/version.json` at most once a day and upgrades itself in place.

---

## Part 2 — Working on this repo

**Stack:** Bun + TypeScript, `@modelcontextprotocol/sdk` (Streamable HTTP via `WebStandardStreamableHTTPServerTransport`, stateless, JSON responses), `zod`, `unpdf`. No framework; routing is in `src/index.ts`.

```
src/
  index.ts            routes, CORS, static files, boot
  env.ts              every setting, all with working defaults
  mcp/handler.ts      auth → rate limit → fresh McpServer per request; server instructions
  mcp/tooling.ts      guard() wrapper, READ_ONLY annotations, freshness line
  butex/client.ts     WordPress REST client, categories, attachments, offline corpus
  butex/reader.ts     PDF text (unpdf) + scanned images for the model
  butex/tools.ts      butex_* tools + ChatGPT search/fetch
  analytics/tools.ts  admin-only wrapper over notebot-analytics-go (+ mcp_signups)
  analytics/usage.ts  buffers public tool calls → analytics-go daily_report platform "ai"
  notebot/client.ts   notebot-engine-v2 client (levels→subjects→topics→notes, labs, QB, TexGPT)
  notebot/tools.ts    notebot_* tools + study-plan / exam-sprint prompts
  oauth/oauth.ts      stateless OAuth 2.1 (DCR + PKCE) for Claude.ai / ChatGPT connectors
  lib/                cache (Redis → memory), resilient fetch, keys, crypto, db, mail (Resend)
  web/dashboard.ts    dashboard + message page (rotate / unsubscribe)
  web/pages.ts        shared head/brand/icons + OAuth consent page
  skill.ts            serves the skill, version.json, zip, install scripts
public/               app.css, app.js, fonts, icons
skill/butex-notebot/  the agent skill (SKILL.md is the version source of truth)
```

### Invariants. Don't break these.

1. **Tools never throw to the transport.** Wrap every tool body in `guard()`. A failure becomes an `isError` result with a hint the model can act on.
2. **Every tool is read-only** (`READ_ONLY` annotations), so ChatGPT and Claude run it without a confirmation prompt.
3. **Degrade, don't die.** Upstream calls go through `fetchJson` (timeout, retry, circuit breaker) and `cachedFetch` (serves the last good copy for up to 7 days). If Redis is down the service falls back to memory. If Postgres is down keys still work, because they are HMAC-signed and validated without the DB.
4. **Keys are self-verifying:** `nbk_<f|a>_<id>_<sig>`. Rotating `KEY_SIGNING_SECRET` invalidates every key and OAuth client, so never rotate it casually. One free key works on `/butex/mcp` and `/notebot/mcp`.
4a. **Never show an existing key to whoever typed an email.** A repeat dashboard email gets its key re-derived (`keyFor`) and **emailed** with a one-hour, single-use "replace key" link. Emailed links render a confirm page on GET and act only on POST, because mail scanners pre-fetch links.
4b. **Every requesting email goes into `mcp.contacts`**, and unsubscribe is honoured. Don't use it for anything but NoteBot updates.
5. **The OAuth server is stateless.** Client ids are signed blobs and auth codes are AES-GCM sealed. Don't add server-side session state.
6. **Analytics is admin-only.** `handleMcp` returns 403 for anything but the admin tier.
7. **Be polite to butex.edu.bd.** Keep the cache windows (10–30 min). Don't add per-request scraping.

### Commands

```bash
bun install
bun run dev                    # http://localhost:8080
bun test                       # unit tests (resilience, keys, crypto, parsing)
bunx tsc --noEmit              # typecheck
BASE=http://localhost:8080 ADMIN_API_KEY=... bun run smoke   # end-to-end: keys, every tool, OAuth+PKCE, skill
```

### Releasing a new skill version

Edit `skill/butex-notebot/`, bump the `butex-notebot skill version:` comment in its `SKILL.md`, and update `skill/release.json` notes. Deploying is the release: installed skills pick it up within 24 hours.

### Adding a tool

Register it in the relevant `tools.ts` with `title`, a description that says *when* to use it, a zod `inputSchema`, `annotations: { title, ...READ_ONLY }`, and a `guard()` body. It appears on the dashboard automatically, because the tool list is introspected. Mention it in `skill/butex-notebot/references/tools.md` and bump the skill version.

### Commits

Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`). Pushing to `main` is fine.
