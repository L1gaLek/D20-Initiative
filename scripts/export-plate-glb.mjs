import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHuman} from '../client/board-3d/human.mjs';

// Portable glTF 2.0 version of the same fitted meshes used by the game.
// Images, skeleton, inverse bind matrices and a looping walk are embedded.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function exportGLB(figure){
  const doc={asset:{version:'2.0',generator:'D20 Initiative plate model exporter'},scene:0,scenes:[{nodes:[0]}],nodes:[],meshes:[],materials:[],textures:[],images:[],samplers:[{wrapS:10497,wrapT:10497,magFilter:9729,minFilter:9987}],skins:[],animations:[],buffers:[{byteLength:0}],bufferViews:[],accessors:[]};
  const chunks=[],nodes=new Map(),materials=new Map(),images=new Map(),skins=new Map();let length=0;
  const view=(bytes,target)=>{const data=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength),padding=(4-length%4)%4;if(padding){chunks.push(Buffer.alloc(padding));length+=padding;}const id=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:length,byteLength:data.length,...target&&{target}});chunks.push(data);length+=data.length;return id;};
  function accessor(array,size,target,bounds=false){
    const componentType=array instanceof Float32Array?5126:array instanceof Uint16Array?5123:array instanceof Uint8Array?5121:5125;
    const a={bufferView:view(array,target),componentType,count:array.length/size,type:({1:'SCALAR',2:'VEC2',3:'VEC3',4:'VEC4',16:'MAT4'})[size]};
    if(bounds){a.min=Array(size).fill(Infinity);a.max=Array(size).fill(-Infinity);for(let i=0;i<array.length;i++){const k=i%size;a.min[k]=Math.min(a.min[k],array[i]);a.max[k]=Math.max(a.max[k],array[i]);}}
    doc.accessors.push(a);return doc.accessors.length-1;
  }
  function image(source,suffix){
    const name=source+'-'+suffix;if(!images.has(name)){const ext=suffix==='mr'?'png':'jpg',bytes=fs.readFileSync(path.join(root,'assets/materials/plate',name+'.'+ext));const id=doc.images.length;doc.images.push({name,bufferView:view(bytes),mimeType:ext==='jpg'?'image/jpeg':'image/png'});doc.textures.push({source:id,sampler:0});images.set(name,id);}return {index:images.get(name)};
  }
  function material(m){
    if(materials.has(m))return materials.get(m);const i=doc.materials.length,source=m.userData.materialSource,c=m.color;
    const out={name:m.userData.plateMaterial||m.name||'character-material',pbrMetallicRoughness:{baseColorFactor:[c.r,c.g,c.b,m.opacity],metallicFactor:m.metalness??0,roughnessFactor:m.roughness??1},doubleSided:m.side===2};
    if(source){out.pbrMetallicRoughness.baseColorTexture=image(source,'color');out.pbrMetallicRoughness.metallicRoughnessTexture=image(source,'mr');out.normalTexture={...image(source,'normal'),scale:m.normalScale.x};}
    if(m.transparent)out.alphaMode='BLEND';doc.materials.push(out);materials.set(m,i);return i;
  }
  figure.traverse(o=>{nodes.set(o,doc.nodes.length);doc.nodes.push({name:o.name||o.type,translation:o.position.toArray(),rotation:o.quaternion.toArray(),scale:o.scale.toArray()});});
  figure.traverse(o=>{const node=doc.nodes[nodes.get(o)];if(o.children.length)node.children=o.children.map(c=>nodes.get(c));if(!o.isMesh)return;
    const g=o.geometry,attributes={};
    if(o.material.userData.materialSource){g.computeTangents();const a=g.attributes;for(let i=0;i<a.tangent.count;i++){const n=[a.normal.getX(i),a.normal.getY(i),a.normal.getZ(i)],t=a.tangent.array.subarray(i*4,i*4+4);if(Math.hypot(...t.slice(0,3))<.1){let x=Math.abs(n[0])<.9?1:0,y=1-x,d=x*n[0]+y*n[1],tx=x-d*n[0],ty=y-d*n[1],tz=-d*n[2],l=Math.hypot(tx,ty,tz)||1;t.set([tx/l,ty/l,tz/l,1]);}}}
    for(const [key,semantic]of [['position','POSITION'],['normal','NORMAL'],['tangent','TANGENT'],['uv','TEXCOORD_0'],['color','COLOR_0'],['skinIndex','JOINTS_0'],['skinWeight','WEIGHTS_0']])if(g.attributes[key]&&(key!=='uv'||o.material.userData.materialSource)){const a=g.attributes[key],array=key==='skinIndex'?a.array.map((v,i)=>g.attributes.skinWeight.array[i]?v:0):a.array;attributes[semantic]=accessor(array,a.itemSize,34962,key==='position');}
    node.mesh=doc.meshes.length;doc.meshes.push({name:o.name,primitives:[{attributes,indices:accessor(g.index.array,1,34963),material:material(o.material)}]});
    if(o.isSkinnedMesh){const s=o.skeleton;if(!skins.has(s)){skins.set(s,doc.skins.length);doc.skins.push({name:'Humanoid',joints:s.bones.map(b=>nodes.get(b)),inverseBindMatrices:accessor(new Float32Array(s.boneInverses.flatMap(m=>m.toArray())),16),skeleton:nodes.get(s.bones.find(b=>!b.parent.isBone))});}node.skin=skins.get(s);}
  });
  const bones=[...nodes.keys()].filter(o=>o.isBone),frames=25,duration=2*Math.PI/15,times=new Float32Array(Array.from({length:frames},(_,i)=>i/(frames-1)*duration)),samples=new Map(bones.map(b=>[b,[]])),positions=[];
  figure.userData.pose(0,false);
  for(let i=0;i<frames;i++){
    figure.userData.pose(i?duration/(frames-1)*1.5:0,true);for(const b of bones)samples.get(b).push(...b.quaternion.toArray());positions.push(...figure.position.toArray());
  }
  const input=accessor(times,1,undefined,true),animation={name:'Walk',samplers:[],channels:[]};
  for(const b of bones){const values=samples.get(b);if(values.every((v,i)=>Math.abs(v-values[i%4])<1e-7))continue;const sampler=animation.samplers.length;animation.samplers.push({input,output:accessor(new Float32Array(values),4),interpolation:'LINEAR'});animation.channels.push({sampler,target:{node:nodes.get(b),path:'rotation'}});}
  if(!positions.every((v,i)=>Math.abs(v-positions[i%3])<1e-7)){const sampler=animation.samplers.length;animation.samplers.push({input,output:accessor(new Float32Array(positions),3),interpolation:'LINEAR'});animation.channels.push({sampler,target:{node:0,path:'translation'}});}
  doc.animations.push(animation);figure.userData.pose(0,false);
  const meshNodes=new Set([...nodes].filter(([o])=>o.isSkinnedMesh).map(([,i])=>i));for(const node of doc.nodes)if(node.children)node.children=node.children.filter(i=>!meshNodes.has(i));doc.scenes[0].nodes.push(...meshNodes);
  doc.buffers[0].byteLength=length;let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);let binary=Buffer.concat(chunks);binary=Buffer.concat([binary,Buffer.alloc((4-binary.length%4)%4)]);
  const header=Buffer.alloc(12),j=Buffer.alloc(8),b=Buffer.alloc(8);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+json.length+8+binary.length,8);j.writeUInt32LE(json.length,0);j.writeUInt32LE(0x4e4f534a,4);b.writeUInt32LE(binary.length,0);b.writeUInt32LE(0x004e4942,4);return Buffer.concat([header,j,json,b,binary]);
}
for(const sex of ['male','female']){
  const f=createHuman({model:'human-'+sex,armor:'plate',hair:sex==='female'?'braid':'parted',hairColor:'#493124'}),file=path.join(root,'assets/models/plate',sex+'.glb');fs.writeFileSync(file,exportGLB(f));const materials=new Set();f.traverse(o=>{o.userData.dispose?.();o.geometry?.dispose();if(o.material)materials.add(o.material);});materials.forEach(m=>m.dispose());console.log(sex,fs.statSync(file).size+' bytes');
}
