'use strict';
/* ZATCA (Fatoorah) e-invoice generation.
   Produces a Phase-1 (generation phase) compliant simplified tax invoice payload, including the
   mandatory base64 TLV QR code (seller name, VAT number, timestamp, total, VAT total).
   Phase-2 (integration: CSID signing + clearance API) hooks in later via zatca.mode='api'. */

const config = require('./config');

// TLV encode a single field: tag(1 byte) + length(1 byte) + value(UTF-8 bytes)
function tlv(tag, value) {
  const valBuf = Buffer.from(String(value), 'utf8');
  return Buffer.concat([Buffer.from([tag]), Buffer.from([valBuf.length]), valBuf]);
}

/* Build the ZATCA QR base64 string (Phase 1 mandatory fields). */
function buildQrBase64({ sellerName, vatNumber, timestamp, total, vatTotal }) {
  const buf = Buffer.concat([
    tlv(1, sellerName),
    tlv(2, vatNumber),
    tlv(3, timestamp),
    tlv(4, Number(total).toFixed(2)),
    tlv(5, Number(vatTotal).toFixed(2)),
  ]);
  return buf.toString('base64');
}

/* Generate a full invoice object for an order. */
function generateInvoice({ order, rfq, quote, supplier, buyerOrg }) {
  const vatRate = config.vatRate;
  const lineNet = quote.price * rfq.qty;
  const subtotal = Math.round(lineNet * 100) / 100;
  const vatTotal = Math.round(subtotal * vatRate * 100) / 100;
  const total = Math.round((subtotal + vatTotal) * 100) / 100;
  const timestamp = order.created || new Date().toISOString();

  const sellerName = supplier ? (supplier.en || supplier.ar) : config.zatca.sellerName;
  const sellerVat = supplier ? supplier.vat : config.zatca.sellerVat;

  const qrBase64 = buildQrBase64({
    sellerName,
    vatNumber: sellerVat,
    timestamp,
    total,
    vatTotal,
  });

  return {
    invoiceNumber: order.inv,
    type: 'simplified_tax_invoice',
    issuedAt: timestamp,
    seller: { name: sellerName, vat: sellerVat },
    buyer: {
      name: buyerOrg ? (buyerOrg.en || buyerOrg.ar) : 'Buyer',
      vat: buyerOrg ? buyerOrg.vat : '',
    },
    lines: [{
      description: `${rfq.part} — ${rfq.cat}${quote.tier === 'eq' ? ' (equivalent)' : ''}`,
      qty: rfq.qty,
      unitPrice: quote.price,
      net: subtotal,
    }],
    subtotal,
    vatRate,
    vatTotal,
    total,
    currency: 'SAR',
    qrBase64,
    zatcaPhase: config.zatca.mode === 'api' ? 2 : 1,
  };
}

module.exports = { generateInvoice, buildQrBase64 };
