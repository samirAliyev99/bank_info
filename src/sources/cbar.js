// Official rates from the Central Bank of the Republic of Azerbaijan (CBAR).
// CBAR publishes one XML file per day at cbar.az/currencies/DD.MM.YYYY.xml.

const CBAR_URL = 'https://www.cbar.az/currencies/';

export function cbarUrlFor(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${CBAR_URL}${dd}.${mm}.${date.getFullYear()}.xml`;
}

// Returns { date, rates: { USD: 1.7, ... } } where each rate is AZN per 1 unit.
export function parseCbarXml(xml) {
  const date = (xml.match(/<ValCurs[^>]*\bDate="([^"]+)"/) || [])[1] || null;
  const rates = {};
  const valuteRe = /<Valute\s+Code="([A-Z]{3})"[^>]*>([\s\S]*?)<\/Valute>/g;
  let m;
  while ((m = valuteRe.exec(xml))) {
    const [, code, body] = m;
    const nominalText = (body.match(/<Nominal>([^<]*)<\/Nominal>/) || [])[1] || '1';
    const valueText = (body.match(/<Value>([^<]*)<\/Value>/) || [])[1];
    const nominal = parseFloat(nominalText.replace(',', '.')) || 1;
    const value = parseFloat((valueText || '').replace(',', '.'));
    if (Number.isFinite(value) && value > 0) rates[code] = value / nominal;
  }
  return { date, rates };
}

export async function fetchCbarRates({ fetchImpl = fetch, now = new Date() } = {}) {
  // Today's file is published in the morning; fall back a few days for
  // weekends and holidays.
  let lastError;
  for (let back = 0; back < 5; back++) {
    const d = new Date(now);
    d.setDate(d.getDate() - back);
    try {
      const res = await fetchImpl(cbarUrlFor(d), { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`CBAR HTTP ${res.status}`);
      const parsed = parseCbarXml(await res.text());
      if (parsed.rates.USD) return parsed;
      throw new Error('CBAR XML had no USD rate');
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
