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

test('prepared plate meshes retain UVs and shared reflections survive disposal of a neighboring token',async()=>{
  const {createHuman}=await human,figures=['human-male','human-female'].map(model=>createHuman({...config,model,armor:'plate'}));
  let reflection,disposed=0;
  try{
    for(const figure of figures){let plates=0;figure.traverse(o=>{
      if(!o.isMesh||!o.material.userData.materialSource)return;plates++;
      const a=o.geometry.attributes;assert.equal(a.uv.count,a.position.count);assert.ok(a.uv.array.every(Number.isFinite));
      for(let i=0;i<a.normal.count;i++)assert.ok(Math.abs(Math.hypot(a.normal.getX(i),a.normal.getY(i),a.normal.getZ(i))-1)<1e-4,'prepared surfaces have usable unit normals');
      if(o.material.envMap){reflection??=o.material.envMap;assert.equal(o.material.envMap,reflection);}
    });assert.ok(plates>=5);}
    reflection.addEventListener('dispose',()=>disposed++);dispose(figures.shift());assert.equal(disposed,0,'one token cannot release another token’s reflection');
  }finally{figures.forEach(dispose);}
  assert.equal(disposed,1,'the last plate token releases the shared GPU reflection');
});

test('portable male and female plate models embed their skeleton, materials and looping walk',()=>{
  const fs=require('node:fs');
  for(const sex of ['male','female']){
    const bytes=fs.readFileSync(path.resolve(__dirname,'../assets/models/plate/'+sex+'.glb'));
    assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
    const jsonLength=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+jsonLength).toString()),bin=28+jsonLength;
    assert.equal(bytes.readUInt32LE(24+jsonLength),0x004e4942);assert.equal(doc.skins[0].joints.length,163);
    assert.equal(doc.images.length,9);assert.ok(doc.images.every(i=>i.bufferView!==undefined&&!i.uri));
    assert.ok(doc.bufferViews.every(v=>v.byteOffset+v.byteLength<=doc.buffers[0].byteLength));
    assert.ok(doc.buffers[0].byteLength<=bytes.length-bin);assert.equal(doc.animations[0].name,'Walk');assert.ok(doc.animations[0].channels.length>=4);
    for(const sampler of doc.animations[0].samplers){
      const a=doc.accessors[sampler.output],v=doc.bufferViews[a.bufferView],values=new Float32Array(bytes.buffer,bytes.byteOffset+bin+v.byteOffset,a.count*4);
      for(let k=0;k<4;k++)assert.ok(Math.abs(values[k]-values[values.length-4+k])<1e-6,'walk loops without a pose jump');
    }
  }
});

test('prepared plate sources and portable geometry match the current game models',async()=>{
  const fs=require('node:fs'),{createHash}=require('node:crypto'),{createHuman}=await human;
  const digest=bytes=>createHash('sha256').update(bytes).digest('hex'),hashes=require('../assets/models/plate/source-hashes.json');
  assert.ok(hashes['scripts/plate-reference-parts.mjs']);
  for(const [file,hash]of Object.entries(hashes))assert.equal(digest(fs.readFileSync(path.resolve(__dirname,'..',file),'utf8').replace(/\r\n/g,'\n')),hash,'rebake armor after changing '+file);
  for(const sex of ['male','female']){
    const bytes=fs.readFileSync(path.resolve(__dirname,'../assets/models/plate/'+sex+'.glb')),jsonLength=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+jsonLength)),bin=28+jsonLength;
    const f=createHuman({model:'human-'+sex,armor:'plate',hair:sex==='female'?'braid':'parted',hairColor:'#493124'}),meshes=[];
    try{
      f.traverse(o=>{if(o.isMesh)meshes.push(o);});assert.equal(meshes.length,doc.meshes.length);
      for(const [i,mesh]of meshes.entries()){
        const accessor=doc.accessors[doc.meshes[i].primitives[0].attributes.POSITION],view=doc.bufferViews[accessor.bufferView],array=mesh.geometry.attributes.position.array;
        assert.equal(digest(bytes.subarray(bin+view.byteOffset,bin+view.byteOffset+view.byteLength)),digest(Buffer.from(array.buffer,array.byteOffset,array.byteLength)),'downloadable '+sex+' geometry equals the rendered character');
      }
    }finally{dispose(f);}
  }
});

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
      assert.equal(skeletons.size,1);assert.equal(anatomy,true);assert.ok(triangles>25000&&triangles<150000,'detailed fittings retain a bounded geometry budget');assert.ok(meshes<=20,'bounded draw calls despite detailed equipment');
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
            const blade=axis.clone().negate();assert.ok(blade.x*(side==='R'?-1:1)>.6,'the sword points outside the wielding side');if(variant.shield)assert.ok(blade.y<-.5,'the shield guard lowers the sword');else assert.ok(blade.y>.25,'a lone sword is raised in the ready guard');
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
            const across=bones.get(`finger2-1.${side}`).getWorldPosition(new T.Vector3()).sub(bones.get(`finger5-1.${side}`).getWorldPosition(new T.Vector3())).normalize();
            const forward=bones.get(`finger3-1.${side}`).getWorldPosition(new T.Vector3()).sub(bones.get(`wrist.${side}`).getWorldPosition(new T.Vector3()));forward.addScaledVector(across,-forward.dot(across)).normalize();
            const palm=new T.Vector3().crossVectors(across,forward).multiplyScalar(side==='R'?1:-1).normalize(),outside=new T.Vector3(0,0,1).applyQuaternion(shield.getWorldQuaternion(new T.Quaternion()));
            assert.ok(palm.dot(outside)<-.98,'knuckles face the wooden back and the palm faces the wearer');
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
              const p=shield.worldToLocal(elbow.clone().lerp(wrist,t)),back=.007+Math.max(0,1-(p.x/shield.userData.backRadius)**2)*shield.userData.backBulge;
              assert.ok(p.z+.033<back,'wooden back never intersects the forearm or bracer');
            }
          }
        }
      }finally{dispose(figure);}
    }
  }
});

test('one enlarged greatsword is held by both hands throughout walking, for either dominant hand and both bodies',async()=>{
  const {createHuman}=await human,T=await three;
  for(const model of ['human-male','human-female'])for(const side of ['R','L']){
    const {default:asset}=await import(pathToFileURL(path.resolve(__dirname,`../assets/models/human/${model.slice(6)}.mjs`)).href),defs=new Map(asset.bones.map(b=>[b.name,b]));
    const hand=side==='R'?'right':'left',figure=createHuman({...config,model,armor:'half-plate',[hand]:'great',twoHanded:hand,shield:true});
    try{
      const weapons=[],shields=[];let skeleton;figure.traverse(o=>{if(o.isSkinnedMesh)skeleton=o.skeleton;if(o.userData.attachment==='weapon')weapons.push(o);if(o.userData.attachment==='shield')shields.push(o);});
      assert.equal(figure.userData.stance,'two-handed');assert.equal(weapons.length,1);assert.equal(shields.length,0);
      const weapon=weapons[0],bones=new Map(skeleton.bones.map(b=>[b.name,b]));
      for(const moving of [false,true,true,false]){
        figure.userData.pose(.14,moving);figure.updateMatrixWorld(true);
        const center=weapon.getWorldPosition(new T.Vector3()),axis=new T.Vector3(0,1,0).applyQuaternion(weapon.getWorldQuaternion(new T.Quaternion()));
        const centers=[];
        for(const h of ['R','L']){
          const p=new T.Vector3();for(let finger=2;finger<=5;finger++)p.addScaledVector(bones.get(`finger${finger}-1.${h}`).getWorldPosition(new T.Vector3()),.25);
          const delta=p.clone().sub(center),along=delta.dot(axis);centers.push(along);
          assert.ok(delta.addScaledVector(axis,-along).length()<.055,'both palms stay wrapped around the same hilt');
          assert.ok(along>-.05&&along<.17,'both hands remain on the extended grip');
          for(let finger=2;finger<=5;finger++){
            const name=`finger${finger}-3.${h}`,definition=defs.get(name),gripCenter=center.clone().addScaledVector(axis,h===side?0:.115);
            const tip=new T.Vector3(...definition.tail).sub(new T.Vector3(...definition.head)).applyMatrix4(bones.get(name).matrixWorld).sub(gripCenter),axial=tip.dot(axis),radial=tip.addScaledVector(axis,-axial).length();
            assert.ok(radial>.008&&radial<.036,'both sets of fingers curl around the shared handle');assert.ok(Math.abs(axial)<.055);
          }
        }
        assert.ok(Math.abs(centers[0]-centers[1])>.085,'hands do not overlap on the grip');
        let tip=0;
        figure.traverse(o=>{if(!o.isSkinnedMesh)return;const a=o.geometry.attributes;for(let i=0;i<a.position.count;i++){if(skeleton.bones[a.skinIndex.array[i*4]].name!==`wrist.${side}`)continue;const p=o.localToWorld(o.getVertexPosition(i,new T.Vector3())).sub(center);tip=Math.max(tip,-p.dot(axis));}});
        assert.ok(tip>1.10,'the actual blade is over twice the longsword blade length');
      }
    }finally{dispose(figure);}
  }
});

test('every male and female hairstyle builds a finite, batched anatomical model',async()=>{
  const {createHuman}=await human;
  for(const gender of ['male','female'])for(const [hair] of AvatarData.hairstylesFor(gender)){
    const f=createHuman({...config,model:'human-'+gender,hair});let count=0;
    try{f.traverse(o=>{if(o.isMesh){count++;assert.ok(o.geometry.attributes.position.array.every(Number.isFinite));}});assert.ok(count<=20);}finally{dispose(f);}
  }
});

test('reference armor silhouettes distinguish long mail, short shirts and male plate head protection',async()=>{
  const {createHuman}=await human;
  const hem=armor=>{
    const f=createHuman({...config,armor});let low=Infinity;
    try{f.traverse(o=>{if(!o.isSkinnedMesh||!o.name.includes('split-skirt'))return;const a=o.geometry.attributes;for(let i=0;i<a.position.count;i++)if(o.skeleton.bones[a.skinIndex.getX(i)].name.startsWith('upperleg01'))low=Math.min(low,a.position.getY(i));});return low;}finally{dispose(f);}
  };
  assert.ok(hem('chain-mail')<.57,'the hauberk reaches below the knee');assert.ok(hem('chain-shirt')>.65,'the shirt has a shorter split hem');
  for(const model of ['human-male','human-female']){
    const f=createHuman({...config,model,armor:'plate'});let helmet=false,thigh=false;
    try{f.traverse(o=>{helmet||=o.name.includes('armor-plate-helmet');thigh||=o.name.includes('thigh-guard');});assert.equal(helmet,model==='human-male');assert.equal(thigh,true);}finally{dispose(f);}
  }
});

test('held wrists continue the forearm without backward bending or a twist at the wrist seam',async()=>{
  const {createHuman}=await human,T=await three;
  const variants=[{right:'long'},{left:'long'},{right:'long',left:'short'},{right:'long',shield:true},{left:'long',shield:true,shieldHand:'right'},{right:'great',twoHanded:'right'},{left:'great',twoHanded:'left'}];
  for(const model of ['human-male','human-female']){
    const {default:asset}=await import(pathToFileURL(path.resolve(__dirname,`../assets/models/human/${model.slice(6)}.mjs`)).href),defs=new Map(asset.bones.map(b=>[b.name,b]));
    for(const variant of variants){
      const f=createHuman({...config,model,armor:'plate',...variant});
      try{
        let skeleton;f.traverse(o=>{if(o.isSkinnedMesh)skeleton=o.skeleton;});const bones=new Map(skeleton.bones.map(b=>[b.name,b]));
        for(const moving of [false,true,false]){
          f.userData.pose(.14,moving);f.updateMatrixWorld(true);
          for(const side of ['R','L']){
            if(!variant[side==='R'?'right':'left']&&!variant.twoHanded)continue;
            const point=n=>bones.get(`${n}.${side}`).getWorldPosition(new T.Vector3()),rest=n=>new T.Vector3(...defs.get(`${n}.${side}`).head);
            const forearm=point('wrist').sub(point('lowerarm01')).normalize(),forward=point('finger3-1').sub(point('wrist')).normalize();
            assert.ok(forearm.angleTo(forward)<(variant.twoHanded?45:30)*Math.PI/180,`${model}/${side} has a neutral wrist, not a hand folded back over the forearm`);
            const across=point('finger2-1').sub(point('finger5-1')).normalize(),palm=new T.Vector3().crossVectors(across,forward).normalize();
            const restAcross=rest('finger2-1').sub(rest('finger5-1')).normalize(),restForward=rest('finger3-1').sub(rest('wrist')).normalize();
            const forearmPalm=new T.Vector3().crossVectors(restAcross,restForward).normalize().applyQuaternion(bones.get(`lowerarm01.${side}`).getWorldQuaternion(new T.Quaternion()));
            palm.addScaledVector(forearm,-palm.dot(forearm)).normalize();forearmPalm.addScaledVector(forearm,-forearmPalm.dot(forearm)).normalize();
            assert.ok(palm.angleTo(forearmPalm)<12*Math.PI/180,'pronation is carried by the forearm, without twisting the wrist seam');
          }
        }
      }finally{dispose(f);}
    }
  }
});

test('both arms of the low two-handed guard clear the cuirass for either dominant hand',async()=>{
  const {createHuman}=await human,T=await three;
  for(const model of ['human-male','human-female'])for(const hand of ['right','left']){
    const f=createHuman({...config,model,armor:'plate',[hand]:'great',twoHanded:hand});
    try{
      f.updateMatrixWorld(true);let skeleton;const armor=[];
      f.traverse(o=>{if(o.isSkinnedMesh){skeleton=o.skeleton;if(o.name.includes('armor-plate'))armor.push(o);}});
      const bones=new Map(skeleton.bones.map(b=>[b.name,b])),torso=skeleton.bones.findIndex(b=>b.name==='spine03');
      for(const side of ['R','L'])for(const t of [.25,.5,.75,1]){
        const elbow=bones.get(`lowerarm01.${side}`).getWorldPosition(new T.Vector3()),wrist=bones.get(`wrist.${side}`).getWorldPosition(new T.Vector3()),point=elbow.lerp(wrist,t);
        const ray=new T.Raycaster(new T.Vector3(point.x,point.y,1),new T.Vector3(0,0,-1));
        for(const hit of ray.intersectObjects(armor)){
          if(hit.object.geometry.attributes.skinIndex.getX(hit.face.a)!==torso||hit.point.z<.05)continue;
          assert.ok(point.z-.035>hit.point.z,`${model}/${hand}/${side} leaves room for the forearm and its bracer outside the breastplate`);
        }
      }
      const control=new T.Raycaster(new T.Vector3(0,1.24,1),new T.Vector3(0,0,-1));assert.ok(control.intersectObjects(armor).some(hit=>hit.object.geometry.attributes.skinIndex.getX(hit.face.a)===torso),'the rendered cuirass is present even when both arms lie outside its silhouette');
    }finally{dispose(f);}
  }
});

test('armor has thick outer/inner surfaces and a separate open female cut with covered chest and hips',async()=>{
  const {createHuman}=await human,T=await three;
  for(const model of ['human-male','human-female'])for(const armor of database.armor.filter(a=>a.armor.type!=='shield').map(AvatarData.armorKind)){
    const f=createHuman({...config,model,armor});
    try{
      f.updateMatrixWorld(true);const torso=[];f.traverse(o=>{if(o.isSkinnedMesh&&o.name.includes(`armor-${armor}-${model.slice(6)}-torso`))torso.push(o);});assert.equal(torso.length,1);
      const mesh=torso[0],side=mesh.material.side;mesh.material.side=T.DoubleSide;
      try{
        const ray=new T.Raycaster(new T.Vector3(.06,1.242,1),new T.Vector3(0,0,-1)),hits=ray.intersectObject(mesh).map(h=>h.point.z).filter(z=>z>.08);
        assert.ok(hits.some((z,i)=>hits.some((q,j)=>j!==i&&Math.abs(q-z)>(armor==='plate'?.0025:.0075)&&Math.abs(q-z)<(armor==='plate'?.005:.018))),`${model}/${armor} has real shell thickness`);
        if(model==='human-female'){
          ray.set(new T.Vector3(.04,1.067,1),new T.Vector3(0,0,-1));assert.ok(!ray.intersectObject(mesh).some(h=>h.point.z>.1),'the waist opening stays visible instead of being filled by a male undercoat');
          ray.set(new T.Vector3(.10,.94,1),new T.Vector3(0,0,-1));const clothing=[];f.traverse(o=>{if(o.isSkinnedMesh&&o.name!=='anatomical-body')clothing.push(o);});assert.ok(ray.intersectObjects(clothing).some(h=>h.point.z>.12),'the split hip panels have opaque shorts beneath their openings');
        }
      }finally{mesh.material.side=side;}
    }finally{dispose(f);}
  }
});

test('volumetric greaves enclose the actual calf surface on both bodies, including the back',async()=>{
  const {createHuman}=await human,T=await three;
  for(const model of ['human-male','human-female']){
    const f=createHuman({...config,model,armor:'plate'}),anatomy=createHuman({...config,model,armor:'none',hair:'bald'});
    try{
      f.updateMatrixWorld(true);anatomy.updateMatrixWorld(true);const body=anatomy.getObjectByName('anatomical-body'),skeleton=body.skeleton,armor=[];
      f.traverse(o=>{if(o.isSkinnedMesh&&o.name.includes('greave-'))armor.push(o);});assert.ok(armor.length);
      let checked=0;
      for(const side of ['R','L']){
        const bone=skeleton.bones.find(b=>b.name==='lowerleg01.'+side),index=skeleton.bones.indexOf(bone),origin=bone.getWorldPosition(new T.Vector3()),axis=skeleton.bones.find(b=>b.name==='foot.'+side).getWorldPosition(new T.Vector3()).sub(origin).normalize(),a=body.geometry.attributes;
        for(let i=0;i<a.position.count;i++){
          if(a.position.getY(i)<.29||a.position.getY(i)>.45||a.position.getX(i)*(side==='R'?-1:1)<0)continue;
          let dominant=0;for(let j=1;j<4;j++)if(a.skinWeight.array[i*4+j]>a.skinWeight.array[i*4+dominant])dominant=j;
          if(!skeleton.bones[a.skinIndex.array[i*4+dominant]].name.startsWith('lowerleg'))continue;
          const p=body.localToWorld(body.getVertexPosition(i,new T.Vector3())),radial=p.clone().sub(origin);radial.addScaledVector(axis,-radial.dot(axis)).normalize();
          const ray=new T.Raycaster(p,radial,0,.08),hits=ray.intersectObjects(armor).filter(h=>h.object.geometry.attributes.skinIndex.getX(h.face.a)===index);
          assert.ok(hits.length,`${model}/${side} calf point ${i} stays inside the greave`);checked++;
        }
      }
      assert.ok(checked>20,'front, side and back calf vertices are sampled');
    }finally{dispose(f);dispose(anatomy);}
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
