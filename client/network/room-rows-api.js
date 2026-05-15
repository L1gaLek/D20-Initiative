// Room row/log/dice API helpers for the VPS backend.

(function () {
  function getVpsApiClient() {
    const client = window.vpsApi;
    if (typeof client !== 'function') {
      throw new Error('VPS API helper is not loaded.');
    }
    return client;
  }

  function normalizeRoomId(roomId) {
    return String(roomId || '').trim();
  }

  function normalizeTableName(table) {
    return String(table || '').trim();
  }

  function getActorUserId() {
    try {
      const userId = String(window.getVpsActorUserId?.() || '').trim();
      if (userId) return userId;
    } catch {}
    try {
      const userId = String(window.getAppStorageItem?.('int_user_id') || '').trim();
      if (userId) return userId;
    } catch {}
    try {
      return String(localStorage.getItem('int_user_id') || '').trim();
    } catch {
      return '';
    }
  }

  function buildRowsQuery(options = {}) {
    const params = new URLSearchParams();
    if (options.mapId) params.set('mapId', String(options.mapId));
    if (Number.isFinite(Number(options.limit)) && Number(options.limit) > 0) {
      params.set('limit', String(Math.trunc(Number(options.limit))));
    }
    const query = params.toString();
    return query ? `?${query}` : '';
  }

  async function loadRows(roomId, table, options = {}) {
    const cleanRoomId = normalizeRoomId(roomId);
    const cleanTable = normalizeTableName(table);
    const query = buildRowsQuery(options);
    return getVpsApiClient()(`/rooms/${encodeURIComponent(cleanRoomId)}/rows/${encodeURIComponent(cleanTable)}${query}`, {
      method: 'GET',
      timeoutMs: options.timeoutMs,
      retries: options.retries
    });
  }

  async function loadRoomMembers(roomId, options = {}) {
    return loadRows(roomId, 'room_members', options);
  }

  async function insertLog(roomId, payload = {}, options = {}) {
    const cleanRoomId = normalizeRoomId(roomId);
    return getVpsApiClient()(`/rooms/${encodeURIComponent(cleanRoomId)}/log`, {
      ...options,
      method: 'POST',
      body: {
        userId: payload.userId || getActorUserId(),
        text: payload.text
      }
    });
  }

  async function insertDiceEvent(roomId, payload = {}, options = {}) {
    const cleanRoomId = normalizeRoomId(roomId);
    return getVpsApiClient()(`/rooms/${encodeURIComponent(cleanRoomId)}/dice`, {
      ...options,
      method: 'POST',
      body: {
        userId: payload.userId || getActorUserId(),
        event: payload.event
      }
    });
  }

  window.RoomRowsApi = Object.freeze({
    loadRows,
    loadRoomMembers,
    insertLog,
    insertDiceEvent
  });
})();
