import crypto from 'node:crypto';

// SİMA sign-in. Every provider has the same shape:
//   createRequest(purpose)  -> { requestId, deeplink, demoUrl?, expiresAt }
//   getResult(requestId)    -> { status: 'pending' | 'signed' | 'rejected' | 'expired', identity? }
// identity is { fin, fullName } taken from the signer's certificate. A signed result
// is returned only once, so one signature can't open two sessions.

const FIN_RE = /^[0-9A-Z]{7}$/;

export function normalizeFin(fin) {
  const f = String(fin ?? '').trim().toUpperCase();
  return FIN_RE.test(f) ? f : null;
}

// Simulates the SİMA phone app so the whole flow can be tried without a contract.
// The "phone" is public/sima-demo.html; it calls sign() through /api/sima/mock/*.
export class MockSimaProvider {
  constructor({ secret = crypto.randomBytes(32), ttlMs = 5 * 60_000, now = Date.now } = {}) {
    this.secret = secret;
    this.ttlMs = ttlMs;
    this.now = now;
    this.requests = new Map();
  }

  createRequest(purpose) {
    const id = crypto.randomUUID();
    const expiresAt = this.now() + this.ttlMs;
    this.requests.set(id, {
      id,
      purpose,
      challenge: crypto.randomBytes(16).toString('hex'),
      status: 'pending',
      expiresAt,
    });
    return { requestId: id, deeplink: `sima://sign?request=${id}`, demoUrl: `sima-demo.html?req=${id}`, expiresAt };
  }

  #get(id) {
    const req = this.requests.get(id);
    if (req && req.status === 'pending' && this.now() > req.expiresAt) req.status = 'expired';
    return req;
  }

  describe(id) {
    const req = this.#get(id);
    if (!req) return null;
    return { purpose: req.purpose, challenge: req.challenge, status: req.status, expiresAt: req.expiresAt };
  }

  #signature(req, identity) {
    return crypto.createHmac('sha256', this.secret).update(`${req.challenge}|${identity.fin}|${identity.fullName}`).digest('hex');
  }

  sign(id, { fin, fullName, approve = true }) {
    const req = this.#get(id);
    if (!req) throw new Error('Sorğu tapılmadı.');
    if (req.status !== 'pending') throw new Error('Sorğu artıq aktiv deyil.');
    if (!approve) {
      req.status = 'rejected';
      return;
    }
    const identity = { fin: normalizeFin(fin), fullName: String(fullName ?? '').trim().slice(0, 80) };
    if (!identity.fin) throw new Error('FİN 7 simvol olmalıdır (rəqəm və latın hərfi).');
    if (identity.fullName.length < 3) throw new Error('Ad və soyad daxil edin.');
    req.identity = identity;
    req.signature = this.#signature(req, identity);
    req.status = 'signed';
  }

  getResult(id) {
    const req = this.#get(id);
    if (!req) return { status: 'expired' };
    if (req.status !== 'signed') return { status: req.status };
    // A real provider verifies the signature and certificate chain here.
    const valid = crypto.timingSafeEqual(Buffer.from(req.signature, 'hex'), Buffer.from(this.#signature(req, req.identity), 'hex'));
    this.requests.delete(id);
    return valid ? { status: 'signed', identity: req.identity } : { status: 'rejected' };
  }
}

// Production SİMA. The integration API, endpoints and credentials come with the
// service agreement for SİMA İmza, so they are configuration, not code.
// Fill in the two methods according to that documentation.
export class SimaProvider {
  constructor({ apiUrl, clientId, clientSecret }) {
    if (!apiUrl || !clientId || !clientSecret) {
      throw new Error('SIMA_API_URL, SIMA_CLIENT_ID and SIMA_CLIENT_SECRET must be set (or run with DEMO=1).');
    }
    Object.assign(this, { apiUrl, clientId, clientSecret });
  }

  createRequest(purpose) {
    // 1. Create a signing request with a random challenge for `purpose`.
    // 2. Return the deeplink/QR payload the SİMA app opens.
    throw new Error('SİMA integration is not configured yet.');
  }

  getResult(requestId) {
    // 1. Ask SİMA for the request status.
    // 2. When signed: verify the signature against the challenge and the certificate
    //    chain, then read the FIN and full name from the certificate.
    throw new Error('SİMA integration is not configured yet.');
  }
}

export function createSimaProvider(env = process.env) {
  if (env.DEMO === '1') return new MockSimaProvider();
  return new SimaProvider({ apiUrl: env.SIMA_API_URL, clientId: env.SIMA_CLIENT_ID, clientSecret: env.SIMA_CLIENT_SECRET });
}
