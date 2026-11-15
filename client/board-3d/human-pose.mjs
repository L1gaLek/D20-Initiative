import * as THREE from '../../vendor/three/three.module.mjs';
const vector=a=>new THREE.Vector3(...a);
const frame=(y,z)=>{y=y.clone().normalize();z=z.clone().addScaledVector(y,-z.dot(y)).normalize();const x=new THREE.Vector3().crossVectors(y,z).normalize();return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));};

export function handGrip(definitions,side){
  const point=name=>vector(definitions.get(`${name}.${side}`).head),wrist=point('wrist'),index=point('finger2-1'),pinky=point('finger5-1');
  const across=index.clone().sub(pinky).normalize(),forward=point('finger3-1').sub(wrist).normalize();
  forward.addScaledVector(across,-forward.dot(across)).normalize();
  const normal=new THREE.Vector3().crossVectors(across,forward).multiplyScalar(side==='R'?1:-1).normalize();
  const center=new THREE.Vector3();for(let i=2;i<=5;i++)center.addScaledVector(point(`finger${i}-1`),.25);
  // Handle center is on the palmar side, beyond the knuckles. Its radius and
  // the folded finger pads meet here instead of passing through one another.
  center.addScaledVector(normal,.025).addScaledVector(forward,.020);
  return {center,wrist,across,forward,normal,quaternion:frame(across.clone().negate(),normal)};
}

// Solve the complete upper/lower arm, including its twist bones, rather than
// guessing Euler offsets. The resulting wrist and equipment use one palm frame.
export function planHumanPose(config,definitions){
  const twoSide=config.twoHanded==='right'&&config.right||config.right==='great'?'R':config.twoHanded==='left'&&config.left||config.left==='great'?'L':null;
  const shieldSide=!twoSide&&config.shield?(config.shieldHand==='right'||!config.shieldHand&&config.left&&!config.right?'R':'L'):null;
  const right=shieldSide==='R'?null:config.right,left=shieldSide==='L'?null:config.left;
  const stance=twoSide?'two-handed':shieldSide?'shield':right&&left?'dual':right||left?'single':'unarmed',arms={};
  const twoBlade=new THREE.Vector3(twoSide==='R'?.46:-.46,.84,.28).normalize(),twoAxis=twoBlade.clone().negate();
  const twoCenter=new THREE.Vector3(twoSide==='R'?-.035:.035,1.20,.245);
  for(const side of ['R','L']){
    const sign=side==='L'?1:-1,weapon=twoSide&&side!==twoSide?null:side==='R'?right:left,shield=side===shieldSide,support=!!twoSide&&side!==twoSide;
    const shoulder=vector(definitions.get(`upperarm01.${side}`).head),elbow=vector(definitions.get(`lowerarm01.${side}`).head),wrist=vector(definitions.get(`wrist.${side}`).head),grip=handGrip(definitions,side);
    let desired,wristQ;
    if(twoSide){desired=frame(twoAxis,new THREE.Vector3(0,0,support?-1:1));wristQ=desired.multiply(grip.quaternion.clone().invert());}
    const target=twoSide?twoCenter.clone().addScaledVector(twoAxis,support?.115:0).sub(grip.center.clone().sub(grip.wrist).applyQuaternion(wristQ)):
      shield?new THREE.Vector3(sign*.255,1.075,.205):weapon?new THREE.Vector3(sign*(stance==='dual'?.25:stance==='shield'?.22:.235),stance==='shield'?.985:1.055,stance==='shield'?.145:.18):new THREE.Vector3(sign*(Math.abs(shoulder.x)+.06),shoulder.y-.419,.035);
    const upper=elbow.clone().sub(shoulder),lower=wrist.clone().sub(elbow),l1=upper.length(),l2=lower.length(),direction=target.clone().sub(shoulder);
    const distance=Math.min(direction.length(),l1+l2-.003);direction.normalize();target.copy(shoulder).addScaledVector(direction,distance);
    const bend=twoSide?new THREE.Vector3(sign,-.15,-.4):shield?new THREE.Vector3(sign,.15,-.25):weapon?new THREE.Vector3(sign,0,-.22):new THREE.Vector3(sign*.15,0,-1);bend.addScaledVector(direction,-bend.dot(direction)).normalize();
    const a=(l1*l1-l2*l2+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-a*a)),joint=shoulder.clone().addScaledVector(direction,a).addScaledVector(bend,height);
    const upperQ=new THREE.Quaternion().setFromUnitVectors(upper.normalize(),joint.clone().sub(shoulder).normalize());
    const lowerQ=new THREE.Quaternion().setFromUnitVectors(lower.normalize(),target.clone().sub(joint).normalize());
    if(twoSide){/* Both palms were placed on the same hilt before the IK solve. */}
    else if(weapon){const blade=stance==='shield'?new THREE.Vector3(-sign*.68,-.70,.22).normalize():new THREE.Vector3(stance==='dual'?sign*.18:sign*.06,.78,.62).normalize();desired=frame(blade.negate(),new THREE.Vector3(0,0,1));}
    else if(shield){
      // Knuckles face the wooden back, palm faces the wearer. The shield's
      // outside has its own opposite normal; it must not dictate palm facing.
      const forward=target.clone().sub(joint).normalize(),normal=new THREE.Vector3(0,0,-1);normal.addScaledVector(forward,-normal.dot(forward)).normalize();
      const across=new THREE.Vector3().crossVectors(forward,normal).multiplyScalar(side==='R'?1:-1);
      desired=frame(across.negate(),normal);
    }
    else {const z=new THREE.Vector3(-sign,0,0),x=new THREE.Vector3(0,side==='R'?-1:1,.08);desired=frame(new THREE.Vector3().crossVectors(z,x),z);}
    if(!twoSide)wristQ=desired.multiply(grip.quaternion.clone().invert());
    arms[side]={side,weapon,shield,support,grip,shoulder,elbow,wrist,target,joint,upperQ,lowerQ,wristQ};
  }
  return {stance,arms,shieldSide,twoSide};
}

export function applyHumanPose(byName,definitions,plan){
  const worldQuaternion=(bone,quaternion)=>{bone.parent.updateWorldMatrix(true,false);bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(quaternion));bone.updateWorldMatrix(false,true);};
  const aim=(name,direction)=>{const b=definitions.get(name),rest=vector(b.tail).sub(vector(b.head)).normalize();worldQuaternion(byName.get(name),new THREE.Quaternion().setFromUnitVectors(rest,direction.normalize()));};
  // Fingers curl toward the palm around the handle's actual axis. Their lengths
  // and authored skin weights are preserved, for both mirrored hands and sexes.
  for(const side of ['L','R']){
    const arm=plan.arms[side],holding=!!(arm.weapon||arm.shield||arm.support),{forward,normal,across,center}=arm.grip;
    for(let finger=2;finger<=5;finger++)for(let segment=1;segment<=3;segment++){
      const angle=holding?[.20,1.48,2.85][segment-1]:[.08,.22,.36][segment-1];
      const direction=forward.clone().multiplyScalar(Math.cos(angle)).addScaledVector(normal,Math.sin(angle));
      direction.addScaledVector(across,(3.5-finger)*.025);aim(`finger${finger}-${segment}.${side}`,direction);
    }
    if(holding)for(let segment=1;segment<=3;segment++){
      const name=`finger1-${segment}.${side}`,bone=byName.get(name);bone.updateWorldMatrix(true,false);
      const target=center.clone().addScaledVector(across,[.032,.014,.003][segment-1]).addScaledVector(normal,[.0,.018,.014][segment-1]).addScaledVector(forward,[.008,.006,-.005][segment-1]);
      aim(name,target.sub(bone.getWorldPosition(new THREE.Vector3())));
    }
  }
  for(const side of ['L','R']){
    const arm=plan.arms[side],sign=side==='L'?1:-1;
    byName.get(`upperleg01.${side}`).rotation.z=-sign*.075;
    worldQuaternion(byName.get(`upperarm01.${side}`),arm.upperQ);
    worldQuaternion(byName.get(`lowerarm01.${side}`),arm.lowerQ);
    worldQuaternion(byName.get(`wrist.${side}`),arm.wristQ);
  }
}
