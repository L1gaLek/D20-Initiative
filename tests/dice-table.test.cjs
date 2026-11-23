const test=require('node:test'),assert=require('node:assert/strict');
const modules=Promise.all([import('../client/dice-table/model.mjs'),import('../client/dice-table/physics.mjs')]);
test('presentation shares one deadline, validates duration and recovers a severely skewed clock',()=>{
  const p=require('../backend/shared/dice-presentation'),timeline=p.create(100000);
  assert.equal(timeline.revealAt-timeline.startAt,p.DURATION);assert.ok(timeline.startAt>=100000+p.LEAD);
  const a=p.read(timeline,100010),b=p.read(timeline,100075);assert.equal(a.revealAt,b.revealAt);
  assert.equal(p.progress(a,a.startAt-1),0);assert.equal(p.progress(a,a.revealAt),1);
  const skew=p.read(timeline,3700000,100000);assert.equal(skew.revealAt-3700000,timeline.revealAt-100000);
  assert.equal(p.read({startAt:1,revealAt:2},100000).authoritative,false);
});
test('standard dice have closed outward-facing convex hulls and the correct number of numbered faces',async()=>{
  const [m]=await modules;
  for(const sides of [2,4,6,8,10,12,20]){
    const p=m.polyhedron(sides);assert.equal(p.eligible.length,sides);assert.deepEqual(p.labels.filter(v=>v!==null).sort((a,b)=>a-b),Array.from({length:sides},(_,i)=>i+1));
    const edges=new Map();for(const f of p.faces){assert.ok(f.normal.reduce((n,x,i)=>n+x*f.center[i],0)>0);for(let i=0;i<f.indices.length;i++){const key=[f.indices[i],f.indices[(i+1)%f.indices.length]].sort((a,b)=>a-b).join(',');edges.set(key,(edges.get(key)||0)+1);}}
    assert.ok([...edges.values()].every(count=>count===2));
    for(const face of p.eligible)for(let value=1;value<=sides;value++){const labels=m.faceLabels(p,face,value);assert.equal(labels[face],String(value));assert.equal(new Set(labels.filter(v=>v!==null)).size,sides);}
  }
});
test('percentile dice preserve 1, 10 and 100 as tens/ones; mixed damage keeps the real die type and fixed bonus',async()=>{
  const [m]=await modules;
  const percentile=m.normalizeEvent({sides:100,rolls:[1,10,100],total:111});
  assert.deepEqual(percentile.dice.map(d=>[d.mode,d.value]),[['tens',10],['ones',1],['tens',1],['ones',10],['tens',10],['ones',10]]);
  const event={fromId:'p',localNonce:'same',sides:6,count:3,rolls:[4,6,2],total:17,bonus:5,kindText:'Урон — Меч: 2d6 [4 + 6]; Огонь: 1d4 [2]; Масло: +5'};
  const mixed=m.normalizeEvent(event);assert.deepEqual(mixed.dice.map(d=>d.sides),[6,6,4]);assert.equal(mixed.total,17);assert.equal(mixed.bonus,5);assert.equal(mixed.seed,m.normalizeEvent({...event,id:'server-id'}).seed);
  assert.equal(m.normalizeEvent({sides:4,rolls:[7],total:7}),null);
  assert.equal(m.normalizeEvent({sides:20,rolls:[],total:3}),null);
  assert.deepEqual(m.normalizeEvent({sides:6,rolls:[4],total:4,damageParts:[null,{type:'dice',rolls:'invalid'}]}).dice.map(d=>d.sides),[6]);
});
test('physics is repeatable, records actual falling and rotation, and settles inside the tray with the requested top values',async()=>{
  const [m,p]=await modules;
  const dice=[4,6,8,10,12,20,2].map((sides,i)=>({sides,value:i+1>sides?1:i+1}));
  const a=p.simulateThrow(dice,'physical-test'),b=p.simulateThrow(dice,'physical-test');
  assert.deepEqual(a.frames,b.frames);assert.deepEqual(a.upFaces,b.upFaces);assert.ok(a.frameCount>40);
  dice.forEach((die,i)=>{
    const last=((a.frameCount-1)*dice.length+i)*7;
    assert.ok(a.frames[i*7+1]>2);assert.ok(a.frames[last+1]>.05&&a.frames[last+1]<1.3);
    assert.ok(Math.abs(a.frames[last])<a.width/2&&Math.abs(a.frames[last+2])<a.depth/2);
    assert.notDeepEqual([...a.frames.slice(i*7+3,i*7+7)],[...a.frames.slice(last+3,last+7)]);
    assert.equal(m.faceLabels(m.polyhedron(die.sides),a.upFaces[i],die.value)[a.upFaces[i]],String(die.value));
  });
});
