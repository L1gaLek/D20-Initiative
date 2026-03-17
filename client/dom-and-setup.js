// ================== ELEMENTS ==================
const loginDiv = document.getElementById('login-container');
const joinBtn = document.getElementById('joinBtn');
const usernameInput = document.getElementById('username');
const roleSelect = document.getElementById('role');
const loginError = document.getElementById('loginError');



// ===== Rooms lobby UI =====
const roomsDiv = document.getElementById('rooms-container');
const roomsList = document.getElementById('rooms-list');
const roomsError = document.getElementById('roomsError');

const tavernDiv = document.getElementById('tavern-container');
const tavernBgVideo = document.getElementById('tavern-bg-video');
const tavernMyName = document.getElementById('tavern-my-name');
const tavernChatModal = document.getElementById('tavernChatModal');
const tavernChatClose = document.getElementById('tavernChatClose');
const tavernChatList = document.getElementById('tavern-chat-list');
const tavernChatInput = document.getElementById('tavern-chat-input');
const tavernChatSend = document.getElementById('tavern-chat-send');
const tavernChatSubtitle = document.getElementById('tavern-chat-subtitle');
const tavernChatTabs = document.getElementById('tavern-chat-tabs');
const tavernChatUsersBtn = document.getElementById('tavern-chat-users-btn');
const tavernChatUsersPopover = document.getElementById('tavern-chat-users-popover');
const tavernChatUsersList = document.getElementById('tavern-chat-users-list');
const tavernChatQuote = document.getElementById('tavern-chat-quote');
const tavernChatBadgeGlobal = document.getElementById('tavern-hotspot-chat-badge-global');
const tavernChatBadgeDirect = document.getElementById('tavern-hotspot-chat-badge-direct');
const tavernBartenderModal = document.getElementById('tavernBartenderModal');
const tavernBartenderClose = document.getElementById('tavernBartenderClose');
const tavernBartenderNote = document.getElementById('tavern-bartender-note');
const tavernRoomsModal = document.getElementById('tavernRoomsModal');
const tavernRoomsClose = document.getElementById('tavernRoomsClose');
const tavernRoomsList = document.getElementById('tavern-rooms-list');
const tavernRoomsError = document.getElementById('tavernRoomsError');
const tavernCreateRoomBtn = document.getElementById('tavernCreateRoomBtn');
const tavernChatHotspot = document.getElementById('tavern-hotspot-chat');
const tavernBartenderHotspot = document.getElementById('tavern-hotspot-bartender');
const tavernBoardHotspot = document.getElementById('tavern-hotspot-board');
const roomChatModal = document.getElementById('roomChatModal');
const roomChatClose = document.getElementById('roomChatClose');
const roomChatList = document.getElementById('room-chat-list');
const roomChatInput = document.getElementById('room-chat-input');
const roomChatSend = document.getElementById('room-chat-send');
const roomChatSubtitle = document.getElementById('room-chat-subtitle');
const roomChatTabs = document.getElementById('room-chat-tabs');
const roomChatUsersBtn = document.getElementById('room-chat-users-btn');
const roomChatUsersPopover = document.getElementById('room-chat-users-popover');
const roomChatUsersList = document.getElementById('room-chat-users-list');
const roomChatQuote = document.getElementById('room-chat-quote');
const roomChatBadgeGlobal = document.getElementById('room-chat-badge-global');
const roomChatBadgeDirect = document.getElementById('room-chat-badge-direct');
const roomChatOpenBtn = document.getElementById('room-chat-open');
const roomReturnTavernBtn = document.getElementById('room-return-tavern');

const createRoomBtn = document.getElementById('createRoomBtn');
const createRoomModal = document.getElementById('createRoomModal');
const createRoomClose = document.getElementById('createRoomClose');
const createRoomCancel = document.getElementById('createRoomCancel');
const createRoomSubmit = document.getElementById('createRoomSubmit');

const roomNameInput = document.getElementById('roomNameInput');
const roomPasswordInput = document.getElementById('roomPasswordInput');
const roomScenarioInput = document.getElementById('roomScenarioInput');

const gameUI = document.getElementById('main-container');

// ===== Lobby scene (video background + screen state) =====
function updateLobbyModeClass() {
  try {
    const loginVisible = !!(loginDiv && loginDiv.style.display !== 'none');
    const roomsVisible = !!(roomsDiv && roomsDiv.style.display !== 'none');
    const tavernVisible = !!(tavernDiv && !tavernDiv.classList.contains('hidden') && tavernDiv.style.display !== 'none');
    const inLobby = loginVisible || roomsVisible || tavernVisible;
    document.body.classList.toggle('lobby-active', inLobby);
    try { lobbyAmbientAudio.sync(); } catch {}
  } catch {}
}

function watchLobbyVisibility() {
  try {
    const sync = () => updateLobbyModeClass();
    const observer = new MutationObserver(sync);
    [loginDiv, roomsDiv, tavernDiv, gameUI].forEach((el) => {
      if (!el) return;
      observer.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
    });
    sync();
  } catch {
    updateLobbyModeClass();
  }
}

function buildLobbyVideoCandidates(fileName) {
  try {
    const path = String(window.location.pathname || '/');
    const basePath = path.endsWith('/')
      ? path.replace(/\/$/, '')
      : path.replace(/\/[^/]*$/, '');

    return [
      '/lobby/' + fileName,
      './lobby/' + fileName,
      (basePath ? basePath : '') + '/lobby/' + fileName
    ].filter((value, index, arr) => value && arr.indexOf(value) === index);
  } catch {
    return ['/lobby/' + fileName];
  }
}

function applyVideoSourceWithFallback(video, sources) {
  if (!video) return;
  const list = Array.isArray(sources) ? sources.filter(Boolean) : [];
  if (!list.length) return;
  let sourceIndex = 0;

  const applySource = (src) => {
    if (!src) return;
    if (video.getAttribute('src') === src) return;
    video.setAttribute('src', src);
    try { video.load(); } catch {}
    const playPromise = video.play?.();
    if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(() => {});
  };

  video.addEventListener('error', () => {
    sourceIndex += 1;
    const fallback = list[sourceIndex] || '';
    if (fallback) applySource(fallback);
  });

  applySource(list[sourceIndex] || '');
}

function initLobbyVideoBackground() {
  const video = document.getElementById('lobby-bg-video');
  if (!video) return;

  const files = [
    'lobby-d1.mp4',
    'lobby-n1.mp4',
    'lobby-n2.mp4'
  ];

  let pickedFile = files[0];
  try {
    const last = String(localStorage.getItem('dnd_lobby_last_video_file') || '');
    const pool = files.filter(file => file !== last);
    const list = pool.length ? pool : files;
    pickedFile = list[Math.floor(Math.random() * list.length)] || files[0];
    localStorage.setItem('dnd_lobby_last_video_file', pickedFile);
  } catch {}

  applyVideoSourceWithFallback(video, buildLobbyVideoCandidates(pickedFile));
}

function initTavernVideoBackground() {
  if (!tavernBgVideo) return;
  applyVideoSourceWithFallback(tavernBgVideo, buildLobbyVideoCandidates('taverna.mp4'));
}

function buildLobbyAmbientCandidates(fileName) {
  try {
    const path = String(window.location.pathname || '/');
    const basePath = path.endsWith('/')
      ? path.replace(/\/$/, '')
      : path.replace(/\/[^/]*$/, '');

    return [
      'lobby/ambient/' + fileName,
      '.lobby/ambient/' + fileName,
      (basePath ? basePath : '') + 'lobby/ambient/' + fileName
    ].filter((value, index, arr) => value && arr.indexOf(value) === index);
  } catch {
    return ['lobby/ambient/' + fileName];
  }
}

const lobbyAmbientAudio = (() => {
  const audio = new Audio();
  audio.preload = 'auto';
  audio.loop = false;
  try { audio.playsInline = true; } catch {}
  try { audio.setAttribute('playsinline', ''); } catch {}
  try { audio.setAttribute('webkit-playsinline', ''); } catch {}

  const LS_VOL = 'dnd_bg_music_volume';
  const LS_LAST_TAVERN = 'dnd_last_tavern_ambient_file';
  const lobbyTrack = 'lobby.mp3';
  const tavernTracks = ['teverna.mp3', 'teverna1.mp3', 'teverna2.mp3'];

  let activeMode = '';
  let activeFile = '';
  let unlocked = false;
  let globalBound = false;

  function loadVolume() {
    try {
      const raw = Number(localStorage.getItem(LS_VOL));
      if (Number.isFinite(raw)) return Math.max(0, Math.min(1, raw));
    } catch {}
    return 0.4;
  }

  function applyVolume() {
    try { audio.muted = false; } catch {}
    try { audio.defaultMuted = false; } catch {}
    try { audio.volume = loadVolume(); } catch {}
  }

  function chooseTavernTrack() {
    try {
      const last = String(localStorage.getItem(LS_LAST_TAVERN) || '');
      const pool = tavernTracks.filter((file) => file !== last);
      const list = pool.length ? pool : tavernTracks;
      const picked = list[Math.floor(Math.random() * list.length)] || tavernTracks[0];
      localStorage.setItem(LS_LAST_TAVERN, picked);
      return picked;
    } catch {
      return tavernTracks[Math.floor(Math.random() * tavernTracks.length)] || tavernTracks[0];
    }
  }

  function playPromiseSafe() {
    try {
      const p = audio.play?.();
      if (p && typeof p.catch === 'function') {
        return p.catch(() => {
          unlocked = false;
          return false;
        });
      }
      return Promise.resolve(true);
    } catch {
      unlocked = false;
      return Promise.resolve(false);
    }
  }

  async function tryUnlock() {
    applyVolume();
    try {
      await playPromiseSafe();
      try { audio.pause(); } catch {}
      unlocked = true;
      return true;
    } catch {
      unlocked = false;
      return false;
    }
  }

  async function start(mode) {
    const nextMode = String(mode || '');
    if (nextMode !== 'lobby' && nextMode !== 'tavern') {
      stop();
      return;
    }

    applyVolume();
    const fileName = nextMode === 'lobby' ? lobbyTrack : (activeMode === 'tavern' && activeFile ? activeFile : chooseTavernTrack());
    const sources = buildLobbyAmbientCandidates(fileName);
    const nextSrc = sources[0] || '';

    if (!nextSrc) {
      stop();
      return;
    }

    if (activeMode !== nextMode || activeFile !== fileName || audio.getAttribute('src') !== nextSrc) {
      activeMode = nextMode;
      activeFile = fileName;
      audio.setAttribute('src', nextSrc);
      try { audio.load(); } catch {}
    }

    const ok = unlocked ? true : await tryUnlock();
    if (!ok) return;

    try {
      await playPromiseSafe();
    } catch {}
  }

  function stop() {
    activeMode = '';
    activeFile = '';
    try { audio.pause(); } catch {}
    try { audio.removeAttribute('src'); audio.load(); } catch {}
  }

  function sync() {
    const loginVisible = !!(loginDiv && loginDiv.style.display !== 'none');
    const tavernVisible = !!(tavernDiv && !tavernDiv.classList.contains('hidden') && tavernDiv.style.display !== 'none');
    const gameVisible = !!(gameUI && gameUI.style.display !== 'none');

    if (gameVisible) {
      stop();
      return;
    }
    if (tavernVisible) {
      start('tavern');
      return;
    }
    if (loginVisible) {
      start('lobby');
      return;
    }
    stop();
  }

  function bindGlobalUnlock() {
    if (globalBound) return;
    globalBound = true;

    const onGesture = async () => {
      applyVolume();
      await tryUnlock();
      sync();
    };

    const opts = { capture: true, passive: true };
    window.addEventListener('pointerdown', onGesture, opts);
    window.addEventListener('click', onGesture, opts);
    window.addEventListener('touchstart', onGesture, opts);
    window.addEventListener('keydown', onGesture, { capture: true });
    window.addEventListener('storage', (e) => {
      if (e?.key === LS_VOL) applyVolume();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') sync();
      else {
        try { audio.pause(); } catch {}
      }
    });
  }

  audio.addEventListener('ended', () => {
    if (activeMode !== 'tavern') return;
    activeFile = chooseTavernTrack();
    start('tavern');
  });

  audio.addEventListener('error', () => {
    if (activeMode === 'tavern') {
      activeFile = chooseTavernTrack();
      start('tavern');
      return;
    }
    if (activeMode === 'lobby') {
      stop();
    }
  });

  bindGlobalUnlock();
  applyVolume();

  return { sync, start, stop, audio };
})();

const myNameSpan = document.getElementById('myName');
const myRoleSpan = document.getElementById('myRole');
const myRoomSpan = document.getElementById('myRoom');
const myScenarioSpan = document.getElementById('myScenario');
const diceViz = document.getElementById('dice-viz');


let tavernChannel = null;
let tavernPresenceCount = 0;
let tavernMessageSeq = 0;
const TAVERN_ROOM_LOG_ID = '__tavern_lobby__';
const TAVERN_LOG_PREFIX = 'TVRN1:';
const TAVERN_MAX_MESSAGES = 50;
const tavernChatState = {
  activeChatKey: 'global',
  chats: new Map([['global', []]]),
  tabs: [{ key: 'global', label: 'Общий стол', closable: false }],
  knownUsers: new Map(),
  loadedHistory: false,
  unreadGlobal: 0,
  unreadDirect: 0,
  unreadByChat: new Map(),
  quoteDraft: null
};

function hideModalEl(el) {
  if (!el) return;
  el.classList.add('hidden');
}

function showModalEl(el) {
  if (!el) return;
  el.classList.remove('hidden');
}

function isTavernVisible() {
  return !!(tavernDiv && !tavernDiv.classList.contains('hidden') && tavernDiv.style.display !== 'none');
}

function openTavern() {
  if (!tavernDiv) return;
  loginDiv.style.display = 'none';
  roomsDiv.style.display = 'none';
  gameUI.style.display = 'none';
  tavernDiv.classList.remove('hidden');
  tavernDiv.setAttribute('aria-hidden', 'false');
  if (tavernMyName) tavernMyName.textContent = String(localStorage.getItem('dnd_user_name') || myNameSpan?.textContent || 'путник');
  initTavernVideoBackground();
  updateLobbyModeClass();
  try { lobbyAmbientAudio.sync(); } catch {}
}

function closeTavern() {
  if (!tavernDiv) return;
  tavernDiv.classList.add('hidden');
  tavernDiv.setAttribute('aria-hidden', 'true');
  [tavernChatModal, tavernBartenderModal, tavernRoomsModal].forEach(hideModalEl);
  closeTavernUsersPopover();
  updateLobbyModeClass();
  try { lobbyAmbientAudio.sync(); } catch {}
}

function getTavernMyUserId() {
  return String(localStorage.getItem('dnd_user_id') || myId || 'guest');
}

function getTavernMyUserName() {
  return String(localStorage.getItem('dnd_user_name') || myNameSpan?.textContent || 'Путник');
}

function safeJsonParse(raw, fallback = null) {
  try { return JSON.parse(raw); } catch { return fallback; }
}

function encodeTavernLogRow(message) {
  return `${TAVERN_LOG_PREFIX}${JSON.stringify(message || {})}`;
}

function decodeTavernLogRow(rowText) {
  const raw = String(rowText || '');
  if (!raw.startsWith(TAVERN_LOG_PREFIX)) return null;
  const data = safeJsonParse(raw.slice(TAVERN_LOG_PREFIX.length), null);
  return data && typeof data === 'object' ? data : null;
}

function ensureTavernChat(key, label = 'Диалог') {
  const chatKey = String(key || '').trim() || 'global';
  if (!tavernChatState.chats.has(chatKey)) tavernChatState.chats.set(chatKey, []);
  if (!tavernChatState.tabs.some((tab) => String(tab.key) === chatKey)) {
    tavernChatState.tabs.push({ key: chatKey, label: String(label || 'Диалог'), closable: chatKey !== 'global' });
  }
  return tavernChatState.chats.get(chatKey);
}

function rememberTavernUser(id, name, extra = {}) {
  const uid = String(id || '').trim();
  if (!uid) return;
  const prev = tavernChatState.knownUsers.get(uid) || {};
  tavernChatState.knownUsers.set(uid, {
    id: uid,
    name: String(name || prev.name || 'Путник'),
    online: typeof extra.online === 'boolean' ? extra.online : !!prev.online,
    joinedAt: Number(extra.joinedAt || prev.joinedAt || 0) || 0
  });
}

function getDirectChatKey(otherUserId) {
  return `dm:${String(otherUserId || '').trim()}`;
}

function getDirectChatLabel(otherUserId, fallback = 'Личное') {
  const uid = String(otherUserId || '').trim();
  return String(tavernChatState.knownUsers.get(uid)?.name || fallback || 'Личное');
}

function getUnreadCountForChat(chatKey) {
  return Number(tavernChatState.unreadByChat.get(String(chatKey || 'global')) || 0) || 0;
}

function updateTavernHotspotBadges() {
  const apply = (el, count) => {
    if (!el) return;
    if (count > 0) {
      el.classList.remove('hidden');
      el.textContent = count > 99 ? '99+' : String(count);
    } else {
      el.classList.add('hidden');
      el.textContent = '0';
    }
  };
  apply(tavernChatBadgeGlobal, Math.max(0, Number(tavernChatState.unreadGlobal) || 0));
  apply(tavernChatBadgeDirect, Math.max(0, Number(tavernChatState.unreadDirect) || 0));
}

function clearTavernQuoteDraft() {
  tavernChatState.quoteDraft = null;
  if (!tavernChatQuote) return;
  tavernChatQuote.classList.add('hidden');
  tavernChatQuote.setAttribute('aria-hidden', 'true');
  tavernChatQuote.innerHTML = '';
}

function setTavernQuoteDraft(message) {
  if (!message || message.system) return;
  tavernChatState.quoteDraft = {
    fromId: String(message.fromId || ''),
    fromName: String(message.fromName || 'Путник'),
    text: String(message.text || '').trim().slice(0, 280)
  };
  if (!tavernChatQuote) return;
  tavernChatQuote.classList.remove('hidden');
  tavernChatQuote.setAttribute('aria-hidden', 'false');
  tavernChatQuote.innerHTML = `
    <div class="tavern-chat-quote__meta">Ответ для ${escapeHtmlLite(tavernChatState.quoteDraft.fromName)}</div>
    <div class="tavern-chat-quote__text">${escapeHtmlLite(tavernChatState.quoteDraft.text)}</div>
    <button type="button" class="tavern-chat-quote__clear" data-clear-tavern-quote title="Убрать цитату">✕</button>
  `;
}

function markTavernChatRead(chatKey) {
  const key = String(chatKey || tavernChatState.activeChatKey || 'global');
  const prev = getUnreadCountForChat(key);
  if (!prev) return;
  tavernChatState.unreadByChat.set(key, 0);
  if (key === 'global') tavernChatState.unreadGlobal = Math.max(0, (Number(tavernChatState.unreadGlobal) || 0) - prev);
  else tavernChatState.unreadDirect = Math.max(0, (Number(tavernChatState.unreadDirect) || 0) - prev);
  updateTavernHotspotBadges();
}

function noteTavernUnread(item) {
  if (!tavernChatState.loadedHistory) return;
  if (!item || item.system || item.mine) return;
  const modalOpen = !!(tavernChatModal && !tavernChatModal.classList.contains('hidden'));
  const isActive = String(tavernChatState.activeChatKey || 'global') === String(item.chatKey || 'global');
  if (modalOpen && isActive) return;
  const key = String(item.chatKey || 'global');
  tavernChatState.unreadByChat.set(key, getUnreadCountForChat(key) + 1);
  if (key === 'global') tavernChatState.unreadGlobal = (Number(tavernChatState.unreadGlobal) || 0) + 1;
  else tavernChatState.unreadDirect = (Number(tavernChatState.unreadDirect) || 0) + 1;
  updateTavernHotspotBadges();
}

function normalizeTavernMessage(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const myIdLocal = getTavernMyUserId();
  const chatType = String(entry.chatType || 'global') === 'direct' ? 'direct' : 'global';
  const item = {
    id: String(entry.id || `tavern-${Date.now()}-${++tavernMessageSeq}`),
    chatType,
    fromId: String(entry.fromId || ''),
    fromName: String(entry.fromName || entry.name || 'Путник'),
    toId: String(entry.toId || ''),
    toName: String(entry.toName || ''),
    text: String(entry.text || ''),
    ts: Number(entry.ts || Date.now()),
    system: !!entry.system,
    chatKey: 'global',
    label: 'Общий стол',
    mine: false,
    quote: (entry.quote && typeof entry.quote === 'object') ? {
      fromId: String(entry.quote.fromId || ''),
      fromName: String(entry.quote.fromName || entry.quote.name || 'Путник'),
      text: String(entry.quote.text || '')
    } : null
  };
  if (!item.text && !item.system) return null;
  if (item.fromId) rememberTavernUser(item.fromId, item.fromName);
  if (item.toId) rememberTavernUser(item.toId, item.toName || item.toId);

  if (chatType === 'direct') {
    if (!item.fromId || !item.toId) return null;
    const isMine = item.fromId === myIdLocal;
    const isForMe = item.toId === myIdLocal;
    if (!isMine && !isForMe) return null;
    const otherId = isMine ? item.toId : item.fromId;
    const otherName = isMine ? (item.toName || getDirectChatLabel(otherId, 'Собеседник')) : item.fromName;
    rememberTavernUser(otherId, otherName);
    item.chatKey = getDirectChatKey(otherId);
    item.label = otherName;
    item.mine = isMine;
  } else {
    item.mine = item.fromId && item.fromId === myIdLocal;
  }
  return item;
}

function pushTavernMessage(entry) {
  const item = normalizeTavernMessage(entry);
  if (!item) return;
  const list = ensureTavernChat(item.chatKey, item.label);
  if (list.some((x) => String(x.id) === item.id)) return;
  list.push(item);
  while (list.length > TAVERN_MAX_MESSAGES) list.shift();
  noteTavernUnread(item);
  renderTavernChatTabs();
  renderTavernChat();
}

function syncTavernPresenceUsers() {
  try {
    const state = tavernChannel?.presenceState?.() || {};
    const seen = new Set();
    Object.values(state).forEach((entries) => {
      (Array.isArray(entries) ? entries : []).forEach((entry) => {
        const uid = String(entry?.userId || entry?.presence_ref || '').trim();
        if (!uid) return;
        seen.add(uid);
        rememberTavernUser(uid, String(entry?.userName || tavernChatState.knownUsers.get(uid)?.name || 'Путник'), { online: true, joinedAt: Number(entry?.joinedAt || 0) || 0 });
      });
    });
    tavernChatState.knownUsers.forEach((value, key) => {
      if (!value) return;
      value.online = seen.has(key);
    });
    tavernPresenceCount = seen.size;
  } catch {
    tavernPresenceCount = 0;
  }
  renderTavernUsersList();
  renderTavernSubtitle();
  updateTavernHotspotBadges();
}

function fmtTavernTime(ts) {
  try {
    return new Date(Number(ts) || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function escapeHtmlLite(s) {
  return String(s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getActiveTavernMessages() {
  return tavernChatState.chats.get(String(tavernChatState.activeChatKey || 'global')) || [];
}

function renderTavernSubtitle() {
  if (!tavernChatSubtitle) return;
  const activeKey = String(tavernChatState.activeChatKey || 'global');
  if (activeKey === 'global') {
    tavernChatSubtitle.textContent = tavernPresenceCount > 0
      ? `Разговоры путников в таверне • Сейчас в таверне: ${tavernPresenceCount}`
      : 'Разговоры путников в таверне';
    return;
  }
  const otherId = activeKey.replace(/^dm:/, '');
  const label = getDirectChatLabel(otherId, 'Личная беседа');
  tavernChatSubtitle.textContent = `Личная переписка • ${label}`;
}

function renderTavernChatTabs() {
  if (!tavernChatTabs) return;
  tavernChatTabs.innerHTML = tavernChatState.tabs.map((tab) => {
    const active = String(tab.key) === String(tavernChatState.activeChatKey || 'global');
    const unread = getUnreadCountForChat(tab.key);
    return `
      <button class="tavern-chat-tab ${active ? 'is-active' : ''}" type="button" data-chat-key="${escapeHtmlLite(tab.key)}">
        <span>${escapeHtmlLite(tab.label)}</span>
        ${unread > 0 ? `<span class="tavern-chat-tab__unread">${unread > 99 ? '99+' : unread}</span>` : ''}
        ${tab.closable ? '<span class="tavern-chat-tab__close" aria-hidden="true">✕</span>' : ''}
      </button>
    `;
  }).join('');
  updateTavernHotspotBadges();
}

function renderTavernUsersList() {
  if (!tavernChatUsersList) return;
  const myIdLocal = getTavernMyUserId();
  const users = Array.from(tavernChatState.knownUsers.values())
    .filter((u) => u && String(u.id) && String(u.id) !== myIdLocal)
    .sort((a, b) => {
      if (!!b.online !== !!a.online) return Number(b.online) - Number(a.online);
      return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
    });
  if (!users.length) {
    tavernChatUsersList.innerHTML = '<div class="tavern-chat-item tavern-chat-item--system"><div class="tavern-chat-item__text">Пока никто не появился. Когда путники войдут в таверну, их можно будет выбрать здесь.</div></div>';
    return;
  }
  tavernChatUsersList.innerHTML = users.map((user) => `
    <div class="tavern-chat-user-item">
      <div class="tavern-chat-user-item__meta">
        <div class="tavern-chat-user-item__name">${escapeHtmlLite(user.name)}</div>
        <div class="tavern-chat-user-item__hint">${user.online ? 'Сейчас в таверне' : 'Недавно общался'}</div>
      </div>
      <button type="button" class="tavern-chat-user-item__btn" data-direct-user="${escapeHtmlLite(user.id)}">Написать</button>
    </div>
  `).join('');
}

function closeTavernUsersPopover() {
  if (!tavernChatUsersPopover) return;
  tavernChatUsersPopover.classList.add('hidden');
  tavernChatUsersPopover.setAttribute('aria-hidden', 'true');
}

function toggleTavernUsersPopover(force) {
  if (!tavernChatUsersPopover) return;
  const shouldOpen = typeof force === 'boolean' ? force : tavernChatUsersPopover.classList.contains('hidden');
  if (shouldOpen) {
    renderTavernUsersList();
    tavernChatUsersPopover.classList.remove('hidden');
    tavernChatUsersPopover.setAttribute('aria-hidden', 'false');
  } else {
    closeTavernUsersPopover();
  }
}

function setActiveTavernChat(chatKey) {
  const key = String(chatKey || 'global');
  if (!tavernChatState.chats.has(key)) return;
  tavernChatState.activeChatKey = key;
  markTavernChatRead(key);
  renderTavernChatTabs();
  renderTavernSubtitle();
  renderTavernChat();
  closeTavernUsersPopover();
  try { tavernChatInput?.focus(); } catch {}
}

function ensureDirectChatWithUser(otherUserId, fallbackName = 'Личное') {
  const uid = String(otherUserId || '').trim();
  if (!uid) return 'global';
  rememberTavernUser(uid, fallbackName);
  const key = getDirectChatKey(uid);
  ensureTavernChat(key, getDirectChatLabel(uid, fallbackName));
  const tab = tavernChatState.tabs.find((x) => String(x.key) === key);
  if (tab) tab.label = getDirectChatLabel(uid, fallbackName);
  renderTavernChatTabs();
  return key;
}

function closeTavernChatTab(chatKey) {
  const key = String(chatKey || '');
  if (!key || key === 'global') return;
  markTavernChatRead(key);
  tavernChatState.tabs = tavernChatState.tabs.filter((tab) => String(tab.key) !== key);
  tavernChatState.chats.delete(key);
  tavernChatState.unreadByChat.delete(key);
  if (String(tavernChatState.activeChatKey) === key) tavernChatState.activeChatKey = 'global';
  renderTavernChatTabs();
  renderTavernSubtitle();
  renderTavernChat();
}

function renderTavernChat() {
  if (!tavernChatList) return;
  const messages = getActiveTavernMessages();
  if (!messages.length) {
    const emptyText = String(tavernChatState.activeChatKey || 'global') === 'global'
      ? 'Пока в таверне тихо. Начните разговор первыми.'
      : 'Личная переписка пока пуста. Напишите первое сообщение.';
    tavernChatList.innerHTML = `<div class="tavern-chat-item tavern-chat-item--system"><div class="tavern-chat-item__empty">${escapeHtmlLite(emptyText)}</div></div>`;
    return;
  }
  tavernChatList.innerHTML = messages.map((msg) => {
    const name = msg.system ? 'Таверна' : msg.fromName;
    const badge = msg.chatType === 'direct' ? '<span class="tavern-chat-item__badge">Личное</span>' : '';
    const quoteHtml = msg.quote && msg.quote.text ? `
      <div class="tavern-chat-item__quote">
        <div class="tavern-chat-item__quote-name">${escapeHtmlLite(msg.quote.fromName || 'Путник')}</div>
        <div class="tavern-chat-item__quote-text">${escapeHtmlLite(msg.quote.text)}</div>
      </div>` : '';
    const actionsHtml = (!msg.system && !msg.mine && msg.chatType === 'global') ? `
      <span class="tavern-chat-item__actions">
        <button type="button" class="tavern-chat-icon-btn" data-chat-direct="${escapeHtmlLite(msg.fromId)}" title="Личное сообщение">💬</button>
        <button type="button" class="tavern-chat-icon-btn" data-chat-reply="${escapeHtmlLite(msg.id)}" title="Ответить">↩</button>
      </span>` : '';
    return `
      <div class="tavern-chat-item ${msg.system ? 'tavern-chat-item--system' : ''} ${msg.mine ? 'tavern-chat-item--mine' : ''} ${msg.chatType === 'direct' ? 'tavern-chat-item--direct' : ''}" data-message-id="${escapeHtmlLite(msg.id)}">
        <div class="tavern-chat-item__meta">
          <span class="tavern-chat-item__meta-main">${escapeHtmlLite(name)} ${badge} ${actionsHtml}</span>
          <span>${escapeHtmlLite(fmtTavernTime(msg.ts))}</span>
        </div>
        ${quoteHtml}
        <div class="tavern-chat-item__text">${escapeHtmlLite(msg.text)}</div>
      </div>
    `;
  }).join('');
  tavernChatList.scrollTop = tavernChatList.scrollHeight;
}

async function loadTavernChatHistory() {
  if (!sbClient) return;
  try {
    const { data, error } = await sbClient
      .from('room_log')
      .select('id,text,created_at')
      .eq('room_id', TAVERN_ROOM_LOG_ID)
      .order('created_at', { ascending: true })
      .limit(300);
    if (error) throw error;

    tavernChatState.chats = new Map([['global', []]]);
    tavernChatState.tabs = [{ key: 'global', label: 'Общий стол', closable: false }];
    tavernChatState.unreadGlobal = 0;
    tavernChatState.unreadDirect = 0;
    tavernChatState.unreadByChat = new Map();
    tavernChatState.loadedHistory = false;
    const rows = Array.isArray(data) ? data : [];
    rows.forEach((row) => {
      const msg = decodeTavernLogRow(row?.text);
      if (msg) pushTavernMessage(msg);
    });
    tavernChatState.loadedHistory = true;
    if (!tavernChatState.chats.has(String(tavernChatState.activeChatKey || 'global'))) {
      tavernChatState.activeChatKey = 'global';
    }
    renderTavernChatTabs();
    renderTavernSubtitle();
    renderTavernChat();
  } catch (e) {
    console.warn('loadTavernChatHistory failed', e);
  }
}

async function ensureTavernChannel() {
  if (!sbClient) return null;
  if (tavernChannel) return tavernChannel;
  const userId = getTavernMyUserId();
  const userName = getTavernMyUserName();
  rememberTavernUser(userId, userName, { online: true });
  tavernChannel = sbClient
    .channel('tavern:lobby', { config: { presence: { key: userId } } })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_log', filter: `room_id=eq.${TAVERN_ROOM_LOG_ID}` }, ({ new: row }) => {
      const msg = decodeTavernLogRow(row?.text);
      if (msg) pushTavernMessage(msg);
    })
    .on('presence', { event: 'sync' }, () => {
      syncTavernPresenceUsers();
    });
  await tavernChannel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      try {
        await tavernChannel.track({ userId, userName, joinedAt: Date.now() });
      } catch {}
      await loadTavernChatHistory();
      syncTavernPresenceUsers();
    }
  });
  return tavernChannel;
}

async function stopTavernChannel() {
  if (!tavernChannel) return;
  try { await tavernChannel.unsubscribe(); } catch {}
  tavernChannel = null;
  tavernPresenceCount = 0;
  tavernChatState.knownUsers.forEach((value) => {
    if (value) value.online = false;
  });
  renderTavernUsersList();
  renderTavernSubtitle();
}

async function persistTavernMessage(message) {
  if (!message || !sbClient) return;
  try {
    await sbClient.from('room_log').insert({ room_id: TAVERN_ROOM_LOG_ID, text: encodeTavernLogRow(message) });
  } catch (e) {
    console.warn('persistTavernMessage failed', e);
  }
}

async function sendTavernChatMessage() {
  const text = String(tavernChatInput?.value || '').trim();
  if (!text) return;
  const userId = getTavernMyUserId();
  const userName = getTavernMyUserName();
  let message = {
    id: `tavern-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    chatType: 'global',
    fromId: userId,
    fromName: userName,
    text,
    ts: Date.now(),
    quote: tavernChatState.quoteDraft ? { ...tavernChatState.quoteDraft } : null
  };

  const activeKey = String(tavernChatState.activeChatKey || 'global');
  if (activeKey !== 'global') {
    const otherId = activeKey.replace(/^dm:/, '');
    const otherName = getDirectChatLabel(otherId, 'Собеседник');
    message = {
      ...message,
      chatType: 'direct',
      toId: otherId,
      toName: otherName
    };
  }

  pushTavernMessage(message);
  try { if (tavernChatInput) tavernChatInput.value = ''; } catch {}
  clearTavernQuoteDraft();
  await ensureTavernChannel();
  await persistTavernMessage(message);
}

function openTavernChat() {
  showModalEl(tavernChatModal);
  ensureTavernChannel();
  markTavernChatRead(tavernChatState.activeChatKey || 'global');
  renderTavernChatTabs();
  renderTavernSubtitle();
  renderTavernUsersList();
  renderTavernChat();
  setTimeout(() => tavernChatInput?.focus(), 0);
}

function openTavernBartender() {
  showModalEl(tavernBartenderModal);
}

function openTavernRooms() {
  showModalEl(tavernRoomsModal);
  if (tavernRoomsError) tavernRoomsError.textContent = '';
  try { sendMessage({ type: 'listRooms' }); } catch {}
}



const ROOM_CHAT_LOG_PREFIX = 'RCHAT1:';
const ROOM_CHAT_MAX_MESSAGES = 50;
const roomChatState = {
  activeChatKey: 'global',
  chats: new Map([['global', []]]),
  tabs: [{ key: 'global', label: 'Общий чат', closable: false }],
  loadedHistory: false,
  unreadGlobal: 0,
  unreadDirect: 0,
  unreadByChat: new Map(),
  quoteDraft: null,
  roomId: ''
};

function encodeRoomChatLogRow(message) {
  return `${ROOM_CHAT_LOG_PREFIX}${JSON.stringify(message || {})}`;
}
function decodeRoomChatLogRow(rowText) {
  const raw = String(rowText || '');
  if (!raw.startsWith(ROOM_CHAT_LOG_PREFIX)) return null;
  const data = safeJsonParse(raw.slice(ROOM_CHAT_LOG_PREFIX.length), null);
  return data && typeof data === 'object' ? data : null;
}
function isRoomChatLogText(text) {
  return String(text || '').startsWith(ROOM_CHAT_LOG_PREFIX);
}
function resetRoomChatState(roomId = '') {
  roomChatState.activeChatKey = 'global';
  roomChatState.chats = new Map([['global', []]]);
  roomChatState.tabs = [{ key: 'global', label: 'Общий чат', closable: false }];
  roomChatState.loadedHistory = false;
  roomChatState.unreadGlobal = 0;
  roomChatState.unreadDirect = 0;
  roomChatState.unreadByChat = new Map();
  roomChatState.quoteDraft = null;
  roomChatState.roomId = String(roomId || '');
  clearRoomChatQuoteDraft();
  updateRoomChatBadges();
}
function ensureRoomChat(key, label = 'Диалог') {
  const chatKey = String(key || '').trim() || 'global';
  if (!roomChatState.chats.has(chatKey)) roomChatState.chats.set(chatKey, []);
  if (!roomChatState.tabs.some((tab) => String(tab.key) === chatKey)) {
    roomChatState.tabs.push({ key: chatKey, label: String(label || 'Диалог'), closable: chatKey !== 'global' });
  }
  return roomChatState.chats.get(chatKey);
}
function getRoomChatUserName(userId, fallback = 'Собеседник') {
  const uid = String(userId || '').trim();
  if (!uid) return fallback;
  return String(usersById.get(uid)?.name || fallback || 'Собеседник');
}
function getRoomDirectChatKey(otherUserId) { return `dm:${String(otherUserId || '').trim()}`; }
function getRoomUnreadCountForChat(chatKey) { return Number(roomChatState.unreadByChat.get(String(chatKey || 'global')) || 0) || 0; }
function updateRoomChatBadges() {
  const apply = (el, count) => {
    if (!el) return;
    if (count > 0) {
      el.classList.remove('hidden');
      el.textContent = count > 99 ? '99+' : String(count);
    } else {
      el.classList.add('hidden');
      el.textContent = '0';
    }
  };
  apply(roomChatBadgeGlobal, Math.max(0, Number(roomChatState.unreadGlobal) || 0));
  apply(roomChatBadgeDirect, Math.max(0, Number(roomChatState.unreadDirect) || 0));
}
function clearRoomChatQuoteDraft() {
  roomChatState.quoteDraft = null;
  if (!roomChatQuote) return;
  roomChatQuote.classList.add('hidden');
  roomChatQuote.setAttribute('aria-hidden', 'true');
  roomChatQuote.innerHTML = '';
}
function setRoomChatQuoteDraft(message) {
  if (!message || message.system) return;
  roomChatState.quoteDraft = {
    fromId: String(message.fromId || ''),
    fromName: String(message.fromName || 'Путник'),
    text: String(message.text || '').trim().slice(0, 280)
  };
  if (!roomChatQuote) return;
  roomChatQuote.classList.remove('hidden');
  roomChatQuote.setAttribute('aria-hidden', 'false');
  roomChatQuote.innerHTML = `
    <div class="tavern-chat-quote__meta">Ответ для ${escapeHtmlLite(roomChatState.quoteDraft.fromName)}</div>
    <div class="tavern-chat-quote__text">${escapeHtmlLite(roomChatState.quoteDraft.text)}</div>
    <button type="button" class="tavern-chat-quote__clear" data-clear-room-quote title="Убрать цитату">✕</button>
  `;
}
function markRoomChatRead(chatKey) {
  const key = String(chatKey || roomChatState.activeChatKey || 'global');
  const prev = getRoomUnreadCountForChat(key);
  if (!prev) return;
  roomChatState.unreadByChat.set(key, 0);
  if (key === 'global') roomChatState.unreadGlobal = Math.max(0, (Number(roomChatState.unreadGlobal) || 0) - prev);
  else roomChatState.unreadDirect = Math.max(0, (Number(roomChatState.unreadDirect) || 0) - prev);
  updateRoomChatBadges();
}
function noteRoomChatUnread(item) {
  if (!roomChatState.loadedHistory) return;
  if (!item || item.system || item.mine) return;
  const modalOpen = !!(roomChatModal && !roomChatModal.classList.contains('hidden'));
  const isActive = String(roomChatState.activeChatKey || 'global') === String(item.chatKey || 'global');
  if (modalOpen && isActive) return;
  const key = String(item.chatKey || 'global');
  roomChatState.unreadByChat.set(key, getRoomUnreadCountForChat(key) + 1);
  if (key === 'global') roomChatState.unreadGlobal = (Number(roomChatState.unreadGlobal) || 0) + 1;
  else roomChatState.unreadDirect = (Number(roomChatState.unreadDirect) || 0) + 1;
  updateRoomChatBadges();
}
function normalizeRoomChatMessage(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const myIdLocal = String(myId || localStorage.getItem('dnd_user_id') || 'guest');
  const chatType = String(entry.chatType || 'global') === 'direct' ? 'direct' : 'global';
  const item = {
    id: String(entry.id || `room-chat-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    chatType,
    fromId: String(entry.fromId || ''),
    fromName: String(entry.fromName || getRoomChatUserName(entry.fromId, 'Путник')),
    toId: String(entry.toId || ''),
    toName: String(entry.toName || getRoomChatUserName(entry.toId, 'Собеседник')),
    text: String(entry.text || ''),
    ts: Number(entry.ts || Date.now()),
    system: !!entry.system,
    chatKey: 'global',
    label: 'Общий чат',
    mine: false,
    quote: (entry.quote && typeof entry.quote === 'object') ? {
      fromId: String(entry.quote.fromId || ''),
      fromName: String(entry.quote.fromName || 'Путник'),
      text: String(entry.quote.text || '')
    } : null
  };
  if (!item.text && !item.system) return null;
  if (chatType === 'direct') {
    if (!item.fromId || !item.toId) return null;
    const isMine = item.fromId === myIdLocal;
    const isForMe = item.toId === myIdLocal;
    if (!isMine && !isForMe) return null;
    const otherId = isMine ? item.toId : item.fromId;
    item.chatKey = getRoomDirectChatKey(otherId);
    item.label = getRoomChatUserName(otherId, isMine ? item.toName : item.fromName || 'Собеседник');
    item.mine = isMine;
  } else {
    item.mine = item.fromId && item.fromId === myIdLocal;
  }
  return item;
}
function pushRoomChatMessage(entry) {
  const item = normalizeRoomChatMessage(entry);
  if (!item) return;
  const list = ensureRoomChat(item.chatKey, item.label);
  if (list.some((x) => String(x.id) === item.id)) return;
  list.push(item);
  while (list.length > ROOM_CHAT_MAX_MESSAGES) list.shift();
  noteRoomChatUnread(item);
  renderRoomChatTabs();
  renderRoomChat();
}
function getActiveRoomChatMessages() {
  return roomChatState.chats.get(String(roomChatState.activeChatKey || 'global')) || [];
}
function renderRoomChatSubtitle() {
  if (!roomChatSubtitle) return;
  const activeKey = String(roomChatState.activeChatKey || 'global');
  const count = Array.from(usersById.keys()).length;
  if (activeKey === 'global') {
    roomChatSubtitle.textContent = count > 0 ? `Разговоры внутри комнаты • Сейчас в комнате: ${count}` : 'Разговоры внутри комнаты';
    return;
  }
  const otherId = activeKey.replace(/^dm:/, '');
  roomChatSubtitle.textContent = `Личная переписка • ${getRoomChatUserName(otherId, 'Личная беседа')}`;
}
function renderRoomChatTabs() {
  if (!roomChatTabs) return;
  roomChatTabs.innerHTML = roomChatState.tabs.map((tab) => {
    const active = String(tab.key) === String(roomChatState.activeChatKey || 'global');
    const unread = getRoomUnreadCountForChat(tab.key);
    return `
      <button class="tavern-chat-tab ${active ? 'is-active' : ''}" type="button" data-room-chat-key="${escapeHtmlLite(tab.key)}">
        <span>${escapeHtmlLite(tab.label)}</span>
        ${unread > 0 ? `<span class="tavern-chat-tab__unread">${unread > 99 ? '99+' : unread}</span>` : ''}
        ${tab.closable ? '<span class="tavern-chat-tab__close" aria-hidden="true">✕</span>' : ''}
      </button>
    `;
  }).join('');
  updateRoomChatBadges();
}
function renderRoomChatUsersList() {
  if (!roomChatUsersList) return;
  const myIdLocal = String(myId || localStorage.getItem('dnd_user_id') || 'guest');
  const users = (usersOrder || [])
    .map((uid) => ({ id: String(uid), name: String(usersById.get(String(uid))?.name || ''), role: String(usersById.get(String(uid))?.role || '') }))
    .filter((u) => u.id && u.id !== myIdLocal && u.name)
    .sort((a,b) => String(a.name).localeCompare(String(b.name), 'ru'));
  if (!users.length) {
    roomChatUsersList.innerHTML = '<div class="tavern-chat-item tavern-chat-item--system"><div class="tavern-chat-item__text">Сейчас в комнате больше никого нет.</div></div>';
    return;
  }
  roomChatUsersList.innerHTML = users.map((user) => `
    <div class="tavern-chat-user-item">
      <div class="tavern-chat-user-item__meta">
        <div class="tavern-chat-user-item__name">${escapeHtmlLite(user.name)}</div>
        <div class="tavern-chat-user-item__hint">${escapeHtmlLite(user.role || 'Игрок')}</div>
      </div>
      <button type="button" class="tavern-chat-user-item__btn" data-room-direct-user="${escapeHtmlLite(user.id)}">Написать</button>
    </div>
  `).join('');
}
function closeRoomChatUsersPopover() {
  if (!roomChatUsersPopover) return;
  roomChatUsersPopover.classList.add('hidden');
  roomChatUsersPopover.setAttribute('aria-hidden', 'true');
}
function toggleRoomChatUsersPopover() {
  if (!roomChatUsersPopover) return;
  const willOpen = roomChatUsersPopover.classList.contains('hidden');
  roomChatUsersPopover.classList.toggle('hidden', !willOpen);
  roomChatUsersPopover.setAttribute('aria-hidden', willOpen ? 'false' : 'true');
  if (willOpen) renderRoomChatUsersList();
}
function ensureDirectRoomChatWithUser(otherUserId, fallbackName = 'Личное') {
  const uid = String(otherUserId || '').trim();
  if (!uid) return 'global';
  const key = getRoomDirectChatKey(uid);
  ensureRoomChat(key, getRoomChatUserName(uid, fallbackName));
  const tab = roomChatState.tabs.find((x) => String(x.key) === key);
  if (tab) tab.label = getRoomChatUserName(uid, fallbackName);
  renderRoomChatTabs();
  return key;
}
function setActiveRoomChat(chatKey) {
  const key = String(chatKey || 'global');
  if (!roomChatState.chats.has(key)) return;
  roomChatState.activeChatKey = key;
  markRoomChatRead(key);
  renderRoomChatTabs();
  renderRoomChatSubtitle();
  renderRoomChat();
  closeRoomChatUsersPopover();
  try { roomChatInput?.focus(); } catch {}
}
function closeRoomChatTab(chatKey) {
  const key = String(chatKey || '');
  if (!key || key === 'global') return;
  markRoomChatRead(key);
  roomChatState.tabs = roomChatState.tabs.filter((tab) => String(tab.key) !== key);
  roomChatState.chats.delete(key);
  roomChatState.unreadByChat.delete(key);
  if (String(roomChatState.activeChatKey) === key) roomChatState.activeChatKey = 'global';
  renderRoomChatTabs();
  renderRoomChatSubtitle();
  renderRoomChat();
}
function renderRoomChat() {
  if (!roomChatList) return;
  const messages = getActiveRoomChatMessages();
  if (!messages.length) {
    const emptyText = String(roomChatState.activeChatKey || 'global') === 'global'
      ? 'Пока в комнате тихо. Начните разговор первыми.'
      : 'Личная переписка пока пуста. Напишите первое сообщение.';
    roomChatList.innerHTML = `<div class="tavern-chat-item tavern-chat-item--system"><div class="tavern-chat-item__empty">${escapeHtmlLite(emptyText)}</div></div>`;
    return;
  }
  roomChatList.innerHTML = messages.map((msg) => {
    const name = msg.system ? 'Комната' : msg.fromName;
    const badge = msg.chatType === 'direct' ? '<span class="tavern-chat-item__badge">Личное</span>' : '';
    const quoteHtml = msg.quote && msg.quote.text ? `
      <div class="tavern-chat-item__quote">
        <div class="tavern-chat-item__quote-name">${escapeHtmlLite(msg.quote.fromName || 'Путник')}</div>
        <div class="tavern-chat-item__quote-text">${escapeHtmlLite(msg.quote.text)}</div>
      </div>` : '';
    const actionsHtml = (!msg.system && !msg.mine && msg.chatType === 'global') ? `
      <span class="tavern-chat-item__actions">
        <button type="button" class="tavern-chat-icon-btn" data-room-chat-direct="${escapeHtmlLite(msg.fromId)}" title="Личное сообщение">💬</button>
        <button type="button" class="tavern-chat-icon-btn" data-room-chat-reply="${escapeHtmlLite(msg.id)}" title="Ответить">↩</button>
      </span>` : '';
    return `
      <div class="tavern-chat-item ${msg.system ? 'tavern-chat-item--system' : ''} ${msg.mine ? 'tavern-chat-item--mine' : ''} ${msg.chatType === 'direct' ? 'tavern-chat-item--direct' : ''}" data-room-message-id="${escapeHtmlLite(msg.id)}">
        <div class="tavern-chat-item__meta">
          <span class="tavern-chat-item__meta-main">${escapeHtmlLite(name)} ${badge} ${actionsHtml}</span>
          <span>${escapeHtmlLite(fmtTavernTime(msg.ts))}</span>
        </div>
        ${quoteHtml}
        <div class="tavern-chat-item__text">${escapeHtmlLite(msg.text)}</div>
      </div>
    `;
  }).join('');
  roomChatList.scrollTop = roomChatList.scrollHeight;
}
function hydrateRoomChatFromRows(rows) {
  resetRoomChatState(currentRoomId || roomChatState.roomId || '');
  const list = Array.isArray(rows) ? rows : [];
  list.forEach((row) => {
    const msg = decodeRoomChatLogRow(row?.text || row);
    if (msg) pushRoomChatMessage(msg);
  });
  roomChatState.loadedHistory = true;
  if (!roomChatState.chats.has(String(roomChatState.activeChatKey || 'global'))) roomChatState.activeChatKey = 'global';
  renderRoomChatTabs();
  renderRoomChatSubtitle();
  renderRoomChatUsersList();
  renderRoomChat();
}
async function persistRoomChatMessage(message) {
  if (!message || !sbClient || !currentRoomId) return;
  try {
    await sbClient.from('room_log').insert({ room_id: currentRoomId, text: encodeRoomChatLogRow(message) });
  } catch (e) {
    console.warn('persistRoomChatMessage failed', e);
  }
}
async function sendRoomChatMessage() {
  const text = String(roomChatInput?.value || '').trim();
  if (!text || !currentRoomId) return;
  const userId = String(localStorage.getItem('dnd_user_id') || myId || 'guest');
  const userName = String(localStorage.getItem('dnd_user_name') || myNameSpan?.textContent || 'Путник');
  let message = {
    id: `room-chat-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    chatType: 'global',
    fromId: userId,
    fromName: userName,
    text,
    ts: Date.now(),
    quote: roomChatState.quoteDraft ? { ...roomChatState.quoteDraft } : null
  };
  const activeKey = String(roomChatState.activeChatKey || 'global');
  if (activeKey !== 'global') {
    const otherId = activeKey.replace(/^dm:/, '');
    message = {
      ...message,
      chatType: 'direct',
      toId: otherId,
      toName: getRoomChatUserName(otherId, 'Собеседник')
    };
  }
  pushRoomChatMessage(message);
  try { if (roomChatInput) roomChatInput.value = ''; } catch {}
  clearRoomChatQuoteDraft();
  await persistRoomChatMessage(message);
}
function openRoomChat() {
  if (!currentRoomId) return;
  showModalEl(roomChatModal);
  markRoomChatRead(roomChatState.activeChatKey || 'global');
  renderRoomChatTabs();
  renderRoomChatSubtitle();
  renderRoomChatUsersList();
  renderRoomChat();
  setTimeout(() => roomChatInput?.focus(), 0);
}
async function returnToTavernFromRoom() {
  const roomId = String(currentRoomId || '').trim();
  if (!roomId) {
    openTavern();
    await ensureTavernChannel();
    try { sendMessage({ type: 'listRooms' }); } catch {}
    return;
  }
  try {
    if (sbClient && myId) {
      await sbClient.from('room_members').delete().eq('room_id', roomId).eq('user_id', myId);
    }
  } catch (e) {
    console.warn('leave room member cleanup failed', e);
  }
  try { stopHeartbeat(); } catch {}
  try { stopMembersPolling(); } catch {}
  try { await window.__leaveCurrentRoomCleanup?.(); } catch (e) { console.warn('room cleanup failed', e); }
  currentRoomId = null;
  resetRoomChatState('');
  try { roomChatModal?.classList.add('hidden'); } catch {}
  try { gameUI.style.display = 'none'; } catch {}
  openTavern();
  try { await ensureTavernChannel(); } catch {}
  try { sendMessage({ type: 'listRooms' }); } catch {}
}
window.RoomChat = {
  isChatLogText: isRoomChatLogText,
  decodeLogText: decodeRoomChatLogRow,
  hydrateFromRows: hydrateRoomChatFromRows,
  pushMessage: pushRoomChatMessage,
  reset: resetRoomChatState,
  refreshUsers: () => { renderRoomChatUsersList(); renderRoomChatSubtitle(); renderRoomChatTabs(); }
};
window.openRoomChat = openRoomChat;
window.returnToTavernFromRoom = returnToTavernFromRoom;

window.openTavern = openTavern;
window.closeTavern = closeTavern;
window.openTavernRooms = openTavernRooms;
window.stopTavernChannel = stopTavernChannel;
window.ensureTavernChannel = ensureTavernChannel;
window.isTavernVisible = isTavernVisible;
const board = document.getElementById('game-board');
const boardWrapper = document.getElementById('board-wrapper');
const playerList = document.getElementById('player-list');
const playerTabMineBtn = document.getElementById('player-tab-mine');
const playerTabOthersBtn = document.getElementById('player-tab-others');
const logList = document.getElementById('log-list');
const currentPlayerSpan = document.getElementById('current-player');
const nextTurnBtn = document.getElementById('next-turn');

const addPlayerBtn = document.getElementById('add-player');
const rollBtn = document.getElementById('roll');
const endTurnBtn = document.getElementById('end-turn');
const rollInitiativeBtn = document.getElementById('roll-initiative');
const createBoardBtn = document.getElementById('create-board');
const boardWidthInput = document.getElementById('board-width');
const boardHeightInput = document.getElementById('board-height');
const resetGameBtn = document.getElementById('reset-game');
const clearBoardBtn = document.getElementById('clear-board');
const saveCampaignBtn = document.getElementById('save-campaign');
const loadCampaignBtn = document.getElementById('load-campaign');
const openMonstersBtn = document.getElementById('open-monsters');

const playerNameInput = document.getElementById('player-name');
const playerColorInput = document.getElementById('player-color');
const playerSizeInput = document.getElementById('player-size');

const isBaseCheckbox = document.getElementById('is-base');
const isAllyCheckbox = document.getElementById('is-ally');

const dice = document.getElementById('dice');
const diceCountInput = document.getElementById('dice-count');
const diceRolls = document.getElementById('dice-rolls');

const editEnvBtn = document.getElementById('edit-environment');
const addWallBtn = document.getElementById('add-wall');
const removeWallBtn = document.getElementById('remove-wall');

const startInitiativeBtn = document.getElementById("start-initiative");
const startCombatBtn = document.getElementById("start-combat");
const startExplorationBtn = document.getElementById("start-exploration");

const worldPhasesBox = document.getElementById('world-phases');
const envEditorBox = document.getElementById('env-editor');

// ===== Подложка карты (ГМ) =====
const boardBgEl = document.getElementById('board-bg');
const boardBgFileInput = document.getElementById('board-bg-file');
const boardBgClearBtn = document.getElementById('board-bg-clear');

// ===== Подложка по ссылке + прозрачности (GM) =====
const boardBgUrlInput = document.getElementById('board-bg-url');
const boardBgUrlApplyBtn = document.getElementById('board-bg-url-apply');

// Очередность хода (над полем слева)
const turnOrderBox = document.getElementById('turn-order-box');
const turnOrderList = document.getElementById('turn-order-list');
const turnOrderRound = document.getElementById('turn-order-round');

const gridOpacityInput = document.getElementById('grid-opacity');
const gridOpacityVal = document.getElementById('grid-opacity-val');

const wallOpacityInput = document.getElementById('wall-opacity');
const wallOpacityVal = document.getElementById('wall-opacity-val');


// ===== Карты кампании (ГМ) =====
const campaignMapsSelect = document.getElementById('campaign-maps-select');
const createCampaignMapBtn = document.getElementById('create-campaign-map');

// ===== Tabs for "Пользователи и персонажи" =====
// dom-and-setup.js загружается ДО message-ui.js, поэтому здесь делаем безопасную прокладку.
function setPlayerListViewSafe(view) {
  const v = (view === 'others') ? 'others' : 'mine';
  window.PLAYER_LIST_VIEW = v;

  // Если message-ui уже подгружен — используем его хелпер (обновит список и классы)
  if (typeof window.setPlayerListView === 'function') {
    window.setPlayerListView(v);
    return;
  }

  // Иначе — просто подсветим вкладки (список обновится позже при первом updatePlayerList)
  try {
    if (playerTabMineBtn) {
      playerTabMineBtn.classList.toggle('active', v === 'mine');
      playerTabMineBtn.setAttribute('aria-selected', v === 'mine' ? 'true' : 'false');
    }
    if (playerTabOthersBtn) {
      playerTabOthersBtn.classList.toggle('active', v === 'others');
      playerTabOthersBtn.setAttribute('aria-selected', v === 'others' ? 'true' : 'false');
    }
  } catch {}
}

// default view
if (!window.PLAYER_LIST_VIEW) window.PLAYER_LIST_VIEW = 'mine';
setPlayerListViewSafe(window.PLAYER_LIST_VIEW);

if (playerTabMineBtn) {
  playerTabMineBtn.addEventListener('click', () => setPlayerListViewSafe('mine'));
}
if (playerTabOthersBtn) {
  playerTabOthersBtn.addEventListener('click', () => setPlayerListViewSafe('others'));
}

// ================== VARIABLES ==================
// Supabase replaces our old Node/WebSocket server.
// GitHub Pages hosts only static files; realtime + DB are handled by Supabase.
let sbClient;
window.getSbClient = () => sbClient;
let roomChannel;    // broadcast/presence channel (optional)
let roomDbChannel;  // postgres_changes channel
let myId;
let myRole;

// Broadcast dice event without touching room_state.
// IMPORTANT: do NOT call sendMessage({type:'diceEvent'}) from inside state mutations,
// because diceEvent case writes logs using lastState and can overwrite newer state.
async function broadcastDiceEventOnly(event) {
  // v4: dice events are stored in room_dice_events (+ log in room_log) and delivered via realtime.
  // We keep this helper name for backwards compatibility, but it now writes to DB.
  try {
    if (!event) return;
    if (typeof myId !== 'undefined' && !event.fromId) event.fromId = String(myId);
    if (myNameSpan?.textContent && !event.fromName) event.fromName = String(myNameSpan.textContent);

    if (currentRoomId && typeof window.insertDiceEvent === 'function') {
      await window.insertDiceEvent(currentRoomId, event);
    }
  } catch {}

  // update self UI instantly (main roll panel)
  try {
    if (event) handleMessage({ type: 'diceEvent', event });
  } catch {}
}

// ===== Role helpers (MVP) =====
function normalizeRoleForDb(role) {
  const r = String(role || '');
  if (r === 'DnD-Player') return 'Player'; // DB constraint
  return r;
}
function normalizeRoleForUi(role) {
  const r = String(role || '');
  if (r === 'Player') return 'DnD-Player';
  return r;
}

function safeGetUserName() {
  const raw = localStorage.getItem("dnd_user_name");
  const fromLs = (typeof raw === "string") ? raw.trim() : "";
  if (fromLs) return fromLs;

  // fallback: input on login screen (например, в новой вкладке до полной инициализации)
  const inp = document.getElementById("username");
  const fromInput = (inp && typeof inp.value === "string") ? inp.value.trim() : "";
  if (fromInput) return fromInput;

  const fromSpan = String(myNameSpan?.textContent || "").replace(/^\s*Вы:\s*/i, "").trim();
  return fromSpan || "Player";
}

function safeGetUserRoleDb() {
  const raw = String(localStorage.getItem("dnd_user_role") || myRole || "");
  return normalizeRoleForDb(raw);
}

function getCampaignOwnerKey() {
  // Устойчивый ключ владельца кампаний на этом устройстве/браузере.
  // Без Supabase Auth это самый простой способ "привязать" сохранения к ГМу
  // и позволить загружать их в любой комнате.
  const LS_KEY = "dnd_campaign_owner_key";
  let key = String(localStorage.getItem(LS_KEY) || "").trim();
  if (key) return key;

  // crypto.randomUUID есть почти везде, но сделаем fallback
  key = (window.crypto && typeof window.crypto.randomUUID === "function")
    ? window.crypto.randomUUID()
    : ("owner_" + Math.random().toString(16).slice(2) + "_" + Date.now());

  localStorage.setItem(LS_KEY, key);
  return key;
}


function isGM() { return String(myRole || '') === 'GM'; }
function isSpectator() { return String(myRole || '') === 'Spectator'; }

function applyRoleToUI() {
  const gm = isGM();
  const spectator = isSpectator();

  // ГМ-панель справа (Фазы мира + Редактирование окружения)
  const rightPanel = document.getElementById('right-panel');
  if (rightPanel) rightPanel.style.display = gm ? '' : 'none';

  // GM-настройки размера карты (реальный размер поля)
  const gmBoardSettings = document.getElementById('board-settings-gm');
  if (gmBoardSettings) gmBoardSettings.style.display = gm ? '' : 'none';

  // На случай если блоки вынесены из right-panel — тоже прячем/показываем отдельно
  if (typeof worldPhasesBox !== "undefined" && worldPhasesBox) {
    worldPhasesBox.style.display = gm ? '' : 'none';
  }
  if (typeof envEditorBox !== "undefined" && envEditorBox) {
    envEditorBox.style.display = gm ? '' : 'none';
  }

  // "Управление игроками" используется всеми, кроме зрителей
  const pm = document.getElementById('player-management');
  if (pm) pm.style.display = spectator ? 'none' : '';

  // Галочка "Союзник" видна только для ГМ
  try {
    if (typeof isAllyCheckbox !== 'undefined' && isAllyCheckbox) {
      const label = isAllyCheckbox.closest('label');
      if (label) label.style.display = gm ? '' : 'none';
      else isAllyCheckbox.style.display = gm ? '' : 'none';

      if (!gm) isAllyCheckbox.checked = false;
    }
  } catch {}


  // Disable GM-only buttons defensively
  const gmOnlyIds = [
    'clear-board','reset-game',
    'start-exploration','start-initiative','start-combat',
    'edit-environment','add-wall','remove-wall','create-campaign-map','campaign-maps-select',
    'open-monsters'
  ];
  gmOnlyIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = !gm;
  });

  // По запросу: кнопка "Монстры SRD" должна быть видима только для ГМ.
  const monstersBtn = document.getElementById('open-monsters');
  if (monstersBtn) monstersBtn.style.display = gm ? '' : 'none';
}

// ================== SRD MONSTERS LIBRARY (GM) ==================
let monstersLibInited = false;

function monsterSizeToTokenSize(mon) {
  const s = String(mon?.size_en || mon?.size_ru || '').toLowerCase();
  if (s.includes('tiny') || s.includes('крош')) return 1;
  if (s.includes('small') || s.includes('мал')) return 1;
  if (s.includes('medium') || s.includes('сред')) return 1;
  if (s.includes('large') || s.includes('бол')) return 2;
  if (s.includes('huge') || s.includes('огр')) return 3;
  if (s.includes('gargantuan') || s.includes('испол') || s.includes('гиган')) return 4;
  return 1;
}

async function ensureMonstersLibrary() {
  if (monstersLibInited) return;
  monstersLibInited = true;

  try {
    if (!window.MonstersLib) return;
    await window.MonstersLib.init({
      jsonUrl: './srd5_1_monsters_extracted.json',
      onAddToBoard: (mon) => {
        // GM only
        if (!isGM()) return;
        const name = String(mon?.name_ru || mon?.name_en || 'Монстр').trim() || 'Монстр';
        const size = monsterSizeToTokenSize(mon);
        const color = '#8b1a1a';

        // Minimal sheet payload (so the "Инфа" modal has something)
        const sheet = { parsed: { name: { value: name }, monster: mon } };

        sendMessage({
          type: 'addPlayer',
          player: {
            name,
            color,
            size,
            isBase: false,
            isMonster: true,
            monsterId: mon?.id || null,
            sheet
          }
        });

        // UX hint: token will appear in the list; GM can place it on the grid by selecting and clicking a cell.
      }
    });
  } catch (e) {
    console.warn('MonstersLib init failed:', e);
  }
}

// ================== MAP BACKGROUND (GM) ==================
const BOARD_BG_BUCKET = 'room-board-bg';
const BOARD_BG_PREFIX = 'board-bg';
const BOARD_BG_MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const BOARD_BG_ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'video/mp4',
  'video/webm'
]);
const BOARD_BG_ALLOWED_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.mp4', '.webm'];

function sanitizeStorageName(name) {
  return String(name || 'board-bg')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'board-bg';
}

function isAllowedBoardBgFile(file) {
  const type = String(file?.type || '').toLowerCase();
  const name = String(file?.name || '').toLowerCase();
  if (BOARD_BG_ALLOWED_TYPES.has(type)) return true;
  return BOARD_BG_ALLOWED_EXTS.some(ext => name.endsWith(ext));
}

async function uploadBoardBackgroundToStorage(file) {
  if (!sbClient || !sbClient.storage) {
    throw new Error('Supabase client не инициализирован.');
  }
  if (!currentRoomId) {
    throw new Error('Комната не выбрана.');
  }

  const id = (crypto?.randomUUID ? crypto.randomUUID() : ('bg-' + Math.random().toString(16).slice(2)));
  const safeName = sanitizeStorageName(file?.name || 'board-bg');
  const path = `${BOARD_BG_PREFIX}/${currentRoomId}/${id}_${safeName}`;

  const up = await sbClient.storage.from(BOARD_BG_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file?.type || undefined
  });
  if (up?.error) {
    const rawMsg = String(up.error.message || up.error || '');
    if (/row-level security|violates row-level security policy/i.test(rawMsg)) {
      throw new Error('Нет прав на загрузку в Storage для bucket ' + BOARD_BG_BUCKET + '.');
    }
    throw new Error(rawMsg || String(up.error));
  }

  const pub = sbClient.storage.from(BOARD_BG_BUCKET).getPublicUrl(path);
  const publicUrl = pub?.data?.publicUrl || null;
  if (!publicUrl) {
    throw new Error('Не удалось получить public URL для подложки.');
  }

  return {
    url: publicUrl,
    path,
    bucket: BOARD_BG_BUCKET,
    mime: String(file?.type || ''),
    fileName: String(file?.name || safeName)
  };
}

async function removeBoardBackgroundFromStorage(bucket, path) {
  try {
    if (!sbClient || !sbClient.storage) return;
    const b = String(bucket || '').trim();
    const p = String(path || '').trim();
    if (!b || !p) return;
    const rm = await sbClient.storage.from(b).remove([p]);
    if (rm?.error) {
      console.warn('Board background remove failed:', rm.error);
    }
  } catch (err) {
    console.warn('Board background remove failed:', err);
  }
}

function getCurrentBoardBackgroundMeta() {
  const st = (typeof lastState !== 'undefined' && lastState) ? lastState : null;
  return {
    bucket: String(st?.boardBgStorageBucket || '').trim(),
    path: String(st?.boardBgStoragePath || '').trim(),
    url: String(st?.boardBgUrl || st?.boardBgDataUrl || '').trim()
  };
}

if (boardBgFileInput) {
  boardBgFileInput.addEventListener('change', async (e) => {
    try {
      if (!isGM()) return;
      const file = e?.target?.files?.[0];
      if (!file) return;

      if (!isAllowedBoardBgFile(file)) {
        alert('Неподдерживаемый формат. Разрешены PNG, JPG, WEBP, GIF, SVG, MP4 и WEBM.');
        e.target.value = '';
        return;
      }

      if (file.size > BOARD_BG_MAX_FILE_SIZE) {
        alert('Файл слишком большой. Максимальный размер — 100 МБ.');
        e.target.value = '';
        return;
      }

      const prev = getCurrentBoardBackgroundMeta();
      const uploaded = await uploadBoardBackgroundToStorage(file);
      await sendMessage({
        type: 'setBoardBg',
        bgUrl: uploaded.url,
        bgStoragePath: uploaded.path,
        bgStorageBucket: uploaded.bucket,
        bgMime: uploaded.mime,
        bgFileName: uploaded.fileName,
        dataUrl: uploaded.url
      });

      if (prev.path && prev.path !== uploaded.path && prev.bucket) {
        await removeBoardBackgroundFromStorage(prev.bucket, prev.path);
      }

      e.target.value = '';
    } catch (err) {
      console.error(err);
      alert('Не удалось загрузить подложку: ' + (err?.message || err));
      try { e.target.value = ''; } catch {}
    }
  });
}

if (boardBgClearBtn) {
  boardBgClearBtn.addEventListener('click', async () => {
    if (!isGM()) return;
    const prev = getCurrentBoardBackgroundMeta();
    await sendMessage({ type: 'clearBoardBg' });
    if (prev.path && prev.bucket) {
      await removeBoardBackgroundFromStorage(prev.bucket, prev.path);
    }
  });
}

// Подложка по ссылке (https://...jpg/png/gif/webp/mp4/webm)
if (boardBgUrlApplyBtn) {
  boardBgUrlApplyBtn.addEventListener('click', async () => {
    if (!isGM()) return;
    const url = String(boardBgUrlInput?.value || "").trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      alert("Ссылка должна начинаться с http(s)://");
      return;
    }
    const prev = getCurrentBoardBackgroundMeta();
    await sendMessage({ type: 'setBoardBg', bgUrl: url, dataUrl: url, bgStoragePath: null, bgStorageBucket: null });
    if (prev.path && prev.bucket) {
      await removeBoardBackgroundFromStorage(prev.bucket, prev.path);
    }
  });
}

// Прозрачность клеток/стен (0% = как обычно, 100% = невидимо)
function pctToAlpha(pct) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  return 1 - (p / 100);
}

if (gridOpacityInput) {
  const onGrid = async () => {
    if (!isGM()) return;
    const pct = Number(gridOpacityInput.value) || 0;
    if (gridOpacityVal) gridOpacityVal.textContent = `${pct}%`;
    await sendMessage({ type: 'setGridAlpha', alpha: pctToAlpha(pct) });
  };
  gridOpacityInput.addEventListener('input', () => {
    const pct = Number(gridOpacityInput.value) || 0;
    if (gridOpacityVal) gridOpacityVal.textContent = `${pct}%`;
  });
  gridOpacityInput.addEventListener('change', onGrid);
}

if (wallOpacityInput) {
  const onWall = async () => {
    if (!isGM()) return;
    const pct = Number(wallOpacityInput.value) || 0;
    if (wallOpacityVal) wallOpacityVal.textContent = `${pct}%`;
    await sendMessage({ type: 'setWallAlpha', alpha: pctToAlpha(pct) });
  };
  wallOpacityInput.addEventListener('input', () => {
    const pct = Number(wallOpacityInput.value) || 0;
    if (wallOpacityVal) wallOpacityVal.textContent = `${pct}%`;
  });
  wallOpacityInput.addEventListener('change', onWall);
}

function applyBoardBackgroundToDom(state) {
  // гарантируем наличие слоя подложки (на случай старого HTML)
  let bg = boardBgEl || document.getElementById('board-bg');
  if (!bg && board) {
    bg = document.createElement('div');
    bg.id = 'board-bg';
    bg.setAttribute('aria-hidden', 'true');
    board.prepend(bg);
  }

  if (!bg || !board) return;

  const bgUrl = state?.boardBgUrl || state?.boardBgDataUrl || null;
  bg.style.backgroundImage = bgUrl ? `url(${bgUrl})` : 'none';

  // Важно: размеры берем из актуального состояния, а не из глобальных переменных
  const bw = Number(state?.boardWidth) || 10;
  const bh = Number(state?.boardHeight) || 10;
  bg.style.width = `${bw * 50}px`;
  bg.style.height = `${bh * 50}px`;
  board.classList.toggle('has-bg', !!bgUrl);
}

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function applyOpacityToDom(state) {
  if (!board) return;
  const gridA = (state && typeof state.gridAlpha !== "undefined") ? clamp01(state.gridAlpha) : null;
  const wallA = (state && typeof state.wallAlpha !== "undefined") ? clamp01(state.wallAlpha) : null;

  if (gridA === null) board.style.removeProperty('--grid-alpha');
  else board.style.setProperty('--grid-alpha', String(gridA));

  if (wallA === null) board.style.removeProperty('--wall-alpha');
  else board.style.setProperty('--wall-alpha', String(wallA));

  // sync UI (percent where 0% = fully visible, 100% = invisible)
  const toPct = (a) => Math.round((1 - clamp01(a)) * 100);
  if (gridOpacityInput) gridOpacityInput.value = String(gridA === null ? 0 : toPct(gridA));
  if (gridOpacityVal) gridOpacityVal.textContent = `${gridA === null ? 0 : toPct(gridA)}%`;

  if (wallOpacityInput) wallOpacityInput.value = String(wallA === null ? 0 : toPct(wallA));
  if (wallOpacityVal) wallOpacityVal.textContent = `${wallA === null ? 0 : toPct(wallA)}%`;
}


// ================== CAMPAIGN MAPS UI HOOKS (GM) ==================
// Основное управление картами/разделами теперь находится в controlbox.js (окно «Параметры»).
// Здесь — только безопасное обновление подписи активной карты и синхронизация с ControlBox.
function updateCampaignMapsUI(state) {
  try {
    const st = ensureStateHasMaps(state);
    const active = getActiveMap(st);
    const nameSpan = document.getElementById('campaign-active-map-name');
    if (nameSpan) nameSpan.textContent = active?.name || '—';

    // Старый селект оставлен скрытым для совместимости
    const sel = document.getElementById('campaign-maps-select');
    if (sel && sel.tagName === 'SELECT') {
      const maps = Array.isArray(st.maps) ? st.maps : [];
      sel.innerHTML = '';
      maps.forEach((m, idx) => {
        const opt = document.createElement('option');
        opt.value = String(m.id);
        opt.textContent = m.name || `Карта ${idx + 1}`;
        sel.appendChild(opt);
      });
      sel.value = String(st.currentMapId || (maps[0]?.id || ''));
    }

    // Если controlbox открыт — обновляем его список
    try { window.ControlBox?.updateCampaignParams?.(st); } catch {}
  } catch {}
}
let currentRoomId = null;

let heartbeatTimer = null;
let membersPollTimer = null;

function startHeartbeat() {
  stopHeartbeat();
  if (!sbClient || !currentRoomId || !myId) return;

  updateLastSeen();
  heartbeatTimer = setInterval(updateLastSeen, 60_000); // раз в минуту
}

function startMembersPolling() {
  stopMembersPolling();
  if (!sbClient || !currentRoomId) return;
  // страховка на случай, если realtime-уведомления временно не приходят
  membersPollTimer = setInterval(() => {
    if (!currentRoomId) return;
    refreshRoomMembers(currentRoomId);
  }, 30_000);
}

function stopMembersPolling() {
  if (membersPollTimer) {
    clearInterval(membersPollTimer);
    membersPollTimer = null;
  }
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

async function updateLastSeen() {
  try {
    await ensureSupabaseReady();
    const ts = new Date().toISOString();

    // Важно: не трогаем name/role на каждом тике — иначе 2 вкладки могут перезаписать имя.
    const { data, error } = await sbClient
      .from("room_members")
      .update({ last_seen: ts })
      .eq("room_id", currentRoomId)
      .eq("user_id", myId)
      .select("room_id");

    if (error) throw error;

    // Если записи нет (например, её подчистил cleanup) — восстановим.
    if (!data || (Array.isArray(data) && data.length === 0)) {
      const { error: upErr } = await sbClient
        .from("room_members")
        .upsert({
          room_id: currentRoomId,
          user_id: myId,
          name: safeGetUserName(),
          role: safeGetUserRoleDb(),
          last_seen: ts
        });
      if (upErr) throw upErr;
    }
  } catch {
    // не критично
  }
}

// Останавливаем heartbeat при закрытии вкладки (но это не "выход из комнаты" — просто прекращаем пинг)
window.addEventListener("beforeunload", () => {
  stopHeartbeat();
  stopMembersPolling();
});

let players = [];
let lastState = null;
let boardWidth = parseInt(boardWidthInput.value, 10) || 10;
let boardHeight = parseInt(boardHeightInput.value, 10) || 10;

let selectedPlayer = null;
let editEnvironment = false;
let wallMode = null;
let mouseDown = false;

const playerElements = new Map();
const hpBarElements = new Map(); // playerId -> hp bar element (absolute on board)
let finishInitiativeSent = false;

// users map (ownerId -> {name, role}) — только подключённые сейчас
const usersById = new Map();
// стабильный порядок пользователей (по времени подключения): запоминаем первый приход
// и больше не удаляем из порядка даже если polling один раз "мигнул".
// Это делает список "Пользователи и персонажи" полностью статичным.
let usersOrder = []; // array of userId (master order)
// чтобы порядок был стабильным, но при реальном выходе из комнаты пользователь исчезал из списка
// и при повторном входе становился "последним" в своей группе.
const userMissingTicks = new Map(); // userId -> missing polls count

// стартово прячем панель бросков до входа в комнату
if (diceViz) diceViz.style.display = 'none';
initLobbyVideoBackground();
watchLobbyVisibility();
try { lobbyAmbientAudio.sync(); } catch {}
pushTavernMessage({ system: true, text: 'Собирайтесь у стола, слушайте бармена или выбирайте путешествие на доске объявлений.' });
updateTavernHotspotBadges();

[tavernChatClose, tavernBartenderClose, tavernRoomsClose].forEach((btn, idx) => {
  if (!btn) return;
  const targets = [tavernChatModal, tavernBartenderModal, tavernRoomsModal];
  btn.addEventListener('click', () => hideModalEl(targets[idx]));
});
[tavernChatModal, tavernBartenderModal, tavernRoomsModal].forEach((modal) => {
  if (!modal) return;
  modal.addEventListener('click', (e) => {
    if (e.target === modal) hideModalEl(modal);
  });
});
if (tavernChatHotspot) tavernChatHotspot.addEventListener('click', openTavernChat);
if (tavernBartenderHotspot) tavernBartenderHotspot.addEventListener('click', openTavernBartender);
if (tavernBoardHotspot) tavernBoardHotspot.addEventListener('click', openTavernRooms);
if (tavernChatSend) tavernChatSend.addEventListener('click', () => { sendTavernChatMessage(); });
if (tavernChatUsersBtn) tavernChatUsersBtn.addEventListener('click', () => { toggleTavernUsersPopover(); });
if (tavernChatTabs) {
  tavernChatTabs.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('[data-chat-key]');
    if (!btn) return;
    const key = String(btn.getAttribute('data-chat-key') || 'global');
    if (e.target?.closest?.('.tavern-chat-tab__close')) {
      closeTavernChatTab(key);
      return;
    }
    setActiveTavernChat(key);
  });
}
if (tavernChatUsersList) {
  tavernChatUsersList.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('[data-direct-user]');
    if (!btn) return;
    const userId = String(btn.getAttribute('data-direct-user') || '');
    const userName = String(tavernChatState.knownUsers.get(userId)?.name || 'Собеседник');
    const key = ensureDirectChatWithUser(userId, userName);
    setActiveTavernChat(key);
  });
}
if (tavernChatList) {
  tavernChatList.addEventListener('click', (e) => {
    const directBtn = e.target?.closest?.('[data-chat-direct]');
    if (directBtn) {
      const userId = String(directBtn.getAttribute('data-chat-direct') || '');
      const userName = String(tavernChatState.knownUsers.get(userId)?.name || 'Собеседник');
      const key = ensureDirectChatWithUser(userId, userName);
      setActiveTavernChat(key);
      return;
    }
    const replyBtn = e.target?.closest?.('[data-chat-reply]');
    if (replyBtn) {
      const messageId = String(replyBtn.getAttribute('data-chat-reply') || '');
      const msg = getActiveTavernMessages().find((x) => String(x.id) === messageId);
      if (msg) {
        setTavernQuoteDraft(msg);
        try { tavernChatInput?.focus(); } catch {}
      }
    }
  });
}
if (tavernChatQuote) {
  tavernChatQuote.addEventListener('click', (e) => {
    if (e.target?.closest?.('[data-clear-tavern-quote]')) clearTavernQuoteDraft();
  });
}
if (tavernChatInput) {
  tavernChatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendTavernChatMessage();
    }
  });
}
document.addEventListener('click', (e) => {
  if (!tavernChatUsersPopover || tavernChatUsersPopover.classList.contains('hidden')) return;
  const target = e.target;
  if (tavernChatUsersPopover.contains(target) || tavernChatUsersBtn?.contains?.(target)) return;
  closeTavernUsersPopover();
});
document.querySelectorAll('[data-tavern-topic]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const topic = String(btn.getAttribute('data-tavern-topic') || '').trim();
    if (tavernBartenderNote) {
      tavernBartenderNote.textContent = topic
        ? `Раздел «${topic}» подготовлен. Его содержимое добавим следующим шагом.`
        : 'Этот раздел можно наполнить следующим шагом.';
    }
  });
});
if (tavernCreateRoomBtn) tavernCreateRoomBtn.addEventListener('click', () => {
  hideModalEl(tavernRoomsModal);
  if (typeof openCreateRoomModal === 'function') openCreateRoomModal();
});


if (roomChatOpenBtn) roomChatOpenBtn.addEventListener('click', openRoomChat);
if (roomReturnTavernBtn) roomReturnTavernBtn.addEventListener('click', () => { returnToTavernFromRoom(); });
if (roomChatClose) roomChatClose.addEventListener('click', () => hideModalEl(roomChatModal));
if (roomChatModal) {
  roomChatModal.addEventListener('click', (e) => {
    if (e.target === roomChatModal) hideModalEl(roomChatModal);
  });
}
if (roomChatSend) roomChatSend.addEventListener('click', () => { sendRoomChatMessage(); });
if (roomChatUsersBtn) roomChatUsersBtn.addEventListener('click', () => { toggleRoomChatUsersPopover(); });
if (roomChatTabs) {
  roomChatTabs.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('[data-room-chat-key]');
    if (!btn) return;
    const key = String(btn.getAttribute('data-room-chat-key') || 'global');
    if (e.target?.closest?.('.tavern-chat-tab__close')) {
      closeRoomChatTab(key);
      return;
    }
    setActiveRoomChat(key);
  });
}
if (roomChatUsersList) {
  roomChatUsersList.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('[data-room-direct-user]');
    if (!btn) return;
    const userId = String(btn.getAttribute('data-room-direct-user') || '');
    const key = ensureDirectRoomChatWithUser(userId, getRoomChatUserName(userId, 'Собеседник'));
    setActiveRoomChat(key);
  });
}
if (roomChatList) {
  roomChatList.addEventListener('click', (e) => {
    const directBtn = e.target?.closest?.('[data-room-chat-direct]');
    if (directBtn) {
      const userId = String(directBtn.getAttribute('data-room-chat-direct') || '');
      const key = ensureDirectRoomChatWithUser(userId, getRoomChatUserName(userId, 'Собеседник'));
      setActiveRoomChat(key);
      return;
    }
    const replyBtn = e.target?.closest?.('[data-room-chat-reply]');
    if (replyBtn) {
      const messageId = String(replyBtn.getAttribute('data-room-chat-reply') || '');
      const msg = getActiveRoomChatMessages().find((x) => String(x.id) === messageId);
      if (msg) {
        setRoomChatQuoteDraft(msg);
        try { roomChatInput?.focus(); } catch {}
      }
    }
  });
}
if (roomChatQuote) {
  roomChatQuote.addEventListener('click', (e) => {
    if (e.target?.closest?.('[data-clear-room-quote]')) clearRoomChatQuoteDraft();
  });
}
if (roomChatInput) {
  roomChatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendRoomChatMessage();
    }
  });
}
document.addEventListener('click', (e) => {
  if (!roomChatUsersPopover || roomChatUsersPopover.classList.contains('hidden')) return;
  const target = e.target;
  if (roomChatUsersPopover.contains(target) || roomChatUsersBtn?.contains?.(target)) return;
  closeRoomChatUsersPopover();
});

// ================== JOIN GAME ==================
joinBtn.addEventListener('click', () => {
  const name = usernameInput.value.trim();
  const role = '';

  if (!name) {
    loginError.textContent = "Введите имя";
    return;
  }

  // ===== Supabase init (GitHub Pages) =====
  if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    loginError.textContent = "Supabase не настроен. Проверьте SUPABASE_URL и SUPABASE_ANON_KEY в index.html";
    return;
  }

sbClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

window.SUPABASE_FETCH_FN = "fetch";
  
  // stable identity (doesn't depend on nickname)
  const savedUserId = localStorage.getItem("dnd_user_id") || "";
  const userId = savedUserId || ("xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  }));

  localStorage.setItem("dnd_user_id", String(userId));
  localStorage.setItem("dnd_user_name", String(name));
  // Роль выбирается при входе в комнату
  localStorage.setItem("dnd_user_role", "");

  // In Supabase-MVP our "myId" is stable localStorage userId
  handleMessage({ type: "registered", id: userId, name, role: '' });

  // list rooms from DB
  sendMessage({ type: 'listRooms' });
});



// ===== MARKS (ОБОЗНАЧЕНИЯ) COLLAPSE/EXPAND =====
(function initMarksLegendToggle(){
  const LS_KEY = 'dnd_marks_legend_collapsed';

  function applyCollapsed(root){
    const toolbar = (root && root.closest) ? root.closest('.marks-toolbar') : document.querySelector('.marks-toolbar');
    if (!toolbar) return;
    const collapsed = localStorage.getItem(LS_KEY) === '1';
    toolbar.classList.toggle('marks-toolbar--collapsed', collapsed);
  }

  // apply on DOM ready (and also shortly after to handle late-rendered UI)
  function applySoon(){
    applyCollapsed(document.querySelector('.marks-toolbar'));
  }

  document.addEventListener('DOMContentLoaded', () => {
    applySoon();
    setTimeout(applySoon, 50);
    setTimeout(applySoon, 250);
  });

  // event delegation: UI can be rerendered
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t) return;

    // Click on title or header area
    const title = t.closest && (t.closest('.marks-toolbar__title') || t.closest('.marks-toolbar__head'));
    if (!title) return;

    const toolbar = title.closest('.marks-toolbar');
    if (!toolbar) return;

    const isCollapsed = toolbar.classList.toggle('marks-toolbar--collapsed');
    localStorage.setItem(LS_KEY, isCollapsed ? '1' : '0');
  });
})();
