const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {read,functions,initialState,serverHarness,clone}=require('./helpers/room-harness.cjs');
const installMaps=require('./helpers/map-harness.cjs');
test('actual movement validates the requested map metadata, keeps positions separate and still rejects outside cells',async()=>{
 const state=initialState();Object.assign(state,{phase:'exploration',boardWidth:10,boardHeight:10});state.maps.push({id:'map-2',boardWidth:70,boardHeight:60});
 const h=serverHarness(state),maps=installMaps(h,state),ws=h.clients[4];
 // Simulate a stale/detached snapshot: metadata has 70x60 while room_state says 10x10.
 h.clients.forEach(c=>c.ctx.state.maps[1].boardWidth=10);
 const move=async(mapId,x,y,actor=ws)=>{actor.events.length=0;await h.context.handleMoveToken(actor,{roomId:'test-room',mapId,tokenId:'player-1',x,y,size:1});return actor.events.find(e=>e.payload.type==='error');};
 assert.equal(await move('map-1',2,3),undefined);
 assert.equal(await move('map-2',55,45),undefined);
 assert.equal(await move('map-2',56,45,h.clients[0]),undefined);
 assert.deepEqual([maps.tokens.get('map-1::player-1').x,maps.tokens.get('map-2::player-1').x],[2,56]);
 assert.match((await move('map-2',70,45)).payload.message,/outside the board/);
 assert.match((await move('map-1',12,3)).payload.message,/outside the board/);
 assert.equal(maps.tokens.get('map-2::player-1').x,56);
});
function fogHarness(){
 const sent=[],timers=new Map();let n=0;
 const c=vm.createContext({window:{},currentRoomId:'test-room',myRole:'GM',console,Uint8Array,atob,btoa,Promise,setTimeout:fn=>{timers.set(++n,fn);return n;},clearTimeout:id=>timers.delete(id),sendMessage:m=>sent.push(clone(m))});
 vm.runInContext(read('client/board-fog.js'),c);return {c,fog:c.window.FogWar,sent,timers};
}
test('same-size maps with equal stamp counts keep distinct manual and explored fog, including delayed exploration',async()=>{
 const {fog,sent,timers}=fogHarness();
 const make=(id,x)=>({currentMapId:id,boardWidth:12,boardHeight:12,players:[],fog:{enabled:true,mode:'dynamic',manualBase:'hide',manualStamps:[{x,y:2,r:1,mode:'reveal'}],explored:[x+',4']}});
 const a=make('map-a',2),b=make('map-b',8);
 fog._setMapState(a);fog._syncManualFromState();fog._syncExploredFromState();fog._dynVisible=new Uint8Array(144).fill(1);fog._dynKey='cached';
 fog._exploredDelta=new Set(['3,4']);fog._scheduleExploredSync();
 fog._setMapState(b);fog._syncManualFromState();fog._syncExploredFromState();
 await Promise.resolve();assert.deepEqual(sent,[{type:'fogAddExplored',mapId:'map-a',cells:['3,4']}]);assert.equal(timers.size,0);
 assert.equal(fog._manualGrid[2*12+2],0);assert.equal(fog._manualGrid[2*12+8],1);
 assert.equal(fog._isExplored(2,4),false);assert.equal(fog._isExplored(8,4),true);assert.equal(fog._dynVisible,null);
 fog._setMapState(a);fog._syncManualFromState();fog._syncExploredFromState();assert.equal(fog._manualGrid[26],1);assert.equal(fog._isExplored(8,4),false);
});
test('coalesced fog writes retain the latest row for every map and room',()=>{
 const writes=[],timers=[];
 const c=vm.createContext({Map,JSON,Number,String,currentRoomId:'room',console,publishFogPreview:()=> 'preview',setTimeout:fn=>{timers.push(fn);return 1;},buildDetachedFogRow:(room_id,map_id,fog)=>({room_id,map_id,...fog}),sendWsEnvelope:msg=>writes.push(clone(msg)),_cacheUpsertFogRow(){},_refreshDetachedRoomView(){}});
 vm.runInContext('let __pendingFogTimer=null;const __pendingFogRows=new Map();'+functions(read('client/core-helpers-network.js'),['scheduleRoomFogUpsert']),c);
 c.scheduleRoomFogUpsert('room','a',{n:1});c.scheduleRoomFogUpsert('room','b',{n:2});c.scheduleRoomFogUpsert('room','a',{n:3});timers.shift()();
 assert.deepEqual(writes.map(w=>[w.row.map_id,w.row.n]),[['a',3],['b',2]]);
});
test('switching maps clears old coordinates before fog can explore the new map and restores only the target cache',()=>{
 const c=vm.createContext({window:{},crypto:{randomUUID:()=> 'section'},deepClone:clone,getTokenSnapshotCached:(id,map)=>map==='a'?{x:3,y:4}:null});
 vm.runInContext(read('client/network/room-state-maps.js'),c);
 const state={currentMapId:'a',maps:[{id:'a'},{id:'b'}],mapSections:[{id:'section'}],players:[{id:'player',x:3,y:4}]};
 c.loadMapToRoot(state,'b');assert.equal(state.players[0].x,null);assert.equal(state.players[0].y,null);
 c.loadMapToRoot(state,'a');assert.equal(state.players[0].x,3);assert.equal(state.players[0].y,4);
});
