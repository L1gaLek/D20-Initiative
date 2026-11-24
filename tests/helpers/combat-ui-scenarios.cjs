const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
module.exports = async function({pages,h,broadcast,clone,screenshotDir,dropNextCombatAck}) {
  const [gm,p1,p2] = pages;
  await gm.locator('.initiative-value-input[data-player-id="player-1"]').fill('0');
  await gm.locator('.initiative-value-input[data-player-id="player-1"]').press('Enter');
  for (const page of pages) await page.waitForFunction(() => lastState.players[0].initiative === 0);
  assert.equal(await p1.locator('.initiative-value-input').count(),0);
  assert.equal(await p1.locator('#previous-turn').isVisible(),false);
  for(let i=0;i<6;i++) {
    await gm.locator('#next-turn').click();
    for (const page of pages) await page.waitForFunction(n => lastState.turnHistory.length === n,i+1);
  }
  assert.equal(h.database().round,2);
  for(let i=5;i>=0;i--) {
    await gm.locator('#previous-turn').click();
    for (const page of pages) await page.waitForFunction(n => lastState.turnHistory.length === n,i);
  }
  assert.equal(h.database().round,1); assert.equal(h.database().currentTurnIndex,0);
  assert.equal(await gm.locator('#previous-turn').isDisabled(),true);
  dropNextCombatAck();
  await gm.evaluate(()=>sendMessage({type:'endTurn'}));
  assert.equal(h.database().turnHistory.length,1,'HTTP fallback after lost WS ack does not double-advance');
  await gm.locator('#previous-turn').click();
  await gm.waitForFunction(()=>lastState.turnHistory.length===0);
  console.log('PASS: lost WS acknowledgment falls back to HTTP without repeating a turn');
  const turnBefore=clone(h.database());
  await gm.evaluate(()=>{lastState.turnEpoch-=1;});
  await gm.locator('#next-turn').click();
  await gm.waitForFunction(epoch=>lastState.turnEpoch===epoch,turnBefore.turnEpoch);
  assert.equal(h.database().turnHistory.length,0,'a stale click repairs the browser without advancing');
  await gm.evaluate(()=>{lastState.phaseEpoch+=60000;});
  await p1.evaluate(()=>{window.__lastWsRoomEventSeq.set(currentRoomId,{seq:999999,epoch:'previous-server'});});
  await gm.locator('#next-turn').click();
  for(const page of pages)await page.waitForFunction(()=>lastState.turnHistory.length===1);
  await gm.locator('#previous-turn').click();
  for(const page of pages)await page.waitForFunction(()=>lastState.turnHistory.length===0);
  console.log('PASS: stale turn rejection self-recovers; skewed browser clocks and old server counters cannot freeze turn updates');
  console.log('PASS: GM edits initiative including zero; every browser advances and rewinds through round boundaries to first turn');
  await gm.evaluate(() => sendMessage({type:'startInitiative'}));
  for(const page of pages) await page.waitForFunction(() => lastState.phase==='initiative' && !lastState.players[0].hasRolledInitiative);
  assert.equal(await gm.locator('#turn-order-start-combat').isVisible(),false);
  for(const p of h.database().players.filter(p=>p.inCombat)) {
    const input=gm.locator(`.initiative-value-input[data-player-id="${p.id}"]`);
    await input.fill('15'); await input.press('Enter');
    await gm.waitForFunction(id => lastState.players.find(p=>p.id===id).hasRolledInitiative,p.id);
  }
  await gm.locator('#turn-order-start-combat').waitFor({state:'visible'});
  assert.equal(await p1.locator('#turn-order-start-combat').isVisible(),false);
  if(screenshotDir) {fs.mkdirSync(screenshotDir,{recursive:true});await gm.locator('#turn-order-box').screenshot({path:path.join(screenshotDir,'combat-initiative.png')});}
  await gm.locator('#turn-order-start-combat').click();
  for (const page of pages) await page.waitForFunction(()=>lastState.phase==='combat');
  console.log('PASS: new initiative clears old rolls; manual assignments reveal the GM-only combat button inside the roster');
  // Use the actual sheet update path, followed by the shared 3D renderer.
  await gm.evaluate(async()=>{
    const wrapper=document.getElementById('board-wrapper');wrapper.style.cssText='width:100%;height:620px;max-width:100%;max-height:620px;display:block;flex:none';
    const p=lastState.players[0],sheet=deepClone(p.sheet);
    sheet.parsed.vitality={'hp-max':{value:30},'hp-current':{value:18},'hp-temp':{value:5}};
    sheet.parsed.conditionsList=['Отравленное','Испуганное'];
    sheet.parsed.info={...(sheet.parsed.info||{}),race:{value:'Человек'},gender:{value:'Мужской'}};
    await sendMessage({type:'setPlayerSheet',id:p.id,sheet});
    const select=document.getElementById('board-view-mode-select');select.value='3d';select.dispatchEvent(new Event('change'));
  });
  await gm.waitForFunction(()=>Board3D.inspect().tokens?.find(t=>t.id==='player-1')?.hud?.health?.hpCur===18);
  await gm.locator('#board-3d-root button').filter({hasText:'Мой токен'}).click();
  await gm.evaluate(async()=>{selectedPlayer=players.find(p=>p.id==='player-1');Board3D.requestSync();
    await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
  await gm.getByRole('button',{name:'Мой токен',exact:true}).click();
  await gm.waitForFunction(()=>{const s=Board3D.inspect(); return Math.hypot(...s.camera.map((n,i)=>n-s.target[i]))<6.1;});
  const first=await gm.evaluate(()=>Board3D.inspect());
  const pawn=first.tokens.find(t=>t.id==='player-1');
  assert.deepEqual(pawn.hud.conditions,['Отравленное','Испуганное']);
  assert.equal(pawn.hud.health.hpTemp,5);
  await gm.evaluate(async()=>{
    const p=lastState.players[0],sheet=deepClone(p.sheet);sheet.parsed.vitality['hp-current'].value=9;
    sheet.parsed.conditionsList=['Отравленное'];await sendMessage({type:'setPlayerSheet',id:p.id,sheet});
  });
  await gm.waitForFunction(()=>Board3D.inspect().tokens.find(t=>t.id==='player-1')?.hud?.health?.hpCur===9);
  const second=await gm.evaluate(()=>Board3D.inspect());
  assert.equal(second.counters.pawnBuilds,first.counters.pawnBuilds,'HP and condition changes do not rebuild 3D geometry');
  if(screenshotDir) await gm.locator('#board-wrapper').screenshot({path:path.join(screenshotDir,'combat-health-3d.png')});
  console.log('PASS: 3D health, temporary health and condition names update without rebuilding token meshes');
  await gm.evaluate(()=>{const select=document.getElementById('board-view-mode-select');select.value='2d';select.dispatchEvent(new Event('change'));});
};
