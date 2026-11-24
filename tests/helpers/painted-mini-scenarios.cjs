const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({pages,screenshotDir,h,broadcast})=>{
 const [gm,male,female]=pages;
 if(screenshotDir)fs.mkdirSync(screenshotDir,{recursive:true});
 const armor=require('../../equipment_srd5_ru.json').tabs.armor;
 for(const [i,sex]of ['male','female'].entries()){
  const p=h.database().players[i];p.name=i?'Элира':'Альрик';
  p.sheet={parsed:{info:{race:{value:'Человек'},level:{value:5}},notes:{details:{gender:{value:sex}}},
   stats:Object.fromEntries(['str','dex','con','int','wis','cha'].map((k,i)=>[k,{score:16-i,value:16-i,modifier:Math.floor((6-i)/2)}])),
   vitality:{'hp-max':{value:30},'hp-current':{value:18},'hp-temp':{value:5},ac:{value:16},speed:{value:30}},
   inventory:{armor},appearance:{slots:{},model3d:{hairStyle:i?'braid':'parted',hairColor:'#493124'}},
   weaponsList:[{name:{value:'Длинный меч'},ability:'str',dmgNum:1,dmgDice:'к8',extraAtk:0}]}};
  p.sheetUpdatedAt=Date.now();
 }
 broadcast({type:'state',roomId:'test-room',state:h.database()});
 for(const page of pages)await page.waitForFunction(()=>lastState.players[0].name==='Альрик');
 for(const [page,id,sex]of [[male,'player-1','male'],[female,'player-2','female']]){
  await page.evaluate(id=>InfoModal.open(players.find(p=>p.id===id)),id);
  await page.locator('.sheet-tab[data-tab="appearance"]').click();
  await page.locator('[data-sheet-path="notes.details.gender.value"]').selectOption(sex);
  await page.waitForFunction(sex=>Character3D.inspect()?.ready&&Character3D.inspect().config.model==='human-'+sex,sex);
  if(screenshotDir)await page.locator('[data-avatar-preview]').screenshot({path:path.join(screenshotDir,'painted-'+sex+'.png')});
  await page.locator('[data-sheet-path="appearance.model3d.outfitStyle"]').selectOption('quaternius');
  await page.locator('[data-appearance-slot="armor"]').selectOption('armor_leather');
  await page.waitForFunction(()=>Character3D.inspect()?.armorQuality==='quaternius-standard',null,{timeout:60000});
  if(screenshotDir)await page.locator('[data-avatar-preview]').screenshot({path:path.join(screenshotDir,'painted-'+sex+'-outfit.png')});
  await page.evaluate(()=>InfoModal.close());
 }
 await gm.evaluate(()=>openTokenMini('player-1'));
 const card=gm.locator('.token-mini');await card.waitFor({state:'visible'});
 await card.locator('[data-mini-side-button="combat"]').click();
 assert.equal(await card.locator('[data-mini-weapon-roll-atk]').count(),1);
 assert.equal(await card.locator('.token-mini-temp').textContent(),'+5 врем.');
 if(screenshotDir)await card.screenshot({path:path.join(screenshotDir,'token-mini-desktop.png')});
 await card.locator('.hp-delta-val').fill('3');await card.locator('.hp-delta-minus').click();
 for(const page of [gm,male])await page.waitForFunction(()=>lastState.players[0].sheet.parsed.vitality['hp-temp'].value===2);
 await gm.waitForFunction(()=>document.querySelector('.token-mini-temp')?.textContent==='+2 врем.');
 assert.equal(await card.locator('.hp-cur').inputValue(),'18','temporary health absorbs damage first');
 await gm.setViewportSize({width:390,height:700});
 await gm.evaluate(()=>refreshOpenTokenMini());
 const box=await card.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=390&&box.y+box.height<=700,JSON.stringify(box));
 assert.equal(await card.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
 if(screenshotDir)await card.screenshot({path:path.join(screenshotDir,'token-mini-mobile.png')});
 await card.getByRole('button',{name:'Закрыть краткую карточку'}).click();assert.equal(await card.count(),0);
 await gm.setViewportSize({width:1440,height:1000});
 await gm.evaluate(async()=>{applyBoardViewMode('3d');await Board3D.setActive(true);});
 await gm.waitForFunction(()=>Board3D.inspect()?.tokens?.find(t=>t.id==='player-1')?.avatar?.model==='human-male');
 await gm.evaluate(()=>openTokenMini('player-1'));await card.waitFor({state:'visible'});await card.press('Escape');
 assert.equal(await card.count(),0);
 console.log('PASS painted skin: male/female portraits, Quaternius outfits and the live 3D board compile without shader errors');
 console.log('PASS token card: contained combat tab, synchronized HP edits, temporary health, mobile bounds, close button and Escape');
};
