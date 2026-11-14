import * as THREE from '../../vendor/three/three.module.mjs';
import { OrbitControls } from '../../vendor/three/OrbitControls.mjs';

const WALL_HEIGHT = 1.35;
const data = window.Board3DData;
const up = new THREE.Vector3(0, 1, 0);

function disposeTree(group) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  group.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
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
function fogMaterial(opacity) {
  return new THREE.ShaderMaterial({
    transparent: opacity < 1, depthWrite: opacity === 1,
    uniforms: { time: { value: 0 }, opacity: { value: opacity } },
    vertexShader: 'varying vec3 world; void main(){vec4 p=modelMatrix*instanceMatrix*vec4(position,1.);world=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}',
    fragmentShader: `varying vec3 world; uniform float time; uniform float opacity;
      float noise(vec3 p){return sin(p.x*1.83+sin(p.z*1.41+time*.11))*sin(p.z*2.31-p.x*.37+time*.08)*.5+.5;}
      void main(){float n=noise(world*.8);float n2=noise(world*2.4+4.);
      vec3 col=mix(vec3(.045,.057,.085),vec3(.17,.19,.25),n*.52+n2*.14);
      col*=.75+min(world.y/3.,1.)*.25;gl_FragColor=vec4(col,opacity);}`
  });
}

export function createBoard3D(root, callbacks) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'default' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor('#161c28');
  const canvas = renderer.domElement; canvas.className = 'board-3d-canvas'; root.prepend(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(43, 1, .08, 2500);
  camera.position.set(12, 14, 18);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = .085;
  controls.minPolarAngle = .035; controls.maxPolarAngle = Math.PI / 2 - .10;
  controls.minDistance = 2; controls.maxDistance = 800;
  controls.zoomSpeed = .85; controls.rotateSpeed = .65; controls.panSpeed = .8;
  controls.screenSpacePanning = false; controls.zoomToCursor = true;
  controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
  scene.add(new THREE.HemisphereLight(0xdce8ff, 0x3b3030, 2.4));
  const sun = new THREE.DirectionalLight(0xffdfb2, 3.1); sun.position.set(-15, 25, 12); scene.add(sun);
  const terrain = new THREE.Group(), wallGroup = new THREE.Group(), fogGroup = new THREE.Group();
  const pawnGroup = new THREE.Group(), markGroup = new THREE.Group();
  scene.add(terrain, wallGroup, fogGroup, pawnGroup, markGroup);
  const hover = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    color: 0xe5c271, transparent: true, opacity: .32, depthWrite: false, side: THREE.DoubleSide
  }));
  hover.rotation.x = -Math.PI / 2; hover.visible = false; scene.add(hover);
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const floorPlane = new THREE.Plane(up, 0), intersection = new THREE.Vector3();
  const transform = new THREE.Object3D();
  const pawns = new Map(), cameraMemory = new Map();
  let active = false, raf = 0, current = null, mapKey = null, animation = null;
  let terrainKey = '', wallKey = '', fogKey = '', pawnKey = '', marksKey = '';
  let mapTexture = null, textureUrl = '', textureGeneration = 0, fadeWalls = false;
  let lastRender = 0, dirty = true, cameraEventTime = 0;
  let drawable = false;

  function resized() {
    const w = root.clientWidth, h = root.clientHeight;
    drawable = w >= 2 && h >= 2;
    if (!drawable) { if (raf) cancelAnimationFrame(raf); raf=0; return; }
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
    if (active && !raf) raf = requestAnimationFrame(frame);
  }
  const observer = new ResizeObserver(resized); observer.observe(root);
  controls.addEventListener('start', () => { animation = null; });
  controls.addEventListener('change', () => {
    dirty = true;
    const now = performance.now();
    if (now - cameraEventTime > 30) { cameraEventTime = now; callbacks.cameraChanged(); }
  });
  function frame(time) {
    raf = 0; if (!active || !drawable) return;
    raf = requestAnimationFrame(frame);
    if (animation) {
      const t = Math.min(1, (time - animation.start) / 550), k = 1 - (1-t)**3;
      camera.position.lerpVectors(animation.fromPosition, animation.position, k);
      controls.target.lerpVectors(animation.fromTarget, animation.target, k);
      if (t === 1) animation = null;
      dirty = true;
    }
    controls.update();
    if (!dirty && (!fogGroup.children.length || time - lastRender < 66)) return;
    if (time - lastRender < 30) return;
    fogGroup.children.forEach(mesh => { if (mesh.material.uniforms?.time) mesh.material.uniforms.time.value = time / 1000; });
    renderer.render(scene, camera); lastRender = time; dirty = false;
  }
  function fly(position, target, immediate = false) {
    if (immediate) { camera.position.copy(position); controls.target.copy(target); controls.update(); dirty = true; return; }
    animation = { fromPosition: camera.position.clone(), fromTarget: controls.target.clone(), position, target, start: performance.now() };
  }
  // Wheel dolly uses the same easing as toolbar zoom. OrbitControls handles
  // rotation/pan/touch; intercept only wheel to avoid abrupt distance jumps.
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
    fly(target.clone().add(new THREE.Vector3(.32,.85,.9).normalize().multiplyScalar(distance)), target, immediate);
  }
  function loadTexture(url) {
    if (url === textureUrl) return;
    textureUrl = url; const generation = ++textureGeneration;
    mapTexture?.dispose(); mapTexture = null;
    terrain.children.forEach(mesh => { if (mesh.userData.floor) { mesh.material.map=null; mesh.material.needsUpdate=true; } });
    if (!url) return;
    new THREE.TextureLoader().load(url, texture => {
      if (generation !== textureGeneration) { texture.dispose(); return; }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      mapTexture = texture;
      terrain.children.forEach(mesh => { if (mesh.userData.floor) { mesh.material.map = texture; mesh.material.needsUpdate = true; } });
      callbacks.status(''); dirty = true;
    }, undefined, () => {
      if (generation === textureGeneration) callbacks.status('Подложка карты не загрузилась в 3D. Токены, стены и туман доступны.');
    });
  }
  function rebuildTerrain(view, alpha) {
    disposeTree(terrain);
    for (const value of [2, 1]) {
      if (view.omniscient && value === 1) continue;
      const mask = view.omniscient ? new Uint8Array(view.width * view.height).fill(2) : view.mask;
      const rectangles = data.rectangles(mask, view.width, view.height, value);
      if (!rectangles.length) continue;
      const floor = surface(rectangles, view.width, view.height, value === 2 ? '#aeb6bb' : '#454c59');
      floor.userData.floor = true; floor.material.map = mapTexture; terrain.add(floor);
      // Grid is clipped to known terrain, so it cannot disclose hidden geometry.
      const lines = [];
      for (const r of rectangles) {
        for (let x = r.x; x <= r.x+r.w; x++) lines.push(x,.018,r.y, x,.018,r.y+r.h);
        for (let y = r.y; y <= r.y+r.h; y++) lines.push(r.x,.018,y, r.x+r.w,.018,y);
      }
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
      const grid = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#17232b', transparent: true, opacity: Math.max(0, Math.min(1, Number(alpha))) * .42 }));
      terrain.add(grid);
    }
    // A neutral base shows only board bounds, not the undiscovered map texture.
    const base = new THREE.Mesh(new THREE.BoxGeometry(view.width+.1, .22, view.height+.1), new THREE.MeshStandardMaterial({ color: '#252e3d', roughness: .9 }));
    base.position.set(view.width/2, -.14, view.height/2); terrain.add(base);
  }
  function rebuildWalls(walls, view, alpha) {
    disposeTree(wallGroup);
    const colors = { stone: '#8b939d', wood: '#947045', metal: '#8596a7', explored: '#414750' };
    const groups = new Map();
    for (const w of walls) {
      const shape = data.wall(w, view); if (!shape) continue;
      const type = shape.explored ? 'explored' : shape.type;
      if (!groups.has(type)) groups.set(type, []); groups.get(type).push(shape);
    }
    for (const [type, segments] of groups) {
      const opacity = Math.max(0, Math.min(1, Number(alpha))) * (fadeWalls ? .27 : 1);
      const material = new THREE.MeshStandardMaterial({ color: colors[type], roughness: type === 'metal' ? .4 : .92,
        metalness: type === 'metal' ? .6 : .04, transparent: opacity < 1, opacity, depthWrite: opacity >= .9 });
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1), material, segments.length);
      segments.forEach((s, index) => {
        transform.position.set(s.x, WALL_HEIGHT / 2, s.z); transform.scale.set(s.w, WALL_HEIGHT, s.d); transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
      }); mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); wallGroup.add(mesh);
      // Pale caps make wall thickness and junctions legible from any angle.
      const cap = new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1), material.clone(), segments.length);
      cap.material.color.multiplyScalar(1.22);
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
      // Unknown content is absent from the scene, so fog can stay low enough to
      // leave the figures in adjacent discovered cells comfortably visible.
      const height = view.omniscient ? .07 : value === 0 ? .95 : .08;
      const opacity = view.omniscient ? (value === 0 ? .4 : .18) : value === 0 ? 1 : .22;
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1), fogMaterial(opacity), rectangles.length);
      rectangles.forEach((r, index) => {
        transform.position.set(r.x+r.w/2, height/2+.025, r.y+r.h/2);
        transform.scale.set(r.w, height, r.h); transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix);
      }); mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); fogGroup.add(mesh);
    }
    if (view.npcMask?.length === view.width*view.height) {
      const npc=surface(data.rectangles(view.npcMask,view.width,view.height,1),view.width,view.height,'#dc4545');
      npc.position.y=.105; npc.material.transparent=true; npc.material.opacity=.2; npc.material.depthWrite=false; fogGroup.add(npc);
    }
  }
  function rebuildPawns(tokens) {
    disposeTree(pawnGroup); pawns.clear();
    const sphere = new THREE.SphereGeometry(1, 16, 12);
    const body = new THREE.CylinderGeometry(.21, .31, .61, 16);
    const baseGeometry = new THREE.CylinderGeometry(.43, .47, .1, 32);
    const armGeometry = new THREE.CapsuleGeometry(.075, .34, 4, 8);
    for (const token of tokens) {
      const group = new THREE.Group();
      const scale = Math.min(3, Math.sqrt(token.size));
      const color = /^#[0-9a-f]{3,8}$/i.test(token.color) ? token.color : '#c6a35e';
      const material = new THREE.MeshStandardMaterial({ color, roughness: .68, metalness: .12, transparent: token.ghost, opacity: token.ghost ? .35 : 1 });
      const baseMat = new THREE.MeshStandardMaterial({ color: token.selected ? '#edcb71' : token.enemy ? '#9d3d40' : token.ally ? '#3b9770' : '#58677d', roughness: .72,
        transparent: token.ghost, opacity: token.ghost ? .35 : 1 });
      const base = new THREE.Mesh(baseGeometry, baseMat); base.position.y = .065; group.add(base);
      base.scale.set(token.size/scale,1,token.size/scale);
      const torso = new THREE.Mesh(body, material); torso.position.y = .57; group.add(torso);
      const head = new THREE.Mesh(sphere, material); head.scale.set(.20,.23,.20); head.position.y = 1.1; group.add(head);
      const collar = new THREE.Mesh(sphere, baseMat); collar.scale.set(.25,.08,.22); collar.position.y = .88; group.add(collar);
      for (const side of [-1,1]) {
        const arm = new THREE.Mesh(armGeometry, material); arm.position.set(side*.29,.61,0); arm.rotation.z = side * .17; group.add(arm);
        const foot = new THREE.Mesh(sphere, material); foot.scale.set(.115,.18,.15); foot.position.set(side*.13,.23,.035); group.add(foot);
      }
      if (token.selected) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(.49,.035,8,40), new THREE.MeshBasicMaterial({ color: '#ffe2a0' }));
        ring.scale.setScalar(token.size/scale);
        ring.rotation.x = Math.PI/2; ring.position.y = .08; group.add(ring);
      }
      const nameMat = new THREE.SpriteMaterial({ map: labelTexture(token.ghost ? `${token.name} · след` : token.name), transparent: true, depthTest: false,
        opacity: token.ghost ? .5 : 1 }); nameMat.userData.ownedMap = true;
      const label = new THREE.Sprite(nameMat); label.position.y = 1.65; label.scale.set(2.35,.44,1); label.renderOrder = 5; group.add(label);
      group.scale.setScalar(scale); group.position.set(token.x + token.size/2, 0, token.y + token.size/2);
      group.userData.tokenId = token.id; group.userData.ghost = token.ghost; group.userData.size = token.size;
      // Labels are excluded from hit testing: they may visually overlap another pawn.
      group.traverse(object => { if (object.isMesh) object.userData.tokenId = token.ghost ? null : token.id; });
      pawnGroup.add(group); pawns.set(token.id, group);
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
    const firstMap = mapKey !== next.mapKey;
    if (firstMap && current) cameraMemory.set(mapKey, { position: camera.position.clone(), target: controls.target.clone() });
    current = next; mapKey = next.mapKey;
    const v = next.view;
    const maskKey = `${v.width},${v.height},${v.omniscient},${v.showFog}:` + v.mask.join('');
    loadTexture(next.background);
    const tk = maskKey + ':' + next.gridAlpha;
    if (tk !== terrainKey) { rebuildTerrain(v, next.gridAlpha); terrainKey = tk; }
    const wk = maskKey + JSON.stringify(next.walls) + ':' + next.wallAlpha + ':' + fadeWalls;
    if (wk !== wallKey) { rebuildWalls(next.walls,v,next.wallAlpha); wallKey = wk; }
    const fk=maskKey+':'+(v.npcMask?.join('') || '');
    if (fk !== fogKey) { rebuildFog(v); fogKey = fk; }
    const pk = JSON.stringify(next.tokens.map(({ x, y, ...style }) => style));
    if (pk !== pawnKey) { rebuildPawns(next.tokens); pawnKey = pk; }
    else for (const token of next.tokens) pawns.get(token.id)?.position.set(token.x+token.size/2,0,token.y+token.size/2);
    const mk = maskKey + JSON.stringify(next.marks);
    if (mk !== marksKey) { rebuildMarks(next.marks,v); marksKey = mk; }
    if (firstMap) {
      resized();
      const saved = cameraMemory.get(mapKey);
      if (saved) fly(saved.position,saved.target,true); else overview(true);
    }
    dirty = true;
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
  function pick(x,y) {
    if (!current) return null;
    const rect = canvas.getBoundingClientRect();
    ndc.set((x-rect.left)/rect.width*2-1, -(y-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(ndc,camera);
    if (!raycaster.ray.intersectPlane(floorPlane, intersection)) return null;
    const px=intersection.x, pz=intersection.z, { width,height }=current.view;
    const cx=Math.floor(px), cy=Math.floor(pz);
    const point = cx>=0&&cy>=0&&cx<width&&cy<height ? { x:cx,y:cy,u:px-cx,v:pz-cy,px:px*50,py:pz*50 } : null;
    const hits = raycaster.intersectObjects(pawnGroup.children,true).filter(h => h.object.isMesh && h.object.userData.tokenId);
    let tokenId = hits[0]?.object.userData.tokenId || null;
    if (tokenId) {
      const group=pawns.get(tokenId);
      // Walls block clicking through them, but faded walls allow access inside rooms.
      const wallHit = !fadeWalls && raycaster.intersectObjects(wallGroup.children,false)[0];
      if (wallHit && wallHit.distance < hits[0].distance) tokenId=null;
      else if (!point) return { tokenId, point:{ x:Math.floor(group.position.x),y:Math.floor(group.position.z),u:.5,v:.5 } };
    }
    const markHit=raycaster.intersectObjects(markGroup.children,false).find(hit => {
      const x=Math.floor(hit.point.x), y=Math.floor(hit.point.z);
      return hit.object.userData.markId && (current.view.omniscient || data.cellState(current.view,x,y)>0);
    });
    return { point, tokenId, markId:markHit?.object.userData.markId || null };
  }
  function setActive(value) {
    active = !!value; controls.enabled = active;
    if (active) { resized(); dirty=true; if (!raf) raf=requestAnimationFrame(frame); }
    else { if (raf) cancelAnimationFrame(raf); raf=0; animation=null; }
  }
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); setActive(false); callbacks.failed(new Error('WebGL context lost')); });
  return {
    canvas, sync, setActive, pick, projectCell, projectToken, overview,
    hover(point, editing=false, size=1) {
      hover.visible=!!point && (!!editing || !!current?.tokens.some(t => t.selected));
      if (point) { hover.position.set(point.x+size/2,.055,point.y+size/2); hover.scale.set(size,size,1); hover.material.color.set(editing ? '#e5c271' : '#73b8dc'); }
      dirty=true;
    },
    focusToken(id) {
      const group=pawns.get(String(id)); if (!group || group.userData.ghost) return false;
      const target=group.position.clone();
      const direction=camera.position.clone().sub(controls.target).normalize();
      fly(target.clone().add(direction.multiplyScalar(Math.max(5,group.userData.size*5))), target); return true;
    },
    top() { const target=controls.target.clone(); fly(target.clone().add(new THREE.Vector3(0,Math.max(5,camera.position.distanceTo(target)),.01)),target); },
    zoom(factor) {
      const target=controls.target.clone(); const direction=camera.position.clone().sub(target);
      direction.setLength(THREE.MathUtils.clamp(direction.length()*factor,controls.minDistance,controls.maxDistance)); fly(target.clone().add(direction),target);
    },
    setWallFade(value) { fadeWalls=!!value; if(current) sync(current); },
    inspect() {
      return { ready:!!current, mapKey, tokens:[...pawns].map(([id,g])=>({ id,x:g.position.x-g.userData.size/2,y:g.position.z-g.userData.size/2,ghost:g.userData.ghost })),
        wallSegments:wallGroup.children.filter(m=>m.isInstancedMesh).reduce((sum,m)=>sum+m.count,0)/2,
        fogVolumes:fogGroup.children.reduce((sum,m)=>sum+(m.isInstancedMesh?m.count:0),0), wallFade:fadeWalls, camera:camera.position.toArray(), target:controls.target.toArray(),
        render: { calls:renderer.info.render.calls, triangles:renderer.info.render.triangles, geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures }, controlState:controls.state, running:!!raf };
    },
    dispose() { setActive(false);observer.disconnect();controls.dispose();[terrain,wallGroup,fogGroup,pawnGroup,markGroup].forEach(disposeTree);mapTexture?.dispose();hover.geometry.dispose();hover.material.dispose();renderer.dispose();canvas.remove(); }
  };
}
