# Serveur du shop Exiozz

Ce serveur gère :

- la **connexion Discord**, avec un jeton de session signé : personne ne peut se faire passer pour quelqu'un d'autre ;
- les **commandes** : tout passe par toi, tu valides dans le panneau admin (shop → menu Discord → « Mes commandes ») ;
- les **fichiers livrés** : depuis l'admin, tu ajoutes les fichiers sous la commande d'un client. Il les télécharge dans « Mes commandes », et **ils sont supprimés au bout de 24 h** ;
- les **abonnements** : quand tu passes en « Payée » une commande qui contient l'abonnement, le client a **30 jours** d'accès. Il reçoit un MP Discord **3 jours avant la fin**, puis **à la fin**, et un bandeau s'affiche sur le shop ;
- les **avis** de la page d'accueil.

**Tes avis ne sont pas perdus** : au premier démarrage, le serveur copie automatiquement les avis et les commandes de l'ancien serveur. Rien n'est supprimé, ni sur l'ancien serveur ni sur le nouveau.

---

## Mise en place

### 1. Replit

1. Crée un nouveau projet : **Import from GitHub** → `exiozz/portfolio`.
2. Dans le **Shell** :
   ```bash
   git checkout serveur
   cd server && npm install
   ```
3. Commande de lancement (Run / Deployment) : `cd server && npm start`
4. Ouvre l'outil **Database** (Key-Value Store) : c'est là que sont gardés les avis, les commandes et les abonnements.
5. Ouvre l'outil **Object Storage** et crée un bucket : c'est là que sont gardés les fichiers livrés.
6. Ajoute les **Secrets** ci-dessous.
7. Lance un **Deployment** de type **Reserved VM**. Ce type reste allumé en permanence, ce qui est nécessaire pour les rappels et la suppression automatique des fichiers. Note l'adresse obtenue, par ex. `https://exiozz-shop.replit.app`.

| Secret | Valeur |
|---|---|
| `SESSION_SECRET` | Une longue chaîne au hasard. Dans le Shell : `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `DISCORD_CLIENT_ID` | `1540486396287000626` |
| `DISCORD_CLIENT_SECRET` | Discord Developer Portal → ton application → OAuth2 → Client Secret |
| `DISCORD_REDIRECT_URI` | `https://<ton-serveur>.replit.app/auth/discord` |
| `ADMIN_DISCORD_ID` | `799725583213920276` |
| `FRONT_URL` | `https://exiozz.github.io/portfolio` |
| `USE_REPLIT_STORAGE` | `1` (fichiers dans l'Object Storage) |
| `DISCORD_BOT_TOKEN` | Token d'un bot présent sur ton serveur Discord : c'est lui qui envoie les MP (fichiers prêts, rappels d'abonnement). Sans lui, pas de MP. |
| `DISCORD_ORDERS_WEBHOOK_URL` | *(optionnel)* Webhook d'un salon Discord privé, pour être prévenu de chaque commande et fin d'abonnement |
| `MAX_FILE_MB` | *(optionnel)* Taille max d'un fichier envoyé, 500 Mo par défaut |

Pour que le bot puisse envoyer un MP à un client, ils doivent être sur un **même serveur Discord** (le tien).

### 2. Discord Developer Portal

OAuth2 → Redirects : ajoute `https://<ton-serveur>.replit.app/auth/discord`.

### 3. Vérifier l'import des avis

Ouvre `https://<ton-serveur>.replit.app/api/reviews` : tu dois y voir tes avis. Les logs du serveur affichent aussi `✅ Import de l'ancien serveur : X avis, Y commandes`.

### 4. Brancher le site

Dans `shop.html` **et** `index.html`, remplace `backendAuthUrl` par `https://<ton-serveur>.replit.app/auth/discord`, puis fusionne la branche `serveur` sur `main`. Les clients devront se reconnecter une fois avec Discord.

---

## Utilisation au quotidien

1. Un client commande sur le shop. Tu reçois la commande (et un message si le webhook est configuré).
2. Vous vous arrangez sur Discord pour le paiement.
3. Dans « Mes commandes » (admin), passe la commande en **« Payée »**. Si elle contient l'abonnement, il est activé pour 30 jours. S'il en avait déjà un, les 30 jours s'ajoutent à la suite.
4. Clique **« Ajouter des fichiers »** sous sa commande. Le client est prévenu en MP, il télécharge depuis « Mes commandes », et le fichier disparaît au bout de 24 h.

Passer une commande en « Annulée » retire les jours d'abonnement qu'elle avait donnés.
