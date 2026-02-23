  // ===== LIVE UI UPDATERS (без полного ререндера) =====
  function updateHeroChips(root, sheet) {
    if (!root || !sheet) return;
    const ac = safeInt(sheet?.vitality?.ac?.value, 0);
    const hp = safeInt(sheet?.vitality?.["hp-max"]?.value, 0);
    const hpCur = safeInt(sheet?.vitality?.["hp-current"]?.value, 0);
    const spd = safeInt(sheet?.vitality?.speed?.value, 0);

    const acEl = root.querySelector('[data-hero-val="ac"]');
    if (acEl) {
      if (acEl.tagName === "INPUT" || acEl.tagName === "TEXTAREA") acEl.value = String(ac);
      else acEl.textContent = String(ac);
    }

    const hpEl = root.querySelector('[data-hero-val="hp"]');
    const hpTemp = safeInt(sheet?.vitality?.["hp-temp"]?.value, 0);
    if (hpEl) hpEl.textContent = (hpTemp > 0 ? `(${hpTemp}) ${hpCur}/${hp}` : `${hpCur}/${hp}`);

    // HP "liquid" fill in chip (shrinks right-to-left)
    const hpChip = root.querySelector('[data-hero="hp"]');
    if (hpChip) {
      const ratio = (hp > 0) ? Math.max(0, Math.min(1, hpCur / hp)) : 0;
      const pct = Math.round(ratio * 100);
      hpChip.style.setProperty('--hp-fill-pct', `${pct}%`);
    }


    // Inspiration star (SVG)
    const inspChip = root.querySelector('[data-hero="insp"] .insp-star');
    if (inspChip) {
      const on = !!safeInt(sheet?.inspiration, 0);
      inspChip.classList.toggle('on', on);
    }

    const spdEl = root.querySelector('[data-hero-val="speed"]');
    if (spdEl) {
      if (spdEl.tagName === "INPUT" || spdEl.tagName === "TEXTAREA") spdEl.value = String(spd);
      else spdEl.textContent = String(spd);
    }

    // Shield indicator inside AC chip
    try {
      const hasShield = !!String(sheet?.appearance?.slots?.shield || '').trim();
      const sh = root.querySelector('[data-ac-shield-icon]');
      if (sh) sh.classList.toggle('on', hasShield);
    } catch {}
  }

  function updateSkillsAndPassives(root, sheet) {
    if (!root || !sheet) return;

    // skills
    const dots = root.querySelectorAll('.lss-dot[data-skill-key]');
    dots.forEach(dot => {
      const key = dot.getAttribute('data-skill-key');
      if (!key) return;
      const row = dot.closest('.lss-skill-row');
      if (!row) return;
      const valEl = row.querySelector('.lss-skill-val');
      if (valEl) {
        const v = formatMod(calcSkillBonus(sheet, key));
        if (valEl.tagName === "INPUT" || valEl.tagName === "TEXTAREA") valEl.value = v;
        else valEl.textContent = v;
      }
    });

    // passives (10 + skill bonus)
    const passiveKeys = ["perception", "insight", "investigation"];
    passiveKeys.forEach(k => {
      const val = 10 + (sheet?.skills?.[k] ? calcSkillBonus(sheet, k) : 0);
      const el = root.querySelector(`.lss-passive-val[data-passive-val="${k}"]`);
      if (el) el.textContent = String(val);
    });
  }

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

function updateAppearancePreview(root, sheet) {
  try {
    const img = root?.querySelector?.('[data-appearance-preview]');
    if (!img || !sheet) return;

    const race = String(getByPath(sheet, 'info.race.value') || '').trim();
    const genderRaw = String(getByPath(sheet, 'notes.details.gender.value') || '').trim();
    const gender = normalizeGenderKeyForAppearance(genderRaw);
    const override = String(getByPath(sheet, 'appearance.baseUrl') || '').trim();

    const src = override || (race ? `assets/base/${race}/${gender}.png` : '');
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

    const mode = String(sheet.appearance.token.mode || '').trim() || 'crop';
    const cropX = Math.max(0, Math.min(100, safeInt(sheet.appearance.token.crop.x, 50)));
    const cropY = Math.max(0, Math.min(100, safeInt(sheet.appearance.token.crop.y, 35)));
    const zoom = Math.max(80, Math.min(220, safeInt(sheet.appearance.token.crop.zoom, 140)));

    // Base image URL (same logic as appearance preview)
    const race = String(getByPath(sheet, 'info.race.value') || '').trim();
    const genderRaw = String(getByPath(sheet, 'notes.details.gender.value') || '').trim();
    const gender = normalizeGenderKeyForAppearance(genderRaw);
    const override = String(getByPath(sheet, 'appearance.baseUrl') || '').trim();
    const src = override || (race ? `assets/base/${race}/${gender}.png` : '');

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

      if (mode === 'full') {
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
    if (!sheet.appearance.token || typeof sheet.appearance.token !== 'object') sheet.appearance.token = { mode: 'crop', crop: { x: 50, y: 35, zoom: 140 } };
    if (!sheet.appearance.token.crop || typeof sheet.appearance.token.crop !== 'object') sheet.appearance.token.crop = { x: 50, y: 35, zoom: 140 };
    if (!sheet.appearance.token.mode) sheet.appearance.token.mode = 'crop';
    if (sheet.appearance.token.crop.x === undefined) sheet.appearance.token.crop.x = 50;
    if (sheet.appearance.token.crop.y === undefined) sheet.appearance.token.crop.y = 35;
    if (sheet.appearance.token.crop.zoom === undefined) sheet.appearance.token.crop.zoom = 140;
  } catch {}
  updateTokenPreview(root, player, sheet);

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

function bindCombatEditors(root, player, canEdit) {
  if (!root || !player?.sheet?.parsed) return;
  const sheet = player.sheet.parsed;

  // ===== Умения и способности (новый формат: список карточек) =====
  if (!sheet.combat || typeof sheet.combat !== "object") sheet.combat = {};
  if (!Array.isArray(sheet.combat.abilitiesEntries)) sheet.combat.abilitiesEntries = [];

  // миграция старого textarea (combat.skillsAbilities.value) -> первая карточка
  const legacyTxt = String(getByPath(sheet, "combat.skillsAbilities.value") || "").trim();
  if (legacyTxt && sheet.combat.abilitiesEntries.length === 0) {
    sheet.combat.abilitiesEntries.push({ title: "Умение-1", text: legacyTxt, collapsed: false });
    // очистим legacy, чтобы не дублировалось при будущих рендерах
    setByPath(sheet, "combat.skillsAbilities.value", "");
    scheduleSheetSave(player);
  }

  // кнопка "Добавить оружие"
  const addBtn = root.querySelector('[data-weapon-add]');
  if (addBtn) {
    if (!canEdit) addBtn.disabled = true;
    addBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!canEdit) return;

      if (!Array.isArray(sheet.weaponsList)) sheet.weaponsList = [];

      sheet.weaponsList.push({
        name: "Новое оружие",
        ability: "str",
        prof: false,
        extraAtk: 0,
        dmgNum: 1,
        dmgDice: "к6",
        dmgType: "",
        desc: "",
        collapsed: false,
        invId: ""
      });

      // синхронизация: оружие из "Бой" -> "Инвентарь"
      const w = sheet.weaponsList[sheet.weaponsList.length - 1];
      try { window.__equipSync?.syncWeaponCombatToInv?.(sheet, w); } catch {}

      scheduleSheetSave(player);
      rerenderCombatTabInPlace(root, player, canEdit);
    });
  }

  const weaponCards = root.querySelectorAll('.weapon-card[data-weapon-idx]');
  weaponCards.forEach(card => {
    const idx = safeInt(card.getAttribute('data-weapon-idx'), -1);
    if (idx < 0) return;

    if (!Array.isArray(sheet.weaponsList)) sheet.weaponsList = [];
    const w = sheet.weaponsList[idx];
    if (!w || typeof w !== "object") return;

    // Legacy карточки не редактируем
    const isNew = ("ability" in w || "prof" in w || "extraAtk" in w || "dmgNum" in w || "dmgDice" in w || "dmgType" in w || "desc" in w || "collapsed" in w);
    if (!isNew) return;

    // редактирование полей
    const fields = card.querySelectorAll('[data-weapon-field]');
    fields.forEach(el => {
      const field = el.getAttribute('data-weapon-field');
      if (!field) return;

      if (!canEdit) {
        el.disabled = true;
        return;
      }

      const handler = () => {
        let val;
        if (el.tagName === "SELECT") val = el.value;
        else if (el.type === "number") val = el.value === "" ? 0 : Number(el.value);
        else val = el.value;

        if (field === "extraAtk" || field === "dmgNum") val = safeInt(val, 0);

        w[field] = val;

        // синхронизация: правки оружия -> инвентарь
        try { window.__equipSync?.syncWeaponCombatToInv?.(sheet, w); } catch {}

        updateWeaponsBonuses(root, sheet);
        // Авто-пересчёт метрик заклинаний при изменении бонуса мастерства
        if (player?._activeSheetTab === "spells" && (path === "proficiency" || path === "proficiencyCustom")) {
          const s = player.sheet?.parsed;
          if (s) rerenderSpellsTabInPlace(root, player, s, canEdit);
        }

        scheduleSheetSave(player);
      };

      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    });

    // владение (кружок)
    const profBtn = card.querySelector('[data-weapon-prof]');
    if (profBtn) {
      if (!canEdit) profBtn.disabled = true;
      profBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!canEdit) return;
        w.prof = !w.prof;
        updateWeaponsBonuses(root, sheet);
        try { window.__equipSync?.syncWeaponCombatToInv?.(sheet, w); } catch {}
        scheduleSheetSave(player);
      });
    }

    // свернуть/развернуть описание
    const toggleDescBtn = card.querySelector('[data-weapon-toggle-desc]');
    if (toggleDescBtn) {
      if (!canEdit) toggleDescBtn.disabled = true;
      toggleDescBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!canEdit) return;
        w.collapsed = !w.collapsed;
        updateWeaponsBonuses(root, sheet);
        // collapsed не пишем в инвентарь (это UI боя), но пусть синк обновит описание/название если нужно
        try { window.__equipSync?.syncWeaponCombatToInv?.(sheet, w); } catch {}
        scheduleSheetSave(player);
      });
    }

    // удалить
    const delBtn = card.querySelector('[data-weapon-del]');
    if (delBtn) {
      if (!canEdit) delBtn.disabled = true;
      delBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!canEdit) return;

        sheet.weaponsList.splice(idx, 1);

        // синхронизация: удаление оружия -> удалить из инвентаря
        try {
          const invId = String(w?.invId || '').trim();
          if (invId && sheet?.inventory && Array.isArray(sheet.inventory.weapons)) {
            sheet.inventory.weapons = sheet.inventory.weapons.filter(x => String(x?.id || '') !== invId);
          }
        } catch {}
        scheduleSheetSave(player);
        rerenderCombatTabInPlace(root, player, canEdit);
      });
    }

    // 🎲 броски из оружия -> в панель кубиков
    const rollAtkBtn = card.querySelector('[data-weapon-roll-atk]');
    if (rollAtkBtn) {
      rollAtkBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const bonus = calcWeaponAttackBonus(sheet, w);
        if (window.DicePanel?.roll) {
          window.DicePanel.roll({ sides: 20, count: 1, bonus, kindText: `Атака: d20 ${formatMod(bonus)}` });
        }
      });
    }

    const rollDmgBtn = card.querySelector('[data-weapon-roll-dmg]');
    if (rollDmgBtn) {
      rollDmgBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const n = Math.max(0, safeInt(w?.dmgNum, 1));
        const diceStr = String(w?.dmgDice || "к6").trim().toLowerCase(); // "к8"
        const sides = safeInt(diceStr.replace("к", ""), 6);
        const bonus = calcWeaponDamageBonus(sheet, w);
        if (window.DicePanel?.roll) {
          const cnt = Math.max(1, n);
          window.DicePanel.roll({
            sides,
            count: cnt,
            bonus,
            kindText: `Урон: ${cnt}d${sides} ${formatMod(bonus)}`
          });
        }
      });
    }
  });

  // ===== Combat abilities UI =====
  const abilAddBtn = root.querySelector('[data-combat-ability-add]');
  if (abilAddBtn) {
    if (!canEdit) abilAddBtn.disabled = true;
    abilAddBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!canEdit) return;
      if (!sheet.combat || typeof sheet.combat !== "object") sheet.combat = {};
      if (!Array.isArray(sheet.combat.abilitiesEntries)) sheet.combat.abilitiesEntries = [];

      // choose next Умение-N
      const titles = sheet.combat.abilitiesEntries.map(x => String(x?.title || "")).filter(Boolean);
      let maxN = 0;
      for (const t of titles) {
        const mm = /^Умение-(\d+)$/i.exec(t.trim());
        if (mm) maxN = Math.max(maxN, parseInt(mm[1], 10) || 0);
      }
      const nextN = maxN + 1;

      sheet.combat.abilitiesEntries.push({ title: `Умение-${nextN}`, text: "", collapsed: false });
      scheduleSheetSave(player);
      rerenderCombatTabInPlace(root, player, canEdit);
    });
  }

  const abilItems = root.querySelectorAll('.combat-ability-item[data-combat-ability-idx]');
  abilItems.forEach(item => {
    const idx = safeInt(item.getAttribute('data-combat-ability-idx'), -1);
    if (idx < 0) return;
    const ent = sheet?.combat?.abilitiesEntries?.[idx];
    if (!ent || typeof ent !== "object") return;

    const titleInp = item.querySelector('[data-combat-ability-title]');
    if (titleInp) {
      if (!canEdit) titleInp.disabled = true;
      const handler = () => {
        if (!canEdit) return;
        ent.title = String(titleInp.value || "");
        scheduleSheetSave(player);
      };
      titleInp.addEventListener('input', handler);
      titleInp.addEventListener('change', handler);
    }

    const textTa = item.querySelector('[data-combat-ability-text]');
    if (textTa) {
      if (!canEdit) textTa.disabled = true;
      const handler = () => {
        if (!canEdit) return;
        ent.text = String(textTa.value || "");
        scheduleSheetSave(player);
      };
      textTa.addEventListener('input', handler);
      textTa.addEventListener('change', handler);
    }

    const toggleBtn = item.querySelector('[data-combat-ability-toggle]');
    if (toggleBtn) {
      if (!canEdit) toggleBtn.disabled = true;
      toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!canEdit) return;
        ent.collapsed = !ent.collapsed;
        scheduleSheetSave(player);
        rerenderCombatTabInPlace(root, player, canEdit);
      });
    }

    const delBtn = item.querySelector('[data-combat-ability-del]');
    if (delBtn) {
      if (!canEdit) delBtn.disabled = true;
      delBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!canEdit) return;
        if (!confirm('Удалить запись?')) return;
        sheet.combat.abilitiesEntries.splice(idx, 1);
        scheduleSheetSave(player);
        rerenderCombatTabInPlace(root, player, canEdit);
      });
    }
  });

  updateWeaponsBonuses(root, sheet);
}

   


// Normalizes href to avoid in-app relative navigation (important for clickable links in rich text).
function normalizeHref(href) {
  const h = String(href || '').trim();
  if (!h) return '';
  if (/^(https?:\/\/|mailto:|tel:)/i.test(h)) return h;
  if (/^www\./i.test(h)) return 'https://' + h;
  if (/^[a-z0-9.-]+\.[a-z]{2,}([\/?#].*)?$/i.test(h)) return 'https://' + h;
  return h;
}
// ================== RICH TEXT (modal editor) ==================
function upgradeSheetTextareasToRte(root, canEdit) {
  if (!root) return;

  // Global link interceptor for rich-text areas.
  // IMPORTANT:
  // - Links in rich text MUST be real <a href> so the browser recognizes them
  //   (right-click -> "Open in new tab", ctrl/cmd click, etc.).
  // - Some parts of the app may have delegated click handlers that hijack <a> navigation.
  //   We intercept in CAPTURE phase and STOP propagation so native link behavior survives.
  if (!window.__rteLinkInterceptorInstalled) {
    window.__rteLinkInterceptorInstalled = true;
    const stopHijack = (e) => {
      try {
        const a = e.target?.closest?.('a[href]');
        if (!a) return;
        if (!a.closest('.rte-editor') && !a.closest('.rte-modal')) return;
        const href = normalizeHref(a.getAttribute('href'));
        if (!href) return;

        // Stop in-app routers from hijacking. Do NOT preventDefault —
        // we want native link behavior (context menu etc.).
        e.stopPropagation();
        try { e.stopImmediatePropagation?.(); } catch {}

        // If target was stripped, force new tab only for a normal left click.
        const target = String(a.getAttribute('target') || '').toLowerCase();
        if (target !== '_blank' && e.type === 'click' && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          try { window.open(href, '_blank', 'noopener,noreferrer'); } catch {}
        }
      } catch {}
    };

    document.addEventListener('pointerdown', stopHijack, true);
    document.addEventListener('click', stopHijack, true);
  }

  const htmlEscape = (s) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const LINK_COLOR = 'rgb(204,130,36)';

  const makeLinkAnchorHTML = (href, label) => {
    const safeHref = htmlEscape(String(href || ''));
    const safeLabel = htmlEscape(String(label || ''));
    // Keep link styling consistent with the UI (bold + underline + custom color).
    return `<a class="rte-link" href="${safeHref}" target="_blank" rel="noopener noreferrer" style="color:${LINK_COLOR}"><b><u>${safeLabel}</u></b></a>`;
  };

  const linkifyPlain = (plain) => {
    // Preserve paragraph structure from plain text:
    // - blank line(s) => new paragraph (<p>)
    // - single newline => <br> inside paragraph
    const t = String(plain || '');
    const paras = t.split(/\n\s*\n+/g);

    const urlRe = /((https?:\/\/|www\.)[^\s<]+)|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

    const renderInline = (s) => {
      const esc = htmlEscape(String(s || ''));
      return esc.replace(urlRe, (m) => {
        if (m.includes('@') && !m.startsWith('http')) {
          const href = 'mailto:' + m;
          return makeLinkAnchorHTML(href, m);
        }
        const href = normalizeHref(m);
        return makeLinkAnchorHTML(href, m);
      }).replace(/\n/g, '<br>');
    };

    if (paras.length <= 1) return renderInline(t);

    return paras.map(p => `<p>${renderInline(p)}</p>`).join('');
  };


  // NOTE: sanitizeHtml is used both for:
  // 1) saving editor content (keep our own safe inline styles like font-size)
  // 2) pasting from external sources (strip ALL foreign styles, keep only semantic markup)
  // Use options.mode = 'paste' to apply stricter rules.
  const ALLOWED_TAGS = new Set([
    'B','STRONG','I','EM','U','BR','UL','OL','LI','A','P','DIV','SPAN','H1','H2','H3','H4','H5','H6',
    // Tables
    'TABLE','THEAD','TBODY','TFOOT','TR','TD','TH'
  ]);

  const sanitizeHtml = (html, options) => {
    const mode = String(options?.mode || 'store'); // 'store' | 'paste'
    try {
      const tpl = document.createElement('template');
      tpl.innerHTML = String(html || '');

      const walk = (node) => {
        const children = Array.from(node.childNodes || []);
        for (const ch of children) {
          if (ch.nodeType === Node.TEXT_NODE) continue;
          if (ch.nodeType !== Node.ELEMENT_NODE) { ch.remove(); continue; }

          const tag = (ch.tagName || '').toUpperCase();

          // Normalize headings to plain blocks (visual emphasis is handled by site CSS).
          if (tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'H4' || tag === 'H5' || tag === 'H6') {
            const div = document.createElement('div');
            const b = document.createElement('b');
            while (ch.firstChild) b.appendChild(ch.firstChild);
            div.appendChild(b);
            ch.replaceWith(div);
            walk(div);
            continue;
          }

          // Preserve paragraphs.
// In paste mode, many sources use <div> for paragraphs; convert those to <p> so spacing is consistent.
          if (mode === 'paste' && tag === 'DIV') {
            const p = document.createElement('p');
            while (ch.firstChild) p.appendChild(ch.firstChild);
            ch.replaceWith(p);
            walk(p);
            continue;
          }


          if (!ALLOWED_TAGS.has(tag)) {
            const frag = document.createDocumentFragment();
            while (ch.firstChild) frag.appendChild(ch.firstChild);
            ch.replaceWith(frag);
            walk(node);
            continue;
          }

          // strip style/class/etc
          for (const attr of Array.from(ch.attributes || [])) {
            const n = attr.name.toLowerCase();
            // For <a> we keep only safe attributes we will normalize below.
            if (tag === 'A' && (n === 'href' || n === 'title' || n === 'target' || n === 'rel' || n === 'class' || n === 'style')) continue;
            if (tag === 'SPAN' && (n === 'style' || n === 'data-href' || n === 'class')) continue;
            ch.removeAttribute(attr.name);
          }


          if (tag === 'SPAN') {
            // Allow only a very small safe subset of inline styles.
            // - store mode: allow font-size: 12..30px (our own editor feature)
            // - paste mode: strip ALL external styles to keep site look consistent
            // - color is only allowed for our link marker and will be normalized anyway
            const st = String(ch.getAttribute('style') || '');
            const sizeM = st.match(/font-size\s*:\s*([0-9]+)px/i);
            const colorM = st.match(/color\s*:\s*([^;]+)/i);

            const out = [];
            if (mode !== 'paste' && sizeM) {
              const px = Math.max(12, Math.min(30, Number(sizeM[1])));
              out.push(`font-size:${px}px`);
            }
            if (ch.classList?.contains?.('rte-link') && colorM) {
              // normalize whitespace/case
              const c = String(colorM[1] || '').trim().toLowerCase().replace(/\s+/g, '');
              const allow = LINK_COLOR.toLowerCase().replace(/\s+/g, '');
              if (c === allow) out.push(`color:${LINK_COLOR}`);
            }

            if (out.length) ch.setAttribute('style', out.join(';'));
            else ch.removeAttribute('style');

            // Backward compatibility: old rich-text stored links as <span class="rte-link" data-href="...">.
            // Convert them to real <a href> so browser recognizes them as links.
            try {
              if (ch.classList?.contains?.('rte-link')) {
                const hrefRaw = String(ch.getAttribute('data-href') || '').trim();
                const href = normalizeHref(hrefRaw);
                if (href) {
                  const a = document.createElement('a');
                  a.className = 'rte-link';
                  a.setAttribute('href', href);
                  a.setAttribute('target', '_blank');
                  a.setAttribute('rel', 'noopener noreferrer');
                  a.setAttribute('style', `color:${LINK_COLOR}`);
                  while (ch.firstChild) a.appendChild(ch.firstChild);
                  ch.replaceWith(a);
                  continue;
                }
              }
            } catch {}
          }

          // Keep any pasted <a> as a real anchor (so browser recognizes it as a link).
          // Normalize href, force target="_blank" and apply our styling.
          if (tag === 'A') {
            const hrefRaw = String(ch.getAttribute('href') || '').trim();
            const href = normalizeHref(hrefRaw);
            if (!href) {
              const frag = document.createDocumentFragment();
              while (ch.firstChild) frag.appendChild(ch.firstChild);
              ch.replaceWith(frag);
            } else {
              ch.setAttribute('href', href);
              ch.classList.add('rte-link');
              ch.setAttribute('target', '_blank');
              ch.setAttribute('rel', 'noopener noreferrer');
              ch.setAttribute('style', `color:${LINK_COLOR}`);

              // Ensure underline exists (and usually bold) for visual consistency.
              const hasU = !!ch.querySelector('u');
              if (!hasU) {
                const frag = document.createDocumentFragment();
                while (ch.firstChild) frag.appendChild(ch.firstChild);
                const b = document.createElement('b');
                const u = document.createElement('u');
                u.appendChild(frag);
                b.appendChild(u);
                ch.appendChild(b);
              }
            }
          }


          walk(ch);
        }
      };

      walk(tpl.content);

      let htmlOut = tpl.innerHTML;

      // Linkify plain URLs that survived as text (basic)
      htmlOut = htmlOut.replace(/(^|[\s>])((https?:\/\/|www\.)[^\s<]+)/gi, (m, p1, url) => {
        const href = url.startsWith('http') ? url : ('https://' + url);
        return `${p1}${makeLinkAnchorHTML(href, url)}`;
      });

      return htmlOut;
    } catch {
      return '';
    }
  };

  const selector = [
    'textarea.sheet-textarea',
    'textarea.note-text',
    'textarea.weapon-desc-text',
    'textarea.combat-ability-text',
    'textarea.equip-descedit',
    'textarea.lss-prof-text',
    'textarea.spell-desc-editor'
  ].join(',');

  const openModal = (ta, inlineEditor, persistKey) => {
    if (!inlineEditor) return;
    if (!canEdit) return;
    const path = persistKey || ta?.getAttribute?.('data-sheet-path') || '';

    const overlay = document.createElement('div');
    overlay.className = 'rte-modal-overlay';
    overlay.innerHTML = `
      <div class="rte-modal" role="dialog" aria-modal="true">
        <div class="rte-modal-head">
          <div class="rte-modal-title">Редактор текста</div>
          <button type="button" class="rte-modal-close" aria-label="Закрыть">✕</button>
        </div>

        <div class="rte-modal-toolbar">
          <button type="button" class="rte-btn" data-rte-cmd="bold" title="Жирный"><b>B</b></button>
          <button type="button" class="rte-btn" data-rte-cmd="underline" title="Подчеркнуть"><u>U</u></button>
          <button type="button" class="rte-btn" data-rte-cmd="insertUnorderedList" title="Маркированный список">•</button>
          <button type="button" class="rte-btn" data-rte-cmd="insertOrderedList" title="Нумерация">1.</button>
          <button type="button" class="rte-btn" data-rte-link title="Ссылка">🔗</button>

          <label class="rte-fontsize" title="Размер текста">
            <span>Aa</span>
            <select data-rte-fontsize>
              <option value="12">12</option>
              <option value="14">14</option>
              <option value="16" selected>16</option>
              <option value="18">18</option>
              <option value="20">20</option>
              <option value="22">22</option>
              <option value="24">24</option>
              <option value="26">26</option>
              <option value="28">28</option>
              <option value="30">30</option>
            </select>
          </label>

          <div class="rte-grow"></div>
        </div>

        <div class="rte-modal-body">
          <div class="rte-editor rte-editor--modal" contenteditable="true" data-rte-modal-editor></div>
        </div>

        <div class="rte-modal-actions">
          <button type="button" class="rte-action rte-cancel">Отмена</button>
          <button type="button" class="rte-action rte-save">Сохранить</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const editor = overlay.querySelector('[data-rte-modal-editor]');
    const btnClose = overlay.querySelector('.rte-modal-close');
    const btnCancel = overlay.querySelector('.rte-cancel');
    const btnSave = overlay.querySelector('.rte-save');
    const toolbar = overlay.querySelector('.rte-modal-toolbar');
    const fontSel = overlay.querySelector('[data-rte-fontsize]');

    editor.innerHTML = inlineEditor.innerHTML || '';
    editor.focus();

    const ensureLinkLooksLikeLink = (a) => {
      try {
        // force bold + underline by wrapping contents if not already
        const hasBold = !!a.querySelector('b,strong');
        const hasU = !!a.querySelector('u');
        if (hasBold && hasU) return;
        const frag = document.createDocumentFragment();
        while (a.firstChild) frag.appendChild(a.firstChild);
        const b = document.createElement('b');
        const u = document.createElement('u');
        u.appendChild(frag);
        b.appendChild(u);
        a.appendChild(b);
      } catch {}
    };
    const applyFontSize = (px) => {
      const v = String(px || '').trim();
      if (!/^\d+$/.test(v)) return;
      const n = Math.max(12, Math.min(30, Number(v)));

      const sel = window.getSelection?.();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);

      const setCaretAfter = (node) => {
        try {
          const r = document.createRange();
          r.setStartAfter(node);
          r.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r);
        } catch {}
      };

      if (range.collapsed) {
        let node = sel.anchorNode;
        if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
        const span0 = node && node.closest ? node.closest('span') : null;
        if (span0 && /font-size\s*:\s*\d+px/i.test(String(span0.getAttribute('style') || ''))) {
          span0.style.fontSize = n + 'px';
          return;
        }
        const span = document.createElement('span');
        span.style.fontSize = n + 'px';
        span.innerHTML = '&#8203;';
        range.insertNode(span);
        setCaretAfter(span);
        return;
      }

      try {
        const wrapper = document.createElement('span');
        wrapper.style.fontSize = n + 'px';

        const frag = range.extractContents();
        wrapper.appendChild(frag);

        wrapper.querySelectorAll('span[style]').forEach(s => {
          const st = String(s.getAttribute('style') || '');
          if (/font-size\s*:\s*\d+px/i.test(st)) s.style.fontSize = n + 'px';
        });

        range.insertNode(wrapper);
        setCaretAfter(wrapper);
      } catch {}
    };

    const linkifyPlain = (plain) => {
      const t = String(plain || '');
      const esc = htmlEscape(t);
      // Linkify URLs and emails in escaped text
      const urlRe = /((https?:\/\/|www\.)[^\s<]+)|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
      return esc.replace(urlRe, (m) => {
        if (m.includes('@') && !m.startsWith('http')) {
          const href = 'mailto:' + m;
        return `<a class="rte-link" href="${href}" target="_blank" rel="noopener noreferrer" style="color:${LINK_COLOR}"><b><u>${m}</u></b></a>`;
        }
        const href = normalizeHref(m);
      return `<a class="rte-link" href="${href}" target="_blank" rel="noopener noreferrer" style="color:${LINK_COLOR}"><b><u>${m}</u></b></a>`;
      }).replace(/\n/g, '<br>');
    };

    toolbar.addEventListener('mousedown', (e) => {
      if (e.target && e.target.closest && e.target.closest('select')) return;
      e.preventDefault();
    });
    toolbar.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('button');
      if (!btn) return;
      editor.focus();

      if (btn.hasAttribute('data-rte-link')) {
        const url = prompt('Ссылка (URL):', 'https://');
        const href = normalizeHref(url);
        if (!href) return;

        try {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return;
          const range = sel.getRangeAt(0);
          if (!editor.contains(range.commonAncestorContainer)) return;

          const a = document.createElement('a');
          a.className = 'rte-link';
          a.setAttribute('href', href);
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
          a.setAttribute('style', `color:${LINK_COLOR}`);
          const b = document.createElement('b');
          const u = document.createElement('u');
          b.appendChild(u);

          if (range.collapsed) {
            u.textContent = href;
            a.appendChild(b);
            range.insertNode(a);
            setCaretAfter(a);
          } else {
            const frag = range.extractContents();
            u.appendChild(frag);
            a.appendChild(b);
            range.insertNode(a);
            setCaretAfter(a);
          }
        } catch {}

        return;
      }

      const cmd = btn.getAttribute('data-rte-cmd');
      if (!cmd) return;
      try { document.execCommand(cmd, false, null); } catch {}
    });

    fontSel?.addEventListener('change', () => {
      try { editor.focus(); } catch {}
      applyFontSize(fontSel.value);
    });

    editor.addEventListener('paste', (e) => {
      try {
        e.preventDefault();
        const cd = e.clipboardData;
        const html = cd?.getData?.('text/html');
        const text = cd?.getData?.('text/plain');
        const incoming = (html && html.trim())
          ? sanitizeHtml(html, { mode: 'paste' })
          : linkifyPlain(String(text || ''));
        document.execCommand('insertHTML', false, incoming);
      } catch {}
    });

    // Links are real <a>, so just stop bubbling to avoid any global click routers.
    const stopLinkBubble = (e) => {
      const a = e.target?.closest?.('a[href].rte-link');
      if (!a) return;
      e.stopPropagation();
      try { e.stopImmediatePropagation?.(); } catch {}
    };

    // Use capture to beat any global click routers.
    editor.addEventListener('pointerdown', stopLinkBubble, true);
    editor.addEventListener('click', stopLinkBubble, true);

    const close = () => { try { overlay.remove(); } catch {} };

    btnClose?.addEventListener('click', close);
    btnCancel?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    btnSave?.addEventListener('click', () => {
      const html = sanitizeHtml(editor.innerHTML || '');
      inlineEditor.innerHTML = html;
      try { if (ta) ta.value = html; } catch {}

      try {
        if (ta) {
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } catch {}

      close();
    });

    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  };

  const textareas = Array.from(root.querySelectorAll(selector));
  textareas.forEach((ta) => {
    if (ta.closest('[data-rte]')) return;
    const path = ta.getAttribute('data-sheet-path') || '';

    const wrap = document.createElement('div');
    wrap.className = 'rte';
    wrap.setAttribute('data-rte', '');

    const editor = document.createElement('div');
    editor.className = 'rte-editor';
    editor.setAttribute('contenteditable', 'true');
    editor.setAttribute('data-rte-editor', '');

    const ph = ta.getAttribute('placeholder');
    if (ph) editor.setAttribute('data-placeholder', ph);

    const raw = String(ta.value || '');
    editor.innerHTML = raw
      ? (raw.includes('<') ? sanitizeHtml(raw) : htmlEscape(raw).replace(/\n/g, '<br>'))
      : '';

    try {
      const rows = Number(ta.getAttribute('rows') || 0);
      if (rows) editor.style.minHeight = `${Math.max(3, rows) * 18}px`;
    } catch {}

    editor.addEventListener('paste', (e) => {
      if (!canEdit) return;
      try {
        e.preventDefault();
        const cd = e.clipboardData;
        const html = cd?.getData?.('text/html');
        const text = cd?.getData?.('text/plain');
        const incoming = (html && html.trim())
          ? sanitizeHtml(html, { mode: 'paste' })
          : linkifyPlain(String(text || ''));
        document.execCommand('insertHTML', false, incoming);
        // mirror into hidden textarea so existing save/bindings see it
        try { ta.value = sanitizeHtml(editor.innerHTML || ''); } catch {}
        try {
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.dispatchEvent(new Event('change', { bubbles: true }));
        } catch {}
      } catch {}
    });

    editor.addEventListener('dblclick', (e) => {
      e.preventDefault();
      const key = path || ta.id || ta.name || '';
      openModal(ta, editor, key || path);
    });

    const stopInlineLinkBubble = (e) => {
      const a = e.target?.closest?.('a[href].rte-link');
      if (!a) return;
      e.stopPropagation();
      try { e.stopImmediatePropagation?.(); } catch {}
    };

    editor.addEventListener('pointerdown', stopInlineLinkBubble, true);
    editor.addEventListener('click', stopInlineLinkBubble, true);

    try { ta.style.display = 'none'; } catch {}
    wrap.appendChild(editor);
    // move textarea into wrapper (hidden) so existing bindings keep working
    const parent = ta.parentNode;
    if (parent) {
      parent.replaceChild(wrap, ta);
      wrap.appendChild(ta);
    } else {
      wrap.appendChild(ta);
    }
  });
}

function bindEditableInputs(root, player, canEdit) {
    if (!root || !player?.sheet?.parsed) return;

    // "Владение" toggle for armor: enabled only when some armor is selected.
    // If armor is cleared, we force toggle off.
    const syncArmorProfToggleUi = () => {
      try {
        const cb = root.querySelector('[data-armor-prof]');
        if (!cb) return;
        const armorSel = String(getByPath(player.sheet.parsed, 'appearance.slots.armor') || '').trim();
        const hasArmor = !!armorSel;
        if (!hasArmor) {
          // force OFF when no armor is equipped
          const wasOn = !!getByPath(player.sheet.parsed, 'appearance.armorRules.addProf');
          try { cb.checked = false; } catch {}
          try { setByPath(player.sheet.parsed, 'appearance.armorRules.addProf', false); } catch {}

          // Persist and recompute AC immediately if state changed.
          if (wasOn) {
            try {
              window.__equipAc?.applyAutoAcToSheet?.(player.sheet.parsed);
              updateHeroChips(root, player.sheet.parsed);
            } catch {}
            try { scheduleSheetSave(player); } catch {}
          }
        }
        // interactive only if canEdit and armor selected
        try { cb.disabled = (!canEdit) || (!hasArmor); } catch {}
      } catch {}
    };

    // Upgrade large textareas to a lightweight rich-text editor (toolbar + contenteditable).
    // This is used for backstory/notes/descriptions etc.
    try { upgradeSheetTextareasToRte(root, canEdit); } catch {}

    const inputs = root.querySelectorAll("[data-sheet-path]");
    inputs.forEach(inp => {
      const path = inp.getAttribute("data-sheet-path");
      if (!path) return;

      // если в json есть tiptap-профи, а plain пустой — заполняем plain один раз, чтобы было что редактировать
      if (path === "text.profPlain.value") {
        const curPlain = getByPath(player.sheet.parsed, "text.profPlain.value");
        if (!curPlain) {
          const profDoc = player.sheet.parsed?.text?.prof?.value?.data;
          const lines = tiptapToPlainLines(profDoc);
          if (lines && lines.length) {
            setByPath(player.sheet.parsed, "text.profPlain.value", lines.join("\n"));
          }
        }
      }

      let raw = getByPath(player.sheet.parsed, path);

      if (path === "appearance.armorRules.max" && raw === 0) raw = "";

      // Support both classic inputs/textarea and rich-text contenteditable nodes.
      const isRte = (String(inp.getAttribute?.('contenteditable') || '') === 'true');
      if (inp.type === "checkbox") inp.checked = !!raw;
      else if (inp.type === "radio") inp.checked = (String(raw ?? '') === String(inp.value));
      else if (isRte) inp.innerHTML = String(raw ?? "");
      else inp.value = (raw ?? "");

      if (!canEdit) {
        // disable classic form controls
        try { inp.disabled = true; } catch {}
        // disable rich text editor
        if (isRte) {
          try { inp.setAttribute('contenteditable', 'false'); } catch {}
          try {
            const wrap = inp.closest?.('[data-rte]');
            wrap?.classList?.add('rte--disabled');
          } catch {}
        }
        return;
      }

      const handler = () => {
        let val;
        if (inp.type === "checkbox") val = !!inp.checked;
        else if (inp.type === "radio") {
          if (!inp.checked) return; // only commit on the checked one
          val = String(inp.value || '');
        }
        else if (inp.type === "number") {
          val = (inp.value === "" ? "" : Number(inp.value));
          if (path === "appearance.armorRules.max" && val === 0) val = "";
        }
        else if (isRte) val = inp.innerHTML;
        else val = inp.value;

        setByPath(player.sheet.parsed, path, val);

        // Armor prof toggle state depends on whether armor is selected.
        if (path === 'appearance.slots.armor') {
          syncArmorProfToggleUi();
        }

        // ===== Auto AC from equipment =====
        // If user changes equipped armor/shield or edits armor params, recompute AC immediately.
        if (
          path.startsWith('appearance.slots.') ||
          path.startsWith('appearance.armorRules') ||
          path.startsWith('appearance.shieldRules')
        ) {
          try {
            window.__equipAc?.applyAutoAcToSheet?.(player.sheet.parsed);
            updateHeroChips(root, player.sheet.parsed);
          } catch {}
        }

        // Token preview refresh (mode/crop sliders)
        if (path.startsWith('appearance.token.')) {
          try { updateTokenPreview(root, player, player.sheet.parsed); } catch {}
        }


        // Истощение (0..6) и Состояние (строка) не связаны
        if (path === "exhaustion") {
          const ex = Math.max(0, Math.min(6, safeInt(getByPath(player.sheet.parsed, "exhaustion"), 0)));
          setByPath(player.sheet.parsed, "exhaustion", ex);
        }

        if (path === "name.value") player.name = val || player.name;

        // keep hp popup synced after re-render
    try {
      if (hpPopupEl && !hpPopupEl.classList.contains('hidden')) {
        const pNow = getOpenedPlayerSafe();
        if (pNow?.sheet?.parsed) syncHpPopupInputs(pNow.sheet.parsed);
      }
    } catch {}

// live updates
if (path === "proficiency" || path === "proficiencyCustom") {
  // пересчитать навыки/пассивы + проверка/спасбросок (т.к. зависят от бонуса владения)
  updateSkillsAndPassives(root, player.sheet.parsed);
  try {
    ["str","dex","con","int","wis","cha"].forEach(k => updateDerivedForStat(root, player.sheet.parsed, k));
  } catch {}

  // обновить подсказку у кружков спасбросков
  root.querySelectorAll('.lss-save-dot[data-save-key]').forEach(d => {
    const statKey = d.getAttribute('data-save-key');
    if (statKey) d.title = `Владение спасброском: +${getProfBonus(player.sheet.parsed)} к спасброску`;
  });

  updateWeaponsBonuses(root, player.sheet.parsed);
}

// ================== RICH TEXT (lightweight) ==================
// Converts selected textareas into a simple rich-text editor using contenteditable + execCommand.
// Stored value is HTML string in the same data-sheet-path.
        if (path === "vitality.ac.value" || path === "vitality.hp-max.value" || path === "vitality.hp-current.value" || path === "vitality.speed.value") {
          updateHeroChips(root, player.sheet.parsed);
        }

        // Если мы сейчас на вкладке "Заклинания" — пересчитываем метрики при изменении владения
        if (player?._activeSheetTab === "spells" && (path === "proficiency" || path === "proficiencyCustom")) {
          const s = player.sheet?.parsed;
          if (s) rerenderSpellsTabInPlace(root, player, s, canEdit);
        }

        // Монеты: обновляем пересчёт итога без полного ререндера
        if (path.startsWith("coins.") || path.startsWith("coinsView.")) {
          updateCoinsTotal(root, player.sheet.parsed);
        }

        scheduleSheetSave(player);
      };

      inp.addEventListener("input", handler);
      inp.addEventListener("change", handler);
    });

    // Initial sync: checkbox "Владение" must be disabled until a worn armor is selected.
    // Also clears stale addProf if armor is not equipped.
    try { syncArmorProfToggleUi(); } catch {}

    // ===== Persist manual textarea resize (height) =====
    // Пользователь просил: если растянул textarea по высоте — высота должна сохраняться
    // при переключении вкладок и повторном открытии «Листа персонажа».
    try {
      bindTextareaHeightPersistence(root, player);
    } catch (e) {
      console.warn('bindTextareaHeightPersistence failed', e);
    }
  }

// ===================== Textarea height persistence =====================
const TA_HEIGHT_LS_KEY = 'dnd_sheet_ta_heights_v1';

function loadTextareaHeights() {
  try {
    const raw = localStorage.getItem(TA_HEIGHT_LS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return (obj && typeof obj === 'object') ? obj : {};
  } catch {
    return {};
  }
}

function saveTextareaHeights(obj) {
  try {
    localStorage.setItem(TA_HEIGHT_LS_KEY, JSON.stringify(obj || {}));
  } catch {}
}

function textareaPersistKey(player, ta, fallbackIndex) {
  const pid = String(player?.id || player?.name || 'unknown');
  const prefix = `p:${pid}|`;

  const sp = ta?.getAttribute?.('data-sheet-path');
  if (sp) return prefix + `path:${sp}`;

  // оружие
  const wf = ta?.getAttribute?.('data-weapon-field');
  if (wf) {
    const card = ta.closest?.('.weapon-card[data-weapon-idx]');
    const idx = card?.getAttribute?.('data-weapon-idx') ?? '';
    return prefix + `weapon:${idx}:${wf}`;
  }

  // умения/способности (карточки)
  if (ta?.hasAttribute?.('data-combat-ability-text')) {
    const item = ta.closest?.('.combat-ability-item[data-combat-ability-idx]');
    const idx = item?.getAttribute?.('data-combat-ability-idx') ?? '';
    return prefix + `combatAbility:${idx}:text`;
  }

  // описание заклинания (редактор)
  if (ta?.hasAttribute?.('data-spell-desc-editor')) {
    const item = ta.closest?.('.spell-item[data-spell-url]');
    const href = item?.getAttribute?.('data-spell-url') || '';
    return prefix + `spellDesc:${href}`;
  }

  // id/name
  if (ta?.id) return prefix + `id:${ta.id}`;
  if (ta?.name) return prefix + `name:${ta.name}`;

  // fallback: позиция в DOM (достаточно стабильна в рамках текущей верстки)
  return prefix + `idx:${fallbackIndex}`;
}

function bindTextareaHeightPersistence(root, player) {
  if (!root || !player) return;

  const store = loadTextareaHeights();

  // Если вкладка перерисована (innerHTML заменён) — старые textarea исчезли.
  // Поэтому пересоздаем observer каждый раз.
  try {
    if (root.__taResizeObserver && typeof root.__taResizeObserver.disconnect === 'function') {
      root.__taResizeObserver.disconnect();
    }
  } catch {}
  root.__taResizeObserver = null;

  // применяем сохраненные высоты
  const allTextareas = Array.from(root.querySelectorAll('textarea'));
  allTextareas.forEach((ta, i) => {
    try {
      const cs = window.getComputedStyle ? getComputedStyle(ta) : null;
      if (cs && cs.resize === 'none') return; // сохраняем только те, которые можно тянуть

      const key = textareaPersistKey(player, ta, i);
      const h = store[key];
      if (Number.isFinite(h) && h >= 40) {
        ta.style.height = `${Math.round(h)}px`;
      }
    } catch {}
  });

  let saveTimer = null;
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveTextareaHeights(store), 120);
  };

  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const ta = entry?.target;
        if (!ta || ta.tagName !== 'TEXTAREA') continue;

        // записываем реальную высоту textarea
        const i = allTextareas.indexOf(ta);
        const key = textareaPersistKey(player, ta, i >= 0 ? i : 0);
        const h = Math.round(ta.getBoundingClientRect().height);
        if (h >= 40) {
          store[key] = h;
          scheduleSave();
        }
      }
    });

    // наблюдаем только за теми, которые реально можно тянуть
    allTextareas.forEach((ta) => {
      try {
        const cs = window.getComputedStyle ? getComputedStyle(ta) : null;
        if (cs && cs.resize === 'none') return;
        ro.observe(ta);
      } catch {}
    });

    root.__taResizeObserver = ro;
  } else {
    // Fallback (без ResizeObserver): сохраняем высоту по mouseup/touchend
    const handler = (e) => {
      const ta = e.target?.closest?.('textarea');
      if (!ta) return;
      try {
        const cs = window.getComputedStyle ? getComputedStyle(ta) : null;
        if (cs && cs.resize === 'none') return;
        const i = allTextareas.indexOf(ta);
        const key = textareaPersistKey(player, ta, i >= 0 ? i : 0);
        const h = Math.round(ta.getBoundingClientRect().height);
        if (h >= 40) {
          store[key] = h;
          scheduleSave();
        }
      } catch {}
    };
    root.addEventListener('mouseup', handler);
    root.addEventListener('touchend', handler, { passive: true });
    root.__taResizeObserver = { disconnect: () => {
      try { root.removeEventListener('mouseup', handler); } catch {}
      try { root.removeEventListener('touchend', handler); } catch {}
    }};
  }
}
  // ===== clickable dots binding (skills boost) =====
  function bindSkillBoostDots(root, player, canEdit) {
    if (!root || !player?.sheet?.parsed) return;

    const sheet = player.sheet.parsed;
    const dots = root.querySelectorAll(".lss-dot[data-skill-key]");
    dots.forEach(dot => {
      const skillKey = dot.getAttribute("data-skill-key");
      if (!skillKey) return;

      dot.classList.add("clickable");
      if (!canEdit) return;

      dot.addEventListener("click", (e) => {
        e.stopPropagation();

        const cur = getSkillBoostLevel(sheet, skillKey);
        const next = (cur === 0) ? 1 : (cur === 1) ? 2 : 0;

        setSkillBoostLevel(sheet, skillKey, next);

        dot.classList.remove("boost1", "boost2");
        if (next === 1) dot.classList.add("boost1");
        if (next === 2) dot.classList.add("boost2");

        const row = dot.closest(".lss-skill-row");
        if (row) {
          const valEl = row.querySelector(".lss-skill-val");
          if (valEl) {
            const v = formatMod(calcSkillBonus(sheet, skillKey));
            if (valEl.tagName === "INPUT" || valEl.tagName === "TEXTAREA") valEl.value = v;
            else valEl.textContent = v;
          }

          const nameEl = row.querySelector(".lss-skill-name");
          if (nameEl) {
            let boostSpan = nameEl.querySelector(".lss-boost");
            const stars = boostLevelToStars(next);

            if (!boostSpan) {
              boostSpan = document.createElement("span");
              boostSpan.className = "lss-boost";
              nameEl.appendChild(boostSpan);
            }
            boostSpan.textContent = stars ? ` ${stars}` : "";
          }
        }

        scheduleSheetSave(player);
      });
    });

    // initial state
    // NOTE: armor proficiency toggle UI is owned by bindEditableInputs().
    // Do not reference it here (different scope), otherwise the sheet modal
    // can fail to open with "syncArmorProfToggleUi is not defined".
  }

  // ===== clickable dot binding (saving throws proficiency) =====
  function bindSaveProfDots(root, player, canEdit) {
    if (!root || !player?.sheet?.parsed) return;

    const sheet = player.sheet.parsed;
    const dots = root.querySelectorAll('.lss-save-dot[data-save-key]');
    dots.forEach(dot => {
      const statKey = dot.getAttribute('data-save-key');
      if (!statKey) return;

      dot.classList.add('clickable');
      dot.classList.toggle('active', !!sheet?.saves?.[statKey]?.isProf);
      dot.title = `Владение спасброском: +${getProfBonus(sheet)} к спасброску`;

      if (!canEdit) return;

      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!canEdit) return;

        if (!sheet.saves || typeof sheet.saves !== 'object') sheet.saves = {};
        if (!sheet.saves[statKey] || typeof sheet.saves[statKey] !== 'object') {
          sheet.saves[statKey] = { name: statKey, isProf: false, bonus: 0 };
        }

        sheet.saves[statKey].isProf = !sheet.saves[statKey].isProf;
        dot.classList.toggle('active', !!sheet.saves[statKey].isProf);
        dot.title = `Владение спасброском: +${getProfBonus(sheet)} к спасброску`;

        // обновить значение спасброска в UI
        const ability = dot.closest('.lss-ability');
        const saveInp = ability?.querySelector(`.lss-pill-val[data-kind="save"][data-stat-key="${CSS.escape(statKey)}"]`);
        if (saveInp) {
          const v = formatMod(calcSaveBonus(sheet, statKey));
          if (saveInp.tagName === 'INPUT' || saveInp.tagName === 'TEXTAREA') saveInp.value = v;
          else saveInp.textContent = v;
        }

        scheduleSheetSave(player);
      });
    });
  }

  // ===== dice buttons (checks/saves/skills) =====
  function bindStatRollButtons(root, player) {
    if (!root || !player?.sheet?.parsed) return;
    const sheet = player.sheet.parsed;

    const btns = root.querySelectorAll('.lss-dice-btn[data-roll-kind]');
    btns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const kind = btn.getAttribute('data-roll-kind');
        let bonus = 0;
        let kindText = 'Бросок d20';

        if (kind === 'skill') {
          const skillKey = btn.getAttribute('data-skill-key');
          if (!skillKey) return;
          bonus = calcSkillBonus(sheet, skillKey);
          const label = sheet?.skills?.[skillKey]?.label || skillKey;
          kindText = `${label}: d20${bonus ? formatMod(bonus) : ''}`;
        }

        if (kind === 'check') {
          const statKey = btn.getAttribute('data-stat-key');
          if (!statKey) return;
          bonus = calcCheckBonus(sheet, statKey);
          const label = sheet?.stats?.[statKey]?.label || statKey;
          kindText = `${label}: Проверка d20${bonus ? formatMod(bonus) : ''}`;
        }

        if (kind === 'save') {
          const statKey = btn.getAttribute('data-stat-key');
          if (!statKey) return;
          bonus = calcSaveBonus(sheet, statKey);
          const label = sheet?.stats?.[statKey]?.label || statKey;
          kindText = `${label}: Спасбросок d20${bonus ? formatMod(bonus) : ''}`;
        }

        // бросок в общую панель кубиков (и в лог/"Броски других")
        if (window.DicePanel?.roll) {
          await window.DicePanel.roll({ sides: 20, count: 1, bonus, kindText });
        }
      });
    });
  }

  // ===== editable abilities / checks / saves / skill values =====
  function bindAbilityAndSkillEditors(root, player, canEdit) {
    if (!root || !player?.sheet?.parsed) return;
    const sheet = player.sheet.parsed;

    // ---- ability score edits (score -> modifier -> recompute) ----
    const scoreInputs = root.querySelectorAll('.lss-ability-score-input[data-stat-key]');
    scoreInputs.forEach(inp => {
      const statKey = inp.getAttribute('data-stat-key');
      if (!statKey) return;

      if (!canEdit) { inp.disabled = true; return; }

      const handler = () => {
        const score = safeInt(inp.value, 10);
        if (!sheet.stats) sheet.stats = {};
        if (!sheet.stats[statKey]) sheet.stats[statKey] = {};
        sheet.stats[statKey].score = score;
        sheet.stats[statKey].modifier = scoreToModifier(score);

        // обновляем связанные значения на экране
        updateDerivedForStat(root, sheet, statKey);
        updateSkillsAndPassives(root, sheet);
         updateWeaponsBonuses(root, sheet);

        // Auto AC from equipped armor/shield (if any)
        try {
          window.__equipAc?.applyAutoAcToSheet?.(sheet);
          updateHeroChips(root, sheet);
        } catch {}

        scheduleSheetSave(player);
      };

      inp.addEventListener('input', handler);
      inp.addEventListener('change', handler);
    });

    // ---- check/save edits (меняем bonus-часть, чтобы итог стал нужным) ----
    const pillInputs = root.querySelectorAll('.lss-pill-val-input[data-stat-key][data-kind]');
    pillInputs.forEach(inp => {
      const statKey = inp.getAttribute('data-stat-key');
      const kind = inp.getAttribute('data-kind');
      if (!statKey || !kind) return;

      if (!canEdit) { inp.disabled = true; return; }

      const handler = () => {
        const desired = parseModInput(inp.value, 0);
        const prof = getProfBonus(sheet);
        const statMod = safeInt(sheet?.stats?.[statKey]?.modifier, 0);

        if (kind === "save") {
          if (!sheet.saves) sheet.saves = {};
          if (!sheet.saves[statKey]) sheet.saves[statKey] = {};
          const isProf = !!sheet.saves[statKey].isProf;
          const base = statMod + (isProf ? prof : 0);
          sheet.saves[statKey].bonus = desired - base;
        }

        if (kind === "check") {
          if (!sheet.stats) sheet.stats = {};
          if (!sheet.stats[statKey]) sheet.stats[statKey] = {};
          const check = safeInt(sheet.stats[statKey].check, 0); // 0/1/2
          let base = statMod;
          if (check === 1) base += prof;
          if (check === 2) base += prof * 2;
          sheet.stats[statKey].checkBonus = desired - base;
        }

        // сразу обновим вывод (на случай странного ввода)
        updateDerivedForStat(root, sheet, statKey);
        updateSkillsAndPassives(root, sheet);

        scheduleSheetSave(player);
      };

      inp.addEventListener('input', handler);
      inp.addEventListener('change', handler);
    });

    // ---- skill bonus edits (меняем skill.bonus так, чтобы итог стал нужным) ----
    const skillInputs = root.querySelectorAll('.lss-skill-val-input[data-skill-key]');
    skillInputs.forEach(inp => {
      const skillKey = inp.getAttribute('data-skill-key');
      if (!skillKey) return;

      if (!canEdit) { inp.disabled = true; return; }

      const handler = () => {
        const desired = parseModInput(inp.value, 0);
        if (!sheet.skills) sheet.skills = {};
        if (!sheet.skills[skillKey]) sheet.skills[skillKey] = {};

        const baseStat = sheet.skills[skillKey].baseStat;
        const statMod = safeInt(sheet?.stats?.[baseStat]?.modifier, 0);
        const prof = getProfBonus(sheet);
        const boostLevel = getSkillBoostLevel(sheet, skillKey);
        const boostAdd = boostLevelToAdd(boostLevel, prof);

        // extra бонус внутри навыка
        sheet.skills[skillKey].bonus = desired - statMod - boostAdd;

        // обновляем навык и пассивки
        updateSkillsAndPassives(root, sheet);

        scheduleSheetSave(player);
      };

      inp.addEventListener('input', handler);
      inp.addEventListener('change', handler);
    });
  }

  // ===== Notes tab: add / rename / toggle / delete, text editing =====
  function bindNotesEditors(root, player, canEdit) {
    if (!root || !player?.sheet?.parsed) return;

    const sheet = player.sheet.parsed;
    if (!sheet.notes || typeof sheet.notes !== "object") sheet.notes = {};
    if (!sheet.notes.details || typeof sheet.notes.details !== "object") sheet.notes.details = {};
    if (!Array.isArray(sheet.notes.entries)) sheet.notes.entries = [];

    const main = root.querySelector("#sheet-main");
    if (!main) return;

    // add note button
    const addBtn = main.querySelector("[data-note-add]");
    if (addBtn) {
      if (!canEdit) addBtn.disabled = true;
      addBtn.addEventListener("click", () => {
        if (!canEdit) return;

        // choose next Заметка-N
        const titles = sheet.notes.entries.map(e => String(e?.title || "")).filter(Boolean);
        let maxN = 0;
        for (const t of titles) {
          const mm = /^Заметка-(\d+)$/i.exec(t.trim());
          if (mm) maxN = Math.max(maxN, parseInt(mm[1], 10) || 0);
        }
        const nextN = maxN + 1;

        sheet.notes.entries.push({ title: `Заметка-${nextN}`, text: "", collapsed: false });
        scheduleSheetSave(player);

        // rerender current tab to show new note
        const freshVm = toViewModel(sheet, player.name);
        main.innerHTML = renderNotesTab(freshVm);
        bindEditableInputs(root, player, canEdit);
        bindSkillBoostDots(root, player, canEdit);
        bindAbilityAndSkillEditors(root, player, canEdit);
        bindNotesEditors(root, player, canEdit);
      });
    }

    // title edit
    const titleInputs = main.querySelectorAll("input[data-note-title]");
    titleInputs.forEach(inp => {
      const idx = parseInt(inp.getAttribute("data-note-title") || "", 10);
      if (!Number.isFinite(idx)) return;
      if (!canEdit) { inp.disabled = true; return; }

      inp.addEventListener("input", () => {
        if (!sheet.notes.entries[idx]) return;
        sheet.notes.entries[idx].title = inp.value;
        scheduleSheetSave(player);
      });
    });

    // text edit
    const textAreas = main.querySelectorAll("textarea[data-note-text]");
    textAreas.forEach(ta => {
      const idx = parseInt(ta.getAttribute("data-note-text") || "", 10);
      if (!Number.isFinite(idx)) return;
      if (!canEdit) { ta.disabled = true; return; }

      ta.addEventListener("input", () => {
        if (!sheet.notes.entries[idx]) return;
        sheet.notes.entries[idx].text = ta.value;
        scheduleSheetSave(player);
      });
    });

    // toggle collapse
    const toggleBtns = main.querySelectorAll("[data-note-toggle]");
    toggleBtns.forEach(btn => {
      const idx = parseInt(btn.getAttribute("data-note-toggle") || "", 10);
      if (!Number.isFinite(idx)) return;
      if (!canEdit) btn.disabled = true;

      btn.addEventListener("click", () => {
        if (!sheet.notes.entries[idx]) return;
        sheet.notes.entries[idx].collapsed = !sheet.notes.entries[idx].collapsed;
        scheduleSheetSave(player);

        const freshVm = toViewModel(sheet, player.name);
        main.innerHTML = renderNotesTab(freshVm);
        bindEditableInputs(root, player, canEdit);
        bindSkillBoostDots(root, player, canEdit);
        bindAbilityAndSkillEditors(root, player, canEdit);
        bindNotesEditors(root, player, canEdit);
      });
    });

    // delete
    const delBtns = main.querySelectorAll("[data-note-del]");
    delBtns.forEach(btn => {
      const idx = parseInt(btn.getAttribute("data-note-del") || "", 10);
      if (!Number.isFinite(idx)) return;
      if (!canEdit) btn.disabled = true;

      btn.addEventListener("click", () => {
        if (!canEdit) return;
        if (!sheet.notes.entries[idx]) return;
        sheet.notes.entries.splice(idx, 1);
        scheduleSheetSave(player);

        const freshVm = toViewModel(sheet, player.name);
        main.innerHTML = renderNotesTab(freshVm);
        bindEditableInputs(root, player, canEdit);
        bindSkillBoostDots(root, player, canEdit);
        bindAbilityAndSkillEditors(root, player, canEdit);
        bindNotesEditors(root, player, canEdit);
      });
    });
  }

  // ===== Inventory (coins) editors =====
  function bindInventoryEditors(root, player, canEdit) {
    if (!root) return;
    // как и в bindSlotEditors: root (sheetContent) переиспользуется.
    // Храним актуальные ссылки, чтобы монеты не писались в sheet старого игрока.
    root.__invCoinsState = { player, canEdit };
    const getState = () => root.__invCoinsState || { player, canEdit };

    if (root.__invCoinsBound) return;
    root.__invCoinsBound = true;

    root.addEventListener("click", (e) => {
      const btn = e.target?.closest?.("[data-coin-op][data-coin-key]");
      if (!btn) return;

      const { player: curPlayer, canEdit: curCanEdit } = getState();
      if (!curCanEdit) return;

      const sheet = curPlayer?.sheet?.parsed;
      if (!sheet || typeof sheet !== "object") return;

      const op = btn.getAttribute("data-coin-op");
      const key = btn.getAttribute("data-coin-key");
      if (!key) return;

      const box = btn.closest(`[data-coin-box="${key}"]`) || root;
      const deltaInp = box.querySelector(`[data-coin-delta="${key}"]`);
      const coinInp = root.querySelector(`input[data-sheet-path="coins.${key}.value"]`);
      if (!coinInp) return;

      const delta = Math.max(0, safeInt(deltaInp?.value, 1));
      const cur = Math.max(0, safeInt(coinInp.value, 0));
      const next = (op === "plus") ? (cur + delta) : Math.max(0, cur - delta);

      setByPath(sheet, `coins.${key}.value`, next);
      coinInp.value = String(next);

      updateCoinsTotal(root, sheet);
      scheduleSheetSave(curPlayer);
    });
  }

  // ===== Equipment DB / Shop / Inventory (structured) =====
  function bindEquipmentUi(root, player, canEdit) {
    if (!root) return;
    root.__equipState = { player, canEdit };
    const getState = () => root.__equipState || { player, canEdit };

    if (root.__equipBound) return;
    root.__equipBound = true;

    async function ensureEquipDb() {
      if (window.__srdEquipDb && window.__srdEquipDb.tabs) return window.__srdEquipDb;
      const res = await fetch('equipment_srd5_ru.json', { cache: 'no-store' }).catch(() => null);
      if (!res || !res.ok) throw new Error('Не удалось загрузить equipment_srd5_ru.json');
      const json = await res.json();
      window.__srdEquipDb = json;
      return json;
    }

    function coinToCp(coin) {
      const c = String(coin || '').toLowerCase();
      if (c === 'cp') return 1;
      if (c === 'sp') return 10;
      if (c === 'ep') return 50;
      if (c === 'gp') return 100;
      if (c === 'pp') return 1000;
      return 0;
    }

    function costToCp(cost) {
      if (!cost || typeof cost !== 'object') return 0;
      const a = Number(cost.amount ?? cost.value ?? 0);
      if (!Number.isFinite(a)) return 0;
      return Math.round(a * coinToCp(cost.coin));
    }

    function coinsTotalCpLocal(sheet) {
      return (safeInt(sheet?.coins?.cp?.value, 0) * 1)
        + (safeInt(sheet?.coins?.sp?.value, 0) * 10)
        + (safeInt(sheet?.coins?.ep?.value, 0) * 50)
        + (safeInt(sheet?.coins?.gp?.value, 0) * 100)
        + (safeInt(sheet?.coins?.pp?.value, 0) * 1000);
    }

    function addToInventory(sheet, tabId, item, qty) {
      if (!sheet) return;
      if (!sheet.inventory || typeof sheet.inventory !== 'object') sheet.inventory = { activeTab: tabId };
      if (!Array.isArray(sheet.inventory[tabId])) sheet.inventory[tabId] = [];
      const q = Math.max(1, safeInt(qty, 1));
      // если такой id уже есть — увеличим qty
      const id = item?.id ? String(item.id) : '';
      const arr = sheet.inventory[tabId];
      const found = id ? arr.find(x => x && typeof x === 'object' && String(x.id || '') === id) : null;
      if (found) {
        found.qty = Math.max(1, safeInt(found.qty, 1)) + q;
        if (tabId === 'weapons') {
          try { syncWeaponInvToCombat(sheet, found); } catch {}
        }
        return;
      }
      const payload = JSON.parse(JSON.stringify(item || {}));
      payload.qty = q;
      payload._tab = tabId;
      arr.push(payload);

      // Если добавили оружие — синхронизируем его в "Бой"
      if (tabId === 'weapons') {
        try { syncWeaponInvToCombat(sheet, payload); } catch {}
      }
    }

    // ===== СИНХРОНИЗАЦИЯ ОРУЖИЯ (Инвентарь <-> Бой) =====
    function parseDamageParts(dmg) {
      const t = String(dmg || '').trim();
      // поддерживаем: "1d6", "1к6", "2 d 8" и т.п.
      const m = t.match(/(\d+)\s*[dк]\s*(\d+)/i);
      if (!m) return { n: 1, dice: 'к6' };
      const n = Math.max(1, safeInt(m[1], 1));
      const sides = Math.max(2, safeInt(m[2], 6));
      return { n, dice: `к${sides}` };
    }

    function invWeaponToCombatWeapon(invItem) {
      const name = String(invItem?.name_ru || invItem?.name || invItem?.name_en || 'Оружие').trim() || 'Оружие';
      const dmg = invItem?.weapon?.damage;
      const parts = parseDamageParts(dmg);
      const dmgType = String(invItem?.weapon?.damage_type || '').trim();
      const props = String(invItem?.weapon?.properties_ru || '').trim();
      const descBase = String(invItem?.description_ru || invItem?.desc_ru || invItem?.desc || '').trim();
      const desc = [props ? `Свойства: ${props}` : '', descBase].filter(Boolean).join('\n');
      return {
        name,
        ability: 'str',
        prof: false,
        extraAtk: 0,
        dmgNum: parts.n,
        dmgDice: parts.dice,
        dmgType,
        desc,
        collapsed: false,
        invId: String(invItem?.id || '')
      };
    }

    function syncWeaponInvToCombat(sheet, invItem) {
      if (!sheet) return;
      if (!Array.isArray(sheet.weaponsList)) sheet.weaponsList = [];
      const invId = String(invItem?.id || '').trim();
      if (!invId) return;
      const exists = sheet.weaponsList.find(w => w && typeof w === 'object' && String(w.invId || '') === invId);
      if (exists) {
        // если название/урон изменились в инвентаре — обновим минимум
        const mapped = invWeaponToCombatWeapon(invItem);
        exists.name = mapped.name;
        exists.dmgNum = mapped.dmgNum;
        exists.dmgDice = mapped.dmgDice;
        exists.dmgType = mapped.dmgType;
        // описание дополняем только если пустое (чтобы не затирать ручные правки в бою)
        if (!String(exists.desc || '').trim()) exists.desc = mapped.desc;
        return;
      }
      sheet.weaponsList.push(invWeaponToCombatWeapon(invItem));
    }

    function combatWeaponToInvItem(w) {
      const id = String(w?.invId || '').trim() || `combat_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const dmgSides = String(w?.dmgDice || 'к6').replace(/\s+/g, '').toLowerCase();
      const dmg = `${Math.max(1, safeInt(w?.dmgNum, 1))}${dmgSides}`;
      return {
        id,
        type: 'weapon',
        name_ru: String(w?.name || 'Оружие'),
        qty: 1,
        cost: { amount: 0, coin: 'gp', coin_ru: 'зм' },
        weight: { lb: 0, text: '' },
        weapon: {
          damage: dmg,
          damage_type: String(w?.dmgType || '').trim(),
          properties_ru: ''
        },
        description_ru: String(w?.desc || '').trim(),
        _tab: 'weapons',
        _fromCombat: true
      };
    }

    function syncWeaponCombatToInv(sheet, combatWeapon) {
      if (!sheet) return;
      if (!sheet.inventory || typeof sheet.inventory !== 'object') sheet.inventory = { activeTab: 'weapons' };
      if (!Array.isArray(sheet.inventory.weapons)) sheet.inventory.weapons = [];
      if (!Array.isArray(sheet.weaponsList)) sheet.weaponsList = [];

      if (!combatWeapon.invId) {
        // создадим invId и предмет в инвентаре
        const inv = combatWeaponToInvItem(combatWeapon);
        combatWeapon.invId = inv.id;
        sheet.inventory.weapons.push(inv);
        return;
      }

      const invId = String(combatWeapon.invId);
      const idx = sheet.inventory.weapons.findIndex(x => x && typeof x === 'object' && String(x.id || '') === invId);
      const invPayload = combatWeaponToInvItem(combatWeapon);
      invPayload.id = invId;
      if (idx >= 0) {
        // обновим ключевое, но не трогаем цену/вес (если кто-то их выставил)
        const cur = sheet.inventory.weapons[idx];
        cur.name_ru = invPayload.name_ru;
        cur.type = 'weapon';
        cur.weapon = invPayload.weapon;
        cur.description_ru = invPayload.description_ru;
        cur._tab = 'weapons';
      } else {
        sheet.inventory.weapons.push(invPayload);
      }
    }

    // экспортируем хелперы наружу (для вкладки "Бой")
    if (!window.__equipSync) window.__equipSync = {};
    window.__equipSync.syncWeaponCombatToInv = syncWeaponCombatToInv;
    window.__equipSync.syncWeaponInvToCombat = syncWeaponInvToCombat;

    function spendCoins(sheet, costCp) {
      const total = coinsTotalCpLocal(sheet);
      if (total < costCp) return false;
      const left = total - costCp;
      // setCoinsFromTotalCp defined in sheet-modal-data.js
      if (typeof setCoinsFromTotalCp === 'function') {
        setCoinsFromTotalCp(sheet, left);
      } else {
        // fallback: store all in gp
        if (!sheet.coins) sheet.coins = { cp: { value: 0 }, sp: { value: 0 }, ep: { value: 0 }, gp: { value: 0 }, pp: { value: 0 } };
        sheet.coins.cp.value = 0; sheet.coins.sp.value = 0; sheet.coins.ep.value = 0; sheet.coins.pp.value = 0;
        sheet.coins.gp.value = Math.floor(left / 100);
        sheet.coins.cp.value = left % 100;
      }
      return true;
    }

    function addCoins(sheet, addCp) {
      const total = coinsTotalCpLocal(sheet);
      const next = Math.max(0, total + Math.max(0, safeInt(addCp, 0)));
      if (typeof setCoinsFromTotalCp === 'function') setCoinsFromTotalCp(sheet, next);
      else {
        // minimal fallback
        if (!sheet.coins) sheet.coins = { cp: { value: 0 }, sp: { value: 0 }, ep: { value: 0 }, gp: { value: 0 }, pp: { value: 0 } };
        sheet.coins.gp.value = Math.floor(next / 100);
        sheet.coins.cp.value = next % 100;
        sheet.coins.sp.value = 0; sheet.coins.ep.value = 0; sheet.coins.pp.value = 0;
      }
    }

    function rerenderActiveTab(curPlayer) {
      // перерисуем только main текущей вкладки, как это делает обработчик табов
      const main = root.querySelector('#sheet-main');
      const sheet = curPlayer?.sheet?.parsed || createEmptySheet(curPlayer?.name);
      // Keep AC in sync with equipped armor/shield before building VM
      try { window.__equipAc?.applyAutoAcToSheet?.(sheet); } catch {}
      const vm = toViewModel(sheet, curPlayer?.name);
      const tabId = curPlayer?._activeSheetTab || (getUiState(curPlayer.id)?.activeTab) || 'basic';
      const { canEdit: curCanEdit } = getState();
      if (main) {
        main.innerHTML = renderActiveTab(tabId, vm, curCanEdit);
        bindEditableInputs(root, curPlayer, curCanEdit);
        bindSkillBoostDots(root, curPlayer, curCanEdit);
        bindSaveProfDots(root, curPlayer, curCanEdit);
        bindStatRollButtons(root, curPlayer);
        bindAbilityAndSkillEditors(root, curPlayer, curCanEdit);
        bindNotesEditors(root, curPlayer, curCanEdit);
        bindSlotEditors(root, curPlayer, curCanEdit);
        bindSpellAddAndDesc(root, curPlayer, curCanEdit);
        bindCombatEditors(root, curPlayer, curCanEdit);
        bindInventoryEditors(root, curPlayer, curCanEdit);
        bindEquipmentUi(root, curPlayer, curCanEdit);
        bindLanguagesUi(root, curPlayer, curCanEdit);
        updateCoinsTotal(root, curPlayer.sheet?.parsed);
      }
    }

    function openEquipOverlay(mode) {
      try { document.querySelectorAll('.equip-overlay').forEach(x => x.remove()); } catch {}
      const { player: curPlayer, canEdit: curCanEdit } = getState();
      if (!curCanEdit) return;
      const sheet = curPlayer?.sheet?.parsed;
      if (!sheet) return;

      // По умолчанию открываем "Всё" (удобнее искать), но сохраняем выбор пользователя в sheet.shop/ sheet.inventory
      const tabId = 'all';

      const wrap = document.createElement('div');
      wrap.className = 'equip-overlay';
      wrap.innerHTML = `
        <div class="equip-overlay__backdrop" data-equip-close></div>
        <div class="equip-overlay__panel" role="dialog" aria-modal="true">
          <div class="equip-overlay__head">
            <div class="equip-overlay__title">${mode === 'buy' ? 'Магазин' : 'База предметов'}</div>
            <button class="equip-overlay__x" type="button" data-equip-close>✕</button>
          </div>
          <div class="equip-overlay__controls">
            <select class="equip-ctl" data-equip-tab></select>
            <input class="equip-ctl" type="text" placeholder="Поиск..." data-equip-q>
            <div class="equip-qtywrap" title="Количество">
              <span class="equip-qtywrap__lbl">Количество</span>
              <input class="equip-ctl equip-qty" type="number" min="1" max="999" value="1" data-equip-qty>
            </div>
          </div>
          <div class="equip-overlay__list" data-equip-list>Загрузка базы...</div>
        </div>
      `;
      document.body.appendChild(wrap);

      const close = () => {
        wrap.remove();
      };

      wrap.addEventListener('click', (e) => {
        if (e.target?.closest?.('[data-equip-close]')) close();
      });

      const tabSel = wrap.querySelector('[data-equip-tab]');
      const qInp = wrap.querySelector('[data-equip-q]');
      const qtyInp = wrap.querySelector('[data-equip-qty]');
      const listEl = wrap.querySelector('[data-equip-list]');

      const TAB_DEFS = [
        { id: 'all', label: 'Всё' },
        { id: 'weapons', label: 'Оружие' },
        { id: 'armor', label: 'Доспехи' },
        { id: 'adventuring_gear', label: 'Снаряжение' },
        { id: 'tools', label: 'Инструменты' },
        { id: 'mounts_animals', label: 'Животные' },
        { id: 'tack_vehicles', label: 'Упряжь/Повозки' },
        { id: 'water_vehicles', label: 'Водный транспорт' },
        { id: 'trade_goods', label: 'Товары' },
        { id: 'lifestyle_expenses', label: 'Образ жизни' }
      ];

      tabSel.innerHTML = TAB_DEFS.map(t => `<option value="${escapeHtml(t.id)}" ${t.id === tabId ? 'selected' : ''}>${escapeHtml(t.label)}</option>`).join('');

      let db = null;
      const renderList = () => {
        if (!db || !db.tabs) return;
        const curTab = String(tabSel.value || 'all');
        const q = String(qInp.value || '').trim().toLowerCase();
        const items = (() => {
          if (curTab === 'all') {
            const out = [];
            TAB_DEFS.forEach(t => {
              if (t.id === 'all') return;
              const arr = Array.isArray(db.tabs?.[t.id]) ? db.tabs[t.id] : [];
              // помечаем исходную вкладку, чтобы добавление попадало "куда покупал"
              arr.forEach(it => out.push({ ...it, _tab: t.id }));
            });
            return out;
          }
          return Array.isArray(db.tabs[curTab]) ? db.tabs[curTab] : [];
        })();
        const filtered = q ? items.filter(it => {
          const n = String(it?.name_ru || it?.name_en || '').toLowerCase();
          const d = String(it?.description_ru || '').toLowerCase();
          const dd = String(it?.details_ru || it?.long_description_ru || it?.long_desc_ru || '').toLowerCase();
          return n.includes(q) || d.includes(q) || dd.includes(q);
        }) : items;

        if (!filtered.length) {
          listEl.innerHTML = `<div class="sheet-note">Ничего не найдено</div>`;
          return;
        }

        listEl.innerHTML = filtered.map(it => {
          const name = escapeHtml(it.name_ru || it.name_en || '(без названия)');
          const cost = (it.cost && typeof it.cost === 'object') ? `${escapeHtml(String(it.cost.amount ?? ''))} ${escapeHtml(String(it.cost.coin_ru || it.cost.coin || ''))}` : '—';
          const w = (it.weight && typeof it.weight === 'object') ? (it.weight.text || (it.weight.lb != null ? `${it.weight.lb} lb.` : '')) : '';
          const desc = escapeHtml(String(it.description_ru || '').trim());
          const details = escapeHtml(String(it.details_ru || it.long_description_ru || it.long_desc_ru || '').trim());
          const meta = (() => {
            if (it.type === 'weapon' && it.weapon) {
              const dmg = it.weapon.damage ? `Урон: ${escapeHtml(String(it.weapon.damage))} (${escapeHtml(String(it.weapon.damage_type || ''))})` : '';
              const props = it.weapon.properties_ru ? `Свойства: ${escapeHtml(String(it.weapon.properties_ru))}` : '';
              return [dmg, props].filter(Boolean).join(' • ');
            }
            if (it.type === 'armor' && it.armor) {
              const ac = it.armor.ac ? `КД: ${escapeHtml(String(it.armor.ac))}` : '';
              const dis = it.armor.stealth_disadv ? 'Помеха скрытности' : '';
              return [ac, dis].filter(Boolean).join(' • ');
            }
            return '';
          })();

          return `
            <div class="equip-row" data-equip-row="${escapeHtml(String(it.id || ''))}">
              <div class="equip-row__left">
                <div class="equip-row__name">${name}</div>
                <div class="equip-row__meta">Цена: ${cost}${w ? ` • Вес: ${escapeHtml(String(w))}` : ''}${meta ? ` • ${meta}` : ''}</div>
                ${desc ? `<div class="equip-row__desc">${desc}</div>` : ''}
                ${details ? `<div class="equip-row__details collapsed" data-equip-details>${details}</div>` : ''}
              </div>
              <div class="equip-row__right">
                ${details ? `<button class="weapon-btn" type="button" data-equip-toggle-details data-item-id="${escapeHtml(String(it.id || ''))}">Описание</button>` : ''}
                <button class="weapon-btn" type="button" data-equip-action data-item-id="${escapeHtml(String(it.id || ''))}">${mode === 'buy' ? 'Купить' : 'Добавить'}</button>
              </div>
            </div>
          `;
        }).join('');
      };

      ensureEquipDb()
        .then(j => { db = j; renderList(); })
        .catch(err => { listEl.textContent = String(err?.message || err || 'Ошибка загрузки базы'); });

      tabSel.addEventListener('change', () => {
        const curTab = String(tabSel.value || 'weapons');
        if (mode === 'buy') {
          if (!sheet.shop || typeof sheet.shop !== 'object') sheet.shop = {};
          sheet.shop.activeTab = curTab;
        } else {
          if (!sheet.inventory || typeof sheet.inventory !== 'object') sheet.inventory = {};
          sheet.inventory.activeTab = curTab;
        }
        scheduleSheetSave(curPlayer);
        renderList();
        rerenderActiveTab(curPlayer);
      });
      qInp.addEventListener('input', renderList);

      listEl.addEventListener('click', (e) => {
        const btn = e.target?.closest?.('[data-equip-action][data-item-id]');
        if (!btn) return;
        const id = btn.getAttribute('data-item-id') || '';
        const curTab = String(tabSel.value || 'all');
        const items = (() => {
          if (curTab === 'all') {
            const out = [];
            TAB_DEFS.forEach(t => {
              if (t.id === 'all') return;
              const arr = Array.isArray(db?.tabs?.[t.id]) ? db.tabs[t.id] : [];
              arr.forEach(it => out.push({ ...it, _tab: t.id }));
            });
            return out;
          }
          return Array.isArray(db?.tabs?.[curTab]) ? db.tabs[curTab] : [];
        })();
        const found = items.find(x => String(x?.id || '') === String(id));
        if (!found) return;

        const targetTab = found?._tab ? String(found._tab) : curTab;

        const qty = Math.max(1, safeInt(qtyInp?.value, 1));

        if (mode === 'buy') {
          const cp = costToCp(found.cost) * qty;
          if (!spendCoins(sheet, cp)) {
            alert('Недостаточно монет.');
            return;
          }
          addToInventory(sheet, targetTab, found, qty);
        } else {
          addToInventory(sheet, targetTab, found, qty);
        }

        // выставим активную вкладку инвентаря = вкладка добавления
        if (!sheet.inventory || typeof sheet.inventory !== 'object') sheet.inventory = { activeTab: targetTab };
        sheet.inventory.activeTab = targetTab;

        scheduleSheetSave(curPlayer);
        rerenderActiveTab(curPlayer);
      });
    }


    // expose UI opener for sidebar auto-open (Shop tab)
    try {
      if (!window.__equipUi) window.__equipUi = {};
      window.__equipUi.open = openEquipOverlay;
    } catch {}

    root.addEventListener('click', (e) => {
      const { player: curPlayer, canEdit: curCanEdit } = getState();
      if (!curPlayer) return;

      // Toggle item description/details (works even in read-only: toggles only DOM).
      const toggleDescBtn = e.target?.closest?.('[data-inv-toggle-desc][data-tab][data-idx]');
      if (toggleDescBtn) {
        const tabId = String(toggleDescBtn.getAttribute('data-tab') || 'weapons');
        const idx = safeInt(toggleDescBtn.getAttribute('data-idx'), -1);

        // read-only: just toggle DOM
        if (!curCanEdit) {
          const card = toggleDescBtn.closest('[data-inv-item]');
          const descEl = card?.querySelector?.('.equip-desc, .equip-descedit');
          if (descEl) {
            descEl.classList.toggle('collapsed');
            const collapsed = descEl.classList.contains('collapsed');
            toggleDescBtn.textContent = collapsed ? 'Показать' : 'Скрыть';
          }
          return;
        }

        const sheet = curPlayer?.sheet?.parsed;
        if (!sheet?.inventory || !Array.isArray(sheet.inventory[tabId]) || idx < 0 || idx >= sheet.inventory[tabId].length) return;
        const it = sheet.inventory[tabId][idx];
        if (it && typeof it === 'object') it.descCollapsed = !it.descCollapsed;
        scheduleSheetSave(curPlayer);
        rerenderActiveTab(curPlayer);
        return;
      }

      const toggleDetailsBtn = e.target?.closest?.('[data-inv-toggle-details][data-tab][data-idx]');
      if (toggleDetailsBtn) {
        const tabId = String(toggleDetailsBtn.getAttribute('data-tab') || 'weapons');
        const idx = safeInt(toggleDetailsBtn.getAttribute('data-idx'), -1);

        // read-only: just toggle DOM
        if (!curCanEdit) {
          const card = toggleDetailsBtn.closest('[data-inv-item]');
          const detEl = card?.querySelector?.('.equip-details');
          if (detEl) {
            detEl.classList.toggle('collapsed');
            const opened = !detEl.classList.contains('collapsed');
            toggleDetailsBtn.textContent = opened ? 'Скрыть описание' : 'Описание';
          }
          return;
        }

        const sheet = curPlayer?.sheet?.parsed;
        if (!sheet?.inventory || !Array.isArray(sheet.inventory[tabId]) || idx < 0 || idx >= sheet.inventory[tabId].length) return;
        const it = sheet.inventory[tabId][idx];
        if (it && typeof it === 'object') it.detailsOpen = !it.detailsOpen;
        scheduleSheetSave(curPlayer);
        rerenderActiveTab(curPlayer);
        return;
      }

      // Inventory subtabs
      const invTabBtn = e.target?.closest?.('[data-inv-subtab]');
      if (invTabBtn) {
        if (!curCanEdit) return;
        const tabId = String(invTabBtn.getAttribute('data-inv-subtab') || 'weapons');
        const sheet = curPlayer?.sheet?.parsed;
        if (!sheet) return;
        if (!sheet.inventory || typeof sheet.inventory !== 'object') sheet.inventory = {};
        sheet.inventory.activeTab = tabId;
        scheduleSheetSave(curPlayer);
        rerenderActiveTab(curPlayer);
        return;
      }

      // Shop subtabs
      const shopTabBtn = e.target?.closest?.('[data-shop-subtab]');
      if (shopTabBtn) {
        if (!curCanEdit) return;
        const tabId = String(shopTabBtn.getAttribute('data-shop-subtab') || 'weapons');
        const sheet = curPlayer?.sheet?.parsed;
        if (!sheet) return;
        if (!sheet.shop || typeof sheet.shop !== 'object') sheet.shop = {};
        sheet.shop.activeTab = tabId;
        scheduleSheetSave(curPlayer);
        rerenderActiveTab(curPlayer);
        return;
      }

      // Open DB from inventory
      if (e.target?.closest?.('[data-inv-open-db]')) {
        openEquipOverlay('add');
        return;
      }
      // Open DB from shop
      if (e.target?.closest?.('[data-shop-open-db]')) {
        openEquipOverlay('buy');
        return;
      }

      // manual add in inventory
      if (e.target?.closest?.('[data-inv-add-manual]')) {
        if (!curCanEdit) return;
        const sheet = curPlayer?.sheet?.parsed;
        if (!sheet) return;
        const tabId = String(sheet?.inventory?.activeTab || 'weapons');

        // Для вкладки "Оружие" — даём выбрать кубики урона как в меню "Бой"
        if (tabId === 'weapons') {
          const wrap = document.createElement('div');
          wrap.className = 'equip-overlay';
          const diceOptions = ['к4','к6','к8','к10','к12','к20'];
          wrap.innerHTML = `
            <div class="equip-overlay__backdrop" data-wm-close></div>
            <div class="equip-overlay__panel" role="dialog" aria-modal="true" style="width:min(760px,92vw)">
              <div class="equip-overlay__head">
                <div class="equip-overlay__title">Добавить оружие</div>
                <button class="equip-overlay__x" type="button" data-wm-close>✕</button>
              </div>

              <div class="equip-overlay__controls" style="gap:12px">
                <input class="equip-ctl" style="flex:1; min-width:200px" type="text" placeholder="Название" data-wm-name>
                <div class="equip-qtywrap"><span class="equip-qtywrap__lbl">Количество</span><input class="equip-ctl equip-qty" type="number" min="1" max="999" value="1" data-wm-qty></div>
              </div>

              <div class="equip-overlay__list" style="padding-top:0">
                <div class="sheet-card" style="margin-top:10px">
                  <div class="weapon-details-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">
                    <div class="weapon-fieldbox">
                      <div class="weapon-fieldlabel">Урон (кол-во)</div>
                      <input class="weapon-num" type="number" min="1" step="1" value="1" data-wm-dmgnum>
                    </div>
                    <div class="weapon-fieldbox">
                      <div class="weapon-fieldlabel">Кость</div>
                      <select class="weapon-select" data-wm-dmgdice>
                        ${diceOptions.map(d=>`<option value="${d}">${d}</option>`).join('')}
                      </select>
                    </div>
                    <div class="weapon-fieldbox">
                      <div class="weapon-fieldlabel">Тип урона</div>
                      <input class="weapon-text" type="text" placeholder="колющий/рубящий/..." data-wm-dmgtype>
                    </div>
                  </div>

                  <div class="weapon-desc" style="margin-top:10px">
                    <textarea class="sheet-textarea" rows="4" placeholder="Описание / свойства оружия..." data-wm-desc></textarea>
                  </div>

                  <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:10px">
                    <button class="weapon-btn" type="button" data-wm-cancel>Отмена</button>
                    <button class="weapon-btn" type="button" data-wm-add>Добавить</button>
                  </div>
                </div>
              </div>
            </div>
          `;

          document.body.appendChild(wrap);
          const close = () => wrap.remove();
          wrap.addEventListener('click', (ev) => {
            if (ev.target?.closest?.('[data-wm-close],[data-wm-cancel]')) close();
          });
          wrap.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') close(); });

          const add = () => {
            const name = (wrap.querySelector('[data-wm-name]')?.value || '').trim() || 'Оружие';
            const qty = Math.max(1, safeInt(wrap.querySelector('[data-wm-qty]')?.value, 1));
            const dmgNum = Math.max(1, safeInt(wrap.querySelector('[data-wm-dmgnum]')?.value, 1));
            const dmgDice = String(wrap.querySelector('[data-wm-dmgdice]')?.value || 'к6');
            const dmgType = (wrap.querySelector('[data-wm-dmgtype]')?.value || '').trim();
            const desc = (wrap.querySelector('[data-wm-desc]')?.value || '').trim();

            if (!Array.isArray(sheet.weaponsList)) sheet.weaponsList = [];
            const invId = `manual_weapon_${Date.now()}_${Math.random().toString(16).slice(2)}`;

            const w = { name, ability: 'str', prof: false, extraAtk: 0, dmgNum, dmgDice, dmgType, desc, collapsed: false, invId };
            sheet.weaponsList.push(w);
            try { window.__equipSync?.syncWeaponCombatToInv?.(sheet, w); } catch {}

            // количество — это количество предметов в инвентаре
            if (sheet?.inventory && Array.isArray(sheet.inventory.weapons)) {
              const invIt = sheet.inventory.weapons.find(x => String(x?.id || '') === invId);
              if (invIt) invIt.qty = qty;
            }

            scheduleSheetSave(curPlayer);
            rerenderActiveTab(curPlayer);
            close();
          };

          const addBtn = wrap.querySelector('[data-wm-add]');
          if (addBtn) addBtn.addEventListener('click', add);
          return;
        }

        if (!sheet.inventory || typeof sheet.inventory !== 'object') sheet.inventory = { activeTab: tabId };
        if (!Array.isArray(sheet.inventory[tabId])) sheet.inventory[tabId] = [];
        sheet.inventory[tabId].push({
          id: `manual_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          name_ru: "Новый предмет",
          qty: 1,
          cost: { amount: 0, coin: 'gp', coin_ru: 'зм' },
          weight: { lb: 0, text: '' },
          description_ru: "",
          type: 'manual'
        });
        scheduleSheetSave(curPlayer);
        rerenderActiveTab(curPlayer);
        return;
      }

      // sell/delete inventory item
      const sellBtn = e.target?.closest?.('[data-inv-sell][data-tab][data-idx]');
      if (sellBtn) {
        if (!curCanEdit) return;
        const tabId = String(sellBtn.getAttribute('data-tab') || 'weapons');
        const idx = safeInt(sellBtn.getAttribute('data-idx'), -1);
        const sheet = curPlayer?.sheet?.parsed;
        if (!sheet?.inventory || !Array.isArray(sheet.inventory[tabId]) || idx < 0 || idx >= sheet.inventory[tabId].length) return;
        const it = sheet.inventory[tabId][idx];
        const qty = Math.max(1, safeInt(it?.qty, 1));
        const addCp = costToCp(it?.cost) * qty;
        addCoins(sheet, addCp);
        // если продаём оружие — убираем его и из вкладки "Бой"
        try {
          if (tabId === 'weapons') {
            const invId = String(it?.id || '').trim();
            if (invId && Array.isArray(sheet.weaponsList)) {
              sheet.weaponsList = sheet.weaponsList.filter(w => String(w?.invId || '') !== invId);
            }
          }
        } catch {}

        sheet.inventory[tabId].splice(idx, 1);
        scheduleSheetSave(curPlayer);
        rerenderActiveTab(curPlayer);
        return;
      }
      const delBtn = e.target?.closest?.('[data-inv-del][data-tab][data-idx]');
      if (delBtn) {
        if (!curCanEdit) return;
        const tabId = String(delBtn.getAttribute('data-tab') || 'weapons');
        const idx = safeInt(delBtn.getAttribute('data-idx'), -1);
        const sheet = curPlayer?.sheet?.parsed;
        if (!sheet?.inventory || !Array.isArray(sheet.inventory[tabId]) || idx < 0 || idx >= sheet.inventory[tabId].length) return;
        // если удаляем оружие — убираем его и из вкладки "Бой"
        try {
          if (tabId === 'weapons') {
            const invId = String(sheet.inventory?.[tabId]?.[idx]?.id || '').trim();
            if (invId && Array.isArray(sheet.weaponsList)) {
              sheet.weaponsList = sheet.weaponsList.filter(w => String(w?.invId || '') !== invId);
            }
          }
        } catch {}

        sheet.inventory[tabId].splice(idx, 1);
        scheduleSheetSave(curPlayer);
        rerenderActiveTab(curPlayer);
        return;
      }
    });
  }

  // ===== Slots (spell slots) editors =====
function bindSlotEditors(root, player, canEdit) {
  if (!root || !player?.sheet) return;

  // IMPORTANT:
  // sheetContent (root) переиспользуется между открытиями модалки и при импорте .json.
  // Если повесить обработчики один раз и замкнуть player в closure — появится рассинхрон:
  // клики/правки будут менять sheet старого игрока, а UI будет рендериться по новому.
  // Поэтому храним актуальные ссылки на player/canEdit прямо на root и берём их в момент события.
  root.__spellSlotsState = { player, canEdit };

  const getState = () => root.__spellSlotsState || { player, canEdit };

  const getSheet = () => {
    const { player: curPlayer } = getState();
    const s = curPlayer?.sheet?.parsed;
    if (!s || typeof s !== "object") return null;
    if (!s.spells || typeof s.spells !== "object") s.spells = {};
    return s;
  };

  const inputs = root.querySelectorAll(".slot-current-input[data-slot-level]");
  inputs.forEach(inp => {
    const lvl = safeInt(inp.getAttribute("data-slot-level"), 0);
    if (!lvl) return;

    if (!canEdit) { inp.disabled = true; return; }

    const handler = () => {
      const sheet = getSheet();
      if (!sheet) return;

      // desired = итоговое число ячеек (0..12)
      // Требование: если уменьшаем число — лишние ячейки должны удаляться целиком (а не просто "разряжаться").
      // Если увеличиваем — новые ячейки считаем заряженными.
      const desiredTotal = Math.max(0, Math.min(12, safeInt(inp.value, 0)));

      const key = `slots-${lvl}`;
      if (!sheet.spells[key] || typeof sheet.spells[key] !== "object") {
        sheet.spells[key] = { value: 0, filled: 0 };
      }

      const totalPrev = numLike(sheet.spells[key].value, 0);
      const filledPrev = numLike(sheet.spells[key].filled, 0);
      const currentPrev = Math.max(0, totalPrev - filledPrev);

      // total slots = desiredTotal (уменьшение удаляет лишние)
      const total = desiredTotal;

      // current (заряжено): при увеличении — полностью заряжаем, при уменьшении — не больше total
      const current = (total > totalPrev) ? total : Math.min(currentPrev, total);

      setMaybeObjField(sheet.spells[key], "value", total);
      setMaybeObjField(sheet.spells[key], "filled", Math.max(0, total - current));

      // update dots in UI without full rerender
      const dotsWrap = root.querySelector(`.slot-dots[data-slot-dots="${lvl}"]`);
      if (dotsWrap) {
        const totalForUi = Math.max(0, Math.min(12, numLike(sheet.spells[key].value, 0)));
        const dots = Array.from({ length: totalForUi })
          .map((_, i) => `<span class="slot-dot${i < current ? " is-available" : ""}" data-slot-level="${lvl}"></span>`)
          .join("");
        dotsWrap.innerHTML = dots || `<span class="slot-dots-empty">—</span>`;
      }

      inp.value = String(total);
      const { player: curPlayer } = getState();
      scheduleSheetSave(curPlayer);
    };

    inp.addEventListener("input", handler);
    inp.addEventListener("change", handler);
  });

  // кликабельные кружки: синий = доступно, пустой = использовано
  if (!root.__spellSlotsDotsBound) {
    root.__spellSlotsDotsBound = true;
    root.addEventListener("click", async (e) => {
      const { player: curPlayer, canEdit: curCanEdit } = getState();

      // ===== 🎲 Атака заклинанием (d20 + бонус атаки) =====
      // (должно работать независимо от клика по слотам)
      const rollHeaderBtn = e.target?.closest?.("[data-spell-roll-header]");
      const rollSpellBtn = e.target?.closest?.("[data-spell-roll]");

      if (rollHeaderBtn || rollSpellBtn) {
        const sheet = getSheet();
        if (!sheet) return;

        const bonus = computeSpellAttack(sheet);

        let lvl = 0;
        let title = "";
        if (rollSpellBtn) {
          const item = rollSpellBtn.closest(".spell-item");
          lvl = safeInt(item?.getAttribute?.("data-spell-level"), 0);
          title = (item?.querySelector?.(".spell-item-link")?.textContent || item?.querySelector?.(".spell-item-title")?.textContent || "").trim();
        }

        // Бонус для броска берём из видимого поля "Бонус атаки" (если есть),
        // чтобы итог в панели "Бросок" совпадал с тем, что видит игрок.
        const atkInput = root.querySelector('[data-spell-attack-bonus]');
        const uiBonus = atkInput ? safeInt(atkInput.value, bonus) : bonus;

        // В панели "Бросок" не показываем текст "Атака заклинанием" — только число.
        // А в журнал/другим игрокам отправляем отдельное событие с понятным названием.
        let rollRes = null;
        if (window.DicePanel?.roll) {
          rollRes = await window.DicePanel.roll({
            sides: 20,
            count: 1,
            bonus: uiBonus,
            // Показываем в панели "Бросок" так же, как атака оружием:
            // "Заклинания: d20+X" (X берётся из поля "Бонус атаки" в разделе Заклинаний)
            kindText: `Заклинания: d20${formatMod(uiBonus)}`,
            silent: true
          });
        }

        try {
          if (typeof sendMessage === 'function' && rollRes) {
            const r = rollRes.rolls?.[0];
            const b = Number(rollRes.bonus) || 0;
            const bonusTxt = b ? ` ${b >= 0 ? '+' : '-'} ${Math.abs(b)}` : '';
            const nameTxt = title ? ` (${title})` : '';
            sendMessage({
              type: 'log',
              text: `Атака заклинанием${nameTxt}: d20(${r})${bonusTxt} => ${rollRes.total}`
            });

            sendMessage({
              type: 'diceEvent',
              event: {
                kindText: `Атака заклинанием${nameTxt}`,
                sides: 20,
                count: 1,
                bonus: b,
                rolls: [r],
                total: rollRes.total,
                crit: (r === 1 ? 'crit-fail' : r === 20 ? 'crit-success' : '')
              }
            });
          }
        } catch {}

        // если бросок был из конкретного заклинания — тратим 1 ячейку соответствующего уровня (кроме заговоров)
        if (rollSpellBtn && lvl > 0) {
          if (!curCanEdit) return;

          if (!sheet.spells || typeof sheet.spells !== "object") sheet.spells = {};
          const key = `slots-${lvl}`;
          if (!sheet.spells[key] || typeof sheet.spells[key] !== "object") sheet.spells[key] = { value: 0, filled: 0 };

          const total = Math.max(0, Math.min(12, numLike(sheet.spells[key].value, 0)));
          const filled = Math.max(0, Math.min(total, numLike(sheet.spells[key].filled, 0)));
          const available = Math.max(0, total - filled);

          if (available > 0) {
            setMaybeObjField(sheet.spells[key], "filled", Math.min(total, filled + 1));

            // обновим UI кружков конкретного уровня без полного ререндера
            const dotsWrap = root.querySelector(`.slot-dots[data-slot-dots="${lvl}"]`);
            if (dotsWrap) {
              const filled2 = Math.max(0, Math.min(total, numLike(sheet.spells[key].filled, 0)));
              const available2 = Math.max(0, total - filled2);
              const dots = Array.from({ length: total })
                .map((_, i) => `<span class="slot-dot${i < available2 ? " is-available" : ""}" data-slot-level="${lvl}"></span>`)
                .join("");
              dotsWrap.innerHTML = dots || `<span class="slot-dots-empty">—</span>`;
            }

            scheduleSheetSave(curPlayer);
          }
        }

        return;
      }

      // ===== слоты =====
      const dot = e.target?.closest?.(".slot-dot[data-slot-level]");
      if (!dot) return;

      if (!curCanEdit) return;

      const sheet = getSheet();
      if (!sheet) return;

      const lvl = safeInt(dot.getAttribute("data-slot-level"), 0);
      if (!lvl) return;

      const key = `slots-${lvl}`;
      if (!sheet.spells[key] || typeof sheet.spells[key] !== "object") {
        sheet.spells[key] = { value: 0, filled: 0 };
      }

      const total = Math.max(0, Math.min(12, numLike(sheet.spells[key].value, 0)));
      const filled = Math.max(0, Math.min(total, numLike(sheet.spells[key].filled, 0)));
      let available = Math.max(0, total - filled);

      // нажали на доступный -> используем 1; нажали на пустой -> возвращаем 1
      if (dot.classList.contains("is-available")) available = Math.max(0, available - 1);
      else available = Math.min(total, available + 1);

      setMaybeObjField(sheet.spells[key], "filled", Math.max(0, total - available));

      const inp = root.querySelector(`.slot-current-input[data-slot-level="${lvl}"]`);
      if (inp) inp.value = String(available);

      const dotsWrap = root.querySelector(`.slot-dots[data-slot-dots="${lvl}"]`);
      if (dotsWrap) {
        const dots = Array.from({ length: total })
          .map((_, i) => `<span class="slot-dot${i < available ? " is-available" : ""}" data-slot-level="${lvl}"></span>`)
          .join("");
        dotsWrap.innerHTML = dots || `<span class="slot-dots-empty">—</span>`;
      }

      scheduleSheetSave(curPlayer);
    });
  }
}

// ===== add spells by URL + toggle descriptions =====
function normalizeDndSuUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  // accept dnd.su links only (spells)
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    if (!parsed.hostname.endsWith("dnd.su")) return "";
    // normalize trailing slash
    let href = parsed.href;
    if (!href.endsWith("/")) href += "/";
    return href;
  } catch {
    return "";
  }
}

async function fetchSpellHtml(url) {
  // GitHub Pages = статик: прямой fetch к dnd.su блокируется CORS.
  // Поэтому порядок такой:
  // 1) Supabase Edge Function (invoke) если доступен
  // 2) Supabase Edge Function по полному URL (если так задано)
  // 3) Fallback через r.jina.ai (read-only прокси)
  // НИКАКИХ /api/fetch и НИКАКИХ прямых запросов к dnd.su на статике.

  const targetUrl = normalizeDndSuUrl(url);

  // --- 1) Supabase invoke по имени функции ---
  try {
    const fn = (typeof window !== "undefined" && window.SUPABASE_FETCH_FN) ? String(window.SUPABASE_FETCH_FN) : "";
    const sbGetter = (typeof window !== "undefined" && typeof window.getSbClient === "function") ? window.getSbClient : null;

    if (fn && !fn.startsWith("http") && sbGetter) {
      const sb = sbGetter();
      if (sb && sb.functions && typeof sb.functions.invoke === "function") {
        const { data, error } = await sb.functions.invoke(fn, { body: { url: targetUrl } });
        if (error) throw error;
        if (!data || typeof data.html !== "string") throw new Error("Supabase function returned no html");
        return data.html;
      }
    }
  } catch (e) {
    console.warn("Supabase invoke fetch failed, falling back to proxy:", e);
  }

  // --- 2) Supabase по полному URL (если задан) ---
  try {
    const fnUrl = (typeof window !== "undefined" && window.SUPABASE_FETCH_FN) ? String(window.SUPABASE_FETCH_FN) : "";
    if (fnUrl && fnUrl.startsWith("http")) {
      const r = await fetch(fnUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (!j || typeof j.html !== "string") throw new Error("Function returned no html");
      return j.html;
    }
  } catch (e) {
    console.warn("Supabase URL fetch failed, falling back to proxy:", e);
  }

  // --- 3) r.jina.ai fallback ---
  const clean = targetUrl.replace(/^https?:\/\//i, "");
  const proxyUrl = `https://r.jina.ai/https://${clean}`;
  const resp = await fetch(proxyUrl, { method: "GET" });
  if (!resp.ok) throw new Error(`Proxy HTTP ${resp.status}`);
  return await resp.text();
}


function cleanupSpellDesc(raw) {
  let s = String(raw || "");

  // normalize newlines
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // remove injected commentsAccess tail (sometimes прилетает из html)
  s = s.replace(/window\.commentsAccess\s*=\s*\{[\s\S]*?\}\s*;?/g, "");
  s = s.replace(/window\.commentsAccess[\s\S]*?;?/g, "");

  // fix glued words like "вызовВремя" -> "вызов\nВремя"
  s = s.replace(/([0-9a-zа-яё])([A-ZА-ЯЁ])/g, "$1\n$2");

  // trim each line + collapse excessive blank lines
  s = s
    .split("\n")
    .map(l => l.replace(/\s+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return s;
}

function extractSpellFromHtml(html) {
  const rawHtml = String(html || "");

  let name = "";
  let desc = "";

  try {
    const doc = new DOMParser().parseFromString(rawHtml, "text/html");

    // name
    name = (doc.querySelector('h2.card-title[itemprop="name"]')?.textContent || "").trim();

    // main description: from <ul class="params card__article-body"> ... until comments block
    const startEl = doc.querySelector('ul.params.card__article-body');
    if (startEl) {
      // best-effort: take text of this block (it usually contains all params + описание)
      desc = (startEl.innerText || startEl.textContent || "");
    }

    // fallback: slice between markers if DOM layout changed
    if (!desc) {
      const start = rawHtml.indexOf('<ul class="params card__article-body"');
      const end = rawHtml.indexOf('<section class="comments-block');
      if (start !== -1 && end !== -1 && end > start) {
        const slice = rawHtml.slice(start, end);
        const wrap = document.createElement("div");
        wrap.innerHTML = slice;
        desc = (wrap.innerText || wrap.textContent || "");
      }
    }
  } catch {
    name = name || "";
    desc = desc || "";
  }

  desc = cleanupSpellDesc(desc);

  return { name: name || "(без названия)", desc: desc || "" };
}



function ensureSpellSaved(sheet, level, name, href, desc) {
  if (!sheet.text || typeof sheet.text !== "object") sheet.text = {};

  // store meta
  sheet.text[`spell-name:${href}`] = { value: String(name || "").trim() };
  sheet.text[`spell-desc:${href}`] = { value: cleanupSpellDesc(desc || "") };

  // append to plain list if absent
  const plainKey = `spells-level-${level}-plain`;
  const cur = String(sheet.text?.[plainKey]?.value ?? "");
  const lines = cur.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const already = lines.some(l => l.includes(href));
  if (!already) lines.push(`${name} | ${href}`);
  sheet.text[plainKey] = { value: lines.join("\n") };
}



function deleteSpellSaved(sheet, href) {
  if (!sheet || !href) return;

  if (!sheet.text || typeof sheet.text !== "object") sheet.text = {};

  // remove meta (manual name/desc)
  delete sheet.text[`spell-name:${href}`];
  delete sheet.text[`spell-desc:${href}`];

  // remove from tiptap docs (imported from .json)
  function docHasHref(node) {
    if (!node || typeof node !== "object") return false;
    if (node.type === "text" && Array.isArray(node.marks)) {
      return node.marks.some(m => m?.type === "link" && String(m?.attrs?.href || "") === String(href));
    }
    if (Array.isArray(node.content)) return node.content.some(ch => docHasHref(ch));
    return false;
  }

  function normalizeDoc(maybeDoc) {
    if (!maybeDoc) return null;
    if (typeof maybeDoc === "string") {
      try { return JSON.parse(maybeDoc); } catch { return null; }
    }
    if (typeof maybeDoc === "object") return maybeDoc;
    return null;
  }

  for (let lvl = 0; lvl <= 9; lvl++) {
    // tiptap: sheet.text["spells-level-N"].value.data
    const tipKey = `spells-level-${lvl}`;
    const tip = sheet.text?.[tipKey];
    const docRaw = tip?.value?.data;
    const doc = normalizeDoc(docRaw);
    if (doc && Array.isArray(doc.content)) {
      const beforeLen = doc.content.length;
      const nextContent = doc.content.filter(block => !docHasHref(block));
      if (nextContent.length !== beforeLen) {
        const nextDoc = { ...doc, content: nextContent };
        if (!sheet.text[tipKey] || typeof sheet.text[tipKey] !== "object") sheet.text[tipKey] = {};
        if (!sheet.text[tipKey].value || typeof sheet.text[tipKey].value !== "object") sheet.text[tipKey].value = {};
        sheet.text[tipKey].value.data = nextDoc;
      }
    }

    // plain editable list
    const plainKey = `spells-level-${lvl}-plain`;
    const cur = String(sheet.text?.[plainKey]?.value ?? "");
    if (cur) {
      const lines = cur.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const next = lines.filter(l => !l.includes(href));
      if (next.length) sheet.text[plainKey] = { value: next.join("\n") };
      else delete sheet.text[plainKey];
    }
  }
}

function makeManualHref() {
  // псевдо-ссылка для "ручных" заклинаний, чтобы хранить описание в sheet.text
  return `manual:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function rerenderSpellsTabInPlace(root, player, sheet, canEdit) {
  const main = root.querySelector("#sheet-main");
  if (!main) return;
  const scrollTop = main.scrollTop;

  const freshVm = toViewModel(sheet, player.name);
  main.innerHTML = renderSpellsTab(freshVm);

  bindEditableInputs(root, player, canEdit);
  bindSkillBoostDots(root, player, canEdit);
  bindSaveProfDots(root, player, canEdit);
  bindStatRollButtons(root, player);
  bindAbilityAndSkillEditors(root, player, canEdit);
  bindNotesEditors(root, player, canEdit);
  bindSlotEditors(root, player, canEdit);
  bindSpellAddAndDesc(root, player, canEdit);
  bindCombatEditors(root, player, canEdit);

  main.scrollTop = scrollTop;
}

// ===== Spells DB parsing =====
const spellDbCache = {
  classes: null,            // [{value,label,url}]
  byClass: new Map(),       // value -> spells array
  descByHref: new Map()     // href -> {name,desc}
};

function parseSpellClassesFromHtml(html) {
  const out = [];
  try {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");

    // 0) актуальная разметка dnd.su (список классов):
    // <li class="if-list__item" data-value="21"><div class="if-list__item-title">Волшебник</div></li>
    // выбранный класс: class="if-list__item active"
    const liItems = Array.from(doc.querySelectorAll('li.if-list__item[data-value]'));
    if (liItems.length) {
      liItems.forEach(li => {
        const val = String(li.getAttribute('data-value') || '').trim();
        const label = (li.querySelector('.if-list__item-title')?.textContent || li.textContent || '').trim();
        if (!val || !label) return;
        out.push({ value: val, label, url: `https://dnd.su/spells/?class=${encodeURIComponent(val)}` });
      });
    }

    // 1) пробуем найти select с классами
    const sel = !out.length ? doc.querySelector('select[name="class"], select#class, select[class*="class"]') : null;
    if (sel) {
      sel.querySelectorAll("option").forEach(opt => {
        const val = (opt.getAttribute("value") || "").trim();
        const label = (opt.textContent || "").trim();
        if (!val) return;
        // часто есть "Все" — пропускаем
        if (/^все/i.test(label)) return;
        out.push({ value: val, label, url: `https://dnd.su/spells/?class=${encodeURIComponent(val)}` });
      });
    }

    // 2) fallback: ищем ссылки ?class=
    if (!out.length) {
      const seen = new Set();
      doc.querySelectorAll('a[href*="?class="]').forEach(a => {
        const href = a.getAttribute("href") || "";
        try {
          const u = new URL(href, "https://dnd.su");
          const val = u.searchParams.get("class");
          const label = (a.textContent || "").trim();
          if (!val || !label) return;
          if (seen.has(val)) return;
          seen.add(val);
          out.push({ value: val, label, url: `https://dnd.su/spells/?class=${encodeURIComponent(val)}` });
        } catch {}
      });
    }
  } catch {}

  // уникализация
  const uniq = new Map();
  out.forEach(c => {
    if (!c?.value) return;
    if (!uniq.has(c.value)) uniq.set(c.value, c);
  });
  return Array.from(uniq.values()).sort((a,b) => String(a.label||"").localeCompare(String(b.label||""), "ru"));
}

function getSpellLevelFromText(text) {
  const t = String(text || "").toLowerCase();

  // "заговор"
  if (t.includes("заговор")) return 0;

  // варианты "уровень 1", "1 уровень", "1-го уровня"
  const m1 = t.match(/уров(ень|ня|не)\s*([1-9])/i);
  if (m1 && m1[2]) return safeInt(m1[2], 0);

  const m2 = t.match(/\b([1-9])\s*уров/i);
  if (m2 && m2[1]) return safeInt(m2[1], 0);

  // иногда на карточках просто цифра уровня отдельно — берём самую "разумную"
  const m3 = t.match(/\b([1-9])\b/);
  if (m3 && m3[1]) return safeInt(m3[1], 0);

  return null;
}

function normalizeAnyUrlToAbs(href) {
  try {
    const u = new URL(String(href || ""), "https://dnd.su");
    let s = u.href;
    if (!s.endsWith("/")) s += "/";
    return s;
  } catch {
    return "";
  }
}

function parseSpellsFromClassHtml(html) {
  const spells = [];
  const seen = new Set();

  try {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");

    // основной список обычно в main
    const scope = doc.querySelector("main") || doc.body || doc;

    // берём ссылки на страницы заклинаний (не на каталог)
    const links = Array.from(scope.querySelectorAll('a[href*="/spells/"]'))
      .filter(a => {
        const h = a.getAttribute("href") || "";
        if (!h) return false;
        if (h.includes("/spells/?")) return false;
        // исключим якоря/комменты
        if (h.includes("#")) return false;
        return true;
      });

    for (const a of links) {
      const abs = normalizeAnyUrlToAbs(a.getAttribute("href"));
      if (!abs || !abs.includes("/spells/")) continue;
      if (seen.has(abs)) continue;

      const name = (a.textContent || "").trim();
      if (!name) continue;

      const card = a.closest(".card") || a.closest("article") || a.parentElement;
      const lvl = getSpellLevelFromText(card ? card.textContent : a.textContent);

      seen.add(abs);
      spells.push({ name, href: abs, level: lvl });
    }
  } catch {}

  // сорт: сначала по level (0..9..unknown), затем по имени
  const lvlKey = (x) => (x.level == null ? 99 : x.level);
  spells.sort((a,b) => {
    const da = lvlKey(a), db = lvlKey(b);
    if (da !== db) return da - db;
    return String(a.name||"").localeCompare(String(b.name||""), "ru");
  });

  return spells;
}

async function ensureDbSpellDesc(href) {
  if (spellDbCache.descByHref.has(href)) return spellDbCache.descByHref.get(href);
  const html = await fetchSpellHtml(href);
  const parsed = extractSpellFromHtml(html);
  spellDbCache.descByHref.set(href, parsed);
  return parsed;
}

function openAddSpellPopup({ root, player, sheet, canEdit, level }) {
  const lvl = safeInt(level, 0);
  const title = (lvl === 0) ? "Добавить заговор" : `Добавить заклинание (уровень ${lvl})`;

  const { overlay, close } = openPopup({
    title,
    bodyHtml: `
      <div class="sheet-note" style="margin-bottom:10px;">Выбери способ добавления.</div>
      <div class="popup-actions">
        <button class="popup-btn primary" type="button" data-add-mode="link">Добавить по ссылке</button>
        <button class="popup-btn" type="button" data-add-mode="manual">Вписать вручную</button>
      </div>
      <div style="margin-top:12px;" data-add-body></div>
    `
  });

  const body = overlay.querySelector("[data-add-body]");
  overlay.addEventListener("click", async (e) => {
    const modeBtn = e.target?.closest?.("[data-add-mode]");
    if (!modeBtn || !body) return;
    if (!canEdit) return;

    const mode = modeBtn.getAttribute("data-add-mode");
    if (mode === "link") {
      body.innerHTML = `
        <div class="sheet-note">Вставь ссылку на dnd.su (пример: https://dnd.su/spells/9-bless/)</div>
        <input class="popup-field" type="text" placeholder="https://dnd.su/spells/..." data-link-input>
        <div class="popup-actions" style="margin-top:10px;">
          <button class="popup-btn primary" type="button" data-link-ok>Добавить</button>
          <button class="popup-btn" type="button" data-popup-close>Отмена</button>
        </div>
      `;
      body.querySelector("[data-link-input]")?.focus?.();
      return;
    }

    if (mode === "manual") {
      body.innerHTML = `
        <div class="popup-grid">
          <div>
            <div class="sheet-note">Название</div>
            <input class="popup-field" type="text" placeholder="Например: Волшебная струна" data-manual-name>
          </div>
          <div>
            <div class="sheet-note">Уровень уже выбран: <b>${escapeHtml(String(lvl))}</b></div>
            <div class="sheet-note">Ссылка не нужна.</div>
          </div>
        </div>
        <div style="margin-top:10px;">
          <div class="sheet-note">Описание (как на сайте — с абзацами)</div>
          <textarea class="popup-field" style="min-height:180px; resize:vertical;" data-manual-desc></textarea>
        </div>
        <div class="popup-actions" style="margin-top:10px;">
          <button class="popup-btn primary" type="button" data-manual-ok>Добавить</button>
          <button class="popup-btn" type="button" data-popup-close>Отмена</button>
        </div>
      `;
      body.querySelector("[data-manual-name]")?.focus?.();
      return;
    }
  });

  overlay.addEventListener("click", async (e) => {
    const okLink = e.target?.closest?.("[data-link-ok]");
    if (okLink) {
      if (!canEdit) return;
      const inp = overlay.querySelector("[data-link-input]");
      const rawUrl = inp?.value || "";
      const href = normalizeDndSuUrl(rawUrl);
      if (!href || !href.includes("/spells/")) {
        alert("Нужна ссылка на dnd.su/spells/... (пример: https://dnd.su/spells/9-bless/)");
        return;
      }

      okLink.disabled = true;
      if (inp) inp.disabled = true;

      try {
        const html = await fetchSpellHtml(href);
        const { name, desc } = extractSpellFromHtml(html);
        ensureSpellSaved(sheet, lvl, name, href, desc);
        scheduleSheetSave(player);
        rerenderSpellsTabInPlace(root, player, sheet, canEdit);
        close();
      } catch (err) {
        console.error(err);
        alert("Не удалось получить/распарсить описание с dnd.su. Проверь ссылку.");
      } finally {
        okLink.disabled = false;
        if (inp) inp.disabled = false;
      }
      return;
    }

    const okManual = e.target?.closest?.("[data-manual-ok]");
    if (okManual) {
      if (!canEdit) return;
      const name = (overlay.querySelector("[data-manual-name]")?.value || "").trim();
      const desc = (overlay.querySelector("[data-manual-desc]")?.value || "").replaceAll("\r\n", "\n").replaceAll("\r", "\n").trim();
      if (!name) {
        alert("Укажи название.");
        return;
      }
      const href = makeManualHref();
      ensureSpellSaved(sheet, lvl, name, href, desc || "");
      scheduleSheetSave(player);
      rerenderSpellsTabInPlace(root, player, sheet, canEdit);
      close();
      return;
    }
  });
}

async function openSpellDbPopup({ root, player, sheet, canEdit }) {
  const { overlay, close } = openPopup({
    title: "База заклинаний (SRD 5.1)",
    bodyHtml: `
      <div class="popup-grid" style="grid-template-columns:1fr 1fr 1fr;">
        <div>
          <div class="sheet-note">Класс</div>
          <select class="popup-field" data-db-class></select>
        </div>
        <div>
          <div class="sheet-note">Уровень</div>
          <select class="popup-field" data-db-filter-level>
            <option value="any" selected>Любой</option>
            ${Array.from({length:10}).map((_,i)=>`<option value="${i}">${i===0?"0 (заговоры)":`Уровень ${i}`}</option>`).join("")}
          </select>
        </div>
        <div>
          <div class="sheet-note">Школа</div>
          <select class="popup-field" data-db-filter-school>
            <option value="any" selected>Любая</option>
          </select>
        </div>
      </div>

      <div class="popup-grid" style="margin-top:10px; grid-template-columns: 1fr 1fr;">
        <div>
          <div class="sheet-note">Добавлять в уровень</div>
          <select class="popup-field" data-db-level>
            <option value="auto" selected>Авто (уровень заклинания)</option>
            ${Array.from({length:10}).map((_,i)=>`<option value="${i}">${i===0?"0 (заговоры)":`Уровень ${i}`}</option>`).join("")}
          </select>
        </div>
        <div>
          <div class="sheet-note">Поиск</div>
          <input class="popup-field" type="text" placeholder="Название..." data-db-search>
        </div>
      </div>

      <div style="margin-top:10px;" data-db-list>
        <div class="sheet-note">Загрузка базы…</div>
      </div>
    `
  });

  const classSel = overlay.querySelector("[data-db-class]");
  const filterLevelSel = overlay.querySelector("[data-db-filter-level]");
  const filterSchoolSel = overlay.querySelector("[data-db-filter-school]");
  const forceLevelSel = overlay.querySelector("[data-db-level]");
  const searchInp = overlay.querySelector("[data-db-search]");
  const listBox = overlay.querySelector("[data-db-list]");

  if (!classSel || !listBox) return;

  // ---- local SRD cache ----
  if (!window.__srdSpellDb) window.__srdSpellDb = { loaded: false, spells: [], byId: new Map() };
  const cache = window.__srdSpellDb;

  async function ensureLoaded() {
    if (cache.loaded && Array.isArray(cache.spells) && cache.spells.length) return;
    const res = await fetch("spells_srd_db.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`SRD spell DB load failed: ${res.status}`);
    const json = await res.json();
    cache.spells = Array.isArray(json?.spells) ? json.spells : [];
    cache.byId = new Map(cache.spells.map(s => [String(s.id || ""), s]));
    cache.loaded = true;
  }

  function uniq(arr) {
    return Array.from(new Set(arr.filter(Boolean)));
  }

  function spellNameForUI(s) {
    return String(s?.name_ru || s?.name_en || "").trim();
  }

  function fmtSpellDetails(s) {
    const levelTxt = (s.level === 0) ? "Заговор" : `Уровень ${s.level}`;
    const school = String(s.school_ru || s.school_en || "").trim();
    const parts = [
      `${levelTxt}${school ? ` • ${school}` : ""}`,
      `Время накладывания: ${s.casting_time_ru || s.casting_time_en || "-"}`,
      `Дистанция: ${s.range_ru || s.range_en || "-"}`,
      `Компоненты: ${s.components_ru || s.components_en || "-"}`,
      `Длительность: ${s.duration_ru || s.duration_en || "-"}`,
      "",
      String(s.description_ru || s.description_en || "").trim() || "(описание пустое)",
    ];
    return parts.join("\n");
  }

  function render() {
    const cls = String(classSel.value || "");
    const search = String(searchInp?.value || "").trim().toLowerCase();
    const lvlFilterRaw = String(filterLevelSel?.value || "any");
    const lvlFilter = (lvlFilterRaw === "any") ? null : safeInt(lvlFilterRaw, 0);
    const schoolFilter = String(filterSchoolSel?.value || "any");
    const forceLevel = String(forceLevelSel?.value || "auto");

    const filtered = cache.spells.filter(s => {
      if (cls && Array.isArray(s.classes) && !s.classes.includes(cls)) return false;
      if (lvlFilter != null && s.level !== lvlFilter) return false;
      if (schoolFilter !== "any" && String(s.school_en || "").toLowerCase() !== schoolFilter) return false;
      if (search) {
        const nm = spellNameForUI(s).toLowerCase();
        if (!nm.includes(search)) return false;
      }
      return true;
    });

    // group by level
    const groups = new Map();
    for (const s of filtered) {
      const k = String(s.level ?? "?");
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(s);
    }
    const order = ["0","1","2","3","4","5","6","7","8","9","?"];
    const htmlGroups = order
      .filter(k => groups.has(k) && groups.get(k).length)
      .map(k => {
        const title = (k === "0") ? "Заговоры (0)" : (k === "?" ? "Уровень не определён" : `Уровень ${k}`);
        const rows = groups.get(k)
          .sort((a,b)=>spellNameForUI(a).localeCompare(spellNameForUI(b), "ru"))
          .map(s => {
            const safeId = escapeHtml(String(s.id || ""));
            const safeName = escapeHtml(spellNameForUI(s));
            return `
              <div class="db-spell-row" data-db-id="${safeId}" data-db-level="${escapeHtml(String(s.level ?? ""))}">
                <div class="db-spell-head">
                  <button class="popup-btn" type="button" data-db-toggle style="padding:6px 10px;">${safeName}</button>
                  <div class="db-spell-controls">
                    <button class="popup-btn primary" type="button" data-db-learn>Выучить</button>
                  </div>
                </div>
                <pre class="db-spell-desc hidden" data-db-desc style="white-space:pre-wrap; margin:8px 0 0 0;">${escapeHtml(fmtSpellDetails(s))}</pre>
              </div>
            `;
          }).join("");
        return `
          <div class="sheet-card" style="margin:10px 0;">
            <h4 style="margin:0 0 6px 0;">${escapeHtml(title)}</h4>
            ${rows}
          </div>
        `;
      }).join("");

    listBox.innerHTML = htmlGroups || `<div class="sheet-note">Ничего не найдено.</div>`;

    listBox.querySelectorAll("[data-db-toggle]").forEach(btn => {
      btn.addEventListener("click", () => {
        const row = btn.closest("[data-db-id]");
        const descEl = row?.querySelector("[data-db-desc]");
        if (!descEl) return;
        descEl.classList.toggle("hidden");
      });
    });

    listBox.querySelectorAll("[data-db-learn]").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!canEdit) return;
        const row = btn.closest("[data-db-id]");
        if (!row) return;
        const id = row.getAttribute("data-db-id") || "";
        const s = cache.byId.get(id);
        if (!s) return;

        // decide level to save in sheet
        let lvl = null;
        if (forceLevel !== "auto") lvl = safeInt(forceLevel, 0);
        else lvl = (typeof s.level === "number") ? s.level : 0;
        if (lvl == null || lvl < 0 || lvl > 9) lvl = 0;

        const name = spellNameForUI(s) || String(s.name_en || "");
        const desc = fmtSpellDetails(s);
        const href = `srd://spell/${id}`;

        btn.disabled = true;
        ensureSpellSaved(sheet, lvl, name, href, desc);
        scheduleSheetSave(player);
        rerenderSpellsTabInPlace(root, player, sheet, canEdit);

        btn.textContent = "Выучено";
        btn.classList.remove("primary");
        btn.disabled = true;
      });
    });
  }

  try {
    await ensureLoaded();
  } catch (err) {
    console.error(err);
    listBox.innerHTML = `<div class="sheet-note">Не удалось загрузить spells_srd_db.json (проверь, что файл лежит рядом с index.html).</div>`;
    return;
  }

  // fill selects
  const allClasses = uniq(cache.spells.flatMap(s => Array.isArray(s.classes) ? s.classes : [])).sort((a,b)=>a.localeCompare(b, "en"));
  classSel.innerHTML = allClasses.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  const allSchools = uniq(cache.spells.map(s => String(s.school_en || "").toLowerCase())).sort((a,b)=>a.localeCompare(b, "en"));
  if (filterSchoolSel) {
    filterSchoolSel.innerHTML = `<option value="any" selected>Любая</option>` + allSchools.map(sc => `<option value="${escapeHtml(sc)}">${escapeHtml(sc)}</option>`).join("");
  }

  classSel.addEventListener("change", render);
  filterLevelSel?.addEventListener("change", render);
  filterSchoolSel?.addEventListener("change", render);
  forceLevelSel?.addEventListener("change", render);
  searchInp?.addEventListener("input", () => {
    clearTimeout(searchInp.__t);
    searchInp.__t = setTimeout(render, 120);
  });

  render();
}

function bindSpellAddAndDesc(root, player, canEdit) {
  if (!root || !player?.sheet?.parsed) return;

  // IMPORTANT:
  // sheetContent (root) переиспользуется между открытиями модалки.
  // Нельзя один раз повесить обработчики с замыканием на player/canEdit,
  // иначе при открытии "Инфы" другого игрока (или после импорта .json, который меняет объект)
  // события будут применяться к старому sheet.
  // Поэтому храним актуальный контекст на root и читаем его в момент события.
  root.__spellAddState = { player, canEdit };

  const getState = () => root.__spellAddState || { player, canEdit };
  const getSheet = () => getState().player?.sheet?.parsed;

  // listeners вешаем один раз
  if (root.__spellAddInit) {
    // контекст обновили выше
    return;
  }
  root.__spellAddInit = true;

  root.addEventListener("click", async (e) => {
    const { player: curPlayer, canEdit: curCanEdit } = getState();

    const addBtn = e.target?.closest?.("[data-spell-add][data-spell-level]");
    if (addBtn) {
      if (!curCanEdit) return;
      const sheet = getSheet();
      if (!sheet) return;

      const lvl = safeInt(addBtn.getAttribute("data-spell-level"), 0);
      openAddSpellPopup({ root, player: curPlayer, sheet, canEdit: curCanEdit, level: lvl });
      return;
    }

    const dbBtn = e.target?.closest?.("[data-spell-db]");
    if (dbBtn) {
      const sheet = getSheet();
      if (!sheet) return;
      await openSpellDbPopup({ root, player: curPlayer, sheet, canEdit: curCanEdit });
      return;
    }

    const delBtn = e.target?.closest?.("[data-spell-delete]");
    if (delBtn) {
      if (!curCanEdit) return;
      const sheet = getSheet();
      if (!sheet) return;

      const item = delBtn.closest(".spell-item");
      const href = item?.getAttribute?.("data-spell-url") || "";
      if (!href) return;
      if (!confirm("Удалить это заклинание?")) return;

      deleteSpellSaved(sheet, href);
      scheduleSheetSave(curPlayer);
      rerenderSpellsTabInPlace(root, curPlayer, sheet, curCanEdit);
      return;
    }

    const descBtn = e.target?.closest?.("[data-spell-desc-toggle]");
    if (descBtn) {
      const item = descBtn.closest(".spell-item");
      const desc = item?.querySelector?.(".spell-item-desc");
      if (!desc) return;
      desc.classList.toggle("hidden");
      descBtn.classList.toggle("is-open");
      return;
    }
  });

  // выбор базовой характеристики (STR/DEX/CON/INT/WIS/CHA)
  root.addEventListener("change", (e) => {
    const sel = e.target?.closest?.("[data-spell-base-ability]");
    if (!sel) return;
    const { player: curPlayer, canEdit: curCanEdit } = getState();
    if (!curCanEdit) return;

    const sheet = getSheet();
    if (!sheet) return;

    if (!sheet.spellsInfo || typeof sheet.spellsInfo !== "object") sheet.spellsInfo = {};
    if (!sheet.spellsInfo.base || typeof sheet.spellsInfo.base !== "object") sheet.spellsInfo.base = { code: "" };

    sheet.spellsInfo.base.code = String(sel.value || "").trim();

    // если пользователь не задал ручной бонус атаки — просто перерисуем, чтобы пересчитать формулу
    scheduleSheetSave(curPlayer);
    rerenderSpellsTabInPlace(root, curPlayer, sheet, curCanEdit);
  });

  // ручное редактирование бонуса атаки
  root.addEventListener("input", (e) => {
    const atk = e.target?.closest?.("[data-spell-attack-bonus]");
    if (atk) {
      const { player: curPlayer, canEdit: curCanEdit } = getState();
      if (!curCanEdit) return;

      const sheet = getSheet();
      if (!sheet) return;

      if (!sheet.spellsInfo || typeof sheet.spellsInfo !== "object") sheet.spellsInfo = {};
      if (!sheet.spellsInfo.mod || typeof sheet.spellsInfo.mod !== "object") sheet.spellsInfo.mod = { customModifier: "" };

      const v = String(atk.value || "").trim();
      const computed = computeSpellAttack(sheet);

      if (v === "") {
        // пусто = вернуть авто-расчет
        delete sheet.spellsInfo.mod.customModifier;
        if ("value" in sheet.spellsInfo.mod) delete sheet.spellsInfo.mod.value;
      } else {
        const n = parseModInput(v, computed);
        // если ввели ровно авто-значение — не фиксируем "ручной" модификатор, чтобы формула продолжала работать
        if (n === computed) {
          delete sheet.spellsInfo.mod.customModifier;
          if ("value" in sheet.spellsInfo.mod) delete sheet.spellsInfo.mod.value;
        } else {
          sheet.spellsInfo.mod.customModifier = String(n);
        }
      }

      scheduleSheetSave(curPlayer);
      // не перерисовываем на каждый ввод — чтобы курсор не прыгал
      return;
    }

    // редактирование описания (textarea внутри раскрывашки)
    const ta = e.target?.closest?.("[data-spell-desc-editor]");
    if (!ta) return;
    const { player: curPlayer, canEdit: curCanEdit } = getState();
    if (!curCanEdit) return;

    const sheet = getSheet();
    if (!sheet) return;

    const item = ta.closest(".spell-item");
    const href = item?.getAttribute?.("data-spell-url") || "";
    if (!href) return;

    if (!sheet.text || typeof sheet.text !== "object") sheet.text = {};
    const key = `spell-desc:${href}`;
    if (!sheet.text[key] || typeof sheet.text[key] !== "object") sheet.text[key] = { value: "" };
    sheet.text[key].value = cleanupSpellDesc(String(ta.value || ""));
    scheduleSheetSave(curPlayer);
  });
}
  function updateDerivedForStat(root, sheet, statKey) {
    if (!root || !sheet || !statKey) return;

    // check/save inputs inside this stat block
    const checkEl = root.querySelector(`.lss-pill-val-input[data-stat-key="${statKey}"][data-kind="check"]`);
    if (checkEl) checkEl.value = formatMod(calcCheckBonus(sheet, statKey));

    const saveEl = root.querySelector(`.lss-pill-val-input[data-stat-key="${statKey}"][data-kind="save"]`);
    if (saveEl) saveEl.value = formatMod(calcSaveBonus(sheet, statKey));

    // skills under this stat: just refresh all skills UI
    const scoreEl = root.querySelector(`.lss-ability-score-input[data-stat-key="${statKey}"]`);
    if (scoreEl && sheet?.stats?.[statKey]?.score != null) {
      scoreEl.value = String(sheet.stats[statKey].score);
    }
  }