const assert = require('node:assert/strict');
const test = require('node:test');
const { rectangles, wall, tokenVisible } = require('../client/board-3d-data');

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
