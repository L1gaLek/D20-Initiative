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
    panY: 0
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

  function applyBoardViewMode(mode) {
    const normalized = normalizeMode(mode);
    const wrapper = document.getElementById('board-wrapper');
    if (wrapper) wrapper.classList.toggle('board-view--isometric', normalized === 'isometric');

    window.__boardViewMode = normalized;
    window.__boardViewExtraTransform = normalized === 'isometric' ? getIsometricTransform() : '';
    window.__boardViewTransformOrigin = normalized === 'isometric' ? '50% 50%' : '0 0';
    window.dispatchEvent(new CustomEvent('board-view-mode-changed', { detail: { mode: normalized } }));
    if (normalized === 'isometric') centerBoardInWrapper();
  }

  function bindIsometricMouseControls() {
    if (controlsBound) return;
    const wrapper = document.getElementById('board-wrapper');
    if (!wrapper) return;
    controlsBound = true;

    wrapper.addEventListener('mousedown', (e) => {
      if (e.button !== 1) return;
      if (normalizeMode(window.__boardViewMode) !== 'isometric') return;
      dragState = { x: e.clientX, y: e.clientY };
      wrapper.classList.add('board-view--dragging');
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragState) return;
      const dx = (Number(e.clientX) || 0) - dragState.x;
      const dy = (Number(e.clientY) || 0) - dragState.y;
      dragState = { x: e.clientX, y: e.clientY };
      if (e.shiftKey) {
        isoState.panX += dx;
        isoState.panY += dy;
      } else {
        isoState.rotateZ += dx * ISO_ROTATE_SENS;
        isoState.rotateX = clamp(isoState.rotateX - (dy * ISO_TILT_SENS), ISO_MIN_TILT, ISO_MAX_TILT);
      }
      applyBoardViewMode('isometric');
      e.preventDefault();
    });

    const endDrag = () => {
      if (!dragState) return;
      dragState = null;
      wrapper.classList.remove('board-view--dragging');
    };
    window.addEventListener('mouseup', endDrag);
    wrapper.addEventListener('mouseleave', endDrag);
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
    applyBoardViewMode(initial);
    bindIsometricMouseControls();

    select.addEventListener('change', () => {
      const mode = normalizeMode(select.value);
      select.value = mode;
      saveMode(mode);
      applyBoardViewMode(mode);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBoardViewModeToggle);
  } else {
    initBoardViewModeToggle();
  }

  window.applyBoardViewMode = applyBoardViewMode;
})();
