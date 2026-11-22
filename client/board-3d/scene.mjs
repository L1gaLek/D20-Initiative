import * as THREE from '../../vendor/three/three.module.mjs';
import { OrbitControls } from '../../vendor/three/OrbitControls.mjs';
import { loadBoardImage } from './background.mjs';
import { fogMaterial, magicMaterial } from './effects.mjs';
import { createHuman,ensureArmorAsset,armorAssetRevision } from './human.mjs?v=20261122-egress-1';

const WALL_HEIGHT = 1.35;
const data = window.Board3DData;
const up = new THREE.Vector3(0, 1, 0);

function disposeTree(group) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  group.traverse(object => {
    object.userData.dispose?.();
    object.userData.deathButton?.remove();
    if (object.geometry && !object.isSprite && !object.geometry.userData.shared) geometries.add(object.geometry);
    for (const material of [].concat(object.material || [])) {
      materials.add(material);
      if (material.userData.ownedMap && material.map) textures.add(material.map);
    }
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
  group.clear();
}
function surface(rectangles, width, height, color) {
  const positions = [], uvs = [];
  for (const { x, y, w, h } of rectangles) {
    for (const [px, pz] of [[x,y],[x,y+h],[x+w,y],[x+w,y],[x,y+h],[x+w,y+h]]) {
      positions.push(px, 0, pz); uvs.push(px / width, 1 - pz / height);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide }));
}
function labelTexture(name) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.font = '600 32px system-ui, sans-serif';
  const text = String(name).slice(0, 52);
  const width = Math.min(500, ctx.measureText(text).width + 36);
  ctx.fillStyle = 'rgba(16,20,29,.88)'; ctx.beginPath(); ctx.roundRect((512-width)/2, 10, width, 64, 18); ctx.fill();
  ctx.strokeStyle = 'rgba(220,197,141,.4)'; ctx.stroke();
  ctx.fillStyle = '#f7efdc'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 42, 470);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function gridMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 cell; void main(){cell=position.xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 cell;
      void main(){vec2 pixel=max(fwidth(cell),vec2(.0001));
      vec2 edge=abs(fract(cell-.5)-.5)/pixel; float distance=min(edge.x,edge.y);
      float line=1.-smoothstep(.45,1.25,distance); float halo=1.-smoothstep(1.2,2.25,distance);
      float fade=1.-smoothstep(.18,.55,max(pixel.x,pixel.y));
      gl_FragColor=vec4(mix(vec3(.055,.075,.09),vec3(.93,.83,.61),line),max(line*.78,halo*.7)*fade);}`
  });
}

function pawnGeometry() {
  const parts = [];
  function add(geometry, x, y, z, sx=1, sy=1, sz=1, angle=0) {
    geometry.scale(sx,sy,sz); geometry.rotateZ(angle); geometry.translate(x,y,z);
    const flat = geometry.toNonIndexed(); geometry.dispose(); parts.push(flat);
  }
  add(new THREE.CylinderGeometry(.21,.31,.61,12),0,.57,0);
  add(new THREE.SphereGeometry(1,12,8),0,1.1,0,.2,.23,.2);
  add(new THREE.SphereGeometry(1,12,6),0,.88,0,.25,.08,.22);
  for (const side of [-1,1]) {
    add(new THREE.CapsuleGeometry(.075,.34,3,6),side*.29,.61,0,1,1,1,side*.17);
    add(new THREE.SphereGeometry(1,10,6),side*.13,.23,.035,.115,.18,.15);
  }
  const geometry = new THREE.BufferGeometry();
  for (const name of ['position','normal']) {
    const array = new Float32Array(parts.reduce((sum,p)=>sum+p.attributes[name].array.length,0));
    let offset=0; for (const part of parts) { array.set(part.attributes[name].array,offset); offset+=part.attributes[name].array.length; }
    geometry.setAttribute(name,new THREE.BufferAttribute(array,3));
  }
  parts.forEach(p=>p.dispose()); geometry.userData.shared=true; return geometry;
}

export function createBoard3D(root, callbacks) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor('#161c28');
  const canvas = renderer.domElement; canvas.className = 'board-3d-canvas'; root.prepend(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(43, 1, .08, 2500);
  camera.position.set(12, 14, 18);
  const controls = new OrbitControls(camera, canvas);
  canvas.style.removeProperty('cursor');
  controls.enableDamping = true; controls.dampingFactor = .085;
  controls.minPolarAngle = .035; controls.maxPolarAngle = Math.PI / 2 - .10;
  controls.minDistance = 2; controls.maxDistance = 800;
  controls.zoomSpeed = .85; controls.rotateSpeed = .65; controls.panSpeed = .8;
  controls.screenSpacePanning = true; controls.zoomToCursor = true;
  controls.mouseButtons = { LEFT: null, MIDDLE: null, RIGHT: THREE.MOUSE.ROTATE };
  scene.add(new THREE.HemisphereLight(0xdce8ff, 0x3b3030, 2.4));
  const sun = new THREE.DirectionalLight(0xffdfb2, 3.1); sun.position.set(-15, 25, 12); scene.add(sun);
  const terrain = new THREE.Group(), wallGroup = new THREE.Group(), fogGroup = new THREE.Group();
  const pawnGroup = new THREE.Group(), markGroup = new THREE.Group(), combatGroup = new THREE.Group();
  scene.add(terrain, wallGroup, fogGroup, pawnGroup, markGroup,combatGroup);
  const hover = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    color: 0xe5c271, transparent: true, opacity: .32, depthWrite: false, side: THREE.DoubleSide
  }));
  hover.rotation.x = -Math.PI / 2; hover.visible = false; scene.add(hover);
  const hoverBorder = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-.5,-.5,0),new THREE.Vector3(.5,-.5,0),new THREE.Vector3(.5,.5,0),new THREE.Vector3(-.5,.5,0)
  ]),new THREE.LineBasicMaterial({color:'#ffe1a0',depthWrite:false}));
  hover.add(hoverBorder);
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const floorPlane = new THREE.Plane(up, 0), intersection = new THREE.Vector3();
  const transform = new THREE.Object3D();
  const pawns = new Map(), cameraMemory = new Map();
  const bodyGeometry = pawnGeometry(), baseGeometry = new THREE.CylinderGeometry(.43,.47,.1,24);
  baseGeometry.userData.shared=true;
  const counters = { frames:0, syncs:0, pawnBuilds:0, terrainBuilds:0, picks:0, panMoves:0 };
  let active = false, raf = 0, current = null, mapKey = null, animation = null;
  let terrainKey = '', wallKey = '', fogKey = '', marksKey = '', combatKey = '';
  let mapTexture = null, textureUrl = '', textureGeneration = 0, textureAbort = null, textureState = { status:'empty' }, fadeWalls = false, showGrid = true;
  let lastFrame = 0, dirty = true, cameraEventTime = 0, idleTimer = 0, navigating = false, pan = null;
  let drawable = false, wallBounds = [];

  function invalidate() {
    dirty=true;
    if (active && drawable && !raf) { clearTimeout(idleTimer); raf=requestAnimationFrame(frame); }
  }

  function resized() {
    const w = root.clientWidth, h = root.clientHeight;
    drawable = w >= 2 && h >= 2;
    if (!drawable) { if (raf) cancelAnimationFrame(raf); raf=0; return; }
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); invalidate();
  }
  const observer = new ResizeObserver(resized); observer.observe(root);
  controls.addEventListener('start', () => { animation = null; navigating=true; canvas.dataset.cursor='rotate'; invalidate(); });
  controls.addEventListener('end', () => { navigating=false; delete canvas.dataset.cursor; invalidate(); });
  controls.addEventListener('change', () => {
    invalidate();
    const now = performance.now();
    if (now - cameraEventTime > 45) { cameraEventTime = now; callbacks.cameraChanged(); }
  });
  function frame(time) {
    raf = 0; if (!active || !drawable) return;
    const seconds=Math.min(.1,Math.max(.001,(time-(lastFrame || time-16))/1000)); lastFrame=time;
    if (animation) {
      const k=1-Math.exp(-seconds/animation.smoothing);
      camera.position.lerp(animation.position,k); controls.target.lerp(animation.target,k);
      if (camera.position.distanceToSquared(animation.position)+controls.target.distanceToSquared(animation.target)<.000001) {
        camera.position.copy(animation.position); controls.target.copy(animation.target); animation=null;
      }
      dirty = true;
    }
    controls.dampingFactor=1-Math.exp(-seconds/.065);
    const changed=controls.update();
    const walking=animatePawns(seconds);
    let actions=false;for(const pawn of pawns.values()){const figure=pawn.userData.figure;if(figure?.userData.studioAnimating){figure.userData.advanceStudio(seconds,!!pawn.userData.motion);actions=true;}}
    if (dirty || changed || walking || actions) {
      for(const group of [fogGroup,wallGroup])group.children.forEach(mesh=>{if(mesh.material.uniforms?.time)mesh.material.uniforms.time.value=time/1000;});
      renderer.render(scene, camera); positionDeathButtons(); counters.frames++; dirty=false;
    }
    if (animation || changed || navigating || pan || walking || actions) { if (!raf) raf=requestAnimationFrame(frame); }
    else if ([fogGroup,wallGroup].some(group=>group.children.some(mesh=>mesh.material.uniforms?.time))) idleTimer=setTimeout(invalidate,100);
  }
  function fly(position, target, immediate = false, smoothing=.035) {
    if (immediate) { animation=null; camera.position.copy(position); controls.target.copy(target); controls.update(); invalidate(); return; }
    animation = { position, target, smoothing }; invalidate();
  }
  // Match L1Volt: anchor the scale to the depth under the pointer, translate
  // along camera Right/Up (including world height), and follow with a 35ms lag.
  canvas.addEventListener('pointerdown',event=>{
    if (!active || event.button!==1) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const hit=pick(event.clientX,event.clientY);
    const focus=hit?.tokenId ? pawns.get(hit.tokenId).position.clone().add(new THREE.Vector3(0,.7,0))
      : hit?.point ? new THREE.Vector3(hit.point.x+hit.point.u,0,hit.point.y+hit.point.v) : controls.target;
    const forward=camera.getWorldDirection(new THREE.Vector3());
    const depth=Math.max(camera.near,focus.clone().sub(camera.position).dot(forward));
    pan={id:event.pointerId,x:event.clientX,y:event.clientY,scale:2*depth*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/root.clientHeight*1.5};
    canvas.setPointerCapture(event.pointerId); canvas.dataset.cursor='grabbing'; invalidate();
  },true);
  canvas.addEventListener('pointermove',event=>{
    if (!pan || event.pointerId!==pan.id) return;
    counters.panMoves++;
    event.preventDefault(); event.stopImmediatePropagation();
    const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0);
    const cameraUp=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1);
    const displacement=right.multiplyScalar(-(event.clientX-pan.x)*pan.scale).addScaledVector(cameraUp,(event.clientY-pan.y)*pan.scale);
    pan.x=event.clientX; pan.y=event.clientY;
    fly((animation?.position.clone() || camera.position.clone()).add(displacement),(animation?.target.clone() || controls.target.clone()).add(displacement));
  },true);
  const endPan=event=>{
    if (!pan || event.pointerId!==pan.id) return;
    event.preventDefault();event.stopImmediatePropagation(); pan=null; delete canvas.dataset.cursor;
    if(canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); invalidate();
  };
  canvas.addEventListener('pointerup',endPan,true); canvas.addEventListener('pointercancel',endPan,true);
  const blur=()=>{pan=null;navigating=false;delete canvas.dataset.cursor;invalidate();};
  window.addEventListener('blur',blur);
  canvas.addEventListener('auxclick',event=>{if(event.button===1)event.preventDefault();});
  // Wheel dolly follows the same short camera goal as middle-button panning.
  canvas.addEventListener('wheel', event => {
    if (!active) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? root.clientHeight : 1);
    const position = animation?.position.clone() || camera.position.clone();
    const target = animation?.target.clone() || controls.target.clone();
    const distance = position.distanceTo(target);
    const nextDistance = THREE.MathUtils.clamp(distance * Math.exp(THREE.MathUtils.clamp(delta * .0013,-.7,.7)),controls.minDistance,controls.maxDistance);
    const factor = nextDistance / distance;
    const hit = pick(event.clientX,event.clientY);
    const anchor = hit?.point ? new THREE.Vector3(hit.point.x+hit.point.u,0,hit.point.y+hit.point.v) : target.clone();
    fly(position.sub(anchor).multiplyScalar(factor).add(anchor), target.sub(anchor).multiplyScalar(factor).add(anchor));
  }, { passive:false,capture:true });
  function overview(immediate = false) {
    if (!current) return;
    const { width, height } = current.view;
    const target = new THREE.Vector3(width/2, 0, height/2);
    const fov = camera.fov * Math.PI / 180;
    const distance = Math.max(height, width / Math.max(.3, camera.aspect)) / (2 * Math.tan(fov/2)) * 1.1;
    fly(target.clone().add(new THREE.Vector3(.32,.85,.9).normalize().multiplyScalar(distance)), target, immediate,.08);
  }
  async function loadTexture(url) {
    if (url === textureUrl) return;
    textureUrl = url; const generation = ++textureGeneration;
    textureAbort?.abort(); textureAbort=new AbortController();
    mapTexture?.dispose(); mapTexture = null;
    terrain.children.forEach(mesh => { if (mesh.userData.floor) { mesh.material.map=null; mesh.material.needsUpdate=true; } });
    textureState={status:url?'loading':'empty'};
    if (!url) { callbacks.status(''); return; }
    try {
      const image=await loadBoardImage(url,{signal:textureAbort.signal,maxSize:Math.min(4096,renderer.capabilities.maxTextureSize)});
      if (generation !== textureGeneration) return;
      const texture=new THREE.CanvasTexture(image.canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      mapTexture = texture;
      terrain.children.forEach(mesh => { if (mesh.userData.floor) { mesh.material.map = texture; mesh.material.needsUpdate = true; } });
      textureState={status:'ready',width:image.width,height:image.height,sourceWidth:image.sourceWidth,sourceHeight:image.sourceHeight};
      callbacks.status(''); invalidate();
    } catch {
      if (generation === textureGeneration && !textureAbort.signal.aborted) {
        textureState={status:'error'};
        callbacks.status('Подложка недоступна. Проверьте ссылку и разрешение на загрузку изображения; кнопка «Подложка» повторит загрузку.');
      }
    }
  }
  function rebuildTerrain(view) {
    counters.terrainBuilds++;
    disposeTree(terrain);
    for (const value of [2, 1]) {
      if (view.omniscient && value === 1) continue;
      const mask = view.omniscient ? new Uint8Array(view.width * view.height).fill(2) : view.mask;
      const rectangles = data.rectangles(mask, view.width, view.height, value);
      if (!rectangles.length) continue;
      const floor = surface(rectangles, view.width, view.height, value === 2 ? '#ffffff' : '#343b4c');
      floor.userData.floor = true; floor.material.map = mapTexture; terrain.add(floor);
      // Grid is clipped to known terrain, so it cannot disclose hidden geometry.
      const grid = surface(rectangles,view.width,view.height,'#ffffff');
      grid.material.dispose(); grid.material=gridMaterial(); grid.position.y=.02; grid.userData.grid=true; grid.visible=showGrid;
      terrain.add(grid);
    }
    // A neutral base shows only board bounds, not the undiscovered map texture.
    const base = new THREE.Mesh(new THREE.BoxGeometry(view.width+.1, .22, view.height+.1), new THREE.MeshStandardMaterial({ color: '#252e3d', roughness: .9 }));
    base.position.set(view.width/2, -.14, view.height/2); terrain.add(base);
  }
  function rebuildWalls(walls, view, alpha) {
    disposeTree(wallGroup);
    wallBounds=[];
    const colors = { stone: '#8b939d', wood: '#947045', metal: '#8596a7', explored: '#414750' };
    const groups = new Map();
    for (const w of walls) {
      const shape = data.wall(w, view); if (!shape) continue;
      wallBounds.push(new THREE.Box3(new THREE.Vector3(shape.x-shape.w/2,0,shape.z-shape.d/2),new THREE.Vector3(shape.x+shape.w/2,WALL_HEIGHT+.05,shape.z+shape.d/2)));
      const type = shape.explored ? shape.type==='magic'?'magic-explored':'explored' : shape.type;
      if (!groups.has(type)) groups.set(type, []); groups.get(type).push(shape);
    }
    for (const [type, segments] of groups) {
      const opacity = Math.max(0, Math.min(1, Number(alpha))) * (fadeWalls ? .27 : 1);
      const magical=type.startsWith('magic');
      const material = magical ? magicMaterial(opacity,type==='magic-explored') : new THREE.MeshStandardMaterial({ color: colors[type], roughness: type === 'metal' ? .4 : .92,
        metalness: type === 'metal' ? .6 : .04, transparent: opacity < 1, opacity, depthWrite: opacity >= .9 });
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1), material, segments.length);
      segments.forEach((s, index) => {
        transform.position.set(s.x, WALL_HEIGHT / 2, s.z); transform.scale.set(s.w, WALL_HEIGHT, s.d); transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
      }); mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.userData.wallType=type;wallGroup.add(mesh);
      // Pale caps make wall thickness and junctions legible from any angle.
      const cap = new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1), magical ? new THREE.MeshBasicMaterial({color:type==='magic-explored'?'#665686':'#9ce9ff',transparent:true,opacity:opacity*.72,depthWrite:false}) : material.clone(), segments.length);
      if(!magical)cap.material.color.multiplyScalar(1.22);
      segments.forEach((s, index) => {
        transform.position.set(s.x, WALL_HEIGHT+.025, s.z); transform.scale.set(s.w+.025, .05, s.d+.025); transform.updateMatrix(); cap.setMatrixAt(index, transform.matrix);
      }); cap.instanceMatrix.needsUpdate = true; cap.computeBoundingSphere(); wallGroup.add(cap);
    }
  }
  function rebuildFog(view) {
    disposeTree(fogGroup);
    for (const value of view.showFog ? [0, 1] : []) {
      const rectangles = data.rectangles(view.mask, view.width, view.height, value);
      if (!rectangles.length) continue;
      // Unknown cells are absent below this raised opaque core. A lighter,
      // rippling outer layer gives depth without revealing hidden content.
      const height=value===0?(view.omniscient ? .95 : 1.45):.24;
      const opacity=view.omniscient?(value===0 ? .62 : .42):value===0?1:.68;
      const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1,8,1,8),fogMaterial(opacity,value===1),rectangles.length);
      mesh.userData.fogState=value===0?'unknown':'explored';mesh.userData.height=height;
      rectangles.forEach((r,index)=>{transform.position.set(r.x+r.w/2,height/2+.025,r.y+r.h/2);transform.scale.set(r.w,height,r.h);transform.updateMatrix();mesh.setMatrixAt(index,transform.matrix);});
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();fogGroup.add(mesh);
      if(value===0){
        const shell=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1,8,1,8),fogMaterial(view.omniscient ? .12 : .22,false,true),rectangles.length);
        rectangles.forEach((r,index)=>{transform.position.set(r.x+r.w/2,height/2+.14,r.y+r.h/2);transform.scale.set(r.w,height+.15,r.h);transform.updateMatrix();shell.setMatrixAt(index,transform.matrix);});
        shell.instanceMatrix.needsUpdate=true;shell.computeBoundingSphere();fogGroup.add(shell);
      }
    }
    if (view.npcMask?.length === view.width*view.height) {
      const npc=surface(data.rectangles(view.npcMask,view.width,view.height,1),view.width,view.height,'#dc4545');
      npc.position.y=.105; npc.material.transparent=true; npc.material.opacity=.2; npc.material.depthWrite=false; fogGroup.add(npc);
    }
  }
  function animatePawns(seconds) {
    let walking=false;
    for(const group of pawns.values()){
      const motion=group.userData.motion;if(!motion)continue;
      const next=motion.points[0],delta=next.clone().sub(group.position),distance=delta.length(),step=Math.min(distance,motion.speed*seconds);
      if(distance>0)group.position.addScaledVector(delta,step/distance);
      const figure=group.userData.figure;
      if(figure){figure.rotation.y=Math.atan2(delta.x,delta.z);figure.userData.pose(step,true);}
      if(distance<=step+.00001){group.position.copy(next);motion.points.shift();}
      if(!motion.points.length){group.userData.motion=null;figure?.userData.pose?.(0,false);}
      walking=true;
    }return walking;
  }
  const armorLoads=new Set();
  function updatePawnHud(group, token) {
    const key=JSON.stringify(token.hud||null);
    if(group.userData.hudKey===key)return;
    group.userData.hudKey=key;
    const previous=group.userData.hud;
    if(previous){group.remove(previous);previous.material.map.dispose();previous.material.dispose();}
    group.userData.hud=null;
    const health=token.hud?.health,life=token.hud?.life;
    const hasHp=health&&Number(health.hpMax)>0;
    const conditions=token.hud?.conditions||[];
    if(!token.hud||token.ghost||(!hasHp&&!conditions.length)){group.userData.deathButton?.remove();group.userData.deathButton=null;return;}
    const dying=hasHp&&life?.mode==='dying',cardHeight=hasHp?(dying?102:64):0;
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
    ctx.font='600 25px system-ui, sans-serif';
    const lines=[];let line='';
    for(const condition of conditions){const next=line?line+' · '+condition:String(condition);
      if(ctx.measureText(next).width>470&&line){lines.push(line);line=String(condition);}else line=next;}
    if(line)lines.push(line);
    canvas.width=512;canvas.height=cardHeight+lines.length*34+12;
    ctx.textAlign='center';ctx.textBaseline='middle';
    if(hasHp){
      ctx.fillStyle='rgba(14,19,26,.94)';ctx.beginPath();ctx.roundRect(132,4,248,cardHeight-8,12);ctx.fill();
      if(dying){
        ctx.font='600 21px system-ui';ctx.fillStyle='#f4d6ad';ctx.fillText('Спасброски смерти',256,23,228);
        for(let i=0;i<6;i++){const fail=i<3,filled=(fail?i:i-3)<(fail?life.fail:life.success),x=fail?162+i*34:282+(i-3)*34;
          ctx.beginPath();ctx.arc(x,51,10,0,Math.PI*2);ctx.fillStyle=filled?(fail?'#cf555a':'#55bd83'):'#202a31';ctx.fill();
          ctx.strokeStyle=fail?'#b76b71':'#71aa89';ctx.lineWidth=1.5;ctx.stroke();}
        ctx.font='600 18px system-ui';ctx.fillStyle=life.lastRoll==null?'#aca292':life.lastRoll>=10?'#8de0ae':'#f08f91';
        ctx.fillText(life.result||'Успех: 10 и выше',256,79,228);
        if(!token.hud.canRollDeathSave){
          ctx.beginPath();ctx.moveTo(256,39);ctx.lineTo(266,45);ctx.lineTo(266,57);ctx.lineTo(256,63);ctx.lineTo(246,57);ctx.lineTo(246,45);ctx.closePath();
          ctx.fillStyle='#76674d';ctx.fill();ctx.strokeStyle='#bba77c';ctx.stroke();
        }
      }else{
        const max=Number(health.hpMax),cur=health.hpCur==null?max:Number(health.hpCur),temp=Math.max(0,Number(health.hpTemp)||0);
        const ratio=life?.ratio??Math.max(0,Math.min(1,cur/max));
        ctx.fillStyle='#29353d';ctx.fillRect(138,15,236,36);
        ctx.fillStyle=life?.color||(temp?'#004a6b':'#428d65');ctx.fillRect(138,15,236*ratio,36);
        ctx.font='700 24px system-ui';ctx.fillStyle='#fff5df';
        ctx.fillText(life?.text||(temp?temp+' ('+cur+'/'+max+')':cur+'/'+max),256,34,228);
      }
    }
    if(lines.length){ctx.fillStyle='rgba(14,19,26,.9)';ctx.beginPath();ctx.roundRect(8,cardHeight+3,496,lines.length*34+5,10);ctx.fill();}
    ctx.font='600 25px system-ui';ctx.fillStyle='#f3d796';
    lines.forEach((text,i)=>ctx.fillText(text,256,cardHeight+22+i*34,470));
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false});material.userData.ownedMap=true;
    const hud=new THREE.Sprite(material),height=2.35*canvas.height/512;
    hud.scale.set(2.35,height,1);hud.position.y=(token.avatar?2.13:1.85)+height/2;hud.renderOrder=6;group.add(hud);group.userData.hud=hud;
    if(dying&&token.hud.canRollDeathSave&&callbacks.rollDeathSave){
      let button=group.userData.deathButton;
      if(!button){
        button=document.createElement('button');button.type='button';button.className='board-3d-death-roll';button.dataset.deathToken=token.id;
        button.innerHTML=window.TokenHealth.d20Icon;
        button.setAttribute('aria-label','Спасбросок от смерти: '+token.name);button.title='Спасбросок от смерти · d20 · успех от 10';
        for(const event of ['pointerdown','pointerup','mousedown','mouseup','dblclick','keydown'])button.addEventListener(event,e=>e.stopPropagation());
        button.addEventListener('click',async e=>{e.stopPropagation();button.disabled=true;try{await callbacks.rollDeathSave(token.id);}finally{if(button.isConnected)button.disabled=false;}});
        root.append(button);group.userData.deathButton=button;
      }
      button.disabled=!!token.hud.deathSavePending;button.setAttribute('aria-busy',String(!!token.hud.deathSavePending));
      group.userData.hudCanvasHeight=canvas.height;
    }else{group.userData.deathButton?.remove();group.userData.deathButton=null;}
  }
  function positionDeathButtons(){
    const rect=canvas.getBoundingClientRect(),host=root.getBoundingClientRect();
    const cameraUp=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1),cameraRight=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0);
    for(const group of pawns.values()){
      const button=group.userData.deathButton,hud=group.userData.hud;if(!button||!hud)continue;
      const point=hud.getWorldPosition(new THREE.Vector3());
      point.addScaledVector(cameraUp,(.5-51/group.userData.hudCanvasHeight)*hud.scale.y*group.scale.y);
      const side=point.clone().addScaledVector(cameraRight,1.175*group.scale.x/2).project(camera),screen=point.project(camera);
      const width=Math.abs(side.x-screen.x)*rect.width;
      button.hidden=screen.z>1||screen.z< -1||Math.abs(screen.x)>1||Math.abs(screen.y)>1||width<44;
      if(!button.hidden)button.style.transform='translate(-50%,-50%) translate('+(rect.left-host.left+(screen.x+1)*rect.width/2)+'px,'+(rect.top-host.top+(1-screen.y)*rect.height/2)+'px)';
    }
  }
  function updateTurnIndicator(group,token){
    let marker=group.userData.turnIndicator;
    if(token.currentTurn&&!token.ghost&&!marker){
      marker=new THREE.Group();
      const radius=token.size/group.scale.x;
      const halo=new THREE.Mesh(new THREE.RingGeometry(.50,.64,48),new THREE.MeshBasicMaterial({color:'#ffcb62',transparent:true,opacity:.24,side:THREE.DoubleSide,depthWrite:false}));
      halo.rotation.x=-Math.PI/2;halo.position.y=.065;halo.scale.setScalar(radius);marker.add(halo);
      const rim=new THREE.Mesh(new THREE.TorusGeometry(.56,.035,6,48),new THREE.MeshBasicMaterial({color:'#ffde89'}));
      rim.rotation.x=Math.PI/2;rim.position.y=.105;rim.scale.setScalar(radius);marker.add(rim);
      group.add(marker);group.userData.turnIndicator=marker;
    }
    if(marker)marker.visible=!!token.currentTurn&&!token.ghost;
  }
  function updatePawns(tokens,firstMap=false) {
    const present=new Set(tokens.map(t=>t.id));
    for (const [id,group] of pawns) if (!present.has(id)) { disposeTree(group); pawnGroup.remove(group); pawns.delete(id); }
    for (const token of tokens) {
      const {x,y,hud,currentTurn,...style}=token, key=JSON.stringify(style)+'|'+armorAssetRevision(token.avatar);
      if(token.avatar&&token.avatar.armor!=='none'&&!armorAssetRevision(token.avatar)){
        const id=token.avatar.model+'-'+token.avatar.armor;
        if(!armorLoads.has(id)){armorLoads.add(id);ensureArmorAsset(token.avatar).then(()=>{if(current&&canvas.isConnected)sync(current);}).catch(error=>{armorLoads.delete(id);console.warn('Armor model unavailable:',error.message);});}
      }
      let group=pawns.get(token.id);
      let previous=null;
      if (group && group.userData.styleKey!==key) {
        previous={position:group.position.clone(),target:group.userData.target,motion:group.userData.motion,angle:group.userData.figure?.rotation.y||0};
        disposeTree(group); pawnGroup.remove(group); pawns.delete(token.id); group=null;
      }
      if (!group) {
        counters.pawnBuilds++;
        group=new THREE.Group();
        const scale=Math.min(3,Math.sqrt(token.size));
        const color=/^#[0-9a-f]{3,8}$/i.test(token.color)?token.color:'#c6a35e';
        const material=new THREE.MeshStandardMaterial({color,roughness:.68,metalness:.12,transparent:token.ghost,opacity:token.ghost ? .35 : 1});
        const baseMat=new THREE.MeshStandardMaterial({color:token.selected?'#edcb71':token.enemy?'#9d3d40':token.ally?'#3b9770':'#58677d',roughness:.72,transparent:token.ghost,opacity:token.ghost ? .35 : 1});
        const base=new THREE.Mesh(baseGeometry,baseMat);base.position.y=.065;base.scale.set(token.size/scale,1,token.size/scale);group.add(base);
        let figure=null;
        if(token.avatar){figure=createHuman(token.avatar);group.add(figure);material.dispose();}
        else group.add(new THREE.Mesh(bodyGeometry,material));
        if (token.selected) {
          const ring=new THREE.Mesh(new THREE.TorusGeometry(.49,.035,6,32),new THREE.MeshBasicMaterial({color:'#ffe2a0'}));
          ring.scale.setScalar(token.size/scale);ring.rotation.x=Math.PI/2;ring.position.y=.08;group.add(ring);
        }
        const nameMat=new THREE.SpriteMaterial({map:labelTexture(token.ghost?token.name+' · след':token.name),transparent:true,depthTest:false,opacity:token.ghost ? .5 : 1});
        nameMat.userData.ownedMap=true;
        const label=new THREE.Sprite(nameMat);label.position.y=token.avatar?1.93:1.65;label.scale.set(2.35,.44,1);label.renderOrder=5;group.add(label);
        group.scale.setScalar(scale);
        group.userData={tokenId:token.id,ghost:token.ghost,size:token.size,styleKey:key,figure};
        if(previous&&!firstMap&&!token.ghost){group.position.copy(previous.position);Object.assign(group.userData,{target:previous.target,motion:previous.motion});if(figure)figure.rotation.y=previous.angle;}
        pawnGroup.add(group);pawns.set(token.id,group);
      }
      updatePawnHud(group,token);
      updateTurnIndicator(group,token);
      const target=new THREE.Vector3(x+token.size/2,0,y+token.size/2),oldTarget=group.userData.target;
      if(!oldTarget||firstMap||token.ghost||!active){group.position.copy(target);group.userData.motion=null;}
      else if(!oldTarget.equals(target)){
        const route=token.avatar?data.movementRoute({x:oldTarget.x-token.size/2,y:oldTarget.z-token.size/2},{x,y},token.size,current.view,current.walls,tokens,token.id):null;
        if(route?.length){
          const points=[...(group.userData.motion?.points||[]),...route.map(p=>new THREE.Vector3(p.x+token.size/2,0,p.y+token.size/2))];
          let distance=0,last=group.position;for(const p of points){distance+=last.distanceTo(p);last=p;}
          group.userData.motion={points,speed:distance/Math.min(2,Math.max(.4,distance*.20))};
        }else{group.position.copy(target);group.userData.motion=null;group.userData.figure?.userData.pose?.(0,false);}
      }
      group.userData.target=target;
      // A newly hidden route must disappear immediately rather than finishing
      // its animation outside the current visible footprint.
      if(group.userData.motion&&!current.view.omniscient){
        const visible=p=>{for(let yy=Math.floor(p.z-token.size/2);yy<p.z+token.size/2;yy++)for(let xx=Math.floor(p.x-token.size/2);xx<p.x+token.size/2;xx++)if(data.cellState(current.view,xx,yy)!==2)return false;return true;};
        if(![group.position,...group.userData.motion.points].every(visible)){group.position.copy(target);group.userData.motion=null;group.userData.figure?.userData.pose?.(0,false);}
      }
    }
  }
  function rebuildCombat(model,view) {
    disposeTree(combatGroup);
    const colors={reachable:'#63e899',dash:'#fa9648',origin:'#ffd276',teleport:'#b899ff'};
    for(const [kind,color] of Object.entries(colors)){
      const mask=new Uint8Array(view.width*view.height);
      for(const cell of model?.cells||[]){
        if(cell.kind!==kind)continue;
        for(let y=cell.y;y<cell.y+cell.size;y++)for(let x=cell.x;x<cell.x+cell.size;x++){
          if(x>=0&&y>=0&&x<view.width&&y<view.height&&(view.omniscient||data.cellState(view,x,y)>0))mask[y*view.width+x]=1;
        }
      }
      const rectangles=data.rectangles(mask,view.width,view.height,1);if(!rectangles.length)continue;
      const mesh=surface(rectangles,view.width,view.height,color);mesh.material.dispose();
      mesh.material=new THREE.MeshBasicMaterial({color,transparent:true,opacity:kind==='origin' ? .5 : .32,depthWrite:false,side:THREE.DoubleSide});
      mesh.position.y=kind==='origin' ? .048 : .04;mesh.userData.kind=kind;mesh.userData.cells=mask.reduce((sum,n)=>sum+n,0);combatGroup.add(mesh);
      // Per-cell bright borders remain visible above the ordinary map grid.
      const lines=[];for(let y=0;y<view.height;y++)for(let x=0;x<view.width;x++)if(mask[y*view.width+x]){
        for(const [ax,az,bx,bz] of [[x,y,x+1,y],[x+1,y,x+1,y+1],[x+1,y+1,x,y+1],[x,y+1,x,y]])lines.push(ax,.052,az,bx,.052,bz);
      }
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));
      combatGroup.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color,transparent:true,opacity:.85})));
    }
  }
  function rebuildMarks(marks, view) {
    disposeTree(markGroup);
    for (const mark of marks) {
      const kind = mark.kind;
      let points = [];
      if (kind === 'rect') points = [[mark.x,mark.y],[mark.x+mark.w,mark.y],[mark.x+mark.w,mark.y+mark.h],[mark.x,mark.y+mark.h]];
      if (kind === 'circle') points = Array.from({ length: 48 }, (_,i) => [Number(mark.cx)+Math.cos(i/48*Math.PI*2)*mark.r, Number(mark.cy)+Math.sin(i/48*Math.PI*2)*mark.r]);
      if (kind === 'poly') points = (mark.pts || []).map(p => [p.x,p.y]);
      if (kind === 'pin') points = Array.from({ length: 24 }, (_,i) => [Number(mark.x)+Math.cos(i/24*Math.PI*2)*.16, Number(mark.y)+Math.sin(i/24*Math.PI*2)*.16]);
      if (points.length < 3 || points.some(p => !p.every(Number.isFinite))) continue;
      const minX = Math.floor(Math.min(...points.map(p => p[0]))), maxX = Math.floor(Math.max(...points.map(p => p[0])));
      const minY = Math.floor(Math.min(...points.map(p => p[1]))), maxY = Math.floor(Math.max(...points.map(p => p[1])));
      // Clip partial shapes with the exact visibility mask in the fragment shader.
      if (!view.omniscient) {
        let intersectsKnown=false;
        for(let y=Math.max(0,minY);y<=Math.min(view.height-1,maxY)&&!intersectsKnown;y++) {
          for(let x=Math.max(0,minX);x<=Math.min(view.width-1,maxX);x++) if(data.cellState(view,x,y)>0) { intersectsKnown=true;break; }
        }
        if (!intersectsKnown) continue;
      }
      const shape = new THREE.Shape(points.map(p => new THREE.Vector2(p[0], -p[1])));
      const material = new THREE.MeshBasicMaterial({ color: /^#[0-9a-f]{6}$/i.test(mark.color) ? mark.color : '#ffa500',
        opacity: Math.max(.08, Math.min(.9, Number(mark.alphaFill) || .3)), transparent: true, side: THREE.DoubleSide, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material); mesh.rotation.x = -Math.PI/2; mesh.position.y = .035;
      // Cell clipping prevents markers extending over hidden fog from revealing shape/labels.
      const clip = new Uint8Array(view.mask.length);
      for (let i = 0; i < clip.length; i++) clip[i] = view.omniscient || view.mask[i] ? 255 : 0;
      const mask = new THREE.DataTexture(clip,view.width,view.height,THREE.RedFormat); mask.needsUpdate = true;
      material.userData.ownedMap = true; material.map = mask;
      material.onBeforeCompile = shader => {
        shader.uniforms.visibilityMask = { value: mask }; shader.uniforms.boardSize = { value: new THREE.Vector2(view.width,view.height) };
        shader.vertexShader = 'varying vec2 boardPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nboardPoint=vec2(position.x,-position.y);');
        shader.fragmentShader = 'uniform sampler2D visibilityMask; uniform vec2 boardSize; varying vec2 boardPoint;\n'+shader.fragmentShader.replace('#include <map_fragment>', 'if(texture2D(visibilityMask,boardPoint/boardSize).r<.5) discard;');
      };
      // A custom map fragment replaces built-in UV sampling; provide valid UVs via ShapeGeometry.
      mesh.userData.bounds = [minX,maxX,minY,maxY]; mesh.userData.markId = mark.id === '__preview' ? null : String(mark.id || ''); markGroup.add(mesh);
      const outlineGeometry = new THREE.BufferGeometry().setFromPoints(points.concat([points[0]]).map(p => new THREE.Vector3(p[0],.045,p[1])));
      // Only outline wholly known shapes; partially hidden ones keep the clipped fill.
      let known = view.omniscient;
      if (!known) { known = true; for (let y=minY; y<=maxY; y++) for(let x=minX; x<=maxX; x++) if (!data.cellState(view,x,y)) known=false; }
      if (known) markGroup.add(new THREE.Line(outlineGeometry, new THREE.LineBasicMaterial({ color: material.color, transparent: true, opacity: .8 })));
      else outlineGeometry.dispose();
      if (known && mark.label) {
        const material = new THREE.SpriteMaterial({map:labelTexture(String(mark.label)),transparent:true,depthTest:false}); material.userData.ownedMap=true;
        const label=new THREE.Sprite(material); label.position.set((minX+maxX+1)/2,.22,(minY+maxY+1)/2); label.scale.set(2.5,.47,1);markGroup.add(label);
      }
    }
  }
  function sync(next) {
    counters.syncs++;
    const firstMap = mapKey !== next.mapKey;
    if (firstMap && current) cameraMemory.set(mapKey, { position: camera.position.clone(), target: controls.target.clone() });
    current = next; mapKey = next.mapKey;
    const v = next.view;
    const maskKey = `${v.width},${v.height},${v.omniscient},${v.showFog}:` + v.mask.join('');
    loadTexture(next.background);
    const geometryMaskKey=v.omniscient ? [v.width,v.height,'gm'].join(',') : maskKey;
    const tk = geometryMaskKey;
    if (tk !== terrainKey) { rebuildTerrain(v); terrainKey = tk; }
    const wk = geometryMaskKey + JSON.stringify(next.walls) + ':' + next.wallAlpha + ':' + fadeWalls;
    if (wk !== wallKey) { rebuildWalls(next.walls,v,next.wallAlpha); wallKey = wk; }
    const fk=maskKey+':'+(v.npcMask?.join('') || '');
    if (fk !== fogKey) { rebuildFog(v); fogKey = fk; }
    updatePawns(next.tokens,firstMap);
    const ck=maskKey+JSON.stringify(next.combat);
    if(ck!==combatKey){rebuildCombat(next.combat,v);combatKey=ck;}
    const mk = maskKey + JSON.stringify(next.marks);
    if (mk !== marksKey) { rebuildMarks(next.marks,v); marksKey = mk; }
    if (firstMap) {
      resized();
      const saved = cameraMemory.get(mapKey);
      if (saved) fly(saved.position,saved.target,true); else overview(true);
    }
    invalidate();
  }
  function projectCell(x,z,height=0) {
    const rect = canvas.getBoundingClientRect();
    const point = new THREE.Vector3(x,height,z).project(camera);
    const behind = point.z > 1;
    let dx = point.x * rect.width/2, dy = -point.y * rect.height/2;
    if (behind) { dx = -dx; dy = -dy; const len = Math.max(1,Math.hypot(dx,dy)); dx=dx/len*100000; dy=dy/len*100000; }
    return { x: rect.left + rect.width/2 + dx, y: rect.top + rect.height/2 + dy, behind };
  }
  function projectToken(id) {
    const group = pawns.get(String(id));
    return group && !group.userData.ghost ? projectCell(group.position.x,group.position.z,.7*group.scale.x) : null;
  }
  function pick(x,y,withMarks=false) {
    counters.picks++;
    if (!current) return null;
    const rect = canvas.getBoundingClientRect();
    ndc.set((x-rect.left)/rect.width*2-1, -(y-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(ndc,camera);
    if (!raycaster.ray.intersectPlane(floorPlane, intersection)) return null;
    const px=intersection.x, pz=intersection.z, { width,height }=current.view;
    const cx=Math.floor(px), cy=Math.floor(pz);
    const point = cx>=0&&cy>=0&&cx<width&&cy<height ? { x:cx,y:cy,u:px-cx,v:pz-cy,px:px*50,py:pz*50 } : null;
    // Bounding proxies avoid testing every triangle of every figure on hover.
    let tokenId=null, nearest=Infinity;
    const box=new THREE.Box3(), hitPoint=new THREE.Vector3();
    for (const [id,group] of pawns) {
      if (group.userData.ghost) continue;
      const radius=Math.max(.34*group.scale.x,.47*group.userData.size), p=group.position;
      box.min.set(p.x-radius,0,p.z-radius); box.max.set(p.x+radius,(group.userData.figure?1.65:1.35)*group.scale.x,p.z+radius);
      if (raycaster.ray.intersectBox(box,hitPoint)) {
        const distance=hitPoint.distanceToSquared(raycaster.ray.origin);
        if(distance<nearest){nearest=distance;tokenId=id;}
      }
    }
    if (tokenId && !fadeWalls) for (const bounds of wallBounds) {
      if(raycaster.ray.intersectBox(bounds,hitPoint) && hitPoint.distanceToSquared(raycaster.ray.origin)<nearest){tokenId=null;break;}
    }
    if(tokenId && !point){const group=pawns.get(tokenId);return {tokenId,point:{x:Math.floor(group.position.x),y:Math.floor(group.position.z),u:.5,v:.5}};}
    const markHit=withMarks ? raycaster.intersectObjects(markGroup.children,false).find(hit => {
      const x=Math.floor(hit.point.x), y=Math.floor(hit.point.z);
      return hit.object.userData.markId && (current.view.omniscient || data.cellState(current.view,x,y)>0);
    }) : null;
    return { point, tokenId, markId:markHit?.object.userData.markId || null };
  }
  function setActive(value) {
    active = !!value; controls.enabled = active;
    if (active) { resized(); dirty=true; if (!raf) raf=requestAnimationFrame(frame); }
    else { if (raf) cancelAnimationFrame(raf); clearTimeout(idleTimer); raf=0; animation=null; pan=null; navigating=false; delete canvas.dataset.cursor;
      for(const group of pawns.values()){if(group.userData.target)group.position.copy(group.userData.target);group.userData.motion=null;group.userData.figure?.userData.pose?.(0,false);}
    }
  }
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); setActive(false); callbacks.failed(new Error('WebGL context lost')); });
  return {
    canvas, sync, setActive, pick, projectCell, projectToken, overview,
    playAction(id,name){const figure=pawns.get(String(id))?.userData.figure;if(!figure?.userData.playStudioAction)return false;figure.userData.playStudioAction(name);invalidate();return !!figure.userData.studioAnimating;},
    hover(point, editing=false, size=1) {
      hover.visible=!!point && !!current && (current.view.omniscient || data.cellState(current.view,point.x,point.y)>0);
      if (point) { hover.position.set(point.x+size/2,.055,point.y+size/2); hover.scale.set(size,size,1); hover.material.color.set(editing || !current?.tokens.some(t=>t.selected) ? '#e5c271' : '#73b8dc'); }
      invalidate();
    },
    setGrid(value) { showGrid=!!value; terrain.children.forEach(mesh=>{if(mesh.userData.grid)mesh.visible=showGrid;});invalidate(); },
    reloadBackground() { const url=textureUrl;textureUrl=null;loadTexture(url); },
    focusToken(id) {
      const group=pawns.get(String(id)); if (!group || group.userData.ghost) return false;
      // Frame the character and its health/conditions, rather than only its feet.
      const target=group.position.clone(); target.y=.95*group.scale.y;
      const direction=camera.position.clone().sub(controls.target).normalize();
      fly(target.clone().add(direction.multiplyScalar(Math.max(6,group.userData.size*5))), target); return true;
    },
    top() { const target=controls.target.clone(); fly(target.clone().add(new THREE.Vector3(0,Math.max(5,camera.position.distanceTo(target)),.01)),target); },
    zoom(factor) {
      const target=controls.target.clone(); const direction=camera.position.clone().sub(target);
      direction.setLength(THREE.MathUtils.clamp(direction.length()*factor,controls.minDistance,controls.maxDistance)); fly(target.clone().add(direction),target);
    },
    setWallFade(value) { fadeWalls=!!value; if(current) sync(current); },
    inspect() {
      return { ready:!!current, mapKey, grid:showGrid, hover: hover.visible, background:{...textureState}, counters:{...counters}, tokens:[...pawns].map(([id,g])=>({ id,x:g.position.x-g.userData.size/2,y:g.position.z-g.userData.size/2,ghost:g.userData.ghost,currentTurn:!!g.userData.turnIndicator?.visible,hud:g.userData.hud ? JSON.parse(g.userData.hudKey) : null,
        avatar:g.userData.figure?.userData.avatar||null,armorQuality:g.userData.figure?.userData.armorQuality,stance:g.userData.figure?.userData.stance||null,walking:!!g.userData.motion,studioAnimating:!!g.userData.figure?.userData.studioAnimating,limbAngle:g.userData.figure?.userData.walkAngle||0 })),
        combat:{mode:current?.combat?.mode||null,cells:combatGroup.children.filter(m=>m.userData.kind).map(m=>({kind:m.userData.kind,count:m.userData.cells}))},
        magicWalls:wallGroup.children.filter(m=>m.userData.wallType?.startsWith('magic')).reduce((sum,m)=>sum+m.count,0),
        fogLayers:fogGroup.children.filter(m=>m.userData.fogState).map(m=>({state:m.userData.fogState,height:m.userData.height,opacity:m.material.uniforms.opacity.value})),
        wallSegments:wallGroup.children.filter(m=>m.isInstancedMesh).reduce((sum,m)=>sum+m.count,0)/2,
        fogVolumes:fogGroup.children.reduce((sum,m)=>sum+(m.isInstancedMesh?m.count:0),0), wallFade:fadeWalls, camera:camera.position.toArray(), target:controls.target.toArray(),
        render: { calls:renderer.info.render.calls, triangles:renderer.info.render.triangles, geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures }, controlState:pan?2:controls.state, running:active&&drawable, framePending:!!raf };
    },
    dispose() { setActive(false);textureGeneration++;textureAbort?.abort();window.removeEventListener('blur',blur);observer.disconnect();controls.dispose();[terrain,wallGroup,fogGroup,pawnGroup,markGroup,combatGroup].forEach(disposeTree);mapTexture?.dispose();bodyGeometry.dispose();baseGeometry.dispose();hover.geometry.dispose();hover.material.dispose();hoverBorder.geometry.dispose();hoverBorder.material.dispose();renderer.dispose();canvas.remove(); }
  };
}
