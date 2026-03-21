// Core room state and access helpers extracted from client/core-helpers-network.js.

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
    // Пароль комнаты больше не читается из room_state.
    // Единственный источник истины — таблица rooms.
    return '';
  } catch {
    return '';
  }
}

function getRoomLegacyPasswordFromState(state) {
  try {
    // Legacy-пароль из room_state больше не используем.
    return '';
  } catch {
    return '';
  }
}

function hasRoomPasswordInState(state) {
  try {
    const access = getRoomAccessState(state);
    // В room_state оставляем только UI-флаг, без секретов и без валидации.
    return !!access.hasPassword;
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
    bannedUsers: {},
    moderationEvent: (prevAccess.moderationEvent && typeof prevAccess.moderationEvent === 'object') ? deepClone(prevAccess.moderationEvent) : null
  };

  try {
    if (prevAccess.bannedUsers && typeof prevAccess.bannedUsers === 'object') {
      next.bannedUsers = deepClone(prevAccess.bannedUsers);
    }
  } catch {}

  return next;
}

function withAuthorizedRoomUser(state, userId, role) {
  const next = deepClone(state || {});
  try {
    if (!next.roomAccess || typeof next.roomAccess !== 'object') next.roomAccess = {};
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
    cellFeet: 10,

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

    roomMeta: {
      ownerId: '',
      ownerName: '',
      createdAt: '',
      updatedAt: ''
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
