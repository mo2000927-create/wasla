'use strict';
/* Security primitives built only on Node's built-in crypto — no external packages.
   - Password hashing: scrypt (memory-hard, recommended by Node docs)
   - Tokens: HMAC-SHA256 signed JWTs
   - OTP + ID generation */

const crypto = require('crypto');
const config = require('./config');

/* ---------- Passwords (scrypt) ---------- */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('hex')}$${derived.toString('hex')}`;
}

function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const derived = crypto.scryptSync(String(password), salt, expected.length, {
      N: parseInt(N, 10), r: parseInt(r, 10), p: parseInt(p, 10),
    });
    return crypto.timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

/* ---------- JWT (HS256) ---------- */
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlJSON(obj) { return b64url(JSON.stringify(obj)); }
function fromB64url(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

function signToken(payload, ttlHours = config.sessionTtlHours) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlHours * 3600 };
  const head = b64urlJSON(header);
  const data = b64urlJSON(body);
  const sig = b64url(crypto.createHmac('sha256', config.jwtSecret).update(`${head}.${data}`).digest());
  return `${head}.${data}.${sig}`;
}

function verifyToken(token) {
  try {
    const [head, data, sig] = String(token).split('.');
    if (!head || !data || !sig) return null;
    const expected = b64url(crypto.createHmac('sha256', config.jwtSecret).update(`${head}.${data}`).digest());
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const body = JSON.parse(fromB64url(data).toString('utf8'));
    if (body.exp && body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch {
    return null;
  }
}

/* ---------- IDs, OTP, CSRF ---------- */
function genId(prefix) {
  return `${prefix}_${crypto.randomBytes(9).toString('hex')}`;
}
function seqId(prefix, n) {
  return `${prefix}-${n}`;
}
function genOtp() {
  return String(crypto.randomInt(100000, 1000000)); // 6 digits
}
function csrfToken() {
  return crypto.randomBytes(24).toString('hex');
}
function sha256(str) {
  return crypto.createHash('sha256').update(String(str)).digest('hex');
}

module.exports = {
  hashPassword, verifyPassword,
  signToken, verifyToken,
  genId, seqId, genOtp, csrfToken, sha256,
};
