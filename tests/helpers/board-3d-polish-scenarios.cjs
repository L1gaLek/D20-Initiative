const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async function ({ gm, screenshotDir }) {
  const canvas=gm.locator('.board-3d-canvas');
  const buttons=gm.locator('.board-3d-toolbar');
  await buttons.getByRole('button',{name:'Обзор',exact:true}).click(); await gm.waitForTimeout(650);
  await gm.evaluate(()=>{selectedPlayer=null;Board3D.requestSync();});
  await gm.waitForTimeout(100);
  assert.match(await gm.locator('#board-wrapper').evaluate(el=>{el.style.overflow='auto';return getComputedStyle(el).overflow;}),/hidden|clip/);
  // A late viewport-size change must not bring back native scrolling in 3D.
  await gm.setViewportSize({width:1400,height:980}); await gm.setViewportSize({width:1440,height:1000});
  assert.match(await gm.locator('#board-wrapper').evaluate(el=>getComputedStyle(el).overflow),/hidden|clip/);
  await gm.locator('#board-wrapper').scrollIntoViewIfNeeded();
  const known=await gm.evaluate(()=>Board3D.projectCell(8.5,8.5));
  await gm.mouse.move(known.x,known.y); await gm.waitForFunction(()=>Board3D.inspect().hover);
  const before=await gm.evaluate(()=>Board3D.inspect());
  for(let i=0;i<20;i++) await gm.mouse.move(known.x+i,known.y+i/2);
  await gm.waitForTimeout(100);
  const after=await gm.evaluate(()=>Board3D.inspect());
  assert.equal(after.counters.pawnBuilds,before.counters.pawnBuilds);
  assert.equal(after.counters.terrainBuilds,before.counters.terrainBuilds);
  assert.ok(after.counters.syncs-before.counters.syncs<=1,'ordinary hover does not scan/rebuild the board');
  assert.ok(after.render.calls<45,`merged figures should need fewer draws: ${after.render.calls}`);
  await gm.mouse.move(1100,300); await gm.waitForTimeout(300);
  const idle=await gm.evaluate(()=>Board3D.inspect().counters.frames); await gm.waitForTimeout(200);
  assert.ok(await gm.evaluate(()=>Board3D.inspect().counters.frames)-idle<=1,'a still board without fog sleeps');
  // The new grid is independent of the shared 2D opacity and is actually drawn.
  await gm.evaluate(()=>{lastState.gridAlpha=0;Board3D.requestSync();}); await gm.waitForTimeout(80);
  const gridOn=await canvas.screenshot();
  await buttons.getByRole('button',{name:'Сетка',exact:true}).click();
  assert.equal(await gm.evaluate(()=>Board3D.inspect().grid),false);
  const gridOff=await canvas.screenshot(); assert.notDeepEqual(gridOn,gridOff);
  await buttons.getByRole('button',{name:'Сетка',exact:true}).click();
  assert.equal(await gm.evaluate(()=>lastState.gridAlpha),0);
  console.log('PASS 3D polish: no scrollbars after resizing; visible grid/hover at zero 2D opacity; hover avoids scene rebuilds and a still board sleeps');

  // Real pointer gestures verify screen-plane translation, including height,
  // while a long drag cannot move any token or draw a wall/mark.
  const box=await canvas.boundingBox(), x=box.x+box.width*.48,y=box.y+box.height*.6;
  const panBefore=await gm.evaluate(()=>Board3D.inspect());
  await gm.mouse.move(x,y); await gm.mouse.down({button:'middle'});
  assert.match(await canvas.evaluate(el=>getComputedStyle(el).cursor),/grabbing.svg/);
  await gm.mouse.move(x+60,y-55,{steps:8}); await gm.waitForTimeout(120);
  const panDuring=await gm.evaluate(()=>Board3D.inspect());
  assert.ok(Math.abs(panDuring.target[1]-panBefore.target[1])>.1,'pan uses camera Up rather than restricting movement to ground');
  assert.deepEqual(panDuring.tokens,panBefore.tokens);
  const delta=panDuring.target.map((v,i)=>v-panBefore.target[i]);
  const cameraDelta=panDuring.camera.map((v,i)=>v-panBefore.camera[i]);
  assert.ok(delta.every((v,i)=>Math.abs(v-cameraDelta[i])<.05),'eye and target translate together');
  await gm.mouse.up({button:'middle'}); await gm.waitForTimeout(250);
  const settled=await gm.evaluate(()=>Board3D.inspect()); await gm.waitForTimeout(150);
  const stopped=await gm.evaluate(()=>Board3D.inspect());
  assert.ok(stopped.target.every((v,i)=>Math.abs(v-settled.target[i])<.01),'short smoothing finishes promptly after release');
  assert.equal(await canvas.getAttribute('data-cursor'),null);
  await buttons.getByRole('button',{name:'Обзор',exact:true}).click(); await gm.waitForTimeout(650);
  const select=await gm.evaluate(()=>Board3D.projectToken('player-1'));
  await gm.mouse.move(select.x,select.y); await gm.waitForFunction(()=>document.querySelector('.board-3d-canvas').dataset.cursor==='select');
  assert.match(await canvas.evaluate(el=>getComputedStyle(el).cursor),/select.svg/);
  await gm.mouse.down();assert.match(await canvas.evaluate(el=>getComputedStyle(el).cursor),/pressed.svg/);await gm.mouse.up();
  const move=await gm.evaluate(()=>Board3D.projectCell(8.5,8.5));await gm.mouse.move(move.x,move.y);
  await gm.waitForFunction(()=>document.querySelector('.board-3d-canvas').dataset.cursor==='move');
  assert.match(await canvas.evaluate(el=>getComputedStyle(el).cursor),/move.svg/);
  await gm.mouse.down({button:'right'});assert.match(await canvas.evaluate(el=>getComputedStyle(el).cursor),/rotate.svg/);await gm.mouse.up({button:'right'});
  await gm.evaluate(()=>{selectedPlayer=null;Board3D.requestSync();});
  console.log('PASS 3D polish: L1Volt-style screen-plane pan responds within 120ms, stops smoothly and uses native action cursors');

  const base=new URL(gm.url()).origin;
  const large=await gm.evaluate(()=>{
    const c=document.createElement('canvas');c.width=6200;c.height=3500;const ctx=c.getContext('2d');
    ctx.fillStyle='#283a4e';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#af8949';ctx.fillRect(80,70,2500,1900);return c.toDataURL('image/png').split(',')[1];
  });
  const bigUrl=base+'/D20-Initiative/__large-board.png';let attempts=0;
  await gm.route(bigUrl,route=>{attempts++;return attempts===1?route.fulfill({status:503,body:'Transient image error'}):route.fulfill({contentType:'image/png',body:Buffer.from(large,'base64')});});
  async function background(url) {
    await gm.evaluate(url=>{
      lastState.boardBgUrl=url;lastState.boardBgDataUrl=null;
      const map=lastState.maps.find(m=>m.id===lastState.currentMapId);map.boardBgUrl=url;map.boardBgDataUrl=null;_cacheMapMeta(map);Board3D.requestSync();
    },url);
  }
  const original=await gm.evaluate(()=>lastState.boardBgUrl);
  await background(bigUrl);await gm.waitForFunction(()=>Board3D.inspect().background.status==='ready' && Board3D.inspect().background.sourceWidth===6200);
  const texture=await gm.evaluate(()=>Board3D.inspect().background);
  assert.equal(attempts,2);assert.ok(texture.width<=4096 && texture.height<=4096 && texture.width*texture.height<=8*1024*1024+4096);
  assert.ok(Math.abs(texture.width/texture.height-6200/3500)<.002);
  const brokenUrl=base+'/D20-Initiative/__retry-board.png';let failing=true,retries=0;
  await gm.route(brokenUrl,route=>{retries++;return route.fulfill(failing?{status:503,body:'Unavailable'}:{contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#8e7040"/></svg>'});});
  await background(brokenUrl);await gm.waitForFunction(()=>Board3D.inspect().background.status==='error');assert.equal(retries,3);
  failing=false;await buttons.getByRole('button',{name:'Подложка',exact:true}).click();
  await gm.waitForFunction(()=>Board3D.inspect().background.status==='ready' && Board3D.inspect().background.width===320);
  const slowUrl=base+'/D20-Initiative/__stale-board.png';let releaseSlow;
  const slowStarted=new Promise(resolve=>{releaseSlow=resolve;});let slowRoute;
  await gm.route(slowUrl,route=>{slowRoute=route;releaseSlow();});
  await background(slowUrl);await slowStarted;
  await background(brokenUrl);await gm.waitForFunction(()=>Board3D.inspect().background.status==='ready');
  await slowRoute.fulfill({contentType:'image/png',body:Buffer.from(large,'base64')}).catch(()=>{});
  await gm.waitForTimeout(150);assert.equal(await gm.evaluate(()=>Board3D.inspect().background.width),320);
  await background(original);await gm.waitForFunction(()=>Board3D.inspect().background.status==='ready');
  await gm.unroute(bigUrl);await gm.unroute(brokenUrl);await gm.unroute(slowUrl);
  await gm.evaluate(()=>{lastState.gridAlpha=1;Board3D.requestSync();});
  if(screenshotDir)await gm.locator('#board-3d-root').screenshot({path:path.join(screenshotDir,'board-3d-polish.png')});
  console.log('PASS 3D polish: real 6200px background is resized, transient failures retry, manual retry recovers, stale loads cannot replace the current texture');
};
