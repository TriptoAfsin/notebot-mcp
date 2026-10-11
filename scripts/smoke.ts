/**
 * End-to-end smoke test against a running server.
 *   BASE=http://localhost:8787 ADMIN_API_KEY=... bun run smoke
 * Exercises key issuance, every BUTEX tool, the full OAuth + PKCE flow,
 * analytics access control, and the skill endpoints.
 */
import { createHash, randomBytes } from "node:crypto";

const BASE = (process.env.BASE ?? "http://localhost:8787").replace(/\/+$/, "");
const ADMIN = process.env.ADMIN_API_KEY ?? "";
let failures = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const j = (r: Response): Promise<any> => r.json();

function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

let rpcId = 0;
async function rpc(path: string, key: string | null, method: string, params: unknown = {}) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, headers: res.headers, body };
}

const callTool = (key: string, name: string, args: Record<string, unknown> = {}, path = "/butex/mcp") =>
  rpc(path, key, "tools/call", { name, arguments: args });

const toolText = (r: any) => (r.body?.result?.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");

// ── health & pages
const health = await fetch(`${BASE}/health`).then(j);
check("health", health.ok === true, `db=${health.database} redis=${health.cache?.redis}`);
const page = await fetch(BASE + "/");
check("dashboard renders", page.ok && (await page.text()).includes("Get a free key"));

// Resend sink addresses only: nothing reaches a real inbox
const EMAIL = `delivered+smoke${Date.now()}@resend.dev`;

// ── key issuance
const bad = await fetch(`${BASE}/api/keys`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "nope" }) });
check("rejects invalid email", bad.status === 400);
const issued = await fetch(`${BASE}/api/keys`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL }) }).then(j);
const key: string = issued.key;
check("issues key for a new address", issued.status === "created" && /^nbk_f_/.test(key ?? ""), key?.slice(0, 12));
const again = await fetch(`${BASE}/api/keys`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL.toUpperCase() }) });
const againBody = await j(again);
check("same address → key emailed, never shown", !("key" in againBody) && (againBody.status === "emailed" || again.status === 503), againBody.status ?? againBody.error);

// ── MCP auth
const noKey = await rpc("/butex/mcp", null, "tools/list");
check("401 without key", noKey.status === 401 && (noKey.headers.get("www-authenticate") ?? "").includes("resource_metadata"));
const tampered = await rpc("/butex/mcp", key.slice(0, -2) + "xx", "tools/list");
check("401 with tampered key", tampered.status === 401);

const init = await rpc("/butex/mcp", key, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "1" } });
check("initialize", !!init.body?.result?.serverInfo, `${init.body?.result?.serverInfo?.name} instructions=${!!init.body?.result?.instructions}`);
const list = await rpc("/butex/mcp", key, "tools/list");
const names: string[] = list.body?.result?.tools?.map((t: any) => t.name) ?? [];
check("tools/list", names.includes("butex_schedules") && names.includes("search") && names.includes("fetch"), names.join(", "));
check("query-string key works", (await fetch(`${BASE}/butex/mcp?key=${key}`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 99, method: "tools/list" }) })).ok);

// ── tools
const latest = await callTool(key, "butex_latest_notices", { category: "academic", limit: 5 });
const latestText = toolText(latest);
check("butex_latest_notices", !latest.body?.result?.isError && latestText.includes("id "), latestText.split("\n")[2]);
const firstId = /id (\d+)/.exec(latestText)?.[1];

for (const [name, args] of [
  ["butex_search_notices", { query: "convocation" }],
  ["butex_schedules", { kind: "exam", limit: 5 }],
  ["butex_schedules", { kind: "class", query: "BSc" }],
  ["butex_results", { query: "L4-T1" }],
  ["butex_department_notices", { department: "apparel", limit: 3 }],
  ["butex_categories", {}],
  ["butex_status", {}],
] as const) {
  const r = await callTool(key, name, args as Record<string, unknown>);
  const t = toolText(r);
  check(`${name} ${JSON.stringify(args)}`, !r.body?.result?.isError && t.length > 20, t.split("\n").find((l: string) => l.startsWith("- ["))?.slice(0, 90) ?? t.slice(0, 90));
}

if (firstId) {
  const read = await callTool(key, "butex_read_notice", { notice: firstId, max_images: 1 });
  const kinds = (read.body?.result?.content ?? []).map((c: any) => c.type);
  check("butex_read_notice", !read.body?.result?.isError && kinds.includes("text"), `content=${kinds.join(",")}`);
}
const s = await callTool(key, "search", { query: "result" });
const parsed = JSON.parse(toolText(s) || "{}");
check("search (ChatGPT)", Array.isArray(parsed.results) && parsed.results.length > 0, `${parsed.results?.length} results`);
if (parsed.results?.[0]) {
  const f = JSON.parse(toolText(await callTool(key, "fetch", { id: parsed.results[0].id })) || "{}");
  check("fetch (ChatGPT)", !!f.id && !!f.text && !!f.url, f.title?.slice(0, 60));
}
// ── NoteBot library server (same key)
const nbList = await rpc("/notebot/mcp", key, "tools/list");
const nbNames: string[] = nbList.body?.result?.tools?.map((t: any) => t.name) ?? [];
check("notebot tools/list (same key)", nbNames.includes("notebot_study_plan") && nbNames.includes("notebot_ask"), `${nbNames.length} tools`);
for (const [name, args] of [
  ["notebot_search", { query: "chemistry" }],
  ["notebot_browse", { level: 1 }],
  ["notebot_subject", { level: 1, subject: "math1" }],
  ["notebot_lab_reports", { level: 1, subject: "phy_1" }],
  ["notebot_question_banks", { level: 2 }],
  ["notebot_routines", { level: 1 }],
  ["notebot_syllabus", {}],
  ["notebot_results_archive", { query: "2019" }],
  ["notebot_study_plan", { level: 1, subjects: ["Math-I"], days_left: 5 }],
  ["notebot_recommend", {}],
  ["notebot_status", {}],
] as const) {
  const r = await callTool(key, name, args as Record<string, unknown>, "/notebot/mcp");
  const t = toolText(r);
  check(`${name} ${JSON.stringify(args)}`, !r.body?.result?.isError && t.length > 20, t.split("\n").find((l: string) => /https?:\/\//.test(l))?.trim().slice(0, 80) ?? t.slice(0, 80));
}
const prompts = await rpc("/notebot/mcp", key, "prompts/list");
check("notebot prompts", (prompts.body?.result?.prompts?.length ?? 0) >= 2);

const badArgs = await callTool(key, "butex_read_notice", { notice: "999999999" });
check("bad id → graceful isError", badArgs.body?.result?.isError === true || !!badArgs.body?.error);

// ── analytics access control
const freeOnAnalytics = await rpc("/analytics/mcp", key, "tools/list");
check("free key refused on analytics", freeOnAnalytics.status === 403);
if (ADMIN) {
  const a = await rpc("/analytics/mcp", ADMIN, "tools/list");
  check("admin key on analytics", (a.body?.result?.tools?.length ?? 0) > 0, `${a.body?.result?.tools?.length} tools`);
  const st = await callTool(ADMIN, "analytics_status", {}, "/analytics/mcp");
  check("analytics_status", !st.body?.result?.isError, toolText(st).slice(0, 120).replace(/\s+/g, " "));
}

// ── OAuth 2.1 + PKCE (what Claude.ai / ChatGPT do)
const prm = await fetch(`${BASE}/.well-known/oauth-protected-resource/butex/mcp`).then(j);
check("protected resource metadata", prm.resource === `${BASE}/butex/mcp`);
const asm = await fetch(`${BASE}/.well-known/oauth-authorization-server`).then(j);
check("auth server metadata", !!asm.registration_endpoint && asm.code_challenge_methods_supported?.includes("S256"));

const redirect = "https://claude.ai/api/mcp/auth_callback";
const reg = await fetch(asm.registration_endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "Claude", redirect_uris: [redirect] }) }).then(j);
check("dynamic client registration", !!reg.client_id);

const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const params = new URLSearchParams({ response_type: "code", client_id: reg.client_id, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: "S256", state: "xyz", resource: `${BASE}/butex/mcp` });
const consent = await fetch(`${asm.authorization_endpoint}?${params}`);
check("consent page", consent.ok && (await consent.text()).includes("Claude wants to use"));

const evil = new URLSearchParams(params); evil.set("redirect_uri", "https://evil.example/cb");
check("rejects unregistered redirect", (await fetch(`${asm.authorization_endpoint}?${evil}`)).status === 400);

const approve = await fetch(asm.authorization_endpoint, {
  method: "POST",
  redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ ...Object.fromEntries(params), email: `delivered+oauth${Date.now()}@resend.dev`, action: "allow" }),
});
const loc = new URL(approve.headers.get("location") ?? "http://x");
const code = loc.searchParams.get("code");
check("authorize → redirect with code", approve.status === 302 && !!code && loc.searchParams.get("state") === "xyz");

const tok = (verifierToUse: string) =>
  fetch(asm.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code: code!, code_verifier: verifierToUse, client_id: reg.client_id, redirect_uri: redirect }) });
check("token rejects wrong PKCE verifier", (await tok("wrong-verifier-wrong-verifier-wrong")).status === 400);
const tokenRes = await tok(verifier).then(j);
check("token exchange", /^nbk_f_/.test(tokenRes.access_token ?? ""), `refresh=${!!tokenRes.refresh_token}`);
check("code is single-use", (await tok(verifier)).status === 400);
const viaOauth = await rpc("/butex/mcp", tokenRes.access_token, "tools/list");
check("OAuth token works on MCP", viaOauth.status === 200);
const refreshed = await fetch(asm.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokenRes.refresh_token }) }).then(j);
check("refresh grant", refreshed.access_token === tokenRes.access_token);
const nbPrm = await fetch(`${BASE}/.well-known/oauth-protected-resource/notebot/mcp`).then(j);
check("notebot protected resource metadata", nbPrm.resource === `${BASE}/notebot/mcp`);
check("OAuth token works on notebot too", (await rpc("/notebot/mcp", tokenRes.access_token, "tools/list")).status === 200);

// ── skill
const ver = await fetch(`${BASE}/skill/version.json`).then(j);
check("skill version.json", /^\d+\.\d+\.\d+$/.test(ver.version), ver.version);
const zipRes = await fetch(ver.zip.replace(/^https?:\/\/[^/]+/, BASE));
const zipBytes = new Uint8Array(await zipRes.arrayBuffer());
check("skill zip", zipRes.ok && zipBytes[0] === 0x50 && zipBytes[1] === 0x4b, `${zipBytes.length} bytes`);

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
