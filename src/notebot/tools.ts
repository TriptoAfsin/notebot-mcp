import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { breakerStatus, type Cached } from "../lib/resilient";
import { clamp } from "../lib/util";
import { guard, READ_ONLY, text, todayDhaka } from "../mcp/tooling";
import { NOTEBOT_LINKS } from "./links";
import {
  archivedResults,
  engineUpstream,
  labItems,
  labSubjects,
  levels,
  pickSubject,
  popularity,
  questionBanks,
  resolveLevel,
  routines,
  search,
  subjectLibrary,
  subjects,
  syllabus,
  syllabusBatches,
} from "./client";

const level = z.union([z.number().int().min(1).max(4), z.string().max(12)]).describe("Level 1–4 (\"2\", \"L2\" and \"Level 2\" all work).");

function source(c: { stale: boolean; warning?: string; fetchedAt: string }) {
  return c.stale ? `⚠️ ${c.warning}` : `Source: NoteBot (fetched ${c.fetchedAt}).`;
}

const link = (title: string, url: string) => `- ${title.replace(/^📌\s*/, "")}\n  ${url}`;

/** Engine-v2 lists include placeholder subjects (e.g. "All QB" folders); keep them but sort them last. */
const realSubject = (s: { name: string }) => !/^all_/.test(s.name);

async function subjectOrSuggest(lvlId: number, query: string) {
  const list = (await subjects(lvlId)).data;
  const hit = pickSubject(list, query);
  if (!hit) {
    const names = list.filter(realSubject).map((s) => s.displayName).join(", ");
    throw new Error(`No subject matching "${query}" in this level. Subjects: ${names}`);
  }
  return hit;
}

export function registerNotebotTools(server: McpServer) {
  server.registerTool(
    "notebot_search",
    {
      title: "Search NoteBot",
      description:
        "Search NoteBot of BUTEX study material: lecture notes, books, hand notes, question papers and lab reports, contributed by students. Use for any 'notes for X', 'book for Y', 'lab report on Z' request.",
      inputSchema: {
        query: z.string().min(2).max(120).describe("Subject, topic or title words, e.g. 'ring spinning', 'chem 1 books', 'fabric manufacturing lab'."),
        limit: z.number().int().min(1).max(20).optional().describe("Default 10."),
      },
      annotations: { title: "Search NoteBot", ...READ_ONLY },
    },
    guard("notebot_search", async ({ query, limit }) => {
      const r = await search(query, clamp(limit, 1, 20, 10));
      const hits = r.data.results;
      if (!hits.length) {
        return text(`Nothing in NoteBot matched "${query}". Try fewer words, the subject short name (e.g. "ym1", "chem2"), or notebot_browse to list a level's subjects.\n\n${source(r)}`);
      }
      const lines = hits.map((h) => `- [${h.kind === "lab" ? "Lab" : "Note"} · L${h.level} · ${h.subject} › ${h.topic}] ${h.title}\n  ${h.url}`);
      return text(`NoteBot results for "${query}" (${hits.length}):\n\n${lines.join("\n")}\n\n${source(r)}`);
    }),
  );

  server.registerTool(
    "notebot_browse",
    {
      title: "Browse NoteBot by level",
      description: "List what NoteBot has for a level: note subjects, lab subjects and question banks. Without a level, gives an overview of all four levels. Use to orient before drilling into a subject.",
      inputSchema: { level: level.optional() },
      annotations: { title: "Browse NoteBot", ...READ_ONLY },
    },
    guard("notebot_browse", async ({ level: lv }) => {
      if (lv === undefined) {
        const all = await levels();
        const rows = await Promise.all(
          all.data.map(async (l) => {
            const s = await subjects(l.id).catch(() => null);
            const subs = (s?.data ?? []).filter(realSubject).map((x) => x.displayName);
            const labs = (await labSubjects(l.id).catch(() => [])).map((x) => x.displayName);
            return `## ${l.displayName}\nNotes (${subs.length}): ${subs.join(", ") || "—"}\nLabs (${labs.length}): ${labs.join(", ") || "—"}`;
          }),
        );
        return text(`${rows.join("\n\n")}\n\n${source(all)}`);
      }
      const l = await resolveLevel(lv);
      const [s, labs, qb] = await Promise.all([subjects(l.id), labSubjects(l.id), questionBanks(l.id).catch(() => null)]);
      return text(
        [
          `# ${l.displayName}`,
          `## Note subjects\n${s.data.filter(realSubject).map((x) => `- ${x.displayName} (${x.name})`).join("\n") || "—"}`,
          `## Lab subjects\n${labs.map((x) => `- ${x.displayName} (${x.dbSlug})`).join("\n") || "—"}`,
          `## Question banks\n${qb?.data.length ? `${qb.data.length} entries — use notebot_question_banks` : "none listed"}`,
          "Next: notebot_subject for a subject's notes, notebot_lab_reports for a lab.",
          source(s),
        ].join("\n\n"),
      );
    }),
  );

  server.registerTool(
    "notebot_subject",
    {
      title: "Subject notes & books",
      description: "Every topic NoteBot has for one subject — chapter notes, books, hand notes, previous questions, suggestions — with direct Google Drive links.",
      inputSchema: {
        level,
        subject: z.string().min(1).max(60).describe("Subject name or short code, e.g. 'Math-I', 'math1', 'Yarn Manufacturing I', 'ym1'."),
      },
      annotations: { title: "Subject notes", ...READ_ONLY },
    },
    guard("notebot_subject", async ({ level: lv, subject }) => {
      const l = await resolveLevel(lv);
      const s = await subjectOrSuggest(l.id, subject);
      const lib = await subjectLibrary(s.id);
      const body = lib.items.length
        ? lib.items
            .map((t) => (t.links.length === 1 && t.links[0]!.title === t.topic ? link(t.topic, t.links[0]!.url) : `## ${t.topic}\n${t.links.map((x) => link(x.title, x.url)).join("\n")}`))
            .join("\n")
        : s.metadata?.directUrl
          ? link(`${s.displayName} folder`, s.metadata.directUrl)
          : "No material listed yet for this subject.";
      return text(`# ${s.displayName} — ${l.displayName}\n\n${body}\n\n${source(lib.meta as Cached<unknown>)}`);
    }, "Call notebot_browse with the level to see exact subject names."),
  );

  server.registerTool(
    "notebot_lab_reports",
    {
      title: "Lab reports",
      description: "Lab reports for a level. Without a subject, lists that level's lab subjects; with one, returns every report/experiment link for it.",
      inputSchema: { level, subject: z.string().max(40).optional().describe("Lab subject, e.g. 'Phy-I', 'phy_1', 'FM-I'.") },
      annotations: { title: "Lab reports", ...READ_ONLY },
    },
    guard("notebot_lab_reports", async ({ level: lv, subject }) => {
      const l = await resolveLevel(lv);
      const labs = await labSubjects(l.id);
      if (!subject) return text(`Lab subjects in ${l.displayName}:\n${labs.map((x) => `- ${x.displayName} (${x.dbSlug})`).join("\n") || "none"}\n\nPass subject to get the reports.`);
      const lab = pickSubject(labs, subject);
      if (!lab) throw new Error(`No lab subject matching "${subject}". Options: ${labs.map((x) => x.displayName).join(", ")}`);
      const items = await labItems(l.id, lab.dbSlug);
      const body = items.data.length ? items.data.map((i) => link(i.display || i.topicName, i.url)).join("\n") : "No reports listed yet.";
      return text(`# ${lab.displayName} lab reports — ${l.displayName}\n\n${body}\n\n${source(items)}`);
    }),
  );

  server.registerTool(
    "notebot_question_banks",
    {
      title: "Question banks",
      description: "Previous-year question collections for a level, optionally filtered to one subject.",
      inputSchema: { level, subject: z.string().max(40).optional() },
      annotations: { title: "Question banks", ...READ_ONLY },
    },
    guard("notebot_question_banks", async ({ level: lv, subject }) => {
      const l = await resolveLevel(lv);
      const qb = await questionBanks(l.id);
      let list = qb.data;
      if (subject) {
        const q = subject.toLowerCase().replace(/[^a-z0-9]/g, "");
        list = list.filter((x) => `${x.title}${x.subjectSlug}`.toLowerCase().replace(/[^a-z0-9]/g, "").includes(q));
      }
      const body = list.length ? list.map((x) => link(`${x.title}${x.metadata?.author ? ` (${x.metadata.author})` : ""}`, x.url)).join("\n") : "No question banks matched.";
      return text(`# Question banks — ${l.displayName}${subject ? ` · "${subject}"` : ""}\n\n${body}\n\n${source(qb)}`);
    }),
  );

  server.registerTool(
    "notebot_routines",
    {
      title: "Saved class routines",
      description: "Class routine files saved in NoteBot, by level, term and department. For the newest official routine notices use the BUTEX server's butex_schedules instead.",
      inputSchema: {
        level: level.optional(),
        department: z.string().max(10).optional().describe("Short code: YE, FE, WPE, AE, TFD, TEM, TMDM, IPE, DCE, ESE…"),
        term: z.enum(["1", "2"]).optional(),
      },
      annotations: { title: "Routines", ...READ_ONLY },
    },
    guard("notebot_routines", async ({ level: lv, department, term }) => {
      const r = await routines();
      const lvl = lv !== undefined ? await resolveLevel(lv) : null;
      const list = r.data
        .filter((x) => !lvl || x.levelId === lvl.id)
        .filter((x) => !department || (x.department ?? "").toLowerCase() === department.toLowerCase() || x.title.toLowerCase().includes(department.toLowerCase()))
        .filter((x) => !term || (x.term ?? "").endsWith(term));
      const body = list.length ? list.slice(0, 40).map((x) => link(x.title, x.url)).join("\n") : "No routine matched. Try without department/term.";
      return text(`# Routines${lvl ? ` — ${lvl.displayName}` : ""}\n\n${body}\n\n${source(r)}`);
    }),
  );

  server.registerTool(
    "notebot_syllabus",
    {
      title: "Syllabus",
      description: "Course syllabus PDFs by batch. Without a batch, lists the batches available.",
      inputSchema: { batch: z.string().max(6).optional().describe("Batch number, e.g. '46'.") },
      annotations: { title: "Syllabus", ...READ_ONLY },
    },
    guard("notebot_syllabus", async ({ batch }) => {
      if (!batch) {
        const b = await syllabusBatches();
        return text(`Syllabus available for batches: ${b.data.map((x) => x.batch).join(", ")}\n\n${source(b)}`);
      }
      const s = await syllabus(batch);
      const body = s.data.flatMap((d) => d.files.map((f) => link(`${d.dept} — ${f.topic}`, f.url))).join("\n") || `No syllabus for batch ${batch}.`;
      return text(`# Syllabus — batch ${batch}\n\n${body}\n\n${source(s.meta)}`);
    }),
  );

  server.registerTool(
    "notebot_results_archive",
    {
      title: "Results archive",
      description: "Older BUTEX result sheets archived in NoteBot (academic, admission, affiliation), filterable by text or year. For newly published results use the BUTEX server's butex_results.",
      inputSchema: { query: z.string().max(60).optional().describe("e.g. 'admission 2019', 'L 4', 'affiliation'.") },
      annotations: { title: "Results archive", ...READ_ONLY },
    },
    guard("notebot_results_archive", async ({ query }) => {
      const r = await archivedResults();
      const toks = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      const list = r.data.filter((x) => toks.every((t) => `${x.title} ${x.category} ${x.metadata?.year ?? ""}`.toLowerCase().includes(t)));
      return text(`# NoteBot results archive${query ? ` — "${query}"` : ""}\n\n${list.slice(0, 40).map((x) => link(x.title, x.url)).join("\n") || "Nothing matched."}\n\n${source(r)}`);
    }),
  );

  server.registerTool(
    "notebot_study_plan",
    {
      title: "Build a study plan",
      description:
        "Gather everything needed to write a personalised study plan for a BUTEX level: each subject's topics and best resources (books, chapter notes, previous questions), the level's question banks, and what other students study most. Returns a study kit plus planning guidance; you write the plan from it. Use for 'make me a study plan', 'how should I prepare for L2T1 finals in 10 days'.",
      inputSchema: {
        level,
        subjects: z.array(z.string().max(60)).max(8).optional().describe("Subjects to cover; omit for every subject in the level (up to 8)."),
        goal: z.enum(["final_exam", "class_test", "semester", "lab_viva", "revision"]).optional().describe("Default final_exam."),
        days_left: z.number().int().min(1).max(180).optional(),
        hours_per_day: z.number().min(0.5).max(16).optional(),
      },
      annotations: { title: "Study plan", ...READ_ONLY },
    },
    guard("notebot_study_plan", async ({ level: lv, subjects: wanted, goal = "final_exam", days_left, hours_per_day }) => {
      const l = await resolveLevel(lv);
      const all = (await subjects(l.id)).data.filter(realSubject);
      const chosen = (wanted?.length ? wanted.map((w) => pickSubject(all, w)).filter((x): x is NonNullable<typeof x> => !!x) : all).slice(0, 8);
      if (!chosen.length) throw new Error(`None of those subjects exist in ${l.displayName}. Subjects: ${all.map((s) => s.displayName).join(", ")}`);

      const [libs, qb, pop] = await Promise.all([
        Promise.all(chosen.map(async (s) => ({ s, lib: await subjectLibrary(s.id).catch(() => null) }))),
        questionBanks(l.id).catch(() => null),
        popularity(),
      ]);
      const popRank = new Map((pop?.notes ?? []).map((p, i) => [p.sub_name, i + 1]));

      const sections = libs.map(({ s, lib }) => {
        const items = lib?.items ?? [];
        const pick = (re: RegExp) => items.filter((t) => re.test(t.topic)).flatMap((t) => t.links.slice(0, 3).map((x) => `${t.topic}: ${x.title} — ${x.url}`));
        const books = pick(/book/i);
        const questions = pick(/ques|previous|exam|online|suggest|qb/i);
        const chapters = items.filter((t) => !/book|ques|previous|exam|online|suggest|qb/i.test(t.topic)).map((t) => t.topic);
        const rank = popRank.get(s.name);
        return [
          `## ${s.displayName}${rank ? ` · #${rank} most-studied on NoteBot` : ""}`,
          `Topics/chapters (${chapters.length}): ${chapters.join(", ") || "see subject folder"}`,
          books.length ? `Books:\n${books.map((b) => `- ${b}`).join("\n")}` : "",
          questions.length ? `Previous questions & suggestions:\n${questions.map((b) => `- ${b}`).join("\n")}` : "",
          `Full list: notebot_subject(level ${l.slug}, "${s.name}")`,
        ].filter(Boolean).join("\n");
      });

      const qbLines = (qb?.data ?? []).slice(0, 12).map((x) => `- ${x.title} — ${x.url}`);
      const budget = days_left && hours_per_day ? `${days_left} days × ${hours_per_day} h = ${Math.round(days_left * hours_per_day)} study hours` : days_left ? `${days_left} days` : "not specified (ask the student)";

      const guidance = `# Planning guidance (for you, the assistant)
Goal: ${goal.replace("_", " ")} · Time budget: ${budget} · Today: ${todayDhaka()} (Asia/Dhaka)
- Allocate time by weight: more for subjects with more chapters, and for ones the student says are weak. Ask once if you don't know their weak subjects.
- Front-load understanding (chapter notes, books), then switch to previous questions in the final 30–40% of the time. BUTEX finals reuse question patterns heavily.
- Use spaced review: revisit each subject 1, 3 and 7 days after first study. Keep the last day for light revision only.
- For lab_viva: use notebot_lab_reports and focus on the objective, theory, and the "why" behind each step.
- Present a day-by-day table (date, subject, specific topics, resource link). Keep it realistic: at most 2 subjects per day, with breaks.
- Link the exact resources above. Don't invent topics that aren't listed; say "check the syllabus" (notebot_syllabus) when unsure.
- For exam dates, check the BUTEX server (butex_schedules) if it's connected.`;

      return text(
        [
          `# Study kit — ${l.displayName} (${chosen.length} subject${chosen.length > 1 ? "s" : ""})`,
          ...sections,
          qbLines.length ? `## Question banks for ${l.displayName}\n${qbLines.join("\n")}` : "",
          guidance,
        ].filter(Boolean).join("\n\n"),
      );
    }, "Try fewer subjects, or call notebot_subject per subject."),
  );

  server.registerTool(
    "notebot_recommend",
    {
      title: "What to study next",
      description: "Recommendations from NoteBot usage: the subjects and labs students open most, with resources for each, optionally narrowed to a level. Use for 'what should I read', 'what's popular', 'where do I start'.",
      inputSchema: { level: level.optional() },
      annotations: { title: "Recommendations", ...READ_ONLY },
    },
    guard("notebot_recommend", async ({ level: lv }) => {
      const pop = await popularity();
      const lvl = lv !== undefined ? await resolveLevel(lv) : null;
      const allLevels = (await levels()).data;
      const subjectsByLevel = await Promise.all(allLevels.map(async (l) => ({ l, subs: (await subjects(l.id).catch(() => null))?.data ?? [] })));
      const findSubject = (name: string) => {
        for (const { l, subs } of subjectsByLevel) {
          const s = subs.find((x) => x.name === name);
          if (s) return { l, s };
        }
        return null;
      };

      const out: string[] = [];
      if (pop?.notes.length) {
        const rows = pop.notes
          .map((p) => ({ p, hit: findSubject(p.sub_name) }))
          .filter((x) => !lvl || x.hit?.l.id === lvl.id)
          .map((x, i) => `${i + 1}. ${x.hit ? `${x.hit.s.displayName} (${x.hit.l.displayName})` : x.p.sub_name} — ${x.p.count.toLocaleString()} opens · notebot_subject(${x.hit?.l.slug ?? "?"}, "${x.p.sub_name}")`);
        out.push(`## Most-opened note subjects${lvl ? ` in ${lvl.displayName}` : ""}\n${rows.join("\n") || "None of the top subjects are in this level."}`);
      }
      if (pop?.labs.length) out.push(`## Most-opened labs\n${pop.labs.map((p, i) => `${i + 1}. ${p.lab_name} — ${p.count.toLocaleString()} opens`).join("\n")}`);
      if (!out.length) out.push("Popularity data is unavailable right now. Suggest starting from notebot_browse for the student's level.");

      if (lvl) {
        const subs = subjectsByLevel.find((x) => x.l.id === lvl.id)?.subs.filter(realSubject) ?? [];
        out.push(`## Everything in ${lvl.displayName}\n${subs.map((s) => s.displayName).join(", ")}`);
      }
      out.push("Turn these into advice: start with the student's weakest subject, then a popular one, and offer to build a plan with notebot_study_plan.");
      return text(out.join("\n\n"));
    }),
  );

  server.registerTool(
    "notebot_links",
    {
      title: "NoteBot links",
      description:
        "NoteBot's own links: the website, the Android app, the Messenger bot, the form to submit notes, and the status page. Use when the user asks where to find NoteBot, how to install the app, how to reach the bot, how to contribute notes, or whether NoteBot is down.",
      inputSchema: {
        which: z.enum(["all", "web", "app", "bot", "submit", "status"]).optional().describe("Default all."),
      },
      annotations: { title: "NoteBot links", ...READ_ONLY },
    },
    guard("notebot_links", async ({ which = "all" }) => {
      const rows = NOTEBOT_LINKS.filter((l) => which === "all" || l.id === which);
      return text(rows.map((l) => `- ${l.label}: ${l.url}\n  ${l.use}`).join("\n"));
    }),
  );

  server.registerTool(
    "notebot_status",
    {
      title: "Service status",
      description: "Health of the NoteBot engine and analytics sources behind this server.",
      inputSchema: {},
      annotations: { title: "Service status", ...READ_ONLY },
    },
    guard("notebot_status", async () =>
      text(
        JSON.stringify(
          {
            engine: breakerStatus(engineUpstream),
            analytics: breakerStatus("notebot-analytics"),
            statusPage: "https://status.butexnotebot.com/",
            today: todayDhaka(),
          },
          null,
          2,
        ),
      ),
    ),
  );

  server.registerPrompt(
    "study-plan",
    {
      title: "Build my study plan",
      description: "Personalised day-by-day plan from NoteBot material",
      argsSchema: {
        level: z.string().describe("Your level, 1–4"),
        subjects: z.string().optional().describe("Comma-separated subjects (optional)"),
        days: z.string().optional().describe("Days until the exam"),
      },
    },
    ({ level: lv, subjects: subs, days }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `I'm a BUTEX Level ${lv} student. Build me a day-by-day study plan${days ? ` for the next ${days} days` : ""}${subs ? ` covering ${subs}` : ""}. Use notebot_study_plan to gather the material, link the exact resources, and include previous questions near the end. Ask me which subjects I find hardest if that would change the plan.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "exam-sprint",
    {
      title: "Last-minute exam sprint",
      description: "The highest-yield material for one subject, fast",
      argsSchema: { level: z.string(), subject: z.string() },
    },
    ({ level: lv, subject }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `My ${subject} exam (Level ${lv}) is very soon. Using notebot_subject and notebot_question_banks, list the previous questions and the shortest notes I should go through, in priority order, with links. Then give me a 3-hour revision schedule.`,
          },
        },
      ],
    }),
  );
}

export const NOTEBOT_INSTRUCTIONS = `You are connected to NoteBot, the BUTEX study library: student-contributed notes, books, previous questions, lab reports, routines and syllabi for Bangladesh University of Textiles.

How to help well:
- Find material: notebot_search first for named topics; notebot_browse → notebot_subject to explore a level; notebot_lab_reports for labs; notebot_question_banks for previous questions.
- Explaining a concept: answer from your own knowledge, then point to the matching notes and books with notebot_search so the student can read further.
- Plan studying: notebot_study_plan gathers the material; you write a realistic day-by-day plan with exact links. notebot_recommend shows what other students study most.
- Levels are 1–4. Subjects take names or short codes ("Math-I" = "math1", "Yarn Manufacturing I" = "ym1").
- Always give the Google Drive links from the tools; never invent a resource or a link.
- For official notices, exam dates and new results, use the BUTEX server (butex_*) if it's connected; NoteBot's routines/results are an archive.
- A ⚠️ line means NoteBot was unreachable and you're seeing a cached copy.
- If a tool errors, retry once with simpler arguments (just the level, a shorter query), then try notebot_search.
- NoteBot's own links, when the user asks for them: website https://butexnotebot.com, Android app https://play.google.com/store/apps/details?id=com.hawkers.notebot, Messenger bot https://www.messenger.com/t/103148557940299, submit notes https://forms.gle/RjPXedjRDim4YE6P8, status page https://status.butexnotebot.com/ (notebot_links returns the same list). Share them on request; don't append them to every answer.
- Someone has notes the library is missing? Point them to the submit form.
- NoteBot is an independent, community-driven project, not an official BUTEX service.`;

