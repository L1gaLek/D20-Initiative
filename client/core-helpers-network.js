// ================== HELPER ==================

function deepClone(obj) {
  try { return structuredClone(obj); } catch {}
  return JSON.parse(JSON.stringify(obj || null));
}

function normalizeRoomPassword(raw) {
  return String(raw || '').trim();
}

async function sha256Hex(input) {
  const raw = String(input || '');
  try {
    if (globalThis.crypto?.subtle) {
      const bytes = new TextEncoder().encode(raw);
      const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {}

  // Fallback non-crypto hash only if subtle API is unavailable.
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw.charCodeAt(i);
    h1 ^= ch; h1 = Math.imul(h1, 0x01000193);
    h2 ^= (ch + i + 17); h2 = Math.imul(h2, 0x01000193);
  }
  return `fallback-${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

function getRoomAccessState(state) {
  try {
    if (state?.roomAccess && typeof state.roomAccess === 'object') return state.roomAccess;
  } catch {}
  return {};
}

function getRoomPasswordHashFromState(state) {
  try {
    const access = getRoomAccessState(state);
    return String(access.passwordHash || '').trim();
  } catch {
    return '';
  }
}

function getRoomLegacyPasswordFromState(state) {
  try {
    const access = getRoomAccessState(state);
    return normalizeRoomPassword(access.password || '');
  } catch {
    return '';
  }
}

function hasRoomPasswordInState(state) {
  try {
    const access = getRoomAccessState(state);
    return !!(access.hasPassword || getRoomPasswordHashFromState(state) || getRoomLegacyPasswordFromState(state));
  } catch {
    return false;
  }
}


async function cleanupExpiredRoomBansTable(roomId = '', userId = '') {
  try {
    let query = sbClient.from('room_bans').delete().lte('banned_until', new Date().toISOString());
    const rid = String(roomId || '').trim();
    const uid = String(userId || '').trim();
    if (rid) query = query.eq('room_id', rid);
    if (uid) query = query.eq('user_id', uid);
    const { error } = await query;
    if (error) throw error;
  } catch (e) {
    console.warn('cleanupExpiredRoomBansTable failed', e);
  }
}

async function getActiveRoomBanRow(roomId, userId) {
  try {
    const rid = String(roomId || '').trim();
    const uid = String(userId || '').trim();
    if (!rid || !uid) return null;
    const nowIso = new Date().toISOString();
    const { data, error } = await sbClient
      .from('room_bans')
      .select('id, room_id, user_id, reason, banned_until, banned_by_user_id, banned_by_name, created_at')
      .eq('room_id', rid)
      .eq('user_id', uid)
      .gt('banned_until', nowIso)
      .order('banned_until', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const untilMs = Date.parse(String(data?.banned_until || ''));
    if (!Number.isFinite(untilMs) || untilMs <= Date.now()) return null;
    return {
      ...data,
      bannedUntil: String(data?.banned_until || ''),
      bannedUntilMs: untilMs,
      reason: String(data?.reason || '').trim() || 'Не указана'
    };
  } catch (e) {
    console.warn('getActiveRoomBanRow failed', e);
    return null;
  }
}

function getAuthorizedUsersMapFromState(state) {
  try {
    const access = getRoomAccessState(state);
    return (access.authorizedUsers && typeof access.authorizedUsers === 'object') ? access.authorizedUsers : {};
  } catch {
    return {};
  }
}

function getRoomBansMapFromState(state) {
  try {
    const access = getRoomAccessState(state);
    return (access.bannedUsers && typeof access.bannedUsers === 'object') ? access.bannedUsers : {};
  } catch {
    return {};
  }
}

function getRoomModerationEvent(state) {
  try {
    const access = getRoomAccessState(state);
    return (access.moderationEvent && typeof access.moderationEvent === 'object') ? access.moderationEvent : null;
  } catch {
    return null;
  }
}

function getActiveRoomBanForUser(state, userId) {
  try {
    const uid = String(userId || '').trim();
    if (!uid) return null;
    const bans = getRoomBansMapFromState(state);
    const entry = (bans && typeof bans === 'object') ? bans[uid] : null;
    if (!entry || typeof entry !== 'object') return null;
    const untilMs = Date.parse(String(entry.bannedUntil || ''));
    if (!Number.isFinite(untilMs)) return null;
    if (untilMs <= Date.now()) return null;
    return { ...entry, bannedUntilMs: untilMs };
  } catch {
    return null;
  }
}

function formatBanRemainingMs(ms) {
  const total = Math.max(0, Math.floor(Number(ms) || 0));
  const totalMinutes = Math.max(1, Math.ceil(total / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours} ч. ${minutes} мин.`;
  if (hours > 0) return `${hours} ч.`;
  return `${minutes} мин.`;
}

function cleanupExpiredRoomBans(state) {
  const next = deepClone(state || {});
  let changed = false;
  try {
    if (!next.roomAccess || typeof next.roomAccess !== 'object') next.roomAccess = {};
    const bans = (next.roomAccess.bannedUsers && typeof next.roomAccess.bannedUsers === 'object')
      ? next.roomAccess.bannedUsers
      : {};
    const clean = {};
    Object.entries(bans).forEach(([uid, entry]) => {
      const untilMs = Date.parse(String(entry?.bannedUntil || ''));
      if (Number.isFinite(untilMs) && untilMs > Date.now()) clean[String(uid)] = entry;
      else changed = true;
    });
    next.roomAccess.bannedUsers = clean;
  } catch {}
  return { state: next, changed };
}

function withRoomModerationEvent(state, event) {
  const next = deepClone(state || {});
  try {
    if (!next.roomAccess || typeof next.roomAccess !== 'object') next.roomAccess = {};
    next.roomAccess.moderationEvent = deepClone(event || null);
  } catch {}
  return next;
}

function withRoomBanUser(state, userId, payload) {
  const next = deepClone(state || {});
  try {
    if (!next.roomAccess || typeof next.roomAccess !== 'object') next.roomAccess = {};
    if (!next.roomAccess.bannedUsers || typeof next.roomAccess.bannedUsers !== 'object') next.roomAccess.bannedUsers = {};
    const uid = String(userId || '').trim();
    if (uid) next.roomAccess.bannedUsers[uid] = deepClone(payload || {});
  } catch {}
  return next;
}


function removeRoomUserOwnedPlayers(state, userId) {
  const next = deepClone(state || {});
  const removedIds = [];
  try {
    const uid = String(userId || '').trim();
    if (!uid) return { state: next, removedPlayerIds: removedIds };
    const prevPlayers = Array.isArray(next.players) ? next.players : [];
    next.players = prevPlayers.filter((p) => {
      const owned = String(p?.ownerId || '').trim() === uid;
      if (owned && p?.id) removedIds.push(String(p.id));
      return !owned;
    });
    if (Array.isArray(next.turnOrder) && removedIds.length) {
      const removed = new Set(removedIds);
      next.turnOrder = next.turnOrder.filter((id) => !removed.has(String(id)));
      const curId = String(next.current_actor_id || '');
      if (curId && removed.has(curId)) next.current_actor_id = null;
      const currentTurnTokenId = String(next.turnOrder?.[Number(next.currentTurnIndex) || 0] || '');
      if (currentTurnTokenId && removed.has(currentTurnTokenId)) {
        next.currentTurnIndex = 0;
      } else if (Array.isArray(next.turnOrder) && next.turnOrder.length) {
        const idx = Math.max(0, Math.min(Number(next.currentTurnIndex) || 0, next.turnOrder.length - 1));
        next.currentTurnIndex = idx;
      } else {
        next.currentTurnIndex = 0;
      }
    }
  } catch {}
  return { state: next, removedPlayerIds: removedIds };
}

function isUserAuthorizedForRoom(state, userId) {
  try {
    const uid = String(userId || '').trim();
    if (!uid) return false;
    const auth = getAuthorizedUsersMapFromState(state);
    return !!auth[uid];
  } catch {
    return false;
  }
}

async function buildRoomAccessState(password, previousState) {
  const normalized = normalizeRoomPassword(password);
  const prevAccess = getRoomAccessState(previousState);
  const next = {
    hasPassword: !!normalized,
    passwordHash: '',
    authorizedUsers: {},
    bannedUsers: {},
    moderationEvent: (prevAccess.moderationEvent && typeof prevAccess.moderationEvent === 'object') ? deepClone(prevAccess.moderationEvent) : null
  };

  try {
    if (prevAccess.authorizedUsers && typeof prevAccess.authorizedUsers === 'object') {
      next.authorizedUsers = deepClone(prevAccess.authorizedUsers);
    }
  } catch {}
  try {
    if (prevAccess.bannedUsers && typeof prevAccess.bannedUsers === 'object') {
      next.bannedUsers = deepClone(prevAccess.bannedUsers);
    }
  } catch {}

  if (!normalized) {
    next.authorizedUsers = {};
    return next;
  }

  next.passwordHash = await sha256Hex(normalized);
  return next;
}

function withAuthorizedRoomUser(state, userId, role) {
  const next = deepClone(state || {});
  try {
    if (!next.roomAccess || typeof next.roomAccess !== 'object') next.roomAccess = {};
    if (!next.roomAccess.authorizedUsers || typeof next.roomAccess.authorizedUsers !== 'object') {
      next.roomAccess.authorizedUsers = {};
    }
    const uid = String(userId || '').trim();
    if (uid) {
      next.roomAccess.authorizedUsers[uid] = {
        grantedAt: new Date().toISOString(),
        role: String(role || '').trim() || null
      };
    }
    next.roomAccess.hasPassword = hasRoomPasswordInState(next);
  } catch {}
  return next;
}

function stripRoomSecretsFromState(state) {
  const next = deepClone(state || {});
  try {
    if (next?.roomAccess && typeof next.roomAccess === 'object') {
      delete next.roomAccess.password;
      delete next.roomAccess.passwordHash;
      delete next.roomAccess.authorizedUsers;
      delete next.roomAccess.bannedUsers;
      next.roomAccess.hasPassword = !!next.roomAccess.hasPassword;
    }
  } catch {}
  return next;
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

    roomAccess: {
      hasPassword: false,
      passwordHash: '',
      authorizedUsers: {},
      bannedUsers: {},
      moderationEvent: null
    },

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

function _refreshDetachedRoomView() {
  try { window.refreshDetachedStateView?.(); } catch {}
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

// ===== Pending initiative overlay (protect against stale room_state snapshots) =====
const __pendingInitiativeOverlay = {
  roomId: null,
  byPlayerId: new Map()
};

function clearPendingInitiativeOverlay(roomId) {
  try {
    const rid = String(roomId || currentRoomId || '').trim();
    if (!rid) return;
    if (String(__pendingInitiativeOverlay.roomId || '') !== rid) {
      __pendingInitiativeOverlay.roomId = rid;
      __pendingInitiativeOverlay.byPlayerId = new Map();
      return;
    }
    __pendingInitiativeOverlay.byPlayerId.clear();
  } catch {}
}

function rememberPendingInitiativeOverlay(roomId, updates) {
  try {
    const rid = String(roomId || currentRoomId || '').trim();
    if (!rid) return;
    if (String(__pendingInitiativeOverlay.roomId || '') !== rid) {
      __pendingInitiativeOverlay.roomId = rid;
      __pendingInitiativeOverlay.byPlayerId = new Map();
    }
    const now = Date.now();
    (Array.isArray(updates) ? updates : []).forEach((u) => {
      const pid = String(u?.playerId || '').trim();
      if (!pid) return;
      __pendingInitiativeOverlay.byPlayerId.set(pid, {
        initiative: Number(u?.total),
        hasRolledInitiative: true,
        pendingInitiativeChoice: false,
        willJoinNextRound: !!u?.willJoinNextRound,
        updatedAt: now
      });
    });
  } catch {}
}

function applyPendingInitiativeOverlayToState(state) {
  try {
    const st = state && typeof state === 'object' ? state : null;
    if (!st) return state;
    const rid = String(currentRoomId || __pendingInitiativeOverlay.roomId || '').trim();
    if (!rid) return state;
    if (String(__pendingInitiativeOverlay.roomId || '') !== rid) return state;
    if (!(__pendingInitiativeOverlay.byPlayerId instanceof Map) || !__pendingInitiativeOverlay.byPlayerId.size) return state;

    const phase = String(st?.phase || '');
    if (phase !== 'initiative' && phase !== 'combat') return state;

    const combatants = Array.isArray(st?.players) ? st.players.filter(p => p && p.inCombat) : [];
    const isFreshInitiativeReset = (
      phase === 'initiative' &&
      (Number(st?.round) || 1) === 1 &&
      Array.isArray(st?.turnOrder) && st.turnOrder.length === 0 &&
      combatants.length > 0 &&
      combatants.every(p => !p.hasRolledInitiative && (p.initiative === null || typeof p.initiative === 'undefined'))
    );
    if (isFreshInitiativeReset) {
      clearPendingInitiativeOverlay(rid);
      return state;
    }

    (Array.isArray(st.players) ? st.players : []).forEach((p) => {
      if (!p || !p.id) return;
      const pid = String(p.id);
      const ov = __pendingInitiativeOverlay.byPlayerId.get(pid);
      if (!ov) return;

      const incomingRolled = !!p.hasRolledInitiative;
      const incomingInit = (p.initiative === null || typeof p.initiative === 'undefined') ? null : Number(p.initiative);
      if (incomingRolled && incomingInit === Number(ov.initiative)) {
        __pendingInitiativeOverlay.byPlayerId.delete(pid);
        return;
      }

      if (!p.inCombat) return;
      if (!incomingRolled || incomingInit === null) {
        p.initiative = Number(ov.initiative);
        p.hasRolledInitiative = true;
        p.pendingInitiativeChoice = false;
        if (typeof ov.willJoinNextRound !== 'undefined') p.willJoinNextRound = !!ov.willJoinNextRound;
      }
    });
    return st;
  } catch {
    return state;
  }
}

try { window.clearPendingInitiativeOverlay = clearPendingInitiativeOverlay; } catch {}
try { window.rememberPendingInitiativeOverlay = rememberPendingInitiativeOverlay; } catch {}
try { window.applyPendingInitiativeOverlayToState = applyPendingInitiativeOverlayToState; } catch {}

// ===== Lightweight room_state shadow cache (WS-first) =====
let __roomStateShadowRoomId = null;
let __roomStateShadow = null;
let __roomStateShadowUpdatedAt = 0;

function rememberRoomStateShadow(roomId, state) {
  try {
    const rid = String(roomId || currentRoomId || '').trim();
    if (!rid || !state || typeof state !== 'object') return;
    __roomStateShadowRoomId = rid;
    __roomStateShadow = deepClone(state);
    __roomStateShadowUpdatedAt = Date.now();
    try { window.__roomStateShadowRoomId = rid; } catch {}
    try { window.__roomStateShadow = deepClone(state); } catch {}
    try { window.__roomStateShadowUpdatedAt = __roomStateShadowUpdatedAt; } catch {}
  } catch {}
}

function getRoomStateShadow(roomId) {
  try {
    const rid = String(roomId || currentRoomId || '').trim();
    if (!rid) return null;
    if (String(__roomStateShadowRoomId || '') !== rid) return null;
    if (!__roomStateShadow || typeof __roomStateShadow !== 'object') return null;
    return deepClone(__roomStateShadow);
  } catch {
    return null;
  }
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

  // Preserve the newest character sheets from the freshest known snapshot.
  // Prefer the local WS/DB shadow cache to avoid an extra SELECT on every write.
  // Fallback to DB only if we do not have a room-local shadow yet.
  let latestRoomState = getRoomStateShadow(roomId);
  if (!latestRoomState) {
    try {
      latestRoomState = await fetchRoomStateSnapshot(roomId);
    } catch {}
  }
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

  // Detached architecture v5:
  // - walls -> room_walls
  // - marks -> room_marks
  // - fog/manual stamps/explored -> room_fog
  // - music -> room_music_state
  // - per-map board metadata -> room_map_meta
  // Keep room_state slim: only room orchestration + map ids/sections + players/turns.
  try {
    stSafe.walls = [];
    stSafe.marks = [];
    stSafe.bgMusic = { tracks: [], currentTrackId: null, isPlaying: false, volume: 40 };
    stSafe.boardBgDataUrl = null;
    stSafe.boardBgUrl = null;
    stSafe.boardBgStoragePath = null;
    stSafe.boardBgStorageBucket = null;
    stSafe.gridAlpha = 1;
    stSafe.wallAlpha = 1;
    stSafe.fog = {
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
    const maps = Array.isArray(stSafe.maps) ? stSafe.maps : [];
    stSafe.maps = maps.map((m) => ({
      id: String(m?.id || ''),
      name: String(m?.name || 'Карта'),
      sectionId: String(m?.sectionId || '') || null,
      boardWidth: 10,
      boardHeight: 10,
      boardBgDataUrl: null,
      boardBgUrl: null,
      boardBgStoragePath: null,
      boardBgStorageBucket: null,
      gridAlpha: 1,
      wallAlpha: 1,
      walls: [],
      marks: [],
      fog: {
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
      },
      playersPos: {}
    }));
  } catch {}

  // Also clear legacy per-map mirrors if present.
  try {
    const maps = Array.isArray(stSafe.maps) ? stSafe.maps : [];
    maps.forEach((m) => {
      if (!m || typeof m !== 'object') return;
      if (m.playersPos && typeof m.playersPos === 'object') m.playersPos = {};
    });
  } catch {}
  try {
    if (latestRoomState?.roomAccess && typeof latestRoomState.roomAccess === 'object') {
      const latestAccess = getRoomAccessState(latestRoomState);
      if (!stSafe.roomAccess || typeof stSafe.roomAccess !== 'object') stSafe.roomAccess = {};
      stSafe.roomAccess.hasPassword = !!(latestAccess.hasPassword || latestAccess.passwordHash || latestAccess.password);
    }
  } catch {}

  let syncedState = syncActiveToMap(stSafe);
  try {
    if (latestRoomState) syncedState = mergeNewestPlayerSheets(syncedState, latestRoomState);
  } catch {}
  const payload = {
    room_id: roomId,
    phase: String(stSafe?.phase || "lobby"),
    current_actor_id: stSafe?.turnOrder?.[stSafe?.currentTurnIndex] ?? null,
    state: syncedState,
    updated_at: new Date().toISOString()
  };
  const { error } = await sbClient.from("room_state").upsert(payload);
  if (error) throw error;
  try { rememberRoomStateShadow(roomId, syncedState); } catch {}
  try {
    sendWsEnvelope({ type: 'state', roomId, state: stripRoomSecretsFromState(syncedState) }, { optimisticApplied: true });
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
const WS_URL = "wss://ws.d20-initiative.fun/ws/";
const USE_SUPABASE_REALTIME = false; // realtime идет через VPS WS, не через Supabase Realtime
let roomMembersPollTimer = null;
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
const WS_HEARTBEAT_INTERVAL_MS = 20000;
const WS_HEARTBEAT_TIMEOUT_MS = 45000;
const WS_RECONNECT_DELAY_MS = 250;
const WS_SEND_QUEUE_LIMIT = 25;
let wsHeartbeatTimer = null;
let wsLastPongAt = 0;
let wsPendingEnvelopes = [];

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


function stopWsHeartbeat() {
  try { clearInterval(wsHeartbeatTimer); } catch {}
  wsHeartbeatTimer = null;
}

function markWsAlive() {
  wsLastPongAt = Date.now();
}

function flushWsPendingEnvelopes(sock = wsClient) {
  try {
    if (!sock || sock.readyState !== WebSocket.OPEN) return false;
    if (!Array.isArray(wsPendingEnvelopes) || !wsPendingEnvelopes.length) return true;
    const pending = wsPendingEnvelopes.splice(0, wsPendingEnvelopes.length);
    pending.forEach((payload) => {
      try {
        if (payload && typeof payload === 'object') sock.send(JSON.stringify(payload));
      } catch (e) {
        console.warn('[WS] flush queued send failed', e);
      }
    });
    return true;
  } catch {
    return false;
  }
}

function queueWsEnvelope(payload) {
  try {
    if (!payload || typeof payload !== 'object') return false;
    if (!Array.isArray(wsPendingEnvelopes)) wsPendingEnvelopes = [];
    wsPendingEnvelopes.push(payload);
    if (wsPendingEnvelopes.length > WS_SEND_QUEUE_LIMIT) {
      wsPendingEnvelopes.splice(0, wsPendingEnvelopes.length - WS_SEND_QUEUE_LIMIT);
    }
    return true;
  } catch {
    return false;
  }
}

function startWsHeartbeat(sock = wsClient) {
  stopWsHeartbeat();
  markWsAlive();
  if (!sock) return;
  wsHeartbeatTimer = setInterval(() => {
    try {
      if (!wsWantConnected) {
        stopWsHeartbeat();
        return;
      }
      if (!wsClient || wsClient !== sock) {
        stopWsHeartbeat();
        return;
      }
      if (sock.readyState !== WebSocket.OPEN) return;
      const now = Date.now();
      if (wsLastPongAt && (now - wsLastPongAt) > WS_HEARTBEAT_TIMEOUT_MS) {
        try { sock.close(); } catch {}
        return;
      }
      sock.send(JSON.stringify({
        type: 'ping',
        roomId: String(wsRoomId || sock.__roomId || ''),
        clientId: WS_CLIENT_ID,
        ts: now
      }));
    } catch (e) {
      console.warn('[WS] heartbeat failed', e);
    }
  }, WS_HEARTBEAT_INTERVAL_MS);
}

function disconnectRoomWs() {
  wsWantConnected = false;
  stopRoomMembersPolling();
  stopWsHeartbeat();
  wsRoomId = '';
  wsLastPongAt = 0;
  wsPendingEnvelopes = [];
  try { clearTimeout(wsReconnectTimer); } catch {}
  wsReconnectTimer = null;
  if (wsClient) {
    try { wsClient.close(); } catch {}
    wsClient = null;
  }
}

window.__leaveCurrentRoomCleanup = async function __leaveCurrentRoomCleanup() {
  try { disconnectRoomWs(); } catch {}
  try { await stopSupabaseRealtimeChannels(); } catch {}
};

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
    markWsAlive();
    startWsHeartbeat(sock);
    try {
      sock.send(JSON.stringify({
        type: 'joinRoom',
        roomId: rid,
        clientId: WS_CLIENT_ID,
        transport: 'ws'
      }));
    } catch {}
    flushWsPendingEnvelopes(sock);
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

      if (msg.type === 'ping') {
        markWsAlive();
        try {
          if (sock.readyState === WebSocket.OPEN) {
            sock.send(JSON.stringify({
              type: 'pong',
              roomId: String(wsRoomId || sock.__roomId || ''),
              clientId: WS_CLIENT_ID,
              ts: Date.now()
            }));
          }
        } catch {}
        return;
      }
      if (msg.type === 'pong') {
        markWsAlive();
        return;
      }
      if (msg.type === 'joinedWsRoom') {
        markWsAlive();
        flushWsPendingEnvelopes(sock);
        return;
      }
      if (String(msg.type || '') === 'state' && msg.state) {
        try { rememberRoomStateShadow(msg.roomId || wsRoomId, msg.state); } catch {}
      }
      if (handleDetachedWsMessage(msg)) return;
      handleMessage(msg);
    } catch (e) {
      console.warn('[WS] bad message', e);
    }
  };

  sock.onclose = () => {
    if (wsClient === sock) wsClient = null;
    if (wsHeartbeatTimer) stopWsHeartbeat();
    wsLastPongAt = 0;
    if (!wsWantConnected || !wsRoomId) return;
    try { clearTimeout(wsReconnectTimer); } catch {}
    wsReconnectTimer = setTimeout(() => {
      if (wsWantConnected && wsRoomId) connectRoomWs(wsRoomId);
    }, WS_RECONNECT_DELAY_MS);
  };

  sock.onerror = (e) => {
    console.warn('[WS] error', e);
  };
}


async function stopSupabaseRealtimeChannels() {
  const channels = [
    typeof roomDbChannel !== 'undefined' ? roomDbChannel : null,
    typeof roomChannel !== 'undefined' ? roomChannel : null,
    window.roomTokensDbChannel || null,
    window.roomLogDbChannel || null,
    window.roomDiceDbChannel || null,
    window.roomMapMetaDbChannel || null,
    window.roomWallsDbChannel || null,
    window.roomMarksDbChannel || null,
    window.roomFogDbChannel || null,
    window.roomMusicDbChannel || null,
    roomMembersDbChannel || null
  ].filter(Boolean);

  for (const ch of channels) {
    try { await ch.unsubscribe(); } catch {}
  }

  try { roomDbChannel = null; } catch {}
  try { roomChannel = null; } catch {}
  try { window.roomTokensDbChannel = null; } catch {}
  try { window.roomLogDbChannel = null; } catch {}
  try { window.roomDiceDbChannel = null; } catch {}
  try { window.roomMapMetaDbChannel = null; } catch {}
  try { window.roomWallsDbChannel = null; } catch {}
  try { window.roomMarksDbChannel = null; } catch {}
  try { window.roomFogDbChannel = null; } catch {}
  try { window.roomMusicDbChannel = null; } catch {}
  try { roomMembersDbChannel = null; } catch {}
}

function stopRoomMembersPolling() {
  try { clearInterval(roomMembersPollTimer); } catch {}
  roomMembersPollTimer = null;
}

function startRoomMembersPolling(roomId) {
  // Presence is pushed via VPS WS snapshots.
  // Keep the helper for compatibility, but do not start periodic polling anymore.
  stopRoomMembersPolling();
  void roomId;
}

function sendWsEnvelope(msg, opts = {}) {
  try {
    if (!msg || typeof msg !== 'object') return false;
    if (!wsRoomId) return false;
    const nonce = String(opts.nonce || wsMakeNonce());
    const payload = {
      ...msg,
      roomId: String(msg.roomId || wsRoomId),
      __wsNonce: nonce,
      __fromWsClient: WS_CLIENT_ID,
      __optimisticApplied: !!opts.optimisticApplied
    };
    wsRememberNonce(nonce);

    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
      wsClient.send(JSON.stringify(payload));
      return true;
    }

    queueWsEnvelope(payload);
    if (wsWantConnected && wsRoomId) {
      connectRoomWs(wsRoomId);
      return true;
    }
    return false;
  } catch (e) {
    console.warn('[WS] send failed', e);
    return false;
  }
}

try { window.sendWsEnvelope = sendWsEnvelope; } catch {}
try { window.connectRoomWs = connectRoomWs; } catch {}
try { window.disconnectRoomWs = disconnectRoomWs; } catch {}
try { window.getWsRoomId = () => String(wsRoomId || ''); } catch {}

function handleDetachedWsMessage(msg) {
  try {
    if (!msg || typeof msg !== 'object') return false;
    const type = String(msg.type || '').trim();
    if (!type) return false;

    if (type === 'mapMetaRow') {
      _cacheMapMeta(msg.row || {});
      _refreshDetachedRoomView();
      return true;
    }
    if (type === 'mapMetaDelete') {
      const old = msg.row || {};
      const mapId = String(old.map_id || old.id || '').trim();
      if (mapId) {
        __roomDetachedCache.mapMetaById.delete(mapId);
        __roomDetachedCache.wallsByMap.delete(mapId);
        __roomDetachedCache.marksByMap.delete(mapId);
        __roomDetachedCache.fogByMap.delete(mapId);
      }
      _refreshDetachedRoomView();
      return true;
    }
    if (type === 'wallRow') {
      _cacheUpsertWallRow(msg.row || {});
      _refreshDetachedRoomView();
      return true;
    }
    if (type === 'wallDelete') {
      _cacheDeleteWallRow(msg.row || {});
      _refreshDetachedRoomView();
      return true;
    }
    if (type === 'markRow') {
      _cacheUpsertMarkRow(msg.row || {});
      _refreshDetachedRoomView();
      return true;
    }
    if (type === 'markDelete') {
      _cacheDeleteMarkRow(msg.row || {});
      _refreshDetachedRoomView();
      return true;
    }
    if (type === 'marksReplace') {
      const mapId = String(msg.mapId || '').trim();
      if (mapId) {
        const rows = Array.isArray(msg.rows) ? msg.rows : [];
        __roomDetachedCache.marksByMap.set(
          mapId,
          rows.map(_normalizeMarkPayload).filter(Boolean)
        );
      }
      _refreshDetachedRoomView();
      return true;
    }
    if (type === 'fogRow') {
      _cacheUpsertFogRow(msg.row || {});
      _refreshDetachedRoomView();
      return true;
    }
    if (type === 'fogDelete') {
      const mapId = String(msg.row?.map_id || '').trim();
      if (mapId) __roomDetachedCache.fogByMap.delete(mapId);
      _refreshDetachedRoomView();
      return true;
    }
    if (type === 'musicRow') {
      if (msg.row) _cacheMusicRow(msg.row);
      else __roomDetachedCache.music = null;
      _refreshDetachedRoomView();
      return true;
    }
    if (type === 'musicDelete') {
      __roomDetachedCache.music = null;
      _refreshDetachedRoomView();
      return true;
    }
    if (type === 'users' || type === 'usersSnapshot') {
      try { handleMessage({ type: 'users', users: Array.isArray(msg.users) ? msg.users : [] }); } catch {}
      return true;
    }
    if (type === 'tavernLogRow' && msg.row) {
      try { handleMessage({ type: 'tavernLogRow', row: msg.row }); } catch {}
      return true;
    }
    return false;
  } catch (e) {
    console.warn('[WS] detached message failed', e);
    return false;
  }
}


async function subscribeRoomDb(roomId) {
  if (!USE_SUPABASE_REALTIME) {
    await stopSupabaseRealtimeChannels();
    return null;
  }
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
  if (!USE_SUPABASE_REALTIME) {
    await stopSupabaseRealtimeChannels();
    return null;
  }
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
        try {
          const ev = String(payload?.eventType || '').toUpperCase();
          if (ev === 'DELETE') {
            const row = payload?.old;
            if (row) handleMessage({ type: 'tokenRowDeleted', row });
            return;
          }
          const row = payload?.new;
          if (row) handleMessage({ type: 'tokenRow', row });
        } catch {}
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
  if (!USE_SUPABASE_REALTIME) {
    await stopSupabaseRealtimeChannels();
    return null;
  }
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
  if (!USE_SUPABASE_REALTIME) {
    await stopSupabaseRealtimeChannels();
    return null;
  }
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

// ================== Detached low-frequency tables ==================
async function loadRoomMapMeta(roomId) {
  await ensureSupabaseReady();
  if (!roomId) return [];
  const { data, error } = await sbClient
    .from('room_map_meta')
    .select('*')
    .eq('room_id', roomId);
  if (error) throw error;
  return data || [];
}

async function loadRoomWalls(roomId) {
  await ensureSupabaseReady();
  if (!roomId) return [];
  const { data, error } = await sbClient
    .from('room_walls')
    .select('*')
    .eq('room_id', roomId);
  if (error) throw error;
  return data || [];
}

async function loadRoomMarks(roomId) {
  await ensureSupabaseReady();
  if (!roomId) return [];
  const { data, error } = await sbClient
    .from('room_marks')
    .select('*')
    .eq('room_id', roomId);
  if (error) {
    if (_isMissingColumnError(error, 'payload')) {
      throw new Error("room_marks schema is outdated: missing 'payload' jsonb column. Run the migration SQL before using detached marks.");
    }
    throw error;
  }
  return data || [];
}

async function loadRoomFog(roomId) {
  await ensureSupabaseReady();
  if (!roomId) return [];
  const { data, error } = await sbClient
    .from('room_fog')
    .select('*')
    .eq('room_id', roomId);
  if (error) throw error;
  return data || [];
}

async function loadRoomMusic(roomId) {
  await ensureSupabaseReady();
  if (!roomId) return null;
  const { data, error } = await sbClient
    .from('room_music_state')
    .select('*')
    .eq('room_id', roomId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function subscribeRoomMapMetaDb(roomId) {
  if (!USE_SUPABASE_REALTIME) {
    await stopSupabaseRealtimeChannels();
    return null;
  }
  await ensureSupabaseReady();
  if (window.roomMapMetaDbChannel) {
    try { await window.roomMapMetaDbChannel.unsubscribe(); } catch {}
    window.roomMapMetaDbChannel = null;
  }
  window.roomMapMetaDbChannel = sbClient
    .channel(`db-room_map_meta-${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_map_meta', filter: `room_id=eq.${roomId}` }, (payload) => {
      try {
        if (payload.eventType === 'DELETE') {
          const old = payload.old || {};
          const mapId = String(old.map_id || '').trim();
          if (mapId) {
            __roomDetachedCache.mapMetaById.delete(mapId);
            __roomDetachedCache.wallsByMap.delete(mapId);
            __roomDetachedCache.marksByMap.delete(mapId);
            __roomDetachedCache.fogByMap.delete(mapId);
          }
        } else {
          _cacheMapMeta(payload.new || {});
        }
        _refreshDetachedRoomView();
      } catch (e) { console.warn('room_map_meta realtime failed', e); }
    });
  await window.roomMapMetaDbChannel.subscribe();
}

async function subscribeRoomWallsDb(roomId) {
  if (!USE_SUPABASE_REALTIME) {
    await stopSupabaseRealtimeChannels();
    return null;
  }
  await ensureSupabaseReady();
  if (window.roomWallsDbChannel) {
    try { await window.roomWallsDbChannel.unsubscribe(); } catch {}
    window.roomWallsDbChannel = null;
  }
  window.roomWallsDbChannel = sbClient
    .channel(`db-room_walls-${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_walls', filter: `room_id=eq.${roomId}` }, (payload) => {
      try {
        if (payload.eventType === 'DELETE') _cacheDeleteWallRow(payload.old || {});
        else _cacheUpsertWallRow(payload.new || {});
        _refreshDetachedRoomView();
      } catch (e) { console.warn('room_walls realtime failed', e); }
    });
  await window.roomWallsDbChannel.subscribe();
}

async function subscribeRoomMarksDb(roomId) {
  if (!USE_SUPABASE_REALTIME) {
    await stopSupabaseRealtimeChannels();
    return null;
  }
  await ensureSupabaseReady();
  if (window.roomMarksDbChannel) {
    try { await window.roomMarksDbChannel.unsubscribe(); } catch {}
    window.roomMarksDbChannel = null;
  }
  window.roomMarksDbChannel = sbClient
    .channel(`db-room_marks-${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_marks', filter: `room_id=eq.${roomId}` }, (payload) => {
      try {
        if (payload.eventType === 'DELETE') _cacheDeleteMarkRow(payload.old || {});
        else _cacheUpsertMarkRow(payload.new || {});
        _refreshDetachedRoomView();
      } catch (e) { console.warn('room_marks realtime failed', e); }
    });
  await window.roomMarksDbChannel.subscribe();
}

async function subscribeRoomFogDb(roomId) {
  if (!USE_SUPABASE_REALTIME) {
    await stopSupabaseRealtimeChannels();
    return null;
  }
  await ensureSupabaseReady();
  if (window.roomFogDbChannel) {
    try { await window.roomFogDbChannel.unsubscribe(); } catch {}
    window.roomFogDbChannel = null;
  }
  window.roomFogDbChannel = sbClient
    .channel(`db-room_fog-${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_fog', filter: `room_id=eq.${roomId}` }, (payload) => {
      try {
        if (payload.eventType === 'DELETE') {
          const mapId = String(payload.old?.map_id || '').trim();
          if (mapId) __roomDetachedCache.fogByMap.delete(mapId);
        } else {
          _cacheUpsertFogRow(payload.new || {});
        }
        _refreshDetachedRoomView();
      } catch (e) { console.warn('room_fog realtime failed', e); }
    });
  await window.roomFogDbChannel.subscribe();
}

async function subscribeRoomMusicDb(roomId) {
  if (!USE_SUPABASE_REALTIME) {
    await stopSupabaseRealtimeChannels();
    return null;
  }
  await ensureSupabaseReady();
  if (window.roomMusicDbChannel) {
    try { await window.roomMusicDbChannel.unsubscribe(); } catch {}
    window.roomMusicDbChannel = null;
  }
  window.roomMusicDbChannel = sbClient
    .channel(`db-room_music_state-${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_music_state', filter: `room_id=eq.${roomId}` }, (payload) => {
      try {
        if (payload.eventType === 'DELETE') __roomDetachedCache.music = null;
        else _cacheMusicRow(payload.new || {});
        _refreshDetachedRoomView();
      } catch (e) { console.warn('room_music realtime failed', e); }
    });
  await window.roomMusicDbChannel.subscribe();
}

async function hydrateDetachedRoomData(roomId) {
  await ensureSupabaseReady();
  resetDetachedRoomCache(roomId);
  const [metaRows, wallRows, markRows, fogRows, musicRow] = await Promise.all([
    loadRoomMapMeta(roomId).catch(() => []),
    loadRoomWalls(roomId).catch(() => []),
    loadRoomMarks(roomId).catch(() => []),
    loadRoomFog(roomId).catch(() => []),
    loadRoomMusic(roomId).catch(() => null)
  ]);
  (metaRows || []).forEach(_cacheMapMeta);
  _cacheWallRows(wallRows || []);
  _cacheMarkRows(markRows || []);
  _cacheFogRows(fogRows || []);
  if (musicRow) _cacheMusicRow(musicRow);
  _refreshDetachedRoomView();
}

async function subscribeDetachedRoomTables(roomId) {
  await Promise.all([
    subscribeRoomMapMetaDb(roomId),
    subscribeRoomWallsDb(roomId),
    subscribeRoomMarksDb(roomId),
    subscribeRoomFogDb(roomId),
    subscribeRoomMusicDb(roomId)
  ]);
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

        // v4+: visibility "eye" can be mirrored into room_tokens for reliable realtime updates.
        // But for GM-created non-allies the default is hidden, and the first placement on the board
        // must not silently flip the token to public if the inserted token row comes back with is_public=true.
        // Accept public=true only if local state is already public (for example after an explicit eye toggle).
        if (isPublic !== null) {
          const ownerRole = String(p?.ownerRole || '').trim();
          const isGmOwnedNonAlly = (ownerRole === 'GM' && !p?.isAlly);
          const localIsPublic = !!p.isPublic;
          if (!isGmOwnedNonAlly || !isPublic || localIsPublic) {
            p.isPublic = isPublic;
          }
        }

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



function syncOptimisticPlayersToLocalState(snapshot) {
  try {
    if (typeof lastState === 'undefined' || !lastState || !Array.isArray(lastState.players)) return;
    const srcPlayers = Array.isArray(snapshot?.players) ? snapshot.players : [];
    if (!srcPlayers.length) return;

    const byId = new Map();
    srcPlayers.forEach((p) => {
      if (!p?.id) return;
      byId.set(String(p.id), p);
    });

    lastState.players.forEach((dst) => {
      if (!dst?.id) return;
      const src = byId.get(String(dst.id));
      if (!src) return;

      if (src.x === null || Number.isFinite(Number(src.x))) dst.x = (src.x === null || typeof src.x === 'undefined') ? null : Number(src.x);
      if (src.y === null || Number.isFinite(Number(src.y))) dst.y = (src.y === null || typeof src.y === 'undefined') ? null : Number(src.y);

      const size = Number(src.size);
      if (Number.isFinite(size) && size > 0) dst.size = size;

      if (typeof src.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(src.color)) dst.color = String(src.color);
      if (typeof src.mapId === 'string' && src.mapId.trim()) dst.mapId = String(src.mapId);
      if (typeof src.isPublic !== 'undefined') dst.isPublic = !!src.isPublic;

      if (typeof src.name === 'string' && src.name.trim()) dst.name = src.name;
      if (typeof src.ownerId !== 'undefined') dst.ownerId = src.ownerId;
      if (typeof src.ownerRole !== 'undefined') dst.ownerRole = src.ownerRole;
      if (typeof src.isBase !== 'undefined') dst.isBase = !!src.isBase;
      if (typeof src.isAlly !== 'undefined') dst.isAlly = !!src.isAlly;
      if (typeof src.inCombat !== 'undefined') dst.inCombat = !!src.inCombat;
      if (typeof src.hasRolledInitiative !== 'undefined') dst.hasRolledInitiative = !!src.hasRolledInitiative;
      if (typeof src.pendingInitiativeChoice !== 'undefined') dst.pendingInitiativeChoice = !!src.pendingInitiativeChoice;
      if (typeof src.willJoinNextRound !== 'undefined') dst.willJoinNextRound = !!src.willJoinNextRound;
      if (typeof src.initiative !== 'undefined') dst.initiative = src.initiative;
      if (typeof src.sheetUpdatedAt !== 'undefined') dst.sheetUpdatedAt = src.sheetUpdatedAt;
      if (typeof src.sheet !== 'undefined') {
        try { dst.sheet = deepClone(src.sheet); } catch { dst.sheet = src.sheet; }
      }
    });
  } catch (e) {
    console.warn('syncOptimisticPlayersToLocalState failed', e);
  }
}

function applyOptimisticPlayerVisuals(snapshot) {
  try {
    const st = snapshot || lastState;
    const list = Array.isArray(st?.players) ? st.players : [];
    list.forEach((p) => {
      try { setPlayerPosition?.(p); } catch {}
      try {
        const el = (typeof playerElements !== 'undefined') ? playerElements.get(String(p.id)) : null;
        if (el) updateHpBar?.(p, el);
      } catch {}
    });
    try { window.FogWar?.onTokenPositionsChanged?.(st); } catch {}
  } catch (e) {
    console.warn('applyOptimisticPlayerVisuals failed', e);
  }
}

async function upsertRoomMapMetaRow(roomId, map) {
  await ensureSupabaseReady();
  const m = map || {};
  const mapId = String(m.id || m.map_id || '').trim();
  if (!roomId || !mapId) return;
  const row = {
    room_id: roomId,
    map_id: mapId,
    name: String(m.name || 'Карта'),
    section_id: String(m.sectionId || m.section_id || '') || null,
    board_width: Math.max(5, Math.min(150, Number(m.boardWidth) || 10)),
    board_height: Math.max(5, Math.min(150, Number(m.boardHeight) || 10)),
    board_bg_url: m.boardBgUrl || m.boardBgDataUrl || null,
    board_bg_storage_path: m.boardBgStoragePath || null,
    board_bg_storage_bucket: m.boardBgStorageBucket || null,
    grid_alpha: Number.isFinite(Number(m.gridAlpha)) ? clamp(Number(m.gridAlpha), 0, 1) : 1,
    wall_alpha: Number.isFinite(Number(m.wallAlpha)) ? clamp(Number(m.wallAlpha), 0, 1) : 1,
    updated_at: new Date().toISOString()
  };
  const { error } = await sbClient.from('room_map_meta').upsert(row, { onConflict: 'room_id,map_id' });
  if (error) throw error;
  _cacheMapMeta(row);
  try { sendWsEnvelope({ type: 'mapMetaRow', roomId: String(roomId || ''), row }, { optimisticApplied: true }); } catch {}
}

async function deleteRoomMapCascade(roomId, mapId) {
  await ensureSupabaseReady();
  const rid = String(roomId || '');
  const mid = String(mapId || '');
  if (!rid || !mid) return;
  await Promise.all([
    sbClient.from('room_map_meta').delete().eq('room_id', rid).eq('map_id', mid),
    sbClient.from('room_walls').delete().eq('room_id', rid).eq('map_id', mid),
    sbClient.from('room_marks').delete().eq('room_id', rid).eq('map_id', mid),
    sbClient.from('room_fog').delete().eq('room_id', rid).eq('map_id', mid),
    sbClient.from('room_tokens').delete().eq('room_id', rid).eq('map_id', mid)
  ]);
  __roomDetachedCache.mapMetaById.delete(mid);
  __roomDetachedCache.wallsByMap.delete(mid);
  __roomDetachedCache.marksByMap.delete(mid);
  __roomDetachedCache.fogByMap.delete(mid);
  try { sendWsEnvelope({ type: 'mapMetaDelete', roomId: rid, row: { map_id: mid } }, { optimisticApplied: true }); } catch {}
}

async function clearRoomMapPlayfield(roomId, mapLike, opts = {}) {
  await ensureSupabaseReady();
  const rid = String(roomId || '');
  const mid = String(mapLike?.id || mapLike?.map_id || '').trim();
  if (!rid || !mid) return;

  const boardW = Math.max(5, Math.min(150, Number(mapLike?.boardWidth || mapLike?.board_width) || 10));
  const boardH = Math.max(5, Math.min(150, Number(mapLike?.boardHeight || mapLike?.board_height) || 10));
  const clearTokens = opts.clearTokens !== false;
  const clearWalls = opts.clearWalls !== false;
  const clearMarks = opts.clearMarks !== false;
  const resetFog = opts.resetFog !== false;

  const prevWalls = clearWalls && Array.isArray(__roomDetachedCache.wallsByMap.get(mid)) ? [...__roomDetachedCache.wallsByMap.get(mid)] : [];
  const tasks = [];
  if (clearWalls) tasks.push(sbClient.from('room_walls').delete().eq('room_id', rid).eq('map_id', mid));
  if (clearMarks) tasks.push(sbClient.from('room_marks').delete().eq('room_id', rid).eq('map_id', mid));
  if (clearTokens) tasks.push(sbClient.from('room_tokens').delete().eq('room_id', rid).eq('map_id', mid));

  if (resetFog) {
    const emptyFog = {
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
    const row = buildDetachedFogRow(rid, mid, emptyFog, boardW, boardH);
    tasks.push(sbClient.from('room_fog').upsert(row, { onConflict: 'room_id,map_id' }));
    _cacheUpsertFogRow(row);
  }

  await Promise.all(tasks);

  if (clearWalls) __roomDetachedCache.wallsByMap.set(mid, []);
  if (clearMarks) __roomDetachedCache.marksByMap.set(mid, []);

  if (clearWalls) {
    prevWalls.forEach((w) => {
      try {
        sendWsEnvelope({ type: 'wallDelete', roomId: rid, row: { map_id: mid, x: Number(w?.x) || 0, y: Number(w?.y) || 0, dir: String(w?.dir || '').toUpperCase() } }, { optimisticApplied: true });
      } catch {}
    });
  }
  if (clearMarks) {
    try { sendWsEnvelope({ type: 'marksReplace', roomId: rid, mapId: mid, rows: [] }, { optimisticApplied: true }); } catch {}
  }
  if (resetFog) {
    try {
      const emptyFogRow = buildDetachedFogRow(rid, mid, {
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
      }, boardW, boardH);
      sendWsEnvelope({ type: 'fogRow', roomId: rid, row: emptyFogRow }, { optimisticApplied: true });
    } catch {}
  }
}

async function upsertRoomWallsEdges(roomId, mapId, mode, edges) {
  await ensureSupabaseReady();
  const rid = String(roomId || '');
  const mid = String(mapId || '');
  const list = Array.isArray(edges) ? edges : [];
  if (!rid || !mid || !list.length) return;
  const clean = [];
  for (const e of list) {
    const x = Number(e?.x), y = Number(e?.y);
    const dir = String(e?.dir || '').toUpperCase();
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (!(dir === 'N' || dir === 'E' || dir === 'S' || dir === 'W')) continue;
    clean.push({
      room_id: rid,
      map_id: mid,
      x,
      y,
      dir,
      wall_type: String(e?.type || 'stone'),
      thickness: Math.max(1, Math.min(12, Number(e?.thickness) || 4)),
      updated_at: new Date().toISOString()
    });
  }
  if (!clean.length) return;
  if (String(mode) === 'remove') {
    for (const row of clean) {
      const { error } = await sbClient.from('room_walls').delete().eq('room_id', rid).eq('map_id', mid).eq('x', row.x).eq('y', row.y).eq('dir', row.dir);
      if (error) throw error;
      _cacheDeleteWallRow(row);
      try { sendWsEnvelope({ type: 'wallDelete', roomId: rid, row }, { optimisticApplied: true }); } catch {}
    }
  } else {
    const { error } = await sbClient.from('room_walls').upsert(clean, { onConflict: 'room_id,map_id,x,y,dir' });
    if (error) throw error;
    clean.forEach((row) => {
      _cacheUpsertWallRow(row);
      try { sendWsEnvelope({ type: 'wallRow', roomId: rid, row }, { optimisticApplied: true }); } catch {}
    });
  }
}

function buildDetachedFogRow(roomId, mapId, fog, boardW, boardH) {
  const f = (fog && typeof fog === 'object') ? deepClone(fog) : {};
  const settings = {
    enabled: !!f.enabled,
    mode: (f.mode === 'dynamic') ? 'dynamic' : 'manual',
    manualBase: (f.manualBase === 'reveal') ? 'reveal' : 'hide',
    visionRadius: Number.isFinite(Number(f.visionRadius)) ? clamp(Number(f.visionRadius), 1, 60) : 8,
    useWalls: typeof f.useWalls === 'boolean' ? f.useWalls : true,
    exploredEnabled: typeof f.exploredEnabled === 'boolean' ? f.exploredEnabled : true,
    gmViewMode: (f.gmViewMode === 'player') ? 'player' : 'gm',
    gmOpen: typeof f.gmOpen === 'boolean' ? f.gmOpen : false,
    moveOnlyExplored: typeof f.moveOnlyExplored === 'boolean' ? f.moveOnlyExplored : false
  };
  const exploredPacked = String(f.exploredPacked || packFogExplored(Array.isArray(f.explored) ? f.explored : [], Number(boardW) || 10, Number(boardH) || 10) || '');
  return {
    room_id: String(roomId || ''),
    map_id: String(mapId || ''),
    settings,
    manual_stamps: Array.isArray(f.manualStamps) ? deepClone(f.manualStamps).slice(-5000) : [],
    explored_packed: exploredPacked,
    updated_at: new Date().toISOString()
  };
}

async function upsertRoomFogState(roomId, mapId, fog, boardW, boardH) {
  await ensureSupabaseReady();
  const row = buildDetachedFogRow(roomId, mapId, fog, boardW, boardH);
  if (!row.room_id || !row.map_id) return;
  const { error } = await sbClient.from('room_fog').upsert(row, { onConflict: 'room_id,map_id' });
  if (error) throw error;
  _cacheUpsertFogRow(row);
  try { sendWsEnvelope({ type: 'fogRow', roomId: row.room_id, row }, { optimisticApplied: true }); } catch {}
}

let __pendingFogTimer = null;
let __pendingFogRow = null;
function scheduleRoomFogUpsert(roomId, mapId, fog, boardW, boardH, delay = 180) {
  __pendingFogRow = buildDetachedFogRow(roomId, mapId, fog, boardW, boardH);
  if (__pendingFogTimer) return;
  __pendingFogTimer = setTimeout(async () => {
    const row = __pendingFogRow;
    __pendingFogTimer = null;
    __pendingFogRow = null;
    try {
      if (!row?.room_id || !row?.map_id) return;
      const { error } = await sbClient.from('room_fog').upsert(row, { onConflict: 'room_id,map_id' });
      if (error) throw error;
      _cacheUpsertFogRow(row);
      try { sendWsEnvelope({ type: 'fogRow', roomId: row.room_id, row }, { optimisticApplied: true }); } catch {}
      _refreshDetachedRoomView();
    } catch (e) {
      console.warn('coalesced fog upsert failed', e);
    }
  }, Math.max(50, Number(delay) || 180));
}

async function upsertRoomMarkRow(roomId, mark) {
  await ensureSupabaseReady();
  const m = mark || {};
  const row = {
    room_id: String(roomId || ''),
    map_id: String(m.mapId || ''),
    mark_id: String(m.id || ''),
    owner_id: String(m.ownerId || '') || null,
    kind: String(m.kind || ''),
    payload: deepClone(m),
    updated_at: new Date().toISOString()
  };
  if (!row.room_id || !row.map_id || !row.mark_id || !row.kind) return;
  const { error } = await sbClient.from('room_marks').upsert(row, { onConflict: 'room_id,map_id,mark_id' });
  if (error) {
    if (_isMissingColumnError(error, 'payload')) {
      throw new Error("room_marks schema is outdated: missing 'payload' jsonb column. Run the migration SQL before using detached marks.");
    }
    throw error;
  }
  _cacheUpsertMarkRow(row);
  try { sendWsEnvelope({ type: 'markRow', roomId: row.room_id, row }, { optimisticApplied: true }); } catch {}
}

async function deleteRoomMarkRow(roomId, mapId, markId) {
  await ensureSupabaseReady();
  const rid = String(roomId || '');
  const mid = String(mapId || '');
  const id = String(markId || '');
  if (!rid || !mid || !id) return;
  const { error } = await sbClient.from('room_marks').delete().eq('room_id', rid).eq('map_id', mid).eq('mark_id', id);
  if (error) throw error;
  const row = { map_id: mid, mark_id: id };
  _cacheDeleteMarkRow(row);
  try { sendWsEnvelope({ type: 'markDelete', roomId: rid, row }, { optimisticApplied: true }); } catch {}
}

async function clearRoomMarks(roomId, mapId, ownerId = null) {
  await ensureSupabaseReady();
  let q = sbClient.from('room_marks').delete().eq('room_id', String(roomId || '')).eq('map_id', String(mapId || ''));
  if (ownerId) q = q.eq('owner_id', String(ownerId));
  const { error } = await q;
  if (error) throw error;
  if (ownerId) {
    const list = Array.isArray(__roomDetachedCache.marksByMap.get(String(mapId || ''))) ? __roomDetachedCache.marksByMap.get(String(mapId || '')) : [];
    __roomDetachedCache.marksByMap.set(String(mapId || ''), list.filter(m => String(m?.ownerId || '') !== String(ownerId)));
  } else {
    __roomDetachedCache.marksByMap.set(String(mapId || ''), []);
  }
  try {
    const rows = (Array.isArray(__roomDetachedCache.marksByMap.get(String(mapId || ''))) ? __roomDetachedCache.marksByMap.get(String(mapId || '')) : []).map((m) => ({
      room_id: String(roomId || ''),
      map_id: String(mapId || ''),
      mark_id: String(m?.id || ''),
      owner_id: String(m?.ownerId || '') || null,
      kind: String(m?.kind || ''),
      payload: deepClone(m),
      updated_at: new Date().toISOString()
    }));
    sendWsEnvelope({ type: 'marksReplace', roomId: String(roomId || ''), mapId: String(mapId || ''), rows }, { optimisticApplied: true });
  } catch {}
}

async function upsertRoomMusicState(roomId, bgMusic) {
  await ensureSupabaseReady();
  const row = {
    room_id: String(roomId || ''),
    payload: deepClone(bgMusic || { tracks: [], currentTrackId: null, isPlaying: false, volume: 40 }),
    updated_at: new Date().toISOString()
  };
  if (!row.room_id) return;
  const { error } = await sbClient.from('room_music_state').upsert(row, { onConflict: 'room_id' });
  if (error) throw error;
  _cacheMusicRow(row);
  try { sendWsEnvelope({ type: 'musicRow', roomId: row.room_id, row }, { optimisticApplied: true }); } catch {}
}


function applyTokenDeleteToLocalState(row) {
  try {
    if (!row) return;
    const tokenId = String(row.token_id || '').trim();
    if (!tokenId) return;

    if (typeof lastState !== 'undefined' && lastState && Array.isArray(lastState.players)) {
      const p = lastState.players.find(pp => String(pp?.id) === tokenId);
      if (p) {
        p.x = null;
        p.y = null;
      }
    }

    try {
      const el = (typeof playerElements !== 'undefined') ? playerElements.get(tokenId) : null;
      if (el) {
        try { el.remove(); } catch {}
        try { playerElements.delete(tokenId); } catch {}
      }
    } catch {}

    try {
      const bars = (typeof hpBarElements !== 'undefined') ? hpBarElements.get(tokenId) : null;
      try { bars?.main?.remove?.(); } catch {}
      try { bars?.temp?.remove?.(); } catch {}
      try { hpBarElements.delete(tokenId); } catch {}
    } catch {}

    try {
      window.FogWar?.onTokenPositionsChanged?.(lastState);
      if (lastState) renderBoard?.(lastState);
    } catch {}
  } catch {}
}

async function ensureDetachedBootstrap(roomId, fullState) {
  await ensureSupabaseReady();
  const st = ensureStateHasMaps(deepClone(fullState));
  const maps = Array.isArray(st.maps) ? st.maps : [];

  // IMPORTANT: bootstrap must be idempotent.
  // Joining a room must not overwrite already detached fog/marks/music with slim defaults from room_state.
  const [metaRows, wallRows, markRows, fogRows, musicRow] = await Promise.all([
    loadRoomMapMeta(roomId).catch(() => []),
    loadRoomWalls(roomId).catch(() => []),
    loadRoomMarks(roomId).catch(() => []),
    loadRoomFog(roomId).catch(() => []),
    loadRoomMusic(roomId).catch(() => null)
  ]);

  const metaMap = new Map((Array.isArray(metaRows) ? metaRows : []).map(r => [String(r?.map_id || ''), r]));
  const fogMap = new Map((Array.isArray(fogRows) ? fogRows : []).map(r => [String(r?.map_id || ''), r]));
  const wallMapIds = new Set((Array.isArray(wallRows) ? wallRows : []).map(r => String(r?.map_id || '')).filter(Boolean));
  const markMapIds = new Set((Array.isArray(markRows) ? markRows : []).map(r => String(r?.map_id || '')).filter(Boolean));

  for (const m of maps) {
    if (!m || !m.id) continue;
    const mapId = String(m.id || '');
    if (!metaMap.has(mapId)) {
      await upsertRoomMapMetaRow(roomId, m);
    }
    if (!fogMap.has(mapId)) {
      await upsertRoomFogState(roomId, mapId, m.fog || {}, m.boardWidth, m.boardHeight);
    }
    const walls = Array.isArray(m.walls) ? m.walls.filter(w => String(w?.dir || '').toUpperCase()) : [];
    if (walls.length && !wallMapIds.has(mapId)) {
      await upsertRoomWallsEdges(roomId, mapId, 'add', walls);
    }
    const marks = Array.isArray(m.marks) ? m.marks : [];
    if (marks.length && !markMapIds.has(mapId)) {
      for (const mk of marks) { await upsertRoomMarkRow(roomId, mk); }
    }
  }
  if (!musicRow) {
    await upsertRoomMusicState(roomId, st.bgMusic || { tracks: [], currentTrackId: null, isPlaying: false, volume: 40 });
  }
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


function buildDiceLogText(ev) {
  try {
    if (!ev || typeof ev !== 'object') return '';
    const who = String(ev.fromName || '').trim() || 'Игрок';
    const kind = String(ev.kindText || '').trim() || ((Number(ev.sides) || 0) ? `d${Number(ev.sides)}` : 'Бросок');
    const rolls = Array.isArray(ev.rolls) ? ev.rolls.map(n => Number(n)).filter(Number.isFinite) : [];
    const rollsTxt = rolls.length ? rolls.join(',') : '';
    const bonus = Number(ev.bonus) || 0;
    const bonusTxt = bonus === 0 ? '' : (bonus > 0 ? `+${bonus}` : `${bonus}`);
    const hasTotal = ev.total !== null && typeof ev.total !== 'undefined' && Number.isFinite(Number(ev.total));
    const totalTxt = hasTotal ? ` = ${Number(ev.total)}` : '';
    const critTxt = String(ev.crit || '') === 'crit-success'
      ? ' (КРИТ)'
      : (String(ev.crit || '') === 'crit-fail' ? ' (ПРОВАЛ)' : '');
    const body = rollsTxt ? `${rollsTxt}${bonusTxt}${totalTxt}` : (hasTotal ? String(Number(ev.total)) : '');
    return `${who}: ${kind}: ${body}${critTxt}`.trim();
  } catch {
    return '';
  }
}
try { window.buildDiceLogText = buildDiceLogText; } catch {}

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
try { window.insertDiceEvent = insertDiceEvent; } catch {}

async function broadcastDiceEventOnly(event) {
  try {
    if (!event || !currentRoomId) return;
    const ev = { ...(event || {}) };
    if (typeof myId !== 'undefined' && !ev.fromId) ev.fromId = String(myId);
    if (myNameSpan?.textContent && !ev.fromName) ev.fromName = String(myNameSpan.textContent);

    const line = buildDiceLogText(ev);
    const logRow = line ? { text: line, created_at: new Date().toISOString() } : null;

    await insertDiceEvent(currentRoomId, ev);

    if (logRow) {
      try { handleMessage({ type: 'logRow', row: logRow }); } catch {}
    }
    try { handleMessage({ type: 'diceEvent', event: ev }); } catch {}

    if (!USE_SUPABASE_REALTIME) {
      try { sendWsEnvelope({ type: 'diceEvent', roomId: currentRoomId, event: ev }, { optimisticApplied: true }); } catch {}
      if (logRow) {
        try { sendWsEnvelope({ type: 'logRow', roomId: currentRoomId, row: logRow }, { optimisticApplied: true }); } catch {}
      }
    }
  } catch (e) {
    console.warn('broadcastDiceEventOnly failed', e);
  }
}
try { window.broadcastDiceEventOnly = broadcastDiceEventOnly; } catch {}

let roomMembersDbChannel = null;

async function refreshRoomMembers(roomId, opts = {}) {
  await ensureSupabaseReady();
  if (!roomId) return [];

  const { data, error } = await sbClient
    .from("room_members")
    .select("user_id,name,role")
    .eq("room_id", roomId);

  if (error) {
    console.error("room_members load error", error);
    return [];
  }

  usersById.clear();
  const users = [];
  (data || []).forEach((m) => {
    const uid = String(m.user_id || "");
    if (!uid) return;
    const row = {
      id: uid,
      name: m.name || "Unknown",
      role: normalizeRoleForUi(m.role)
    };
    users.push(row);
    usersById.set(uid, {
      name: row.name,
      role: row.role
    });
  });

  updatePlayerList();
  try { window.RoomChat?.refreshUsers?.(); } catch {}

  const shouldBroadcast = !!opts?.broadcast && !!wsRoomId && !!wsClient && wsClient.readyState === WebSocket.OPEN;
  if (shouldBroadcast) {
    try {
      sendWsEnvelope({ type: 'users', roomId: String(roomId || ''), users }, { optimisticApplied: true });
    } catch {}
  }

  return users;
}

async function subscribeRoomMembersDb(roomId) {
  if (!USE_SUPABASE_REALTIME) {
    await stopSupabaseRealtimeChannels();
    return null;
  }
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
          try { window.RoomChat?.refreshUsers?.(); } catch {}
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

        const roomIds = (data || []).map((r) => String(r?.id || '')).filter(Boolean);
        const passwordByRoomId = new Map();
        try {
          if (roomIds.length) {
            const { data: roomStates, error: rsErr } = await sbClient
              .from('room_state')
              .select('room_id,state')
              .in('room_id', roomIds);
            if (rsErr) throw rsErr;
            (roomStates || []).forEach((row) => {
              const rid = String(row?.room_id || '');
              if (!rid) return;
              passwordByRoomId.set(rid, hasRoomPasswordInState(row?.state));
            });
          }
        } catch (e) {
          console.warn('listRooms password lookup failed', e);
        }

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
            hasPassword: !!passwordByRoomId.get(rid)
          };
        });

        handleMessage({ type: "rooms", rooms, totalUsers: allUsers.size });
        break;
      }

      case "createRoom": {
        const roomId = (crypto?.randomUUID ? crypto.randomUUID() : ("r-" + Math.random().toString(16).slice(2)));
        const name = String(msg.name || "Комната").trim() || "Комната";
        const scenario = String(msg.scenario || "");
        const password = normalizeRoomPassword(msg.password || '');
        const { error: e1 } = await sbClient.from("rooms").insert({ id: roomId, name, scenario });
        if (e1) throw e1;

        const initState = createInitialGameState();
        initState.roomAccess = await buildRoomAccessState(password, initState);
        try {
          const creatorUserId = String(localStorage.getItem("dnd_user_id") || myId || "");
          const creatorRole = String(localStorage.getItem("dnd_user_role") || myRole || "");
          if (hasRoomPasswordInState(initState) && creatorUserId) {
            initState.roomAccess.authorizedUsers = initState.roomAccess.authorizedUsers || {};
            initState.roomAccess.authorizedUsers[creatorUserId] = {
              grantedAt: new Date().toISOString(),
              role: creatorRole || null
            };
          }
        } catch {}
        const { error: e2 } = await sbClient.from("room_state").insert({
          room_id: roomId,
          phase: initState.phase,
          current_actor_id: null,
          state: initState
        });
        if (e2) throw e2;
        try { await ensureDetachedBootstrap(roomId, initState); } catch (e) { console.warn('detached bootstrap createRoom failed', e); }

        // refresh list
        await sendMessage({ type: "listRooms" });
        break;
      }

      case "kickRoomUser": {
        const roomId = String(currentRoomId || msg.roomId || '').trim();
        const targetUserId = String(msg.targetUserId || '').trim();
        if (!roomId || !targetUserId) return;
        if (String(localStorage.getItem('dnd_user_role') || myRole || '') !== 'GM') return;

        const { data: room, error: roomErr } = await sbClient.from('rooms').select('id,name').eq('id', roomId).maybeSingle();
        if (roomErr) throw roomErr;
        const { data: rs, error: rsErr } = await sbClient.from('room_state').select('*').eq('room_id', roomId).maybeSingle();
        if (rsErr) throw rsErr;
        if (!rs) return;

        let nextState = deepClone(rs.state || createInitialGameState());
        const removedKick = removeRoomUserOwnedPlayers(nextState, targetUserId);
        nextState = removedKick.state;
        const moderationEvent = {
          id: (crypto?.randomUUID ? crypto.randomUUID() : ('mod-' + Math.random().toString(16).slice(2))),
          type: 'kick',
          targetUserId,
          roomId,
          roomName: String(room?.name || msg.roomName || 'Комната'),
          reason: '',
          bannedUntil: null,
          createdAt: new Date().toISOString(),
          actorUserId: String(localStorage.getItem('dnd_user_id') || myId || ''),
          actorName: safeGetUserName()
        };
        nextState = withRoomModerationEvent(nextState, moderationEvent);

        const currentActorKick = (typeof nextState?.current_actor_id !== 'undefined')
          ? nextState.current_actor_id
          : ((typeof rs?.current_actor_id !== 'undefined') ? rs.current_actor_id : null);
        const { error: updErr } = await sbClient.from('room_state').update({
          phase: String(rs?.phase || nextState?.phase || 'lobby'),
          current_actor_id: currentActorKick,
          state: nextState
        }).eq('room_id', roomId);
        if (updErr) throw updErr;

        try {
          await ensureSupabaseReady();
          const removedIds = Array.isArray(removedKick?.removedPlayerIds) ? removedKick.removedPlayerIds.filter(Boolean) : [];
          for (const tokenId of removedIds) {
            try {
              await sbClient.from('room_tokens').delete().eq('room_id', roomId).eq('token_id', String(tokenId));
            } catch (e) {
              console.warn('kickRoomUser room_tokens delete failed', e);
            }
          }
        } catch {}

        const { error: delErr } = await sbClient.from('room_members').delete().eq('room_id', roomId).eq('user_id', targetUserId);
        if (delErr) throw delErr;

        const publicStateKick = stripRoomSecretsFromState(nextState);
        try { handleMessage({ type: 'state', state: publicStateKick }); } catch {}
        try {
          const removedIds = Array.isArray(removedKick?.removedPlayerIds) ? removedKick.removedPlayerIds.filter(Boolean) : [];
          removedIds.forEach((tokenId) => {
            try { handleMessage({ type: 'tokenRowDeleted', row: { room_id: roomId, token_id: String(tokenId) } }); } catch {}
          });
        } catch {}
        try { sendWsEnvelope({ type: 'moderationEvent', roomId, event: moderationEvent }, { optimisticApplied: true }); } catch {}
        try { sendWsEnvelope({ type: 'state', roomId, state: publicStateKick }, { optimisticApplied: true }); } catch {}
        try {
          const removedIds = Array.isArray(removedKick?.removedPlayerIds) ? removedKick.removedPlayerIds.filter(Boolean) : [];
          removedIds.forEach((tokenId) => {
            try { sendWsEnvelope({ type: 'tokenRowDeleted', roomId, row: { room_id: roomId, token_id: String(tokenId) } }, { optimisticApplied: true }); } catch {}
          });
        } catch {}
        await refreshRoomMembers(roomId, { broadcast: true });
        break;
      }

      case "banRoomUser": {
        const roomId = String(currentRoomId || msg.roomId || '').trim();
        const targetUserId = String(msg.targetUserId || '').trim();
        if (!roomId || !targetUserId) return;
        if (String(localStorage.getItem('dnd_user_role') || myRole || '') !== 'GM') return;

        const hoursRaw = Number(msg.hours);
        const minutesRaw = Number(msg.minutes);
        const hours = Math.max(0, Math.min(24, Math.trunc(Number.isFinite(hoursRaw) ? hoursRaw : 0)));
        const minutes = Math.max(0, Math.min(59, Math.trunc(Number.isFinite(minutesRaw) ? minutesRaw : 0)));
        const totalMinutes = Math.max(1, (hours * 60) + minutes);
        const reason = String(msg.reason || '').trim() || 'Не указана';

        const { data: room, error: roomErr } = await sbClient.from('rooms').select('id,name').eq('id', roomId).maybeSingle();
        if (roomErr) throw roomErr;
        const { data: rs, error: rsErr } = await sbClient.from('room_state').select('*').eq('room_id', roomId).maybeSingle();
        if (rsErr) throw rsErr;
        if (!rs) return;

        const bannedUntilIso = new Date(Date.now() + totalMinutes * 60 * 1000).toISOString();
        try {
          const { error: banTblErr } = await sbClient
            .from('room_bans')
            .upsert({
              room_id: roomId,
              user_id: targetUserId,
              reason,
              banned_until: bannedUntilIso,
              banned_by_user_id: String(localStorage.getItem('dnd_user_id') || myId || ''),
              banned_by_name: safeGetUserName(),
              created_at: new Date().toISOString()
            }, { onConflict: 'room_id,user_id' });
          if (banTblErr) throw banTblErr;
        } catch (e) {
          console.warn('banRoomUser room_bans upsert failed', e);
        }

        let nextState = deepClone(rs.state || createInitialGameState());
        const removedBan = removeRoomUserOwnedPlayers(nextState, targetUserId);
        nextState = removedBan.state;
        nextState = withRoomBanUser(nextState, targetUserId, {
          reason,
          hours,
          minutes,
          totalMinutes,
          bannedAt: new Date().toISOString(),
          bannedUntil: bannedUntilIso,
          bannedByUserId: String(localStorage.getItem('dnd_user_id') || myId || ''),
          bannedByName: safeGetUserName()
        });
        const moderationEvent = {
          id: (crypto?.randomUUID ? crypto.randomUUID() : ('mod-' + Math.random().toString(16).slice(2))),
          type: 'ban',
          targetUserId,
          roomId,
          roomName: String(room?.name || msg.roomName || 'Комната'),
          reason,
          bannedUntil: bannedUntilIso,
          createdAt: new Date().toISOString(),
          actorUserId: String(localStorage.getItem('dnd_user_id') || myId || ''),
          actorName: safeGetUserName()
        };
        nextState = withRoomModerationEvent(nextState, moderationEvent);

        const currentActorBan = (typeof nextState?.current_actor_id !== 'undefined')
          ? nextState.current_actor_id
          : ((typeof rs?.current_actor_id !== 'undefined') ? rs.current_actor_id : null);
        const { error: updErr } = await sbClient.from('room_state').update({
          phase: String(rs?.phase || nextState?.phase || 'lobby'),
          current_actor_id: currentActorBan,
          state: nextState
        }).eq('room_id', roomId);
        if (updErr) throw updErr;

        try {
          await ensureSupabaseReady();
          const removedIds = Array.isArray(removedBan?.removedPlayerIds) ? removedBan.removedPlayerIds.filter(Boolean) : [];
          for (const tokenId of removedIds) {
            try {
              await sbClient.from('room_tokens').delete().eq('room_id', roomId).eq('token_id', String(tokenId));
            } catch (e) {
              console.warn('banRoomUser room_tokens delete failed', e);
            }
          }
        } catch {}

        const { error: delErr } = await sbClient.from('room_members').delete().eq('room_id', roomId).eq('user_id', targetUserId);
        if (delErr) throw delErr;

        const publicStateBan = stripRoomSecretsFromState(nextState);
        try { handleMessage({ type: 'state', state: publicStateBan }); } catch {}
        try {
          const removedIds = Array.isArray(removedBan?.removedPlayerIds) ? removedBan.removedPlayerIds.filter(Boolean) : [];
          removedIds.forEach((tokenId) => {
            try { handleMessage({ type: 'tokenRowDeleted', row: { room_id: roomId, token_id: String(tokenId) } }); } catch {}
          });
        } catch {}
        try { sendWsEnvelope({ type: 'moderationEvent', roomId, event: moderationEvent }, { optimisticApplied: true }); } catch {}
        try { sendWsEnvelope({ type: 'state', roomId, state: publicStateBan }, { optimisticApplied: true }); } catch {}
        try {
          const removedIds = Array.isArray(removedBan?.removedPlayerIds) ? removedBan.removedPlayerIds.filter(Boolean) : [];
          removedIds.forEach((tokenId) => {
            try { sendWsEnvelope({ type: 'tokenRowDeleted', roomId, row: { room_id: roomId, token_id: String(tokenId) } }, { optimisticApplied: true }); } catch {}
          });
        } catch {}
        await refreshRoomMembers(roomId, { broadcast: true });
        break;
      }

      case "joinRoom": {
        const roomId = String(msg.roomId || "");
        if (!roomId) return;

        const { data: room, error: er } = await sbClient.from("rooms").select("*").eq("id", roomId).single();
        if (er) throw er;

        let { data: rs, error: ers } = await sbClient.from("room_state").select("*").eq("room_id", roomId).maybeSingle();
        if (ers) throw ers;
        if (!rs) {
          const initState = createInitialGameState();
          await sbClient.from("room_state").insert({ room_id: roomId, phase: initState.phase, current_actor_id: null, state: initState });
          rs = { state: initState };
        }

        const providedPassword = normalizeRoomPassword(msg.password || '');

        // ===== Enforce roles: register membership + prevent multiple GMs =====
        const userId = String(localStorage.getItem("dnd_user_id") || myId || "");
        const role = String(localStorage.getItem("dnd_user_role") || myRole || "");

        try {
          await cleanupExpiredRoomBansTable(roomId, userId);
        } catch (e) {
          console.warn('joinRoom room_bans cleanup failed', e);
        }

        try {
          const cleanup = cleanupExpiredRoomBans(rs?.state);
          if (cleanup.changed) {
            rs.state = cleanup.state;
            await sbClient
              .from('room_state')
              .update({
                phase: String(rs?.phase || rs?.state?.phase || 'lobby'),
                current_actor_id: (typeof rs?.current_actor_id !== 'undefined') ? rs.current_actor_id : null,
                state: rs.state
              })
              .eq('room_id', roomId);
          }
        } catch (e) {
          console.warn('joinRoom ban cleanup failed', e);
        }

        const activeBanRow = await getActiveRoomBanRow(roomId, userId);
        if (activeBanRow) {
          const remaining = formatBanRemainingMs((Number(activeBanRow.bannedUntilMs) || Date.now()) - Date.now());
          const reason = String(activeBanRow.reason || '').trim() || 'Не указана';
          handleMessage({
            type: 'roomsError',
            message: `Вы забанены в комнате. Причина: ${reason}. До снятия бана: ${remaining}`
          });
          return;
        }

        const activeBan = getActiveRoomBanForUser(rs?.state, userId);
        if (activeBan) {
          const remaining = formatBanRemainingMs((Number(activeBan.bannedUntilMs) || Date.now()) - Date.now());
          const reason = String(activeBan.reason || '').trim() || 'Не указана';
          handleMessage({
            type: 'roomsError',
            message: `Вы забанены в комнате. Причина: ${reason}. До снятия бана: ${remaining}`
          });
          return;
        }

        const roomHasPassword = hasRoomPasswordInState(rs?.state);
        const alreadyAuthorized = roomHasPassword ? isUserAuthorizedForRoom(rs?.state, userId) : true;
        if (roomHasPassword && !alreadyAuthorized) {
          const expectedHash = getRoomPasswordHashFromState(rs?.state);
          const legacyPassword = getRoomLegacyPasswordFromState(rs?.state);
          let isValidPassword = false;
          if (expectedHash) {
            isValidPassword = !!providedPassword && (await sha256Hex(providedPassword)) === expectedHash;
          } else if (legacyPassword) {
            isValidPassword = providedPassword === legacyPassword;
          }

          if (!isValidPassword) {
            handleMessage({
              type: 'roomsError',
              message: 'Неверный пароль комнаты.'
            });
            return;
          }

          rs.state = withAuthorizedRoomUser(rs.state, userId, role);
          if (legacyPassword) {
            rs.state.roomAccess = await buildRoomAccessState(legacyPassword, rs.state);
            rs.state = withAuthorizedRoomUser(rs.state, userId, role);
          }
          try {
            const phaseToSave = String(rs?.phase || rs?.state?.phase || 'lobby');
            const actorToSave = (typeof rs?.current_actor_id !== 'undefined') ? rs.current_actor_id : null;
            const { error: saveRoomAccessErr } = await sbClient
              .from('room_state')
              .update({
                phase: phaseToSave,
                current_actor_id: actorToSave,
                state: rs.state
              })
              .eq('room_id', roomId);
            if (saveRoomAccessErr) throw saveRoomAccessErr;
          } catch (e) {
            console.warn('joinRoom mini lobby auth persist failed', e);
          }
        }

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
        try { await ensureDetachedBootstrap(roomId, rs.state); } catch (e) { console.warn('detached bootstrap joinRoom failed', e); }

        if (USE_SUPABASE_REALTIME) {
          await subscribeRoomDb(roomId);
          // v4: dedicated realtime tables
          try { await subscribeRoomTokensDb(roomId); } catch (e) { console.warn('tokens subscribe failed', e); }
          try { await subscribeRoomLogDb(roomId); } catch (e) { console.warn('log subscribe failed', e); }
          try { await subscribeRoomDiceDb(roomId); } catch (e) { console.warn('dice subscribe failed', e); }
          try { await subscribeDetachedRoomTables(roomId); } catch (e) { console.warn('detached subscribe failed', e); }
          await subscribeRoomMembersDb(roomId);
        } else {
          try { await stopSupabaseRealtimeChannels(); } catch (e) { console.warn('disable supabase realtime failed', e); }
        }
        try { await hydrateDetachedRoomData(roomId); } catch (e) { console.warn('detached init failed', e); }
        await refreshRoomMembers(roomId, { broadcast: true });
        startRoomMembersPolling(roomId);
        const __initialStateApplied = applyDetachedPayloadToState(rs.state);
        try { rememberRoomStateShadow(roomId, __initialStateApplied); } catch {}
        handleMessage({ type: "state", state: stripRoomSecretsFromState(__initialStateApplied) });

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
        const diceLogText = buildDiceLogText(ev);
        const logRow = diceLogText ? { text: diceLogText, created_at: new Date().toISOString() } : null;
        await insertDiceEvent(currentRoomId, ev);
        try {
          sendWsEnvelope({ type: 'diceEvent', roomId: currentRoomId, event: ev }, { optimisticApplied: true });
        } catch {}
        if (logRow) {
          try { handleMessage({ type: 'logRow', row: logRow }); } catch {}
          if (!USE_SUPABASE_REALTIME) {
            try { sendWsEnvelope({ type: 'logRow', roomId: currentRoomId, row: logRow }, { optimisticApplied: true }); } catch {}
          }
        }
        // apply to self instantly (others will receive via realtime INSERT / WS)
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
        try { p.sheetUpdatedAt = Date.now(); } catch {}
        try {
          const parsed = p.sheet?.parsed;
          const nextName = parsed?.name?.value ?? parsed?.name;
          if (typeof nextName === "string" && nextName.trim()) p.name = nextName.trim();
        } catch {}

        try {
          handleMessage({ type: 'state', state: syncActiveToMap(deepClone(next)) });
        } catch {}

        await upsertRoomState(currentRoomId, next);
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

  try {
    handleMessage({ type: 'state', state: syncActiveToMap(deepClone(next)) });
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
          try {
            const existingIds = new Set((next.maps || []).map(m => String(m?.id || '')).filter(Boolean));
            for (const m of (next.maps || [])) {
              if (m && m.id) await upsertRoomMapMetaRow(currentRoomId, m);
            }
            const cachedIds = Array.from(__roomDetachedCache.mapMetaById.keys());
            for (const mid of cachedIds) {
              if (!existingIds.has(String(mid))) await deleteRoomMapCascade(currentRoomId, mid);
            }
          } catch (e) {
            console.warn('campaign map meta sync failed', e);
          }
          await upsertRoomState(currentRoomId, next);
          break;
        }

        if (type === "resizeBoard") {
          if (!isGM) return;
          next.boardWidth = msg.width;
          next.boardHeight = msg.height;
          logEventToState(next, "Поле изменено");
          try { syncActiveToMap(next); await upsertRoomMapMetaRow(currentRoomId, getActiveMap(next)); } catch (e) { console.warn('resizeBoard meta sync failed', e); }
        }

        else if (type === "startInitiative") {
          if (!isGM) return;
          try { clearPendingInitiativeOverlay(currentRoomId); } catch {}
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

          try {
            sendWsEnvelope({
              type: 'updateTokenColor',
              roomId: String(currentRoomId || ''),
              mapId: String(p?.mapId || next?.currentMapId || ''),
              tokenId: String(p.id),
              color: c
            }, { optimisticApplied: true });
          } catch (e) {
            console.warn('updateTokenColor ws send failed', e);
          }

          // Optimistic DOM update (current client). Others will update via VPS tokenRow/state.
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

          // Authoritative movement now goes through VPS.
          // Keep optimistic local update for instant UX, then wait for tokenRow from WS.
          try {
            if (p) { p.x = nx; p.y = ny; }
            try { setPlayerPosition?.(p); } catch {}
            try {
              const el = (typeof playerElements !== 'undefined') ? playerElements.get(String(p.id)) : null;
              if (el) updateHpBar?.(p, el);
            } catch {}

            try {
              const stNow = (typeof lastState !== 'undefined' && lastState) ? lastState : next;
              window.FogWar?.onTokenPositionsChanged?.(stNow);
              (stNow?.players || []).forEach(pp => { try { setPlayerPosition?.(pp); } catch {} });
            } catch {}
          } catch {}

          try {
            sendWsEnvelope({
              type: 'moveToken',
              roomId: String(currentRoomId || ''),
              mapId: String(next.currentMapId || ''),
              tokenId: String(p.id),
              tokenName: String(p.name || ''),
              actorUserId: String(myUserId || ''),
              x: nx,
              y: ny,
              isPublic: !!p?.isPublic
            }, { optimisticApplied: true });
          } catch (e) {
            console.warn('moveToken ws send failed', e);
            handleMessage({ type: 'error', message: 'Не удалось отправить перемещение на сервер' });
          }

          // IMPORTANT: movement is NOT persisted via room_state.
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

          try {
            sendWsEnvelope({
              type: 'updateTokenSize',
              roomId: String(currentRoomId || ''),
              mapId: String(p?.mapId || next?.currentMapId || ''),
              tokenId: String(p.id),
              size: newSize,
              isPublic: !!p?.isPublic
            }, { optimisticApplied: true });
          } catch (e) {
            console.warn('updateTokenSize ws send failed', e);
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

          try {
            sendWsEnvelope({
              type: 'removeTokenFromBoard',
              roomId: String(currentRoomId || ''),
              mapId: String(p?.mapId || next?.currentMapId || ''),
              tokenId: String(p.id),
              isPublic: !!p?.isPublic
            }, { optimisticApplied: true });
          } catch (e) {
            console.warn('removeTokenFromBoard ws send failed', e);
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
          if (!isGM) return;
          const mode = String(msg.mode || "");
          const edges = Array.isArray(msg.edges) ? msg.edges : [];
          const mapId = String(next.currentMapId || getActiveMap(next)?.id || '');
          if (!mapId || !edges.length) return;
          await upsertRoomWallsEdges(currentRoomId, mapId, mode, edges);
          try {
            if (typeof lastState !== 'undefined' && lastState) {
              lastState = applyDetachedPayloadToState(lastState);
            }
          } catch {}
          try { await insertRoomLog(currentRoomId, `Окружение: ${mode === 'remove' ? 'удалено' : 'добавлено'} ${edges.length} сегментов стен`); } catch {}
          _refreshDetachedRoomView();
          return;
        }

        else if (type === "addWall") {
          if (!isGM) return;
          const w = msg.wall;
          if (!w) return;
          const mapId = String(next.currentMapId || getActiveMap(next)?.id || '');
          if (!mapId) return;
          await upsertRoomWallsEdges(currentRoomId, mapId, 'add', [w]);
          try { await insertRoomLog(currentRoomId, `Стена добавлена (${Number(w?.x)},${Number(w?.y)},${String(w?.dir || '').toUpperCase()})`); } catch {}
          _refreshDetachedRoomView();
          return;
        }

        else if (type === "removeWall") {
          if (!isGM) return;
          const w = msg.wall;
          if (!w) return;
          const mapId = String(next.currentMapId || getActiveMap(next)?.id || '');
          if (!mapId) return;
          await upsertRoomWallsEdges(currentRoomId, mapId, 'remove', [w]);
          try { await insertRoomLog(currentRoomId, `Стена удалена (${Number(w?.x)},${Number(w?.y)},${String(w?.dir || '').toUpperCase()})`); } catch {}
          _refreshDetachedRoomView();
          return;
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
          try { syncActiveToMap(next); await upsertRoomMapMetaRow(currentRoomId, getActiveMap(next)); } catch (e) { console.warn('setBoardBg meta sync failed', e); }
        }

        else if (type === "clearBoardBg") {
          if (!isGM) return;
          next.boardBgDataUrl = null;
          next.boardBgUrl = null;
          next.boardBgStoragePath = null;
          next.boardBgStorageBucket = null;
          logEventToState(next, "Подложка карты очищена");
          try { syncActiveToMap(next); await upsertRoomMapMetaRow(currentRoomId, getActiveMap(next)); } catch (e) { console.warn('clearBoardBg meta sync failed', e); }
        }

        else if (type === "setGridAlpha") {
          if (!isGM) return;
          const a = Number(msg.alpha);
          next.gridAlpha = Number.isFinite(a) ? clamp(a, 0, 1) : 1;
          logEventToState(next, `Прозрачность клеток: ${Math.round((1 - next.gridAlpha) * 100)}%`);
          try { syncActiveToMap(next); await upsertRoomMapMetaRow(currentRoomId, getActiveMap(next)); } catch (e) { console.warn('setGridAlpha meta sync failed', e); }
        }

        else if (type === "setWallAlpha") {
          if (!isGM) return;
          const a = Number(msg.alpha);
          next.wallAlpha = Number.isFinite(a) ? clamp(a, 0, 1) : 1;
          logEventToState(next, `Прозрачность стен: ${Math.round((1 - next.wallAlpha) * 100)}%`);
          try { syncActiveToMap(next); await upsertRoomMapMetaRow(currentRoomId, getActiveMap(next)); } catch (e) { console.warn('setWallAlpha meta sync failed', e); }
        }



        // ===== Background Music (GM) =====
        else if (type === "bgMusicSet") {
          if (!isGM) return;
          const incoming = (msg.bgMusic && typeof msg.bgMusic === 'object') ? deepClone(msg.bgMusic) : { tracks: [], currentTrackId: null, isPlaying: false, volume: 40 };
          if (!Array.isArray(incoming.tracks)) incoming.tracks = [];
          incoming.tracks = incoming.tracks.slice(0, 10).map(t => ({
            id: String(t?.id || ''),
            name: String(t?.name || ''),
            desc: String(t?.desc || t?.description || ''),
            description: String(t?.description || t?.desc || ''),
            url: String(t?.url || ''),
            path: String(t?.path || ''),
            createdAt: String(t?.createdAt || '')
          })).filter(t => t.id && t.url);
          incoming.currentTrackId = incoming.currentTrackId ? String(incoming.currentTrackId) : null;
          incoming.isPlaying = !!incoming.isPlaying;
          incoming.volume = Number.isFinite(Number(incoming.volume)) ? clamp(Number(incoming.volume), 0, 100) : 40;
          await upsertRoomMusicState(currentRoomId, incoming);
          try { await insertRoomLog(currentRoomId, 'Фоновая музыка обновлена'); } catch {}
          _refreshDetachedRoomView();
          return;
        }

        // ===== Marks / Areas (everyone can draw; GM can remove all) =====
        // ===== Marks / Areas (everyone can draw; GM can remove all) =====
        else if (type === 'addMark') {
          const raw = msg.mark;
          if (!raw || typeof raw !== 'object') return;
          const m = getActiveMap(next);
          if (!m) return;
          const safe = deepClone(raw);
          safe.mapId = String(raw.mapId || next.currentMapId || m.id || '');
          safe.ownerId = String(raw.ownerId || myId || '');
          if (!safe.id || !safe.mapId || !safe.kind) return;
          await upsertRoomMarkRow(currentRoomId, safe);
          try { await insertRoomLog(currentRoomId, 'Обозначение добавлено'); } catch {}
          _refreshDetachedRoomView();
          return;
        }

        else if (type === 'removeMark') {
          const id = String(msg.id || '').trim();
          if (!id) return;
          const m = getActiveMap(next);
          if (!m) return;
          const mapId = String(next.currentMapId || m.id || '');
          const cached = Array.isArray(__roomDetachedCache.marksByMap.get(mapId)) ? __roomDetachedCache.marksByMap.get(mapId) : [];
          const mark = cached.find(mm => String(mm?.id || '') === id);
          if (!mark) return;
          if (!isGM && String(mark.ownerId || '') !== String(myId || '')) return;
          await deleteRoomMarkRow(currentRoomId, mapId, id);
          try { await insertRoomLog(currentRoomId, 'Обозначение удалено'); } catch {}
          _refreshDetachedRoomView();
          return;
        }

        else if (type === 'clearMarks') {
          const m = getActiveMap(next);
          if (!m) return;
          const mapId = String(next.currentMapId || m.id || '');
          const scope = String(msg.scope || 'mine');
          if (scope === 'all') {
            if (!isGM) return;
            await clearRoomMarks(currentRoomId, mapId, null);
            try { await insertRoomLog(currentRoomId, 'Обозначения очищены'); } catch {}
          } else {
            await clearRoomMarks(currentRoomId, mapId, String(myId || ''));
            try { await insertRoomLog(currentRoomId, 'Обозначения очищены (локально)'); } catch {}
          }
          _refreshDetachedRoomView();
          return;
        }

        // ===== Fog of war (GM controls) =====
        // ===== Fog of war (GM controls) =====
        else if (type === "setFogSettings") {
          if (!isGM) return;
          const mapId = String(next.currentMapId || getActiveMap(next)?.id || '');
          const meta = __roomDetachedCache.mapMetaById.get(mapId) || getActiveMap(next) || {};
          const currentFog = deepClone(__roomDetachedCache.fogByMap.get(mapId) || next.fog || {});
          if (typeof msg.enabled === 'boolean') currentFog.enabled = msg.enabled;
          if (msg.mode === 'manual' || msg.mode === 'dynamic') currentFog.mode = msg.mode;
          if (msg.manualBase === 'hide' || msg.manualBase === 'reveal') currentFog.manualBase = msg.manualBase;
          if (Number.isFinite(Number(msg.visionRadius))) currentFog.visionRadius = clamp(Number(msg.visionRadius), 1, 60);
          if (typeof msg.useWalls === 'boolean') currentFog.useWalls = msg.useWalls;
          if (typeof msg.exploredEnabled === 'boolean') currentFog.exploredEnabled = msg.exploredEnabled;
          if (typeof msg.gmOpen === 'boolean') currentFog.gmOpen = msg.gmOpen;
          if (typeof msg.moveOnlyExplored === 'boolean') currentFog.moveOnlyExplored = msg.moveOnlyExplored;
          if (msg.gmViewMode === 'gm' || msg.gmViewMode === 'player') currentFog.gmViewMode = msg.gmViewMode;
          if (!Array.isArray(currentFog.manualStamps)) currentFog.manualStamps = [];
          if (!Array.isArray(currentFog.explored)) currentFog.explored = [];
          await upsertRoomFogState(currentRoomId, mapId, currentFog, meta.boardWidth || next.boardWidth, meta.boardHeight || next.boardHeight);
          try { await insertRoomLog(currentRoomId, `Туман войны: ${currentFog.enabled ? 'ВКЛ' : 'ВЫКЛ'} (${currentFog.mode === 'dynamic' ? 'динамический' : 'ручной'})`); } catch {}
          _refreshDetachedRoomView();
          return;
        }

        else if (type === "fogStamp") {
          if (!isGM) return;
          const mapId = String(next.currentMapId || getActiveMap(next)?.id || '');
          const meta = __roomDetachedCache.mapMetaById.get(mapId) || getActiveMap(next) || {};
          const f = deepClone(__roomDetachedCache.fogByMap.get(mapId) || next.fog || { enabled: true, mode: 'manual', manualBase: 'hide', manualStamps: [], visionRadius: 8, useWalls: true, exploredEnabled: true, explored: [] });
          if (!Array.isArray(f.manualStamps)) f.manualStamps = [];
          const x = Number(msg.x), y = Number(msg.y), r = Number(msg.r);
          const mode = String(msg.mode || 'reveal');
          if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(r)) return;
          f.manualStamps.push({ x, y, r: clamp(r, 1, 40), mode: (mode === 'hide' ? 'hide' : 'reveal') });
          _cacheUpsertFogRow(buildDetachedFogRow(currentRoomId, mapId, f, meta.boardWidth || next.boardWidth, meta.boardHeight || next.boardHeight));
          _refreshDetachedRoomView();
          scheduleRoomFogUpsert(currentRoomId, mapId, f, meta.boardWidth || next.boardWidth, meta.boardHeight || next.boardHeight, 140);
          return;
        }

        else if (type === "fogStampBatch") {
          if (!isGM) return;
          const mapId = String(next.currentMapId || getActiveMap(next)?.id || '');
          const meta = __roomDetachedCache.mapMetaById.get(mapId) || getActiveMap(next) || {};
          const f = deepClone(__roomDetachedCache.fogByMap.get(mapId) || next.fog || { enabled: true, mode: 'manual', manualBase: 'hide', manualStamps: [], visionRadius: 8, useWalls: true, exploredEnabled: true, explored: [] });
          if (!Array.isArray(f.manualStamps)) f.manualStamps = [];
          const stamps = Array.isArray(msg.stamps) ? msg.stamps : [];
          for (const s of stamps) {
            const x = Number(s?.x), y = Number(s?.y), r = Number(s?.r);
            const mode = (String(s?.mode || 'reveal') === 'hide') ? 'hide' : 'reveal';
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(r)) continue;
            f.manualStamps.push({ x, y, r: clamp(r, 1, 40), mode });
            if (f.manualStamps.length > 5000) break;
          }
          _cacheUpsertFogRow(buildDetachedFogRow(currentRoomId, mapId, f, meta.boardWidth || next.boardWidth, meta.boardHeight || next.boardHeight));
          _refreshDetachedRoomView();
          scheduleRoomFogUpsert(currentRoomId, mapId, f, meta.boardWidth || next.boardWidth, meta.boardHeight || next.boardHeight, 140);
          return;
        }

        else if (type === "fogStamp2") {
          if (!isGM) return;
          const mapId = String(next.currentMapId || getActiveMap(next)?.id || '');
          const meta = __roomDetachedCache.mapMetaById.get(mapId) || getActiveMap(next) || {};
          const f = deepClone(__roomDetachedCache.fogByMap.get(mapId) || next.fog || { enabled: true, mode: 'manual', manualBase: 'hide', manualStamps: [], visionRadius: 8, useWalls: true, exploredEnabled: true, explored: [] });
          if (!Array.isArray(f.manualStamps)) f.manualStamps = [];
          const s = (msg && typeof msg === 'object') ? msg.stamp : null;
          if (!s || typeof s !== 'object') return;
          const kind = String(s.kind || '').toLowerCase();
          const mode = (String(s.mode || 'reveal') === 'hide') ? 'hide' : 'reveal';
          if (kind === 'square') {
            const x = Number(s.x), y = Number(s.y), n = Number(s.n);
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(n)) return;
            f.manualStamps.push({ kind: 'square', x, y, n: clamp(n, 1, 10), mode });
          } else if (kind === 'rect') {
            const x1 = Number(s.x1), y1 = Number(s.y1), x2 = Number(s.x2), y2 = Number(s.y2);
            if (![x1,y1,x2,y2].every(Number.isFinite)) return;
            f.manualStamps.push({ kind: 'rect', x1, y1, x2, y2, mode });
          } else if (kind === 'circle') {
            const cx = Number(s.cx), cy = Number(s.cy), r = Number(s.r);
            if (![cx,cy,r].every(Number.isFinite)) return;
            f.manualStamps.push({ kind: 'circle', cx, cy, r: clamp(r, 0.1, 200), mode });
          } else if (kind === 'poly') {
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
          } else {
            return;
          }
          _cacheUpsertFogRow(buildDetachedFogRow(currentRoomId, mapId, f, meta.boardWidth || next.boardWidth, meta.boardHeight || next.boardHeight));
          _refreshDetachedRoomView();
          scheduleRoomFogUpsert(currentRoomId, mapId, f, meta.boardWidth || next.boardWidth, meta.boardHeight || next.boardHeight, 140);
          return;
        }

        else if (type === "fogFill") {
          if (!isGM) return;
          const mapId = String(next.currentMapId || getActiveMap(next)?.id || '');
          const meta = __roomDetachedCache.mapMetaById.get(mapId) || getActiveMap(next) || {};
          const f = deepClone(__roomDetachedCache.fogByMap.get(mapId) || next.fog || {});
          if (String(msg.value) === 'revealAll') f.manualBase = 'reveal';
          else f.manualBase = 'hide';
          f.manualStamps = [];
          await upsertRoomFogState(currentRoomId, mapId, f, meta.boardWidth || next.boardWidth, meta.boardHeight || next.boardHeight);
          try { await insertRoomLog(currentRoomId, `Туман войны: ${f.manualBase === 'reveal' ? 'Открыто всё' : 'Скрыто всё'}`); } catch {}
          _refreshDetachedRoomView();
          return;
        }

        else if (type === "fogClearExplored") {
          if (!isGM) return;
          const mapId = String(next.currentMapId || getActiveMap(next)?.id || '');
          const meta = __roomDetachedCache.mapMetaById.get(mapId) || getActiveMap(next) || {};
          const f = deepClone(__roomDetachedCache.fogByMap.get(mapId) || next.fog || {});
          f.exploredPacked = '';
          f.explored = [];
          await upsertRoomFogState(currentRoomId, mapId, f, meta.boardWidth || next.boardWidth, meta.boardHeight || next.boardHeight);
          try { await insertRoomLog(currentRoomId, 'Туман войны: очищено исследованное'); } catch {}
          _refreshDetachedRoomView();
          return;
        }

        else if (type === "fogSetExplored") {
          if (!isGM) return;
          const mapId = String(next.currentMapId || getActiveMap(next)?.id || '');
          const meta = __roomDetachedCache.mapMetaById.get(mapId) || getActiveMap(next) || {};
          const f = deepClone(__roomDetachedCache.fogByMap.get(mapId) || next.fog || {});
          const cells = Array.isArray(msg.cells) ? msg.cells : [];
          f.explored = cells;
          f.exploredPacked = packFogExplored(cells, meta.boardWidth || next.boardWidth, meta.boardHeight || next.boardHeight) || '';
          await upsertRoomFogState(currentRoomId, mapId, f, meta.boardWidth || next.boardWidth, meta.boardHeight || next.boardHeight);
          _refreshDetachedRoomView();
          return;
        }

        else if (type === "fogAddExplored") {
          if (!isGM) return;
          const mapId = String(next.currentMapId || getActiveMap(next)?.id || '');
          const meta = __roomDetachedCache.mapMetaById.get(mapId) || getActiveMap(next) || {};
          const f = deepClone(__roomDetachedCache.fogByMap.get(mapId) || next.fog || {});
          const set = new Set(Array.isArray(f.explored) ? f.explored : []);
          (Array.isArray(msg.cells) ? msg.cells : []).forEach(c => { if (c != null) set.add(String(c)); });
          f.explored = Array.from(set);
          f.exploredPacked = packFogExplored(f.explored, meta.boardWidth || next.boardWidth, meta.boardHeight || next.boardHeight) || '';
          _cacheUpsertFogRow(buildDetachedFogRow(currentRoomId, mapId, f, meta.boardWidth || next.boardWidth, meta.boardHeight || next.boardHeight));
          _refreshDetachedRoomView();
          scheduleRoomFogUpsert(currentRoomId, mapId, f, meta.boardWidth || next.boardWidth, meta.boardHeight || next.boardHeight, 320);
          return;
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

          // Immediately keep the local UI in sync even if a slightly stale room_state snapshot
          // arrives before the DB echo/WS refresh.
          try { rememberPendingInitiativeOverlay(currentRoomId, updates); } catch {}
          try {
            // IMPORTANT: prefer the live local state first, because room_state shadow intentionally
            // does not carry authoritative token x/y positions (they are stored in room_tokens).
            // If we start from room_state shadow here, src.x/src.y become null and
            // syncOptimisticPlayersToLocalState(...) can momentarily hide all tokens on the board.
            const optimisticBase = lastState || getRoomStateShadow(currentRoomId) || next;
            const optimistic = deepClone(optimisticBase);
            (optimistic.players || []).forEach((p) => {
              if (!p || !p.id) return;
              const u = updates.find(x => String(x?.playerId || '') === String(p.id));
              if (!u) return;
              p.initiative = Number(u.total);
              p.hasRolledInitiative = true;
              p.pendingInitiativeChoice = false;
            });
            try { syncOptimisticPlayersToLocalState(optimistic); } catch {}
            handleMessage({ type: 'state', state: optimistic });
          } catch (e) {
            console.warn('initiative optimistic apply failed', e);
          }

          // IMPORTANT: We already wrote to DB using the latest snapshot inside applyInitiativeAtomic.
          // Do NOT fall through to the generic upsert at the end of the handler (it would use stale 'next').
          return;
        }

        else if (type === "startCombat") {
          if (!isGM) return;
          try { clearPendingInitiativeOverlay(currentRoomId); } catch {}
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
          next.walls = [];
          try {
            const activeMap = getActiveMap(next);
            if (activeMap) {
              activeMap.walls = [];
              await clearRoomMapPlayfield(currentRoomId, activeMap, {
                clearTokens: false,
                clearWalls: true,
                clearMarks: false,
                resetFog: false
              });
              _refreshDetachedRoomView();
            }
          } catch (e) {
            console.warn('clearBoard detached clear failed', e);
          }
          logEventToState(next, "Стены на поле очищены");
        }

        else {
          // unknown message type (ignored)
          return;
        }

        try {
          // Supabase Realtime is disabled, so the local client must see state changes
          // immediately without waiting for a WS echo from the VPS.
          // Keep local volatile token/player fields in sync BEFORE message-ui snapshots
          // them, otherwise color/size/position can appear to rollback until the next
          // tokenRow or full refresh arrives.
          const optimisticState = syncActiveToMap(deepClone(next));
          try { syncOptimisticPlayersToLocalState(optimisticState); } catch {}
          handleMessage({ type: 'state', state: optimisticState });
          try { applyOptimisticPlayerVisuals(lastState || optimisticState); } catch {}
        } catch (e) {
          console.warn('optimistic state apply failed', e);
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
  const phase = String(state?.phase || '');
  const combatants = (state?.players || []).filter(p => p && p.inCombat);
  const allRolled = combatants.length
    ? combatants.every(p => p.hasRolledInitiative)
    : false;

  // сбрасываем подсветки
  startExplorationBtn?.classList.remove('active', 'ready', 'pending');
  startInitiativeBtn?.classList.remove('active', 'ready', 'pending');
  startCombatBtn?.classList.remove('active', 'ready', 'pending');

  // гарантируем стандартный светлый текст у фазовых кнопок
  try { if (startExplorationBtn) startExplorationBtn.style.color = '#fff'; } catch {}
  try { if (startInitiativeBtn) startInitiativeBtn.style.color = '#fff'; } catch {}
  try { if (startCombatBtn) startCombatBtn.style.color = '#fff'; } catch {}

  // безопасно сбрасываем disabled перед логикой фазы,
  // чтобы не залипали старые состояния после переключений.
  try { if (startExplorationBtn) startExplorationBtn.disabled = false; } catch {}
  try { if (startInitiativeBtn) startInitiativeBtn.disabled = false; } catch {}
  try { if (startCombatBtn) startCombatBtn.disabled = false; } catch {}

  // ===== initiative roll button only in initiative phase
  if (rollInitiativeBtn) {
    if (phase === 'initiative') {
      rollInitiativeBtn.style.display = 'inline-block';
      rollInitiativeBtn.classList.add('is-active');
    } else {
      rollInitiativeBtn.style.display = 'none';
      rollInitiativeBtn.classList.remove('is-active');
    }
  }

  // ===== world phase buttons (GM only visually, but keep safe)
  if (phase === 'exploration') {
    // По нажатию на "Фаза исследования" она сразу считается активной и зелёной.
    startExplorationBtn?.classList.add('active');
    startCombatBtn.disabled = true;
  } else if (phase === 'initiative') {
    // По нажатию на "Фаза инициатива" кнопка всегда должна быть активной (зелёной),
    // независимо от того, бросили уже инициативу все участники или нет.
    startInitiativeBtn?.classList.add('active');

    // "Фаза бой" НЕ должна становиться зелёной в фазе инициативы.
    // Красной она становится только когда все участники бросили инициативу.
    startCombatBtn.disabled = !allRolled;
    if (allRolled) {
      startCombatBtn.classList.add('pending');
    }
  } else if (phase === 'combat') {
    startCombatBtn.classList.add('ready');
  } else {
    // lobby or other
    startCombatBtn.disabled = true;
  }

  updateCurrentPlayer(state);
}








try { window.refreshRoomMembers = refreshRoomMembers; } catch {}
try { window.loadRoomLog = loadRoomLog; } catch {}
try { window.rememberRoomStateShadow = rememberRoomStateShadow; } catch {}
try { window.stripRoomSecretsFromState = stripRoomSecretsFromState; } catch {}
