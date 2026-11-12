'use strict';
/*
 * Serveur du shop Exiozz.
 *  - Connexion Discord (OAuth2) avec un jeton de session signé
 *  - Commandes manuelles (via Discord) + panneau admin
 *  - Avis clients
 *  - Paiements Lemon Squeezy : achat simple, pass asset, abonnement total
 *  - Téléchargements protégés + envoi du lien en MP Discord
 *
 * Toute la configuration se fait par variables d'environnement (Secrets Replit) :
 * voir server/README.md.
 */
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const store = require('./store');

const env = process.env;
const PORT = env.PORT || 3000;
const FRONT_URL = (env.FRONT_URL || 'https://exiozz.github.io/portfolio').replace(/\/+$/, '');
const ALLOWED_ORIGINS = (env.ALLOWED_ORIGINS || new URL(FRONT_URL).origin).split(',').map((s) => s.trim()).filter(Boolean);
const ADMIN_ID = env.ADMIN_DISCORD_ID || '';
const SESSION_DAYS = 30;
const LEMON_API = (env.LEMON_API_URL || 'https://api.lemonsqueezy.com/v1').replace(/\/+$/, '');

if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
  console.error('❌ SESSION_SECRET manquant ou trop court (32 caractères minimum). Ajoute-le dans les Secrets.');
  process.exit(1);
}

/* ---------------------------------------------------------------- utilitaires */
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest();
function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
const newId = () => Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
const clampStr = (s, max) => String(s == null ? '' : s).slice(0, max);
const isHttps = (u) => /^https:\/\//i.test(u || '');

function signToken(user) {
  const payload = b64url(JSON.stringify({ id: user.id, name: user.name, avatar: user.avatar, exp: Date.now() + SESSION_DAYS * 864e5 }));
  return payload + '.' + b64url(hmac(env.SESSION_SECRET, payload));
}
function verifyToken(token) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig || !safeEqual(sig, b64url(hmac(env.SESSION_SECRET, payload)))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.exp > Date.now() ? data : null;
  } catch (e) { return null; }
}

/* ------------------------------------------------------------------ catalogue */
// Le catalogue (prix, versions) est lu dans shop.html : une seule source de vérité.
// On lit la version en ligne (GitHub Pages) pour suivre les changements sans redéployer,
// avec le fichier local du dépôt en secours.
let catalogCache = { at: 0, data: null };
function parseShopData(html) {
  const m = /<script id="shop-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('Bloc shop-data introuvable dans shop.html');
  return JSON.parse(m[1]);
}
async function getCatalog() {
  if (catalogCache.data && Date.now() - catalogCache.at < 5 * 60e3) return catalogCache.data;
  let data = null;
  try {
    const res = await fetch(`${FRONT_URL}/shop.html`, { headers: { 'Cache-Control': 'no-cache' } });
    if (res.ok) data = parseShopData(await res.text());
  } catch (e) { console.warn('Catalogue en ligne indisponible :', e.message); }
  if (!data) data = parseShopData(fs.readFileSync(path.join(__dirname, '..', 'shop.html'), 'utf8'));
  catalogCache = { at: Date.now(), data };
  return data;
}
const findAsset = (cat, id) => (cat.assets || []).find((a) => a.id === id && a.enabled !== false) || null;
const passPrice = (cat, a) => (a.passPrice != null ? +a.passPrice : Math.round(a.price * (cat.passMultiplier || 1.6)));

// Liens de téléchargement privés : secret DOWNLOADS_JSON
// { "id-asset": { "1.0": "https://lien-v1.0", "1.1": "https://lien-v1.1" } }
function downloads() {
  try { return JSON.parse(env.DOWNLOADS_JSON || '{}'); } catch (e) { console.error('DOWNLOADS_JSON invalide'); return {}; }
}
function downloadUrl(assetId, version) {
  const links = downloads()[assetId] || {};
  return isHttps(links[version]) ? links[version] : null;
}

/* ------------------------------------------------------------------- droits */
const entKey = (id) => 'ent:' + id;
const emptyEnt = () => ({ purchases: [], subscription: null });
function subActive(sub) {
  if (!sub) return false;
  if (['active', 'on_trial', 'past_due'].includes(sub.status)) return true;
  return sub.status === 'cancelled' && sub.endsAt && new Date(sub.endsAt) > new Date();
}
// level : 'latest' (dernière version) | 'old' (seulement une ancienne version achetée) | null
function accessFor(ent, asset) {
  if (subActive(ent.subscription)) return { level: 'latest', via: 'subscription' };
  const mine = ent.purchases.filter((p) => p.assetId === asset.id);
  if (mine.some((p) => p.offer === 'pass')) return { level: 'latest', via: 'pass' };
  const versions = mine.filter((p) => p.offer === 'single').map((p) => p.version);
  if (versions.includes(asset.version)) return { level: 'latest', via: 'single' };
  if (versions.length) return { level: 'old', via: 'single', version: versions[versions.length - 1] };
  return null;
}
async function grantPurchase(discordId, purchase) {
  let added = false;
  await store.update(entKey(discordId), emptyEnt(), (ent) => {
    if (!ent.purchases.some((p) => p.orderId === purchase.orderId && p.assetId === purchase.assetId)) {
      ent.purchases.push({ ...purchase, at: Date.now() });
      added = true;
    }
    return ent;
  });
  return added;
}
async function revokeOrder(discordId, orderId) {
  await store.update(entKey(discordId), emptyEnt(), (ent) => {
    ent.purchases = ent.purchases.filter((p) => p.orderId !== orderId);
    return ent;
  });
}

/* ------------------------------------------------------------------ Discord */
async function discordDM(discordId, content) {
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
async function notifyAdmin(content) {
  if (!isHttps(env.DISCORD_ORDERS_WEBHOOK_URL)) return;
  try {
    await fetch(env.DISCORD_ORDERS_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: content.slice(0, 1900), allowed_mentions: { parse: [] } }) });
  } catch (e) { console.warn('Webhook admin :', e.message); }
}
async function sendPurchaseDM(discordId, asset, offer, version) {
  const url = downloadUrl(asset.id, version);
  const what = offer === 'pass' ? 'le **Pass** (mises à jour incluses)' : `la **version ${version}**`;
  await discordDM(discordId, [
    `Merci pour ton achat de **${asset.title}** — ${what} ! 🎉`,
    url ? `Ton lien de téléchargement : ${url}` : 'Ton lien de téléchargement arrive très vite.',
    `Tu peux aussi le retrouver à tout moment sur ${FRONT_URL}/shop.html (bouton « Télécharger »).`,
    offer === 'single' ? '_Achat simple : les futures mises à jour ne sont pas incluses._' : ''
  ].filter(Boolean).join('\n'));
}

/* ----------------------------------------------------------------- Lemon Squeezy */
async function lemon(pathname, opts = {}) {
  if (!env.LEMON_API_KEY) throw Object.assign(new Error('Paiement par carte pas encore configuré.'), { status: 503 });
  const res = await fetch(LEMON_API + pathname, {
    ...opts,
    headers: { Accept: 'application/vnd.api+json', 'Content-Type': 'application/vnd.api+json', Authorization: `Bearer ${env.LEMON_API_KEY}`, ...(opts.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Lemon Squeezy', res.status, JSON.stringify(data.errors || data).slice(0, 500));
    throw Object.assign(new Error('Le service de paiement a refusé la demande.'), { status: 502 });
  }
  return data;
}

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

// Le webhook a besoin du corps brut pour vérifier la signature : déclaré AVANT express.json().
app.post('/api/webhooks/lemonsqueezy', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const secret = env.LEMON_WEBHOOK_SECRET;
  const expected = secret ? crypto.createHmac('sha256', secret).update(req.body).digest('hex') : '';
  if (!secret || !safeEqual(req.get('X-Signature') || '', expected)) return res.status(401).json({ error: 'Signature invalide.' });

  let evt;
  try { evt = JSON.parse(req.body.toString('utf8')); } catch (e) { return res.status(400).json({ error: 'JSON invalide.' }); }
  const name = evt.meta && evt.meta.event_name;
  const custom = (evt.meta && evt.meta.custom_data) || {};
  const data = evt.data || {}, attrs = data.attributes || {};

  try {
    if (name === 'order_created' && attrs.status === 'paid' && (custom.offer === 'single' || custom.offer === 'pass')) {
      const discordId = String(custom.discord_id || '');
      const cat = await getCatalog();
      const asset = findAsset(cat, custom.asset_id) || { id: custom.asset_id, title: custom.asset_id, version: custom.version };
      const added = await grantPurchase(discordId, { assetId: asset.id, offer: custom.offer, version: custom.version || asset.version, orderId: 'ls_' + data.id });
      if (added) {
        await sendPurchaseDM(discordId, asset, custom.offer, custom.version || asset.version);
        await notifyAdmin(`💳 Vente carte : **${asset.title}** (${custom.offer === 'pass' ? 'Pass' : 'achat simple v' + custom.version}) — ${attrs.total_formatted || ''} — <@${discordId}>`);
      }
    } else if (name === 'order_refunded') {
      const discordId = String(custom.discord_id || '');
      if (discordId) await revokeOrder(discordId, 'ls_' + data.id);
    } else if (name && name.startsWith('subscription_') && !name.startsWith('subscription_payment')) {
      const subId = String(data.id);
      const discordId = String(custom.discord_id || (await store.get('subidx:' + subId, '')) || '');
      if (!discordId) { console.warn('Abonnement sans discord_id :', subId); return res.json({ ok: true }); }
      await store.set('subidx:' + subId, discordId);
      const wasActive = subActive((await store.get(entKey(discordId), emptyEnt())).subscription);
      const ent = await store.update(entKey(discordId), emptyEnt(), (e) => {
        e.subscription = { id: subId, status: attrs.status, endsAt: attrs.ends_at || null, renewsAt: attrs.renews_at || null, updatedAt: Date.now() };
        return e;
      });
      const nowActive = subActive(ent.subscription);
      if (!wasActive && nowActive) {
        await discordDM(discordId, `Bienvenue dans l'**abonnement total** ! 🎉\nTous les assets et leurs mises à jour sont maintenant en téléchargement gratuit sur ${FRONT_URL}/shop.html.\nTu peux te désabonner à tout moment depuis le shop (menu Discord → « Gérer mon abonnement »).`);
        await notifyAdmin(`⭐ Nouvel abonné : <@${discordId}>`);
      } else if (wasActive && !nowActive) {
        await notifyAdmin(`Fin d'abonnement : <@${discordId}> (${attrs.status})`);
      }
    }
  } catch (e) {
    console.error('Webhook', name, e);
    return res.status(500).json({ error: 'Erreur interne.' }); // Lemon Squeezy réessaiera
  }
  res.json({ ok: true });
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
  res.status(e.status || 500).json({ error: e.status ? e.message : 'Erreur interne du serveur.' });
});

app.get('/', (req, res) => res.json({ ok: true, service: 'exiozz-server', storage: store.backend }));
app.get('/api/health', (req, res) => res.json({ ok: true }));

/* --- Connexion Discord ---------------------------------------------------- */
const LOGIN_PAGES = { shop: 'shop.html', index: 'index.html' };
app.get('/auth/discord', wrap(async (req, res) => {
  const page = LOGIN_PAGES[req.query.state] || 'shop.html';
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

/* --- Mon compte : droits ------------------------------------------------- */
app.get('/api/me', auth, wrap(async (req, res) => {
  const ent = await store.get(entKey(req.user.id), emptyEnt());
  const sub = ent.subscription;
  res.json({
    user: { id: req.user.id, name: req.user.name, avatar: req.user.avatar },
    isAdmin: req.isAdmin,
    subscription: sub ? { active: subActive(sub), status: sub.status, endsAt: sub.endsAt, renewsAt: sub.renewsAt } : null,
    purchases: ent.purchases.map((p) => ({ assetId: p.assetId, offer: p.offer, version: p.version, at: p.at }))
  });
}));

/* --- Paiement par carte ---------------------------------------------------- */
app.post('/api/checkout', auth, wrap(async (req, res) => {
  const offer = req.body && req.body.offer;
  const cat = await getCatalog();
  const ent = await store.get(entKey(req.user.id), emptyEnt());
  const custom = { discord_id: req.user.id, offer: String(offer) };
  let variantId, customPrice, name, description;

  if (offer === 'subscription') {
    if (subActive(ent.subscription)) return res.status(409).json({ error: 'Tu es déjà abonné.' });
    variantId = env.LEMON_VARIANT_SUBSCRIPTION;
    name = (cat.subscription && cat.subscription.label) || 'Abonnement total';
    description = 'Accès à tous les assets du shop et à toutes leurs mises à jour, tant que l\'abonnement est actif. Résiliable à tout moment.';
  } else if (offer === 'single' || offer === 'pass') {
    const asset = findAsset(cat, req.body.assetId);
    if (!asset) return res.status(404).json({ error: 'Asset introuvable.' });
    const access = accessFor(ent, asset);
    if (access && access.level === 'latest') return res.status(409).json({ error: 'Tu as déjà accès à la dernière version de cet asset.' });
    if (!downloadUrl(asset.id, asset.version)) return res.status(503).json({ error: 'Cet asset n\'est pas encore disponible au paiement par carte. Commande-le via Discord.' });
    const price = offer === 'pass' ? passPrice(cat, asset) : +asset.price;
    if (!(price > 0)) return res.status(400).json({ error: 'Prix invalide.' });
    variantId = env.LEMON_VARIANT_ASSET;
    customPrice = Math.round(price * 100);
    custom.asset_id = asset.id;
    custom.version = String(asset.version || '');
    name = offer === 'pass' ? `${asset.title} — Pass mises à jour` : `${asset.title} — v${asset.version}`;
    description = offer === 'pass'
      ? 'Cet asset + toutes ses futures mises à jour, à vie.'
      : `Achat simple : version ${asset.version} uniquement. Les futures mises à jour ne sont pas incluses.`;
  } else {
    return res.status(400).json({ error: 'Offre inconnue.' });
  }
  if (!variantId || !env.LEMON_STORE_ID) return res.status(503).json({ error: 'Paiement par carte pas encore configuré.' });

  const body = {
    data: {
      type: 'checkouts',
      attributes: {
        ...(customPrice ? { custom_price: customPrice } : {}),
        product_options: {
          name, description,
          redirect_url: `${FRONT_URL}/shop.html#paid=1`,
          receipt_button_text: 'Retour au shop',
          receipt_link_url: `${FRONT_URL}/shop.html`
        },
        checkout_data: { custom },
        expires_at: new Date(Date.now() + 2 * 3600e3).toISOString()
      },
      relationships: {
        store: { data: { type: 'stores', id: String(env.LEMON_STORE_ID) } },
        variant: { data: { type: 'variants', id: String(variantId) } }
      }
    }
  };
  const out = await lemon('/checkouts', { method: 'POST', body: JSON.stringify(body) });
  res.json({ url: out.data.attributes.url });
}));

app.get('/api/subscription/portal', auth, wrap(async (req, res) => {
  const ent = await store.get(entKey(req.user.id), emptyEnt());
  if (!ent.subscription) return res.status(404).json({ error: 'Aucun abonnement trouvé.' });
  const out = await lemon(`/subscriptions/${encodeURIComponent(ent.subscription.id)}`);
  const url = out.data && out.data.attributes && out.data.attributes.urls && out.data.attributes.urls.customer_portal;
  if (!isHttps(url)) return res.status(502).json({ error: 'Page de gestion indisponible.' });
  res.json({ url });
}));

/* --- Téléchargement -------------------------------------------------------- */
app.get('/api/download/:assetId', auth, wrap(async (req, res) => {
  const cat = await getCatalog();
  const asset = findAsset(cat, req.params.assetId);
  if (!asset) return res.status(404).json({ error: 'Asset introuvable.' });
  const access = accessFor(await store.get(entKey(req.user.id), emptyEnt()), asset);
  if (!access) return res.status(403).json({ error: 'Tu n\'as pas encore accès à cet asset.' });
  const version = access.level === 'latest' ? asset.version : access.version;
  const url = downloadUrl(asset.id, version);
  if (!url) return res.status(404).json({ error: 'Lien pas encore disponible : contacte Exiozz sur Discord.' });
  res.json({ url, version, outdated: access.level === 'old' });
}));

/* --- Commandes manuelles (via Discord) ------------------------------------- */
const ORDER_STATUSES = ['En attente de contact', 'Confirmée', 'En construction', 'En pause', 'Payée', 'Annulée'];

app.post('/api/order', auth, wrap(async (req, res) => {
  const b = req.body || {};
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 30).map((it) => ({
    title: clampStr(it.title, 200),
    price: Math.max(0, +it.price || 0),
    productId: it.productId ? clampStr(it.productId, 100) : undefined,
    offer: ['single', 'pass'].includes(it.offer) ? it.offer : undefined,
    version: it.version ? clampStr(it.version, 30) : undefined,
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
    timestamp: Date.now()
  };
  await store.update('orders', [], (orders) => { orders.unshift(order); return orders; });
  await notifyAdmin(`🛒 Nouvelle commande de **${order.customerName}** (<@${order.discordId}>) — ${order.total} ${order.currency}\n` + items.map((it) => `• ${it.title} — ${it.price}`).join('\n'));
  res.json({ ok: true, id: order.id });
}));

app.get('/api/orders/:discordId', auth, wrap(async (req, res) => {
  if (req.params.discordId !== req.user.id && !req.isAdmin) return res.status(403).json({ error: 'Accès refusé.' });
  const orders = await store.get('orders', []);
  res.json(orders.filter((o) => o.discordId === req.params.discordId));
}));

app.get('/api/admin/orders', auth, adminOnly, wrap(async (req, res) => {
  res.json(await store.get('orders', []));
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

  // « Payée » débloque les téléchargements ; « Annulée » les retire.
  const orderId = 'manual_' + order.id;
  if (status === 'Payée' && !order.granted) {
    const cat = await getCatalog();
    for (const it of order.items) {
      const asset = it.productId && it.offer ? findAsset(cat, it.productId) : null;
      if (!asset) continue;
      const version = it.version || asset.version;
      if (await grantPurchase(order.discordId, { assetId: asset.id, offer: it.offer, version, orderId })) {
        await sendPurchaseDM(order.discordId, asset, it.offer, version);
      }
    }
    await store.update('orders', [], (orders) => { const o = orders.find((x) => x.id === order.id); if (o) o.granted = true; return orders; });
  } else if (status === 'Annulée' && order.granted) {
    await revokeOrder(order.discordId, orderId);
    await store.update('orders', [], (orders) => { const o = orders.find((x) => x.id === order.id); if (o) o.granted = false; return orders; });
  }
  res.json({ ok: true });
}));

app.delete('/api/orders/:id', auth, adminOnly, wrap(async (req, res) => {
  let found = false;
  await store.update('orders', [], (orders) => {
    const next = orders.filter((o) => o.id !== req.params.id);
    found = next.length !== orders.length;
    return next;
  });
  if (!found) return res.status(404).json({ error: 'Commande introuvable.' });
  res.json({ ok: true });
}));

/* --- Avis ------------------------------------------------------------------- */
app.get('/api/reviews', wrap(async (req, res) => {
  res.json(await store.get('reviews', []));
}));

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

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => console.log(`✅ Serveur Exiozz sur le port ${PORT} (stockage : ${store.backend})`));
}
module.exports = { app, accessFor, subActive, signToken, verifyToken };
