(function () {
  const LS_VIEW_MODE = 'int_board_view_mode';

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

  function getIsometricTransform() {
    return 'rotateX(57deg) rotateZ(-45deg) translate(-12%, -36%) scale(1.4)';
  }

  function applyBoardViewMode(mode) {
    const normalized = normalizeMode(mode);
    const wrapper = document.getElementById('board-wrapper');
    if (wrapper) wrapper.classList.toggle('board-view--isometric', normalized === 'isometric');

    window.__boardViewMode = normalized;
    window.__boardViewExtraTransform = normalized === 'isometric' ? getIsometricTransform() : '';
    window.dispatchEvent(new CustomEvent('board-view-mode-changed', { detail: { mode: normalized } }));
  }

  function initBoardViewModeToggle() {
    const select = document.getElementById('board-view-mode-select');
    if (!select || select.dataset.bound === '1') return;
    select.dataset.bound = '1';

    const initial = getSavedMode();
    select.value = initial;
    applyBoardViewMode(initial);

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
