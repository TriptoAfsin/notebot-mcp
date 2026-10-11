# NoteBot MCP: setup guide

Connect your AI assistant to two free servers for BUTEX students:

| Server | URL | What it gives your AI |
| --- | --- | --- |
| **BUTEX MCP** | `https://ai.butexnotebot.com/butex/mcp` | The official butex.edu.bd site: notices (class routines, exam schedules, results, admission), plus departments, teachers, offices and halls. It reads the scanned notices for you. |
| **NoteBot knowledge base** | `https://ai.butexnotebot.com/notebot/mcp` | Notes, books, lab reports, question banks and syllabus shared by students; study plans and recommendations. |

Add one or both. **One free key works on both.** Not sure what to ask? See [use-cases.md](use-cases.md).

---

## 1. Claude (claude.ai, desktop app, mobile app)

No key needed: Claude signs you in.

1. On **claude.ai**, open **Settings → Connectors → Add custom connector**.
2. Name: `BUTEX MCP`. URL: `https://ai.butexnotebot.com/butex/mcp`. Leave the advanced/OAuth fields empty, then click **Add**.
3. Click **Connect**. A NoteBot page opens. Enter your email and press **Allow**.
4. Repeat with name `NoteBot knowledge base` and URL `https://ai.butexnotebot.com/notebot/mcp`.
5. In a chat, open the tools menu (the slider icon) and turn the connectors on.

Connectors added on the web appear automatically in the Claude **desktop** and **mobile** apps.

**Try:** "Any new L-3 T-2 exam routine at BUTEX?" · "Give me YM-I notes for Level 2" · "Make me a 10-day plan for my L2T1 finals."

## 2. ChatGPT (chatgpt.com)

Custom MCP servers need a paid plan (Plus, Pro, Business, Enterprise or Edu). On a workspace, an admin may have to allow them.

1. On **chatgpt.com**, open **Settings → Security and login** and turn on **Developer mode**.
2. Go to **chatgpt.com/plugins**, press **+**, then **Add custom MCP server**.
3. Name: `BUTEX MCP`. Under **Connection**, paste `https://ai.butexnotebot.com/butex/mcp`. Authentication: **OAuth**. Accept the risk warning, then **Create as a plugin**.
4. Approve with your email on the NoteBot page that opens.
5. Repeat for `NoteBot knowledge base` with `https://ai.butexnotebot.com/notebot/mcp`.
6. In a new chat, type **@** and pick the plugin.

ChatGPT renamed these menus in 2026: the old **Apps & Connectors** page is now **Plugins**, and Developer mode moved to **Security and login**. If your menus look different, search Settings for "Developer mode" and look for Plugins or Connectors.

## 3. Get a key (for Claude Code, Cursor, VS Code and others)

1. Go to **https://ai.butexnotebot.com**, enter your email under **Get a free key**, and copy the key that appears. A copy is emailed to you as well.
2. **Lost it?** Enter the same email again. For security the key is **not** shown on screen. It's emailed to that address, with a link to replace it if you think someone else has it.
3. Paste your key into the **Your key** box on the dashboard to see usage or revoke it.

## 4. Claude Code

```bash
claude mcp add --transport http butex   https://ai.butexnotebot.com/butex/mcp   --header "Authorization: Bearer YOUR_KEY"
claude mcp add --transport http notebot https://ai.butexnotebot.com/notebot/mcp --header "Authorization: Bearer YOUR_KEY"
```

Add `--scope user` to use them in every project. Or leave out the header, run `/mcp`, and sign in through the browser.

## 5. Cursor / VS Code / Windsurf

`~/.cursor/mcp.json` (Cursor):

```json
{
  "mcpServers": {
    "butex":   { "url": "https://ai.butexnotebot.com/butex/mcp",   "headers": { "Authorization": "Bearer YOUR_KEY" } },
    "notebot": { "url": "https://ai.butexnotebot.com/notebot/mcp", "headers": { "Authorization": "Bearer YOUR_KEY" } }
  }
}
```

`.vscode/mcp.json` (VS Code): same, but the top key is `"servers"` and each entry adds `"type": "http"`.

## 6. Any other MCP client

- Transport: Streamable HTTP (stateless, JSON responses).
- Auth: `Authorization: Bearer YOUR_KEY`, `x-api-key: YOUR_KEY`, or `?key=YOUR_KEY` in the URL for clients that only accept a URL.
- OAuth 2.1 with dynamic client registration is supported. Discovery is at `/.well-known/oauth-protected-resource/{butex|notebot}/mcp`.

## 7. Optional: the agent skill

The `butex-notebot` skill teaches your agent which tool to use for which question and keeps itself up to date.

- macOS / Linux / Git Bash: `curl -fsSL https://ai.butexnotebot.com/skill/install.sh | sh`
- Windows PowerShell: `irm https://ai.butexnotebot.com/skill/install.ps1 | iex`
- claude.ai: download the zip from the dashboard, then **Settings → Capabilities → Skills → Upload skill**.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Missing or invalid API key" | Check for spaces when pasting; request the key again with your email (it's emailed back). |
| Connector says "Couldn't connect" | Remove it and add it again; make sure the URL ends in `/mcp`. |
| Answer says "⚠️ cached copy" | The source (butex.edu.bd or NoteBot) was unreachable; the data may be a bit behind. |
| "Rate limit" | Free keys allow 60 requests/minute and 5,000/day. |
| Stopped working after you replaced your key | Paste the new key into each client. |

NoteBot is a student project, not an official BUTEX service. Questions: reply to any NoteBot email.
