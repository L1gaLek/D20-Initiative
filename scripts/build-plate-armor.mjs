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
    const group=groups.get(key),g=part.geometry,a=g.attributes,start=group.p.length/3;group.names.add(part.name);group.p.push(...a.position.array);group.n.push(...a.normal.array);group.uv.push(...a.uv.array);
    if(g.index)for(const i of g.index.array)group.ix.push(i+start);else for(let i=0;i<a.position.count;i++)group.ix.push(i+start);g.dispose();
  }
  let triangles=0;const pieces=[];for(const group of groups.values()){
    triangles+=group.ix.length/3;pieces.push({parent:group.parent,material:group.material,name:[...group.names].join(' '),positions:encode(new Float32Array(group.p)),normals:encode(new Float32Array(group.n)),uv:encode(new Float32Array(group.uv)),indices:encode(new Uint32Array(group.ix))});
  }
  const model={version:1,sex,units:'meters',generator:'scripts/plate-design.mjs',pieces};
  fs.writeFileSync(path.join(destination,sex+'.mjs'),'// Baked plate model. Rebuild with node scripts/build-plate-armor.mjs.\nexport default '+JSON.stringify(model)+';\n');
  console.log(JSON.stringify({sex,pieces:pieces.length,triangles,bytes:fs.statSync(path.join(destination,sex+'.mjs')).size}));
}
fs.writeFileSync(path.join(destination,'source-hashes.json'),JSON.stringify(Object.fromEntries(['scripts/plate-design.mjs','assets/models/human/male.mjs','assets/models/human/female.mjs'].map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')])),null,2)+'\n');
