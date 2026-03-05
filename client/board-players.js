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
function renderWallEdges(state, layerEl) {
  if (!layerEl) return;

  const CELL = 50;
  const stWalls = Array.isArray(state?.walls) ? state.walls : [];

  // Remove previous nodes
  layerEl.innerHTML = '';
  // Reset incremental DOM cache for optimistic updates
  try { window.__wallEdgeDomMap = new Map(); } catch {}

  const bw = Number(state?.boardWidth) || boardWidth || 10;
  const bh = Number(state?.boardHeight) || boardHeight || 10;
  layerEl.style.width = `${bw * CELL}px`;
  layerEl.style.height = `${bh * CELL}px`;

  for (const w of stWalls) {
    if (!w || typeof w !== 'object') continue;
    const x = Number(w.x);
    const y = Number(w.y);
    const dir = String(w.dir || '').toUpperCase();
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (dir !== 'N' && dir !== 'E' && dir !== 'S' && dir !== 'W') continue;

    const type = String(w.type || 'stone').toLowerCase();
    const thickness = Math.max(1, Math.min(12, Number(w.thickness) || 4));

    const el = document.createElement('div');
    el.className = `wall-edge wall-type-${type}`;
    el.style.setProperty('--t', `${thickness}px`);

    // Position
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

    layerEl.appendChild(el);
    try { window.__wallEdgeDomMap?.set?.(`${x},${y},${dir}`, el); } catch {}
  }
}

// ================== OPTIMISTIC WALL UPDATES (GM drawing feels instant) ==================
// controlbox.js dispatches CustomEvent('dnd_local_wall_edges', { detail:{ mode, edges } })
// We update the walls layer immediately, without waiting for server/state echo.
(function wireLocalWallEdges() {
  function ensureLayer() {
    return board?.querySelector?.('#walls-layer') || document.getElementById('walls-layer');
  }

  function makeEdgeEl(w) {
    const CELL = 50;
    const x = Number(w?.x);
    const y = Number(w?.y);
    const dir = String(w?.dir || '').toUpperCase();
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (dir !== 'N' && dir !== 'E' && dir !== 'S' && dir !== 'W') return null;

    const type = String(w?.type || 'stone').toLowerCase();
    const thickness = Math.max(1, Math.min(12, Number(w?.thickness) || 4));

    const el = document.createElement('div');
    el.className = `wall-edge wall-type-${type}`;
    el.style.setProperty('--t', `${thickness}px`);
    el.dataset.wallKey = `${x},${y},${dir}`;

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
  window.addEventListener('dnd_local_wall_edges', (ev) => {
    try {
      const d = ev?.detail || {};
      applyLocalEdges(String(d.mode || ''), d.edges);
    } catch {}
  });
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

  window.addEventListener('dnd_wall_preview', (ev) => {
    try {
      const d = ev?.detail || {};
      renderPreview(d.edges);
    } catch {}
  });
  window.addEventListener('dnd_wall_preview_clear', () => {
    try { clearPreview(); } catch {}
  });
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

function upsertSheetNumber(player, path, value) {
  const pid = String(player?.id || '');
  if (!pid) return;
  const current = players.find(p => String(p?.id) === pid);
  if (!current) return;
  const nextSheet = deepClone(current.sheet || { parsed: {} });
  if (!nextSheet.parsed || typeof nextSheet.parsed !== 'object') nextSheet.parsed = {};
  const { parent, key } = ensureSheetPath(nextSheet.parsed, path);
  if (!parent || !key) return;
  if (!parent[key] || typeof parent[key] !== 'object') parent[key] = {};
  parent[key].value = value;
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
    main.innerHTML = `<div class="fill"></div><div class="txt"></div>`;
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

  // If temp HP exists, show it inside the same bar (and style as temp).
  const tempVal = (hpTemp !== null ? Math.max(0, hpTemp) : 0);
  const showTemp = tempVal > 0;

  const pct = (!showTemp && max > 0)
    ? Math.max(0, Math.min(100, Math.round((cur / max) * 100)))
    : 100;

  bar.style.display = 'block';
  bar.style.width = `${size * 50}px`;
  bar.style.left = `${tokenEl.offsetLeft}px`;
  bar.style.top = `${tokenEl.offsetTop - 14}px`;

  const fill = bar.querySelector('.fill');
  const txt = bar.querySelector('.txt');
  if (fill) fill.style.width = `${pct}%`;
  if (showTemp) {
    bar.classList.add('token-hpbar--temp');
    if (txt) txt.textContent = `${tempVal}`;
  } else {
    bar.classList.remove('token-hpbar--temp');
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

function positionTokenMini(tokenEl) {
  if (!tokenMiniEl || !tokenEl) return;
  // ставим примерно над токеном, по центру
  const left = tokenEl.offsetLeft + (tokenEl.offsetWidth / 2);
  const top = tokenEl.offsetTop - 8;
  tokenMiniEl.style.left = `${left}px`;
  tokenMiniEl.style.top = `${top}px`;
  tokenMiniEl.style.transform = 'translate(-50%, -100%)';

  // держим в пределах поля (по возможности)
  const b = board.getBoundingClientRect();
  const r = tokenMiniEl.getBoundingClientRect();
  let dx = 0;
  let dy = 0;
  if (r.left < b.left) dx = b.left - r.left + 6;
  if (r.right > b.right) dx = -(r.right - b.right + 6);
  if (r.top < b.top) dy = b.top - r.top + 6;
  if (dx || dy) {
    const curLeft = Number(tokenMiniEl.style.left.replace('px','')) || left;
    const curTop = Number(tokenMiniEl.style.top.replace('px','')) || top;
    tokenMiniEl.style.left = `${curLeft + dx}px`;
    tokenMiniEl.style.top = `${curTop + dy}px`;
  }
}

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

  const card = document.createElement('div');
  card.className = 'token-mini';
  card.innerHTML = `
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

  const applyHp = () => {
    const cur = safeNum(hpCurInput?.value, 0) ?? 0;
    const max = safeNum(hpMaxInput?.value, 0) ?? 0;
    upsertSheetNumber(p, 'vitality.hp-max', Math.max(0, max));
    upsertSheetNumber(p, 'vitality.hp-current', Math.max(0, Math.min(Math.max(0, max), cur)));
    // сразу обновим полоску
    updateHpBar(p, tokenEl);
  };

  // Instant feedback while typing; network update is debounced in upsertSheetNumber.
  hpCurInput?.addEventListener('input', applyHp);
  hpMaxInput?.addEventListener('input', applyHp);
  hpCurInput?.addEventListener('change', applyHp);
  hpMaxInput?.addEventListener('change', applyHp);

  const applyDelta = (sign) => {
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

  sheetBtn?.addEventListener('click', () => {
    // extra safety
    try {
      if (typeof canViewSensitiveInfo === 'function' && !canViewSensitiveInfo(p)) return;
    } catch {}
    window.InfoModal?.open?.(p);
  });

  board.appendChild(card);
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
    // Имя под токеном (рамочка)
    el.innerHTML = `<span class="token-label"></span>`;
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
        if (selectedPlayer) {
          const prev = playerElements.get(selectedPlayer.id);
          if (prev) prev.classList.remove('selected');
        }
        selectedPlayer = cur;
        el.classList.add('selected');
      }
    });

    // двойной клик — мини-окно со статами
    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();

      const cur = players.find(pp => String(pp?.id) === pid) || player;

      // If token is selected, unselect it to prevent accidental move on board click.
      try {
        if (selectedPlayer && String(selectedPlayer.id) === pid) {
          const prev = playerElements.get(selectedPlayer.id);
          if (prev) prev.classList.remove('selected');
          selectedPlayer = null;
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

  // ================== GM "eye" visibility ==================
  // If GM has hidden a GM-owned non-ally token (eye OFF), non-GM users must NEVER see it.
  // Previously, token movement could briefly render the element before other UI updates hid it.
  // Fix: enforce the visibility rule directly in setPlayerPosition before we set display/coords.
  if (asPlayerView && isGmHidden && !player.isPublic) {
    // If token is selected locally (shouldn't happen for players), clear selection.
    try {
      if (selectedPlayer && String(selectedPlayer.id) === String(player.id)) {
        el.classList.remove('selected');
        selectedPlayer = null;
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

  const player = {
    name,
    color: playerColorInput.value,
    size: parseInt(playerSizeInput.value, 10),
    isBase: !!isBaseCheckbox?.checked,
    isAlly: !!isAllyCheckbox?.checked
  };

  sendMessage({ type: 'addPlayer', player });

  playerNameInput.value = '';
  if (isBaseCheckbox && !isBaseCheckbox.disabled) isBaseCheckbox.checked = false;
  if (isAllyCheckbox) isAllyCheckbox.checked = false;
});

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

  sendMessage({ type: 'movePlayer', id: selectedPlayer.id, x, y });
  const el = playerElements.get(selectedPlayer.id);
  if (el) el.classList.remove('selected');
  selectedPlayer = null;
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

    // Find the DOM element of the base token (more robust with zoom/transform than using scrollLeft math).
    const tokenEl = (baseP && baseP.element) ? baseP.element : (playerElements.get(baseP.id) || null);
    if (!tokenEl) {
      arrow.style.display = 'none';
      return;
    }

    const wrapRect = wrap.getBoundingClientRect();
    const tokRect = tokenEl.getBoundingClientRect();

    const tokenCx = tokRect.left + tokRect.width / 2;
    const tokenCy = tokRect.top + tokRect.height / 2;

    // Visible area (in screen coordinates), slightly inset so arrow doesn't overlap borders.
    const left = wrapRect.left + EDGE_PAD;
    const right = wrapRect.right - EDGE_PAD;
    const top = wrapRect.top + EDGE_PAD;
    const bottom = wrapRect.bottom - EDGE_PAD;

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

  function wire() {
    const wrap = getBoardWrapper();
    if (!wrap) return;

    // Update on scroll/resize.
    wrap.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    try { document.addEventListener('visibilitychange', scheduleUpdate); } catch {}

    // Periodic safety update.
    setInterval(scheduleUpdate, 300);

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

  // крит-подсветку оставляем только для чистого d20 (без бонуса)
  if (sides === 20 && count === 1 && bonus === 0 && rolls.length === 1) {
    applyPureD20CritUI(rolls[0]);
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

function applyPureD20CritUI(finalValue) {
  // крит только для "чистого" d20 (без бонуса), поэтому сюда передаём значение когда условия уже проверены
  clearCritUI();

  if (finalValue === 1) {
    if (diceVizValue) diceVizValue.classList.add("crit-fail");
    const chip = diceRolls?.querySelector(".dice-chip");
    if (chip) chip.classList.add("crit-fail");
    return " — КРИТИЧЕСКИЙ ПРОВАЛ (1)";
  }

  if (finalValue === 20) {
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

// ===== other players dice feed =====
let diceOthersWrap = null;

function ensureDiceOthersUI() {
  if (diceOthersWrap) return diceOthersWrap;

  diceOthersWrap = document.createElement('div');
  diceOthersWrap.className = 'dice-others';
  diceOthersWrap.innerHTML = `<div class="dice-others__title">Броски других</div>`;
  document.body.appendChild(diceOthersWrap);

  return diceOthersWrap;
}

function pushOtherDice(ev) {
  // не показываем свои же броски
  if (ev?.fromId && typeof myId !== 'undefined' && ev.fromId === myId) return;

  ensureDiceOthersUI();

  const item = document.createElement('div');
  item.className = 'dice-others__item';

  if (ev.crit === 'crit-fail') item.classList.add('crit-fail');
  if (ev.crit === 'crit-success') item.classList.add('crit-success');

  const head = `${ev.fromName || 'Игрок'}: ${ev.kindText || `d${ev.sides} × ${ev.count}`}`;
  const rollsText = (ev.rolls && ev.rolls.length) ? ev.rolls.join(' + ') : '-';

  // Для одиночного броска с бонусом показываем компактно: "12+4=16"
  let body = `${rollsText} = ${ev.total}`;
  const bonusNum = Number(ev.bonus) || 0;
  if (Number(ev.count) === 1 && bonusNum !== 0 && Array.isArray(ev.rolls) && ev.rolls.length === 1) {
    const r = Number(ev.rolls[0]) || 0;
    const sign = bonusNum >= 0 ? '+' : '-';
    body = `${r}${sign}${Math.abs(bonusNum)}=${ev.total}`;
  }

  item.innerHTML = `
    <div class="dice-others__head">${escapeHtmlLocal(head)}</div>
    <div class="dice-others__body">${escapeHtmlLocal(body)}</div>
  `;

  diceOthersWrap.appendChild(item);

  // затухание и удаление
  setTimeout(() => item.classList.add('fade'), 4200);
  setTimeout(() => item.remove(), 5200);
}

// маленький экранировщик (чтобы имена не ломали HTML)
function escapeHtmlLocal(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


// ===== API: programmatic dice rolls (used by InfoModal weapons) =====
window.DicePanel = window.DicePanel || {};
// Programmatic dice roll used by InfoModal etc.
// If silent=true, it will only animate/update the local dice panel UI and will NOT send log/diceEvent.
// Returns: {sides,count,bonus,rolls,sum,total}
window.DicePanel.roll = async ({ sides = 20, count = 1, bonus = 0, kindText = null, silent = false } = {}) => {
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

// ✅ крит-подсветка ТОЛЬКО для чистого d20 (без бонуса)
let critNote = "";
if (S === 20 && C === 1 && B === 0) {
  critNote = applyPureD20CritUI(finals[0]);
} else {
  clearCritUI();
}

  // отправим событие (если не silent)
  // Лог формируется на сервере (RPC add_dice_event) — чтобы не было дублей.
  if (!silent) {
    try {
      if (typeof sendMessage === "function") {
        sendMessage({
          type: "diceEvent",
          event: {
            fromId: (typeof myId !== 'undefined') ? String(myId) : '',
            fromName: (typeof myNameSpan !== 'undefined' && myNameSpan?.textContent) ? String(myNameSpan.textContent) : '',
            kindText: kindText ? String(kindText) : `d${S} × ${C}`,
            sides: S,
            count: C,
            bonus: B,
            rolls: finals,
            total: total,
            crit: (S === 20 && C === 1 && B === 0)
              ? (finals[0] === 1 ? "crit-fail" : finals[0] === 20 ? "crit-success" : "")
              : ""
          }
        });
      }
    } catch {}
  }

  diceAnimBusy = false;

  return { sides: S, count: C, bonus: B, rolls: finals, sum, total };
};

