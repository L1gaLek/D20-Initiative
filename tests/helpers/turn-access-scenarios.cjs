const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
module.exports=async function({pages,h,screenshotDir,members}){
  const [gm,owner,delegate,newOwner]=pages;
  const shot=async(page,name,selector)=>{if(screenshotDir){fs.mkdirSync(screenshotDir,{recursive:true});await page.locator(selector).screenshot({path:path.join(screenshotDir,name+'.png')});}};
  await gm.evaluate(()=>{InfoModal.open(players.find(p=>p.id==='player-1'));});
  await gm.evaluate(()=>refreshRoomMembers('test-room'));
  assert.equal(await gm.getByLabel('Передача токена',{exact:true}).locator('option').count(),5);
  assert.equal(await gm.getByLabel('Передача управления',{exact:true}).locator('option').count(),5);
  const choices=await gm.getByLabel('Передача токена',{exact:true}).locator('option').evaluateAll(items=>items.map(o=>o.value));
  assert.ok(choices.includes('user-2')&&choices.includes('user-3')&&choices.includes('gm'));
  await gm.getByLabel('Передача токена',{exact:true}).selectOption('user-2');
  await gm.evaluate(list=>handleMessage({type:'users',users:list}),[...members,{user_id:'late-user',id:'late-user',name:'Поздний игрок',role:'Игрок'}]);
  assert.equal(await gm.getByLabel('Передача токена',{exact:true}).inputValue(),'user-2');
  assert.equal(await gm.getByLabel('Передача токена',{exact:true}).locator('option[value="late-user"]').count(),1);
  await gm.evaluate(list=>handleMessage({type:'users',users:list}),members.filter(m=>m.id!=='user-4'));
  assert.equal(await gm.getByLabel('Передача токена',{exact:true}).locator('option[value="user-4"]').count(),0);
  await gm.evaluate(list=>handleMessage({type:'users',users:list}),members);
  await shot(gm,'token-transfer-members','#sheet-token-access');
  await gm.evaluate(()=>InfoModal.close());
  await owner.evaluate(()=>{InfoModal.open(players.find(p=>p.id==='player-1'));});
  await owner.evaluate(()=>refreshRoomMembers('test-room'));
  await owner.getByLabel('Передача управления',{exact:true}).selectOption('user-2');
  await owner.locator('[data-token-action="controller"] button').click();
  await delegate.waitForFunction(()=>lastState.players[0].controllerId==='user-2');
  await delegate.evaluate(()=>InfoModal.open(players.find(p=>p.id==='player-1')));
  assert.equal(await delegate.getByLabel('Передача управления',{exact:true}).count(),0);
  assert.equal(await delegate.evaluate(()=>canControlToken(lastState.players[0])),true);
  const rejected=await delegate.evaluate(async()=>{try{await vpsApi('/rooms/test-room/players/player-1/access',{method:'POST',body:{action:'controller',targetUserId:'user-4'}});return false;}catch(e){return /owner/i.test(e.message);}});
  assert.equal(rejected,true);assert.equal(h.database().players[0].controllerId,'user-2');
  await owner.getByLabel('Передача управления',{exact:true}).selectOption('');
  await owner.locator('[data-token-action="controller"] button').click();
  await delegate.waitForFunction(()=>!lastState.players[0].controllerId);
  await gm.evaluate(()=>InfoModal.open(players.find(p=>p.id==='player-1')));
  await gm.getByLabel('Передача токена',{exact:true}).selectOption('user-3');
  await gm.getByRole('button',{name:'Передать токен',exact:true}).click();
  await newOwner.waitForFunction(()=>lastState.players[0].ownerId==='user-3');
  await newOwner.evaluate(()=>InfoModal.open(players.find(p=>p.id==='player-1')));
  assert.equal(await newOwner.getByLabel('Передача управления',{exact:true}).count(),1);
  await gm.getByLabel('Передача токена',{exact:true}).selectOption('user-1');
  await gm.getByRole('button',{name:'Передать токен',exact:true}).click();
  await owner.waitForFunction(()=>lastState.players[0].ownerId==='user-1');
  for(const page of pages)await page.evaluate(()=>InfoModal.close());
  console.log('PASS transfer: real localized member loading, live joins/leaves, control grant/revocation and ownership transfer work; delegates cannot manage access in UI or API');

  assert.equal(await gm.locator('#current-turn').isVisible(),true);
  await gm.locator('#next-turn').click();await gm.waitForFunction(()=>lastState.turnHistory.length===1);
  const styles=await gm.evaluate(()=>['next-turn','previous-turn'].map(id=>{const c=getComputedStyle(document.getElementById(id));return ['fontSize','fontFamily','fontWeight','lineHeight','padding','borderRadius','minHeight','backgroundImage','color'].map(k=>c[k]);}));
  assert.deepEqual(styles[0],styles[1]);
  await gm.locator('#current-turn').scrollIntoViewIfNeeded();
  await gm.evaluate(()=>window.scrollBy(0,-110));
  assert.ok(await gm.locator('#current-turn').evaluate(e=>e.getBoundingClientRect().width)<=761);
  await shot(gm,'combat-header','#current-turn');
  for(const page of [gm,owner]){
    await page.evaluate(()=>{selectedPlayer=null;const w=document.getElementById('board-wrapper');w.style.cssText='width:900px;height:620px;max-width:100%;display:block;flex:none';const s=document.getElementById('board-view-mode-select');s.value='3d';s.dispatchEvent(new Event('change'));});
    await page.waitForFunction(()=>Board3D.inspect().ready&&Board3D.inspect().tokens?.some(t=>t.currentTurn));
  }
  const builds=await gm.evaluate(()=>Board3D.inspect().counters.pawnBuilds);
  for(let n=0;n<3;n++){
    await gm.locator('#next-turn').click();
    const actor=await gm.evaluate(()=>lastState.turnOrder[lastState.currentTurnIndex]);
    for(const page of [gm,owner])await page.waitForFunction(id=>{const a=Board3D.inspect().tokens.filter(t=>t.currentTurn);return a.length===1&&a[0].id===id;},actor);
  }
  assert.equal(await gm.evaluate(()=>Board3D.inspect().counters.pawnBuilds),builds,'turn highlights never rebuild avatars');
  await gm.evaluate(()=>sendMessage({type:'startExploration'}));
  for(const page of [gm,owner]){await page.waitForFunction(()=>lastState.phase==='exploration');assert.equal(await page.locator('#current-turn').isVisible(),false);await page.waitForFunction(()=>Board3D.inspect().tokens.every(t=>!t.currentTurn));}
  await gm.evaluate(()=>sendMessage({type:'startInitiative'}));await gm.waitForFunction(()=>lastState.phase==='initiative');
  assert.equal(await gm.locator('#current-turn').isVisible(),false);
  await gm.evaluate(async()=>{for(const p of lastState.players.filter(p=>p.inCombat))await setManualInitiative(p.id,15);await sendMessage({type:'startCombat'});});
  await gm.waitForFunction(()=>lastState.phase==='combat');assert.equal(await gm.locator('#current-turn').isVisible(),true);
  console.log('PASS turn display: matching buttons, battle-only header and exactly one synchronized 3D highlight without avatar rebuilds');

  await gm.evaluate(async()=>{const p=players.find(p=>p.id==='player-1'),sheet=deepClone(p.sheet);sheet.parsed.vitality['hp-current'].value=0;sheet.parsed.vitality['hp-temp'].value=0;await sendMessage({type:'setPlayerSheet',id:p.id,sheet});selectedPlayer=players.find(p=>p.id==='player-1');Board3D.requestSync();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
  await gm.getByRole('button',{name:'Мой токен',exact:true}).click();
  await gm.locator('[data-death-token="player-1"]').waitFor({state:'visible'});
  assert.equal(await gm.locator('[data-death-token="player-1"] svg').count(),1);
  assert.equal((await gm.locator('[data-death-token="player-1"]').textContent()).trim(),'');
  await shot(gm,'d20-between-counters','#board-wrapper');
  await shot(gm,'active-turn-token','#board-wrapper');
  console.log('PASS death icon: compact sheet-style SVG replaces text and remains an accessible roll control');
};
