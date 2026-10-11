import { env } from "../env";
import { cache } from "../lib/cache";
import { safeEqual, seal, sha256b64url, signBlob, unseal, verifyBlob } from "../lib/crypto";
import { issueAdminKey, issueOauthKey, verifyKey } from "../lib/keys";
import { json } from "../lib/util";
import { resourceUrl, type Resource } from "../mcp/handler";
import { authorizePage } from "../web/pages";

/**
 * Minimal OAuth 2.1 authorization server so Claude.ai / ChatGPT custom connectors
 * (which can't send custom headers) can connect with a single click.
 *
 * It is fully stateless: client ids are signed blobs carrying their redirect
 * URIs, auth codes are AES-GCM sealed blobs carrying the issued key + PKCE
 * challenge. The access token *is* a normal NoteBot API key.
 */

const CODE_TTL_MS = 5 * 60_000;
const TOKEN_TTL_SEC = 30 * 24 * 3600;

type Client = { r: string[]; n: string; t: number };
type Code = { k: string; c: string; r: string; i: string; e: number; s: string };

const issuer = () => env.publicUrl;

export function protectedResourceMetadata(resource: Resource): Response {
  return json({
    resource: resourceUrl(resource),
    authorization_servers: [issuer()],
    scopes_supported: [resource],
    bearer_methods_supported: ["header"],
    resource_name: { butex: "BUTEX MCP", notebot: "NoteBot knowledge base", analytics: "NoteBot Analytics (private)" }[resource],
    resource_documentation: env.publicUrl,
  });
}

export function authServerMetadata(): Response {
  return json({
    issuer: issuer(),
    authorization_endpoint: `${issuer()}/oauth/authorize`,
    token_endpoint: `${issuer()}/oauth/token`,
    registration_endpoint: `${issuer()}/oauth/register`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: ["butex", "notebot", "analytics"],
    service_documentation: env.publicUrl,
  });
}

function redirectAllowed(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === "https:") return true;
    // native/CLI clients (Claude Code, Cursor, MCP Inspector) use loopback
    return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    // custom schemes for desktop apps, e.g. cursor://
    return /^[a-z][a-z0-9+.-]{2,}:\/\/[^\s]+$/i.test(uri) && !/^(javascript|data|file|vbscript):/i.test(uri);
  }
}

const oauthError = (error: string, description: string, status = 400) => json({ error, error_description: description }, { status });

export async function register(req: Request): Promise<Response> {
  let body: { redirect_uris?: unknown; client_name?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return oauthError("invalid_client_metadata", "Body must be JSON.");
  }
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (!uris.length || uris.length > 10) return oauthError("invalid_redirect_uri", "Provide 1–10 redirect_uris.");
  const bad = uris.find((u) => !redirectAllowed(u) || u.length > 500);
  if (bad) return oauthError("invalid_redirect_uri", `Redirect URI not allowed: ${bad}`);

  const name = typeof body.client_name === "string" ? body.client_name.slice(0, 80) : "MCP client";
  const client: Client = { r: uris, n: name, t: Math.floor(Date.now() / 1000) };
  const client_id = signBlob(client, "oauth-client");
  return json(
    {
      client_id,
      client_id_issued_at: client.t,
      client_name: name,
      redirect_uris: uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    { status: 201 },
  );
}

type AuthParams = {
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
  resource: string;
  scope: string;
  response_type: string;
};

function readParams(src: URLSearchParams): AuthParams {
  const g = (k: string) => src.get(k) ?? "";
  return {
    client_id: g("client_id"),
    redirect_uri: g("redirect_uri"),
    state: g("state"),
    code_challenge: g("code_challenge"),
    code_challenge_method: g("code_challenge_method") || "S256",
    resource: g("resource"),
    scope: g("scope"),
    response_type: g("response_type"),
  };
}

function resourceFor(p: AuthParams): Resource {
  if (/analytics/i.test(p.resource) || /\banalytics\b/i.test(p.scope)) return "analytics";
  // one free key serves both public servers; this only picks the consent wording
  return /notebot\/mcp/i.test(p.resource) || /\bnotebot\b/i.test(p.scope) ? "notebot" : "butex";
}

/** Validate before rendering anything: a bad client/redirect must never get a redirect back. */
function validate(p: AuthParams): { client: Client } | { error: string } {
  const client = verifyBlob<Client>(p.client_id, "oauth-client");
  if (!client) return { error: "Unknown client. Remove the connector and add it again." };
  if (!client.r.includes(p.redirect_uri)) return { error: "The redirect URI doesn't match what this client registered." };
  if (p.response_type !== "code") return { error: "Only response_type=code is supported." };
  if (!p.code_challenge || p.code_challenge_method !== "S256") return { error: "PKCE (S256) is required." };
  return { client };
}

export async function authorizeGet(req: Request): Promise<Response> {
  const p = readParams(new URL(req.url).searchParams);
  const v = validate(p);
  if ("error" in v) return authorizePage({ params: p, clientName: "", mode: "butex", fatal: v.error }, 400);
  return authorizePage({ params: p, clientName: v.client.n, mode: resourceFor(p) });
}

export async function authorizePost(req: Request, ip: string): Promise<Response> {
  const form = new URLSearchParams(await req.text());
  const p = readParams(form);
  const v = validate(p);
  if ("error" in v) return authorizePage({ params: p, clientName: "", mode: "butex", fatal: v.error }, 400);
  const mode = resourceFor(p);

  const back = (params: Record<string, string>) => {
    const u = new URL(p.redirect_uri);
    for (const [k, val] of Object.entries(params)) u.searchParams.set(k, val);
    if (p.state) u.searchParams.set("state", p.state);
    u.searchParams.set("iss", issuer());
    return new Response(null, { status: 302, headers: { location: u.toString(), "cache-control": "no-store" } });
  };

  if (form.get("action") === "deny") return back({ error: "access_denied" });

  let key: string;
  if (mode === "analytics") {
    const given = form.get("admin_key") ?? "";
    const attempts = await cache.incr(`mcp:adminauth:${ip}`, 900);
    if (attempts > 10) return authorizePage({ params: p, clientName: v.client.n, mode, error: "Too many attempts. Wait 15 minutes." }, 429);
    if (!env.adminKey || !safeEqual(given.trim(), env.adminKey)) {
      return authorizePage({ params: p, clientName: v.client.n, mode, error: "That admin key is not correct." }, 401);
    }
    key = await issueAdminKey(ip, v.client.n);
  } else {
    const email = form.get("email") ?? "";
    const res = await issueOauthKey({ email, ip, label: v.client.n });
    if (!res.ok) return authorizePage({ params: p, clientName: v.client.n, mode, error: res.error, email }, res.status);
    if (res.kind !== "created") throw new Error("unexpected key result");
    key = res.key;
  }

  const code: Code = { k: key, c: p.code_challenge, r: p.redirect_uri, i: p.client_id, e: Date.now() + CODE_TTL_MS, s: mode };
  return back({ code: seal(code) });
}

async function readTokenBody(req: Request): Promise<URLSearchParams> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const obj = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return new URLSearchParams(Object.entries(obj).map(([k, v]): [string, string] => [k, String(v)]));
  }
  return new URLSearchParams(await req.text());
}

function clientIdFrom(req: Request, body: URLSearchParams): string {
  const basic = req.headers.get("authorization");
  if (basic?.toLowerCase().startsWith("basic ")) {
    const decoded = Buffer.from(basic.slice(6), "base64").toString("utf8");
    return decodeURIComponent(decoded.split(":")[0] ?? "");
  }
  return body.get("client_id") ?? "";
}

function tokenResponse(key: string, scope: string): Response {
  return json(
    {
      access_token: key,
      token_type: "Bearer",
      expires_in: TOKEN_TTL_SEC,
      refresh_token: seal({ k: key, rt: 1 }),
      scope,
    },
    { headers: { "cache-control": "no-store", pragma: "no-cache" } },
  );
}

export async function token(req: Request): Promise<Response> {
  const body = await readTokenBody(req);
  const grant = body.get("grant_type");

  if (grant === "authorization_code") {
    const code = unseal<Code>(body.get("code") ?? "");
    if (!code || code.e < Date.now()) return oauthError("invalid_grant", "Authorization code is invalid or expired.");
    const cid = clientIdFrom(req, body);
    if (cid && cid !== code.i) return oauthError("invalid_grant", "Code was issued to a different client.");
    const redirect = body.get("redirect_uri");
    if (redirect && redirect !== code.r) return oauthError("invalid_grant", "redirect_uri mismatch.");
    const verifier = body.get("code_verifier") ?? "";
    if (!verifier || sha256b64url(verifier) !== code.c) return oauthError("invalid_grant", "PKCE verification failed.");

    const usedKey = `mcp:code:${sha256b64url(body.get("code")!)}`;
    if (await cache.get<boolean>(usedKey)) return oauthError("invalid_grant", "Authorization code already used.");
    await cache.set(usedKey, true, 600);
    return tokenResponse(code.k, code.s);
  }

  if (grant === "refresh_token") {
    const rt = unseal<{ k: string; rt: number }>(body.get("refresh_token") ?? "");
    const info = rt ? await verifyKey(rt.k) : null;
    if (!rt || !info) return oauthError("invalid_grant", "Refresh token is invalid or the key was revoked.");
    return tokenResponse(rt.k, info.tier === "admin" ? "analytics" : "butex notebot");
  }

  return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
}
