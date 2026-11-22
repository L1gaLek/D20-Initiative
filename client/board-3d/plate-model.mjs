import * as T from '../../vendor/three/three.module.mjs';
import {getArmorAsset} from './armor-assets.mjs?v=20261122-egress-1';
import {createPlateMaterials} from './plate-materials.mjs?v=20261119-cuirass-1';

const decode=(s,Type)=>new Type(Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer),templates=new Map();
function geometry(part,copy=true){
  if(!templates.has(part)){
    const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(decode(part.positions,Float32Array),3));g.setAttribute('normal',new T.BufferAttribute(decode(part.normals,Float32Array),3));g.setAttribute('uv',new T.BufferAttribute(decode(part.uv,Float32Array),2));g.setIndex(new T.BufferAttribute(decode(part.indices,Uint32Array),1));templates.set(part,g);
  }
  return copy?templates.get(part).clone():templates.get(part);
}
const layouts=new Map();
function layout(asset){
  if(layouts.has(asset))return layouts.get(asset);const result=new Map();
  for(const part of asset.pieces){const g=geometry(part,false),a=g.attributes.position;for(const s of part.segments||[]){let item=result.get(s.id);if(!item){item={id:s.id,name:s.name,parent:part.parent,box:new T.Box3(),segments:[]};result.set(s.id,item);}for(let i=s.start;i<s.start+s.count;i++)item.box.expandByPoint(new T.Vector3().fromBufferAttribute(a,i));item.segments.push({part,segment:s});}}
  for(const item of result.values())item.pivot=item.box.getCenter(new T.Vector3());layouts.set(asset,result);return result;
}
function transformed(g,segment,pivot,change){
  if(!change)return;const matrix=new T.Matrix4().compose(pivot.clone().add(new T.Vector3(...change.position)),new T.Quaternion().setFromEuler(new T.Euler(...change.rotation)),new T.Vector3(...change.scale)).multiply(new T.Matrix4().makeTranslation(-pivot.x,-pivot.y,-pivot.z)),normalMatrix=new T.Matrix3().getNormalMatrix(matrix),p=new T.Vector3(),n=new T.Vector3();
  for(let i=segment.start;i<segment.start+segment.count;i++){p.fromBufferAttribute(g.attributes.position,i).applyMatrix4(matrix);n.fromBufferAttribute(g.attributes.normal,i).applyNormalMatrix(normalMatrix);g.attributes.position.setXYZ(i,p.x,p.y,p.z);g.attributes.normal.setXYZ(i,n.x,n.y,n.z);}
}
export function dressMasterPlate({materials,female,surface,attach,byName,definitions,config={},asset:prepared=null,editable=false,studio=null}){
  const pbr=createPlateMaterials();
  const kind=config.armor||'plate';
  // Keep the grain normal with a neutral brown albedo; the scanned red hide
  // otherwise makes every leather construction look burgundy.
  pbr.leather.map=null;pbr.leather.color.set('#806047');pbr.leather.userData.plainAlbedo=true;
  if(kind==='hide'){pbr.leather.color.set('#c1a17b');pbr.gambeson.color.set('#b8a58b');pbr.linen.color.set('#cbb790');}
  if(kind==='studded-leather')pbr.leather.color.set('#665344');
  if(kind==='ring-mail'||kind==='splint')pbr.leather.color.set('#9a7758');
  if(kind==='chain-mail'||kind==='chain-shirt'){pbr.steel.color.set('#a4b3bc');pbr.gambeson.color.set('#3b4147');}
  if(kind==='scale-mail'){pbr.steel.color.set('#a4b5ac');pbr.brass.color.set('#968264');}
  // The shared weapon fittings use the same steel, leather and trim as the suit.
  for(const [name,key]of [['steel','steel'],['edge','edge'],['leather','leather'],['linen','linen'],['dark','dark'],['trim','brass']]){materials[name].dispose();materials[name]=pbr[key];}
  const cloth=(material,predicate,offset,clips=[])=>{const mesh=surface(material,predicate,offset,null,clips);if(mesh)mesh.name='master-plate-'+material.userData.plateMaterial+'-underlayer';};
  const torso=(p,b)=>!/(arm|wrist|finger|head|neck)/.test(b)&&Math.abs(p[0])<.195;
  cloth(pbr.gambeson,(p,b)=>p[1]>1.01&&p[1]<1.43&&(torso(p,b)||!female&&/^(upperarm|lowerarm)/.test(b)),.006,[p=>p[1]-(female?1.08:1.014),p=>(female?1.288+.020*Math.min(1,Math.abs(p[0])/.16):1.426)-p[1]]);
  cloth(female?pbr.leather:pbr.gambeson,(p,b)=>p[1]<1.04&&!/(arm|wrist|finger)/.test(b),.004,[p=>p[1]-(female?.866+.06*Math.min(1,Math.abs(p[0])/.14):.14),p=>1.04-p[1]]);
  cloth(pbr.leather,(p,b)=>/^(wrist|finger|metacarpal)/.test(b),.0011);
  const asset=prepared||getArmorAsset({model:female?'human-female':'human-male',armor:'plate'}),items=layout(asset);
  if(editable){
    for(const item of items.values()){
      const group=new T.Group(),head=new T.Vector3(...definitions.get(item.parent).head);group.name=item.name;group.userData.studioPart=item.id;group.userData.basePosition=item.pivot.clone().sub(head).toArray();group.position.fromArray(group.userData.basePosition);byName.get(item.parent).add(group);
      for(const {part,segment:s}of item.segments){const whole=geometry(part,false),g=new T.BufferGeometry();for(const key of ['position','normal','uv']){const a=whole.attributes[key];g.setAttribute(key,new T.BufferAttribute(a.array.slice(s.start*a.itemSize,(s.start+s.count)*a.itemSize),a.itemSize));}g.setIndex(Array.from(whole.index.array.slice(s.indexStart,s.indexStart+s.indexCount),i=>i-s.start));g.translate(-item.pivot.x,-item.pivot.y,-item.pivot.z);const mesh=new T.Mesh(g,pbr[part.material]);mesh.name=part.name;mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);}
      // Keep editable plates separate, while batching their rivets and edging.
      const byMaterial=new Map();for(const mesh of [...group.children]){if(!byMaterial.has(mesh.material))byMaterial.set(mesh.material,[]);byMaterial.get(mesh.material).push(mesh);}
      for(const [material,meshes]of byMaterial){if(meshes.length<2)continue;const p=[],n=[],uv=[],ix=[];for(const mesh of meshes){const g=mesh.geometry,start=p.length/3;p.push(...g.attributes.position.array);n.push(...g.attributes.normal.array);uv.push(...g.attributes.uv.array);for(const i of g.index.array)ix.push(i+start);mesh.removeFromParent();g.dispose();}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('normal',new T.Float32BufferAttribute(n,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(ix);const mesh=new T.Mesh(g,material);mesh.name=item.name;mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);}
      const change=studio?.parts?.[item.id];if(change){group.position.add(new T.Vector3(...change.position));group.rotation.set(...change.rotation);group.scale.fromArray(change.scale);}
    }
  }else for(const part of asset.pieces){const g=geometry(part);for(const s of part.segments||[])transformed(g,s,items.get(s.id).pivot,studio?.parts?.[s.id]);const mesh=attach(part.parent,g,pbr[part.material]);mesh.name=part.name;mesh.castShadow=mesh.receiveShadow=true;}
}
