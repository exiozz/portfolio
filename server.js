// server.js — Backend OAuth Discord pour le portfolio
// -----------------------------------------------------
// À héberger séparément du site (ex: Render, Railway, Vercel Functions, VPS).
// Ce serveur reçoit le "code" renvoyé par Discord, l'échange contre un token,
// récupère le profil de l'utilisateur, puis redirige vers ton portfolio
// avec les infos en paramètres d'URL.

const express = require('express');
const fetch = require('node-fetch'); // npm install node-fetch@2
require('dotenv').config();

const app = express();

// ---- Configuration (mets ces valeurs dans un fichier .env) ----
// DISCORD_CLIENT_ID=...
// DISCORD_CLIENT_SECRET=...
// DISCORD_REDIRECT_URI=https://ton-backend.exemple.com/auth/discord
// FRONTEND_URL=https://ton-portfolio.exemple.com
// PORT=3000

const {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI,
  FRONTEND_URL,
  PORT = 3000
} = process.env;

app.get('/auth/discord', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.redirect(`${FRONTEND_URL}?error=no_code`);
  }

  try {
    // 1) Échanger le code contre un access token
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: DISCORD_REDIRECT_URI,
        scope: 'identify'
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error('Erreur token Discord:', tokenData);
      return res.redirect(`${FRONTEND_URL}?error=token_failed`);
    }

    // 2) Récupérer le profil utilisateur
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const user = await userRes.json();

    const avatarUrl = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
      : 'https://cdn.discordapp.com/embed/avatars/0.png';

    // 3) Rediriger vers le portfolio avec les infos utilisateur
    const redirectParams = new URLSearchParams({
      discord_id: user.id,
      discord_user: user.username,
      discord_avatar: avatarUrl
    });

    res.redirect(`${FRONTEND_URL}?${redirectParams.toString()}`);
  } catch (err) {
    console.error(err);
    res.redirect(`${FRONTEND_URL}?error=server_error`);
  }
});

app.listen(PORT, () => {
  console.log(`Serveur OAuth Discord lancé sur le port ${PORT}`);
});
