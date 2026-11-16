import * as T from '../vendor/three/three.module.mjs';

// Authored plate patterns in metres. This file is a build-time modelling source;
// the browser receives baked, fitted meshes, not these construction operations.
export function designPlate(body,female){
  const parts=[],defs=new Map(body.bones.map(b=>[b.name,b])),tau=Math.PI*2;
  const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  const pos=new Float32Array(bytes(body.positions).buffer),joints=bytes(body.skinIndices),weights=bytes(body.skinWeights);
  const points=Array.from({length:pos.length/3},(_,i)=>{let k=0;for(let n=1;n<4;n++)if(weights[i*4+n]>weights[i*4+k])k=n;return {p:new T.Vector3(...pos.slice(i*3,i*3+3)),bone:body.bones[joints[i*4+k]].name};});
  const V=a=>new T.Vector3(...a),bone=n=>V(defs.get(n).head),bodyIndices=new Uint16Array(bytes(body.indices).buffer);
  function skinTop(x,z){let y=1.20;for(let i=0;i<bodyIndices.length;i+=3){const a=bodyIndices[i]*3,b=bodyIndices[i+1]*3,c=bodyIndices[i+2]*3,dx=pos[b]-pos[a],dz=pos[b+2]-pos[a+2],ex=pos[c]-pos[a],ez=pos[c+2]-pos[a+2],d=dx*ez-dz*ex;if(Math.abs(d)<1e-10)continue;const u=((x-pos[a])*ez-(z-pos[a+2])*ex)/d,v=(dx*(z-pos[a+2])-dz*(x-pos[a]))/d;if(u<0||v<0||u+v>1)continue;const at=pos[a+1]+u*(pos[b+1]-pos[a+1])+v*(pos[c+1]-pos[a+1]);if(at<1.48)y=Math.max(y,at);}return y;}
  const add=(name,parent,material,g)=>{if(!g.attributes.uv){const a=g.attributes.position,uv=[];for(let i=0;i<a.count;i++)uv.push(a.getX(i)/.14,a.getY(i)/.14);g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));}parts.push({name,parent,material,geometry:g});};
  function shell(name,parent,material,point,nu=28,nv=10,thickness=.0028,cut=null){
    const p=[],uv=[],ix=[];for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){const q=point(i/nu,j/nv);p.push(...q);uv.push(i/nu*4,j/nv*2);}
    for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){if(cut?.((i+.5)/nu,(j+.5)/nv))continue;const a=j*(nu+1)+i,b=a+nu+1;ix.push(a,a+1,b,a+1,b+1,b);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();
    const count=p.length/3,a=g.attributes,outerNormals=a.normal.array.slice(),edges=new Map(),outer=ix.slice();
    for(let i=0;i<count;i++){p.push(a.position.getX(i)-a.normal.getX(i)*thickness,a.position.getY(i)-a.normal.getY(i)*thickness,a.position.getZ(i)-a.normal.getZ(i)*thickness);uv.push(a.uv.getX(i),a.uv.getY(i));}
    for(let i=0;i<outer.length;i+=3){ix.push(outer[i]+count,outer[i+2]+count,outer[i+1]+count);for(const [x,y]of [[outer[i],outer[i+1]],[outer[i+1],outer[i+2]],[outer[i+2],outer[i]]]){const k=x<y?x+','+y:y+','+x;if(edges.has(k))edges.delete(k);else edges.set(k,[x,y]);}}
    for(const [x,y]of edges.values()){const start=p.length/3;for(const i of [x,y,x+count,y+count]){p.push(...p.slice(i*3,i*3+3));uv.push(...uv.slice(i*2,i*2+2));}ix.push(start,start+1,start+2,start+1,start+3,start+2);}
    g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();for(let i=0;i<count*3;i++){g.attributes.normal.array[i]=outerNormals[i];g.attributes.normal.array[count*3+i]=-outerNormals[i];}add(name,parent,material,g);
    return {point};
  }
  function seam(name,parent,material,pts,r=.0017){const g=new T.TubeGeometry(new T.CatmullRomCurve3(pts.map(V)),Math.max(8,Math.min(20,pts.length)),r,5,false);add(name,parent,material,g);}
  function rim(name,parent,point,material='edge',radius=.0019){
    for(const v of [0,1])seam(name,parent,material,Array.from({length:37},(_,i)=>point(i/36,v)),radius);
  }
  function rivet(p,parent,normal=[0,0,1],brass=false){
    const q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),V(normal).normalize()),g=new T.CylinderGeometry(.0025,.003,.0016,8,1);g.applyQuaternion(q);g.translate(...p);add('peened-rivet',parent,brass?'brass':'edge',g);
  }
  function strap(parent,pts,width=.015){
    const path=new T.CatmullRomCurve3(pts.map(V)),samples=path.getPoints(Math.max(4,pts.length*3)),p=[],ix=[],borders=[[],[]];
    for(let i=0;i<samples.length;i++){const v=samples[i],t=path.getTangent(i/(samples.length-1)),n=new T.Vector3(0,0,v.z<0?-1:1),side=new T.Vector3().crossVectors(t,n).normalize().multiplyScalar(width/2);const a=v.clone().sub(side),b=v.clone().add(side);p.push(...a,...b);borders[0].push(a.toArray());borders[1].push(b.toArray());if(i){const q=(i-1)*2;ix.push(q,q+1,q+2,q+1,q+3,q+2);}}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();add('stitched-leather-strap',parent,'leather',g);
    for(const border of borders)seam('saddle-stitch',parent,'linen',border,.00045);
  }
  function buckle(parent,p,width=.020){const[x,y,z]=p;seam('forged-buckle',parent,'brass',[[x-width/2,y-.010,z],[x+width/2,y-.010,z],[x+width/2,y+.010,z],[x-width/2,y+.010,z],[x-width/2,y-.010,z]],.0018);seam('buckle-tongue',parent,'edge',[[x,y-.01,z],[x,y+.008,z+.001]],.0011);}
  const male=[[1.03,.135,.157,-.075],[1.10,.140,.175,-.080],[1.20,.164,.202,-.094],[1.28,.182,.207,-.100],[1.35,.179,.174,-.091],[1.40,.146,.123,-.064],[1.43,.090,.095,-.050]],
    woman=[[1.06,.139,.167,-.060],[1.10,.137,.174,-.060],[1.18,.149,.199,-.071],[1.24,.169,.215,-.088],[1.29,.173,.193,-.094],[1.34,.165,.145,-.082],[1.40,.135,.105,-.060]];
  const profile=y=>{const rows=female?woman:male;let i=1;while(i<rows.length-1&&y>rows[i][0])i++;const a=rows[i-1],b=rows[i],t=T.MathUtils.clamp((y-a[0])/(b[0]-a[0]),0,1);return [1,2,3].map(k=>{const p=rows[Math.max(0,i-2)][k],q=rows[Math.min(rows.length-1,i+1)][k];return (.5*((2*a[k])+(-p+b[k])*t+(2*p-5*a[k]+4*b[k]-q)*t*t+(-p+3*a[k]-3*b[k]+q)*t*t*t));});};
  const neck=a=>{const side=Math.abs(Math.sin(a)),crest=Math.exp(-(((side-.72)/.18)**2));return female?1.315-.013*Math.max(0,Math.cos(a))**8+.022*crest-.023*side**12:1.398-.031*Math.max(0,Math.cos(a))**8+.018*crest-.048*side**12;};
  const bottom=a=>(female?1.083:1.037)+.018*Math.sin(a)**2;
  function chest(a,y,extra=0){const [rx,front,back]=profile(y),c=Math.cos(a),flute=(Math.exp(-((a/.045)**2))+.4*Math.exp(-(((Math.abs(a)-.35)/.028)**2)))*.0014*Math.sin(T.MathUtils.clamp((y-1.08)/.27,0,1)*Math.PI);return [Math.sin(a)*(rx+extra),y,(front+back)/2+c*((front-back)/2+extra)+Math.max(0,c)*flute];}
  for(const [name,from,to]of [['breastplate',-1.43,1.43],['backplate',1.57,tau-1.57]]){
    const point=(u,v)=>{const a=T.MathUtils.lerp(from,to,u);return chest(a,T.MathUtils.lerp(bottom(a),neck(a),v));};
    shell('armor-plate-'+(female?'female':'male')+'-torso '+name,'spine03','steel',point,44,18,.0032);rim('rolled-cuirass-edge','spine03',point);
    for(const u of [0,1])seam('side-turnback','spine03','edge',Array.from({length:18},(_,i)=>point(u,i/17)),.0017);
    for(const u of [.07,.93])for(const v of [.08,.42,.80]){const p=point(u,v);p[2]+=(name==='breastplate'?.002:-.002);rivet(p,'spine03',[0,0,name==='breastplate'?1:-1]);}
  }
  for(const sign of [-1,1]){
    for(const y of [1.13,1.265]){const p=chest(sign*1.40,y,.004);strap('spine03',[[p[0]-sign*.016,y,p[2]+.02],[p[0],y,p[2]],[p[0]+sign*.012,y,p[2]-.025]],.015);buckle('spine03',[p[0]-sign*.006,y,p[2]+.008]);}
    const a=sign*.72,p=chest(a,neck(a),.004),back=chest(Math.PI-a,neck(Math.PI-a),.004),support=Array.from({length:17},(_,i)=>{const t=i/16,x=T.MathUtils.lerp(p[0],back[0],t),z=T.MathUtils.lerp(p[2],back[2],t),edge=T.MathUtils.lerp(p[1],back[1],t);return [x,Math.max(edge,skinTop(x,z))+.004,z];});strap('spine03',support,female?.012:.017);
  }
  const fauldTop=female?1.045:1.062,lames=female?3:4;
  for(let row=0;row<lames;row++){
    const high=fauldTop-row*.023,low=high-.029,point=(u,v)=>{const a=u*tau,y=T.MathUtils.lerp(low,high,v),flare=(fauldTop-y)*.40;return [Math.sin(a)*((female?.148:.140)+flare),y,.031+Math.cos(a)*(.135+flare*.65)];};
    shell('articulated-fauld-lame-'+row,'root','steel',point,48,3,.0023);seam('fauld-turned-edge','root','edge',Array.from({length:49},(_,i)=>point(i/48,0)),.0013);
    for(const a of [-.9,.9,Math.PI-.9,Math.PI+.9])rivet(point((a+tau)%tau/tau,.55),'root',[Math.sin(a),0,Math.cos(a)]);
  }
  // A real padded belt lies underneath the lames; buckles close it at the side.
  const belt=(u,v)=>{const a=u*tau,y=T.MathUtils.lerp(.990,1.015,v);return [Math.sin(a)*.151,y,.026+Math.cos(a)*.127];};shell('leather-girdle','root','leather',belt,48,2,.003);buckle('root',[.08,1.002,.161],.025);
  function limbFrame(parent,end){const a=bone(parent),b=bone(end),axis=b.clone().sub(a).normalize(),front=new T.Vector3(0,0,1);front.addScaledVector(axis,-front.dot(axis)).normalize();return {a,b,axis,front,side:new T.Vector3().crossVectors(axis,front),length:a.distanceTo(b)};}
  function fitLimb(parent,end,pattern){
    const f=limbFrame(parent,end),sexSide=parent.slice(-1),candidates=points.filter(p=>p.bone.endsWith('.'+sexSide)&&pattern.test(p.bone)).map(({p})=>{const q=p.clone().sub(f.a);return {t:q.dot(f.axis)/f.length,n:q.dot(f.front),s:q.dot(f.side)};});
    const rows=Array.from({length:15},(_,i)=>{const t=i/14,near=candidates.filter(p=>Math.abs(p.t-t)<.065);const pick=near.length>4?near:candidates.toSorted((a,b)=>Math.abs(a.t-t)-Math.abs(b.t-t)).slice(0,14);let n0=Infinity,n1=-Infinity,s0=Infinity,s1=-Infinity;for(const p of pick){n0=Math.min(n0,p.n);n1=Math.max(n1,p.n);s0=Math.min(s0,p.s);s1=Math.max(s1,p.s);}return {t,n:(n0+n1)/2,s:(s0+s1)/2,rn:Math.max(.009,(n1-n0)*.54+.010),rs:Math.max(.009,(s1-s0)*.54+.009)};});
    return (t,a,extra=0)=>{const at=T.MathUtils.clamp(t,0,.99999)*14,i=Math.floor(at),r=rows[i],q=rows[Math.min(14,i+1)],v=at-i,lerp=k=>T.MathUtils.lerp(r[k],q[k],v);return f.a.clone().addScaledVector(f.axis,t*f.length).addScaledVector(f.front,lerp('n')+Math.cos(a)*(lerp('rn')+extra)).addScaledVector(f.side,lerp('s')+Math.sin(a)*(lerp('rs')+extra)).toArray();};
  }
  function cannon(name,parent,end,pattern,from,to,flute=false){
    const fit=fitLimb(parent,end,pattern);
    for(const [suffix,lo,hi]of [['front',-Math.PI/2,Math.PI/2],['back',Math.PI/2,Math.PI*1.5]]){
      const point=(u,v)=>{const a=T.MathUtils.lerp(lo,hi,u),t=T.MathUtils.lerp(from,to,v),p=V(fit(t,a,.002));if(flute)p.addScaledVector(limbFrame(parent,end).front,.004*Math.max(0,Math.cos(a))**8*Math.sin(v*Math.PI));return p.toArray();};
      shell(name+'-'+suffix,parent,'steel',point,18,7,.0024);rim(name+'-rolled-rim',parent,point,'edge',.0014);
      for(const v of [.18,.78]){const p=point(.04,v);rivet(p,parent);}
    }
    for(const t of [from+.045,to-.045]){
      const point=(u,v)=>fit(t+(v-.5)*.025,u*tau,.005);shell('leather-fastening-band',parent,'leather',point,22,1,.002);const p=fit(t,1.45,.011);buckle(parent,p,.016);
    }
    return fit;
  }
  function elbowKnee(name,parent,p,width,height,material='steel',wing=1){
    const outline=[[-width*.9,height*.22],[-width*.62,height*.50],[0,height*.65],[width*.8,height*.33],[width*wing,-height*.04],[width*.62,-height*.40],[0,-height*.65],[-width*.72,-height*.35]],center=V(p);
    const point=(u,v)=>{const a=u*tau,idx=u*outline.length,i=Math.min(outline.length-1,Math.floor(idx)),j=(i+1)%outline.length,t=idx-i,x=T.MathUtils.lerp(outline[i][0],outline[j][0],t),y=T.MathUtils.lerp(outline[i][1],outline[j][1],t),r=.08+.92*v;return [center.x+x*r,center.y+y*r,center.z+.014*(1-r*r)];};
    shell(name,parent,material,point,40,8,.0025);seam(name+'-rolled-border',parent,'edge',Array.from({length:41},(_,i)=>point(i/40,1)),.0016);rivet([center.x-width*.65,center.y,center.z+.006],parent);
  }
  for(const side of ['R','L']){
    const sign=side==='R'?-1:1,upper='upperarm01.'+side,lower='lowerarm01.'+side,wrist='wrist.'+side,thigh='upperleg01.'+side,knee='lowerleg01.'+side,foot='foot.'+side,sh=bone(upper),el=bone(lower),kn=bone(knee),ank=bone(foot);
    const uf=limbFrame(upper,lower),pauldronWidth=female?.072:.084;
    for(let row=0;row<(female?2:3);row++){
      const start=row===0?-.065:.055+row*.032,end=row===0?.118:.101+row*.032;
      const point=(u,v)=>{const a=T.MathUtils.lerp(-.35,Math.PI+.35,u),t=T.MathUtils.lerp(start,end,v),dome=row===0?Math.sqrt(Math.max(.012,1-((t-.025)/.096)**2)):1,r=pauldronWidth*dome-row*.004;
        return uf.a.clone().addScaledVector(uf.axis,t).addScaledVector(uf.front,Math.cos(a)*r).addScaledVector(uf.side,Math.sin(a)*r*(side==='R'?1:-1)).toArray();};
      // Mirrored angular orientation keeps the outward faces correctly wound.
      const oriented=side==='L'?(u,v)=>point(1-u,v):point;
      shell('forged-pauldron-lame-'+side+'-'+row,upper,'steel',oriented,36,10,.0026);rim('pauldron-rolled-edge',upper,oriented);
      for(const u of [.12,.88])rivet(oriented(u,.75),upper);
      const endPoint=oriented(.5,.86);strap(upper,[endPoint,[endPoint[0],endPoint[1]-.025,endPoint[2]+.007]],.011);
    }
    cannon('rerebrace',upper,lower,/^upperarm/,female?.54:.42,.84);
    cannon('vambrace',lower,wrist,/^(lowerarm|wrist)/,.16,.91);
    elbowKnee('couter-wing',lower,[el.x,el.y,el.z+.059],.041,.046,'steel',1.4);
    const tf=fitLimb(thigh,knee,/^upperleg/),cuFrom=female?.31:.17,cuTo=female?.70:.82;
    const cuisse=(u,v)=>tf(T.MathUtils.lerp(cuFrom,cuTo,v),T.MathUtils.lerp(-1.45,1.45,u),.006);shell('thigh-guard-cuisse-'+side,thigh,'steel',cuisse,26,12,.0027);rim('cuisse-rim',thigh,cuisse);
    for(const t of [cuFrom+.03,cuTo-.02])shell('cuissard-leather-strap',thigh,'leather',(u,v)=>tf(t+(v-.5)*.018,u*tau,.011),30,2,.002);
    for(let row=0;row<(female?2:3);row++){
      const hi=.966-row*.053,lo=hi-.064,point=(u,v)=>{const a=T.MathUtils.lerp(sign>0?.24:-1.12,sign>0?1.12:-.24,u),y=T.MathUtils.lerp(lo,hi,v)-.010*Math.sin(u*Math.PI)*(1-v),rx=(female?.184:.188)+(1-v)*.01;return [Math.sin(a)*rx,y,.030+Math.cos(a)*(.165+(1-v)*.011)];};
      shell('overlapping-tasset-'+side+'-'+row,thigh,'steel',point,18,4,.0024);rim('tasset-rolled-hem',thigh,point,'edge',.0014);for(const u of [.12,.88])rivet(point(u,.75),thigh);
    }
    const gf=cannon('greave-'+side,knee,foot,/^(lowerleg|foot)/,.13,.88,true);
    elbowKnee('poleyn-wing',knee,[kn.x,kn.y,kn.z+.074],.044,.055,'steel',1.30);
    // An articulated sabaton follows the boot last, with separate overlapping lames.
    for(let row=0;row<10;row++){
      const z0=-.034+row*.028,z1=z0+.036,width=.047-Math.max(0,row-4)*.003,point=(u,v)=>{const a=T.MathUtils.lerp(.10,Math.PI-.10,u),z=T.MathUtils.lerp(z0,z1,v),height=.215-Math.max(0,z)*.25;return [ank.x+Math.cos(a)*width,.129+Math.sin(a)*(height-.129),z];};
      shell('sabaton-articulated-lame-'+side+'-'+row,foot,'steel',point,18,3,.002);seam('sabaton-turned-edge',foot,'edge',Array.from({length:19},(_,i)=>point(i/18,0)),.0013);
    }
    const sole=new T.BoxGeometry(.085,.013,.227,1,1,1);sole.translate(ank.x,.122,.068);add('boot-sole',foot,'dark',sole);
    // Finger plates sit on the back of the glove, leaving the palm free to grip.
    for(let finger=2;finger<=5;finger++)for(let segment=1;segment<=3;segment++){
      const name='finger'+finger+'-'+segment+'.'+side,d=defs.get(name),a=V(d.head),b=V(d.tail),f=b.clone().sub(a).normalize(),dorsal=new T.Vector3(0,0,-1);dorsal.addScaledVector(f,-dorsal.dot(f)).normalize();const across=new T.Vector3().crossVectors(f,dorsal),length=a.distanceTo(b),radius=segment===1?.009:.007;
      const point=(u,v)=>{const angle=T.MathUtils.lerp(-1.20,1.20,u);return a.clone().addScaledVector(f,.001+v*length*.86).addScaledVector(dorsal,Math.cos(angle)*radius).addScaledVector(across,Math.sin(angle)*radius).toArray();};
      shell('gauntlet-finger-plate',name,'steel',point,6,2,.0012);
    }
    const palm=bone(wrist),middle=bone('finger3-1.'+side),axis=middle.clone().sub(palm).normalize(),dorsal=new T.Vector3(0,0,-1).addScaledVector(axis,axis.z).normalize(),across=new T.Vector3().crossVectors(axis,dorsal);
    const handPlate=(u,v)=>palm.clone().lerp(middle,v*.88).addScaledVector(dorsal,.015+Math.sin(v*Math.PI)*.008).addScaledVector(across,(u-.5)*.063*(1-v*.20)).toArray();shell('gauntlet-metacarpal-plate',wrist,'steel',handPlate,10,8,.0014);
    const cuff=cannon('gauntlet-cuff',lower,wrist,/^(lowerarm|wrist)/,.83,1.015);
    // The split tabard is restrained by the waist and moves with its own thigh.
    const lo=female?.816:.638,cloth=(u,v)=>{const x=sign*(.008+u*(female?.040:.064)),y=T.MathUtils.lerp(lo,1.003,v)-.016*(1-v)*(1-Math.abs(u-.5)*2),z=.217-.028*v**4+.004*Math.sin(u*Math.PI*4)+.006*Math.sin(v*Math.PI);return [x,y,z];};
    shell('split-tabard-'+side,thigh,'linen',sign<0?(u,v)=>cloth(1-u,v):cloth,12,20,.0013);seam('tabard-sewn-hem',thigh,'leather',Array.from({length:13},(_,i)=>cloth(i/12,0)),.001);
  }
  if(!female){
    const bowl=(u,v)=>{const a=-u*tau,t=.008+v*(Math.PI*.62-.008),y=1.605+Math.cos(t)*.137,rx=.097*Math.sin(t),rz=.132*Math.sin(t);return [Math.sin(a)*rx,y,.025+Math.cos(a)*rz];};
    shell('armor-plate-helmet-bowl','head','steel',bowl,32,18,.003);rim('helmet-rolled-rim','head',bowl,'edge',.0017);
    const visor=(u,v)=>{const a=T.MathUtils.lerp(-1.35,1.35,u),y=T.MathUtils.lerp(1.486+.036*Math.sin(a)**2,1.642,v),r=.158+.016*(1-v),x=Math.sin(a)*.099,z=.027+Math.cos(a)*r+.010*Math.exp(-((a/.12)**2));return [x,y,z];};
    shell('sallet-visor','head','steel',visor,48,24,.0025,(u,v)=>{const a=Math.abs((u-.5)*2.7);return a>.13&&a<.67&&v>.69&&v<.745;});rim('visor-rolled-edge','head',visor,'edge',.0013);
    for(const sign of [-1,1]){rivet([sign*.086,1.603,.074],'head',[sign,0,0],true);}
    for(let row=0;row<3;row++)for(let col=0;col<5;col++){const x=(col-2)*.012,y=1.533+row*.011,g=new T.CircleGeometry(.0017,8);g.translate(x,y,.201-.25*Math.abs(x));add('visor-breathing-vent','head','dark',g);}
    const collar=(u,v)=>{const a=u*tau;return [Math.sin(a)*T.MathUtils.lerp(.093,.078,v),T.MathUtils.lerp(1.410,1.468,v),.023+Math.cos(a)*T.MathUtils.lerp(.092,.072,v)];};shell('gorget','spine03','steel',collar,40,4,.0025);rim('gorget-edge','spine03',collar);
  }
  return parts;
}
