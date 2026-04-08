// ================== COMBAT + APPEARANCE UI HELPERS ==================
// Extracted from sheet-modal-bindings.js to isolate combat-tab preview helpers
// and keep the same global function API for existing callers.

function calcWeaponAttackBonus(sheet, weapon) {
  if (!sheet || !weapon) return 0;
  const ability = String(weapon.ability || "str");
  const statMod = safeInt(sheet?.stats?.[ability]?.modifier, 0);
  const prof = weapon.prof ? getProfBonus(sheet) : 0;
  const extra = safeInt(weapon.extraAtk, 0);
  return statMod + prof + extra;
}

function calcWeaponDamageBonus(sheet, weapon) {
  if (!sheet || !weapon) return 0;
  const ability = String(weapon.ability || "str");
  // В sheet.stats[ability] в наших json обычно есть modifier, но на всякий случай
  // вычислим из value, если modifier отсутствует.
  const direct = sheet?.stats?.[ability]?.modifier;
  if (direct !== undefined && direct !== null && direct !== "") return safeInt(direct, 0);
  const score = safeInt(sheet?.stats?.[ability]?.value, 10);
  return Math.floor((score - 10) / 2);
}

function weaponDamageText(weapon) {
  const n = Math.max(0, safeInt(weapon?.dmgNum, 1));
  const dice = String(weapon?.dmgDice || "к6");
  const type = String(weapon?.dmgType || "").trim();
  return `${n}${dice}${type ? ` ${type}` : ""}`.trim();
}

// Обновляем "Бонус атаки" и превью урона без полного ререндера
function updateWeaponsBonuses(root, sheet) {
  if (!root || !sheet) return;
  const list = Array.isArray(sheet?.weaponsList) ? sheet.weaponsList : [];

  const cards = root.querySelectorAll('.weapon-card[data-weapon-idx]');
  cards.forEach(card => {
    const idx = safeInt(card.getAttribute('data-weapon-idx'), -1);
    if (idx < 0) return;

    const w = list[idx];
    if (!w || typeof w !== "object") return;

    // Legacy оружие просто пропускаем
    const isNew = ("ability" in w || "prof" in w || "extraAtk" in w || "dmgNum" in w || "dmgDice" in w || "dmgType" in w || "desc" in w || "collapsed" in w);
    if (!isNew) return;

    const atkEl = card.querySelector('[data-weapon-atk]');
    if (atkEl) atkEl.textContent = formatMod(calcWeaponAttackBonus(sheet, w));

    const dmgEl = card.querySelector('[data-weapon-dmg]');
    if (dmgEl) dmgEl.textContent = weaponDamageText(w);

    const profDot = card.querySelector('[data-weapon-prof]');
    if (profDot) {
      profDot.classList.toggle('active', !!w.prof);
      profDot.title = `Владение: +${getProfBonus(sheet)} к бонусу атаки`;
    }

    const detailsWrap = card.querySelector('.weapon-details');
    if (detailsWrap) detailsWrap.classList.toggle('collapsed', !!w.collapsed);

    const head = card.querySelector('.weapon-head');
    if (head) {
      head.classList.toggle('is-collapsed', !!w.collapsed);
      head.classList.toggle('is-expanded', !w.collapsed);
    }

    const toggleBtn = card.querySelector('[data-weapon-toggle-desc]');
    if (toggleBtn) toggleBtn.textContent = w.collapsed ? "Показать" : "Скрыть";
  });
}


function rerenderCombatTabInPlace(root, player, canEdit) {
  const main = root?.querySelector('#sheet-main');
  if (!main || player?._activeSheetTab !== "combat") return;

  const freshSheet = player.sheet?.parsed || createEmptySheet(player.name);
  const freshVm = toViewModel(freshSheet, player.name);
  main.innerHTML = renderActiveTab("combat", freshVm, canEdit);

  bindEditableInputs(root, player, canEdit);
  bindSkillBoostDots(root, player, canEdit);
  bindAbilityAndSkillEditors(root, player, canEdit);
  bindNotesEditors(root, player, canEdit);
  bindSlotEditors(root, player, canEdit);
  bindCombatEditors(root, player, canEdit);

  updateWeaponsBonuses(root, player.sheet?.parsed);
}

// ===== Appearance (Облик) =====
function normalizeGenderKeyForAppearance(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return 'male';
  if (v === 'male' || v === 'm') return 'male';
  if (v === 'female' || v === 'f') return 'female';
  if (v.startsWith('м')) return 'male';
  if (v.startsWith('ж')) return 'female';
  return 'male';
}

function getAppearanceBaseImageUrl(sheet) {
  const race = String(getByPath(sheet, 'info.race.value') || '').trim();
  const genderRaw = String(getByPath(sheet, 'notes.details.gender.value') || '').trim();
  const gender = normalizeGenderKeyForAppearance(genderRaw);
  const override = String(getByPath(sheet, 'appearance.baseUrl') || '').trim();
  return override || (race ? `assets/base/${race}/${gender}.png` : '');
}

function updateAppearancePreview(root, sheet) {
  try {
    const img = root?.querySelector?.('[data-appearance-preview]');
    if (!img || !sheet) return;

    const src = getAppearanceBaseImageUrl(sheet);
    if (!src) return;
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
  } catch (e) {
    console.warn('updateAppearancePreview failed', e);
  }
}

function updateTokenPreview(root, player, sheet) {
  try {
    if (!root || !player || !sheet) return;
    const box = root.querySelector('[data-tokenbox]');
    const prev = root.querySelector('[data-token-preview]');
    if (!box || !prev) return;

    // Ensure token settings exist
    if (!sheet.appearance || typeof sheet.appearance !== 'object') sheet.appearance = {};
    if (!sheet.appearance.token || typeof sheet.appearance.token !== 'object') sheet.appearance.token = {};
    if (!sheet.appearance.token.crop || typeof sheet.appearance.token.crop !== 'object') sheet.appearance.token.crop = {};

    const normalizeMode = window.TokenIsoMini?.normalizeTokenMode;
    const mode = typeof normalizeMode === 'function'
      ? normalizeMode(String(sheet.appearance.token.mode || '').trim())
      : (String(sheet.appearance.token.mode || '').trim() || 'crop');
    const cropX = Math.max(0, Math.min(100, safeInt(sheet.appearance.token.crop.x, 50)));
    const cropY = Math.max(0, Math.min(100, safeInt(sheet.appearance.token.crop.y, 35)));
    const zoom = Math.max(80, Math.min(220, safeInt(sheet.appearance.token.crop.zoom, 140)));

    // Base image URL (same logic as appearance preview)
    const src = (mode === 'iso-mini')
      ? String(sheet?.appearance?.token?.isoMiniUrl || '').trim()
      : getAppearanceBaseImageUrl(sheet);

    // Border color from player
    prev.style.setProperty('--token-border', String(player.color || '#888'));

    // Show/hide crop controls
    const cropWrap = root.querySelector('[data-token-crop]');
    if (cropWrap) cropWrap.style.display = (mode === 'crop') ? '' : 'none';

    if (mode === 'color' || !src) {
      prev.classList.add('token-preview--color');
      prev.style.backgroundImage = 'none';
      prev.style.backgroundColor = String(player.color || '#666');
      prev.style.backgroundSize = '';
      prev.style.backgroundPosition = '';
    } else {
      prev.classList.remove('token-preview--color');
      prev.style.backgroundColor = 'transparent';
      prev.style.backgroundImage = `url("${src}")`;
      prev.style.backgroundRepeat = 'no-repeat';

      if (mode === 'full' || mode === 'portrait' || mode === 'iso-mini') {
        prev.style.backgroundSize = 'contain';
        prev.style.backgroundPosition = 'center center';
      } else {
        // crop mode
        prev.style.backgroundSize = `${zoom}%`;
        prev.style.backgroundPosition = `${cropX}% ${cropY}%`;
      }
    }
  } catch (e) {
    console.warn('updateTokenPreview failed', e);
  }
}

function bindAppearanceUi(root, player, canEdit) {
  if (!root || !player?.sheet?.parsed) return;
  const sheet = player.sheet.parsed;

  // ensure containers exist
  if (!sheet.appearance || typeof sheet.appearance !== 'object') sheet.appearance = {};
  if (!sheet.appearance.slots || typeof sheet.appearance.slots !== 'object') sheet.appearance.slots = {};

  // initial preview update
  updateAppearancePreview(root, sheet);
  // token preview
  try {
    if (!sheet.appearance || typeof sheet.appearance !== 'object') sheet.appearance = {};
    if (!sheet.appearance.token || typeof sheet.appearance.token !== 'object') sheet.appearance.token = { mode: 'portrait', crop: { x: 50, y: 35, zoom: 140 } };
    if (!sheet.appearance.token.crop || typeof sheet.appearance.token.crop !== 'object') sheet.appearance.token.crop = { x: 50, y: 35, zoom: 140 };
    const normalizeMode = window.TokenIsoMini?.normalizeTokenMode;
    if (!sheet.appearance.token.mode) sheet.appearance.token.mode = 'portrait';
    if (typeof normalizeMode === 'function') {
      sheet.appearance.token.mode = normalizeMode(sheet.appearance.token.mode);
    }
    if (sheet.appearance.token.crop.x === undefined) sheet.appearance.token.crop.x = 50;
    if (sheet.appearance.token.crop.y === undefined) sheet.appearance.token.crop.y = 35;
    if (sheet.appearance.token.crop.zoom === undefined) sheet.appearance.token.crop.zoom = 140;
    if (sheet.appearance.token.isoMiniUrl === undefined) sheet.appearance.token.isoMiniUrl = '';
  } catch {}
  updateTokenPreview(root, player, sheet);

  // iso-mini upload
  const tokenIsoUpload = root.querySelector('[data-token-iso-upload]');
  const tokenIsoClear = root.querySelector('[data-token-iso-clear]');
  const tokenIsoUrl = root.querySelector('[data-token-iso-url]');
  const setIsoMiniUrl = (val) => {
    const next = String(val || '').trim();
    if (!sheet.appearance.token || typeof sheet.appearance.token !== 'object') sheet.appearance.token = {};
    sheet.appearance.token.isoMiniUrl = next;
    if (tokenIsoUrl) tokenIsoUrl.value = next;
    try { updateTokenPreview(root, player, sheet); } catch {}
    scheduleSheetSave(player);
  };
  if (tokenIsoUpload && canEdit) {
    tokenIsoUpload.addEventListener('change', async () => {
      try {
        const file = tokenIsoUpload.files?.[0];
        if (!file) return;
        if (!String(file.type || '').startsWith('image/')) return;
        const dataUrl = await new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result || ''));
          fr.onerror = () => reject(fr.error || new Error('read failed'));
          fr.readAsDataURL(file);
        });
        setIsoMiniUrl(dataUrl);
      } catch (e) {
        console.warn('iso-mini upload failed', e);
      } finally {
        try { tokenIsoUpload.value = ''; } catch {}
      }
    });
  }
  if (tokenIsoClear && canEdit) {
    tokenIsoClear.addEventListener('click', () => setIsoMiniUrl(''));
  }
  if (tokenIsoUrl) tokenIsoUrl.value = String(sheet?.appearance?.token?.isoMiniUrl || '');

  // live updates
  const raceSel = root.querySelector('[data-race-select]');
  const genderSel = root.querySelector('[data-gender-select]');
  const baseOverrideInp = root.querySelector('[data-appearance-base-override]');

  const onAnyToken = () => {
    try { updateAppearancePreview(root, sheet); } catch {}
    try { updateTokenPreview(root, player, sheet); } catch {}
  };
  raceSel?.addEventListener('change', onAnyToken);
  genderSel?.addEventListener('change', onAnyToken);
  baseOverrideInp?.addEventListener('input', onAnyToken);
}
