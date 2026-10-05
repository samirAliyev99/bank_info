import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './src/store.js';
import { createSimaProvider } from './src/sima.js';
import { fillWithBots, botsAct } from './src/demo.js';
import {
  GameError, TIERS, RATING, LIMITS, newUser, createRoom, joinRoom, leaveRoom, findRoomByCode,
  markSent, confirmPayment, tick, roomDetail, listOpenRooms, userDashboard,
} from './src/game.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');

const PORT = Number(process.env.PORT) || 3100;
const DEMO = process.env.DEMO === '1';
const FIN_SECRET = process.env.FIN_SECRET || (DEMO ? 'demo-fin-secret' : null);
const SESSION_DAYS = 30;
const MAX_BODY = 10_000;

if (!FIN_SECRET) throw new Error('Set FIN_SECRET (a long random string) or run with DEMO=1.');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const store = new Store(process.env.DB_FILE || path.join(ROOT, 'data', 'db.json'));
const db = store.db;
const sima = createSimaProvider();

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  // Requiring JSON also blocks cross-site form posts (they can't set this header).
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new GameError('JSON gözlənilir.', 415);
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) throw new GameError('Sorğu çox böyükdür.', 413);
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new GameError('JSON səhvdir.');
  }
}

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter(([k]) => k));
}

function currentUser(req) {
  const sid = cookies(req).sid;
  const session = sid && db.sessions[sid];
  if (!session || session.expiresAt < Date.now()) return null;
  return db.users[session.userId] || null;
}

function requireUser(req) {
  const user = currentUser(req);
  if (!user) throw new GameError('Daxil olun.', 401);
  return user;
}

function requireRoom(id) {
  const room = db.rooms[id];
  if (!room) throw new GameError('Otaq tapılmadı.', 404);
  return room;
}

function loginWithIdentity(identity) {
  const finHash = crypto.createHmac('sha256', FIN_SECRET).update(identity.fin).digest('hex');
  let user = Object.values(db.users).find((u) => u.finHash === finHash);
  if (!user) {
    user = newUser({
      id: crypto.randomUUID(),
      finHash,
      finMasked: `${identity.fin.slice(0, 2)}***${identity.fin.slice(-2)}`,
      fullName: identity.fullName,
    }, Date.now());
    db.users[user.id] = user;
  }
  const sid = crypto.randomBytes(32).toString('hex');
  db.sessions[sid] = { userId: user.id, expiresAt: Date.now() + SESSION_DAYS * 86_400_000 };
  const cookie = `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86_400}${DEMO ? '' : '; Secure'}`;
  return { user, cookie };
}

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return res.writeHead(403).end();
  try {
    const body = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}

// [method, pattern, handler(req, params) -> { status?, body, headers? }]
const routes = [
  ['GET', /^\/api\/config$/, () => ({ body: { demo: DEMO, tiers: TIERS, rating: RATING, limits: LIMITS } })],

  ['POST', /^\/api\/auth\/sima\/start$/, () => ({ body: sima.createRequest('Lotereya: hesaba giriş / qeydiyyat') })],
  ['POST', /^\/api\/auth\/sima\/status\/([\w-]+)$/, (req, [id]) => {
    const result = sima.getResult(id);
    if (result.status !== 'signed') return { body: { status: result.status } };
    const { user, cookie } = loginWithIdentity(result.identity);
    return { body: { status: 'signed', userId: user.id }, headers: { 'Set-Cookie': cookie } };
  }],
  ['POST', /^\/api\/auth\/logout$/, (req) => {
    delete db.sessions[cookies(req).sid];
    return { body: { ok: true }, headers: { 'Set-Cookie': 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' } };
  }],

  ['GET', /^\/api\/me$/, (req) => ({ body: userDashboard(db, requireUser(req)) })],
  ['GET', /^\/api\/rooms$/, (req) => ({ body: listOpenRooms(db, requireUser(req)) })],
  ['POST', /^\/api\/rooms$/, async (req) => {
    const user = requireUser(req);
    const room = createRoom(db, user, await readBody(req), Date.now());
    return { status: 201, body: roomDetail(db, room, user) };
  }],
  ['POST', /^\/api\/rooms\/join$/, async (req) => {
    const user = requireUser(req);
    const room = findRoomByCode(db, (await readBody(req)).code);
    if (!room) throw new GameError('Bu kodla otaq tapılmadı.', 404);
    joinRoom(db, user, room, Date.now());
    return { body: roomDetail(db, room, user) };
  }],
  ['GET', /^\/api\/rooms\/([\w-]+)$/, (req, [id]) => {
    const user = requireUser(req);
    const room = requireRoom(id);
    if (room.isPrivate && !room.members.includes(user.id)) throw new GameError('Otaq tapılmadı.', 404);
    return { body: roomDetail(db, room, user) };
  }],
  ['POST', /^\/api\/rooms\/([\w-]+)\/join$/, (req, [id]) => {
    const user = requireUser(req);
    const room = requireRoom(id);
    if (room.isPrivate) throw new GameError('Gizli otağa yalnız kodla qoşulmaq olar.', 403);
    joinRoom(db, user, room, Date.now());
    return { body: roomDetail(db, room, user) };
  }],
  ['POST', /^\/api\/rooms\/([\w-]+)\/leave$/, (req, [id]) => {
    leaveRoom(db, requireUser(req), requireRoom(id));
    return { body: { ok: true } };
  }],
  ['POST', /^\/api\/rooms\/([\w-]+)\/payments\/([\w-]+)\/sent$/, async (req, [id, pid]) => {
    const user = requireUser(req);
    const room = requireRoom(id);
    markSent(db, user, room, pid, (await readBody(req)).reference, Date.now());
    return { body: roomDetail(db, room, user) };
  }],
  ['POST', /^\/api\/rooms\/([\w-]+)\/payments\/([\w-]+)\/confirm$/, (req, [id, pid]) => {
    const user = requireUser(req);
    const room = requireRoom(id);
    confirmPayment(db, user, room, pid, Date.now());
    return { body: roomDetail(db, room, user) };
  }],
];

if (DEMO) {
  routes.push(
    ['GET', /^\/api\/sima\/mock\/([\w-]+)$/, (req, [id]) => {
      const info = sima.describe(id);
      if (!info) throw new GameError('Sorğu tapılmadı.', 404);
      return { body: info };
    }],
    ['POST', /^\/api\/sima\/mock\/([\w-]+)\/sign$/, async (req, [id]) => {
      try {
        sima.sign(id, await readBody(req));
      } catch (err) {
        throw err instanceof GameError ? err : new GameError(err.message);
      }
      return { body: { ok: true } };
    }],
    ['POST', /^\/api\/demo\/rooms\/([\w-]+)\/fill$/, (req, [id]) => {
      const user = requireUser(req);
      const room = requireRoom(id);
      if (!room.members.includes(user.id)) throw new GameError('Siz bu otaqda deyilsiniz.', 403);
      fillWithBots(db, room, Date.now());
      return { body: roomDetail(db, room, user) };
    }],
    ['POST', /^\/api\/demo\/rooms\/([\w-]+)\/bots$/, (req, [id]) => {
      const user = requireUser(req);
      const room = requireRoom(id);
      if (!room.members.includes(user.id)) throw new GameError('Siz bu otaqda deyilsiniz.', 403);
      botsAct(db, room, Date.now());
      return { body: roomDetail(db, room, user) };
    }],
  );
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  try {
    for (const [method, pattern, handler] of routes) {
      const m = pathname.match(pattern);
      if (!m || req.method !== method) continue;
      const out = await handler(req, m.slice(1));
      if (req.method !== 'GET') store.save();
      return sendJson(res, out.status || 200, out.body, out.headers);
    }
    if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end();
    return serveStatic(req, res);
  } catch (err) {
    if (err instanceof GameError) return sendJson(res, err.status, { error: err.message });
    console.error(err);
    return sendJson(res, 500, { error: 'Daxili xəta' });
  }
});

// Penalties for overdue payments, and expired sessions.
setInterval(() => {
  const now = Date.now();
  let changed = tick(db, now);
  for (const [sid, s] of Object.entries(db.sessions)) {
    if (s.expiresAt < now) {
      delete db.sessions[sid];
      changed = true;
    }
  }
  if (changed) store.save();
}, 60_000).unref();

server.listen(PORT, () => {
  console.log(`Lotereya running on http://localhost:${PORT}${DEMO ? ' (DEMO: simulated SİMA, bots)' : ''}`);
});
