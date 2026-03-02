// board-marks.js — полупрозрачные геометрические метки/области на поле
// Подключение: index.html должен загрузить этот файл ДО rooms-controlbox.js.
// Инициализация: rooms-controlbox.js вызывает window.initBoardMarks({ sendMessage, isGM, isSpectator, getState, boardEl, boardWrapperEl })

(function () {
  const CELL = 50;

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function uid() {
    return (crypto?.randomUUID ? crypto.randomUUID() : ("m-" + Math.random().toString(16).slice(2) + "-" + Date.now()));
  }

  function parseHexColorToRgba(hex, alpha) {
    const h = String(hex || '').trim();
    const a = clamp(Number(alpha) || 0, 0, 1);
    const m = h.match(/^#?([0-9a-f]{6})$/i);
    if (!m) return `rgba(255,165,0,${a})`;
    const v = m[1];
    const r = parseInt(v.slice(0, 2), 16);
    const g = parseInt(v.slice(2, 4), 16);
    const b = parseInt(v.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  function cellFromClientXY(boardEl, clientX, clientY) {
    const r = boardEl.getBoundingClientRect();
    const xPx = clientX - r.left;
    const yPx = clientY - r.top;
    return {
      x: xPx / CELL,
      y: yPx / CELL,
      inBounds: xPx >= 0 && yPx >= 0 && xPx <= r.width && yPx <= r.height,
    };
  }

  function normRect(a, b) {
    const x1 = Math.min(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x, b.x);
    const y2 = Math.max(a.y, b.y);
    return { x: x1, y: y1, w: (x2 - x1), h: (y2 - y1) };
  }

  function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  const api = {};
  window.BoardMarks = api;

  let ctx = null;
  let board = null;
  let toolbar = null;
  let svg = null;
  let marksLayer = null;
  let previewEl = null;

  let tool = 'select';
  let drawMode = false;
  let drawing = false;
  let polyPts = [];
  let startPt = null;
  let hoverId = null;
  let selectedId = null;
  let color = '#ffa500';
  let fillPct = 30;
  let strokePct = 60;
  let strokeW = 2;
  let label = '';

  const LS_KEY = 'dnd_marks_toolbar';
  const LS_COLLAPSE_KEY = 'dnd_marks_toolbar_collapsed';

  function isGM() { try { return !!ctx?.isGM?.(); } catch { return false; } }
  function isSpectator() { try { return !!ctx?.isSpectator?.(); } catch { return false; } }
  function myId() { try { return String(window.myId || localStorage.getItem('dnd_user_id') || ''); } catch { return ''; } }
  function getState() { try { return ctx?.getState?.() || window.lastState || null; } catch { return window.lastState || null; } }
  function curMapId() { return String(getState()?.currentMapId || ''); }

  function canEditMark(m) {
    if (!m) return false;
    if (isGM()) return true;
    return String(m.ownerId || '') === myId();
  }

  function ensureToolbar() {
    if (toolbar) return toolbar;
    const host = document.getElementById('board-topbar') || document.getElementById('board-col') || document.body;

    toolbar = document.createElement('div');
    toolbar.id = 'marks-toolbar';
    toolbar.className = 'marks-toolbar';
    toolbar.innerHTML = `
      <div class="marks-toolbar__head">
        <button class="marks-toolbar__title" id="marks-toolbar-toggle" type="button" aria-expanded="true">Обозначение</button>
        <label class="marks-switch"><input type="checkbox" id="marks-enabled"> <span>Рисовать</span></label>
        <button class="marks-btn" type="button" id="marks-clear" title="Удалить выбранную метку (или все ваши)">Очистить</button>
      </div>
      <div class="marks-toolbar__body">
        <div class="marks-toolbar__row">
          <div class="marks-seg" role="group" aria-label="Инструмент">
            <button class="marks-seg__btn" type="button" data-tool="select">Выбор</button>
            <button class="marks-seg__btn" type="button" data-tool="rect">Прямоуг.</button>
            <button class="marks-seg__btn" type="button" data-tool="circle">Круг</button>
            <button class="marks-seg__btn" type="button" data-tool="poly">Поли</button>
          </div>
          <label class="marks-field"><span>Цвет</span><input id="marks-color" type="color" value="#ffa500"></label>
          <label class="marks-field"><span>Заливка</span><input id="marks-fill" type="range" min="0" max="90" value="30"></label>
          <label class="marks-field"><span>Контур</span><input id="marks-stroke" type="range" min="0" max="100" value="60"></label>
          <label class="marks-field"><span>Линия</span><input id="marks-stroke-w" type="number" min="1" max="10" value="2"></label>
        </div>
        <div class="marks-toolbar__row marks-toolbar__row--sub">
          <input id="marks-label" class="marks-label" type="text" placeholder="Подпись (необязательно)">
          <div class="marks-hint">Двойной клик — завершить многоугольник.</div>
        </div>
      </div>
    `;

    host.appendChild(toolbar);

    // ===== Collapsible ("Обозначения") =====
    try {
      const toggleBtn = toolbar.querySelector('#marks-toolbar-toggle');
      const applyCollapsed = (collapsed) => {
        toolbar.classList.toggle('is-collapsed', !!collapsed);
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        try { localStorage.setItem(LS_COLLAPSE_KEY, collapsed ? '1' : '0'); } catch {}
      };
      const savedCollapsed = String(localStorage.getItem(LS_COLLAPSE_KEY) || '') === '1';
      applyCollapsed(savedCollapsed);
      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          applyCollapsed(!toolbar.classList.contains('is-collapsed'));
        });
      }
    } catch {}

    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && typeof s === 'object') {
          if (typeof s.tool === 'string') tool = s.tool;
          if (typeof s.drawMode === 'boolean') drawMode = s.drawMode;
          if (typeof s.color === 'string') color = s.color;
          if (Number.isFinite(Number(s.fillPct))) fillPct = clamp(Number(s.fillPct), 0, 90);
          if (Number.isFinite(Number(s.strokePct))) strokePct = clamp(Number(s.strokePct), 0, 100);
          if (Number.isFinite(Number(s.strokeW))) strokeW = clamp(Number(s.strokeW), 1, 10);
        }
      }
    } catch {}

    const enabled = toolbar.querySelector('#marks-enabled');
    const clearBtn = toolbar.querySelector('#marks-clear');
    const colorInp = toolbar.querySelector('#marks-color');
    const fillInp = toolbar.querySelector('#marks-fill');
    const strokeInp = toolbar.querySelector('#marks-stroke');
    const strokeWInp = toolbar.querySelector('#marks-stroke-w');
    const labelInp = toolbar.querySelector('#marks-label');

    if (enabled) enabled.checked = !!drawMode;
    if (colorInp) colorInp.value = String(color || '#ffa500');
    if (fillInp) fillInp.value = String(fillPct);
    if (strokeInp) strokeInp.value = String(strokePct);
    if (strokeWInp) strokeWInp.value = String(strokeW);

    toolbar.querySelectorAll('[data-tool]').forEach(btn => {
      btn.classList.toggle('is-active', String(btn.getAttribute('data-tool')) === tool);
    });

    const persist = () => {
      try { localStorage.setItem(LS_KEY, JSON.stringify({ tool, drawMode, color, fillPct, strokePct, strokeW })); } catch {}
    };

    toolbar.addEventListener('click', (e) => {
      const tBtn = e.target?.closest?.('[data-tool]');
      if (tBtn) {
        tool = String(tBtn.getAttribute('data-tool') || 'select');
        toolbar.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('is-active', b === tBtn));
        selectedId = null;
        clearPreview();
        persist();
      }
    });

    if (enabled) enabled.addEventListener('change', () => {
      drawMode = !!enabled.checked;
      if (isSpectator()) {
        drawMode = false;
        enabled.checked = false;
      }
      selectedId = null;
      clearPreview();
      syncPointerEvents();
      persist();
    });

    if (colorInp) colorInp.addEventListener('input', () => { color = String(colorInp.value || '#ffa500'); persist(); });
    if (fillInp) fillInp.addEventListener('input', () => { fillPct = clamp(Number(fillInp.value) || 0, 0, 90); persist(); });
    if (strokeInp) strokeInp.addEventListener('input', () => { strokePct = clamp(Number(strokeInp.value) || 0, 0, 100); persist(); });
    if (strokeWInp) strokeWInp.addEventListener('change', () => { strokeW = clamp(Number(strokeWInp.value) || 2, 1, 10); persist(); });
    if (labelInp) labelInp.addEventListener('input', () => { label = String(labelInp.value || ''); });

    if (clearBtn) clearBtn.addEventListener('click', () => {
      if (selectedId) {
        const st = getState();
        const arr = Array.isArray(st?.marks) ? st.marks : [];
        const m = arr.find(x => String(x?.id) === String(selectedId));
        if (m && canEditMark(m)) ctx?.sendMessage?.({ type: 'removeMark', id: String(selectedId) });
        selectedId = null;
        return;
      }
      if (isGM()) {
        if (confirm('Удалить ВСЕ обозначения на текущей карте?')) ctx?.sendMessage?.({ type: 'clearMarks', scope: 'all' });
      } else {
        if (confirm('Удалить ВСЕ ваши обозначения на текущей карте?')) ctx?.sendMessage?.({ type: 'clearMarks', scope: 'mine' });
      }
    });

    if (isSpectator()) {
      toolbar.classList.add('is-spectator');
      if (enabled) enabled.checked = false;
    }
    return toolbar;
  }

  function ensureLayer() {
    if (marksLayer && svg) return marksLayer;
    if (!board) return null;
    marksLayer = board.querySelector('#marks-layer');
    if (!marksLayer) {
      marksLayer = document.createElement('div');
      marksLayer.id = 'marks-layer';
      marksLayer.setAttribute('aria-hidden', 'true');
      board.appendChild(marksLayer);
    }
    svg = marksLayer.querySelector('svg');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.classList.add('marks-svg');
      marksLayer.appendChild(svg);
    }
    syncLayerSize();
    syncPointerEvents();
    return marksLayer;
  }

  function syncLayerSize() {
    if (!svg) return;
    const st = getState();
    const bw = Number(st?.boardWidth) || 10;
    const bh = Number(st?.boardHeight) || 10;
    svg.setAttribute('viewBox', `0 0 ${bw * CELL} ${bh * CELL}`);
  }

  function syncPointerEvents() {
    if (!marksLayer) return;
    const active = !!drawMode;
    marksLayer.style.pointerEvents = active ? 'auto' : 'none';
    if (svg) svg.style.pointerEvents = active ? 'auto' : 'none';
  }

  function svgEl(tag) { return document.createElementNS('http://www.w3.org/2000/svg', tag); }

  function clearPreview() {
    drawing = false;
    startPt = null;
    polyPts = [];
    if (previewEl) { try { previewEl.remove(); } catch {} }
    previewEl = null;
  }

  function styleForMark(m, isPreview = false) {
    const fillA = clamp(1 - (fillPct / 100), 0.05, 1);
    const strokeA = clamp(strokePct / 100, 0, 1);
    return {
      fill: parseHexColorToRgba(m?.color || color, Number(m?.alphaFill ?? fillA)),
      stroke: parseHexColorToRgba(m?.color || color, Number(m?.alphaStroke ?? strokeA)),
      strokeWidth: Number(m?.strokeW || strokeW) || 2,
      dash: isPreview ? '6 4' : null
    };
  }

  function renderFromState(state) {
    ensureLayer();
    if (!svg) return;
    syncLayerSize();
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const st = state || getState();
    const all = Array.isArray(st?.marks) ? st.marks : [];
    const mid = curMapId();
    const marks = all.filter(m => String(m?.mapId || '') === mid);

    marks.forEach(m => {
      const id = String(m?.id || '');
      const kind = String(m?.kind || '');
      let shape = null;

      if (kind === 'rect') {
        shape = svgEl('rect');
        shape.setAttribute('x', String((Number(m.x) || 0) * CELL));
        shape.setAttribute('y', String((Number(m.y) || 0) * CELL));
        shape.setAttribute('width', String((Number(m.w) || 0) * CELL));
        shape.setAttribute('height', String((Number(m.h) || 0) * CELL));
        shape.setAttribute('rx', '6');
        shape.setAttribute('ry', '6');
      } else if (kind === 'circle') {
        shape = svgEl('circle');
        shape.setAttribute('cx', String((Number(m.cx) || 0) * CELL));
        shape.setAttribute('cy', String((Number(m.cy) || 0) * CELL));
        shape.setAttribute('r', String((Number(m.r) || 0) * CELL));
      } else if (kind === 'poly') {
        const pts = Array.isArray(m?.pts) ? m.pts : [];
        if (pts.length >= 3) {
          shape = svgEl('polygon');
          shape.setAttribute('points', pts.map(p => `${(Number(p.x) || 0) * CELL},${(Number(p.y) || 0) * CELL}`).join(' '));
        }
      }
      if (!shape) return;

      const stl = styleForMark(m, false);
      shape.setAttribute('fill', stl.fill);
      shape.setAttribute('stroke', stl.stroke);
      shape.setAttribute('stroke-width', String(stl.strokeWidth));
      shape.setAttribute('vector-effect', 'non-scaling-stroke');
      shape.classList.add('mark-shape');
      shape.dataset.id = id;
      if (id && id === String(selectedId)) shape.classList.add('is-selected');
      if (id && id === String(hoverId)) shape.classList.add('is-hover');
      shape.style.cursor = 'pointer';
      svg.appendChild(shape);

      const lab = String(m?.label || '').trim();
      if (lab) {
        const t = svgEl('text');
        t.textContent = lab;
        t.classList.add('mark-label');
        t.setAttribute('fill', 'rgba(255,255,255,0.95)');
        t.setAttribute('font-size', '12');
        t.setAttribute('font-weight', '700');
        t.setAttribute('paint-order', 'stroke');
        t.setAttribute('stroke', 'rgba(0,0,0,0.70)');
        t.setAttribute('stroke-width', '3');
        t.setAttribute('vector-effect', 'non-scaling-stroke');

        let ax = 0, ay = 0;
        if (kind === 'rect') { ax = (Number(m.x) || 0) + (Number(m.w) || 0) / 2; ay = (Number(m.y) || 0) + (Number(m.h) || 0) / 2; }
        if (kind === 'circle') { ax = Number(m.cx) || 0; ay = Number(m.cy) || 0; }
        if (kind === 'poly') {
          const pts = Array.isArray(m?.pts) ? m.pts : [];
          if (pts.length) {
            ax = pts.reduce((s, p) => s + (Number(p.x) || 0), 0) / pts.length;
            ay = pts.reduce((s, p) => s + (Number(p.y) || 0), 0) / pts.length;
          }
        }
        t.setAttribute('x', String(ax * CELL));
        t.setAttribute('y', String(ay * CELL));
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('dominant-baseline', 'middle');
        t.dataset.id = id;
        svg.appendChild(t);
      }
    });
  }

  function ensureListeners() {
    if (!marksLayer || marksLayer.__marksBound) return;
    marksLayer.__marksBound = true;

    svg.addEventListener('mousemove', (e) => {
      if (!drawMode) return;
      const target = e.target?.closest?.('.mark-shape, .mark-label');
      const id = target?.dataset?.id || '';
      hoverId = id ? String(id) : null;
      if (!drawing) renderFromState(getState());
    });
    svg.addEventListener('mouseleave', () => {
      hoverId = null;
      if (!drawing) renderFromState(getState());
    });

    svg.addEventListener('mousedown', (e) => {
      if (!drawMode || isSpectator()) return;
      e.preventDefault();
      e.stopPropagation();
      onDown(e);
    });
    svg.addEventListener('dblclick', (e) => {
      if (!drawMode || tool !== 'poly' || isSpectator()) return;
      e.preventDefault();
      e.stopPropagation();
      finishPoly();
    });
    window.addEventListener('mousemove', (e) => {
      if (!drawMode || !drawing) return;
      onMove(e);
    });
    window.addEventListener('mouseup', (e) => {
      if (!drawMode || !drawing) return;
      onUp(e);
    });
  }

  function onDown(e) {
    const hit = e.target?.closest?.('.mark-shape, .mark-label');
    const hitId = hit?.dataset?.id ? String(hit.dataset.id) : '';
    if (tool === 'select') {
      selectedId = hitId || null;
      renderFromState(getState());
      return;
    }
    if (hitId) {
      selectedId = hitId;
      renderFromState(getState());
      return;
    }
    selectedId = null;

    const p = cellFromClientXY(board, e.clientX, e.clientY);
    if (!p.inBounds) return;
    startPt = { x: p.x, y: p.y };

    if (tool === 'poly') {
      polyPts.push({ x: p.x, y: p.y });
      drawing = true;
      updatePolyPreview({ x: p.x, y: p.y });
      return;
    }
    drawing = true;
    updatePreview(p);
  }

  function onMove(e) {
    const p = cellFromClientXY(board, e.clientX, e.clientY);
    if (!p.inBounds) return;
    if (tool === 'poly') updatePolyPreview({ x: p.x, y: p.y });
    else updatePreview(p);
  }

  function onUp(e) {
    const p = cellFromClientXY(board, e.clientX, e.clientY);
    if (!p.inBounds) { if (tool !== 'poly') clearPreview(); return; }
    if (tool === 'poly') return; // continues until dblclick
    finalizeShape(p);
  }

  function updatePreview(p) {
    if (!startPt) return;
    if (tool === 'rect') {
      const r = normRect(startPt, p);
      const x = r.x * CELL, y = r.y * CELL, w = r.w * CELL, h = r.h * CELL;
      if (!previewEl || previewEl.tagName.toLowerCase() !== 'rect') {
        if (previewEl) { try { previewEl.remove(); } catch {} }
        previewEl = svgEl('rect');
        previewEl.classList.add('mark-preview');
        svg.appendChild(previewEl);
      }
      const stl = styleForMark({ color, strokeW }, true);
      previewEl.setAttribute('x', String(x));
      previewEl.setAttribute('y', String(y));
      previewEl.setAttribute('width', String(w));
      previewEl.setAttribute('height', String(h));
      previewEl.setAttribute('rx', '6');
      previewEl.setAttribute('ry', '6');
      previewEl.setAttribute('fill', stl.fill);
      previewEl.setAttribute('stroke', stl.stroke);
      previewEl.setAttribute('stroke-width', String(stl.strokeWidth));
      previewEl.setAttribute('stroke-dasharray', stl.dash);
      previewEl.setAttribute('vector-effect', 'non-scaling-stroke');
    }
    if (tool === 'circle') {
      const r = dist(startPt, p);
      if (!previewEl || previewEl.tagName.toLowerCase() !== 'circle') {
        if (previewEl) { try { previewEl.remove(); } catch {} }
        previewEl = svgEl('circle');
        previewEl.classList.add('mark-preview');
        svg.appendChild(previewEl);
      }
      const stl = styleForMark({ color, strokeW }, true);
      previewEl.setAttribute('cx', String(startPt.x * CELL));
      previewEl.setAttribute('cy', String(startPt.y * CELL));
      previewEl.setAttribute('r', String(r * CELL));
      previewEl.setAttribute('fill', stl.fill);
      previewEl.setAttribute('stroke', stl.stroke);
      previewEl.setAttribute('stroke-width', String(stl.strokeWidth));
      previewEl.setAttribute('stroke-dasharray', stl.dash);
      previewEl.setAttribute('vector-effect', 'non-scaling-stroke');
    }
  }

  function updatePolyPreview(lastPoint) {
    const pts = polyPts.slice();
    if (lastPoint && pts.length) pts.push({ x: lastPoint.x, y: lastPoint.y });
    if (!previewEl || previewEl.tagName.toLowerCase() !== 'polyline') {
      if (previewEl) { try { previewEl.remove(); } catch {} }
      previewEl = svgEl('polyline');
      previewEl.classList.add('mark-preview');
      svg.appendChild(previewEl);
    }
    const stl = styleForMark({ color, strokeW, alphaFill: 0.12, alphaStroke: clamp(strokePct / 100, 0.1, 1) }, true);
    previewEl.setAttribute('points', pts.map(p => `${p.x * CELL},${p.y * CELL}`).join(' '));
    previewEl.setAttribute('fill', 'none');
    previewEl.setAttribute('stroke', stl.stroke);
    previewEl.setAttribute('stroke-width', String(stl.strokeWidth));
    previewEl.setAttribute('stroke-dasharray', stl.dash);
    previewEl.setAttribute('vector-effect', 'non-scaling-stroke');
  }

  function finishPoly() {
    if (polyPts.length < 3) { clearPreview(); return; }
    const m = {
      id: uid(),
      mapId: curMapId(),
      ownerId: myId(),
      kind: 'poly',
      pts: polyPts.map(p => ({ x: +p.x, y: +p.y })),
      color,
      alphaFill: clamp(1 - (fillPct / 100), 0.05, 1),
      alphaStroke: clamp(strokePct / 100, 0, 1),
      strokeW,
      label: String(label || '').trim()
    };
    ctx?.sendMessage?.({ type: 'addMark', mark: m });
    clearPreview();
  }

  function finalizeShape(p) {
    if (!startPt) return;
    if (tool === 'rect') {
      const r = normRect(startPt, p);
      if (r.w < 0.12 || r.h < 0.12) { clearPreview(); return; }
      const m = {
        id: uid(),
        mapId: curMapId(),
        ownerId: myId(),
        kind: 'rect',
        x: +r.x,
        y: +r.y,
        w: +r.w,
        h: +r.h,
        color,
        alphaFill: clamp(1 - (fillPct / 100), 0.05, 1),
        alphaStroke: clamp(strokePct / 100, 0, 1),
        strokeW,
        label: String(label || '').trim()
      };
      ctx?.sendMessage?.({ type: 'addMark', mark: m });
      clearPreview();
      return;
    }
    if (tool === 'circle') {
      const r = dist(startPt, p);
      if (r < 0.18) { clearPreview(); return; }
      const m = {
        id: uid(),
        mapId: curMapId(),
        ownerId: myId(),
        kind: 'circle',
        cx: +startPt.x,
        cy: +startPt.y,
        r: +r,
        color,
        alphaFill: clamp(1 - (fillPct / 100), 0.05, 1),
        alphaStroke: clamp(strokePct / 100, 0, 1),
        strokeW,
        label: String(label || '').trim()
      };
      ctx?.sendMessage?.({ type: 'addMark', mark: m });
      clearPreview();
      return;
    }
  }

  api.onBoardRendered = function (state) {
    try {
      if (!board) board = ctx?.boardEl || document.getElementById('game-board');
      ensureToolbar();
      ensureLayer();
      ensureListeners();
      renderFromState(state || getState());
    } catch (e) {
      console.warn('BoardMarks.onBoardRendered failed', e);
    }
  };

  api.refreshRole = function () {
    try {
      if (!toolbar) return;
      const enabled = toolbar.querySelector('#marks-enabled');
      if (isSpectator()) {
        toolbar.classList.add('is-spectator');
        drawMode = false;
        if (enabled) enabled.checked = false;
      } else {
        toolbar.classList.remove('is-spectator');
      }
      syncPointerEvents();
    } catch {}
  };

  window.initBoardMarks = function initBoardMarks(_ctx) {
    ctx = _ctx || null;
    if (!ctx || typeof ctx !== 'object') return;
    ctx.sendMessage = ctx.sendMessage || window.sendMessage;
    ctx.getState = ctx.getState || (() => window.lastState || null);
    ctx.isGM = ctx.isGM || (() => String(window.myRole || '') === 'GM');
    ctx.isSpectator = ctx.isSpectator || (() => String(window.myRole || '') === 'Spectator');

    board = ctx.boardEl || document.getElementById('game-board');
    ensureToolbar();
    ensureLayer();
    ensureListeners();
    api.refreshRole();
    renderFromState(getState());
  };
})();
