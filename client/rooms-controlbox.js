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
let pendingJoinRoomId = null;
let pendingJoinRoomHasPassword = false;

function openRoleModalForRoom(room) {
  pendingJoinRoomId = String(room?.id || '');
  pendingJoinRoomHasPassword = !!room?.hasPassword;
  const modal = document.getElementById('roleModal');
  const err = document.getElementById('roleModalError');
  const rn = document.getElementById('roleModalRoomName');
  if (err) err.textContent = '';
  if (rn) rn.textContent = String(room?.name || 'Комната');
  try {
    const ui = ensureRolePasswordUi();
    if (ui.wrap) ui.wrap.style.display = pendingJoinRoomHasPassword ? 'flex' : 'none';
    if (ui.input) ui.input.value = '';
  } catch {}
  if (modal) modal.classList.remove('hidden');
}


function ensureRolePasswordUi() {
  const modal = document.getElementById('roleModal');
  if (!modal) return { wrap: null, input: null };
  let wrap = modal.querySelector('[data-role-password-wrap]');
  if (!wrap) {
    const card = modal.querySelector('.modal-body .sheet-card');
    if (card) {
      wrap = document.createElement('div');
      wrap.setAttribute('data-role-password-wrap', '1');
      wrap.style.display = 'none';
      wrap.style.flexDirection = 'column';
      wrap.style.gap = '6px';
      wrap.style.marginTop = '6px';
      wrap.innerHTML = `
        <div style="font-size:12px; color:#aaa;">Пароль комнаты</div>
        <input id="roleModalPasswordInput" type="text" placeholder="Введите пароль" />
      `;
      card.insertBefore(wrap, card.firstChild);
    }
  }
  const input = modal.querySelector('#roleModalPasswordInput');
  return { wrap, input };
}

function closeRoleModal() {
  const modal = document.getElementById('roleModal');
  pendingJoinRoomHasPassword = false;
  try { const inp = document.getElementById('roleModalPasswordInput'); if (inp) inp.value = ''; } catch {}
  const err = document.getElementById('roleModalError');
  if (err) err.textContent = '';
  if (modal) modal.classList.add('hidden');
  pendingJoinRoomId = null;
}

function pickRoleAndJoin(roleDb) {
  const rid = String(pendingJoinRoomId || '');
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

  // NOTE: closeRoleModal clears pending flags, so read password before it.
  let pw = '';
  try { pw = String(document.getElementById('roleModalPasswordInput')?.value || '').trim(); } catch {}
  if (pendingJoinRoomHasPassword && !pw) {
    const err = document.getElementById('roleModalError');
    if (err) err.textContent = 'Введите пароль комнаты';
    return;
  }

  closeRoleModal();
  sendMessage({ type: 'joinRoom', roomId: rid, password: pw });
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
