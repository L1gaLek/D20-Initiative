import * as THREE from '../../vendor/three/three.module.mjs';
import {polyhedron,faceLabels,seedNumber,random,PALETTE} from './model.mjs?v=20261122-critical-1';

const vec=v=>new THREE.Vector3(...v);
function polygonGeometry(polygons) {
  const positions=[],normals=[],uvs=[];
  for(const points of polygons){
    const normal=new THREE.Vector3().crossVectors(points[1].clone().sub(points[0]),points[2].clone().sub(points[0])).normalize();
    const center=points.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).divideScalar(points.length);
    if(normal.dot(center)<0){points.reverse();normal.negate();}
    const u=points[1].clone().sub(points[0]).normalize(),v=normal.clone().cross(u),extent=Math.max(...points.map(p=>Math.max(Math.abs(p.clone().sub(center).dot(u)),Math.abs(p.clone().sub(center).dot(v)))))*2||1;
    for(let i=1;i<points.length-1;i++)for(const p of [points[0],points[i],points[i+1]]){positions.push(...p);normals.push(...normal);const d=p.clone().sub(center);uvs.push(.5+d.dot(u)/extent,.5+d.dot(v)/extent);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));return geometry;
}
function beveledGeometry(shape,radius) {
  const inset=shape.faces.map(f=>f.indices.map(index=>vec(shape.vertices[index]).lerp(vec(f.center),.1).multiplyScalar(radius)));
  const faceGeometry=polygonGeometry(inset.map(face=>face.map(p=>p.clone()))),edges=new Map(),corners=shape.vertices.map(()=>[]),polygons=[];
  shape.faces.forEach((face,fi)=>face.indices.forEach((index,j)=>{
    corners[index].push(inset[fi][j]);
    const next=face.indices[(j+1)%face.indices.length],key=[index,next].sort((a,b)=>a-b).join(',');
    const item={a:index,b:next,p:inset[fi][j],q:inset[fi][(j+1)%face.indices.length]};
    if(edges.has(key)){const other=edges.get(key);polygons.push([item.p.clone(),item.q.clone(),(other.a===next?other.p:other.q).clone(),(other.a===index?other.p:other.q).clone()]);}
    else edges.set(key,item);
  }));
  corners.forEach((points,index)=>{
    const n=vec(shape.vertices[index]).normalize(),center=points.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).divideScalar(points.length),u=points[0].clone().sub(center).normalize(),v=n.clone().cross(u);
    points.sort((a,b)=>Math.atan2(a.clone().sub(center).dot(v),a.clone().sub(center).dot(u))-Math.atan2(b.clone().sub(center).dot(v),b.clone().sub(center).dot(u)));
    polygons.push(points.map(p=>p.clone()));
  });
  return [faceGeometry,polygonGeometry(polygons)];
}
function atlas(skin,critical) {
  const canvas=document.createElement('canvas');canvas.width=704;canvas.height=640;
  const ctx=canvas.getContext('2d');ctx.scale(2/3,2/3);
  for(let i=0;i<=100;i++){
    ctx.save();ctx.translate((i%11)*96,Math.floor(i/11)*96);window.DiceAppearance.face(ctx,skin,i===100?'00':String(i),critical);ctx.restore();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}
function numberGeometry(shape,labels,radius,finalQuaternion,upFace) {
  const positions=[],uvs=[],up=new THREE.Vector3(1,0,0).applyQuaternion(finalQuaternion.clone().invert());
  const quad=(text,center,u,v,size)=>{
    const cell=text==='00'?100:Number(text),col=cell%11,row=Math.floor(cell/11);
    const points=[[-1,-1],[1,-1],[1,1],[-1,1]],order=[0,1,2,0,2,3];
    for(const i of order){const [x,y]=points[i];positions.push(...center.clone().addScaledVector(u,x*size/2).addScaledVector(v,y*size/2));uvs.push((col+(x+1)/2)/11,1-(row+(1-y)/2)/10);}
  };
  shape.faces.forEach((face,fi)=>{
    if(labels[fi]===null)return;
    const normal=vec(face.normal),center=vec(face.center).multiplyScalar(radius).addScaledVector(normal,.003);
    const points=face.indices.map(i=>vec(shape.vertices[i]).multiplyScalar(radius));
    let apothem=Infinity;
    for(let j=0;j<points.length;j++){
      const edge=points[(j+1)%points.length].clone().sub(points[j]).normalize();
      apothem=Math.min(apothem,new THREE.Vector3().crossVectors(center.clone().sub(points[j]),edge).length());
    }
    if(shape.sides===4){
      face.indices.forEach((index,j)=>{
        const opposite=shape.faces.findIndex(f=>!f.indices.includes(index)),position=center.clone().lerp(points[j],.48).addScaledVector(normal,.001);
        const v=points[j].clone().sub(center).normalize(),u=v.clone().cross(normal).normalize();
        quad(labels[opposite],position,u,v,apothem*1.03);
      });
    }else{
      const u=fi===upFace?up.clone().addScaledVector(normal,-up.dot(normal)).normalize():points[1].clone().sub(points[0]).normalize();
      const v=normal.clone().cross(u).normalize();quad(labels[fi],center,u,v,apothem*1.85);
    }
  });
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));return geometry;
}
function feltTexture(){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d'),rand=random(412);
  ctx.fillStyle='#173c37';ctx.fillRect(0,0,256,256);
  for(let i=0;i<9000;i++){ctx.fillStyle=rand()>.5?'rgba(205,225,205,.045)':'rgba(0,0,0,.07)';ctx.fillRect(rand()*256,rand()*256,1,1);}
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(4,3);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
export function createDiceScene(host) {
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.4;
  renderer.domElement.className='dice-table__canvas';renderer.domElement.setAttribute('aria-hidden','true');host.prepend(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(),diceGroup=new THREE.Group(),tray=new THREE.Group(),effects=new THREE.Group();scene.add(tray,diceGroup,effects);
  scene.add(new THREE.HemisphereLight(0xfff4d8,0x244c45,2.7));
  const key=new THREE.DirectionalLight(0xffe3b0,3.6);key.position.set(-3,9,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-9;key.shadow.camera.right=9;key.shadow.camera.top=9;key.shadow.camera.bottom=-9;key.shadow.normalBias=.025;key.shadow.bias=-.0003;scene.add(key);
  const fill=new THREE.DirectionalLight(0x9dcfff,1.1);fill.position.set(3,4,-4);scene.add(fill);
  const felt=feltTexture(),skinCache=new Map();
  function disposeSkin(entry){entry.face.dispose();entry.edge.dispose();entry.map.dispose();for(const label of entry.labels.values()){label.map.dispose();label.dispose();}}
  function skinMaterials(id,critical){
    const skin=window.D20Appearance.style(id);let entry=skinCache.get(skin.id);
    if(!entry){const canvas=document.createElement('canvas');canvas.width=canvas.height=256;window.DiceAppearance.surface(canvas.getContext('2d'),skin);const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
      entry={map,face:new THREE.MeshPhysicalMaterial({map,bumpMap:skin.crystal?null:map,bumpScale:.016,color:'#ffffff',roughness:skin.rough,metalness:skin.metal,clearcoat:1,clearcoatRoughness:.16,iridescence:skin.crystal?.7:0,transparent:!!skin.crystal,opacity:skin.crystal?.82:1}),edge:new THREE.MeshStandardMaterial({color:skin.edge,metalness:.75,roughness:.26}),labels:new Map()};skinCache.set(skin.id,entry);}
    if(!entry.labels.has(critical)){const map=atlas(skin,critical);entry.labels.set(critical,new THREE.MeshBasicMaterial({map,transparent:true,alphaTest:.1,depthWrite:false}));}
    skinCache.delete(skin.id);skinCache.set(skin.id,entry);
    return {...entry,label:entry.labels.get(critical),skin};
  }
  const floorMaterial=new THREE.MeshStandardMaterial({map:felt,roughness:1}),wood=new THREE.MeshStandardMaterial({color:'#302019',roughness:.7}),trim=new THREE.MeshStandardMaterial({color:'#b38b51',metalness:.7,roughness:.35});
  const geometryCache=new Map();let raf=0,resolveAnimation=null,plan=null,groups=[],disposed=false,framesRendered=0,lastFrame=0;
  const removeChildren=(group,geometriesOnly=false)=>{
    for(const child of [...group.children]){group.remove(child);child.traverse(o=>{if(o.geometry&&(!geometriesOnly||o.userData.ownsGeometry))o.geometry.dispose();if(o.userData.ownsMaterial)o.material.dispose();});}
  };
  function resize(){
    if(disposed)return;const {width,height}=host.getBoundingClientRect();if(width<1||height<1)return;
    renderer.setSize(width,height,false);
    const w=(plan?.width||6.6)+.9,d=(plan?.depth||4.6)+1,aspect=width/height;
    const half=Math.max(d*.48+.6,w/2/aspect);camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.near=.1;camera.far=60;
    camera.position.set(0,14,6);camera.lookAt(0,0,0);camera.updateProjectionMatrix();render();
  }
  function render(){if(disposed)return;renderer.render(scene,camera);framesRendered++;}
  function buildTray(width,depth){
    removeChildren(tray);
    const add=(w,h,d,x,y,z,material)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);mesh.receiveShadow=true;tray.add(mesh);return mesh;};
    add(width+.4,.22,depth+.4,0,-.17,0,wood);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(width,depth),floorMaterial);floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;floor.position.y=-.004;tray.add(floor);
    for(const sign of [-1,1]){
      add(.14,.22,depth+.3,sign*(width/2+.08),.04,0,wood);add(width+.3,.22,.14,0,.04,sign*(depth/2+.08),wood);
      add(.026,.018,depth,sign*(width/2-.02),.006,0,trim);add(width,.018,.026,0,.006,sign*(depth/2-.02),trim);
    }
  }
  function paint(frame){
    if(!plan)return;lastFrame=frame;
    const a=Math.min(plan.frameCount-1,Math.floor(frame)),b=Math.min(plan.frameCount-1,a+1),t=frame-a;
    groups.forEach((group,i)=>{
      const ai=(a*groups.length+i)*7,bi=(b*groups.length+i)*7;
      group.position.set(...[0,1,2].map(j=>THREE.MathUtils.lerp(plan.frames[ai+j],plan.frames[bi+j],t)));
      group.quaternion.fromArray(plan.frames,ai+3).slerp(new THREE.Quaternion().fromArray(plan.frames,bi+3),t);
    });render();
  }
  let effectRaf=0;
  function clearEffects(){cancelAnimationFrame(effectRaf);effectRaf=0;for(const group of [...effects.children]){group.traverse(node=>{node.geometry?.dispose();node.material?.dispose();});effects.remove(group);}}
  function celebrate(reduced=false){
    clearEffects();
    for(const die of groups){
      if(!die.userData.critical)continue;
      const success=die.userData.critical==='success',color=success?0xffd466:0xff526b;
      const aura=new THREE.Group();aura.position.copy(die.position);aura.position.y=.014;
      for(let i=0;i<2;i++){
        const ring=new THREE.Mesh(new THREE.RingGeometry(plan.radius*(1.2+i*.35),plan.radius*(1.27+i*.35),48),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.8-i*.2,depthWrite:false,side:THREE.DoubleSide}));
        ring.rotation.x=-Math.PI/2;ring.position.y=i*.003;aura.add(ring);
      }
      for(let i=0;i<10;i++){
        const a=i*Math.PI/5,spark=new THREE.Mesh(new THREE.OctahedronGeometry(plan.radius*.065,0),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9}));
        spark.position.set(Math.cos(a)*plan.radius*1.45,plan.radius*(.5+(i%3)*.4),Math.sin(a)*plan.radius*1.45);aura.add(spark);
      }
      effects.add(aura);
    }
    render();if(reduced||!effects.children.length)return;
    const start=performance.now();
    const animate=now=>{const p=Math.min(1,(now-start)/1500);
      for(const aura of effects.children){aura.scale.setScalar(1+Math.sin(p*Math.PI*3)*.07);aura.children.forEach((node,i)=>{if(i>1){node.rotation.y=p*4;node.position.y+=.002;node.material.opacity=.9*(1-p*.7);}});}
      render();if(p<1)effectRaf=requestAnimationFrame(animate);else effectRaf=0;
    };effectRaf=requestAnimationFrame(animate);
  }
  function finish(){cancelAnimationFrame(effectRaf);effectRaf=0;cancelAnimationFrame(raf);raf=0;if(plan)paint(plan.frameCount-1);const done=resolveAnimation;resolveAnimation=null;done?.();}
  async function play(result,dice,seed,skipMotion=false){
    finish();clearEffects();removeChildren(diceGroup,true);groups=[];plan=result;buildTray(plan.width,plan.depth);
    const wanted=new Set(dice.map(d=>window.D20Appearance.style(d.diceStyle).id));
    const missing=[...wanted].filter(id=>!skinCache.has(id)).length;
    for(const [id,entry] of skinCache){if(skinCache.size+missing<=8)break;if(!wanted.has(id)){disposeSkin(entry);skinCache.delete(id);}}
    dice.forEach((die,i)=>{
      const shape=polyhedron(die.sides),cacheKey=die.sides+'-'+plan.radius;
      if(!geometryCache.has(cacheKey))geometryCache.set(cacheKey,beveledGeometry(shape,plan.radius));
      const [faceGeometry,edgeGeometry]=geometryCache.get(cacheKey),material=skinMaterials(die.diceStyle,die.sides===20);
      const group=new THREE.Group();group.add(new THREE.Mesh(faceGeometry,material.face),new THREE.Mesh(edgeGeometry,material.edge));group.children.forEach(mesh=>{mesh.castShadow=true;});
      if(material.skin.crystal){const core=new THREE.Mesh(new THREE.IcosahedronGeometry(plan.radius*.5,0),new THREE.MeshStandardMaterial({color:material.skin.accent,emissive:material.skin.base,emissiveIntensity:.4,roughness:.3,metalness:.35}));core.userData.ownsGeometry=true;core.userData.ownsMaterial=true;group.add(core);}
      const q=new THREE.Quaternion().fromArray(plan.frames,((plan.frameCount-1)*dice.length+i)*7+3);
      const labels=faceLabels(shape,plan.upFaces[i],die.value,die.mode),label=new THREE.Mesh(numberGeometry(shape,labels,plan.radius,q,plan.upFaces[i]),material.label);label.userData.ownsGeometry=true;group.add(label);
      group.userData={...die,labels,upFace:plan.upFaces[i]};diceGroup.add(group);groups.push(group);
    });resize();paint(skipMotion?plan.frameCount-1:0);
    if(skipMotion)return;
    const duration=Math.min(2800,Math.max(1800,plan.seconds*1000)),start=performance.now();
    return new Promise(resolve=>{
      resolveAnimation=resolve;
      const frame=now=>{const p=Math.min(1,(now-start)/duration);paint(p*(plan.frameCount-1));if(p<1)raf=requestAnimationFrame(frame);else{raf=0;resolveAnimation=null;resolve();}};
      raf=requestAnimationFrame(frame);
    });
  }
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);
  const onVisibility=()=>{if(document.hidden)finish();};document.addEventListener('visibilitychange',onVisibility);
  const onLoss=event=>{if(disposed)return;event.preventDefault();finish();host.dispatchEvent(new CustomEvent('dice-context-lost'));};renderer.domElement.addEventListener('webglcontextlost',onLoss);
  return {play,finish,resize,celebrate,inspect:()=>({framesRendered,animating:!!raf,celebrating:!!effectRaf,criticalEffects:effects.children.length,frame:lastFrame,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,cachedStyles:skinCache.size,
    dice:groups.map(g=>({sides:g.userData.sides,value:g.userData.value,diceStyle:g.userData.diceStyle||'astral',critical:g.userData.critical,mode:g.userData.mode,upFace:g.userData.upFace,upLabel:g.userData.labels[g.userData.upFace],position:g.position.toArray(),quaternion:g.quaternion.toArray()}))}),
    dispose(){if(disposed)return;finish();clearEffects();disposed=true;resizeObserver.disconnect();document.removeEventListener('visibilitychange',onVisibility);removeChildren(diceGroup,true);removeChildren(tray);for(const pair of geometryCache.values())pair.forEach(g=>g.dispose());for(const skin of skinCache.values())disposeSkin(skin);skinCache.clear();[floorMaterial,wood,trim].forEach(m=>m.dispose());felt.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}
  };
}
