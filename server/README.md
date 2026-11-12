# Serveur du shop Exiozz

Ce serveur gère :

- la **connexion Discord** (avec un jeton de session signé : on ne peut plus se faire passer pour quelqu'un d'autre) ;
- les **commandes via Discord** (paiement manuel : Robux, PayPal…) et le panneau admin ;
- les **avis** de la page d'accueil ;
- les **paiements par carte** avec Lemon Squeezy : achat simple, Pass asset, abonnement total ;
- les **téléchargements protégés** et l'envoi du lien en MP Discord.

## Les offres

| Offre | Paiement | Ce que le client obtient |
|---|---|---|
| Achat simple | 1 fois, prix de l'asset (`price`) | La version actuelle uniquement. Les mises à jour ne sont pas incluses : il faut racheter. |
| Pass asset | 1 fois, `price × passMultiplier` (1,6 par défaut, arrondi à l'euro) | L'asset + toutes ses futures mises à jour, à vie |
| Abonnement total | Chaque mois (`subscription.monthlyPrice`, 15 €) | Tous les assets + toutes les mises à jour, tant qu'il est abonné |
| Via Discord | Tu valides à la main | Achat simple ou Pass, débloqué quand tu passes la commande en « Payée » |

Les prix et les versions sont lus directement dans `shop.html` (bloc `shop-data`) : tu ne les changes qu'à un seul endroit.
Pour fixer toi-même le prix du Pass d'un asset, ajoute `"passPrice": 9` dans cet asset.

**Sortir une mise à jour d'un asset** : change sa `version` dans `shop.html` (par ex. `"1.1"`) et ajoute le lien de la nouvelle version dans le secret `DOWNLOADS_JSON`. Les abonnés et les détenteurs du Pass ont automatiquement la nouvelle version. Ceux qui ont fait un achat simple gardent leur version et voient « La version 1.1 est sortie : rachète l'asset ou prends le Pass ».

---

## Mise en place (une seule fois)

### 1. Lemon Squeezy

1. Crée un compte sur lemonsqueezy.com et un **Store**. Reste en **mode test** au début.
2. Crée **2 produits** :
   - **« Asset du shop »**, paiement unique, n'importe quel prix (le serveur met le bon prix à chaque achat). Note l'**ID de sa variante**.
   - **« Abonnement total »**, abonnement **mensuel à 15 €**. Note l'**ID de sa variante**.
   L'ID d'une variante se trouve dans l'URL quand tu l'ouvres, ou via le bouton « Copy ID ».
3. **Settings → API** : crée une clé API.
4. **Settings → Stores** : note l'**ID du store**.
5. **Settings → Webhooks** : ajoute un webhook.
   - URL : `https://<ton-serveur>.replit.app/api/webhooks/lemonsqueezy`
   - Choisis un **Signing secret** (une longue phrase au hasard) et garde-le.
   - Coche les événements `order_created`, `order_refunded`, `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_resumed`, `subscription_expired`, `subscription_paused` et `subscription_unpaused`.
6. **Settings → Customer portal** : active-le. C'est la page où le client se désabonne.

### 2. Replit

1. Crée un nouveau Repl : **Import from GitHub** → `exiozz/portfolio`.
2. Dans le Shell : `cd server && npm install`
3. Commande de lancement (Run / Deployment) : `cd server && npm start`
4. Ouvre l'outil **Database** (Key-Value Store) pour que les données soient bien sauvegardées.
5. Ajoute les **Secrets** ci-dessous.
6. Lance un **Deployment** (Autoscale ou Reserved VM). Note l'URL obtenue, par ex. `https://exiozz-shop.replit.app`.

### 3. Secrets à ajouter dans Replit

| Nom | Valeur |
|---|---|
| `SESSION_SECRET` | Une longue chaîne au hasard (64 caractères). Dans le Shell : `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `DISCORD_CLIENT_ID` | `1540486396287000626` |
| `DISCORD_CLIENT_SECRET` | Discord Developer Portal → ton application → OAuth2 → Client Secret |
| `DISCORD_REDIRECT_URI` | `https://<ton-serveur>.replit.app/auth/discord` |
| `ADMIN_DISCORD_ID` | `799725583213920276` |
| `FRONT_URL` | `https://exiozz.github.io/portfolio` |
| `LEMON_API_KEY` | La clé API Lemon Squeezy |
| `LEMON_STORE_ID` | L'ID du store |
| `LEMON_VARIANT_ASSET` | L'ID de la variante « Asset du shop » |
| `LEMON_VARIANT_SUBSCRIPTION` | L'ID de la variante « Abonnement total » |
| `LEMON_WEBHOOK_SECRET` | Le Signing secret du webhook |
| `DOWNLOADS_JSON` | Les liens privés, par version : `{"modern-school-ui":{"1.0":"https://lien-de-telechargement"}}` |
| `DISCORD_BOT_TOKEN` | *(optionnel)* Token d'un bot présent sur ton serveur Discord, pour envoyer le lien en MP |
| `DISCORD_ORDERS_WEBHOOK_URL` | *(optionnel)* Webhook d'un salon Discord privé pour être prévenu de chaque vente ou commande |

Un asset sans lien dans `DOWNLOADS_JSON` ne peut pas être payé par carte : le site propose alors seulement la commande via Discord.

### 4. Discord Developer Portal

OAuth2 → Redirects : ajoute `https://<ton-serveur>.replit.app/auth/discord`.

### 5. Brancher le site sur le nouveau serveur

Dans `shop.html` **et** `index.html`, remplace l'adresse `backendAuthUrl` par `https://<ton-serveur>.replit.app/auth/discord`, puis fusionne la branche sur `main`.

### 6. Récupérer les anciens avis et commandes

Dans le Shell Replit : `cd server && npm run migrate`. Cette commande copie les avis et les commandes de l'ancien serveur.

### 7. Tester

En mode test Lemon Squeezy, paie avec la carte `4242 4242 4242 4242` (n'importe quelle date future et n'importe quel code). Vérifie que le bouton « Télécharger » apparaît, puis passe Lemon Squeezy en mode live.

---

## Routes

| Route | Rôle |
|---|---|
| `GET /auth/discord` | Retour de Discord après la connexion |
| `GET /api/me` | Droits du client connecté (achats, abonnement) |
| `POST /api/checkout` | Crée un paiement Lemon Squeezy (`offer`: `single`, `pass` ou `subscription`) |
| `POST /api/webhooks/lemonsqueezy` | Reçoit les paiements, remboursements et désabonnements |
| `GET /api/subscription/portal` | Lien vers la page « Gérer mon abonnement » |
| `GET /api/download/:assetId` | Lien de téléchargement, si le client y a droit |
| `POST /api/order`, `GET /api/orders/:id`, `GET /api/admin/orders`, `PATCH`/`DELETE /api/orders/:id` | Commandes via Discord + admin |
| `GET`/`POST /api/reviews`, `DELETE /api/reviews/:discordId` | Avis |
