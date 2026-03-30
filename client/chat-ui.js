// client/chat-ui.js
// Вынесенная механика чатов таверны и комнаты.
// Опирается на уже инициализированные DOM-элементы и глобальные переменные из dom-and-setup.js.

let tavernChannel = null;
let tavernPresenceCount = 0;
let tavernMessageSeq = 0;
const TAVERN_ROOM_LOG_ID = '__tavern_lobby__';
const TAVERN_LOG_PREFIX = 'TVRN1:';
const TAVERN_MAX_MESSAGES = 50;
const CHAT_TTL_MS = 24 * 60 * 60 * 1000;
const CHAT_CLEANUP_THROTTLE_MS = 5 * 60 * 1000;
let _lastTavernCleanupAt = 0;
let _lastRoomCleanupAt = 0;
const tavernChatState = {
  activeChatKey: 'global',
  chats: new Map([['global', []]]),
  tabs: [{ key: 'global', label: 'Общий стол', closable: false }],
  knownUsers: new Map(),
  loadedHistory: false,
  unreadGlobal: 0,
  unreadDirect: 0,
  unreadByChat: new Map(),
  quoteDraft: null,
  messageIds: new Set(),
  wsConnected: false,
  hiddenChatKeys: new Set(),
  usersView: 'tavern'
};

function getChatTtlCutoffMs(now = Date.now()) {
  return Number(now || Date.now()) - CHAT_TTL_MS;
}

function isChatEntryExpired(entry, now = Date.now()) {
  return Number(entry?.ts || 0) > 0 && Number(entry.ts) < getChatTtlCutoffMs(now);
}

function buildChatStorageKey(scope, roomId = '') {
  const userId = String(getAppStorageItem('int_user_id') || myId || 'guest').trim() || 'guest';
  return scope === 'room'
    ? `int_room_chat_ui:${userId}:${String(roomId || '').trim() || 'room'}`
    : `int_tavern_chat_ui:${userId}`;
}

function readChatUiPrefs(scope, roomId = '') {
  try {
    const raw = localStorage.getItem(buildChatStorageKey(scope, roomId));
    const data = raw ? JSON.parse(raw) : null;
    return (data && typeof data === 'object') ? data : {};
  } catch {
    return {};
  }
}

function writeChatUiPrefs(scope, roomId, payload) {
  try {
    localStorage.setItem(buildChatStorageKey(scope, roomId), JSON.stringify(payload || {}));
  } catch {}
}

function listVisibleDirectChatKeys(chatsMap) {
  return Array.from(chatsMap instanceof Map ? chatsMap.keys() : [])
    .map((key) => String(key || ''))
    .filter((key) => key && key !== 'global');
}

function normalizeStoredChatKeys(keys) {
  return (Array.isArray(keys) ? keys : []).map((key) => String(key || '')).filter(Boolean);
}

function saveScopedChatUiState(scope, roomId, state, extra = {}) {
  writeChatUiPrefs(scope, roomId, {
    activeChatKey: String(state?.activeChatKey || 'global'),
    visibleChatKeys: listVisibleDirectChatKeys(new Map((state?.tabs || []).map((tab) => [String(tab?.key || ''), true]))),
    hiddenChatKeys: Array.from(state?.hiddenChatKeys || []).map((key) => String(key || '')).filter(Boolean),
    ...extra
  });
}

function applyScopedChatUiPrefs(state, scope, roomId, options = {}) {
  const prefs = readChatUiPrefs(scope, roomId);
  const visible = new Set(normalizeStoredChatKeys(prefs.visibleChatKeys));
  state.hiddenChatKeys = new Set(normalizeStoredChatKeys(prefs.hiddenChatKeys));
  state.tabs = [{ key: 'global', label: String(options.globalLabel || 'Общий чат'), closable: false }];
  visible.forEach((key) => {
    if (!key || key === 'global') return;
    const otherId = String(key).replace(/^dm:/, '');
    const label = typeof options.resolveLabel === 'function'
      ? options.resolveLabel(otherId, 'Личное')
      : 'Личное';
    state.tabs.push({ key, label: String(label || 'Личное'), closable: true });
    state.hiddenChatKeys.delete(key);
  });
  const active = String(prefs.activeChatKey || 'global');
  state.activeChatKey = (active === 'global' || visible.has(active)) ? active : 'global';
  return prefs;
}

function applyUnreadBadge(el, count) {
  if (!el) return;
  if (count > 0) {
    el.classList.remove('hidden');
    el.textContent = count > 99 ? '99+' : String(count);
  } else {
    el.classList.add('hidden');
    el.textContent = '0';
  }
}

function updateUnreadBadges(state, globalEl, directEl) {
  applyUnreadBadge(globalEl, Math.max(0, Number(state?.unreadGlobal) || 0));
  applyUnreadBadge(directEl, Math.max(0, Number(state?.unreadDirect) || 0));
}

function clearQuoteDraftState(state, quoteEl) {
  state.quoteDraft = null;
  if (!quoteEl) return;
  quoteEl.classList.add('hidden');
  quoteEl.setAttribute('aria-hidden', 'true');
  quoteEl.innerHTML = '';
}

function setQuoteDraftState(state, quoteEl, message, clearAttr) {
  if (!message || message.system) return;
  state.quoteDraft = {
    fromId: String(message.fromId || ''),
    fromName: String(message.fromName || 'Путник'),
    text: String(message.text || '').trim().slice(0, 280)
  };
  if (!quoteEl) return;
  quoteEl.classList.remove('hidden');
  quoteEl.setAttribute('aria-hidden', 'false');
  quoteEl.innerHTML = `
    <div class="tavern-chat-quote__meta">Ответ для ${escapeHtmlLite(state.quoteDraft.fromName)}</div>
    <div class="tavern-chat-quote__text">${escapeHtmlLite(state.quoteDraft.text)}</div>
    <button type="button" class="tavern-chat-quote__clear" ${clearAttr} title="Убрать цитату">✕</button>
  `;
}

function markChatReadState(state, chatKey, getUnreadCount, updateBadges) {
  const key = String(chatKey || state?.activeChatKey || 'global');
  const prev = Number(typeof getUnreadCount === 'function' ? getUnreadCount(key) : 0) || 0;
  if (!prev) return;
  state.unreadByChat.set(key, 0);
  if (key === 'global') state.unreadGlobal = Math.max(0, (Number(state.unreadGlobal) || 0) - prev);
  else state.unreadDirect = Math.max(0, (Number(state.unreadDirect) || 0) - prev);
  if (typeof updateBadges === 'function') updateBadges();
}

function noteChatUnreadState(state, modalEl, item, getUnreadCount, updateBadges) {
  if (!state?.loadedHistory) return;
  if (!item || item.system || item.mine) return;
  const modalOpen = !!(modalEl && !modalEl.classList.contains('hidden'));
  const isActive = String(state.activeChatKey || 'global') === String(item.chatKey || 'global');
  if (modalOpen && isActive) return;
  const key = String(item.chatKey || 'global');
  const prev = Number(typeof getUnreadCount === 'function' ? getUnreadCount(key) : 0) || 0;
  state.unreadByChat.set(key, prev + 1);
  if (key === 'global') state.unreadGlobal = (Number(state.unreadGlobal) || 0) + 1;
  else state.unreadDirect = (Number(state.unreadDirect) || 0) + 1;
  if (typeof updateBadges === 'function') updateBadges();
}

function saveTavernChatUiState() {
  saveScopedChatUiState('tavern', '', tavernChatState, {
    usersView: String(tavernChatState.usersView || 'tavern') === 'recent' ? 'recent' : 'tavern'
  });
}

function applyTavernChatUiPrefs() {
  const prefs = applyScopedChatUiPrefs(tavernChatState, 'tavern', '', {
    globalLabel: 'Общий стол',
    resolveLabel: (otherId, fallback) => getDirectChatLabel(otherId, fallback)
  });
  tavernChatState.usersView = String(prefs.usersView || 'tavern') === 'recent' ? 'recent' : 'tavern';
}

function saveRoomChatUiState() {
  saveScopedChatUiState('room', roomChatState.roomId || currentRoomId || '', roomChatState);
}

function applyRoomChatUiPrefs(roomId = '') {
  applyScopedChatUiPrefs(roomChatState, 'room', roomId, {
    globalLabel: 'Общий чат',
    resolveLabel: (otherId, fallback) => getRoomChatUserName(otherId, fallback)
  });
}

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
  if (tavernMyName) tavernMyName.textContent = String(getAppStorageItem('int_user_name') || myNameSpan?.textContent || 'путник');
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
  return String(getAppStorageItem('int_user_id') || myId || 'guest');
}

function getTavernMyUserName() {
  return String(getAppStorageItem('int_user_name') || myNameSpan?.textContent || 'Путник');
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

function ensureTavernChat(key, label = 'Диалог', options = null) {
  const chatKey = String(key || '').trim() || 'global';
  const showTab = options?.showTab !== false;
  if (!tavernChatState.chats.has(chatKey)) tavernChatState.chats.set(chatKey, []);
  if (showTab && !tavernChatState.tabs.some((tab) => String(tab.key) === chatKey)) {
    tavernChatState.tabs.push({ key: chatKey, label: String(label || 'Диалог'), closable: chatKey !== 'global' });
  }
  if (showTab) tavernChatState.hiddenChatKeys.delete(chatKey);
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
  updateUnreadBadges(tavernChatState, tavernChatBadgeGlobal, tavernChatBadgeDirect);
}

function clearTavernQuoteDraft() {
  clearQuoteDraftState(tavernChatState, tavernChatQuote);
}

function setTavernQuoteDraft(message) {
  setQuoteDraftState(tavernChatState, tavernChatQuote, message, 'data-clear-tavern-quote');
}

function markTavernChatRead(chatKey) {
  markChatReadState(tavernChatState, chatKey, getUnreadCountForChat, updateTavernHotspotBadges);
}

function noteTavernUnread(item) {
  noteChatUnreadState(tavernChatState, tavernChatModal, item, getUnreadCountForChat, updateTavernHotspotBadges);
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

function pushTavernMessage(entry, options = null) {
  const item = normalizeTavernMessage(entry);
  if (!item || isChatEntryExpired(item)) return;
  const itemId = String(item.id || '').trim();
  if (itemId) {
    if (!(tavernChatState.messageIds instanceof Set)) tavernChatState.messageIds = new Set();
    if (tavernChatState.messageIds.has(itemId)) return;
    tavernChatState.messageIds.add(itemId);
  }
  const hidden = tavernChatState.hiddenChatKeys.has(String(item.chatKey || 'global'));
  const shouldRevealHidden = options?.revealTab === true || (!hidden && options?.revealTab !== false);
  const list = ensureTavernChat(item.chatKey, item.label, { showTab: shouldRevealHidden || !hidden });
  if (list.some((x) => String(x.id) === item.id)) return;
  list.push(item);
  while (list.length > TAVERN_MAX_MESSAGES) {
    list.shift();
  }
  if (hidden && !shouldRevealHidden) {
    renderTavernChatTabs();
    saveTavernChatUiState();
    return;
  }
  noteTavernUnread(item);
  renderTavernChatTabs();
  renderTavernChat();
  saveTavernChatUiState();
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

function renderUsersListItemsHtml(users, emptyText, dataAttr) {
  const list = Array.isArray(users) ? users : [];
  return list.length ? list.map((user) => `
    <div class="tavern-chat-user-item">
      <div class="tavern-chat-user-item__meta">
        <div class="tavern-chat-user-item__name">${escapeHtmlLite(user.name)}</div>
        <div class="tavern-chat-user-item__hint">${escapeHtmlLite(user.hint || '')}</div>
      </div>
      <button type="button" class="tavern-chat-user-item__btn" ${dataAttr}="${escapeHtmlLite(user.id)}">Написать</button>
    </div>
  `).join('') : `<div class="tavern-chat-item tavern-chat-item--system"><div class="tavern-chat-item__text">${escapeHtmlLite(emptyText)}</div></div>`;
}

function setActiveTavernUsersView(view) {
  tavernChatState.usersView = String(view || 'tavern') === 'recent' ? 'recent' : 'tavern';
  renderTavernUsersList();
  saveTavernChatUiState();
}

function renderTavernUsersList() {
  if (!tavernChatUsersList) return;
  const myIdLocal = getTavernMyUserId();
  const allUsers = Array.from(tavernChatState.knownUsers.values())
    .filter((u) => u && String(u.id) && String(u.id) !== myIdLocal)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
  const onlineUsers = allUsers
    .filter((user) => !!user.online)
    .map((user) => ({ ...user, hint: 'Сейчас в таверне' }));
  const recentUsers = allUsers
    .filter((user) => tavernChatState.chats.has(getDirectChatKey(user.id)))
    .map((user) => ({ ...user, hint: user.online ? 'Есть личный диалог • сейчас онлайн' : 'Есть личный диалог' }));

  if (!onlineUsers.length && !recentUsers.length) {
    tavernChatUsersList.innerHTML = '<div class="tavern-chat-item tavern-chat-item--system"><div class="tavern-chat-item__text">Пока никто не появился. Когда путники войдут в таверну или вы начнёте личную переписку, они появятся здесь.</div></div>';
    return;
  }

  const activeView = String(tavernChatState.usersView || 'tavern') === 'recent' ? 'recent' : 'tavern';
  const activeUsers = activeView === 'recent' ? recentUsers : onlineUsers;
  const emptyText = activeView === 'recent'
    ? 'Личных диалогов пока нет.'
    : 'Сейчас в таверне больше никого нет.';

  tavernChatUsersList.innerHTML = `
    <div class="tavern-chat-users-switch" role="tablist" aria-label="Разделы пользователей таверны">
      <button type="button" class="tavern-chat-users-switch__btn ${activeView === 'tavern' ? 'is-active' : ''}" data-tavern-users-view="tavern" aria-selected="${activeView === 'tavern' ? 'true' : 'false'}">Таверна</button>
      <button type="button" class="tavern-chat-users-switch__btn ${activeView === 'recent' ? 'is-active' : ''}" data-tavern-users-view="recent" aria-selected="${activeView === 'recent' ? 'true' : 'false'}">С кем общался</button>
    </div>
    <section class="tavern-chat-users-section">
      <div class="tavern-chat-users-section__title">${activeView === 'recent' ? 'С кем общался' : 'Таверна'}</div>
      <div class="tavern-chat-users-section__list">
        ${renderUsersListItemsHtml(activeUsers, emptyText, 'data-direct-user')}
      </div>
    </section>
  `;
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
  saveTavernChatUiState();
  try { tavernChatInput?.focus(); } catch {}
}

function ensureDirectChatWithUser(otherUserId, fallbackName = 'Личное') {
  const uid = String(otherUserId || '').trim();
  if (!uid) return 'global';
  rememberTavernUser(uid, fallbackName);
  const key = getDirectChatKey(uid);
  tavernChatState.hiddenChatKeys.delete(key);
  ensureTavernChat(key, getDirectChatLabel(uid, fallbackName), { showTab: true });
  const tab = tavernChatState.tabs.find((x) => String(x.key) === key);
  if (tab) tab.label = getDirectChatLabel(uid, fallbackName);
  renderTavernChatTabs();
  saveTavernChatUiState();
  return key;
}

function closeTavernChatTab(chatKey) {
  const key = String(chatKey || '');
  if (!key || key === 'global') return;
  markTavernChatRead(key);
  tavernChatState.hiddenChatKeys.add(key);
  tavernChatState.tabs = tavernChatState.tabs.filter((tab) => String(tab.key) !== key);
  if (String(tavernChatState.activeChatKey) === key) tavernChatState.activeChatKey = 'global';
  renderTavernChatTabs();
  renderTavernSubtitle();
  renderTavernChat();
  saveTavernChatUiState();
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

async function cleanupExpiredTavernMessagesDb(force = false) {
  if (!sbClient) return;
  const now = Date.now();
  if (!force && (now - _lastTavernCleanupAt) < CHAT_CLEANUP_THROTTLE_MS) return;
  _lastTavernCleanupAt = now;
  try {
    await sbClient.from('room_log')
      .delete()
      .eq('room_id', TAVERN_ROOM_LOG_ID)
      .like('text', `${TAVERN_LOG_PREFIX}%`)
      .lt('created_at', new Date(getChatTtlCutoffMs(now)).toISOString());
  } catch (e) {
    console.warn('cleanupExpiredTavernMessagesDb failed', e);
  }
}

async function loadTavernChatHistory() {
  if (!sbClient) return;
  try {
    void cleanupExpiredTavernMessagesDb(true);
    const { data, error } = await sbClient
      .from('room_log')
      .select('id,text,created_at')
      .eq('room_id', TAVERN_ROOM_LOG_ID)
      .like('text', `${TAVERN_LOG_PREFIX}%`)
      .gte('created_at', new Date(getChatTtlCutoffMs()).toISOString())
      .order('created_at', { ascending: true })
      .limit(300);
    if (error) throw error;

    tavernChatState.chats = new Map([['global', []]]);
    tavernChatState.unreadGlobal = 0;
    tavernChatState.unreadDirect = 0;
    tavernChatState.unreadByChat = new Map();
    tavernChatState.messageIds = new Set();
    tavernChatState.loadedHistory = false;
    applyTavernChatUiPrefs();
    const rows = Array.isArray(data) ? data : [];
    rows.forEach((row) => {
      const msg = decodeTavernLogRow(row?.text);
      if (!msg) return;
      const normalized = normalizeTavernMessage(msg);
      const reveal = normalized?.chatKey ? tavernChatState.tabs.some((tab) => String(tab.key) === String(normalized.chatKey)) : true;
      pushTavernMessage(msg, { revealTab: reveal });
    });
    tavernChatState.loadedHistory = true;
    if (!tavernChatState.chats.has(String(tavernChatState.activeChatKey || 'global'))) {
      tavernChatState.activeChatKey = 'global';
    }
    renderTavernChatTabs();
    renderTavernSubtitle();
    renderTavernChat();
    saveTavernChatUiState();
  } catch (e) {
    console.warn('loadTavernChatHistory failed', e);
  }
}

async function ensureTavernChannel() {
  if (!sbClient) return null;
  if (typeof connectRoomWs === 'function') {
    try { connectRoomWs(TAVERN_ROOM_LOG_ID); } catch (e) { console.warn('tavern ws connect failed', e); }
  }
  if (tavernChannel) return tavernChannel;
  const userId = getTavernMyUserId();
  const userName = getTavernMyUserName();
  rememberTavernUser(userId, userName, { online: true });
  tavernChannel = sbClient
    .channel('tavern:lobby', { config: { presence: { key: userId } } })
    .on('presence', { event: 'sync' }, () => {
      syncTavernPresenceUsers();
    });
  await tavernChannel.subscribe(async (status) => {
    tavernChatState.wsConnected = (status === 'SUBSCRIBED');
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
  tavernChatState.wsConnected = false;
  if (tavernChannel) {
    try { await tavernChannel.unsubscribe(); } catch {}
    tavernChannel = null;
  }
  try {
    if (typeof getWsRoomId === 'function' && typeof disconnectRoomWs === 'function' && String(getWsRoomId() || '') === TAVERN_ROOM_LOG_ID) {
      disconnectRoomWs();
    }
  } catch {}
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
    void cleanupExpiredTavernMessagesDb();
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

  const wsRow = {
    id: String(message.id || ''),
    text: encodeTavernLogRow(message),
    created_at: new Date(message.ts || Date.now()).toISOString()
  };

  try {
    if (typeof sendWsEnvelope === 'function') {
      sendWsEnvelope({ type: 'tavernLogRow', roomId: TAVERN_ROOM_LOG_ID, row: wsRow }, { optimisticApplied: true });
    }
  } catch (e) {
    console.warn('tavern chat ws relay failed', e);
  }

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
const ROOM_CHAT_CACHE_LIMIT = 500;

function getRoomChatStorageKey(roomId = '') {
  const userId = String(getAppStorageItem('int_user_id') || myId || 'guest').trim() || 'guest';
  return `int_room_chat_messages:${userId}:${String(roomId || '').trim() || 'room'}`;
}

function readRoomChatCache(roomId = '') {
  try {
    const raw = localStorage.getItem(getRoomChatStorageKey(roomId));
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRoomChatCache(roomId = '') {
  const rid = String(roomId || roomChatState.roomId || currentRoomId || '').trim();
  if (!rid) return;
  try {
    const all = [];
    roomChatState.chats.forEach((messages) => {
      (Array.isArray(messages) ? messages : []).forEach((msg) => {
        if (!msg || !msg.id) return;
        all.push({
          id: String(msg.id),
          chatType: String(msg.chatType || 'global') === 'direct' ? 'direct' : 'global',
          fromId: String(msg.fromId || ''),
          fromName: String(msg.fromName || ''),
          toId: String(msg.toId || ''),
          toName: String(msg.toName || ''),
          text: String(msg.text || ''),
          ts: Number(msg.ts || Date.now()),
          system: !!msg.system,
          quote: (msg.quote && typeof msg.quote === 'object') ? {
            fromId: String(msg.quote.fromId || ''),
            fromName: String(msg.quote.fromName || ''),
            text: String(msg.quote.text || '')
          } : null
        });
      });
    });
    const dedup = new Map();
    all
      .sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0))
      .forEach((msg) => dedup.set(String(msg.id), msg));
    const compact = Array.from(dedup.values()).slice(-ROOM_CHAT_CACHE_LIMIT);
    localStorage.setItem(getRoomChatStorageKey(rid), JSON.stringify(compact));
  } catch {}
}

const roomChatState = {
  activeChatKey: 'global',
  chats: new Map([['global', []]]),
  tabs: [{ key: 'global', label: 'Общий чат', closable: false }],
  loadedHistory: false,
  unreadGlobal: 0,
  unreadDirect: 0,
  unreadByChat: new Map(),
  quoteDraft: null,
  roomId: '',
  messageIds: new Set(),
  hiddenChatKeys: new Set()
};

function _roomChatBroadcastEventName(roomId) {
  return `room-chat:${String(roomId || '').trim()}`;
}

async function cleanupExpiredRoomChatMessagesDb(force = false) {
  // Room chat history is intentionally kept without TTL cleanup.
  void force;
}

async function syncRoomChatFromDb(forceHydrate = false) {
  if (!currentRoomId) return;
  const cachedMessages = readRoomChatCache(currentRoomId);

  if (!sbClient) {
    if (forceHydrate || !roomChatState.loadedHistory) hydrateRoomChatFromRows(cachedMessages);
    return;
  }

  try {
    void cleanupExpiredRoomChatMessagesDb(forceHydrate);
    const { data, error } = await sbClient
      .from('room_log')
      .select('id,text,created_at')
      .eq('room_id', currentRoomId)
      .like('text', `${ROOM_CHAT_LOG_PREFIX}%`)
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    const decodedRows = rows.map((row) => decodeRoomChatLogRow(row?.text || row)).filter(Boolean);
    const merged = new Map();
    decodedRows.forEach((msg) => { if (msg?.id) merged.set(String(msg.id), msg); });
    cachedMessages.forEach((msg) => { if (msg?.id) merged.set(String(msg.id), msg); });
    const mergedRows = Array.from(merged.values()).sort((a, b) => Number(a?.ts || 0) - Number(b?.ts || 0));

    if (forceHydrate || !roomChatState.loadedHistory) {
      hydrateRoomChatFromRows(mergedRows);
      return;
    }
    mergedRows.forEach((msg) => {
      pushRoomChatMessage(msg, { revealTab: !roomChatState.hiddenChatKeys.has(String(msg?.chatKey || '')) });
    });
    renderRoomChatTabs();
    renderRoomChatSubtitle();
    renderRoomChatUsersList();
    renderRoomChat();
    saveRoomChatCache(currentRoomId);
  } catch (e) {
    console.warn('syncRoomChatFromDb failed', e);
    if (forceHydrate || !roomChatState.loadedHistory) hydrateRoomChatFromRows(cachedMessages);
  }
}

async function stopRoomChatSync() {
  if (roomChatSyncTimer) {
    clearInterval(roomChatSyncTimer);
    roomChatSyncTimer = null;
  }
  roomChatChannel = null;
}

async function ensureRoomChatChannel() {
  if (!currentRoomId) return null;
  const roomId = String(currentRoomId || '').trim();
  if (!roomId) return null;
  if (String(roomChatState.roomId || '') !== roomId) resetRoomChatState(roomId);
  if (!roomChatState.loadedHistory) await syncRoomChatFromDb(true);
  roomChatChannel = { transport: 'vps-ws', roomId };
  return roomChatChannel;
}

function startRoomChatSync() {
  if (!currentRoomId) return;
  void ensureRoomChatChannel();
}
window.startRoomChatSync = startRoomChatSync;
window.stopRoomChatSync = stopRoomChatSync;

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
  roomChatState.messageIds = new Set();
  roomChatState.hiddenChatKeys = new Set();
  applyRoomChatUiPrefs(roomChatState.roomId);
  clearRoomChatQuoteDraft();
  updateRoomChatBadges();
}
function ensureRoomChat(key, label = 'Диалог', options = null) {
  const chatKey = String(key || '').trim() || 'global';
  const showTab = options?.showTab !== false;
  if (!roomChatState.chats.has(chatKey)) roomChatState.chats.set(chatKey, []);
  if (showTab && !roomChatState.tabs.some((tab) => String(tab.key) === chatKey)) {
    roomChatState.tabs.push({ key: chatKey, label: String(label || 'Диалог'), closable: chatKey !== 'global' });
  }
  if (showTab) roomChatState.hiddenChatKeys.delete(chatKey);
  return roomChatState.chats.get(chatKey);
}
function getRoomChatUserName(userId, fallback = 'Собеседник') {
  const uid = String(userId || '').trim();
  if (!uid) return fallback;
  return String(usersById.get(uid)?.name || fallback || 'Собеседник');
}
function getRoomDirectChatKey(otherUserId) { return `dm:${String(otherUserId || '').trim()}`; }
function getRoomUnreadCountForChat(chatKey) { return Number(roomChatState.unreadByChat.get(String(chatKey || 'global')) || 0) || 0; }
function updateRoomChatBlinkState() {
  if (!roomChatOpenBtn) return;
  const hasUnread = (Number(roomChatState.unreadGlobal) || 0) > 0 || (Number(roomChatState.unreadDirect) || 0) > 0;
  roomChatOpenBtn.classList.toggle('room-top-actions__btn--chat-unread', hasUnread);
}
function updateRoomChatBadges() {
  updateUnreadBadges(roomChatState, roomChatBadgeGlobal, roomChatBadgeDirect);
  updateRoomChatBlinkState();
}
function clearRoomChatQuoteDraft() {
  clearQuoteDraftState(roomChatState, roomChatQuote);
}
function setRoomChatQuoteDraft(message) {
  setQuoteDraftState(roomChatState, roomChatQuote, message, 'data-clear-room-quote');
}
function markRoomChatRead(chatKey) {
  markChatReadState(roomChatState, chatKey, getRoomUnreadCountForChat, updateRoomChatBadges);
}
function noteRoomChatUnread(item) {
  noteChatUnreadState(roomChatState, roomChatModal, item, getRoomUnreadCountForChat, updateRoomChatBadges);
}
function normalizeRoomChatMessage(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const myIdLocal = String(myId || getAppStorageItem('int_user_id') || 'guest');
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
function pushRoomChatMessage(entry, options = null) {
  const item = normalizeRoomChatMessage(entry);
  if (!item) return;
  if (roomChatState.messageIds.has(String(item.id))) return;
  roomChatState.messageIds.add(String(item.id));

  const hidden = roomChatState.hiddenChatKeys.has(String(item.chatKey || 'global'));
  const shouldRevealHidden = options?.revealTab === true || (!hidden && options?.revealTab !== false);
  const list = ensureRoomChat(item.chatKey, item.label, { showTab: shouldRevealHidden || !hidden });
  if (list.some((x) => String(x.id) === item.id)) return;
  list.push(item);
  while (list.length > ROOM_CHAT_MAX_MESSAGES) list.shift();

  if (hidden && !shouldRevealHidden) {
    renderRoomChatTabs();
    saveRoomChatUiState();
    saveRoomChatCache(currentRoomId);
    return;
  }

  noteRoomChatUnread(item);
  renderRoomChatTabs();
  renderRoomChat();
  saveRoomChatUiState();
  saveRoomChatCache(currentRoomId);
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
function getRoomUsersSnapshot() {
  const orderedIds = Array.isArray(usersOrder) ? usersOrder.map((uid) => String(uid || '').trim()).filter(Boolean) : [];
  const liveIds = Array.from(usersById?.keys?.() || []).map((uid) => String(uid || '').trim()).filter(Boolean);
  const ids = [];
  const seen = new Set();
  [...orderedIds, ...liveIds].forEach((uid) => {
    if (!uid || seen.has(uid)) return;
    seen.add(uid);
    ids.push(uid);
  });
  return ids
    .map((uid) => ({
      id: uid,
      name: String(usersById.get(uid)?.name || ''),
      role: String(usersById.get(uid)?.role || '')
    }))
    .filter((u) => u.id && u.name);
}
function renderRoomChatUsersList() {
  if (!roomChatUsersList) return;
  const myIdLocal = String(myId || getAppStorageItem('int_user_id') || 'guest');
  const allUsers = getRoomUsersSnapshot()
    .filter((u) => u.id !== myIdLocal)
    .sort((a,b) => String(a.name).localeCompare(String(b.name), 'ru'));
  const roomUsers = allUsers.map((user) => ({ ...user, hint: normalizeRoleForUi(user.role || 'Игрок') }));
  if (!roomUsers.length) {
    roomChatUsersList.innerHTML = '<div class="tavern-chat-item tavern-chat-item--system"><div class="tavern-chat-item__text">Сейчас в комнате больше никого нет.</div></div>';
    return;
  }
  roomChatUsersList.innerHTML = `
    <section class="tavern-chat-users-section">
      <div class="tavern-chat-users-section__title">В комнате</div>
      <div class="tavern-chat-users-section__list">
        ${renderUsersListItemsHtml(roomUsers, 'Сейчас в комнате больше никого нет.', 'data-room-direct-user')}
      </div>
    </section>
  `;
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
  roomChatState.hiddenChatKeys.delete(key);
  ensureRoomChat(key, getRoomChatUserName(uid, fallbackName), { showTab: true });
  const tab = roomChatState.tabs.find((x) => String(x.key) === key);
  if (tab) tab.label = getRoomChatUserName(uid, fallbackName);
  renderRoomChatTabs();
  saveRoomChatUiState();
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
  saveRoomChatUiState();
  try { roomChatInput?.focus(); } catch {}
}
function closeRoomChatTab(chatKey) {
  const key = String(chatKey || '');
  if (!key || key === 'global') return;
  markRoomChatRead(key);
  roomChatState.hiddenChatKeys.add(key);
  roomChatState.tabs = roomChatState.tabs.filter((tab) => String(tab.key) !== key);
  if (String(roomChatState.activeChatKey) === key) roomChatState.activeChatKey = 'global';
  renderRoomChatTabs();
  renderRoomChatSubtitle();
  renderRoomChat();
  saveRoomChatUiState();
  saveRoomChatCache(currentRoomId);
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
    const msg = (row && typeof row === 'object' && String(row?.chatType || ''))
      ? row
      : decodeRoomChatLogRow(row?.text || row);
    if (!msg) return;
    const normalized = normalizeRoomChatMessage(msg);
    const reveal = normalized?.chatKey ? roomChatState.tabs.some((tab) => String(tab.key) === String(normalized.chatKey)) : true;
    pushRoomChatMessage(msg, { revealTab: reveal });
  });
  roomChatState.loadedHistory = true;
  if (!roomChatState.chats.has(String(roomChatState.activeChatKey || 'global'))) roomChatState.activeChatKey = 'global';
  renderRoomChatTabs();
  renderRoomChatSubtitle();
  renderRoomChatUsersList();
  renderRoomChat();
  saveRoomChatUiState();
}
async function persistRoomChatMessage(message) {
  if (!message || !sbClient || !currentRoomId) return;
  try {
    await sbClient.from('room_log').insert({ room_id: currentRoomId, text: encodeRoomChatLogRow(message) });
    void cleanupExpiredRoomChatMessagesDb();
  } catch (e) {
    console.warn('persistRoomChatMessage failed', e);
  }
}
async function sendRoomChatMessage() {
  const text = String(roomChatInput?.value || '').trim();
  if (!text || !currentRoomId) return;
  const userId = String(getAppStorageItem('int_user_id') || myId || 'guest');
  const userName = String(getAppStorageItem('int_user_name') || myNameSpan?.textContent || 'Путник');
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

  pushRoomChatMessage(message, { revealTab: true });
  try { if (roomChatInput) roomChatInput.value = ''; } catch {}
  clearRoomChatQuoteDraft();

  const wsRow = {
    text: encodeRoomChatLogRow(message),
    created_at: new Date(message.ts || Date.now()).toISOString()
  };

  try {
    if (typeof sendWsEnvelope === 'function') {
      sendWsEnvelope({ type: 'logRow', roomId: currentRoomId, row: wsRow }, { optimisticApplied: true });
    }
  } catch (e) {
    console.warn('room chat ws relay failed', e);
  }

  await persistRoomChatMessage(message);
}
function openRoomChat() {
  if (!currentRoomId) return;
  ensureRoomChatChannel();
  if (!roomChatState.loadedHistory) syncRoomChatFromDb(true);
  showModalEl(roomChatModal);
  markRoomChatRead(roomChatState.activeChatKey || 'global');
  renderRoomChatTabs();
  renderRoomChatSubtitle();
  renderRoomChatUsersList();
  renderRoomChat();
  setTimeout(() => roomChatInput?.focus(), 0);
}
async function returnToTavernFromRoom(options = null) {
  const opts = (options && typeof options === 'object') ? options : {};
  const roomId = String(currentRoomId || '').trim();
  if (!roomId) {
    openTavern();
    await ensureTavernChannel();
    try { sendMessage({ type: 'listRooms' }); } catch {}
    return;
  }
  if (!opts.skipMemberCleanup) {
    try {
      if (sbClient && myId) {
        await sbClient.from('room_members').delete().eq('room_id', roomId).eq('user_id', myId);
      }
    } catch (e) {
      console.warn('leave room member cleanup failed', e);
    }
  }
  try { stopHeartbeat(); } catch {}
  try { stopMembersPolling(); } catch {}
  try { stopRoomChatSync(); } catch {}
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
  syncFromDb: syncRoomChatFromDb,
  receiveRealtime: (payload) => {
    const msg = decodeRoomChatLogRow(payload?.row?.text || payload?.text || payload);
    if (msg) pushRoomChatMessage(msg, { revealTab: true });
  },
  refreshUsers: () => { renderRoomChatUsersList(); renderRoomChatSubtitle(); renderRoomChatTabs(); }
};
window.TavernChat = {
  decodeLogText: decodeTavernLogRow,
  pushMessage: pushTavernMessage,
  reset: () => {
    tavernChatState.chats = new Map([['global', []]]);
    tavernChatState.tabs = [{ key: 'global', label: 'Общий стол', closable: false }];
    tavernChatState.unreadGlobal = 0;
    tavernChatState.unreadDirect = 0;
    tavernChatState.unreadByChat = new Map();
    tavernChatState.messageIds = new Set();
    tavernChatState.loadedHistory = false;
    tavernChatState.hiddenChatKeys = new Set();
    applyTavernChatUiPrefs();
    clearTavernQuoteDraft();
    renderTavernChatTabs();
    renderTavernSubtitle();
    renderTavernChat();
  },
  receiveRealtime: (payload) => {
    const msg = decodeTavernLogRow(payload?.row?.text || payload?.text || payload);
    if (msg) pushTavernMessage(msg);
  }
};
window.openRoomChat = openRoomChat;
window.returnToTavernFromRoom = returnToTavernFromRoom;

window.openTavern = openTavern;
window.closeTavern = closeTavern;
window.openTavernRooms = openTavernRooms;
window.stopTavernChannel = stopTavernChannel;
window.ensureTavernChannel = ensureTavernChannel;
window.isTavernVisible = isTavernVisible;

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
    e.stopPropagation();
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const viewBtn = target.closest('[data-tavern-users-view]');
    if (viewBtn) {
      const nextView = String(viewBtn.getAttribute('data-tavern-users-view') || 'tavern');
      setActiveTavernUsersView(nextView);
      return;
    }
    const btn = target.closest('[data-direct-user]');
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
    e.stopPropagation();
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
