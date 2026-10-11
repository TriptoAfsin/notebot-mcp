/**
 * Small schematic pictures of what each ChatGPT setup step looks like, so a
 * first-timer can match the screen in front of them. They're drawn in our own
 * tokens (not a copy of ChatGPT's UI), carry no logos, and are aria-hidden: the
 * step text says the same thing in words. `.mk-hit` marks what to click.
 */

const wrap = (label: string, body: string) =>
  `<figure class="mk" aria-hidden="true"><figcaption>${label}</figcaption><div class="mk__screen">${body}</div></figure>`;

export function mockDeveloperMode() {
  return wrap(
    "Settings → Security and login",
    `<div class="mk-side"><span>General</span><span>Notifications</span><span class="is-on">Security and login</span><span>Account</span></div>
     <div class="mk-main"><div class="mk-row mk-hit"><div><b>Developer mode</b><small>Add custom MCP servers</small></div><span class="mk-toggle is-on"></span></div></div>`,
  );
}

export function mockAddServer() {
  return wrap(
    "chatgpt.com/plugins",
    `<div class="mk-main"><div class="mk-bar"><b>Plugins</b><span class="mk-plus mk-hit">+</span></div>
     <div class="mk-menu"><span>Browse plugins</span><span class="is-on">Add custom MCP server</span></div></div>`,
  );
}

export function mockForm(url: string) {
  return wrap(
    "Add custom MCP server",
    `<div class="mk-main mk-form">
       <div class="mk-icon-slot">+</div><small>Icon (optional): use the Icon PNG below</small>
       <label>Name</label><div class="mk-input">BUTEX MCP</div>
       <label>Description (optional)</label><div class="mk-input is-muted">BUTEX notices, results, routines…</div>
       <div class="mk-seg-row"><label>Connection</label><span class="mk-seg"><i class="is-on">Server URL</i><i>Tunnel</i></span></div>
       <div class="mk-input mk-hit">${url}</div>
       <label>Authentication</label><div class="mk-input">OAuth</div>
       <span class="mk-btn">Create as a plugin</span>
     </div>`,
  );
}

export function mockConnect() {
  return wrap(
    "ChatGPT asks to connect",
    `<div class="mk-main mk-center">
       <div class="mk-pair"><span class="mk-app"></span><i></i><i></i><i></i><span class="mk-app is-bx"></span></div>
       <b>Connect BUTEX MCP</b>
       <div class="mk-list"><span>Permissions always respected</span><span>You're in control</span><span>Connectors may introduce risk</span></div>
       <span class="mk-btn mk-hit">Continue to BUTEX MCP ↗</span>
     </div>`,
  );
}

export function mockConsent() {
  return wrap(
    "NoteBot page opens",
    `<div class="mk-main mk-form">
       <div class="mk-brand"><img src="/icon.png" alt="" width="16" height="16"><b>NoteBot</b></div>
       <b>ChatGPT wants to use the BUTEX MCP</b>
       <label>Email</label><div class="mk-input">you@example.com</div>
       <div class="mk-btns"><span class="mk-btn is-ghost">Cancel</span><span class="mk-btn is-primary mk-hit">Allow</span></div>
     </div>`,
  );
}

export function mockChat() {
  return wrap(
    "New chat",
    `<div class="mk-main mk-chat">
       <div class="mk-bubble">Latest BUTEX notices?</div>
       <div class="mk-composer mk-hit"><span class="mk-chip">@ BUTEX MCP</span><span class="is-muted">Ask anything</span></div>
     </div>`,
  );
}
