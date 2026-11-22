'use strict';
const fs=require('node:fs'),path=require('node:path');
const Appearance=require('./appearance');
const defaults={criticalSound:true,chatSound:true,criticalEffects:true,reduceDiceMotion:false,volume:70,...Appearance.defaults};
const copy=v=>JSON.parse(JSON.stringify(v)),number=v=>Number.isFinite(Number(v))?Number(v):0;
const value=v=>typeof v==='object'?v?.value:v;
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const trimMap=(obj,max)=>{for(const key of Object.keys(obj).slice(0,-max))delete obj[key];};
function health(player){const s=player?.sheet?.parsed||{},v=s.vitality||{},ds=v.deathSaves||{};
  const hp=Number(value(v['hp-current'])),max=number(value(v['hp-max']));
  return {hp:Number.isFinite(hp)?hp:null,max,dead:number(ds.fail)>=3||(Array.isArray(s.conditionsList)?s.conditionsList:[]).some(c=>/^(dead|м[её]ртв)/i.test(String(c?.name||c))),stable:!!ds.stabilized};}
class UserProfiles{
  constructor({file=null,now=()=>Date.now()}={}){
    this.file=file;this.now=now;this.connections=new Map();this.dirty=false;this.document={version:1,since:now(),users:{}};
    if(file){
      if(fs.existsSync(file)){try{this.document=JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(!fs.existsSync(file+'.bak'))throw e;this.document=JSON.parse(fs.readFileSync(file+'.bak','utf8'));this.recoveredBackup=true;}}
      if(this.document.version!==1||!this.document.users)throw Error('Invalid user profile store');
    }
  }
  record(method,...args){try{return this[method](...args);}catch(error){console.error('[profile statistics]',error.message);}}
  user(id){if(!id||['__proto__','constructor','prototype'].includes(id))throw error('Invalid user',403);
    if(!Object.hasOwn(this.document.users,id)){this.dirty=true;this.document.users[id]={since:this.now(),settings:{},totals:{roomMs:0,visits:0,rolls:0,d20:0,critical20:0,critical1:0,damage:0,maxDamage:0,maxTurnDamage:0,maxGame20:0,maxGame1:0,knockdowns:0,deaths:0,stabilizations:0},races:{},classes:{},rooms:{},receipts:[]};}return this.document.users[id];}
  connect(connection,room,user,state,role){this.disconnect(connection);if(!room||room.startsWith('__')||!user)return;
    const at=this.now(),profile=this.user(user),other=[...this.connections.values()].some(c=>c.room===room&&c.user===user);
    this.connections.set(connection,{room,user,role,at,state:this.identity(state,user)});
    const game=this.game(profile,room,at);if(!other&&(!game.visitAt||at-game.visitAt>1800000)){profile.totals.visits++;game.visitAt=at;}
    this.dirty=true;
  }
  identity(state,user){const p=(state?.players||[]).find(p=>p.isBase&&String(p.ownerId)===user),info=p?.sheet?.parsed?.info||{};
    return {race:String(value(info.race)||'').trim().slice(0,120),cls:String(value(info.charClass)||'').trim().slice(0,120)};}
  game(profile,room,at=this.now()){
    if(!room||['__proto__','constructor','prototype'].includes(room))throw error('Invalid room');
    let g=profile.rooms[room];if(!g||at-g.last>1800000)g=profile.rooms[room]={start:at,last:at,crit20:0,crit1:0,turns:{},visitAt:0};
    g.last=at;trimMap(profile.rooms,64);return g;
  }
  tick(){const at=this.now(),byUser=new Map();
    for(const c of this.connections.values()){
      const p=this.user(c.user),elapsed=Math.max(0,Math.min(60000,at-c.at));c.at=at;
      const group=byUser.get(c.user)||{ms:0,identity:c.state};if(elapsed>group.ms){group.ms=elapsed;group.identity=c.state;}byUser.set(c.user,group);
      this.game(p,c.room,at).visitAt=at;
    }
    for(const [id,entry] of byUser){const p=this.user(id);p.totals.roomMs+=entry.ms;
      for(const [field,name] of [['races',entry.identity.race],['classes',entry.identity.cls]])if(name&&name!=='-'&&name!=='—'&&!['__proto__','constructor','prototype'].includes(name)){p[field][name]=(p[field][name]||0)+entry.ms;trimMap(p[field],64);}
      if(entry.ms)this.dirty=true;
    }
  }
  disconnect(connection){if(!this.connections.has(connection))return;this.tick();this.connections.delete(connection);}
  observe(room,before,after){
    const old=new Map((before?.players||[]).map(p=>[String(p.id),p]));
    for(const next of after?.players||[]){if(!next.isBase||!next.ownerId)continue;const previous=old.get(String(next.id));if(!previous||String(previous.ownerId)!==String(next.ownerId))continue;
      const a=health(previous),b=health(next),profile=this.user(String(next.ownerId));
      if(a.hp!==null&&a.hp>0&&b.hp!==null&&b.hp<=0&&b.max>0&&!b.dead)profile.totals.knockdowns++;
      if(!a.dead&&b.dead)profile.totals.deaths++;
      if(!a.stable&&b.stable&&!b.dead&&b.hp<=0)profile.totals.stabilizations++;
    }
    // Settle time using the previous identity before race/class changes.
    this.tick();for(const c of this.connections.values())if(c.room===room)c.state=this.identity(after,c.user);
    this.dirty=true;
  }
  dice(room,user,event,state,authorized=[]){
    const profile=this.user(user),id=String(event.localNonce||event.id||'');if(!id)return;
    const key=room+':'+id;if(profile.receipts.includes(key))return;
    profile.receipts=[...profile.receipts,key].slice(-256);
    const game=this.game(profile,room),raw=Array.isArray(event.damageParts)?event.damageParts.filter(p=>p.type==='dice').flatMap(p=>(p.rolls||[]).map(v=>({sides:number(p.sides),value:number(v)}))):[];
    const dice=raw.length?raw:(event.rolls||[]).map(v=>({sides:number(event.sides),value:number(v)}));
    profile.totals.rolls++;for(const d of dice){if(d.sides===20&&d.value>=1&&d.value<=20){profile.totals.d20++;if(d.value===20){profile.totals.critical20++;game.crit20++;}if(d.value===1){profile.totals.critical1++;game.crit1++;}}}
    profile.totals.maxGame20=Math.max(profile.totals.maxGame20,game.crit20);profile.totals.maxGame1=Math.max(profile.totals.maxGame1,game.crit1);
    const actor=authorized.find(p=>String(p.id)===String(event.actorId))||authorized.find(p=>String(p.name)===String(event.fromName));
    const damage=event.damageParts?.length||/^урон(?:\s|:|$)|^damage/i.test(String(event.kindText||''));
    if(damage&&actor?.isBase&&state?.phase==='combat'){
      const amount=Math.max(0,Math.min(100000,number(event.total)));profile.totals.damage+=amount;profile.totals.maxDamage=Math.max(profile.totals.maxDamage,amount);
      const active=String(state.turnOrder?.[number(state.currentTurnIndex)]||'');
      if(active===String(actor.id)){
        const turn=[state.currentMapId,state.phaseEpoch,state.round,state.currentTurnIndex,active].join('|');game.turns[turn]=(game.turns[turn]||0)+amount;trimMap(game.turns,32);
        profile.totals.maxTurnDamage=Math.max(profile.totals.maxTurnDamage,game.turns[turn]);
      }
    }
    this.dirty=true;
  }
  get(id){this.tick();const p=this.user(id),favorite=obj=>Object.entries(obj).sort((a,b)=>b[1]-a[1])[0]?.[0]||null;
    return {since:p.since,settingsInitialized:Object.keys(p.settings).length>0,settings:{...defaults,...p.settings},statistics:{...copy(p.totals),favoriteRace:favorite(p.races),favoriteClass:favorite(p.classes)},definitions:{gameBreakMinutes:30,damage:'Сумма бросков урона основы в бою, до сопротивлений и брони. За ход учитываются броски во время собственного хода.',favorites:'По времени в комнате с основной расой и классом.'}};
  }
  settings(id,input){const p=this.user(id),next={};for(const key of Object.keys(defaults))if(Object.hasOwn(input,key)){
    if(key==='volume'){if(!Number.isFinite(Number(input[key])))throw error('Invalid volume');next[key]=Math.max(0,Math.min(100,Number(input[key])));}
    else if(key==='diceStyle'){if(!Appearance.styles.some(s=>s.id===input[key]))throw error('Invalid dice style');next[key]=input[key];}
    else if(key==='boardBackground'||key==='boardGrid'){const color=Appearance.color(input[key],null);if(!color)throw error('Invalid board color');next[key]=color;}
    else{if(typeof input[key]!=='boolean')throw error('Invalid setting');next[key]=input[key];}
  }p.settings={...p.settings,...next};this.dirty=true;this.flush();return this.get(id);}
  flush(){if(!this.file||!this.dirty)return;const dir=path.dirname(this.file);fs.mkdirSync(dir,{recursive:true,mode:0o700});
    const temp=this.file+'.tmp',bytes=JSON.stringify(this.document);fs.writeFileSync(temp,bytes,{mode:0o600});
    if(fs.existsSync(this.file)&&!this.recoveredBackup)fs.copyFileSync(this.file,this.file+'.bak');fs.renameSync(temp,this.file);this.recoveredBackup=false;this.dirty=false;
  }
}
module.exports={UserProfiles,defaults,health};
