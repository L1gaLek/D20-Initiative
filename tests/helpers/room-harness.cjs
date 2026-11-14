const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const clone = value => JSON.parse(JSON.stringify(value));
const read = name => fs.readFileSync(path.resolve(root, name), 'utf8');

// Browser scripts and the server use shared globals. Evaluate the real functions
// with isolated transports/database/DOM adapters, never a production connection.
function functions(source, names) {
  const lines = source.split(/\r?\n/);
  return names.map(name => {
    const start = lines.findIndex(line => new RegExp(`^\\s*(?:async )?function ${name}\\(`).test(line));
    if (start < 0) return '';
    const indent = lines[start].match(/^\s*/)[0];
    const end = lines.findIndex((line, index) => index > start && line === `${indent}}`);
    assert.ok(end > start, `Function boundary: ${name}`);
    return lines.slice(start, end + 1).join('\n');
  }).join('\n');
}

function initialState() {
  return {
    phase: 'initiative', initiativeEpoch: 100, phaseEpoch: 100,
    currentMapId: 'map-1', maps: [{ id: 'map-1', playerStates: {} }],
    players: [1, 2, 3, 4].map(n => ({
      id: `player-${n}`, ownerId: `user-${n}`, name: `Player ${n}`,
      inCombat: true, initiative: null, hasRolledInitiative: false,
      sheetUpdatedAt: 10, sheet: { parsed: { notes: { entries: [{ text: 'original' }] } } }
    }))
  };
}

function serverHarness(state = initialState()) {
  let database = clone(state);
  const tokenOwnerWrites = [];
  let tail = Promise.resolve();
  const clients = [1, 2, 3, 4, 'gm'].map(n => ({
    ctx: { roomId: 'test-room', userId: n === 'gm' ? 'gm' : `user-${n}`, role: n === 'gm' ? 'GM' : 'Player', state: clone(state) },
    events: []
  }));
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const query = async (sql, values, transaction) => {
    await tick();
    const normalized = sql.trim().toLowerCase();
    if (normalized === 'begin') return { rows: [] };
    if (normalized.includes('pg_advisory_xact_lock')) {
      const previous = tail;
      tail = new Promise(resolve => { transaction.unlock = resolve; });
      await previous;
      return { rows: [] };
    }
    if (normalized === 'commit') {
      if (transaction.pending) database = clone(transaction.pending);
      if (transaction.tokenOwner) tokenOwnerWrites.push(transaction.tokenOwner);
      return { rows: [] };
    }
    if (normalized === 'rollback') return { rows: [] };
    if (normalized.includes('select state from public.room_state')) return { rows: [{ state: clone(database) }] };
    if (normalized.includes('insert into public.room_state')) {
      if (transaction) transaction.pending = clone(values[3]);
      else database = clone(values[3]);
      return { rows: [{ updated_at: new Date().toISOString() }] };
    }
    if (normalized.startsWith('update public.room_tokens set owner_id')) {
      transaction.tokenOwner = clone(values);
      return { rows: [] };
    }
    throw new Error(`Unexpected database query: ${normalized.slice(0, 80)}`);
  };
  const pool = {
    query: (sql, values) => query(sql, values),
    connect: async () => {
      const transaction = {};
      return { query: (sql, values) => query(sql, values, transaction), release: () => transaction.unlock?.() };
    }
  };
  const context = vm.createContext({
    console, Date, Map, Set, Math, pool,
    cloneJson: clone,
    sanitizeRoomStateForStorage: clone,
    stripRoomSecretsFromState: clone,
    ensurePlayerOrGm: ctx => { if (!['GM', 'Player'].includes(ctx.role)) throw new Error('Player role required'); },
    ensureGm: ctx => { if (ctx.role !== 'GM') throw new Error('GM role required'); },
    normalizeSafeId: value => String(value || ''), ENTITY_ID_RE: /./, USER_ID_RE: /./,
    normalizeRole: value => value,
    fetchRoomMember: async (roomId, userId) => {
      const client = clients.find(c => c.ctx.userId === userId);
      return client ? { user_id: userId, name: userId, role: client.ctx.role } : null;
    },
    fetchActiveRoomBan: async () => null,
    sanitizeText: value => String(value),
    loadWsRoomContext: async ws => ws.ctx,
    fetchRoomStateRow: async () => { await tick(); return { state: clone(database) }; },
    rememberRoomStateValue: () => {}, invalidateRoomContexts: () => {},
    send: (ws, payload) => ws.events.push({ payload: clone(payload), committed: clone(database) }),
    broadcastToRoom: (roomId, payload, except) => {
      for (const client of clients) if (client !== except) client.events.push({ payload: clone(payload), committed: clone(database) });
    }
  });
  const source = read(process.env.D20_SERVER_SOURCE || 'backend/server.js');
  vm.runInContext(functions(source, [
    'withTransaction', 'getStatePlayers', 'findPlayerById', 'getActiveMapServer',
    'syncActiveMapCombatStateServer', 'normalizeInitiativeModeServer',
    'sanitizeStatePatchFields', 'isCurrentTurnOwner', 'canPatchTurnFields',
    'applyStatePatchToCurrentState', 'preserveNewerPlayerData', 'mutateRoomState',
    'writeRoomState', 'persistPatchedState', 'applyPlayerStateUpdate',
    'persistStateForContext', 'persistStatePatchForContext', 'handleStatePatchRelay',
    'handlePlayerPatchRelay', 'handleInitiativeLiveRelay', 'applyInitiativeUpdates',
    'canControlPlayer', 'setTokenAccessForContext'
  ]), context);
  return { context, clients, database: () => database, tick, tokenOwnerWrites };
}


module.exports = { read, functions, initialState, serverHarness, clone };
