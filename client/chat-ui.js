// client/chat-ui.js
// Вынесенная механика чатов таверны и комнаты.
// Опирается на уже инициализированные DOM-элементы и глобальные переменные из dom-and-setup.js.

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
  quoteDraft: null,
  messageIds: new Set(),
  wsConnected: false
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
  const itemId = String(item.id || '').trim();
  if (itemId) {
    if (!(tavernChatState.messageIds instanceof Set)) tavernChatState.messageIds = new Set();
    if (tavernChatState.messageIds.has(itemId)) return;
    tavernChatState.messageIds.add(itemId);
  }
  const list = ensureTavernChat(item.chatKey, item.label);
  if (list.some((x) => String(x.id) === item.id)) return;
  list.push(item);
  while (list.length > TAVERN_MAX_MESSAGES) {
    const removed = list.shift();
    const removedId = String(removed?.id || '').trim();
    if (removedId && tavernChatState.messageIds instanceof Set) tavernChatState.messageIds.add(removedId);
  }
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
    tavernChatState.messageIds = new Set();
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

async function syncRoomChatFromDb(forceHydrate = false) {
  if (!sbClient || !currentRoomId) return;
  try {
    const { data, error } = await sbClient
      .from('room_log')
      .select('id,text,created_at')
      .eq('room_id', currentRoomId)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    if (forceHydrate || !roomChatState.loadedHistory) {
      hydrateRoomChatFromRows(rows);
      return;
    }
    rows.forEach((row) => {
      const msg = decodeRoomChatLogRow(row?.text || row);
      if (msg) pushRoomChatMessage(msg, { revealTab: !roomChatState.hiddenChatKeys.has(String(msg?.chatKey || '')) });
    });
    renderRoomChatTabs();
    renderRoomChatSubtitle();
    renderRoomChatUsersList();
    renderRoomChat();
  } catch (e) {
    console.warn('syncRoomChatFromDb failed', e);
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
function pushRoomChatMessage(entry, options = null) {
  const item = normalizeRoomChatMessage(entry);
  if (!item) return;
  if (roomChatState.messageIds.has(String(item.id))) return;
  roomChatState.messageIds.add(String(item.id));

  const hidden = roomChatState.hiddenChatKeys.has(String(item.chatKey || 'global'));
  const shouldRevealHidden = options?.revealTab === true || (!hidden ? (options?.revealTab !== false) : (!item.mine && !roomChatState.loadedHistory));
  const list = ensureRoomChat(item.chatKey, item.label, { showTab: shouldRevealHidden || !hidden });
  if (list.some((x) => String(x.id) === item.id)) return;
  list.push(item);
  while (list.length > ROOM_CHAT_MAX_MESSAGES) list.shift();

  if (hidden && !shouldRevealHidden) {
    renderRoomChatTabs();
    return;
  }

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
  roomChatState.hiddenChatKeys.delete(key);
  ensureRoomChat(key, getRoomChatUserName(uid, fallbackName), { showTab: true });
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
  roomChatState.hiddenChatKeys.add(key);
  roomChatState.tabs = roomChatState.tabs.filter((tab) => String(tab.key) !== key);
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

