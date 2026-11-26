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
  cartD.classList.add("cart-sheet");
  cartD.querySelector(".drawer-head b").innerHTML = `Cart <span class="c-count" id="c-count"></span>`;
  const ordersD = makeDrawer("orders-drawer", "My orders");
  const adminD = makeDrawer("admin-drawer", "Admin area", true);
  let openD = null;
  const open = d => {
    if (openD && openD !== d) close(openD, true);
    openD = d; render(d); d.classList.add("open"); d.setAttribute("aria-hidden", "false"); scrim.classList.add("open");
    document.documentElement.style.overflow = "hidden";
    setTimeout(() => d.querySelector("[data-close]").focus(), 60);
  };
  const close = (d, keep) => {
    d.classList.remove("open"); d.setAttribute("aria-hidden", "true");
    if (!keep) { scrim.classList.remove("open"); document.documentElement.style.overflow = ""; openD = null; }
  };
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
  function paintAccount() {
    const btn = $("#login-btn"), menu = $("#login-menu");
    if (!btn || !menu) return;
    if (user) {
      btn.innerHTML = `<img class="acc-av" src="${esc(avatarOf(user))}" alt=""><span>${esc(user.name)}</span>`;
      menu.innerHTML = `<div class="acc-head"><img src="${esc(avatarOf(user))}" alt=""><div><b>${esc(user.name)}</b><span>${isAdmin() ? "Admin" : "Signed in with Discord"}</span></div></div>
        <button role="menuitem" data-open-orders><i data-lucide="package"></i>My orders</button>
        <button role="menuitem" data-open-cart><i data-lucide="shopping-cart"></i>My cart</button>
        <button role="menuitem" data-open-wish><i data-lucide="heart"></i>Wishlist</button>
        ${isAdmin() ? '<button role="menuitem" data-open-admin><i data-lucide="lock"></i>Admin area</button>' : ""}
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
      const r = await api("/api/order", { method: "POST", body: JSON.stringify({ items, currency: "€", source: PAGE }) });
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
          <div class="o-tot"><span>Total</span><b>${X.money(o.total || 0, curOf(o))}</b></div></div>`).join("")
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

  /* Espace admin (réservé à ton compte Discord : le serveur le vérifie à chaque appel) */
  let adminTab = "orders", adminOrders = null;
  async function renderAdmin() {
    const body = adminD.querySelector(".drawer-body");
    adminD.querySelector(".drawer-foot").innerHTML = `<a class="btn btn-o wide" href="admin.html"><i data-lucide="folder-cog"></i>Full admin panel · files, asset library, new order</a>`;
    if (!isAdmin()) { body.innerHTML = `<div class="d-empty"><i data-lucide="lock"></i><b>Admin only</b><span>Sign in with the admin Discord account</span></div>`; icons(); return; }
    const tabs = [["orders", "Orders"], ["avail", "Availability"], ["promo", "Promo codes"], ["community", "Community"]];
    const head = `<div class="a-tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${k === adminTab}" data-atab="${k}">${l}</button>`).join("")}</div>`;
    if (adminTab === "orders") {
      body.innerHTML = head + `<div id="a-orders"></div>`; const box = $("#a-orders");
      loading(box);
      try {
        adminOrders = await api("/api/admin/orders");
        const pending = adminOrders.filter(o => o.status === "En attente de contact").length;
        const paid = adminOrders.filter(o => o.status === "Payée").reduce((s, o) => s + (o.currency === "R$" ? 0 : o.total || 0), 0);
        box.innerHTML = `<div class="a-stats"><div><b>${adminOrders.length}</b><span>Orders</span></div><div><b>${pending}</b><span>To contact</span></div><div><b>${X.money(Math.round(paid * 100) / 100)}</b><span>Paid (€)</span></div></div>` +
          (adminOrders.length ? `<div class="a-table" role="table">${adminOrders.map(o => `<div class="a-row" role="row">
            <div><b>${esc(o.customerName || "?")}</b><span>${fmtWhen(o.timestamp)}</span></div>
            <div class="a-items">${(o.items || []).map(i => esc(i.title)).join(", ")}${o.note ? `<span title="${esc(o.note)}">“${esc(o.note)}”</span>` : ""}</div>
            <div class="a-total">${X.money(o.total || 0, curOf(o))}</div>
            <label class="sr" for="st-${esc(o.id)}">Status</label>
            <select class="a-select" id="st-${esc(o.id)}" data-status="${esc(o.id)}">${STATUSES.map(s => `<option value="${s}"${s === o.status ? " selected" : ""}>${stEn(s)}</option>`).join("")}</select>
            <div class="a-acts"><button class="c-rm" data-link="${esc(o.id)}" aria-label="Send a download link"><i data-lucide="link"></i></button><button class="c-rm" data-del="${esc(o.id)}" aria-label="Delete order"><i data-lucide="trash-2"></i></button></div></div>`).join("")}</div>`
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
    } else if (adminTab === "promo") {
      const codes = Object.entries(X.PROMO.codes);
      body.innerHTML = head + (codes.length ? `<div class="a-list">${codes.map(([code, p]) => `<div class="a-item"><span class="pb-code">${esc(code)}</span><div><b>${esc(p.label)}</b><span>−${p.pct}%${p.until ? " · until " + esc(p.until) : ""}</span></div></div>`).join("")}</div>` : `<div class="d-empty"><i data-lucide="ticket"></i><b>No promo code active</b><span>Add one at the top of promo.js</span></div>`);
      icons();
    } else {
      body.innerHTML = head + `<div class="a-stats"><div><b data-discord="members">—</b><span>Discord members</span></div><div><b data-discord="online">—</b><span>Online</span></div><div><b id="a-rev">—</b><span>Reviews</span></div></div>
        <a class="btn btn-o" href="https://discord.gg/rGcdngHsCe"><i data-lucide="message-circle"></i>Open the Discord server</a>`;
      icons(); discord();
      fetch(API + "/api/reviews").then(r => r.json()).then(l => { const el = $("#a-rev"); if (el) el.textContent = l.length; }).catch(() => {});
    }
  }
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
    if (d === cartD) { renderCart(); icons(); } else if (d === ordersD) renderOrders(); else if (d === wishD) renderWish(); else renderAdmin();
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
