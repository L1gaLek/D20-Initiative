// ================== DICE (from the bottom-left panel) ==================
rollBtn?.addEventListener('click', async () => {
  if (diceAnimBusy) return;
  diceAnimBusy = true;
  rollBtn.disabled = true;

  // Used to prevent double animation when the server echoes back our own diceEvent.
  // (We already animate locally in this handler.)
  const localNonce = `n_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  try { window._lastSentDiceNonce = localNonce; } catch {}

  const sides = clampInt(dice?.value, 2, 100, 20);
  const count = clampInt(diceCountInput?.value, 1, 20, 1);

  clearCritUI();

  // Итоговые значения заранее
  const finals = Array.from({ length: count }, () => rollDie(sides));
  const shown = Array.from({ length: count }, () => null);

  renderRollChips(shown, 0, sides);

  if (diceVizKind) diceVizKind.textContent = `d${sides} × ${count}`;
  if (diceVizValue) diceVizValue.textContent = "…";

  // Анимация: по одному кубику (видно процесс)
  for (let i = 0; i < count; i++) {
    renderRollChips(shown, i, sides);
    await animateSingleRoll(sides, finals[i]);
    shown[i] = finals[i];
    renderRollChips(shown, Math.min(i + 1, count - 1), sides);
  }

const sum = finals.reduce((a, b) => a + b, 0);

// без "Результат:" — только число
if (diceVizValue) diceVizValue.textContent = String(sum);

renderRollChips(shown, -1, sides);

// ✅ крит-подсветка только для одиночного d20 (без инициативы)
const critType = getSingleD20CritType({
  sides,
  count,
  rolls: finals,
  kindText: `d${sides} × ${count}`
});
if (critType) {
  applySingleD20CritUI(finals[0], critType);
} else {
  clearCritUI();
}

  sendMessage({
  type: "diceEvent",
  event: {
    localNonce,
    fromId: (typeof myId !== 'undefined') ? String(myId) : '',
    fromName: (typeof myNameSpan !== 'undefined' && myNameSpan?.textContent) ? String(myNameSpan.textContent) : '',
    kindText: `d${sides} × ${count}`,
    sides,
    count,
    bonus: 0,
    rolls: finals,
    total: sum,
    crit: (sides === 20 && count === 1)
      ? (finals[0] === 1 ? "crit-fail" : finals[0] === 20 ? "crit-success" : "")
      : ""
  }
});

  diceAnimBusy = false;
  rollBtn.disabled = false;
});

// ================== END TURN ==================
endTurnBtn?.addEventListener('click', () => sendMessage({ type: 'endTurn' }));

// ================== INITIATIVE ==================
rollInitiativeBtn.addEventListener('click', async () => {
  // Инициатива считается на сервере (d20 + модификатор Ловкости).
  // Сервер рассылает diceEvent — мы покажем его у себя в панели и у других в "Броски других".
  // UX: сразу показываем визуальную "заглушку" в панели броска, чтобы действие было видно мгновенно.
  clearCritUI();
  renderRollChips([null], -1, 20);
  if (diceVizKind) diceVizKind.textContent = 'Инициатива: d20';
  if (diceVizValue) diceVizValue.textContent = '…';
  sendMessage({ type: 'rollInitiative' });
});

/*
// ================== WALLS ==================
editEnvBtn.addEventListener('click', () => {
  editEnvironment = !editEnvironment;
  addWallBtn.disabled = !editEnvironment;
  removeWallBtn.disabled = !editEnvironment;
  wallMode = null;
  editEnvBtn.textContent = editEnvironment ? "Редактирование: ВКЛ" : "Редактирование: ВЫКЛ";
});

addWallBtn.addEventListener('click', () => wallMode = 'add');
removeWallBtn.addEventListener('click', () => wallMode = 'remove');

board.addEventListener('mousedown', e => {
  if (!editEnvironment || !wallMode) return;
  const cell = e.target.closest('.cell');
  if (!cell) return;
  mouseDown = true;
  toggleWall(cell);
});

board.addEventListener('mouseover', e => {
  if (!mouseDown || !editEnvironment || !wallMode) return;
  const cell = e.target.closest('.cell');
  if (!cell) return;
  toggleWall(cell);
});

board.addEventListener('mouseup', () => { mouseDown = false; });

function toggleWall(cell) {
  if (!cell) return;
  const x = +cell.dataset.x, y = +cell.dataset.y;
  if (wallMode === 'add') {
    sendMessage({ type: 'addWall', wall: { x, y } });
    cell.classList.add('wall');
  } else if (wallMode === 'remove') {
    sendMessage({ type: 'removeWall', wall: { x, y } });
    cell.classList.remove('wall');
  }
}

/*
// ================== CREATE BOARD ==================
*/

createBoardBtn.addEventListener('click', () => {
  // ВАЖНО: "Ширина поля/Высота поля" — это персональный вид (рамка/скролл),
  // а не реальный размер карты. Реальный размер меняет только GM через "Применить карту".
  const width = parseInt(boardWidthInput.value, 10);
  const height = parseInt(boardHeightInput.value, 10);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return;

  // Если подключен ControlBox — используем его (он меняет только viewport)
  if (window.ControlBox && typeof window.ControlBox.setViewport === 'function') {
    window.ControlBox.setViewport(width, height);
    return;
  }

  // Fallback (на случай если controlbox.js не загрузился)
  if (width < 5 || height < 5 || width > 80 || height > 80)
    return alert("Введите корректные размеры поля (5–80)");

  // Рамка = размер в пикселях (не меняет state)
  try {
    boardWrapper.style.overflow = 'auto';
    boardWrapper.style.width = `${width * 50}px`;
    boardWrapper.style.height = `${height * 50}px`;
  } catch {}
});

/*
// ================== RESET GAME ==================
*/

resetGameBtn.addEventListener('click', () => {
  playerElements.forEach(el => el.remove());
  playerElements.clear();
  sendMessage({ type: 'resetGame' });
});

/*
// ================== CLEAR BOARD ==================
*/

clearBoardBtn.addEventListener('click', () => {
  sendMessage({ type: 'clearBoard' });
});


// ===== Campaign save/load UI (GM) =====
function snapshotCampaignStateForSave() {
  const st = ensureStateHasMaps(deepClone(lastState || null));
  // Зафиксируем всё текущее (подложка/стены/позиции) в активную карту перед сохранением
  syncActiveToMap(st);
  return st;
}

let campaignSavesOverlay = null;

function openCampaignSavesOverlay(list, onPick) {
  if (campaignSavesOverlay) {
    try { campaignSavesOverlay.remove(); } catch {}
    campaignSavesOverlay = null;
  }

  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `
    <div class="modal" style="max-width: 760px;">
      <div class="modal-header">
        <div>
          <div class="modal-title">Загрузить кампанию</div>
          <div class="modal-subtitle">Сохранения доступны в любой комнате (привязка к этому браузеру ГМа)</div>
        </div>
        <button class="modal-close" data-cmp-close>✕</button>
      </div>
      <div class="modal-body">
        <div style="display:flex; flex-direction:column; gap:10px;" data-cmp-list></div>
      </div>
    </div>
  `;

  document.body.appendChild(ov);
  campaignSavesOverlay = ov;

  const close = () => {
    try { ov.remove(); } catch {}
    if (campaignSavesOverlay === ov) campaignSavesOverlay = null;
  };

  ov.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.classList.contains('modal-overlay')) return close();
    if (t.closest('[data-cmp-close]')) return close();
  });

  const box = ov.querySelector('[data-cmp-list]');
  if (!box) return;

  if (!list || list.length === 0) {
    box.innerHTML = `<div class="sheet-note">Сохранений нет.</div>`;
    return;
  }

  list.forEach((it) => {
    const row = document.createElement('div');
    row.className = 'saved-bases-row';
    const created = it.created_at ? new Date(it.created_at).toLocaleString() : '';
    row.innerHTML = `
      <div class="saved-bases-row-main" style="flex:1;">
        <div class="saved-bases-row-name">${String(it.name || 'Без названия')}</div>
        <div class="saved-bases-row-meta">${created}</div>
      </div>
      <div style="display:flex; gap:8px;">
        <button type="button" data-pick="${it.id}">Загрузить</button>
        <button type="button" data-del="${it.id}">Удалить</button>
      </div>
    `;

    row.addEventListener('click', async (e) => {
      const tt = e.target;
      if (!(tt instanceof Element)) return;

      const pick = tt.closest('[data-pick]');
      if (pick) {
        const id = pick.getAttribute('data-pick');
        close();
        onPick?.(id);
        return;
      }

      const del = tt.closest('[data-del]');
      if (del) {
        const id = del.getAttribute('data-del');
        if (!confirm('Удалить это сохранение?')) return;
        try {
          await deleteCampaignSave(id);
          const fresh = await listCampaignSavesByOwner(getCampaignOwnerKey());
          close();
          openCampaignSavesOverlay(fresh, onPick);
        } catch (err) {
          console.error(err);
          alert('Не удалось удалить сохранение');
        }
      }
    });

    box.appendChild(row);
  });
}

saveCampaignBtn?.addEventListener('click', async () => {
  try {
    if (!isGM()) return;
    if (!currentRoomId) return;

    const name = prompt('Название сохранения:', `Сохранение ${new Date().toLocaleString()}`);
    if (name === null) return;
    const clean = String(name).trim();
    if (!clean) return;

    const snap = snapshotCampaignStateForSave();
    const ownerKey = getCampaignOwnerKey();
    await createCampaignSave(ownerKey, clean, snap);
    alert('Кампания сохранена. Теперь её можно загрузить в любой комнате.');
  } catch (err) {
    console.error(err);
    alert('Не удалось сохранить кампанию');
  }
});

loadCampaignBtn?.addEventListener('click', async () => {
  try {
    if (!isGM()) return;
    if (!currentRoomId) return;

    const ownerKey = getCampaignOwnerKey();
    const list = await listCampaignSavesByOwner(ownerKey);

    openCampaignSavesOverlay(list, async (saveId) => {
      try {
        const st = await getCampaignSaveState(saveId);
        if (!st) return alert('Сохранение пустое/не найдено');

        const normalized = ensureStateHasMaps(deepClone(st));
        // Загружаем в ТЕКУЩУЮ комнату
        await upsertRoomState(currentRoomId, normalized);
      } catch (e) {
        console.error(e);
        alert('Не удалось загрузить кампанию');
      }
    });
  } catch (err) {
    console.error(err);
    alert('Не удалось получить список сохранений');
  }
});

// ===== SRD Monsters (GM) =====
openMonstersBtn?.addEventListener('click', async () => {
  try {
    if (!isGM()) return;
    await ensureMonstersLibrary();
    window.MonstersLib?.open?.();
  } catch (e) {
    console.error(e);
    alert('Не удалось открыть библиотеку монстров');
  }
});
