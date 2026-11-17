import * as T from '../../vendor/three/three.module.mjs';
import {normalizeProject,sampleClip} from './studio-state.mjs';

export function applyStudioMaterials(figure,palette={}){
  const used=new Set();figure.traverse(o=>{if(!o.isMesh||used.has(o.material))return;const m=o.material,key=m.userData.plateMaterial||m.userData.studioKey;used.add(m);if(palette[key]){m.color.set(palette[key].color);m.roughness=palette[key].roughness;m.metalness=palette[key].metalness;}});
}
export function installStudioRuntime(figure,input){
  if(!input)return;
  let project=normalizeProject(input),clock=0,action=null;const bones=new Map(),base=new Map(),rawPose=figure.userData.pose,rawWalk=figure.userData.walkPoseAt;
  figure.traverse(b=>{if(b.isBone){bones.set(b.name,b);base.set(b.name,b.quaternion.clone());}});
  function render(time,clipName='idle'){
    for(const [name,b]of bones)b.quaternion.copy(base.get(name));
    rawWalk(time,clipName==='walk');
    let animated=sampleClip(project.clips[clipName],time);const pose=project.pose,actual=figure.userData.avatar||{},authored=project.appearance;
    // A one-handed attack follows the actual equipped hand in the sheet.
    const opposite=actual.left&&!actual.right&&authored.right&&!authored.left||actual.right&&!actual.left&&authored.left&&!authored.right;
    if(clipName==='attack_sword'&&opposite)animated=Object.fromEntries(Object.entries(animated).map(([name,r])=>[name.endsWith('.R')?name.slice(0,-2)+'.L':name.endsWith('.L')?name.slice(0,-2)+'.R':name,[r[0],-r[1],-r[2]]]));
    if(clipName==='idle'&&!project.clips.idle?.keys.length)animated.spine03=[.006*Math.sin(time*Math.PI*2/(project.clips.idle?.duration||3)),0,0];
    for(const name of new Set([...Object.keys(pose),...Object.keys(animated)])){
      const b=bones.get(name);if(!b)continue;const r=[0,1,2].map(i=>(pose[name]?.[i]||0)+(animated[name]?.[i]||0));b.quaternion.multiply(new T.Quaternion().setFromEuler(new T.Euler(...r)));
    }
    figure.updateMatrixWorld(true);
  }
  applyStudioMaterials(figure,project.materials);
  figure.userData.setStudioProject=next=>{project=normalizeProject(next);applyStudioMaterials(figure,project.materials);};
  figure.userData.setStudioTime=render;
  figure.userData.playStudioAction=name=>{if(!project.clips[name])return;action={name,time:0};figure.userData.studioAnimating=true;};
  figure.userData.advanceStudio=(dt,moving=false)=>{
    if(action){action.time+=Math.max(0,Math.min(.1,dt));render(action.time,action.name);if(action.time>=project.clips[action.name].duration){action=null;figure.userData.studioAnimating=false;}}
    else render(clock,moving?'walk':'idle');
  };
  figure.userData.pose=(distance=0,moving=false)=>{clock+=Math.abs(distance)/1.5;if(!action)render(clock,moving?'walk':'idle');else rawPose(distance,moving);};
  render(0,'idle');
}
