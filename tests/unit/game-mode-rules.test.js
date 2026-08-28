const test = require('node:test');
const assert = require('node:assert/strict');
const {
  advanceCombatTurn,
  buildCombatTurnOrder,
  canStartCombat,
  canUserMovePlayer,
  getCurrentTurnActorId,
  isTokenUnplaced,
  resetForExploration
} = require('../../client/domain/game-mode-rules.js');

const owned = { id: 'token-a', ownerId: 'user-a', x: 2, y: 3 };
const other = { id: 'token-b', ownerId: 'user-b', x: 4, y: 5 };

function canMove(player, state, options = {}) {
  return canUserMovePlayer({
    player,
    state,
    userId: options.userId || 'user-a',
    role: options.role || 'Player',
    forInitialPlacement: !!options.forInitialPlacement
  });
}

test('GM can move any valid token in every phase', () => {
  for (const phase of ['exploration', 'initiative', 'combat']) {
    assert.equal(canMove(other, { phase }, { role: 'GM' }), true);
  }
});

test('player can freely move an owned token during exploration', () => {
  assert.equal(canMove(owned, { phase: 'exploration' }), true);
});

test('player cannot move a token owned by another user', () => {
  assert.equal(canMove(other, { phase: 'exploration' }), false);
});

test('player cannot move tokens while initiative is being collected', () => {
  assert.equal(canMove(owned, { phase: 'initiative' }), false);
});

test('player can move only the current token during combat', () => {
  const state = { phase: 'combat', turnOrder: ['token-b', 'token-a'], currentTurnIndex: 1 };
  assert.equal(canMove(owned, state), true);
  assert.equal(canMove({ ...owned, id: 'token-c' }, state), false);
});

test('owned unplaced token can be placed once during combat when explicitly allowed', () => {
  const unplaced = { ...owned, x: null, y: null };
  const state = { phase: 'combat', turnOrder: ['token-b'], currentTurnIndex: 0 };
  assert.equal(canMove(unplaced, state), false);
  assert.equal(canMove(unplaced, state, { forInitialPlacement: true }), true);
  assert.equal(canMove(owned, state, { forInitialPlacement: true }), false);
});

test('invalid tokens are never movable', () => {
  assert.equal(canMove(null, { phase: 'exploration' }), false);
  assert.equal(canMove({ ownerId: 'user-a' }, { phase: 'exploration' }), false);
});

test('turn and placement helpers preserve current state semantics', () => {
  assert.equal(getCurrentTurnActorId({ phase: 'combat', turnOrder: ['a', 'b'], currentTurnIndex: 1 }), 'b');
  assert.equal(getCurrentTurnActorId({ phase: 'exploration', turnOrder: ['a'], currentTurnIndex: 0 }), '');
  assert.equal(isTokenUnplaced({ x: null, y: 0 }), true);
  assert.equal(isTokenUnplaced({ x: 0, y: 0 }), false);
});

test('returning to exploration clears turn state', () => {
  const state = { phase: 'combat', turnOrder: ['a'], currentTurnIndex: 2, round: 4, turnEpoch: 99 };
  assert.equal(resetForExploration(state), state);
  assert.deepEqual(state, {
    phase: 'exploration',
    turnOrder: [],
    currentTurnIndex: 0,
    round: 1,
    turnEpoch: 0
  });
});

test('combat requires at least one eligible combatant with initiative', () => {
  const state = {
    players: [
      { id: 'a', inCombat: true, hasRolledInitiative: true, initiative: 12, mapId: 'map-a' },
      { id: 'b', inCombat: true, hasRolledInitiative: false, initiative: null, mapId: 'map-b' }
    ]
  };
  const onMapA = (player) => player.mapId === 'map-a';
  assert.equal(canStartCombat(state), false);
  assert.equal(canStartCombat(state, onMapA), true);
  assert.deepEqual(buildCombatTurnOrder(state, onMapA), ['a']);
});

test('combat order is sorted by descending initiative', () => {
  const state = {
    players: [
      { id: 'slow', inCombat: true, hasRolledInitiative: true, initiative: 7 },
      { id: 'fast', inCombat: true, hasRolledInitiative: true, initiative: 19 },
      { id: 'out', inCombat: false, hasRolledInitiative: true, initiative: 30 }
    ]
  };
  assert.deepEqual(buildCombatTurnOrder(state), ['fast', 'slow']);
});

test('ending a turn advances actor and wraps the round', () => {
  const state = {
    phase: 'combat',
    round: 2,
    currentTurnIndex: 0,
    turnOrder: ['a', 'b'],
    players: []
  };
  assert.deepEqual(advanceCombatTurn(state), { actorId: 'b', wrapped: false, round: 2 });
  assert.deepEqual(advanceCombatTurn(state), { actorId: 'a', wrapped: true, round: 3 });
});

test('queued combatants join in initiative order at the next round', () => {
  const state = {
    phase: 'combat',
    round: 1,
    currentTurnIndex: 1,
    turnOrder: ['a', 'b'],
    players: [
      { id: 'a', inCombat: true, hasRolledInitiative: true, initiative: 10 },
      { id: 'b', inCombat: true, hasRolledInitiative: true, initiative: 8 },
      { id: 'c', inCombat: true, hasRolledInitiative: true, initiative: 15, willJoinNextRound: true }
    ]
  };
  assert.deepEqual(advanceCombatTurn(state), { actorId: 'c', wrapped: true, round: 2 });
  assert.deepEqual(state.turnOrder, ['c', 'a', 'b']);
  assert.equal(state.players[2].willJoinNextRound, false);
});
