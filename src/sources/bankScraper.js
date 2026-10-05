// Reads a bank's own buy/sell rates from its web page.
//
// Every bank lays out its currency widget differently and redesigns it
// without notice, so instead of one fragile CSS selector per bank this uses a
// layout-independent heuristic: find each currency code in the page, take the
// numbers that follow it, and keep the first two that are within a sane band
// around the official CBAR rate. That rejects years, phone numbers, version
// strings and so on, and keeps working through most redesigns.

const WINDOW_CHARS = 260; // how far after a currency code to look for numbers
const BAND = 0.12; // a bank rate must be within ±12% of the official rate
const MAX_SPREAD = 0.15; // sell − buy may be at most 15% of the official rate

const NUMBER_RE = /(?<![\d.,])(\d{1,5}[.,]\d{1,6})(?![\d]|[.,]\d)/g;

export function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

function plausible(n, official) {
  if (n >= official * (1 - BAND) && n <= official * (1 + BAND)) return n;
  // Some banks quote small currencies (RUB, TRY…) per 100 or per 10 units.
  for (const unit of [100, 10]) {
    const v = n / unit;
    if (v >= official * (1 - BAND) && v <= official * (1 + BAND)) return v;
  }
  return null;
}

function pairAfter(text, index, official) {
  const window = text.slice(index, index + WINDOW_CHARS);
  const found = [];
  for (const m of window.matchAll(NUMBER_RE)) {
    const v = plausible(parseFloat(m[1].replace(',', '.')), official);
    if (v !== null) found.push(v);
    if (found.length === 2) break;
  }
  if (found.length < 2) return null;
  const buy = Math.min(...found);
  const sell = Math.max(...found);
  if (sell - buy > official * MAX_SPREAD) return null;
  return { buy: round(buy), sell: round(sell) };
}

function round(n) {
  return Math.round(n * 1e6) / 1e6;
}

function extractFrom(text, official, currencies) {
  const rates = {};
  for (const code of currencies) {
    const ref = official[code];
    if (!ref) continue;
    const codeRe = new RegExp(`(?<![A-Za-z])${code}(?![A-Za-z])`, 'g');
    for (const m of text.matchAll(codeRe)) {
      const pair = pairAfter(text, m.index + code.length, ref);
      if (pair) {
        rates[code] = pair;
        break;
      }
    }
  }
  return rates;
}

// official: { USD: 1.7, ... } AZN per unit, used as the sanity reference.
export function extractRates(html, official, currencies) {
  // Visible text first; then the raw HTML, which catches rates that are only
  // present as JSON inside a <script> (Next.js / Nuxt sites and the like).
  const rates = extractFrom(htmlToText(html), official, currencies);
  const missing = currencies.filter((c) => !rates[c]);
  if (missing.length) Object.assign(rates, extractFrom(html, official, missing));
  return rates;
}

export async function fetchBankRates(bank, official, currencies, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(bank.ratesUrl, {
    signal: AbortSignal.timeout(20000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; bank-info-az/1.0; +rates aggregator)',
      'Accept-Language': 'az,en;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rates = extractRates(await res.text(), official, currencies);
  if (!Object.keys(rates).length) throw new Error('no rates found on page');
  return rates;
}
