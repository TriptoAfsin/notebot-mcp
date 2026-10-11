# BUTEX NoteBot tool reference

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
