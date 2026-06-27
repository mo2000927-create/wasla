'use strict';
/* Persistent datastore — a real on-disk database using JSON files with atomic writes.
   Survives restarts. Zero dependencies. For higher scale this is swappable for PostgreSQL
   behind the same db.collection(...) interface (see MIGRATION notes in README). */

const fs = require('fs');
const path = require('path');
const config = require('./config');

const COLLECTIONS = [
  'organizations', // legal entities: factory (buyer) or supplier
  'users',         // individual logins within an org
  'rfqs',          // requests for quotation
  'rfq_items',     // line items (kept inline on rfq for now, table reserved)
  'quotes',        // supplier responses
  'orders',        // confirmed orders w/ escrow state
  'payments',      // payment + escrow records
  'shipments',     // delivery tracking
  'verifications', // supplier CR/VAT verification records
  'ratings',       // post-delivery ratings
  'disputes',      // dispute records
  'price_observations', // every quote logged — the data moat
  'audit_log',     // append-only, never deleted
  'notifications', // whatsapp/sms/log
  'otps',          // pending OTP challenges
  'parts',         // catalog SKUs (grows as a by-product of RFQs)
  'counters',      // sequence counters
];

class Datastore {
  constructor(dir) {
    this.dir = dir;
    this.cache = {};
    this._writeQueues = {};
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    for (const c of COLLECTIONS) this._load(c);
  }

  _file(c) { return path.join(this.dir, `${c}.json`); }

  _load(c) {
    const f = this._file(c);
    try {
      if (fs.existsSync(f)) {
        this.cache[c] = JSON.parse(fs.readFileSync(f, 'utf8'));
      } else {
        this.cache[c] = c === 'counters' ? {} : [];
        this._persist(c);
      }
    } catch (e) {
      console.error(`[db] failed to load ${c}:`, e.message);
      this.cache[c] = c === 'counters' ? {} : [];
    }
  }

  // Atomic write: write to temp file then rename (rename is atomic on POSIX).
  _persist(c) {
    const f = this._file(c);
    const tmp = `${f}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(this.cache[c], null, 2));
    fs.renameSync(tmp, f);
  }

  collection(c) {
    if (!this.cache[c]) throw new Error(`Unknown collection: ${c}`);
    return this.cache[c];
  }

  // ----- counters -----
  nextSeq(name, start = 1) {
    const ctr = this.cache.counters;
    if (ctr[name] == null) ctr[name] = start;
    const v = ctr[name];
    ctr[name] = v + 1;
    this._persist('counters');
    return v;
  }

  // ----- CRUD -----
  insert(c, doc) {
    this.cache[c].push(doc);
    this._persist(c);
    return doc;
  }

  find(c, predicate) {
    return this.cache[c].filter(predicate);
  }

  findOne(c, predicate) {
    return this.cache[c].find(predicate) || null;
  }

  update(c, predicate, mutator) {
    const doc = this.findOne(c, predicate);
    if (!doc) return null;
    mutator(doc);
    this._persist(c);
    return doc;
  }

  persist(c) { this._persist(c); }

  // Bulk replace (used by seeding)
  replaceAll(c, arr) {
    this.cache[c] = arr;
    this._persist(c);
  }

  setCounters(obj) {
    this.cache.counters = { ...this.cache.counters, ...obj };
    this._persist('counters');
  }
}

let _instance = null;
function getDB() {
  if (!_instance) _instance = new Datastore(config.dataDir);
  return _instance;
}

module.exports = { getDB, COLLECTIONS };
