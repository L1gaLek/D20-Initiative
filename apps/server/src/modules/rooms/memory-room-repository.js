'use strict';
function clone(value) { return structuredClone(value); }
function createMemoryRoomRepository(seed = []) {
  const rooms = new Map(seed.map((room) => [String(room.id), clone(room)]));
  return Object.freeze({
    async list() { return [...rooms.values()].map(clone); },
    async findById(id) { return rooms.has(String(id)) ? clone(rooms.get(String(id))) : null; },
    async save(room) { rooms.set(String(room.id), clone(room)); return clone(room); },
    async deleteById(id) { return rooms.delete(String(id)); }
  });
}
module.exports = { createMemoryRoomRepository };
