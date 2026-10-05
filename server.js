import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Aggregator } from './src/aggregator.js';
import { BANKS } from './src/config/banks.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');

const PORT = Number(process.env.PORT) || 3000;
const REFRESH_MINUTES = Number(process.env.REFRESH_MINUTES) || 15;
const DEMO = process.env.DEMO === '1';
const MIN_MANUAL_REFRESH_MS = 60_000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

const bankNames = Object.fromEntries(BANKS.map((b) => [b.id, b.name]));
const aggregator = new Aggregator({ demo: DEMO });
let lastManualRefresh = 0;

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function productList(file) {
  const data = JSON.parse(await fs.readFile(path.join(DATA_DIR, file), 'utf8'));
  return {
    lastReviewed: data.lastReviewed ?? null,
    indicative: true,
    products: data.products.map((p) => ({ ...p, bankName: bankNames[p.bankId] || p.bankId })),
  };
}

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  try {
    if (pathname === '/api/rates' && req.method === 'GET') {
      const snapshot = aggregator.snapshot || (await aggregator.refresh());
      return sendJson(res, 200, snapshot);
    }
    if (pathname === '/api/refresh' && req.method === 'POST') {
      const now = Date.now();
      if (now - lastManualRefresh < MIN_MANUAL_REFRESH_MS) {
        return sendJson(res, 429, { error: 'Rates were refreshed less than a minute ago.' });
      }
      lastManualRefresh = now;
      return sendJson(res, 200, await aggregator.refresh());
    }
    if (pathname === '/api/loans' && req.method === 'GET') return sendJson(res, 200, await productList('loans.json'));
    if (pathname === '/api/deposits' && req.method === 'GET') return sendJson(res, 200, await productList('deposits.json'));
    if (pathname === '/api/banks' && req.method === 'GET') return sendJson(res, 200, BANKS);
    if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end();
    return serveStatic(req, res);
  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { error: 'Internal error' });
  }
});

await aggregator.init();
aggregator.refresh().catch((err) => console.error('Initial refresh failed:', err));
setInterval(() => aggregator.refresh().catch((err) => console.error('Refresh failed:', err)), REFRESH_MINUTES * 60_000).unref();

server.listen(PORT, () => {
  console.log(`Bank Info AZ running on http://localhost:${PORT}${DEMO ? ' (DEMO data)' : ''}`);
});
