import { env } from "../env";
import { VERSION } from "../version";

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const ICON = {
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  sun: '<svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
};

/** Runs before first paint so the stored theme never flashes. */
const THEME_BOOT = `<script>try{var t=localStorage.getItem("nb-theme");if(t)document.documentElement.dataset.theme=t;}catch(e){}</script>`;

export function head(title: string, description: string) {
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

export const brand = `<a class="brand" href="/"><img src="/icon.png" alt="" width="28" height="28"><b>NoteBot</b><span>MCP</span></a>`;

export const copyBtn = (target: string, label = "Copy") =>
  `<button class="btn" type="button" data-copy="${target}">${ICON.copy}<span class="btn__label">${label}</span></button>`;

export type AuthorizeView = {
  params: Record<string, string>;
  clientName: string;
  mode: "butex" | "notebot" | "analytics";
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
    : `<h1>${client} wants to use ${admin ? "NoteBot Analytics" : v.mode === "notebot" ? "the NoteBot knowledge base" : "the BUTEX MCP"}</h1>
<p>${admin ? "This server is private. Enter the admin key to continue." : v.mode === "notebot" ? "It will be able to read the NoteBot knowledge base (notes, books, lab reports, question banks) and ask TexGPT. Enter your email to create a free key for it. The key also works for the BUTEX MCP." : "It will be able to read the official BUTEX website: notices, schedules, results, departments, faculty and offices. Enter your email to create a free key for it."}</p>
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
