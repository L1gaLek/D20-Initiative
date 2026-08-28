const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mapRoom } = require('../../apps/server/src/modules/rooms/postgres-room-repository.js');

test('PostgreSQL room rows map to domain data without losing membership', () => {
  const room = mapRoom({
    id: 'room-a',
    owner_id: 'user-a',
    name: 'Кампания',
    scenario: 'Тест',
    password_hash: 'argon-hash',
    state: { phase: 'exploration' },
    created_at: '2026-01-01T00:00:00.000Z',
    members: [{ userId: 'user-a', userName: 'Ведущий', role: 'GM' }]
  });
  assert.equal(room.ownerId, 'user-a');
  assert.equal(room.passwordHash, 'argon-hash');
  assert.deepEqual(room.members, [{ userId: 'user-a', userName: 'Ведущий', role: 'GM' }]);
});

test('security migration groups rooms, membership, bans and RLS', () => {
  const migration = fs.readFileSync(path.resolve(__dirname, '../../infra/database/migrations/001_security_and_rooms.sql'), 'utf8');
  for (const table of ['app_users', 'rooms', 'room_members', 'room_bans']) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
    assert.match(migration, new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`));
  }
  assert.match(migration, /room_one_gm_idx/);
  assert.match(migration, /rooms_one_owner_idx/);
});
