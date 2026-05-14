// VPS API/session helpers.

const VPS_API_BASE = (() => {
  try {
    const configured = String(window.D20_CONFIG?.vpsApiBase || window.VPS_API_BASE || '').trim();
    if (configured) return configured.replace(/\/+$/g, '');
  } catch {}
  try {
    const wsUrl = String(typeof WS_URL !== 'undefined' ? WS_URL : '').trim();
    if (wsUrl) {
      return wsUrl
        .replace(/^wss:\/\//i, 'https://')
        .replace(/^ws:\/\//i, 'http://')
        .replace(/\/ws\/?$/i, '/api')
        .replace(/\/+$/g, '');
    }
  } catch {}
  return '';
})();

const VPS_AUTH_TOKEN_KEY = 'int_auth_token';
const VPS_AUTH_EXPIRES_KEY = 'int_auth_expires_at';
const VPS_LEGACY_USER_ID_KEY = 'int_legacy_user_id';
const VPS_API_TIMEOUT_MS = 10000;
const VPS_SESSION_TIMEOUT_MS = 9000;
const VPS_RETRY_DELAYS_MS = [350, 900];
let pendingVpsSessionPromise = null;
let pendingVpsSessionKey = '';

function getStoredValue(key) {
  try {
    if (typeof getAppStorageItem === 'function') return String(getAppStorageItem(key) || '').trim();
  } catch {}
  try { return String(localStorage.getItem(key) || '').trim(); } catch {}
  return '';
}

function setStoredValue(key, value) {
  try {
    if (typeof setAppStorageItem === 'function') {
      setAppStorageItem(key, String(value || ''));
      return;
    }
  } catch {}
  try { localStorage.setItem(key, String(value || '')); } catch {}
}

function removeStoredValue(key) {
  try { localStorage.removeItem(key); } catch {}
  try {
    if (typeof setAppStorageItem === 'function') setAppStorageItem(key, '');
  } catch {}
}

function getVpsAuthToken() {
  return getStoredValue(VPS_AUTH_TOKEN_KEY);
}

function decodeVpsAuthPayload(tokenRaw) {
  try {
    const payloadPart = String(tokenRaw || '').split('.')[0] || '';
    if (!payloadPart) return null;
    const raw = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = raw + '='.repeat((4 - (raw.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function getStoredVpsSessionExpiresAt(tokenRaw = '') {
  const stored = getStoredValue(VPS_AUTH_EXPIRES_KEY);
  const storedMs = stored ? Date.parse(stored) : 0;
  if (Number.isFinite(storedMs) && storedMs > 0) return { iso: stored, ms: storedMs };

  const payload = decodeVpsAuthPayload(tokenRaw || getVpsAuthToken());
  const expMs = Math.trunc(Number(payload?.exp || 0)) * 1000;
  if (Number.isFinite(expMs) && expMs > 0) {
    return { iso: new Date(expMs).toISOString(), ms: expMs };
  }

  return { iso: '', ms: 0 };
}

function getCachedVpsSession(minTtlMs = 5 * 60 * 1000) {
  const token = getVpsAuthToken();
  const userId = getStoredValue('int_user_id');
  if (!token || !userId) return null;

  const expires = getStoredVpsSessionExpiresAt(token);
  if (expires.ms && expires.ms <= Date.now() + Math.max(0, Number(minTtlMs) || 0)) return null;

  return {
    token,
    userId,
    expiresAt: expires.iso || getStoredValue(VPS_AUTH_EXPIRES_KEY)
  };
}

function getVpsAuthHeaders(headers = {}) {
  const next = { ...(headers || {}) };
  const token = getVpsAuthToken();
  if (token && !next.Authorization && !next.authorization) next.Authorization = `Bearer ${token}`;
  return next;
}

function rememberVpsSession(payload) {
  const data = payload && typeof payload === 'object' ? payload : {};
  const token = String(data.token || '').trim();
  const userId = String(data.userId || data.user_id || '').trim();
  const previousUserId = getStoredValue('int_user_id');
  if (token) setStoredValue(VPS_AUTH_TOKEN_KEY, token);
  if (data.expiresAt || data.expires_at) setStoredValue(VPS_AUTH_EXPIRES_KEY, data.expiresAt || data.expires_at);
  if (previousUserId && userId && previousUserId !== userId && !getStoredValue(VPS_LEGACY_USER_ID_KEY)) {
    setStoredValue(VPS_LEGACY_USER_ID_KEY, previousUserId);
  }
  if (userId) setStoredValue('int_user_id', userId);
  return { token, userId, expiresAt: String(data.expiresAt || data.expires_at || '') };
}

function delayVpsRetry(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function isTransientVpsError(error) {
  const status = Number(error?.status || 0);
  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  const name = String(error?.name || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return name === 'aborterror'
    || message.includes('failed to fetch')
    || message.includes('networkerror')
    || message.includes('network request failed')
    || message.includes('connection')
    || message.includes('timeout')
    || message.includes('timed out');
}

async function fetchVpsJson(url, options = {}, retryOptions = {}) {
  const retries = Math.max(0, Number(retryOptions.retries) || 0);
  const timeoutMs = Math.max(0, Number(retryOptions.timeoutMs) || 0);
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let controller = null;
    let timer = null;
    const fetchOptions = { ...(options || {}) };

    if (!fetchOptions.signal && timeoutMs > 0 && typeof AbortController !== 'undefined') {
      controller = new AbortController();
      fetchOptions.signal = controller.signal;
      timer = setTimeout(() => {
        try { controller.abort(); } catch {}
      }, timeoutMs);
    }

    try {
      const res = await fetch(url, fetchOptions);
      let payload = null;
      try { payload = await res.json(); } catch {}
      if (!res.ok || payload?.ok === false) {
        const error = new Error(String(payload?.error || `VPS API ${res.status}`));
        error.status = res.status;
        error.payload = payload;
        throw error;
      }
      return payload || {};
    } catch (error) {
      lastError = error?.name === 'AbortError'
        ? Object.assign(new Error('VPS request timed out'), { name: 'AbortError', cause: error })
        : error;
      if (attempt >= retries || !isTransientVpsError(lastError)) throw lastError;
      await delayVpsRetry(VPS_RETRY_DELAYS_MS[Math.min(attempt, VPS_RETRY_DELAYS_MS.length - 1)]);
    } finally {
      try { clearTimeout(timer); } catch {}
    }
  }

  throw lastError || new Error('VPS request failed');
}

async function migrateLegacyCharactersIfNeeded() {
  const legacyUserId = getStoredValue(VPS_LEGACY_USER_ID_KEY);
  const currentUserId = getStoredValue('int_user_id');
  if (!legacyUserId || !currentUserId || legacyUserId === currentUserId) return 0;
  try {
    const payload = await vpsApi('/characters/migrate-legacy', {
      method: 'POST',
      body: { legacyUserId }
    });
    const migrated = Number(payload?.migrated) || 0;
    if (migrated >= 0) removeStoredValue(VPS_LEGACY_USER_ID_KEY);
    return migrated;
  } catch (error) {
    if (Number(error?.status) === 403 || Number(error?.status) === 404) return 0;
    throw error;
  }
}

async function ensureVpsSession(userName = '') {
  const cached = getCachedVpsSession();
  if (cached) return cached;

  const legacyUserId = getStoredValue('int_user_id');
  const body = {
    userName: String(userName || getStoredValue('int_user_name') || '').trim(),
    legacyUserId
  };
  const sessionKey = JSON.stringify(body);
  if (pendingVpsSessionPromise && pendingVpsSessionKey === sessionKey) {
    return pendingVpsSessionPromise;
  }

  async function requestSession(useStoredToken) {
    const headers = { 'Content-Type': 'application/json' };
    const token = useStoredToken ? getVpsAuthToken() : '';
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetchVpsJson(`${VPS_API_BASE}/session`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      credentials: 'omit',
      mode: 'cors'
    }, { retries: 2, timeoutMs: VPS_SESSION_TIMEOUT_MS });
  }

  pendingVpsSessionKey = sessionKey;
  pendingVpsSessionPromise = (async () => {
    try {
      return rememberVpsSession(await requestSession(true));
    } catch (error) {
      if (Number(error?.status) !== 401 && Number(error?.status) !== 403) throw error;
      removeStoredValue(VPS_AUTH_TOKEN_KEY);
      removeStoredValue(VPS_AUTH_EXPIRES_KEY);
      return rememberVpsSession(await requestSession(false));
    }
  })();

  try {
    return await pendingVpsSessionPromise;
  } finally {
    if (pendingVpsSessionKey === sessionKey) {
      pendingVpsSessionPromise = null;
      pendingVpsSessionKey = '';
    }
  }
}

function getVpsActorUserId() {
  try {
    const stable = (typeof getCurrentStableUserId === 'function') ? getCurrentStableUserId() : '';
    return String(stable || getAppStorageItem?.('int_user_id') || myId || '').trim();
  } catch {
    return String(myId || '').trim();
  }
}

function getVpsActorName() {
  try {
    if (typeof safeGetUserName === 'function') return String(safeGetUserName() || '').trim();
  } catch {}
  try { return String(getAppStorageItem?.('int_user_name') || myNameSpan?.textContent || '').trim(); } catch {}
  return '';
}

function getVpsApiErrorMessage(error, fallback = 'Server request failed') {
  const raw = String(error?.payload?.error || error?.message || '').trim();
  if (/already owns/i.test(raw)) return 'У вас уже есть своя комната. Можно управлять только одной комнатой на пользователя.';
  if (/Only room owner/i.test(raw)) return 'Только владелец комнаты может это сделать.';
  if (/Invalid room password/i.test(raw)) return 'Неверный пароль комнаты.';
  if (/GM already|uq_one_gm_per_room|ГМ.*(уже|присутств)|уже.*ГМ/i.test(raw)) return 'В комнате уже присутствует ГМ. Вы не можете войти как ГМ.';
  if (/banned/i.test(raw)) return 'Вы заблокированы в этой комнате.';
  if (/required/i.test(raw)) return 'Не хватает данных комнаты.';
  if (isTransientVpsError(error)) return 'Сервер таверны временно не ответил. Попробуйте ещё раз.';
  return raw || fallback;
}

async function vpsApi(path, options = {}) {
  const cleanPath = String(path || '').startsWith('/') ? String(path || '') : `/${String(path || '')}`;
  const method = String(options.method || 'GET').toUpperCase();
  const headers = { ...(options.headers || {}) };
  const wantsAuth = options.auth !== false;
  if (wantsAuth && !headers.Authorization && !headers.authorization && cleanPath !== '/session') {
    let token = getVpsAuthToken();
    if (!token) {
      try {
        const session = await ensureVpsSession(getVpsActorName());
        token = String(session?.token || getVpsAuthToken() || '').trim();
      } catch {}
    }
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let body = options.body;
  const canJsonBody = body
    && typeof body === 'object'
    && !(typeof FormData !== 'undefined' && body instanceof FormData)
    && !(typeof Blob !== 'undefined' && body instanceof Blob);
  if (canJsonBody) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    body = JSON.stringify(body);
  }

  const requestOptions = {
    ...options,
    headers,
    body
  };
  const retries = Number.isFinite(Number(options.retries))
    ? Math.max(0, Math.min(5, Math.trunc(Number(options.retries))))
    : (method === 'GET' || method === 'HEAD' ? 2 : 0);

  try {
    return await fetchVpsJson(`${VPS_API_BASE}${cleanPath}`, requestOptions, {
      retries,
      timeoutMs: Number(options.timeoutMs) || VPS_API_TIMEOUT_MS
    });
  } catch (error) {
    if (wantsAuth && cleanPath !== '/session' && Number(error?.status) === 401) {
      removeStoredValue(VPS_AUTH_TOKEN_KEY);
      removeStoredValue(VPS_AUTH_EXPIRES_KEY);
      const session = await ensureVpsSession(getVpsActorName());
      const token = String(session?.token || getVpsAuthToken() || '').trim();
      if (token) {
        return fetchVpsJson(`${VPS_API_BASE}${cleanPath}`, {
          ...requestOptions,
          headers: { ...headers, Authorization: `Bearer ${token}` }
        }, {
          retries,
          timeoutMs: Number(options.timeoutMs) || VPS_API_TIMEOUT_MS
        });
      }
    }
    throw error;
  }
}

try { window.vpsApi = vpsApi; } catch {}
try { window.getVpsActorUserId = getVpsActorUserId; } catch {}
try { window.getVpsApiErrorMessage = getVpsApiErrorMessage; } catch {}
try { window.ensureVpsSession = ensureVpsSession; } catch {}
try { window.getVpsAuthToken = getVpsAuthToken; } catch {}
try { window.getVpsAuthHeaders = getVpsAuthHeaders; } catch {}
try { window.migrateLegacyCharactersIfNeeded = migrateLegacyCharactersIfNeeded; } catch {}
