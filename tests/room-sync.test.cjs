const assert = require('node:assert/strict');
const vm = require('node:vm');
const test = require('node:test');
const { read, functions, initialState, serverHarness, clone } = require('./helpers/room-harness.cjs');
const DamageRolls = require('../backend/shared/damage-rolls');

test('affiliation can be changed by the owner or GM, survives stale snapshots, and excludes delegates', async () => {
  const h = serverHarness();
  const stale = clone(h.database());
  await h.context.setTokenAccessForContext(h.clients[0].ctx, 'player-1', { action: 'affiliation', affiliation: 'enemy' });
  assert.equal(h.database().players[0].isEnemy, true);
  assert.equal(h.database().players[0].isAlly, false);
  await h.context.persistStateForContext(h.clients[4].ctx, stale);
  assert.equal(h.database().players[0].isEnemy, true);
  await h.context.setTokenAccessForContext(h.clients[0].ctx, 'player-1', { action: 'controller', targetUserId: 'user-2' });
  await assert.rejects(h.context.setTokenAccessForContext(h.clients[1].ctx, 'player-1', { action: 'affiliation', affiliation: 'ally' }), /Only the owner/);
  await assert.rejects(h.context.setTokenAccessForContext(h.clients[0].ctx, 'player-1', { action: 'affiliation', affiliation: 'neutral' }), /Invalid affiliation/);
  await h.context.setTokenAccessForContext(h.clients[4].ctx, 'player-1', { action: 'affiliation', affiliation: 'ally' });
  assert.equal(h.database().players[0].isAlly, true);
  assert.equal(h.database().players[0].isEnemy, false);
});

test('client merges affiliation and control versions independently', () => {
  const client = vm.createContext({ window: {} });
  vm.runInContext(read('client/token-permissions.js'), client);
  const next = initialState();
  const previous = initialState();
  Object.assign(next.players[0], { controllerId: 'user-2', accessUpdatedAt: 50 });
  Object.assign(previous.players[0], { isAlly: false, isEnemy: true, affiliationUpdatedAt: 20 });
  client.mergeNewestTokenAccess(next, previous);
  assert.equal(next.players[0].controllerId, 'user-2');
  assert.equal(next.players[0].isEnemy, true);
});

test('mixed damage totals retain every die, fixed value and description without the old 20-dice or 200-character truncation', () => {
  const parts = [{ type: 'dice', description: 'Основной урон', sides: 6, count: 2 },
    { type: 'flat', description: 'Характеристика', value: 3 },
    ...Array.from({ length: 30 }, (_, i) => ({ type: 'dice', description: `Огонь ${i}`, sides: 4, count: 1 })),
    { type: 'flat', description: 'Ослабление', value: -2 }];
  const event = DamageRolls.event(parts, 'Урон: Меч', sides => sides);
  assert.equal(event.total, 133);
  assert.equal(event.count, 32);
  assert.equal(event.bonus, 1);
  assert.ok(event.kindText.length > 200);
  assert.match(event.kindText, /Огонь 29: 1d4 \[4\]/);
  assert.match(event.kindText, /Ослабление: -2/);
  assert.deepEqual(DamageRolls.event(event.damageParts, event.damageTitle), event);
  assert.throws(() => DamageRolls.event([{ type: 'dice', sides: 4, count: 1, rolls: [7] }]), /Invalid damage rolls/);
});

test('weapon damage includes its ability and all modifiers while ordinary weapons keep their existing damage', () => {
  const client = vm.createContext({ window: {}, safeInt: (value, fallback) => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback });
  vm.runInContext(read('char_sheet/weapon-damage.js') + functions(read('char_sheet/sheet-modal-combat-ui.js'), ['calcWeaponDamageBonus', 'weaponDamageText']), client);
  const weapon = { name: 'Меч', ability: 'str', dmgNum: 1, dmgDice: 'к8' };
  const sheet = { stats: { str: { modifier: 2 } } };
  assert.equal(DamageRolls.event(client.getWeaponDamageParts(sheet, weapon), 'Урон', () => 4).total, 6);
  weapon.damageModifiers = [{ type: 'dice', count: 2, dice: 'к4', description: 'Пламя' }, { type: 'flat', value: 5, description: 'Масло' }];
  assert.equal(DamageRolls.event(client.getWeaponDamageParts(sheet, weapon), 'Урон', () => 4).total, 19);
  assert.equal(client.weaponDamageText(weapon), '1к8 + 2к4 + 5');
});

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
  const content = { innerHTML: '', dataset: {}, querySelector: () => null };
  const context = vm.createContext({
    console, Map, Date, Promise, Number, String, deepClone: clone, crypto:require('node:crypto'), SheetSync:require('../backend/shared/sheet-sync'),
    ctx: { getMyId: () => 'user-1', getRoomId: () => 'test-room', sendMessage: message => {
      const value=clone(message); if(value.ops)value.sheet=require('../backend/shared/sheet-sync').apply(initialState().players[0].sheet,value.ops);
      sent.push(value);
    } },
    sheetSaveTimers: new Map(), sheetSaveDrafts: new Map(), sheetSyncBases: new Map(), sheetModelSnapshots:new WeakMap(),
    uiStateByPlayerId: new Map(),
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    setTimeout: callback => { const id = ++counter; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    canEditPlayer: () => true,
    openedSheetPlayerId: null, openedSheetPlayer: null,
    rememberPlayersSnapshot: () => {}, isModalBusy: () => false,
    renderSheetModal: player => { rendered = player; }, openModal: () => {},
    hideHpPopup: () => {}, hideExhPopup: () => {}, hideCondPopup: () => {},
    sheetModal: { classList: { add: () => {} }, setAttribute: () => {} },
    sheetTitle: {}, sheetSubtitle: {}, sheetActions: {}, sheetContent: content,
    document: { getElementById: () => null }
  });
  vm.runInContext(functions(read(process.env.D20_SHEET_DATA_SOURCE || 'char_sheet/sheet-modal-data.js'), [
    'sheetDraftKey', 'acknowledgeSheetSave', 'acknowledgeSheetPatch', 'restoreSheetDraft', 'flushSheetSaves', 'scheduleSheetSave',
    'getUiState', 'captureUiStateFromDom', 'restoreUiStateToDom'
  ]), context);
  vm.runInContext(functions(read('char_sheet/sheet-modal-render.js'), ['open', 'refresh']), context);
  vm.runInContext(functions(read('char_sheet/sheet-modal-core.js'), ['closeModal']), context);
  return { context, sent, storage, rendered: () => rendered, fire: () => {
    const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback());
  } };
}

test('sheet navigation captures both layouts, ignores another character DOM and restores each tab scroll', () => {
  const node = { scrollTop: 240 };
  let selected = 'combat';
  let monster = false;
  const root = { dataset: { sheetPlayerId: 'player-1' }, querySelector: selector => selector === '#sheet-main' ? node
    : { getAttribute: attr => attr === (monster ? 'data-monster-tab' : 'data-tab') ? selected : null } };
  const context = vm.createContext({ uiStateByPlayerId: new Map(), sheetContent: root });
  vm.runInContext(functions(read('char_sheet/sheet-modal-data.js'), ['getUiState', 'captureUiStateFromDom', 'restoreUiStateToDom']), context);
  const player = { id: 'player-1', _activeSheetTab: 'inventory' };
  context.captureUiStateFromDom(player);
  assert.equal(player._activeSheetTab, 'combat');
  context.captureUiStateFromDom({ id: 'player-2', _activeSheetTab: 'inventory' });
  assert.equal(context.getUiState('player-2').activeTab, 'basic');
  node.scrollTop = 0;
  context.restoreUiStateToDom(player);
  assert.equal(node.scrollTop, 240);
  selected = 'monster-combat'; monster = true;
  context.captureUiStateFromDom(player);
  assert.equal(context.getUiState(player.id).activeTab, 'monster-combat');
});

test('late spell refresh cannot replace a different tab or a different character', () => {
  const root = { dataset: { sheetPlayerId: 'player-1' }, querySelector: () => { throw new Error('Unexpected repaint'); } };
  const context = vm.createContext({ getUiState: () => ({ activeTab: 'combat' }) });
  vm.runInContext(functions(read('char_sheet/sheet-modal-spells.js'), ['rerenderSpellsTabInPlace']), context);
  context.rerenderSpellsTabInPlace(root, { id: 'player-1' }, {}, true);
  context.rerenderSpellsTabInPlace(root, { id: 'player-2' }, {}, true);
});

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
  recovered.context.acknowledgeSheetPatch(model.id, 'older-request');
  assert.equal(h.storage.size, 1);
  recovered.context.flushSheetSaves();
  const firstRequest=recovered.sent.at(-1).requestId;
  recovered.context.acknowledgeSheetPatch(model.id,firstRequest);
  recovered.fire();
  recovered.context.acknowledgeSheetPatch(model.id,recovered.sent.at(-1).requestId);
  assert.equal(h.storage.size, 0);
});

test('patch acknowledgments match the request ID and a reverted hot edit survives an in-flight save', () => {
  const h=sheetHarness();h.context.open(initialState().players[0]);const model=h.rendered();
  model.sheet.parsed.vitality={'hp-current':{value:20}};h.context.scheduleSheetSave(model);
  h.context.acknowledgeSheetPatch(model.id,h.sent.at(-1).requestId);
  model.sheet.parsed.vitality['hp-current'].value=2;h.context.scheduleSheetSave(model);
  const first=h.sent.at(-1);
  model.sheet.parsed.vitality['hp-current'].value=20;h.context.scheduleSheetSave(model);
  h.context.acknowledgeSheetPatch(model.id,first.requestId);assert.equal(h.storage.size,1);
  const latest=h.sent.at(-1);
  assert.equal(latest.sheet.parsed.vitality['hp-current'].value,20);
  h.context.acknowledgeSheetPatch(model.id,latest.requestId,123);assert.equal(h.storage.size,0);assert.equal(model.sheetUpdatedAt,123);
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

test('an unrelated legacy acknowledgment cannot discard a pending patch draft', () => {
  const h = sheetHarness();
  h.context.open(initialState().players[0]);
  const model = h.rendered();
  model.sheet.parsed.notes.entries[0].text = 'unsaved text';
  h.context.scheduleSheetSave(model);
  const newerServerVersion = model.sheetUpdatedAt + 100;
  h.context.acknowledgeSheetSave(model.id, newerServerVersion);
  assert.equal(h.storage.size, 1);
  h.fire();
  assert.equal(h.sent.at(-1).sheet.parsed.notes.entries[0].text, 'unsaved text');
  assert.equal(h.sent.at(-1).type,'patchPlayerSheet');
});

test('the real individual/all-owned roll patch is accepted and reaches the GM', async () => {
  const h = serverHarness();
  const client = vm.createContext({ console, Set, String, Number, normalizeInitiativeMode: value => value || 'normal' });
  vm.runInContext(functions(read('client/core-helpers-network.js'), [
    'buildRealtimeCombatPlayerPatch', 'buildRealtimeStatePatchForMessage'
  ]), client);
  for (const [index, type] of ['rollInitiativeFor', 'rollInitiativeAllOwned'].entries()) {
    const next = clone(h.database());
    next.players[index].initiative = 17 + index;
    next.players[index].hasRolledInitiative = true;
    const patch = client.buildRealtimeStatePatchForMessage(type, { id: `player-${index + 1}` }, next, false, `user-${index + 1}`);
    assert.equal(Object.hasOwn(patch.players[0], 'inCombat'), false);
    await h.context.handleStatePatchRelay(h.clients[index], { patch });
    assert.equal(h.database().players[index].initiative, 17 + index);
    assert.ok(h.clients[4].events.some(e => e.payload.patch?.players?.some(p => p.id === `player-${index + 1}` && p.hasRolledInitiative)));
  }
});

test('legacy player patches can repeat selection, but cannot change combat participation', async () => {
  const h = serverHarness();
  await h.context.handleStatePatchRelay(h.clients[0], { patch: { players: [{ id: 'player-1', inCombat: true, initiative: 16, hasRolledInitiative: true }] } });
  assert.equal(h.database().players[0].initiative, 16);
  await assert.rejects(h.context.handleStatePatchRelay(h.clients[0], { patch: { players: [{ id: 'player-1', inCombat: false }] } }), /GM role/);
});

test('delegated control permits sheets and initiative, can be revoked, and cannot be delegated onward', async () => {
  const h = serverHarness();
  await h.context.setTokenAccessForContext(h.clients[0].ctx, 'player-1', { action: 'controller', targetUserId: 'user-2' });
  assert.equal(h.database().players[0].ownerId, 'user-1');
  assert.equal(h.database().players[0].controllerId, 'user-2');
  await h.context.handlePlayerPatchRelay(h.clients[1], { playerId: 'player-1', patch: { sheet: { parsed: { notes: 'delegate edit' } }, sheetUpdatedAt: 20 } });
  await h.context.applyInitiativeUpdates(h.clients[1].ctx, { epoch: 100, updates: [{ playerId: 'player-1', total: 19 }] });
  assert.equal(h.database().players[0].initiative, 19);
  assert.equal(h.database().players[0].sheet.parsed.notes, 'delegate edit');
  await assert.rejects(h.context.setTokenAccessForContext(h.clients[1].ctx, 'player-1', { action: 'controller', targetUserId: 'user-3' }), /Only the owner/);
  await h.context.setTokenAccessForContext(h.clients[0].ctx, 'player-1', { action: 'controller', targetUserId: '' });
  await assert.rejects(h.context.handlePlayerPatchRelay(h.clients[1], { playerId: 'player-1', patch: { sheet: { parsed: {} }, sheetUpdatedAt: 30 } }), /cannot edit/);
});

test('only GM can transfer ownership; the old owner loses access, including after stale snapshots', async () => {
  const h = serverHarness();
  const stale = clone(h.database());
  await assert.rejects(h.context.setTokenAccessForContext(h.clients[0].ctx, 'player-1', { action: 'owner', targetUserId: 'user-2' }), /GM role/);
  await h.context.setTokenAccessForContext(h.clients[4].ctx, 'player-1', { action: 'owner', targetUserId: 'user-2' });
  assert.equal(h.database().players[0].ownerId, 'user-2');
  assert.equal(h.database().players[0].controllerId, null);
  assert.deepEqual(h.tokenOwnerWrites[0], ['user-2', 'test-room', 'player-1']);
  await assert.rejects(sheetPatch(h, 1, 'unauthorized', 30), /cannot edit/);
  await h.context.persistStateForContext(h.clients[4].ctx, stale);
  assert.equal(h.database().players[0].ownerId, 'user-2');
  await assert.rejects(h.context.setTokenAccessForContext(h.clients[4].ctx, 'player-1', { action: 'owner', targetUserId: 'outsider' }), /player in this room/);
});

test('client snapshots preserve a newer access grant or revocation', () => {
  const client = vm.createContext({ window: {} });
  vm.runInContext(read('client/token-permissions.js'), client);
  const previous = initialState();
  Object.assign(previous.players[0], { ownerId: 'user-2', controllerId: null, accessUpdatedAt: 20 });
  const next = initialState();
  client.mergeNewestTokenAccess(next, previous);
  assert.equal(next.players[0].ownerId, 'user-2');
  assert.equal(client.canControlToken(next.players[0], 'user-1', 'Player'), false);
  assert.equal(client.canControlToken(next.players[0], 'user-2', 'Player'), true);
  assert.equal(client.canControlToken(next.players[0], 'user-2', 'Spectator'), false);
});

test('offscreen pointers hit each edge and stay hidden for visible tokens', () => {
  const client = vm.createContext({});
  vm.runInContext(functions(read('client/board-navigation.js'), ['getOffscreenTokenPointer']), client);
  const bounds = { left: 20, top: 20, right: 620, bottom: 420 };
  assert.equal(client.getOffscreenTokenPointer(320, 220, bounds), null);
  assert.equal(client.getOffscreenTokenPointer(-100, 220, bounds).x, 20);
  assert.equal(client.getOffscreenTokenPointer(900, 220, bounds).x, 620);
  assert.equal(client.getOffscreenTokenPointer(320, -100, bounds).y, 20);
  assert.equal(client.getOffscreenTokenPointer(320, 900, bounds).y, 420);
});
