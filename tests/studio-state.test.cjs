const test=require('node:test'),assert=require('node:assert/strict');
const state=import('../client/board-3d/studio-state.mjs');
test('studio project parsing clamps transforms, rejects incompatible files and preserves safe metadata',async()=>{
  const {normalizeProject,parseProject,defaultProject}=await state,p=defaultProject();p.parts.test={position:[99,-99,NaN],rotation:[99,0,0],scale:[0,99,NaN]};const n=normalizeProject(p);assert.deepEqual(n.parts.test.position,[.25,-.25,0]);assert.deepEqual(n.parts.test.scale,[.5,1.6,1]);assert.throws(()=>parseProject('{"format":"other"}'));assert.throws(()=>parseProject('x'.repeat(600001)));p.asset={file:'../secret.glb',sha256:'a'.repeat(64)};assert.equal(normalizeProject(p).asset,undefined);assert.equal(parseProject(JSON.stringify(n)).name,p.name);
});
test('studio equipment occupies the correct hands and frame interpolation is deterministic',async()=>{
  const {normalizeAppearance,sampleClip}=await state;let a=normalizeAppearance({right:'great',left:'long',shield:true});assert.equal(a.shield,false);assert.equal(a.left,null);a=normalizeAppearance({left:'long',shield:true,shieldHand:'left'});assert.equal(a.left,null);
  const c={duration:2,loop:false,keys:[{time:0,bones:{head:[0,0,0]}},{time:2,bones:{head:[1,2,3]}}]};assert.deepEqual(sampleClip(c,1).head,[.5,1,1.5]);assert.deepEqual(sampleClip(c,3).head,[1,2,3]);
});
test('editable plate parts reproduce their compiled game transforms and animation stays bounded',async()=>{
  const {defaultProject}=await state,{createHuman}=await import('../client/board-3d/human.mjs'),T=await import('../vendor/three/three.module.mjs'),p=defaultProject();p.appearance.right=null;p.parts['spine03::sculpted-breast-cup#1']={position:[.015,0,0],rotation:[0,.08,0],scale:[1.02,1,1]};
  const config={...p.appearance,studio:p},editable=createHuman(config,{editable:true}),compiled=createHuman(config);try{
    let selected;editable.traverse(o=>{if(o.userData.studioPart==='spine03::sculpted-breast-cup#1')selected=o;});assert.ok(selected);assert.ok(Math.abs(selected.position.x-selected.userData.basePosition[0]-.015)<1e-7);
    const bounds=f=>{f.userData.setStudioTime(0,'idle');f.updateMatrixWorld(true);return new T.Box3().setFromObject(f,true);};const a=bounds(editable),b=bounds(compiled);assert.ok(a.min.distanceTo(b.min)<1e-5);assert.ok(a.max.distanceTo(b.max)<1e-5);compiled.userData.playStudioAction('attack_sword');for(let i=0;i<80;i++)compiled.userData.advanceStudio(.02);assert.equal(compiled.userData.studioAnimating,false);
  }finally{for(const f of [editable,compiled]){const mats=new Set();f.traverse(o=>{o.userData.dispose?.();o.geometry?.dispose();if(o.material)mats.add(o.material);});mats.forEach(m=>m.dispose());}}
});
test('a studio sword attack follows the equipped left hand without changing the shield arm',async()=>{
  const {defaultProject}=await state,{createHuman}=await import('../client/board-3d/human.mjs'),T=await import('../vendor/three/three.module.mjs'),p=defaultProject(),f=createHuman({...p.appearance,right:null,left:'long',shield:true,shieldHand:'right',studio:p});
  try{const bones=new Map();f.traverse(o=>{if(o.isBone)bones.set(o.name,o);});const left=bones.get('upperarm01.L'),right=bones.get('upperarm01.R'),l=left.quaternion.clone(),r=right.quaternion.clone();f.userData.setStudioTime(.22,'attack_sword');assert.ok(l.angleTo(left.quaternion)>.3);assert.ok(r.angleTo(right.quaternion)<1e-6);}
  finally{const mats=new Set();f.traverse(o=>{o.userData.dispose?.();o.geometry?.dispose();if(o.material)mats.add(o.material);});mats.forEach(m=>m.dispose());}
});
