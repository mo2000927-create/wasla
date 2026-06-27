'use strict';
/* Security regression tests — proves each hardening fix actually blocks the attack.
   Run: node test/security.js */

const fs = require('fs');
const path = require('path');
const os = require('os');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wasla-sec-'));
process.env.DATA_DIR = tmp;
process.env.PAYMENTS_MODE = 'simulated';
process.env.VERIFICATION_MODE = 'manual';
process.env.SMS_MODE = 'console';
process.env.NODE_ENV = 'test';

const svc = require('../src/services');
const sec = require('../src/security');
const { getDB } = require('../src/db');

let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log('  \u2713', name); }
  else { failed++; console.log('  \u2717 FAIL:', name); }
}
function throws(fn, status) {
  try { fn(); return false; } catch (e) { return status ? e.status === status : true; }
}
async function throwsAsync(fn, status) {
  try { await fn(); return false; } catch (e) { return status ? e.status === status : true; }
}

(async () => {
  console.log('WASLA platform — SECURITY tests\n');
  require('../src/seed').ensureSeed();
  const db = getDB();

  // ---- 1. Privilege escalation: cannot self-register as ops ----
  console.log('1. Privilege escalation defense');
  check('registering role=ops is rejected (403)', throws(() =>
    svc.registerOrg({ role: 'ops', legalNameAr: 'مهاجم', city: 'dmm' }), 403));
  check('registering unknown role is rejected', throws(() =>
    svc.registerOrg({ role: 'admin', legalNameAr: 'x', city: 'dmm' }), 403));
  check('registering role=buyer is allowed', (() => {
    try { const o = svc.registerOrg({ role: 'buyer', legalNameAr: 'مصنع شرعي', city: 'dmm' }); return o.role === 'buyer'; } catch { return false; }
  })());

  // ---- 2. Password policy ----
  console.log('\n2. Password strength policy');
  const mkOrg = () => svc.registerOrg({ role: 'buyer', legalNameAr: 'مصنع', city: 'dmm' });
  check('weak password "123" rejected', await throwsAsync(() =>
    svc.registerUser({ name: 'a', email: 'weak1@test.sa', password: '123', role: 'buyer', org: mkOrg() }), 400));
  check('short password "Ab1" rejected', await throwsAsync(() =>
    svc.registerUser({ name: 'a', email: 'weak2@test.sa', password: 'Ab1', role: 'buyer', org: mkOrg() }), 400));
  check('letters-only "password" rejected', await throwsAsync(() =>
    svc.registerUser({ name: 'a', email: 'weak3@test.sa', password: 'password', role: 'buyer', org: mkOrg() }), 400));
  check('strong "Strong123" accepted', (async () => {
    try { const u = await svc.registerUser({ name: 'a', email: 'strong@test.sa', password: 'Strong123', role: 'buyer', org: mkOrg() }); return !!u.id; } catch { return false; }
  })() instanceof Promise ? await (async () => { try { await svc.registerUser({ name: 'a', email: 'strong2@test.sa', password: 'Strong123', role: 'buyer', org: mkOrg() }); return true; } catch { return false; } })() : false);

  // ---- 3. Email validation ----
  console.log('\n3. Email validation');
  check('invalid email "abc" rejected', await throwsAsync(() =>
    svc.registerUser({ name: 'a', email: 'abc', password: 'Strong123', role: 'buyer', org: mkOrg() }), 400));
  check('duplicate email rejected (409)', await throwsAsync(async () => {
    await svc.registerUser({ name: 'a', email: 'dup@test.sa', password: 'Strong123', role: 'buyer', org: mkOrg() });
    await svc.registerUser({ name: 'b', email: 'dup@test.sa', password: 'Strong123', role: 'buyer', org: mkOrg() });
  }, 409));

  // ---- 4. Brute-force lockout ----
  console.log('\n4. Brute-force lockout on login');
  const org = mkOrg();
  await svc.registerUser({ name: 'victim', email: 'victim@test.sa', password: 'Strong123', role: 'buyer', org });
  let lockedOut = false;
  for (let i = 0; i < 6; i++) {
    try { svc.login('victim@test.sa', 'WrongPass' + i); }
    catch (e) { if (e.status === 429) lockedOut = true; }
  }
  check('account locks after repeated failures (429)', lockedOut);
  check('correct password also blocked while locked', throws(() => svc.login('victim@test.sa', 'Strong123'), 429));

  // ---- 5. Role guards on privileged actions ----
  console.log('\n5. Authorization guards');
  // a buyer cannot review verifications (ops-only) — enforced at HTTP layer via requireRole;
  // here we verify the service trusts the caller's identity, not client-supplied role.
  const buyerOrg = mkOrg();
  const buyer = await svc.registerUser({ name: 'buyer', email: 'authbuyer@test.sa', password: 'Strong123', role: 'buyer', org: buyerOrg });
  // buyer cannot accept a quote on someone else's RFQ
  const otherBuyerOrg = mkOrg();
  const otherBuyer = await svc.registerUser({ name: 'b2', email: 'authbuyer2@test.sa', password: 'Strong123', role: 'buyer', org: otherBuyerOrg });
  const rfq = svc.createRfq(buyer, { rawText: '10 محمل SKF 6205 الدمام' });
  const supUser = db.findOne('users', u => u.email === 'supplier1@wasla.sa');
  const supTok = svc.login('supplier1@wasla.sa', 'wasla-demo-2026');
  const supReal = svc.userFromToken(supTok.token);
  const q = svc.submitQuote(supReal, rfq.rfq.id, { price: 50, tier: 'oem', lead: 5, warranty: 12 });
  check('buyer cannot accept quote on another buyer\'s RFQ (403)', await throwsAsync(() =>
    svc.acceptQuote(otherBuyer, q.id, { type: 'simulated' }), 403));

  // ---- 6. Unverified supplier still blocked from quoting ----
  console.log('\n6. Verification gate intact');
  const newSupOrg = svc.registerOrg({ role: 'supplier', legalNameAr: 'مورد غير موثق', city: 'dmm', cats: ['bearings'] });
  const newSup = await svc.registerUser({ name: 's', email: 'unverified@test.sa', password: 'Strong123', role: 'supplier', org: newSupOrg });
  check('unverified supplier cannot quote (403)', throws(() =>
    svc.submitQuote(newSup, rfq.rfq.id, { price: 40 }), 403));

  // ---- 7. Sensitive data masking ----
  console.log('\n7. Sensitive data masking');
  const pub = svc.publicOrg(db.findOne('organizations', o => o.role === 'supplier' && o.cr));
  check('CR is masked in public output', pub.cr.includes('\u2022') || pub.cr.length <= 8);
  check('IBAN never exposed in publicOrg', pub.iban === undefined);

  // ---- 8. Category/city injection sanitized ----
  console.log('\n8. Input sanitization');
  const dirty = svc.registerOrg({ role: 'supplier', legalNameAr: 'x', city: 'HACK', cats: ['bearings', 'evil', 'seals'], iban: 'X'.repeat(999) });
  check('invalid city stripped', dirty.city === '');
  check('invalid categories filtered out', dirty.cats.length === 2 && !dirty.cats.includes('evil'));
  check('over-long IBAN truncated', dirty.iban.length <= 34);

  // ---- 9. JWT tamper rejection ----
  console.log('\n9. Token integrity');
  const tok = svc.login('supplier1@wasla.sa', 'wasla-demo-2026').token;
  const parts = tok.split('.');
  const tampered = parts[0] + '.' + parts[1] + '.' + 'x'.repeat(parts[2].length);
  check('tampered JWT signature rejected', svc.userFromToken(tampered) === null);
  // forge a payload claiming ops role
  const forgedPayload = Buffer.from(JSON.stringify({ uid: 'x', role: 'ops', exp: Date.now() / 1000 + 9999 })).toString('base64url');
  const forged = parts[0] + '.' + forgedPayload + '.' + parts[2];
  check('forged ops-role token rejected', svc.userFromToken(forged) === null);

  console.log(`\n${'='.repeat(40)}`);
  console.log(`SECURITY: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(40));
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} process.exit(1); });
