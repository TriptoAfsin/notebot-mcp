import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { cache } from "../lib/cache";
import { dbStatus } from "../lib/db";
import { breakerStatus, type Cached } from "../lib/resilient";
import { clamp, errMsg } from "../lib/util";
import { freshnessLine, guard, READ_ONLY, text, todayDhaka } from "../mcp/tooling";
import {
  butexUpstream,
  CATEGORY_SLUGS,
  DEPARTMENT_SLUGS,
  getCategories,
  getCorpus,
  getNotice,
  listNotices,
  searchCorpus,
  slugToId,
  type CategoryKey,
  type DepartmentKey,
  type Notice,
  type Page,
} from "./client";
import { imageForModel, pdfText } from "./reader";
import { SKILL_VERSION } from "../skill";

const categoryEnum = z.enum(Object.keys(CATEGORY_SLUGS) as [CategoryKey, ...CategoryKey[]]);
const departmentEnum = z.enum(Object.keys(DEPARTMENT_SLUGS) as [DepartmentKey, ...DepartmentKey[]]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

function line(n: Notice): string {
  const counts = n.attachments.length
    ? " · " +
      Object.entries(
        n.attachments.reduce<Record<string, number>>((m, a) => ((m[a.kind] = (m[a.kind] ?? 0) + 1), m), {}),
      )
        .map(([k, v]) => `${v} ${k}${v > 1 ? "s" : ""}`)
        .join(", ")
    : "";
  return `- [${n.date.slice(0, 10)}] ${n.title}\n  id ${n.id} · ${n.categories.join(", ") || "uncategorised"}${counts}\n  ${n.url}`;
}

function renderList(heading: string, c: Cached<Page<Notice>> | Cached<Notice[]>, items: Notice[], extra?: string): CallToolResult {
  const total = Array.isArray(c.data) ? items.length : c.data.total;
  const body = items.length ? items.map(line).join("\n") : "No matching notices.";
  return text(
    [
      `${heading} — today is ${todayDhaka()} (Asia/Dhaka). Showing ${items.length}${total > items.length ? ` of ${total}` : ""}.`,
      body,
      extra ?? "",
      freshnessLine(c),
      items.length ? "Notice bodies are usually scanned images or PDFs: call butex_read_notice with an id to read one." : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  );
}

/** "Level-2 Term-1", "L-2 T-1", "L2-T1" all normalise to l2t1; "B.Sc." to bsc. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/level\s*-?\s*/g, "l")
    .replace(/term\s*-?\s*/g, "t")
    .replace(/[^a-z0-9]/g, "");
}

function matchesAll(title: string, query?: string): boolean {
  if (!query?.trim()) return true;
  const hay = norm(title);
  return query
    .split(/[\s,]+/)
    .map(norm)
    .filter(Boolean)
    .every((tok) => hay.includes(tok));
}

const EXAM_RE = /\b(exam|examination|mid[\s-]?term|final|test)\b/i;
const CLASS_RE = /\b(class|routine|lecture|term start|class (start|resume|suspend|off))/i;

async function schedulePool(): Promise<{ items: Notice[]; meta: Cached<unknown> }> {
  const terms = ["routine", "schedule", "class", "exam date"];
  const settled = await Promise.allSettled(terms.map((search) => listNotices({ search, perPage: 100 }, 1800)));
  const ok = settled.filter((s): s is PromiseFulfilledResult<Cached<Page<Notice>>> => s.status === "fulfilled").map((s) => s.value);
  if (!ok.length) {
    // every live search failed: fall back to the cached corpus
    const corpus = await getCorpus();
    const items = corpus.data.filter((n) => /routine|schedule|class|exam/i.test(n.title));
    return { items, meta: { ...corpus, stale: true, warning: corpus.warning ?? "Live search failed; searched the cached notice archive." } };
  }
  const byId = new Map<number, Notice>();
  for (const page of ok) for (const n of page.data.items) byId.set(n.id, n);
  const items = [...byId.values()].sort((a, b) => b.date.localeCompare(a.date));
  const stale = ok.find((p) => p.stale);
  return { items, meta: stale ?? ok[0]! };
}

async function searchNotices(query: string, categoryIds: number[] | undefined, after?: string, before?: string, page = 1, perPage = 10) {
  try {
    const live = await listNotices({ search: query, categoryIds, after, before, page, perPage }, 900);
    if (live.data.items.length || page > 1) return { meta: live as Cached<unknown>, items: live.data.items, total: live.data.total };
  } catch (err) {
    const corpus = await getCorpus();
    let items = searchCorpus(corpus.data, query);
    if (after) items = items.filter((n) => n.date.slice(0, 10) >= after);
    if (before) items = items.filter((n) => n.date.slice(0, 10) <= before);
    return {
      meta: { ...corpus, stale: true, warning: `Live search failed (${errMsg(err)}); searched the ${corpus.data.length} most recent notices from cache.` },
      items: items.slice((page - 1) * perPage, page * perPage),
      total: items.length,
    };
  }
  // WordPress search matches whole words; retry fuzzily on the recent archive ("L2-T1" vs "L-2 T-1")
  const corpus = await getCorpus();
  const items = corpus.data.filter((n) => matchesAll(n.title, query));
  return { meta: corpus as Cached<unknown>, items: items.slice(0, perPage), total: items.length };
}

export function registerButexTools(server: McpServer) {
  server.registerTool(
    "butex_latest_notices",
    {
      title: "Latest BUTEX notices",
      description:
        "Newest notices from the official BUTEX website (butex.edu.bd), optionally filtered to one category. Use for 'what's new at BUTEX', 'latest academic notices', 'any new tender/admission/convocation updates'.",
      inputSchema: {
        category: categoryEnum.optional().describe("Omit for all categories. academic = Academic Notices (class/exam/routine notices live here)."),
        limit: z.number().int().min(1).max(50).optional().describe("Default 10."),
        page: z.number().int().min(1).max(50).optional(),
      },
      annotations: { title: "Latest BUTEX notices", ...READ_ONLY },
    },
    guard("butex_latest_notices", async ({ category, limit, page }) => {
      const ids = category ? [await slugToId(CATEGORY_SLUGS[category])].filter((x): x is number => !!x) : undefined;
      const res = await listNotices({ categoryIds: ids, perPage: clamp(limit, 1, 50, 10), page: page ?? 1 });
      return renderList(`Latest BUTEX ${category ?? "notices"}`, res, res.data.items);
    }),
  );

  server.registerTool(
    "butex_search_notices",
    {
      title: "Search BUTEX notices",
      description:
        "Full-text search across all ~3,500 BUTEX notices since 2017. Supports category, department and date-range filters. Falls back to a cached archive if the site is down.",
      inputSchema: {
        query: z.string().min(2).max(120).describe("Keywords, e.g. 'convocation 2027', 'L-3 T-2 result', 'admit card'."),
        category: categoryEnum.optional(),
        department: departmentEnum.optional(),
        since: isoDate.optional().describe("Only notices on/after this date (YYYY-MM-DD)."),
        until: isoDate.optional().describe("Only notices on/before this date (YYYY-MM-DD)."),
        limit: z.number().int().min(1).max(50).optional(),
        page: z.number().int().min(1).max(50).optional(),
      },
      annotations: { title: "Search BUTEX notices", ...READ_ONLY },
    },
    guard("butex_search_notices", async ({ query, category, department, since, until, limit, page }) => {
      const slugs = [category && CATEGORY_SLUGS[category], department && DEPARTMENT_SLUGS[department]].filter(Boolean) as string[];
      const ids = (await Promise.all(slugs.map(slugToId))).filter((x): x is number => !!x);
      const r = await searchNotices(query, ids.length ? ids : undefined, since, until, page ?? 1, clamp(limit, 1, 50, 10));
      return renderList(`BUTEX notices matching "${query}"`, { ...(r.meta as Cached<Notice[]>), data: r.items }, r.items,
        r.total > r.items.length ? `${r.total} matches in total; use page to see more.` : undefined);
    }),
  );

  server.registerTool(
    "butex_schedules",
    {
      title: "BUTEX class routines & exam schedules",
      description:
        "Class routines, class start/completion notices, exam routines and exam schedules (BSc, MSc, MBA, PhD, PGD, affiliated colleges). Filter with free text like 'L-2 T-1', 'MSc Apparel', 'affiliated', 'mid term'.",
      inputSchema: {
        kind: z.enum(["class", "exam", "all"]).optional().describe("Default all."),
        query: z.string().max(80).optional().describe("Level/term/program/department tokens; spacing and hyphens don't matter."),
        limit: z.number().int().min(1).max(40).optional(),
      },
      annotations: { title: "BUTEX schedules", ...READ_ONLY },
    },
    guard("butex_schedules", async ({ kind = "all", query, limit }) => {
      const { items, meta } = await schedulePool();
      const filtered = items
        .filter((n) => !/^result/i.test(n.title))
        .filter((n) => (kind === "exam" ? EXAM_RE.test(n.title) : kind === "class" ? CLASS_RE.test(n.title) && !/exam routine|exam schedule/i.test(n.title) : true))
        .filter((n) => matchesAll(n.title, query));
      const shown = filtered.slice(0, clamp(limit, 1, 40, 10));
      return renderList(`BUTEX ${kind === "all" ? "class & exam schedules" : `${kind} schedules`}${query ? ` for "${query}"` : ""}`,
        { ...(meta as Cached<Notice[]>), data: filtered }, shown);
    }),
  );

  server.registerTool(
    "butex_results",
    {
      title: "BUTEX published results",
      description:
        "Published exam results (Published Results category, newest first). Filter with tokens like 'L4-T1', 'retake', 'MBA 9th batch', 'affiliated', 'Yarn'.",
      inputSchema: {
        query: z.string().max(80).optional(),
        limit: z.number().int().min(1).max(40).optional(),
      },
      annotations: { title: "BUTEX results", ...READ_ONLY },
    },
    guard("butex_results", async ({ query, limit }) => {
      const id = await slugToId(CATEGORY_SLUGS.results);
      const pages = await Promise.all([1, 2, 3].map((page) => listNotices({ categoryIds: id ? [id] : undefined, page, perPage: 100 }, 900)));
      const all = pages.flatMap((p) => p.data.items);
      const filtered = all.filter((n) => matchesAll(n.title, query));
      const meta = pages.find((p) => p.stale) ?? pages[0]!;
      return renderList(`BUTEX results${query ? ` for "${query}"` : ""}`, { ...meta, data: filtered }, filtered.slice(0, clamp(limit, 1, 40, 10)),
        "Result PDFs usually list student IDs; use butex_read_notice to extract the text.");
    }, "If you passed a narrow query, try fewer tokens (e.g. just 'L4-T1')."),
  );

  server.registerTool(
    "butex_department_notices",
    {
      title: "BUTEX department notices",
      description: "Notices posted under a specific BUTEX department (yarn, fabric, wet process, apparel, fashion design, management, machinery, IPE, dyes & chemical, environmental).",
      inputSchema: {
        department: departmentEnum,
        limit: z.number().int().min(1).max(50).optional(),
        page: z.number().int().min(1).max(50).optional(),
      },
      annotations: { title: "BUTEX department notices", ...READ_ONLY },
    },
    guard("butex_department_notices", async ({ department, limit, page }) => {
      const id = await slugToId(DEPARTMENT_SLUGS[department]);
      const res = await listNotices({ categoryIds: id ? [id] : undefined, perPage: clamp(limit, 1, 50, 10), page: page ?? 1 });
      return renderList(`BUTEX ${department.replace(/_/g, " ")} department notices`, res, res.data.items);
    }),
  );

  server.registerTool(
    "butex_read_notice",
    {
      title: "Read a BUTEX notice",
      description:
        "Open one notice by id or URL and return its full content: any body text, the extracted text of attached PDFs, and the scanned notice image(s) so you can read dates, tables and instructions directly. Use after listing/searching when the user needs details (exam dates, deadlines, room numbers, fees).",
      inputSchema: {
        notice: z.union([z.string(), z.number()]).describe("Numeric id (from other tools) or a butex.edu.bd notice URL."),
        include_images: z.boolean().optional().describe("Attach scanned pages as images for you to read. Default true."),
        max_images: z.number().int().min(1).max(4).optional().describe("Default 2."),
      },
      annotations: { title: "Read BUTEX notice", ...READ_ONLY },
    },
    guard("butex_read_notice", async ({ notice, include_images = true, max_images }) => {
      const res = await getNotice(notice);
      const n = res.data;
      const parts: CallToolResult["content"] = [];
      const lines = [
        `# ${n.title}`,
        `Published ${n.date.replace("T", " ")} (Asia/Dhaka) · ${n.categories.join(", ")}`,
        `Notice page: ${n.url}`,
        n.attachments.length ? `Attachments:\n${n.attachments.map((a) => `- ${a.kind}: ${a.url}`).join("\n")}` : "No attachments.",
        n.text ? `## Body text\n${n.text}` : "",
        freshnessLine(res),
      ];

      const pdfs = n.attachments.filter((a) => a.kind === "pdf").slice(0, 2);
      for (const a of pdfs) {
        try {
          const p = await pdfText(a.url);
          lines.push(
            p.scanned
              ? `## PDF ${a.url}\n(${p.pages} page scan with no text layer — open the link to view it.)`
              : `## PDF text (${p.pages} pages${p.truncated ? ", truncated" : ""})\n${p.text}`,
          );
        } catch (err) {
          lines.push(`## PDF ${a.url}\nCould not extract text (${errMsg(err)}). Share the link with the user instead.`);
        }
      }
      parts.push({ type: "text", text: lines.filter(Boolean).join("\n\n") });

      if (include_images) {
        const imgs = n.attachments.filter((a) => a.kind === "image").slice(0, clamp(max_images, 1, 4, 2));
        const loaded = await Promise.allSettled(imgs.map(imageForModel));
        loaded.forEach((r, i) => {
          if (r.status === "fulfilled") parts.push({ type: "image", data: r.value.data, mimeType: r.value.mimeType });
          else parts.push({ type: "text", text: `(Image ${imgs[i]!.url} could not be loaded: ${errMsg(r.reason)})` });
        });
        if (imgs.length) parts.push({ type: "text", text: "The image(s) above are the official scanned notice. Read them carefully and quote exact dates/times." });
      }
      return { content: parts };
    }, "Check the id/URL came from butex_* tools. You can always give the user the notice link directly."),
  );

  server.registerTool(
    "butex_categories",
    {
      title: "BUTEX notice categories",
      description: "All notice categories on butex.edu.bd with post counts, and the friendly names other tools accept.",
      inputSchema: {},
      annotations: { title: "BUTEX categories", ...READ_ONLY },
    },
    guard("butex_categories", async () => {
      const res = await getCategories();
      const rows = res.data.filter((c) => c.count > 0).sort((a, b) => b.count - a.count).map((c) => `- ${c.name} (${c.slug}): ${c.count}`);
      const friendly = Object.entries(CATEGORY_SLUGS).map(([k, v]) => `${k} → ${v}`).join(", ");
      const depts = Object.entries(DEPARTMENT_SLUGS).map(([k, v]) => `${k} → ${v}`).join(", ");
      return text(`${rows.join("\n")}\n\ncategory values: ${friendly}\n\ndepartment values: ${depts}\n\n${freshnessLine(res)}`);
    }),
  );

  server.registerTool(
    "butex_status",
    {
      title: "Service status",
      description: "Health of the BUTEX source, cache and this MCP server. Use when results look stale or a tool reported an error.",
      inputSchema: {},
      annotations: { title: "Service status", ...READ_ONLY },
    },
    guard("butex_status", async () => {
      const [c, corpus] = await Promise.all([cache.status(), getCorpus().catch(() => null)]);
      return text(
        JSON.stringify(
          {
            butexSite: breakerStatus(butexUpstream),
            cache: c,
            database: await dbStatus(),
            offlineArchive: corpus ? { notices: corpus.data.length, fetchedAt: corpus.fetchedAt } : "not built yet",
            today: todayDhaka(),
            latestSkillVersion: SKILL_VERSION,
          },
          null,
          2,
        ),
      );
    }),
  );

  // ChatGPT connectors and deep research look for exactly these two tools.
  server.registerTool(
    "search",
    {
      title: "Search BUTEX notices",
      description: "Search official BUTEX (Bangladesh University of Textiles) notices, schedules and results. Returns ids for the fetch tool.",
      inputSchema: { query: z.string().min(1).max(200) },
      annotations: { title: "Search", ...READ_ONLY },
    },
    guard("search", async ({ query }) => {
      const r = await searchNotices(query, undefined, undefined, undefined, 1, 15);
      const results = r.items.map((n) => ({ id: String(n.id), title: `${n.title} (${n.date.slice(0, 10)})`, url: n.url }));
      return text(JSON.stringify({ results }));
    }),
  );

  server.registerTool(
    "fetch",
    {
      title: "Fetch a BUTEX notice",
      description: "Fetch the full content of a BUTEX notice by id returned from search.",
      inputSchema: { id: z.string().min(1) },
      annotations: { title: "Fetch", ...READ_ONLY },
    },
    guard("fetch", async ({ id }) => {
      const { data: n } = await getNotice(id);
      const chunks = [n.text ?? ""];
      for (const a of n.attachments.filter((x) => x.kind === "pdf").slice(0, 2)) {
        const p = await pdfText(a.url).catch(() => null);
        if (p && !p.scanned) chunks.push(p.text);
      }
      const body = chunks.filter(Boolean).join("\n\n") ||
        `This notice is a scanned image. Attachments: ${n.attachments.map((a) => a.url).join(", ") || "none"}. Open ${n.url} to read it.`;
      return text(
        JSON.stringify({
          id: String(n.id),
          title: n.title,
          text: `${n.title}\nPublished ${n.date}\nCategories: ${n.categories.join(", ")}\n\n${body}`,
          url: n.url,
          metadata: { published: n.date, categories: n.categories.join(", "), attachments: n.attachments.map((a) => a.url).join(" ") },
        }),
      );
    }),
  );
}

/** Keep the offline archive warm so search survives a site outage. */
export function startButexWarmer() {
  const tick = () => getCorpus().catch((err) => console.error("corpus warm failed:", errMsg(err)));
  setTimeout(tick, 5_000);
  setInterval(tick, 20 * 60_000);
}
