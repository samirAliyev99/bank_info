import fs from 'node:fs/promises';
import path from 'node:path';
import { BANKS, CURRENCIES } from './config/banks.js';
import { fetchCbarRates } from './sources/cbar.js';
import { fetchBankRates } from './sources/bankScraper.js';
import { fileURLToPath } from 'node:url';
import { demoBankRates, DEMO_OFFICIAL } from './demo.js';

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const CACHE_FILE = path.join(DATA_DIR, 'cache', 'rates.json');
const MANUAL_FILE = path.join(DATA_DIR, 'manual-rates.json');
const CONCURRENCY = 6;

// The manat has been pegged at 1.70 per USD since 2017; used only when CBAR
// cannot be reached and nothing is cached yet.
const FALLBACK_OFFICIAL = { USD: 1.7 };

export function computeBest(banks, currencies) {
  const best = {};
  for (const code of currencies) {
    let buy = null;
    let sell = null;
    for (const bank of banks) {
      const r = bank.rates?.[code];
      if (!r) continue;
      // Customer sells currency to the bank: the highest bank buy rate wins.
      if (!buy || r.buy > buy.value) buy = { bankId: bank.id, value: r.buy };
      // Customer buys currency from the bank: the lowest bank sell rate wins.
      if (!sell || r.sell < sell.value) sell = { bankId: bank.id, value: r.sell };
    }
    if (buy || sell) best[code] = { buy, sell };
  }
  return best;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export class Aggregator {
  constructor({
    demo = false,
    banks = BANKS,
    currencies = CURRENCIES,
    fetchImpl = fetch,
    log = console,
    cacheFile = demo ? null : CACHE_FILE, // null disables the on-disk cache
    manualFile = MANUAL_FILE,
  } = {}) {
    this.demo = demo;
    this.cacheFile = cacheFile;
    this.manualFile = manualFile;
    this.banks = banks;
    this.currencies = currencies;
    this.fetchImpl = fetchImpl;
    this.log = log;
    this.snapshot = null;
    this.refreshing = null;
  }

  async init() {
    if (!this.cacheFile) return;
    const cached = await readJson(this.cacheFile, null);
    if (cached) this.snapshot = cached;
  }

  refresh() {
    // Collapse concurrent refresh requests into one.
    if (!this.refreshing) {
      this.refreshing = this.#doRefresh().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  async #officialRates() {
    try {
      const { date, rates } = await fetchCbarRates({ fetchImpl: this.fetchImpl });
      return { date, rates, source: 'cbar' };
    } catch (err) {
      this.log.warn?.(`CBAR fetch failed: ${err.message}`);
      if (this.snapshot?.official?.rates) return { ...this.snapshot.official, source: 'cache' };
      return { date: null, rates: { ...(this.demo ? DEMO_OFFICIAL : FALLBACK_OFFICIAL) }, source: 'fallback' };
    }
  }

  async #doRefresh() {
    const startedAt = new Date().toISOString();
    const official = await this.#officialRates();
    const manual = ((this.manualFile ? await readJson(this.manualFile, {}) : {})).banks || {};
    const previous = new Map((this.snapshot?.banks || []).map((b) => [b.id, b]));

    const banks = await mapLimit(this.banks, CONCURRENCY, async (bank) => {
      const base = { id: bank.id, name: bank.name, site: bank.site };
      if (manual[bank.id] && Object.keys(manual[bank.id]).length) {
        return { ...base, status: 'manual', rates: manual[bank.id], fetchedAt: startedAt };
      }
      if (this.demo) {
        return { ...base, status: 'demo', rates: demoBankRates(bank.id, official.rates, this.currencies), fetchedAt: startedAt };
      }
      try {
        const rates = await fetchBankRates(bank, official.rates, this.currencies, { fetchImpl: this.fetchImpl });
        return { ...base, status: 'ok', rates, fetchedAt: startedAt };
      } catch (err) {
        const prev = previous.get(bank.id);
        if (prev?.rates && Object.keys(prev.rates).length) {
          // Keep showing the last good numbers, marked as stale.
          return { ...base, status: 'stale', rates: prev.rates, fetchedAt: prev.fetchedAt, error: err.message };
        }
        return { ...base, status: 'error', rates: {}, fetchedAt: null, error: err.message };
      }
    });

    const snapshot = {
      updatedAt: startedAt,
      demo: this.demo,
      currencies: this.currencies,
      official,
      banks,
      best: computeBest(banks, this.currencies),
    };
    this.snapshot = snapshot;

    const ok = banks.filter((b) => b.status === 'ok' || b.status === 'manual' || b.status === 'demo').length;
    this.log.info?.(`Rates refreshed: ${ok}/${banks.length} banks, official source: ${official.source}`);

    if (this.cacheFile) {
      try {
        await fs.mkdir(path.dirname(this.cacheFile), { recursive: true });
        await fs.writeFile(this.cacheFile, JSON.stringify(snapshot, null, 2));
      } catch (err) {
        this.log.warn?.(`Could not write rate cache: ${err.message}`);
      }
    }
    return snapshot;
  }
}
