const app = document.getElementById('app');
const nav = document.getElementById('nav');
let config = null;
let pollTimer = null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Formatted by hand: many browsers ship without Azerbaijani locale data.
const MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avq', 'sen', 'okt', 'noy', 'dek'];
const azn = (n) => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₼`;
const date = (t) => {
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
const period = (d) => (d === 7 ? 'həftə' : 'ay');
const tierById = (id) => config.tiers.find((t) => t.id === id);
const tierBadge = (id) => `<span class="tier tier-${id}">● ${esc(tierById(id).name)}</span>`;

const STATUS = {
  open: ['İştirakçı gözlənilir', ''],
  active: ['Davam edir', 'ok'],
  completed: ['Başa çatıb', 'ok'],
};
const PAY_STATUS = {
  pending: ['Gözlənilir', 'warn'],
  sent: ['Göndərilib', ''],
  confirmed: ['Təsdiqlənib', 'ok'],
};
const pill = ([text, cls]) => `<span class="pill ${cls}">${esc(text)}</span>`;

function toast(message, error = false) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast${error ? ' error' : ''}`;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 3500);
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`api/${path}`, {
    method,
    headers: body !== undefined || method !== 'GET' ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : method !== 'GET' ? '{}' : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    location.hash = '#/login';
    throw new Error(data.error || 'Daxil olun.');
  }
  if (!res.ok) throw new Error(data.error || `Xəta ${res.status}`);
  return data;
}

// Wraps a click handler: shows errors as a toast and re-renders on success.
function action(fn) {
  return async (e) => {
    e.preventDefault();
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await fn(e);
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
    }
  };
}

function on(selector, event, handler) {
  app.querySelectorAll(selector).forEach((el) => el.addEventListener(event, handler));
}

// ---------- Login with SİMA ----------

function renderLogin() {
  nav.hidden = true;
  app.innerHTML = `
    <section class="hero">
      <h1>Ailə lotereyası, indi onlayn</h1>
      <p class="muted">Bir neçə nəfər hər ay eyni məbləği yığır, pulu növbə ilə bir nəfər götürür.
        Heç kim pul itirmir: hər kəs bir dəfə böyük məbləği alır, qalan aylarda payını verir.</p>
      <div class="card steps">
        <ol>
          <li>SİMA imzası ilə hesab açın. Şəxsiyyətiniz təsdiqlənir, saxta hesab olmur.</li>
          <li>Otaq yaradın və ya qoşulun: iştirakçı sayı, aylıq məbləğ, müddət.</li>
          <li>Otaq dolanda növbə müəyyən olunur. Ödənişləri vaxtında edin, reytinqiniz qalxsın.</li>
          <li>Reytinq qalxdıqca daha böyük məbləğli otaqlar açılır.</li>
        </ol>
      </div>
      <div id="sima-box"><button id="sima-start">SİMA ilə daxil ol</button></div>
    </section>`;
  on('#sima-start', 'click', action(startSima));
}

async function startSima() {
  const req = await api('auth/sima/start', { method: 'POST' });
  const box = document.getElementById('sima-box');
  box.innerHTML = `
    <div class="card">
      <h2>SİMA tətbiqində imzalayın</h2>
      <p class="muted">Telefonunuzda SİMA tətbiqini açın və sorğunu təsdiqləyin. Bu səhifə özü yenilənəcək.</p>
      <p><a class="btn ghost" href="${esc(req.deeplink)}">SİMA tətbiqini aç</a>
      ${req.demoUrl ? `<a class="btn" href="${esc(req.demoUrl)}" target="_blank" rel="noopener">Demo SİMA telefonu</a>` : ''}</p>
      <p class="muted small" id="sima-state">İmza gözlənilir…</p>
    </div>`;
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const r = await api(`auth/sima/status/${req.requestId}`, { method: 'POST' });
      if (r.status === 'pending') return;
      clearInterval(pollTimer);
      if (r.status === 'signed') {
        toast('Xoş gəldiniz!');
        location.hash = '#/cabinet';
      } else {
        document.getElementById('sima-state').textContent =
          r.status === 'rejected' ? 'İmza rədd edildi.' : 'Sorğunun vaxtı bitdi. Yenidən cəhd edin.';
      }
    } catch (err) {
      clearInterval(pollTimer);
      toast(err.message, true);
    }
  }, 2000);
}

// ---------- Personal cabinet ----------

function paymentAsk(p, mode) {
  const who = mode === 'pay' ? `→ ${esc(p.toName)}` : `← ${esc(p.fromName)}`;
  const btn = mode === 'pay'
    ? `<button class="small" data-sent="${esc(p.roomId)}|${esc(p.id)}">Göndərdim</button>`
    : `<button class="small" data-confirm="${esc(p.roomId)}|${esc(p.id)}">Aldım</button>`;
  return `<li class="row spread">
    <span><b>${azn(p.amount)}</b> ${who}<br><span class="muted small"><a href="#/rooms/${esc(p.roomId)}">${esc(p.roomName)}</a> · son tarix ${date(p.deadline)}</span>
      ${p.late ? pill(['Gecikir', 'bad']) : ''} ${p.status === 'sent' ? pill(PAY_STATUS.sent) : ''}</span>
    ${btn}</li>`;
}

function roomCard(r) {
  return `<a class="card" href="#/rooms/${esc(r.id)}" style="display:block;color:inherit">
    <div class="row spread"><b>${esc(r.name)}</b>${pill(STATUS[r.status])}</div>
    <div class="big-number">${azn(r.amount)}<span class="muted small"> / ${period(r.periodDays)}</span></div>
    <div class="muted small">${r.joined}/${r.memberCount} nəfər · alacağınız: ${azn(r.pot)}${r.myTurn ? ` · növbəniz: ${r.myTurn}` : ''}</div>
    <div class="row" style="margin-top:8px">${tierBadge(r.requiredTier)}${r.isPrivate ? '<span class="pill">Gizli</span>' : ''}</div>
    ${r.eligibility && !r.eligibility.ok ? `<p class="small" style="color:var(--danger);margin:8px 0 0">${esc(r.eligibility.reason)}</p>` : ''}
  </a>`;
}

async function renderCabinet() {
  const me = await api('me');
  const { user, tier, nextTier: next } = me;
  app.innerHTML = `
    <div class="card">
      <div class="row spread">
        <div><h1>${esc(user.fullName)}</h1>
          <div class="muted small">FİN ${esc(user.finMasked)} · SİMA ilə təsdiqlənib · ${date(user.createdAt)}-dən üzv</div></div>
        ${tierBadge(tier.id)}
      </div>
      <div style="margin-top:16px">
        <div class="row spread"><b>Reytinq: ${user.rating}</b>
          <span class="muted small">${next ? `${esc(next.name)} üçün ${next.minRating - user.rating} bal qalıb` : 'Ən yüksək səviyyə'}</span></div>
        <div class="progress"><div style="width:${Math.max(0, Math.min(1, me.progress)) * 100}%"></div></div>
        <div class="muted small">Hazırda: ${azn(tier.maxAmount)}-a qədər otaqlar, eyni anda ${tier.maxRooms} otaq.
          ${next ? `Növbəti səviyyədə ${azn(next.maxAmount)}-a qədər açılacaq.` : ''}</div>
      </div>
    </div>

    <div class="card stats">
      <div class="stat"><b>${user.stats.gamesCompleted}</b><span class="muted small">uğurlu oyun</span></div>
      <div class="stat"><b>${user.stats.onTimePayments}</b><span class="muted small">vaxtında ödəniş</span></div>
      <div class="stat"><b>${user.stats.latePayments}</b><span class="muted small">gecikmə</span></div>
      <div class="stat"><b>${user.stats.missedPayments}</b><span class="muted small">ödənilməyən</span></div>
    </div>

    ${me.toPay.length ? `<div class="card"><h2>Ödəməlisiniz</h2><ul class="list">${me.toPay.map((p) => paymentAsk(p, 'pay')).join('')}</ul></div>` : ''}
    ${me.toConfirm.length ? `<div class="card"><h2>Sizə gələn ödənişlər</h2>
      <p class="muted small">Pulu həqiqətən alanda "Aldım" basın. Bu, ödəyənin reytinqini artırır.</p>
      <ul class="list">${me.toConfirm.map((p) => paymentAsk(p, 'confirm')).join('')}</ul></div>` : ''}

    <h2>Otaqlarım</h2>
    ${me.rooms.length ? `<div class="grid">${me.rooms.map(roomCard).join('')}</div>`
      : `<div class="card muted">Hələ heç bir otaqda deyilsiniz. <a href="#/rooms">Otaq tapın</a> və ya <a href="#/new">yaradın</a>.</div>`}

    <div class="grid" style="margin-top:16px">
      <div class="card"><h2>Reytinq tarixçəsi</h2>
        ${me.ratingLog.length ? `<ul class="list">${me.ratingLog.map((e) => `<li class="row spread"><span>${esc(e.reason)}<br><span class="muted small">${date(e.at)}</span></span>
          <b style="color:${e.delta > 0 ? 'var(--accent)' : 'var(--danger)'}">${e.delta > 0 ? '+' : ''}${e.delta}</b></li>`).join('')}</ul>`
          : '<p class="muted">Hələ dəyişiklik yoxdur.</p>'}
      </div>
      <div class="card"><h2>Səviyyələr</h2>
        <ul class="list">${config.tiers.map((t) => `<li class="row spread">${tierBadge(t.id)}
          <span class="small">${t.minRating}+ bal · ${azn(t.maxAmount)}-a qədər · ${t.maxRooms} otaq</span></li>`).join('')}</ul>
        <p class="muted small">Vaxtında ödəniş +${config.rating.onTimePayment}, uğurlu oyun +${config.rating.gameCompleted},
          gecikmə ${config.rating.latePayment}, ödənilməyən borc ${config.rating.missedPayment}.</p>
      </div>
    </div>`;
  bindPaymentButtons();
}

function bindPaymentButtons(after = renderRoute) {
  on('[data-sent]', 'click', action(async (e) => {
    const [roomId, pid] = e.currentTarget.dataset.sent.split('|');
    const reference = prompt('Köçürmənin qəbz nömrəsi və ya qeyd (istəyə bağlı):') ?? null;
    if (reference === null) return;
    await api(`rooms/${roomId}/payments/${pid}/sent`, { method: 'POST', body: { reference } });
    toast('Qeyd olundu. Alan şəxs təsdiqləyəcək.');
    await after();
  }));
  on('[data-confirm]', 'click', action(async (e) => {
    const [roomId, pid] = e.currentTarget.dataset.confirm.split('|');
    if (!confirm('Pulu həqiqətən aldınız?')) return;
    await api(`rooms/${roomId}/payments/${pid}/confirm`, { method: 'POST' });
    toast('Təsdiqləndi.');
    await after();
  }));
}

// ---------- Room list, create, join ----------

async function renderRooms() {
  const rooms = await api('rooms');
  app.innerHTML = `
    <div class="row spread"><h1>Açıq otaqlar</h1><a class="btn" href="#/new">+ Otaq yarat</a></div>
    <form id="join-code" class="card row">
      <div style="flex:1;min-width:180px"><b>Dəvət kodu ilə qoşul</b><br><span class="muted small">Gizli ailə otaqları yalnız kodla görünür.</span></div>
      <input name="code" placeholder="Məs: K7M2QP" maxlength="6" style="max-width:160px;text-transform:uppercase" required>
      <button>Qoşul</button>
    </form>
    ${rooms.length ? `<div class="grid">${rooms.map((r) => `<div>${roomCard(r)}</div>`).join('')}</div>`
      : '<div class="card muted">Hazırda açıq otaq yoxdur. İlk otağı siz yaradın.</div>'}`;
  on('#join-code', 'submit', action(async (e) => {
    const room = await api('rooms/join', { method: 'POST', body: { code: e.target.code.value } });
    toast('Otağa qoşuldunuz.');
    location.hash = `#/rooms/${room.id}`;
  }));
}

async function renderNew() {
  const me = await api('me');
  const maxAllowed = me.tier.maxAmount;
  app.innerHTML = `
    <h1>Yeni otaq</h1>
    <form id="new-room" class="card">
      <label>Otağın adı</label>
      <input name="name" maxlength="60" placeholder="Məs: Əliyevlər ailəsi" required>
      <div class="grid">
        <div><label>İştirakçı sayı</label>
          <input name="memberCount" type="number" min="${config.limits.minMembers}" max="${config.limits.maxMembers}" value="5" required></div>
        <div><label>Hər dövr ödəniş (AZN)</label>
          <input name="amount" type="number" min="1" max="${maxAllowed}" step="1" value="${Math.min(100, maxAllowed)}" required></div>
        <div><label>Dövr</label>
          <select name="periodDays"><option value="30">Aylıq</option><option value="7">Həftəlik</option></select></div>
        <div><label>Növbə</label>
          <select name="order"><option value="random">Püşkatma (təsadüfi)</option><option value="rating">Reytinqə görə (yüksək əvvəl)</option></select></div>
      </div>
      <label class="check"><input type="checkbox" name="isPrivate" checked> Gizli otaq (yalnız dəvət kodu ilə)</label>
      <div class="card" id="calc" style="background:var(--bg);margin:16px 0"></div>
      <button>Otağı yarat</button>
      <p class="muted small">Səviyyəniz ${tierBadge(me.tier.id)} ${azn(maxAllowed)}-a qədər otaq yaratmağa imkan verir.</p>
    </form>`;
  const form = app.querySelector('#new-room');
  const calc = () => {
    const n = Number(form.memberCount.value) || 0;
    const a = Number(form.amount.value) || 0;
    const p = Number(form.periodDays.value);
    app.querySelector('#calc').innerHTML = n && a ? `
      Hər dövr hər nəfər <b>${azn(a)}</b> ödəyir. Növbəsi çatan şəxs <b>${azn(a * (n - 1))}</b> alır.<br>
      Oyun <b>${n} ${period(p)}</b> davam edir. Sonda hər kəs ${azn(a * (n - 1))} verib, ${azn(a * (n - 1))} alıb: heç kim itirmir.` : '';
  };
  form.addEventListener('input', calc);
  calc();
  form.addEventListener('submit', action(async () => {
    const room = await api('rooms', {
      method: 'POST',
      body: {
        name: form.name.value,
        memberCount: Number(form.memberCount.value),
        amount: Number(form.amount.value),
        periodDays: Number(form.periodDays.value),
        order: form.order.value,
        isPrivate: form.isPrivate.checked,
      },
    });
    toast('Otaq yaradıldı.');
    location.hash = `#/rooms/${room.id}`;
  }));
}

// ---------- Room detail ----------

async function renderRoom(id) {
  const room = await api(`rooms/${id}`);
  if (!room.isMember) {
    const e = room.eligibility;
    app.innerHTML = `<div class="card">${roomCard(room)}
      ${e?.ok ? '<button id="join">Otağa qoşul</button>' : ''}</div>`;
    on('#join', 'click', action(async () => {
      await api(`rooms/${id}/join`, { method: 'POST' });
      toast('Otağa qoşuldunuz.');
      await renderRoute();
    }));
    return;
  }

  const me = (await api('me')).user.id;
  const current = room.rounds.at(-1);
  const head = `
    <div class="card">
      <div class="row spread"><h1>${esc(room.name)}</h1>${pill(STATUS[room.status])}</div>
      <div class="row muted small">
        <span>${room.memberCount} nəfər</span>·<span>${azn(room.amount)} / ${period(room.periodDays)}</span>·
        <span>Növbəli məbləğ: <b>${azn(room.pot)}</b></span>·<span>${room.order === 'rating' ? 'Reytinqə görə' : 'Püşkatma'}</span>·${tierBadge(room.requiredTier)}
      </div>
    </div>`;

  if (room.status === 'open') {
    app.innerHTML = `${head}
      <div class="card">
        <h2>Dəvət kodu: <span style="letter-spacing:3px">${esc(room.code)}</span></h2>
        <p class="muted">Kodu ailə üzvlərinizə göndərin. Otaq ${room.memberCount} nəfər olanda oyun avtomatik başlayır və növbə müəyyən olunur.</p>
        <div class="row"><button class="ghost small" id="copy">Kodu kopyala</button>
          ${config.demo ? '<button class="small" id="fill">Demo: botlarla doldur</button>' : ''}
          <button class="link" id="leave">Otaqdan çıx</button></div>
      </div>
      <div class="card"><h2>İştirakçılar (${room.joined}/${room.memberCount})</h2>
        <ul class="list">${room.members.map((m) => `<li class="row spread"><span>${esc(m.fullName)}${m.id === room.creatorId ? ' <span class="pill">yaradan</span>' : ''}</span>
          <span class="row small">${m.rating} bal ${tierBadge(m.tier)}</span></li>`).join('')}</ul></div>`;
    on('#copy', 'click', action(async () => {
      await navigator.clipboard.writeText(room.code);
      toast('Kopyalandı.');
    }));
    on('#fill', 'click', action(async () => {
      await api(`demo/rooms/${id}/fill`, { method: 'POST' });
      await renderRoute();
    }));
    on('#leave', 'click', action(async () => {
      if (!confirm('Otaqdan çıxırsınız?')) return;
      await api(`rooms/${id}/leave`, { method: 'POST' });
      location.hash = '#/cabinet';
    }));
    return;
  }

  const doneRounds = room.rounds.filter((r) => r.completedAt).length;
  const paymentRow = (p, active) => {
    let btn = '';
    if (active && p.from === me && p.status === 'pending') btn = `<button class="small" data-sent="${esc(room.id)}|${esc(p.id)}">Göndərdim</button>`;
    if (active && p.to === me && p.status !== 'confirmed') btn = `<button class="small" data-confirm="${esc(room.id)}|${esc(p.id)}">Aldım</button>`;
    return `<tr><td>${esc(p.fromName)}${p.from === me ? ' (siz)' : ''}</td><td>${azn(p.amount)}</td>
      <td>${pill(PAY_STATUS[p.status])} ${p.late ? pill(['Gecikmə', 'bad']) : ''} ${p.missed ? pill(['Ödənilməyib', 'bad']) : ''}</td>
      <td class="muted small ref">${esc(p.reference || '')}</td><td>${btn}</td></tr>`;
  };

  app.innerHTML = `${head}
    <div class="card"><h2>Növbə</h2>
      <div class="turns">${room.turnOrder.map((m, i) => `<div class="turn ${i < doneRounds ? 'done' : ''} ${room.status === 'active' && i === current.index - 1 ? 'now' : ''}">
        ${i + 1}. ${esc(m.fullName)}${m.id === me ? ' (siz)' : ''}<br><span class="small muted">${date(room.rounds[0].deadline + i * room.periodDays * 86400000)}</span></div>`).join('')}</div>
    </div>
    ${room.status === 'active' ? `<div class="card">
      <div class="row spread"><h2>Dövr ${current.index}: ${esc(current.recipient.fullName)} alır</h2>
        <span class="muted small">Son tarix: ${date(current.deadline)}</span></div>
      <div class="table-wrap"><table><tr><th>Ödəyən</th><th>Məbləğ</th><th>Status</th><th class="ref">Qeyd</th><th></th></tr>
        ${current.payments.map((p) => paymentRow(p, true)).join('')}</table></div>
      ${config.demo ? '<p><button class="ghost small" id="bots">Demo: botlar ödəsin / təsdiqləsin</button></p>' : ''}
    </div>` : `<div class="card"><h2>Oyun ${date(room.completedAt)} tarixində uğurla başa çatdı 🎉</h2>
      <p class="muted">Hər kəs öz növbəsində ${azn(room.pot)} aldı. Reytinqiniz yeniləndi, <a href="#/cabinet">kabinetə</a> baxın.</p></div>`}
    ${room.rounds.filter((r) => r.completedAt).reverse().map((r) => `<details class="card"><summary><b>Dövr ${r.index}</b>: ${esc(r.recipient.fullName)} aldı · ${date(r.completedAt)}</summary>
      <div class="table-wrap"><table>${r.payments.map((p) => paymentRow(p, false)).join('')}</table></div></details>`).join('')}`;
  bindPaymentButtons();
  on('#bots', 'click', action(async () => {
    await api(`demo/rooms/${id}/bots`, { method: 'POST' });
    await renderRoute();
  }));
}

// ---------- Router ----------

async function renderRoute() {
  clearInterval(pollTimer);
  const hash = location.hash || '#/cabinet';
  nav.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === hash));
  if (hash === '#/login') return renderLogin();
  nav.hidden = false;
  try {
    const roomMatch = hash.match(/^#\/rooms\/([\w-]+)$/);
    if (roomMatch) return await renderRoom(roomMatch[1]);
    if (hash === '#/rooms') return await renderRooms();
    if (hash === '#/new') return await renderNew();
    return await renderCabinet();
  } catch (err) {
    if (location.hash !== '#/login') app.innerHTML = `<div class="card">${esc(err.message)}</div>`;
  }
}

document.getElementById('logout').addEventListener('click', async () => {
  await api('auth/logout', { method: 'POST' }).catch(() => {});
  location.hash = '#/login';
});

config = await api('config');
document.getElementById('demo-banner').hidden = !config.demo;
window.addEventListener('hashchange', renderRoute);
renderRoute();
