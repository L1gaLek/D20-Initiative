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

function shoulderGrip(grip,side,palm,axis,shoulder,upper,lower){
  const base=new THREE.Vector3(0,0,1).addScaledVector(axis,-axis.z).normalize(),inverse=grip.quaternion.clone().invert();
  const rawForward=grip.forward.clone().multiplyScalar(Math.sqrt(1-grip.axisSlope**2)).addScaledVector(grip.across,-grip.axisSlope);
  const desiredElbow=new THREE.Vector3(side==='R'?-.31:.31,1.15,.09);let best;
  const evaluate=angle=>{
    const normal=base.clone().applyAxisAngle(axis,angle),wristQ=frame(axis,normal).multiply(inverse);
    const target=palm.clone().sub(grip.center.clone().sub(grip.wrist).applyQuaternion(wristQ)),original=target.clone();
    const forward=rawForward.clone().applyQuaternion(wristQ),straight=target.clone().addScaledVector(forward,-lower).sub(shoulder);
    const joint=elbowFor(shoulder,target,upper,lower,straight);
    const intrusion=Math.max(0,.20+(side==='R'?joint.x:-joint.x))*Math.max(0,.28-joint.z);
    const bend=target.clone().sub(joint).angleTo(forward),score=intrusion*10000+bend*bend*8+joint.distanceToSquared(desiredElbow)*.5+target.distanceToSquared(original)*1000;
    if(!best||score<best.score)best={score,angle,target,joint,wristQ};
  };
  // Solve roll about the fixed hilt, rather than iterating a wrist-offset map
  // that can flip between opposite solutions when a hand is near its shoulder.
  for(let i=0;i<72;i++)evaluate(i*Math.PI/36);
  const angle=best.angle;for(let i=-10;i<=10;i++)evaluate(angle+i*Math.PI/1800);
  return best;
}

export function planHumanPose(config,definitions){
  const twoSide=(config.twoHanded==='right'&&config.right)||config.right==='great'?'R':(config.twoHanded==='left'&&config.left)||config.left==='great'?'L':null;
  const shieldSide=!twoSide&&config.shield?(config.shieldHand==='right'||!config.shieldHand&&config.left&&!config.right?'R':'L'):null;
  const right=shieldSide==='R'?null:config.right,left=shieldSide==='L'?null:config.left;
  const stance=twoSide?'two-handed':shieldSide?'shield':right&&left?'dual':right||left?'single':'unarmed',arms={};
  // The idle greatsword rests over the wielding shoulder. Its equipment still
  // occupies both slots, while the other hand rests naturally at the hip.
  const twoAxis=new THREE.Vector3(twoSide==='R'?-.30:.30,-.30,.85).normalize(),twoCenter=new THREE.Vector3(twoSide==='R'?-.40:.40,1.44,.10);
  for(const side of ['R','L']){
    const sign=side==='L'?1:-1,hip=!!twoSide&&side!==twoSide,weapon=hip?null:side==='R'?right:left,shield=side===shieldSide;
    const shoulder=vector(definitions.get(`upperarm01.${side}`).head),elbow=vector(definitions.get(`lowerarm01.${side}`).head),wrist=vector(definitions.get(`wrist.${side}`).head),grip=handGrip(definitions,side);
    const upper=elbow.clone().sub(shoulder),lower=wrist.clone().sub(elbow),l1=upper.length(),l2=lower.length();
    const blade=new THREE.Vector3(sign*.74,-.65,.18).normalize();
    const axis=hip?null:twoSide?twoAxis:weapon?blade.negate():null;
    const target=hip?new THREE.Vector3(sign*.255,1.075,.095):shield?new THREE.Vector3(sign*.255,1.125,.245):weapon?new THREE.Vector3(sign*.25,.985,.16):new THREE.Vector3(sign*(Math.abs(shoulder.x)+.06),shoulder.y-.419,.035);
    const preferred=hip?new THREE.Vector3(sign,.05,-.55):twoSide?new THREE.Vector3(sign,-1,-.1):shield?new THREE.Vector3(sign,.15,-.25):weapon?new THREE.Vector3(sign,0,-.22):new THREE.Vector3(sign*.15,0,-1);
    let wristQ,joint;
    if(twoSide&&!hip){
      const solved=shoulderGrip(grip,side,twoCenter,axis,shoulder,l1,l2);
      target.copy(solved.target);wristQ=solved.wristQ;joint=solved.joint;
    }
    if(!joint)joint=elbowFor(shoulder,target,l1,l2,preferred,axis,grip.axisSlope);
    const direction=target.clone().sub(joint).normalize();
    if(hip){
      const normal=new THREE.Vector3(-sign,0,.2).normalize();
      wristQ=frame(direction,normal).multiply(frame(grip.forward,grip.normal).invert());
    }else if(!twoSide&&weapon)wristQ=gripRotation(grip,side,axis,direction);
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
    arms[side]={side,weapon,shield,hip,grip,shoulder,elbow,wrist,target,joint,upperQ,lowerQ,wristQ};
  }
  return {stance,arms,shieldSide,twoSide};
}

export function applyHumanPose(byName,definitions,plan){
  const worldQuaternion=(bone,quaternion)=>{bone.parent.updateWorldMatrix(true,false);bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(quaternion));bone.updateWorldMatrix(false,true);};
  const aim=(name,direction)=>{const b=definitions.get(name),rest=vector(b.tail).sub(vector(b.head)).normalize();worldQuaternion(byName.get(name),new THREE.Quaternion().setFromUnitVectors(rest,direction.normalize()));};
  // Fingers curl toward the palm around the handle's actual axis. Their lengths
  // and authored skin weights are preserved, for both mirrored hands and sexes.
  for(const side of ['L','R']){
    const arm=plan.arms[side],holding=!!(arm.weapon||arm.shield),{forward,normal,across,center}=arm.grip;
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
