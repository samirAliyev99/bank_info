// Builds a static copy of the site into dist/ for GitHub Pages.
//
// GitHub Pages can't run server.js, so a scheduled GitHub Action runs this
// script instead: it fetches all rates once and writes them next to the
// website as plain JSON files that the page reads.
//
//   node scripts/build.js            live data
//   DEMO=1 node scripts/build.js     sample data
//
// PREVIOUS_RATES_URL (optional): URL of the currently published rates.json.
// Banks that fail this run then keep their last good rates, marked stale.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Aggregator } from '../src/aggregator.js';
import { BANKS } from '../src/config/banks.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const DEMO = process.env.DEMO === '1';

const bankNames = Object.fromEntries(BANKS.map((b) => [b.id, b.name]));

async function productList(file) {
  const data = JSON.parse(await fs.readFile(path.join(ROOT, 'data', file), 'utf8'));
  return {
    lastReviewed: data.lastReviewed ?? null,
    indicative: true,
    products: data.products.map((p) => ({ ...p, bankName: bankNames[p.bankId] || p.bankId })),
  };
}

async function previousSnapshot(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const snap = await res.json();
    return snap.demo ? null : snap;
  } catch {
    return null;
  }
}

const aggregator = new Aggregator({ demo: DEMO, cacheFile: null });
aggregator.snapshot = DEMO ? null : await previousSnapshot(process.env.PREVIOUS_RATES_URL);
const rates = await aggregator.refresh();

await fs.rm(DIST, { recursive: true, force: true });
await fs.cp(path.join(ROOT, 'public'), DIST, { recursive: true });
await fs.mkdir(path.join(DIST, 'api'), { recursive: true });
const write = (name, body) => fs.writeFile(path.join(DIST, 'api', name), JSON.stringify(body));
await write('rates.json', { ...rates, static: true });
await write('loans.json', await productList('loans.json'));
await write('deposits.json', await productList('deposits.json'));
await write('banks.json', BANKS);
// Serve files as-is; no Jekyll processing on GitHub Pages.
await fs.writeFile(path.join(DIST, '.nojekyll'), '');

console.log(`Built ${path.relative(ROOT, DIST)}/ with ${rates.banks.length} banks`);
