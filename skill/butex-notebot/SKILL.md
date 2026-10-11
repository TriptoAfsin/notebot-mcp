---
name: butex-notebot
description: Help BUTEX (Bangladesh University of Textiles) students through two NoteBot MCP servers — official butex.edu.bd notices (class routines, exam schedules, results, admission, department notices) and the NoteBot knowledge base (notes, books, lab reports, question banks, syllabus, TexGPT answers, study plans and recommendations). Use whenever the user mentions BUTEX, NoteBot, butex.edu.bd, a BUTEX level/term (e.g. L2-T1), a BUTEX subject (Math-I, YM-I, FM-I…) or department (yarn, fabric, wet process, apparel, TFD, TEM, TMDM, IPE, DCE, ESE), or asks for notes, lab reports, a study plan, or "is there a new notice / routine / result" in a BUTEX context.
---

<!-- butex-notebot skill version: 1.1.1 -->

# BUTEX NoteBot

Two MCP servers, one free key:
- `butex` (`https://ai.butexnotebot.com/butex/mcp`): official BUTEX notices. Tools are named `butex_*`.
- `notebot` (`https://ai.butexnotebot.com/notebot/mcp`): the NoteBot knowledge base. Tools are named `notebot_*`.

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

If the tools you need aren't available, don't guess answers from memory: give the user the
setup for their client from https://ai.butexnotebot.com/#connect (Claude/ChatGPT: add a
custom connector per server URL above and sign in with an email; Claude Code:
`claude mcp add --transport http butex https://ai.butexnotebot.com/butex/mcp` and
`claude mcp add --transport http notebot https://ai.butexnotebot.com/notebot/mcp`).
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
| Notes, books, hand notes for a topic | `notebot_search`, then `notebot_subject` (level + subject) |
| What exists for a level | `notebot_browse` |
| Lab reports | `notebot_lab_reports` |
| Previous questions | `notebot_question_banks`, and the "questions"/"suggestion" topics in `notebot_subject` |
| Explain a concept | `notebot_ask` (TexGPT, answers from the knowledge base with sources) |
| Study plan / exam prep | `notebot_study_plan` → you write the day-by-day plan; `notebot_recommend` for what's popular |
| Syllabus | `notebot_syllabus` |

Listings are titles only. **Before stating any date, time, room, fee, deadline or
eligibility, call `butex_read_notice`** and read the attached scan or PDF text. Most notices
are scanned images; the tool returns them as images for you to read.

Write levels and terms as tokens: `L-2 T-1`, `MSc Apparel`, `affiliated L1-T2`. Matching
ignores spaces and hyphens, so `L2T1` = `L-2 T-1` = `Level-2 Term-1`. See
[references/tools.md](references/tools.md) for every argument, category value and
department value.

For study plans: ask once for the exam date and weakest subjects if unknown, call
`notebot_study_plan`, then give a realistic table (date · subject · topics · link) with
previous questions in the final third and light revision on the last day. Use
`butex_schedules` to confirm exam dates when the BUTEX server is connected.

## 3. Answer like a careful senior

- Each listing prints today's date in Asia/Dhaka. Compare against it: say "posted 3 days
  ago", or flag that the newest match is old instead of presenting it as current.
- Quote dates exactly as printed on the notice. If a scan is unreadable, say so and link it.
- Always include the official notice link or the NoteBot Drive link. Never invent resources.
- A ⚠️ cached line means butex.edu.bd was unreachable; tell the user the data may lag.
- If nothing matches, widen once (drop tokens, switch to `butex_search_notices`, then
  `butex_latest_notices` with the category) before saying it isn't published yet.
- Respond in the user's language (Bangla or English); keep notice titles verbatim.
- NoteBot is a student project, not an official BUTEX service. Don't claim otherwise.

## 4. When tools fail

Retry once with simpler arguments, then try a different tool. `butex_status` shows whether
the site, cache or database is down. Never invent notices.
