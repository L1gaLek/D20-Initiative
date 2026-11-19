const test = require('node:test');
const assert = require('node:assert/strict');
const { serverHarness, clone } = require('./helpers/room-harness.cjs');
const CombatState = require('../backend/shared/combat-state');
let sequence = 0;
function command(h, client, action, extra = {}) {
  const state = h.database();
  return h.context.applyCombatCommand(h.clients[client].ctx, { action, requestId: 'test-' + ++sequence,
    epoch: state.initiativeEpoch, mapId: state.currentMapId, turnEpoch: state.turnEpoch || 0, ...extra });
}
async function ready(h) {
  await Promise.all([0,1,2,3].map(n => command(h,n,'roll',{updates:[{playerId:`player-${n+1}`,total:20-n}]})));
  await command(h,4,'startCombat');
}
test('simultaneous command rolls and manual edits survive stale room and map snapshots', async () => {
  const h = serverHarness(), stale = clone(h.database());
  await ready(h);
  await command(h,4,'manual',{updates:[{playerId:'player-1',total:0}]});
  const saved = clone(h.database());
  await h.context.persistStateForContext(h.clients[4].ctx,stale);
  assert.equal(h.database().players[0].initiative,0);
  assert.equal(h.database().phase,'combat');
  assert.deepEqual(h.database().turnOrder,saved.turnOrder);
  assert.equal(h.database().maps[0].playerStates['player-1'].initiative,0);
  assert.equal(h.database().combatRevision,saved.combatRevision);
});
test('only GM assigns manual initiative and starts combat; owners and delegates can roll', async () => {
  const h = serverHarness();
  await assert.rejects(command(h,0,'manual',{updates:[{playerId:'player-1',total:15}]}),/GM/);
  await assert.rejects(command(h,0,'roll',{updates:[{playerId:'player-2',total:15}]}),/Нет доступных/);
  await assert.rejects(command(h,4,'startCombat'),/всем участникам/);
  await h.context.setTokenAccessForContext(h.clients[0].ctx,'player-1',{action:'controller',targetUserId:'user-2'});
  await command(h,1,'roll',{updates:[{playerId:'player-1',total:-2}]});
  assert.equal(h.database().players[0].initiative,-2);
  await command(h,0,'roll',{updates:[{playerId:'player-1',total:20}]});
  assert.equal(h.database().players[0].initiative,-2,'retries do not reroll');
});
test('turn history crosses rounds, persists, and rewinds exactly to the first turn', async () => {
  const h = serverHarness(); await ready(h);
  const states = [clone(h.database())];
  for (let i=0;i<11;i++) { await command(h,4,'endTurn'); states.push(clone(h.database())); }
  const stale = clone(states[1]);
  await h.context.persistStateForContext(h.clients[4].ctx,stale);
  for (let i=10;i>=0;i--) {
    const before = h.database().turnEpoch;
    await command(h,4,'previousTurn');
    assert.equal(h.database().round,states[i].round);
    assert.equal(h.database().currentTurnIndex,states[i].currentTurnIndex);
    assert.deepEqual(h.database().turnOrder,states[i].turnOrder);
    assert.ok(h.database().turnEpoch>before,'rewind still has a newer version');
  }
  assert.equal(h.database().turnHistory.length,0);
  await assert.rejects(command(h,4,'previousTurn'),/первый ход/);
  await assert.rejects(command(h,0,'previousTurn'),/GM/);
});
test('duplicate commands and simultaneous next-turn clicks advance only once', async () => {
  const h = serverHarness(); await ready(h);
  const state = h.database();
  const request = {action:'endTurn',requestId:'lost-ack',epoch:state.initiativeEpoch,mapId:state.currentMapId,turnEpoch:state.turnEpoch};
  await h.context.applyCombatCommand(h.clients[0].ctx,request);
  await h.context.applyCombatCommand(h.clients[0].ctx,request);
  assert.equal(h.database().currentTurnIndex,1);
  await assert.rejects(h.context.applyCombatCommand(h.clients[4].ctx,{...request,requestId:'double-click'}),/Ход уже изменился/);
  await assert.rejects(command(h,0,'endTurn'),/другого персонажа/);
});
test('new phase invalidates delayed rolls and resets history; map scope is respected', async () => {
  const h = serverHarness(); await ready(h); await command(h,4,'endTurn');
  const epoch = h.database().initiativeEpoch;
  await command(h,4,'startInitiative',{combatantIds:['player-1','player-2']});
  assert.ok(h.database().initiativeEpoch>epoch);
  assert.equal(h.database().turnHistory.length,0);
  assert.equal(h.database().players.filter(p=>p.inCombat).length,2);
  assert.ok(h.database().players.every(p=>!p.hasRolledInitiative));
  await assert.rejects(command(h,0,'roll',{epoch,updates:[{playerId:'player-1',total:17}]}),/изменилась/);
  await assert.rejects(command(h,4,'startInitiative',{epoch,combatantIds:['player-1']}),/изменилась/);
  await assert.rejects(command(h,0,'roll',{mapId:'other-map',updates:[{playerId:'player-1',total:17}]}),/Карта/);
});
test('late joiners and their pending flags return to their previous round when rewinding', async () => {
  const h = serverHarness(); await ready(h);
  await command(h,4,'select',{updates:[{playerId:'player-4',inCombat:false}]});
  for(let i=0;i<4;i++) await command(h,4,'endTurn');
  assert.equal(h.database().turnOrder.length,3);
  await command(h,4,'select',{updates:[{playerId:'player-4',inCombat:true}]});
  for(let i=0;i<3;i++) await command(h,4,'endTurn');
  assert.equal(h.database().turnOrder.length,4);
  await command(h,4,'previousTurn');
  assert.equal(h.database().turnOrder.length,3);
  assert.equal(h.database().players[3].willJoinNextRound,true);
});
test('browser merge protects a newer manual result and inactive-map turn history', () => {
  const h = serverHarness(), current = clone(h.database()), stale = clone(current);
  current.combatRevision=3; current.players[0].initiative=0; current.players[0].hasRolledInitiative=true;
  current.players[0].initiativeRevision=3; current.turnHistory=[{round:1,currentTurnIndex:0,turnOrder:['player-1']}];
  CombatState.syncMap(current);
  CombatState.preserve(stale,current);
  assert.equal(stale.players[0].initiative,0);
  assert.equal(stale.turnHistory.length,1);
  assert.equal(stale.maps[0].turnHistory.length,1);
});
