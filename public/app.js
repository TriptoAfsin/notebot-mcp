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
  const tablist = $(".tabs");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  // Sliding underline: one element moved with transform, so it shows where you came from.
  const moveInk = () => {
    const on = tabs.find((t) => t.getAttribute("aria-selected") === "true");
    if (!on || !tablist) return;
    tablist.style.setProperty("--ink-x", `${on.offsetLeft}px`);
    tablist.style.setProperty("--ink-w", String(on.offsetWidth / 100));
  };
  const select = (tab, focus, animate = true) => {
    const was = tabs.find((t) => t.getAttribute("aria-selected") === "true");
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      $("#" + t.getAttribute("aria-controls")).hidden = !on;
    });
    if (animate && was !== tab) {
      const panel = $("#" + tab.getAttribute("aria-controls"));
      panel.classList.remove("is-entering"); void panel.offsetWidth; panel.classList.add("is-entering");
    }
    moveInk();
    // keep the chosen tab visible inside the strip on phones, without scrolling the page
    if (tablist) {
      const l = tab.offsetLeft, r = l + tab.offsetWidth;
      if (l < tablist.scrollLeft || r > tablist.scrollLeft + tablist.clientWidth) {
        tablist.scrollTo({ left: Math.max(0, l - 16), behavior: reduced.matches ? "auto" : "smooth" });
      }
    }
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
  if (saved && $("#" + saved)) select($("#" + saved), false, false);
  if (tablist) {
    tablist.classList.add("has-ink");
    moveInk();
    requestAnimationFrame(() => tablist.classList.add("ink-ready"));
    addEventListener("resize", moveInk, { passive: true });
    document.fonts?.ready.then(moveInk);
  }

  // Checklist: tick steps as you go; progress is remembered on this device.
  $$("[data-guide]").forEach((guide) => {
    const key = "nb-steps-" + guide.dataset.guide;
    const ticks = $$(".tick", guide);
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
      if (all && done.hidden && celebrate) { done.classList.remove("is-in"); void done.offsetWidth; done.classList.add("is-in"); }
      done.hidden = !all;
    };
    ticks.forEach((t, i) => t.addEventListener("click", () => {
      state[i] = !state[i];
      store.set(key, JSON.stringify(state));
      render(true);
    }));
    render(false);
  });

  // "Show me the steps for…": jump to the right tab and mark where you landed.
  document.addEventListener("click", (e) => {
    const pick = e.target.closest("[data-pick]");
    if (!pick) return;
    const tab = $("#tab-" + pick.dataset.pick);
    if (!tab) return;
    e.preventDefault();
    select(tab, false);
    $("#connect").scrollIntoView({ behavior: reduced.matches ? "auto" : "smooth", block: "start" });
    const panel = $("#" + tab.getAttribute("aria-controls"));
    panel.classList.remove("is-landed"); void panel.offsetWidth; panel.classList.add("is-landed");
    history.replaceState(null, "", "#connect");
  });

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
      const box = src.closest(".copy") || src;
      box.classList.remove("is-copied"); void box.offsetWidth; box.classList.add("is-copied");
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
        $("[data-key-emailed]").classList.add("is-in");
        return;
      }
      const key = res.key;
      $("#new-key").textContent = key;
      const reveal = $("[data-key-reveal]");
      reveal.hidden = false;
      reveal.classList.add("is-in");
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
