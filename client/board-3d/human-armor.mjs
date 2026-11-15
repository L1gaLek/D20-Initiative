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
  const lining=mat(kind==='hide'?'#bca983':female?'#51434e':'#49494a');texture(lining,'linen');
  m.cloth.color.set(female?'#403746':'#333b43');texture(m.cloth,'linen');
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
  const bulk=armored?(plate?(female?.030:.037):splint?.032:kind==='hide'?.034:.026):0;
  const torso=([x,y],b)=>y>1.0&&y<1.44&&Math.abs(x)<.195&&!/arm|finger|wrist/.test(b);
  const legs=([x,y])=>y<1.06&&Math.abs(x)<.25;
  const arm=(p,b)=>/^(upperarm|lowerarm)/.test(b);
  const cut=(min,max)=>[p=>p[1]-min,p=>max-p[1]];
  function shell(material,predicate,offset=.009,deform,clips=[]){const mesh=surface(material,predicate,offset,deform,clips);if(mesh)mesh.name=`armor-${kind}`;return mesh;}
  function point(y,a,extra=0){
    const [rx,front,back]=profile(y),offset=bulk+extra,c=Math.cos(a);
    const keel=plate?Math.max(0,c)**6*Math.sin(THREE.MathUtils.clamp((y-1.09)/.33,0,1)*Math.PI)*.020:0;
    return [Math.sin(a)*(rx+offset),y,(front+back)/2+c*((front-back)/2+offset)+keel];
  }
  const pvec=p=>new THREE.Vector3(...p);
  function add(geometry,material,parent=bone){return attach(parent,geometry,material);}
  function solidify(g,thickness){
    g.computeVertexNormals();const a=g.attributes,p=Array.from(a.position.array),count=a.position.count,ix=Array.from(g.index.array),edges=new Map();
    for(let i=0;i<count;i++)p.push(a.position.getX(i)-a.normal.getX(i)*thickness,a.position.getY(i)-a.normal.getY(i)*thickness,a.position.getZ(i)-a.normal.getZ(i)*thickness);
    const outer=ix.slice();for(let i=0;i<outer.length;i+=3){ix.push(outer[i]+count,outer[i+2]+count,outer[i+1]+count);for(const [x,y] of [[outer[i],outer[i+1]],[outer[i+1],outer[i+2]],[outer[i+2],outer[i]]]){const key=x<y?x+','+y:y+','+x;if(edges.has(key))edges.delete(key);else edges.set(key,[x,y]);}}
    for(const [x,y] of edges.values())ix.push(x,y,x+count,y,y+count,x+count);
    g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.deleteAttribute('normal');g.deleteAttribute('uv');g.setIndex(ix);g.computeVertexNormals();return g;
  }
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
  const min=female?1.09:1.026,max=female?1.383:1.408;
  const top=a=>max-(female?.065:.015)*Math.max(0,Math.cos(a))**4;
  function garment(material,low=min,high=top,extra=.009,range=[0,tau],name='torso'){
    const faceted=plate&&name==='torso',positions=[],indices=[],rows=typeof low==='number'&&typeof high==='number'&&high-low<.05?2:faceted?8:16,segments=Math.max(2,Math.ceil((range[1]-range[0])/tau*(faceted?32:48))),count=(rows+1)*(segments+1);
    const thickness=material===m.steel||material===m.edge?.009:material===m.linen?.003:.010;
    for(const layer of [0,1])for(let row=0;row<=rows;row++)for(let col=0;col<=segments;col++){
      const a=range[0]+col/segments*(range[1]-range[0]),bottom=typeof low==='function'?low(a):low,t=typeof high==='function'?high(a):high,y=THREE.MathUtils.lerp(bottom,t,row/rows);positions.push(...point(y,a,extra-layer*thickness));
    }
    for(let row=0;row<rows;row++)for(let col=0;col<segments;col++){const a=row*(segments+1)+col,b=a+segments+1;indices.push(a,a+1,b,a+1,b+1,b,a+count,b+count,a+1+count,a+1+count,b+count,b+1+count);}
    const bridge=(a,b)=>indices.push(a,b,a+count,b,b+count,a+count);
    for(let col=0;col<segments;col++){bridge(col+1,col);const a=rows*(segments+1)+col;bridge(a,a+1);}
    if(range[1]-range[0]<tau-.001)for(let row=0;row<rows;row++){const a=row*(segments+1),b=a+segments+1;bridge(a,b);bridge(b+segments,a+segments);}
    let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);
    if(faceted){const indexed=g;g=g.toNonIndexed();indexed.dispose();}g.computeVertexNormals();const mesh=add(g,material);mesh.name=`armor-${kind}-${female?'female':'male'}-${name}`;return mesh;
  }
  function edge(high=top,material=m.edge,r=.0025,extra=.012){line(Array.from({length:73},(_,i)=>{const a=i/72*tau;return point(typeof high==='function'?high(a):high,a,extra);}),material,r);}
  function link(y,a,r=.006,material=m.steel){
    const g=new THREE.TorusGeometry(r,.00115,4,12);g.rotateY(a);g.translate(...point(y,a,.013));add(g,material);
  }
  function frontPoint(x,y,extra){const [rx]=profile(y);return [x,y,point(y,Math.asin(THREE.MathUtils.clamp(x/(rx+bulk+extra),-.98,.98)),extra)[2]];}
  function frontPanel(outline,material,extra,depth){
    if(outline.reduce((sum,p,i)=>{const q=outline[(i+1)%outline.length];return sum+p[0]*q[1]-q[0]*p[1];},0)<0)outline=outline.toReversed();
    const count=outline.length,center=outline.reduce((p,q)=>[p[0]+q[0]/count,p[1]+q[1]/count],[0,0]),pos=[],ix=[];
    for(const row of [0,1,2])for(const [x,y] of outline){
      const t=row===1?.84:1,px=THREE.MathUtils.lerp(center[0],x,t),py=THREE.MathUtils.lerp(center[1],y,t);
      pos.push(...frontPoint(px,py,extra+(row===1?depth:row===2?-.004:0)));
    }
    pos.push(...frontPoint(...center,extra+depth*1.45));const crown=count*3;
    for(let i=0;i<count;i++){const j=(i+1)%count;ix.push(i,j,i+count,j,j+count,i+count,i+count,j+count,crown,i,i+count*2,j,j,i+count*2,j+count*2);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(ix);const flat=g.toNonIndexed();g.dispose();flat.computeVertexNormals();add(flat,material);
    line([...outline,outline[0]].map(([x,y])=>frontPoint(x,y,extra+.002)),plate?m.edge:m.dark,.0022);
  }
  // A tapered, closed shell follows the limb axis; its end bevels and raised
  // rims remain smooth instead of inheriting jagged cuts from the skin mesh.
  function limbGuard(parent,start,end,from,to,r0,r1,material,name){
    const a=pvec(start),axis=pvec(end).sub(a).normalize(),normal=new THREE.Vector3(0,0,1);normal.addScaledVector(axis,-normal.dot(axis)).normalize();const tangent=new THREE.Vector3().crossVectors(axis,normal),length=pvec(end).distanceTo(a),pos=[],ix=[],segments=12,rows=[from,from+.035,to-.035,to],count=rows.length*segments;
    const radius=t=>THREE.MathUtils.lerp(r0,r1,(t-from)/(to-from)),thickness=.008,rearAllowance=parent.startsWith('lowerleg')?.026:0;
    // The calf bulges behind its joint axis. Extend the back of the ellipse
    // while preserving the shin face, rather than letting skin cut through it.
    for(const layer of [0,1])for(let row=0;row<rows.length;row++)for(let i=0;i<segments;i++){
      const t=rows[row],angle=i/segments*tau,r=radius(t)+(row===1||row===2?.004:0)-layer*thickness;
      pos.push(...a.clone().addScaledVector(axis,t*length).addScaledVector(normal,Math.cos(angle)*(r+rearAllowance)-rearAllowance).addScaledVector(tangent,Math.sin(angle)*r));
    }
    for(let row=0;row<rows.length-1;row++)for(let i=0;i<segments;i++){
      const a=row*segments+i,b=row*segments+(i+1)%segments,c=a+segments,d=b+segments;ix.push(a,b,c,b,d,c,a+count,c+count,b+count,b+count,c+count,d+count);
    }
    for(const row of [0,rows.length-1])for(let i=0;i<segments;i++){const a=row*segments+i,b=row*segments+(i+1)%segments;ix.push(...(row?[a,b,a+count,b,b+count,a+count]:[a,a+count,b,b,a+count,b+count]));}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(ix);g.computeVertexNormals();const mesh=add(g,material,parent);mesh.name=`armor-${kind}-${name}`;
    for(const t of [from+.02,to-.02])line(Array.from({length:25},(_,i)=>{const angle=i/24*tau,r=radius(t)+.005;return a.clone().addScaledVector(axis,t*length).addScaledVector(normal,Math.cos(angle)*(r+rearAllowance)-rearAllowance).addScaledVector(tangent,Math.sin(angle)*r).toArray();}),material===m.steel?m.edge:m.dark,.0035,parent);
    for(const t of [from+.07,(from+to)/2,to-.07])stud(a.clone().addScaledVector(axis,t*length).addScaledVector(normal,radius(t)+.006).toArray(),.0035,parent);
  }
  // A shaped neckline and short split skirt leave female shoulders, a narrow
  // waist band and the thighs open, while the chest and shorts stay covered.
  shell(armored?m.cloth:m.linen,legs,armored?.012:.008,p=>{if(p[1]>.82&&p[1]<.99){p[0]*=1.025;p[2]*=1.04;}},cut(armored?(female?.865:.24):.82,1.04));
  if(!armored){
    if(female){garment(m.linen,1.155,1.36,.005);edge(1.155,m.linen,.0024,.006);edge(1.36,m.linen,.0024,.006);}
    for(const s of female?[-1,1]:[])ribbon([[s*.085,1.345,.12],[s*.104,1.415,.04],[s*.103,1.39,-.052],[s*.085,1.35,-.061]],.012,m.linen);
    return;
  }
  const liningTop=a=>female?top(a)+.018:1.428-.014*Math.max(0,Math.cos(a))**4;
  garment(lining,min-.004,liningTop,.002,[0,tau],'padded-undercoat');
  edge(liningTop,m.dark,.0035,.004);
  shell(lining,(p,b)=>arm(p,b)&&Math.abs(p[0])>.14,female?.015:.012,null,[...cut(female?1.275:1.025,1.43),p=>Math.abs(p[0])-.145]);
  // Quilting follows the padded sleeve and adds a separate, rounded cuff.
  for(const side of ['L','R']){
    for(const y of female?[1.285,1.315]:[1.08,1.15,1.22,1.29])shell(m.dark,(p,b)=>b.endsWith(`.${side}`)&&arm(p,b),female?.017:.014,null,cut(y-.0013,y+.0013));
  }
  if(plate){
    garment(m.steel,min,top,.016);edge(top,m.edge,.0035,.018);edge(min,m.edge,.003,.018);
    frontPanel([[-.155,1.315],[-.12,1.36],[0,1.35],[.12,1.36],[.155,1.315],[.132,1.23],[.072,1.175],[0,1.155],[-.072,1.175],[-.132,1.23]].map(([x,y])=>[x,Math.min(y,top(Math.asin(x/.23))-.008)]),m.steel,.020,.010);
    // A raised medial ridge, gothic flutes and recessed brass border on the
    // actual fitted surface give steel a manufactured, rigid silhouette.
    for(const a of [0,-.26,.26,-.53,.53])line([min+.015,min+.07,1.23,1.29,top(a)-.015].filter(y=>y>min&&y<top(a)).map(y=>point(y,a,.019)),a?m.edge:m.steel,a?.0013:.003);
    for(const s of [-1,1]){
      line([[s*.030,1.28,point(1.28,.2,.02)[2]],[s*.064,1.245,point(1.245,.42,.02)[2]],[s*.075,1.20,point(1.20,.55,.02)[2]]],m.trim,.0012);
      for(const y of [min+.025,1.22,1.29])stud(point(y,s*1.12,.02),.003);
    }
    for(let row=0;row<(female?3:4);row++){const y=min+.006+row*.022;garment(m.steel,y,y+.027,.021+row*.001,[0,tau],'fauld-lame');loop(y,m.edge,.002,.024+row*.001);}
  }else{
    garment(coat,min,top,.011);edge(top,light?m.dark:m.edge,.003,.013);edge(min,light?m.dark:m.edge,.003,.013);
    if(light)for(const sign of [-1,1])frontPanel([[.026,1.30],[.082,1.334],[.15,1.301],[.133,1.16],[.10,min+.015],[.026,min+.015]].map(([x,y])=>[x*sign,Math.min(y,top(Math.asin(x/.21))-.012)]),m.leather,.016,.005);
    if(light||splint||kind==='ring-mail'){
      if(light)for(const range of [[.70,1.32],[tau-1.32,tau-.70]])garment(m.leather,min+.003,a=>top(a)-.003,.022,range,'side-panel');
      // Double stitched, inset panels and a laced center seam remain readable
      // at portrait distance; the color is not doing the work alone.
      for(const a of [-1.12,-.66,.66,1.12,Math.PI]){
        const extra=light&&Math.abs(a)>.70&&Math.abs(a)<1.32?.025:.014,ys=Array.from({length:18},(_,i)=>min+.008+i/17*(top(a)-min-.016));line(ys.map(y=>point(y,a,extra)),m.dark,.0015);
        for(const y of ys)line([point(y,a-.017,extra+.001),point(y+.003,a+.017,extra+.001)],m.linen,.0008);
      }
      if(light)for(let i=0;i<8;i++){const y=min+.025+i*.022;if(y>top(0)-.015)break;for(const s of [-1,1])line([point(y,s*.10,.015),point(y+.013,-s*.10,.015)],m.linen,.0013);}
    }
    if(kind==='studded-leather')for(let row=0;row<Math.ceil((max-min)/.031);row++)for(let col=0;col<26;col++){
      const a=(col+(row%2)*.5)/26*tau,y=min+.016+row*.031,raised=Math.cos(a)>.75&&Math.abs(Math.sin(a))>.10&&y<1.32;
      if(y<top(a)-.012)stud(point(y,a,raised?.027:.016),.0042,bone,row%3?m.edge:m.trim);
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
        for(let row=0;row<Math.ceil((max-min)/.027);row++)for(let col=0;col<26;col++){
          const a=(col+(row%2)*.5)/26*tau,y=min+.014+row*.027;if(y<top(a)-.01)link(y,a,.0102,col%4?m.steel:m.edge);
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
        const g=new THREE.ExtrudeGeometry(shape,{depth:.005,bevelEnabled:true,bevelSize:.0018,bevelThickness:.0016,bevelSegments:1,curveSegments:3,steps:1});g.rotateY(a);g.translate(...point(y,a,.019));add(g,row%3?m.steel:m.edge);
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
  if(light||mail||scale||splint){
    const points=[[1.36,-.86],[1.28,-.45],[1.19,0],[1.10,.50],[1.055,.85]].map(([y,a])=>point(y,a,.034));ribbon(points,.027,m.leather);buckle(point(1.20,-.05,.041),.031,.036);
  }
  // The split skirt sits over the breeches. Its curved, closed-edge panels have
  // actual thickness instead of single-sided triangles resembling body paint.
  const skirtMat=plate?m.steel:coat,skirtMin=female?.885:mail?.83:.89;
  for(let col=0;col<12;col++){
    const a=col/12*tau;
    const lo=skirtMin+(col%3)*.008,hi=1.025;
    // Hip sections use the pelvis, and do not stretch with either thigh.
    const pos=[],ix=[],segments=5;
    for(let row=0;row<=4;row++)for(let i=0;i<=segments;i++){
      const angle=a+.025+i/segments*(tau/12-.05),y=THREE.MathUtils.lerp(lo,hi,row/4),bevel=Math.sin(row/4*Math.PI)*.012,rx=THREE.MathUtils.lerp((female?.210:.200)+bulk,(female?.165:.155)+bulk+.006,row/4)+bevel,rz=THREE.MathUtils.lerp(.169+bulk,.150+bulk,row/4)+bevel;pos.push(Math.sin(angle)*rx,y,.026+Math.cos(angle)*rz);
    }
    for(let r=0;r<4;r++)for(let i=0;i<segments;i++){const x=r*(segments+1)+i,b=x+segments+1;ix.push(x,x+1,b,x+1,b+1,b);}
    const count=pos.length/3;for(let i=0;i<count;i++){const x=pos[i*3],y=pos[i*3+1],z=pos[i*3+2],v=new THREE.Vector3(x,0,z-.026).normalize().multiplyScalar(plate?.009:.011);pos.push(x-v.x,y,z-v.z);}
    const outer=ix.slice();for(let i=0;i<outer.length;i+=3)ix.push(outer[i]+count,outer[i+2]+count,outer[i+1]+count);
    const bridge=(a,b)=>ix.push(a,b,a+count,b,b+count,a+count);
    for(let i=0;i<segments;i++){bridge(i+1,i);const x=4*(segments+1)+i;bridge(x,x+1);}
    for(let r=0;r<4;r++){const x=r*(segments+1),b=x+segments+1;bridge(x,b);bridge(b+segments,x+segments);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(ix);g.computeVertexNormals();add(g,skirtMat,'root');
    const angle=a+tau/24;stud([Math.sin(angle)*((female?.168:.158)+bulk+.006),1.017,.026+Math.cos(angle)*(.153+bulk)],.0028,'root');
    const hem=Array.from({length:9},(_,i)=>{const v=a+.025+i/8*(tau/12-.05);return [Math.sin(v)*((female?.210:.200)+bulk),lo,.026+Math.cos(v)*(.169+bulk)];});line(hem,plate?m.edge:m.dark,.0018,'root');
  }
  // Wide belt, framed buckle, tongue, punched holes and a stitched pouch.
  garment(m.leather,1.018,1.052,.031,[0,tau],'belt');edge(1.018,m.dark,.0015,.033);edge(1.052,m.dark,.0015,.033);buckle(point(1.035,0,.038),.042,.033);
  for(let i=0;i<6;i++)stud(point(1.035,.28+i*.10,.034),.0011,bone,m.dark);
  sphere('root',m.leather,[-.144,1.007,.018],[.035,.044,.025]);line([[-.17,1.022,.037],[-.144,1.011,.044],[-.115,1.022,.037]],m.dark,.0015,'root');stud([-.144,1.014,.046],.003,'root');
  for(const side of ['L','R']){
    const s=side==='L'?1:-1,upper=`upperarm01.${side}`,lower=`lowerarm01.${side}`,knee=`lowerleg01.${side}`,foot=`foot.${side}`;
    const shoulder=definitions.get(upper).head,elbow=definitions.get(lower).head,k=definitions.get(knee).head,f=definitions.get(foot).head;
    limbGuard(lower,elbow,definitions.get(`wrist.${side}`).head,.13,.86,.065,.043,plate?m.steel:m.leather,`bracer-${side}`);
    const sections=[[-.058,.006,.155],[-.046,.035,.20],[0,.046,.239],[.05,.049,.22],[.10,.051,.193],[.16,.049,.173],[.195,.040,.161],[.21,.004,.143]];
    function shoe(material,sole=false){
      const pos=[],ix=[],steps=24;
      for(const [z,width,top] of sections)for(let i=0;i<=steps;i++){const a=i/steps*tau;pos.push(f[0]+Math.cos(a)*width,(sole?.116:.128)+Math.max(0,Math.sin(a))*(sole?.014:top-.128),z);}
      for(let row=0;row<sections.length-1;row++)for(let i=0;i<steps;i++){const a=row*(steps+1)+i,b=a+steps+1;ix.push(a,a+1,b+1,a,b+1,b);}
      for(const row of [0,sections.length-1]){const center=pos.length/3;pos.push(f[0],sole?.122:.135,sections[row][0]);for(let i=0;i<steps;i++){const a=row*(steps+1)+i;ix.push(center,row===0?a+1:a,row===0?a:a+1);}}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(ix);g.computeVertexNormals();add(g,material,foot);
    }
    shoe(full?m.steel:m.leather);shoe(m.dark,true);shell(m.leather,(p,b)=>b.endsWith(`.${side}`)&&/^(lowerleg|foot)/.test(b),.012,null,cut(.18,.38));
    if(full)for(let row=0;row<5;row++){
      const z=.018+row*.035,top=.239-z*.33;line(Array.from({length:13},(_,i)=>{const x=-.042+i/12*.084;return [f[0]+x,.131+Math.sqrt(1-(x/.05)**2)*(top-.128),z];}),m.edge,.0021,foot);
    }
    for(let row=0;row<5;row++){const y=.28-row*.021;for(const sign of [-1,1])line([[f[0]+sign*.014,y,.067],[f[0]-sign*.014,y-.013,.070]],m.linen,.0012,knee);}
    if(['plate','half-plate','splint'].includes(kind)){
      limbGuard(knee,k,f,.15,.82,.084,.061,m.steel,`greave-${side}`);
      for(const off of splint?[-.026,-.013,0,.013,.026]:[0])line([[k[0]+off,.50,.101],[k[0]+off+s*.012,.39,.105],[f[0]+off,.26,.082]],m.edge,splint?.0035:.0022,knee);
      const outline=[[-.047,.032],[0,.058],[.047,.032],[.055,-.012],[.028,-.047],[-.028,-.047],[-.055,-.012]],shape=new THREE.Shape(outline.map(([x,y])=>new THREE.Vector2(x,y)));
      const poleyn=new THREE.ExtrudeGeometry(shape,{depth:.014,bevelEnabled:true,bevelSize:.005,bevelThickness:.004,bevelSegments:2,steps:1});poleyn.translate(k[0],k[1],k[2]+.090);add(poleyn,m.steel,knee);
      sphere(knee,m.steel,[k[0],k[1],k[2]+.108],[.038,.041,.020]);
      line([...outline,outline[0]].map(([x,y])=>[k[0]+x,k[1]+y,k[2]+.107]),m.edge,.0025,knee);line([[k[0],k[1]+.044,k[2]+.110],[k[0],k[1],k[2]+.130],[k[0],k[1]-.034,k[2]+.110]],m.trim,.0018,knee);
      if(full){
        shell(m.steel,p=>p[0]*s>0&&Math.abs(p[0])<.25&&p[1]<.95,.014,null,cut(female?.72:.63,.86));
        shell(m.steel,(p,b)=>b.endsWith(`.${side}`)&&/^upperarm/.test(b),.013,null,cut(1.245,1.31));
        sphere(lower,m.steel,elbow,[.035,.037,.040]);
        shell(m.steel,(p,b)=>b.endsWith(`.${side}`)&&/^(wrist|finger|metacarpal)/.test(b),.0028);
      }
    }
    // Broad, bevel-edged shoulder shells are part of every set's silhouette.
    // Steel lames, padded leather, mail mantles and scales use their own surface.
    const shoulderMetal=['plate','half-plate','scale-mail'].includes(kind),shoulderMat=shoulderMetal?m.steel:mail?coat:m.leather,layers=full?3:['half-plate','scale-mail','leather','studded-leather'].includes(kind)?2:1;
    for(let row=0;row<layers;row++){
      const center=[shoulder[0]+s*(.023+row*.023),shoulder[1]+.025-row*.039,shoulder[2]],rx=(female?.132:.143)-row*.009,rz=.117-row*.009,height=.080-row*.008;
      let cap=new THREE.SphereGeometry(1,12,6,0,tau,0,Math.PI*.60);cap.scale(rx,height,rz);cap.translate(...center);solidify(cap,shoulderMetal?.009:.012);
      const smooth=cap;cap=cap.toNonIndexed();smooth.dispose();cap.computeVertexNormals();add(cap,shoulderMat,upper).name=`armor-${kind}-pauldron-${side}`;
      line(Array.from({length:25},(_,i)=>{const a=i/24*tau;return [center[0]+Math.sin(a)*rx*.951,center[1]-height*.309,center[2]+Math.cos(a)*rz*.951];}),shoulderMetal?m.edge:m.dark,.0045,upper);
      for(const x of [-.045,.045])stud([center[0]+x,center[1]-.01,center[2]+rz*.94],.004,upper);
      if(kind==='hide')for(let i=0;i<18;i++){
        const a=i/18*tau,g=new THREE.ConeGeometry(.008,.030,5);g.rotateZ(Math.PI);g.translate(center[0]+Math.sin(a)*rx*.95,center[1]-height*.31-.01,center[2]+Math.cos(a)*rz*.95);add(g,i%3?lining:coat,upper);
      }
    }
    if(splint){
      for(let j=-2;j<=2;j++)line([[elbow[0]+j*.010,1.16,.058],[elbow[0]+s*.046+j*.010,1.085,.061]],m.edge,.003,lower);
    }
  }
}
