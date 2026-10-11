import { env } from "../env";
import { cache } from "./cache";
import { hmac, randomId, safeEqual, seal, sha256b64url, unseal } from "./crypto";
import { db } from "./db";
import { layout, mailConfigured, sendMail } from "./mail";
import { keyRef, log, maskEmail } from "./log";

/**
 * API keys are self-verifying: `nbk_<tier>_<id>_<sig>` where sig = HMAC(secret, tier+id).
 * A request is authenticated by checking the signature alone, so auth keeps working
 * when Postgres is down. The database adds revocation, ownership and usage on top.
 *
 * Because the signature is deterministic, a key can be rebuilt from its id. That is
 * how a lost key is recovered: it is re-derived and emailed to the address that
 * owns it, never shown to whoever typed the address.
 *
 * One free key works on every public server (/butex/mcp and /notebot/mcp).
 */

export type Tier = "free" | "admin";
export type KeyInfo = { id: string; tier: Tier; viaEnvAdmin?: boolean };

const TIER_CODE: Record<Tier, string> = { free: "f", admin: "a" };
const CODE_TIER: Record<string, Tier> = { f: "free", a: "admin" };
const KEY_RE = /^nbk_([fa])_([A-Za-z0-9]{16})_([A-Za-z0-9_-]{32})$/;

const sign = (code: string, id: string) => hmac(`${code}.${id}`, "apikey").slice(0, 32);

/** Rebuild the full key for a stored id. Only ever emailed to the key's owner. */
export function keyFor(id: string, tier: Tier): string {
  const code = TIER_CODE[tier];
  return `nbk_${code}_${id}_${sign(code, id)}`;
}

export function mintKey(tier: Tier): { key: string; id: string } {
  const id = randomId(12).slice(0, 16).padEnd(16, "x");
  return { key: keyFor(id, tier), id };
}

export function emailIsValid(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email);
}

const normEmail = (e: string) => e.trim().toLowerCase();

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

/** Every address that asks for a key is kept for outreach (with unsubscribe). Best-effort. */
export async function recordContact(email: string, source: string, ip: string) {
  await db(
    (sql) => sql`
      INSERT INTO mcp.contacts (email, sources, last_ip, key_requests)
      VALUES (${email}, ARRAY[${source}]::text[], ${ip}, 1)
      ON CONFLICT (email) DO UPDATE SET
        last_seen = now(),
        last_ip = EXCLUDED.last_ip,
        key_requests = mcp.contacts.key_requests + 1,
        sources = (SELECT array_agg(DISTINCT s) FROM unnest(mcp.contacts.sources || EXCLUDED.sources) s)`,
  );
}

async function insertKey(id: string, email: string, tier: Tier, source: string, ip: string, label?: string) {
  return db(
    (sql) => sql`INSERT INTO mcp.api_keys (id, email, tier, label, source, created_ip)
                 VALUES (${id}, ${email}, ${tier}, ${label ?? null}, ${source}, ${ip})`,
  );
}

const unsubscribeUrl = (email: string) => `${env.publicUrl}/unsubscribe?t=${encodeURIComponent(seal({ e: email, p: "unsub" }))}`;
const ROTATE_TTL_MS = 60 * 60_000;
export const rotateUrl = (email: string) =>
  `${env.publicUrl}/keys/rotate?t=${encodeURIComponent(seal({ e: email, p: "rotate", x: Date.now() + ROTATE_TTL_MS }))}`;

const footer = (email: string) =>
  `Sent to ${email} because this address was entered at <a href="${env.publicUrl}" style="color:#6b7686">ai.butexnotebot.com</a>. NoteBot is a student project, not an official BUTEX service. <a href="${unsubscribeUrl(email)}" style="color:#6b7686">Unsubscribe from updates</a>.`;

export type KeyRequestResult =
  | { ok: true; kind: "created"; key: string; id: string }
  | { ok: true; kind: "emailed"; email: string }
  | { ok: false; error: string; status: number };

/**
 * Dashboard flow. A new address gets a key on screen (plus an email copy).
 * An address that already holds a key gets it emailed instead, so typing
 * someone else's email never reveals their key.
 */
/**
 * Bot signals from the dashboard form: a hidden "website" field people never see,
 * and how long the form was open. A filled honeypot or a sub-second submit gets a
 * normal-looking reply but nothing is created or sent.
 */
function looksLikeBot(opts: { website?: string; elapsed?: number }): string | null {
  if (opts.website && opts.website.trim()) return "honeypot";
  if (typeof opts.elapsed === "number" && opts.elapsed >= 0 && opts.elapsed < 800) return "too-fast";
  return null;
}

/**
 * One budget for every email we send on someone's behalf: per sender IP (hour and day),
 * per recipient address (day) and a global hourly ceiling. Counted before sending.
 */
async function mailBudget(ip: string, email: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const to = sha256b64url(email);
  const [ipHour, ipDay, addrDay, global] = await Promise.all([
    cache.incr(`mcp:mail:ip:h:${ip}`, 3600),
    cache.incr(`mcp:mail:ip:d:${ip}`, 86_400),
    cache.incr(`mcp:mail:to:d:${to}`, 86_400),
    cache.incr("mcp:mail:global:h", 3600),
  ]);
  if (ipHour > env.emailsPerIpHour || ipDay > env.emailsPerIpDay) return { ok: false, reason: "ip" };
  if (addrDay > env.emailsPerAddressDay) return { ok: false, reason: "address" };
  if (global > env.emailsGlobalHour) return { ok: false, reason: "global" };
  return { ok: true };
}

export async function requestKey(opts: { email: string; ip: string; website?: string; elapsed?: number }): Promise<KeyRequestResult> {
  const email = normEmail(opts.email);
  if (!emailIsValid(email)) return { ok: false, status: 400, error: "That doesn't look like a valid email address." };
  const bot = looksLikeBot(opts);
  if (bot) {
    log.warn("key request dropped as bot", { event: "abuse", reason: bot, ip: opts.ip, email: maskEmail(email) });
    return { ok: true, kind: "emailed", email };
  }

  const hourly = await cache.incr(`mcp:issue:ip:${opts.ip}`, 3600);
  if (hourly > env.keyIssuesPerIpHour) {
    log.warn("key request throttled", { event: "key", action: "throttled", ip: opts.ip });
    return { ok: false, status: 429, error: "Too many requests from this network. Try again in an hour." };
  }
  await recordContact(email, "dashboard", opts.ip);

  const existing = (await db(
    (sql) => sql`SELECT id, tier FROM mcp.api_keys
                 WHERE lower(email) = ${email} AND source = 'dashboard' AND revoked_at IS NULL
                 ORDER BY created_at`,
  )) as { id: string; tier: Tier }[] | null;

  if (existing?.length) {
    const sent = await cache.incr(`mcp:recovery:${sha256b64url(email)}`, 3600);
    if (sent > env.recoveryEmailsPerHour) {
      log.warn("key recovery throttled", { event: "key", action: "recovery-throttled", email: maskEmail(email) });
      return { ok: false, status: 429, error: "We've already emailed this address a few times this hour. Check your inbox and spam folder." };
    }
    if (!mailConfigured()) return { ok: false, status: 503, error: "This email already has a key, but email delivery isn't set up yet, so it can't be sent. Try again later." };
    const budget = await mailBudget(opts.ip, email);
    if (!budget.ok) {
      log.warn("recovery email refused by mail budget", { event: "abuse", reason: budget.reason, ip: opts.ip, email: maskEmail(email) });
      return { ok: false, status: 429, error: "Too many emails sent from here today. Check your inbox and spam folder, or try again tomorrow." };
    }
    const msg = layout({
      title: "Your NoteBot MCP key",
      paragraphs: [
        "Someone (hopefully you) asked for a NoteBot MCP key with this address. It already has one, so here it is again. It works on both servers: the BUTEX MCP and the NoteBot knowledge base.",
        `Step-by-step setup for Claude, ChatGPT, Gemini, Antigravity, Claude Code and Cursor: <a href="${env.publicUrl}/connect">${env.publicUrl}/connect</a>`,
      ],
      keys: existing.map((k) => keyFor(k.id, k.tier)),
      action: { label: "Replace with a fresh key", url: rotateUrl(email) },
      footer: `If you didn't ask for this, or think someone else has your key, use the button to revoke it and get a new one (link valid for 1 hour). ${footer(email)}`,
    });
    const ok = await sendMail({ to: email, subject: "Your NoteBot MCP key", ...msg, tags: ["key-recovery"] });
    if (!ok) {
      log.error("key recovery email failed", { event: "key", action: "recovery-failed", email: maskEmail(email) });
      return { ok: false, status: 503, error: "This email already has a key, but sending it failed. Try again in a few minutes." };
    }
    log.info("key emailed to existing owner", { event: "key", action: "recovered", email: maskEmail(email), keys: existing.length });
    await db((sql) => sql`UPDATE mcp.contacts SET recovery_emails = recovery_emails + 1 WHERE email = ${email}`);
    return { ok: true, kind: "emailed", email };
  }

  // existing === null means the DB is unreachable: issue a key anyway (keys don't need the DB)
  const { key, id } = mintKey("free");
  await insertKey(id, email, "free", "dashboard", opts.ip);
  const budget = mailConfigured() ? await mailBudget(opts.ip, email) : { ok: false as const, reason: "no-mail" };
  if (!budget.ok && budget.reason !== "no-mail") log.warn("welcome email skipped by mail budget", { event: "abuse", reason: budget.reason, ip: opts.ip, email: maskEmail(email) });
  if (budget.ok) {
    const msg = layout({
      title: "Welcome to NoteBot MCP",
      paragraphs: [
        "Here's a copy of the key you just created. It works on both servers: <b>BUTEX MCP</b> (/butex/mcp) and the <b>NoteBot knowledge base</b> (/notebot/mcp).",
        `Step-by-step setup for Claude, ChatGPT, Gemini, Antigravity, Claude Code and Cursor: <a href="${env.publicUrl}/connect">${env.publicUrl}/connect</a>`,
      ],
      keys: [key],
      action: { label: "Didn't request this? Replace the key", url: rotateUrl(email) },
      footer: footer(email),
    });
    void sendMail({ to: email, subject: "Your NoteBot MCP key", ...msg, tags: ["key-created"] });
  }
  log.info("key created", { event: "key", action: "created", source: "dashboard", keyId: keyRef(id), email: maskEmail(email), dbDown: existing === null });
  return { ok: true, kind: "created", key, id };
}

/**
 * OAuth (Claude.ai / ChatGPT connectors): every connection gets its own key, so
 * disconnecting one app never breaks another. Oldest OAuth keys beyond the cap
 * are revoked automatically so reconnecting always works.
 */
export async function issueOauthKey(opts: { email: string; ip: string; label: string }): Promise<KeyRequestResult> {
  const email = normEmail(opts.email);
  if (!emailIsValid(email)) return { ok: false, status: 400, error: "That doesn't look like a valid email address." };
  const hourly = await cache.incr(`mcp:issue:ip:${opts.ip}`, 3600);
  if (hourly > env.keyIssuesPerIpHour * 2) return { ok: false, status: 429, error: "Too many requests from this network. Try again in an hour." };

  await recordContact(email, `oauth:${opts.label}`.slice(0, 60), opts.ip);
  const { key, id } = mintKey("free");
  await insertKey(id, email, "free", "oauth", opts.ip, opts.label);
  await db(
    (sql) => sql`UPDATE mcp.api_keys SET revoked_at = now()
                 WHERE id IN (
                   SELECT id FROM mcp.api_keys
                   WHERE lower(email) = ${email} AND source = 'oauth' AND revoked_at IS NULL
                   ORDER BY created_at DESC OFFSET ${env.keysPerEmail})`,
  );
  log.info("key created", { event: "key", action: "created", source: "oauth", client: opts.label, keyId: keyRef(id), email: maskEmail(email) });
  return { ok: true, kind: "created", key, id };
}

/** Admin-tier key for the analytics server's OAuth flow (after the admin key was checked). */
export async function issueAdminKey(ip: string, label: string): Promise<string> {
  const { key, id } = mintKey("admin");
  await insertKey(id, "admin", "admin", "oauth", ip, label);
  log.info("admin key issued", { event: "key", action: "admin-issued", client: label, keyId: keyRef(id), ip });
  return key;
}

type RotateToken = { e: string; p: string; x: number };

export function readRotateToken(t: string): string | null {
  const tok = unseal<RotateToken>(t);
  return tok && tok.p === "rotate" && tok.x > Date.now() ? tok.e : null;
}

/** Revoke every dashboard key for the address and mint one fresh one. Link is single-use. */
export async function rotateKeys(t: string, ip: string): Promise<{ ok: true; key: string; email: string } | { ok: false; error: string }> {
  const email = readRotateToken(t);
  if (!email) return { ok: false, error: "This link has expired or isn't valid. Request your key again from the dashboard." };
  const used = `mcp:rotate:used:${sha256b64url(t)}`;
  if (await cache.get<boolean>(used)) return { ok: false, error: "This link was already used. Request your key again to get a new link." };

  const revoked = (await db(
    (sql) => sql`UPDATE mcp.api_keys SET revoked_at = now()
                 WHERE lower(email) = ${email} AND source = 'dashboard' AND revoked_at IS NULL RETURNING id`,
  )) as { id: string }[] | null;
  if (revoked === null) return { ok: false, error: "The key database is unreachable right now. Try the link again in a few minutes." };
  for (const r of revoked) await cache.set(`mcp:revoked:${r.id}`, true, 3600);

  const { key, id } = mintKey("free");
  await insertKey(id, email, "free", "dashboard", ip, "rotated");
  await cache.set(used, true, 2 * 3600);
  log.info("keys rotated", { event: "key", action: "rotated", email: maskEmail(email), revoked: revoked.length, keyId: keyRef(id) });
  return { ok: true, key, email };
}

export function readUnsubscribeToken(t: string): string | null {
  const tok = unseal<{ e: string; p: string }>(t);
  return tok?.p === "unsub" ? tok.e : null;
}

export async function unsubscribe(email: string): Promise<boolean> {
  const r = await db((sql) => sql`UPDATE mcp.contacts SET unsubscribed_at = now() WHERE email = ${email} RETURNING email`);
  return !!r && (r as unknown[]).length > 0;
}

/** Revoking requires the key itself, so a stranger who knows your email can't kill your keys. */
export async function revokeKey(raw: string): Promise<boolean> {
  const info = await verifyKey(raw);
  if (!info || info.viaEnvAdmin) return false;
  const res = await db((sql) => sql`UPDATE mcp.api_keys SET revoked_at = now() WHERE id = ${info.id} AND revoked_at IS NULL RETURNING id`);
  if (!res || !(res as unknown[]).length) return false;
  await cache.set(`mcp:revoked:${info.id}`, true, 3600);
  log.info("key revoked", { event: "key", action: "revoked", keyId: keyRef(info.id) });
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
