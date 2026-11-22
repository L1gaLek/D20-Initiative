const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {UserProfiles}=require('../backend/shared/user-profiles');
const {serverHarness,initialState,clone}=require('./helpers/room-harness.cjs');
const player=()=>({id:'hero',ownerId:'u',isBase:true,name:'Герой',sheet:{parsed:{info:{race:{value:'Человек'},charClass:{value:'Воин'}},vitality:{'hp-current':{value:12},'hp-max':{value:12},deathSaves:{fail:0}}}}});
test('room time counts the union of tabs, stops on disconnect, and records played race/class',()=>{
  let now=1000;const store=new UserProfiles({now:()=>now}),state={players:[player()]};
  store.connect('tab1','room','u',state);store.connect('tab2','room','u',state);
  now+=30000;store.tick();assert.equal(store.get('u').statistics.roomMs,30000);assert.equal(store.get('u').statistics.visits,1);
  store.disconnect('tab1');now+=10000;store.disconnect('tab2');now+=40000;
  const stats=store.get('u').statistics;assert.equal(stats.roomMs,40000);assert.equal(stats.favoriteRace,'Человек');assert.equal(stats.favoriteClass,'Воин');
});
test('critical records deduplicate relays, split games after inactivity, and count only D20',()=>{
  let now=1;const store=new UserProfiles({now:()=>now});
  const roll=(id,rolls,sides=20)=>store.dice('room','u',{localNonce:id,sides,rolls,total:1},{});
  roll('same',[20,1]);roll('same',[20,1]);roll('again',[20]);roll('otherdie',[1],6);
  let s=store.get('u').statistics;assert.equal(s.rolls,3);assert.equal(s.critical20,2);assert.equal(s.critical1,1);assert.equal(s.maxGame20,2);
  now+=1800001;roll('newgame',[20]);s=store.get('u').statistics;assert.equal(s.critical20,3);assert.equal(s.maxGame20,2);
});
test('damage records sum authorized base rolls within a logical combat turn only',()=>{
  const store=new UserProfiles(),hero=player(),state={players:[hero],phase:'combat',phaseEpoch:1,currentMapId:'a',round:1,currentTurnIndex:0,turnOrder:['hero']};
  const roll=(id,total,allowed=[hero])=>store.dice('r','u',{localNonce:id,actorId:'hero',damageParts:[{type:'flat',value:total}],rolls:[],total},state,allowed);
  roll('a',20);roll('b',15);roll('spoof',100,[]);assert.equal(store.get('u').statistics.maxTurnDamage,35);
  state.round=2;roll('c',12);state.phase='exploration';roll('out',100);
  const s=store.get('u').statistics;assert.equal(s.maxDamage,20);assert.equal(s.maxTurnDamage,35);assert.equal(s.damage,47);
});
test('knockdowns, deaths and stabilizations count transitions, never repeated snapshots',()=>{
  const store=new UserProfiles(),a={players:[player()]},b=clone(a);b.players[0].sheet.parsed.vitality['hp-current'].value=0;
  store.observe('r',a,b);store.observe('r',b,b);const c=clone(b);c.players[0].sheet.parsed.vitality.deathSaves.stabilized=true;store.observe('r',b,c);
  const d=clone(c);d.players[0].sheet.parsed.vitality.deathSaves.fail=3;store.observe('r',c,d);store.observe('r',d,d);
  const s=store.get('u').statistics;assert.equal(s.knockdowns,1);assert.equal(s.deaths,1);assert.equal(s.stabilizations,1);
});
test('profile settings are scoped, validated, and survive an atomic disk reload',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'d20-profiles-')),file=path.join(dir,'profiles.json');
  try{const a=new UserProfiles({file});a.settings('u',{criticalSound:false,volume:25});a.settings('other',{volume:90});
    const b=new UserProfiles({file});assert.equal(b.get('u').settings.volume,25);assert.equal(b.get('other').settings.volume,90);assert.equal(b.get('u').settings.criticalSound,false);
    assert.throws(()=>b.settings('u',{volume:'oops'}),/Invalid/);assert.throws(()=>b.settings('u',{chatSound:'yes'}),/Invalid/);
  }finally{for(const suffix of ['', '.bak','.tmp'])if(fs.existsSync(file+suffix))fs.unlinkSync(file+suffix);fs.rmdirSync(dir);}
});
test('saved-character imports serialize the one-base rule and retry idempotently',async()=>{
  const h=serverHarness(initialState()),ctx=h.clients[1].ctx,saved={id:'save',name:'Заготовка',characterKey:'family',state:{data:{parsed:{name:{value:'Заготовка'}}}}};
  const results=await Promise.allSettled([h.context.addSavedCharacterForContext(ctx,saved,'import-a'),h.context.addSavedCharacterForContext(ctx,saved,'import-b')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected')[0].reason.status,409);
  const base=h.database().players.find(p=>p.isBase&&p.ownerId===ctx.userId);assert.ok(base);assert.equal(base.sheet.characterKey,'family');assert.equal(base.x,null);
  const same=await h.context.addSavedCharacterForContext(ctx,saved,base.savedCharacterRequestId);assert.equal(same.id,base.id);
  await assert.rejects(h.context.addSavedCharacterForContext({...ctx,role:'Spectator'},saved,'blocked'),/role/i);
});
