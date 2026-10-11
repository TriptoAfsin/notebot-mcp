# butex.edu.bd: data audit

*Audited 2026-10-11. Re-check the numbers with `butex_categories`.*

## Verdict

**Reliable for "what was published, and when".** The site runs WordPress with its REST API
(`/wp-json/wp/v2/`) open and unauthenticated. That gives structured JSON, server-side
search, date filters and pagination, and no HTML scraping is needed. Notices are posted
within days of issue (newest at audit time: 2026-10-08, three days earlier; several
posts per week). The offline archive goes back to 2017.

**Not reliable as a machine-readable source of the notice *contents*.** About 80% of
notice bodies are a scanned JPG and about 20% a PDF. Only the title, date and category are
text. The MCP handles this by returning the scan to the model (which reads it) and
extracting PDF text layers. Scanned PDFs with no text layer are linked, not read.

There is no structured routine, timetable or exam calendar anywhere. Routines and exam
schedules are notices like any other, filed mostly under *Academic Notices*.

## What's available

| Source | Endpoint | Notes |
| --- | --- | --- |
| All notices (3,458) | `GET /wp-json/wp/v2/posts` | `search`, `categories`, `after`/`before`, `per_page≤100`, `page`; `X-WP-Total` header |
| Categories (56) | `GET /wp-json/wp/v2/categories` | ids and counts; parent tree |
| Single notice | `GET /wp-json/wp/v2/posts/{id}` or `?slug=` | body HTML with attachment links and `srcset` sizes |
| Pages (230) | `GET /wp-json/wp/v2/pages` | department/office pages, journal, convocation. **The REST body is empty**: the theme's page builder renders the content, so the MCP reads the HTML (see below) |
| Search | `GET /wp-json/wp/v2/search?search=` | posts and pages |
| Media | `/wp-content/uploads/YYYY/MM/*` | JPG scans (with 768/1087/1449 px variants), PDFs |

### Categories that matter (post counts at audit)

| Category | Count | Contents |
| --- | --- | --- |
| Academic Notices | 1,109 | class notices, routines, exam schedules, admission, convocation |
| Undergrade Admission | 735 | |
| Published Results | 479 | BSc (by dept/level/term, regular and retake), MSc, MBA, PGD, affiliated |
| Administrative Notices | 462 | holidays, office notices |
| Postgraduate Admission | 410 | |
| Affiliated Colleges | 303 | schedules and results for affiliated colleges |
| NOC_GO | 309 | government orders |
| Tender | 110 | e-tender notices |
| Career Opportunity | 44 | job circulars (PDF) |
| Convocation Updates | 22 | |
| Departments (10) | 37–179 each | DYE, DFE, DWPE, DAE, DTFD, DTEM, DTMDM, DIPE, DCE, DESE |

Empty or near-empty categories ("B.Sc. in Textile Eng L-x T-y", "Formats",
"Journal Updates") look like they were planned but never used. Don't rely on them.

## Gotchas handled by the MCP

- Titles are HTML-encoded (`&#038;`, `&#8217;`). They're decoded.
- Level/term spelling is inconsistent: `L-2 T-1`, `L2-T1`, `Level-2 Term-I`, even `L3-Tl`.
  Matching normalises these (lowercase, alphanumerics only, `level`→`l`, `term`→`t`).
- WordPress search matches whole words, so `L2T1` finds nothing. The MCP retries fuzzily over the
  ~300 newest notices.
- Body links use `http://`, so they're upgraded to `https://`.
- The theme's `/results-published/` HTML page (which engine-v2 scrapes with cheerio) duplicates
  the `published-results` category. The REST API is the more robust source.
- `page` past the end returns HTTP 400, which is treated as an empty page, not an outage.
- The host is LiteSpeed with no rate-limit headers seen. The MCP caches lists for 10–30 min,
  categories for 24 h and PDF text for 7 days, and keeps a 300-notice archive warm every 20 min.

## Departments, faculty, offices, halls (pages)

The site's menu lists 5 faculties with 18 departments, 16 offices, 4 halls, programs,
research/conference pages, admission and student services. Their content is only in the
rendered HTML, so `src/butex/site.ts` parses it:

- Content lives under `#primary` up to `#footer`; department pages put faculty cards
  *after* the sidebar, so the sidebar is cut out instead of used as the end marker.
- Faculty and staff are `team-member-article` cards: `team-member-i` (designation),
  `member-b` (name), `member-details` (highlights, interests, education, publications,
  courses, contact). 16–25 per department; offices and halls list their officers the same way.
- The department head is the first `azoom-text-details` block (name, role, role email).
- Some pages are empty templates with only a banner: admission, undergraduate/postgraduate
  programs, PhD, conferences, convocation, affiliated colleges, ICT cell, the faculty landing
  pages. The MCP says so and points to notices.
- Some cards and office tables list personal Gmail/Yahoo addresses. The MCP keeps only
  `@butex.edu.bd` addresses.
- The homepage 302s to `/homepage/`. Pages are cached 12 h; the people index (~40 pages)
  is rebuilt at most twice a day.

## Not available

- Structured timetables, room allocations, exam calendars, academic calendar as data.
- Student-specific data (results by ID are only inside result PDFs/scans).
- An RSS feed exists at `/feed/`, but it adds nothing over the REST API.
