'use strict';
const { randomUUID } = require('crypto');

// HTTP fallback and WS share a timeline and a single atomic persistence job.
// This bounded reconnect window is process-local, not a durable event journal.
class DiceReceipts {
  constructor({ ttlMs = 120000, maxEntries = 512, maxBytes = 8 * 1024 * 1024, now = Date.now } = {}) {
    Object.assign(this, { ttlMs, maxEntries, maxBytes, now }); this.entries = new Map(); this.bytes = 0;
  }
  get(roomId, userId, nonce, create) {
    const key = JSON.stringify([roomId, userId, nonce || randomUUID()]);
    for (const [id, entry] of this.entries) if (!entry.pending && entry.expires <= this.now()) this.remove(id);
    const previous = this.entries.get(key);
    if (previous) return previous;
    const event = create(), bytes = Buffer.byteLength(JSON.stringify(event));
    for (const [id, entry] of this.entries) {
      if (this.entries.size < this.maxEntries && this.bytes + bytes <= this.maxBytes) break;
      if (!entry.pending) this.remove(id);
    }
    if (this.entries.size >= this.maxEntries || this.bytes + bytes > this.maxBytes) throw new Error('Too many pending dice events');
    const entry = { event, bytes, expires:this.now() + this.ttlMs, pending:null, result:null, published:false };
    this.entries.set(key, entry); this.bytes += bytes; return entry;
  }
  remove(key) { this.bytes -= this.entries.get(key)?.bytes || 0; this.entries.delete(key); }
  persist(entry, save) {
    if (entry.result) return Promise.resolve(entry.result);
    if (entry.pending) return entry.pending;
    entry.pending = Promise.resolve().then(save).then(result => { entry.result = result; return result; })
      .finally(() => { entry.pending = null; entry.expires = this.now() + this.ttlMs; });
    return entry.pending;
  }
}
module.exports = DiceReceipts;
