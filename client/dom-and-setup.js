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
      './lobby/ambient/' + fileName,
      (basePath ? basePath : '') + '/lobby/ambient/' + fileName
    ].filter((value, index, arr) => value && arr.indexOf(value) === index);
  } catch {
    return ['/lobby/ambient/' + fileName];
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
  const tavernTracks = ['taverna.mp3', 'teverna1.mp3', 'taverna2.mp3'];

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
    if (unlocked) return true;
    applyVolume();
    try {
      const hadSrc = !!(audio.getAttribute('src') || audio.src);
      const prevTime = Number(audio.currentTime) || 0;
      await playPromiseSafe();
      if (!hadSrc) {
        try { audio.pause(); } catch {}
        try { audio.currentTime = 0; } catch {}
      } else {
        try { audio.pause(); } catch {}
        try { audio.currentTime = prevTime; } catch {}
      }
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
      if (!unlocked) {
        await tryUnlock();
        sync();
      }
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
const tavernChatHistory = [];

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
  updateLobbyModeClass();
  try { lobbyAmbientAudio.sync(); } catch {}
}

function pushTavernMessage(entry) {
  if (!entry) return;
  const item = {
    id: String(entry.id || `tavern-${Date.now()}-${++tavernMessageSeq}`),
    name: String(entry.name || 'Путник'),
    text: String(entry.text || ''),
    ts: Number(entry.ts || Date.now()),
    system: !!entry.system
  };
  if (!item.text && !item.system) return;
  if (tavernChatHistory.some((x) => String(x.id) === item.id)) return;
  tavernChatHistory.push(item);
  while (tavernChatHistory.length > 120) tavernChatHistory.shift();
  renderTavernChat();
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

function renderTavernChat() {
  if (!tavernChatList) return;
  if (!tavernChatHistory.length) {
    tavernChatList.innerHTML = '<div class="tavern-chat-item tavern-chat-item--system"><div class="tavern-chat-item__text">Пока в таверне тихо. Начните разговор первыми.</div></div>';
    return;
  }
  tavernChatList.innerHTML = tavernChatHistory.map((msg) => `
    <div class="tavern-chat-item ${msg.system ? 'tavern-chat-item--system' : ''}">
      <div class="tavern-chat-item__meta">
        <span>${escapeHtmlLite(msg.system ? 'Таверна' : msg.name)}</span>
        <span>${escapeHtmlLite(fmtTavernTime(msg.ts))}</span>
      </div>
      <div class="tavern-chat-item__text">${escapeHtmlLite(msg.text)}</div>
    </div>
  `).join('');
  tavernChatList.scrollTop = tavernChatList.scrollHeight;
}

async function ensureTavernChannel() {
  if (!sbClient) return null;
  if (tavernChannel) return tavernChannel;
  const userId = String(localStorage.getItem('dnd_user_id') || myId || 'guest');
  const userName = String(localStorage.getItem('dnd_user_name') || myNameSpan?.textContent || 'Путник');
  tavernChannel = sbClient
    .channel('tavern:lobby', { config: { presence: { key: userId } } })
    .on('broadcast', { event: 'chat' }, ({ payload }) => {
      if (payload?.message) pushTavernMessage(payload.message);
    })
    .on('presence', { event: 'sync' }, () => {
      try {
        const state = tavernChannel?.presenceState?.() || {};
        tavernPresenceCount = Object.keys(state).length;
        if (tavernChatSubtitle) {
          tavernChatSubtitle.textContent = tavernPresenceCount > 0
            ? `Разговоры путников в таверне • Сейчас в таверне: ${tavernPresenceCount}`
            : 'Разговоры путников в таверне';
        }
      } catch {}
    });
  await tavernChannel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      try {
        await tavernChannel.track({ userId, userName, joinedAt: Date.now() });
      } catch {}
    }
  });
  return tavernChannel;
}

async function stopTavernChannel() {
  if (!tavernChannel) return;
  try { await tavernChannel.unsubscribe(); } catch {}
  tavernChannel = null;
  tavernPresenceCount = 0;
}

async function sendTavernChatMessage() {
  const text = String(tavernChatInput?.value || '').trim();
  if (!text) return;
  const userName = String(localStorage.getItem('dnd_user_name') || myNameSpan?.textContent || 'Путник');
  const message = {
    id: `tavern-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: userName,
    text,
    ts: Date.now()
  };
  pushTavernMessage(message);
  try { if (tavernChatInput) tavernChatInput.value = ''; } catch {}
  try {
    const ch = await ensureTavernChannel();
    await ch?.send({ type: 'broadcast', event: 'chat', payload: { message } });
  } catch {}
}

function openTavernChat() {
  showModalEl(tavernChatModal);
  ensureTavernChannel();
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
if (tavernChatInput) {
  tavernChatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendTavernChatMessage();
    }
  });
}
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
