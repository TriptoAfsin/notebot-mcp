import { env } from "../env";
import { errMsg } from "./util";
import { log } from "./log";

/**
 * Transactional email via Resend (same account and verified sender as the
 * NoteBot ingest pipeline). Returns false instead of throwing: callers decide
 * what a failed send means for the user.
 */

export const mailConfigured = () => !!env.resendKey;

export async function sendMail(m: { to: string; subject: string; html: string; text: string; tags?: string[] }): Promise<boolean> {
  if (!env.resendKey) return false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${env.resendKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: env.mailFrom,
          to: [m.to],
          ...(env.mailReplyTo ? { reply_to: env.mailReplyTo } : {}),
          subject: m.subject,
          html: m.html,
          text: m.text,
          tags: (m.tags ?? []).map((t) => ({ name: "kind", value: t })),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return true;
      const body = await res.text().catch(() => "");
      log.error("email send failed", { event: "email", status: res.status, body: body.slice(0, 300), tags: m.tags });
      if (res.status < 500 && res.status !== 429) return false;
    } catch (err) {
      log.error("email send failed", { event: "email", err, tags: m.tags });
    }
  }
  return false;
}

const escHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** One plain, readable layout for every NoteBot MCP email (renders in Gmail light and dark). */
export function layout(o: { title: string; paragraphs: string[]; keys?: string[]; action?: { label: string; url: string }; footer: string }) {
  const keys = (o.keys ?? [])
    .map((k) => `<p style="margin:0 0 8px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px;background:#eef2f7;border:1px solid #d5dde8;border-radius:8px;padding:10px 12px;word-break:break-all;color:#141a24">${escHtml(k)}</p>`)
    .join("");
  const action = o.action
    ? `<p style="margin:20px 0"><a href="${escHtml(o.action.url)}" style="display:inline-block;background:#1f63c2;color:#ffffff;text-decoration:none;font-weight:600;border-radius:8px;padding:11px 18px">${escHtml(o.action.label)}</a></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f6f8fb;padding:24px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2a3342">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e1e6ee;border-radius:12px;padding:28px 24px">
<p style="margin:0 0 18px;font-weight:700;font-size:16px;color:#141a24">NoteBot <span style="font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#6b7686;border:1px solid #d5dde8;border-radius:5px;padding:1px 5px">MCP</span></p>
<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#141a24">${escHtml(o.title)}</h1>
${o.paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55">${p}</p>`).join("")}
${keys}${action}
<p style="margin:22px 0 0;font-size:12px;line-height:1.5;color:#6b7686">${o.footer}</p>
</div></body></html>`;
  const text = [
    o.title,
    "",
    ...o.paragraphs.map((p) => p.replace(/<[^>]+>/g, "")),
    ...(o.keys?.length ? ["", ...o.keys] : []),
    ...(o.action ? ["", `${o.action.label}: ${o.action.url}`] : []),
    "",
    o.footer.replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g, "$2 ($1)").replace(/<[^>]+>/g, ""),
  ].join("\n");
  return { html, text };
}
