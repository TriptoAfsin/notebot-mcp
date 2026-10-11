import { env } from "../env";
import { mockAddServer, mockChat, mockConnect, mockConsent, mockDeveloperMode, mockForm, type MockServer } from "./mockups";
import { copyBtn, esc, ICON } from "./pages";

/**
 * Setup guides, one per server. The same HTML renders inside the home page's
 * setup sheet (modal) and on /connect/<id>, so the two can never drift.
 */

export type ServerId = "butex" | "notebot";

export type ServerMeta = {
  id: ServerId;
  name: string;
  short: string;
  icon: string;
  /** What to paste into a client's "description" field. */
  description: string;
  /** One line for the chooser card. */
  pitch: string;
  /** Example questions; the first one also appears in the chat mockup. */
  asks: string[];
  source: string;
};

export const SERVERS: Record<ServerId, ServerMeta> = {
  butex: {
    id: "butex",
    name: "BUTEX MCP",
    short: "BUTEX",
    icon: "/mcp-icon-butex.png",
    description: "BUTEX notices, results, routines, departments and teachers from butex.edu.bd",
    pitch: "The official butex.edu.bd site in plain words: notices, routines, exam schedules, results, departments, teachers, offices and halls.",
    asks: ["Did the L4-T1 results come out?", "When is the L2-T2 exam routine?", "Who at BUTEX works on smart textiles?"],
    source: "Reads butex.edu.bd",
  },
  notebot: {
    id: "notebot",
    name: "NoteBot",
    short: "NoteBot",
    icon: "/mcp-icon-notebot.png",
    description: "BUTEX notes, books, lab reports, question banks and study plans from NoteBot",
    pitch: "Notes, books, lab reports and previous questions shared by BUTEX students, plus study plans built from them.",
    asks: ["YM-I notes for Level 2", "Previous questions for FM-I", "Finals in 10 days: plan YM-I and FM-I"],
    source: "Reads the NoteBot library",
  },
};

export const serverUrl = (id: ServerId) => `${env.publicUrl}/${id}/mcp`;

type Step = string | { text: string; mock?: string };
type Tab = {
  id: string;
  label: string;
  /** "oauth" apps sign in with an email; "key" apps need the free key in a header. */
  auth: "oauth" | "key";
  steps: Step[];
  snippets: [string, string][];
  card?: boolean;
  help?: { title: string; items: string[] };
};

export function snippet(id: string, label: string, body: string) {
  return `<div class="snippet-wrap">
  <header><span class="label">${esc(label)}</span>${copyBtn(`#${id}`)}</header>
  <pre class="snippet" id="${id}" data-template="${esc(body)}">${esc(body)}</pre>
</div>`;
}

function copyField(id: string, label: string, value: string) {
  return `<div class="pfield"><span class="label">${esc(label)}</span><div class="copy"><code id="${id}">${esc(value)}</code>${copyBtn(`#${id}`)}</div></div>`;
}

/** Everything a "custom connector / MCP server" form asks for, ready to copy. */
function pluginCard(s: ServerMeta, scope: string) {
  return `<div class="pcard">
    <div class="pcard__head">
      <img class="pcard__icon" src="${s.icon}" width="40" height="40" alt="">
      <div class="pcard__title"><b>${esc(s.name)}</b><span>Paste these into the form</span></div>
      <a class="btn btn--sm" href="${s.icon}" download="${s.id}-mcp-icon.png" aria-label="Download the ${esc(s.name)} icon (PNG)">${ICON.download}<span class="btn__label">Icon PNG</span></a>
    </div>
    <div class="pcard__fields">
      ${copyField(`pf-${scope}-name`, "Name", s.name)}
      ${copyField(`pf-${scope}-desc`, "Description", s.description)}
      ${copyField(`pf-${scope}-url`, "Server URL", serverUrl(s.id))}
    </div>
  </div>`;
}

/** A small email → key form for apps that need a key; the key fills the snippets beside it. */
export function keyForm(scope: string, compact = false) {
  return `<div class="keybox${compact ? " keybox--compact" : ""}" data-key-scope>
  <form data-key-form novalidate>
    <label class="keybox__label" for="email-${scope}">${compact ? "Need a key? It's free, just an email." : "Email"}</label>
    <div class="keybox__row">
      <input class="input" id="email-${scope}" name="email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" required>
      <button class="btn btn--primary" type="submit">${ICON.key}<span class="btn__label">Get key</span></button>
    </div>
    <div class="hp" aria-hidden="true"><label>Website <input name="website" type="text" tabindex="-1" autocomplete="off"></label></div>
    <p class="error" data-key-error role="alert"></p>
  </form>
  <div class="key-reveal" data-key-reveal hidden>
    <p class="notice">Your key. Copy it now; a copy is in your inbox. The commands here already include it.</p>
    <div class="copy"><code data-new-key id="key-${scope}"></code>${copyBtn(`#key-${scope}`)}</div>
  </div>
  <div class="key-reveal" data-key-emailed hidden><p class="notice" data-key-emailed-text role="status"></p></div>
</div>`;
}

function tabsFor(s: ServerMeta): Tab[] {
  const url = serverUrl(s.id);
  const k = "YOUR_KEY";
  const auth = { Authorization: `Bearer ${k}` };
  const mock: MockServer = { name: s.name, url, icon: s.icon, blurb: s.description };
  const slug = s.id;
  return [
    {
      id: "claude",
      label: "Claude",
      auth: "oauth",
      steps: [
        "Open <b>claude.ai</b> → Settings → <b>Connectors</b> → <b>Add custom connector</b>.",
        "Paste the name and server URL from the card. Leave the advanced OAuth fields empty.",
        `Press <b>Connect</b>. A NoteBot page opens: enter your email and press <b>Allow</b>.`,
        "Done. It also shows up in the Claude desktop and mobile apps; switch it on per chat from the tools menu.",
      ],
      snippets: [],
      card: true,
    },
    {
      id: "chatgpt",
      label: "ChatGPT",
      auth: "oauth",
      steps: [
        { text: "On chatgpt.com, open Settings → <b>Security and login</b> and turn on <b>Developer mode</b>. Needs Plus, Pro, Business, Enterprise or Edu; on a workspace, an admin may have to allow it.", mock: mockDeveloperMode() },
        { text: "Go to <b>chatgpt.com/plugins</b>, press <b>+</b>, then <b>Add custom MCP server</b>.", mock: mockAddServer() },
        { text: "Fill the form from the card: icon (<b>Icon PNG</b>), name, description, and the URL under <b>Connection → Server URL</b>. Keep Authentication on <b>OAuth</b>, accept the warning, then <b>Create as a plugin</b>.", mock: mockForm(mock) },
        { text: `ChatGPT shows <b>Connect ${esc(s.name)}</b> with three notes about permissions. That's its standard notice for every plugin. Press <b>Continue</b>.`, mock: mockConnect(mock) },
        { text: "A NoteBot page opens. Enter your email and press <b>Allow</b>. That creates your free key and sends you back. Access is read-only; revoke it any time.", mock: mockConsent(mock) },
        { text: "Start a <b>new chat</b>, type <b>@</b>, pick it, and ask.", mock: mockChat(mock, s.asks[0]!) },
      ],
      snippets: [],
      card: true,
      help: {
        title: `ChatGPT says it can't find the ${s.name} tools?`,
        items: [
          "Open <b>chatgpt.com/plugins</b> and click the plugin. If it says <b>Connect</b> or <b>Sign in</b>, finish the NoteBot email step: without it ChatGPT gets no tools.",
          "On the same page, check its tools are switched <b>on</b>, then press <b>Refresh</b>.",
          "Start a <b>new chat</b>. A chat opened before the plugin was ready won't see it.",
          `Pick it with <b>@</b> and ask directly, e.g. <q>Use ${esc(s.name)}: ${esc(s.asks[0]!)}</q>`,
          "Still nothing? Delete the plugin and add it again. Custom plugins work on chatgpt.com in a browser, not the mobile app.",
        ],
      },
    },
    ...EXTRA_TABS(s, url, k),
    {
      id: "code",
      label: "Claude Code",
      auth: "key",
      steps: [
        "Get a key below, or leave out the header and Claude Code signs you in when you type <code>/mcp</code>.",
        "Run the command. Add <code>--scope user</code> to use it in every project.",
      ],
      snippets: [["Terminal", `claude mcp add --transport http ${slug} ${url} --header "Authorization: Bearer ${k}"`]],
    },
    {
      id: "editors",
      label: "Cursor · VS Code",
      auth: "key",
      steps: ["Paste into <code>~/.cursor/mcp.json</code> (Cursor) or <code>.vscode/mcp.json</code> (VS Code).", `Reload the window; the tools appear under <b>${slug}</b>.`],
      snippets: [
        ["Cursor · mcp.json", JSON.stringify({ mcpServers: { [slug]: { url, headers: auth } } }, null, 2)],
        ["VS Code · mcp.json", JSON.stringify({ servers: { [slug]: { type: "http", url, headers: auth } } }, null, 2)],
      ],
    },
    {
      id: "other",
      label: "Other apps",
      auth: "key",
      steps: [
        "Streamable HTTP, stateless, JSON responses. One key works on both servers.",
        "Send the key as <code>Authorization: Bearer …</code> or <code>x-api-key</code>. Apps that only take a URL can use <code>?key=</code>.",
      ],
      snippets: [
        ["URL with key", `${url}?key=${k}`],
        ["curl", `curl -s ${url} \\\n  -H "Authorization: Bearer ${k}" \\\n  -H "Content-Type: application/json" \\\n  -H "Accept: application/json, text/event-stream" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`],
      ],
    },
  ];
}

/**
 * Gemini and Antigravity, from Google's docs as of Oct 2026:
 * Gemini "Custom apps" (support.google.com/gemini/answer/17209137) and
 * Antigravity MCP (antigravity.google/docs/mcp). Antigravity wants `serverUrl`, not `url`.
 */
function EXTRA_TABS(s: ServerMeta, url: string, k: string): Tab[] {
  return [
    {
      id: "gemini",
      label: "Gemini",
      auth: "oauth",
      steps: [
        "On <b>gemini.google.com</b>, open Settings → <b>Connected Apps</b>. Don't see it? Try <b>Personal Intelligence</b> → <b>Connected Apps</b>.",
        "Under <b>Custom apps</b>, press <b>Add a custom app</b> and paste the server URL from the card. Skip <b>Advanced features</b>.",
        "Press <b>Next</b>. A NoteBot page opens: enter your email and press <b>Allow</b>.",
        "In a prompt, type <b>@</b> and pick it. Once added on the web it also works in the Gemini app.",
      ],
      snippets: [],
      card: true,
      help: {
        title: "Gemini doesn't show Custom apps?",
        items: [
          "Custom apps currently need a <b>personal</b> Google account (not work or school), age 18+, English, and <b>Keep Activity</b> turned on.",
          "Google is rolling it out by country, starting with the US. If it isn't there yet, use Claude, ChatGPT or Antigravity for now.",
          "Added it but no answers? Open Settings → Connected Apps → Custom apps and check the toggle is on, then start a new chat.",
        ],
      },
    },
    {
      id: "antigravity",
      label: "Antigravity",
      auth: "key",
      steps: [
        "Open the MCP config. <b>Antigravity IDE</b>: the <b>…</b> menu at the top of the agent panel → <b>MCP Servers</b> → <b>Manage MCP Servers</b> → <b>View raw config</b>. <b>Antigravity 2.0</b>: Settings → <b>Customizations</b> → <b>Installed MCP Servers</b>.",
        "Get a key below, then add the snippet inside <code>mcpServers</code>. Paste the real key: <code>${VAR}</code> placeholders are sent as plain text.",
        `Save, then press refresh (or restart the IDE). The tools appear under <b>${s.id}</b>.`,
        "Rather sign in than paste a key? Use the second snippet, then Settings → <b>Customizations</b> → <b>Authenticate</b>.",
      ],
      snippets: [
        ["mcp_config.json · with your key", JSON.stringify({ mcpServers: { [s.id]: { serverUrl: url, headers: { Authorization: `Bearer ${k}` } } } }, null, 2)],
        ["mcp_config.json · sign in instead", JSON.stringify({ mcpServers: { [s.id]: { serverUrl: url } } }, null, 2)],
      ],
      help: {
        title: "Where is the config file?",
        items: [
          "Global: <code>~/.gemini/config/mcp_config.json</code>. Per project: <code>.agents/mcp_config.json</code>.",
          "Older guides say <code>~/.gemini/antigravity/mcp_config.json</code>; newer builds moved it. <b>View raw config</b> always opens the live one.",
          "In the Antigravity CLI, type <code>/mcp</code> to reload servers and see connection logs.",
        ],
      },
    },
  ];
}

export const APP_IDS = ["claude", "chatgpt", "gemini", "antigravity", "code", "editors", "other"] as const;

/** The full guide for one server: app picker, then the chosen app's checklist, form values and snippets. */
export function guideHtml(id: ServerId, scope: string, app = "claude"): string {
  const s = SERVERS[id];
  const tabs = tabsFor(s);
  const active = tabs.some((t) => t.id === app) ? app : "claude";
  const pre = `${scope}-${id}`;

  const picker = tabs
    .map((t) => `<button class="app" role="tab" type="button" id="tab-${pre}-${t.id}" aria-controls="panel-${pre}-${t.id}" aria-selected="${t.id === active}" tabindex="${t.id === active ? 0 : -1}" data-app="${t.id}">${esc(t.label)}</button>`)
    .join("");

  const panels = tabs
    .map((t) => {
      const steps = t.steps
        .map((st, j) => {
          const { text, mock } = typeof st === "string" ? { text: st, mock: "" } : st;
          return `<li><button class="tick" type="button" aria-pressed="false" data-step="${j}" aria-label="Mark step ${j + 1} done">${ICON.check}</button><div class="step__body">${text}${mock ?? ""}</div></li>`;
        })
        .join("");
      const side = [
        t.card ? pluginCard(s, `${pre}-${t.id}`) : "",
        t.auth === "key" ? keyForm(`${pre}-${t.id}`, true) : "",
        ...t.snippets.map(([label, body], j) => snippet(`snip-${pre}-${t.id}-${j}`, label, body)),
      ].join("");
      return `<div class="panel" role="tabpanel" id="panel-${pre}-${t.id}" aria-labelledby="tab-${pre}-${t.id}"${t.id === active ? "" : " hidden"}>
  <div class="guide" data-guide="${id}-${t.id}">
    <div class="progress" aria-live="polite"><div class="progress__track"><i data-progress-bar></i></div><span data-progress-text>0 of ${t.steps.length} done</span></div>
    <ol class="steps steps--check">${steps}</ol>
    ${t.help ? `<details class="help"><summary>${esc(t.help.title)}</summary><ol>${t.help.items.map((x) => `<li>${x}</li>`).join("")}</ol></details>` : ""}
    <p class="done-note" data-done hidden>All set. Open a new chat and ask <q>${esc(s.asks[0]!)}</q></p>
  </div>
  <div class="panel__side">${side}</div>
</div>`;
    })
    .join("");

  return `<div class="guide-root" data-tabs>
  <p class="guide-root__q">Which app do you use?</p>
  <div class="apps" role="tablist" aria-label="Your AI app">${picker}</div>
  ${panels}
</div>`;
}
