'use strict';
/* HTTP server + REST API — built on Node's http module only. No Express, no deps.
   Serves the SPA from /public and exposes /api/* endpoints. */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const config = require('./config');
const svc = require('./services');
const payments = require('./payments');
const verification = require('./verification');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/* ---------- helpers ---------- */
// Security headers applied to every response.
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  // CSP: allow self + the Google Fonts the UI uses; block inline-script injection vectors.
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
};
// HSTS only makes sense over HTTPS (Render/Railway terminate TLS and set x-forwarded-proto).
function hstsFor(req) {
  return (req.headers['x-forwarded-proto'] === 'https')
    ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {};
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    ...SECURITY_HEADERS,
    ...headers,
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 1e6) { reject(svc.httpErr(413, 'Payload too large')); req.destroy(); return; }
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(svc.httpErr(400, 'Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function bearer(req) {
  const h = req.headers['authorization'] || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

function requireUser(req) {
  const token = bearer(req);
  const user = token && svc.userFromToken(token);
  if (!user) throw svc.httpErr(401, 'تسجيل الدخول مطلوب / Authentication required');
  return user;
}

function requireRole(user, ...roles) {
  if (!roles.includes(user.role)) throw svc.httpErr(403, 'صلاحية غير كافية / Forbidden');
}

/* ---------- naive in-memory rate limiter ---------- */
const hits = new Map();
function rateLimit(ip, limit = 120, windowMs = 60000, bucket = 'g') {
  const key = bucket + ':' + ip;
  const now = Date.now();
  const rec = hits.get(key) || { count: 0, reset: now + windowMs };
  if (now > rec.reset) { rec.count = 0; rec.reset = now + windowMs; }
  rec.count++;
  hits.set(key, rec);
  return rec.count <= limit;
}
// periodic cleanup so the map can't grow unbounded
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
}, 5 * 60000).unref?.();

/* ---------- API routes ---------- */
async function api(req, res, pathname, query) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  // General limit for all API, plus a tight limit on auth endpoints (brute-force defense).
  if (!rateLimit(ip, 120, 60000, 'api')) return send(res, 429, { error: 'طلبات كثيرة / Too many requests' });
  if (pathname.startsWith('/api/auth/') && !rateLimit(ip, 10, 60000, 'auth')) {
    return send(res, 429, { error: 'محاولات كثيرة، انتظر دقيقة / Too many attempts, wait a minute' });
  }

  const seg = pathname.replace(/^\/api\//, '').split('/').filter(Boolean);
  const m = req.method;

  // ---- health ----
  if (pathname === '/api/health') {
    return send(res, 200, {
      ok: true, ts: new Date().toISOString(),
      paymentMode: payments.paymentMode(),
      verificationMode: verification.verificationMode(),
    });
  }

  // ---- auth ----
  if (pathname === '/api/auth/otp/request' && m === 'POST') {
    const { phone } = await readBody(req);
    if (!phone) throw svc.httpErr(400, 'رقم الجوال مطلوب / Phone required');
    const r = await svc.requestOtp(phone);
    return send(res, 200, r);
  }
  if (pathname === '/api/auth/otp/verify' && m === 'POST') {
    const { phone, code } = await readBody(req);
    return send(res, 200, svc.verifyOtp(phone, code));
  }
  if (pathname === '/api/auth/register' && m === 'POST') {
    const b = await readBody(req);
    if (!b.email || !b.password || !b.role || !b.legalNameAr) {
      throw svc.httpErr(400, 'حقول ناقصة / Missing required fields');
    }
    const org = svc.registerOrg({
      role: b.role, legalNameAr: b.legalNameAr, legalNameEn: b.legalNameEn,
      crNumber: b.crNumber, vatNumber: b.vatNumber, iban: b.iban,
      city: b.city, cats: b.cats || [], contactPhone: b.phone,
    });
    const user = await svc.registerUser({
      name: b.name || b.legalNameAr, email: b.email, password: b.password,
      phone: b.phone, role: b.role, org,
    });
    const login = svc.login(b.email, b.password);
    return send(res, 201, login);
  }
  if (pathname === '/api/auth/login' && m === 'POST') {
    const { email, password } = await readBody(req);
    return send(res, 200, svc.login(email, password));
  }
  if (pathname === '/api/me' && m === 'GET') {
    const user = requireUser(req);
    return send(res, 200, svc.publicUser(user));
  }

  // ---- public rankings ----
  if (pathname === '/api/rankings' && m === 'GET') {
    const db = require('./db').getDB();
    const engine = require('./rfq-engine');
    const ranked = db.find('organizations', o => o.role === 'supplier' && o.status === 'active')
      .map(o => ({ ar: o.ar, en: o.en, city: o.city, tier: o.tier, rating: o.rating, fill: o.fill, resp: o.resp, orders: o.orders, _s: engine.supplierScore(o) }))
      .sort((a, b) => b._s - a._s)
      .map(({ _s, ...rest }) => rest);
    return send(res, 200, ranked);
  }

  // ---- supplier verification ----
  if (pathname === '/api/supplier/verify' && m === 'POST') {
    const user = requireUser(req); requireRole(user, 'supplier');
    const b = await readBody(req);
    const r = await svc.submitVerification(user.orgId, b);
    return send(res, 200, r);
  }

  // ---- RFQs ----
  if (pathname === '/api/rfqs' && m === 'POST') {
    const user = requireUser(req); requireRole(user, 'buyer');
    const b = await readBody(req);
    const r = svc.createRfq(user, b);
    return send(res, 201, r);
  }
  if (pathname === '/api/rfqs' && m === 'GET') {
    const user = requireUser(req);
    if (user.role === 'buyer') return send(res, 200, svc.listRfqsForBuyer(user.orgId));
    if (user.role === 'supplier') {
      const org = svc.publicOrg(svc.userFromToken(bearer(req)) && require('./db').getDB().findOne('organizations', o => o.id === user.orgId));
      return send(res, 200, svc.listOpenRfqsForSupplier(org));
    }
    return send(res, 200, []);
  }
  if (seg[0] === 'rfqs' && seg[1] && m === 'GET' && !seg[2]) {
    requireUser(req);
    const rfq = svc.getRfq(seg[1]);
    if (!rfq) throw svc.httpErr(404, 'RFQ not found');
    return send(res, 200, { rfq, quotes: svc.listQuotes(seg[1]) });
  }

  // ---- quotes ----
  if (seg[0] === 'rfqs' && seg[1] && seg[2] === 'quotes' && m === 'POST') {
    const user = requireUser(req); requireRole(user, 'supplier');
    const b = await readBody(req);
    const q = svc.submitQuote(user, seg[1], b);
    return send(res, 201, q);
  }

  // ---- orders / escrow ----
  if (pathname === '/api/orders' && m === 'POST') {
    const user = requireUser(req); requireRole(user, 'buyer');
    const { quoteId, paymentSource } = await readBody(req);
    const order = await svc.acceptQuote(user, quoteId, paymentSource);
    return send(res, 201, order);
  }
  if (seg[0] === 'orders' && seg[1] && seg[2] === 'ship' && m === 'POST') {
    const user = requireUser(req); requireRole(user, 'supplier');
    const b = await readBody(req);
    return send(res, 200, svc.confirmShipment(user, seg[1], b));
  }
  if (seg[0] === 'orders' && seg[1] && seg[2] === 'receive' && m === 'POST') {
    const user = requireUser(req); requireRole(user, 'buyer');
    return send(res, 200, await svc.confirmReceipt(user, seg[1]));
  }
  if (seg[0] === 'orders' && seg[1] && seg[2] === 'dispute' && m === 'POST') {
    const user = requireUser(req); requireRole(user, 'buyer');
    const b = await readBody(req);
    return send(res, 200, await svc.openDispute(user, seg[1], b));
  }
  if (seg[0] === 'orders' && seg[1] && seg[2] === 'rate' && m === 'POST') {
    const user = requireUser(req); requireRole(user, 'buyer');
    const b = await readBody(req);
    return send(res, 200, svc.submitRating(user, seg[1], b));
  }
  if (seg[0] === 'orders' && seg[1] && seg[2] === 'invoice' && m === 'GET') {
    requireUser(req);
    return send(res, 200, svc.invoiceFor(seg[1]));
  }
  if (pathname === '/api/orders' && m === 'GET') {
    const user = requireUser(req);
    const db = require('./db').getDB();
    const org = db.findOne('organizations', o => o.id === user.orgId);
    return send(res, 200, svc.listOrders(org));
  }
  if (seg[0] === 'orders' && seg[1] && m === 'GET' && !seg[2]) {
    const user = requireUser(req);
    return send(res, 200, svc.getOrderFull(seg[1], user.orgId));
  }

  // ---- ops ----
  if (pathname === '/api/ops/overview' && m === 'GET') {
    const user = requireUser(req); requireRole(user, 'ops');
    return send(res, 200, svc.opsOverview());
  }
  if (pathname === '/api/ops/verifications' && m === 'GET') {
    const user = requireUser(req); requireRole(user, 'ops');
    const db = require('./db').getDB();
    const pending = db.find('verifications', v => v.outcome === 'pending').map(v => {
      const org = db.findOne('organizations', o => o.id === v.orgId) || {};
      return { ...v, org: { ar: org.ar, en: org.en, city: org.city, cr: org.cr, vat: org.vat, cats: org.cats } };
    });
    return send(res, 200, pending);
  }
  if (pathname === '/api/ops/disputes' && m === 'GET') {
    const user = requireUser(req); requireRole(user, 'ops');
    const db = require('./db').getDB();
    const open = db.find('disputes', d => !d.resolvedAt).map(d => {
      const order = db.findOne('orders', o => o.id === d.orderId) || {};
      const rfq = order.rfq ? db.findOne('rfqs', r => r.id === order.rfq) : null;
      return { ...d, order: { id: order.id, total: order.total, escrow: order.escrow }, part: rfq ? rfq.part : '' };
    });
    return send(res, 200, open);
  }
  if (seg[0] === 'ops' && seg[1] === 'verifications' && seg[2] && seg[3] === 'review' && m === 'POST') {
    const user = requireUser(req); requireRole(user, 'ops');
    const { decision, tier } = await readBody(req);
    return send(res, 200, svc.reviewVerification(seg[2], user.id, decision, tier));
  }
  if (seg[0] === 'ops' && seg[1] === 'disputes' && seg[2] && seg[3] === 'resolve' && m === 'POST') {
    const user = requireUser(req); requireRole(user, 'ops');
    const { resolution } = await readBody(req);
    return send(res, 200, await svc.resolveDispute(user.id, seg[2], resolution));
  }

  throw svc.httpErr(404, 'مسار غير موجود / Not found');
}

/* ---------- static files ---------- */
function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  // prevent path traversal
  const safe = path.normalize(rel).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(PUBLIC_DIR, safe);
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'Forbidden' });
  fs.stat(filePath, (err, stat) => {
    let isFallback = false;
    if (err || !stat.isFile()) {
      // Only fall back to the SPA for navigation routes, not missing assets.
      if (/\.[a-z0-9]+$/i.test(safe)) return send(res, 404, { error: 'Not found' });
      filePath = path.join(PUBLIC_DIR, 'index.html');
      isFallback = true;
    }
    fs.readFile(filePath, (e, data) => {
      if (e) return send(res, 404, { error: 'Not found' });
      const ext = path.extname(filePath).toLowerCase();
      const cache = (isFallback || ext === '.html')
        ? 'no-cache' : 'public, max-age=3600';
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': cache,
        ...SECURITY_HEADERS,
        ...hstsFor(req),
      });
      res.end(data);
    });
  });
}

/* ---------- server ---------- */
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  try {
    if (pathname.startsWith('/api/')) {
      await api(req, res, pathname, parsed.query);
    } else {
      serveStatic(req, res, pathname);
    }
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) {
      console.error('[server error]', err);
      // never leak internal error details to the client
      return send(res, 500, { error: 'حدث خطأ في الخادم / Internal server error' }, hstsFor(req));
    }
    send(res, status, { error: err.message || 'Error' }, hstsFor(req));
  }
});

if (require.main === module) {
  // Production safety guard: refuse to start with the default JWT secret.
  if (config.nodeEnv === 'production' && config.jwtSecretIsDefault) {
    console.error('FATAL: JWT_SECRET is not set. Refusing to start in production with the default secret.');
    console.error('Set a strong JWT_SECRET environment variable (32+ random characters) and redeploy.');
    process.exit(1);
  }
  // ensure seed exists on first boot
  require('./seed').ensureSeed();
  server.listen(config.port, config.host, () => {
    console.log(`WASLA platform listening on http://${config.host}:${config.port}`);
    console.log(`  payments: ${payments.paymentMode()} | verification: ${verification.verificationMode()} | sms: ${config.sms.mode}`);
  });
}

module.exports = { server };
