import * as T from '../vendor/three/three.module.mjs';
import {OrbitControls} from '../vendor/three/OrbitControls.mjs';
import {TransformControls} from '../vendor/three/TransformControls.mjs';
import {GLTFExporter} from '../vendor/three/GLTFExporter.mjs';
import {GLTFLoader} from '../vendor/three/GLTFLoader.mjs';
import {clone} from '../vendor/three/SkeletonUtils.mjs';
import {createHuman,ensureArmorAsset} from '../client/board-3d/human.mjs?v=20261124-outfits-1';
import {batchRigid} from '../client/board-3d/human-equipment.mjs?v=20261124-outfits-1';
import {sampleClip} from '../client/board-3d/studio-state.mjs?v=20261124-outfits-1';
import {portableGLB} from './glb.mjs';

export function createStudioViewer(host,{changed=()=>{},stats=()=>{}}={}){
  const renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor('#121a23');renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;host.prepend(renderer.domElement);
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(32,1,.03,30);camera.position.set(1.65,1.4,3.3);const orbit=new OrbitControls(camera,renderer.domElement);orbit.target.set(0,.88,0);orbit.minDistance=.6;orbit.maxDistance=7;orbit.enableDamping=true;orbit.dampingFactor=.10;orbit.mouseButtons={LEFT:T.MOUSE.ROTATE,MIDDLE:T.MOUSE.PAN,RIGHT:T.MOUSE.PAN};orbit.update();
  scene.add(new T.HemisphereLight('#f1e4d0','#2c3444',1.8));const key=new T.DirectionalLight('#ffe8cc',3.2);key.position.set(-3,5,4);key.castShadow=true;key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-2,right:2,top:2,bottom:-1,near:.1,far:12});key.shadow.normalBias=.002;scene.add(key);const rim=new T.DirectionalLight('#b4cce2',2);rim.position.set(3,3,-3);scene.add(rim);
  const floor=new T.Mesh(new T.CircleGeometry(4,80),new T.MeshStandardMaterial({color:'#18222d',roughness:.95}));floor.rotation.x=-Math.PI/2;floor.position.y=.111;floor.receiveShadow=true;scene.add(floor);
  const grid=new T.GridHelper(6,60,'#40515c','#243541');grid.position.y=.112;grid.material.transparent=true;grid.material.opacity=.38;scene.add(grid);
  const ring=new T.Mesh(new T.TorusGeometry(.48,.002,6,96),new T.MeshBasicMaterial({color:'#b49a64'}));ring.rotation.x=Math.PI/2;ring.position.y=.114;scene.add(ring);
  const gizmo=new TransformControls(camera,renderer.domElement);gizmo.setSize(.72);gizmo.setSpace('local');gizmo.setTranslationSnap(.001);gizmo.setRotationSnap(T.MathUtils.degToRad(.5));scene.add(gizmo.getHelper());gizmo.addEventListener('dragging-changed',e=>{orbit.enabled=!e.value;});
  let figure=null,project=null,skeletonHelper=null,selected=null,playing=false,time=0,action='idle',last=0,frame=0,external=false,mixer=null,importedClips=[],wire=false,showBones=false,dirty=true,lastStats=0;
  orbit.addEventListener('change',()=>dirty=true);gizmo.addEventListener('change',()=>dirty=true);
  const boneMap=new Map(),partMap=new Map(),importRest=new Map(),materialDefaults=new Map();
  function disposeFigure(){
    gizmo.detach();selected=null;skeletonHelper?.removeFromParent();skeletonHelper?.geometry.dispose();skeletonHelper?.material.dispose();skeletonHelper=null;if(!figure)return;
    const mats=new Set(),textures=new Set(),skeletons=new Set();
    mixer?.stopAllAction();mixer?.uncacheRoot(figure);
    figure.traverse(o=>{o.userData.dispose?.();o.geometry?.dispose();if(o.material)mats.add(o.material);if(external&&o.skeleton)skeletons.add(o.skeleton);});
    for(const m of mats){if(external)for(const value of Object.values(m))if(value?.isTexture)textures.add(value);m.dispose();}
    const images=new Set();for(const t of textures){t.dispose();if(t.image)images.add(t.image);}for(const image of images)image.close?.();skeletons.forEach(s=>s.dispose());
    figure.removeFromParent();figure=null;partMap.clear();boneMap.clear();importRest.clear();materialDefaults.clear();mixer=null;
  }
  function enumerate(){partMap.clear();boneMap.clear();figure.traverse(o=>{if(o.userData.studioPart)partMap.set(o.userData.studioPart,o);if(o.isBone){boneMap.set(o.name,o);importRest.set(o.name,o.quaternion.clone());}if(o.isMesh){o.material.wireframe=wire;if(!materialDefaults.has(o.material))materialDefaults.set(o.material,{color:o.material.color.clone(),roughness:o.material.roughness,metalness:o.material.metalness});}});skeletonHelper=new T.SkeletonHelper(figure);skeletonHelper.visible=showBones;skeletonHelper.material.depthTest=false;skeletonHelper.renderOrder=10;scene.add(skeletonHelper);}
  function importedPose(t,name){
    for(const [n,b]of boneMap)b.quaternion.copy(importRest.get(n));mixer?.stopAllAction();const clip=importedClips.find(c=>c.name===name)||importedClips.find(c=>c.name.toLowerCase()===name)||importedClips[0];if(clip&&mixer){const a=mixer.clipAction(clip);a.setLoop(project.clips[name]?.loop?T.LoopRepeat:T.LoopOnce,Infinity);a.clampWhenFinished=true;a.play();mixer.setTime(t);}
    const values=sampleClip(project.clips[name],t);for(const n of new Set([...Object.keys(project.pose),...Object.keys(values)])){const b=boneMap.get(n);if(b)b.quaternion.multiply(new T.Quaternion().setFromEuler(new T.Euler(...[0,1,2].map(i=>(project.pose[n]?.[i]||0)+(values[n]?.[i]||0)))));}
  }
  function pose(){dirty=true;if(!figure)return;if(external)importedPose(time,action);else{figure.userData.setStudioProject(project);figure.userData.setStudioTime(time,action);}figure.updateMatrixWorld(true);}
  function tick(now){frame=requestAnimationFrame(tick);const dt=Math.min(.05,(now-(last||now))/1000);last=now;if(playing&&figure){const clip=project.clips[action]||{duration:1,loop:true};time+=dt;if(time>clip.duration){if(clip.loop)time%=clip.duration;else{time=clip.duration;playing=false;}}pose();}const moved=orbit.update();if(dirty||moved){renderer.render(scene,camera);dirty=false;}if(now-lastStats>250){lastStats=now;stats({time,playing,triangles:renderer.info.render.triangles,calls:renderer.info.render.calls,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures});}}
  const resize=new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();dirty=true;});resize.observe(host);frame=requestAnimationFrame(tick);
  gizmo.addEventListener('objectChange',()=>{if(!selected)return;const g=partMap.get(selected),p=g.position.clone().sub(new T.Vector3(...g.userData.basePosition)),q=external?new T.Quaternion().fromArray(g.userData.baseQuaternion).invert().multiply(g.quaternion):g.quaternion,r=new T.Euler().setFromQuaternion(q),s=external?g.scale.clone().divide(new T.Vector3(...g.userData.baseScale)):g.scale;project.parts[selected]={position:p.toArray(),rotation:[r.x,r.y,r.z],scale:s.toArray()};if(g.userData.outfitProxy)figure.userData.applyStudioOutfitPart?.(selected,project.parts[selected]);changed('part',selected);});
  let buildGeneration=0;
  async function build(next){const generation=++buildGeneration;await ensureArmorAsset(next.appearance);if(generation!==buildGeneration)return;disposeFigure();project=next;playing=false;time=0;external=false;importedClips=[];dirty=true;if(next.race!=='Человек')return;figure=createHuman({...project.appearance,studio:project},{editable:true});scene.add(figure);enumerate();pose();}
  async function load(bytes,name,nextProject=project){const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),gltf=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');disposeFigure();project=nextProject;figure=gltf.scene;figure.name=name||'Imported character';external=true;importedClips=gltf.animations;mixer=new T.AnimationMixer(figure);scene.add(figure);enumerate();for(const [id,g]of partMap){g.userData.basePosition=g.position.toArray();g.userData.baseQuaternion=g.quaternion.toArray();g.userData.baseScale=g.scale.toArray();if(project.parts[id])applyPart(id,project.parts[id]);}time=0;playing=false;palette();pose();return importedClips.map(c=>({name:c.name,duration:c.duration}));}
  function applyPart(id,value){const g=partMap.get(id);if(!g)return;g.position.fromArray(g.userData.basePosition).add(new T.Vector3(...value.position));if(external){g.quaternion.fromArray(g.userData.baseQuaternion).multiply(new T.Quaternion().setFromEuler(new T.Euler(...value.rotation)));g.scale.fromArray(g.userData.baseScale).multiply(new T.Vector3(...value.scale));}else{g.rotation.set(...value.rotation);g.scale.fromArray(value.scale);}if(g.userData.outfitProxy)figure.userData.applyStudioOutfitPart?.(id,value);dirty=true;}
  function materialEntries(){const out=new Map();figure?.traverse(o=>{if(!o.isMesh)return;const m=o.material,key=m.userData.plateMaterial||m.userData.studioKey||m.name;if(key&&!out.has(key))out.set(key,{key,color:'#'+m.color.getHexString(),roughness:m.roughness,metalness:m.metalness});});return [...out.values()];}
  function palette(){figure?.traverse(o=>{if(!o.isMesh)return;const m=o.material,key=m.userData.plateMaterial||m.userData.studioKey||m.name,p=project.materials[key],base=materialDefaults.get(m);if(p){m.color.set(p.color);m.roughness=p.roughness;m.metalness=p.metalness;}else if(external&&base){m.color.copy(base.color);m.roughness=base.roughness;m.metalness=base.metalness;}});}
  function compileAnimation(target){
    const sources=[],copies=[];figure.traverse(o=>sources.push(o));target.traverse(o=>copies.push(o));const targets=new Map(sources.map((o,i)=>[o,copies[i]])),animated=new Set(boneMap.values()),body=figure.children.find(o=>o.isGroup),clips=[];if(body)animated.add(body);
    // Imported actions can translate and scale joints, and move rigid nodes.
    // Keep these channels as well as rotations when baking edited animations.
    if(external)for(const clip of importedClips)for(const track of clip.tracks){const binding=T.PropertyBinding.parseTrackName(track.name);if(!['position','quaternion','scale'].includes(binding.propertyName))continue;const node=T.PropertyBinding.findNode(figure,binding.nodeName);if(node)animated.add(node);}
    for(const [name,spec]of Object.entries(project.clips)){
      const count=Math.max(3,Math.ceil(spec.duration*24)+1),times=new Float32Array(Array.from({length:count},(_,i)=>i/(count-1)*spec.duration)),values=new Map([...animated].map(o=>[o,{position:[],quaternion:[],scale:[]}]));
      for(const t of times){if(external)importedPose(t,name);else{figure.userData.setStudioProject(project);figure.userData.setStudioTime(t,name);}for(const [o,channels]of values)for(const key of Object.keys(channels))channels[key].push(...o[key].toArray());}
      const tracks=[];for(const [o,channels]of values){const node=targets.get(o);if(!node)continue;for(const [key,arr]of Object.entries(channels)){const base=node[key].toArray();if(arr.every((v,i)=>Math.abs(v-base[i%base.length])<1e-7))continue;const Type=key==='quaternion'?T.QuaternionKeyframeTrack:T.VectorKeyframeTrack;tracks.push(new Type(node.uuid+'.'+key,times,arr));}}
      if(!tracks.length)tracks.push(new T.QuaternionKeyframeTrack(target.uuid+'.quaternion',[0,spec.duration],[...target.quaternion.toArray(),...target.quaternion.toArray()]));
      clips.push(new T.AnimationClip(name,spec.duration,tracks));
    }
    return clips;
  }
  async function exportModel(editable=false){
    if(!figure)throw Error('Сначала выберите готовую модель.');const savedTime=time,savedAction=action;playing=false;time=0;action='idle';pose();
    const copy=clone(figure);copy.traverse(o=>{if(o.geometry){o.geometry=o.geometry.clone();if(!o.geometry.attributes.uv&&(o.material.map||o.material.normalMap)){const a=o.geometry.attributes.position,uv=[];for(let i=0;i<a.count;i++)uv.push(a.getX(i)/.14,a.getY(i)/.14);o.geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));}}});const clips=compileAnimation(copy);
    if(!editable&&!external){const body=copy.children.find(o=>o.isGroup);let skeleton;copy.traverse(o=>{if(o.isSkinnedMesh)skeleton=o.skeleton;});const saved=new Map(skeleton.bones.map(b=>[b.name,b.quaternion.clone()]));skeleton.pose();copy.updateMatrixWorld(true);batchRigid(body,skeleton);for(const b of skeleton.bones)b.quaternion.copy(saved.get(b.name));copy.updateMatrixWorld(true);}
    copy.traverse(o=>{if(!o.isSkinnedMesh)return;const a=o.geometry.attributes;for(let i=0;i<a.skinIndex.array.length;i++)if(!a.skinWeight.array[i])a.skinIndex.array[i]=0;});
    copy.traverse(o=>{if(!o.isMesh||!o.material.normalMap||!o.geometry.attributes.uv)return;const g=o.geometry;g.computeTangents();const a=g.attributes;for(let i=0;i<a.tangent.count;i++){const t=a.tangent.array.subarray(i*4,i*4+4);if(Math.hypot(t[0],t[1],t[2])<.1){const n=new T.Vector3().fromBufferAttribute(a.normal,i),x=Math.abs(n.x)<.9?new T.Vector3(1,0,0):new T.Vector3(0,1,0);x.addScaledVector(n,-x.dot(n)).normalize();t.set([x.x,x.y,x.z,1]);}}});
    try{return portableGLB(await new GLTFExporter().parseAsync(copy,{binary:true,animations:clips,trs:true,onlyVisible:true,maxTextureSize:1024}));}
    finally{copy.traverse(o=>o.geometry?.dispose());time=savedTime;action=savedAction;pose();}
  }
  return {build,load,exportModel,update:next=>{project=next;palette();pose();},parts:()=>[...partMap].map(([id,g])=>({id,name:g.name})),bones:()=>[...boneMap.keys()],materials:materialEntries,applyPart,
    selectPart(id){selected=id;const g=partMap.get(id);if(g)gizmo.attach(g);else gizmo.detach();dirty=true;},transformMode:m=>gizmo.setMode(m),showSkeleton:v=>{showBones=v;if(skeletonHelper)skeletonHelper.visible=v;dirty=true;},wireframe:v=>{wire=v;figure?.traverse(o=>{if(o.isMesh)o.material.wireframe=v;});dirty=true;},
    seek(t,name=action){time=t;action=name;pose();},play(v){playing=v;},getTime:()=>time,frame(){camera.position.set(1.65,1.4,3.3);orbit.target.set(0,.88,0);orbit.update();},front(){camera.position.set(0,1.05,3.5);orbit.target.set(0,.88,0);orbit.update();},screenshot:()=>{renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png');},inspect:()=>({ready:!!figure,external,parts:partMap.size,bones:boneMap.size,action,time,playing,render:{...renderer.info.memory,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles}}),dispose(){cancelAnimationFrame(frame);resize.disconnect();disposeFigure();gizmo.dispose();orbit.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}};
}
