import * as THREE from '../../vendor/three/three.module.mjs';

// Cloth spans the bust smoothly, without reproducing the bare body's small
// anatomical contours. The same sections fit underwear and soft armor.
export function femaleTorsoProfile(y){
  const rows=[[1.025,.137,.151,-.037],[1.10,.124,.155,-.031],[1.14,.127,.160,-.032],[1.18,.132,.166,-.035],[1.22,.145,.180,-.047],[1.26,.154,.185,-.062],[1.30,.161,.164,-.074],[1.34,.165,.136,-.077],[1.38,.170,.110,-.076],[1.405,.135,.087,-.060],[1.43,.068,.083,-.037]];
  let i=1;while(i<rows.length-1&&y>rows[i][0])i++;
  const a=rows[i-1],b=rows[i],t=THREE.MathUtils.clamp((y-a[0])/(b[0]-a[0]),0,1);
  return [1,2,3].map(k=>THREE.MathUtils.lerp(a[k],b[k],t));
}

// Rigid fittings share their parent's animation joint. Merge by material after
// construction, while leaving skinned clothing and the bone hierarchy intact.
export function batchRigid(group,skeleton){
  group.updateMatrixWorld(true);const groups=new Map();
  group.traverse(mesh=>{if(!mesh.isMesh)return;if(!groups.has(mesh.material))groups.set(mesh.material,[]);groups.get(mesh.material).push(mesh);});
  for(const [material,meshes] of groups){
    const pos=[],normals=[],joints=[],weights=[],colors=[],indices=[],point=new THREE.Vector3(),normal=new THREE.Vector3();
    for(const mesh of meshes){
      const g=mesh.geometry,a=g.attributes,offset=pos.length/3,normalMatrix=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
      let parent=mesh.parent;while(parent&&!parent.isBone)parent=parent.parent;const joint=Math.max(0,skeleton.bones.indexOf(parent));
      for(let i=0;i<a.position.count;i++){
        point.fromBufferAttribute(a.position,i).applyMatrix4(mesh.matrixWorld);normal.fromBufferAttribute(a.normal,i).applyNormalMatrix(normalMatrix);pos.push(...point);normals.push(...normal);
        for(let k=0;k<4;k++){joints.push(mesh.isSkinnedMesh?a.skinIndex.array[i*4+k]:joint);weights.push(mesh.isSkinnedMesh?a.skinWeight.array[i*4+k]:(k===0?1:0));}
        if(a.color)colors.push(a.color.getX(i),a.color.getY(i),a.color.getZ(i));else colors.push(1,1,1);
      }
      if(g.index)for(const i of g.index.array)indices.push(i+offset);else for(let i=0;i<a.position.count;i++)indices.push(i+offset);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(joints,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
    if(material.vertexColors)geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);
    for(const mesh of meshes){mesh.removeFromParent();mesh.geometry.dispose();}
    const merged=new THREE.SkinnedMesh(geometry,material);merged.name=meshes.map(m=>m.name).filter(Boolean).join(' ');merged.frustumCulled=false;group.add(merged);merged.bind(skeleton);
  }
}

export function dressHuman({config,materials:m,definitions,byName,surface,attach,sphere:makeSphere,curve:makeCurve,texture,female,posePlan}){
  const kind=config.armor||'none',armored=kind!=='none';
  const plate=['breastplate','half-plate','plate','splint'].includes(kind),mail=['chain-shirt','chain-mail','ring-mail'].includes(kind),leather=['leather','studded-leather','hide'].includes(kind);
  const mat=(color,metalness=0,roughness=.65)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
  const padding=mat('#4b4843'),coat=mat(leather?(kind==='hide'?'#817057':'#775038'):'#747f87',mail||kind==='scale-mail'?.64:.05,mail?.58:.64);texture(padding,'linen');
  if(leather)texture(coat,'leather');
  if(mail||kind==='scale-mail'){
    coat.customProgramCacheKey=()=>`detailed-mail-${kind}`;
    coat.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec3 mailPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nmailPoint=position;');
      shader.fragmentShader='varying vec3 mailPoint;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        vec2 p=vec2(atan(mailPoint.x,mailPoint.z)*.12,mailPoint.y)*${kind==='ring-mail'?'135.':'210.'};
        p.x+=mod(floor(p.y),2.)*.5;vec2 q=fract(p)-.5;
        float ring=1.-smoothstep(.055,.115,abs(length(q*vec2(1.,1.18))-.33));
        diffuseColor.rgb*=.37+ring*.73;
      `).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+.1*sin(mailPoint.y*1900.),.32,.8);');
    };
  }
  const torso=([x,y])=>y>1.0&&y<1.45&&Math.abs(x)<.195;
  const legs=([x,y])=>y<1.06&&Math.abs(x)<.25;
  const arms=([x,y],bone)=>/^(upperarm|lowerarm)/.test(bone);
  const bodybone='spine03';
  const detailPoint=p=>{
    if(!female||plate||p[1]<1.02||p[1]>1.43||p[2]<.07)return p;
    const [rx,front,back]=femaleTorsoProfile(p[1]),z=(front+back)/2+(front-back)/2*Math.sqrt(Math.max(0,1-(p[0]/rx)**2));
    return [p[0],p[1],Math.max(p[2],z+.005)];
  };
  const curve=(bone,material,points,...args)=>makeCurve(bone,material,bone===bodybone?points.map(detailPoint):points,...args);
  const sphere=(bone,material,p,...args)=>makeSphere(bone,material,bone===bodybone?detailPoint(p):p,...args);
  function box(bone,material,p,size,rotation){const g=new THREE.BoxGeometry(...size);if(rotation)g.rotateZ(rotation);g.translate(...(bone===bodybone?detailPoint(p):p));return attach(bone,g,material);}
  function rivet(bone,p,r=.0023){return sphere(bone,m.trim,p,[r,r,r*.48],8);}
  function strap(bone,points,width=.008,material=m.leather){return curve(bone,material,points,width/2,28);}
  function band(bone,p,radiusX,radiusZ,width,material=m.leather){
    const g=new THREE.CylinderGeometry(1,1,width,32,1,true);g.scale(radiusX,1,radiusZ);g.translate(...p);return attach(bone,g,material);
  }
  const cut=(min,max)=>[p=>p[1]-min,p=>max-p[1]];
  function shell(material,predicate,offset=.007,deform,clips=[]){const mesh=surface(material,predicate,offset,deform,clips);if(mesh)mesh.name='fitted-equipment';return mesh;}
  function bodice(material,min,max){
    const positions=[],indices=[],rows=28,segments=64;
    for(let row=0;row<=rows;row++){
      const y=min+row/rows*(max-min),[rx,front,back]=femaleTorsoProfile(y),center=(front+back)/2,depth=(front-back)/2;
      for(let col=0;col<=segments;col++){const a=col/segments*Math.PI*2;positions.push(Math.sin(a)*(rx+.003),y,center+Math.cos(a)*(depth+.005));}
    }
    for(let row=0;row<rows;row++)for(let col=0;col<segments;col++){const a=row*(segments+1)+col,b=a+segments+1;indices.push(a,a+1,b,a+1,b+1,b);}
    const top=new THREE.BufferGeometry();top.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));top.setIndex(indices);top.computeVertexNormals();attach(bodybone,top,material);
  }
  // The same fitted garment follows all pelvis/thigh weights, including a wide,
  // opaque waistband. Skin underneath remains covered during every walk pose.
  shell(armored?m.cloth:m.linen,legs,.008,(p)=>{
    if(p[1]>.82&&p[1]<.99){p[0]*=1.025;p[2]*=1.04;}
  },cut(armored?.24:.82,1.04));
  band('root',[0,1.028,.031],.14,.108,.018,armored?m.leather:m.linen);
  if(female&&!armored){
    bodice(m.linen,1.155,1.36);
    for(const y of [1.155,1.36]){const [rx,front,back]=femaleTorsoProfile(y),points=[];for(let i=0;i<=64;i++){const a=i/64*Math.PI*2;points.push([Math.sin(a)*(rx+.003),y,(front+back)/2+Math.cos(a)*((front-back)/2+.005)]);}curve(bodybone,m.linen,points,.0024,64);}
    for(const sign of [-1,1])curve(bodybone,m.linen,[[sign*.085,1.345,.119],[sign*.104,1.415,.04],[sign*.103,1.39,-.052],[sign*.085,1.35,-.061]],.006);
  }
  if(armored){
    shell(padding,(p,b)=>arms(p,b)||torso(p,b)&&p[1]>1.40,.006,null,cut(1.025,1.43));
    for(const side of ['L','R']){
      const b=`lowerleg01.${side}`,foot=`foot.${side}`;
      shell(m.leather,(p,bone)=>bone.endsWith(`.${side}`)&&/^(lowerleg|foot)/.test(bone),.009,null,cut(.18,.37));
      const f=definitions.get(foot).head;
      // Sole and welt follow the ankle, rather than sliding under the floor.
      const sections=[[-.058,.006,.155],[-.046,.035,.20],[0,.046,.239],[.05,.049,.22],[.10,.051,.193],[.16,.049,.173],[.195,.040,.161],[.21,.004,.143]];
      function shoe(material,sole=false){
        const positions=[],indices=[],steps=24;
        for(const [z,width,top] of sections)for(let i=0;i<=steps;i++){
          const a=i/steps*Math.PI*2;positions.push(f[0]+Math.cos(a)*width,(sole?.116:.128)+Math.max(0,Math.sin(a))*(sole?.014:top-.128),z);
        }
        for(let row=0;row<sections.length-1;row++)for(let i=0;i<steps;i++){
          const a=row*(steps+1)+i,b=a+steps+1;indices.push(a,a+1,b+1,a,b+1,b);
        }
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();attach(foot,geometry,material);
      }
      shoe(m.leather);shoe(m.dark,true);
      curve(foot,m.dark,[[f[0]-.035,.15,.14],[f[0],.177,.155],[f[0]+.035,.15,.14]],.0012);
      for(let row=0;row<4;row++){
        const y=.275-row*.022,x=f[0]-.006;
        strap(b,[[x-.014,y,.067],[x+.013,y-.012,.07]],.003,m.dark);
        strap(b,[[x+.014,y,.067],[x-.013,y-.012,.07]],.003,m.dark);
      }
    }
    if(plate){
      // Smooth elliptical metal over the torso suppresses skin-shaped dents.
      const profile=[[1.02,.153,.113],[1.09,.141,.111],[1.17,.149,.118],[1.26,.180,.128],[1.34,.190,.112],[1.43,.145,.075]];
      const cross=y=>{let i=1;while(i<profile.length-1&&y>profile[i][0])i++;const a=profile[i-1],b=profile[i],t=THREE.MathUtils.clamp((y-a[0])/(b[0]-a[0]),0,1);return [THREE.MathUtils.lerp(a[1],b[1],t),THREE.MathUtils.lerp(a[2],b[2],t)];};
      const metalShape=p=>{const [rx,rz]=cross(p[1]),angle=Math.atan2(p[0]/rx,(p[2]-.027)/rz);p[0]=Math.sin(angle)*rx;p[2]=Math.cos(angle)*rz+.027;if(p[2]>.027)p[2]+=.008*(1-Math.abs(Math.sin(angle)));};
      shell(m.steel,torso,.009,metalShape,cut(1.025,1.42));
      // Rolled neck/arm edges, central ridge, overlapping abdominal lames.
      curve(bodybone,m.edge,[[-.125,1.41,.058],[-.083,1.42,.079],[0,1.405,.105],[.083,1.42,.079],[.125,1.41,.058]],.003);
      curve(bodybone,m.edge,[[0,1.41,.112],[0,1.29,.158],[0,1.20,.155],[0,1.09,.147]],.0017);
      for(let row=0;row<4;row++){
        const y=1.105-row*.027,[rx,rz]=cross(y),points=[];
        for(let i=0;i<=28;i++){const a=i/28*Math.PI*2;points.push([Math.sin(a)*(rx+.005),y,Math.cos(a)*(rz+.004)+.027]);}
        curve(bodybone,row%2?m.edge:m.steel,points,.008);
        for(const sign of [-1,1])rivet(bodybone,[sign*.084,y,.127],.0025);
      }
      // Delicate incised lines make the cuirass legible without bulky ornaments.
      for(const s of [-1,1]){
        curve(bodybone,m.trim,[[s*.03,1.39,.123],[s*.06,1.30,.15],[s*.056,1.22,.15],[s*.025,1.16,.148]],.0011);
        strap(bodybone,[[s*.127,1.35,.113],[s*.136,1.31,.12]],.015,m.dark);
        box(bodybone,m.trim,[s*.132,1.322,.129],[.019,.025,.004]);
      }
    }else{
      const sleeves=mail&&kind!=='chain-shirt'||kind==='scale-mail';
      if(female){bodice(coat,1.025,1.43);if(sleeves)shell(coat,arms,.012,null,cut(1.025,1.43));}
      else shell(coat,(p,b)=>torso(p,b)||sleeves&&arms(p,b),.012,null,cut(1.025,1.43));
      if(['chain-mail','ring-mail','scale-mail','hide'].includes(kind))shell(coat,legs,.015,null,cut(.84,1.05));
      if(leather){
        for(const s of [-1,1]){
          curve(bodybone,m.dark,[[s*.115,1.385,.068],[s*.135,1.31,.104],[s*.105,1.21,.124],[s*.103,1.08,.106]],.0015);
          for(let i=0;i<18;i++){const y=1.11+i*.014,z=.117+Math.sin(i/18*Math.PI)*.012;curve(bodybone,m.linen,[[s*.10,y,z],[s*.106,y+.003,z]],.00075,3);}
        }
        strap(bodybone,[[-.121,1.373,.079],[-.059,1.28,.145],[.018,1.19,.145],[.102,1.075,.109]],.027);
        box(bodybone,m.trim,[.016,1.196,.156],[.035,.038,.006],-.58);
        if(kind==='studded-leather')for(const sign of [-1,1])for(let row=0;row<7;row++)for(let col=0;col<3;col++){
          const x=sign*(.035+col*.034),y=1.13+row*.032;rivet(bodybone,[x,y,.144-Math.abs(x)*.22],.0029);
        }
        if(kind==='hide'){
          const fur=mat('#ad9b7b');
          for(let i=0;i<38;i++){const a=i/38*Math.PI*2;curve(bodybone,i%3?coat:fur,[[Math.sin(a)*.095,1.40,Math.cos(a)*.073],[Math.sin(a)*.126,1.375,Math.cos(a)*.09],[Math.sin(a)*.141,1.349,Math.cos(a)*.096]],.006,5);}
        }
      }
      if(kind==='scale-mail'){
        // Embossed, overlapping metal scales, fitted around the curved chest.
        for(const front of [-1,1])for(let row=0;row<11;row++)for(let col=-5;col<=5;col++){
          const x=col*.025+(row%2)*.0125,y=1.36-row*.026;if(Math.abs(x)>.13)continue;
          const [rx,f,b]=female?femaleTorsoProfile(y):[.19,.155,-.101];
          const z=(f+b)/2+front*((f-b)/2*Math.sqrt(Math.max(0,1-(x/rx)**2))+.004);
          const shape=new THREE.Shape();shape.moveTo(-.011,.009);shape.lineTo(.011,.009);shape.lineTo(.010,-.007);shape.quadraticCurveTo(0,-.022,-.010,-.007);shape.closePath();
          const g=new THREE.ExtrudeGeometry(shape,{depth:.002,bevelEnabled:true,bevelSize:.001,bevelThickness:.001,bevelSegments:1,steps:1});g.translate(x,y,z);attach(bodybone,g,row%2?m.steel:m.edge);
        }
      }
    }
    // Belt, rectangular buckle, tongue, punched holes and a small utility pouch.
    band(bodybone,[0,1.034,.028],.152,.116,.027);
    for(const x of [-.016,.016])box(bodybone,m.trim,[x,1.035,.150],[.004,.029,.005]);
    for(const y of [1.021,1.049])box(bodybone,m.trim,[0,y,.150],[.035,.004,.005]);
    box(bodybone,m.edge,[0,1.035,.153],[.025,.003,.004]);
    for(let i=0;i<5;i++)rivet(bodybone,[.031+i*.012,1.034,.147-i*.003],.0013);
    sphere(bodybone,m.leather,[-.132,1.002,-.015],[.034,.042,.025]);
    curve(bodybone,m.dark,[[-.16,1.02,.003],[-.132,1.012,.016],[-.106,1.019,.004]],.002);rivet(bodybone,[-.132,1.01,.015],.003);
    for(const side of ['L','R']){
      const sign=side==='L'?1:-1,upper=`upperarm01.${side}`,elbow=`lowerarm01.${side}`,knee=`lowerleg01.${side}`;
      const elbowPos=definitions.get(elbow).head,kneePos=definitions.get(knee).head,shoulder=definitions.get(upper).head;
      shell(plate?m.steel:m.leather,(p,b)=>b.endsWith(`.${side}`)&&/^lowerarm/.test(b),.010,null,cut(1.09,1.158));
      if(['plate','half-plate','splint'].includes(kind)){
        shell(m.steel,p=>p[0]*sign>0&&Math.abs(p[0])<.25&&p[1]<.60,.012,null,cut(.24,.53));
        for(const [y,rx,rz] of [[.53,.047,.043],[.24,.033,.032]]){
          const t=(.569-y)/(.569-.181),x=THREE.MathUtils.lerp(kneePos[0],definitions.get(`foot.${side}`).head[0],t),points=[];
          for(let i=0;i<=28;i++){const a=i/28*Math.PI*2;points.push([x+Math.sin(a)*rx,y,.024+Math.cos(a)*rz]);}
          curve(knee,m.edge,points,.0019);
        }
        curve(knee,m.edge,[[kneePos[0],.515,.073],[kneePos[0]+sign*.018,.40,.073],[kneePos[0]+sign*.029,.26,.059]],.0014);
        sphere(knee,m.steel,[kneePos[0],kneePos[1],kneePos[2]+.034],[.041,.041,.029]);
        curve(knee,m.edge,[[kneePos[0]-.031,kneePos[1]+.01,kneePos[2]+.05],[kneePos[0],kneePos[1]+.023,kneePos[2]+.061],[kneePos[0]+.031,kneePos[1]+.01,kneePos[2]+.05]],.002);
      }
      if(['plate','half-plate'].includes(kind)){
        const cap=new THREE.SphereGeometry(1,28,18,0,Math.PI*2,0,Math.PI*.64);cap.scale(.074,.038,.067);cap.translate(shoulder[0]+sign*.019,shoulder[1]+.014,shoulder[2]);attach(upper,cap,m.steel);
        const rim=[];for(let i=0;i<=32;i++){const a=i/32*Math.PI*2;rim.push([shoulder[0]+sign*.019+Math.sin(a)*.067,shoulder[1]-.0022,shoulder[2]+Math.cos(a)*.0606]);}curve(upper,m.edge,rim,.0023);
        for(let row=0;row<3;row++){
          const center=[shoulder[0]+sign*(.019+row*.014),shoulder[1]-.008-row*.017,shoulder[2]],points=[];
          for(let i=0;i<=16;i++){const a=i/16*Math.PI;points.push([center[0]+sign*Math.sin(a)*.043,center[1]+Math.cos(a)*.033,center[2]+Math.cos(a)*.045]);}
          curve(upper,m.edge,points,.003);
        }
        for(const z of [-.026,.058])rivet(upper,[shoulder[0]+sign*.038,shoulder[1]-.01,z],.003);
      }
      if(kind==='plate'){
        shell(m.steel,p=>p[0]*sign>0&&Math.abs(p[0])<.25&&p[1]<.95,.012,null,cut(.63,.87));
        shell(m.steel,(p,b)=>b.endsWith(`.${side}`)&&/^upperarm/.test(b),.012,null,cut(1.225,1.29));
        sphere(elbow,m.steel,[elbowPos[0],elbowPos[1],elbowPos[2]],[.032,.036,.038]);
        shell(m.steel,(p,b)=>b.endsWith(`.${side}`)&&/^(wrist|finger|metacarpal)/.test(b),.0025);
      }
      if(kind==='splint'){
        for(let j=-2;j<=2;j++){
          const x=kneePos[0]+j*.013;curve(knee,m.edge,[[x,.50,.058],[x,.38,.06],[x,.26,.045]],.005,12);
        }
      }
    }
  }
  function weapon(side,type){
    const name=`wrist.${side}`,bone=byName.get(name),hand=definitions.get(name),g=new THREE.Group();
    const grip=posePlan.arms[side].grip;
    g.position.copy(grip.center).sub(grip.wrist);g.quaternion.copy(grip.quaternion);bone.add(g);
    g.userData.attachment='weapon';g.userData.hand=side;
    const add=(geo,mat)=>{const mesh=new THREE.Mesh(geo,mat);g.add(mesh);return mesh;};
    const length=type==='great'?.68:type==='short'?.34:type==='rapier'?.59:.51,width=type==='great'?.031:type==='rapier'?.009:.021;
    const section=(y,w,z)=>[-w,y,0,0,y,z,w,y,0,0,y,-z];
    const vertices=[...section(-.07,width,.005),...section(-.07-length*.78,width*.73,.004),0,-.07-length,0],faces=[];
    for(let i=0;i<4;i++){const j=(i+1)%4;faces.push(i,j,j+4,i,j+4,i+4,i+4,j+4,8);}
    if(type==='curved')for(let i=0;i<vertices.length;i+=3)vertices[i]+=.06*((vertices[i+1]+.07)/length)**2;
    const blade=new THREE.BufferGeometry();blade.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));blade.setIndex(faces);blade.computeVertexNormals();add(blade,m.edge);
    // A visible recessed fuller runs along each face of broad blades.
    if(type!=='rapier')for(const s of [-1,1]){
      const shape=new THREE.Shape();shape.moveTo(-.0025,-.10);shape.lineTo(.0025,-.10);shape.lineTo(.0012,-length*.72);shape.lineTo(-.0012,-length*.72);shape.closePath();
      const groove=new THREE.ShapeGeometry(shape);groove.translate(0,0,s*.0052);if(s<0)groove.rotateY(Math.PI);add(groove,m.steel);
    }
    const gripGeometry=new THREE.CylinderGeometry(.012,.010,type==='great'?.15:.105,16);add(gripGeometry,m.dark);
    const wraps=[];for(let i=0;i<110;i++){const a=i/110*Math.PI*18;wraps.push(new THREE.Vector3(Math.cos(a)*.0122,-.046+i/110*.096,Math.sin(a)*.0122));}
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wraps),130,.0013,4,false),m.leather);
    const guard=new THREE.CatmullRomCurve3([new THREE.Vector3(-.093,-.087,.004),new THREE.Vector3(-.067,-.061,0),new THREE.Vector3(0,-.06,0),new THREE.Vector3(.067,-.061,0),new THREE.Vector3(.093,-.087,.004)]);
    add(new THREE.TubeGeometry(guard,32,.007,8,false),m.trim);
    for(const x of [-.093,.093]){const end=new THREE.SphereGeometry(.009,12,8);end.translate(x,-.087,.004);add(end,m.trim);}
    const pommel=new THREE.SphereGeometry(1,18,12);pommel.scale(.019,.023,.013);pommel.translate(0,.067,0);add(pommel,m.steel);
    const jewel=new THREE.SphereGeometry(.006,10,8);jewel.translate(0,.067,.012);add(jewel,m.trim);
    if(type==='rapier'){
      const ring=new THREE.TorusGeometry(.034,.003,6,32);ring.rotateX(.65);ring.translate(0,-.035,.018);add(ring,m.trim);
    }
    g.name='detailed-sword';
  }
  for(const side of ['R','L'])if(posePlan.arms[side].weapon)weapon(side,posePlan.arms[side].weapon);
  if(config.shield){
    const side=posePlan.shieldSide,arm=posePlan.arms[side],bone=byName.get(`lowerarm01.${side}`),g=new THREE.Group();
    const hand=arm.grip.center.clone().sub(arm.wrist).applyQuaternion(arm.wristQ).add(arm.target);
    const center=arm.joint.clone().lerp(hand,.55);
    const normal=arm.grip.normal.clone().applyQuaternion(arm.wristQ).normalize(),upAxis=new THREE.Vector3(0,1,0);upAxis.addScaledVector(normal,-upAxis.dot(normal)).normalize();
    const acrossAxis=new THREE.Vector3().crossVectors(upAxis,normal),shieldQ=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(acrossAxis,upAxis,normal)),shieldInverse=shieldQ.clone().invert();
    // The curved wooden back clears the forearm, bracer and folded fingers.
    // Evaluate the actual shield curvature at their X positions, not a guessed
    // offset at its center, so switching hands does not mirror a collision.
    const backDepth=x=>.007+Math.max(0,1-(x/.16)**2)*.037;
    const clearance=Math.max(...[[arm.joint,.038],[arm.target,.033],[hand,.022]].map(([p,r])=>{const q=p.clone().sub(center).applyQuaternion(shieldInverse);return q.z+r+.006-backDepth(q.x);}));
    center.addScaledVector(normal,clearance);
    const inverse=arm.lowerQ.clone().invert();g.position.copy(center).sub(arm.joint).applyQuaternion(inverse);g.quaternion.copy(inverse).multiply(shieldQ);bone.add(g);g.name='detailed-shield';g.userData.attachment='shield';g.userData.hand=side;
    const wood=mat('#50402f'),paint=mat('#314d59',.32,.48),rear=mat('#342c24');texture(wood,'leather');
    const outline=[[-.145,.19],[.145,.19],[.153,.12],[.128,-.08],[.076,-.185],[0,-.24],[-.076,-.185],[-.128,-.08],[-.153,.12]];
    const curveZ=x=>.025+Math.max(0,1-(x/.16)**2)*.037;
    const front=[],back=[],ix=[];front.push(0,0,curveZ(0));back.push(0,0,curveZ(0)-.018);
    for(const [x,y] of outline){front.push(x,y,curveZ(x));back.push(x,y,curveZ(x)-.018);}
    for(let i=1;i<=outline.length;i++)ix.push(0,i,i===outline.length?1:i+1);
    const face=(positions,mat,reverse=false)=>{const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(reverse?ix.toReversed():ix);geo.computeVertexNormals();g.add(new THREE.Mesh(geo,mat));};
    face(front,paint,true);face(back,wood);
    const line=(points,r,mat)=>{const geo=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),points.length*6,r,6,false);g.add(new THREE.Mesh(geo,mat));};
    const rim=[...outline,outline[0]].map(([x,y])=>[x,y,curveZ(x)-.002]);line(rim,.009,m.steel);
    line([...outline,outline[0]].map(([x,y])=>[x*.94,y*.95,curveZ(x*.94)+.002]),.002,m.trim);
    for(let x=-.12;x<=.12;x+=.04)line([[x,.17,curveZ(x)-.0185],[x,-.16+Math.abs(x)*.7,curveZ(x)-.0185]],.0015,rear);
    for(const [x,y] of outline){const r=new THREE.SphereGeometry(.0037,8,6);r.scale(1,1,.5);r.translate(x*.91,y*.91,curveZ(x*.91)+.004);g.add(new THREE.Mesh(r,m.trim));}
    // Back straps and hand grip are modeled too, visible when orbiting the token.
    const forearm=arm.target.clone().sub(arm.joint).applyQuaternion(shieldInverse).normalize(),up=new THREE.Vector3(0,1,0).addScaledVector(forearm,-forearm.y).normalize(),out=new THREE.Vector3().crossVectors(forearm,up).normalize();
    for(const t of [.23,.66]){
      const p=arm.joint.clone().lerp(arm.target,t).sub(center).applyQuaternion(shieldInverse),points=[],radius=t<.5?(armored?.054:.048):(armored?.044:.033);
      for(let i=0;i<=28;i++){const a=i/28*Math.PI*2;points.push(p.clone().addScaledVector(up,Math.cos(a)*radius).addScaledVector(out,Math.sin(a)*radius).toArray());}
      line(points,.006,m.leather);
      const strap=new THREE.Object3D();strap.name='shield-forearm-strap';strap.position.copy(p);strap.userData.radius=radius;g.add(strap);
      for(const sign of [-1,1])line([[p.x+sign*(radius+.003),p.y,.026],[p.x+sign*radius,p.y,p.z]],.006,m.leather);
    }
    const handle=hand.sub(center).applyQuaternion(shieldInverse);
    line([[handle.x,handle.y-.045,.023],[handle.x,handle.y-.034,handle.z],[handle.x,handle.y+.034,handle.z],[handle.x,handle.y+.045,.023]],.006,m.dark);
    const marker=new THREE.Object3D();marker.name='shield-hand-grip';marker.position.copy(handle);g.add(marker);
    line([[0,.154,.066],[0,-.13,.066]],.005,m.trim);line([[-.104,.067,.05],[.104,.067,.05]],.005,m.trim);
    const boss=new THREE.SphereGeometry(1,24,12);boss.scale(.028,.028,.011);boss.translate(0,.037,.07);g.add(new THREE.Mesh(boss,m.steel));
  }
}
