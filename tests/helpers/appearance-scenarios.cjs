const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
module.exports=async({pages,screenshotDir})=>{
  const [gm,owner,other]=pages;
  const picture=async(page,selector,name)=>{if(screenshotDir){fs.mkdirSync(screenshotDir,{recursive:true});await page.locator(selector).screenshot({path:path.join(screenshotDir,name+'.png')});}};
  await owner.locator('#room-personal-settings').click();await owner.locator('[data-personal-tab=settings]').click();
  await owner.locator('[data-dice-style=prism]').waitFor();assert.equal(await owner.locator('[data-dice-style]').count(),10);
  const previews=await owner.locator('.personal-dice-gallery canvas').evaluateAll(canvases=>canvases.map(c=>c.toDataURL()));assert.equal(new Set(previews).size,10);
  await owner.locator('[data-dice-style=prism]').click();
  await owner.locator('[data-preference=boardBackground]').evaluate(el=>{el.value='#294458';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await owner.locator('[data-preference=boardGrid]').evaluate(el=>{el.value='#d7bd73';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await owner.waitForFunction(()=>document.querySelector('.personal-settings__status').textContent==='Настройки сохранены');
  assert.equal(await owner.locator('#game-board .cell').first().evaluate(el=>getComputedStyle(el).outlineColor),'rgb(215, 189, 115)');
  assert.equal(await other.evaluate(()=>PersonalPreferences.get().boardGrid),'#666666');
  await owner.evaluate(async()=>{localStorage.removeItem('d20_preferences_v1:'+myId);await PersonalPreferences.load();});
  assert.equal(await owner.evaluate(()=>PersonalPreferences.get().boardBackground),'#294458');
  await picture(owner,'.personal-settings__panel','appearance-settings');await owner.locator('[data-personal-close]').click();
  await owner.evaluate(()=>{const select=document.getElementById('board-view-mode-select');select.value='3d';select.dispatchEvent(new Event('change'));});
  await owner.waitForFunction(()=>Board3D.inspect().ready);
  assert.equal(await owner.evaluate(()=>Board3D.inspect().appearance.background),'294458');
  const builds=await owner.evaluate(()=>Board3D.inspect().counters.terrainBuilds);
  await owner.evaluate(()=>PersonalPreferences.set({boardGrid:'#75c9aa'}));await owner.waitForFunction(()=>Board3D.inspect().appearance.grid==='75c9aa');
  assert.equal(await owner.evaluate(()=>Board3D.inspect().counters.terrainBuilds),builds,'changing colors does not rebuild terrain');
  await owner.evaluate(()=>{const select=document.getElementById('board-view-mode-select');select.value='topdown';select.dispatchEvent(new Event('change'));});
  for(const skin of await owner.evaluate(()=>D20Appearance.styles.map(s=>s.id))){
    await owner.evaluate(async skin=>{PersonalPreferences.set({diceStyle:skin,reduceDiceMotion:true});await sendMessage({type:'diceEvent',event:{localNonce:'skin-'+skin,fromId:myId,fromName:'Альрик',sides:20,count:3,rolls:[20,1,13],total:34,kindText:'Набор '+skin}});},skin);
    await Promise.all(pages.map(page=>page.waitForFunction(skin=>DiceTable.inspect().state==='settled'&&DiceTable.inspect().dice?.length===3&&DiceTable.inspect().dice.every(d=>d.diceStyle===skin),skin)));
    for(const page of [owner,other])assert.deepEqual(await page.evaluate(()=>DiceTable.inspect().dice.map(d=>d.upLabel)),['20','1','13']);
    if(['prism','runes','dragon','royal'].includes(skin))await picture(owner,'#dice-others','dice-'+skin);
  }
  assert.ok(await owner.evaluate(()=>DiceTable.inspect().textures)<35,'the ten-style material cache is bounded');
  await owner.evaluate(()=>PersonalPreferences.set({diceStyle:'prism',reduceDiceMotion:false}));
  console.log('PASS appearance: ten distinct previews/material sets, critical d20 labels preserved, same thrower skin reaches five clients, personal 2D/3D colors persist/isolate and do not rebuild terrain');
};
