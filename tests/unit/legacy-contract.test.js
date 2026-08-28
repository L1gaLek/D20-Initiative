const test = require('node:test');
const assert = require('node:assert/strict');
const contract = require('../../packages/contracts/legacy-v1.js');

test('legacy contract has a stable version and unique inventories', () => {
  assert.equal(contract.version, 1);
  assert.equal(contract.hasUniqueValues(contract.WS_CLIENT_TYPES), true);
  assert.equal(contract.hasUniqueValues(contract.WS_SERVER_TYPES), true);
  assert.equal(new Set(contract.HTTP_ROUTES.map((route) => `${route.method} ${route.path}`)).size, contract.HTTP_ROUTES.length);
});

test('legacy contract records the critical session, room and realtime operations', () => {
  assert.ok(contract.HTTP_ROUTES.some((route) => route.method === 'POST' && route.path === '/session' && route.auth === false));
  assert.ok(contract.HTTP_ROUTES.some((route) => route.method === 'POST' && route.path === '/rooms/:roomId/join'));
  assert.ok(contract.WS_CLIENT_TYPES.includes('startInitiative'));
  assert.ok(contract.WS_CLIENT_TYPES.includes('startCombat'));
  assert.ok(contract.WS_CLIENT_TYPES.includes('startExploration'));
  assert.ok(contract.WS_CLIENT_TYPES.includes('endTurn'));
  assert.ok(contract.WS_SERVER_TYPES.includes('state'));
});
