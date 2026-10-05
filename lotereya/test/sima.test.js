import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockSimaProvider, normalizeFin, createSimaProvider } from '../src/sima.js';

test('normalizeFin accepts 7 alphanumerics', () => {
  assert.equal(normalizeFin(' 5abc12d '), '5ABC12D');
  assert.equal(normalizeFin('5ABC12'), null);
  assert.equal(normalizeFin('5ABC-2D'), null);
});

test('signed result is returned once', () => {
  const sima = new MockSimaProvider();
  const { requestId } = sima.createRequest('login');
  assert.equal(sima.getResult(requestId).status, 'pending');
  sima.sign(requestId, { fin: '5abc12d', fullName: 'Samir Əliyev' });
  assert.deepEqual(sima.getResult(requestId), { status: 'signed', identity: { fin: '5ABC12D', fullName: 'Samir Əliyev' } });
  assert.equal(sima.getResult(requestId).status, 'expired');
});

test('rejects, expires and validates', () => {
  let now = 0;
  const sima = new MockSimaProvider({ ttlMs: 1000, now: () => now });
  const a = sima.createRequest('login').requestId;
  sima.sign(a, { approve: false });
  assert.equal(sima.getResult(a).status, 'rejected');

  const b = sima.createRequest('login').requestId;
  assert.throws(() => sima.sign(b, { fin: 'bad', fullName: 'Ad Soyad' }), /FİN/);
  now = 2000;
  assert.equal(sima.getResult(b).status, 'expired');
  assert.throws(() => sima.sign(b, { fin: '5ABC12D', fullName: 'Ad Soyad' }), /aktiv deyil/);
});

test('production provider requires credentials', () => {
  assert.throws(() => createSimaProvider({}), /SIMA_API_URL/);
  assert.ok(createSimaProvider({ DEMO: '1' }) instanceof MockSimaProvider);
});
