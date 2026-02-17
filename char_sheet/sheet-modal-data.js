  // ================== UI STATE (tab/scroll/anti-jump) ==================
  function getUiState(playerId) {
    if (!playerId) return { activeTab: "basic", scrollTopByTab: {}, lastInteractAt: 0 };
    if (!uiStateByPlayerId.has(playerId)) {
      uiStateByPlayerId.set(playerId, { activeTab: "basic", scrollTopByTab: {}, lastInteractAt: 0 });
    }
    return uiStateByPlayerId.get(playerId);
  }

  function captureUiStateFromDom(player) {
    if (!player?.id) return;
    const st = getUiState(player.id);
    const activeTab = player._activeSheetTab || st.activeTab || "basic";
    st.activeTab = activeTab;

    const main = sheetContent?.querySelector?.("#sheet-main");
    if (main) {
      st.scrollTopByTab[activeTab] = main.scrollTop || 0;
    }
  }

  function restoreUiStateToDom(player) {
    if (!player?.id) return;
    const st = getUiState(player.id);
    const activeTab = player._activeSheetTab || st.activeTab || "basic";
    const main = sheetContent?.querySelector?.("#sheet-main");
    if (main && st.scrollTopByTab && typeof st.scrollTopByTab[activeTab] === "number") {
      main.scrollTop = st.scrollTopByTab[activeTab];
    }
  }

  function markModalInteracted(playerId) {
    if (!playerId) return;
    const st = getUiState(playerId);
    st.lastInteractAt = Date.now();
  }

  function isModalBusy(playerId) {
    if (!sheetModal || sheetModal.classList.contains('hidden')) return false;
    const activeEl = document.activeElement;
    if (activeEl && sheetModal.contains(activeEl)) return true;
    const st = getUiState(playerId);
    return (Date.now() - (st.lastInteractAt || 0)) < 900;
  }

  // ================== SHEET PARSER (Charbox/LSS) ==================
  function parseCharboxFileText(fileText) {
    const outer = JSON.parse(fileText);

    // Charbox LSS: outer.data — строка JSON
    let inner = null;
    if (outer && typeof outer.data === 'string') {
      try { inner = JSON.parse(outer.data); } catch { inner = null; }
    }

    return {
      source: "charbox",
      importedAt: Date.now(),
      raw: outer,
      parsed: inner || outer
    };
  }

  // ================== TIPTAP DOC PARSING ==================
  function tiptapToPlainLines(doc) {
    if (!doc || typeof doc !== "object") return [];
    const root = doc?.content;
    if (!Array.isArray(root)) return [];
    const lines = [];

    function walkNode(node, acc) {
      if (!node || typeof node !== "object") return acc;
      if (node.type === "text") {
        acc.push(String(node.text || ""));
        return acc;
      }
      if (Array.isArray(node.content)) {
        node.content.forEach(ch => walkNode(ch, acc));
      }
      return acc;
    }

    for (const block of root) {
      if (!block) continue;
      if (block.type === "paragraph") {
        const acc = [];
        walkNode(block, acc);
        const line = acc.join("").trim();
        if (line) lines.push(line);
      }
    }
    return lines;
  }

  function parseSpellsFromTiptap(doc) {
    if (!doc || typeof doc !== "object") return [];
    const root = doc?.content;
    if (!Array.isArray(root)) return [];
    const items = [];

    function walk(node, state) {
      if (!node || typeof node !== "object") return;
      if (node.type === "text") {
        const text = String(node.text || "").trim();
        if (!text) return;

        let href = null;
        if (Array.isArray(node.marks)) {
          const link = node.marks.find(m => m?.type === "link" && m?.attrs?.href);
          if (link) href = link.attrs.href;
        }
        state.parts.push({ text, href });
        return;
      }
      if (Array.isArray(node.content)) node.content.forEach(ch => walk(ch, state));
    }

    for (const block of root) {
      if (!block) continue;
      if (block.type === "paragraph") {
        const state = { parts: [] };
        walk(block, state);
        const combinedText = state.parts.map(p => p.text).join("").trim();
        if (combinedText) {
          const href = state.parts.find(p => p.href)?.href || null;
          items.push({ text: combinedText, href });
        }
      }
    }
    return items;
  }

  // ================== PLAIN SPELLS PARSING (для ручного редактирования) ==================
  function parseSpellsFromPlain(text) {
    if (typeof text !== "string") return [];

    const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const out = [];

    for (const line of lines) {
      // поддерживаем форматы:
      // 1) "Название | https://..."
      // 2) "Название https://..."
      // 3) "https://..."
      let t = line;
      let href = null;

      const partsPipe = t.split("|").map(s => s.trim()).filter(Boolean);
      if (partsPipe.length >= 2 && /^(https?:\/\/|manual:)/i.test(partsPipe[1])) {
        t = partsPipe[0];
        href = partsPipe[1];
      } else {
        const m = t.match(/(https?:\/\/[^\s]+)\s*$/i);
        if (m) {
          href = m[1];
          t = t.replace(m[1], "").trim();
        } else if (/^https?:\/\//i.test(t)) {
          href = t;
          t = t;
        }
      }

      out.push({ text: t || line, href: href || null });
    }

    return out;
  }

  // ================== MANUAL SHEET DEFAULT ==================
  function createEmptySheet(fallbackName = "-") {
    return {
      name: { value: fallbackName },
      info: {
        charClass: { value: "" },
        classArchetype: { value: "" },
        level: { value: 1 },
        race: { value: "" },
        raceArchetype: { value: "" },
        languagesLearned: [],
        background: { value: "" },
        alignment: { value: "" }
      },
      vitality: {
        "hp-max": { value: 0 },
        "hp-current": { value: 0 },
        "hp-temp": { value: 0 },
        ac: { value: 0 },
        speed: { value: 0 }
      },
      proficiency: 0,
      inspiration: 0,
      exhaustion: 0,
      conditions: "",
      stats: {
        str: { score: 10, modifier: 0, label: "Сила", check: 0 },
        dex: { score: 10, modifier: 0, label: "Ловкость", check: 0 },
        con: { score: 10, modifier: 0, label: "Телосложение", check: 0 },
        int: { score: 10, modifier: 0, label: "Интеллект", check: 0 },
        wis: { score: 10, modifier: 0, label: "Мудрость", check: 0 },
        cha: { score: 10, modifier: 0, label: "Харизма", check: 0 }
      },
      saves: {
        str: { isProf: false, bonus: 0 },
        dex: { isProf: false, bonus: 0 },
        con: { isProf: false, bonus: 0 },
        int: { isProf: false, bonus: 0 },
        wis: { isProf: false, bonus: 0 },
        cha: { isProf: false, bonus: 0 }
      },
      // Навыки должны существовать даже до загрузки .json (всё по 0)
      skills: {
        // STR
        athletics: { label: "Атлетика", baseStat: "str", isProf: 0, bonus: 0 },
        // DEX
        acrobatics: { label: "Акробатика", baseStat: "dex", isProf: 0, bonus: 0 },
        "sleight of hand": { label: "Ловкость рук", baseStat: "dex", isProf: 0, bonus: 0 },
        stealth: { label: "Скрытность", baseStat: "dex", isProf: 0, bonus: 0 },
        // INT
        arcana: { label: "Магия", baseStat: "int", isProf: 0, bonus: 0 },
        history: { label: "История", baseStat: "int", isProf: 0, bonus: 0 },
        investigation: { label: "Анализ", baseStat: "int", isProf: 0, bonus: 0 },
        nature: { label: "Природа", baseStat: "int", isProf: 0, bonus: 0 },
        religion: { label: "Религия", baseStat: "int", isProf: 0, bonus: 0 },
        // WIS
        "animal handling": { label: "Уход за животными", baseStat: "wis", isProf: 0, bonus: 0 },
        insight: { label: "Проницательность", baseStat: "wis", isProf: 0, bonus: 0 },
        medicine: { label: "Медицина", baseStat: "wis", isProf: 0, bonus: 0 },
        perception: { label: "Восприятие", baseStat: "wis", isProf: 0, bonus: 0 },
        survival: { label: "Выживание", baseStat: "wis", isProf: 0, bonus: 0 },
        // CHA
        deception: { label: "Обман", baseStat: "cha", isProf: 0, bonus: 0 },
        intimidation: { label: "Запугивание", baseStat: "cha", isProf: 0, bonus: 0 },
        performance: { label: "Выступление", baseStat: "cha", isProf: 0, bonus: 0 },
        persuasion: { label: "Убеждение", baseStat: "cha", isProf: 0, bonus: 0 }
      },
      bonusesSkills: {},
      bonusesStats: {},
      spellsInfo: {
        base: { code: "" },
        save: { customModifier: "" },
        mod: { customModifier: "" }
      },
      spells: {},
      personality: {
        backstory: { value: "" },
        allies: { value: "" },
        traits: { value: "" },
        ideals: { value: "" },
        bonds: { value: "" },
        flaws: { value: "" }
      },
      notes: {
        details: {
          gender: { value: "" },
          height: { value: "" },
          weight: { value: "" },
          age: { value: "" },
          eyes: { value: "" },
          skin: { value: "" },
          hair: { value: "" }
        },
        entries: []
      },
      text: {
        // Инвентарь: свободные заметки (редактируются во вкладке "Инвентарь")
        inventoryItems: { value: "" },
        inventoryTreasures: { value: "" }
      },
      combat: {
        // legacy textarea (оставляем для совместимости старых сохранений)
        skillsAbilities: { value: "" },
        // новый формат: список карточек умений/способностей
        abilitiesEntries: []
      },
      weaponsList: [],
      coins: { cp: { value: 0 }, sp: { value: 0 }, ep: { value: 0 }, gp: { value: 0 }, pp: { value: 0 } },
      // в какую монету пересчитывать общий итог (по умолчанию ЗМ)
      coinsView: { denom: "gp" },

      // ===== Инвентарь (структурированный, с вкладками как в базе) =====
      inventory: {
        activeTab: "weapons",
        weapons: [],
        armor: [],
        adventuring_gear: [],
        tools: [],
        mounts_animals: [],
        tack_vehicles: [],
        water_vehicles: [],
        trade_goods: [],
        lifestyle_expenses: [],
        other: []
      },

      // ===== Магазин (только UI-состояние) =====
      shop: {
        activeTab: "weapons"
      }
    };
  }

  function ensurePlayerSheetWrapper(player) {
    if (!player.sheet || typeof player.sheet !== "object") {
      player.sheet = { source: "manual", importedAt: Date.now(), raw: null, parsed: createEmptySheet(player.name) };
      return;
    }
    if (!player.sheet.parsed || typeof player.sheet.parsed !== "object") {
      player.sheet.parsed = createEmptySheet(player.name);
    }
  }

  // ================== CALC MODIFIERS ==================
  function getProfBonus(sheet) {
    return safeInt(sheet?.proficiency, 2) + safeInt(sheet?.proficiencyCustom, 0);
  }

  // ===== ВАЖНО: теперь "звезды" навыка = это boost (0/1/2), БЕЗ двойного суммирования =====
  // Поддержка старых файлов:
  // - если sheet.skills[skillKey].boostLevel есть -> используем его
  // - иначе используем sheet.skills[skillKey].isProf как уровень звезд (0/1/2), как у тебя в json
  function getSkillBoostLevel(sheet, skillKey) {
    const sk = sheet?.skills?.[skillKey];
    if (!sk || typeof sk !== "object") return 0;

    if (sk.boostLevel !== undefined && sk.boostLevel !== null) {
      const lvl = safeInt(sk.boostLevel, 0);
      return (lvl === 1 || lvl === 2) ? lvl : 0;
    }

    // fallback: isProf уже содержит 0/1/2 (звезды в файле)
    const legacy = safeInt(sk.isProf, 0);
    return (legacy === 1 || legacy === 2) ? legacy : 0;
  }

  function setSkillBoostLevel(sheet, skillKey, lvl) {
    if (!sheet.skills || typeof sheet.skills !== "object") sheet.skills = {};
    if (!sheet.skills[skillKey] || typeof sheet.skills[skillKey] !== "object") sheet.skills[skillKey] = {};
    sheet.skills[skillKey].boostLevel = lvl;

    // чтобы при повторной загрузке/экспорте и в других местах (если где-то ожидается isProf) не было рассинхрона:
    sheet.skills[skillKey].isProf = lvl;
  }

  function boostLevelToAdd(lvl, prof) {
    const p = safeInt(prof, 0);
    if (lvl === 1) return p;
    if (lvl === 2) return p * 2;
    return 0;
  }

  function boostLevelToStars(lvl) {
    if (lvl === 1) return "★";
    if (lvl === 2) return "★★";
    return "";
  }

  // Скилл-бонус: statMod + boostAdd (+ бонусы из sheet.skills[skillKey].bonus если есть)
  // (важно: никакого prof* по isProf — иначе снова будет двойное начисление)
  function calcSkillBonus(sheet, skillKey) {
    const skill = sheet?.skills?.[skillKey];
    const baseStat = skill?.baseStat;
    const statMod = safeInt(sheet?.stats?.[baseStat]?.modifier, 0);

    const extra = safeInt(skill?.bonus, 0); // если в файле есть отдельный бонус — учитываем
    const boostLevel = getSkillBoostLevel(sheet, skillKey);

    // ВАЖНО: звёзды навыков считаются от "владения" (proficiency):
    // 1 звезда = +proficiency, 2 звезды = +proficiency*2
    const prof = getProfBonus(sheet);

    return statMod + extra + boostLevelToAdd(boostLevel, prof);
  }

  function calcSaveBonus(sheet, statKey) {
    const prof = getProfBonus(sheet);
    const statMod = safeInt(sheet?.stats?.[statKey]?.modifier, 0);
    const save = sheet?.saves?.[statKey];
    const isProf = !!save?.isProf;
    const bonusExtra = safeInt(save?.bonus, 0);
    return statMod + (isProf ? prof : 0) + bonusExtra;
  }

  function calcCheckBonus(sheet, statKey) {
    const prof = getProfBonus(sheet);
    const statMod = safeInt(sheet?.stats?.[statKey]?.modifier, 0);
    const check = safeInt(sheet?.stats?.[statKey]?.check, 0);

    let bonus = statMod;
    if (check === 1) bonus += prof;
    if (check === 2) bonus += prof * 2;
    bonus += safeInt(sheet?.stats?.[statKey]?.checkBonus, 0);
    return bonus;
  }

  // ================== VIEW MODEL ==================
  function toViewModel(sheet, fallbackName = "-") {
    const name = get(sheet, 'name.value', fallbackName);
    const cls = get(sheet, 'info.charClass.value', '-');
    const lvl = get(sheet, 'info.level.value', '-');
    const race = get(sheet, 'info.race.value', '-');

    const hp = get(sheet, 'vitality.hp-max.value', '-');
    const hpCur = get(sheet, 'vitality.hp-current.value', '-');
    const hpTemp = get(sheet, 'vitality.hp-temp.value', 0);
    const ac = get(sheet, 'vitality.ac.value', '-');
    const spd = get(sheet, 'vitality.speed.value', '-');

    const inspiration = safeInt(get(sheet, 'inspiration', 0), 0) ? 1 : 0;
    const exhaustion = Math.max(0, Math.min(6, safeInt(get(sheet, 'exhaustion', 0), 0)));
    const conditions = (typeof get(sheet, 'conditions', "") === "string") ? get(sheet, 'conditions', "") : "";

    const statKeys = ["str","dex","con","int","wis","cha"];
    const stats = statKeys.map(k => {
      const s = sheet?.stats?.[k] || {};
      const label = s.label || ({ str:"Сила", dex:"Ловкость", con:"Телосложение", int:"Интеллект", wis:"Мудрость", cha:"Харизма" })[k];
      const score = safeInt(s.score, 10);
      const mod = safeInt(s.modifier, 0);
      const saveProf = !!(sheet?.saves?.[k]?.isProf);
      return { k, label, score, mod, check: calcCheckBonus(sheet, k), save: calcSaveBonus(sheet, k), saveProf, skills: [] };
    });

    // group skills under stats
    const skillsRaw = (sheet?.skills && typeof sheet.skills === "object") ? sheet.skills : {};
    for (const key of Object.keys(skillsRaw)) {
      const sk = skillsRaw[key];
      const baseStat = sk?.baseStat;
      const label = sk?.label || key;

      const boostLevel = getSkillBoostLevel(sheet, key);
      const bonus = calcSkillBonus(sheet, key);

      const statBlock = stats.find(s => s.k === baseStat);
      if (!statBlock) continue;

      statBlock.skills.push({
        key,
        label,
        bonus,
        boostLevel,
        boostStars: boostLevelToStars(boostLevel)
      });
    }
    stats.forEach(s => s.skills.sort((a,b) => a.label.localeCompare(b.label, 'ru')));

    // passive senses
    const passive = [
      { key: "perception", label: "Мудрость (Восприятие)" },
      { key: "insight", label: "Мудрость (Проницательность)" },
      { key: "investigation", label: "Интеллект (Анализ)" }
    ].map(x => {
      const skillBonus = (sheet?.skills?.[x.key]) ? calcSkillBonus(sheet, x.key) : 0;
      return { key: x.key, label: x.label, value: 10 + skillBonus };
    });

    // “прочие владения и заклинания” (редактируемый текст)
    const profDoc = sheet?.text?.prof?.value?.data;
    const profPlain = (sheet?.text?.profPlain?.value ?? sheet?.text?.profPlain ?? "");
    let profLines = tiptapToPlainLines(profDoc);
    // если нет tiptap-данных — используем редактируемый plain-text
    if ((!profLines || !profLines.length) && typeof profPlain === "string") {
      profLines = profPlain.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    }
    const profText = (typeof profPlain === "string" && profPlain.length)
      ? profPlain
      : (profLines && profLines.length ? profLines.join("\n") : "");
    const languagesHint = extractLanguagesHint(profText);
    const languagesLearned = normalizeLanguagesLearned(sheet?.info?.languagesLearned);

    // personality (редактируемые поля)
    const personality = {
      backstory: get(sheet, "personality.backstory.value", get(sheet, "info.background.value", "")),
      allies: get(sheet, "personality.allies.value", ""),
      traits: get(sheet, "personality.traits.value", ""),
      ideals: get(sheet, "personality.ideals.value", ""),
      bonds: get(sheet, "personality.bonds.value", ""),
      flaws: get(sheet, "personality.flaws.value", "")
    };

    // notes (детали + список заметок)
    const notesDetails = {
      height: get(sheet, "notes.details.height.value", ""),
      weight: get(sheet, "notes.details.weight.value", ""),
      age: get(sheet, "notes.details.age.value", ""),
      eyes: get(sheet, "notes.details.eyes.value", ""),
      skin: get(sheet, "notes.details.skin.value", ""),
      hair: get(sheet, "notes.details.hair.value", "")
    };
    const notesEntries = Array.isArray(sheet?.notes?.entries) ? sheet.notes.entries : [];

    // spells info + slots + lists
    const spellsInfo = {
      base: sheet?.spellsInfo?.base?.code || sheet?.spellsInfo?.base?.value || "",
      save: sheet?.spellsInfo?.save?.customModifier || sheet?.spellsInfo?.save?.value || "",
      mod: sheet?.spellsInfo?.mod?.customModifier || sheet?.spellsInfo?.mod?.value || ""
    };

    const slotsRaw = (sheet?.spells && typeof sheet.spells === "object") ? sheet.spells : {};
    const slots = [];
    for (let lvlN = 1; lvlN <= 9; lvlN++) {
      const k = `slots-${lvlN}`;
      const total = numLike(slotsRaw?.[k]?.value, 0);
      const filled = numLike(slotsRaw?.[k]?.filled, 0);
      slots.push({ level: lvlN, total, filled });
    }

    const text = (sheet?.text && typeof sheet.text === "object") ? sheet.text : {};

    // Всегда показываем уровни 0..9 даже без .json.
    // Поддерживаем 2 источника:
    // - tiptap: sheet.text["spells-level-N"].value.data
    // - plain:  sheet.text["spells-level-N-plain"].value (строка)  <-- редактируемый список
    const spellsByLevel = [];
    const spellsPlainByLevel = {};
    const spellNameByHref = {};
    const spellDescByHref = {};

    // кастомные описания/имена (добавленные кнопкой) сохраняем в sheet.text
    if (sheet?.text && typeof sheet.text === "object") {
      for (const k of Object.keys(sheet.text)) {
        if (!k) continue;
        if (k.startsWith("spell-name:")) {
          const href = k.slice("spell-name:".length);
          const val = sheet.text?.[k]?.value;
          if (href && typeof val === "string" && val.trim()) spellNameByHref[href] = val.trim();
        }
        if (k.startsWith("spell-desc:")) {
          const href = k.slice("spell-desc:".length);
          const val = sheet.text?.[k]?.value;
          // сохраняем даже пустую строку — чтобы пользователь мог очистить описание
          if (href && typeof val === "string") spellDescByHref[href] = val;
        }
      }
    }

    for (let lvlN = 0; lvlN <= 9; lvlN++) {
      const tipKey = `spells-level-${lvlN}`;
      const plainKey = `spells-level-${lvlN}-plain`;

      const tipItems = parseSpellsFromTiptap(text?.[tipKey]?.value?.data);
      const plainVal = (text?.[plainKey]?.value ?? text?.[plainKey] ?? "");
      const plainItems = parseSpellsFromPlain(plainVal);

      // сохраним plain текст для textarea (если его нет — сгенерим из tiptap, чтобы сразу можно было редактировать)
      if (typeof plainVal === "string" && plainVal.trim().length) {
        spellsPlainByLevel[lvlN] = plainVal;
      } else if (tipItems && tipItems.length) {
        spellsPlainByLevel[lvlN] = tipItems.map(it => (it.href ? `${it.text} | ${it.href}` : it.text)).join("\n");
      } else {
        spellsPlainByLevel[lvlN] = "";
      }

      // объединяем items (без умного дедупа — но уберём совсем очевидные повторы по (text+href))
      const merged = [];
      const seen = new Set();
      [...tipItems, ...plainItems].forEach(it => {
        const key = `${it?.text || ""}@@${it?.href || ""}`;
        if (!it?.text) return;
        if (seen.has(key)) return;
        seen.add(key);
        merged.push({ text: String(it.text), href: it.href ? String(it.href) : null });
      });

      spellsByLevel.push({ level: lvlN, items: merged });
    }

const weaponsRaw = Array.isArray(sheet?.weaponsList) ? sheet.weaponsList : [];

// нормализация текстовых полей (чтобы не ловить "[object Object]" и т.п.)
const normText = (x, fallback = "") => {
  if (x == null) return fallback;
  if (typeof x === "string") return x;
  if (typeof x === "number" || typeof x === "boolean") return String(x);
  if (typeof x === "object") {
    if ("value" in x) return normText(x.value, fallback);
    if ("name" in x && x.name && typeof x.name === "object" && "value" in x.name) return normText(x.name.value, fallback);
  }
  return fallback;
};

const parseLegacyDamage = (dmgStr) => {
  const s = normText(dmgStr, "").trim();
  // примеры: "1к6", "2к8 рубящий", "1к6+2 колющий" -> "+2" оставим в type
  const m = s.match(/(\d+)\s*(к\d+)\s*(.*)$/i);
  if (!m) return { dmgNum: 1, dmgDice: "к6", dmgType: s };
  const dmgNum = safeInt(m[1], 1);
  const dmgDice = m[2] ? String(m[2]).toLowerCase() : "к6";
  const dmgType = (m[3] || "").trim();
  return { dmgNum, dmgDice, dmgType };
};

const weapons = weaponsRaw
  .map((w, idx) => {
    // Новый формат оружия (создаётся в UI вкладки "Бой")
    const isNew = !!(w && typeof w === "object" && (
      "ability" in w || "prof" in w || "extraAtk" in w || "dmgNum" in w || "dmgDice" in w || "dmgType" in w || "desc" in w || "collapsed" in w
    ));

    if (isNew) {
      // FIX: приводим строковые поля к строкам (в т.ч. dmgType)
      const normalized = {
        ...w,
        name: normText(w?.name, "-"),
        ability: normText(w?.ability, "str"),
        prof: !!w?.prof,
        extraAtk: safeInt(w?.extraAtk, 0),
        dmgNum: safeInt(w?.dmgNum, 1),
        dmgDice: normText(w?.dmgDice, "к6"),
        dmgType: normText(w?.dmgType, ""),
        desc: normText(w?.desc, ""),
        collapsed: !!w?.collapsed,
        invId: normText(w?.invId, "")
      };
      // (необязательно, но полезно) — подправим исходник, чтобы дальше не всплывал [object Object]
      weaponsRaw[idx] = normalized;

      return { kind: "new", idx, ...normalized };
    }

    // Legacy формат из некоторых json (name + mod + dmg) -> конвертируем В СХЕМУ UI (чтобы работали Показать/Удалить)
    const legacyName = normText(w?.name, "-");
    const legacyAtk = normText(w?.mod, "0");
    const parsed = parseLegacyDamage(w?.dmg);

    const converted = {
      name: legacyName,
      ability: "str",
      prof: false,
      extraAtk: parseModInput(legacyAtk, 0),
      dmgNum: parsed.dmgNum,
      dmgDice: parsed.dmgDice,
      dmgType: parsed.dmgType,
      desc: "",
      collapsed: true
    };

    // ВАЖНО: записываем обратно в sheet.weaponsList, иначе bindCombatEditors не сможет управлять legacy-оружием
    weaponsRaw[idx] = converted;

    return { kind: "new", idx, ...converted };
  })
  .filter(w => w.name && w.name !== "-");

    const coinsRaw = sheet?.coins && typeof sheet.coins === "object" ? sheet.coins : null;
    const coins = coinsRaw ? { cp: v(coinsRaw.cp, 0), sp: v(coinsRaw.sp, 0), ep: v(coinsRaw.ep, 0), gp: v(coinsRaw.gp, 0), pp: v(coinsRaw.pp, 0) } : null;

    const coinsViewDenom = String(sheet?.coinsView?.denom || "gp").toLowerCase();

    const combatAbilitiesEntries = Array.isArray(sheet?.combat?.abilitiesEntries)
      ? sheet.combat.abilitiesEntries
      : [];


    const inv = (sheet?.inventory && typeof sheet.inventory === "object") ? sheet.inventory : null;
    const shop = (sheet?.shop && typeof sheet.shop === "object") ? sheet.shop : null;

    return {
      name, cls, lvl, race,
      hp, hpCur, hpTemp, ac, spd,
      inspiration, exhaustion, conditions,
      stats, passive,
      profLines, profText, languagesHint, languagesLearned,
      personality, notesDetails, notesEntries,
      spellsInfo, slots, spellsByLevel, spellsPlainByLevel, spellNameByHref, spellDescByHref,
      profBonus: getProfBonus(sheet),
      weapons, combatAbilitiesEntries,
      coins, coinsViewDenom,
      inventory: inv,
      shop
    };
  }

  // ================== SHEET UPDATE HELPERS ==================
  function setByPath(obj, path, value) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      if (!cur[k] || typeof cur[k] !== "object") cur[k] = {};
      cur = cur[k];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function getByPath(obj, path) {
    try { return path.split('.').reduce((acc, k) => (acc ? acc[k] : undefined), obj); }
    catch { return undefined; }
  }

  function scheduleSheetSave(player) {
    if (!player?.id || !ctx?.sendMessage) return;

    const key = player.id;
    const prev = sheetSaveTimers.get(key);
    if (prev) clearTimeout(prev);

    const t = setTimeout(() => {
      ctx.sendMessage({ type: "setPlayerSheet", id: player.id, sheet: player.sheet });
      sheetSaveTimers.delete(key);
    }, 450);

    sheetSaveTimers.set(key, t);
  }

  // ===== Coins helpers =====
  const COIN_TO_CP = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };

  function setCoinsFromTotalCp(sheet, totalCp) {
    if (!sheet) return;
    const t = Math.max(0, safeInt(totalCp, 0));
    if (!sheet.coins || typeof sheet.coins !== "object") sheet.coins = {};
    if (!sheet.coins.cp) sheet.coins.cp = { value: 0 };
    if (!sheet.coins.sp) sheet.coins.sp = { value: 0 };
    if (!sheet.coins.ep) sheet.coins.ep = { value: 0 };
    if (!sheet.coins.gp) sheet.coins.gp = { value: 0 };
    if (!sheet.coins.pp) sheet.coins.pp = { value: 0 };

    let left = t;
    const pp = Math.floor(left / COIN_TO_CP.pp); left -= pp * COIN_TO_CP.pp;
    const gp = Math.floor(left / COIN_TO_CP.gp); left -= gp * COIN_TO_CP.gp;
    const ep = Math.floor(left / COIN_TO_CP.ep); left -= ep * COIN_TO_CP.ep;
    const sp = Math.floor(left / COIN_TO_CP.sp); left -= sp * COIN_TO_CP.sp;
    const cp = left;

    sheet.coins.pp.value = pp;
    sheet.coins.gp.value = gp;
    sheet.coins.ep.value = ep;
    sheet.coins.sp.value = sp;
    sheet.coins.cp.value = cp;
  }

  function coinsTotalCp(sheet) {
    const cp = safeInt(sheet?.coins?.cp?.value, 0);
    const sp = safeInt(sheet?.coins?.sp?.value, 0);
    const ep = safeInt(sheet?.coins?.ep?.value, 0);
    const gp = safeInt(sheet?.coins?.gp?.value, 0);
    const pp = safeInt(sheet?.coins?.pp?.value, 0);
    return cp * 1 + sp * 10 + ep * 50 + gp * 100 + pp * 1000;
  }

  function fmtCoinNumber(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) return "0";
    const rounded = Math.round(n * 100) / 100;
    return (Math.abs(rounded - Math.round(rounded)) < 1e-9)
      ? String(Math.round(rounded))
      : String(rounded);
  }

  function updateCoinsTotal(root, sheet) {
    if (!root || !sheet) return;
    const out = root.querySelector('[data-coins-total]');
    if (!out) return;

    let denom = String(sheet?.coinsView?.denom || "gp").toLowerCase();
    const denomSel = root.querySelector('[data-coins-total-denom]');
    if (denomSel && denomSel.value) denom = String(denomSel.value).toLowerCase();

    const base = COIN_TO_CP[denom] || 100;
    const total = coinsTotalCp(sheet) / base;
    out.value = fmtCoinNumber(total);
  }
