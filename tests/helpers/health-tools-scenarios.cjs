const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
module.exports=async function({pages,h,clone,screenshotDir,requests}){
  const [gm,owner,other]=pages;
  const image=async(page,name,selector='#board-wrapper')=>{if(screenshotDir){fs.mkdirSync(screenshotDir,{recursive:true});await page.locator(selector).screenshot({path:path.join(screenshotDir,name+'.png')});}};
  for(const page of [gm,owner]){
    await page.locator('#gm-quick-tools').click();
    await page.locator('#gm-panel-tools').waitFor({state:'visible'});
    assert.equal(await page.locator('#gm-panel-tools #marks-toolbar').count(),1);
    assert.equal(await page.locator('#board-topbar #marks-toolbar').count(),0);
  }
  assert.equal(await gm.locator('[data-gm-map-tool]:visible').count(),2);
  assert.equal(await owner.locator('[data-gm-map-tool]:visible').count(),0);
  await image(owner,'tools-player','#gm-panel-tools');
  await owner.locator('#marks-toolbar [data-tool="circle"]').click();
  assert.equal(await owner.locator('#marks-enabled').isChecked(),true);
  await owner.evaluate(()=>applyRoleToUI());
  assert.equal(await owner.locator('#gm-panel-tools').isVisible(),true,'room refresh keeps the player panel open');
  await gm.locator('#map-tools-walls > summary').click();
  await gm.locator('#edit-environment').click();
  assert.equal(await gm.locator('#edit-environment').evaluate(e=>e.classList.contains('is-on')),true);
  await gm.locator('#marks-toolbar [data-tool="rect"]').click();
  assert.equal(await gm.locator('#marks-enabled').isChecked(),true);
  assert.equal(await gm.locator('#edit-environment').evaluate(e=>e.classList.contains('is-on')),false,'area drawing turns wall editing off');
  await gm.locator('#map-tools-fog > summary').click();
  await image(gm,'tools-gm','#gm-panel-tools');
  for(const page of [gm,owner])await page.evaluate(()=>{document.getElementById('marks-enabled').checked=false;document.getElementById('marks-enabled').dispatchEvent(new Event('change',{bubbles:true}));setActiveGmQuickPanel('');});
  await owner.setViewportSize({width:420,height:900});await owner.locator('#gm-quick-tools').click();
  assert.equal(await owner.locator('#gm-panel-tools').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
  await image(owner,'tools-player-mobile','#gm-panel-tools');
  await owner.evaluate(()=>setActiveGmQuickPanel(''));await owner.setViewportSize({width:1440,height:1000});
  console.log('PASS map tools: GM and players share areas; private wall/fog sections stay hidden, tools do not conflict, live updates keep panels open and mobile layout fits');

  async function setHealth(cur,temp=0,ds={success:0,fail:0,stabilized:false,lastRoll:null}){
    await gm.evaluate(async({cur,temp,ds})=>{
      const p=players.find(p=>p.id==='player-1'),sheet=deepClone(p.sheet);
      sheet.parsed.vitality['hp-current'].value=cur;sheet.parsed.vitality['hp-temp'].value=temp;sheet.parsed.vitality.deathSaves=ds;
      await sendMessage({type:'setPlayerSheet',id:p.id,sheet});
    },{cur,temp,ds});
    for(const page of [gm,owner,other])await page.waitForFunction(({cur,temp})=>{const v=lastState.players[0].sheet.parsed.vitality;return Number(v['hp-current'].value)===cur&&Number(v['hp-temp'].value)===temp;},{cur,temp});
  }
  async function view(page){
    await page.evaluate(()=>{const wrapper=document.getElementById('board-wrapper');wrapper.style.cssText='width:900px;height:620px;max-width:100%;display:block;flex:none';const s=document.getElementById('board-view-mode-select');s.value='3d';s.dispatchEvent(new Event('change'));selectedPlayer=players.find(p=>p.id==='player-1');Board3D.requestSync();});
    await page.waitForFunction(()=>Board3D.inspect().tokens?.find(t=>t.id==='player-1')?.hud);
    await page.getByRole('button',{name:'Мой токен',exact:true}).click();
    await page.waitForFunction(()=>{const s=Board3D.inspect();return Math.hypot(...s.camera.map((v,i)=>v-s.target[i]))<6.1;});
  }
  await setHealth(18,5);
  for(const page of [gm,owner,other])await view(page);
  assert.equal(await owner.evaluate(()=>Board3D.inspect().tokens.find(t=>t.id==='player-1').hud.life.text),'5 (18/30)');
  await image(owner,'health-temp-3d');
  await setHealth(-2);
  await owner.locator('[data-death-token="player-1"]').waitFor({state:'visible'});
  assert.equal(await other.locator('[data-death-token="player-1"]').count(),0);
  const before=requests.length;await other.evaluate(()=>InfoModal.rollDeathSave('player-1'));assert.equal(requests.length,before);
  async function roll(value){
    await owner.evaluate(value=>{window.__testRollDieOriginal||=rollDie;rollDie=()=>value;},value);
    await owner.locator('[data-death-token="player-1"]').click();
    for(const page of [gm,owner,other])await page.waitForFunction(value=>lastState.players[0].sheet.parsed.vitality.deathSaves.lastRoll===value||value===20&&Number(lastState.players[0].sheet.parsed.vitality['hp-current'].value)===1,value);
    await owner.waitForFunction(()=>!InfoModal.isDeathSavePending('player-1'));
  }
  await roll(9);
  assert.equal(h.database().players[0].sheet.parsed.vitality.deathSaves.fail,1);
  assert.match(await other.evaluate(()=>Board3D.inspect().tokens.find(t=>t.id==='player-1').hud.life.result),/9 < 10/);
  await roll(10);assert.equal(h.database().players[0].sheet.parsed.vitality.deathSaves.success,1);
  await image(owner,'health-death-roll-3d');
  await roll(12);await roll(14);
  for(const page of [gm,owner,other])await page.waitForFunction(()=>Board3D.inspect().tokens.find(t=>t.id==='player-1').hud.life.mode==='stable');
  assert.equal(await owner.locator('[data-death-token="player-1"]').count(),0);
  await image(owner,'health-stabilized-3d');
  await setHealth(-1);await roll(1);assert.equal(h.database().players[0].sheet.parsed.vitality.deathSaves.fail,2);
  await roll(9);
  await owner.waitForFunction(()=>Board3D.inspect().tokens.find(t=>t.id==='player-1').hud.life.mode==='dead');
  assert.equal(await owner.locator('[data-death-token="player-1"]').count(),0);
  await image(owner,'health-dead-3d');
  await setHealth(0);await roll(20);
  await owner.waitForFunction(()=>Board3D.inspect().tokens.find(t=>t.id==='player-1').hud.life.mode==='health');
  assert.equal(h.database().players[0].sheet.parsed.vitality['hp-current'].value,1);
  assert.ok(requests.some(r=>r.data?.event?.kindText?.includes('Спасбросок от смерти')),'rolls use the real shared dice/log transport');
  await owner.evaluate(()=>{rollDie=window.__testRollDieOriginal;});
  console.log('PASS death saves: real token buttons and shared dice/log transport synchronize 9/10, natural 1/20, stabilization, death and healing across three browsers; non-owners cannot roll');

  await gm.evaluate(()=>sendMessage({type:'startInitiative'}));
  await gm.waitForFunction(()=>lastState.phase==='initiative');
  await gm.evaluate(async()=>{for(const p of lastState.players.filter(p=>p.inCombat))await setManualInitiative(p.id,15);});
  await gm.locator('#turn-order-start-combat').waitFor({state:'visible'});
  assert.equal(await gm.locator('#turn-order-start-combat').evaluate(e=>!!(e.compareDocumentPosition(document.getElementById('turn-order-list'))&Node.DOCUMENT_POSITION_FOLLOWING)),true);
  assert.equal(await gm.locator('#turn-order-start-combat').evaluate(e=>getComputedStyle(e).animationName),'combat-ready-outline');
  assert.equal(await owner.locator('#turn-order-start-combat').isVisible(),false);
  await image(gm,'initiative-ready-top','#turn-order-box');
  console.log('PASS combat readiness: GM-only sword button is above the roster with an animated outline');
};
