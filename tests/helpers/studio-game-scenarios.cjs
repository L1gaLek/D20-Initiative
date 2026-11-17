const assert=require('node:assert/strict');
module.exports=async function({owner,gm}){
  const {defaultProject}=await import('../../client/board-3d/studio-state.mjs'),p=defaultProject();p.name='Проверка мастерской';p.parts['spine03::sculpted-breast-cup#1']={position:[.012,0,0],rotation:[0,.04,0],scale:[1,1,1]};p.materials.steel={color:'#b8a784',metalness:.8,roughness:.6};p.clips.attack_sword.duration=2;
  const before=await owner.evaluate(()=>{const p=players.find(p=>p.id==='player-3');return {slots:JSON.stringify(p.sheet.parsed.appearance.slots),ac:p.sheet.parsed.vitality.ac.value};});
  await owner.locator('[data-studio-file]').setInputFiles({name:'test.d20studio.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
  await Promise.all([owner,gm].map(page=>page.waitForFunction(()=>Board3D.inspect().tokens.find(t=>t.id==='player-3')?.avatar?.studio?.name==='Проверка мастерской')));
  const after=await owner.evaluate(()=>{const p=players.find(p=>p.id==='player-3');return {slots:JSON.stringify(p.sheet.parsed.appearance.slots),ac:p.sheet.parsed.vitality.ac.value};});assert.deepEqual(after,before,'visual presets preserve equipped items and AC');
  assert.equal(await owner.evaluate(()=>Board3D.playDiceAction({fromId:'user-1',fromName:players.find(p=>p.id==='player-3').name,kindText:'Атака: d20 +5',localNonce:'unauthorized-studio-test'})),false,'another player cannot animate this token');
  const started=Promise.all([owner,gm].map(page=>page.waitForFunction(()=>Board3D.inspect().tokens.find(t=>t.id==='player-3')?.studioAnimating)));
  await owner.evaluate(()=>DicePanel.roll({sides:20,count:1,bonus:5,kindText:'Атака: d20 +5',actorName:players.find(p=>p.id==='player-3').name}));await started;
  await Promise.all([owner,gm].map(page=>page.waitForFunction(()=>!Board3D.inspect().tokens.find(t=>t.id==='player-3')?.studioAnimating)));
  await owner.locator('[data-studio-reset]').click();await Promise.all([owner,gm].map(page=>page.waitForFunction(()=>!Board3D.inspect().tokens.find(t=>t.id==='player-3')?.avatar?.studio)));
  console.log('PASS studio/game: imported fit/material/animation preset reaches peers, real sword roll animates both clients, item statistics stay unchanged and unauthorized animation is rejected');
};
