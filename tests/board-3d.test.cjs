const assert = require('node:assert/strict');
const test = require('node:test');
const { rectangles, wall, tokenVisible } = require('../client/board-3d-data');
const { movementRoute } = require('../client/board-3d-data');
const AvatarData = require('../client/avatar-data');

test('fog rectangles reconstruct every visibility cell exactly without overlap, including irregular boundaries', () => {
  for (const [width,height] of [[1,1],[7,5],[60,45]]) {
    const mask = Uint8Array.from({length:width*height},(_,i) => (Math.imul(i,31) ^ (i >>> 3)) % 3);
    const reconstructed = new Uint8Array(mask.length).fill(9);
    for (const value of [0,1,2]) for (const r of rectangles(mask,width,height,value)) {
      assert.ok(r.w>0 && r.h>0 && r.x+r.w<=width && r.y+r.h<=height);
      for(let y=r.y;y<r.y+r.h;y++) for(let x=r.x;x<r.x+r.w;x++) {
        const index=y*width+x;
        assert.equal(reconstructed[index],9,'a cell is covered only once'); reconstructed[index]=value;
      }
    }
    assert.deepEqual(reconstructed,mask);
  }
  assert.deepEqual(rectangles(new Uint8Array(2700),60,45,0),[{x:0,y:0,w:60,h:45}]);
});
test('wall directions preserve 2D edge positions and hidden interior walls are omitted from a player scene', () => {
  const view={width:4,height:4,mask:new Uint8Array(16).fill(2),omniscient:false};
  for(const [dir,x,z,w,d] of [['N',1.5,1,1.08,.08],['E',2,1.5,.08,1.08],['S',1.5,2,1.08,.08],['W',1,1.5,.08,1.08]]) {
    const shape=wall({x:1,y:1,dir},view);
    assert.deepEqual([shape.x,shape.z,shape.w,shape.d],[x,z,w,d]);
  }
  view.mask.fill(0);
  assert.equal(wall({x:1,y:1,dir:'N'},view),null);
  view.mask[1]=1;
  assert.equal(wall({x:1,y:1,dir:'N'},view).explored,true);
  assert.equal(wall({x:1,y:1,dir:'S'},view),null);
  view.omniscient=true;
  assert.ok(wall({x:1,y:1,dir:'S'},view));
  assert.equal(wall({x:NaN,y:1,dir:'N'},view),null);
  assert.equal(wall({x:1,y:1,dir:'N',type:'magic'},view).type,'magic');
});
test('hidden live tokens are never rendered, while last-known silhouettes stay at explored coordinates', () => {
  const view={width:3,height:1,mask:Uint8Array.from([2,1,0]),omniscient:false};
  const token={x:0,y:0,size:1};
  assert.equal(tokenVisible(token,view),true);
  assert.equal(tokenVisible({...token,x:1},view),false);
  assert.equal(tokenVisible({...token,x:1,ghost:true},view),true);
  assert.equal(tokenVisible({...token,x:2,ghost:true},view),false);
  assert.equal(tokenVisible({...token,hidden:true},view),false);
  assert.equal(tokenVisible({...token,x:NaN},view),false);
  assert.equal(tokenVisible({...token,x:-5},view),false);
  assert.equal(tokenVisible({...token,x:2},{...view,omniscient:true}),true);
  assert.equal(tokenVisible({...token,hidden:true},{...view,omniscient:true}),false);
});

test('human appearance resolves worn inventory items and legacy names, validates customization and excludes other forms',()=>{
  const db=require('../equipment_srd5_ru.json').tabs;
  const sheet={info:{race:{value:'Человек'}},notes:{details:{gender:{value:'Мужской'}}},inventory:{armor:db.armor,weapons:db.weapons},appearance:{slots:{}}};
  const desc=()=>AvatarData.describe(sheet);
  assert.equal(desc().armor,'none');assert.equal(desc().hair,'short');
  const keys=new Set();for(const a of db.armor.filter(a=>a.armor.type!=='shield')){sheet.appearance.slots.armor=a.id;const kind=desc().armor;assert.notEqual(kind,'none');assert.equal(keys.has(kind),false,a.name_ru);keys.add(kind);}
  sheet.appearance.slots.armor='Кольчужная рубаха';assert.equal(desc().armor,'chain-shirt');
  sheet.appearance.slots.right='weapon_longsword';sheet.appearance.slots.left='weapon_shortsword';assert.equal(desc().right,'long');assert.equal(desc().left,'short');
  sheet.appearance.slots.shield='armor_shield';assert.equal(desc().shield,true);assert.equal(desc().left,null);
  sheet.appearance.slots.right='weapon_club';assert.equal(desc().right,null);
  sheet.appearance.slots.armor='deleted-item';assert.equal(desc().armor,'none');
  sheet.appearance.model3d={hairStyle:'tied',hairColor:'#c78432'};assert.equal(desc().hair,'tied');assert.equal(desc().hairColor,'#c78432');
  sheet.appearance.model3d={hairStyle:'<bad>',hairColor:'red; url(secret)'};assert.equal(desc().hair,'short');assert.equal(desc().hairColor,'#493124');
  assert.equal(AvatarData.describe(sheet,true),null);sheet.wildShape={active:true};assert.equal(desc(),null);sheet.wildShape.active=false;
  sheet.notes.details.gender.value='female';assert.equal(desc().model,'human-female');sheet.notes.details.gender.value='male';sheet.info.race.value='Эльф';assert.equal(desc(),null);
});

test('a shield occupies exactly one hand, follows the chosen weapon hand, and resolves legacy saves without modifying them',()=>{
  const db=require('../equipment_srd5_ru.json').tabs;
  const sheet={inventory:db,appearance:{slots:{right:'weapon_longsword',left:'weapon_shortsword',shield:'armor_shield'}}};
  const original=structuredClone(sheet);assert.deepEqual(AvatarData.hands(sheet),{right:'weapon_longsword',left:'',shield:true,shieldHand:'left',twoHanded:null});assert.deepEqual(sheet,original);
  AvatarData.syncHands(sheet,'shield');assert.equal(sheet.appearance.slots.left,'');
  sheet.appearance.slots.left='weapon_shortsword';AvatarData.syncHands(sheet,'left');assert.equal(sheet.appearance.slots.right,'');assert.equal(sheet.appearance.slots.shieldHand,'right');
  sheet.appearance.slots.right='weapon_longsword';AvatarData.syncHands(sheet,'right');assert.equal(sheet.appearance.slots.left,'');assert.equal(sheet.appearance.slots.shieldHand,'left');
  sheet.appearance.slots.shield='';sheet.appearance.slots.left='weapon_shortsword';AvatarData.syncHands(sheet,'left');assert.equal(sheet.appearance.slots.right,'weapon_longsword');assert.equal(AvatarData.hands(sheet).shieldHand,null);
  sheet.appearance.slots.shield='armor_shield';sheet.appearance.slots.right='deleted-item';assert.equal(AvatarData.hands(sheet).shieldHand,'right');assert.equal(AvatarData.hands(sheet).left,'weapon_shortsword');
});

test('two-handed properties occupy both hands, remove shield AC and resolve competing new choices without changing inventory',()=>{
  const db=require('../equipment_srd5_ru.json').tabs,utils= require('node:fs').readFileSync(require('node:path').resolve(__dirname,'../char_sheet/sheet-utils.js'),'utf8');
  const vm=require('node:vm'),ctx={window:{},console};vm.createContext(ctx);vm.runInContext(utils,ctx);
  const sheet={inventory:structuredClone(db),appearance:{slots:{armor:'armor_plate',right:'weapon_longsword',left:'weapon_shortsword',shield:'armor_shield'}}};
  const inventory=structuredClone(sheet.inventory),slots=sheet.appearance.slots;
  assert.equal(AvatarData.isTwoHanded(db.weapons.find(i=>i.id==='weapon_longsword')),false,'versatile is not two-handed');
  for(const item of db.weapons.filter(i=>/two|двуруч/i.test(i.weapon.properties_en+' '+i.weapon.properties_ru))){
    assert.equal(AvatarData.isTwoHanded(item),true,item.name_ru);
    for(const hand of ['right','left']){
      Object.assign(slots,{right:'weapon_longsword',left:'weapon_shortsword',shield:'armor_shield',[hand]:item.id});
      ctx.window.__equipAc.applyAutoAcToSheet(sheet);assert.equal(sheet.vitality.ac.value,20);
      const before=JSON.stringify(sheet),display=AvatarData.hands(sheet);assert.equal(display.twoHanded,hand);assert.equal(display.shield,false);assert.equal(JSON.stringify(sheet),before);
      AvatarData.syncHands(sheet,hand);assert.equal(slots[hand],item.id);assert.equal(slots[hand==='right'?'left':'right'],'');assert.equal(slots.shield,'');
      ctx.window.__equipAc.applyAutoAcToSheet(sheet);assert.equal(sheet.vitality.ac.value,18,'removed shield no longer contributes AC');
    }
  }
  assert.equal(AvatarData.isTwoHanded({weapon:{properties_ru:'Тяжёлое; Двуручное'}}),true);
  assert.equal(AvatarData.isTwoHanded({weapon:{properties_en:'Heavy, Two-‐handed'}}),true);
  assert.equal(AvatarData.isTwoHanded({properties:['two-handed']}),true);
  Object.assign(slots,{right:'weapon_greatsword',left:'weapon_shortsword',shield:''});AvatarData.syncHands(sheet,'left');assert.equal(slots.right,'');assert.equal(slots.left,'weapon_shortsword');
  Object.assign(slots,{right:'weapon_greatsword',left:'',shield:'armor_shield'});AvatarData.syncHands(sheet,'shield');assert.equal(slots.right,'');assert.equal(slots.shield,'armor_shield');
  slots.armor='';sheet.vitality.ac.value=17;ctx.window.__equipAc.applyAutoAcToSheet(sheet);assert.equal(sheet.vitality.ac.value,19);
  slots.right='weapon_greatsword';AvatarData.syncHands(sheet,'right');ctx.window.__equipAc.applyAutoAcToSheet(sheet);ctx.window.__equipAc.applyAutoAcToSheet(sheet);assert.equal(sheet.vitality.ac.value,17,'natural/class AC is restored once after unequipping the shield');
  assert.deepEqual(sheet.inventory,inventory,'unequipped items are still in inventory');
});

test('men and women have distinct hairstyles and retain each selection when changing gender',()=>{
  const male=AvatarData.hairstylesFor('male').map(([id])=>id),female=AvatarData.hairstylesFor('female').map(([id])=>id);
  assert.deepEqual(male.filter(id=>female.includes(id)),['tied','bald']);
  const sheet={notes:{details:{gender:{value:'male'}}},appearance:{model3d:{hairStyle:'mohawk',hairColor:'#825838'}}};
  sheet.notes.details.gender.value='Женский';AvatarData.rememberHair(sheet,'male');assert.ok(female.includes(sheet.appearance.model3d.hairStyle));
  sheet.appearance.model3d.hairStyle='braid';AvatarData.rememberHair(sheet);
  sheet.notes.details.gender.value='male';AvatarData.rememberHair(sheet,'female');assert.equal(sheet.appearance.model3d.hairStyle,'mohawk');
  sheet.notes.details.gender.value='female';AvatarData.rememberHair(sheet,'male');assert.equal(sheet.appearance.model3d.hairStyle,'braid');assert.equal(sheet.appearance.model3d.hairColor,'#825838');
  assert.equal(AvatarData.hairFor('female','tied'),'tied');assert.equal(AvatarData.hairFor('female','bad'),'bob');
  sheet.appearance.model3d.hairStyles='invalid legacy value';assert.doesNotThrow(()=>AvatarData.rememberHair(sheet));
});

test('visual walk routes respect walls, corners, occupied footprints and current fog, with safe snapping when no route exists',()=>{
  const view={width:7,height:5,mask:new Uint8Array(35).fill(2),omniscient:false};
  const from={x:1,y:1},to={x:4,y:1};
  const walls=[{x:2,y:0,dir:'E'},{x:2,y:1,dir:'E'},{x:2,y:2,dir:'E'}];
  const route=movementRoute(from,to,1,view,walls);
  assert.deepEqual(movementRoute(from,to,1,view,walls.map(w=>({...w,x:String(w.x),y:String(w.y)}))),route);
  assert.ok(route.some(p=>p.y===3));assert.deepEqual(route.at(-1),to);
  for(const p of route)view.mask[p.y*7+p.x]=0;
  view.mask[1*7+4]=2;view.mask[1*7+1]=2;
  const hidden=movementRoute(from,to,1,view,walls);assert.ok(!hidden||hidden.every(p=>view.mask[p.y*7+p.x]===2));
  view.mask.fill(2);
  assert.equal(movementRoute(from,{x:2,y:1},1,view,[],[{id:'other',x:2,y:1,size:1}]),null);
  assert.equal(movementRoute(from,to,1,view,Array.from({length:5},(_,y)=>({x:2,y,dir:'E'}))),null);
  const diagonal=movementRoute(from,{x:2,y:2},1,view,[{x:1,y:1,dir:'E'},{x:1,y:1,dir:'S'}]);assert.ok(!diagonal||diagonal.length>1);
  view.mask.fill(0);assert.equal(movementRoute(from,to,1,view),null);
  assert.ok(movementRoute(from,to,1,{...view,omniscient:true}));
});
