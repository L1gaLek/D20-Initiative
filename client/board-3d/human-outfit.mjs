import * as T from '../../vendor/three/three.module.mjs';

// Local GLB garments must be authored in the D20 humanoid's bind space. Keep
// live game bones (including grip IK and studio poses), transferring only skin.
export function applyHumanOutfit(root,source,{preserveBody=false}={}){
  let original;
  root.traverse(o=>{if(o.isSkinnedMesh&&o.name==='anatomical-body')original=o;});
  if(!original)throw Error('D20 outfit: anatomical body is missing.');
  const skeleton=original.skeleton,canonical=T.PropertyBinding.sanitizeNodeName;
  const indices=new Map(skeleton.bones.map((b,i)=>[canonical(b.name),i]));
  if(indices.size!==skeleton.bones.length)throw Error('D20 outfit: ambiguous bone names.');
  const prepared=[];
  try{
    (source.scene||source).traverse(o=>{
      if(!o.isSkinnedMesh||!(o.name==='anatomical-body'||o.userData.d20OutfitPart))return;
      const geometry=o.geometry.clone(),a=geometry.attributes;
      prepared.push({geometry,source:o});
      if(!a.skinIndex||!a.skinWeight||a.skinIndex.itemSize!==4||a.skinWeight.itemSize!==4)throw Error('D20 outfit: four skin influences are required.');
      geometry.applyMatrix4(o.bindMatrix);
      const map=o.skeleton.bones.map(b=>indices.get(canonical(b.name)));
      for(let i=0;i<a.skinIndex.count;i++){
        let sum=0;
        for(let k=0;k<4;k++){
          const n=i*4+k,w=a.skinWeight.array[n],joint=a.skinIndex.array[n];
          if(!Number.isFinite(w)||w<0||w>1||(w>0&&map[joint]===undefined))throw Error('D20 outfit: incompatible skin weights.');
          a.skinIndex.array[n]=map[joint]??0;sum+=w;
        }
        if(Math.abs(sum-1)>1e-4)throw Error('D20 outfit: skin weights must sum to one.');
      }
      for(const value of a.position.array)if(!Number.isFinite(value))throw Error('D20 outfit: invalid geometry.');
    });
    if(preserveBody?!prepared.length:(!prepared.some(p=>p.source.name==='anatomical-body')||prepared.length<2))throw Error('D20 outfit: fitted body and garment are required.');
  }catch(error){for(const p of prepared)p.geometry.dispose();throw error;}
  const body=original.parent;
  if(!preserveBody){original.removeFromParent();original.geometry.dispose();}
  for(const {geometry,source:o}of prepared){
    const mesh=new T.SkinnedMesh(geometry,o.material);mesh.name=o.name;
    mesh.userData={...o.userData};mesh.frustumCulled=false;
    mesh.castShadow=mesh.receiveShadow=true;body.add(mesh);
    // Passing an explicit bind matrix preserves the native skeleton inverses.
    mesh.bind(skeleton,new T.Matrix4());
  }
  root.userData.outfit={parts:prepared.length,bones:skeleton.bones.length};
  return root.userData.outfit;
}
