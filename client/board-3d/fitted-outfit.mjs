import * as T from '../../vendor/three/three.module.mjs';
import {applyHumanOutfit} from './human-outfit.mjs?v=20261124-outfits-1';
import {sharePlateReflection} from './plate-materials.mjs?v=20261119-cuirass-1';

const decode=(s,Type)=>new Type(Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer);
const templates=new WeakMap(),prepared=new WeakMap(),references=new Map();
export async function prepareFittedOutfit(asset){
  if(prepared.has(asset))return prepared.get(asset);
  const pending=(async()=>{
    const maps=new Map();
    if(typeof document!=='undefined'){
      const normals=new Set(asset.materials.flatMap(m=>[m.normalMap,m.ormMap]));
      await Promise.all(Object.entries(asset.images).map(async([id,spec])=>{
        const response=await fetch(new URL(spec.file,import.meta.url));if(!response.ok)throw Error('Outfit texture HTTP '+response.status);
        const bitmap=await createImageBitmap(await response.blob(),{imageOrientation:'flipY',premultiplyAlpha:'none'}),texture=new T.Texture(bitmap);
        texture.colorSpace=normals.has(id)?T.NoColorSpace:T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.needsUpdate=true;maps.set(id,texture);references.set(texture,0);
      }));
    }
    assetMaps.set(asset,maps);return asset;
  })();prepared.set(asset,pending);
  try{return await pending;}catch(error){prepared.delete(asset);throw error;}
}
const assetMaps=new WeakMap();
function geometry(part){
  if(!templates.has(part)){
    const g=new T.BufferGeometry();for(const [name,key,Type,size]of [['position','positions',Float32Array,3],['normal','normals',Float32Array,3],['uv','uv',Float32Array,2],['skinIndex','skinIndices',Uint16Array,4],['skinWeight','skinWeights',Float32Array,4],['color','colors',Float32Array,3]])if(part[key])g.setAttribute(name,new T.BufferAttribute(decode(part[key],Type),size));
    g.setIndex(new T.BufferAttribute(decode(part.indices,Uint32Array),1));templates.set(part,g);
  }return templates.get(part);
}
function materials(asset,skin){
  const result=new Map([['skin',skin]]),maps=assetMaps.get(asset)||new Map();
  for(const spec of asset.materials){
    const m=new T.MeshStandardMaterial({name:spec.name,color:'#ffffff',metalness:spec.metalness??(spec.name.includes('Armor')||spec.name.includes('Plate')||spec.name.includes('Gauntlets')?.8:.05),roughness:spec.roughness??(spec.name.includes('Armor')||spec.name.includes('Plate')||spec.name.includes('Gauntlets')?.42:.72),map:maps.get(spec.colorMap)||null,normalMap:maps.get(spec.normalMap)||null,roughnessMap:maps.get(spec.ormMap)||null,metalnessMap:maps.get(spec.ormMap)||null,alphaTest:spec.alphaTest||0,side:T.DoubleSide});
    m.normalScale.set(.8,.8);m.userData.plateMaterial=m.metalness>.5?'steel':'leather';m.userData.fittedOutfit=true;m.userData.studioKey=spec.id;
    if(m.metalness>.5)sharePlateReflection(m);
    const textures=[...new Set([m.map,m.normalMap,m.roughnessMap,m.metalnessMap].filter(Boolean))];for(const t of textures){if(!references.get(t))t.needsUpdate=true;references.set(t,(references.get(t)||0)+1);}
    m.addEventListener('dispose',()=>{for(const t of textures){const n=references.get(t)-1;references.set(t,n);if(!n)t.dispose();}});result.set(spec.id,m);
  }return result;
}
export function dressFittedOutfit(root,asset,studio=null,editable=false){
  let body;root.traverse(o=>{if(o.name==='anatomical-body')body=o;});
  const host=body.parent,source=new T.Group(),mats=materials(asset,body.material),bones=asset.bones.map(name=>({name}));
  for(const part of asset.pieces){if(part.optional==='hood'&&!root.userData.avatar.outfitHood)continue;const mesh=new T.SkinnedMesh(geometry(part),mats.get(part.material));mesh.name=part.name;mesh.skeleton={bones};mesh.userData.d20OutfitPart=part.material!=='skin';mesh.userData.outfitId=part.id;source.add(mesh);}
  applyHumanOutfit(root,source,{preserveBody:!!asset.preserveBody});
  const changes=new Map();
  root.traverse(o=>{const id=o.userData.outfitId;if(!o.isSkinnedMesh||!id||o.name==='anatomical-body')return;
    if(!editable&&!Object.keys(studio?.parts||{}).length)return;
    const original=o.geometry.clone();original.computeBoundingBox();const pivot=original.boundingBox.getCenter(new T.Vector3());changes.set(id,{mesh:o,original,pivot});
    if(editable){const proxy=new T.Group();proxy.name=o.name;proxy.position.copy(pivot);proxy.userData={studioPart:id,basePosition:pivot.toArray(),outfitProxy:true};host.add(proxy);}
  });
  root.userData.applyStudioOutfitPart=(id,change)=>{
    const part=changes.get(id);if(!part)return;const {mesh,original,pivot}=part;
    const matrix=new T.Matrix4().compose(pivot.clone().add(new T.Vector3(...change.position)),new T.Quaternion().setFromEuler(new T.Euler(...change.rotation)),new T.Vector3(...change.scale)).multiply(new T.Matrix4().makeTranslation(-pivot.x,-pivot.y,-pivot.z));
    mesh.geometry.attributes.position.copy(original.attributes.position);mesh.geometry.attributes.normal.copy(original.attributes.normal);mesh.geometry.applyMatrix4(matrix);
  };
  for(const [id,change]of Object.entries(studio?.parts||{}))root.userData.applyStudioOutfitPart(id,change);
  const dispose=root.userData.dispose;root.userData.dispose=()=>{for(const p of changes.values())p.original.dispose();dispose?.();};
}
