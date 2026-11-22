const assert=require('node:assert/strict');
module.exports=async({pages,h,mapHarness})=>{
 const [gm,owner]=pages;
 const wait=async(check,label)=>{for(let n=0;n<100;n++){if(check())return;await new Promise(r=>setTimeout(r,30));}throw Error(label);};
 const switchMap=async mapId=>{await gm.evaluate(mapId=>sendMessage({type:'switchCampaignMap',mapId}),mapId);for(const p of pages)await p.waitForFunction(id=>lastState.currentMapId===id,mapId);};
 const move=async(page,x,y)=>{await page.evaluate(({x,y})=>sendMessage({type:'movePlayer',id:'player-1',x,y}),{x,y});await page.waitForFunction(({x,y})=>lastState.players[0].x===x&&lastState.players[0].y===y,{x,y});};
 await move(gm,30,12);await wait(()=>mapHarness.tokens.get('map-1::player-1')?.x===30,'map 1 saved');
 await switchMap('map-2');
 for(const p of pages)await p.waitForFunction(()=>lastState.players[0].x===null);
 // A stale snapshot must not reject a position that is valid in detached metadata.
 for(const client of h.clients){client.ctx.state.boardWidth=10;client.ctx.state.maps[1].boardWidth=10;}
 await move(gm,80,60);await wait(()=>mapHarness.tokens.get('map-2::player-1')?.x===80,'GM places on large map');
 await owner.waitForFunction(()=>lastState.players[0].x===80);await move(owner,81,60);
 await wait(()=>mapHarness.tokens.get('map-2::player-1')?.x===81,'owner moves on large map');
 assert.equal(mapHarness.tokens.get('map-1::player-1').x,30);
 await switchMap('map-1');for(const p of pages)await p.waitForFunction(()=>lastState.players[0].x===30&&lastState.players[0].y===12);
 await switchMap('map-2');for(const p of pages)await p.waitForFunction(()=>lastState.players[0].x===81&&lastState.players[0].y===60);
 // A delayed rollback/delete from map 1 cannot remove map 2's actor.
 await owner.evaluate(()=>handleMessage({type:'tokenRowDeleted',row:{map_id:'map-1',token_id:'player-1'}}));assert.equal(await owner.evaluate(()=>lastState.players[0].x),81);
 console.log('PASS maps: GM placement and owner movement use real server validation; map-specific positions restore on all five browsers and late deletes stay scoped');

 await switchMap('map-1');
 await gm.evaluate(async()=>{await sendMessage({type:'setFogSettings',enabled:true,mode:'manual'});await new Promise(requestAnimationFrame);document.getElementById('fog-draw').checked=true;document.getElementById('fog-square-size').value='1';const e=new MouseEvent('mousedown',{button:0});Object.defineProperty(e,'boardPoint',{value:{x:1,y:10}});document.getElementById('fog-layer').dispatchEvent(e);window.dispatchEvent(new MouseEvent('mouseup'));});
 await switchMap('map-2');
 await gm.evaluate(async()=>{await sendMessage({type:'setFogSettings',enabled:true,mode:'manual'});await new Promise(requestAnimationFrame);document.getElementById('fog-draw').checked=true;const e=new MouseEvent('mousedown',{button:0});Object.defineProperty(e,'boardPoint',{value:{x:9,y:20}});document.getElementById('fog-layer').dispatchEvent(e);window.dispatchEvent(new MouseEvent('mouseup'));});
 try{await wait(()=>mapHarness.fog.get('map-1')?.manual_stamps.length===1&&mapHarness.fog.get('map-2')?.manual_stamps.length===1,'both pending fog writes saved');}catch(e){console.log('FOG DEBUG',JSON.stringify([...mapHarness.fog]),await gm.evaluate(()=>({scope:FogWar._mapScope,queue:FogWar._stampQueue,pending:FogWar._stampFlushTimer,fog:lastState.fog,canvas:document.getElementById('fog-layer').style.pointerEvents,checked:document.getElementById('fog-draw').checked})));throw e;}
 for(const p of pages)await p.waitForFunction(()=>{const v=FogWar.getViewSnapshot();return v.mask[20*v.width+9]===2&&v.mask[10*v.width+1]===0;});
 await switchMap('map-1');for(const p of pages)await p.waitForFunction(()=>{const v=FogWar.getViewSnapshot();return v.mask[10*v.width+1]===2&&v.mask[20*v.width+9]===0;});
 console.log('PASS fog: manual reveals stay on their own map through rapid switches and coalesced writes, with identical visibility on all clients');

 // Queue exploration, then leave before its 450ms debounce has fired.
 await gm.evaluate(async()=>{await sendMessage({type:'setFogSettings',enabled:true,mode:'dynamic',visionRadius:2,useWalls:false});FogWar.onTokenPositionsChanged(lastState);await sendMessage({type:'switchCampaignMap',mapId:'map-2'});});
 await gm.waitForFunction(()=>lastState.currentMapId==='map-2');
 await gm.evaluate(async()=>{await sendMessage({type:'setFogSettings',enabled:true,mode:'dynamic',visionRadius:2,useWalls:false});FogWar.onTokenPositionsChanged(lastState);});
 await wait(()=>!!mapHarness.fog.get('map-1')?.explored_packed&&!!mapHarness.fog.get('map-2')?.explored_packed,'exploration saved');
 await gm.waitForTimeout(1000);
 for(const p of pages){assert.equal(await p.evaluate(()=>FogWar._isExplored(30,12)),false);assert.equal(await p.evaluate(()=>FogWar._isExplored(81,60)),true);}
 await switchMap('map-1');for(const p of pages)await p.waitForFunction(()=>FogWar._isExplored(30,12)&&!FogWar._isExplored(50,40));
 await gm.evaluate(()=>{const s=document.getElementById('board-view-mode-select');s.value='3d';s.dispatchEvent(new Event('change'));});
 await gm.waitForFunction(()=>Board3D.inspect().ready);
 assert.equal(await gm.evaluate(()=>FogWar.getViewSnapshot().mask[40*lastState.boardWidth+50]),0);
 await switchMap('map-2');await gm.waitForFunction(()=>Board3D.inspect().mapKey.endsWith('map-2'));
 assert.equal(await gm.evaluate(()=>FogWar._isExplored(30,12)),false);
 console.log('PASS fog: delayed exploration is sent to its original map, map 2 does not inherit map 1 terrain, returning restores map 1 and 3D uses the same isolated mask');
};
