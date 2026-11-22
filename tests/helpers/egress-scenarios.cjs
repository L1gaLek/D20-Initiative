const assert=require('node:assert/strict');
module.exports=async({pages})=>{
 const page=pages[1],loaded=[];page.on('request',r=>loaded.push(r.url()));
 await page.evaluate(()=>{const select=document.getElementById('board-view-mode-select');select.value='3d';select.dispatchEvent(new Event('change'));});
 await page.waitForFunction(()=>Board3D.inspect().ready);
 assert.equal(loaded.some(url=>/models\/plate\/(male|female)\.mjs/.test(url)),false,'unused plate assets must never load');
 await page.evaluate(async()=>{const module=await import('./client/board-3d/armor-assets.mjs?v=20261122-egress-1');await Promise.all([module.ensureArmorAsset({model:'human-male',armor:'plate'}),module.ensureArmorAsset({model:'human-male',armor:'plate'})]);});
 assert.equal(loaded.filter(url=>url.includes('models/plate/male.mjs')).length,1);
 assert.equal(loaded.filter(url=>url.includes('models/plate/female.mjs')).length,0);
 console.log('PASS egress assets: starting 3D downloads no unused plates; selected male plate loads once, female stays unloaded');
 const counts=await page.evaluate(()=>{
  const original=renderWallEdges,oldFog=FogWar.onTokenPositionsChanged;let walls=0,fog=0;
  renderWallEdges=(...args)=>{walls++;return original(...args);};FogWar.onTokenPositionsChanged=function(...args){fog++;return oldFog.apply(this,args);};
  const p=lastState.players[0],row={token_id:p.id,map_id:lastState.currentMapId,x:p.x+1,y:p.y,size:p.size,is_public:p.isPublic,updated_at:new Date(Date.now()+5000).toISOString()};
  handleMessage({type:'tokenRow',row});handleMessage({type:'tokenRow',row});
  renderWallEdges=original;FogWar.onTokenPositionsChanged=oldFog;return {walls,fog};
 });
 assert.equal(counts.walls,0);assert.equal(counts.fog,1);
 console.log('PASS egress UI: movement does not rebuild walls, and preview/confirmation at the same position compute fog once');
};
