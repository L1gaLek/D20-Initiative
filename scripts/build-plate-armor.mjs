import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import male from '../assets/models/human/male.mjs';
import female from '../assets/models/human/female.mjs';
import {designPlate} from './plate-design.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),destination=path.join(root,'assets/models/plate');fs.mkdirSync(destination,{recursive:true});
const encode=array=>Buffer.from(array.buffer,array.byteOffset,array.byteLength).toString('base64');
for(const [sex,body]of [['male',male],['female',female]]){
  const groups=new Map();for(const part of designPlate(body,sex==='female')){
    const key=part.parent+'|'+part.material;if(!groups.has(key))groups.set(key,{parent:part.parent,material:part.material,names:new Set(),p:[],n:[],uv:[],ix:[]});
    const group=groups.get(key),g=part.geometry,a=g.attributes,start=group.p.length/3,indices=g.index?Array.from(g.index.array):Array.from({length:a.position.count},(_,i)=>i),used=[...new Set(indices)].sort((x,y)=>x-y),remap=new Map();group.names.add(part.name);
    // Cut-outs leave grid vertices behind. Remove them rather than exporting
    // undefined normals or wasting skinning work on invisible helmet faces.
    for(const [at,i]of used.entries()){
      const n=[a.normal.getX(i),a.normal.getY(i),a.normal.getZ(i)],length=Math.hypot(...n);if(length<.9||length>1.1)throw Error(part.name+' has an invalid used normal at '+i);
      remap.set(i,start+at);group.p.push(a.position.getX(i),a.position.getY(i),a.position.getZ(i));group.n.push(...n);group.uv.push(a.uv.getX(i),a.uv.getY(i));
    }
    for(const i of indices)group.ix.push(remap.get(i));g.dispose();
  }
  let triangles=0;const pieces=[];for(const group of groups.values()){
    triangles+=group.ix.length/3;pieces.push({parent:group.parent,material:group.material,name:[...group.names].join(' '),positions:encode(new Float32Array(group.p)),normals:encode(new Float32Array(group.n)),uv:encode(new Float32Array(group.uv)),indices:encode(new Uint32Array(group.ix))});
  }
  const model={version:2,style:'gothic-reference',sex,units:'meters',generator:'scripts/plate-design.mjs',pieces};
  fs.writeFileSync(path.join(destination,sex+'.mjs'),'// Baked plate model. Rebuild with node scripts/build-plate-armor.mjs.\nexport default '+JSON.stringify(model)+';\n');
  console.log(JSON.stringify({sex,pieces:pieces.length,triangles,bytes:fs.statSync(path.join(destination,sex+'.mjs')).size}));
}
fs.writeFileSync(path.join(destination,'source-hashes.json'),JSON.stringify(Object.fromEntries(['scripts/plate-design.mjs','scripts/plate-reference-parts.mjs','assets/models/human/male.mjs','assets/models/human/female.mjs'].map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n/g,'\n')).digest('hex')])),null,2)+'\n');
