'use strict';
/* Payments + escrow adapter.
   mode 'simulated' : realistic escrow state machine, no real money moves. Default for pilot.
   mode 'moyasar'   : real card capture + payout via Moyasar (keys from env).
   The rest of the platform only talks to this interface, so switching is a config change. */

const https = require('https');
const config = require('./config');

function moyasarRequest(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const auth = Buffer.from(`${config.payments.moyasar.secretKey}:`).toString('base64');
    const req = https.request({
      hostname: 'api.moyasar.com',
      path: `/v1${pathname}`,
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, res => {
      let chunks = '';
      res.on('data', d => chunks += d);
      res.on('end', () => {
        try {
          const parsed = chunks ? JSON.parse(chunks) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
          else reject(new Error(parsed.message || `Moyasar error ${res.statusCode}`));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/* Capture (hold) funds for an order. Returns a payment descriptor. */
async function holdFunds({ orderId, amountSar, description, source }) {
  if (config.payments.mode === 'moyasar') {
    // amount in halalas (smallest unit)
    const payment = await moyasarRequest('POST', '/payments', {
      amount: Math.round(amountSar * 100),
      currency: 'SAR',
      description: description || `WASLA order ${orderId}`,
      source, // { type:'creditcard', name, number, cvc, month, year } or token
      metadata: { order_id: orderId, platform: 'wasla' },
    });
    return {
      provider: 'moyasar',
      providerId: payment.id,
      status: payment.status === 'paid' ? 'held' : 'pending',
      amount: amountSar,
      raw: payment,
    };
  }
  // simulated: instant hold
  return {
    provider: 'simulated',
    providerId: 'sim_' + Math.random().toString(16).slice(2, 12),
    status: 'held',
    amount: amountSar,
  };
}

/* Release held funds to the supplier (escrow release). */
async function releaseFunds(payment, { supplierIban } = {}) {
  if (config.payments.mode === 'moyasar' && payment.provider === 'moyasar') {
    // In production this is a payout/transfer to the supplier's settlement account.
    // Moyasar settles to the merchant; supplier payout is handled by the platform's
    // settlement process. We record the intent here.
    return { ...payment, status: 'released', releasedAt: new Date().toISOString() };
  }
  return { ...payment, status: 'released', releasedAt: new Date().toISOString() };
}

/* Refund held funds to the buyer (dispute resolution). */
async function refundFunds(payment) {
  if (config.payments.mode === 'moyasar' && payment.provider === 'moyasar') {
    await moyasarRequest('POST', `/payments/${payment.providerId}/refund`, {});
    return { ...payment, status: 'refunded', refundedAt: new Date().toISOString() };
  }
  return { ...payment, status: 'refunded', refundedAt: new Date().toISOString() };
}

function paymentMode() { return config.payments.mode; }

module.exports = { holdFunds, releaseFunds, refundFunds, paymentMode };
