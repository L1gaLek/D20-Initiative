const vm=require('node:vm');
const {read,functions,clone}=require('./room-harness.cjs');
module.exports=function installMapHarness(h,state){
 const tokens=new Map(),fog=new Map(),meta=new Map(state.maps.map(m=>[m.id,{board_width:m.boardWidth||10,board_height:m.boardHeight||10}]));
 for(const p of state.players)if(p.x!=null&&p.y!=null)tokens.set('map-1::'+p.id,{room_id:'test-room',map_id:'map-1',token_id:p.id,owner_id:p.ownerId,x:p.x,y:p.y,size:p.size||1,is_public:true});
 const original=h.context.pool;
 const query=async(sql,v=[],fallback=original)=>{
  const q=sql.toLowerCase();
  if(q.includes('from public.room_map_meta'))return {rows:meta.has(v[1])?[meta.get(v[1])]:[]};
  if(q.includes('insert into public.room_tokens')){
   const row={room_id:v[0],map_id:v[1],token_id:v[2],owner_id:v[3],x:v[4],y:v[5],size:v[6],color:v[7],is_public:v[8],updated_at:new Date().toISOString()};tokens.set(v[1]+'::'+v[2],row);return {rows:[clone(row)]};
  }
  if(q.includes('from public.room_tokens'))return {rows:[...tokens.values()].filter(r=>r.map_id===v[1]&&(q.includes('token_id <>')?r.token_id!==v[2]:r.token_id===v[2])).map(clone)};
  if(q.includes('insert into public.room_fog')){const row={room_id:v[0],map_id:v[1],settings:JSON.parse(v[2]),manual_stamps:JSON.parse(v[3]),explored_packed:v[4]};fog.set(v[1],row);return {rows:[clone(row)]};}
  if(q.includes('insert into public.room_log'))return {rows:[]};
  return fallback.query(sql,v);
 };
 h.context.pool={query,connect:async()=>{const client=await original.connect();return {query:(sql,v)=>query(sql,v,client),release:()=>client.release()};}};
 Object.assign(h.context,{ROOM_ID_RE:/./,HEX_COLOR_RE:/^#[a-f0-9]{6}$/i,clampNumber:(v,min,max,def)=>Number.isFinite(Number(v))?Math.max(min,Math.min(max,Number(v))):def,boolFrom:(v,d)=>typeof v==='boolean'?v:d});
 vm.runInContext(functions(read('backend/server.js'),['getActiveMapId','findMapById','getStateMapBounds','getMapBounds','ensureCanControlPlayer','ensureCanMoveInCombat','sanitizeTokenSize','validateBoardPosition','overlaps','ensureTokenAreaFree','upsertTokenRowUsing','getTokenRow','resolveTokenPublicForWrite','broadcastTokenMoveRollback','handleMoveToken','cleanFogRow','fogJsonParam','handleFogRow']),h.context);
 return {tokens,fog,meta};
};
