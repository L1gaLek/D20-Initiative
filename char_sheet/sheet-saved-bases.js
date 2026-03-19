/* sheet-saved-bases.js — вынесено из info-sheet-player.js */

// ===== Saved bases overlay state =====
let savedBasesOverlay = null;
let savedBasesListCache = [];
let savedBasesOverlayPlayerId = null;

function ensureSavedBasesOverlay() {
  if (savedBasesOverlay) return savedBasesOverlay;

  const overlay = document.createElement('div');
  overlay.className = 'saved-bases-overlay hidden';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <div class="saved-bases-modal">
      <div class="saved-bases-head">
        <div>
          <div class="saved-bases-title">Мои сохранённые персонажи</div>
          <div class="saved-bases-sub">Список привязан к вашему уникальному id (не к никнейму).</div>
        </div>
        <button type="button" class="saved-bases-close" title="Закрыть">✕</button>
      </div>

      <div class="saved-bases-body">
        <div class="saved-bases-loading">Загружаю список…</div>
        <div class="saved-bases-empty hidden">Пока нет сохранённых персонажей. Нажмите «Сохранить основу».</div>

        <div class="saved-bases-list" role="list"></div>
      </div>

      <div class="saved-bases-footer">
        <button type="button" class="saved-bases-delete" disabled>Удалить</button>
        <div style="flex:1"></div>
        <button type="button" class="saved-bases-refresh">Обновить</button>
        <button type="button" class="saved-bases-apply" disabled>Загрузить</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  savedBasesOverlay = overlay;

  const closeBtn = overlay.querySelector('.saved-bases-close');
  closeBtn?.addEventListener('click', () => closeSavedBasesOverlay());

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSavedBasesOverlay();
  });

  overlay.querySelector('.saved-bases-refresh')?.addEventListener('click', () => {
    try {
      openSavedBasesOverlay({ loading: true, playerId: savedBasesOverlayPlayerId });
      window.__sheetCtx?.sendMessage?.({ type: 'listSavedBases' });
    } catch {}
  });

  overlay.querySelector('.saved-bases-apply')?.addEventListener('click', () => {
    const sel = overlay.querySelector('input[name="savedBasePick"]:checked');
    const savedId = sel?.value;
    if (!savedId) return;
    if (!savedBasesOverlayPlayerId) return;
    try {
      window.__sheetCtx?.sendMessage?.({ type: 'applySavedBase', playerId: savedBasesOverlayPlayerId, savedId });
    } catch {}
  });

  overlay.querySelector('.saved-bases-delete')?.addEventListener('click', () => {
    const sel = overlay.querySelector('input[name="savedBasePick"]:checked');
    const savedId = sel?.value;
    if (!savedId) return;
    if (!confirm('Удалить сохранённого персонажа?')) return;
    try {
      window.__sheetCtx?.sendMessage?.({ type: 'deleteSavedBase', savedId });
    } catch {}
  });

  return overlay;
}

function openSavedBasesOverlay({ loading = false, playerId = null } = {}) {
  const overlay = ensureSavedBasesOverlay();
  savedBasesOverlayPlayerId = playerId;
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');

  const loadingEl = overlay.querySelector('.saved-bases-loading');
  const emptyEl = overlay.querySelector('.saved-bases-empty');
  const listEl = overlay.querySelector('.saved-bases-list');
  const applyBtn = overlay.querySelector('.saved-bases-apply');
  const delBtn = overlay.querySelector('.saved-bases-delete');

  if (loadingEl) loadingEl.style.display = loading ? '' : 'none';
  emptyEl?.classList.add('hidden');
  if (listEl) listEl.innerHTML = '';
  if (applyBtn) applyBtn.disabled = true;
  if (delBtn) delBtn.disabled = true;
}

function closeSavedBasesOverlay() {
  if (!savedBasesOverlay) return;
  savedBasesOverlay.classList.add('hidden');
  savedBasesOverlay.setAttribute('aria-hidden', 'true');
  savedBasesOverlayPlayerId = null;
}

function renderSavedBasesList(list) {
  const overlay = ensureSavedBasesOverlay();
  const loadingEl = overlay.querySelector('.saved-bases-loading');
  const emptyEl = overlay.querySelector('.saved-bases-empty');
  const listEl = overlay.querySelector('.saved-bases-list');
  const applyBtn = overlay.querySelector('.saved-bases-apply');
  const delBtn = overlay.querySelector('.saved-bases-delete');

  if (loadingEl) loadingEl.style.display = 'none';
  if (!listEl) return;

  listEl.innerHTML = '';

  const arr = Array.isArray(list) ? list : [];
  savedBasesListCache = arr;

  if (!arr.length) {
    emptyEl?.classList.remove('hidden');
    if (applyBtn) applyBtn.disabled = true;
    if (delBtn) delBtn.disabled = true;
    return;
  }

  emptyEl?.classList.add('hidden');

  arr.forEach(item => {
    const row = document.createElement('label');
    row.className = 'saved-bases-row';
    const dt = item?.updatedAt ? new Date(item.updatedAt) : null;
    const when = dt && !isNaN(dt.getTime())
      ? dt.toLocaleString()
      : '';
    row.innerHTML = `
      <input type="radio" name="savedBasePick" value="${escapeHtml(String(item.id || ''))}">
      <div class="saved-bases-row-main">
        <div class="saved-bases-row-name">${escapeHtml(item.name || 'Персонаж')}</div>
        <div class="saved-bases-row-meta">${escapeHtml(when)}</div>
      </div>
    `;
    listEl.appendChild(row);
  });

  listEl.querySelectorAll('input[name="savedBasePick"]').forEach(inp => {
    inp.addEventListener('change', () => {
      if (applyBtn) applyBtn.disabled = false;
      if (delBtn) delBtn.disabled = false;
    });
  });

  // auto-select first
  const first = listEl.querySelector('input[name="savedBasePick"]');
  if (first) {
    first.checked = true;
    if (applyBtn) applyBtn.disabled = false;
    if (delBtn) delBtn.disabled = false;
  }
}
