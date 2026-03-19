// Detached room cache and fog packing helpers extracted from client/core-helpers-network.js.

function resetDetachedRoomCache(roomId) {
  __roomDetachedCache.roomId = String(roomId || '');
  __roomDetachedCache.mapMetaById = new Map();
  __roomDetachedCache.wallsByMap = new Map();
  __roomDetachedCache.marksByMap = new Map();
  __roomDetachedCache.fogByMap = new Map();
  __roomDetachedCache.music = null;
}

function _cacheMapMeta(row) {
  const mapId = String(row?.map_id || row?.id || '').trim();
  if (!mapId) return;
  __roomDetachedCache.mapMetaById.set(mapId, {
    id: mapId,
    name: String(row?.name || '').trim() || 'Карта',
    sectionId: String(row?.section_id || '').trim() || null,
    boardWidth: Math.max(5, Math.min(150, Number(row?.board_width) || 10)),
    boardHeight: Math.max(5, Math.min(150, Number(row?.board_height) || 10)),
    boardBgUrl: row?.board_bg_url ? String(row.board_bg_url) : null,
    boardBgStoragePath: row?.board_bg_storage_path ? String(row.board_bg_storage_path) : null,
    boardBgStorageBucket: row?.board_bg_storage_bucket ? String(row.board_bg_storage_bucket) : null,
    gridAlpha: Number.isFinite(Number(row?.grid_alpha)) ? clamp(Number(row.grid_alpha), 0, 1) : 1,
    wallAlpha: Number.isFinite(Number(row?.wall_alpha)) ? clamp(Number(row.wall_alpha), 0, 1) : 1,
    updatedAt: row?.updated_at || null
  });
}

function _cacheWallRows(rows) {
  const grouped = new Map();
  for (const row of (Array.isArray(rows) ? rows : [])) {
    const mapId = String(row?.map_id || '').trim();
    const dir = String(row?.dir || '').toUpperCase();
    if (!mapId || !dir) continue;
    if (!grouped.has(mapId)) grouped.set(mapId, []);
    grouped.get(mapId).push({
      x: Number(row?.x) || 0,
      y: Number(row?.y) || 0,
      dir,
      type: String(row?.wall_type || row?.type || 'stone'),
      thickness: Math.max(1, Math.min(12, Number(row?.thickness) || 4))
    });
  }
  __roomDetachedCache.wallsByMap = grouped;
}

function _cacheUpsertWallRow(row) {
  const mapId = String(row?.map_id || '').trim();
  const dir = String(row?.dir || '').toUpperCase();
  if (!mapId || !dir) return;
  const list = Array.isArray(__roomDetachedCache.wallsByMap.get(mapId)) ? [...__roomDetachedCache.wallsByMap.get(mapId)] : [];
  const k = `${Number(row?.x) || 0},${Number(row?.y) || 0},${dir}`;
  const next = list.filter(w => `${Number(w?.x) || 0},${Number(w?.y) || 0},${String(w?.dir || '').toUpperCase()}` !== k);
  next.push({
    x: Number(row?.x) || 0,
    y: Number(row?.y) || 0,
    dir,
    type: String(row?.wall_type || row?.type || 'stone'),
    thickness: Math.max(1, Math.min(12, Number(row?.thickness) || 4))
  });
  __roomDetachedCache.wallsByMap.set(mapId, next);
}

function _cacheDeleteWallRow(row) {
  const mapId = String(row?.map_id || '').trim();
  const dir = String(row?.dir || '').toUpperCase();
  if (!mapId || !dir) return;
  const list = Array.isArray(__roomDetachedCache.wallsByMap.get(mapId)) ? __roomDetachedCache.wallsByMap.get(mapId) : [];
  const k = `${Number(row?.x) || 0},${Number(row?.y) || 0},${dir}`;
  __roomDetachedCache.wallsByMap.set(mapId, list.filter(w => `${Number(w?.x) || 0},${Number(w?.y) || 0},${String(w?.dir || '').toUpperCase()}` !== k));
}

function _normalizeMarkPayload(row) {
  const payload = (row?.payload && typeof row.payload === 'object') ? deepClone(row.payload) : {};
  const id = String(row?.mark_id || payload?.id || '').trim();
  const mapId = String(row?.map_id || payload?.mapId || '').trim();
  const ownerId = String(row?.owner_id || payload?.ownerId || '').trim();
  const kind = String(row?.kind || payload?.kind || '').trim();
  if (!id || !mapId || !kind) return null;
  payload.id = id;
  payload.mapId = mapId;
  payload.ownerId = ownerId;
  payload.kind = kind;
  return payload;
}

function _cacheMarkRows(rows) {
  const grouped = new Map();
  for (const row of (Array.isArray(rows) ? rows : [])) {
    const payload = _normalizeMarkPayload(row);
    if (!payload) continue;
    const mapId = String(payload.mapId || '').trim();
    if (!grouped.has(mapId)) grouped.set(mapId, []);
    grouped.get(mapId).push(payload);
  }
  __roomDetachedCache.marksByMap = grouped;
}

function _cacheUpsertMarkRow(row) {
  const payload = _normalizeMarkPayload(row);
  if (!payload) return;
  const mapId = String(payload.mapId || '').trim();
  const list = Array.isArray(__roomDetachedCache.marksByMap.get(mapId)) ? [...__roomDetachedCache.marksByMap.get(mapId)] : [];
  const next = list.filter(m => String(m?.id || '') !== String(payload.id));
  next.push(payload);
  __roomDetachedCache.marksByMap.set(mapId, next);
}

function _cacheDeleteMarkRow(row) {
  const mapId = String(row?.map_id || '').trim();
  const markId = String(row?.mark_id || '').trim();
  if (!mapId || !markId) return;
  const list = Array.isArray(__roomDetachedCache.marksByMap.get(mapId)) ? __roomDetachedCache.marksByMap.get(mapId) : [];
  __roomDetachedCache.marksByMap.set(mapId, list.filter(m => String(m?.id || '') !== markId));
}

function _defaultFogDetached(row) {
  const settings = (row?.settings && typeof row.settings === 'object') ? deepClone(row.settings) : {};
  const manualStamps = Array.isArray(row?.manual_stamps) ? deepClone(row.manual_stamps) : [];
  const fog = {
    enabled: typeof settings.enabled === 'boolean' ? settings.enabled : false,
    mode: (settings.mode === 'dynamic') ? 'dynamic' : 'manual',
    manualBase: (settings.manualBase === 'reveal') ? 'reveal' : 'hide',
    manualStamps,
    visionRadius: Number.isFinite(Number(settings.visionRadius)) ? clamp(Number(settings.visionRadius), 1, 60) : 8,
    useWalls: typeof settings.useWalls === 'boolean' ? settings.useWalls : true,
    exploredEnabled: typeof settings.exploredEnabled === 'boolean' ? settings.exploredEnabled : true,
    gmViewMode: (settings.gmViewMode === 'player') ? 'player' : 'gm',
    gmOpen: typeof settings.gmOpen === 'boolean' ? settings.gmOpen : false,
    moveOnlyExplored: typeof settings.moveOnlyExplored === 'boolean' ? settings.moveOnlyExplored : false,
    exploredPacked: String(row?.explored_packed || settings.exploredPacked || ''),
    explored: []
  };
  try {
    if (fog.exploredPacked) fog.explored = unpackFogExplored(fog.exploredPacked);
    else if (Array.isArray(settings.explored)) fog.explored = deepClone(settings.explored);
  } catch {}
  return fog;
}

function _cacheFogRows(rows) {
  const grouped = new Map();
  for (const row of (Array.isArray(rows) ? rows : [])) {
    const mapId = String(row?.map_id || '').trim();
    if (!mapId) continue;
    grouped.set(mapId, _defaultFogDetached(row));
  }
  __roomDetachedCache.fogByMap = grouped;
}

function _cacheUpsertFogRow(row) {
  const mapId = String(row?.map_id || '').trim();
  if (!mapId) return;
  __roomDetachedCache.fogByMap.set(mapId, _defaultFogDetached(row));
}

function _cacheMusicRow(row) {
  const payload = (row?.payload && typeof row.payload === 'object') ? deepClone(row.payload) : null;
  __roomDetachedCache.music = payload;
}

function applyDetachedPayloadToState(state) {
  const st = ensureStateHasMaps(deepClone(state || {}));
  const maps = Array.isArray(st.maps) ? st.maps : [];
  maps.forEach((m) => {
    if (!m || typeof m !== 'object') return;
    const mapId = String(m.id || '');
    const meta = __roomDetachedCache.mapMetaById.get(mapId);
    if (meta) {
      m.name = meta.name || m.name || 'Карта';
      m.sectionId = meta.sectionId || m.sectionId || null;
      m.boardWidth = meta.boardWidth;
      m.boardHeight = meta.boardHeight;
      m.boardBgUrl = meta.boardBgUrl || null;
      m.boardBgDataUrl = meta.boardBgUrl || null;
      m.boardBgStoragePath = meta.boardBgStoragePath || null;
      m.boardBgStorageBucket = meta.boardBgStorageBucket || null;
      m.gridAlpha = meta.gridAlpha;
      m.wallAlpha = meta.wallAlpha;
    }
    if (__roomDetachedCache.wallsByMap.has(mapId)) m.walls = deepClone(__roomDetachedCache.wallsByMap.get(mapId) || []);
    if (__roomDetachedCache.marksByMap.has(mapId)) m.marks = deepClone(__roomDetachedCache.marksByMap.get(mapId) || []);
    if (__roomDetachedCache.fogByMap.has(mapId)) m.fog = deepClone(__roomDetachedCache.fogByMap.get(mapId));
  });
  const active = getActiveMap(st);
  if (active) {
    st.boardWidth = Number(active.boardWidth) || 10;
    st.boardHeight = Number(active.boardHeight) || 10;
    st.boardBgDataUrl = active.boardBgUrl || active.boardBgDataUrl || null;
    st.boardBgUrl = active.boardBgUrl || active.boardBgDataUrl || null;
    st.boardBgStoragePath = active.boardBgStoragePath || null;
    st.boardBgStorageBucket = active.boardBgStorageBucket || null;
    st.gridAlpha = (typeof active.gridAlpha !== 'undefined') ? active.gridAlpha : 1;
    st.wallAlpha = (typeof active.wallAlpha !== 'undefined') ? active.wallAlpha : 1;
    st.walls = Array.isArray(active.walls) ? deepClone(active.walls) : [];
    st.marks = Array.isArray(active.marks) ? deepClone(active.marks) : [];
    st.fog = (active.fog && typeof active.fog === 'object') ? deepClone(active.fog) : st.fog;
  }
  if (__roomDetachedCache.music && typeof __roomDetachedCache.music === 'object') {
    st.bgMusic = deepClone(__roomDetachedCache.music);
  }
  return st;
}
window.applyDetachedPayloadToState = applyDetachedPayloadToState;

let __detachedRoomRefreshScheduled = false;

function _runDetachedRoomRefresh() {
  __detachedRoomRefreshScheduled = false;
  try { window.refreshDetachedStateView?.(); } catch {}
}

function _refreshDetachedRoomView() {
  if (__detachedRoomRefreshScheduled) return;
  __detachedRoomRefreshScheduled = true;
  try {
    const raf = window.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
    raf(_runDetachedRoomRefresh);
  } catch {
    _runDetachedRoomRefresh();
  }
}


// ===== Fog explored packing (bitset -> base64) =====
// Stores explored cells compactly in state.fog.exploredPacked (base64 string of bytes).
// This prevents room_state from growing with huge fog.explored arrays (major egress saver).
function _fogBitBytesLen(boardW, boardH) {
  const w = Math.max(1, Number(boardW) || 1);
  const h = Math.max(1, Number(boardH) || 1);
  const bits = w * h;
  return Math.ceil(bits / 8);
}
function _fogB64ToBytes(b64, expectedLen) {
  try {
    const s = String(b64 || '');
    if (!s) return new Uint8Array(expectedLen);
    const bin = atob(s);
    const out = new Uint8Array(expectedLen);
    const n = Math.min(bin.length, expectedLen);
    for (let i = 0; i < n; i++) out[i] = bin.charCodeAt(i) & 255;
    return out;
  } catch {
    return new Uint8Array(expectedLen);
  }
}
function _fogBytesToB64(bytes) {
  try {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  } catch {
    return '';
  }
}
function _fogSetExploredBit(bytes, idx) {
  const bi = idx >> 3;         // /8
  const mask = 1 << (idx & 7); // %8
  const prev = bytes[bi] & mask;
  bytes[bi] = bytes[bi] | mask;
  return !prev; // true if changed
}
function _fogApplyExploredDeltaToState(state, cells) {
  try {
    if (!state || !state.fog) return false;
    const w = Number(state.boardWidth) || 10;
    const h = Number(state.boardHeight) || 10;
    const len = _fogBitBytesLen(w, h);
    const bytes = _fogB64ToBytes(state.fog.exploredPacked, len);
    let changed = false;

    for (const k of (cells || [])) {
      const s = String(k || '');
      const parts = s.split(',');
      if (parts.length !== 2) continue;
      const x = Number(parts[0]), y = Number(parts[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const idx = (y * w + x);
      if (_fogSetExploredBit(bytes, idx)) changed = true;
    }

    if (changed) {
      state.fog.exploredPacked = _fogBytesToB64(bytes);
      // Keep legacy array tiny/empty to avoid bloat
      state.fog.explored = [];
    }
    return changed;
  } catch {
    return false;
  }
}

