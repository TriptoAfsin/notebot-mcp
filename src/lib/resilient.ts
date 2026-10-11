import { cache } from "./cache";
import { errMsg, sleep } from "./util";

/**
 * Upstream access that degrades instead of failing:
 *   timeout → retry with backoff → circuit breaker → last good copy from cache.
 */

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

type Breaker = { failures: number; openUntil: number; lastError: string; lastOk: number };
const breakers = new Map<string, Breaker>();

function breaker(name: string): Breaker {
  let b = breakers.get(name);
  if (!b) breakers.set(name, (b = { failures: 0, openUntil: 0, lastError: "", lastOk: 0 }));
  return b;
}

const FAILURES_TO_OPEN = 3;
const OPEN_MS = 60_000;

export function breakerStatus(name: string) {
  const b = breaker(name);
  const open = Date.now() < b.openUntil;
  return {
    state: open ? "open (serving cache)" : b.failures > 0 ? "degraded" : "closed (healthy)",
    consecutiveFailures: b.failures,
    lastError: b.lastError || null,
    lastSuccess: b.lastOk ? new Date(b.lastOk).toISOString() : null,
  };
}

export type FetchOpts = {
  upstream: string;
  init?: RequestInit;
  timeoutMs?: number;
  retries?: number;
};

/** GET/POST JSON with per-attempt timeout, exponential backoff and a per-upstream circuit breaker. */
export async function fetchJson<T>(url: string, opts: FetchOpts): Promise<{ data: T; headers: Headers }> {
  const b = breaker(opts.upstream);
  if (Date.now() < b.openUntil) {
    throw new UpstreamError(`${opts.upstream} is temporarily unavailable (circuit open): ${b.lastError}`);
  }

  const retries = opts.retries ?? 2;
  const timeoutMs = opts.timeoutMs ?? 8000;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...opts.init,
        headers: { "user-agent": "NoteBotMCP/1.0 (+https://ai.butexnotebot.com)", accept: "application/json", ...opts.init?.headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        // 4xx (other than 408/429) is our fault: don't retry, don't trip the breaker.
        if (res.status < 500 && res.status !== 408 && res.status !== 429) {
          throw Object.assign(new UpstreamError(`${opts.upstream} returned HTTP ${res.status}`, res.status), { fatal: true });
        }
        throw new UpstreamError(`${opts.upstream} returned HTTP ${res.status}`, res.status);
      }
      const data = (await res.json()) as T;
      b.failures = 0;
      b.lastOk = Date.now();
      return { data, headers: res.headers };
    } catch (err) {
      lastErr = err;
      if ((err as { fatal?: boolean }).fatal) throw err;
      if (attempt < retries) await sleep(300 * 2 ** attempt + Math.random() * 200);
    }
  }

  b.failures++;
  b.lastError = errMsg(lastErr);
  if (b.failures >= FAILURES_TO_OPEN) b.openUntil = Date.now() + OPEN_MS;
  throw lastErr instanceof UpstreamError ? lastErr : new UpstreamError(`${opts.upstream} unreachable: ${errMsg(lastErr)}`);
}

export type Cached<T> = { data: T; fetchedAt: string; stale: boolean; warning?: string };

/**
 * Serve fresh data when the cache is young, refetch when it isn't, and fall back
 * to the last good copy (kept `staleTtlSec`) when the refetch fails.
 */
export async function cachedFetch<T>(
  key: string,
  freshSec: number,
  loader: () => Promise<T>,
  staleTtlSec = 7 * 24 * 3600,
): Promise<Cached<T>> {
  const hit = await cache.get<{ data: T; at: number }>(key);
  if (hit && Date.now() - hit.at < freshSec * 1000) {
    return { data: hit.data, fetchedAt: new Date(hit.at).toISOString(), stale: false };
  }
  try {
    const data = await loader();
    const at = Date.now();
    await cache.set(key, { data, at }, staleTtlSec);
    return { data, fetchedAt: new Date(at).toISOString(), stale: false };
  } catch (err) {
    if (hit) {
      return {
        data: hit.data,
        fetchedAt: new Date(hit.at).toISOString(),
        stale: true,
        warning: `Live source failed (${errMsg(err)}); showing cached copy from ${new Date(hit.at).toISOString()}.`,
      };
    }
    throw err;
  }
}
