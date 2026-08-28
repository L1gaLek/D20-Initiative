(function initRealtimeContracts(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.D20RealtimeContracts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createRealtimeContracts() {
  'use strict';

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function buildClientEnvelope(message, context = {}) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) return null;
    const type = cleanString(message.type);
    const roomId = cleanString(message.roomId || context.roomId);
    const clientId = cleanString(context.clientId);
    const nonce = cleanString(context.nonce);
    if (!type || !roomId || !clientId || !nonce) return null;

    const sentAt = Number(context.sentAt);
    return {
      ...message,
      type,
      roomId,
      __wsNonce: nonce,
      __clientSentAt: Number.isFinite(sentAt) && sentAt > 0 ? sentAt : Date.now(),
      __fromWsClient: clientId,
      __optimisticApplied: context.optimisticApplied === true
    };
  }

  function isMessageForRoom(message, currentRoomId) {
    if (!message || typeof message !== 'object') return false;
    const expected = cleanString(currentRoomId);
    const actual = cleanString(message.roomId);
    return !actual || !expected || actual === expected;
  }

  function shouldAcceptServerEvent(message, options = {}) {
    if (!message || typeof message !== 'object') return true;
    if (!isMessageForRoom(message, options.currentRoomId)) return false;
    if (!message.__serverEvent) return true;

    const sequence = Math.trunc(Number(message.__eventSeq) || 0);
    const roomId = cleanString(message.roomId || options.currentRoomId);
    if (!sequence || !roomId) return true;

    const sequences = options.lastSequenceByRoom;
    if (!sequences || typeof sequences.get !== 'function' || typeof sequences.set !== 'function') return true;
    const previous = Math.trunc(Number(sequences.get(roomId)) || 0);
    if (sequence <= previous) return false;
    sequences.set(roomId, sequence);
    return true;
  }

  return Object.freeze({
    buildClientEnvelope,
    isMessageForRoom,
    shouldAcceptServerEvent
  });
});
