// ================== HELPER ==================

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

function shouldAcceptWsServerEvent(msg) {
  try {
    if (!msg || typeof msg !== 'object') return true;
    if (!msg.__serverEvent) return true;
    const seq = Math.trunc(Number(msg.__eventSeq) || 0);
    if (!seq) return true;
    const roomId = String(msg.roomId || wsRoomId || '').trim();
    if (!roomId) return true;
    if (!(window.__lastWsRoomEventSeq instanceof Map)) window.__lastWsRoomEventSeq = new Map();
    const last = Math.trunc(Number(window.__lastWsRoomEventSeq.get(roomId)) || 0);
    if (seq <= last) return false;
    window.__lastWsRoomEventSeq.set(roomId, seq);
    return true;
  } catch {
    return true;
  }
}

function normalizeInitiativeMode(mode) {
  const m = String(mode || 'normal').trim();
  if (m === 'advantage' || m === 'disadvantage') return m;
  return 'normal';
}

function buildInitiativeRollForPlayer(player, overrideMode = null) {
  const p = player || {};
  const mode = normalizeInitiativeMode(overrideMode || p.initiativeMode || 'normal');
  const r1 = Math.floor(Math.random() * 20) + 1;
  const r2 = Math.floor(Math.random() * 20) + 1;
  const pick = (mode === 'advantage') ? Math.max(r1, r2) : (mode === 'disadvantage') ? Math.min(r1, r2) : r1;
  const dexMod = getDexMod(p);
  const total = pick + dexMod;
  const modeLabel = mode === 'advantage' ? ' (преимущество)' : mode === 'disadvantage' ? ' (помеха)' : '';
  const kindText = `Инициатива${modeLabel}: d20${dexMod >= 0 ? '+' : ''}${dexMod}`;
  return {
    mode,
    total,
    dexMod,
    keptRoll: pick,
    rolls: (mode === 'normal') ? [r1] : [r1, r2],
    kindText
  };
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

function resolveTokenEventUpdatedAtIso(msg) {
  try {
    const raw = Number(
      msg?.client_ts
      || msg?.clientTs
      || msg?.token_ts
      || msg?.tokenTs
      || msg?.ts
      || 0
    );
    if (Number.isFinite(raw) && raw > 0) return new Date(raw).toISOString();
  } catch {}
  try {
    const s = String(msg?.updated_at || msg?.updatedAt || '').trim();
    if (s) {
      const ms = Number(new Date(s).getTime()) || 0;
      if (ms > 0) return new Date(ms).toISOString();
    }
  } catch {}
  return new Date().toISOString();
}

function _tokenSnapshotCacheEnsure() {
  if (!(window.__tokenPositionSnapshotCache instanceof Map)) window.__tokenPositionSnapshotCache = new Map();
  return window.__tokenPositionSnapshotCache;
}

function _tokenSnapshotCacheKey(tokenId, mapId) {
  return `${String(mapId || '').trim()}::${String(tokenId || '').trim()}`;
}

function getTokenSnapshotCached(tokenId, mapId = '') {
  try {
    const id = String(tokenId || '').trim();
    if (!id) return null;
    const cache = _tokenSnapshotCacheEnsure();
    const mid = String(mapId || '').trim();
    if (mid) {
      // Strict map-local lookup: do not fallback to legacy token-only key,
      // otherwise coordinates from another map can "bleed" into this map.
      return cache.get(_tokenSnapshotCacheKey(id, mid)) || null;
    }
    return cache.get(id) || null;
  } catch {
    return null;
  }
}

function setTokenSnapshotCached(tokenId, mapId = '', snapshot = null) {
  try {
    const id = String(tokenId || '').trim();
    if (!id) return;
    const cache = _tokenSnapshotCacheEnsure();
    const normalized = (snapshot && typeof snapshot === 'object') ? snapshot : {};
    const mid = String(mapId || '').trim();
    const mk = _tokenSnapshotCacheKey(id, mid);
    cache.set(mk, normalized);
    // Keep legacy key only for calls without explicit map id.
    // When a map id is provided, map-local cache must stay isolated.
    if (!mid) cache.set(id, normalized);
  } catch {}
}

function deleteTokenSnapshotCached(tokenId, mapId = '') {
  try {
    const id = String(tokenId || '').trim();
    if (!id) return;
    const cache = _tokenSnapshotCacheEnsure();
    if (String(mapId || '').trim()) cache.delete(_tokenSnapshotCacheKey(id, mapId));
    else {
      for (const k of cache.keys()) {
        if (k === id || String(k).endsWith(`::${id}`)) cache.delete(k);
      }
    }
    cache.delete(id);
  } catch {}
}

function _tokenVisibilityCacheEnsure() {
  if (!(window.__tokenVisibilitySnapshotCache instanceof Map)) window.__tokenVisibilitySnapshotCache = new Map();
  return window.__tokenVisibilitySnapshotCache;
}

function setTokenVisibilityCached(tokenId, isPublic, mapId = '', updatedAtMs = 0) {
  try {
    const id = String(tokenId || '').trim();
    if (!id) return;
    const cache = _tokenVisibilityCacheEnsure();
    const next = {
      isPublic: !!isPublic,
      mapId: String(mapId || '').trim(),
      updatedAtMs: Math.max(0, Number(updatedAtMs) || 0),
      appliedAtMs: Date.now()
    };
    cache.set(id, next);
  } catch {}
}

function getTokenVisibilityCached(tokenId) {
  try {
    const id = String(tokenId || '').trim();
    if (!id) return null;
    const cache = _tokenVisibilityCacheEnsure();
    return cache.get(id) || null;
  } catch {
    return null;
  }
}

function applyTokenVisibilityCacheToState(stateLike) {
  try {
    const st = stateLike && typeof stateLike === 'object' ? stateLike : null;
    if (!st || !Array.isArray(st.players)) return st;
    const activeMapId = String(st.currentMapId || '').trim();
    st.players.forEach((p) => {
      if (!p || !p.id) return;
      const cached = getTokenVisibilityCached(p.id);
      if (!cached) return;
      const cacheMapId = String(cached.mapId || '').trim();
      const playerMapId = String(p.mapId || '').trim();
      if (cacheMapId && activeMapId && cacheMapId !== activeMapId && (!playerMapId || playerMapId !== cacheMapId)) return;
      p.isPublic = !!cached.isPublic;
    });
    return st;
  } catch {
    return stateLike;
  }
}

try {
  window.getTokenSnapshotCached = getTokenSnapshotCached;
  window.setTokenSnapshotCached = setTokenSnapshotCached;
  window.deleteTokenSnapshotCached = deleteTokenSnapshotCached;
  window.getTokenVisibilityCached = getTokenVisibilityCached;
  window.setTokenVisibilityCached = setTokenVisibilityCached;
  window.applyTokenVisibilityCacheToState = applyTokenVisibilityCacheToState;
} catch {}

function getPendingPlayerCreateStateWrites() {
  try {
    if (typeof window !== 'undefined') {
      if (!(window.__pendingPlayerCreateStateWrites instanceof Map)) {
        window.__pendingPlayerCreateStateWrites = new Map();
      }
      return window.__pendingPlayerCreateStateWrites;
    }
  } catch {}
  if (!(getPendingPlayerCreateStateWrites._map instanceof Map)) {
    getPendingPlayerCreateStateWrites._map = new Map();
  }
  return getPendingPlayerCreateStateWrites._map;
}

function markPendingPlayerCreateStateWrite(playerId) {
  const id = String(playerId || '').trim();
  if (!id) return () => {};
  const pending = getPendingPlayerCreateStateWrites();
  let resolveDone = null;
  const promise = new Promise((resolve) => { resolveDone = resolve; });
  let finished = false;
  const entry = {
    promise,
    startedAt: Date.now(),
    finish: () => {
      if (finished) return;
      finished = true;
      try { resolveDone?.(); } catch {}
      try {
        if (pending.get(id) === entry) pending.delete(id);
      } catch {}
    }
  };
  pending.set(id, entry);
  return () => {
    if (finished) return;
    try { entry.finish(); } catch {}
  };
}

function finishPendingPlayerCreateStateWriteById(playerId) {
  try {
    const id = String(playerId || '').trim();
    if (!id) return;
    const entry = getPendingPlayerCreateStateWrites().get(id);
    if (entry && typeof entry.finish === 'function') entry.finish();
  } catch {}
}
try { window.finishPendingPlayerCreateStateWrite = finishPendingPlayerCreateStateWriteById; } catch {}

async function waitForPendingPlayerCreateStateWrite(playerId, timeoutMs = 5000) {
  const id = String(playerId || '').trim();
  if (!id) return;
  const entry = getPendingPlayerCreateStateWrites().get(id);
  const promise = entry?.promise;
  if (!promise || typeof promise.then !== 'function') return;
  let timer = null;
  try {
    await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(resolve, Math.max(100, Number(timeoutMs) || 5000));
      })
    ]);
  } finally {
    try { clearTimeout(timer); } catch {}
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
  sock.__joined = false;
  wsClient = sock;

  sock.onopen = async () => {
    markWsAlive();
    startWsHeartbeat(sock);
    try {
      const session = await ensureVpsSession(String(getAppStorageItem?.('int_user_name') || myNameSpan?.textContent || ''));
      const authToken = String(session?.token || getVpsAuthToken() || '').trim();
      if (!authToken) throw new Error('VPS auth token is missing');
      const isTavernSocket = rid === '__tavern_lobby__';
      sock.send(JSON.stringify({
        type: isTavernSocket ? 'joinTavern' : 'joinRoom',
        roomId: rid,
        authToken,
        userId: String(session?.userId || getAppStorageItem?.('int_user_id') || myId || ''),
        name: String(getAppStorageItem?.('int_user_name') || myNameSpan?.textContent || ''),
        clientId: WS_CLIENT_ID,
        transport: 'ws'
      }));
    } catch (e) {
      console.warn('[WS] auth join failed', e);
      try { sock.close(); } catch {}
    }
  };

  sock.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (!msg || typeof msg !== 'object') return;
      const nonce = String(msg.__wsNonce || '').trim();
      if (nonce && wsWasSeen(nonce)) return;
      if (nonce) wsRememberNonce(nonce);

      const msgRoomId = String(msg.roomId || '').trim();
      if (msgRoomId && wsRoomId && msgRoomId !== wsRoomId) return;
      if (!shouldAcceptWsServerEvent(msg)) return;

      const from = String(msg.__fromWsClient || '').trim();
      if (from && from === WS_CLIENT_ID && msg.__optimisticApplied) return;

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
        try { sock.__joined = true; } catch {}
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
  await unsubscribeRealtimeChannelSlots([
    {
      getCurrent: () => (typeof roomDbChannel !== 'undefined' ? roomDbChannel : null),
      setCurrent: (channel) => { roomDbChannel = channel; }
    },
    {
      getCurrent: () => (typeof roomChannel !== 'undefined' ? roomChannel : null),
      setCurrent: (channel) => { roomChannel = channel; }
    },
    {
      getCurrent: () => window.roomTokensDbChannel || null,
      setCurrent: (channel) => { window.roomTokensDbChannel = channel; }
    },
    {
      getCurrent: () => window.roomLogDbChannel || null,
      setCurrent: (channel) => { window.roomLogDbChannel = channel; }
    },
    {
      getCurrent: () => window.roomDiceDbChannel || null,
      setCurrent: (channel) => { window.roomDiceDbChannel = channel; }
    },
    {
      getCurrent: () => window.roomMapMetaDbChannel || null,
      setCurrent: (channel) => { window.roomMapMetaDbChannel = channel; }
    },
    {
      getCurrent: () => window.roomWallsDbChannel || null,
      setCurrent: (channel) => { window.roomWallsDbChannel = channel; }
    },
    {
      getCurrent: () => window.roomMarksDbChannel || null,
      setCurrent: (channel) => { window.roomMarksDbChannel = channel; }
    },
    {
      getCurrent: () => window.roomFogDbChannel || null,
      setCurrent: (channel) => { window.roomFogDbChannel = channel; }
    },
    {
      getCurrent: () => window.roomMusicDbChannel || null,
      setCurrent: (channel) => { window.roomMusicDbChannel = channel; }
    },
    {
      getCurrent: () => (typeof roomMembersDbChannel !== 'undefined' ? roomMembersDbChannel : null),
      setCurrent: (channel) => { roomMembersDbChannel = channel; }
    }
  ]);
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

    if (wsClient && wsClient.readyState === WebSocket.OPEN && wsClient.__joined === true) {
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

let pendingRoomsListPromise = null;
let pendingRoomsListKey = '';
let lastRoomsListLoadedAt = 0;

function _isMissingColumnError(error, columnName = '') {
  try {
    const needle = String(columnName || '').trim().toLowerCase();
    const code = String(error?.code || '').trim();
    const haystack = [
      error?.message,
      error?.details,
      error?.hint,
      error?.description,
      error?.error_description
    ].map((part) => String(part || '').toLowerCase()).join(' ');
    if (!haystack) return false;
    if (code === '42703') return !needle || haystack.includes(needle);
    if (haystack.includes('does not exist') && haystack.includes('column')) {
      return !needle || haystack.includes(needle);
    }
    if (haystack.includes('schema cache') && haystack.includes('column')) {
      return !needle || haystack.includes(needle);
    }
    if (haystack.includes('could not find') && haystack.includes('column')) {
      return !needle || haystack.includes(needle);
    }
    return false;
  } catch {
    return false;
  }
}

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
        try {
          if (lastState && Array.isArray(lastState.maps)) {
            lastState.maps = lastState.maps.filter(m => String(m?.id || '') !== mapId);
            if (String(lastState.currentMapId || '') === mapId) {
              const fallback = lastState.maps[0] || null;
              if (fallback?.id) loadMapToRoot(lastState, String(fallback.id));
            }
          }
        } catch {}
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
    if (type === 'moveToken') {
      try {
        const tokenId = String(msg.tokenId || msg.token_id || '').trim();
        if (!tokenId) return true;
        const row = {
          token_id: tokenId,
          map_id: String(msg.mapId || msg.map_id || lastState?.currentMapId || '').trim(),
          x: (msg.x === null || typeof msg.x === 'undefined') ? null : Number(msg.x),
          y: (msg.y === null || typeof msg.y === 'undefined') ? null : Number(msg.y),
          size: Number(msg.size) || null,
          is_public: (typeof msg.isPublic === 'undefined') ? undefined : !!msg.isPublic,
          updated_at: resolveTokenEventUpdatedAtIso(msg)
        };
        handleMessage({ type: 'tokenRow', row });
      } catch {}
      return true;
    }
    if (type === 'updateTokenSize') {
      try {
        const tokenId = String(msg.tokenId || msg.token_id || '').trim();
        if (!tokenId) return true;
        const current = (lastState?.players || []).find((p) => String(p?.id || '') === tokenId) || null;
        const row = {
          token_id: tokenId,
          map_id: String(msg.mapId || msg.map_id || current?.mapId || lastState?.currentMapId || '').trim(),
          // IMPORTANT: do not synthesize x/y from potentially stale local state.
          // updateTokenSize should only affect size/public visibility.
          x: undefined,
          y: undefined,
          size: Number(msg.size) || Number(current?.size) || 1,
          is_public: (typeof msg.isPublic === 'undefined') ? !!current?.isPublic : !!msg.isPublic,
          color: undefined
        };
        handleMessage({ type: 'tokenRow', row });
      } catch {}
      return true;
    }
    if (type === 'removeTokenFromBoard') {
      try {
        const tokenId = String(msg.tokenId || msg.token_id || '').trim();
        if (!tokenId) return true;
        handleMessage({
          type: 'tokenRowDeleted',
          row: { token_id: tokenId, map_id: String(msg.mapId || msg.map_id || '').trim() }
        });
      } catch {}
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

  await replaceRealtimeChannelSlot(
    () => roomDbChannel,
    (channel) => { roomDbChannel = channel; },
    () => sbClient
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
      )
  );

  // Optional: broadcast channel (dice events)
  await replaceRealtimeChannelSlot(
    () => roomChannel,
    (channel) => { roomChannel = channel; },
    () => sbClient
      .channel(`room:${roomId}`)
      .on("broadcast", { event: "diceEvent" }, ({ payload }) => {
        if (payload && payload.event) handleMessage({ type: "diceEvent", event: payload.event });
      })
  );
}


function applyTokenRowToLocalState(row) {
  try {
    if (!row) return;
    const tokenId = String(row.token_id || '').trim();
    if (!tokenId) return;
    const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
    const hasX = hasOwn(row, 'x');
    const hasY = hasOwn(row, 'y');
    const hasSize = hasOwn(row, 'size');
    const hasColor = hasOwn(row, 'color');
    const x = !hasX ? undefined : ((row.x === null || typeof row.x === 'undefined') ? null : Number(row.x));
    const y = !hasY ? undefined : ((row.y === null || typeof row.y === 'undefined') ? null : Number(row.y));
    const size = !hasSize ? undefined : ((row.size === null || typeof row.size === 'undefined') ? null : Number(row.size));
    const color = hasColor ? ((typeof row.color === 'string') ? row.color : null) : undefined;
    const mapId = String(row.map_id || '').trim();
    const hasPublic = (typeof row.is_public !== 'undefined');
    const isPublic = hasPublic ? !!row.is_public : null;
    let effectiveIsPublic = isPublic;
    const rowUpdatedAtMs = Number(new Date(String(row?.updated_at || '')).getTime()) || 0;
    try {
      if (!(window.__tokenRowFreshnessClock instanceof Map)) window.__tokenRowFreshnessClock = new Map();
      const prev = window.__tokenRowFreshnessClock.get(tokenId);
      const prevUpdatedAtMs = Number(prev?.updatedAtMs) || 0;
      // Out-of-order delivery safety: never let an older row rollback a newer token snapshot.
      if (rowUpdatedAtMs && prevUpdatedAtMs && (rowUpdatedAtMs + 50 < prevUpdatedAtMs)) return;
    } catch {}
    const tokenMoveGuard = (typeof window !== 'undefined' && window.__tokenMoveOptimisticGuard instanceof Map)
      ? window.__tokenMoveOptimisticGuard
      : null;
    const guard = tokenMoveGuard ? tokenMoveGuard.get(tokenId) : null;
    if (guard) {
      const gx = Number(guard.x);
      const gy = Number(guard.y);
      const gPrevX = Number(guard.prevX);
      const gPrevY = Number(guard.prevY);
      const gMapId = String(guard.mapId || '').trim();
      const guardAtMs = Number(guard.at) || 0;
      const guardAgeMs = Date.now() - (Number(guard.at) || 0);
      const rowMapId = String(mapId || '').trim();
      const rowX = (x === null || typeof x === 'undefined') ? null : Number(x);
      const rowY = (y === null || typeof y === 'undefined') ? null : Number(y);
      const rowMatchesOptimistic = (
        Number.isFinite(rowX) && Number.isFinite(rowY) &&
        rowX === gx && rowY === gy &&
        (!gMapId || !rowMapId || gMapId === rowMapId)
      );
      const rowLooksLikeOldStartCell = (
        Number.isFinite(rowX) && Number.isFinite(rowY) &&
        Number.isFinite(gPrevX) && Number.isFinite(gPrevY) &&
        rowX === gPrevX && rowY === gPrevY
      );
      const rowIsOlderThanMove = !!rowUpdatedAtMs && !!guardAtMs && (rowUpdatedAtMs + 120 < guardAtMs);
      const sameGuardMap = (!gMapId || !rowMapId || gMapId === rowMapId);

      // Ignore stale/conflicting echoes while optimistic move is in-flight.
      // This prevents "moved -> snapped back -> maybe moved again".
      if (!rowMatchesOptimistic && sameGuardMap) {
        if (rowIsOlderThanMove) return;
        // Even a "newer" row can be stale for coordinates (for example size/visibility-only update
        // that re-emits old x/y). Keep optimistic coordinates stable for a short settle window.
        if (guardAgeMs >= 0 && guardAgeMs < 4500) {
          // Opportunistic self-heal: if we see conflicting coordinates, re-assert the target
          // position once in a while so DB converges to the moved cell and clients stop snapping back.
          if (Number.isFinite(gx) && Number.isFinite(gy) && currentRoomId) {
            const retryTs = Number(guard.retryAtMs) || 0;
            if (!retryTs || (Date.now() - retryTs) > 350) {
              guard.retryAtMs = Date.now();
              try {
                sendWsEnvelope({
                  type: 'moveToken',
                  roomId: String(currentRoomId || ''),
                  mapId: gMapId || rowMapId || lastState?.currentMapId || '',
                  tokenId,
                  x: gx,
                  y: gy,
                  size: Number.isFinite(Number(guard.size)) ? Math.max(1, Number(guard.size)) : undefined,
                  isPublic: (typeof guard.isPublic === 'boolean') ? guard.isPublic : undefined,
                  client_ts: Date.now()
                }, { optimisticApplied: true });
              } catch {}
            }
          }
          return;
        }
        if (!rowUpdatedAtMs && rowLooksLikeOldStartCell) return;
      }
      if (rowMatchesOptimistic || (guardAgeMs >= 4500 && sameGuardMap) || (!sameGuardMap && guardAgeMs >= 2500)) {
        try { tokenMoveGuard.delete(tokenId); } catch {}
      }
    }

    // Apply into lastState.players for current UI rendering.
    if (typeof lastState !== 'undefined' && lastState && Array.isArray(lastState.players)) {
      const p = lastState.players.find(pp => String(pp?.id) === tokenId);
      if (p) {
        const activeMapId = String(lastState?.currentMapId || '').trim();
        const rowMapId = String(mapId || '').trim();
        // Safety for multi-map rooms: token coordinates are map-local for every token.
        // A delayed row from another map must not rewrite coordinates on the active map.
        if (rowMapId && activeMapId && rowMapId !== activeMapId) {
          try {
            if (!(window.__tokenRowFreshnessClock instanceof Map)) window.__tokenRowFreshnessClock = new Map();
            const prev = window.__tokenRowFreshnessClock.get(tokenId) || {};
            window.__tokenRowFreshnessClock.set(tokenId, {
              updatedAtMs: rowUpdatedAtMs || Number(prev?.updatedAtMs) || 0,
              appliedAtMs: Date.now()
            });
          } catch {}
          return;
        }
        try {
          setTokenSnapshotCached(String(tokenId), mapId || p?.mapId || lastState?.currentMapId || '', {
            x: (!hasX || x === undefined) ? ((p?.x === null || typeof p?.x === 'undefined') ? null : Number(p.x)) : ((x === null || typeof x === 'undefined') ? null : Number(x)),
            y: (!hasY || y === undefined) ? ((p?.y === null || typeof p?.y === 'undefined') ? null : Number(p.y)) : ((y === null || typeof y === 'undefined') ? null : Number(y)),
            size: (Number.isFinite(size) && size > 0) ? Number(size) : (Number(p?.size) || 1),
            color: (color === undefined) ? (p?.color || null) : (color || p?.color || null),
            mapId: mapId || p?.mapId || null,
            updatedAt: Date.now()
          });
        } catch {}
        if (hasX && (x === null || Number.isFinite(x))) p.x = x;
        if (hasY && (y === null || Number.isFinite(y))) p.y = y;
        if (Number.isFinite(size) && size > 0) {
          const preferredMonsterSize = getMonsterPreferredTokenSize(p);
          if (!Number.isFinite(preferredMonsterSize) || size >= preferredMonsterSize) {
            p.size = size;
          } else if (!(Number.isFinite(Number(p.size)) && Number(p.size) >= preferredMonsterSize)) {
            p.size = preferredMonsterSize;
          }
        }
        if (!Number.isFinite(Number(p.size)) || Number(p.size) <= 0) {
          const preferredMonsterSize = getMonsterPreferredTokenSize(p);
          if (Number.isFinite(preferredMonsterSize) && preferredMonsterSize > 0) p.size = preferredMonsterSize;
        }
        if (color !== undefined && color) p.color = color;
        // Keep last known map source of this token row.
        if (mapId) p.mapId = mapId;

        // v4+: room_tokens.is_public is the authoritative realtime "eye" value.
        // Older room_state snapshots can lag behind it, so cache accepted token visibility
        // and re-apply it when full state snapshots arrive.
        let visibilityGuard = null;
        if (effectiveIsPublic !== null) {
          visibilityGuard = getTokenVisibilityOptimisticGuard(tokenId);
          if (visibilityGuard && effectiveIsPublic !== !!visibilityGuard.isPublic) {
            effectiveIsPublic = null;
            reassertTokenVisibilityGuard(tokenId, mapId);
          }
        }
        if (effectiveIsPublic !== null) {
          p.isPublic = !!effectiveIsPublic;
          setTokenVisibilityCached(tokenId, p.isPublic, mapId || p?.mapId || lastState?.currentMapId || '', rowUpdatedAtMs);
          if (visibilityGuard && effectiveIsPublic === !!visibilityGuard.isPublic) {
            setTokenVisibilityOptimisticGuard(tokenId, p.isPublic, mapId || p?.mapId || lastState?.currentMapId || '');
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
        try {
          if (!(window.__tokenRowFreshnessClock instanceof Map)) window.__tokenRowFreshnessClock = new Map();
          const prev = window.__tokenRowFreshnessClock.get(tokenId) || {};
          window.__tokenRowFreshnessClock.set(tokenId, {
            updatedAtMs: rowUpdatedAtMs || Number(prev?.updatedAtMs) || 0,
            appliedAtMs: Date.now()
          });
        } catch {}
      }
    }
  } catch {}
}

function getMonsterPreferredTokenSize(player) {
  try {
    if (!player || !player.isMonster) return null;
    const mon = player?.sheet?.parsed?.monster || null;
    const raw = String(mon?.size_en || mon?.size_ru || '').toLowerCase().trim();
    if (!raw) return null;
    if (raw.includes('tiny') || raw.includes('крош')) return 1;
    if (raw.includes('small') || raw.includes('мал')) return 1;
    if (raw.includes('medium') || raw.includes('сред')) return 1;
    if (raw.includes('large') || raw.includes('бол')) return 2;
    if (raw.includes('huge') || raw.includes('огром') || raw.includes('огр')) return 3;
    if (raw.includes('gargantuan') || raw.includes('гиган') || raw.includes('испол') || raw.includes('громад')) return 4;
  } catch {}
  return null;
}

function setTokenMoveOptimisticGuard(tokenId, x, y, mapId, prevX = null, prevY = null, extras = null) {
  try {
    if (typeof window === 'undefined') return;
    if (!(window.__tokenMoveOptimisticGuard instanceof Map)) {
      window.__tokenMoveOptimisticGuard = new Map();
    }
    const id = String(tokenId || '').trim();
    if (!id) return;
    window.__tokenMoveOptimisticGuard.set(id, {
      x: Number(x),
      y: Number(y),
      prevX: (prevX === null || typeof prevX === 'undefined') ? null : Number(prevX),
      prevY: (prevY === null || typeof prevY === 'undefined') ? null : Number(prevY),
      mapId: String(mapId || '').trim(),
      size: Number(extras?.size),
      color: (typeof extras?.color === 'string') ? extras.color : null,
      isPublic: (typeof extras?.isPublic === 'boolean') ? extras.isPublic : null,
      at: Date.now()
    });
  } catch {}
}

const TOKEN_VISIBILITY_GUARD_TTL_MS = 8000;

function getTokenVisibilityGuardMap() {
  if (typeof window === 'undefined') return null;
  if (!(window.__tokenVisibilityOptimisticGuard instanceof Map)) {
    window.__tokenVisibilityOptimisticGuard = new Map();
  }
  return window.__tokenVisibilityOptimisticGuard;
}

function setTokenVisibilityOptimisticGuard(tokenId, isPublic, mapId = '') {
  try {
    const id = String(tokenId || '').trim();
    if (!id) return;
    const guardMap = getTokenVisibilityGuardMap();
    if (!guardMap) return;
    guardMap.set(id, {
      isPublic: !!isPublic,
      mapId: String(mapId || '').trim(),
      at: Date.now(),
      retryAtMs: 0
    });
  } catch {}
}

function getTokenVisibilityOptimisticGuard(tokenId) {
  try {
    const id = String(tokenId || '').trim();
    if (!id) return null;
    const guardMap = getTokenVisibilityGuardMap();
    const guard = guardMap?.get(id) || null;
    if (!guard) return null;
    const age = Date.now() - (Number(guard.at) || 0);
    if (age < 0 || age > TOKEN_VISIBILITY_GUARD_TTL_MS) {
      guardMap.delete(id);
      return null;
    }
    return guard;
  } catch {
    return null;
  }
}

function reassertTokenVisibilityGuard(tokenId, rowMapId = '') {
  try {
    const guard = getTokenVisibilityOptimisticGuard(tokenId);
    if (!guard || !currentRoomId) return;
    const now = Date.now();
    if (now - (Number(guard.retryAtMs) || 0) < 500) return;
    guard.retryAtMs = now;
    const mapId = String(guard.mapId || rowMapId || lastState?.currentMapId || '').trim();
    if (!mapId) return;
    sendWsEnvelope({
      type: 'setTokenVisibility',
      roomId: String(currentRoomId || ''),
      mapId,
      tokenId: String(tokenId || ''),
      isPublic: !!guard.isPublic,
      client_ts: now
    }, { optimisticApplied: true });
  } catch {}
}

function applyPendingVisibilityOverlayToState(stateLike) {
  try {
    const st = stateLike && typeof stateLike === 'object' ? stateLike : null;
    if (!st || !Array.isArray(st.players)) return st;
    st.players.forEach((p) => {
      if (!p || !p.id) return;
      const guard = getTokenVisibilityOptimisticGuard(p.id);
      if (!guard) return;
      p.isPublic = !!guard.isPublic;
    });
    return st;
  } catch {
    return stateLike;
  }
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
      if (typeof src.isEnemy !== 'undefined') dst.isEnemy = !!src.isEnemy;
      if (typeof src.inCombat !== 'undefined') dst.inCombat = !!src.inCombat;
      if (typeof src.hasRolledInitiative !== 'undefined') dst.hasRolledInitiative = !!src.hasRolledInitiative;
      if (typeof src.pendingInitiativeChoice !== 'undefined') dst.pendingInitiativeChoice = !!src.pendingInitiativeChoice;
      if (typeof src.willJoinNextRound !== 'undefined') dst.willJoinNextRound = !!src.willJoinNextRound;
      if (typeof src.initiative !== 'undefined') dst.initiative = src.initiative;
      if (typeof src.initiativeMode !== 'undefined') dst.initiativeMode = normalizeInitiativeMode(src.initiativeMode);
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

function buildRealtimeCombatPlayerPatch(player) {
  if (!player || !player.id) return null;
  return {
    id: String(player.id),
    inCombat: !!player.inCombat,
    initiative: (player.initiative === null || typeof player.initiative === 'undefined') ? null : Number(player.initiative),
    hasRolledInitiative: !!player.hasRolledInitiative,
    pendingInitiativeChoice: !!player.pendingInitiativeChoice,
    willJoinNextRound: !!player.willJoinNextRound,
    initiativeMode: normalizeInitiativeMode(player.initiativeMode || 'normal')
  };
}

function buildRealtimeStatePatchForMessage(type, msg, stateLike, isGM, userId) {
  try {
    const st = stateLike && typeof stateLike === 'object' ? stateLike : null;
    if (!st) return null;
    const fields = {};
    const playersPatch = [];
    const addPlayer = (player) => {
      const patch = buildRealtimeCombatPlayerPatch(player);
      if (patch) playersPatch.push(patch);
    };
    const addPlayersByIds = (ids) => {
      const wanted = new Set((Array.isArray(ids) ? ids : []).map(id => String(id || '')).filter(Boolean));
      (Array.isArray(st.players) ? st.players : []).forEach((p) => {
        if (wanted.has(String(p?.id || ''))) addPlayer(p);
      });
    };
    const addAllCombatPlayers = () => {
      (Array.isArray(st.players) ? st.players : []).forEach(addPlayer);
    };
    const addPhaseFields = () => {
      fields.phase = String(st.phase || 'exploration');
      fields.phaseEpoch = Math.max(0, Number(st.phaseEpoch) || 0);
      fields.combatSelectionEpoch = Math.max(0, Number(st.combatSelectionEpoch) || 0);
      fields.initiativeEpoch = Math.max(0, Number(st.initiativeEpoch) || 0);
      fields.turnOrder = Array.isArray(st.turnOrder) ? st.turnOrder.map(id => String(id || '')).filter(Boolean) : [];
      fields.currentTurnIndex = Math.max(0, Number(st.currentTurnIndex) || 0);
      fields.round = Math.max(1, Number(st.round) || 1);
      fields.turnEpoch = Math.max(0, Number(st.turnEpoch) || 0);
    };
    const addTurnFields = () => {
      fields.turnOrder = Array.isArray(st.turnOrder) ? st.turnOrder.map(id => String(id || '')).filter(Boolean) : [];
      fields.currentTurnIndex = Math.max(0, Number(st.currentTurnIndex) || 0);
      fields.round = Math.max(1, Number(st.round) || 1);
      fields.turnEpoch = Math.max(0, Number(st.turnEpoch) || 0);
    };
    const addCurrentMapField = () => {
      const mapId = String(st.currentMapId || '').trim();
      if (mapId) fields.currentMapId = mapId;
    };
    const addMapSectionsField = () => {
      const sections = Array.isArray(st.mapSections) ? st.mapSections : [];
      if (!sections.length) return;
      fields.mapSections = sections
        .map((section) => ({
          id: String(section?.id || '').trim(),
          name: String(section?.name || '').trim() || 'Раздел'
        }))
        .filter(section => section.id);
    };

    switch (String(type || '')) {
      case 'startInitiative':
        if (!isGM) return null;
        addPhaseFields();
        addAllCombatPlayers();
        break;
      case 'startExploration':
        if (!isGM) return null;
        addPhaseFields();
        break;
      case 'startCombat':
        if (!isGM) return null;
        addPhaseFields();
        addAllCombatPlayers();
        break;
      case 'endTurn':
        if (isGM) {
          addTurnFields();
          addAllCombatPlayers();
        } else {
          fields.currentTurnIndex = Math.max(0, Number(st.currentTurnIndex) || 0);
          fields.round = Math.max(1, Number(st.round) || 1);
          fields.turnEpoch = Math.max(0, Number(st.turnEpoch) || 0);
        }
        break;
      case 'setPlayerInCombat':
        if (!isGM) return null;
        fields.combatSelectionEpoch = Math.max(0, Number(st.combatSelectionEpoch) || 0);
        addPlayersByIds([msg?.id]);
        break;
      case 'setPlayersInCombatBulk':
        if (!isGM) return null;
        fields.combatSelectionEpoch = Math.max(0, Number(st.combatSelectionEpoch) || 0);
        addPlayersByIds((Array.isArray(msg?.items) ? msg.items : []).map((it) => it?.id));
        break;
      case 'setInitiativeMode':
      case 'rollInitiativeFor':
      case 'gmRollInitiativeFor':
      case 'combatInitChoice':
        addPlayersByIds([msg?.id]);
        break;
      case 'rollInitiativeAllOwned':
      case 'rollInitiative':
        (Array.isArray(st.players) ? st.players : [])
          .filter((p) => p && String(p.ownerId || '') === String(userId || '') && p.inCombat && p.hasRolledInitiative)
          .forEach(addPlayer);
        break;
      case 'setCellFeet':
        if (!isGM) return null;
        fields.cellFeet = Math.max(1, Math.min(100, Number(st.cellFeet) || 10));
        break;
      case 'createMapSection':
      case 'renameMapSection':
        if (!isGM) return null;
        addCurrentMapField();
        addMapSectionsField();
        break;
      case 'renameCampaignMap':
      case 'moveCampaignMap':
        if (!isGM) return null;
        addCurrentMapField();
        addMapSectionsField();
        break;
      case 'switchCampaignMap':
        if (!isGM) return null;
        addCurrentMapField();
        addPhaseFields();
        addMapSectionsField();
        break;
      default:
        return null;
    }

    const patch = {};
    if (Object.keys(fields).length) patch.fields = fields;
    if (playersPatch.length) patch.players = playersPatch;
    return Object.keys(patch).length ? patch : null;
  } catch (e) {
    console.warn('buildRealtimeStatePatchForMessage failed', e);
    return null;
  }
}

const REALTIME_STATE_PATCH_ONLY_TYPES = new Set([
  'startInitiative',
  'setPlayerInCombat',
  'setPlayersInCombatBulk',
  'startExploration',
  'combatInitChoice',
  'setInitiativeMode',
  'rollInitiativeFor',
  'rollInitiativeAllOwned',
  'gmRollInitiativeFor',
  'startCombat',
  'endTurn',
  'setCellFeet',
  'createMapSection',
  'renameMapSection',
  'renameCampaignMap',
  'moveCampaignMap',
  'switchCampaignMap'
]);

function shouldUsePatchOnlyRealtime(type, patchSent) {
  return !!patchSent && REALTIME_STATE_PATCH_ONLY_TYPES.has(String(type || ''));
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
  _cacheMapMeta(row);
  try { sendWsEnvelope({ type: 'mapMetaRow', roomId: String(roomId || ''), row }, { optimisticApplied: true }); } catch {}
  return;
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
  __roomDetachedCache.mapMetaById.delete(mid);
  __roomDetachedCache.wallsByMap.delete(mid);
  __roomDetachedCache.marksByMap.delete(mid);
  __roomDetachedCache.fogByMap.delete(mid);
  try { sendWsEnvelope({ type: 'mapMetaDelete', roomId: rid, row: { map_id: mid } }, { optimisticApplied: true }); } catch {}
  return;
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
  return;

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
    clean.forEach((row) => {
      _cacheDeleteWallRow(row);
      try { sendWsEnvelope({ type: 'wallDelete', roomId: rid, row }, { optimisticApplied: true }); } catch {}
    });
  } else {
    clean.forEach((row) => {
      _cacheUpsertWallRow(row);
      try { sendWsEnvelope({ type: 'wallRow', roomId: rid, row }, { optimisticApplied: true }); } catch {}
    });
  }
  return;
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
  _cacheUpsertFogRow(row);
  try { sendWsEnvelope({ type: 'fogRow', roomId: row.room_id, row }, { optimisticApplied: true }); } catch {}
  return;
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
      _cacheUpsertFogRow(row);
      try { sendWsEnvelope({ type: 'fogRow', roomId: row.room_id, row }, { optimisticApplied: true }); } catch {}
      _refreshDetachedRoomView();
      return;
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
  _cacheUpsertMarkRow(row);
  try { sendWsEnvelope({ type: 'markRow', roomId: row.room_id, row }, { optimisticApplied: true }); } catch {}
  return;
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
  const deletedRow = { map_id: mid, mark_id: id };
  _cacheDeleteMarkRow(deletedRow);
  try { sendWsEnvelope({ type: 'markDelete', roomId: rid, row: deletedRow }, { optimisticApplied: true }); } catch {}
  return;
  const { error } = await sbClient.from('room_marks').delete().eq('room_id', rid).eq('map_id', mid).eq('mark_id', id);
  if (error) throw error;
  const row = { map_id: mid, mark_id: id };
  _cacheDeleteMarkRow(row);
  try { sendWsEnvelope({ type: 'markDelete', roomId: rid, row }, { optimisticApplied: true }); } catch {}
}

async function clearRoomMarks(roomId, mapId, ownerId = null) {
  await ensureSupabaseReady();
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
  return;
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
    payload: deepClone(bgMusic || { tracks: [], currentTrackId: null, isPlaying: false, startedAt: 0, pausedAt: 0, volume: 40 }),
    updated_at: new Date().toISOString()
  };
  if (!row.room_id) return;
  _cacheMusicRow(row);
  try { sendWsEnvelope({ type: 'musicRow', roomId: row.room_id, row }, { optimisticApplied: true }); } catch {}
  return;
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
    try {
      const mapId = String(row.map_id || '').trim();
      const activeMapId = String(lastState?.currentMapId || '').trim();
      if (mapId && activeMapId && mapId !== activeMapId) return;
    } catch {}
    try { deleteTokenSnapshotCached(tokenId, String(row.map_id || '').trim()); } catch {}

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
  const roleRaw = String(getAppStorageItem?.('int_user_role') || myRole || '').trim();
  const role = (typeof normalizeRoleForDb === 'function') ? normalizeRoleForDb(roleRaw) : roleRaw;
  if (role !== 'GM') return;
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
    await upsertRoomMusicState(roomId, st.bgMusic || { tracks: [], currentTrackId: null, isPlaying: false, startedAt: 0, pausedAt: 0, volume: 40 });
  }
}

async function upsertTokenVisibility(roomId, tokenId, isPublic) {
  try {
    const rid = String(roomId || '').trim();
    const tid = String(tokenId || '').trim();
    const visibilityPlayer = (lastState?.players || []).find(pp => String(pp?.id || '') === tid);
    const vpsMapId = String(visibilityPlayer?.mapId || lastState?.currentMapId || '').trim();
    if (tid) setTokenVisibilityOptimisticGuard(tid, !!isPublic, vpsMapId);
    if (rid && tid && vpsMapId) {
      sendWsEnvelope({
        type: 'setTokenVisibility',
        roomId: rid,
        mapId: vpsMapId,
        tokenId: tid,
        isPublic: !!isPublic
      }, { optimisticApplied: true });
    }
    return;

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

async function upsertTokenPositionDirect(roomId, token) {
  try {
    const rid = String(roomId || '').trim();
    const tokenId = String(token?.id || token?.token_id || '').trim();
    const mapId = String(token?.mapId || token?.map_id || lastState?.currentMapId || '').trim();
    if (rid && tokenId && mapId) {
      sendWsEnvelope({
        type: 'moveToken',
        roomId: rid,
        mapId,
        tokenId,
        x: (token?.x === null || typeof token?.x === 'undefined') ? null : Number(token.x),
        y: (token?.y === null || typeof token?.y === 'undefined') ? null : Number(token.y),
        size: Math.max(1, Number(token?.size) || 1),
        isPublic: !!token?.isPublic,
        client_ts: Date.now()
      }, { optimisticApplied: true });
    }
    return;

    await ensureSupabaseReady();
    if (!rid || !tokenId || !mapId) return;

    const payload = {
      room_id: rid,
      map_id: mapId,
      token_id: tokenId,
      x: (token?.x === null || typeof token?.x === 'undefined') ? null : Number(token.x),
      y: (token?.y === null || typeof token?.y === 'undefined') ? null : Number(token.y),
      size: Math.max(1, Number(token?.size) || 1),
      color: (typeof token?.color === 'string') ? token.color : null,
      is_public: !!token?.isPublic
    };
    const mutable = {
      x: payload.x,
      y: payload.y,
      size: payload.size,
      color: payload.color,
      is_public: payload.is_public
    };
    // Keep positions map-local: update only the row for (room_id, map_id, token_id).
    // If such row doesn't exist yet, insert a new one for this map.
    const upd = await sbClient
      .from('room_tokens')
      .update(mutable)
      .eq('room_id', rid)
      .eq('map_id', mapId)
      .eq('token_id', tokenId)
      .select('token_id')
      .limit(1);
    if (upd.error) throw upd.error;
    const updatedRows = Array.isArray(upd.data) ? upd.data.length : 0;
    if (!updatedRows) {
      const ins = await sbClient.from('room_tokens').insert(payload);
      if (ins.error) throw ins.error;
    }
  } catch (e) {
    console.warn('upsertTokenPositionDirect failed', e);
  }
}

function isMapScopedPlayer(player) {
  return !!(player && player.isEnemy && !player.isBase);
}

function isPlayerEligibleForCurrentMapCombat(player, stateLike) {
  if (!player || !stateLike) return false;
  if (!player.inCombat) return false;
  if (!isMapScopedPlayer(player)) return true;
  const activeMapId = String(stateLike?.currentMapId || '').trim();
  const playerMapId = String(player?.mapId || '').trim();
  if (!activeMapId || !playerMapId) return false;
  return playerMapId === activeMapId;
}

async function insertRoomLog(roomId, text) {
  try {
    const t = String(text || '').trim();
    const rid = String(roomId || '').trim();
    if (!rid || !t) return null;
    if (typeof window !== 'undefined' && typeof window.RoomRowsApi?.insertLog === 'function') {
      const payload = await window.RoomRowsApi.insertLog(rid, { text: t });
      return payload?.row || null;
    }
    throw new Error('VPS log API is unavailable');
  } catch (e) {
    try { console.debug?.('room_log deferred insert failed', e); } catch {}
    return null;
  }
}

async function appendRoomLogEntry(roomId, text, options = {}) {
  const rid = String(roomId || '').trim();
  const line = String(text || '').trim();
  if (!rid || !line) return;

  const noOptimistic = !!options?.noOptimistic;
  const row = {
    text: line,
    created_at: new Date().toISOString(),
    localNonce: `log-${Date.now()}-${Math.random().toString(16).slice(2)}`
  };
  try {
    sendWsEnvelope({ type: 'logRow', roomId: rid, row }, { optimisticApplied: !noOptimistic });
  } catch {}

  if (!noOptimistic) {
    try { handleMessage({ type: 'logRow', row }); } catch {}
  }

  try {
    insertRoomLog(rid, line).catch((e) => { try { console.debug?.('room_log background insert failed', e); } catch {} });
  } catch (e) {
    try { console.debug?.('room_log background insert schedule failed', e); } catch {}
  }
}
try { window.appendRoomLogEntry = appendRoomLogEntry; } catch {}


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

function bumpPhaseEpoch(stateLike) {
  try {
    if (!stateLike || typeof stateLike !== 'object') return 0;
    const nextEpoch = Math.max(Date.now(), (Number(stateLike.phaseEpoch) || 0) + 1);
    stateLike.phaseEpoch = nextEpoch;
    return nextEpoch;
  } catch {
    return 0;
  }
}

function bumpCombatSelectionEpoch(stateLike) {
  try {
    if (!stateLike || typeof stateLike !== 'object') return 0;
    const nextEpoch = Math.max(Date.now(), (Number(stateLike.combatSelectionEpoch) || 0) + 1);
    stateLike.combatSelectionEpoch = nextEpoch;
    return nextEpoch;
  } catch {
    return 0;
  }
}

function ensureDiceEventLocalNonce(ev) {
  try {
    if (!ev || typeof ev !== 'object') return '';
    const existing = String(ev.localNonce || ev.id || '').trim();
    if (existing) {
      ev.localNonce = existing;
      return existing;
    }
    const nonce = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `dice-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    ev.localNonce = nonce;
    return nonce;
  } catch {
    return '';
  }
}

async function insertDiceEvent(roomId, ev) {
  try {
    if (!roomId || !ev) return;
    const localNonce = ensureDiceEventLocalNonce(ev);
    const line = buildDiceLogText(ev);
    const optimistic = {
      event: ev,
      logRow: line ? {
        text: line,
        created_at: new Date().toISOString(),
        localNonce
      } : null
    };
    if (typeof window !== 'undefined' && typeof window.RoomRowsApi?.insertDiceEvent === 'function') {
      window.RoomRowsApi.insertDiceEvent(roomId, { event: ev }, { retries: 0 })
        .then((payload) => {
          if (payload?.event && typeof payload.event === 'object') {
            Object.assign(ev, payload.event);
            if (localNonce) ev.localNonce = localNonce;
          }
        })
        .catch((e) => { try { console.debug?.('dice deferred insert failed', e); } catch {} });
      return optimistic;
    }
    throw new Error('VPS dice API is unavailable');
  } catch (e) {
    try { console.debug?.('dice deferred insert failed', e); } catch {}
  }
}
try { window.insertDiceEvent = insertDiceEvent; } catch {}

async function broadcastDiceEventOnly(event) {
  try {
    if (!event || !currentRoomId) return;
    if (typeof isSpectator === 'function' && isSpectator()) return;
    const ev = { ...(event || {}) };
    if (typeof myId !== 'undefined' && !ev.fromId) ev.fromId = String(myId);
    if (myNameSpan?.textContent && !ev.fromName) ev.fromName = String(myNameSpan.textContent);

    const insertResult = await insertDiceEvent(currentRoomId, ev);
    const line = buildDiceLogText(ev);
    const logRow = insertResult?.logRow || (line ? { text: line, created_at: new Date().toISOString() } : null);

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
  if (!roomId) return [];

  let data = null;
  if (typeof window !== 'undefined' && typeof window.RoomRowsApi?.loadRoomMembers === 'function') {
    try {
      const payload = await window.RoomRowsApi.loadRoomMembers(roomId);
      data = Array.isArray(payload?.rows) ? payload.rows : [];
    } catch (error) {
      console.warn("room_members VPS load failed, falling back to Supabase", error);
    }
  }

  if (!Array.isArray(data)) {
    await ensureSupabaseReady();
    const { data: supabaseData, error } = await sbClient
      .from("room_members")
      .select("user_id,name,role")
      .eq("room_id", roomId);

    if (error) {
      console.error("room_members load error", error);
      return [];
    }
    data = supabaseData || [];
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
  return subscribeRoomScopedTableChannel({
    roomId,
    table: 'room_members',
    channelName: `db-room_members-${roomId}`,
    getCurrent: () => roomMembersDbChannel,
    setCurrent: (channel) => { roomMembersDbChannel = channel; },
    onPayload: (payload) => {
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
  });
}

async function sendMessage(msg) {
  try {
    await ensureSupabaseReady();
    if (!msg || typeof msg !== "object") return;

    const type = String(msg.type || "");

    switch (type) {
      // ===== Rooms =====
      case "listRooms": {
        const userId = getVpsActorUserId();
        const requestKey = userId || '?';
        const now = Date.now();
        if (!msg.force && msg.silent && lastRoomsListLoadedAt && (now - lastRoomsListLoadedAt) < 2000) {
          break;
        }
        if (pendingRoomsListPromise && pendingRoomsListKey === requestKey) {
          try {
            await pendingRoomsListPromise;
          } catch (e) {
            if (!msg.silent) handleMessage({ type: 'roomsError', message: getVpsApiErrorMessage(e, 'Rooms list failed') });
          }
          break;
        }

        try {
          const timeoutMs = Number(msg.timeoutMs) || 8000;
          const retries = Number.isFinite(Number(msg.retries))
            ? Math.max(0, Math.min(3, Math.trunc(Number(msg.retries))))
            : (msg.silent ? 1 : 0);
          pendingRoomsListKey = requestKey;
          pendingRoomsListPromise = (async () => {
            const payload = await window.RoomsApi.listRooms({ userId, timeoutMs, retries });
            handleMessage({
              type: "rooms",
              rooms: Array.isArray(payload.rooms) ? payload.rooms : [],
              totalUsers: Number(payload.totalUsers) || 0
            });
            lastRoomsListLoadedAt = Date.now();
          })();
          await pendingRoomsListPromise;
        } catch (e) {
          if (msg.silent) console.warn('background listRooms failed', e);
          else handleMessage({ type: 'roomsError', message: getVpsApiErrorMessage(e, 'Rooms list failed') });
        } finally {
          if (pendingRoomsListKey === requestKey) {
            pendingRoomsListPromise = null;
            pendingRoomsListKey = '';
          }
        }
        break;
      }

      case "createRoom": {
        const userId = getVpsActorUserId();
        if (!userId) {
          handleMessage({ type: 'roomsError', message: 'Login is required before creating a room.' });
          break;
        }
        try {
          const initState = createInitialGameState();
          const payload = await window.RoomsApi.createRoom({
            userId,
            userName: getVpsActorName(),
            name: msg.name,
            scenario: msg.scenario,
            password: msg.password || '',
            state: initState
          });
          const createdRoom = payload?.room && typeof payload.room === 'object' ? payload.room : null;
          const createdRoomId = String(createdRoom?.id || '').trim();
          if (createdRoom) {
            try {
              window.mergeLobbyRoomSnapshot?.(createdRoom, { totalUsers: Number(payload?.totalUsers || 0) || 0 });
            } catch {}
          }
          try {
            if (createdRoomId) {
              Promise.resolve()
                .then(() => ensureDetachedBootstrap(createdRoomId, payload.state || initState))
                .catch((e) => console.warn('detached bootstrap createRoom failed', e));
            }
          } catch (e) {
            console.warn('detached bootstrap createRoom failed', e);
          }
          setTimeout(() => {
            try {
              sendMessage({ type: "listRooms", silent: true, retries: 1, timeoutMs: 10000 });
            } catch (e) {
              console.warn('background rooms refresh schedule failed', e);
            }
          }, 250);
        } catch (e) {
          if (Number(e?.status) === 409) {
            try { sendMessage({ type: "listRooms", silent: true, retries: 1, timeoutMs: 10000 }); } catch {}
          }
          handleMessage({ type: 'roomsError', message: getVpsApiErrorMessage(e, 'Room create failed') });
        }
        break;
      }

      case "updateRoom": {
        const roomId = String(msg.roomId || '').trim();
        const userId = getVpsActorUserId();
        if (!roomId) break;
        if (!userId) {
          handleMessage({ type: 'roomsError', message: 'Login is required before updating a room.' });
          break;
        }
        try {
          const payload = await window.RoomsApi.updateRoom(roomId, {
            userId,
            name: msg.name,
            scenario: msg.scenario,
            password: msg.password || ''
          });
          const roomPayload = payload.room || {
            id: roomId,
            name: String(msg.name || ''),
            scenario: String(msg.scenario || '')
          };
          if (String(currentRoomId || '') === roomId) {
            try {
              if (myRoomSpan) myRoomSpan.textContent = String(roomPayload.name || msg.name || '');
              if (myScenarioSpan) myScenarioSpan.textContent = String(roomPayload.scenario || msg.scenario || '-');
            } catch {}
            if (payload.state) {
              try { handleMessage({ type: 'state', state: payload.state }); } catch {}
            }
          }
          try { handleMessage({ type: 'roomUpdated', room: roomPayload }); } catch {}
          await sendMessage({ type: 'listRooms' });
        } catch (e) {
          handleMessage({ type: 'roomsError', message: getVpsApiErrorMessage(e, 'Room update failed') });
        }
        break;
      }

      case "deleteRoom": {
        const roomId = String(msg.roomId || '').trim();
        const userId = getVpsActorUserId();
        if (!roomId) break;
        if (!userId) {
          handleMessage({ type: 'roomsError', message: 'Login is required before deleting a room.' });
          break;
        }
        try {
          await window.RoomsApi.deleteRoom(roomId, { userId });

          if (String(currentRoomId || '') === roomId) {
            try { await window.__leaveCurrentRoomCleanup?.(); } catch (e) { console.warn('deleteRoom cleanup failed', e); }
            try { stopHeartbeat(); } catch {}
            try { stopMembersPolling(); } catch {}
            try { await stopSupabaseRealtimeChannels(); } catch {}
            try { window.stopRoomChatSync?.(); } catch {}
            currentRoomId = null;
          }

          await sendMessage({ type: 'listRooms' });
        } catch (e) {
          handleMessage({ type: 'roomsError', message: getVpsApiErrorMessage(e, 'Room delete failed') });
        }
        break;
      }

      case "kickRoomUser": {
        const roomId = String(currentRoomId || msg.roomId || '').trim();
        const targetUserId = String(msg.targetUserId || '').trim();
        const actorUserId = getVpsActorUserId();
        if (!roomId || !targetUserId || !actorUserId) break;
        try {
          const payload = await window.RoomsApi.kickRoomMember(roomId, { actorUserId, targetUserId });
          if (payload.state) {
            try { rememberRoomStateShadow(roomId, payload.state); } catch {}
            try { handleMessage({ type: 'state', state: payload.state }); } catch {}
          }
          if (payload.moderationEvent) {
            try { handleMessage({ type: 'moderationEvent', event: payload.moderationEvent }); } catch {}
          }
          const removedIds = Array.isArray(payload.removedTokenIds) ? payload.removedTokenIds.filter(Boolean) : [];
          removedIds.forEach((tokenId) => {
            try { handleMessage({ type: 'tokenRowDeleted', row: { room_id: roomId, token_id: String(tokenId) } }); } catch {}
          });
          await refreshRoomMembers(roomId, { broadcast: false });
        } catch (e) {
          handleMessage({ type: 'roomsError', message: getVpsApiErrorMessage(e, 'Kick failed') });
        }
        break;
      }

      case "banRoomUser": {
        const roomId = String(currentRoomId || msg.roomId || '').trim();
        const targetUserId = String(msg.targetUserId || '').trim();
        const actorUserId = getVpsActorUserId();
        if (!roomId || !targetUserId || !actorUserId) break;

        const hoursRaw = Number(msg.hours);
        const minutesRaw = Number(msg.minutes);
        const hours = Math.max(0, Math.min(24, Math.trunc(Number.isFinite(hoursRaw) ? hoursRaw : 0)));
        const minutes = Math.max(0, Math.min(59, Math.trunc(Number.isFinite(minutesRaw) ? minutesRaw : 0)));
        const totalMinutes = Math.max(1, (hours * 60) + minutes);
        const reason = String(msg.reason || '').trim();

        try {
          const payload = await window.RoomsApi.banRoomMember(roomId, { actorUserId, targetUserId, hours, minutes, totalMinutes, reason });
          if (payload.state) {
            try { rememberRoomStateShadow(roomId, payload.state); } catch {}
            try { handleMessage({ type: 'state', state: payload.state }); } catch {}
          }
          if (payload.moderationEvent) {
            try { handleMessage({ type: 'moderationEvent', event: payload.moderationEvent }); } catch {}
          }
          const removedIds = Array.isArray(payload.removedTokenIds) ? payload.removedTokenIds.filter(Boolean) : [];
          removedIds.forEach((tokenId) => {
            try { handleMessage({ type: 'tokenRowDeleted', row: { room_id: roomId, token_id: String(tokenId) } }); } catch {}
          });
          await refreshRoomMembers(roomId, { broadcast: false });
        } catch (e) {
          handleMessage({ type: 'roomsError', message: getVpsApiErrorMessage(e, 'Ban failed') });
        }
        break;
      }

      case "joinRoom": {
        const roomId = String(msg.roomId || "").trim();
        if (!roomId) return;

        const userId = getVpsActorUserId();
        const role = normalizeRoleForDb(getAppStorageItem("int_user_role") || myRole || "");
        if (!userId || !role) {
          handleMessage({ type: 'roomsError', message: 'Login and role are required before joining a room.' });
          break;
        }

        let payload = null;
        try {
          payload = await window.RoomsApi.joinRoom(roomId, {
            userId,
            userName: getVpsActorName(),
            role,
            password: msg.password || ''
          });
        } catch (e) {
          handleMessage({ type: 'roomsError', message: getVpsApiErrorMessage(e, 'Room join failed') });
          break;
        }

        const room = payload.room || { id: roomId };
        const state = payload.state || createInitialGameState();

        currentRoomId = roomId;
        connectRoomWs(roomId);
        handleMessage({ type: "joinedRoom", room });

        startHeartbeat();
        try { await ensureDetachedBootstrap(roomId, state); } catch (e) { console.warn('detached bootstrap joinRoom failed', e); }

        if (USE_SUPABASE_REALTIME) {
          await subscribeRoomDb(roomId);
          try { await subscribeRoomTokensDb(roomId); } catch (e) { console.warn('tokens subscribe failed', e); }
          try { await subscribeRoomLogDb(roomId); } catch (e) { console.warn('log subscribe failed', e); }
          try { await subscribeRoomDiceDb(roomId); } catch (e) { console.warn('dice subscribe failed', e); }
          try { await subscribeDetachedRoomTables(roomId); } catch (e) { console.warn('detached subscribe failed', e); }
          await subscribeRoomMembersDb(roomId);
        } else {
          try { await stopSupabaseRealtimeChannels(); } catch (e) { console.warn('disable supabase realtime failed', e); }
        }

        try { await hydrateDetachedRoomData(roomId); } catch (e) { console.warn('detached init failed', e); }
        if (Array.isArray(payload.members)) {
          try {
            usersById.clear();
            payload.members.forEach((row) => {
              const uid = String(row?.userId || row?.id || '');
              if (!uid) return;
              usersById.set(uid, {
                name: row?.name || 'Unknown',
                role: normalizeRoleForUi(row?.role)
              });
            });
            updatePlayerList();
            try { window.RoomChat?.refreshUsers?.(); } catch {}
          } catch (e) {
            console.warn('joinRoom members snapshot failed', e);
            await refreshRoomMembers(roomId, { broadcast: false });
          }
        } else {
          await refreshRoomMembers(roomId, { broadcast: false });
        }
        startRoomMembersPolling(roomId);
        const __initialStateApplied = applyDetachedPayloadToState(state);
        try { rememberRoomStateShadow(roomId, __initialStateApplied); } catch {}
        handleMessage({ type: "state", state: stripRoomSecretsFromState(__initialStateApplied) });

        try {
          const logRows = await loadRoomLog(roomId, 200);
          handleMessage({ type: 'logInit', rows: logRows });
        } catch (e) { console.warn('log init failed', e); }
        try {
          const mapId = String(state?.currentMapId || '');
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
        if (typeof isSpectator === 'function' && isSpectator()) return;
        // v4: dice events are append-only in room_dice_events (and log is append-only in room_log)
        const ev = msg.event || {};
        const insertResult = await insertDiceEvent(currentRoomId, ev);
        const diceLogText = buildDiceLogText(ev);
        const logRow = insertResult?.logRow || (diceLogText ? { text: diceLogText, created_at: new Date().toISOString() } : null);
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
        await appendRoomLogEntry(currentRoomId, msg.text, { noOptimistic: !!msg.noOptimistic });
        break;
      }

      // NOTE: do not add new switch cases below without care.
      // Some game mechanics (initiative/combat join) need to broadcast dice rolls
      // without writing to room_state (to avoid overwriting fresh state with lastState).

      // ===== Saved bases (characters) =====
      case "listSavedBases": {
        try { await migrateLegacyCharactersIfNeeded(); } catch (e) { console.warn('legacy characters migration failed', e); }
        const payload = await window.CharactersApi.listSavedBases();
        handleMessage({ type: "savedBasesList", list: Array.isArray(payload.list) ? payload.list : [] });
        break;
      }

      case "saveSavedBase": {
        const sheet = msg.sheet;
        const name = String(sheet?.parsed?.name?.value ?? sheet?.parsed?.name ?? sheet?.parsed?.profile?.name ?? "Персонаж").trim() || "Персонаж";
        const payload = await window.CharactersApi.saveSavedBase({
          name,
          state: { schemaVersion: 1, savedAt: new Date().toISOString(), data: sheet }
        });
        handleMessage({ type: "savedBaseSaved", id: payload?.character?.id, name: payload?.character?.name || name });
        break;
      }

      case "deleteSavedBase": {
        const savedId = String(msg.savedId || "");
        if (!savedId) return;
        await window.CharactersApi.deleteSavedBase(savedId);
        handleMessage({ type: "savedBaseDeleted", savedId });
        break;
      }

      case "applySavedBase": {
        const savedId = String(msg.savedId || "");
        if (!currentRoomId || !lastState) return;
        const payload = await window.CharactersApi.getSavedBase(savedId);
        const savedSheet = payload?.character?.state?.data;
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

      case "inventoryTransferRequest": {
        if (!currentRoomId || !lastState) return;
        const next = deepClone(lastState);
        const isGm = (String(myRole || "") === "GM");
        const myUserId = String(getAppStorageItem("int_user_id") || "");

        const fromPlayerId = String(msg.fromPlayerId || "").trim();
        const toPlayerId = String(msg.toPlayerId || "").trim();
        const tabId = String(msg.tabId || "other").trim() || 'other';
        const idx = Math.max(0, Number(msg.itemIdx) || 0);
        const qty = Math.max(1, Number(msg.qty) || 1);
        if (!fromPlayerId || !toPlayerId || fromPlayerId === toPlayerId) return;

        const fromPlayer = (next.players || []).find((pl) => String(pl?.id || '') === fromPlayerId);
        const toPlayer = (next.players || []).find((pl) => String(pl?.id || '') === toPlayerId);
        if (!fromPlayer || !toPlayer || !toPlayer.isBase) return;

        const ownsFrom = String(fromPlayer?.ownerId || '') === myUserId;
        if (!isGm && !ownsFrom) return;

        const items = fromPlayer?.sheet?.parsed?.inventory?.[tabId];
        if (!Array.isArray(items) || idx < 0 || idx >= items.length) return;
        const item = items[idx];
        const maxQty = Math.max(1, Number(item?.qty) || 1);
        if (qty > maxQty) return;

        const offer = {
          id: (crypto?.randomUUID ? crypto.randomUUID() : (`inv-offer-${Date.now()}-${Math.random().toString(16).slice(2)}`)),
          createdAt: Date.now(),
          fromPlayerId,
          fromPlayerName: String(fromPlayer?.name || 'Игрок').trim() || 'Игрок',
          fromOwnerId: String(fromPlayer?.ownerId || ''),
          toPlayerId,
          toPlayerName: String(toPlayer?.name || 'Игрок').trim() || 'Игрок',
          toOwnerId: String(toPlayer?.ownerId || ''),
          tabId,
          itemIdx: idx,
          itemId: String(item?.id || ''),
          itemName: String(item?.name_ru || item?.name || item?.name_en || 'Предмет').trim() || 'Предмет',
          qty
        };

        try {
          sendWsEnvelope({ type: 'inventoryTransferOffer', roomId: currentRoomId, offer }, { optimisticApplied: true });
        } catch {}
        break;
      }

      case "inventoryTransferRespond": {
        if (!currentRoomId || !lastState) return;
        const next = deepClone(lastState);
        const myUserId = String(getAppStorageItem("int_user_id") || myId || "");
        const offer = (msg && typeof msg.offer === 'object') ? msg.offer : null;
        const accepted = !!msg.accepted;
        if (!offer) return;

        const fromPlayerId = String(offer.fromPlayerId || '').trim();
        const toPlayerId = String(offer.toPlayerId || '').trim();
        const tabId = String(offer.tabId || 'other').trim() || 'other';
        const idx = Math.max(0, Number(offer.itemIdx) || 0);
        const qty = Math.max(1, Number(offer.qty) || 1);
        if (!fromPlayerId || !toPlayerId || fromPlayerId === toPlayerId) return;

        const fromPlayer = (next.players || []).find((pl) => String(pl?.id || '') === fromPlayerId);
        const toPlayer = (next.players || []).find((pl) => String(pl?.id || '') === toPlayerId);
        if (!fromPlayer || !toPlayer || !toPlayer.isBase) return;

        const ownsTo = String(toPlayer?.ownerId || '') === myUserId;
        if (!ownsTo) return;

        const notify = (message) => {
          const result = {
            id: String(offer.id || ''),
            accepted: false,
            fromPlayerId: String(fromPlayer?.id || ''),
            toPlayerId: String(toPlayer?.id || ''),
            fromOwnerId: String(fromPlayer?.ownerId || ''),
            toOwnerId: String(toPlayer?.ownerId || ''),
            message: String(message || 'Передача отменена.')
          };
          try {
            sendWsEnvelope({ type: 'inventoryTransferResult', roomId: currentRoomId, result }, { optimisticApplied: true });
          } catch {}
        };

        if (!accepted) {
          notify(`Игрок ${String(toPlayer?.name || 'получатель')} отклонил передачу ${qty} × ${String(offer?.itemName || 'предмет')}.`);
          break;
        }

        const fromItems = fromPlayer?.sheet?.parsed?.inventory?.[tabId];
        if (!Array.isArray(fromItems) || idx < 0 || idx >= fromItems.length) {
          notify('Передача не удалась: предмет больше недоступен у отправителя.');
          break;
        }

        const fromItem = fromItems[idx];
        const currentQty = Math.max(1, Number(fromItem?.qty) || 1);
        if (qty > currentQty) {
          notify('Передача не удалась: у отправителя недостаточно количества предмета.');
          break;
        }

        if (String(offer.itemId || '') && String(fromItem?.id || '') !== String(offer.itemId || '')) {
          notify('Передача не удалась: предмет у отправителя изменился.');
          break;
        }

        const result = {
          id: String(offer.id || ''),
          accepted: true,
          fromPlayerId: String(fromPlayer?.id || ''),
          toPlayerId: String(toPlayer?.id || ''),
          fromOwnerId: String(fromPlayer?.ownerId || ''),
          toOwnerId: String(toPlayer?.ownerId || ''),
          tabId,
          itemIdx: idx,
          itemId: String(offer.itemId || fromItem?.id || ''),
          itemName: String(offer?.itemName || fromItem?.name_ru || fromItem?.name || fromItem?.name_en || 'предмет'),
          qty,
          message: `Передано ${qty} × ${String(offer?.itemName || 'предмет')} игроку ${String(toPlayer?.name || 'получатель')}.`
        };
        try {
          sendWsEnvelope({ type: 'inventoryTransferResult', roomId: currentRoomId, result }, { optimisticApplied: true });
        } catch {}
        break;
      }

      case "coinsTransfer": {
        if (!currentRoomId || !lastState) return;
        const next = deepClone(lastState);
        const isGm = (String(myRole || "") === "GM");
        const myUserId = String(getAppStorageItem("int_user_id") || "");

        const fromPlayerId = String(msg.fromPlayerId || '').trim();
        const toPlayerId = String(msg.toPlayerId || '').trim();
        const coin = String(msg.coin || 'gp').trim().toLowerCase();
        const amount = Math.max(1, Math.trunc(Number(msg.amount) || 1));
        const validCoins = new Set(['cp','sp','ep','gp','pp']);
        if (!fromPlayerId || !toPlayerId || fromPlayerId === toPlayerId) return;
        if (!validCoins.has(coin)) return;

        const fromPlayer = (next.players || []).find((pl) => String(pl?.id || '') === fromPlayerId);
        const toPlayer = (next.players || []).find((pl) => String(pl?.id || '') === toPlayerId);
        if (!fromPlayer || !toPlayer || !toPlayer.isBase) return;

        const ownsFrom = String(fromPlayer?.ownerId || '') === myUserId;
        if (!isGm && !ownsFrom) return;

        const ensureCoins = (pl) => {
          if (!pl.sheet || typeof pl.sheet !== 'object') pl.sheet = { parsed: {} };
          if (!pl.sheet.parsed || typeof pl.sheet.parsed !== 'object') pl.sheet.parsed = {};
          if (!pl.sheet.parsed.coins || typeof pl.sheet.parsed.coins !== 'object') {
            pl.sheet.parsed.coins = { cp:{value:0}, sp:{value:0}, ep:{value:0}, gp:{value:0}, pp:{value:0} };
          }
          const c = pl.sheet.parsed.coins;
          ['cp','sp','ep','gp','pp'].forEach((k) => {
            if (!c[k] || typeof c[k] !== 'object') c[k] = { value: 0 };
            c[k].value = Math.max(0, Number(c[k].value) || 0);
          });
          return c;
        };

        const fromCoins = ensureCoins(fromPlayer);
        const toCoins = ensureCoins(toPlayer);

        if ((Number(fromCoins?.[coin]?.value) || 0) < amount) {
          const failResult = {
            accepted: false,
            fromPlayerId: String(fromPlayer?.id || ''),
            toPlayerId: String(toPlayer?.id || ''),
            fromOwnerId: String(fromPlayer?.ownerId || ''),
            toOwnerId: String(toPlayer?.ownerId || ''),
            message: 'Передача монет не удалась: недостаточно средств.'
          };
          try {
            handleMessage({ type: 'coinsTransferResult', result: failResult });
          } catch {}
          break;
        }

        fromCoins[coin].value = Math.max(0, Number(fromCoins[coin].value) - amount);
        toCoins[coin].value = Math.max(0, Number(toCoins[coin].value) + amount);

        try {
          fromPlayer.sheetUpdatedAt = Date.now();
          toPlayer.sheetUpdatedAt = Date.now();
        } catch {}

        try {
          const optimisticCoinState = syncActiveToMap(deepClone(next));
          try { syncOptimisticPlayersToLocalState(optimisticCoinState); } catch {}
          handleMessage({ type: 'state', state: optimisticCoinState });
          try { applyOptimisticPlayerVisuals(lastState || optimisticCoinState); } catch {}
        } catch {}

        try {
          sendWsEnvelope({
            type: 'coinsTransfer',
            roomId: currentRoomId,
            transfer: {
              id: (crypto?.randomUUID ? crypto.randomUUID() : (`coins-transfer-${Date.now()}-${Math.random().toString(16).slice(2)}`)),
              createdAt: Date.now(),
              fromPlayerId: String(fromPlayer?.id || ''),
              toPlayerId: String(toPlayer?.id || ''),
              fromOwnerId: String(fromPlayer?.ownerId || ''),
              toOwnerId: String(toPlayer?.ownerId || ''),
              coin,
              amount
            }
          }, { optimisticApplied: true });
        } catch {}
        break;
      }

      case "setPlayerSheet": {
  if (!currentRoomId) return;
  if (!lastState) return;

  const next = deepClone(lastState);
  const isGm = (String(myRole || "") === "GM");
  const myUserId = String(getAppStorageItem("int_user_id") || "");

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

  let optimisticSheetState = null;
  try {
    optimisticSheetState = syncActiveToMap(deepClone(next));
    try { syncOptimisticPlayersToLocalState(optimisticSheetState); } catch {}
    handleMessage({ type: 'state', state: optimisticSheetState });
    try { applyOptimisticPlayerVisuals(lastState || optimisticSheetState); } catch {}
  } catch {}

  let sheetRelaySent = false;
  try {
    if (optimisticSheetState) {
      sheetRelaySent = !!sendWsEnvelope({
        type: 'playerPatch',
        roomId: currentRoomId,
        playerId: String(p.id || msg.id || ''),
        patch: {
          sheet: deepClone(p.sheet),
          sheetUpdatedAt: Number(p.sheetUpdatedAt) || Date.now(),
          name: String(p.name || '')
        }
      }, { optimisticApplied: true });
    }
  } catch (e) {
    console.warn('sheet immediate relay failed', e);
  }

  if (!sheetRelaySent) {
    try {
      upsertRoomState(currentRoomId, next)
        .catch((e) => { try { console.debug?.('sheet background persist failed', e); } catch {} });
    } catch (e) {
      try { console.debug?.('sheet background persist schedule failed', e); } catch {}
    }
  }
  break;
}

// ===== Game logic (DB truth via room_state.state) =====
      default: {
        if (!currentRoomId) return;
        if (!lastState) return;

        const next = deepClone(lastState);
        const isGM = (String(myRole || "") === "GM");
        const myUserId = String(getAppStorageItem("int_user_id") || "");

        const ownsPlayer = (pl) => pl && String(pl.ownerId) === myUserId;

        const type = msg.type;
        let handled = false;
        let pendingCreatedPlayerId = "";

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
            phase: 'exploration',
            phaseEpoch: 0,
            combatSelectionEpoch: 0,
            turnOrder: [],
            currentTurnIndex: 0,
            round: 1,
            turnEpoch: 0,
            playerStates: {},
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

        else if (type === "setCellFeet") {
          if (!isGM) return;
          handled = true;
          const value = clamp(Number(msg.value) || 10, 1, 100);
          next.cellFeet = value;
          logEventToState(next, `Масштаб клетки изменён: 1 клетка = ${value} фут.`);
        }


        if (handled) {
          try {
            const optimisticCampaignState = syncActiveToMap(deepClone(next));
            try { syncOptimisticPlayersToLocalState(optimisticCampaignState); } catch {}
            handleMessage({ type: 'state', state: optimisticCampaignState });
            try { applyOptimisticPlayerVisuals(lastState || optimisticCampaignState); } catch {}
          } catch (e) {
            console.warn('campaign optimistic state apply failed', e);
          }

          let campaignPatchSent = false;
          try {
            const livePatch = buildRealtimeStatePatchForMessage(type, msg, next, isGM, myUserId);
            if (livePatch) {
              campaignPatchSent = !!sendWsEnvelope({
                type: 'statePatch',
                roomId: currentRoomId,
                patch: livePatch
              }, { optimisticApplied: true });
            }
          } catch (e) {
            console.warn('campaign statePatch relay failed', e);
          }

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
          if (!shouldUsePatchOnlyRealtime(type, campaignPatchSent)) {
            await upsertRoomState(currentRoomId, next);
          }
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
          bumpPhaseEpoch(next);
          bumpCombatSelectionEpoch(next);
          next.initiativeEpoch = Date.now();
          next.turnOrder = [];
          next.currentTurnIndex = 0;
          next.round = 1;
          next.turnEpoch = 0;
          // Initiative is now per-combatant, not "everyone in the room".
          // Default selection: those already placed on the board.
          (next.players || []).forEach(p => {
            if (!p) return;
            const isEligibleOnMap = !isMapScopedPlayer(p) || String(p?.mapId || '').trim() === String(next?.currentMapId || '').trim();
            const placed = (p && p.x !== null && p.y !== null);
            p.inCombat = !!placed && !!isEligibleOnMap;
            // Always reset initiative-related fields for everyone.
            // This keeps GM and players strictly in sync when initiative phase restarts.
            p.initiative = null;
            p.hasRolledInitiative = false;
            p.pendingInitiativeChoice = false;
            p.willJoinNextRound = false;
            p.initiativeMode = normalizeInitiativeMode(p.initiativeMode || 'normal');
          });
          logEventToState(next, "GM начал фазу инициативы (выбор участников)");
          try {
            sendWsEnvelope({
              type: 'initiativeReset',
              roomId: String(currentRoomId || ''),
              epoch: Number(next.initiativeEpoch) || Date.now()
            }, { optimisticApplied: true });
          } catch {}
        }

        else if (type === 'setPlayerInCombat') {
          // GM selects who participates in the fight (initiative + turn order scope)
          if (!isGM) return;
          const pid = String(msg.id || '');
          if (!pid) return;
          const p = (next.players || []).find(pp => String(pp?.id) === pid);
          if (!p) return;
          const inCombat = !!msg.inCombat;
          if (inCombat && isMapScopedPlayer(p)) {
            const activeMapId = String(next?.currentMapId || '').trim();
            const playerMapId = String(p?.mapId || '').trim();
            if (!activeMapId || !playerMapId || activeMapId !== playerMapId) {
              p.inCombat = false;
              p.pendingInitiativeChoice = false;
              p.willJoinNextRound = false;
              return;
            }
          }
          p.inCombat = inCombat;
          if (!inCombat) {
            p.pendingInitiativeChoice = false;
            p.willJoinNextRound = false;
          }

          // If combat is already running and a new combatant is added, queue for next round.
          if (next.phase === 'combat' && inCombat) {
            if (!p.hasRolledInitiative) p.pendingInitiativeChoice = true;
            p.willJoinNextRound = true;
          }

          logEventToState(next, `${p.name} ${inCombat ? 'вступает' : 'выходит'} из боя`);
          bumpCombatSelectionEpoch(next);
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
            if (inCombat && isMapScopedPlayer(p)) {
              const activeMapId = String(next?.currentMapId || '').trim();
              const playerMapId = String(p?.mapId || '').trim();
              if (!activeMapId || !playerMapId || activeMapId !== playerMapId) {
                p.inCombat = false;
                p.pendingInitiativeChoice = false;
                p.willJoinNextRound = false;
                changed++;
                continue;
              }
            }
            p.inCombat = inCombat;
            if (!inCombat) {
              p.pendingInitiativeChoice = false;
              p.willJoinNextRound = false;
            }

            // If combat is already running and a new combatant is added, queue for next round.
            if (next.phase === 'combat' && inCombat) {
              if (!p.hasRolledInitiative) p.pendingInitiativeChoice = true;
              p.willJoinNextRound = true;
            }
            changed++;
          }

          if (changed) {
            logEventToState(next, `GM изменил участников боя: ${changed}`);
            bumpCombatSelectionEpoch(next);
          }
        }

        else if (type === "startExploration") {
          if (!isGM) return;
          next.phase = "exploration";
          bumpPhaseEpoch(next);
          // В исследовании очередь хода не нужна
          next.turnOrder = [];
          next.currentTurnIndex = 0;
          next.round = 1;
          next.turnEpoch = 0;
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
              mapId: String(next?.currentMapId || ''),
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
          const DEFAULT_ALLY_BASE_URL = 'token/sheet/souz.png';
          const DEFAULT_MONSTER_BASE_URL = 'token/sheet/monstr.png';
          const ownerRole = String(myRole || "").trim() || "";
          const wantsEnemy = !!player.isEnemy;
          const isAlly = (ownerRole === "GM") ? (!!player.isAlly && !wantsEnemy) : !!player.isAlly;
          const isEnemy = (ownerRole === "GM") ? (!isAlly || wantsEnemy) : false;
          const isBase = !!player.isBase;
          const isMonster = !!player.isMonster;

          // Visibility + per-map scoping metadata:
          // - ownerRole allows clients to hide GM-created non-allies from other players.
          // - mapId allows GM to keep "map-local" NPCs/monsters per active map.
          //   Bases and Allies are global across maps.
          const activeMapId = String(next?.currentMapId || "").trim() || null;
          const mapId = (isEnemy && !isBase)
            ? (activeMapId || null)
            : null;

          // Visibility:
          // - GM-created non-allies are hidden from other users by default (isPublic=false).
          // - Allies are always visible with full info.
          // - Non-GM owners default to visible.
          const isPublic = (ownerRole === "GM") ? !!isAlly : true;
          if (isBase) {
            const exists = (next.players || []).some(p => p.isBase && p.ownerId === myUserId);
            if (exists) {
              handleMessage({ type: "error", message: "У вас уже есть Основа. Можно иметь только одну основу на пользователя." });
              return;
            }
          }
          const id = player.id || (crypto?.randomUUID ? crypto.randomUUID() : ("p-" + Math.random().toString(16).slice(2)));
          pendingCreatedPlayerId = String(id);
          const defaultTokenBaseUrl = isEnemy
            ? DEFAULT_MONSTER_BASE_URL
            : ((isAlly || (!isBase && ownerRole !== 'GM')) ? DEFAULT_ALLY_BASE_URL : '');
          const hasRoleTokenPreset = !!defaultTokenBaseUrl;
          const providedSheet = (player.sheet && typeof player.sheet === 'object') ? player.sheet : null;
          const defaultSheet = {
            parsed: {
              name: { value: player.name },
              appearance: {
                baseUrl: defaultTokenBaseUrl,
                token: {
                  mode: hasRoleTokenPreset ? 'full' : 'crop',
                  crop: { x: 50, y: 35, zoom: 140 }
                }
              }
            }
          };
          const resolvedSheet = (() => {
            if (!providedSheet) return defaultSheet;
            const parsed = (providedSheet.parsed && typeof providedSheet.parsed === 'object')
              ? providedSheet.parsed
              : ((providedSheet && typeof providedSheet === 'object') ? providedSheet : {});
            if (!parsed.appearance || typeof parsed.appearance !== 'object') parsed.appearance = {};
            if (!String(parsed.appearance.baseUrl || '').trim() && defaultTokenBaseUrl) {
              parsed.appearance.baseUrl = defaultTokenBaseUrl;
            }
            if (!parsed.appearance.token || typeof parsed.appearance.token !== 'object') parsed.appearance.token = {};
            if (!String(parsed.appearance.token.mode || '').trim()) {
              parsed.appearance.token.mode = hasRoleTokenPreset ? 'full' : 'crop';
            }
            if (!parsed.appearance.token.crop || typeof parsed.appearance.token.crop !== 'object') {
              parsed.appearance.token.crop = { x: 50, y: 35, zoom: 140 };
            } else {
              if (parsed.appearance.token.crop.x === undefined) parsed.appearance.token.crop.x = 50;
              if (parsed.appearance.token.crop.y === undefined) parsed.appearance.token.crop.y = 35;
              if (parsed.appearance.token.crop.zoom === undefined) parsed.appearance.token.crop.zoom = 140;
            }
            if (!providedSheet.parsed || typeof providedSheet.parsed !== 'object') {
              return { ...providedSheet, parsed };
            }
            providedSheet.parsed = parsed;
            return providedSheet;
          })();

          next.players.push({
            id,
            name: player.name,
            color: player.color,
            size: player.size,
            x: null,
            y: null,
            initiative: 0,
            hasRolledInitiative: false,
            initiativeMode: 'normal',
            // If created during combat/initiative, do NOT auto-join.
            // GM can add to combat via the Turn Order panel.
            pendingInitiativeChoice: false,
            willJoinNextRound: false,
            inCombat: false,
            isBase,
            isAlly,
            isEnemy,
            isPublic,
            isMonster,
            monsterId: player.monsterId || null,
            ownerId: myUserId,
            ownerRole,
            mapId,
            ownerName: myNameSpan?.textContent || "",
            sheet: resolvedSheet
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
          setTokenVisibilityOptimisticGuard(pid, p.isPublic, p.mapId || next.currentMapId || '');
          try {
            sendWsEnvelope({
              type: 'playerPatch',
              roomId: currentRoomId,
              playerId: pid,
              patch: { isPublic: p.isPublic }
            }, { optimisticApplied: true });
          } catch {}
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

        else if (type === 'setInitiativeMode') {
          if (next.phase !== 'initiative') return;
          const pid = String(msg.id || '');
          if (!pid) return;
          const p = (next.players || []).find(pp => String(pp?.id || '') === pid);
          if (!p) return;
          if (!isGM && !ownsPlayer(p)) return;
          p.initiativeMode = normalizeInitiativeMode(msg.mode);
        }

        else if (type === 'rollInitiativeFor') {
          if (next.phase !== 'initiative') return;
          const pid = String(msg.id || '');
          if (!pid) return;
          const p = (next.players || []).find(pp => String(pp?.id || '') === pid);
          if (!p) return;
          if (!isGM && !ownsPlayer(p)) return;
          if (p.hasRolledInitiative && !isGM) return;
          if (!isPlayerEligibleForCurrentMapCombat(p, next)) return;

          const roll = buildInitiativeRollForPlayer(p);
          p.initiative = Number(roll.total) || 0;
          p.hasRolledInitiative = true;
          p.pendingInitiativeChoice = false;
          try {
            rememberPendingInitiativeOverlay(currentRoomId, [{ playerId: p.id, total: p.initiative }], {
              epoch: Number(next?.initiativeEpoch) || 0
            });
          } catch {}
          await broadcastDiceEventOnly({
            fromId: myUserId,
            fromName: p.name,
            kindText: roll.kindText,
            sides: 20,
            count: roll.rolls.length,
            bonus: Number(roll.dexMod) || 0,
            rolls: roll.rolls,
            total: Number(roll.total) || 0,
            crit: ""
          });
        }

        else if (type === 'rollInitiativeAllOwned') {
          if (next.phase !== 'initiative') return;
          const owned = (next.players || []).filter((p) => (
            p &&
            String(p.ownerId || '') === String(myUserId || '') &&
            isPlayerEligibleForCurrentMapCombat(p, next) &&
            !p.hasRolledInitiative
          ));
          if (!owned.length) return;

          for (const p of owned) {
            const roll = buildInitiativeRollForPlayer(p);
            p.initiative = Number(roll.total) || 0;
            p.hasRolledInitiative = true;
            p.pendingInitiativeChoice = false;
            try {
              rememberPendingInitiativeOverlay(currentRoomId, [{ playerId: p.id, total: p.initiative }], {
                epoch: Number(next?.initiativeEpoch) || 0
              });
            } catch {}
            await broadcastDiceEventOnly({
              fromId: myUserId,
              fromName: p.name,
              kindText: roll.kindText,
              sides: 20,
              count: roll.rolls.length,
              bonus: Number(roll.dexMod) || 0,
              rolls: roll.rolls,
              total: Number(roll.total) || 0,
              crit: ""
            });
          }
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
            const gmRoll = buildInitiativeRollForPlayer(p);
            total = gmRoll.total;
            const modeLabel = gmRoll.mode === 'advantage' ? ' с преимуществом' : gmRoll.mode === 'disadvantage' ? ' с помехой' : '';
            kindText = `Инициатива (GM${modeLabel}): d20${gmRoll.dexMod >= 0 ? '+' : ''}${gmRoll.dexMod}`;
            rolls = gmRoll.rolls;
            bonus = gmRoll.dexMod;
            const sign = bonus >= 0 ? '+' : '';
            if (rolls.length > 1) {
              logEventToState(next, `GM бросил инициативу за ${p.name}: [${rolls.join(', ')}]${sign}${bonus} = ${total}`);
            } else {
              logEventToState(next, `GM бросил инициативу за ${p.name}: ${rolls[0]}${sign}${bonus} = ${total}`);
            }
          }

          p.initiative = total;
          p.hasRolledInitiative = true;
          p.pendingInitiativeChoice = false;
          if (next.phase === 'combat') p.willJoinNextRound = true;
          try {
            rememberPendingInitiativeOverlay(currentRoomId, [{
              playerId: p.id,
              total: p.initiative,
              willJoinNextRound: !!p.willJoinNextRound
            }], {
              epoch: Number(next?.initiativeEpoch) || 0
            });
          } catch {}

          await broadcastDiceEventOnly({
            fromId: myUserId,
            fromName: 'GM',
            kindText,
            sides: 20,
            count: rolls.length || 1,
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

          const preferredMonsterSize = getMonsterPreferredTokenSize(p);
          const size = Math.max(1, Number(p.size) || 1, Number(preferredMonsterSize) || 1);
          p.size = size;
          const maxX = next.boardWidth - size;
          const maxY = next.boardHeight - size;
          const prevX = (p.x === null || typeof p.x === 'undefined') ? null : Number(p.x);
          const prevY = (p.y === null || typeof p.y === 'undefined') ? null : Number(p.y);
          const nx = clamp(Number(msg.x) || 0, 0, maxX);
          const ny = clamp(Number(msg.y) || 0, 0, maxY);

          // Authoritative movement now goes through VPS.
          // Keep optimistic local update for instant UX, then wait for tokenRow from WS.
          try {
            if (p) { p.x = nx; p.y = ny; }
            try {
              setTokenMoveOptimisticGuard(
                String(p?.id || ''),
                nx,
                ny,
                String(next?.currentMapId || p?.mapId || ''),
                prevX,
                prevY,
                {
                  size: Number(p?.size) || 1,
                  color: p?.color || null,
                  isPublic: !!p?.isPublic
                }
              );
            } catch {}
            try {
              setTokenSnapshotCached(String(p?.id || ''), String(next?.currentMapId || p?.mapId || ''), {
                x: nx,
                y: ny,
                size: Number(p?.size) || 1,
                color: p?.color || null,
                mapId: String(next?.currentMapId || p?.mapId || ''),
                updatedAt: Date.now()
              });
            } catch {}
            try {
              const pid = String(p?.id || '');
              const syncCoords = (entry) => {
                if (!entry || String(entry?.id || '') !== pid) return;
                entry.x = nx;
                entry.y = ny;
              };
              (Array.isArray(lastState?.players) ? lastState.players : []).forEach(syncCoords);
              (Array.isArray(players) ? players : []).forEach(syncCoords);
              if (selectedPlayer && String(selectedPlayer?.id || '') === pid) {
                selectedPlayer.x = nx;
                selectedPlayer.y = ny;
              }
            } catch {}
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
            await waitForPendingPlayerCreateStateWrite(String(p.id));
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
              size: Number(p?.size) || 1,
              isPublic: !!p?.isPublic,
              client_ts: Date.now()
            }, { optimisticApplied: true });

            // Authoritative persistence is handled by VPS. The client keeps only the
            // optimistic UI position until tokenRow comes back from the server.
          } catch (e) {
            console.warn('moveToken ws send failed', e);
            handleMessage({ type: 'error', message: 'Не удалось отправить перемещение на сервер' });
          }

          // IMPORTANT: movement is NOT persisted via room_state.
          const moved = false && ((prevX !== nx) || (prevY !== ny));
          if (moved) {
            try { await appendRoomLogEntry(currentRoomId, `${p.name} переместил токен`); } catch {}
          }
          if (msg.usedDash) {
            try { await appendRoomLogEntry(currentRoomId, `${p.name} использовал Рывок`); } catch {}
          }
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
              mapId: String(next?.currentMapId || ''),
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
              mapId: String(next?.currentMapId || ''),
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
            if (currentRoomId) {
              sendWsEnvelope({
                type: 'tokenRowDeleted',
                roomId: String(currentRoomId || ''),
                row: { room_id: String(currentRoomId || ''), token_id: String(p.id) }
              }, { optimisticApplied: true });
            }
          } catch (e) {
            console.warn('removePlayerCompletely: room_tokens delete failed', e);
          }

          const removedId = String(msg.id || '');
          const prevTurnOrder = Array.isArray(next.turnOrder) ? next.turnOrder.map(id => String(id)) : [];
          const removedTurnIdx = prevTurnOrder.indexOf(removedId);
          const prevCurrentTurnIdx = Math.max(0, Number(next.currentTurnIndex) || 0);
          next.players = (next.players || []).filter(pl => pl.id !== msg.id);
          next.turnOrder = (next.turnOrder || []).filter(id => id !== msg.id);
          if (removedTurnIdx >= 0) {
            if (next.turnOrder.length <= 0) {
              next.currentTurnIndex = 0;
            } else if (removedTurnIdx < prevCurrentTurnIdx) {
              next.currentTurnIndex = Math.max(0, prevCurrentTurnIdx - 1);
            } else if (removedTurnIdx === prevCurrentTurnIdx) {
              next.currentTurnIndex = Math.min(prevCurrentTurnIdx, next.turnOrder.length - 1);
            } else {
              next.currentTurnIndex = Math.min(prevCurrentTurnIdx, next.turnOrder.length - 1);
            }
            next.turnEpoch = Math.max(Date.now(), (Number(next.turnEpoch) || 0) + 1);
          }
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
          const incoming = (msg.bgMusic && typeof msg.bgMusic === 'object') ? deepClone(msg.bgMusic) : { tracks: [], currentTrackId: null, isPlaying: false, startedAt: 0, pausedAt: 0, volume: 40 };
          if (!Array.isArray(incoming.tracks)) incoming.tracks = [];
          incoming.tracks = incoming.tracks.slice(0, 10).map(t => ({
            id: String(t?.id || ''),
            name: String(t?.name || ''),
            desc: String(t?.desc || t?.description || ''),
            description: String(t?.description || t?.desc || ''),
            url: String(t?.url || ''),
            path: String(t?.path || ''),
            source: String(t?.source || ''),
            fileName: String(t?.fileName || t?.serverFileName || t?.name || ''),
            serverFileName: String(t?.serverFileName || t?.fileName || t?.name || ''),
            storageKey: String(t?.storageKey || t?.deleteKey || t?.path || ''),
            deleteKey: String(t?.deleteKey || t?.storageKey || t?.path || ''),
            createdAt: String(t?.createdAt || '')
          })).filter(t => t.id && (t.url || t.path));
          incoming.currentTrackId = incoming.currentTrackId ? String(incoming.currentTrackId) : null;
          if (incoming.currentTrackId && !incoming.tracks.some(t => String(t.id || '') === String(incoming.currentTrackId))) {
            incoming.currentTrackId = incoming.tracks.length ? String(incoming.tracks[0].id || '') : null;
          }
          incoming.isPlaying = !!incoming.isPlaying;
          incoming.startedAt = Number.isFinite(Number(incoming.startedAt)) ? Math.max(0, Number(incoming.startedAt)) : 0;
          incoming.pausedAt = Number.isFinite(Number(incoming.pausedAt)) ? Math.max(0, Number(incoming.pausedAt)) : 0;
          incoming.volume = Number.isFinite(Number(incoming.volume)) ? clamp(Number(incoming.volume), 0, 100) : 40;

          try { __roomDetachedCache.music = deepClone(incoming); } catch {}
          _refreshDetachedRoomView();

          // Только GM сохраняет состояние музыки в БД и пишет лог.
          // Для остальных клиентов достаточно мгновенно применить detached-кэш.
          if (!isGM) return;

          await upsertRoomMusicState(currentRoomId, incoming);
          try { await insertRoomLog(currentRoomId, 'Фоновая музыка обновлена'); } catch {}
          return;
        }

        // ===== Marks / Areas (everyone can draw; GM can remove all) =====
        // ===== Marks / Areas (everyone can draw; GM can remove all) =====
        else if (type === 'addMark') {
          if (typeof isSpectator === 'function' && isSpectator()) return;
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
          if (typeof isSpectator === 'function' && isSpectator()) return;
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

        else if (type === 'moveMark') {
          if (typeof isSpectator === 'function' && isSpectator()) return;
          const raw = msg.mark;
          if (!raw || typeof raw !== 'object') return;
          const id = String(raw.id || '').trim();
          if (!id) return;
          const m = getActiveMap(next);
          if (!m) return;
          const mapId = String(next.currentMapId || m.id || '');
          const cached = Array.isArray(__roomDetachedCache.marksByMap.get(mapId)) ? __roomDetachedCache.marksByMap.get(mapId) : [];
          const mark = cached.find(mm => String(mm?.id || '') === id);
          if (!mark) return;
          if (!isGM && String(mark.ownerId || '') !== String(myId || '')) return;
          const safe = deepClone(mark);
          if (String(mark.kind || '') === 'rect') {
            safe.x = Number(raw.x) || 0;
            safe.y = Number(raw.y) || 0;
          } else if (String(mark.kind || '') === 'circle') {
            safe.cx = Number(raw.cx) || 0;
            safe.cy = Number(raw.cy) || 0;
          } else if (String(mark.kind || '') === 'pin') {
            safe.x = Number(raw.x) || 0;
            safe.y = Number(raw.y) || 0;
          } else if (String(mark.kind || '') === 'poly' && Array.isArray(raw.pts) && raw.pts.length >= 3) {
            safe.pts = raw.pts.map((p) => ({
              x: Number(p?.x) || 0,
              y: Number(p?.y) || 0
            }));
          }
          await upsertRoomMarkRow(currentRoomId, safe);
          _refreshDetachedRoomView();
          return;
        }

        else if (type === 'clearMarks') {
          if (typeof isSpectator === 'function' && isSpectator()) return;
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
            String(p.ownerId) === myUserId &&
            isPlayerEligibleForCurrentMapCombat(p, next) &&
            !p.hasRolledInitiative
          ));

          if (!toRoll.length) return;

          const updates = [];
          for (const p of toRoll) {
            const roll = buildInitiativeRollForPlayer(p);
            updates.push({
              playerId: p.id,
              total: roll.total,
              dexMod: roll.dexMod,
              name: p.name,
              rolls: roll.rolls,
              kindText: roll.kindText
            });
          }

          const initiativeEpoch = Number(next?.initiativeEpoch) || 0;

          // Instant local + WS apply (do not wait DB roundtrip).
          // This removes visible delay for the roller and makes updates realtime for everyone.
          try {
            handleMessage({
              type: 'initiativeApplied',
              updates: updates.map((u) => ({
                playerId: String(u?.playerId || ''),
                total: Number(u?.total) || 0
              })),
              epoch: initiativeEpoch
            });
          } catch {}
          try {
            rememberPendingInitiativeOverlay(currentRoomId, updates, { epoch: initiativeEpoch });
          } catch {}
          let initiativeRelaySent = false;
          try {
            initiativeRelaySent = !!sendWsEnvelope({
              type: 'initiativeApplied',
              roomId: String(currentRoomId || ''),
              updates: updates.map((u) => ({
                playerId: String(u?.playerId || ''),
                total: Number(u?.total) || 0
              })),
              epoch: initiativeEpoch
            }, { optimisticApplied: true });
          } catch {}

          for (const u of updates) {
            // Live dice event (broadcast only) – includes its own log line in room_log.
            await broadcastDiceEventOnly({
              fromId: myUserId,
              fromName: u.name,
              kindText: String(u.kindText || `Инициатива: d20${Number(u.dexMod) >= 0 ? "+" : ""}${Number(u.dexMod) || 0}`),
              sides: 20,
              count: Array.isArray(u.rolls) ? u.rolls.length : 1,
              bonus: Number(u.dexMod) || 0,
              rolls: Array.isArray(u.rolls) ? u.rolls.map((v) => Number(v) || 0) : [],
              total: Number(u.total) || 0,
              crit: ""
            });
          }

          // Atomic-ish persist to room_state (retry on collision).
          // UI is already updated optimistically above, so persistence must not block realtime.
          if (!initiativeRelaySent) try {
            applyInitiativeAtomic(currentRoomId, myUserId, updates, {
              expectedEpoch: initiativeEpoch
            }).then((appliedUpdates) => {
              if (!Array.isArray(appliedUpdates) || !appliedUpdates.length) return;

              // Immediately keep the local UI in sync even if a slightly stale room_state snapshot
              // arrives before the DB echo/WS refresh.
              try { rememberPendingInitiativeOverlay(currentRoomId, appliedUpdates, { epoch: initiativeEpoch }); } catch {}
              try {
                // IMPORTANT: prefer the live local state first, because room_state shadow intentionally
                // does not carry authoritative token x/y positions (they are stored in room_tokens).
                // If we start from room_state shadow here, src.x/src.y become null and
                // syncOptimisticPlayersToLocalState(...) can momentarily hide all tokens on the board.
                const optimisticBase = lastState || getRoomStateShadow(currentRoomId) || next;
                const optimistic = deepClone(optimisticBase);
                (optimistic.players || []).forEach((p) => {
                  if (!p || !p.id) return;
                  const u = appliedUpdates.find(x => String(x?.playerId || '') === String(p.id));
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
            }).catch((e) => { try { console.debug?.('initiative background persist failed', e); } catch {} });
          } catch (e) {
            try { console.debug?.('initiative background persist schedule failed', e); } catch {}
          }

          // IMPORTANT: persistence is scheduled against the latest snapshot inside applyInitiativeAtomic.
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
          const combatantsOnActiveMap = combatants.filter((p) => isPlayerEligibleForCurrentMapCombat(p, next));
          const allRolled = combatantsOnActiveMap.length ? combatantsOnActiveMap.every(p => p.hasRolledInitiative) : false;
          if (!allRolled) {
            handleMessage({ type: "error", message: "Сначала бросьте инициативу за всех участников боя" });
            return;
          }
          next.turnOrder = [...combatantsOnActiveMap]
            .sort((a, b) => (Number(b.initiative) || 0) - (Number(a.initiative) || 0))
            .map(p => p.id);
          autoPlacePlayers(next);
          next.phase = "combat";
          bumpPhaseEpoch(next);
          next.currentTurnIndex = 0;
          next.round = 1;
          next.turnEpoch = Math.max(Date.now(), (Number(next.turnEpoch) || 0) + 1);
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
                  .filter(p => p && isPlayerEligibleForCurrentMapCombat(p, next) && (p.initiative !== null && p.initiative !== undefined) && p.hasRolledInitiative)
                  .sort((a, b) => (Number(b.initiative) || 0) - (Number(a.initiative) || 0))
                  .map(p => p.id)
              )];
            }
          }
          next.currentTurnIndex = wrapped ? 0 : nextIndex;
          next.turnEpoch = Math.max(Date.now(), (Number(next.turnEpoch) || 0) + 1);
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
          next.turnEpoch = 0;
          next.phaseEpoch = 0;
          next.combatSelectionEpoch = 0;
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

        let optimisticState = null;
        let finishPendingPlayerCreateStateWrite = null;
        try {
          if (pendingCreatedPlayerId) {
            finishPendingPlayerCreateStateWrite = markPendingPlayerCreateStateWrite(pendingCreatedPlayerId);
          }
        } catch {}
        try {
          // Supabase Realtime is disabled, so the local client must see state changes
          // immediately without waiting for a WS echo from the VPS.
          // Keep local volatile token/player fields in sync BEFORE message-ui snapshots
          // them, otherwise color/size/position can appear to rollback until the next
          // tokenRow or full refresh arrives.
          optimisticState = syncActiveToMap(deepClone(next));
          try { syncOptimisticPlayersToLocalState(optimisticState); } catch {}
          handleMessage({ type: 'state', state: optimisticState });
          try { applyOptimisticPlayerVisuals(lastState || optimisticState); } catch {}
        } catch (e) {
          console.warn('optimistic state apply failed', e);
        }

        let livePatchSent = false;
        try {
          const livePatch = buildRealtimeStatePatchForMessage(type, msg, optimisticState || next, isGM, myUserId);
          if (livePatch) {
            livePatchSent = !!sendWsEnvelope({
              type: 'statePatch',
              roomId: currentRoomId,
              patch: livePatch
            }, { optimisticApplied: true });
          }
        } catch (e) {
          console.warn('statePatch immediate relay failed', e);
        }

        let playerLifecycleRelaySent = false;
        try {
          if (type === 'addPlayer' && pendingCreatedPlayerId) {
            const created = (next.players || []).find(p => String(p?.id || '') === String(pendingCreatedPlayerId));
            if (created) {
              playerLifecycleRelaySent = !!sendWsEnvelope({
                type: 'playerCreate',
                roomId: currentRoomId,
                player: deepClone(created)
              }, { optimisticApplied: false });
            }
          } else if (type === 'removePlayerCompletely') {
            const playerId = String(msg.id || '').trim();
            if (playerId) {
              playerLifecycleRelaySent = !!sendWsEnvelope({
                type: 'playerDelete',
                roomId: currentRoomId,
                playerId
              }, { optimisticApplied: true });
            }
          }
        } catch (e) {
          console.warn('player lifecycle relay failed', e);
        }

        let stateRelaySent = false;
        const awaitingPlayerCreateEcho = (type === 'addPlayer' && playerLifecycleRelaySent && !!pendingCreatedPlayerId);
        if (awaitingPlayerCreateEcho) {
          try {
            const pid = String(pendingCreatedPlayerId || '');
            setTimeout(() => { try { window.finishPendingPlayerCreateStateWrite?.(pid); } catch {} }, 1800);
          } catch {}
        }
        const patchOnlyRealtime = shouldUsePatchOnlyRealtime(type, livePatchSent) || playerLifecycleRelaySent;
        if (patchOnlyRealtime) {
          stateRelaySent = true;
        } else if (optimisticState) {
          try {
            stateRelaySent = !!sendWsEnvelope({
              type: 'state',
              roomId: currentRoomId,
              state: stripRoomSecretsFromState(optimisticState)
            }, { optimisticApplied: true });
          } catch (e) {
            console.warn('state immediate relay failed', e);
          }
        }

        const needsHttpPersist = !stateRelaySent || (!!pendingCreatedPlayerId && !playerLifecycleRelaySent);
        if (needsHttpPersist) {
          try {
            upsertRoomState(currentRoomId, next)
              .catch((e) => { try { console.debug?.('room_state background persist failed', e); } catch {} })
              .finally(() => {
                try { finishPendingPlayerCreateStateWrite?.(); } catch {}
              });
          } catch (e) {
            try { finishPendingPlayerCreateStateWrite?.(); } catch {}
            try { console.debug?.('room_state background persist schedule failed', e); } catch {}
          }
        } else {
          if (!awaitingPlayerCreateEcho) {
            try { finishPendingPlayerCreateStateWrite?.(); } catch {}
          }
        }

		// v4+: mirror GM "eye" visibility into room_tokens for reliable realtime visibility updates.
		if (type === 'setPlayerPublic') {
			try {
				const pid = String(msg.id || '');
				if (pid) {
					upsertTokenVisibility(currentRoomId, pid, !!msg.isPublic)
						.catch((e) => console.warn('token visibility background persist failed', e));
				}
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
try { window.setTokenVisibilityOptimisticGuard = setTokenVisibilityOptimisticGuard; } catch {}
try { window.applyPendingVisibilityOverlayToState = applyPendingVisibilityOverlayToState; } catch {}
