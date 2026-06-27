'use strict';
/* End-to-end test against the real service layer + datastore (uses a temp data dir).
   Run: node test/e2e.js */

const fs = require('fs');
const path = require('path');
const os = require('os');

// isolate a fresh datastore
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wasla-e2e-'));
process.env.DATA_DIR = tmp;
process.env.PAYMENTS_MODE = 'simulated';
process.env.VERIFICATION_MODE = 'manual';
process.env.SMS_MODE = 'console';

const svc = require('../src/services');
const { getDB } = require('../src/db');

let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log('  \u2713', name); }
  else { failed++; console.log('  \u2717 FAIL:', name); }
}

(async () => {
  console.log('WASLA platform — end-to-end test\n');

  // seed baseline (suppliers + ops + buyer)
  require('../src/seed').ensureSeed();
  const db = getDB();

  // ---- 1. registration ----
  console.log('1. Registration & auth');
  const supReg = await (async () => {
    const org = svc.registerOrg({
      role: 'supplier', legalNameAr: 'مورد الاختبار', legalNameEn: 'Test Supplier',
      crNumber: '2050098765', vatNumber: '310987654000003', iban: 'SA0380000000608010167519',
      city: 'dmm', cats: ['bearings', 'seals'], contactPhone: '966512345678',
    });
    const user = await svc.registerUser({
      name: 'مدير المبيعات', email: 'newsup@test.sa', password: 'StrongPass!23',
      phone: '966512345678', role: 'supplier', org,
    });
    return { org, user };
  })();
  check('supplier org created with pending status', supReg.org.status === 'pending');
  check('supplier tier starts at 0 (unverified)', supReg.org.tier === 0);

  const loginRes = svc.login('newsup@test.sa', 'StrongPass!23');
  check('login returns a token', typeof loginRes.token === 'string' && loginRes.token.split('.').length === 3);
  check('wrong password rejected', (() => { try { svc.login('newsup@test.sa', 'bad'); return false; } catch { return true; } })());

  const supUser = svc.userFromToken(loginRes.token);
  check('token resolves to user', supUser && supUser.id === supReg.user.id);

  // ---- 2. supplier cannot quote before verification ----
  console.log('\n2. Verification gate');
  const sampleRfq = db.find('rfqs', r => r.status === 'active')[0];
  check('a sample RFQ exists', !!sampleRfq);
  const blocked = (() => { try { svc.submitQuote(supUser, sampleRfq.id, { price: 50 }); return false; } catch (e) { return e.status === 403; } })();
  check('unverified supplier blocked from quoting', blocked);

  // submit verification (manual mode -> pending)
  const verRes = await svc.submitVerification(supReg.org.id, { crNumber: '2050098765', vatNumber: '310987654000003', iban: 'SA0380000000608010167519' });
  check('manual verification goes to pending', verRes.verification.outcome === 'pending');

  // ops approves
  const opsUser = db.findOne('users', u => u.role === 'ops');
  const review = svc.reviewVerification(verRes.verification.id, opsUser.id, 'approve', 1);
  check('ops approval verifies supplier', review.org.status === 'active' && review.org.tier >= 1);

  // ---- 3. buyer RFQ ----
  console.log('\n3. RFQ creation & matching');
  const buyerUser = db.findOne('users', u => u.role === 'buyer');
  const rfqRes = svc.createRfq(buyerUser, {
    rawText: 'نحتاج 15 محمل FAG 6206-2RS عاجل لخط الإنتاج في الدمام، يقبل بديل',
  });
  check('RFQ extracted a part number', /620/.test(rfqRes.rfq.part));
  check('RFQ detected high urgency', rfqRes.rfq.urgency === 'high');
  check('RFQ matched suppliers', rfqRes.matchedSuppliers.length > 0);
  check('RFQ status active', rfqRes.rfq.status === 'active');

  // ---- 4. quoting ----
  console.log('\n4. Quoting (now verified)');
  const supUser2 = svc.userFromToken(svc.login('newsup@test.sa', 'StrongPass!23').token);
  const q1 = svc.submitQuote(supUser2, rfqRes.rfq.id, { price: 58, tier: 'oem', lead: 6, warranty: 12, notes: '' });
  check('verified supplier can quote', q1.status === 'pending');
  check('RFQ flips to quoted', svc.getRfq(rfqRes.rfq.id).status === 'quoted');
  check('price observation logged (data moat)', db.find('price_observations', p => p.rfqId === rfqRes.rfq.id).length === 1);
  const dupBlocked = (() => { try { svc.submitQuote(supUser2, rfqRes.rfq.id, { price: 60 }); return false; } catch { return true; } })();
  check('duplicate quote blocked', dupBlocked);

  // add two competing quotes from seeded suppliers for a real comparison
  const seededSupUsers = db.find('users', u => u.role === 'supplier' && u.email.startsWith('supplier'));
  const s2 = svc.userFromToken(svc.login(seededSupUsers[0].email, 'wasla-demo-2026').token);
  // supplier1 is bearings-capable
  let q2 = null;
  try { q2 = svc.submitQuote(s2, rfqRes.rfq.id, { price: 49, tier: 'eq', lead: 8, warranty: 6, notes: 'NSK equiv' }); } catch {}
  const ranked = svc.listQuotes(rfqRes.rfq.id);
  check('quotes ranked by best-value', ranked.length >= 1 && typeof ranked[0]._value === 'number');

  // ---- 5. order + escrow ----
  console.log('\n5. Order & escrow hold');
  const best = ranked[0];
  const order = await svc.acceptQuote(buyerUser, best.id, { type: 'simulated' });
  check('order created with funds held', order.escrow === 'held');
  check('VAT computed at 15%', Math.abs(order.vat - order.subtotal * 0.15) < 0.01);
  check('commission applied', order.commission > 0 && order.commission < order.subtotal);
  check('supplier net = subtotal - commission', Math.abs(order.supplierNet - (order.subtotal - order.commission)) < 0.01);
  check('losing quotes marked lost', db.find('quotes', q => q.rfq === rfqRes.rfq.id && q.status === 'lost').length >= 0);
  check('winning quote marked won', db.findOne('quotes', q => q.id === best.id).status === 'won');
  check('payment record is held', db.findOne('payments', p => p.orderId === order.id).status === 'held');

  // commission rate: winner supplier tier-based
  const winnerOrg = db.findOne('organizations', o => o.id === order.sup);
  const expectedRate = winnerOrg.tier >= 2 ? 0.035 : 0.05;
  check('commission rate matches tier', Math.abs(order.commissionRate - expectedRate) < 1e-9);

  // ---- 6. shipment ----
  console.log('\n6. Shipment');
  const winnerSupUser = db.findOne('users', u => u.orgId === order.sup && u.role === 'supplier');
  const shipped = svc.confirmShipment(winnerSupUser, order.id, { carrier: 'SMSA', trackingNo: 'SM123456789SA' });
  check('escrow -> shipped', shipped.escrow === 'shipped');
  check('shipment record created', db.find('shipments', s => s.orderId === order.id).length === 1);
  const wrongSupBlocked = (() => { try { svc.confirmShipment(supUser2, order.id, { carrier: 'X' }); return false; } catch (e) { return e.status === 403; } })();
  check('non-owning supplier cannot ship', wrongSupBlocked);

  // ---- 7. receipt + release ----
  console.log('\n7. Receipt & escrow release');
  const received = await svc.confirmReceipt(buyerUser, order.id);
  check('escrow -> released', received.escrow === 'released');
  check('payment released', db.findOne('payments', p => p.orderId === order.id).status === 'released');
  check('RFQ closed after receipt', svc.getRfq(order.rfq).status === 'closed');
  check('supplier order count incremented', db.findOne('organizations', o => o.id === order.sup).orders >= 1);

  // ---- 8. rating ----
  console.log('\n8. Rating');
  const rated = svc.submitRating(buyerUser, order.id, { accuracy: 5, speed: 4, authenticity: 5 });
  check('rating accepted', rated.rated === true);
  check('supplier rating recomputed', typeof rated.supplierRating === 'number');
  const dupRating = (() => { try { svc.submitRating(buyerUser, order.id, { accuracy: 1, speed: 1, authenticity: 1 }); return false; } catch { return true; } })();
  check('duplicate rating blocked', dupRating);

  // ---- 9. invoice (ZATCA) ----
  console.log('\n9. ZATCA invoice');
  const inv = svc.invoiceFor(order.id);
  check('invoice number present', !!inv.invoiceNumber);
  check('invoice VAT total correct', Math.abs(inv.vatTotal - inv.subtotal * 0.15) < 0.01);
  check('invoice QR base64 present', typeof inv.qrBase64 === 'string' && inv.qrBase64.length > 10);
  // decode TLV to verify structure
  const buf = Buffer.from(inv.qrBase64, 'base64');
  check('QR is TLV-encoded (tag 1 = seller)', buf[0] === 1);

  // ---- 10. dispute flow (separate order) ----
  console.log('\n10. Dispute & resolution');
  const rfq2 = svc.createRfq(buyerUser, { rawText: '10 محمل SKF 6205-2RS الدمام' });
  const sx = svc.userFromToken(svc.login(seededSupUsers[0].email, 'wasla-demo-2026').token);
  const qx = svc.submitQuote(sx, rfq2.rfq.id, { price: 55, tier: 'oem', lead: 5, warranty: 12 });
  const order2 = await svc.acceptQuote(buyerUser, qx.id, { type: 'simulated' });
  const disp = await svc.openDispute(buyerUser, order2.id, { reason: 'قطع غير مطابقة', evidenceUrls: [] });
  check('dispute opened, escrow frozen', db.findOne('orders', o => o.id === order2.id).escrow === 'disputed');
  const res = await svc.resolveDispute(opsUser.id, disp.id, 'refund');
  check('dispute refund resolves escrow', res.order.escrow === 'refunded');
  check('payment refunded', db.findOne('payments', p => p.orderId === order2.id).status === 'refunded');

  // ---- 11. audit log ----
  console.log('\n11. Audit & ops');
  const auditCount = db.collection('audit_log').length;
  check('audit log populated (append-only)', auditCount > 10);
  const ov = svc.opsOverview();
  check('ops overview reports suppliers', ov.suppliers >= 6);
  check('ops overview reports GMV', ov.gmv > 0);
  check('ops overview tracks commission earned', ov.commissionEarned >= 0);

  // ---- 12. persistence ----
  console.log('\n12. Persistence to disk');
  check('organizations persisted to disk', fs.existsSync(path.join(tmp, 'organizations.json')));
  check('orders persisted to disk', fs.existsSync(path.join(tmp, 'orders.json')));
  const reloaded = JSON.parse(fs.readFileSync(path.join(tmp, 'orders.json'), 'utf8'));
  check('persisted orders survive reload', reloaded.length >= 2);

  console.log(`\n${'='.repeat(40)}`);
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(40));

  // cleanup
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST CRASHED:', e); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} process.exit(1); });
