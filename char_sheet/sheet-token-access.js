function renderTokenAccessControls(player) {
  let bar = document.getElementById('sheet-token-access');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'sheet-token-access';
    bar.className = 'sheet-token-access';
    sheetSubtitle.after(bar);
  }
  bar.replaceChildren();
  const role = ctx?.getMyRole?.();
  const uid = String(ctx?.getMyId?.() || '');
  const owner = String(player.ownerId || '');
  const mayManage = role === 'GM' || (role === 'Player' && uid === owner);
  const persist = async (action, value) => {
    flushSheetSaves(player.id);
    const result = await window.vpsApi(`/rooms/${encodeURIComponent(ctx.getRoomId())}/players/${encodeURIComponent(player.id)}/access`, {
      method: 'POST', body: { action, targetUserId: action === 'affiliation' ? undefined : value,
        affiliation: action === 'affiliation' ? value : undefined,
        sheet: deepClone(player.sheet), sheetUpdatedAt: Number(player.sheetUpdatedAt) || 0 }
    });
    const saved = result.state?.players?.find(p => String(p.id) === String(player.id));
    if (saved && JSON.stringify(saved.sheet) === JSON.stringify(player.sheet)) acknowledgeSheetSave(player.id, saved.sheetUpdatedAt);
    ctx?.applyState?.(result.state);
  };
  document.getElementById('sheet-affiliation')?.remove();
  const affiliation = document.createElement('span');
  affiliation.id = 'sheet-affiliation';
  const affiliationSelect = document.createElement('select');
  affiliationSelect.setAttribute('aria-label', 'Принадлежность');
  affiliationSelect.append(new Option('Союзник', 'ally'), new Option('Враг', 'enemy'));
  affiliationSelect.value = player.isEnemy ? 'enemy' : 'ally';
  affiliationSelect.disabled = !mayManage;
  const affiliationStatus = document.createElement('span');
  affiliationStatus.setAttribute('role', 'status');
  affiliationSelect.addEventListener('change', async () => {
    affiliationSelect.disabled = true;
    affiliationStatus.textContent = 'Сохраняю…';
    try {
      await persist('affiliation', affiliationSelect.value);
      affiliationStatus.textContent = '';
    }
    catch (error) {
      affiliationSelect.value = player.isEnemy ? 'enemy' : 'ally';
      affiliationStatus.textContent = error?.message || 'Не удалось сохранить';
    } finally { affiliationSelect.disabled = !mayManage; }
  });
  affiliation.append(affiliationSelect, affiliationStatus);
  document.getElementById('sheet-title-row')?.appendChild(affiliation);
  if (player.controllerId) {
    const info = document.createElement('span');
    info.className = 'sheet-token-access__current';
    info.textContent = `Управление: ${player.controllerName || player.controllerId}`;
    bar.appendChild(info);
  }
  if (!mayManage) return;
  const users = (ctx?.getUsers?.() || []).filter(u => ['GM', 'Player'].includes(u.role));
  const addAction = (action, title, emptyLabel, current) => {
    const group = document.createElement('label');
    group.className = 'sheet-token-access__group';
    group.dataset.tokenAction = action;
    const caption = document.createElement('span');
    caption.textContent = title;
    const select = document.createElement('select');
    select.setAttribute('aria-label', title);
    select.appendChild(new Option(emptyLabel, ''));
    users.filter(u => String(u.id) !== owner).forEach(u => select.appendChild(new Option(u.name || 'Игрок', u.id)));
    if (current && ![...select.options].some(o => o.value === current)) {
      select.appendChild(new Option(player.controllerName || 'Игрок', current));
    }
    select.value = current || '';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action === 'owner' ? 'Передать токен' : 'Применить';
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    button.addEventListener('click', async () => {
      if (action === 'owner' && !select.value) return;
      button.disabled = true;
      status.textContent = 'Сохраняю…';
      try {
        await persist(action, select.value);
        status.textContent = 'Сохранено';
      } catch (error) {
        status.textContent = error?.message || 'Не удалось сохранить';
      } finally { button.disabled = false; }
    });
    group.append(caption, select, button, status);
    bar.appendChild(group);
  };
  if (role === 'GM') addAction('owner', 'Передача токена', 'Выберите нового владельца', '');
  addAction('controller', 'Передача управления', 'Только владелец и ГМ', String(player.controllerId || ''));
}
