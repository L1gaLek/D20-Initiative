const assert=require('node:assert/strict'),path=require('node:path');
const AvatarData=require('../../client/avatar-data'),equipment=require('../../equipment_srd5_ru.json').tabs;

module.exports=async function({owner,gm,open,screenshotDir}){
  const slot=hand=>owner.locator(`[data-appearance-slot="${hand}"]`),hair=owner.locator('[data-sheet-path="appearance.model3d.hairStyle"]'),gender=owner.locator('[data-sheet-path="notes.details.gender.value"]');
  async function stance(value){await owner.waitForFunction(s=>Character3D.inspect()?.stance===s,value);await gm.waitForFunction(s=>Board3D.inspect().tokens.find(t=>t.id==='player-3')?.stance===s,value);}
  async function saveScreenshot(name){if(screenshotDir)await owner.locator('[data-avatar-preview]').screenshot({path:path.join(screenshotDir,name+'.png')});}
  await stance('shield');assert.equal(await slot('left').inputValue(),'');
  await slot('left').selectOption('weapon_shortsword');
  await gm.waitForFunction(()=>{const p=players.find(p=>p.id==='player-3'),a=Board3D.inspect().tokens.find(t=>t.id===p.id).avatar;return a.shieldHand==='right'&&a.left==='short'&&a.right===null&&p.sheet.parsed.appearance.slots.right==='';});
  assert.equal(await slot('right').inputValue(),'');assert.equal(await slot('left').inputValue(),'weapon_shortsword');
  await slot('right').selectOption('weapon_longsword');
  await gm.waitForFunction(()=>Board3D.inspect().tokens.find(t=>t.id==='player-3').avatar.shieldHand==='left');assert.equal(await slot('left').inputValue(),'');
  await slot('shield').selectOption('');await stance('single');await saveScreenshot('human-stance-single');
  await slot('left').selectOption('weapon_shortsword');await stance('dual');await saveScreenshot('human-stance-dual');
  await slot('right').selectOption('');await stance('single');await slot('left').selectOption('');await stance('unarmed');
  await slot('shield').selectOption('armor_shield');const shieldAc=await owner.locator('[data-sheet-path="vitality.ac.value"]').inputValue();
  await slot('right').selectOption('weapon_greatsword');await stance('two-handed');assert.equal(await slot('shield').inputValue(),'');assert.equal(await slot('left').inputValue(),'');
  assert.equal(+await owner.locator('[data-sheet-path="vitality.ac.value"]').inputValue(),+shieldAc-2,'shield removal updates AC in the same edit');
  await gm.waitForFunction(()=>{const a=Board3D.inspect().tokens.find(t=>t.id==='player-3').avatar;return a.right==='great'&&a.twoHanded==='right'&&!a.shield;});await saveScreenshot('human-two-handed-male');
  await owner.locator('[data-avatar-walk]').click();await owner.waitForFunction(()=>Math.abs(Character3D.inspect().angle)>.05);await owner.locator('[data-avatar-walk]').click();
  await owner.evaluate(()=>InfoModal.close());await open(owner);assert.equal(await slot('right').inputValue(),'weapon_greatsword');assert.equal(await slot('shield').inputValue(),'');
  await slot('left').selectOption('weapon_longsword');await stance('single');assert.equal(await slot('right').inputValue(),'');
  await slot('left').selectOption('weapon_greatsword');await stance('two-handed');
  await slot('shield').selectOption('armor_shield');await stance('shield');assert.equal(await slot('left').inputValue(),'');await slot('shield').selectOption('');

  await gender.selectOption('female');
  await owner.waitForFunction(()=>Character3D.inspect()?.config.model==='human-female');
  await gm.waitForFunction(()=>Board3D.inspect().tokens.find(t=>t.id==='player-3')?.avatar?.model==='human-female');
  assert.deepEqual(await hair.locator('option').evaluateAll(options=>options.map(o=>o.value)),AvatarData.hairstylesFor('female').map(([id])=>id));
  await slot('left').selectOption('weapon_greatsword');await stance('two-handed');await saveScreenshot('human-two-handed-female');await slot('left').selectOption('');await stance('unarmed');
  await slot('armor').selectOption('');await hair.selectOption('bob');await saveScreenshot('human-female-underwear');
  for(const item of equipment.armor.filter(a=>a.armor.type!=='shield')){
    await slot('armor').selectOption(item.id);const expected=AvatarData.armorKind(item);
    await gm.waitForFunction(kind=>Board3D.inspect().tokens.find(t=>t.id==='player-3').avatar.armor===kind,expected);
    assert.equal(await owner.evaluate(()=>Character3D.inspect().config.armor),expected);
    if(['armor_leather','armor_chain-mail','armor_plate'].includes(item.id))await saveScreenshot('human-female-'+item.id);
  }
  const memory=await owner.evaluate(()=>Character3D.inspect().render);
  for(const [style] of AvatarData.hairstylesFor('female')){await hair.selectOption(style);await owner.waitForFunction(h=>Character3D.inspect().config.hair===h,style);await owner.waitForTimeout(40);}
  await hair.selectOption('braid');await owner.locator('[data-hair-color="#d6bd7a"]').click();
  await gender.selectOption('male');await owner.waitForFunction(()=>Character3D.inspect().config.model==='human-male');assert.equal(await hair.inputValue(),'tied','male hairstyle survives changing the gender');
  await gender.selectOption('female');await owner.waitForFunction(()=>Character3D.inspect().config.model==='human-female');assert.equal(await hair.inputValue(),'braid','female hairstyle is remembered separately');
  await slot('left').selectOption('weapon_longsword');await slot('shield').selectOption('armor_shield');await stance('shield');assert.equal(await slot('right').inputValue(),'');
  await gm.waitForFunction(()=>{const a=Board3D.inspect().tokens.find(t=>t.id==='player-3').avatar;return a.model==='human-female'&&a.left==='long'&&a.shieldHand==='right'&&a.hair==='braid'&&a.hairColor==='#d6bd7a';});
  await owner.locator('[data-avatar-walk]').click();await owner.waitForFunction(()=>Math.abs(Character3D.inspect().angle)>.05);await owner.locator('[data-avatar-walk]').click();
  await owner.evaluate(()=>InfoModal.close());await open(owner);
  assert.equal(await gender.inputValue(),'female');assert.equal(await hair.inputValue(),'braid');assert.equal(await slot('right').inputValue(),'');assert.equal(await slot('left').inputValue(),'weapon_longsword');
  await owner.waitForTimeout(80);const after=await owner.evaluate(()=>Character3D.inspect().render);
  assert.ok(after.geometries<=memory.geometries+4);assert.ok(after.textures<=memory.textures+1);assert.ok(after.calls<=44);
  await saveScreenshot('human-female-shield-right');
  await owner.setViewportSize({width:420,height:900});assert.equal(await owner.locator('[data-appearance-root]').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);if(screenshotDir)await owner.screenshot({path:path.join(screenshotDir,'human-female-mobile.png')});await owner.setViewportSize({width:1440,height:1000});
  console.log('PASS human equipment: five actual stances; two-handed weapon clears shield and AC, persists and releases both hands on replacement; shield switches arms on both clients; both bodies/all 11 armors/all hairstyles render, persist and release old GPU resources');
};
