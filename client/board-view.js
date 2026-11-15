(function () {
  'use strict';
  const storageKey='int_board_view_mode';
  const normalize=value=>String(value||'').trim()==='3d'?'3d':'topdown';
  function save(mode) {
    try { if(typeof setAppStorageItem==='function')setAppStorageItem(storageKey,mode);else localStorage.setItem(storageKey,mode); } catch {}
  }
  function applyBoardViewMode(value) {
    const mode=normalize(value), wrapper=document.getElementById('board-wrapper');
    window.Board3D?.beforeViewModeChange?.(mode);
    wrapper?.classList.toggle('board-view--3d',mode==='3d');
    window.__boardViewMode=mode;
    window.__boardViewExtraTransform='';window.__boardViewTransformOrigin='0 0';
    const select=document.getElementById('board-view-mode-select');if(select)select.value=mode;
    window.Board3D?.setActive?.(mode==='3d');
    window.dispatchEvent(new CustomEvent('board-view-mode-changed',{detail:{mode}}));
  }
  function init() {
    const select=document.getElementById('board-view-mode-select');if(!select)return;
    let saved='topdown';
    try { saved=typeof getAppStorageItem==='function'?getAppStorageItem(storageKey):localStorage.getItem(storageKey); } catch {}
    const mode=normalize(saved);save(mode);applyBoardViewMode(mode);
    select.addEventListener('change',()=>{const next=normalize(select.value);save(next);applyBoardViewMode(next);});
  }
  window.applyBoardViewMode=applyBoardViewMode;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
