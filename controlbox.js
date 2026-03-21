// controlbox.js — управление полем/фазами/окружением (выделено из client.js)
//
// Подключение: index.html должен загрузить этот файл ДО client.js.
// client.js после инициализации вызовет window.initControlBox({...})

(function () {
  const CELL = 50;

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function readIntLs(key, fallback) {
    const raw = (typeof getAppStorageItem === "function" ? getAppStorageItem(key) : localStorage.getItem(key));
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }
  function writeIntLs(key, n) {
    try { (typeof setAppStorageItem === "function" ? setAppStorageItem(key, String(n)) : localStorage.setItem(key, String(n))); } catch {}
  }

  const LEGACY_EVENT_PREFIX = ['d', 'n', 'd'].join('');
  const legacyEventName = (name) => `${LEGACY_EVENT_PREFIX}_${String(name || '').trim()}`;

  // ВАЖНО: controlbox не знает про Supabase/DB — он дергает sendMessage и дергает callback'и из client.js
  window.initControlBox = function initControlBox(ctx) {
    // ctx: { sendMessage, isGM, isSpectator, onViewportChange, getState, boardEl, boardWrapperEl, applyRoleToUI }
    if (!ctx || typeof ctx !== "object") return;

    const board = ctx.boardEl || document.getElementById('game-board');
    const boardWrapper = ctx.boardWrapperEl || document.getElementById('board-wrapper');

    const viewportWInput = document.getElementById('board-width');
    const viewportHInput = document.getElementById('board-height');
    const cellFeetGmInput = document.getElementById('cell-feet-gm');
    const applyViewportBtn = document.getElementById('create-board');

    const gmWInput = document.getElementById('board-width-gm');
    const gmHInput = document.getElementById('board-height-gm');
    const applyGmBtn = document.getElementById('create-board-gm');

    // phases
    const startExplorationBtn = document.getElementById("start-exploration");
    const startInitiativeBtn = document.getElementById("start-initiative");
    const startCombatBtn = document.getElementById("start-combat");

    // env editor
    const editEnvBtn = document.getElementById('edit-environment');
    const addWallBtn = document.getElementById('add-wall');
    const removeWallBtn = document.getElementById('remove-wall');
    const wallToolSel = document.getElementById('wall-tool');
    const wallTypeSel = document.getElementById('wall-type');
    const wallThicknessSel = document.getElementById('wall-thickness');
    const clearBoardBtn = document.getElementById('clear-board');
    const resetGameBtn = document.getElementById('reset-game');

    // ===== Viewport (персональная ширина/высота рамки) =====
    const LS_VW = "int_viewport_cols";
    const LS_VH = "int_viewport_rows";
    // По умолчанию рамка 10x10 (персональная настройка, хранится в localStorage)
    let viewportCols = clamp(readIntLs(LS_VW, Number(viewportWInput?.value) || 10), 5, 80);
    let viewportRows = clamp(readIntLs(LS_VH, Number(viewportHInput?.value) || 10), 5, 80);

    if (viewportWInput) viewportWInput.value = String(viewportCols);
    if (viewportHInput) viewportHInput.value = String(viewportRows);

    // делаем полосу прокрутки (включаем overflow) + задаем размер рамки в пикселях
    function applyViewportToWrapper() {
      if (!boardWrapper) return;
      boardWrapper.style.overflow = 'auto';
      boardWrapper.style.width = `${viewportCols * CELL}px`;
      boardWrapper.style.height = `${viewportRows * CELL}px`;
    }

    function setViewport(cols, rows) {
      viewportCols = clamp(Number(cols) || viewportCols, 5, 80);
      viewportRows = clamp(Number(rows) || viewportRows, 5, 80);
      if (viewportWInput) viewportWInput.value = String(viewportCols);
      if (viewportHInput) viewportHInput.value = String(viewportRows);
      writeIntLs(LS_VW, viewportCols);
      writeIntLs(LS_VH, viewportRows);
      applyViewportToWrapper();
      try { ctx.onViewportChange?.({ cols: viewportCols, rows: viewportRows }); } catch {}
    }

    applyViewportToWrapper();

    applyViewportBtn?.addEventListener('click', () => {
      if (ctx.isSpectator?.()) return;
      const cols = Number(viewportWInput?.value);
      const rows = Number(viewportHInput?.value);
      if (!Number.isFinite(cols) || !Number.isFinite(rows)) return;
      setViewport(cols, rows);
    });

    // ===== GM Map Size (размер "внутреннего поля" в клетках) =====
    function refreshGmInputsFromState() {
      const st = ctx.getState?.();
      if (!st) return;
      if (gmWInput) gmWInput.value = String(st.boardWidth ?? 10);
      if (gmHInput) gmHInput.value = String(st.boardHeight ?? 10);
      if (cellFeetGmInput) cellFeetGmInput.value = String(Math.max(1, Math.min(100, Number(st.cellFeet) || 10)));
    }

    // эти инпуты видны только GM (в client.js applyRoleToUI), но логика тут
    applyGmBtn?.addEventListener('click', () => {
      if (!ctx.isGM?.()) return;
      const w = clamp(Number(gmWInput?.value) || 10, 5, 150);
      const h = clamp(Number(gmHInput?.value) || 10, 5, 150);
      if (gmWInput) gmWInput.value = String(w);
      if (gmHInput) gmHInput.value = String(h);
      ctx.sendMessage?.({ type: 'resizeBoard', width: w, height: h });
    });

    let lastSentCellFeet = null;

    function syncCellFeetPreview(value) {
      const playerValue = document.getElementById('cell-feet-player-value');
      if (playerValue) playerValue.textContent = String(value);
    }

    function submitCellFeet(rawValue) {
      if (!ctx.isGM?.()) return;
      const value = clamp(Number(rawValue) || 10, 1, 100);
      if (cellFeetGmInput) cellFeetGmInput.value = String(value);
      syncCellFeetPreview(value);
      if (lastSentCellFeet === value) return;
      lastSentCellFeet = value;
      ctx.sendMessage?.({ type: 'setCellFeet', value });
    }

    cellFeetGmInput?.addEventListener('input', () => {
      submitCellFeet(cellFeetGmInput?.value);
    });

    cellFeetGmInput?.addEventListener('change', () => {
      submitCellFeet(cellFeetGmInput?.value);
    });

    cellFeetGmInput?.addEventListener('blur', () => {
      submitCellFeet(cellFeetGmInput?.value);
    });

    // ===== Zoom (Ctrl + Wheel) =====
    let zoom = 1;
    function applyZoom() {
      if (!board) return;
      board.style.transformOrigin = '0 0';
      board.style.transform = `scale(${zoom})`;
      try { window.refreshOpenTokenMini?.(); } catch {}
    }
    applyZoom();

    boardWrapper?.addEventListener('wheel', (e) => {
      // Чтобы скролл работал нормально — зум только при зажатом Ctrl
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = Math.sign(e.deltaY || 0);
      const next = clamp(zoom + (delta > 0 ? -0.1 : 0.1), 0.4, 2.5);
      if (Math.abs(next - zoom) < 1e-6) return;
      zoom = next;
      applyZoom();
    }, { passive: false });

    // ===== World phases (GM only) =====
    function applyLocalPhaseUi(kind) {
      try {
        [startExplorationBtn, startInitiativeBtn, startCombatBtn].forEach((btn) => btn?.classList.remove('active', 'ready', 'pending'));
        if (startExplorationBtn) startExplorationBtn.style.color = '#fff';
        if (startInitiativeBtn) startInitiativeBtn.style.color = '#fff';
        if (startCombatBtn) startCombatBtn.style.color = '#fff';
        if (kind === 'exploration') startExplorationBtn?.classList.add('active');
        if (kind === 'initiative') startInitiativeBtn?.classList.add('active');
        if (kind === 'combat') startCombatBtn?.classList.add('active');
      } catch {}
    }

    startExplorationBtn?.addEventListener("click", () => {
      if (!ctx.isGM?.()) return;
      applyLocalPhaseUi('exploration');
      ctx.sendMessage?.({ type: "startExploration" });
    });
    startInitiativeBtn?.addEventListener("click", () => {
      if (!ctx.isGM?.()) return;
      applyLocalPhaseUi('initiative');
      ctx.sendMessage?.({ type: "startInitiative" });
    });
    startCombatBtn?.addEventListener("click", () => {
      if (!ctx.isGM?.()) return;
      applyLocalPhaseUi('combat');
      ctx.sendMessage?.({ type: "startCombat" });
    });

    // ===== Environment editor (GM only) =====
    let editEnvironment = false;
    let wallMode = null; // 'add' | 'remove'
    let mouseDown = false;

    // tool: brush | line | rect
    let wallTool = String(wallToolSel?.value || 'brush');
    let wallType = String(wallTypeSel?.value || 'stone');
    let wallThickness = Number(wallThicknessSel?.value || 4);

    // ===== Draft (local) walls: GM can draw without network lag, then publish/reset =====
    let draftEnabled = false;
    const draftMap = new Map(); // key -> { mode, edge }
    const draftChk = document.getElementById('wall-draft');
    const draftUploadBtn = document.getElementById('wall-draft-upload');
    const draftResetBtn = document.getElementById('wall-draft-reset');
    const draftInfo = document.getElementById('wall-draft-info');

    function keyEdge(x, y, dir) { return `${x},${y},${dir}`; }

    function refreshDraftUi() {
      const n = draftMap.size;
      const on = !!draftEnabled;
      if (draftUploadBtn) draftUploadBtn.disabled = !(on && n > 0);
      if (draftResetBtn) draftResetBtn.disabled = !(on && n > 0);
      if (draftInfo) draftInfo.textContent = on ? (n ? `Изменений: ${n}` : 'Пусто') : '';
    }

    function addToDraft(mode, edge) {
      const m = String(mode || '');
      const e = edge || {};
      const x = Number(e.x);
      const y = Number(e.y);
      const dir = String(e.dir || '').toUpperCase();
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (!(dir === 'N' || dir === 'E' || dir === 'S' || dir === 'W')) return;
      const k = keyEdge(x, y, dir);
      if (m === 'add') draftMap.set(k, { mode: 'add', edge: { x, y, dir, type: e.type, thickness: e.thickness } });
      else if (m === 'remove') draftMap.set(k, { mode: 'remove', edge: { x, y, dir } });
      refreshDraftUi();
    }

    function publishDraft() {
      if (!draftEnabled) return;
      if (!draftMap.size) return;
      const adds = [];
      const removes = [];
      for (const v of draftMap.values()) {
        if (!v) continue;
        if (v.mode === 'add') adds.push(v.edge);
        else if (v.mode === 'remove') removes.push(v.edge);
      }
      // removals first, then adds
      if (removes.length) ctx.sendMessage?.({ type: 'bulkWallEdges', mode: 'remove', edges: removes });
      if (adds.length) ctx.sendMessage?.({ type: 'bulkWallEdges', mode: 'add', edges: adds });
      draftMap.clear();
      refreshDraftUi();
    }

    function resetDraft() {
      if (!draftEnabled) return;
      if (!draftMap.size) return;
      draftMap.clear();
      refreshDraftUi();
      // Redraw from current room state to discard optimistic local edits
      try {
        const st = ctx.getState?.();
        if (st && typeof window.renderBoard === 'function') window.renderBoard(st);
      } catch {}
    }

    const readWallUi = () => {
      wallTool = String(wallToolSel?.value || 'brush');
      wallType = String(wallTypeSel?.value || 'stone');
      wallThickness = Math.max(1, Math.min(12, Number(wallThicknessSel?.value || 4)));
      draftEnabled = !!(draftChk?.checked);
    };
    wallToolSel?.addEventListener('change', readWallUi);
    wallTypeSel?.addEventListener('change', readWallUi);
    wallThicknessSel?.addEventListener('change', readWallUi);

    draftChk?.addEventListener('change', () => {
      draftEnabled = !!draftChk.checked;
      // When turning off draft, don't keep stale draft changes
      if (!draftEnabled) {
        draftMap.clear();
        try {
          const st = ctx.getState?.();
          if (st && typeof window.renderBoard === 'function') window.renderBoard(st);
        } catch {}
      }
      refreshDraftUi();
    });
    draftUploadBtn?.addEventListener('click', () => {
      if (!ctx.isGM?.()) return;
      publishDraft();
    });
    draftResetBtn?.addEventListener('click', () => {
      if (!ctx.isGM?.()) return;
      resetDraft();
    });
    refreshDraftUi();

    // batch changes for one gesture
    let dragTouched = new Set(); // "x,y,dir"

    // For line/rect tools
    let dragStart = null; // {x,y,dir}

    function setEnvButtons() {
      const gm = !!ctx.isGM?.();
      if (editEnvBtn) editEnvBtn.disabled = !gm;
      if (addWallBtn) addWallBtn.disabled = !(gm && editEnvironment);
      if (removeWallBtn) removeWallBtn.disabled = !(gm && editEnvironment);
      if (clearBoardBtn) clearBoardBtn.disabled = !gm;
      if (resetGameBtn) resetGameBtn.disabled = !gm;

      // UI: подсветка режимов
      if (editEnvBtn) editEnvBtn.classList.toggle('is-on', !!editEnvironment);
      if (addWallBtn) addWallBtn.classList.toggle('is-active', !!editEnvironment && wallMode === 'add');
      if (removeWallBtn) removeWallBtn.classList.toggle('is-active', !!editEnvironment && wallMode === 'remove');
    }

    editEnvBtn?.addEventListener('click', () => {
      if (!ctx.isGM?.()) return;
      editEnvironment = !editEnvironment;
      wallMode = null;
      dragTouched = new Set();
      dragStart = null;
      if (editEnvBtn) {
        editEnvBtn.textContent = editEnvironment ? "Редактирование окружения: ВКЛ" : "Редактирование окружения: ВЫКЛ";
      }
      setEnvButtons();
    });

    addWallBtn?.addEventListener('click', () => {
      if (!ctx.isGM?.()) return;
      wallMode = 'add';
      setEnvButtons();
    });
    removeWallBtn?.addEventListener('click', () => {
      if (!ctx.isGM?.()) return;
      wallMode = 'remove';
      setEnvButtons();
    });

    clearBoardBtn?.addEventListener('click', () => {
      if (!ctx.isGM?.()) return;
      // Safety: require explicit confirmation before wiping the whole board.
      // (Requested by user)
      const ok = window.confirm('Очистить поле? Это удалит стены, обозначения, туман войны и другие данные карты.');
      if (!ok) return;
      ctx.sendMessage?.({ type: 'clearBoard' });
    });

    resetGameBtn?.addEventListener('click', () => {
      if (!ctx.isGM?.()) return;
      ctx.sendMessage?.({ type: 'resetGame' });
    });

    function edgeFromPointer(cell, e) {
      try {
        if (!cell || !e) return null;
        const x = Number(cell?.dataset?.x);
        const y = Number(cell?.dataset?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        const rect = cell.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width;
        const py = (e.clientY - rect.top) / rect.height;
        // choose nearest edge
        const dN = py;
        const dS = 1 - py;
        const dW = px;
        const dE = 1 - px;
        const m = Math.min(dN, dS, dW, dE);
        let dir = 'N';
        if (m === dE) dir = 'E';
        else if (m === dS) dir = 'S';
        else if (m === dW) dir = 'W';
        else dir = 'N';
        return { x, y, dir };
      } catch {
        return null;
      }
    }

    function touchEdge(edge) {
      if (!edge) return;
      const x = Number(edge.x), y = Number(edge.y);
      const dir = String(edge.dir || '').toUpperCase();
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (dir !== 'N' && dir !== 'E' && dir !== 'S' && dir !== 'W') return;
      const k = keyEdge(x, y, dir);
      if (dragTouched.has(k)) return;
      dragTouched.add(k);
    }

    function edgesForRect(a, b) {
      // rectangle perimeter in cell coordinates (inclusive)
      const x1 = Math.min(a.x, b.x);
      const x2 = Math.max(a.x, b.x);
      const y1 = Math.min(a.y, b.y);
      const y2 = Math.max(a.y, b.y);
      const out = [];

      for (let x = x1; x <= x2; x++) {
        out.push({ x, y: y1, dir: 'N' });
        out.push({ x, y: y2, dir: 'S' });
      }
      for (let y = y1; y <= y2; y++) {
        out.push({ x: x1, y, dir: 'W' });
        out.push({ x: x2, y, dir: 'E' });
      }
      return out;
    }

    function edgesForLine(a, b) {
      // Strictly horizontal OR strictly vertical (based on drag direction).
      const out = [];
      const ax = Number(a?.x) || 0;
      const ay = Number(a?.y) || 0;
      const bx = Number(b?.x) || 0;
      const by = Number(b?.y) || 0;
      const dx = Math.abs(bx - ax);
      const dy = Math.abs(by - ay);

      // Decide axis: dominant movement
      const horizontal = (dx >= dy);

      if (horizontal) {
        const y = ay;
        const dir = (String(a?.dir || '').toUpperCase() === 'S') ? 'S' : 'N';
        const step = (bx >= ax) ? 1 : -1;
        for (let x = ax; x !== bx + step; x += step) {
          out.push({ x, y, dir });
        }
      } else {
        const x = ax;
        const dir = (String(a?.dir || '').toUpperCase() === 'W') ? 'W' : 'E';
        const step = (by >= ay) ? 1 : -1;
        for (let y = ay; y !== by + step; y += step) {
          out.push({ x, y, dir });
        }
      }
      return out;
    }

    function dispatchCompatEvent(names, detail) {
      const list = Array.isArray(names) ? names : [names];
      list.forEach((name) => {
        try { window.dispatchEvent(new CustomEvent(String(name), { detail })); } catch {}
      });
    }

    function setWallPreview(edges) {
      dispatchCompatEvent(['int_wall_preview', legacyEventName('wall_preview')], { edges });
    }

    function clearWallPreview() {
      dispatchCompatEvent(['int_wall_preview_clear', legacyEventName('wall_preview_clear')]);
    }

    // ===== NEW WALL INPUT MODEL =====
    // brush: like "Поли" in marks — click to add segments, preview follows mouse.
    // line/rect: first click sets start, second click sets end (no hold).
    // point: one click toggles a single edge under cursor.

    let clickStart = null;      // for line/rect (edge)
    let polyActive = false;     // for brush/poly
    let polyLast = null;        // last edge point (edge)

    function applyWallEdges(changed) {
      if (!changed || !changed.length) return;
      // optimistic
      dispatchCompatEvent(['int_local_wall_edges', legacyEventName('local_wall_edges')], { mode: wallMode, edges: changed });

      if (draftEnabled) {
        for (const ed of changed) addToDraft(wallMode, ed);
      } else {
        ctx.sendMessage?.({ type: 'bulkWallEdges', mode: wallMode, edges: changed });
      }
    }

    function toChanged(edges) {
      const out = [];
      for (const ed of (edges || [])) {
        if (!ed) continue;
        const x = Number(ed.x), y = Number(ed.y);
        const d = String(ed.dir || '').toUpperCase();
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (d !== 'N' && d !== 'E' && d !== 'S' && d !== 'W') continue;
        if (wallMode === 'add') out.push({ x, y, dir: d, type: wallType, thickness: wallThickness });
        else out.push({ x, y, dir: d });
      }
      return out;
    }

    // Preview follows mouse after start click for line/rect OR after first poly click.
    board?.addEventListener('mousemove', (e) => {
      if (!ctx.isGM?.() || !editEnvironment || !wallMode) return;
      readWallUi();
      const cell = e.target.closest('.cell');
      if (!cell) return;
      const edge = edgeFromPointer(cell, e);
      if (!edge) return;

      if (wallTool === 'line' && clickStart) {
        const prev = edgesForLine(clickStart, edge).map(ed => ({ ...ed, type: wallType, thickness: wallThickness }));
        setWallPreview(prev);
      } else if (wallTool === 'rect' && clickStart) {
        const prev = edgesForRect(clickStart, edge).map(ed => ({ ...ed, type: wallType, thickness: wallThickness }));
        setWallPreview(prev);
      } else if (wallTool === 'brush' && polyActive && polyLast) {
        // For brush/poly preview use a line from last to hover.
        const prev = edgesForLine(polyLast, edge).map(ed => ({ ...ed, type: wallType, thickness: wallThickness }));
        setWallPreview(prev);
      } else {
        // no active gesture
        clearWallPreview();
      }
    }, { passive: true });

    // End/cancel helpers
    function resetWallGesture() {
      clickStart = null;
      polyActive = false;
      polyLast = null;
      clearWallPreview();
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') resetWallGesture();
    });

    // Use CLICK for all tools.
    board?.addEventListener('click', (e) => {
      if (!ctx.isGM?.() || !editEnvironment || !wallMode) return;
      const cell = e.target.closest('.cell');
      if (!cell) return;

      readWallUi();
      const edge = edgeFromPointer(cell, e);
      if (!edge) return;

      // point: immediate
      if (wallTool === 'point') {
        applyWallEdges(toChanged([edge]));
        return;
      }

      // line/rect: 2-click
      if (wallTool === 'line' || wallTool === 'rect') {
        if (!clickStart) {
          clickStart = edge;
          clearWallPreview();
          return;
        }
        const edges = (wallTool === 'rect') ? edgesForRect(clickStart, edge) : edgesForLine(clickStart, edge);
        applyWallEdges(toChanged(edges));
        clickStart = null;
        clearWallPreview();
        return;
      }

      // brush/poly: like marks poly — every click extends from last point
      if (wallTool === 'brush') {
        if (!polyActive || !polyLast) {
          polyActive = true;
          polyLast = edge;
          clearWallPreview();
          return;
        }
        const seg = edgesForLine(polyLast, edge);
        applyWallEdges(toChanged(seg));
        polyLast = edge;
        clearWallPreview();
      }
    });

    // Double click finishes brush/poly sequence.
    board?.addEventListener('dblclick', (e) => {
      if (!ctx.isGM?.() || !editEnvironment || !wallMode) return;
      readWallUi();
      if (wallTool !== 'brush') return;
      resetWallGesture();
    });

    // ===== Campaign maps / sections (GM): Parameters modal =====
    const campaignParamsBtn = document.getElementById('campaign-params');
    const activeMapNameSpan = document.getElementById('campaign-active-map-name');

    let cmpOverlay = null;
    let cmpOpen = false;
    let lastCampaignState = null;

    function escapeHtml(s) {
      return String(s ?? '').replace(/[&<>\"]/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;'
      }[c] || c));
    }

    function ensureCmpOverlay() {
      if (cmpOverlay) return cmpOverlay;

      const overlay = document.createElement('div');
      overlay.className = 'cmp-overlay hidden';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.innerHTML = `
        <div class="cmp-modal" role="dialog" aria-modal="true">
          <div class="cmp-modal-header">
            <div class="cmp-modal-title">Параметры</div>
            <button class="cmp-modal-close" type="button" title="Закрыть">✕</button>
          </div>

          <div class="cmp-modal-body">
            <div class="cmp-toolbar">
              <button type="button" class="cmp-btn" data-cmp-create-section>Создать раздел</button>
              <button type="button" class="cmp-btn" data-cmp-create-map>Создать карту</button>
              <div style="flex:1"></div>
              <button type="button" class="cmp-btn" data-cmp-refresh>Обновить</button>
            </div>

            <div class="cmp-dialog hidden" data-cmp-dialog="create-map">
              <div class="cmp-dialog-title">Создать карту</div>
              <div class="cmp-dialog-row">
                <label>Раздел</label>
                <select data-cmp-create-map-section></select>
              </div>
              <div class="cmp-dialog-row">
                <label>Название</label>
                <input type="text" data-cmp-create-map-name />
              </div>
              <div class="cmp-dialog-actions">
                <button type="button" data-cmp-create-map-cancel>Отмена</button>
                <button type="button" data-cmp-create-map-ok>Создать</button>
              </div>
            </div>

            <div class="cmp-sections" data-cmp-sections></div>
          </div>
        </div>
      `;

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeCmp();
      });
      overlay.querySelector('.cmp-modal-close')?.addEventListener('click', closeCmp);
      overlay.querySelector('[data-cmp-refresh]')?.addEventListener('click', () => renderCampaignParams(lastCampaignState || ctx.getState?.() || null));

      // dialogs
      overlay.querySelector('[data-cmp-create-map-cancel]')?.addEventListener('click', () => setDialogVisible('create-map', false));
      overlay.querySelector('[data-cmp-create-map-ok]')?.addEventListener('click', () => {
        if (!ctx.isGM?.()) return;
        const st = lastCampaignState || ctx.getState?.() || null;
        const secSel = overlay.querySelector('[data-cmp-create-map-section]');
        const nameInp = overlay.querySelector('[data-cmp-create-map-name]');
        const sectionId = String(secSel?.value || '').trim();
        const name = String(nameInp?.value || '').trim();
        if (!sectionId) return alert('Выберите раздел');
        if (!name) return alert('Введите название карты');
        ctx.sendMessage?.({ type: 'createCampaignMap', sectionId, name });
        setDialogVisible('create-map', false);
        // обновим через приход нового state
      });

      // main event delegation
      overlay.addEventListener('click', (e) => {
        const t = (e.target instanceof Element) ? e.target : (e.target && e.target.parentElement);
        if (t?.closest?.('[data-cmp-create-section]')) {
          if (!ctx.isGM?.()) return;
          const st = lastCampaignState || ctx.getState?.() || null;
          const def = getNextDefaultSectionName(st);
          const name = prompt('Название раздела:', def);
          if (name === null) return;
          const clean = String(name).trim();
          if (!clean) return;
          ctx.sendMessage?.({ type: 'createMapSection', name: clean });
          return;
        }

        if (t?.closest?.('[data-cmp-create-map]')) {
          if (!ctx.isGM?.()) return;
          openCreateMapDialog(lastCampaignState || ctx.getState?.() || null);
          return;
        }

        const selBtn = t?.closest?.('[data-cmp-select-map]');
        if (selBtn) {
          if (!ctx.isGM?.()) return;
          const mapId = String(selBtn.getAttribute('data-cmp-select-map') || '').trim();
          if (!mapId) return;
          ctx.sendMessage?.({ type: 'switchCampaignMap', mapId });
          return;
        }

        const delMapBtn = t?.closest?.('[data-cmp-delete-map]');
        if (delMapBtn) {
          if (!ctx.isGM?.()) return;
          const mapId = String(delMapBtn.getAttribute('data-cmp-delete-map') || '').trim();
          const mapName = String(delMapBtn.getAttribute('data-cmp-delete-name') || '').trim();
          if (!mapId) return;
          if (!confirm(`Удалить карту "${mapName || 'Без названия'}"?`)) return;
          ctx.sendMessage?.({ type: 'deleteCampaignMap', mapId });
          return;
        }

        const renMapBtn = t?.closest?.('[data-cmp-rename-map]');
        if (renMapBtn) {
          if (!ctx.isGM?.()) return;
          const mapId = String(renMapBtn.getAttribute('data-cmp-rename-map') || '').trim();
          const curName = String(renMapBtn.getAttribute('data-cmp-rename-name') || '').trim();
          if (!mapId) return;
          const name = prompt('Новое название карты:', curName || 'Карта');
          if (name === null) return;
          const clean = String(name).trim();
          if (!clean) return;
          ctx.sendMessage?.({ type: 'renameCampaignMap', mapId, name: clean });
          return;
        }

        const moveMapBtn = t?.closest?.('[data-cmp-move-map]');
        if (moveMapBtn) {
          if (!ctx.isGM?.()) return;
          const mapId = String(moveMapBtn.getAttribute('data-cmp-move-map') || '').trim();
          const row = moveMapBtn.closest('.cmp-map-row');
          const sel = row?.querySelector?.('select[data-cmp-move-target]');
          const toSectionId = String(sel?.value || '').trim();
          if (!mapId || !toSectionId) return;
          ctx.sendMessage?.({ type: 'moveCampaignMap', mapId, toSectionId });
          return;
        }

        const renSecBtn = t?.closest?.('[data-cmp-rename-section]');
        if (renSecBtn) {
          if (!ctx.isGM?.()) return;
          const sectionId = String(renSecBtn.getAttribute('data-cmp-rename-section') || '').trim();
          const curName = String(renSecBtn.getAttribute('data-cmp-rename-name') || '').trim();
          if (!sectionId) return;
          const name = prompt('Новое название раздела:', curName || 'Раздел');
          if (name === null) return;
          const clean = String(name).trim();
          if (!clean) return;
          ctx.sendMessage?.({ type: 'renameMapSection', sectionId, name: clean });
          return;
        }

        const delSecBtn = t?.closest?.('[data-cmp-delete-section]');
        if (delSecBtn) {
          if (!ctx.isGM?.()) return;
          const sectionId = String(delSecBtn.getAttribute('data-cmp-delete-section') || '').trim();
          const secName = String(delSecBtn.getAttribute('data-cmp-delete-name') || '').trim();
          if (!sectionId) return;
          const st = lastCampaignState || ctx.getState?.() || null;
          const mapsIn = (Array.isArray(st?.maps) ? st.maps : []).filter(m => String(m?.sectionId || '') === sectionId);
          const sections = Array.isArray(st?.mapSections) ? st.mapSections : [];
          if (sections.length <= 1) {
            alert('Нельзя удалить последний раздел.');
            return;
          }

          if (!mapsIn.length) {
            if (!confirm(`Удалить раздел "${secName || 'Раздел'}"?`)) return;
            ctx.sendMessage?.({ type: 'deleteMapSection', sectionId, mode: 'delete' });
            return;
          }

          // если есть карты — спросим, переносить ли
          const move = confirm(`В разделе "${secName || 'Раздел'}" есть карты (${mapsIn.length}).\n\nOK — перенести карты в другой раздел и удалить раздел.\nОтмена — удалить раздел вместе с картами.`);
          if (move) {
            const other = sections.filter(s => String(s?.id) !== sectionId);
            const list = other.map((s, i) => `${i + 1}) ${s.name}`).join('\n');
            const pick = prompt(`Куда перенести карты?\n${list}`, '1');
            if (pick === null) return;
            const idx = Math.max(1, Math.min(other.length, Number(pick) || 1)) - 1;
            const targetSectionId = String(other[idx]?.id || '').trim();
            if (!targetSectionId) return;
            ctx.sendMessage?.({ type: 'deleteMapSection', sectionId, mode: 'move', targetSectionId });
          } else {
            if (!confirm(`Точно удалить раздел "${secName || 'Раздел'}" вместе со всеми картами?`)) return;
            ctx.sendMessage?.({ type: 'deleteMapSection', sectionId, mode: 'delete' });
          }
          return;
        }
      });

      document.body.appendChild(overlay);
      cmpOverlay = overlay;
      return overlay;
    }

    function setDialogVisible(which, visible) {
      const overlay = ensureCmpOverlay();
      const dlg = overlay.querySelector(`.cmp-dialog[data-cmp-dialog="${which}"]`);
      if (!dlg) return;
      dlg.classList.toggle('hidden', !visible);
    }

    function openCmp() {
      const overlay = ensureCmpOverlay();
      cmpOpen = true;
      overlay.classList.remove('hidden');
      overlay.setAttribute('aria-hidden', 'false');
      renderCampaignParams(lastCampaignState || ctx.getState?.() || null);
    }

    function closeCmp() {
      if (!cmpOverlay) return;
      cmpOpen = false;
      cmpOverlay.classList.add('hidden');
      cmpOverlay.setAttribute('aria-hidden', 'true');
      setDialogVisible('create-map', false);
    }

    function getNextDefaultSectionName(st) {
      const sections = Array.isArray(st?.mapSections) ? st.mapSections : [];
      const names = new Set(sections.map(s => String(s?.name || '').trim()).filter(Boolean));
      let i = sections.length + 1;
      while (names.has(`Раздел ${i}`)) i++;
      return `Раздел ${i}`;
    }

    function getNextDefaultMapName(st) {
      const maps = Array.isArray(st?.maps) ? st.maps : [];
      const names = new Set(maps.map(m => String(m?.name || '').trim()).filter(Boolean));
      let i = maps.length + 1;
      while (names.has(`Карта ${i}`) || names.has(`Карта ${i}`)) i++;
      // для совместимости используем без пробела (как пользователь просил ранее)
      return `Карта${i}`;
    }

    function openCreateMapDialog(st) {
      const overlay = ensureCmpOverlay();
      const sections = Array.isArray(st?.mapSections) ? st.mapSections : [];
      if (!sections.length) {
        alert('Сначала создайте раздел.');
        return;
      }
      const sel = overlay.querySelector('[data-cmp-create-map-section]');
      const inp = overlay.querySelector('[data-cmp-create-map-name]');
      if (sel) {
        sel.innerHTML = sections.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`).join('');
      }
      if (inp) inp.value = getNextDefaultMapName(st);
      setDialogVisible('create-map', true);
      try { inp?.focus?.(); inp?.select?.(); } catch {}
    }

    function renderCampaignParams(st) {
      const overlay = ensureCmpOverlay();
      lastCampaignState = st;
      const sectionsEl = overlay.querySelector('[data-cmp-sections]');
      if (!sectionsEl) return;

      const sections = Array.isArray(st?.mapSections) ? st.mapSections : [];
      const maps = Array.isArray(st?.maps) ? st.maps : [];
      const curId = String(st?.currentMapId || '');

      // подпись активной карты справа
      try {
        const active = maps.find(m => String(m?.id) === curId) || maps[0] || null;
        if (activeMapNameSpan) activeMapNameSpan.textContent = active?.name || '—';
      } catch {}

      if (!sections.length) {
        sectionsEl.innerHTML = `<div class="cmp-empty">Разделов пока нет. Нажмите «Создать раздел».</div>`;
        return;
      }

      const bySec = new Map();
      sections.forEach(s => bySec.set(String(s.id), []));
      maps.forEach(m => {
        const sid = String(m?.sectionId || sections[0]?.id || '');
        if (!bySec.has(sid)) bySec.set(sid, []);
        bySec.get(sid).push(m);
      });

      const sectionOptions = sections.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`).join('');

      sectionsEl.innerHTML = sections.map(s => {
        const sid = String(s.id);
        const arr = bySec.get(sid) || [];
        const mapsHtml = arr.length ? arr.map(m => {
          const mid = String(m?.id);
          const isActive = (mid === curId);
          const bw = Number(m?.boardWidth) || 10;
          const bh = Number(m?.boardHeight) || 10;
          return `
            <div class="cmp-map-row${isActive ? ' is-active' : ''}">
              <div>
                <div class="cmp-map-title">${escapeHtml(m?.name || 'Без названия')}</div>
                <div class="cmp-map-meta">${bw}×${bh} клеток</div>
              </div>
              <div class="cmp-map-actions">
                <button type="button" data-cmp-select-map="${escapeHtml(mid)}">Выбрать</button>
                <button type="button" data-cmp-rename-map="${escapeHtml(mid)}" data-cmp-rename-name="${escapeHtml(m?.name || '')}">Переименовать</button>
                <button type="button" data-cmp-delete-map="${escapeHtml(mid)}" data-cmp-delete-name="${escapeHtml(m?.name || '')}">Удалить</button>
                <div class="cmp-move">
                  <select data-cmp-move-target>
                    ${sections.map(sec => `<option value="${escapeHtml(sec.id)}" ${String(sec.id) === String(m?.sectionId) ? 'selected' : ''}>${escapeHtml(sec.name)}</option>`).join('')}
                  </select>
                  <button type="button" data-cmp-move-map="${escapeHtml(mid)}">Перенести</button>
                </div>
              </div>
            </div>
          `;
        }).join('') : `<div class="cmp-empty">В этом разделе пока нет карт.</div>`;

        return `
          <div class="cmp-section">
            <div class="cmp-section-head">
              <div class="cmp-section-name">${escapeHtml(s?.name || 'Раздел')}</div>
              <div class="cmp-section-actions">
                <button type="button" title="Переименовать" data-cmp-rename-section="${escapeHtml(sid)}" data-cmp-rename-name="${escapeHtml(s?.name || '')}">✎</button>
                <button type="button" title="Удалить раздел" data-cmp-delete-section="${escapeHtml(sid)}" data-cmp-delete-name="${escapeHtml(s?.name || '')}">🗑</button>
              </div>
            </div>
            <div class="cmp-maps">${mapsHtml}</div>
          </div>
        `;
      }).join('');

      // refresh create-map section list
      const sel = overlay.querySelector('[data-cmp-create-map-section]');
      if (sel) sel.innerHTML = sectionOptions;
    }

    campaignParamsBtn?.addEventListener('click', () => {
      if (!ctx.isGM?.()) return;
      openCmp();
    });

    // ===== initial =====
    setEnvButtons();
    refreshGmInputsFromState();

    // обновление инпутов при каждом новом state
    window.ControlBox = {
      setViewport,
      refreshGmInputsFromState,
      getViewport: () => ({ cols: viewportCols, rows: viewportRows }),
      getZoom: () => zoom
      ,
      openCampaignParams: () => { if (ctx.isGM?.()) openCmp(); },
      updateCampaignParams: (st) => {
        lastCampaignState = st;
        if (cmpOpen) renderCampaignParams(st);
        // даже если модалка закрыта — обновляем подпись активной карты
        try {
          const maps = Array.isArray(st?.maps) ? st.maps : [];
          const curId = String(st?.currentMapId || '');
          const active = maps.find(m => String(m?.id) === curId) || maps[0] || null;
          if (activeMapNameSpan) activeMapNameSpan.textContent = active?.name || '—';
        } catch {}
      }
    };
  };
})();
