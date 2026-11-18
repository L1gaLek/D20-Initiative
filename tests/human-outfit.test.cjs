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
