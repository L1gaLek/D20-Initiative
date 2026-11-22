const {test}=require('node:test');
const assert=require('node:assert/strict');
const create=require('./helpers/character-harness.cjs');
const {CharacterStore}=require('../backend/shared/character-store');
const op=(key,value)=>({path:['parsed',key,'value'],value});
test('personal sheets enforce ownership and validate parsed-only paths',async()=>{
  const h=create();await assert.rejects(h.store.get('user-2','saved-1'),/not found/);
  await assert.rejects(h.store.patch('user-2','saved-1',{ops:[op('notes','hack')],requestId:'bad-owner'}),/not found/);
  for(const path of [['ownerId'],['parsed','__proto__','x']])await assert.rejects(h.store.patch('user-1','saved-1',{ops:[{path,value:1}],requestId:'bad-path'}),/Invalid/);
});
test('warm edits avoid sheet reads and full-state acknowledgements; retries are idempotent',async()=>{
  const h=create();await h.store.get('user-1','saved-1');h.queries.length=0;
  const input={ops:[op('notes','new')],requestId:'once'};
  const result=await h.store.patch('user-1','saved-1',input);
  assert.equal(h.queries.length,1);assert.match(h.queries[0],/^update/);assert.doesNotMatch(h.queries[0],/returning.*state/);
  assert.equal(result.character.state,undefined);
  await h.store.patch('user-1','saved-1',input);assert.equal(h.queries.length,1);
  assert.equal(h.records.get('saved-1').state.data.parsed.notes.value,'new');
});
test('concurrent editors merge different fields and preserve a family when renamed',async()=>{
  const h=create(),other=new CharacterStore(h.pool);
  await Promise.all([h.store.get('user-1','saved-1'),other.get('user-1','saved-1')]);
  await Promise.all([h.store.patch('user-1','saved-1',{ops:[op('notes','kept')],requestId:'notes'}),other.patch('user-1','saved-1',{ops:[op('name','Арвел')],requestId:'rename'})]);
  const row=h.records.get('saved-1');assert.equal(row.name,'Арвел');assert.equal(row.state.data.parsed.notes.value,'kept');assert.equal(row.state.characterKey,'legacy:альрик');
});
test('failed writes retain cached content and can be retried safely',async()=>{
  const h=create();await h.store.get('user-1','saved-1');h.failNext();
  const input={ops:[op('notes','retry')],requestId:'retry'};
  await assert.rejects(h.store.patch('user-1','saved-1',input),/offline/);
  await h.store.patch('user-1','saved-1',input);assert.equal(h.records.get('saved-1').state.data.parsed.notes.value,'retry');
});
test('cache is bounded and stale ownership cannot authorize cached writes',async()=>{
  const h=create(),small=new CharacterStore(h.pool,{maxEntries:1,maxBytes:2000});
  await small.get('user-1','saved-1');await small.get('user-1','saved-2');assert.equal(small.cache.size,1);assert.ok(small.bytes<2000);
  h.records.get('saved-2').user='user-2';
  await assert.rejects(small.patch('user-1','saved-2',{ops:[op('notes','hack')],requestId:'transfer'}),/not found/);
});
test('natural D20 feedback uses each raw die, including initiative and mixed rolls',async()=>{
  const {normalizeEvent}=await import('../client/dice-table/model.mjs');
  const item=normalizeEvent({sides:20,rolls:[20,1,12],total:33,kindText:'Инициатива'});
  assert.deepEqual(item.dice.map(d=>d.critical),['success','failure','']);
  const mixed=normalizeEvent({sides:6,rolls:[20,1],total:21,damageParts:[{type:'dice',sides:20,rolls:[20]},{type:'dice',sides:6,rolls:[1]}]});
  assert.deepEqual(mixed.dice.map(d=>d.critical),['success','']);
  assert.deepEqual(normalizeEvent({sides:100,rolls:[1],total:1}).dice.map(d=>d.critical),['','']);
});
