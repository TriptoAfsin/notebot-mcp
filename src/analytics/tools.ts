import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { env } from "../env";
import { breakerStatus, cachedFetch, fetchJson } from "../lib/resilient";
import { clamp } from "../lib/util";
import { guard, READ_ONLY, text, todayDhaka } from "../mcp/tooling";

/**
 * Admin-only wrapper over notebot-analytics-go (analytics-api.butexnotebot.com).
 * Reads are cached briefly and served stale if the analytics service is down,
 * so the dashboard questions still get an answer (flagged as cached).
 */

const UPSTREAM = "notebot-analytics";

function url(path: string, query: Record<string, string | number | undefined> = {}, admin = false) {
  const u = new URL(env.analyticsUrl + path);
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") u.searchParams.set(k, String(v));
  if (admin && env.analyticsAdminKey) u.searchParams.set("adminKey", env.analyticsAdminKey);
  return u.toString();
}

async function get(path: string, query: Record<string, string | number | undefined> = {}, admin = false, freshSec = 120) {
  const target = url(path, query, admin);
  return cachedFetch(`analytics:${path}:${JSON.stringify(query)}`, freshSec, async () => (await fetchJson<unknown>(target, { upstream: UPSTREAM, timeoutMs: 10_000 })).data, 3 * 24 * 3600);
}

async function post(path: string, body: unknown) {
  if (!env.analyticsAdminKey) throw new Error("ANALYTICS_ADMIN_KEY is not configured on the MCP server");
  const target = url(path, {}, true);
  return cachedFetch(`analytics:${path}:${JSON.stringify(body)}`, 60, async () =>
    (await fetchJson<unknown>(target, {
      upstream: UPSTREAM,
      timeoutMs: 10_000,
      init: { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
    })).data, 24 * 3600);
}

function out(label: string, r: { data: unknown; stale: boolean; warning?: string; fetchedAt: string }) {
  const note = r.stale ? `⚠️ ${r.warning}` : `Live from analytics API (${r.fetchedAt}).`;
  return text(`${label} — today ${todayDhaka()}\n${note}\n\n${JSON.stringify(r.data, null, 2)}`);
}

const page = z.number().int().min(1).max(1000).optional();
const limit = z.number().int().min(1).max(500).optional();

export function registerAnalyticsTools(server: McpServer) {
  server.registerTool(
    "analytics_overview",
    {
      title: "NoteBot analytics overview",
      description: "One-shot snapshot: platform usage KPIs (bot vs app), top 5 note subjects and top 5 lab subjects. Partial results are returned if one source fails.",
      inputSchema: {},
      annotations: { title: "Analytics overview", ...READ_ONLY },
    },
    guard("analytics_overview", async () => {
      const [summary, notes, labs] = await Promise.allSettled([get("/daily_report/summary"), get("/notes/top"), get("/labs/top")]);
      const pick = (r: PromiseSettledResult<{ data: unknown; stale: boolean }>) =>
        r.status === "fulfilled" ? { ...(r.value.data as object), ...(r.value.stale ? { _cached: true } : {}) } : { error: String((r.reason as Error)?.message ?? r.reason) };
      return text(`NoteBot analytics overview — today ${todayDhaka()}\n\n${JSON.stringify({ usage: pick(summary), notes: pick(notes), labs: pick(labs) }, null, 2)}`);
    }),
  );

  server.registerTool(
    "analytics_daily_usage",
    {
      title: "Daily usage report",
      description: "Per-day request counts for the Messenger bot and the app, newest first, with optional platform and date filters.",
      inputSchema: {
        platform: z.enum(["bot", "app"]).optional(),
        start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        page,
        limit: z.number().int().min(1).max(366).optional().describe("Default 30."),
      },
      annotations: { title: "Daily usage", ...READ_ONLY },
    },
    guard("analytics_daily_usage", async (a) =>
      out("Daily usage", await get("/daily_report", { platform: a.platform, startDate: a.start_date, endDate: a.end_date, page: a.page, limit: clamp(a.limit, 1, 366, 30) })),
    ),
  );

  server.registerTool(
    "analytics_subjects",
    {
      title: "Note & lab popularity",
      description: "View counts per subject. kind=notes gives the top 5 note subjects; kind=labs gives every lab subject (or top 5 with top=true).",
      inputSchema: { kind: z.enum(["notes", "labs"]), top: z.boolean().optional() },
      annotations: { title: "Subject popularity", ...READ_ONLY },
    },
    guard("analytics_subjects", async ({ kind, top }) =>
      out(`${kind} popularity`, await get(kind === "notes" ? "/notes/top" : top ? "/labs/top" : "/labs")),
    ),
  );

  server.registerTool(
    "analytics_missed_keywords",
    {
      title: "Missed keywords",
      description: "Words users sent that the bot couldn't match — the content-gap list. Optional substring search.",
      inputSchema: { search: z.string().max(80).optional(), page, limit },
      annotations: { title: "Missed keywords", ...READ_ONLY },
    },
    guard("analytics_missed_keywords", async (a) =>
      out("Missed keywords", await get("/missed", { search: a.search, page: a.page, limit: clamp(a.limit, 1, 500, 100) })),
    ),
  );

  server.registerTool(
    "analytics_game_leaderboard",
    {
      title: "Game leaderboards",
      description: "Hall of fame for the NoteBird or NoteDino mini-games, highest score first.",
      inputSchema: { game: z.enum(["notebird", "notedino"]), search: z.string().max(80).optional(), page, limit },
      annotations: { title: "Game leaderboard", ...READ_ONLY },
    },
    guard("analytics_game_leaderboard", async (a) =>
      out(`${a.game} leaderboard`, await get(`/games/${a.game}`, { search: a.search, page: a.page, limit: clamp(a.limit, 1, 100, 20) })),
    ),
  );

  server.registerTool(
    "analytics_users",
    {
      title: "App users",
      description: "Registered NoteBot app users (email, uni id, dept, batch), newest first. search matches email or department. Contains personal data — summarise rather than dump unless asked.",
      inputSchema: { search: z.string().max(80).optional(), page, limit },
      annotations: { title: "App users", ...READ_ONLY },
    },
    guard("analytics_users", async (a) =>
      out("App users", await get("/users/app", { search: a.search, page: a.page, limit: clamp(a.limit, 1, 500, 50) })),
    ),
  );

  server.registerTool(
    "analytics_find_users",
    {
      title: "Find users",
      description: "Look users up by exact/LIKE email, or by department + batch (e.g. dept 'wet', batch '47').",
      inputSchema: {
        email: z.string().max(254).optional(),
        dept: z.string().max(40).optional(),
        batch: z.string().max(10).optional(),
      },
      annotations: { title: "Find users", ...READ_ONLY },
    },
    guard("analytics_find_users", async ({ email, dept, batch }) => {
      if (email) return out(`Users matching ${email}`, await post("/users/app/email", { email }));
      if (dept && batch) return out(`Users in ${dept} batch ${batch}`, await post("/users/app/batch_dept", { dept: `%${dept}%`, batch }));
      return text("Pass either email, or both dept and batch.");
    }),
  );

  server.registerTool(
    "analytics_error_logs",
    {
      title: "App error logs",
      description: "Client error logs reported by the NoteBot app, optionally filtered to one user's email.",
      inputSchema: { email: z.string().max(254).optional() },
      annotations: { title: "Error logs", ...READ_ONLY },
    },
    guard("analytics_error_logs", async ({ email }) => {
      if (email) return out(`Error logs for ${email}`, await post("/logs/err/email", { email }));
      if (!env.analyticsAdminKey) throw new Error("ANALYTICS_ADMIN_KEY is not configured on the MCP server");
      return out("Error logs", await get("/logs/err", {}, true, 60));
    }),
  );

  server.registerTool(
    "analytics_status",
    {
      title: "Analytics service status",
      description: "Health of notebot-analytics-go and its database connection.",
      inputSchema: {},
      annotations: { title: "Analytics status", ...READ_ONLY },
    },
    guard("analytics_status", async () => {
      const health = await fetchJson<unknown>(url("/health"), { upstream: UPSTREAM, timeoutMs: 5000, retries: 0 })
        .then((r) => r.data)
        .catch((e: Error) => ({ error: e.message }));
      return text(JSON.stringify({ analyticsApi: env.analyticsUrl, health, breaker: breakerStatus(UPSTREAM), adminKeyConfigured: !!env.analyticsAdminKey }, null, 2));
    }),
  );
}
