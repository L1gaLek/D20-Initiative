// Room / lobby specific incoming message handlers extracted from client/message-ui.js.

function handleRoomsMessage(msg) {
  if (!(msg?.type === 'rooms' && Array.isArray(msg.rooms))) return false;
  try { window.SERVER_TOTAL_USERS = Number(msg.totalUsers || 0) || 0; } catch {}
  renderRooms(msg.rooms);
  if (!currentRoomId && diceViz) diceViz.style.display = 'none';
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
  const text = String(msg.message || 'Ошибка');
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
    } else if (lower.includes('gm') || lower.includes('гм')) {
      window.showRoomAccessPopup?.(text, 'GM уже в комнате');
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
