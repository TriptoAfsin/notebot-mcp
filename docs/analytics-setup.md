# NoteBot analytics MCP: owner setup

`https://ai.butexnotebot.com/analytics/mcp` lets your AI answer questions about NoteBot usage. It accepts **only the admin key** (`ADMIN_API_KEY` on the notebot-mcp Railway service), so nobody else can connect, even with a free key. What it can do: [use-cases.md](use-cases.md#3-notebot-analytics--analyticsmcp-owner-only).

## 0. Server side (once)

Set these on the **notebot-mcp** service in Railway:

```
ADMIN_API_KEY=<a long random string only you know>        # what you type or paste to connect
ANALYTICS_API_URL=http://${{notebot-anlaytics-go.RAILWAY_PRIVATE_DOMAIN}}:${{notebot-anlaytics-go.PORT}}
ANALYTICS_ADMIN_KEY=${{notebot-anlaytics-go.ADMIN_KEY}}    # lets the MCP read analytics-go's admin endpoints
DATABASE_URL=${{Postgres.DATABASE_URL}}                    # needed for the mcp_signups tool
```

Make a key with `openssl rand -base64 48`. `ADMIN_API_KEY` is separate from analytics-go's `ADMIN_KEY`, so you can rotate it without touching analytics-go.

Check it with the quick test in step 5: `analytics_status` should report analytics-go and its database as healthy.

## 1. Claude (claude.ai, desktop, mobile)

1. **Settings → Connectors → Add custom connector.**
2. Name `NoteBot analytics`, URL `https://ai.butexnotebot.com/analytics/mcp`. Leave the OAuth fields empty.
3. Click **Connect**. A NoteBot page asks for the **admin key**. Paste `ADMIN_API_KEY` and press **Allow**.
4. Turn the connector on in a chat from the tools menu. It also appears in the desktop and mobile apps.

The sign-in page allows only a few wrong attempts per 15 minutes from one IP.

## 2. ChatGPT

1. **Settings → Apps & Connectors → Advanced settings → Developer mode** on.
2. **Create**: name `NoteBot analytics`, URL `https://ai.butexnotebot.com/analytics/mcp`, authentication **OAuth**.
3. Sign in on the NoteBot page with the admin key.

## 3. Claude Code

```bash
claude mcp add --transport http notebot-analytics https://ai.butexnotebot.com/analytics/mcp \
  --header "Authorization: Bearer $NOTEBOT_ADMIN_KEY"
```

Keep the key in an environment variable (`NOTEBOT_ADMIN_KEY`), not in a shared config file.

## 4. Cursor, VS Code, other clients

```json
{
  "mcpServers": {
    "notebot-analytics": {
      "url": "https://ai.butexnotebot.com/analytics/mcp",
      "headers": { "Authorization": "Bearer ${env:NOTEBOT_ADMIN_KEY}" }
    }
  }
}
```

VS Code uses `"servers"` instead of `"mcpServers"` and `"type": "http"` on the entry.

## 5. Quick test

```bash
curl -s https://ai.butexnotebot.com/analytics/mcp \
  -H "Authorization: Bearer $NOTEBOT_ADMIN_KEY" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"analytics_status","arguments":{}}}'
```

Then ask your AI: "Give me the NoteBot analytics overview."

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `401 This endpoint is private` | No key or the wrong key | Use `ADMIN_API_KEY` from the notebot-mcp service |
| `403 Admin access required` | You connected with a free key | Free keys only work on `/butex` and `/notebot`; use the admin key |
| Users, leaderboard emails or error logs come back empty or 401 | `ANALYTICS_ADMIN_KEY` is missing or doesn't match analytics-go's `ADMIN_KEY` | Set it to `${{notebot-anlaytics-go.ADMIN_KEY}}` |
| `mcp_signups` says the database is unavailable | `DATABASE_URL` not set | Reference the Postgres service |
| Answers marked ⚠️ cached | analytics-go was unreachable | It will refresh on its own; `analytics_status` shows why |

## Keeping it private

- Never paste the admin key into a shared chat, a screenshot or a public repo.
- Each Claude or ChatGPT sign-in gets its own admin-tier token (`nbk_a_…`), recorded in `mcp.api_keys`. Changing `ADMIN_API_KEY` stops new sign-ins and header use of the old key, but **does not** cancel tokens already issued. To cancel them too, run this against Postgres (takes effect within 5 minutes), then reconnect your own clients:
  ```sql
  UPDATE mcp.api_keys SET revoked_at = now() WHERE tier = 'admin' AND revoked_at IS NULL;
  ```
- The analytics dashboard at analytics.butexnotebot.com is separate: it logs in with analytics-go's `ADMIN_KEY`.
