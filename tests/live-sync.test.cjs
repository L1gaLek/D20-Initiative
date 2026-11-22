const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { AsyncLocalStorage } = require('node:async_hooks');
const { serverHarness, initialState, clone, read, functions } = require('./helpers/room-harness.cjs');
const SheetSync = require('../backend/shared/sheet-sync');
const RoomEventJournal = require('../backend/shared/room-event-journal');
const WsScheduler = require('../backend/shared/ws-scheduler');
const tick = () => new Promise(resolve => setImmediate(resolve));
const op = (field, value) => ({ path: ['parsed', ...field.split('.')], value });
const patch = (id, ops, playerId = 'player-1') => ({ roomId:'test-room',playerId,requestId:id,ops,__fromWsClient:'client-1' });

test('warm pure commands use one atomic database query and retain concurrent transactional writes', async () => {
  const h = serverHarness();
  await h.context.mutateRoomStateFast(h.clients[0].ctx,s=>s);
  const before = h.queries.length;
  await h.context.mutateRoomStateFast(h.clients[0].ctx,s=>{s.players[0].name='one query';return s;});
  assert.equal(h.queries.length-before,1);
  await Promise.all([
    h.context.mutateRoomStateFast(h.clients[0].ctx,s=>{s.players[0].name='fast';return s;}),
    h.context.mutateRoomState(h.clients[1].ctx,s=>{s.players[1].name='transaction';return s;})
  ]);
  assert.equal(h.database().players[0].name,'fast');
  assert.equal(h.database().players[1].name,'transaction');
  h.database().players[2].name='external';
  await h.context.mutateRoomStateFast(h.clients[0].ctx,s=>{s.players[0].name='after conflict';return s;});
  assert.equal(h.database().players[2].name,'external');
  assert.equal(h.database().players[0].name,'after conflict');
});

test('simultaneous small sheet patches merge notes, HP and equipment; lost-ack retry cannot undo a later change', async () => {
  const h=serverHarness();
  const hp=patch('hp',[op('vitality.hp-current.value',17)]);
  await Promise.all([
    h.context.handleSheetPatchRelay(h.clients[0],hp),
    h.context.handleSheetPatchRelay(h.clients[4],patch('notes',[op('notes.entries',[{text:'GM notes'}])])),
    h.context.handleSheetPatchRelay(h.clients[0],patch('armor',[op('appearance.slots.armor','plate')]))
  ]);
  await h.context.handleSheetPatchRelay(h.clients[0],patch('new-hp',[op('vitality.hp-current.value',9)]));
  await h.context.handleSheetPatchRelay(h.clients[0],hp);
  const p=h.database().players[0];
  assert.equal(p.sheet.parsed.vitality['hp-current'].value,9);
  assert.equal(p.sheet.parsed.notes.entries[0].text,'GM notes');
  assert.equal(p.sheet.parsed.appearance.slots.armor,'plate');
  const preview=h.clients[1].events.find(e=>e.payload.type==='sheetPreview');
  assert.equal(preview.committed.players[0].sheet.parsed.vitality,undefined);
  const confirmed=h.clients[1].events.filter(e=>e.payload.type==='sheetPatch').at(-1);
  assert.equal(confirmed.committed.players[0].sheet.parsed.vitality['hp-current'].value,9);
  assert.ok(!confirmed.payload.patch?.sheet,'no whole-sheet echo');
});

test('sheet patches reject foreign control and unsafe paths and never publish a failed write', async () => {
  const h=serverHarness();
  await h.context.handleSheetPatchRelay(h.clients[1],patch('foreign',[op('vitality.hp-current.value',1)]));
  assert.equal(h.database().players[0].sheet.parsed.vitality,undefined);
  assert.equal(h.clients[1].events.at(-1).payload.type,'sheetPatchError');
  await assert.rejects(h.context.handleSheetPatchRelay(h.clients[0],patch('unsafe',[{path:['parsed','__proto__','polluted'],value:true}])),/Invalid sheet path/);
  const before=clone(h.database());
  const query=h.context.pool.query;
  h.context.pool.query=async(sql,v)=>{if(sql.includes('update public.room_state set phase'))throw Error('database unavailable');return query(sql,v);};
  await h.context.handleSheetPatchRelay(h.clients[0],patch('failed',[op('vitality.hp-current.value',0)]));
  assert.deepEqual(h.database(),before);
  assert.equal(h.clients[0].events.at(-1).payload.type,'sheetPatchError');
  assert.equal(h.clients[0].events.some(e=>e.payload.type==='sheetPatch'),false);
});

test('undoing an already sent change before acknowledgment produces a compensating patch', () => {
  const before={parsed:{vitality:{'hp-current':{value:20}}}};
  const changed=SheetSync.apply(before,[op('vitality.hp-current.value',2)]);
  const first=SheetSync.diff(before,changed),undo=SheetSync.diff(changed,before);
  const merged=SheetSync.merge(first,undo);
  assert.deepEqual(SheetSync.apply(changed,merged),before);
  assert.equal(merged.length,1);
});

function liveClient() {
  const state=initialState();state.players[0].sheet.parsed.vitality={'hp-current':{value:20}};
  const c=vm.createContext({console,Date,Map,Set,SheetSync,structuredClone,clearTimeout,
    setTimeout:(fn,ms)=>{const t=setTimeout(fn,ms);t.unref();return t;},
    currentRoomId:'test-room',lastState:state,players:state.players,playerElements:new Map(),WS_CLIENT_ID:'client-1',
    deepClone:clone,syncVisiblePlayersState:()=>{},updatePlayerList:()=>{},updateHpBar:()=>{},
    InfoModal:{refresh:()=>{},acknowledgeSheetPatch:()=>{}},Board3D:{requestSync:()=>{}},
    __roomDetachedCache:{fogByMap:new Map([['map-1',{explored:['0,0'],manualStamps:[]}]]),mapMetaById:new Map()},
    _defaultFogDetached:r=>({explored:r.explored||[],manualStamps:r.manual_stamps||[]}),_refreshDetachedRoomView:()=>{},
    packFogExplored:a=>a.join(';'),unpackFogExplored:s=>s?s.split(';'):[],handleCombatPreview:()=>{},
    showAppToast:()=>{},wsMakeNonce:()=>Math.random().toString(),sendWsEnvelope:()=>{},
  });
  vm.runInContext('window=globalThis',c);vm.runInContext(read('client/network/live-room-sync.js'),c);
  return c;
}
test('live sheet previews change visuals only; rejection restores authoritative HP', () => {
  const c=liveClient(),msg=patch('preview',[op('vitality.hp-current.value',0)]);
  c.handleSheetRealtime({...msg,type:'sheetPreview'});
  assert.equal(c.getLivePlayerView(c.lastState.players[0]).sheet.parsed.vitality['hp-current'].value,0);
  assert.equal(c.lastState.players[0].sheet.parsed.vitality['hp-current'].value,20);
  c.handleSheetRealtime({...msg,type:'sheetPatchError'});
  assert.equal(c.getLivePlayerView(c.lastState.players[0]).sheet.parsed.vitality['hp-current'].value,20);
});

test('fog previews are map-local, preserve newer deltas across a commit, and ignore a late confirmed preview', () => {
  const c=liveClient();
  const message=(type,previewId,extra={})=>({type,previewId,mapId:'map-1',roomId:'test-room',...extra});
  c.handleFogRealtime(message('fogPreview','a',{delta:{cells:['1,0']}}));
  c.handleFogRealtime(message('fogPreview','b',{delta:{cells:['2,0']}}));
  c.handleFogRealtime(message('fogRow','a',{row:{map_id:'map-1',explored:['0,0','1,0']}}));
  assert.deepEqual([...c.__roomDetachedCache.fogByMap.get('map-1').explored],['0,0','1,0','2,0']);
  c.handleFogRealtime(message('fogPreview','a',{delta:{stampsAppend:[{x:1,y:1}]}}));
  assert.equal(c.__roomDetachedCache.fogByMap.get('map-1').manualStamps.length,0);
  c.handleFogRealtime(message('fogPreviewCancel','b'));
  assert.deepEqual([...c.__roomDetachedCache.fogByMap.get('map-1').explored],['0,0','1,0']);
  assert.equal(c.__roomDetachedCache.fogByMap.has('map-2'),false);
});

test('journal replays only the missed public stream, bounds memory, expires and changes epoch after eviction', () => {
  let now=0;const j=new RoomEventJournal({now:()=>now,maxBytes:900,roomBytes:450,maxRooms:2,maxEvents:4,ttlMs:50});
  const cursor=j.cursor('a');j.append('a',{type:'tokenRow',n:1});
  const after=j.cursor('a');j.append('a',{type:'sheetPatch',n:2});
  assert.deepEqual(j.read('a',after).events.map(e=>e.n),[2]);
  assert.equal(j.read('b',after),null);
  now=51;assert.equal(j.read('a',cursor),null);
  for(let n=0;n<20;n++)j.append('a',{type:'sheetPatch',text:'x'.repeat(100)});
  assert.ok(j.bytes<=900&&j.room('a').bytes<=450);
  j.cursor('b');j.cursor('c');assert.equal(j.read('a',after),null);
});

test('commits made after the last socket disconnects remain available for replay', () => {
  const journal=new RoomEventJournal(),cursor=journal.cursor('room');
  const c=vm.createContext({roomJournal:journal,rooms:new Map(),stampRoomEvent:()=>{},roomReadCache:{invalidate:()=>{}},invalidateRoomContexts:()=>{}});
  vm.runInContext(functions(read('backend/server.js'),['broadcastToRoom']),c);
  c.broadcastToRoom('room',{type:'sheetPatch',roomId:'room',playerId:'p',ops:[]});
  assert.equal(journal.read('room',cursor).events.length,1);
});

test('reconnect uses no database reads within the journal window; restart falls back to one snapshot with concurrent events', async () => {
  const journal=new RoomEventJournal(),messages=[],c=vm.createContext({roomJournal:journal,
    ROOM_ROW_READS:Object.fromEntries(['room_map_meta','room_walls','room_marks','room_fog','room_music_state','room_tokens','room_log','room_dice_events'].map(t=>[t,{maxLimit:10000}])),
    send:(ws,p)=>messages.push(clone(p)),stripRoomSecretsFromState:clone,
  });
  let reads=0;
  c.fetchRoomStateRow=async()=>{reads++;await tick();journal.append('room',{type:'sheetPatch',n:3});return {state:initialState()};};
  c.fetchWhitelistedRoomRows=async()=>{reads++;return {rows:[]};};
  vm.runInContext(functions(read('backend/server.js'),['resumeRoomClient']),c);
  const cursor=journal.cursor('room');journal.append('room',{type:'tokenRow',n:2});
  await c.resumeRoomClient({}, {roomId:'room',state:initialState()},cursor);
  assert.equal(reads,0);assert.equal(messages.at(-1).mode,'replay');assert.equal(messages.at(-1).events[0].n,2);
  await c.resumeRoomClient({}, {roomId:'room',state:initialState()}, {...cursor,epoch:'old-server'});
  assert.equal(reads,9);assert.equal(messages.at(-1).mode,'snapshot');assert.equal(messages.at(-1).events[0].n,3);
});

test('slow mutations do not block ping or visuals; lifecycle and game commands remain ordered with isolated reply metadata', async () => {
  let release;const order=[],als=new AsyncLocalStorage(),sent=[];
  const c=vm.createContext({inboundMeta:als,WebSocket:{OPEN:1},stampRoomEvent:()=>{}});
  vm.runInContext(functions(read('backend/server.js'),['send']),c);
  const ws={readyState:1,send:raw=>sent.push(JSON.parse(raw))};
  const scheduler=new WsScheduler(data=>als.run({wsNonce:data.type},async()=>{
    order.push(data.type);
    if(data.type==='save')await new Promise(resolve=>{release=resolve;});
    c.send(ws,{type:'reply',action:data.type});
  }),error=>{throw error;});
  const save=scheduler.push({type:'save'});await tick();
  const next=scheduler.push({type:'combatCommand'}),visual=scheduler.push({type:'diceEvent'}),ping=scheduler.push({type:'ping'});
  await Promise.all([visual,ping]);assert.equal(order[0],'save');assert.deepEqual(new Set(order.slice(1)),new Set(['diceEvent','ping']));
  release();await Promise.all([save,next]);assert.equal(order.at(-1),'combatCommand');
  assert.ok(sent.every(m=>m.__replyToWsNonce===m.action));
  let joined=false;const lifecycle=new WsScheduler(async d=>{if(d.type==='joinRoom'){await tick();joined=true;}else assert.equal(joined,true);},error=>{throw error;});
  await Promise.all([lifecycle.push({type:'joinRoom'}),lifecycle.push({type:'fogPreview'}),lifecycle.push({type:'sheetPatch'})]);
});
