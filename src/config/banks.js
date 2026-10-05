// Banks operating in Azerbaijan whose rates the site aggregates.
//
// `ratesUrl` is the page the scraper downloads to read the bank's own
// buy/sell rates. Most Azerbaijani banks show a currency widget on the home
// page; if a bank moves its rates elsewhere, point `ratesUrl` at the new page.
// If scraping a bank keeps failing you can enter its rates by hand in
// data/manual-rates.json instead.
export const BANKS = [
  { id: 'kapital', name: 'Kapital Bank', site: 'https://www.kapitalbank.az', ratesUrl: 'https://www.kapitalbank.az/' },
  { id: 'pasha', name: 'PASHA Bank', site: 'https://www.pashabank.az', ratesUrl: 'https://www.pashabank.az/' },
  { id: 'abb', name: 'ABB', site: 'https://abb-bank.az', ratesUrl: 'https://abb-bank.az/' },
  { id: 'respublika', name: 'Bank Respublika', site: 'https://www.bankrespublika.az', ratesUrl: 'https://www.bankrespublika.az/' },
  { id: 'xalq', name: 'Xalq Bank', site: 'https://www.xalqbank.az', ratesUrl: 'https://www.xalqbank.az/' },
  { id: 'unibank', name: 'Unibank', site: 'https://unibank.az', ratesUrl: 'https://unibank.az/' },
  { id: 'yelo', name: 'Yelo Bank', site: 'https://www.yelo.az', ratesUrl: 'https://www.yelo.az/' },
  { id: 'access', name: 'AccessBank', site: 'https://www.accessbank.az', ratesUrl: 'https://www.accessbank.az/' },
  { id: 'rabita', name: 'Rabitabank', site: 'https://www.rabitabank.com', ratesUrl: 'https://www.rabitabank.com/' },
  { id: 'express', name: 'Expressbank', site: 'https://www.expressbank.az', ratesUrl: 'https://www.expressbank.az/' },
  { id: 'bankofbaku', name: 'Bank of Baku', site: 'https://www.bankofbaku.com', ratesUrl: 'https://www.bankofbaku.com/' },
  { id: 'yapikredi', name: 'Yapı Kredi Azərbaycan', site: 'https://www.yapikredi.com.az', ratesUrl: 'https://www.yapikredi.com.az/' },
  { id: 'turan', name: 'TuranBank', site: 'https://www.turanbank.az', ratesUrl: 'https://www.turanbank.az/' },
  { id: 'ziraat', name: 'Ziraat Bank Azərbaycan', site: 'https://www.ziraatbank.az', ratesUrl: 'https://www.ziraatbank.az/' },
  { id: 'afb', name: 'AFB Bank', site: 'https://www.afb.az', ratesUrl: 'https://www.afb.az/' },
  { id: 'premium', name: 'Premium Bank', site: 'https://www.premiumbank.az', ratesUrl: 'https://www.premiumbank.az/' },
  { id: 'azerturk', name: 'Azər Türk Bank', site: 'https://www.azerturkbank.az', ratesUrl: 'https://www.azerturkbank.az/' },
  { id: 'vtb', name: 'VTB (Azərbaycan)', site: 'https://www.vtb.az', ratesUrl: 'https://www.vtb.az/' },
  { id: 'halyk', name: 'Halyk Bank Azərbaycan', site: 'https://www.halykbank.az', ratesUrl: 'https://www.halykbank.az/' },
  { id: 'btb', name: 'Bank BTB', site: 'https://www.bankbtb.az', ratesUrl: 'https://www.bankbtb.az/' },
  { id: 'avrasiya', name: 'Bank Avrasiya', site: 'https://www.bankavrasiya.az', ratesUrl: 'https://www.bankavrasiya.az/' },
];

// Currencies shown in the exchange table, in display order.
export const CURRENCIES = ['USD', 'EUR', 'RUB', 'GBP', 'TRY', 'GEL', 'CHF'];
