import * as T from '../../vendor/three/three.module.mjs';
import male from '../../assets/models/plate/male.mjs?v=20261117-reference-plate-1';
import femaleModel from '../../assets/models/plate/female.mjs?v=20261117-reference-plate-1';
import {createPlateMaterials} from './plate-materials.mjs?v=20261117-reference-plate-1';

const decode=(s,Type)=>new Type(Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer),templates=new Map();
function geometry(part){
  if(!templates.has(part)){
    const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(decode(part.positions,Float32Array),3));g.setAttribute('normal',new T.BufferAttribute(decode(part.normals,Float32Array),3));g.setAttribute('uv',new T.BufferAttribute(decode(part.uv,Float32Array),2));g.setIndex(new T.BufferAttribute(decode(part.indices,Uint32Array),1));templates.set(part,g);
  }
  return templates.get(part).clone();
}
export function dressMasterPlate({materials,female,surface,attach}){
  const pbr=createPlateMaterials();
  // The shared weapon fittings use the same steel, leather and trim as the suit.
  for(const [name,key]of [['steel','steel'],['edge','edge'],['leather','leather'],['linen','linen'],['dark','dark'],['trim','brass']]){materials[name].dispose();materials[name]=pbr[key];}
  const cloth=(material,predicate,offset,clips=[])=>{const mesh=surface(material,predicate,offset,null,clips);if(mesh)mesh.name='master-plate-'+material.userData.plateMaterial+'-underlayer';};
  const torso=(p,b)=>!/(arm|wrist|finger|head|neck)/.test(b)&&Math.abs(p[0])<.195;
  cloth(pbr.gambeson,(p,b)=>p[1]>1.01&&p[1]<1.43&&(torso(p,b)||!female&&/^(upperarm|lowerarm)/.test(b)),.006,[p=>p[1]-(female?1.08:1.014),p=>(female?1.288+.020*Math.min(1,Math.abs(p[0])/.16):1.426)-p[1]]);
  cloth(female?pbr.leather:pbr.gambeson,(p,b)=>p[1]<1.04&&!/(arm|wrist|finger)/.test(b),.004,[p=>p[1]-(female?.866+.06*Math.min(1,Math.abs(p[0])/.14):.14),p=>1.04-p[1]]);
  cloth(pbr.leather,(p,b)=>/^(wrist|finger|metacarpal)/.test(b),.0011);
  const asset=female?femaleModel:male;
  for(const part of asset.pieces){const mesh=attach(part.parent,geometry(part),pbr[part.material]);mesh.name=part.name;mesh.castShadow=mesh.receiveShadow=true;}
}
