import { env } from "../env";
import { cachedFetch, fetchJson, type Cached } from "../lib/resilient";
import { decodeEntities, stripHtml } from "../lib/util";

/**
 * butex.edu.bd is WordPress with its REST API open, so everything here is
 * structured JSON — no HTML selectors that break when the theme changes.
 *
 * Notice bodies are almost always a scanned JPG (~80%) or a PDF (~20%); the
 * title, date and category are the only machine-readable text. Attachments
 * are surfaced so the agent (or `readNotice`) can open them.
 */

const UPSTREAM = "butex.edu.bd";
const API = () => `${env.butexBase}/wp-json/wp/v2`;

export type Attachment = { kind: "pdf" | "image" | "doc"; url: string; preview?: string };
export type Notice = {
  id: number;
  title: string;
  date: string; // ISO, Asia/Dhaka local as published
  modified: string;
  url: string;
  categories: string[];
  attachments: Attachment[];
  text?: string;
};
export type Page<T> = { items: T[]; total: number; totalPages: number };

type WpPost = {
  id: number;
  date: string;
  modified: string;
  link: string;
  title: { rendered: string };
  content?: { rendered: string };
  categories: number[];
};
type WpCategory = { id: number; slug: string; name: string; count: number; parent: number };

/** Friendly names → WordPress category slugs. */
export const CATEGORY_SLUGS = {
  academic: "academic-notices",
  administrative: "administrative-notices",
  results: "published-results",
  affiliated: "affiliated-colleges",
  undergrad_admission: "undergrade-admission",
  postgrad_admission: "postgraduate-admission",
  convocation: "convocation-updates",
  career: "career-oppurtunity",
  tender: "tender",
  noc_go: "noc_go",
  events: "latest-events",
  research: "research-highlight",
  iqac: "iqac",
  forms: "necessary-forms-and-formats",
  executive_program: "executive-development-program",
  clubs: "club-activities",
} as const;
export type CategoryKey = keyof typeof CATEGORY_SLUGS;

export const DEPARTMENT_SLUGS = {
  yarn: "dye",
  fabric: "dfe",
  wet_process: "dwpe",
  apparel: "dae",
  fashion_design: "dtfd",
  management: "dtem",
  machinery: "dtmdm",
  industrial_production: "dipe",
  dyes_chemical: "dce",
  environmental: "dese",
} as const;
export type DepartmentKey = keyof typeof DEPARTMENT_SLUGS;

/** Last-known ids, used only if the categories endpoint itself is unreachable. */
const FALLBACK_IDS: Record<string, number> = {
  "academic-notices": 110, "administrative-notices": 111, "published-results": 112, "affiliated-colleges": 96,
  "undergrade-admission": 70, "postgraduate-admission": 73, "convocation-updates": 124, "career-oppurtunity": 63,
  tender: 88, noc_go: 117, "latest-events": 69, "research-highlight": 68, iqac: 89, "necessary-forms-and-formats": 125,
  "executive-development-program": 95, "club-activities": 65,
  dye: 31, dfe: 30, dwpe: 32, dae: 33, dtfd: 34, dtem: 35, dtmdm: 37, dipe: 36, dce: 91, dese: 97,
};

export async function getCategories(): Promise<Cached<WpCategory[]>> {
  return cachedFetch("butex:categories", 24 * 3600, async () => {
    const { data } = await fetchJson<WpCategory[]>(`${API()}/categories?per_page=100&_fields=id,slug,name,count,parent`, {
      upstream: UPSTREAM,
    });
    return data.map((c) => ({ ...c, name: decodeEntities(c.name) }));
  });
}

async function categoryMaps() {
  try {
    const { data } = await getCategories();
    return {
      idBySlug: new Map(data.map((c) => [c.slug, c.id])),
      nameById: new Map(data.map((c) => [c.id, c.name])),
    };
  } catch {
    return { idBySlug: new Map(Object.entries(FALLBACK_IDS)), nameById: new Map<number, string>() };
  }
}

export async function slugToId(slug: string): Promise<number | undefined> {
  return (await categoryMaps()).idBySlug.get(slug) ?? FALLBACK_IDS[slug];
}

const httpsify = (u: string) => u.replace(/^http:\/\//i, "https://");

/** Pull downloadable files out of a post body; prefer full-size images over thumbnails. */
export function extractAttachments(html = ""): Attachment[] {
  const out = new Map<string, Attachment>();
  const add = (url: string, preview?: string) => {
    const clean = httpsify(decodeEntities(url.trim()));
    if (!/\/wp-content\/uploads\//i.test(clean) && !/\.pdf(\?|$)/i.test(clean)) return;
    const kind: Attachment["kind"] = /\.pdf(\?|$)/i.test(clean)
      ? "pdf"
      : /\.(jpe?g|png|gif|webp)(\?|$)/i.test(clean)
        ? "image"
        : /\.(docx?|xlsx?|pptx?)(\?|$)/i.test(clean)
          ? "doc"
          : "doc";
    // collapse WordPress resized variants (foo-768x1085.jpg) onto the original
    const canonical = clean.replace(/-\d{2,4}x\d{2,4}(\.(?:jpe?g|png|gif|webp))$/i, "$1");
    const prev = out.get(canonical);
    out.set(canonical, { kind, url: canonical, preview: preview ?? prev?.preview });
  };

  for (const m of html.matchAll(/href="([^"]+)"/gi)) if (/\.(pdf|jpe?g|png|gif|webp|docx?|xlsx?|pptx?)(\?|$)/i.test(m[1]!)) add(m[1]!);
  for (const m of html.matchAll(/<img[^>]*>/gi)) {
    const tag = m[0];
    const src = /src="([^"]+)"/i.exec(tag)?.[1];
    const srcset = /srcset="([^"]+)"/i.exec(tag)?.[1];
    // pick a ~1100px-wide variant: legible for a model, a fraction of the full scan's weight
    let preview: string | undefined;
    if (srcset) {
      const variants = srcset
        .split(",")
        .map((s) => s.trim().split(/\s+/))
        .map(([u, w]) => ({ u: httpsify(u!), w: parseInt(w ?? "0", 10) }))
        .filter((v) => v.w > 0)
        .sort((a, b) => Math.abs(a.w - 1100) - Math.abs(b.w - 1100));
      preview = variants[0]?.u;
    }
    if (src) add(src, preview);
  }
  return [...out.values()];
}

function toNotice(p: WpPost, nameById: Map<number, string>, withText: boolean): Notice {
  const html = p.content?.rendered ?? "";
  const text = withText ? stripHtml(html) : "";
  return {
    id: p.id,
    title: decodeEntities(stripHtml(p.title.rendered)),
    date: p.date,
    modified: p.modified,
    url: httpsify(p.link),
    categories: p.categories.map((id) => nameById.get(id) ?? `#${id}`),
    attachments: extractAttachments(html),
    ...(text.length > 20 ? { text: text.slice(0, 4000) } : {}),
  };
}

export type ListQuery = {
  categoryIds?: number[];
  search?: string;
  after?: string; // YYYY-MM-DD
  before?: string;
  page?: number;
  perPage?: number;
};

export async function listNotices(q: ListQuery, freshSec = 600): Promise<Cached<Page<Notice>>> {
  const params = new URLSearchParams({
    per_page: String(q.perPage ?? 10),
    page: String(q.page ?? 1),
    orderby: "date",
    order: "desc",
    _fields: "id,date,modified,link,title,content,categories",
  });
  if (q.categoryIds?.length) params.set("categories", q.categoryIds.join(","));
  if (q.search) params.set("search", q.search);
  if (q.after) params.set("after", `${q.after}T00:00:00`);
  if (q.before) params.set("before", `${q.before}T23:59:59`);

  const key = `butex:list:${params.toString()}`;
  return cachedFetch(key, freshSec, async () => {
    const [{ data, headers }, maps] = await Promise.all([
      fetchJson<WpPost[]>(`${API()}/posts?${params}`, { upstream: UPSTREAM }).catch((err) => {
        // WordPress answers 400 for a page past the end; that's an empty page, not an outage.
        if (err?.status === 400) return { data: [] as WpPost[], headers: new Headers() };
        throw err;
      }),
      categoryMaps(),
    ]);
    return {
      items: data.map((p) => toNotice(p, maps.nameById, false)),
      total: Number(headers.get("x-wp-total") ?? data.length),
      totalPages: Number(headers.get("x-wp-totalpages") ?? 1),
    };
  });
}

export async function getNotice(idOrUrl: string | number): Promise<Cached<Notice>> {
  const ref = String(idOrUrl).trim();
  const isId = /^\d+$/.test(ref);
  const slug = isId ? "" : (ref.replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop() ?? "");
  if (!isId && !slug) throw new Error("Pass a numeric notice id or a butex.edu.bd notice URL.");

  return cachedFetch(`butex:notice:${isId ? ref : `slug:${slug}`}`, 3600, async () => {
    const url = isId ? `${API()}/posts/${ref}` : `${API()}/posts?slug=${encodeURIComponent(slug)}`;
    const [{ data }, maps] = await Promise.all([fetchJson<WpPost | WpPost[]>(url, { upstream: UPSTREAM }), categoryMaps()]);
    const post = Array.isArray(data) ? data[0] : data;
    if (!post) throw new Error(`No notice found for "${ref}".`);
    return toNotice(post, maps.nameById, true);
  });
}

/**
 * The newest ~300 notices, refreshed in the background. When the site is down
 * this is what search runs against, so answers stay available.
 */
export async function getCorpus(): Promise<Cached<Notice[]>> {
  return cachedFetch(
    "butex:corpus",
    30 * 60,
    async () => {
      const pages = await Promise.all([1, 2, 3].map((page) => listNotices({ page, perPage: 100 }, 25 * 60)));
      return pages.flatMap((p) => p.data.items);
    },
    30 * 24 * 3600,
  );
}

export function searchCorpus(corpus: Notice[], query: string): Notice[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return corpus
    .map((n) => {
      const hay = `${n.title} ${n.categories.join(" ")}`.toLowerCase();
      const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
      return { n, score };
    })
    .filter((x) => x.score === terms.length || (terms.length > 2 && x.score >= terms.length - 1))
    .sort((a, b) => b.score - a.score || b.n.date.localeCompare(a.n.date))
    .map((x) => x.n);
}

export const butexUpstream = UPSTREAM;
