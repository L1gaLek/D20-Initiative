// Keep exported skins portable across viewers (a skeleton root must contain
// every joint; generated skinned meshes have identity transforms at scene root).
export function portableGLB(buffer){
  const bytes=new Uint8Array(buffer),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=view.getUint32(12,true),doc=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+n))),parents=new Map();
  doc.nodes.forEach((node,i)=>(node.children||[]).forEach(j=>parents.set(j,i)));
  const ancestors=i=>{const out=[];while(i!==undefined){out.push(i);i=parents.get(i);}return out;};
  for(const skin of doc.skins||[]){const paths=skin.joints.map(ancestors),root=paths[0].find(i=>paths.every(p=>p.includes(i)));if(root!==undefined)skin.skeleton=root;}
  const moved=new Set();for(const [i,node]of doc.nodes.entries())if(node.skin!==undefined&&!(node.translation||[]).some(v=>Math.abs(v)>1e-7)&&!(node.rotation||[0,0,0,1]).some((v,k)=>Math.abs(v-(k===3?1:0))>1e-7)&&!(node.scale||[1,1,1]).some(v=>Math.abs(v-1)>1e-7))moved.add(i);
  for(const node of doc.nodes)if(node.children)node.children=node.children.filter(i=>!moved.has(i));for(const scene of doc.scenes||[])scene.nodes=[...new Set([...(scene.nodes||[]),...moved])];
  const json=new TextEncoder().encode(JSON.stringify(doc)),padded=Math.ceil(json.length/4)*4,tail=bytes.subarray(20+n),out=new Uint8Array(20+padded+tail.length),v=new DataView(out.buffer);out.set(bytes.subarray(0,12));v.setUint32(8,out.length,true);v.setUint32(12,padded,true);v.setUint32(16,0x4e4f534a,true);out.fill(32,20,20+padded);out.set(json,20);out.set(tail,20+padded);return out;
}
