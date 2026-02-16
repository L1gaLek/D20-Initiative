// ================== FOG OF WAR (manual + dynamic LOS) ==================
// Works with this project's wall model: walls are stored as blocked cells in state.walls [{x,y}]
// Fog state is stored in state.fog (mirrored to active map).

(function () {
  const CELL = 50;

  const FogWar = {
    _canvas: null,
    _ctx: null,
    _lastState: null,
    _manualGrid: null, // Uint8Array (1=reveal, 0=hide) used as overrides on top of manualBase
    _manualKey: '',
    _dynKey: '',
    _dynVisible: null, // Uint8Array (party visibility used for players)
    _dynNpcVisible: null, // Uint8Array (GM-created non-allies vision, GM-only overlay)
    _exploredSet: new Set(),
    _pendingExploredSync: null,

    isEnabled() {
      const s = this._lastState;
      return !!(s && s.fog && s.fog.enabled);
    },

    // Non-GM: can interact only with tokens placed on visible cells.
    canInteractWithToken(player) {
      try {
        if (typeof myRole !== 'undefined' && String(myRole) === 'GM') return true;
      } catch {}
      if (!this.isEnabled()) return true;
      const p = player || {};
      if (p.x === null || p.y === null || typeof p.x === 'undefined' || typeof p.y === 'undefined') return true;
      return this.isCellVisible(Number(p.x) || 0, Number(p.y) || 0);
    },

    canMoveToCell(x, y, selectedPlayer) {
      try {
        if (typeof myRole !== 'undefined' && String(myRole) === 'GM') return true;
      } catch {}
      if (!this.isEnabled()) return true;
      const st = this._lastState;
      const mode = String(st?.fog?.mode || 'manual');
      if (mode !== 'dynamic') {
        // Manual fog doesn't restrict movement.
        return true;
      }

      // Dynamic mode: optional restriction.
      // If enabled, destination must be either currently visible OR already explored.
      const moveOnExplored = (st?.fog && typeof st.fog.moveOnExplored === 'boolean') ? st.fog.moveOnExplored : true;
      if (!moveOnExplored) return true;

      const cx = Number(x) || 0;
      const cy = Number(y) || 0;
      return this.isCellVisibleDynamicOnly(cx, cy) || this.isCellExplored(cx, cy);
    },

    isCellExplored(x, y) {
      try {
        return this._exploredSet && this._exploredSet.has(`${Number(x) || 0},${Number(y) || 0}`);
      } catch {
        return false;
      }
    },

    isCellVisible(x, y) {
      const st = this._lastState;
      if (!st || !st.fog || !st.fog.enabled) return true;

      // GM visibility depends on gmViewMode:
      // - 'gm'     : GM sees everything (fog is just an overlay)
      // - 'player' : GM sees like players
      try {
        if (typeof myRole !== 'undefined' && String(myRole) === 'GM') {
          const gmView = String(st?.fog?.gmViewMode || 'gm');
          if (gmView !== 'player') return true;
        }
      } catch {}

      const w = Number(st.boardWidth) || 10;
      const h = Number(st.boardHeight) || 10;
      if (x < 0 || y < 0 || x >= w || y >= h) return false;

      // manual base
      const baseReveal = (st.fog.manualBase === 'reveal');
      let revealed = baseReveal;

      // manual overrides
      const idx = y * w + x;
      if (this._manualGrid && this._manualGrid.length === w * h) {
        const v = this._manualGrid[idx];
        // 0=not set, 1=reveal stamp, 2=hide stamp
        if (v === 1) revealed = true;
        else if (v === 2) revealed = false;
      }

      if (st.fog.mode === 'manual') {
        return revealed;
      }

      // dynamic mode: manualReveal OR dynamicVisible
      const dyn = (this._dynVisible && this._dynVisible.length === w * h) ? (this._dynVisible[idx] === 1) : false;
      return revealed || dyn;
    },

    // Dynamic-only visibility (ignores manual stamps/base).
    // Used for "исследование" discovery logic.
    isCellVisibleDynamicOnly(x, y) {
      const st = this._lastState;
      if (!st || !st.fog || !st.fog.enabled) return true;

      // GM in gmViewMode != player is effectively omniscient.
      try {
        if (typeof myRole !== 'undefined' && String(myRole) === 'GM') {
          const gmView = String(st?.fog?.gmViewMode || 'gm');
          if (gmView !== 'player') return true;
        }
      } catch {}

      const w = Number(st.boardWidth) || 10;
      const h = Number(st.boardHeight) || 10;
      if (x < 0 || y < 0 || x >= w || y >= h) return false;
      if (String(st?.fog?.mode || '') !== 'dynamic') return true;
      const idx = y * w + x;
      return (this._dynVisible && this._dynVisible.length === w * h) ? (this._dynVisible[idx] === 1) : false;
    },

    onBoardRendered(state) {
      this._lastState = state;

      // Ensure canvas exists and matches board size
      const boardEl = (typeof board !== 'undefined') ? board : document.getElementById('game-board');
      if (!boardEl) return;

      if (!this._canvas) {
        const c = document.createElement('canvas');
        c.id = 'fog-layer';
        c.width = 1;
        c.height = 1;
        boardEl.appendChild(c);
        this._canvas = c;
        this._ctx = c.getContext('2d');

        // GM paint handlers
        this._wireManualPainting(c);
      }

      const w = (Number(state?.boardWidth) || 10) * CELL;
      const h = (Number(state?.boardHeight) || 10) * CELL;
      if (this._canvas.width !== w) this._canvas.width = w;
      if (this._canvas.height !== h) this._canvas.height = h;

      this._syncManualFromState();
      this._syncExploredFromState();
      this._maybeRecomputeDynamic();
      this._render();

      // If GM chose to fully open the map for themselves, hide overlay canvas.
      try {
        const isGm = (typeof myRole !== 'undefined' && String(myRole) === 'GM');
        const gmOpen = !!state?.fog?.gmOpen;
        if (this._canvas) this._canvas.style.display = (isGm && gmOpen) ? 'none' : '';
      } catch {}

      // UI sync
      this._syncUiFromState();
      this._toggleUiRows();
    },

    // Called when only token positions changed (v4: positions come from room_tokens realtime).
    // Avoid full board rerender; just recompute dynamic visibility and repaint.
    onTokenPositionsChanged(state) {
      try {
        this._lastState = state;
        this._maybeRecomputeDynamic();
        this._render();
      } catch {}
    },

    _fogObj() {
      const st = this._lastState || {};
      if (!st.fog || typeof st.fog !== 'object') st.fog = {};
      return st.fog;
    },

    _syncManualFromState() {
      const st = this._lastState;
      if (!st) return;
      const fog = st.fog || {};
      const stamps = Array.isArray(fog.manualStamps) ? fog.manualStamps : [];
      const key = `${st.boardWidth}x${st.boardHeight}|${fog.manualBase}|${stamps.length}`;
      if (key === this._manualKey && this._manualGrid) return;

      const w = Number(st.boardWidth) || 10;
      const h = Number(st.boardHeight) || 10;
      const grid = new Uint8Array(w * h); // 0 none, 1 reveal, 2 hide

      // apply stamps in order (later stamps override earlier)
      for (const s of stamps) {
        const cx = Math.round(Number(s?.x) || 0);
        const cy = Math.round(Number(s?.y) || 0);
        // Brush radius is in "cells count" like:
        // r=1 => only the clicked cell
        // r=2 => adds 1 cell each side (3x3)
        // r=3 => 5x5, etc.
        const r = Math.max(1, Math.round(Number(s?.r) || 1));
        const spread = Math.max(0, r - 1);
        const mode = (String(s?.mode || 'reveal') === 'hide') ? 2 : 1;

        // Square brush (Chebyshev radius), matching user's expectation.
        for (let dy = -spread; dy <= spread; dy++) {
          for (let dx = -spread; dx <= spread; dx++) {
            const x = cx + dx;
            const y = cy + dy;
            if (x < 0 || y < 0 || x >= w || y >= h) continue;
            grid[y * w + x] = mode;
          }
        }
      }

      this._manualGrid = grid;
      this._manualKey = key;
    },

    _syncExploredFromState() {
      const fog = this._fogObj();
      const arr = Array.isArray(fog.explored) ? fog.explored : [];
      const next = new Set();
      for (const k of arr) {
        const s = String(k || '');
        if (s.includes(',')) next.add(s);
      }
      this._exploredSet = next;
    },

    _wallsSet() {
      const st = this._lastState || {};
      const walls = Array.isArray(st.walls) ? st.walls : [];
      const set = new Set();
      for (const w of walls) {
        const x = Number(w?.x), y = Number(w?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        set.add(`${x},${y}`);
      }
      return set;
    },

    _isWallCell(set, x, y) {
      return set.has(`${x},${y}`);
    },

    _visionSources() {
      // Sources (party vision):
      // - all non-GM owned tokens (party players)
      // - GM-created allies
      // IMPORTANT: GM-created non-allies MUST NOT reveal terrain for players.
      // (they can still be discovered as targets, but do not grant vision)
      const sources = [];
      const st = this._lastState || {};
      const list = Array.isArray(st.players) ? st.players : (typeof players !== 'undefined' ? players : []);
      for (const p of list) {
        if (!p) continue;
        if (p.x === null || p.y === null || typeof p.x === 'undefined' || typeof p.y === 'undefined') continue;

        // If we have ownerRole, use it.
        const ownerRole = String(p.ownerRole || '').trim();
        const isGmCreated = (ownerRole === 'GM');

        // Party vision sources:
        // - non-GM tokens always count
        // - GM tokens count ONLY if they are союзник
        if (!isGmCreated || !!p.isAlly) {
          sources.push(p);
        }
      }
      return sources;
    },

    _gmHiddenSources() {
      // GM-created, non-allies (NPCs). These DO NOT reveal terrain to players,
      // but GM wants to see their FOV in a different color.
      const sources = [];
      const st = this._lastState || {};
      const list = Array.isArray(st.players) ? st.players : (typeof players !== 'undefined' ? players : []);
      for (const p of list) {
        if (!p) continue;
        if (p.x === null || p.y === null || typeof p.x === 'undefined' || typeof p.y === 'undefined') continue;
        const ownerRole = String(p.ownerRole || '').trim();
        const isGmCreated = (ownerRole === 'GM');
        if (isGmCreated && !p.isAlly) sources.push(p);
      }
      return sources;
    },

    _maybeRecomputeDynamic() {
      const st = this._lastState;
      if (!st || !st.fog || !st.fog.enabled || st.fog.mode !== 'dynamic') {
        this._dynVisible = null;
        this._dynNpcVisible = null;
        this._dynKey = '';
        return;
      }

      const w = Number(st.boardWidth) || 10;
      const h = Number(st.boardHeight) || 10;
      const fog = st.fog;

      // Key: positions + walls count + radius
      const sources = this._visionSources();
      const npcSources = this._gmHiddenSources();
      const walls = Array.isArray(st.walls) ? st.walls : [];
      const key = `${w}x${h}|r${Number(fog.visionRadius) || 8}|walls${walls.length}|src${sources.map(p => `${p.id}:${p.x},${p.y},${p.size||1}`).join(';')}|npc${npcSources.map(p => `${p.id}:${p.x},${p.y},${p.size||1}`).join(';')}`;
      if (key === this._dynKey && this._dynVisible) return;

      const visible = new Uint8Array(w * h);
      const npcVisible = new Uint8Array(w * h);
      const wallSet = this._wallsSet();
      const radius = clampInt(Number(fog.visionRadius) || 8, 1, 60);
      const useWalls = (fog.useWalls !== false);

      for (const src of sources) {
        const size = Number(src.size) || 1;
        const ox = clampInt((Number(src.x) || 0) + Math.floor((size - 1) / 2), 0, w - 1);
        const oy = clampInt((Number(src.y) || 0) + Math.floor((size - 1) / 2), 0, h - 1);

        const minX = Math.max(0, ox - radius);
        const maxX = Math.min(w - 1, ox + radius);
        const minY = Math.max(0, oy - radius);
        const maxY = Math.min(h - 1, oy + radius);

        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const dx = x - ox;
            const dy = y - oy;
            if (dx * dx + dy * dy > radius * radius) continue;

            if (useWalls) {
              if (!hasLineOfSightCells(ox, oy, x, y, wallSet)) continue;
            }

            visible[y * w + x] = 1;
          }
        }
      }

      // GM-created non-ally FOV (GM-only overlay)
      for (const src of npcSources) {
        const size = Number(src.size) || 1;
        const ox = clampInt((Number(src.x) || 0) + Math.floor((size - 1) / 2), 0, w - 1);
        const oy = clampInt((Number(src.y) || 0) + Math.floor((size - 1) / 2), 0, h - 1);

        const minX = Math.max(0, ox - radius);
        const maxX = Math.min(w - 1, ox + radius);
        const minY = Math.max(0, oy - radius);
        const maxY = Math.min(h - 1, oy + radius);

        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const dx = x - ox;
            const dy = y - oy;
            if (dx * dx + dy * dy > radius * radius) continue;
            if (useWalls) {
              if (!hasLineOfSightCells(ox, oy, x, y, wallSet)) continue;
            }
            npcVisible[y * w + x] = 1;
          }
        }
      }

      this._dynVisible = visible;
      this._dynNpcVisible = npcVisible;
      this._dynKey = key;

      // Update explored (GM is authority)
      try {
        if (typeof myRole !== 'undefined' && String(myRole) === 'GM' && fog.exploredEnabled) {
          let changed = false;
          for (let i = 0; i < visible.length; i++) {
            if (visible[i] !== 1) continue;
            const x = i % w;
            const y = Math.floor(i / w);
            const k = `${x},${y}`;
            if (!this._exploredSet.has(k)) {
              this._exploredSet.add(k);
              changed = true;
            }
          }
          if (changed) this._scheduleExploredSync();
        }
      } catch {}
    },

    _scheduleExploredSync() {
      if (this._pendingExploredSync) return;
      this._pendingExploredSync = setTimeout(() => {
        this._pendingExploredSync = null;
        try {
          if (typeof sendMessage === 'function') {
            sendMessage({ type: 'fogSetExplored', cells: Array.from(this._exploredSet) });
          }
        } catch {}
      }, 250);
    },

    _render() {
      const st = this._lastState;
      if (!st || !this._ctx || !this._canvas) return;

      const fog = st.fog || {};
      const enabled = !!fog.enabled;
      const ctx = this._ctx;
      const wCells = Number(st.boardWidth) || 10;
      const hCells = Number(st.boardHeight) || 10;

      // Hide canvas if fog disabled
      this._canvas.style.display = enabled ? 'block' : 'none';
      if (!enabled) return;

      // IMPORTANT: show fog for GM in BOTH modes.
      // This lets GM verify dynamic mode visually (as expected).
      // GM interactions with tokens are still unrestricted by canMoveToCell/canInteractWithToken.

      ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

      // Draw per-cell rectangles: hidden alpha, explored alpha, visible clear
      const exploredOn = !!fog.exploredEnabled;
      const explored = this._exploredSet;
      const baseReveal = (fog.manualBase === 'reveal');

      for (let y = 0; y < hCells; y++) {
        for (let x = 0; x < wCells; x++) {
          let alpha = 0.92;

          // manual visibility
          let revealed = baseReveal;
          const idx = y * wCells + x;
          const v = (this._manualGrid && this._manualGrid.length === wCells * hCells) ? this._manualGrid[idx] : 0;
          if (v === 1) revealed = true;
          else if (v === 2) revealed = false;

          let dyn = false;
          if (fog.mode === 'dynamic') {
            dyn = (this._dynVisible && this._dynVisible.length === wCells * hCells) ? (this._dynVisible[idx] === 1) : false;
          }

          const visible = revealed || dyn;

          if (visible) {
            // fully clear
            continue;
          }

          // explored but not currently visible
          if (fog.mode === 'dynamic' && exploredOn && explored.has(`${x},${y}`)) {
            alpha = 0.55;
          }

          ctx.fillStyle = `rgba(0,0,0,${alpha})`;
          ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        }
      }

      // GM-only overlay: show FOV for GM-created non-allies in red tint (dynamic mode only).
      try {
        const isGm = (typeof myRole !== 'undefined' && String(myRole) === 'GM');
        const gmView = String(fog?.gmViewMode || 'gm');
        if (isGm && gmView !== 'player' && String(fog.mode || '') === 'dynamic' && this._dynNpcVisible && this._dynNpcVisible.length === wCells * hCells) {
          // Прозрачно-красный обзор для игроков ГМ (NPC, не союзники)
          ctx.fillStyle = 'rgba(255,0,0,0.16)';
          for (let i = 0; i < this._dynNpcVisible.length; i++) {
            if (this._dynNpcVisible[i] !== 1) continue;
            const x = i % wCells;
            const y = Math.floor(i / wCells);
            ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
          }
        }
      } catch {}
    },

    _wireManualPainting(canvas) {
      let painting = false;
      let lastStampKey = '';

      const getCellFromEvent = (e) => {
        const rect = canvas.getBoundingClientRect();
        const px = (e.clientX - rect.left);
        const py = (e.clientY - rect.top);
        const x = clampInt(Math.floor(px / CELL), 0, (Number(this._lastState?.boardWidth) || 10) - 1);
        const y = clampInt(Math.floor(py / CELL), 0, (Number(this._lastState?.boardHeight) || 10) - 1);
        return { x, y };
      };

      const stamp = (e) => {
        const st = this._lastState;
        if (!st || !st.fog || !st.fog.enabled) return;
        if (st.fog.mode !== 'manual') return;
        // GM only
        try {
          if (typeof myRole === 'undefined' || String(myRole) !== 'GM') return;
        } catch { return; }

        const { x, y } = getCellFromEvent(e);
        const r = clampInt(Number(document.getElementById('fog-brush')?.value) || 4, 1, 20);
        const mode = String(document.getElementById('fog-brush-mode')?.value || 'reveal');

        const key = `${x},${y},${r},${mode}`;
        if (key === lastStampKey) return;
        lastStampKey = key;

        try {
          if (typeof sendMessage === 'function') {
            sendMessage({ type: 'fogStamp', x, y, r, mode });
          }
        } catch {}
      };

      // We keep pointer-events none for players; for GM painting we temporarily enable.
      const updatePointerEvents = () => {
        const st = this._lastState;
        if (!st || !st.fog || !st.fog.enabled) {
          canvas.style.pointerEvents = 'none';
          return;
        }
        const isGm = (typeof myRole !== 'undefined' && String(myRole) === 'GM');
        canvas.style.pointerEvents = (isGm && st.fog.mode === 'manual') ? 'auto' : 'none';
      };

      // Called on each board render
      this._togglePointerEvents = updatePointerEvents;

      canvas.addEventListener('mousedown', (e) => {
        updatePointerEvents();
        if (canvas.style.pointerEvents !== 'auto') return;
        painting = true;
        lastStampKey = '';
        stamp(e);
      });
      window.addEventListener('mouseup', () => { painting = false; lastStampKey = ''; });
      canvas.addEventListener('mousemove', (e) => { if (painting) stamp(e); });

      // Touch support
      canvas.addEventListener('touchstart', (e) => {
        updatePointerEvents();
        if (canvas.style.pointerEvents !== 'auto') return;
        painting = true;
        lastStampKey = '';
        const t = e.touches?.[0];
        if (t) stamp(t);
        e.preventDefault();
      }, { passive: false });
      canvas.addEventListener('touchmove', (e) => {
        if (!painting) return;
        const t = e.touches?.[0];
        if (t) stamp(t);
        e.preventDefault();
      }, { passive: false });
      window.addEventListener('touchend', () => { painting = false; lastStampKey = ''; });

      // UI actions
      const bindBtn = (id, fn) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('click', fn);
      };

      bindBtn('fog-hide-all', () => { try { sendMessage?.({ type: 'fogFill', value: 'hideAll' }); } catch {} });
      bindBtn('fog-reveal-all', () => { try { sendMessage?.({ type: 'fogFill', value: 'revealAll' }); } catch {} });
      bindBtn('fog-clear-explored', () => { try { sendMessage?.({ type: 'fogClearExplored' }); } catch {} });

      const onSettingsChange = () => {
        try {
          if (typeof myRole === 'undefined' || String(myRole) !== 'GM') return;
          const enabled = !!document.getElementById('fog-enabled')?.checked;
          const mode = String(document.getElementById('fog-mode')?.value || 'manual');
          const gmViewMode = String(document.getElementById('fog-gm-view')?.value || 'gm');
          const gmOpen = !!document.getElementById('fog-gm-open')?.checked;
          const visionRadius = clampInt(Number(document.getElementById('fog-vision')?.value) || 8, 1, 60);
          const useWalls = !!document.getElementById('fog-use-walls')?.checked;
          const exploredEnabled = !!document.getElementById('fog-explored')?.checked;
          const moveOnExplored = !!document.getElementById('fog-move-open')?.checked;
          // If GM opens fog for themselves, force gmViewMode='gm' (omniscient).
          const effectiveGmView = gmOpen ? 'gm' : gmViewMode;
          sendMessage?.({ type: 'setFogSettings', enabled, mode, gmViewMode: effectiveGmView, gmOpen, moveOnExplored, visionRadius, useWalls, exploredEnabled });
        } catch {}
      };

      ['fog-enabled','fog-gm-open','fog-mode','fog-gm-view','fog-vision','fog-use-walls','fog-explored','fog-move-open'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', onSettingsChange);
      });

      // Keep pointer-events updated
      setInterval(updatePointerEvents, 500);
    },

    _syncUiFromState() {
      // Update UI inputs based on state (GM only)
      try {
        const isGm = (typeof myRole !== 'undefined' && String(myRole) === 'GM');
        const box = document.getElementById('fog-controls');
        if (box) box.style.display = isGm ? '' : 'none';
        if (!isGm) return;
      } catch { return; }

      const st = this._lastState || {};
      const fog = st.fog || {};

      const setChecked = (id, val) => {
        const el = document.getElementById(id);
        if (el && el.checked !== !!val) el.checked = !!val;
      };
      const setValue = (id, val) => {
        const el = document.getElementById(id);
        if (el && String(el.value) !== String(val)) el.value = String(val);
      };

      setChecked('fog-enabled', !!fog.enabled);
      setChecked('fog-gm-open', !!fog.gmOpen);
      setValue('fog-mode', (fog.mode === 'dynamic' ? 'dynamic' : 'manual'));
      setValue('fog-gm-view', (String(fog.gmViewMode || 'gm') === 'player' ? 'player' : 'gm'));
      setValue('fog-vision', Number(fog.visionRadius) || 8);
      setChecked('fog-use-walls', fog.useWalls !== false);
      setChecked('fog-explored', fog.exploredEnabled !== false);
      setChecked('fog-move-open', (typeof fog.moveOnExplored === 'boolean') ? fog.moveOnExplored : true);

      // Pointer events update for painting
      try { this._togglePointerEvents?.(); } catch {}
    },

    _toggleUiRows() {
      const mode = String(this._lastState?.fog?.mode || 'manual');
      const manualRows = document.querySelectorAll('.fog-row--manual');
      const dynRows = document.querySelectorAll('.fog-row--dynamic');
      manualRows.forEach(el => el.style.display = (mode === 'manual' ? '' : 'none'));
      dynRows.forEach(el => el.style.display = (mode === 'dynamic' ? '' : 'none'));
    }
  };

  // ===== Helpers =====
  function clampInt(v, a, b) {
    v = Math.floor(Number(v) || 0);
    return Math.min(Math.max(v, a), b);
  }

  // Bresenham LOS across grid cells. Walls are opaque cells.
  // We allow seeing the target wall cell, but block beyond.
  function hasLineOfSightCells(x0, y0, x1, y1, wallSet) {
    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);
    let sx = (x0 < x1) ? 1 : -1;
    let sy = (y0 < y1) ? 1 : -1;
    let err = dx - dy;

    let x = x0;
    let y = y0;

    // Step until reaching target
    while (!(x === x1 && y === y1)) {
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }

      // If this intermediate cell is a wall and it's not the target, block.
      if (!(x === x1 && y === y1) && wallSet.has(`${x},${y}`)) {
        return false;
      }
    }

    return true;
  }

  window.FogWar = FogWar;
})();
