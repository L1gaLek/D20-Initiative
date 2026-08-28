const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildClientEnvelope,
  isMessageForRoom,
  shouldAcceptServerEvent
} = require('../../packages/contracts/realtime.js');

test('client envelope preserves payload and adds transport metadata', () => {
  assert.deepEqual(buildClientEnvelope(
    { type: 'tokenRow', row: { id: 'token-a' } },
    { roomId: 'room-a', clientId: 'client-a', nonce: 'nonce-a', sentAt: 123, optimisticApplied: true }
  ), {
    type: 'tokenRow',
    roomId: 'room-a',
    row: { id: 'token-a' },
    __wsNonce: 'nonce-a',
    __clientSentAt: 123,
    __fromWsClient: 'client-a',
    __optimisticApplied: true
  });
});

test('explicit message room wins over the current room', () => {
  const envelope = buildClientEnvelope(
    { type: 'leaveRoom', roomId: 'room-old' },
    { roomId: 'room-new', clientId: 'client-a', nonce: 'nonce-a', sentAt: 123 }
  );
  assert.equal(envelope.roomId, 'room-old');
});

test('invalid commands do not produce an envelope', () => {
  const context = { roomId: 'room-a', clientId: 'client-a', nonce: 'nonce-a' };
  assert.equal(buildClientEnvelope(null, context), null);
  assert.equal(buildClientEnvelope({}, context), null);
  assert.equal(buildClientEnvelope({ type: 'state' }, { ...context, roomId: '' }), null);
});

test('room filtering accepts global events and rejects another room', () => {
  assert.equal(isMessageForRoom({ type: 'pong' }, 'room-a'), true);
  assert.equal(isMessageForRoom({ type: 'state', roomId: 'room-a' }, 'room-a'), true);
  assert.equal(isMessageForRoom({ type: 'state', roomId: 'room-b' }, 'room-a'), false);
});

test('server event sequence is monotonic per room', () => {
  const lastSequenceByRoom = new Map();
  const options = { currentRoomId: 'room-a', lastSequenceByRoom };
  assert.equal(shouldAcceptServerEvent({ __serverEvent: true, __eventSeq: 4, roomId: 'room-a' }, options), true);
  assert.equal(shouldAcceptServerEvent({ __serverEvent: true, __eventSeq: 4, roomId: 'room-a' }, options), false);
  assert.equal(shouldAcceptServerEvent({ __serverEvent: true, __eventSeq: 3, roomId: 'room-a' }, options), false);
  assert.equal(shouldAcceptServerEvent({ __serverEvent: true, __eventSeq: 1, roomId: 'room-b' }, options), false);
  assert.equal(lastSequenceByRoom.get('room-a'), 4);
});

test('legacy events without server sequence remain compatible', () => {
  const options = { currentRoomId: 'room-a', lastSequenceByRoom: new Map() };
  assert.equal(shouldAcceptServerEvent({ type: 'state', roomId: 'room-a' }, options), true);
  assert.equal(shouldAcceptServerEvent({ __serverEvent: true, roomId: 'room-a' }, options), true);
});
