'use strict';
/* RFQ intelligence — structured extraction from free Arabic/English text, supplier matching,
   and ranking. Pure rule-based engine (the "human fallback" from the strategy) that runs with
   zero external calls. If CLAUDE_API_KEY is set, extractWithAI() can upgrade extraction quality,
   but the platform is fully functional without it. */

const BRANDS = [
  'SKF', 'NSK', 'FAG', 'TIMKEN', 'NTN', 'KOYO', 'INA', 'NACHI',
  'GATES', 'OPTIBELT', 'CONTINENTAL', 'DAYCO',
  'DONALDSON', 'MANN', 'FLEETGUARD', 'PARKER', 'HYDAC', 'BALDWIN',
  'NOK', 'TRELLEBORG', 'FREUDENBERG', 'CHESTERTON',
  'GRUNDFOS', 'KSB', 'WILO', 'EBARA', 'FLOWSERVE',
  'SIEMENS', 'ABB', 'WEG', 'SCHNEIDER', 'DANFOSS', 'FESTO', 'SMC',
];

// OEM cross-reference graph (equivalence). Seed nodes; grows from human-corrected extractions.
const CROSS_REF = {
  'SKF 6205-2RS': ['NSK 6205DDU', 'FAG 6205-2RSR', 'KOYO 6205-2RS'],
  'SKF 6206-2RS': ['NSK 6206DDU', 'FAG 6206-2RSR'],
  'GATES 5VX900': ['OPTIBELT 5VX900', 'CONTINENTAL 5VX900'],
  'DONALDSON P181052': ['MANN C30850', 'FLEETGUARD AF4567'],
};

const CATEGORIES = ['bearings', 'seals', 'filters', 'valves', 'belts', 'motors', 'pumps', 'other'];

const CAT_HINTS = [
  ['bearings', /محمل|محامل|رولمان|بلي|كرسي محور|bearing/i],
  ['seals', /مانع تسرب|موانع|سيل|حشية|حشوة|oil seal|seal|gasket/i],
  ['filters', /فلتر|فلاتر|مرشح|مصفاة|filter|element/i],
  ['valves', /صمام|صمامات|محبس|بلف|valve/i],
  ['belts', /سير|سيور|حزام|belt|v-belt/i],
  ['motors', /محرك|موتور|دينمو|motor|drive/i],
  ['pumps', /مضخة|مضخات|طلمبة|pump/i],
];

function normalizeDigits(s) {
  return String(s || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
}

function detectBrand(txt) {
  for (const b of BRANDS) {
    if (new RegExp('\\b' + b + '\\b', 'i').test(txt)) return b;
  }
  return '';
}

function detectPart(txt, brand) {
  // letter-prefixed codes (CR32, P181052, 6205-2RS) or pure numeric codes
  const pm = txt.match(/\b([A-Z]{1,6}[- ]?\d{2,6}(?:[-\/][A-Z0-9]{1,6})?|\d{3,6}(?:[-\/][A-Z0-9]{1,6})?)\b/i);
  let part = '';
  if (pm) {
    part = pm[1].toUpperCase().replace(/\s+/g, ' ').trim();
    if (brand && !part.startsWith(brand)) part = brand + ' ' + part;
  } else if (brand) {
    part = brand;
  }
  return part;
}

function detectQty(txt) {
  const qm = txt.match(/(\d+)\s*(?:قطعة|قطع|حبة|حبات|عدد|وحدة|pcs?|pieces?|units?|nos?)/i);
  if (qm) return parseInt(qm[1], 10);
  const nums = (txt.match(/\b\d{1,4}\b/g) || []).map(Number).filter(n => n > 0 && n <= 5000);
  return nums.length ? nums[0] : 1;
}

function detectCategory(txt) {
  for (const [cat, re] of CAT_HINTS) if (re.test(txt)) return cat;
  return 'other';
}

function detectUrgency(txt) {
  if (/عاجل|طارئ|متوقف|توقف الخط|الآن|اليوم|urgent|emergency|down|asap|today|line stopped/i.test(txt)) return 'high';
  if (/خلال أيام|هالأسبوع|قريب|soon|this week|few days/i.test(txt)) return 'med';
  return 'med';
}

function detectCity(txt) {
  if (/الدمام|الخبر|الجبيل|الشرقية|dammam|khobar|jubail|eastern/i.test(txt)) return 'dmm';
  if (/الرياض|riyadh/i.test(txt)) return 'ruh';
  if (/جدة|jeddah|مكة|المدينة/i.test(txt)) return 'jed';
  if (/الجبيل|jubail/i.test(txt)) return 'jub';
  return '';
}

function detectEquivalents(txt, brand) {
  const cleaned = brand ? txt.replace(new RegExp(brand, 'ig'), '') : txt;
  return /بديل|مكافئ|equivalent|alternative|يقبل|or equal|or equivalent/i.test(txt)
    || /\b(NSK|FAG|NTN|KOYO)\b/i.test(cleaned);
}

function extract(raw) {
  const txt = normalizeDigits(raw);
  const brand = detectBrand(txt);
  const part = detectPart(txt, brand) || '—';
  const qty = detectQty(txt);
  const cat = detectCategory(txt);
  const urgency = detectUrgency(txt);
  const city = detectCity(txt);
  const eq = detectEquivalents(txt, brand);

  let conf = 0.55;
  if (part !== '—' && /\d{3}/.test(part)) conf += 0.18;
  if (brand) conf += 0.12;
  if (/(\d+)\s*(?:قطعة|قطع|عدد|pcs?|units?)/i.test(txt)) conf += 0.06;
  if (cat !== 'other') conf += 0.05;
  if (city) conf += 0.02;

  const equivalents = CROSS_REF[part] || [];

  return {
    part, brand: brand || '—', qty, cat, urgency, city,
    equivalents_ok: eq, equivalents,
    confidence: Math.min(Math.round(conf * 100) / 100, 0.97),
  };
}

/* ---------- Supplier matching & ranking ---------- */

// Composite supplier score (self-improving signal). Higher = better.
function supplierScore(s) {
  const rating = (s.rating || 0) / 5;            // 0..1
  const fill = (s.fill || 0) / 100;              // 0..1
  const resp = 1 - Math.min((s.resp || 120), 120) / 120; // faster = higher
  const trust = (s.tier || 1) / 3;               // 0..1
  const disputePenalty = Math.min((s.disputes || 0) * 0.03, 0.2);
  const raw = rating * 0.35 + fill * 0.25 + resp * 0.15 + trust * 0.25 - disputePenalty;
  return Math.round(raw * 1000) / 1000;
}

// Match suppliers to an RFQ: category fit + city preference + active/verified.
function matchSuppliers(rfq, suppliers, limit = 8) {
  const eligible = suppliers.filter(s =>
    s.status === 'active' &&
    Array.isArray(s.cats) && s.cats.includes(rfq.cat)
  );
  // Score with a city bonus for same-city suppliers (faster delivery).
  const scored = eligible.map(s => ({
    supplier: s,
    score: supplierScore(s) + (s.city === rfq.city ? 0.05 : 0),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(x => x.supplier);
}

// Best-value ranking of quotes for the buyer (price 60 / lead 25 / trust 15).
function rankQuotes(quotes, suppliers) {
  if (!quotes.length) return [];
  const prices = quotes.map(q => q.price);
  const leads = quotes.map(q => q.lead);
  const minP = Math.min(...prices), maxP = Math.max(...prices);
  const minL = Math.min(...leads), maxL = Math.max(...leads);
  const norm = (v, lo, hi) => (hi === lo ? 1 : (hi - v) / (hi - lo)); // lower is better -> higher score
  return quotes.map(q => {
    const s = suppliers.find(x => x.id === q.sup) || {};
    const priceScore = norm(q.price, minP, maxP);
    const leadScore = norm(q.lead, minL, maxL);
    const trustScore = supplierScore(s);
    const value = priceScore * 0.6 + leadScore * 0.25 + trustScore * 0.15;
    return { ...q, _value: Math.round(value * 1000) / 1000 };
  }).sort((a, b) => b._value - a._value);
}

module.exports = {
  extract, matchSuppliers, rankQuotes, supplierScore,
  BRANDS, CATEGORIES, CROSS_REF,
};
