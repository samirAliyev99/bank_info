const $ = (sel) => document.querySelector(sel);

const state = { rates: null, loans: null, deposits: null };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n, digits = Math.abs(n) < 0.1 ? 5 : 4) => (n == null ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }));
const money = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const STATUS_LABEL = { ok: 'live', stale: 'stale', manual: 'manual', demo: 'demo', error: 'unavailable' };

function remember(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}
function recall(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

/* ---------- tabs ---------- */
function showTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.tab-panel').forEach((p) => { p.hidden = p.id !== `tab-${name}`; });
  remember('tab', name);
  if (name === 'loans' && !state.loans) loadLoans();
  if (name === 'deposits' && !state.deposits) loadDeposits();
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

/* ---------- currency ---------- */
async function loadRates(force = false) {
  const btn = $('#refresh');
  btn.disabled = true;
  try {
    // On GitHub Pages (static build) rates are re-collected on a schedule, so
    // "Refresh" just reloads the latest published file.
    const live = force && !state.rates?.static;
    const res = live
      ? await fetch('api/refresh', { method: 'POST' })
      : await fetch(`api/rates.json${force ? `?t=${Date.now()}` : ''}`, { cache: force ? 'no-store' : 'default' });
    if (res.status === 429) {
      $('#updated').textContent = 'Rates were refreshed less than a minute ago — try again shortly.';
      return;
    }
    state.rates = await res.json();
    initCurrencySelects();
    renderRates();
  } catch (err) {
    $('#updated').textContent = `Could not load rates: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

function initCurrencySelects() {
  const { currencies } = state.rates;
  const fill = (sel, list, preferred) => {
    const current = sel.value || preferred;
    sel.innerHTML = list.map((c) => `<option>${c}</option>`).join('');
    sel.value = list.includes(current) ? current : list[0];
  };
  fill($('#rate-currency'), currencies, recall('rateCurrency') || 'USD');
  fill($('#conv-from'), ['AZN', ...currencies], 'AZN');
  fill($('#conv-to'), ['AZN', ...currencies], 'USD');
}

function renderRates() {
  const data = state.rates;
  $('#demo-banner').hidden = !data.demo;

  // Official
  const off = data.official;
  const sourceNote = data.demo && off.source === 'fallback'
    ? 'approximate values (demo)'
    : { cbar: '', cache: ' · CBAR unreachable, showing last saved', fallback: ' · CBAR unreachable, USD peg only' }[off.source] || '';
  $('#official-date').textContent = `${off.date ? `as of ${off.date}` : ''}${sourceNote}`;
  $('#official-list').innerHTML = data.currencies
    .filter((c) => off.rates[c])
    .map((c) => `<div class="official-item"><div class="code">${c}</div><div class="val">${fmt(off.rates[c])}</div></div>`)
    .join('');

  renderBankTable();
  renderMatrix();
  renderConverter();
  const live = data.banks.filter((b) => b.status !== 'error').length;
  $('#updated').textContent = `Updated ${new Date(data.updatedAt).toLocaleString()} · ${live} of ${data.banks.length} banks reporting${data.static ? ' · re-collected every 30 minutes' : ''}`;
}

function renderBankTable() {
  const data = state.rates;
  const code = $('#rate-currency').value;
  const sort = $('#rate-sort').value;
  const best = data.best[code] || {};
  const rows = data.banks.map((b) => ({ bank: b, r: b.rates[code] }));
  const key = {
    sell: (x) => x.r?.sell ?? Infinity,
    buy: (x) => -(x.r?.buy ?? -Infinity),
    spread: (x) => (x.r ? x.r.sell - x.r.buy : Infinity),
  }[sort];
  rows.sort(key ? (a, b) => key(a) - key(b) || a.bank.name.localeCompare(b.bank.name) : (a, b) => a.bank.name.localeCompare(b.bank.name));

  $('#rates-body').innerHTML = rows.map(({ bank, r }) => {
    const isBestBuy = r && best.buy && r.buy === best.buy.value;
    const isBestSell = r && best.sell && r.sell === best.sell.value;
    const title = bank.error ? ` title="${esc(bank.error)}"` : '';
    return `<tr>
      <td><a href="${esc(bank.site)}" target="_blank" rel="noopener">${esc(bank.name)}</a></td>
      <td class="num ${isBestBuy ? 'best' : ''}">${fmt(r?.buy)}</td>
      <td class="num ${isBestSell ? 'best' : ''}">${fmt(r?.sell)}</td>
      <td class="num">${r ? fmt(r.sell - r.buy, r.sell < 0.1 ? 5 : 4) : '—'}</td>
      <td><span class="status ${bank.status}"${title}>${STATUS_LABEL[bank.status] || bank.status}</span></td>
    </tr>`;
  }).join('');
}

function renderMatrix() {
  const data = state.rates;
  const banks = data.banks.filter((b) => Object.keys(b.rates).length);
  const head = `<thead><tr><th>Bank</th>${data.currencies.map((c) => `<th class="num">${c}<br><span class="muted small">buy / sell</span></th>`).join('')}</tr></thead>`;
  const body = banks.map((b) => `<tr><td>${esc(b.name)}</td>${data.currencies.map((c) => {
    const r = b.rates[c];
    if (!r) return '<td class="num muted">—</td>';
    const best = data.best[c] || {};
    const cls = (r.buy === best.buy?.value || r.sell === best.sell?.value) ? 'best' : '';
    return `<td class="num pair ${cls}"><span>${fmt(r.buy)}</span><span>${fmt(r.sell)}</span></td>`;
  }).join('')}</tr>`).join('');
  $('#matrix').innerHTML = head + `<tbody>${body || `<tr><td colspan="${data.currencies.length + 1}" class="muted">No bank rates available yet.</td></tr>`}</tbody>`;
}

// What `amount` of `from` turns into at each bank, best first.
function convert(amount, from, to) {
  if (!state.rates || !(amount > 0) || from === to) return [];
  return state.rates.banks.map((b) => {
    const rf = b.rates[from];
    const rt = b.rates[to];
    let out = null;
    if (from === 'AZN' && rt) out = amount / rt.sell;
    else if (to === 'AZN' && rf) out = amount * rf.buy;
    else if (rf && rt) out = (amount * rf.buy) / rt.sell;
    return out == null ? null : { bank: b, out };
  }).filter(Boolean).sort((a, b) => b.out - a.out);
}

function renderConverter() {
  const amount = parseFloat($('#conv-amount').value);
  const from = $('#conv-from').value;
  const to = $('#conv-to').value;
  const results = convert(amount, from, to);
  const off = state.rates?.official.rates || {};
  const azn = (c) => (c === 'AZN' ? 1 : off[c]);
  const officialOut = azn(from) && azn(to) && amount > 0 && from !== to ? (amount * azn(from)) / azn(to) : null;

  $('#conv-results').innerHTML = results.length
    ? results.map((x, i) => `<li class="${i === 0 ? 'top' : ''}"><span>${esc(x.bank.name)}</span><span>${money(x.out)} ${to}</span></li>`).join('')
      + (officialOut ? `<li><span class="muted">CBAR official</span><span class="muted">${money(officialOut)} ${to}</span></li>` : '')
    : `<li class="empty">${from === to ? 'Pick two different currencies.' : 'No bank quotes for this pair yet.'}</li>`;
}

$('#rate-currency').addEventListener('change', (e) => { remember('rateCurrency', e.target.value); renderBankTable(); });
$('#rate-sort').addEventListener('change', renderBankTable);
$('#refresh').addEventListener('click', () => loadRates(true));
['#conv-amount', '#conv-from', '#conv-to'].forEach((s) => $(s).addEventListener('input', renderConverter));
$('#conv-swap').addEventListener('click', () => {
  const f = $('#conv-from').value;
  $('#conv-from').value = $('#conv-to').value;
  $('#conv-to').value = f;
  renderConverter();
});

/* ---------- loans ---------- */
async function loadLoans() {
  state.loans = await (await fetch('api/loans.json')).json();
  renderLoans();
}

function annuity(principal, annualRatePct, months) {
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - (1 + r) ** -months);
}

function renderLoans() {
  if (!state.loans) return;
  const amount = parseFloat($('#loan-amount').value) || 0;
  const term = parseInt($('#loan-term').value, 10) || 0;
  const type = $('#loan-type').value;
  const rows = state.loans.products
    .filter((p) => type === 'all' || p.type === type)
    .map((p) => {
      const fits = amount > 0 && term > 0 && amount <= p.maxAmount && term <= p.maxTermMonths;
      const monthly = amount > 0 && term > 0 ? annuity(amount, p.rateMin, term) : null;
      return { p, fits, monthly };
    })
    .sort((a, b) => (b.fits - a.fits) || (a.p.rateMin - b.p.rateMin));

  $('#loans-body').innerHTML = rows.map(({ p, fits, monthly }, i) => `<tr class="${fits ? '' : 'dim'}">
    <td><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.bankName)}</a></td>
    <td>${esc(p.name)} <span class="muted small">${esc(p.type)}</span></td>
    <td class="num ${fits && i === 0 ? 'best' : ''}">${p.rateMin}–${p.rateMax}</td>
    <td class="num">${money(p.maxAmount)} ₼</td>
    <td class="num">${p.maxTermMonths} mo</td>
    <td class="num">${monthly ? `${money(monthly)} ₼` : '—'}</td>
    <td class="num">${monthly ? `${money(monthly * term - amount)} ₼` : '—'}</td>
  </tr>`).join('') || '<tr><td colspan="7" class="muted">No products of this type.</td></tr>';
}
['#loan-amount', '#loan-term', '#loan-type'].forEach((s) => $(s).addEventListener('input', renderLoans));

/* ---------- deposits ---------- */
async function loadDeposits() {
  state.deposits = await (await fetch('api/deposits.json')).json();
  renderDeposits();
}

function renderDeposits() {
  if (!state.deposits) return;
  const amount = parseFloat($('#dep-amount').value) || 0;
  const currency = $('#dep-currency').value;
  const term = parseInt($('#dep-term').value, 10);
  const rows = state.deposits.products
    .filter((p) => p.currency === currency && p.termMonths === term)
    .map((p) => ({ p, ok: amount >= p.minAmount, interest: amount * (p.rate / 100) * (term / 12) }))
    .sort((a, b) => (b.ok - a.ok) || (b.p.rate - a.p.rate));

  $('#deposits-body').innerHTML = rows.map(({ p, ok, interest }, i) => `<tr class="${ok ? '' : 'dim'}">
    <td><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.bankName)}</a></td>
    <td>${esc(p.name)} <span class="muted small">${p.termMonths} mo</span></td>
    <td class="num ${ok && i === 0 ? 'best' : ''}">${p.rate}</td>
    <td class="num">${money(p.minAmount)} ${currency}</td>
    <td class="num">${money(interest)} ${currency}</td>
  </tr>`).join('') || '<tr><td colspan="5" class="muted">No deposits listed for this currency and term.</td></tr>';
}
['#dep-amount', '#dep-currency', '#dep-term'].forEach((s) => $(s).addEventListener('input', renderDeposits));

/* ---------- start ---------- */
showTab(recall('tab') || 'currency');
loadRates();
setInterval(() => loadRates(), 5 * 60_000);
