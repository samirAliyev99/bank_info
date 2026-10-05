import crypto from 'node:crypto';
import { newUser, joinRoom, markSent, confirmPayment, requiredTier } from './game.js';

// Demo-only helpers so one person can play a whole room alone in the browser.

const BOT_NAMES = ['Aysel Məmmədova', 'Rəşad Əliyev', 'Günay Həsənova', 'Elvin Quliyev', 'Nigar İsmayılova',
  'Tural Hüseynov', 'Səbinə Abbasova', 'Kamran Rzayev', 'Ləman Cəfərova', 'Orxan Babayev', 'Fidan Kərimova'];

function botFor(db, rating, now) {
  const bot = newUser({
    id: crypto.randomUUID(),
    finHash: null,
    finMasked: 'DEMO***',
    fullName: BOT_NAMES[crypto.randomInt(BOT_NAMES.length)],
  }, now);
  bot.rating = rating;
  bot.isBot = true;
  db.users[bot.id] = bot;
  return bot;
}

export function fillWithBots(db, room, now) {
  const rating = requiredTier(room.amount).minRating;
  while (room.status === 'open' && room.members.length < room.memberCount) {
    joinRoom(db, botFor(db, rating, now), room, now);
  }
}

// Bots pay what they owe in the current round and confirm what they received.
export function botsAct(db, room, now) {
  if (room.status !== 'active') return;
  const round = room.rounds[room.currentRound];
  for (const p of round.payments) {
    if (p.status === 'pending' && db.users[p.from].isBot) markSent(db, db.users[p.from], room, p.id, 'demo', now);
  }
  for (const p of [...round.payments]) {
    if (room.rounds[room.currentRound] !== round) break;
    if (p.status === 'sent' && db.users[p.to].isBot) confirmPayment(db, db.users[p.to], room, p.id, now);
  }
}
