const test=require('node:test'),assert=require('node:assert/strict');
const Health=require('../client/token-health');
const sheet=(cur=0,temp=0)=>({vitality:{'hp-max':{value:30},'hp-current':{value:cur},'hp-temp':{value:temp},deathSaves:{success:0,fail:0,stabilized:false,lastRoll:null}}});
test('temporary HP replaces the fill and precedes real HP in parentheses',()=>{
  const state=Health.describe(sheet(18,5));assert.equal(state.text,'5 (18/30)');assert.equal(state.color,'#004a6b');assert.equal(state.ratio,1);
  assert.equal(Health.describe(sheet(18)).text,'18/30');
});
test('zero and negative HP require death saves; 9 fails and 10 succeeds',()=>{
  for(const cur of [0,-3]){
    const s=sheet(cur);assert.equal(Health.describe(s).mode,'dying');
    Health.applyRoll(s,9);assert.equal(s.vitality.deathSaves.fail,1);assert.match(Health.describe(s).result,/9 < 10/);
    Health.applyRoll(s,10);assert.equal(s.vitality.deathSaves.success,1);assert.match(Health.describe(s).result,/10 ≥ 10/);
  }
});
test('three successes stabilize, three failures kill, and terminal states prevent further rolls',()=>{
  const stable=sheet();for(const n of [10,14,16])Health.applyRoll(stable,n);
  assert.equal(Health.describe(stable).mode,'stable');assert.equal(Health.describe(stable).text,'Стабилизирован');
  const before=JSON.stringify(stable);assert.equal(Health.applyRoll(stable,1).outcome,'inactive');assert.equal(JSON.stringify(stable),before);
  const dead=sheet(-1);for(const n of [9,3,5])Health.applyRoll(dead,n);
  assert.equal(Health.describe(dead).mode,'dead');assert.equal(Health.applyRoll(dead,20).outcome,'inactive');
});
test('natural 1 gives two failures, natural 20 restores 1 HP, and healing ends death saves',()=>{
  const s=sheet(-7);Health.applyRoll(s,1);assert.equal(s.vitality.deathSaves.fail,2);assert.match(Health.describe(s).result,/два провала/);
  Health.applyRoll(s,20);assert.equal(s.vitality['hp-current'].value,1);assert.equal(s.vitality.deathSaves.fail,0);assert.equal(Health.describe(s).mode,'health');
  assert.equal(Health.applyRoll(s,1).outcome,'inactive');
});
test('saved counters and last roll survive JSON export, with explicit stabilization recognized',()=>{
  const s=sheet();Health.applyRoll(s,11);const restored=JSON.parse(JSON.stringify(s));
  assert.equal(Health.describe(restored).success,1);assert.equal(Health.describe(restored).lastRoll,11);
  restored.vitality.deathSaves.stabilized=true;assert.equal(Health.describe(restored).mode,'stable');
  assert.equal(Health.describe({}).mode,'health');
});
