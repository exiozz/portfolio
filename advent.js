/*
 * Exiozz — calendrier de l'Avent (accueil). Visible du 20 novembre au 31 décembre.
 * Une case par jour du 1er au 24 décembre, avec un décompte sous chaque case encore fermée.
 *
 * À MODIFIER : la liste REWARDS ci-dessous (une ligne par jour).
 *   code      → code promo valable UNIQUEMENT ce jour-là (ajouté tout seul aux codes du site)
 *   wallpaper → image à télécharger
 *   tip       → astuce de dev Roblox
 *   game      → défi Brick Catch (le mini-jeu caché)
 * Aperçu de toutes les cases : ajoute ?advent=preview à l'adresse (les codes restent bloqués à leur jour).
 * À charger après promo.js et avant le script de la page.
 */
(() => {
  const REWARDS = [
    { type: "code", code: "ADVENT01", pct: 10, title: "−10% on everything", text: "Your first gift: 10% off the whole shop and every quote, today only." },
    { type: "wallpaper", src: "assets/forest-pack/hero.jpg", title: "Forest wallpaper", text: "The Stylized Forest scene in full HD, for your desktop." },
    { type: "tip", title: "task.wait() > wait()", text: "In Luau, use task.wait() instead of wait(): it's more precise and doesn't throttle under load. Same for task.spawn() and task.delay()." },
    { type: "game", score: 20, title: "Brick Catch challenge", text: "Score 20 points in the hidden mini-game. Can you do it on your first try?" },
    { type: "code", code: "ADVENT05", pct: 15, title: "−15% on everything", text: "15% off the shop and quotes today. Perfect timing for the Lava Mounts Pack." },
    { type: "tip", title: "Never trust the client", text: "Always validate RemoteEvent arguments on the server: type, range, cooldown and distance. Exploiters can send anything." },
    { type: "wallpaper", src: "assets/lava-mounts-pack/hero.jpg", title: "Lava dragon wallpaper", text: "The rigged lava dragon, in full HD." },
    { type: "code", code: "ADVENT08", pct: 10, title: "−10% on everything", text: "Second weekend gift: 10% off today." },
    { type: "tip", title: "Tag it with CollectionService", text: "Tag your kill bricks, doors or coins with CollectionService and handle them all in one script, instead of one script per part." },
    { type: "game", score: 35, title: "Brick Catch: level 2", text: "35 points this time. Gold bricks are worth 5, keep your combo above 10 for ×2." },
    { type: "wallpaper", src: "assets/forest-pack/planche.jpg", title: "Forest asset sheet", text: "All 18 forest assets on one sheet: a nice reference board." },
    { type: "code", code: "ADVENT12", pct: 12, title: "−12% for the 12th", text: "12% off on the 12th. Bundles still stack up to −20% if you take 2+ assets." },
    { type: "tip", title: "StreamingEnabled", text: "Turn on StreamingEnabled for big maps: players only load what's around them, so mobile players stop crashing." },
    { type: "tip", title: "Debris for temporary parts", text: "Debris:AddItem(part, 3) cleans up effects and projectiles automatically, without a wait() that can leak." },
    { type: "code", code: "ADVENT15", pct: 15, title: "−15% halfway gift", text: "Halfway to Christmas: 15% off the shop and quotes today." },
    { type: "wallpaper", src: "assets/lava-mounts-pack/planche.jpg", title: "Lava Mounts sheet", text: "Dragon, horse, bell and portal on one dark sheet." },
    { type: "game", score: 50, title: "Brick Catch: expert", text: "50 points. Watch out, bombs get more frequent the longer you survive." },
    { type: "tip", title: "Attributes over Values", text: "Use part:SetAttribute() instead of IntValue/StringValue objects: lighter, cleaner, and you can listen with GetAttributeChangedSignal." },
    { type: "code", code: "ADVENT19", pct: 10, title: "−10% on everything", text: "Last weekend before Christmas: 10% off today." },
    { type: "tip", title: "TweenService for smooth UI", text: "Animate UI with TweenService and Quint/Back easing styles instead of moving frames in a loop. Smoother and cheaper." },
    { type: "wallpaper", src: "img/hud.webp", title: "HUD & Quests preview", text: "The HUD & Quests Pack in game, as a wallpaper." },
    { type: "game", score: 75, title: "Brick Catch: legend", text: "75 points. Only true legends get there." },
    { type: "tip", title: "ModuleScripts everywhere", text: "Put shared logic in ModuleScripts (ReplicatedStorage for both sides, ServerScriptService for server only). One place to fix a bug." },
    { type: "code", code: "ADVENT24", pct: 25, title: "−25% Christmas Eve", text: "The biggest gift: 25% off the whole shop and every quote, today only. Merry Christmas!" }
  ];

  const now = () => new Date();
  const year = (() => { const d = now(); return d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear(); })();
  const dayDate = n => new Date(year, 11, n); // minuit, heure locale
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const preview = new URLSearchParams(location.search).get("advent") === "preview";
  const inSeason = (() => { const d = now(); return preview || (d >= new Date(year, 10, 20) && d < new Date(year + 1, 0, 1)); })();

  // Codes du jour : valables uniquement le jour de leur case
  const X = window.Exiozz;
  REWARDS.forEach((r, i) => { if (r.type === "code") X.PROMO.codes[r.code] = { pct: r.pct, label: `Advent day ${i + 1} · ${r.pct}% off`, from: iso(dayDate(i + 1)), until: iso(dayDate(i + 1)) }; });

  const KEY = "exiozz-advent-" + year;
  const opened = () => { try { return new Set(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch (e) { return new Set(); } };
  const markOpen = n => { const s = opened(); s.add(n); try { localStorage.setItem(KEY, JSON.stringify([...s])); } catch (e) {} };
  const isOpenable = n => preview || now() >= dayDate(n);
  const countdown = ms => {
    const s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    const p = v => String(v).padStart(2, "0");
    return d ? `${d}d ${p(h)}:${p(m)}:${p(sec)}` : `${p(h)}:${p(m)}:${p(sec)}`;
  };
  const ICON = { code: "ticket-percent", wallpaper: "image", tip: "lightbulb", game: "gamepad-2" };

  window.Advent = {
    inSeason, REWARDS,
    mount(el, { onOpen } = {}) {
      if (!inSeason) { el.hidden = true; return; }
      const grid = el.querySelector("[data-advent-grid]");
      const render = () => {
        const op = opened(), today = now();
        grid.innerHTML = REWARDS.map((r, i) => {
          const n = i + 1, can = isOpenable(n), isToday = today.getDate() === n && today.getMonth() === 11, was = op.has(n);
          const state = was ? "opened" : can ? (isToday ? "today" : "ready") : "locked";
          return `<div class="adv-cell ${state}" style="--i:${i}">
            <button class="adv-door" data-adv="${n}" ${can ? "" : 'aria-disabled="true"'} aria-label="Day ${n}${state === "locked" ? ", locked" : was ? `, opened: ${r.title}` : ", ready to open"}">
              <span class="adv-n">${n}</span>
              ${was ? `<i data-lucide="${ICON[r.type]}"></i><small>${r.title}</small>` : state === "locked" ? `<i data-lucide="lock"></i>` : `<i data-lucide="gift"></i>`}
            </button>
            <span class="adv-cd" data-cd="${n}">${state === "locked" ? countdown(dayDate(n) - today) : isToday && !was ? "Open me today" : was ? "Opened" : "Ready"}</span>
          </div>`;
        }).join("");
        window.lucide && lucide.createIcons();
      };
      render();
      // Décompte sous chaque case fermée, mis à jour chaque seconde ; à minuit, la case s'ouvre
      setInterval(() => {
        const t = now(); let flip = false;
        grid.querySelectorAll("[data-cd]").forEach(c => {
          const n = +c.dataset.cd; if (!c.closest(".locked")) return;
          const ms = dayDate(n) - t;
          if (ms <= 0) flip = true; else c.textContent = countdown(ms);
        });
        if (flip) render();
      }, 1000);
      grid.addEventListener("click", e => {
        const b = e.target.closest("[data-adv]"); if (!b) return;
        const n = +b.dataset.adv;
        if (!isOpenable(n)) {
          b.animate([{ transform: "translateX(0)" }, { transform: "translateX(-5px)" }, { transform: "translateX(5px)" }, { transform: "translateX(0)" }], { duration: 300 });
          window.UI && UI.toast(`Day ${n} opens in ${countdown(dayDate(n) - now())}`);
          return;
        }
        const first = !opened().has(n);
        markOpen(n);
        const cell = b.closest(".adv-cell");
        if (first && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
          cell.classList.add("opening");
          setTimeout(() => { render(); onOpen && onOpen(n, REWARDS[n - 1], { iso: iso(dayDate(n)), today: iso(now()) === iso(dayDate(n)) }); }, 520);
        } else { render(); onOpen && onOpen(n, REWARDS[n - 1], { iso: iso(dayDate(n)), today: iso(now()) === iso(dayDate(n)) }); }
      });
      const count = () => { const t = now(); return t.getMonth() === 11 && t.getDate() <= 24 ? 25 - t.getDate() : Math.max(0, Math.ceil((dayDate(25) - t) / 864e5)); };
      const cdEl = el.querySelector("[data-xmas]");
      if (cdEl) { const paint = () => { const d = dayDate(25) - now(); cdEl.textContent = d > 0 ? countdown(d) : "Merry Christmas!"; }; paint(); setInterval(paint, 1000); }
      return { render, daysLeft: count };
    }
  };
})();
