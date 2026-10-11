import { SQL } from "bun";
import { env } from "../env";
import { errMsg, withTimeout } from "./util";

/**
 * Postgres is only used for key bookkeeping (who holds which key, revocations,
 * usage). Key *validation* is cryptographic and never waits on it, so every
 * helper here is best-effort and returns null when the database is away.
 */

let sql: SQL | null = null;
let ready: Promise<boolean> | null = null;
let lastError = "";

const MIGRATION = `
CREATE SCHEMA IF NOT EXISTS mcp;
CREATE TABLE IF NOT EXISTS mcp.api_keys (
  id            text PRIMARY KEY,
  email         text NOT NULL,
  tier          text NOT NULL DEFAULT 'free',
  label         text,
  source        text NOT NULL DEFAULT 'dashboard',
  created_ip    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  request_count bigint NOT NULL DEFAULT 0,
  revoked_at    timestamptz
);
CREATE INDEX IF NOT EXISTS api_keys_email_idx ON mcp.api_keys (lower(email));

-- Everyone who asked for a key, for outreach. Lower-cased; unsubscribe is honoured.
CREATE TABLE IF NOT EXISTS mcp.contacts (
  email           text PRIMARY KEY,
  first_seen      timestamptz NOT NULL DEFAULT now(),
  last_seen       timestamptz NOT NULL DEFAULT now(),
  sources         text[] NOT NULL DEFAULT '{}',
  key_requests    integer NOT NULL DEFAULT 0,
  recovery_emails integer NOT NULL DEFAULT 0,
  last_ip         text,
  unsubscribed_at timestamptz
);
INSERT INTO mcp.contacts (email, first_seen, last_seen, sources, key_requests)
  SELECT lower(email), min(created_at), max(created_at), array_agg(DISTINCT source), count(*)
  FROM mcp.api_keys WHERE email <> 'admin' GROUP BY lower(email)
  ON CONFLICT (email) DO NOTHING;
`;

function init(): Promise<boolean> {
  if (!env.databaseUrl) return Promise.resolve(false);
  if (!ready) {
    ready = (async () => {
      try {
        sql = new SQL(env.databaseUrl, { max: 5, idleTimeout: 30, connectionTimeout: 5 });
        await withTimeout(sql.unsafe(MIGRATION), 10_000, "db migrate");
        return true;
      } catch (err) {
        lastError = errMsg(err);
        console.error("db init failed:", lastError);
        sql = null;
        // retry on the next call after a pause instead of caching the failure forever
        setTimeout(() => (ready = null), 30_000);
        return false;
      }
    })();
  }
  return ready;
}

/** Run `fn` against the pool, or return null if Postgres is unavailable. */
export async function db<T>(fn: (sql: SQL) => Promise<T>, timeoutMs = 3000): Promise<T | null> {
  if (!(await init()) || !sql) return null;
  try {
    return await withTimeout(fn(sql), timeoutMs, "db");
  } catch (err) {
    lastError = errMsg(err);
    console.error("db query failed:", lastError);
    return null;
  }
}

export async function dbStatus() {
  if (!env.databaseUrl) return "not configured";
  const ok = await db((s) => s`SELECT 1 AS ok`);
  return ok ? "ok" : `unavailable${lastError ? ` (${lastError})` : ""}`;
}

export function warmDb() {
  void init();
}
