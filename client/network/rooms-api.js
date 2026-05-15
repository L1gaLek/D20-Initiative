// Room management API helpers for the VPS backend.

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

  function buildUserQuery(userId) {
    const cleanUserId = String(userId || '').trim();
    if (!cleanUserId) return '';
    return `?userId=${encodeURIComponent(cleanUserId)}`;
  }

  async function listRooms(options = {}) {
    const query = buildUserQuery(options.userId);
    return getVpsApiClient()(`/rooms${query}`, {
      method: 'GET',
      timeoutMs: options.timeoutMs,
      retries: options.retries
    });
  }

  async function createRoom(payload = {}, options = {}) {
    return getVpsApiClient()('/rooms', {
      ...options,
      method: 'POST',
      body: {
        userId: payload.userId,
        userName: payload.userName,
        name: payload.name,
        scenario: payload.scenario,
        password: payload.password || '',
        state: payload.state
      }
    });
  }

  async function updateRoom(roomId, payload = {}, options = {}) {
    const cleanRoomId = normalizeRoomId(roomId);
    return getVpsApiClient()(`/rooms/${encodeURIComponent(cleanRoomId)}/update`, {
      ...options,
      method: 'POST',
      body: {
        userId: payload.userId,
        name: payload.name,
        scenario: payload.scenario,
        password: payload.password || ''
      }
    });
  }

  async function deleteRoom(roomId, payload = {}, options = {}) {
    const cleanRoomId = normalizeRoomId(roomId);
    return getVpsApiClient()(`/rooms/${encodeURIComponent(cleanRoomId)}${buildUserQuery(payload.userId)}`, {
      ...options,
      method: 'DELETE'
    });
  }

  async function joinRoom(roomId, payload = {}, options = {}) {
    const cleanRoomId = normalizeRoomId(roomId);
    return getVpsApiClient()(`/rooms/${encodeURIComponent(cleanRoomId)}/join`, {
      ...options,
      method: 'POST',
      body: {
        userId: payload.userId,
        userName: payload.userName,
        role: payload.role,
        password: payload.password || ''
      }
    });
  }

  async function kickRoomMember(roomId, payload = {}, options = {}) {
    const cleanRoomId = normalizeRoomId(roomId);
    return getVpsApiClient()(`/rooms/${encodeURIComponent(cleanRoomId)}/kick`, {
      ...options,
      method: 'POST',
      body: {
        actorUserId: payload.actorUserId,
        targetUserId: payload.targetUserId
      }
    });
  }

  async function banRoomMember(roomId, payload = {}, options = {}) {
    const cleanRoomId = normalizeRoomId(roomId);
    return getVpsApiClient()(`/rooms/${encodeURIComponent(cleanRoomId)}/ban`, {
      ...options,
      method: 'POST',
      body: {
        actorUserId: payload.actorUserId,
        targetUserId: payload.targetUserId,
        hours: payload.hours,
        minutes: payload.minutes,
        totalMinutes: payload.totalMinutes,
        reason: payload.reason
      }
    });
  }

  window.RoomsApi = Object.freeze({
    listRooms,
    createRoom,
    updateRoom,
    deleteRoom,
    joinRoom,
    kickRoomMember,
    banRoomMember
  });
})();
