// Synthetic bank rates for DEMO=1 mode, so the site can be previewed without
// internet access. The page shows a clear "demo data" banner in this mode.

function hash(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967295;
}

export function demoBankRates(bankId, official, currencies) {
  const rates = {};
  for (const code of currencies) {
    const ref = official[code];
    if (!ref) continue;
    const spread = 0.003 + hash(bankId + code) * 0.02; // 0.3%–2.3%
    const skew = (hash(code + bankId) - 0.5) * 0.006;
    const r = (n) => Number(n.toPrecision(5));
    rates[code] = { buy: r(ref * (1 - spread + skew)), sell: r(ref * (1 + spread + skew)) };
  }
  return rates;
}

// Approximate official rates for demo mode when CBAR is unreachable.
export const DEMO_OFFICIAL = {
  USD: 1.7,
  EUR: 1.98,
  RUB: 0.0205,
  GBP: 2.28,
  TRY: 0.041,
  GEL: 0.63,
  CHF: 2.12,
};
