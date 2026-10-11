import { RedisClient } from "bun";
import { env } from "../env";
import { errMsg, withTimeout } from "./util";

/**
 * Two-tier key/value store: Redis when reachable, an in-process LRU always.
 *
 * Every Redis call is time-boxed and its failure swallowed, so a Redis outage
 * only costs cross-instance sharing — reads fall through to memory and writes
 * still land in memory.
 */

const MEMORY_MAX = 2000;
const memory = new Map<string, { value: string; expiresAt: number }>();

function memGet(key: string): string | null {
  const hit = memory.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    memory.delete(key);
    return null;
  }
  // refresh LRU position
  memory.delete(key);
  memory.set(key, hit);
  return hit.value;
}

function memSet(key: string, value: string, ttlSec: number) {
  memory.delete(key);
  memory.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
  while (memory.size > MEMORY_MAX) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    memory.delete(oldest);
  }
}

let redis: RedisClient | null = null;
let redisDownUntil = 0;
let lastRedisError = "";

function client(): RedisClient | null {
  if (!env.redisUrl || Date.now() < redisDownUntil) return null;
  if (!redis) {
    try {
      redis = new RedisClient(env.redisUrl, { connectionTimeout: 3000, autoReconnect: true, enableOfflineQueue: false });
    } catch (err) {
      markDown(err);
      return null;
    }
  }
  return redis;
}

function markDown(err: unknown) {
  lastRedisError = errMsg(err);
  // back off for 30s so a dead Redis doesn't add latency to every call
  redisDownUntil = Date.now() + 30_000;
}

async function redisCall<T>(fn: (r: RedisClient) => Promise<T>): Promise<T | null> {
  const r = client();
  if (!r) return null;
  try {
    return await withTimeout(fn(r), 800, "redis");
  } catch (err) {
    markDown(err);
    return null;
  }
}

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const raw = (await redisCall((r) => r.get(key))) ?? memGet(key);
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  async set(key: string, value: unknown, ttlSec: number): Promise<void> {
    const raw = JSON.stringify(value);
    memSet(key, raw, ttlSec);
    await redisCall((r) => r.send("SET", [key, raw, "EX", String(ttlSec)]));
  },

  /** Atomic counter with a TTL set on first increment. Memory fallback is per-instance. */
  async incr(key: string, ttlSec: number): Promise<number> {
    const n = await redisCall(async (r) => {
      const v = await r.incr(key);
      if (v === 1) await r.expire(key, ttlSec);
      return v;
    });
    if (n != null) return n;
    const cur = Number(memGet(key) ?? 0) + 1;
    const existing = memory.get(key);
    memSet(key, String(cur), existing ? Math.max(1, Math.ceil((existing.expiresAt - Date.now()) / 1000)) : ttlSec);
    return cur;
  },

  async status() {
    if (!env.redisUrl) return { redis: "not configured", memoryEntries: memory.size };
    const pong = await redisCall((r) => r.send("PING", []));
    return {
      redis: pong ? "ok" : `unavailable${lastRedisError ? ` (${lastRedisError})` : ""}`,
      memoryEntries: memory.size,
    };
  },
};
