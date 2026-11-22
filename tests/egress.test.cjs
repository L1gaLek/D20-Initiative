const test = require('node:test');
const assert = require('node:assert/strict');
const { serverHarness, initialState, clone } = require('./helpers/room-harness.cjs');
const RoomReadCache = require('../backend/shared/room-read-cache');
const vm = require('node:vm');
const { read, functions } = require('./helpers/room-harness.cjs');

test('forty saves read the large room once while retaining every acknowledged change', async () => {
  const state = initialState();
  state.players[0].sheet.parsed.notes.entries[0].text = 'campaign notes '.repeat(70_000);
  const h = serverHarness(state);
  const baseline = Buffer.byteLength(JSON.stringify(state)) * 40;
  for (let i=0;i<40;i++) await h.context.mutateRoomState(h.clients[i%4].ctx, current => {
    current.players[i%4].lastSavedNumber = i;
    return current;
  });
  assert.equal(h.stateReadMetrics.fullReads,1);
  assert.equal(h.stateReadMetrics.cacheHits,39);
  assert.ok(h.stateReadMetrics.fullBytes < baseline * .03);
  assert.deepEqual(h.database().players.map(p=>p.lastSavedNumber),[36,37,38,39]);
  console.log('Room JSON read bytes:',JSON.stringify({before:baseline,after:h.stateReadMetrics.fullBytes,saves:40}));
});

test('an external edit invalidates the row version even if cached data has newer local timestamps', async () => {
  const h=serverHarness();
  await h.context.mutateRoomState(h.clients[0].ctx, s=>s);
  h.database().players[1].name='External writer';
  await h.context.mutateRoomState(h.clients[0].ctx,s=>{s.players[0].name='Local writer';return s;});
  assert.equal(h.database().players[1].name,'External writer');
  assert.equal(h.database().players[0].name,'Local writer');
  assert.equal(h.stateReadMetrics.fullReads,2);
});

test('a failed transaction never publishes uncommitted state to the shared cache', async () => {
  const h=serverHarness();
  await h.context.mutateRoomState(h.clients[0].ctx,s=>s);
  const before=clone(h.cachedStates.get('test-room'));
  await assert.rejects(h.context.mutateRoomState(h.clients[0].ctx,s=>{s.players[0].name='Lost';throw Error('abort');}),/abort/);
  assert.deepEqual(h.cachedStates.get('test-room'),before);
  assert.notEqual(h.database().players[0].name,'Lost');
});

test('room row readers share one load, honor expiry and never reuse another map or room', async () => {
  let now=0,loads=0;
  const cache=new RoomReadCache({now:()=>now,ttlMs:30,maxEntries:2,maxBytes:1000});
  const load=()=>{loads++;return {rows:[{n:loads}]};};
  const [a,b]=await Promise.all([cache.load('a',['fog','map-1'],load),cache.load('a',['fog','map-1'],load)]);
  assert.deepEqual(a,b);assert.equal(loads,1);
  await cache.load('a',['fog','map-2'],load);assert.equal(loads,2);
  await cache.load('b',['fog','map-1'],load);assert.equal(loads,3);
  now=31;await cache.load('b',['fog','map-1'],load);assert.equal(loads,4);
  assert.ok(cache.entries.size<=2&&cache.bytes<=1000);
});

test('invalidation during an in-flight SELECT retries readers and cannot restore stale fog', async () => {
  const cache=new RoomReadCache();let release,loads=0;
  const loader=()=>++loads===1?new Promise(resolve=>{release=resolve;}):Promise.resolve({rows:['new fog']});
  const first=cache.load('room',['fog'],loader);await Promise.resolve();
  cache.invalidate('room');
  const second=cache.load('room',['fog'],loader);
  release({rows:['old fog']});
  assert.deepEqual(await second,{rows:['new fog']});
  assert.deepEqual(await first,{rows:['new fog']});
  assert.deepEqual(await cache.load('room',['fog'],loader),{rows:['new fog']});
  assert.equal(loads,2);
});

test('fog persistence returns only its timestamp while peers receive the complete validated fog', async () => {
  const h=serverHarness(), maps=require('./helpers/map-harness.cjs')(h,initialState());
  let sql;
  h.context.pool={query:async statement=>{sql=statement;return {rows:[{updated_at:'2026-11-22T00:00:00Z'}]};}};
  await h.context.handleFogRow(h.clients[4],{roomId:'test-room',row:{map_id:'map-1',settings:{enabled:true,mode:'dynamic'},manual_stamps:[{x:1,y:2,r:1,mode:'reveal'}],explored_packed:'packed'.repeat(1000)}});
  assert.match(sql,/returning updated_at/);
  assert.doesNotMatch(sql,/returning \*/);
  const payload=h.clients[0].events.at(-1).payload;
  assert.equal(payload.row.explored_packed,'packed'.repeat(1000));
  assert.equal(payload.row.settings.mode,'dynamic');
  assert.equal(payload.row.manual_stamps.length,1);
});

test('continuous painting cannot amplify one room read into unlimited database egress', async () => {
  const cache=new RoomReadCache();let loads=0;
  const loader=()=>{loads++;cache.invalidate('room');return {rows:[loads]};};
  assert.deepEqual(await cache.load('room',['walls'],loader),{rows:[2]});
  assert.equal(loads,2);
  assert.equal(cache.entries.size,0);
});

test('room state refresh retains membership checks but immediately applies ownership changes', async () => {
  const roomId='room';let checks=0;
  const socket={currentRoomId:roomId,userId:'old-owner',roomContext:{roomId,userId:'old-owner',role:'Player',cachedAt:Date.now(),stateStale:true,state:{players:[{id:'token',ownerId:'old-owner'}]}}};
  const latest={state:{players:[{id:'token',ownerId:'new-owner'}]}};
  const c=vm.createContext({Date,String,ROOM_ID_RE:/./,USER_ID_RE:/./,ROOM_CONTEXT_CACHE_TTL_MS:30000,normalizeSafeId:v=>v,getStateRoomMeta:()=>({}),getCachedRoomStateRow:()=>latest,loadRoomContext:async()=>{checks++;return {roomId,role:'GM',state:latest.state};}});
  vm.runInContext(functions(read('backend/server.js'),['loadWsRoomContext','canControlPlayer']),c);
  const ctx=await c.loadWsRoomContext(socket,roomId);
  assert.equal(c.canControlPlayer(ctx,ctx.state.players[0]),false);
  assert.equal(checks,0);
  socket.roomContext=null; // Kick, role change or access events invalidate all rights.
  assert.equal((await c.loadWsRoomContext(socket,roomId)).role,'GM');
  assert.equal(checks,1);
});
