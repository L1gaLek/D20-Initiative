// ================== GLOBAL LINK GUARD (Character Sheet) ==================
// IMPORTANT:
// В проекте есть глобальные делегированные обработчики кликов (роутер/перерисовка UI).
// Из-за этого клик по внешней ссылке внутри "Листа персонажа" может интерпретироваться
// как внутренний переход и приводить к сбросу состояния листа.
//
// Решение: перехватываем клик *самым ранним* скриптом (этот файл загружается одним из первых)
// в capture-фазе и принудительно открываем внешние ссылки в НОВОЙ вкладке браузера.
(function installSheetExternalLinkGuard() {
  if (window.__sheetExternalLinkGuardInstalled) return;
  window.__sheetExternalLinkGuardInstalled = true;

  const normalizeHref = (href) => {
    const h = String(href || '').trim();
    if (!h) return '';
    if (/^(https?:\/\/|mailto:|tel:)/i.test(h)) return h;
    if (/^www\./i.test(h)) return 'https://' + h;
    if (/^[a-z0-9.-]+\.[a-z]{2,}([\/?#].*)?$/i.test(h)) return 'https://' + h;
    return h;
  };

  const isExternalHref = (href) => {
    const h = String(href || '').trim();
    if (!h) return false;
    return /^(https?:\/\/|mailto:|tel:)/i.test(h) || /^www\./i.test(h) || /^[a-z0-9.-]+\.[a-z]{2,}([\/?#].*)?$/i.test(h);
  };

  const handle = (e) => {
    try {
      const tgt = e.target;
      if (!tgt || !(tgt instanceof Element)) return;

      const sheetModal = document.getElementById('sheet-modal');
      if (!sheetModal || !sheetModal.contains(tgt)) return;

      // Поддержка:
      // 1) обычные <a href="...">
      // 2) наши RTE-ссылки: <span class="rte-link" data-href="...">...
      const linkEl = tgt.closest('a[href], .rte-link[data-href]');
      if (!linkEl) return;

      const rawHref = linkEl.matches('a[href]') ? linkEl.getAttribute('href') : linkEl.getAttribute('data-href');
      const href = normalizeHref(rawHref);
      if (!href || !isExternalHref(href)) return;

      // ВАЖНО: останавливаем *любые* другие делегированные обработчики, которые
      // могут сбрасывать страницу/лист персонажа.
      e.preventDefault();
      e.stopPropagation();
      try { e.stopImmediatePropagation?.(); } catch {}

      // Открываем в новой вкладке браузера.
      try { window.open(href, '_blank', 'noopener,noreferrer'); } catch {}
    } catch {}
  };

  // Перехватываем click в capture-фазе (самый надёжный вариант).
  // Добавляем также auxclick (средняя кнопка), чтобы не было "внутреннего" перехода.
  document.addEventListener('click', handle, true);
  document.addEventListener('auxclick', handle, true);
})();

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

const createRoomBtn = document.getElementById('createRoomBtn');
const createRoomModal = document.getElementById('createRoomModal');
const createRoomClose = document.getElementById('createRoomClose');
const createRoomCancel = document.getElementById('createRoomCancel');
const createRoomSubmit = document.getElementById('createRoomSubmit');

const roomNameInput = document.getElementById('roomNameInput');
const roomPasswordInput = document.getElementById('roomPasswordInput');
const roomScenarioInput = document.getElementById('roomScenarioInput');

const gameUI = document.getElementById('main-container');
const myNameSpan = document.getElementById('myName');
const myRoleSpan = document.getElementById('myRole');
const myRoomSpan = document.getElementById('myRoom');
const myScenarioSpan = document.getElementById('myScenario');
const diceViz = document.getElementById('dice-viz');

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
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = () => reject(fr.error || new Error("FileReader error"));
    fr.readAsDataURL(file);
  });
}

if (boardBgFileInput) {
  boardBgFileInput.addEventListener('change', async (e) => {
    try {
      if (!isGM()) return;
      const file = e?.target?.files?.[0];
      if (!file) return;

      // мягкий лимит, чтобы не раздувать room_state
      if (file.size > 8 * 1024 * 1024) {
        alert('Файл слишком большой. Рекомендуется до 8 МБ.');
        e.target.value = '';
        return;
      }

      const dataUrl = await readFileAsDataUrl(file);
      await sendMessage({ type: 'setBoardBg', dataUrl });
      e.target.value = '';
    } catch (err) {
      console.error(err);
      alert('Не удалось загрузить подложку');
    }
  });
}

if (boardBgClearBtn) {
  boardBgClearBtn.addEventListener('click', async () => {
    if (!isGM()) return;
    await sendMessage({ type: 'clearBoardBg' });
  });
}

// Подложка по ссылке (https://...jpg/png/gif/webp)
if (boardBgUrlApplyBtn) {
  boardBgUrlApplyBtn.addEventListener('click', async () => {
    if (!isGM()) return;
    const url = String(boardBgUrlInput?.value || "").trim();
    if (!url) return;
    // простая проверка; фон станет виден на всех клиентах, если URL доступен браузеру
    if (!/^https?:\/\//i.test(url) && !/^data:/i.test(url)) {
      alert("Ссылка должна начинаться с http(s):// (или data:)");
      return;
    }
    await sendMessage({ type: 'setBoardBg', dataUrl: url });
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

  const dataUrl = state?.boardBgDataUrl || null;
  bg.style.backgroundImage = dataUrl ? `url(${dataUrl})` : 'none';

  // Важно: размеры берем из актуального состояния, а не из глобальных переменных
  const bw = Number(state?.boardWidth) || 10;
  const bh = Number(state?.boardHeight) || 10;
  bg.style.width = `${bw * 50}px`;
  bg.style.height = `${bh * 50}px`;
  board.classList.toggle('has-bg', !!dataUrl);
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
  }, 5000);
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

