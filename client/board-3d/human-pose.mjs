import * as THREE from '../../vendor/three/three.module.mjs';
const vector=a=>new THREE.Vector3(...a);
const frame=(y,z)=>{y=y.clone().normalize();z=z.clone().addScaledVector(y,-z.dot(y)).normalize();const x=new THREE.Vector3().crossVectors(y,z).normalize();return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));};

export function handGrip(definitions,side){
  const point=name=>vector(definitions.get(`${name}.${side}`).head),wrist=point('wrist'),index=point('finger2-1'),pinky=point('finger5-1');
  const across=index.clone().sub(pinky).normalize(),forward=point('finger3-1').sub(wrist).normalize();
  const axisSlope=-forward.dot(across);
  forward.addScaledVector(across,-forward.dot(across)).normalize();
  const normal=new THREE.Vector3().crossVectors(across,forward).multiplyScalar(side==='R'?1:-1).normalize();
  const center=new THREE.Vector3();for(let i=2;i<=5;i++)center.addScaledVector(point(`finger${i}-1`),.25);
  // Handle center is on the palmar side, beyond the knuckles. Its radius and
  // the folded finger pads meet here instead of passing through one another.
  center.addScaledVector(normal,.025).addScaledVector(forward,.020);
  return {center,wrist,across,forward,normal,axisSlope,quaternion:frame(across.clone().negate(),normal)};
}

// The elbow lies on the intersection circle of the two limb-length spheres.
// A weapon also constrains the forearm to the plane normal to its handle: this
// lets the wrist stay straight instead of folding a hand back to meet a sword.
function elbowFor(shoulder,target,upper,lower,preferred,handleAxis,axisSlope=0){
  const direction=target.clone().sub(shoulder),distance=Math.min(direction.length(),upper+lower-.003);direction.normalize();target.copy(shoulder).addScaledVector(direction,distance);
  const a=(upper*upper-lower*lower+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,upper*upper-a*a)),center=shoulder.clone().addScaledVector(direction,a);
  let bend=preferred.clone().addScaledVector(direction,-preferred.dot(direction)).normalize();
  if(handleAxis&&height>.0001){
    const projected=handleAxis.clone().addScaledVector(direction,-handleAxis.dot(direction)),length=projected.length();
    if(length>.001){
      // Knuckles are oblique in the authored hand. Measure the neutral grip
      // from that hand, rather than assuming both palms form a right angle.
      const offset=target.clone().sub(center),current=offset.clone().addScaledVector(bend,-height).dot(handleAxis)/lower,neutral=Math.asin(axisSlope),min=Math.sin(neutral-12*Math.PI/180),max=Math.sin(neutral+12*Math.PI/180);
      if(current<min||current>max){
        const u=projected.divideScalar(length),v=new THREE.Vector3().crossVectors(direction,u).normalize(),wanted=THREE.MathUtils.clamp(current,min,max),k=THREE.MathUtils.clamp((offset.dot(handleAxis)-wanted*lower)/(height*length),-1,1),t=Math.sqrt(1-k*k);
        const first=u.clone().multiplyScalar(k).addScaledVector(v,t),second=u.clone().multiplyScalar(k).addScaledVector(v,-t);bend=first.dot(bend)>second.dot(bend)?first:second;
      }
    }
  }
  return center.addScaledVector(bend,height);
}
function gripRotation(grip,side,axis,forearm){
  const forward=forearm.clone().addScaledVector(axis,-forearm.dot(axis)).normalize();
  const normal=new THREE.Vector3().crossVectors(forward,axis).multiplyScalar(side==='R'?1:-1).normalize();
  return frame(axis,normal).multiply(grip.quaternion.clone().invert());
}

export function planHumanPose(config,definitions){
  const twoSide=(config.twoHanded==='right'&&config.right)||config.right==='great'?'R':(config.twoHanded==='left'&&config.left)||config.left==='great'?'L':null;
  const shieldSide=!twoSide&&config.shield?(config.shieldHand==='right'||!config.shieldHand&&config.left&&!config.right?'R':'L'):null;
  const right=shieldSide==='R'?null:config.right,left=shieldSide==='L'?null:config.left;
  const stance=twoSide?'two-handed':shieldSide?'shield':right&&left?'dual':right||left?'single':'unarmed',arms={};
  const twoAxis=new THREE.Vector3(twoSide==='R'?-.46:.46,-.84,-.80).normalize(),twoCenter=new THREE.Vector3(twoSide==='R'?-.035:.035,1.24,.42);
  for(const side of ['R','L']){
    const sign=side==='L'?1:-1,weapon=twoSide&&side!==twoSide?null:side==='R'?right:left,shield=side===shieldSide,support=!!twoSide&&side!==twoSide;
    const shoulder=vector(definitions.get(`upperarm01.${side}`).head),elbow=vector(definitions.get(`lowerarm01.${side}`).head),wrist=vector(definitions.get(`wrist.${side}`).head),grip=handGrip(definitions,side);
    const upper=elbow.clone().sub(shoulder),lower=wrist.clone().sub(elbow),l1=upper.length(),l2=lower.length();
    const blade=new THREE.Vector3(stance==='dual'?sign*.68:-sign*.68,-.70,.22).normalize();
    const axis=twoSide?twoAxis:weapon?blade.negate():null;
    const target=shield?new THREE.Vector3(sign*.255,1.075,.205):weapon?new THREE.Vector3(sign*(stance==='dual'?.25:.22),.985,.145):new THREE.Vector3(sign*(Math.abs(shoulder.x)+.06),shoulder.y-.419,.035);
    const preferred=twoSide?new THREE.Vector3(sign,-.15,-.4):shield?new THREE.Vector3(sign,.15,-.25):weapon?new THREE.Vector3(sign,0,-.22):new THREE.Vector3(sign*.15,0,-1);
    let wristQ,joint;
    if(twoSide){
      const palm=twoCenter.clone().addScaledVector(twoAxis,support?.115:0);
      wristQ=gripRotation(grip,side,axis,palm.clone().sub(shoulder).normalize());
      // Reconcile the wrist offset with the common grip, without stretching the
      // limb or moving either palm along the two-handed sword's handle.
      for(let i=0;i<12;i++){
        target.copy(palm).sub(grip.center.clone().sub(grip.wrist).applyQuaternion(wristQ));
        joint=elbowFor(shoulder,target,l1,l2,preferred,axis,grip.axisSlope);
        wristQ=gripRotation(grip,side,axis,target.clone().sub(joint).normalize());
      }
      target.copy(palm).sub(grip.center.clone().sub(grip.wrist).applyQuaternion(wristQ));
    }
    joint=elbowFor(shoulder,target,l1,l2,preferred,axis,grip.axisSlope);
    const direction=target.clone().sub(joint).normalize();
    if(!twoSide&&weapon)wristQ=gripRotation(grip,side,axis,direction);
    else if(shield){
      const normal=new THREE.Vector3(0,0,-1).addScaledVector(direction,direction.z).normalize(),across=new THREE.Vector3().crossVectors(direction,normal).multiplyScalar(side==='R'?1:-1);
      wristQ=frame(across.negate(),normal).multiply(grip.quaternion.clone().invert());
    }else if(!twoSide&&!weapon){
      const z=new THREE.Vector3(-sign,0,0),x=new THREE.Vector3(0,side==='R'?-1:1,.08);wristQ=frame(new THREE.Vector3().crossVectors(z,x),z).multiply(grip.quaternion.clone().invert());
    }
    const upperQ=new THREE.Quaternion().setFromUnitVectors(upper.clone().normalize(),joint.clone().sub(shoulder).normalize());
    // Pronation belongs to the forearm. Carry the palm normal through the lower
    // arm so it is not introduced as a 120-180 degree twist at the wrist seam.
    const palmNormal=grip.normal.clone().applyQuaternion(wristQ);
    const lowerQ=frame(direction,palmNormal).multiply(frame(lower,grip.normal).invert());
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
