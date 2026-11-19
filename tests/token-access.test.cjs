const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {read,functions,serverHarness,clone}=require('./helpers/room-harness.cjs');
test('transfer choices accept real Russian room roles, normalize member IDs and omit spectators',()=>{
  const users=[{id:'user-1',name:'Аня',role:'Игрок'},{user_id:'gm',name:'Мастер',role:'ГМ'},
    {userId:'user-2',name:'Борис',role:'Player'},{id:'spectator',name:'Зритель',role:'Зритель'},
    {id:'user-1',name:'Аня',role:'Player'}];
  const c=vm.createContext({window:{},ctx:{getUsers:()=>users},LEGACY_ROLE_PLAYER:'legacy-player'});
  const dom=read('client/dom-and-setup.js'),start=dom.indexOf('const ROLE_CONFIG ='),end=dom.indexOf('\n});',start)+4;
  vm.runInContext(dom.slice(start,end)+'\n'+functions(dom,['normalizeRoleKey','normalizeRoleForApp']),c);
  c.window.normalizeRoleForApp=c.normalizeRoleForApp;
  vm.runInContext(functions(read('char_sheet/sheet-token-access.js'),['getTokenAccessRoomUsers']),c);
  assert.deepEqual(clone(c.getTokenAccessRoomUsers()).map(u=>[u.id,u.role]),[['user-1','Player'],['user-2','Player'],['gm','GM']]);
});
test('a delegate can play a token but cannot revoke or forward its control',async()=>{
  const h=serverHarness();
  await h.context.setTokenAccessForContext(h.clients[0].ctx,'player-1',{action:'controller',targetUserId:'user-2'});
  assert.equal(h.context.canControlPlayer(h.clients[1].ctx,h.database().players[0]),true);
  for(const targetUserId of ['', 'user-3'])await assert.rejects(
    h.context.setTokenAccessForContext(h.clients[1].ctx,'player-1',{action:'controller',targetUserId}),/Only the owner/);
  assert.equal(h.database().players[0].controllerId,'user-2');
  await h.context.setTokenAccessForContext(h.clients[0].ctx,'player-1',{action:'controller',targetUserId:''});
  assert.equal(h.database().players[0].controllerId,null);
});
