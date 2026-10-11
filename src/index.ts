import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { join } from "node:path";
import { getCorpus } from "./butex/client";
import { registerButexTools, startButexWarmer } from "./butex/tools";
import { env } from "./env";
import { cache } from "./lib/cache";
import { dbStatus, warmDb } from "./lib/db";
import { issueKey, keyUsage, revokeKey } from "./lib/keys";
import { breakerStatus } from "./lib/resilient";
import { clientIp, errMsg, json } from "./lib/util";
import { BUTEX_INSTRUCTIONS, handleMcp } from "./mcp/handler";
import { authorizeGet, authorizePost, authServerMetadata, protectedResourceMetadata, register, token } from "./oauth/oauth";
import { SKILL_VERSION, skillRoute } from "./skill";
import { VERSION } from "./version";
import { dashboardPage, type ToolDoc } from "./web/pages";

const PUBLIC_DIR = join(import.meta.dir, "..", "public");
const STATIC = new Set(["/app.css", "/app.js", "/icon.png", "/favicon.ico", "/apple-touch-icon.png"]);

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
function toolDocs(): ToolDoc[] {
  try {
    const s = new McpServer({ name: "introspect", version: VERSION });
    registerButexTools(s);
    const reg = (s as unknown as { _registeredTools: Record<string, { title?: string; description?: string }> })._registeredTools;
    return Object.entries(reg)
      .filter(([name]) => name !== "search" && name !== "fetch")
      .map(([name, t]) => ({ name, title: t.title ?? name, description: t.description ?? "" }))
      .concat([{ name: "search · fetch", title: "ChatGPT pair", description: "The search/fetch pair ChatGPT connectors and deep research look for, over the same notices." }]);
  } catch {
    return [];
  }
}

const dashboardData = { tools: toolDocs(), guidelines: BUTEX_INSTRUCTIONS, skillVersion: SKILL_VERSION };

async function readJson<T>(req: Request): Promise<Partial<T>> {
  try {
    return (await req.json()) as Partial<T>;
  } catch {
    return {};
  }
}

async function route(req: Request, server: Bun.Server<undefined>): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = req.method;
  const ip = clientIp(req, server);

  if (method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  // MCP endpoints
  if (path === "/butex/mcp" || path === "/mcp") return withCors(await handleMcp(req, "butex"));
  if (path === "/analytics/mcp") return withCors(await handleMcp(req, "analytics"));

  // OAuth discovery (RFC 9728 / RFC 8414). Clients probe several spellings, so be generous.
  if (path.startsWith("/.well-known/oauth-protected-resource")) {
    return withCors(protectedResourceMetadata(path.includes("analytics") ? "analytics" : "butex"));
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
    const r = await issueKey({ email: String(email ?? ""), tier: "free", ip, source: "dashboard" });
    return r.ok ? json({ key: r.key, id: r.id, endpoint: `${env.publicUrl}/butex/mcp` }, { status: 201 }) : json({ error: r.error }, { status: r.status });
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

  if (path === "/health") {
    const [c, d] = await Promise.all([cache.status(), dbStatus()]);
    return json({ ok: true, version: VERSION, skill: SKILL_VERSION, butex: breakerStatus("butex.edu.bd"), cache: c, database: d });
  }

  if (path.startsWith("/skill/")) {
    const r = skillRoute(path);
    if (r) return withCors(r);
  }

  if (path === "/" && method === "GET") return dashboardPage(dashboardData);
  if (path === "/robots.txt") return new Response("User-agent: *\nAllow: /\nDisallow: /oauth/\nDisallow: /api/\n");
  if (path === "/llms.txt") {
    return new Response(
      `# NoteBot MCP\n\nMCP server for official BUTEX (Bangladesh University of Textiles) notices.\n\n- MCP endpoint: ${env.publicUrl}/butex/mcp (Streamable HTTP; OAuth or Bearer key)\n- Free key: ${env.publicUrl}/#get-key\n- Agent skill: ${env.publicUrl}/skill/SKILL.md\n\n${BUTEX_INSTRUCTIONS}\n`,
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
console.log(`🟢 NoteBot MCP v${VERSION} on :${server.port} (public ${env.publicUrl})`);
