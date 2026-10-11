import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerAnalyticsTools } from "../analytics/tools";
import { registerButexTools } from "../butex/tools";
import { env } from "../env";
import { rateLimit, touchKey, verifyKey, type KeyInfo } from "../lib/keys";
import { errMsg, json } from "../lib/util";
import { VERSION } from "../version";

export type Resource = "butex" | "analytics";

export const BUTEX_INSTRUCTIONS = `You are connected to the official notice board of BUTEX (Bangladesh University of Textiles, Tejgaon, Dhaka), served by BUTEX NoteBot.

How to use these tools well:
- Start with the narrowest tool: butex_schedules for class routines / exam routines / class start or completion dates; butex_results for published results; butex_department_notices for one department; butex_latest_notices for "what's new"; butex_search_notices for anything else.
- Listings only contain titles. Most notice bodies are scanned images or PDFs, so when the user needs specifics (dates, times, rooms, fees, deadlines, eligibility) call butex_read_notice with the id and read the attached image/PDF text before answering.
- Students write levels and terms many ways ("L2T1", "Level-2 Term-1", "2-1"). Pass them as tokens like "L-2 T-1"; matching ignores spaces and hyphens. Departments: yarn, fabric, wet_process, apparel, fashion_design, management, machinery, industrial_production, dyes_chemical, environmental.
- Every listing states today's date in Asia/Dhaka. Compare notice dates to it and say plainly when the newest match is old ("the latest L-3 T-2 routine I found is from March 2025").
- Always give the official notice link so the student can verify. Quote dates exactly as printed; never guess a date you could not read.
- If a result says it is from cache (⚠️), tell the user the official site was unreachable and the data may be slightly behind.
- If a tool errors, retry once with simpler arguments, then fall back to another tool (search → latest → categories). butex_status explains outages.
- This is public information from butex.edu.bd. NoteBot is a student project, not an official BUTEX service.`;

export const ANALYTICS_INSTRUCTIONS = `You are connected to the private analytics of BUTEX NoteBot (Messenger bot + app). Only the owner has access.
- Start with analytics_overview, then drill down (daily usage, subject popularity, missed keywords, leaderboards).
- analytics_users, analytics_find_users and analytics_error_logs return personal data. Summarise counts and trends; show individual emails only when explicitly asked.
- Missed keywords are the best signal for content gaps — group them by subject when reporting.
- Results flagged ⚠️ cached mean the analytics service was unreachable.`;

function buildServer(resource: Resource): McpServer {
  const server = new McpServer(
    {
      name: resource === "butex" ? "butex-notebot" : "notebot-analytics",
      title: resource === "butex" ? "BUTEX NoteBot — official notices" : "NoteBot Analytics",
      version: VERSION,
      websiteUrl: env.publicUrl,
      icons: [{ src: `${env.publicUrl}/icon.png`, mimeType: "image/png" }],
    },
    { instructions: resource === "butex" ? BUTEX_INSTRUCTIONS : ANALYTICS_INSTRUCTIONS },
  );
  if (resource === "butex") registerButexTools(server);
  else registerAnalyticsTools(server);
  return server;
}

export function extractKey(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const header = req.headers.get("x-api-key");
  if (header) return header.trim();
  const q = new URL(req.url).searchParams;
  return q.get("key") ?? q.get("api_key");
}

export const resourceUrl = (r: Resource) => `${env.publicUrl}/${r}/mcp`;
export const resourceMetadataUrl = (r: Resource) => `${env.publicUrl}/.well-known/oauth-protected-resource/${r}/mcp`;

function unauthorized(resource: Resource, message: string, status = 401): Response {
  return json(
    { jsonrpc: "2.0", error: { code: -32001, message }, id: null },
    {
      status,
      headers: {
        "www-authenticate": `Bearer resource_metadata="${resourceMetadataUrl(resource)}"${status === 403 ? ', error="insufficient_scope"' : ""}`,
      },
    },
  );
}

export async function handleMcp(req: Request, resource: Resource): Promise<Response> {
  if (req.method === "GET" && !req.headers.get("accept")?.includes("text/event-stream")) {
    return Response.redirect(`${env.publicUrl}/#connect`, 302);
  }
  if (req.method === "GET" || req.method === "DELETE") {
    // stateless server: no standalone SSE stream and no sessions to delete
    return new Response(null, { status: 405, headers: { allow: "POST" } });
  }

  const info: KeyInfo | null = await verifyKey(extractKey(req));
  if (!info) {
    return unauthorized(
      resource,
      resource === "butex"
        ? `Missing or invalid API key. Get a free key at ${env.publicUrl} (just an email), or connect through OAuth.`
        : "This endpoint is private.",
    );
  }
  if (resource === "analytics" && info.tier !== "admin") return unauthorized(resource, "Admin access required.", 403);

  const limited = await rateLimit(info);
  if (!limited.ok) {
    return json(
      { jsonrpc: "2.0", error: { code: -32029, message: limited.message }, id: null },
      { status: 429, headers: { "retry-after": String(limited.retryAfter) } },
    );
  }
  touchKey(info.id);

  const server = buildServer(resource);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    const res = await transport.handleRequest(req, { authInfo: { token: info.id, clientId: info.id, scopes: [info.tier] } });
    return res;
  } catch (err) {
    console.error("mcp request failed:", err);
    return json({ jsonrpc: "2.0", error: { code: -32603, message: `Internal error: ${errMsg(err)}` }, id: null }, { status: 500 });
  } finally {
    // response is fully buffered (enableJsonResponse), so tearing down here is safe
    void server.close().catch(() => {});
  }
}
