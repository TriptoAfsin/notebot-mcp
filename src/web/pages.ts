import { env } from "../env";
import { VERSION } from "../version";

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const ICON = {
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  sun: '<svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
};

/** Runs before first paint so the stored theme never flashes. */
const THEME_BOOT = `<script>try{var t=localStorage.getItem("nb-theme");if(t)document.documentElement.dataset.theme=t;}catch(e){}</script>`;

function head(title: string, description: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#f7f9fc" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0e13" media="(prefers-color-scheme: dark)">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${env.publicUrl}/icon.png">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="/fonts/satoshi-700-all.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/geist-400-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/app.css?v=${VERSION}">
${THEME_BOOT}
</head>`;
}

const brand = `<a class="brand" href="/"><img src="/icon.png" alt="" width="28" height="28"><b>NoteBot</b><span>MCP</span></a>`;

const copyBtn = (target: string, label = "Copy") =>
  `<button class="btn" type="button" data-copy="${target}">${ICON.copy}<span class="btn__label">${label}</span></button>`;

export type ToolDoc = { name: string; title: string; description: string };
export type DashboardData = { tools: ToolDoc[]; guidelines: string; skillVersion: string };

function snippet(id: string, label: string, body: string) {
  return `<div class="snippet-wrap">
  <header><span class="label">${esc(label)}</span>${copyBtn(`#${id}`)}</header>
  <pre class="snippet" id="${id}" data-template="${esc(body)}">${esc(body)}</pre>
</div>`;
}

export function dashboardPage(d: DashboardData): Response {
  const url = `${env.publicUrl}/butex/mcp`;
  const k = "YOUR_KEY";

  const tabs: { id: string; label: string; steps: string[]; snippets: [string, string][] }[] = [
    {
      id: "claude",
      label: "Claude web & app",
      steps: [
        "Open claude.ai → Settings → Connectors → <b>Add custom connector</b>.",
        `Name it <b>BUTEX NoteBot</b> and paste the URL below. Leave the OAuth fields empty.`,
        "Click <b>Connect</b>. A NoteBot page opens; enter your email to approve.",
        "Connectors you add on the web also show up in the Claude desktop and mobile apps. Turn it on per chat from the tools menu.",
      ],
      snippets: [["Connector URL", url]],
    },
    {
      id: "chatgpt",
      label: "ChatGPT web & app",
      steps: [
        "Open chatgpt.com → Settings → <b>Apps &amp; Connectors</b> → Advanced settings, and turn on <b>Developer mode</b>.",
        "Back in Apps &amp; Connectors, choose <b>Create</b>. Name it <b>BUTEX NoteBot</b> and paste the URL below.",
        "Set Authentication to <b>OAuth</b>, tick that you trust the app, then create it. Approve with your email on the NoteBot page.",
        "Pick it from the <b>+</b> menu in a chat. It syncs to the ChatGPT mobile and desktop apps.",
      ],
      snippets: [["MCP server URL", url]],
    },
    {
      id: "code",
      label: "Claude Code",
      steps: [
        "Get a key above (or skip the header and Claude Code will run the OAuth sign-in when you type <code>/mcp</code>).",
        "Run the command in your terminal. Add <code>--scope user</code> to make it available in every project.",
      ],
      snippets: [["Terminal", `claude mcp add --transport http butex ${url} --header "Authorization: Bearer ${k}"`]],
    },
    {
      id: "editors",
      label: "Cursor · VS Code",
      steps: ["Paste into <code>~/.cursor/mcp.json</code> (Cursor) or <code>.vscode/mcp.json</code> (VS Code).", "Reload the window; the tools appear under the server name <b>butex</b>."],
      snippets: [
        ["Cursor · mcp.json", JSON.stringify({ mcpServers: { butex: { url, headers: { Authorization: `Bearer ${k}` } } } }, null, 2)],
        ["VS Code · mcp.json", JSON.stringify({ servers: { butex: { type: "http", url, headers: { Authorization: `Bearer ${k}` } } } }, null, 2)],
      ],
    },
    {
      id: "other",
      label: "Any client",
      steps: [
        "Streamable HTTP transport, stateless, JSON responses.",
        "Send the key as <code>Authorization: Bearer …</code> or <code>x-api-key</code>. Clients that only take a URL can put it in <code>?key=</code>.",
      ],
      snippets: [
        ["URL with key", `${url}?key=${k}`],
        ["curl", `curl -s ${url} \\\n  -H "Authorization: Bearer ${k}" \\\n  -H "Content-Type: application/json" \\\n  -H "Accept: application/json, text/event-stream" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`],
      ],
    },
  ];

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

  const tools = d.tools
    .map((t) => `<li><code>${esc(t.name)}</code><p>${esc(t.description)}</p></li>`)
    .join("");

  const html = `${head("NoteBot MCP — BUTEX notices for your AI", "Free MCP server for official BUTEX notices, class routines, exam schedules and results. Works in Claude, ChatGPT, Claude Code and Cursor.")}
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="bar" data-bar>
  <div class="wrap bar__inner">
    ${brand}
    <nav aria-label="Sections">
      <a href="#connect">Connect</a><a href="#tools">Tools</a><a href="#skill">Skill</a><a href="#guidelines">Guidelines</a><a href="#manage">Your key</a>
    </nav>
    <button class="icon-btn" type="button" data-theme-toggle aria-label="Toggle dark mode">${ICON.sun}${ICON.moon}</button>
  </div>
</header>

<main id="main">
  <div class="wrap work">
    <section class="work__intro rise" aria-labelledby="h1">
      <div class="title-row"><h1 id="h1">BUTEX notices, inside your AI.</h1></div>
      <p class="lede">An MCP server for the official butex.edu.bd notice board. Ask Claude or ChatGPT about class routines, exam schedules, results and admission notices. It reads the scanned notices for you and links back to the source.</p>
      <ul class="facts">
        <li>Free. A key only needs an email address.</li>
        <li>Works in Claude and ChatGPT on web, desktop and mobile, plus Claude Code, Cursor and VS Code.</li>
        <li>Keeps answering from its cache when the BUTEX site is down, and says when it does.</li>
      </ul>
    </section>

    <section class="card rise" style="--i:2" aria-labelledby="key-h" id="get-key">
      <h2 id="key-h">Get a free key</h2>
      <p class="card__sub">For Claude Code, Cursor and other clients that take a header. Claude and ChatGPT connectors sign you in by themselves, so you don't need one there.</p>
      <form data-key-form novalidate>
        <div class="field">
          <label for="email">Email</label>
          <input class="input" id="email" name="email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" required>
          <span class="hint">Only used to group your keys. No newsletter, no verification mail.</span>
        </div>
        <p class="error" data-key-error role="alert"></p>
        <div class="row"><button class="btn btn--primary btn--block" type="submit">${ICON.key}<span class="btn__label">Create key</span></button></div>
      </form>
      <div class="key-reveal" data-key-reveal hidden>
        <p class="notice">Copy it now. The server keeps only its ID, so this is the only time the full key is shown. The snippets below already include it.</p>
        <div class="copy"><code id="new-key"></code>${copyBtn("#new-key")}</div>
        <a class="btn" href="#connect">Set up a client</a>
      </div>
    </section>

    <section class="work__extras rise" style="--i:3" aria-label="Endpoint and latest notices">
      <div>
        <p class="label">Endpoint</p>
        <div class="copy"><code id="endpoint">${esc(url)}</code>${copyBtn("#endpoint")}</div>
      </div>
      <div>
        <p class="label">Latest on the board</p>
        <div class="board" data-board aria-live="polite"><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>
      </div>
    </section>
  </div>

  <section class="section" id="connect" aria-labelledby="connect-h">
    <div class="wrap">
      <div class="section__head"><h2 id="connect-h">Connect a client</h2><p>One endpoint for every client. Claude and ChatGPT connect through a one-click OAuth sign-in. Everything else uses your key.</p></div>
      <div class="tabs" role="tablist" aria-label="Clients">${tabButtons}</div>
      ${panels}
    </div>
  </section>

  <section class="section" id="tools" aria-labelledby="tools-h">
    <div class="wrap">
      <div class="section__head"><h2 id="tools-h">Tools</h2><p>Every tool is read-only and pulls from butex.edu.bd's own data feed. Results are cached for a few minutes so the university's server isn't hammered.</p></div>
      <ul class="tools">${tools}</ul>
    </div>
  </section>

  <section class="section" id="skill" aria-labelledby="skill-h">
    <div class="wrap two">
      <div class="section__head" style="margin:0"><h2 id="skill-h">Agent skill</h2>
        <p>A <code>SKILL.md</code> that teaches your agent how to use these tools: which tool fits which question, how to read scanned notices, how to write levels and terms. Each time it runs, it checks <code>/skill/version.json</code> and updates itself when a newer version is out.</p>
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
      <div class="section__head"><h2 id="g-h">Agent guidelines</h2><p>The server sends these instructions to every client when it connects, so agents behave the same everywhere. They're also in <a href="https://github.com/TriptoAfsin/notebot-mcp/blob/main/AGENTS.md">AGENTS.md</a>.</p></div>
      <div class="card"><pre class="guidelines">${esc(d.guidelines)}</pre></div>
    </div>
  </section>

  <section class="section" id="manage" aria-labelledby="m-h">
    <div class="wrap two">
      <div class="section__head" style="margin:0"><h2 id="m-h">Your key</h2><p>Paste a key to see its usage, or revoke it if it leaked. You need the key itself to revoke it, so nobody who only knows your email can kill your keys.</p></div>
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
    <span>A student project. Not an official BUTEX service; all data comes from <a href="https://www.butex.edu.bd">butex.edu.bd</a>.</span>
    <a href="https://butexnotebot.com">butexnotebot.com</a>
    <a href="/health">Status</a>
  </div>
</footer>
<script src="/app.js?v=${VERSION}" defer></script>
</body>
</html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
}

export type AuthorizeView = {
  params: Record<string, string>;
  clientName: string;
  mode: "butex" | "analytics";
  error?: string;
  fatal?: string;
  email?: string;
};

export function authorizePage(v: AuthorizeView, status = 200): Response {
  const hidden = Object.entries(v.params)
    .map(([k, val]) => `<input type="hidden" name="${esc(k)}" value="${esc(val)}">`)
    .join("");
  const client = esc(v.clientName || "An app");
  const admin = v.mode === "analytics";

  const body = v.fatal
    ? `<h1>Can't connect</h1><p>${esc(v.fatal)}</p><p class="fine">Remove the connector in your app and add it again. If it keeps failing, use an API key from <a href="/">the dashboard</a>.</p>`
    : `<h1>${client} wants to use ${admin ? "NoteBot Analytics" : "BUTEX NoteBot"}</h1>
<p>${admin ? "This server is private. Enter the admin key to continue." : "It will be able to read official BUTEX notices, schedules and results. Enter your email to create a free key for it."}</p>
<form method="post" action="/oauth/authorize" novalidate>
  ${hidden}
  <div class="field">
    ${
      admin
        ? `<label for="admin_key">Admin key</label><input class="input" id="admin_key" name="admin_key" type="password" autocomplete="current-password" required${v.error ? ' aria-invalid="true"' : ""}>`
        : `<label for="email">Email</label><input class="input" id="email" name="email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" value="${esc(v.email ?? "")}" required${v.error ? ' aria-invalid="true"' : ""}>`
    }
  </div>
  ${v.error ? `<p class="error" role="alert" style="margin-top:var(--space-xs)">${esc(v.error)}</p>` : ""}
  <div class="row">
    <button class="btn" type="submit" name="action" value="deny" formnovalidate>Cancel</button>
    <button class="btn btn--primary" type="submit" name="action" value="allow">Allow</button>
  </div>
</form>
<p class="fine">Read-only access. You can revoke the key any time from <a href="/#manage">the dashboard</a>. NoteBot is a student project, not an official BUTEX service.</p>`;

  const html = `${head(`Connect · NoteBot MCP`, "Authorize an app to use NoteBot MCP.")}
<body>
<main class="consent"><div class="card rise">${brand}${body}</div></main>
</body></html>`;
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      // consent pages must not be framed (clickjacking)
      "x-frame-options": "DENY",
      "content-security-policy": "frame-ancestors 'none'",
    },
  });
}
