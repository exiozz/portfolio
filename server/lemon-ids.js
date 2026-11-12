'use strict';
// Affiche l'ID de ton store et les ID des variantes Lemon Squeezy.
// Dans le Shell Replit :  cd server && npm run lemon-ids
// (le secret LEMON_API_KEY doit déjà être ajouté)
const KEY = process.env.LEMON_API_KEY;
if (!KEY) { console.error('❌ Ajoute d\'abord le secret LEMON_API_KEY dans Replit, puis relance.'); process.exit(1); }

async function get(path) {
  const res = await fetch('https://api.lemonsqueezy.com/v1' + path, { headers: { Accept: 'application/vnd.api+json', Authorization: 'Bearer ' + KEY } });
  if (!res.ok) throw new Error(`${path} → ${res.status} (clé API invalide ?)`);
  return (await res.json()).data || [];
}

(async () => {
  const stores = await get('/stores');
  console.log('\n=== Stores ===');
  stores.forEach((s) => console.log(`LEMON_STORE_ID = ${s.id}   (${s.attributes.name})`));

  const products = await get('/products?page[size]=100');
  const names = Object.fromEntries(products.map((p) => [p.id, p.attributes.name]));
  const variants = await get('/variants?page[size]=100');
  console.log('\n=== Variantes ===');
  variants.forEach((v) => {
    const a = v.attributes;
    const type = a.is_subscription ? `abonnement (${a.interval})` : 'paiement unique';
    console.log(`${v.id}   ${names[a.product_id] || '?'} — ${a.name} — ${type} — ${(a.price / 100).toFixed(2)} €`);
  });
  console.log('\n→ LEMON_VARIANT_ASSET = l\'ID de « Asset du shop »');
  console.log('→ LEMON_VARIANT_SUBSCRIPTION = l\'ID de « Abonnement total »\n');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
