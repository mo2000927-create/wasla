# WASLA / وصلة — Industrial MRO Parts Marketplace

**منصة متكاملة جاهزة للتشغيل** — سوق قطع الغيار الصناعية بالذكاء الاصطناعي للسوق السعودي.
A full, server-ready B2B marketplace: supplier registration, CR/VAT verification, AI-structured RFQs, quote comparison, escrow-protected payments, ZATCA e-invoicing, disputes, and an operations cockpit.

Zero npm dependencies. Runs on any Node.js ≥ 18 host. Data persists to disk.

---

## 1. التشغيل محلياً / Run locally

```bash
cd wasla-platform
npm start          # or: node src/server.js
```

Open <http://localhost:3000>. On first boot the database is seeded automatically.

**حسابات التجربة / Demo logins** (password `wasla-demo-2026`, ops `wasla-ops-2026`):

| Role | Email | What you see |
|------|-------|--------------|
| مصنع / Buyer | `buyer@wasla.sa` | Request parts, compare quotes, pay via escrow, confirm receipt, invoices |
| مورّد / Supplier | `supplier1@wasla.sa` | Matched RFQs, submit quotes, ship orders, payouts |
| عمليات / Ops | `ops@wasla.sa` | Verification queue, dispute resolution, GMV/commission dashboards |

Register a brand-new supplier from the UI to see the verification gate: a new supplier **cannot quote** until Ops approves them in the cockpit.

Run the tests:

```bash
npm test           # 50 service-layer assertions + 20 security tests
node test/security.js   # security regressions only (privilege escalation, brute-force, etc.)
```

---

## 2. النشر / Deploy

The platform is a single Node process serving both the API and the frontend. It deploys as-is to any Node host.

### Railway / Render (recommended)

1. Push this folder to a Git repo.
2. Create a new service from the repo. Build command: *(none)*. Start command: `node src/server.js`.
3. **Mount a persistent volume** and point `DATA_DIR` at it (e.g. `/data`), otherwise the JSON datastore resets on every redeploy.
4. Set environment variables (see §3). At minimum set a strong `JWT_SECRET`.
5. Deploy. The health check is `GET /api/health`.

### Any VPS (Ubuntu, etc.)

```bash
git clone <repo> && cd wasla-platform
export JWT_SECRET="$(openssl rand -hex 32)"
export DATA_DIR=/var/lib/wasla
node src/server.js          # put behind pm2/systemd + a reverse proxy (Caddy/Nginx) for HTTPS
```

---

## 3. الإعدادات / Configuration (environment variables)

Everything is configured via env vars. Nothing secret is hardcoded.

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | HTTP port |
| `JWT_SECRET` | dev placeholder | **Set a 32+ char secret in production** |
| `DATA_DIR` | `./data` | Where the datastore lives (use a mounted volume in prod) |
| `VAT_RATE` | `0.15` | KSA VAT |
| `COMMISSION_STANDARD` | `0.05` | Success fee, registered suppliers |
| `COMMISSION_VERIFIED` | `0.035` | Success fee, verified/field-audited |
| `PAYMENTS_MODE` | `simulated` | `simulated` or `moyasar` |
| `VERIFICATION_MODE` | `manual` | `manual`, `wathq`, or `hybrid` |
| `SMS_MODE` | `console` | `console`, `unifonic`, or `taqnyat` |
| `ZATCA_MODE` | `local` | `local` (Phase-1 QR) or `api` (Phase-2 later) |

---

## 4. تفعيل الخدمات الحقيقية / Activating real integrations

The platform ships in **pilot mode** (realistic simulation). Each integration flips on by setting a mode + keys — **no code changes**.

### 💳 Moyasar (real payments + escrow)

```bash
export PAYMENTS_MODE=moyasar
export MOYASAR_SECRET_KEY=sk_live_xxxxx
export MOYASAR_PUBLISHABLE_KEY=pk_live_xxxxx
```

Card capture, refunds, and the escrow hold/release flow then route through Moyasar (`src/payments.js`). The buyer's accept-quote step sends a real `source` (card token) instead of the simulated stub. Wire the publishable key into the payment form on the frontend when you go live.

### 🏛️ Wathq (real CR/VAT verification)

```bash
export VERIFICATION_MODE=wathq      # or 'hybrid' to fall back to manual on failure
export WATHQ_API_KEY=your_wathq_key
```

Supplier verification then queries Wathq automatically (`src/verification.js`). In `manual`/`hybrid` mode, unresolved cases land in the Ops verification queue.

### 📱 Unifonic / Taqnyat (real SMS OTP)

```bash
export SMS_MODE=unifonic
export UNIFONIC_APPSID=xxxxx
export UNIFONIC_SENDER=WASLA
```

In `console` mode the OTP is printed to the server log so you can test the flow without a paid account.

### 🧾 WhatsApp Business

```bash
export WHATSAPP_BUSINESS_NUMBER=9665XXXXXXXX
```

RFQ broadcasts and order notifications are logged to the `notifications` collection; connect the WhatsApp Business API send in `services.js → notify()` when ready.

---

## 5. المعمارية / Architecture

```
src/
  config.js        env-driven configuration (all tunables)
  security.js      scrypt password hashing + HS256 JWT (zero-dep)
  db.js            persistent JSON datastore, atomic writes, 17 collections
  rfq-engine.js    Arabic/English extraction, OEM cross-ref, supplier matching/ranking
  payments.js      escrow adapter (simulated | Moyasar)
  verification.js  CR/VAT adapter (manual | Wathq) + SMS OTP
  invoicing.js     ZATCA Phase-1 e-invoice + TLV QR
  services.js      all business logic (auth, RFQ lifecycle, escrow state machine, disputes)
  server.js        zero-dep HTTP server + REST API + static hosting
  seed.js          idempotent demo data
public/
  index.html       SPA shell + design-system CSS
  platform.css     dashboard/component styles
  app.js           bilingual (AR/EN) RTL-first SPA, talks to /api
test/
  e2e.js           50-assertion end-to-end suite
```

**Escrow state machine:** `held → shipped → released | disputed → refunded`
**Supplier tiers:** `0` unverified (can't quote) → `1` registered → `2` verified (3.5% fee) → `3` field-audited

### Swapping the datastore for PostgreSQL

`db.js` exposes a small interface (`collection / insert / find / findOne / update / nextSeq`). To move to Postgres at scale, implement the same methods backed by SQL (one table per collection, `payload JSONB`) and the rest of the platform is unchanged. The schema mirrors the 16 tables in the strategy document (Part 8).

---

## 6. الأمان / Security

The platform ships hardened. A dedicated suite (`node test/security.js`, 20 assertions) proves each defense.

**Built-in defenses:**
- **Privilege escalation blocked** — the public API only allows self-registering as `buyer` or `supplier`. The `ops` role can never be created from outside; it exists only via seeding/admin.
- **Production secret guard** — the server refuses to start in `NODE_ENV=production` unless a real `JWT_SECRET` is set. Forged and tampered tokens are rejected (HMAC-verified).
- **Brute-force protection** — login locks for 15 min after 5 failed attempts, plus a tight 10-req/min limit on every `/api/auth/*` endpoint (120/min elsewhere).
- **Password policy** — minimum 8 characters with at least one letter and one digit.
- **Input sanitization** — roles, cities, and categories are whitelisted; CR/VAT/IBAN and names are length-capped; email format validated.
- **OTP never leaks** in production (only printed to the log in local `console` SMS mode).
- **Security headers** — Content-Security-Policy, HSTS (over HTTPS), `X-Frame-Options: DENY`, `X-Content-Type-Options`, Referrer-Policy, Permissions-Policy.
- **Data masking** — CR/VAT masked in public responses; IBAN never returned to clients.
- **Append-only `audit_log`** records every money-touching action; path-traversal protection on static files; internal 500 errors never leak details.

**Before taking real money:** set a strong `JWT_SECRET`, serve only over HTTPS (TLS terminates at the Render/Railway proxy), obtain the licensed-PSP agreement (Moyasar), get a legal opinion on the escrow/intermediary model, and complete ZATCA Fatoorah onboarding.

> **مهم:** غيّر كلمات مرور حسابات التجربة قبل الإطلاق، أو احذفها وأنشئ حسابات حقيقية. حساب `ops@wasla.sa` صلاحياته كاملة.

---

*وصلة — أسرع طريق موثوق لقطعة الغيار · WASLA — the fastest trustworthy path to the part.*
