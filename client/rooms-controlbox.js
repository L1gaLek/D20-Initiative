// ================== ROOMS LOBBY UI ==================
function renderRooms(rooms) {
  if (!roomsList) return;
  roomsError.textContent = '';
  roomsList.innerHTML = '';

  // total unique users on server (optional field from listRooms)
  try {
    const totalEl = document.getElementById('server-users-total');
    if (totalEl) {
      const n = Number(window.SERVER_TOTAL_USERS || 0);
      totalEl.textContent = n ? `Онлайн на сервере: ${n}` : '';
    }
  } catch {}

  if (!rooms.length) {
    roomsList.textContent = 'Комнат пока нет.';
    return;
  }

  rooms.forEach(r => {
    const card = document.createElement('div');
    card.className = 'sheet-card';
    card.style.marginBottom = '10px';
    card.style.display = 'flex';
    card.style.alignItems = 'center';
    card.style.justifyContent = 'space-between';
    card.style.gap = '12px';

    const left = document.createElement('div');
    left.style.minWidth = '0';

    const title = document.createElement('div');
    title.style.fontWeight = '900';
    title.textContent = r.name;

    const meta = document.createElement('div');
    meta.style.fontSize = '12px';
    meta.style.color = '#aaa';
    meta.textContent =
      `Пользователей: ${r.uniqueUsers} • Пароль: ${r.hasPassword ? 'да' : 'нет'}`
      + (r.scenario ? ` • Сценарий: ${r.scenario}` : '');

    left.appendChild(title);
    left.appendChild(meta);

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.gap = '8px';

    const joinBtn2 = document.createElement('button');
    joinBtn2.textContent = 'Войти';
    joinBtn2.onclick = () => {
      try {
        openRoleModalForRoom(r);
      } catch {
        // fallback
        sendMessage({ type: 'joinRoom', roomId: r.id, password: '' });
      }
    };

    right.appendChild(joinBtn2);
    card.appendChild(left);
    card.appendChild(right);

    roomsList.appendChild(card);
  });
}

// ================== ROLE PICK MODAL ==================
let pendingJoinRoom = null;
function openRoleModalForRoom(room) {
  pendingJoinRoom = { id: String(room?.id || ''), name: String(room?.name || 'Комната'), hasPassword: !!room?.hasPassword };
  const modal = document.getElementById('roleModal');
  const err = document.getElementById('roleModalError');
  const rn = document.getElementById('roleModalRoomName');
  if (err) err.textContent = '';
  if (rn) rn.textContent = String(room?.name || 'Комната');
  if (modal) modal.classList.remove('hidden');
}

function closeRoleModal() {
  const modal = document.getElementById('roleModal');
  const err = document.getElementById('roleModalError');
  if (err) err.textContent = '';
  if (modal) modal.classList.add('hidden');
  pendingJoinRoom = null;
}

function pickRoleAndJoin(roleDb) {
  const rid = String(pendingJoinRoom?.id || '');
  if (!rid) return;
  try {
    // store role for this session
    localStorage.setItem('dnd_user_role', String(roleDb));
    // update globals/UI
    try { window.myRole = normalizeRoleForUi(roleDb); } catch {}
    try {
      if (typeof myRole !== 'undefined') myRole = normalizeRoleForUi(roleDb);
      if (typeof myRoleSpan !== 'undefined' && myRoleSpan) myRoleSpan.textContent = normalizeRoleForUi(roleDb);
    } catch {}
  } catch {}

  closeRoleModal();
let password = '';
try {
  if (pendingJoinRoom?.hasPassword) {
    const p = prompt('Введите пароль комнаты:', '');
    if (p === null) return; // cancel
    password = String(p || '');
  }
} catch {}
sendMessage({ type: 'joinRoom', roomId: rid, password });
}

// wire modal buttons
try {
  const closeBtn = document.getElementById('roleModalClose');
  const cancelBtn = document.getElementById('roleModalCancel');
  const pickGm = document.getElementById('rolePickGM');
  const pickPl = document.getElementById('rolePickPlayer');
  const pickSp = document.getElementById('rolePickSpectator');
  if (closeBtn) closeBtn.addEventListener('click', closeRoleModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeRoleModal);
  if (pickGm) pickGm.addEventListener('click', () => pickRoleAndJoin('GM'));
  if (pickPl) pickPl.addEventListener('click', () => pickRoleAndJoin('Player'));
  if (pickSp) pickSp.addEventListener('click', () => pickRoleAndJoin('Spectator'));
} catch {}

function openCreateRoomModal() {
  roomNameInput.value = '';
  roomPasswordInput.value = '';
  roomScenarioInput.value = '';
  createRoomModal.classList.remove('hidden');
}

function closeCreateRoomModal() {
  createRoomModal.classList.add('hidden');
}

if (createRoomBtn) createRoomBtn.addEventListener('click', openCreateRoomModal);
if (createRoomClose) createRoomClose.addEventListener('click', closeCreateRoomModal);
if (createRoomCancel) createRoomCancel.addEventListener('click', closeCreateRoomModal);

if (createRoomSubmit) createRoomSubmit.addEventListener('click', () => {
  const name = roomNameInput.value.trim();
  const password = roomPasswordInput.value || '';
  const scenario = roomScenarioInput.value.trim();

  if (!name) {
    roomsError.textContent = 'Введите название комнаты';
    return;
  }

  sendMessage({ type: 'createRoom', name, password, scenario });
  closeCreateRoomModal();
});


// ================== CONTROLBOX INIT ==================
try {
  if (typeof window.initControlBox === 'function') {
    window.initControlBox({
      sendMessage,
      isGM,
      isSpectator,
      getState: () => lastState,
      onViewportChange: () => {
        // При изменении рамки достаточно обновить CSS wrapper (controlbox делает это),
        // а поле/игроки не нужно пересоздавать.
      },
      boardEl: board,
      boardWrapperEl: boardWrapper
    });
  }
} catch (e) {
  console.warn("controlbox init failed", e);
}

// ================== BOARD MARKS INIT ==================
try {
  if (typeof window.initBoardMarks === 'function') {
    window.initBoardMarks({
      sendMessage,
      isGM,
      isSpectator,
      getState: () => lastState,
      boardEl: board,
      boardWrapperEl: boardWrapper
    });
  }
} catch (e) {
  console.warn('board marks init failed', e);
}
