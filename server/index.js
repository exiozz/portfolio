'use strict';
/*
 * Serveur du shop Exiozz.
 *  - Connexion Discord (OAuth2) avec un jeton de session signé
 *  - Paiement en euros avec PayPal : achat simple, Pass asset, abonnement mensuel
 *  - Paiement en Robux via le jeu Roblox « Exiozz Shop » (Developer Products)
 *  - Commandes manuelles (via Discord) + panneau admin
 *  - Avis clients
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
const PAYPAL_API = (env.PAYPAL_API_URL || (env.PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com')).replace(/\/+$/, '');
const ROBUX_SUB_DAYS = 30;

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
const httpError = (status, message) => Object.assign(new Error(message), { status });

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
const offerLabel = (offer, version) => (offer === 'pass' ? 'Pass mises à jour' : `achat simple v${version}`);

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
// ent = { purchases: [], paypalSub: null | {...}, robuxSubUntil: 0, roblox: null | { userId, name } }
const entKey = (id) => 'ent:' + id;
const emptyEnt = () => ({ purchases: [], paypalSub: null, robuxSubUntil: 0, roblox: null });
const getEnt = async (id) => ({ ...emptyEnt(), ...(await store.get(entKey(id), emptyEnt())) });
const updateEnt = (id, fn) => store.update(entKey(id), emptyEnt(), (e) => fn({ ...emptyEnt(), ...e }));

function paypalActive(sub) {
  if (!sub) return false;
  if (sub.status === 'ACTIVE' || sub.status === 'APPROVED') return true;
  return !!sub.paidUntil && new Date(sub.paidUntil) > new Date(); // résilié : accès jusqu'à la fin du mois payé
}
const robuxActive = (ent) => (ent.robuxSubUntil || 0) > Date.now();
const subActive = (ent) => paypalActive(ent.paypalSub) || robuxActive(ent);

function subscriptionInfo(ent) {
  const pp = ent.paypalSub;
  const ppUntil = pp && (pp.paidUntil || pp.nextBilling);
  const rbUntil = ent.robuxSubUntil ? new Date(ent.robuxSubUntil).toISOString() : null;
  if (!pp && !rbUntil) return null;
  const ppOn = paypalActive(pp);
  return {
    active: subActive(ent),
    provider: ppOn ? 'paypal' : robuxActive(ent) ? 'robux' : pp ? 'paypal' : 'robux',
    paypalStatus: pp ? pp.status : null,
    renews: !!pp && pp.status === 'ACTIVE',
    canCancel: !!pp && (pp.status === 'ACTIVE' || pp.status === 'APPROVED'),
    until: [ppOn ? ppUntil : null, robuxActive(ent) ? rbUntil : null].filter(Boolean).sort().pop() || ppUntil || rbUntil
  };
}

// level : 'latest' (dernière version) | 'old' (seulement une ancienne version achetée) | null
function accessFor(ent, asset) {
  if (subActive(ent)) return { level: 'latest', via: 'subscription' };
  const mine = ent.purchases.filter((p) => p.assetId === asset.id);
  if (mine.some((p) => p.offer === 'pass')) return { level: 'latest', via: 'pass' };
  const versions = mine.filter((p) => p.offer === 'single').map((p) => p.version);
  if (versions.includes(asset.version)) return { level: 'latest', via: 'single' };
  if (versions.length) return { level: 'old', via: 'single', version: versions[versions.length - 1] };
  return null;
}
async function grantPurchase(discordId, purchase) {
  let added = false;
  await updateEnt(discordId, (ent) => {
    if (!ent.purchases.some((p) => p.orderId === purchase.orderId && p.assetId === purchase.assetId)) {
      ent.purchases.push({ ...purchase, at: Date.now() });
      added = true;
    }
    return ent;
  });
  return added;
}
async function revokeOrder(discordId, orderId) {
  await updateEnt(discordId, (ent) => { ent.purchases = ent.purchases.filter((p) => p.orderId !== orderId); return ent; });
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
const welcomeSubDM = (discordId, extra) => discordDM(discordId,
  `Bienvenue dans l'**abonnement total** ! 🎉\nTous les assets et leurs mises à jour sont en téléchargement gratuit sur ${FRONT_URL}/shop.html.\n${extra}`);

// Achat confirmé (PayPal, Robux ou validation manuelle) : droits + MP + alerte admin
async function completePurchase({ discordId, asset, offer, version, orderId, source, amount }) {
  const added = await grantPurchase(discordId, { assetId: asset.id, offer, version, orderId });
  if (added) {
    await sendPurchaseDM(discordId, asset, offer, version);
    await notifyAdmin(`💰 Vente ${source} : **${asset.title}** (${offerLabel(offer, version)}) — ${amount || ''} — <@${discordId}>`);
  }
  return added;
}

/* ------------------------------------------------------------------- PayPal */
let paypalToken = { value: null, exp: 0 };
async function paypal(pathname, opts = {}) {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) throw httpError(503, 'Le paiement PayPal n\'est pas encore configuré.');
  if (!paypalToken.value || Date.now() > paypalToken.exp) {
    const res = await fetch(PAYPAL_API + '/v1/oauth2/token', {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials'
    });
    if (!res.ok) { console.error('PayPal token', res.status, await res.text()); throw httpError(502, 'Connexion à PayPal impossible.'); }
    const t = await res.json();
    paypalToken = { value: t.access_token, exp: Date.now() + (t.expires_in - 120) * 1000 };
  }
  const res = await fetch(PAYPAL_API + pathname, {
    ...opts,
    headers: { Authorization: 'Bearer ' + paypalToken.value, 'Content-Type': 'application/json', ...(opts.headers || {}) }
  });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok && !opts.allowError) {
    console.error('PayPal', pathname, res.status, JSON.stringify(data).slice(0, 600));
    throw httpError(502, 'PayPal a refusé la demande.');
  }
  return { status: res.status, data };
}
const approveLink = (data) => ((data.links || []).find((l) => l.rel === 'payer-action' || l.rel === 'approve') || {}).href;
const publicUrl = (req) => (env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');

// Met à jour l'abonnement PayPal depuis PayPal (au plus toutes les 30 min)
async function syncPaypalSub(discordId, ent, force) {
  const sub = ent.paypalSub;
  if (!sub || !env.PAYPAL_CLIENT_ID) return ent;
  if (!force && sub.checkedAt && Date.now() - sub.checkedAt < 30 * 60e3) return ent;
  try {
    const { data } = await paypal(`/v1/billing/subscriptions/${encodeURIComponent(sub.id)}`);
    const next = data.billing_info && data.billing_info.next_billing_time;
    const lastPay = data.billing_info && data.billing_info.last_payment && data.billing_info.last_payment.time;
    const fallback = lastPay ? new Date(new Date(lastPay).getTime() + 31 * 864e5).toISOString() : null;
    const wasActive = paypalActive(sub);
    const updated = await updateEnt(discordId, (e) => {
      if (!e.paypalSub || e.paypalSub.id !== sub.id) return e;
      e.paypalSub.status = data.status;
      if (next) e.paypalSub.nextBilling = next;
      if (data.status === 'ACTIVE' && next) e.paypalSub.paidUntil = next;
      else if (!e.paypalSub.paidUntil && fallback) e.paypalSub.paidUntil = fallback;
      e.paypalSub.checkedAt = Date.now();
      return e;
    });
    if (wasActive && !paypalActive(updated.paypalSub)) await notifyAdmin(`Fin d'abonnement PayPal : <@${discordId}> (${data.status})`);
    return updated;
  } catch (e) { console.warn('Synchro abonnement PayPal :', e.message); return ent; }
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
function gameOnly(req, res, next) {
  if (!env.ROBLOX_GAME_KEY || !safeEqual(req.get('X-Game-Key') || '', env.ROBLOX_GAME_KEY)) return res.status(401).json({ error: 'Clé du jeu invalide.' });
  next();
}
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  if (!e.status) console.error(e);
  res.status(e.status || 500).json({ error: e.status ? e.message : 'Erreur interne du serveur.' });
});
const backToShop = (res, hash) => res.redirect(`${FRONT_URL}/shop.html#${hash}`);

app.get('/', (req, res) => res.json({ ok: true, service: 'exiozz-server', storage: store.backend, paypal: env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox' }));
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
  const ent = await syncPaypalSub(req.user.id, await getEnt(req.user.id));
  res.json({
    user: { id: req.user.id, name: req.user.name, avatar: req.user.avatar },
    isAdmin: req.isAdmin,
    subscription: subscriptionInfo(ent),
    roblox: ent.roblox,
    purchases: ent.purchases.map((p) => ({ assetId: p.assetId, offer: p.offer, version: p.version, at: p.at }))
  });
}));

/* --- PayPal : achat simple / Pass ------------------------------------------- */
app.post('/api/paypal/order', auth, wrap(async (req, res) => {
  const offer = req.body && req.body.offer;
  if (offer !== 'single' && offer !== 'pass') return res.status(400).json({ error: 'Offre inconnue.' });
  const cat = await getCatalog();
  const asset = findAsset(cat, req.body.assetId);
  if (!asset) return res.status(404).json({ error: 'Asset introuvable.' });
  const access = accessFor(await getEnt(req.user.id), asset);
  if (access && access.level === 'latest') return res.status(409).json({ error: 'Tu as déjà accès à la dernière version de cet asset.' });
  if (!downloadUrl(asset.id, asset.version)) return res.status(503).json({ error: 'Cet asset n\'est pas encore disponible en paiement automatique. Commande-le via Discord.' });

  const price = offer === 'pass' ? passPrice(cat, asset) : +asset.price;
  if (!(price > 0)) return res.status(400).json({ error: 'Prix invalide.' });
  const version = String(asset.version || '');
  const base = publicUrl(req);
  const { data } = await paypal('/v2/checkout/orders', {
    method: 'POST',
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: asset.id.slice(0, 256),
        custom_id: req.user.id,
        description: `${asset.title} — ${offer === 'pass' ? 'Pass (mises à jour incluses)' : `v${version} (sans mises à jour)`}`.slice(0, 127),
        amount: { currency_code: 'EUR', value: price.toFixed(2) }
      }],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: 'Exiozz', locale: 'fr-FR', user_action: 'PAY_NOW', shipping_preference: 'NO_SHIPPING',
            return_url: `${base}/api/paypal/return`, cancel_url: `${FRONT_URL}/shop.html#paid=cancel`
          }
        }
      }
    })
  });
  const url = approveLink(data);
  if (!data.id || !isHttps(url)) throw httpError(502, 'PayPal n\'a pas renvoyé de lien de paiement.');
  await store.set('pporder:' + data.id, { discordId: req.user.id, assetId: asset.id, offer, version, price, at: Date.now() });
  res.json({ url });
}));

// PayPal renvoie ici le client après validation : on encaisse puis on retourne au shop.
app.get('/api/paypal/return', wrap(async (req, res) => {
  const orderId = String(req.query.token || '');
  const pending = orderId && (await store.get('pporder:' + orderId));
  if (!pending) return backToShop(res, 'paid=error');

  let { status, data } = await paypal(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: 'POST', body: '{}', allowError: true });
  if (status === 422) ({ data } = await paypal(`/v2/checkout/orders/${encodeURIComponent(orderId)}`)); // déjà encaissée
  else if (status >= 400) { console.error('Capture PayPal', status, JSON.stringify(data).slice(0, 600)); return backToShop(res, 'paid=error'); }

  const capture = (((data.purchase_units || [])[0] || {}).payments || {}).captures || [];
  const paid = data.status === 'COMPLETED' && capture.some((c) => c.status === 'COMPLETED' && Math.abs(+c.amount.value - pending.price) < 0.01 && c.amount.currency_code === 'EUR');
  if (!paid) { console.error('Paiement PayPal incomplet', orderId, data.status); return backToShop(res, 'paid=error'); }

  const cat = await getCatalog();
  const asset = findAsset(cat, pending.assetId) || { id: pending.assetId, title: pending.assetId };
  await completePurchase({ discordId: pending.discordId, asset, offer: pending.offer, version: pending.version, orderId: 'pp_' + orderId, source: 'PayPal', amount: pending.price + ' €' });
  backToShop(res, 'paid=1');
}));

/* --- PayPal : abonnement mensuel ------------------------------------------ */
app.post('/api/paypal/subscription', auth, wrap(async (req, res) => {
  if (!env.PAYPAL_PLAN_ID) return res.status(503).json({ error: 'L\'abonnement PayPal n\'est pas encore configuré.' });
  const ent = await syncPaypalSub(req.user.id, await getEnt(req.user.id), true);
  if (ent.paypalSub && ['ACTIVE', 'APPROVED'].includes(ent.paypalSub.status)) return res.status(409).json({ error: 'Tu as déjà un abonnement PayPal actif.' });
  const base = publicUrl(req);
  const { data } = await paypal('/v1/billing/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      plan_id: env.PAYPAL_PLAN_ID,
      custom_id: req.user.id,
      application_context: {
        brand_name: 'Exiozz', locale: 'fr-FR', shipping_preference: 'NO_SHIPPING', user_action: 'SUBSCRIBE_NOW',
        return_url: `${base}/api/paypal/subscription/return`, cancel_url: `${FRONT_URL}/shop.html#paid=cancel`
      }
    })
  });
  const url = approveLink(data);
  if (!data.id || !isHttps(url)) throw httpError(502, 'PayPal n\'a pas renvoyé de lien d\'abonnement.');
  await store.set('ppsub:' + data.id, req.user.id);
  res.json({ url });
}));

app.get('/api/paypal/subscription/return', wrap(async (req, res) => {
  const subId = String(req.query.subscription_id || '');
  const discordId = subId && (await store.get('ppsub:' + subId));
  if (!discordId) return backToShop(res, 'paid=error');
  const { data } = await paypal(`/v1/billing/subscriptions/${encodeURIComponent(subId)}`);
  if (!['ACTIVE', 'APPROVED'].includes(data.status) || data.custom_id !== discordId) return backToShop(res, 'paid=error');

  const ent = await getEnt(discordId);
  const already = ent.paypalSub && ent.paypalSub.id === subId;
  await updateEnt(discordId, (e) => {
    const next = data.billing_info && data.billing_info.next_billing_time;
    e.paypalSub = { id: subId, status: data.status, nextBilling: next || null, paidUntil: next || new Date(Date.now() + 31 * 864e5).toISOString(), checkedAt: Date.now() };
    return e;
  });
  if (!already) {
    await welcomeSubDM(discordId, 'Tu peux te désabonner à tout moment depuis le shop (menu Discord → « Gérer mon abonnement »).');
    await notifyAdmin(`⭐ Nouvel abonné PayPal : <@${discordId}>`);
  }
  backToShop(res, 'paid=1');
}));

app.post('/api/subscription/cancel', auth, wrap(async (req, res) => {
  const ent = await getEnt(req.user.id);
  const sub = ent.paypalSub;
  if (!sub || !['ACTIVE', 'APPROVED'].includes(sub.status)) return res.status(404).json({ error: 'Aucun abonnement PayPal en cours.' });
  await paypal(`/v1/billing/subscriptions/${encodeURIComponent(sub.id)}/cancel`, { method: 'POST', body: JSON.stringify({ reason: 'Résilié depuis le shop' }) });
  const updated = await updateEnt(req.user.id, (e) => {
    if (e.paypalSub) { e.paypalSub.status = 'CANCELLED'; e.paypalSub.paidUntil = e.paypalSub.paidUntil || e.paypalSub.nextBilling; e.paypalSub.checkedAt = Date.now(); }
    return e;
  });
  await notifyAdmin(`Désabonnement PayPal : <@${req.user.id}>`);
  res.json({ ok: true, subscription: subscriptionInfo(updated) });
}));

/* --- Roblox : lier son compte --------------------------------------------- */
app.post('/api/roblox/link-code', auth, wrap(async (req, res) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O/1/I pour éviter les confusions
  let code = '';
  for (let i = 0; i < 6; i++) code += alphabet[crypto.randomInt(alphabet.length)];
  const expiresAt = Date.now() + 15 * 60e3;
  await store.set('rlcode:' + code, { discordId: req.user.id, discordName: req.user.name, expiresAt });
  res.json({ code, expiresAt });
}));

app.post('/api/roblox/unlink', auth, wrap(async (req, res) => {
  const ent = await getEnt(req.user.id);
  if (ent.roblox) await store.set('rbx:' + ent.roblox.userId, null);
  await updateEnt(req.user.id, (e) => { e.roblox = null; return e; });
  res.json({ ok: true });
}));

/* --- Roblox : appels du jeu (protégés par ROBLOX_GAME_KEY) ----------------- */
const robloxId = (v) => (/^\d{1,20}$/.test(String(v)) ? String(v) : null);

app.get('/api/roblox/player/:robloxUserId', gameOnly, wrap(async (req, res) => {
  const rid = robloxId(req.params.robloxUserId);
  if (!rid) return res.status(400).json({ error: 'ID Roblox invalide.' });
  const link = await store.get('rbx:' + rid);
  if (!link) return res.json({ linked: false });
  const ent = await getEnt(link.discordId);
  const info = subscriptionInfo(ent);
  res.json({ linked: true, discordName: link.discordName, subscribedUntil: info && info.active ? info.until : null });
}));

app.post('/api/roblox/link', gameOnly, wrap(async (req, res) => {
  const b = req.body || {};
  const rid = robloxId(b.robloxUserId);
  const code = String(b.code || '').trim().toUpperCase();
  if (!rid || !/^[A-Z0-9]{6}$/.test(code)) return res.status(400).json({ error: 'Code invalide.' });
  const entry = await store.get('rlcode:' + code);
  if (!entry || entry.expiresAt < Date.now()) return res.status(404).json({ error: 'Code inconnu ou expiré : génère un nouveau code sur le site.' });
  await store.set('rlcode:' + code, null);

  // Un compte Roblox ne peut être lié qu'à un seul compte Discord (et inversement)
  const previous = await store.get('rbx:' + rid);
  if (previous && previous.discordId !== entry.discordId) await updateEnt(previous.discordId, (e) => { e.roblox = null; return e; });
  const old = (await getEnt(entry.discordId)).roblox;
  if (old && old.userId !== rid) await store.set('rbx:' + old.userId, null);

  const discordName = entry.discordName || 'ton compte Discord';
  await store.set('rbx:' + rid, { discordId: entry.discordId, discordName });
  await updateEnt(entry.discordId, (e) => { e.roblox = { userId: rid, name: clampStr(b.robloxName, 50) }; return e; });
  res.json({ ok: true, discordName });
}));

// Appelé par ProcessReceipt dans le jeu après un achat de Developer Product.
app.post('/api/roblox/purchase', gameOnly, wrap(async (req, res) => {
  const b = req.body || {};
  const rid = robloxId(b.robloxUserId);
  const purchaseId = clampStr(b.purchaseId, 100);
  if (!rid || !purchaseId) return res.status(400).json({ error: 'Requête invalide.' });
  const link = await store.get('rbx:' + rid);
  if (!link) return res.status(409).json({ error: 'Compte Roblox non lié.' });
  const discordId = link.discordId;
  const doneKey = 'rbxpurchase:' + purchaseId;
  if (await store.get(doneKey)) return res.json({ ok: true, duplicate: true });

  if (b.offer === 'subscription') {
    await updateEnt(discordId, (e) => {
      e.robuxSubUntil = Math.max(Date.now(), e.robuxSubUntil || 0) + ROBUX_SUB_DAYS * 864e5;
      return e;
    });
    await welcomeSubDM(discordId, `Ton accès dure ${ROBUX_SUB_DAYS} jours : rachète l'abonnement dans le jeu pour le prolonger.`);
    await notifyAdmin(`⭐ Abonnement Robux (${ROBUX_SUB_DAYS} j) : <@${discordId}> — ${b.robux || '?'} R$`);
  } else if (b.offer === 'single' || b.offer === 'pass') {
    const cat = await getCatalog();
    const asset = findAsset(cat, b.assetId);
    if (!asset) return res.status(404).json({ error: 'Asset inconnu : vérifie la configuration du jeu.' });
    await completePurchase({ discordId, asset, offer: b.offer, version: String(asset.version || ''), orderId: 'rbx_' + purchaseId, source: 'Robux', amount: (b.robux || '?') + ' R$' });
  } else {
    return res.status(400).json({ error: 'Offre inconnue.' });
  }
  await store.set(doneKey, { at: Date.now(), discordId });
  res.json({ ok: true });
}));

/* --- Téléchargement -------------------------------------------------------- */
app.get('/api/download/:assetId', auth, wrap(async (req, res) => {
  const cat = await getCatalog();
  const asset = findAsset(cat, req.params.assetId);
  if (!asset) return res.status(404).json({ error: 'Asset introuvable.' });
  const access = accessFor(await syncPaypalSub(req.user.id, await getEnt(req.user.id)), asset);
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
      if (asset) await completePurchase({ discordId: order.discordId, asset, offer: it.offer, version: it.version || asset.version, orderId, source: 'manuelle', amount: `${it.price} ${order.currency}` });
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
  app.listen(PORT, '0.0.0.0', () => console.log(`✅ Serveur Exiozz sur le port ${PORT} (stockage : ${store.backend}, PayPal : ${env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox'})`));
}
module.exports = { app, accessFor, subActive, signToken, verifyToken };
