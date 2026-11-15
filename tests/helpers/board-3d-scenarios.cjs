const assert = require('node:assert/strict');
const path = require('node:path');
module.exports = async function ({ pages, h, broadcast, screenshotDir, clone }) {
  const [gm,p1,p2,p3,p4] = pages;
  const fixture = clone(h.database());
  const tiles = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700"><defs><pattern id="p" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="#6d7470"/><path d="M0 50H100M50 0V50M0 0H100V100H0Z" fill="none" stroke="#555d5b" stroke-width="3"/></pattern></defs><rect width="900" height="700" fill="url(#p)"/><rect x="495" y="95" width="310" height="260" rx="8" fill="#9f8865" opacity=".65"/><path d="M20 540H870" stroke="#405d61" stroke-width="70" opacity=".6"/></svg>';
  const background = 'data:image/svg+xml;base64,'+Buffer.from(tiles).toString('base64');
  fixture.phase='exploration'; fixture.phaseEpoch=Date.now(); fixture.turnOrder=[];
  fixture.currentMapId='map-1'; fixture.boardWidth=18; fixture.boardHeight=14;
  fixture.gridAlpha=1; fixture.wallAlpha=1; fixture.boardBgUrl=background;
  fixture.fog={enabled:false,mode:'manual',manualBase:'hide',manualStamps:[],gmViewMode:'gm',gmOpen:false,visionRadius:4,useWalls:true,exploredEnabled:true,explored:[]};
  fixture.walls=[];
  for(let x=10;x<16;x++) fixture.walls.push({x,y:2,dir:'N',type:'stone',thickness:5},{x,y:6,dir:'S',type:'wood',thickness:5});
  for(let y=2;y<7;y++) { fixture.walls.push({x:15,y,dir:'E',type:'stone',thickness:5}); if(y!==4) fixture.walls.push({x:10,y,dir:'W',type:'metal',thickness:4}); }
  const coords=[[3,3],[6,3],[3,6],[7,6],[6,7]];
  fixture.players.forEach((p,i)=>Object.assign(p,{x:coords[i][0],y:coords[i][1],size:1,inCombat:false,initiative:null,hasRolledInitiative:false,isPublic:true,color:['#d9a24b','#5e9cbd','#a78ace','#6bb58c','#cc6860'][i]}));
  fixture.players.push({id:'secret-3d',name:'Hidden sentinel',ownerId:'gm',ownerRole:'GM',isEnemy:true,isPublic:false,isBase:false,x:15,y:11,size:1,color:'#cc5560',sheet:{parsed:{}},sheetUpdatedAt:1});
  fixture.players.push({id:'enemy-3d',name:'Страж зала',ownerId:'gm',ownerRole:'GM',isEnemy:true,isPublic:true,isBase:false,x:13,y:5,size:1,color:'#cc5560',sheet:{parsed:{}},sheetUpdatedAt:1});
  fixture.maps=[{...fixture.maps[0],id:'map-1',name:'3D test dungeon',boardWidth:18,boardHeight:14,boardBgUrl:background,boardBgDataUrl:background,
    gridAlpha:1,wallAlpha:1,phase:'exploration',phaseEpoch:fixture.phaseEpoch,playerStates:{},walls:fixture.walls,marks:[],fog:fixture.fog}];
  fixture.marks=[];
  async function applyFixture() {
    fixture.maps[0].fog=fixture.fog; fixture.maps[0].walls=fixture.walls;
    for(const page of pages) await page.evaluate(state=>{
      InfoModal.close(); closeTokenMini(); selectedPlayer=null;
      const wrapper=document.getElementById('board-wrapper');wrapper.style.cssText='width:100%;height:620px;max-width:100%;max-height:620px;display:block;flex:none';
      resetDetachedRoomCache('test-room');
      _cacheMapMeta(state.maps[0]);
      _cacheWallRows(state.walls.map(w=>({...w,map_id:'map-1',wall_type:w.type})));
      _cacheUpsertFogRow(buildDetachedFogRow('test-room','map-1',state.fog,state.boardWidth,state.boardHeight));
      handleMessage({type:'state',state});
      handleMessage({type:'tokensInit',mapId:'map-1',rows:state.players.map(p=>({token_id:p.id,map_id:'map-1',x:p.x,y:p.y,size:p.size,is_public:p.isPublic}))});
    },clone(fixture));
  }
  await applyFixture();
  async function mode(page,value) {
    await page.evaluate(value=>{const select=document.getElementById('board-view-mode-select');select.value=value;select.dispatchEvent(new Event('change'));},value);
    if(value==='3d') { await page.waitForFunction(()=>Board3D.inspect().ready && Board3D.inspect().active); await page.locator('#board-wrapper').scrollIntoViewIfNeeded(); }
  }
  await mode(gm,'3d'); await mode(p3,'3d');
  await gm.waitForFunction(()=>Board3D.inspect().render.triangles>100);
  const initial=await gm.evaluate(()=>Board3D.inspect());
  assert.equal(initial.wallSegments,21); assert.equal(initial.tokens.length,7);
  assert.equal(await p3.evaluate(()=>Board3D.inspect().tokens.some(t=>t.id==='secret-3d')),false);
  console.log('PASS 3D: real WebGL scene loads vendored modules under the static app; volumetric walls/pawns respect private tokens');
  const box=await gm.locator('.board-3d-canvas').boundingBox();
  const center={x:box.x+box.width*.5,y:box.y+box.height*.6};
  await gm.mouse.move(center.x,center.y); await gm.mouse.down({button:'right'}); await gm.mouse.move(center.x+110,center.y+45,{steps:14}); await gm.mouse.up({button:'right'}); await gm.waitForTimeout(300);
  const rotated=await gm.evaluate(()=>Board3D.inspect());
  assert.ok(rotated.camera.some((v,i)=>Math.abs(v-initial.camera[i])>.5));
  await gm.mouse.move(center.x,center.y); await gm.mouse.down({button:'middle'}); await gm.mouse.move(center.x+65,center.y-40,{steps:12}); await gm.mouse.up({button:'middle'}); await gm.waitForTimeout(300);
  const panned=await gm.evaluate(()=>Board3D.inspect()); assert.ok(panned.target.some((v,i)=>Math.abs(v-rotated.target[i])>.1),JSON.stringify({rotated,panned,center,target:await gm.evaluate(p=>document.elementFromPoint(p.x,p.y)?.outerHTML.slice(0,300),center)}));
  const distance=s=>Math.hypot(...s.camera.map((v,i)=>v-s.target[i]));
  await gm.mouse.move(center.x,center.y); await gm.mouse.wheel(0,-400); await gm.waitForTimeout(350); const zoomed=await gm.evaluate(()=>Board3D.inspect());
  assert.ok(distance(zoomed)<distance(panned),JSON.stringify({panned,zoomed}));
  await gm.locator('.board-3d-toolbar').getByRole('button',{name:'Обзор',exact:true}).click(); await gm.waitForTimeout(650);
  assert.ok(await gm.evaluate(()=>Board3D.inspect().target[0]>8 && Board3D.inspect().target[0]<10));
  console.log('PASS 3D: right-drag orbit, smooth middle-drag pan, wheel zoom, and overview camera work');
  // Click the actual mesh and a ground cell; movement enters the unchanged board handler.
  const tokenPoint=await gm.evaluate(()=>Board3D.projectToken('player-1'));
  await gm.mouse.click(tokenPoint.x,tokenPoint.y);
  await gm.waitForFunction(()=>selectedPlayer?.id==='player-1');
  const destination=await gm.evaluate(()=>Board3D.projectCell(4.5,3.5));
  await gm.mouse.click(destination.x,destination.y);
  await p3.waitForFunction(()=>players.find(p=>p.id==='player-1')?.x===4);
  await gm.waitForFunction(()=>Board3D.inspect().tokens.find(t=>t.id==='player-1')?.x===4);
  assert.equal(await p1.evaluate(()=>players.find(p=>p.id==='player-1').x),4);
  const miniPoint=await gm.evaluate(()=>Board3D.projectToken('player-1'));
  await gm.mouse.dblclick(miniPoint.x,miniPoint.y,{delay:90});
  await gm.waitForFunction(()=>!!tokenMiniEl && tokenMiniPlayerId==='player-1');
  await gm.evaluate(()=>closeTokenMini());
  console.log('PASS 3D: mesh selection, existing movement permissions, cross-client position updates and double-click token card');
  await gm.mouse.click(miniPoint.x,miniPoint.y);
  await gm.waitForFunction(()=>selectedPlayer?.id==='player-1');
  // Use the real wall editor and real detached-row WS transport in this isolated room.
  await gm.evaluate(()=>{
    document.getElementById('edit-environment').click(); document.getElementById('add-wall').click();
    const select=document.getElementById('wall-tool'); select.value='point'; select.dispatchEvent(new Event('change'));
  });
  const wallPoint=await gm.evaluate(()=>Board3D.projectCell(6.5,9.04));
  await gm.mouse.click(wallPoint.x,wallPoint.y);
  await p3.waitForFunction(()=>lastState.walls.some(w=>w.x===6&&w.y===9&&w.dir==='N'));
  await gm.waitForFunction(()=>Board3D.inspect().wallSegments===22);
  await p3.waitForFunction(()=>Board3D.inspect().wallSegments===22);
  assert.equal(await gm.evaluate(()=>players.find(p=>p.id==='player-1').x),4,'editing a wall never moves the selected token');
  await gm.evaluate(()=>{const select=document.getElementById('wall-tool');select.value='line';select.dispatchEvent(new Event('change'));});
  const lineStart=await gm.evaluate(()=>Board3D.projectCell(2.5,10.02));
  const lineEnd=await gm.evaluate(()=>Board3D.projectCell(5.5,10.02));
  await gm.mouse.click(lineStart.x,lineStart.y);await gm.mouse.move(lineEnd.x,lineEnd.y);
  await gm.waitForFunction(()=>document.querySelectorAll('#walls-preview-layer .wall-edge').length>=3 && Board3D.inspect().wallSegments>22);
  await gm.mouse.click(lineEnd.x,lineEnd.y);
  await p3.waitForFunction(()=>Board3D.inspect().wallSegments>22);
  await gm.keyboard.press('Escape');
  await gm.evaluate(()=>document.getElementById('edit-environment').click());
  console.log('PASS 3D: point/line walls, live 3D previews and WS sync work; editing never moves the selected token');
  fixture.fog.enabled=true; fixture.fog.mode='manual'; fixture.fog.manualStamps=[{x:1,y:1,r:8,mode:'reveal'}];
  await applyFixture();
  await p3.waitForFunction(()=>Board3D.inspect().fogVolumes>0);
  assert.equal(await p3.evaluate(()=>Board3D.inspect().tokens.some(t=>t.id==='enemy-3d')),false);
  assert.equal(await p3.evaluate(()=>Board3D.inspect().wallSegments),0);
  assert.equal(await gm.evaluate(()=>Board3D.inspect().tokens.some(t=>t.id==='secret-3d')),true);
  if(screenshotDir) await p3.screenshot({path:path.join(screenshotDir,'board-3d-player-fog.png')});
  // Camera rotation must never add a hidden actor to the render list.
  const pb=await p3.locator('.board-3d-canvas').boundingBox();
  await p3.mouse.move(pb.x+pb.width/2,pb.y+pb.height*.6); await p3.mouse.down({button:'right'}); await p3.mouse.move(pb.x+pb.width*.8,pb.y+pb.height*.8,{steps:12}); await p3.mouse.up({button:'right'});
  assert.equal(await p3.evaluate(()=>Board3D.inspect().tokens.some(t=>t.id==='enemy-3d'||t.id==='secret-3d')),false);
  await gm.evaluate(()=>{const draw=document.getElementById('fog-draw');draw.checked=true;draw.dispatchEvent(new Event('change'));document.getElementById('fog-square-size').value='2';document.getElementById('fog-brush-mode').value='reveal';});
  const reveal=await gm.evaluate(()=>Board3D.projectCell(13.5,5.5));
  await gm.mouse.click(reveal.x,reveal.y);
  await p3.waitForFunction(()=>FogWar.isCellVisible(13,5));
  await p3.waitForFunction(()=>Board3D.inspect().tokens.some(t=>t.id==='enemy-3d'));
  await gm.evaluate(()=>{document.getElementById('fog-draw').checked=false;});
  console.log('PASS 3D: hidden walls and enemies stay absent while orbiting; GM paints manual fog in 3D and peers reveal the right cells');
  fixture.fog.mode='dynamic'; fixture.fog.manualStamps=[]; fixture.fog.visionRadius=3; fixture.fog.exploredEnabled=true;
  fixture.fog.explored=['13,5'];
  await applyFixture();
  await p3.waitForFunction(()=>FogWar._lastState.fog.mode==='dynamic');
  assert.equal(await p3.evaluate(()=>Board3D.inspect().tokens.some(t=>t.id==='secret-3d')),false);
  assert.equal(await p3.evaluate(()=>Board3D.inspect().tokens.some(t=>t.id==='enemy-3d'&&!t.ghost)),false);
  // GM player-preview follows exactly the same party mask and hides private NPCs.
  fixture.fog.gmViewMode='player'; await applyFixture();
  await gm.waitForFunction(()=>!Board3D.inspect().tokens.some(t=>t.id==='secret-3d'));
  const maskAgreement=await p3.evaluate(()=>{
    const v=FogWar.getViewSnapshot();
    return v.mask.every((cell,i)=>(cell===2)===FogWar.isCellVisible(i%v.width,Math.floor(i/v.width)));
  }); assert.equal(maskAgreement,true);
  console.log('PASS 3D: dynamic LOS/exploration use the existing fog mask, and GM player-preview hides undiscovered actors');
  fixture.fog.enabled=false; fixture.fog.gmViewMode='gm'; await applyFixture();
  await gm.locator('.board-3d-toolbar').getByRole('button',{name:'Обзор',exact:true}).click(); await gm.waitForTimeout(650);
  // Existing annotation tools receive raycast coordinates, including drag previews.
  await gm.evaluate(()=>{
    const check=document.getElementById('marks-enabled');check.checked=true;check.dispatchEvent(new Event('change'));
    document.querySelector('#marks-toolbar [data-tool="rect"]')?.click();
  });
  const markStart=await gm.evaluate(()=>Board3D.projectCell(2.2,10.2));
  const markEnd=await gm.evaluate(()=>Board3D.projectCell(4.8,11.8));
  await gm.mouse.move(markStart.x,markStart.y);await gm.mouse.down();await gm.mouse.move(markEnd.x,markEnd.y,{steps:8});
  await gm.waitForFunction(()=>BoardMarks.getRenderMarks().some(m=>m.id==='__preview'));
  await gm.mouse.up();
  await p3.waitForFunction(()=>BoardMarks.getRenderMarks().some(m=>m.kind==='rect'));
  await gm.waitForFunction(()=>BoardMarks.getRenderMarks().some(m=>m.kind==='rect' && m.id!=='__preview'));
  const drawnMark=await gm.evaluate(()=>BoardMarks.getRenderMarks().find(m=>m.kind==='rect'));
  await gm.evaluate(()=>document.querySelector('#marks-toolbar [data-tool="select"]').click());
  const dragFrom=await gm.evaluate(m=>Board3D.projectCell(m.x+m.w/2,m.y+m.h/2,.04),drawnMark);
  const dragTo=await gm.evaluate(m=>Board3D.projectCell(m.x+m.w/2+1,m.y+m.h/2+1,.04),drawnMark);
  await gm.mouse.move(dragFrom.x,dragFrom.y);await gm.mouse.down();await gm.mouse.move(dragTo.x,dragTo.y,{steps:8});await gm.mouse.up();
  await p3.waitForFunction(mark=>BoardMarks.getRenderMarks().find(m=>m.id===mark.id)?.x>mark.x+.7,drawnMark);
  await gm.evaluate(()=>{const check=document.getElementById('marks-enabled');check.checked=false;check.dispatchEvent(new Event('change'));});
  console.log('PASS 3D: shared annotation tools draw, preview and drag a rectangle in world coordinates');
  if(screenshotDir) await gm.screenshot({path:path.join(screenshotDir,'board-3d-gm.png')});
  const memoryBefore=await gm.evaluate(()=>Board3D.inspect().render);
  for(let i=0;i<12;i++) await gm.evaluate(i=>{
    const p=players.find(p=>p.id==='player-1');p.name='Путник '+i;setPlayerPosition(p);
  },i);
  await gm.waitForTimeout(200);
  const memoryAfter=await gm.evaluate(()=>Board3D.inspect().render);
  assert.ok(memoryAfter.geometries<=memoryBefore.geometries+5); assert.ok(memoryAfter.textures<=memoryBefore.textures+2);
  await mode(gm,'topdown'); assert.equal(await gm.evaluate(()=>Board3D.inspect().running),false);
  assert.equal(await gm.locator('#board-wrapper').evaluate(el=>getComputedStyle(el).overflow),'auto');
  assert.equal(await gm.locator('#game-board').evaluate(el=>getComputedStyle(el).visibility),'visible');
  await mode(gm,'3d'); await gm.waitForFunction(()=>Board3D.inspect().running);
  const firstCamera=await gm.evaluate(()=>Board3D.inspect().camera);
  await gm.evaluate(()=>{
    const next=structuredClone(lastState);next.maps.push({...structuredClone(next.maps[0]),id:'map-3d-second',boardBgUrl:null,boardBgDataUrl:null,boardWidth:10,boardHeight:10,walls:[],marks:[]});
    next.currentMapId='map-3d-second';next.boardWidth=10;next.boardHeight=10;next.walls=[];next.marks=[];next.boardBgUrl=null;next.boardBgDataUrl=null;
    _cacheMapMeta(next.maps[1]);handleMessage({type:'state',state:next});
  });
  await gm.waitForFunction(()=>Board3D.inspect().mapKey==='test-room:map-3d-second');
  assert.equal(await gm.evaluate(()=>Board3D.inspect().wallSegments),0);
  await gm.evaluate(()=>{const next=structuredClone(lastState);next.currentMapId='map-1';handleMessage({type:'state',state:next});});
  await gm.waitForFunction(()=>Board3D.inspect().mapKey==='test-room:map-1');
  const restoredCamera=await gm.evaluate(()=>Board3D.inspect().camera);
  assert.ok(restoredCamera.every((v,i)=>Math.abs(v-firstCamera[i])<.05));
  // A hidden room must not keep issuing WebGL frames in the lobby.
  await gm.evaluate(()=>document.getElementById('game-container').style.display='none');
  await gm.waitForFunction(()=>!Board3D.inspect().running);
  await gm.evaluate(()=>document.getElementById('game-container').style.display='block');
  await gm.waitForFunction(()=>Board3D.inspect().running);
  await gm.evaluate(()=>{const checkbox=document.getElementById('fog-draw');checkbox.checked=false;});
  console.log('PASS 3D: GPU resource counts stay bounded; 2D/lobby stop rendering; map switches restore their camera');
  // Touch orbit and pinch must not be mistaken for a board click or move command.
  const touch=await gm.context().newCDPSession(gm);
  await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  await gm.locator('#board-wrapper').scrollIntoViewIfNeeded();
  const tb=await gm.locator('.board-3d-canvas').boundingBox();const tx=tb.x+tb.width*.55,ty=tb.y+tb.height*.55;
  const beforeTouch=await gm.evaluate(()=>Board3D.inspect());
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tx,y:ty,id:1}]});
  for(let i=1;i<=6;i++) { await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tx+80*i/6,y:ty+25*i/6,id:1}]});await gm.waitForTimeout(18); }
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await gm.waitForTimeout(200);
  const afterTouch=await gm.evaluate(()=>Board3D.inspect());
  assert.ok(afterTouch.camera.some((v,i)=>Math.abs(v-beforeTouch.camera[i])>.1),JSON.stringify({tb,beforeTouch,afterTouch}));
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tx-35,y:ty,id:1},{x:tx+35,y:ty,id:2}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tx-75,y:ty,id:1},{x:tx+75,y:ty,id:2}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await gm.waitForTimeout(200);
  const pinched=await gm.evaluate(()=>Board3D.inspect());
  assert.ok(distance(pinched)<distance(afterTouch));
  assert.deepEqual(pinched.tokens,afterTouch.tokens);
  await touch.send('Emulation.setTouchEmulationEnabled',{enabled:false});await touch.detach();
  await gm.locator('.board-3d-toolbar').getByRole('button',{name:'Стены',exact:true}).click();
  assert.equal(await gm.evaluate(()=>Board3D.inspect().wallFade),true);
  assert.equal(await p3.evaluate(()=>Board3D.inspect().wallFade),false);
  await gm.locator('.board-3d-toolbar').getByRole('button',{name:'Стены',exact:true}).click();
  console.log('PASS 3D: touch orbit/pinch keep token positions unchanged; wall transparency is a personal camera option');
  await applyFixture();
  await require('./board-3d-polish-scenarios.cjs')({gm,screenshotDir});
  // Exercise lazy-load failure without modifying the already working clients.
  await p4.evaluate(()=>{
    const get=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(kind,...args){return String(kind).startsWith('webgl')?null:get.call(this,kind,...args);};
    const select=document.getElementById('board-view-mode-select');select.value='3d';select.dispatchEvent(new Event('change'));
  });
  await p4.waitForFunction(()=>window.__boardViewMode==='topdown' && document.getElementById('board-3d-fallback')?.textContent);
  assert.equal(await p4.evaluate(()=>getComputedStyle(document.getElementById('game-board')).visibility),'visible');
  console.log('PASS 3D: unsupported WebGL falls back to usable 2D with a clear explanation');
  // The public deployment lives under /D20-Initiative/, rather than origin root.
  await p2.goto(new URL('/D20-Initiative/',p2.url()).href,{waitUntil:'load'});
  await p2.evaluate(state=>{
    myId='user-2';myRole='Player';currentRoomId='test-room';
    document.getElementById('login-container').style.display='none';document.getElementById('rooms-container').style.display='none';
    document.getElementById('main-container').style.display='flex';document.getElementById('game-container').style.display='block';
    resetDetachedRoomCache('test-room');handleMessage({type:'state',state});
    handleMessage({type:'tokensInit',mapId:'map-1',rows:state.players.map(p=>({token_id:p.id,map_id:'map-1',x:p.x,y:p.y,size:1,is_public:p.isPublic}))});
  },clone(fixture));
  await mode(p2,'3d');await p2.waitForFunction(()=>Board3D.inspect().render.triangles>100);
  await p2.reload({waitUntil:'load'});
  await p2.waitForFunction(()=>window.__boardViewMode==='3d' && !!document.querySelector('.board-3d-canvas'));
  console.log('PASS 3D: lazy module URLs work under the GitHub Pages subpath and the chosen mode survives reload');
};
