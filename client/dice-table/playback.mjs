// Reconcile the shared wall-clock deadline once, then play on the monotonic
// animation clock. A server correction changes speed without rewinding dice.
export function createPlayback(timeline,wallNow,monotonicNow){
  let target=timeline.revealAt,start=Math.max(monotonicNow,monotonicNow+timeline.startAt-wallNow);
  let end=monotonicNow+Math.max(0,target-wallNow),from=0,current=0;
  return now=>{
    const sample=()=>end<=start?(now>=end?1:from):from+(1-from)*Math.min(1,Math.max(0,(now-start)/(end-start)));
    current=Math.max(current,sample());
    if(timeline.revealAt!==target){
      end+=timeline.revealAt-target;target=timeline.revealAt;
      from=current;start=now;
    }
    return current=Math.min(1,Math.max(current,sample()));
  };
}
