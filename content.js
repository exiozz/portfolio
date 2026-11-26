/*
 * Exiozz — contenu de l'accueil modifiable depuis l'espace admin : tarifs des services, projets, photos des packs.
 * Les valeurs ci-dessous sont celles par défaut ; ce que tu enregistres dans l'espace admin est gardé
 * sur le serveur et passe devant. À charger après promo.js, sur les deux pages (l'espace admin y est aussi).
 */
(() => {
  const API = window.Exiozz.API;
  const CATS = [["roblox", "Roblox"], ["script", "Script"], ["build", "Build"], ["web", "Web"], ["uiux", "UI/UX"], ["gfx", "GFX"], ["discord", "Discord"], ["3d", "3D"]];
  const DEFAULTS = {
    // Une ligne par service : [nom, description, prix de départ en €, précision, ce qui est inclus]
    plans: {
      roblox: [["Custom system", "A specific system built into your game: inventory, combat, economy, quests, anti-exploit…", 15, "depending on complexity", ["1 complete system", "Testing & fixes included", "7-day support"]], ["Full game", "A Roblox game from A to Z: concept, mechanics, scripts, UI and publishing.", 80, "depending on scope", ["Concept & game design", "Build & UI included", "Support until release"]], ["Maintenance & Support", "Bugs, performance, new features on an existing project.", 6, "depending on workload", ["Diagnosis included", "Detailed report", "Billed per task"]]],
      script: [["Custom script", "A specific script or system, on Roblox or elsewhere.", 9, "depending on complexity", ["Commented & organized", "Testing included", "7-day support"]], ["Automation", "A repetitive task automated: data, internal tool…", 7, "depending on workload", ["Needs analysis", "Ready to use", "Documentation included"]], ["Debug & Optimization", "Bugs and performance on an existing script or project.", 5, "depending on workload", ["Diagnosis included", "Quick fixes", "Detailed report"]]],
      build: [["Custom build", "An environment, a map or a detailed structure.", 12, "depending on size", ["Mapping / terrain", "Props & details", "Optimization included"]], ["Lighting & VFX", "Lighting atmosphere and visual effects for an environment.", 7, "depending on scope", ["Ambient lighting", "Visual effects", "Revisions included"]], ["Build optimization", "A heavy or messy environment, made smooth.", 6, "depending on workload", ["Diagnosis included", "Quick fixes", "Detailed report"]]],
      web: [["Showcase website", "A simple, elegant site to present your activity.", 20, "1-3 pages", ["Responsive", "SEO optimized", "Clean code"]], ["Full website", "Multi-page with animations and dynamic content.", 40, "4-8 pages", ["CSS/JS animations", "Contact form", "Performance optimized"]], ["Website with backend", "Database, authentication, API, admin dashboard.", 60, "depending on complexity", ["Database", "Authentication", "Custom API"]]],
      uiux: [["Wireframe / Mockup", "The structure of an interface before development.", 4, "per screen count", ["Clear wireframes", "Content structure", "1 revision"]], ["UI Design", "A complete interface: screens, components, consistency.", 12, "per screen count", ["High fidelity", "Reusable components", "Source files"]], ["Interactive prototype", "A clickable prototype to validate a user flow.", 10, "depending on flow", ["Clickable flow", "Fast iterations", "Feedback included"]]],
      gfx: [["Profile picture (PFP)", "A polished profile picture for you, your channel or your group.", 3, "per PFP", ["Square HD format", "2 revisions", "Fast delivery"]], ["Banner", "YouTube, Discord or Roblox group, at the right size.", 5, "per banner", ["Right dimensions", "2 revisions", "Source on request"]], ["Thumbnail", "An eye-catching thumbnail for your game or video.", 7, "per thumbnail", ["Original composition", "Built for clicks", "2 revisions"]]],
      discord: [["Custom Discord bot", "Moderation, economy, levels, custom commands…", 9, "depending on features", ["Source code included", "Hosting help", "7-day support"]], ["Server setup", "Channels, roles, permissions and a consistent design.", 6, "depending on size", ["Channel structure", "Roles & permissions", "Basic bots configured"]]],
      "3d": [["3D model", "A prop, object or character, textured and ready to use.", 10, "depending on complexity", ["Modeling & texturing", "Export in your format", "2 revisions"]]]
    },
    // universeId : identifiant Roblox du jeu pour les joueurs en direct (vide = rien n'est affiché)
    projects: [
      { id: "bomb-duels", t: "Bomb Duels", img: "img/bomb-duels.jpg", d: "Roblox arena game with a smooth movement system, built for fast-paced duels.", short: "Roblox arena game with a smooth movement system.", tech: ["Lua", "Movement system", "Arena"], status: "Completed", universeId: null }
    ],
    // Photos : une entrée par pack ; id = l'asset du shop lié
    packs: [
      { name: "Lava Mounts Pack", desc: "Rigged lava dragon and horse, summoning bell and fire portal", id: "lava-mounts-pack",
        imgs: [["dragon.webp", "Lava dragon"], ["dragon-tete.webp", "Lava dragon — head"], ["cheval.webp", "Lava horse"], ["portail.webp", "Fire portal"], ["cheval-profil.webp", "Lava horse — side"], ["dragon-profil.webp", "Lava dragon — side"], ["cloche.webp", "Summoning bell"]] },
      { name: "Stylized Forest Pack", desc: "18 stylized nature assets: trees, bushes, rocks, mushrooms, flowers…", id: "stylized-forest-pack",
        imgs: [["forest.jpg", "Forest Pack — full scene"]].concat(["Oak", "Oak — variant", "Autumn tree", "Birch", "Pine", "Pine — variant", "Bush", "Berry bush", "Stump", "Log", "Large rock", "Medium rock", "Small rock", "Red mushroom", "Brown mushrooms", "Flowers", "Grass", "Fern"].map((n, i) => [`forest-${String(i + 1).padStart(2, "0")}.webp`, n, "sq"])) },
      { name: "HUD & Quests Pack", desc: "Compass, working minimap, quest tracker, notifications and health bars", id: "hud-quest-pack",
        imgs: [["hud.webp", "HUD & Quests — in game"]] },
      { name: "UI Kit — Dark Modern", desc: "Menus, HUD, inventory, shop, notifications", id: "modern-school-ui",
        imgs: [["ui-dark-modern.webp", "UI Kit — Dark Modern"]] }
    ],
    // Personnes : avec qui tu as travaillé, contributeurs, donateurs, meilleurs acheteurs (rempli depuis l'admin)
    // group : collab | contrib | donor | buyer ; l'ordre de la liste = l'ordre affiché (et le classement des acheteurs)
    people: []
  };
  const PEOPLE_GROUPS = [["collab", "Collaborators", "Worked with me"], ["contrib", "Contributors", "Helped the project"], ["donor", "Donors", "Supported my work"], ["buyer", "Top buyers", "Most loyal clients"]];
  const clone = v => JSON.parse(JSON.stringify(v));
  // Les tableaux et objets gardent la même référence : l'accueil les relit après chaque mise à jour
  const DATA = { plans: clone(DEFAULTS.plans), projects: clone(DEFAULTS.projects), packs: clone(DEFAULTS.packs), people: clone(DEFAULTS.people) };
  const KEY = "exiozz-content";
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } },
    set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} }
  };
  const fill = (target, value) => {
    if (Array.isArray(target)) { target.length = 0; target.push(...clone(value)); }
    else { Object.keys(target).forEach(k => delete target[k]); Object.assign(target, clone(value)); }
  };
  const apply = (server, quiet) => {
    ["plans", "projects", "packs", "people"].forEach(k => fill(DATA[k], server && server[k] ? server[k] : DEFAULTS[k]));
    if (!quiet) document.dispatchEvent(new CustomEvent("contentchange"));
  };
  apply(store.get(), true);
  // Image d'un pack : nom de fichier seul (dossier img/) ou adresse complète (envoyée depuis l'espace admin)
  const imgSrc = f => /^(https?:)?\/\//.test(f) || /^(img|assets)\//.test(f) ? f : "img/" + f;
  const SiteContent = {
    CATS, DEFAULTS, imgSrc, PEOPLE_GROUPS,
    get plans() { return DATA.plans; }, get projects() { return DATA.projects; }, get packs() { return DATA.packs; }, get people() { return DATA.people; },
    edited: () => store.get(),
    async reload() {
      try { const r = await fetch(API + "/api/content", { cache: "no-store" }); if (!r.ok) return; const d = await r.json(); store.set(d || {}); apply(d || {}); } catch (e) {}
    }
  };
  window.SiteContent = SiteContent;
  SiteContent.reload();
})();
