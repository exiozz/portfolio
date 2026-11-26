/*
 * Serveur du shop Exiozz — version Cloudflare Workers (gratuit).
 *
 *  - Connexion Discord (OAuth2) avec un jeton de session signé
 *  - Commandes (tout passe par Exiozz) + panneau admin
 *  - Fichiers envoyés par l'admin sous une commande, supprimés au bout de 24 h
 *  - Bibliothèque des assets : les fichiers de chaque asset, rangés une fois,
 *    envoyés au client en un clic depuis une commande
 *  - Avis clients, notes des assets, liste d'envies, disponibilités
 *  - Activité récente anonyme, avatar Roblox pour le badge de l'accueil
 *  - Communauté : mur d'idées, réactions, compteur en direct, livre d'or
 *  - Codes promo, catalogue du shop, tarifs, projets et photos gérés depuis l'espace admin
 *  - Récupération automatique des avis et commandes de l'ancien serveur
 *
 * À coller tel quel dans l'éditeur Cloudflare (Workers → ton worker → Edit code).
 * Liaisons nécessaires (Settings → Bindings) :
 *   - D1 database  → nom de variable : DB      (avis, commandes)
 *   - KV namespace → nom de variable : FILES   (fichiers livrés)
 * Secrets nécessaires : voir cloudflare/README.md
 */

const SESSION_DAYS = 30;
const FILE_HOURS = 24;                 // durée de vie d'un fichier livré
const MAX_FILE_BYTES = 95 * 1048576;   // limite d'envoi de Cloudflare (gratuit) : 100 Mo par requête
const PART_BYTES = 24 * 1048576;
const STORAGE_LIMIT = 900 * 1048576;   // l'offre gratuite KV donne 1 Go : on garde une marge       // KV accepte 25 Mo max par valeur : les gros fichiers sont découpés
const ORDER_STATUSES = ['En attente de contact', 'Confirmée', 'En construction', 'En pause', 'Payée', 'Annulée'];

/* ------------------------------------------------------------------ outils */
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64url = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (str) => {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
const newId = () => Date.now().toString(36) + Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('');
const clampStr = (s, max) => String(s == null ? '' : s).slice(0, max);
const isHttps = (u) => /^https:\/\//i.test(u || '');
const frontUrl = (env) => String(env.FRONT_URL || 'https://exiozz.github.io/portfolio').replace(/\/+$/, '');

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

let hmacKey = null, hmacSecret = null;
async function hmac(env, data) {
  if (!hmacKey || hmacSecret !== env.SESSION_SECRET) {
    hmacSecret = env.SESSION_SECRET;
    hmacKey = await crypto.subtle.importKey('raw', enc.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  }
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, enc.encode(data))));
}
async function signToken(env, user) {
  const payload = b64url(enc.encode(JSON.stringify({ id: user.id, name: user.name, username: user.username || '', avatar: user.avatar, exp: Date.now() + SESSION_DAYS * 864e5 })));
  return payload + '.' + await hmac(env, payload);
}
async function verifyToken(env, token) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig || !safeEqual(sig, await hmac(env, payload))) return null;
  try {
    const data = JSON.parse(dec.decode(fromB64url(payload)));
    return data.exp > Date.now() ? data : null;
  } catch (e) { return null; }
}

/* ------------------------------------------------- base de données (D1) */
let schemaReady = false;
async function db(env) {
  if (!env.DB) throw new HttpError(500, 'Base de données D1 non liée (variable DB).');
  if (!schemaReady) {
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS store (key TEXT PRIMARY KEY, value TEXT NOT NULL)').run();
    schemaReady = true;
  }
  return env.DB;
}
async function getVal(env, key, fallback = null) {
  const row = await (await db(env)).prepare('SELECT value FROM store WHERE key = ?').bind(key).first();
  return row ? JSON.parse(row.value) : fallback;
}
async function setVal(env, key, value) {
  await (await db(env)).prepare('INSERT INTO store (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(key, JSON.stringify(value)).run();
}
async function updateVal(env, key, fallback, fn) {
  const cur = await getVal(env, key, fallback);
  const res = await fn(cur);
  const next = res === undefined ? cur : res;
  await setVal(env, key, next);
  return next;
}

/* ------------------------------------------------------------ Discord */
async function discordDM(env, discordId, content) {
  if (!env.DISCORD_BOT_TOKEN || !/^\d+$/.test(discordId)) return;
  try {
    const headers = { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' };
    const ch = await fetch('https://discord.com/api/v10/users/@me/channels', { method: 'POST', headers, body: JSON.stringify({ recipient_id: discordId }) });
    if (!ch.ok) throw new Error('ouverture du MP ' + ch.status);
    const { id } = await ch.json();
    const msg = await fetch(`https://discord.com/api/v10/channels/${id}/messages`, { method: 'POST', headers, body: JSON.stringify({ content }) });
    if (!msg.ok) throw new Error('envoi ' + msg.status);
  } catch (e) { console.warn(`MP Discord à ${discordId} impossible :`, e.message); }
}
// Profil Discord public (pseudo @, avatar) via le bot : sert à compléter les fiches clients
async function discordUser(env, discordId) {
  if (!env.DISCORD_BOT_TOKEN || !/^\d{17,20}$/.test(discordId)) return null;
  try {
    const r = await fetch(`https://discord.com/api/v10/users/${discordId}`, { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } });
    if (!r.ok) return null;
    const u = await r.json();
    return { username: u.username, name: u.global_name || u.username, avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : '' };
  } catch (e) { return null; }
}
async function notifyAdmin(env, content) {
  if (!isHttps(env.DISCORD_ORDERS_WEBHOOK_URL)) return;
  try {
    await fetch(env.DISCORD_ORDERS_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: content.slice(0, 1900), allowed_mentions: { parse: [] } }) });
  } catch (e) { console.warn('Webhook admin :', e.message); }
}

/* ------------------------------------------------- fichiers livrés (KV) */
const liveFiles = (order) => (order.files || []).filter((f) => f.expiresAt > Date.now());
const publicOrder = (o) => ({ ...o, files: liveFiles(o).map((f) => ({ id: f.id, name: f.name, size: f.size, kind: f.url ? 'link' : 'file', expiresAt: f.expiresAt })) });
const partKey = (id, i) => `file:${id}:${i}`;
const shotKey = (id) => `shot:${id}`;           // captures de la vitrine des clients
const SHOT_MAX_BYTES = 2 * 1048576;
const fromB64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
const libKey = (id, i) => `lib:${id}:${i}`;
// Un fichier de commande peut pointer vers un fichier de la bibliothèque (champ lib)
const fileKey = (f, i) => (f.lib ? libKey(f.lib, i) : partKey(f.id, i));

// Enregistre le corps de la requête dans KV, découpé en morceaux de 24 Mo, sans tout charger en mémoire.
// permanent = true pour la bibliothèque (pas de suppression automatique)
async function saveFile(env, id, body, permanent) {
  if (!env.FILES) throw new HttpError(500, 'Stockage KV non lié (variable FILES).');
  const keyOf = permanent ? libKey : partKey;
  const opts = permanent ? {} : { expirationTtl: (FILE_HOURS + 1) * 3600 }; // KV supprime tout seul après ce délai
  const reader = body.getReader();
  let leftover = null, finished = false, total = 0, parts = 0;
  while (!finished) {
    let partSize = 0;
    const stream = new ReadableStream({
      async pull(controller) {
        let chunk = leftover;
        leftover = null;
        if (!chunk) {
          const r = await reader.read();
          if (r.done) { finished = true; controller.close(); return; }
          chunk = r.value;
        }
        const room = PART_BYTES - partSize;
        if (chunk.byteLength > room) {
          controller.enqueue(chunk.subarray(0, room));
          leftover = chunk.subarray(room);
          partSize += room;
        } else {
          controller.enqueue(chunk);
          partSize += chunk.byteLength;
        }
        total = partSize + parts * PART_BYTES;
        if (total > MAX_FILE_BYTES) { controller.error(new HttpError(413, 'Fichier trop gros (95 Mo maximum).')); return; }
        if (partSize >= PART_BYTES) controller.close();
      }
    });
    await env.FILES.put(keyOf(id, parts), stream, opts);
    if (partSize === 0 && parts > 0) { await env.FILES.delete(keyOf(id, parts)); break; }
    parts++;
    if (partSize < PART_BYTES) finished = true;
  }
  return { size: total, parts };
}
// Espace occupé dans KV : bibliothèque + fichiers de commandes encore valables (les liens ne comptent pas)
async function storageUsed(env) {
  let used = 0;
  for (const files of Object.values(await getVal(env, 'library', {}))) for (const f of files) if (!f.url) used += f.size || 0;
  for (const o of await getVal(env, 'orders', [])) for (const f of liveFiles(o)) if (!f.lib && !f.url) used += f.size || 0;
  return used;
}
const mo = (b) => Math.round(b / 1048576);
async function checkSpace(env, request) {
  const len = +request.headers.get('Content-Length') || 0;
  const used = await storageUsed(env);
  if (used + len > STORAGE_LIMIT) throw new HttpError(507, `Stockage presque plein (${mo(used)} Mo sur ${mo(STORAGE_LIMIT)} Mo). Pour ce fichier, utilise un lien Google Drive ou MEGA, ou supprime des fichiers de la bibliothèque.`);
}

async function removeFile(env, file) {
  if (file.lib) return; // copie d'un fichier de la bibliothèque : la bibliothèque reste intacte
  for (let i = 0; i < (file.parts || 1); i++) await env.FILES.delete(partKey(file.id, i)).catch(() => {});
}

/* -------------------------------------- import depuis l'ancien serveur */
let importChecked = false;
async function ensureImported(env) {
  if (importChecked) return;
  const state = await getVal(env, 'importedFromOld', null);
  if (state && state.done) { importChecked = true; return; }
  if (state && state.lastTry && Date.now() - state.lastTry < 10 * 60e3) return; // on réessaie toutes les 10 min max
  const old = String(env.OLD_API_URL || 'https://exiozz-discord-auth--tomokari35.replit.app').replace(/\/+$/, '');
  const getJson = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url} → ${r.status}`); return r.json(); };
  let reviews, orders = [];
  try { reviews = await getJson(`${old}/api/reviews`); }
  catch (e) { await setVal(env, 'importedFromOld', { done: false, lastTry: Date.now(), error: e.message }); return; }
  if (env.ADMIN_DISCORD_ID) orders = await getJson(`${old}/api/admin/orders?requesterId=${encodeURIComponent(env.ADMIN_DISCORD_ID)}`).catch(() => []);
  if (!Array.isArray(reviews)) reviews = [];
  if (!Array.isArray(orders)) orders = [];
  await updateVal(env, 'reviews', [], (cur) => {
    const ids = new Set(cur.map((r) => r.discordId));
    return cur.concat(reviews.filter((r) => r && r.discordId && !ids.has(r.discordId)));
  });
  await updateVal(env, 'orders', [], (cur) => {
    const ids = new Set(cur.map((o) => String(o.id)));
    return cur.concat(orders.filter((o) => o && o.id != null && !ids.has(String(o.id))).map((o) => ({ ...o, id: String(o.id), files: [] })))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  });
  await setVal(env, 'importedFromOld', { done: true, at: Date.now(), reviews: reviews.length, orders: orders.length });
  importChecked = true;
}

/* ------------------------------------------------------------------ routes */
async function auth(env, request) {
  const m = /^Bearer (.+)$/.exec(request.headers.get('Authorization') || '');
  const user = m && await verifyToken(env, m[1]);
  if (!user) throw new HttpError(401, 'Session expirée : reconnecte-toi avec Discord.');
  return { ...user, isAdmin: !!env.ADMIN_DISCORD_ID && user.id === env.ADMIN_DISCORD_ID };
}
const adminOnly = (user) => { if (!user.isAdmin) throw new HttpError(403, 'Réservé à l\'admin.'); };
const readJson = async (request) => { try { return await request.json(); } catch (e) { return {}; } };
const fileSig = (env, fileId, exp) => hmac(env, `file:${fileId}:${exp}`);

async function route(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method;
  const FRONT = frontUrl(env);
  let m;

  if (path === '/' || path === '/api/health') return json({ ok: true, service: 'exiozz-server (Cloudflare)' });

  /* --- Connexion Discord --- */
  if (path === '/auth/discord' && method === 'GET') {
    const page = { shop: 'shop.html', index: 'index.html' }[url.searchParams.get('state')] || 'index.html';
    const back = (hash) => Response.redirect(`${FRONT}/${page}${hash}`, 302);
    const code = url.searchParams.get('code');
    if (!code) return back('#login_error=1');
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code', code, redirect_uri: env.DISCORD_REDIRECT_URI
      })
    });
    if (!tokenRes.ok) { console.error('OAuth Discord', tokenRes.status, await tokenRes.text()); return back('#login_error=1'); }
    const { access_token } = await tokenRes.json();
    const meRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${access_token}` } });
    if (!meRes.ok) return back('#login_error=1');
    const u = await meRes.json();
    const user = { id: u.id, name: u.global_name || u.username, username: u.username, avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : '' };
    // Le jeton passe dans le # de l'URL : il n'est jamais envoyé à un serveur.
    const p = new URLSearchParams({ token: await signToken(env, user), discord_id: user.id, discord_user: user.name, discord_avatar: user.avatar });
    return back('#' + p.toString());
  }

  if (path === '/api/me' && method === 'GET') {
    const user = await auth(env, request);
    return json({ user: { id: user.id, name: user.name, avatar: user.avatar }, isAdmin: user.isAdmin, subscription: null });
  }

  /* --- Commandes --- */
  if (path === '/api/order' && method === 'POST') {
    const user = await auth(env, request);
    const b = await readJson(request);
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 30).map((it) => ({
      title: clampStr(it.title, 200),
      price: Math.max(0, +it.price || 0),
      productId: it.productId ? clampStr(it.productId, 100) : undefined,
      offer: ['single', 'pass'].includes(it.offer) ? it.offer : undefined,
      type: clampStr(it.type || 'asset', 30)
    }));
    if (!items.length) throw new HttpError(400, 'Panier vide.');
    const order = {
      id: newId(), customerName: user.name, discordId: user.id, discordUsername: user.username || undefined, avatar: user.avatar || undefined, items,
      total: items.reduce((s, it) => s + it.price, 0),
      currency: clampStr(b.currency || '€', 5), source: clampStr(b.source || 'site', 20),
      note: clampStr(b.note, 1000).trim() || undefined, // message du client (demande de devis)
      status: 'En attente de contact', timestamp: Date.now(), files: []
    };
    const promoCode = clampStr(b.promo, 40).trim().toUpperCase();
    if (promoCode) {
      order.promo = promoCode;
      ctx.waitUntil(updateVal(env, 'promos', [], (list) => { const pr = list.find((x) => x.code === promoCode); if (pr) pr.uses = (pr.uses || 0) + 1; return list; }).catch(() => {}));
    }
    await updateVal(env, 'orders', [], (orders) => { orders.unshift(order); return orders; });
    ctx.waitUntil(notifyAdmin(env, `🛒 Nouvelle commande de **${order.customerName}**${order.discordUsername ? ` (@${order.discordUsername})` : ''} — <@${order.discordId}> — ${order.total} ${order.currency}\n` + items.map((it) => `• ${it.title} — ${it.price}`).join('\n') + (order.note ? `\n> ${order.note.slice(0, 500)}` : '')));
    return json({ ok: true, id: order.id });
  }

  if ((m = /^\/api\/orders\/([^/]+)$/.exec(path)) && method === 'GET') {
    const user = await auth(env, request);
    const discordId = decodeURIComponent(m[1]);
    if (discordId !== user.id && !user.isAdmin) throw new HttpError(403, 'Accès refusé.');
    const orders = await getVal(env, 'orders', []);
    return json(orders.filter((o) => o.discordId === discordId).map(publicOrder));
  }

  if (path === '/api/admin/orders' && method === 'GET') {
    const user = await auth(env, request); adminOnly(user);
    await ensureImported(env);
    let orders = await getVal(env, 'orders', []);
    // Complète les fiches sans pseudo Discord (anciennes commandes) grâce au bot, puis les garde en base
    const missing = [...new Set(orders.filter((o) => !o.discordUsername && o.discordId).map((o) => o.discordId))].slice(0, 15);
    if (missing.length) {
      const found = Object.fromEntries((await Promise.all(missing.map(async (id) => [id, await discordUser(env, id)]))).filter(([, u]) => u));
      if (Object.keys(found).length) {
        orders = await updateVal(env, 'orders', [], (list) => {
          for (const o of list) { const u = found[o.discordId]; if (u && !o.discordUsername) { o.discordUsername = u.username; if (!o.avatar) o.avatar = u.avatar; } }
          return list;
        });
      }
    }
    // nombre de commandes par client, pour repérer les habitués
    const count = {}; for (const o of orders) count[o.discordId] = (count[o.discordId] || 0) + 1;
    return json(orders.map((o) => ({ ...publicOrder(o), clientOrders: count[o.discordId] || 1 })));
  }

  // Commande créée par l'admin pour un client (ex. demande reçue en MP Discord)
  if (path === '/api/admin/orders' && method === 'POST') {
    const user = await auth(env, request); adminOnly(user);
    const b = await readJson(request);
    const discordId = String(b.discordId || '').trim();
    const customerName = clampStr(b.customerName, 80).trim();
    if (!/^\d{17,20}$/.test(discordId)) throw new HttpError(400, 'ID Discord invalide (17 à 20 chiffres).');
    if (!customerName) throw new HttpError(400, 'Nom du client manquant.');
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 30).map((it) => ({
      title: clampStr(it.title, 200).trim(),
      price: Math.max(0, +it.price || 0),
      productId: it.productId ? clampStr(it.productId, 100) : undefined,
      type: it.productId ? 'asset' : 'custom'
    })).filter((it) => it.title);
    if (!items.length) throw new HttpError(400, 'Ajoute au moins un article.');
    const status = ORDER_STATUSES.includes(b.status) ? b.status : 'Confirmée';
    const prof = await discordUser(env, discordId);
    const order = {
      id: newId(), customerName, discordId, discordUsername: prof ? prof.username : undefined, avatar: prof ? prof.avatar || undefined : undefined, items,
      total: items.reduce((s, it) => s + it.price, 0),
      currency: b.currency === 'R$' ? 'R$' : '€', source: 'admin',
      note: clampStr(b.note, 1000).trim() || undefined,
      status, timestamp: Date.now(), files: []
    };
    await updateVal(env, 'orders', [], (orders) => { orders.unshift(order); return orders; });
    if (b.notify) ctx.waitUntil(discordDM(env, discordId, `🧾 Exiozz a créé ta commande : ${items.map((it) => `**${it.title}**`).join(', ')} — ${order.total} ${order.currency}\nSuis-la sur ${FRONT}/shop.html → menu Discord → « Mes commandes ».`));
    return json({ ok: true, id: order.id });
  }

  if ((m = /^\/api\/orders\/([^/]+)$/.exec(path)) && method === 'PATCH') {
    const user = await auth(env, request); adminOnly(user);
    const { status } = await readJson(request);
    if (!ORDER_STATUSES.includes(status)) throw new HttpError(400, 'Statut inconnu.');
    let found = false;
    await updateVal(env, 'orders', [], (orders) => {
      const o = orders.find((x) => x.id === decodeURIComponent(m[1]));
      if (o) { o.status = status; found = true; }
      return orders;
    });
    if (!found) throw new HttpError(404, 'Commande introuvable.');
    return json({ ok: true });
  }

  if ((m = /^\/api\/orders\/([^/]+)$/.exec(path)) && method === 'DELETE') {
    const user = await auth(env, request); adminOnly(user);
    let removed = null;
    await updateVal(env, 'orders', [], (orders) => {
      removed = orders.find((o) => o.id === decodeURIComponent(m[1])) || null;
      return orders.filter((o) => o.id !== decodeURIComponent(m[1]));
    });
    if (!removed) throw new HttpError(404, 'Commande introuvable.');
    for (const f of removed.files || []) await removeFile(env, f);
    return json({ ok: true });
  }

  /* --- Fichiers livrés (24 h) --- */
  if ((m = /^\/api\/orders\/([^/]+)\/files$/.exec(path)) && method === 'POST') {
    const user = await auth(env, request); adminOnly(user);
    const orderId = decodeURIComponent(m[1]);
    const order = (await getVal(env, 'orders', [])).find((o) => o.id === orderId);
    if (!order) throw new HttpError(404, 'Commande introuvable.');
    if (+request.headers.get('Content-Length') > MAX_FILE_BYTES) throw new HttpError(413, 'Fichier trop gros (95 Mo maximum).');
    if (!request.body) throw new HttpError(400, 'Fichier vide.');
    await checkSpace(env, request);
    const name = clampStr(String(url.searchParams.get('name') || 'fichier').replace(/[\\/:*?"<>|\r\n]+/g, '_').trim(), 150) || 'fichier';
    const id = newId();
    const { size, parts } = await saveFile(env, id, request.body);
    const file = { id, name, size, parts, uploadedAt: Date.now(), expiresAt: Date.now() + FILE_HOURS * 3600e3 };
    let ok = false;
    await updateVal(env, 'orders', [], (orders) => {
      const o = orders.find((x) => x.id === orderId);
      if (o) { o.files = liveFiles(o).concat(file); ok = true; }
      return orders;
    });
    if (!ok) { await removeFile(env, file); throw new HttpError(404, 'Commande supprimée entre-temps.'); }
    ctx.waitUntil(discordDM(env, order.discordId, `📦 Tes fichiers sont prêts : **${name}**\nTélécharge-les sur ${FRONT}/shop.html → menu Discord → « Mes commandes ».\n⏳ Ils seront supprimés dans ${FILE_HOURS} h.`));
    return json({ ok: true, file: { id, name, size, expiresAt: file.expiresAt } });
  }

  if ((m = /^\/api\/orders\/([^/]+)\/links$/.exec(path)) && method === 'POST') {
    const user = await auth(env, request); adminOnly(user);
    const orderId = decodeURIComponent(m[1]);
    const b = await readJson(request);
    const link = clampStr(String(b.url || '').trim(), 2000);
    if (!isHttps(link)) throw new HttpError(400, 'Le lien doit commencer par https://');
    const name = clampStr(String(b.name || '').trim(), 150) || 'Lien de téléchargement';
    const file = { id: newId(), name, url: link, uploadedAt: Date.now(), expiresAt: Date.now() + FILE_HOURS * 3600e3 };
    let order = null;
    await updateVal(env, 'orders', [], (orders) => {
      order = orders.find((x) => x.id === orderId) || null;
      if (order) order.files = liveFiles(order).concat(file);
      return orders;
    });
    if (!order) throw new HttpError(404, 'Commande introuvable.');
    ctx.waitUntil(discordDM(env, order.discordId, `📦 Tes fichiers sont prêts : **${name}**\nRécupère-les sur ${FRONT}/shop.html → menu Discord → « Mes commandes ».\n⏳ Disponibles pendant ${FILE_HOURS} h.`));
    return json({ ok: true });
  }

  if ((m = /^\/api\/orders\/([^/]+)\/files\/([^/]+)$/.exec(path)) && method === 'DELETE') {
    const user = await auth(env, request); adminOnly(user);
    let file = null;
    await updateVal(env, 'orders', [], (orders) => {
      const o = orders.find((x) => x.id === decodeURIComponent(m[1]));
      if (o) { file = (o.files || []).find((f) => f.id === m[2]) || null; o.files = (o.files || []).filter((f) => f.id !== m[2]); }
      return orders;
    });
    if (file) await removeFile(env, file);
    return json({ ok: true });
  }

  // Lien de téléchargement signé, valable 10 minutes
  if ((m = /^\/api\/files\/([^/]+)\/link$/.exec(path)) && method === 'GET') {
    const user = await auth(env, request);
    const orders = await getVal(env, 'orders', []);
    const order = orders.find((o) => liveFiles(o).some((f) => f.id === m[1]));
    if (!order) throw new HttpError(404, 'Fichier introuvable ou expiré.');
    if (order.discordId !== user.id && !user.isAdmin) throw new HttpError(403, 'Accès refusé.');
    const linked = liveFiles(order).find((f) => f.id === m[1]);
    if (linked.url) return json({ url: linked.url, external: true });
    const exp = Date.now() + 10 * 60e3;
    return json({ url: `${url.origin}/api/files/${encodeURIComponent(m[1])}/download?exp=${exp}&sig=${await fileSig(env, m[1], exp)}` });
  }

  if ((m = /^\/api\/files\/([^/]+)\/download$/.exec(path)) && method === 'GET') {
    const fileId = m[1], exp = +url.searchParams.get('exp');
    if (!(exp > Date.now()) || !safeEqual(url.searchParams.get('sig') || '', await fileSig(env, fileId, exp))) {
      return new Response('Lien expiré : relance le téléchargement depuis le shop.', { status: 403 });
    }
    const orders = await getVal(env, 'orders', []);
    const order = orders.find((o) => liveFiles(o).some((f) => f.id === fileId));
    if (!order) return new Response('Fichier expiré ou supprimé.', { status: 404 });
    const file = liveFiles(order).find((f) => f.id === fileId);
    if (file.url) return Response.redirect(file.url, 302);
    const first = await env.FILES.get(fileKey(file, 0), 'stream');
    if (!first) return new Response('Fichier expiré ou supprimé.', { status: 404 });
    const { readable, writable } = new TransformStream();
    ctx.waitUntil((async () => {
      await first.pipeTo(writable, { preventClose: true });
      for (let i = 1; i < (file.parts || 1); i++) {
        const s = await env.FILES.get(fileKey(file, i), 'stream');
        if (!s) break;
        await s.pipeTo(writable, { preventClose: true });
      }
      await writable.close();
    })().catch((e) => writable.abort(e)));
    return new Response(readable, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        ...(file.size ? { 'Content-Length': String(file.size) } : {})
      }
    });
  }

  /* --- Bibliothèque des assets (admin) --- */
  if (path === '/api/admin/library' && method === 'GET') {
    const user = await auth(env, request); adminOnly(user);
    return json({ assets: await getVal(env, 'library', {}), used: await storageUsed(env), limit: STORAGE_LIMIT });
  }

  if ((m = /^\/api\/admin\/library\/([^/]+)\/files$/.exec(path)) && method === 'POST') {
    const user = await auth(env, request); adminOnly(user);
    const assetId = clampStr(decodeURIComponent(m[1]), 100);
    if (+request.headers.get('Content-Length') > MAX_FILE_BYTES) throw new HttpError(413, 'Fichier trop gros (95 Mo maximum).');
    if (!request.body) throw new HttpError(400, 'Fichier vide.');
    await checkSpace(env, request);
    const name = clampStr(String(url.searchParams.get('name') || 'fichier').replace(/[\\/:*?"<>|\r\n]+/g, '_').trim(), 150) || 'fichier';
    const id = newId();
    const { size, parts } = await saveFile(env, id, request.body, true);
    const file = { id, name, size, parts, uploadedAt: Date.now() };
    await updateVal(env, 'library', {}, (lib) => { lib[assetId] = (lib[assetId] || []).concat(file); return lib; });
    return json({ ok: true, file });
  }

  // Ajoute un lien (Google Drive, MEGA…) pour les fichiers trop gros
  if ((m = /^\/api\/admin\/library\/([^/]+)\/links$/.exec(path)) && method === 'POST') {
    const user = await auth(env, request); adminOnly(user);
    const assetId = clampStr(decodeURIComponent(m[1]), 100);
    const b = await readJson(request);
    const link = clampStr(String(b.url || '').trim(), 2000);
    if (!isHttps(link)) throw new HttpError(400, 'Le lien doit commencer par https://');
    const name = clampStr(String(b.name || '').trim(), 150) || 'Lien de téléchargement';
    const file = { id: newId(), name, url: link, uploadedAt: Date.now() };
    await updateVal(env, 'library', {}, (lib) => { lib[assetId] = (lib[assetId] || []).concat(file); return lib; });
    return json({ ok: true, file });
  }

  if ((m = /^\/api\/admin\/library\/([^/]+)\/files\/([^/]+)$/.exec(path)) && method === 'DELETE') {
    const user = await auth(env, request); adminOnly(user);
    const assetId = decodeURIComponent(m[1]);
    let file = null;
    await updateVal(env, 'library', {}, (lib) => {
      file = (lib[assetId] || []).find((f) => f.id === m[2]) || null;
      lib[assetId] = (lib[assetId] || []).filter((f) => f.id !== m[2]);
      if (!lib[assetId].length) delete lib[assetId];
      return lib;
    });
    if (file && !file.url) for (let i = 0; i < (file.parts || 1); i++) await env.FILES.delete(libKey(file.id, i)).catch(() => {});
    return json({ ok: true });
  }

  // Envoie au client tous les fichiers de la bibliothèque des assets choisis (visibles 24 h dans « Mes commandes »)
  if ((m = /^\/api\/orders\/([^/]+)\/send-assets$/.exec(path)) && method === 'POST') {
    const user = await auth(env, request); adminOnly(user);
    const orderId = decodeURIComponent(m[1]);
    const { assetIds } = await readJson(request);
    const lib = await getVal(env, 'library', {});
    const chosen = (Array.isArray(assetIds) ? assetIds : []).flatMap((a) => lib[a] || []);
    if (!chosen.length) throw new HttpError(404, 'Aucun fichier dans la bibliothèque pour cet asset.');
    const expiresAt = Date.now() + FILE_HOURS * 3600e3;
    const added = chosen.map((f) => ({ id: newId(), lib: f.id, name: f.name, size: f.size, parts: f.parts, ...(f.url ? { url: f.url } : {}), uploadedAt: Date.now(), expiresAt }));
    let order = null;
    await updateVal(env, 'orders', [], (orders) => {
      order = orders.find((x) => x.id === orderId) || null;
      if (order) {
        // un renvoi remplace l'ancien envoi des mêmes fichiers (le délai de 24 h repart de zéro)
        order.files = liveFiles(order).filter((f) => !(f.lib && chosen.some((c) => c.id === f.lib))).concat(added);
      }
      return orders;
    });
    if (!order) throw new HttpError(404, 'Commande introuvable.');
    ctx.waitUntil(discordDM(env, order.discordId, `📦 Tes fichiers sont prêts : ${added.map((f) => `**${f.name}**`).join(', ')}\nTélécharge-les sur ${FRONT}/shop.html → menu Discord → « Mes commandes ».\n⏳ Ils seront disponibles pendant ${FILE_HOURS} h.`));
    return json({ ok: true, count: added.length });
  }

  /* --- Avis --- */
  if (path === '/api/reviews' && method === 'GET') {
    await ensureImported(env);
    // Connecté (facultatif) : on indique les avis que la personne a déjà aimés. La liste des « j'aime » n'est jamais envoyée.
    let me = null; try { me = (await auth(env, request)).id; } catch (e) {}
    return json((await getVal(env, 'reviews', [])).map(({ likedBy, ...r }) => ({ ...r, likes: (likedBy || []).length, liked: !!me && (likedBy || []).includes(me) })));
  }
  // « J'aime » sur un avis (un par compte Discord, on clique encore pour retirer)
  if ((m = /^\/api\/reviews\/([^/]+)\/like$/.exec(path)) && method === 'POST') {
    const user = await auth(env, request);
    const author = decodeURIComponent(m[1]);
    if (author === user.id) throw new HttpError(400, 'Tu ne peux pas aimer ton propre avis.');
    let out = null;
    await updateVal(env, 'reviews', [], (reviews) => {
      const r = reviews.find((x) => x.discordId === author);
      if (!r) return reviews;
      const set = new Set(r.likedBy || []);
      if (set.has(user.id)) set.delete(user.id); else set.add(user.id);
      r.likedBy = [...set];
      out = { liked: set.has(user.id), likes: set.size };
      return reviews;
    });
    if (!out) throw new HttpError(404, 'Avis introuvable.');
    return json({ ok: true, ...out });
  }
  if (path === '/api/reviews' && method === 'POST') {
    const user = await auth(env, request);
    const b = await readJson(request);
    const rating = Math.round(+b.rating);
    const text = clampStr(b.text, 1000).trim();
    if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, 'Note invalide.');
    if (!text) throw new HttpError(400, 'Avis vide.');
    await ensureImported(env);
    // Pays facultatif (code ISO à 2 lettres), affiché sur le globe des avis
    const country = /^[A-Z]{2}$/.test(String(b.country || '').toUpperCase()) ? String(b.country).toUpperCase() : undefined;
    const review = { discordId: user.id, name: user.name, avatar: user.avatar || '', rating, text, country, timestamp: Date.now() };
    // Un nouvel avis remplace l'ancien, en gardant ses « j'aime »
    await updateVal(env, 'reviews', [], (reviews) => { const old = reviews.find((r) => r.discordId === user.id); if (old && old.likedBy) review.likedBy = old.likedBy; return [review, ...reviews.filter((r) => r.discordId !== user.id)]; });
    return json({ ok: true });
  }
  if ((m = /^\/api\/reviews\/([^/]+)$/.exec(path)) && method === 'DELETE') {
    const user = await auth(env, request);
    const discordId = decodeURIComponent(m[1]);
    if (discordId !== user.id && !user.isAdmin) throw new HttpError(403, 'Accès refusé.');
    await updateVal(env, 'reviews', [], (reviews) => reviews.filter((r) => r.discordId !== discordId));
    return json({ ok: true });
  }

  /* --- Liste d'envies : gardée avec le compte Discord --- */
  if (path === '/api/wishlist' && method === 'GET') {
    const user = await auth(env, request);
    return json((await getVal(env, 'wishlists', {}))[user.id] || []);
  }
  if (path === '/api/wishlist' && method === 'POST') {
    const user = await auth(env, request);
    const b = await readJson(request);
    const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map((x) => clampStr(x, 100).trim()).filter(Boolean))].slice(0, 100);
    await updateVal(env, 'wishlists', {}, (w) => { w[user.id] = ids; return w; });
    return json({ ok: true, ids });
  }

  /* --- Notes des assets : seuls les clients dont la commande est « Payée » peuvent noter --- */
  if (path === '/api/asset-reviews' && method === 'GET') {
    return json(await getVal(env, 'assetReviews', {}));
  }
  if (path === '/api/asset-reviews' && method === 'POST') {
    const user = await auth(env, request);
    const b = await readJson(request);
    const productId = clampStr(b.productId, 100).trim();
    const rating = Math.round(+b.rating);
    const text = clampStr(b.text, 600).trim();
    if (!productId) throw new HttpError(400, 'Asset manquant.');
    if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, 'Note invalide.');
    const orders = await getVal(env, 'orders', []);
    const bought = orders.some((o) => o.discordId === user.id && o.status === 'Payée' && (o.items || []).some((it) => it.productId === productId));
    if (!bought && !user.isAdmin) throw new HttpError(403, 'Seuls les clients qui ont acheté cet asset peuvent le noter.');
    // Capture d'écran facultative (vitrine « Made with this asset ») : envoyée en data URL, gardée dans KV
    let image = null;
    if (b.image) {
      const mm = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.image));
      if (!mm) throw new HttpError(400, 'Image invalide (JPEG, PNG ou WebP).');
      const bytes = fromB64(mm[2]);
      if (bytes.length > SHOT_MAX_BYTES) throw new HttpError(413, 'Image trop lourde (2 Mo max).');
      if (!env.FILES) throw new HttpError(500, 'Stockage KV non lié (variable FILES).');
      image = newId();
      await env.FILES.put(shotKey(image), bytes, { metadata: { type: mm[1] } });
    }
    const review = { discordId: user.id, name: user.name, avatar: user.avatar || '', rating, text, timestamp: Date.now() };
    let oldImage = null;
    await updateVal(env, 'assetReviews', {}, (all) => {
      const old = (all[productId] || []).find((r) => r.discordId === user.id);
      if (old && old.image) { if (image || b.removeImage) oldImage = old.image; else review.image = old.image; }
      if (image) review.image = image;
      all[productId] = [review, ...(all[productId] || []).filter((r) => r.discordId !== user.id)];
      return all;
    });
    if (oldImage) await env.FILES.delete(shotKey(oldImage)).catch(() => {});
    return json({ ok: true, review });
  }
  // Image de la vitrine (publique, mise en cache)
  if ((m = /^\/api\/shots\/([a-z0-9]+)$/.exec(path)) && method === 'GET') {
    if (!env.FILES) throw new HttpError(404, 'Image introuvable.');
    const { value, metadata } = await env.FILES.getWithMetadata(shotKey(m[1]), 'arrayBuffer');
    if (!value) throw new HttpError(404, 'Image introuvable.');
    return new Response(value, { headers: { 'Content-Type': (metadata && metadata.type) || 'image/jpeg', 'Cache-Control': 'public, max-age=86400' } });
  }
  // Retirer seulement l'image d'une note (l'auteur ou l'admin)
  if ((m = /^\/api\/asset-reviews\/([^/]+)\/([^/]+)\/image$/.exec(path)) && method === 'DELETE') {
    const user = await auth(env, request);
    const productId = decodeURIComponent(m[1]), discordId = decodeURIComponent(m[2]);
    if (discordId !== user.id && !user.isAdmin) throw new HttpError(403, 'Accès refusé.');
    let img = null;
    await updateVal(env, 'assetReviews', {}, (all) => {
      const r = (all[productId] || []).find((x) => x.discordId === discordId);
      if (r && r.image) { img = r.image; delete r.image; }
      return all;
    });
    if (!img) throw new HttpError(404, 'Pas d\'image sur cette note.');
    await env.FILES.delete(shotKey(img)).catch(() => {});
    return json({ ok: true });
  }
  if ((m = /^\/api\/asset-reviews\/([^/]+)\/([^/]+)$/.exec(path)) && method === 'DELETE') {
    const user = await auth(env, request);
    const productId = decodeURIComponent(m[1]), discordId = decodeURIComponent(m[2]);
    if (discordId !== user.id && !user.isAdmin) throw new HttpError(403, 'Accès refusé.');
    let img = null;
    await updateVal(env, 'assetReviews', {}, (all) => {
      const r = (all[productId] || []).find((x) => x.discordId === discordId);
      if (r && r.image) img = r.image;
      all[productId] = (all[productId] || []).filter((x) => x.discordId !== discordId);
      return all;
    });
    if (img && env.FILES) await env.FILES.delete(shotKey(img)).catch(() => {});
    return json({ ok: true });
  }

  /* --- Disponibilités (places libres ce mois-ci), réglées depuis l'espace admin --- */
  if (path === '/api/availability' && method === 'GET') {
    return json(await getVal(env, 'availability', { slots: null, note: '', updatedAt: 0 }));
  }
  if (path === '/api/availability' && method === 'POST') {
    const user = await auth(env, request); adminOnly(user);
    const b = await readJson(request);
    const slots = b.slots === null || b.slots === '' ? null : Math.max(0, Math.min(99, Math.round(+b.slots) || 0));
    const value = { slots, note: clampStr(b.note, 140).trim(), updatedAt: Date.now() };
    await setVal(env, 'availability', value);
    return json({ ok: true, ...value });
  }

  /* --- Activité récente, anonyme (aucun nom) : bulles « quelqu'un vient de commander… » sur l'accueil --- */
  if (path === '/api/activity' && method === 'GET') {
    const since = Date.now() - 30 * 864e5;
    const [orders, reviews, assetReviews] = await Promise.all([getVal(env, 'orders', []), getVal(env, 'reviews', []), getVal(env, 'assetReviews', {})]);
    const clean = (t) => String(t || '').replace(/\s*\((bundle|code)[^)]*\)\s*$/i, '').slice(0, 80);
    const events = [
      ...orders.filter((o) => o.timestamp > since && o.status !== 'Annulée' && o.source !== 'admin')
        .map((o) => {
          const asset = (o.items || []).find((it) => it.productId);
          return asset ? { kind: 'order', title: clean(asset.title), more: (o.items || []).length - 1, ts: o.timestamp }
            : (o.items || []).some((it) => it.type === 'quote') ? { kind: 'quote', ts: o.timestamp } : null;
        }).filter(Boolean),
      ...reviews.filter((r) => r.timestamp > since).map((r) => ({ kind: 'review', rating: r.rating, country: r.country || null, ts: r.timestamp })),
      ...Object.entries(assetReviews).flatMap(([pid, list]) => list.filter((r) => r.timestamp > since).map((r) => ({ kind: 'rating', productId: pid, rating: r.rating, ts: r.timestamp })))
    ].sort((a, b) => b.ts - a.ts).slice(0, 12);
    return new Response(JSON.stringify(events), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' } });
  }

  /* --- Avatar Roblox d'un pseudo, pour le badge personnalisé de l'accueil --- */
  if (path === '/api/roblox-avatar' && method === 'GET') {
    const name = String(url.searchParams.get('u') || '').trim();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) throw new HttpError(400, 'Pseudo Roblox invalide.');
    const ur = await fetch('https://users.roblox.com/v1/usernames/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernames: [name], excludeBannedUsers: true }) });
    const u = ur.ok ? ((await ur.json()).data || [])[0] : null;
    if (!u) throw new HttpError(404, 'Aucun joueur Roblox avec ce pseudo.');
    const tr = await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${u.id}&size=420x420&format=Png&isCircular=false`);
    const t = tr.ok ? ((await tr.json()).data || [])[0] : null;
    if (!t || !t.imageUrl) throw new HttpError(502, 'Avatar indisponible pour le moment, réessaie.');
    return new Response(JSON.stringify({ id: u.id, name: u.name, displayName: u.displayName || u.name, img: t.imageUrl }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=600' } });
  }

  /* ============================== Communauté ============================== */
  // Identifiant anonyme d'un navigateur (pour les réactions, le livre d'or et le compteur en direct) :
  // on ne garde qu'une empreinte signée, jamais l'identifiant lui-même.
  const anonId = async (raw) => { const v = String(raw || ''); if (!/^[a-z0-9-]{16,64}$/i.test(v)) throw new HttpError(400, 'Identifiant invalide.'); return (await hmac(env, 'anon:' + v)).slice(0, 22); };
  const ipKey = async () => (await hmac(env, 'ip:' + (request.headers.get('CF-Connecting-IP') || 'x'))).slice(0, 22);
  const optUser = async () => { try { return await auth(env, request); } catch (e) { return null; } };

  /* --- Mur d'idées : proposer (connecté), voter (connecté), l'admin marque « prévue » ou « faite » --- */
  const IDEA_STATUSES = ['open', 'planned', 'done'];
  const publicIdea = (me) => ({ voters, ...i }) => ({ ...i, votes: (voters || []).length, voted: !!me && (voters || []).includes(me) });
  if (path === '/api/ideas' && method === 'GET') {
    const me = (await optUser()) || null;
    const list = (await getVal(env, 'ideas', [])).map(publicIdea(me && me.id));
    return json(list);
  }
  if (path === '/api/ideas' && method === 'POST') {
    const user = await auth(env, request);
    const b = await readJson(request);
    const title = clampStr(b.title, 90).trim(), text = clampStr(b.text, 300).trim();
    const cat = ['asset', 'system', 'ui', 'site', 'other'].includes(b.cat) ? b.cat : 'other';
    if (title.length < 4) throw new HttpError(400, 'Ton idée est trop courte.');
    if (/https?:\/\/|www\./i.test(title + ' ' + text)) throw new HttpError(400, 'Les liens ne sont pas autorisés.');
    let idea = null;
    await updateVal(env, 'ideas', [], (ideas) => {
      if (!user.isAdmin && ideas.filter((i) => i.authorId === user.id && i.status === 'open').length >= 3) throw new HttpError(429, 'Tu as déjà 3 idées ouvertes. Attends qu\'elles avancent.');
      idea = { id: newId(), title, text, cat, authorId: user.id, author: user.name, avatar: user.avatar || '', status: 'open', voters: [user.id], timestamp: Date.now() };
      return [idea, ...ideas].slice(0, 300);
    });
    ctx.waitUntil(notifyAdmin(env, `💡 Nouvelle idée de **${user.name}** : ${title}${text ? `\n> ${text}` : ''}`));
    return json({ ok: true, idea: publicIdea(user.id)(idea) });
  }
  if ((m = /^\/api\/ideas\/([^/]+)\/vote$/.exec(path)) && method === 'POST') {
    const user = await auth(env, request);
    let out = null;
    await updateVal(env, 'ideas', [], (ideas) => {
      const i = ideas.find((x) => x.id === decodeURIComponent(m[1])); if (!i) return ideas;
      const set = new Set(i.voters || []); set.has(user.id) ? set.delete(user.id) : set.add(user.id); i.voters = [...set];
      out = { voted: set.has(user.id), votes: set.size }; return ideas;
    });
    if (!out) throw new HttpError(404, 'Idée introuvable.');
    return json({ ok: true, ...out });
  }
  if ((m = /^\/api\/ideas\/([^/]+)$/.exec(path)) && method === 'PATCH') {
    const user = await auth(env, request); adminOnly(user);
    const { status } = await readJson(request);
    if (!IDEA_STATUSES.includes(status)) throw new HttpError(400, 'Statut inconnu.');
    await updateVal(env, 'ideas', [], (ideas) => { const i = ideas.find((x) => x.id === decodeURIComponent(m[1])); if (i) i.status = status; return ideas; });
    return json({ ok: true });
  }
  if ((m = /^\/api\/ideas\/([^/]+)$/.exec(path)) && method === 'DELETE') {
    const user = await auth(env, request);
    let found = false;
    await updateVal(env, 'ideas', [], (ideas) => ideas.filter((i) => {
      if (i.id !== decodeURIComponent(m[1])) return true;
      if (i.authorId !== user.id && !user.isAdmin) throw new HttpError(403, 'Accès refusé.');
      found = true; return false;
    }));
    if (!found) throw new HttpError(404, 'Idée introuvable.');
    return json({ ok: true });
  }

  /* --- Réactions (🔥 😍 🤯) sur les projets et les assets, sans compte --- */
  const REACTIONS = ['fire', 'love', 'wow'];
  const countsOf = (r) => Object.fromEntries(REACTIONS.map((k) => [k, ((r || {})[k] || []).length]));
  if (path === '/api/reactions' && method === 'GET') {
    const cid = url.searchParams.get('cid'); const me = cid ? await anonId(cid).catch(() => null) : null;
    const all = await getVal(env, 'reactions', {});
    return new Response(JSON.stringify(Object.fromEntries(Object.entries(all).map(([t, r]) => [t, { ...countsOf(r), mine: me ? REACTIONS.filter((k) => (r[k] || []).includes(me)) : [] }]))), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }
  if (path === '/api/reactions' && method === 'POST') {
    const b = await readJson(request);
    const target = String(b.target || ''), kind = String(b.kind || '');
    if (!/^[a-z0-9-]{2,60}$/.test(target) || !REACTIONS.includes(kind)) throw new HttpError(400, 'Réaction invalide.');
    const me = await anonId(b.cid);
    let out = null;
    await updateVal(env, 'reactions', {}, (all) => {
      if (!all[target] && Object.keys(all).length >= 200) throw new HttpError(400, 'Trop de cibles.');
      const r = all[target] || (all[target] = {});
      const set = new Set(r[kind] || []); set.has(me) ? set.delete(me) : set.add(me); r[kind] = [...set].slice(-5000);
      out = { ...countsOf(r), mine: REACTIONS.filter((k) => (r[k] || []).includes(me)) };
      return all;
    });
    return json({ ok: true, ...out });
  }

  /* --- Compteur « en ce moment sur le site » : chaque onglet ouvert envoie un signe toutes les 45 s --- */
  if (path === '/api/presence' && method === 'POST') {
    const b = await readJson(request);
    const me = await anonId(b.cid), now = Date.now(), page = b.page === 'shop' ? 'shop' : 'index';
    let out = null;
    await updateVal(env, 'presence', {}, (all) => {
      for (const [k, v] of Object.entries(all)) if (now - v.t > 90e3) delete all[k];
      all[me] = { t: now, p: page };
      const vals = Object.values(all);
      out = { online: vals.length, shop: vals.filter((v) => v.p === 'shop').length };
      return all;
    });
    return json(out);
  }

  /* --- Livre d'or : un petit mot ou un emoji, sans être client --- */
  const GB_EMOJIS = ['👋', '🔥', '❤️', '🎮', '🧱', '⭐', '🚀', '😎'];
  const GB_COLORS = ['sun', 'mint', 'sky', 'rose', 'lilac', 'peach'];
  // Position sur le tableau, en % (0 à 100) : le post-it se place où on veut
  const pos = (v) => (Number.isFinite(+v) ? Math.max(0, Math.min(100, Math.round(+v * 10) / 10)) : null);
  if (path === '/api/guestbook' && method === 'GET') {
    // ?cid= (facultatif) : indique les post-its de ce navigateur, qu'il peut déplacer
    const raw = url.searchParams.get('cid'); const me = raw ? await anonId(raw).catch(() => null) : null;
    const user = await optUser();
    return json((await getVal(env, 'guestbook', [])).map(({ ip, cid, ...e }) => ({ ...e, mine: (!!me && cid === me) || (!!user && (user.isAdmin || e.discordId === user.id)) })));
  }
  if ((m = /^\/api\/guestbook\/([^/]+)$/.exec(path)) && method === 'PATCH') {
    const b = await readJson(request);
    const user = await optUser();
    const me = b.cid ? await anonId(b.cid).catch(() => null) : null;
    const x = pos(b.x), y = pos(b.y);
    if (x === null || y === null) throw new HttpError(400, 'Position invalide.');
    let found = false;
    await updateVal(env, 'guestbook', [], (list) => {
      const e = list.find((n) => n.id === decodeURIComponent(m[1])); if (!e) return list;
      const allowed = (me && e.cid === me) || (user && (user.isAdmin || e.discordId === user.id));
      if (!allowed) throw new HttpError(403, 'Tu ne peux déplacer que ton post-it.');
      e.x = x; e.y = y; found = true; return list;
    });
    if (!found) throw new HttpError(404, 'Message introuvable.');
    return json({ ok: true, x, y });
  }
  if (path === '/api/guestbook' && method === 'POST') {
    const b = await readJson(request);
    const user = await optUser();
    const me = await anonId(b.cid), ip = await ipKey();
    const emoji = GB_EMOJIS.includes(b.emoji) ? b.emoji : '👋', color = GB_COLORS.includes(b.color) ? b.color : 'sun';
    const text = clampStr(b.text, 140).replace(/\s+/g, ' ').trim();
    const name = user ? user.name : clampStr(b.name, 24).replace(/\s+/g, ' ').trim() || 'Visitor';
    if (/https?:\/\/|www\.|discord\.gg|\.(com|net|gg|io|xyz)\b/i.test(text + ' ' + name)) throw new HttpError(400, 'Les liens ne sont pas autorisés.');
    const now = Date.now();
    let entry = null;
    await updateVal(env, 'guestbook', [], (list) => {
      if (!(user && user.isAdmin) && list.some((e) => (e.ip === ip || e.cid === me) && now - e.timestamp < 5 * 60e3)) throw new HttpError(429, 'Doucement ! Un message toutes les 5 minutes.');
      entry = { id: newId(), name, text, emoji, color, verified: !!user, avatar: user ? user.avatar || '' : '', discordId: user ? user.id : undefined, x: pos(b.x) ?? undefined, y: pos(b.y) ?? undefined, ip, cid: me, timestamp: now };
      return [entry, ...list].slice(0, 150);
    });
    const { ip: _i, cid: _c, ...pub } = entry;
    return json({ ok: true, entry: { ...pub, mine: true } });
  }
  if ((m = /^\/api\/guestbook\/([^/]+)$/.exec(path)) && method === 'DELETE') {
    const user = await auth(env, request);
    let found = false;
    await updateVal(env, 'guestbook', [], (list) => list.filter((e) => {
      if (e.id !== decodeURIComponent(m[1])) return true;
      if (!user.isAdmin && e.discordId !== user.id) throw new HttpError(403, 'Accès refusé.');
      found = true; return false;
    }));
    if (!found) throw new HttpError(404, 'Message introuvable.');
    return json({ ok: true });
  }

  /* ============================== Codes promo (créés depuis l'espace admin) ============================== */
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const promoState = (pr) => (pr.from && todayStr() < pr.from ? 'scheduled' : pr.until && todayStr() > pr.until ? 'expired' : pr.maxUses && (pr.uses || 0) >= pr.maxUses ? 'used up' : 'active');
  const publicPromo = (pr) => ({ code: pr.code, pct: pr.pct, label: pr.label, from: pr.from || null, until: pr.until || null });
  // Vérifier un code tapé par un visiteur (messages en anglais : ils s'affichent tels quels sur le site)
  if (path === '/api/promos/check' && method === 'POST') {
    const b = await readJson(request);
    const code = clampStr(b.code, 40).trim().toUpperCase().replace(/\s+/g, '');
    const pr = (await getVal(env, 'promos', [])).find((x) => x.code === code);
    if (!pr) throw new HttpError(404, "This code doesn't exist");
    const st = promoState(pr);
    if (st === 'scheduled') throw new HttpError(400, "This code isn't active yet");
    if (st === 'expired') throw new HttpError(400, 'This code has expired');
    if (st === 'used up') throw new HttpError(400, 'This code has been used up');
    return json({ ok: true, ...publicPromo(pr) });
  }
  // Code mis en avant dans la barre du haut du site
  if (path === '/api/promos/banner' && method === 'GET') {
    const pr = (await getVal(env, 'promos', [])).find((x) => x.banner && promoState(x) === 'active');
    return json(pr ? publicPromo(pr) : null);
  }
  if (path === '/api/admin/promos' && method === 'GET') {
    const user = await auth(env, request); adminOnly(user);
    return json((await getVal(env, 'promos', [])).map((pr) => ({ ...pr, state: promoState(pr) })));
  }
  if (path === '/api/admin/promos' && method === 'POST') {
    const user = await auth(env, request); adminOnly(user);
    const b = await readJson(request);
    const code = clampStr(b.code, 24).trim().toUpperCase().replace(/\s+/g, '');
    if (!/^[A-Z0-9_-]{3,24}$/.test(code)) throw new HttpError(400, 'Code invalide : 3 à 24 lettres, chiffres, - ou _.');
    const pct = Math.round(+b.pct);
    if (!(pct >= 1 && pct <= 90)) throw new HttpError(400, 'Remise entre 1 et 90 %.');
    const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
    const from = date(b.from), until = date(b.until);
    if (from && until && until < from) throw new HttpError(400, 'La date de fin est avant la date de début.');
    const maxUses = b.maxUses ? Math.max(1, Math.min(100000, Math.round(+b.maxUses) || 0)) : null;
    const label = clampStr(b.label, 80).trim() || `${pct}% off`;
    let saved = null;
    await updateVal(env, 'promos', [], (list) => {
      const old = list.find((x) => x.code === code);
      if (old && !b.update) throw new HttpError(409, 'Ce code existe déjà.');
      if (b.banner) list.forEach((x) => { x.banner = false; });
      saved = { code, pct, label, from, until, maxUses, uses: old ? old.uses || 0 : 0, banner: !!b.banner, createdAt: old ? old.createdAt : Date.now() };
      return old ? list.map((x) => (x.code === code ? saved : x)) : [saved, ...list].slice(0, 200);
    });
    return json({ ok: true, promo: { ...saved, state: promoState(saved) } });
  }
  if ((m = /^\/api\/admin\/promos\/([^/]+)$/.exec(path)) && method === 'DELETE') {
    const user = await auth(env, request); adminOnly(user);
    const code = decodeURIComponent(m[1]).toUpperCase();
    let found = false;
    await updateVal(env, 'promos', [], (list) => list.filter((x) => { if (x.code === code) { found = true; return false; } return true; }));
    if (!found) throw new HttpError(404, 'Code introuvable.');
    return json({ ok: true });
  }

  /* ============================== Catalogue du shop (géré depuis l'espace admin) ==============================
     Chaque entrée est soit un nouvel asset, soit une modification d'un asset écrit dans promo.js (même id). */
  const CATS = ['models', 'scripts', 'ui', 'gfx', 'templates', 'audio', 'discord'];
  const imgUrl = (v) => { const u = String(v || '').trim(); return /^(https:\/\/|img\/|assets\/)[^\s"'<>]{1,400}$/.test(u) ? u : ''; };
  if (path === '/api/products' && method === 'GET') {
    return new Response(JSON.stringify(await getVal(env, 'products', [])), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' } });
  }
  // Image envoyée depuis l'espace admin (couverture, galerie)
  if (path === '/api/admin/images' && method === 'POST') {
    const user = await auth(env, request); adminOnly(user);
    const b = await readJson(request);
    const mm = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.image || ''));
    if (!mm) throw new HttpError(400, 'Image invalide (JPEG, PNG ou WebP).');
    const bytes = fromB64(mm[2]);
    if (bytes.length > SHOT_MAX_BYTES) throw new HttpError(413, 'Image trop lourde (2 Mo max).');
    if (!env.FILES) throw new HttpError(500, 'Stockage KV non lié (variable FILES).');
    const id = newId();
    await env.FILES.put(shotKey(id), bytes, { metadata: { type: mm[1] } });
    return json({ ok: true, id, url: `${url.origin}/api/shots/${id}` });
  }
  if (path === '/api/admin/products' && method === 'POST') {
    const user = await auth(env, request); adminOnly(user);
    const b = await readJson(request);
    const slug = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    const id = slug(b.id) || slug(b.name);
    if (!id || id.length < 2) throw new HttpError(400, 'Nom manquant.');
    const name = clampStr(b.name, 80).trim();
    if (!name) throw new HttpError(400, 'Nom manquant.');
    if (!CATS.includes(b.cat)) throw new HttpError(400, 'Catégorie inconnue.');
    const eur = Math.round((+b.eur || 0) * 100) / 100, rbx = Math.round(+b.rbx || 0);
    if (!(eur > 0 && eur <= 10000)) throw new HttpError(400, 'Prix en euros invalide.');
    const gallery = (Array.isArray(b.gallery) ? b.gallery : []).slice(0, 30).map((g) => [imgUrl(g && g[0]), clampStr(g && g[1], 80).trim()]).filter((g) => g[0]);
    const cover = imgUrl(b.cover) || (gallery[0] && gallery[0][0]) || '';
    if (!cover) throw new HttpError(400, 'Ajoute au moins une image.');
    const product = {
      id, name, cat: b.cat, eur, rbx: rbx > 0 ? rbx : Math.round(eur * 80),
      badge: clampStr(b.badge, 20).trim() || 'New',
      desc: clampStr(b.desc, 400).trim(),
      tags: (Array.isArray(b.tags) ? b.tags : String(b.tags || '').split(',')).map((t) => clampStr(t, 24).trim()).filter(Boolean).slice(0, 6),
      cover, gallery: gallery.length ? gallery : [[cover, name]],
      hidden: !!b.hidden, builtin: !!b.builtin,
      rank: Number.isFinite(+b.rank) ? +b.rank : 50,
      updatedAt: Date.now()
    };
    await updateVal(env, 'products', [], (list) => {
      const old = list.find((x) => x.id === id);
      if (old && b.isNew) throw new HttpError(409, 'Un asset avec ce nom existe déjà.');
      product.added = old ? old.added : Date.now();
      return old ? list.map((x) => (x.id === id ? product : x)) : [...list, product].slice(0, 200);
    });
    return json({ ok: true, product });
  }
  // Supprimer : un nouvel asset disparaît ; un asset de promo.js revient à sa version d'origine
  if ((m = /^\/api\/admin\/products\/([^/]+)$/.exec(path)) && method === 'DELETE') {
    const user = await auth(env, request); adminOnly(user);
    const id = decodeURIComponent(m[1]);
    let removed = null;
    await updateVal(env, 'products', [], (list) => list.filter((x) => { if (x.id === id) { removed = x; return false; } return true; }));
    if (!removed) throw new HttpError(404, 'Asset introuvable.');
    // Images envoyées pour cet asset (hébergées ici) : on les efface aussi
    const mine = [removed.cover, ...(removed.gallery || []).map((g) => g[0])].map((u) => (/\/api\/shots\/([a-z0-9]+)$/.exec(u || '') || [])[1]).filter(Boolean);
    if (env.FILES) for (const k of new Set(mine)) await env.FILES.delete(shotKey(k)).catch(() => {});
    return json({ ok: true });
  }

  /* ============================== Contenu de l'accueil (tarifs, projets, photos) ==============================
     Modifié depuis l'espace admin ; une section absente = les valeurs par défaut du site (content.js). */
  const PLAN_CATS = ['roblox', 'script', 'build', 'web', 'uiux', 'gfx', 'discord', '3d'];
  const anyImg = (v) => { const u = String(v || '').trim(); return /^(https:\/\/|img\/|assets\/)[^\s"'<>]{1,400}$/.test(u) || /^[\w.-]{1,80}\.(webp|png|jpe?g|gif)$/i.test(u) ? u : ''; };
  const cleanContent = {
    plans: (v) => {
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'Tarifs invalides.');
      const out = {};
      for (const c of PLAN_CATS) {
        out[c] = (Array.isArray(v[c]) ? v[c] : []).slice(0, 12).map((r) => {
          const price = Math.round((+(r && r[2]) || 0) * 100) / 100;
          const name = clampStr(r && r[0], 60).trim();
          if (!name || !(price > 0 && price <= 100000)) throw new HttpError(400, `Service invalide dans « ${c} » : nom et prix (> 0) obligatoires.`);
          return [name, clampStr(r[1], 240).trim(), price, clampStr(r[3], 60).trim(), (Array.isArray(r[4]) ? r[4] : []).map((f) => clampStr(f, 60).trim()).filter(Boolean).slice(0, 6)];
        });
      }
      return out;
    },
    projects: (v) => (Array.isArray(v) ? v : []).slice(0, 30).map((pr) => {
      const t = clampStr(pr && pr.t, 80).trim(), img = anyImg(pr && pr.img);
      if (!t || !img) throw new HttpError(400, 'Chaque projet a besoin d\'un titre et d\'une image.');
      const uid = String((pr && pr.universeId) || '').trim();
      return { id: clampStr(pr.id, 60).toLowerCase().replace(/[^a-z0-9-]/g, '') || t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), t, img,
        short: clampStr(pr.short, 160).trim(), d: clampStr(pr.d, 600).trim(), status: clampStr(pr.status, 30).trim() || 'Completed',
        tech: (Array.isArray(pr.tech) ? pr.tech : []).map((x) => clampStr(x, 30).trim()).filter(Boolean).slice(0, 8), universeId: /^\d{1,15}$/.test(uid) ? +uid : null };
    }),
    packs: (v) => (Array.isArray(v) ? v : []).slice(0, 20).map((pk) => {
      const name = clampStr(pk && pk.name, 80).trim();
      const imgs = (Array.isArray(pk && pk.imgs) ? pk.imgs : []).slice(0, 60).map((g) => [anyImg(g && g[0]), clampStr(g && g[1], 80).trim(), g && g[2] === 'sq' ? 'sq' : undefined].filter((x) => x !== undefined)).filter((g) => g[0]);
      if (!name || !imgs.length) throw new HttpError(400, 'Chaque pack de photos a besoin d\'un nom et d\'au moins une image.');
      return { name, desc: clampStr(pk.desc, 200).trim(), id: clampStr(pk.id, 60).trim() || '', imgs };
    })
  };
  if (path === '/api/content' && method === 'GET') {
    return new Response(JSON.stringify(await getVal(env, 'content', {})), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' } });
  }
  if (path === '/api/admin/content' && method === 'POST') {
    const user = await auth(env, request); adminOnly(user);
    const b = await readJson(request);
    if (!cleanContent[b.section]) throw new HttpError(400, 'Section inconnue.');
    const value = cleanContent[b.section](b.value);
    await updateVal(env, 'content', {}, (c) => { c[b.section] = value; return c; });
    return json({ ok: true, section: b.section, value });
  }
  // Revenir aux valeurs par défaut d'une section
  if ((m = /^\/api\/admin\/content\/([a-z]+)$/.exec(path)) && method === 'DELETE') {
    const user = await auth(env, request); adminOnly(user);
    if (!cleanContent[m[1]]) throw new HttpError(400, 'Section inconnue.');
    await updateVal(env, 'content', {}, (c) => { delete c[m[1]]; return c; });
    return json({ ok: true });
  }

  return json({ error: 'Route inconnue.' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin');
    const allowed = String(env.ALLOWED_ORIGINS || new URL(frontUrl(env)).origin).split(',').map((s) => s.trim());
    const cors = origin && allowed.includes(origin) ? {
      'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Max-Age': '86400'
    } : {};
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    let res;
    try {
      if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new HttpError(500, 'SESSION_SECRET manquant ou trop court dans les secrets du worker.');
      res = await route(request, env, ctx);
    } catch (e) {
      if (!(e instanceof HttpError)) console.error(e && e.stack || e);
      res = json({ error: e instanceof HttpError ? e.message : 'Erreur interne du serveur.' }, e.status || 500);
    }
    if (res.status >= 300 && res.status < 400) return res; // redirections : en-têtes non modifiables
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  }
};
