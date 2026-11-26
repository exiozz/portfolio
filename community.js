/*
 * Exiozz — section « Community » de l'accueil : mur d'idées (proposer, voter) et livre d'or.
 * Tout est enregistré sur le serveur Cloudflare. À charger après ui.js et extras.js.
 */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = $("#community"); if (!root) return;
  const { toast, esc, Account: A } = UI;
  const icons = () => window.lucide && lucide.createIcons();
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ago = ts => { const m = Math.round((Date.now() - ts) / 6e4); return m < 2 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
  const avatar = (src, name) => src ? `<img class="cm-av" src="${esc(src)}" alt="" loading="lazy">` : `<span class="cm-av">${esc((name || "?").replace(/[^a-z0-9]/gi, "").slice(0, 1).toUpperCase() || "?")}</span>`;
  const signedIn = () => !!A.user;

  /* Onglets */
  let tab = "ideas";
  const showTab = t => {
    if (t === tab) return; tab = t;
    $$("[data-cmtab]", root).forEach(b => b.setAttribute("aria-selected", b.dataset.cmtab === t));
    $$(".cm-panel", root).forEach(p => {
      const on = p.id === "cm-" + t; p.hidden = !on;
      if (on && !reduce) p.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 380, easing: "cubic-bezier(.16, 1, .3, 1)" });
    });
  };
  root.addEventListener("click", e => { const b = e.target.closest("[data-cmtab]"); if (b) showTab(b.dataset.cmtab); });

  /* ============================ Mur d'idées ============================ */
  const CATS = [["asset", "Asset", "box"], ["system", "System", "cpu"], ["ui", "UI", "layout-panel-top"], ["site", "Website", "globe"], ["other", "Other", "sparkles"]];
  const STATUS = { open: "", planned: "Planned", done: "Done" };
  let ideas = [], ideaSort = "top", ideaCat = "asset";
  const sorted = () => {
    const list = ideas.slice();
    if (ideaSort === "new") return list.sort((a, b) => b.timestamp - a.timestamp);
    if (ideaSort === "planned") return list.filter(i => i.status !== "open").sort((a, b) => (a.status === "planned" ? -1 : 1) - (b.status === "planned" ? -1 : 1) || b.votes - a.votes);
    return list.filter(i => i.status !== "done").sort((a, b) => b.votes - a.votes || b.timestamp - a.timestamp);
  };
  const ideaHTML = (i, k) => {
    const mine = A.user && i.authorId === A.user.id, admin = A.isAdmin(), cat = CATS.find(c => c[0] === i.cat) || CATS[4];
    return `<article class="idea${i.status !== "open" ? " st-" + i.status : ""}" data-idea="${esc(i.id)}" style="--i:${k}">
      <button class="vote${i.voted ? " on" : ""}" data-vote="${esc(i.id)}" aria-pressed="${!!i.voted}" aria-label="${i.voted ? "Remove your vote" : "Vote for this idea"} (${i.votes})"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg><b>${i.votes}</b></button>
      <div class="idea-body">
        <div class="idea-top"><span class="tag"><i data-lucide="${cat[2]}"></i>${cat[1]}</span>${STATUS[i.status] ? `<span class="idea-st ${i.status}">${i.status === "done" ? "✓ " : ""}${STATUS[i.status]}</span>` : ""}</div>
        <h4>${esc(i.title)}</h4>${i.text ? `<p>${esc(i.text)}</p>` : ""}
        <div class="idea-by">${avatar(i.avatar, i.author)}<span>${esc(i.author || "Someone")} · ${ago(i.timestamp)}</span></div>
      </div>
      ${admin || mine ? `<div class="idea-adm">${admin ? `<select class="a-select" data-idea-st="${esc(i.id)}" aria-label="Status">${Object.keys(STATUS).map(s => `<option value="${s}"${s === i.status ? " selected" : ""}>${s === "open" ? "Open" : STATUS[s]}</option>`).join("")}</select>` : ""}<button class="c-rm" data-idea-del="${esc(i.id)}" aria-label="Delete this idea"><i data-lucide="trash-2"></i></button></div>` : ""}
    </article>`;
  };
  const renderIdeas = () => {
    const list = sorted();
    $("#idea-count").textContent = `${ideas.length} idea${ideas.length === 1 ? "" : "s"}`;
    $("#idea-list").innerHTML = list.length ? list.map(ideaHTML).join("")
      : `<div class="cm-empty"><i data-lucide="lightbulb"></i><b>${ideaSort === "planned" ? "Nothing planned yet" : "No idea yet"}</b><span>${ideaSort === "planned" ? "Vote for ideas so they get planned" : "Be the first to suggest something"}</span></div>`;
    icons();
  };
  const renderIdeaForm = () => {
    $("#idea-form-wrap").innerHTML = signedIn()
      ? `<form class="idea-form" id="idea-form" novalidate>
          <div class="cm-cats" role="radiogroup" aria-label="Category">${CATS.map(([k, l, ic]) => `<button type="button" role="radio" aria-checked="${k === ideaCat}" data-icat="${k}"><i data-lucide="${ic}"></i>${l}</button>`).join("")}</div>
          <label class="sr" for="idea-title">Your idea</label><input id="idea-title" maxlength="90" placeholder="Your idea in a few words (e.g. a medieval castle pack)" autocomplete="off">
          <label class="sr" for="idea-text">Details</label><textarea id="idea-text" maxlength="300" placeholder="Details (optional)"></textarea>
          <div class="idea-form-foot"><span class="cm-hint" id="idea-left">90</span><button class="btn btn-w"><i data-lucide="send"></i>Post idea</button></div>
        </form>`
      : `<div class="cm-lock"><i data-lucide="lightbulb"></i><div><b>Got an idea?</b><span>Sign in with Discord to suggest an asset or a system, and vote for the ones you want.</span></div><button class="btn btn-w" data-signin type="button">Continue with Discord</button></div>`;
    icons();
  };
  const loadIdeas = async () => {
    try { ideas = A.user ? await A.api("/api/ideas") : await (await fetch(A.API + "/api/ideas")).json(); if (!Array.isArray(ideas)) ideas = []; } catch (e) { ideas = []; }
    renderIdeas();
  };
  root.addEventListener("click", async e => {
    const s = e.target.closest("[data-isort]");
    if (s) { ideaSort = s.dataset.isort; $$("[data-isort]", root).forEach(x => x.setAttribute("aria-pressed", x === s)); renderIdeas(); return; }
    const c = e.target.closest("[data-icat]");
    if (c) { ideaCat = c.dataset.icat; $$("[data-icat]", root).forEach(x => x.setAttribute("aria-checked", x === c)); return; }
    const v = e.target.closest("[data-vote]");
    if (v) {
      if (!signedIn()) { toast("Sign in with Discord to vote"); setTimeout(A.signIn, 900); return; }
      const i = ideas.find(x => x.id === v.dataset.vote); if (!i) return;
      const before = { voted: i.voted, votes: i.votes };
      i.voted = !i.voted; i.votes += i.voted ? 1 : -1;
      const card = v.closest(".idea"), first = card.getBoundingClientRect();
      renderIdeas();
      // L'idée glisse jusqu'à sa nouvelle place dans le classement
      const moved = $(`[data-idea="${CSS.escape(i.id)}"]`, root);
      if (moved && !reduce) { const last = moved.getBoundingClientRect(); moved.animate([{ transform: `translateY(${first.top - last.top}px)` }, { transform: "none" }], { duration: 450, easing: "cubic-bezier(.16, 1, .3, 1)" }); if (i.voted) moved.querySelector(".vote").animate([{ transform: "translateY(0)" }, { transform: "translateY(-5px)" }, { transform: "none" }], { duration: 350 }); }
      try { const r = await A.api(`/api/ideas/${encodeURIComponent(i.id)}/vote`, { method: "POST" }); i.voted = r.voted; i.votes = r.votes; }
      catch (err) { Object.assign(i, before); toast(err.message); }
      renderIdeas(); return;
    }
    const d = e.target.closest("[data-idea-del]");
    if (d) {
      if (!confirm("Delete this idea?")) return;
      try { await A.api(`/api/ideas/${encodeURIComponent(d.dataset.ideaDel)}`, { method: "DELETE" }); ideas = ideas.filter(x => x.id !== d.dataset.ideaDel); renderIdeas(); toast("Idea deleted"); } catch (err) { toast(err.message); }
    }
  });
  root.addEventListener("change", async e => {
    const s = e.target.closest("[data-idea-st]"); if (!s) return;
    try { await A.api(`/api/ideas/${encodeURIComponent(s.dataset.ideaSt)}`, { method: "PATCH", body: JSON.stringify({ status: s.value }) }); const i = ideas.find(x => x.id === s.dataset.ideaSt); if (i) i.status = s.value; renderIdeas(); toast("Status updated"); }
    catch (err) { toast(err.message); }
  });
  root.addEventListener("input", e => { if (e.target.id === "idea-title") $("#idea-left").textContent = 90 - e.target.value.length; });
  root.addEventListener("submit", async e => {
    if (e.target.id !== "idea-form") return;
    e.preventDefault();
    const title = $("#idea-title").value.trim(), text = $("#idea-text").value.trim(), btn = e.target.querySelector(".btn");
    if (title.length < 4) { toast("Write your idea in a few words"); $("#idea-title").focus(); return; }
    btn.disabled = true;
    try {
      const r = await A.api("/api/ideas", { method: "POST", body: JSON.stringify({ title, text, cat: ideaCat }) });
      ideas.unshift(r.idea); ideaSort = "new"; $$("[data-isort]", root).forEach(x => x.setAttribute("aria-pressed", x.dataset.isort === "new"));
      renderIdeas(); e.target.reset(); $("#idea-left").textContent = 90;
      const card = $(`[data-idea="${CSS.escape(r.idea.id)}"]`, root); if (card) card.classList.add("fresh");
      toast("Idea posted · thanks!");
    } catch (err) { toast(err.message); }
    btn.disabled = false;
  });

  /* ============================ Livre d'or ============================ */
  const EMOJIS = ["👋", "🔥", "❤️", "🎮", "🧱", "⭐", "🚀", "😎"];
  const COLORS = ["sun", "mint", "sky", "rose", "lilac", "peach"];
  let notes = [], gbEmoji = "👋", gbColor = "sun";
  const noteHTML = (n, k, fresh) => {
    const canDel = A.user && (A.isAdmin() || n.discordId === A.user.id);
    return `<figure class="note c-${esc(n.color)}${fresh ? " fresh" : ""}" style="--i:${k};--r:${((k * 37) % 7) - 3}deg">
      <span class="note-pin" aria-hidden="true"></span>
      <span class="note-e" aria-hidden="true">${n.emoji}</span>
      ${n.text ? `<blockquote>${esc(n.text)}</blockquote>` : ""}
      <figcaption>${n.verified ? avatar(n.avatar, n.name) : ""}<b>${esc(n.name)}</b>${n.verified ? '<span class="note-ok" title="Signed in with Discord">✓</span>' : ""}<span>${ago(n.timestamp)}</span></figcaption>
      ${canDel ? `<button class="note-x" data-note-del="${esc(n.id)}" aria-label="Delete this message">×</button>` : ""}
    </figure>`;
  };
  const renderNotes = freshId => {
    $("#gb-count").textContent = `${notes.length} message${notes.length === 1 ? "" : "s"}`;
    $("#gb-wall").innerHTML = notes.length ? notes.map((n, k) => noteHTML(n, k, n.id === freshId)).join("")
      : `<div class="cm-empty"><i data-lucide="sticky-note"></i><b>The wall is empty</b><span>Leave the very first message</span></div>`;
    icons();
  };
  const renderGbForm = () => {
    $("#gb-name-wrap").hidden = signedIn();
    $("#gb-as").innerHTML = signedIn() ? `Posting as <b>${esc(A.user.name)}</b> <span class="note-ok">✓</span>` : `No account needed · <button type="button" class="cm-link" data-signin>sign in</button> to get a ✓`;
    $("#gb-emojis").innerHTML = EMOJIS.map(e => `<button type="button" role="radio" aria-checked="${e === gbEmoji}" data-gbe="${e}" aria-label="${e}">${e}</button>`).join("");
    $("#gb-colors").innerHTML = COLORS.map(c => `<button type="button" role="radio" aria-checked="${c === gbColor}" data-gbc="${c}" class="sw c-${c}" aria-label="${c} note"></button>`).join("");
    $("#gb-preview").className = "note gb-prev c-" + gbColor; $("#gb-prev-e").textContent = gbEmoji;
  };
  const loadNotes = async () => { try { notes = await (await fetch(A.API + "/api/guestbook")).json(); if (!Array.isArray(notes)) notes = []; } catch (e) { notes = []; } renderNotes(); };
  root.addEventListener("click", async e => {
    const em = e.target.closest("[data-gbe]"); if (em) { gbEmoji = em.dataset.gbe; renderGbForm(); return; }
    const co = e.target.closest("[data-gbc]"); if (co) { gbColor = co.dataset.gbc; renderGbForm(); return; }
    const d = e.target.closest("[data-note-del]");
    if (d) {
      if (!confirm("Delete this message?")) return;
      try { await A.api(`/api/guestbook/${encodeURIComponent(d.dataset.noteDel)}`, { method: "DELETE" }); notes = notes.filter(n => n.id !== d.dataset.noteDel); renderNotes(); toast("Message deleted"); } catch (err) { toast(err.message); }
    }
  });
  $("#gb-text").addEventListener("input", e => { $("#gb-prev-t").textContent = e.target.value || "Your message…"; $("#gb-left").textContent = 140 - e.target.value.length; });
  $("#gb-name").addEventListener("input", e => { $("#gb-prev-n").textContent = e.target.value || "Visitor"; });
  $("#gb-form").addEventListener("submit", async e => {
    e.preventDefault();
    const text = $("#gb-text").value.trim(), name = $("#gb-name").value.trim(), btn = e.target.querySelector(".btn");
    if (!text) { toast("Write a little message first"); $("#gb-text").focus(); return; }
    btn.disabled = true;
    try {
      const res = await fetch(A.API + "/api/guestbook", { method: "POST", headers: { "Content-Type": "application/json", ...(A.user ? { Authorization: "Bearer " + A.user.token } : {}) }, body: JSON.stringify({ text, name, emoji: gbEmoji, color: gbColor, cid: UI.cid }) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error || "Couldn't post your message");
      notes.unshift(d.entry); renderNotes(d.entry.id);
      $("#gb-text").value = ""; $("#gb-prev-t").textContent = "Your message…"; $("#gb-left").textContent = 140;
      toast("Pinned on the wall · thanks!");
    } catch (err) { toast(err.message); }
    btn.disabled = false;
  });

  const refreshAuth = () => { renderIdeaForm(); renderGbForm(); loadIdeas(); renderNotes(); };
  document.addEventListener("authchange", refreshAuth);
  renderIdeaForm(); renderGbForm();
  // On charge quand la section approche de l'écran
  const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { io.disconnect(); loadIdeas(); loadNotes(); } }, { rootMargin: "600px" });
  io.observe(root);
  UI.palette && UI.palette.add(() => [
    { g: "Go to", label: "Ideas wall", hint: "Suggest and vote for the next assets", icon: "lightbulb", k: "community vote suggest idea", run: () => { showTab("ideas"); root.scrollIntoView({ behavior: "smooth" }); } },
    { g: "Go to", label: "Guestbook", hint: "Leave a little message", icon: "sticky-note", k: "community message wall", run: () => { showTab("guestbook"); root.scrollIntoView({ behavior: "smooth" }); } }
  ]);
})();
