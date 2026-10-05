# Bank Info AZ

One website that puts all Azerbaijani banks side by side:

- **Currency**: official CBAR rates, each bank's buy/sell rates for USD, EUR, RUB, GBP, TRY, GEL and CHF, the best rate highlighted, a converter that ranks banks by how much you'd get, and a table with every currency at once.
- **Loans**: consumer, mortgage, auto and business loans with a monthly payment calculator.
- **Deposits**: term deposit rates with an interest calculator.

No dependencies. You only need Node.js 18 or newer.

## Run it

```bash
npm start            # live data on http://localhost:3000
npm run demo         # sample data, works offline
npm test
```

Environment variables:

| Variable          | Default | Meaning                                  |
|-------------------|---------|------------------------------------------|
| `PORT`            | `3000`  | HTTP port                                |
| `REFRESH_MINUTES` | `15`    | How often rates are re-fetched           |
| `DEMO`            | unset   | `1` = generated sample bank rates        |

## Where the data comes from

| Data | Source | How it updates |
|------|--------|----------------|
| Official rates | CBAR daily XML (`cbar.az/currencies/DD.MM.YYYY.xml`) | Automatically |
| Bank exchange rates | Each bank's own website (`src/config/banks.js`) | Automatically, scraped |
| Loans | `data/loans.json` | **Edited by hand** |
| Deposits | `data/deposits.json` | **Edited by hand** |

**Bank exchange rates.** Each bank's site has a different layout, so the scraper doesn't use one CSS selector per bank. It finds each currency code on the page and keeps the first two numbers after it that fall within ±12% of the official CBAR rate. That filters out years, phone numbers and similar noise, and it keeps working when a bank redesigns its site. It also reads rates that are only in JSON inside `<script>` tags. If a bank fails:

- its last good rates are kept and marked **stale**, or the bank shows **unavailable**;
- set `ratesUrl` in `src/config/banks.js` to the bank's actual rates page, or
- type the rates into `data/manual-rates.json`. Manual rates override the scraper and show as **manual**:

  ```json
  { "banks": { "kapital": { "USD": { "buy": 1.695, "sell": 1.705 } } } }
  ```

**Loans and deposits.** Banks don't publish these in a machine-readable form. The numbers in `data/loans.json` and `data/deposits.json` are **indicative sample figures** and the site labels them that way. Check each product on the bank's website, update the numbers, and set `lastReviewed`.

## API

| Endpoint | Returns |
|----------|---------|
| `GET /api/rates` | Latest snapshot: official rates, each bank's rates and status, best buy/sell per currency |
| `POST /api/refresh` | Re-fetch now (at most once a minute) |
| `GET /api/loans` | Loan products |
| `GET /api/deposits` | Deposit products |
| `GET /api/banks` | Configured bank list |

## Layout

```
server.js                  HTTP server, API, static files, refresh timer
src/config/banks.js        Banks and currencies
src/sources/cbar.js        Central Bank XML fetch and parse
src/sources/bankScraper.js Bank page rate extraction
src/aggregator.js          Refresh cycle, caching, best-rate calculation
src/demo.js                Sample rates for demo mode
data/                      Loans, deposits, manual rates (cache/ is generated)
public/                    The website (HTML/CSS/JS)
test/                      node:test unit tests
```
