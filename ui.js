/*
 * Exiozz — interface partagée par index.html et shop.html :
 * messages (toast), menu de connexion, thème clair / sombre, compteur Discord en direct, easter egg.
 */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  /* Messages */
  const toast = msg => {
    const t = $("#toast"); if (!t) return;
    t.textContent = msg; t.classList.add("open");
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("open"), 2600);
  };
  document.addEventListener("click", e => { const t = e.target.closest("[data-toast]"); if (t) toast(t.dataset.toast); });

  /* Menu de connexion (Roblox / Discord) */
  const login = $("#login"), loginBtn = $("#login-btn");
  if (login && loginBtn) {
    const setLogin = o => { login.classList.toggle("open", o); loginBtn.setAttribute("aria-expanded", o); };
    loginBtn.addEventListener("click", e => { e.stopPropagation(); setLogin(!login.classList.contains("open")); });
    document.addEventListener("click", e => { if (!e.target.closest("#login")) setLogin(false); });
    $("#login-menu").addEventListener("click", e => { if (e.target.closest("button, a")) setLogin(false); });
    addEventListener("keydown", e => { if (e.key === "Escape") setLogin(false); });
  }

  /* Thème clair / sombre (le choix est appliqué avant l'affichage par le petit script du <head>) */
  const root = document.documentElement;
  const themeBtn = $("#theme-btn");
  const paintBtn = () => {
    if (!themeBtn) return;
    const light = root.dataset.theme === "light";
    themeBtn.setAttribute("aria-label", light ? "Switch to dark mode" : "Switch to light mode");
    themeBtn.innerHTML = light
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
  };
  const applyTheme = t => {
    root.dataset.theme = t; store.set("exiozz-theme", t); paintBtn();
    document.dispatchEvent(new CustomEvent("themechange", { detail: t }));
  };
  // Le nouveau thème se dévoile en cercle depuis le bouton : tout change en même temps, sans clignotement
  const setTheme = (t, from) => {
    if (reduce || !document.startViewTransition) { applyTheme(t); return; }
    const r = from ? from.getBoundingClientRect() : { left: innerWidth / 2, top: 0, width: 0, height: 0 };
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.classList.add("vt-theme");
    const vt = document.startViewTransition(() => applyTheme(t));
    vt.ready.then(() => root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
      { duration: 650, easing: "cubic-bezier(.65, 0, .35, 1)", pseudoElement: "::view-transition-new(root)" }));
    vt.finished.finally(() => root.classList.remove("vt-theme"));
  };
  themeBtn && themeBtn.addEventListener("click", () => setTheme(root.dataset.theme === "light" ? "dark" : "light", themeBtn));
  paintBtn();

  /* Compteur Discord en direct (l'API d'invitation de Discord est publique et autorise le navigateur) */
  const INVITE = "rGcdngHsCe";
  const fmt = n => Number(n).toLocaleString("en-US");
  const discord = async () => {
    const els = document.querySelectorAll("[data-discord]");
    if (!els.length) return;
    try {
      const r = await fetch(`https://discord.com/api/v9/invites/${INVITE}?with_counts=true`);
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      els.forEach(el => {
        const k = el.dataset.discord;
        if (k === "members") el.textContent = fmt(d.approximate_member_count);
        if (k === "online") el.textContent = fmt(d.approximate_presence_count);
        if (k === "name" && d.guild) el.textContent = d.guild.name;
      });
      document.querySelectorAll("[data-discord-live]").forEach(el => { el.hidden = false; });
    } catch (e) { /* hors ligne ou API indisponible : on garde le texte de repli */ }
  };
  discord();
  setInterval(discord, 60000);

  /* Easter egg : taper « roblox » fait pleuvoir des briques */
  const SECRET = "roblox";
  let typed = "";
  addEventListener("keydown", e => {
    if (e.target.closest("input, textarea") || e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-SECRET.length);
    if (typed === SECRET) { typed = ""; bricks(); }
  });
  function bricks() {
    toast("Easter egg found · now type “play”");
    if (reduce) return;
    const colors = ["#e5484d", "#f5a524", "#3e8ef7", "#2fbf71", "#f2f2f2", "#8f8f8f"];
    const layer = document.createElement("div");
    layer.setAttribute("aria-hidden", "true");
    layer.style.cssText = "position:fixed;inset:0;z-index:95;pointer-events:none;overflow:hidden";
    document.body.appendChild(layer);
    const W = innerWidth, H = innerHeight, list = [];
    for (let i = 0; i < 46; i++) {
      const w = 34 + Math.random() * 46, h = w * .5, el = document.createElement("div");
      const c = colors[i % colors.length];
      el.style.cssText = `position:absolute;left:0;top:0;width:${w}px;height:${h}px;border-radius:5px;background:${c};box-shadow:inset 0 -4px 0 rgba(0,0,0,.18),inset 0 2px 0 rgba(255,255,255,.35);`;
      // les « studs » sur le dessus de la brique
      const studs = Math.max(2, Math.round(w / 18));
      for (let s = 0; s < studs; s++) {
        const d = document.createElement("i");
        d.style.cssText = `position:absolute;top:-5px;left:${(s + .5) * (w / studs) - 6}px;width:12px;height:6px;border-radius:3px 3px 0 0;background:${c};box-shadow:inset 0 2px 0 rgba(255,255,255,.35)`;
        el.appendChild(d);
      }
      layer.appendChild(el);
      list.push({ el, w, h, x: Math.random() * (W - w), y: -60 - Math.random() * H * .9, vx: (Math.random() - .5) * 2, vy: 0, r: Math.random() * 360, vr: (Math.random() - .5) * 8, rest: 0 });
    }
    const start = performance.now();
    const tick = now => {
      const t = now - start;
      list.forEach(b => {
        b.vy += .45; b.x += b.vx; b.y += b.vy; b.r += b.vr;
        if (b.y + b.h > H - 2) { b.y = H - b.h - 2; b.vy *= -.35; b.vx *= .8; b.vr *= .6; if (Math.abs(b.vy) < 1) { b.vy = 0; b.r += (Math.round(b.r / 180) * 180 - b.r) * .2; } }
        if (b.x < 0 || b.x + b.w > W) b.vx *= -1;
        b.el.style.transform = `translate(${b.x}px, ${b.y}px) rotate(${b.r}deg)`;
      });
      layer.style.opacity = t > 5200 ? Math.max(0, 1 - (t - 5200) / 800) : 1;
      if (t < 6000) requestAnimationFrame(tick); else layer.remove();
    };
    requestAnimationFrame(tick);
  }

  /* ---------- Tiroirs : panier, mes commandes, espace admin ---------- */
  const X = window.Exiozz;
  const icons = () => window.lucide && lucide.createIcons();
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const scrim = document.createElement("div");
  scrim.className = "drawer-scrim";
  document.body.appendChild(scrim);
  const makeDrawer = (id, title, wide) => {
    const d = document.createElement("aside");
    d.className = "drawer" + (wide ? " wide" : ""); d.id = id;
    d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-label", title); d.setAttribute("aria-hidden", "true");
    d.innerHTML = `<div class="drawer-head"><b>${title}</b><button class="drawer-x" data-close aria-label="Close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div><div class="drawer-body"></div><div class="drawer-foot"></div>`;
    document.body.appendChild(d);
    return d;
  };
  const cartD = makeDrawer("cart-drawer", "My cart");
  cartD.classList.add("cart-pop");
  cartD.insertAdjacentHTML("afterbegin", '<span class="pop-grab" aria-hidden="true"></span>');
  cartD.querySelector(".drawer-head b").innerHTML = `Cart <span class="c-count" id="c-count"></span>`;
  const ordersD = makeDrawer("orders-drawer", "My orders");
  const adminD = makeDrawer("admin-drawer", "Admin area", true);
  const chatD = makeDrawer("chat-drawer", "Messages");
  chatD.classList.add("chat-drawer");
  let openD = null;
  // Le panier s'ouvre en carte sous l'icône du panier (ordi) ou en carte qui monte du bas (mobile)
  const isSheet = () => innerWidth <= 640;
  const placeCart = () => {
    const btn = document.querySelector(".nav-tools .icon-btn[data-open-cart]");
    if (!btn || isSheet()) return;
    const r = btn.getBoundingClientRect(), right = Math.max(12, innerWidth - r.right - 12);
    cartD.style.setProperty("--pop-top", `${r.bottom + 14}px`);
    cartD.style.setProperty("--pop-right", `${right}px`);
    cartD.style.setProperty("--caret", `${innerWidth - r.right + r.width / 2 - right - 7}px`);
  };
  addEventListener("resize", () => { if (openD === cartD) placeCart(); });
  const open = d => {
    if (openD && openD !== d) close(openD, true);
    const pop = d === cartD;
    if (pop) placeCart();
    openD = d; render(d); d.classList.add("open"); d.setAttribute("aria-hidden", "false");
    scrim.classList.toggle("clear", pop && !isSheet()); scrim.classList.add("open");
    if (!pop || isSheet()) document.documentElement.style.overflow = "hidden";
    setTimeout(() => d.querySelector("[data-close]").focus({ preventScroll: true }), 60);
  };
  const close = (d, keep) => {
    d.classList.remove("open"); d.setAttribute("aria-hidden", "true"); d.style.removeProperty("--drag");
    if (!keep) { scrim.classList.remove("open"); document.documentElement.style.overflow = ""; openD = null; }
  };
  // Mobile : on glisse la carte vers le bas pour la fermer
  {
    let y0 = null, dy = 0;
    cartD.addEventListener("pointerdown", e => { if (!isSheet() || !e.target.closest(".drawer-head, .pop-grab")) return; y0 = e.clientY; dy = 0; cartD.classList.add("dragging"); cartD.setPointerCapture(e.pointerId); });
    cartD.addEventListener("pointermove", e => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); cartD.style.setProperty("--drag", dy + "px"); });
    const end = () => { if (y0 === null) return; y0 = null; cartD.classList.remove("dragging"); if (dy > 90) close(cartD); else cartD.style.removeProperty("--drag"); };
    cartD.addEventListener("pointerup", end); cartD.addEventListener("pointercancel", end);
  }
  // Ajout au panier : l'image de l'article vole jusqu'à l'icône, qui saute
  let flyFrom = null, flyAt = 0, lastCount = null;
  document.addEventListener("click", e => { const b = e.target.closest("[data-add], [data-quick], [data-svc]"); if (b) { flyFrom = b; flyAt = performance.now(); } }, true);
  const flyToCart = () => {
    const icon = document.querySelector(".nav-tools .icon-btn[data-open-cart]"); if (!icon) return;
    const ir = icon.getBoundingClientRect();
    const bump = () => icon.animate([{ transform: "scale(1)" }, { transform: "scale(1.3) rotate(-8deg)" }, { transform: "scale(.92)" }, { transform: "none" }], { duration: 520, easing: "cubic-bezier(.34, 1.56, .64, 1)" });
    const src = flyFrom && flyFrom.isConnected ? flyFrom : null;
    const card = src && src.closest("article, .modal-in, .c-sug-item, .plan, .ci");
    const img = card && card.querySelector("img");
    if (reduce || !src || !document.body.contains(src)) { bump(); return; }
    const from = (img || src).getBoundingClientRect();
    const fly = document.createElement(img ? "img" : "span");
    fly.className = "fly-item"; fly.setAttribute("aria-hidden", "true");
    if (img) fly.src = img.currentSrc || img.src;
    const size = Math.min(72, from.width, from.height) || 40;
    fly.style.cssText = `left:${from.left + from.width / 2 - size / 2}px;top:${from.top + from.height / 2 - size / 2}px;width:${size}px;height:${size}px`;
    document.body.appendChild(fly);
    const dx = ir.left + ir.width / 2 - (from.left + from.width / 2), dy = ir.top + ir.height / 2 - (from.top + from.height / 2);
    fly.animate([
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * .5}px, ${dy * .5 - 80}px) scale(.7)`, opacity: 1, offset: .55 },
      { transform: `translate(${dx}px, ${dy}px) scale(.18)`, opacity: .4 }
    ], { duration: 750, easing: "cubic-bezier(.5, 0, .3, 1)" }).finished.then(() => { fly.replaceWith(); bump(); });
  };
  document.addEventListener("cartchange", () => {
    const n = X.Cart.count();
    if (lastCount !== null && n > lastCount && performance.now() - flyAt < 600) flyToCart();
    lastCount = n;
  });
  lastCount = X.Cart.count();
  scrim.addEventListener("click", () => openD && close(openD));
  document.addEventListener("click", e => { const b = e.target.closest("[data-close]"); if (b) close(b.closest(".drawer")); });
  addEventListener("keydown", e => { if (e.key === "Escape" && openD) close(openD); });


  /* Panier : feuille flottante, cartes d'articles visuelles, suggestions quand il est vide */
  const thumb = i => i.img
    ? `<img src="${esc(i.img)}" alt="">`
    : `<span class="ci-svc"><i data-lucide="${i.kind === "service" ? "sparkles" : "box"}"></i></span>`;
  const linePrice = (i, list) => {
    const now = X.Cart.priceOf(i, list);
    return now < i.eur ? `<span class="pr"><s>${X.money(i.eur)}</s><b>${X.money(now)}</b></span>` : `<span class="pr"><b>${X.money(i.eur)}</b></span>`;
  };
  const renderCart = () => {
    const t = X.Cart.totals("eur"), n = t.list.length;
    $("#c-count").textContent = n ? n : "";
    const body = cartD.querySelector(".drawer-body"), foot = cartD.querySelector(".drawer-foot");
    if (!n) {
      const picks = X.PRODUCTS.slice().sort((a, b) => a.rank - b.rank).slice(0, 3);
      body.innerHTML = `<div class="c-empty">
          <div class="c-stack" aria-hidden="true">${picks.map(p => `<img src="${esc(p.cover)}" alt="">`).join("")}</div>
          <b>Your cart is empty</b><span>Pick an asset below, or add a service from the pricing.</span>
        </div>
        <div class="c-sug-title">Popular right now</div>
        <div class="c-sug">${picks.map(p => `<div class="c-sug-item"><img src="${esc(p.cover)}" alt=""><div><b>${esc(p.name)}</b><span>${esc(p.catLabel)}</span></div>${X.priceHTML(p.eur, "eur")}<button class="c-add" data-quick="${esc(p.id)}" aria-label="Add ${esc(p.name)}"><i data-lucide="plus"></i></button></div>`).join("")}</div>`;
      foot.innerHTML = `<a class="btn btn-o wide" href="shop.html"><i data-lucide="shopping-bag"></i>Browse the shop</a>`;
      return;
    }
    const nudge = t.bundleMissing ? `<div class="c-bundle"><i data-lucide="gift"></i><span>Add <b>${t.bundleMissing} more asset${t.bundleMissing > 1 ? "s" : ""}</b> and get <b>−${X.BUNDLE.pct}%</b> on every asset</span><a href="shop.html#catalog">Shop</a></div>`
      : t.bundleOff > 0 ? `<div class="c-bundle on"><i data-lucide="badge-check"></i><span>Bundle unlocked · <b>−${X.BUNDLE.pct}%</b> on every asset</span></div>` : "";
    body.innerHTML = nudge + `<div class="c-items">${t.list.map((i, k) => `<article class="ci" style="--i:${k}">
        <div class="ci-img">${thumb(i)}</div>
        <div class="ci-info"><span class="ci-kind">${i.kind === "service" ? "Service · starting price" : esc(i.cat || "Asset")}</span><b>${esc(i.name)}</b>${linePrice(i, t.list)}</div>
        <button class="ci-rm" data-rm="${esc(i.id)}" aria-label="Remove ${esc(i.name)}"><i data-lucide="x"></i></button>
      </article>`).join("")}</div>`;
    foot.innerHTML = `<div id="cart-promo"></div>
      <div class="c-sum">
        <div><span>Subtotal · ${n} item${n > 1 ? "s" : ""}</span><span>${X.money(t.sub)}</span></div>
        ${t.bundleOff > 0 ? `<div class="disc"><span>Bundle · ${X.BUNDLE.min}+ assets −${X.BUNDLE.pct}%</span><span>−${X.money(t.bundleOff)}</span></div>` : ""}
        ${t.promoOff > 0 ? `<div class="disc"><span>Code ${esc(X.Promo.active().code)}</span><span>−${X.money(t.promoOff)}</span></div>` : ""}
      </div>
      <button class="c-pay" id="checkout"><span>Checkout</span><b>${X.money(t.total)}</b><i data-lucide="arrow-right"></i></button>
      <p class="c-note"><i data-lucide="shield-check"></i>Pay with PayPal or Robux · services confirmed by quote</p>`;
    X.mountPromoForm(foot.querySelector("#cart-promo"));
  };
  document.addEventListener("click", e => {
    const q = e.target.closest("[data-quick]"); if (!q) return;
    X.Cart.add(q.dataset.quick); toast("Added to cart");
  });
  // retrait animé : la carte glisse et se replie avant de quitter le panier
  document.addEventListener("click", e => {
    const b = e.target.closest(".ci-rm"); if (!b) return;
    e.stopImmediatePropagation();
    const card = b.closest(".ci");
    if (reduce) { X.Cart.remove(b.dataset.rm); return; }
    card.animate([{ opacity: 1, transform: "none", height: card.offsetHeight + "px" }, { opacity: 0, transform: "translateX(40px)", height: card.offsetHeight + "px", offset: .6 }, { opacity: 0, transform: "translateX(40px)", height: "0px", marginTop: "-10px" }],
      { duration: 380, easing: "cubic-bezier(.65, 0, .35, 1)" }).finished.then(() => X.Cart.remove(b.dataset.rm));
  }, true);
  /* ---------- Compte : connexion Discord via le serveur Cloudflare ---------- */
  const API = "https://exiozz-shop.tomokari-perso.workers.dev";
  const DISCORD_CLIENT_ID = "1540486396287000626";
  const ADMIN_ID = "799725583213920276";
  const SESSION_KEY = "exiozz_discord_session"; // même clé que l'ancien site : la session est gardée
  const PAGE = /shop\.html$/.test(location.pathname) ? "shop" : "index";
  let user = null;
  {
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.get("token")) {
      user = { id: h.get("discord_id"), name: h.get("discord_user"), avatar: h.get("discord_avatar"), token: h.get("token") };
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(user)); } catch (e) {}
    } else {
      try { const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); if (s && s.token) user = s; } catch (e) {}
    }
    if (h.get("login_error")) setTimeout(() => toast("Discord sign-in failed, please try again."), 400);
    if (h.get("token") || h.get("login_error")) history.replaceState({}, "", location.pathname + location.search);
    if (h.get("token")) setTimeout(() => toast(`Signed in as ${user.name}`), 400);
  }
  const isAdmin = () => !!user && user.id === ADMIN_ID;
  const signIn = () => {
    location.href = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(API + "/auth/discord")}&response_type=code&scope=identify&state=${PAGE}`;
  };
  const signOut = () => { user = null; try { localStorage.removeItem(SESSION_KEY); } catch (e) {} paintAccount(); emit("authchange"); toast("Signed out"); };
  const emit = n => document.dispatchEvent(new CustomEvent(n));
  // Appel au serveur avec le jeton de session ; une session expirée déconnecte proprement
  const api = async (path, opts = {}) => {
    const res = await fetch(API + path, { ...opts, headers: { ...(opts.body ? { "Content-Type": "application/json" } : {}), ...(user ? { Authorization: "Bearer " + user.token } : {}), ...(opts.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && user) { user = null; try { localStorage.removeItem(SESSION_KEY); } catch (e) {} paintAccount(); emit("authchange"); }
    if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
    return data;
  };
  const needSignIn = msg => toast(msg || "Sign in with Discord first");

  /* Menu du compte dans la barre */
  const discordSvg = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.1.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.029 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.42 0-1.333.956-2.418 2.157-2.418 1.21 0 2.176 1.095 2.157 2.419 0 1.333-.956 2.419-2.157 2.419Zm7.975 0c-1.183 0-2.157-1.086-2.157-2.42 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.095 2.157 2.419 0 1.333-.946 2.419-2.157 2.419Z"/></svg>';
  const avatarOf = u => u.avatar || "https://cdn.discordapp.com/embed/avatars/0.png";
  let unreadN = 0;
  function paintAccount() {
    const btn = $("#login-btn"), menu = $("#login-menu");
    if (!btn || !menu) return;
    if (user) {
      btn.innerHTML = `<img class="acc-av" src="${esc(avatarOf(user))}" alt=""><span>${esc(user.name)}</span>${unreadN ? '<i class="acc-dot" aria-label="New messages"></i>' : ""}`;
      menu.innerHTML = `<div class="acc-head"><img src="${esc(avatarOf(user))}" alt=""><div><b>${esc(user.name)}</b><span>${isAdmin() ? "Admin" : "Signed in with Discord"}</span></div></div>
        <button role="menuitem" data-open-orders><i data-lucide="package"></i>My orders${unreadN && !isAdmin() ? `<span class="m-dot">${unreadN}</span>` : ""}</button>
        <button role="menuitem" data-open-cart><i data-lucide="shopping-cart"></i>My cart</button>
        <button role="menuitem" data-open-wish><i data-lucide="heart"></i>Wishlist</button>
        ${isAdmin() ? `<button role="menuitem" data-open-admin><i data-lucide="lock"></i>Admin area${unreadN ? `<span class="m-dot">${unreadN}</span>` : ""}</button>` : ""}
        <button role="menuitem" data-signout><i data-lucide="log-out"></i>Sign out</button>`;
    } else {
      btn.innerHTML = `<i data-lucide="log-in"></i><span>Sign in</span>`;
      menu.innerHTML = `<span class="login-title">Sign in</span>
        <button role="menuitem" data-signin>${discordSvg}Continue with Discord</button>
        <button role="menuitem" data-toast="Roblox sign-in is coming soon — use Discord for now"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" transform="rotate(15 12 12)" fill="currentColor"/><rect x="10" y="10" width="4" height="4" transform="rotate(15 12 12)" fill="var(--menu)"/></svg>Roblox <span class="soon">Soon</span></button>
        <span class="login-note">Sign in to order, track your orders and leave a review</span>`;
    }
    icons();
  }
  paintAccount();
  document.addEventListener("click", e => {
    if (e.target.closest("[data-signin]")) signIn();
    if (e.target.closest("[data-signout]")) signOut();
  });

  /* Statuts du serveur (en français côté serveur, affichés en anglais) */
  const STATUS_EN = { "En attente de contact": "Awaiting contact", "Confirmée": "Confirmed", "En construction": "In progress", "En pause": "Paused", "Payée": "Paid", "Annulée": "Cancelled" };
  const STATUSES = Object.keys(STATUS_EN);
  const stEn = s => STATUS_EN[s] || s;
  const statusClass = s => ({ "Payée": "ok", "Confirmée": "run", "En construction": "run", "Annulée": "off" }[s] || "wait");
  const fmtWhen = ts => new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const curOf = o => (o.currency === "R$" ? "rbx" : "eur");
  const loading = el => { el.innerHTML = `<div class="d-empty"><i data-lucide="loader"></i><span>Loading…</span></div>`; icons(); };
  const errorBox = (el, msg) => { el.innerHTML = `<div class="d-empty"><i data-lucide="wifi-off"></i><b>Couldn't load</b><span>${esc(msg)}</span></div>`; icons(); };
  const filesHTML = o => (o.files || []).length ? `<div class="o-files">${o.files.map(f => `<button class="o-file" data-file="${esc(f.id)}"><i data-lucide="${f.kind === "link" ? "link" : "download"}"></i><span>${esc(f.name)}</span><small>until ${fmtWhen(f.expiresAt)}</small></button>`).join("")}</div>` : "";

  /* Passer commande : envoie le panier au serveur, tu valides ensuite à la main */
  async function checkout(btn) {
    if (!user) { needSignIn("Sign in with Discord to place your order"); setTimeout(signIn, 900); return; }
    const t = X.Cart.totals("eur"), promo = X.Promo.active();
    if (!t.list.length) return;
    btn.disabled = true;
    try {
      const items = t.list.map(i => {
        const d = X.Cart.deal(i, t.list), tag = d.by === "bundle" ? ` (bundle −${d.pct}%)` : d.by === "promo" ? ` (code ${promo.code})` : "";
        return { title: i.name + tag, price: X.Cart.priceOf(i, t.list), productId: i.kind === "asset" ? i.id : undefined, type: i.kind === "service" ? "service" : "asset" };
      });
      const r = await api("/api/order", { method: "POST", body: JSON.stringify({ items, currency: "€", source: PAGE, promo: promo ? promo.code : undefined }) });
      X.Cart.clear();
      toast("Order sent · Exiozz will contact you on Discord");
      open(ordersD);
      return r;
    } catch (e) { toast(e.message); btn.disabled = false; }
  }

  /* Suivi de commande : Reçue → Confirmée → En construction → Livrée */
  const STEPS = [["Received", "inbox"], ["Confirmed", "circle-check"], ["In progress", "hammer"], ["Delivered", "package-check"]];
  const stepOf = o => ({ "En attente de contact": 0, "Confirmée": 1, "En construction": 2, "En pause": 2, "Payée": 3 }[o.status] ?? 0);
  const timeline = o => {
    if (o.status === "Annulée") return `<div class="o-line off"><i data-lucide="circle-x"></i>This order was cancelled</div>`;
    const at = stepOf(o), paused = o.status === "En pause", end = at === STEPS.length - 1;
    return `<ol class="o-steps" style="--at:${at}" aria-label="Order progress: ${esc(stEn(o.status))}">${STEPS.map(([l, ic], k) => `<li class="${k < at || end ? "done" : k === at ? (paused ? "now paused" : "now") : ""}"${k === at ? ' aria-current="step"' : ""}><span class="o-dot"><i data-lucide="${k < at || end ? "check" : k === at && paused ? "pause" : ic}"></i></span><small>${k === at && paused ? "Paused" : l}</small></li>`).join("")}</ol>`;
  };

  /* Mes commandes */
  async function renderOrders() {
    const body = ordersD.querySelector(".drawer-body");
    ordersD.querySelector(".drawer-foot").innerHTML = "";
    if (!user) {
      body.innerHTML = `<div class="d-empty"><i data-lucide="lock"></i><b>Sign in to see your orders</b><span>Your orders are linked to your Discord account</span><button class="btn btn-w" data-signin>${discordSvg}Continue with Discord</button></div>`;
      icons(); return;
    }
    loading(body);
    try {
      const list = await api(`/api/orders/${encodeURIComponent(user.id)}`);
      body.innerHTML = list.length ? list.map(o => `<div class="o-card">
          <div class="o-top"><b>#${esc(String(o.id).slice(-6).toUpperCase())}</b><span class="st ${statusClass(o.status)}">${esc(stEn(o.status))}</span></div>
          <span class="o-date">${fmtWhen(o.timestamp)}</span>
          ${timeline(o)}
          <ul>${(o.items || []).map(i => `<li><span>${esc(i.title)}</span><span>${X.money(i.price, curOf(o))}</span></li>`).join("")}</ul>
          ${filesHTML(o)}
          <div class="o-tot"><span>Total</span><b>${X.money(o.total || 0, curOf(o))}</b></div>
          <button class="btn ${o.unread ? "btn-w" : "btn-o"} wide o-chat" data-chat="${esc(o.id)}"><i data-lucide="message-circle"></i>${o.unread ? "New message from Exiozz" : "Message Exiozz"}${o.unread ? '<span class="m-dot">1</span>' : ""}</button></div>`).join("")
        : `<div class="d-empty"><i data-lucide="package"></i><b>No orders yet</b><span>Your orders will show up here</span><a class="btn btn-w" href="shop.html">Open the shop</a></div>`;
      icons();
    } catch (e) { errorBox(body, e.message); }
  }
  // Téléchargement : le serveur donne un lien signé valable 10 minutes
  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-file]"); if (!b) return;
    b.disabled = true;
    try { const r = await api(`/api/files/${encodeURIComponent(b.dataset.file)}/link`); window.open(r.url, "_blank", "noopener"); }
    catch (err) { toast(err.message); }
    b.disabled = false;
  });

  /* ---------- Messagerie d'une commande (client ⇄ admin) ---------- */
  let chat = null; // { id, back, msgs, timer, sending }
  const openChat = (id, back) => { if (chat && chat.timer) clearInterval(chat.timer); chat = { id, back: back || openD || (isAdmin() ? adminD : ordersD), msgs: null }; open(chatD); };
  const dayKey = ts => new Date(ts).toDateString();
  const dayLbl = ts => { const d = new Date(ts), n = new Date(); const y = new Date(n - 864e5); return d.toDateString() === n.toDateString() ? "Today" : d.toDateString() === y.toDateString() ? "Yesterday" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); };
  const hhmm = ts => new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const linkify = t => esc(t).replace(/https?:\/\/[^\s<]+/g, u => `<a href="${u}" target="_blank" rel="noopener nofollow">${u}</a>`);
  function paintMsgs(data) {
    const list = chatD.querySelector(".ch-list"); if (!list) return;
    const me = isAdmin() ? "admin" : "client";
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    let html = "", prevDay = "", prevFrom = "";
    if (!data.messages.length) html = `<div class="ch-empty"><i data-lucide="messages-square"></i><b>${isAdmin() ? "Start the conversation" : "Questions about your order?"}</b><span>${isAdmin() ? "The client gets a Discord DM with your message." : "Write here — Exiozz gets notified and replies on this page."}</span></div>`;
    data.messages.forEach((m, i) => {
      if (dayKey(m.ts) !== prevDay) { html += `<div class="ch-day">${dayLbl(m.ts)}</div>`; prevDay = dayKey(m.ts); prevFrom = ""; }
      const mine = m.from === me, next = data.messages[i + 1];
      const tail = !next || next.from !== m.from || dayKey(next.ts) !== dayKey(m.ts);
      const seen = mine && tail && !next && data.seenUntil >= m.ts;
      html += `<div class="ch-msg ${mine ? "me" : "them"}${prevFrom === m.from ? " cont" : ""}${tail ? " tail" : ""}"><p>${linkify(m.text)}</p>${tail ? `<span>${hhmm(m.ts)}${seen ? " · Seen" : ""}</span>` : ""}</div>`;
      prevFrom = m.from;
    });
    list.innerHTML = html; icons();
    if (atBottom || !chat.painted) list.scrollTop = list.scrollHeight;
    chat.painted = true; chat.msgs = data.messages.length; chat.seen = data.seenUntil;
  }
  async function loadMsgs(first) {
    if (!chat) return;
    try {
      const data = await api(`/api/orders/${encodeURIComponent(chat.id)}/messages`);
      if (openD !== chatD) return;
      if (first) {
        const c = data.client, who = chatD.querySelector(".ch-who");
        if (who) who.innerHTML = isAdmin()
          ? `${c.avatar ? `<img src="${esc(c.avatar)}" alt="">` : `<span class="ch-av">${esc((c.name || "?").charAt(0).toUpperCase())}</span>`}<div><b>${esc(c.name || "Client")}</b><span>${c.username ? "@" + esc(c.username) : "Order #" + esc(chat.id.slice(-6).toUpperCase())}</span></div>`
          : `<span class="ch-av brand"></span><div><b>Exiozz</b><span>Order #${esc(chat.id.slice(-6).toUpperCase())} · usually replies within a few hours</span></div>`;
      }
      if (first || data.messages.length !== chat.msgs || data.seenUntil !== chat.seen) paintMsgs(data);
      if (first) checkUnread();
    } catch (e) { if (first) errorBox(chatD.querySelector(".ch-list"), e.message); }
  }
  function renderChat() {
    if (!chat) return;
    chatD.querySelector(".drawer-head b").textContent = "Messages";
    chatD.querySelector(".drawer-body").innerHTML = `<button class="ch-back" data-chat-back><i data-lucide="arrow-left"></i>${isAdmin() ? "All orders" : "My orders"}</button><div class="ch-who"></div><div class="ch-list" aria-live="polite"></div>`;
    chatD.querySelector(".drawer-foot").innerHTML = `<form class="ch-form" data-chat-form><label class="sr" for="ch-in">Message</label><textarea id="ch-in" rows="1" maxlength="2000" placeholder="Write a message…" enterkeyhint="send"></textarea><button class="ch-send" aria-label="Send"><i data-lucide="arrow-up"></i></button></form>`;
    icons(); loading(chatD.querySelector(".ch-list"));
    chat.painted = false; chat.msgs = null;
    loadMsgs(true);
    clearInterval(chat.timer);
    chat.timer = setInterval(() => { if (openD !== chatD) { clearInterval(chat.timer); return; } if (!document.hidden) loadMsgs(false); }, 4000);
    setTimeout(() => { if (innerWidth > 640) $("#ch-in")?.focus(); }, 450);
  }
  async function sendMsg() {
    const ta = $("#ch-in"); if (!ta || !chat || chat.sending) return;
    const text = ta.value.trim(); if (!text) return;
    chat.sending = true; ta.value = ""; ta.style.height = "";
    // affichage immédiat, confirmé par le serveur juste après
    const list = chatD.querySelector(".ch-list");
    list.querySelector(".ch-empty")?.remove();
    list.insertAdjacentHTML("beforeend", `<div class="ch-msg me tail pending"><p>${linkify(text)}</p><span>Sending…</span></div>`);
    list.scrollTop = list.scrollHeight;
    try { const r = await api(`/api/orders/${encodeURIComponent(chat.id)}/messages`, { method: "POST", body: JSON.stringify({ text }) }); chat.painted = true; paintMsgs({ messages: r.messages, seenUntil: chat.seen || 0 }); list.scrollTop = list.scrollHeight; }
    catch (e) { list.querySelector(".pending")?.remove(); ta.value = text; toast(e.message); }
    chat.sending = false;
  }
  document.addEventListener("submit", e => { if (e.target.closest("[data-chat-form]")) { e.preventDefault(); sendMsg(); } });
  document.addEventListener("keydown", e => { if (e.target.id === "ch-in" && e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendMsg(); } });
  document.addEventListener("input", e => { if (e.target.id === "ch-in") { const t = e.target; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 140) + "px"; } });
  document.addEventListener("click", e => {
    const c = e.target.closest("[data-chat]"); if (c) { e.preventDefault(); openChat(c.dataset.chat, openD); return; }
    if (e.target.closest("[data-chat-back]")) { clearInterval(chat && chat.timer); open(chat && chat.back && chat.back !== chatD ? chat.back : (isAdmin() ? adminD : ordersD)); }
  });
  // Pastille « nouveau message » : vérifiée au chargement puis toutes les 60 s
  async function checkUnread() {
    if (!user) { if (unreadN) { unreadN = 0; paintAccount(); } return; }
    try { const r = await api("/api/messages/unread"); if (r.count !== unreadN) { const more = r.count > unreadN; unreadN = r.count; paintAccount(); if (more && openD !== chatD) toast(isAdmin() ? "New message from a client" : "New message from Exiozz"); } } catch (e) {}
  }
  setTimeout(checkUnread, 1200);
  setInterval(() => { if (!document.hidden) checkUnread(); }, 60000);
  document.addEventListener("authchange", checkUnread);
  // Lien reçu en MP Discord : shop.html#chat=<commande>
  {
    const hm = /^#chat=([\w-]+)$/.exec(location.hash);
    if (hm) { history.replaceState({}, "", location.pathname + location.search); setTimeout(() => user ? openChat(hm[1], isAdmin() ? adminD : ordersD) : (open(ordersD), toast("Sign in to read your message")), 500); }
  }

  /* Fiche commande complète : qui est le client, comment le joindre, ce qu'il a pris */
  const SRC = { shop: "Shop", index: "Portfolio", admin: "Created by you", site: "Website", quote: "Quote form" };
  const ago = ts => { const m = Math.round((Date.now() - ts) / 6e4); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
  function orderCard(o) {
    const id = esc(o.discordId || ""), uname = o.discordUsername ? esc(o.discordUsername) : "";
    const initial = esc((o.customerName || "?").trim().charAt(0).toUpperCase());
    const items = (o.items || []).map(i => `<li><span>${esc(i.title)}${i.offer === "pass" ? " <em>· pass</em>" : ""}${i.type && i.type !== "asset" ? ` <em>· ${esc(i.type)}</em>` : ""}</span><b>${X.money(i.price || 0, curOf(o))}</b></li>`).join("");
    const files = (o.files || []).length ? `<div class="ao-meta"><i data-lucide="paperclip"></i>${o.files.length} file${o.files.length > 1 ? "s" : ""} delivered</div>` : "";
    return `<article class="ao">
      <header class="ao-head">
        ${o.avatar ? `<img class="ao-av" src="${esc(o.avatar)}" alt="" loading="lazy">` : `<span class="ao-av">${initial}</span>`}
        <div class="ao-who">
          <b>${esc(o.customerName || "?")}${o.clientOrders > 1 ? ` <span class="ao-badge">${o.clientOrders} orders</span>` : ""}</b>
          <span>${uname ? `@${uname}` : "Discord username unknown"}</span>
        </div>
        <div class="ao-total">${X.money(o.total || 0, curOf(o))}</div>
      </header>
      <div class="ao-contact">
        <button class="btn btn-w" data-chat="${esc(o.id)}"><i data-lucide="messages-square"></i>${o.unread ? "New message · reply" : `Chat${o.chat && o.chat.n ? ` · ${o.chat.n}` : ""}`}${o.unread ? '<span class="m-dot">1</span>' : ""}</button>
        <a class="btn btn-o" href="https://discord.com/users/${id}" target="_blank" rel="noopener"><i data-lucide="external-link"></i>Discord</a>
        ${uname ? `<button class="btn btn-o" data-acopy="${uname}" data-label="Username"><i data-lucide="at-sign"></i>Copy @</button>` : ""}
        <button class="btn btn-o" data-acopy="${id}" data-label="Discord ID"><i data-lucide="copy"></i>Copy ID</button>
      </div>
      <ul class="ao-items">${items}</ul>
      ${o.note ? `<blockquote class="ao-note">${esc(o.note)}</blockquote>` : ""}
      <div class="ao-grid">
        <div><span>Ordered</span><b>${fmtWhen(o.timestamp)}<br>${ago(o.timestamp)}</b></div>
        <div><span>From</span><b>${esc(SRC[o.source] || o.source || "—")}</b></div>
        <div><span>Pays in</span><b>${o.currency === "R$" ? "Robux" : "Euros"}</b></div>
        <div><span>Promo</span><b>${o.promo ? esc(o.promo) : "—"}</b></div>
        <div><span>Discord ID</span><b>${id || "—"}</b></div>
        <div><span>Order</span><b>#${esc(String(o.id).slice(-6))}</b></div>
      </div>
      ${files}
      <div class="ao-foot">
        <select class="a-select" aria-label="Order status" id="st-${esc(o.id)}" data-status="${esc(o.id)}">${STATUSES.map(s => `<option value="${s}"${s === o.status ? " selected" : ""}>${stEn(s)}</option>`).join("")}</select>
        <button class="c-rm" data-link="${esc(o.id)}" aria-label="Send a download link" title="Send a download link"><i data-lucide="link"></i></button>
        <button class="c-rm" data-del="${esc(o.id)}" aria-label="Delete order" title="Delete order"><i data-lucide="trash-2"></i></button>
      </div>
    </article>`;
  }
  /* Espace admin (réservé à ton compte Discord : le serveur le vérifie à chaque appel) */
  let adminTab = "orders", adminOrders = null;
  async function renderAdmin() {
    const body = adminD.querySelector(".drawer-body");
    adminD.querySelector(".drawer-foot").innerHTML = `<a class="btn btn-o wide" href="admin.html"><i data-lucide="folder-cog"></i>Full admin panel · files, asset library, new order</a>`;
    if (!isAdmin()) { body.innerHTML = `<div class="d-empty"><i data-lucide="lock"></i><b>Admin only</b><span>Sign in with the admin Discord account</span></div>`; icons(); return; }
    const tabs = [["orders", "Orders"], ["shop", "Shop"], ["prices", "Prices"], ["projects", "Projects"], ["photos", "Photos"], ["community", "Community"], ["promo", "Promo codes"], ["avail", "Availability"], ["shots", "Showcase"]];
    const head = `<div class="a-tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${k === adminTab}" data-atab="${k}">${l}</button>`).join("")}</div>`;
    if (adminTab === "orders") {
      body.innerHTML = head + `<div id="a-orders"></div>`; const box = $("#a-orders");
      loading(box);
      try {
        adminOrders = await api("/api/admin/orders");
        const pending = adminOrders.filter(o => o.status === "En attente de contact").length;
        const paid = adminOrders.filter(o => o.status === "Payée").reduce((s, o) => s + (o.currency === "R$" ? 0 : o.total || 0), 0);
        box.innerHTML = `<div class="a-stats"><div><b>${adminOrders.length}</b><span>Orders</span></div><div><b>${pending}</b><span>To contact</span></div><div><b>${X.money(Math.round(paid * 100) / 100)}</b><span>Paid (€)</span></div></div>` +
          (adminOrders.length ? `<div class="a-table">${adminOrders.map(orderCard).join("")}</div>`
            : `<div class="d-empty"><i data-lucide="inbox"></i><b>No orders yet</b><span>They show up here as soon as a client orders</span></div>`);
        icons();
      } catch (e) { errorBox(box, e.message); }
    } else if (adminTab === "avail") {
      body.innerHTML = head + `<div id="a-avail"></div>`; const box = $("#a-avail");
      loading(box);
      let a = { slots: null, note: "" };
      try { a = await api("/api/availability"); } catch (e) {}
      box.innerHTML = `<form class="a-form" id="avail-form">
          <p class="d-note" style="margin:0 0 16px">Shown on the homepage and the quote simulator, e.g. “2 slots left in ${new Date().toLocaleString("en-US", { month: "long" })}”. Leave empty to hide the number.</p>
          <label class="a-lbl">Free slots this month<div class="a-step"><button type="button" data-slot="-1" aria-label="One less">−</button><input name="slots" type="number" min="0" max="99" inputmode="numeric" value="${a.slots ?? ""}" placeholder="—"><button type="button" data-slot="1" aria-label="One more">+</button></div></label>
          <label class="a-lbl">Short note (optional)<input name="note" maxlength="140" value="${esc(a.note || "")}" placeholder="e.g. Back from holidays on the 5th"></label>
          <button class="btn btn-w wide">Save availability</button>
          ${a.updatedAt ? `<p class="d-note">Last updated ${fmtWhen(a.updatedAt)}</p>` : ""}
        </form>`;
    } else if (adminTab === "shots") {
      body.innerHTML = head + `<div id="a-shots"></div>`; const box = $("#a-shots");
      loading(box);
      try {
        const all = await (await fetch(API + "/api/asset-reviews")).json();
        const shots = Object.entries(all || {}).flatMap(([pid, list]) => (list || []).filter(r => r.image).map(r => ({ ...r, pid, pname: (X.PRODUCTS.find(p => p.id === pid) || { name: pid }).name })));
        box.innerHTML = shots.length ? `<p class="d-note" style="margin:0 0 14px">Screenshots buyers attached to their rating. They show under each asset in the shop (“Made with this asset”).</p><div class="a-shots">${shots.map(s => `<figure class="a-shot"><a href="${API}/api/shots/${encodeURIComponent(s.image)}" target="_blank" rel="noopener"><img src="${API}/api/shots/${encodeURIComponent(s.image)}" alt="" loading="lazy"></a><figcaption><b>${esc(s.name || "Buyer")}</b><span>${esc(s.pname)} · ${"★".repeat(s.rating)}</span></figcaption><button class="btn btn-o" data-ashot="${esc(s.pid)}|${esc(s.discordId)}"><i data-lucide="trash-2"></i>Remove image</button></figure>`).join("")}</div>`
          : `<div class="d-empty"><i data-lucide="image"></i><b>No screenshot yet</b><span>Buyers can add one with their rating in the shop</span></div>`;
        icons();
      } catch (e) { errorBox(box, e.message); }
    } else if (adminTab === "shop") {
      body.innerHTML = head + `<div id="a-shop"></div>`; renderShopAdmin($("#a-shop"));
    } else if (adminTab === "promo") {
      body.innerHTML = head + `<div id="a-promo"></div>`; renderPromoAdmin($("#a-promo"));
    } else if (adminTab === "prices") {
      body.innerHTML = head + `<div id="a-prices"></div>`; renderPricesAdmin();
    } else if (adminTab === "projects") {
      body.innerHTML = head + `<div id="a-projects"></div>`; renderProjectsAdmin();
    } else if (adminTab === "photos") {
      body.innerHTML = head + `<div id="a-photos"></div>`; renderPhotosAdmin();
    } else {
      body.innerHTML = head + `<div class="a-stats"><div><b data-discord="members">—</b><span>Discord members</span></div><div><b data-discord="online">—</b><span>Online</span></div><div><b id="a-rev">—</b><span>Reviews</span></div></div><div id="a-mod"></div>`;
      icons(); discord(); renderModeration();
    }
  }
  /* Shop : ajouter, modifier, masquer ou supprimer des assets (gardés sur le serveur) */
  const SHOP_CATS = X.CATEGORIES.filter(c => c[0] !== "all");
  const BADGES = ["New", "Best-seller", "Popular", "Sale", "Limited"];
  let shopEdit = null; // null = liste ; objet = formulaire (nouvel asset ou modification)
  const shrinkImg = file => new Promise((res, rej) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return rej(new Error("Use PNG, JPG or WebP images"));
    if (file.size > 20 * 1048576) return rej(new Error("Image too big (20 MB max)"));
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
      let out = c.toDataURL("image/webp", .84); if (!out.startsWith("data:image/webp")) out = c.toDataURL("image/jpeg", .86);
      res(out);
    };
    img.onerror = () => { URL.revokeObjectURL(u); rej(new Error("Couldn't read this image")); };
    img.src = u;
  });
  // f.elements.namedItem : « name » et « hidden » sont aussi des propriétés du formulaire lui-même
  const fld = (f, n) => f.elements.namedItem(n);
  const prodFromForm = f => ({
    ...shopEdit, name: fld(f, "name").value.trim(), cat: fld(f, "cat").value, eur: +fld(f, "eur").value, rbx: fld(f, "rbx").value ? +fld(f, "rbx").value : 0,
    badge: fld(f, "badge").value, desc: fld(f, "desc").value.trim(), tags: fld(f, "tags").value, hidden: fld(f, "hidden").checked
  });
  function renderShopAdmin(box) {
    box = box || $("#a-shop"); if (!box) return;
    if (!shopEdit) {
      const list = X.Catalog.all().sort((a, b) => (a.hidden - b.hidden) || (a.rank - b.rank));
      box.innerHTML = `<div class="a-shop-top"><p class="d-note" style="margin:0">Add new assets or edit the existing ones. Changes show in the shop right away, for everyone.</p><button class="btn btn-w" data-shop-new><i data-lucide="plus"></i>New asset</button></div>
        <div class="a-prods">${list.map(p => `<div class="a-prod${p.hidden ? " is-hidden" : ""}">
          <img src="${esc(p.cover)}" alt="" loading="lazy">
          <div class="a-prod-info"><b>${esc(p.name)}</b><span>${esc(p.catLabel || p.cat)} · ${X.money(p.eur)} · R$ ${p.rbx || Math.round(p.eur * 80)}</span>
            <div class="a-prod-tags">${p.hidden ? '<span class="st off">Hidden</span>' : '<span class="st ok">Visible</span>'}${p.builtin ? `<span class="st">${p.edited ? "Built-in · edited" : "Built-in"}</span>` : '<span class="st run">Added by you</span>'}</div></div>
          <div class="a-prod-acts">
            <button class="btn btn-o" data-shop-edit="${esc(p.id)}"><i data-lucide="pencil"></i>Edit</button>
            <button class="c-rm" data-shop-hide="${esc(p.id)}" aria-label="${p.hidden ? "Show" : "Hide"} ${esc(p.name)}" title="${p.hidden ? "Show in the shop" : "Hide from the shop"}"><i data-lucide="${p.hidden ? "eye" : "eye-off"}"></i></button>
            ${!p.builtin ? `<button class="c-rm" data-shop-del="${esc(p.id)}" aria-label="Delete ${esc(p.name)}" title="Delete"><i data-lucide="trash-2"></i></button>` : p.edited ? `<button class="c-rm" data-shop-reset="${esc(p.id)}" aria-label="Undo my changes on ${esc(p.name)}" title="Undo my changes"><i data-lucide="rotate-ccw"></i></button>` : ""}
          </div></div>`).join("")}</div>`;
      icons(); return;
    }
    const p = shopEdit, isNew = !p.id;
    box.innerHTML = `<form class="a-form a-prod-form" id="shop-form" novalidate>
        <button type="button" class="a-back" data-shop-back><i data-lucide="arrow-left"></i>All assets</button>
        <b class="a-form-t">${isNew ? "New asset" : "Edit · " + esc(p.name)}</b>
        <label class="a-lbl">Name <input name="name" maxlength="80" required value="${esc(p.name || "")}" placeholder="e.g. Medieval Castle Pack"></label>
        <div class="a-grid3">
          <label class="a-lbl">Category <select name="cat" class="a-select">${SHOP_CATS.map(([id, l]) => `<option value="${id}"${id === (p.cat || "models") ? " selected" : ""}>${l}</option>`).join("")}</select></label>
          <label class="a-lbl">Price (€) <input name="eur" type="number" min="0.5" step="0.5" required value="${p.eur || ""}" placeholder="e.g. 8"></label>
          <label class="a-lbl">Price (R$) <input name="rbx" type="number" min="1" step="10" value="${p.rbx || ""}" placeholder="€ × 80"></label>
        </div>
        <div class="a-grid2">
          <label class="a-lbl">Badge <select name="badge" class="a-select">${[...new Set([...BADGES, p.badge || "New"])].map(b => `<option${b === (p.badge || "New") ? " selected" : ""}>${esc(b)}</option>`).join("")}</select></label>
          <label class="a-lbl">Tags <input name="tags" maxlength="140" value="${esc(Array.isArray(p.tags) ? p.tags.join(", ") : p.tags || "")}" placeholder="e.g. Low Poly, FBX, Rigged"></label>
        </div>
        <label class="a-lbl">Description <textarea name="desc" maxlength="400" rows="3" placeholder="What's inside, what it's for…">${esc(p.desc || "")}</textarea></label>
        <div class="a-lbl">Images <span class="a-hint">The ★ one is the cover. PNG, JPG or WebP, resized automatically.</span></div>
        <div class="a-imgs" id="a-imgs">${(p.gallery || []).map(([src, cap], i) => `<div class="a-img${src === p.cover ? " cover" : ""}">
            <img src="${esc(src)}" alt=""><input data-cap="${i}" value="${esc(cap || "")}" placeholder="Caption" maxlength="80">
            <div class="a-img-acts"><button type="button" data-img-cover="${i}" aria-label="Use as cover" title="Use as cover">★</button><button type="button" data-img-left="${i}" aria-label="Move left"${i ? "" : " disabled"}>←</button><button type="button" data-img-del="${i}" aria-label="Remove image">×</button></div></div>`).join("")}
          <label class="a-img add"><input type="file" accept="image/png,image/jpeg,image/webp" multiple id="a-img-in" class="sr"><i data-lucide="image-plus"></i><span>Add images</span></label>
        </div>
        <label class="a-check"><input type="checkbox" name="hidden"${p.hidden ? " checked" : ""}><span>Hidden (not shown in the shop)</span></label>
        <button class="btn btn-w wide"><i data-lucide="save"></i>${isNew ? "Add to the shop" : "Save changes"}</button>
      </form>`;
    icons();
  }
  const syncCaptions = () => $$("#a-imgs [data-cap]").forEach(i => { shopEdit.gallery[+i.dataset.cap][1] = i.value; });
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const saveProd = async (p, msg) => {
    const body = { id: p.id, name: p.name, cat: p.cat, eur: p.eur, rbx: p.rbx, badge: p.badge, desc: p.desc, tags: Array.isArray(p.tags) ? p.tags : String(p.tags || "").split(","), cover: p.cover, gallery: p.gallery, hidden: !!p.hidden, rank: p.rank, builtin: !!p.builtin, isNew: !p.id };
    const r = await api("/api/admin/products", { method: "POST", body: JSON.stringify(body) });
    await X.Catalog.reload(); toast(msg); return r;
  };
  document.addEventListener("click", async e => {
    if (!e.target.closest("#a-shop")) return;
    if (e.target.closest("[data-shop-new]")) { shopEdit = { gallery: [], cat: "models", badge: "New" }; renderShopAdmin(); return; }
    if (e.target.closest("[data-shop-back]")) { shopEdit = null; renderShopAdmin(); return; }
    const ed = e.target.closest("[data-shop-edit]");
    if (ed) { const p = X.Catalog.all().find(x => x.id === ed.dataset.shopEdit); shopEdit = JSON.parse(JSON.stringify({ ...p, gallery: p.gallery && p.gallery.length ? p.gallery : [[p.cover, p.name]] })); renderShopAdmin(); return; }
    const hd = e.target.closest("[data-shop-hide]");
    if (hd) { const p = X.Catalog.all().find(x => x.id === hd.dataset.shopHide); hd.disabled = true; try { await saveProd({ ...p, hidden: !p.hidden }, p.hidden ? `${p.name} is visible again` : `${p.name} is hidden`); } catch (err) { toast(err.message); } renderShopAdmin(); return; }
    const dl = e.target.closest("[data-shop-del], [data-shop-reset]");
    if (dl) {
      const id = dl.dataset.shopDel || dl.dataset.shopReset, p = X.Catalog.all().find(x => x.id === id);
      if (!confirm(dl.dataset.shopDel ? `Delete ${p.name} from the shop? Its uploaded images are deleted too.` : `Undo your changes on ${p.name}? It goes back to its original version.`)) return;
      try { await api(`/api/admin/products/${encodeURIComponent(id)}`, { method: "DELETE" }); await X.Catalog.reload(); toast(dl.dataset.shopDel ? "Asset deleted" : "Back to the original version"); } catch (err) { toast(err.message); }
      renderShopAdmin(); return;
    }
    const cv = e.target.closest("[data-img-cover]"); if (cv) { syncCaptions(); shopEdit.cover = shopEdit.gallery[+cv.dataset.imgCover][0]; renderShopAdmin(); return; }
    const lf = e.target.closest("[data-img-left]"); if (lf) { syncCaptions(); const i = +lf.dataset.imgLeft, g = shopEdit.gallery; [g[i - 1], g[i]] = [g[i], g[i - 1]]; renderShopAdmin(); return; }
    const rm = e.target.closest("[data-img-del]"); if (rm) { syncCaptions(); const [src] = shopEdit.gallery.splice(+rm.dataset.imgDel, 1); if (shopEdit.cover === src) shopEdit.cover = (shopEdit.gallery[0] || [])[0]; renderShopAdmin(); }
  });
  document.addEventListener("change", async e => {
    if (e.target.id !== "a-img-in") return;
    const f = $("#shop-form"); Object.assign(shopEdit, prodFromForm(f)); syncCaptions();
    const files = [...e.target.files]; if (!files.length) return;
    const add = $(".a-img.add"); add.classList.add("busy"); add.querySelector("span").textContent = `Uploading ${files.length}…`;
    for (const file of files) {
      try { const data = await shrinkImg(file); const r = await api("/api/admin/images", { method: "POST", body: JSON.stringify({ image: data }) }); shopEdit.gallery.push([r.url, file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ")]); if (!shopEdit.cover) shopEdit.cover = r.url; }
      catch (err) { toast(err.message); }
    }
    renderShopAdmin();
  });
  document.addEventListener("submit", async e => {
    if (e.target.id !== "shop-form") return;
    e.preventDefault();
    const f = e.target; syncCaptions(); Object.assign(shopEdit, prodFromForm(f));
    if (!shopEdit.name) { toast("Give it a name"); fld(f, "name").focus(); return; }
    if (!(shopEdit.eur > 0)) { toast("Set a price in euros"); fld(f, "eur").focus(); return; }
    if (!shopEdit.gallery.length) { toast("Add at least one image"); return; }
    if (!shopEdit.cover) shopEdit.cover = shopEdit.gallery[0][0];
    const btn = f.querySelector(".btn-w"); btn.disabled = true;
    try { const isNew = !shopEdit.id; await saveProd(shopEdit, isNew ? `${shopEdit.name} added to the shop` : "Changes saved"); shopEdit = null; renderShopAdmin(); }
    catch (err) { toast(err.message); btn.disabled = false; }
  });
  document.addEventListener("catalogchange", () => { if (adminTab === "shop" && !shopEdit && openD === adminD) renderShopAdmin(); });

  /* ===== Contenu de l'accueil : tarifs, projets, photos (gardés sur le serveur) ===== */
  const SC = () => window.SiteContent;
  const deep = v => JSON.parse(JSON.stringify(v));
  const saveSection = async (section, value, msg) => {
    await api("/api/admin/content", { method: "POST", body: JSON.stringify({ section, value }) });
    await SC().reload(); toast(msg || "Saved · live on the site");
  };
  const resetSection = async (section, label) => {
    if (!confirm(`Restore the original ${label}? Your changes on this part are removed.`)) return false;
    await api(`/api/admin/content/${section}`, { method: "DELETE" }); await SC().reload(); toast("Original version restored"); return true;
  };
  const uploadImg = async file => (await api("/api/admin/images", { method: "POST", body: JSON.stringify({ image: await shrinkImg(file) }) })).url;

  /* Tarifs des services */
  let priceDraft = null, priceCat = "roblox";
  const syncPrices = () => {
    $$("#a-prices [data-svc-row]").forEach(row => {
      const k = +row.dataset.svcRow, r = priceDraft[priceCat][k]; if (!r) return;
      r[0] = row.querySelector("[data-f=name]").value; r[2] = +row.querySelector("[data-f=price]").value;
      r[3] = row.querySelector("[data-f=note]").value; r[1] = row.querySelector("[data-f=desc]").value;
      r[4] = row.querySelector("[data-f=feats]").value.split("\n").map(x => x.trim()).filter(Boolean);
    });
  };
  function renderPricesAdmin() {
    const box = $("#a-prices"); if (!box) return;
    if (!priceDraft) priceDraft = deep(SC().plans);
    const list = priceDraft[priceCat] || (priceDraft[priceCat] = []);
    box.innerHTML = `<p class="d-note" style="margin:0 0 12px">Starting prices shown in the Pricing tab and used by the quote simulator.${SC().edited().plans ? ' <b style="color:var(--accent)">Edited</b>' : ""}</p>
      <div class="cats a-pcats">${SC().CATS.map(([id, l]) => `<button type="button" aria-pressed="${id === priceCat}" data-pcat="${id}">${l}<span class="n">${(priceDraft[id] || []).length}</span></button>`).join("")}</div>
      <div class="a-svcs">${list.map(([n, d, eur, note, feats], k) => `<div class="a-svc" data-svc-row="${k}">
          <div class="a-svc-top"><input data-f="name" value="${esc(n)}" placeholder="Service name" maxlength="60" aria-label="Service name"><label class="a-price"><input data-f="price" type="number" min="0.5" step="0.5" value="${eur}" aria-label="Starting price in euros"><span>€</span></label><button type="button" class="c-rm" data-svc-del="${k}" aria-label="Delete ${esc(n)}"><i data-lucide="trash-2"></i></button></div>
          <input data-f="note" value="${esc(note || "")}" placeholder="Precision (e.g. per thumbnail)" maxlength="60" aria-label="Precision">
          <details><summary>Description and what's included</summary>
            <textarea data-f="desc" rows="2" maxlength="240" placeholder="Short description">${esc(d || "")}</textarea>
            <textarea data-f="feats" rows="3" placeholder="What's included, one per line">${esc((feats || []).join("\n"))}</textarea></details>
        </div>`).join("") || `<div class="d-empty" style="padding:24px"><span>No service in this category</span></div>`}</div>
      <button type="button" class="btn btn-o wide" data-svc-add><i data-lucide="plus"></i>Add a service</button>
      <div class="a-save"><button type="button" class="btn btn-w" data-prices-save><i data-lucide="save"></i>Save prices</button>${SC().edited().plans ? '<button type="button" class="btn btn-o" data-prices-reset><i data-lucide="rotate-ccw"></i>Restore original</button>' : ""}</div>`;
    icons();
  }

  /* Projets */
  let projEdit = null;
  function renderProjectsAdmin() {
    const box = $("#a-projects"); if (!box) return;
    const list = SC().projects;
    if (!projEdit) {
      box.innerHTML = `<div class="a-shop-top"><p class="d-note" style="margin:0">Project cards in the Projects tab.${SC().edited().projects ? ' <b style="color:var(--accent)">Edited</b>' : ""}</p><button class="btn btn-w" data-proj-new><i data-lucide="plus"></i>New project</button></div>
        <div class="a-prods">${list.map((p, i) => `<div class="a-prod"><img src="${esc(SC().imgSrc(p.img))}" alt="" loading="lazy">
          <div class="a-prod-info"><b>${esc(p.t)}</b><span>${esc(p.status || "Completed")}${(p.tech || []).length ? " · " + esc(p.tech.join(", ")) : ""}${p.universeId ? " · live stats on" : ""}</span></div>
          <div class="a-prod-acts"><button class="btn btn-o" data-proj-edit="${i}"><i data-lucide="pencil"></i>Edit</button><button class="c-rm" data-proj-up="${i}" aria-label="Move up"${i ? "" : " disabled"}><i data-lucide="arrow-up"></i></button><button class="c-rm" data-proj-del="${i}" aria-label="Delete ${esc(p.t)}"><i data-lucide="trash-2"></i></button></div></div>`).join("") || `<div class="d-empty"><i data-lucide="folder-open"></i><b>No project</b></div>`}</div>
        ${SC().edited().projects ? '<div class="a-save"><button type="button" class="btn btn-o" data-proj-reset><i data-lucide="rotate-ccw"></i>Restore original projects</button></div>' : ""}`;
      icons(); return;
    }
    const p = projEdit;
    box.innerHTML = `<form class="a-form a-prod-form" id="proj-form" novalidate>
        <button type="button" class="a-back" data-proj-back><i data-lucide="arrow-left"></i>All projects</button>
        <b class="a-form-t">${p._i === undefined ? "New project" : "Edit · " + esc(p.t)}</b>
        <label class="a-lbl">Title <input name="t" maxlength="80" value="${esc(p.t || "")}" placeholder="e.g. Obby Rush"></label>
        <label class="a-lbl">One line for the card <input name="short" maxlength="160" value="${esc(p.short || "")}" placeholder="e.g. A fast obby with 50 stages"></label>
        <label class="a-lbl">Description (details window) <textarea name="d" rows="3" maxlength="600">${esc(p.d || "")}</textarea></label>
        <div class="a-grid3">
          <label class="a-lbl">Status <select name="status" class="a-select">${["Completed", "In progress", "Released", "Commission"].map(x => `<option${x === (p.status || "Completed") ? " selected" : ""}>${x}</option>`).join("")}</select></label>
          <label class="a-lbl">Technologies <input name="tech" maxlength="140" value="${esc((p.tech || []).join(", "))}" placeholder="Lua, UI, DataStore"></label>
          <label class="a-lbl">Roblox universe ID <input name="universeId" inputmode="numeric" maxlength="15" value="${esc(p.universeId || "")}" placeholder="optional"></label>
        </div>
        <div class="a-lbl">Image <span class="a-hint">Shown on the card and in the details window.</span></div>
        <div class="a-imgs">${p.img ? `<div class="a-img cover"><img src="${esc(SC().imgSrc(p.img))}" alt=""></div>` : ""}
          <label class="a-img add"><input type="file" accept="image/png,image/jpeg,image/webp" id="proj-img" class="sr"><i data-lucide="image-plus"></i><span>${p.img ? "Replace image" : "Add an image"}</span></label></div>
        <button class="btn btn-w wide"><i data-lucide="save"></i>${p._i === undefined ? "Add project" : "Save project"}</button>
      </form>`;
    icons();
  }
  const projFromForm = f => { const v = n => f.elements.namedItem(n).value.trim(); return { ...projEdit, t: v("t"), short: v("short"), d: v("d"), status: v("status"), tech: v("tech").split(",").map(x => x.trim()).filter(Boolean), universeId: v("universeId") || null }; };
  const saveProjects = async (list, msg) => saveSection("projects", list.map(({ _i, ...p }) => p), msg);

  /* Photos (packs) */
  let packEdit = null;
  function renderPhotosAdmin() {
    const box = $("#a-photos"); if (!box) return;
    const list = SC().packs;
    if (!packEdit) {
      box.innerHTML = `<div class="a-shop-top"><p class="d-note" style="margin:0">Packs shown in the Photos tab.${SC().edited().packs ? ' <b style="color:var(--accent)">Edited</b>' : ""}</p><button class="btn btn-w" data-pack-new><i data-lucide="plus"></i>New pack</button></div>
        <div class="a-prods">${list.map((p, i) => `<div class="a-prod"><img src="${esc(SC().imgSrc((p.imgs[0] || [""])[0]))}" alt="" loading="lazy">
          <div class="a-prod-info"><b>${esc(p.name)}</b><span>${p.imgs.length} photo${p.imgs.length > 1 ? "s" : ""}${p.id ? " · linked to the shop" : ""}</span></div>
          <div class="a-prod-acts"><button class="btn btn-o" data-pack-edit="${i}"><i data-lucide="pencil"></i>Edit</button><button class="c-rm" data-pack-up="${i}" aria-label="Move up"${i ? "" : " disabled"}><i data-lucide="arrow-up"></i></button><button class="c-rm" data-pack-del="${i}" aria-label="Delete ${esc(p.name)}"><i data-lucide="trash-2"></i></button></div></div>`).join("") || `<div class="d-empty"><i data-lucide="images"></i><b>No pack</b></div>`}</div>
        ${SC().edited().packs ? '<div class="a-save"><button type="button" class="btn btn-o" data-pack-reset><i data-lucide="rotate-ccw"></i>Restore original photos</button></div>' : ""}`;
      icons(); return;
    }
    const p = packEdit;
    box.innerHTML = `<form class="a-form a-prod-form" id="pack-form" novalidate>
        <button type="button" class="a-back" data-pack-back><i data-lucide="arrow-left"></i>All packs</button>
        <b class="a-form-t">${p._i === undefined ? "New pack" : "Edit · " + esc(p.name)}</b>
        <label class="a-lbl">Name <input name="name" maxlength="80" value="${esc(p.name || "")}" placeholder="e.g. Medieval Castle Pack"></label>
        <label class="a-lbl">Description <input name="desc" maxlength="200" value="${esc(p.desc || "")}" placeholder="What's in the pictures"></label>
        <label class="a-lbl">Linked shop asset <select name="linked" class="a-select"><option value="">None (no “View in shop” button)</option>${X.Catalog.all().map(a => `<option value="${esc(a.id)}"${a.id === p.id ? " selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label>
        <div class="a-lbl">Photos <span class="a-hint">The first one is the big picture. Resized automatically.</span></div>
        <div class="a-imgs">${(p.imgs || []).map(([f, cap], i) => `<div class="a-img${i ? "" : " cover"}"><img src="${esc(SC().imgSrc(f))}" alt=""><input data-pcap="${i}" value="${esc(cap || "")}" placeholder="Caption" maxlength="80">
            <div class="a-img-acts"><button type="button" data-pimg-left="${i}" aria-label="Move left"${i ? "" : " disabled"}>←</button><button type="button" data-pimg-del="${i}" aria-label="Remove photo">×</button></div></div>`).join("")}
          <label class="a-img add"><input type="file" accept="image/png,image/jpeg,image/webp" multiple id="pack-img" class="sr"><i data-lucide="image-plus"></i><span>Add photos</span></label></div>
        <button class="btn btn-w wide"><i data-lucide="save"></i>${p._i === undefined ? "Add pack" : "Save pack"}</button>
      </form>`;
    icons();
  }
  const syncPack = () => { const f = $("#pack-form"); if (!f) return; const v = n => f.elements.namedItem(n).value.trim(); packEdit.name = v("name"); packEdit.desc = v("desc"); packEdit.id = v("linked"); $$("#pack-form [data-pcap]").forEach(i => { packEdit.imgs[+i.dataset.pcap][1] = i.value; }); };
  const savePacks = async (list, msg) => saveSection("packs", list.map(({ _i, ...p }) => p), msg);

  document.addEventListener("click", async e => {
    if (!e.target.closest("#admin-drawer")) return;
    // Tarifs
    const pc = e.target.closest("[data-pcat]"); if (pc) { syncPrices(); priceCat = pc.dataset.pcat; renderPricesAdmin(); return; }
    if (e.target.closest("[data-svc-add]")) { syncPrices(); priceDraft[priceCat].push(["New service", "", 10, "depending on scope", []]); renderPricesAdmin(); const rows = $$("#a-prices [data-svc-row]"); const last = rows[rows.length - 1]; last && last.querySelector("[data-f=name]").select(); return; }
    const sd = e.target.closest("[data-svc-del]"); if (sd) { syncPrices(); priceDraft[priceCat].splice(+sd.dataset.svcDel, 1); renderPricesAdmin(); return; }
    const ps = e.target.closest("[data-prices-save]");
    if (ps) { syncPrices(); ps.disabled = true; try { await saveSection("plans", priceDraft, "Prices saved · live on the site"); priceDraft = null; renderPricesAdmin(); } catch (err) { toast(err.message); ps.disabled = false; } return; }
    if (e.target.closest("[data-prices-reset]")) { try { if (await resetSection("plans", "prices")) { priceDraft = null; renderPricesAdmin(); } } catch (err) { toast(err.message); } return; }
    // Projets
    if (e.target.closest("[data-proj-new]")) { projEdit = { status: "Completed", tech: [] }; renderProjectsAdmin(); return; }
    if (e.target.closest("[data-proj-back]")) { projEdit = null; renderProjectsAdmin(); return; }
    const pe = e.target.closest("[data-proj-edit]"); if (pe) { projEdit = { ...deep(SC().projects[+pe.dataset.projEdit]), _i: +pe.dataset.projEdit }; renderProjectsAdmin(); return; }
    const pu = e.target.closest("[data-proj-up]"); if (pu) { const l = deep(SC().projects), i = +pu.dataset.projUp; [l[i - 1], l[i]] = [l[i], l[i - 1]]; try { await saveProjects(l, "Order saved"); } catch (err) { toast(err.message); } renderProjectsAdmin(); return; }
    const pd = e.target.closest("[data-proj-del]"); if (pd) { const l = deep(SC().projects), i = +pd.dataset.projDel; if (!confirm(`Delete the project ${l[i].t}?`)) return; l.splice(i, 1); try { await saveProjects(l, "Project deleted"); } catch (err) { toast(err.message); } renderProjectsAdmin(); return; }
    if (e.target.closest("[data-proj-reset]")) { try { if (await resetSection("projects", "projects")) renderProjectsAdmin(); } catch (err) { toast(err.message); } return; }
    // Photos
    if (e.target.closest("[data-pack-new]")) { packEdit = { imgs: [], id: "" }; renderPhotosAdmin(); return; }
    if (e.target.closest("[data-pack-back]")) { packEdit = null; renderPhotosAdmin(); return; }
    const ke = e.target.closest("[data-pack-edit]"); if (ke) { packEdit = { ...deep(SC().packs[+ke.dataset.packEdit]), _i: +ke.dataset.packEdit }; renderPhotosAdmin(); return; }
    const ku = e.target.closest("[data-pack-up]"); if (ku) { const l = deep(SC().packs), i = +ku.dataset.packUp; [l[i - 1], l[i]] = [l[i], l[i - 1]]; try { await savePacks(l, "Order saved"); } catch (err) { toast(err.message); } renderPhotosAdmin(); return; }
    const kd = e.target.closest("[data-pack-del]"); if (kd) { const l = deep(SC().packs), i = +kd.dataset.packDel; if (!confirm(`Delete the pack ${l[i].name} from the Photos tab?`)) return; l.splice(i, 1); try { await savePacks(l, "Pack deleted"); } catch (err) { toast(err.message); } renderPhotosAdmin(); return; }
    if (e.target.closest("[data-pack-reset]")) { try { if (await resetSection("packs", "photos")) renderPhotosAdmin(); } catch (err) { toast(err.message); } return; }
    const il = e.target.closest("[data-pimg-left]"); if (il) { syncPack(); const g = packEdit.imgs, i = +il.dataset.pimgLeft; [g[i - 1], g[i]] = [g[i], g[i - 1]]; renderPhotosAdmin(); return; }
    const idl = e.target.closest("[data-pimg-del]"); if (idl) { syncPack(); packEdit.imgs.splice(+idl.dataset.pimgDel, 1); renderPhotosAdmin(); return; }
  });
  document.addEventListener("change", async e => {
    if (e.target.id === "proj-img" && e.target.files[0]) {
      Object.assign(projEdit, projFromForm($("#proj-form")));
      const add = e.target.closest(".a-img"); add.classList.add("busy"); add.querySelector("span").textContent = "Uploading…";
      try { projEdit.img = await uploadImg(e.target.files[0]); } catch (err) { toast(err.message); }
      renderProjectsAdmin();
    }
    if (e.target.id === "pack-img" && e.target.files.length) {
      syncPack();
      const files = [...e.target.files], add = e.target.closest(".a-img"); add.classList.add("busy"); add.querySelector("span").textContent = `Uploading ${files.length}…`;
      for (const f of files) { try { packEdit.imgs.push([await uploadImg(f), f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ")]); } catch (err) { toast(err.message); } }
      renderPhotosAdmin();
    }
  });
  document.addEventListener("submit", async e => {
    if (e.target.id === "proj-form") {
      e.preventDefault();
      const p = projFromForm(e.target);
      if (!p.t) { toast("Give the project a title"); return; }
      if (!p.img) { toast("Add an image"); return; }
      const l = deep(SC().projects); if (p._i === undefined) l.push(p); else l[p._i] = p;
      const btn = e.target.querySelector(".btn-w"); btn.disabled = true;
      try { await saveProjects(l, p._i === undefined ? "Project added" : "Project saved"); projEdit = null; renderProjectsAdmin(); } catch (err) { toast(err.message); btn.disabled = false; }
    }
    if (e.target.id === "pack-form") {
      e.preventDefault(); syncPack();
      if (!packEdit.name) { toast("Give the pack a name"); return; }
      if (!packEdit.imgs.length) { toast("Add at least one photo"); return; }
      const l = deep(SC().packs); if (packEdit._i === undefined) l.push(packEdit); else l[packEdit._i] = packEdit;
      const btn = e.target.querySelector(".btn-w"); btn.disabled = true;
      try { await savePacks(l, packEdit._i === undefined ? "Pack added" : "Pack saved"); packEdit = null; renderPhotosAdmin(); } catch (err) { toast(err.message); btn.disabled = false; }
    }
  });

  /* Modération : avis, idées, livre d'or */
  let modTab = "reviews";
  const agoShort = ts => { const m = Math.round((Date.now() - ts) / 6e4); return m < 60 ? `${Math.max(1, m)} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`; };
  async function renderModeration() {
    const box = $("#a-mod"); if (!box) return;
    const sub = `<div class="a-modtabs" role="tablist">${[["reviews", "Reviews"], ["ideas", "Idea wall"], ["guestbook", "Guestbook"]].map(([k, l]) => `<button role="tab" aria-selected="${k === modTab}" data-mod="${k}">${l}</button>`).join("")}</div>`;
    box.innerHTML = sub + `<div id="a-modlist"></div>`; loading($("#a-modlist"));
    const get = async p => { const r = await fetch(API + p, { headers: user ? { Authorization: "Bearer " + user.token } : {} }); return r.ok ? r.json() : []; };
    try {
      let rows = [];
      if (modTab === "reviews") {
        const l = await get("/api/reviews"); const ar = $("#a-rev"); if (ar) ar.textContent = l.length;
        rows = l.map(r => ({ del: `reviews|${r.discordId}`, title: `${"★".repeat(r.rating)} ${r.name || "?"}`, text: r.text, meta: `${r.country ? r.country + " · " : ""}${r.likes || 0} like${r.likes === 1 ? "" : "s"} · ${agoShort(r.timestamp)} ago` }));
      } else if (modTab === "ideas") {
        rows = (await get("/api/ideas")).map(i => ({ del: `ideas|${i.id}`, title: i.title, text: i.text, meta: `${i.author || "?"} · ${i.votes} vote${i.votes === 1 ? "" : "s"} · ${i.status} · ${agoShort(i.timestamp)} ago` }));
      } else {
        rows = (await get("/api/guestbook")).map(n => ({ del: `guestbook|${n.id}`, title: `${n.emoji} ${n.name}${n.verified ? " ✓" : ""}`, text: n.text, meta: `${agoShort(n.timestamp)} ago` }));
      }
      $("#a-modlist").innerHTML = rows.length ? `<div class="a-list">${rows.map(r => `<div class="a-item a-mod"><div><b>${esc(r.title)}</b>${r.text ? `<p>${esc(r.text)}</p>` : ""}<span>${esc(r.meta)}</span></div><button class="c-rm" data-mod-del="${esc(r.del)}" aria-label="Delete"><i data-lucide="trash-2"></i></button></div>`).join("")}</div>`
        : `<div class="d-empty" style="padding:28px"><i data-lucide="inbox"></i><b>Nothing here</b></div>`;
      icons();
    } catch (err) { errorBox($("#a-modlist"), err.message); }
  }
  document.addEventListener("click", async e => {
    const t = e.target.closest("[data-mod]"); if (t) { modTab = t.dataset.mod; renderModeration(); return; }
    const d = e.target.closest("[data-mod-del]"); if (!d) return;
    const [kind, id] = d.dataset.modDel.split("|");
    if (!confirm("Delete it for good?")) return;
    try { await api(`/api/${kind}/${encodeURIComponent(id)}`, { method: "DELETE" }); toast("Deleted"); document.dispatchEvent(new CustomEvent("moderated", { detail: kind })); } catch (err) { toast(err.message); }
    renderModeration();
  });

  /* Codes promo : création depuis l'espace admin (gardés sur le serveur) */
  const STATE_EN = { active: ["Active", "ok"], scheduled: ["Scheduled", "run"], expired: ["Expired", "off"], "used up": ["Used up", "off"] };
  const genCode = () => "EXIOZZ-" + Array.from(crypto.getRandomValues(new Uint8Array(4)), b => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");
  async function renderPromoAdmin(box) {
    loading(box);
    let list = [];
    try { list = await api("/api/admin/promos"); } catch (e) { errorBox(box, e.message); return; }
    const local = Object.entries(X.PROMO.codes);
    const base = location.origin + location.pathname.replace(/[^/]*$/, "");
    box.innerHTML = `<form class="a-form a-promo-form" id="promo-new">
        <div class="a-grid2">
          <label class="a-lbl">Code<div class="a-inline"><input name="code" maxlength="24" placeholder="e.g. NOEL10" required autocomplete="off" spellcheck="false"><button type="button" class="btn btn-o" data-gen-code>Generate</button></div></label>
          <label class="a-lbl">Discount<div class="a-inline"><input name="pct" type="number" min="1" max="90" value="10" required><span class="a-unit">%</span></div></label>
        </div>
        <label class="a-lbl">Text shown to clients <input name="label" maxlength="80" placeholder="e.g. Christmas sale · 10% off everything"></label>
        <div class="a-grid3">
          <label class="a-lbl">Starts <input name="from" type="date"></label>
          <label class="a-lbl">Ends <input name="until" type="date"></label>
          <label class="a-lbl">Max uses <input name="maxUses" type="number" min="1" placeholder="Unlimited"></label>
        </div>
        <label class="a-check"><input type="checkbox" name="banner"><span>Show it in the bar at the top of the site</span></label>
        <button class="btn btn-w wide"><i data-lucide="ticket-plus"></i>Create code</button>
      </form>
      <div class="a-sub">Your codes <span>${list.length}</span></div>
      ${list.length ? `<div class="a-list">${list.map(p => { const [st, cls] = STATE_EN[p.state] || [p.state, "wait"]; return `<div class="a-item a-promo">
          <span class="pb-code">${esc(p.code)}</span>
          <div><b>−${p.pct}% · ${esc(p.label)}</b><span>${p.from ? "from " + esc(p.from) + " " : ""}${p.until ? "until " + esc(p.until) + " · " : ""}${p.uses || 0}${p.maxUses ? " / " + p.maxUses : ""} use${(p.uses || 0) === 1 ? "" : "s"}${p.banner ? " · in top bar" : ""}</span></div>
          <span class="st ${cls}">${st}</span>
          <div class="a-acts"><button class="c-rm" data-promo-copy="${esc(base + "shop.html?promo=" + p.code)}" aria-label="Copy share link"><i data-lucide="link"></i></button><button class="c-rm" data-promo-del="${esc(p.code)}" aria-label="Delete ${esc(p.code)}"><i data-lucide="trash-2"></i></button></div>
        </div>`; }).join("")}</div>` : `<div class="d-empty" style="padding:28px 12px"><i data-lucide="ticket"></i><b>No code yet</b><span>Create your first one above</span></div>`}
      ${local.length ? `<details class="a-local"><summary>Automatic codes (${local.length}) · Advent calendar</summary><div class="a-list">${local.map(([code, p]) => `<div class="a-item"><span class="pb-code">${esc(code)}</span><div><b>${esc(p.label)}</b><span>−${p.pct}%${p.from ? " · " + esc(p.from) : ""}</span></div></div>`).join("")}</div></details>` : ""}`;
    icons();
  }
  document.addEventListener("click", async e => {
    if (e.target.closest("[data-gen-code]")) { const f = $("#promo-new"); f.code.value = genCode(); f.code.focus(); return; }
    const cp = e.target.closest("[data-promo-copy]");
    if (cp) { try { await navigator.clipboard.writeText(cp.dataset.promoCopy); toast("Link copied · it applies the code automatically"); } catch (err) { toast(cp.dataset.promoCopy); } return; }
    const dl = e.target.closest("[data-promo-del]");
    if (dl) {
      if (!confirm(`Delete the code ${dl.dataset.promoDel}? Clients won't be able to use it anymore.`)) return;
      try { await api(`/api/admin/promos/${encodeURIComponent(dl.dataset.promoDel)}`, { method: "DELETE" }); toast("Code deleted"); } catch (err) { toast(err.message); }
      renderPromoAdmin($("#a-promo"));
    }
  });
  document.addEventListener("submit", async e => {
    if (e.target.id !== "promo-new") return;
    e.preventDefault();
    const f = e.target, btn = f.querySelector(".btn-w"); btn.disabled = true;
    try {
      const r = await api("/api/admin/promos", { method: "POST", body: JSON.stringify({ code: f.code.value, pct: +f.pct.value, label: f.label.value, from: f.from.value || null, until: f.until.value || null, maxUses: f.maxUses.value ? +f.maxUses.value : null, banner: f.banner.checked }) });
      toast(`Code ${r.promo.code} created`); renderPromoAdmin($("#a-promo"));
    } catch (err) { toast(err.message); btn.disabled = false; }
  });
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-slot]"); if (!b) return;
    const inp = b.parentElement.querySelector("input"); inp.value = Math.max(0, Math.min(99, (+inp.value || 0) + +b.dataset.slot));
  });
  document.addEventListener("submit", async e => {
    if (e.target.id !== "avail-form") return;
    e.preventDefault();
    const f = new FormData(e.target), btn = e.target.querySelector(".btn"); btn.disabled = true;
    try { await api("/api/availability", { method: "POST", body: JSON.stringify({ slots: f.get("slots") === "" ? null : +f.get("slots"), note: f.get("note") }) }); toast("Availability saved"); emit("availchange"); }
    catch (err) { toast(err.message); }
    btn.disabled = false;
  });
  document.addEventListener("change", async e => {
    const s = e.target.closest("[data-status]"); if (!s) return;
    s.disabled = true;
    try { await api(`/api/orders/${encodeURIComponent(s.dataset.status)}`, { method: "PATCH", body: JSON.stringify({ status: s.value }) }); toast("Status updated"); }
    catch (err) { toast(err.message); }
    renderAdmin();
  });
  document.addEventListener("click", async e => {
    const at = e.target.closest("[data-atab]"); if (at) { adminTab = at.dataset.atab; renderAdmin(); return; }
    const ac = e.target.closest("[data-acopy]");
    if (ac) { try { await navigator.clipboard.writeText(ac.dataset.acopy); toast(`${ac.dataset.label} copied`); } catch (err) { toast(ac.dataset.acopy); } return; }
    const ash = e.target.closest("[data-ashot]");
    if (ash) {
      if (!confirm("Remove this screenshot? The rating stays.")) return;
      const [pid, uid] = ash.dataset.ashot.split("|");
      try { await api(`/api/asset-reviews/${encodeURIComponent(pid)}/${encodeURIComponent(uid)}/image`, { method: "DELETE" }); toast("Screenshot removed"); } catch (err) { toast(err.message); }
      renderAdmin(); return;
    }
    const del = e.target.closest("[data-del]");
    if (del) {
      if (!confirm("Delete this order? Its files are deleted too. This can't be undone.")) return;
      try { await api(`/api/orders/${encodeURIComponent(del.dataset.del)}`, { method: "DELETE" }); toast("Order deleted"); } catch (err) { toast(err.message); }
      renderAdmin(); return;
    }
    const ln = e.target.closest("[data-link]");
    if (ln) {
      const url = prompt("Download link for this client (https://…). It stays available 24 h and the client gets a Discord DM.");
      if (!url) return;
      const name = prompt("Name shown to the client", "Download") || "Download";
      try { await api(`/api/orders/${encodeURIComponent(ln.dataset.link)}/links`, { method: "POST", body: JSON.stringify({ url: url.trim(), name }) }); toast("Link sent to the client"); } catch (err) { toast(err.message); }
      renderAdmin();
    }
  });

  /* Liste d'envies : gardée dans le navigateur, et avec le compte Discord une fois connecté */
  const WISH_KEY = "exiozz-wish";
  const readWish = () => { try { const v = JSON.parse(localStorage.getItem(WISH_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  let wish = readWish();
  const saveWish = (sync = true) => {
    try { localStorage.setItem(WISH_KEY, JSON.stringify(wish)); } catch (e) {}
    emit("wishchange"); paintWish();
    if (sync && user) api("/api/wishlist", { method: "POST", body: JSON.stringify({ ids: wish }) }).catch(() => {});
  };
  const Wish = {
    ids: () => wish.slice(),
    has: id => wish.includes(id),
    toggle(id) { const on = !wish.includes(id); wish = on ? [...wish, id] : wish.filter(x => x !== id); saveWish(); return on; }
  };
  // À la connexion : on fusionne la liste du navigateur et celle du compte
  const pullWish = async () => {
    if (!user) return;
    try { const remote = await api("/api/wishlist"); const merged = [...new Set([...(Array.isArray(remote) ? remote : []), ...wish])]; const changed = merged.length !== (remote || []).length; wish = merged; saveWish(changed); } catch (e) {}
  };
  const paintWish = () => document.querySelectorAll("[data-wish-count]").forEach(el => { el.textContent = wish.length || ""; el.hidden = !wish.length; });
  const wishD = makeDrawer("wish-drawer", "Wishlist");
  const renderWish = () => {
    const body = wishD.querySelector(".drawer-body"), foot = wishD.querySelector(".drawer-foot");
    const list = wish.map(id => X.PRODUCTS.find(p => p.id === id)).filter(Boolean);
    body.innerHTML = list.length ? `<div class="c-items">${list.map((p, k) => `<article class="ci" style="--i:${k}">
        <div class="ci-img"><img src="${esc(p.cover)}" alt=""></div>
        <div class="ci-info"><span class="ci-kind">${esc(p.catLabel)}</span><b>${esc(p.name)}</b>${X.priceHTML(p.eur, "eur")}</div>
        <div class="w-acts"><button class="c-add" data-quick="${esc(p.id)}" aria-label="Add ${esc(p.name)} to cart"${X.Cart.has(p.id) ? " disabled" : ""}><i data-lucide="${X.Cart.has(p.id) ? "check" : "shopping-cart"}"></i></button><button class="ci-rm" data-unwish="${esc(p.id)}" aria-label="Remove ${esc(p.name)} from wishlist"><i data-lucide="x"></i></button></div>
      </article>`).join("")}</div>`
      : `<div class="d-empty"><i data-lucide="heart"></i><b>No favourites yet</b><span>Tap the heart on an asset to save it for later</span><a class="btn btn-w" href="shop.html#catalog">Browse the shop</a></div>`;
    foot.innerHTML = list.length ? `<button class="btn btn-w wide" data-wish-all><i data-lucide="shopping-cart"></i>Add all to cart</button><p class="c-note">${user ? "Saved with your Discord account" : "Saved on this device · sign in to keep it everywhere"}</p>` : "";
    icons();
  };
  document.addEventListener("click", e => {
    const u = e.target.closest("[data-unwish]"); if (u) { Wish.toggle(u.dataset.unwish); return; }
    if (e.target.closest("[data-wish-all]")) { wish.forEach(id => X.Cart.add(id)); toast("Added to cart"); open(cartD); return; }
    const h = e.target.closest("[data-wish]");
    if (h) {
      const on = Wish.toggle(h.dataset.wish);
      if (on && !reduce) h.animate([{ transform: "scale(1)" }, { transform: "scale(1.35)" }, { transform: "scale(1)" }], { duration: 380, easing: "cubic-bezier(.34, 1.56, .64, 1)" });
      toast(on ? "Saved to your wishlist" : "Removed from your wishlist");
    }
    if (e.target.closest("[data-open-wish]")) open(wishD);
  });
  document.addEventListener("wishchange", () => { if (openD === wishD) renderWish(); });
  document.addEventListener("cartchange", () => { if (openD === wishD) renderWish(); });
  document.addEventListener("authchange", pullWish);
  paintWish(); pullWish();

  const render = d => {
    if (d === cartD) { renderCart(); icons(); } else if (d === ordersD) renderOrders(); else if (d === wishD) renderWish(); else if (d === chatD) renderChat(); else renderAdmin();
  };
  const refresh = () => { if (openD === cartD) render(cartD); paintCount(); };
  const paintCount = () => document.querySelectorAll("[data-cart-count]").forEach(el => { const n = X.Cart.count(); el.textContent = n || ""; el.hidden = !n; });
  document.addEventListener("cartchange", refresh);
  document.addEventListener("promochange", refresh);
  document.addEventListener("authchange", () => { if (openD) render(openD); });
  paintCount();

  document.addEventListener("click", e => {
    if (e.target.closest("[data-open-cart]")) open(cartD);
    if (e.target.closest("[data-open-orders]")) open(ordersD);
    if (e.target.closest("[data-open-admin]")) open(adminD);
    const rm = e.target.closest("[data-rm]"); if (rm) X.Cart.remove(rm.dataset.rm);
    const co = e.target.closest("#checkout"); if (co) checkout(co);
  });
  if (location.hash === "#admin") setTimeout(() => open(adminD), 300);

  /* Accès au compte pour la page (avis) */
  const Account = { get user() { return user; }, isAdmin, signIn, signOut, api, API };
  window.UI = { toast, bricks, icons, esc, openCart: () => open(cartD), openOrders: () => open(ordersD), openWish: () => open(wishD), openAdmin: () => open(adminD), setTheme: from => setTheme(root.dataset.theme === "light" ? "dark" : "light", from), Account, Wish };
})();
