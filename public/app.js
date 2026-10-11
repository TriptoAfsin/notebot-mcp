// NoteBot MCP: progressive enhancement only. Every page reads fine without it.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };
  const session = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
    del: (k) => { try { sessionStorage.removeItem(k); } catch {} },
  };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

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

  // Old single-page anchors (emails, bookmarks) now live on their own routes.
  if (document.body.dataset.route === "home") {
    const legacy = { "#use-cases": "/ask", "#tools": "/tools", "#skill": "/agent", "#guidelines": "/tools", "#manage": "/key", "#get-key": "/key" };
    if (legacy[location.hash]) location.replace(legacy[location.hash]);
    if (location.hash === "#connect") history.replaceState(null, "", "/#choose");
  }
  const flashChoose = () => {
    const c = $("#choose");
    if (!c) return;
    c.scrollIntoView({ behavior: reduced.matches ? "auto" : "smooth", block: "start" });
    restart(c, "is-flash");
  };
  if (location.hash === "#choose") requestAnimationFrame(flashChoose);
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href="/#choose"]');
    if (a && document.body.dataset.route === "home") { e.preventDefault(); history.replaceState(null, "", "/#choose"); flashChoose(); }
  });

  // ── Guides: app chips (tabs) + checklist ───────────────────────────────
  const wantedApp = new URLSearchParams(location.search).get("app") || store.get("nb-app");

  function initGuide(scope) {
    $$("[data-tabs]", scope).forEach((group) => {
      const tabs = $$('[role="tab"]', group);
      const select = (tab, focus, animate = true) => {
        const was = tabs.find((t) => t.getAttribute("aria-selected") === "true");
        tabs.forEach((t) => {
          const on = t === tab;
          t.setAttribute("aria-selected", String(on));
          t.tabIndex = on ? 0 : -1;
          $("#" + t.getAttribute("aria-controls"), group).hidden = !on;
        });
        if (animate && was !== tab) restart($("#" + tab.getAttribute("aria-controls"), group), "is-entering");
        if (focus) tab.focus();
        store.set("nb-app", tab.dataset.app);
      };
      tabs.forEach((t, i) => {
        t.addEventListener("click", () => select(t));
        t.addEventListener("keydown", (e) => {
          const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
          if (d) { e.preventDefault(); select(tabs[(i + d + tabs.length) % tabs.length], true); }
        });
      });
      const start = tabs.find((t) => t.dataset.app === wantedApp);
      if (start) select(start, false, false);
    });

    // Tick steps as you go; progress is remembered on this device.
    $$("[data-guide]", scope).forEach((guide) => {
      const ticks = $$(".tick", guide);
      const key = `nb-steps-v3-${guide.dataset.guide}-${ticks.length}`;
      const bar = $("[data-progress-bar]", guide);
      const text = $("[data-progress-text]", guide);
      const done = $("[data-done]", guide);
      let state = [];
      try { state = JSON.parse(store.get(key) || "[]"); } catch {}
      const render = (celebrate) => {
        const n = ticks.filter((t, i) => { const on = !!state[i]; t.setAttribute("aria-pressed", String(on)); return on; }).length;
        bar.style.setProperty("--p", String(n / ticks.length));
        text.textContent = `${n} of ${ticks.length} done`;
        const all = n === ticks.length;
        if (all && done.hidden && celebrate) restart(done, "is-in");
        done.hidden = !all;
      };
      ticks.forEach((t, i) => t.addEventListener("click", () => {
        state[i] = !state[i];
        store.set(key, JSON.stringify(state));
        render(true);
      }));
      render(false);
    });

    $$("[data-key-form]", scope).forEach((f) => { f.dataset.born = String(performance.now()); });
    const k = session.get("nb-key");
    if (k) fillKey(k);
  }

  // ── Copy: silent success, the icon turns into a tick and the value flashes ─
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-copy]");
    if (!btn) return;
    const src = document.querySelector(btn.dataset.copy);
    if (!src) return;
    const label = $(".btn__label", btn);
    try {
      await navigator.clipboard.writeText(src.textContent.trim());
      btn.dataset.state = "success";
      if (label) label.textContent = "Copied";
      restart(src.closest(".copy") || src, "is-copied");
    } catch {
      const r = document.createRange(); r.selectNodeContents(src);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      if (label) label.textContent = "Press Ctrl+C";
    }
    setTimeout(() => { delete btn.dataset.state; if (label) label.textContent = "Copy"; }, 1600);
  });

  // Snippets get the key once we have one (kept only for this browser tab).
  function fillKey(key) {
    $$("[data-template]").forEach((el) => { el.textContent = el.dataset.template.replaceAll("YOUR_KEY", key); });
    const m = $("#mkey");
    if (m && !m.value) m.value = key;
  }

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

  // ── Key forms (any number per page) ─────────────────────────────────────
  document.addEventListener("submit", async (e) => {
    const form = e.target.closest("[data-key-form]");
    if (!form) return;
    e.preventDefault();
    const scope = form.closest("[data-key-scope]") || document;
    const email = $('input[name="email"]', form);
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
      const res = await post("/api/keys", {
        email: email.value.trim(),
        website: $('input[name="website"]', form)?.value ?? "", // honeypot: people never see it
        elapsed: Math.round(performance.now() - Number(form.dataset.born || 0)),
      });
      form.hidden = true;
      if (res.status === "emailed") {
        // existing address: the key goes to the inbox, never to the screen
        const box = $("[data-key-emailed]", scope);
        $("[data-key-emailed-text]", box).textContent = res.message;
        box.hidden = false;
        restart(box, "is-in");
      } else {
        const reveal = $("[data-key-reveal]", scope);
        $("[data-new-key]", reveal).textContent = res.key;
        reveal.hidden = false;
        restart(reveal, "is-in");
        session.set("nb-key", res.key);
        fillKey(res.key);
      }
      const next = $("[data-key-next]");
      if (next) { next.hidden = false; restart(next, "is-in"); }
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      setLoading(btn, false);
    }
  });

  // ── Manage key ──────────────────────────────────────────────────────────
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
        const dd = document.createElement("dd"); dd.textContent = "Revoked. Apps using it stop working within a few minutes.";
        out.replaceChildren(dt, dd);
        session.del("nb-key");
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

  // ── Setup sheet: the guide opens over the chooser, deep-linkable via ?setup= ─
  const sheet = $("[data-sheet]");
  if (sheet && typeof sheet.showModal === "function") {
    const body = $("[data-sheet-body]", sheet);
    let pushed = false;

    const open = (id, push = true) => {
      const tpl = $(`#tpl-${id}`);
      if (!tpl) return false;
      body.replaceChildren(tpl.content.cloneNode(true));
      $("[data-sheet-title]", sheet).textContent = `Set up ${tpl.dataset.name}`;
      $("[data-sheet-icon]", sheet).src = tpl.dataset.icon;
      $("[data-sheet-full]", sheet).href = `/connect/${id}`;
      initGuide(body);
      sheet.classList.remove("is-closing");
      sheet.showModal();
      document.body.classList.add("has-sheet");
      body.scrollTop = 0;
      requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add("is-open")));
      if (push) { history.pushState({ sheet: id }, "", `/?setup=${id}`); pushed = true; }
      return true;
    };

    const close = (fromHistory = false) => {
      if (!sheet.open || sheet.classList.contains("is-closing")) return;
      sheet.classList.remove("is-open");
      sheet.classList.add("is-closing");
      setTimeout(() => {
        sheet.close();
        sheet.classList.remove("is-closing");
        document.body.classList.remove("has-sheet");
      }, reduced.matches ? 0 : 190);
      if (!fromHistory) {
        if (pushed) { pushed = false; history.back(); }
        else history.replaceState(null, "", "/");
      }
    };

    document.addEventListener("click", (e) => {
      const a = e.target.closest("[data-setup]");
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
      if (open(a.dataset.setup)) e.preventDefault();
    });
    $("[data-sheet-close]", sheet).addEventListener("click", () => close());
    sheet.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
    // a click on the dim area (the dialog box itself, outside the panel) closes it
    sheet.addEventListener("click", (e) => { if (e.target === sheet) close(); });
    addEventListener("popstate", (e) => {
      if (e.state?.sheet) open(e.state.sheet, false);
      else if (sheet.open) { pushed = false; close(true); }
    });

    const deep = new URLSearchParams(location.search).get("setup");
    if (deep === "butex" || deep === "notebot") open(deep, false);
  }

  // ── /ask filter ─────────────────────────────────────────────────────────
  const filter = $("[data-filter]");
  if (filter) {
    const items = $$("[data-filter-item]");
    const apply = (v) => {
      $$("[data-filter-btn]", filter).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filterBtn === v)));
      items.forEach((it) => {
        const show = v === "all" || it.dataset.filterItem === v;
        if (show) { it.hidden = false; requestAnimationFrame(() => it.classList.remove("is-out")); }
        else { it.classList.add("is-out"); setTimeout(() => { if (it.classList.contains("is-out")) it.hidden = true; }, reduced.matches ? 0 : 200); }
      });
    };
    filter.addEventListener("click", (e) => { const b = e.target.closest("[data-filter-btn]"); if (b) apply(b.dataset.filterBtn); });
    if (location.hash === "#butex" || location.hash === "#notebot") apply(location.hash.slice(1));
  }

  // ── Live board: three newest notices, from the server's cache ───────────
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
      .catch(() => { board.closest("section")?.setAttribute("hidden", ""); });
  }

  initGuide(document);
})();
