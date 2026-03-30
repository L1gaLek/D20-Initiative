// Room state persistence / initiative / campaign save helpers extracted from client/core-helpers-network.js.

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
    stSafe.bgMusic = { tracks: [], currentTrackId: null, isPlaying: false, startedAt: 0, pausedAt: 0, volume: 40 };
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
      stSafe.roomAccess.hasPassword = !!latestAccess.hasPassword;
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
  let payloadState = state;
  try {
    const roomId = String(arguments?.[3] || currentRoomId || '').trim();
    if (roomId) {
      const detached = await snapshotCampaignDetachedData(roomId, state);
      payloadState = {
        __format: 'campaign-save-v2',
        state: deepClone(state || {}),
        detached,
        savedAt: new Date().toISOString()
      };
    }
  } catch (e) {
    console.warn('createCampaignSave: detached snapshot failed, fallback to plain state', e);
    payloadState = state;
  }
  const { error } = await sbClient
    .from('campaign_saves')
    .insert({ owner_key: ownerKey, name, state: payloadState });
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

function _normalizeCampaignPayload(raw) {
  const payload = raw && typeof raw === 'object' ? raw : null;
  if (payload && payload.__format === 'campaign-save-v2' && payload.state && typeof payload.state === 'object') {
    return {
      state: deepClone(payload.state),
      detached: payload.detached && typeof payload.detached === 'object' ? deepClone(payload.detached) : null
    };
  }
  return {
    state: deepClone(raw || {}),
    detached: null
  };
}

async function snapshotCampaignDetachedData(roomId, stateLike = null) {
  await ensureSupabaseReady();
  const rid = String(roomId || '').trim();
  if (!rid) return null;
  const st = ensureStateHasMaps(deepClone(stateLike || lastState || {}));
  const mapIds = new Set((Array.isArray(st.maps) ? st.maps : []).map((m) => String(m?.id || '').trim()).filter(Boolean));
  const [mapMetaRes, wallsRes, marksRes, fogRes, tokensRes] = await Promise.all([
    sbClient.from('room_map_meta').select('*').eq('room_id', rid),
    sbClient.from('room_walls').select('*').eq('room_id', rid),
    sbClient.from('room_marks').select('*').eq('room_id', rid),
    sbClient.from('room_fog').select('*').eq('room_id', rid),
    sbClient.from('room_tokens').select('*').eq('room_id', rid)
  ]);
  if (mapMetaRes.error) throw mapMetaRes.error;
  if (wallsRes.error) throw wallsRes.error;
  if (marksRes.error) throw marksRes.error;
  if (fogRes.error) throw fogRes.error;
  if (tokensRes.error) throw tokensRes.error;
  return {
    roomMapMeta: (mapMetaRes.data || []).filter((r) => mapIds.has(String(r?.map_id || '').trim())),
    roomWalls: (wallsRes.data || []).filter((r) => mapIds.has(String(r?.map_id || '').trim())),
    roomMarks: (marksRes.data || []).filter((r) => mapIds.has(String(r?.map_id || '').trim())),
    roomFog: (fogRes.data || []).filter((r) => mapIds.has(String(r?.map_id || '').trim())),
    roomTokens: (tokensRes.data || []).filter((r) => mapIds.has(String(r?.map_id || '').trim()))
  };
}

function _deriveDetachedFromState(stateLike) {
  const st = ensureStateHasMaps(deepClone(stateLike || {}));
  const maps = Array.isArray(st.maps) ? st.maps : [];
  const players = Array.isArray(st.players) ? st.players : [];
  const tokens = [];
  const seen = new Set();
  const roomMapMeta = maps.map((m) => ({
    map_id: String(m?.id || ''),
    name: String(m?.name || 'Карта'),
    section_id: String(m?.sectionId || '') || null,
    board_width: Math.max(5, Math.min(150, Number(m?.boardWidth) || 10)),
    board_height: Math.max(5, Math.min(150, Number(m?.boardHeight) || 10)),
    board_bg_url: m?.boardBgUrl || m?.boardBgDataUrl || null,
    board_bg_storage_path: m?.boardBgStoragePath || null,
    board_bg_storage_bucket: m?.boardBgStorageBucket || null,
    grid_alpha: Number.isFinite(Number(m?.gridAlpha)) ? clamp(Number(m.gridAlpha), 0, 1) : 1,
    wall_alpha: Number.isFinite(Number(m?.wallAlpha)) ? clamp(Number(m.wallAlpha), 0, 1) : 1
  }));
  const roomWalls = maps.flatMap((m) => (Array.isArray(m?.walls) ? m.walls : []).map((w) => ({
    map_id: String(m?.id || ''),
    x: Number(w?.x) || 0,
    y: Number(w?.y) || 0,
    dir: String(w?.dir || '').toUpperCase(),
    wall_type: String(w?.type || 'stone'),
    thickness: Math.max(1, Math.min(12, Number(w?.thickness) || 4))
  }))).filter((w) => !!w.map_id && (w.dir === 'N' || w.dir === 'E' || w.dir === 'S' || w.dir === 'W'));
  const roomMarks = maps.flatMap((m) => (Array.isArray(m?.marks) ? m.marks : []).map((mk) => ({
    map_id: String(m?.id || ''),
    mark_id: String(mk?.id || ''),
    owner_id: String(mk?.ownerId || '') || null,
    kind: String(mk?.kind || ''),
    payload: deepClone(mk || {})
  }))).filter((mk) => !!mk.map_id && !!mk.mark_id && !!mk.kind);
  const roomFog = maps.map((m) => buildDetachedFogRow('', String(m?.id || ''), m?.fog || {}, m?.boardWidth, m?.boardHeight))
    .map((row) => ({ map_id: row.map_id, settings: row.settings, manual_stamps: row.manual_stamps, explored_packed: row.explored_packed }));
  const playerById = new Map(players.map((p) => [String(p?.id || ''), p]));
  maps.forEach((m) => {
    const mapId = String(m?.id || '');
    const pos = (m?.playersPos && typeof m.playersPos === 'object') ? m.playersPos : {};
    Object.keys(pos).forEach((pid) => {
      const p = playerById.get(String(pid)) || {};
      const k = `${mapId}::${pid}`;
      if (seen.has(k)) return;
      seen.add(k);
      const pp = pos[pid] || {};
      tokens.push({
        map_id: mapId,
        token_id: String(pid),
        x: (pp?.x === null || typeof pp?.x === 'undefined') ? null : Number(pp.x),
        y: (pp?.y === null || typeof pp?.y === 'undefined') ? null : Number(pp.y),
        size: Math.max(1, Number(p?.size) || 1),
        color: (typeof p?.color === 'string') ? p.color : null,
        is_public: !!p?.isPublic
      });
    });
  });
  players.forEach((p) => {
    const pid = String(p?.id || '');
    const mapId = String(p?.mapId || st?.currentMapId || '');
    if (!pid || !mapId) return;
    const k = `${mapId}::${pid}`;
    if (seen.has(k)) return;
    seen.add(k);
    tokens.push({
      map_id: mapId,
      token_id: pid,
      x: (p?.x === null || typeof p?.x === 'undefined') ? null : Number(p.x),
      y: (p?.y === null || typeof p?.y === 'undefined') ? null : Number(p.y),
      size: Math.max(1, Number(p?.size) || 1),
      color: (typeof p?.color === 'string') ? p.color : null,
      is_public: !!p?.isPublic
    });
  });
  return { roomMapMeta, roomWalls, roomMarks, roomFog, roomTokens: tokens };
}

async function applyCampaignSaveToRoom(roomId, rawSavePayload) {
  await ensureSupabaseReady();
  const rid = String(roomId || '').trim();
  if (!rid) return;
  const payload = _normalizeCampaignPayload(rawSavePayload);
  const normalized = ensureStateHasMaps(deepClone(payload.state || {}));
  await upsertRoomState(rid, normalized);

  const detached = payload.detached || _deriveDetachedFromState(normalized);
  const mapIds = new Set((Array.isArray(normalized.maps) ? normalized.maps : []).map((m) => String(m?.id || '').trim()).filter(Boolean));
  const withRoom = (rows) => (Array.isArray(rows) ? rows : []).map((r) => ({ ...r, room_id: rid, updated_at: new Date().toISOString() }))
    .filter((r) => mapIds.has(String(r?.map_id || '').trim()));

  await Promise.all([
    sbClient.from('room_map_meta').delete().eq('room_id', rid),
    sbClient.from('room_walls').delete().eq('room_id', rid),
    sbClient.from('room_marks').delete().eq('room_id', rid),
    sbClient.from('room_fog').delete().eq('room_id', rid),
    sbClient.from('room_tokens').delete().eq('room_id', rid)
  ]);

  const mapMetaRows = withRoom(detached?.roomMapMeta);
  const wallRows = withRoom(detached?.roomWalls);
  const markRows = withRoom(detached?.roomMarks);
  const fogRows = withRoom(detached?.roomFog);
  const tokenRows = withRoom(detached?.roomTokens);

  if (mapMetaRows.length) {
    const { error } = await sbClient.from('room_map_meta').upsert(mapMetaRows, { onConflict: 'room_id,map_id' });
    if (error) throw error;
  }
  if (wallRows.length) {
    const { error } = await sbClient.from('room_walls').upsert(wallRows, { onConflict: 'room_id,map_id,x,y,dir' });
    if (error) throw error;
  }
  if (markRows.length) {
    const { error } = await sbClient.from('room_marks').upsert(markRows, { onConflict: 'room_id,map_id,mark_id' });
    if (error) throw error;
  }
  if (fogRows.length) {
    const { error } = await sbClient.from('room_fog').upsert(fogRows, { onConflict: 'room_id,map_id' });
    if (error) throw error;
  }
  if (tokenRows.length) {
    const { error } = await sbClient.from('room_tokens').upsert(tokenRows);
    if (error) throw error;
  }

  // Apply detached snapshot immediately in the current client (GM) without page reload.
  try {
    if (typeof resetDetachedRoomCache === 'function') resetDetachedRoomCache(rid);
    mapMetaRows.forEach((row) => { try { _cacheMapMeta?.(row); } catch {} });
    try { _cacheWallRows?.(wallRows); } catch {}
    try { _cacheMarkRows?.(markRows); } catch {}
    try { _cacheFogRows?.(fogRows); } catch {}
    try { _refreshDetachedRoomView?.(); } catch {}
  } catch (e) {
    console.warn('applyCampaignSaveToRoom: local detached refresh failed', e);
  }

  // Broadcast detached updates via WS relay so all connected players apply changes immediately.
  try {
    mapMetaRows.forEach((row) => { try { sendWsEnvelope?.({ type: 'mapMetaRow', roomId: rid, row }); } catch {} });
    wallRows.forEach((row) => { try { sendWsEnvelope?.({ type: 'wallRow', roomId: rid, row }); } catch {} });
    fogRows.forEach((row) => { try { sendWsEnvelope?.({ type: 'fogRow', roomId: rid, row }); } catch {} });
    const marksByMap = new Map();
    markRows.forEach((row) => {
      const mid = String(row?.map_id || '').trim();
      if (!mid) return;
      if (!marksByMap.has(mid)) marksByMap.set(mid, []);
      marksByMap.get(mid).push(row);
    });
    marksByMap.forEach((rows, mapId) => {
      try { sendWsEnvelope?.({ type: 'marksReplace', roomId: rid, mapId, rows }); } catch {}
    });
  } catch (e) {
    console.warn('applyCampaignSaveToRoom: WS detached sync failed', e);
  }

  // Refresh token coordinates right away for users on the active map.
  try {
    const activeMapId = String(lastState?.currentMapId || normalized?.currentMapId || '').trim();
    if (activeMapId && typeof handleMessage === 'function') {
      const activeRows = tokenRows.filter((r) => String(r?.map_id || '').trim() === activeMapId);
      handleMessage({ type: 'tokensInit', rows: activeRows, mapId: activeMapId });
      try { sendWsEnvelope?.({ type: 'tokensInit', roomId: rid, rows: activeRows, mapId: activeMapId }); } catch {}
    }
  } catch (e) {
    console.warn('applyCampaignSaveToRoom: token refresh failed', e);
  }
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
    const key = 'int_ws_client_id';
    let id = String((typeof getAppStorageItem === 'function' ? getAppStorageItem(key) : localStorage.getItem(key)) || '').trim();
    if (!id) {
      id = (crypto?.randomUUID ? crypto.randomUUID() : ('ws-' + Math.random().toString(16).slice(2) + '-' + Date.now()));
      (typeof setAppStorageItem === 'function' ? setAppStorageItem(key, id) : localStorage.setItem(key, id));
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
