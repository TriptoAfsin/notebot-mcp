import { extractText, getDocumentProxy } from "unpdf";
import { cachedFetch } from "../lib/resilient";
import { errMsg } from "../lib/util";
import type { Attachment } from "./client";

const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_BYTES = 1.8 * 1024 * 1024;
const MAX_PDF_CHARS = 20_000;

function assertButexFile(url: string) {
  const u = new URL(url);
  if (!/(^|\.)butex\.edu\.bd$/i.test(u.hostname)) throw new Error("Only butex.edu.bd attachments can be read.");
}

async function download(url: string, maxBytes: number, timeoutMs: number): Promise<Uint8Array> {
  assertButexFile(url);
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "NoteBotMCP/1.0" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const len = Number(res.headers.get("content-length") ?? 0);
      if (len > maxBytes) throw new Error(`file is ${(len / 1048576).toFixed(1)} MB, over the ${(maxBytes / 1048576).toFixed(1)} MB limit`);
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > maxBytes) throw new Error("file too large");
      return buf;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`could not download ${url}: ${errMsg(lastErr)}`);
}

/** Text layer of a PDF. Scanned PDFs have none — the caller is told so it can say "open the link". */
export async function pdfText(url: string): Promise<{ text: string; pages: number; scanned: boolean; truncated: boolean }> {
  const { data } = await cachedFetch(
    `butex:pdf:${url}`,
    7 * 24 * 3600,
    async () => {
      const bytes = await download(url, MAX_PDF_BYTES, 20_000);
      const pdf = await getDocumentProxy(bytes);
      const { totalPages, text } = await extractText(pdf, { mergePages: true });
      const clean = (text as string).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
      return {
        text: clean.slice(0, MAX_PDF_CHARS),
        pages: totalPages,
        scanned: clean.length < 40,
        truncated: clean.length > MAX_PDF_CHARS,
      };
    },
    30 * 24 * 3600,
  );
  return data;
}

/** Image bytes for the model to read directly (it does the OCR). Uses the mid-size preview when available. */
export async function imageForModel(att: Attachment): Promise<{ data: string; mimeType: string; url: string }> {
  const url = att.preview ?? att.url;
  let bytes: Uint8Array;
  let used = url;
  try {
    bytes = await download(url, MAX_IMAGE_BYTES, 15_000);
  } catch (err) {
    if (url === att.url) throw err;
    used = att.url;
    bytes = await download(att.url, MAX_IMAGE_BYTES, 15_000);
  }
  const ext = used.split(".").pop()?.toLowerCase() ?? "jpg";
  const mimeType = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/jpeg";
  return { data: Buffer.from(bytes).toString("base64"), mimeType, url: used };
}
