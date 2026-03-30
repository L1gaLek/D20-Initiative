(function(){
  function safeInt(v, d = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : d;
  }

  function escapeHtml(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getCtx() {
    return window.__sheetCtx || null;
  }

  function getAllPlayers() {
    const ctx = getCtx();
    try {
      const arr = (typeof ctx?.getPlayers === 'function') ? ctx.getPlayers() : null;
      if (Array.isArray(arr)) return arr;
    } catch {}
    try {
      const arr = (typeof window.getVisiblePlayers === 'function') ? window.getVisiblePlayers() : null;
      if (Array.isArray(arr)) return arr;
    } catch {}
    if (Array.isArray(window.players)) return window.players;
    if (Array.isArray(window.lastState?.players)) return window.lastState.players;
    return [];
  }

  function ownsPlayer(player) {
    const ctx = getCtx();
    const myRole = (typeof ctx?.getMyRole === 'function') ? String(ctx.getMyRole() || '') : '';
    const myId = (typeof ctx?.getMyId === 'function') ? String(ctx.getMyId() ?? '') : '';
    if (myRole === 'GM') return true;
    return String(player?.ownerId || '') === myId;
  }

  function buildPlayerOptions(fromPlayerId, onlyBase) {
    return getAllPlayers()
      .filter((p) => p && String(p.id || '') && String(p.id || '') !== String(fromPlayerId || ''))
      .filter((p) => !onlyBase || !!p?.isBase)
      .map((p) => ({ id: String(p.id), name: String(p.name || 'Персонаж').trim() || 'Персонаж', isBase: !!p?.isBase }));
  }

  function closeModal(node) {
    try { node?.remove?.(); } catch {}
  }

  function openTransferModal({ fromPlayer, tabId, idx, item, maxQty }) {
    const ctx = getCtx();
    const sendMessage = ctx?.sendMessage;
    if (typeof sendMessage !== 'function') return;
    if (!fromPlayer || !item) return;

    const wrap = document.createElement('div');
    wrap.className = 'equip-overlay';
    const itemName = String(item?.name_ru || item?.name || item?.name_en || 'Предмет').trim() || 'Предмет';
    const qtyCap = Math.max(1, safeInt(maxQty, 1));

    wrap.innerHTML = `
      <div class="equip-overlay__backdrop" data-transfer-close></div>
      <div class="equip-overlay__panel" role="dialog" aria-modal="true" style="width:min(620px,92vw)">
        <div class="equip-overlay__head">
          <div class="equip-overlay__title">Передать предмет</div>
          <button class="equip-overlay__x" type="button" data-transfer-close>✕</button>
        </div>
        <div class="equip-overlay__controls" style="gap:10px; align-items:end;">
          <div style="flex:1; min-width:220px;">
            <div class="equip-qtywrap__lbl" style="margin-bottom:6px;">Кому передать</div>
            <select class="equip-ctl" data-transfer-player></select>
          </div>
          <div class="equip-qtywrap">
            <span class="equip-qtywrap__lbl">Количество</span>
            <input class="equip-ctl equip-qty" type="number" min="1" max="${qtyCap}" value="1" data-transfer-qty>
          </div>
        </div>
        <div class="equip-overlay__list" style="padding-top:10px;">
          <div class="sheet-note" style="margin-bottom:10px;">Предмет: <b>${escapeHtml(itemName)}</b> (доступно: ${qtyCap})</div>
          <label style="display:flex; gap:8px; align-items:center; margin-bottom:10px;">
            <input type="checkbox" data-transfer-only-base>
            <span>Только персонажи с флагом «Основа»</span>
          </label>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button class="weapon-btn" type="button" data-transfer-close>Отмена</button>
            <button class="weapon-btn" type="button" data-transfer-send>Передать</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(wrap);

    const selectEl = wrap.querySelector('[data-transfer-player]');
    const onlyBaseEl = wrap.querySelector('[data-transfer-only-base]');
    const qtyEl = wrap.querySelector('[data-transfer-qty]');

    function renderTargets() {
      const targets = buildPlayerOptions(fromPlayer?.id, !!onlyBaseEl?.checked);
      if (selectEl) {
        selectEl.innerHTML = targets.length
          ? targets.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}${p.isBase ? ' ☑ Основа' : ' ☐ Основа'}</option>`).join('')
          : '<option value="">Нет доступных игроков</option>';
      }
    }

    renderTargets();

    wrap.addEventListener('click', (e) => {
      if (e.target?.closest?.('[data-transfer-close]')) {
        closeModal(wrap);
        return;
      }
      const sendBtn = e.target?.closest?.('[data-transfer-send]');
      if (!sendBtn) return;

      const toPlayerId = String(selectEl?.value || '').trim();
      const qty = Math.max(1, Math.min(qtyCap, safeInt(qtyEl?.value, 1)));
      if (!toPlayerId) {
        alert('Выберите получателя.');
        return;
      }

      sendMessage({
        type: 'inventoryTransferRequest',
        fromPlayerId: String(fromPlayer?.id || ''),
        toPlayerId,
        tabId: String(tabId || 'other'),
        itemIdx: safeInt(idx, -1),
        qty
      });
      closeModal(wrap);
      alert('Запрос на передачу отправлен.');
    });

    onlyBaseEl?.addEventListener('change', renderTargets);
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal(wrap);
    });
  }

  function openIncomingOfferModal(offer) {
    if (!offer || !ownsPlayer({ ownerId: offer?.toOwnerId })) return;

    const wrap = document.createElement('div');
    wrap.className = 'equip-overlay';
    const itemName = String(offer?.itemName || 'Предмет').trim() || 'Предмет';
    const fromName = String(offer?.fromPlayerName || 'Игрок').trim() || 'Игрок';
    const qty = Math.max(1, safeInt(offer?.qty, 1));

    wrap.innerHTML = `
      <div class="equip-overlay__backdrop"></div>
      <div class="equip-overlay__panel" role="dialog" aria-modal="true" style="width:min(560px,92vw)">
        <div class="equip-overlay__head">
          <div class="equip-overlay__title">Передача предмета</div>
        </div>
        <div class="equip-overlay__list" style="padding-top:10px;">
          <div class="sheet-note" style="margin-bottom:12px;">
            <b>${escapeHtml(fromName)}</b> хочет передать вам <b>${qty} × ${escapeHtml(itemName)}</b>.
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button class="weapon-btn" type="button" data-offer-decline>Отклонить</button>
            <button class="weapon-btn" type="button" data-offer-accept>Принять</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(wrap);

    function answer(accepted) {
      const sendMessage = getCtx()?.sendMessage;
      if (typeof sendMessage === 'function') {
        sendMessage({ type: 'inventoryTransferRespond', offer, accepted: !!accepted });
      }
      closeModal(wrap);
    }

    wrap.querySelector('[data-offer-accept]')?.addEventListener('click', () => answer(true));
    wrap.querySelector('[data-offer-decline]')?.addEventListener('click', () => answer(false));
  }

  function onTransferOffer(msg) {
    const offer = msg?.offer;
    if (!offer) return;
    const ctx = getCtx();
    const myId = (typeof ctx?.getMyId === 'function') ? String(ctx.getMyId() ?? '') : '';
    if (String(offer?.toOwnerId || '') !== myId) return;
    openIncomingOfferModal(offer);
  }

  function onTransferResult(msg) {
    const result = msg?.result;
    if (!result) return;
    const ctx = getCtx();
    const myId = (typeof ctx?.getMyId === 'function') ? String(ctx.getMyId() ?? '') : '';
    const mine = String(result?.fromOwnerId || '') === myId || String(result?.toOwnerId || '') === myId;
    if (!mine) return;
    const text = String(result?.message || '').trim();
    if (text) alert(text);
  }

  window.__inventoryTransfer = {
    openTransferModal,
    onTransferOffer,
    onTransferResult
  };
})();
