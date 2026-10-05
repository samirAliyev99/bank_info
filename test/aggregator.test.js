import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Aggregator, computeBest } from '../src/aggregator.js';

test('computeBest picks highest buy and lowest sell', () => {
  const best = computeBest([
    { id: 'a', rates: { USD: { buy: 1.69, sell: 1.71 } } },
    { id: 'b', rates: { USD: { buy: 1.695, sell: 1.708 } } },
    { id: 'c', rates: {} },
  ], ['USD', 'EUR']);
  assert.deepEqual(best, { USD: { buy: { bankId: 'b', value: 1.695 }, sell: { bankId: 'b', value: 1.708 } } });
});

test('aggregates CBAR and bank pages, marking failures', async () => {
  const pages = {
    'https://a.test/': '<td>USD</td><td>1.6950</td><td>1.7050</td>',
    'https://b.test/': '<p>nothing useful</p>',
  };
  const fetchImpl = async (url) => {
    if (url.includes('cbar.az')) {
      return new Response('<ValCurs Date="03.10.2026"><Valute Code="USD"><Nominal>1</Nominal><Value>1.7</Value></Valute></ValCurs>');
    }
    if (pages[url]) return new Response(pages[url]);
    return new Response('down', { status: 503 });
  };
  const agg = new Aggregator({
    banks: [
      { id: 'a', name: 'A', site: 'https://a.test', ratesUrl: 'https://a.test/' },
      { id: 'b', name: 'B', site: 'https://b.test', ratesUrl: 'https://b.test/' },
    ],
    currencies: ['USD'],
    fetchImpl,
    log: {},
    cacheFile: null,
    manualFile: null,
  });
  const snap = await agg.refresh();
  assert.equal(snap.official.source, 'cbar');
  assert.equal(snap.official.rates.USD, 1.7);
  const [a, b] = snap.banks;
  assert.equal(a.status, 'ok');
  assert.deepEqual(a.rates.USD, { buy: 1.695, sell: 1.705 });
  assert.equal(b.status, 'error');
  assert.equal(snap.best.USD.sell.bankId, 'a');
});
