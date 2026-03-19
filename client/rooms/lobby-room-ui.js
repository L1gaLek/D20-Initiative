// ================== ROOMS LOBBY UI ==================
function getRoomPasswordBadge(hasPassword) {
  const protectedRoom = !!hasPassword;
  const icon = protectedRoom ? '🔒' : '🔓';
  const cls = protectedRoom ? 'is-protected' : 'is-open';
  const text = protectedRoom ? 'установлен' : 'нет';
  return `<span class="room-lock-badge ${cls}" title="Пароль ${text}"><span class="room-lock-badge__icon" aria-hidden="true">${icon}</span><span class="room-lock-badge__text">${text}</span></span>`;
}

let roomEditorMode = 'create';
let editingRoomId = '';
let ownedRoomRecord = null;

function setCreateRoomButtonsHint(message = '') {
  [createRoomBtn, tavernCreateRoomBtn].filter(Boolean).forEach((btn) => {
    btn.title = message ? String(message) : '';
  });
}

function updateRoomCreationAvailability(rooms = []) {
  ownedRoomRecord = Array.isArray(rooms) ? (rooms.find((room) => room?.isMine) || null) : null;
  const message = ownedRoomRecord
    ? 'У вас уже есть своя комната. Её можно редактировать или удалить.'
    : '';
  setCreateRoomButtonsHint(message);
}

function showSingleRoomLimitPopup() {
  const roomName = String(ownedRoomRecord?.name || 'ваша комната');
  const message = `Лимит на пользователя — только 1 комната. У вас уже есть «${roomName}». Вы можете отредактировать её или удалить.`;
  if (roomsError) roomsError.textContent = message;
  if (tavernRoomsError) tavernRoomsError.textContent = message;
  window.showRoomAccessPopup?.(message, 'Лимит комнат');
}

function openCreateRoomModal(room = null) {
  const editing = !!room;
  if (!editing && ownedRoomRecord) {
    showSingleRoomLimitPopup();
    return;
  }
  roomEditorMode = editing ? 'edit' : 'create';
  editingRoomId = editing ? String(room.id || '') : '';
  roomNameInput.value = editing ? String(room.name || '') : '';
  roomPasswordInput.value = '';
  roomScenarioInput.value = editing ? String(room.scenario || '') : '';
  roomPasswordInput.placeholder = editing
    ? 'Новый пароль (оставьте пустым, чтобы убрать)'
    : 'Пароль (необязательно)';
  if (createRoomModalTitle) createRoomModalTitle.textContent = editing ? 'Редактировать комнату' : 'Создать комнату';
  if (createRoomModalSubtitle) {
    createRoomModalSubtitle.textContent = editing
      ? 'Измените название, сценарий и пароль комнаты. Пустой пароль снимет защиту.'
      : 'Пароль необязателен';
  }
  if (createRoomSubmit) createRoomSubmit.textContent = editing ? 'Сохранить' : 'Создать';
  if (roomsError) roomsError.textContent = '';
  if (tavernRoomsError) tavernRoomsError.textContent = '';
  createRoomModal.classList.remove('hidden');
}

function closeCreateRoomModal() {
  createRoomModal.classList.add('hidden');
  roomEditorMode = 'create';
  editingRoomId = '';
  if (createRoomModalTitle) createRoomModalTitle.textContent = 'Создать комнату';
  if (createRoomModalSubtitle) createRoomModalSubtitle.textContent = 'Пароль необязателен';
  roomPasswordInput.placeholder = 'Пароль (необязательно)';
  if (createRoomSubmit) createRoomSubmit.textContent = 'Создать';
}

function confirmDeleteRoom(room) {
  const roomId = String(room?.id || '').trim();
  if (!roomId) return;
  const roomName = String(room?.name || 'Комната');
  const confirmed = window.confirm(`Удалить комнату «${roomName}»? Это действие удалит комнату для всех пользователей.`);
  if (!confirmed) return;
  sendMessage({ type: 'deleteRoom', roomId });
}

function renderRooms(rooms) {
  const targets = [roomsList, tavernRoomsList].filter(Boolean);
  if (!targets.length) return;
  if (roomsError) roomsError.textContent = '';
  if (tavernRoomsError) tavernRoomsError.textContent = '';
  targets.forEach((target) => { target.innerHTML = ''; });
  updateRoomCreationAvailability(rooms);

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
    const makeCard = () => {
      const card = document.createElement('div');
      card.className = 'lobby-room-card';

      const left = document.createElement('div');
      left.className = 'lobby-room-card__main';

      const title = document.createElement('div');
      title.className = 'lobby-room-card__title';
      title.textContent = r.name;

      const meta = document.createElement('div');
      meta.className = 'lobby-room-card__meta';
      meta.innerHTML =
        `Пользователей: ${Number(r.uniqueUsers) || 0} • Пароль: ${getRoomPasswordBadge(!!r.hasPassword)}`
        + (r.scenario ? ` • Сценарий: ${escapeHtmlLite(r.scenario)}` : '')
        + (r.ownerName ? ` • Владелец: ${escapeHtmlLite(r.ownerName)}` : '')
        + (r.isMine ? ' • <strong>Моя комната</strong>' : '');

      left.appendChild(title);
      left.appendChild(meta);

      const right = document.createElement('div');
      right.className = 'lobby-room-card__actions';

      const joinBtn2 = document.createElement('button');
      joinBtn2.type = 'button';
      joinBtn2.textContent = 'Войти';
      joinBtn2.onclick = () => {
        try {
          openRoleModalForRoom(r);
        } catch {
          sendMessage({ type: 'joinRoom', roomId: r.id, password: '' });
        }
      };

      if (r.isMine) {
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'lobby-room-card__icon-btn';
        editBtn.innerHTML = '<span aria-hidden="true">✏️</span>';
        editBtn.setAttribute('aria-label', 'Редактировать комнату');
        editBtn.title = 'Редактировать комнату';
        editBtn.onclick = () => openCreateRoomModal(r);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'lobby-room-card__icon-btn lobby-room-card__icon-btn--danger';
        deleteBtn.innerHTML = '<span aria-hidden="true">🗑️</span>';
        deleteBtn.setAttribute('aria-label', 'Удалить комнату');
        deleteBtn.title = 'Удалить комнату';
        deleteBtn.onclick = () => confirmDeleteRoom(r);

        right.appendChild(editBtn);
        right.appendChild(deleteBtn);
      }

      right.appendChild(joinBtn2);
      card.appendChild(left);
      card.appendChild(right);
      return card;
    };

    targets.forEach((target) => { target.appendChild(makeCard()); });
  });
}

// ================== ROLE PICK MODAL ==================

const ROOM_PASSWORDS_LS_KEY = 'int_room_passwords_cache';
let lastJoinAttempt = { roomId: '', role: '', password: '', hadPassword: false, roomName: '' };

function readRoomPasswordsCache() {
  try {
    const raw = (typeof getAppStorageItem === 'function' ? getAppStorageItem(ROOM_PASSWORDS_LS_KEY) : localStorage.getItem(ROOM_PASSWORDS_LS_KEY));
    const data = raw ? JSON.parse(raw) : {};
    return (data && typeof data === 'object') ? data : {};
  } catch {
    return {};
  }
}

function getRememberedRoomPassword(roomId) {
  try {
    const rid = String(roomId || '').trim();
    if (!rid) return '';
    const cache = readRoomPasswordsCache();
    return String(cache[rid] || '');
  } catch {
    return '';
  }
}

function rememberRoomPassword(roomId, password) {
  try {
    const rid = String(roomId || '').trim();
    const pw = String(password || '');
    if (!rid || !pw) return;
    const cache = readRoomPasswordsCache();
    cache[rid] = pw;
    (typeof setAppStorageItem === 'function' ? setAppStorageItem(ROOM_PASSWORDS_LS_KEY, JSON.stringify(cache)) : localStorage.setItem(ROOM_PASSWORDS_LS_KEY, JSON.stringify(cache)));
  } catch {}
}

function showRoomAccessPopup(message, title = 'Ошибка входа') {
  try {
    let overlay = document.getElementById('roomAccessPopup');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'roomAccessPopup';
      overlay.className = 'modal-overlay hidden';
      overlay.innerHTML = `
        <div class="modal tavern-modal room-entry-modal" style="max-width:460px;">
          <div class="modal-header">
            <div>
              <div class="modal-title" id="roomAccessPopupTitle">Ошибка входа</div>
            </div>
            <button id="roomAccessPopupClose" class="modal-close">✕</button>
          </div>
          <div class="modal-body">
            <div id="roomAccessPopupText" class="room-entry-popup-text" style="line-height:1.55; color:#f3e7d0;"></div>
            <div class="room-entry-actions" style="display:flex; justify-content:flex-end; margin-top:14px;">
              <button id="roomAccessPopupOk" type="button">Понятно</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const closePopup = () => overlay.classList.add('hidden');
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closePopup(); });
      overlay.querySelector('#roomAccessPopupClose')?.addEventListener('click', closePopup);
      overlay.querySelector('#roomAccessPopupOk')?.addEventListener('click', closePopup);
    }
    const titleEl = document.getElementById('roomAccessPopupTitle');
    const textEl = document.getElementById('roomAccessPopupText');
    if (titleEl) titleEl.textContent = String(title || 'Ошибка входа');
    if (textEl) textEl.textContent = String(message || 'Произошла ошибка.');
    overlay.classList.remove('hidden');
  } catch {
    alert(String(message || 'Произошла ошибка.'));
  }
}

window.showRoomAccessPopup = showRoomAccessPopup;
window.rememberRoomPassword = rememberRoomPassword;
window.getRememberedRoomPassword = getRememberedRoomPassword;
window.getLastJoinAttempt = function () { return { ...lastJoinAttempt }; };
window.clearLastJoinAttempt = function () { lastJoinAttempt = { roomId: '', role: '', password: '', hadPassword: false, roomName: '' }; };

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
          <label class="room-entry-field">
            <span>Пароль комнаты</span>
            <input id="roleModalPassword" class="room-entry-input" type="password" autocomplete="off" placeholder="Введите пароль" />
          </label>
        `;
        // Insert before error block (if present), otherwise append.
        const errEl = body.querySelector('#roleModalError');
        if (errEl && errEl.parentNode === body) body.insertBefore(pwRow, errEl);
        else body.appendChild(pwRow);
      }
      pwRow.style.display = pendingJoinRoomHasPassword ? '' : 'none';
      const inp = body.querySelector('#roleModalPassword');
      if (inp) inp.value = pendingJoinRoomHasPassword ? getRememberedRoomPassword(pendingJoinRoomId) : '';
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
    setAppStorageItem('int_user_role', String(normalizeRoleForDb(roleDb)));
    // update globals/UI
    try { window.myRole = normalizeRoleForApp(roleDb); } catch {}
    try {
      if (typeof myRole !== 'undefined') myRole = normalizeRoleForApp(roleDb);
      if (typeof myRoleSpan !== 'undefined' && myRoleSpan) myRoleSpan.textContent = normalizeRoleForUi(roleDb);
    } catch {}
  } catch {}

  // If the room is protected, use typed password from modal.
  let password = '';
  try {
    if (needsPw) {
      const inp = document.getElementById('roleModalPassword');
      password = String(inp?.value || '').trim();
      if (!password) {
        const err = document.getElementById('roleModalError');
        if (err) err.textContent = 'Введите пароль комнаты.';
        showRoomAccessPopup('Введите пароль комнаты, чтобы войти.', 'Требуется пароль');
        return;
      }
    }
  } catch {}

  lastJoinAttempt = {
    roomId: rid,
    role: String(roleDb || ''),
    password,
    hadPassword: needsPw,
    roomName: String(document.getElementById('roleModalRoomName')?.textContent || '')
  };

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

  if (roomEditorMode === 'edit' && editingRoomId) {
    sendMessage({ type: 'updateRoom', roomId: editingRoomId, name, password, scenario });
  } else {
    sendMessage({ type: 'createRoom', name, password, scenario });
  }
  closeCreateRoomModal();
});
