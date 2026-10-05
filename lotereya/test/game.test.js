import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RATING, LIMITS, newUser, createRoom, joinRoom, leaveRoom, markSent, confirmPayment, tick,
  tierFor, requiredTier, eligibility, userDashboard, findRoomByCode,
} from '../src/game.js';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 1);

function setup(n, rating = 0) {
  const db = { users: {}, rooms: {}, sessions: {} };
  const users = Array.from({ length: n }, (_, i) => {
    const u = newUser({ id: `u${i}`, finHash: `h${i}`, finMasked: 'X', fullName: `User ${i}` }, T0);
    u.rating = rating;
    db.users[u.id] = u;
    return u;
  });
  return { db, users };
}

// randomInt that never swaps, so the turn order equals the join order.
const noShuffle = (max) => max - 1;

function fullRoom(n = 3, amount = 100) {
  const { db, users } = setup(n);
  const room = createRoom(db, users[0], { name: 'Ailə', memberCount: n, amount, periodDays: 30 }, T0);
  for (const u of users.slice(1)) joinRoom(db, u, room, T0, noShuffle);
  return { db, users, room };
}

function payRound(db, room, now) {
  const round = room.rounds[room.currentRound];
  for (const p of round.payments) markSent(db, db.users[p.from], room, p.id, 'ref', now);
  for (const p of round.payments) confirmPayment(db, db.users[p.to], room, p.id, now);
}

test('tiers follow rating and amount', () => {
  assert.equal(tierFor(0).id, 'bronze');
  assert.equal(tierFor(40).id, 'silver');
  assert.equal(tierFor(1000).id, 'platinum');
  assert.equal(requiredTier(200).id, 'bronze');
  assert.equal(requiredTier(201).id, 'silver');
  assert.equal(requiredTier(999999), null);
});

test('room starts when full and builds the first round', () => {
  const { room } = fullRoom(3);
  assert.equal(room.status, 'active');
  assert.deepEqual(room.turnOrder, ['u0', 'u1', 'u2']);
  const r = room.rounds[0];
  assert.equal(r.recipient, 'u0');
  assert.equal(r.deadline, T0 + 30 * DAY);
  assert.deepEqual(r.payments.map((p) => p.from), ['u1', 'u2']);
});

test('full game: everyone receives once, nobody loses, ratings rise', () => {
  const { db, users, room } = fullRoom(3, 100);
  const received = {};
  const paid = {};
  for (let i = 0; i < 3; i++) {
    const round = room.rounds[room.currentRound];
    for (const p of round.payments) {
      paid[p.from] = (paid[p.from] || 0) + p.amount;
      received[p.to] = (received[p.to] || 0) + p.amount;
    }
    payRound(db, room, T0 + i * 30 * DAY + DAY);
  }
  assert.equal(room.status, 'completed');
  assert.equal(room.rounds.length, 3);
  for (const u of users) {
    assert.equal(received[u.id], 200);
    assert.equal(paid[u.id], 200);
    assert.equal(u.rating, 2 * RATING.onTimePayment + RATING.gameCompleted);
    assert.equal(u.stats.gamesCompleted, 1);
  }
});

test('one clean 5-person game reaches silver', () => {
  const { db, users, room } = fullRoom(5, 100);
  for (let i = 0; i < 5; i++) payRound(db, room, T0 + i * 30 * DAY + DAY);
  assert.equal(tierFor(users[0].rating).id, 'silver');
});

test('only the payer can mark sent and only the recipient can confirm', () => {
  const { db, users, room } = fullRoom(3);
  const p = room.rounds[0].payments[0]; // u1 -> u0
  assert.throws(() => markSent(db, users[2], room, p.id, '', T0), /sizin deyil/);
  assert.throws(() => confirmPayment(db, users[1], room, p.id, T0), /Yalnız pulu alan/);
  markSent(db, users[1], room, p.id, '', T0);
  assert.throws(() => markSent(db, users[1], room, p.id, '', T0), /artıq qeyd/);
  confirmPayment(db, users[0], room, p.id, T0);
  assert.throws(() => confirmPayment(db, users[0], room, p.id, T0), /artıq təsdiq/);
});

test('late and missed payments are penalised once, sent payments are not', () => {
  const { db, users, room } = fullRoom(3);
  const [late, sent] = room.rounds[0].payments; // u1 never pays, u2 marks sent
  markSent(db, users[2], room, sent.id, '', T0 + DAY);
  const deadline = room.rounds[0].deadline;

  tick(db, deadline + 1);
  tick(db, deadline + 2);
  assert.equal(users[1].rating, RATING.latePayment);
  assert.equal(users[2].rating, 0);

  tick(db, deadline + LIMITS.missedAfterDays * DAY + 1);
  assert.equal(users[1].rating, RATING.latePayment + RATING.missedPayment);
  assert.equal(users[1].stats.missedPayments, 1);

  // Paying late gives no on-time bonus.
  confirmPayment(db, users[0], room, late.id, deadline + 20 * DAY);
  assert.equal(users[1].rating, RATING.latePayment + RATING.missedPayment);
});

test('missed payment loses the completion bonus', () => {
  const { db, users, room } = fullRoom(3);
  const onTime = room.rounds[0].payments.find((p) => p.from === 'u2');
  markSent(db, users[2], room, onTime.id, '', T0 + DAY);
  tick(db, room.rounds[0].deadline + (LIMITS.missedAfterDays + 1) * DAY);
  for (let i = 0; i < 3; i++) {
    const round = room.rounds[room.currentRound];
    for (const p of round.payments) confirmPayment(db, db.users[p.to], room, p.id, T0 + 100 * DAY);
  }
  assert.equal(room.status, 'completed');
  assert.equal(users[1].stats.gamesCompleted, 0);
  assert.equal(users[2].stats.gamesCompleted, 1);
});

test('bigger rooms need a higher tier, and room count is limited', () => {
  const { db, users } = setup(2);
  assert.throws(() => createRoom(db, users[0], { name: 'Böyük', memberCount: 5, amount: 1000, periodDays: 30 }, T0), /Qızıl/);
  createRoom(db, users[0], { name: 'Kiçik', memberCount: 5, amount: 100, periodDays: 30 }, T0);
  assert.throws(() => createRoom(db, users[0], { name: 'İkinci', memberCount: 5, amount: 100, periodDays: 30 }, T0), /eyni anda 1/);
  users[1].rating = -5;
  const room = Object.values(db.rooms)[0];
  assert.match(eligibility(db, users[1], room).reason, /mənfidir/);
});

test('rejects invalid room settings', () => {
  const { db, users } = setup(1);
  const base = { name: 'X', memberCount: 5, amount: 100, periodDays: 30 };
  assert.throws(() => createRoom(db, users[0], { ...base, name: ' ' }, T0));
  assert.throws(() => createRoom(db, users[0], { ...base, memberCount: 2 }, T0));
  assert.throws(() => createRoom(db, users[0], { ...base, memberCount: 13 }, T0));
  assert.throws(() => createRoom(db, users[0], { ...base, amount: 10.5 }, T0));
  assert.throws(() => createRoom(db, users[0], { ...base, periodDays: 14 }, T0));
});

test('rating order puts the most trusted member first', () => {
  const { db, users } = setup(3, 50);
  users[2].rating = 90;
  const room = createRoom(db, users[0], { name: 'R', memberCount: 3, amount: 100, periodDays: 7, order: 'rating' }, T0);
  joinRoom(db, users[1], room, T0);
  joinRoom(db, users[2], room, T0);
  assert.equal(room.turnOrder[0], 'u2');
  assert.equal(room.rounds[0].deadline, T0 + 7 * DAY);
});

test('leave before start, find by code, dashboard lists debts', () => {
  const { db, users } = setup(3);
  const room = createRoom(db, users[0], { name: 'L', memberCount: 3, amount: 50, periodDays: 30 }, T0);
  assert.equal(findRoomByCode(db, room.code.toLowerCase()), room);
  joinRoom(db, users[1], room, T0);
  leaveRoom(db, users[0], room);
  assert.equal(room.creatorId, 'u1');
  joinRoom(db, users[0], room, T0, noShuffle);
  joinRoom(db, users[2], room, T0, noShuffle);
  assert.throws(() => leaveRoom(db, users[0], room), /Başlamış/);

  const recipient = db.users[room.rounds[0].recipient];
  const payer = db.users[room.rounds[0].payments[0].from];
  assert.equal(userDashboard(db, payer).toPay.length, 1);
  assert.equal(userDashboard(db, recipient).toConfirm.length, 2);
});
