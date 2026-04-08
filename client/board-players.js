// ================== BOARD ==================
function renderBoard(state) {
  const CELL = 50;
  const bw = Number(state?.boardWidth) || boardWidth || 10;
  const bh = Number(state?.boardHeight) || boardHeight || 10;
  const key = `${bw}x${bh}`;

  // If board size didn't change, avoid rebuilding the whole grid (this removes UI lag
  // when editing many wall segments).
  const canReuse = (window.__boardGridKey === key) && board.querySelector('.cell');

  if (!canReuse) {
    // Clear old grid cells and rebuild.
    board.querySelectorAll('.cell').forEach(c => c.remove());
  }

  // Ensure walls layer exists (do not recreate if we can reuse).
  let wallsLayer = board.querySelector('#walls-layer');
  if (!wallsLayer) {
    wallsLayer = document.createElement('div');
    wallsLayer.id = 'walls-layer';
    // Append later (after cells) so it sits above the grid in DOM order.
  }

  // Preview layer for walls while dragging (line/rect)
  let wallsPreviewLayer = board.querySelector('#walls-preview-layer');
  if (!wallsPreviewLayer) {
    wallsPreviewLayer = document.createElement('div');
    wallsPreviewLayer.id = 'walls-preview-layer';
  }

  board.style.position = 'relative';
  board.style.width = `${bw * CELL}px`;
  board.style.height = `${bh * CELL}px`;
  board.style.display = 'grid';
  board.style.gridTemplateColumns = `repeat(${bw}, ${CELL}px)`;
  board.style.gridTemplateRows = `repeat(${bh}, ${CELL}px)`;

  // Подложка должна растягиваться на весь размер поля (а не на 1 клетку)
  applyBoardBackgroundToDom(state);
  applyOpacityToDom(state);

  if (!canReuse) {
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        cell.dataset.x = x;
        cell.dataset.y = y;
        board.appendChild(cell);
      }
    }
    window.__boardGridKey = key;
  }

  // Ensure walls layer is the LAST child so it renders above cells.
  try {
    if (!wallsLayer.parentNode) board.appendChild(wallsLayer);
    else board.appendChild(wallsLayer); // moves to end
  } catch {}

  // Preview layer must be above walls, but below tokens.
  try {
    if (!wallsPreviewLayer.parentNode) board.appendChild(wallsPreviewLayer);
    else board.appendChild(wallsPreviewLayer);
  } catch {}

  // Render wall segments (edges) on top of the grid (below tokens).
  try { renderWallEdges(state, wallsLayer); } catch {}

  // Keep preview layer sized (content is controlled by events)
  try {
    const CELL = 50;
    const bw = Number(state?.boardWidth) || boardWidth || 10;
    const bh = Number(state?.boardHeight) || boardHeight || 10;
    wallsPreviewLayer.style.width = `${bw * CELL}px`;
    wallsPreviewLayer.style.height = `${bh * CELL}px`;
  } catch {}

  players.forEach(p => setPlayerPosition(p));

  // Fog of war overlay needs to match board size and state.
  try { window.FogWar?.onBoardRendered?.(state); } catch {}

  // Board marks/areas (rect/circle/poly overlays)
  try { window.BoardMarks?.onBoardRendered?.(state); } catch {}
}

// ================== WALL EDGES RENDER ==================
function normalizeWallEdgeData(w) {
  if (!w || typeof w !== 'object') return null;
  const x = Number(w.x);
  const y = Number(w.y);
  const dir = String(w.dir || '').toUpperCase();
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (dir !== 'N' && dir !== 'E' && dir !== 'S' && dir !== 'W') return null;
  return {
    x,
    y,
    dir,
    type: String(w.type || 'stone').toLowerCase(),
    thickness: Math.max(1, Math.min(12, Number(w.thickness) || 4))
  };
}

function buildWallEdgeElement(wall, { withDataset = false } = {}) {
  const CELL = 50;
  const normalized = normalizeWallEdgeData(wall);
  if (!normalized) return null;

  const { x, y, dir, type, thickness } = normalized;
  const el = document.createElement('div');
  el.className = `wall-edge wall-type-${type}`;
  el.classList.add(`wall-dir-${String(dir).toLowerCase()}`);
  el.style.setProperty('--t', `${thickness}px`);
  el.style.setProperty('--wall-height', '50px');
  if (withDataset) el.dataset.wallKey = `${x},${y},${dir}`;

  const left = x * CELL;
  const top = y * CELL;

  if (dir === 'N') {
    el.style.left = `${left}px`;
    el.style.top = `${top - Math.floor(thickness / 2)}px`;
    el.style.width = `${CELL}px`;
    el.style.height = `${thickness}px`;
  } else if (dir === 'S') {
    el.style.left = `${left}px`;
    el.style.top = `${top + CELL - Math.floor(thickness / 2)}px`;
    el.style.width = `${CELL}px`;
    el.style.height = `${thickness}px`;
  } else if (dir === 'W') {
    el.style.left = `${left - Math.floor(thickness / 2)}px`;
    el.style.top = `${top}px`;
    el.style.width = `${thickness}px`;
    el.style.height = `${CELL}px`;
  } else if (dir === 'E') {
    el.style.left = `${left + CELL - Math.floor(thickness / 2)}px`;
    el.style.top = `${top}px`;
    el.style.width = `${thickness}px`;
    el.style.height = `${CELL}px`;
  }

  return { el, key: `${x},${y},${dir}` };
}

function renderWallEdges(state, layerEl) {
  if (!layerEl) return;

  const CELL = 50;
  const stWalls = Array.isArray(state?.walls) ? state.walls : [];

  layerEl.innerHTML = '';
  try { window.__wallEdgeDomMap = new Map(); } catch {}

  const bw = Number(state?.boardWidth) || boardWidth || 10;
  const bh = Number(state?.boardHeight) || boardHeight || 10;
  layerEl.style.width = `${bw * CELL}px`;
  layerEl.style.height = `${bh * CELL}px`;

  const fragment = document.createDocumentFragment();
  const domMap = new Map();
  for (const wall of stWalls) {
    const built = buildWallEdgeElement(wall, { withDataset: true });
    if (!built) continue;
    fragment.appendChild(built.el);
    domMap.set(built.key, built.el);
  }
  layerEl.appendChild(fragment);
  try { window.__wallEdgeDomMap = domMap; } catch {}
}

// ================== OPTIMISTIC WALL UPDATES (GM drawing feels instant) ==================
// controlbox.js dispatches CustomEvent('int_local_wall_edges', { detail:{ mode, edges } })
const LEGACY_EVENT_PREFIX = ['d', 'n', 'd'].join('');
const legacyEventName = (name) => `${LEGACY_EVENT_PREFIX}_${String(name || '').trim()}`;
// We update the walls layer immediately, without waiting for server/state echo.
(function wireLocalWallEdges() {
  function ensureLayer() {
    return board?.querySelector?.('#walls-layer') || document.getElementById('walls-layer');
  }

  function makeEdgeEl(w) {
    const built = buildWallEdgeElement(w, { withDataset: true });
    return built ? built.el : null;
  }

  function applyLocalEdges(mode, edges) {
    const layer = ensureLayer();
    if (!layer) return;
    if (!window.__wallEdgeDomMap) window.__wallEdgeDomMap = new Map();

    const list = Array.isArray(edges) ? edges : [];
    if (!list.length) return;

    if (mode === 'add') {
      for (const w of list) {
        const x = Number(w?.x);
        const y = Number(w?.y);
        const dir = String(w?.dir || '').toUpperCase();
        const k = `${x},${y},${dir}`;
        if (window.__wallEdgeDomMap.has(k)) continue;
        const el = makeEdgeEl(w);
        if (!el) continue;
        layer.appendChild(el);
        window.__wallEdgeDomMap.set(k, el);
      }
    } else if (mode === 'remove') {
      for (const w of list) {
        const x = Number(w?.x);
        const y = Number(w?.y);
        const dir = String(w?.dir || '').toUpperCase();
        const k = `${x},${y},${dir}`;
        const el = window.__wallEdgeDomMap.get(k) || layer.querySelector?.(`[data-wall-key="${k}"]`);
        if (el) {
          try { el.remove(); } catch {}
        }
        try { window.__wallEdgeDomMap.delete(k); } catch {}
      }
    }
  }

  // Expose for direct calls too
  window.applyLocalWallEdges = function (mode, edges) {
    try { applyLocalEdges(String(mode || ''), edges); } catch {}
  };

  // CustomEvent from controlbox
  const onLocalWallEdges = (ev) => {
    try {
      const d = ev?.detail || {};
      applyLocalEdges(String(d.mode || ''), d.edges);
    } catch {}
  };
  window.addEventListener('int_local_wall_edges', onLocalWallEdges);
  window.addEventListener(legacyEventName('local_wall_edges'), onLocalWallEdges);
})();

// ================== WALL PREVIEW (drag contour) ==================
(function wireWallPreview() {
  function ensurePreviewLayer() {
    return board?.querySelector?.('#walls-preview-layer') || document.getElementById('walls-preview-layer');
  }

  function makePreviewEdgeEl(w) {
    const CELL = 50;
    const x = Number(w?.x);
    const y = Number(w?.y);
    const dir = String(w?.dir || '').toUpperCase();
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (dir !== 'N' && dir !== 'E' && dir !== 'S' && dir !== 'W') return null;

    const thickness = Math.max(1, Math.min(12, Number(w?.thickness) || 4));

    const el = document.createElement('div');
    el.className = 'wall-edge wall-preview';
    el.style.setProperty('--t', `${thickness}px`);

    const left = x * CELL;
    const top = y * CELL;

    if (dir === 'N') {
      el.style.left = `${left}px`;
      el.style.top = `${top - Math.floor(thickness / 2)}px`;
      el.style.width = `${CELL}px`;
      el.style.height = `${thickness}px`;
    } else if (dir === 'S') {
      el.style.left = `${left}px`;
      el.style.top = `${top + CELL - Math.floor(thickness / 2)}px`;
      el.style.width = `${CELL}px`;
      el.style.height = `${thickness}px`;
    } else if (dir === 'W') {
      el.style.left = `${left - Math.floor(thickness / 2)}px`;
      el.style.top = `${top}px`;
      el.style.width = `${thickness}px`;
      el.style.height = `${CELL}px`;
    } else if (dir === 'E') {
      el.style.left = `${left + CELL - Math.floor(thickness / 2)}px`;
      el.style.top = `${top}px`;
      el.style.width = `${thickness}px`;
      el.style.height = `${CELL}px`;
    }
    return el;
  }

  function clearPreview() {
    const layer = ensurePreviewLayer();
    if (!layer) return;
    layer.innerHTML = '';
  }

  function renderPreview(edges) {
    const layer = ensurePreviewLayer();
    if (!layer) return;
    layer.innerHTML = '';
    const list = Array.isArray(edges) ? edges : [];
    for (const w of list) {
      const el = makePreviewEdgeEl(w);
      if (el) layer.appendChild(el);
    }
  }

  const onWallPreview = (ev) => {
    try {
      const d = ev?.detail || {};
      renderPreview(d.edges);
    } catch {}
  };
  const onWallPreviewClear = () => {
    try { clearPreview(); } catch {}
  };
  window.addEventListener('int_wall_preview', onWallPreview);
  window.addEventListener(legacyEventName('wall_preview'), onWallPreview);
  window.addEventListener('int_wall_preview_clear', onWallPreviewClear);
  window.addEventListener(legacyEventName('wall_preview_clear'), onWallPreviewClear);
})();

// ================== SHEET HELPERS (for HP bar + mini popup) ==================
function getFrom(obj, path, fallback) {
  try {
    const parts = String(path || '').split('.').filter(Boolean);
    let cur = obj;
    for (const k of parts) {
      if (!cur || typeof cur !== 'object') return fallback;
      cur = cur[k];
    }
    return (cur === undefined ? fallback : cur);
  } catch {
    return fallback;
  }
}

function safeNum(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function ensureDeathSavesStateOnSheet(sheet) {
  if (!sheet || typeof sheet !== 'object') return { success: 0, fail: 0, stabilized: false, lastRoll: null, lastOutcome: '' };
  if (!sheet.vitality || typeof sheet.vitality !== 'object') sheet.vitality = {};
  if (!sheet.vitality.deathSaves || typeof sheet.vitality.deathSaves !== 'object') {
    sheet.vitality.deathSaves = { success: 0, fail: 0, stabilized: false, lastRoll: null, lastOutcome: '' };
  }
  const ds = sheet.vitality.deathSaves;
  ds.success = Math.max(0, Math.min(3, safeNum(ds.success, 0) ?? 0));
  ds.fail = Math.max(0, Math.min(3, safeNum(ds.fail, 0) ?? 0));
  ds.stabilized = !!ds.stabilized;
  ds.lastRoll = (ds.lastRoll === null || ds.lastRoll === undefined || ds.lastRoll === '') ? null : (safeNum(ds.lastRoll, null));
  ds.lastOutcome = String(ds.lastOutcome || '');
  return ds;
}

function resetDeathSavesOnSheet(sheet) {
  const ds = ensureDeathSavesStateOnSheet(sheet);
  ds.success = 0;
  ds.fail = 0;
  ds.stabilized = false;
  ds.lastRoll = null;
  ds.lastOutcome = '';
  return ds;
}

function syncDeathSavesForCurrentHp(sheet) {
  if (!sheet || typeof sheet !== 'object') return;
  const max = safeNum(getFrom(sheet, 'vitality.hp-max.value', 0), 0) ?? 0;
  const cur = safeNum(getFrom(sheet, 'vitality.hp-current.value', 0), 0) ?? 0;
  const ds = ensureDeathSavesStateOnSheet(sheet);
  if (cur > 0 || max <= 0) {
    resetDeathSavesOnSheet(sheet);
    return;
  }
  if (cur <= 0 && ds.fail >= 3) ds.stabilized = false;
}

function clearStabilizedIfDamagedAtZero(sheet) {
  if (!sheet || typeof sheet !== 'object') return;
  const max = safeNum(getFrom(sheet, 'vitality.hp-max.value', 0), 0) ?? 0;
  const cur = safeNum(getFrom(sheet, 'vitality.hp-current.value', 0), 0) ?? 0;
  const ds = ensureDeathSavesStateOnSheet(sheet);
  if (max > 0 && cur <= 0 && ds.stabilized) {
    resetDeathSavesOnSheet(sheet);
  }
}

function getQuickSheetStats(player) {
  const s = player?.sheet?.parsed || {};
  const hpMax = safeNum(getFrom(s, 'vitality.hp-max.value', null), null);
  const hpCur = safeNum(getFrom(s, 'vitality.hp-current.value', null), null);
  const hpTemp = safeNum(getFrom(s, 'vitality.hp-temp.value', null), null);
  const ac = safeNum(getFrom(s, 'vitality.ac.value', null), null);
  const speed = safeNum(getFrom(s, 'vitality.speed.value', null), null);
  const lvl = safeNum(getFrom(s, 'info.level.value', null), null);
  const stats = {
    str: safeNum(getFrom(s, 'stats.str.score', null), null),
    dex: safeNum(getFrom(s, 'stats.dex.score', null), null),
    con: safeNum(getFrom(s, 'stats.con.score', null), null),
    int: safeNum(getFrom(s, 'stats.int.score', null), null),
    wis: safeNum(getFrom(s, 'stats.wis.score', null), null),
    cha: safeNum(getFrom(s, 'stats.cha.score', null), null)
  };
  return { hpMax, hpCur, hpTemp, ac, speed, lvl, stats };
}

function ensureSheetPath(sheetObj, path) {
  const parts = String(path || '').split('.').filter(Boolean);
  let cur = sheetObj;
  for (let i = 0; i < parts.length; i++) {
    const k = parts[i];
    if (i === parts.length - 1) return { parent: cur, key: k };
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  return { parent: sheetObj, key: null };
}

function canEditTokenMiniSheet(player) {
  try {
    if (String(typeof myRole !== 'undefined' ? myRole : window.myRole || '') === 'GM') return true;
  } catch {}
  try {
    return String(player?.ownerId || '') === String(typeof myId !== 'undefined' ? myId : window.myId || '');
  } catch {}
  return false;
}

function upsertSheetNumber(player, path, value) {
  const pid = String(player?.id || '');
  if (!pid) return;
  const current = players.find(p => String(p?.id) === pid);
  if (!current) return;
  if (!canEditTokenMiniSheet(current)) return;
  const nextSheet = deepClone(current.sheet || { parsed: {} });
  if (!nextSheet.parsed || typeof nextSheet.parsed !== 'object') nextSheet.parsed = {};
  const { parent, key } = ensureSheetPath(nextSheet.parsed, path);
  if (!parent || !key) return;
  if (!parent[key] || typeof parent[key] !== 'object') parent[key] = {};
  parent[key].value = value;
  try { syncDeathSavesForCurrentHp(nextSheet.parsed); } catch {}
  // оптимистично обновляем локально
  current.sheet = nextSheet;

  // Debounce per-player sheet updates to avoid "revert" on late/out-of-order echoes.
  window.__sheetSendTimers = window.__sheetSendTimers || new Map();
  window.__sheetSendPending = window.__sheetSendPending || new Map();
  try { window.__sheetSendPending.set(pid, nextSheet); } catch {}

  try {
    const timers = window.__sheetSendTimers;
    const prev = timers.get(pid);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      const pending = window.__sheetSendPending?.get?.(pid) || nextSheet;
      try { sendMessage({ type: 'setPlayerSheet', id: pid, sheet: pending }); } catch {}
      try { window.__sheetSendPending?.delete?.(pid); } catch {}
      try { window.__sheetSendTimers?.delete?.(pid); } catch {}
    }, 140);
    timers.set(pid, t);
  } catch {
    // fallback
    try { sendMessage({ type: 'setPlayerSheet', id: pid, sheet: nextSheet }); } catch {}
  }
}

// ================== HP BAR (always on top) ==================
function updateHpBar(player, tokenEl) {
  const pid = String(player?.id || '');
  if (!pid) return;

  // Hide HP bar if user has no access to sensitive info (GM-created public NPCs)
  try {
    if (typeof canViewSensitiveInfo === 'function' && !canViewSensitiveInfo(player)) {
      const existing = hpBarElements.get(pid);
      if (existing?.main) existing.main.style.display = 'none';
      return;
    }
  } catch {}
  let bars = hpBarElements.get(pid);

  const size = Number(player?.size) || 1;

  if (!bars) {
    const main = document.createElement('div');
    main.className = 'token-hpbar';
    main.innerHTML = `<div class="fill"></div><div class="death-track" aria-hidden="true">`
      + `<span class="death-seg death-seg--fail"></span><span class="death-seg death-seg--fail"></span><span class="death-seg death-seg--fail"></span>`
      + `<span class="death-seg death-seg--success"></span><span class="death-seg death-seg--success"></span><span class="death-seg death-seg--success"></span>`
      + `</div><div class="txt"></div>`;
    board.appendChild(main);

    // Temp HP is shown inside the same bar (swap style/text), so no extra bar.
    bars = { main };
    hpBarElements.set(pid, bars);
  }

  const bar = bars.main;

  if (!tokenEl || tokenEl.style.display === 'none' || player.x === null || player.y === null) {
    bar.style.display = 'none';
    return;
  }

  const { hpMax, hpCur, hpTemp } = getQuickSheetStats(player);
  const max = (hpMax !== null ? Math.max(0, hpMax) : 0);
  const cur = (hpCur !== null ? hpCur : max);

  const sheet = getTokenSheetSafe(player) || {};
  try { syncDeathSavesForCurrentHp(sheet); } catch {}
  const ds = ensureDeathSavesStateOnSheet(sheet);
  const deathMode = (max > 0 && cur <= 0 && (hpTemp === null || Number(hpTemp) <= 0));

  // If temp HP exists, show it inside the same bar (and style as temp).
  const tempVal = (hpTemp !== null ? Math.max(0, hpTemp) : 0);
  const showTemp = tempVal > 0 && !deathMode;

  const pct = (!showTemp && max > 0)
    ? Math.max(0, Math.min(100, Math.round((cur / max) * 100)))
    : 100;

  bar.style.display = 'block';
  bar.style.width = `${size * 50}px`;
  bar.style.left = `${tokenEl.offsetLeft}px`;
  bar.style.top = `${tokenEl.offsetTop - 14}px`;
  bar.classList.toggle('token-hpbar--death', deathMode);
  bar.classList.toggle('token-hpbar--stabilized', deathMode && ds.stabilized && ds.success >= 3 && ds.fail < 3);

  const fill = bar.querySelector('.fill');
  const txt = bar.querySelector('.txt');
  const deathTrack = bar.querySelector('.death-track');
  const deathSegs = deathTrack ? Array.from(deathTrack.querySelectorAll('.death-seg')) : [];
  if (fill) fill.style.width = `${pct}%`;
  if (deathMode) {
    bar.classList.remove('token-hpbar--temp');
    const isDead = ds.fail >= 3;
    const isStable = !!(ds.stabilized && ds.success >= 3 && ds.fail < 3);
    bar.classList.toggle('token-hpbar--dead', isDead);
    bar.classList.toggle('token-hpbar--show-track', !isDead && !isStable);
    if (deathTrack) deathTrack.style.display = (!isDead && !isStable) ? 'grid' : 'none';
    deathSegs.forEach((seg, idx) => {
      const isFail = idx < 3;
      const active = isFail ? idx < Math.min(3, ds.fail || 0) : (idx - 3) < Math.min(3, ds.success || 0);
      seg.classList.toggle('is-on', !!active);
    });
    if (fill) fill.style.width = isDead ? '100%' : '0%';
    if (txt) {
      if (isDead) txt.textContent = 'Мертв(а)';
      else if (isStable) txt.textContent = `${cur ?? 0}/${max ?? 0}`;
      else txt.textContent = '';
    }
  } else if (showTemp) {
    bar.classList.remove('token-hpbar--dead');
    bar.classList.remove('token-hpbar--show-track');
    if (deathTrack) deathTrack.style.display = 'none';
    bar.classList.add('token-hpbar--temp');
    if (txt) txt.textContent = `${tempVal}`;
  } else {
    bar.classList.remove('token-hpbar--dead');
    bar.classList.remove('token-hpbar--temp');
    bar.classList.remove('token-hpbar--show-track');
    if (deathTrack) deathTrack.style.display = 'none';
    if (txt) txt.textContent = `${cur ?? 0}/${max ?? 0}`;
  }
}


// ================== MINI POPUP (dblclick on token) ==================
let tokenMiniEl = null;
let tokenMiniPlayerId = null;

function closeTokenMini() {
  if (tokenMiniEl) {
    tokenMiniEl.remove();
    tokenMiniEl = null;
    tokenMiniPlayerId = null;
  }
}

function formatVal(v, fallback = '—') {
  return (v === null || v === undefined || v === '' || (typeof v === 'number' && !Number.isFinite(v))) ? fallback : String(v);
}

function formatSignedValue(v, fallback = '—') {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return n >= 0 ? `+${n}` : `${n}`;
}

const TOKEN_MINI_D20_SVG = `
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path d="M12 2 20.5 7v10L12 22 3.5 17V7L12 2Z" fill="currentColor" opacity="0.95"></path>
    <path d="M12 2v20M3.5 7l8.5 5 8.5-5M3.5 17l8.5-5 8.5 5" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"></path>
  </svg>
`;

const TOKEN_MINI_ACTION_SVG = `
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path d="M12 2.5c3.6 2.2 6 5.1 6 8.4 0 4.5-3.6 8.6-6 10.6-2.4-2-6-6.1-6-10.6 0-3.3 2.4-6.2 6-8.4z" fill="currentColor" opacity="0.95"></path>
    <path d="M12 7.2v6.3" fill="none" stroke="rgba(0,0,0,0.45)" stroke-width="1.6" stroke-linecap="round"></path>
    <path d="M9.2 10.4h5.6" fill="none" stroke="rgba(0,0,0,0.45)" stroke-width="1.6" stroke-linecap="round"></path>
  </svg>
`;
const TOKEN_DASH_SVG = `
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path d="M4 15.5c2.6-3.2 5.7-5.3 9.3-6.4l-1.6 3.5 8.3-4.1-6.1-7.2-.6 4C8.2 6.6 4.3 9.5 2.5 14.4c-.3.8.8 1.7 1.5 1.1z" fill="currentColor" opacity="0.95"></path>
    <path d="M8.5 18.5c1.6-.9 3.1-1.3 4.7-1.4" fill="none" stroke="rgba(0,0,0,0.45)" stroke-width="1.8" stroke-linecap="round"></path>
  </svg>
`;

function formatTokenMiniUses(current, total) {
  const cur = Math.max(0, Number(current) || 0);
  const max = Math.max(0, Number(total) || 0);
  if (!max) return 'Без лимита';
  return `${cur}/${max}`;
}

function tokenMiniActionMeta(exec) {
  const kind = String(exec || '').trim().toLowerCase();
  if (kind === 'attack') return 'Атака';
  if (kind === 'action') return 'Действие';
  return 'Эффект';
}

function canUseTokenMiniQuickPanels(player) {
  return !!canEditTokenMiniSheet(player);
}

function getTokenMiniSheet(player) {
  const sheet = getTokenSheetSafe(player);
  return (sheet && typeof sheet === 'object') ? sheet : null;
}

function tokenMiniStatMod(sheet, statKey) {
  const k = String(statKey || '-').trim();
  if (!['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(k)) return 0;
  const direct = sheet?.stats?.[k]?.modifier;
  if (direct !== undefined && direct !== null && direct !== '') return safeNum(direct, 0) ?? 0;
  const score = safeNum(sheet?.stats?.[k]?.value, 10) ?? 10;
  return Math.floor((score - 10) / 2);
}

function getTokenMiniCombatSummary(sheet) {
  const combat = [];
  const list = Array.isArray(sheet?.weaponsList) ? sheet.weaponsList : [];
  list.forEach((weapon, idx) => {
    if (!weapon || typeof weapon !== 'object') return;
    const name = String(weapon?.name?.value ?? weapon?.name ?? '').trim();
    if (!name || name === '-') return;
    const attackBonus = (typeof calcWeaponAttackBonus === 'function')
      ? calcWeaponAttackBonus(sheet, weapon)
      : (safeNum(weapon?.extraAtk, 0) ?? 0);
    const damageBonus = (typeof calcWeaponDamageBonus === 'function')
      ? calcWeaponDamageBonus(sheet, weapon)
      : tokenMiniStatMod(sheet, weapon?.ability);
    const damageText = (typeof weaponDamageText === 'function')
      ? weaponDamageText(weapon)
      : `${Math.max(1, safeNum(weapon?.dmgNum, 1) ?? 1)}${String(weapon?.dmgDice || 'к6')}${String(weapon?.dmgType || '').trim() ? ` ${String(weapon.dmgType).trim()}` : ''}`.trim();
    combat.push({
      id: `weapon-${idx}`,
      idx,
      name,
      attackBonus,
      attackText: formatSignedValue(attackBonus),
      damageBonus,
      damage: damageText,
      dmgNum: Math.max(1, safeNum(weapon?.dmgNum, 1) ?? 1),
      dmgDice: String(weapon?.dmgDice || 'к6').trim().toLowerCase()
    });
  });

  const powers = Array.isArray(sheet?.combat?.powersDefs) ? sheet.combat.powersDefs : [];
  const abilities = powers
    .map((def, idx) => {
      if (!def || typeof def !== 'object') return null;
      const slotsMax = Math.max(0, safeNum(def?.slotsMax, 0) ?? 0);
      const slotsState = Array.isArray(def?.slotsState) ? def.slotsState.slice(0, slotsMax) : [];
      const slotsCurrent = slotsMax > 0 ? slotsState.filter(Boolean).length : 0;
      const subs = Array.isArray(def?.subs) ? def.subs : [];
      return {
        id: String(def?.id || `power-${idx}`),
        name: String(def?.name || `Способность-${idx + 1}`).trim() || `Способность-${idx + 1}`,
        slotsMax,
        slotsCurrent,
        slotsState,
        actions: subs
          .map((sub, subIdx) => {
            if (!sub || typeof sub !== 'object') return null;
            const title = String(sub?.name || `Действие-${subIdx + 1}`).trim();
            if (!title) return null;
            const exec = (String(sub?.exec || sub?.mode || 'attack').trim().toLowerCase() === 'action') ? 'action' : 'attack';
            const bonus = exec === 'attack' ? tokenMiniStatMod(sheet, sub?.stat) : 0;
            return {
              id: String(sub?.id || `${idx}-${subIdx}`),
              name: title,
              exec,
              kind: tokenMiniActionMeta(exec),
              bonus,
              bonusText: formatSignedValue(bonus, '+0')
            };
          })
          .filter(Boolean)
      };
    })
    .filter(Boolean);

  return { weapons: combat, abilities };
}

function getTokenMiniSpellsSummary(sheet) {
  const vm = (typeof toViewModel === 'function') ? toViewModel(sheet || {}, '') : null;
  const sourceBlocks = Array.isArray(vm?.spellsByLevel) ? vm.spellsByLevel : [];
  const blocks = sourceBlocks
    .filter(block => Array.isArray(block?.items) && block.items.length)
    .map((block) => {
      const lvl = Math.max(0, safeNum(block?.level, 0) ?? 0);
      const slotKey = `slots-${lvl}`;
      const total = Math.max(0, safeNum(sheet?.spells?.[slotKey]?.value, 0) ?? 0);
      const filled = Math.max(0, safeNum(sheet?.spells?.[slotKey]?.filled, 0) ?? 0);
      const available = Math.max(0, total - filled);
      return {
        level: lvl,
        title: lvl === 0 ? 'Заговоры' : `Уровень ${lvl}`,
        slots: lvl === 0 ? null : { total, available },
        items: block.items
          .map((item, idx) => {
            const name = String(item?.text || '').trim();
            if (!name) return null;
            return {
              id: `${lvl}-${idx}-${name}`,
              name,
              href: String(item?.href || '').trim()
            };
          })
          .filter(Boolean)
      };
    })
    .filter(block => block.items.length);
  return blocks;
}

function renderTokenMiniDots(total, current, kind, interactive = false, dataAttrs = '') {
  const max = Math.max(0, Number(total) || 0);
  const cur = Math.max(0, Number(current) || 0);
  if (!max) return `<span class="token-mini-dots-empty">—</span>`;
  return Array.from({ length: max }).map((_, idx) => {
    const isOn = idx < cur;
    if (kind === 'spell') {
      return `<span class="slot-dot${isOn ? ' is-available' : ''}" ${dataAttrs}></span>`;
    }
    if (interactive) {
      return `<button class="cpw-dotbtn ${isOn ? 'on' : 'off'}" type="button" ${dataAttrs} data-mini-power-dot="${idx}" title="Использование"></button>`;
    }
    return `<span class="cpw-dot ${isOn ? 'on' : 'off'}"></span>`;
  }).join('');
}

function renderTokenMiniCombatPanel(summary, canUse) {
  const weapons = Array.isArray(summary?.weapons) ? summary.weapons : [];
  const abilities = Array.isArray(summary?.abilities) ? summary.abilities : [];
  const weaponsHtml = weapons.length
    ? weapons.map(w => `
        <div class="token-mini-side-item token-mini-side-item--weapon">
          <div class="token-mini-side-item__head">
            <span class="token-mini-side-item__name">${escapeHtml(w.name)}</span>
          </div>
          <div class="token-mini-weapon-grid">
            <div class="token-mini-weapon-box">
              <span class="token-mini-weapon-box__label">Атака</span>
              <strong class="token-mini-weapon-box__value">${escapeHtml(w.attackText)}</strong>
              <button class="weapon-dice-btn" type="button" data-mini-weapon-roll-atk="${w.idx}" title="Бросок атаки">${TOKEN_MINI_D20_SVG}</button>
            </div>
            <div class="token-mini-weapon-box">
              <span class="token-mini-weapon-box__label">Урон</span>
              <strong class="token-mini-weapon-box__value">${escapeHtml(w.damage)}</strong>
              <button class="weapon-dice-btn" type="button" data-mini-weapon-roll-dmg="${w.idx}" title="Бросок урона">${TOKEN_MINI_D20_SVG}</button>
            </div>
          </div>
        </div>
      `).join('')
    : `<div class="token-mini-side-empty">Оружие в разделе «Бой» пока не заполнено.</div>`;

  const abilitiesHtml = abilities.length
    ? abilities.map(def => `
        <div class="token-mini-side-item token-mini-side-item--ability">
          <div class="token-mini-side-item__head token-mini-side-item__head--center">
            <span class="token-mini-side-item__name">${escapeHtml(def.name)}</span>
            <div class="token-mini-dots token-mini-dots--power">${renderTokenMiniDots(def.slotsMax, def.slotsCurrent, 'power')}</div>
          </div>
          ${def.actions.length ? `
            <div class="token-mini-sublist">
              ${def.actions.map(action => `
                <div class="token-mini-subitem">
                  <div class="token-mini-subitem__head token-mini-subitem__head--action">
                    <span class="token-mini-subitem__name">${escapeHtml(action.name)}</span>
                    <div class="token-mini-subitem__controls">
                      <span class="token-mini-subitem__kind">${escapeHtml(action.kind)}</span>
                      ${action.exec === 'attack'
                        ? `<button class="cpw-dice" type="button" data-mini-power-roll="${escapeHtml(def.id)}::${escapeHtml(action.id)}" title="Бросок: d20 ${escapeHtml(action.bonusText)}">${TOKEN_MINI_D20_SVG}</button>`
                        : `<button class="cpw-action" type="button" data-mini-power-action="${escapeHtml(def.id)}::${escapeHtml(action.id)}" title="Применить действие" ${canUse ? '' : 'disabled'}>${TOKEN_MINI_ACTION_SVG}</button>`}
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `<div class="token-mini-side-empty token-mini-side-empty--inline">Подспособности не указаны.</div>`}
        </div>
      `).join('')
    : `<div class="token-mini-side-empty">Способности в разделе «Бой» пока не заполнены.</div>`;

  return `
    <div class="token-mini-side-scroll">
      <div class="token-mini-side-section">
        <div class="token-mini-side-section__title">Оружие</div>
        ${weaponsHtml}
      </div>
      <div class="token-mini-side-divider"></div>
      <div class="token-mini-side-section">
        <div class="token-mini-side-section__title">Способности</div>
        ${abilitiesHtml}
      </div>
    </div>
  `;
}

function renderTokenMiniSpellsPanel(blocks, canEditSpells) {
  const body = Array.isArray(blocks) && blocks.length
    ? blocks.map(block => `
        <div class="token-mini-side-item token-mini-side-item--spell-block">
          <div class="token-mini-side-item__head token-mini-side-item__head--center">
            <span class="token-mini-side-item__name">${escapeHtml(block.title)}</span>
            ${block.slots
              ? `<div class="token-mini-dots token-mini-dots--spell">${renderTokenMiniDots(block.slots.total, block.slots.available, 'spell')}</div>`
              : `<span class="token-mini-side-pill token-mini-side-pill--slots">Без ячеек</span>`}
          </div>
          <div class="token-mini-spell-list">
            ${block.items.map(spell => `
              <div class="token-mini-spell-row" data-mini-spell-row data-spell-level="${block.level}" data-spell-href="${escapeHtml(spell.href || '')}" data-spell-name="${escapeHtml(spell.name)}">
                <span class="token-mini-spell-name">${escapeHtml(spell.name)}</span>
                <button type="button" class="spell-cast-btn token-mini-spell-cast" data-mini-spell-cast ${(!canEditSpells && block.level > 0) ? 'disabled' : ''} title="Применить">${TOKEN_MINI_ACTION_SVG}</button>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')
    : `<div class="token-mini-side-empty">Заговоры и заклинания ещё не заполнены.</div>`;

  return `<div class="token-mini-side-scroll">${body}</div>`;
}

function updateTokenMiniSpellButtonsState(card, player) {
  if (!card || !player) return;
  const sheet = getTokenMiniSheet(player);
  const canEdit = canUseTokenMiniQuickPanels(player);
  card.querySelectorAll('[data-mini-spell-row]').forEach((row) => {
    const lvl = Math.max(0, safeNum(row.getAttribute('data-spell-level'), 0) ?? 0);
    const btn = row.querySelector('[data-mini-spell-cast]');
    if (!(btn instanceof HTMLButtonElement)) return;
    if (lvl <= 0) {
      btn.disabled = false;
      return;
    }
    if (!canEdit) {
      btn.disabled = true;
      return;
    }
    const key = `slots-${lvl}`;
    const total = Math.max(0, safeNum(sheet?.spells?.[key]?.value, 0) ?? 0);
    const filled = Math.max(0, safeNum(sheet?.spells?.[key]?.filled, 0) ?? 0);
    const available = Math.max(0, total - filled);
    btn.disabled = available <= 0;
  });
}

function updateTokenMiniPowerButtonsState(card, player) {
  if (!card || !player) return;
  const sheet = getTokenMiniSheet(player);
  const defs = Array.isArray(sheet?.combat?.powersDefs) ? sheet.combat.powersDefs : [];
  const canUse = canUseTokenMiniQuickPanels(player);
  const getAvailable = (defId) => {
    const def = defs.find(item => String(item?.id || '') === String(defId || ''));
    const max = Math.max(0, safeNum(def?.slotsMax, 0) ?? 0);
    const states = Array.isArray(def?.slotsState) ? def.slotsState : [];
    return max <= 0 ? Infinity : states.filter(Boolean).length;
  };
  card.querySelectorAll('[data-mini-power-roll], [data-mini-power-action]').forEach((btn) => {
    const key = String(btn.getAttribute('data-mini-power-roll') || btn.getAttribute('data-mini-power-action') || '');
    const defId = key.split('::')[0] || '';
    const available = getAvailable(defId);
    btn.disabled = !canUse || available <= 0;
  });
}

function toggleTokenMiniSidePanel(card, panelName) {
  if (!card) return;
  const next = (card.dataset.sidePanel === panelName) ? '' : panelName;
  card.dataset.sidePanel = next;
  card.querySelectorAll('[data-mini-side-button]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-mini-side-button') === next);
  });
}

function rollTokenMiniWeapon(player, weaponIdx, kind) {
  const current = players.find(pp => String(pp?.id) === String(player?.id || '')) || player;
  const sheet = current?.sheet?.parsed;
  const weapon = Array.isArray(sheet?.weaponsList) ? sheet.weaponsList[weaponIdx] : null;
  if (!sheet || !weapon || !window.DicePanel?.roll) return;
  if (kind === 'dmg') {
    const count = Math.max(1, safeNum(weapon?.dmgNum, 1) ?? 1);
    const dice = String(weapon?.dmgDice || 'к6').trim().toLowerCase();
    const sides = Math.max(1, safeNum(dice.replace('к', ''), 6) ?? 6);
    const bonus = (typeof calcWeaponDamageBonus === 'function') ? calcWeaponDamageBonus(sheet, weapon) : tokenMiniStatMod(sheet, weapon?.ability);
    window.DicePanel.roll({
      sides,
      count,
      bonus,
      kindText: `Урон: ${count}d${sides} ${formatSignedValue(bonus, '+0')}`,
      actorName: current?.isBase ? '' : String(current?.name || '')
    });
    return;
  }
  const bonus = (typeof calcWeaponAttackBonus === 'function') ? calcWeaponAttackBonus(sheet, weapon) : (safeNum(weapon?.extraAtk, 0) ?? 0);
  window.DicePanel.roll({
    sides: 20,
    count: 1,
    bonus,
    kindText: `Атака: d20 ${formatSignedValue(bonus, '+0')}`,
    actorName: current?.isBase ? '' : String(current?.name || '')
  });
}

function useTokenMiniPower(player, defId, subId, mode) {
  const current = players.find(pp => String(pp?.id) === String(player?.id || '')) || player;
  const sheet = current?.sheet?.parsed;
  if (!sheet || !canUseTokenMiniQuickPanels(current)) return false;
  if (!sheet.combat || typeof sheet.combat !== 'object') sheet.combat = {};
  if (!Array.isArray(sheet.combat.powersDefs)) sheet.combat.powersDefs = [];
  const def = sheet.combat.powersDefs.find(item => String(item?.id || '') === String(defId || ''));
  if (!def) return false;
  if (!Array.isArray(def.subs)) def.subs = [];
  const sub = def.subs.find(item => String(item?.id || '') === String(subId || ''));
  if (!sub) return false;
  const max = Math.max(0, safeNum(def?.slotsMax, 0) ?? 0);
  if (!Array.isArray(def.slotsState)) def.slotsState = [];
  for (let i = 0; i < max; i += 1) {
    if (typeof def.slotsState[i] !== 'boolean') def.slotsState[i] = true;
  }
  if (max > 0) {
    const idx = def.slotsState.findIndex(Boolean);
    if (idx < 0) return false;
    def.slotsState[idx] = false;
  }

  const title = String(sub?.name || def?.name || 'Способность').trim() || 'Способность';
  if (mode === 'roll') {
    const bonus = tokenMiniStatMod(sheet, sub?.stat);
    window.DicePanel?.roll?.({ sides: 20, count: 1, bonus, kindText: `${title}: d20${formatSignedValue(bonus, '+0')}` });
  } else {
    try {
      if (typeof sendMessage === 'function') {
        const fromName = String(current?.name || '').trim() || 'Игрок';
        sendMessage({ type: 'log', text: `${fromName} применил «${title}»` });
      }
    } catch {}
  }

  try {
    current.sheet = deepClone(current.sheet || { parsed: {} });
    current.sheet.parsed = sheet;
    sendMessage({ type: 'setPlayerSheet', id: String(current.id || ''), sheet: current.sheet });
  } catch {}
  return true;
}

function useTokenMiniSpell(player, lvl, href, name) {
  const current = players.find(pp => String(pp?.id) === String(player?.id || '')) || player;
  const sheet = current?.sheet?.parsed;
  if (!sheet) return false;
  const canEdit = canUseTokenMiniQuickPanels(current);
  if (lvl > 0) {
    if (!canEdit) return false;
    if (!sheet.spells || typeof sheet.spells !== 'object') sheet.spells = {};
    const key = `slots-${lvl}`;
    if (!sheet.spells[key] || typeof sheet.spells[key] !== 'object') sheet.spells[key] = { value: 0, filled: 0 };
    const total = Math.max(0, safeNum(sheet.spells[key].value, 0) ?? 0);
    const filled = Math.max(0, safeNum(sheet.spells[key].filled, 0) ?? 0);
    const available = Math.max(0, total - filled);
    if (available <= 0) return false;
    sheet.spells[key].filled = Math.min(total, filled + 1);
    try {
      current.sheet = deepClone(current.sheet || { parsed: {} });
      current.sheet.parsed = sheet;
      sendMessage({ type: 'setPlayerSheet', id: String(current.id || ''), sheet: current.sheet });
    } catch {}
  }
  try {
    if (typeof sendMessage === 'function') {
      const kind = lvl <= 0 ? 'Заговор' : 'Заклинание';
      const who = String(current?.name || '').trim() || 'Игрок';
      sendMessage({ type: 'log', text: `${who} применил ${kind}: ${String(name || 'Без названия').trim()}` });
    }
  } catch {}
  try {
    const actionCfg = (typeof getSpellActionConfig === 'function') ? getSpellActionConfig(sheet, href) : null;
    if (actionCfg?.type === 'teleport') {
      window.activateCombatTeleportForPlayer?.(current, {
        rangeFeet: Math.max(0, safeNum(actionCfg.rangeFeet, 0) ?? 0),
        sourceKind: 'spell',
        sourceId: href || '',
        sourceName: String(name || 'Заклинание')
      });
    }
  } catch {}
  return true;
}

function positionTokenMini(tokenEl) {
  if (!tokenMiniEl || !tokenEl) return;
  const rect = tokenEl.getBoundingClientRect();
  const left = rect.left + (rect.width / 2);
  const top = rect.top - 8;
  tokenMiniEl.style.left = `${left}px`;
  tokenMiniEl.style.top = `${top}px`;
  tokenMiniEl.style.transformOrigin = '50% 100%';
  tokenMiniEl.style.transform = 'translate(-50%, -100%)';

  const viewportLeft = 0;
  const viewportTop = 0;
  const viewportRight = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportBottom = window.innerHeight || document.documentElement.clientHeight || 0;
  const r = tokenMiniEl.getBoundingClientRect();
  let dx = 0;
  let dy = 0;
  if (r.left < viewportLeft) dx = viewportLeft - r.left + 12;
  if (r.right > viewportRight) dx = -(r.right - viewportRight + 12);
  if (r.top < viewportTop) dy = viewportTop - r.top + 12;
  if (r.bottom > viewportBottom) dy = -(r.bottom - viewportBottom + 12);
  if (dx || dy) {
    const curLeft = Number(tokenMiniEl.style.left.replace('px','')) || left;
    const curTop = Number(tokenMiniEl.style.top.replace('px','')) || top;
    tokenMiniEl.style.left = `${curLeft + dx}px`;
    tokenMiniEl.style.top = `${curTop + dy}px`;
  }
}


function refreshOpenTokenMini() {
  if (!tokenMiniEl || !tokenMiniPlayerId) return;
  const tokenEl = playerElements.get(String(tokenMiniPlayerId || ''));
  if (!tokenEl || tokenEl.style.display === 'none') {
    closeTokenMini();
    return;
  }
  positionTokenMini(tokenEl);
}

try { window.refreshOpenTokenMini = refreshOpenTokenMini; } catch {}

function openTokenMini(playerId) {
  const p = players.find(pp => String(pp?.id) === String(playerId));
  if (!p) return;

  // No mini popup for users without access
  try {
    if (typeof canViewSensitiveInfo === 'function' && !canViewSensitiveInfo(p)) return;
  } catch {}
  const tokenEl = playerElements.get(p.id);
  if (!tokenEl || tokenEl.style.display === 'none') return;

  // toggle
  if (tokenMiniEl && tokenMiniPlayerId === p.id) {
    closeTokenMini();
    return;
  }
  closeTokenMini();

  const q = getQuickSheetStats(p);
  const maxHp = (q.hpMax !== null ? q.hpMax : 0);
  const curHp = (q.hpCur !== null ? q.hpCur : maxHp);
  const sheetForMini = getTokenMiniSheet(p);
  const combatSummary = getTokenMiniCombatSummary(sheetForMini);
  const spellsSummary = getTokenMiniSpellsSummary(sheetForMini);
  const canUseQuickPanels = canUseTokenMiniQuickPanels(p);

  const card = document.createElement('div');
  card.className = 'token-mini';
  card.dataset.sidePanel = '';
  card.innerHTML = `
    <div class="token-mini-main">
      <div class="title">${String(p.name || 'Персонаж')}</div>
      <div class="section">
        <div class="section-title">Здоровье</div>
        <div class="hp-fields">
          <label class="hp-field">
            <span>Тек.</span>
            <input type="number" class="hp-cur" min="0" max="999" value="${formatVal(curHp, 0)}" />
          </label>
          <label class="hp-field">
            <span>Макс.</span>
            <input type="number" class="hp-max" min="0" max="999" value="${formatVal(maxHp, 0)}" />
          </label>
        </div>
        <div class="hp-delta">
          <button type="button" class="hp-delta-btn hp-delta-minus">−</button>
          <input type="number" class="hp-delta-val" min="0" max="999" value="0" />
          <button type="button" class="hp-delta-btn hp-delta-plus">+</button>
        </div>
      </div>

      <div class="triple">
        <div class="mini-box"><span class="k">КД</span><span class="v">${formatVal(q.ac)}</span></div>
        <div class="mini-box"><span class="k">Скорость</span><span class="v">${formatVal(q.speed)}</span></div>
        <div class="mini-box"><span class="k">Уровень</span><span class="v">${formatVal(q.lvl)}</span></div>
      </div>

      <div class="section">
        <div class="section-title">Характеристики</div>
        <div class="stats-grid">
          <div class="stat-box"><span class="k">СИЛ</span><span class="v">${formatVal(q.stats.str)}</span></div>
          <div class="stat-box"><span class="k">ИНТ</span><span class="v">${formatVal(q.stats.int)}</span></div>
          <div class="stat-box"><span class="k">ЛОВ</span><span class="v">${formatVal(q.stats.dex)}</span></div>
          <div class="stat-box"><span class="k">МУД</span><span class="v">${formatVal(q.stats.wis)}</span></div>
          <div class="stat-box"><span class="k">ТЕЛ</span><span class="v">${formatVal(q.stats.con)}</span></div>
          <div class="stat-box"><span class="k">ХАР</span><span class="v">${formatVal(q.stats.cha)}</span></div>
        </div>
      </div>

      <button class="btn" type="button">Лист персонажа</button>
    </div>

    ${canUseQuickPanels ? `
      <div class="token-mini-side-buttons" aria-label="Быстрые разделы">
        <button type="button" class="token-mini-side-button token-mini-side-button--combat" data-mini-side-button="combat">
          <span class="token-mini-side-button__label">Оружие и способности</span>
          <span class="token-mini-side-button__icon" aria-hidden="true">⚔</span>
        </button>
        <button type="button" class="token-mini-side-button token-mini-side-button--spells" data-mini-side-button="spells">
          <span class="token-mini-side-button__label">Заклинания</span>
          <span class="token-mini-side-button__icon" aria-hidden="true">✦</span>
        </button>
      </div>

      <div class="token-mini-side-panel token-mini-side-panel--combat" data-mini-side-panel="combat">
        <div class="token-mini-side-header">Оружие и способности</div>
        ${renderTokenMiniCombatPanel(combatSummary, canUseQuickPanels)}
      </div>

      <div class="token-mini-side-panel token-mini-side-panel--spells" data-mini-side-panel="spells">
        <div class="token-mini-side-header">Заклинания</div>
        ${renderTokenMiniSpellsPanel(spellsSummary, canUseQuickPanels)}
      </div>
    ` : ''}
  `;

  // prevent board clicks
  card.addEventListener('mousedown', (e) => e.stopPropagation());
  card.addEventListener('click', (e) => e.stopPropagation());

  const hpCurInput = card.querySelector('.hp-cur');
  const hpMaxInput = card.querySelector('.hp-max');
  const hpDeltaInput = card.querySelector('.hp-delta-val');
  const hpDeltaMinus = card.querySelector('.hp-delta-minus');
  const hpDeltaPlus = card.querySelector('.hp-delta-plus');
  const sheetBtn = card.querySelector('.btn');
  const sideButtons = Array.from(card.querySelectorAll('[data-mini-side-button]'));
  const canEditHp = canEditTokenMiniSheet(p);
  const currentSheetForMini = () => {
    const curPlayer = players.find(pp => String(pp?.id) === String(p?.id)) || p;
    return curPlayer?.sheet?.parsed || null;
  };
  const bindMiniCombatButtons = () => {
    card.querySelectorAll('[data-mini-weapon-roll-atk]').forEach((btn) => {
      btn.onclick = () => rollTokenMiniWeapon(p, Math.max(0, safeNum(btn.getAttribute('data-mini-weapon-roll-atk'), 0) ?? 0), 'atk');
    });
    card.querySelectorAll('[data-mini-weapon-roll-dmg]').forEach((btn) => {
      btn.onclick = () => rollTokenMiniWeapon(p, Math.max(0, safeNum(btn.getAttribute('data-mini-weapon-roll-dmg'), 0) ?? 0), 'dmg');
    });
    card.querySelectorAll('[data-mini-power-roll]').forEach((btn) => {
      btn.onclick = () => {
        const [defId = '', subId = ''] = String(btn.getAttribute('data-mini-power-roll') || '').split('::');
        const used = useTokenMiniPower(p, defId, subId, 'roll');
        if (!used) return;
        renderMiniCombatPanel();
        positionTokenMini(tokenEl);
      };
    });
    card.querySelectorAll('[data-mini-power-action]').forEach((btn) => {
      btn.onclick = () => {
        const [defId = '', subId = ''] = String(btn.getAttribute('data-mini-power-action') || '').split('::');
        const used = useTokenMiniPower(p, defId, subId, 'action');
        if (!used) return;
        renderMiniCombatPanel();
        positionTokenMini(tokenEl);
      };
    });
    updateTokenMiniPowerButtonsState(card, players.find(pp => String(pp?.id) === String(p?.id)) || p);
  };
  const renderMiniCombatPanel = () => {
    const current = players.find(pp => String(pp?.id) === String(p?.id)) || p;
    const panel = card.querySelector('[data-mini-side-panel="combat"]');
    if (!panel) return;
    panel.innerHTML = `
      <div class="token-mini-side-header">Оружие и способности</div>
      ${renderTokenMiniCombatPanel(getTokenMiniCombatSummary(getTokenMiniSheet(current)), canUseTokenMiniQuickPanels(current))}
    `;
    bindMiniCombatButtons();
  };
  const bindMiniSpellButtons = () => {
    card.querySelectorAll('[data-mini-spell-cast]').forEach((btn) => {
      btn.onclick = () => {
        const row = btn.closest('[data-mini-spell-row]');
        if (!row) return;
        const lvl = Math.max(0, safeNum(row.getAttribute('data-spell-level'), 0) ?? 0);
        const href = String(row.getAttribute('data-spell-href') || '').trim();
        const spellName = String(row.getAttribute('data-spell-name') || '').trim();
        const used = useTokenMiniSpell(p, lvl, href, spellName);
        if (!used) return;
        renderMiniSpellsPanel();
        positionTokenMini(tokenEl);
      };
    });
    updateTokenMiniSpellButtonsState(card, players.find(pp => String(pp?.id) === String(p?.id)) || p);
  };
  const renderMiniSpellsPanel = () => {
    const current = players.find(pp => String(pp?.id) === String(p?.id)) || p;
    const panel = card.querySelector('[data-mini-side-panel="spells"]');
    if (!panel) return;
    panel.innerHTML = `
      <div class="token-mini-side-header">Заклинания</div>
      ${renderTokenMiniSpellsPanel(getTokenMiniSpellsSummary(getTokenMiniSheet(current)), canUseTokenMiniQuickPanels(current))}
    `;
    bindMiniSpellButtons();
  };

  [hpCurInput, hpMaxInput, hpDeltaInput, hpDeltaMinus, hpDeltaPlus].forEach((el) => {
    if (!el) return;
    el.disabled = !canEditHp;
  });
  if (!canEditHp) {
    try {
      hpCurInput?.setAttribute('title', 'Можно менять только своих персонажей');
      hpMaxInput?.setAttribute('title', 'Можно менять только своих персонажей');
      hpDeltaInput?.setAttribute('title', 'Можно менять только своих персонажей');
      hpDeltaMinus?.setAttribute('title', 'Можно менять только своих персонажей');
      hpDeltaPlus?.setAttribute('title', 'Можно менять только своих персонажей');
    } catch {}
  }

  const applyHp = () => {
    if (!canEditHp) return;
    const cur = safeNum(hpCurInput?.value, 0) ?? 0;
    const max = safeNum(hpMaxInput?.value, 0) ?? 0;
    upsertSheetNumber(p, 'vitality.hp-max', Math.max(0, max));
    upsertSheetNumber(p, 'vitality.hp-current', Math.max(0, Math.min(Math.max(0, max), cur)));
    try {
      const sh = currentSheetForMini();
      if (sh) syncDeathSavesForCurrentHp(sh);
    } catch {}
    // сразу обновим полоску
    updateHpBar(p, tokenEl);
  };

  // Instant feedback while typing; network update is debounced in upsertSheetNumber.
  hpCurInput?.addEventListener('input', applyHp);
  hpMaxInput?.addEventListener('input', applyHp);
  hpCurInput?.addEventListener('change', applyHp);
  hpMaxInput?.addEventListener('change', applyHp);

  const applyDelta = (sign) => {
    if (!canEditHp) return;
    const delta = safeNum(hpDeltaInput?.value, 0) ?? 0;
    if (!delta) return;

    const cur = safeNum(hpCurInput?.value, 0) ?? 0;
    const max = safeNum(hpMaxInput?.value, 0) ?? 0;

    // If taking damage and temp HP exists: subtract temp first, then current HP.
    if (sign < 0) {
      let dmg = Math.max(0, delta);
      let temp = 0;
      try {
        const sh = (typeof getTokenSheetSafe === 'function') ? getTokenSheetSafe(p) : (p?.sheet || {});
        temp = safeNum(getFrom(sh, 'vitality.hp-temp.value', 0), 0) ?? 0;
      } catch {}

      try {
        const sh0 = currentSheetForMini();
        if (sh0) clearStabilizedIfDamagedAtZero(sh0);
      } catch {}
      if (temp > 0 && dmg > 0) {
        const used = Math.min(temp, dmg);
        temp = Math.max(0, temp - used);
        dmg = Math.max(0, dmg - used);
        upsertSheetNumber(p, 'vitality.hp-temp', temp);
      }

      const nextHp = cur - dmg;
      const clamped = Math.max(0, Math.min(Math.max(0, max), nextHp));
      if (hpCurInput) hpCurInput.value = String(clamped);
      applyHp();
      return;
    }

    // Healing: affects current HP only (temp HP unchanged)
    const next = cur + delta;
    const clamped = Math.max(0, Math.min(Math.max(0, max), next));
    if (hpCurInput) hpCurInput.value = String(clamped);
    applyHp();
  };

  hpDeltaMinus?.addEventListener('click', () => applyDelta(-1));
  hpDeltaPlus?.addEventListener('click', () => applyDelta(1));

  sideButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      toggleTokenMiniSidePanel(card, btn.getAttribute('data-mini-side-button') || '');
      positionTokenMini(tokenEl);
    });
  });

  bindMiniCombatButtons();
  bindMiniSpellButtons();

  sheetBtn?.addEventListener('click', () => {
    // extra safety
    try {
      if (typeof canViewSensitiveInfo === 'function' && !canViewSensitiveInfo(p)) return;
    } catch {}
    closeTokenMini();
    window.InfoModal?.open?.(p);
  });

  document.body.appendChild(card);
  tokenMiniEl = card;
  tokenMiniPlayerId = p.id;
  // position after append (so size is known)
  positionTokenMini(tokenEl);
}

// close mini on outside click / Esc
document.addEventListener('mousedown', (e) => {
  if (!tokenMiniEl) return;
  if (e.target && tokenMiniEl.contains(e.target)) return;
  closeTokenMini();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeTokenMini();
});

// ================== PLAYER POSITION ==================
// Exploration discovery memory for GM-created non-allies.
// Non-GM (and GM in "Как у игрока") will see such tokens only when their vision reveals the cell.
// After discovery, token remains at last known position until rediscovered.
window._fogLastKnown = window._fogLastKnown || new Map();

// Helpers used by exploration discovery.
function getOwnerRoleForToken(p) {
  const direct = String(p?.ownerRole || '').trim();
  if (direct) return direct;
  try {
    // message-ui.js maintains usersById (Map) in this project
    if (typeof usersById !== 'undefined' && p?.ownerId) {
      const u = usersById.get(String(p.ownerId));
      return String(u?.role || '').trim();
    }
  } catch {}
  return '';
}

function getCurrentMapIdSafe() {
  try {
    if (typeof lastState !== 'undefined' && lastState) {
      return String(lastState.activeMapId || lastState.mapId || lastState.currentMapId || 'map');
    }
  } catch {}
  return 'map';
}

// ================== TOKEN PORTRAIT HELPERS ==================
function getTokenSheetSafe(p) {
  try {
    if (p?.sheet?.parsed) return p.sheet.parsed;
    if (p?.sheet && typeof p.sheet === 'object') return p.sheet;
  } catch {}
  return null;
}

function getTokenBaseImageUrl(p) {
  // Prefer explicit appearanceBaseUrl if present
  try {
    const direct = String(p?.appearanceBaseUrl || '').trim();
    if (direct) return direct;
  } catch {}

  const sheet = getTokenSheetSafe(p);
  if (sheet) {
    try {
      const override = String(sheet?.appearance?.baseUrl || '').trim();
      if (override) return override;

      const race = String(sheet?.info?.race?.value || '').trim();
      const genderRaw = String(sheet?.notes?.details?.gender?.value || '').trim().toLowerCase();
      const gender = (genderRaw.startsWith('ж') || genderRaw === 'female' || genderRaw === 'f') ? 'female' : 'male';
      if (race) return `assets/base/${race}/${gender}.png`;
    } catch {}
  }

  // Fallback: if player has race/gender fields directly
  try {
    const race = String(p?.race || '').trim();
    const gender = String(p?.gender || '').trim().toLowerCase();
    const g = (gender.startsWith('ж') || gender === 'female' || gender === 'f') ? 'female' : 'male';
    if (race) return `assets/base/${race}/${g}.png`;
  } catch {}
  return '';
}

const CONDITION_ICON_MAP = {
  "Ослеплённое": "👁",
  "Заворожённое": "✨",
  "Оглохшее": "🔇",
  "Испуганное": "⚠",
  "Схваченное": "✋",
  "Недееспособное": "⛔",
  "Невидимое": "👻",
  "Парализованное": "⚡",
  "Окаменевшее": "🗿",
  "Отравленное": "☠",
  "Распластанное": "↧",
  "Обездвиженное": "⛓",
  "Оглушенное": "💫",
  "Без сознания": "😴"
};

function parseTokenConditionsList(sheet) {
  if (!sheet || typeof sheet !== 'object') return [];
  const rawList = Array.isArray(sheet.conditionsList) ? sheet.conditionsList : null;
  const src = rawList && rawList.length ? rawList : String(sheet.conditions || '').split(',');
  return Array.from(new Set((Array.isArray(src) ? src : [])
    .map(x => String(x || '').trim())
    .filter(Boolean)));
}

function getConditionIcon(name) {
  const key = String(name || '').trim();
  return CONDITION_ICON_MAP[key] || '•';
}
window.getConditionIcon = getConditionIcon;

function canShowTokenConditionIndicators(player) {
  if (!player) return false;
  try {
    if (String(myRole || '') === 'GM') return true;
  } catch {}
  if (String(player.ownerId || '') === String(myId || '')) return true;
  if (player.isAlly) return true;

  const ownerRole = getOwnerRoleForToken(player);
  if (ownerRole === 'GM') {
    return !!player.isPublic;
  }
  return true;
}

function updateTokenConditionIndicators(player, tokenEl) {
  const pid = String(player?.id || '');
  if (!pid || !tokenEl) return;

  try {
    if (!canShowTokenConditionIndicators(player)) {
      const existing = tokenEl.querySelector('.token-statuses');
      if (existing) existing.remove();
      return;
    }
  } catch {}

  const sheet = getTokenSheetSafe(player) || {};
  const list = parseTokenConditionsList(sheet);

  let wrap = tokenEl.querySelector('.token-statuses');
  if (!list.length) {
    if (wrap) wrap.remove();
    return;
  }

  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'token-statuses';
    tokenEl.appendChild(wrap);
  }

  const tooltipRows = list.map(name => `
    <div class="token-statuses__tiprow">
      <span class="token-statuses__tipicon" aria-hidden="true">${getConditionIcon(name)}</span>
      <span class="token-statuses__tipname">${escapeHtml(name)}</span>
    </div>
  `).join('');

  wrap.innerHTML = `
    <div class="token-statuses__list">
      ${list.map(name => `<span class="token-status-item" title="${escapeHtml(name)}">${getConditionIcon(name)}</span>`).join('')}
    </div>
    <div class="token-statuses__tooltip" role="tooltip">${tooltipRows}</div>
  `;
}

function updateTokenCombatActions(player, tokenEl) {
  if (!player || !tokenEl) return;

  let wrap = tokenEl.querySelector('.token-combat-actions');
  const isSelected = !!selectedPlayer && String(selectedPlayer?.id || '') === String(player?.id || '');
  const canDash = !!window.canUseCombatDashAction?.(player);
  const dashActive = !!window.isCombatDashActiveForPlayer?.(player);

  if (!isSelected || !canDash) {
    if (wrap) wrap.remove();
    return;
  }

  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'token-combat-actions';
    tokenEl.appendChild(wrap);
  }

  wrap.innerHTML = `
    <button type="button" class="token-combat-action ${dashActive ? 'is-active' : ''}" data-token-action="dash" aria-label="Рывок" title="Рывок">
      <span class="token-combat-action__icon" aria-hidden="true">${TOKEN_DASH_SVG}</span>
      <span class="token-combat-action__label">Рывок</span>
    </button>
  `;

  const btn = wrap.querySelector('[data-token-action="dash"]');
  if (btn) {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { window.activateCombatDashForPlayer?.(player); } catch {}
      try { window.syncSelectedPlayerUi?.(); } catch {}
      try { window.renderCombatMoveOverlay?.(); } catch {}
    });
  }
}
window.updateTokenCombatActions = updateTokenCombatActions;

window.refreshPlayerConditionIndicators = function (playerId) {
  try {
    const pid = String(playerId || '');
    if (!pid) return;
    const player = (Array.isArray(players) ? players : []).find(p => String(p?.id || '') === pid);
    if (!player) return;
    const el = playerElements.get(pid) || player.element;
    if (!el) return;
    updateTokenConditionIndicators(player, el);
  } catch {}
};

function getTokenDisplaySettings(p) {
  const sheet = getTokenSheetSafe(p);
  const t = sheet?.appearance?.token || p?.appearance?.token || p?.token || null;
  const mode = String(t?.mode || p?.tokenMode || '').trim() || 'crop';
  const crop = (t?.crop && typeof t.crop === 'object') ? t.crop : {};
  const x = Math.max(0, Math.min(100, Number(crop.x ?? 50) || 50));
  const y = Math.max(0, Math.min(100, Number(crop.y ?? 35) || 35));
  const zoom = Math.max(80, Math.min(220, Number(crop.zoom ?? 140) || 140));
  return { mode, x, y, zoom };
}

function applyTokenVisual(el, player) {
  if (!el || !player) return;
  const { mode, x, y, zoom } = getTokenDisplaySettings(player);
  const src = getTokenBaseImageUrl(player);

  // Border always uses player color
  const borderColor = String(player.color || '#888');
  el.style.borderColor = borderColor;

  if (mode === 'color' || !src) {
    el.style.backgroundImage = 'none';
    el.style.backgroundColor = borderColor;
    el.style.backgroundSize = '';
    el.style.backgroundPosition = '';
    el.style.backgroundRepeat = '';
    return;
  }

  el.style.backgroundColor = 'transparent';
  el.style.backgroundImage = `url("${src}")`;
  el.style.backgroundRepeat = 'no-repeat';
  if (mode === 'full') {
    el.style.backgroundSize = 'contain';
    el.style.backgroundPosition = 'center center';
  } else {
    el.style.backgroundSize = `${zoom}%`;
    el.style.backgroundPosition = `${x}% ${y}%`;
  }
}

function setPlayerPosition(player) {
  let el = playerElements.get(player.id);

  if (!el) {
    el = document.createElement('div');
    el.classList.add('player');
    // Имя и иконки состояний внутри токена
    el.innerHTML = `<span class="token-label"></span><div class="token-statuses"></div>`;
    const lbl0 = el.querySelector('.token-label');
    if (lbl0) lbl0.textContent = String(player.name || '?');
    // Default fill; may be overridden by token portrait settings.
    el.style.backgroundColor = player.color;
    el.style.position = 'absolute';

    // IMPORTANT: не замыкаем "player" из первой отрисовки —
    // при обновлениях state объекты игроков пересоздаются, и старый объект становится "устаревшим".
    // Это ломало выбор/движение (у пользователей переставало двигаться после пары ходов).
    const pid = String(player.id);

    el.addEventListener('mousedown', () => {
      const cur = players.find(pp => String(pp?.id) === pid) || player;

      // Fog of war: disallow selecting hidden tokens for non-GM
      try {
        if (window.FogWar?.isEnabled?.() && !window.FogWar?.canInteractWithToken?.(cur)) return;
      } catch {}

      // If this is a "ghost" (last known) token in exploration, do not allow selecting it.
      try {
        if (String(el?.dataset?.fogGhost || '') === '1') return;
      } catch {}

      if (!editEnvironment) {
        const restricted = !!window.isCombatRestrictedSelection?.(cur);
        if (!restricted) {
          try {
            const phaseNow = String(lastState?.phase || '');
            const mine = String(cur?.ownerId || '') === String(myId || '');
            const isCurrent = String(cur?.id || '') === String(lastState?.turnOrder?.[lastState?.currentTurnIndex] || '');
            if (phaseNow === 'combat' && String(myRole || '') !== 'GM' && mine && !isCurrent) {
              return;
            }
          } catch {}
        }

        selectedPlayer = cur;
        try { window.syncSelectedPlayerUi?.(); } catch {}
        try { window.updateMovePreview?.(); } catch {}
        try { window.renderCombatMoveOverlay?.(); } catch {}
      }
    });

    // двойной клик — мини-окно со статами
    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();

      const cur = players.find(pp => String(pp?.id) === pid) || player;

      // If token is selected, unselect it to prevent accidental move on board click.
      try {
        if (selectedPlayer && String(selectedPlayer.id) === pid) {
          selectedPlayer = null;
          try { window.syncSelectedPlayerUi?.(); } catch {}
          try { window.hideMovePreview?.(); } catch {}
          try { window.hideCombatMoveOverlay?.(); } catch {}
        }
      } catch {}
      // block for GM-created public NPCs
      try {
        if (typeof canViewSensitiveInfo === 'function' && !canViewSensitiveInfo(cur)) return;
      } catch {}
      openTokenMini(cur.id);
    });

    board.appendChild(el);
    playerElements.set(player.id, el);
    player.element = el;
  }

  // Update full name label
  const lbl = el.querySelector('.token-label');
  if (lbl) lbl.textContent = String(player.name || '?');
  // Tooltip with full name on hover
  try { el.title = String(player.name || ''); } catch {}
  // Apply portrait / color mode
  try { applyTokenVisual(el, player); } catch {}
  try { updateTokenConditionIndicators(player, el); } catch {}
  try { updateTokenCombatActions(player, el); } catch {}
  try {
    const ownerRole = getOwnerRoleForToken(player);
    const gmCanSeeHidden = String(myRole || '') === 'GM' && String(lastState?.fog?.gmViewMode || 'gm') !== 'player';
    const dimHiddenEnemy = gmCanSeeHidden && ownerRole === 'GM' && !!player?.isEnemy && !player?.isPublic;
    el.classList.toggle('player--gm-hidden', !!dimHiddenEnemy);
  } catch {}
  el.style.width = `${player.size * 50}px`;
  el.style.height = `${player.size * 50}px`;

  // ================== Visibility / discovery rules for exploration ==================
  // Treat GM in "Как у игрока" the same as a normal player.
  const st = (typeof lastState !== 'undefined') ? lastState : null;
  const fog = st?.fog || {};
  const phase = String(st?.phase || '').trim();
  const asPlayerView = (String(myRole || '') !== 'GM') || (String(myRole || '') === 'GM' && String(fog.gmViewMode || 'gm') === 'player');
  const ownerRole = getOwnerRoleForToken(player);
  const isGmHidden = (ownerRole === 'GM' && !player.isAlly);
  const curMapId = String(st?.currentMapId || '').trim();
  const pidMap = String(player?.mapId || '').trim();

  if (player?.isEnemy && pidMap && curMapId && pidMap !== curMapId) {
    el.style.display = 'none';
    updateHpBar(player, el);
    return;
  }

  // ================== GM "eye" visibility ==================
  // If GM has hidden a GM-owned non-ally token (eye OFF), non-GM users must NEVER see it.
  // Previously, token movement could briefly render the element before other UI updates hid it.
  // Fix: enforce the visibility rule directly in setPlayerPosition before we set display/coords.
  if (asPlayerView && isGmHidden && !player.isPublic) {
    // If token is selected locally (shouldn't happen for players), clear selection.
    try {
      if (selectedPlayer && String(selectedPlayer.id) === String(player.id)) {
        selectedPlayer = null;
        try { window.syncSelectedPlayerUi?.(); } catch {}
        try { window.hideCombatMoveOverlay?.(); } catch {}
      }
    } catch {}
    el.style.display = 'none';
    updateHpBar(player, el);
    return;
  }

  // Reset ghost flag by default
  try { el.dataset.fogGhost = ''; } catch {}

  // In exploration phase: GM-created non-allies are "discoverable" by vision.
  // They are not shown until the cell becomes visible, then persist as last known.
  if (asPlayerView && isGmHidden && phase === 'exploration' && window.FogWar?.isEnabled?.() && String(fog.mode || '') === 'dynamic') {
    // If token not placed, hide
    if (player.x === null || player.y === null) {
      el.style.display = 'none';
      updateHpBar(player, el);
      return;
    }

    const size = Math.max(1, Number(player?.size) || 1);

    // In exploration, discovery depends ONLY on dynamic vision (manual reveal should NOT auto-detect hidden GM tokens).
    // IMPORTANT: for large tokens, ANY occupied cell being in vision counts as discovery/visibility.
    const isAnyCellVisibleDynamicOnly = (px, py, ps) => {
      const sx = Number(px) || 0;
      const sy = Number(py) || 0;
      const ss = Math.max(1, Number(ps) || 1);
      for (let dy = 0; dy < ss; dy++) {
        for (let dx = 0; dx < ss; dx++) {
          if (window.FogWar?.isCellVisibleDynamicOnly?.(sx + dx, sy + dy)) return true;
        }
      }
      return false;
    };

    const visibleNow = isAnyCellVisibleDynamicOnly(player.x, player.y, size);

    const mapId = getCurrentMapIdSafe();
    const key = `${mapId || 'map'}:${String(player.id)}`;
    if (visibleNow) {
      window._fogLastKnown.set(key, { x: Number(player.x) || 0, y: Number(player.y) || 0 });
    }

    const known = window._fogLastKnown.get(key);
    // If players can currently SEE the last-known cell (dynamic vision), but the token isn't there anymore,
    // then the "ghost" must disappear (they verify it's gone).
    if (!visibleNow && known) {
      const lastCellVisibleNow = isAnyCellVisibleDynamicOnly(known.x, known.y, size);
      const tokenStillOnLastKnown = (Number(player.x) === Number(known.x) && Number(player.y) === Number(known.y));
      if (lastCellVisibleNow && !tokenStillOnLastKnown) {
        window._fogLastKnown.delete(key);
        el.style.display = 'none';
        updateHpBar(player, el);
        return;
      }
    }
    if (!visibleNow && !known) {
      // not discovered yet
      el.style.display = 'none';
      updateHpBar(player, el);
      return;
    }

    // render at real position if visible; otherwise at last known
    if (!visibleNow && known) {
      try { el.dataset.fogGhost = '1'; } catch {}
      player = Object.assign({}, player, { x: known.x, y: known.y });
    }
  }

  if (player.x === null || player.y === null) {
    el.style.display = 'none';
    updateHpBar(player, el);
    return;
  }
  el.style.display = 'flex';

  const maxX = boardWidth - player.size;
  const maxY = boardHeight - player.size;
  const x = Math.min(Math.max(player.x, 0), maxX);
  const y = Math.min(Math.max(player.y, 0), maxY);

  const cell = board.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
  if (cell) {
    el.style.left = `${cell.offsetLeft}px`;
    el.style.top = `${cell.offsetTop}px`;
  }

  updateHpBar(player, el);
  if (tokenMiniEl && tokenMiniPlayerId === player.id) {
    positionTokenMini(el);
  }
}

// ================== NO-OVERLAP HELPERS (CLIENT SIDE) ==================
function rectsOverlap(ax, ay, as, bx, by, bs) {
  return ax < (bx + bs) && (ax + as) > bx && ay < (by + bs) && (ay + as) > by;
}

function isAreaBlockedByWallClient(x, y, size) {
  try {
    const st = (typeof lastState !== 'undefined') ? lastState : null;
    const walls = Array.isArray(st?.walls) ? st.walls : [];
    if (!walls.length) return false;
    // Any overlap with a wall cell blocks (for non-GM).
    for (const w of walls) {
      const wx = Number(w?.x), wy = Number(w?.y);
      if (!Number.isFinite(wx) || !Number.isFinite(wy)) continue;
      if (wx >= x && wx < x + size && wy >= y && wy < y + size) return true;
    }
  } catch {}
  return false;
}

function isAreaFreeClient(ignoreId, x, y, size, opts = {}) {
  const allowWalls = !!opts.allowWalls;
  if (!allowWalls) {
    if (isAreaBlockedByWallClient(x, y, size)) return false;
  }
  for (const other of players) {
    if (!other) continue;
    if (ignoreId && other.id === ignoreId) continue;
    if (other.x === null || other.y === null) continue;
    const os = Number(other.size) || 1;
    if (rectsOverlap(x, y, size, other.x, other.y, os)) return false;
  }
  return true;
}

function findFirstFreeSpotClient(size) {
  // По запросу: ограничения на постановку на стены убраны — теперь можно всем.
  const allowWalls = true;
  const maxX = boardWidth - size;
  const maxY = boardHeight - size;
  for (let y = 0; y <= maxY; y++) {
    for (let x = 0; x <= maxX; x++) {
      if (isAreaFreeClient(null, x, y, size, { allowWalls })) return { x, y };
    }
  }
  return null;
}

// ================== ADD PLAYER ==================
addPlayerBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  if (!name) return alert("Введите имя");
  const gmCreating = String(myRole || '') === 'GM';
  const isAlly = !!isAllyCheckbox?.checked;
  const isEnemy = gmCreating ? (!isAllyCheckbox?.checked || !!isEnemyCheckbox?.checked) : !!isEnemyCheckbox?.checked;

  const playerId = (crypto?.randomUUID ? crypto.randomUUID() : (`p-${Date.now()}-${Math.random().toString(16).slice(2)}`));
  const player = {
    id: playerId,
    name,
    color: playerColorInput.value,
    size: parseInt(playerSizeInput.value, 10),
    isBase: !!isBaseCheckbox?.checked,
    isAlly,
    isEnemy
  };

  try {
    window.__pendingCreatedPlayerPlacement = {
      id: playerId,
      createdAt: Date.now()
    };
  } catch {}
  sendMessage({ type: 'addPlayer', player });

  playerNameInput.value = '';
  if (isBaseCheckbox && !isBaseCheckbox.disabled) isBaseCheckbox.checked = false;
});

// ================== COMBAT MOVE BUDGET ==================
(function wireCombatMoveBudget() {
  const CELL = 50;
  const DEFAULT_SPEED = 30;
  const DIRS = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1]
  ];

  function getTurnKey(state) {
    const phase = String(state?.phase || '');
    const room = String((typeof currentRoomId !== 'undefined' && currentRoomId) ? currentRoomId : '');
    const round = Number(state?.round) || 1;
    const idx = Number(state?.currentTurnIndex) || 0;
    const actorId = String(state?.turnOrder?.[idx] || '');
    return `${room}|${phase}|${round}|${idx}|${actorId}`;
  }

  function isCombatPhase() {
    try { return String(lastState?.phase || '') === 'combat'; } catch { return false; }
  }

  function isInitiativePhase() {
    try { return String(lastState?.phase || '') === 'initiative'; } catch { return false; }
  }

  function canUseSpellActionsPhase() {
    try {
      const phase = String(lastState?.phase || '').trim();
      return phase !== 'initiative';
    } catch {
      return true;
    }
  }

  function isGmNow() {
    try { return String(myRole || '') === 'GM'; } catch { return false; }
  }

  function getCurrentTurnActorId() {
    try {
      const st = lastState;
      if (String(st?.phase || '') !== 'combat') return '';
      return String(st?.turnOrder?.[st?.currentTurnIndex] || '');
    } catch {
      return '';
    }
  }

  function getPlayerSpeedFeet(player) {
    try {
      const rawValue = player?.sheet?.parsed?.vitality?.speed?.value;
      if (rawValue !== null && typeof rawValue !== 'undefined' && String(rawValue).trim() !== '') {
        const raw = Number(rawValue);
        if (Number.isFinite(raw)) return Math.max(0, Math.trunc(raw));
      }
    } catch {}
    return DEFAULT_SPEED;
  }

  function getFeetPerCell() {
    try {
      return Math.max(1, Math.min(100, Number(lastState?.cellFeet) || 10));
    } catch {
      return 10;
    }
  }

  function ensureStore() {
    if (!window.__combatMoveBudgetStore || typeof window.__combatMoveBudgetStore !== 'object') {
      window.__combatMoveBudgetStore = new Map();
    }
    return window.__combatMoveBudgetStore;
  }

  function clearPlayerSelectionVisual(pid) {
    try {
      const el = playerElements?.get?.(String(pid || ''));
      if (el) el.classList.remove('selected');
      try { window.syncSelectedPlayerUi?.(); } catch {}
    } catch {}
  }

  function getLivePlayer(playerOrId) {
    const pid = typeof playerOrId === 'object' ? String(playerOrId?.id || '') : String(playerOrId || '');
    if (!pid) return null;
    return players.find(pp => String(pp?.id) === pid) || (typeof playerOrId === 'object' ? playerOrId : null);
  }

  function getTracker(player, { create = true } = {}) {
    if (!player || isInitiativePhase()) return null;
    const pid = String(player.id || '');
    if (!pid) return null;

    const store = ensureStore();
    const turnKey = getTurnKey(lastState || {});
    let rec = store.get(pid) || null;

    const px = Number(player?.x);
    const py = Number(player?.y);
    const baseX = Number.isFinite(px) ? px : 0;
    const baseY = Number.isFinite(py) ? py : 0;

    if (!create) {
      if (!rec || rec.turnKey !== turnKey) return null;
      return rec;
    }

    if (!rec || rec.turnKey !== turnKey) {
      rec = {
        turnKey,
        originX: baseX,
        originY: baseY,
        currentX: baseX,
        currentY: baseY,
        spentFeet: 0,
        totalFeet: getPlayerSpeedFeet(player),
        dashUsed: false,
        dashActive: false,
        teleportAvailable: false,
        teleportRangeFeet: 0,
        teleportUsed: false,
        teleportActive: false,
        teleportSourceKind: '',
        teleportSourceId: '',
        teleportSourceName: ''
      };
      store.set(pid, rec);
      return rec;
    }

    rec.totalFeet = getPlayerSpeedFeet(player);

    if (Number.isFinite(px) && Number.isFinite(py)) {
      const posChangedExternally = (px !== rec.currentX || py !== rec.currentY);
      if (posChangedExternally) {
        rec.currentX = px;
        rec.currentY = py;
      }
    }

    return rec;
  }

  function isRestrictedForPlayer(player) {
    try {
      if (!player || !isCombatPhase() || isGmNow()) return false;
      const mine = String(player?.ownerId || '') === String(myId || '');
      const currentId = getCurrentTurnActorId();
      return !!mine && !!currentId && String(player?.id || '') === currentId;
    } catch {
      return false;
    }
  }

  function dropSelectionIfInvalid() {
    try {
      if (!selectedPlayer) return;
      if (isGmNow() || !isCombatPhase()) return;
      const cur = getLivePlayer(selectedPlayer) || selectedPlayer;
      const hasTeleport = !!getTeleportInfo(cur);
      if (hasTeleport) return;
      if (!isRestrictedForPlayer(cur)) {
        selectedPlayer = null;
        clearPlayerSelectionVisual(cur?.id);
        try { window.syncSelectedPlayerUi?.(); } catch {}
      }
    } catch {}
  }

  function getRemainingFeet(player) {
    const rec = getTracker(player, { create: true });
    if (!rec) return Infinity;
    return Math.max(0, (Number(rec.totalFeet) || 0) - (Number(rec.spentFeet) || 0));
  }

  function chebyshevSteps(ax, ay, bx, by) {
    return Math.max(Math.abs((Number(ax) || 0) - (Number(bx) || 0)), Math.abs((Number(ay) || 0) - (Number(by) || 0)));
  }

  function getWallsSet() {
    const set = new Set();
    const walls = Array.isArray(lastState?.walls) ? lastState.walls : [];
    for (const w of walls) {
      const x = Number(w?.x);
      const y = Number(w?.y);
      const dir = String(w?.dir || '').toUpperCase();
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (dir !== 'N' && dir !== 'E' && dir !== 'S' && dir !== 'W') continue;
      set.add(`${x},${y},${dir}`);
    }
    return set;
  }

  function hasWallOnEdge(wallsSet, x, y, dir) {
    return wallsSet.has(`${x},${y},${dir}`);
  }

  function buildWallLosEdgeSet() {
    const edgeSet = new Set();
    const walls = Array.isArray(lastState?.walls) ? lastState.walls : [];
    const keyBetween = (ax, ay, bx, by) => {
      if (ax > bx || (ax === bx && ay > by)) {
        const tx = ax, ty = ay;
        ax = bx; ay = by;
        bx = tx; by = ty;
      }
      return `${ax},${ay}|${bx},${by}`;
    };
    for (const w of walls) {
      const x = Number(w?.x);
      const y = Number(w?.y);
      const dir = String(w?.dir || '').toUpperCase();
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (dir === 'N') edgeSet.add(keyBetween(x, y - 1, x, y));
      else if (dir === 'S') edgeSet.add(keyBetween(x, y, x, y + 1));
      else if (dir === 'W') edgeSet.add(keyBetween(x - 1, y, x, y));
      else if (dir === 'E') edgeSet.add(keyBetween(x, y, x + 1, y));
    }
    return edgeSet;
  }

  function hasLineOfSightCellsLocal(x0, y0, x1, y1, edgeSet) {
    if (!edgeSet || !edgeSet.size) return true;
    if (x0 === x1 && y0 === y1) return true;

    const keyBetween = (ax, ay, bx, by) => {
      if (ax > bx || (ax === bx && ay > by)) {
        const tx = ax, ty = ay;
        ax = bx; ay = by;
        bx = tx; by = ty;
      }
      return `${ax},${ay}|${bx},${by}`;
    };
    const blocked = (ax, ay, bx, by) => edgeSet.has(keyBetween(ax, ay, bx, by));

    const ox = x0 + 0.5;
    const oy = y0 + 0.5;
    const tx = x1 + 0.5;
    const ty = y1 + 0.5;
    const dx = tx - ox;
    const dy = ty - oy;

    const stepX = dx >= 0 ? 1 : -1;
    const stepY = dy >= 0 ? 1 : -1;

    const tDeltaX = (dx === 0) ? Infinity : Math.abs(1 / dx);
    const tDeltaY = (dy === 0) ? Infinity : Math.abs(1 / dy);

    let cx = x0;
    let cy = y0;

    const nextV = (stepX > 0) ? (Math.floor(ox) + 1) : Math.floor(ox);
    const nextH = (stepY > 0) ? (Math.floor(oy) + 1) : Math.floor(oy);
    let tMaxX = (dx === 0) ? Infinity : Math.abs((nextV - ox) / dx);
    let tMaxY = (dy === 0) ? Infinity : Math.abs((nextH - oy) / dy);

    const EPS = 1e-4;

    while (!(cx === x1 && cy === y1)) {
      if (Math.abs(tMaxX - tMaxY) < EPS) {
        const nx = cx + stepX;
        const ny = cy + stepY;
        if (blocked(cx, cy, nx, cy)) return false;
        if (blocked(cx, cy, cx, ny)) return false;
        if (blocked(nx, cy, nx, ny)) return false;
        if (blocked(cx, ny, nx, ny)) return false;
        cx = nx;
        cy = ny;
        tMaxX += tDeltaX;
        tMaxY += tDeltaY;
      } else if (tMaxX < tMaxY) {
        const nx = cx + stepX;
        if (blocked(cx, cy, nx, cy)) return false;
        cx = nx;
        tMaxX += tDeltaX;
      } else {
        const ny = cy + stepY;
        if (blocked(cx, cy, cx, ny)) return false;
        cy = ny;
        tMaxY += tDeltaY;
      }
    }

    return true;
  }

  function hasAnyTeleportLineOfSight(player, fromX, fromY, toX, toY, size) {
    if (isGmNow()) return true;
    const edgeSet = buildWallLosEdgeSet();
    if (!edgeSet.size) return true;

    const sx = Number(fromX) || 0;
    const sy = Number(fromY) || 0;
    const tx = Number(toX) || 0;
    const ty = Number(toY) || 0;
    const ps = Math.max(1, Number(size) || 1);

    for (let oy = 0; oy < ps; oy++) {
      for (let ox = 0; ox < ps; ox++) {
        const ax = sx + ox;
        const ay = sy + oy;
        for (let dy = 0; dy < ps; dy++) {
          for (let dx = 0; dx < ps; dx++) {
            const bx = tx + dx;
            const by = ty + dy;
            if (hasLineOfSightCellsLocal(ax, ay, bx, by, edgeSet)) return true;
          }
        }
      }
    }
    return false;
  }

  function cardinalStepBlockedByWalls(wallsSet, fromX, fromY, size, dx, dy) {
    if (dx === 1 && dy === 0) {
      for (let oy = 0; oy < size; oy++) {
        if (hasWallOnEdge(wallsSet, fromX + size - 1, fromY + oy, 'E')) return true;
        if (hasWallOnEdge(wallsSet, fromX + size, fromY + oy, 'W')) return true;
      }
      return false;
    }
    if (dx === -1 && dy === 0) {
      for (let oy = 0; oy < size; oy++) {
        if (hasWallOnEdge(wallsSet, fromX, fromY + oy, 'W')) return true;
        if (hasWallOnEdge(wallsSet, fromX - 1, fromY + oy, 'E')) return true;
      }
      return false;
    }
    if (dx === 0 && dy === 1) {
      for (let ox = 0; ox < size; ox++) {
        if (hasWallOnEdge(wallsSet, fromX + ox, fromY + size - 1, 'S')) return true;
        if (hasWallOnEdge(wallsSet, fromX + ox, fromY + size, 'N')) return true;
      }
      return false;
    }
    if (dx === 0 && dy === -1) {
      for (let ox = 0; ox < size; ox++) {
        if (hasWallOnEdge(wallsSet, fromX + ox, fromY, 'N')) return true;
        if (hasWallOnEdge(wallsSet, fromX + ox, fromY - 1, 'S')) return true;
      }
      return false;
    }
    return false;
  }

  function withinBoard(x, y, size) {
    const bw = Number(boardWidth) || 0;
    const bh = Number(boardHeight) || 0;
    return x >= 0 && y >= 0 && (x + size) <= bw && (y + size) <= bh;
  }

  function canOccupyCell(player, x, y, size) {
    if (!withinBoard(x, y, size)) return false;
    try {
      if (window.FogWar?.isEnabled?.() && !window.FogWar?.canMoveToCell?.(x, y, player)) return false;
    } catch {}
    return isAreaFreeClient(player?.id, x, y, size, { allowWalls: true });
  }

  function canStepCardinal(player, fromX, fromY, size, dx, dy, wallsSet) {
    const nx = fromX + dx;
    const ny = fromY + dy;
    if (!canOccupyCell(player, nx, ny, size)) return false;
    if (cardinalStepBlockedByWalls(wallsSet, fromX, fromY, size, dx, dy)) return false;
    return true;
  }

  function canStepBetween(player, fromX, fromY, toX, toY, size, wallsSet) {
    const dx = Number(toX) - Number(fromX);
    const dy = Number(toY) - Number(fromY);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return false;
    if (dx === 0 && dy === 0) return true;

    if (dx === 0 || dy === 0) {
      return canStepCardinal(player, fromX, fromY, size, dx, dy, wallsSet);
    }

    const viaAOk = canStepCardinal(player, fromX, fromY, size, dx, 0, wallsSet)
      && canStepCardinal(player, fromX + dx, fromY, size, 0, dy, wallsSet);
    if (viaAOk) return true;

    const viaBOk = canStepCardinal(player, fromX, fromY, size, 0, dy, wallsSet)
      && canStepCardinal(player, fromX, fromY + dy, size, dx, 0, wallsSet);
    return viaBOk;
  }

  function getPathDistanceSteps(player, fromX, fromY, toX, toY, maxSteps = Infinity) {
    const live = getLivePlayer(player) || player;
    if (!live) return null;
    const size = Math.max(1, Number(live?.size) || 1);
    const sx = Number(fromX) || 0;
    const sy = Number(fromY) || 0;
    const tx = Number(toX) || 0;
    const ty = Number(toY) || 0;
    if (sx === tx && sy === ty) return 0;
    if (!withinBoard(tx, ty, size)) return null;

    const wallsSet = getWallsSet();
    const limit = Number.isFinite(Number(maxSteps)) ? Math.max(0, Number(maxSteps) || 0) : Infinity;
    const q = [{ x: sx, y: sy, d: 0 }];
    const seen = new Map([[`${sx},${sy}`, 0]]);

    while (q.length) {
      const cur = q.shift();
      if (!cur) continue;
      if (cur.d >= limit) continue;
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        const nd = cur.d + 1;
        const key = `${nx},${ny}`;
        const prev = seen.get(key);
        if (prev != null && prev <= nd) continue;
        if (!canStepBetween(live, cur.x, cur.y, nx, ny, size, wallsSet)) continue;
        if (nx === tx && ny === ty) return nd;
        seen.set(key, nd);
        q.push({ x: nx, y: ny, d: nd });
      }
    }

    return null;
  }

  function buildWalkReachableMap(player, rec) {
    const live = getLivePlayer(player) || player;
    if (!live || !rec) return new Map();
    const size = Math.max(1, Number(live?.size) || 1);
    const feetPerCell = getFeetPerCell();
    const stepsLeft = Math.max(0, Math.floor(getRemainingFeet(live) / feetPerCell));
    const out = new Map();
    const wallsSet = getWallsSet();
    const q = [{ x: Number(rec.currentX) || 0, y: Number(rec.currentY) || 0, d: 0 }];
    const seen = new Map([[`${Number(rec.currentX) || 0},${Number(rec.currentY) || 0}`, 0]]);

    while (q.length) {
      const cur = q.shift();
      if (!cur) continue;
      if (cur.d >= stepsLeft) continue;
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        const nd = cur.d + 1;
        const key = `${nx},${ny}`;
        const prev = seen.get(key);
        if (prev != null && prev <= nd) continue;
        if (!canStepBetween(live, cur.x, cur.y, nx, ny, size, wallsSet)) continue;
        seen.set(key, nd);
        out.set(key, nd);
        q.push({ x: nx, y: ny, d: nd });
      }
    }

    return out;
  }

  function getTeleportInfo(player) {
    const rec = getTracker(player, { create: true });
    if (!rec) return null;
    if (!rec.teleportAvailable || rec.teleportUsed) return null;
    const rangeFeet = Math.max(0, Number(rec.teleportRangeFeet) || 0);
    if (rangeFeet <= 0) return null;
    return {
      rangeFeet,
      rangeCells: Math.max(0, Math.floor(rangeFeet / getFeetPerCell())),
      sourceKind: String(rec.teleportSourceKind || ''),
      sourceId: String(rec.teleportSourceId || ''),
      sourceName: String(rec.teleportSourceName || '')
    };
  }

  function getDashInfo(player) {
    const rec = getTracker(player, { create: true });
    if (!rec || !isCombatPhase() || rec.dashUsed) return null;
    const rangeFeet = Math.max(0, Number(rec.totalFeet) || 0);
    return {
      rangeFeet,
      rangeCells: Math.max(0, Math.floor(rangeFeet / getFeetPerCell())),
      active: !!rec.dashActive
    };
  }

  function canTeleportTo(player, x, y) {
    const live = getLivePlayer(player) || player;
    const rec = getTracker(live, { create: true });
    const tp = getTeleportInfo(live);
    if (!live || !rec || !tp) return false;
    const nx = Number(x);
    const ny = Number(y);
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return false;
    if (nx === Number(rec.currentX) && ny === Number(rec.currentY)) return false;
    const size = Math.max(1, Number(live?.size) || 1);
    if (!withinBoard(nx, ny, size)) return false;

    try {
      if (!isGmNow() && window.FogWar?.isEnabled?.()) {
        let fogOk = true;
        if (typeof window.FogWar?.canTeleportToCell === 'function') {
          fogOk = !!window.FogWar.canTeleportToCell(nx, ny, live);
        } else {
          const visible = !!window.FogWar?.isCellVisible?.(nx, ny);
          const explored = !!window.FogWar?._isExplored?.(nx, ny);
          fogOk = visible || explored;
        }
        if (!fogOk) return false;
      }
    } catch {}

    if (!isAreaFreeClient(live.id, nx, ny, size, { allowWalls: true })) return false;
    if (!hasAnyTeleportLineOfSight(live, rec.currentX, rec.currentY, nx, ny, size)) return false;
    return chebyshevSteps(rec.currentX, rec.currentY, nx, ny) <= tp.rangeCells;
  }

  function activateTeleport(playerOrId, opts = {}) {
    const live = getLivePlayer(playerOrId);
    if (!live || !canUseSpellActionsPhase()) return false;
    if (live.x === null || live.y === null) return false;

    const mine = String(live?.ownerId || '') === String(myId || '');
    if (!isGmNow()) {
      if (isCombatPhase()) {
        if (!isRestrictedForPlayer(live)) return false;
      } else {
        if (!mine) return false;
      }
    }

    const rec = getTracker(live, { create: true });
    if (!rec) return false;
    if (isCombatPhase() && rec.teleportUsed) return false;
    const rangeFeet = Math.max(0, Math.trunc(Number(opts?.rangeFeet) || 0));
    if (rangeFeet <= 0) return false;

    if (!isCombatPhase()) {
      rec.originX = Number.isFinite(Number(live?.x)) ? Number(live.x) : 0;
      rec.originY = Number.isFinite(Number(live?.y)) ? Number(live.y) : 0;
      rec.currentX = rec.originX;
      rec.currentY = rec.originY;
      rec.spentFeet = 0;
      rec.totalFeet = getPlayerSpeedFeet(live);
      rec.teleportUsed = false;
    }

    rec.teleportAvailable = true;
    rec.teleportRangeFeet = rangeFeet;
    rec.teleportActive = true;
    rec.teleportSourceKind = String(opts?.sourceKind || '');
    rec.teleportSourceId = String(opts?.sourceId || '');
    rec.teleportSourceName = String(opts?.sourceName || '');

    try {
      selectedPlayer = live;
      try { window.syncSelectedPlayerUi?.(); } catch {}
    } catch {}
    try { window.hideMovePreview?.(); } catch {}
    try { window.renderCombatMoveOverlay?.(); } catch {}
    return true;
  }

  function consumeTeleport(player, x, y) {
    const rec = getTracker(player, { create: true });
    if (!rec) return;
    rec.currentX = Number(x) || 0;
    rec.currentY = Number(y) || 0;
    rec.teleportUsed = true;
    rec.teleportAvailable = false;
    rec.teleportActive = false;
  }

  function buildReachableMapForFeet(player, rec, feetBudget) {
    const live = getLivePlayer(player) || player;
    if (!live || !rec) return new Map();
    const size = Math.max(1, Number(live?.size) || 1);
    const feetPerCell = getFeetPerCell();
    const stepsLeft = Math.max(0, Math.floor(Math.max(0, Number(feetBudget) || 0) / feetPerCell));
    const out = new Map();
    const wallsSet = getWallsSet();
    const q = [{ x: Number(rec.currentX) || 0, y: Number(rec.currentY) || 0, d: 0 }];
    const seen = new Map([[`${Number(rec.currentX) || 0},${Number(rec.currentY) || 0}`, 0]]);

    while (q.length) {
      const cur = q.shift();
      if (!cur) continue;
      if (cur.d >= stepsLeft) continue;
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        const nd = cur.d + 1;
        const key = `${nx},${ny}`;
        const prev = seen.get(key);
        if (prev != null && prev <= nd) continue;
        if (!canStepBetween(live, cur.x, cur.y, nx, ny, size, wallsSet)) continue;
        seen.set(key, nd);
        out.set(key, nd);
        q.push({ x: nx, y: ny, d: nd });
      }
    }

    return out;
  }

  function canSpendMoveTo(player, x, y) {
    const rec = getTracker(player, { create: true });
    if (!rec) return true;
    if (Number(x) === Number(rec.originX) && Number(y) === Number(rec.originY)) return true;
    const map = buildReachableMapForFeet(player, rec, getRemainingFeet(player));
    return map.has(`${Number(x) || 0},${Number(y) || 0}`);
  }

  function canSpendDashTo(player, x, y) {
    const rec = getTracker(player, { create: true });
    const dash = getDashInfo(player);
    if (!rec || !dash) return false;
    const nx = Number(x) || 0;
    const ny = Number(y) || 0;
    if (nx === Number(rec.currentX) && ny === Number(rec.currentY)) return true;
    const map = buildReachableMapForFeet(player, rec, dash.rangeFeet);
    return map.has(`${nx},${ny}`);
  }

  function commitMove(player, x, y) {
    const rec = getTracker(player, { create: true });
    if (!rec) return;
    const nx = Number(x) || 0;
    const ny = Number(y) || 0;
    if (nx === rec.originX && ny === rec.originY) {
      rec.currentX = nx;
      rec.currentY = ny;
      rec.spentFeet = 0;
      return;
    }
    const feetPerCell = getFeetPerCell();
    const stepBudget = Math.max(0, Math.floor(getRemainingFeet(player) / feetPerCell));
    const steps = getPathDistanceSteps(player, rec.currentX, rec.currentY, nx, ny, stepBudget);
    if (!Number.isFinite(steps) || steps <= 0) return;
    rec.spentFeet = Math.max(0, Number(rec.spentFeet) || 0) + (steps * feetPerCell);
    rec.currentX = nx;
    rec.currentY = ny;
  }

  function commitDashMove(player, x, y) {
    const rec = getTracker(player, { create: true });
    if (!rec) return;
    const nx = Number(x) || 0;
    const ny = Number(y) || 0;
    if (nx === Number(rec.currentX) && ny === Number(rec.currentY)) return;
    rec.currentX = nx;
    rec.currentY = ny;
    rec.dashUsed = true;
    rec.dashActive = false;
  }

  function ensureLayer() {
    let layer = board?.querySelector?.('#combat-move-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'combat-move-layer';
      try { board.appendChild(layer); } catch {}
    }
    return layer;
  }

  function clearLayer() {
    try {
      const layer = ensureLayer();
      if (layer) layer.innerHTML = '';
    } catch {}
  }

  function isCombatRestrictedSelection(player) {
    return isRestrictedForPlayer(player);
  }

  function shouldShowCombatOverlay(player) {
    if (!player || isInitiativePhase()) return false;
    const tp = getTeleportInfo(player);
    if (!isCombatPhase()) return !!tp;
    if (isCombatRestrictedSelection(player)) return true;
    if (tp) return true;
    return !!isGmNow();
  }

  function canUseDashAction(playerOrId) {
    const live = getLivePlayer(playerOrId);
    if (!live || !isCombatPhase()) return false;
    const rec = getTracker(live, { create: true });
    if (!rec || rec.dashUsed || rec.teleportActive) return false;
    if (isGmNow()) return true;
    return isCombatRestrictedSelection(live);
  }

  function activateDash(playerOrId) {
    const live = getLivePlayer(playerOrId);
    if (!canUseDashAction(live)) return false;
    const rec = getTracker(live, { create: true });
    if (!rec) return false;
    rec.dashActive = !rec.dashActive;
    try {
      selectedPlayer = live;
      try { window.syncSelectedPlayerUi?.(); } catch {}
    } catch {}
    try { window.hideMovePreview?.(); } catch {}
    try { window.renderCombatMoveOverlay?.(); } catch {}
    return true;
  }

  function appendOverlayCell(layer, cls, x, y, size) {
    const cell = document.createElement('div');
    cell.className = `combat-move-cell ${cls}`;
    cell.style.left = `${x * CELL}px`;
    cell.style.top = `${y * CELL}px`;
    cell.style.width = `${size * CELL}px`;
    cell.style.height = `${size * CELL}px`;
    layer.appendChild(cell);
  }

  function renderOverlayForSelected() {
    dropSelectionIfInvalid();

    const layer = ensureLayer();
    if (!layer) return;
    layer.innerHTML = '';

    if (!selectedPlayer || editEnvironment) return;
    if (!shouldShowCombatOverlay(selectedPlayer)) return;

    const live = getLivePlayer(selectedPlayer) || selectedPlayer;
    const rec = getTracker(live, { create: true }) || {
      originX: Number.isFinite(Number(live?.x)) ? Number(live.x) : 0,
      originY: Number.isFinite(Number(live?.y)) ? Number(live.y) : 0,
      currentX: Number.isFinite(Number(live?.x)) ? Number(live.x) : 0,
      currentY: Number.isFinite(Number(live?.y)) ? Number(live.y) : 0,
      spentFeet: 0,
      totalFeet: getPlayerSpeedFeet(live)
    };
    if (!rec) return;

    const size = Math.max(1, Number(live?.size) || 1);
    appendOverlayCell(layer, 'combat-move-cell--origin', rec.originX, rec.originY, size);

    const tp = getTeleportInfo(live);
    if (tp && rec.teleportActive) {
      const maxX = Math.max(0, (Number(boardWidth) || 0) - size);
      const maxY = Math.max(0, (Number(boardHeight) || 0) - size);
      for (let y = 0; y <= maxY; y++) {
        for (let x = 0; x <= maxX; x++) {
          if (!canTeleportTo(live, x, y)) continue;
          appendOverlayCell(layer, 'combat-move-cell--teleport', x, y, size);
        }
      }
      return;
    }

    const dash = getDashInfo(live);
    if (dash?.active) {
      const dashMap = buildReachableMapForFeet(live, rec, dash.rangeFeet);
      for (const [key] of dashMap.entries()) {
        const parts = key.split(',');
        const x = Number(parts[0]);
        const y = Number(parts[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (x === rec.currentX && y === rec.currentY) continue;
        appendOverlayCell(layer, 'combat-move-cell--dash', x, y, size);
      }
      return;
    }

    const walkMap = buildWalkReachableMap(live, rec);
    for (const [key] of walkMap.entries()) {
      const parts = key.split(',');
      const x = Number(parts[0]);
      const y = Number(parts[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x === rec.originX && y === rec.originY) continue;
      appendOverlayCell(layer, 'combat-move-cell--reachable', x, y, size);
    }
  }

  function hideOverlay() {
    clearLayer();
  }

  window.getCombatMoveBudgetInfo = function(player) {
    const rec = getTracker(player, { create: true });
    if (!rec) return null;
    return {
      originX: rec.originX,
      originY: rec.originY,
      currentX: rec.currentX,
      currentY: rec.currentY,
      spentFeet: Number(rec.spentFeet) || 0,
      totalFeet: Number(rec.totalFeet) || 0,
      remainingFeet: getRemainingFeet(player),
      dash: getDashInfo(player),
      teleport: getTeleportInfo(player)
    };
  };
  window.getCombatPathDistanceSteps = function(player, fromX, fromY, toX, toY, maxSteps) {
    return getPathDistanceSteps(player, fromX, fromY, toX, toY, maxSteps);
  };
  window.forceCombatMoveTracker = function(player, payload = {}) {
    const rec = getTracker(player, { create: true });
    if (!rec) return;
    if (typeof payload.spentFeet !== 'undefined') rec.spentFeet = Math.max(0, Number(payload.spentFeet) || 0);
    if (typeof payload.currentX !== 'undefined') rec.currentX = Number(payload.currentX) || 0;
    if (typeof payload.currentY !== 'undefined') rec.currentY = Number(payload.currentY) || 0;
  };
  window.canSpendCombatMoveTo = canSpendMoveTo;
  window.commitCombatMove = commitMove;
  window.renderCombatMoveOverlay = renderOverlayForSelected;
  window.hideCombatMoveOverlay = hideOverlay;
  window.isCombatRestrictedSelection = isCombatRestrictedSelection;
  window.activateCombatTeleportForPlayer = activateTeleport;
  window.canUseCombatTeleportTo = canTeleportTo;
  window.consumeCombatTeleportTo = consumeTeleport;
  window.getCombatTeleportInfo = getTeleportInfo;
  window.canUseCombatDashAction = canUseDashAction;
  window.activateCombatDashForPlayer = activateDash;
  window.canUseCombatDashTo = canSpendDashTo;
  window.commitCombatDashMove = commitDashMove;
  window.isCombatDashActiveForPlayer = (player) => !!getDashInfo(player)?.active;
})();

// ================== MOVE PREVIEW ==================
(function wireMovePreview() {
  const CELL = 50;

  function ensureMovePreviewLayer() {
    let layer = board?.querySelector?.('#move-preview-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'move-preview-layer';
      try { board.appendChild(layer); } catch {}
    }
    return layer;
  }

  function ensureMovePreviewBox() {
    const layer = ensureMovePreviewLayer();
    if (!layer) return null;
    let box = layer.querySelector('.move-preview-box');
    if (!box) {
      box = document.createElement('div');
      box.className = 'move-preview-box';
      layer.appendChild(box);
    }
    return box;
  }

  function hideMovePreview() {
    try {
      const box = board?.querySelector?.('#move-preview-layer .move-preview-box');
      if (box) box.classList.remove('is-visible');
    } catch {}
  }

  function showMovePreviewForCell(cell) {
    if (!selectedPlayer || editEnvironment) {
      hideMovePreview();
      return;
    }
    if (!cell) {
      hideMovePreview();
      return;
    }

    const size = Math.max(1, Number(selectedPlayer?.size) || 1);
    let x = parseInt(cell.dataset.x, 10);
    let y = parseInt(cell.dataset.y, 10);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      hideMovePreview();
      return;
    }

    if (x + size > boardWidth) x = boardWidth - size;
    if (y + size > boardHeight) y = boardHeight - size;
    if (x < 0) x = 0;
    if (y < 0) y = 0;

    if (window.isCombatRestrictedSelection?.(selectedPlayer) || window.getCombatTeleportInfo?.(selectedPlayer)?.rangeCells > 0) {
      hideMovePreview();
      try { window.renderCombatMoveOverlay?.(); } catch {}
      return;
    }

    const box = ensureMovePreviewBox();
    if (!box) return;
    box.style.left = `${x * CELL}px`;
    box.style.top = `${y * CELL}px`;
    box.style.width = `${size * CELL}px`;
    box.style.height = `${size * CELL}px`;
    box.classList.add('is-visible');
  }

  board.addEventListener('mousemove', (e) => {
    try {
      if (!selectedPlayer || editEnvironment) {
        hideMovePreview();
        try { window.hideCombatMoveOverlay?.(); } catch {}
        return;
      }
      const cell = e.target.closest('.cell');
      showMovePreviewForCell(cell);
    } catch {}
  }, { passive: true });

  board.addEventListener('mouseleave', () => {
    hideMovePreview();
  });

  board.addEventListener('click', () => {
    hideMovePreview();
  });

  document.addEventListener('keydown', (e) => {
    try {
      if (e.key === 'Escape') hideMovePreview();
    } catch {}
  });

  window.updateMovePreview = function () {
    try {
      if (!selectedPlayer || editEnvironment) {
        hideMovePreview();
        try { window.hideCombatMoveOverlay?.(); } catch {}
        return;
      }
      const hovered = board?.querySelector?.('.cell:hover');
      showMovePreviewForCell(hovered);
      try { window.renderCombatMoveOverlay?.(); } catch {}
    } catch {}
  };
  window.hideMovePreview = hideMovePreview;
})();

// ================== MOVE PLAYER ==================
board.addEventListener('click', e => {
  if (!selectedPlayer) return;
  const cell = e.target.closest('.cell');
  if (!cell) return;

  let x = parseInt(cell.dataset.x, 10);
  let y = parseInt(cell.dataset.y, 10);
  if (x + selectedPlayer.size > boardWidth) x = boardWidth - selectedPlayer.size;
  if (y + selectedPlayer.size > boardHeight) y = boardHeight - selectedPlayer.size;

  // Туман войны: опционально может запрещать движение на неоткрытые клетки.
  try {
    if (window.FogWar?.isEnabled?.() && !window.FogWar?.canMoveToCell?.(x, y, selectedPlayer)) {
      alert('Нельзя перемещаться в неоткрытую область (включено "Движение по открытому")');
      return;
    }
  } catch {}

  // быстрый локальный чек (сервер всё равно проверит)
  const size = Number(selectedPlayer.size) || 1;
  // По запросу: ограничения на постановку на стены убраны — теперь можно всем.
  const allowWalls = true;
  if (!isAreaFreeClient(selectedPlayer.id, x, y, size, { allowWalls })) {
    alert("Эта клетка занята другим персонажем");
    return;
  }

  const teleportInfo = window.getCombatTeleportInfo?.(selectedPlayer);
  const forcePlacementSet = (window.__allowInitialCombatPlacementIds instanceof Set)
    ? window.__allowInitialCombatPlacementIds
    : null;
  const forceInitialPlacement = !!(forcePlacementSet && forcePlacementSet.has(String(selectedPlayer?.id || '')));
  if (teleportInfo?.rangeCells > 0) {
    if (!window.canUseCombatTeleportTo?.(selectedPlayer, x, y)) {
      alert('Эта клетка недоступна для телепортации');
      return;
    }

    try { window.consumeCombatTeleportTo?.(selectedPlayer, x, y); } catch {}
    sendMessage({ type: 'movePlayer', id: selectedPlayer.id, x, y });

    try {
      selectedPlayer = null;
      try { window.syncSelectedPlayerUi?.(); } catch {}
    } catch {}
    try { window.hideMovePreview?.(); } catch {}
    try { window.hideCombatMoveOverlay?.(); } catch {}
    return;
  }

  const combatRestricted = !!window.isCombatRestrictedSelection?.(selectedPlayer);
  if (forceInitialPlacement) {
    sendMessage({ type: 'movePlayer', id: selectedPlayer.id, x, y, usedDash: false });
    try { forcePlacementSet?.delete(String(selectedPlayer?.id || '')); } catch {}
    selectedPlayer = null;
    try { window.syncSelectedPlayerUi?.(); } catch {}
    try { window.hideMovePreview?.(); } catch {}
    try { window.hideCombatMoveOverlay?.(); } catch {}
    return;
  }
  const moveInfo = combatRestricted ? window.getCombatMoveBudgetInfo?.(selectedPlayer) : null;
  const dashActive = !!moveInfo?.dash?.active;
  if (combatRestricted) {
    if (moveInfo) {
      const toOrigin = (Number(x) === Number(moveInfo.originX) && Number(y) === Number(moveInfo.originY));
      const canMove = dashActive
        ? !!window.canUseCombatDashTo?.(selectedPlayer, x, y)
        : !!window.canSpendCombatMoveTo?.(selectedPlayer, x, y);
      if (!toOrigin && !canMove) {
        alert("Недостаточно скорости для такого перемещения");
        return;
      }
    }
  }

  if (combatRestricted) {
    if (moveInfo?.dash?.active) {
      try { window.commitCombatDashMove?.(selectedPlayer, x, y); } catch {}
      sendMessage({ type: 'movePlayer', id: selectedPlayer.id, x, y, usedDash: true });
      try {
        selectedPlayer = null;
        try { window.syncSelectedPlayerUi?.(); } catch {}
      } catch {}
      try { window.hideMovePreview?.(); } catch {}
      try { window.hideCombatMoveOverlay?.(); } catch {}
      return;
    }

    try { window.commitCombatMove?.(selectedPlayer, x, y); } catch {}
    sendMessage({ type: 'movePlayer', id: selectedPlayer.id, x, y, usedDash: false });
    try {
      const beforeSpent = Number(moveInfo?.spentFeet) || 0;
      const afterInfo = window.getCombatMoveBudgetInfo?.(selectedPlayer);
      if ((Number(afterInfo?.spentFeet) || 0) <= beforeSpent) {
        const feetPerCell = Math.max(1, Math.min(100, Number(lastState?.cellFeet) || 10));
        const maxSteps = Math.max(0, Math.floor((Number(moveInfo?.remainingFeet) || 0) / feetPerCell));
        const steps = window.getCombatPathDistanceSteps?.(selectedPlayer, moveInfo?.currentX, moveInfo?.currentY, x, y, maxSteps);
        if (Number.isFinite(steps) && steps > 0) {
          window.forceCombatMoveTracker?.(selectedPlayer, {
            spentFeet: beforeSpent + (steps * feetPerCell),
            currentX: x,
            currentY: y
          });
        }
      }
    } catch {}
    try {
      selectedPlayer = null;
      try { window.syncSelectedPlayerUi?.(); } catch {}
    } catch {}
    try { window.hideMovePreview?.(); } catch {}
    try { window.hideCombatMoveOverlay?.(); } catch {}
    return;
  }

  sendMessage({ type: 'movePlayer', id: selectedPlayer.id, x, y, usedDash: !!dashActive });

  selectedPlayer = null;
  try { window.syncSelectedPlayerUi?.(); } catch {}
  try { window.hideMovePreview?.(); } catch {}
  try { window.hideCombatMoveOverlay?.(); } catch {}
});

window.beginTokenPlacementForPlayer = function beginTokenPlacementForPlayer(playerId) {
  try {
    const pid = String(playerId || '').trim();
    if (!pid) return false;
    const live = (players || []).find((pp) => String(pp?.id || '') === pid);
    if (!live) return false;
    if (!(window.__allowInitialCombatPlacementIds instanceof Set)) {
      window.__allowInitialCombatPlacementIds = new Set();
    }
    try { window.__allowInitialCombatPlacementIds.add(pid); } catch {}
    selectedPlayer = live;
    try { window.syncSelectedPlayerUi?.(); } catch {}
    try { window.updateMovePreview?.(); } catch {}
    try { window.renderCombatMoveOverlay?.(); } catch {}
    try { alert(`Выберите клетку на поле, чтобы разместить токен «${String(live?.name || 'Игрок')}».`); } catch {}
    return true;
  } catch {
    return false;
  }
};

document.addEventListener('keydown', (e) => {
  try {
    if (e.key !== 'Escape') return;
    if (!selectedPlayer) return;
    selectedPlayer = null;
    try { window.syncSelectedPlayerUi?.(); } catch {}
    try { window.hideMovePreview?.(); } catch {}
    try { window.hideCombatMoveOverlay?.(); } catch {}
  } catch {}
});

// ===== Dice Viz (panel + canvas animation) =====
const diceVizKind = document.getElementById("dice-viz-kind");

// ================== BASE TOKEN NAV ARROW (find "Основа" if off-screen) ==================
// Shows a small orange triangle on the edge of the visible board area pointing toward
// the player's "Основа" token when it is outside the current viewport.
(function wireBaseNavArrow() {
  const CELL = 50;
  const ARROW_SIZE = 14; // px
  const EDGE_PAD = 10;   // px from edge
  const Z = 999999;

  function getBoardWrapper() {
    return document.getElementById('board-wrapper');
  }

  function getBoardEl() {
    // In this project, global "board" is #game-board.
    try { return board || document.getElementById('game-board'); } catch { return document.getElementById('game-board'); }
  }

  function ensureArrowEl() {
    const b = getBoardEl();
    if (!b) return null;
    let el = document.getElementById('base-nav-arrow');
    if (!el) {
      el = document.createElement('div');
      el.id = 'base-nav-arrow';

      // Triangle pointing up by default; we rotate it.
      el.style.width = '0px';
      el.style.height = '0px';
      el.style.borderLeft = `${ARROW_SIZE}px solid transparent`;
      el.style.borderRight = `${ARROW_SIZE}px solid transparent`;
      el.style.borderBottom = `${ARROW_SIZE * 1.4}px solid rgba(255, 165, 0, 0.95)`;

      el.style.position = 'absolute';
      el.style.zIndex = String(Z);
      el.style.pointerEvents = 'none';
      el.style.filter = 'drop-shadow(0 0 6px rgba(0,0,0,0.75))';
      el.style.display = 'none';

      // Ensure board is positioned so absolute works
      try { b.style.position = b.style.position || 'relative'; } catch {}
      b.appendChild(el);
    }
    return el;
  }

  function findMyBasePlayer() {
    try {
      const list = Array.isArray(players) ? players : [];
      const myIdStr = (typeof myId !== 'undefined') ? String(myId) : '';
      const myNameStr = (typeof myName !== 'undefined') ? String(myName) : '';

      // Prefer explicit ownerId match.
      let p = list.find(pp => pp && pp.isBase && myIdStr && String(pp.ownerId || '') === myIdStr);
      if (p) return p;

      // Fallback: base token with name == myName.
      p = list.find(pp => pp && pp.isBase && myNameStr && String(pp.name || '') === myNameStr);
      if (p) return p;

      // Last fallback: if there is exactly one base token, use it.
      const bases = list.filter(pp => pp && pp.isBase);
      if (bases.length === 1) return bases[0];
    } catch {}
    return null;
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

    function updateArrowNow() {
    const wrap = getBoardWrapper();
    const b = getBoardEl();
    const arrow = ensureArrowEl();
    if (!wrap || !b || !arrow) return;

    const baseP = findMyBasePlayer();
    if (!baseP) {
      arrow.style.display = 'none';
      return;
    }

    // Prefer live DOM position first. This keeps the locator working even if the
    // player snapshot temporarily lost x/y while the token is still rendered on the field.
    const tokenEl = playerElements.get(baseP.id) || (baseP && baseP.element) || null;
    const hasLogicalPos = !(baseP.x === null || typeof baseP.x === 'undefined' || baseP.y === null || typeof baseP.y === 'undefined');
    const hasDomToken = !!(tokenEl && tokenEl.style?.display !== 'none');
    if (!hasLogicalPos && !hasDomToken) {
      arrow.style.display = 'none';
      return;
    }

    // If logical coordinates are absent, but DOM token exists, keep working from DOM.
    // If both are absent, hide the arrow.
    const wrapRect = wrap.getBoundingClientRect();
    let tokenCx = null;
    let tokenCy = null;

    if (tokenEl && tokenEl.style?.display !== 'none') {
      const tokRect = tokenEl.getBoundingClientRect();
      if (Number.isFinite(tokRect.width) && Number.isFinite(tokRect.height) && tokRect.width > 0 && tokRect.height > 0) {
        tokenCx = tokRect.left + tokRect.width / 2;
        tokenCy = tokRect.top + tokRect.height / 2;
      }
    }

    if (!Number.isFinite(tokenCx) || !Number.isFinite(tokenCy)) {
      const bRect = b.getBoundingClientRect();
      const ow = b.offsetWidth || 1;
      const scale = (bRect.width && ow) ? (bRect.width / ow) : (window.ControlBox?.getZoom?.() || 1);
      const size = Math.max(1, Number(baseP?.size) || 1);
      const localCx = ((Number(baseP.x) || 0) + (size / 2)) * CELL;
      const localCy = ((Number(baseP.y) || 0) + (size / 2)) * CELL;
      tokenCx = bRect.left + (localCx * scale);
      tokenCy = bRect.top + (localCy * scale);
    }

    // Visible area (in screen coordinates), slightly inset so arrow doesn't overlap borders.
    // IMPORTANT: use clientWidth/clientHeight to exclude scrollbars, otherwise the arrow can end up under the scrollbar.
    const left = wrapRect.left + EDGE_PAD;
    const top = wrapRect.top + EDGE_PAD;
    const right = wrapRect.left + (wrap.clientWidth || (wrapRect.width || 0)) - EDGE_PAD;
    const bottom = wrapRect.top + (wrap.clientHeight || (wrapRect.height || 0)) - EDGE_PAD;

    const inside = (tokenCx >= left && tokenCx <= right && tokenCy >= top && tokenCy <= bottom);
    if (inside) {
      arrow.style.display = 'none';
      return;
    }

    // Ray from viewport center toward token center; intersect with inset rectangle.
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const dx = tokenCx - cx;
    const dy = tokenCy - cy;

    // Degenerate case (shouldn't happen)
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6)) {
      arrow.style.display = 'none';
      return;
    }

    let bestT = Infinity;
    let hitX = cx;
    let hitY = cy;

    function consider(t, x, y) {
      if (!(t > 0) || t >= bestT) return;
      if (x < left - 0.5 || x > right + 0.5) return;
      if (y < top - 0.5 || y > bottom + 0.5) return;
      bestT = t;
      hitX = x;
      hitY = y;
    }

    // Vertical sides
    if (Math.abs(dx) > 1e-6) {
      let t = (left - cx) / dx;
      consider(t, left, cy + t * dy);
      t = (right - cx) / dx;
      consider(t, right, cy + t * dy);
    }
    // Horizontal sides
    if (Math.abs(dy) > 1e-6) {
      let t = (top - cy) / dy;
      consider(t, cx + t * dx, top);
      t = (bottom - cy) / dy;
      consider(t, cx + t * dx, bottom);
    }

    // Angle toward token (screen space)
    const ang = Math.atan2(tokenCy - hitY, tokenCx - hitX);
    const deg = (ang * 180 / Math.PI) + 90;

    // Convert screen point -> board local (unscaled) coords so the arrow stays glued to the correct edge under zoom.
    const bRect = b.getBoundingClientRect();
    const ow = b.offsetWidth || 1;
    const scale = (bRect.width && ow) ? (bRect.width / ow) : (window.ControlBox?.getZoom?.() || 1);

    const localX = (hitX - bRect.left) / scale;
    const localY = (hitY - bRect.top) / scale;

    // Center the triangle around (localX, localY)
    const w = ARROW_SIZE * 2;
    const h = ARROW_SIZE * 1.4;
    arrow.style.left = `${localX - w / 2}px`;
    arrow.style.top = `${localY - h / 2}px`;
    arrow.style.transform = `rotate(${deg}deg)`;
    arrow.style.transformOrigin = '50% 60%';
    arrow.style.display = 'block';
  }

  let rafId = 0;
  function scheduleUpdate() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      try { updateArrowNow(); } catch {}
    });
  }

  let wiredWrap = null;
  function wire() {
    const wrap = getBoardWrapper();
    if (!wrap) return;

    // board-wrapper can be recreated/rebound after UI refreshes; avoid duplicate listeners,
    // but do re-bind when the actual DOM node changes.
    if (wiredWrap === wrap) {
      scheduleUpdate();
      return;
    }
    wiredWrap = wrap;

    // Update on scroll/resize.
    wrap.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    try { document.addEventListener('visibilitychange', scheduleUpdate); } catch {}
    try { wrap.addEventListener('mouseenter', scheduleUpdate, { passive: true }); } catch {}
    try { wrap.addEventListener('mousemove', scheduleUpdate, { passive: true }); } catch {}

    // Periodic safety update + auto-rebind if wrapper/token DOM was recreated.
    setInterval(() => {
      try {
        const currentWrap = getBoardWrapper();
        if (currentWrap && currentWrap !== wiredWrap) wire();
      } catch {}
      scheduleUpdate();
    }, 300);

    scheduleUpdate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }

  // Expose manual trigger for other modules.
  window.__updateBaseNavArrow = scheduleUpdate;
})();
const diceVizValue = document.getElementById("dice-viz-value");
const diceCanvas = document.getElementById("dice-canvas");
const diceCtx = diceCanvas?.getContext?.("2d");

let diceAnimFrame = null;
let diceAnimBusy = false;

// ===== Other players dice feed (right of dice panel) =====
let othersDiceWrap = null;

function ensureOthersDiceUI() {
  if (othersDiceWrap) return othersDiceWrap;

  // Если блок уже есть в HTML (в стеке над панелью) — используем его
  const existing = document.getElementById('dice-others');
  if (existing) {
    othersDiceWrap = existing;
    if (!othersDiceWrap.querySelector('.dice-others__title')) {
      othersDiceWrap.innerHTML = `
        <div class="dice-others__title">Броски других</div>
        <div class="dice-others__list" aria-hidden="true"></div>
      `;
    }
    // если HTML старый и нет списка — создаём
    if (!othersDiceWrap.querySelector('.dice-others__list')) {
      const list = document.createElement('div');
      list.className = 'dice-others__list';
      list.setAttribute('aria-hidden', 'true');
      othersDiceWrap.appendChild(list);
    }
    return othersDiceWrap;
  }

  // Fallback: старый вариант (если HTML не обновлён)
  othersDiceWrap = document.createElement("div");
  othersDiceWrap.className = "dice-others";
  othersDiceWrap.innerHTML = `
    <div class="dice-others__title">Броски других</div>
    <div class="dice-others__list" aria-hidden="true"></div>
  `;
  document.body.appendChild(othersDiceWrap);
  return othersDiceWrap;
}

// показываем результат броска в основной панели (используется для серверных инициатив и т.п.)
async function applyDiceEventToMain(ev) {
  if (!ev) return;

  const sides = Number(ev.sides) || null;
  const count = Number(ev.count) || 1;
  const bonus = Number(ev.bonus) || 0;

  // подпись
  if (diceVizKind) {
    diceVizKind.textContent = ev.kindText || (sides ? `d${sides}` : "Бросок");
  }

  // значение — итог (с бонусом)
  if (diceVizValue) {
    diceVizValue.textContent = String(Number(ev.total) || 0);
  }

  // фишки — только "сырой" кубик (rolls)
  const rolls = Array.isArray(ev.rolls) ? ev.rolls.map(n => Number(n) || 0) : [];
  renderRollChips(rolls.length ? rolls : [Number(ev.total) || 0], -1, sides);

  // анимация кубика (как при обычном "Бросить")
  // ⚠️ Важно: для своих бросков мы уже анимируем в gameplay-ui.js (по клику),
  // а затем прилетает echo diceEvent. Чтобы не было ДВОЙНОЙ анимации — пропускаем её по localNonce.
  const lastNonce = (() => { try { return window._lastSentDiceNonce; } catch { return null; } })();
  const isEchoOfLocal = !!(ev.localNonce && lastNonce && String(ev.localNonce) === String(lastNonce));

  if (!isEchoOfLocal && !diceAnimBusy && diceCtx && diceCanvas && sides && rolls.length) {
    diceAnimBusy = true;
    try {
      for (const r of rolls) {
        await animateSingleRoll(sides, r);
      }
    } finally {
      diceAnimBusy = false;
    }
  }

  const critType = getSingleD20CritType({ sides, count, rolls, kindText: ev.kindText });
  if (critType) {
    applySingleD20CritUI(rolls[0], critType);
  } else {
    clearCritUI();
  }
}

function pushOtherDiceEvent(ev) {
  ensureOthersDiceUI();

  // не показываем свои же броски
  if (ev.fromId && typeof myId !== "undefined" && ev.fromId === myId) return;

  const item = document.createElement("div");
  item.className = "dice-others__item";
  item.dataset.crit = ev.crit || "";

  const rollsText = (ev.rolls && ev.rolls.length)
    ? ev.rolls.join(" + ")
    : "-";

  const head = `${ev.fromName || "Игрок"}: ${ev.kindText || `d${ev.sides} × ${ev.count}`}`;

  // Для одиночного броска с бонусом показываем компактно: "12+4=16"
  let tail = `${rollsText} = ${ev.total}`;
  const bonusNum = Number(ev.bonus) || 0;
  if (Number(ev.count) === 1 && bonusNum !== 0 && Array.isArray(ev.rolls) && ev.rolls.length === 1) {
    const r = Number(ev.rolls[0]) || 0;
    const sign = bonusNum >= 0 ? "+" : "-";
    tail = `${r}${sign}${Math.abs(bonusNum)}=${ev.total}`;
  }

  item.innerHTML = `
    <div class="dice-others__head">${escapeHtmlLocal(head)}</div>
    <div class="dice-others__body">${escapeHtmlLocal(tail)}</div>
  `;

  // крит подсветка (если прилетело)
  if (ev.crit === "crit-fail") item.classList.add("crit-fail");
  if (ev.crit === "crit-success") item.classList.add("crit-success");

  const list = othersDiceWrap.querySelector('.dice-others__list') || othersDiceWrap;
  list.appendChild(item);

  // через 5с — плавное исчезновение
  setTimeout(() => item.classList.add("fade"), 4200);
  setTimeout(() => item.remove(), 5200);
}

// маленький экранировщик
function escapeHtmlLocal(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clearCritUI() {
  if (diceVizValue) {
    diceVizValue.classList.remove("crit-fail", "crit-success");
  }
  if (diceRolls) {
    diceRolls.querySelectorAll(".dice-chip").forEach(ch =>
      ch.classList.remove("crit-fail", "crit-success")
    );
  }
}

function isInitiativeDiceKind(kindText) {
  return /инициатив/i.test(String(kindText || ''));
}

function getSingleD20CritType({ sides, count, rolls, kindText } = {}) {
  const vals = Array.isArray(rolls) ? rolls : [];
  if (Number(sides) !== 20 || Number(count) !== 1 || vals.length !== 1) return '';
  if (isInitiativeDiceKind(kindText)) return '';
  const finalValue = Number(vals[0]) || 0;
  if (finalValue === 1) return 'crit-fail';
  if (finalValue === 20) return 'crit-success';
  return '';
}

function applySingleD20CritUI(finalValue, critType) {
  clearCritUI();

  if (critType === 'crit-fail') {
    if (diceVizValue) diceVizValue.classList.add("crit-fail");
    const chip = diceRolls?.querySelector(".dice-chip");
    if (chip) chip.classList.add("crit-fail");
    return " — КРИТИЧЕСКИЙ ПРОВАЛ (1)";
  }

  if (critType === 'crit-success') {
    if (diceVizValue) diceVizValue.classList.add("crit-success");
    const chip = diceRolls?.querySelector(".dice-chip");
    if (chip) chip.classList.add("crit-success");
    return " — КРИТИЧЕСКИЙ УСПЕХ (20)";
  }

  return "";
}


function clampInt(v, min, max, fallback) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawDieFace(ctx, w, h, sides, value, t) {
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;

  // лёгкая тряска/вращение
  const ang = Math.sin(t * 0.02) * 0.22;
  const scale = 1 + Math.sin(t * 0.015) * 0.02;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);

  const pad = 14;
  const rw = w - pad * 2;
  const rh = h - pad * 2;
  const r = 18;

  // тень
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#000";
  roundRect(ctx, pad + 3, pad + 6, rw, rh, r);
  ctx.fill();
  ctx.globalAlpha = 1;

  // тело
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.strokeStyle = "rgba(255,255,255,0.20)";
  ctx.lineWidth = 2;
  roundRect(ctx, pad, pad, rw, rh, r);
  ctx.fill();
  ctx.stroke();

  // подпись dN
  ctx.fillStyle = "rgba(255,255,255,0.70)";
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`d${sides}`, cx, pad + 26);

  // значение
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = "900 46px sans-serif";
  ctx.fillText(String(value), cx, cy + 18);

  ctx.restore();
}

function renderRollChips(values, activeIndex, sides = null) {
  if (!diceRolls) return;
  diceRolls.innerHTML = "";
  values.forEach((v, i) => {
    const chip = document.createElement("span");
    chip.className = "dice-chip" + (i === activeIndex ? " active" : "");
    // ✅ Подсветка 1 и 20 для любого количества одновременно брошенных d20
    if (Number(sides) === 20 && v !== null) {
      if (v === 1) chip.classList.add('crit-fail');
      if (v === 20) chip.classList.add('crit-success');
    }
    chip.textContent = (v === null ? "…" : String(v));
    diceRolls.appendChild(chip);
  });
}

function animateSingleRoll(sides, finalValue) {
  // Возвращает Promise, чтобы можно было кидать несколько кубов по очереди
  return new Promise((resolve) => {
    if (!diceCtx || !diceCanvas) {
      resolve();
      return;
    }

    const start = performance.now();
    const dur = 420; // ms на один кубик
    let lastShown = rollDie(sides);

    function frame(now) {
      const t = now - start;
      const p = Math.min(1, t / dur);

      const changeProb = 0.92 - 0.86 * p; // 0.92 -> 0.06
      if (Math.random() < changeProb) lastShown = rollDie(sides);

      drawDieFace(diceCtx, diceCanvas.width, diceCanvas.height, sides, lastShown, t);

      if (p < 1) {
        diceAnimFrame = requestAnimationFrame(frame);
      } else {
        drawDieFace(diceCtx, diceCanvas.width, diceCanvas.height, sides, finalValue, t + 999);
        resolve();
      }
    }

    if (diceAnimFrame) cancelAnimationFrame(diceAnimFrame);
    diceAnimFrame = requestAnimationFrame(frame);
  });
}

// ===== other players dice feed (compat wrappers) =====
function pushOtherDice(ev) {
  pushOtherDiceEvent(ev);
}

function ensureDiceOthersUI() {
  return ensureOthersDiceUI();
}

// ===== API: programmatic dice rolls (used by InfoModal weapons) =====
window.DicePanel = window.DicePanel || {};
// Programmatic dice roll used by InfoModal etc.
// If silent=true, it will only animate/update the local dice panel UI and will NOT send log/diceEvent.
// Returns: {sides,count,bonus,rolls,sum,total}
window.DicePanel.roll = async ({ sides = 20, count = 1, bonus = 0, kindText = null, silent = false, actorName = '' } = {}) => {
  if (diceAnimBusy) return;
  diceAnimBusy = true;

  const S = clampInt(sides, 2, 100, 20);
  const C = clampInt(count, 1, 20, 1);
  const B = Number(bonus) || 0;

  // чтобы UI панели соответствовал броску
  if (dice) dice.value = String(S);
  if (diceCountInput) diceCountInput.value = String(C);

  clearCritUI();

  const finals = Array.from({ length: C }, () => rollDie(S));
  const shown = Array.from({ length: C }, () => null);

  renderRollChips(shown, 0, S);

  if (diceVizKind) diceVizKind.textContent = kindText ? String(kindText) : `d${S} × ${C}`;
  if (diceVizValue) diceVizValue.textContent = "…";

  for (let i = 0; i < C; i++) {
    renderRollChips(shown, i, S);
    await animateSingleRoll(S, finals[i]);
    shown[i] = finals[i];
    renderRollChips(shown, Math.min(i + 1, C - 1), S);
  }

  const sum = finals.reduce((a, b) => a + b, 0);
  const total = sum + B;

// Показ значения
if (diceVizValue) diceVizValue.textContent = String(total);
renderRollChips(shown, -1, S);

const critType = getSingleD20CritType({
  sides: S,
  count: C,
  rolls: finals,
  kindText
});
let critNote = "";
if (critType) {
  critNote = applySingleD20CritUI(finals[0], critType);
} else {
  clearCritUI();
}

  // отправим событие (если не silent)
  // Лог формируется на сервере (RPC add_dice_event) — чтобы не было дублей.
  if (!silent) {
    try {
      if (typeof sendMessage === "function") {
        const actor = String(actorName || '').trim();
        const fromName = actor || ((typeof myNameSpan !== 'undefined' && myNameSpan?.textContent) ? String(myNameSpan.textContent) : '');
        sendMessage({
          type: "diceEvent",
          event: {
            fromId: (typeof myId !== 'undefined') ? String(myId) : '',
            fromName,
            kindText: kindText ? String(kindText) : `d${S} × ${C}`,
            sides: S,
            count: C,
            bonus: B,
            rolls: finals,
            total: total,
            crit: critType
          }
        });
      }
    } catch {}
  }

  diceAnimBusy = false;

  return { sides: S, count: C, bonus: B, rolls: finals, sum, total };
};
