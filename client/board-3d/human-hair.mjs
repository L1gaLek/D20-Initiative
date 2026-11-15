import * as THREE from '../../vendor/three/three.module.mjs';

export function headMapping(definitions,reference){
  const eye=definitions.get('eye.L').head,refEye=reference.get('eye.L').head,head=definitions.get('head').head,refHead=reference.get('head').head;
  const scale=[eye[0]/refEye[0],(1.676-eye[1])/(1.676-refEye[1]),(eye[2]-head[2])/(refEye[2]-refHead[2])];
  const point=p=>[p[0]*scale[0],1.676+(p[1]-1.676)*scale[1],head[2]+(p[2]-refHead[2])*scale[2]];
  const inverse=p=>[p[0]/scale[0],1.676+(p[1]-1.676)/scale[1],refHead[2]+(p[2]-head[2])/scale[2]];
  return {point,inverse,scale};
}

export function createHair({config,female,materials:m,surface,attach,sphere,curve,headFit}){
  const style=config.hair||(female?'bob':'short');if(style==='bald')return;
  m.hair.side=THREE.DoubleSide;
  const point=headFit.point,unfit=headFit.inverse;
  const line=(material,points,r=.001,steps=20)=>curve('head',material,points.map(point),r,steps);
  const orb=(material,p,r)=>sphere('head',material,point(p),r.map((v,i)=>v*headFit.scale[i]));
  const hairline=p=>{const [x,y,z]=unfit(p),front=THREE.MathUtils.smoothstep(z,.035,.115);return y-(1.555+front*.067+Math.abs(x)*.10);};
  const cap=surface(m.hair,p=>unfit(p)[1]>1.53,.0048,p=>{
    const q=unfit(p),top=THREE.MathUtils.smoothstep(q[1],1.62,1.67);
    if(style==='parted'||style==='bob'){q[1]+=.010*top;q[0]+=.004*top;}
    if(style==='swept'||style==='pixie'){q[1]+=.014*top;q[2]-=.006*top;}
    if(style==='mohawk')q[1]+=.035*top*Math.exp(-((q[0]/.018)**2));
    p.splice(0,3,...point(q));
  },[hairline]);cap.name='fitted-hair';
  const highlight=m.hair.clone();highlight.color.offsetHSL(0,-.03,.055);
  for(let i=0;i<86;i++){
    const angle=i/86*Math.PI*2,points=[];
    for(let j=0;j<8;j++){
      const t=.12+j*.13,front=Math.cos(angle),theta=t*(front>0?1:1.5);
      let x=Math.sin(angle)*Math.sin(theta)*.068,y=1.585+Math.cos(theta)*.092,z=.046+front*Math.sin(theta)*.079;
      if(style==='parted'||style==='bob'){x+=.007*Math.cos(theta);y+=.009*Math.cos(theta);}
      if(style==='swept'||style==='pixie'){z-=.006*Math.cos(theta);y+=.012*Math.cos(theta);}
      if(style==='mohawk')y+=.028*Math.exp(-((x/.018)**2))*Math.cos(theta);
      points.push([x,y,z]);
    }
    line(i%3?m.hair:highlight,points,.00065,12);
  }
  if(style==='bob'||style==='long'){
    const rows=style==='bob'?[[1.63,.057,.071,.04],[1.59,.075,.088,.04],[1.55,.078,.092,.04],[1.505,.076,.087,.035]]:
      [[1.63,.058,.074,.04],[1.58,.079,.09,.04],[1.51,.082,.09,.025],[1.43,.090,.054,-.055],[1.34,.10,.032,-.105],[1.24,.11,.028,-.117]];
    const segments=48,positions=[],indices=[];
    const hairPoint=(row,col)=>{
      const [y,r,d,z]=rows[row],a=.64+col/segments*(Math.PI*2-1.28),wave=style==='long'?Math.sin(a*8+y*35)*.004:0;
      return [Math.sin(a)*(r+wave),y+(row===rows.length-1?Math.sin(a*5)*.003:0),z+Math.cos(a)*(d+wave)];
    };
    for(let row=0;row<rows.length;row++)for(let col=0;col<=segments;col++)positions.push(...point(hairPoint(row,col)));
    for(let row=0;row<rows.length-1;row++)for(let col=0;col<segments;col++){const a=row*(segments+1)+col,b=a+segments+1;indices.push(a,b,a+1,a+1,b,b+1);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const mesh=attach('head',geometry,m.hair);mesh.name='hair-'+style;
    for(let col=0;col<=segments;col++)line(col%3?m.hair:highlight,rows.map((_,row)=>hairPoint(row,col)),.0008,20);
    if(style==='bob'){
      const vertices=[],faces=[],cols=28,rows=7;
      for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++){
        const t=row/rows,x=(col/cols-.5)*.094,p=headFit.front(point([x*(.8+.2*t),1.655-t*.041+Math.abs(x)*.06,.1+t*.038-Math.abs(x)*.25]));p[2]+=.002;vertices.push(...p);
      }
      for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){const a=row*(cols+1)+col,b=a+cols+1;faces.push(a,b,a+1,a+1,b,b+1);}
      const fringe=new THREE.BufferGeometry();fringe.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));fringe.setIndex(faces);fringe.computeVertexNormals();attach('head',fringe,m.hair);
    }
  }
  if(style==='tied'||style==='braid'){
    orb(m.hair,[0,1.576,-.066],[.032,.03,.027]);
    const length=style==='braid'?.25:female?.19:.105,end=1.565-length;
    if(style==='braid'){
      for(let strand=0;strand<3;strand++){
        const points=[];for(let i=0;i<=60;i++){const t=i/60,a=t*Math.PI*11+strand/3*Math.PI*2;points.push([Math.sin(a)*(.011-t*.004),1.565-t*length,-.092+Math.cos(a)*.007-t*.025]);}
        line(strand===1?highlight:m.hair,points,.0075,80);
      }
    }else{
      line(m.hair,[[0,1.575,-.075],[.006,1.53,-.086],[.012,end,-.096]],.016);
      for(let i=0;i<12;i++)line(highlight,[[Math.sin(i)*.018,1.58,-.085],[Math.sin(i)*.012,1.53,-.099],[Math.sin(i)*.009,end,-.106]],.0009,16);
    }
    const band=new THREE.TorusGeometry(.013,.003,6,18);band.rotateX(Math.PI/2);band.translate(...point([0,end+.009,-.11]));attach('head',band,m.dark);
  }
  if(style==='bun'){
    orb(m.hair,[0,1.612,-.060],[.034,.030,.029]);
    for(let j=0;j<8;j++){
      const points=[];for(let i=0;i<=32;i++){const a=i/32*Math.PI*2;points.push([Math.cos(a)*(.022+j*.0012),1.612+Math.sin(a)*(.020+j*.001),-.075-j*.0012]);}
      line(j%2?m.hair:highlight,points,.0015,36);
    }
  }
}
