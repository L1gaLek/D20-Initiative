(function(){
  'use strict';
  const defaults={criticalSound:true,chatSound:true,criticalEffects:true,reduceDiceMotion:false,volume:70,...D20Appearance.defaults};
  let timer=null,request=0,dirty=false,revision=0,dirtyOwner='';
  const owner=()=>String(typeof myId!=='undefined'&&myId||localStorage.getItem('int_user_id')||'guest');
  const key=id=>'d20_preferences_v1:'+id;
  function get(){let stored={};try{stored=JSON.parse(localStorage.getItem(key(owner()))||(localStorage.getItem('d20_critical_sounds')==='off'?'{"criticalSound":false}':'{}'));}catch{}
    return {...defaults,...stored,boardBackground:D20Appearance.color(stored.boardBackground,defaults.boardBackground),boardGrid:D20Appearance.color(stored.boardGrid,defaults.boardGrid),diceStyle:D20Appearance.style(stored.diceStyle||defaults.diceStyle).id};}
  function write(value,id=owner()){try{localStorage.setItem(key(id),JSON.stringify(value));}catch{}window.dispatchEvent(new CustomEvent('d20-preferences-changed',{detail:value}));}
  async function load(){const id=owner(),token=++request;apply();if(dirtyOwner&&dirtyOwner!==id){dirty=false;dirtyOwner='';}if(id==='guest')return;
    try{const data=await window.vpsApi('/me/profile');if(id!==owner()||token!==request)return data;
      if(data.settingsInitialized===false&&!dirty&&localStorage.getItem('d20_critical_sounds')==='off'){set({criticalSound:false});data.settings.criticalSound=false;}
      if(!dirty)write({...defaults,...data.settings},id);return data;
    }catch{return null;}
  }
  function set(patch){const value={...get(),...patch},rev=++revision;write(value);dirty=true;clearTimeout(timer);const id=owner();dirtyOwner=id;
    timer=setTimeout(async()=>{if(id!==owner())return;try{await window.vpsApi('/me/profile',{method:'PATCH',body:{settings:value}});if(id===owner()&&rev===revision){dirty=false;window.dispatchEvent(new CustomEvent('d20-preferences-saved'));}}
      catch{window.dispatchEvent(new CustomEvent('d20-preferences-save-error'));}},350);return value;
  }
  window.PersonalPreferences={get,set,load};
  function apply(){const p=get(),rgb=p.boardBackground.match(/\w\w/g).map(n=>parseInt(n,16)).join(',');document.documentElement.style.setProperty('--personal-board-background',p.boardBackground);document.documentElement.style.setProperty('--personal-board-rgb',rgb);document.documentElement.style.setProperty('--personal-grid-color',p.boardGrid);}
  window.addEventListener('d20-preferences-changed',apply);window.addEventListener('storage',e=>{if(e.key===key(owner())){apply();window.dispatchEvent(new CustomEvent('d20-preferences-changed',{detail:get()}));}});apply();
})();
