import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { clamp } from "../lib/util";
import { freshnessLine, guard, READ_ONLY, text, todayDhaka } from "../mcp/tooling";
import { DEPARTMENT_SLUGS } from "./client";
import {
  AFFILIATED_COLLEGES,
  CONTACT,
  departments,
  directory,
  findDepartment,
  findLink,
  getPage,
  isSitePage,
  peopleIndex,
  searchPeople,
  type Person,
  type SitePage,
} from "./site";

/** Menu label → the notice-category key butex_department_notices takes (only 10 departments have one). */
const NOTICE_KEY: Record<string, keyof typeof DEPARTMENT_SLUGS> = {
  "Department of Yarn Engineering": "yarn",
  "Department of Fabric Engineering": "fabric",
  "Department of Wet Process Engineering": "wet_process",
  "Department of Apparel Engineering": "apparel",
  "Department of Textile Fashion & Design": "fashion_design",
  "Department of Textile Engineering Management": "management",
  "Department of Textile Machinery Design & Maintenance": "machinery",
  "Department of Industrial & Production Engineering": "industrial_production",
  "Department of Dyes and Chemical Engineering": "dyes_chemical",
  "Department of Environmental Science & Engineering": "environmental",
};

const GROUPS = ["About", "Departments", "Offices", "Halls", "Programs", "Research", "Students & services"] as const;

function personLine(p: Person, withUnit = false): string {
  const bits = [`- ${p.name}${p.designation ? ` — ${p.designation}` : ""}${withUnit ? ` (${p.unit})` : ""}`];
  if (p.emails.length) bits.push(`  email: ${p.emails.join(", ")}`);
  if (p.interests.length) bits.push(`  interests: ${p.interests.slice(0, 5).join("; ")}`);
  if (p.courses.length) bits.push(`  courses: ${p.courses.slice(0, 6).join("; ")}`);
  return bits.join("\n");
}

function headLine(page: SitePage): string {
  return page.head ? `Head: ${page.head.name}, ${page.head.role}${page.head.email ? ` (${page.head.email})` : ""}` : "";
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}\n… (truncated; set max_chars higher for more)` : s);

export function registerButexSiteTools(server: McpServer) {
  server.registerTool(
    "butex_directory",
    {
      title: "BUTEX directory",
      description:
        "Map of the official BUTEX website: faculties and their departments, offices (VC, registrar, exam, accounts, proctor, DSW, library, medical, transport…), residential halls, programs, research and conferences, admission, forms, fees payment, affiliated colleges, plus the university's address, phone and admission helpline. Use to answer 'what departments does BUTEX have', 'how do I contact BUTEX', or to find the right page before butex_page / butex_department.",
      inputSchema: {
        group: z.enum(GROUPS).optional().describe("Omit for everything."),
      },
      annotations: { title: "BUTEX directory", ...READ_ONLY },
    },
    guard("butex_directory", async ({ group }) => {
      const links = directory().filter((l) => !group || l.group === group);
      const out: string[] = [`BUTEX website directory — today ${todayDhaka()}`];
      for (const g of GROUPS) {
        const rows = links.filter((l) => l.group === g);
        if (!rows.length) continue;
        out.push(`\n## ${g}`);
        if (g === "Departments") {
          for (const fac of [...new Set(rows.map((r) => r.parent))]) {
            out.push(`${fac}:`);
            out.push(...rows.filter((r) => r.parent === fac).map((r) => `  - ${r.label} — ${r.url}`));
          }
        } else out.push(...rows.map((r) => `- ${r.label} — ${r.url}`));
      }
      if (!group || group === "Programs") out.push(`\n## Affiliated colleges (${AFFILIATED_COLLEGES.length})`, ...AFFILIATED_COLLEGES.map((c) => `- ${c}`));
      if (!group) {
        out.push(
          "\n## Contact",
          `Address: ${CONTACT.address}`,
          `Phone: ${CONTACT.phone} · Fax: ${CONTACT.fax} · Email: ${CONTACT.email}`,
          `Admission helpline: ${CONTACT.admissionHelpline}`,
          `Map: ${CONTACT.map}`,
        );
      }
      out.push("\nNext: butex_department for a department (head, degrees, faculty), butex_faculty to find a teacher, butex_page to read any page above.");
      return text(out.join("\n"));
    }),
  );

  server.registerTool(
    "butex_department",
    {
      title: "BUTEX department profile",
      description:
        "Everything the official site says about one BUTEX department: head and contact, welcome/about, vision and mission, degrees offered (seats, semesters, credits), labs, and the faculty members with designation, official email, research interests and courses. Accepts names or codes: yarn/YE, fabric/FE, wet process/WPE, dyes & chemical/DCE, environmental/ESE, textile materials/TME, apparel/AE, fashion/TFD, TEM, IPE, HSS, machinery/TMDM, physics, chemistry, math.",
      inputSchema: {
        department: z.string().min(2).max(80),
        include: z.enum(["all", "overview", "faculty"]).optional().describe("Default all."),
        max_chars: z.number().int().min(500).max(20000).optional().describe("Overview text length (default 4000)."),
      },
      annotations: { title: "BUTEX department", ...READ_ONLY },
    },
    guard("butex_department", async ({ department, include = "all", max_chars }) => {
      const link = findDepartment(department);
      if (!link) {
        return text(`No BUTEX department matches "${department}". Departments:\n${departments().map((d) => `- ${d.label}`).join("\n")}`);
      }
      const res = await getPage(link);
      const page = res.data;
      const out = [`${link.label} (${link.parent}) — today ${todayDhaka()}`, link.url, headLine(page)].filter(Boolean);
      if (include !== "faculty") out.push("", "## Overview (from the official page)", clip(page.text, clamp(max_chars, 500, 20000, 4000)) || "The page has no text.");
      if (include !== "overview") {
        out.push("", `## Faculty members (${page.people.length})`, page.people.length ? page.people.map((p) => personLine(p)).join("\n") : "None listed on the page.");
        if (page.people.length) out.push("For a full profile (highlights, education, publications) call butex_faculty with the name and detail=true.");
      }
      const key = NOTICE_KEY[link.label];
      out.push("", key ? `Department notices: butex_department_notices with department="${key}".` : "Notices: butex_search_notices with the department name.", freshnessLine(res));
      return text(out.join("\n"));
    }, "Try the department code (e.g. 'WPE') or call butex_directory to see the exact names."),
  );

  server.registerTool(
    "butex_faculty",
    {
      title: "Find BUTEX teachers & staff",
      description:
        "Search the teachers and officials listed on every BUTEX department, office and hall page: by name, research topic (e.g. 'smart textiles', 'color physics', 'supply chain'), designation (professor, lecturer, provost) or department. Returns designation, unit, official email, interests and courses. With detail=true, returns the full profile of the best match (professional highlights, education, publications).",
      inputSchema: {
        name: z.string().max(80).optional(),
        topic: z.string().max(80).optional().describe("Research interest or course."),
        designation: z.string().max(40).optional(),
        department: z.string().max(80).optional().describe("Department, office or hall."),
        detail: z.boolean().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
      annotations: { title: "BUTEX faculty", ...READ_ONLY },
    },
    guard("butex_faculty", async ({ name, topic, designation, department, detail, limit }) => {
      if (!name && !topic && !designation && !department) return text("Give at least one of name, topic, designation or department.");
      const idx = await peopleIndex();
      const hits = searchPeople(idx.data, { name, topic, designation, unit: department });
      if (!hits.length) {
        return text(`No one on the BUTEX site matches that. Try fewer words, only the surname, or a broader topic.\n\nSearched ${idx.data.length} people across department, office and hall pages.\n${freshnessLine(idx)}`);
      }
      if (detail) {
        const p = hits[0]!;
        const unit = await getPage({ label: p.unit, url: p.unitUrl, group: "Departments" });
        const full = unit.data.people.find((x) => x.name === p.name) ?? p;
        return text(
          [
            `${full.name} — ${full.designation}, ${full.unit}`,
            full.unitUrl,
            full.emails.length ? `Official email: ${full.emails.join(", ")}` : "",
            full.links.length ? `Profiles: ${full.links.join(" · ")}` : "",
            "",
            full.profile || "The site has no detailed profile for this person.",
            hits.length > 1 ? `\nOther matches: ${hits.slice(1, 6).map((h) => `${h.name} (${h.unit})`).join("; ")}` : "",
            freshnessLine(unit),
          ].filter(Boolean).join("\n"),
        );
      }
      const shown = hits.slice(0, clamp(limit, 1, 50, 15));
      return text(
        [
          `BUTEX people matching your search — ${hits.length} found${hits.length > shown.length ? `, showing ${shown.length}` : ""}.`,
          shown.map((p) => personLine(p, true)).join("\n"),
          "Use detail=true with a name for the full profile. Only official @butex.edu.bd emails are shown.",
          freshnessLine(idx),
        ].join("\n\n"),
      );
    }, "The first search builds an index of ~40 pages and can take a while; try again in a moment."),
  );

  server.registerTool(
    "butex_page",
    {
      title: "Read a BUTEX page",
      description:
        "Read any page of the official BUTEX website by name or URL: the VC's or registrar's message, history, syndicate, offices (exam, registrar, accounts, proctor, DSW, ORE, IQAC, TTCS, library, medical center, transport), residential halls (provost, house tutors), programs, collaborations (HELD, KiK), the BJTSE journal, downloadable forms and NOC/GO. Returns the page text, the people listed, and any PDF/forms linked. Use butex_department for departments.",
      inputSchema: {
        page: z.string().min(2).max(300).describe("A name like 'examination office', 'osmani hall', 'VC message', 'downloadable forms', or a www.butex.edu.bd URL."),
        max_chars: z.number().int().min(500).max(20000).optional().describe("Default 6000."),
      },
      annotations: { title: "BUTEX page", ...READ_ONLY },
    },
    guard("butex_page", async ({ page, max_chars }) => {
      const link = findLink(page);
      if (!link) return text(`No BUTEX page matches "${page}". Call butex_directory for the list of pages.`);
      if (!isSitePage(link.url) || /\.(pdf|docx?)$/i.test(link.url)) {
        return text(`${link.label} is not a readable butex.edu.bd page: ${link.url}\nGive the user the link.${/\.pdf$/i.test(link.url) ? " It's a PDF; butex_read_notice can extract text only from notices." : ""}`);
      }
      const res = await getPage(link);
      const p = res.data;
      const body = p.text.replace(/\s+/g, "").length > 40 ? clip(p.text, clamp(max_chars, 500, 20000, 6000)) : "";
      const out = [`${p.title} — today ${todayDhaka()}`, p.url, headLine(p)].filter(Boolean);
      out.push("", body || "The official page has no text of its own (it's a banner or an empty template). Check notices instead: butex_search_notices with the topic, e.g. the page name.");
      if (p.people.length) out.push("", `## People (${p.people.length})`, p.people.map((x) => personLine(x)).join("\n"));
      if (p.files.length) out.push("", "## Files on the page", p.files.map((f) => `- ${f.label} — ${f.url}`).join("\n"));
      out.push("", freshnessLine(res));
      return text(out.join("\n"));
    }),
  );
}
