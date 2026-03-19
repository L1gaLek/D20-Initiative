// Session / login / generic app-surface message handlers extracted from client/message-ui.js.

function handleRegisteredMessage(msg) {
  if (msg?.type !== 'registered') return false;

  myId = msg.id;
  localStorage.setItem('dnd_user_id', String(msg.id));
  localStorage.setItem('dnd_user_role', String(msg.role || ''));
  localStorage.setItem('dnd_user_name', String(msg.name || ''));

  myRole = msg.role;
  myNameSpan.textContent = msg.name;
  myRoleSpan.textContent = msg.role ? msg.role : '-';
  myRole = String(msg.role || '');

  try { window.stopRoomChatSync?.(); } catch {}
  currentRoomId = null;
  stopHeartbeat();
  stopMembersPolling();
  if (diceViz) diceViz.style.display = 'none';
  if (myRoomSpan) myRoomSpan.textContent = '-';
  if (myScenarioSpan) myScenarioSpan.textContent = '-';
  loginDiv.style.display = 'none';
  roomsDiv.style.display = 'none';
  gameUI.style.display = 'none';
  roomsError.textContent = '';
  try { window.openTavern?.(); } catch {}
  try { window.ensureTavernChannel?.(); } catch {}
  sendMessage({ type: 'listRooms' });

  applyRoleToUI();

  if (window.InfoModal?.init) {
    window.InfoModal.init({
      sendMessage,
      getMyId: () => myId,
      getMyRole: () => myRole
    });
  }

  return true;
}

function handleErrorSurfaceMessage(msg) {
  if (msg?.type !== 'error') return false;
  const text = String(msg.message || 'Ошибка');

  if (loginDiv && loginDiv.style.display !== 'none') {
    loginError.textContent = text;
  } else if (roomsDiv && roomsDiv.style.display !== 'none') {
    roomsError.textContent = text;
  } else if (typeof window.isTavernVisible === 'function' && window.isTavernVisible()) {
    if (tavernRoomsError) tavernRoomsError.textContent = text;
  } else {
    alert(text);
  }

  return true;
}

function handleSessionUiMessage(msg) {
  return handleRegisteredMessage(msg) || handleErrorSurfaceMessage(msg);
}
