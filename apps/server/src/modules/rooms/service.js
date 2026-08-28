'use strict';
const crypto = require('crypto');
const { hash, verify } = require('@node-rs/argon2');
function httpError(statusCode, message) { return Object.assign(new Error(message), { statusCode }); }
function publicRoom(room, actorId = '') {
  const members = Array.isArray(room.members) ? room.members : [];
  return { id: room.id, name: room.name, scenario: room.scenario, hasPassword: !!room.passwordHash, uniqueUsers: members.length, ownerName: members.find((member) => member.userId === room.ownerId)?.userName || '', isMine: room.ownerId === actorId };
}
function createRoomsService({ repository }) {
  async function list(actor) { return (await repository.list()).map((room) => publicRoom(room, actor.userId)); }
  async function create(actor, input = {}) {
    if ((await repository.list()).some((room) => room.ownerId === actor.userId)) throw httpError(409, 'User already owns a room');
    const name = String(input.name || '').trim().slice(0, 100);
    if (!name) throw httpError(400, 'Room name is required');
    const password = String(input.password || '');
    const room = { id: crypto.randomUUID(), name, scenario: String(input.scenario || '').trim().slice(0, 200), ownerId: actor.userId, passwordHash: password ? await hash(password) : '', members: [{ userId: actor.userId, userName: actor.userName, role: 'GM' }], state: input.state && typeof input.state === 'object' ? structuredClone(input.state) : null, createdAt: new Date().toISOString() };
    await repository.save(room); return publicRoom(room, actor.userId);
  }
  async function join(actor, roomId, input = {}) {
    const room = await repository.findById(roomId);
    if (!room) throw httpError(404, 'Room not found');
    if (room.passwordHash && !(await verify(room.passwordHash, String(input.password || '')))) throw httpError(403, 'Invalid room password');
    const requestedRole = ['GM', 'Player', 'Spectator'].includes(String(input.role)) ? String(input.role) : 'Player';
    if (requestedRole === 'GM' && room.members.some((member) => member.role === 'GM' && member.userId !== actor.userId)) throw httpError(409, 'GM already exists in room');
    const existing = room.members.find((member) => member.userId === actor.userId);
    if (existing) { existing.userName = actor.userName; existing.role = room.ownerId === actor.userId ? 'GM' : requestedRole; }
    else room.members.push({ userId: actor.userId, userName: actor.userName, role: requestedRole });
    await repository.save(room);
    const member = room.members.find((item) => item.userId === actor.userId);
    return { room: publicRoom(room, actor.userId), role: member.role };
  }
  return Object.freeze({ create, join, list });
}
module.exports = { createRoomsService, publicRoom };
