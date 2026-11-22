const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({pages,screenshotDir})=>{
  const [gm,owner]=pages;
  const picture=async(page,name)=>{if(screenshotDir){fs.mkdirSync(screenshotDir,{recursive:true});await page.screenshot({path:path.join(screenshotDir,name+'.png'),fullPage:false});}};
  for(const page of [gm,owner]){
    await page.setViewportSize({width:1600,height:1080});
    const dimensions=await page.evaluate(()=>{const r=id=>{const b=document.getElementById(id).getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,bottom:b.bottom};};return {left:r('action-log-container'),map:r('game-container'),right:r('combat-side-column'),journal:r('action-log'),dice:r('dice-others'),bottom:r('action-bottom-row'),controls:r('player-management'),roster:r('player-list-container'),parents:['action-bottom-row','combat-side-column','initiative-players-box'].map(id=>document.getElementById(id).parentElement.id)};});
    assert.deepEqual(dimensions.parents,['main-container','content-row','combat-side-column']);
    assert.ok(Math.abs(dimensions.journal.h-dimensions.dice.h)<1,JSON.stringify(dimensions));
    assert.ok(dimensions.bottom.y>=Math.max(dimensions.left.bottom,dimensions.map.bottom,dimensions.right.bottom)-1,JSON.stringify(dimensions));
    assert.ok(dimensions.roster.w>dimensions.controls.w*2);assert.ok(dimensions.controls.w<=300);
    assert.equal(await page.locator('#main-container').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
  }
  await gm.evaluate(()=>{const extra=[];for(let i=0;i<24;i++)extra.push({...players[i%4],id:'roster-'+i,name:'Спутник '+i,isBase:false,x:null,y:null});players.push(...extra);lastState.players=players;updatePlayerList();lastState.log=['Группа собралась в таверне.','Альрик: Проверка Внимательности: 17 + 3 = 20','Сари открыла древний сундук.'];renderLog(lastState.log);});
  await gm.locator('#player-tab-all').click();assert.equal(await gm.locator('#player-tab-all').getAttribute('aria-selected'),'true');
  assert.ok(await gm.locator('#player-list [data-player-id]').count()>=28);
  const first=await gm.locator('#player-list [data-player-id]').nth(0).boundingBox(),second=await gm.locator('#player-list [data-player-id]').nth(1).boundingBox();
  assert.ok(second.x>first.x,'cards run horizontally');
  await gm.locator('#player-search').fill('Спутник 17');await gm.waitForFunction(()=>document.querySelectorAll('#player-list [data-player-id]').length===1);
  assert.equal(await gm.locator('#player-list [data-player-id]').getAttribute('data-player-id'),'roster-17');
  await gm.locator('#player-search').fill('user-2');await gm.waitForFunction(()=>document.querySelectorAll('#player-list [data-player-id]').length>1);
  const owners=await gm.locator('#player-list .owner-name').allTextContents();assert.deepEqual(owners,['user-2']);
  await gm.locator('#player-search').fill('ничего-не-найти');await gm.locator('.roster-empty').waitFor();
  await gm.locator('#player-search').fill('');await gm.locator('#player-tab-mine').click();await gm.waitForFunction(()=>!document.querySelector('.roster-empty'));
  await gm.locator('#player-tab-all').click();await picture(gm,'workspace-desktop');
  if(screenshotDir)await gm.locator('#action-bottom-row').screenshot({path:path.join(screenshotDir,'workspace-roster.png')});
  await owner.locator('#player-tab-mine').click();await owner.locator('#player-list [data-player-id="player-1"] .sheet-btn').click();
  await owner.locator('#sheet-modal').waitFor({state:'visible'});assert.equal(await owner.locator('.sheet-tab').count(),9);await owner.locator('#sheet-close').click();
  // Resizing keeps all three panes and the lower row within the room.
  await gm.setViewportSize({width:1100,height:900});await picture(gm,'workspace-laptop');
  assert.equal(await gm.locator('#main-container').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
  await gm.setViewportSize({width:390,height:844});await picture(gm,'workspace-mobile');
  assert.equal(await gm.locator('#main-container').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
  await gm.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const j=await gm.locator('#action-log').boundingBox(),d=await gm.locator('#dice-others').boundingBox();assert.ok(Math.abs(j.height-d.height)<1,JSON.stringify({j,d}));
  const flow=await gm.evaluate(()=>{const row=document.getElementById('content-row').getBoundingClientRect(),bottom=document.getElementById('action-bottom-row').getBoundingClientRect(),left=document.getElementById('action-log-container').getBoundingClientRect(),right=document.getElementById('combat-side-column').getBoundingClientRect();return {rowBottom:row.bottom,bottomY:bottom.y,leftBottom:left.bottom,rightBottom:right.bottom};});assert.ok(flow.bottomY>=Math.max(flow.rowBottom,flow.leftBottom,flow.rightBottom)-1,JSON.stringify(flow));
  console.log('PASS workspace: lower controls/large horizontal roster span all panes, equal journal/tray heights, 28+ cards, All/Mine/search by owner/name, empty state, intact sheet, laptop/mobile fit');
};
