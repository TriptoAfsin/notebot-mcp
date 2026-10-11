---
name: butex-notebot
description: Answer questions about BUTEX (Bangladesh University of Textiles) using the official butex.edu.bd notice board through the BUTEX NoteBot MCP server — class routines, class start/completion dates, exam routines and schedules, published results, admission, convocation, tender and department notices. Use whenever the user mentions BUTEX, Bangladesh University of Textiles, butex.edu.bd, a BUTEX level/term (e.g. L2-T1), a BUTEX department (yarn, fabric, wet process, apparel, TFD, TEM, TMDM, IPE, DCE, ESE), or asks "is there a new notice / routine / result" in a BUTEX context.
---

<!-- butex-notebot skill version: 1.0.0 -->

# BUTEX NoteBot

Official BUTEX notices, read through the `butex` MCP server at `https://ai.butexnotebot.com/butex/mcp`.

## 0. Keep this skill current (run first, once per session)

If you can run commands, run:

```bash
python scripts/check_update.py
```

(from this skill's directory; use `python3` if `python` is missing). It checks
`https://ai.butexnotebot.com/skill/version.json` at most once a day, upgrades the skill
in place when a newer version exists, and never fails the task: offline or read-only
installs just print a note. If it reports `UPDATED`, re-read this SKILL.md before continuing.

If you cannot run commands, call the `butex_status` tool: it reports `latestSkillVersion`.
If that is newer than the version in the comment above, tell the user once that an update
is available at https://ai.butexnotebot.com/#skill, then carry on.

## 1. Make sure the tools are connected

The tools are named `butex_*` plus `search`/`fetch`. If none are available, don't
guess answers from memory: give the user the setup for their client from
https://ai.butexnotebot.com/#connect (Claude/ChatGPT: add a custom connector with the URL
above and sign in with an email; Claude Code:
`claude mcp add --transport http butex https://ai.butexnotebot.com/butex/mcp`).
As a last resort, link the official pages: https://www.butex.edu.bd/academic-notices/ and
https://www.butex.edu.bd/results-published/.

## 2. Pick the narrowest tool

| User asks about | Tool |
| --- | --- |
| Class routine, class start/completion, exam routine/schedule, mid-term | `butex_schedules` (`kind`: class / exam / all, `query`: level-term-program tokens) |
| A result | `butex_results` (`query`: e.g. `L4-T1`, `retake`, `MBA 9th`) |
| One department's notices | `butex_department_notices` |
| "Anything new?" / a category (admission, convocation, tender, career…) | `butex_latest_notices` |
| Anything else, or a date range | `butex_search_notices` (`since`/`until` = YYYY-MM-DD) |
| Details of one notice | `butex_read_notice` (id or URL) |

Listings are titles only. **Before stating any date, time, room, fee, deadline or
eligibility, call `butex_read_notice`** and read the attached scan or PDF text. Most notices
are scanned images; the tool returns them as images for you to read.

Write levels and terms as tokens: `L-2 T-1`, `MSc Apparel`, `affiliated L1-T2`. Matching
ignores spaces and hyphens, so `L2T1` = `L-2 T-1` = `Level-2 Term-1`. See
[references/tools.md](references/tools.md) for every argument, category value and
department value.

## 3. Answer like a careful senior

- Each listing prints today's date in Asia/Dhaka. Compare against it: say "posted 3 days
  ago", or flag that the newest match is old instead of presenting it as current.
- Quote dates exactly as printed on the notice. If a scan is unreadable, say so and link it.
- Always include the official notice link.
- A ⚠️ cached line means butex.edu.bd was unreachable; tell the user the data may lag.
- If nothing matches, widen once (drop tokens, switch to `butex_search_notices`, then
  `butex_latest_notices` with the category) before saying it isn't published yet.
- Respond in the user's language (Bangla or English); keep notice titles verbatim.
- NoteBot is a student project, not an official BUTEX service. Don't claim otherwise.

## 4. When tools fail

Retry once with simpler arguments, then try a different tool. `butex_status` shows whether
the site, cache or database is down. Never invent notices.
