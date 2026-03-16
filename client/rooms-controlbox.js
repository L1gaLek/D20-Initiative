// ================== ROOMS LOBBY UI ==================
function renderRooms(rooms) {
  const targets = [roomsList, tavernRoomsList].filter(Boolean);
  if (!targets.length) return;
  if (roomsError) roomsError.textContent = '';
  if (tavernRoomsError) tavernRoomsError.textContent = '';
  targets.forEach((target) => { target.innerHTML = ''; });

  // total unique users on server (optional field from listRooms)
  try {
    const n = Number(window.SERVER_TOTAL_USERS || 0);
    ['server-users-total', 'tavern-server-users-total'].forEach((id) => {
      const totalEl = document.getElementById(id);
      if (totalEl) totalEl.textContent = n ? `Онлайн на сервере: ${n}` : '';
    });
  } catch {}

  if (!rooms.length) {
    targets.forEach((target) => { target.textContent = 'Комнат пока нет.'; });
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

    targets.forEach((target) => { target.appendChild(card.cloneNode(true)); });

    // Wire buttons for each rendered copy
    targets.forEach((target) => {
      const lastCard = target.lastElementChild;
      const btn = lastCard?.querySelector('button');
      if (btn) {
        btn.onclick = () => {
          try {
            openRoleModalForRoom(r);
          } catch {
            sendMessage({ type: 'joinRoom', roomId: r.id, password: '' });
          }
        };
      }
    });
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

  // Inject password input if needed (we do not rely on hardcoded HTML).
  try {
    const body = modal?.querySelector('.modal-body');
    if (body) {
      let pwRow = body.querySelector('#roleModalPwRow');
      if (!pwRow) {
        pwRow = document.createElement('div');
        pwRow.id = 'roleModalPwRow';
        pwRow.style.marginTop = '10px';
        pwRow.innerHTML = `
          <label style="display:flex; flex-direction:column; gap:6px; font-size:13px; color:#ddd;">
            Пароль комнаты
            <input id="roleModalPassword" type="password" autocomplete="off" placeholder="Введите пароль" style="padding:8px 10px; border-radius:10px; border:1px solid rgba(255,255,255,0.18); background:rgba(0,0,0,0.22); color:#fff;" />
          </label>
        `;
        // Insert before error block (if present), otherwise append.
        const errEl = body.querySelector('#roleModalError');
        if (errEl && errEl.parentNode === body) body.insertBefore(pwRow, errEl);
        else body.appendChild(pwRow);
      }
      pwRow.style.display = pendingJoinRoomHasPassword ? '' : 'none';
      const inp = body.querySelector('#roleModalPassword');
      if (inp) inp.value = '';
    }
  } catch {}

  try { tavernRoomsModal?.classList.add('hidden'); } catch {}
  if (modal) modal.classList.remove('hidden');
}

function closeRoleModal() {
  const modal = document.getElementById('roleModal');
  const err = document.getElementById('roleModalError');
  if (err) err.textContent = '';
  if (modal) modal.classList.add('hidden');
  pendingJoinRoomId = null;
  pendingJoinRoomHasPassword = false;
}

function pickRoleAndJoin(roleDb) {
  const rid = String(pendingJoinRoomId || '');
  if (!rid) return;
  const needsPw = !!pendingJoinRoomHasPassword;
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

  // If the room is protected, ask for password.
  let password = '';
  try {
    if (needsPw) {
      const inp = document.getElementById('roleModalPassword');
      password = String(inp?.value || '').trim();
      // fallback prompt if user closed modal without input element
      if (!password) password = String(prompt('Введите пароль комнаты:') || '').trim();
    }
  } catch {}

  closeRoleModal();

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
