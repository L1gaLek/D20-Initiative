import {createArmorContext} from './plate-design.mjs';
import {buildReferencePlate} from './plate-reference-parts.mjs';
import {torsoFit} from './armor-fit.mjs';

export const ARMOR_KINDS=['leather','hide','studded-leather','scale-mail','chain-shirt','chain-mail','ring-mail','splint','breastplate','half-plate','plate'];
const TAU=Math.PI*2;

// Patterns are cut around the actual anatomical mesh, in metres. Seams, rings,
// scales, rivets and rolled edges are geometry, including on the reverse side.
export function designArmor(body,female,kind){
  const c=createArmorContext(body,female),{T,parts,add,shell,seam,strap,buckle,rivet,limbFrame,fitLimb,bone,defs,V}=c;
  const lerp=T.MathUtils.lerp,clamp=T.MathUtils.clamp;
  const metal=['breastplate','half-plate','plate'].includes(kind),mail=['chain-shirt','chain-mail'].includes(kind),scale=kind==='scale-mail',hide=kind==='hide',splint=kind==='splint';
  const samples=(fn,n=24)=>Array.from({length:n+1},(_,i)=>fn(i/n));
  function path(name,parent,material,fn,r=.002,n=24){seam(name,parent,material,samples(fn,n),r);}
  function stud(p,parent='spine03',material='brass',r=.0037){const g=new T.SphereGeometry(1,8,5);g.scale(r,r,r*.55);g.translate(...p);add('domed-rivet',parent,material,g);}
  const rows=female?
    [[1.025,.150,.168,-.064],[1.09,.137,.174,-.063],[1.15,.141,.188,-.072],[1.22,.162,.211,-.086],[1.28,.180,.205,-.095],[1.33,.181,.165,-.090],[1.39,.176,.132,-.079],[1.43,.082,.104,-.044]]:
    [[1.025,.158,.160,-.088],[1.10,.152,.167,-.086],[1.18,.166,.188,-.100],[1.26,.190,.202,-.111],[1.34,.198,.180,-.111],[1.39,.190,.147,-.093],[1.43,.092,.116,-.070]];
  function profile(y){let i=1;while(i<rows.length-1&&y>rows[i][0])i++;const a=rows[i-1],b=rows[i],t=clamp((y-a[0])/(b[0]-a[0]),0,1);return a.slice(1).map((v,k)=>lerp(v,b[k+1],t));}
  const lo=female?1.080:1.032;
  const hi=a=>female?1.305+.022*Math.exp(-(((Math.abs(Math.sin(a))-.55)/.28)**2))-.020*Math.max(0,Math.cos(a))**14:1.397-.024*Math.max(0,Math.cos(a))**6;
  const fit=torsoFit(body);
  function torso(y,a,extra=0){return fit.point(y,a,extra);}
  function torsoPanel(name,mat,from,to,extra=.003,lower=lo,upper=hi){
    const point=(u,v)=>{const a=lerp(from,to,u),low=typeof lower==='function'?lower(a):lower,high=typeof upper==='function'?upper(a):upper;return torso(lerp(low,high,v),a,extra+.003*Math.sin(v*Math.PI));};
    shell(name,'spine03',mat,point,Math.max(6,Math.ceil((to-from)/TAU*40)),12,mat==='steel'?.006:.009);
    for(const v of [0,1])path(name+'-rolled-edge','spine03',mat==='steel'?'edge':'dark',u=>point(u,v),mat==='steel'?.003:.004);
    return point;
  }
  function stitches(parent,fn,mat='linen',n=22){for(let i=0;i<n;i++){const a=fn((i+.12)/n),b=fn((i+.63)/n);seam('saddle-stitch',parent,mat,[a,b],.0009);}}
  function plaque(name,parent,outline,point,material='leather',depth=.012){
    if(name==='moulded-leather-chest-panel')outline=new T.CatmullRomCurve3(outline.map(([x,y])=>new T.Vector3(x,y,0)),true,'catmullrom',.25).getPoints(outline.length*4).slice(0,-1).map(p=>[p.x,p.y]);
    if(outline.reduce((sum,p,i)=>{const q=outline[(i+1)%outline.length];return sum+p[0]*q[1]-q[0]*p[1];},0)<0)outline=outline.toReversed();
    // Concentric bevel rings give each panel a raised crown and a closed back.
    const n=outline.length,center=outline.reduce((p,q)=>[p[0]+q[0]/n,p[1]+q[1]/n],[0,0]),p=[],uv=[],ix=[];
    for(const [s,h]of [[1,0],[.87,depth],[.12,depth*1.20],[1,-.006]])for(const [x,y]of outline){const a=lerp(center[0],x,s),b=lerp(center[1],y,s);p.push(...point(a,b,h));uv.push(a*6,b*6);}
    for(let row=0;row<2;row++)for(let i=0;i<n;i++){const j=(i+1)%n,a=row*n+i,b=row*n+j;ix.push(a,b,a+n,b,b+n,a+n);}
    for(let i=0;i<n;i++){const j=(i+1)%n;ix.push(i,3*n+i,j,j,3*n+i,3*n+j);}
    for(let i=1;i<n-1;i++)ix.push(2*n,2*n+i,2*n+i+1,3*n,3*n+i+1,3*n+i);
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();g.userData.studioOwner=name;add(name,parent,material,g);
    seam(name+'-welt',parent,material==='steel'?'edge':'leather',[...outline,outline[0]].map(([x,y])=>point(x,y,.0025)),material==='steel'?.0025:.0025);
    return (x,y,h=0)=>point(x,y,h+depth);
  }
  function ring(parent,center,normal,r=.006,tilt=0,material='steel',aspect=[1,1]){
    const g=new T.TorusGeometry(r,kind==='ring-mail'?r*.18:.00105,3,7);g.scale(aspect[0],aspect[1],1);g.rotateX(tilt);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),V(normal).normalize()));g.translate(...center);add(kind==='ring-mail'?'sewn-iron-ring':'interlocking-mail-link',parent,material,g);
  }
  function scales(parent,point,rows,columns){
    for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
      const u=(col+(row%2)*.5)/columns,v=(row+.55)/rows;if(u>=1)continue;
      const center=V(point(u,v)),side=V(point(Math.min(1,u+.003),v)).sub(V(point(Math.max(0,u-.003),v))).normalize(),up=V(point(u,Math.min(1,v+.003))).sub(V(point(u,Math.max(0,v-.003)))).normalize(),normal=new T.Vector3().crossVectors(side,up).normalize();
      const outline=[[-.014,.016],[.014,.016],[.016,-.001],[.010,-.018],[0,-.025],[-.010,-.018],[-.016,-.001]];
      plaque('overlapping-forged-scale',parent,outline,(x,y,h)=>center.clone().addScaledVector(side,x).addScaledVector(up,y).addScaledVector(normal,.008+h+Math.max(0,-y)*.16).toArray(),col%7?'steel':'edge',.0035);
      if(col%2===0)stud(center.clone().addScaledVector(up,.010).addScaledVector(normal,.014).toArray(),parent,'brass',.0018);
    }
  }
  function links(parent,point,nv,nu){
    for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){
      const u=(i+(j%2)*.5)/nu,v=(j+.5)/nv;if(u>=1)continue;const center=V(point(u,v)),a=V(point(Math.min(1,u+.002),v)).sub(V(point(Math.max(0,u-.002),v))),b=V(point(u,Math.min(1,v+.002))).sub(V(point(u,Math.max(0,v-.002)))),normal=new T.Vector3().crossVectors(a,b).normalize();
      // Adjacent tilted rows overlap. Spacing follows each fitted panel, so a
      // flared hem has a woven surface rather than isolated decorative dots.
      const du=a.length()/.004/nu,dv=b.length()/.004/nv,r=clamp(Math.max(du,dv)*.66,.005,.014);
      ring(parent,center.addScaledVector(normal,.004).toArray(),normal.toArray(),r,j%2?.48:-.48,(i+j)%9?'steel':'edge',[clamp(du/Math.max(du,dv),.65,1),clamp(dv/Math.max(du,dv),.65,1)]);
    }
  }
  function cannon(parent,end,name,material,from=.12,to=.90,extra=0){
    const pattern=parent.startsWith('upperarm')?/^upperarm/:parent.startsWith('lowerarm')?/^(lowerarm|wrist)/:parent.startsWith('lowerleg')?/^(lowerleg|foot)/:/^upperleg/;
    const fit=fitLimb(parent,end,pattern),point=(u,v)=>{const a=u*TAU,t=lerp(from,to,v),p=V(fit(t,a,extra));if(material==='steel')p.z+=.008*Math.max(0,Math.cos(a))**10*Math.sin(v*Math.PI);return p.toArray();};
    shell(name,parent,material,point,24,8,material==='steel'?.006:.010);
    for(const v of [0,1])path(name+'-turned-rim',parent,material==='steel'?'edge':'dark',u=>point(u,v),.003);
    for(const v of [.18,.80]){path('retaining-strap',parent,'dark',u=>{const p=V(point(u,v));return p.addScaledVector(V(p.toArray()).sub(V(fit(lerp(from,to,v),u*TAU,-.01))).normalize(),.002).toArray();},.004);buckle(parent,point(.20,v),.014);}
    if(material==='leather')stitches(parent,v=>{const p=point(.12,v);p[2]+=.003;return p;},'linen',18);
    return point;
  }
  function boots(side){
    const lower='lowerleg01.'+side,foot='foot.'+side,ank=bone(foot);
    const leg=cannon(lower,foot,'reinforced-leather-boot','leather',.45,1.08,.003);
    const shoe=(u,v)=>{const z=lerp(-.070,.253,v),width=lerp(.043,.034,v)*(.70+.30*Math.sin(v*Math.PI)),height=.145+.100*Math.exp(-(((z-.025)/.10)**2)),a=u*TAU;return [ank.x+Math.cos(a)*width,.126+Math.max(0,Math.sin(a))*(height-.126),z];};
    shell('closed-shaped-leather-shoe',foot,'leather',shoe,24,16,.008);
    const sole=new T.BoxGeometry(.080,.018,.290,1,1,1);sole.translate(ank.x,.120,.087);add('stacked-boot-sole',foot,'dark',sole);
    for(const z of [.015,.052,.090])path('boot-cross-lacing',foot,'linen',u=>[ank.x+lerp(-.025,.025,u),.246-z*.30,z+.012*Math.sin(u*Math.PI)],.0016,8);
    const h=bone(lower);plaque('shaped-kneecap',lower,[[-.034,.034],[0,.052],[.034,.034],[.038,-.019],[0,-.061],[-.038,-.019]],(x,y,hgt)=>[h.x+x,h.y+y,h.z+.078+hgt],metal||splint||scale?'steel':'leather',.014);
    return leg;
  }
  function shoulder(side,material='leather',layers=2){
    const parent='upperarm01.'+side,end='lowerarm01.'+side,f=limbFrame(parent,end),sign=side==='L'?-1:1;
    for(let row=0;row<layers;row++){
      const point=(u,v)=>{const a=lerp(-.28,Math.PI+.28,u),t=lerp(-.027+row*.036,.065+row*.037,v),r=(female?.087:.104)-row*.010,cap=row===0?lerp(.35,1,Math.sin(v*Math.PI*.67)):1;return f.a.clone().addScaledVector(f.axis,t).addScaledVector(f.front,Math.cos(a)*r*cap).addScaledVector(f.side,Math.sin(a)*r*cap*sign).toArray();};
      const p=side==='L'?(u,v)=>point(1-u,v):point;
      shell('layered-'+kind+'-shoulder-'+row,parent,material,p,24,6,material==='steel'?.006:.011);
      path('rolled-shoulder-border',parent,material==='steel'?'edge':'dark',u=>p(u,1),.0038);
      for(const u of [.12,.87])rivet(p(u,.68),parent,[0,0,1],true);
      if(scale)scales(parent,p,2,8);if(mail)links(parent,p,4,12);
      if(hide)for(let i=0;i<16;i++){const at=p(i/15,1),g=new T.ConeGeometry(.008,.034+(i%3)*.003,5);g.rotateZ(Math.PI);g.translate(at[0],at[1]-.012,at[2]);add('layered-fur-fringe',parent,i%3?'gambeson':'linen',g);}
    }
  }
  function skirts(material){
    const length=female?.19:kind==='chain-mail'?.45:.32;
    for(const side of ['R','L']){
      const sign=side==='L'?1:-1,parent='upperleg01.'+side;
      for(const [name,a0,a1]of [['front',.16,1.63],['back',1.63,3.10]]){
        const p=(u,v)=>{const pointed=!mail&&!scale&&!splint,at=pointed?lerp(.5,u,.30+.70*v):u,a=sign*lerp(a0,a1,at),low=1.012-length+(pointed?.070*Math.abs(u*2-1):0),y=lerp(low,1.017,v)-.015*(1-v)*Math.sin(u*Math.PI),flare=(1.017-y)*.28;return [Math.sin(a)*(.159+flare),y,.025+Math.cos(a)*(.155+flare*.75)+.004*Math.cos(u*TAU*2)*(1-v)];};
        const point=side==='R'?(u,v)=>p(1-u,v):p;
        shell('split-'+kind+'-tasset-'+name,parent,material,point,14,12,.010);
        for(const v of [0,1])path('thick-skirt-welt',parent,material==='steel'?'edge':'dark',u=>point(u,v),.0035);
        if(scale)scales(parent,point,female?5:8,7);
        if(mail)links(parent,point,female?13:kind==='chain-mail'?24:16,12);
        if(kind==='ring-mail')for(let j=0;j<5;j++)for(let i=0;i<5;i++){const q=point((i+.5)/5,(j+.5)/5);q[2]+=.007;ring(parent,q,[0,0,name==='back'?-1:1],.0125,0);}
        if(splint)for(let i=0;i<6;i++){const center=(i+.5)/6,strip=(u,v)=>{const q=point(center+(u-.5)*.115,v*.87+.07);q[2]+=(name==='front'?1:-1)*(.010+.008*Math.sin(u*Math.PI));return q;};shell('vertical-splint-tasset',parent,'steel',strip,4,8,.005);for(const v of [.14,.85])stud(strip(.5,v),parent);}
        if(kind==='studded-leather')for(let j=0;j<4;j++)for(let i=0;i<5;i++)stud(point((i+.5)/5,(j+.5)/4),parent,'edge',.0034);
        if(hide)for(let j=0;j<12;j++){const q=point(j/11,0),g=new T.ConeGeometry(.009,.032,5);g.rotateZ(Math.PI);g.translate(q[0],q[1]-.010,q[2]);add('fur-skirt-hem',parent,'gambeson',g);}
        if(!mail&&!scale)for(const u of [.08,.92])stitches(parent,v=>point(u,v),'linen',16);
      }
    }
  }
  if(metal){
    buildReferencePlate(c);
    if(kind==='plate')return parts;
    const keep=part=>{
      const id=part.id;
      if(part.parent==='head'||/^finger|^wrist/.test(part.parent)||/gauntlet|sabaton|helmet|visor|gorget/.test(id))return false;
      if(/^lowerleg/.test(part.parent))return kind==='half-plate';
      if(/^lowerarm/.test(part.parent))return kind==='half-plate';
      if(/^upperarm/.test(part.parent))return kind==='half-plate'||/pauldron/.test(id);
      if(/cuisse|retaining-strap/.test(id))return kind==='half-plate';
      return true;
    };
    const selected=parts.filter(keep);for(const part of parts)if(!selected.includes(part))part.geometry.dispose();parts.splice(0,parts.length,...selected);
    for(const part of parts)if(/tasset|hip-petal|hip-defense/.test(part.id)&&kind==='breastplate')part.material=part.material==='steel'?'leather':part.material==='brass'?'dark':part.material;
    for(const side of ['R','L']){boots(side);if(kind==='breastplate')cannon('lowerarm01.'+side,'wrist.'+side,'fitted-leather-bracer','leather',.20,.91);}
    return parts;
  }

  // Leather panels are individually cut, with real edge thickness. Mail uses a
  // dark textile backing; its visible links are never merely a painted pattern.
  const base=mail?'gambeson':hide?'gambeson':'leather';
  for(const [i,a0,a1]of [[0,-Math.PI/2,-.025],[1,.025,Math.PI/2],[2,Math.PI/2,Math.PI],[3,Math.PI,Math.PI*1.5]]){
    const p=torsoPanel('fitted-'+kind+'-bodice-panel-'+i,base,a0,a1,.002);
    for(const u of [.035,.965])stitches('spine03',v=>{const q=p(u,v);q[2]+=.002;return q;},mail?'dark':'linen',24);
    if(mail)links('spine03',p,20,18);
    if(kind==='ring-mail')for(let j=0;j<7;j++)for(let k=0;k<7;k++){const u=(k+.5+(j%2)*.35)/7;if(u>1)continue;const v=(j+.5)/7,at=p(u,v),a=lerp(a0,a1,u);ring('spine03',at,[Math.sin(a),0,Math.cos(a)],.012);}
    if(kind==='studded-leather')for(let j=0;j<6;j++)for(let k=0;k<6;k++){const u=(k+.5+(j%2)*.35)/6;if(u>1)continue;stud(p(u,(j+.5)/6),'spine03','edge',.0036);}
    if(splint)for(let j=0;j<6;j++){
      const u=(j+.5)/6,strip=(s,v)=>{const a=lerp(a0,a1,u+(s-.5)*.115);return torso(lerp(lo+.010,hi(a)-.009,v),a,.015+.008*Math.sin(s*Math.PI));};
      shell('convex-steel-splint','spine03','steel',strip,4,10,.005);for(const v of [.12,.88])stud(strip(.5,v),'spine03','brass',.0032);
    }
  }
  if(scale)scales('spine03',(u,v)=>torso(lerp(lo,hi(u*TAU),v),u*TAU,.007),10,36);
  if(female&&(kind==='leather'||kind==='studded-leather'||hide)){
    for(const s of [-1,1]){
      const outline=(female?[[.010,1.280],[.048,1.320],[.127,1.308],[.169,1.271],[.141,1.216],[.060,1.205],[.013,1.229]]:[[.010,1.363],[.118,1.382],[.172,1.329],[.151,1.243],[.054,1.204],[.010,1.241]]).map(([x,y])=>[x*s,y]);
      const crown=Math.max(...outline.map(([x,y])=>fit.front(x,y)[2]),fit.front(s*.080,1.26)[2])+.004;
      const p=plaque('moulded-leather-chest-panel','spine03',outline,(x,y,h)=>[x,y,crown+h+.004*Math.max(0,1-((x-s*.080)/.10)**2-((y-1.26)/.09)**2)],'leather',hide?.014:.012);
      for(const [x,y]of outline.slice(1,-1))if(kind==='studded-leather')stud(p(x,y,.002),'spine03','edge',.004);
    }
  }
  if(!female&&(kind==='leather'||kind==='studded-leather'||hide)){
    const frontFit=(x,y,h)=>fit.front(x,y,.005+h);
    plaque('formed-leather-cuirass','spine03',[[-.154,1.270],[-.175,1.337],[-.109,1.382],[0,1.343],[.109,1.382],[.175,1.337],[.154,1.270],[.109,1.180],[0,1.165],[-.109,1.180]],frontFit,'leather',.005);
    for(const sign of [-1,1]){
      const harness=samples(t=>frontFit(lerp(sign*.144,-sign*.120,t),lerp(1.376,1.110,t),.028+(sign>0?.003:0)),20);
      strap('spine03',harness,.027);buckle('spine03',harness[10],.028);
    }
  }
  // Shoulder straps and a substantial waist belt connect chest and hip armor.
  for(const s of [-1,1]){
    const front=torso(hi(s*.65),s*.65,.006),back=torso(hi(Math.PI-s*.65),Math.PI-s*.65,.006);
    strap('spine03',samples(t=>{const p=V(front).lerp(V(back),t);p.y=Math.max(p.y,c.skinTop(p.x,p.z))+.010;return p.toArray();},16),female?.020:.027);buckle('spine03',[front[0],front[1]-.035,front[2]+.018],.023);
  }
  const belt=(u,v)=>torso(lerp(female?1.056:1.035,female?1.097:1.080,v),u*TAU,.017);
  shell('thick-waist-belt','root','dark',belt,40,2,.010);for(const v of [0,1])path('belt-saddle-edge','root','leather',u=>belt(u,v),.0025);buckle('root',[0,female?1.077:1.058,.198],.042);
  for(let i=0;i<9;i++)stud(torso(female?1.077:1.058,i*.18+.25,.024),'root','brass',.0025);
  skirts(mail?'gambeson':'leather');
  for(const side of ['R','L']){
    const upper='upperarm01.'+side,lower='lowerarm01.'+side,wrist='wrist.'+side;
    shoulder(side,scale?'steel':mail?'gambeson':'leather',scale||kind==='studded-leather'?3:hide?2:1);
    const bracer=cannon(lower,wrist,'fitted-'+kind+'-vambrace',splint?'steel':'leather',.18,.92,.003);
    if(mail){const sleeve=cannon(upper,lower,'mail-sleeve-backing','gambeson',.18,kind==='chain-mail'?.92:.48);links(upper,sleeve,kind==='chain-mail'?12:8,12);if(kind==='chain-mail'){const fore=cannon(lower,wrist,'long-mail-sleeve','gambeson',.06,.86,-.003);links(lower,fore,12,12);}}
    if(splint)for(let j=0;j<5;j++){const u=(j-2)*.035,point=(s,v)=>bracer(.5+(u+(s-.5)*.026)/TAU,v);shell('splinted-bracer-strip',lower,'edge',point,3,8,.004);}
    const boot=boots(side);if(splint){for(let i=0;i<5;i++){const strip=(u,v)=>boot((i+.5+(u-.5)*.65)/12,v);shell('splinted-greave-strip','lowerleg01.'+side,'steel',strip,3,8,.005);}}
  }
  if(hide){
    const mantle=(u,v)=>{const a=u*TAU,y=lerp(female?1.296:1.368,female?1.343:1.430,v);return torso(y,a,.020+.020*Math.sin(v*Math.PI));};
    shell('thick-fur-shoulder-mantle','spine03','gambeson',mantle,40,6,.014);
    for(let i=0;i<64;i++){const at=mantle(i/64,.30),g=new T.SphereGeometry(1,6,4);g.scale(.013,.023+(i%5)*.002,.013);g.translate(...at);add('overlapping-fur-lock','spine03',i%5?'gambeson':'linen',g);}
    for(const s of [-1,1]){const from=torso(lo+.02,s*.55,.022),to=torso(hi(-s*.50)-.02,-s*.50,.025);strap('spine03',samples(t=>{const x=lerp(from[0],to[0],t),y=lerp(from[1],to[1],t),[rx]=profile(y),q=torso(y,Math.asin(clamp(x/rx,-.98,.98)),.027);return q;},16),.022);}
  }
  return parts;
}
