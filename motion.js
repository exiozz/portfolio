/*
 * Exiozz — animations partagées par index.html et shop.html.
 * Titres révélés mot à mot, images dévoilées au scroll, lumière qui suit la souris sur les cartes,
 * cartes inclinées en 3D, boutons « aimantés », barre de progression, bandeau défilant, parallaxe.
 * Tout est coupé si le visiteur a demandé « moins d'animations » dans son système.
 */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const root = document.documentElement;
  root.classList.add("motion");
  if (reduce) { root.classList.add("no-motion"); return; }

  /* Barre de progression de lecture */
  const bar = document.createElement("div");
  bar.className = "scroll-bar"; bar.setAttribute("aria-hidden", "true");
  document.body.appendChild(bar);
  const nav = document.querySelector(".nav");
  let ticking = false;
  const onScroll = () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => {
      const max = root.scrollHeight - innerHeight, y = scrollY;
      bar.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
      nav && nav.classList.toggle("scrolled", y > 24);
      parallax(y);
      ticking = false;
    });
  };
  addEventListener("scroll", onScroll, { passive: true });

  /* Titres : chaque mot monte depuis un masque, l'un après l'autre */
  const splitWords = el => {
    let i = 0;
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const parts = n.textContent.split(/(\s+)/);
          const frag = document.createDocumentFragment();
          parts.forEach(p => {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); return; }
            const w = document.createElement("span"); w.className = "w";
            const inner = document.createElement("span"); inner.textContent = p; inner.style.setProperty("--wi", i++);
            w.appendChild(inner); frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== "BR") walk(n);
      });
    };
    walk(el);
    el.classList.add("split");
    el.setAttribute("aria-label", el.textContent.replace(/\s+/g, " ").trim());
    el.querySelectorAll(".w").forEach(w => w.setAttribute("aria-hidden", "true"));
  };
  document.querySelectorAll(".big, .title, .about-name, .custom h2").forEach(splitWords);
  // Titres sans .rv (ex. bloc « custom » du shop) : on les déclenche nous-mêmes
  const wIO = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); wIO.unobserve(e.target); } }), { threshold: .2 });
  document.querySelectorAll(".split:not(.rv)").forEach(el => wIO.observe(el));

  /* Images : dévoilées par un rideau et un léger zoom arrière quand elles arrivent à l'écran */
  const revealSel = ".pcard-img, .mk-img, .gallery > button, .d-gal-main";
  const iIO = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("shown"); iIO.unobserve(e.target); } }), { threshold: .15, rootMargin: "0px 0px -40px 0px" });
  const watchImgs = () => document.querySelectorAll(revealSel).forEach(el => { if (el.classList.contains("reveal")) return; el.classList.add("reveal"); iIO.observe(el); });
  watchImgs();
  // Contenu ajouté plus tard (galerie, coulisses, catalogue…)
  new MutationObserver(() => { clearTimeout(watchImgs.t); watchImgs.t = setTimeout(watchImgs, 60); }).observe(document.body, { childList: true, subtree: true });

  /* Parallaxe douce dans le haut de page */
  const para = [...document.querySelectorAll("[data-parallax]")];
  function parallax(y) {
    if (y > innerHeight * 1.5) return;
    para.forEach(el => { el.style.transform = `translate3d(0, ${(y * +el.dataset.parallax).toFixed(1)}px, 0)`; });
  }
  onScroll();

  /* Bandeau défilant : accélère et penche selon la vitesse du scroll */
  const marquees = [...document.querySelectorAll("[data-marquee]")];
  if (marquees.length) {
    marquees.forEach(m => { const t = m.querySelector(".mq-track"); t.innerHTML += t.innerHTML; });
    let lastY = scrollY, vel = 0, off = 0, last = performance.now();
    const loop = now => {
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      const dy = scrollY - lastY; lastY = scrollY;
      vel += (dy * 1.2 - vel) * .1;
      off += (40 + Math.abs(vel) * 18) * dt;
      marquees.forEach(m => {
        const t = m.firstElementChild, w = t.scrollWidth / 2 || 1;
        t.style.transform = `translate3d(${-(off % w)}px, 0, 0) skewX(${Math.max(-8, Math.min(8, -vel * .5)).toFixed(2)}deg)`;
      });
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  if (!fine) return;

  /* Lumière qui suit la souris sur les cartes */
  const glowSel = ".pcard, .stat, .plan, .box, .tech, .social, .qs-svc, .adv-door, .offer, .faq-list .qa, .bm-box, .ask, .qs-res";
  document.addEventListener("pointermove", e => {
    const el = e.target.closest && e.target.closest(glowSel); if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
    el.classList.add("glow");
  }, { passive: true });

  /* Cartes inclinées en 3D (projets, assets, tarifs) */
  const tiltSel = ".pcard:not(.empty), .plan, .stat";
  let tiltEl = null;
  document.addEventListener("pointermove", e => {
    const el = e.target.closest && e.target.closest(tiltSel);
    if (tiltEl && tiltEl !== el) { tiltEl.style.transform = ""; tiltEl.classList.remove("tilting"); }
    tiltEl = el; if (!el) return;
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
    el.classList.add("tilting");
    el.style.transform = `perspective(900px) rotateX(${(-y * 5).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg) translateY(-4px)`;
  }, { passive: true });
  document.addEventListener("pointerleave", () => { if (tiltEl) { tiltEl.style.transform = ""; tiltEl.classList.remove("tilting"); tiltEl = null; } });

  /* Boutons principaux « aimantés » : ils suivent un peu la souris */
  const magSel = ".btn-w, .nav-shop, .c-pay";
  let magEl = null;
  document.addEventListener("pointermove", e => {
    const el = e.target.closest && e.target.closest(magSel);
    if (magEl && magEl !== el) { magEl.style.translate = ""; magEl = null; }
    if (!el || el.disabled) return;
    magEl = el;
    const r = el.getBoundingClientRect(), x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
    el.style.translate = `${(x * .18).toFixed(1)}px ${(y * .25).toFixed(1)}px`;
  }, { passive: true });
})();
