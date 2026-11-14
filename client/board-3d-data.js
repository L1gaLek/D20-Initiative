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
      type: ['wood', 'metal'].includes(wall.type) ? wall.type : 'stone',
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
  const api = { rectangles, cellState, wall, tokenVisible };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Board3DData = api;
})(typeof window !== 'undefined' ? window : globalThis);
