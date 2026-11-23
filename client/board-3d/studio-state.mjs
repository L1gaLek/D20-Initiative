// Shared, DOM-free project format used by the workshop and the game.
export const FORMAT='d20-studio';
export const VERSION=1;
export const ARMOR=['none','leather','studded-leather','hide','chain-shirt','scale-mail','breastplate','half-plate','ring-mail','chain-mail','splint','plate'];
export const WEAPONS=[null,'long','short','rapier','curved','great'];
const clamp=(n,a,b,f=0)=>Number.isFinite(Number(n))?Math.min(b,Math.max(a,Number(n))):f;
const safe=k=>typeof k==='string'&&k.length<200&&!['__proto__','prototype','constructor'].includes(k);
const record=(value,convert,max=500)=>Object.fromEntries(Object.entries(value&&typeof value==='object'&&!Array.isArray(value)?value:{}).filter(([k])=>safe(k)).slice(0,max).map(([k,v])=>[k,convert(v)]));
const vector=(a,lo,hi,f=0)=>Array.from({length:3},(_,i)=>clamp(a?.[i],lo,hi,f));
export const emptyTransform=()=>({position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]});
export function normalizeAppearance(a={}){
  const model=a.model==='human-female'?'human-female':'human-male';
  let right=WEAPONS.includes(a.right)?a.right:null,left=WEAPONS.includes(a.left)?a.left:null;
  const twoHanded=right==='great'?'right':left==='great'?'left':null;
  const shield=!twoHanded&&!!a.shield,shieldHand=a.shieldHand==='right'?'right':'left';if(shield){if(shieldHand==='left')left=null;else right=null;}
  return {model,outfitStyle:a.outfitStyle==='quaternius'?'quaternius':'d20',outfitHood:!!a.outfitHood,armor:ARMOR.includes(a.armor)?a.armor:'plate',hair:typeof a.hair==='string'?a.hair.slice(0,24):model==='human-female'?'braid':'parted',hairColor:/^#[a-f0-9]{6}$/i.test(a.hairColor)?a.hairColor:'#493124',right:twoHanded==='left'?null:right,left:twoHanded==='right'?null:left,shield,shieldHand,twoHanded};
}
export function normalizeProject(input={}){
  if(input.format&&input.format!==FORMAT)throw Error('Это не проект D20 Studio.');
  if(input.version&&input.version!==VERSION)throw Error('Эта версия проекта ещё не поддерживается.');
  const clips=record(input.clips,(clip={})=>{
    const duration=clamp(clip.duration,.2,20,2),byTime=new Map();
    for(const key of (Array.isArray(clip.keys)?clip.keys:[]).slice(0,100))byTime.set(clamp(key?.time,0,duration),record(key?.bones,v=>vector(v,-Math.PI,Math.PI),80));
    return {duration,loop:clip.loop!==false,keys:[...byTime].sort((a,b)=>a[0]-b[0]).map(([time,bones])=>({time,bones}))};
  },12);
  const asset=input.asset&&/^[^/\\:]{1,150}\.glb$/i.test(input.asset.file||'')&&/^[a-f0-9]{64}$/.test(input.asset.sha256||'')?{file:input.asset.file,sha256:input.asset.sha256,name:String(input.asset.name||'Импортированная модель').slice(0,100)}:null;
  return {format:FORMAT,version:VERSION,name:String(input.name||'Новый персонаж').slice(0,100),race:String(input.race||'Человек').slice(0,60),appearance:normalizeAppearance(input.appearance),parts:record(input.parts,(t={})=>({position:vector(t.position,-.25,.25),rotation:vector(t.rotation,-Math.PI/2,Math.PI/2),scale:vector(t.scale,.5,1.6,1)})),materials:record(input.materials,(m={})=>({color:/^#[a-f0-9]{6}$/i.test(m.color)?m.color:'#d9d2c2',roughness:clamp(m.roughness,.05,1,.7),metalness:clamp(m.metalness,0,1,.8)}),16),pose:record(input.pose,v=>vector(v,-Math.PI,Math.PI),100),clips,...asset?{asset}:{}};
}
export function parseProject(text){
  if(typeof text!=='string'||text.length>600000)throw Error('Проект слишком большой (предел 600 КБ).');
  const value=JSON.parse(text);if(value?.format!==FORMAT)throw Error('Выберите файл .d20studio.json.');return normalizeProject(value);
}
export function sampleClip(clip,time){
  if(!clip?.keys?.length)return {};
  const duration=clip.duration||1,t=clip.loop?((time%duration)+duration)%duration:Math.min(duration,Math.max(0,time)),keys=clip.keys;
  let a=keys[0],b=keys.at(-1);for(let i=0;i<keys.length;i++){if(keys[i].time<=t)a=keys[i];if(keys[i].time>=t){b=keys[i];break;}}
  const u=a===b?0:Math.min(1,Math.max(0,(t-a.time)/(b.time-a.time||1))),out={};
  for(const name of new Set([...Object.keys(a.bones),...Object.keys(b.bones)]))out[name]=Array.from({length:3},(_,i)=>(a.bones[name]?.[i]||0)*(1-u)+(b.bones[name]?.[i]||0)*u);
  return out;
}
export function defaultProject(){
  return normalizeProject({name:'Человек · мастерская',appearance:{model:'human-female',armor:'plate',hair:'braid',hairColor:'#493124',right:'long'},clips:{idle:{duration:3,loop:true,keys:[]},walk:{duration:2*Math.PI/15,loop:true,keys:[]},attack_sword:{duration:1,loop:false,keys:[{time:0,bones:{}},{time:.22,bones:{'upperarm01.R':[-.6,-.15,.20],'lowerarm01.R':[-.3,0,0],'spine01':[0,-.12,0]}},{time:.50,bones:{'upperarm01.R':[.75,.1,-.20],'lowerarm01.R':[.15,0,0],'spine01':[0,.16,0]}},{time:1,bones:{}}]}}});
}
