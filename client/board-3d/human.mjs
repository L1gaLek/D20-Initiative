import * as THREE from '../../vendor/three/three.module.mjs';
import {createPaintedSkinMaterial,paintedSkinColor} from './human-skin.mjs?v=20261124-painted-1';
import maleModel from '../../assets/models/human/male.mjs?v=20261119-cuirass-1';
import femaleModel from '../../assets/models/human/female.mjs?v=20261123-cbbe-1';
import { createHair, headMapping } from './human-hair.mjs?v=20261119-cuirass-1';
import { planHumanPose, applyHumanPose } from './human-pose.mjs?v=20261119-cuirass-1';
import { dressHuman, batchRigid, femaleTorsoProfile } from './human-equipment.mjs?v=20261124-outfits-1';
import {normalizeProject} from './studio-state.mjs?v=20261124-outfits-1';
import {installStudioRuntime} from './studio-runtime.mjs?v=20261124-outfits-1';
import {getArmorAsset,ensureArmorAsset,armorAssetRevision,requiresArmorAsset} from './armor-assets.mjs?v=20261124-outfits-1';
import {applyHumanOutfit} from './human-outfit.mjs?v=20261124-outfits-1';
import {dressFittedOutfit} from './fitted-outfit.mjs?v=20261124-outfits-1';
export {ensureArmorAsset,armorAssetRevision,requiresArmorAsset};

function decode(value,Type){const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));return new Type(bytes.buffer);}
function prepare(model){
const positions=decode(model.positions,Float32Array),indices=decode(model.indices,Uint16Array);
const skinIndices=decode(model.skinIndices,Uint8Array),skinWeights=decode(model.skinWeights,Uint8Array);
const source=new THREE.BufferGeometry();
source.setAttribute('position',new THREE.BufferAttribute(positions,3));source.setIndex(new THREE.BufferAttribute(indices,1));source.computeVertexNormals();
const normals=source.attributes.normal.array;
const definitions=new Map(model.bones.map((b,i)=>[b.name,{...b,index:i}]));
// Immutable topology/weights are classified once, not again for every garment
// or every player. Only cut-edge vertices need new interpolated influences.
const sourcePoints=Array.from({length:positions.length/3},(_,id)=>{
  const w=new Map();for(let k=0;k<4;k++){const index=id*4+k,value=skinWeights[index]/255;if(value)w.set(skinIndices[index],(w.get(skinIndices[index])||0)+value);}
  return {p:Array.from(positions.slice(id*3,id*3+3)),n:Array.from(normals.slice(id*3,id*3+3)),w,id};
});
const sourceFaces=[];
for(let i=0;i<indices.length;i+=3){
  const ids=[indices[i],indices[i+1],indices[i+2]],center=[0,0,0],weights=new Map();
  for(const id of ids){for(let c=0;c<3;c++)center[c]+=positions[id*3+c]/3;for(const [bone,w] of sourcePoints[id].w)weights.set(bone,(weights.get(bone)||0)+w);}
  const main=[...weights].sort((a,b)=>b[1]-a[1])[0]?.[0];sourceFaces.push({ids,center,bone:model.bones[main]?.name||''});
}
for(const v of sourcePoints){
  const p=v.p;v.fitted=p;
  if(model.bodySource)continue;
  if(p[1]<1.13||p[1]>1.395||Math.abs(p[0])>.19)continue;
  const [rx,front,back]=femaleTorsoProfile(p[1]),center=(front+back)/2,depth=(front-back)/2,angle=Math.atan2(p[0]/rx,(p[2]-center)/depth);
  const blend=THREE.MathUtils.smoothstep(p[1],1.13,1.15)*(1-THREE.MathUtils.smoothstep(p[1],1.37,1.395));
  v.fitted=[THREE.MathUtils.lerp(p[0],Math.sin(angle)*rx,blend),p[1],THREE.MathUtils.lerp(p[2],center+Math.cos(angle)*depth,blend)];
}

return {model,positions,indices,skinIndices,skinWeights,normals,definitions,sourcePoints,sourceFaces};
}
const templates={male:prepare(maleModel),female:prepare(femaleModel)};

// A continuous anatomical mesh, with authored joint weights (including fingers),
// replaces the former collection of spheres. CPU source buffers are immutable;
// each avatar owns its GPU geometry, skeleton and materials.
export function createHuman(config,options={}){
  const female=config.model==='human-female',template=templates[female?'female':'male'];
  const {model,definitions,sourcePoints,sourceFaces}=template;
  const headFit=headMapping(definitions,templates.male.definitions);
  const frontHead=sourcePoints.filter(({p})=>p[1]>1.49&&p[2]>.06);
  headFit.front=p=>{
    const nearest=[];
    for(const {p:q} of frontHead){const d=(q[0]-p[0])**2+(q[1]-p[1])**2;if(nearest.length===5&&d>=nearest[4].d)continue;let i=0;while(i<nearest.length&&d>nearest[i].d)i++;nearest.splice(i,0,{p:q,d});if(nearest.length>5)nearest.pop();}
    let total=0,z=0;for(const v of nearest){const w=1/(v.d+1e-7);z+=v.p[2]*w;total+=w;}return [p[0],p[1],Math.max(p[2],z/total+.0015)];
  };
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);root.userData.avatar=config;
  const bones=model.bones.map(b=>{const bone=new THREE.Bone();bone.name=b.name;return bone;});
  const byName=new Map(bones.map(b=>[b.name,b]));
  model.bones.forEach((b,i)=>{
    const parent=b.parent<0?body:bones[b.parent],origin=b.parent<0?[0,0,0]:model.bones[b.parent].head;
    bones[i].position.fromArray(b.head.map((v,a)=>v-origin[a]));parent.add(bones[i]);
  });
  root.updateMatrixWorld(true);const skeleton=new THREE.Skeleton(bones);skeleton.calculateInverses();
  const mat=(color,metalness=0,roughness=.7)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
  const materials={skin:createPaintedSkinMaterial(),hair:mat(config.hairColor||'#493124'),linen:mat('#a89f8c'),cloth:mat('#333b43'),leather:mat('#61402b'),dark:mat('#282321'),steel:mat('#8e9da6',.78,.3),edge:mat('#c1cbd0',.85,.23),trim:mat('#a68b51',.72,.35)};
  for(const [key,m]of Object.entries(materials))m.userData.studioKey=key;
  // Fine surface variation is evaluated locally: no remote skin/armor textures.
  const texture=(material,type)=>{
    material.customProgramCacheKey=()=>`human-detail-${type}`;
    material.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec3 surfacePoint;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nsurfacePoint=position;');
      shader.fragmentShader='varying vec3 surfacePoint;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        vec3 p=surfacePoint;float grain=fract(sin(dot(floor(p*${type==='skin'?'2200.':'1300.'}),vec3(12.9898,78.233,43.14)))*43758.5453);
        diffuseColor.rgb*= ${type==='skin'?'(.965+.055*grain)':'(.90+.13*grain)'};
      `);
    };
  };
  texture(materials.leather,'leather');texture(materials.linen,'linen');
  materials.hair.customProgramCacheKey=()=>`human-hair-${config.hair}`;
  materials.hair.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 hairPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nhairPoint=position;');
    shader.fragmentShader='varying vec3 hairPoint;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec3 h=hairPoint-vec3(0.,1.585,.043);float angle=atan(h.x,h.z);
      float strands=.5+.5*sin(angle*155.+h.y*130.+sin(angle*17.)*.7);
      diffuseColor.rgb*=.77+.26*strands;
    `).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=.52+strands*.16;');
  };
  function surface(material,predicate=()=>true,offset=0,deform,clips=[]){
    const geometry=new THREE.BufferGeometry(),selected=[],points=sourcePoints.slice();
    const interpolate=(a,b,t)=>{
      const w=new Map();for(const [k,v] of a.w)w.set(k,v*(1-t));for(const [k,v] of b.w)w.set(k,(w.get(k)||0)+v*t);
      const point={p:a.p.map((v,i)=>THREE.MathUtils.lerp(v,b.p[i],t)),fitted:a.fitted.map((v,i)=>THREE.MathUtils.lerp(v,b.fitted[i],t)),n:a.n.map((v,i)=>THREE.MathUtils.lerp(v,b.n[i],t)),w,id:points.length};points.push(point);return point;
    };
    for(const {ids,center,bone} of sourceFaces){
      if(!predicate(center,bone,ids))continue;
      let polygon=ids.map(id=>points[id]);
      for(const clip of clips){
        const next=[];for(let j=0;j<polygon.length;j++){
          const a=polygon[j],b=polygon[(j+1)%polygon.length],da=clip(a.p),db=clip(b.p);
          if(da>=0)next.push(a);if((da>=0)!==(db>=0))next.push(interpolate(a,b,da/(da-db)));
        }polygon=next;
      }
      for(let j=1;j<polygon.length-1;j++)selected.push(polygon[0].id,polygon[j].id,polygon[j+1].id);
    }
    if(!selected.length){geometry.dispose();return null;}
    const used=[...new Set(selected)].sort((a,b)=>a-b),remap=new Map(used.map((v,i)=>[v,i])),pos=[],joints=[],weights=[];
    for(const id of used){
      const data=points[id],normal=new THREE.Vector3(...data.n).normalize(),base=female&&!getArmorAsset(config)&&material!==materials.skin&&material!==materials.hair?data.fitted:data.p,point=base.map((v,i)=>v+normal.getComponent(i)*offset);
      if(deform)deform(point,id);pos.push(...point);
      const w=[...data.w].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=w.reduce((s,v)=>s+v[1],0);
      for(let i=0;i<4;i++){joints.push(w[i]?.[0]||0);weights.push((w[i]?.[1]||0)/sum);}
    }
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geometry.setIndex(selected.map(i=>remap.get(i)));
    geometry.deleteAttribute('normal');geometry.computeVertexNormals();
    geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(joints,4));
    geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
    const mesh=new THREE.SkinnedMesh(geometry,material);mesh.frustumCulled=false;body.add(mesh);mesh.bind(skeleton);return mesh;
  }
  // Keep the continuous body under fitted pieces. Open necklines, shoulders,
  // waist and gaps between articulated armor must reveal skin rather than holes.
  const armored=config.armor&&config.armor!=='none';
  const quaternius=getArmorAsset(config)?.style==='quaternius-standard';
  const skin=surface(materials.skin,(p,b)=>quaternius?(p[1]>1.395||/wrist|finger/.test(b)||['L','R'].some(side=>Math.hypot(...p.map((v,i)=>v-definitions.get('wrist.'+side).head[i]))<.105)):!armored||p[1]>.34);skin.name='anatomical-body';
  const skinPositions=skin.geometry.attributes.position.array,colors=new Float32Array(skinPositions.length);const color=new THREE.Color();
  for(let i=0;i<skinPositions.length/3;i++){
    const [x,y,z]=headFit.inverse(Array.from(skinPositions.slice(i*3,i*3+3)));paintedSkinColor(x,y,z,color);
    color.toArray(colors,i*3);
  }
  skin.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));materials.skin.vertexColors=true;
  const attach=(name,geometry,material)=>{const head=definitions.get(name).head;geometry.translate(-head[0],-head[1],-head[2]);const mesh=new THREE.Mesh(geometry,material);byName.get(name).add(mesh);return mesh;};
  const sphere=(name,material,center,radii,segments=24)=>{const g=new THREE.SphereGeometry(1,segments,16);g.scale(...radii);g.translate(...center);return attach(name,g,material);};
  const curve=(name,material,points,radius=.0015,segments=20)=>attach(name,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),segments,radius,4,false),material);
  const ivory=mat('#c7c2ae',0,.4),iris=mat('#5c6a4c',.05,.35),pupil=mat('#111817',.1,.18),glint=mat('#e1e4d7',0,.1);
  for(const side of ['L','R']){
    const eye=definitions.get(`eye.${side}`),p=eye.head,sign=side==='L'?1:-1;
    sphere('head',ivory,p,[.0131,.0126,.0140]);
    sphere('head',iris,[p[0]+sign*.0004,p[1]-.0007,p[2]+.0131],[.0058,.0058,.0011]);
    sphere('head',pupil,[p[0]+sign*.0004,p[1]-.0007,p[2]+.0141],[.0025,.0025,.0004]);
    sphere('head',glint,[p[0]-.0014,p[1]+.0011,p[2]+.0145],[.0007,.0007,.0003],10);
    // Brows follow the actual brow ridge instead of floating over a round head.
    curve('head',materials.hair,[[sign*.011,1.599,.14],[sign*.027,1.603,.138],[sign*.044,1.600,.126]].map(p=>headFit.front(headFit.point(p))),female?.0009:.0012,18);
    for(let i=0;i<21;i++){
      const x=sign*(.012+i*.0016),y=1.600+Math.sin(i/20*Math.PI)*.003,z=.140-Math.max(0,i-6)*.0009;
      curve('head',materials.hair,[[x,y,z],[x+sign*.001,y+.0013,z-.0005]].map(p=>headFit.front(headFit.point(p))),.00035,2);
    }
  }
  if(!(getArmorAsset(config)?.style==='quaternius-standard'&&config.outfitHood)&&(female||config.armor!=='plate'))createHair({config,female,materials,surface,attach,sphere,curve,headFit});
  const posePlan=planHumanPose(config,definitions);
  const studio=config.studio?normalizeProject(config.studio):options.editable?normalizeProject({appearance:config}):null;
  const fitted=getArmorAsset(config)?.format==='d20-fitted-outfit'?getArmorAsset(config):null;
  dressHuman({config,materials,definitions,byName,surface,attach,sphere,curve,texture,female,posePlan,editable:!!options.editable,studio,skipArmor:!!options.outfit||!!fitted});
  if(options.outfit)applyHumanOutfit(root,options.outfit);
  else if(fitted)dressFittedOutfit(root,fitted,studio,!!options.editable);
  if(!options.editable||!getArmorAsset(config))batchRigid(body,skeleton);
  const rest=new Map();
  applyHumanPose(byName,definitions,posePlan);
  bones.forEach(b=>rest.set(b.name,b.rotation.clone()));
  let phase=0;
  const pose=(distance=0,moving=false)=>{
    phase+=distance*10;const stride=moving?Math.sin(phase):0;root.userData.walkAngle=stride*.43;
    for(const [i,side] of ['L','R'].entries()){
      const sign=i?1:-1,leg=byName.get(`upperleg01.${side}`),knee=byName.get(`lowerleg01.${side}`),arm=byName.get(`upperarm01.${side}`),elbow=byName.get(`lowerarm01.${side}`);
      leg.rotation.x=rest.get(leg.name).x+stride*.43*sign;knee.rotation.x=rest.get(knee.name).x+Math.max(0,-stride*sign)*.62;
      arm.rotation.x=rest.get(arm.name).x-(posePlan.twoSide?0:stride*(side===posePlan.shieldSide?.06:(config.right||config.left)?.12:.26)*sign);
      elbow.rotation.x=rest.get(elbow.name).x+(posePlan.twoSide?0:Math.abs(stride)*.09);
    }
    body.position.y=moving?Math.abs(Math.sin(phase))*.015:0;body.rotation.y=moving?stride*.025:0;
  };
  root.userData.pose=pose;root.userData.walkPoseAt=(seconds,moving=false)=>{phase=seconds*15;pose(0,moving);};
  root.userData.stance=posePlan.stance;
  const disposeOutfit=root.userData.dispose;root.userData.dispose=()=>{disposeOutfit?.();skeleton.dispose();};
  root.userData.armorQuality=getArmorAsset(config)?.style||'legacy';
  root.userData.pose(0,false);root.updateMatrixWorld(true);installStudioRuntime(root,studio);return root;
}
