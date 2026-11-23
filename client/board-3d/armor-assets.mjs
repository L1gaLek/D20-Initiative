const kinds=['leather','hide','studded-leather','scale-mail','chain-shirt','chain-mail','ring-mail','splint','breastplate','half-plate'];
const assets=new Map(),pending=new Map();
export const quaterniusKind=config=>config?.outfitStyle==='quaternius'?config.armor==='none'?'peasant':['leather','studded-leather','hide'].includes(config.armor)?'ranger':null:null;
export const requiresArmorAsset=config=>!!(config&&(quaterniusKind(config)||config.armor&&config.armor!=='none'));
const key=config=>(quaterniusKind(config)?'quaternius-':'')+(config?.model==='human-female'?'female':'male')+'-'+(quaterniusKind(config)||config?.armor);
export const getArmorAsset=config=>assets.get(key(config))||null;
export const armorAssetRevision=config=>getArmorAsset(config)?.version||0;
export async function ensureArmorAsset(config){
  if(!config)return Promise.resolve(null);
  const id=key(config);if(assets.has(id))return Promise.resolve(assets.get(id));
  if(quaterniusKind(config)){
    if(!pending.has(id))pending.set(id,Promise.all([import(new URL('../../assets/models/quaternius/'+id.slice(11)+'.mjs?v=20261124-outfits-1',import.meta.url).href),import('./fitted-outfit.mjs?v=20261124-outfits-1')]).then(async([module,loader])=>{await loader.prepareFittedOutfit(module.default);assets.set(id,module.default);return module.default;}).catch(error=>{pending.delete(id);throw error;}));return pending.get(id);
  }
  if(config.armor==='none'||!config.armor)return Promise.resolve(null);
  if(config.armor==='plate'){
    const sex=config.model==='human-female'?'female':'male';
    if(!pending.has(id))pending.set(id,import(new URL('../../assets/models/plate/'+sex+'.mjs?v=20261123-cbbe-1',import.meta.url).href).then(module=>{assets.set(id,module.default);return module.default;}).catch(error=>{pending.delete(id);throw error;}));
    return pending.get(id);
  }
  if(id==='female-breastplate'){
    if(!pending.has(id))pending.set(id,Promise.all([import(new URL('../../assets/models/outfits/female-breastplate.mjs?v=20261123-cbbe-1',import.meta.url).href),import('./fitted-outfit.mjs?v=20261124-outfits-1')]).then(async([module,loader])=>{await loader.prepareFittedOutfit(module.default);assets.set(id,module.default);return module.default;}).catch(error=>{pending.delete(id);throw error;}));
    return pending.get(id);
  }
  if(!kinds.includes(config.armor))return Promise.resolve(null);
  if(!pending.has(id))pending.set(id,import(new URL('../../assets/models/armor/'+id+'.mjs?v=20261123-cbbe-1',import.meta.url).href).then(module=>{assets.set(id,module.default);return module.default;}).catch(error=>{pending.delete(id);throw error;}));
  return pending.get(id);
}
// Node geometry checks and exporters do not have an asynchronous UI lifecycle.
if(typeof document==='undefined')await Promise.all(['human-male','human-female'].flatMap(model=>[...kinds,'plate'].map(armor=>ensureArmorAsset({model,armor}))));

if(typeof document==='undefined')await Promise.all(['human-male','human-female'].flatMap(model=>['none','leather'].map(armor=>ensureArmorAsset({model,armor,outfitStyle:'quaternius'}))));
