const express = require('express');
const path = require('path');
const scraper = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ensure avatar is downloaded locally to public/assets/sda.png for reliability
const fs = require('fs');
const https = require('https');
const ASSET_DIR = path.join(__dirname, 'public', 'assets');
const AVATAR_URL = 'https://raw.githubusercontent.com/mraiko23/chickenfriertest/refs/heads/main/sda.png';
const AVATAR_LOCAL = path.join(ASSET_DIR, 'sda.png');
async function ensureAvatar() {
  try {
    if (!fs.existsSync(ASSET_DIR)) fs.mkdirSync(ASSET_DIR, { recursive: true });
    if (fs.existsSync(AVATAR_LOCAL)) return;
    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(AVATAR_LOCAL);
      https.get(AVATAR_URL, res => {
        if (res.statusCode !== 200) return reject(new Error('avatar fetch ' + res.statusCode));
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
      }).on('error', err => reject(err));
    });
    console.log('avatar downloaded to public/assets/sda.png');
  } catch (e) {
    console.error('avatar download failed', e && e.message);
  }
}
ensureAvatar();

// in-memory cache of last stock
let lastStock = { seeds: [], gear: [], lastUpdated: null };

// previous seen item names (lowercase) used to detect newly appeared items
let prevNames = new Set();

function getAllNames(stock) {
  const s = new Set();
  (stock.seeds || []).forEach(i => { if (i && i.name) s.add(i.name.toLowerCase()); });
  (stock.gear || []).forEach(i => { if (i && i.name) s.add(i.name.toLowerCase()); });
  return s;
}

function findItemByName(stock, nameLower) {
  const all = [...(stock.seeds || []), ...(stock.gear || [])];
  return all.find(i => i && i.name && i.name.toLowerCase() === nameLower) || null;
}

// SSE clients: map clientId -> response
const sseClients = new Map();
// client watches: clientId -> Set of item names (removed; client-side follow removed)
// const watchedItems = new Map();

function broadcastStock(stock) {
  const payload = JSON.stringify(stock);
  for (const res of sseClients.values()) {
    try {
      res.write(`data: ${payload}\n\n`);
    } catch (e) {
      // ignore
    }
  }
}

// sendAlertToClient removed (no per-client watch over API)

// expose API
app.get('/api/stock', (req, res) => {
  res.json(lastStock);
});

// subscribe to alerts for an item (simple POST { clientId, itemName })
// watch API removed; client-side follow removed

// endpoint to force refresh
app.post('/api/refresh', async (req, res) => {
  try {
    const data = await scraper.fetchStock({ force: true });
    if (data) {
      lastStock = { seeds: data.seeds || [], gear: data.gear || [], lastUpdated: new Date().toISOString() };
      broadcastStock(lastStock);
      return res.json(lastStock);
    }
    return res.json(lastStock);
  } catch (err) {
    console.error('refresh error', err);
    return res.status(500).json({ error: 'refresh failed' });
  }
});

// SSE stream for realtime updates
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();
  // client provides clientId via query for watch mapping
  const clientId = req.query.clientId || Math.random().toString(36).slice(2,10);
  // send current state immediately
  res.write(`data: ${JSON.stringify(lastStock)}\n\n`);

  sseClients.set(clientId, res);
  req.on('close', () => {
    sseClients.delete(clientId);
  });
  // also send clientId so frontend can register watches
  res.write(`event: clientId\n`);
  res.write(`data: ${JSON.stringify({ clientId })}\n\n`);
});

// periodically update
async function periodicUpdate() {
  try {
    const data = await scraper.fetchStock();
    if (data) {
      const newStock = { seeds: data.seeds || [], gear: data.gear || [], lastUpdated: new Date().toISOString() };
      try { console.log(`periodic: usedPuppeteer=${!!data.usedPuppeteer} seeds=${newStock.seeds.length} gear=${newStock.gear.length}`); } catch (e) {}

      // update prevNames snapshot for change detection
      const newNames = getAllNames(newStock);
      prevNames = newNames;
      lastStock = newStock;
      broadcastStock(lastStock);
    }
  } catch (err) {
    console.error('periodic update failed', err);
  }
}

// start frequent checks (every 5s) using conditional requests for near-instant updates
setInterval(periodicUpdate, 5 * 1000);
// run once at start (force)
(async () => {
  try {
    const data = await scraper.fetchStock({ force: true });
    if (data) {
      lastStock = { seeds: data.seeds || [], gear: data.gear || [], lastUpdated: new Date().toISOString() };
    }
  } catch (err) {
    console.error('initial fetch failed', err);
  }
})();

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

