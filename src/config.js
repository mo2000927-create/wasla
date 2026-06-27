'use strict';
/* WASLA platform configuration — all tunables in one place, overridable via environment variables.
   Nothing secret is hardcoded. Real API keys are read from the environment at runtime. */

const env = process.env;

module.exports = {
  port: parseInt(env.PORT || '3000', 10),
  host: env.HOST || '0.0.0.0',
  nodeEnv: env.NODE_ENV || 'development',

  // Where the JSON datastore lives. On Railway/Render set DATA_DIR to a mounted volume for persistence.
  dataDir: env.DATA_DIR || require('path').join(__dirname, '..', 'data'),

  // Security
  jwtSecret: env.JWT_SECRET || 'dev-only-change-me-in-production-please-32chars',
  jwtSecretIsDefault: !env.JWT_SECRET,
  sessionTtlHours: parseInt(env.SESSION_TTL_HOURS || '168', 10), // 7 days
  bcryptRounds: 12,

  // Commercial rules (from strategy doc)
  vatRate: parseFloat(env.VAT_RATE || '0.15'),
  commission: {
    standard: parseFloat(env.COMMISSION_STANDARD || '0.05'),  // registered / verified base
    verified: parseFloat(env.COMMISSION_VERIFIED || '0.035'),  // field-audited & verified pro
  },

  // Liquidity SLA (constitutional)
  sla: {
    fillRateTarget: 0.75,
    quoteWindowHours: 6,
    minQuotes: 3,
  },

  // ---- Payments (escrow) ----
  // mode: 'simulated' = realistic in-platform escrow state machine, no real money.
  //       'moyasar'   = route real card payments + payouts through Moyasar.
  payments: {
    mode: env.PAYMENTS_MODE || 'simulated',
    moyasar: {
      publishableKey: env.MOYASAR_PUBLISHABLE_KEY || '',
      secretKey: env.MOYASAR_SECRET_KEY || '',
      apiBase: 'https://api.moyasar.com/v1',
      // Funds release window after delivery proof (hours)
      autoReleaseHours: parseInt(env.ESCROW_AUTO_RELEASE_HOURS || '72', 10),
    },
  },

  // ---- Supplier CR/VAT verification ----
  // mode: 'manual' = ops reviews uploaded CR docs and approves in the cockpit.
  //       'wathq'  = call Wathq API to verify CR automatically.
  //       'hybrid' = try Wathq, fall back to manual review on failure.
  verification: {
    mode: env.VERIFICATION_MODE || 'manual',
    wathq: {
      apiKey: env.WATHQ_API_KEY || '',
      apiBase: env.WATHQ_API_BASE || 'https://api.wathq.sa/v5',
    },
  },

  // ---- SMS OTP ----
  // mode: 'console' = print OTP to server log (dev). 'unifonic' / 'taqnyat' = real SMS.
  sms: {
    mode: env.SMS_MODE || 'console',
    unifonic: { appsid: env.UNIFONIC_APPSID || '', senderId: env.UNIFONIC_SENDER || 'WASLA' },
    taqnyat: { bearer: env.TAQNYAT_BEARER || '', sender: env.TAQNYAT_SENDER || 'WASLA' },
    otpTtlMinutes: 10,
  },

  // ---- WhatsApp / notifications ----
  whatsapp: {
    businessNumber: env.WHATSAPP_BUSINESS_NUMBER || '', // e.g. 9665XXXXXXXX
  },

  // ---- E-invoicing (ZATCA) ----
  zatca: {
    mode: env.ZATCA_MODE || 'local', // 'local' = generate compliant-style invoice + QR; 'qoyod'/'api' later
    sellerVat: env.PLATFORM_VAT || '300000000000003',
    sellerName: env.PLATFORM_NAME_EN || 'WASLA Marketplace',
    sellerNameAr: env.PLATFORM_NAME_AR || 'منصة وصلة',
  },
};
