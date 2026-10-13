export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Rejects if `p` does not settle within `ms`. */
export function withTimeout<T>(p: Promise<T>, ms: number, label = "operation"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (err) => (clearTimeout(t), reject(err)),
    );
  });
}

export function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
};

/** WordPress returns HTML-encoded titles ("&#038;", "&#8217;"). */
export function decodeEntities(input = ""): string {
  return input
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

export function stripHtml(html = ""): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h\d|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export function clamp(n: number | undefined, min: number, max: number, fallback: number): number {
  if (n === undefined || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers as ConstructorParameters<typeof Headers>[0]);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function clientIp(req: Request, server?: { requestIP(r: Request): { address: string } | null }): string {
  // ai.butexnotebot.com sits behind Cloudflare: X-Forwarded-For's first hop is a
  // Cloudflare edge (172.68.x, 162.158.x…), shared by everyone in the city, so
  // per-IP limits were really per-edge. CF-Connecting-IP is the visitor.
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return cf || fwd || req.headers.get("x-real-ip") || server?.requestIP(req)?.address || "unknown";
}
