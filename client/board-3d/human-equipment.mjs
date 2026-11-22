import * as THREE from '../../vendor/three/three.module.mjs';

import { dressMasterPlate } from './plate-model.mjs?v=20261122-egress-1';
import { dressArmor } from './human-armor.mjs?v=20261119-cuirass-1';
import {getArmorAsset} from './armor-assets.mjs?v=20261122-egress-1';
export { femaleTorsoProfile } from './human-armor.mjs?v=20261119-cuirass-1';

// Rigid fittings share their parent's animation joint. Merge by material after
// construction, while leaving skinned clothing and the bone hierarchy intact.
export function batchRigid(group,skeleton){
  group.updateMatrixWorld(true);const groups=new Map();
  group.traverse(mesh=>{if(!mesh.isMesh)return;if(!groups.has(mesh.material))groups.set(mesh.material,[]);groups.get(mesh.material).push(mesh);});
  for(const [material,meshes] of groups){
    const pos=[],normals=[],joints=[],weights=[],colors=[],uvs=[],indices=[],point=new THREE.Vector3(),normal=new THREE.Vector3();
    for(const mesh of meshes){
      const g=mesh.geometry,a=g.attributes,offset=pos.length/3,normalMatrix=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
      let parent=mesh.parent;while(parent&&!parent.isBone)parent=parent.parent;const joint=Math.max(0,skeleton.bones.indexOf(parent));
      for(let i=0;i<a.position.count;i++){
        point.fromBufferAttribute(a.position,i).applyMatrix4(mesh.matrixWorld);normal.fromBufferAttribute(a.normal,i).applyNormalMatrix(normalMatrix);pos.push(...point);normals.push(...normal);
        uvs.push(a.uv?a.uv.getX(i):Math.atan2(point.x,point.z)*.5,a.uv?a.uv.getY(i):point.y/.14);
        for(let k=0;k<4;k++){joints.push(mesh.isSkinnedMesh?a.skinIndex.array[i*4+k]:joint);weights.push(mesh.isSkinnedMesh?a.skinWeight.array[i*4+k]:(k===0?1:0));}
        if(a.color)colors.push(a.color.getX(i),a.color.getY(i),a.color.getZ(i));else colors.push(1,1,1);
      }
      if(g.index)for(const i of g.index.array)indices.push(i+offset);else for(let i=0;i<a.position.count;i++)indices.push(i+offset);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(joints,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
    if(material.vertexColors)geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);
    for(const mesh of meshes){mesh.removeFromParent();mesh.geometry.dispose();}
    const merged=new THREE.SkinnedMesh(geometry,material);merged.name=meshes.map(m=>m.name).filter(Boolean).join(' ');merged.frustumCulled=false;merged.castShadow=merged.receiveShadow=true;group.add(merged);merged.bind(skeleton);
  }
}

export function dressHuman({config,materials:m,definitions,byName,surface,attach,sphere:makeSphere,curve:makeCurve,texture,female,posePlan,editable=false,studio=null,skipArmor=false}){
  const prepared=getArmorAsset(config);
  if(!skipArmor){
    if(prepared)dressMasterPlate({config,asset:prepared,materials:m,female,surface,attach,byName,definitions,editable,studio});
    else dressArmor({config,materials:m,definitions,surface,attach,sphere:makeSphere,curve:makeCurve,texture,female});
  }
  const armored=config.armor&&config.armor!=='none';
  const mat=(color,metalness=0,roughness=.65)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
  function weapon(side,type){
    const name=`wrist.${side}`,bone=byName.get(name),hand=definitions.get(name),g=new THREE.Group();
    const grip=posePlan.arms[side].grip;
    g.position.copy(grip.center).sub(grip.wrist);g.quaternion.copy(grip.quaternion);bone.add(g);
    // A round hilt can roll inside the grip. Keep its axis and palm contact,
    // while presenting the flat blade and guard in the reference's front view.
    const wristQ=posePlan.arms[side].wristQ,worldQ=wristQ.clone().multiply(grip.quaternion),axis=new THREE.Vector3(0,1,0).applyQuaternion(worldQ);
    const face=new THREE.Vector3(0,0,1).addScaledVector(axis,-axis.z).normalize(),edge=new THREE.Vector3().crossVectors(axis,face).normalize();
    const facing=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(edge,axis,face));g.quaternion.copy(wristQ).invert().multiply(facing);
    g.userData.attachment='weapon';g.userData.hand=side;
    const add=(geo,mat)=>{const mesh=new THREE.Mesh(geo,mat);g.add(mesh);return mesh;};
    const great=type==='great',length=great?1.08:type==='short'?.34:type==='rapier'?.59:.51,width=great?.041:type==='rapier'?.009:.021;
    const section=(y,w,z)=>[-w,y,0,0,y,z,w,y,0,0,y,-z];
    const vertices=[...section(-.07,width,.005),...section(-.07-length*.78,width*.73,.004),0,-.07-length,0],faces=[];
    for(let i=0;i<4;i++){const j=(i+1)%4;faces.push(i,j,j+4,i,j+4,i+4,i+4,j+4,8);}
    if(type==='curved')for(let i=0;i<vertices.length;i+=3)vertices[i]+=.06*((vertices[i+1]+.07)/length)**2;
    const blade=new THREE.BufferGeometry();blade.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));blade.setIndex(faces);blade.computeVertexNormals();add(blade,m.edge);
    // A visible recessed fuller runs along each face of broad blades.
    if(type!=='rapier')for(const s of [-1,1]){
      const shape=new THREE.Shape();shape.moveTo(-.0025,-.10);shape.lineTo(.0025,-.10);shape.lineTo(.0012,-length*.72);shape.lineTo(-.0012,-length*.72);shape.closePath();
      const groove=new THREE.ShapeGeometry(shape);groove.translate(0,0,s*.0052);if(s<0)groove.rotateY(Math.PI);add(groove,m.steel);
    }
    const gripGeometry=new THREE.CylinderGeometry(.012,.010,great?.26:.105,20);if(great)gripGeometry.translate(0,.045,0);add(gripGeometry,m.dark);
    const wraps=[];for(let i=0;i<150;i++){const a=i/150*Math.PI*(great?42:18);wraps.push(new THREE.Vector3(Math.cos(a)*.0122,(great?-.08:-.046)+i/150*(great?.25:.096),Math.sin(a)*.0122));}
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wraps),130,.0013,4,false),m.leather);
    const guard=new THREE.CatmullRomCurve3([new THREE.Vector3(-.093,-.087,.004),new THREE.Vector3(-.067,-.061,0),new THREE.Vector3(0,-.06,0),new THREE.Vector3(.067,-.061,0),new THREE.Vector3(.093,-.087,.004)].map(p=>{if(great){p.x*=1.5;p.y-=.035;}return p;}));
    add(new THREE.TubeGeometry(guard,32,.007,8,false),m.trim);
    for(const x of [-.093,.093]){const end=new THREE.SphereGeometry(.009,12,8);end.translate(x*(great?1.5:1),great?-.122:-.087,.004);add(end,m.trim);}
    const pommel=new THREE.SphereGeometry(1,18,12);pommel.scale(great?.025:.019,great?.03:.023,.013);pommel.translate(0,great?.204:.067,0);add(pommel,m.steel);
    const jewel=new THREE.SphereGeometry(.006,10,8);jewel.translate(0,great?.204:.067,.012);add(jewel,m.trim);
    if(type==='rapier'){
      const ring=new THREE.TorusGeometry(.034,.003,6,32);ring.rotateX(.65);ring.translate(0,-.035,.018);add(ring,m.trim);
    }
    g.name='detailed-sword';
  }
  for(const side of ['R','L'])if(posePlan.arms[side].weapon)weapon(side,posePlan.arms[side].weapon);
  if(posePlan.shieldSide){
    const side=posePlan.shieldSide,arm=posePlan.arms[side],bone=byName.get(`lowerarm01.${side}`),g=new THREE.Group();
    const hand=arm.grip.center.clone().sub(arm.wrist).applyQuaternion(arm.wristQ).add(arm.target);
    const center=arm.joint.clone().lerp(hand,.35),backRadius=.192,backBulge=.045;
    const normal=arm.grip.normal.clone().applyQuaternion(arm.wristQ).normalize().negate(),upAxis=new THREE.Vector3(0,1,0);upAxis.addScaledVector(normal,-upAxis.dot(normal)).normalize();
    const acrossAxis=new THREE.Vector3().crossVectors(upAxis,normal),shieldQ=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(acrossAxis,upAxis,normal)),shieldInverse=shieldQ.clone().invert();
    // The curved wooden back clears the forearm, bracer and folded fingers.
    // Evaluate the actual shield curvature at their X positions, not a guessed
    // offset at its center, so switching hands does not mirror a collision.
    const backDepth=x=>.007+Math.max(0,1-(x/backRadius)**2)*backBulge;
    const samples=[[arm.joint,armored?.046:.038],[arm.target,armored?.043:.033],[hand,.022],[arm.joint.clone().lerp(arm.target,.23),armored?.082:.044],[arm.joint.clone().lerp(arm.target,.66),armored?.068:.030]];
    const outfitPadding=skipArmor ? .025 : 0;
    const clearance=Math.max(...samples.map(([p,r])=>{const q=p.clone().sub(center).applyQuaternion(shieldInverse);return q.z+r+outfitPadding+.006-backDepth(q.x);}));
    center.addScaledVector(normal,clearance);
    const inverse=arm.lowerQ.clone().invert();g.position.copy(center).sub(arm.joint).applyQuaternion(inverse);g.quaternion.copy(inverse).multiply(shieldQ);bone.add(g);g.name='detailed-shield';g.userData.attachment='shield';g.userData.hand=side;g.userData.backRadius=backRadius;g.userData.backBulge=backBulge;
    const wood=mat('#50402f'),paint=mat('#314d59',.32,.48),rear=mat('#342c24');texture(wood,'leather');
    const outline=[[-.145,.19],[.145,.19],[.153,.12],[.128,-.08],[.076,-.185],[0,-.24],[-.076,-.185],[-.128,-.08],[-.153,.12]].map(([x,y])=>[x*1.2,y*1.32]);
    const curveZ=x=>.025+Math.max(0,1-(x/backRadius)**2)*backBulge;
    const front=[],back=[],ix=[];front.push(0,0,curveZ(0));back.push(0,0,curveZ(0)-.018);
    for(const [x,y] of outline){front.push(x,y,curveZ(x));back.push(x,y,curveZ(x)-.018);}
    for(let i=1;i<=outline.length;i++)ix.push(0,i,i===outline.length?1:i+1);
    const face=(positions,mat,reverse=false)=>{const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(reverse?ix.toReversed():ix);geo.computeVertexNormals();g.add(new THREE.Mesh(geo,mat));};
    face(front,paint,true);face(back,wood);
    const line=(points,r,mat)=>{const geo=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),points.length*6,r,6,false);g.add(new THREE.Mesh(geo,mat));};
    const rim=[...outline,outline[0]].map(([x,y])=>[x,y,curveZ(x)-.002]);line(rim,.009,m.steel);
    line([...outline,outline[0]].map(([x,y])=>[x*.94,y*.95,curveZ(x*.94)+.002]),.002,m.trim);
    for(let x=-.12;x<=.12;x+=.04)line([[x,.17,curveZ(x)-.0185],[x,-.16+Math.abs(x)*.7,curveZ(x)-.0185]],.0015,rear);
    for(const [x,y] of outline){const r=new THREE.SphereGeometry(.0037,8,6);r.scale(1,1,.5);r.translate(x*.91,y*.91,curveZ(x*.91)+.004);g.add(new THREE.Mesh(r,m.trim));}
    // Back straps and hand grip are modeled too, visible when orbiting the token.
    const forearm=arm.target.clone().sub(arm.joint).applyQuaternion(shieldInverse).normalize(),up=new THREE.Vector3(0,1,0).addScaledVector(forearm,-forearm.y).normalize(),out=new THREE.Vector3().crossVectors(forearm,up).normalize();
    for(const t of [.23,.66]){
      const p=arm.joint.clone().lerp(arm.target,t).sub(center).applyQuaternion(shieldInverse),points=[],radius=(t<.5?(armored?.080:.048):(armored?.066:.033))+outfitPadding;
      for(let i=0;i<=28;i++){const a=i/28*Math.PI*2;points.push(p.clone().addScaledVector(up,Math.cos(a)*radius).addScaledVector(out,Math.sin(a)*radius).toArray());}
      line(points,.006,m.leather);
      const strap=new THREE.Object3D();strap.name='shield-forearm-strap';strap.position.copy(p);strap.userData.radius=radius;g.add(strap);
      for(const sign of [-1,1])line([[p.x+sign*(radius+.003),p.y,.026],[p.x+sign*radius,p.y,p.z]],.006,m.leather);
    }
    const handle=hand.sub(center).applyQuaternion(shieldInverse);
    line([[handle.x,handle.y-.045,.023],[handle.x,handle.y-.034,handle.z],[handle.x,handle.y+.034,handle.z],[handle.x,handle.y+.045,.023]],.006,m.dark);
    const marker=new THREE.Object3D();marker.name='shield-hand-grip';marker.position.copy(handle);g.add(marker);
    line([[0,.154,curveZ(0)+.006],[0,-.13,curveZ(0)+.006]],.005,m.trim);
    line(Array.from({length:13},(_,i)=>{const x=-.104+i*.208/12;return [x,.067,curveZ(x)+.006];}),.005,m.trim);
    const boss=new THREE.SphereGeometry(1,24,12);boss.scale(.028,.028,.011);boss.translate(0,.037,.07);g.add(new THREE.Mesh(boss,m.steel));
  }
}
