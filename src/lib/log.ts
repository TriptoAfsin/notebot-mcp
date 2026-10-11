import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Structured logging. One JSON object per line in production, which Railway
 * indexes (filter with `@level:error`, `@event:tool`, `@reqId:…`). Readable
 * one-liners locally. Never pass raw keys, tokens or full emails: use
 * `maskEmail` / `keyRef`, and the redaction below catches common slips.
 */

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const e = process.env;
const isProd = e.NODE_ENV === "production" || !!e.RAILWAY_ENVIRONMENT;
const minLevel: Level = (["debug", "info", "warn", "error"] as const).find((l) => l === e.LOG_LEVEL?.toLowerCase()) ?? "info";
const pretty = (e.LOG_FORMAT ?? (isProd ? "json" : "pretty")) === "pretty";

/** Per-request context: every log line inside a request carries its id, and MCP code adds fields for the access log. */
export type ReqCtx = { reqId: string; fields: Record<string, unknown> };
export const reqStore = new AsyncLocalStorage<ReqCtx>();

/** Adds fields to the current request's access-log line. */
export function annotate(fields: Record<string, unknown>) {
  const c = reqStore.getStore();
  if (c) Object.assign(c.fields, fields);
}

const SECRET_KEYS = /^(authorization|cookie|password|secret|token|access_token|refresh_token|code|key|api_key|x-api-key|x-admin-key)$/i;
const KEY_LIKE = /\bnbk_[A-Za-z0-9_-]{8,}/g;

function clean(v: unknown, depth = 0): unknown {
  if (v instanceof Error) return { message: redact(v.message), name: v.name, stack: v.stack?.split("\n").slice(0, 6).join("\n") };
  if (typeof v === "string") return redact(v.length > 500 ? `${v.slice(0, 500)}…` : v);
  if (v === null || typeof v !== "object" || depth > 3) return v;
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => clean(x, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) out[k] = SECRET_KEYS.test(k) ? "[redacted]" : clean(val, depth + 1);
  return out;
}

const EMAIL = /([A-Za-z0-9._%+-]{1,2})[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
// keys keep a short prefix for correlation; emails keep two letters and the domain
const redact = (s: string) => s.replace(KEY_LIKE, (m) => `${m.slice(0, 9)}…`).replace(EMAIL, "$1***@$2");

function write(level: Level, message: string, fields: Record<string, unknown> = {}) {
  if (ORDER[level] < ORDER[minLevel]) return;
  const reqId = reqStore.getStore()?.reqId;
  const data = clean({ ...(reqId ? { reqId } : {}), ...fields }) as Record<string, unknown>;
  const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
  if (pretty) {
    const t = new Date().toISOString().slice(11, 23);
    const kv = Object.entries(data)
      .filter(([k]) => k !== "err")
      .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join(" ");
    const err = data.err as { stack?: string; message?: string } | undefined;
    stream.write(`${t} ${level.toUpperCase().padEnd(5)} ${message}${kv ? `  ${kv}` : ""}${err ? `\n  ${err.stack ?? err.message}` : ""}\n`);
  } else {
    stream.write(`${JSON.stringify({ time: new Date().toISOString(), level, message, ...data })}\n`);
  }
}

export const log = {
  debug: (m: string, f?: Record<string, unknown>) => write("debug", m, f),
  info: (m: string, f?: Record<string, unknown>) => write("info", m, f),
  warn: (m: string, f?: Record<string, unknown>) => write("warn", m, f),
  error: (m: string, f?: Record<string, unknown>) => write("error", m, f),
};

/** "afshin@gmail.com" → "af***@gmail.com": enough to spot repeats, not enough to read. */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "";
  const [user = "", domain = ""] = email.split("@");
  return `${user.slice(0, 2)}***@${domain}`;
}

/** Short, non-secret reference to a key id for correlating log lines. */
export const keyRef = (id: string | null | undefined) => (id ? id.slice(0, 8) : undefined);

export const newReqId = () => crypto.randomUUID().slice(0, 8);
