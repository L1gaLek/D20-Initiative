// Shared numerical geometry and event parsing; no DOM, renderer or random rolls.
export const CHUNK_SIZE = 40;
export const PALETTE=['#722f38','#215e65','#263e72','#77512d','#573b79','#2c624c'];
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const n=Math.hypot(...a);return a.map(v=>v/n);};
export function hull(vertices) {
  const faces=[],seen=new Set(),epsilon=1e-6;
  for(let a=0;a<vertices.length-2;a++)for(let b=a+1;b<vertices.length-1;b++)for(let c=b+1;c<vertices.length;c++){
    let n=cross(sub(vertices[b],vertices[a]),sub(vertices[c],vertices[a]));
    if(Math.hypot(...n)<epsilon)continue;n=unit(n);
    let d=dot(n,vertices[a]),distances=vertices.map(v=>dot(n,v)-d);
    if(distances.some(v=>v>epsilon)&&distances.some(v=>v<-epsilon))continue;
    if(d<0){n=n.map(v=>-v);d=-d;distances=distances.map(v=>-v);}
    const indices=distances.flatMap((v,i)=>Math.abs(v)<epsilon?[i]:[]),key=indices.join(',');
    if(seen.has(key))continue;seen.add(key);
    const center=[0,1,2].map(axis=>indices.reduce((sum,i)=>sum+vertices[i][axis],0)/indices.length);
    const u=unit(sub(vertices[indices[0]],center)),v=cross(n,u);
    indices.sort((a,b)=>Math.atan2(dot(sub(vertices[a],center),v),dot(sub(vertices[a],center),u))-Math.atan2(dot(sub(vertices[b],center),v),dot(sub(vertices[b],center),u)));
    faces.push({indices,normal:n,center});
  }
  return faces;
}
const shapes=new Map();
export function polyhedron(sides) {
  if(shapes.has(sides))return shapes.get(sides);
  const p=(1+Math.sqrt(5))/2;let vertices=[];
  if(sides===4)vertices=[[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]];
  else if(sides===6)for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])vertices.push([x,y,z]);
  else if(sides===8)for(let axis=0;axis<3;axis++)for(const sign of [-1,1])vertices.push([0,0,0].map((_,i)=>i===axis?sign:0));
  else if(sides===20)for(const a of [-1,1])for(const b of [-p,p])vertices.push([0,a,b],[a,b,0],[b,0,a]);
  else if(sides===12){
    for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])vertices.push([x,y,z]);
    for(const a of [-1/p,1/p])for(const b of [-p,p])vertices.push([0,a,b],[a,b,0],[b,0,a]);
  }else if(sides===10){
    const antiprism=[];
    for(let ring=0;ring<2;ring++)for(let i=0;i<5;i++){
      const angle=2*Math.PI*(i+ring*.5)/5;antiprism.push([Math.cos(angle),ring?-.5:.5,Math.sin(angle)]);
    }
    vertices=hull(antiprism).map(f=>f.normal.map(v=>v/dot(f.normal,f.center)));
  }else{
    // d2 is a coin. Non-standard dice retain their exact numerical outcome on
    // a numbered prism; normal game controls use the platonic dice above.
    const n=sides===2?24:Math.min(100,Math.max(3,sides));
    for(const y of [sides===2?-.13:-.45,sides===2?.13:.45])for(let i=0;i<n;i++)vertices.push([Math.cos(2*Math.PI*i/n),y,Math.sin(2*Math.PI*i/n)]);
  }
  const radius=Math.max(...vertices.map(v=>Math.hypot(...v)));vertices=vertices.map(v=>v.map(x=>x/radius));
  const faces=hull(vertices);
  const eligible=faces.flatMap((f,i)=>sides===2?(Math.abs(f.normal[1])>.99?[i]:[]):sides===4?[i]:sides!==10&&![6,8,12,20].includes(sides)?(Math.abs(f.normal[1])<.5?[i]:[]):[i]);
  const labels=Array(faces.length).fill(null);let next=1;
  for(const index of eligible){
    if(labels[index]!==null)continue;
    labels[index]=next;
    const opposite=eligible.find(i=>i!==index&&dot(faces[i].normal,faces[index].normal)<-.99999);
    if(opposite!==undefined&&labels[opposite]===null)labels[opposite]=sides+1-next;
    next++;
  }
  const result={sides,vertices,faces,eligible,labels};shapes.set(sides,result);return result;
}
export function faceLabels(shape, upFace, value, mode='normal') {
  const labels=[...shape.labels],source=labels.indexOf(value);
  if(source>=0&&source!==upFace){
    const opposite=index=>shape.eligible.find(i=>dot(shape.faces[i].normal,shape.faces[index].normal)<-.99999);
    const a=opposite(upFace),b=opposite(source);
    [labels[upFace],labels[source]]=[labels[source],labels[upFace]];
    if(a!==undefined&&b!==undefined&&a!==source)[labels[a],labels[b]]=[labels[b],labels[a]];
  }
  return labels.map(label=>label===null?null:mode==='tens'?String((label%10)*10).padStart(2,'0'):mode==='ones'?String(label%10):String(label));
}
export function seedNumber(text) { let h=2166136261;for(const c of String(text)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0; }
export function random(seed){let state=seed>>>0;return()=>{state+=0x6D2B79F5;let x=state;x=Math.imul(x^x>>>15,x|1);x^=x+Math.imul(x^x>>>7,x|61);return((x^x>>>14)>>>0)/4294967296;};}
export function criticalKind(die) { return Number(die.sides)===20 ? (Number(die.value)===20?'success':Number(die.value)===1?'failure':'') : ''; }
export function normalizeEvent(event) {
  const rolls=Array.isArray(event?.rolls)?event.rolls.map(Number):[];
  if(!rolls.length||rolls.some(v=>!Number.isInteger(v)))return null;
  let parts=Array.isArray(event.damageParts)?event.damageParts.filter(p=>p?.type==='dice'):[];
  if(!parts.length){
    parts=Array.from(String(event.kindText||'').matchAll(/(\d{1,2})d(\d{1,3})\s*\[([\d\s+]+)\]/g),m=>({count:Number(m[1]),sides:Number(m[2]),rolls:m[3].split('+').map(v=>Number(v.trim()))}));
  }
  let dice=parts.flatMap(part=>(Array.isArray(part.rolls)?part.rolls:[]).map(value=>({sides:Number(part.sides),value:Number(value)})));
  if(dice.length!==rolls.length||dice.some((d,i)=>d.value!==rolls[i]))dice=rolls.map(value=>({sides:Number(event.sides),value}));
  if(dice.some(d=>!Number.isInteger(d.sides)||d.sides<2||d.sides>100||d.value<1||d.value>d.sides))return null;
  const physical=dice.flatMap((die,index)=>die.sides===100?[
    {sides:10,value:Math.floor((die.value%100)/10)||10,mode:'tens',rollIndex:index},
    {sides:10,value:die.value%10||10,mode:'ones',rollIndex:index}
  ]:[{...die,mode:'normal',rollIndex:index}]);
  const rawPower=Number(event.throwPower),power=Number.isFinite(rawPower)?Math.round(Math.max(0,Math.min(1,rawPower))*100)/100:0;
  physical.forEach(die=>{die.critical=criticalKind(die);die.throwPower=power;});
  const nonce=String(event.localNonce||event.id||''),name=String(event.fromName||'Игрок').slice(0,120);
  const seed=[event.fromId,nonce,event.sides,rolls.join(','),event.total].join('|');
  return {dice:physical.slice(0,200),omitted:Math.max(0,physical.length-200),rolls,name,
    sides:Number(event.sides),total:Number(event.total),bonus:Number(event.bonus)||0,
    fromId:String(event.fromId||''),kind:String(event.kindText||'Бросок').slice(0,500),
    id:nonce,seed,crit:String(event.crit||'')};
}
