const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sharp=require(process.env.D20_SHARP_MODULE||'sharp');
const source=path.resolve(process.argv[2]),output=path.resolve(__dirname,'../assets/materials/plate');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const manifest={license:'CC0-1.0',licenseUrl:'https://docs.ambientcg.com/license/',materials:{}};
 for(const [name,id,metal]of [['steel','Metal032',true],['leather','Leather037',false],['fabric','Fabric030',false]]){
  const file=kind=>path.join(source,id,id+'_1K-JPG_'+kind+'.jpg'),prefix=path.join(output,name);
  await sharp(file('Color')).resize(512,512).jpeg({quality:89,chromaSubsampling:'4:4:4'}).toFile(prefix+'-color.jpg');
  await sharp(file('NormalGL')).resize(512,512).jpeg({quality:94,chromaSubsampling:'4:4:4'}).toFile(prefix+'-normal.jpg');
  const rough=await sharp(file('Roughness')).resize(512,512).extractChannel(0).raw().toBuffer(),packed=Buffer.alloc(512*512*3);
  for(let i=0;i<rough.length;i++){packed[i*3]=255;packed[i*3+1]=rough[i];packed[i*3+2]=metal?255:0;}
  await sharp(packed,{raw:{width:512,height:512,channels:3}}).png().toFile(prefix+'-mr.png');
  manifest.materials[name]={source:id,url:'https://ambientcg.com/view?id='+id,resolution:512,color:name+'-color.jpg',normal:name+'-normal.jpg',metalRoughness:name+'-mr.png',sourceHashes:Object.fromEntries(['Color','NormalGL','Roughness'].map(k=>[k,crypto.createHash('sha256').update(fs.readFileSync(file(k))).digest('hex')]))};
 }
 fs.writeFileSync(path.join(output,'sources.json'),JSON.stringify(manifest,null,2)+'\n');console.log('Prepared local 512px PBR maps and recorded source hashes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
