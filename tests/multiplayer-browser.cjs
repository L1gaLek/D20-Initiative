// Run with Playwright installed (or D20_PLAYWRIGHT_MODULE pointing at its module).
// The real browser client talks over HTTP/WS to real backend mutation functions,
// with an isolated transactional database adapter. No production account is used.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { initialState, serverHarness, clone } = require('./helpers/room-harness.cjs');
const DamageRolls = require('../backend/shared/damage-rolls');
const backendRequire = createRequire(path.resolve(__dirname, '../backend/package.json'));
const { WebSocketServer } = backendRequire('ws');
const { chromium } = require(process.env.D20_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const syncMode = !!process.env.D20_SYNC_ONLY;
const screenshotDir = process.env.D20_SCREENSHOT_DIR;
const start = initialState();
Object.assign(start, { boardWidth: 60, boardHeight: 45, cellFeet: 5,
  mapSections: [{ id: 'section-1', name: 'Test' }], turnOrder: [], round: 1, currentTurnIndex: 0,
  fog: { enabled: false }, phaseEpoch: 100 });
Object.assign(start.maps[0], { boardWidth: 60, boardHeight: 45, sectionId: 'section-1',
  phase: 'initiative', initiativeEpoch: 100, phaseEpoch: 100, fog: { enabled: false }, marks: [] });
start.players.forEach((p, index) => Object.assign(p, { x: index * 5 + 2, y: index + 2, size: 1,
  isBase: true, isAlly: true, isEnemy: false, isPublic: true, ownerRole: 'Player', ownerName: p.ownerId,
  color: '#ff3333' }));
start.maps[0].playerStates = Object.fromEntries(start.players.map(p => [p.id, {
  inCombat: true, initiative: null, hasRolledInitiative: false
}]));
start.players.push({ id: 'monster-1', name: 'Test Monster', ownerId: 'gm', ownerRole: 'GM', ownerName: 'gm',
  isBase: false, isMonster: true, isEnemy: true, isAlly: false, isPublic: true, inCombat: false,
  hasRolledInitiative: false, mapId: 'map-1', x: 25, y: 15, size: 1, sheet: { parsed: {} }, sheetUpdatedAt: 1 });
if(process.env.D20_MAPS_ONLY || syncMode){
 start.phase='exploration';start.maps[0].phase='exploration';
 start.maps.push({id:'map-2',name:'Large map',sectionId:'section-1',boardWidth:90,boardHeight:70,phase:'exploration',playerStates:{},fog:{enabled:false}});
}
const h = serverHarness(start);
const mapHarness=(process.env.D20_MAPS_ONLY || syncMode)?require('./helpers/map-harness.cjs')(h,start):null;
const sockets = new Set();
let seq = 0;
let diceId = 0;
let rejectFirstRoll = true;
let dropNextCombatAck = false;
const requests = [];
const diagnostics = [];
function stamp(payload) { return { ...payload, __serverEvent: true, __eventSeq: ++seq }; }
function broadcast(payload, except) {
  if(syncMode)return h.context.broadcastToRoom('test-room',payload,except);
  const raw = JSON.stringify(stamp(payload));
  for (const ws of sockets) if (ws !== except && ws.readyState === 1) ws.send(raw);
}
h.context.send = (ws,payload) => { if(dropNextCombatAck && payload.type==='combatSync' && ws.ctx.userId==='gm') { dropNextCombatAck=false; return; } ws.send(JSON.stringify(stamp(payload))); };
h.context.broadcastToRoom = (roomId, payload, except) => broadcast(payload, except);
const members = h.clients.map(c => ({ id: c.ctx.userId, user_id: c.ctx.userId, name: c.ctx.userId, role: c.ctx.role }));
const syncControls = { rowReads:0, holdWrite:null };
if(syncMode){
  const vm=require('node:vm'),{functions,read}=require('./helpers/room-harness.cjs');
  Object.assign(h.context,{WebSocket:{OPEN:1},rooms:new Map([['test-room',sockets]]),roomEventSeq:new Map(),
    inboundMeta:new (require('node:async_hooks').AsyncLocalStorage)(),roomJournal:new (require('../backend/shared/room-event-journal'))(),
    WS_CONTROL_EVENT_TYPES:new Set(['error','ping','pong','wsReady','joinedWsRoom','roomCursor','roomResume']),
    ROOM_ROW_READS:Object.fromEntries(['room_map_meta','room_walls','room_marks','room_fog','room_music_state','room_tokens','room_log','room_dice_events'].map(t=>[t,{maxLimit:10000}])),
    verifyAuthToken:token=>({userId:token}),touchRoomMember:async()=>{},broadcastUsersSnapshot:async()=>{},
    attachClientToRoom:(ws,id)=>{ws.currentRoomId=id;},
    loadRoomContext:async(roomId,id)=>({...h.clients.find(c=>c.ctx.userId===id).ctx,state:clone(h.database())}),
    fetchWhitelistedRoomRows:async(ctx,table)=>{
      syncControls.rowReads++;
      const rows=table==='room_tokens'?[...mapHarness.tokens.values()]:table==='room_fog'?[...mapHarness.fog.values()]:table==='room_map_meta'?start.maps.map(m=>({map_id:m.id,board_width:m.boardWidth,board_height:m.boardHeight,name:m.id,section_id:'section-1'})):[];
      return {rows:clone(rows)};
    }
  });
  h.context.loadWsRoomContext=async ws=>({...h.clients.find(c=>c.ctx.userId===ws.userId).ctx,state:clone(h.database())});
  const query=h.context.pool.query;
  h.context.pool.query=async(sql,v)=>{
    if(sql.includes('update public.room_state set phase') && syncControls.holdWrite)await syncControls.holdWrite;
    return query(sql,v);
  };
  vm.runInContext(functions(read('backend/server.js'),['getRoom','nextRoomEventSeq','stampRoomEvent','send','invalidateRoomContexts','broadcastToRoom','resumeRoomClient','handleJoinRoom','handleMessage']),h.context);
}
async function body(req) {
  let text = '';
  for await (const part of req) text += part;
  return text ? JSON.parse(text) : {};
}
function json(res, value, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); }
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      const userId = String(req.headers.authorization || '').replace('Bearer ', '');
      const ctx = h.clients.find(c => c.ctx.userId === userId)?.ctx;
      const data = req.method === 'POST' ? await body(req) : {};
      requests.push({ path: url.pathname, userId, data });
      if (url.pathname.endsWith('/initiative')) {
        const payload = await h.context.applyInitiativeUpdates(ctx, data);
        broadcast(payload);
        return json(res, { ok: true, ...payload });
      }
      if (url.pathname.endsWith('/access')) {
        const playerId = url.pathname.split('/').at(-2);
        const state = await h.context.setTokenAccessForContext(ctx, playerId, data);
        broadcast({ type: 'state', roomId: 'test-room', state });
        return json(res, { ok: true, state });
      }
      if (url.pathname.endsWith('/state')) {
        if (req.method === 'POST') {
          await h.context.persistStateForContext(ctx, data.state);
          broadcast({ type: 'state', roomId: 'test-room', state: h.database() });
        }
        return json(res, { ok: true, state: h.database() });
      }
      if (url.pathname.endsWith('/combat')) {
        const ctx = h.clients.find(c => c.ctx.userId === userId).ctx;
        const result = await h.context.applyCombatCommand(ctx, data);
        broadcast(result);
        return json(res, result);
      }
      if (url.pathname.endsWith('/dice')) {
        const event = { ...data.event, id: `dice-${++diceId}`, fromId: userId };
        if (event.damageParts) Object.assign(event, DamageRolls.event(event.damageParts, event.damageTitle));
        const text = `${event.fromName}: ${event.kindText}: ${event.rolls.join(',')}${event.bonus >= 0 ? '+' : ''}${event.bonus} = ${event.total}`;
        return json(res, { ok: true, event, row: event, logRow: { id: `damage-log-${diceId}`, text } });
      }
      if(mapHarness){
       const mapId=url.searchParams.get('mapId');
       if(url.pathname.endsWith('/rows/room_tokens')||url.pathname.endsWith('/tokens'))return json(res,{ok:true,rows:[...mapHarness.tokens.values()].filter(r=>!mapId||r.map_id===mapId)});
       if(url.pathname.endsWith('/rows/room_map_meta'))return json(res,{ok:true,rows:[...mapHarness.meta].map(([map_id,m])=>({map_id,...m,name:map_id,section_id:'section-1'}))});
       if(url.pathname.endsWith('/rows/room_fog'))return json(res,{ok:true,rows:[...mapHarness.fog.values()]});
      }
      if (url.pathname.endsWith('/rows/room_members')) return json(res, {ok:true,rows:members});
      if (url.pathname.endsWith('/members')) return json(res, { ok: true, users: members, rows: members });
      if (url.pathname.endsWith('/tokens')) return json(res, { ok: true, rows: start.players.map(p => ({ token_id: p.id, map_id: 'map-1', x: p.x, y: p.y, size: 1, is_public: true })) });
      return json(res, { ok: true, rows: [], rooms: [], list: [], row: { id: `log-${diceId}`, text: data.text, created_at: new Date().toISOString() } });
    }
    const pathname = url.pathname.replace(/^\/D20-Initiative\//, '/');
    const requested = path.resolve(root, `.${decodeURIComponent(pathname === '/' ? '/index.html' : pathname)}`);
    if (!requested.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    const bytes = await fs.promises.readFile(requested);
    const type = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' }[path.extname(requested)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); res.end(bytes);
  } catch (error) {
    if (error.code === 'ENOENT') { res.writeHead(404); res.end(); }
    else { diagnostics.push(error.stack); json(res, { ok: false, error: error.message }, 400); }
  }
});
const wss = new WebSocketServer({ server });
wss.on('connection', ws => {
  sockets.add(ws);
  ws.on('close', () => sockets.delete(ws));
  if(syncMode){
    const scheduler=new (require('../backend/shared/ws-scheduler'))((data,receivedAt)=>h.context.inboundMeta.run({wsNonce:data.__wsNonce,serverReceivedAt:receivedAt,inboundType:data.type},()=>h.context.handleMessage(ws,data)),error=>ws.send(JSON.stringify({type:'error',message:error.message})));
    ws.on('message',raw=>scheduler.push(JSON.parse(raw),Date.now()));
    return;
  }
  let tail = Promise.resolve();
  ws.on('message', raw => { tail = tail.then(async () => {
    const msg = JSON.parse(raw);
    if (msg.type === 'joinRoom') {
      ws.ctx = h.clients.find(c => c.ctx.userId === msg.userId).ctx;
      ws.send(JSON.stringify({ type: 'joinedWsRoom', roomId: 'test-room' }));
    } else if (msg.type === 'statePatch') await h.context.handleStatePatchRelay(ws, msg);
    else if (msg.type === 'playerPatch') await h.context.handlePlayerPatchRelay(ws, msg);
    else if (msg.type === 'sheetPatch') await h.context.handleSheetPatchRelay(ws, msg);
    else if (msg.type === 'combatCommand') {
      if (rejectFirstRoll && ws.ctx.userId === 'user-1' && msg.action === 'roll') {
        rejectFirstRoll = false; ws.send(JSON.stringify({type:'combatCommandError',requestId:msg.requestId,message:'Test rejection'}));
      } else await h.context.handleCombatCommandRelay(ws,msg);
    }
    else if (msg.type === 'initiativeReset' || msg.type === 'initiativeApplied') await h.context.handleInitiativeLiveRelay(ws, msg);
    else if (msg.type === 'state') {
      await h.context.persistStateForContext(ws.ctx, msg.state);
      broadcast({ type: 'state', roomId: 'test-room', state: h.database() });
    } else if (msg.type === 'diceEvent') await h.context.handleDiceEventRelay(ws, msg);
    else if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
    else if (msg.type === 'fogRow' && mapHarness) await h.context.handleFogRow(ws,msg);
    else if (msg.type === 'fogPreview' && mapHarness) await h.context.handleFogPreview(ws,msg);
    else if (msg.type === 'moveToken') {
      if(mapHarness)return h.context.handleMoveToken(ws,msg);
      const player = h.database().players.find(p => p.id === msg.tokenId);
      assert.equal(h.context.canControlPlayer(ws.ctx, player), true);
      broadcast(msg);
    } else broadcast(msg, ws);
  }).catch(error => ws.send(JSON.stringify({ type: 'error', message: error.message }))); });
});

async function waitFor(check, label) {
  for (let n = 0; n < 100; n++) { if (await check()) return; await new Promise(r => setTimeout(r, 50)); }
  throw new Error(`Timed out: ${label}`);
}
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'], ...(process.env.D20_BROWSER_PATH ? { executablePath: process.env.D20_BROWSER_PATH } : {}) });
  const errors = [];
  const pages = [];
  try {
    for (const id of ['gm', 'user-1', 'user-2', 'user-3', 'user-4']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.route('https://cdn.jsdelivr.net/npm/@supabase/**', route => route.fulfill({ contentType: 'text/javascript', body: 'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})},channel:()=>({on(){return this},subscribe(){return this}})})};' }));
      await context.route(/https?:\/\/(?!127\.0\.0\.1).*supabase\.co\//, route => route.fulfill({ json: [] }));
      await context.addInitScript(({ base, id }) => {
        window.__notificationOscillators = 0;
        if (window.AudioContext) {
          const create = AudioContext.prototype.createOscillator;
          AudioContext.prototype.createOscillator = function (...args) { window.__notificationOscillators++; return create.apply(this, args); };
        }
        window.D20_CONFIG = { vpsApiBase: `${base}/api`, wsUrl: base.replace('http:', 'ws:') + '/ws/' };
        localStorage.setItem('int_user_id', id); localStorage.setItem('int_auth_token', id);
        localStorage.setItem('int_auth_expires_at', '2099-01-01T00:00:00Z');
      }, { base, id });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(`${id}: ${error.message}`));
      page.on('console', message => {
        if (message.type() === 'warning') diagnostics.push(`${id}: ${message.text()}`);
        if (message.type() === 'error' && /THREE|Shader Error|VALIDATE_STATUS/.test(message.text()) && !/Error creating WebGL context/.test(message.text())) errors.push(`${id}: ${message.text()}`);
      });
      page.on('dialog', dialog => { errors.push(`${id} dialog: ${dialog.message()}`); dialog.dismiss(); });
      await page.goto(base, { waitUntil: 'load' });
      await page.evaluate(({ id, state, members }) => {
        ensureSupabaseReady = async () => {};
        ensureVpsSession = async () => ({ userId: id, token: id });
        myId = id; myRole = id === 'gm' ? 'GM' : 'Player'; currentRoomId = 'test-room';
        applyRoleToUI();
        myNameSpan.textContent = id;
        setAppStorageItem('int_user_id', id);
        usersById.clear(); usersOrder.splice(0);
        members.forEach(u => { usersById.set(u.id, u); usersOrder.push(u.id); });
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('rooms-container').style.display = 'none';
        document.getElementById('tavern-container').style.display = 'none';
        document.getElementById('main-container').style.display = 'flex';
        document.getElementById('game-container').style.display = 'block';
        window.InfoModal.init({ sendMessage, getMyId: () => myId, getMyRole: () => myRole,
          getRoomId: () => currentRoomId, getPlayers: () => players,
          getUsers: () => [...usersById].map(([id, user]) => ({ id, ...user })),
          applyState: state => handleMessage({ type: 'state', state }) });
        handleMessage({ type: 'state', state });
        handleMessage({ type: 'tokensInit', mapId: 'map-1', rows: state.players.map(p => ({ token_id: p.id, map_id: 'map-1', x: p.x, y: p.y, size: 1, is_public: true })) });
        connectRoomWs('test-room');
      }, { id, state: clone(start), members });
      await page.waitForFunction(() => wsClient?.__joined === true);
      pages.push(page);
    }
    const [gm, p1, p2, p3, p4] = pages;
    if(syncMode){await require('./helpers/live-sync-scenarios.cjs')({pages,h,mapHarness,syncControls,waitFor});assert.deepEqual(errors,[]);return;}
    if(process.env.D20_EGRESS_ONLY){await require('./helpers/egress-scenarios.cjs')({pages,h});assert.deepEqual(errors,[]);return;}
    if(process.env.D20_MAPS_ONLY){await require('./helpers/map-isolation-scenarios.cjs')({pages,h,mapHarness});assert.deepEqual(errors,[]);return;}
    if (!process.env.D20_3D_ONLY) {
    await gm.locator('#content-row').evaluate(el => { el.style.flexWrap = 'nowrap'; });
    const panelBefore = await gm.locator('#initiative-players-box').evaluate(el => el.getBoundingClientRect().height);
    await gm.locator('#board-col').evaluate(el => { el.style.minHeight = '1900px'; });
    const panelAfter = await gm.locator('#initiative-players-box').evaluate(el => el.getBoundingClientRect().height);
    assert.ok(panelAfter > panelBefore + 200, `Initiative panel should grow with frame: ${panelBefore} -> ${panelAfter}`);
    assert.equal(await gm.locator('#initiative-players-box').evaluate(el => getComputedStyle(el).maxHeight), 'none');
    await gm.locator('#board-col').evaluate(el => { el.style.minHeight = ''; });
    await gm.locator('#content-row').evaluate(el => { el.style.flexWrap = ''; });
    console.log('PASS: initiative panel uses the remaining frame height and grows with the board');
    await p1.locator('#initiative-players-list button').first().click();
    await p1.getByText(/Инициатива не сохранена/).waitFor();
    assert.equal(await p1.evaluate(() => lastState.players[0].hasRolledInitiative), false);
    assert.equal(requests.filter(r => r.path.endsWith('/dice')).length, 0);

    console.log('PASS: rejected initiative does not create a local result or a misleading dice log');
    await Promise.all([
      p1.locator('#initiative-players-list button').first().click(),
      p2.locator('#roll-initiative-all').click(),
      p3.evaluate(async () => { wsClient.__joined=false; try { await sendMessage({type:'rollInitiative'}); } finally { wsClient.__joined=true; } }),
      p4.locator('#initiative-players-list button').first().click()
    ]);
    await waitFor(() => h.database().players.filter(p => p.inCombat).every(p => p.hasRolledInitiative), 'all rolls persisted');
    for (const page of pages) {
      await page.waitForFunction(() => lastState.players.filter(p => p.inCombat).every(p => p.hasRolledInitiative));
      assert.deepEqual(await page.evaluate(() => lastState.players.filter(p => p.inCombat).map(p => p.initiative)), h.database().players.filter(p => p.inCombat).map(p => p.initiative));
    }
    assert.equal(await gm.locator('#start-combat').isDisabled(), false);
    console.log('PASS: individual, all-owned and main initiative buttons reach all 5 browsers; GM can start combat');
    await gm.evaluate(() => setActiveGmQuickPanel('phase'));
    await gm.locator('#start-combat').click();
    await waitFor(() => h.database().phase === 'combat', 'GM starts combat');
    await require('./helpers/combat-ui-scenarios.cjs')({pages,h,broadcast,clone,start,screenshotDir,dropNextCombatAck:()=>{dropNextCombatAck=true;}});
    if (process.env.D20_TURN_ACCESS_ONLY) { await require('./helpers/turn-access-scenarios.cjs')({pages,h,screenshotDir,members}); assert.deepEqual(errors,[]); return; }
    if (process.env.D20_HEALTH_TOOLS_ONLY) { await require('./helpers/health-tools-scenarios.cjs')({pages,h,broadcast,clone,start,screenshotDir,requests}); assert.deepEqual(errors,[]); return; }
    if (process.env.D20_COMBAT_ONLY) { assert.deepEqual(errors,[]); return; }
    await gm.evaluate(() => sendMessage({ type: 'startExploration' }));
    await waitFor(() => h.database().phase === 'exploration', 'return to exploration');
    await gm.evaluate(() => setActiveGmQuickPanel(''));

    await p1.evaluate(() => InfoModal.open(players.find(p => p.id === 'player-1')));
    assert.equal(await p1.getByRole('button', { name: 'Передать токен', exact: true }).count(), 0);
    await p1.getByLabel('Принадлежность', { exact: true }).selectOption('enemy');
    await waitFor(() => h.database().players[0].isEnemy, 'owner changes affiliation');
    await gm.waitForFunction(() => lastState.players[0].isEnemy);
    await p1.getByLabel('Принадлежность', { exact: true }).selectOption('ally');
    await waitFor(() => h.database().players[0].isAlly, 'owner restores ally');
    await gm.waitForFunction(() => lastState.players[0].isAlly);
    console.log('PASS: owner changes affiliation and every participant receives it');
    await p1.getByLabel('Передача управления', { exact: true }).selectOption('user-2');
    await p1.getByLabel('Передача управления', { exact: true }).locator('..').getByRole('button').click();
    await waitFor(() => h.database().players[0].controllerId === 'user-2', 'delegate control');
    await p2.waitForFunction(() => canControlToken(lastState.players[0]));
    await p2.evaluate(() => InfoModal.open(players.find(p => p.id === 'player-1')));
    assert.equal(await p2.locator('#sheet-token-access select').count(), 0);
    assert.ok(await p2.locator('#sheet-content input:not([disabled])').count());
    const diceBefore = requests.filter(r => r.path.endsWith('/dice')).length;
    await p2.locator('#sheet-content .lss-dice-btn[data-roll-kind="check"]').first().click();
    await waitFor(() => requests.filter(r => r.path.endsWith('/dice')).length > diceBefore, 'delegate rolls dice');
    await p2.evaluate(() => {
      openedSheetPlayer.sheet.parsed.notes = { entries: [{ text: 'Browser delegate note' }] };
      scheduleSheetSave(openedSheetPlayer); flushSheetSaves(openedSheetPlayer.id);
    });
    await waitFor(() => h.database().players[0].sheet.parsed.notes?.entries?.[0]?.text === 'Browser delegate note', 'delegated sheet saved');
    await p2.evaluate(async () => {
      InfoModal.close();
      if (!canCurrentUserMovePlayerNow(lastState.players[0])) throw new Error('Delegate movement is disabled');
      await sendMessage({ type: 'movePlayer', id: 'player-1', x: 3, y: 2 });
    });
    await p1.waitForFunction(() => lastState.players[0].x === 3);
    await p2.evaluate(() => InfoModal.open(players.find(p => p.id === 'player-1')));
    console.log('PASS: owner grants control; delegate moves token, rolls dice, edits and saves sheet');
    await gm.evaluate(() => InfoModal.open(players.find(p => p.id === 'player-1')));
    const transferRect = await gm.locator('[data-token-action="owner"]').boundingBox();
    const controlRect = await gm.locator('[data-token-action="controller"]').boundingBox();
    assert.ok(Math.abs(transferRect.y - controlRect.y) < 3, 'ownership and delegated control share a row');
    await gm.getByLabel('Передача токена', { exact: true }).selectOption('user-3');
    await gm.getByRole('button', { name: 'Передать токен', exact: true }).click();
    await waitFor(() => h.database().players[0].ownerId === 'user-3', 'ownership transferred');
    await p1.waitForFunction(() => !canControlToken(lastState.players[0]));
    await p2.waitForFunction(() => !canControlToken(lastState.players[0]));
    assert.equal(await p2.locator('#sheet-content input:not([disabled])').count(), 0);
    assert.equal(await p2.locator('#sheet-content .lss-dice-btn:not([disabled])').count(), 0);
    assert.equal(await p3.evaluate(() => canControlToken(lastState.players[0])), true);
    await p1.evaluate(state => handleMessage({ type: 'state', state }), clone(start));
    assert.equal(await p1.evaluate(() => canControlToken(lastState.players[0])), false);
    console.log('PASS: GM transfers base ownership; previous owner and delegate lose edit access immediately');
    await gm.evaluate(() => InfoModal.open(players.find(p => p.id === 'monster-1')));
    await gm.getByLabel('Передача токена', { exact: true }).selectOption('user-4');
    await gm.getByRole('button', { name: 'Передать токен', exact: true }).click();
    await waitFor(() => h.database().players.find(p => p.id === 'monster-1').ownerId === 'user-4', 'monster ownership transferred');
    await p4.waitForFunction(() => canControlToken(lastState.players.find(p => p.id === 'monster-1')));
    await p4.evaluate(() => InfoModal.open(players.find(p => p.id === 'monster-1')));
    await p4.waitForSelector('[data-monster-player-name]:not([disabled])');
    console.log('PASS: GM can also transfer a monster; its new owner can edit the monster sheet');

    await gm.getByLabel('Принадлежность', { exact: true }).selectOption('ally');
    await waitFor(() => h.database().players.find(p => p.id === 'monster-1').isAlly, 'GM changes another owner affiliation');
    await p4.waitForFunction(() => lastState.players.find(p => p.id === 'monster-1').isAlly);
    console.log('PASS: GM changes any token affiliation, including a transferred monster');

    for (const [page, playerId, monster] of [[p3, 'player-1', false], [p4, 'monster-1', true]]) {
      await page.evaluate(id => InfoModal.open(players.find(p => p.id === id)), playerId);
      await page.locator(monster ? '[data-monster-tab="monster-combat"]' : '.sheet-tab[data-tab="combat"]').click();
      await page.locator('[data-weapon-add]').click();
      const card = page.locator('.weapon-card').first();
      await card.locator('[data-weapon-field="name"]').fill('Тестовый меч');
      await card.locator('[data-weapon-field="dmgNum"]').fill('1');
      await card.locator('[data-weapon-field="dmgDice"]').selectOption('к6');
      for (let index = 0; index < 3; index++) await card.locator('[data-damage-add]').click();
      await card.locator('[data-damage-idx="0"] [data-damage-field="count"]').fill('2');
      await card.locator('[data-damage-idx="0"] [data-damage-field="dice"]').selectOption('к4');
      await card.locator('[data-damage-idx="0"] [data-damage-field="description"]').fill('Огонь клинка');
      await card.locator('[data-damage-idx="1"] [data-damage-field="dice"]').selectOption('к8');
      await card.locator('[data-damage-idx="1"] [data-damage-field="description"]').fill('Холод');
      await card.locator('[data-damage-idx="2"] [data-damage-field="type"]').selectOption('flat');
      await card.locator('[data-damage-idx="2"] [data-damage-field="value"]').fill('5');
      await card.locator('[data-damage-idx="2"] [data-damage-field="description"]').fill('Магическое масло');
      const prof = await card.locator('.weapon-prof-quick-inline').boundingBox();
      const hide = await card.locator('[data-weapon-toggle-desc]').boundingBox();
      assert.ok(Math.abs(prof.y + prof.height / 2 - hide.y - hide.height / 2) < 3);
      await card.locator('[data-weapon-toggle-desc]').click();
      assert.equal(await card.locator('.weapon-prof-quick-inline').isVisible(), false);
      assert.deepEqual(await card.locator('[data-weapon-damage-extras] .weapon-damage-extra').allTextContents(), ['+2к4', '+1к8', '+5']);
      assert.equal(await card.locator('[data-weapon-damage-extras] .weapon-damage-extra').first().getAttribute('title'), 'Огонь клинка');
      assert.equal(await card.locator('[data-weapon-damage-extras] .weapon-damage-extra').last().isVisible(), true);
      assert.equal(await card.locator('.weapon-summary .weapon-damage-extra').count(), 0);
      const summaryRect = await card.locator('.weapon-summary').boundingBox();
      const extrasRect = await card.locator('[data-weapon-damage-extras]').boundingBox();
      assert.ok(extrasRect.y >= summaryRect.y + summaryRect.height, 'extra damage is below the entire main frame');
      if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, monster ? 'monster-weapon-collapsed.png' : 'weapon-collapsed.png') });
      await card.locator('[data-weapon-toggle-desc]').click();
      await page.evaluate(() => { animateSingleRoll = async () => {}; rollDie = () => 3; });
      const diceBefore = requests.filter(r => r.path.endsWith('/dice')).length;
      await card.locator('[data-weapon-roll-dmg]').click();
      await waitFor(() => requests.filter(r => r.path.endsWith('/dice')).length > diceBefore, 'mixed damage saved');
      const sent = requests.filter(r => r.path.endsWith('/dice')).at(-1).data.event;
      const canonical = DamageRolls.event(sent.damageParts, sent.damageTitle);
      assert.equal(sent.total, canonical.total);
      assert.deepEqual(sent.damageParts.filter(p => /Огонь|Холод|масло/.test(p.description)).map(p => p.description), ['Огонь клинка', 'Холод', 'Магическое масло']);
      await gm.waitForFunction(total => [...document.querySelectorAll('#log-list li')].some(el => /Огонь клинка/.test(el.textContent) && /Магическое масло/.test(el.textContent) && el.textContent.includes(`= ${total}`)), sent.total);
      await page.evaluate(() => InfoModal.close());
      await waitFor(() => h.database().players.find(p => p.id === playerId).sheet.parsed.weaponsList?.[0]?.damageModifiers?.[2]?.description === 'Магическое масло', 'modifiers persisted');
      await page.evaluate(id => InfoModal.open(players.find(p => p.id === id)), playerId);
      await page.locator(monster ? '[data-monster-tab="monster-combat"]' : '.sheet-tab[data-tab="combat"]').click();
      assert.equal(await card.locator('[data-damage-idx]').count(), 3);
      await card.locator('[data-damage-idx="1"] [data-damage-del]').click();
      assert.equal(await card.locator('[data-damage-idx]').count(), 2);
      assert.deepEqual(await card.locator('[data-weapon-damage-extras] .weapon-damage-extra').allTextContents(), ['+2к4', '+5']);
      if (screenshotDir) {
        fs.mkdirSync(screenshotDir, { recursive: true });
        await page.locator('#sheet-main').evaluate(el => { el.scrollTop = 0; });
        await page.screenshot({ path: path.join(screenshotDir, monster ? 'monster-weapon-modifiers.png' : 'weapon-modifiers.png') });
      }
      await page.evaluate(id => { InfoModal.close(); rollTokenMiniWeapon(players.find(p => p.id === id), 0, 'dmg'); }, playerId);
      await waitFor(() => requests.filter(r => r.path.endsWith('/dice')).length > diceBefore + 1, 'quick token damage includes modifiers');
      const quick = requests.filter(r => r.path.endsWith('/dice')).at(-1).data.event;
      assert.ok(quick.kindText.includes('Огонь клинка') && quick.kindText.includes('Магическое масло'));
      assert.equal(quick.kindText.includes('Холод'), false);
      console.log(`PASS: ${monster ? 'monster' : 'character'} weapon modifiers edit, roll, log, persist, reopen and delete; proficiency shares the action row`);
    }

    for (const page of pages) await page.evaluate(() => InfoModal.close());
    await p3.evaluate(() => {
      const wrap = document.getElementById('board-wrapper');
      wrap.style.cssText += ';width:700px;height:500px;max-width:700px;max-height:500px;display:block;flex:none';
      wrap.scrollLeft = 500; wrap.scrollTop = 300;
    });
    await p3.locator('#board-wrapper').scrollIntoViewIfNeeded();
    const rect = await p3.locator('#board-wrapper').boundingBox();
    const before = await p3.locator('#board-wrapper').evaluate(el => ({ x: el.scrollLeft, y: el.scrollTop }));
    await p3.mouse.move(rect.x + 350, rect.y + 250);
    await p3.mouse.down({ button: 'middle' });
    await p3.mouse.move(rect.x + 220, rect.y + 180, { steps: 6 });
    const during = await p3.locator('#board-wrapper').evaluate(el => ({ x: el.scrollLeft, y: el.scrollTop }));
    await p3.mouse.up({ button: 'middle' });
    await p3.waitForTimeout(350);
    const after = await p3.locator('#board-wrapper').evaluate(el => ({ x: el.scrollLeft, y: el.scrollTop }));
    assert.ok(during.x > before.x && during.x < after.x);
    assert.ok(Math.abs(after.x - before.x - 130) <= 2);
    assert.ok(Math.abs(after.y - before.y - 70) <= 2);
    await p3.waitForSelector('.token-nav-pointer:not(.token-nav-pointer--base) span');
    const labels = await p3.locator('.token-nav-pointer:not(.token-nav-pointer--base) span').allTextContents();
    assert.ok(labels.includes('Player 2') || labels.includes('Player 4'));
    assert.ok(await p3.locator('.token-nav-pointer--base').count());
    if (screenshotDir) {
      fs.mkdirSync(screenshotDir, { recursive: true });
      await p3.screenshot({ path: path.join(screenshotDir, 'map-navigation.png') });
      await gm.evaluate(() => InfoModal.open(players.find(p => p.id === 'player-1')));
      await gm.screenshot({ path: path.join(screenshotDir, 'token-access.png') });
    }
    console.log('PASS: middle drag interpolates movement; offscreen base and named allies have separate arrows');
    assert.deepEqual(await p3.locator('#board-view-mode-select option').evaluateAll(items=>items.map(el=>el.value)),['topdown','3d']);
    await p3.evaluate(()=>applyBoardViewMode('isometric'));
    assert.equal(await p3.evaluate(()=>window.__boardViewMode),'topdown');
    console.log('PASS: only 2D/3D remain; obsolete view values safely fall back to 2D');
    for (const page of pages) await page.evaluate(() => InfoModal.close());
    await p3.evaluate(() => InfoModal.open(players.find(p => p.id === 'player-1')));
    const titleRect = await p3.locator('#sheet-title').boundingBox();
    const affiliationRect = await p3.locator('#sheet-affiliation').boundingBox();
    assert.ok(Math.abs(titleRect.y + titleRect.height / 2 - affiliationRect.y - affiliationRect.height / 2) < 3);
    assert.equal(await p3.locator('#sheet-affiliation button').count(), 0);
    const fileRect = await p3.locator('.sheet-import').boundingBox();
    const saveRect = await p3.getByRole('button', { name: 'Сохранить основу', exact: true }).boundingBox();
    assert.ok(Math.abs(fileRect.y + fileRect.height / 2 - saveRect.y - saveRect.height / 2) < 3);
    for (const tab of ['basic', 'spells', 'combat', 'inventory', 'personality', 'appearance', 'notes', 'wildshape', 'shop']) {
      await p3.locator(`.sheet-tab[data-tab="${tab}"]`).click();
      const applied = await p3.evaluate(() => {
        document.querySelectorAll('.equip-overlay').forEach(el => el.remove());
        document.activeElement?.blur();
        getUiState(openedSheetPlayerId).lastInteractAt = 0;
        const snapshot = structuredClone(openedSheetPlayer);
        snapshot._activeSheetTab = 'inventory';
        snapshot.sheetUpdatedAt += 1;
        InfoModal.refresh([snapshot]);
        return openedSheetPlayer.sheetUpdatedAt === snapshot.sheetUpdatedAt;
      });
      assert.equal(applied, true, `network refresh applied on ${tab}`);
      assert.equal(await p3.locator('.sheet-tab.active').getAttribute('data-tab'), tab);
      await p3.evaluate(() => document.querySelectorAll('.equip-overlay').forEach(el => el.remove()));
    }
    await p3.locator('.sheet-tab[data-tab="combat"]').click();
    await p3.evaluate(() => rerenderSpellsTabInPlace(sheetContent, openedSheetPlayer, openedSheetPlayer.sheet.parsed, true));
    assert.ok(await p3.locator('[data-combat-root]').count());
    await p3.evaluate(() => { InfoModal.close(); InfoModal.open(players.find(p => p.id === 'player-3')); });
    assert.equal(await p3.locator('.sheet-tab.active').getAttribute('data-tab'), 'basic');
    await p3.evaluate(() => { InfoModal.close(); InfoModal.open(players.find(p => p.id === 'player-1')); });
    assert.equal(await p3.locator('.sheet-tab.active').getAttribute('data-tab'), 'combat');
    console.log('PASS: affiliation auto-saves at title level; JSON and base buttons align; all nine character tabs resist stale network selection');

    await p3.locator('.sheet-tab[data-tab="wildshape"]').click();
    const toggleShape = p3.getByRole('button', { name: 'Импорт монстра', exact: true });
    await toggleShape.waitFor();
    assert.equal(await toggleShape.getAttribute('aria-pressed'), 'false');
    assert.equal(await toggleShape.getAttribute('title'), 'При активации боевые показатели берутся из этого раздела вместо «Основное».');
    assert.equal(await p3.locator('.monster-import-card [data-wildshape-activate-btn]').count(), 1);
    const originalVitality = await p3.evaluate(() => structuredClone(openedSheetPlayer.sheet.parsed.vitality));
    await p3.locator('[data-wildshape-monster-root] [data-monster-sheet-path="vitality.hp-max.value"]').fill('36');
    await waitFor(() => h.database().players[0].sheet.parsed.wildShape?.formSheet?.vitality?.['hp-max']?.value === 36, 'form edit saved');
    assert.deepEqual(await p3.evaluate(() => openedSheetPlayer.sheet.parsed.vitality), originalVitality);
    const inactiveBackground = await toggleShape.evaluate(el => getComputedStyle(el).backgroundImage);
    if (screenshotDir) await p3.screenshot({ path: path.join(screenshotDir, 'wildshape-inactive.png') });
    await toggleShape.click();
    await p3.waitForFunction(() => openedSheetPlayer.sheet.parsed.wildShape.active && openedSheetPlayer.sheet.parsed.vitality['hp-max'].value === 36);
    await p3.locator('[data-wildshape-activate-btn][aria-pressed="true"]').waitFor();
    const activeBackground = await toggleShape.evaluate(el => getComputedStyle(el).backgroundImage);
    assert.notEqual(activeBackground, inactiveBackground);
    assert.equal(activeBackground, await p3.getByRole('button', { name: 'Сохранить основу', exact: true }).evaluate(el => getComputedStyle(el).backgroundImage));
    await waitFor(() => h.database().players[0].sheet.parsed.wildShape?.active === true, 'wild shape activation saved');
    if (screenshotDir) await p3.screenshot({ path: path.join(screenshotDir, 'wildshape-active.png') });
    await p1.waitForFunction(() => players.find(p => p.id === 'player-1')?.sheet?.parsed?.wildShape?.active === true);
    await p1.evaluate(() => InfoModal.open(players.find(p => p.id === 'player-1')));
    await p1.locator('.sheet-tab[data-tab="wildshape"]').click();
    await p1.locator('[data-wildshape-activate-btn][aria-pressed="true"]').waitFor();
    assert.equal(await p1.locator('[data-wildshape-activate-btn]').isDisabled(), true);
    await p1.evaluate(() => InfoModal.close());
    await p3.evaluate(() => { InfoModal.close(); InfoModal.open(players.find(p => p.id === 'player-1')); });
    await p3.locator('[data-wildshape-activate-btn][aria-pressed="true"]').waitFor();
    await toggleShape.click();
    await p3.locator('[data-wildshape-activate-btn][aria-pressed="false"]').waitFor();
    assert.deepEqual(await p3.evaluate(() => openedSheetPlayer.sheet.parsed.vitality), originalVitality);
    await waitFor(() => h.database().players[0].sheet.parsed.wildShape?.active === false, 'base stats restored');
    console.log('PASS: Import Monster toggles wild shape in its import card, changes gray to gold, persists/reopens, restores base stats and respects read-only access');

    await p4.evaluate(() => InfoModal.open(players.find(p => p.id === 'monster-1')));
    for (const tab of ['monster-main', 'monster-extra', 'monster-combat', 'monster-manual', 'monster-token']) {
      await p4.locator(`[data-monster-tab="${tab}"]`).click();
      await p4.evaluate(() => {
        document.activeElement?.blur(); getUiState(openedSheetPlayerId).lastInteractAt = 0;
        const snapshot = structuredClone(openedSheetPlayer);
        snapshot._activeSheetTab = 'monster-main'; snapshot.sheetUpdatedAt += 1;
        InfoModal.refresh([snapshot]);
      });
      await p4.locator(`[data-monster-tab="${tab}"].active`).waitFor();
    }
    await p4.evaluate(() => {
      const other = structuredClone(openedSheetPlayer); other.id = 'another-monster';
      InfoModal.open(other);
    });
    await p4.locator('[data-monster-tab="monster-main"].active').waitFor();
    await p4.evaluate(() => InfoModal.open(players.find(p => p.id === 'monster-1')));
    await p4.locator('[data-monster-tab="monster-token"].active').waitFor();
    let releaseLookup;
    const lookupGate = new Promise(resolve => { releaseLookup = resolve; });
    await p4.route('**/srd5_1_monsters_extracted.json', async route => { await lookupGate; await route.fulfill({ json: { monsters: [] } }); });
    const monsterLookup = p4.waitForRequest('**/srd5_1_monsters_extracted.json');
    await p4.evaluate(() => {
      if (window.MonstersLib) window.MonstersLib.getMonsters = () => [];
      const player = structuredClone(players.find(p => p.id === 'monster-1'));
      player.monsterId = 'slow-lookup'; delete player.sheet.parsed.monster;
      InfoModal.open(player);
    });
    await monsterLookup;
    await p4.evaluate(() => {
      const base = structuredClone(openedSheetPlayer); base.isBase = true;
      InfoModal.close(); InfoModal.open(base);
    });
    releaseLookup();
    await p4.waitForTimeout(80);
    assert.ok(await p4.locator('.sheet-tab.active').count());
    assert.equal(await p4.locator('[data-monster-tab]').count(), 0);
    console.log('PASS: all five monster tabs resist stale selection; a late monster lookup cannot overwrite a reopened sheet');

    for (const page of pages) await page.evaluate(() => { InfoModal.close(); RoomChat.hydrateFromRows([]); });
    await p1.locator('#room-chat-open').click();
    await p1.locator('#roomChatClose').click();
    const toneBefore = await p1.evaluate(() => window.__notificationOscillators);
    const incoming = { id: 'notification-test-1', chatType: 'direct', fromId: 'user-2', fromName: 'User 2', toId: 'user-1', text: 'Новое сообщение', ts: Date.now() };
    const row = { id: 'notify-row-1', text: await p1.evaluate(message => encodeRoomChatLogRow(message), incoming) };
    broadcast({ type: 'logRow', roomId: 'test-room', row });
    await p1.locator('#room-chat-notification').waitFor({ state: 'visible' });
    await p1.waitForFunction(before => window.__notificationOscillators === before + 2, toneBefore);
    assert.equal(await p2.locator('#room-chat-notification').isVisible(), false);
    assert.equal(await p3.locator('#room-chat-notification').isVisible(), false);
    const iconRect = await p1.locator('#room-chat-notification').boundingBox();
    const statusRect = await p1.locator('#status-bar').boundingBox();
    assert.ok(Math.abs(iconRect.x + iconRect.width / 2 - statusRect.x - statusRect.width / 2) < 2);
    assert.equal(await p1.locator('#room-chat-notification').evaluate(el => getComputedStyle(el).animationName), 'room-message-blink');
    if (screenshotDir) await p1.screenshot({ path: path.join(screenshotDir, 'chat-notification.png') });
    await p1.locator('#room-chat-notification').click();
    assert.equal(await p1.locator('#room-chat-notification').isVisible(), false);
    await p1.waitForTimeout(850);
    broadcast({ type: 'logRow', roomId: 'test-room', row });
    await p1.evaluate(message => {
      RoomChat.pushMessage({ ...message, id: 'visible-notify' });
      RoomChat.pushMessage({ ...message, id: 'my-notify', fromId: 'user-1', toId: 'user-2' });
    }, incoming);
    assert.equal(await p1.locator('#room-chat-notification').isVisible(), false);
    assert.equal(await p1.evaluate(() => window.__notificationOscillators), toneBefore + 2);
    await p1.evaluate(message => RoomChat.hydrateFromRows([{ ...message, id: 'old-history' }]), incoming);
    assert.equal(await p1.evaluate(() => window.__notificationOscillators), toneBefore + 2);
    console.log('PASS: new incoming DM flashes a centered icon and schedules a short real Web Audio chime; reading, history, own messages and duplicates stay quiet');
    }
    if(process.env.D20_3D_ONLY){
      await require('./helpers/board-3d-scenarios.cjs')({ pages, h, broadcast, screenshotDir, clone, start });
    }else{
      // Permissions/sheet scenarios intentionally transfer ownership and leave
      // debounced network work behind. Give the map suite its own room fixture
      // and browser contexts rather than layering synthetic maps over that room.
      await browser.close();
      await new Promise((resolve,reject)=>{
        const child=require('node:child_process').spawn(process.execPath,[__filename],{env:{...process.env,D20_3D_ONLY:'1'},stdio:'inherit',windowsHide:true});
        child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('3D browser suite failed with exit code '+code)));
      });
    }
    assert.deepEqual(errors, []);
    console.log(`Browser regression complete; ${requests.filter(r => r.path.endsWith('/initiative')).length} confirmed initiative requests.`);
  } catch (error) {
    console.error(JSON.stringify({ diagnostics: diagnostics.slice(-15), errors,
      requests: requests.filter(r => /initiative|access/.test(r.path)),
      players: h.database().players.map(p => ({ id: p.id, initiative: p.initiative, rolled: p.hasRolledInitiative })) }, null, 2));
    for (const page of pages.filter(p=>!p.isClosed())) console.error(await page.evaluate(() => ({ id: myId, phase: lastState?.phase,
      epoch: lastState?.initiativeEpoch, rolls: lastState?.players?.map(p => [p.id,p.hasRolledInitiative]), events: RealtimeDebug.events().slice(-5) })));
    throw error;
  } finally {
    await browser.close();
    for (const ws of sockets) ws.close();
    wss.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; for (const ws of sockets) ws.terminate(); server.close(); });
