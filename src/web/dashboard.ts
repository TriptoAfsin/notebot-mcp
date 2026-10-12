import { env } from "../env";
import { ASSET_VERSION, VERSION } from "../version";
import { GLYPH, type GlyphId } from "./glyphs";
import { guideHtml, keyForm, SERVERS, serverUrl, snippet, type ServerId } from "./guide";
import { brand, copyBtn, esc, head, ICON } from "./pages";

export type ToolDoc = { name: string; title: string; description: string };
export type ServerDoc = { id: string; name: string; tools: ToolDoc[]; guidelines: string };
export type DashboardData = { servers: ServerDoc[]; skillVersion: string };

type Route = "home" | "connect" | "ask" | "tools" | "agent" | "key";

const NAV: [Route, string, string][] = [
  ["ask", "/ask", "What to ask"],
  ["tools", "/tools", "Tools"],
  ["agent", "/agent", "Agent skill"],
  ["key", "/key", "Your key"],
];

/** Shared shell: header, footer, one entrance per route. Cross-document view transitions animate between routes. */
function layout(o: { title: string; description: string; route: Route; body: string; extra?: string }): Response {
  const links = NAV.map(([r, href, label]) => `<a href="${href}"${o.route === r ? ' aria-current="page"' : ""}>${label}</a>`).join("");
  const html = `${head(o.title, o.description)}
<body data-route="${o.route}">
<a class="skip" href="#main">Skip to content</a>
<header class="bar" data-bar>
  <div class="wrap bar__inner">
    ${brand}
    <nav class="bar__nav" aria-label="Pages">${links}</nav>
    <a class="btn btn--primary btn--sm bar__cta" href="/#choose">Set up</a>
    <button class="icon-btn" type="button" data-theme-toggle aria-label="Toggle dark mode">${ICON.sun}${ICON.moon}</button>
  </div>
</header>
<main id="main" class="page">
${o.body}
</main>
<footer class="foot">
  <div class="wrap">
    <span>NoteBot MCP v${esc(VERSION)}</span>
    <span>An independent, community-driven project. Not an official BUTEX service. Notices come from <a href="https://www.butex.edu.bd">butex.edu.bd</a>; notes from the NoteBot community.</span>
    <a href="https://butexnotebot.com">butexnotebot.com</a>
    <a href="/health">Status</a>
  </div>
</footer>
${o.extra ?? ""}
<script src="/app.js?v=${ASSET_VERSION}" defer></script>
</body>
</html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
}

const toolCount = (d: DashboardData, id: ServerId) => d.servers.find((s) => s.id === id)?.tools.filter((t) => !t.name.includes("·")).length ?? 0;

// ── Home: pick a server ─────────────────────────────────────────────────────

function serverCard(d: DashboardData, id: ServerId, i: number) {
  const s = SERVERS[id];
  return `<article class="srv rise" style="--i:${i + 1}" data-srv="${id}">
  <div class="srv__head">
    <img class="srv__icon" style="view-transition-name: icon-${id}" src="${s.icon}" width="56" height="56" alt="">
    <div><h2 class="srv__name" style="view-transition-name: name-${id}">${esc(s.name)}</h2><p class="srv__meta">${toolCount(d, id)} tools · ${esc(s.source)}</p></div>
  </div>
  <p class="srv__pitch">${esc(s.pitch)}</p>
  <ul class="srv__asks" aria-label="You could ask">${s.asks.map((a, j) => `<li style="--j:${j}">${esc(a)}</li>`).join("")}</ul>
  <div class="srv__foot">
    <a class="btn btn--primary srv__go" href="/connect/${id}" data-setup="${id}">Set up ${esc(s.short)}<span class="btn__arrow" aria-hidden="true">→</span></a>
    <a class="srv__more" href="/ask#${id}">What it can do</a>
  </div>
</article>`;
}

const FACTS: { icon: GlyphId; title: string; text: string }[] = [
  { icon: "jokes", title: "Free", text: "One email gets a key for both servers. Claude, ChatGPT and Gemini sign you in by themselves." },
  { icon: "notes", title: "Safe", text: "Nothing can be changed on butex.edu.bd or in NoteBot. Revoke access any time." },
  { icon: "labs", title: "Checkable", text: "Every answer links the official notice or the note it came from." },
  { icon: "results", title: "Steady", text: "When a source is down it answers from cache and says so." },
];

export function dashboardPage(d: DashboardData): Response {
  const body = `<section class="wrap hero">
  <h1 class="hero__title rise">Ask your AI about BUTEX.</h1>
  <p class="hero__lede rise" style="--i:1">Two free MCP servers that plug into Claude, ChatGPT, Gemini and your code editor. Pick one, or set up both: one email covers them.</p>
  <ol class="hero__steps rise" style="--i:2" aria-label="How to start">
    <li><span class="hero__num" aria-hidden="true">1</span><div><b>Get your free key</b><span>Enter your email. One key works for both servers.</span></div><a class="btn btn--primary btn--sm" href="/key">Get your key<span class="btn__arrow" aria-hidden="true">→</span></a></li>
    <li><span class="hero__num" aria-hidden="true">2</span><div><b>Set up a server</b><span>Pick BUTEX MCP or NoteBot MCP below and follow the steps for your app.</span></div><a class="btn btn--quiet btn--sm" href="#choose">Pick a server<span class="btn__arrow" aria-hidden="true">↓</span></a></li>
  </ol>
</section>

<section class="wrap choose" id="choose" aria-label="Pick a server">
  ${serverCard(d, "butex", 1)}
  ${serverCard(d, "notebot", 2)}
</section>

<section class="wrap facts-row" aria-label="How it behaves">
  ${FACTS.map((f, i) => `<div class="kpi rise" style="--i:${i + 4}"><span class="kpi__icon" aria-hidden="true">${GLYPH[f.icon]}</span><b>${f.title}</b><span class="kpi__text">${f.text}</span></div>`).join("")}
</section>

<section class="wrap board-row rise" style="--i:5" aria-labelledby="board-h">
  <div class="board-row__head"><h2 id="board-h">Latest on the BUTEX board</h2><a href="/ask#butex">Ask about these →</a></div>
  <div class="board" data-board aria-live="polite"><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>
</section>`;

  // Both guides ride along as inert templates; the setup sheet clones the one you pick.
  const sheet = `<dialog class="sheet" data-sheet aria-labelledby="sheet-title">
  <div class="sheet__panel">
    <header class="sheet__head">
      <img class="sheet__icon" data-sheet-icon src="" width="40" height="40" alt="">
      <div class="sheet__titles"><h2 id="sheet-title" data-sheet-title></h2><a class="sheet__full" data-sheet-full href="#">Open as a page ↗</a></div>
      <button class="icon-btn sheet__close" type="button" data-sheet-close aria-label="Close">${ICON.close}</button>
    </header>
    <div class="sheet__body" data-sheet-body></div>
  </div>
</dialog>
${(["butex", "notebot"] as ServerId[]).map((id) => `<template id="tpl-${id}" data-name="${esc(SERVERS[id].name)}" data-icon="${SERVERS[id].icon}">${guideHtml(id, "sheet")}</template>`).join("")}`;

  return layout({
    title: "NoteBot MCP: BUTEX info and study notes in your AI",
    description: "Free MCP servers for BUTEX students: official notices, routines, results, departments and faculty, plus NoteBot of notes, lab reports and study plans. Works in Claude, ChatGPT, Gemini, Antigravity, Claude Code and Cursor.",
    route: "home",
    body,
    extra: sheet,
  });
}

// ── /connect/<id>: the guide as a full page ─────────────────────────────────

export function connectPage(d: DashboardData, id: ServerId, app?: string): Response {
  const s = SERVERS[id];
  const other = SERVERS[id === "butex" ? "notebot" : "butex"];
  const body = `<section class="wrap page-head connect-head">
  <a class="back rise" href="/#choose">← Both servers</a>
  <div class="connect-head__id rise" style="--i:1">
    <img class="srv__icon" style="view-transition-name: icon-${id}" src="${s.icon}" width="56" height="56" alt="">
    <div><h1 style="view-transition-name: name-${id}">Set up ${esc(s.name)}</h1><p class="srv__meta">${toolCount(d, id)} tools · ${esc(s.source)}</p></div>
  </div>
  <div class="copy connect-head__url rise" style="--i:2"><code id="url-${id}">${esc(serverUrl(id))}</code>${copyBtn(`#url-${id}`)}</div>
</section>
<section class="wrap rise" style="--i:3">${guideHtml(id, "page", app)}</section>
<section class="wrap also rise" style="--i:4">
  <img src="${other.icon}" width="32" height="32" alt=""><p>Want ${esc(other.name)} too? The same key works.</p><a class="btn btn--sm" href="/connect/${other.id}">Set up ${esc(other.short)} →</a>
</section>`;
  return layout({ title: `Set up ${s.name} · NoteBot MCP`, description: `Step-by-step setup for ${s.name} in Claude, ChatGPT, Gemini, Antigravity, Claude Code, Cursor and VS Code.`, route: "connect", body });
}

// ── /ask: use cases ─────────────────────────────────────────────────────────

type UseCase = { who: string; ask: string; get: string };

// Real scenarios only: each one maps to a tool that exists today.
const USE_CASES: Record<ServerId, UseCase[]> = {
  butex: [
    { who: "Results day", ask: "Did the L4-T1 results come out?", get: "The matching result notices with their posting dates and official links." },
    { who: "Exam planning", ask: "When is the L2-T2 final exam routine?", get: "The newest exam schedule, with dates read from the scanned notice." },
    { who: "Term deadlines", ask: "When do BSc classes end and when is the entry form due?", get: "The class-completion notice with each date quoted as printed." },
    { who: "Department", ask: "Tell me about the Wet Process department.", get: "Head and contact, degrees with seats and credits, and the faculty list." },
    { who: "Find a teacher", ask: "Who at BUTEX works on smart textiles?", get: "Teachers across departments with that research interest, with official emails." },
    { who: "Offices & halls", ask: "Who is the exam controller, and how do I reach them?", get: "The Examination Office page: officers, designations and official contacts." },
  ],
  notebot: [
    { who: "Find notes", ask: "YM-I notes for Level 2", get: "Topic-by-topic note links for the subject, plus its books." },
    { who: "Lab week", ask: "Lab reports for Phy-I", get: "Every lab report for that subject, with links." },
    { who: "Before finals", ask: "Previous questions for FM-I", get: "Question banks and suggestions shared for that subject." },
    { who: "Syllabus", ask: "What's in the Level 3 syllabus?", get: "The syllabus for that level and batch, with links." },
    { who: "Study plan", ask: "Finals in 10 days: YM-I and FM-I. Plan it.", get: "A day-by-day plan built from real topics, each day linked to its notes." },
    { who: "Not sure what next", ask: "What are Level 3 students studying most?", get: "The most-opened notes and labs, so you can follow what others use." },
  ],
};

export function askPage(): Response {
  const group = (id: ServerId, i: number) => `<section class="ask-group rise" style="--i:${i + 2}" id="${id}" data-filter-item="${id}">
  <div class="ask-group__head"><img src="${SERVERS[id].icon}" width="32" height="32" alt=""><h2>${esc(SERVERS[id].name)}</h2><a class="btn btn--sm" href="/connect/${id}">Set up →</a></div>
  <ul class="asks">${USE_CASES[id]
    .map((c) => `<li><span class="label">${esc(c.who)}</span><p class="asks__q">${esc(c.ask)}</p><p class="asks__a">${esc(c.get)}</p></li>`)
    .join("")}</ul>
</section>`;
  const body = `<section class="wrap page-head">
  <h1 class="rise">What you can ask</h1>
  <p class="page-head__lede rise" style="--i:1">Type it the way you'd ask a senior. The AI picks the right tool, and the answer links to its source. More in the <a href="https://github.com/TriptoAfsin/notebot-mcp/blob/main/docs/use-cases.md">use-case guide</a>.</p>
  <div class="seg rise" style="--i:1" role="group" aria-label="Show" data-filter>
    <button type="button" aria-pressed="true" data-filter-btn="all">Both</button>
    <button type="button" aria-pressed="false" data-filter-btn="butex">BUTEX MCP</button>
    <button type="button" aria-pressed="false" data-filter-btn="notebot">NoteBot MCP</button>
  </div>
</section>
<div class="wrap ask-wrap">${group("butex", 0)}${group("notebot", 1)}</div>`;
  return layout({ title: "What you can ask · NoteBot MCP", description: "Real questions BUTEX students ask through the BUTEX MCP and NoteBot.", route: "ask", body });
}

// ── /tools ──────────────────────────────────────────────────────────────────

export function toolsPage(d: DashboardData): Response {
  const groups = d.servers
    .map(
      (srv, i) => `<section class="tool-group rise" style="--i:${i + 1}" id="${esc(srv.id)}">
  <div class="tool-group__head"><h2>${esc(srv.name)}</h2><code class="endpoint-tag">/${esc(srv.id)}/mcp</code></div>
  <ul class="tools">${srv.tools.map((t) => `<li><code>${esc(t.name)}</code><p>${esc(t.description)}</p></li>`).join("")}</ul>
  <details class="help guidelines-box"><summary>Instructions this server gives every AI</summary><pre class="guidelines">${esc(srv.guidelines)}</pre></details>
</section>`,
    )
    .join("");
  const body = `<section class="wrap page-head">
  <h1 class="rise">Tools</h1>
  <p class="page-head__lede rise" style="--i:1">Every tool only reads. BUTEX MCP reads butex.edu.bd's own feed and pages; NoteBot reads the NoteBot engine. Results are cached so neither source gets hammered. The server instructions are also in <a href="https://github.com/TriptoAfsin/notebot-mcp/blob/main/AGENTS.md">AGENTS.md</a>.</p>
</section>
<div class="wrap">${groups}</div>`;
  return layout({ title: "Tools · NoteBot MCP", description: "Every tool the BUTEX MCP and NoteBot expose, and the instructions they give AI apps.", route: "tools", body });
}

// ── /agent: skill ───────────────────────────────────────────────────────────

/** Step-by-step setup an agent can follow on its own; served at /setup.md. */
export function agentSetup() {
  const u = env.publicUrl;
  return `# Set up BUTEX NoteBot

Do these steps for the user.

1. Install the agent skill "butex-notebot":
   - macOS / Linux / Git Bash: \`curl -fsSL ${u}/skill/install.sh | sh\`
   - Windows PowerShell: \`irm ${u}/skill/install.ps1 | iex\`
   - Any other agent: download ${u}/skill/butex-notebot.zip and unzip it into your skills folder. The skill itself is ${u}/skill/SKILL.md.
2. Add both MCP servers (Streamable HTTP; sign in with OAuth when asked):
   - butex: ${u}/butex/mcp
   - notebot: ${u}/notebot/mcp
   - Claude Code: \`claude mcp add --transport http butex ${u}/butex/mcp\` and \`claude mcp add --transport http notebot ${u}/notebot/mcp\`
   - Antigravity: add \`{"serverUrl": "${u}/butex/mcp"}\` (and the notebot one) under \`mcpServers\` in its mcp_config.json, then Authenticate.
   - No OAuth support: ask the user for their free key (${u}/key) and send it as the header \`Authorization: Bearer <key>\`.
3. Read ${u}/llms.txt for what each server does.
4. Confirm it works by calling butex_status and notebot_status, then tell the user what they can ask.
`;
}

export function agentPage(d: DashboardData): Response {
  const prompt = `Set up BUTEX NoteBot for me: follow ${env.publicUrl}/setup.md (installs the butex-notebot skill and adds the BUTEX and NoteBot MCP servers).`;
  const body = `<section class="wrap page-head">
  <h1 class="rise">Agent skill</h1>
  <p class="page-head__lede rise" style="--i:1">A <code>SKILL.md</code> that teaches your agent both servers: which tool fits which question, how to read scanned notices, and how to build study plans. It checks <code>/skill/version.json</code> each run and updates itself.</p>
  <p class="label rise" style="--i:1">Current version · ${esc(d.skillVersion)}</p>
</section>
<section class="wrap agent-grid">
  <div class="card rise" style="--i:2">
    <h2>Hand it to your agent</h2>
    <p class="card__sub">Paste this into Claude Code, Codex, Cursor or any coding agent. It installs the skill and adds both servers.</p>
    ${snippet("skill-agent", "Prompt", prompt)}
  </div>
  <div class="card rise" style="--i:3">
    <h2>Install it yourself</h2>
    ${snippet("skill-sh", "macOS · Linux · Git Bash", `curl -fsSL ${env.publicUrl}/skill/install.sh | sh`)}
    ${snippet("skill-ps", "Windows PowerShell", `irm ${env.publicUrl}/skill/install.ps1 | iex`)}
    <div class="row">
      <a class="btn" href="/skill/butex-notebot.zip" download>${ICON.download}<span class="btn__label">Zip for claude.ai</span></a>
      <a class="btn" href="/skill/SKILL.md">View SKILL.md</a>
    </div>
    <p class="hint">On claude.ai: Settings → Capabilities → Skills → Upload skill, and pick the zip.</p>
  </div>
</section>`;
  return layout({ title: "Agent skill · NoteBot MCP", description: "Install the butex-notebot agent skill, or hand the setup to your coding agent.", route: "agent", body });
}

// ── /key ────────────────────────────────────────────────────────────────────

export function keyPage(): Response {
  const body = `<section class="wrap page-head">
  <h1 class="rise">Your key</h1>
  <p class="page-head__lede rise" style="--i:1">Claude, ChatGPT and Gemini sign you in by themselves, so you only need a key for Claude Code, Cursor, Antigravity and other apps that take a header. One key works on both servers.</p>
</section>
<section class="wrap key-grid">
  <div class="card rise" style="--i:2">
    <h2>Get a free key</h2>
    <p class="card__sub">Lost yours? Enter the same email and it's emailed back, never shown here. We may email NoteBot updates; unsubscribe from any email.</p>
    ${keyForm("main")}
    <div class="key-next" data-key-next hidden>
      <p class="label">Next: add it to your app</p>
      <div class="picker">
        <a class="pick" href="/connect/butex"><img src="${SERVERS.butex.icon}" width="20" height="20" alt="">Set up BUTEX MCP<span aria-hidden="true">→</span></a>
        <a class="pick" href="/connect/notebot"><img src="${SERVERS.notebot.icon}" width="20" height="20" alt="">Set up NoteBot<span aria-hidden="true">→</span></a>
      </div>
    </div>
  </div>
  <form class="card rise" style="--i:3" data-manage-form novalidate>
    <h2>Check or revoke a key</h2>
    <p class="card__sub">You need the key itself to revoke it, so nobody who only knows your email can kill your keys.</p>
    <div class="field">
      <label for="mkey">API key</label>
      <input class="input" id="mkey" name="key" autocomplete="off" spellcheck="false" placeholder="nbk_f_…" required>
    </div>
    <p class="error" data-manage-error role="alert" style="margin-top:var(--space-xs)"></p>
    <dl class="usage" data-usage hidden></dl>
    <div class="row">
      <button class="btn" type="submit" name="op" value="usage"><span class="btn__label">Check usage</span></button>
      <button class="btn btn--danger" type="submit" name="op" value="revoke"><span class="btn__label">Revoke</span></button>
    </div>
  </form>
</section>`;
  return layout({ title: "Your key · NoteBot MCP", description: "Get a free NoteBot MCP key, or check and revoke one.", route: "key", body });
}

/** Small single-card page for emailed links (rotate, unsubscribe). */
export function messagePage(o: { title: string; body: string; key?: string; form?: { action: string; t: string; label: string } }, status = 200): Response {
  const key = o.key ? `<div class="copy" style="margin-top:var(--space-md)"><code id="rotated-key">${esc(o.key)}</code>${copyBtn("#rotated-key")}</div>` : "";
  const form = o.form
    ? `<form method="post" action="${esc(o.form.action)}"><input type="hidden" name="t" value="${esc(o.form.t)}"><div class="row"><button class="btn btn--primary" type="submit">${esc(o.form.label)}</button></div></form>`
    : "";
  const html = `${head(`${o.title} · NoteBot MCP`, o.title)}
<body>
<main class="consent"><div class="card rise">${brand}<h1>${esc(o.title)}</h1><p>${esc(o.body)}</p>${key}${form}<p class="fine"><a href="/">Back to NoteBot MCP</a></p></div></main>
<script src="/app.js?v=${ASSET_VERSION}" defer></script>
</body></html>`;
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-frame-options": "DENY",
      "content-security-policy": "frame-ancestors 'none'",
    },
  });
}
