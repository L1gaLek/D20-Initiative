const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({pages,screenshotDir})=>{
  const [gm,owner]=pages;
  const picture=async(page,name)=>{if(screenshotDir){fs.mkdirSync(screenshotDir,{recursive:true});await page.screenshot({path:path.join(screenshotDir,name+'.png'),fullPage:false});}};
  const phase=async(page,value)=>page.evaluate(value=>{lastState.phase=value;renderTurnOrderBox(lastState);renderInitiativePlayersBox(lastState);updatePhaseUI(lastState);},value);
  // The viewport is shared geometry, not a per-user cell-size preference.
  const peerLayouts=new Map();
  // CSS viewport equivalents of desktop browser zoom (50/75/125/150/200%),
  // plus short windows: check real panel bounds, not only hidden page overflow.
  for(const [width,height] of [[1920,1080],[1536,864],[1366,768],[1280,720],[1024,768],[390,844],[1280,480],[800,360],[320,568],[2732,1536],[1821,1024],[1093,614],[911,512],[683,384]]){
    for(const page of [gm,owner]){
      await page.setViewportSize({width,height});
      assert.equal(await page.locator('#main-container').evaluate(el=>getComputedStyle(el).display),'flex','production joinedRoom handler uses the room flex layout');
      await page.evaluate(isGm=>{ControlBox?.setViewport?.(isGm?80:5,isGm?5:80);},page===gm);
      let openWidth=0,managementWidth=null;
      for(const value of ['exploration','initiative','combat','exploration']){
        await phase(page,value);
        await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        const layout=await page.evaluate(()=>{const r=id=>{const b=document.getElementById(id).getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom};};return {main:r('main-container'),upper:r('content-row'),map:r('game-container'),wrapper:r('board-wrapper'),footer:r('action-bottom-row'),header:r('status-bar'),left:r('action-log-container'),right:r('combat-side-column'),order:r('turn-order-box'),initiative:r('initiative-players-box'),journal:r('action-log'),dice:r('dice-others'),sideHidden:document.getElementById('combat-side-column').hidden,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight};});
        const label=JSON.stringify({width,height,value,layout});
        const management=await page.locator('#player-management').boundingBox();
        if(managementWidth===null)managementWidth=management.width;else assert.ok(Math.abs(managementWidth-management.width)<1,'management width stays fixed across all phases: '+label);
        const sizeRow=await page.evaluate(()=>{const a=document.querySelector('.pm-size-label').getBoundingClientRect(),b=document.getElementById('player-size').getBoundingClientRect();return {gap:b.x-a.right,width:b.width,dy:Math.abs((a.y+a.height/2)-(b.y+b.height/2))};});
        assert.ok(sizeRow.gap>=0&&sizeRow.gap<=5&&sizeRow.width===80&&sizeRow.dy<1,JSON.stringify(sizeRow));
        const key=[width,height,value].join(':');
        if(page===gm)peerLayouts.set(key,layout);
        else for(const id of ['main','upper','map','wrapper','footer','header','journal','dice']){
          assert.ok(Math.abs(layout[id].w-peerLayouts.get(key)[id].w)<1&&Math.abs(layout[id].h-peerLayouts.get(key)[id].h)<1,'GM/player geometry: '+label);
        }
        assert.ok(layout.main.bottom<=height+1&&layout.footer.bottom<=height+1,label);
        const bounds=await page.evaluate(()=>['status-bar','action-log','dice-others','game-container','board-wrapper','player-management','player-list-container','turn-order-box','initiative-players-box'].map(id=>{const el=document.getElementById(id),r=el.getBoundingClientRect();return {id,visible:!!el.getClientRects().length,x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
        for(const b of bounds.filter(b=>b.visible))assert.ok(b.x>=-1&&b.y>=-1&&b.right<=width+1&&b.bottom<=height+1,JSON.stringify({width,height,value,b}));
        assert.ok(layout.scrollWidth<=width+1&&layout.scrollHeight<=height+1,label);
        assert.ok(Math.abs(layout.footer.bottom-layout.upper.bottom)<1,label);
        if(width>760){assert.ok(Math.abs(layout.journal.h/layout.dice.h-2/3)<.02,label);assert.ok(Math.abs(layout.footer.x-layout.map.x)<1&&Math.abs(layout.footer.right-layout.map.right)<1,label);assert.ok(Math.abs(layout.left.bottom-layout.upper.bottom)<1,label);if(value!=='exploration')assert.ok(Math.abs(layout.right.bottom-layout.upper.bottom)<1,label);if(value==='initiative')assert.ok(Math.abs(layout.order.h/layout.initiative.h-55/45)<.03,label);}
        assert.ok(Math.abs(layout.map.w-layout.wrapper.w)<1,label);
        assert.equal(layout.sideHidden,value==='exploration',label);
        if(value==='exploration'){
          assert.ok(Math.abs(layout.map.right-layout.header.right)<1,label);
          if(openWidth)assert.ok(Math.abs(openWidth-layout.map.w)<1,label);
          openWidth=layout.map.w;
        }else assert.ok(layout.map.w<openWidth-100,label);
        assert.ok(layout.map.h>10&&layout.journal.h>10,label);
        assert.ok(Math.abs(layout.header.bottom-layout.upper.y)<1&&Math.abs(layout.upper.bottom-layout.footer.bottom)<1,'continuous header/workspace/footer: '+label);
        if(width>760){
          assert.ok(Math.abs(layout.journal.bottom-layout.dice.y)<1,'continuous left column: '+label);
          for(const id of ['action-log','dice-others','player-management','player-list-container','turn-order-box'])assert.equal(await page.locator('#'+id).evaluate(el=>getComputedStyle(el).borderRadius),'0px');
        }
        if(page===gm&&width===1366)await picture(page,'fit-'+value);
      }
    }
  }
  for(const page of [gm,owner])await phase(page,'initiative');
  for(const page of [gm,owner]){
    await page.setViewportSize({width:1600,height:1080});
    const dimensions=await page.evaluate(()=>{const r=id=>{const b=document.getElementById(id).getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,bottom:b.bottom};};return {left:r('action-log-container'),map:r('game-container'),right:r('combat-side-column'),journal:r('action-log'),dice:r('dice-others'),bottom:r('action-bottom-row'),controls:r('player-management'),roster:r('player-list-container'),parents:['action-bottom-row','combat-side-column','initiative-players-box'].map(id=>document.getElementById(id).parentElement.id)};});
    assert.deepEqual(dimensions.parents,['content-row','content-row','combat-side-column']);
    assert.ok(Math.abs(dimensions.journal.h/dimensions.dice.h-2/3)<.02,JSON.stringify(dimensions));
    assert.ok(Math.abs(dimensions.bottom.y-dimensions.map.bottom)<1,JSON.stringify(dimensions));
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
  const flow=await gm.evaluate(()=>{const row=document.getElementById('content-row').getBoundingClientRect(),bottom=document.getElementById('action-bottom-row').getBoundingClientRect(),left=document.getElementById('action-log-container').getBoundingClientRect(),right=document.getElementById('combat-side-column').getBoundingClientRect();return {rowBottom:row.bottom,bottomY:bottom.y,leftBottom:left.bottom,rightBottom:right.bottom};});assert.ok(flow.bottomY>=Math.max(flow.leftBottom,flow.rightBottom)-1,JSON.stringify(flow));
  console.log('PASS workspace: actual room-entry handler, 14 viewport/zoom-equivalent sizes for GM/player in all phases, every frame inside the window, continuous seams, central footer, 40/60 left and 55/45 initiative ratios, exploration width, 28+ cards/search/sheet');
};
