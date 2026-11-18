import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import male from '../assets/models/human/male.mjs';
import female from '../assets/models/human/female.mjs';
import {designArmor,ARMOR_KINDS} from './armor-patterns.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=Object.fromEntries(process.argv.slice(2).map(s=>{const n=s.indexOf('=');return [s.slice(0,n),s.slice(n+1)];}));
const blender=args['--blender']||process.env.D20_BLENDER_EXEC;
if(!blender||!fs.existsSync(blender))throw Error('Provide --blender=/path/to/blender.exe');
const work=path.resolve(args['--work']||path.join(root,'..','..','work','armor-build'));
const sources=path.resolve(args['--sources']||path.join(root,'..','D20 Armor Sources'));
const destination=path.join(root,'assets/models/armor');
for(const dir of [work,sources,destination])fs.mkdirSync(dir,{recursive:true});
const encode=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength).toString('base64');
const decode=(s,Type)=>{const b=Buffer.from(s,'base64');return new Type(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const reports=[];
for(const [sex,body]of [['male',male],['female',female]])for(const kind of (args['--kinds']?.split(',')||ARMOR_KINDS)){
  if(args['--sex']&&args['--sex']!==sex)continue;
  const key=sex+'-'+kind,raw=path.join(work,key+'.raw.json'),finished=path.join(work,key+'.finished.json');
  const parts=designArmor(body,sex==='female',kind).map(part=>{
    const g=part.geometry;if(!g.attributes.uv){const p=g.attributes.position,uv=[];for(let i=0;i<p.count;i++)uv.push(p.getX(i)*7,p.getY(i)*7);g.setAttribute('uv',new (p.constructor)(new Float32Array(uv),2));}
    const out={id:part.id,name:part.name,parent:part.parent,material:part.material,positions:encode(g.attributes.position.array),normals:encode(g.attributes.normal.array),uv:encode(g.attributes.uv.array),indices:encode(new Uint32Array(g.index?g.index.array:Array.from({length:g.attributes.position.count},(_,i)=>i)))};g.dispose();return out;
  });
  fs.writeFileSync(raw,JSON.stringify({sex,kind,body,parts}));
  const source=path.join(sources,key+'.blend');
  const child=spawnSync(blender,['--background','--factory-startup','--disable-autoexec','--python-exit-code','1','--python',path.join(root,'scripts/finish-armor.py'),'--',raw,finished,source],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
  fs.writeFileSync(path.join(work,key+'.log'),(child.stdout||'')+(child.stderr||''));
  if(child.status!==0)throw Error('Blender '+key+': '+(child.stderr||child.stdout).slice(-1600));
  const output=JSON.parse(fs.readFileSync(finished)),groups=new Map();
  for(const part of output.parts){
    const key=part.parent+'|'+part.material;if(!groups.has(key))groups.set(key,{parent:part.parent,material:part.material,names:new Set(),p:[],n:[],uv:[],ix:[],segments:[]});
    const group=groups.get(key),p=decode(part.positions,Float32Array),n=decode(part.normals,Float32Array),uv=decode(part.uv,Float32Array),ix=decode(part.indices,Uint32Array),start=group.p.length/3;
    group.names.add(part.name);for(const v of p)group.p.push(v);for(const v of n)group.n.push(v);for(const v of uv)group.uv.push(v);for(const i of ix)group.ix.push(i+start);
    group.segments.push({id:part.id,name:part.name,start,count:p.length/3,indexStart:group.ix.length-ix.length,indexCount:ix.length});
  }
  const pieces=[...groups.values()].map(g=>({parent:g.parent,material:g.material,name:[...g.names].join(' '),segments:g.segments,positions:encode(new Float32Array(g.p)),normals:encode(new Float32Array(g.n)),uv:encode(new Float32Array(g.uv)),indices:encode(new Uint32Array(g.ix))}));
  const model={version:3,style:'forged-volume',sex,kind,units:'meters',generator:'Blender / scripts/finish-armor.py',pieces},text='// Blender-finished fitted armor. Rebuild with scripts/build-armor-library.mjs.\nexport default '+JSON.stringify(model)+';\n';
  fs.writeFileSync(path.join(destination,key+'.mjs'),text);
  if(kind==='plate')fs.writeFileSync(path.join(root,'assets/models/plate',sex+'.mjs'),text);
  const report={sex,kind,parts:output.parts.length,triangles:[...groups.values()].reduce((n,g)=>n+g.ix.length/3,0),bytes:Buffer.byteLength(text),blender:output.blender,beveled:output.beveled,source};reports.push(report);console.log(JSON.stringify(report));
}
const inputs=['scripts/armor-patterns.mjs','scripts/armor-fit.mjs','scripts/plate-design.mjs','scripts/plate-reference-parts.mjs','scripts/build-armor-library.mjs','scripts/finish-armor.py','assets/models/human/male.mjs','assets/models/human/female.mjs'];
const hashes=Object.fromEntries(inputs.map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
fs.writeFileSync(path.join(destination,'source-hashes.json'),JSON.stringify(hashes,null,2)+'\n');
if(reports.some(r=>r.kind==='plate'))fs.writeFileSync(path.join(root,'assets/models/plate/source-hashes.json'),JSON.stringify(hashes,null,2)+'\n');
fs.writeFileSync(path.join(work,'report.json'),JSON.stringify(reports,null,2));
