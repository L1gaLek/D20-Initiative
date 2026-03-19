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
  return loadRoomScopedRows('room_tokens', roomId, { mapId });
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
  return loadRoomScopedRows('room_log', roomId, {
    select: 'id,text,created_at',
    orderBy: 'created_at',
    ascending: true,
    limit: Math.max(1, Math.min(500, Number(limit) || 200))
  });
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

