import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../env";

const b64url = (buf: Buffer) => buf.toString("base64url");

export function hmac(data: string, purpose: string): string {
  return b64url(createHmac("sha256", `${purpose}:${env.secret}`).update(data).digest());
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function randomId(bytes = 12): string {
  return b64url(randomBytes(bytes)).replace(/[-_]/g, "x");
}

export function sha256b64url(input: string): string {
  return b64url(createHash("sha256").update(input).digest());
}

const encKey = () => createHash("sha256").update(`enc:${env.secret}`).digest();

/** Authenticated encryption for short-lived blobs that travel through the browser (auth codes). */
export function seal(payload: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", encKey(), iv);
  const body = Buffer.concat([c.update(JSON.stringify(payload), "utf8"), c.final()]);
  return b64url(Buffer.concat([iv, c.getAuthTag(), body]));
}

export function unseal<T>(token: string): T | null {
  try {
    const raw = Buffer.from(token, "base64url");
    const d = createDecipheriv("aes-256-gcm", encKey(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    const out = Buffer.concat([d.update(raw.subarray(28)), d.final()]);
    return JSON.parse(out.toString("utf8")) as T;
  } catch {
    return null;
  }
}

/** Signed (not secret) blob: `<base64url json>.<sig>`. Used for stateless OAuth client ids. */
export function signBlob(payload: unknown, purpose: string): string {
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  return `${body}.${hmac(body, purpose).slice(0, 32)}`;
}

export function verifyBlob<T>(token: string, purpose: string): T | null {
  const [body, sig] = token.split(".");
  if (!body || !sig || !safeEqual(sig, hmac(body, purpose).slice(0, 32))) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
