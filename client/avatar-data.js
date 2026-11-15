// A small, serializable description derived from the character sheet, never a
// second equipment inventory. Kept independent of WebGL for save/import tests.
(function(root){
  'use strict';
  const hairstyles=[['short','Короткая'],['parted','Боковой пробор'],['swept','Зачёс назад'],['tied','Хвост'],['mohawk','Ирокез'],['bald','Без волос']];
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
    const gender=String(sheet.notes?.details?.gender?.value||'male').trim().toLowerCase();
    if(!['человек','human'].includes(race) || !/^(male|m|мужской|мужчина|муж|м)$/.test(gender))return null;
    const ap=sheet.appearance||{},slots=ap.slots||{},inv=sheet.inventory||{};
    const shield=itemIn(inv.armor,slots.shield);
    const hasShield=!!shield && (shield.armor?.type==='shield'||/щит|shield/i.test(text(shield)));
    const hair=ap.model3d||{};
    return {model:'human-male',hair:hairstyles.some(([id])=>id===hair.hairStyle)?hair.hairStyle:'short',
      hairColor:/^#[\da-f]{6}$/i.test(hair.hairColor)?hair.hairColor:'#493124',
      armor:armorKind(itemIn(inv.armor,slots.armor)),shield:hasShield,
      right:swordKind(itemIn(inv.weapons,slots.right)),left:hasShield?null:swordKind(itemIn(inv.weapons,slots.left))};
  }
  const api={describe,armorKind,swordKind,hairstyles};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AvatarData=api;
})(typeof window!=='undefined'?window:globalThis);
