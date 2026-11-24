// Visual previews never modify authoritative game state or acknowledge a save.
const liveSheetPreviews = new Map();
function getLivePlayerView(player) {
  const preview = liveSheetPreviews.get(String(player?.id));
  if (!preview || preview.roomId !== String(currentRoomId)) return player;
  if (preview.baseSheet !== player.sheet) {
    preview.baseSheet = player.sheet;
    preview.viewSheet = SheetSync.apply(player.sheet, preview.ops);
  }
  return { ...player, sheet: preview.viewSheet };
}
function refreshLiveToken(playerId) {
  const player = lastState?.players?.find(p => String(p.id) === String(playerId));
  const el = playerElements?.get?.(String(playerId));
  if (player && el) {
    const view = getLivePlayerView(player);
    updateHpBar(view, el);
    window.updateTokenConditionIndicators?.(view, el);
    window.applyTokenVisual?.(el, view);
    window.updateTokenCombatActions?.(view, el);
    const label = el.querySelector?.('.token-label');
    if (label) label.textContent = String(player.name || '?');
    el.title = String(player.name || '');
  }
  window.Board3D?.requestSync?.();
  window.refreshOpenTokenMini?.();
}
function clearSheetPreview(playerId, requestId) {
  const old = liveSheetPreviews.get(String(playerId));
  if (old && (!requestId || old.requestId === requestId)) {
    clearTimeout(old.timer); liveSheetPreviews.delete(String(playerId));
  }
}
function handleSheetRealtime(msg) {
  if (!['sheetPreview', 'sheetPatch', 'sheetPatchError'].includes(msg.type)) return false;
  if (String(msg.roomId) !== String(currentRoomId)) return true;
  const id = String(msg.playerId || ''), p = lastState?.players?.find(p => String(p.id) === id);
  if (!p) return true;
  if (msg.type === 'sheetPreview') {
    clearSheetPreview(id);
    const entry = { ...msg, timer: setTimeout(() => {
      clearSheetPreview(id, msg.requestId); refreshLiveToken(id);
    }, 8000) };
    liveSheetPreviews.set(id, entry);
  } else {
    clearSheetPreview(id, msg.requestId);
    if (msg.type === 'sheetPatch') {
      if (msg.optimistic || Number(msg.sheetRevision) > Number(p.sheetRevision || 0)) {
        p.sheet = SheetSync.apply(p.sheet, msg.ops);
        p.sheetUpdatedAt = Math.max(Number(p.sheetUpdatedAt || 0), Number(msg.sheetUpdatedAt || 0));
        if (!msg.optimistic) p.sheetRevision = Number(msg.sheetRevision);
        if (msg.name) p.name = msg.name;
        syncVisiblePlayersState(lastState);
      }
      if (!msg.optimistic && msg.__fromWsClient === WS_CLIENT_ID) window.InfoModal?.acknowledgeSheetPatch?.(id, msg.requestId, msg.sheetUpdatedAt);
      if (!msg.optimistic) window.InfoModal?.refresh?.(players);
      updatePlayerList?.();
    } else if (msg.message && msg.__fromWsClient === WS_CLIENT_ID) {
      showAppToast(msg.message, { tone: 'error' });
    }
  }
  refreshLiveToken(id);
  return true;
}

const wsRoomCursors = new Map();
const fogPreviewRows = new Map();
const fogLiveOverlays = new Map();
const committedFogPreviews = new Set();
function publishFogPreview(row, cells = null) {
  const key = JSON.stringify([row.room_id, row.map_id]), before = fogPreviewRows.get(key), delta = {};
  if (cells) delta.cells = cells;
  else if (!before) delta.row = row;
  else {
    if (JSON.stringify(before.settings) !== JSON.stringify(row.settings)) delta.settings = row.settings;
    if (JSON.stringify(before.manual_stamps) !== JSON.stringify(row.manual_stamps)) {
      const old = before.manual_stamps || [], next = row.manual_stamps || [];
      if (next.length >= old.length && JSON.stringify(next.slice(0, old.length)) === JSON.stringify(old)) delta.stampsAppend = next.slice(old.length);
      else delta.stamps = next;
    }
    if (before.explored_packed !== row.explored_packed) delta.exploredPacked = row.explored_packed;
  }
  fogPreviewRows.set(key, deepClone(row));
  if (!Object.keys(delta).length) return before?.previewId;
  const previewId = wsMakeNonce();
  fogPreviewRows.get(key).previewId = previewId;
  sendWsEnvelope({ type: 'fogPreview', roomId: row.room_id, mapId: row.map_id, previewId, delta });
  return previewId;
}
function applyFogDelta(fog, delta, mapId) {
  const next = delta.row ? _defaultFogDetached(delta.row) : deepClone(fog || {});
  if (delta.settings) Object.assign(next, delta.settings);
  if (delta.stamps) next.manualStamps = deepClone(delta.stamps);
  if (delta.stampsAppend) next.manualStamps = [...(next.manualStamps || []), ...deepClone(delta.stampsAppend)].slice(-5000);
  if (delta.exploredPacked !== undefined) {
    next.exploredPacked = delta.exploredPacked;
    next.explored = unpackFogExplored(delta.exploredPacked);
  }
  if (delta.cells) {
    next.explored = [...new Set([...(next.explored || []), ...delta.cells])];
    const meta = __roomDetachedCache.mapMetaById.get(mapId) || {};
    next.exploredPacked = packFogExplored(next.explored, meta.boardWidth || lastState?.boardWidth, meta.boardHeight || lastState?.boardHeight);
  }
  return next;
}
function renderFogOverlay(mapId, entry) {
  let fog = entry.base;
  for (const event of entry.events) fog = applyFogDelta(fog, event.delta, mapId);
  __roomDetachedCache.fogByMap.set(mapId, fog);
  _refreshDetachedRoomView();
}
function handleFogRealtime(msg) {
  if (!['fogPreview', 'fogRow', 'fogDelete', 'fogPreviewCancel'].includes(msg.type)) return false;
  const mapId = String(msg.mapId || msg.row?.map_id || '');
  if (msg.roomId !== String(currentRoomId) || !mapId) return true;
  let entry = fogLiveOverlays.get(mapId);
  if (msg.type === 'fogRow' && msg.previewId) {
    committedFogPreviews.add(msg.previewId);
    while (committedFogPreviews.size > 256) committedFogPreviews.delete(committedFogPreviews.values().next().value);
  }
  if (msg.type === 'fogDelete') {
    clearTimeout(entry?.timer); fogLiveOverlays.delete(mapId); fogPreviewRows.delete(JSON.stringify([msg.roomId,mapId]));
    return false;
  }
  if (msg.type === 'fogPreview') {
    if (committedFogPreviews.has(msg.previewId)) return true;
    if (!entry) entry = { base: deepClone(__roomDetachedCache.fogByMap.get(mapId) || {}), events: [] };
    if (!entry.events.some(event => event.previewId === msg.previewId)) entry.events.push(msg);
    // Limit unconfirmed memory even if persistence stops responding.
    if (entry.events.length > 128) entry.events.shift();
    fogLiveOverlays.set(mapId, entry);
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => { entry.events = []; renderFogOverlay(mapId, entry); fogLiveOverlays.delete(mapId); }, 8000);
  } else {
    if (!entry) entry = { base: deepClone(__roomDetachedCache.fogByMap.get(mapId) || {}), events: [] };
    if (msg.type === 'fogRow') entry.base = _defaultFogDetached(msg.row);
    const at = entry.events.findIndex(event => event.previewId === msg.previewId);
    entry.events = at < 0 ? [] : entry.events.slice(at + 1);
    if (!entry.events.length) { clearTimeout(entry.timer); fogLiveOverlays.delete(mapId); }
  }
  renderFogOverlay(mapId, entry);
  return true;
}
function rememberRoomCursor(cursor) {
  const roomId = String(cursor?.roomId || '');
  if (!roomId || !cursor?.epoch || !Number.isFinite(Number(cursor.seq))) return;
  const previous = wsRoomCursors.get(roomId);
  if (previous?.epoch === cursor.epoch && previous.seq > Number(cursor.seq)) return;
  wsRoomCursors.set(roomId, { epoch: cursor.epoch, seq: Number(cursor.seq) });
}
function applyRoomResume(msg) {
  // The server's in-memory event counter restarts with a new stream epoch.
  // Keeping the previous high-water mark would discard every new live event.
  const roomKey = String(msg.roomId || '');
  const previousCursor = wsRoomCursors.get(roomKey);
  if (msg.cursor?.epoch && previousCursor?.epoch !== msg.cursor.epoch) window.__lastWsRoomEventSeq?.delete?.(roomKey);
  handleCombatPreview(msg);
  for (const id of liveSheetPreviews.keys()) { clearSheetPreview(id); refreshLiveToken(id); }
  for (const [mapId, entry] of fogLiveOverlays) {
    clearTimeout(entry.timer); entry.events = []; renderFogOverlay(mapId, entry);
  }
  fogLiveOverlays.clear(); fogPreviewRows.clear(); committedFogPreviews.clear();
  const snapshot = msg.snapshot;
  if (snapshot) {
    window.__tokenPositionSnapshotCache?.clear?.();
    window.__tokenVisibilitySnapshotCache?.clear?.();
    _tokenSnapshotCacheEnsure().clear();
    resetDetachedRoomCache(msg.roomId);
    (snapshot.room_map_meta || []).forEach(_cacheMapMeta);
    _cacheWallRows(snapshot.room_walls || []);
    _cacheMarkRows(snapshot.room_marks || []);
    _cacheFogRows(snapshot.room_fog || []);
    if (snapshot.room_music_state?.[0]) _cacheMusicRow(snapshot.room_music_state[0]);
    handleMessage({ type: 'state', state: applyDetachedPayloadToState(snapshot.state), stateUpdatedAt: snapshot.updatedAt });
    handleMessage({ type: 'tokensInit', rows: snapshot.room_tokens || [], mapId: snapshot.state.currentMapId });
    handleMessage({ type: 'logInit', rows: snapshot.room_log || [] });
    handleMessage({ type: 'diceInit', rows: snapshot.room_dice_events || [] });
  }
  for (const event of msg.events || []) dispatchRoomWsEvent(event, true);
  rememberRoomCursor({ roomId: msg.roomId, ...msg.cursor });
}
