'use strict';
// Récupère les avis et les commandes de l'ANCIEN serveur Replit et les copie dans le nouveau.
// À lancer une seule fois, dans le Shell Replit :  npm run migrate
// (nécessite les mêmes Secrets que le serveur, + OLD_API_URL si l'ancienne adresse a changé)
const store = require('./store');

const OLD = (process.env.OLD_API_URL || 'https://exiozz-discord-auth--tomokari35.replit.app').replace(/\/+$/, '');
const ADMIN = process.env.ADMIN_DISCORD_ID;

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

(async () => {
  console.log('Ancien serveur :', OLD);
  const reviews = await getJson(`${OLD}/api/reviews`).catch((e) => { console.warn('Avis :', e.message); return []; });
  const orders = ADMIN
    ? await getJson(`${OLD}/api/admin/orders?requesterId=${encodeURIComponent(ADMIN)}`).catch((e) => { console.warn('Commandes :', e.message); return []; })
    : [];

  await store.update('reviews', [], (cur) => {
    const ids = new Set(cur.map((r) => r.discordId));
    return cur.concat(reviews.filter((r) => r && r.discordId && !ids.has(r.discordId)));
  });
  await store.update('orders', [], (cur) => {
    const ids = new Set(cur.map((o) => String(o.id)));
    return cur.concat(orders.filter((o) => o && o.id != null && !ids.has(String(o.id))).map((o) => ({ ...o, id: String(o.id), granted: true })))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  });
  console.log(`✅ ${reviews.length} avis et ${orders.length} commandes récupérés.`);
  console.log('Les anciennes commandes sont importées sans débloquer de téléchargement automatique.');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
