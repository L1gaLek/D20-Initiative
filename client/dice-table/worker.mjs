import {simulateThrow} from './physics.mjs?v=20261124-charge-2';
self.onmessage=({data})=>{
  try {const result=simulateThrow(data.dice,data.seed);self.postMessage({id:data.id,...result},[result.frames.buffer]);}
  catch(error){self.postMessage({id:data.id,error:String(error.message||error)});}
};
