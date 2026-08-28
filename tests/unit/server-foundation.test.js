const test = require('node:test');
const assert = require('node:assert/strict');
const { loadServerConfig } = require('../../apps/server/src/config.js');
const { buildApp } = require('../../apps/server/src/app.js');

const config = Object.freeze({
  sessionSecret: '12345678901234567890123456789012',
  allowedOrigins: ['http://localhost:5173']
});

test('server configuration validates secrets, origins and port', () => {
  const loaded = loadServerConfig({ NODE_ENV: 'test', SERVER_PORT: '9090', DATABASE_URL: 'postgres://localhost/d20_test', SESSION_SECRET: config.sessionSecret, ALLOWED_ORIGINS: config.allowedOrigins[0] });
  assert.equal(loaded.port, 9090);
  assert.deepEqual(loaded.allowedOrigins, config.allowedOrigins);
  assert.throws(() => loadServerConfig({ SERVER_PORT: '70000' }), /SERVER_PORT/);
  assert.throws(() => loadServerConfig({}), /DATABASE_URL/);
});

test('health and readiness are explicit', async (t) => {
  const app = buildApp({ config, isReady: () => false });
  t.after(() => app.close());
  const health = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(health.statusCode, 200);
  assert.deepEqual(health.json(), { ok: true, service: 'd20-initiative-server' });
  assert.equal(health.headers['cache-control'], 'no-store');
  assert.equal((await app.inject({ method: 'GET', url: '/ready' })).statusCode, 503);
});

test('session identity is stable on renewal and ignores supplied user ids', async (t) => {
  const app = buildApp({ config });
  t.after(() => app.close());
  const first = await app.inject({ method: 'POST', url: '/api/session', payload: { userName: 'Следопыт', legacyUserId: 'attacker-controlled-id' } });
  assert.equal(first.statusCode, 200);
  const session = first.json();
  assert.notEqual(session.userId, 'attacker-controlled-id');
  const renewed = await app.inject({ method: 'POST', url: '/api/session', headers: { authorization: `Bearer ${session.token}` }, payload: { userName: 'Следопыт' } });
  assert.equal(renewed.json().userId, session.userId);
});

test('rooms derive ownership from the session and never expose password hashes', async (t) => {
  const app = buildApp({ config });
  t.after(() => app.close());
  const session = (await app.inject({ method: 'POST', url: '/api/session', payload: { userName: 'Ведущий' } })).json();
  const auth = { authorization: `Bearer ${session.token}` };
  const created = await app.inject({ method: 'POST', url: '/api/rooms', headers: auth, payload: { userId: 'forged', name: 'Кампания', password: 'secret-room-password' } });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().room.isMine, true);
  assert.equal(created.json().room.hasPassword, true);
  assert.equal(JSON.stringify(created.json()).includes('secret-room-password'), false);
  assert.equal(JSON.stringify(created.json()).includes('passwordHash'), false);
  const listed = await app.inject({ method: 'GET', url: '/api/rooms?userId=forged', headers: auth });
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.json().rooms[0].isMine, true);
});

test('room password and single-GM policy are enforced on the server', async (t) => {
  const app = buildApp({ config });
  t.after(() => app.close());
  async function session(name) {
    return (await app.inject({ method: 'POST', url: '/api/session', payload: { userName: name } })).json();
  }
  const owner = await session('Ведущий');
  const player = await session('Игрок');
  const created = (await app.inject({ method: 'POST', url: '/api/rooms', headers: { authorization: `Bearer ${owner.token}` }, payload: { name: 'Комната', password: 'correct' } })).json();
  const wrong = await app.inject({ method: 'POST', url: `/api/rooms/${created.room.id}/join`, headers: { authorization: `Bearer ${player.token}` }, payload: { role: 'Player', password: 'wrong' } });
  assert.equal(wrong.statusCode, 403);
  const gm = await app.inject({ method: 'POST', url: `/api/rooms/${created.room.id}/join`, headers: { authorization: `Bearer ${player.token}` }, payload: { role: 'GM', password: 'correct' } });
  assert.equal(gm.statusCode, 409);
  const joined = await app.inject({ method: 'POST', url: `/api/rooms/${created.room.id}/join`, headers: { authorization: `Bearer ${player.token}` }, payload: { role: 'Player', password: 'correct' } });
  assert.equal(joined.statusCode, 200);
  assert.equal(joined.json().role, 'Player');
});
