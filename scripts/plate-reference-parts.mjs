// Fitted, layered fantasy plate patterns. All distances are metres in the
// anatomical bind pose; rigid plates are weighted to their articulation joint.
export function buildReferencePlate(c){
  const {T,defs,V,bone,add,shell,seam,rim,rivet,strap,buckle,limbFrame,fitLimb,female}=c;
  const tau=Math.PI*2,lerp=T.MathUtils.lerp,clamp=T.MathUtils.clamp;
  const sample=(f,n=24)=>Array.from({length:n+1},(_,i)=>f(i/n));
  const edge=(name,parent,f,mat='edge',r=.0015)=>seam(name,parent,mat,sample(f,16),r);
  const curve=(name,parent,pts,mat='edge',r=.0013)=>seam(name,parent,mat,pts,r);
  const morph=(rows,y)=>{
    let i=1;while(i<rows.length-1&&y>rows[i][0])i++;
    const a=rows[i-1],b=rows[i],t=clamp((y-a[0])/(b[0]-a[0]),0,1);
    return a.slice(1).map((v,k)=>lerp(v,b[k+1],t));
  };
  // A shield-shaped relief has a closed back, a raised face and a narrow bevel.
  // The border is clockwise so the visible front has an outward +Z normal.
  function relief(name,parent,outline,front,depth=.008,mat='steel',border=true,facing=1){
    let area=0;for(let i=0;i<outline.length;i++){const a=outline[i],b=outline[(i+1)%outline.length];area+=a[0]*b[1]-a[1]*b[0];}
    if(area*facing>0)outline=outline.toReversed();
    const center=outline.reduce((p,q)=>[p[0]+q[0]/outline.length,p[1]+q[1]/outline.length],[0,0]);
    const point=(u,v)=>{
      const at=Math.min(outline.length-1e-7,u*outline.length),i=Math.floor(at),a=outline[i],b=outline[(i+1)%outline.length],t=at-i,r=.004+.996*v;
      const x=lerp(center[0],lerp(a[0],b[0],t),r),y=lerp(center[1],lerp(a[1],b[1],t),r);
      const bevel=v<.85?1-v*.45:(1-v)/.15*.6175;
      return [x,y,front(x,y)+depth*bevel*facing];
    };
    shell(name,parent,mat,point,outline.length*3,6,.0028);
    if(border){edge(name+'-turned-border',parent,u=>point(u,1),'brass',.0016);edge(name+'-bright-bevel',parent,u=>point(u,.91),'edge',.0011);}
    return point;
  }

  const rows=female?
    [[1.075,.130,.155,-.065],[1.12,.133,.166,-.068],[1.18,.145,.184,-.076],[1.24,.164,.192,-.088],[1.29,.173,.179,-.092],[1.34,.159,.143,-.080],[1.41,.124,.089,-.052]]:
    [[1.03,.127,.153,-.075],[1.10,.135,.172,-.080],[1.18,.155,.196,-.092],[1.25,.179,.202,-.100],[1.32,.179,.184,-.095],[1.38,.152,.136,-.070],[1.43,.097,.096,-.048]];
  function front(x,y){
    const [rx,f,b]=morph(rows,y),q=Math.sqrt(Math.max(.015,1-(x/rx)**2));
    const ridge=(female?.0035:.007)*Math.exp(-((x/.014)**2))*Math.sin(clamp((y-1.08)/.28,0,1)*Math.PI);
    const cups=female?.018*Math.exp(-(((Math.abs(x)-.082)/.048)**2)-(((y-1.255)/.049)**2)):0;
    return (f+b)/2+q*(f-b)/2+ridge+cups;
  }
  const top=a=>{
    const side=Math.abs(Math.sin(a));
    if(female)return 1.297+.020*Math.exp(-(((side-.58)/.25)**2))-.014*side**8;
    return 1.373+.029*Math.exp(-(((side-.65)/.20)**2))-.046*side**10;
  };
  const bottom=a=>(female?1.090:1.043)+.020*Math.abs(Math.sin(a))**2;
  const torsoPoint=(a,y)=>{const [rx,f,b]=morph(rows,y),x=Math.sin(a)*rx,z=Math.cos(a)>=0?front(x,y):(f+b)/2+Math.cos(a)*(f-b)/2;return [x,y,z];};
  for(const [name,lo,hi]of [['breastplate',-1.48,1.48],['backplate',1.48,tau-1.48]]){
    const point=(u,v)=>{const a=lerp(lo,hi,u);return torsoPoint(a,lerp(bottom(a),top(a),v));};
    shell(`armor-plate-${female?'female':'male'}-torso ${name}`,'spine03','steel',point,36,16,.0032);
    for(const v of [0,1])edge('cuirass-scalloped-rim','spine03',u=>point(u,v),'brass',.0018);
    for(const u of [0,1])edge('cuirass-side-turnback','spine03',v=>point(u,v),'edge',.0016);
  }
  // Separate raised breast leaves, articulated lower breast (plackart), and
  // recessed divisions read at board scale without painted-on anatomy.
  for(const sign of [-1,1]){
    const outline=(female?
      [[.014,1.280],[.055,1.311],[.118,1.307],[.157,1.273],[.144,1.224],[.080,1.202],[.024,1.224]]:
      [[.004,1.356],[.108,1.386],[.160,1.342],[.153,1.273],[.104,1.221],[.020,1.180],[.004,1.230]]).map(([x,y])=>[x*sign,y]);
    relief(female?'sculpted-breast-cup':'gothic-breast-leaf','spine03',outline,(x,y)=>front(x,y)+.008,female?.016:.018);
    const ribs=(female?
      [[.020,1.197],[.064,1.190],[.122,1.215],[.111,1.134],[.043,1.101],[.014,1.139]]:
      [[.012,1.174],[.107,1.222],[.134,1.181],[.125,1.085],[.040,1.050],[.010,1.091]]).map(([x,y])=>[x*sign,y]);
    relief('articulated-plackart-flute','spine03',ribs,(x,y)=>front(x,y)+.006,.013);
    const trace=(female?[[.054,1.184],[.073,1.159],[.064,1.126]]:[[.046,1.164],[.068,1.139],[.064,1.094]]).map(([x,y])=>[sign*x,y,front(sign*x,y)+.013]);
    curve('chased-plackart-line','spine03',trace,'edge',.0010);
    for(const y of [1.14,1.265]){const p=torsoPoint(sign*1.42,y);strap('spine03',[[p[0]-sign*.014,y,p[2]+.020],[p[0]+sign*.006,y,p[2]-.016]],.014);buckle('spine03',[p[0]-sign*.007,y,p[2]+.012],.016);}
    // Fitted leather bridges sit on the actual shoulder, under the pauldrons.
    const a=sign*.76,p=torsoPoint(a,top(a)),back=torsoPoint(Math.PI-a,top(Math.PI-a));
    const support=sample(t=>{const x=lerp(p[0],back[0],t),z=lerp(p[2],back[2],t);return [x,Math.max(lerp(p[1],back[1],t),c.skinTop(x,z))+.004,z];},16);
    strap('spine03',support,female?.013:.018);
  }
  // A narrow segmented waist leads into pointed, overlapping hip defenses.
  const fauldTop=female?1.043:1.060;
  for(let row=0;row<(female?2:3);row++){
    const high=fauldTop-row*.026,low=high-.034,point=(u,v)=>{const a=u*tau,y=lerp(low,high,v),flare=(fauldTop-y)*.43;return [Math.sin(a)*(.144+flare),y+.006*Math.cos(a*4)*(1-v),.029+Math.cos(a)*(.133+flare*.64)];};
    shell('scalloped-fauld-lame-'+row,'root','steel',point,40,3,.0024);edge('fauld-rolled-hem','root',u=>point(u,0),'brass',.0015);
    for(const a of [.9,tau-.9,Math.PI-.9,Math.PI+.9])rivet(point(a/tau,.7),'root',[Math.sin(a),0,Math.cos(a)]);
  }
  relief('waist-heraldic-clasp','root',[[-.024,1.021],[.024,1.021],[.029,1.000],[0,.978],[-.029,1.000]],()=>.179,.008,'brass');

  // Fitted, closed limb plates have pointed ends, a raised central keel,
  // and narrow closures at their side seams, rather than broad exterior rings.
  function cannon(name,parent,end,pattern,from,to,keel=.006){
    const fit=fitLimb(parent,end,pattern),frame=limbFrame(parent,end);
    for(const [suffix,lo,hi]of [['front',-Math.PI/2,Math.PI/2],['back',Math.PI/2,Math.PI*1.5]]){
      const point=(u,v)=>{
        const a=lerp(lo,hi,u),f=Math.max(0,Math.cos(a)),t=lerp(from-.025*f**6,to+.025*f**4,v),p=V(fit(t,a,.009));
        p.addScaledVector(frame.front,keel*f**12*Math.sin(v*Math.PI));return p.toArray();
      };
      shell(name+'-'+suffix,parent,'steel',point,18,8,.0027);
      for(const v of [0,1])edge(name+'-shaped-rim',parent,u=>point(u,v),'brass',.0015);
      if(suffix==='front'){
        for(const u of [.12,.88])edge(name+'-beveled-flank',parent,v=>{const p=point(u,v);p[2]+=.001;return p;},'edge',.0011);
        edge(name+'-raised-keel',parent,v=>point(.5,v),'edge',.0011);
      }
      for(const v of [.17,.81])rivet(point(.03,v),parent);
    }
    for(const t of [from+.045,to-.045]){
      const p=fit(t,1.48,.006);buckle(parent,p,.012);
    }
    return fit;
  }
  function jointGuard(name,parent,center,sign,width,height){
    const [x,y,z]=center,outline=[[-.72,.40],[0,.92],[.72,.38],[.83,-.18],[.28,-.81],[0,-1.03],[-.46,-.71],[-.84,-.12]].map(([a,b])=>[x+a*width,y+b*height]);
    relief(name,parent,outline,()=>z,.028);
    const wing=[[x+sign*width*.48,y+height*.45],[x+sign*width*1.59,y+height*.13],[x+sign*width*1.34,y-height*.33],[x+sign*width*.48,y-height*.34]];
    relief(name+'-fan-wing',parent,wing,()=>z-.015,.006);
    rivet([x+sign*width*.65,y,z+.012],parent,[0,0,1],true);
  }
  for(const side of ['R','L']){
    const sign=side==='R'?-1:1,upper='upperarm01.'+side,lower='lowerarm01.'+side,wrist='wrist.'+side,thigh='upperleg01.'+side,knee='lowerleg01.'+side,foot='foot.'+side;
    const sh=bone(upper),el=bone(lower),kn=bone(knee),ank=bone(foot),uf=limbFrame(upper,lower),radius=female?.087:.102;
    for(let row=0;row<(female?3:4);row++){
      const from=row===0?-.026:.012+row*.027,to=row===0?.055:.057+row*.027;
      const point=(u,v)=>{
        const a=lerp(-.25,Math.PI+.25,u),out=Math.max(0,Math.sin(a)),peak=out**5;
        const t=lerp(from-.008*peak,to+.020*peak,v);
        const dome=row===0?lerp(.43,1,Math.sin(v*Math.PI*.72)):1;
        const r=(radius-row*.009)*dome+.019*peak*(1-v);
        return uf.a.clone().addScaledVector(uf.axis,t).addScaledVector(uf.front,Math.cos(a)*r).addScaledVector(uf.side,Math.sin(a)*r*(side==='R'?1:-1)).toArray();
      };
      const oriented=side==='L'?(u,v)=>point(1-u,v):point;
      shell('pointed-pauldron-lame-'+side+'-'+row,upper,'steel',oriented,24,6,.003);
      for(const v of [0,1])edge('pauldron-forged-bevel',upper,u=>oriented(u,v),v?'edge':'brass',.0017);
      for(const u of [.08,.92])rivet(oriented(u,.65),upper);
    }
    const outer=uf.side.clone().multiplyScalar(side==='R'?1:-1),crestOutline=[[-.020,-.018],[.014,-.049],[.074,-.027],[.088,.023],[.043,.069],[-.018,.047]].map(([s,t])=>uf.a.clone().addScaledVector(uf.axis,t*.45+.008).addScaledVector(outer,s*(female?.85:1)).toArray());
    const crestDepth=(x,y)=>{const s=(x-sh.x)*outer.x+(y-sh.y)*outer.y;return sh.z+Math.sqrt(Math.max(.00004,radius*radius-s*s))+.003;};
    const crest=relief('pauldron-fan-crest-'+side,upper,crestOutline.map(p=>p.slice(0,2)),crestDepth,.004);
    for(const u of [.10,.45,.78])edge('pauldron-chased-fan',upper,v=>crest(u,lerp(.32,.87,v)),'edge',.0008);
    cannon('rerebrace',upper,lower,/^upperarm/,female?.55:.43,.86,.005);
    cannon('vambrace',lower,wrist,/^(lowerarm|wrist)/,.14,.91,.007);
    jointGuard('couter',lower,[el.x,el.y,el.z+.060],sign,.036,.043);

    const tf=fitLimb(thigh,knee,/^upperleg/),cuFrom=female?.31:.18,cuTo=female?.80:.87;
    const cuisse=(u,v)=>{const width=female?lerp(1.16,.82,v)+.22*Math.sin(v*Math.PI):lerp(1.46,1.15,v),a=lerp(-width,width,u),t=lerp(cuFrom+.09*Math.max(0,Math.cos(a))**2,cuTo+.055*Math.cos(a)**4,v),p=V(tf(t,a,.005));p.z+=.005*Math.max(0,Math.cos(a))**10*Math.sin(v*Math.PI);return p.toArray();};
    shell('thigh-guard-pointed-cuisse-'+side,thigh,'steel',cuisse,24,10,.0027);
    for(const v of [0,1])edge('cuisse-shaped-bevel',thigh,u=>cuisse(u,v),'brass',.0015);
    edge('cuisse-central-flute',thigh,v=>cuisse(.5,v),'edge',.0012);
    for(const t of [cuFrom+.07,cuTo-.03]){
      const retaining=(u,v)=>tf(t+(v-.5)*.016,lerp(1.05,tau-1.05,u),-.003);
      shell('cuisse-rear-retaining-strap',thigh,'leather',retaining,24,1,.0016);
      const p=tf(t,1.50,.001);buckle(thigh,p,.012);
    }

    // Hip petals and long male tassets share the leg joint; the central tabard
    // remains split so walking does not stretch a single rigid skirt.
    const hipFront=(x,y)=>.029+Math.sqrt(Math.max(.02,1-(x/.215)**2))*(.158+(.98-y)*.045);
    const hip=(female?
      [[.064,1.006],[.155,1.019],[.206,.970],[.211,.885],[.150,.829],[.110,.899]]:
      [[.068,1.012],[.166,1.025],[.209,.970],[.235,.797],[.166,.726],[.111,.840]]).map(([x,y])=>[sign*x,y]);
    relief('pointed-hip-tasset-'+side,thigh,hip,hipFront,.023);
    const topHip=(female?[[.072,1.012],[.166,1.028],[.211,.983],[.172,.944],[.109,.974]]:[[.077,1.018],[.169,1.035],[.214,.979],[.183,.923],[.112,.975]]).map(([x,y])=>[sign*x,y]);
    relief('overlapping-hip-petal-'+side,thigh,topHip,(x,y)=>hipFront(x,y)+.010,.007);
    const rearHip=(female?[[.025,1.008],[.146,1.020],[.194,.974],[.163,.908],[.095,.883],[.035,.925]]:[[.023,1.012],[.151,1.028],[.204,.969],[.198,.867],[.111,.814],[.038,.899]]).map(([x,y])=>[sign*x,y]);
    const rearDepth=(x,y)=>-.045-Math.sqrt(Math.max(.02,1-(x/.21)**2))*(.105+(.98-y)*.14);
    relief('rear-hip-defense-'+side,thigh,rearHip,rearDepth,.008,'steel',true,-1);
    const lo=female?.823:.545;
    const cloth=(u,v)=>{const width=lerp(female?.025:.053,female?.049:.066,v),x=sign*(.0007+u*width),y=lerp(lo,1.017,v)-.020*(1-v)*Math.sin(u*Math.PI),z=lerp(.225,.202,v)+.0025*Math.sin(u*Math.PI*2)+.003*Math.sin(v*Math.PI);return [x,y,z];};
    const orientedCloth=sign<0?(u,v)=>cloth(1-u,v):cloth;
    shell('ivory-split-tabard-'+side,thigh,'linen',orientedCloth,12,18,.0012);
    edge('tabard-embroidered-hem',thigh,u=>cloth(u,0),'brass',.0008);
    for(const u of [0,1])edge('tabard-stitched-selvedge',thigh,v=>cloth(u,v),'leather',.0006);

    cannon('greave-'+side,knee,foot,/^(lowerleg|foot)/,.02,.92,.008);
    jointGuard('poleyn',knee,[kn.x,kn.y,kn.z+.067],sign,.041,.068);
    // Fine steel lames overlap toward the toes, with a closed tapered toe cap.
    for(let row=0;row<8;row++){
      const z0=-.035+row*.034,z1=z0+.043,width=.047-Math.max(0,row-3)*.003;
      const point=(u,v)=>{const a=lerp(.07,Math.PI-.07,u),z=lerp(z0,z1,v),height=.215-Math.max(0,z)*.24;return [ank.x+Math.cos(a)*width,.127+Math.sin(a)*(height-.127),z];};
      shell('sabaton-overlapping-lame-'+side+'-'+row,foot,'steel',point,16,3,.0022);edge('sabaton-bevel',foot,u=>point(u,1),'edge',.0011);
    }
    const toe=(u,v)=>{const a=lerp(.07,Math.PI-.07,u);return [ank.x+Math.cos(a)*lerp(.034,.023,v),.128+Math.sin(a)*.027*(1-v),.246+.020*v];};
    shell('sabaton-closed-toe',foot,'steel',toe,16,4,.0022);
    const heel=(u,v)=>{const a=lerp(Math.PI/2,Math.PI*1.5,u);return [ank.x+Math.sin(a)*.042,lerp(.126,.210,v),-.005+Math.cos(a)*.047];};
    shell('sabaton-heel-counter',foot,'steel',heel,20,5,.0025);edge('heel-turned-edge',foot,u=>heel(u,1),'edge',.0012);
    const sole=new T.BoxGeometry(.085,.012,.264);sole.translate(ank.x,.121,.083);add('leather-boot-sole',foot,'dark',sole);

    // Articulated fingers and a shaped metacarpal plate leave the palm free.
    for(let finger=2;finger<=5;finger++)for(let segment=1;segment<=3;segment++){
      const name=`finger${finger}-${segment}.${side}`,d=defs.get(name),a=V(d.head),b=V(d.tail),axis=b.clone().sub(a).normalize(),dorsal=new T.Vector3(0,0,-1);dorsal.addScaledVector(axis,-dorsal.dot(axis)).normalize();
      const across=new T.Vector3().crossVectors(axis,dorsal),length=a.distanceTo(b),r=segment===1?.009:.007;
      const point=(u,v)=>{const angle=lerp(-1.2,1.2,u);return a.clone().addScaledVector(axis,.001+v*length*.87).addScaledVector(dorsal,Math.cos(angle)*r).addScaledVector(across,Math.sin(angle)*r).toArray();};
      shell('gauntlet-finger-lame',name,'steel',point,6,2,.0012);
    }
    const palm=bone(wrist),middle=bone('finger3-1.'+side),axis=middle.clone().sub(palm).normalize(),dorsal=new T.Vector3(0,0,-1).addScaledVector(axis,axis.z).normalize(),across=new T.Vector3().crossVectors(axis,dorsal);
    const hand=(u,v)=>palm.clone().lerp(middle,v*.88).addScaledVector(dorsal,.016+Math.sin(v*Math.PI)*.010).addScaledVector(across,(u-.5)*.061*(1-v*.22)).toArray();
    shell('gauntlet-sculpted-backplate',wrist,'steel',hand,10,7,.0015);edge('gauntlet-backplate-ridge',wrist,v=>hand(.5,v),'edge',.0011);
    cannon('gauntlet-flared-cuff',lower,wrist,/^(lowerarm|wrist)/,.83,1.01,.004);
  }

  if(!female){
    const helmetRows=[[1.50,.074,.124,-.070],[1.59,.091,.170,-.088],[1.66,.087,.155,-.078],[1.71,.069,.118,-.058],[1.746,.024,.060,-.018],[1.755,.001,.026,.024]];
    const crown=(u,v)=>{const a=u*tau,y=lerp(1.50,1.755,v),[rx,f,b]=morph(helmetRows,y);return [Math.sin(a)*rx,y,(f+b)/2+Math.cos(a)*(f-b)/2];};
    shell('armor-plate-helmet-peaked-crown','head','steel',crown,40,24,.003,(u,v)=>Math.cos(u*tau)>.15&&lerp(1.50,1.755,v)<1.649);
    edge('helmet-crown-crest','head',v=>crown(0,lerp(.61,.997,v)),'edge',.0020);
    const visor=(u,v)=>{const a=lerp(-1.45,1.45,u),low=1.477+.063*Math.abs(Math.sin(a))**1.4,high=1.651-.012*Math.abs(Math.sin(a)),y=v<.625?lerp(low,1.595,v/.625):v<.75?lerp(1.595,1.607,(v-.625)/.125):lerp(1.607,high,(v-.75)/.25),x=Math.sin(a)*.095,z=.026+Math.cos(a)*.150+.035*Math.exp(-Math.abs(a/.21))*Math.sin(v*Math.PI)**.4;return [x,y,z];};
    shell('angular-closed-visor','head','steel',visor,40,24,.0028,(u,v)=>{const a=Math.abs((u-.5)*2.9);return v>.625&&v<.75&&a>.065&&a<.86;});
    const eyeShadow=(u,v)=>{const a=lerp(-.97,.97,u),y=lerp(1.592,1.612,v),lo=1.477+.063*Math.abs(Math.sin(a))**1.4,hi=1.651-.012*Math.abs(Math.sin(a)),p=visor((a+1.45)/2.9,(y-lo)/(hi-lo));p[2]-=.006;return p;};
    shell('visor-recessed-eye-shadow','head','dark',eyeShadow,32,2,.0008);
    for(const v of [0,1])edge('visor-forged-rim','head',u=>visor(u,v),'brass',.0015);
    edge('visor-nose-keel','head',v=>visor(.5,v),'edge',.0015);
    for(const sign of [-1,1]){
      rivet([sign*.094,1.616,.070],'head',[sign,0,0],true);
      for(let row=0;row<3;row++)for(let col=0;col<3;col++){
        const a=sign*(.30+col*.15),y=1.548+row*.011,u=(a+1.45)/2.9,low=1.477+.063*Math.abs(Math.sin(a))**1.4,v=clamp((y-low)/(1.595-low)*.625,0,.625),p=visor(u,v),g=new T.CircleGeometry(.0018,8);g.rotateY(a);g.translate(p[0]+Math.sin(a)*.0008,p[1],p[2]+.0013);add('visor-punched-vent','head','dark',g);
      }
    }
    for(let row=0;row<2;row++){
      const collar=(u,v)=>{const a=u*tau,y=lerp(1.412+row*.025,1.447+row*.025,v),r=lerp(.092,.078,v)-row*.006;return [Math.sin(a)*r,y+.006*Math.cos(a)**2,.022+Math.cos(a)*r];};
      shell('articulated-gorget-lame-'+row,'spine03','steel',collar,32,3,.0025);edge('gorget-bright-turnback','spine03',u=>collar(u,1),'edge',.0014);
    }
  }
}
