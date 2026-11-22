'use strict';

// Shared by room readers, never by authorization decisions or state mutations.
// Generation checks prevent a slow SELECT from repopulating invalidated data.
class RoomReadCache {
  constructor({ ttlMs = 30_000, maxBytes = 16 * 1024 * 1024, maxEntries = 128, now = Date.now } = {}) {
    Object.assign(this, { ttlMs, maxBytes, maxEntries, now });
    this.entries = new Map();
    this.pending = new Map();
    this.bytes = 0;
    this.hits = 0;
    this.loads = 0;
  }
  delete(key) {
    const entry = this.entries.get(key);
    if (entry) this.bytes -= entry.bytes;
    this.entries.delete(key);
  }
  invalidate(roomId) {
    for (const [key, entry] of this.entries) if (entry.roomId === roomId) this.delete(key);
    for (const [key, entry] of this.pending) if (entry.roomId === roomId) this.pending.delete(key);
  }
  async load(roomId, parts, loader, retries = 1) {
    const key = JSON.stringify([roomId, ...parts]);
    const cached = this.entries.get(key);
    if (cached && cached.expires > this.now()) { this.hits++; return cached.value; }
    this.delete(key);
    if (this.pending.has(key)) { this.hits++; return this.pending.get(key).promise; }
    const entry = { roomId };
    this.loads++;
    entry.promise = Promise.resolve().then(loader).then(value => {
      if (this.pending.get(key) !== entry) {
        // Continuous wall/fog painting must not cause an unbounded SELECT loop.
        // Return the last query's snapshot without caching it after one retry.
        return retries > 0 ? this.load(roomId, parts, loader, retries - 1) : value;
      }
      const bytes = Buffer.byteLength(JSON.stringify(value ?? null));
      if (bytes <= this.maxBytes) {
        while (this.entries.size && (this.entries.size >= this.maxEntries || this.bytes + bytes > this.maxBytes)) this.delete(this.entries.keys().next().value);
        this.entries.set(key, { roomId, value, bytes, expires: this.now() + this.ttlMs });
        this.bytes += bytes;
      }
      return value;
    }).finally(() => { if (this.pending.get(key) === entry) this.pending.delete(key); });
    this.pending.set(key, entry);
    return entry.promise;
  }
}
module.exports = RoomReadCache;
