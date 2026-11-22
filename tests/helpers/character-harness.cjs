const {CharacterStore,metadata}=require('../../backend/shared/character-store');
const clone=v=>JSON.parse(JSON.stringify(v));
module.exports=function(){
  const records=new Map(),queries=[];let sequence=0,fail=false;
  const pool={async query(sql,args){
    queries.push(sql);
    if(fail&&sql.startsWith('update')){fail=false;throw new Error('offline');}
    const [id,user]=args,row=records.get(id);
    if(!row||row.user!==user)return {rows:[],rowCount:0};
    if(sql.startsWith('select'))return {rows:[clone(row)]};
    if(sql.startsWith('update')){
      if(String(row.version)!==args[4])return {rows:[]};
      Object.assign(row,{state:clone(args[2]),name:args[3],version:String(+row.version+1),updated_at:new Date().toISOString()});
      return {rows:[{id,name:row.name,version:row.version,updated_at:row.updated_at}]};
    }
    throw new Error('Unhandled character query');
  }};
  const store=new CharacterStore(pool);
  function add(user,name,state){const id='saved-'+(++sequence);const row={id,user,name,state:clone(state),version:'1',updated_at:new Date().toISOString()};records.set(id,row);return metadata(row);}
  add('user-1','Альрик',{schemaVersion:1,savedAt:'2026-11-21T12:00:00Z',data:{parsed:{name:{value:'Альрик'},notes:{value:'До правок'}}}});
  add('user-1','Альрик',{schemaVersion:1,savedAt:'2026-11-22T12:00:00Z',data:{parsed:{name:{value:'Альрик'},notes:{value:'Второе сохранение'}}}});
  add('user-1','Сари',{schemaVersion:1,savedAt:'2026-11-22T12:00:00Z',data:{parsed:{name:{value:'Сари'},notes:{value:'Заметки Сари'}}}});
  add('user-2','Чужой',{schemaVersion:1,data:{parsed:{name:{value:'Чужой'}}}});
  return {store,pool,records,queries,add,failNext:()=>{fail=true;},list:user=>[...records.values()].filter(r=>r.user===user).reverse().map(metadata)};
};
