// A small, serializable description derived from the character sheet, never a
// second equipment inventory. Kept independent of WebGL for save/import tests.
(function(root){
  'use strict';
  const hairstyles=[['short','Короткая'],['parted','Боковой пробор'],['swept','Зачёс назад'],['tied','Хвост'],['mohawk','Ирокез'],['bald','Без волос']];
  const femaleHairstyles=[['pixie','Пикси'],['bob','Каре'],['long','Длинные волны'],['braid','Коса'],['bun','Пучок'],['tied','Хвост'],['bald','Без волос']];
  function genderOf(sheet){return /^(female|f|женский|женщина|жен|ж)$/i.test(String(sheet?.notes?.details?.gender?.value||'').trim())?'female':'male';}
  const hairstylesFor=gender=>gender==='female'?femaleHairstyles:hairstyles;
  function hairFor(gender,value){
    if(hairstylesFor(gender).some(([id])=>id===value))return value;
    const aliases=gender==='female'?{short:'pixie',parted:'bob',swept:'long',mohawk:'pixie'}:{pixie:'short',bob:'parted',long:'swept',braid:'tied',bun:'tied'};
    return aliases[value]||(gender==='female'?'bob':'short');
  }
  function rememberHair(sheet,previousGender){
    const object=(parent,key)=>parent[key]&&typeof parent[key]==='object'&&!Array.isArray(parent[key])?parent[key]:(parent[key]={});
    const ap=object(sheet,'appearance'),hair=object(ap,'model3d'),gender=genderOf(sheet),styles=object(hair,'hairStyles');
    if(previousGender&&previousGender!==gender){styles[previousGender]=hairFor(previousGender,hair.hairStyle);hair.hairStyle=hairFor(gender,styles[gender]||hair.hairStyle);}
    else hair.hairStyle=hairFor(gender,hair.hairStyle);
    styles[gender]=hair.hairStyle;
  }
  function hands(sheet,changed){
    const slots=sheet?.appearance?.slots||{},inv=sheet?.inventory||{},shield=itemIn(inv.armor,slots.shield);
    const hasShield=!!shield&&(shield.armor?.type==='shield'||/щит|shield/i.test(text(shield)));
    let right=itemIn(inv.weapons,slots.right)?String(slots.right):'',left=itemIn(inv.weapons,slots.left)?String(slots.left):'',shieldHand=null;
    if(hasShield){
      shieldHand=slots.shieldHand==='right'?'right':'left';
      if(changed==='right'&&right)shieldHand='left';else if(changed==='left'&&left)shieldHand='right';
      else if(left&&!right)shieldHand='right';else if(right&&!left)shieldHand='left';
      if(shieldHand==='left')left='';else right='';
    }
    return {right,left,shield:hasShield,shieldHand};
  }
  function syncHands(sheet,changed){
    const slots=(sheet.appearance||={}).slots||={},resolved=hands(sheet,changed);
    slots.right=resolved.right;slots.left=resolved.left;if(resolved.shieldHand)slots.shieldHand=resolved.shieldHand;return resolved;
  }
  const armorKinds=[
    ['studded-leather',/studded|прокл[её]пан/i],['chain-shirt',/chain.?shirt|кольчужная рубаха/i],
    ['scale-mail',/scale.?mail|чешуй/i],['breastplate',/breastplate|кираса/i],
    ['half-plate',/half.?plate|полулат/i],['ring-mail',/ring.?mail|колечн/i],
    ['chain-mail',/chain.?mail|кольчуга/i],['splint',/splint|наборн/i],
    ['plate',/plate|латы/i],['hide',/hide|сыромят/i],['leather',/leather|кожан/i]
  ];
  function itemIn(items,key){
    if(!key || !Array.isArray(items))return null;
    return items.find(i=>String(i?.id||'')===String(key)) || items.find(i=>[i?.name_ru,i?.name,i?.title,i?.name_en].some(n=>n&&String(n).trim().toLowerCase()===String(key).trim().toLowerCase())) || null;
  }
  const text=item=>item?[item.id,item.sourceId,item.name_ru,item.name,item.title,item.name_en].filter(Boolean).join(' '):'';
  function armorKind(item){
    const name=text(item);
    if(!name || item?.armor?.type==='shield' || /щит|shield/i.test(name))return 'none';
    return armorKinds.find(([,re])=>re.test(name))?.[0] || ({light:'leather',medium:'hide',heavy:'plate'}[item?.armor?.type]) || 'leather';
  }
  function swordKind(item){
    const name=text(item);
    if(/greatsword|двуручн.*меч/i.test(name))return 'great';
    if(/shortsword|коротк.*меч/i.test(name))return 'short';
    if(/rapier|рапира/i.test(name))return 'rapier';
    if(/scimitar|ятаган/i.test(name))return 'curved';
    return /sword|меч/i.test(name)?'long':null;
  }
  function describe(sheet,monster=false){
    if(!sheet || monster || sheet.wildShape?.active)return null;
    const race=String(sheet.info?.race?.value||'').trim().toLowerCase();
    const gender=genderOf(sheet);
    if(!['человек','human'].includes(race))return null;
    const ap=sheet.appearance||{},slots=ap.slots||{},inv=sheet.inventory||{};
    const equipped=hands(sheet);
    const hair=ap.model3d||{};
    return {model:'human-'+gender,hair:hairFor(gender,hair.hairStyle),
      hairColor:/^#[\da-f]{6}$/i.test(hair.hairColor)?hair.hairColor:'#493124',
      armor:armorKind(itemIn(inv.armor,slots.armor)),shield:equipped.shield,shieldHand:equipped.shieldHand,
      right:swordKind(itemIn(inv.weapons,equipped.right)),left:swordKind(itemIn(inv.weapons,equipped.left))};
  }
  const api={describe,armorKind,swordKind,hairstyles,hairstylesFor,genderOf,hairFor,rememberHair,hands,syncHands};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AvatarData=api;
})(typeof window!=='undefined'?window:globalThis);
