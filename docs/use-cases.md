# What you can do with NoteBot MCP

Three servers live at `https://ai.butexnotebot.com`. The first two are free for anyone; the third is private to the owner.

| Server | Endpoint | Who |
| --- | --- | --- |
| BUTEX MCP | `/butex/mcp` | anyone (free key or sign-in) |
| NoteBot knowledge base | `/notebot/mcp` | anyone (same key) |
| NoteBot analytics | `/analytics/mcp` | owner only (admin key) |

Every tool is read-only. Nothing here can change data on butex.edu.bd, in the NoteBot knowledge base or in analytics.

---

## 1. BUTEX MCP — `/butex/mcp`

**What it reads:** the whole official butex.edu.bd website. The notice board comes through the site's own data feed, every notice since 2017; most notices are scanned images or PDFs, and the server opens them so the AI can read the dates, rooms and fees inside. The rest of the site (departments, teachers, offices, halls, programs) is read from its pages and cached for 12 hours.

**What you get:**
- Class routines, class start and completion dates, exam routines and schedules
- Published results (regular, retake, affiliated colleges)
- Department notices (Yarn, Fabric, Wet Process, Apparel, and the rest)
- Admission circulars, fees and deadlines
- The newest notices, for a quick "what's new"
- Every department (18, across 5 faculties): head and contact, about, vision and mission, degrees offered with seats, semesters and credits, labs, and the full faculty list
- Teachers and officials: designation, official email, research interests, courses taught, publications, and Google Scholar / ORCID links
- Offices (VC, registrar, examination, accounts, proctor, DSW, ORE, IQAC, TTCS, library, medical center, transport), the four residential halls (provost, house tutors, capacity), the VC's and registrar's messages, history, syndicate, programs, collaborations, the BJTSE journal and downloadable forms
- The university's address, phone and admission helpline, and the 10 affiliated colleges
- The official link with every answer, and a note when a copy is cached because the site was down

**Use cases:**

| Situation | Ask | You get |
| --- | --- | --- |
| Results day | "Did the L4-T1 results come out?" | The result notices with posting dates and links |
| Exam planning | "When is the L2-T2 final exam routine?" | The newest exam schedule, dates read from the scan |
| Term deadlines | "When do BSc classes end and when is the entry form due?" | The class-completion notice, each date quoted as printed |
| Your department | "Anything new from the Wet Process department?" | Recent notices for that department only |
| Department profile | "Tell me about the Wet Process department." | Head, founding year, degrees with seats and credits, and the faculty list |
| Find a supervisor | "Who at BUTEX works on smart textiles?" | Teachers across departments with that interest, with official emails |
| One teacher | "Show me Sk. Mohammad Raafi's profile." | Designation, interests, courses, publications and profile links |
| Offices | "Who is the exam controller, and how do I reach them?" | The Examination Office officers with official contacts |
| Halls | "How many students does Osmani Hall house, and who's the provost?" | Capacity, location and the hall's administration |
| Forms | "Where's the studentship extension form?" | The form's PDF link from Downloadable Forms |
| Contact | "What's the BUTEX admission helpline?" | The helpline, phone, email and address |
| Morning check | "What did BUTEX post this week?" | Latest notices, newest first, with their age |
| Admission and fees | "Find the MSc admission circular and its fee." | The circular, opened so the fee and deadline come from it |
| Affiliated colleges | "Any exam schedule for affiliated colleges?" | The matching schedule notices |
| Old notices | "Show the 2023 notices about the convocation." | Search across the full archive |

**Tools:** notices: `butex_latest_notices`, `butex_search_notices`, `butex_schedules`, `butex_results`, `butex_department_notices`, `butex_read_notice`, `butex_categories`; the rest of the site: `butex_department`, `butex_faculty`, `butex_page`, `butex_directory`; plus `butex_status`, and `search` and `fetch` for ChatGPT.

**Good to know:** level and term are matched however you write them (`L2T1`, `L-2 T-1`, `Level 2 Term 1`). Only official `@butex.edu.bd` emails are shown; personal addresses that appear on the site are left out. Some official pages (admission, programs, conferences) have no text of their own, so the answer comes from the notices instead. NoteBot is a student project, so double-check exam dates on the linked notice.

---

## 2. NoteBot knowledge base — `/notebot/mcp`

**What it reads:** the NoteBot engine (the same knowledge base behind the NoteBot app, website and Messenger bot): notes, books, lab reports, question banks, syllabus, saved routines and old results shared by BUTEX students.

**What you get:**
- Notes and books by level (1–4) and subject, topic by topic
- Lab reports per subject
- Previous questions and suggestions
- Syllabus by batch
- Study plans built from the real topics and links in the knowledge base
- Recommendations from what other students open most

**Use cases:**

| Situation | Ask | You get |
| --- | --- | --- |
| Find notes | "YM-I notes for Level 2" | Topic-by-topic note links and the subject's books |
| Lab week | "Lab reports for Phy-I" | Every lab report for that subject |
| Before finals | "Previous questions for FM-I" | Question banks and suggestions for the subject |
| Study plan | "Finals in 10 days: YM-I and FM-I. Plan it." | A day-by-day plan, each day linked to its notes |
| Last-minute | "Exam tomorrow on Wet Process. What should I cover?" | An exam-sprint list of the key topics and questions |
| Not sure what next | "What are Level 3 students studying most?" | The most-opened notes and labs |
| Course planning | "What's in the Level 3 syllabus?" | The syllabus for that level and batch |

**Tools:** `notebot_search`, `notebot_browse`, `notebot_subject`, `notebot_lab_reports`, `notebot_question_banks`, `notebot_routines`, `notebot_syllabus`, `notebot_results_archive`, `notebot_study_plan`, `notebot_recommend`, `notebot_status`. Prompts: `study-plan`, `exam-sprint`.

**Good to know:** official exam dates and new results come from the BUTEX MCP; NoteBot's routines and results are an archive. Add both servers and the AI uses each for what it's best at.

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
