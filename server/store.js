'use strict';
// Stockage clé → valeur JSON.
// - Sur Replit : utilise la base « Key-Value Store » (variable REPLIT_DB_URL fournie par Replit).
// - En local : un fichier server/data.json (ignoré par git).
const fs = require('fs');
const path = require('path');

const DB_URL = process.env.REPLIT_DB_URL || '';
const FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');

let fileCache = null;
function loadFile() {
  if (fileCache) return fileCache;
  try { fileCache = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { fileCache = {}; }
  return fileCache;
}

async function get(key, fallback = null) {
  if (DB_URL) {
    const res = await fetch(`${DB_URL}/${encodeURIComponent(key)}`);
    if (res.status === 404) return fallback;
    if (!res.ok) throw new Error(`Base de données : lecture impossible (${res.status})`);
    const text = await res.text();
    if (!text) return fallback;
    try { return JSON.parse(text); } catch (e) { return fallback; }
  }
  const data = loadFile();
  return key in data ? JSON.parse(JSON.stringify(data[key])) : fallback;
}

async function set(key, value) {
  if (DB_URL) {
    const res = await fetch(DB_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `${encodeURIComponent(key)}=${encodeURIComponent(JSON.stringify(value))}`
    });
    if (!res.ok) throw new Error(`Base de données : écriture impossible (${res.status})`);
    return;
  }
  const data = loadFile();
  data[key] = value;
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

// Les modifications d'une même clé passent l'une après l'autre,
// pour que deux requêtes simultanées n'écrasent pas leurs changements.
const queues = new Map();
function update(key, fallback, fn) {
  const prev = queues.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(async () => {
    const current = await get(key, fallback);
    const result = await fn(current);
    await set(key, result === undefined ? current : result);
    return result === undefined ? current : result;
  });
  queues.set(key, next);
  next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => {});
  return next;
}

module.exports = { get, set, update, backend: DB_URL ? 'replit-db' : 'fichier ' + FILE };
