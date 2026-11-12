# Serveur du shop Exiozz sur Cloudflare (gratuit)

Le serveur tient dans **un seul fichier** : `worker.js`. Il gère :

- la **connexion Discord**, avec un jeton signé : personne ne peut se faire passer pour quelqu'un d'autre ;
- les **commandes** : tout passe par toi, tu valides dans le panneau admin (shop → menu Discord → « Mes commandes ») ;
- les **fichiers livrés** : depuis l'admin, tu les ajoutes sous la commande d'un client. Il les télécharge depuis son compte et **ils sont supprimés au bout de 24 h** (95 Mo maximum par fichier) ;
- les **avis** de la page d'accueil.

**Tes avis et tes commandes ne sont pas perdus** : à la première visite, le serveur les copie automatiquement depuis l'ancien serveur Replit, tant que celui-ci est encore en ligne.

Tout est gratuit avec l'offre Cloudflare Free :
- **Workers** pour le serveur ;
- **D1** pour la base de données (avis, commandes) ;
- **KV** pour les fichiers livrés.

---

## Mise en place (tout se fait sur dash.cloudflare.com)

### 1. Créer le worker
1. **Workers & Pages** (ou **Compute → Workers**) → **Create** → **Create Worker** (modèle « Hello World »).
2. Nom : `exiozz-shop` → **Deploy**.
3. Note l'adresse obtenue, par ex. `https://exiozz-shop.<ton-nom>.workers.dev`.

### 2. Créer la base de données et le stockage
1. **Storage & Databases → D1** → **Create** → nom `exiozz` → **Create**.
2. **Storage & Databases → KV** → **Create** → nom `exiozz-files` → **Add**.

### 3. Relier la base et le stockage au worker
Ouvre ton worker → **Settings** → **Bindings** → **Add** :
- **D1 database** → Variable name : `DB` → base `exiozz` ;
- **KV namespace** → Variable name : `FILES` → namespace `exiozz-files`.

### 4. Les secrets
Toujours dans ton worker → **Settings** → **Variables and Secrets** → **Add**, type **Secret** :

| Nom | Valeur |
|---|---|
| `SESSION_SECRET` | Une longue suite aléatoire (au moins 32 caractères) |
| `DISCORD_CLIENT_ID` | `1540486396287000626` |
| `DISCORD_CLIENT_SECRET` | Discord Developer Portal → ton application → OAuth2 → Client Secret |
| `DISCORD_REDIRECT_URI` | `https://exiozz-shop.<ton-nom>.workers.dev/auth/discord` |
| `ADMIN_DISCORD_ID` | `799725583213920276` |
| `FRONT_URL` | `https://exiozz.github.io/portfolio` |
| `DISCORD_BOT_TOKEN` | *(optionnel)* Token d'un bot de ton serveur Discord, pour prévenir le client en MP quand ses fichiers sont prêts |
| `DISCORD_ORDERS_WEBHOOK_URL` | *(optionnel)* Webhook d'un salon privé, pour être prévenu de chaque commande |

### 5. Coller le code
Worker → **Edit code**. Remplace tout le contenu par celui de `worker.js`, puis clique sur **Deploy**.

### 6. Discord
Discord Developer Portal → ton application → **OAuth2 → Redirects** : ajoute `https://exiozz-shop.<ton-nom>.workers.dev/auth/discord`.

### 7. Vérifier
Ouvre `https://exiozz-shop.<ton-nom>.workers.dev/api/reviews` : tu dois voir tes avis.

### 8. Brancher le site
Dans `shop.html` et `index.html`, remplace `backendAuthUrl` par `https://exiozz-shop.<ton-nom>.workers.dev/auth/discord`, puis fusionne la branche sur `main`. Les clients devront se reconnecter une fois avec Discord.
