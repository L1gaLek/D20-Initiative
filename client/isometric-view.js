(function () {
  const LS_VIEW_MODE = 'int_board_view_mode';
  const ISO_ROTATE_SENS = 0.25;
  const ISO_TILT_SENS = 0.2;
  const ISO_MIN_TILT = 25;
  const ISO_MAX_TILT = 80;
  const isoState = {
    rotateX: 57,
    rotateZ: -45,
    panX: 0,
    panY: 0,
    originX: null,
    originY: null
  };
  let dragState = null;
  let controlsBound = false;

  function normalizeMode(value) {
    return String(value || '').trim() === 'isometric' ? 'isometric' : 'topdown';
  }

  function getSavedMode() {
    try {
      if (typeof getAppStorageItem === 'function') return normalizeMode(getAppStorageItem(LS_VIEW_MODE));
      return normalizeMode(localStorage.getItem(LS_VIEW_MODE));
    } catch {}
    return 'topdown';
  }

  function saveMode(mode) {
    try {
      if (typeof setAppStorageItem === 'function') setAppStorageItem(LS_VIEW_MODE, mode);
      else localStorage.setItem(LS_VIEW_MODE, mode);
    } catch {}
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function getIsometricTransform() {
    const x = Number(isoState.panX) || 0;
    const y = Number(isoState.panY) || 0;
    const rx = clamp(isoState.rotateX, ISO_MIN_TILT, ISO_MAX_TILT);
    const rz = Number(isoState.rotateZ) || 0;
    return `translate(${x}px, ${y}px) rotateX(${rx}deg) rotateZ(${rz}deg)`;
  }

  function getIsometricTransformOrigin() {
    const ox = Number(isoState.originX);
    const oy = Number(isoState.originY);
    if (Number.isFinite(ox) && Number.isFinite(oy)) return `${ox}px ${oy}px`;
    return '50% 50%';
  }

  function setPivotFromPointer(clientX, clientY, rawTarget) {
    const board = document.getElementById('game-board');
    if (!board) return;
    const target = rawTarget && rawTarget.closest ? rawTarget : null;
    const cell = target ? target.closest('.cell') : null;

    if (cell && cell.dataset) {
      const cx = Number(cell.dataset.x);
      const cy = Number(cell.dataset.y);
      const cellW = Number(cell.offsetWidth) || 50;
      const cellH = Number(cell.offsetHeight) || 50;
      if (Number.isFinite(cx) && Number.isFinite(cy)) {
        isoState.originX = (cx * cellW) + (cellW / 2);
        isoState.originY = (cy * cellH) + (cellH / 2);
        return;
      }
    }

    const rect = board.getBoundingClientRect();
    const bw = Number(board.offsetWidth) || Number(rect.width) || 0;
    const bh = Number(board.offsetHeight) || Number(rect.height) || 0;
    if (!rect.width || !rect.height || !bw || !bh) return;
    const rx = clamp((Number(clientX) - rect.left) / rect.width, 0, 1);
    const ry = clamp((Number(clientY) - rect.top) / rect.height, 0, 1);
    isoState.originX = rx * bw;
    isoState.originY = ry * bh;
  }

  function centerBoardInWrapper() {
    const wrapper = document.getElementById('board-wrapper');
    if (!wrapper) return;
    requestAnimationFrame(() => {
      try {
        wrapper.scrollLeft = Math.max(0, (wrapper.scrollWidth - wrapper.clientWidth) / 2);
        wrapper.scrollTop = Math.max(0, (wrapper.scrollHeight - wrapper.clientHeight) / 2);
      } catch {}
    });
  }

  function applyBoardViewMode(mode, options = null) {
    const opts = options && typeof options === 'object' ? options : {};
    const normalized = normalizeMode(mode);
    const wrapper = document.getElementById('board-wrapper');
    if (wrapper) wrapper.classList.toggle('board-view--isometric', normalized === 'isometric');

    window.__boardViewMode = normalized;
    window.__boardViewExtraTransform = normalized === 'isometric' ? getIsometricTransform() : '';
    window.__boardViewTransformOrigin = normalized === 'isometric' ? getIsometricTransformOrigin() : '0 0';
    window.dispatchEvent(new CustomEvent('board-view-mode-changed', { detail: { mode: normalized } }));
    if (normalized === 'isometric' && opts.recenter === true) centerBoardInWrapper();
  }

  function moveCameraPivotToWrapperCenter(clientX, clientY) {
    const wrapper = document.getElementById('board-wrapper');
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const centerX = rect.left + (rect.width / 2);
    const centerY = rect.top + (rect.height / 2);
    isoState.panX += (centerX - Number(clientX || 0));
    isoState.panY += (centerY - Number(clientY || 0));
  }

  function bindIsometricMouseControls() {
    if (controlsBound) return;
    const wrapper = document.getElementById('board-wrapper');
    if (!wrapper) return;
    controlsBound = true;

    wrapper.addEventListener('mousedown', (e) => {
      if (e.button !== 1) return;
      if (normalizeMode(window.__boardViewMode) !== 'isometric') return;
      setPivotFromPointer(e.clientX, e.clientY, e.target);
      dragState = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false };
      wrapper.classList.add('board-view--dragging');
      applyBoardViewMode('isometric');
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragState) return;
      const startX = dragState.startX;
      const startY = dragState.startY;
      const movedBefore = !!dragState.moved;
      const dx = (Number(e.clientX) || 0) - dragState.x;
      const dy = (Number(e.clientY) || 0) - dragState.y;
      const movedNow = movedBefore
        || Math.abs((Number(e.clientX) || 0) - startX) > 2
        || Math.abs((Number(e.clientY) || 0) - startY) > 2;
      dragState = { x: e.clientX, y: e.clientY, startX, startY, moved: movedNow };
      if (e.shiftKey) {
        isoState.panX += dx;
        isoState.panY += dy;
      } else {
        isoState.rotateZ += dx * ISO_ROTATE_SENS;
        isoState.rotateX = clamp(isoState.rotateX - (dy * ISO_TILT_SENS), ISO_MIN_TILT, ISO_MAX_TILT);
      }
      applyBoardViewMode('isometric', { recenter: false });
      e.preventDefault();
    });

    const endDrag = (e = null) => {
      if (!dragState) return;
      const moved = !!dragState.moved;
      const upX = Number(e?.clientX);
      const upY = Number(e?.clientY);
      if (!moved && Number.isFinite(upX) && Number.isFinite(upY)) {
        moveCameraPivotToWrapperCenter(upX, upY);
        applyBoardViewMode('isometric', { recenter: false });
      }
      dragState = null;
      wrapper.classList.remove('board-view--dragging');
    };
    window.addEventListener('mouseup', endDrag);
    wrapper.addEventListener('mouseleave', () => endDrag());
    wrapper.addEventListener('auxclick', (e) => {
      if (e.button !== 1) return;
      if (normalizeMode(window.__boardViewMode) !== 'isometric') return;
      e.preventDefault();
    });
  }

  function initBoardViewModeToggle() {
    const select = document.getElementById('board-view-mode-select');
    if (!select || select.dataset.bound === '1') return;
    select.dataset.bound = '1';

    const initial = getSavedMode();
    select.value = initial;
    applyBoardViewMode(initial, { recenter: true });
    bindIsometricMouseControls();

    select.addEventListener('change', () => {
      const mode = normalizeMode(select.value);
      select.value = mode;
      saveMode(mode);
      applyBoardViewMode(mode, { recenter: mode === 'isometric' });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBoardViewModeToggle);
  } else {
    initBoardViewModeToggle();
  }

  window.applyBoardViewMode = applyBoardViewMode;
})();
