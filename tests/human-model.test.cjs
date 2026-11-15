const assert=require('node:assert/strict');
const test=require('node:test');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const AvatarData=require('../client/avatar-data');
const database=require('../equipment_srd5_ru.json').tabs;
const human=import(pathToFileURL(path.resolve(__dirname,'../client/board-3d/human.mjs')).href);
const three=import(pathToFileURL(path.resolve(__dirname,'../vendor/three/three.module.mjs')).href);
const config={model:'human-male',armor:'none',hair:'parted',hairColor:'#493124',right:null,left:null,shield:false};
function dispose(figure){const materials=new Set();figure.traverse(o=>{o.userData.dispose?.();o.geometry?.dispose();if(o.material)materials.add(o.material);});materials.forEach(m=>m.dispose());}

test('anatomical model and every database armor have valid surfaces and normalized skin weights',async()=>{
  const {createHuman}=await human;
  const kinds=['none',...database.armor.filter(a=>a.armor.type!=='shield').map(AvatarData.armorKind)];
  for(const armor of kinds){
    const figure=createHuman({...config,armor,right:'long',shield:true});
    try{
      const skeletons=new Set();let meshes=0,triangles=0,anatomy=false;
      figure.traverse(o=>{
        if(!o.isMesh)return;meshes++;assert.equal(o.isSkinnedMesh,true,'rigid fittings share the skinning batch');skeletons.add(o.skeleton);
        const g=o.geometry,a=g.attributes;triangles+=g.index.count/3;anatomy||=o.name==='anatomical-body';
        assert.equal(a.normal.count,a.position.count);assert.equal(a.skinIndex.count,a.position.count);assert.equal(a.skinWeight.count,a.position.count);
        assert.ok(g.index.array.every(i=>i<a.position.count),'no invalid triangle indices');
        assert.ok(a.position.array.every(Number.isFinite));assert.ok(a.normal.array.every(Number.isFinite));
        for(let i=0;i<a.position.count;i++){
          let sum=0;for(let k=0;k<4;k++){const w=a.skinWeight.array[i*4+k];assert.ok(w>=0&&w<=1);sum+=w;assert.ok(a.skinIndex.array[i*4+k]<o.skeleton.bones.length);}
          assert.ok(Math.abs(sum-1)<1e-5,'clipped seams retain normalized weights');
        }
      });
      assert.equal(skeletons.size,1);assert.equal(anatomy,true);assert.ok(triangles>25000);assert.ok(meshes<=20,'bounded draw calls despite detailed equipment');
      const skeleton=[...skeletons][0];assert.equal(skeleton.bones.length,163);assert.ok(skeleton.bones.some(b=>b.name==='finger3-3.R'));
      skeleton.computeBoneTexture();let released=false;skeleton.boneTexture.addEventListener('dispose',()=>{released=true;});figure.userData.dispose();assert.equal(released,true);
    }finally{dispose(figure);}
  }
});

test('walking deforms the anatomical legs and equipped hand, then restores the idle pose',async()=>{
  const {createHuman}=await human,{Vector3}=await three;
  const figure=createHuman({...config,armor:'plate',right:'long',shield:true});
  try{
    const meshes=[];figure.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
    const skeleton=meshes[0].skeleton,leg=skeleton.bones.find(b=>b.name==='upperleg01.L'),hand=skeleton.bones.find(b=>b.name==='wrist.R');
    figure.updateMatrixWorld(true);const beforeLeg=leg.getWorldQuaternion(new (await three).Quaternion()),beforeHand=hand.getWorldPosition(new Vector3());
    figure.userData.pose(.14,true);figure.updateMatrixWorld(true);
    assert.ok(Math.abs(figure.userData.walkAngle)>.1);assert.ok(beforeLeg.angleTo(leg.getWorldQuaternion(new (await three).Quaternion()))>.1);
    assert.ok(beforeHand.distanceTo(hand.getWorldPosition(new Vector3()))>.01,'equipment hand participates in gait');
    for(const m of meshes){for(let i=0;i<m.geometry.attributes.position.count;i+=101)assert.ok(m.getVertexPosition(i,new Vector3()).toArray().every(Number.isFinite));}
    figure.userData.pose(0,false);figure.updateMatrixWorld(true);assert.equal(figure.userData.walkAngle,0);assert.ok(beforeHand.distanceTo(hand.getWorldPosition(new Vector3()))<1e-6);
  }finally{dispose(figure);}
});
