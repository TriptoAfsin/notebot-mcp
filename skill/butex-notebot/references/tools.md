# BUTEX NoteBot tool reference

**Part 1: `butex` server (official notices).** Part 2 covers the `notebot` library.

All tools are read-only. Every listing line reads:
`- [YYYY-MM-DD] Title` / `id N · Categories · K images/pdfs` / `URL`.

## butex_latest_notices
- `category` (optional): `academic`, `administrative`, `results`, `affiliated`,
  `undergrad_admission`, `postgrad_admission`, `convocation`, `career`, `tender`, `noc_go`,
  `events`, `research`, `iqac`, `forms`, `executive_program`, `clubs`
- `limit` 1–50 (default 10), `page`

## butex_search_notices
- `query` (required), `category`, `department`, `since`, `until` (YYYY-MM-DD), `limit`, `page`
- Uses the site's own search (whole words). If that returns nothing it retries
  fuzzily over the ~300 newest notices. Falls back to the cached archive if the site is down.

## butex_schedules
- `kind`: `class` | `exam` | `all` (default)
- `query`: tokens such as `L-3 T-2`, `MSc`, `PGD`, `affiliated`, `mid term`, `Apparel`
- Draws on titles containing routine / schedule / class / exam date. Result notices are excluded.

## butex_results
- `query`: tokens such as `L4-T1`, `retake`, `not promoted`, `MBA 10th`, `Yarn`, `affiliated`
- Searches the ~300 newest posts in Published Results. Result PDFs often have a text layer,
  which `butex_read_notice` extracts (student IDs, GPA lists).

## butex_department_notices
- `department`: `yarn`, `fabric`, `wet_process`, `apparel`, `fashion_design`, `management`,
  `machinery`, `industrial_production`, `dyes_chemical`, `environmental`

## butex_read_notice
- `notice`: numeric id or butex.edu.bd URL
- `include_images` (default true), `max_images` 1–4 (default 2)
- Returns the title, publish time, attachment links, any body text, PDF text (up to 20k chars)
  and the scanned images.

## butex_categories, butex_status
No arguments. `butex_status` reports upstream health, cache state, archive size and
`latestSkillVersion`.

## search / fetch
ChatGPT-compatible pair: `search(query)` returns JSON `{results:[{id,title,url}]}`;
`fetch(id)` returns `{id,title,text,url,metadata}`. Prefer the `butex_*` tools when available.

## Vocabulary
- Levels/terms: L1–L4, T1–T2 (written `L-2 T-1`, `L2-T1`, `Level-2 Term-I`).
- Programs: BSc in Textile Engineering, MSc in Textile Engineering, MBA in Textiles,
  PGD in Textile Industry Management, PhD, Executive Development Program,
  affiliated colleges (BUTEX-affiliated textile engineering colleges).
- Department short names on the site: DYE (yarn), DFE (fabric), DWPE (wet process),
  DAE (apparel), DTFD (fashion & design), DTEM (management), DTMDM (machinery),
  DIPE (industrial & production), DCE (dyes & chemical), DESE (environmental).

---

# Part 2: `notebot` server (NoteBot study library)

All arguments that take `level` accept 1–4, "L2" or "Level 2". Subjects accept names or codes
("Math-I" = "math1", "Yarn Manufacturing I" = "ym1"); a miss returns the valid list.

## notebot_search
- `query` (2–120 chars), `limit` 1–20. Searches note and lab-report titles plus topic/subject names. Every term must match.

## notebot_browse
- `level` (optional). Without it: every level's note and lab subjects. With it: subjects, lab subjects, question-bank count.

## notebot_subject
- `level`, `subject`. Every topic with Drive links. Typical topics: chapter notes, Books, Hand Notes, Questions, Suggestions, and named contributors' notes ("Part-A(Kakon,2025)").

## notebot_lab_reports
- `level`, `subject` (optional). Without subject, lists lab subjects (codes like `phy_1`, `fm_1`).

## notebot_question_banks
- `level`, `subject` (optional filter on title).

## notebot_routines
- `level`, `department` (YE, FE, WPE, AE, TFD, TEM, TMDM, IPE, DCE, ESE…), `term` ("1"/"2"). An archive of routine files; the newest official ones come from `butex_schedules`.

## notebot_syllabus
- `batch` (optional). Without it, lists batches.

## notebot_results_archive
- `query` (optional). Older result sheets saved in NoteBot. New results come from `butex_results`.

## notebot_ask
- `question`. TexGPT answer grounded in NoteBot's books and notes, plus source filenames. Takes 5–30 s.

## notebot_study_plan
- `level`, `subjects[]` (optional, max 8), `goal` (final_exam | class_test | semester | lab_viva | revision), `days_left`, `hours_per_day`.
- Returns a study kit (chapters, books, previous questions per subject, question banks, popularity rank) plus planning guidance. You write the plan.

## notebot_recommend
- `level` (optional). Most-opened subjects and labs across NoteBot, mapped to levels.

## Prompts
`study-plan` (level, subjects, days) and `exam-sprint` (level, subject) for clients that support MCP prompts.
