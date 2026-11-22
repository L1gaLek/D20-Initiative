const { randomUUID } = require('crypto');

// A small, process-local reconnect window. No additional database writes.
class RoomEventJournal {
  constructor({ maxBytes = 16 * 1024 * 1024, roomBytes = 2 * 1024 * 1024, maxRooms = 128, maxEvents = 512, ttlMs = 120000, now = Date.now } = {}) {
    Object.assign(this, { maxBytes, roomBytes, maxRooms, maxEvents, ttlMs, now });
    this.rooms = new Map(); this.bytes = 0;
  }
  room(id) {
    let room = this.rooms.get(id);
    if (!room) room = { epoch: randomUUID(), seq: 0, floor: 0, bytes: 0, events: [] };
    this.rooms.delete(id); this.rooms.set(id, room);
    while (this.rooms.size > this.maxRooms) this.drop(this.rooms.keys().next().value);
    this.trim(room);
    return room;
  }
  drop(id) { this.bytes -= this.rooms.get(id)?.bytes || 0; this.rooms.delete(id); }
  shift(room) {
    const item = room.events.shift(); if (!item) return;
    room.floor = item.seq; room.bytes -= item.bytes; this.bytes -= item.bytes;
  }
  trim(room) {
    while (room.events.length && (room.events[0].at < this.now() - this.ttlMs || room.bytes > this.roomBytes || room.events.length > this.maxEvents)) this.shift(room);
  }
  cursor(id) { const r = this.room(id); return { epoch: r.epoch, seq: r.seq }; }
  append(id, payload) {
    const r = this.room(id);
    payload.__streamEpoch = r.epoch; payload.__streamSeq = ++r.seq;
    const raw = JSON.stringify(payload), bytes = Buffer.byteLength(raw);
    r.events.push({ raw, bytes, seq: r.seq, at: this.now() }); r.bytes += bytes; this.bytes += bytes;
    this.trim(r);
    while (this.bytes > this.maxBytes && this.rooms.size > 1) this.drop(this.rooms.keys().next().value);
    while (this.bytes > this.maxBytes && r.events.length) this.shift(r);
    return { epoch: r.epoch, seq: r.seq };
  }
  read(id, cursor) {
    const r = this.room(id);
    if (!cursor || cursor.epoch !== r.epoch || !Number.isInteger(cursor.seq) || cursor.seq < r.floor || cursor.seq > r.seq) return null;
    return { cursor: { epoch: r.epoch, seq: r.seq }, events: r.events.filter(e => e.seq > cursor.seq).map(e => JSON.parse(e.raw)) };
  }
}
module.exports = RoomEventJournal;
