import { env } from "../env";
import { cache } from "./cache";
import { hmac, randomId, safeEqual } from "./crypto";
import { db } from "./db";

/**
 * API keys are self-verifying: `nbk_<tier>_<id>_<sig>` where sig = HMAC(secret, tier+id).
 * A request is authenticated by checking the signature alone, so auth keeps working
 * when Postgres is down. The database adds revocation, ownership and usage on top.
 */

export type Tier = "free" | "admin";
export type KeyInfo = { id: string; tier: Tier; viaEnvAdmin?: boolean };

const TIER_CODE: Record<Tier, string> = { free: "f", admin: "a" };
const CODE_TIER: Record<string, Tier> = { f: "free", a: "admin" };
const KEY_RE = /^nbk_([fa])_([A-Za-z0-9]{16})_([A-Za-z0-9_-]{32})$/;

const sign = (code: string, id: string) => hmac(`${code}.${id}`, "apikey").slice(0, 32);

export function mintKey(tier: Tier): { key: string; id: string } {
  const id = randomId(12).slice(0, 16).padEnd(16, "x");
  const code = TIER_CODE[tier];
  return { key: `nbk_${code}_${id}_${sign(code, id)}`, id };
}

export function emailIsValid(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email);
}

/** Pure signature check plus a cached revocation lookup. Never throws. */
export async function verifyKey(raw: string | null | undefined): Promise<KeyInfo | null> {
  if (!raw) return null;
  const token = raw.trim();

  if (env.adminKey && safeEqual(token, env.adminKey)) return { id: "env-admin", tier: "admin", viaEnvAdmin: true };

  const m = KEY_RE.exec(token);
  if (!m) return null;
  const [, code, id, sig] = m as unknown as [string, string, string, string];
  if (!safeEqual(sig, sign(code, id))) return null;

  if (await isRevoked(id)) return null;
  return { id, tier: CODE_TIER[code]! };
}

async function isRevoked(id: string): Promise<boolean> {
  const cacheKey = `mcp:revoked:${id}`;
  const cached = await cache.get<boolean>(cacheKey);
  if (cached !== null) return cached;
  const row = await db((sql) => sql`SELECT revoked_at FROM mcp.api_keys WHERE id = ${id}`);
  // DB unreachable → fail open for correctly signed keys (that's the point of signing them)
  if (row === null) return false;
  const revoked = !!(row as { revoked_at: Date | null }[])[0]?.revoked_at;
  await cache.set(cacheKey, revoked, 300);
  return revoked;
}

export type IssueResult = { ok: true; key: string; id: string } | { ok: false; error: string; status: number };

export async function issueKey(opts: { email: string; tier: Tier; ip: string; source: string; label?: string }): Promise<IssueResult> {
  const email = opts.email.trim().toLowerCase();
  if (!emailIsValid(email)) return { ok: false, status: 400, error: "That doesn't look like a valid email address." };

  if (opts.tier === "free") {
    const hourly = await cache.incr(`mcp:issue:ip:${opts.ip}`, 3600);
    if (hourly > env.keyIssuesPerIpHour) {
      return { ok: false, status: 429, error: "Too many keys requested from this network. Try again in an hour." };
    }
    const active = await db(
      (sql) => sql`SELECT count(*)::int AS n FROM mcp.api_keys WHERE lower(email) = ${email} AND revoked_at IS NULL`,
    );
    const n = (active as { n: number }[] | null)?.[0]?.n ?? 0;
    if (n >= env.keysPerEmail) {
      return { ok: false, status: 429, error: `This email already has ${n} active keys. Revoke one from the dashboard first.` };
    }
  }

  const { key, id } = mintKey(opts.tier);
  await db(
    (sql) => sql`INSERT INTO mcp.api_keys (id, email, tier, label, source, created_ip)
                 VALUES (${id}, ${email}, ${opts.tier}, ${opts.label ?? null}, ${opts.source}, ${opts.ip})`,
  );
  return { ok: true, key, id };
}

/** Revoking requires the key itself, so a stranger who knows your email can't kill your keys. */
export async function revokeKey(raw: string): Promise<boolean> {
  const info = await verifyKey(raw);
  if (!info || info.viaEnvAdmin) return false;
  const res = await db((sql) => sql`UPDATE mcp.api_keys SET revoked_at = now() WHERE id = ${info.id} AND revoked_at IS NULL RETURNING id`);
  if (!res || !(res as unknown[]).length) return false;
  await cache.set(`mcp:revoked:${info.id}`, true, 3600);
  return true;
}

export async function keyUsage(raw: string) {
  const info = await verifyKey(raw);
  if (!info) return null;
  if (info.viaEnvAdmin) return { id: info.id, tier: info.tier, email: null, createdAt: null, lastUsedAt: null, requests: null };
  const rows = await db(
    (sql) => sql`SELECT email, created_at, last_used_at, request_count FROM mcp.api_keys WHERE id = ${info.id}`,
  );
  const r = (rows as { email: string; created_at: Date; last_used_at: Date | null; request_count: string }[] | null)?.[0];
  return {
    id: info.id,
    tier: info.tier,
    email: r?.email ?? null,
    createdAt: r?.created_at ?? null,
    lastUsedAt: r?.last_used_at ?? null,
    requests: r ? Number(r.request_count) : null,
  };
}

/** Fire-and-forget usage bump; never on the request's critical path. */
export function touchKey(id: string) {
  if (id === "env-admin") return;
  void db((sql) => sql`UPDATE mcp.api_keys SET last_used_at = now(), request_count = request_count + 1 WHERE id = ${id}`);
}

export async function rateLimit(info: KeyInfo): Promise<{ ok: true } | { ok: false; retryAfter: number; message: string }> {
  if (info.tier === "admin") return { ok: true };
  const minute = Math.floor(Date.now() / 60_000);
  const day = new Date().toISOString().slice(0, 10);
  const [m, d] = await Promise.all([
    cache.incr(`mcp:rl:m:${info.id}:${minute}`, 70),
    cache.incr(`mcp:rl:d:${info.id}:${day}`, 90_000),
  ]);
  if (m > env.freePerMinute) return { ok: false, retryAfter: 60 - (Math.floor(Date.now() / 1000) % 60), message: `Rate limit: ${env.freePerMinute} requests/minute.` };
  if (d > env.freePerDay) return { ok: false, retryAfter: 3600, message: `Daily limit of ${env.freePerDay} requests reached.` };
  return { ok: true };
}
