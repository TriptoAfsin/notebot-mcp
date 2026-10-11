/**
 * Every setting has a working default so the service boots with nothing set.
 * Missing infrastructure degrades a feature; it never stops the process.
 */
const e = process.env;

function int(name: string, fallback: number): number {
  const n = Number(e[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const devSecret = "dev-only-insecure-secret-change-me";

export const env = {
  port: int("PORT", 8080),
  publicUrl: (e.PUBLIC_URL ?? "http://localhost:8080").replace(/\/+$/, ""),
  isProd: e.NODE_ENV === "production" || !!e.RAILWAY_ENVIRONMENT,

  /** Signs API keys, OAuth client ids and encrypts auth codes. Rotating it invalidates every key. */
  secret: e.KEY_SIGNING_SECRET || devSecret,
  usingDevSecret: !e.KEY_SIGNING_SECRET,

  /** Your personal admin key. Unlocks /analytics/mcp directly or through the OAuth page. */
  adminKey: e.ADMIN_API_KEY ?? "",

  databaseUrl: e.DATABASE_URL ?? "",
  redisUrl: e.REDIS_URL ?? "",

  butexBase: (e.BUTEX_BASE_URL ?? "https://www.butex.edu.bd").replace(/\/+$/, ""),

  analyticsUrl: (e.ANALYTICS_API_URL ?? "https://analytics-api.butexnotebot.com").replace(/\/+$/, ""),
  analyticsAdminKey: e.ANALYTICS_ADMIN_KEY ?? "",

  freePerMinute: int("FREE_RATE_PER_MINUTE", 60),
  freePerDay: int("FREE_RATE_PER_DAY", 5000),
  keysPerEmail: int("MAX_KEYS_PER_EMAIL", 10),
  keyIssuesPerIpHour: int("KEY_ISSUES_PER_IP_HOUR", 10),
};

if (env.isProd && env.usingDevSecret) {
  console.warn("⚠️  KEY_SIGNING_SECRET is not set — keys are signed with a public dev secret. Set it in Railway.");
}
