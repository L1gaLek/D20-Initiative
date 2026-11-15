import * as THREE from '../../vendor/three/three.module.mjs';

// Original modular miniature. Every part belongs to an articulated joint;
// equipment follows the same joints as skin during the walk cycle.
export function createHuman(config){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);
  root.userData.avatar=config;
  const mat=(color,metalness=0,roughness=.75)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
  const skin=mat('#b88b71'),shadow=mat('#926a58'),hair=mat(config.hairColor),eye=mat('#29302c'),white=mat('#bfb6a3');
  const hairLight=hair.clone();hairLight.color.offsetHSL(0,-.07,.055);
  const cloth=mat('#343942'),linen=mat('#c3b89c'),leather=mat('#65412b'),dark=mat('#30251e'),trim=mat('#b69857',.68,.34);
  const steel=mat('#879da9',.72,.34),edge=mat('#cbd7dc',.82,.23);
  const kind=config.armor,armored=kind!=='none';
  const metallic=['breastplate','half-plate','plate','splint'].includes(kind);
  const chain=['chain-shirt','chain-mail','ring-mail'].includes(kind);
  const coat=mat(kind==='hide'?'#8a6d4a':kind==='ring-mail'?'#52454a':kind==='leather'||kind==='studded-leather'?'#795236':'#788994',chain ? .5 : .15,chain ? .66 : .6);
  if(chain||kind==='scale-mail'){
    coat.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec3 armorPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\narmorPoint=position;');
      shader.fragmentShader='varying vec3 armorPoint;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        vec2 p=armorPoint.xy*${kind==='ring-mail'?'38.':'70.'};p.x+=mod(floor(p.y),2.)*.5;
        vec2 q=fract(p)-.5;float ring=1.-smoothstep(.07,.15,abs(length(q)-.31));
        diffuseColor.rgb*=.55+ring*.55;`);
    };
  }
  function mesh(parent,geometry,material,x=0,y=0,z=0,sx=1,sy=1,sz=1){
    const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);parent.add(m);return m;
  }
  const orb=(p,m,x,y,z,sx,sy,sz)=>mesh(p,new THREE.SphereGeometry(1,12,8),m,x,y,z,sx,sy,sz);
  const box=(p,m,x,y,z,sx,sy,sz)=>mesh(p,new THREE.BoxGeometry(1,1,1),m,x,y,z,sx,sy,sz);
  const tube=(p,m,x,y,z,r1,r2,h)=>mesh(p,new THREE.CylinderGeometry(r1,r2,h,12),m,x,y,z);
  function joint(parent,x,y,z){const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);return g;}
  // A shaped torso, shoulders and pelvis rather than a chess-piece cylinder.
  const torso=new THREE.LatheGeometry([[.13,.81],[.14,.88],[.15,.94],[.17,1.0],[.185,1.04],[.20,1.08],[.215,1.12],[.225,1.16],[.225,1.20],[.22,1.23],[.165,1.26],[.12,1.28]].map(p=>new THREE.Vector2(...p)),24);
  torso.scale(1,1,.65);
  if(!armored){const a=torso.attributes.position;for(let i=0;i<a.count;i++){
    const x=a.getX(i),y=a.getY(i),z=a.getZ(i);if(z>0){const muscle=.016*Math.exp(-(((Math.abs(x)-.09)/.085)**2)-(((y-1.145)/.065)**2));a.setZ(i,z+muscle);}
  }torso.computeVertexNormals();}
  mesh(body,torso,armored?(metallic?steel:coat):skin);
  orb(body,armored?cloth:skin,0,.83,0,.17,.13,.12);
  if(!armored){
    box(body,linen,0,.785,0,.32,.17,.24);
    for(const s of [-1,1])box(body,linen,s*.094,.72,0,.14,.14,.235);
    box(body,dark,0,.866,.002,.316,.022,.244);
  }else{
    box(body,leather,0,.868,.006,.34,.055,.255);box(body,trim,0,.87,.146,.065,.047,.023);
    const longCoat=['chain-mail','ring-mail','scale-mail','splint'].includes(kind);
    if(longCoat){const skirt=tube(body,coat,0,.775,0,.17,.23,.22);skirt.scale.z=.68;}
    if(metallic){
      box(body,edge,0,1.12,.152,.009,.245,.012);
      for(const s of [-1,1]){const rim=box(body,edge,s*.105,1.225,.106,.19,.018,.025);rim.rotation.z=s*.14;}
      for(let i=0;i<3;i++)box(body,i%2?steel:edge,0,.94-i*.037,.125,.30-i*.018,.035,.025);
    }
    if(kind==='hide'){
      for(let i=0;i<12;i++){const a=i/12*Math.PI*2;orb(body,linen,Math.sin(a)*.17,1.24+Math.cos(a)*.018,Math.cos(a)*.1,.059,.052,.046);}
    }
    if(kind==='studded-leather'){
      for(let row=0;row<4;row++)for(let col=0;col<5;col++)orb(body,trim,(col-2)*.07,1.19-row*.075,.147-Math.abs(col-2)*.009,.012,.012,.008);
    }
    if(kind==='scale-mail'){
      for(const back of [-1,1])for(let row=0;row<6;row++)for(let col=0;col<6;col++){
        const x=(col-2.5)*.057+(row%2)*.012;
        orb(body,row%2?steel:edge,x,1.19-row*.056,back*(.138-Math.abs(x)*.15),.035,.041,.012);
      }
    }
    if(kind==='splint')for(let i=-3;i<=3;i++)box(body,steel,i*.048,1.08,.15-Math.abs(i)*.007,.027,.32,.02);
    if(['leather','studded-leather','hide'].includes(kind)){
      const strap=box(body,dark,.08,1.09,.155,.038,.31,.018);strap.rotation.z=-.32;
    }
  }
  tube(body,skin,0,1.302,0,.067,.078,.1);
  const head=joint(body,0,1.43,0);
  const skull=new THREE.SphereGeometry(1,18,12),positions=skull.attributes.position;
  for(let i=0;i<positions.count;i++){
    const y=positions.getY(i),jaw=y<-.25?1+(y+.25)*.22:1;
    positions.setXYZ(i,positions.getX(i)*.11*jaw,y*.145+.008,Math.min(.078,positions.getZ(i)*.103));
  }
  skull.computeVertexNormals();mesh(head,skull,skin);
  for(const s of [-1,1]){
    orb(head,skin,s*.108,.005,0,.013,.028,.016);
    orb(head,white,s*.039,.025,.079,.020,.007,.002);
    orb(head,eye,s*.039,.025,.081,.006,.006,.001);
    const brow=box(head,hair,s*.039,.044,.080,.039,.008,.006);brow.rotation.z=-s*.1;
  }
  const nose=new THREE.BufferGeometry();nose.setAttribute('position',new THREE.Float32BufferAttribute([
    -.008,.027,.077,-.012,-.01,.079,0,-.008,.102, .008,.027,.077,0,-.008,.102,.012,-.01,.079,
    -.008,.027,.077,0,-.008,.102,.008,.027,.077, -.012,-.01,.079,.012,-.01,.079,0,-.008,.102
  ],3));nose.computeVertexNormals();mesh(head,nose,skin);
  box(head,shadow,0,-.049,.079,.035,.004,.002);
  // Hair caps stop above the eyebrows, keeping the face legible in every style.
  if(config.hair!=='bald'){
    const cap=new THREE.SphereGeometry(1,16,10,0,Math.PI*2,0,Math.PI*.44);
    mesh(head,cap,hair,0,.035,-.009,.119,.135,.113);
    if(config.hair==='short')for(let i=0;i<7;i++)orb(head,hair,(i-3)*.027,.135+Math.sin(i)*.006,.02,.031,.022,.072);
    if(config.hair==='parted')for(let i=0;i<6;i++){
      const lock=orb(head,hair,(i-2.5)*.031,.149-Math.abs(i-3)*.005,.027,.027,.038,.087);lock.rotation.z=-.18;
    }
    if(config.hair==='swept')for(let i=0;i<5;i++){
      const lock=orb(head,hair,(i-2)*.038,.155,-.025,.029,.045,.11);lock.rotation.x=.2;
    }
    if(config.hair==='tied'){
      for(const s of [-1,1])orb(head,hair,s*.098,-.025,-.055,.036,.10,.057);
      orb(head,hair,0,-.045,-.12,.074,.08,.06);tube(head,trim,0,-.078,-.141,.035,.035,.025);
      const tail=orb(head,hair,0,-.18,-.14,.045,.12,.042);tail.rotation.x=-.25;
    }
    if(config.hair==='mohawk'){
      // Close-cropped sides with a raised central ridge.
      for(let i=0;i<6;i++)orb(head,hair,0,.15-Math.abs(i-2)*.014,(i-2)*.034,.031,.076,.037);
    }
    for(let i=0;i<13;i++){
      const phi=i/13*Math.PI*2,points=[];
      for(let j=0;j<9;j++){const t=.18+j*.145;points.push(new THREE.Vector3(Math.sin(phi)*Math.sin(t)*.121,.035+Math.cos(t)*.137,Math.cos(phi)*Math.sin(t)*.115-.009));}
      mesh(head,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),10,.0017,3,false),hairLight);
    }
  }
  const legs=[],arms=[],knees=[],elbows=[];
  for(const s of [-1,1]){
    const hip=joint(body,s*.102,.806,0);legs.push(hip);
    orb(hip,armored?cloth:skin,0,-.155,0,.085,.19,.08);
    const knee=joint(hip,0,-.32,0);knees.push(knee);
    orb(knee,armored?cloth:skin,0,-.145,0,.065,.16,.065);
    orb(knee,armored?leather:skin,0,-.302,.042,.071,.046,.119);
    if(armored){tube(knee,leather,0,-.23,0,.072,.064,.16);box(knee,dark,0,-.324,.052,.139,.024,.21);}
    if(['half-plate','plate','splint'].includes(kind)){
      orb(knee,steel,0,-.005,.058,.081,.065,.04);
      const greave=orb(knee,steel,0,-.17,.044,.069,.14,.042);
      if(kind==='splint')for(let i=-1;i<=1;i++)box(knee,edge,i*.04,-.15,.078,.02,.23,.015);
      if(kind==='plate')orb(hip,steel,0,-.13,.047,.082,.14,.054);
      greave.rotation.x=-.035;
    }
    const shoulder=joint(body,s*.231,1.225,0);arms.push(shoulder);shoulder.rotation.z=s*.08;
    orb(shoulder,skin,0,-.036,0,.081,.10,.079);
    orb(shoulder,armored&&['chain-mail','ring-mail','scale-mail'].includes(kind)?coat:skin,0,-.14,0,.067,.14,.064);
    const elbow=joint(shoulder,0,-.262,0);elbows.push(elbow);
    orb(elbow,skin,0,-.117,.006,.056,.135,.055);orb(elbow,skin,0,-.246,.008,.052,.065,.041);
    if(armored)tube(elbow,metallic?steel:leather,0,-.14,0,.062,.05,.15);
    if(['half-plate','plate'].includes(kind)){
      orb(shoulder,steel,s*.025,-.014,0,.112,.057,.10);
      if(kind==='plate'){orb(shoulder,edge,s*.036,-.052,.005,.107,.029,.098);tube(shoulder,steel,0,-.15,0,.075,.06,.17);orb(elbow,steel,0,-.25,.008,.057,.059,.047);}
    }
  }
  function sword(parent,type){
    const g=joint(parent,0,-.247,.026);g.rotation.x=-.20;g.rotation.z=parent===elbows[1]?-.10:.10;
    const length=type==='great'?.68:type==='short'?.36:type==='rapier'?.59:.52;
    tube(g,dark,0,-.022,0,.025,.025,.13);orb(g,trim,0,.058,0,.037,.028,.033);
    box(g,trim,0,-.09,0,type==='great'?.22:.17,.031,.04);
    const blade=new THREE.Shape();const w=type==='rapier'?.018:type==='great'?.045:.032;
    blade.moveTo(-w,0);blade.lineTo(w,0);blade.lineTo(type==='curved'?.09:w*.65,-length*.8);blade.lineTo(type==='curved'?.055:0,-length);blade.lineTo(-w*.7,-length*.8);blade.closePath();
    mesh(g,new THREE.ExtrudeGeometry(blade,{depth:.012,bevelEnabled:true,bevelThickness:.005,bevelSize:.005,bevelSegments:1,steps:1}),edge,0,-.108,0);
  }
  // +X is the figure's left side when facing +Z.
  if(config.right)sword(elbows[0],config.right);if(config.left)sword(elbows[1],config.left);
  if(config.shield){
    const g=joint(elbows[1],.025,-.12,.07);g.rotation.y=-.34;
    const shape=new THREE.Shape();shape.moveTo(-.18,.20);shape.lineTo(.18,.20);shape.lineTo(.16,-.08);shape.quadraticCurveTo(.12,-.19,0,-.26);shape.quadraticCurveTo(-.12,-.19,-.16,-.08);shape.closePath();
    const shieldGeometry=new THREE.ExtrudeGeometry(shape,{depth:.035,bevelEnabled:true,bevelThickness:.012,bevelSize:.014,bevelSegments:1,steps:1});
    mesh(g,shieldGeometry,steel);box(g,trim,0,-.005,.056,.036,.37,.012);box(g,trim,0,.1,.057,.30,.027,.012);orb(g,trim,0,.015,.066,.046,.046,.018);
    elbows[1].rotation.x=-.3;
  }
  // Merge static siblings by material on each joint to bound draw calls. Joints
  // remain separate so animation never needs geometry uploads or skin textures.
  function batch(group){
    for(const child of [...group.children])if(child.isGroup)batch(child);
    const groups=new Map();for(const m of group.children.filter(c=>c.isMesh)){if(!groups.has(m.material))groups.set(m.material,[]);groups.get(m.material).push(m);}
    for(const [material,meshes] of groups){
      const parts=meshes.map(m=>{m.updateMatrix();const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();g.applyMatrix4(m.matrix);return g;});
      const merged=new THREE.BufferGeometry();for(const key of ['position','normal']){
        const buffer=new Float32Array(parts.reduce((n,g)=>n+g.attributes[key].array.length,0));let offset=0;
        for(const g of parts){buffer.set(g.attributes[key].array,offset);offset+=g.attributes[key].array.length;}
        merged.setAttribute(key,new THREE.BufferAttribute(buffer,3));
      }
      for(const m of meshes){group.remove(m);m.geometry.dispose();}for(const p of parts)p.dispose();group.add(new THREE.Mesh(merged,material));
    }
  }
  batch(root);
  // Materials constructed for an unequipped module have no GPU allocation, but
  // release them too so repeated equipment previews leave no retained resources.
  const used=new Set();root.traverse(o=>{if(o.material)used.add(o.material);});
  for(const m of [skin,shadow,hair,hairLight,eye,white,cloth,linen,leather,dark,trim,steel,edge,coat])if(!used.has(m))m.dispose();
  let phase=0;
  root.userData.pose=(distance=0,moving=false)=>{
    phase+=distance*11;const stride=moving?Math.sin(phase):0;root.userData.walkAngle=stride*.48;
    legs.forEach((g,i)=>{const sign=i?1:-1;g.rotation.x=stride*.48*sign;knees[i].rotation.x=moving?Math.max(0,-stride*sign)*.62:0;});
    arms.forEach((g,i)=>{g.rotation.x=-stride*.30*(i?1:-1);elbows[i].rotation.x=(i===1&&config.shield?-.3:-.09)-Math.abs(stride)*.08;});
    body.position.y=moving?Math.abs(Math.sin(phase))*.024:0;body.rotation.y=moving?stride*.035:0;
  };
  root.userData.pose(0,false);return root;
}
