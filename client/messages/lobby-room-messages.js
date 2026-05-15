// Room / lobby specific incoming message handlers extracted from client/message-ui.js.

function isGmAlreadyRoomError(text) {
  const raw = String(text || '');
  return /GM already|uq_one_gm_per_room|ГМ.*(уже|присутств)|уже.*ГМ/i.test(raw);
}

function normalizeRoomsErrorText(text) {
  if (isGmAlreadyRoomError(text)) return 'В комнате уже присутствует ГМ. Вы не можете войти как ГМ.';
  return String(text || 'Ошибка');
}

function getLobbyRoomId(room) {
  return String(room?.id || room?.roomId || room?.room_id || '').trim();
}

function getLobbyRoomsSnapshot() {
  try {
    const snapshot = window.__lastRoomsSnapshot || {};
    return {
      rooms: Array.isArray(snapshot.rooms) ? snapshot.rooms.slice() : [],
      totalUsers: Number(snapshot.totalUsers || 0) || 0
    };
  } catch {
    return { rooms: [], totalUsers: 0 };
  }
}

function rememberLobbyRoomsSnapshot(rooms, totalUsers) {
  try {
    window.__lastRoomsSnapshot = {
      rooms: Array.isArray(rooms) ? rooms.slice() : [],
      totalUsers: Number(totalUsers || 0) || 0,
      updatedAt: Date.now()
    };
  } catch {}
}

function mergeLobbyRoomSnapshot(room, options = {}) {
  const roomId = getLobbyRoomId(room);
  if (!roomId) return false;
  const snapshot = getLobbyRoomsSnapshot();
  const nextRooms = [
    room,
    ...snapshot.rooms.filter((item) => getLobbyRoomId(item) !== roomId)
  ];
  const requestedTotal = Number(options?.totalUsers);
  const totalUsers = Number.isFinite(requestedTotal)
    ? Math.max(Number(snapshot.totalUsers || 0) || 0, requestedTotal)
    : snapshot.totalUsers;
  handleMessage({ type: 'rooms', rooms: nextRooms, totalUsers });
  return true;
}

try { window.getLobbyRoomsSnapshot = getLobbyRoomsSnapshot; } catch {}
try { window.mergeLobbyRoomSnapshot = mergeLobbyRoomSnapshot; } catch {}

function handleRoomsMessage(msg) {
  if (!(msg?.type === 'rooms' && Array.isArray(msg.rooms))) return false;
  const totalUsers = Number(msg.totalUsers || 0) || 0;
  try { window.SERVER_TOTAL_USERS = totalUsers; } catch {}
  rememberLobbyRoomsSnapshot(msg.rooms, totalUsers);
  renderRooms(msg.rooms);
  if (!currentRoomId) {
    if (diceViz) diceViz.style.display = 'none';
    const diceStack = document.getElementById('dice-stack');
    if (diceStack) diceStack.style.display = 'none';
  }
  return true;
}

function handleJoinedRoomMessage(msg) {
  if (!(msg?.type === 'joinedRoom' && msg.room)) return false;
  try {
    const attempt = (typeof window.getLastJoinAttempt === 'function') ? window.getLastJoinAttempt() : null;
    if (attempt && String(attempt.roomId || '') === String(msg.room.id || '') && attempt.hadPassword && attempt.password) {
      window.rememberRoomPassword?.(attempt.roomId, attempt.password);
    }
    window.clearLastJoinAttempt?.();
  } catch {}

  roomsDiv.style.display = 'none';
  try { window.closeTavern?.(); } catch {}
  try { window.stopTavernChannel?.(); } catch {}
  gameUI.style.display = 'block';

  currentRoomId = msg.room.id || null;
  try { window.__currentRoomJoinedAtMs = Date.now(); } catch {}
  try { window.RoomChat?.reset?.(currentRoomId); } catch {}
  if (myRoomSpan) myRoomSpan.textContent = msg.room.name || '-';
  if (myScenarioSpan) myScenarioSpan.textContent = msg.room.scenario || '-';
  if (diceViz) diceViz.style.display = 'block';
  applyRoleToUI();
  try { window.refreshRoomDetailsInfo?.(); } catch {}
  startHeartbeat();
  startMembersPolling();
  return true;
}

function handleRoomUpdatedMessage(msg) {
  if (!(msg?.type === 'roomUpdated' && msg.room)) return false;
  const roomId = String(msg.room.id || msg.room.roomId || '');
  if (roomId && String(currentRoomId || '') === roomId) {
    if (myRoomSpan) myRoomSpan.textContent = msg.room.name || '-';
    if (myScenarioSpan) myScenarioSpan.textContent = msg.room.scenario || '-';
    try { window.refreshRoomDetailsInfo?.(); } catch {}
  }
  return true;
}

function handleRoomDeletedMessage(msg) {
  if (msg?.type !== 'roomDeleted') return false;
  const roomId = String(msg.roomId || msg.room?.id || '');
  const currentRid = String(currentRoomId || '');
  if (roomId && currentRid && roomId === currentRid) {
    const roomName = String(msg.roomName || myRoomSpan?.textContent || 'комната');
    const popupText = `Создатель удалил комнату «${roomName}», поэтому вы были возвращены в таверну.`;
    Promise.resolve(window.returnToTavernFromRoom?.({ skipMemberCleanup: true })).finally(() => {
      try { window.showRoomAccessPopup?.(popupText, 'Комната удалена'); } catch {}
    });
  }
  return true;
}

function handleRoomsErrorMessage(msg) {
  if (msg?.type !== 'roomsError') return false;
  const text = normalizeRoomsErrorText(msg.message);
  if (roomsError) roomsError.textContent = text;
  if (typeof window.isTavernVisible === 'function' && window.isTavernVisible() && tavernRoomsError) tavernRoomsError.textContent = text;

  try {
    const lower = text.toLowerCase();
    if (lower.includes('забан')) {
      window.showRoomAccessPopup?.(text, 'Доступ запрещён');
    } else if (lower.includes('парол')) {
      window.showRoomAccessPopup?.(text, 'Неверный пароль');
    } else if (lower.includes('лимит') || lower.includes('одной комнат') || lower.includes('1 комнат')) {
      window.showRoomAccessPopup?.(text, 'Лимит комнат');
    } else if (isGmAlreadyRoomError(text)) {
      window.showRoomAccessPopup?.(text, 'ГМ уже в комнате');
    } else {
      window.showRoomAccessPopup?.(text, 'Ошибка входа');
    }
  } catch {}
  return true;
}

function handleLobbyRoomMessage(msg) {
  return handleRoomsMessage(msg)
    || handleJoinedRoomMessage(msg)
    || handleRoomUpdatedMessage(msg)
    || handleRoomDeletedMessage(msg)
    || handleRoomsErrorMessage(msg);
}
