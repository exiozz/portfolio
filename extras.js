/*
 * Exiozz — extras partagés par index.html et shop.html :
 * barre de commande (Ctrl K), mini-jeu caché, bouton « copier mon Discord », disponibilités.
 * À charger après promo.js et ui.js.
 */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const { toast, esc } = UI;
  const icons = () => window.lucide && lucide.createIcons();
  const X = window.Exiozz;
  const DISCORD_HANDLE = "zo7q";
  const PAGE = /shop\.html$/.test(location.pathname) ? "shop" : "index";

  /* ---------- Copier mon Discord ---------- */
  const copyText = async text => {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const t = document.createElement("textarea"); t.value = text; t.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(t); t.select();
      let ok = false; try { ok = document.execCommand("copy"); } catch (err) {}
      t.remove(); return ok;
    }
  };
  const copyDiscord = async btn => {
    const ok = await copyText(DISCORD_HANDLE);
    toast(ok ? `Discord username copied · ${DISCORD_HANDLE}` : `My Discord: ${DISCORD_HANDLE}`);
    if (!btn || !ok) return;
    btn.classList.add("copied");
    clearTimeout(btn._t); btn._t = setTimeout(() => btn.classList.remove("copied"), 1800);
  };
  document.addEventListener("click", e => { const b = e.target.closest("[data-copy-discord]"); if (b) { e.preventDefault(); copyDiscord(b); } });
  document.querySelectorAll("[data-copy-discord] [data-handle]").forEach(el => { el.textContent = "@" + DISCORD_HANDLE; });

  /* ---------- Disponibilités (réglées dans l'espace admin) ---------- */
  const month = () => new Date().toLocaleString("en-US", { month: "long" });
  const loadAvail = async () => {
    const els = document.querySelectorAll("[data-avail]");
    if (!els.length) return;
    let a = null;
    try { const r = await fetch(UI.Account.API + "/api/availability"); if (r.ok) a = await r.json(); } catch (e) {}
    if (!a || a.slots === null || a.slots === undefined) return; // pas de chiffre : on garde le texte de base
    const full = a.slots === 0;
    const text = full ? `Fully booked in ${month()}` : `${a.slots} slot${a.slots > 1 ? "s" : ""} left in ${month()}`;
    els.forEach(el => {
      el.classList.toggle("full", full);
      const t = el.querySelector("[data-avail-text]") || el;
      t.textContent = text;
      if (a.note) el.title = a.note;
      const n = el.parentElement && el.parentElement.querySelector("[data-avail-note]");
      if (n) { n.textContent = a.note || ""; n.hidden = !a.note; }
    });
    document.dispatchEvent(new CustomEvent("availloaded", { detail: a }));
  };
  loadAvail();
  document.addEventListener("availchange", loadAvail);

  /* ---------- Barre de commande ---------- */
  const providers = [];
  const pal = document.createElement("div");
  pal.className = "cmdk"; pal.id = "cmdk";
  pal.setAttribute("role", "dialog"); pal.setAttribute("aria-modal", "true"); pal.setAttribute("aria-label", "Command bar"); pal.hidden = true;
  pal.innerHTML = `<div class="cmdk-box">
      <label class="cmdk-in"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <span class="sr">Search</span><input id="cmdk-q" placeholder="Search assets, projects, questions, actions…" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-autocomplete="list"><kbd>Esc</kbd></label>
      <div class="cmdk-list" id="cmdk-list" role="listbox"></div>
      <div class="cmdk-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>Ctrl</kbd><kbd>K</kbd> toggle</span></div>
    </div>`;
  document.body.appendChild(pal);
  const qIn = $("#cmdk-q", pal), listEl = $("#cmdk-list", pal);
  let items = [], shown = [], sel = 0, lastFocus = null;
  const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const score = (it, q) => {
    if (!q) return it.top ? 2 : 1;
    const label = norm(it.label), all = norm([it.label, it.hint, it.k, it.g].join(" "));
    const words = q.split(/\s+/).filter(Boolean);
    if (!words.every(w => all.includes(w))) return 0;
    return (label.startsWith(q) ? 6 : 0) + (label.includes(q) ? 3 : 0) + 1;
  };
  const renderPal = () => {
    const q = norm(qIn.value.trim());
    shown = items.map(it => [it, score(it, q)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([it]) => it);
    if (!q) shown = shown.filter(it => it.top || it.g !== "Assets" && it.g !== "FAQ").slice(0, 40);
    if (q && PAGE === "shop") shown.push({ g: "Search", label: `Search the catalog for “${qIn.value.trim()}”`, icon: "search", run: () => { const s = $("#q"); s.value = qIn.value.trim(); s.dispatchEvent(new Event("input")); $("#catalog").scrollIntoView({ behavior: "smooth" }); } });
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    let g = "";
    listEl.innerHTML = shown.length ? shown.map((it, i) => {
      const head = it.g !== g ? `<div class="cmdk-g" role="presentation">${esc(it.g)}</div>` : ""; g = it.g;
      return head + `<button class="cmdk-it" role="option" id="cmdk-${i}" data-i="${i}" aria-selected="${i === sel}">
        ${it.img ? `<img src="${esc(it.img)}" alt="">` : `<span class="cmdk-ic"><i data-lucide="${it.icon || "arrow-right"}"></i></span>`}
        <span class="cmdk-t"><b>${esc(it.label)}</b>${it.hint ? `<small>${esc(it.hint)}</small>` : ""}</span>${it.kbd ? `<kbd>${esc(it.kbd)}</kbd>` : `<i class="cmdk-go" data-lucide="corner-down-left"></i>`}</button>`;
    }).join("") : `<div class="cmdk-none"><b>No result</b><span>Try “forest”, “price”, “robux” or “theme”</span></div>`;
    qIn.setAttribute("aria-activedescendant", shown.length ? "cmdk-" + sel : "");
    icons();
  };
  const move = d => {
    if (!shown.length) return;
    sel = (sel + d + shown.length) % shown.length;
    listEl.querySelectorAll(".cmdk-it").forEach(b => b.setAttribute("aria-selected", +b.dataset.i === sel));
    const b = listEl.querySelector(`[data-i="${sel}"]`); b && b.scrollIntoView({ block: "nearest" });
    qIn.setAttribute("aria-activedescendant", "cmdk-" + sel);
  };
  const openPal = (q = "") => {
    items = providers.flatMap(p => { try { return p() || []; } catch (e) { return []; } });
    lastFocus = document.activeElement;
    pal.hidden = false; qIn.value = q; sel = 0; renderPal(); qIn.focus();
    requestAnimationFrame(() => pal.classList.add("open"));
    document.documentElement.style.overflow = "hidden";
  };
  const closePal = () => {
    pal.classList.remove("open"); document.documentElement.style.overflow = "";
    setTimeout(() => { if (!pal.classList.contains("open")) pal.hidden = true; }, reduce ? 0 : 200);
    lastFocus && lastFocus.focus && lastFocus.focus({ preventScroll: true });
  };
  const runIt = it => { if (!it) return; closePal(); setTimeout(() => it.run(), 60); };
  qIn.addEventListener("input", () => { sel = 0; renderPal(); });
  qIn.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") { e.preventDefault(); runIt(shown[sel]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closePal(); }
    else if (e.key === "Tab") e.preventDefault();
  });
  listEl.addEventListener("click", e => { const b = e.target.closest("[data-i]"); if (b) runIt(shown[+b.dataset.i]); });
  listEl.addEventListener("mousemove", e => { const b = e.target.closest("[data-i]"); if (b && +b.dataset.i !== sel) { sel = +b.dataset.i - 0; move(0); } });
  pal.addEventListener("click", e => { if (e.target === pal) closePal(); });
  addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); pal.classList.contains("open") ? closePal() : openPal(); }
  });
  // Bouton dans la barre de navigation
  const tools = $(".nav-tools");
  if (tools) {
    const b = document.createElement("button");
    b.className = "icon-btn cmdk-btn"; b.setAttribute("aria-label", "Search and commands (Ctrl K)"); b.dataset.openCmdk = "";
    b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;
    tools.prepend(b);
  }
  document.addEventListener("click", e => { if (e.target.closest("[data-open-cmdk]")) openPal(); });

  // Commandes communes aux deux pages
  const go = sel => () => { const el = document.querySelector(sel); if (el) el.scrollIntoView({ behavior: reduce ? "auto" : "smooth" }); };
  providers.push(() => {
    const A = UI.Account, out = [];
    document.querySelectorAll(".links a[href^='#']").forEach(a => out.push({ g: "Go to", label: a.textContent.trim(), icon: "hash", k: "section", run: go(a.getAttribute("href")), top: true }));
    out.push(PAGE === "shop"
      ? { g: "Go to", label: "Portfolio", hint: "Home page", icon: "user", run: () => { location.href = "index.html"; }, top: true }
      : { g: "Go to", label: "Asset shop", hint: "Models, UI kits, packs", icon: "shopping-bag", run: () => { location.href = "shop.html"; }, top: true });
    out.push(
      { g: "Actions", label: document.documentElement.dataset.theme === "light" ? "Switch to dark mode" : "Switch to light mode", icon: "sun-moon", k: "theme dark light mode", run: () => UI.setTheme($("#theme-btn")), top: true },
      { g: "Actions", label: "Open my cart", hint: `${X.Cart.count()} item${X.Cart.count() === 1 ? "" : "s"}`, icon: "shopping-cart", k: "basket checkout", run: UI.openCart, top: true },
      { g: "Actions", label: "My wishlist", hint: `${UI.Wish.ids().length} saved`, icon: "heart", k: "favourites favorites saved", run: UI.openWish },
      { g: "Actions", label: "My orders", hint: "Track your orders", icon: "package", k: "order tracking status", run: UI.openOrders },
      { g: "Actions", label: "Copy my Discord username", hint: "@" + DISCORD_HANDLE, icon: "copy", k: "discord contact copy", run: () => copyDiscord(), top: true },
      { g: "Actions", label: "Join the Discord server", icon: "message-circle", k: "community", run: () => { location.href = "https://discord.gg/rGcdngHsCe"; } },
      { g: "Actions", label: "Send me an email", icon: "mail", k: "contact", run: () => { location.href = "mailto:tomokari.pro@gmail.com"; } },
      A.user ? { g: "Account", label: "Sign out", hint: A.user.name, icon: "log-out", run: A.signOut } : { g: "Account", label: "Sign in with Discord", icon: "log-in", k: "login connect", run: A.signIn }
    );
    if (A.isAdmin()) out.push({ g: "Account", label: "Admin area", icon: "lock", k: "orders availability", run: UI.openAdmin });
    out.push({ g: "Fun", label: "Play Brick Catch", hint: "Hidden mini-game", icon: "gamepad-2", k: "game play secret easter egg", run: () => Game.open() },
      { g: "Fun", label: "Make it rain bricks", icon: "sparkles", k: "roblox easter egg", run: UI.bricks });
    X.PRODUCTS.forEach(p => out.push({ g: "Assets", label: p.name, hint: `${p.catLabel} · ${X.money(p.eur)}`, img: p.cover, k: [p.desc, ...p.tags].join(" "),
      run: () => { if (PAGE === "shop" && window.ShopPage) ShopPage.open(p.id); else location.href = "shop.html?product=" + p.id; } }));
    return out;
  });

  /* ---------- Mini-jeu caché : Brick Catch ---------- */
  const BEST_KEY = "exiozz-brick-best";
  const best = () => { try { return +localStorage.getItem(BEST_KEY) || 0; } catch (e) { return 0; } };
  const Game = (() => {
    let el = null, cv, ctx, raf = 0, state = "menu", W = 0, H = 0, dpr = 1;
    let paddle, bricks, parts, score, lives, t0, spawnT, keys = {}, combo, shake = 0, lastT = 0;
    const COLORS = ["#e5484d", "#f5a524", "#3e8ef7", "#2fbf71", "#f2f2f2"];
    const build = () => {
      el = document.createElement("div");
      el.className = "game"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Brick Catch mini-game");
      el.innerHTML = `<canvas aria-hidden="true"></canvas>
        <div class="game-hud"><span>Score <b id="g-score">0</b></span><span id="g-lives" aria-label="Lives"></span><span>Best <b id="g-best">0</b></span><button class="game-x" aria-label="Quit the game"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>
        <div class="game-card" id="g-card"></div>`;
      document.body.appendChild(el);
      cv = $("canvas", el); ctx = cv.getContext("2d");
      $(".game-x", el).addEventListener("click", close);
      el.addEventListener("pointermove", e => { if (state === "play") paddle.tx = e.clientX; });
      el.addEventListener("pointerdown", e => { if (state === "play") paddle.tx = e.clientX; });
      el.addEventListener("click", e => { if (e.target.closest("[data-g-start]")) start(); });
      addEventListener("resize", size);
    };
    const size = () => { if (!el) return; dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px"; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); if (paddle) paddle.y = H - 70; };
    const card = html => { const c = $("#g-card", el); c.innerHTML = html; c.hidden = !html; if (html) setTimeout(() => { const b = c.querySelector("button"); b && b.focus(); }, 50); };
    const hud = () => { $("#g-score", el).textContent = score; $("#g-best", el).textContent = Math.max(best(), score); $("#g-lives", el).innerHTML = "●".repeat(Math.max(0, lives)) + `<span style="opacity:.25">${"●".repeat(Math.max(0, 3 - lives))}</span>`; };
    const menu = () => {
      state = "menu";
      card(`<span class="kicker">Hidden mini-game</span><h2>Brick Catch</h2>
        <p>Catch the falling bricks with your baseplate. <b style="color:#f5c542">Gold</b> bricks are worth 5. Avoid the <b style="color:#ff6b6b">bombs</b>, they cost a life.</p>
        <p class="game-keys">Mouse, finger or ← → to move</p>
        <button class="btn btn-w" data-g-start>Play</button>${best() ? `<small>Your best: ${best()}</small>` : ""}`);
    };
    const start = () => {
      paddle = { x: W / 2, tx: W / 2, y: H - 70, w: Math.min(150, W * .3), h: 16 };
      bricks = []; parts = []; score = 0; lives = 3; combo = 0; t0 = performance.now(); spawnT = .2; lastT = t0;
      state = "play"; card(""); hud();
    };
    const spawn = el2 => {
      const elapsed = (performance.now() - t0) / 1000, r = Math.random();
      const kind = r < .12 + Math.min(.12, elapsed / 300) ? "bomb" : r > .93 ? "gold" : "brick";
      const w = kind === "bomb" ? 34 : 44 + Math.random() * 26;
      bricks.push({ kind, w, h: kind === "bomb" ? 34 : w * .5, x: 20 + Math.random() * (W - 40 - w), y: -50, vy: 240 + elapsed * 7 + Math.random() * 90, r: (Math.random() - .5) * .6, vr: (Math.random() - .5) * 3, c: COLORS[Math.floor(Math.random() * COLORS.length)] });
    };
    const burst = (x, y, c, n = 12) => { for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() - .5) * 360, vy: -Math.random() * 320, life: 1, c }); };
    const over = () => {
      state = "over";
      const rec = score > best();
      if (rec) try { localStorage.setItem(BEST_KEY, score); } catch (e) {}
      card(`<span class="kicker">${rec ? "New record" : "Game over"}</span><h2>${score} point${score === 1 ? "" : "s"}</h2>
        <p>${rec ? "Best score on this device. Can you beat it?" : `Your best: ${best()}. One more try?`}</p>
        <button class="btn btn-w" data-g-start>Play again</button>`);
      hud();
    };
    const drawBrick = b => {
      ctx.save(); ctx.translate(b.x + b.w / 2, b.y + b.h / 2); ctx.rotate(b.r);
      if (b.kind === "bomb") {
        ctx.fillStyle = "#1b1b1b"; ctx.beginPath(); ctx.arc(0, 0, b.w / 2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#ff6b6b"; ctx.lineWidth = 2; ctx.stroke();
        ctx.strokeStyle = "#f5a524"; ctx.beginPath(); ctx.moveTo(4, -b.w / 2); ctx.quadraticCurveTo(10, -b.w / 2 - 10, 16, -b.w / 2 - 6); ctx.stroke();
        ctx.fillStyle = "#ffd166"; ctx.beginPath(); ctx.arc(16, -b.w / 2 - 6, 3 + Math.random() * 2, 0, Math.PI * 2); ctx.fill();
      } else {
        const c = b.kind === "gold" ? "#f5c542" : b.c;
        ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(-b.w / 2, -b.h / 2, b.w, b.h, 4); ctx.fill();
        const studs = Math.max(2, Math.round(b.w / 18));
        for (let s = 0; s < studs; s++) { ctx.beginPath(); ctx.roundRect(-b.w / 2 + (s + .5) * (b.w / studs) - 5, -b.h / 2 - 5, 10, 6, [3, 3, 0, 0]); ctx.fill(); }
        ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.fillRect(-b.w / 2, b.h / 2 - 4, b.w, 4);
        if (b.kind === "gold") { ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.fillRect(-b.w / 2 + 4, -b.h / 2 + 3, b.w * .3, 3); }
      }
      ctx.restore();
    };
    const frame = now => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(.033, (now - lastT) / 1000 || 0); lastT = now;
      const light = document.documentElement.dataset.theme === "light";
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      if (shake > 0) { ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake); shake = Math.max(0, shake - dt * 40); }
      if (state === "play") {
        const elapsed = (now - t0) / 1000;
        if (keys.ArrowLeft) paddle.tx = paddle.x - 30; if (keys.ArrowRight) paddle.tx = paddle.x + 30;
        paddle.x += (Math.max(paddle.w / 2, Math.min(W - paddle.w / 2, paddle.tx)) - paddle.x) * Math.min(1, dt * 18);
        spawnT -= dt; if (spawnT <= 0) { spawn(); spawnT = Math.max(.32, 1 - elapsed / 90) * (.6 + Math.random() * .6); }
        for (let i = bricks.length - 1; i >= 0; i--) {
          const b = bricks[i]; b.y += b.vy * dt; b.r += b.vr * dt;
          const hit = b.y + b.h >= paddle.y && b.y + b.h <= paddle.y + paddle.h + b.vy * dt + 4 && b.x + b.w > paddle.x - paddle.w / 2 && b.x < paddle.x + paddle.w / 2;
          if (hit) {
            bricks.splice(i, 1);
            if (b.kind === "bomb") { lives--; combo = 0; shake = 14; burst(b.x + b.w / 2, b.y, "#ff6b6b", 22); if (navigator.vibrate) navigator.vibrate(60); }
            else { combo++; const pts = (b.kind === "gold" ? 5 : 1) * (combo >= 10 ? 2 : 1); score += pts; burst(b.x + b.w / 2, b.y, b.kind === "gold" ? "#f5c542" : b.c); }
            hud(); if (lives <= 0) { over(); break; }
          } else if (b.y > H + 20) { bricks.splice(i, 1); if (b.kind !== "bomb") combo = 0; }
        }
      }
      (bricks || []).forEach(drawBrick);
      parts = (parts || []).filter(p => (p.life -= dt * 1.6) > 0);
      parts.forEach(p => { p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; ctx.globalAlpha = p.life; ctx.fillStyle = p.c; ctx.fillRect(p.x - 3, p.y - 3, 6, 6); });
      ctx.globalAlpha = 1;
      if (paddle && state !== "menu") {
        ctx.fillStyle = light ? "#0d0d0d" : "#f2f2f2";
        ctx.beginPath(); ctx.roundRect(paddle.x - paddle.w / 2, paddle.y, paddle.w, paddle.h, 5); ctx.fill();
        ctx.fillStyle = light ? "#3a3a3a" : "#cfcfcf";
        const studs = Math.round(paddle.w / 22);
        for (let s = 0; s < studs; s++) { ctx.beginPath(); ctx.roundRect(paddle.x - paddle.w / 2 + (s + .5) * (paddle.w / studs) - 6, paddle.y - 5, 12, 6, [3, 3, 0, 0]); ctx.fill(); }
        if (state === "play" && combo >= 10) { ctx.font = "600 12px 'Geist Mono', monospace"; ctx.textAlign = "center"; ctx.fillStyle = "#f5c542"; ctx.fillText(`COMBO ×2 · ${combo}`, paddle.x, paddle.y + 38); }
      }
      ctx.restore();
    };
    const onKey = e => {
      if (!el || el.hidden) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); keys[e.key] = e.type === "keydown"; }
      if ((e.key === " " || e.key === "Enter") && e.type === "keydown" && state !== "play" && !e.target.closest("button")) { e.preventDefault(); start(); }
    };
    addEventListener("keydown", onKey, true); addEventListener("keyup", onKey, true);
    const open = () => {
      if (!el) build();
      el.hidden = false; size(); bricks = []; parts = []; paddle = null; score = 0; lives = 3; hud(); menu();
      document.documentElement.style.overflow = "hidden";
      requestAnimationFrame(() => el.classList.add("open"));
      cancelAnimationFrame(raf); lastT = performance.now(); raf = requestAnimationFrame(frame);
    };
    function close() {
      if (!el) return;
      el.classList.remove("open"); cancelAnimationFrame(raf); state = "menu"; keys = {};
      document.documentElement.style.overflow = "";
      setTimeout(() => { el.hidden = true; }, reduce ? 0 : 250);
    }
    return { open, close };
  })();
  // Code secret : taper « play » n'importe où (hors champs de texte)
  let typed = "";
  addEventListener("keydown", e => {
    if (e.target.closest && e.target.closest("input, textarea, select") || e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-4);
    if (typed === "play") { typed = ""; Game.open(); }
  });

  /* ---------- Quoi de neuf : journal des mises à jour, point rouge s'il y a du nouveau ----------
     Ajoute une ligne EN HAUT de la liste à chaque nouveauté (id unique, date AAAA-MM-JJ). */
  const CHANGELOG = [
    { id: "advent-2026", date: "2026-11-26", tag: "Event", title: "Advent calendar", text: "A gift every day from December 1st to 24th: promo codes, wallpapers, dev tips and challenges.", href: "index.html#advent" },
    { id: "badge-quiz", date: "2026-11-26", tag: "New", title: "Your avatar on the badge", text: "Type your Roblox username at the bottom of the home page, plus a 3-question quiz to find the right service.", href: "index.html#badge-me" },
    { id: "quote-sim", date: "2026-11-26", tag: "New", title: "Quote simulator", text: "Get a price range for your project in a few clicks, then send it as a request.", href: "index.html#quote" },
    { id: "shop-v3", date: "2026-11-26", tag: "Shop", title: "Wishlist, ratings and bundles", text: "Save assets with the heart, read buyer ratings, and get −20% when you take 2 assets or more.", href: "shop.html" },
    { id: "brick-catch", date: "2026-11-26", tag: "Secret", title: "A hidden mini-game", text: "Type “play” anywhere on the site. Good luck with the bombs." },
    { id: "site-en", date: "2026-11-25", tag: "Site", title: "Brand new site", text: "New design in English, light and dark theme, and a 3D globe of projects and reviews.", href: "index.html#world" },
    { id: "hud-pack", date: "2026-11-24", tag: "Shop", title: "HUD & Quests Pack", text: "Compass, working minimap, quest tracker, notifications and health bars.", href: "shop.html?product=hud-quest-pack" },
    { id: "lava-pack", date: "2026-11-12", tag: "Shop", title: "Lava Mounts Pack", text: "Rigged lava dragon and horse, summoning bell and fire portal.", href: "shop.html?product=lava-mounts-pack" },
    { id: "forest-pack", date: "2026-11-12", tag: "Shop", title: "Stylized Forest Pack", text: "18 stylized nature assets, ready for Roblox.", href: "shop.html?product=stylized-forest-pack" }
  ];
  const SEEN_KEY = "exiozz-news-seen";
  const seenId = () => { try { return localStorage.getItem(SEEN_KEY); } catch (e) { return null; } };
  const unseen = () => { const s = seenId(), i = CHANGELOG.findIndex(c => c.id === s); return i < 0 ? CHANGELOG.length : i; };
  const news = document.createElement("div");
  news.className = "news"; news.id = "news"; news.hidden = true;
  news.setAttribute("role", "dialog"); news.setAttribute("aria-label", "What's new");
  document.body.appendChild(news);
  const fmtDate = d => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  let newsBtn = null;
  // Messages non lus de la messagerie des commandes (fournis par ui.js)
  const chatUnread = () => (UI.Chat ? UI.Chat.unread() : []);
  const agoShort = ts => { const m = Math.round((Date.now() - ts) / 6e4); return m < 1 ? "now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
  const msgSection = () => {
    if (!UI.Chat || !UI.Chat.signedIn()) return "";
    const items = chatUnread();
    const rows = items.map(m => `<li class="fresh nm"><button data-news-chat="${esc(m.id)}">
        ${m.avatar ? `<img class="nm-av" src="${esc(m.avatar)}" alt="">` : `<span class="nm-av${m.who === "Exiozz" ? " brand" : ""}">${m.who === "Exiozz" ? "" : esc(m.who.charAt(0).toUpperCase())}</span>`}
        <span class="nm-txt"><span class="news-meta"><span class="news-tag">Message</span>${agoShort(m.ts)}<span class="news-new">New</span></span>
        <b>${esc(m.who)}${m.username ? ` <em>@${esc(m.username)}</em>` : ""} · #${esc(m.id.slice(-6).toUpperCase())}</b><span>${esc(m.text)}</span></span></button></li>`).join("");
    return `<div class="news-sec"><span>Messages</span><button data-news-inbox>Open chat</button></div>
      ${rows ? `<ol class="news-list">${rows}</ol>` : `<p class="news-none">No new messages</p>`}
      <div class="news-sec"><span>Updates</span></div>`;
  };
  const paintNewsBtn = () => {
    if (!newsBtn) return;
    const n = unseen(), m = chatUnread().length;
    newsBtn.classList.toggle("has-new", n + m > 0);
    newsBtn.setAttribute("aria-label", [m ? `${m} new message${m > 1 ? "s" : ""}` : "", n ? `${n} update${n > 1 ? "s" : ""} since your last visit` : ""].filter(Boolean).join(", ") || "Notifications");
  };
  const openNews = () => {
    const n = unseen();
    news.innerHTML = `<div class="news-head"><b>Notifications</b><button class="drawer-x" data-news-close aria-label="Close"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>
      <div class="news-scroll">${msgSection()}<ol class="news-list">${CHANGELOG.map((c, i) => `<li class="${i < n ? "fresh" : ""}" style="--i:${i}">${c.href ? `<a href="${c.href}" data-news-go>` : "<div>"}
        <span class="news-meta"><span class="news-tag">${esc(c.tag)}</span>${fmtDate(c.date)}${i < n ? '<span class="news-new">New</span>' : ""}</span>
        <b>${esc(c.title)}</b><span>${esc(c.text)}</span>${c.href ? "</a>" : "</div>"}</li>`).join("")}</ol></div>`;
    news.hidden = false; requestAnimationFrame(() => news.classList.add("open"));
    try { localStorage.setItem(SEEN_KEY, CHANGELOG[0].id); } catch (e) {}
    paintNewsBtn();
  };
  const closeNews = () => { news.classList.remove("open"); setTimeout(() => { if (!news.classList.contains("open")) news.hidden = true; }, 200); };
  if (tools) {
    newsBtn = document.createElement("button");
    newsBtn.className = "icon-btn news-btn"; newsBtn.dataset.openNews = "";
    newsBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg><span class="news-dot" aria-hidden="true"></span>`;
    tools.insertBefore(newsBtn, tools.querySelector("#theme-btn"));
    paintNewsBtn();
  }
  document.addEventListener("chatunread", () => { paintNewsBtn(); if (news.classList.contains("open")) { const sc = news.querySelector(".news-scroll"), y = sc ? sc.scrollTop : 0; openNews(); const s2 = news.querySelector(".news-scroll"); if (s2) s2.scrollTop = y; } });
  document.addEventListener("click", e => {
    const nc = e.target.closest("[data-news-chat]"); if (nc) { closeNews(); UI.Chat.open(nc.dataset.newsChat); return; }
    if (e.target.closest("[data-news-inbox]")) { closeNews(); UI.openInbox(); return; }
    if (e.target.closest("[data-open-news]")) { e.stopPropagation(); news.classList.contains("open") ? closeNews() : openNews(); return; }
    if (e.target.closest("[data-news-close]") || e.target.closest("[data-news-go]") || (!news.hidden && !e.target.closest("#news"))) closeNews();
  });
  addEventListener("keydown", e => { if (e.key === "Escape" && !news.hidden) closeNews(); });
  providers.push(() => [{ g: "Actions", label: "What's new", hint: CHANGELOG[0].title, icon: "bell", k: "news updates changelog", run: openNews, top: true }]);

  /* ---------- Identifiant anonyme du navigateur (réactions, livre d'or, compteur en direct) ---------- */
  const CID_KEY = "exiozz-cid";
  const cid = (() => {
    try { let v = localStorage.getItem(CID_KEY); if (!v || !/^[a-z0-9-]{16,64}$/i.test(v)) { v = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)); localStorage.setItem(CID_KEY, v); } return v; }
    catch (e) { return "tmp-" + Math.random().toString(36).slice(2).padEnd(16, "0"); }
  })();
  const API = UI.Account.API;

  /* ---------- « En ce moment sur le site » : un signe toutes les 45 s tant que l'onglet est visible ---------- */
  const presenceEls = () => document.querySelectorAll("[data-presence]");
  const beat = async () => {
    if (document.hidden || !presenceEls().length) return;
    try {
      const r = await fetch(`${API}/api/presence`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cid, page: PAGE }) });
      if (!r.ok) return;
      const d = await r.json(), n = Math.max(1, d.online || 1);
      presenceEls().forEach(el => {
        const t = el.querySelector("[data-presence-text]") || el;
        const prev = +el.dataset.n || 0; el.dataset.n = n;
        t.textContent = n === 1 ? "Only you here right now" : `${n} people here right now`;
        el.hidden = false;
        if (prev && prev !== n && !reduce) el.animate([{ transform: "scale(1)" }, { transform: "scale(1.06)" }, { transform: "scale(1)" }], { duration: 400 });
      });
    } catch (e) {}
  };
  beat(); setInterval(beat, 45000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) beat(); });

  window.UI.cid = cid;
  window.UI.palette = { add: fn => providers.push(fn), open: openPal };
  window.UI.game = Game;
  window.UI.copyDiscord = copyDiscord;
})();
