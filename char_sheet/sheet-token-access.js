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
  if (player.controllerId) {
    const info = document.createElement('span');
    info.textContent = `Управление: ${player.controllerName || player.controllerId}`;
    bar.appendChild(info);
  }
  if (!mayManage) return;
  const users = (ctx?.getUsers?.() || []).filter(u => ['GM', 'Player'].includes(u.role));
  const addAction = (action, title, emptyLabel, current) => {
    const group = document.createElement('label');
    group.className = 'sheet-token-access__group';
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
        flushSheetSaves(player.id);
        const result = await window.vpsApi(`/rooms/${encodeURIComponent(ctx.getRoomId())}/players/${encodeURIComponent(player.id)}/access`, {
          method: 'POST', body: { action, targetUserId: select.value,
            sheet: deepClone(player.sheet), sheetUpdatedAt: Number(player.sheetUpdatedAt) || 0 }
        });
        status.textContent = 'Сохранено';
        const saved = result.state?.players?.find(p => String(p.id) === String(player.id));
        if (saved && JSON.stringify(saved.sheet) === JSON.stringify(player.sheet)) acknowledgeSheetSave(player.id, saved.sheetUpdatedAt);
        ctx?.applyState?.(result.state);
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
