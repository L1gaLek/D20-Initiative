const test=require('node:test'),assert=require('node:assert/strict');
const modules=Promise.all([import('../vendor/three/three.module.mjs'),import('../client/board-3d/human.mjs'),import('../client/board-3d/human-outfit.mjs')]);
async function fixture(model){
 const [T,{createHuman}]=await modules,base=createHuman({model,armor:'none'});let body;
 base.traverse(o=>{if(o.name==='anatomical-body')body=o;});
 const original=body.skeleton.bones,names=original.map(b=>b.name).reverse(),bones=names.map(name=>{const b=new T.Bone();b.name=T.PropertyBinding.sanitizeNodeName(name);return b;}),skeleton=new T.Skeleton(bones),group=new T.Group();
 const geometry=body.geometry.clone(),a=geometry.attributes;
 for(let i=0;i<a.skinIndex.array.length;i++)a.skinIndex.array[i]=names.indexOf(original[a.skinIndex.array[i]].name);
 const skin=new T.SkinnedMesh(geometry,body.material);skin.name='anatomical-body';skin.bind(skeleton,new T.Matrix4());group.add(skin);
 const garment=new T.BufferGeometry();garment.setAttribute('position',new T.Float32BufferAttribute([-.42,1.08,.18,-.44,1.08,.18,-.43,1.10,.18],3));garment.setIndex([0,1,2]);garment.computeVertexNormals();
 const joint=names.indexOf('wrist.R');garment.setAttribute('skinIndex',new T.Uint16BufferAttribute([joint,0,0,0,joint,0,0,0,joint,0,0,0],4));garment.setAttribute('skinWeight',new T.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));
 const mesh=new T.SkinnedMesh(garment,new T.MeshStandardMaterial());mesh.name='outfit-test';mesh.userData.d20OutfitPart=true;mesh.bind(skeleton,new T.Matrix4());group.add(mesh);
 return {T,createHuman,source:{scene:group},base,body,mesh};
}
for(const sex of ['male','female'])test('external '+sex+' outfit remaps reordered GLB bones and follows the live wrist',async()=>{
 const {T,createHuman,source}=await fixture('human-'+sex),human=createHuman({model:'human-'+sex,armor:'leather',right:'long',shield:true},{outfit:source});let garment,body;
 human.traverse(o=>{if(o.name==='outfit-test')garment=o;if(o.name==='anatomical-body')body=o;});
 assert.deepEqual(human.userData.outfit,{parts:2,bones:163});assert.equal(garment.skeleton,body.skeleton);
 const wrist=garment.skeleton.bones.find(b=>b.name==='wrist.R');human.updateMatrixWorld(true);const before=garment.getVertexPosition(0,new T.Vector3());
 wrist.position.y+=.15;human.updateMatrixWorld(true);const after=garment.getVertexPosition(0,new T.Vector3());assert.ok(before.distanceTo(after)>.14);
 assert.equal(garment.skeleton.bones[garment.geometry.attributes.skinIndex.getX(0)].name,'wrist.R');
 let oldArmor=false;human.traverse(o=>{if(o.name.startsWith('armor-leather')||o.name.startsWith('armor-none'))oldArmor=true;});assert.equal(oldArmor,false);
});
test('incompatible outfit fails before removing or changing the existing body',async()=>{
 const {base,body,mesh,source}=await fixture('human-male'),[,,{applyHumanOutfit}]=await modules;
 mesh.skeleton.bones[mesh.geometry.attributes.skinIndex.getX(0)].name='foreign-unknown-wrist';
 assert.throws(()=>applyHumanOutfit(base,source),/incompatible skin weights/);assert.ok(body.parent);assert.ok(body.geometry.attributes.position.count>10000);
});
test('female breastplate uses the fitted source, keeps the native rig and edits only its selected piece',async()=>{
 const [T,{createHuman}]=await modules;
 const figure=createHuman({model:'human-female',armor:'breastplate',hair:'braid'},{editable:true});
 try{
  assert.equal(figure.userData.armorQuality,'fitted-cuirass');assert.deepEqual(figure.userData.outfit,{parts:9,bones:163});
  const body=figure.getObjectByName('anatomical-body'),armor=figure.getObjectByName('Steel cuirass — Armor'),boots=figure.getObjectByName('Steel cuirass — Boots');assert.equal(armor.skeleton,body.skeleton);
  assert.ok(armor.skeleton.bones.every(b=>!b.name.startsWith('NPC ')));
  const original=armor.geometry.attributes.position.array.slice(),other=boots.geometry.attributes.position.array.slice(),id=armor.userData.outfitId;
  figure.userData.applyStudioOutfitPart(id,{position:[.01,0,0],rotation:[0,0,0],scale:[1,1,1]});
  assert.ok(Math.abs(armor.geometry.attributes.position.getX(0)-original[0]-.01)<1e-6);assert.deepEqual(boots.geometry.attributes.position.array,other);
  figure.userData.applyStudioOutfitPart(id,{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]});assert.deepEqual(armor.geometry.attributes.position.array,original);
  for(const t of [0,.1,.2]){figure.userData.walkPoseAt(t,true);figure.updateMatrixWorld(true);assert.ok(armor.getVertexPosition(0,new T.Vector3()).toArray().every(Number.isFinite));}
 }finally{const materials=new Set();figure.traverse(o=>{o.geometry?.dispose();if(o.material)materials.add(o.material);});materials.forEach(m=>m.dispose());figure.userData.dispose();}
});

test('Quaternius Standard retains the native body and rig across both sexes, outfits, hood and fallback armor',async()=>{
 const [T,{createHuman,ensureArmorAsset}]=await modules;
 for(const model of ['human-male','human-female'])for(const armor of ['none','leather'])for(const outfitHood of [false,true]){
  const config={model,armor,outfitStyle:'quaternius',outfitHood,right:'long',shield:true};await ensureArmorAsset(config);const figure=createHuman(config,{editable:true});
  try{
   assert.equal(figure.userData.armorQuality,'quaternius-standard');const body=figure.getObjectByName('anatomical-body');assert.equal(body.skeleton.bones.length,163);assert.ok(!body.skeleton.bones.some(b=>b.name==='pelvis'));
   let sourceParts=0,hoods=0;
   figure.traverse(o=>{if(!o.isSkinnedMesh||!o.userData.outfitId)return;sourceParts++;if(o.name.includes('Hood'))hoods++;const a=o.geometry.attributes;assert.equal(o.skeleton,body.skeleton);assert.equal(a.uv.count,a.position.count);assert.ok(a.position.array.every(Number.isFinite));assert.ok(a.normal.array.every(Number.isFinite));for(let i=0;i<a.skinWeight.count;i++){let sum=0;for(let k=0;k<4;k++)sum+=a.skinWeight.array[i*4+k];assert.ok(Math.abs(sum-1)<1e-5);}});
   assert.ok(sourceParts>=4);assert.equal(hoods,armor==='leather'&&outfitHood?1:0);
   for(const time of [0,.105,.21]){figure.userData.walkPoseAt(time,true);figure.updateMatrixWorld(true);assert.ok(body.getVertexPosition(5,new T.Vector3()).toArray().every(Number.isFinite));}
  }finally{const mats=new Set();figure.traverse(o=>{o.geometry?.dispose();if(o.material)mats.add(o.material);});mats.forEach(m=>m.dispose());figure.userData.dispose();}
 }
 const fallback=createHuman({model:'human-female',armor:'plate',outfitStyle:'quaternius'});assert.equal(fallback.userData.armorQuality,'forged-volume');fallback.traverse(o=>o.geometry?.dispose());fallback.userData.dispose();
});
