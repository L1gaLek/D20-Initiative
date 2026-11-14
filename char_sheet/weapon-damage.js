function getWeaponDamageModifiers(weapon) {
  return Array.isArray(weapon?.damageModifiers) ? weapon.damageModifiers : [];
}

function weaponDamageModifierText(modifier) {
  return modifier?.type === 'flat' ? String(safeInt(modifier.value, 0))
    : `${Math.max(1, Math.min(20, safeInt(modifier?.count, 1)))}${String(modifier?.dice || 'к6')}`;
}

function renderWeaponDamageSummary(weapon) {
  const base = `${Math.max(0, safeInt(weapon?.dmgNum, 1))}${String(weapon?.dmgDice || 'к6')}`;
  const type = String(weapon?.dmgType || '').trim();
  return `<span class="weapon-damage-summary"><span class="weapon-damage-base">${escapeHtml(base)}</span>${type ? `<span class="weapon-damage-type">${escapeHtml(type)}</span>` : ''}</span>`;
}

function renderWeaponDamageExtras(weapon) {
  const modifiers = getWeaponDamageModifiers(weapon);
  if (!modifiers.length) return '';
  const extras = modifiers.map((modifier, index) => {
    const value = safeInt(modifier?.value, 0);
    const text = modifier?.type === 'flat'
      ? `${value < 0 ? '−' : '+'}${Math.abs(value)}` : `+${weaponDamageModifierText(modifier)}`;
    const description = String(modifier?.description || '').trim() || `Дополнительный урон ${index + 1}`;
    return `<span class="weapon-damage-extra" title="${escapeHtml(description)}" aria-label="${escapeHtml(`${text}: ${description}`)}">${escapeHtml(text)}</span>`;
  }).join('');
  return `<span class="weapon-damage-extras__label">Доп. урон</span>${extras}`;
}

function getWeaponDamageParts(sheet, weapon) {
  const parts = [{ type: 'dice', description: 'Основной урон',
    count: Math.max(1, Math.min(20, safeInt(weapon?.dmgNum, 1))),
    sides: safeInt(String(weapon?.dmgDice || 'к6').replace(/[кd]/i, ''), 6) }];
  const ability = calcWeaponDamageBonus(sheet, weapon);
  if (ability) parts.push({ type: 'flat', description: 'Характеристика', value: ability });
  for (const modifier of getWeaponDamageModifiers(weapon)) {
    parts.push(modifier?.type === 'flat'
      ? { type: 'flat', description: modifier.description, value: safeInt(modifier.value, 0) }
      : { type: 'dice', description: modifier?.description,
        count: Math.max(1, Math.min(20, safeInt(modifier?.count, 1))),
        sides: safeInt(String(modifier?.dice || 'к6').replace(/[кd]/i, ''), 6) });
  }
  return parts;
}

function rollWeaponDamage(sheet, weapon, actorName) {
  return window.DicePanel?.roll?.({ damageParts: getWeaponDamageParts(sheet, weapon),
    kindText: `Урон: ${actorName || 'Персонаж'} · ${weapon?.name || 'Оружие'}`, actorName });
}

function renderWeaponDamageModifiers(weapon, canEdit = true) {
  const disabled = canEdit ? '' : 'disabled';
  const options = ['к4', 'к6', 'к8', 'к10', 'к12', 'к20', 'к100'];
  return `<div class="weapon-damage-modifiers">
    <div class="weapon-damage-modifiers__head"><span>Дополнительный урон</span>
      <button type="button" class="weapon-btn" data-damage-add title="Добавить урон" ${disabled}><span aria-hidden="true">＋</span> Добавить урон</button></div>
    ${getWeaponDamageModifiers(weapon).map((modifier, index) => `<div class="weapon-damage-modifier" data-damage-idx="${index}">
      <div class="weapon-damage-modifier__controls">
        <select class="weapon-select" data-damage-field="type" aria-label="Способ дополнительного урона" ${disabled}>
          <option value="dice" ${modifier.type !== 'flat' ? 'selected' : ''}>Кубики</option>
          <option value="flat" ${modifier.type === 'flat' ? 'selected' : ''}>Значение</option></select>
        ${modifier.type === 'flat'
          ? `<input class="weapon-num" type="number" step="1" value="${safeInt(modifier.value, 0)}" data-damage-field="value" aria-label="Дополнительный урон" ${disabled}>`
          : `<input class="weapon-num" type="number" min="1" max="20" step="1" value="${Math.max(1, Math.min(20, safeInt(modifier.count, 1)))}" data-damage-field="count" aria-label="Количество дополнительных кубиков" ${disabled}>
            <select class="weapon-select" data-damage-field="dice" aria-label="Кубик дополнительного урона" ${disabled}>${options.map(dice => `<option ${String(modifier.dice || 'к6') === dice ? 'selected' : ''}>${dice}</option>`).join('')}</select>`}
        <button type="button" class="weapon-btn danger" data-damage-del aria-label="Удалить дополнительный урон" ${disabled}>✕</button>
      </div>
      <textarea class="weapon-damage-description" rows="2" data-damage-field="description" placeholder="Описание дополнительного урона…" aria-label="Описание дополнительного урона" ${disabled}>${escapeHtml(String(modifier.description || ''))}</textarea>
    </div>`).join('')}
  </div>`;
}
