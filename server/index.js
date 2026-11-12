'use strict';
/*
 * Serveur du shop Exiozz.
 *  - Connexion Discord (OAuth2) avec un jeton de session signé
 *  - Commandes (tout passe par Exiozz) + panneau admin
 *  - Fichiers livrés par l'admin sous une commande, supprimés au bout de 24 h
 *  - Abonnements : activés quand l'admin passe la commande en « Payée », rappels avant la fin
 *  - Avis clients
 *  - Récupération automatique des avis et commandes de l'ancien serveur au premier démarrage
 *
 * Configuration par variables d'environnement (Secrets Replit) : voir server/README.md.
 */
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pipeline } = require('stream/promises');
const store = require('./store');
const files = require('./files');

const env = process.env;
const PORT = env.PORT || 3000;
const FRONT_URL = (env.FRONT_URL || 'https://exiozz.github.io/portfolio').replace(/\/+$/, '');
const ALLOWED_ORIGINS = (env.ALLOWED_ORIGINS || new URL(FRONT_URL).origin).split(',').map((s) => s.trim()).filter(Boolean);
const ADMIN_ID = env.ADMIN_DISCORD_ID || '';
const OLD_API_URL = (env.OLD_API_URL || 'https://exiozz-discord-auth--tomokari35.replit.app').replace(/\/+$/, '');
const SESSION_DAYS = 30;
const SUB_DAYS = 30;               // durée d'un abonnement payé
const FILE_HOURS = 24;             // durée de vie d'un fichier livré
const MAX_FILE_MB = +(env.MAX_FILE_MB || 500);
const REMIND_DAYS = 3;             // rappel avant la fin de l'abonnement

if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
  console.error('❌ SESSION_SECRET manquant ou trop court (32 caractères minimum). Ajoute-le dans les Secrets.');
  process.exit(1);
}

/* ---------------------------------------------------------------- utilitaires */
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const hmac = (data) => crypto.createHmac('sha256', env.SESSION_SECRET).update(data).digest();
function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
const newId = () => Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
const clampStr = (s, max) => String(s == null ? '' : s).slice(0, max);
const isHttps = (u) => /^https:\/\//i.test(u || '');
const frDate = (ms) => new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });

function signToken(user) {
  const payload = b64url(JSON.stringify({ id: user.id, name: user.name, avatar: user.avatar, exp: Date.now() + SESSION_DAYS * 864e5 }));
  return payload + '.' + b64url(hmac(payload));
}
function verifyToken(token) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig || !safeEqual(sig, b64url(hmac(payload)))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.exp > Date.now() ? data : null;
  } catch (e) { return null; }
}

/* ------------------------------------------------------------- abonnements */
// ent:<discordId> = { subUntil: date de fin (ms), remindedFor: subUntil déjà rappelé, endedFor: subUntil déjà signalé }
const entKey = (id) => 'ent:' + id;
const getEnt = async (id) => ({ subUntil: 0, ...(await store.get(entKey(id), {})) });
const subInfo = (ent) => (ent.subUntil ? { active: ent.subUntil > Date.now(), until: new Date(ent.subUntil).toISOString() } : null);
async function extendSub(discordId, days) {
  await store.update('subscribers', [], (ids) => (ids.includes(discordId) ? ids : ids.concat(discordId)));
  return store.update(entKey(discordId), {}, (e) => {
    const cur = e.subUntil || 0;
    e.subUntil = days > 0 ? Math.max(Date.now(), cur) + days * 864e5 : Math.max(0, cur + days * 864e5);
    return e;
  });
}

/* ------------------------------------------------------------------ Discord */
async function discordDM(discordId, content) {
  if (!env.DISCORD_BOT_TOKEN || !/^\d+$/.test(discordId)) return false;
  try {
    const headers = { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' };
    const ch = await fetch('https://discord.com/api/v10/users/@me/channels', { method: 'POST', headers, body: JSON.stringify({ recipient_id: discordId }) });
    if (!ch.ok) throw new Error('ouverture du MP ' + ch.status);
    const { id } = await ch.json();
    const msg = await fetch(`https://discord.com/api/v10/channels/${id}/messages`, { method: 'POST', headers, body: JSON.stringify({ content }) });
    if (!msg.ok) throw new Error('envoi ' + msg.status);
    return true;
  } catch (e) { console.warn(`MP Discord à ${discordId} impossible :`, e.message); return false; }
}
async function notifyAdmin(content) {
  if (!isHttps(env.DISCORD_ORDERS_WEBHOOK_URL)) return;
  try {
    await fetch(env.DISCORD_ORDERS_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: content.slice(0, 1900), allowed_mentions: { parse: [] } }) });
  } catch (e) { console.warn('Webhook admin :', e.message); }
}

/* ---------------------------------------------------------------- commandes */
const ORDER_STATUSES = ['En attente de contact', 'Confirmée', 'En construction', 'En pause', 'Payée', 'Annulée'];
const isSubItem = (it) => it && (it.offer === 'subscription' || it.type === 'subscription');
const liveFiles = (order) => (order.files || []).filter((f) => f.expiresAt > Date.now());
const publicOrder = (o) => ({ ...o, files: liveFiles(o).map((f) => ({ id: f.id, name: f.name, size: f.size, expiresAt: f.expiresAt })) });
async function findOrder(id) { return (await store.get('orders', [])).find((o) => o.id === id) || null; }

/* ---------------------------------------------------------------------- app */
const app = express();
app.set('trust proxy', 1);
app.use((req, res, next) => {
  const origin = req.get('Origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '100kb' }));

function auth(req, res, next) {
  const m = /^Bearer (.+)$/.exec(req.get('Authorization') || '');
  const user = m && verifyToken(m[1]);
  if (!user) return res.status(401).json({ error: 'Session expirée : reconnecte-toi avec Discord.' });
  req.user = user;
  req.isAdmin = !!ADMIN_ID && user.id === ADMIN_ID;
  next();
}
const adminOnly = (req, res, next) => (req.isAdmin ? next() : res.status(403).json({ error: 'Réservé à l\'admin.' }));
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  if (!e.status) console.error(e);
  if (!res.headersSent) res.status(e.status || 500).json({ error: e.status ? e.message : 'Erreur interne du serveur.' });
});

app.get('/', (req, res) => res.json({ ok: true, service: 'exiozz-server', storage: store.backend, files: files.backend }));
app.get('/api/health', (req, res) => res.json({ ok: true }));

/* --- Connexion Discord ---------------------------------------------------- */
const LOGIN_PAGES = { shop: 'shop.html', index: 'index.html' };
app.get('/auth/discord', wrap(async (req, res) => {
  const page = LOGIN_PAGES[req.query.state] || 'index.html';
  const back = (hash) => res.redirect(`${FRONT_URL}/${page}${hash}`);
  if (!req.query.code) return back('#login_error=1');

  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code', code: String(req.query.code), redirect_uri: env.DISCORD_REDIRECT_URI
    })
  });
  if (!tokenRes.ok) { console.error('OAuth Discord', tokenRes.status, await tokenRes.text()); return back('#login_error=1'); }
  const { access_token } = await tokenRes.json();
  const meRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${access_token}` } });
  if (!meRes.ok) return back('#login_error=1');
  const u = await meRes.json();
  const user = {
    id: u.id,
    name: u.global_name || u.username,
    avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : ''
  };
  // Le jeton passe dans le # de l'URL : il n'est jamais envoyé à un serveur.
  const p = new URLSearchParams({ token: signToken(user), discord_id: user.id, discord_user: user.name, discord_avatar: user.avatar });
  back('#' + p.toString());
}));

app.get('/api/me', auth, wrap(async (req, res) => {
  res.json({
    user: { id: req.user.id, name: req.user.name, avatar: req.user.avatar },
    isAdmin: req.isAdmin,
    subscription: subInfo(await getEnt(req.user.id))
  });
}));

/* --- Commandes ------------------------------------------------------------- */
app.post('/api/order', auth, wrap(async (req, res) => {
  const b = req.body || {};
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 30).map((it) => ({
    title: clampStr(it.title, 200),
    price: Math.max(0, +it.price || 0),
    productId: it.productId ? clampStr(it.productId, 100) : undefined,
    offer: ['single', 'pass', 'subscription'].includes(it.offer) ? it.offer : undefined,
    type: clampStr(it.type || 'asset', 30)
  }));
  if (!items.length) return res.status(400).json({ error: 'Panier vide.' });
  const order = {
    id: newId(),
    customerName: req.user.name,
    discordId: req.user.id,
    items,
    total: items.reduce((s, it) => s + it.price, 0),
    currency: clampStr(b.currency || '€', 5),
    source: clampStr(b.source || 'site', 20),
    status: 'En attente de contact',
    timestamp: Date.now(),
    files: []
  };
  await store.update('orders', [], (orders) => { orders.unshift(order); return orders; });
  await notifyAdmin(`🛒 Nouvelle commande de **${order.customerName}** (<@${order.discordId}>) — ${order.total} ${order.currency}\n` + items.map((it) => `• ${it.title} — ${it.price}`).join('\n'));
  res.json({ ok: true, id: order.id });
}));

app.get('/api/orders/:discordId', auth, wrap(async (req, res) => {
  if (req.params.discordId !== req.user.id && !req.isAdmin) return res.status(403).json({ error: 'Accès refusé.' });
  const orders = await store.get('orders', []);
  res.json(orders.filter((o) => o.discordId === req.params.discordId).map(publicOrder));
}));

app.get('/api/admin/orders', auth, adminOnly, wrap(async (req, res) => {
  const orders = await store.get('orders', []);
  const ids = [...new Set(orders.map((o) => o.discordId))];
  const subs = {};
  for (const id of ids) { const info = subInfo(await getEnt(id)); if (info) subs[id] = info; }
  res.json(orders.map((o) => ({ ...publicOrder(o), subscription: subs[o.discordId] || null })));
}));

app.patch('/api/orders/:id', auth, adminOnly, wrap(async (req, res) => {
  const status = req.body && req.body.status;
  if (!ORDER_STATUSES.includes(status)) return res.status(400).json({ error: 'Statut inconnu.' });
  let order = null;
  await store.update('orders', [], (orders) => {
    order = orders.find((o) => o.id === req.params.id);
    if (order) order.status = status;
    return orders;
  });
  if (!order) return res.status(404).json({ error: 'Commande introuvable.' });

  // Abonnement : « Payée » ajoute 30 jours (par abonnement commandé), « Annulée » les retire.
  const subDays = order.items.filter(isSubItem).length * SUB_DAYS;
  if (status === 'Payée' && !order.granted) {
    if (subDays) {
      const ent = await extendSub(order.discordId, subDays);
      await discordDM(order.discordId, `Ton **abonnement** est actif jusqu'au **${frDate(ent.subUntil)}** 🎉\nTu seras prévenu avant la fin. Tes fichiers t'attendent sur ${FRONT_URL}/shop.html (« Mes commandes »).`);
    }
    await store.update('orders', [], (orders) => { const o = orders.find((x) => x.id === order.id); if (o) { o.granted = true; o.subDays = subDays; } return orders; });
  } else if (status === 'Annulée' && order.granted) {
    if (order.subDays) await extendSub(order.discordId, -order.subDays);
    await store.update('orders', [], (orders) => { const o = orders.find((x) => x.id === order.id); if (o) { o.granted = false; o.subDays = 0; } return orders; });
  }
  res.json({ ok: true });
}));

app.delete('/api/orders/:id', auth, adminOnly, wrap(async (req, res) => {
  let removed = null;
  await store.update('orders', [], (orders) => {
    removed = orders.find((o) => o.id === req.params.id) || null;
    return orders.filter((o) => o.id !== req.params.id);
  });
  if (!removed) return res.status(404).json({ error: 'Commande introuvable.' });
  for (const f of removed.files || []) await files.remove(f.id).catch(() => {});
  res.json({ ok: true });
}));

/* --- Fichiers livrés (24 h) ------------------------------------------------ */
// L'admin envoie le fichier brut : POST /api/orders/:id/files?name=mon-fichier.zip
app.post('/api/orders/:id/files', auth, adminOnly, wrap(async (req, res) => {
  const order = await findOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable.' });
  const name = clampStr(String(req.query.name || 'fichier').replace(/[\\/:*?"<>|\r\n]+/g, '_').trim(), 150) || 'fichier';
  const declared = +req.get('Content-Length') || 0;
  if (declared > MAX_FILE_MB * 1048576) return res.status(413).json({ error: `Fichier trop gros (max ${MAX_FILE_MB} Mo).` });

  const id = newId();
  const tmp = path.join(os.tmpdir(), 'exiozz-upload-' + id);
  let size = 0;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_FILE_MB * 1048576) req.destroy(new Error('trop gros'));
  });
  try {
    await pipeline(req, fs.createWriteStream(tmp));
    await files.save(id, tmp);
  } catch (e) {
    fs.rm(tmp, { force: true }, () => {});
    if (size > MAX_FILE_MB * 1048576) return res.status(413).json({ error: `Fichier trop gros (max ${MAX_FILE_MB} Mo).` });
    throw e;
  }
  fs.rm(tmp, { force: true }, () => {});

  const file = { id, name, size, uploadedAt: Date.now(), expiresAt: Date.now() + FILE_HOURS * 3600e3 };
  let ok = false;
  await store.update('orders', [], (orders) => {
    const o = orders.find((x) => x.id === order.id);
    if (o) { o.files = (o.files || []).concat(file); ok = true; }
    return orders;
  });
  if (!ok) { await files.remove(id).catch(() => {}); return res.status(404).json({ error: 'Commande supprimée entre-temps.' }); }
  await store.update('fileIndex', [], (list) => list.concat({ id, orderId: order.id, expiresAt: file.expiresAt }));
  await discordDM(order.discordId, `📦 Tes fichiers sont prêts : **${name}**\nTélécharge-les sur ${FRONT_URL}/shop.html → menu Discord → « Mes commandes ».\n⏳ Ils seront supprimés dans ${FILE_HOURS} h.`);
  res.json({ ok: true, file: { id, name, size, expiresAt: file.expiresAt } });
}));

app.delete('/api/orders/:id/files/:fileId', auth, adminOnly, wrap(async (req, res) => {
  await store.update('orders', [], (orders) => {
    const o = orders.find((x) => x.id === req.params.id);
    if (o) o.files = (o.files || []).filter((f) => f.id !== req.params.fileId);
    return orders;
  });
  await files.remove(req.params.fileId).catch(() => {});
  res.json({ ok: true });
}));

// Lien de téléchargement signé, valable 10 minutes (le navigateur ne peut pas envoyer le jeton lui-même)
const fileSig = (fileId, exp) => b64url(hmac(`file:${fileId}:${exp}`));
app.get('/api/files/:fileId/link', auth, wrap(async (req, res) => {
  const orders = await store.get('orders', []);
  const order = orders.find((o) => liveFiles(o).some((f) => f.id === req.params.fileId));
  if (!order) return res.status(404).json({ error: 'Fichier introuvable ou expiré.' });
  if (order.discordId !== req.user.id && !req.isAdmin) return res.status(403).json({ error: 'Accès refusé.' });
  const exp = Date.now() + 10 * 60e3;
  const base = (env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  res.json({ url: `${base}/api/files/${encodeURIComponent(req.params.fileId)}/download?exp=${exp}&sig=${fileSig(req.params.fileId, exp)}` });
}));

app.get('/api/files/:fileId/download', wrap(async (req, res) => {
  const { fileId } = req.params, exp = +req.query.exp;
  if (!(exp > Date.now()) || !safeEqual(String(req.query.sig || ''), fileSig(fileId, exp))) return res.status(403).send('Lien expiré : relance le téléchargement depuis le shop.');
  const orders = await store.get('orders', []);
  const order = orders.find((o) => liveFiles(o).some((f) => f.id === fileId));
  if (!order) return res.status(404).send('Fichier expiré ou supprimé.');
  const file = liveFiles(order).find((f) => f.id === fileId);
  res.set('Content-Type', 'application/octet-stream');
  res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`);
  if (file.size) res.set('Content-Length', String(file.size));
  await pipeline(await files.stream(fileId), res);
}));

/* --- Avis ------------------------------------------------------------------- */
app.get('/api/reviews', wrap(async (req, res) => { res.json(await store.get('reviews', [])); }));

app.post('/api/reviews', auth, wrap(async (req, res) => {
  const rating = Math.round(+(req.body && req.body.rating));
  const text = clampStr(req.body && req.body.text, 1000).trim();
  if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Note invalide.' });
  if (!text) return res.status(400).json({ error: 'Avis vide.' });
  const review = { discordId: req.user.id, name: req.user.name, avatar: req.user.avatar || '', rating, text, timestamp: Date.now() };
  await store.update('reviews', [], (reviews) => [review, ...reviews.filter((r) => r.discordId !== req.user.id)]);
  res.json({ ok: true });
}));

app.delete('/api/reviews/:discordId', auth, wrap(async (req, res) => {
  if (req.params.discordId !== req.user.id && !req.isAdmin) return res.status(403).json({ error: 'Accès refusé.' });
  await store.update('reviews', [], (reviews) => reviews.filter((r) => r.discordId !== req.params.discordId));
  res.json({ ok: true });
}));

app.use((req, res) => res.status(404).json({ error: 'Route inconnue.' }));

/* ------------------------------------------------------------ tâches de fond */
// Supprime les fichiers de plus de 24 h
async function cleanupFiles() {
  const now = Date.now();
  const index = await store.get('fileIndex', []);
  const expired = index.filter((f) => f.expiresAt <= now);
  if (!expired.length) return;
  for (const f of expired) await files.remove(f.id).catch((e) => console.warn('Suppression fichier', f.id, e.message));
  const ids = new Set(expired.map((f) => f.id));
  await store.update('orders', [], (orders) => {
    orders.forEach((o) => { if (o.files) o.files = o.files.filter((f) => !ids.has(f.id)); });
    return orders;
  });
  await store.update('fileIndex', [], (list) => list.filter((f) => !ids.has(f.id)));
  console.log(`🧹 ${expired.length} fichier(s) expiré(s) supprimé(s)`);
}

// Prévient les abonnés : 3 jours avant la fin, puis à la fin
async function remindSubscribers() {
  const now = Date.now();
  for (const id of await store.get('subscribers', [])) {
    const ent = await getEnt(id);
    if (!ent.subUntil) continue;
    const left = ent.subUntil - now;
    if (left > 0 && left <= REMIND_DAYS * 864e5 && ent.remindedFor !== ent.subUntil) {
      await discordDM(id, `⏳ Ton **abonnement** se termine le **${frDate(ent.subUntil)}**.\nPour le prolonger, recommande-le sur ${FRONT_URL}/shop.html.`);
      await store.update(entKey(id), {}, (e) => { e.remindedFor = ent.subUntil; return e; });
      await notifyAdmin(`⏳ Abonnement de <@${id}> : fin le ${frDate(ent.subUntil)}`);
    } else if (left <= 0 && ent.endedFor !== ent.subUntil) {
      await discordDM(id, `Ton **abonnement** est terminé depuis le ${frDate(ent.subUntil)}.\nTu peux le reprendre quand tu veux sur ${FRONT_URL}/shop.html.`);
      await store.update(entKey(id), {}, (e) => { e.endedFor = ent.subUntil; return e; });
      await notifyAdmin(`⌛ Abonnement terminé : <@${id}>`);
    }
  }
}

// Premier démarrage : copie les avis et commandes de l'ancien serveur (rien n'est supprimé)
async function importFromOldServer() {
  if (await store.get('importedFromOld', false)) return;
  const getJson = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url} → ${r.status}`); return r.json(); };
  let reviews, orders = [];
  try { reviews = await getJson(`${OLD_API_URL}/api/reviews`); }
  catch (e) { console.warn('⚠ Ancien serveur injoignable, avis non importés (nouvel essai au prochain démarrage) :', e.message); return; }
  if (ADMIN_ID) orders = await getJson(`${OLD_API_URL}/api/admin/orders?requesterId=${encodeURIComponent(ADMIN_ID)}`).catch((e) => { console.warn('Commandes non importées :', e.message); return []; });
  if (!Array.isArray(reviews)) reviews = [];
  if (!Array.isArray(orders)) orders = [];
  await store.update('reviews', [], (cur) => {
    const ids = new Set(cur.map((r) => r.discordId));
    return cur.concat(reviews.filter((r) => r && r.discordId && !ids.has(r.discordId)));
  });
  await store.update('orders', [], (cur) => {
    const ids = new Set(cur.map((o) => String(o.id)));
    return cur.concat(orders.filter((o) => o && o.id != null && !ids.has(String(o.id))).map((o) => ({ ...o, id: String(o.id), granted: true, files: [] })))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  });
  await store.set('importedFromOld', { at: Date.now(), reviews: reviews.length, orders: orders.length });
  console.log(`✅ Import de l'ancien serveur : ${reviews.length} avis, ${orders.length} commandes`);
}

const safe = (fn) => () => fn().catch((e) => console.error(fn.name, e));

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Serveur Exiozz sur le port ${PORT} (données : ${store.backend}, fichiers : ${files.backend})`);
    safe(importFromOldServer)();
    safe(cleanupFiles)();
    safe(remindSubscribers)();
    setInterval(safe(cleanupFiles), 10 * 60e3);
    setInterval(safe(remindSubscribers), 60 * 60e3);
  });
}
module.exports = { app, signToken, verifyToken, cleanupFiles, remindSubscribers, importFromOldServer };
