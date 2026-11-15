// Geometry and visibility shared by the 3D renderer and its regression tests.
(function (root) {
  'use strict';
  function rectangles(mask, width, height, value) {
    const used = new Uint8Array(width * height);
    const result = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (used[i] || mask[i] !== value) continue;
      let w = 1;
      while (x + w < width && !used[i + w] && mask[i + w] === value) w++;
      let h = 1;
      rows: while (y + h < height) {
        for (let dx = 0; dx < w; dx++) {
          const j = (y + h) * width + x + dx;
          if (used[j] || mask[j] !== value) break rows;
        }
        h++;
      }
      for (let dy = 0; dy < h; dy++) used.fill(1, (y + dy) * width + x, (y + dy) * width + x + w);
      result.push({ x, y, w, h });
    }
    return result;
  }
  function cellState(view, x, y) {
    return x >= 0 && y >= 0 && x < view.width && y < view.height ? view.mask[y * view.width + x] : 0;
  }
  function wall(wall, view) {
    const x = Number(wall.x), y = Number(wall.y);
    if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
    const dir = String(wall.dir || '').toUpperCase();
    const block = !['N', 'E', 'S', 'W'].includes(dir);
    const nx = x + (dir === 'E' ? 1 : dir === 'W' ? -1 : 0);
    const ny = y + (dir === 'S' ? 1 : dir === 'N' ? -1 : 0);
    if (!view.omniscient && !cellState(view, x, y) && (block || !cellState(view, nx, ny))) return null;
    const thickness = Math.max(.04, Math.min(.24, (Number(wall.thickness) || 4) / 50));
    return {
      x: x + (dir === 'E' ? 1 : dir === 'W' ? 0 : .5),
      z: y + (dir === 'S' ? 1 : dir === 'N' ? 0 : .5),
      w: block ? 1 : (dir === 'E' || dir === 'W' ? thickness : 1 + thickness),
      d: block ? 1 : (dir === 'N' || dir === 'S' ? thickness : 1 + thickness),
      type: ['wood', 'metal', 'magic'].includes(wall.type) ? wall.type : 'stone',
      explored: !view.omniscient && Math.max(cellState(view, x, y), cellState(view, nx, ny)) < 2
    };
  }
  function tokenVisible(token, view) {
    if (token.hidden || !Number.isFinite(token.x) || !Number.isFinite(token.y)) return false;
    const size = Math.max(1, Number(token.size) || 1);
    let best = 0;
    for (let y = Math.floor(token.y); y < token.y + size; y++) {
      for (let x = Math.floor(token.x); x < token.x + size; x++) best = Math.max(best, cellState(view, x, y));
    }
    if (best === 0 && !view.omniscient) return false;
    // Last-known silhouettes can only occupy explored cells. Never substitute
    // their authoritative (currently hidden) coordinates into a rendered pawn.
    return view.omniscient || (token.ghost ? best > 0 : best === 2);
  }
  // A visual route only. Authoritative movement/permissions stay in the game
  // handlers. Never animate a figure through unseen cells or through a wall.
  function movementRoute(from,to,size,view,walls=[],tokens=[],id='') {
    if(![from.x,from.y,to.x,to.y].every(Number.isInteger)||Math.max(Math.abs(to.x-from.x),Math.abs(to.y-from.y))>24)return null;
    const edge=(ax,ay,bx,by)=>ax<bx||ax===bx&&ay<by?`${ax},${ay}|${bx},${by}`:`${bx},${by}|${ax},${ay}`;
    const edges=new Set(),blocks=new Set();
    for(const w of walls){const d=String(w.dir||'').toUpperCase(),x=Number(w.x),y=Number(w.y);if(!Number.isInteger(x)||!Number.isInteger(y))continue;
      if(!['N','E','S','W'].includes(d))blocks.add(`${x},${y}`);
      else edges.add(edge(x,y,x+(d==='E'?1:d==='W'?-1:0),y+(d==='S'?1:d==='N'?-1:0)));
    }
    for(const t of tokens)if(t.id!==id&&!t.ghost)for(let y=t.y;y<t.y+t.size;y++)for(let x=t.x;x<t.x+t.size;x++)blocks.add(`${x},${y}`);
    const free=(x,y)=>{
      if(x<0||y<0||x+size>view.width||y+size>view.height)return false;
      for(let yy=y;yy<y+size;yy++)for(let xx=x;xx<x+size;xx++)if(blocks.has(`${xx},${yy}`)||!view.omniscient&&cellState(view,xx,yy)!==2)return false;
      return true;
    };
    const cross=(x,y,dx,dy)=>{
      for(let k=0;k<size;k++){
        const ax=x+(dx>0?size-1:0)+(dy?k:0),ay=y+(dy>0?size-1:0)+(dx?k:0);
        if(edges.has(edge(ax,ay,ax+dx,ay+dy)))return false;
      }return true;
    };
    if(!free(from.x,from.y)||!free(to.x,to.y))return null;
    const key=(x,y)=>y*view.width+x,start=key(from.x,from.y),end=key(to.x,to.y);
    const queue=[{...from,depth:0}],parents=new Map([[start,null]]);
    for(let head=0;head<queue.length&&head<6000;head++){
      const p=queue[head],k=key(p.x,p.y);
      if(k===end){const path=[];let q=p;while(q){path.push({x:q.x,y:q.y});q=parents.get(key(q.x,q.y));}return path.reverse().slice(1);}
      if(p.depth>=32)continue;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]){
        const x=p.x+dx,y=p.y+dy,n=key(x,y);if(parents.has(n)||!free(x,y))continue;
        if(dx&&dy){if(!free(p.x+dx,p.y)||!free(p.x,p.y+dy)||!cross(p.x,p.y,dx,0)||!cross(p.x,p.y,0,dy)||!cross(p.x+dx,p.y,0,dy)||!cross(p.x,p.y+dy,dx,0))continue;}
        else if(!cross(p.x,p.y,dx,dy))continue;
        parents.set(n,p);queue.push({x,y,depth:p.depth+1});
      }
    }return null;
  }
  const api = { rectangles, cellState, wall, tokenVisible, movementRoute };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Board3DData = api;
})(typeof window !== 'undefined' ? window : globalThis);
