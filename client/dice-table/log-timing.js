(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DiceLogTiming=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const PREFIX='dice-log:';
  const normalize=text=>String(text||'').trim().replace(/\s+/g,' ').replace(/\+0(?=\s*=)/g,'').replace(/\((?:КРИТ|CRIT)\)/g,'(CRIT)').replace(/\((?:ПРОВАЛ|FAIL)\)/g,'(FAIL)');
  const nonce=row=>{
    const key=String(row?.localNonce||row?.nonce||'');
    return key.startsWith(PREFIX)?key.slice(PREFIX.length):'';
  };
  class Coordinator{
    constructor({setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id),now=Date.now,graceMs=3000,watchdogMs=45000,maxRecords=256}={}){
      Object.assign(this,{setTimer,clearTimer,now,graceMs,watchdogMs,maxRecords});this.records=new Map();this.serial=0;
    }
    make(id,text,explicit=false){
      const record={id,text:normalize(text),explicit,started:false,done:false,callbacks:[],at:this.now(),timer:null};
      this.records.set(id,record);
      while(this.records.size>this.maxRecords){const old=this.records.values().next().value;this.settle(old);this.records.delete(old.id);}
      return record;
    }
    arm(record,ms){this.clearTimer(record.timer);record.timer=this.setTimer(()=>this.settle(record),ms);}
    begin(event,text){
      const id=String(event?.localNonce||event?.id||''),line=normalize(text);
      let record=id?this.records.get(id):null;
      if(!record)record=[...this.records.values()].find(r=>!r.started&&!r.done&&!r.explicit&&r.text===line);
      if(!record)record=this.make(id||'anonymous-'+ ++this.serial,line);
      if(id&&record.id!==id){this.records.delete(record.id);record.id=id;this.records.set(id,record);}
      record.started=true;record.text=line;
      if(!record.done)this.arm(record,this.watchdogMs);
      return record;
    }
    hold(row,release,{knownOnly=false}={}){
      const explicit=nonce(row),legacy=String(row?.localNonce||row?.nonce||''),line=normalize(row?.text);
      let record=this.records.get(explicit||legacy);
      const created=Date.parse(row?.created_at||'');
      if(!record&&(!explicit)&&(!Number.isFinite(created)||this.now()-created<15000)){
        const matches=[...this.records.values()].filter(r=>r.started&&r.text===line);
        record=matches.find(r=>!r.done)||matches.at(-1);
      }
      if(record?.done)return false;
      if(!record){
        if(knownOnly)return false;
        const looksLikeDice=/:\s*-?\d+(?:\s*,\s*-?\d+)*(?:[+-]\d+)?\s*=\s*-?\d+(?:\s*\((?:КРИТ|ПРОВАЛ|CRIT|FAIL)\))?$/.test(line);
        if(!explicit&&!looksLikeDice)return false;
        if(Number.isFinite(created)&&this.now()-created>15000)return false;
        record=this.make(explicit||legacy||'orphan-'+ ++this.serial,line,!!explicit);this.arm(record,this.graceMs);
      }
      record.callbacks.push(release);
      // Keep malformed/repeated transports bounded without losing their logs.
      if(record.callbacks.length>32){try{record.callbacks.shift()();}catch{}}
      return true;
    }
    settle(record){
      if(!record||record.done)return;record.done=true;this.clearTimer(record.timer);
      for(const release of record.callbacks.splice(0)){try{release();}catch{}}
    }
    reset(){for(const record of this.records.values())this.clearTimer(record.timer);this.records.clear();}
  }
  return {Coordinator,nonce,normalize,PREFIX};
});
