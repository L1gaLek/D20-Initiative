import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import male from '../assets/models/human/male.mjs';
import female from '../assets/models/human/female.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=Object.fromEntries(process.argv.slice(2).map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)];}));
const require=createRequire(import.meta.url),sharp=require(args['--sharp']||'sharp');
const source=path.resolve(args['--source']||''),blender=args['--blender'],work=path.resolve(args['--work']||path.join(root,'../../work/quaternius-build')),sources=path.resolve(args['--sources']||path.join(root,'../D20 Quaternius Standard'));
if(!blender||!fs.existsSync(path.join(source,'License_Standard.txt')))throw Error('Provide --source=extracted Standard folder and --blender=Blender executable.');
const models=path.join(root,'assets/models/quaternius'),textures=path.join(root,'assets/materials/quaternius');for(const dir of [work,sources,models,textures])fs.mkdirSync(dir,{recursive:true});
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex'),inputs={};
for(const kind of ['Ranger','Peasant'])for(const [suffix,key,quality]of [['BaseColor','color',92],['Normal','normal',95],['ORM','orm',95]]){
 const file=path.join(source,'Textures',kind,'T_'+kind+'_'+suffix+'.png');inputs[path.relative(source,file).replace(/\\/g,'/')]=hash(file);
 await sharp(file).resize(1024,1024).removeAlpha().jpeg({quality,chromaSubsampling:'4:4:4'}).toFile(path.join(textures,kind.toLowerCase()+'-'+key+'.jpg'));
}
for(const [sex,body]of [['male',male],['female',female]])for(const kind of ['peasant','ranger']){
 const native=path.join(work,'native-'+sex+'.json'),raw=path.join(work,sex+'-'+kind+'.json');fs.writeFileSync(native,JSON.stringify(body));
 const result=spawnSync(blender,['--background','--factory-startup','--disable-autoexec','--python-exit-code','1','--python',path.join(root,'scripts/fit-quaternius.py'),'--','--source',source,'--native',native,'--sex',sex,'--kind',kind,'--output',raw,'--blend',path.join(sources,sex+'-'+kind+'.blend')],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});
 fs.writeFileSync(path.join(work,sex+'-'+kind+'.log'),(result.stdout||'')+(result.stderr||''));if(result.status!==0)throw Error('Fit failed: '+sex+'-'+kind+' '+(result.stderr||result.stdout).slice(-900));
 const asset=JSON.parse(fs.readFileSync(raw));asset.images=Object.fromEntries(['color','normal','orm'].map(key=>[kind+'-'+key,{file:'../../assets/materials/quaternius/'+kind+'-'+key+'.jpg'}]));
 fs.writeFileSync(path.join(models,sex+'-'+kind+'.mjs'),'// Quaternius Standard / CC0-1.0, fitted to the native D20 skeleton.\nexport default '+JSON.stringify(asset)+';\n');console.log('Built',sex,kind,asset.pieces.length,'pieces');
 const gltf=path.join(source,'Exports/glTF (Godot-Unreal)/Outfits',sex[0].toUpperCase()+sex.slice(1)+'_'+kind[0].toUpperCase()+kind.slice(1)+'.gltf');inputs[path.relative(source,gltf).replace(/\\/g,'/')]=hash(gltf);inputs[path.relative(source,gltf).replace(/\\/g,'/').replace(/\.gltf$/,'.bin')]=hash(gltf.replace(/\.gltf$/,'.bin'));
}
fs.writeFileSync(path.join(models,'LICENSE.txt'),fs.readFileSync(path.join(source,'License_Standard.txt'),'utf8').replace(/[ \t]+$/gm,''));
fs.writeFileSync(path.join(models,'source.json'),JSON.stringify({source:'https://quaternius.itch.io/modular-character-outfits-fantasy',edition:'Standard 2.1',license:'CC0-1.0',included:['Male_Ranger','Female_Ranger','Male_Peasant','Female_Peasant'],fit:'Native D20 163-joint skeleton; native head/body/grip preserved; source UVs and PBR maps.',inputs},null,2)+'\n');
