(function(){
  'use strict';
  const moduleUrl=new URL('board-3d/portrait.mjs?v=20261115-human-poses-2',document.currentScript.src);
  let loading=null,current=null,generation=0;
  const api=window.Character3D={inspect:()=>current?.view?.inspect()||null};
  api.dispose=()=>{generation++;current?.observer?.disconnect();current?.abort?.abort();current?.view?.dispose();current=null;};
  api.mount=async function(root,player){
    api.dispose();const host=root?.querySelector('[data-avatar-preview]');if(!host)return;
    const gen=generation,abort=new AbortController(),status=root.querySelector('[data-avatar-status]');
    const entry=current={host,abort,view:null,observer:null};
    const desc=()=>window.AvatarData.describe(player.sheet?.parsed,!!player.isMonster);
    let hairGender=null;
    function update(){
      const sheet=player.sheet?.parsed||{},data=window.AvatarData,gender=data.genderOf(sheet),select=root.querySelector('[data-sheet-path="appearance.model3d.hairStyle"]');
      if(hairGender!==gender){select.replaceChildren(...data.hairstylesFor(gender).map(([value,label])=>new Option(label,value)));hairGender=gender;}
      select.value=data.hairFor(gender,sheet.appearance?.model3d?.hairStyle);
      const equipped=data.hands(sheet);
      for(const hand of ['right','left']){const input=root.querySelector(`[data-appearance-slot="${hand}"]`);if(input){input.value=equipped[hand];input.title=equipped.shieldHand===hand?'В этой руке щит. Выберите оружие, чтобы перенести щит в другую руку.':'';}}
      const config=desc();entry.view?.update(config);
      status.textContent=config?'Человек · '+(gender==='female'?'Женский':'Мужской'):'3D-модели доступны для расы «Человек».';
      host.classList.toggle('avatar-portrait--empty',!config);
      root.querySelector('[data-avatar-walk]').disabled=!config||!entry.view;
      window.Board3D?.requestSync?.();
    }
    const hair=player.sheet?.parsed?.appearance?.model3d||{};
    root.querySelector('[data-sheet-path="appearance.model3d.hairColor"]').value=/^#[\da-f]{6}$/i.test(hair.hairColor)?hair.hairColor:'#493124';
    root.querySelector('[data-gender-select]').value=typeof normalizeGenderKeyForAppearance==='function'?normalizeGenderKeyForAppearance(player.sheet?.parsed?.notes?.details?.gender?.value):'male';
    root.addEventListener('input',update,{signal:abort.signal});root.addEventListener('change',update,{signal:abort.signal});
    root.querySelector('[data-avatar-walk]').addEventListener('click',event=>{const b=event.currentTarget,on=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(on));b.textContent=on?'Остановить':'Проверить ходьбу';entry.view?.walk(on);},{signal:abort.signal});
    root.querySelectorAll('[data-hair-color]').forEach(button=>button.addEventListener('click',()=>{const input=root.querySelector('[data-sheet-path="appearance.model3d.hairColor"]');input.value=button.dataset.hairColor;input.dispatchEvent(new Event('input',{bubbles:true}));},{signal:abort.signal}));
    entry.observer=new MutationObserver(()=>{if(!host.isConnected)api.dispose();});entry.observer.observe(root,{childList:true,subtree:true});
    update();
    try{
      loading ||= import(moduleUrl.href).catch(error=>{loading=null;throw error;});const module=await loading;
      if(gen!==generation||!host.isConnected)return;
      entry.view=module.createPortrait(host);update();
    }catch(error){if(gen===generation){status.textContent='Не удалось открыть 3D-превью. Проверьте поддержку WebGL в браузере.';console.warn('Character preview unavailable:',error.message);}}
  };
})();
