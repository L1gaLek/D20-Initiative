const test=require('node:test'),assert=require('node:assert/strict');
const {Coordinator,PREFIX}=require('../client/dice-table/log-timing');
function harness(options={}){
  let now=20000,id=0;const timers=new Map();
  const c=new Coordinator({now:()=>now,setTimer:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;},clearTimer:key=>timers.delete(key),...options});
  return {c,advance:ms=>{now+=ms;for(const [key,t]of [...timers])if(t.at<=now){timers.delete(key);t.fn();}},timers};
}
const text='Альрик: d20 × 1: 17 = 17';
const row=(id,extra={})=>({localNonce:PREFIX+id,text,...extra});
test('a live result is released at settlement, including a late duplicate transport',()=>{
  const {c}=harness();let shown=0;const ticket=c.begin({localNonce:'a'},text);
  assert.equal(c.hold(row('a'),()=>shown++),true);assert.equal(shown,0);
  c.settle(ticket);assert.equal(shown,1);
  assert.equal(c.hold(row('a'),()=>shown++),false); // Existing journal ID dedup handles this echo.
});
test('a log arriving before its dice waits, and starting the throw cancels the lost-event grace timeout',()=>{
  const {c,advance}=harness();let shown=0;
  c.hold(row('a'),()=>shown++);advance(2000);const ticket=c.begin({localNonce:'a'},text);
  advance(3000);assert.equal(shown,0);c.settle(ticket);assert.equal(shown,1);
});
test('identical results with different IDs and out-of-order settlements remain separate',()=>{
  const {c}=harness(),shown=[];
  const a=c.begin({localNonce:'a'},text),b=c.begin({localNonce:'b'},text);
  c.hold(row('a'),()=>shown.push('a'));c.hold(row('b'),()=>shown.push('b'));
  c.settle(b);assert.deepEqual(shown,['b']);c.settle(a);assert.deepEqual(shown,['b','a']);
});
test('ordinary messages and historical dice stay immediate; snapshots defer only already pending rolls',()=>{
  const {c}=harness();let shown=0;
  assert.equal(c.hold({text:'ГМ начал бой'},()=>shown++),false);
  assert.equal(c.hold({text,created_at:'1970-01-01T00:00:00Z'},()=>shown++),false);
  assert.equal(c.hold(row('history'),()=>shown++,{knownOnly:true}),false);
  const ticket=c.begin({localNonce:'pending'},text);
  assert.equal(c.hold({text},()=>shown++,{knownOnly:true}),true);assert.equal(shown,0);c.settle(ticket);assert.equal(shown,1);
});
test('legacy unlinked delivery can precede its event and recognizes zero-bonus/critical spelling variants',()=>{
  const {c}=harness();let shown=0;
  assert.equal(c.hold({text:text.replace('17 =','17+0 =')+' (CRIT)'},()=>shown++),true);
  const ticket=c.begin({localNonce:'legacy'},text+' (КРИТ)');c.settle(ticket);assert.equal(shown,1);
  assert.equal(c.hold(row('legacy'),()=>shown++),false);
});
test('lost visual delivery and a renderer that never finishes cannot hide logs permanently',()=>{
  const {c,advance}=harness();let shown=0;
  c.hold(row('missing'),()=>shown++);advance(3000);assert.equal(shown,1);
  c.begin({localNonce:'stuck'},text);c.hold(row('stuck'),()=>shown++);advance(45000);assert.equal(shown,2);
});
test('room reset drops old callbacks and bounded eviction releases logs without stopping other callbacks',()=>{
  const {c,advance}=harness({maxRecords:2});let shown=0;
  c.begin({localNonce:'a'},text);c.hold(row('a'),()=>{throw Error('broken view');});c.hold(row('a'),()=>shown++);
  c.begin({localNonce:'b'},text);c.begin({localNonce:'c'},text);assert.equal(shown,1);assert.equal(c.records.size,2);
  c.hold(row('c'),()=>shown++);c.reset();advance(50000);assert.equal(shown,1);
});
