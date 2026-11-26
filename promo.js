/*
 * Exiozz — catalogue, codes promo et panier, partagés par index.html et shop.html.
 *
 * IMPORTANT : ce fichier tourne dans le navigateur. Tout le monde peut lire les codes
 * et modifier les prix affichés. Les commandes passent par le serveur Cloudflare (ui.js)
 * et tu les valides à la main : vérifie toujours le prix d'une commande avant d'encaisser.
 */
(() => {
  /* ---------- Réglages à modifier ---------- */
  const PROMO = {
    // CODE: { pct: remise en %, label: texte affiché, until: dernier jour valable (AAAA-MM-JJ) ou null }
    // Exemple : EXIOZZ10: { pct: 10, label: "10% off the whole site", until: "2026-12-31" }
    codes: {},
    // Code mis en avant dans la barre du haut, ou null pour ne pas afficher de barre
    banner: null
  };
  const ROBUX_PER_EURO = 80;
  // Packs groupés : à partir de "min" assets dans le panier, chaque asset prend "pct" % de remise.
  // Pas de cumul avec un code promo : le client a la plus grosse des deux remises. pct: 0 pour désactiver.
  const BUNDLE = { min: 2, pct: 20 };

  /* Champs facultatifs d'un asset :
     video:   { src, poster } → vidéo de présentation dans la fiche
     model:   "assets/.../modele.glb" → aperçu 3D qu'on fait tourner (exporte en .glb depuis Blender)
     compare: { before, after, labels: ["Before", "After"] } → curseur avant / après */

  const PRODUCTS = [
    { id: "modern-school-ui", name: "UI Kit — Dark Modern", cat: "ui", catLabel: "UI Kits", eur: 5, rbx: 400, badge: "Best-seller", rank: 1, added: 1,
      desc: "A sleek dark interface kit: menus, HUD, inventory, shop, notifications.", tags: ["UI", "Roblox"],
      cover: "img/ui-dark-modern.webp", gallery: [["img/ui-dark-modern.webp", "UI Kit — Dark Modern"]] },
    { id: "hud-quest-pack", name: "HUD & Quests Pack", cat: "ui", catLabel: "UI Kits", eur: 8, rbx: 600, badge: "New", rank: 2, added: 2,
      desc: "Adventure game UI pack: compass, working minimap, quest tracker, notifications and health bars.", tags: ["UI", "Quests", "Minimap"],
      cover: "img/hud.webp", gallery: [["img/hud.webp", "HUD & Quests — in game"]] },
    { id: "lava-mounts-pack", name: "Lava Mounts Pack", cat: "models", catLabel: "3D Models", eur: 25, rbx: 2000, badge: "New", rank: 3, added: 4,
      desc: "Rigged lava dragon and horse, summoning bell and fire portal — ready for Roblox.", tags: ["Mounts", "Rigged", "FBX"],
      cover: "img/lava-cover.jpg", video: { src: "assets/lava-mounts-pack/presentation.mp4", poster: "assets/lava-mounts-pack/presentation-poster.jpg" },
      gallery: [["img/dragon.webp", "Lava dragon"], ["img/dragon-profil.webp", "Lava dragon — side"], ["img/dragon-tete.webp", "Lava dragon — head"], ["img/cheval.webp", "Lava horse"], ["img/cheval-profil.webp", "Lava horse — side"], ["img/portail.webp", "Fire portal"], ["img/cloche.webp", "Summoning bell"]] },
    { id: "stylized-forest-pack", name: "Stylized Forest Pack", cat: "models", catLabel: "3D Models", eur: 15, rbx: 1200, badge: "New", rank: 4, added: 3,
      desc: "18 stylized nature assets: trees, bushes, rocks, mushrooms, flowers… ready for Roblox.", tags: ["Low Poly", "Nature", "FBX"],
      cover: "img/forest.jpg", video: { src: "assets/forest-pack/presentation.mp4", poster: "assets/forest-pack/presentation-poster.jpg" },
      gallery: [["img/forest.jpg", "Forest Pack — full scene"]].concat(["Oak", "Oak — variant", "Autumn tree", "Birch", "Pine", "Pine — variant", "Bush", "Berry bush", "Stump", "Log", "Large rock", "Medium rock", "Small rock", "Red mushroom", "Brown mushrooms", "Flowers", "Grass", "Fern"].map((n, i) => [`img/forest-${String(i + 1).padStart(2, "0")}.webp`, n])) }
  ];
  const CATEGORIES = [["all", "All", "folder-open"], ["models", "3D Models", "box"], ["scripts", "Scripts", "terminal"], ["ui", "UI Kits", "pen-tool"], ["gfx", "GFX Packs", "palette"], ["templates", "Templates", "layout-grid"], ["audio", "Audio", "audio-lines"], ["discord", "Discord", "bot"]];

  /* ---------- Stockage local (peut être bloqué) ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const emit = name => document.dispatchEvent(new CustomEvent(name));

  /* ---------- Prix ---------- */
  const money = (n, cur = "eur") => cur === "rbx"
    ? `R$ ${Math.round(n).toLocaleString("en-US")}`
    : `€${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
  const inCur = (eur, cur) => (cur === "rbx" ? eur * ROBUX_PER_EURO : eur);

  /* ---------- Codes promo ---------- */
  const today = () => new Date().toISOString().slice(0, 10);
  const lookup = raw => {
    const code = String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
    if (!code) return { ok: false, msg: "Enter a code" };
    const p = PROMO.codes[code];
    if (!p) return { ok: false, msg: "This code doesn't exist" };
    if (p.until && today() > p.until) return { ok: false, msg: "This code has expired" };
    return { ok: true, code, ...p };
  };
  const Promo = {
    active() { const c = store.get("exiozz-promo", null); const r = c && lookup(c); return r && r.ok ? r : null; },
    apply(raw) { const r = lookup(raw); if (r.ok) { store.set("exiozz-promo", r.code); emit("promochange"); } return r; },
    clear() { store.set("exiozz-promo", null); emit("promochange"); },
    price(eur) { const a = Promo.active(); return a ? Math.round(eur * (100 - a.pct)) / 100 : eur; },
    banner() { const r = PROMO.banner && lookup(PROMO.banner); return r && r.ok ? r : null; }
  };
  // Lien partageable : ?promo=CODE applique le code
  const fromUrl = new URLSearchParams(location.search).get("promo");
  if (fromUrl) Promo.apply(fromUrl);

  /* Prix affiché, barré si une remise s'applique */
  // rbx : prix Robux fixé à la main pour ce produit (sinon euros × ROBUX_PER_EURO)
  const priceHTML = (eur, cur, cls = "", rbx) => {
    const now = Promo.price(eur), conv = v => (cur === "rbx" && rbx ? rbx * v / eur : inCur(v, cur));
    const full = money(conv(eur), cur), after = money(conv(now), cur);
    return now < eur
      ? `<span class="pr ${cls}"><s>${full}</s><b>${after}</b></span>`
      : `<span class="pr ${cls}"><b>${full}</b></span>`;
  };
  const untilText = d => d ? ` until ${new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" })}` : "";

  /* ---------- Barre promo en haut de page ---------- */
  function mountBar() {
    const bar = document.createElement("div");
    bar.className = "promo-bar";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Promo code");
    document.body.prepend(bar);
    const render = () => {
      const a = Promo.active(), b = Promo.banner();
      const hidden = !a && (!b || store.get("exiozz-bar-closed", "") === b.code);
      bar.hidden = hidden;
      document.documentElement.style.setProperty("--bar-h", hidden ? "0px" : "40px");
      if (hidden) return;
      bar.innerHTML = a
        ? `<span class="pb-code">${a.code}</span><span>Code applied · ${a.label}${untilText(a.until)}</span><button class="pb-btn" data-promo-clear>Remove</button>`
        : `<span class="pb-code">${b.code}</span><span>${b.label}${untilText(b.until)}</span><button class="pb-btn" data-promo-apply="${b.code}">Apply</button><button class="pb-x" aria-label="Hide" data-bar-close><i data-lucide="x"></i></button>`;
      window.lucide && lucide.createIcons();
    };
    bar.addEventListener("click", e => {
      if (e.target.closest("[data-promo-apply]")) Promo.apply(e.target.closest("[data-promo-apply]").dataset.promoApply);
      if (e.target.closest("[data-promo-clear]")) Promo.clear();
      if (e.target.closest("[data-bar-close]")) { store.set("exiozz-bar-closed", Promo.banner().code); render(); }
    });
    document.addEventListener("promochange", render);
    render();
  }

  /* ---------- Champ code promo ---------- */
  function mountPromoForm(el, { dark = false } = {}) {
    const render = (msg = "") => {
      const a = Promo.active();
      el.classList.toggle("promo-dark", dark);
      el.innerHTML = a
        ? `<div class="promo-on"><span class="pb-code">${a.code}</span><span>${a.label}</span><button class="promo-x" data-clear aria-label="Remove code"><i data-lucide="x"></i></button></div>`
        : `<form class="promo-form" novalidate><label class="sr" for="${el.id}-in">Promo code</label><input id="${el.id}-in" class="promo-in" placeholder="Promo code" autocomplete="off" spellcheck="false"><button class="promo-go">Apply</button></form><span class="promo-msg" role="status">${msg}</span>`;
      window.lucide && lucide.createIcons();
    };
    el.addEventListener("submit", e => {
      e.preventDefault();
      const r = Promo.apply(el.querySelector(".promo-in").value);
      if (!r.ok) { render(r.msg); el.querySelector(".promo-in").focus(); }
    });
    el.addEventListener("click", e => { if (e.target.closest("[data-clear]")) Promo.clear(); });
    document.addEventListener("promochange", () => render());
    render();
  }

  /* ---------- Panier ----------
     Un article = { id, name, eur, img, kind: "asset" | "service" }. Un asset du shop peut se passer avec son seul id. */
  const toItem = x => {
    if (typeof x === "string") { const p = PRODUCTS.find(q => q.id === x); return p && { id: p.id, name: p.name, eur: p.eur, img: p.cover, kind: "asset", cat: p.catLabel }; }
    return x && x.id && typeof x.eur === "number" ? x : null;
  };
  const Cart = {
    items() { return store.get("exiozz-cart", []).map(toItem).filter(Boolean); },
    count() { return Cart.items().length; },
    has(id) { return Cart.items().some(i => i.id === id); },
    add(x) { const it = toItem(x); if (it && !Cart.has(it.id)) { store.set("exiozz-cart", [...Cart.items(), it]); emit("cartchange"); } },
    remove(id) { store.set("exiozz-cart", Cart.items().filter(i => i.id !== id)); emit("cartchange"); },
    clear() { store.set("exiozz-cart", []); emit("cartchange"); },
    // Remise d'un article : la plus grosse entre le code promo et le pack groupé (assets uniquement)
    deal(item, list = Cart.items()) {
      const promo = Promo.active(), assets = list.filter(i => i.kind === "asset").length;
      const bundle = BUNDLE.pct > 0 && item.kind === "asset" && assets >= BUNDLE.min ? BUNDLE.pct : 0;
      const pct = Math.max(promo ? promo.pct : 0, bundle);
      return { pct, by: !pct ? null : bundle >= (promo ? promo.pct : 0) ? "bundle" : "promo" };
    },
    priceOf(item, list = Cart.items()) { const d = Cart.deal(item, list); return Math.round(item.eur * (100 - d.pct)) / 100; },
    totals(cur) {
      const list = Cart.items();
      const sub = list.reduce((s, p) => s + p.eur, 0);
      let after = 0, bundleOff = 0, promoOff = 0;
      list.forEach(p => { const now = Cart.priceOf(p, list), d = Cart.deal(p, list); after += now; if (d.by === "bundle") bundleOff += p.eur - now; if (d.by === "promo") promoOff += p.eur - now; });
      const assets = list.filter(i => i.kind === "asset").length;
      return { list, sub: inCur(sub, cur), discount: inCur(sub - after, cur), total: inCur(after, cur), subEur: sub, totalEur: after,
        bundleOff: inCur(bundleOff, cur), promoOff: inCur(promoOff, cur), bundleMissing: BUNDLE.pct > 0 && assets > 0 && assets < BUNDLE.min ? BUNDLE.min - assets : 0 };
    }
  };

  window.Exiozz = { PRODUCTS, CATEGORIES, PROMO, BUNDLE, Promo, Cart, money, inCur, priceHTML, mountBar, mountPromoForm };
})();
