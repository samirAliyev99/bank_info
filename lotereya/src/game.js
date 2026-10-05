import crypto from 'node:crypto';

// Pure game rules. Every function takes the db object ({ users, rooms, sessions })
// and an explicit `now` so the whole lifecycle can be tested without a clock.

const DAY = 86_400_000;

// Rating unlocks bigger rooms. maxAmount is the monthly contribution per person,
// maxRooms is how many open/active rooms a member may be in at once.
export const TIERS = [
  { id: 'bronze', name: 'Bürünc', minRating: 0, maxAmount: 200, maxRooms: 1 },
  { id: 'silver', name: 'Gümüş', minRating: 40, maxAmount: 500, maxRooms: 2 },
  { id: 'gold', name: 'Qızıl', minRating: 150, maxAmount: 1500, maxRooms: 3 },
  { id: 'platinum', name: 'Platin', minRating: 400, maxAmount: 5000, maxRooms: 5 },
];

export const RATING = {
  onTimePayment: 5,
  latePayment: -15,
  missedPayment: -40,
  gameCompleted: 20,
};

export const LIMITS = {
  minMembers: 3,
  maxMembers: 12,
  periodDays: [7, 30],
  missedAfterDays: 15,
};

export class GameError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function tierFor(rating) {
  let tier = TIERS[0];
  for (const t of TIERS) if (rating >= t.minRating) tier = t;
  return tier;
}

export function nextTier(rating) {
  return TIERS.find((t) => t.minRating > rating) || null;
}

export function requiredTier(amount) {
  return TIERS.find((t) => amount <= t.maxAmount) || null;
}

export function newUser({ id, finHash, finMasked, fullName }, now) {
  return {
    id,
    finHash,
    finMasked,
    fullName,
    createdAt: now,
    rating: 0,
    ratingLog: [],
    stats: { gamesCompleted: 0, onTimePayments: 0, latePayments: 0, missedPayments: 0 },
  };
}

function addRating(user, delta, reason, roomId, now) {
  user.rating += delta;
  user.ratingLog.push({ at: now, delta, reason, roomId });
}

function liveRoomCount(db, userId) {
  return Object.values(db.rooms).filter(
    (r) => (r.status === 'open' || r.status === 'active') && r.members.includes(userId),
  ).length;
}

export function eligibility(db, user, room) {
  if (room.status !== 'open') return { ok: false, reason: 'Otaq artıq başlayıb.' };
  if (room.members.includes(user.id)) return { ok: false, reason: 'Siz artıq bu otaqdasınız.' };
  if (room.members.length >= room.memberCount) return { ok: false, reason: 'Otaq doludur.' };
  if (user.rating < 0) return { ok: false, reason: 'Reytinqiniz mənfidir. Gecikmiş ödənişləri tamamlayın.' };
  const tier = tierFor(user.rating);
  const req = requiredTier(room.amount);
  if (tier.minRating < req.minRating) {
    return { ok: false, reason: `Bu otaq üçün ən azı "${req.name}" səviyyəsi lazımdır.` };
  }
  if (liveRoomCount(db, user.id) >= tier.maxRooms) {
    return { ok: false, reason: `"${tier.name}" səviyyəsində eyni anda ${tier.maxRooms} otaqda ola bilərsiniz.` };
  }
  return { ok: true };
}

function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += alphabet[crypto.randomInt(alphabet.length)];
  return code;
}

export function createRoom(db, user, input, now) {
  const name = String(input.name ?? '').trim();
  const memberCount = Number(input.memberCount);
  const amount = Number(input.amount);
  const periodDays = Number(input.periodDays ?? 30);
  const order = input.order === 'rating' ? 'rating' : 'random';
  if (!name || name.length > 60) throw new GameError('Otağın adı 1-60 simvol olmalıdır.');
  if (!Number.isInteger(memberCount) || memberCount < LIMITS.minMembers || memberCount > LIMITS.maxMembers) {
    throw new GameError(`İştirakçı sayı ${LIMITS.minMembers}-${LIMITS.maxMembers} arası olmalıdır.`);
  }
  if (!Number.isInteger(amount) || amount < 1) throw new GameError('Məbləğ müsbət tam ədəd (AZN) olmalıdır.');
  if (!requiredTier(amount)) {
    throw new GameError(`Maksimum məbləğ ${TIERS.at(-1).maxAmount} AZN-dir.`);
  }
  if (!LIMITS.periodDays.includes(periodDays)) throw new GameError('Dövr həftəlik (7) və ya aylıq (30) olmalıdır.');

  const room = {
    id: crypto.randomUUID(),
    code: randomCode(),
    name,
    creatorId: user.id,
    memberCount,
    amount,
    periodDays,
    isPrivate: Boolean(input.isPrivate),
    order,
    status: 'open',
    members: [],
    createdAt: now,
    startedAt: null,
    completedAt: null,
    turnOrder: [],
    rounds: [],
    currentRound: -1,
  };
  const check = eligibility(db, user, room);
  if (!check.ok) throw new GameError(check.reason, 403);
  db.rooms[room.id] = room;
  joinRoom(db, user, room, now);
  return room;
}

export function findRoomByCode(db, code) {
  const c = String(code ?? '').trim().toUpperCase();
  return Object.values(db.rooms).find((r) => r.code === c) || null;
}

export function joinRoom(db, user, room, now, randomInt = crypto.randomInt) {
  const check = eligibility(db, user, room);
  if (!check.ok) throw new GameError(check.reason, 403);
  room.members.push(user.id);
  if (room.members.length === room.memberCount) startRoom(db, room, now, randomInt);
}

export function leaveRoom(db, user, room) {
  if (!room.members.includes(user.id)) throw new GameError('Siz bu otaqda deyilsiniz.');
  if (room.status !== 'open') throw new GameError('Başlamış oyundan çıxmaq olmaz.');
  room.members = room.members.filter((id) => id !== user.id);
  if (room.members.length === 0) delete db.rooms[room.id];
  else if (room.creatorId === user.id) room.creatorId = room.members[0];
}

function shuffle(list, randomInt) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startRoom(db, room, now, randomInt) {
  // Shuffle first so equal ratings are still ordered by the draw.
  let order = shuffle(room.members, randomInt);
  if (room.order === 'rating') {
    order = order.sort((a, b) => db.users[b].rating - db.users[a].rating);
  }
  room.turnOrder = order;
  room.status = 'active';
  room.startedAt = now;
  openRound(room, 0);
}

function openRound(room, index) {
  const recipient = room.turnOrder[index];
  room.rounds.push({
    index,
    recipient,
    // Deadlines follow a fixed calendar from the start, not from when the last round closed.
    deadline: room.startedAt + (index + 1) * room.periodDays * DAY,
    completedAt: null,
    payments: room.turnOrder
      .filter((id) => id !== recipient)
      .map((from) => ({
        id: `${index}-${from}`,
        from,
        to: recipient,
        amount: room.amount,
        status: 'pending',
        reference: null,
        sentAt: null,
        confirmedAt: null,
        late: false,
        missed: false,
      })),
  });
  room.currentRound = index;
}

function currentPayment(room, paymentId) {
  if (room.status !== 'active') throw new GameError('Oyun aktiv deyil.');
  const payment = room.rounds[room.currentRound].payments.find((p) => p.id === paymentId);
  if (!payment) throw new GameError('Ödəniş tapılmadı.', 404);
  return payment;
}

export function markSent(db, user, room, paymentId, reference, now) {
  const payment = currentPayment(room, paymentId);
  if (payment.from !== user.id) throw new GameError('Bu ödəniş sizin deyil.', 403);
  if (payment.status !== 'pending') throw new GameError('Ödəniş artıq qeyd olunub.');
  payment.status = 'sent';
  payment.sentAt = now;
  payment.reference = String(reference ?? '').trim().slice(0, 100) || null;
}

export function confirmPayment(db, user, room, paymentId, now) {
  const payment = currentPayment(room, paymentId);
  if (payment.to !== user.id) throw new GameError('Yalnız pulu alan şəxs təsdiq edə bilər.', 403);
  if (payment.status === 'confirmed') throw new GameError('Ödəniş artıq təsdiqlənib.');
  const round = room.rounds[room.currentRound];
  payment.status = 'confirmed';
  payment.confirmedAt = now;
  if (!payment.sentAt) payment.sentAt = now;
  const payer = db.users[payment.from];
  if (!payment.late) {
    payer.stats.onTimePayments++;
    addRating(payer, RATING.onTimePayment, 'Vaxtında ödəniş', room.id, now);
  }
  if (round.payments.every((p) => p.status === 'confirmed')) {
    round.completedAt = now;
    if (round.index + 1 < room.memberCount) openRound(room, round.index + 1);
    else completeRoom(db, room, now);
  }
}

function completeRoom(db, room, now) {
  room.status = 'completed';
  room.completedAt = now;
  for (const id of room.members) {
    const missedHere = room.rounds.some((r) => r.payments.some((p) => p.from === id && p.missed));
    if (missedHere) continue;
    const user = db.users[id];
    user.stats.gamesCompleted++;
    addRating(user, RATING.gameCompleted, 'Oyun uğurla başa çatdı', room.id, now);
  }
}

// Applies late/missed penalties. Only payments the payer never marked as sent are
// penalised; a sent-but-unconfirmed payment is the recipient's side of the story.
export function tick(db, now) {
  let changed = false;
  for (const room of Object.values(db.rooms)) {
    if (room.status !== 'active') continue;
    const round = room.rounds[room.currentRound];
    for (const p of round.payments) {
      if (p.status !== 'pending') continue;
      const payer = db.users[p.from];
      if (!p.late && now > round.deadline) {
        p.late = true;
        payer.stats.latePayments++;
        addRating(payer, RATING.latePayment, 'Gecikmiş ödəniş', room.id, now);
        changed = true;
      }
      if (!p.missed && now > round.deadline + LIMITS.missedAfterDays * DAY) {
        p.missed = true;
        payer.stats.missedPayments++;
        addRating(payer, RATING.missedPayment, 'Ödənilməmiş borc', room.id, now);
        changed = true;
      }
    }
  }
  return changed;
}

// ---- Views sent to the browser ----

function memberView(db, id) {
  const u = db.users[id];
  return { id, fullName: u.fullName, rating: u.rating, tier: tierFor(u.rating).id };
}

export function roomSummary(db, room, viewer) {
  const isMember = viewer ? room.members.includes(viewer.id) : false;
  const round = room.rounds[room.currentRound];
  return {
    id: room.id,
    name: room.name,
    status: room.status,
    memberCount: room.memberCount,
    joined: room.members.length,
    amount: room.amount,
    pot: room.amount * (room.memberCount - 1),
    periodDays: room.periodDays,
    isPrivate: room.isPrivate,
    order: room.order,
    requiredTier: requiredTier(room.amount).id,
    isMember,
    code: isMember ? room.code : undefined,
    currentRound: room.status === 'active' ? round.index + 1 : null,
    currentRecipient: room.status === 'active' ? db.users[round.recipient].fullName : null,
    myTurn: isMember && room.turnOrder.length ? room.turnOrder.indexOf(viewer.id) + 1 : null,
    eligibility: viewer && room.status === 'open' && !isMember ? eligibility(db, viewer, room) : undefined,
  };
}

export function roomDetail(db, room, viewer) {
  const summary = roomSummary(db, room, viewer);
  if (!summary.isMember) return summary;
  const name = (id) => db.users[id].fullName;
  return {
    ...summary,
    creatorId: room.creatorId,
    startedAt: room.startedAt,
    completedAt: room.completedAt,
    members: room.members.map((id) => memberView(db, id)),
    turnOrder: room.turnOrder.map((id) => memberView(db, id)),
    rounds: room.rounds.map((r) => ({
      index: r.index + 1,
      recipient: { id: r.recipient, fullName: name(r.recipient) },
      deadline: r.deadline,
      completedAt: r.completedAt,
      payments: r.payments.map((p) => ({ ...p, fromName: name(p.from), toName: name(p.to) })),
    })),
  };
}

export function listOpenRooms(db, viewer) {
  return Object.values(db.rooms)
    .filter((r) => r.status === 'open' && !r.isPrivate)
    .sort((a, b) => a.amount - b.amount)
    .map((r) => roomSummary(db, r, viewer));
}

export function userDashboard(db, user) {
  const tier = tierFor(user.rating);
  const next = nextTier(user.rating);
  const rooms = Object.values(db.rooms).filter((r) => r.members.includes(user.id));
  const toPay = [];
  const toConfirm = [];
  for (const room of rooms) {
    if (room.status !== 'active') continue;
    const round = room.rounds[room.currentRound];
    for (const p of round.payments) {
      const item = { roomId: room.id, roomName: room.name, deadline: round.deadline, ...p };
      if (p.from === user.id && p.status === 'pending') toPay.push({ ...item, toName: db.users[p.to].fullName });
      if (p.to === user.id && p.status !== 'confirmed') toConfirm.push({ ...item, fromName: db.users[p.from].fullName });
    }
  }
  return {
    user: {
      id: user.id,
      fullName: user.fullName,
      finMasked: user.finMasked,
      createdAt: user.createdAt,
      rating: user.rating,
      stats: user.stats,
    },
    tier,
    nextTier: next,
    progress: next ? (user.rating - tier.minRating) / (next.minRating - tier.minRating) : 1,
    ratingLog: user.ratingLog.slice(-20).reverse(),
    rooms: rooms.sort((a, b) => b.createdAt - a.createdAt).map((r) => roomSummary(db, r, user)),
    toPay,
    toConfirm,
  };
}
