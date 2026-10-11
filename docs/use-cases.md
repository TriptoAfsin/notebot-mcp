# What you can do with NoteBot MCP

Three servers live at `https://ai.butexnotebot.com`. The first two are free for anyone; the third is private to the owner.

| Server | Endpoint | Who |
| --- | --- | --- |
| BUTEX notices | `/butex/mcp` | anyone (free key or sign-in) |
| NoteBot knowledge base | `/notebot/mcp` | anyone (same key) |
| NoteBot analytics | `/analytics/mcp` | owner only (admin key) |

Every tool is read-only. Nothing here can change data on butex.edu.bd, in the NoteBot knowledge base or in analytics.

---

## 1. BUTEX notices — `/butex/mcp`

**What it reads:** the official butex.edu.bd notice board through the site's own data feed, every notice since 2017. Most notices are scanned images or PDFs; the server opens them so the AI can read the dates, rooms and fees inside.

**What you get:**
- Class routines, class start and completion dates, exam routines and schedules
- Published results (regular, retake, affiliated colleges)
- Department notices (Yarn, Fabric, Wet Process, Apparel, and the rest)
- Admission circulars, fees and deadlines
- The newest notices, for a quick "what's new"
- The official link with every answer, and a note when a copy is cached because the site was down

**Use cases:**

| Situation | Ask | You get |
| --- | --- | --- |
| Results day | "Did the L4-T1 results come out?" | The result notices with posting dates and links |
| Exam planning | "When is the L2-T2 final exam routine?" | The newest exam schedule, dates read from the scan |
| Term deadlines | "When do BSc classes end and when is the entry form due?" | The class-completion notice, each date quoted as printed |
| Your department | "Anything new from the Wet Process department?" | Recent notices for that department only |
| Morning check | "What did BUTEX post this week?" | Latest notices, newest first, with their age |
| Admission and fees | "Find the MSc admission circular and its fee." | The circular, opened so the fee and deadline come from it |
| Affiliated colleges | "Any exam schedule for affiliated colleges?" | The matching schedule notices |
| Old notices | "Show the 2023 notices about the convocation." | Search across the full archive |

**Tools:** `butex_latest_notices`, `butex_search_notices`, `butex_schedules`, `butex_results`, `butex_department_notices`, `butex_read_notice`, `butex_categories`, `butex_status`, plus `search` and `fetch` for ChatGPT.

**Good to know:** level and term are matched however you write them (`L2T1`, `L-2 T-1`, `Level 2 Term 1`). NoteBot is a student project, so double-check exam dates on the linked notice.

---

## 2. NoteBot knowledge base — `/notebot/mcp`

**What it reads:** the NoteBot engine (the same knowledge base behind the NoteBot app, website and Messenger bot): notes, books, lab reports, question banks, syllabus, saved routines and old results shared by BUTEX students, plus TexGPT.

**What you get:**
- Notes and books by level (1–4) and subject, topic by topic
- Lab reports per subject
- Previous questions and suggestions
- Syllabus by batch
- TexGPT answers to textile questions, drawn from NoteBot's books with the sources named
- Study plans built from the real topics and links in the knowledge base
- Recommendations from what other students open most

**Use cases:**

| Situation | Ask | You get |
| --- | --- | --- |
| Find notes | "YM-I notes for Level 2" | Topic-by-topic note links and the subject's books |
| Lab week | "Lab reports for Phy-I" | Every lab report for that subject |
| Before finals | "Previous questions for FM-I" | Question banks and suggestions for the subject |
| Concept check | "Explain ring spinning" | A TexGPT answer with its source files |
| Study plan | "Finals in 10 days: YM-I and FM-I. Plan it." | A day-by-day plan, each day linked to its notes |
| Last-minute | "Exam tomorrow on Wet Process. What should I cover?" | An exam-sprint list of the key topics and questions |
| Not sure what next | "What are Level 3 students studying most?" | The most-opened notes and labs |
| Course planning | "What's in the Level 3 syllabus?" | The syllabus for that level and batch |

**Tools:** `notebot_search`, `notebot_browse`, `notebot_subject`, `notebot_lab_reports`, `notebot_question_banks`, `notebot_routines`, `notebot_syllabus`, `notebot_results_archive`, `notebot_ask`, `notebot_study_plan`, `notebot_recommend`, `notebot_status`. Prompts: `study-plan`, `exam-sprint`.

**Good to know:** official exam dates and new results come from the BUTEX notices server; NoteBot's routines and results are an archive. Add both servers and the AI uses each for what it's best at.

---

## 3. NoteBot analytics — `/analytics/mcp` (owner only)

**What it reads:** notebot-analytics-go, the service that records how NoteBot is used across the Messenger bot, the app and AI clients. Setup: [analytics-setup.md](analytics-setup.md).

**What you get:**
- Daily request counts per platform: Messenger bot, app, and `ai` (tool calls through these MCP servers)
- The most-viewed note and lab subjects
- Missed keywords: what people asked the bot that it couldn't answer
- NoteBird and NoteDino leaderboards
- App users, lookups by email or department and batch, and app error logs
- MCP sign-ups: who requested keys, per day and by connection type
- Service health

**Use cases:**

| Situation | Ask | You get |
| --- | --- | --- |
| Weekly check-in | "How did NoteBot do this week?" | Platform totals, the top subjects, and the trend |
| AI adoption | "How many AI tool calls per day this month, against the app?" | Daily counts for `ai` and `app` side by side |
| Content gaps | "What are people searching for that we don't have?" | The missed-keyword list, ready to turn into new notes |
| Upload priorities | "Which lab subjects get the most views?" | Lab popularity, to decide what to add or improve |
| Outreach | "How many people signed up for MCP keys this week?" | Sign-up totals, per day and by source |
| Support | "Why does the app crash for this user?" | That user's error logs |
| Department stats | "How many Wet Process batch 47 students use the app?" | Matching users, summarised |
| Events | "Who's top on the NoteDino leaderboard?" | The leaderboard |

**Tools:** `analytics_overview`, `analytics_daily_usage`, `analytics_subjects`, `analytics_missed_keywords`, `analytics_game_leaderboard`, `analytics_users`, `analytics_find_users`, `analytics_error_logs`, `mcp_signups`, `analytics_status`.

**Privacy:** the user, error-log and sign-up tools return personal data. The server tells the AI to summarise them and show individual emails only when you ask.
