import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pkg from "../package.json";

export const VERSION: string = pkg.version;

/**
 * Cache-busting token for /app.css and /app.js. It's a hash of their contents, so a
 * style or script change reaches browsers even when package.json's version isn't bumped
 * (the files are served with max-age=3600).
 */
export const ASSET_VERSION: string = (() => {
  try {
    const h = createHash("sha1");
    for (const f of ["app.css", "app.js"]) h.update(readFileSync(join(import.meta.dir, "..", "public", f)));
    return h.digest("hex").slice(0, 10);
  } catch {
    return VERSION;
  }
})();
