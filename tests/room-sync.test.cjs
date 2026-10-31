const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
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
      return { rows: [] };
    }
    if (normalized === 'rollback') return { rows: [] };
    if (normalized.includes('select state from public.room_state')) return { rows: [{ state: clone(database) }] };
    if (normalized.includes('insert into public.room_state')) {
      if (transaction) transaction.pending = clone(values[3]);
      else database = clone(values[3]);
      return { rows: [{ updated_at: new Date().toISOString() }] };
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
    normalizeSafeId: value => String(value || ''), ENTITY_ID_RE: /./,
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
    'handlePlayerPatchRelay', 'handleInitiativeLiveRelay'
  ]), context);
  return { context, clients, database: () => database, tick };
}

const roll = (h, n, total = n + 10, epoch = 100) => h.context.handleInitiativeLiveRelay(h.clients[n - 1], {
  type: 'initiativeApplied', epoch, updates: [{ playerId: `player-${n}`, total }]
});
const sheetPatch = (h, n, text, timestamp) => h.context.handlePlayerPatchRelay(h.clients[n - 1], {
  playerId: `player-${n}`, patch: { sheet: { parsed: { notes: { entries: [{ text }] } } }, sheetUpdatedAt: timestamp }
});

test('simultaneous initiative rolls persist and reach every participant', async () => {
  const h = serverHarness();
  await Promise.all([1, 2, 3, 4].map(n => roll(h, n)));
  assert.deepEqual(h.database().players.map(p => p.initiative), [11, 12, 13, 14]);
  for (const client of h.clients) {
    const totals = new Map(client.events.flatMap(e => e.payload.updates || []).map(u => [u.playerId, u.total]));
    assert.deepEqual([...totals.entries()].sort(), [1, 2, 3, 4].map(n => [`player-${n}`, n + 10]));
  }
  assert.equal(h.database().maps[0].playerStates['player-2'].initiative, 12);
});

test('a note save and an initiative roll cannot overwrite each other', async () => {
  const h = serverHarness();
  await Promise.all([roll(h, 2, 19), sheetPatch(h, 1, 'new note', 20)]);
  await h.tick(); await h.tick();
  assert.equal(h.database().players[0].sheet.parsed.notes.entries[0].text, 'new note');
  assert.equal(h.database().players[1].initiative, 19);
});

test('parallel note saves preserve both sheets and acknowledge only committed data', async () => {
  const h = serverHarness();
  await Promise.all([sheetPatch(h, 1, 'first', 20), sheetPatch(h, 2, 'second', 21)]);
  await h.tick(); await h.tick();
  assert.deepEqual(h.database().players.slice(0, 2).map(p => p.sheet.parsed.notes.entries[0].text), ['first', 'second']);
  for (const event of h.clients[0].events.filter(e => e.payload.type === 'playerPatch')) {
    const stored = event.committed.players.find(p => p.id === event.payload.playerId);
    assert.equal(stored.sheetUpdatedAt, event.payload.patch.sheetUpdatedAt);
  }
});

test('late sheet messages cannot replace a newer note', async () => {
  const h = serverHarness();
  await sheetPatch(h, 1, 'latest', 30);
  await sheetPatch(h, 1, 'outdated', 20);
  await h.tick(); await h.tick();
  assert.equal(h.database().players[0].sheet.parsed.notes.entries[0].text, 'latest');
  assert.equal(h.database().players[0].sheetUpdatedAt, 30);
});

test('a stale GM snapshot preserves committed sheets and initiative', async () => {
  const h = serverHarness();
  const stale = clone(h.database());
  await sheetPatch(h, 1, 'saved', 30);
  await roll(h, 2, 18);
  await h.context.persistStateForContext(h.clients[4].ctx, stale);
  assert.equal(h.database().players[0].sheet.parsed.notes.entries[0].text, 'saved');
  assert.equal(h.database().players[1].initiative, 18);
});

test('an old player snapshot cannot relabel old content with a newer timestamp', async () => {
  const h = serverHarness();
  const stale = clone(h.database());
  await sheetPatch(h, 1, 'saved', 30);
  await h.context.persistStateForContext(h.clients[0].ctx, stale);
  assert.equal(h.database().players[0].sheet.parsed.notes.entries[0].text, 'saved');
  assert.equal(h.database().players[0].sheetUpdatedAt, 30);
});

test('initiative rejects other owners and previous initiative phases', async () => {
  const h = serverHarness();
  await assert.rejects(h.context.handleInitiativeLiveRelay(h.clients[0], {
    type: 'initiativeApplied', epoch: 100, updates: [{ playerId: 'player-2', total: 20 }]
  }), /authorized/);
  await assert.rejects(roll(h, 1, 20, 99), /phase has changed/);
  assert.equal(h.database().players[0].hasRolledInitiative, false);
});

test('duplicate reset and roll messages do not erase or reroll accepted results', async () => {
  const h = serverHarness();
  await roll(h, 1, 17);
  await roll(h, 1, 3);
  await h.context.handleInitiativeLiveRelay(h.clients[4], { type: 'initiativeReset', epoch: 100 });
  assert.equal(h.database().players[0].initiative, 17);
});

test('a new initiative phase clears previous rolls before accepting new ones', async () => {
  const h = serverHarness();
  await roll(h, 1, 17);
  await h.context.handleInitiativeLiveRelay(h.clients[4], { type: 'initiativeReset', epoch: 200 });
  assert.equal(h.database().players[0].hasRolledInitiative, false);
  await roll(h, 2, 14, 200);
  assert.equal(h.database().players[1].initiative, 14);
});

function sheetHarness(storage = new Map()) {
  const sent = [];
  const timers = new Map();
  let counter = 0;
  let rendered;
  const content = { innerHTML: '', querySelector: () => null };
  const context = vm.createContext({
    console, Map, Date, Promise, Number, String, deepClone: clone,
    ctx: { getMyId: () => 'user-1', getRoomId: () => 'test-room', sendMessage: message => sent.push(clone(message)) },
    sheetSaveTimers: new Map(), sheetSaveDrafts: new Map(),
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    setTimeout: callback => { const id = ++counter; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    canEditPlayer: () => true,
    openedSheetPlayerId: null, openedSheetPlayer: null,
    rememberPlayersSnapshot: () => {}, isModalBusy: () => false,
    renderSheetModal: player => { rendered = player; }, openModal: () => {},
    hideHpPopup: () => {}, hideExhPopup: () => {}, hideCondPopup: () => {},
    sheetModal: { classList: { add: () => {} }, setAttribute: () => {} },
    sheetTitle: {}, sheetSubtitle: {}, sheetActions: {}, sheetContent: content
  });
  vm.runInContext(functions(read(process.env.D20_SHEET_DATA_SOURCE || 'char_sheet/sheet-modal-data.js'), [
    'sheetDraftKey', 'acknowledgeSheetSave', 'restoreSheetDraft', 'flushSheetSaves', 'scheduleSheetSave'
  ]), context);
  vm.runInContext(functions(read('char_sheet/sheet-modal-render.js'), ['open', 'refresh']), context);
  vm.runInContext(functions(read('char_sheet/sheet-modal-core.js'), ['closeModal']), context);
  return { context, sent, storage, rendered: () => rendered, fire: () => {
    const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback());
  } };
}

test('debounced saving captures the edited sheet before realtime replaces its wrapper', () => {
  const h = sheetHarness();
  const player = initialState().players[0];
  player.sheet.parsed.notes.entries[0].text = 'typed text';
  h.context.scheduleSheetSave(player);
  player.sheet = { parsed: { notes: { entries: [{ text: 'stale network copy' }] } } };
  h.fire();
  assert.equal(h.sent[0].sheet.parsed.notes.entries[0].text, 'typed text');
});

test('editing stays attached to the editor model across network updates and closing flushes immediately', () => {
  const h = sheetHarness();
  const incoming = initialState().players[0];
  h.context.open(incoming);
  const model = h.rendered();
  const boundSheet = model.sheet.parsed;
  boundSheet.notes.entries[0].text = 'first edit';
  h.context.scheduleSheetSave(model);
  incoming.sheet = clone(initialState().players[0].sheet);
  h.context.refresh([incoming]);
  boundSheet.notes.entries[0].text = 'second edit';
  h.context.scheduleSheetSave(model);
  h.context.closeModal();
  assert.equal(h.sent.at(-1).sheet.parsed.notes.entries[0].text, 'second edit');
  assert.notEqual(model, incoming);
});

test('unacknowledged text survives reload and an older acknowledgment cannot discard newer input', () => {
  const h = sheetHarness();
  const player = initialState().players[0];
  player.sheet.parsed.notes.entries[0].text = 'recover me';
  h.context.scheduleSheetSave(player);
  const firstTimestamp = player.sheetUpdatedAt;
  const recovered = sheetHarness(h.storage);
  recovered.context.open(initialState().players[0]);
  const model = recovered.rendered();
  assert.equal(model.sheet.parsed.notes.entries[0].text, 'recover me');
  model.sheet.parsed.notes.entries[0].text = 'newest input';
  recovered.context.scheduleSheetSave(model);
  recovered.context.acknowledgeSheetSave(model.id, firstTimestamp);
  assert.equal(h.storage.size, 1);
  recovered.context.acknowledgeSheetSave(model.id, model.sheetUpdatedAt);
  assert.equal(h.storage.size, 0);
});

test('a stale unrolled snapshot from the same phase cannot clear the initiative overlay', () => {
  const context = vm.createContext({
    console, Map, Date, currentRoomId: 'test-room', window: {},
    PENDING_INITIATIVE_OVERLAY_TTL_MS: 15000,
    __pendingInitiativeOverlay: { roomId: null, byPlayerId: new Map(), initiativeEpoch: 0 }
  });
  vm.runInContext(functions(read('client/network/room-state-persistence.js'), [
    'clearPendingInitiativeOverlay', 'rememberPendingInitiativeOverlay',
    'syncPendingInitiativePlayerToActiveMap', 'applyPendingInitiativeOverlayToState'
  ]), context);
  context.rememberPendingInitiativeOverlay('test-room', [{ playerId: 'player-1', total: 18 }], { epoch: 100 });
  const state = initialState(); state.round = 1; state.turnOrder = [];
  context.applyPendingInitiativeOverlayToState(state);
  assert.equal(state.players[0].initiative, 18);
  assert.equal(state.maps[0].playerStates['player-1'].initiative, 18);
});
