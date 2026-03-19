// Map/state normalization helpers extracted from client/core-helpers-network.js.

function ensureStateHasMaps(state) {
  if (!state || typeof state !== "object") return createInitialGameState();

  // already new schema
  if (Array.isArray(state.maps) && state.maps.length) {
    if (!state.currentMapId) state.currentMapId = String(state.maps[0].id || "map-1");
    // ensure sections exist
    if (!Array.isArray(state.mapSections) || !state.mapSections.length) {
      const sid = (crypto?.randomUUID ? crypto.randomUUID() : ("sec-" + Math.random().toString(16).slice(2)));
      state.mapSections = [{ id: sid, name: "Раздел 1" }];
      // attach all maps to that section
      state.maps.forEach(m => { if (m && !m.sectionId) m.sectionId = sid; });
    } else {
      const firstSid = String(state.mapSections[0]?.id || "");
    state.maps.forEach(m => {
      if (m && !m.sectionId) m.sectionId = firstSid;
      if (m && !Array.isArray(m.marks)) m.marks = [];
      if (m && typeof m.boardBgUrl === 'undefined') m.boardBgUrl = m.boardBgDataUrl || null;
      if (m && typeof m.boardBgStoragePath === 'undefined') m.boardBgStoragePath = null;
      if (m && typeof m.boardBgStorageBucket === 'undefined') m.boardBgStorageBucket = null;
      // ensure fog defaults on every map
      if (m && (!m.fog || typeof m.fog !== 'object')) {
        m.fog = {
          enabled: false,
          mode: 'manual',
          manualBase: 'hide',
          manualStamps: [],
          visionRadius: 8,
          useWalls: true,
          exploredEnabled: true,
          gmViewMode: 'gm',
          gmOpen: false,
          moveOnlyExplored: false,
          explored: []
        };
      } else if (m && m.fog) {
        if (typeof m.fog.enabled !== 'boolean') m.fog.enabled = false;
        if (m.fog.mode !== 'manual' && m.fog.mode !== 'dynamic') m.fog.mode = 'manual';
        if (m.fog.manualBase !== 'hide' && m.fog.manualBase !== 'reveal') m.fog.manualBase = 'hide';
        if (!Array.isArray(m.fog.manualStamps)) m.fog.manualStamps = [];
        if (!Number.isFinite(Number(m.fog.visionRadius))) m.fog.visionRadius = 8;
        if (typeof m.fog.useWalls !== 'boolean') m.fog.useWalls = true;
        if (typeof m.fog.exploredEnabled !== 'boolean') m.fog.exploredEnabled = true;
        if (m.fog.gmViewMode !== 'gm' && m.fog.gmViewMode !== 'player') m.fog.gmViewMode = 'gm';
        if (typeof m.fog.gmOpen !== 'boolean') m.fog.gmOpen = false;
        if (typeof m.fog.moveOnlyExplored !== 'boolean') m.fog.moveOnlyExplored = false;
        if (!Array.isArray(m.fog.explored)) m.fog.explored = [];
      }
    });
    }
    state.schemaVersion = Math.max(Number(state.schemaVersion) || 0, 3);

    // root mirror for map background (active map)
    if (typeof state.boardBgUrl === 'undefined') {
      const id = String(state.currentMapId || "");
      const maps = Array.isArray(state.maps) ? state.maps : [];
      const m = maps.find(mm => String(mm?.id) === id) || maps[0] || null;
      state.boardBgUrl = (m && (m.boardBgUrl || m.boardBgDataUrl)) ? (m.boardBgUrl || m.boardBgDataUrl) : null;
    }
    if (typeof state.boardBgStoragePath === 'undefined') {
      const id = String(state.currentMapId || "");
      const maps = Array.isArray(state.maps) ? state.maps : [];
      const m = maps.find(mm => String(mm?.id) === id) || maps[0] || null;
      state.boardBgStoragePath = m?.boardBgStoragePath || null;
    }
    if (typeof state.boardBgStorageBucket === 'undefined') {
      const id = String(state.currentMapId || "");
      const maps = Array.isArray(state.maps) ? state.maps : [];
      const m = maps.find(mm => String(mm?.id) === id) || maps[0] || null;
      state.boardBgStorageBucket = m?.boardBgStorageBucket || null;
    }

    // root mirror for marks (active map)
    if (!Array.isArray(state.marks)) {
      const id = String(state.currentMapId || "");
      const maps = Array.isArray(state.maps) ? state.maps : [];
      const m = maps.find(mm => String(mm?.id) === id) || maps[0] || null;
      state.marks = (m && Array.isArray(m.marks)) ? deepClone(m.marks) : [];
    }
    return state;
  }

  // migrate old schema -> single map + single section
  const sectionId = (crypto?.randomUUID ? crypto.randomUUID() : ("sec-" + Math.random().toString(16).slice(2)));
  const mapId = (crypto?.randomUUID ? crypto.randomUUID() : ("map-" + Math.random().toString(16).slice(2)));
  const migratedMap = {
    id: mapId,
    name: "Карта 1",
    sectionId,
    boardWidth: Number(state.boardWidth) || 10,
    boardHeight: Number(state.boardHeight) || 10,
    boardBgDataUrl: state.boardBgDataUrl || null,
    boardBgUrl: state.boardBgUrl || state.boardBgDataUrl || null,
    boardBgStoragePath: state.boardBgStoragePath || null,
    boardBgStorageBucket: state.boardBgStorageBucket || null,
    gridAlpha: (typeof state.gridAlpha !== 'undefined') ? state.gridAlpha : 1,
    wallAlpha: (typeof state.wallAlpha !== 'undefined') ? state.wallAlpha : 1,
    walls: Array.isArray(state.walls) ? state.walls : [],
    marks: Array.isArray(state.marks) ? state.marks : [],
    fog: (state.fog && typeof state.fog === 'object') ? state.fog : {
      enabled: false,
      mode: 'manual',
      manualBase: 'hide',
      manualStamps: [],
      visionRadius: 8,
      useWalls: true,
      exploredEnabled: true,
      explored: []
    },
    playersPos: {}
  };

  (state.players || []).forEach((p) => {
    if (!p || !p.id) return;
    if (p.x === null || p.y === null || typeof p.x === "undefined" || typeof p.y === "undefined") return;
    migratedMap.playersPos[p.id] = { x: p.x, y: p.y };
  });

  state.schemaVersion = 3;
  state.mapSections = [{ id: sectionId, name: "Раздел 1" }];
  state.currentMapId = mapId;
  state.maps = [migratedMap];

  // keep root mirror
  state.boardWidth = migratedMap.boardWidth;
  state.boardHeight = migratedMap.boardHeight;
  state.boardBgDataUrl = migratedMap.boardBgDataUrl;
  state.boardBgUrl = migratedMap.boardBgUrl;
  state.boardBgStoragePath = migratedMap.boardBgStoragePath;
  state.boardBgStorageBucket = migratedMap.boardBgStorageBucket;
  state.gridAlpha = migratedMap.gridAlpha ?? 1;
  state.wallAlpha = migratedMap.wallAlpha ?? 1;
  state.walls = migratedMap.walls;
  state.marks = migratedMap.marks;

  // keep root mirror
  state.fog = migratedMap.fog;

  // Ensure background music defaults
  if (!state.bgMusic || typeof state.bgMusic !== 'object') {
    state.bgMusic = { tracks: [], currentTrackId: null, isPlaying: false, volume: 40 };
  } else {
    if (!Array.isArray(state.bgMusic.tracks)) state.bgMusic.tracks = [];
    if (typeof state.bgMusic.currentTrackId === 'undefined') state.bgMusic.currentTrackId = null;
    if (typeof state.bgMusic.isPlaying !== 'boolean') state.bgMusic.isPlaying = false;
    const v = Number(state.bgMusic.volume);
    state.bgMusic.volume = Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 40;
  }

  return state;
}

function getActiveMap(state) {
  const st = ensureStateHasMaps(state);
  const id = String(st.currentMapId || "");
  const maps = Array.isArray(st.maps) ? st.maps : [];
  return maps.find(m => String(m.id) === id) || maps[0] || null;
}

function syncActiveToMap(state) {
  const st = ensureStateHasMaps(state);
  const m = getActiveMap(st);
  if (!m) return st;

  m.boardWidth = Number(st.boardWidth) || 10;
  m.boardHeight = Number(st.boardHeight) || 10;
  m.boardBgDataUrl = st.boardBgDataUrl || null;
  m.boardBgUrl = st.boardBgUrl || st.boardBgDataUrl || null;
  m.boardBgStoragePath = st.boardBgStoragePath || null;
  m.boardBgStorageBucket = st.boardBgStorageBucket || null;
  m.gridAlpha = (typeof st.gridAlpha !== 'undefined') ? st.gridAlpha : 1;
  m.wallAlpha = (typeof st.wallAlpha !== 'undefined') ? st.wallAlpha : 1;

  m.walls = Array.isArray(st.walls) ? st.walls : [];

  // sync marks (root mirror -> map)
  m.marks = Array.isArray(st.marks) ? st.marks : [];

  // sync fog (root mirror -> map)
  if (!m.fog || typeof m.fog !== 'object') m.fog = {};
  if (st.fog && typeof st.fog === 'object') m.fog = deepClone(st.fog);

  // IMPORTANT (architecture v4): token positions are NOT stored in room_state anymore.
  // They live in a dedicated table (room_tokens). Keeping them in room_state creates
  // race conditions ("last write wins") and causes visual rollbacks when multiple
  // users move simultaneously.

  return st;
}

// ===== Fog explored packing (to reduce room_state payload size) =====
// We store a compact RLE-packed string in fog.exploredPacked and keep fog.explored
// decoded in-memory for the UI. This keeps compatibility with existing logic
// while drastically reducing DB egress when explored grows large.
function packFogExplored(cells, w, h) {
  try {
    const W = Math.max(1, Number(w) || 1);
    const H = Math.max(1, Number(h) || 1);
    const set = new Set();
    (Array.isArray(cells) ? cells : []).forEach((c) => {
      const s = String(c || '');
      const parts = s.split(',');
      if (parts.length !== 2) return;
      const x = Number(parts[0]);
      const y = Number(parts[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      set.add((y * W + x) | 0);
    });
    const idx = Array.from(set).sort((a, b) => a - b);
    if (!idx.length) return `${W}x${H}:`;
    const ranges = [];
    let start = idx[0];
    let prev = idx[0];
    for (let i = 1; i < idx.length; i++) {
      const v = idx[i];
      if (v === prev + 1) {
        prev = v;
        continue;
      }
      const len = prev - start + 1;
      ranges.push(`${start.toString(36)}.${len.toString(36)}`);
      start = prev = v;
    }
    ranges.push(`${start.toString(36)}.${(prev - start + 1).toString(36)}`);
    return `${W}x${H}:${ranges.join(',')}`;
  } catch {
    return null;
  }
}

function unpackFogExplored(packed) {
  try {
    const s = String(packed || '');
    const [wh, rest = ''] = s.split(':');
    const [wStr, hStr] = wh.split('x');
    const W = Math.max(1, parseInt(wStr, 10) || 1);
    const H = Math.max(1, parseInt(hStr, 10) || 1);
    if (!rest) return [];
    const out = [];
    const parts = rest.split(',').filter(Boolean);
    for (const p of parts) {
      const [a, b] = p.split('.');
      const start = parseInt(a, 36);
      const len = parseInt(b, 36);
      if (!Number.isFinite(start) || !Number.isFinite(len) || len <= 0) continue;
      for (let i = 0; i < len; i++) {
        const idx = start + i;
        const x = idx % W;
        const y = Math.floor(idx / W);
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        out.push(`${x},${y}`);
      }
    }
    return out;
  } catch {
    return [];
  }
}

function loadMapToRoot(state, mapId) {
  const st = ensureStateHasMaps(state);
  const targetId = String(mapId || "");
  const maps = Array.isArray(st.maps) ? st.maps : [];
  const m = maps.find(mm => String(mm.id) === targetId) || maps[0];
  if (!m) return st;

  st.currentMapId = String(m.id);

  st.boardWidth = Number(m.boardWidth) || 10;
  st.boardHeight = Number(m.boardHeight) || 10;
  st.boardBgDataUrl = m.boardBgDataUrl || null;
  st.boardBgUrl = m.boardBgUrl || m.boardBgDataUrl || null;
  st.boardBgStoragePath = m.boardBgStoragePath || null;
  st.boardBgStorageBucket = m.boardBgStorageBucket || null;
  st.gridAlpha = (typeof m.gridAlpha !== 'undefined') ? m.gridAlpha : 1;
  st.wallAlpha = (typeof m.wallAlpha !== 'undefined') ? m.wallAlpha : 1;

  st.walls = Array.isArray(m.walls) ? m.walls : [];
  st.marks = Array.isArray(m.marks) ? deepClone(m.marks) : [];
  st.fog = (m.fog && typeof m.fog === 'object') ? deepClone(m.fog) : {
    enabled: false,
    mode: 'manual',
    manualBase: 'hide',
    manualStamps: [],
    visionRadius: 8,
    useWalls: true,
    exploredEnabled: true,
    gmViewMode: 'gm',
    gmOpen: false,
    moveOnlyExplored: false,
    explored: []
  };

  // Decode packed explored cells if present
  try {
    if (st.fog && typeof st.fog === 'object') {
      const packed = st.fog.exploredPacked;
      const hasArr = Array.isArray(st.fog.explored) && st.fog.explored.length;
      if (packed && !hasArr) {
        st.fog.explored = unpackFogExplored(packed);
      }
    }
  } catch {}

  // IMPORTANT (architecture v4): do NOT apply token positions from map snapshot.
  // Positions are authoritative in room_tokens and arrive via realtime.

  return st;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function getPlayerSheetTs(player) {
  const n = Number(player?.sheetUpdatedAt);
  return Number.isFinite(n) ? n : 0;
}

function mergeNewestPlayerSheets(targetState, sourceState) {
  try {
    const targetPlayers = Array.isArray(targetState?.players) ? targetState.players : [];
    const sourcePlayers = Array.isArray(sourceState?.players) ? sourceState.players : [];
    if (!targetPlayers.length || !sourcePlayers.length) return targetState;

    const srcById = new Map();
    sourcePlayers.forEach((p) => {
      if (!p?.id) return;
      srcById.set(String(p.id), p);
    });

    targetPlayers.forEach((p) => {
      if (!p?.id) return;
      const src = srcById.get(String(p.id));
      if (!src) return;
      const srcTs = getPlayerSheetTs(src);
      const dstTs = getPlayerSheetTs(p);
      if (srcTs <= dstTs) return;
      p.sheet = deepClone(src.sheet);
      p.sheetUpdatedAt = srcTs;
      if (typeof src.name === 'string' && src.name.trim()) p.name = src.name;
    });
  } catch {}
  return targetState;
}

// ===== Detached room payload caches (walls / marks / fog / music / map meta) =====
const __roomDetachedCache = {
  roomId: null,
  mapMetaById: new Map(),
  wallsByMap: new Map(),
  marksByMap: new Map(),
  fogByMap: new Map(),
  music: null
};
window.__roomDetachedCache = __roomDetachedCache;

