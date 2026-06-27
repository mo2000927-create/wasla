'use strict';
/* Service layer — all business logic. HTTP handlers call into these functions.
   Enforces the strategy's rules: success-fee commissions, escrow state machine,
   trust tiers, quote privacy, append-only audit log. */

const { getDB } = require('./db');
const sec = require('./security');
const config = require('./config');
const engine = require('./rfq-engine');
const payments = require('./payments');
const verification = require('./verification');
const invoicing = require('./invoicing');

const db = () => getDB();

/* ---------- input validation & security helpers ---------- */
// Only these roles may self-register. 'ops' can NEVER be created via the public API.
const SELF_REGISTER_ROLES = ['buyer', 'supplier'];
const VALID_CITIES = ['dmm', 'ruh', 'jed', 'jub'];
const VALID_CATS = ['bearings', 'seals', 'filters', 'valves', 'belts', 'motors', 'pumps', 'other'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^9665\d{8}$/; // Saudi mobile in international format

function validateEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(e) || e.length > 254) throw httpErr(400, 'بريد إلكتروني غير صالح / Invalid email');
  return e;
}
// Password policy: min 8 chars, at least one letter and one digit.
function validatePassword(password) {
  const p = String(password || '');
  if (p.length < 8) throw httpErr(400, 'كلمة المرور 8 أحرف على الأقل / Password must be at least 8 characters');
  if (p.length > 200) throw httpErr(400, 'كلمة المرور طويلة جداً / Password too long');
  if (!/[A-Za-z\u0600-\u06FF]/.test(p) || !/\d/.test(p)) {
    throw httpErr(400, 'كلمة المرور تحتاج حرفاً ورقماً / Password needs a letter and a number');
  }
  return p;
}
function cleanStr(s, max = 120) {
  return String(s || '').trim().slice(0, max);
}
function validateRole(role) {
  if (!SELF_REGISTER_ROLES.includes(role)) throw httpErr(403, 'دور غير مسموح / Role not allowed');
  return role;
}

/* ---------- audit ---------- */
function audit(actor, action, entityType, entityId, payload = {}, ip = '') {
  db().insert('audit_log', {
    id: sec.genId('aud'),
    actor, action, entityType, entityId,
    payload, ip,
    at: new Date().toISOString(),
  });
}

/* ---------- notifications ---------- */
function notify(recipient, channel, templateId, body, meta = {}) {
  const n = {
    id: sec.genId('ntf'),
    recipient, channel, templateId, body, meta,
    at: new Date().toISOString(),
  };
  db().insert('notifications', n);
  if (config.whatsapp.businessNumber && channel === 'whatsapp') {
    // platform-side: a real WhatsApp Business API send would go here
  }
  return n;
}

/* ---------- OTP ---------- */
async function requestOtp(phone) {
  const ph = cleanStr(phone, 15);
  const code = sec.genOtp();
  const expires = Date.now() + config.sms.otpTtlMinutes * 60000;
  // invalidate prior OTPs for this phone
  db().replaceAll('otps', db().find('otps', o => o.phone !== ph));
  db().insert('otps', { phone: ph, codeHash: sec.sha256(code), expires, tries: 0 });
  const res = await verification.sendOtp(ph, code);
  // Only ever expose the code in local dev (console SMS + non-production). Never in production.
  const leakable = config.sms.mode === 'console' && config.nodeEnv !== 'production';
  return { sent: res.delivered, channel: res.channel, devCode: leakable ? code : undefined };
}

function verifyOtp(phone, code) {
  const rec = db().findOne('otps', o => o.phone === phone);
  if (!rec) return { ok: false, reason: 'no_otp' };
  if (Date.now() > rec.expires) return { ok: false, reason: 'expired' };
  if (rec.tries >= 5) return { ok: false, reason: 'too_many_tries' };
  rec.tries++;
  db().persist('otps');
  if (sec.sha256(code) !== rec.codeHash) return { ok: false, reason: 'mismatch' };
  db().replaceAll('otps', db().find('otps', o => o.phone !== phone));
  return { ok: true };
}

/* ---------- registration & auth ---------- */
function emailTaken(email) {
  return !!db().findOne('users', u => u.email.toLowerCase() === String(email).toLowerCase());
}

function registerOrg({ role, legalNameAr, legalNameEn, crNumber, vatNumber, iban, city, cats = [], contactPhone }) {
  validateRole(role); // blocks self-registration as 'ops' or any unknown role
  const safeCity = VALID_CITIES.includes(city) ? city : '';
  const safeCats = Array.isArray(cats) ? cats.filter(c => VALID_CATS.includes(c)) : [];
  const org = {
    id: sec.genId('org'),
    role, // 'buyer' (factory) or 'supplier' only
    ar: cleanStr(legalNameAr), en: cleanStr(legalNameEn || legalNameAr),
    cr: cleanStr(crNumber, 20), vat: cleanStr(vatNumber, 20), iban: cleanStr(iban, 34),
    city: safeCity,
    cats: role === 'supplier' ? safeCats : [],
    tier: role === 'supplier' ? 0 : null, // 0 = unverified, 1 reg, 2 verified, 3 field-audited
    status: role === 'supplier' ? 'pending' : 'active', // suppliers must verify before quoting
    rating: role === 'supplier' ? 0 : null,
    fill: role === 'supplier' ? 0 : null,
    resp: role === 'supplier' ? 120 : null,
    orders: 0, disputes: 0,
    contactPhone: cleanStr(contactPhone, 15),
    since: new Date().toISOString().slice(0, 7),
    created: new Date().toISOString(),
  };
  db().insert('organizations', org);
  audit('system', 'org.register', 'organization', org.id, { role });
  return org;
}

async function registerUser({ name, email, password, phone, role, org }) {
  const cleanEmail = validateEmail(email);
  validatePassword(password);
  if (emailTaken(cleanEmail)) throw httpErr(409, 'البريد مستخدم مسبقاً / Email already registered');
  const user = {
    id: sec.genId('usr'),
    orgId: org.id,
    name: cleanStr(name), email: cleanEmail,
    phone: cleanStr(phone, 15),
    role, // buyer | supplier (validated in registerOrg)
    passwordHash: sec.hashPassword(password),
    phoneVerified: false,
    created: new Date().toISOString(),
  };
  db().insert('users', user);
  audit(user.id, 'user.register', 'user', user.id, { role, orgId: org.id });
  return user;
}

/* In-memory login throttle: lock after 5 failures within 15 min. */
const _loginFails = new Map(); // email -> { count, until }
const LOGIN_MAX = 5, LOGIN_WINDOW = 15 * 60000;

function login(email, password) {
  const key = String(email || '').toLowerCase();
  const now = Date.now();
  const rec = _loginFails.get(key);
  if (rec && rec.until > now && rec.count >= LOGIN_MAX) {
    const mins = Math.ceil((rec.until - now) / 60000);
    throw httpErr(429, `محاولات كثيرة، حاول بعد ${mins} دقيقة / Too many attempts, try again in ${mins} min`);
  }
  const user = db().findOne('users', u => u.email === key);
  if (!user || !sec.verifyPassword(password, user.passwordHash)) {
    const r = (rec && rec.until > now) ? rec : { count: 0, until: now + LOGIN_WINDOW };
    r.count++; r.until = now + LOGIN_WINDOW;
    _loginFails.set(key, r);
    audit(user ? user.id : 'unknown', 'user.login_failed', 'user', user ? user.id : key, {});
    throw httpErr(401, 'بيانات الدخول غير صحيحة / Invalid credentials');
  }
  _loginFails.delete(key); // success clears the counter
  const token = sec.signToken({ uid: user.id, orgId: user.orgId, role: user.role });
  audit(user.id, 'user.login', 'user', user.id, {});
  return { token, user: publicUser(user) };
}

function userFromToken(token) {
  const payload = sec.verifyToken(token);
  if (!payload) return null;
  const user = db().findOne('users', u => u.id === payload.uid);
  return user || null;
}

function publicUser(u) {
  const org = db().findOne('organizations', o => o.id === u.orgId);
  return {
    id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role,
    phoneVerified: u.phoneVerified,
    org: org ? publicOrg(org) : null,
  };
}
function publicOrg(o) {
  return {
    id: o.id, role: o.role, ar: o.ar, en: o.en, city: o.city,
    cats: o.cats, tier: o.tier, status: o.status,
    rating: o.rating, fill: o.fill, resp: o.resp, orders: o.orders, disputes: o.disputes,
    cr: o.cr ? maskCr(o.cr) : '', vat: o.vat ? maskCr(o.vat) : '', since: o.since,
  };
}
function maskCr(s) { s = String(s); return s.length > 4 ? '••••' + s.slice(-4) : s; }

/* ---------- supplier verification ---------- */
async function submitVerification(orgId, { crNumber, vatNumber, iban, docUrl }) {
  const org = db().findOne('organizations', o => o.id === orgId);
  if (!org || org.role !== 'supplier') throw httpErr(404, 'Supplier not found');
  org.cr = crNumber || org.cr;
  org.vat = vatNumber || org.vat;
  org.iban = iban || org.iban;
  db().persist('organizations');

  const result = await verification.verifyCR({ crNumber: org.cr, vatNumber: org.vat, legalNameAr: org.ar });
  const rec = {
    id: sec.genId('ver'),
    orgId, tierRequested: 1,
    method: result.method, outcome: result.outcome, detail: result.detail,
    docUrl: docUrl || '',
    at: new Date().toISOString(), reviewedBy: null, reviewedAt: null,
  };
  db().insert('verifications', rec);

  if (result.outcome === 'verified') {
    org.tier = 1; org.status = 'active';
    db().persist('organizations');
    audit('system', 'supplier.verified', 'organization', orgId, { method: result.method });
  } else {
    audit('system', 'supplier.verification_pending', 'organization', orgId, { method: result.method });
  }
  return { verification: rec, org: publicOrg(org) };
}

// ops manual decision
function reviewVerification(verId, opsUserId, decision /* 'approve'|'reject' */, tier = 1) {
  const rec = db().findOne('verifications', v => v.id === verId);
  if (!rec) throw httpErr(404, 'Verification not found');
  const org = db().findOne('organizations', o => o.id === rec.orgId);
  rec.reviewedBy = opsUserId; rec.reviewedAt = new Date().toISOString();
  rec.outcome = decision === 'approve' ? 'verified' : 'rejected';
  db().persist('verifications');
  if (decision === 'approve') {
    org.tier = Math.max(org.tier || 0, tier); org.status = 'active';
  } else {
    org.status = 'rejected';
  }
  db().persist('organizations');
  audit(opsUserId, `supplier.${decision}`, 'organization', org.id, { tier });
  return { verification: rec, org: publicOrg(org) };
}

function upgradeTier(orgId, opsUserId, tier) {
  const org = db().findOne('organizations', o => o.id === orgId);
  if (!org) throw httpErr(404, 'Supplier not found');
  org.tier = tier;
  db().persist('organizations');
  audit(opsUserId, 'supplier.tier_upgrade', 'organization', orgId, { tier });
  return publicOrg(org);
}

/* ---------- RFQ lifecycle ---------- */
function createRfq(user, { rawText, part, brand, qty, cat, urgency, city, equivalents_ok }) {
  const ex = engine.extract(rawText || `${brand || ''} ${part || ''} ${qty || ''}`);
  const seq = db().nextSeq('rfq', 1043);
  const rfq = {
    id: sec.seqId('RFQ', seq),
    buyerOrgId: user.orgId,
    buyerUserId: user.id,
    raw: rawText || '',
    part: part || ex.part,
    brand: brand || ex.brand,
    qty: qty || ex.qty,
    unit: 'pc',
    cat: cat || ex.cat,
    urgency: urgency || ex.urgency,
    city: city || ex.city || (db().findOne('organizations', o => o.id === user.orgId) || {}).city || 'dmm',
    equivalents_ok: equivalents_ok != null ? equivalents_ok : ex.equivalents_ok,
    equivalents: ex.equivalents,
    confidence: ex.confidence,
    status: 'active', // active -> quoted -> ordered -> closed
    created: new Date().toISOString(),
    matchedCount: 0,
  };

  // match & broadcast
  const suppliers = db().find('organizations', o => o.role === 'supplier');
  const matched = engine.matchSuppliers(rfq, suppliers);
  rfq.matchedCount = matched.length;
  db().insert('rfqs', rfq);

  for (const s of matched) {
    notify(s.contactPhone || s.id, 'whatsapp', 'rfq_broadcast',
      `طلب جديد ${rfq.id}: ${rfq.part} ×${rfq.qty} — ${rfq.city}`, { rfqId: rfq.id, supplierId: s.id });
  }

  // grow catalog as a by-product
  if (rfq.part && rfq.part !== '—' && !db().findOne('parts', p => p.part === rfq.part)) {
    db().insert('parts', { id: sec.genId('part'), part: rfq.part, brand: rfq.brand, cat: rfq.cat, firstSeen: rfq.created });
  }

  audit(user.id, 'rfq.create', 'rfq', rfq.id, { part: rfq.part, matched: matched.length });
  return { rfq, matchedSuppliers: matched.map(publicOrg) };
}

function listRfqsForBuyer(orgId) {
  return db().find('rfqs', r => r.buyerOrgId === orgId)
    .sort((a, b) => b.created.localeCompare(a.created));
}

// Suppliers see RFQs matched to their categories & city, that are still open.
function listOpenRfqsForSupplier(org) {
  return db().find('rfqs', r =>
    (r.status === 'active' || r.status === 'quoted') &&
    org.cats.includes(r.cat)
  ).sort((a, b) => b.created.localeCompare(a.created));
}

function getRfq(rfqId) {
  return db().findOne('rfqs', r => r.id === rfqId);
}

/* ---------- quotes ---------- */
function submitQuote(supplierUser, rfqId, { price, tier, lead, warranty, notes }) {
  const org = db().findOne('organizations', o => o.id === supplierUser.orgId);
  if (!org || org.role !== 'supplier') throw httpErr(403, 'Not a supplier');
  if (org.status !== 'active') throw httpErr(403, 'يجب توثيق الحساب قبل التسعير / Verify your account before quoting');
  const rfq = getRfq(rfqId);
  if (!rfq) throw httpErr(404, 'RFQ not found');
  if (!['active', 'quoted'].includes(rfq.status)) throw httpErr(409, 'RFQ no longer open');
  if (price == null || price <= 0) throw httpErr(400, 'سعر غير صالح / Invalid price');

  // one quote per supplier per RFQ
  const existing = db().findOne('quotes', q => q.rfq === rfqId && q.sup === org.id);
  if (existing) throw httpErr(409, 'سبق إرسال عرض لهذا الطلب / Already quoted');

  const seq = db().nextSeq('quote', 1);
  const quote = {
    id: sec.seqId('Q', seq),
    rfq: rfqId, sup: org.id,
    price: Math.round(price * 100) / 100,
    tier: tier || 'oem',
    lead: Math.max(1, parseInt(lead, 10) || 24),
    warranty: Math.max(0, parseInt(warranty, 10) || 0),
    notes: notes || '',
    at: new Date().toISOString(),
    status: 'pending', // pending -> won | lost
  };
  db().insert('quotes', quote);
  if (rfq.status === 'active') { rfq.status = 'quoted'; db().persist('rfqs'); }

  // data moat: log the price observation
  db().insert('price_observations', {
    id: sec.genId('po'),
    part: rfq.part, brand: rfq.brand, cat: rfq.cat,
    tier: quote.tier, price: quote.price, city: rfq.city,
    supplierId: org.id, rfqId, at: quote.at,
  });

  notify(rfq.buyerUserId, 'push', 'new_quote', `عرض جديد على ${rfqId}`, { rfqId, quoteId: quote.id });
  audit(supplierUser.id, 'quote.submit', 'quote', quote.id, { rfqId, price: quote.price });
  return quote;
}

function listQuotes(rfqId) {
  const quotes = db().find('quotes', q => q.rfq === rfqId);
  const suppliers = db().find('organizations', o => o.role === 'supplier');
  const ranked = engine.rankQuotes(quotes, suppliers);
  // attach supplier display info (name + tier + rating) without leaking sensitive fields
  return ranked.map(q => {
    const s = suppliers.find(x => x.id === q.sup) || {};
    return { ...q, supplier: { ar: s.ar, en: s.en, tier: s.tier, rating: s.rating, city: s.city } };
  });
}

function commissionRate(org) {
  // verified (tier>=2) and field-audited (tier 3) get the lower rate
  return (org && org.tier >= 2) ? config.commission.verified : config.commission.standard;
}

/* ---------- orders + escrow ---------- */
async function acceptQuote(buyerUser, quoteId, paymentSource) {
  const quote = db().findOne('quotes', q => q.id === quoteId);
  if (!quote) throw httpErr(404, 'Quote not found');
  const rfq = getRfq(quote.rfq);
  if (!rfq) throw httpErr(404, 'RFQ not found');
  if (rfq.buyerOrgId !== buyerUser.orgId) throw httpErr(403, 'Not your RFQ');
  if (rfq.status === 'ordered' || rfq.status === 'closed') throw httpErr(409, 'RFQ already ordered');

  const supplier = db().findOne('organizations', o => o.id === quote.sup);
  const buyerOrg = db().findOne('organizations', o => o.id === buyerUser.orgId);

  const subtotal = Math.round(quote.price * rfq.qty * 100) / 100;
  const vat = Math.round(subtotal * config.vatRate * 100) / 100;
  const total = Math.round((subtotal + vat) * 100) / 100;

  // hold funds (escrow)
  const hold = await payments.holdFunds({
    orderId: rfq.id, amountSar: total,
    description: `WASLA ${rfq.id} — ${rfq.part} ×${rfq.qty}`,
    source: paymentSource,
  });
  if (hold.status !== 'held') throw httpErr(402, 'تعذّر حجز المبلغ / Payment hold failed');

  // mark quotes won/lost
  for (const q of db().find('quotes', q => q.rfq === rfq.id)) {
    q.status = q.id === quoteId ? 'won' : 'lost';
  }
  db().persist('quotes');
  rfq.status = 'ordered'; db().persist('rfqs');

  const rate = commissionRate(supplier);
  const commission = Math.round(subtotal * rate * 100) / 100;
  const supplierNet = Math.round((subtotal - commission) * 100) / 100;

  const ordSeq = db().nextSeq('order', 2211);
  const invSeq = db().nextSeq('invoice', 212);
  const order = {
    id: sec.seqId('ORD', ordSeq),
    rfq: rfq.id, quote: quoteId, sup: quote.sup, buyerOrgId: buyerUser.orgId, buyerUserId: buyerUser.id,
    subtotal, vat, total,
    commissionRate: rate, commission, supplierNet,
    escrow: 'held', // held -> shipped -> released | disputed | refunded
    created: new Date().toISOString(),
    ship: null, delivered: null, rated: false,
    inv: `INV-${new Date().getFullYear()}-${String(invSeq).padStart(4, '0')}`,
  };
  db().insert('orders', order);

  db().insert('payments', {
    id: sec.genId('pay'),
    orderId: order.id, provider: hold.provider, providerId: hold.providerId,
    amount: total, currency: 'SAR', status: 'held',
    capturedAt: new Date().toISOString(), releasedAt: null,
  });

  notify(supplier.contactPhone || supplier.id, 'whatsapp', 'order_won',
    `مبروك! فزت بالطلب ${order.id}`, { orderId: order.id });
  audit(buyerUser.id, 'order.create', 'order', order.id, { total, commission, supplier: quote.sup });
  return order;
}

function confirmShipment(supplierUser, orderId, { carrier, trackingNo }) {
  const order = db().findOne('orders', o => o.id === orderId);
  if (!order) throw httpErr(404, 'Order not found');
  if (order.sup !== supplierUser.orgId) throw httpErr(403, 'Not your order');
  if (order.escrow !== 'held') throw httpErr(409, 'Order not in a shippable state');
  order.ship = { carrier, trackingNo, at: new Date().toISOString() };
  order.escrow = 'shipped';
  db().persist('orders');
  db().insert('shipments', {
    id: sec.genId('shp'), orderId, carrier, trackingNo,
    shippedAt: order.ship.at, deliveredAt: null, photoProofUrl: '',
  });
  notify(order.buyerUserId, 'push', 'shipped', `تم شحن طلبك ${orderId}`, { orderId });
  audit(supplierUser.id, 'order.ship', 'order', orderId, { carrier, trackingNo });
  return order;
}

async function confirmReceipt(buyerUser, orderId) {
  const order = db().findOne('orders', o => o.id === orderId);
  if (!order) throw httpErr(404, 'Order not found');
  if (order.buyerOrgId !== buyerUser.orgId) throw httpErr(403, 'Not your order');
  if (!['shipped', 'held'].includes(order.escrow)) throw httpErr(409, 'Cannot confirm in current state');

  order.delivered = new Date().toISOString();
  order.escrow = 'released';
  db().persist('orders');

  // release escrow funds to supplier
  const pay = db().findOne('payments', p => p.orderId === orderId);
  if (pay) {
    const supplier = db().findOne('organizations', o => o.id === order.sup);
    const released = await payments.releaseFunds(pay, { supplierIban: supplier && supplier.iban });
    pay.status = 'released'; pay.releasedAt = released.releasedAt;
    db().persist('payments');
  }

  // update supplier stats
  const supplier = db().findOne('organizations', o => o.id === order.sup);
  if (supplier) { supplier.orders = (supplier.orders || 0) + 1; db().persist('organizations'); }

  // close the RFQ
  const rfq = getRfq(order.rfq);
  if (rfq) { rfq.status = 'closed'; db().persist('rfqs'); }

  notify(order.sup, 'whatsapp', 'released', `تم تحرير مبلغ الطلب ${orderId}`, { orderId });
  audit(buyerUser.id, 'order.receive', 'order', orderId, {});
  return order;
}

async function openDispute(buyerUser, orderId, { reason, evidenceUrls = [] }) {
  const order = db().findOne('orders', o => o.id === orderId);
  if (!order) throw httpErr(404, 'Order not found');
  if (order.buyerOrgId !== buyerUser.orgId) throw httpErr(403, 'Not your order');
  order.escrow = 'disputed';
  db().persist('orders');
  const disp = {
    id: sec.genId('dsp'), orderId, openedBy: buyerUser.id,
    reason: reason || '', evidenceUrls, resolution: null,
    at: new Date().toISOString(), resolvedAt: null,
  };
  db().insert('disputes', disp);
  const supplier = db().findOne('organizations', o => o.id === order.sup);
  if (supplier) { supplier.disputes = (supplier.disputes || 0) + 1; db().persist('organizations'); }
  audit(buyerUser.id, 'dispute.open', 'order', orderId, { reason });
  return disp;
}

async function resolveDispute(opsUserId, disputeId, resolution /* 'refund'|'release' */) {
  const disp = db().findOne('disputes', d => d.id === disputeId);
  if (!disp) throw httpErr(404, 'Dispute not found');
  const order = db().findOne('orders', o => o.id === disp.orderId);
  const pay = db().findOne('payments', p => p.orderId === disp.orderId);
  if (resolution === 'refund') {
    if (pay) { const r = await payments.refundFunds(pay); pay.status = 'refunded'; pay.refundedAt = r.refundedAt; db().persist('payments'); }
    order.escrow = 'refunded';
  } else {
    if (pay) { const r = await payments.releaseFunds(pay); pay.status = 'released'; pay.releasedAt = r.releasedAt; db().persist('payments'); }
    order.escrow = 'released';
  }
  db().persist('orders');
  disp.resolution = resolution; disp.resolvedAt = new Date().toISOString();
  db().persist('disputes');
  audit(opsUserId, 'dispute.resolve', 'order', disp.orderId, { resolution });
  return { dispute: disp, order };
}

/* ---------- ratings ---------- */
function submitRating(buyerUser, orderId, { accuracy, speed, authenticity }) {
  const order = db().findOne('orders', o => o.id === orderId);
  if (!order) throw httpErr(404, 'Order not found');
  if (order.buyerOrgId !== buyerUser.orgId) throw httpErr(403, 'Not your order');
  if (order.rated) throw httpErr(409, 'Already rated');
  const a = clamp1to5(accuracy), s = clamp1to5(speed), au = clamp1to5(authenticity);
  const avg = (a + s + au) / 3;
  db().insert('ratings', {
    id: sec.genId('rtg'), orderId, supplierId: order.sup, buyerOrgId: order.buyerOrgId,
    accuracy: a, speed: s, authenticity: au, avg: Math.round(avg * 10) / 10,
    at: new Date().toISOString(),
  });
  order.rated = true; db().persist('orders');

  // recompute supplier rolling rating
  const supplier = db().findOne('organizations', o => o.id === order.sup);
  if (supplier) {
    const ratings = db().find('ratings', r => r.supplierId === supplier.id);
    const mean = ratings.reduce((sum, r) => sum + r.avg, 0) / ratings.length;
    supplier.rating = Math.round(mean * 10) / 10;
    db().persist('organizations');
  }
  audit(buyerUser.id, 'order.rate', 'order', orderId, { avg });
  return { rated: true, supplierRating: supplier ? supplier.rating : null };
}

function clamp1to5(n) { n = parseInt(n, 10) || 0; return Math.max(1, Math.min(5, n)); }

/* ---------- invoice ---------- */
function getOrderFull(orderId, requesterOrgId) {
  const order = db().findOne('orders', o => o.id === orderId);
  if (!order) throw httpErr(404, 'Order not found');
  if (requesterOrgId && order.buyerOrgId !== requesterOrgId && order.sup !== requesterOrgId) {
    throw httpErr(403, 'Not your order');
  }
  const rfq = getRfq(order.rfq);
  const quote = db().findOne('quotes', q => q.id === order.quote);
  const supplier = db().findOne('organizations', o => o.id === order.sup);
  const buyerOrg = db().findOne('organizations', o => o.id === order.buyerOrgId);
  const dispute = db().findOne('disputes', d => d.orderId === orderId && !d.resolvedAt);
  return {
    order,
    rfq,
    quote,
    supplier: supplier ? { ar: supplier.ar, en: supplier.en, tier: supplier.tier, rating: supplier.rating, city: supplier.city } : null,
    buyer: buyerOrg ? { ar: buyerOrg.ar, en: buyerOrg.en, city: buyerOrg.city } : null,
    dispute: dispute || null,
  };
}

// Orders for a buyer or supplier (list)
function listOrders(org) {
  let orders;
  if (org.role === 'buyer') orders = db().find('orders', o => o.buyerOrgId === org.id);
  else if (org.role === 'supplier') orders = db().find('orders', o => o.sup === org.id);
  else orders = db().collection('orders').slice();
  return orders.sort((a, b) => b.created.localeCompare(a.created)).map(o => {
    const rfq = getRfq(o.rfq);
    return { ...o, part: rfq ? rfq.part : '', cat: rfq ? rfq.cat : '', qty: rfq ? rfq.qty : 0 };
  });
}

function invoiceFor(orderId) {
  const order = db().findOne('orders', o => o.id === orderId);
  if (!order) throw httpErr(404, 'Order not found');
  const rfq = getRfq(order.rfq);
  const quote = db().findOne('quotes', q => q.id === order.quote);
  const supplier = db().findOne('organizations', o => o.id === order.sup);
  const buyerOrg = db().findOne('organizations', o => o.id === order.buyerOrgId);
  return invoicing.generateInvoice({ order, rfq, quote, supplier, buyerOrg });
}

/* ---------- ops dashboards ---------- */
function opsOverview() {
  const rfqs = db().collection('rfqs');
  const orders = db().collection('orders');
  const closedWithin = rfqs.filter(r => r.status !== 'active');
  return {
    suppliers: db().find('organizations', o => o.role === 'supplier').length,
    buyers: db().find('organizations', o => o.role === 'buyer').length,
    activeRfqs: rfqs.filter(r => r.status === 'active' || r.status === 'quoted').length,
    orders: orders.length,
    escrowHeld: orders.filter(o => o.escrow === 'held' || o.escrow === 'shipped').length,
    disputes: db().find('disputes', d => !d.resolvedAt).length,
    pendingVerifications: db().find('verifications', v => v.outcome === 'pending').length,
    gmv: Math.round(orders.reduce((s, o) => s + o.total, 0)),
    commissionEarned: Math.round(orders.filter(o => o.escrow === 'released').reduce((s, o) => s + o.commission, 0)),
  };
}

/* ---------- error helper ---------- */
function httpErr(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

module.exports = {
  audit, notify,
  requestOtp, verifyOtp,
  registerOrg, registerUser, login, userFromToken, publicUser, publicOrg,
  submitVerification, reviewVerification, upgradeTier,
  createRfq, listRfqsForBuyer, listOpenRfqsForSupplier, getRfq,
  submitQuote, listQuotes, commissionRate,
  acceptQuote, confirmShipment, confirmReceipt, openDispute, resolveDispute,
  submitRating, invoiceFor, opsOverview, getOrderFull, listOrders,
  httpErr,
};
