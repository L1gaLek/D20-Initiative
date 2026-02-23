/* sheet-utils.js — вынесено из info-dnd-player.js */

// UI-состояние модалки (чтобы обновления state не сбрасывали вкладку/скролл)
// Map<playerId, { activeTab: string, scrollTopByTab: Record<string, number>, lastInteractAt: number }>
const uiStateByPlayerId = new Map();

// debounce save timers
const sheetSaveTimers = new Map();

// ================== UTILS ==================
function v(x, fallback = "-") {
  if (x && typeof x === "object") {
    if ("value" in x) return (x.value ?? fallback);
    if ("name" in x && x.name && typeof x.name === "object" && "value" in x.name) return (x.name.value ?? fallback);
  }
  return (x ?? fallback);
}

function get(obj, path, fallback = "-") {
  try {
    const raw = path.split('.').reduce((acc, k) => (acc ? acc[k] : undefined), obj);
    return v(raw, fallback);
  } catch {
    return fallback;
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMod(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n);
  return x >= 0 ? `+${x}` : `${x}`;
}

function abilityModFromScore(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return 0;
  // D&D 5e: modifier = floor((score - 10) / 2)
  return Math.floor((s - 10) / 2);
}

function safeInt(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

// Иногда числа приходят в виде { value: n }
function numLike(x, fallback = 0) {
  if (x && typeof x === "object" && "value" in x) return safeInt(x.value, fallback);
  return safeInt(x, fallback);
}
function setMaybeObjField(obj, field, n) {
  if (!obj || typeof obj !== "object") return;
  const cur = obj[field];
  if (cur && typeof cur === "object" && ("value" in cur)) {
    cur.value = n;
  } else {
    obj[field] = n;
  }
}




// D&D 5e: модификатор = floor((score - 10) / 2), ограничиваем 1..30
function scoreToModifier(score) {
  const s = Math.max(1, Math.min(30, safeInt(score, 10)));
  const m = Math.floor((s - 10) / 2);
  // для надёжности ограничим диапазон -5..+10
  return Math.max(-5, Math.min(10, m));
}

// принимает "+3", "-1", "3", "" -> number
function parseModInput(str, fallback = 0) {
  if (str == null) return fallback;
  const t = String(str).trim();
  if (!t) return fallback;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}


// Спелл-метрики: авто-формула бонуса атаки (проф. + модификатор выбранной характеристики)
function computeSpellAttack(sheet) {
  const base = String(sheet?.spellsInfo?.base?.code || sheet?.spellsInfo?.base?.value || "int").trim() || "int";
  const prof = getProfBonus(sheet);
  const score = safeInt(sheet?.stats?.[base]?.score, 10);
  const mod = scoreToModifier(score);
  return prof + mod;
}

// ================== ARMOR CLASS (AC) AUTO FROM EQUIPMENT ==================
// Stores editable rules under:
// sheet.appearance.armorRules  (for worn armor)
// sheet.appearance.shieldRules (for equipped shield)
//
// armorRules: { kind: 'armor', base: number, modStat: 'dex'|'-', max: number|'' , sourceId: string }
// shieldRules: { kind: 'shield', bonus: number, sourceId: string }

function ensureAppearanceObj(sheet) {
  if (!sheet || typeof sheet !== 'object') return null;
  if (!sheet.appearance || typeof sheet.appearance !== 'object') sheet.appearance = {};
  if (!sheet.appearance.slots || typeof sheet.appearance.slots !== 'object') {
    sheet.appearance.slots = { right: '', left: '', shield: '', armor: '' };
  }
  return sheet.appearance;
}

function invFindByIdOrName(arr, idOrName) {
  const key = String(idOrName || '').trim();
  if (!key) return null;
  const byId = arr.find(it => it && typeof it === 'object' && String(it.id || '') === key);
  if (byId) return byId;
  // legacy: stored name
  const keyLc = key.toLowerCase();
  return arr.find(it => {
    const n = String(it?.name_ru || it?.name || it?.title || it?.name_en || '').trim().toLowerCase();
    return n && n === keyLc;
  }) || null;
}

function parseAcNumber(x, fallback = 0) {
  const t = String(x ?? '').trim();
  if (!t) return fallback;
  // supports: "18", "+2", " + 1 "
  const m = t.match(/([+-]?\d+)/);
  if (!m) return fallback;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : fallback;
}

function defaultArmorRulesFromItem(item) {
  const a = item?.armor;
  const type = String(a?.type || '').toLowerCase();
  // base AC
  const base = parseAcNumber(a?.ac, 2);
  // Determine dex contribution from armor type
  // light: add Dex (no max)
  // medium: add Dex (max 2)
  // heavy: no Dex
  if (type === 'light') return { base, modStat: 'dex', max: null };
  if (type === 'medium') return { base, modStat: 'dex', max: 2 };
  if (type === 'heavy') return { base, modStat: '-', max: null };
  // fallback: keep only base
  return { base, modStat: '-', max: null };
}

function defaultShieldRulesFromItem(item) {
  const a = item?.armor;
  const bonus = 2;
  return { bonus };
}

function normalizeEquipSlotValueToId(sheet, slotKey, invArr) {
  const ap = ensureAppearanceObj(sheet);
  if (!ap) return '';
  const cur = String(ap?.slots?.[slotKey] || '').trim();
  if (!cur) return '';
  // already id?
  const byId = invArr.find(it => it && typeof it === 'object' && String(it.id || '') === cur);
  if (byId) return cur;
  const byName = invFindByIdOrName(invArr, cur);
  if (byName?.id) {
    ap.slots[slotKey] = String(byName.id);
    return String(byName.id);
  }
  return cur;
}

// Applies default rules when equipped item changes, but preserves manual edits while the same item stays equipped.
function syncArmorRulesFromEquipped(sheet) {
  if (!sheet || typeof sheet !== 'object') return;
  const ap = ensureAppearanceObj(sheet);
  if (!ap) return;
  const invArmor = Array.isArray(sheet?.inventory?.armor) ? sheet.inventory.armor : [];

  const armorSel = normalizeEquipSlotValueToId(sheet, 'armor', invArmor);
  const shieldSel = normalizeEquipSlotValueToId(sheet, 'shield', invArmor);

  // Worn armor (non-shield)
  const armorItem = invFindByIdOrName(invArmor, armorSel);
  const armorIsShield = String(armorItem?.armor?.type || '').toLowerCase() === 'shield' || /щит/i.test(String(armorItem?.name_ru || armorItem?.name || ''));

  if (!ap.armorRules || typeof ap.armorRules !== 'object') ap.armorRules = {};
  // New: optional AC bonus from proficiency when wearing armor (toggle in Appearance)
  if (typeof ap.armorRules.addProf !== 'boolean') ap.armorRules.addProf = false;
  if (!armorItem || armorIsShield) {
    // no worn armor selected (or selected is a shield by mistake)
    ap.armorRules.sourceId = '';
  } else {
    const src = String(armorItem.id || '').trim();
    if (String(ap.armorRules.sourceId || '') !== src) {
      const def = defaultArmorRulesFromItem(armorItem);
      ap.armorRules.kind = 'armor';
      ap.armorRules.base = def.base;
      ap.armorRules.modStat = def.modStat;
      ap.armorRules.max = (def.max === null) ? '' : def.max;
      ap.armorRules.sourceId = src;
    }
  }

  // Shield
  const shieldItem = invFindByIdOrName(invArmor, shieldSel);
  const shieldOk = shieldItem && (String(shieldItem?.armor?.type || '').toLowerCase() === 'shield' || /щит/i.test(String(shieldItem?.name_ru || shieldItem?.name || '')));

  if (!ap.shieldRules || typeof ap.shieldRules !== 'object') ap.shieldRules = {};
  if (!shieldOk) {
    ap.shieldRules.sourceId = '';
  } else {
    const src = String(shieldItem.id || '').trim();
    const bonusEmpty = (ap.shieldRules.bonus === '' || ap.shieldRules.bonus === null || ap.shieldRules.bonus === undefined);
    if (String(ap.shieldRules.sourceId || '') !== src || bonusEmpty) {
      const def = defaultShieldRulesFromItem(shieldItem);
      ap.shieldRules.kind = 'shield';
      ap.shieldRules.bonus = def.bonus;
      ap.shieldRules.sourceId = src;
    }
  }
}

function computeAutoAcFromEquipment(sheet) {
  if (!sheet || typeof sheet !== 'object') return null;
  const ap = ensureAppearanceObj(sheet);
  if (!ap) return null;

  const invArmor = Array.isArray(sheet?.inventory?.armor) ? sheet.inventory.armor : [];
  const armorSel = String(ap?.slots?.armor || '').trim();
  const shieldSel = String(ap?.slots?.shield || '').trim();
  const armorItem = invFindByIdOrName(invArmor, armorSel);
  const shieldItem = invFindByIdOrName(invArmor, shieldSel);

  const hasArmor = !!armorItem && String(armorItem?.armor?.type || '').toLowerCase() !== 'shield' && !/щит/i.test(String(armorItem?.name_ru || armorItem?.name || ''));
  const hasShield = !!shieldItem && (String(shieldItem?.armor?.type || '').toLowerCase() === 'shield' || /щит/i.test(String(shieldItem?.name_ru || shieldItem?.name || '')));
  if (!hasArmor && !hasShield) return null; // nothing equipped -> don't override manual AC

  const dexMod = safeInt(sheet?.stats?.dex?.modifier, scoreToModifier(safeInt(sheet?.stats?.dex?.score, 10)));

  // base
  // If only a shield is equipped (no armor selected), user expects the shield to add
  // to whatever AC is already shown in the "Броня" frame (manual/previous value),
  // rather than recomputing from 10 + Dex.
  let base = 10;
  let dexBonus = dexMod;

  const ruleNum = (raw, fallback) => {
    // IMPORTANT: empty string should mean "use fallback" (not 0)
    if (raw === '' || raw === null || raw === undefined) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };

  if (hasArmor) {
    const baseRule = ruleNum(ap?.armorRules?.base, parseAcNumber(armorItem?.armor?.ac, 10));
    base = baseRule || 10;

    const modStat = String(ap?.armorRules?.modStat || '-').trim();
    if (modStat === '-' || !modStat) {
      dexBonus = 0;
    } else {
      const mod = safeInt(sheet?.stats?.[modStat]?.modifier, 0);
      const maxRaw = ap?.armorRules?.max;
      const hasMax = (maxRaw !== '' && maxRaw !== null && maxRaw !== undefined);
      const max = hasMax ? ruleNum(maxRaw, 0) : null;
      dexBonus = (max === null) ? mod : Math.min(mod, max);
    }
  }

  // Shield without armor: add shield bonus on top of current AC value.
  // (Dex bonus shouldn't be re-applied here; the user may have a manual AC setup.)
  if (!hasArmor && hasShield) {
    base = safeInt(sheet?.vitality?.ac?.value, 10);
    dexBonus = 0;
  }

  // shield bonus
  // Shield bonus must work even if bonus input is empty (''), so we treat '' as "use fallback".
  const shieldBonus = hasShield ? ruleNum(ap?.shieldRules?.bonus, parseAcNumber(shieldItem?.armor?.ac, 2)) : 0;

  // Armor proficiency toggle removed from UI; keep this always 0 for backwards compatibility.
  const profBonus = 0;

  const total = Math.max(0, Math.trunc(base + dexBonus + shieldBonus + profBonus));
  return total;
}

function applyAutoAcToSheet(sheet) {
  if (!sheet || typeof sheet !== 'object') return;
  syncArmorRulesFromEquipped(sheet);
  const ac = computeAutoAcFromEquipment(sheet);
  if (ac === null) return;
  if (!sheet.vitality || typeof sheet.vitality !== 'object') sheet.vitality = {};
  if (!sheet.vitality.ac || typeof sheet.vitality.ac !== 'object') sheet.vitality.ac = { value: 10 };
  sheet.vitality.ac.value = ac;
}

// expose for other modules
window.__equipAc = window.__equipAc || {};
window.__equipAc.applyAutoAcToSheet = applyAutoAcToSheet;
window.__equipAc.computeAutoAcFromEquipment = computeAutoAcFromEquipment;
