# Serveur du shop Exiozz

Ce serveur gère :

- la **connexion Discord** (avec un jeton de session signé : on ne peut pas se faire passer pour quelqu'un d'autre) ;
- le **paiement en euros avec PayPal** : achat simple, Pass asset, abonnement mensuel (avec désabonnement depuis le shop) ;
- le **paiement en Robux** via ton jeu Roblox « Exiozz Shop » ;
- les **commandes via Discord** (paiement manuel) et le panneau admin ;
- les **avis** de la page d'accueil ;
- les **téléchargements protégés** et l'envoi du lien en MP Discord.

## Les offres

| Offre | En euros (PayPal) | En Robux (jeu Roblox) | Ce que le client obtient |
|---|---|---|---|
| Achat simple | `price` de l'asset | `robux.single` (sinon `price × robuxRate`) | La version actuelle uniquement, sans mises à jour |
| Pass asset | `price × passMultiplier` (1,6) | `robux.pass` (sinon conversion) | L'asset + toutes ses futures mises à jour, à vie |
| Abonnement total | 15 €/mois, renouvelé automatiquement | `subscription.robuxPrice` (sinon conversion) pour **30 jours** | Tout le catalogue + toutes les mises à jour |
| Via Discord | Tu valides à la main | — | Achat simple ou Pass, débloqué quand tu passes la commande en « Payée » |

Tout se règle dans `shop.html` (bloc `shop-data`). Exemple pour fixer les prix Robux d'un asset :
`"robux": { "single": 400, "pass": 640 }`. **Ces prix doivent être les mêmes que ceux de tes Developer Products sur Roblox.**

**Sortir une mise à jour** : change la `version` de l'asset dans `shop.html` (par ex. `"1.1"`) et ajoute le lien de la nouvelle version dans le secret `DOWNLOADS_JSON`. Les abonnés et les détenteurs du Pass ont la nouvelle version automatiquement. Les achats simples gardent leur version et voient « La version 1.1 est sortie ».

---

## Mise en place

### 1. PayPal (compte Professionnel)

1. Va sur **developer.paypal.com** et connecte-toi avec ton compte PayPal Pro.
2. **Apps & Credentials** : reste sur l'onglet **Sandbox** (le mode test), puis clique **Create App**.
   - Nom : `Exiozz Shop`, type : *Merchant*.
   - Note le **Client ID** et le **Secret** (le secret va dans Replit, jamais dans le chat).
3. Toujours dans **Sandbox → Accounts**, PayPal t'a créé un faux compte « Personal ». Il sert à faire des achats de test.
4. Plus tard, pour encaisser pour de vrai : refais la même chose dans l'onglet **Live**, change les secrets et mets `PAYPAL_MODE` à `live`.

### 2. Replit

1. Crée un nouveau Repl : **Import from GitHub** → `exiozz/portfolio` (branche `paiements`).
2. Dans le Shell : `cd server && npm install`
3. Commande de lancement (Run / Deployment) : `cd server && npm start`
4. Ouvre l'outil **Database** (Key-Value Store) pour que les données soient sauvegardées.
5. Ajoute les **Secrets** (tableau ci-dessous).
6. Dans le Shell : `cd server && npm run paypal-setup`. Ça crée l'abonnement à 15 €/mois chez PayPal et affiche `PAYPAL_PLAN_ID` : ajoute-le aux Secrets.
7. Lance un **Deployment**. Note l'adresse obtenue, par ex. `https://exiozz-shop.replit.app`.

| Secret | Valeur |
|---|---|
| `SESSION_SECRET` | Une longue chaîne au hasard. Dans le Shell : `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `DISCORD_CLIENT_ID` | `1540486396287000626` |
| `DISCORD_CLIENT_SECRET` | Discord Developer Portal → ton application → OAuth2 → Client Secret |
| `DISCORD_REDIRECT_URI` | `https://<ton-serveur>.replit.app/auth/discord` |
| `ADMIN_DISCORD_ID` | `799725583213920276` |
| `FRONT_URL` | `https://exiozz.github.io/portfolio` |
| `PAYPAL_MODE` | `sandbox` pour tester, `live` pour le vrai argent |
| `PAYPAL_CLIENT_ID` | Le Client ID de ton app PayPal |
| `PAYPAL_CLIENT_SECRET` | Le Secret de ton app PayPal |
| `PAYPAL_PLAN_ID` | Affiché par `npm run paypal-setup` |
| `ROBLOX_GAME_KEY` | Une autre longue chaîne au hasard (même commande que `SESSION_SECRET`). Tu la recopieras dans le script Roblox. |
| `DOWNLOADS_JSON` | Les liens privés, par version : `{"modern-school-ui":{"1.0":"https://lien-de-telechargement"}}` |
| `DISCORD_BOT_TOKEN` | *(optionnel)* Token d'un bot présent sur ton serveur Discord, pour envoyer le lien en MP |
| `DISCORD_ORDERS_WEBHOOK_URL` | *(optionnel)* Webhook d'un salon Discord privé, pour être prévenu de chaque vente |

Un asset sans lien dans `DOWNLOADS_JSON` ne peut pas être payé automatiquement : le site propose alors seulement la commande via Discord.

### 3. Discord Developer Portal

OAuth2 → Redirects : ajoute `https://<ton-serveur>.replit.app/auth/discord`.

### 4. Le jeu Roblox « Exiozz Shop »

Utilise un jeu **dédié au shop** : Roblox n'autorise qu'un seul système d'achat (`ProcessReceipt`) par jeu.

1. Crée un jeu (un Baseplate suffit) et publie-le.
2. **Game Settings → Security → Allow HTTP Requests : ON.**
3. Sur create.roblox.com → ton jeu → **Monetization → Developer Products**, crée un produit par offre, par exemple :
   - « UI Kit — Achat simple (v1.0) » : 400 R$
   - « UI Kit — Pass mises à jour » : 640 R$
   - « Abonnement total — 30 jours » : 1 200 R$
   Note l'**ID** de chaque produit.
4. Dans Studio :
   - `ServerScriptService` → nouveau **Script** nommé `ExiozzShop` → colle `roblox/ExiozzShop.server.lua`.
   - `StarterPlayer → StarterPlayerScripts` → nouveau **LocalScript** nommé `ExiozzShopClient` → colle `roblox/ExiozzShopClient.client.lua`.
5. En haut du script `ExiozzShop`, remplis `CONFIG` : l'adresse du serveur, la clé `ROBLOX_GAME_KEY`, et la liste des produits (ID → asset + offre).
6. Publie le jeu, puis mets son adresse dans `shop.html` : `"roblox": { "gameUrl": "https://www.roblox.com/games/<id>" }`.

Pour le client, le parcours est le suivant : sur le site, il choisit R$ puis « Payer en Robux » et reçoit un code. Dans le jeu, il entre ce code une seule fois pour lier son compte, puis il achète. Son accès se débloque tout seul sur le site.

### 5. Brancher le site sur le nouveau serveur

Dans `shop.html` **et** `index.html`, remplace `backendAuthUrl` par `https://<ton-serveur>.replit.app/auth/discord`, puis fusionne la branche sur `main`.

### 6. Récupérer les anciens avis et commandes

Dans le Shell Replit : `cd server && npm run migrate`.

### 7. Tester

- **PayPal** (mode sandbox) : achète avec le faux compte « Personal » de l'étape 1. Ensuite, abonne-toi puis désabonne-toi depuis le shop.
- **Robux** : dans Studio (bouton Play), les achats de Developer Products sont gratuits et passent quand même par ProcessReceipt. C'est parfait pour tester.

---

## Routes

| Route | Rôle |
|---|---|
| `GET /auth/discord` | Retour de Discord après la connexion |
| `GET /api/me` | Droits du client connecté (achats, abonnement, compte Roblox lié) |
| `POST /api/paypal/order` → `GET /api/paypal/return` | Achat simple / Pass avec PayPal |
| `POST /api/paypal/subscription` → `GET /api/paypal/subscription/return` | Abonnement PayPal |
| `POST /api/subscription/cancel` | Se désabonner (PayPal) |
| `POST /api/roblox/link-code`, `POST /api/roblox/unlink` | Lier ou délier son compte Roblox (site) |
| `GET /api/roblox/player/:id`, `POST /api/roblox/link`, `POST /api/roblox/purchase` | Appels du jeu Roblox (en-tête `X-Game-Key`) |
| `GET /api/download/:assetId` | Lien de téléchargement, si le client y a droit |
| `POST /api/order`, `GET /api/orders/:id`, `GET /api/admin/orders`, `PATCH`/`DELETE /api/orders/:id` | Commandes via Discord + admin |
| `GET`/`POST /api/reviews`, `DELETE /api/reviews/:discordId` | Avis |
