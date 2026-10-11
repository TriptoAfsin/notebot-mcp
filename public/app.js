// NoteBot MCP dashboard — progressive enhancement only; the page reads fine without it.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };

  // Theme
  const root = document.documentElement;
  $("[data-theme-toggle]")?.addEventListener("click", () => {
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    store.set("nb-theme", root.dataset.theme);
  });

  // Header shadow once scrolled
  const bar = $("[data-bar]");
  const onScroll = () => bar?.classList.toggle("is-scrolled", scrollY > 4);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Tabs (roving tabindex, arrow keys)
  const tabs = $$('[role="tab"]');
  const select = (tab, focus) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      $("#" + t.getAttribute("aria-controls")).hidden = !on;
    });
    if (focus) tab.focus();
    store.set("nb-tab", tab.id);
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => select(t));
    t.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (d) { e.preventDefault(); select(tabs[(i + d + tabs.length) % tabs.length], true); }
    });
  });
  const saved = store.get("nb-tab");
  if (saved && $("#" + saved)) select($("#" + saved));

  // Copy buttons — silent success: the label flips for a moment, no toast.
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-copy]");
    if (!btn) return;
    const src = $(btn.dataset.copy);
    if (!src) return;
    const label = $(".btn__label", btn);
    try {
      await navigator.clipboard.writeText(src.textContent.trim());
      btn.dataset.state = "success";
      if (label) label.textContent = "Copied";
    } catch {
      const r = document.createRange(); r.selectNodeContents(src);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      if (label) label.textContent = "Press Ctrl+C";
    }
    setTimeout(() => { delete btn.dataset.state; if (label) label.textContent = "Copy"; }, 1600);
  });

  // Fill snippets with a key once we have one (kept only for this tab session)
  const fillKey = (key) => {
    $$("[data-template]").forEach((el) => { el.textContent = el.dataset.template.replaceAll("YOUR_KEY", key); });
  };
  const sessionKey = (() => { try { return sessionStorage.getItem("nb-key"); } catch { return null; } })();
  if (sessionKey) fillKey(sessionKey);

  const setLoading = (btn, on) => {
    if (!btn) return;
    if (on) {
      btn.disabled = true;
      // 150 ms floor before the loading state shows, so fast responses don't flicker
      btn._t = setTimeout(() => (btn.dataset.state = "loading"), 150);
    } else {
      clearTimeout(btn._t);
      btn.disabled = false;
      if (btn.dataset.state === "loading") delete btn.dataset.state;
    }
  };

  async function post(path, body) {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  // Create key
  const form = $("[data-key-form]");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#email", form);
    const err = $("[data-key-error]", form);
    const btn = $('button[type="submit"]', form);
    err.textContent = "";
    email.removeAttribute("aria-invalid");
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email.value.trim())) {
      email.setAttribute("aria-invalid", "true");
      err.textContent = "Enter an email like name@example.com.";
      email.focus();
      return;
    }
    setLoading(btn, true);
    try {
      const res = await post("/api/keys", { email: email.value.trim() });
      form.hidden = true;
      if (res.status === "emailed") {
        // existing address: the key goes to the inbox, never to the screen
        $("[data-key-emailed-text]").textContent = res.message;
        $("[data-key-emailed]").hidden = false;
        return;
      }
      const key = res.key;
      $("#new-key").textContent = key;
      $("[data-key-reveal]").hidden = false;
      fillKey(key);
      try { sessionStorage.setItem("nb-key", key); } catch {}
      $("#mkey").value = key;
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      setLoading(btn, false);
    }
  });

  // Manage key
  const mform = $("[data-manage-form]");
  mform?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const op = e.submitter?.value || "usage";
    const key = $("#mkey", mform).value.trim();
    const err = $("[data-manage-error]", mform);
    const out = $("[data-usage]", mform);
    err.textContent = "";
    if (!key) { err.textContent = "Paste a key first."; return; }
    setLoading(e.submitter, true);
    try {
      if (op === "revoke") {
        await post("/api/keys/revoke", { key });
        out.hidden = false;
        const dt = document.createElement("dt"); dt.textContent = "Status";
        const dd = document.createElement("dd"); dd.textContent = "Revoked. Clients using it will stop working within a few minutes.";
        out.replaceChildren(dt, dd);
        try { sessionStorage.removeItem("nb-key"); } catch {}
      } else {
        const u = await post("/api/keys/usage", { key });
        const fmt = (d) => (d ? new Date(d).toLocaleString() : "—");
        const rows = [
          ["Status", "Active"],
          ["Tier", u.tier],
          ["Email", u.email ?? "—"],
          ["Created", fmt(u.createdAt)],
          ["Last used", fmt(u.lastUsedAt)],
          ["Requests", u.requests == null ? "—" : Number(u.requests).toLocaleString()],
        ];
        out.hidden = false;
        out.replaceChildren(
          ...rows.flatMap(([k, v]) => {
            const dt = document.createElement("dt"); dt.textContent = k;
            const dd = document.createElement("dd"); dd.textContent = v;
            if (k === "Status") { const dot = document.createElement("span"); dot.className = "status-dot"; dd.prepend(dot); }
            return [dt, dd];
          }),
        );
      }
    } catch (ex) {
      out.hidden = true;
      err.textContent = ex.message;
    } finally {
      setLoading(e.submitter, false);
    }
  });

  // Live board: three newest notices, from the server's cache
  const board = $("[data-board]");
  if (board) {
    fetch("/api/latest")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(({ items }) => {
        board.replaceChildren(
          ...items.slice(0, 3).map((n) => {
            const a = document.createElement("a");
            a.href = n.url; a.target = "_blank"; a.rel = "noopener";
            const t = document.createElement("time"); t.dateTime = n.date; t.textContent = n.date.slice(0, 10);
            const s = document.createElement("span"); s.textContent = n.title;
            a.append(t, s);
            return a;
          }),
        );
      })
      .catch(() => { board.closest("div").hidden = true; });
  }
})();
