'use strict';
/* Idempotent seeding. Only populates an empty datastore so production data is never overwritten.
   Creates: ops account, a demo buyer factory, verified suppliers, and a couple of sample RFQs. */

const { getDB } = require('./db');
const sec = require('./security');

function ensureSeed() {
  const db = getDB();
  if (db.collection('organizations').length > 0) return; // already seeded / has data

  const now = new Date();
  const iso = (daysAgo, h = 10, m = 0) => {
    const d = new Date(now); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0); return d.toISOString();
  };

  /* ---- ops team ---- */
  const opsOrg = {
    id: sec.genId('org'), role: 'ops', ar: 'فريق عمليات وصلة', en: 'WASLA Operations',
    city: 'dmm', cats: [], tier: null, status: 'active', orders: 0, disputes: 0,
    since: iso(120).slice(0, 7), created: iso(120),
  };
  db.insert('organizations', opsOrg);
  db.insert('users', {
    id: sec.genId('usr'), orgId: opsOrg.id, name: 'مشرف العمليات', email: 'ops@wasla.sa',
    phone: '966500000000', role: 'ops', passwordHash: sec.hashPassword('wasla-ops-2026'),
    phoneVerified: true, created: iso(120),
  });

  /* ---- suppliers (verified, with track record) ---- */
  const suppliers = [
    { ar: 'مؤسسة الخليج للمحامل', en: 'Gulf Bearings Est.', city: 'dmm', tier: 3, rating: 4.9, fill: 96, resp: 38, orders: 212, disputes: 0, cats: ['bearings', 'seals'], vat: '310123456000003', cr: '2050012345', iban: 'SA4420000001234567891234', phone: '966540000001' },
    { ar: 'شركة الشرقية للقطع الصناعية', en: 'Eastern Industrial Parts Co.', city: 'dmm', tier: 2, rating: 4.7, fill: 91, resp: 55, orders: 163, disputes: 1, cats: ['bearings', 'belts', 'motors'], vat: '310889912000003', cr: '2050022345', iban: 'SA4420000002234567891234', phone: '966540000002' },
    { ar: 'مستودع الرياض للمعدات', en: 'Riyadh Equipment Depot', city: 'ruh', tier: 2, rating: 4.6, fill: 88, resp: 64, orders: 141, disputes: 1, cats: ['valves', 'motors', 'bearings'], vat: '301456778800003', cr: '1010032345', iban: 'SA4420000003234567891234', phone: '966540000003' },
    { ar: 'بيت الفلاتر السعودي', en: 'Saudi Filter House', city: 'dmm', tier: 2, rating: 4.5, fill: 90, resp: 49, orders: 128, disputes: 0, cats: ['filters', 'seals'], vat: '310334455000003', cr: '2050042345', iban: 'SA4420000004234567891234', phone: '966540000004' },
    { ar: 'التقنية للصمامات والمضخات', en: 'Altaqnia Valves & Pumps', city: 'jub', tier: 1, rating: 4.3, fill: 82, resp: 78, orders: 74, disputes: 2, cats: ['valves', 'seals', 'pumps'], vat: '311998877000003', cr: '2055052345', iban: 'SA4420000005234567891234', phone: '966540000005' },
    { ar: 'الأمانة للسيور والنواقل', en: 'Al-Amana Belts & Drives', city: 'ruh', tier: 1, rating: 4.2, fill: 79, resp: 85, orders: 58, disputes: 1, cats: ['belts', 'motors'], vat: '301223344500003', cr: '1010062345', iban: 'SA4420000006234567891234', phone: '966540000006' },
  ];

  const supIds = [];
  suppliers.forEach((s, i) => {
    const org = {
      id: sec.genId('org'), role: 'supplier', ar: s.ar, en: s.en, city: s.city,
      cats: s.cats, tier: s.tier, status: 'active', rating: s.rating, fill: s.fill, resp: s.resp,
      orders: s.orders, disputes: s.disputes, cr: s.cr, vat: s.vat, iban: s.iban,
      contactPhone: s.phone, since: iso(240 - i * 20).slice(0, 7), created: iso(240 - i * 20),
    };
    db.insert('organizations', org);
    supIds.push(org.id);
    db.insert('users', {
      id: sec.genId('usr'), orgId: org.id, name: s.ar, email: `supplier${i + 1}@wasla.sa`,
      phone: s.phone, role: 'supplier', passwordHash: sec.hashPassword('wasla-demo-2026'),
      phoneVerified: true, created: org.created,
    });
    db.insert('verifications', {
      id: sec.genId('ver'), orgId: org.id, tierRequested: s.tier, method: 'wathq',
      outcome: 'verified', detail: { name: s.ar, status: 'active', crNumber: s.cr },
      docUrl: '', at: org.created, reviewedBy: 'system', reviewedAt: org.created,
    });
  });

  /* ---- demo buyer factory ---- */
  const buyerOrg = {
    id: sec.genId('org'), role: 'buyer', ar: 'مصنع الواحة للبلاستيك', en: 'Al-Waha Plastics Factory',
    city: 'dmm', cats: [], tier: null, status: 'active', orders: 0, disputes: 0,
    cr: '2050099999', vat: '310555666700003', iban: '', contactPhone: '966555000111',
    since: iso(60).slice(0, 7), created: iso(60),
  };
  db.insert('organizations', buyerOrg);
  db.insert('users', {
    id: sec.genId('usr'), orgId: buyerOrg.id, name: 'م. خالد العتيبي', email: 'buyer@wasla.sa',
    phone: '966555000111', role: 'buyer', passwordHash: sec.hashPassword('wasla-demo-2026'),
    phoneVerified: true, created: buyerOrg.created,
  });

  /* ---- sample open RFQ to make the supplier view non-empty ---- */
  const seq = db.nextSeq('rfq', 1043);
  const buyerUser = db.findOne('users', u => u.orgId === buyerOrg.id);
  const rfq = {
    id: `RFQ-${seq}`, buyerOrgId: buyerOrg.id, buyerUserId: buyerUser.id,
    raw: 'ماكينة الحقن رقم 3 متوقفة. نحتاج 20 محمل SKF 6205-2RS أصلي أو بديل NSK، تسليم عاجل اليوم في الدمام.',
    part: 'SKF 6205-2RS', brand: 'SKF', qty: 20, unit: 'pc', cat: 'bearings',
    urgency: 'high', city: 'dmm', equivalents_ok: true, equivalents: ['NSK 6205DDU', 'FAG 6205-2RSR'],
    confidence: 0.96, status: 'active', created: iso(0, 9, 12), matchedCount: 3,
  };
  db.insert('rfqs', rfq);
  db.insert('parts', { id: sec.genId('part'), part: rfq.part, brand: rfq.brand, cat: rfq.cat, firstSeen: rfq.created });

  db.setCounters({ quote: 1, order: 2211, invoice: 212 });

  console.log('[seed] created ops, 6 suppliers, 1 buyer factory, 1 sample RFQ.');
  console.log('[seed] demo logins: buyer@wasla.sa / supplier1@wasla.sa / ops@wasla.sa  (pwd: wasla-demo-2026, ops: wasla-ops-2026)');
}

if (require.main === module) ensureSeed();

module.exports = { ensureSeed };
