import { env } from "../env";
import { cachedFetch, fetchJson, type Cached } from "../lib/resilient";

/**
 * Read-only client over notebot-engine-v2 (api.butexnotebot.com): the NoteBot
 * knowledge base of notes, lab reports, question banks, routines and syllabi.
 * Every read is cached and served stale when engine-v2 is unreachable, same as
 * the BUTEX client. TexGPT is deliberately not exposed over MCP.
 */

const UPSTREAM = "notebot-engine";
const api = (path: string) => `${env.engineUrl}${path}`;

type Level = { id: number; slug: string; displayName: string; metadata?: { labSubjects?: LabSubjectMeta[] } | null };
type LabSubjectMeta = { dbSlug: string; displayName: string; v1RouteSlug?: string };
type Subject = { id: number; levelId: number; name: string; displayName: string; slug: string; metadata?: { directUrl?: string } | null };
type Topic = { id: number; subjectId: number; displayName: string; slug: string; metadata?: { directUrl?: string } | null };
type Note = { id: number; title: string; url: string; metadata?: Record<string, unknown> | null };
export type LabItem = { topicName: string; display: string; url: string };
export type QBank = { id: number; levelId: number; subjectSlug: string; title: string; url: string; metadata?: { author?: string } | null };
export type Routine = { id: number; levelId: number | null; term: string | null; department: string | null; title: string; url: string };
export type ArchivedResult = { id: number; title: string; url: string; category: string; metadata?: { year?: number } | null };
export type SearchHit = { kind: "note" | "lab"; title: string; url: string; subject: string; topic: string; level: string; route: string | null; score: number };

async function get<T>(path: string, freshSec: number, opts: { allow404?: T } = {}): Promise<Cached<T>> {
  return cachedFetch(`engine:${path}`, freshSec, async () => {
    try {
      return (await fetchJson<T>(api(path), { upstream: UPSTREAM, timeoutMs: 10_000 })).data;
    } catch (err) {
      // engine-v2 answers 404 for "nothing matched" on search; that's a result, not an outage
      if ((err as { status?: number }).status === 404 && opts.allow404 !== undefined) return opts.allow404;
      throw err;
    }
  });
}

export const engineUpstream = UPSTREAM;

export async function levels() {
  return get<Level[]>("/api/v1/levels", 6 * 3600);
}

/** "1".."4" (or "L2", "level 3") → the engine's level row. */
export async function resolveLevel(level: number | string): Promise<Level> {
  const n = String(level).match(/[1-4]/)?.[0];
  const { data } = await levels();
  const hit = data.find((l) => l.slug === n);
  if (!hit) throw new Error(`Unknown level "${level}". Use 1, 2, 3 or 4.`);
  return hit;
}

export async function subjects(levelId: number) {
  return get<Subject[]>(`/api/v1/levels/${levelId}/subjects`, 3600);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/iv$/, "4").replace(/iii$/, "3").replace(/ii$/, "2").replace(/i$/, "1");

/** Fuzzy subject lookup: "math1", "Math-I", "math 1", "Mathematics I" all hit math1. */
export function pickSubject<T extends { slug?: string; name?: string; displayName: string; dbSlug?: string }>(list: T[], query: string): T | undefined {
  const q = norm(query);
  const keys = (s: T) => [s.slug, s.name, s.displayName, s.dbSlug].filter(Boolean).map((x) => norm(String(x)));
  return list.find((s) => keys(s).includes(q)) ?? list.find((s) => keys(s).some((k) => k.startsWith(q) || q.startsWith(k)));
}

export async function topics(subjectId: number) {
  return get<Topic[]>(`/api/v1/subjects/${subjectId}/topics`, 3600);
}

export async function notes(topicId: number) {
  return get<Note[]>(`/api/v1/topics/${topicId}/notes`, 3600);
}

export type TopicWithLinks = { topic: string; links: { title: string; url: string }[] };

/** A subject's topics with their links resolved (direct folder link, or the notes inside). */
export async function subjectLibrary(subjectId: number): Promise<{ items: TopicWithLinks[]; meta: Cached<unknown> }> {
  const t = await topics(subjectId);
  const items = await Promise.all(
    t.data.map(async (topic): Promise<TopicWithLinks> => {
      if (topic.metadata?.directUrl) return { topic: topic.displayName, links: [{ title: topic.displayName, url: topic.metadata.directUrl }] };
      const n = await notes(topic.id).catch(() => null);
      return { topic: topic.displayName, links: (n?.data ?? []).map((x) => ({ title: x.title, url: x.url })) };
    }),
  );
  return { items: items.filter((i) => i.links.length), meta: t };
}

/**
 * The labs endpoint is the complete list of lab subjects (level metadata only
 * names a subset); metadata contributes display names where it has them.
 */
export async function labSubjects(levelId: number): Promise<LabSubjectMeta[]> {
  const [lvl, list] = await Promise.all([
    levels().then((l) => l.data.find((x) => x.id === levelId)),
    get<{ subjectSlug: string }[]>(`/api/v1/labs/${levelId}`, 3600, { allow404: [] }).catch(() => null),
  ]);
  const named = new Map((lvl?.metadata?.labSubjects ?? []).map((m) => [m.dbSlug, m]));
  const pretty = (slug: string) =>
    slug
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .split(/[_\s]+/)
      .map((w) => (/^\d+$/.test(w) ? w : w.length <= 4 ? w.toUpperCase() : w[0]!.toUpperCase() + w.slice(1)))
      .join(" ")
      .replace(/ (\d)$/, "-$1");
  const slugs = list?.data.map((x) => x.subjectSlug) ?? [...named.keys()];
  return slugs.map((s) => named.get(s) ?? { dbSlug: s, displayName: pretty(s) });
}

export async function labItems(levelId: number, dbSlug: string) {
  return get<LabItem[]>(`/api/v1/labs/${levelId}/${encodeURIComponent(dbSlug)}`, 3600, { allow404: [] });
}

export async function questionBanks(levelId: number) {
  return get<QBank[]>(`/api/v1/question-banks/${levelId}`, 3600, { allow404: [] });
}

export async function routines() {
  return get<Routine[]>("/api/v1/routines", 3600);
}

export async function archivedResults() {
  return get<ArchivedResult[]>("/api/v1/results", 6 * 3600);
}

export async function syllabusBatches() {
  return get<{ batch: string; route: string }[]>("/app/syllabus", 6 * 3600);
}

export async function syllabus(batch: string) {
  const depts = await get<{ dept: string; route: string }[]>(`/app/syllabus/${encodeURIComponent(batch)}`, 6 * 3600, { allow404: [] });
  const files = await Promise.all(
    depts.data.map(async (d) => {
      const f = await get<{ topic: string; url: string } | { topic: string; url: string }[]>(`/${d.route}`, 6 * 3600, { allow404: [] }).catch(() => null);
      const list = f ? (Array.isArray(f.data) ? f.data : [f.data]) : [];
      return { dept: d.dept, files: list.filter((x) => x?.url) };
    }),
  );
  return { data: files, meta: depts };
}

export async function search(q: string, limit = 10) {
  return get<{ results: SearchHit[] }>(`/app/search?q=${encodeURIComponent(q)}&limit=${limit}`, 900, { allow404: { results: [] } });
}


/** Public popularity counters from notebot-analytics-go, used for "what are other students studying". */
export async function popularity(): Promise<{ notes: { sub_name: string; count: number }[]; labs: { lab_name: string; count: number }[] } | null> {
  try {
    const [n, l] = await Promise.all([
      cachedFetch("analytics:pop:notes", 3600, async () => (await fetchJson<{ topNoteSubjects: { sub_name: string; count: number }[] }>(`${env.analyticsUrl}/notes/top`, { upstream: "notebot-analytics", timeoutMs: 6000 })).data),
      cachedFetch("analytics:pop:labs", 3600, async () => (await fetchJson<{ topLabSubjects: { lab_name: string; count: number }[] }>(`${env.analyticsUrl}/labs/top`, { upstream: "notebot-analytics", timeoutMs: 6000 })).data),
    ]);
    return { notes: n.data.topNoteSubjects ?? [], labs: l.data.topLabSubjects ?? [] };
  } catch {
    return null;
  }
}
