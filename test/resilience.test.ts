import { describe, expect, test } from "bun:test";
import { extractAttachments } from "../src/butex/client";
import { findDepartment, findLink, isSitePage, parsePage, searchPeople } from "../src/butex/site";
import { cache } from "../src/lib/cache";
import { seal, signBlob, unseal, verifyBlob } from "../src/lib/crypto";
import { emailIsValid, mintKey, verifyKey } from "../src/lib/keys";
import { breakerStatus, cachedFetch, fetchJson } from "../src/lib/resilient";

describe("cachedFetch", () => {
  test("serves the last good copy when the loader fails", async () => {
    const key = `t:${Math.random()}`;
    const first = await cachedFetch(key, 0, async () => ({ n: 1 }));
    expect(first.stale).toBe(false);
    const second = await cachedFetch<{ n: number }>(key, 0, async () => {
      throw new Error("upstream down");
    });
    expect(second.stale).toBe(true);
    expect(second.data).toEqual({ n: 1 });
    expect(second.warning).toContain("upstream down");
  });

  test("throws when there is nothing cached to fall back on", async () => {
    await expect(cachedFetch(`t:${Math.random()}`, 60, async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
  });

  test("serves fresh hits without calling the loader", async () => {
    const key = `t:${Math.random()}`;
    await cachedFetch(key, 60, async () => 1);
    let called = false;
    const r = await cachedFetch(key, 60, async () => ((called = true), 2));
    expect(called).toBe(false);
    expect(r.data).toBe(1);
  });
});

describe("circuit breaker", () => {
  test("opens after repeated failures and then fails fast", async () => {
    const upstream = `dead-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      await fetchJson("http://127.0.0.1:9/x", { upstream, retries: 0, timeoutMs: 500 }).catch(() => {});
    }
    expect(breakerStatus(upstream).state).toContain("open");
    const t0 = Date.now();
    await expect(fetchJson("http://127.0.0.1:9/x", { upstream, retries: 0 })).rejects.toThrow("circuit open");
    expect(Date.now() - t0).toBeLessThan(50);
  });
});

describe("keys", () => {
  test("signed keys verify without a database and reject tampering", async () => {
    const { key } = mintKey("free");
    expect((await verifyKey(key))?.tier).toBe("free");
    expect(await verifyKey(key.replace("nbk_f_", "nbk_a_"))).toBeNull(); // tier escalation
    expect(await verifyKey(key.slice(0, -1) + (key.endsWith("A") ? "B" : "A"))).toBeNull();
    expect(await verifyKey("garbage")).toBeNull();
    expect(await verifyKey("")).toBeNull();
  });

  test("email syntax check", () => {
    expect(emailIsValid("student@butex.edu.bd")).toBe(true);
    expect(emailIsValid("a@b")).toBe(false);
    expect(emailIsValid("no spaces@x.com")).toBe(false);
  });
});

describe("crypto blobs", () => {
  test("sealed blobs round-trip and reject tampering", () => {
    const s = seal({ a: 1 });
    expect(unseal<{ a: number }>(s)?.a).toBe(1);
    expect(unseal(s.slice(0, -2) + "AA")).toBeNull();
  });
  test("signed blobs are purpose-bound", () => {
    const b = signBlob({ r: ["https://x"] }, "oauth-client");
    expect(verifyBlob<{ r: string[] }>(b, "oauth-client")).toEqual({ r: ["https://x"] });
    expect(verifyBlob(b, "other")).toBeNull();
  });
});

describe("cache fallback", () => {
  test("works with no Redis configured", async () => {
    await cache.set("x", { y: 1 }, 10);
    expect(await cache.get<{ y: number }>("x")).toEqual({ y: 1 });
    expect(await cache.incr("cnt", 10)).toBe(1);
    expect(await cache.incr("cnt", 10)).toBe(2);
  });
});

describe("attachments", () => {
  test("collapses resized variants and picks a mid-size preview", () => {
    const html = `<a href="http://www.butex.edu.bd/wp-content/uploads/2026/10/a.jpg"><img src="http://www.butex.edu.bd/wp-content/uploads/2026/10/a.jpg" srcset="https://www.butex.edu.bd/wp-content/uploads/2026/10/a.jpg 1648w, https://www.butex.edu.bd/wp-content/uploads/2026/10/a-768x1085.jpg 768w, https://www.butex.edu.bd/wp-content/uploads/2026/10/a-1087x1536.jpg 1087w"></a>
      <a href="https://www.butex.edu.bd/wp-content/uploads/2026/10/b.pdf">PDF</a>`;
    const atts = extractAttachments(html);
    expect(atts).toHaveLength(2);
    expect(atts[0]).toMatchObject({ kind: "image", url: "https://www.butex.edu.bd/wp-content/uploads/2026/10/a.jpg" });
    expect(atts[0]!.preview).toContain("1087x1536");
    expect(atts[1]!.kind).toBe("pdf");
  });
});

describe("key recovery", () => {
  test("a key can be rebuilt from its id (how lost keys are emailed back)", async () => {
    const { keyFor } = await import("../src/lib/keys");
    const { key, id } = mintKey("free");
    expect(keyFor(id, "free")).toBe(key);
    expect(keyFor(id, "admin")).not.toBe(key);
  });
  test("rotate and unsubscribe tokens are purpose-bound and expire", async () => {
    const { readRotateToken, readUnsubscribeToken, rotateUrl } = await import("../src/lib/keys");
    const t = decodeURIComponent(rotateUrl("a@b.com").split("t=")[1]!);
    expect(readRotateToken(t)).toBe("a@b.com");
    expect(readUnsubscribeToken(t)).toBeNull();
    expect(readRotateToken(seal({ e: "a@b.com", p: "rotate", x: Date.now() - 1 }))).toBeNull();
  });
});

describe("BUTEX site pages", () => {
  const html = `<html><title>DoWPE – BUTEX</title><div id="primary"><div class="entry-content">
  <div class="azoom-text-details"><p><strong>Dr. A Head</strong><br />Head, Dept. of Wet Process Engineering<br />email: head.wpe@butex.edu.bd</p></div>
  <h1 class="azoom-heading">Department of Wet Process Engineering</h1><p>Number of Seats: 80</p></div></div>
  <div class="sidebar-area large-3 column"><aside class="widget"><h3>Departmental Updates</h3><ul><li>noise</li></ul></aside></div>
  <ul><li><div class="team-member-article"><span class="team-member-i main-color">Assistant Professor</span><div class="member-b x">Jane Doe</div>
  <div class="member-details"><h3>Jane Doe <span>Assistant Professor</span></h3><p>FIELD OF INTEREST:</p><p>Color physics</p><p>Smart textiles</p>
  <p>CONTACT:</p><p>Email: jane@wpe.butex.edu.bd, jane.personal@gmail.com</p><a href="https://orcid.org/0000">ORCiD</a><a href="http://www.facebook.com">fb</a></div></div></li></ul>
  <div id="footer">Quick Links</div></html>`;

  test("parses head, faculty cards after the sidebar, and keeps only official emails", () => {
    const p = parsePage(html, "https://www.butex.edu.bd/x/", "WPE");
    expect(p.head).toEqual({ name: "Dr. A Head", role: "Head, Dept. of Wet Process Engineering", email: "head.wpe@butex.edu.bd" });
    expect(p.text).toContain("Number of Seats: 80");
    expect(p.text).not.toContain("Departmental Updates");
    expect(p.people).toHaveLength(1);
    const jane = p.people[0]!;
    expect(jane).toMatchObject({ name: "Jane Doe", designation: "Assistant Professor", emails: ["jane@wpe.butex.edu.bd"], links: ["https://orcid.org/0000"] });
    expect(jane.interests).toEqual(["Color physics", "Smart textiles"]);
    expect(jane.profile).not.toContain("gmail");
  });

  test("resolves department codes and page names, and only fetches the BUTEX host", () => {
    expect(findDepartment("WPE")?.label).toBe("Department of Wet Process Engineering");
    expect(findDepartment("tem")?.label).toBe("Department of Textile Engineering Management");
    expect(findLink("VC message")?.label).toBe("The Vice Chancellor");
    expect(findLink("osmani hall")?.label).toBe("G. M. A. G. Osmani Hall");
    expect(isSitePage("https://www.butex.edu.bd/registrar-office/")).toBe(true);
    expect(isSitePage("https://butex.edu.bd.evil.com/")).toBe(false);
    expect(isSitePage("http://www.butex.edu.bd/")).toBe(false);
  });

  test("topic search prefers people matching every word", () => {
    const base = { designation: "", unit: "U", unitUrl: "", emails: [], courses: [], links: [], summary: "", profile: "" };
    const people = [
      { ...base, name: "A", interests: ["Smart textiles"] },
      { ...base, name: "B", interests: ["Technical textiles"] },
    ];
    expect(searchPeople(people, { topic: "smart textiles" }).map((p) => p.name)).toEqual(["A"]);
  });
});
