const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { read, functions, initialState, serverHarness, clone } = require('./helpers/room-harness.cjs');
const RoomReadCache = require('../backend/shared/room-read-cache');
const WsScheduler = require('../backend/shared/ws-scheduler');
const DiceReceipts = require('../backend/shared/dice-receipts');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('fog and wall edits preserve warm bounds and unrelated maps, including pending reads', async () => {
  const cache = new RoomReadCache(); let loads = 0, release;
  const load = parts => cache.load('room', parts, () => ({ rows:[++loads] }));
  const keys = [['bounds','a'],['bounds','b'],['rows','room_fog','a',100],['rows','room_fog','b',100],['rows','room_fog','',100],['rows','room_walls','a',100]];
  await Promise.all(keys.map(load));
  const pending = cache.load('room',['rows','room_marks','b',100],() => new Promise(resolve => {release=resolve;}));
  await tick();
  cache.invalidateEvent('room',{type:'fogRow',row:{map_id:'a'}});
  release({rows:['marks']}); await pending;
  await Promise.all(keys.map(load));
  assert.equal(loads,8,'only fog a and the all-map fog list are reloaded');
  cache.invalidateEvent('room',{type:'wallDelete',mapId:'a'});
  await load(['bounds','a']); assert.equal(loads,8);
  cache.invalidateEvent('room',{type:'mapMetaRow',row:{map_id:'b'}});
  await load(['bounds','a']); await load(['bounds','b']); assert.equal(loads,9);
  cache.invalidateEvent('room',{type:'roomDeleted'}); assert.equal(cache.entries.size,0);
});

test('movement previews bypass held movement writes, but cannot cross combat or lifecycle commands', async () => {
  const events=[]; let release;
  const scheduler=new WsScheduler(async(data, receivedAt, prepared)=>{
    events.push('commit:'+data.type+':'+(data.n||''));
    if(data.type==='moveToken' && data.n===1) await new Promise(resolve=>{release=resolve;});
    if(data.type==='moveToken') assert.equal(prepared.n,data.n);
  },error=>{throw error;},async data=>{events.push('preview:'+data.n);return {n:data.n};});
  const first=scheduler.push({type:'moveToken',n:1}); await tick();
  const second=scheduler.push({type:'moveToken',n:2}); await tick();
  assert.ok(events.includes('preview:2')); assert.ok(!events.includes('commit:moveToken:2'));
  const combat=scheduler.push({type:'combatCommand'}),third=scheduler.push({type:'moveToken',n:3});
  const leave=scheduler.push({type:'leaveRoom'}),fourth=scheduler.push({type:'moveToken',n:4});
  await tick(); assert.ok(!events.includes('preview:3'));
  release(); await Promise.all([first,second,combat,third,leave,fourth]);
  assert.ok(events.indexOf('preview:3')>events.indexOf('commit:combatCommand:'));
  assert.ok(events.indexOf('preview:4')>events.indexOf('commit:leaveRoom:'));
});

test('two sockets preview immediately while map writes retain preview order and collision checks', async () => {
  const state=initialState();state.phase='exploration';state.players.forEach((p,i)=>Object.assign(p,{x:i*2,y:0,size:1,isPublic:true}));
  const h=serverHarness(state),maps=require('./helpers/map-harness.cjs')(h,state);
  let release, held=false;const connect=h.context.pool.connect;
  h.context.pool.connect=async()=>{const db=await connect();return {release:()=>db.release(),query:async(sql,values)=>{
    if(sql.includes('insert into public.room_tokens')&&!held){held=true;await new Promise(resolve=>{release=resolve;});}
    return db.query(sql,values);
  }};};
  const errors=[];
  const scheduler=ws=>new WsScheduler((data,at,prepared)=>h.context.handleMoveToken(ws,data,prepared),e=>errors.push(e),data=>h.context.prepareMoveToken(ws,data));
  const one=scheduler(h.clients[0]),two=scheduler(h.clients[1]);
  const a=one.push({type:'moveToken',roomId:'test-room',mapId:'map-1',tokenId:'player-1',x:8,y:8});
  while(!release)await tick();
  const b=two.push({type:'moveToken',roomId:'test-room',mapId:'map-1',tokenId:'player-2',x:8,y:8});
  await tick();await tick();
  assert.equal(h.clients[4].events.filter(e=>e.payload.type==='moveToken').length,2);
  assert.equal(maps.tokens.get('map-1::player-1').x,0,'neither preview acknowledges a save');
  release();await Promise.all([a,b]);
  assert.equal(maps.tokens.get('map-1::player-1').x,8);
  assert.equal(maps.tokens.get('map-1::player-2').x,2,'the second move cannot occupy the same cell');
  assert.match(h.clients[1].events.find(e=>e.payload.type==='error').payload.message,/occupied/);
  assert.equal(h.context.movementWrites.tails.size,0);assert.deepEqual(errors,[]);
});

test('late commits cannot override newer movement; clocks are map-local and rollback clears optimistic guards', () => {
  const state=initialState();Object.assign(state.players[0],{x:0,y:0,size:1,isPublic:true});
  const c=vm.createContext({console,Date,Map,Set,Number,String,currentRoomId:'room',lastState:state,
    getMonsterPreferredTokenSize:()=>1,setTokenSnapshotCached:()=>{},getTokenVisibilityOptimisticGuard:()=>null,
    setTokenVisibilityCached:()=>{},reassertTokenVisibilityGuard:()=>{},setTokenVisibilityOptimisticGuard:()=>{}});
  vm.runInContext('window=globalThis',c);
  vm.runInContext(read('client/network/live-room-sync.js')+functions(read('client/core-helpers-network.js'),['applyTokenRowToLocalState']),c);
  const row=(revision,x,map='map-1')=>({token_id:'player-1',map_id:map,x,y:0,size:1,is_public:true,move_revision:revision,updated_at:new Date().toISOString()});
  c.applyTokenRowToLocalState(row(12,4));c.applyTokenRowToLocalState({...row(11,3),updated_at:new Date(Date.now()+1000).toISOString()});
  assert.equal(state.players[0].x,4);
  c.__tokenMoveOptimisticGuard=new Map([['player-1',{x:4,y:0,at:Date.now(),mapId:'map-1'}]]);
  c.applyTokenRowToLocalState({...row(12,0),rollback:true});
  assert.equal(state.players[0].x,0);assert.equal(c.__tokenMoveOptimisticGuard.size,0);
  state.currentMapId='map-2';c.applyTokenRowToLocalState(row(1,7,'map-2'));
  assert.equal(state.players[0].x,7);assert.equal(c.__tokenRowFreshnessClock.size,2);
});

test('WS and HTTP retry share one dice timeline and one atomic dice-plus-log query', async () => {
  const h=serverHarness(),ctx=h.clients[0].ctx,event={localNonce:'same-roll',sides:20,count:1,rolls:[20],total:20,throwPower:1,fromName:'Player 1'};
  const a=h.context.getDiceReceipt(ctx,event),b=h.context.getDiceReceipt(ctx,{...event,rolls:[1],total:1});
  assert.equal(a,b);assert.equal(a.event.rolls[0],20);
  let release;const query=h.context.pool.query;
  h.context.pool.query=async(...args)=>{await new Promise(resolve=>{release=resolve;});return query(...args);};
  const first=h.context.persistDiceReceipt(ctx,a),retry=h.context.persistDiceReceipt(ctx,b);
  await tick();h.context.publishDiceReceipt(ctx,a,h.clients[0]);h.context.publishDiceReceipt(ctx,b,h.clients[0]);
  assert.equal(h.clients[1].events.filter(e=>e.payload.type==='diceEvent').length,1);
  release();const [one,two]=await Promise.all([first,retry]);assert.deepEqual(one,two);
  assert.equal(h.queries.length,1);assert.match(h.queries[0].sql,/logged as/);
  assert.equal(h.context.getDiceReceipt(h.clients[1].ctx,event)===a,false,'nonces are scoped to the authenticated user');
});

test('failed dice persistence can retry without rerolling or rebroadcasting, and receipts stay bounded', async () => {
  let now=0,attempts=0;const cache=new DiceReceipts({now:()=>now,maxEntries:2,maxBytes:1000,ttlMs:20});
  const receipt=cache.get('r','u','a',()=>({rolls:[17]}));
  await assert.rejects(cache.persist(receipt,async()=>{attempts++;throw Error('offline');}),/offline/);
  assert.deepEqual(await cache.persist(receipt,async()=>{attempts++;return {ok:true};}),{ok:true});
  assert.equal(attempts,2);cache.get('r','u','b',()=>({rolls:[1]}));cache.get('r','u','c',()=>({rolls:[2]}));
  assert.equal(cache.entries.size,2);now=21;cache.get('r','u','d',()=>({rolls:[3]}));assert.equal(cache.entries.size,1);
});

test('dice acknowledgments cancel HTTP fallback; a lost ack or save error retries only once', async () => {
  const timers=new Map();let n=0,fallbacks=0;
  const c=vm.createContext({Map,Set,Date,Number,String,setTimeout:fn=>{timers.set(++n,fn);return n;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(read('client/network/live-room-sync.js'),c);
  const event={localNonce:'roll'};
  c.queueDiceSaveFallback('room',event,()=>{fallbacks++;});
  c.handleDiceSaveReply({type:'diceSaved',roomId:'other',localNonce:'roll'});assert.equal(timers.size,1);
  c.handleDiceSaveReply({type:'diceSaved',roomId:'room',localNonce:'roll',event:{total:17}});
  assert.equal(event.total,17);assert.equal(timers.size,0);assert.equal(fallbacks,0);
  c.queueDiceSaveFallback('room',event,()=>{fallbacks++;});
  c.handleDiceSaveReply({type:'diceSaveError',roomId:'room',localNonce:'roll'});
  c.handleDiceSaveReply({type:'diceSaveError',roomId:'room',localNonce:'roll'});
  assert.equal(fallbacks,1);
  c.queueDiceSaveFallback('room',event,()=>{fallbacks++;});const timeout=[...timers.values()][0];timeout();
  c.handleDiceSaveReply({type:'diceSaved',roomId:'room',localNonce:'roll'});assert.equal(fallbacks,2);
});

test('a slow presence heartbeat cannot delay dice; leaving still fences both lanes', async () => {
  let release;const order=[];
  const scheduler=new WsScheduler(async data=>{
    order.push(data.type);
    if(data.type==='presenceTouch')await new Promise(resolve=>{release=resolve;});
  },error=>{throw error;});
  const presence=scheduler.push({type:'presenceTouch'});await tick();
  await scheduler.push({type:'diceEvent'});assert.deepEqual(order,['presenceTouch','diceEvent']);
  const leave=scheduler.push({type:'leaveRoom'});await tick();assert.ok(!order.includes('leaveRoom'));
  release();await Promise.all([presence,leave]);assert.equal(order.at(-1),'leaveRoom');
});

test('latency summary reports measured p50/p95 and excludes unmeasured peer timestamps', () => {
  const events=[10,20,30,100].map(rttMs=>({kind:'ws:recv',type:'tokenRow',inReplyToType:'moveToken',rttMs}));
  events.push({kind:'ws:recv',type:'tokenRow',rttMs:null});
  const c=vm.createContext({getRealtimeDebugBuffer:()=>events});
  vm.runInContext(functions(read('client/core-helpers-network.js'),['realtimeLatencySummary']),c);
  const summary=c.realtimeLatencySummary();
  assert.equal(summary.moveToken.p50Ms,20);assert.equal(summary.moveToken.p95Ms,100);
  assert.equal(summary.tokenRow.measured,0);assert.equal(summary.tokenRow.p95Ms,null);
});
