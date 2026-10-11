import { env } from "../env";
import { ASSET_VERSION, VERSION } from "../version";
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

/** Shown with a new (or emailed) key: the short connect guide plus the full-guide link. */
function nextSteps() {
  const guide = `${env.publicUrl}/#connect`;
  return `<div class="key-next">
          <p class="label">Next: connect it</p>
          <ol class="steps">
            <li><b>Claude</b>: Settings → Connectors → Add custom connector, paste an endpoint, then Connect.</li>
            <li><b>ChatGPT</b>: Settings → Security and login → Developer mode on, then chatgpt.com/plugins → + → Add custom MCP server, with OAuth.</li>
            <li><b>Claude Code, Cursor, others</b>: copy a snippet from the guide; your key is already filled in.</li>
          </ol>
          <p class="label">Show me the steps for</p>
          <div class="picker">
            <a class="pick" href="#connect" data-pick="claude">Claude<span aria-hidden="true">→</span></a>
            <a class="pick" href="#connect" data-pick="chatgpt">ChatGPT<span aria-hidden="true">→</span></a>
            <a class="pick" href="#connect" data-pick="other">Something else<span aria-hidden="true">→</span></a>
          </div>
          <p class="hint">Full guide: <a href="#connect">${esc(guide)}</a></p>
        </div>`;
}

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
   - No OAuth support: ask the user for their free key (${u}/#get-key) and send it as the header \`Authorization: Bearer <key>\`.
3. Read ${u}/llms.txt for what each server does.
4. Confirm it works by calling butex_status and notebot_status, then tell the user what they can ask.
`;
}

/** The short prompt the dashboard asks people to paste into their agent. */
function agentPrompt() {
  return `Set up BUTEX NoteBot for me: follow ${env.publicUrl}/setup.md (installs the butex-notebot skill and adds the BUTEX and NoteBot MCP servers).`;
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

type Tab = { id: string; label: string; steps: string[]; snippets: [string, string][]; cards?: boolean; help?: { title: string; items: string[] } };

/** What to type into a client's "add custom MCP server / connector" form, per server. */
const PLUGIN_INFO = [
  { id: "butex", name: "BUTEX MCP", description: "BUTEX notices, results, routines, departments and teachers from butex.edu.bd", icon: "/mcp-icon-butex.png" },
  { id: "notebot", name: "NoteBot knowledge base", description: "BUTEX notes, books, lab reports, question banks and study plans from NoteBot", icon: "/mcp-icon-notebot.png" },
];

function copyField(id: string, label: string, value: string) {
  return `<div class="pfield"><span class="label">${esc(label)}</span><div class="copy"><code id="${id}">${esc(value)}</code>${copyBtn(`#${id}`)}</div></div>`;
}

function pluginCards(tab: string) {
  return PLUGIN_INFO.map(
    (p) => `<div class="pcard">
    <div class="pcard__head">
      <img class="pcard__icon" src="${p.icon}" width="40" height="40" alt="">
      <div class="pcard__title"><b>${esc(p.name)}</b><span>/${esc(p.id)}/mcp</span></div>
      <a class="btn btn--sm btn--quiet" href="${p.icon}" download="${p.id}-mcp-icon.png" aria-label="Download ${esc(p.name)} icon (PNG)">${ICON.download}<span class="btn__label">Icon</span></a>
    </div>
    <div class="pcard__fields">
      ${copyField(`pf-${tab}-${p.id}-name`, "Name", p.name)}
      ${copyField(`pf-${tab}-${p.id}-desc`, "Description", p.description)}
      ${copyField(`pf-${tab}-${p.id}-url`, "Server URL", `${env.publicUrl}/${p.id}/mcp`)}
    </div>
  </div>`,
  ).join("");
}

function clientTabs(butex: string, notebot: string): Tab[] {
  const k = "YOUR_KEY";
  const auth = { Authorization: `Bearer ${k}` };
  return [
    {
      id: "claude",
      label: "Claude",
      steps: [
        "Open claude.ai → Settings → Connectors → <b>Add custom connector</b>.",
        "Add one connector per server: copy the name and server URL from the cards. Leave the OAuth fields empty.",
        "Click <b>Connect</b>. A NoteBot page opens; enter your email to approve.",
        "Connectors you add on the web also show up in the Claude desktop and mobile apps. Turn them on per chat from the tools menu.",
      ],
      snippets: [],
      cards: true,
    },
    {
      id: "chatgpt",
      label: "ChatGPT",
      steps: [
        "On chatgpt.com, open Settings → <b>Security and login</b> and turn on <b>Developer mode</b>. Needs Plus, Pro, Business, Enterprise or Edu; on a workspace, an admin may have to allow it.",
        "Go to <b>chatgpt.com/plugins</b>, press <b>+</b>, then <b>Add custom MCP server</b>. Add one per server.",
        "Fill the form from the cards: icon (download it), name, description, and the server URL under <b>Connection → Server URL</b>. Set Authentication to <b>OAuth</b>, accept the warning, then <b>Create as a plugin</b>. Approve with your email on the NoteBot page.",
        "In a new chat, type <b>@</b> and pick it. Menus moved in 2026 (the old Apps &amp; Connectors page is now Plugins); if yours differs, look for Plugins or Connectors.",
      ],
      snippets: [],
      cards: true,
      help: {
        title: "ChatGPT says it can't find the BUTEX MCP tools?",
        items: [
          "Open <b>chatgpt.com/plugins</b> and click the plugin. If it says <b>Connect</b> or <b>Sign in</b>, finish the NoteBot email step: without it ChatGPT gets no tools.",
          "On the same page, check its tools are switched <b>on</b>, then press <b>Refresh</b>.",
          "Start a <b>new chat</b>. A chat opened before the plugin was ready won't see it.",
          "Pick it with <b>@</b> (or + → Developer mode) and ask directly, e.g. <q>Use BUTEX MCP: what are the latest notices?</q>",
          "Still nothing? Delete the plugin and add it again. Custom plugins only work on chatgpt.com in a browser, not the mobile app.",
        ],
      },
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
      label: "Other apps",
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
  <div class="guide" data-guide="${t.id}">
    <div class="progress" aria-live="polite"><div class="progress__track"><i data-progress-bar></i></div><span data-progress-text>0 of ${t.steps.length} done</span></div>
    <ol class="steps steps--check">${t.steps
      .map((s, j) => `<li><button class="tick" type="button" aria-pressed="false" data-step="${j}" aria-label="Mark step ${j + 1} done">${ICON.check}</button><span>${s}</span></li>`)
      .join("")}</ol>
    ${t.help ? `<details class="help"><summary>${esc(t.help.title)}</summary><ol>${t.help.items.map((x) => `<li>${x}</li>`).join("")}</ol></details>` : ""}
    <p class="done-note" data-done hidden>All set. Open a new chat and ask something like <q>Any new notice from BUTEX?</q> or <q>YM-I notes for Level 2</q>.</p>
  </div>
  <div class="snippet-wrap">${t.cards ? pluginCards(t.id) : ""}${t.snippets.map(([label, body], j) => snippet(`snip-${t.id}-${j}`, label, body)).join("")}</div>
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
        ${nextSteps()}
      </div>
      <div class="key-reveal" data-key-emailed hidden>
        <p class="notice" data-key-emailed-text role="status"></p>
        ${nextSteps()}
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
      <p class="pick-hint">Pick the app you use. Tick each step as you go.</p>
      <div class="tabs" role="tablist" aria-label="Clients">${tabButtons}<span class="tabs__ink" aria-hidden="true"></span></div>
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
        ${snippet("skill-agent", "Or hand it to your agent", agentPrompt())}
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
<script src="/app.js?v=${ASSET_VERSION}" defer></script>
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
<script src="/app.js?v=${ASSET_VERSION}" defer></script>
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
