import { env } from "../env";
import { cachedFetch, fetchJson, type Cached } from "../lib/resilient";
import { decodeEntities, stripHtml } from "../lib/util";

/**
 * The rest of butex.edu.bd: departments, faculty members, offices, halls,
 * programs. Unlike notices, these pages keep their content in the theme's page
 * builder, so the REST API returns an empty body and we read the rendered HTML.
 *
 * Parsing leans on the theme's stable class names (`entry-content`,
 * `team-member-article`, `team-member-i`, `member-b`, `azoom-text-details`)
 * and degrades to plain page text if they change. Pages are cached for 12 h and
 * served stale for 7 days, so the site sees a few dozen requests a day at most.
 */

const UPSTREAM = "butex.edu.bd";
const PAGE_FRESH_SEC = 12 * 3600;

export type SiteLink = { label: string; url: string; group: string; parent?: string };
export type Person = {
  name: string;
  designation: string;
  unit: string;
  unitUrl: string;
  emails: string[];
  interests: string[];
  courses: string[];
  links: string[];
  summary: string;
  profile: string;
};
export type SitePage = {
  title: string;
  url: string;
  head?: { name: string; role: string; email?: string };
  text: string;
  people: Person[];
  files: { label: string; url: string }[];
};

// ── Directory ───────────────────────────────────────────────────────────────
// Snapshot of the site's own navigation (audited 2026-10-11). `liveDirectory`
// refreshes it from the menu when the site is reachable.

const B = "https://www.butex.edu.bd";
const SNAPSHOT: SiteLink[] = [
  ...[
    ["The Vice Chancellor", "/message-from-the-vice-chancellor/"],
    ["The Syndicate", "/syndicate-members/"],
    ["The Registrar", "/message-from-the-registrar/"],
    ["BUTEX: A Short History", "/butex-a-short-history/"],
  ].map(([label, p]) => ({ label: label!, url: B + p, group: "About" })),
  ...[
    ["Shaheed Aziz Hall", "/shaheed-aziz-hall/"],
    ["G. M. A. G. Osmani Hall", "/g-m-a-g-osmani-hall/"],
    ["Syed Nazrul Islam Hall", "/syed-nazrul-islam-hall/"],
    ["Bir Protik Captain Sitara Begum Hall", "/bir-protik-captain-sitara-begum-hall/"],
  ].map(([label, p]) => ({ label: label!, url: B + p, group: "Halls" })),
  ...(
    [
      ["Faculty of Textile Engineering", [["Department of Yarn Engineering", "/department-of-yarn-engineering-2/"], ["Department of Fabric Engineering", "/department-of-fabric-engineering/"]]],
      ["Faculty of Textile Management & Business Studies", [["Department of Textile Engineering Management", "/department-of-textile-engineering-management-3/"], ["Department of Industrial & Production Engineering", "/department-of-industrial-and-production-engineering/"], ["Department of Humanities & Social Science", "/department-of-humanities-and-social-science-3/"]]],
      ["Faculty of Textile Chemical Engineering", [["Department of Wet Process Engineering", "/department-of-wet-process-engineering/"], ["Department of Dyes and Chemical Engineering", "/ddce/"], ["Department of Environmental Science & Engineering", "/department-of-environmental-science-engineering/"], ["Department of Textile Materials Engineering", "/dotme/"]]],
      ["Faculty of Fashion Design & Apparel Engineering", [["Department of Apparel Engineering", "/department-of-apparel-engineering-2/"], ["Department of Textile Fashion & Design", "/department-of-textile-fashion-and-design-2/"]]],
      ["Faculty of Science & Engineering", [["Department of Textile Machinery Design & Maintenance", "/department-of-textile-machinery-design-and-maintenance/"], ["Department of Physics", "/department-of-physics-2/"], ["Department of Chemistry", "/department-of-chemistry/"], ["Department of Mathematics & Statistics", "/department-of-mathematics/"]]],
    ] as [string, [string, string][]][]
  ).flatMap(([faculty, depts]) => depts.map(([label, p]) => ({ label, url: B + p, group: "Departments", parent: faculty }))),
  ...[
    ["Office of the Vice-Chancellor", "/office-of-the-vice-chancellor/"],
    ["Office of the Planning & Development", "/office-of-the-planning-development/"],
    ["Office of the Proctor", "/butex-proctor-office/"],
    ["Office of the Director of Students' Welfare (DSW)", "/office-of-the-director-of-students-welfare/"],
    ["Office of Research & Extension (ORE)", "/research-extension-ore/"],
    ["Registrar Office", "/registrar-office/"],
    ["Examination Office", "/examination-office/"],
    ["Accounts Office", "/accounts-office/"],
    ["E-Library", "/e-library/"],
    ["Textile Testing and Consultation Services (TTCS)", "/textile-testing-and-consultation-services-ttcs/"],
    ["Transport Office", "/transport-office/"],
    ["Engineering Office", "/engineering-office/"],
    ["Medical Center", "/medical-center/"],
    ["Institutional Quality Assurance Cell (IQAC)", "/institutional-quality-assurance-cell-iqac/"],
    ["Audit Cell", "/audit-cell/"],
    ["ICT Cell", "/ict-cell/"],
  ].map(([label, p]) => ({ label: label!, url: B + p, group: "Offices" })),
  ...[
    ["Undergraduate Programs", "/undergraduate-programs/"],
    ["Postgraduate Programs", "/postgraduate-programs/"],
    ["PhD Program", "/phd/"],
    ["HELD (collaboration)", "/held/"],
    ["KiK (collaboration)", "/kik/"],
    ["Executive Development Program", "/executive-development-program/"],
    ["Academic Regulations: Undergraduate (PDF)", "/wp-content/uploads/2024/01/Academic-Regulations_0001.pdf"],
  ].map(([label, p]) => ({ label: label!, url: B + p, group: "Programs" })),
  ...[
    ["Research Project", "/research-project/"],
    ["ICTSE Conference 2026", "/conference-2026/"],
    ["ICTSE Conference 2025", "/conference-2025/"],
    ["BUTEX Journal of Textile Science and Engineering (BJTSE)", "/butex-journal-of-textile-science-and-engineering/"],
  ].map(([label, p]) => ({ label: label!, url: B + p, group: "Research" })),
  ...[
    ["Undergraduate Admission", B + "/admissions/"],
    ["Postgraduate Admission", "https://admission.butex.edu.bd/"],
    ["Convocation", B + "/convocation-2027/"],
    ["Downloadable Forms", B + "/downloadable-forms/"],
    ["NOC / GO", B + "/noc_go/"],
    ["Tender Notices", B + "/tender-notices/"],
    ["Career Opportunity", B + "/career-opportunity/"],
    ["Affiliated Colleges", B + "/affiliated-colleges/"],
    ["News Archive", B + "/news-archive/"],
    ["Fees Payment (Sonali Bank)", "https://billpay.sonalibank.com.bd/BUTEX/Payment/"],
    ["Complain to Proctor Office (form)", "https://forms.gle/QuAySdkpNuJnogXM8"],
    ["WebMail", "https://webmail.butex.edu.bd/"],
  ].map(([label, url]) => ({ label: label!, url: url!, group: "Students & services" })),
];

export const AFFILIATED_COLLEGES = [
  "Tangail Textile Engineering College, Kalihati, Tangail",
  "Gopalgonj Textile Engineering College, Gopalgonj",
  "Jhenaidah Textile Engineering College, Jhenaidah",
  "Rangpur Textile Engineering College, Pirgonj, Rangpur",
  "Begumgonj Textile Engineering College, Noakhali",
  "Pabna Textile Engineering College, Pabna",
  "Barisal Textile Engineering College, Barisal",
  "Textile Engineering College, Zorargonj, Chittagong",
  "Narsingdi Textile Engineering College, Narsingdi",
  "Jamalpur Textile Engineering College, Melandaho, Jamalpur",
];

export const CONTACT = {
  address: "Bangladesh University of Textiles, 92 Shaheed Tajuddin Ahmed Avenue, Tejgaon Industrial Area, Dhaka 1208, Bangladesh",
  phone: "+88 02 58151788",
  fax: "+88 02 48112698",
  email: "info@butex.edu.bd",
  admissionHelpline: "+88 01500121121, +88 01554926220",
  map: "https://www.google.com/maps/place/Bangladesh+University+of+Textiles/@23.760263,90.400586,16z",
};

/** Department aliases students actually type → menu label. */
const DEPT_ALIASES: [RegExp, string][] = [
  [/^(yarn|ye|dye|doye)$/, "Department of Yarn Engineering"],
  [/^(fabric|fe|dfe|dofe)$/, "Department of Fabric Engineering"],
  [/^(wet|wetprocess|wpe|dwpe|dowpe)$/, "Department of Wet Process Engineering"],
  [/^(dyes|dyeschemical|dce|ddce|dyesandchemical)$/, "Department of Dyes and Chemical Engineering"],
  [/^(environmental|environment|ese|dese|evs)$/, "Department of Environmental Science & Engineering"],
  [/^(materials|tme|dotme|textilematerials)$/, "Department of Textile Materials Engineering"],
  [/^(apparel|ae|dae)$/, "Department of Apparel Engineering"],
  [/^(fashion|fashiondesign|tfd|dtfd|dotfd)$/, "Department of Textile Fashion & Design"],
  [/^(machinery|tmdm|dtmdm|dotmdm)$/, "Department of Textile Machinery Design & Maintenance"],
  [/^(management|tem|dtem|dotem)$/, "Department of Textile Engineering Management"],
  [/^(ipe|industrial|industrialproduction|dipe|doipe)$/, "Department of Industrial & Production Engineering"],
  [/^(hss|humanities|dohss)$/, "Department of Humanities & Social Science"],
  [/^(physics|phy|doph)$/, "Department of Physics"],
  [/^(chemistry|chem|doch)$/, "Department of Chemistry"],
  [/^(math|maths|mathematics|statistics|doms)$/, "Department of Mathematics & Statistics"],
];

const norm = (s: string) => s.toLowerCase().replace(/department of|dept\.?|engineering|&|and/g, "").replace(/[^a-z0-9]/g, "");

export function directory(): SiteLink[] {
  return SNAPSHOT;
}

export function departments(): SiteLink[] {
  return SNAPSHOT.filter((l) => l.group === "Departments");
}

export function findDepartment(q: string): SiteLink | undefined {
  const n = q.toLowerCase().replace(/department of|dept\.?/g, "").replace(/[^a-z0-9]/g, "");
  const alias = DEPT_ALIASES.find(([re]) => re.test(n));
  if (alias) return departments().find((d) => d.label === alias[1]);
  const k = norm(q);
  return departments().find((d) => norm(d.label) === k) ?? departments().find((d) => k.length >= 3 && norm(d.label).includes(k));
}

/** Best directory match for free text ("exam office", "osmani hall", "VC"). */
export function findLink(q: string): SiteLink | undefined {
  if (/^https?:\/\//i.test(q)) {
    const u = q.replace(/^http:/i, "https:").replace("//butex.edu.bd", "//www.butex.edu.bd");
    return SNAPSHOT.find((l) => l.url === u || l.url === u + "/") ?? { label: u, url: u, group: "Page" };
  }
  const dept = findDepartment(q);
  if (dept) return dept;
  const k = norm(q.replace(/\b(office|the|of|page|message|from|details?|info|information|butex|website)\b/gi, ""));
  if (!k) return undefined;
  const special: [RegExp, string][] = [
    [/^(vc|vicechancellor)$/, "The Vice Chancellor"],
    [/^(dsw|studentswelfare|studentwelfare)$/, "Office of the Director of Students' Welfare (DSW)"],
    [/^(pnd|planningdevelopment|planning)$/, "Office of the Planning & Development"],
    [/^(ore|research)$/, "Office of Research & Extension (ORE)"],
    [/^(exam|examination|controller)$/, "Examination Office"],
    [/^(library|elibrary)$/, "E-Library"],
    [/^(ttcs|testing)$/, "Textile Testing and Consultation Services (TTCS)"],
    [/^(medical|doctor|medicalcenter)$/, "Medical Center"],
    [/^(history|about)$/, "BUTEX: A Short History"],
    [/^(syndicate)$/, "The Syndicate"],
    [/^(registrar)$/, "Registrar Office"],
    [/^(forms|form)$/, "Downloadable Forms"],
    [/^(fees|fee|payment)$/, "Fees Payment (Sonali Bank)"],
    [/^(journal|bjtse)$/, "BUTEX Journal of Textile Science and Engineering (BJTSE)"],
  ];
  const sp = special.find(([re]) => re.test(k));
  if (sp) return SNAPSHOT.find((l) => l.label === sp[1]);
  const words = q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !["the", "office", "page", "butex"].includes(w));
  let best: SiteLink | undefined;
  let bestScore = 0;
  for (const l of SNAPSHOT) {
    const label = l.label.toLowerCase();
    const score = words.filter((w) => label.includes(w)).length;
    if (score > bestScore) [best, bestScore] = [l, score];
  }
  return best;
}

// ── Page parsing ────────────────────────────────────────────────────────────

/** End index of the element whose opening tag starts at `start` (balanced on `tag`). */
function balancedEnd(html: string, start: number, tag: string): number {
  const re = new RegExp(`<${tag}\\b|</${tag}>`, "gi");
  re.lastIndex = start;
  let depth = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0][1] === "/" ? -1 : 1;
    if (depth === 0) return m.index + m[0].length;
  }
  return html.length;
}

function contentRegion(html: string): string {
  const start = html.indexOf('id="primary"');
  if (start < 0) return "";
  const end = html.indexOf('id="footer"', start);
  let region = html.slice(start, end > 0 ? end : undefined);
  // Department pages put faculty cards *after* the sidebar, so cut the sidebar out rather than stopping at it.
  for (let i = 0; i < 20; i++) {
    const at = region.search(/<div class="sidebar-area|<aside\b/);
    if (at < 0) break;
    const tag = region.startsWith("<aside", at) ? "aside" : "div";
    region = region.slice(0, at) + region.slice(balancedEnd(region, at, tag));
  }
  return region;
}

const tidy = (s: string) => s.replace(/\s*\n\s*/g, "\n").replace(/[ \t ]+/g, " ").replace(/\n{2,}/g, "\n").trim();
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const isOfficial = (e: string) => /butex\.edu\.bd$/i.test(e);
const HEADINGS = /^(PROFESSIONAL HIGHLIGHTS|FIELD OF INTEREST|ACADEMIC EXCELLENCE|LIST OF PUBLICATIONS?|PERSONAL ACHIEVEMENTS|FACILITATED COURSES?|COURSES? TAUGHT|CONTACT|RESEARCH INTERESTS?|AREAS? OF INTEREST|PUBLICATIONS?|EDUCATION|EXPERIENCE|AWARDS?)\b/i;

function section(lines: string[], name: RegExp): string[] {
  const i = lines.findIndex((l) => name.test(l));
  if (i < 0) return [];
  const out: string[] = [];
  for (const l of lines.slice(i + 1)) {
    if (HEADINGS.test(l)) break;
    const t = l.replace(/^[:•\-–\s]+/, "").trim();
    if (t && t !== ":") out.push(t);
  }
  return out;
}

function parsePerson(block: string, unit: string, unitUrl: string): Person | null {
  const name = stripHtml(/class="member-b[^"]*">([\s\S]*?)<\/div>/.exec(block)?.[1] ?? "").trim();
  if (!name) return null;
  const designation = stripHtml(/class="team-member-i[^"]*">([\s\S]*?)<\/span>/.exec(block)?.[1] ?? "").trim();
  const detailsAt = block.indexOf('class="member-details"');
  const details = detailsAt > 0 ? block.slice(block.indexOf(">", detailsAt) + 1) : "";
  const lines = tidy(stripHtml(details)).split("\n").map((l) => l.trim()).filter(Boolean);
  // Drop the repeated "Name Designation" header and social placeholders.
  const body = lines.filter((l) => l !== name && l !== designation && l !== `${name} ${designation}` && !/^\|+$/.test(l));
  const links = [...details.matchAll(/href="(https?:\/\/[^"]+)"/g)]
    .map((m) => decodeEntities(m[1]!))
    .filter((u) => !/^https?:\/\/(www\.)?(facebook|twitter|youtube)\.com\/?$/i.test(u) && !/butex\.edu\.bd\/wp-content/i.test(u));
  return {
    name,
    designation,
    unit,
    unitUrl,
    // Official addresses only: some cards also list personal Gmail accounts, which we don't redistribute.
    emails: [...new Set((details.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()).filter(isOfficial))],
    interests: section(body, /^(FIELD OF INTEREST|RESEARCH INTERESTS?|AREAS? OF INTEREST)/i).filter((l) => !/speciali[sz]ed in:?$/i.test(l)).slice(0, 12),
    courses: section(body, /^(FACILITATED COURSES?|COURSES? TAUGHT)/i).slice(0, 15),
    links: [...new Set(links)].slice(0, 6),
    summary: section(body, /^PROFESSIONAL HIGHLIGHTS/i).join(" ").slice(0, 400),
    profile: body.join("\n").replace(EMAIL_RE, (e) => (isOfficial(e) ? e : "[personal email omitted]")).slice(0, 6000),
  };
}

export function parsePage(html: string, url: string, fallbackTitle?: string): SitePage {
  let region = contentRegion(html);
  const people: Person[] = [];
  const titleTag = decodeEntities(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").replace(/\s*[–-]\s*BUTEX\s*$/i, "").trim();
  const h1 = stripHtml(/<h1 class="azoom-heading"[^>]*>([\s\S]*?)<\/h1>/.exec(region)?.[1] ?? "");
  const title = fallbackTitle ?? (h1 || titleTag || url);

  // Pull out every team card so the remaining text is the page's own prose.
  for (let guard = 0; guard < 300; guard++) {
    const at = region.indexOf("team-member-article");
    if (at < 0) break;
    const liStart = region.lastIndexOf("<li", at);
    const start = liStart >= 0 && at - liStart < 200 ? liStart : region.lastIndexOf("<div", at);
    const end = balancedEnd(region, start, start === liStart ? "li" : "div");
    const p = parsePerson(region.slice(start, end), title, url);
    if (p) people.push(p);
    region = region.slice(0, start) + "\n" + region.slice(end);
  }

  const headHtml = /class="azoom-text-details">([\s\S]*?)<\/div>/.exec(region)?.[1];
  let head: SitePage["head"];
  if (headHtml) {
    const hl = tidy(stripHtml(headHtml)).split("\n").filter(Boolean);
    const email = hl.join(" ").match(EMAIL_RE)?.[0];
    if (hl[0]?.includes(" ") && hl[1] && /head|dean|director|provost|registrar|chancellor|in-charge|controller/i.test(hl[1])) head = { name: hl[0], role: hl[1], email };
  }

  const files = [...region.matchAll(/<a[^>]+href="([^"]+\.(?:pdf|docx?|xlsx?))"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => ({ url: m[1]!.replace(/^http:/, "https:"), label: tidy(stripHtml(m[2]!)) || m[1]!.split("/").pop()! }))
    .filter((f, i, a) => a.findIndex((x) => x.url === f.url) === i)
    .slice(0, 40);

  const text = tidy(stripHtml(region.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<\/(td|th)>/gi, " | </$1>")))
    .replace(/^id="primary"[^\n]*\n?/, "")
    .split("\n")
    .filter((l) => !/^(\d+|…|Next|Previous|\|+)$/.test(l) && !/^<\w*$/.test(l))
    .join("\n")
    .replace(EMAIL_RE, (e) => (isOfficial(e) ? e : "[personal email omitted]"));

  return { title, url, head, text, people, files };
}

/** Only www.butex.edu.bd pages are fetched; everything else is returned as a link. */
export function isSitePage(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "www.butex.edu.bd" || u.hostname === "butex.edu.bd");
  } catch {
    return false;
  }
}

export async function getPage(link: SiteLink): Promise<Cached<SitePage>> {
  if (/\.(pdf|docx?)$/i.test(link.url) || !isSitePage(link.url)) {
    return { data: { title: link.label, url: link.url, text: "", people: [], files: [] }, fetchedAt: new Date().toISOString(), stale: false };
  }
  return cachedFetch(`butex:page:${link.url}`, PAGE_FRESH_SEC, async () => {
    const { data } = await fetchJson<string>(link.url, { upstream: UPSTREAM, as: "text", timeoutMs: 15_000 });
    return parsePage(data, link.url, link.group === "Page" ? undefined : link.label);
  });
}

// ── People index ────────────────────────────────────────────────────────────

/** Every department, office and hall page, fetched 4 at a time. Built on demand, cached 12 h. */
export async function peopleIndex(): Promise<Cached<Person[]>> {
  return cachedFetch("butex:people:v1", PAGE_FRESH_SEC, async () => {
    const units = SNAPSHOT.filter((l) => ["Departments", "Offices", "Halls", "About"].includes(l.group) && l.url.startsWith(B));
    const people: Person[] = [];
    let ok = 0;
    for (let i = 0; i < units.length; i += 4) {
      const batch = await Promise.allSettled(units.slice(i, i + 4).map((u) => getPage(u)));
      for (const r of batch) if (r.status === "fulfilled") { ok++; people.push(...r.value.data.people); }
    }
    if (!ok) throw new Error("no BUTEX unit pages could be loaded");
    // Slim the index: the full profile comes from the unit page on demand.
    return people.map((p) => ({ ...p, profile: "" }));
  });
}

const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export function searchPeople(people: Person[], q: { name?: string; topic?: string; designation?: string; unit?: string }): Person[] {
  const name = q.name ? fold(q.name).split(" ").filter((w) => w.length > 1 && !["dr", "md", "prof", "mr", "ms", "mst"].includes(w)) : [];
  const topic = q.topic ? fold(q.topic).split(" ").filter((w) => w.length > 2) : [];
  const desig = q.designation ? fold(q.designation) : "";
  const unit = q.unit ? findLink(q.unit)?.label ?? q.unit : "";
  const phrase = topic.join(" ");
  const scored = people
    .filter((p) => !unit || fold(p.unit).includes(fold(unit)))
    .filter((p) => !desig || fold(p.designation).includes(desig))
    .filter((p) => !name.length || name.every((w) => fold(p.name).includes(w)))
    .map((p) => {
      if (!topic.length) return { p, s: 1, all: true };
      const hay = fold([...p.interests, ...p.courses, p.summary].join(" "));
      const words = topic.filter((w) => hay.includes(w)).length;
      return { p, s: words + (hay.includes(phrase) ? 10 : 0), all: words === topic.length };
    })
    .filter((x) => x.s > 0);
  // Prefer people matching every topic word; fall back to partial matches only if nobody does.
  const strict = scored.filter((x) => x.all);
  return (strict.length ? strict : scored).sort((a, b) => b.s - a.s).map((x) => x.p);
}
