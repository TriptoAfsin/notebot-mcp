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
  /** Count public MCP tool calls as platform "ai" in NoteBot analytics (needs ANALYTICS_ADMIN_KEY). */
  reportAiUsage: (e.REPORT_AI_USAGE ?? "true") !== "false",

  /** notebot-engine-v2: notes, labs, q-banks, routines, syllabus. */
  engineUrl: (e.ENGINE_API_URL ?? "https://api.butexnotebot.com").replace(/\/+$/, ""),

  /** Resend, for emailing existing keys back to their owner. Without it, recovery says "try later". */
  resendKey: e.RESEND_API_KEY ?? "",
  mailFrom: e.MAIL_FROM ?? (e.RESEND_FROM_EMAIL ? `${e.RESEND_FROM_NAME ?? "NoteBot"} <${e.RESEND_FROM_EMAIL}>` : "NoteBot <notebot@t21.dev>"),
  mailReplyTo: e.MAIL_REPLY_TO ?? "",
  recoveryEmailsPerHour: int("RECOVERY_EMAILS_PER_HOUR", 3),

  freePerMinute: int("FREE_RATE_PER_MINUTE", 60),
  freePerDay: int("FREE_RATE_PER_DAY", 5000),
  keysPerEmail: int("MAX_KEYS_PER_EMAIL", 10),
  keyIssuesPerIpHour: int("KEY_ISSUES_PER_IP_HOUR", 10),
};

if (env.isProd && env.usingDevSecret) {
  process.stderr.write(`${JSON.stringify({ time: new Date().toISOString(), level: "warn", message: "KEY_SIGNING_SECRET is not set: keys are signed with a public dev secret. Set it in Railway.", event: "config" })}
`);
}
