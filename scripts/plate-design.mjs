import * as T from '../vendor/three/three.module.mjs';
import {buildReferencePlate} from './plate-reference-parts.mjs';

// Authored plate patterns in metres. This file is a build-time modelling source;
// the browser receives baked, fitted meshes, not these construction operations.
export function designPlate(body,female){
  const parts=[],defs=new Map(body.bones.map(b=>[b.name,b])),tau=Math.PI*2;
  const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  const pos=new Float32Array(bytes(body.positions).buffer),joints=bytes(body.skinIndices),weights=bytes(body.skinWeights);
  const points=Array.from({length:pos.length/3},(_,i)=>{let k=0;for(let n=1;n<4;n++)if(weights[i*4+n]>weights[i*4+k])k=n;return {p:new T.Vector3(...pos.slice(i*3,i*3+3)),bone:body.bones[joints[i*4+k]].name};});
  const V=a=>new T.Vector3(...a),bone=n=>V(defs.get(n).head),bodyIndices=new Uint16Array(bytes(body.indices).buffer);
  function skinTop(x,z){let y=1.20;for(let i=0;i<bodyIndices.length;i+=3){const a=bodyIndices[i]*3,b=bodyIndices[i+1]*3,c=bodyIndices[i+2]*3,dx=pos[b]-pos[a],dz=pos[b+2]-pos[a+2],ex=pos[c]-pos[a],ez=pos[c+2]-pos[a+2],d=dx*ez-dz*ex;if(Math.abs(d)<1e-10)continue;const u=((x-pos[a])*ez-(z-pos[a+2])*ex)/d,v=(dx*(z-pos[a+2])-dz*(x-pos[a]))/d;if(u<0||v<0||u+v>1)continue;const at=pos[a+1]+u*(pos[b+1]-pos[a+1])+v*(pos[c+1]-pos[a+1]);if(at<1.48)y=Math.max(y,at);}return y;}
  const add=(name,parent,material,g)=>{if(!g.attributes.uv){const a=g.attributes.position,uv=[];for(let i=0;i<a.count;i++)uv.push(a.getX(i)/.14,a.getY(i)/.14);g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));}parts.push({name,parent,material,geometry:g});};
  function shell(name,parent,material,point,nu=28,nv=10,thickness=.0028,cut=null){
    const p=[],uv=[],ix=[];for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){const q=point(i/nu,j/nv);p.push(...q);uv.push(i/nu*4,j/nv*2);}
    for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){if(cut?.((i+.5)/nu,(j+.5)/nv))continue;const a=j*(nu+1)+i,b=a+nu+1;ix.push(a,a+1,b,a+1,b+1,b);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();
    const count=p.length/3,a=g.attributes,outerNormals=a.normal.array.slice(),edges=new Map(),outer=ix.slice();
    for(let i=0;i<count;i++){p.push(a.position.getX(i)-a.normal.getX(i)*thickness,a.position.getY(i)-a.normal.getY(i)*thickness,a.position.getZ(i)-a.normal.getZ(i)*thickness);uv.push(a.uv.getX(i),a.uv.getY(i));}
    for(let i=0;i<outer.length;i+=3){ix.push(outer[i]+count,outer[i+2]+count,outer[i+1]+count);for(const [x,y]of [[outer[i],outer[i+1]],[outer[i+1],outer[i+2]],[outer[i+2],outer[i]]]){const k=x<y?x+','+y:y+','+x;if(edges.has(k))edges.delete(k);else edges.set(k,[x,y]);}}
    for(const [x,y]of edges.values()){const start=p.length/3;for(const i of [x,y,x+count,y+count]){p.push(...p.slice(i*3,i*3+3));uv.push(...uv.slice(i*2,i*2+2));}ix.push(start,start+1,start+2,start+1,start+3,start+2);}
    g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();for(let i=0;i<count*3;i++){g.attributes.normal.array[i]=outerNormals[i];g.attributes.normal.array[count*3+i]=-outerNormals[i];}add(name,parent,material,g);
    return {point};
  }
  function seam(name,parent,material,pts,r=.0017){const g=new T.TubeGeometry(new T.CatmullRomCurve3(pts.map(V)),Math.max(8,Math.min(20,pts.length)),r,5,false);add(name,parent,material,g);}
  function rim(name,parent,point,material='edge',radius=.0019){
    for(const v of [0,1])seam(name,parent,material,Array.from({length:37},(_,i)=>point(i/36,v)),radius);
  }
  function rivet(p,parent,normal=[0,0,1],brass=false){
    const q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),V(normal).normalize()),g=new T.CylinderGeometry(.0025,.003,.0016,8,1);g.applyQuaternion(q);g.translate(...p);add('peened-rivet',parent,brass?'brass':'edge',g);
  }
  function strap(parent,pts,width=.015){
    const path=new T.CatmullRomCurve3(pts.map(V)),samples=path.getPoints(Math.max(4,pts.length*3)),p=[],ix=[],borders=[[],[]];
    const preferred=Math.abs(path.getTangent(.03).x)<.75?new T.Vector3(1,0,0):new T.Vector3(0,1,0);let previous=preferred.clone();
    for(let i=0;i<samples.length;i++){const v=samples[i],t=path.getTangent(i/(samples.length-1)),side=preferred.clone().addScaledVector(t,-preferred.dot(t));if(side.lengthSq()<1e-8)side.copy(previous);side.normalize();if(side.dot(previous)<0)side.negate();previous.copy(side);side.multiplyScalar(width/2);const a=v.clone().sub(side),b=v.clone().add(side);p.push(...a,...b);borders[0].push(a.toArray());borders[1].push(b.toArray());if(i){const q=(i-1)*2;ix.push(q,q+1,q+2,q+1,q+3,q+2);}}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();add('stitched-leather-strap',parent,'leather',g);
    for(const border of borders)seam('saddle-stitch',parent,'linen',border,.00045);
  }
  function buckle(parent,p,width=.020){const[x,y,z]=p;seam('forged-buckle',parent,'brass',[[x-width/2,y-.010,z],[x+width/2,y-.010,z],[x+width/2,y+.010,z],[x-width/2,y+.010,z],[x-width/2,y-.010,z]],.0018);seam('buckle-tongue',parent,'edge',[[x,y-.01,z],[x,y+.008,z+.001]],.0011);}
  function limbFrame(parent,end){const a=bone(parent),b=bone(end),axis=b.clone().sub(a).normalize(),front=new T.Vector3(0,0,1);front.addScaledVector(axis,-front.dot(axis)).normalize();return {a,b,axis,front,side:new T.Vector3().crossVectors(axis,front),length:a.distanceTo(b)};}
  function fitLimb(parent,end,pattern){
    const f=limbFrame(parent,end),sexSide=parent.slice(-1),candidates=points.filter(p=>p.bone.endsWith('.'+sexSide)&&pattern.test(p.bone)).map(({p})=>{const q=p.clone().sub(f.a);return {t:q.dot(f.axis)/f.length,n:q.dot(f.front),s:q.dot(f.side)};});
    const rows=Array.from({length:15},(_,i)=>{const t=i/14,near=candidates.filter(p=>Math.abs(p.t-t)<.065);const pick=near.length>4?near:candidates.toSorted((a,b)=>Math.abs(a.t-t)-Math.abs(b.t-t)).slice(0,14);let n0=Infinity,n1=-Infinity,s0=Infinity,s1=-Infinity;for(const p of pick){n0=Math.min(n0,p.n);n1=Math.max(n1,p.n);s0=Math.min(s0,p.s);s1=Math.max(s1,p.s);}return {t,n:(n0+n1)/2,s:(s0+s1)/2,rn:Math.max(.009,(n1-n0)*.54+.010),rs:Math.max(.009,(s1-s0)*.54+.009)};});
    return (t,a,extra=0)=>{const at=T.MathUtils.clamp(t,0,.99999)*14,i=Math.floor(at),r=rows[i],q=rows[Math.min(14,i+1)],v=at-i,lerp=k=>T.MathUtils.lerp(r[k],q[k],v);return f.a.clone().addScaledVector(f.axis,t*f.length).addScaledVector(f.front,lerp('n')+Math.cos(a)*(lerp('rn')+extra)).addScaledVector(f.side,lerp('s')+Math.sin(a)*(lerp('rs')+extra)).toArray();};
  }
  buildReferencePlate({T,defs,parts,points,V,bone,add,shell,seam,rim,rivet,strap,buckle,limbFrame,fitLimb,skinTop,female});
  return parts;
}
