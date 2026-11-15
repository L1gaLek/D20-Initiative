import * as THREE from '../../vendor/three/three.module.mjs';
import { OrbitControls } from '../../vendor/three/OrbitControls.mjs';
import { createHuman } from './human.mjs?v=20261115-human-poses-2';

function disposeFigure(figure){
  if(!figure)return;const materials=new Set();figure.traverse(o=>{o.userData.dispose?.();o.geometry?.dispose();if(o.material)materials.add(o.material);});materials.forEach(m=>m.dispose());figure.removeFromParent();
}
export function createPortrait(host){
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
  const canvas=renderer.domElement;canvas.className='avatar-portrait-canvas';canvas.tabIndex=0;canvas.setAttribute('aria-label','3D-превью персонажа: перетащите для вращения, колесо для приближения');host.prepend(canvas);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.05,30);camera.position.set(1.55,1.32,3.2);
  const controls=new OrbitControls(camera,canvas);controls.target.set(0,.85,0);controls.enablePan=false;controls.minDistance=1.9;controls.maxDistance=5;controls.minPolarAngle=.3;controls.maxPolarAngle=Math.PI*.53;
  controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.ROTATE};controls.update();
  scene.add(new THREE.HemisphereLight(0xf3e5ce,0x36313f,1.5));
  const key=new THREE.DirectionalLight('#ffe8d2',3.2);key.position.set(-3,5,4);scene.add(key);
  const rim=new THREE.DirectionalLight('#9bbbd4',2.0);rim.position.set(3,2,-3);scene.add(rim);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.43,.47,.1,48),new THREE.MeshStandardMaterial({color:'#34343c',metalness:.3,roughness:.5}));base.position.y=.065;scene.add(base);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.445,.009,6,48),new THREE.MeshStandardMaterial({color:'#ba9556',metalness:.7,roughness:.3}));ring.rotation.x=Math.PI/2;ring.position.y=.117;scene.add(ring);
  let figure=null,config=null,styleKey='',frame=0,walking=false,disposed=false,last=0;
  function draw(time){
    frame=0;if(disposed)return;
    if(walking&&figure){figure.userData.pose(Math.min(.06,(time-(last||time-16))/1000)*1.5,true);last=time;}
    renderer.render(scene,camera);if(walking)frame=requestAnimationFrame(draw);
  }
  function invalidate(){if(!disposed&&!frame)frame=requestAnimationFrame(draw);}
  controls.addEventListener('change',invalidate);
  const resize=new ResizeObserver(()=>{if(!host.clientWidth||!host.clientHeight)return;renderer.setSize(host.clientWidth,host.clientHeight,false);camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();invalidate();});resize.observe(host);
  const visibility=()=>{if(document.hidden){if(frame)cancelAnimationFrame(frame);frame=0;last=0;}else invalidate();};document.addEventListener('visibilitychange',visibility);
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  return {
    update(next){const k=JSON.stringify(next);if(k===styleKey)return;config=next;styleKey=k;disposeFigure(figure);figure=next?createHuman(next):null;if(figure)scene.add(figure);base.visible=ring.visible=!!figure;invalidate();},
    walk(value){walking=!!value;last=0;if(!walking)figure?.userData.pose(0,false);invalidate();},
    inspect(){return {ready:!!figure,config,walking,stance:figure?.userData.stance||null,angle:figure?.userData.walkAngle||0,camera:camera.position.toArray(),render:{geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles}};},
    dispose(){disposed=true;cancelAnimationFrame(frame);resize.disconnect();controls.dispose();document.removeEventListener('visibilitychange',visibility);disposeFigure(figure);for(const m of [base,ring]){m.geometry.dispose();m.material.dispose();}renderer.dispose();renderer.forceContextLoss();canvas.remove();}
  };
}
