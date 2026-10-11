import { env } from "../env";
import { errMsg } from "../lib/util";
import { log } from "../lib/log";

/**
 * Counts public MCP tool calls as platform "ai" in NoteBot analytics, next to
 * "bot" and "app". analytics-go increments by one per POST, so calls are
 * buffered and drained in the background: a slow or down analytics API never
 * touches request latency, and unsent counts are retried on the next flush.
 */

const FLUSH_MS = 15_000;
const MAX_PER_FLUSH = 200;
const MAX_BUFFER = 10_000;
let pending = 0;
let flushing = false;

export function reportAiUsage(n = 1) {
  if (!env.reportAiUsage || !env.analyticsAdminKey) return;
  pending = Math.min(MAX_BUFFER, pending + n);
}

async function flush() {
  if (flushing || pending === 0) return;
  flushing = true;
  const url = `${env.analyticsUrl}/daily_report?adminKey=${encodeURIComponent(env.analyticsAdminKey)}`;
  try {
    let sent = 0;
    while (pending > 0 && sent < MAX_PER_FLUSH) {
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
  } catch (err) {
    log.warn("ai usage report deferred", { event: "analytics", pending, err });
  } finally {
    flushing = false;
  }
}

export function startUsageReporter() {
  setInterval(() => void flush(), FLUSH_MS).unref?.();
}

export const pendingAiUsage = () => pending;
