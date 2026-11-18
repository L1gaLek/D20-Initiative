import malePlate from '../../assets/models/plate/male.mjs?v=20261119-cuirass-1';
import femalePlate from '../../assets/models/plate/female.mjs?v=20261119-cuirass-1';
const kinds=['leather','hide','studded-leather','scale-mail','chain-shirt','chain-mail','ring-mail','splint','breastplate','half-plate'];
const assets=new Map([['male-plate',malePlate],['female-plate',femalePlate]]),pending=new Map();
const key=config=>(config?.model==='human-female'?'female':'male')+'-'+config?.armor;
export const getArmorAsset=config=>assets.get(key(config))||null;
export const armorAssetRevision=config=>getArmorAsset(config)?.version||0;
export async function ensureArmorAsset(config){
  if(!config||config.armor==='none'||!config.armor)return Promise.resolve(null);
  const id=key(config);if(assets.has(id))return Promise.resolve(assets.get(id));
  if(id==='female-breastplate'){
    if(!pending.has(id))pending.set(id,Promise.all([import(new URL('../../assets/models/outfits/female-breastplate.mjs?v=20261119-cuirass-1',import.meta.url).href),import('./fitted-outfit.mjs?v=20261119-cuirass-1')]).then(async([module,loader])=>{await loader.prepareFittedOutfit(module.default);assets.set(id,module.default);return module.default;}).catch(error=>{pending.delete(id);throw error;}));
    return pending.get(id);
  }
  if(!kinds.includes(config.armor))return Promise.resolve(null);
  if(!pending.has(id))pending.set(id,import(new URL('../../assets/models/armor/'+id+'.mjs?v=20261119-cuirass-1',import.meta.url).href).then(module=>{assets.set(id,module.default);return module.default;}).catch(error=>{pending.delete(id);throw error;}));
  return pending.get(id);
}
// Node geometry checks and exporters do not have an asynchronous UI lifecycle.
if(typeof document==='undefined')await Promise.all(['human-male','human-female'].flatMap(model=>kinds.map(armor=>ensureArmorAsset({model,armor}))));
