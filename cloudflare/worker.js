/*
 * Serveur du shop Exiozz — version Cloudflare Workers (gratuit).
 *
 *  - Connexion Discord (OAuth2) avec un jeton de session signé
 *  - Commandes (tout passe par Exiozz) + panneau admin
 *  - Fichiers envoyés par l'admin sous une commande, supprimés au bout de 24 h
 *  - Bibliothèque des assets : les fichiers de chaque asset, rangés une fois,
 *    envoyés au client en un clic depuis une commande
 *  - Avis clients
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
  const payload = b64url(enc.encode(JSON.stringify({ id: user.id, name: user.name, avatar: user.avatar, exp: Date.now() + SESSION_DAYS * 864e5 })));
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
    const user = { id: u.id, name: u.global_name || u.username, avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : '' };
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
      id: newId(), customerName: user.name, discordId: user.id, items,
      total: items.reduce((s, it) => s + it.price, 0),
      currency: clampStr(b.currency || '€', 5), source: clampStr(b.source || 'site', 20),
      status: 'En attente de contact', timestamp: Date.now(), files: []
    };
    await updateVal(env, 'orders', [], (orders) => { orders.unshift(order); return orders; });
    ctx.waitUntil(notifyAdmin(env, `🛒 Nouvelle commande de **${order.customerName}** (<@${order.discordId}>) — ${order.total} ${order.currency}\n` + items.map((it) => `• ${it.title} — ${it.price}`).join('\n')));
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
    return json((await getVal(env, 'orders', [])).map(publicOrder));
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
    return json(await getVal(env, 'reviews', []));
  }
  if (path === '/api/reviews' && method === 'POST') {
    const user = await auth(env, request);
    const b = await readJson(request);
    const rating = Math.round(+b.rating);
    const text = clampStr(b.text, 1000).trim();
    if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, 'Note invalide.');
    if (!text) throw new HttpError(400, 'Avis vide.');
    await ensureImported(env);
    const review = { discordId: user.id, name: user.name, avatar: user.avatar || '', rating, text, timestamp: Date.now() };
    await updateVal(env, 'reviews', [], (reviews) => [review, ...reviews.filter((r) => r.discordId !== user.id)]);
    return json({ ok: true });
  }
  if ((m = /^\/api\/reviews\/([^/]+)$/.exec(path)) && method === 'DELETE') {
    const user = await auth(env, request);
    const discordId = decodeURIComponent(m[1]);
    if (discordId !== user.id && !user.isAdmin) throw new HttpError(403, 'Accès refusé.');
    await updateVal(env, 'reviews', [], (reviews) => reviews.filter((r) => r.discordId !== discordId));
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
