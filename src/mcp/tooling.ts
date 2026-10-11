import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { log } from "../lib/log";
import { errMsg } from "../lib/util";

/** Every tool is read-only: lets ChatGPT/Claude run them without a confirmation prompt. */
export const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

export const text = (t: string): CallToolResult => ({ content: [{ type: "text", text: t }] });

/**
 * Wraps a tool body so nothing it throws reaches the transport. The model gets
 * an `isError` result with a hint it can act on, and the session stays alive.
 */
export function guard<A>(name: string, fn: (args: A) => Promise<CallToolResult>, hint?: string) {
  return async (args: A): Promise<CallToolResult> => {
    const started = performance.now();
    try {
      const res = await fn(args);
      const ms = Math.round(performance.now() - started);
      // args are search words and levels, never personal data; strings are trimmed by the logger
      (ms > 15_000 ? log.warn : log.info)(ms > 15_000 ? "tool slow" : "tool", { event: "tool", tool: name, ms, ok: !res.isError, args });
      return res;
    } catch (err) {
      log.error("tool failed", { event: "tool", tool: name, ms: Math.round(performance.now() - started), ok: false, args, err });
      return {
        isError: true,
        content: [
          {
            type: "text",
            text:
              `${name} could not complete: ${errMsg(err)}.` +
              (hint ? `\n${hint}` : "\nTry again shortly, or narrow the request."),
          },
        ],
      };
    }
  };
}

export function todayDhaka(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function freshnessLine(c: { fetchedAt: string; stale: boolean; warning?: string }): string {
  return c.stale ? `⚠️ ${c.warning}` : `Source: live butex.edu.bd (fetched ${c.fetchedAt}).`;
}
