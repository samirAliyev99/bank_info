import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractRates } from '../src/sources/bankScraper.js';

const OFFICIAL = { USD: 1.7, EUR: 1.98, RUB: 0.0205, GBP: 2.28 };
const CURRENCIES = ['USD', 'EUR', 'RUB', 'GBP'];

test('reads a classic HTML table', () => {
  const html = `<table>
    <tr><th>Valyuta</th><th>Alış</th><th>Satış</th></tr>
    <tr><td>USD</td><td>1.6950</td><td>1.7050</td></tr>
    <tr><td>EUR</td><td>1.9500</td><td>2.0100</td></tr>
    <tr><td>RUB</td><td>0.0190</td><td>0.0220</td></tr>
  </table>`;
  assert.deepEqual(extractRates(html, OFFICIAL, CURRENCIES), {
    USD: { buy: 1.695, sell: 1.705 },
    EUR: { buy: 1.95, sell: 2.01 },
    RUB: { buy: 0.019, sell: 0.022 },
  });
});

test('ignores years, phone numbers and version strings near the code', () => {
  const html = `<div>USD <span>2026</span> call 196 1.7.3 <b>1,6960</b> <b>1,7040</b></div>`;
  assert.deepEqual(extractRates(html, OFFICIAL, ['USD']), { USD: { buy: 1.696, sell: 1.704 } });
});

test('handles rates quoted per 100 units', () => {
  const html = `<div class="row"><i>100 RUB</i><span>1.95</span><span>2.20</span></div>`;
  assert.deepEqual(extractRates(html, OFFICIAL, ['RUB']), { RUB: { buy: 0.0195, sell: 0.022 } });
});

test('swaps a sell-first layout into buy/sell', () => {
  const html = `<p>EUR: satış 2.0100 / alış 1.9500</p>`;
  assert.deepEqual(extractRates(html, OFFICIAL, ['EUR']), { EUR: { buy: 1.95, sell: 2.01 } });
});

test('falls back to JSON embedded in scripts', () => {
  const html = `<div id="app"></div><script>window.__DATA__={"rates":[{"code":"USD","buy":1.6955,"sell":1.7045},{"code":"GBP","buy":2.21,"sell":2.33}]}</script>`;
  assert.deepEqual(extractRates(html, OFFICIAL, CURRENCIES), {
    USD: { buy: 1.6955, sell: 1.7045 },
    GBP: { buy: 2.21, sell: 2.33 },
  });
});

test('does not match currency codes inside words and rejects absurd numbers', () => {
  const html = `<p>BUSDX 1.69 1.71</p><p>USD 5.00 9.00</p>`;
  assert.deepEqual(extractRates(html, OFFICIAL, ['USD']), {});
});
