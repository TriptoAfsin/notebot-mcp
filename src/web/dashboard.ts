import { env } from "../env";
import { VERSION } from "../version";
import { brand, copyBtn, esc, head, ICON } from "./pages";

export type ToolDoc = { name: string; title: string; description: string };
export type ServerDoc = { id: string; name: string; tools: ToolDoc[]; guidelines: string };
export type DashboardData = { servers: ServerDoc[]; skillVersion: string };

function snippet(id: string, label: string, body: string) {
  return `<div class="snippet-wrap">
  <header><span class="label">${esc(label)}</span>${copyBtn(`#${id}`)}</header>
  <pre class="snippet" id="${id}" data-template="${esc(body)}">${esc(body)}</pre>
</div>`;
}

type UseCase = { who: string; ask: string; get: string };
type UseCaseGroup = { server: string; endpoint: string; blurb: string; cases: UseCase[] };

// Real scenarios only: each one maps to a tool that exists today.
const USE_CASES: UseCaseGroup[] = [
  {
    server: "BUTEX MCP",
    endpoint: "/butex/mcp",
    blurb: "The whole official butex.edu.bd site in plain words: notices (scans opened and read), departments, teachers, offices and halls. Every answer links the original.",
    cases: [
      { who: "Results day", ask: "Did the L4-T1 results come out?", get: "The matching result notices with their posting dates and official links." },
      { who: "Exam planning", ask: "When is the L2-T2 final exam routine?", get: "The newest exam schedule, with dates read from the scanned notice." },
      { who: "Term deadlines", ask: "When do BSc classes end and when is the entry form due?", get: "The class-completion notice with each date quoted as printed." },
      { who: "Department", ask: "Tell me about the Wet Process department.", get: "Head and contact, degrees with seats and credits, and the faculty list." },
      { who: "Find a teacher", ask: "Who at BUTEX works on smart textiles?", get: "Teachers across departments with that research interest, with official emails." },
      { who: "Offices & halls", ask: "Who is the exam controller, and how do I reach them?", get: "The Examination Office page: officers, designations and official contacts." },
    ],
  },
  {
    server: "NoteBot knowledge base",
    endpoint: "/notebot/mcp",
    blurb: "Notes, books, lab reports and previous questions shared by BUTEX students, plus study plans built from them.",
    cases: [
      { who: "Find notes", ask: "YM-I notes for Level 2", get: "Topic-by-topic note links for the subject, plus its books." },
      { who: "Lab week", ask: "Lab reports for Phy-I", get: "Every lab report for that subject, with links." },
      { who: "Before finals", ask: "Previous questions for FM-I", get: "Question banks and suggestions shared for that subject." },
      { who: "Syllabus", ask: "What's in the Level 3 syllabus?", get: "The syllabus for that level and batch, with links." },
      { who: "Study plan", ask: "Finals in 10 days: YM-I and FM-I. Plan it.", get: "A day-by-day plan built from real topics, each day linked to its notes." },
      { who: "Not sure what next", ask: "What are Level 3 students studying most?", get: "The most-opened notes and labs, so you can follow what others use." },
    ],
  },
];

function useCasesSection() {
  const groups = USE_CASES.map(
    (g) => `<div class="tool-group">
  <h3>${esc(g.server)} <code class="endpoint-tag">${esc(g.endpoint)}</code></h3>
  <p class="uc-blurb">${esc(g.blurb)}</p>
  <ul class="uc">${g.cases
    .map((c) => `<li><span class="label">${esc(c.who)}</span><p class="uc-ask">&ldquo;${esc(c.ask)}&rdquo;</p><p class="uc-get">${esc(c.get)}</p></li>`)
    .join("")}</ul>
</div>`,
  ).join("");
  return `<section class="section" id="use-cases" aria-labelledby="uc-h">
    <div class="wrap">
      <div class="section__head"><h2 id="uc-h">What you can ask</h2><p>Type these as you would to a senior. The AI picks the right tool, and the answer always links to the source. More in the <a href="https://github.com/TriptoAfsin/notebot-mcp/blob/main/docs/use-cases.md">use-case guide</a>.</p></div>
      ${groups}
    </div>
  </section>`;
}

type Tab = { id: string; label: string; steps: string[]; snippets: [string, string][] };

function clientTabs(butex: string, notebot: string): Tab[] {
  const k = "YOUR_KEY";
  const auth = { Authorization: `Bearer ${k}` };
  return [
    {
      id: "claude",
      label: "Claude web & app",
      steps: [
        "Open claude.ai → Settings → Connectors → <b>Add custom connector</b>.",
        "Add one connector per server: name it <b>BUTEX MCP</b> or <b>NoteBot knowledge base</b>, and paste its URL below. Leave the OAuth fields empty.",
        "Click <b>Connect</b>. A NoteBot page opens; enter your email to approve.",
        "Connectors you add on the web also show up in the Claude desktop and mobile apps. Turn them on per chat from the tools menu.",
      ],
      snippets: [["BUTEX MCP URL", butex], ["NoteBot knowledge base URL", notebot]],
    },
    {
      id: "chatgpt",
      label: "ChatGPT web & app",
      steps: [
        "Open chatgpt.com → Settings → <b>Apps &amp; Connectors</b> → Advanced settings, and turn on <b>Developer mode</b>.",
        "Back in Apps &amp; Connectors, choose <b>Create</b>. Add one app per server, with the URLs below.",
        "Set Authentication to <b>OAuth</b>, tick that you trust the app, then create it. Approve with your email on the NoteBot page.",
        "Pick them from the <b>+</b> menu in a chat. They sync to the ChatGPT mobile and desktop apps.",
      ],
      snippets: [["BUTEX MCP URL", butex], ["NoteBot knowledge base URL", notebot]],
    },
    {
      id: "code",
      label: "Claude Code",
      steps: [
        "Get a key above (or leave out the header and Claude Code runs the OAuth sign-in when you type <code>/mcp</code>).",
        "Run both commands. Add <code>--scope user</code> to make them available in every project.",
      ],
      snippets: [
        [
          "Terminal",
          [`claude mcp add --transport http butex ${butex} --header "Authorization: Bearer ${k}"`, `claude mcp add --transport http notebot ${notebot} --header "Authorization: Bearer ${k}"`].join("\n"),
        ],
      ],
    },
    {
      id: "editors",
      label: "Cursor · VS Code",
      steps: ["Paste into <code>~/.cursor/mcp.json</code> (Cursor) or <code>.vscode/mcp.json</code> (VS Code).", "Reload the window; the tools appear under <b>butex</b> and <b>notebot</b>."],
      snippets: [
        ["Cursor · mcp.json", JSON.stringify({ mcpServers: { butex: { url: butex, headers: auth }, notebot: { url: notebot, headers: auth } } }, null, 2)],
        ["VS Code · mcp.json", JSON.stringify({ servers: { butex: { type: "http", url: butex, headers: auth }, notebot: { type: "http", url: notebot, headers: auth } } }, null, 2)],
      ],
    },
    {
      id: "other",
      label: "Any client",
      steps: [
        "Streamable HTTP transport, stateless, JSON responses. One key works on both servers.",
        "Send the key as <code>Authorization: Bearer …</code> or <code>x-api-key</code>. Clients that only take a URL can put it in <code>?key=</code>.",
      ],
      snippets: [
        ["URLs with key", `${butex}?key=${k}\n${notebot}?key=${k}`],
        [
          "curl",
          `curl -s ${notebot} \\\n  -H "Authorization: Bearer ${k}" \\\n  -H "Content-Type: application/json" \\\n  -H "Accept: application/json, text/event-stream" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
        ],
      ],
    },
  ];
}

export function dashboardPage(d: DashboardData): Response {
  const butex = `${env.publicUrl}/butex/mcp`;
  const notebot = `${env.publicUrl}/notebot/mcp`;
  const tabs = clientTabs(butex, notebot);

  const tabButtons = tabs
    .map((t, i) => `<button class="tab" role="tab" id="tab-${t.id}" aria-controls="panel-${t.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(t.label)}</button>`)
    .join("");
  const panels = tabs
    .map(
      (t, i) => `<div class="panel" role="tabpanel" id="panel-${t.id}" aria-labelledby="tab-${t.id}"${i === 0 ? "" : " hidden"}>
  <ol class="steps">${t.steps.map((s) => `<li>${s}</li>`).join("")}</ol>
  <div class="snippet-wrap">${t.snippets.map(([label, body], j) => snippet(`snip-${t.id}-${j}`, label, body)).join("")}</div>
</div>`,
    )
    .join("");

  const toolGroups = d.servers
    .map(
      (srv) => `<div class="tool-group">
  <h3>${esc(srv.name)} <code class="endpoint-tag">/${esc(srv.id)}/mcp</code></h3>
  <ul class="tools">${srv.tools.map((t) => `<li><code>${esc(t.name)}</code><p>${esc(t.description)}</p></li>`).join("")}</ul>
</div>`,
    )
    .join("");

  const guidelineCards = d.servers
    .map((srv) => `<div class="card"><h3 class="card__title">${esc(srv.name)}</h3><pre class="guidelines">${esc(srv.guidelines)}</pre></div>`)
    .join("");

  const html = `${head("NoteBot MCP — BUTEX info and study notes for your AI", "Free MCP servers for BUTEX students: official notices, routines, results, departments and faculty, plus the NoteBot knowledge base of notes, lab reports and study plans. Works in Claude, ChatGPT, Claude Code and Cursor.")}
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="bar" data-bar>
  <div class="wrap bar__inner">
    ${brand}
    <nav aria-label="Sections">
      <a href="#use-cases">Use cases</a><a href="#connect">Connect</a><a href="#tools">Tools</a><a href="#skill">Skill</a><a href="#guidelines">Guidelines</a><a href="#manage">Your key</a>
    </nav>
    <button class="icon-btn" type="button" data-theme-toggle aria-label="Toggle dark mode">${ICON.sun}${ICON.moon}</button>
  </div>
</header>

<main id="main">
  <div class="wrap work">
    <section class="work__intro rise" aria-labelledby="h1">
      <div class="title-row"><h1 id="h1">Your BUTEX study desk, inside your AI.</h1></div>
      <p class="lede">Two MCP servers for Claude, ChatGPT and your editor. <b>BUTEX MCP</b> reads the official butex.edu.bd site: notices, routines, exam schedules, results, departments, teachers, offices and halls. <b>NoteBot knowledge base</b> serves the notes, books, lab reports and question banks students share, and builds study plans from them.</p>
      <ul class="facts">
        <li>Free. One key, which only needs an email, works on both servers.</li>
        <li>Works in Claude and ChatGPT on web, desktop and mobile, plus Claude Code, Cursor and VS Code.</li>
        <li>Keeps answering from its cache when a source is down, and says when it does.</li>
      </ul>
    </section>

    <section class="card rise" style="--i:2" aria-labelledby="key-h" id="get-key">
      <h2 id="key-h">Get a free key</h2>
      <p class="card__sub">For Claude Code, Cursor and other clients that take a header. Claude and ChatGPT connectors sign you in by themselves, so you don't need one there.</p>
      <form data-key-form novalidate>
        <div class="field">
          <label for="email">Email</label>
          <input class="input" id="email" name="email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" required>
          <span class="hint">Lost your key? Enter the same email and we'll send it back. We may email you NoteBot updates; you can unsubscribe from any email.</span>
        </div>
        <p class="error" data-key-error role="alert"></p>
        <div class="row"><button class="btn btn--primary btn--block" type="submit">${ICON.key}<span class="btn__label">Get my key</span></button></div>
      </form>
      <div class="key-reveal" data-key-reveal hidden>
        <p class="notice">Copy it now. A copy is in your inbox too. It works on both servers, and the snippets below already include it.</p>
        <div class="copy"><code id="new-key"></code>${copyBtn("#new-key")}</div>
        <a class="btn" href="#connect">Set up a client</a>
      </div>
      <div class="key-reveal" data-key-emailed hidden>
        <p class="notice" data-key-emailed-text role="status"></p>
        <a class="btn" href="#connect">Set up a client</a>
      </div>
    </section>

    <section class="work__extras rise" style="--i:3" aria-label="Endpoints and latest notices">
      <div>
        <p class="label">Endpoints</p>
        <div class="copy"><code id="endpoint-butex">${esc(butex)}</code>${copyBtn("#endpoint-butex")}</div>
        <div class="copy"><code id="endpoint-notebot">${esc(notebot)}</code>${copyBtn("#endpoint-notebot")}</div>
      </div>
      <div>
        <p class="label">Latest on the BUTEX board</p>
        <div class="board" data-board aria-live="polite"><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>
      </div>
    </section>
  </div>

  ${useCasesSection()}

  <section class="section" id="connect" aria-labelledby="connect-h">
    <div class="wrap">
      <div class="section__head"><h2 id="connect-h">Connect a client</h2><p>Add one or both servers. Claude and ChatGPT connect through a one-click OAuth sign-in; everything else uses your key. More detail in the <a href="https://github.com/TriptoAfsin/notebot-mcp/blob/main/docs/setup-guide.md">setup guide</a>.</p></div>
      <div class="tabs" role="tablist" aria-label="Clients">${tabButtons}</div>
      ${panels}
    </div>
  </section>

  <section class="section" id="tools" aria-labelledby="tools-h">
    <div class="wrap">
      <div class="section__head"><h2 id="tools-h">Tools</h2><p>Every tool is read-only. BUTEX MCP reads butex.edu.bd's own data feed and pages; NoteBot knowledge base reads the NoteBot engine. Results are cached so neither source gets hammered.</p></div>
      ${toolGroups}
    </div>
  </section>

  <section class="section" id="skill" aria-labelledby="skill-h">
    <div class="wrap two">
      <div class="section__head" style="margin:0"><h2 id="skill-h">Agent skill</h2>
        <p>A <code>SKILL.md</code> that teaches your agent both servers: which tool fits which question, how to read scanned notices, and how to build study plans. Each time it runs, it checks <code>/skill/version.json</code> and updates itself when a newer version is out.</p>
        <p class="label" style="margin-top:var(--space-sm)">Current version · ${esc(d.skillVersion)}</p>
      </div>
      <div class="snippet-wrap">
        ${snippet("skill-sh", "macOS · Linux · Git Bash", `curl -fsSL ${env.publicUrl}/skill/install.sh | sh`)}
        ${snippet("skill-ps", "Windows PowerShell", `irm ${env.publicUrl}/skill/install.ps1 | iex`)}
        <div class="row">
          <a class="btn" href="/skill/butex-notebot.zip" download>${ICON.download}<span class="btn__label">Zip for claude.ai</span></a>
          <a class="btn" href="/skill/SKILL.md">View SKILL.md</a>
        </div>
        <p class="hint">On claude.ai: Settings → Capabilities → Skills → Upload skill, and pick the zip.</p>
      </div>
    </div>
  </section>

  <section class="section" id="guidelines" aria-labelledby="g-h">
    <div class="wrap">
      <div class="section__head"><h2 id="g-h">Agent guidelines</h2><p>Each server sends these instructions to every client when it connects, so agents behave the same everywhere. They're also in <a href="https://github.com/TriptoAfsin/notebot-mcp/blob/main/AGENTS.md">AGENTS.md</a>.</p></div>
      <div class="two">${guidelineCards}</div>
    </div>
  </section>

  <section class="section" id="manage" aria-labelledby="m-h">
    <div class="wrap two">
      <div class="section__head" style="margin:0"><h2 id="m-h">Your key</h2><p>Paste a key to see its usage, or revoke it if it leaked. You need the key itself to revoke it, so nobody who only knows your email can kill your keys. Lost it? Request it again with the same email and it's sent to your inbox.</p></div>
      <form class="card" data-manage-form novalidate>
        <div class="field" style="margin-top:0">
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
    </div>
  </section>
</main>

<footer class="foot">
  <div class="wrap">
    <span>NoteBot MCP v${esc(VERSION)}</span>
    <span>A student project. Not an official BUTEX service. Notices come from <a href="https://www.butex.edu.bd">butex.edu.bd</a>; notes from the NoteBot community.</span>
    <a href="https://butexnotebot.com">butexnotebot.com</a>
    <a href="/health">Status</a>
  </div>
</footer>
<script src="/app.js?v=${VERSION}" defer></script>
</body>
</html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
}

/** Small single-card page for emailed links (rotate, unsubscribe). */
export function messagePage(o: { title: string; body: string; key?: string; form?: { action: string; t: string; label: string } }, status = 200): Response {
  const key = o.key ? `<div class="copy" style="margin-top:var(--space-md)"><code id="rotated-key">${esc(o.key)}</code>${copyBtn("#rotated-key")}</div>` : "";
  const form = o.form
    ? `<form method="post" action="${esc(o.form.action)}"><input type="hidden" name="t" value="${esc(o.form.t)}"><div class="row"><button class="btn btn--primary" type="submit">${esc(o.form.label)}</button></div></form>`
    : "";
  const html = `${head(`${o.title} · NoteBot MCP`, o.title)}
<body>
<main class="consent"><div class="card rise">${brand}<h1>${esc(o.title)}</h1><p>${esc(o.body)}</p>${key}${form}<p class="fine"><a href="/">Back to the dashboard</a></p></div></main>
<script src="/app.js?v=${VERSION}" defer></script>
</body></html>`;
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-frame-options": "DENY",
      "content-security-policy": "frame-ancestors 'none'",
      // keep the one-time token in the URL from leaking to linked sites
      "referrer-policy": "no-referrer",
    },
  });
}
