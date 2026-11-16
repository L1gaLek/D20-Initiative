import * as T from '../../vendor/three/three.module.mjs';

// Maps are bundled locally. Node geometry tests need no DOM or network access.
const shared=new Map(),browser=typeof document!=='undefined'&&typeof createImageBitmap==='function';
async function texture(name,color=false){
  if(!browser)return null;
  try{
    const response=await fetch(new URL('../../assets/materials/plate/'+name,import.meta.url),{signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('HTTP '+response.status);
    const bitmap=await createImageBitmap(await response.blob(),{imageOrientation:'flipY',premultiplyAlpha:'none'}),t=new T.Texture(bitmap);
    t.wrapS=t.wrapT=T.RepeatWrapping;t.colorSpace=color?T.SRGBColorSpace:T.NoColorSpace;t.needsUpdate=true;t.userData.managedPlate=true;shared.set(t,0);return t;
  }catch(error){console.warn('Plate material fallback:',name,error.message);return null;}
}
const maps={};await Promise.all(['steel','leather','fabric'].map(async name=>{
  const [color,normal,mr]=await Promise.all([texture(name+'-color.jpg',true),texture(name+'-normal.jpg'),texture(name+'-mr.png')]);maps[name]={map:color,normalMap:normal,roughnessMap:mr,metalnessMap:mr};
}));
function studio(){
  const w=256,h=128,p=new Float32Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const u=x/w,v=y/h,window=(c,width)=>Math.exp(-(((u-c)/width)**8))*Math.exp(-(((v-.46)/.28)**8)),key=window(.23,.075)*3.4,fill=window(.70,.16)*.9,rim=window(.96,.025)*2.0;
    const sky=.32+.32*Math.max(0,1-v*1.6);const i=(y*w+x)*4;p[i]=sky+key+fill*.90+rim*.80;p[i+1]=sky*.97+key*.92+fill*.94+rim*.88;p[i+2]=sky*.93+key*.83+fill+rim;p[i+3]=1;
  }
  const t=new T.DataTexture(p,w,h,T.RGBAFormat,T.FloatType);t.mapping=T.EquirectangularReflectionMapping;t.colorSpace=T.LinearSRGBColorSpace;t.needsUpdate=true;t.userData.managedPlate=true;shared.set(t,0);return t;
}
const reflection=studio();
function own(material,textures){
  const used=[...new Set(textures.filter(Boolean))];for(const t of used){const count=shared.get(t);shared.set(t,count+1);if(!count)t.needsUpdate=true;}
  material.addEventListener('dispose',()=>{for(const t of used){const left=shared.get(t)-1;shared.set(t,left);if(!left)t.dispose();}});return material;
}
export function createPlateMaterials(){
  const make=(name,color,metalness,roughness,source,normal=.4)=>{
    const m=new T.MeshStandardMaterial({color,metalness,roughness,...maps[source]});m.normalScale.set(normal,normal);
    if(metalness>.5){m.envMap=reflection;m.envMapIntensity=.75;}
    m.userData.plateMaterial=name;m.userData.materialSource=source;return own(m,[...Object.values(maps[source]),m.envMap]);
  };
  const materials={steel:make('steel','#e5e2d9',.90,1,'steel',.18),edge:make('edge','#f1ead6',.93,.72,'steel',.12),brass:make('brass','#ad8950',.85,.90,'steel',.12),leather:make('leather','#bba38e',0,.95,'leather',.55),gambeson:make('gambeson','#50393a',0,1,'fabric',.35),linen:make('linen','#c9b999',0,1,'fabric',.25),dark:make('dark','#292523',0,1,'leather',.3)};
  materials.leather.side=T.DoubleSide;
  materials.leather.roughnessMap=null;materials.leather.roughness=.86;materials.leather.userData.plainRoughness=true;
  // Ivory cloth keeps the weave normal, with a matte, untinted albedo.
  materials.linen.map=null;materials.linen.roughnessMap=null;materials.linen.roughness=.96;materials.linen.color.set('#dfd3b9');materials.linen.userData.plainAlbedo=true;materials.linen.userData.plainRoughness=true;
  const g=materials.gambeson;g.customProgramCacheKey=()=> 'quilted-gambeson-v1';
  g.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec2 quiltUV;\n'+shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nquiltUV=uv;');
    shader.fragmentShader='varying vec2 quiltUV;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec2 q=vec2(quiltUV.x+quiltUV.y,quiltUV.x-quiltUV.y)*4.;
      float quiltSeam=1.-smoothstep(.018,.065,min(abs(fract(q.x)-.5),abs(fract(q.y)-.5)));
      diffuseColor.rgb*=1.-quiltSeam*.22;
    `);
  };
  return materials;
}
