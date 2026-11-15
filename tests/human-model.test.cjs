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
  for(const model of ['human-male','human-female'])for(const armor of kinds){
    const figure=createHuman({...config,model,hair:model==='human-female'?'bob':'parted',armor,right:'long',shield:true});
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

test('weapons sit inside curled palms and shields clear both forearms, including during walking',async()=>{
  const {createHuman}=await human,T=await three;
  const variants=[{stance:'unarmed'},{stance:'single',right:'long'},{stance:'single',left:'short'},{stance:'dual',right:'long',left:'short'},
    {stance:'shield',right:'long',shield:true,shieldHand:'left'},{stance:'shield',left:'long',shield:true,shieldHand:'right'}];
  for(const model of ['human-male','human-female']){
    const {default:asset}=await import(pathToFileURL(path.resolve(__dirname,`../assets/models/human/${model.slice(6)}.mjs`)).href);
    const defs=new Map(asset.bones.map(b=>[b.name,b]));
    for(const variant of variants){
      const figure=createHuman({...config,model,...variant});
      try{
        assert.equal(figure.userData.stance,variant.stance);let skeleton;const weapons=[],shields=[];
        figure.traverse(o=>{if(o.isSkinnedMesh)skeleton=o.skeleton;if(o.userData.attachment==='weapon')weapons.push(o);if(o.userData.attachment==='shield')shields.push(o);});
        assert.equal(weapons.length,Number(!!variant.right)+Number(!!variant.left));assert.equal(shields.length,Number(!!variant.shield));
        const bones=new Map(skeleton.bones.map(b=>[b.name,b]));
        for(const walk of [false,true,false]){
          figure.userData.pose(.12,walk);figure.updateMatrixWorld(true);
          for(const weapon of weapons){
            const side=weapon.userData.hand,center=weapon.getWorldPosition(new T.Vector3()),axis=new T.Vector3(0,1,0).applyQuaternion(weapon.getWorldQuaternion(new T.Quaternion()));
            const a=bones.get(`finger2-1.${side}`).getWorldPosition(new T.Vector3()),b=bones.get(`finger5-1.${side}`).getWorldPosition(new T.Vector3());
            assert.ok(Math.abs(a.sub(b).normalize().dot(axis))>.98,'handle runs across the palm, not out of its fingertips');
            for(let finger=2;finger<=5;finger++){
              const name=`finger${finger}-3.${side}`,definition=defs.get(name),tip=new T.Vector3(...definition.tail).sub(new T.Vector3(...definition.head)).applyMatrix4(bones.get(name).matrixWorld).sub(center);
              const along=tip.dot(axis),radius=tip.addScaledVector(axis,-along).length();
              assert.ok(radius>.008&&radius<.036,'fingertips wrap the grip surface');assert.ok(Math.abs(along)<.055,'all fingers remain on the handle');
            }
          }
          for(const shield of shields){
            const side=shield.userData.hand,handle=shield.getObjectByName('shield-hand-grip').getWorldPosition(new T.Vector3()),knuckles=new T.Vector3();
            for(let finger=2;finger<=5;finger++)knuckles.addScaledVector(bones.get(`finger${finger}-1.${side}`).getWorldPosition(new T.Vector3()),.25);
            assert.ok(handle.distanceTo(knuckles)<.04,'shield hand retains the back grip throughout the gait');
            const elbow=bones.get(`lowerarm01.${side}`).getWorldPosition(new T.Vector3()),wrist=bones.get(`wrist.${side}`).getWorldPosition(new T.Vector3());
            const axis=wrist.clone().sub(elbow).normalize(),body=figure.getObjectByName('anatomical-body'),a=body.geometry.attributes;
            for(const strap of shield.children.filter(o=>o.name==='shield-forearm-strap')){
              const center=strap.getWorldPosition(new T.Vector3());let radius=0,samples=0;
              for(let i=0;i<a.position.count;i++){
                let dominant=0;for(let j=1;j<4;j++)if(a.skinWeight.array[i*4+j]>a.skinWeight.array[i*4+dominant])dominant=j;
                if(!skeleton.bones[a.skinIndex.array[i*4+dominant]].name.startsWith('lowerarm')||!skeleton.bones[a.skinIndex.array[i*4+dominant]].name.endsWith('.'+side))continue;
                const p=body.localToWorld(body.getVertexPosition(i,new T.Vector3())).sub(center),along=p.dot(axis);if(Math.abs(along)>.012)continue;
                radius=Math.max(radius,p.addScaledVector(axis,-along).length());samples++;
              }
              assert.ok(samples>5);assert.ok(radius<strap.userData.radius-.003,'strap clears the actual posed forearm surface');
            }
            for(const t of [0,.25,.5,.75,1]){
              const p=shield.worldToLocal(elbow.clone().lerp(wrist,t)),back=.007+Math.max(0,1-(p.x/.16)**2)*.037;
              assert.ok(p.z+.033<back,'wooden back never intersects the forearm or bracer');
            }
          }
        }
      }finally{dispose(figure);}
    }
  }
});

test('every male and female hairstyle builds a finite, batched anatomical model',async()=>{
  const {createHuman}=await human;
  for(const gender of ['male','female'])for(const [hair] of AvatarData.hairstylesFor(gender)){
    const f=createHuman({...config,model:'human-'+gender,hair});let count=0;
    try{f.traverse(o=>{if(o.isMesh){count++;assert.ok(o.geometry.attributes.position.array.every(Number.isFinite));}});assert.ok(count<=20);}finally{dispose(f);}
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
