const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({pages,screenshotDir})=>{
 const [gm,owner]=pages;await owner.evaluate(()=>InfoModal.open(players.find(p=>p.id==='player-1')));
 await owner.locator('.sheet-tab[data-tab="appearance"]').click();await owner.locator('[data-sheet-path="appearance.model3d.outfitStyle"]').selectOption('quaternius');
 await owner.waitForFunction(()=>Character3D.inspect()?.armorQuality==='quaternius-standard',null,{timeout:60000});assert.equal(await owner.evaluate(()=>Character3D.inspect().config.outfitStyle),'quaternius');
 await gm.evaluate(async()=>{applyBoardViewMode('3d');await Board3D.setActive(true);});
 await gm.waitForFunction(()=>Board3D.inspect().tokens?.some(t=>t.id==='player-1'&&t.armorQuality==='quaternius-standard'),null,{timeout:60000});
 await owner.locator('[data-sheet-path="appearance.model3d.outfitHood"]').check();await owner.waitForFunction(()=>Character3D.inspect().config.outfitHood===true);
 if(screenshotDir){fs.mkdirSync(screenshotDir,{recursive:true});await owner.locator('[data-avatar-preview]').screenshot({path:path.join(screenshotDir,'quaternius-sheet.png')});}
 await owner.locator('[data-appearance-slot="armor"]').selectOption('');await owner.waitForFunction(()=>Character3D.inspect().config.armor==='none'&&Character3D.inspect().armorQuality==='quaternius-standard');
 await owner.locator('[data-sheet-path="notes.details.gender.value"]').selectOption('male');await owner.waitForFunction(()=>Character3D.inspect().config.model==='human-male'&&Character3D.inspect().armorQuality==='quaternius-standard');
 console.log('PASS Quaternius browser: sheet collection and hood persist, portrait and peer board agree, both sexes and clothing-by-equipment work');
};
