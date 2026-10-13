import { env } from "../env";
import { db } from "../lib/db";
import { errMsg } from "../lib/util";
import { log } from "../lib/log";

/**
 * Counts public MCP tool calls as platform "ai" in NoteBot analytics, next to
 * "bot" and "app". Calls are buffered and drained in the background, so a slow
 * or down analytics store never touches request latency, and unsent counts are
 * retried on the next flush.
 *
 * analytics-go keeps its counters in `analytics.bot_daily_report` in the same
 * Postgres, so the whole buffer goes in with one statement. The HTTP API
 * (one POST per call, needs ANALYTICS_ADMIN_KEY) is only the fallback.
 */

const FLUSH_MS = 15_000;
const MAX_HTTP_PER_FLUSH = 200;
const MAX_BUFFER = 10_000;
let pending = 0;
let flushing = false;

const enabled = () => env.reportAiUsage && (!!env.databaseUrl || !!env.analyticsAdminKey);

export function reportAiUsage(n = 1) {
  if (!enabled()) return;
  pending = Math.min(MAX_BUFFER, pending + n);
}

/** Adds n to today's "ai" row (same date rule as analytics-go: the server's current date). */
async function flushToDb(n: number): Promise<boolean> {
  const done = await db(
    (sql) => sql`
      WITH bumped AS (
        UPDATE analytics.bot_daily_report SET count = count + ${n}
        WHERE date = CURRENT_DATE AND platform = 'ai'
        RETURNING 1
      )
      INSERT INTO analytics.bot_daily_report (date, count, platform)
      SELECT CURRENT_DATE, ${n}, 'ai' WHERE NOT EXISTS (SELECT 1 FROM bumped)`,
    5000,
  );
  return done !== null;
}

async function flushToHttp() {
  if (!env.analyticsAdminKey) return;
  const url = `${env.analyticsUrl}/daily_report?adminKey=${encodeURIComponent(env.analyticsAdminKey)}`;
  let sent = 0;
  while (pending > 0 && sent < MAX_HTTP_PER_FLUSH) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "NoteBotMCP/1.0" },
      body: JSON.stringify({ platform: "ai" }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`analytics answered ${res.status}`);
    pending--;
    sent++;
  }
}

async function flush() {
  if (flushing || pending === 0) return;
  flushing = true;
  const batch = pending;
  try {
    if (env.databaseUrl && (await flushToDb(batch))) {
      pending -= batch;
      return;
    }
    await flushToHttp();
  } catch (err) {
    log.warn("ai usage report deferred", { event: "analytics", pending, err: errMsg(err) });
  } finally {
    flushing = false;
  }
}

export function startUsageReporter() {
  setInterval(() => void flush(), FLUSH_MS).unref?.();
}

export const pendingAiUsage = () => pending;
