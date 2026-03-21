// Detached room tables / dedicated room data sync helpers.
// Extracted from core-helpers-network.js to keep detached-table load/subscription
// logic isolated while preserving existing global function names.

// ================== Detached table query helpers ==================
async function loadRoomScopedRows(table, roomId, opts = {}) {
  await ensureSupabaseReady();
  if (!roomId) return opts.maybeSingle ? null : [];

  const {
    select = '*',
    mapId = null,
    orderBy = null,
    ascending = true,
    limit = null,
    maybeSingle = false,
    missingColumn = ''
  } = opts || {};

  let query = sbClient.from(table).select(select).eq('room_id', roomId);
  if (mapId) query = query.eq('map_id', mapId);
  if (orderBy) query = query.order(orderBy, { ascending: !!ascending });
  if (Number.isFinite(Number(limit)) && Number(limit) > 0) query = query.limit(Number(limit));
  if (maybeSingle) query = query.maybeSingle();

  const { data, error } = await query;
  if (error) {
    if (missingColumn && _isMissingColumnError(error, missingColumn)) {
      throw new Error(`room_marks schema is outdated: missing '${missingColumn}' jsonb column. Run the migration SQL before using detached marks.`);
    }
    throw error;
  }

  return data ?? (maybeSingle ? null : []);
}

function refreshDetachedViewAfter(update) {
  try {
    if (typeof update === 'function') update();
    _refreshDetachedRoomView();
  } catch (e) {
    throw e;
  }
}

function handleDetachedCacheRealtime(tableLabel, update) {
  try {
    refreshDetachedViewAfter(update);
  } catch (e) {
    console.warn(`${tableLabel} realtime failed`, e);
  }
}

// ================== v4: TOKENS / LOG / DICE (dedicated tables) ==================
async function subscribeRoomTokensDb(roomId) {
  return subscribeRoomScopedTableChannel({
    roomId,
    table: 'room_tokens',
    channelName: `db-room_tokens-${roomId}`,
    getCurrent: () => window.roomTokensDbChannel,
    setCurrent: (channel) => { window.roomTokensDbChannel = channel; },
    onPayload: (payload) => {
      const ev = String(payload?.eventType || '').toUpperCase();
      if (ev === 'DELETE') {
        const row = payload?.old;
        if (row) handleMessage({ type: 'tokenRowDeleted', row });
        return;
      }
      const row = payload?.new;
      if (row) handleMessage({ type: 'tokenRow', row });
    }
  });
}

async function loadRoomTokens(roomId, mapId) {
  return loadRoomScopedRows('room_tokens', roomId, { mapId });
}

async function subscribeRoomLogDb(roomId) {
  return subscribeRoomScopedTableChannel({
    roomId,
    table: 'room_log',
    channelName: `db-room_log-${roomId}`,
    event: 'INSERT',
    getCurrent: () => window.roomLogDbChannel,
    setCurrent: (channel) => { window.roomLogDbChannel = channel; },
    onPayload: (payload) => {
      const row = payload?.new;
      if (row) handleMessage({ type: 'logRow', row });
    }
  });
}

async function loadRoomLog(roomId, limit = 200) {
  return loadRoomScopedRows('room_log', roomId, {
    select: 'id,text,created_at',
    orderBy: 'created_at',
    ascending: true,
    limit: Math.max(1, Math.min(500, Number(limit) || 200))
  });
}

async function subscribeRoomDiceDb(roomId) {
  return subscribeRoomScopedTableChannel({
    roomId,
    table: 'room_dice_events',
    channelName: `db-room_dice-${roomId}`,
    event: 'INSERT',
    getCurrent: () => window.roomDiceDbChannel,
    setCurrent: (channel) => { window.roomDiceDbChannel = channel; },
    onPayload: (payload) => {
      const row = payload?.new;
      if (row) handleMessage({ type: 'diceRow', row });
    }
  });
}

async function loadRoomDice(roomId, limit = 50) {
  return loadRoomScopedRows('room_dice_events', roomId, {
    orderBy: 'created_at',
    ascending: false,
    limit: Math.max(1, Math.min(200, Number(limit) || 50))
  });
}

// ================== Detached low-frequency tables ==================
async function loadRoomMapMeta(roomId) {
  return loadRoomScopedRows('room_map_meta', roomId);
}

async function loadRoomWalls(roomId) {
  return loadRoomScopedRows('room_walls', roomId);
}

async function loadRoomMarks(roomId) {
  return loadRoomScopedRows('room_marks', roomId, { missingColumn: 'payload' });
}

async function loadRoomFog(roomId) {
  return loadRoomScopedRows('room_fog', roomId);
}

async function loadRoomMusic(roomId) {
  return loadRoomScopedRows('room_music_state', roomId, { maybeSingle: true });
}

async function subscribeRoomMapMetaDb(roomId) {
  return subscribeRoomScopedTableChannel({
    roomId,
    table: 'room_map_meta',
    channelName: `db-room_map_meta-${roomId}`,
    getCurrent: () => window.roomMapMetaDbChannel,
    setCurrent: (channel) => { window.roomMapMetaDbChannel = channel; },
    onPayload: (payload) => handleDetachedCacheRealtime('room_map_meta', () => {
      if (payload.eventType === 'DELETE') {
        const old = payload.old || {};
        const mapId = String(old.map_id || '').trim();
        if (mapId) {
          __roomDetachedCache.mapMetaById.delete(mapId);
          __roomDetachedCache.wallsByMap.delete(mapId);
          __roomDetachedCache.marksByMap.delete(mapId);
          __roomDetachedCache.fogByMap.delete(mapId);
        }
        return;
      }
      _cacheMapMeta(payload.new || {});
    })
  });
}

async function subscribeRoomWallsDb(roomId) {
  return subscribeRoomScopedTableChannel({
    roomId,
    table: 'room_walls',
    channelName: `db-room_walls-${roomId}`,
    getCurrent: () => window.roomWallsDbChannel,
    setCurrent: (channel) => { window.roomWallsDbChannel = channel; },
    onPayload: (payload) => handleDetachedCacheRealtime('room_walls', () => {
      if (payload.eventType === 'DELETE') _cacheDeleteWallRow(payload.old || {});
      else _cacheUpsertWallRow(payload.new || {});
    })
  });
}

async function subscribeRoomMarksDb(roomId) {
  return subscribeRoomScopedTableChannel({
    roomId,
    table: 'room_marks',
    channelName: `db-room_marks-${roomId}`,
    getCurrent: () => window.roomMarksDbChannel,
    setCurrent: (channel) => { window.roomMarksDbChannel = channel; },
    onPayload: (payload) => handleDetachedCacheRealtime('room_marks', () => {
      if (payload.eventType === 'DELETE') _cacheDeleteMarkRow(payload.old || {});
      else _cacheUpsertMarkRow(payload.new || {});
    })
  });
}

async function subscribeRoomFogDb(roomId) {
  return subscribeRoomScopedTableChannel({
    roomId,
    table: 'room_fog',
    channelName: `db-room_fog-${roomId}`,
    getCurrent: () => window.roomFogDbChannel,
    setCurrent: (channel) => { window.roomFogDbChannel = channel; },
    onPayload: (payload) => handleDetachedCacheRealtime('room_fog', () => {
      if (payload.eventType === 'DELETE') {
        const mapId = String(payload.old?.map_id || '').trim();
        if (mapId) __roomDetachedCache.fogByMap.delete(mapId);
        return;
      }
      _cacheUpsertFogRow(payload.new || {});
    })
  });
}

async function subscribeRoomMusicDb(roomId) {
  return subscribeRoomScopedTableChannel({
    roomId,
    table: 'room_music_state',
    channelName: `db-room_music_state-${roomId}`,
    getCurrent: () => window.roomMusicDbChannel,
    setCurrent: (channel) => { window.roomMusicDbChannel = channel; },
    onPayload: (payload) => handleDetachedCacheRealtime('room_music_state', () => {
      if (payload.eventType === 'DELETE') {
        __roomDetachedCache.music = null;
        return;
      }
      _cacheMusicRow(payload.new || {});
    })
  });
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
