  // ===== LIVE UI UPDATERS (без полного ререндера) =====
  function ensureDeathSavesState(sheet) {
    if (!sheet || typeof sheet !== 'object') return { success: 0, fail: 0, stabilized: false, lastRoll: null, lastOutcome: '' };
    if (!sheet.vitality || typeof sheet.vitality !== 'object') sheet.vitality = {};
    if (!sheet.vitality.deathSaves || typeof sheet.vitality.deathSaves !== 'object') {
      sheet.vitality.deathSaves = { success: 0, fail: 0, stabilized: false, lastRoll: null, lastOutcome: '' };
    }
    const ds = sheet.vitality.deathSaves;
    ds.success = Math.max(0, Math.min(3, safeInt(ds.success, 0)));
    ds.fail = Math.max(0, Math.min(3, safeInt(ds.fail, 0)));
    ds.stabilized = !!ds.stabilized;
    if (ds.lastRoll !== null && ds.lastRoll !== undefined && ds.lastRoll !== '') ds.lastRoll = safeInt(ds.lastRoll, null);
    else ds.lastRoll = null;
    ds.lastOutcome = String(ds.lastOutcome || '');
    return ds;
  }

  function isDeathSavesActiveSheet(sheet) {
    const hp = safeInt(sheet?.vitality?.["hp-max"]?.value, 0);
    const hpCur = safeInt(sheet?.vitality?.["hp-current"]?.value, 0);
    const ds = ensureDeathSavesState(sheet);
    return (hp > 0 && hpCur <= 0) || ds.success > 0 || ds.fail > 0 || ds.stabilized || ds.fail >= 3;
  }

  function resetDeathSavesState(sheet) {
    const ds = ensureDeathSavesState(sheet);
    ds.success = 0;
    ds.fail = 0;
    ds.stabilized = false;
    ds.lastRoll = null;
    ds.lastOutcome = '';
    return ds;
  }

  function syncDeathSavesUi(root, sheet, canEditOverride = null) {
    if (!root || !sheet) return;
    const hp = safeInt(sheet?.vitality?.["hp-max"]?.value, 0);
    const hpCur = safeInt(sheet?.vitality?.["hp-current"]?.value, 0);
    const ds = ensureDeathSavesState(sheet);
    const active = (hp > 0 && hpCur <= 0) || ds.success > 0 || ds.fail > 0 || ds.stabilized || ds.fail >= 3;

    const hpEl = root.querySelector('[data-hero-val="hp"]');
    const hpChip = root.querySelector('[data-hero="hp"]');
    const box = root.querySelector('[data-death-saves]');
    const row = root.querySelector('[data-death-saves-row]');
    const status = root.querySelector('[data-death-saves-status]');
    const rollBtn = root.querySelector('[data-death-save-roll]');

    if (hpEl) hpEl.style.display = active ? 'none' : '';
    if (box) box.style.display = active ? '' : 'none';
    if (box) box.classList.toggle('is-active', !!active);
    if (hpChip) {
      hpChip.classList.toggle('sheet-chip--hp-death', !!active);
      hpChip.classList.toggle('is-stabilized', !!(active && ds.stabilized && ds.success >= 3));
    }
    if (row) row.style.display = (active && !(ds.stabilized && ds.success >= 3) && ds.fail < 3) ? '' : 'none';
    if (status) {
      const showStatus = !!(active && ((ds.stabilized && ds.success >= 3) || ds.fail >= 3));
      status.style.display = showStatus ? '' : 'none';
      status.classList.toggle('is-visible', showStatus);
      status.classList.toggle('is-dead', !!(showStatus && ds.fail >= 3));
      status.textContent = (ds.fail >= 3) ? 'Мертв(а)' : 'Стабилизирован';
    }
    if (rollBtn) {
      const canEdit = (canEditOverride === null)
        ? !rollBtn.disabled
        : !!canEditOverride;
      rollBtn.disabled = !(active && !(ds.stabilized && ds.success >= 3) && ds.fail < 3 && canEdit);
    }

    const failDots = root.querySelectorAll('[data-death-dot^="fail-"]');
    failDots.forEach((dot, idx) => dot.classList.toggle('is-on', idx < ds.fail));
    const sucDots = root.querySelectorAll('[data-death-dot^="success-"]');
    sucDots.forEach((dot, idx) => dot.classList.toggle('is-on', idx < ds.success));
  }

  function applyDeathSaveRoll(sheet, roll) {
    const ds = ensureDeathSavesState(sheet);
    const hp = safeInt(sheet?.vitality?.["hp-max"]?.value, 0);
    const hpCur = safeInt(sheet?.vitality?.["hp-current"]?.value, 0);
    if (!(hp > 0 && hpCur <= 0)) {
      resetDeathSavesState(sheet);
      return { roll: null, outcome: 'inactive' };
    }

    const n = Math.max(1, Math.min(20, safeInt(roll, 1)));
    ds.lastRoll = n;
    ds.lastOutcome = '';

    if (n === 20) {
      ds.success = 0;
      ds.fail = 0;
      ds.stabilized = false;
      if (!sheet.vitality["hp-current"]) sheet.vitality["hp-current"] = { value: 0 };
      sheet.vitality["hp-current"].value = 1;
      ds.lastOutcome = 'crit-success';
      return { roll: n, outcome: ds.lastOutcome };
    }
    if (n === 1) {
      ds.fail = Math.max(0, Math.min(3, ds.fail + 2));
      ds.lastOutcome = 'crit-fail';
      if (ds.fail >= 3) ds.stabilized = false;
      return { roll: n, outcome: ds.lastOutcome };
    }
    if (n >= 10) {
      ds.success = Math.max(0, Math.min(3, ds.success + 1));
      if (ds.success >= 3) {
        ds.success = 3;
        ds.stabilized = true;
        ds.lastOutcome = 'stabilized';
      } else {
        ds.lastOutcome = 'success';
      }
      return { roll: n, outcome: ds.lastOutcome };
    }
    ds.fail = Math.max(0, Math.min(3, ds.fail + 1));
    if (ds.fail >= 3) {
      ds.fail = 3;
      ds.stabilized = false;
      ds.lastOutcome = 'dead';
    } else {
      ds.lastOutcome = 'fail';
    }
    return { roll: n, outcome: ds.lastOutcome };
  }

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
    syncDeathSavesUi(root, sheet);


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

  // ===== Combat powers (Способности: ячейки + подспособности d20) =====
  if (!sheet.combat || typeof sheet.combat !== 'object') sheet.combat = {};
  if (!Array.isArray(sheet.combat.powersDefs)) sheet.combat.powersDefs = [];

  // Legacy migration: раньше быстрые броски жили в sheet.combat.powersActions.
  // Теперь подспособности хранятся внутри каждой главной способности: def.subs.
  try {
    const legacy = Array.isArray(sheet.combat.powersActions) ? sheet.combat.powersActions : [];
    if (legacy.length && Array.isArray(sheet.combat.powersDefs)) {
      sheet.combat.powersDefs.forEach(d => {
        if (!d || typeof d !== 'object') return;
        if (!Array.isArray(d.subs)) d.subs = [];
        const related = legacy.filter(a => String(a?.defId || '') === String(d?.id || ''));
        related.forEach(a => {
          d.subs.push({
            id: a?.id || undefined,
            name: a?.name || '',
            stat: a?.stat || '-',
            desc: a?.desc || '',
            collapsed: (a?.collapsed !== undefined) ? !!a.collapsed : true
          });
        });
      });
      sheet.combat.powersActions = [];
      scheduleSheetSave(player);
    }
  } catch {}

  const makeId = () => {
    try { return (crypto?.randomUUID && crypto.randomUUID()) || ('id_' + Math.random().toString(16).slice(2) + '_' + Date.now()); }
    catch { return 'id_' + Math.random().toString(16).slice(2) + '_' + Date.now(); }
  };

  const getDefById = (id) => sheet?.combat?.powersDefs?.find(d => String(d?.id || '') === String(id || ''));

  const getModForStat = (statKey) => {
    const k = String(statKey || '-');
    if (!['str','dex','con','int','wis','cha'].includes(k)) return 0;
    const direct = sheet?.stats?.[k]?.modifier;
    if (direct !== undefined && direct !== null && direct !== '') return safeInt(direct, 0);
    const score = safeInt(sheet?.stats?.[k]?.value, 10);
    return Math.floor((score - 10) / 2);
  };

  const ensureDefSlotsState = (def) => {
    if (!def || typeof def !== 'object') return;
    const max = Math.max(0, safeInt(def.slotsMax, 0));
    if (!Array.isArray(def.slotsState)) def.slotsState = [];
    // normalize length; keep existing states when possible
    const next = [];
    for (let i = 0; i < max; i++) next[i] = (typeof def.slotsState[i] === 'boolean') ? def.slotsState[i] : true;
    def.slotsState = next;
    if (!Array.isArray(def.subs)) def.subs = [];
  };

  // add definition
  const addDefBtn = root.querySelector('[data-combat-power-def-add]');
  if (addDefBtn) {
    if (!canEdit) addDefBtn.disabled = true;
    addDefBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!canEdit) return;
      const id = makeId();
      const def = { id, name: `Способность-${sheet.combat.powersDefs.length + 1}`, desc: '', slotsMax: 0, slotsState: [], recharge: 'short', collapsed: true, subs: [] };
      ensureDefSlotsState(def);
      sheet.combat.powersDefs.push(def);
      scheduleSheetSave(player);
      rerenderCombatTabInPlace(root, player, canEdit);
    });
  }

  // bind definitions
  const defEls = root.querySelectorAll('.combat-power-def[data-cpw-def-id]');
  defEls.forEach(defEl => {
    const defId = defEl.getAttribute('data-cpw-def-id');
    const def = getDefById(defId);
    if (!def) return;
    ensureDefSlotsState(def);

    const nameInp = defEl.querySelector('[data-cpw-def-name]');
    if (nameInp) {
      if (!canEdit) nameInp.disabled = true;
      const handler = () => {
        if (!canEdit) return;
        def.name = String(nameInp.value || '');
        scheduleSheetSave(player);
      };
      nameInp.addEventListener('input', handler);
      nameInp.addEventListener('change', handler);
    }

    const slotsInp = defEl.querySelector('[data-cpw-def-slots]');
    if (slotsInp) {
      if (!canEdit) slotsInp.disabled = true;
      const handler = () => {
        if (!canEdit) return;
        def.slotsMax = Math.max(0, safeInt(slotsInp.value, 0));
        ensureDefSlotsState(def);
        scheduleSheetSave(player);
        rerenderCombatTabInPlace(root, player, canEdit);
      };
      slotsInp.addEventListener('input', handler);
      slotsInp.addEventListener('change', handler);
    }

    const rechargeSel = defEl.querySelector('[data-cpw-def-recharge]');
    if (rechargeSel) {
      if (!canEdit) rechargeSel.disabled = true;
      const handler = () => {
        if (!canEdit) return;
        const v = String(rechargeSel.value || 'short');
        def.recharge = (v === 'long') ? 'long' : 'short';
        scheduleSheetSave(player);
      };
      rechargeSel.addEventListener('change', handler);
    }

    const descTa = defEl.querySelector('[data-cpw-def-desc]');
    if (descTa) {
      if (!canEdit) descTa.disabled = true;
      const handler = () => {
        if (!canEdit) return;
        def.desc = String(descTa.value || '');
        scheduleSheetSave(player);
      };
      descTa.addEventListener('input', handler);
      descTa.addEventListener('change', handler);
    }

    const dotsWrap = defEl.querySelector('[data-cpw-def-dots]');
    if (dotsWrap) {
      dotsWrap.addEventListener('click', (e) => {
        const btn = (e.target instanceof Element) ? e.target.closest('[data-cpw-dot]') : null;
        if (!btn) return;
        e.preventDefault();
        if (!canEdit) return;
        const di = safeInt(btn.getAttribute('data-cpw-dot'), -1);
        if (di < 0) return;
        ensureDefSlotsState(def);
        def.slotsState[di] = !def.slotsState[di];
        scheduleSheetSave(player);
        rerenderCombatTabInPlace(root, player, canEdit);
      });
    }

    const toggleDescBtn = defEl.querySelector('[data-cpw-def-toggle-desc]');
    if (toggleDescBtn) {
      if (!canEdit) toggleDescBtn.disabled = true;
      toggleDescBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!canEdit) return;
        def.collapsed = !def.collapsed;
        scheduleSheetSave(player);
        rerenderCombatTabInPlace(root, player, canEdit);
      });
    }

    const addSubBtn = defEl.querySelector('[data-cpw-def-add-sub]');
    if (addSubBtn) {
      if (!canEdit) addSubBtn.disabled = true;
      addSubBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!canEdit) return;
        ensureDefSlotsState(def);
        def.subs.push({ id: makeId(), name: `Способность-${def.subs.length + 1}`, exec: 'attack', stat: '-', desc: '', collapsed: true });
        scheduleSheetSave(player);
        rerenderCombatTabInPlace(root, player, canEdit);
      });
    }

    const delBtn = defEl.querySelector('[data-cpw-def-del]');
    if (delBtn) {
      if (!canEdit) delBtn.disabled = true;
      delBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!canEdit) return;
        if (!confirm('Удалить способность?')) return;
        const id = String(def.id || defId || '');
        sheet.combat.powersDefs = sheet.combat.powersDefs.filter(d => String(d?.id || '') !== id);
        scheduleSheetSave(player);
        rerenderCombatTabInPlace(root, player, canEdit);
      });
    }

    // bind subs inside this def
    const subEls = defEl.querySelectorAll('.cpw-sub[data-cpw-sub-id]');
    subEls.forEach(subEl => {
      const subId = subEl.getAttribute('data-cpw-sub-id');
      const sub = (Array.isArray(def.subs) ? def.subs : []).find(s => String(s?.id ?? '') === String(subId ?? ''));
      if (!sub) return;

      const nameInp = subEl.querySelector('[data-cpw-sub-name]');
      if (nameInp) {
        if (!canEdit) nameInp.disabled = true;
        const handler = () => {
          if (!canEdit) return;
          sub.name = String(nameInp.value || '');
          scheduleSheetSave(player);
        };
        nameInp.addEventListener('input', handler);
        nameInp.addEventListener('change', handler);
      }

      
      const execSel = subEl.querySelector('[data-cpw-sub-exec]');
      if (execSel) {
        if (!canEdit) execSel.disabled = true;
        execSel.addEventListener('change', () => {
          if (!canEdit) return;
          const v = String(execSel.value || 'attack');
          sub.exec = (v === 'action') ? 'action' : 'attack';
          if (sub.exec === 'action') sub.stat = '-';
          scheduleSheetSave(player);
          rerenderCombatTabInPlace(root, player, canEdit);
        });
      }

const statSel = subEl.querySelector('[data-cpw-sub-stat]');
      if (statSel) {
        if (!canEdit) statSel.disabled = true;
        statSel.addEventListener('change', () => {
          if (!canEdit) return;
          const v = String(statSel.value || '-');
          sub.stat = (['str','dex','con','int','wis','cha'].includes(v)) ? v : '-';
          scheduleSheetSave(player);
        });
      }

      const descTa = subEl.querySelector('[data-cpw-sub-desc]');
      if (descTa) {
        if (!canEdit) descTa.disabled = true;
        const handler = () => {
          if (!canEdit) return;
          sub.desc = String(descTa.value || '');
          scheduleSheetSave(player);
        };
        descTa.addEventListener('input', handler);
        descTa.addEventListener('change', handler);
      }

      const toggleBtn = subEl.querySelector('[data-cpw-sub-toggle-desc]');
      if (toggleBtn) {
        if (!canEdit) toggleBtn.disabled = true;
        toggleBtn.addEventListener('click', (e) => {
          e.preventDefault();
          if (!canEdit) return;
          sub.collapsed = !sub.collapsed;
          scheduleSheetSave(player);
          rerenderCombatTabInPlace(root, player, canEdit);
        });
      }

      const delBtn = subEl.querySelector('[data-cpw-sub-del]');
      if (delBtn) {
        if (!canEdit) delBtn.disabled = true;
        delBtn.addEventListener('click', (e) => {
          e.preventDefault();
          if (!canEdit) return;
          def.subs = (Array.isArray(def.subs) ? def.subs : []).filter(s => String(s?.id ?? '') !== String(subId ?? ''));
          scheduleSheetSave(player);
          rerenderCombatTabInPlace(root, player, canEdit);
        });
      }

      
      const actionBtn = subEl.querySelector('[data-cpw-sub-action]');
      if (actionBtn) {
        const max = Math.max(0, safeInt(def?.slotsMax, 0));
        ensureDefSlotsState(def);
        const hasAvailable = (max <= 0) ? true : (Array.isArray(def?.slotsState) ? def.slotsState.some(Boolean) : false);
        if (!hasAvailable) actionBtn.disabled = true;

        actionBtn.addEventListener('click', (e) => {
          e.preventDefault();
          ensureDefSlotsState(def);

          const max2 = Math.max(0, safeInt(def?.slotsMax, 0));
          if (max2 > 0) {
            const i = def.slotsState.findIndex(Boolean);
            if (i < 0) return;
            if (!canEdit) return;
            def.slotsState[i] = false;
          } else {
            if (!canEdit) return;
          }

          const nm = String(sub.name || def.name || 'Способность');
          try {
            const fromName = String(player?.name || '');
            if (typeof sendMessage === 'function') {
              sendMessage({ type: 'log', text: `${fromName} применил «${nm}»` });
            }
          } catch {}

          scheduleSheetSave(player);
          rerenderCombatTabInPlace(root, player, canEdit);
        });
      }

const rollBtn = subEl.querySelector('[data-cpw-sub-roll]');
      if (rollBtn) {
        // disable if no cells
        const max = Math.max(0, safeInt(def?.slotsMax, 0));
        ensureDefSlotsState(def);
        const hasAvailable = (max <= 0) ? true : (Array.isArray(def?.slotsState) ? def.slotsState.some(Boolean) : false);
        if (!hasAvailable) rollBtn.disabled = true;

        rollBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          ensureDefSlotsState(def);

          const max2 = Math.max(0, safeInt(def?.slotsMax, 0));
          if (max2 > 0) {
            const i = def.slotsState.findIndex(Boolean);
            if (i < 0) return;
            if (!canEdit) return; // трата ячейки требует прав редактирования
            def.slotsState[i] = false;
          }

          const bonus = getModForStat(sub.stat);
          const nm = String(sub.name || def.name || 'Способность');
          if (window.DicePanel?.roll) {
            await window.DicePanel.roll({ sides: 20, count: 1, bonus, kindText: `${nm}: d20${formatMod(bonus)}` });
          }

          scheduleSheetSave(player);
          rerenderCombatTabInPlace(root, player, canEdit);
        });
      }
    });
  });

  updateWeaponsBonuses(root, sheet);
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

    // source: 'db' | 'shop' | ''  (used to adjust UI/description behavior)
    function addToInventory(sheet, tabId, item, qty, source = '') {
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

      // Mark items coming from SRD db/shop so inventory UI can hide redundant buttons.
      if (source) payload._source = String(source);

      // For db/shop items we merge long description into short description so that
      // the single "Показать/Скрыть" button controls all text.
      try {
        if (source) {
          const short = String(payload.description_ru || payload.desc_ru || payload.desc || '').trim();
          const long = String(payload.details_ru || payload.long_description_ru || payload.long_desc_ru || '').trim();
          if (long) {
            const merged = short ? `${short}\n\n${long}` : long;
            payload.description_ru = merged;
          }
          payload._fromDb = true;
        }
      } catch {}
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

      // Mark interactions in overlay so state updates don't cause UI jumps.
      try {
        wrap.addEventListener('pointerdown', () => { try { markModalInteracted(curPlayer.id); } catch {} }, { passive: true });
        wrap.addEventListener('keydown', () => { try { markModalInteracted(curPlayer.id); } catch {} }, { passive: true });
      } catch {}

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
        // Toggle details by clicking on the left part of a row (no dedicated button).
        const left = e.target?.closest?.('.equip-row__left');
        if (left && listEl.contains(left)) {
          const row = left.closest('.equip-row');
          const det = row?.querySelector?.('[data-equip-details]');
          // Don't toggle when clicking the action button
          if (det && !e.target?.closest?.('[data-equip-action]')) {
            det.classList.toggle('collapsed');
            return;
          }
        }

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
          // Покупка строго за тот тип монет, который указан у предмета (без конвертации).
          const cost = (found && typeof found === 'object' && found.cost && typeof found.cost === 'object') ? found.cost : null;
          const coin = String(cost?.coin || '').toLowerCase();
          const amountOne = Number(cost?.amount ?? cost?.value ?? 0);
          const amount = Math.max(0, Math.round(amountOne)) * qty;

          const coinBox = (sheet.coins && sheet.coins[coin] && typeof sheet.coins[coin] === 'object') ? sheet.coins[coin] : null;
          const cur = coinBox ? Math.max(0, safeInt(coinBox.value, 0)) : 0;

          if (!coin || !coinBox) {
            alert('У предмета не указан корректный тип монеты.');
            return;
          }
          if (cur < amount) {
            alert('Недостаточно монет.');
            return;
          }

          coinBox.value = cur - amount;

          addToInventory(sheet, targetTab, found, qty, 'shop');
        } else {
          addToInventory(sheet, targetTab, found, qty, 'db');
        }

        // Visual feedback: flash the action button green for a moment.
        try {
          btn.classList.add('equip-action-flash-ok');
          setTimeout(() => { try { btn.classList.remove('equip-action-flash-ok'); } catch {} }, 1400);
        } catch {}

        // Mark interaction so state refresh does not jump tabs while user is working in overlay.
        try { markModalInteracted(curPlayer.id); } catch {}

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

    const setDescToggleLabel = (btn, collapsed) => {
      if (!btn) return;
      btn.textContent = collapsed ? 'Показать' : 'Скрыть';
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    };
    
    root.addEventListener('click', (e) => {
      const { player: curPlayer, canEdit: curCanEdit } = getState();
      if (!curPlayer) return;

      // Toggle item description (Показать/Скрыть)
      // IMPORTANT: do it in-place (DOM) to avoid any rerender side-effects.
      const toggleDescBtn = e.target?.closest?.('[data-inv-toggle-desc][data-tab][data-idx]');
      if (toggleDescBtn) {
        const tabId = String(toggleDescBtn.getAttribute('data-tab') || 'weapons');
        const idx = safeInt(toggleDescBtn.getAttribute('data-idx'), -1);

        const card = toggleDescBtn.closest('[data-inv-item]');
        const descEl = card?.querySelector?.('.equip-desc, .equip-descedit');
        if (descEl) {
          descEl.classList.toggle('collapsed');
          const collapsed = descEl.classList.contains('collapsed');
          toggleDescBtn.textContent = collapsed ? 'Показать' : 'Скрыть';

          // persist state for editable sheets
          if (curCanEdit) {
            const sheet = curPlayer?.sheet?.parsed;
            if (sheet?.inventory && Array.isArray(sheet.inventory[tabId]) && idx >= 0 && idx < sheet.inventory[tabId].length) {
              const it = sheet.inventory[tabId][idx];
              if (it && typeof it === 'object') it.descCollapsed = !!collapsed;
              scheduleSheetSave(curPlayer);
            }
          }
        }
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
        const cost = (it && typeof it === 'object' && it.cost && typeof it.cost === 'object') ? it.cost : null;
        const coin = String(cost?.coin || '').toLowerCase();
        const amountOne = Number(cost?.amount ?? cost?.value ?? 0);
        const addAmount = Math.max(0, Math.round(amountOne)) * qty;

        if (!sheet.coins || typeof sheet.coins !== 'object') sheet.coins = { cp:{value:0}, sp:{value:0}, ep:{value:0}, gp:{value:0}, pp:{value:0} };
        if (!sheet.coins[coin] || typeof sheet.coins[coin] !== 'object') sheet.coins[coin] = { value: 0 };
        sheet.coins[coin].value = Math.max(0, safeInt(sheet.coins[coin].value, 0)) + addAmount;
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

  const getSlotsState = (sheet, lvl) => {
    const key = `slots-${lvl}`;
    if (!sheet.spells[key] || typeof sheet.spells[key] !== 'object') sheet.spells[key] = { value: 0, filled: 0 };
    const total = Math.max(0, Math.min(12, numLike(sheet.spells[key].value, 0)));
    const filled = Math.max(0, Math.min(total, numLike(sheet.spells[key].filled, 0)));
    const current = Math.max(0, total - filled);
    return { key, total, filled, current };
  };

  const updateSlotDotsUi = (lvl, sheet) => {
    const { total, current } = getSlotsState(sheet, lvl);
    const dotsWrap = root.querySelector(`.slot-dots[data-slot-dots="${lvl}"]`);
    if (dotsWrap) {
      const dots = Array.from({ length: total })
        .map((_, i) => `<span class="slot-dot${i < current ? " is-available" : ""}" data-slot-level="${lvl}"></span>`)
        .join("");
      dotsWrap.innerHTML = dots || `<span class="slot-dots-empty">—</span>`;
    }
  };

  const updateSpellCastButtonsAvailability = (sheet) => {
    // Заговоры (0) всегда можно применять. Заклинания требуют доступных слотов.
    const items = root.querySelectorAll('.spell-item');
    items.forEach(it => {
      const btn = it.querySelector('[data-spell-cast]');
      if (!(btn instanceof HTMLButtonElement)) return;
      const lvl = safeInt(it.getAttribute('data-spell-level'), 0);
      if (lvl <= 0) {
        btn.disabled = false;
        btn.classList.remove('is-disabled');
        return;
      }
      const st = getSlotsState(sheet, lvl);
      const disabled = st.current <= 0;
      btn.disabled = disabled;
      btn.classList.toggle('is-disabled', disabled);
    });
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
      updateSlotDotsUi(lvl, sheet);
      updateSpellCastButtonsAvailability(sheet);

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
      const castSpellBtn = e.target?.closest?.("[data-spell-cast]");

      // ===== ⚡ Применение конкретного заклинания/заговора (без броска) =====
      if (castSpellBtn) {
        try { e?.preventDefault?.(); e?.stopPropagation?.(); e?.stopImmediatePropagation?.(); } catch {}
        try {
          const btnEl = (castSpellBtn instanceof HTMLElement) ? castSpellBtn : null;
          if (btnEl) {
            const now = Date.now();
            const last = Number(btnEl.dataset.castTs || 0);
            if (now - last < 400) return;
            btnEl.dataset.castTs = String(now);
          }
        } catch {}

        // Дополнительный глобальный анти-дубль на контейнере (на случай повторного бинда)
        try {
          const now = Date.now();
          const item = castSpellBtn.closest(".spell-item");
          const lvl = safeInt(item?.getAttribute?.("data-spell-level"), 0);
          const title = (item?.querySelector?.(".spell-item-link")?.textContent || item?.querySelector?.(".spell-item-title")?.textContent || "").trim();
          const key = `${lvl}:${title}`;
          if (!root.__spellCastGuard) root.__spellCastGuard = { ts: 0, key: '' };
          if (root.__spellCastGuard.key === key && (now - Number(root.__spellCastGuard.ts || 0) < 500)) return;
          root.__spellCastGuard = { ts: now, key };
        } catch {}

        const item = castSpellBtn.closest(".spell-item");
        const lvl = safeInt(item?.getAttribute?.("data-spell-level"), 0);
        const title = (item?.querySelector?.(".spell-item-link")?.textContent || item?.querySelector?.(".spell-item-title")?.textContent || "").trim();
        const kind = (lvl === 0) ? "Заговор" : "Заклинание";
        const who = String(curPlayer?.name || '').trim() || 'Игрок';
        const nm = title || '(без названия)';
        const href = item?.getAttribute?.('data-spell-url') || '';

        // ===== расход ячеек заклинаний (для уровней 1+) =====
        const sheet = getSheet();
        if (!sheet) return;

        if (lvl > 0) {
          if (!curCanEdit) return;
          const st = getSlotsState(sheet, lvl);
          if (st.current <= 0) {
            // слотов нет — блокируем кнопку
            try {
              if (castSpellBtn instanceof HTMLButtonElement) {
                castSpellBtn.disabled = true;
                castSpellBtn.classList.add('is-disabled');
              }
            } catch {}
            return;
          }

          // тратим 1 слот => увеличиваем filled
          setMaybeObjField(sheet.spells[st.key], 'filled', Math.min(st.total, st.filled + 1));
          updateSlotDotsUi(lvl, sheet);
          updateSpellCastButtonsAvailability(sheet);
          scheduleSheetSave(curPlayer);
        }

        const spellAction = getSpellActionConfig(sheet, href);

        try {
          if (typeof sendMessage === 'function') {
            sendMessage({ type: 'log', text: `${who} применил ${kind}: ${nm}` });
          }
        } catch {}

        if (spellAction?.type === 'teleport') {
          const rangeFeet = Math.max(0, safeInt(spellAction.rangeFeet, 0));
          const ok = !!window.activateCombatTeleportForPlayer?.(curPlayer, {
            rangeFeet,
            sourceKind: 'spell',
            sourceId: href || '',
            sourceName: nm
          });
          if (!ok) {
            try { alert('Телепортацию нельзя активировать только в фазе инициативы. В остальных фазах токен должен стоять на поле; в бою у игрока ещё должен быть доступен этот телепорт на текущий ход.'); } catch {}
          }
        }
        return;
      }

      // ===== 🎲 Атака заклинанием (d20 + бонус атаки) =====
      if (rollHeaderBtn) {
        const sheet = getSheet();
        if (!sheet) return;

        const bonus = computeSpellAttack(sheet);

        let title = "";

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

      const st = getSlotsState(sheet, lvl);
      const total = st.total;
      let available = st.current;

      // нажали на доступный -> используем 1; нажали на пустой -> возвращаем 1
      if (dot.classList.contains("is-available")) available = Math.max(0, available - 1);
      else available = Math.min(total, available + 1);

      setMaybeObjField(sheet.spells[st.key], "filled", Math.max(0, total - available));

      const inp = root.querySelector(`.slot-current-input[data-slot-level="${lvl}"]`);
      if (inp) inp.value = String(available);

      updateSlotDotsUi(lvl, sheet);
      updateSpellCastButtonsAvailability(sheet);

      scheduleSheetSave(curPlayer);
    });
  }

  // init availability (при первом биндинге таба "Заклинания")
  try {
    const sheet = getSheet();
    if (sheet) updateSpellCastButtonsAvailability(sheet);
  } catch {}
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

      deleteSpellSaved(sheet, href, item?.getAttribute?.("data-spell-level"));
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
    const { player: curPlayer, canEdit: curCanEdit } = getState();

    const actionSel = e.target?.closest?.('[data-spell-action-type]');
    if (actionSel) {
      if (!curCanEdit) return;
      const sheet = getSheet();
      if (!sheet) return;
      const item = actionSel.closest('.spell-item');
      const href = item?.getAttribute?.('data-spell-url') || '';
      if (!href) return;
      if (!sheet.spellActions || typeof sheet.spellActions !== 'object') sheet.spellActions = {};
      const type = String(actionSel.value || '').trim().toLowerCase();
      if (!type) {
        delete sheet.spellActions[href];
      } else {
        const prev = (sheet.spellActions[href] && typeof sheet.spellActions[href] === 'object') ? sheet.spellActions[href] : {};
        const rangeInput = item?.querySelector?.('[data-spell-teleport-feet]');
        const rangeFeet = Math.max(0, safeInt(rangeInput?.value, prev.rangeFeet || 0));
        sheet.spellActions[href] = { ...prev, type, rangeFeet };
      }
      const tpWrap = item?.querySelector?.('[data-spell-teleport-wrap]');
      if (tpWrap) tpWrap.style.display = (type === 'teleport') ? 'flex' : 'none';
      scheduleSheetSave(curPlayer);
      return;
    }

    const sel = e.target?.closest?.("[data-spell-base-ability]");
    if (!sel) return;
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
    const tpFeet = e.target?.closest?.('[data-spell-teleport-feet]');
    if (tpFeet) {
      const { player: curPlayer, canEdit: curCanEdit } = getState();
      if (!curCanEdit) return;
      const sheet = getSheet();
      if (!sheet) return;
      const item = tpFeet.closest('.spell-item');
      const href = item?.getAttribute?.('data-spell-url') || '';
      if (!href) return;
      const type = String(item?.querySelector?.('[data-spell-action-type]')?.value || '').trim().toLowerCase();
      if (!sheet.spellActions || typeof sheet.spellActions !== 'object') sheet.spellActions = {};
      if (!type) {
        delete sheet.spellActions[href];
      } else {
        const prev = (sheet.spellActions[href] && typeof sheet.spellActions[href] === 'object') ? sheet.spellActions[href] : {};
        sheet.spellActions[href] = { ...prev, type, rangeFeet: Math.max(0, safeInt(tpFeet.value, 0)) };
      }
      scheduleSheetSave(curPlayer);
      return;
    }

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
