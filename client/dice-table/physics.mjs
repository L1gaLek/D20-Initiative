import * as CANNON from '../../vendor/cannon-es/cannon-es.mjs';
import {polyhedron,random,seedNumber} from './model.mjs?v=20261124-charge-1';

export function simulateThrow(dice, seed) {
  const rand=random(seedNumber(seed)),count=dice.length;
  const columns=Math.ceil(Math.sqrt(count*1.5)),rows=Math.ceil(count/columns);
  const radius=count<=2?.94:count<=6?.78:.62,spacing=radius*2+.3;
  const width=Math.max(6.6,columns*spacing+1),depth=Math.max(4.6,rows*spacing+1);
  const world=new CANNON.World({gravity:new CANNON.Vec3(0,-24,0),allowSleep:true});
  world.solver.iterations=12;world.defaultContactMaterial.friction=.28;world.defaultContactMaterial.restitution=.34;
  const ground=new CANNON.Body({mass:0,shape:new CANNON.Plane()});ground.quaternion.setFromEuler(-Math.PI/2,0,0);world.addBody(ground);
  for(const [x,z,hx,hz] of [[-width/2-.5,0,.5,depth],[width/2+.5,0,.5,depth],[0,-depth/2-.5,width,.5],[0,depth/2+.5,width,.5]]){
    const wall=new CANNON.Body({mass:0,shape:new CANNON.Box(new CANNON.Vec3(hx,5,hz)),position:new CANNON.Vec3(x,4,z)});world.addBody(wall);
  }
  const bodies=dice.map((die,i)=>{
    const poly=polyhedron(die.sides);
    const shape=new CANNON.ConvexPolyhedron({vertices:poly.vertices.map(v=>new CANNON.Vec3(...v.map(n=>n*radius))),faces:poly.faces.map(f=>f.indices)});
    const body=new CANNON.Body({mass:1,shape,linearDamping:.24,angularDamping:.2,sleepSpeedLimit:.04,sleepTimeLimit:.4});
    const x=((i%columns)-(columns-1)/2)*spacing+(rand()-.5)*.15,z=(Math.floor(i/columns)-(rows-1)/2)*spacing;
    const rawPower=Number(die.throwPower),power=Number.isFinite(rawPower)?Math.max(0,Math.min(1,rawPower)):0;
    body.position.set(x,2.4+rand()*.9+power*.65,z);body.velocity.set((rand()-.5)*(2+power*8),-1-rand()-power*2,(rand()-.5)*(2+power*8));
    const spin=22+power*30;body.angularVelocity.set((rand()-.5)*spin,(rand()-.5)*spin,(rand()-.5)*spin);
    body.quaternion.setFromEuler(rand()*Math.PI*2,rand()*Math.PI*2,rand()*Math.PI*2);world.addBody(body);return body;
  });
  const frames=[];
  const record=()=>{for(const b of bodies)frames.push(b.position.x,b.position.y,b.position.z,b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w);};
  record();let steps=0;
  for(;steps<720;steps++){
    world.step(1/120);if(steps%2===1)record();
    if(steps>120&&(steps%30===0||bodies.every(b=>b.sleepState===CANNON.Body.SLEEPING)))bodies.forEach((body,i)=>{
      if(body.velocity.lengthSquared()+body.angularVelocity.lengthSquared()>.04)return;
      const shape=polyhedron(dice[i].sides),target=new CANNON.Vec3(0,dice[i].sides===4?-1:1,0);
      let best=null,score=-Infinity;
      for(const index of shape.eligible){const n=body.quaternion.vmult(new CANNON.Vec3(...shape.faces[index].normal)),value=n.dot(target);if(value>score){score=value;best=n;}}
      // Resolve a numerically balanced edge with a small physical nudge. Labels
      // are assigned only after this simulation, so this never picks a result.
      if(score<.985){const axis=best.cross(target);axis.normalize();body.wakeUp();body.angularVelocity.vadd(axis.scale(.8),body.angularVelocity);}
    });
    if(steps>120&&bodies.every(b=>b.sleepState===CANNON.Body.SLEEPING))break;
  }
  // An exceptionally balanced edge is allowed to finish gently rather than
  // forcing an impossible orientation. Read the physical resting face below.
  record();
  const upFaces=bodies.map((body,i)=>{
    const poly=polyhedron(dice[i].sides);let best=poly.eligible[0],score=-Infinity;
    for(const index of poly.eligible){const n=body.quaternion.vmult(new CANNON.Vec3(...poly.faces[index].normal));const value=dice[i].sides===4?-n.y:n.y;if(value>score){score=value;best=index;}}
    return best;
  });
  return {frames:new Float32Array(frames),frameCount:frames.length/(count*7),count,width,depth,radius,upFaces,seconds:(steps+1)/120};
}
