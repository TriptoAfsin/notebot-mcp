import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { join } from "node:path";
import { startUsageReporter } from "./analytics/usage";
import { getCorpus } from "./butex/client";
import { registerButexTools, startButexWarmer } from "./butex/tools";
import { env } from "./env";
import { cache } from "./lib/cache";
import { safeEqual } from "./lib/crypto";
import { db, dbStatus, warmDb } from "./lib/db";
import { keyUsage, readRotateToken, readUnsubscribeToken, requestKey, revokeKey, rotateKeys, unsubscribe } from "./lib/keys";
import { mailConfigured } from "./lib/mail";
import { breakerStatus } from "./lib/resilient";
import { clientIp, errMsg, json } from "./lib/util";
import { BUTEX_INSTRUCTIONS, handleMcp } from "./mcp/handler";
import { NOTEBOT_INSTRUCTIONS, registerNotebotTools } from "./notebot/tools";
import { authorizeGet, authorizePost, authServerMetadata, protectedResourceMetadata, register, token } from "./oauth/oauth";
import { SKILL_VERSION, skillRoute } from "./skill";
import { VERSION } from "./version";
import { agentSetup, dashboardPage, messagePage, type ToolDoc } from "./web/dashboard";

const PUBLIC_DIR = join(import.meta.dir, "..", "public");
const STATIC = new Set(["/mcp-icon-butex.png", "/mcp-icon-notebot.png", "/app.css", "/app.js", "/icon.png", "/favicon.ico", "/apple-touch-icon.png"]);

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id, x-api-key",
  "access-control-expose-headers": "mcp-session-id, www-authenticate, retry-after",
  "access-control-max-age": "86400",
};

function withCors(res: Response): Response {
  // responses from Response.redirect/static files can have immutable headers
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
  return out;
}

/** Tool docs for the dashboard come from the real registrations, so the page can't drift from the server. */
function toolDocs(register: (s: McpServer) => void, extra: ToolDoc[] = []): ToolDoc[] {
  try {
    const s = new McpServer({ name: "introspect", version: VERSION });
    register(s);
    const reg = (s as unknown as { _registeredTools: Record<string, { title?: string; description?: string }> })._registeredTools;
    return Object.entries(reg)
      .filter(([name]) => name !== "search" && name !== "fetch")
      .map(([name, t]) => ({ name, title: t.title ?? name, description: t.description ?? "" }))
      .concat(extra);
  } catch {
    return extra;
  }
}

const dashboardData = {
  servers: [
    {
      id: "butex",
      name: "BUTEX MCP",
      tools: toolDocs(registerButexTools, [
        { name: "search · fetch", title: "ChatGPT pair", description: "The search/fetch pair ChatGPT connectors and deep research look for, over the same notices." },
      ]),
      guidelines: BUTEX_INSTRUCTIONS,
    },
    { id: "notebot", name: "NoteBot knowledge base", tools: toolDocs(registerNotebotTools), guidelines: NOTEBOT_INSTRUCTIONS },
  ],
  skillVersion: SKILL_VERSION,
};

async function readJson<T>(req: Request): Promise<Partial<T>> {
  try {
    return (await req.json()) as Partial<T>;
  } catch {
    return {};
  }
}

function isAdmin(req: Request): boolean {
  const given = req.headers.get("x-admin-key") ?? "";
  return !!env.adminKey && !!given && safeEqual(given, env.adminKey);
}

const csvCell = (v: unknown) => {
  const s = Array.isArray(v) ? v.join(";") : v instanceof Date ? v.toISOString() : String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function route(req: Request, server: Bun.Server<undefined>): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = req.method;
  const ip = clientIp(req, server);

  if (method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  // MCP endpoints
  if (path === "/butex/mcp" || path === "/mcp") return withCors(await handleMcp(req, "butex"));
  if (path === "/notebot/mcp") return withCors(await handleMcp(req, "notebot"));
  if (path === "/analytics/mcp") return withCors(await handleMcp(req, "analytics"));

  // OAuth discovery (RFC 9728 / RFC 8414). Clients probe several spellings, so be generous.
  if (path.startsWith("/.well-known/oauth-protected-resource")) {
    return withCors(protectedResourceMetadata(path.includes("analytics") ? "analytics" : path.includes("notebot") ? "notebot" : "butex"));
  }
  if (path.startsWith("/.well-known/oauth-authorization-server") || path.startsWith("/.well-known/openid-configuration")) {
    return withCors(authServerMetadata());
  }
  if (path === "/oauth/register" && method === "POST") return withCors(await register(req));
  if (path === "/oauth/authorize") return method === "POST" ? authorizePost(req, ip) : authorizeGet(req);
  if (path === "/oauth/token" && method === "POST") return withCors(await token(req));

  // Dashboard API
  if (path === "/api/keys" && method === "POST") {
    const { email } = await readJson<{ email: string }>(req);
    const r = await requestKey({ email: String(email ?? ""), ip });
    if (!r.ok) return json({ error: r.error }, { status: r.status });
    return r.kind === "created"
      ? json({ status: "created", key: r.key, id: r.id, endpoints: [`${env.publicUrl}/butex/mcp`, `${env.publicUrl}/notebot/mcp`] }, { status: 201 })
      : json({ status: "emailed", message: `This address already has a key. We've emailed it to ${r.email}. Check spam if it isn't there in a minute.` });
  }
  if (path === "/api/keys/usage" && method === "POST") {
    const { key } = await readJson<{ key: string }>(req);
    const u = await keyUsage(String(key ?? ""));
    return u ? json(u) : json({ error: "That key isn't valid or has been revoked." }, { status: 404 });
  }
  if (path === "/api/keys/revoke" && method === "POST") {
    const { key } = await readJson<{ key: string }>(req);
    return (await revokeKey(String(key ?? "")))
      ? json({ revoked: true })
      : json({ error: "Couldn't revoke: the key is invalid, already revoked, or the database is unreachable right now." }, { status: 400 });
  }
  if (path === "/api/latest") {
    const c = await getCorpus().catch(() => null);
    if (!c) return json({ error: "unavailable" }, { status: 503 });
    return json(
      { items: c.data.slice(0, 5).map(({ id, title, date, url: u }) => ({ id, title, date, url: u })), stale: c.stale },
      { headers: { "cache-control": "public, max-age=120" } },
    );
  }

  // Emailed links. GET only renders a confirm button: link scanners in mail clients
  // pre-fetch URLs, and a GET that acted would burn the link before the owner clicks.
  if (path === "/keys/rotate") {
    const t = method === "POST" ? new URLSearchParams(await req.text()).get("t") ?? "" : url.searchParams.get("t") ?? "";
    if (method === "POST") {
      const r = await rotateKeys(t, ip);
      return r.ok
        ? messagePage({ title: "Here's your new key", body: `Your old key for ${r.email} is revoked. This is the only time the new one is shown, so copy it now. It works on both servers.`, key: r.key })
        : messagePage({ title: "Couldn't replace the key", body: r.error }, 400);
    }
    const email = readRotateToken(t);
    return email
      ? messagePage({ title: "Replace your key?", body: `This revokes every dashboard key for ${email} and shows a new one. Apps using the old key stop working until you paste the new one.`, form: { action: "/keys/rotate", t, label: "Revoke and create a new key" } })
      : messagePage({ title: "Link expired", body: "This link is no longer valid. Request your key again from the dashboard to get a fresh link." }, 400);
  }
  if (path === "/unsubscribe") {
    const t = method === "POST" ? new URLSearchParams(await req.text()).get("t") ?? "" : url.searchParams.get("t") ?? "";
    const email = readUnsubscribeToken(t);
    if (!email) return messagePage({ title: "Link not valid", body: "This unsubscribe link isn't valid." }, 400);
    if (method === "POST") {
      const ok = await unsubscribe(email);
      return messagePage({ title: ok ? "You're unsubscribed" : "Try again later", body: ok ? `${email} won't get NoteBot update emails. Your key keeps working, and key-recovery emails still go out when you ask for them.` : "The database is unreachable right now." });
    }
    return messagePage({ title: "Unsubscribe?", body: `Stop NoteBot update emails to ${email}.`, form: { action: "/unsubscribe", t, label: "Unsubscribe" } });
  }

  // Owner-only export of everyone who asked for a key
  if (path === "/api/admin/contacts.csv") {
    if (!isAdmin(req)) return json({ error: "Admin key required (X-Admin-Key)." }, { status: 401 });
    const rows = (await db((sql) => sql`SELECT email, first_seen, last_seen, sources, key_requests, recovery_emails, unsubscribed_at FROM mcp.contacts ORDER BY first_seen`, 15_000)) as Record<string, unknown>[] | null;
    if (!rows) return json({ error: "database unavailable" }, { status: 503 });
    const cols = ["email", "first_seen", "last_seen", "sources", "key_requests", "recovery_emails", "unsubscribed_at"];
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n");
    return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="notebot-mcp-contacts.csv"', "cache-control": "no-store" } });
  }

  if (path === "/health") {
    const [c, d] = await Promise.all([cache.status(), dbStatus()]);
    return json({
      ok: true,
      version: VERSION,
      skill: SKILL_VERSION,
      butex: breakerStatus("butex.edu.bd"),
      engine: breakerStatus("notebot-engine"),
      cache: c,
      database: d,
      email: mailConfigured() ? "configured" : "not configured",
    });
  }

  if (path.startsWith("/skill/")) {
    const r = skillRoute(path);
    if (r) return withCors(r);
  }

  if (path === "/" && method === "GET") return dashboardPage(dashboardData);
  if (path === "/robots.txt") return new Response("User-agent: *\nAllow: /\nDisallow: /oauth/\nDisallow: /api/\nDisallow: /keys/\n");
  if (path === "/setup.md") return new Response(agentSetup(), { headers: { "content-type": "text/markdown; charset=utf-8" } });
  if (path === "/llms.txt") {
    return new Response(
      `# NoteBot MCP\n\nMCP servers for BUTEX (Bangladesh University of Textiles) students.\n\n- BUTEX MCP (official notices, departments, faculty, offices): ${env.publicUrl}/butex/mcp\n- NoteBot knowledge base: ${env.publicUrl}/notebot/mcp\n- Streamable HTTP; OAuth or Bearer key. Free key: ${env.publicUrl}/#get-key\n- Agent skill: ${env.publicUrl}/skill/SKILL.md\n- Agent setup steps: ${env.publicUrl}/setup.md\n\n## BUTEX MCP\n${BUTEX_INSTRUCTIONS}\n\n## NoteBot knowledge base\n${NOTEBOT_INSTRUCTIONS}\n`,
      { headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  if (STATIC.has(path) || path.startsWith("/fonts/")) {
    const file = Bun.file(join(PUBLIC_DIR, path.replace(/\.\./g, "")));
    if (await file.exists()) {
      const immutable = path.startsWith("/fonts/");
      return new Response(file, { headers: { "cache-control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=3600" } });
    }
  }

  return json({ error: "Not found" }, { status: 404 });
}

const server = Bun.serve({
  port: env.port,
  hostname: "0.0.0.0",
  idleTimeout: 120, // notice reads can download a PDF + scans
  maxRequestBodySize: 1024 * 1024,
  async fetch(req, srv) {
    try {
      return await route(req, srv);
    } catch (err) {
      console.error("unhandled route error:", err);
      return json({ error: `Internal error: ${errMsg(err)}` }, { status: 500 });
    }
  },
  error(err) {
    console.error("server error:", err);
    return json({ error: "Internal error" }, { status: 500 });
  },
});

process.on("unhandledRejection", (r) => console.error("unhandledRejection:", r));
process.on("uncaughtException", (e) => console.error("uncaughtException:", e));

warmDb();
startButexWarmer();
startUsageReporter();
console.log(`🟢 NoteBot MCP v${VERSION} on :${server.port} (public ${env.publicUrl})`);
