'use strict';
/* Supplier verification (CR/VAT) + SMS OTP adapters.
   verification.mode 'manual' : ops approves uploaded CR docs in the cockpit.
                     'wathq'  : automatic CR verification via Wathq API.
                     'hybrid' : try Wathq, fall back to manual review.
   sms.mode 'console' : OTP printed to server log (dev). 'unifonic'/'taqnyat' : real SMS. */

const https = require('https');
const config = require('./config');

/* ---------- Wathq CR verification ---------- */
function wathqLookup(crNumber) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.wathq.sa',
      path: `/commercial-registration/info/${encodeURIComponent(crNumber)}`,
      method: 'GET',
      headers: { 'apiKey': config.verification.wathq.apiKey, 'Accept': 'application/json' },
    }, res => {
      let chunks = '';
      res.on('data', d => chunks += d);
      res.on('end', () => {
        try {
          const parsed = chunks ? JSON.parse(chunks) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
          else reject(new Error(parsed.message || `Wathq error ${res.statusCode}`));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/* Returns { outcome:'verified'|'pending'|'failed', method, detail } */
async function verifyCR({ crNumber, vatNumber, legalNameAr }) {
  const mode = config.verification.mode;

  if ((mode === 'wathq' || mode === 'hybrid') && config.verification.wathq.apiKey) {
    try {
      const info = wathqLookup ? await wathqLookup(crNumber) : null;
      if (info && (info.status === 'active' || info.crEntityNumber || info.name)) {
        return {
          outcome: 'verified',
          method: 'wathq',
          detail: {
            name: info.name || info.crName || legalNameAr,
            status: info.status || 'active',
            crNumber,
          },
        };
      }
      if (mode === 'wathq') {
        return { outcome: 'failed', method: 'wathq', detail: { reason: 'not_found_or_inactive' } };
      }
      // hybrid -> fall through to manual
    } catch (e) {
      if (mode === 'wathq') {
        return { outcome: 'pending', method: 'wathq', detail: { error: e.message } };
      }
      // hybrid -> fall through to manual
    }
  }

  // manual (or hybrid fallback): goes to ops review queue
  return {
    outcome: 'pending',
    method: 'manual',
    detail: { reason: 'awaiting_ops_review', crNumber, vatNumber },
  };
}

function verificationMode() { return config.verification.mode; }

/* ---------- SMS OTP ---------- */
function unifonicSend(to, message) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      AppSid: config.sms.unifonic.appsid,
      SenderID: config.sms.unifonic.senderId,
      Body: message,
      Recipient: to,
    }).toString();
    const req = https.request({
      hostname: 'el.cloud.unifonic.com',
      path: '/rest/SMS/messages',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, res => { let c = ''; res.on('data', d => c += d); res.on('end', () => resolve(c)); });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

async function sendOtp(phone, code) {
  const message = `WASLA — رمز التحقق: ${code}\nصالح لـ ${config.sms.otpTtlMinutes} دقائق.`;
  if (config.sms.mode === 'unifonic' && config.sms.unifonic.appsid) {
    try { await unifonicSend(phone, message); return { delivered: true, channel: 'unifonic' }; }
    catch (e) { return { delivered: false, channel: 'unifonic', error: e.message }; }
  }
  // console mode (dev): print so you can test the flow without a paid SMS account
  console.log(`[OTP] -> ${phone}: ${code}`);
  return { delivered: true, channel: 'console' };
}

module.exports = { verifyCR, verificationMode, sendOtp };
