(function () {
  'use strict';
  let context, enabled = true, played = 0;
  const storageKey='d20_critical_sounds';
  try { enabled=localStorage.getItem(storageKey)!=='off'; } catch {}
  function unlock() {
    if(!enabled)return;
    try { const Audio=window.AudioContext||window.webkitAudioContext; if(!Audio)return; context ||= new Audio(); if(context.state==='suspended')void context.resume().catch(()=>{}); } catch {}
  }
  document.addEventListener('pointerdown',unlock,{passive:true});document.addEventListener('keydown',unlock,{passive:true});
  function play(dice) {
    const kinds=new Set(dice.filter(d=>Number(d.sides)===20).map(d=>Number(d.value)===20?'success':Number(d.value)===1?'failure':'').filter(Boolean));
    if(!enabled||!kinds.size||document.hidden||context?.state!=='running')return;
    let start=context.currentTime+.02;
    for(const kind of kinds) {
      const notes=kind==='success'?[523.25,659.25,783.99,1046.5]:[196,146.83,98];
      notes.forEach((frequency,i)=>{
        const oscillator=context.createOscillator(),gain=context.createGain(),at=start+i*.085;
        oscillator.type=kind==='success'?'sine':'triangle';oscillator.frequency.setValueAtTime(frequency,at);
        gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.055,at+.018);gain.gain.exponentialRampToValueAtTime(.001,at+.28);
        oscillator.connect(gain);gain.connect(context.destination);oscillator.start(at);oscillator.stop(at+.3);
        oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
      });played++;start+=.5;
    }
  }
  window.DiceCriticalFeedback={play,isEnabled:()=>enabled,setEnabled(value){enabled=!!value;try{localStorage.setItem(storageKey,enabled?'on':'off');}catch{}if(enabled)unlock();},inspect:()=>({played,enabled,state:context?.state||'locked'})};
})();
