// ================== HELPER ==================

function deepClone(obj) {
  try { return structuredClone(obj); } catch {}
  return JSON.parse(JSON.stringify(obj || null));
}

function createInitialGameState() {
  const sectionId = (crypto?.randomUUID ? crypto.randomUUID() : ("sec-" + Math.random().toString(16).slice(2)));
  const mapId = (crypto?.randomUUID ? crypto.randomUUID() : ("map-" + Math.random().toString(16).slice(2)));
  const base = {
    id: mapId,
    name: "Карта 1",
    sectionId,
    boardWidth: 10,
    boardHeight: 10,
    boardBgDataUrl: null,
    boardBgUrl: null,
    boardBgStoragePath: null,
    boardBgStorageBucket: null,
    gridAlpha: 1,
    wallAlpha: 1,
    walls: [],
    // Marks/areas (per map): translucent rectangles/circles/polygons
    marks: [],
    // Fog of war (per map)
    fog: {
      enabled: false,
      mode: 'manual', // 'manual' | 'dynamic'
      manualBase: 'hide', // 'hide' | 'reveal'
      // Manual stamps are stored as {x,y,r,mode} in cell coordinates (r in cells)
      manualStamps: [],
      // Dynamic settings
      visionRadius: 8,
      useWalls: true,
      exploredEnabled: true,
      // GM viewing options
      gmViewMode: 'gm',
      gmOpen: false,
      // Player movement restriction (dynamic): only to visible/explored
      moveOnlyExplored: false,
      // Shared explored cells for the party ("x,y" strings)
      explored: []
    },
    playersPos: {} // playerId -> {x,y}
  };
  return {
    schemaVersion: 3,

    mapSections: [{ id: sectionId, name: "Раздел 1" }],

    // Active map is mirrored into root-level fields for backward compatibility
    currentMapId: mapId,
    maps: [base],

    boardWidth: base.boardWidth,
    boardHeight: base.boardHeight,
    boardBgDataUrl: base.boardBgDataUrl,
    boardBgUrl: base.boardBgUrl,
    boardBgStoragePath: base.boardBgStoragePath,
    boardBgStorageBucket: base.boardBgStorageBucket,
    walls: base.walls,
    marks: base.marks,

    // Mirror fog from active map for easy access
    fog: base.fog,

    phase: "lobby",
    players: [],
    turnOrder: [],
    currentTurnIndex: 0,
    round: 1,
    log: [],

    // Background music (GM-controlled, synced to all)
    bgMusic: {
      tracks: [], // [{id,name,desc,url,path,createdAt}]
      currentTrackId: null,
      isPlaying: false,
      volume: 40 // 0..100
    }
  };
}

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

function isAreaFree(state, ignorePlayerId, x, y, size) {
  const walls = Array.isArray(state.walls) ? state.walls : [];
  // walls block only the top-left cell of a token (as in server)
  if (walls.some(w => w && w.x === x && w.y === y)) return false;

  const players = Array.isArray(state.players) ? state.players : [];
  for (const p of players) {
    if (!p || p.id === ignorePlayerId) continue;
    if (p.x === null || p.y === null) continue;
    const ps = Number(p.size) || 1;

    // AABB intersect
    const inter = !(x + size <= p.x || p.x + ps <= x || y + size <= p.y || p.y + ps <= y);
    if (inter) return false;
  }
  return true;
}

function autoPlacePlayers(state) {
  const players = Array.isArray(state.players) ? state.players : [];
  for (const p of players) {
    if (!p) continue;
    if (p.x !== null && p.y !== null) continue;
    const size = Number(p.size) || 1;
    let placed = false;
    for (let y = 0; y <= state.boardHeight - size && !placed; y++) {
      for (let x = 0; x <= state.boardWidth - size && !placed; x++) {
        if (isAreaFree(state, p.id, x, y, size)) {
          p.x = x;
          p.y = y;
          placed = true;
        }
      }
    }
    if (!placed) {
      // fallback
      p.x = 0;
      p.y = 0;
    }
  }
}

function getDexMod(player) {
  // Ловкость хранится в листе персонажа (sheet.parsed.stats.dex)
  // Возможные поля: score / value / modifier / mod
  try {
    const dexObj = player?.sheet?.parsed?.stats?.dex;
    const modCandidate = Number(dexObj?.modifier ?? dexObj?.mod);
    if (Number.isFinite(modCandidate)) return modCandidate;

    const scoreCandidate = Number(dexObj?.score ?? dexObj?.value);
    if (!Number.isFinite(scoreCandidate)) return 0;
    return Math.floor((scoreCandidate - 10) / 2);
  } catch {
    return 0;
  }
}

function logEventToState(state, text) {
  if (!text) return;
  if (!Array.isArray(state.log)) state.log = [];
  state.log.push(String(text));
  if (state.log.length > 200) state.log.splice(0, state.log.length - 200);
}

async function ensureSupabaseReady() {
  if (!sbClient) {
    if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
      throw new Error("Supabase не настроен");
    }
    sbClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  }
  return sbClient;
}


// Small async delay helper (used for retrying optimistic writes)
function delayMs(ms) {
  return new Promise(res => setTimeout(res, Number(ms) || 0));
}

// Fetch latest room_state.state snapshot from DB (source of truth for low-frequency state)
async function fetchRoomStateSnapshot(roomId) {
  await ensureSupabaseReady();
  if (!roomId) return null;
  const { data, error } = await sbClient
    .from("room_state")
    .select("state,updated_at")
    .eq("room_id", roomId)
    .maybeSingle();
  if (error) throw error;
  return data?.state || null;
}

// Apply initiative updates for owned players with retry to avoid "last write wins" collisions.
// This is needed when multiple users roll initiative at the same time.
async function applyInitiativeAtomic(roomId, myUserId, updates) {
  if (!roomId || !myUserId) return;
  const updArr = Array.isArray(updates) ? updates : [];
  if (!updArr.length) return;

  for (let attempt = 0; attempt < 6; attempt++) {
    const latest = await fetchRoomStateSnapshot(roomId);
    if (!latest) return;

    const next = deepClone(latest);
    const pls = Array.isArray(next.players) ? next.players : [];
    for (const u of updArr) {
      const pid = String(u?.playerId || "");
      if (!pid) continue;
      const p = pls.find(pp => String(pp?.id) === pid);
      if (!p) continue;
      // Only allow owner to set their own initiative.
      if (String(p.ownerId) !== String(myUserId)) continue;

      // Do not overwrite if already rolled (e.g., due to a retry or GM action).
      if (!p.inCombat || p.hasRolledInitiative) continue;

      p.initiative = Number(u.total);
      p.hasRolledInitiative = true;
    }

    await upsertRoomState(roomId, next);

    // Verify (read-after-write) – if a concurrent writer overwrote us, retry quickly.
    try {
      const check = await fetchRoomStateSnapshot(roomId);
      const cpls = Array.isArray(check?.players) ? check.players : [];
      const ok = updArr.every(u => {
        const pid = String(u?.playerId || "");
        const cp = cpls.find(pp => String(pp?.id) === pid);
        return !!cp && cp.hasRolledInitiative && Number(cp.initiative) === Number(u.total);
      });
      if (ok) return;
    } catch {}
    await delayMs(35 + attempt * 25);
  }
}

async function upsertRoomState(roomId, nextState) {
  await ensureSupabaseReady();
  // v4 architecture: room_state is NOT the source of truth for token positions or logs.
  // Keeping those inside room_state causes race conditions ("last write wins").
  // We persist only the low-frequency game state here.
  const stSafe = deepClone(nextState || {});
  // Do not persist logs inside room_state; logs are append-only in room_log.
  stSafe.log = [];

  // Do not persist token positions inside room_state.
  // Positions are authoritative in public.room_tokens (realtime). If we keep x/y here,
  // any unrelated room_state upsert (walls/fog/etc.) can overwrite fresh positions
  // and cause visible "rollback" when multiple users act concurrently.
  try {
    const pls = Array.isArray(stSafe.players) ? stSafe.players : [];
    pls.forEach((p) => {
      if (!p || typeof p !== 'object') return;
      p.x = null;
      p.y = null;
    });
  } catch {}

  // Compress fog.explored when it becomes large to reduce DB payload / egress.
  // We keep exploredPacked in DB and decode it back to fog.explored on load.
  try {
    const f = stSafe?.fog;
    if (f && typeof f === 'object') {
      const arr = Array.isArray(f.explored) ? f.explored : [];
      const w = Number(stSafe.boardWidth) || 10;
      const h = Number(stSafe.boardHeight) || 10;
      // pack once it's non-trivial; threshold chosen to avoid overhead for small sets
      if (arr.length >= 80) {
        const packed = packFogExplored(arr, w, h);
        if (packed) {
          f.exploredPacked = packed;
          // keep DB small: drop the raw array
          f.explored = [];
        }
      }
    }
  } catch {}

  // Also clear legacy per-map mirrors if present.
  try {
    const maps = Array.isArray(stSafe.maps) ? stSafe.maps : [];
    maps.forEach((m) => {
      if (!m || typeof m !== 'object') return;
      if (m.playersPos && typeof m.playersPos === 'object') m.playersPos = {};
    });
  } catch {}
  const syncedState = syncActiveToMap(stSafe);
  const payload = {
    room_id: roomId,
    phase: String(stSafe?.phase || "lobby"),
    current_actor_id: stSafe?.turnOrder?.[stSafe?.currentTurnIndex] ?? null,
    state: syncedState,
    updated_at: new Date().toISOString()
  };
  const { error } = await sbClient.from("room_state").upsert(payload);
  if (error) throw error;
  try {
    sendWsEnvelope({ type: 'state', roomId, state: syncedState }, { optimisticApplied: true });
  } catch {}
}

// ===== Coalesced room_state writes (reduces egress & avoids DB hammering) =====
let __pendingRoomStateTimer = null;
let __pendingRoomState = null;
let __pendingRoomId = null;
let __pendingRoomStateDelay = 0;

function scheduleRoomStateUpsert(roomId, nextState, delayMs = 180) {
  try {
    __pendingRoomId = roomId;
    __pendingRoomState = deepClone(nextState);
    __pendingRoomStateDelay = Math.max(50, Number(delayMs) || 180);

    if (__pendingRoomStateTimer) return;
    __pendingRoomStateTimer = setTimeout(async () => {
      const rid = __pendingRoomId;
      const st = __pendingRoomState;
      __pendingRoomStateTimer = null;
      __pendingRoomId = null;
      __pendingRoomState = null;
      try {
        if (rid && st) await upsertRoomState(rid, st);
      } catch (e) {
        console.warn('coalesced upsert failed', e);
      }
    }, __pendingRoomStateDelay);
  } catch {}
}


// ===== Campaign saves (GM) =====
// Сохранения кампаний НЕ привязаны к комнате, а привязаны к "ключу владельца" (owner_key),
// который хранится в localStorage у ГМа. Тогда ГМ может зайти в любую комнату и загрузить кампанию.
async function listCampaignSavesByOwner(ownerKey) {
  await ensureSupabaseReady();
  const { data, error } = await sbClient
    .from('campaign_saves')
    .select('id,name,created_at')
    .eq('owner_key', ownerKey)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
}

async function createCampaignSave(ownerKey, name, state) {
  await ensureSupabaseReady();
  const { error } = await sbClient
    .from('campaign_saves')
    .insert({ owner_key: ownerKey, name, state });
  if (error) throw error;
}

async function getCampaignSaveState(saveId) {
  await ensureSupabaseReady();
  const { data, error } = await sbClient
    .from('campaign_saves')
    .select('state')
    .eq('id', saveId)
    .single();
  if (error) throw error;
  return data?.state || null;
}

async function deleteCampaignSave(saveId) {
  await ensureSupabaseReady();
  const { error } = await sbClient
    .from('campaign_saves')
    .delete()
    .eq('id', saveId);
  if (error) throw error;
}



// ================== OPTIONAL VPS WEBSOCKET RELAY ==================
// Supabase remains the source of truth for DB/storage.
// This WS layer is used as a low-latency relay via the user's VPS.
const WS_URL = "ws://5.42.106.75:8080";
const WS_CLIENT_ID = (() => {
  try {
    const key = 'dnd_ws_client_id';
    let id = String(localStorage.getItem(key) || '').trim();
    if (!id) {
      id = (crypto?.randomUUID ? crypto.randomUUID() : ('ws-' + Math.random().toString(16).slice(2) + '-' + Date.now()));
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return (crypto?.randomUUID ? crypto.randomUUID() : ('ws-' + Math.random().toString(16).slice(2) + '-' + Date.now()));
  }
})();

let wsClient = null;
let wsRoomId = '';
let wsReconnectTimer = null;
let wsWantConnected = false;
const wsSeenNonces = new Map();

function wsMakeNonce() {
  return (crypto?.randomUUID ? crypto.randomUUID() : ('n-' + Math.random().toString(16).slice(2) + '-' + Date.now()));
}

function wsRememberNonce(nonce) {
  const key = String(nonce || '').trim();
  if (!key) return;
  wsSeenNonces.set(key, Date.now());
  if (wsSeenNonces.size > 500) {
    const now = Date.now();
    for (const [k, ts] of wsSeenNonces.entries()) {
      if (now - Number(ts || 0) > 30000) wsSeenNonces.delete(k);
    }
    while (wsSeenNonces.size > 500) {
      const first = wsSeenNonces.keys().next();
      if (first.done) break;
      wsSeenNonces.delete(first.value);
    }
  }
}

function wsWasSeen(nonce) {
  const key = String(nonce || '').trim();
  if (!key) return false;
  const ts = Number(wsSeenNonces.get(key) || 0);
  if (!ts) return false;
  if (Date.now() - ts > 30000) {
    wsSeenNonces.delete(key);
    return false;
  }
  return true;
}

function disconnectRoomWs() {
  wsWantConnected = false;
  wsRoomId = '';
  try { clearTimeout(wsReconnectTimer); } catch {}
  wsReconnectTimer = null;
  if (wsClient) {
    try { wsClient.close(); } catch {}
    wsClient = null;
  }
}

function connectRoomWs(roomId) {
  const rid = String(roomId || '').trim();
  if (!rid || typeof WebSocket === 'undefined') return;

  wsWantConnected = true;
  wsRoomId = rid;

  if (wsClient) {
    const state = Number(wsClient.readyState);
    if ((state === WebSocket.OPEN || state === WebSocket.CONNECTING) && wsClient.__roomId === rid) {
      return;
    }
    try { wsClient.close(); } catch {}
    wsClient = null;
  }

  try { clearTimeout(wsReconnectTimer); } catch {}
  wsReconnectTimer = null;

  const sock = new WebSocket(WS_URL);
  sock.__roomId = rid;
  wsClient = sock;

  sock.onopen = () => {
    try {
      sock.send(JSON.stringify({
        type: 'joinRoom',
        roomId: rid,
        clientId: WS_CLIENT_ID,
        transport: 'ws'
      }));
    } catch {}
  };

  sock.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (!msg || typeof msg !== 'object') return;
      const nonce = String(msg.__wsNonce || '').trim();
      if (nonce && wsWasSeen(nonce)) return;
      if (nonce) wsRememberNonce(nonce);

      const from = String(msg.__fromWsClient || '').trim();
      if (from && from === WS_CLIENT_ID && msg.__optimisticApplied) return;

      const msgRoomId = String(msg.roomId || '').trim();
      if (msgRoomId && wsRoomId && msgRoomId !== wsRoomId) return;

      if (msg.type === 'ping' || msg.type === 'pong' || msg.type === 'joinedWsRoom') return;
      handleMessage(msg);
    } catch (e) {
      console.warn('[WS] bad message', e);
    }
  };

  sock.onclose = () => {
    if (wsClient === sock) wsClient = null;
    if (!wsWantConnected || !wsRoomId) return;
    try { clearTimeout(wsReconnectTimer); } catch {}
    wsReconnectTimer = setTimeout(() => {
      if (wsWantConnected && wsRoomId) connectRoomWs(wsRoomId);
    }, 2000);
  };

  sock.onerror = (e) => {
    console.warn('[WS] error', e);
  };
}

function sendWsEnvelope(msg, opts = {}) {
  try {
    if (!msg || typeof msg !== 'object') return false;
    if (!wsRoomId || !wsClient || wsClient.readyState !== WebSocket.OPEN) return false;
    const nonce = String(opts.nonce || wsMakeNonce());
    const payload = {
      ...msg,
      roomId: String(msg.roomId || wsRoomId),
      __wsNonce: nonce,
      __fromWsClient: WS_CLIENT_ID,
      __optimisticApplied: !!opts.optimisticApplied
    };
    wsRememberNonce(nonce);
    wsClient.send(JSON.stringify(payload));
    return true;
  } catch (e) {
    console.warn('[WS] send failed', e);
    return false;
  }
}

async function subscribeRoomDb(roomId) {
  await ensureSupabaseReady();
  if (roomDbChannel) {
    try { await roomDbChannel.unsubscribe(); } catch {}
    roomDbChannel = null;
  }
  roomDbChannel = sbClient
    .channel(`db-room_state-${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "room_state", filter: `room_id=eq.${roomId}` },
      (payload) => {
        const row = payload.new;
        if (row && row.state) {
          handleMessage({ type: "state", state: row.state });
        }
      }
    );
  await roomDbChannel.subscribe();

  // Optional: broadcast channel (dice events)
  if (roomChannel) {
    try { await roomChannel.unsubscribe(); } catch {}
    roomChannel = null;
  }
  roomChannel = sbClient
    .channel(`room:${roomId}`)
    .on("broadcast", { event: "diceEvent" }, ({ payload }) => {
      if (payload && payload.event) handleMessage({ type: "diceEvent", event: payload.event });
    });
  await roomChannel.subscribe();
}

// ================== v4: TOKENS / LOG / DICE (dedicated tables) ==================
async function subscribeRoomTokensDb(roomId) {
  await ensureSupabaseReady();
  if (window.roomTokensDbChannel) {
    try { await window.roomTokensDbChannel.unsubscribe(); } catch {}
    window.roomTokensDbChannel = null;
  }
  window.roomTokensDbChannel = sbClient
    .channel(`db-room_tokens-${roomId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'room_tokens', filter: `room_id=eq.${roomId}` },
      (payload) => {
        const row = payload.new;
        if (row) handleMessage({ type: 'tokenRow', row });
      }
    );
  await window.roomTokensDbChannel.subscribe();
}

async function loadRoomTokens(roomId, mapId) {
  await ensureSupabaseReady();
  if (!roomId) return [];
  let q = sbClient.from('room_tokens').select('*').eq('room_id', roomId);
  if (mapId) q = q.eq('map_id', mapId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function subscribeRoomLogDb(roomId) {
  await ensureSupabaseReady();
  if (window.roomLogDbChannel) {
    try { await window.roomLogDbChannel.unsubscribe(); } catch {}
    window.roomLogDbChannel = null;
  }
  window.roomLogDbChannel = sbClient
    .channel(`db-room_log-${roomId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'room_log', filter: `room_id=eq.${roomId}` },
      (payload) => {
        const row = payload.new;
        if (row) handleMessage({ type: 'logRow', row });
      }
    );
  await window.roomLogDbChannel.subscribe();
}

async function loadRoomLog(roomId, limit = 200) {
  await ensureSupabaseReady();
  if (!roomId) return [];
  const { data, error } = await sbClient
    .from('room_log')
    .select('id,text,created_at')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })
    .limit(Math.max(1, Math.min(500, Number(limit) || 200)));
  if (error) throw error;
  return data || [];
}

async function subscribeRoomDiceDb(roomId) {
  await ensureSupabaseReady();
  if (window.roomDiceDbChannel) {
    try { await window.roomDiceDbChannel.unsubscribe(); } catch {}
    window.roomDiceDbChannel = null;
  }
  window.roomDiceDbChannel = sbClient
    .channel(`db-room_dice-${roomId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'room_dice_events', filter: `room_id=eq.${roomId}` },
      (payload) => {
        const row = payload.new;
        if (row) handleMessage({ type: 'diceRow', row });
      }
    );
  await window.roomDiceDbChannel.subscribe();
}

async function loadRoomDice(roomId, limit = 50) {
  await ensureSupabaseReady();
  if (!roomId) return [];
  const { data, error } = await sbClient
    .from('room_dice_events')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(200, Number(limit) || 50)));
  if (error) throw error;
  return data || [];
}

function applyTokenRowToLocalState(row) {
  try {
    if (!row) return;
    const tokenId = String(row.token_id || '').trim();
    if (!tokenId) return;
    const x = (row.x === null || typeof row.x === 'undefined') ? null : Number(row.x);
    const y = (row.y === null || typeof row.y === 'undefined') ? null : Number(row.y);
    const size = (row.size === null || typeof row.size === 'undefined') ? null : Number(row.size);
    const color = (typeof row.color === 'string') ? row.color : null;
    const mapId = String(row.map_id || '').trim();
    const hasPublic = (typeof row.is_public !== 'undefined');
    const isPublic = hasPublic ? !!row.is_public : null;

    // Apply into lastState.players for current UI rendering.
    if (typeof lastState !== 'undefined' && lastState && Array.isArray(lastState.players)) {
      const p = lastState.players.find(pp => String(pp?.id) === tokenId);
      if (p) {
        if (x === null || Number.isFinite(x)) p.x = x;
        if (y === null || Number.isFinite(y)) p.y = y;
        if (Number.isFinite(size) && size > 0) p.size = size;
        if (color) p.color = color;
        // map-local safety
        if (mapId) p.mapId = mapId;

        // v4+: visibility "eye" can be mirrored into room_tokens for reliable realtime updates
        if (isPublic !== null) p.isPublic = isPublic;

        // Apply to DOM immediately (position/color/visibility rules)
        try { setPlayerPosition?.(p); } catch {}
        try {
          const el = (typeof playerElements !== 'undefined') ? playerElements.get(String(p.id)) : null;
          if (el) updateHpBar?.(p, el);
        } catch {}

        // Fog of war: token rows arrive via realtime; recompute dynamic visibility and refresh discoverable tokens.
        try {
          window.FogWar?.onTokenPositionsChanged?.(lastState);
          (lastState?.players || []).forEach(pp => { try { setPlayerPosition?.(pp); } catch {} });
        } catch {}
      }
    }
  } catch {}
}

async function upsertTokenVisibility(roomId, tokenId, isPublic) {
  try {
    await ensureSupabaseReady();
    if (!roomId || !tokenId) return;
    const pub = !!isPublic;

    // Try update all rows of this token in this room (across maps).
    const { data: upd, error: uErr } = await sbClient
      .from('room_tokens')
      .update({ is_public: pub })
      .eq('room_id', roomId)
      .eq('token_id', tokenId)
      .select('room_id')
      .limit(1);
    if (!uErr && Array.isArray(upd) && upd.length) return;

    // If there is no row yet (token not placed), create a stub on current map.
    const mapId = String(lastState?.currentMapId || '') || null;
    const p = (lastState?.players || []).find(pp => String(pp?.id) === String(tokenId));
    const payload = {
      room_id: roomId,
      map_id: String(p?.mapId || mapId || '') || null,
      token_id: tokenId,
      x: (p?.x === null || typeof p?.x === 'undefined') ? null : Number(p.x),
      y: (p?.y === null || typeof p?.y === 'undefined') ? null : Number(p.y),
      size: Number(p?.size) || 1,
      color: (typeof p?.color === 'string') ? p.color : null,
      is_public: pub
    };
    await sbClient.from('room_tokens').upsert(payload);
  } catch (e) {
    console.warn('upsertTokenVisibility failed', e);
  }
}

async function insertRoomLog(roomId, text) {
  try {
    await ensureSupabaseReady();
    const t = String(text || '').trim();
    if (!roomId || !t) return;
    await sbClient.from('room_log').insert({ room_id: roomId, text: t });
  } catch (e) {
    console.warn('room_log insert failed', e);
  }
}

async function insertDiceEvent(roomId, ev) {
  try {
    await ensureSupabaseReady();
    if (!roomId || !ev) return;
    // Prefer RPC (transaction: dice + log)
    const args = {
      p_room_id: roomId,
      p_from_id: String(ev.fromId || ''),
      p_from_name: String(ev.fromName || ''),
      p_kind_text: String(ev.kindText || ''),
      p_sides: Number(ev.sides) || null,
      p_count: Number(ev.count) || null,
      p_bonus: Number(ev.bonus) || 0,
      p_rolls: Array.isArray(ev.rolls) ? ev.rolls.map(n => Number(n) || 0) : [],
      p_total: Number(ev.total) || null,
      p_crit: String(ev.crit || '')
    };
    try {
      const { error } = await sbClient.rpc('add_dice_event', args);
      if (!error) return;
    } catch {}
    // fallback (no RPC): insert dice row + a matching log line
    await sbClient.from('room_dice_events').insert({
      room_id: roomId,
      from_id: args.p_from_id,
      from_name: args.p_from_name,
      kind_text: args.p_kind_text,
      sides: args.p_sides,
      count: args.p_count,
      bonus: args.p_bonus,
      rolls: args.p_rolls,
      total: args.p_total,
      crit: args.p_crit
    });

    // log line (roughly same as RPC)
    try {
      const who = (args.p_from_name || '').trim() || 'Игрок';
      const kind = (args.p_kind_text || '').trim() || (args.p_sides ? `d${args.p_sides}` : 'Бросок');
      const rollsTxt = (Array.isArray(args.p_rolls) && args.p_rolls.length) ? args.p_rolls.join(',') : '';
      const bonusTxt = (Number(args.p_bonus) === 0) ? '' : (Number(args.p_bonus) > 0 ? `+${Number(args.p_bonus)}` : String(Number(args.p_bonus)));
      const totalTxt = (args.p_total === null || args.p_total === undefined) ? '' : ` = ${args.p_total}`;
      const critTxt = (args.p_crit === 'crit-success') ? ' (КРИТ)' : (args.p_crit === 'crit-fail') ? ' (ПРОВАЛ)' : '';
      const body = rollsTxt ? `${rollsTxt}${bonusTxt}${totalTxt}` : String(args.p_total ?? '');
      const line = `${who}: ${kind}: ${body}${critTxt}`.trim();
      if (line) await insertRoomLog(roomId, line);
    } catch {}
  } catch (e) {
    console.warn('dice insert failed', e);
  }
}


let roomMembersDbChannel = null;

async function refreshRoomMembers(roomId) {
  await ensureSupabaseReady();
  if (!roomId) return;

  const { data, error } = await sbClient
    .from("room_members")
    .select("user_id,name,role")
    .eq("room_id", roomId);

  if (error) {
    console.error("room_members load error", error);
    return;
  }

  usersById.clear();
  (data || []).forEach((m) => {
    const uid = String(m.user_id || "");
    if (!uid) return;
    usersById.set(uid, {
      name: m.name || "Unknown",
      role: normalizeRoleForUi(m.role)
    });
  });

  updatePlayerList();
}

async function subscribeRoomMembersDb(roomId) {
  await ensureSupabaseReady();
  if (roomMembersDbChannel) {
    try { await roomMembersDbChannel.unsubscribe(); } catch {}
    roomMembersDbChannel = null;
  }
  roomMembersDbChannel = sbClient
    .channel(`db-room_members-${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "room_members", filter: `room_id=eq.${roomId}` },
      (payload) => {
        try {
          const ev = String(payload?.eventType || payload?.event_type || '').toUpperCase();
          const rowNew = payload?.new;
          const rowOld = payload?.old;

          if (ev === 'DELETE') {
            const uid = String(rowOld?.user_id || '');
            if (uid) usersById.delete(uid);
          } else {
            const uid = String(rowNew?.user_id || '');
            if (uid) {
              usersById.set(uid, {
                name: rowNew?.name || 'Unknown',
                role: normalizeRoleForUi(rowNew?.role)
              });
            }
          }
          updatePlayerList();
        } catch {
          // Fallback to full refresh if realtime payload shape changes
          refreshRoomMembers(roomId);
        }
      }
    );

  await roomMembersDbChannel.subscribe();
}

async function sendMessage(msg) {
  try {
    await ensureSupabaseReady();
    if (!msg || typeof msg !== "object") return;

    const type = String(msg.type || "");

    switch (type) {
      // ===== Rooms =====
      case "listRooms": {
        const { data, error } = await sbClient
          .from("rooms")
          .select("id,name,scenario,created_at")
          .order("created_at", { ascending: false });
        if (error) throw error;

        // Unique users per room + total unique users on server (across all rooms)
        let members = [];
        try {
          const { data: m, error: me } = await sbClient
            .from("room_members")
            .select("room_id,user_id");
          if (!me) members = m || [];
        } catch {}

        const perRoom = new Map(); // roomId -> Set(userId)
        const allUsers = new Set();
        for (const row of (members || [])) {
          const rid = String(row?.room_id || '');
          const uid = String(row?.user_id || '');
          if (!rid || !uid) continue;
          allUsers.add(uid);
          if (!perRoom.has(rid)) perRoom.set(rid, new Set());
          perRoom.get(rid).add(uid);
        }

        const rooms = (data || []).map(r => {
          const rid = String(r.id);
          const s = perRoom.get(rid);
          return {
            ...r,
            uniqueUsers: s ? s.size : 0,
            hasPassword: false
          };
        });

        handleMessage({ type: "rooms", rooms, totalUsers: allUsers.size });
        break;
      }

      case "createRoom": {
        const roomId = (crypto?.randomUUID ? crypto.randomUUID() : ("r-" + Math.random().toString(16).slice(2)));
        const name = String(msg.name || "Комната").trim() || "Комната";
        const scenario = String(msg.scenario || "");
        const { error: e1 } = await sbClient.from("rooms").insert({ id: roomId, name, scenario });
        if (e1) throw e1;

        const initState = createInitialGameState();
        const { error: e2 } = await sbClient.from("room_state").insert({
          room_id: roomId,
          phase: initState.phase,
          current_actor_id: null,
          state: initState
        });
        if (e2) throw e2;

        // refresh list
        await sendMessage({ type: "listRooms" });
        break;
      }

      case "joinRoom": {
        const roomId = String(msg.roomId || "");
        if (!roomId) return;

        const { data: room, error: er } = await sbClient.from("rooms").select("*").eq("id", roomId).single();
        if (er) throw er;

        // ===== Enforce roles: register membership + prevent multiple GMs =====
        const userId = String(localStorage.getItem("dnd_user_id") || myId || "");
        const role = String(localStorage.getItem("dnd_user_role") || myRole || "");

        // ✅ Мягкая проверка до upsert (чтобы сразу показать текстовое предупреждение)
        if (role === "GM" && userId) {
          const { data: existingGm, error: gmErr } = await sbClient
            .from("room_members")
            .select("user_id")
            .eq("room_id", roomId)
            .eq("role", "GM")
            .limit(1);
          if (!gmErr && Array.isArray(existingGm) && existingGm.length) {
            const gmId = String(existingGm[0]?.user_id || "");
            if (gmId && gmId !== userId) {
              handleMessage({
                type: "roomsError",
                message: "В этой комнате уже присутствует GM. Вы не можете зайти как GM."
              });
              return;
            }
          }
        }
        if (userId && role) {
          const { error: mErr } = await sbClient.from("room_members").upsert({
            room_id: roomId,
            user_id: userId,
            name: safeGetUserName(),
            role: normalizeRoleForDb(role),
            last_seen: new Date().toISOString()
          });
          if (mErr) {
            // Unique violation (second GM) => Postgres code 23505
            if (role === "GM" && (mErr.code === "23505" || String(mErr.message || "").includes("uq_one_gm_per_room"))) {
              handleMessage({ type: "roomsError", message: "GM уже в комнате" });
              return;
            }
            throw mErr;
          }
        }

        currentRoomId = roomId;
        connectRoomWs(roomId);
        handleMessage({ type: "joinedRoom", room });


        startHeartbeat();
        // ensure room_state exists
        let { data: rs, error: ers } = await sbClient.from("room_state").select("*").eq("room_id", roomId).maybeSingle();
        if (ers) throw ers;
        if (!rs) {
          const initState = createInitialGameState();
          await sbClient.from("room_state").insert({ room_id: roomId, phase: initState.phase, current_actor_id: null, state: initState });
          rs = { state: initState };
        }

        await subscribeRoomDb(roomId);
        // v4: dedicated realtime tables
        try { await subscribeRoomTokensDb(roomId); } catch (e) { console.warn('tokens subscribe failed', e); }
        try { await subscribeRoomLogDb(roomId); } catch (e) { console.warn('log subscribe failed', e); }
        try { await subscribeRoomDiceDb(roomId); } catch (e) { console.warn('dice subscribe failed', e); }
        await refreshRoomMembers(roomId);
        await subscribeRoomMembersDb(roomId);
        handleMessage({ type: "state", state: rs.state });

        // v4 init: load logs + tokens snapshot after state is applied
        try {
          const logRows = await loadRoomLog(roomId, 200);
          handleMessage({ type: 'logInit', rows: logRows });
        } catch (e) { console.warn('log init failed', e); }
        try {
          const mapId = String(rs?.state?.currentMapId || '');
          const tokenRows = await loadRoomTokens(roomId, mapId);
          handleMessage({ type: 'tokensInit', rows: tokenRows, mapId });
        } catch (e) { console.warn('tokens init failed', e); }

        try {
          const diceRows = await loadRoomDice(roomId, 50);
          handleMessage({ type: 'diceInit', rows: diceRows });
        } catch (e) { console.warn('dice init failed', e); }
        break;
      }

      // ===== Dice live events =====
      case "diceEvent": {
        if (!currentRoomId) return;
        // v4: dice events are append-only in room_dice_events (and log is append-only in room_log)
        const ev = msg.event || {};
        await insertDiceEvent(currentRoomId, ev);
        try {
          sendWsEnvelope({ type: 'diceEvent', roomId: currentRoomId, event: ev }, { optimisticApplied: true });
        } catch {}
        // apply to self instantly (others will receive via realtime INSERT)
        if (msg.event) handleMessage({ type: 'diceEvent', event: msg.event });
        break;
      }

      // ===== v4: append-only log entry =====
      case 'log': {
        if (!currentRoomId) return;
        const logRow = { text: String(msg.text || ''), created_at: new Date().toISOString() };
        await insertRoomLog(currentRoomId, msg.text);
        try {
          sendWsEnvelope({ type: 'logRow', roomId: currentRoomId, row: logRow }, { optimisticApplied: !msg.noOptimistic });
        } catch {}
        // Optimistic local append (realtime INSERT will also arrive if enabled).
        // Если msg.noOptimistic = true — НЕ добавляем локально, чтобы не было дублей.
        if (!msg.noOptimistic) {
          try {
            handleMessage({
              type: 'logRow',
              row: logRow
            });
          } catch {}
        }
        break;
      }

      // NOTE: do not add new switch cases below without care.
      // Some game mechanics (initiative/combat join) need to broadcast dice rolls
      // without writing to room_state (to avoid overwriting fresh state with lastState).

      // ===== Saved bases (characters) =====
      case "listSavedBases": {
        const userId = String(localStorage.getItem("dnd_user_id") || "");
        const { data, error } = await sbClient
          .from("characters")
          .select("id,name,updated_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false });
        if (error) throw error;
        handleMessage({ type: "savedBasesList", list: (data || []).map(x => ({ id: x.id, name: x.name, updatedAt: x.updated_at })) });
        break;
      }

      case "saveSavedBase": {
        const userId = String(localStorage.getItem("dnd_user_id") || "");
        const sheet = msg.sheet;
        const name = String(sheet?.parsed?.name?.value ?? sheet?.parsed?.name ?? sheet?.parsed?.profile?.name ?? "Персонаж").trim() || "Персонаж";
        const { data, error } = await sbClient
          .from("characters")
          .insert({
            user_id: userId,
            name,
            state: { schemaVersion: 1, savedAt: new Date().toISOString(), data: sheet },
            updated_at: new Date().toISOString()
          })
          .select("id");
        if (error) throw error;
        handleMessage({ type: "savedBaseSaved", id: data?.[0]?.id, name });
        break;
      }

      case "deleteSavedBase": {
        const userId = String(localStorage.getItem("dnd_user_id") || "");
        const savedId = String(msg.savedId || "");
        if (!savedId) return;
        const { error } = await sbClient.from("characters").delete().eq("id", savedId).eq("user_id", userId);
        if (error) throw error;
        handleMessage({ type: "savedBaseDeleted", savedId });
        break;
      }

      case "applySavedBase": {
        const userId = String(localStorage.getItem("dnd_user_id") || "");
        const savedId = String(msg.savedId || "");
        if (!currentRoomId || !lastState) return;
        const { data, error } = await sbClient.from("characters").select("state").eq("id", savedId).eq("user_id", userId).single();
        if (error) throw error;
        const savedSheet = data?.state?.data;
        if (!savedSheet) throw new Error("Пустой файл персонажа");

        const next = deepClone(lastState);
        const p = (next.players || []).find(pl => pl.id === msg.playerId);
        if (!p || !p.isBase) {
          handleMessage({ type: "error", message: "Загружать можно только в персонажа 'Основа'." });
          return;
        }
        p.sheet = deepClone(savedSheet);
        try {
          const parsed = p.sheet?.parsed;
          const nextName = parsed?.name?.value ?? parsed?.name;
          if (typeof nextName === "string" && nextName.trim()) p.name = nextName.trim();
        } catch {}

        // High-frequency operations (fog painting / exploration) are coalesced to reduce
        // DB writes and realtime egress. We still update local UI immediately.
        const coalescedTypes = new Set([
          'fogStamp',
          'fogStamp2',
          'fogStampBatch',
          'fogFill',
          'fogClearExplored',
          'fogSetExplored',
          'fogAddExplored'
        ]);

        if (coalescedTypes.has(String(type))) {
          try { handleMessage({ type: 'state', state: syncActiveToMap(deepClone(next)) }); } catch {}
          const d = (String(type) === 'fogStamp' || String(type) === 'fogStamp2' || String(type) === 'fogStampBatch') ? 140 : 320;
          scheduleRoomStateUpsert(currentRoomId, next, d);
        } else {
          await upsertRoomState(currentRoomId, next);
        }
        handleMessage({ type: "savedBaseApplied", playerId: p.id, savedId });
        break;
      }

      case "setPlayerSheet": {
  if (!currentRoomId) return;
  if (!lastState) return;

  const next = deepClone(lastState);
  const isGm = (String(myRole || "") === "GM");
  const myUserId = String(localStorage.getItem("dnd_user_id") || "");

  const p = (next.players || []).find(pl => String(pl.id) === String(msg.id));
  if (!p) return;

  const owns = (pl) => pl && String(pl.ownerId) === myUserId;
  if (!isGm && !owns(p)) return;

  p.sheet = deepClone(msg.sheet);
  try {
    const ts = Number(msg.sheetUpdatedAt) || Date.now();
    p.sheetUpdatedAt = ts;
  } catch {}

  // синхронизируем имя персонажа из sheet (если есть)
  try {
    const parsed = p.sheet?.parsed;
    const nextName = parsed?.name?.value ?? parsed?.name;
    if (typeof nextName === "string" && nextName.trim()) p.name = nextName.trim();
  } catch {}

  await upsertRoomState(currentRoomId, next);
  break;
}

// ===== Game logic (DB truth via room_state.state) =====
      default: {
        if (!currentRoomId) return;
        if (!lastState) return;

        const next = deepClone(lastState);
        const isGM = (String(myRole || "") === "GM");
        const myUserId = String(localStorage.getItem("dnd_user_id") || "");

        const ownsPlayer = (pl) => pl && String(pl.ownerId) === myUserId;

        const type = msg.type;
        let handled = false;

        // ===== Campaign maps + sections (GM) =====
        if (type === "createMapSection") {
          if (!isGM) return;
          handled = true;
          const name = String(msg.name || "").trim();
          if (!name) return;
          if (!Array.isArray(next.mapSections)) next.mapSections = [];
          const id = (crypto?.randomUUID ? crypto.randomUUID() : ("sec-" + Math.random().toString(16).slice(2)));
          next.mapSections.push({ id, name });
          logEventToState(next, `Создан раздел: ${name}`);
        }

        else if (type === "renameMapSection") {
          if (!isGM) return;
          handled = true;
          const sectionId = String(msg.sectionId || "").trim();
          const name = String(msg.name || "").trim();
          if (!sectionId || !name) return;
          const sec = (next.mapSections || []).find(s => String(s?.id) === sectionId);
          if (!sec) return;
          const old = sec.name;
          sec.name = name;
          logEventToState(next, `Переименован раздел: ${old} → ${name}`);
        }

        else if (type === "deleteMapSection") {
          if (!isGM) return;
          handled = true;
          const sectionId = String(msg.sectionId || "").trim();
          if (!sectionId) return;
          const mode = String(msg.mode || "").toLowerCase(); // 'move' | 'delete'
          const targetSectionId = String(msg.targetSectionId || "").trim();

          if (!Array.isArray(next.mapSections)) next.mapSections = [];
          if (next.mapSections.length <= 1) {
            handleMessage({ type: "error", message: "Нельзя удалить последний раздел." });
            return;
          }

          const sec = next.mapSections.find(s => String(s?.id) === sectionId);
          if (!sec) return;
          const secName = String(sec.name || "Раздел");

          if (mode === "move") {
            if (!targetSectionId || targetSectionId === sectionId) return;
            (next.maps || []).forEach(m => {
              if (m && String(m.sectionId) === sectionId) m.sectionId = targetSectionId;
            });
            logEventToState(next, `Раздел удалён (карты перенесены): ${secName}`);
          } else {
            // delete maps in section
            const toDelete = new Set((next.maps || []).filter(m => m && String(m.sectionId) === sectionId).map(m => String(m.id)));
            next.maps = (next.maps || []).filter(m => m && !toDelete.has(String(m.id)));
            logEventToState(next, `Раздел удалён (карты удалены): ${secName}`);
          }

          next.mapSections = next.mapSections.filter(s => String(s?.id) !== sectionId);

          // if active map was deleted by section delete, ensure current map exists
          if (!next.maps || !next.maps.length) {
            const reset = createInitialGameState();
            next.mapSections = reset.mapSections;
            next.maps = reset.maps;
            next.currentMapId = reset.currentMapId;
            loadMapToRoot(next, next.currentMapId);
          } else {
            const activeExists = (next.maps || []).some(m => String(m?.id) === String(next.currentMapId));
            if (!activeExists) {
              const fallback = next.maps[0];
              syncActiveToMap(next);
              loadMapToRoot(next, String(fallback.id));
            }
          }
        }

        else if (type === "renameCampaignMap") {
          if (!isGM) return;
          handled = true;
          const mapId = String(msg.mapId || "").trim();
          const name = String(msg.name || "").trim();
          if (!mapId || !name) return;
          const m = (next.maps || []).find(mm => String(mm?.id) === mapId);
          if (!m) return;
          const old = m.name;
          m.name = name;
          logEventToState(next, `Переименована карта: ${old || "Карта"} → ${name}`);
        }

        else if (type === "moveCampaignMap") {
          if (!isGM) return;
          handled = true;
          const mapId = String(msg.mapId || "").trim();
          const toSectionId = String(msg.toSectionId || "").trim();
          if (!mapId || !toSectionId) return;
          const m = (next.maps || []).find(mm => String(mm?.id) === mapId);
          if (!m) return;
          const exists = (next.mapSections || []).some(s => String(s?.id) === toSectionId);
          if (!exists) return;
          const from = String(m.sectionId || "");
          if (from === toSectionId) return;
          m.sectionId = toSectionId;
          logEventToState(next, `Карта перенесена: ${m.name || "Карта"}`);
        }

        else if (type === "deleteCampaignMap") {
          if (!isGM) return;
          handled = true;
          const mapId = String(msg.mapId || "").trim();
          if (!mapId) return;

          // перед удалением — сохранить активную карту в snapshot
          syncActiveToMap(next);

          const m = (next.maps || []).find(mm => String(mm?.id) === mapId);
          const name = m?.name || "Карта";
          next.maps = (next.maps || []).filter(mm => String(mm?.id) !== mapId);
          logEventToState(next, `Удалена карта: ${name}`);

          if (!next.maps.length) {
            const reset = createInitialGameState();
            next.mapSections = reset.mapSections;
            next.maps = reset.maps;
            next.currentMapId = reset.currentMapId;
            loadMapToRoot(next, next.currentMapId);
          } else {
            const activeExists = (next.maps || []).some(mm => String(mm?.id) === String(next.currentMapId));
            if (!activeExists) {
              loadMapToRoot(next, String(next.maps[0].id));
            }
          }
        }

        else if (type === "createCampaignMap") {
          if (!isGM) return;
          handled = true;

          // сохранить текущую карту в snapshot
          syncActiveToMap(next);

          const newId = (crypto?.randomUUID ? crypto.randomUUID() : ("map-" + Math.random().toString(16).slice(2)));
          const n = Array.isArray(next.maps) ? next.maps.length + 1 : 1;
          const sectionId = String(msg.sectionId || "").trim() || String(next.mapSections?.[0]?.id || "");
          const safeSection = (next.mapSections || []).some(s => String(s?.id) === sectionId) ? sectionId : String(next.mapSections?.[0]?.id || "");
          const name = String(msg.name || "").trim() || `Карта ${n}`;

          if (!Array.isArray(next.maps)) next.maps = [];
          next.maps.push({
            id: newId,
            name,
            sectionId: safeSection,
            boardWidth: 10,
            boardHeight: 10,
            boardBgDataUrl: null,
            boardBgUrl: null,
            boardBgStoragePath: null,
            boardBgStorageBucket: null,
            gridAlpha: 1,
            wallAlpha: 1,
            walls: [],
            playersPos: {}
          });

          loadMapToRoot(next, newId);
          logEventToState(next, `Создана новая карта: ${name}`);
        }

        else if (type === "switchCampaignMap") {
          if (!isGM) return;
          handled = true;
          const targetId = String(msg.mapId || "");
          if (!targetId) return;

          syncActiveToMap(next);
          loadMapToRoot(next, targetId);

          const m = getActiveMap(next);
          logEventToState(next, `Переключение карты: ${m?.name || "Карта"}`);
        }


        if (handled) {
          await upsertRoomState(currentRoomId, next);
          break;
        }

        if (type === "resizeBoard") {
          if (!isGM) return;
          next.boardWidth = msg.width;
          next.boardHeight = msg.height;
          logEventToState(next, "Поле изменено");
        }

        else if (type === "startInitiative") {
          if (!isGM) return;
          next.phase = "initiative";
          next.turnOrder = [];
          next.currentTurnIndex = 0;
          next.round = 1;
          // Initiative is now per-combatant, not "everyone in the room".
          // Default selection: those already placed on the board.
          (next.players || []).forEach(p => {
            const placed = (p && p.x !== null && p.y !== null);
            p.inCombat = !!placed;
            if (p.inCombat) {
              p.initiative = null;
              p.hasRolledInitiative = false;
            }
          });
          logEventToState(next, "GM начал фазу инициативы (выбор участников)");
        }

        else if (type === 'setPlayerInCombat') {
          // GM selects who participates in the fight (initiative + turn order scope)
          if (!isGM) return;
          const pid = String(msg.id || '');
          if (!pid) return;
          const p = (next.players || []).find(pp => String(pp?.id) === pid);
          if (!p) return;
          const inCombat = !!msg.inCombat;
          p.inCombat = inCombat;

          // If combat is already running and a new combatant is added, queue for next round.
          if (next.phase === 'combat' && inCombat) {
            if (!p.hasRolledInitiative) p.pendingInitiativeChoice = true;
            p.willJoinNextRound = true;
          }

          logEventToState(next, `${p.name} ${inCombat ? 'вступает' : 'выходит'} из боя`);
        }

        else if (type === 'setPlayersInCombatBulk') {
          // Bulk toggle to avoid race conditions (one room_state write instead of many)
          if (!isGM) return;
          const items = Array.isArray(msg.items) ? msg.items : [];
          if (!items.length) return;

          let changed = 0;
          for (const it of items) {
            const pid = String(it?.id || '');
            if (!pid) continue;
            const p = (next.players || []).find(pp => String(pp?.id) === pid);
            if (!p) continue;
            const inCombat = !!it.inCombat;
            if (!!p.inCombat === inCombat) continue;
            p.inCombat = inCombat;

            // If combat is already running and a new combatant is added, queue for next round.
            if (next.phase === 'combat' && inCombat) {
              if (!p.hasRolledInitiative) p.pendingInitiativeChoice = true;
              p.willJoinNextRound = true;
            }
            changed++;
          }

          if (changed) {
            logEventToState(next, `GM изменил участников боя: ${changed}`);
          }
        }

        else if (type === "startExploration") {
          if (!isGM) return;
          next.phase = "exploration";
          // В исследовании очередь хода не нужна
          next.turnOrder = [];
          next.currentTurnIndex = 0;
          next.round = 1;
          logEventToState(next, "GM начал фазу исследования");
        }

        else if (type === "updatePlayerColor") {
          const p = (next.players || []).find(pp => String(pp.id) === String(msg.id));
          if (!p) return;
          if (!isGM && !ownsPlayer(p)) return;
          const c = String(msg.color || '').trim();
          if (!/^#[0-9a-fA-F]{6}$/.test(c)) return;
          p.color = c;
          logEventToState(next, `${p.name} изменил цвет`);

          // v4+: Token visuals are mirrored via room_tokens rows (realtime).
          // If we don't persist color there, incoming token rows will overwrite
          // p.color and the board will appear to "ignore" the change.
          // We update existing rows for this token across maps; if none exist
          // (token never placed), we create a stub row on the current map.
          try {
            await ensureSupabaseReady();
            const roomId = String(currentRoomId || '');
            const tokenId = String(p.id);
            if (roomId && tokenId) {
              const nowIso = new Date().toISOString();

              // Update all existing token rows for this token in this room (all maps)
              const { data: upd, error: uErr } = await sbClient
                .from('room_tokens')
                .update({ color: c, updated_at: nowIso })
                .eq('room_id', roomId)
                .eq('token_id', tokenId)
                .select('room_id')
                .limit(1);

              // If there is no row yet (token not placed anywhere), create stub on current map.
              if (!uErr && (!Array.isArray(upd) || upd.length === 0)) {
                const mapId = String(p?.mapId || next?.currentMapId || '');
                if (mapId) {
                  const payload = {
                    room_id: roomId,
                    map_id: mapId,
                    token_id: tokenId,
                    x: (p.x === null || typeof p.x === 'undefined') ? null : Number(p.x),
                    y: (p.y === null || typeof p.y === 'undefined') ? null : Number(p.y),
                    size: Number(p.size) || 1,
                    color: c,
                    owner_id: p.ownerId || null,
                    updated_at: nowIso
                  };
                  await sbClient.from('room_tokens').upsert(payload, { onConflict: 'room_id,map_id,token_id' });
                }
              }
            }
          } catch (e) {
            console.warn('updatePlayerColor: room_tokens update failed', e);
          }

          // Optimistic DOM update (current client). Others will update via realtime/state.
          try { setPlayerPosition?.(p); } catch {}
        }

        else if (type === "addPlayer") {
          const player = msg.player || {};
          const isBase = !!player.isBase;
          const isMonster = !!player.isMonster;

          // Visibility + per-map scoping metadata:
          // - ownerRole allows clients to hide GM-created non-allies from other players.
          // - mapId allows GM to keep "map-local" NPCs/monsters per active map.
          //   Bases and Allies are global across maps.
          const ownerRole = String(myRole || "").trim() || "";
          const activeMapId = String(next?.currentMapId || "").trim() || null;
          const mapId = (ownerRole === "GM" && !isBase && !player.isAlly)
            ? (activeMapId || null)
            : null;

          // Visibility:
          // - GM-created non-allies are hidden from other users by default (isPublic=false).
          // - Allies are always visible with full info.
          // - Non-GM owners default to visible.
          const isPublic = (ownerRole === "GM") ? !!player.isAlly : true;
          if (isBase) {
            const exists = (next.players || []).some(p => p.isBase && p.ownerId === myUserId);
            if (exists) {
              handleMessage({ type: "error", message: "У вас уже есть Основа. Можно иметь только одну основу на пользователя." });
              return;
            }
          }
          const id = player.id || (crypto?.randomUUID ? crypto.randomUUID() : ("p-" + Math.random().toString(16).slice(2)));
          next.players.push({
            id,
            name: player.name,
            color: player.color,
            size: player.size,
            x: null,
            y: null,
            initiative: 0,
            hasRolledInitiative: false,
            // If created during combat/initiative, do NOT auto-join.
            // GM can add to combat via the Turn Order panel.
            pendingInitiativeChoice: false,
            willJoinNextRound: false,
            inCombat: false,
            isBase,
            isAlly: !!player.isAlly,
            isPublic,
            isMonster,
            monsterId: player.monsterId || null,
            ownerId: myUserId,
            ownerRole,
            mapId,
            ownerName: myNameSpan?.textContent || "",
            sheet: player.sheet || { parsed: { name: { value: player.name } } }
          });
          logEventToState(next, `${isMonster ? 'Добавлен монстр' : 'Добавлен игрок'} ${player.name}`);
        }

        else if (type === "setPlayerPublic") {
          if (!isGM) return;
          const pid = String(msg.id || "");
          if (!pid) return;
          const p = (next.players || []).find(pp => String(pp?.id) === pid);
          if (!p) return;

          // meaningful only for GM-created non-allies
          const ownerRole = String(p.ownerRole || "");
          if (ownerRole !== "GM") return;
          if (p.isAlly) return;

          p.isPublic = !!msg.isPublic;
          logEventToState(next, `${p.name}: видимость ${p.isPublic ? 'включена' : 'выключена'}`);
        }

        else if (type === "combatInitChoice") {
          // When a new character is created during combat, it must pick initiative:
          // - 'roll' : d20 + DEX mod of this character
          // - 'base' : copy initiative from owner's Base character
          if (next.phase !== "combat" && next.phase !== 'initiative') return;
          const pid = String(msg.id || "");
          const choice = String(msg.choice || "");
          if (!pid) return;
          const p = (next.players || []).find(pp => String(pp.id) === pid);
          if (!p) return;
          if (!p.inCombat) return;
          // Allow both explicit pending flow and direct usage from UI.
          if (!p.pendingInitiativeChoice && p.hasRolledInitiative) return;
          if (!isGM && !ownsPlayer(p)) return;

          let total = null;
          let kindText = "";
          let rolls = [];
          let bonus = 0;

          if (choice === "roll") {
            const roll = Math.floor(Math.random() * 20) + 1;
            const dexMod = getDexMod(p);
            total = roll + dexMod;
            kindText = `Инициатива (в бою): d20${dexMod >= 0 ? "+" : ""}${dexMod}`;
            rolls = [roll];
            bonus = dexMod;
            const sign = dexMod >= 0 ? "+" : "";
            logEventToState(next, `${p.name} бросил инициативу (в бою): ${roll}${sign}${dexMod} = ${total}`);
          } else if (choice === "base") {
            const base = (next.players || []).find(pp => pp && pp.isBase && String(pp.ownerId) === String(p.ownerId));
            const baseInit = Number(base?.initiative);
            if (!base || !Number.isFinite(baseInit)) {
              handleMessage({ type: "error", message: "У вашей основы нет инициативы (сначала бросьте инициативу для основы)." });
              return;
            }
            total = baseInit;
            kindText = "Инициатива основы";
            rolls = [];
            bonus = 0;
            logEventToState(next, `${p.name} взял инициативу основы: ${total}`);
          } else {
            return;
          }

          p.initiative = total;
          p.hasRolledInitiative = true;
          p.pendingInitiativeChoice = false;
          // If we're already in combat, join on next round to avoid breaking the current turn.
          if (next.phase === 'combat') p.willJoinNextRound = true;

          await broadcastDiceEventOnly({
            fromId: myUserId,
            fromName: p.name,
            kindText,
            sides: 20,
            count: 1,
            bonus,
            rolls,
            total,
            crit: ""
          });
        }

        else if (type === 'gmRollInitiativeFor') {
          // Optional: GM can roll initiative for any combatant.
          if (!isGM) return;
          if (next.phase !== 'initiative' && next.phase !== 'combat') return;
          const pid = String(msg.id || '');
          const choice = String(msg.choice || 'roll');
          if (!pid) return;
          const p = (next.players || []).find(pp => String(pp?.id) === pid);
          if (!p) return;
          if (!p.inCombat) return;
          if (p.hasRolledInitiative) return;

          let total = null;
          let kindText = '';
          let rolls = [];
          let bonus = 0;

          if (choice === 'base') {
            const base = (next.players || []).find(pp => pp && pp.isBase && String(pp.ownerId) === String(p.ownerId));
            const baseInit = Number(base?.initiative);
            if (!base || !Number.isFinite(baseInit)) {
              handleMessage({ type: 'error', message: 'У основы нет инициативы (сначала бросьте инициативу для основы).' });
              return;
            }
            total = baseInit;
            kindText = 'Инициатива основы (GM)';
            logEventToState(next, `GM назначил ${p.name} инициативу основы: ${total}`);
          } else {
            const roll = Math.floor(Math.random() * 20) + 1;
            const dexMod = getDexMod(p);
            total = roll + dexMod;
            kindText = `Инициатива (GM): d20${dexMod >= 0 ? '+' : ''}${dexMod}`;
            rolls = [roll];
            bonus = dexMod;
            const sign = dexMod >= 0 ? '+' : '';
            logEventToState(next, `GM бросил инициативу за ${p.name}: ${roll}${sign}${dexMod} = ${total}`);
          }

          p.initiative = total;
          p.hasRolledInitiative = true;
          p.pendingInitiativeChoice = false;
          if (next.phase === 'combat') p.willJoinNextRound = true;

          await broadcastDiceEventOnly({
            fromId: myUserId,
            fromName: 'GM',
            kindText,
            sides: 20,
            count: 1,
            bonus,
            rolls,
            total,
            crit: ''
          });
        }

        else if (type === "movePlayer") {
          const p = (next.players || []).find(pp => String(pp.id) === String(msg.id));
          if (!p) return;
          if (!isGM && !ownsPlayer(p)) return;

          if (next.phase === "combat" && !isGM) {
            const currentId = next.turnOrder?.[next.currentTurnIndex];
            const notPlacedYet = (p.x === null || p.y === null);
            if (p.id !== currentId && !notPlacedYet) return;
          }

          const size = Number(p.size) || 1;
          const maxX = next.boardWidth - size;
          const maxY = next.boardHeight - size;
          const nx = clamp(Number(msg.x) || 0, 0, maxX);
          const ny = clamp(Number(msg.y) || 0, 0, maxY);

          // v4: movement is atomic via room_tokens (RPC), not via room_state.
          // This removes race conditions when multiple users move simultaneously.
          // Optimistic local update for smooth UX
          try {
            if (p) { p.x = nx; p.y = ny; }
            // Also move the DOM token immediately (we may not receive realtime
            // events if the new tables are not enabled for Realtime yet).
            try { setPlayerPosition?.(p); } catch {}
            try {
              const el = (typeof playerElements !== 'undefined') ? playerElements.get(String(p.id)) : null;
              if (el) updateHpBar?.(p, el);
            } catch {}

            // Fog of war must react instantly to movement (recompute dynamic vision + refresh discoverable tokens)
            try {
              const stNow = (typeof lastState !== 'undefined' && lastState) ? lastState : next;
              window.FogWar?.onTokenPositionsChanged?.(stNow);
              // Re-run token placement/visibility rules (GM-hidden NPC discovery) without full board rerender.
              (stNow?.players || []).forEach(pp => { try { setPlayerPosition?.(pp); } catch {} });
            } catch {}
          } catch {}

          try {
            const mapId = String(next.currentMapId || '');
            // Prefer RPC (server-side collision checks + log insert)
            // v5: pass token name so room_log shows player name instead of UUID.
            const { data, error } = await sbClient.rpc('move_token_v2', {
              p_room_id: currentRoomId,
              p_map_id: mapId,
              p_token_id: String(p.id),
              p_token_name: String(p.name || ''),
              p_actor_user_id: String(myUserId || ''),
              p_x: nx,
              p_y: ny
            });
            if (error) {
              // fallback: client-side collision check + direct update
              if (!isAreaFree(next, p.id, nx, ny, size)) {
                handleMessage({ type: 'error', message: 'Эта клетка занята другим персонажем' });
                return;
              }
              const fallbackRow = { room_id: currentRoomId, map_id: mapId, token_id: String(p.id), x: nx, y: ny, size, color: p.color || null, owner_id: p.ownerId || null, updated_at: new Date().toISOString() };
              const { error: uErr } = await sbClient
                .from('room_tokens')
                .upsert(fallbackRow, { onConflict: 'room_id,map_id,token_id' });
              if (uErr) throw uErr;
              try { sendWsEnvelope({ type: 'tokenRow', roomId: currentRoomId, row: fallbackRow }, { optimisticApplied: true }); } catch {}
              await insertRoomLog(currentRoomId, `${p.name} перемещен в (${nx},${ny})`);
            } else {
              // Apply returned row instantly if provided
              if (data) applyTokenRowToLocalState(data);
              try {
                const relayRow = data || { room_id: currentRoomId, map_id: mapId, token_id: String(p.id), x: nx, y: ny, size, color: p.color || null, owner_id: p.ownerId || null, updated_at: new Date().toISOString() };
                sendWsEnvelope({ type: 'tokenRow', roomId: currentRoomId, row: relayRow }, { optimisticApplied: true });
              } catch {}
            }
          } catch (e) {
            console.warn('move_token failed', e);
            handleMessage({ type: 'error', message: 'Не удалось переместить персонажа' });
          }

          // IMPORTANT: movement is NOT persisted via room_state.
          // We stop here to avoid overwriting fresh positions/logs with a full state upsert.
          return;
        }

        else if (type === "updatePlayerSize") {
          const p = (next.players || []).find(pp => String(pp.id) === String(msg.id));
          if (!p) return;
          if (!isGM && !ownsPlayer(p)) return;
          const newSize = parseInt(msg.size, 10);
          if (!Number.isFinite(newSize) || newSize < 1 || newSize > 5) return;

          if (p.x !== null && p.y !== null) {
            const maxX = next.boardWidth - newSize;
            const maxY = next.boardHeight - newSize;
            const nx = clamp(p.x, 0, maxX);
            const ny = clamp(p.y, 0, maxY);
            if (!isAreaFree(next, p.id, nx, ny, newSize)) {
              handleMessage({ type: "error", message: "Нельзя увеличить размер: место занято" });
              return;
            }
            p.x = nx;
            p.y = ny;
          }
          p.size = newSize;
          logEventToState(next, `${p.name} изменил размер на ${p.size}x${p.size}`);

          // v4+: Persist token size in room_tokens, otherwise realtime token rows
          // will overwrite the local size and the UI will look like it "doesn't work".
          try {
            await ensureSupabaseReady();
            const roomId = String(currentRoomId || '');
            const mapId = String(p?.mapId || next?.currentMapId || '');
            if (roomId && mapId) {
              const payload = {
                room_id: roomId,
                map_id: mapId,
                token_id: String(p.id),
                x: (p.x === null || typeof p.x === 'undefined') ? null : Number(p.x),
                y: (p.y === null || typeof p.y === 'undefined') ? null : Number(p.y),
                size: Number(p.size) || 1,
                color: (typeof p.color === 'string') ? p.color : null,
                owner_id: p.ownerId || null,
                updated_at: new Date().toISOString()
              };
              await sbClient.from('room_tokens').upsert(payload, { onConflict: 'room_id,map_id,token_id' });
              try { sendWsEnvelope({ type: 'tokenRow', roomId, row: payload }, { optimisticApplied: true }); } catch {}
            }
          } catch (e) {
            console.warn('updatePlayerSize: room_tokens upsert failed', e);
          }
        }

        else if (type === "removePlayerFromBoard") {
          const p = (next.players || []).find(pp => String(pp.id) === String(msg.id));
          if (!p) return;
          if (!isGM && !ownsPlayer(p)) return;

          // Optimistic local update
          p.x = null;
          p.y = null;
          try { setPlayerPosition?.(p); } catch {}

          // v4: token position is stored in room_tokens; clear it there too
          try {
            await ensureSupabaseReady();
            const mapId = String(next.currentMapId || '');
            if (currentRoomId && mapId) {
              await sbClient
                .from('room_tokens')
                .update({ x: null, y: null })
                .eq('room_id', currentRoomId)
                .eq('map_id', mapId)
                .eq('token_id', String(p.id));
              try {
                sendWsEnvelope({
                  type: 'tokenRow',
                  roomId: currentRoomId,
                  row: { room_id: currentRoomId, map_id: mapId, token_id: String(p.id), x: null, y: null, size: Number(p.size) || 1, color: p.color || null, owner_id: p.ownerId || null, updated_at: new Date().toISOString() }
                }, { optimisticApplied: true });
              } catch {}
            }
          } catch (e) {
            console.warn('removePlayerFromBoard: room_tokens update failed', e);
          }

          logEventToState(next, `${p.name} удален с поля`);
        }

        else if (type === "removePlayerCompletely") {
          const p = (next.players || []).find(pp => String(pp.id) === String(msg.id));
          if (!p) return;
          if (!isGM && !ownsPlayer(p)) return;

          // v4: also remove any room_tokens rows for this token (all maps)
          try {
            await ensureSupabaseReady();
            if (currentRoomId) {
              await sbClient
                .from('room_tokens')
                .delete()
                .eq('room_id', currentRoomId)
                .eq('token_id', String(p.id));
            }
          } catch (e) {
            console.warn('removePlayerCompletely: room_tokens delete failed', e);
          }

          next.players = (next.players || []).filter(pl => pl.id !== msg.id);
          next.turnOrder = (next.turnOrder || []).filter(id => id !== msg.id);
          logEventToState(next, `Игрок ${p.name} полностью удален`);
        }

        else if (type === "bulkWalls") {
          if (!isGM) return;
          const mode = String(msg.mode || "");
          const cells = Array.isArray(msg.cells) ? msg.cells : [];
          if (!Array.isArray(next.walls)) next.walls = [];
          // Используем Set для ускорения
          const wallSet = new Set(next.walls.map(w => `${w.x},${w.y}`));
          let changed = 0;

          if (mode === "add") {
            for (const c of cells) {
              const x = Number(c?.x), y = Number(c?.y);
              if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
              const k = `${x},${y}`;
              if (wallSet.has(k)) continue;
              wallSet.add(k);
              next.walls.push({ x, y });
              changed++;
            }
          } else if (mode === "remove") {
            const removeSet = new Set();
            for (const c of cells) {
              const x = Number(c?.x), y = Number(c?.y);
              if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
              removeSet.add(`${x},${y}`);
            }
            if (removeSet.size) {
              next.walls = next.walls.filter(w => !removeSet.has(`${w.x},${w.y}`));
              changed = removeSet.size;
            }
          } else {
            return;
          }

          if (changed) {
            logEventToState(next, `Окружение: ${mode === "add" ? "добавлено" : "удалено"} ${changed} стен`);
          }
        }

        else if (type === "bulkWallEdges") {
          // v2: edge walls on cell borders
          if (!isGM) return;
          const mode = String(msg.mode || "");
          const edges = Array.isArray(msg.edges) ? msg.edges : [];
          if (!Array.isArray(next.walls)) next.walls = [];

          const key = (w) => `${Number(w?.x)},${Number(w?.y)},${String(w?.dir || '').toUpperCase()}`;
          const set = new Set();
          for (const w of next.walls) {
            const dir = String(w?.dir || '').toUpperCase();
            if (!dir) continue;
            set.add(key(w));
          }

          let changed = 0;
          if (mode === 'add') {
            for (const e of edges) {
              const x = Number(e?.x), y = Number(e?.y);
              const dir = String(e?.dir || '').toUpperCase();
              if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
              if (!(dir === 'N' || dir === 'E' || dir === 'S' || dir === 'W')) continue;
              const k = `${x},${y},${dir}`;
              if (set.has(k)) continue;
              set.add(k);
              next.walls.push({
                x, y, dir,
                type: String(e?.type || 'stone'),
                thickness: Number(e?.thickness) || 4
              });
              changed++;
            }
          } else if (mode === 'remove') {
            const remove = new Set();
            for (const e of edges) {
              const x = Number(e?.x), y = Number(e?.y);
              const dir = String(e?.dir || '').toUpperCase();
              if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
              if (!(dir === 'N' || dir === 'E' || dir === 'S' || dir === 'W')) continue;
              remove.add(`${x},${y},${dir}`);
            }
            if (remove.size) {
              const before = next.walls.length;
              next.walls = next.walls.filter(w => !remove.has(`${Number(w?.x)},${Number(w?.y)},${String(w?.dir || '').toUpperCase()}`));
              changed = Math.max(0, before - next.walls.length);
            }
          } else {
            return;
          }

          if (changed) logEventToState(next, `Окружение: ${mode === "add" ? "добавлено" : "удалено"} ${changed} сегментов стен`);
        }

else if (type === "addWall") {
          if (!isGM) return;
          const w = msg.wall;
          if (!w) return;
          if (!Array.isArray(next.walls)) next.walls = [];
          const x = Number(w?.x), y = Number(w?.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return;
          const dir = String(w?.dir || '').toUpperCase();

          // v2 edge wall
          if (dir === 'N' || dir === 'E' || dir === 'S' || dir === 'W') {
            const exists = (next.walls || []).some(ww => Number(ww?.x) === x && Number(ww?.y) === y && String(ww?.dir || '').toUpperCase() === dir);
            if (!exists) {
              next.walls.push({ x, y, dir, type: String(w?.type || 'stone'), thickness: Number(w?.thickness) || 4 });
              logEventToState(next, `Стена добавлена (${x},${y},${dir})`);
            }
            return;
          }

          // legacy cell wall (kept for compatibility)
          if (!(next.walls || []).find(ww => ww && ww.x === x && ww.y === y && !ww.dir)) {
            next.walls.push({ x, y });
            logEventToState(next, `Стена добавлена (${x},${y})`);
          }
        }

        else if (type === "removeWall") {
          if (!isGM) return;
          const w = msg.wall;
          if (!w) return;
          if (!Array.isArray(next.walls)) next.walls = [];
          const x = Number(w?.x), y = Number(w?.y);
          const dir = String(w?.dir || '').toUpperCase();
          if (Number.isFinite(x) && Number.isFinite(y) && (dir === 'N' || dir === 'E' || dir === 'S' || dir === 'W')) {
            next.walls = next.walls.filter(ww => !(Number(ww?.x) === x && Number(ww?.y) === y && String(ww?.dir || '').toUpperCase() === dir));
            logEventToState(next, `Стена удалена (${x},${y},${dir})`);
            return;
          }
          // legacy cell
          if (Number.isFinite(x) && Number.isFinite(y)) {
            next.walls = next.walls.filter(ww => !(Number(ww?.x) === x && Number(ww?.y) === y && !ww.dir));
            logEventToState(next, `Стена удалена (${x},${y})`);
          }
        }

        else if (type === "setBoardBg") {
          if (!isGM) return;
          const bgUrl = String(msg.bgUrl || msg.dataUrl || "").trim();
          const bgStoragePath = String(msg.bgStoragePath || "").trim() || null;
          const bgStorageBucket = String(msg.bgStorageBucket || "").trim() || null;
          next.boardBgUrl = bgUrl || null;
          next.boardBgDataUrl = bgUrl || null;
          next.boardBgStoragePath = bgStoragePath;
          next.boardBgStorageBucket = bgStorageBucket;
          logEventToState(next, next.boardBgUrl ? "Подложка карты загружена" : "Подложка карты очищена");
        }

        else if (type === "clearBoardBg") {
          if (!isGM) return;
          next.boardBgDataUrl = null;
          next.boardBgUrl = null;
          next.boardBgStoragePath = null;
          next.boardBgStorageBucket = null;
          logEventToState(next, "Подложка карты очищена");
        }

        else if (type === "setGridAlpha") {
          if (!isGM) return;
          const a = Number(msg.alpha);
          next.gridAlpha = Number.isFinite(a) ? clamp(a, 0, 1) : 1;
          logEventToState(next, `Прозрачность клеток: ${Math.round((1 - next.gridAlpha) * 100)}%`);
        }

        else if (type === "setWallAlpha") {
          if (!isGM) return;
          const a = Number(msg.alpha);
          next.wallAlpha = Number.isFinite(a) ? clamp(a, 0, 1) : 1;
          logEventToState(next, `Прозрачность стен: ${Math.round((1 - next.wallAlpha) * 100)}%`);
        }



        // ===== Background Music (GM) =====
        else if (type === "bgMusicSet") {
          if (!isGM) return;
          if (!next.bgMusic || typeof next.bgMusic !== 'object') {
            next.bgMusic = { tracks: [], currentTrackId: null, isPlaying: false, volume: 40 };
          }
          const incoming = msg.bgMusic || {};
          if (Array.isArray(incoming.tracks)) {
            // hard limit 10
            next.bgMusic.tracks = incoming.tracks.slice(0, 10).map(t => ({
              id: String(t?.id || ''),
              name: String(t?.name || ''),
              desc: String(t?.desc || ''),
              url: String(t?.url || ''),
              path: String(t?.path || ''),
              createdAt: String(t?.createdAt || '')
            })).filter(t => t.id && t.url);
          }
          if ('currentTrackId' in incoming) next.bgMusic.currentTrackId = incoming.currentTrackId ? String(incoming.currentTrackId) : null;
          if (typeof incoming.isPlaying === 'boolean') next.bgMusic.isPlaying = incoming.isPlaying;
          if ('volume' in incoming) {
            const v = Number(incoming.volume);
            next.bgMusic.volume = Number.isFinite(v) ? clamp(v, 0, 100) : (Number(next.bgMusic.volume) || 40);
          }
          // If current track removed — stop
          if (next.bgMusic.currentTrackId) {
            const ok = (next.bgMusic.tracks || []).some(t => String(t.id) === String(next.bgMusic.currentTrackId));
            if (!ok) {
              next.bgMusic.currentTrackId = null;
              next.bgMusic.isPlaying = false;
            }
          }
          logEventToState(next, "Фоновая музыка обновлена");
        }

        // ===== Marks / Areas (everyone can draw; GM can remove all) =====
        else if (type === 'addMark') {
          const raw = msg.mark;
          if (!raw || typeof raw !== 'object') return;

          const m = getActiveMap(next);
          if (!m) return;
          if (!Array.isArray(m.marks)) m.marks = [];
          if (!Array.isArray(next.marks)) next.marks = [];

          const id = String(raw.id || '').trim();
          const kind = String(raw.kind || '').trim();
          if (!id) return;
          if (!(kind === 'rect' || kind === 'circle' || kind === 'poly')) return;

          // Avoid duplicates
          if (m.marks.some(mm => String(mm?.id) === id)) return;

          const ownerId = String(raw.ownerId || myId || '').trim();
          const color = String(raw.color || '#ffa500').trim();
          const alphaFill = Number.isFinite(Number(raw.alphaFill)) ? clamp(Number(raw.alphaFill), 0, 1) : 0.7;
          const alphaStroke = Number.isFinite(Number(raw.alphaStroke)) ? clamp(Number(raw.alphaStroke), 0, 1) : 0.6;
          const strokeW = Number.isFinite(Number(raw.strokeW)) ? clamp(Number(raw.strokeW), 1, 10) : 2;
          const label = String(raw.label || '').slice(0, 80);

          const safe = {
            id,
            mapId: String(next.currentMapId || m.id || ''),
            ownerId,
            kind,
            color,
            alphaFill,
            alphaStroke,
            strokeW,
            label
          };

          if (kind === 'rect') {
            const x = Number(raw.x), y = Number(raw.y), w = Number(raw.w), h = Number(raw.h);
            if (![x, y, w, h].every(Number.isFinite)) return;
            if (w <= 0 || h <= 0) return;
            safe.x = clamp(x, 0, Math.max(0, next.boardWidth - 0.01));
            safe.y = clamp(y, 0, Math.max(0, next.boardHeight - 0.01));
            safe.w = clamp(w, 0.01, next.boardWidth * 2);
            safe.h = clamp(h, 0.01, next.boardHeight * 2);
          } else if (kind === 'circle') {
            const cx = Number(raw.cx), cy = Number(raw.cy), r = Number(raw.r);
            if (![cx, cy, r].every(Number.isFinite)) return;
            if (r <= 0) return;
            safe.cx = clamp(cx, 0, Math.max(0, next.boardWidth));
            safe.cy = clamp(cy, 0, Math.max(0, next.boardHeight));
            safe.r = clamp(r, 0.05, Math.max(next.boardWidth, next.boardHeight) * 2);
          } else if (kind === 'poly') {
            const pts = Array.isArray(raw.pts) ? raw.pts : [];
            if (pts.length < 3) return;
            safe.pts = pts.slice(0, 64).map(p => ({
              x: clamp(Number(p?.x) || 0, 0, Math.max(0, next.boardWidth)),
              y: clamp(Number(p?.y) || 0, 0, Math.max(0, next.boardHeight))
            }));
          }

          m.marks.push(safe);
          next.marks = deepClone(m.marks);
          logEventToState(next, `Обозначение добавлено`);
        }

        else if (type === 'removeMark') {
          const id = String(msg.id || '').trim();
          if (!id) return;
          const m = getActiveMap(next);
          if (!m) return;
          if (!Array.isArray(m.marks)) m.marks = [];

          const mark = m.marks.find(mm => String(mm?.id) === id);
          if (!mark) return;

          // GM может удалить всё, игрок — только своё
          if (!isGM && String(mark.ownerId || '') !== String(myId || '')) return;

          const before = m.marks.length;
          m.marks = m.marks.filter(mm => String(mm?.id) !== id);
          if (m.marks.length !== before) {
            next.marks = deepClone(m.marks);
            logEventToState(next, `Обозначение удалено`);
          }
        }

        else if (type === 'clearMarks') {
          const m = getActiveMap(next);
          if (!m) return;
          if (!Array.isArray(m.marks)) m.marks = [];
          const scope = String(msg.scope || 'mine');
          if (scope === 'all') {
            if (!isGM) return;
            if (m.marks.length) {
              m.marks = [];
              next.marks = [];
              logEventToState(next, `Обозначения очищены`);
            }
          } else {
            const before = m.marks.length;
            m.marks = m.marks.filter(mm => String(mm?.ownerId || '') !== String(myId || ''));
            if (m.marks.length !== before) {
              next.marks = deepClone(m.marks);
              logEventToState(next, `Обозначения очищены (локально)`);
            }
          }
        }

        // ===== Fog of war (GM controls) =====
        else if (type === "setFogSettings") {
          if (!isGM) return;
          if (!next.fog || typeof next.fog !== 'object') next.fog = {};
          const f = next.fog;
          if (typeof msg.enabled === 'boolean') f.enabled = msg.enabled;
          if (msg.mode === 'manual' || msg.mode === 'dynamic') f.mode = msg.mode;
          if (msg.manualBase === 'hide' || msg.manualBase === 'reveal') f.manualBase = msg.manualBase;
          if (Number.isFinite(Number(msg.visionRadius))) f.visionRadius = clamp(Number(msg.visionRadius), 1, 60);
          if (typeof msg.useWalls === 'boolean') f.useWalls = msg.useWalls;
          if (typeof msg.exploredEnabled === 'boolean') f.exploredEnabled = msg.exploredEnabled;
          if (typeof msg.gmOpen === 'boolean') f.gmOpen = msg.gmOpen;
          if (typeof msg.moveOnlyExplored === 'boolean') f.moveOnlyExplored = msg.moveOnlyExplored;
          // GM view mode:
          // - 'gm'     : GM sees full board, fog is an overlay showing what is revealed
          // - 'player' : GM sees exactly what players see
          if (msg.gmViewMode === 'gm' || msg.gmViewMode === 'player') f.gmViewMode = msg.gmViewMode;
          if (!Array.isArray(f.manualStamps)) f.manualStamps = [];
          if (!Array.isArray(f.explored)) f.explored = [];
          logEventToState(next, `Туман войны: ${f.enabled ? 'ВКЛ' : 'ВЫКЛ'} (${f.mode === 'dynamic' ? 'динамический' : 'ручной'})`);
        }

        else if (type === "fogStamp") {
          if (!isGM) return;
          if (!next.fog || typeof next.fog !== 'object') next.fog = { enabled: true, mode: 'manual', manualBase: 'hide', manualStamps: [], visionRadius: 8, useWalls: true, exploredEnabled: true, explored: [] };
          const f = next.fog;
          if (!Array.isArray(f.manualStamps)) f.manualStamps = [];
          const x = Number(msg.x), y = Number(msg.y), r = Number(msg.r);
          const mode = String(msg.mode || 'reveal');
          if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(r)) return;
          f.manualStamps.push({ x, y, r: clamp(r, 1, 40), mode: (mode === 'hide' ? 'hide' : 'reveal') });
        }

        else if (type === "fogStampBatch") {
          if (!isGM) return;
          if (!next.fog || typeof next.fog !== 'object') next.fog = { enabled: true, mode: 'manual', manualBase: 'hide', manualStamps: [], visionRadius: 8, useWalls: true, exploredEnabled: true, explored: [] };
          const f = next.fog;
          if (!Array.isArray(f.manualStamps)) f.manualStamps = [];
          const stamps = Array.isArray(msg.stamps) ? msg.stamps : [];
          for (const s of stamps) {
            const x = Number(s?.x), y = Number(s?.y), r = Number(s?.r);
            const mode = (String(s?.mode || 'reveal') === 'hide') ? 'hide' : 'reveal';
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(r)) continue;
            f.manualStamps.push({ x, y, r: clamp(r, 1, 40), mode });
            if (f.manualStamps.length > 5000) break; // safety
          }
        }

        else if (type === "fogStamp2") {
          // New manual shapes: rect/circle/poly (stored in fog.manualStamps)
          if (!isGM) return;
          if (!next.fog || typeof next.fog !== 'object') next.fog = { enabled: true, mode: 'manual', manualBase: 'hide', manualStamps: [], visionRadius: 8, useWalls: true, exploredEnabled: true, explored: [] };
          const f = next.fog;
          if (!Array.isArray(f.manualStamps)) f.manualStamps = [];
          const s = (msg && typeof msg === 'object') ? msg.stamp : null;
          if (!s || typeof s !== 'object') return;

          const kind = String(s.kind || '').toLowerCase();
          const mode = (String(s.mode || 'reveal') === 'hide') ? 'hide' : 'reveal';

          // Square NxN brush (top-left cell x,y; size n)
          if (kind === 'square') {
            const x = Number(s.x), y = Number(s.y), n = Number(s.n);
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(n)) return;
            f.manualStamps.push({ kind: 'square', x, y, n: clamp(n, 1, 10), mode });
            return;
          }

          if (kind === 'rect') {
            const x1 = Number(s.x1), y1 = Number(s.y1), x2 = Number(s.x2), y2 = Number(s.y2);
            if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) return;
            f.manualStamps.push({ kind: 'rect', x1, y1, x2, y2, mode });
            return;
          }

          if (kind === 'circle') {
            const cx = Number(s.cx), cy = Number(s.cy), r = Number(s.r);
            if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r)) return;
            f.manualStamps.push({ kind: 'circle', cx, cy, r: clamp(r, 0.1, 200), mode });
            return;
          }

          if (kind === 'poly') {
            const pts = Array.isArray(s.pts) ? s.pts : [];
            const safe = [];
            for (const p of pts) {
              const x = Number(p?.x), y = Number(p?.y);
              if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
              safe.push({ x, y });
              if (safe.length > 200) break;
            }
            if (safe.length < 3) return;
            f.manualStamps.push({ kind: 'poly', pts: safe, mode });
            return;
          }

          // fallback: ignore unknown kind
        }

        else if (type === "fogFill") {
          if (!isGM) return;
          if (!next.fog || typeof next.fog !== 'object') next.fog = {};
          const f = next.fog;
          if (String(msg.value) === 'revealAll') f.manualBase = 'reveal';
          else f.manualBase = 'hide';
          f.manualStamps = [];
          logEventToState(next, `Туман войны: ${f.manualBase === 'reveal' ? 'Открыто всё' : 'Скрыто всё'}`);
        }

        
        else if (type === "fogClearExplored") {
          if (!isGM) return;
          if (!next.fog || typeof next.fog !== 'object') next.fog = {};
          next.fog.exploredPacked = '';
          next.fog.explored = [];
          logEventToState(next, 'Туман войны: очищено исследованное');
        }

        
        else if (type === "fogSetExplored") {
          // GM replaces explored set (array of "x,y") — stored compactly as exploredPacked bitset.
          if (!isGM) return;
          if (!next.fog || typeof next.fog !== 'object') next.fog = {};
          const cells = Array.isArray(msg.cells) ? msg.cells : [];
          // pack
          next.fog.exploredPacked = '';
          next.fog.explored = [];
          _fogApplyExploredDeltaToState(next, cells);
        }

        
        else if (type === "fogAddExplored") {
          // GM appends explored cells (delta) — stored as exploredPacked to avoid huge room_state payloads.
          if (!isGM) return;
          if (!next.fog || typeof next.fog !== 'object') next.fog = {};
          const f = next.fog;

          // One-time migration: if legacy array exists but packed not yet built, pack it once.
          if (!f.exploredPacked && Array.isArray(f.explored) && f.explored.length) {
            _fogApplyExploredDeltaToState(next, f.explored);
          }

          const add = Array.isArray(msg.cells) ? msg.cells : [];
          _fogApplyExploredDeltaToState(next, add);
        }

        else if (type === "rollInitiative") {
          if (next.phase !== "initiative") return;

          // Collect rolls from the current snapshot, then apply them to DB with retry.
          // This prevents the "last write wins" collision when multiple users roll simultaneously.
          const toRoll = (next.players || []).filter(p => (
            String(p.ownerId) === myUserId && !!p.inCombat && !p.hasRolledInitiative
          ));

          if (!toRoll.length) return;

          const updates = [];
          for (const p of toRoll) {
            const roll = Math.floor(Math.random() * 20) + 1;
            const dexMod = getDexMod(p);
            const total = roll + dexMod;
            updates.push({ playerId: p.id, total, roll, dexMod, name: p.name });

            // Live dice event (broadcast only) – includes its own log line in room_log.
            await broadcastDiceEventOnly({
              fromId: myUserId,
              fromName: p.name,
              kindText: `Инициатива: d20${dexMod >= 0 ? "+" : ""}${dexMod}`,
              sides: 20,
              count: 1,
              bonus: dexMod,
              rolls: [roll],
              total,
              crit: ""
            });
          }

          // Atomic-ish apply to room_state (retry on collision)
          await applyInitiativeAtomic(currentRoomId, myUserId, updates);

          // IMPORTANT: We already wrote to DB using the latest snapshot inside applyInitiativeAtomic.
          // Do NOT fall through to the generic upsert at the end of the handler (it would use stale 'next').
          return;
        }

        else if (type === "startCombat") {
          if (!isGM) return;
          if (next.phase !== "initiative" && next.phase !== "placement" && next.phase !== "exploration") return;
          // In v6, combat includes only selected combatants.
          // If starting combat directly from placement/exploration, default to "those placed on the board".
          if (next.phase !== 'initiative') {
            (next.players || []).forEach(p => {
              const placed = (p && p.x !== null && p.y !== null);
              if (typeof p.inCombat !== 'boolean') p.inCombat = !!placed;
            });
          }
          const combatants = (next.players || []).filter(p => p && p.inCombat);
          const allRolled = combatants.length ? combatants.every(p => p.hasRolledInitiative) : false;
          if (!allRolled) {
            handleMessage({ type: "error", message: "Сначала бросьте инициативу за всех участников боя" });
            return;
          }
          next.turnOrder = [...combatants]
            .sort((a, b) => (Number(b.initiative) || 0) - (Number(a.initiative) || 0))
            .map(p => p.id);
          autoPlacePlayers(next);
          next.phase = "combat";
          next.currentTurnIndex = 0;
          next.round = 1;
          const firstId = next.turnOrder[0];
          const first = (next.players || []).find(p => p.id === firstId);
          logEventToState(next, `Бой начался. Первый ход: ${first?.name || '-'}`);
        }

        else if (type === "endTurn") {
          if (next.phase !== "combat") return;
          if (!Array.isArray(next.turnOrder) || next.turnOrder.length === 0) return;
          const currentId = next.turnOrder[next.currentTurnIndex];
          const current = (next.players || []).find(p => p.id === currentId);
          const canEnd = isGM || (current && ownsPlayer(current));
          if (!canEnd) return;

          const prevIndex = next.currentTurnIndex;
          const nextIndex = (next.currentTurnIndex + 1) % next.turnOrder.length;
          const wrapped = (prevIndex === next.turnOrder.length - 1 && nextIndex === 0);
          if (wrapped) {
            next.round = (Number(next.round) || 1) + 1;
            const toJoin = (next.players || []).filter(p => p && p.willJoinNextRound);
            if (toJoin.length) {
              toJoin.forEach(p => { p.willJoinNextRound = false; });
              next.turnOrder = [...new Set(
                [...next.players]
                  .filter(p => p && p.inCombat && (p.initiative !== null && p.initiative !== undefined) && p.hasRolledInitiative)
                  .sort((a, b) => (Number(b.initiative) || 0) - (Number(a.initiative) || 0))
                  .map(p => p.id)
              )];
            }
          }
          next.currentTurnIndex = wrapped ? 0 : nextIndex;
          const nid = next.turnOrder[next.currentTurnIndex];
          const np = (next.players || []).find(p => p.id === nid);
          logEventToState(next, `Ход игрока ${np?.name || '-'}`);
        }

        else if (type === "resetGame") {
          if (!isGM) return;
          next.players = [];
          next.walls = [];
          next.turnOrder = [];
          next.currentTurnIndex = 0;
          next.log = ["Игра полностью сброшена"];
        }

        else if (type === "clearBoard") {
          if (!isGM) return;
          (next.players || []).forEach(p => { p.x = null; p.y = null; });
          next.walls = [];
          logEventToState(next, "Поле очищено");
        }

        else {
          // unknown message type (ignored)
          return;
        }

        await upsertRoomState(currentRoomId, next);

		// v4+: mirror GM "eye" visibility into room_tokens for reliable realtime visibility updates.
		if (type === 'setPlayerPublic') {
			try {
				const pid = String(msg.id || '');
				if (pid) await upsertTokenVisibility(currentRoomId, pid, !!msg.isPublic);
			} catch {}
		}
        break;
      }
    }
  } catch (e) {
    console.error(e);
    const text = String(e?.message || e || "Ошибка");
    handleMessage({ type: "error", message: text });
  }
}

function updatePhaseUI(state) {
  const combatants = (state?.players || []).filter(p => p && p.inCombat);
  const allRolled = combatants.length
    ? combatants.every(p => p.hasRolledInitiative)
    : false;

  // сбрасываем подсветки
  startExplorationBtn?.classList.remove('active', 'ready', 'pending');
  startInitiativeBtn?.classList.remove('active', 'ready', 'pending');
  startCombatBtn?.classList.remove('active', 'ready', 'pending');

  // ===== initiative roll button only in initiative phase
  if (state.phase === "initiative") {
    rollInitiativeBtn.style.display = "inline-block";
    rollInitiativeBtn.classList.add("is-active");
  } else {
    rollInitiativeBtn.style.display = "none";
    rollInitiativeBtn.classList.remove("is-active");
  }

  // ===== world phase buttons (GM only visually, but keep safe)
  if (state.phase === 'exploration') {
    startExplorationBtn?.classList.add('active');
    startCombatBtn.disabled = true;
  } else if (state.phase === 'initiative') {
    startInitiativeBtn?.classList.add(allRolled ? 'ready' : 'active');

    // бой можно начать только когда все бросили
    startCombatBtn.disabled = !allRolled;
    startCombatBtn.classList.add(allRolled ? 'pending' : 'active');
  } else if (state.phase === 'combat') {
    startCombatBtn.disabled = false;
    startCombatBtn.classList.add('ready');
  } else {
    // lobby or other
    startCombatBtn.disabled = true;
  }

  updateCurrentPlayer(state);
}







