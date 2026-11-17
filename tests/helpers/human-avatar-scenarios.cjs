const assert=require('node:assert/strict');
const path=require('node:path');
const equipment=require('../../equipment_srd5_ru.json').tabs;

module.exports=async function({pages,fixture,applyFixture,h,screenshotDir}){
  const [gm,p1,,owner]=pages,backup=structuredClone(fixture),databaseBackup=structuredClone(h.database());
  const p=fixture.players.find(p=>p.id==='player-3');
  p.sheet={parsed:{name:{value:'Альрик'},info:{race:{value:'Человек'}},notes:{details:{gender:{value:'male'}}},
    inventory:{weapons:structuredClone(equipment.weapons),armor:structuredClone(equipment.armor)},
    appearance:{slots:{},model3d:{hairStyle:'short',hairColor:'#493124'}}}};
  p.sheetUpdatedAt=Date.now();p.isMonster=false;p.isPublic=true;
  Object.assign(h.database(),structuredClone(fixture));await applyFixture();
  await Promise.all([gm,owner].map(page=>page.waitForFunction(()=>Board3D.inspect().tokens.find(t=>t.id==='player-3')?.avatar?.model==='human-male')));
  async function open(page){await page.evaluate(()=>InfoModal.open(players.find(p=>p.id==='player-3')));await page.locator('.sheet-tab[data-tab="appearance"]').click();await page.waitForFunction(()=>Character3D.inspect()?.ready);}
  await open(owner);
  assert.equal(await owner.evaluate(()=>Character3D.inspect().config.armor),'none');
  if(screenshotDir)await owner.locator('[data-avatar-preview]').screenshot({path:path.join(screenshotDir,'human-underwear.png')});
  const portrait=owner.locator('[data-avatar-preview] canvas'),rect=await portrait.boundingBox();
  const camera=await owner.evaluate(()=>Character3D.inspect().camera);
  await owner.mouse.move(rect.x+rect.width*.5,rect.y+rect.height*.5);await owner.mouse.down();await owner.mouse.move(rect.x+rect.width*.7,rect.y+rect.height*.55,{steps:8});await owner.mouse.up();
  assert.notDeepEqual(await owner.evaluate(()=>Character3D.inspect().camera),camera,'portrait can rotate without moving the map');
  await owner.locator('[data-avatar-walk]').click();await owner.waitForFunction(()=>Math.abs(Character3D.inspect()?.angle)>0.05);
  await owner.locator('[data-avatar-walk]').click();assert.equal(await owner.evaluate(()=>Character3D.inspect().walking),false);
  await owner.locator('[data-sheet-path="appearance.model3d.hairStyle"]').selectOption('tied');
  await owner.locator('[data-hair-color="#ba7136"]').click();
  await owner.waitForFunction(()=>Character3D.inspect().config.hair==='tied'&&Character3D.inspect().config.hairColor==='#ba7136');
  for(const item of equipment.armor.filter(a=>a.armor.type!=='shield')){
    await owner.locator('[data-appearance-slot="armor"]').selectOption(item.id);
    await gm.waitForFunction(id=>players.find(p=>p.id==='player-3').sheet.parsed.appearance.slots.armor===id,item.id);
    const expected=require('../../client/avatar-data').armorKind(item);
    await gm.waitForFunction(kind=>Board3D.inspect().tokens.find(t=>t.id==='player-3').avatar.armor===kind,expected);
    assert.equal(await owner.evaluate(()=>Character3D.inspect().config.armor),expected);
    if(screenshotDir&&['armor_leather','armor_chain-mail','armor_plate'].includes(item.id))await owner.locator('[data-avatar-preview]').screenshot({path:path.join(screenshotDir,'human-'+item.id+'.png')});
  }
  await owner.locator('[data-appearance-slot="right"]').selectOption('weapon_longsword');
  await owner.locator('[data-appearance-slot="shield"]').selectOption('armor_shield');
  await gm.waitForFunction(()=>{const a=Board3D.inspect().tokens.find(t=>t.id==='player-3').avatar;return a.shield&&a.right==='long'&&a.hair==='tied'&&a.hairColor==='#ba7136';});
  if(screenshotDir)await owner.locator('[data-appearance-root]').screenshot({path:path.join(screenshotDir,'human-character-tab.png')});
  await owner.evaluate(()=>InfoModal.close());assert.equal(await owner.evaluate(()=>Character3D.inspect()),null);
  await open(owner);assert.equal(await owner.locator('[data-sheet-path="appearance.model3d.hairStyle"]').inputValue(),'tied');assert.equal(await owner.locator('[data-sheet-path="appearance.model3d.hairColor"]').inputValue(),'#ba7136');
  assert.equal(await owner.locator('[data-appearance-root]').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
  await owner.setViewportSize({width:420,height:900});
  assert.equal(await owner.locator('[data-appearance-root]').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,JSON.stringify(await owner.locator('[data-appearance-root]').evaluate(el=>[el,...el.querySelectorAll('*')].filter(e=>e.scrollWidth>e.clientWidth+1&&e.clientWidth>0).map(e=>({tag:e.tagName,c:e.className,w:e.clientWidth,s:e.scrollWidth})).slice(0,14))));
  await owner.locator('[data-sheet-path="appearance.model3d.hairStyle"]').scrollIntoViewIfNeeded();
  if(screenshotDir)await owner.screenshot({path:path.join(screenshotDir,'human-character-mobile.png')});
  await owner.setViewportSize({width:1440,height:1000});
  const memory=await owner.evaluate(()=>Character3D.inspect().render);
  for(const hair of ['bald','mohawk','short','parted','swept','tied'])await owner.locator('[data-sheet-path="appearance.model3d.hairStyle"]').selectOption(hair);
  await owner.waitForTimeout(100);const after=await owner.evaluate(()=>Character3D.inspect().render);
  assert.ok(after.geometries<=memory.geometries+4,'replacing hair releases old geometry');
  assert.ok(after.textures<=memory.textures+1,'replacing an anatomical model releases its previous bone texture');
  assert.ok(after.calls<=44,'portrait stays within two bounded passes (shadow and main view)');
  await require('./human-equipment-scenarios.cjs')({owner,gm,open,screenshotDir});
  await require('./studio-game-scenarios.cjs')({owner,gm});
  await owner.evaluate(()=>InfoModal.close());
  await open(p1);assert.equal(await p1.locator('[data-sheet-path="appearance.model3d.hairStyle"]').isDisabled(),true);assert.equal(await p1.locator('[data-appearance-slot="armor"]').isDisabled(),true);await p1.evaluate(()=>InfoModal.close());
  await owner.locator('#board-wrapper').scrollIntoViewIfNeeded();
  const start=await owner.evaluate(()=>Board3D.projectToken('player-3'));await owner.mouse.click(start.x,start.y);await owner.waitForFunction(()=>selectedPlayer?.id==='player-3');
  const dest=await owner.evaluate(()=>Board3D.projectCell(5.5,9.5));await owner.mouse.click(dest.x,dest.y);
  await Promise.all([owner,gm].map(page=>page.waitForFunction(()=>Board3D.inspect().tokens.find(t=>t.id==='player-3')?.walking)));
  const mid=await owner.evaluate(()=>Board3D.inspect().tokens.find(t=>t.id==='player-3'));
  assert.ok(mid.x!==5||mid.y!==9,'mesh interpolates instead of jumping to the destination');
  await owner.waitForFunction(()=>{const t=Board3D.inspect().tokens.find(t=>t.id==='player-3');return t.x===5&&t.y===9&&!t.walking;});
  assert.equal(await gm.evaluate(()=>players.find(p=>p.id==='player-3').y),9);
  // A second command during a walk completes the old route before taking the
  // next one; it cannot cut diagonally across a corner between destinations.
  let at=await owner.evaluate(()=>Board3D.projectToken('player-3'));await owner.mouse.click(at.x,at.y);
  let to=await owner.evaluate(()=>Board3D.projectCell(5.5,11.5));await owner.mouse.click(to.x,to.y);
  await owner.waitForFunction(()=>Board3D.inspect().tokens.find(t=>t.id==='player-3').walking);
  at=await owner.evaluate(()=>Board3D.projectToken('player-3'));await owner.mouse.click(at.x,at.y);await owner.waitForFunction(()=>selectedPlayer?.id==='player-3');
  to=await owner.evaluate(()=>Board3D.projectCell(8.5,11.5));await owner.mouse.click(to.x,to.y);
  const samples=await owner.evaluate(async()=>{const result=[];for(let i=0;i<90;i++){const t=Board3D.inspect().tokens.find(t=>t.id==='player-3');result.push({x:t.x,y:t.y});if(!t.walking)break;await new Promise(r=>setTimeout(r,16));}return result;});
  assert.ok(samples.filter(t=>t.x>5.03).every(t=>t.y>10.96),'rapid commands do not cut across the unfinished route');
  await owner.waitForFunction(()=>{const t=Board3D.inspect().tokens.find(t=>t.id==='player-3');return t.x===8&&t.y===11&&!t.walking;});
  await owner.waitForTimeout(150);const idle=await owner.evaluate(()=>Board3D.inspect().counters.frames);await owner.waitForTimeout(180);assert.ok(await owner.evaluate(()=>Board3D.inspect().counters.frames)-idle<=1,'a stationary character does not keep rendering');
  if(screenshotDir)await owner.locator('#board-3d-root').screenshot({path:path.join(screenshotDir,'human-on-map.png')});
  console.log('PASS human 3D: all database armor variants, sword/shield, hairstyles and color persist and reach peers; live preview rotates, walks, releases resources and respects read-only access; real map movement animates on both clients, rapid commands preserve the route, then rendering sleeps');
  Object.assign(fixture,backup);Object.assign(h.database(),databaseBackup);await applyFixture();
};
