(function(root,factory){
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DicePresentation=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const DURATION=2600,LEAD=240;
  function create(now=Date.now()){const startAt=Math.ceil((now+LEAD)/120)*120;return {startAt,revealAt:startAt+DURATION};}
  function read(value,now=Date.now(),serverNow=0){
    const startAt=Number(value?.startAt),revealAt=Number(value?.revealAt);
    if(!Number.isFinite(startAt)||!Number.isFinite(revealAt)||revealAt-startAt!==DURATION)return {...create(now),authoritative:false};
    // Ordinary clocks share the absolute deadline. A severely skewed device
    // falls back to the server envelope clock, without changing the duration.
    const offset=Math.abs(startAt-now)>30000&&Number(serverNow)>0?now-Number(serverNow):0;
    return {startAt:startAt+offset,revealAt:revealAt+offset,authoritative:true};
  }
  const progress=(timeline,now=Date.now())=>Math.min(1,Math.max(0,(now-timeline.startAt)/DURATION));
  return {DURATION,LEAD,create,read,progress};
});
