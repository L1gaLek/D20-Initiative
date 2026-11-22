'use strict';
const SheetSync = require('./sheet-sync');
const clone = value => JSON.parse(JSON.stringify(value));
const legacyKey = name => 'legacy:' + String(name || 'Персонаж').trim().toLocaleLowerCase('ru');
const metadata = row => ({ id: String(row.id), name: row.name, updatedAt: row.updated_at,
  characterKey: row.state?.characterKey || row.character_key || legacyKey(row.name),
  saveLabel: row.state?.saveLabel || row.save_label || '', savedAt: row.state?.savedAt || row.saved_at || row.updated_at });

// Cache individual, owned sheets only. Warm edits return small acknowledgements;
// xmin compare-and-swap preserves changes made by another server/browser.
class CharacterStore {
  constructor(pool, { maxBytes = 16 * 1024 * 1024, maxEntries = 64, ttl = 900000 } = {}) {
    this.pool = pool; this.cache = new Map(); this.pending = new Map();
    this.bytes = 0; this.maxBytes = maxBytes; this.maxEntries = maxEntries; this.ttl = ttl;
  }
  key(user, id) { return JSON.stringify([user, id]); }
  forget(user, id) { const key=this.key(user,id), old=this.cache.get(key); if(old)this.bytes-=old.bytes; this.cache.delete(key); }
  remember(user, row) {
    this.forget(user,row.id);
    const bytes=Buffer.byteLength(JSON.stringify(row)); if(bytes>this.maxBytes)return;
    while(this.cache.size && (this.cache.size>=this.maxEntries || this.bytes+bytes>this.maxBytes)) {
      const key=this.cache.keys().next().value; this.bytes-=this.cache.get(key).bytes; this.cache.delete(key);
    }
    this.cache.set(this.key(user,row.id),{row:clone(row),bytes,at:Date.now()}); this.bytes+=bytes;
  }
  async read(user,id) {
    const {rows}=await this.pool.query('select id, name, state, updated_at, xmin::text as version from public.characters where id=$1 and user_id=$2 limit 1',[id,user]);
    if(!rows.length) { this.forget(user,id); const e=new Error('Character not found'); e.status=404; throw e; }
    this.remember(user,rows[0]); return rows[0];
  }
  async get(user,id) {
    const row=await this.read(user,id); return {...metadata(row),state:row.state};
  }
  patch(user,id,input) {
    const key=this.key(user,id), previous=this.pending.get(key)||Promise.resolve();
    const next=previous.catch(()=>{}).then(()=>this.write(user,id,input)); this.pending.set(key,next);
    return next.finally(()=>{if(this.pending.get(key)===next)this.pending.delete(key);});
  }
  async write(user,id,input) {
    const ops=SheetSync.clean(input.ops), requestId=String(input.requestId||'').slice(0,160);
    if(!requestId) { const e=new Error('requestId is required'); e.status=400; throw e; }
    for(let attempt=0;attempt<4;attempt++) {
      const cached=this.cache.get(this.key(user,id));
      const row=cached && Date.now()-cached.at<=this.ttl ? cached.row : await this.read(user,id);
      if(!row) { const e=new Error('Character not found'); e.status=404; throw e; }
      const state=clone(row.state||{});
      const receipts=Array.isArray(state.patchReceipts)?state.patchReceipts:[];
      if(receipts.includes(requestId))return {character:metadata(row),requestId};
      state.characterKey ||= legacyKey(row.name);
      state.data=SheetSync.apply(state.data,ops);
      state.patchReceipts=[...receipts,requestId].slice(-64);
      const parsedName=state.data?.parsed?.name;
      const name=String((typeof parsedName==='object'?parsedName?.value:parsedName)||row.name).trim().slice(0,160)||row.name;
      const {rows}=await this.pool.query('update public.characters set state=$3, name=$4, updated_at=now() where id=$1 and user_id=$2 and xmin::text=$5 returning id, name, updated_at, xmin::text as version',[id,user,state,name,String(row.version)]);
      if(rows.length) { const saved={...rows[0],state}; this.remember(user,saved); return {character:metadata(saved),requestId}; }
      this.forget(user,id);
    }
    const error=new Error('Сохранение изменилось. Повторите попытку.'); error.status=409; throw error;
  }
}
module.exports={CharacterStore,metadata,legacyKey};
