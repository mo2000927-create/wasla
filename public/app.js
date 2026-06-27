'use strict';
/* WASLA frontend SPA — talks to the real /api backend.
   Token persisted in memory + a cookie-less localStorage fallback for session continuity. */

/* ============ API CLIENT ============ */
const API = {
  token: null,
  load() { try { this.token = localStorage.getItem('wasla_token'); } catch { this.token = null; } },
  save(t) { this.token = t; try { t ? localStorage.setItem('wasla_token', t) : localStorage.removeItem('wasla_token'); } catch {} },
  async call(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = 'Bearer ' + this.token;
    const res = await fetch('/api' + path, {
      method, headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    const txt = await res.text();
    try { data = txt ? JSON.parse(txt) : {}; } catch { data = { error: txt }; }
    if (!res.ok) {
      const err = new Error((data && data.error) || ('HTTP ' + res.status));
      err.status = res.status;
      throw err;
    }
    return data;
  },
  get(p) { return this.call('GET', p); },
  post(p, b) { return this.call('POST', p, b); },
};
API.load();

/* ============ i18n ============ */
const T = {
  ar: {
    nav_home: 'الرئيسية', nav_rank: 'التصنيفات', nav_trust: 'الثقة', nav_ops: 'العمليات',
    nav_login: 'دخول', nav_logout: 'خروج', nav_dash: 'لوحتي',
    lang_btn: 'EN',
    mode_live: 'منصة حية — كل عملية تُحفظ', mode_sim: 'وضع التشغيل التجريبي — الدفع محاكى',
    // hero
    hero_eyebrow: 'سوق قطع الغيار الصناعية · المملكة العربية السعودية',
    hero_h1_a: 'انكسرت ماكينة الساعة ٩ صباحاً؟', hero_h1_b: 'ثلاثة عروض موثّقة قبل الظهر.',
    hero_lead: 'منصة وصلة تربط مصانع المملكة بموردي قطع الغيار الموثّقين. اطلب القطعة بالعربي، واحصل على عروض أسعار حقيقية بدفع محمي بالضمان.',
    hero_cta_buy: 'أنا مصنع — أحتاج قطعة', hero_cta_sup: 'أنا مورّد — أبيع قطع',
    hs1: 'مورّد موثّق', hs2: 'مهلة العروض', hs3: 'نسبة التغطية', hs4: 'عمولة النجاح',
    // how
    how_eyebrow: 'كيف تعمل', how_title: 'من العطل إلى القطعة في ثلاث خطوات',
    how1_t: 'اطلب', how1_p: 'صف القطعة بالعربي أو الإنجليزي — رقم، ماركة، كمية. الذكاء يرتّب الطلب ويبثّه للموردين المناسبين.',
    how2_t: 'قارن', how2_p: 'تصلك عروض موثّقة في جدول واحد: السعر، الماركة، مهلة التسليم، تقييم المورّد.',
    how3_t: 'ادفع بأمان', how3_p: 'المبلغ محجوز بالضمان حتى تأكيد الاستلام. فاتورة ضريبية متوافقة لكل طلب.',
    // tiers
    tier_eyebrow: 'نظام الثقة', tier_title: 'ثلاث درجات توثيق',
    tier1_t: 'مُسجّل', tier1_p: 'سجل تجاري ورقم ضريبي موثّق. يستطيع تقديم العروض.',
    tier2_t: 'موثّق', tier2_p: 'حساب بنكي مطابق ومراجع تجارية و١٠+ طلبات. عمولة أقل ٣٫٥٪.',
    tier3_t: 'مُدقّق ميدانياً', tier3_p: 'زيارة موقع وفحص أصالة المخزون. أولوية في الطلبات العاجلة.',
    // auth
    auth_login_t: 'تسجيل الدخول', auth_login_sub: 'ادخل لإدارة طلباتك وعروضك',
    auth_reg_t: 'حساب جديد', auth_reg_sub: 'سجّل منشأتك وابدأ خلال دقيقتين',
    tab_login: 'دخول', tab_reg: 'تسجيل',
    role_buyer: 'مصنع / مشترٍ', role_buyer_d: 'أحتاج قطع غيار', role_sup: 'مورّد / تاجر', role_sup_d: 'أبيع قطع غيار',
    f_name: 'اسم المسؤول', f_org_ar: 'اسم المنشأة (عربي)', f_org_en: 'اسم المنشأة (إنجليزي)',
    f_email: 'البريد الإلكتروني', f_pass: 'كلمة المرور', f_phone: 'جوال (واتساب)',
    f_cr: 'رقم السجل التجاري', f_vat: 'الرقم الضريبي', f_iban: 'الآيبان (IBAN)', f_city: 'المدينة', f_cats: 'فئات القطع',
    btn_login: 'دخول', btn_reg: 'إنشاء الحساب', btn_loading: 'لحظة…',
    have_acc: 'عندك حساب؟', no_acc: 'ما عندك حساب؟', go_login: 'سجّل دخول', go_reg: 'أنشئ حساب',
    city_dmm: 'الدمام', city_ruh: 'الرياض', city_jed: 'جدة', city_jub: 'الجبيل',
    cat_bearings: 'محامل', cat_seals: 'موانع تسرب', cat_filters: 'فلاتر', cat_valves: 'صمامات', cat_belts: 'سيور', cat_motors: 'محركات', cat_pumps: 'مضخات', cat_other: 'أخرى',
    // verification gate
    verify_gate: 'حسابك قيد التوثيق. وثّق سجلك التجاري لتتمكن من تقديم العروض.',
    verify_now: 'وثّق الآن', verify_t: 'توثيق المورّد', verify_sub: 'أدخل بيانات السجل للتحقق عبر واثق أو المراجعة اليدوية',
    verify_submit: 'إرسال للتوثيق', verify_pending: 'تم الإرسال — قيد المراجعة', verify_done: 'تم التوثيق ✓',
    // buyer dash
    b_dash: 'لوحة المصنع', b_kpi_active: 'طلبات مفتوحة', b_kpi_orders: 'طلبات مؤكدة', b_kpi_saved: 'وفّرت تقديرياً',
    b_new: 'طلب جديد', b_my_rfqs: 'طلباتي', b_my_orders: 'مشترياتي', b_empty_rfq: 'لا طلبات بعد. ابدأ بطلب قطعة.',
    // new rfq
    nr_t: 'اطلب قطعة', nr_step1: 'صف القطعة', nr_step2: 'راجع وأكّد', nr_step3: 'تم الإرسال',
    nr_ph: 'مثال: ماكينة الحقن متوقفة، نحتاج ٢٠ محمل SKF 6205-2RS عاجل في الدمام',
    nr_city: 'مدينة التسليم', nr_urg: 'الاستعجال', urg_high: 'عاجل — خط متوقف', urg_med: 'خلال أيام', urg_low: 'تخطيط',
    nr_analyze: 'حلّل الطلب', nr_send: 'بثّ للموردين', nr_back: 'رجوع', nr_again: 'طلب آخر',
    nr_x_part: 'رقم القطعة', nr_x_brand: 'الماركة', nr_x_qty: 'الكمية', nr_x_cat: 'الفئة', nr_x_eq: 'يقبل البديل المكافئ',
    nr_conf: 'دقة الاستخراج', nr_sent_t: 'تم بثّ طلبك', nr_sent_p: 'موردون مطابقون استلموا طلبك. تصلك العروض خلال ٦ ساعات.',
    nr_matched: 'مورّد مطابق', nr_view: 'متابعة الطلب',
    // rfq detail / quotes
    rd_back: 'رجوع للطلبات', rd_quotes: 'العروض الواردة', rd_no_quotes: 'لا عروض بعد — الموردون يراجعون طلبك.',
    th_supplier: 'المورّد', th_price: 'سعر الوحدة', th_tier: 'الماركة', th_lead: 'التسليم', th_rating: 'التقييم', th_total: 'الإجمالي', th_act: '',
    brand_oem: 'أصلي', brand_eq: 'مكافئ', best_value: 'أفضل قيمة', accept: 'اقبل وادفع', hrs: 'ساعة',
    // order / escrow
    o_title: 'الطلب', o_back: 'رجوع', esc_held: 'محجوز بالضمان', esc_shipped: 'تم الشحن', esc_released: 'حُرّر للمورّد', esc_disputed: 'نزاع', esc_refunded: 'مُسترد',
    step_paid: 'دُفع وحُجز', step_ship: 'شُحن', step_deliver: 'سُلّم', step_release: 'حُرّر المبلغ',
    o_confirm_recv: 'أكّد الاستلام', o_dispute: 'فتح نزاع', o_ship_btn: 'تأكيد الشحن', o_invoice: 'الفاتورة الضريبية',
    o_amount: 'المبلغ الإجمالي', o_vat: 'شامل ١٥٪ ضريبة',
    // supplier dash
    s_dash: 'لوحة المورّد', s_open: 'طلبات مطابقة', s_quotes: 'عروضي', s_won: 'طلبات ربحتها', s_payouts: 'مستحقاتي',
    s_kpi_open: 'طلبات مطابقة', s_kpi_won: 'طلبات مربوحة', s_kpi_due: 'مستحقات', s_quote_btn: 'قدّم عرضاً',
    s_empty: 'لا طلبات مطابقة الآن. تظهر هنا فور بثّ طلب في فئاتك.',
    q_form_t: 'تقديم عرض', q_price: 'سعر الوحدة (ريال)', q_tier: 'نوع القطعة', q_lead: 'مهلة التسليم', q_warranty: 'الضمان (شهر)', q_notes: 'ملاحظات', q_send: 'إرسال العرض',
    s_comm_note: 'عمولة النجاح تُخصم عند تحرير المبلغ', s_net: 'صافي لك',
    // ship modal
    ship_t: 'تأكيد الشحن', ship_carrier: 'شركة الشحن', ship_track: 'رقم التتبع', ship_btn: 'تأكيد',
    // rate
    rate_t: 'قيّم تجربتك مع', rate_acc: 'مطابقة القطع', rate_spd: 'سرعة التوريد', rate_auth: 'الأصالة والتغليف', rate_send: 'إرسال التقييم',
    // ops
    ops_t: 'مركز العمليات', ops_gmv: 'إجمالي المبيعات', ops_comm: 'العمولات', ops_active: 'طلبات نشطة', ops_held: 'محجوز بالضمان', ops_disp: 'نزاعات', ops_ver: 'توثيقات معلّقة', ops_sup: 'موردون', ops_buy: 'مشترون',
    // rankings
    rk_t: 'تصنيف الموردين', rk_sub: 'مرتّبة حسب التقييم والتغطية وسرعة الاستجابة ودرجة التوثيق.',
    rk_orders: 'طلب', rk_fill: 'تغطية', rk_resp: 'استجابة', rk_min: 'دقيقة',
    // trust
    trust_t: 'الثقة هي المنتج', trust_sub: 'بنية حكومية لا يستطيع المنافس الأجنبي تقليدها.',
    // misc
    sar: 'ريال', pcs: 'قطعة', loading: 'تحميل…',
    err_generic: 'حدث خطأ، حاول مجدداً', saved: 'تم الحفظ',
    toast_rfq: 'تم بثّ طلبك للموردين', toast_quote: 'تم إرسال عرضك', toast_order: 'تم تأكيد الطلب وحجز المبلغ', toast_ship: 'تم تأكيد الشحن', toast_recv: 'تم تأكيد الاستلام وتحرير المبلغ', toast_rated: 'شكراً — تقييمك يقوّي شبكة الثقة', toast_dispute: 'فُتح النزاع وجُمّد المبلغ',
    confirm_pay_t: 'تأكيد الدفع المحمي', confirm_pay_p: 'سيُحجز المبلغ بالضمان ولا يُحرّر للمورّد إلا بعد تأكيدك الاستلام.', confirm_pay_btn: 'ادفع واحجز', cancel: 'إلغاء',
  },
  en: {
    nav_home: 'Home', nav_rank: 'Rankings', nav_trust: 'Trust', nav_ops: 'Operations',
    nav_login: 'Sign in', nav_logout: 'Sign out', nav_dash: 'Dashboard',
    lang_btn: 'ع',
    mode_live: 'Live platform — every action is saved', mode_sim: 'Pilot mode — payments simulated',
    hero_eyebrow: 'Industrial parts marketplace · Saudi Arabia',
    hero_h1_a: 'Machine down at 9am?', hero_h1_b: 'Three verified quotes by noon.',
    hero_lead: 'WASLA connects Saudi factories with verified parts suppliers. Request a part in Arabic, get real quotes, pay protected by escrow.',
    hero_cta_buy: 'I\u2019m a factory — I need a part', hero_cta_sup: 'I\u2019m a supplier — I sell parts',
    hs1: 'Verified suppliers', hs2: 'Quote window', hs3: 'Fill rate', hs4: 'Success fee',
    how_eyebrow: 'How it works', how_title: 'From breakdown to part in three steps',
    how1_t: 'Request', how1_p: 'Describe the part in Arabic or English — number, brand, quantity. AI structures and broadcasts it to matched suppliers.',
    how2_t: 'Compare', how2_p: 'Verified quotes arrive in one table: price, brand, lead time, supplier rating.',
    how3_t: 'Pay safely', how3_p: 'Funds held in escrow until you confirm receipt. Compliant tax invoice for every order.',
    tier_eyebrow: 'Trust system', tier_title: 'Three verification tiers',
    tier1_t: 'Registered', tier1_p: 'CR + VAT verified. Can submit quotes.',
    tier2_t: 'Verified', tier2_p: 'Bank match, trade references, 10+ orders. Lower 3.5% fee.',
    tier3_t: 'Field-Audited', tier3_p: 'On-site visit + authenticity audit. Priority on urgent RFQs.',
    auth_login_t: 'Sign in', auth_login_sub: 'Access your requests and quotes',
    auth_reg_t: 'New account', auth_reg_sub: 'Register your business in two minutes',
    tab_login: 'Sign in', tab_reg: 'Register',
    role_buyer: 'Factory / Buyer', role_buyer_d: 'I need parts', role_sup: 'Supplier / Trader', role_sup_d: 'I sell parts',
    f_name: 'Contact name', f_org_ar: 'Business name (Arabic)', f_org_en: 'Business name (English)',
    f_email: 'Email', f_pass: 'Password', f_phone: 'Mobile (WhatsApp)',
    f_cr: 'CR number', f_vat: 'VAT number', f_iban: 'IBAN', f_city: 'City', f_cats: 'Part categories',
    btn_login: 'Sign in', btn_reg: 'Create account', btn_loading: 'One moment…',
    have_acc: 'Have an account?', no_acc: 'No account?', go_login: 'Sign in', go_reg: 'Register',
    city_dmm: 'Dammam', city_ruh: 'Riyadh', city_jed: 'Jeddah', city_jub: 'Jubail',
    cat_bearings: 'Bearings', cat_seals: 'Seals', cat_filters: 'Filters', cat_valves: 'Valves', cat_belts: 'Belts', cat_motors: 'Motors', cat_pumps: 'Pumps', cat_other: 'Other',
    verify_gate: 'Your account is pending verification. Verify your CR to start quoting.',
    verify_now: 'Verify now', verify_t: 'Supplier verification', verify_sub: 'Enter CR details for Wathq or manual review',
    verify_submit: 'Submit for verification', verify_pending: 'Submitted — under review', verify_done: 'Verified ✓',
    b_dash: 'Factory dashboard', b_kpi_active: 'Open requests', b_kpi_orders: 'Confirmed orders', b_kpi_saved: 'Est. saved',
    b_new: 'New request', b_my_rfqs: 'My requests', b_my_orders: 'My orders', b_empty_rfq: 'No requests yet. Start by requesting a part.',
    nr_t: 'Request a part', nr_step1: 'Describe', nr_step2: 'Review & confirm', nr_step3: 'Sent',
    nr_ph: 'e.g. Injection machine down, need 20 SKF 6205-2RS bearings urgently in Dammam',
    nr_city: 'Delivery city', nr_urg: 'Urgency', urg_high: 'Urgent — line down', urg_med: 'Within days', urg_low: 'Planned',
    nr_analyze: 'Analyze request', nr_send: 'Broadcast to suppliers', nr_back: 'Back', nr_again: 'Another request',
    nr_x_part: 'Part number', nr_x_brand: 'Brand', nr_x_qty: 'Quantity', nr_x_cat: 'Category', nr_x_eq: 'Accept equivalent',
    nr_conf: 'Extraction confidence', nr_sent_t: 'Request broadcast', nr_sent_p: 'Matched suppliers received your request. Quotes arrive within 6 hours.',
    nr_matched: 'matched suppliers', nr_view: 'Track request',
    rd_back: 'Back to requests', rd_quotes: 'Incoming quotes', rd_no_quotes: 'No quotes yet — suppliers are reviewing.',
    th_supplier: 'Supplier', th_price: 'Unit price', th_tier: 'Brand', th_lead: 'Lead', th_rating: 'Rating', th_total: 'Total', th_act: '',
    brand_oem: 'OEM', brand_eq: 'Equivalent', best_value: 'Best value', accept: 'Accept & pay', hrs: 'h',
    o_title: 'Order', o_back: 'Back', esc_held: 'Held in escrow', esc_shipped: 'Shipped', esc_released: 'Released', esc_disputed: 'Disputed', esc_refunded: 'Refunded',
    step_paid: 'Paid & held', step_ship: 'Shipped', step_deliver: 'Delivered', step_release: 'Funds released',
    o_confirm_recv: 'Confirm receipt', o_dispute: 'Open dispute', o_ship_btn: 'Confirm shipment', o_invoice: 'Tax invoice',
    o_amount: 'Total amount', o_vat: 'incl. 15% VAT',
    s_dash: 'Supplier dashboard', s_open: 'Matched requests', s_quotes: 'My quotes', s_won: 'Won orders', s_payouts: 'Payouts',
    s_kpi_open: 'Matched requests', s_kpi_won: 'Won orders', s_kpi_due: 'Payouts due', s_quote_btn: 'Submit quote',
    s_empty: 'No matched requests now. They appear here as soon as one is broadcast in your categories.',
    q_form_t: 'Submit a quote', q_price: 'Unit price (SAR)', q_tier: 'Part type', q_lead: 'Lead time', q_warranty: 'Warranty (mo)', q_notes: 'Notes', q_send: 'Send quote',
    s_comm_note: 'Success fee deducted on escrow release', s_net: 'Net to you',
    ship_t: 'Confirm shipment', ship_carrier: 'Carrier', ship_track: 'Tracking number', ship_btn: 'Confirm',
    rate_t: 'Rate your experience with', rate_acc: 'Part accuracy', rate_spd: 'Delivery speed', rate_auth: 'Authenticity & packaging', rate_send: 'Submit rating',
    ops_t: 'Operations cockpit', ops_gmv: 'GMV', ops_comm: 'Commission', ops_active: 'Active RFQs', ops_held: 'In escrow', ops_disp: 'Disputes', ops_ver: 'Pending verifications', ops_sup: 'Suppliers', ops_buy: 'Buyers',
    rk_t: 'Supplier rankings', rk_sub: 'Ranked by rating, fill rate, response speed, and verification tier.',
    rk_orders: 'orders', rk_fill: 'fill', rk_resp: 'response', rk_min: 'min',
    trust_t: 'Trust is the product', trust_sub: 'Government-grade rails a foreign competitor cannot replicate.',
    sar: 'SAR', pcs: 'pcs', loading: 'Loading…',
    err_generic: 'Something went wrong, try again', saved: 'Saved',
    toast_rfq: 'Your request was broadcast', toast_quote: 'Your quote was sent', toast_order: 'Order confirmed, funds held', toast_ship: 'Shipment confirmed', toast_recv: 'Receipt confirmed, funds released', toast_rated: 'Thank you — your rating strengthens the trust graph', toast_dispute: 'Dispute opened, funds frozen',
    confirm_pay_t: 'Confirm protected payment', confirm_pay_p: 'Funds are held in escrow and released to the supplier only after you confirm receipt.', confirm_pay_btn: 'Pay & hold', cancel: 'Cancel',
  },
};

/* ============ STATE ============ */
const state = {
  lang: (() => { try { return localStorage.getItem('wasla_lang') || 'ar'; } catch { return 'ar'; } })(),
  view: 'landing',
  params: {},
  tab: null,
  me: null,       // current user+org
  health: null,   // platform mode info
  authMode: 'login',
  authRole: 'buyer',
  cache: {},
};

/* ============ UTILS ============ */
const t = k => (T[state.lang][k] ?? T.ar[k] ?? k);
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmt2 = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cityName = c => t('city_' + c) || c;
const catName = c => t('cat_' + c) || c;

function timeAgo(iso) {
  const d = new Date(iso), now = new Date();
  const mins = Math.max(1, Math.round((now - d) / 60000));
  if (mins < 60) return state.lang === 'ar' ? `قبل ${mins} د` : `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return state.lang === 'ar' ? `قبل ${h} س` : `${h}h ago`;
  const days = Math.round(h / 24);
  return state.lang === 'ar' ? `قبل ${days} يوم` : `${days}d ago`;
}
function dateStr(iso) {
  return new Date(iso).toLocaleDateString(state.lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const MARK = `<svg class="brand-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
<path d="M20 2.5l15.16 8.75v17.5L20 37.5 4.84 28.75v-17.5L20 2.5z" fill="#F4490B"/>
<path d="M20 8l9.97 5.75v11.5L20 31 10.03 25.25v-11.5L20 8z" fill="#15191E"/>
<circle cx="20" cy="19.5" r="4.6" fill="none" stroke="#FF7A4D" stroke-width="2.4"/>
<circle cx="20" cy="19.5" r="1.4" fill="#F2F0EB"/>
</svg>`;

function stamp(tier, small) {
  if (!tier) return '';
  const marks = '✓'.repeat(tier);
  return `<span class="stamp stamp-${tier}${small ? ' stamp-sm' : ''}">${marks}</span>`;
}
function starsHtml(rating) {
  const full = Math.round(rating || 0);
  return `<span class="stars" aria-label="${rating}">${'★'.repeat(full)}${'☆'.repeat(5 - full)}</span>`;
}
function escrowChip(state_) {
  const map = { held: ['chip-amber', 'esc_held'], shipped: ['chip-blue', 'esc_shipped'], released: ['chip-green', 'esc_released'], disputed: ['chip-red', 'esc_disputed'], refunded: ['chip-red', 'esc_refunded'] };
  const [cls, key] = map[state_] || ['chip-gray', state_];
  return `<span class="chip ${cls}"><span class="chip-dot"></span>${t(key)}</span>`;
}

/* ---- toast ---- */
function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = msg;
  $('toast-wrap').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 3200);
}

/* ---- modal ---- */
function openModal(html, wide) {
  const m = $('modal');
  m.className = 'modal' + (wide ? ' modal-wide' : '');
  m.innerHTML = `<div class="modal-inner">${html}</div>`;
  if (!m.open) m.showModal();
}
function closeModal() { const m = $('modal'); if (m.open) m.close(); m.innerHTML = ''; }

/* ============ NAV + ROUTER ============ */
function nav() {
  const me = state.me;
  let links;
  if (!me) links = [['nav_home', 'landing'], ['nav_rank', 'rankings'], ['nav_trust', 'trust']];
  else if (me.role === 'buyer') links = [['b_dash', 'b_dash'], ['nav_rank', 'rankings'], ['nav_trust', 'trust']];
  else if (me.role === 'supplier') links = [['s_dash', 's_dash'], ['nav_rank', 'rankings'], ['nav_trust', 'trust']];
  else if (me.role === 'ops') links = [['nav_ops', 'ops'], ['nav_rank', 'rankings']];
  else links = [['nav_home', 'landing']];

  const userArea = me
    ? `<div class="topbar-user"><span class="tu-name">${esc(me.org ? (state.lang === 'ar' ? me.org.ar : me.org.en) : me.name)}</span>
         <button class="btn btn-ghost btn-sm" onclick="App.logout()">${t('nav_logout')}</button></div>`
    : `<button class="btn btn-primary btn-sm" onclick="App.go('auth')">${t('nav_login')}</button>`;

  return `<div class="topbar"><div class="container topbar-inner">
    <button class="brand" onclick="App.go('${me ? (me.role === 'buyer' ? 'b_dash' : me.role === 'supplier' ? 's_dash' : 'ops') : 'landing'}')">
      ${MARK}<span class="brand-name"><b>وصلة</b><span>WASLA</span></span>
    </button>
    <nav class="topnav">
      ${links.map(([k, v]) => `<button class="${state.view === v ? 'active' : ''}" onclick="App.go('${v}')">${t(k)}</button>`).join('')}
    </nav>
    <div class="topbar-spacer"></div>
    <button class="lang-toggle" onclick="App.toggleLang()" aria-label="language">${t('lang_btn')}</button>
    ${userArea}
  </div></div>`;
}

function setModeBanner() {
  const b = $('modeBanner');
  if (!state.health) { b.style.display = 'none'; return; }
  const sim = state.health.paymentMode === 'simulated';
  b.style.display = 'block';
  b.innerHTML = sim ? `<b>WASLA</b> — ${t('mode_sim')}` : `<b>WASLA</b> — ${t('mode_live')}`;
  b.style.background = sim ? '' : 'var(--verify)';
  b.style.color = sim ? '' : '#fff';
}

const views = {};

async function render() {
  document.documentElement.lang = state.lang;
  document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
  try { localStorage.setItem('wasla_lang', state.lang); } catch {}
  document.title = state.lang === 'ar' ? 'وصلة WASLA — سوق قطع الغيار الصناعية' : 'WASLA — Industrial Parts Marketplace';
  try { $('app').innerHTML = nav(); } catch (e) { console.error('nav failed', e); }
  try { setModeBanner(); } catch (e) { console.error('banner failed', e); }
  const V = views[state.view] || views.landing;
  $('main').innerHTML = `<div class="view-loading"><span class="spinner"></span></div>`;
  try {
    const html = await V();
    $('main').innerHTML = html;
    if (views['_after_' + state.view]) views['_after_' + state.view]();
  } catch (e) {
    console.error('view render failed', state.view, e);
    if (e && e.status === 401) { App.logout(true); return; }
    $('main').innerHTML = `<div class="container" style="padding:60px 16px;text-align:center;color:var(--mercury-2)"><p>${esc((e && e.message) || t('err_generic'))}</p></div>`;
  }
  window.scrollTo(0, 0);
}

/* ============ LANDING ============ */
views.landing = async () => `
<section class="hero"><div class="container hero-inner">
  <div>
    <span class="eyebrow">${esc(t('hero_eyebrow'))}</span>
    <h1>${esc(t('hero_h1_a'))}<em>${esc(t('hero_h1_b'))}</em></h1>
    <p class="lead">${esc(t('hero_lead'))}</p>
    <div class="hero-ctas">
      <button class="btn btn-primary btn-lg" onclick="App.startAuth('reg','buyer')">${t('hero_cta_buy')}</button>
      <button class="btn btn-outline btn-lg" onclick="App.startAuth('reg','supplier')">${t('hero_cta_sup')}</button>
    </div>
    <div class="hero-stats">
      <div class="hstat"><b>120+</b><span>${t('hs1')}</span></div>
      <div class="hstat"><b>6${t('hrs')}</b><span>${t('hs2')}</span></div>
      <div class="hstat"><b>96%</b><span>${t('hs3')}</span></div>
      <div class="hstat"><b>5%</b><span>${t('hs4')}</span></div>
    </div>
  </div>
  <div class="ticket" role="img" aria-label="${state.lang==='ar'?'مثال طلب عروض':'Example request'}">
    <div class="ticket-head">
      <div class="ticket-gauge">
        ${slaGauge(72)}
        <div class="gauge-label"><b>2:14</b><span>${state.lang==='ar'?'من أصل ٦ ساعات':'of 6 hours'}</span></div>
      </div>
      <span class="ticket-id">RFQ-1042</span>
    </div>
    <div class="ticket-body">
      <div style="margin-bottom:10px"><span class="chip chip-orange"><span class="chip-dot"></span>${t('urg_high')}</span></div>
      <div class="ticket-spec">
        <div class="pt">SKF 6205-2RS</div>
        <div class="meta">${state.lang === 'ar' ? 'محمل كرات · ٢٠ قطعة · الدمام' : 'Ball bearing · 20 pcs · Dammam'}</div>
      </div>
      <div class="ticket-quote" style="animation-delay:.25s"><span class="who">${state.lang === 'ar' ? 'مؤسسة الخليج' : 'Gulf Bearings'} ${stamp(3, true)}</span><b class="price">52<small> ${t('sar')}</small></b></div>
      <div class="ticket-quote best" style="animation-delay:.5s"><span class="who">${state.lang === 'ar' ? 'الشرقية' : 'Eastern Ind.'} ${stamp(2, true)} <span class="win-pill">${t('best_value')}</span></span><b class="price">47<small> ${t('sar')}</small></b></div>
      <div class="ticket-quote" style="animation-delay:.75s"><span class="who">${state.lang === 'ar' ? 'الرياض للمعدات' : 'Riyadh Equip.'} ${stamp(2, true)}</span><b class="price">58<small> ${t('sar')}</small></b></div>
    </div>
  </div>
</div></section>

<section class="land-section"><div class="container">
  <span class="eyebrow">${esc(t('how_eyebrow'))}</span>
  <h2 class="section-title">${esc(t('how_title'))}</h2>
  <p class="section-sub">${state.lang==='ar'?'ثلاث خطوات، تسلسل حقيقي — من بلاغ العطل إلى وصول القطعة.':'Three steps, a real sequence — from breakdown report to part in hand.'}</p>
  <div class="steps3">
    ${[1, 2, 3].map(i => `<div class="step-card"><span class="step-num">0${i}</span><h3>${esc(t('how' + i + '_t'))}</h3><p>${esc(t('how' + i + '_p'))}</p></div>`).join('')}
  </div>
</div></section>

<section class="land-section alt"><div class="container">
  <span class="eyebrow">${esc(t('tier_eyebrow'))}</span>
  <h2 class="section-title">${esc(t('tier_title'))}</h2>
  <p class="section-sub">${state.lang==='ar'?'كل مورّد يحمل ختم تحقّق مطبوعاً — كلما ارتفعت الدرجة، زادت الأولوية وقلّت العمولة.':'Every supplier carries a verification stamp — higher tier, higher priority, lower fee.'}</p>
  <div class="tier-cards">
    ${[1, 2, 3].map(i => `<div class="tier-card tier-${i}">${stamp(i)}<h3>${esc(t('tier' + i + '_t'))}</h3><p>${esc(t('tier' + i + '_p'))}</p></div>`).join('')}
  </div>
</div></section>`;

/* SVG SLA gauge — a dial that fills as the 6h window elapses. The signature instrument. */
function slaGauge(pct) {
  const r = 16, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
  return `<svg class="gauge-ring" viewBox="0 0 38 38" aria-hidden="true">
    <circle cx="19" cy="19" r="${r}" fill="none" stroke="#E7E4DC" stroke-width="3.5"/>
    <circle cx="19" cy="19" r="${r}" fill="none" stroke="#2E9E66" stroke-width="3.5" stroke-linecap="round"
      stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 19 19)"/>
    <circle cx="19" cy="19" r="2.5" fill="#F4490B"/>
  </svg>`;
}

/* ============ RANKINGS ============ */
views.rankings = async () => {
  let suppliers = state.cache.rankings;
  if (!suppliers) {
    // public-ish: derive from rankings endpoint if present, else from a lightweight fetch
    try { suppliers = await API.get('/rankings'); } catch { suppliers = []; }
    state.cache.rankings = suppliers;
  }
  // fall back to seeded known suppliers if endpoint absent
  const rows = (suppliers && suppliers.length) ? suppliers : [];
  return `<div class="container page"><div class="page-head"><div>
    <span class="eyebrow">${state.lang === 'ar' ? 'يونيو ٢٠٢٦' : 'June 2026'}</span>
    <h1>${esc(t('rk_t'))}</h1><p style="max-width:70ch">${esc(t('rk_sub'))}</p></div></div>
    ${rows.length ? `<div class="rank-list">${rows.map((s, i) => rankRow(s, i)).join('')}</div>`
      : `<div class="empty-state">${state.lang === 'ar' ? 'التصنيفات تظهر بعد أول طلبات.' : 'Rankings appear after the first orders.'}</div>`}
  </div>`;
};
function rankRow(s, i) {
  return `<div class="rank-row">
    <span class="rank-pos">${i + 1}</span>
    <div class="rank-main"><b>${esc(state.lang === 'ar' ? s.ar : s.en)} ${stamp(s.tier, true)}</b>
      <span class="rank-meta">${cityName(s.city)} · ${s.orders} ${t('rk_orders')}</span></div>
    <div class="rank-stats">
      <span>${starsHtml(s.rating)} ${s.rating}</span>
      <span class="mono">${s.fill}% ${t('rk_fill')}</span>
      <span class="mono">${s.resp} ${t('rk_min')}</span>
    </div></div>`;
}

/* ============ TRUST ============ */
views.trust = async () => `<div class="container page">
  <div class="page-head"><div><span class="eyebrow">${esc(t('tier_eyebrow'))}</span><h1>${esc(t('trust_t'))}</h1><p style="max-width:70ch">${esc(t('trust_sub'))}</p></div></div>
  <div class="trust-rails">
    <div class="rail-card"><b class="mono">WATHQ API</b><p>${state.lang === 'ar' ? 'التحقق من السجل التجاري والرقم الضريبي قبل أول عرض.' : 'CR + VAT verification before the first quote.'}</p></div>
    <div class="rail-card"><b class="mono">ESCROW</b><p>${state.lang === 'ar' ? 'المبلغ محجوز حتى تأكيد الاستلام، عبر مزود دفع مرخّص.' : 'Funds held until receipt confirmation, via a licensed PSP.'}</p></div>
    <div class="rail-card"><b class="mono">ZATCA FATOORAH</b><p>${state.lang === 'ar' ? 'فاتورة ضريبية إلكترونية متوافقة لكل طلب تلقائياً.' : 'Compliant e-invoice auto-issued for every order.'}</p></div>
    <div class="rail-card"><b class="mono">PDPL</b><p>${state.lang === 'ar' ? 'بيانات داخل المملكة وحوكمة صريحة للموافقات.' : 'In-Kingdom data residency with explicit consent governance.'}</p></div>
  </div></div>`;

/* ============ AUTH (login + register) ============ */
const CATS = ['bearings', 'seals', 'filters', 'valves', 'belts', 'motors', 'pumps'];
const CITIES = ['dmm', 'ruh', 'jed', 'jub'];
let regCats = [];

views.auth = async () => {
  const isReg = state.authMode === 'reg';
  return `<div class="auth-wrap"><div class="auth-card">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">${MARK}<span class="brand-name" style="line-height:1.1"><b style="font-size:18px;color:var(--white)">وصلة</b><span style="font-size:10px;color:var(--mercury);font-family:var(--mono);letter-spacing:2px">WASLA</span></span></div>
    <div class="auth-tabs">
      <button class="${!isReg ? 'active' : ''}" onclick="App.authTab('login')">${t('tab_login')}</button>
      <button class="${isReg ? 'active' : ''}" onclick="App.authTab('reg')">${t('tab_reg')}</button>
    </div>
    <h1>${t(isReg ? 'auth_reg_t' : 'auth_login_t')}</h1>
    <div class="sub">${t(isReg ? 'auth_reg_sub' : 'auth_login_sub')}</div>
    ${isReg ? regForm() : loginForm()}
  </div></div>`;
};

function loginForm() {
  return `<div class="form">
    <div class="field"><label for="li_email">${t('f_email')}</label><input id="li_email" type="email" class="input" autocomplete="email" placeholder="you@company.sa"></div>
    <div class="field"><label for="li_pass">${t('f_pass')}</label><input id="li_pass" type="password" class="input" autocomplete="current-password"></div>
    <button class="btn btn-primary btn-block" id="li_btn" onclick="App.doLogin()">${t('btn_login')}</button>
    <div class="auth-switch">${t('no_acc')} <button onclick="App.authTab('reg')">${t('go_reg')}</button></div>
    <div class="demo-hint">${state.lang === 'ar' ? 'تجربة: ' : 'Demo: '}<code class="mono">buyer@wasla.sa</code> / <code class="mono">supplier1@wasla.sa</code> / <code class="mono">ops@wasla.sa</code> · <code class="mono">wasla-demo-2026</code></div>
  </div>`;
}

function regForm() {
  const role = state.authRole;
  const isSup = role === 'supplier';
  return `<div class="form">
    <div class="role-pick">
      <button class="${role === 'buyer' ? 'active' : ''}" onclick="App.regRole('buyer')">${t('role_buyer')}<small>${t('role_buyer_d')}</small></button>
      <button class="${role === 'supplier' ? 'active' : ''}" onclick="App.regRole('supplier')">${t('role_sup')}<small>${t('role_sup_d')}</small></button>
    </div>
    <div class="field"><label for="r_org_ar">${t('f_org_ar')}</label><input id="r_org_ar" class="input" placeholder="${isSup ? 'مؤسسة ... للقطع' : 'مصنع ...'}"></div>
    <div class="field"><label for="r_org_en">${t('f_org_en')}</label><input id="r_org_en" class="input" dir="ltr" placeholder="Company name"></div>
    <div class="form-row cols-2">
      <div class="field"><label for="r_name">${t('f_name')}</label><input id="r_name" class="input"></div>
      <div class="field"><label for="r_phone">${t('f_phone')}</label><input id="r_phone" class="input mono-in" dir="ltr" placeholder="9665XXXXXXXX"></div>
    </div>
    <div class="form-row cols-2">
      <div class="field"><label for="r_email">${t('f_email')}</label><input id="r_email" type="email" class="input" dir="ltr"></div>
      <div class="field"><label for="r_pass">${t('f_pass')}</label><input id="r_pass" type="password" class="input"></div>
    </div>
    <div class="form-row cols-2">
      <div class="field"><label for="r_city">${t('f_city')}</label><select id="r_city" class="input select">${CITIES.map(c => `<option value="${c}">${cityName(c)}</option>`).join('')}</select></div>
      ${isSup ? `<div class="field"><label for="r_cr">${t('f_cr')}</label><input id="r_cr" class="input mono-in" dir="ltr" placeholder="20500..."></div>`
        : `<div class="field"><label for="r_cr">${t('f_cr')} <span style="color:var(--mercury);font-weight:400">(${state.lang === 'ar' ? 'اختياري' : 'optional'})</span></label><input id="r_cr" class="input mono-in" dir="ltr"></div>`}
    </div>
    ${isSup ? `
    <div class="form-row cols-2">
      <div class="field"><label for="r_vat">${t('f_vat')}</label><input id="r_vat" class="input mono-in" dir="ltr" placeholder="3105..."></div>
      <div class="field"><label for="r_iban">${t('f_iban')}</label><input id="r_iban" class="input mono-in" dir="ltr" placeholder="SA.."></div>
    </div>
    <div class="field"><label>${t('f_cats')}</label>
      <div class="cat-grid">${CATS.map(c => `<label class="${regCats.includes(c) ? 'on' : ''}"><input type="checkbox" ${regCats.includes(c) ? 'checked' : ''} onchange="App.toggleCat('${c}')">${catName(c)}</label>`).join('')}</div>
    </div>` : ''}
    <button class="btn btn-primary btn-block" id="r_btn" onclick="App.doRegister()">${t('btn_reg')}</button>
    <div class="auth-switch">${t('have_acc')} <button onclick="App.authTab('login')">${t('go_login')}</button></div>
  </div>`;
}

/* ============ BUYER DASHBOARD ============ */
views.b_dash = async () => {
  const rfqs = await API.get('/rfqs');
  state.cache.b_rfqs = rfqs;
  const orders = rfqs.filter(r => r.status === 'ordered' || r.status === 'closed');
  const active = rfqs.filter(r => r.status === 'active' || r.status === 'quoted');
  const tab = state.tab || 'rfqs';
  return `<div class="container page">
    <div class="page-head">
      <div><span class="eyebrow">${esc(state.me.org ? (state.lang==='ar'?state.me.org.ar:state.me.org.en) : '')}</span><h1>${t('b_dash')}</h1></div>
      <button class="btn btn-primary" onclick="App.go('nr')">+ ${t('b_new')}</button>
    </div>
    <div class="kpi-row">
      <div class="kpi"><b>${active.length}</b><span>${t('b_kpi_active')}</span></div>
      <div class="kpi"><b>${orders.length}</b><span>${t('b_kpi_orders')}</span></div>
      <div class="kpi"><b class="mono">${rfqs.length}</b><span>${state.lang==='ar'?'إجمالي الطلبات':'Total requests'}</span></div>
    </div>
    <div class="tabs">
      <button class="${tab==='rfqs'?'active':''}" onclick="App.tabSet('rfqs')">${t('b_my_rfqs')}</button>
      <button class="${tab==='orders'?'active':''}" onclick="App.tabSet('orders')">${t('b_my_orders')}</button>
    </div>
    ${tab === 'rfqs' ? buyerRfqList(active.concat(rfqs.filter(r=>r.status==='ordered'||r.status==='closed'))) : buyerOrderList(orders)}
  </div>`;
};

function buyerRfqList(rfqs) {
  if (!rfqs.length) return `<div class="empty-state">${t('b_empty_rfq')}</div>`;
  return `<div class="card-list">${rfqs.map(r => `
    <button class="rfq-card" onclick="App.go('rfq',{id:'${r.id}'})">
      <div class="rfq-card-top">
        <span class="part-tag">${esc(r.part)}</span>
        <span class="chip ${r.urgency==='high'?'chip-orange':'chip-gray'}">${t('urg_'+(r.urgency==='high'?'high':r.urgency==='low'?'low':'med'))}</span>
      </div>
      <div class="rfq-card-meta">
        <span>${esc(catName(r.cat))} · ${r.qty} ${t('pcs')} · ${cityName(r.city)}</span>
        <span class="mono">${r.id}</span>
      </div>
      <div class="rfq-card-foot">
        ${rfqStatusChip(r.status)}
        <span class="rfq-time">${timeAgo(r.created)}</span>
      </div>
    </button>`).join('')}</div>`;
}
function rfqStatusChip(s) {
  const map = { active: ['chip-blue', state.lang==='ar'?'بانتظار العروض':'Awaiting quotes'], quoted: ['chip-green', state.lang==='ar'?'عروض جاهزة':'Quotes ready'], ordered: ['chip-amber', state.lang==='ar'?'طلب مؤكد':'Ordered'], closed: ['chip-gray', state.lang==='ar'?'مكتمل':'Closed'] };
  const [c, l] = map[s] || ['chip-gray', s];
  return `<span class="chip ${c}"><span class="chip-dot"></span>${l}</span>`;
}
function buyerOrderList(orders) {
  if (!orders.length) return `<div class="empty-state">${state.lang==='ar'?'لا مشتريات بعد.':'No orders yet.'}</div>`;
  return `<div class="card-list">${orders.map(r => `
    <button class="rfq-card" onclick="App.go('rfq',{id:'${r.id}'})">
      <div class="rfq-card-top"><span class="part-tag">${esc(r.part)}</span><span class="mono" style="color:var(--mercury)">${r.id}</span></div>
      <div class="rfq-card-meta"><span>${esc(catName(r.cat))} · ${r.qty} ${t('pcs')}</span><span>${rfqStatusChip(r.status)}</span></div>
    </button>`).join('')}</div>`;
}

/* ============ NEW RFQ FLOW ============ */
let nrState = { step: 1, raw: '', extracted: null, city: 'dmm', urgency: 'high', result: null };
views.nr = async () => {
  if (!nrState.city && state.me.org) nrState.city = state.me.org.city || 'dmm';
  return `<div class="container page narrow">
    <div class="page-head"><div><h1>${t('nr_t')}</h1></div><button class="btn btn-ghost" onclick="App.go('b_dash')">✕</button></div>
    <div class="wizard-steps">
      ${[1,2,3].map(i => `<div class="wstep ${nrState.step>=i?'done':''} ${nrState.step===i?'now':''}"><span class="wstep-n">${i}</span><span>${t('nr_step'+i)}</span></div>`).join('')}
    </div>
    ${nrState.step === 1 ? nrStep1() : nrState.step === 2 ? nrStep2() : nrStep3()}
  </div>`;
};
function nrStep1() {
  return `<div class="card pad">
    <div class="field"><label>${state.lang==='ar'?'صف القطعة بالعربي أو الإنجليزي':'Describe the part'}</label>
      <textarea id="nr_raw" class="input textarea" rows="4" placeholder="${esc(t('nr_ph'))}">${esc(nrState.raw)}</textarea></div>
    <div class="form-row cols-2">
      <div class="field"><label>${t('nr_city')}</label><select id="nr_city" class="input select">${CITIES.map(c=>`<option value="${c}" ${nrState.city===c?'selected':''}>${cityName(c)}</option>`).join('')}</select></div>
      <div class="field"><label>${t('nr_urg')}</label><select id="nr_urg" class="input select">
        <option value="high" ${nrState.urgency==='high'?'selected':''}>${t('urg_high')}</option>
        <option value="med" ${nrState.urgency==='med'?'selected':''}>${t('urg_med')}</option>
        <option value="low" ${nrState.urgency==='low'?'selected':''}>${t('urg_low')}</option></select></div>
    </div>
    <button class="btn btn-primary btn-block" id="nr_an" onclick="App.analyzeRfq()">${t('nr_analyze')}</button>
  </div>`;
}
function nrStep2() {
  const x = nrState.extracted || {};
  const cf = Math.round((x.confidence||0)*100);
  return `<div class="card pad">
    <div class="extract-grid">
      <div class="ex-cell"><span>${t('nr_x_part')}</span><b class="part-tag">${esc(x.part||'—')}</b></div>
      <div class="ex-cell"><span>${t('nr_x_brand')}</span><b>${esc(x.brand||'—')}</b></div>
      <div class="ex-cell"><span>${t('nr_x_qty')}</span><b class="mono">${x.qty||1}</b></div>
      <div class="ex-cell"><span>${t('nr_x_cat')}</span><b>${esc(catName(x.cat||'other'))}</b></div>
    </div>
    ${x.equivalents_ok ? `<div class="ex-eq">✓ ${t('nr_x_eq')}${x.equivalents&&x.equivalents.length?` · ${x.equivalents.map(esc).join('، ')}`:''}</div>` : ''}
    <div class="conf-bar"><span>${t('nr_conf')}</span><div class="conf-track"><div class="conf-fill" style="width:${cf}%"></div></div><b class="mono">${cf}%</b></div>
    <div class="form-row cols-2" style="margin-top:8px">
      <button class="btn btn-ghost" onclick="App.nrBack()">${t('nr_back')}</button>
      <button class="btn btn-primary" id="nr_send" onclick="App.sendRfq()">${t('nr_send')}</button>
    </div>
  </div>`;
}
function nrStep3() {
  const r = nrState.result || {};
  const matched = r.matchedSuppliers ? r.matchedSuppliers.length : (r.rfq ? r.rfq.matchedCount : 0);
  return `<div class="card pad center">
    <div class="success-mark">✓</div>
    <h2 style="margin:12px 0 6px">${t('nr_sent_t')}</h2>
    <p style="color:var(--mercury);max-width:48ch;margin:0 auto 4px">${t('nr_sent_p')}</p>
    <div class="matched-pill">${matched} ${t('nr_matched')}</div>
    <div class="form-row cols-2" style="margin-top:20px">
      <button class="btn btn-ghost" onclick="App.nrReset()">${t('nr_again')}</button>
      <button class="btn btn-primary" onclick="App.go('rfq',{id:'${r.rfq?r.rfq.id:''}'})">${t('nr_view')}</button>
    </div>
  </div>`;
}

/* ============ RFQ DETAIL + QUOTES ============ */
views.rfq = async () => {
  const id = state.params.id;
  const { rfq, quotes } = await API.get('/rfqs/' + encodeURIComponent(id));
  state.cache.rfq = rfq; state.cache.quotes = quotes;
  // if ordered/closed, find the order to show escrow timeline
  let order = null;
  if (rfq.status === 'ordered' || rfq.status === 'closed') {
    // fetch via buyer order list embedded — we derive order through invoice endpoint lazily
    order = state.cache['order_for_' + id] || null;
  }
  const back = state.me.role === 'supplier' ? 's_dash' : 'b_dash';
  return `<div class="container page narrow">
    <button class="btn btn-ghost btn-sm" onclick="App.go('${back}')">‹ ${t('rd_back')}</button>
    <div class="rfq-detail-head">
      <div><span class="part-tag big">${esc(rfq.part)}</span>
        <div class="rfq-sub">${esc(catName(rfq.cat))} · ${rfq.qty} ${t('pcs')} · ${cityName(rfq.city)} · <span class="mono">${rfq.id}</span></div></div>
      ${rfqStatusChip(rfq.status)}
    </div>
    ${rfq.raw ? `<div class="raw-quote">${esc(rfq.raw)}</div>` : ''}
    <h3 class="block-title">${t('rd_quotes')}</h3>
    ${quotesTable(rfq, quotes)}
  </div>`;
};

function quotesTable(rfq, quotes) {
  if (!quotes.length) return `<div class="empty-state small">${t('rd_no_quotes')}</div>`;
  const canAct = state.me.role === 'buyer' && (rfq.status === 'active' || rfq.status === 'quoted');
  return `<div class="quotes-table">
    <div class="qt-head">
      <span>${t('th_supplier')}</span><span>${t('th_price')}</span><span>${t('th_tier')}</span><span>${t('th_lead')}</span><span>${t('th_total')}</span><span></span>
    </div>
    ${quotes.map((q, i) => {
      const total = (q.price * rfq.qty * 1.15);
      const sup = q.supplier || {};
      const supName = state.lang === 'ar' ? (sup.ar || 'مورّد موثّق') : (sup.en || 'Verified supplier');
      return `<div class="qt-row ${i===0?'best':''}">
        <span class="qt-sup">${i===0?`<span class="best-tag">${t('best_value')}</span>`:''}<b>${esc(supName)}</b> ${stamp(sup.tier,true)}</span>
        <span class="mono price">${fmt2(q.price)}</span>
        <span><span class="chip ${q.tier==='oem'?'chip-blue':'chip-gray'}" style="padding:2px 8px">${t(q.tier==='oem'?'brand_oem':'brand_eq')}</span></span>
        <span class="mono">${q.lead}${t('hrs')}</span>
        <span class="mono price">${fmt2(total)}</span>
        <span>${canAct?`<button class="btn btn-primary btn-sm" onclick="App.acceptQuote('${q.id}')">${t('accept')}</button>`:(q.status==='won'?`<span class="chip chip-green">✓</span>`:'')}</span>
      </div>`;
    }).join('')}
  </div>`;
}

/* ============ SUPPLIER DASHBOARD ============ */
views.s_dash = async () => {
  const org = state.me.org;
  const unverified = org && (org.status !== 'active' || (org.tier||0) < 1);
  const [rfqs, orders] = await Promise.all([
    unverified ? Promise.resolve([]) : API.get('/rfqs'),
    unverified ? Promise.resolve([]) : API.get('/orders'),
  ]);
  state.cache.s_orders = orders;
  const won = orders.filter(o => o.escrow !== 'refunded');
  const due = orders.filter(o => o.escrow === 'held' || o.escrow === 'shipped');
  const dueAmount = due.reduce((s, o) => s + (o.supplierNet||0), 0);
  const tab = state.tab || 'open';

  return `<div class="container page">
    <div class="page-head"><div><span class="eyebrow">${esc(org?(state.lang==='ar'?org.ar:org.en):'')} ${stamp(org?org.tier:0,true)}</span><h1>${t('s_dash')}</h1></div></div>
    ${unverified ? `<div class="verify-alert">⚠ <div>${t('verify_gate')} <button class="link-btn" onclick="App.openVerify()">${t('verify_now')}</button></div></div>` : ''}
    <div class="kpi-row">
      <div class="kpi"><b>${rfqs.length}</b><span>${t('s_kpi_open')}</span></div>
      <div class="kpi"><b>${won.length}</b><span>${t('s_kpi_won')}</span></div>
      <div class="kpi"><b class="mono">${fmt(dueAmount)}</b><span>${t('s_kpi_due')} (${t('sar')})</span></div>
    </div>
    ${unverified ? '' : `
    <div class="tabs">
      <button class="${tab==='open'?'active':''}" onclick="App.tabSet('open')">${t('s_open')}</button>
      <button class="${tab==='won'?'active':''}" onclick="App.tabSet('won')">${t('s_won')}</button>
    </div>
    ${tab === 'open' ? supplierOpenList(rfqs) : supplierWonList(won)}`}
  </div>`;
};

function supplierOpenList(rfqs) {
  const open = rfqs.filter(r => r.status === 'active' || r.status === 'quoted');
  if (!open.length) return `<div class="empty-state">${t('s_empty')}</div>`;
  return `<div class="card-list">${open.map(r => `
    <div class="rfq-card static">
      <div class="rfq-card-top"><span class="part-tag">${esc(r.part)}</span>
        <span class="chip ${r.urgency==='high'?'chip-orange':'chip-gray'}">${t('urg_'+(r.urgency==='high'?'high':r.urgency==='low'?'low':'med'))}</span></div>
      <div class="rfq-card-meta"><span>${esc(catName(r.cat))} · ${r.qty} ${t('pcs')} · ${cityName(r.city)}</span><span class="rfq-time">${timeAgo(r.created)}</span></div>
      ${r.equivalents_ok?`<div class="eq-note">✓ ${state.lang==='ar'?'يقبل البديل':'Accepts equivalent'}</div>`:''}
      <div class="rfq-card-foot"><span class="mono" style="color:var(--mercury)">${r.id}</span>
        <button class="btn btn-primary btn-sm" onclick="App.openQuote('${r.id}','${esc(r.part)}',${r.qty})">${t('s_quote_btn')}</button></div>
    </div>`).join('')}</div>`;
}
function supplierWonList(orders) {
  if (!orders.length) return `<div class="empty-state">${state.lang==='ar'?'لا طلبات مربوحة بعد.':'No won orders yet.'}</div>`;
  return `<div class="card-list">${orders.map(o => `
    <button class="rfq-card" onclick="App.go('order',{id:'${o.id}'})">
      <div class="rfq-card-top"><span class="part-tag">${esc(o.part||'')}</span>${escrowChip(o.escrow)}</div>
      <div class="rfq-card-meta"><span class="mono">${o.id}</span><span>${t('s_net')}: <b class="mono">${fmt2(o.supplierNet)} ${t('sar')}</b></span></div>
    </button>`).join('')}</div>`;
}

/* ============ OPS COCKPIT ============ */
views.ops = async () => {
  const [ov, vers, disps] = await Promise.all([
    API.get('/ops/overview'), API.get('/ops/verifications'), API.get('/ops/disputes'),
  ]);
  const tab = state.tab || 'overview';
  return `<div class="container page">
    <div class="page-head"><div><span class="eyebrow">WASLA OPS</span><h1>${t('ops_t')}</h1></div></div>
    <div class="kpi-row ops-kpis">
      <div class="kpi"><b class="mono">${fmt(ov.gmv)}</b><span>${t('ops_gmv')} (${t('sar')})</span></div>
      <div class="kpi"><b class="mono">${fmt(ov.commissionEarned)}</b><span>${t('ops_comm')} (${t('sar')})</span></div>
      <div class="kpi"><b>${ov.activeRfqs}</b><span>${t('ops_active')}</span></div>
      <div class="kpi"><b>${ov.escrowHeld}</b><span>${t('ops_held')}</span></div>
    </div>
    <div class="kpi-row ops-kpis">
      <div class="kpi sm"><b>${ov.suppliers}</b><span>${t('ops_sup')}</span></div>
      <div class="kpi sm"><b>${ov.buyers}</b><span>${t('ops_buy')}</span></div>
      <div class="kpi sm ${ov.pendingVerifications?'hot':''}"><b>${ov.pendingVerifications}</b><span>${t('ops_ver')}</span></div>
      <div class="kpi sm ${ov.disputes?'hot':''}"><b>${ov.disputes}</b><span>${t('ops_disp')}</span></div>
    </div>
    <div class="tabs">
      <button class="${tab==='verif'?'active':''}" onclick="App.tabSet('verif')">${t('ops_ver')} ${vers.length?`<span class="tab-badge">${vers.length}</span>`:''}</button>
      <button class="${tab==='disp'?'active':''}" onclick="App.tabSet('disp')">${t('ops_disp')} ${disps.length?`<span class="tab-badge">${disps.length}</span>`:''}</button>
    </div>
    ${tab === 'disp' ? opsDisputes(disps) : opsVerifications(vers)}
  </div>`;
};
function opsVerifications(vers) {
  if (!vers.length) return `<div class="empty-state small">${state.lang==='ar'?'لا توثيقات معلّقة.':'No pending verifications.'}</div>`;
  return `<div class="ops-list">${vers.map(v => `
    <div class="ops-row">
      <div class="ops-row-main"><b>${esc(state.lang==='ar'?v.org.ar:v.org.en)}</b>
        <span class="ops-meta mono">CR ${esc(v.org.cr||'—')} · VAT ${esc(v.org.vat||'—')} · ${cityName(v.org.city)}</span>
        <span class="ops-meta">${(v.org.cats||[]).map(catName).join('، ')}</span></div>
      <div class="ops-actions">
        <button class="btn btn-danger btn-sm" onclick="App.opsReview('${v.id}','reject')">${state.lang==='ar'?'رفض':'Reject'}</button>
        <button class="btn btn-success btn-sm" onclick="App.opsReview('${v.id}','approve')">${state.lang==='ar'?'توثيق':'Approve'}</button>
      </div>
    </div>`).join('')}</div>`;
}
function opsDisputes(disps) {
  if (!disps.length) return `<div class="empty-state small">${state.lang==='ar'?'لا نزاعات مفتوحة.':'No open disputes.'}</div>`;
  return `<div class="ops-list">${disps.map(d => `
    <div class="ops-row">
      <div class="ops-row-main"><b>${esc(d.part||'')} <span class="mono" style="color:var(--mercury)">${d.order.id}</span></b>
        <span class="ops-meta">${esc(d.reason||'')}</span>
        <span class="ops-meta mono">${fmt2(d.order.total)} ${t('sar')} · ${escrowChip(d.order.escrow)}</span></div>
      <div class="ops-actions">
        <button class="btn btn-success btn-sm" onclick="App.opsResolve('${d.id}','release')">${state.lang==='ar'?'تحرير للمورّد':'Release'}</button>
        <button class="btn btn-danger btn-sm" onclick="App.opsResolve('${d.id}','refund')">${state.lang==='ar'?'استرداد للمشتري':'Refund'}</button>
      </div>
    </div>`).join('')}</div>`;
}

/* ============ ORDER DETAIL + ESCROW TIMELINE ============ */
views.order = async () => {
  const id = state.params.id;
  const data = await API.get('/orders/' + encodeURIComponent(id));
  state.cache.order = data;
  const o = data.order, rfq = data.rfq;
  const sup = data.supplier || {};
  const supName = state.lang==='ar' ? (sup.ar||'مورّد') : (sup.en||'Supplier');
  const isBuyer = state.me.role === 'buyer';
  const isSupplier = state.me.role === 'supplier';
  const back = isSupplier ? 's_dash' : 'b_dash';

  // escrow timeline steps
  const steps = ['held', 'shipped', 'delivered', 'released'];
  const stateOrder = { held: 1, shipped: 2, released: 4, disputed: 2, refunded: 2 };
  let reached = o.escrow === 'released' ? 4 : (o.delivered ? 3 : stateOrder[o.escrow] || 1);

  return `<div class="container page narrow">
    <button class="btn btn-ghost btn-sm" onclick="App.go('${back}')">‹ ${t('o_back')}</button>
    <div class="order-head">
      <div><span class="part-tag big">${esc(rfq.part)}</span>
        <div class="rfq-sub">${esc(catName(rfq.cat))} · ${rfq.qty} ${t('pcs')} · <span class="mono">${o.id}</span></div></div>
      ${escrowChip(o.escrow)}
    </div>

    <div class="order-amount-card">
      <div><span>${t('o_amount')}</span><b class="mono price big">${fmt2(o.total)} <small>${t('sar')}</small></b><span class="vat-note">${t('o_vat')}</span></div>
      ${isSupplier?`<div class="net-box"><span>${t('s_net')}</span><b class="mono">${fmt2(o.supplierNet)}</b><span class="comm-note">${state.lang==='ar'?`عمولة ${(o.commissionRate*100).toFixed(1)}٪`:`${(o.commissionRate*100).toFixed(1)}% fee`}</span></div>`:''}
    </div>

    <div class="escrow-timeline">
      ${steps.map((s, i) => `<div class="etl-step ${i+1<=reached?'done':''} ${i+1===reached?'current':''}">
        <span class="etl-dot">${i+1<=reached?'✓':i+1}</span>
        <span class="etl-label">${t('step_'+['paid','ship','deliver','release'][i])}</span>
      </div>`).join('<div class="etl-line"></div>')}
    </div>

    ${o.ship?`<div class="ship-info"><span class="mono">${esc(o.ship.carrier)} · ${esc(o.ship.trackingNo)}</span><span class="ship-date">${dateStr(o.ship.at)}</span></div>`:''}

    <div class="order-actions">
      ${isSupplier && o.escrow==='held'?`<button class="btn btn-primary btn-block" onclick="App.openShip('${o.id}')">${t('o_ship_btn')}</button>`:''}
      ${isBuyer && (o.escrow==='shipped'||o.escrow==='held')?`
        <button class="btn btn-success btn-block" onclick="App.confirmReceive('${o.id}')">${t('o_confirm_recv')}</button>
        <button class="btn btn-ghost btn-block" onclick="App.openDispute('${o.id}')">${t('o_dispute')}</button>`:''}
      ${isBuyer && o.escrow==='released' && !o.rated?`<button class="btn btn-primary btn-block" onclick="App.rateOpen('${o.id}','${esc(supName)}')">${t('rate_t')} ${esc(supName)}</button>`:''}
      ${o.escrow==='released'||o.escrow==='disputed'||o.delivered?`<button class="btn btn-outline btn-block" onclick="App.showInvoice('${o.id}')">${t('o_invoice')}</button>`:''}
    </div>
    ${data.dispute?`<div class="dispute-note">⚠ ${state.lang==='ar'?'نزاع مفتوح قيد المراجعة من فريق العمليات.':'Open dispute under operations review.'}</div>`:''}
  </div>`;
};

/* ============ APP CONTROLLER ============ */
const App = {
  /* ---- navigation ---- */
  go(view, params = {}) {
    state.view = view; state.params = params; state.tab = null;
    if (view === 'nr') nrState = { step: 1, raw: '', extracted: null, city: (state.me.org && state.me.org.city) || 'dmm', urgency: 'high', result: null };
    render();
  },
  tabSet(tab) { state.tab = tab; render(); },
  toggleLang() { state.lang = state.lang === 'ar' ? 'en' : 'ar'; render(); },

  /* ---- auth ---- */
  startAuth(mode, role) { state.authMode = mode; state.authRole = role || 'buyer'; if (role === 'supplier') regCats = []; state.view = 'auth'; render(); },
  authTab(mode) { state.authMode = mode; render(); },
  regRole(role) { state.authRole = role; if (role === 'supplier' && !regCats.length) regCats = []; render(); },
  toggleCat(c) { const i = regCats.indexOf(c); if (i >= 0) regCats.splice(i, 1); else regCats.push(c); render(); },

  async doLogin() {
    const email = $('li_email').value.trim();
    const pass = $('li_pass').value;
    if (!email || !pass) { toast(t('err_generic'), 'err'); return; }
    const btn = $('li_btn'); btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> ${t('btn_loading')}`;
    try {
      const res = await API.post('/auth/login', { email, password: pass });
      API.save(res.token); state.me = res.user;
      await afterLogin();
    } catch (e) {
      toast(e.message || t('err_generic'), 'err');
      btn.disabled = false; btn.textContent = t('btn_login');
    }
  },

  async doRegister() {
    const role = state.authRole;
    const get = id => { const el = $(id); return el ? el.value.trim() : ''; };
    const body = {
      role,
      legalNameAr: get('r_org_ar'),
      legalNameEn: get('r_org_en') || get('r_org_ar'),
      name: get('r_name') || get('r_org_ar'),
      email: get('r_email'),
      password: get('r_pass'),
      phone: get('r_phone'),
      city: get('r_city'),
      crNumber: get('r_cr'),
    };
    if (role === 'supplier') {
      body.vatNumber = get('r_vat');
      body.iban = get('r_iban');
      body.cats = regCats.slice();
    }
    if (!body.legalNameAr || !body.email || !body.password) { toast(state.lang==='ar'?'أكمل الحقول المطلوبة':'Complete required fields', 'err'); return; }
    if (role === 'supplier' && !body.cats.length) { toast(state.lang==='ar'?'اختر فئة قطع واحدة على الأقل':'Pick at least one category', 'err'); return; }
    const btn = $('r_btn'); btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> ${t('btn_loading')}`;
    try {
      const res = await API.post('/auth/register', body);
      API.save(res.token); state.me = res.user;
      await afterLogin();
    } catch (e) {
      toast(e.message || t('err_generic'), 'err');
      btn.disabled = false; btn.textContent = t('btn_reg');
    }
  },

  logout(silent) {
    API.save(null); state.me = null; state.cache = {}; state.view = 'landing';
    if (!silent) toast(state.lang === 'ar' ? 'تم تسجيل الخروج' : 'Signed out');
    render();
  },

  /* ---- supplier verification ---- */
  openVerify() {
    const org = state.me.org || {};
    openModal(`<h2 class="modal-title">${t('verify_t')}</h2><p class="modal-sub">${t('verify_sub')}</p>
      <div class="field"><label>${t('f_cr')}</label><input id="v_cr" class="input mono-in" dir="ltr" value="${esc(org.cr&&org.cr.indexOf('•')<0?org.cr:'')}" placeholder="20500..."></div>
      <div class="field"><label>${t('f_vat')}</label><input id="v_vat" class="input mono-in" dir="ltr" placeholder="3105..."></div>
      <div class="field"><label>${t('f_iban')}</label><input id="v_iban" class="input mono-in" dir="ltr" placeholder="SA..."></div>
      <div class="modal-actions"><button class="btn btn-ghost" onclick="App.closeModal()">${t('cancel')}</button>
        <button class="btn btn-primary" id="v_btn" onclick="App.submitVerify()">${t('verify_submit')}</button></div>`);
  },
  async submitVerify() {
    const cr = $('v_cr').value.trim(), vat = $('v_vat').value.trim(), iban = $('v_iban').value.trim();
    if (!cr) { toast(state.lang==='ar'?'رقم السجل مطلوب':'CR number required', 'err'); return; }
    const btn = $('v_btn'); btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>`;
    try {
      const res = await API.post('/supplier/verify', { crNumber: cr, vatNumber: vat, iban });
      // refresh me
      state.me = await API.get('/me');
      closeModal();
      if (res.org.status === 'active') toast(t('verify_done'));
      else toast(t('verify_pending'));
      render();
    } catch (e) { toast(e.message || t('err_generic'), 'err'); btn.disabled = false; btn.textContent = t('verify_submit'); }
  },

  /* ---- new RFQ ---- */
  async analyzeRfq() {
    const raw = $('nr_raw').value.trim();
    nrState.city = $('nr_city').value; nrState.urgency = $('nr_urg').value;
    if (!raw) { toast(state.lang==='ar'?'اكتب وصف القطعة':'Describe the part', 'err'); return; }
    nrState.raw = raw;
    const btn = $('nr_an'); btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> ${t('btn_loading')}`;
    // client-side preview extraction via a dry-run: we POST only on send, so analyze locally by asking backend? 
    // We do a lightweight local extraction mirror for preview, then real create on send.
    try {
      // ask backend to extract by creating a preview is not ideal; do a minimal local parse
      nrState.extracted = localExtract(raw, nrState.city, nrState.urgency);
      nrState.step = 2; render();
    } catch (e) { toast(t('err_generic'), 'err'); btn.disabled = false; btn.textContent = t('nr_analyze'); }
  },
  nrBack() { nrState.step = 1; render(); },
  nrReset() { nrState = { step: 1, raw: '', extracted: null, city: (state.me.org && state.me.org.city) || 'dmm', urgency: 'high', result: null }; render(); },
  async sendRfq() {
    const btn = $('nr_send'); btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> ${t('btn_loading')}`;
    try {
      const res = await API.post('/rfqs', {
        rawText: nrState.raw, city: nrState.city, urgency: nrState.urgency,
        equivalents_ok: nrState.extracted ? nrState.extracted.equivalents_ok : undefined,
      });
      nrState.result = res; nrState.step = 3;
      toast(t('toast_rfq'));
      render();
    } catch (e) { toast(e.message || t('err_generic'), 'err'); btn.disabled = false; btn.textContent = t('nr_send'); }
  },

  /* ---- quotes / orders (buyer) ---- */
  async acceptQuote(quoteId) {
    const rfq = state.cache.rfq;
    const q = (state.cache.quotes || []).find(x => x.id === quoteId);
    if (!q || !rfq) return;
    const total = fmt2(q.price * rfq.qty * 1.15);
    openModal(`<h2 class="modal-title">${t('confirm_pay_t')}</h2>
      <p class="modal-sub">${t('confirm_pay_p')}</p>
      <div class="pay-summary"><span>${esc(rfq.part)} × ${rfq.qty}</span><b class="mono price">${total} ${t('sar')}</b></div>
      <div class="modal-actions"><button class="btn btn-ghost" onclick="App.closeModal()">${t('cancel')}</button>
        <button class="btn btn-primary" id="pay_btn" onclick="App.payConfirm('${quoteId}')">${t('confirm_pay_btn')}</button></div>`);
  },
  async payConfirm(quoteId) {
    const btn = $('pay_btn'); btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>`;
    try {
      const order = await API.post('/orders', { quoteId, paymentSource: { type: 'simulated' } });
      closeModal();
      toast(t('toast_order'));
      App.go('order', { id: order.id });
    } catch (e) { toast(e.message || t('err_generic'), 'err'); btn.disabled = false; btn.textContent = t('confirm_pay_btn'); }
  },

  async confirmReceive(orderId) {
    try {
      await API.post('/orders/' + orderId + '/receive', {});
      toast(t('toast_recv'));
      // reload order view
      const data = await API.get('/orders/' + orderId); state.cache.order = data;
      render();
    } catch (e) { toast(e.message || t('err_generic'), 'err'); }
  },

  openDispute(orderId) {
    openModal(`<h2 class="modal-title">${t('o_dispute')}</h2>
      <div class="field"><label>${state.lang==='ar'?'سبب النزاع':'Dispute reason'}</label>
        <textarea id="d_reason" class="input textarea" rows="3" placeholder="${state.lang==='ar'?'مثال: القطع غير مطابقة للمواصفات':'e.g. Parts do not match specification'}"></textarea></div>
      <div class="modal-actions"><button class="btn btn-ghost" onclick="App.closeModal()">${t('cancel')}</button>
        <button class="btn btn-danger" id="d_btn" onclick="App.submitDispute('${orderId}')">${t('o_dispute')}</button></div>`);
  },
  async submitDispute(orderId) {
    const reason = $('d_reason').value.trim();
    const btn = $('d_btn'); btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>`;
    try {
      await API.post('/orders/' + orderId + '/dispute', { reason });
      closeModal(); toast(t('toast_dispute'));
      const data = await API.get('/orders/' + orderId); state.cache.order = data; render();
    } catch (e) { toast(e.message || t('err_generic'), 'err'); btn.disabled = false; btn.textContent = t('o_dispute'); }
  },

  /* ---- rating ---- */
  rateOpen(orderId, supName) {
    const dims = [['accuracy', 'rate_acc'], ['speed', 'rate_spd'], ['authenticity', 'rate_auth']];
    window._rating = { accuracy: 5, speed: 5, authenticity: 5 };
    openModal(`<h2 class="modal-title">${t('rate_t')} ${esc(supName)}</h2>
      ${dims.map(([k, lab]) => `<div class="rate-row"><span>${t(lab)}</span>
        <div class="rate-stars" data-dim="${k}">${[1,2,3,4,5].map(n => `<button class="rstar ${n<=5?'on':''}" onclick="App.rateSet('${k}',${n})">★</button>`).join('')}</div></div>`).join('')}
      <div class="modal-actions"><button class="btn btn-ghost" onclick="App.closeModal()">${t('cancel')}</button>
        <button class="btn btn-primary" id="rate_btn" onclick="App.rateSend('${orderId}')">${t('rate_send')}</button></div>`);
  },
  rateSet(dim, n) {
    window._rating[dim] = n;
    document.querySelectorAll(`.rate-stars[data-dim="${dim}"] .rstar`).forEach((b, i) => b.classList.toggle('on', i < n));
  },
  async rateSend(orderId) {
    const btn = $('rate_btn'); btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>`;
    try {
      await API.post('/orders/' + orderId + '/rate', window._rating);
      closeModal(); toast(t('toast_rated'));
      const data = await API.get('/orders/' + orderId); state.cache.order = data; render();
    } catch (e) { toast(e.message || t('err_generic'), 'err'); btn.disabled = false; btn.textContent = t('rate_send'); }
  },

  /* ---- invoice ---- */
  async showInvoice(orderId) {
    try {
      const inv = await API.get('/orders/' + orderId + '/invoice');
      openModal(invoiceHtml(inv), true);
    } catch (e) { toast(e.message || t('err_generic'), 'err'); }
  },

  /* ---- quotes (supplier) ---- */
  openQuote(rfqId, part, qty) {
    openModal(`<h2 class="modal-title">${t('q_form_t')}</h2>
      <div class="modal-sub"><span class="part-tag">${esc(part)}</span> × ${qty}</div>
      <div class="form-row cols-2">
        <div class="field"><label>${t('q_price')}</label><input id="q_price" type="number" class="input mono-in" dir="ltr" min="1" step="0.5"></div>
        <div class="field"><label>${t('q_tier')}</label><select id="q_tier" class="input select"><option value="oem">${t('brand_oem')}</option><option value="eq">${t('brand_eq')}</option></select></div>
      </div>
      <div class="form-row cols-2">
        <div class="field"><label>${t('q_lead')} (${t('hrs')})</label><input id="q_lead" type="number" class="input mono-in" dir="ltr" min="1" value="6"></div>
        <div class="field"><label>${t('q_warranty')}</label><input id="q_warranty" type="number" class="input mono-in" dir="ltr" min="0" value="12"></div>
      </div>
      <div class="field"><label>${t('q_notes')}</label><input id="q_notes" class="input" placeholder="${state.lang==='ar'?'مثال: بديل NSK أصلي متوفّر':'e.g. Genuine NSK equivalent in stock'}"></div>
      <div class="commission-hint" id="q_net"></div>
      <div class="modal-actions"><button class="btn btn-ghost" onclick="App.closeModal()">${t('cancel')}</button>
        <button class="btn btn-primary" id="q_btn" onclick="App.sendQuote('${rfqId}',${qty})">${t('q_send')}</button></div>`);
    const priceEl = $('q_price');
    const rate = (state.me.org && state.me.org.tier >= 2) ? 0.035 : 0.05;
    const upd = () => { const p = parseFloat(priceEl.value) || 0; const sub = p * qty; const net = sub * (1 - rate);
      $('q_net').innerHTML = p ? `${t('s_net')}: <b class="mono">${fmt2(net)} ${t('sar')}</b> <span style="color:var(--mercury)">(${t('s_comm_note')} ${(rate*100).toFixed(1)}٪)</span>` : ''; };
    priceEl.addEventListener('input', upd);
  },
  async sendQuote(rfqId, qty) {
    const price = parseFloat($('q_price').value);
    if (!price || price <= 0) { toast(state.lang==='ar'?'أدخل سعراً صحيحاً':'Enter a valid price', 'err'); return; }
    const body = { price, tier: $('q_tier').value, lead: parseInt($('q_lead').value, 10), warranty: parseInt($('q_warranty').value, 10), notes: $('q_notes').value.trim() };
    const btn = $('q_btn'); btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>`;
    try {
      await API.post('/rfqs/' + rfqId + '/quotes', body);
      closeModal(); toast(t('toast_quote'));
      render();
    } catch (e) { toast(e.message || t('err_generic'), 'err'); btn.disabled = false; btn.textContent = t('q_send'); }
  },

  /* ---- shipment (supplier) ---- */
  openShip(orderId) {
    openModal(`<h2 class="modal-title">${t('ship_t')}</h2>
      <div class="form-row cols-2">
        <div class="field"><label>${t('ship_carrier')}</label><select id="sh_carrier" class="input select"><option>SMSA</option><option>Aramex</option><option>Saudi Post</option><option>DHL</option><option>${state.lang==='ar'?'توصيل المورّد':'Supplier delivery'}</option></select></div>
        <div class="field"><label>${t('ship_track')}</label><input id="sh_track" class="input mono-in" dir="ltr" placeholder="SM..."></div>
      </div>
      <div class="modal-actions"><button class="btn btn-ghost" onclick="App.closeModal()">${t('cancel')}</button>
        <button class="btn btn-primary" id="sh_btn" onclick="App.confirmShip('${orderId}')">${t('ship_btn')}</button></div>`);
  },
  async confirmShip(orderId) {
    const carrier = $('sh_carrier').value, trackingNo = $('sh_track').value.trim();
    if (!trackingNo) { toast(state.lang==='ar'?'أدخل رقم التتبع':'Enter tracking number', 'err'); return; }
    const btn = $('sh_btn'); btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>`;
    try {
      await API.post('/orders/' + orderId + '/ship', { carrier, trackingNo });
      closeModal(); toast(t('toast_ship'));
      const data = await API.get('/orders/' + orderId); state.cache.order = data; render();
    } catch (e) { toast(e.message || t('err_generic'), 'err'); btn.disabled = false; btn.textContent = t('ship_btn'); }
  },

  /* ---- ops actions ---- */
  async opsReview(verId, decision) {
    try {
      await API.post('/ops/verifications/' + verId + '/review', { decision, tier: 1 });
      toast(decision === 'approve' ? (state.lang==='ar'?'تم التوثيق':'Approved') : (state.lang==='ar'?'تم الرفض':'Rejected'));
      render();
    } catch (e) { toast(e.message || t('err_generic'), 'err'); }
  },
  async opsResolve(disputeId, resolution) {
    try {
      await API.post('/ops/disputes/' + disputeId + '/resolve', { resolution });
      toast(resolution === 'refund' ? (state.lang==='ar'?'تم الاسترداد':'Refunded') : (state.lang==='ar'?'تم التحرير':'Released'));
      render();
    } catch (e) { toast(e.message || t('err_generic'), 'err'); }
  },

  closeModal,
};
window.App = App;

/* ---- local extraction mirror (preview only; backend re-extracts authoritatively on send) ---- */
function localExtract(raw, city, urgency) {
  const txt = raw.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const brands = ['SKF','NSK','FAG','TIMKEN','NTN','KOYO','GATES','DONALDSON','MANN','PARKER','SIEMENS','ABB','WEG','GRUNDFOS','KSB'];
  let brand = ''; for (const b of brands) if (new RegExp('\\b'+b+'\\b','i').test(txt)) { brand = b; break; }
  const pm = txt.match(/\b([A-Z]{1,6}[- ]?\d{2,6}(?:[-\/][A-Z0-9]{1,6})?|\d{3,6}(?:[-\/][A-Z0-9]{1,6})?)\b/i);
  let part = pm ? pm[1].toUpperCase() : (brand || '—');
  if (brand && part !== '—' && part.indexOf(brand) < 0) part = brand + ' ' + part;
  const qm = txt.match(/(\d+)\s*(?:قطعة|قطع|حبة|عدد|وحدة|pcs?|pieces?|units?)/i);
  const qty = qm ? parseInt(qm[1], 10) : (txt.match(/\b\d{1,4}\b/) ? parseInt(txt.match(/\b\d{1,4}\b/)[0], 10) : 1);
  const cats = [['bearings',/محمل|محامل|رولمان|بلي|bearing/i],['seals',/مانع|سيل|حشية|seal|gasket/i],['filters',/فلتر|فلاتر|مرشح|filter/i],['valves',/صمام|محبس|بلف|valve/i],['belts',/سير|سيور|حزام|belt/i],['motors',/محرك|موتور|motor/i],['pumps',/مضخة|طلمبة|pump/i]];
  let cat = 'other'; for (const [c, re] of cats) if (re.test(txt)) { cat = c; break; }
  const eq = /بديل|مكافئ|equivalent|alternative|يقبل/i.test(txt) || /\b(NSK|FAG|NTN|KOYO)\b/i.test(brand ? txt.replace(new RegExp(brand,'ig'),'') : txt);
  let conf = 0.55; if (part !== '—' && /\d{3}/.test(part)) conf += 0.18; if (brand) conf += 0.12; if (qm) conf += 0.06; if (cat !== 'other') conf += 0.05;
  const crossRef = { 'SKF 6205-2RS':['NSK 6205DDU','FAG 6205-2RSR'], 'SKF 6206-2RS':['NSK 6206DDU','FAG 6206-2RSR'] };
  return { part, brand: brand || '—', qty, cat, urgency, city, equivalents_ok: eq, equivalents: crossRef[part] || [], confidence: Math.min(conf, 0.97) };
}

/* ---- invoice rendering (ZATCA) ---- */
function invoiceHtml(inv) {
  const qrSrc = makeQrPlaceholder(inv.qrBase64);
  return `<div class="invoice">
    <div class="inv-head">
      <div>${MARK}<b style="font-size:16px;margin-inline-start:8px">${state.lang==='ar'?'فاتورة ضريبية مبسّطة':'Simplified Tax Invoice'}</b></div>
      <span class="inv-phase mono">ZATCA P${inv.zatcaPhase}</span>
    </div>
    <div class="inv-meta">
      <div><span>${state.lang==='ar'?'رقم الفاتورة':'Invoice #'}</span><b class="mono">${esc(inv.invoiceNumber)}</b></div>
      <div><span>${state.lang==='ar'?'التاريخ':'Date'}</span><b class="mono">${dateStr(inv.issuedAt)}</b></div>
    </div>
    <div class="inv-parties">
      <div><span>${state.lang==='ar'?'المورّد':'Seller'}</span><b>${esc(inv.seller.name)}</b><span class="mono">VAT ${esc(inv.seller.vat)}</span></div>
      <div><span>${state.lang==='ar'?'المشتري':'Buyer'}</span><b>${esc(inv.buyer.name)}</b>${inv.buyer.vat?`<span class="mono">VAT ${esc(inv.buyer.vat)}</span>`:''}</div>
    </div>
    <table class="inv-table"><thead><tr><th>${state.lang==='ar'?'الوصف':'Description'}</th><th>${state.lang==='ar'?'كمية':'Qty'}</th><th>${state.lang==='ar'?'سعر':'Price'}</th><th>${state.lang==='ar'?'صافي':'Net'}</th></tr></thead>
      <tbody>${inv.lines.map(l => `<tr><td>${esc(l.description)}</td><td class="mono">${l.qty}</td><td class="mono">${fmt2(l.unitPrice)}</td><td class="mono">${fmt2(l.net)}</td></tr>`).join('')}</tbody></table>
    <div class="inv-totals">
      <div><span>${state.lang==='ar'?'المجموع':'Subtotal'}</span><b class="mono">${fmt2(inv.subtotal)}</b></div>
      <div><span>${state.lang==='ar'?'ضريبة ١٥٪':'VAT 15%'}</span><b class="mono">${fmt2(inv.vatTotal)}</b></div>
      <div class="inv-grand"><span>${state.lang==='ar'?'الإجمالي':'Total'}</span><b class="mono">${fmt2(inv.total)} ${t('sar')}</b></div>
    </div>
    <div class="inv-qr"><div class="qr-box mono">${qrSrc}</div><span>${state.lang==='ar'?'رمز الاستجابة (ZATCA TLV)':'QR (ZATCA TLV)'}</span></div>
    <div class="modal-actions"><button class="btn btn-primary btn-block" onclick="App.closeModal()">${state.lang==='ar'?'إغلاق':'Close'}</button></div>
  </div>`;
}
function makeQrPlaceholder(b64) {
  // Render the base64 as a compact data signature block (a real QR renderer can be dropped in later)
  const short = (b64 || '').slice(0, 64);
  return `<div class="qr-sig">⬛⬜⬛⬜⬛<br>⬜⬛⬜⬛⬜<br>⬛⬜⬛⬜⬛<br><span class="qr-b64">${esc(short)}…</span></div>`;
}

/* ============ SESSION + BOOT ============ */
async function afterLogin() {
  const me = state.me;
  state.view = me.role === 'buyer' ? 'b_dash' : me.role === 'supplier' ? 's_dash' : 'ops';
  toast(state.lang === 'ar' ? `أهلاً ${me.name||''}` : `Welcome ${me.name||''}`);
  render();
}

async function boot() {
  // load platform mode (never let a failed health check blank the page)
  try { state.health = await API.get('/health'); } catch (e) { console.error('health check failed', e); }
  // restore session
  if (API.token) {
    try {
      state.me = await API.get('/me');
      state.view = state.me.role === 'buyer' ? 'b_dash' : state.me.role === 'supplier' ? 's_dash' : 'ops';
    } catch { API.save(null); state.me = null; }
  }
  try {
    await render();
  } catch (e) {
    console.error('boot render failed, forcing landing', e);
    state.me = null; state.view = 'landing';
    try { await render(); } catch (e2) { console.error('fatal', e2); }
  }
}

function startBoot() {
  boot().catch(e => console.error('boot crashed', e));
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startBoot);
} else {
  startBoot();
}
