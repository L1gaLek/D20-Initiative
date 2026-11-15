import * as THREE from '../../vendor/three/three.module.mjs';

export function femaleTorsoProfile(y){
  return interpolate([[1.025,.137,.151,-.037],[1.10,.124,.155,-.031],[1.14,.127,.160,-.032],[1.18,.132,.166,-.035],[1.22,.145,.180,-.047],[1.26,.154,.185,-.062],[1.30,.161,.164,-.074],[1.34,.165,.136,-.077],[1.38,.170,.110,-.076],[1.405,.135,.087,-.060],[1.43,.068,.083,-.037]],y);
}
function interpolate(rows,y){
  let i=1;while(i<rows.length-1&&y>rows[i][0])i++;
  const a=rows[i-1],b=rows[i],t=THREE.MathUtils.clamp((y-a[0])/(b[0]-a[0]),0,1);
  return [1,2,3].map(k=>THREE.MathUtils.lerp(a[k],b[k],t));
}
const maleProfile=y=>interpolate([[1.025,.143,.136,-.068],[1.10,.136,.136,-.060],[1.18,.146,.144,-.074],[1.26,.172,.154,-.085],[1.34,.179,.139,-.086],[1.38,.178,.119,-.080],[1.405,.140,.101,-.068],[1.43,.071,.088,-.052]],y);

// Each armor has a distinct construction, not just a different paint on the
// same breastplate. Rigid fittings are batched with the main skeleton later.
export function dressArmor({config,materials:m,definitions,surface,attach,sphere,curve,texture,female}){
  const kind=config.armor||'none',armored=kind!=='none';
  const plate=['breastplate','half-plate','plate'].includes(kind),mail=['chain-shirt','chain-mail','ring-mail'].includes(kind),scale=kind==='scale-mail',splint=kind==='splint';
  const light=['leather','studded-leather','hide'].includes(kind),full=kind==='plate';
  const mat=(color,metalness=0,roughness=.65)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
  const colors={leather:'#805035','studded-leather':'#512f2b',hide:'#9e8561','chain-shirt':'#939fa6','chain-mail':'#8797a2','ring-mail':'#54352d','scale-mail':'#687a77',splint:'#543c2c'};
  const coat=mat(colors[kind]||'#4b5058',mail&&kind!=='ring-mail'||scale?.78:.02,mail?.42:.68);
  const lining=mat(kind==='hide'?'#c4b18b':'#49494a');texture(lining,'linen');
  if(light||splint||kind==='ring-mail')texture(coat,'leather');
  if(mail&&kind!=='ring-mail'){
    coat.customProgramCacheKey=()=>`woven-mail-v2-${kind}`;
    coat.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec3 armorPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\narmorPoint=position;');
      shader.fragmentShader='varying vec3 armorPoint;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        vec2 mailUV=vec2(atan(armorPoint.x,armorPoint.z-.025)*.145,armorPoint.y)*178.;
        mailUV.x+=mod(floor(mailUV.y),2.)*.5;
        vec2 link=fract(mailUV)-.5;
        float wire=1.-smoothstep(.045,.11,abs(length(link*vec2(1.,1.28))-.33));
        float mailHeight=wire*.00065;
        diffuseColor.rgb*=.23+wire*.88;
      `).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=.35+(1.-wire)*.35;')
        .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
          vec3 mailX=dFdx(-vViewPosition),mailY=dFdy(-vViewPosition);
          vec3 mailR1=cross(mailY,normal),mailR2=cross(normal,mailX);
          float mailDet=dot(mailX,mailR1);
          normal=normalize(abs(mailDet)*normal-sign(mailDet)*(dFdx(mailHeight)*mailR1+dFdy(mailHeight)*mailR2));
        `);
    };
  }
  const profile=female?femaleTorsoProfile:maleProfile,bone='spine03',tau=Math.PI*2;
  const torso=([x,y],b)=>y>1.0&&y<1.44&&Math.abs(x)<.195&&!/arm|finger|wrist/.test(b);
  const legs=([x,y])=>y<1.06&&Math.abs(x)<.25;
  const arm=(p,b)=>/^(upperarm|lowerarm)/.test(b);
  const cut=(min,max)=>[p=>p[1]-min,p=>max-p[1]];
  function shell(material,predicate,offset=.009,deform,clips=[]){const mesh=surface(material,predicate,offset,deform,clips);if(mesh)mesh.name=`armor-${kind}`;return mesh;}
  function point(y,a,extra=0){const [rx,front,back]=profile(y);return [Math.sin(a)*(rx+extra),y,(front+back)/2+Math.cos(a)*((front-back)/2+extra)];}
  const pvec=p=>new THREE.Vector3(...p);
  function add(geometry,material,parent=bone){return attach(parent,geometry,material);}
  function line(points,material=m.edge,r=.002,parent=bone){return curve(parent,material,points,r,Math.max(10,points.length*3));}
  function stud(p,r=.0026,parent=bone,material=m.trim){const g=new THREE.SphereGeometry(1,8,5);g.scale(r,r,r*.65);g.translate(...p);add(g,material,parent);}
  function loop(y,material=m.leather,r=.003,extra=.008,parent=bone){line(Array.from({length:65},(_,i)=>point(y,i/64*tau,extra)),material,r,parent);}
  function ribbon(points,width=.018,material=m.leather,parent=bone){
    const positions=[],indices=[];
    for(let i=0;i<points.length;i++){
      const p=pvec(points[i]),t=pvec(points[Math.min(i+1,points.length-1)]).sub(pvec(points[Math.max(0,i-1)])),side=new THREE.Vector3(-t.y,t.x,0).normalize().multiplyScalar(width/2);
      for(const z of [-.0015,.0015])for(const sign of [-1,1])positions.push(...p.clone().addScaledVector(side,sign).add(new THREE.Vector3(0,0,z)));
      if(i){const a=(i-1)*4,b=i*4;indices.push(a,a+1,b,a+1,b+1,b,a+2,b+2,a+3,a+3,b+2,b+3,a,b,a+2,a+2,b,b+2,a+1,a+3,b+1,a+3,b+3,b+1);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();add(g,material,parent);
  }
  function buckle(p,width=.026,height=.03,parent=bone){
    const [x,y,z]=p;line([[x-width/2,y-height/2,z],[x-width/2,y+height/2,z],[x+width/2,y+height/2,z],[x+width/2,y-height/2,z],[x-width/2,y-height/2,z]],m.trim,.002,parent);line([[x-width/2,y,z+.001],[x+width*.35,y,z+.001]],m.edge,.0014,parent);
  }
  const min=female?(plate?1.105:1.085):1.026,max=female?1.342:1.408;
  const top=a=>max-(female?.026:.015)*Math.max(0,Math.cos(a))**4;
  function garment(material,low=min,high=top,extra=.009,range=[0,tau],name='torso'){
    const positions=[],indices=[],rows=24,segments=Math.ceil((range[1]-range[0])/tau*72);
    for(let row=0;row<=rows;row++)for(let col=0;col<=segments;col++){
      const a=range[0]+col/segments*(range[1]-range[0]),bottom=typeof low==='function'?low(a):low,t=typeof high==='function'?high(a):high,y=THREE.MathUtils.lerp(bottom,t,row/rows);positions.push(...point(y,a,extra));
    }
    for(let row=0;row<rows;row++)for(let col=0;col<segments;col++){const a=row*(segments+1)+col,b=a+segments+1;indices.push(a,a+1,b,a+1,b+1,b);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();const mesh=add(g,material);mesh.name=`armor-${kind}-${female?'female':'male'}-${name}`;return mesh;
  }
  function edge(high=top,material=m.edge,r=.0025,extra=.012){line(Array.from({length:73},(_,i)=>{const a=i/72*tau;return point(typeof high==='function'?high(a):high,a,extra);}),material,r);}
  function link(y,a,r=.006,material=m.steel){
    const g=new THREE.TorusGeometry(r,.00115,5,12);g.rotateY(a);g.translate(...point(y,a,.013));add(g,material);
  }
  // Underwear stays opaque in all views; open female armor uses its own fitted
  // bodice, exposed shoulders/waist and short split skirts over the same shorts.
  shell(armored?(female?m.leather:m.cloth):m.linen,legs,.008,p=>{if(p[1]>.82&&p[1]<.99){p[0]*=1.025;p[2]*=1.04;}},cut(armored?(female?.86:.24):.82,1.04));
  if(!armored){
    if(female){garment(m.linen,1.155,1.36,.005);edge(1.155,m.linen,.0024,.006);edge(1.36,m.linen,.0024,.006);}
    for(const s of female?[-1,1]:[])ribbon([[s*.085,1.345,.12],[s*.104,1.415,.04],[s*.103,1.39,-.052],[s*.085,1.35,-.061]],.012,m.linen);
    return;
  }
  if(!female){shell(lining,(p,b)=>arm(p,b)||torso(p,b)&&p[1]>1.385,.006,null,cut(1.025,1.43));}
  if(plate){
    garment(m.steel,min,top,.016);edge(top,m.edge,.0035,.018);edge(min,m.edge,.003,.018);
    // A raised medial ridge, gothic flutes and recessed brass border on the
    // actual fitted surface give steel a manufactured, rigid silhouette.
    for(const a of [0,-.26,.26,-.53,.53])line([min+.015,min+.07,1.23,1.29,top(a)-.015].filter(y=>y>min&&y<top(a)).map(y=>point(y,a,.019)),a?m.edge:m.steel,a?.0013:.003);
    for(const s of [-1,1]){
      line([[s*.030,1.28,point(1.28,.2,.02)[2]],[s*.064,1.245,point(1.245,.42,.02)[2]],[s*.075,1.20,point(1.20,.55,.02)[2]]],m.trim,.0012);
      for(const y of [min+.025,1.22,1.29])stud(point(y,s*1.12,.02),.003);
    }
    for(let row=0;row<(female?2:4);row++){const y=min+.012+row*.022;loop(y,row%2?m.edge:m.steel,.007,.02);}
  }else{
    garment(coat,min,top,.011);edge(top,light?m.dark:m.edge,.003,.013);edge(min,light?m.dark:m.edge,.003,.013);
    if(light||splint||kind==='ring-mail'){
      if(light)for(const range of [[.70,1.32],[tau-1.32,tau-.70]])garment(m.leather,min+.003,a=>top(a)-.003,.0125,range,'side-panel');
      // Double stitched, inset panels and a laced center seam remain readable
      // at portrait distance; the color is not doing the work alone.
      for(const a of [-1.12,-.66,.66,1.12,Math.PI]){
        const ys=Array.from({length:18},(_,i)=>min+.008+i/17*(top(a)-min-.016));line(ys.map(y=>point(y,a,.014)),m.dark,.0015);
        for(const y of ys)line([point(y,a-.017,.015),point(y+.003,a+.017,.015)],m.linen,.0008);
      }
      if(light)for(let i=0;i<8;i++){const y=min+.025+i*.022;if(y>top(0)-.015)break;for(const s of [-1,1])line([point(y,s*.10,.015),point(y+.013,-s*.10,.015)],m.linen,.0013);}
    }
    if(kind==='studded-leather')for(let row=0;row<Math.ceil((max-min)/.031);row++)for(let col=0;col<26;col++){
      const a=(col+(row%2)*.5)/26*tau,y=min+.016+row*.031;if(y<top(a)-.012)stud(point(y,a,.016),.0034,bone,row%3?m.edge:m.trim);
    }
    if(kind==='hide'){
      for(let i=0;i<76;i++){
        const a=i/76*tau,y=top(a),p=point(y,a,.008),q=point(y-.032-(i%4)*.003,a,.019);
        line([p,q],i%3?coat:lining,.0035);
      }
      for(let i=0;i<20;i++){const a=i/20*tau;line([point(min+.016,a,.014),point(min-.018-(i%3)*.004,a+.035,.018)],coat,.005);}
    }
    if(mail){
      if(kind==='ring-mail'){
        for(let row=0;row<Math.ceil((max-min)/.023);row++)for(let col=0;col<28;col++){
          const a=(col+(row%2)*.5)/28*tau,y=min+.012+row*.023;if(y<top(a)-.01)link(y,a,.0092,col%4?m.steel:m.edge);
        }
      }else{
        // Real interlocking links at the hem and neckline complement the
        // normal-mapped weave over the rest of the mail, without per-link draws.
        for(let i=0;i<72;i++){const a=i/72*tau;link(min+.009,a,.0042);if(i%2===0)link(top(a)-.009,a,.0042);}
        if(!female&&kind==='chain-mail')shell(coat,arm,.013,null,cut(1.02,1.40));
        if(!female&&kind==='chain-shirt')shell(coat,arm,.013,null,cut(1.24,1.40));
      }
    }
    if(scale){
      for(let row=0;row<Math.ceil((max-min)/.021);row++)for(let col=0;col<32;col++){
        const a=(col+(row%2)*.5)/32*tau,y=max-.014-row*.021;if(y<min+.009||y>top(a)-.008)continue;
        const shape=new THREE.Shape();shape.moveTo(-.013,.011);shape.lineTo(.013,.011);shape.lineTo(.012,-.004);shape.quadraticCurveTo(0,-.024,-.012,-.004);shape.closePath();
        const g=new THREE.ExtrudeGeometry(shape,{depth:.0025,bevelEnabled:true,bevelSize:.0012,bevelThickness:.001,bevelSegments:1,curveSegments:3,steps:1});g.rotateY(a);g.translate(...point(y,a,.016));add(g,row%3?m.steel:m.edge);
        if(col%2===0)stud(point(y+.006,a,.022),.0018);
      }
    }
    if(splint){
      for(let col=0;col<24;col++){
        const a=col/24*tau;garment(col%3?m.steel:m.edge,min+.006,x=>top(x)-.008,.018,[a+.025,a+tau/24-.025],'splint');
        for(const y of [min+.027,1.20,1.29])if(y<top(a)-.01)stud(point(y,a+tau/48,.023),.0023);
      }
      for(const y of [min+.055,1.245])loop(y,m.leather,.007,.023);
    }
  }
  // Shoulder straps have front and back anchors, rather than floating cords.
  if(female||light||splint)for(const s of [-1,1]){
    ribbon([[s*.108,1.29,point(1.29,s*.72,.014)[2]],[s*.129,1.365,.097],[s*.124,1.414,.02],[s*.123,1.375,-.055],[s*.108,1.30,-.075]],female?.017:.024,plate?m.leather:coat);
    buckle([s*.122,1.356,.108],.019,.025);
  }
  // Split tassets distinguish a cuirass from a full suit. Female cuts keep the
  // shoulder/waist/upper-leg openings; male suits retain their padded trousers.
  const skirtMat=plate?m.steel:coat,skirtMin=female?.87:mail?.83:.89;
  for(let col=0;col<12;col++){
    const a=col/12*tau;
    if(female&&(col===0||col===6))continue;
    const lo=skirtMin+(col%3)*.008,hi=1.025;
    // Hip sections use the pelvis, and do not stretch with either thigh.
    const pos=[],ix=[],segments=5;
    for(let row=0;row<=4;row++)for(let i=0;i<=segments;i++){
      const angle=a+.025+i/segments*(tau/12-.05),y=THREE.MathUtils.lerp(lo,hi,row/4),rx=THREE.MathUtils.lerp(female?.210:.200,female?.165:.155,row/4),rz=THREE.MathUtils.lerp(.155,.130,row/4);pos.push(Math.sin(angle)*rx,y,.026+Math.cos(angle)*rz);
    }
    for(let r=0;r<4;r++)for(let i=0;i<segments;i++){const x=r*(segments+1)+i,b=x+segments+1;ix.push(x,x+1,b,x+1,b+1,b);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(ix);g.computeVertexNormals();add(g,skirtMat,'root');
    const angle=a+tau/24;stud([Math.sin(angle)*(female?.168:.158),1.017,.026+Math.cos(angle)*.133],.0028,'root');
    const hem=Array.from({length:9},(_,i)=>{const v=a+.025+i/8*(tau/12-.05);return [Math.sin(v)*(female?.210:.200),lo,.026+Math.cos(v)*.155];});line(hem,plate?m.edge:m.dark,.0018,'root');
  }
  // Wide belt, framed buckle, tongue, punched holes and a stitched pouch.
  garment(m.leather,1.018,1.047,.015,[0,tau],'belt');edge(1.018,m.dark,.0015,.018);edge(1.047,m.dark,.0015,.018);buckle(point(1.033,0,.020),.038,.031);
  for(let i=0;i<6;i++)stud(point(1.033,.28+i*.10,.018),.0011,bone,m.dark);
  sphere('root',m.leather,[-.144,1.007,.018],[.035,.044,.025]);line([[-.17,1.022,.037],[-.144,1.011,.044],[-.115,1.022,.037]],m.dark,.0015,'root');stud([-.144,1.014,.046],.003,'root');
  for(const side of ['L','R']){
    const s=side==='L'?1:-1,upper=`upperarm01.${side}`,lower=`lowerarm01.${side}`,knee=`lowerleg01.${side}`,foot=`foot.${side}`;
    const shoulder=definitions.get(upper).head,elbow=definitions.get(lower).head,k=definitions.get(knee).head,f=definitions.get(foot).head;
    shell(plate?m.steel:m.leather,(p,b)=>b.endsWith(`.${side}`)&&/^lowerarm/.test(b),.012,null,cut(1.075,female?1.15:1.18));
    for(const y of [1.078,female?1.148:1.178])shell(plate?m.edge:m.dark,(p,b)=>b.endsWith(`.${side}`)&&/^lowerarm/.test(b),.0145,null,cut(y-.002,y+.002));
    const sections=[[-.058,.006,.155],[-.046,.035,.20],[0,.046,.239],[.05,.049,.22],[.10,.051,.193],[.16,.049,.173],[.195,.040,.161],[.21,.004,.143]];
    function shoe(material,sole=false){
      const pos=[],ix=[],steps=24;
      for(const [z,width,top] of sections)for(let i=0;i<=steps;i++){const a=i/steps*tau;pos.push(f[0]+Math.cos(a)*width,(sole?.116:.128)+Math.max(0,Math.sin(a))*(sole?.014:top-.128),z);}
      for(let row=0;row<sections.length-1;row++)for(let i=0;i<steps;i++){const a=row*(steps+1)+i,b=a+steps+1;ix.push(a,a+1,b+1,a,b+1,b);}
      for(const row of [0,sections.length-1]){const center=pos.length/3;pos.push(f[0],sole?.122:.135,sections[row][0]);for(let i=0;i<steps;i++){const a=row*(steps+1)+i;ix.push(center,row===0?a+1:a,row===0?a:a+1);}}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(ix);g.computeVertexNormals();add(g,material,foot);
    }
    shoe(m.leather);shoe(m.dark,true);shell(m.leather,(p,b)=>b.endsWith(`.${side}`)&&/^(lowerleg|foot)/.test(b),.009,null,cut(.18,.38));
    for(let row=0;row<5;row++){const y=.28-row*.021;for(const sign of [-1,1])line([[f[0]+sign*.014,y,.067],[f[0]-sign*.014,y-.013,.070]],m.linen,.0012,knee);}
    if(['plate','half-plate','splint'].includes(kind)){
      shell(m.steel,p=>p[0]*s>0&&Math.abs(p[0])<.25&&p[1]<.60,.014,null,cut(.24,.53));
      for(const y of [.242,.528])shell(m.edge,p=>p[0]*s>0&&Math.abs(p[0])<.25&&p[1]<.60,.016,null,cut(y-.002,y+.002));
      for(const off of splint?[-.026,-.013,0,.013,.026]:[0])line([[k[0]+off,.50,.070],[k[0]+off+s*.012,.39,.073],[f[0]+off,.26,.052]],m.edge,splint?.0035:.0018,knee);
      sphere(knee,m.steel,[k[0],k[1],k[2]+.062],[.043,.039,.030]);
      if(full){
        shell(m.steel,p=>p[0]*s>0&&Math.abs(p[0])<.25&&p[1]<.95,.014,null,cut(female?.72:.63,.86));
        shell(m.steel,(p,b)=>b.endsWith(`.${side}`)&&/^upperarm/.test(b),.013,null,cut(1.245,1.31));
        sphere(lower,m.steel,elbow,[.035,.037,.040]);
        shell(m.steel,(p,b)=>b.endsWith(`.${side}`)&&/^(wrist|finger|metacarpal)/.test(b),.0028);
      }
    }
    if(['plate','half-plate'].includes(kind)){
      // Three overlapping shoulder lames, each with a rolled edge and rivets.
      for(let row=0;row<(full?3:2);row++){
        const center=[shoulder[0]+s*(.014+row*.015),shoulder[1]+.015-row*.019,shoulder[2]],rx=.075-row*.006,rz=.067-row*.004;
        const cap=new THREE.SphereGeometry(1,24,12,0,tau,0,Math.PI*.60);cap.scale(rx,.037,rz);cap.translate(...center);add(cap,m.steel,upper);
        line(Array.from({length:33},(_,i)=>{const a=i/32*tau;return [center[0]+Math.sin(a)*rx*.95,center[1]-.012,center[2]+Math.cos(a)*rz*.95];}),row?m.edge:m.trim,.0022,upper);
        for(const z of [-.035,.052])stud([center[0]+s*.034,center[1]-.009,z],.0026,upper);
      }
    }
    if(splint){
      for(let j=-2;j<=2;j++)line([[elbow[0]+j*.010,1.16,.058],[elbow[0]+s*.046+j*.010,1.085,.061]],m.edge,.003,lower);
    }
  }
}
