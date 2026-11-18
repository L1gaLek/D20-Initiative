// Cross-sections of the actual anatomical mesh, shared by every suit of a sex.
// This keeps a padded garment outside the skin without inflating its chest.
const cache=new WeakMap();
export function torsoFit(body){
  if(cache.has(body))return cache.get(body);
  const decode=(s,Type)=>new Type(Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer);
  const positions=decode(body.positions,Float32Array),indices=decode(body.indices,Uint16Array),joints=decode(body.skinIndices,Uint8Array),weights=decode(body.skinWeights,Uint8Array);
  const allowed=Array.from({length:positions.length/3},(_,i)=>{let k=0;for(let j=1;j<4;j++)if(weights[i*4+j]>weights[i*4+k])k=j;return Math.abs(positions[i*3])<.23&&!/arm|wrist|finger|metacarpal|hand|neck|head/i.test(body.bones[joints[i*4+k]].name);});
  const rows=[];
  for(let row=0;row<=43;row++){
    const y=1.015+row*.01,segments=[];
    for(let i=0;i<indices.length;i+=3){
      const face=[indices[i],indices[i+1],indices[i+2]];if(face.some(v=>!allowed[v]))continue;
      const cut=[];
      for(let j=0;j<3;j++){
        const a=face[j]*3,b=face[(j+1)%3]*3,ya=positions[a+1],yb=positions[b+1];
        if((ya<=y&&yb>y)||(yb<=y&&ya>y)){const t=(y-ya)/(yb-ya);cut.push([positions[a]+(positions[b]-positions[a])*t,positions[a+2]+(positions[b+2]-positions[a+2])*t]);}
      }
      if(cut.length===2)segments.push(cut);
    }
    // Removing the arms leaves an open armpit boundary in some skin sections.
    // A closed convex pattern bridges that boundary instead of collapsing a
    // radial sample inward and cutting holes into the assembled garment.
    const points=segments.flat(1).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const chain=pts=>{const result=[];for(const point of pts){while(result.length>1&&cross(result.at(-2),result.at(-1),point)<=1e-10)result.pop();result.push(point);}return result;};
    const lower=chain(points),upper=chain(points.toReversed()),hull=[...lower.slice(0,-1),...upper.slice(0,-1)];
    const outline=hull.length>=3?hull.map((p,i)=>[p,hull[(i+1)%hull.length]]):[];
    const zs=hull.map(p=>p[1]),xs=hull.map(p=>Math.abs(p[0])),center=(Math.max(...zs)+Math.min(...zs))/2;
    let rx=Math.max(...xs)+.014,rz=(Math.max(...zs)-Math.min(...zs))/2+.014;
    const stretch=Math.max(1,...hull.map(([x,z])=>Math.hypot(x/rx,(z-center)/rz)));
    rx*=stretch;rz*=stretch;rows.push({segments:outline,center,rx,rz});
  }
  const valid=rows.filter(row=>row.segments.length);
  if(!valid.length)throw Error('The body has no usable torso cross-sections.');
  for(let i=0;i<rows.length;i++)if(!rows[i].segments.length){const nearest=rows.map((row,j)=>({row,d:Math.abs(j-i)})).filter(x=>x.row.segments.length).sort((a,b)=>a.d-b.d)[0].row;rows[i]=nearest;}
  function between(y,fn){const at=Math.max(0,Math.min(42.9999,(y-1.015)/.01)),i=Math.floor(at),t=at-i,a=fn(rows[i]),b=fn(rows[i+1]);return a.map((v,k)=>v+(b[k]-v)*t);}
  const section=y=>between(y,row=>[row.rx,row.rz,row.center]);
  const fit={
    // A smooth elliptical pattern contains the sampled body hull. It follows
    // the measurements without inheriting anatomical creases or open seams.
    point(y,a,extra=0){const [rx,rz,center]=section(y);return [Math.sin(a)*(rx+extra),y,center+Math.cos(a)*(rz+extra)];},
    front(x,y,extra=0){
      const [rx,rz,center]=section(y),q=Math.sqrt(Math.max(.015,1-(x/(rx+.005))**2));
      return [x,y,center+q*(rz+.005)+extra];
    }
  };
  cache.set(body,fit);return fit;
}
