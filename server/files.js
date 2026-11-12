'use strict';
// Stockage des fichiers livrés aux clients.
// - Sur Replit avec l'outil « Object Storage » activé (secret USE_REPLIT_STORAGE=1) : stockage durable.
// - Sinon : dossier server/files (perdu à chaque redéploiement : à utiliser seulement pour tester).
const fs = require('fs');
const path = require('path');

const DIR = process.env.FILES_DIR || path.join(__dirname, 'files');
const useReplit = process.env.USE_REPLIT_STORAGE === '1';
let client = null;
if (useReplit) {
  const { Client } = require('@replit/object-storage');
  client = new Client();
}
const key = (id) => 'files/' + String(id).replace(/[^a-z0-9]/gi, '');
const check = (r, what) => { if (r && r.ok === false) throw new Error(`${what} : ${r.error && r.error.message || r.error}`); return r && 'value' in r ? r.value : r; };

async function save(id, tmpPath) {
  if (client) return check(await client.uploadFromFilename(key(id), tmpPath), 'Envoi du fichier');
  await fs.promises.mkdir(DIR, { recursive: true });
  await fs.promises.copyFile(tmpPath, path.join(DIR, key(id).replace('files/', '')));
}

async function stream(id) {
  if (client) return client.downloadAsStream(key(id));
  return fs.createReadStream(path.join(DIR, key(id).replace('files/', '')));
}

async function remove(id) {
  if (client) return check(await client.delete(key(id), { ignoreNotFound: true }), 'Suppression du fichier');
  await fs.promises.rm(path.join(DIR, key(id).replace('files/', '')), { force: true });
}

module.exports = { save, stream, remove, backend: client ? 'Replit Object Storage' : 'dossier ' + DIR };
