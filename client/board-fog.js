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
    _manualPreview: null, // {x,y,n,mode}
    _manualPreviewRaf: 0,

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
      const moveOnlyOpen = !!(st?.fog?.moveOnlyExplored);
      const cx = Number(x) || 0;
      const cy = Number(y) || 0;

      // If restriction enabled: allow move only to currently visible OR explored.
      if (moveOnlyOpen) {
        const visible = this.isCellVisible(cx, cy);
        if (visible) return true;
        // explored counts only in dynamic mode (as requested)
        const exploredOn = !!(st?.fog?.exploredEnabled);
        if (String(st?.fog?.mode || '') === 'dynamic' && exploredOn && this._exploredSet?.has(`${cx},${cy}`)) return true;
        return false;
      }

      // If restriction is disabled: allow moving anywhere (visible, explored, or hidden).
      return true;
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

      // UI sync
      this._syncUiFromState();
      this._toggleUiRows();
    },

    // Called when only token positions changed (v4: positions come from room_tokens realtime).
    // Avoid full board rerender; just recompute dynamic visibility and repaint.
    onTokenPositionsChanged(state) {
      try {
        this._lastState = state;
        // IMPORTANT: token moves can change both dynamic visibility and "исследование" (explored) set.
        // We must sync explored from state here too, because token-only updates may not trigger a full board render.
        this._syncExploredFromState();
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

      // Helpers for new manual shapes
      const markCell = (x, y, mode) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        grid[y * w + x] = mode;
      };

      function pointInPoly(px, py, pts) {
        // ray casting on cell centers
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const xi = pts[i].x, yi = pts[i].y;
          const xj = pts[j].x, yj = pts[j].y;
          const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-9) + xi);
          if (intersect) inside = !inside;
        }
        return inside;
      }

      // apply stamps in order (later stamps override earlier)
      for (const s of stamps) {
        const kind = String(s?.kind || '').toLowerCase();
        const mode = (String(s?.mode || 'reveal') === 'hide') ? 2 : 1;

        // ===== Square NxN brush (top-left cell x,y; size n) =====
        if (kind === 'square') {
          const x0 = Math.floor(Number(s?.x));
          const y0 = Math.floor(Number(s?.y));
          const n = clampInt(Number(s?.n) || 1, 1, 10);
          if (!Number.isFinite(x0) || !Number.isFinite(y0)) continue;
          for (let yy = y0; yy < y0 + n; yy++) {
            for (let xx = x0; xx < x0 + n; xx++) {
              markCell(xx, yy, mode);
            }
          }
          continue;
        }

        // ===== New kinds =====
        if (kind === 'rect') {
          const x1 = Math.floor(Number(s?.x1));
          const y1 = Math.floor(Number(s?.y1));
          const x2 = Math.floor(Number(s?.x2));
          const y2 = Math.floor(Number(s?.y2));
          if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) continue;
          const minX = Math.max(0, Math.min(x1, x2));
          const maxX = Math.min(w - 1, Math.max(x1, x2));
          const minY = Math.max(0, Math.min(y1, y2));
          const maxY = Math.min(h - 1, Math.max(y1, y2));
          for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) markCell(x, y, mode);
          }
          continue;
        }

        if (kind === 'circle') {
          const cx = Number(s?.cx);
          const cy = Number(s?.cy);
          const r = Number(s?.r);
          if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r)) continue;
          const rr = Math.max(0.1, r);
          const minX = Math.max(0, Math.floor(cx - rr - 1));
          const maxX = Math.min(w - 1, Math.ceil(cx + rr + 1));
          const minY = Math.max(0, Math.floor(cy - rr - 1));
          const maxY = Math.min(h - 1, Math.ceil(cy + rr + 1));
          for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
              const px = x + 0.5;
              const py = y + 0.5;
              const dx = px - cx;
              const dy = py - cy;
              if ((dx * dx + dy * dy) <= (rr * rr)) markCell(x, y, mode);
            }
          }
          continue;
        }

        if (kind === 'poly') {
          const ptsRaw = Array.isArray(s?.pts) ? s.pts : [];
          const pts = ptsRaw
            .map(p => ({ x: Number(p?.x), y: Number(p?.y) }))
            .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
          if (pts.length < 3) continue;
          let minX = w - 1, maxX = 0, minY = h - 1, maxY = 0;
          for (const p of pts) {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
          }
          const bx1 = Math.max(0, Math.floor(minX));
          const bx2 = Math.min(w - 1, Math.ceil(maxX));
          const by1 = Math.max(0, Math.floor(minY));
          const by2 = Math.min(h - 1, Math.ceil(maxY));
          for (let y = by1; y <= by2; y++) {
            for (let x = bx1; x <= bx2; x++) {
              if (pointInPoly(x + 0.5, y + 0.5, pts)) markCell(x, y, mode);
            }
          }
          continue;
        }

        // ===== Legacy stamp (square brush) =====
        const cx = Math.round(Number(s?.x) || 0);
        const cy = Math.round(Number(s?.y) || 0);
        const r = Math.max(1, Math.round(Number(s?.r) || 1));
        const spread = Math.max(0, r - 1);

        for (let dy = -spread; dy <= spread; dy++) {
          for (let dx = -spread; dx <= spread; dx++) {
            const x = cx + dx;
            const y = cy + dy;
            markCell(x, y, mode);
          }
        }
      }

      this._manualGrid = grid;
      this._manualKey = key;
    },

    _syncExploredFromState() {
      const fog = this._fogObj();
      const arr = Array.isArray(fog.explored) ? fog.explored : [];
      const incoming = new Set();
      for (const k of arr) {
        const s = String(k || '');
        if (s.includes(',')) incoming.add(s);
      }

      // GM client may have fresher explored cells locally (before the debounce sync hits the server).
      // To prevent "откат" explored-области на GM, мы:
      // - если сервер прислал пусто (clear) -> очищаем
      // - иначе -> делаем union (сервер + локальное)
      let isGm = false;
      try { isGm = (typeof myRole !== 'undefined' && String(myRole) === 'GM'); } catch {}

      if (isGm) {
        if (incoming.size === 0) {
          this._exploredSet = new Set();
          return;
        }
        const merged = new Set(this._exploredSet || []);
        for (const k of incoming) merged.add(k);
        this._exploredSet = merged;
        return;
      }

      this._exploredSet = incoming;
    },

    _wallEdgesSet() {
      const st = this._lastState || {};
      const bw = Number(st.boardWidth) || 10;
      const bh = Number(st.boardHeight) || 10;
      const walls = Array.isArray(st.walls) ? st.walls : [];
      const set = new Set();

      const keyBetween = (ax, ay, bx, by) => {
        if (ax > bx || (ax === bx && ay > by)) {
          const tx = ax, ty = ay;
          ax = bx; ay = by;
          bx = tx; by = ty;
        }
        return `${ax},${ay}|${bx},${by}`;
      };

      for (const ed of walls) {
        const x = Number(ed?.x);
        const y = Number(ed?.y);
        const dir = String(ed?.dir || ed?.direction || '').toUpperCase();
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (dir !== 'N' && dir !== 'E' && dir !== 'S' && dir !== 'W') continue;
        if (x < 0 || y < 0 || x >= bw || y >= bh) continue;

        let nx = x, ny = y;
        if (dir === 'N') ny = y - 1;
        if (dir === 'S') ny = y + 1;
        if (dir === 'W') nx = x - 1;
        if (dir === 'E') nx = x + 1;
        if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;

        set.add(keyBetween(x, y, nx, ny));
      }
      return set;
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
      const wallSig = walls.map(ed => {
        const x = Number(ed?.x), y = Number(ed?.y);
        const dir = String(ed?.dir || ed?.direction || '').toUpperCase();
        const type = String(ed?.type || 'stone');
        const th = Number(ed?.thickness) || 4;
        return `${x},${y},${dir},${type},${th}`;
      }).join(';');
      const key = `${w}x${h}|r${Number(fog.visionRadius) || 8}|walls${walls.length}:${wallSig}|src${sources.map(p => `${p.id}:${p.x},${p.y},${p.size||1}`).join(';')}|npc${npcSources.map(p => `${p.id}:${p.x},${p.y},${p.size||1}`).join(';')}`;
      if (key === this._dynKey && this._dynVisible) return;

      const visible = new Uint8Array(w * h);
      const npcVisible = new Uint8Array(w * h);
      const edgeSet = this._wallEdgesSet();
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
              if (!hasLineOfSightCells(ox, oy, x, y, edgeSet)) continue;
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
              if (!hasLineOfSightCells(ox, oy, x, y, edgeSet)) continue;
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
          const sm = (typeof window !== 'undefined' && typeof window.sendMessage === 'function')
            ? window.sendMessage
            : (typeof sendMessage === 'function' ? sendMessage : null);
          if (sm) sm({ type: 'fogSetExplored', cells: Array.from(this._exploredSet) });
        } catch {}
      }, 250);
    },

    _cancelExploredSync() {
      try {
        if (this._pendingExploredSync) {
          clearTimeout(this._pendingExploredSync);
          this._pendingExploredSync = null;
        }
      } catch {}
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

      const isGm = (typeof myRole !== 'undefined' && String(myRole) === 'GM');
      const gmView = String(fog?.gmViewMode || 'gm');
      const gmOpen = !!fog.gmOpen;

      // If GM requested "Open for GM" and GM is in GM view, do not draw dark fog overlay.
      const skipDarkOverlay = (isGm && gmView !== 'player' && gmOpen);

      // Draw per-cell rectangles: hidden alpha, explored alpha, visible clear
      const exploredOn = !!fog.exploredEnabled;
      const explored = this._exploredSet;
      const baseReveal = (fog.manualBase === 'reveal');

      if (!skipDarkOverlay) {
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
      }

      // Manual brush preview (GM, manual mode, only when "Рисовать" включено)
      try {
        const isGm = (typeof myRole !== 'undefined' && String(myRole) === 'GM');
        const drawOn = !!document.getElementById('fog-draw')?.checked;
        if (isGm && fog?.enabled && String(fog?.mode || '') === 'manual' && drawOn && this._manualPreview) {
          const pv = this._manualPreview;
          const n = Math.max(1, Math.min(10, Math.floor(Number(pv.n) || 1)));
          const x0 = Math.floor(Number(pv.x) || 0);
          const y0 = Math.floor(Number(pv.y) || 0);
          const fill = (String(pv.mode || 'reveal') === 'hide') ? 'rgba(255,80,80,0.16)' : 'rgba(90,220,140,0.16)';
          const stroke = (String(pv.mode || 'reveal') === 'hide') ? 'rgba(255,80,80,0.55)' : 'rgba(90,220,140,0.55)';
          ctx.fillStyle = fill;
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 2;

          for (let y = y0; y < y0 + n; y++) {
            for (let x = x0; x < x0 + n; x++) {
              if (x < 0 || y < 0 || x >= wCells || y >= hCells) continue;
              ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
            }
          }

          // outline bbox
          const bx1 = Math.max(0, x0) * CELL;
          const by1 = Math.max(0, y0) * CELL;
          const bx2 = Math.min(wCells, x0 + n) * CELL;
          const by2 = Math.min(hCells, y0 + n) * CELL;
          ctx.strokeRect(bx1 + 1, by1 + 1, Math.max(0, bx2 - bx1 - 2), Math.max(0, by2 - by1 - 2));
        }
      } catch {}


      // GM-only overlay: show FOV for GM-created non-allies in red tint (dynamic mode only).
      try {
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
      // Manual drawing (GM): square NxN brush ("Размер"), open/close like buttons.

      const getCellFromEvent = (e) => {
        const rect = canvas.getBoundingClientRect();
        const px = (e.clientX - rect.left);
        const py = (e.clientY - rect.top);
        const x = clampInt(Math.floor(px / CELL), 0, (Number(this._lastState?.boardWidth) || 10) - 1);
        const y = clampInt(Math.floor(py / CELL), 0, (Number(this._lastState?.boardHeight) || 10) - 1);
        return { x, y };
      };

      const isGm = () => {
        try { return (typeof myRole !== 'undefined' && String(myRole) === 'GM'); } catch { return false; }
      };

      const drawEnabled = () => !!document.getElementById('fog-draw')?.checked;
      const mode = () => String(document.getElementById('fog-brush-mode')?.value || 'reveal');
      const size = () => {
        const n = Number(document.getElementById('fog-size')?.value);
        return clampInt(Number.isFinite(n) ? n : 1, 1, 10);
      };

      const canDrawNow = () => {
        const st = this._lastState;
        if (!st?.fog?.enabled) return false;
        if (st.fog.mode !== 'manual') return false;
        if (!isGm()) return false;
        return drawEnabled();
      };

      const sendStamp = (stampObj) => {
        try {
          const sm = (typeof window !== 'undefined' && typeof window.sendMessage === 'function')
            ? window.sendMessage
            : (typeof sendMessage === 'function' ? sendMessage : null);
          if (sm) sm({ type: 'fogStamp2', stamp: stampObj });
        } catch {}
      };

      const updatePointerEvents = () => {
        canvas.style.pointerEvents = canDrawNow() ? 'auto' : 'none';
      };

      this._togglePointerEvents = updatePointerEvents;

      const onClick = (e) => {
        updatePointerEvents();
        if (!canDrawNow()) return;
        const st = this._lastState;
        if (!st) return;
        const p = getCellFromEvent(e);
        const m = mode();

        // Single-click square stamp (top-left cell), size NxN.
        sendStamp({ kind: 'square', x: p.x, y: p.y, n: size(), mode: m });
      };

      canvas.addEventListener('click', onClick);

      const onMove = (e) => {
        updatePointerEvents();
        if (!canDrawNow()) {
          if (this._manualPreview) {
            this._manualPreview = null;
            this._requestPreviewRender?.();
          }
          return;
        }
        const p = getCellFromEvent(e);
        const n = size();
        const m = mode();
        const prev = this._manualPreview;
        if (prev && prev.x === p.x && prev.y === p.y && prev.n === n && prev.mode === m) return;
        this._manualPreview = { x: p.x, y: p.y, n, mode: m };
        this._requestPreviewRender?.();
      };

      // rAF render for preview
      this._requestPreviewRender = () => {
        if (this._manualPreviewRaf) return;
        this._manualPreviewRaf = requestAnimationFrame(() => {
          this._manualPreviewRaf = 0;
          try { this._render(); } catch {}
        });
      };

      canvas.addEventListener('mousemove', onMove);
      canvas.addEventListener('mouseleave', () => {
        if (this._manualPreview) {
          this._manualPreview = null;
          this._requestPreviewRender?.();
        }
      });

      // Touch: emulate click on touchstart
      canvas.addEventListener('touchstart', (e) => {
        updatePointerEvents();
        if (!canDrawNow()) return;
        const t = e.touches?.[0];
        if (t) onClick(t);
        e.preventDefault();
      }, { passive: false });

      canvas.addEventListener('touchmove', (e) => {
        const t = e.touches?.[0];
        if (t) onMove(t);
        e.preventDefault();
      }, { passive: false });

      // UI actions
      const bindBtn = (id, fn) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('click', fn);
      };

      const callSend = (payload) => {
        try {
          const sm = (typeof window !== 'undefined' && typeof window.sendMessage === 'function')
            ? window.sendMessage
            : (typeof sendMessage === 'function' ? sendMessage : null);
          if (sm) sm(payload);
        } catch {}
      };

      bindBtn('fog-hide-all', () => callSend({ type: 'fogFill', value: 'hideAll' }));
      bindBtn('fog-reveal-all', () => callSend({ type: 'fogFill', value: 'revealAll' }));
      bindBtn('fog-clear-explored', () => {
        // IMPORTANT: after clearing explored on the server, we must also clear the local cache
        // and cancel any pending debounce sync. Otherwise, an old scheduled sync can
        // overwrite fresh exploration or keep clients stuck until a full fog toggle.
        try {
          this._exploredSet = new Set();
          this._cancelExploredSync();
          // Force dynamic recompute on next token update (exploration depends on it).
          this._dynKey = '';
          this._render();
        } catch {}
        try {
          const sm = (typeof window !== 'undefined' && typeof window.sendMessage === 'function')
            ? window.sendMessage
            : (typeof sendMessage === 'function' ? sendMessage : null);
          if (sm) sm({ type: 'fogClearExplored' });
        } catch {}
      });

      const onSettingsChange = () => {
        try {
          if (typeof myRole === 'undefined' || String(myRole) !== 'GM') return;
          const enabled = !!document.getElementById('fog-enabled')?.checked;
          const gmOpen = !!document.getElementById('fog-open-for-gm')?.checked;
          const mode = String(document.getElementById('fog-mode')?.value || 'manual');
          const gmViewMode = String(document.getElementById('fog-gm-view')?.value || 'gm');
          const visionRadius = clampInt(Number(document.getElementById('fog-vision')?.value) || 8, 1, 60);
          const useWalls = !!document.getElementById('fog-use-walls')?.checked;
          const exploredEnabled = !!document.getElementById('fog-explored')?.checked;
          const moveOnlyExplored = !!document.getElementById('fog-move-only-open')?.checked;
          const sm = (typeof window !== 'undefined' && typeof window.sendMessage === 'function')
            ? window.sendMessage
            : (typeof sendMessage === 'function' ? sendMessage : null);
          if (sm) sm({ type: 'setFogSettings', enabled, gmOpen, mode, gmViewMode, visionRadius, useWalls, exploredEnabled, moveOnlyExplored });
        } catch {}
      };

      ['fog-enabled','fog-open-for-gm','fog-mode','fog-gm-view','fog-vision','fog-use-walls','fog-explored','fog-move-only-open','fog-size'].forEach(id => {
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
      setChecked('fog-open-for-gm', !!fog.gmOpen);
      setValue('fog-mode', (fog.mode === 'dynamic' ? 'dynamic' : 'manual'));
      setValue('fog-gm-view', (String(fog.gmViewMode || 'gm') === 'player' ? 'player' : 'gm'));
      setValue('fog-vision', Number(fog.visionRadius) || 8);
      setChecked('fog-use-walls', fog.useWalls !== false);
      setChecked('fog-explored', fog.exploredEnabled !== false);
      setChecked('fog-move-only-open', !!fog.moveOnlyExplored);

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

  // Bresenham LOS across grid cells.
  // Walls are segments between adjacent cells.
  function hasLineOfSightCells(x0, y0, x1, y1, edgeSet) {
    // Robust LOS with wall-edges (no diagonal "leaks").
    // Use 2D DDA (Amanatides & Woo). When ray hits a grid corner we test BOTH incident edges
    // and block if ANY is walled: strict "no peeking" through corner/tee connections.
    if (!edgeSet) return true;
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

    // center-to-center ray in cell coordinates
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

    const EPS = 1e-4; // tolerance to avoid diagonal leaks near corners

    while (!(cx === x1 && cy === y1)) {
      if (Math.abs(tMaxX - tMaxY) < EPS) {
        // corner: ray passes through a grid vertex.
        // To prevent "peeking" around an outside corner, be strict:
        // block if ANY of the four edges touching this vertex (on either side) are walled.
        const nx = cx + stepX;
        const ny = cy + stepY;

        // near edges (leaving current cell)
        if (blocked(cx, cy, nx, cy)) return false;
        if (blocked(cx, cy, cx, ny)) return false;

        // far edges (entering diagonal cell) – fixes outside-corner diagonal leaks
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

  window.FogWar = FogWar;
})();
