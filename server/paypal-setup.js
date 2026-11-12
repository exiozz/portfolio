'use strict';
// Crée l'abonnement mensuel dans PayPal (un « produit » + un « plan ») et affiche PAYPAL_PLAN_ID.
// À lancer UNE fois, dans le Shell Replit :  cd server && npm run paypal-setup
// (les secrets PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET et PAYPAL_MODE doivent déjà être ajoutés)
// Pour changer le prix plus tard : relance ce script et remplace PAYPAL_PLAN_ID
// (les anciens abonnés gardent l'ancien prix).
const fs = require('fs');
const path = require('path');

const env = process.env;
const API = env.PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
  console.error('❌ Ajoute d\'abord les secrets PAYPAL_CLIENT_ID et PAYPAL_CLIENT_SECRET, puis relance.');
  process.exit(1);
}

const html = fs.readFileSync(path.join(__dirname, '..', 'shop.html'), 'utf8');
const data = JSON.parse(/<script id="shop-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)[1]);
const price = String((data.subscription && data.subscription.monthlyPrice) || 15);
const label = (data.subscription && data.subscription.label) || 'Abonnement total';

async function call(pathname, body, token) {
  const res = await fetch(API + pathname, {
    method: 'POST',
    headers: token
      ? { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
      : { Authorization: 'Basic ' + Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: token ? JSON.stringify(body) : body
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${pathname} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

(async () => {
  console.log(`Mode PayPal : ${env.PAYPAL_MODE === 'live' ? 'LIVE (vrai argent)' : 'sandbox (test)'}`);
  const { access_token } = await call('/v1/oauth2/token', 'grant_type=client_credentials');
  const product = await call('/v1/catalogs/products', {
    name: `Exiozz — ${label}`,
    description: 'Accès à tous les assets du shop Exiozz et à toutes leurs mises à jour.',
    type: 'DIGITAL', category: 'SOFTWARE'
  }, access_token);
  const plan = await call('/v1/billing/plans', {
    product_id: product.id,
    name: `${label} — ${price} €/mois`,
    status: 'ACTIVE',
    billing_cycles: [{
      frequency: { interval_unit: 'MONTH', interval_count: 1 },
      tenure_type: 'REGULAR', sequence: 1, total_cycles: 0,
      pricing_scheme: { fixed_price: { value: price, currency_code: 'EUR' } }
    }],
    payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 1 }
  }, access_token);
  console.log(`\n✅ Abonnement créé : ${price} €/mois`);
  console.log(`\nAjoute ce secret dans Replit :\n\nPAYPAL_PLAN_ID = ${plan.id}\n`);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
