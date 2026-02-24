  // ================== HP POPUP ==================
  let hpPopupEl = null;

  // snapshot of latest players array (to avoid stale closures after .json import / refresh)
  let lastPlayersSnapshot = [];

  function rememberPlayersSnapshot(players) {
    if (Array.isArray(players)) lastPlayersSnapshot = players;
  }

  function getOpenedPlayerSafe() {
    if (!openedSheetPlayerId) return null;
    return (lastPlayersSnapshot || []).find(x => x && x.id === openedSheetPlayerId) || null;
  }

  function ensureHpPopup() {
    if (hpPopupEl) return hpPopupEl;

    hpPopupEl = document.createElement('div');
    hpPopupEl.className = 'hp-popover hidden';
    hpPopupEl.innerHTML = `
      <div class="hp-popover__backdrop" data-hp-close></div>
      <div class="hp-popover__panel" role="dialog" aria-label="Здоровье" aria-modal="false">
        <div class="hp-popover__head">
          <div class="hp-popover__title">Здоровье</div>
          <button class="hp-popover__x" type="button" data-hp-close title="Закрыть">✕</button>
        </div>

        <div class="hp-popover__grid">
          <div class="hp-row">
            <div class="hp-label">Здоровье макс.</div>
            <input class="hp-input" type="number" min="0" max="999" step="1" data-hp-field="max">
          </div>
          <div class="hp-row">
            <div class="hp-label">Здоровья осталось</div>
            <input class="hp-input" type="number" min="0" max="999" step="1" data-hp-field="cur">
          </div>
          <div class="hp-row">
            <div class="hp-label">Временное здоровье</div>
            <input class="hp-input" type="number" min="0" max="999" step="1" data-hp-field="temp">
          </div>

          <div class="hp-row hp-row--hitdice">
            <div class="hp-label">Кость здоровья</div>
            <div class="hp-hitdice">
              <select class="hp-select" data-hp-field="hdSides" title="Тип кости здоровья">
                <option value="4">к4</option>
                <option value="6">к6</option>
                <option value="8">к8</option>
                <option value="10">к10</option>
                <option value="12">к12</option>
              </select>

              <button class="hp-hitdice-btn" type="button" data-hp-hitdice-roll title="Бросить кость здоровья">
                <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
                  <path d="M12 2 20.5 7v10L12 22 3.5 17V7L12 2Z" fill="rgb(138,0,0)" opacity="0.96"></path>
                  <path d="M12 2v20M3.5 7l8.5 5 8.5-5M3.5 17l8.5-5 8.5 5" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1.2"></path>
                </svg>
              </button>

              <div class="hp-hitdice-total">
                <div class="hp-hitdice-total__label">Всего костей здоровья</div>
                <input class="hp-input hp-input--small" type="number" min="0" max="99" step="1" data-hp-field="hdTotal">
              </div>
            </div>
          </div>

          <div class="hp-divider"></div>

          <div class="hp-row hp-row--delta">
            <div class="hp-label">Изменить здоровье</div>
            <div class="hp-delta">
              <button class="hp-delta__btn" type="button" data-hp-delta="-">−</button>
              <input class="hp-input hp-input--delta" type="number" min="0" max="999" step="1" value="0" data-hp-field="delta">
              <button class="hp-delta__btn" type="button" data-hp-delta="+">+</button>
            </div>
            <div class="hp-note">Ограничение: 0…максимум</div>
          </div>
        </div>
      </div>
    `;
    sheetModal?.appendChild(hpPopupEl);
    setHpPopupEditable(!!lastCanEdit);

    // close / delta buttons
    hpPopupEl.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;

      if (t.closest('[data-hp-close]')) {
        hideHpPopup();
        return;
      }

      const deltaBtn = t.closest('[data-hp-delta]');
      if (deltaBtn) {
        const sign = deltaBtn.getAttribute('data-hp-delta');
        applyHpDelta(sign === '+' ? +1 : -1);
        return;
      }

      const rollBtn = t.closest('[data-hp-hitdice-roll]');
      if (rollBtn) {
        rollHitDieAndAddToMaxHp();
      }
    });

    // escape closes
    hpPopupEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideHpPopup();
    });

    // change/select updates
    hpPopupEl.addEventListener('change', (e) => {
      const el = e.target;
      if (!(el instanceof HTMLElement)) return;

      const f = el.getAttribute('data-hp-field');
      if (!f) return;
      if (!lastCanEdit) return;

      if (f === 'hdSides') {
        const player = getOpenedPlayerSafe();
        if (!player) return;
        const sheet = player.sheet?.parsed;
        if (!sheet) return;
        if (!sheet.vitality) sheet.vitality = {};
        if (!sheet.vitality["hit-die-sides"]) sheet.vitality["hit-die-sides"] = { value: 8 };
        const v = Math.max(4, Math.min(12, Math.trunc(Number((el instanceof HTMLSelectElement) ? el.value : 8) || 8)));
        sheet.vitality["hit-die-sides"].value = v;
        markModalInteracted(player.id);
        scheduleSheetSave(player);
      }
    });

    // inputs update sheet (always use current opened player from snapshot)
    hpPopupEl.addEventListener('input', (e) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement)) return;

      const f = el.getAttribute('data-hp-field');
      if (!f || f === 'delta') return;
      if (!lastCanEdit) return;

      const player = getOpenedPlayerSafe();
      if (!player) return;
      const sheet = player.sheet?.parsed;
      if (!sheet) return;

      if (!sheet.vitality) sheet.vitality = {};
      if (!sheet.vitality["hp-max"]) sheet.vitality["hp-max"] = { value: 0 };
      if (!sheet.vitality["hp-current"]) sheet.vitality["hp-current"] = { value: 0 };
      if (!sheet.vitality["hp-temp"]) sheet.vitality["hp-temp"] = { value: 0 };
      if (!sheet.vitality["hit-die-sides"]) sheet.vitality["hit-die-sides"] = { value: 8 };
      if (!sheet.vitality["hit-dice-total"]) sheet.vitality["hit-dice-total"] = { value: 0 };

      if (f === 'hdTotal') {
        const v = Math.max(0, Math.min(99, Math.trunc(Number(el.value) || 0)));
        sheet.vitality["hit-dice-total"].value = v;
        // синхронизируем вид
        const hdTotalEl = hpPopupEl.querySelector('[data-hp-field="hdTotal"]');
        if (hdTotalEl && hdTotalEl !== el) hdTotalEl.value = String(v);
        markModalInteracted(player.id);
        scheduleSheetSave(player);
        return;
      }

      const maxEl = hpPopupEl.querySelector('[data-hp-field="max"]');
      const curEl = hpPopupEl.querySelector('[data-hp-field="cur"]');
      const tempEl = hpPopupEl.querySelector('[data-hp-field="temp"]');

      const max = Number(maxEl?.value ?? sheet.vitality["hp-max"].value) || 0;
      const cur = Number(curEl?.value ?? sheet.vitality["hp-current"].value) || 0;
      const temp = Number(tempEl?.value ?? sheet.vitality["hp-temp"].value) || 0;

      const clampedMax = Math.max(0, Math.trunc(max));
      const clampedCur = Math.max(0, Math.min(clampedMax, Math.trunc(cur)));
      const clampedTemp = Math.max(0, Math.trunc(temp));

      sheet.vitality["hp-max"].value = clampedMax;
      sheet.vitality["hp-current"].value = clampedCur;
      sheet.vitality["hp-temp"].value = clampedTemp;

      syncHpPopupInputs(sheet);
      markModalInteracted(player.id);
      scheduleSheetSave(player);
      if (sheetContent) updateHeroChips(sheetContent, sheet);
    });

    return hpPopupEl;
  }

  function getConModifierFromScore(score) {
    const s = Number(score);
    if (!Number.isFinite(s)) return 0;
    // D&D: (score - 10) / 2 округление вниз
    return Math.floor((Math.trunc(s) - 10) / 2);
  }

  async function rollHitDieAndAddToMaxHp() {
    if (!hpPopupEl) return;
    if (!lastCanEdit) return;
    const player = getOpenedPlayerSafe();
    if (!player) return;
    const sheet = player.sheet?.parsed;
    if (!sheet) return;

    if (!sheet.vitality) sheet.vitality = {};
    if (!sheet.vitality["hp-max"]) sheet.vitality["hp-max"] = { value: 0 };
    if (!sheet.vitality["hp-current"]) sheet.vitality["hp-current"] = { value: 0 };
    if (!sheet.vitality["hp-temp"]) sheet.vitality["hp-temp"] = { value: 0 };
    if (!sheet.vitality["hit-die-sides"]) sheet.vitality["hit-die-sides"] = { value: 8 };

    const sel = hpPopupEl.querySelector('[data-hp-field="hdSides"]');
    const sides = Math.max(4, Math.min(12, Math.trunc(Number((sel instanceof HTMLSelectElement) ? sel.value : sheet.vitality["hit-die-sides"].value) || 8)));
    sheet.vitality["hit-die-sides"].value = sides;

    const conScore = sheet?.stats?.con?.score;
    const conMod = getConModifierFromScore(conScore);

    // Бросок через общую панель кубиков — чтобы результат попал в:
    // 1) "Бросок" 2) "Броски других" 3) журнал действий
    let rollTotal = null;
    if (window.DicePanel?.roll) {
      const kindText = `Кость здоровья: d${sides}${conMod ? formatMod(conMod) : ''}`;
      const res = await window.DicePanel.roll({ sides, count: 1, bonus: conMod, kindText });
      rollTotal = Number(res?.total);
    }

    // fallback (если DicePanel недоступен)
    if (!Number.isFinite(rollTotal)) {
      const die = Math.floor(Math.random() * sides) + 1;
      rollTotal = die + conMod;
    }

    const add = Math.max(0, Math.trunc(rollTotal));

    const curMax = Number(sheet.vitality["hp-max"].value) || 0;
    const newMax = Math.max(0, Math.trunc(curMax + add));
    sheet.vitality["hp-max"].value = newMax;

    // если текущее > нового максимума — прижимаем
    const curCur = Number(sheet.vitality["hp-current"].value) || 0;
    if (curCur > newMax) sheet.vitality["hp-current"].value = newMax;

    syncHpPopupInputs(sheet);
    markModalInteracted(player.id);
    scheduleSheetSave(player);
    if (sheetContent) updateHeroChips(sheetContent, sheet);
  }

  function syncHpPopupInputs(sheet) {
    if (!hpPopupEl || !sheet) return;
    const max = Number(sheet?.vitality?.["hp-max"]?.value) || 0;
    const cur = Number(sheet?.vitality?.["hp-current"]?.value) || 0;
    const temp = Number(sheet?.vitality?.["hp-temp"]?.value) || 0;
    const hdSides = Number(sheet?.vitality?.["hit-die-sides"]?.value) || 8;
    const hdTotal = Number(sheet?.vitality?.["hit-dice-total"]?.value) || 0;

    const maxEl = hpPopupEl.querySelector('[data-hp-field="max"]');
    const curEl = hpPopupEl.querySelector('[data-hp-field="cur"]');
    const tempEl = hpPopupEl.querySelector('[data-hp-field="temp"]');
    const hdSidesEl = hpPopupEl.querySelector('[data-hp-field="hdSides"]');
    const hdTotalEl = hpPopupEl.querySelector('[data-hp-field="hdTotal"]');

    if (maxEl) maxEl.value = String(max);
    if (curEl) curEl.value = String(cur);
    if (tempEl) tempEl.value = String(temp);
    if (hdSidesEl && hdSidesEl instanceof HTMLSelectElement) {
      const v = String(Math.max(4, Math.min(12, Math.trunc(hdSides) || 8)));
      hdSidesEl.value = v;
    }
    if (hdTotalEl && hdTotalEl instanceof HTMLInputElement) hdTotalEl.value = String(Math.max(0, Math.min(99, Math.trunc(hdTotal) || 0)));
  }

  function setHpPopupEditable(can) {
    if (!hpPopupEl) return;
    const inputs = hpPopupEl.querySelectorAll('input.hp-input');
    inputs.forEach(inp => {
      const isDelta = inp.getAttribute('data-hp-field') === 'delta';
      // delta input можно менять всем, но кнопки применения/изменения - только редактору
      if (!can && !isDelta) inp.setAttribute('disabled', 'disabled');
      else inp.removeAttribute('disabled');
    });

    const selects = hpPopupEl.querySelectorAll('select.hp-select');
    selects.forEach(sel => {
      if (!can) sel.setAttribute('disabled', 'disabled');
      else sel.removeAttribute('disabled');
    });

    const rollBtn = hpPopupEl.querySelector('.hp-hitdice-btn');
    if (rollBtn) {
      if (!can) rollBtn.setAttribute('disabled', 'disabled');
      else rollBtn.removeAttribute('disabled');
    }

    const btns = hpPopupEl.querySelectorAll('.hp-delta__btn');
    btns.forEach(b => {
      if (!can) b.setAttribute('disabled', 'disabled');
      else b.removeAttribute('disabled');
    });
  }

  function showHpPopup() {
    const el = ensureHpPopup();
    const player = getOpenedPlayerSafe();
    if (!player) return;
    const sheet = player.sheet?.parsed;
    if (!sheet) return;

    if (!sheet.vitality) sheet.vitality = {};
    if (!sheet.vitality["hp-max"]) sheet.vitality["hp-max"] = { value: 0 };
    if (!sheet.vitality["hp-current"]) sheet.vitality["hp-current"] = { value: 0 };
    if (!sheet.vitality["hp-temp"]) sheet.vitality["hp-temp"] = { value: 0 };
    if (!sheet.vitality["hit-die-sides"]) sheet.vitality["hit-die-sides"] = { value: 8 };
    if (!sheet.vitality["hit-dice-total"]) sheet.vitality["hit-dice-total"] = { value: 0 };

    syncHpPopupInputs(sheet);
    setHpPopupEditable(!!lastCanEdit);
    el.classList.remove('hidden');

    const first = el.querySelector('[data-hp-field="cur"]');
    first?.focus?.();
  }

  function hideHpPopup() {
    hpPopupEl?.classList.add('hidden');
  }

  function applyHpDelta(mult) {
    if (!lastCanEdit) return;
    const player = getOpenedPlayerSafe();
    if (!player) return;
    const sheet = player.sheet?.parsed;
    if (!sheet?.vitality) return;

    const deltaEl = hpPopupEl?.querySelector('[data-hp-field="delta"]');
    const delta = Math.max(0, Math.trunc(Number(deltaEl?.value ?? 0) || 0));
    if (!delta) return;

    if (!sheet.vitality["hp-max"]) sheet.vitality["hp-max"] = { value: 0 };
    if (!sheet.vitality["hp-current"]) sheet.vitality["hp-current"] = { value: 0 };
    if (!sheet.vitality["hp-temp"]) sheet.vitality["hp-temp"] = { value: 0 };

    const max = Number(sheet?.vitality?.["hp-max"]?.value) || 0;
    const cur = Number(sheet?.vitality?.["hp-current"]?.value) || 0;
    const temp = Number(sheet?.vitality?.["hp-temp"]?.value) || 0;

    // mult: +1 = heal current (temp НЕ пополняется кнопкой "+")
    // mult: -1 = damage (сначала снимаем временные хиты, затем текущее здоровье)
    let nextCur = cur;
    let nextTemp = temp;

    if (mult > 0) {
      nextCur = Math.max(0, Math.min(max, cur + delta));
      // temp unchanged
    } else {
      const spentTemp = Math.min(temp, delta);
      nextTemp = Math.max(0, temp - delta);
      const remaining = Math.max(0, delta - spentTemp);
      nextCur = Math.max(0, Math.min(max, cur - remaining));
    }

    sheet.vitality["hp-current"].value = nextCur;
    sheet.vitality["hp-temp"].value = nextTemp;

    syncHpPopupInputs(sheet);
    markModalInteracted(player.id);
    scheduleSheetSave(player);
    if (sheetContent) updateHeroChips(sheetContent, sheet);
  }
  
  // ================== EXHAUSTION + CONDITIONS POPUPS ==================
  let exhPopupEl = null;
  let condPopupEl = null;

  const EXHAUSTION_LEVELS = [
    { lvl: 0, text: "Истощение отсутствует" },
    { lvl: 1, text: "Помеха на проверки характеристик" },
    { lvl: 2, text: "Скорость уменьшается вдвое" },
    { lvl: 3, text: "Помеха на броски атаки и спасброски" },
    { lvl: 4, text: "Максимальные хиты уменьшаются вдвое" },
    { lvl: 5, text: "Скорость уменьшается до 0" },
    { lvl: 6, text: "Смерть" }
  ];

  const CONDITIONS_DB = [
    { name: "Ослеплённое", desc: "Ослепленное существо не может видеть и автоматически проваливает любую проверку характеристик, зависящую от зрения.\nБроски атаки против существа совершаются с преимуществом, а броски атаки существа совершаются с помехой." },
    { name: "Заворожённое", desc: "Заворожённое существо не может напасть на заклинателя или использовать против заклинателя вредоносную способность или магические эффекты.\nЗаклинатель совершает с преимуществом любую проверку характеристик связанную с социальным взаимодействием с существом." },
    { name: "Оглохшее", desc: "Оглохшее существо не может слышать и автоматически проваливает любую проверку характеристики, которая связана со слухом." },
    { name: "Испуганное", desc: "Испуганное существо совершает с помехой проверки характеристик и броски атаки если источник его страха находится в пределах прямой видимости существа.\nСущество не может добровольно приблизиться к источнику своего страха." },
    { name: "Схваченное", desc: "Скорость схваченного существа становится 0, и он не может извлечь выгоду из какого-либо бонуса к своей скорости.\nПерсонаж выходит из состояния \"схвачен\", если схватившее его существо недееспособно (см. состояние).\nСостояние также заканчивается, если эффект удаляет схваченное существо из досягаемости захвата или эффекта захвата, например, когда существо отбрасывается заклинанием Громовой волны." },
    { name: "Недееспособное", desc: "Недееспособное существо не может предпринимать ни действия, ни реакции." },
    { name: "Невидимое", desc: "Невидимое существо невозможно увидеть без помощи магии или особых чувств. Для определения возможности Скрыться невидимого существа считается что оно находится в местности, видимость которого крайне затруднена. Местоположение существа можно определить по любому шуму, который оно издает, или по следам, которые оно оставляет.\nБроски атаки против существа совершаются с помехой, а броски атаки существа - с преимуществом." },
    { name: "Парализованное", desc: "Парализованное существо недееспособно (см. состояние) и не может двигаться или говорить.\nСущество автоматически проваливает спасброски по Силе и Ловкости.\nБроски атаки против существа совершаются с преимуществом.\nЛюбая атака, которая поражает существо, является критическим попаданием, если нападающий находится в пределах 5 футов от существа." },
    { name: "Окаменевшее", desc: "Окаменевшее существо превращается вместе с любыми неволшебными предметами, который оно носит или несет, в твердую неодушевленную субстанцию (обычно камень). Его вес увеличивается в десять раз и оно перестает стареть.\nСущество недееспособно (см. состаяние), не может двигаться или говорить и не знает о своем окружении.\nБроски атаки против существа совершаются с преимуществом.\nСущество автоматически проваливает спасброски по Силе и Ловкости.\nУ окаменевшего существа устойчивость ко всем повреждениям.\nСущество невосприимчиво к яду и болезням, хотя яд или болезнь уже в его организме приостановлены, а не нейтрализованы." },
    { name: "Отравленное", desc: "Отравленное существо совершает с помехой броски атаки и проверки характеристик." },
    { name: "Распластанное", desc: "Если существо не поднимается на ноги и не оканчивает таким образом действие этого состояния, то единственный вариант движения распластанного существа это ползание.\nСущество совершает броски атаки с помехой.\nБроски атаки против существа совершаются с преимуществом, если нападающий находится в пределах 5 футов от существа. В противном случае, броски атаки совершаются с помехой." },
    { name: "Обездвиженное", desc: "Скорость обездвиженного существа становится 0 и никакие эффекты не могут повысить его скорость.\nБроски атаки против существа совершаются с преимуществом, а броски атаки существа совершаются с помехой.\nСущество совершает спасброски Ловкости с помехой." },
    { name: "Оглушенное", desc: "Оглушенное существо недееспособно (см. состояние), не может двигаться и может говорить только запинаясь.\nСущество автоматически проваливает спасброски по Силе и Ловкости.\nБроски атаки против существа совершаются с преимуществом." },
    { name: "Без сознания", desc: "Бессознательное существо недееспособно (см. состояние), не может двигаться или говорить и не осознает своего окружения.\nСущество роняет то, что держало, и падает ничком, получая состояние \"Распластанное\".\nСущество автоматически проваливает спасброски по Силе и Ловкости.\nБроски атаки против существа совершаются с преимуществом.\nЛюбая атака, которая поражает существо, является критическим попаданием, если нападающий находится в пределах 5 футов от существа." }
  ];

// ================== LANGUAGES (Learn popup) ==================
const LANGUAGES_DB = {
  common: [
    { id: "giant", name: "Великаний", typical: "Огры, великаны", script: "Дварфская" },
    { id: "gnomish", name: "Гномий", typical: "Гномы", script: "Дварфская" },
    { id: "goblin", name: "Гоблинский", typical: "Гоблиноиды", script: "Дварфская" },
    { id: "dwarvish", name: "Дварфский", typical: "Дварфы", script: "Дварфская" },
    { id: "common", name: "Общий", typical: "Люди", script: "Общая" },
    { id: "orc", name: "Орочий", typical: "Орки", script: "Дварфская" },
    { id: "halfling", name: "Полуросликов", typical: "Полурослики", script: "Общая" },
    { id: "elvish", name: "Эльфийский", typical: "Эльфы", script: "Эльфийская" }
  ],
  exotic: [
    { id: "abyssal", name: "Бездны", typical: "Демоны", script: "Инфернальная" },
    { id: "deep_speech", name: "Глубинная Речь", typical: "Иллитиды, бехолдеры", script: "-" },
    { id: "draconic", name: "Драконий", typical: "Драконы, драконорождённые", script: "Драконья" },
    { id: "infernal", name: "Инфернальный", typical: "Дьяволы", script: "Инфернальная" },
    { id: "celestial", name: "Небесный", typical: "Небожители", script: "Небесная" },
    { id: "primordial", name: "Первичный", typical: "Элементали", script: "Дварфская" },
    { id: "undercommon", name: "Подземный", typical: "Купцы Подземья", script: "Эльфийская" },
    { id: "sylvan", name: "Сильван", typical: "Фейские существа", script: "Эльфийская" }
  ]
};

function extractLanguagesHint(profText) {
  const t = String(profText || "");
  const m = t.match(/Знание\s+языков\s*:\s*([^\n\r]+)/i);
  return (m && m[1]) ? String(m[1]).trim() : "";
}

function normalizeLanguagesLearned(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(x => x && typeof x === "object")
    .map(x => ({
      id: String(x.id || ""),
      name: String(x.name || ""),
      typical: String(x.typical || ""),
      script: String(x.script || ""),
      category: String(x.category || "")
    }))
    .filter(x => x.name);
}


function openLanguagesPopup(player) {
  if (!player?.sheet?.parsed) return;
  if (!canEditPlayer(player)) return;

  // Важно: после refresh(players) объект player может стать устаревшей ссылкой.
  // Из-за этого при добавлении языка UI мог «прыгать»: языки пропадают/появляются
  // после повторного захода во вкладку. Поэтому всегда работаем с актуальным
  // объектом открытого персонажа из последнего snapshot.
  const getLivePlayer = () => {
    try { return getOpenedPlayerSafe() || player; } catch { return player; }
  };

  const renderCol = (title, items, category) => {
    const rows = items.map(l => `
      <div class="lss-lang-row" data-lang-id="${escapeHtml(l.id)}">
        <div class="lss-lang-row-head">
          <div class="lss-lang-row-name">${escapeHtml(l.name)}</div>
          <button class="popup-btn primary" type="button"
            data-lang-learn="${escapeHtml(l.id)}"
            data-lang-cat="${escapeHtml(category)}">Выучить</button>
        </div>
        <div class="lss-lang-row-meta">Типичный представитель - ${escapeHtml(l.typical)}; Письменность - ${escapeHtml(l.script)}</div>
      </div>
    `).join("");

    return `
      <div class="lss-lang-col">
        <div class="lss-lang-col-title">${escapeHtml(title)}</div>
        ${rows}
      </div>
    `;
  };

  const { overlay, close } = openPopup({
    title: "Выучить язык",
    bodyHtml: `
      <div class="lss-lang-popup-grid">
        ${renderCol("Обычные языки", LANGUAGES_DB.common, "common")}
        ${renderCol("Экзотические языки", LANGUAGES_DB.exotic, "exotic")}
      </div>
    `
  });

  overlay.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("[data-lang-learn]");
    if (!btn) return;

    const id = String(btn.getAttribute("data-lang-learn") || "").trim();
    const cat = String(btn.getAttribute("data-lang-cat") || "").trim();

    const all = [
      ...LANGUAGES_DB.common.map(x => ({ ...x, category: "common" })),
      ...LANGUAGES_DB.exotic.map(x => ({ ...x, category: "exotic" }))
    ];
    const found = all.find(x => x.id === id);
    if (!found) return;

    const live = getLivePlayer();
    if (!live?.sheet?.parsed) return;
    const sheet = live.sheet.parsed;
    if (!sheet.info || typeof sheet.info !== "object") sheet.info = {};
    if (!Array.isArray(sheet.info.languagesLearned)) sheet.info.languagesLearned = [];

    const already = sheet.info.languagesLearned.some(x =>
      String(x?.id || "") === id || String(x?.name || "") === found.name
    );

    if (!already) {
      sheet.info.languagesLearned.push({
        id: found.id,
        name: found.name,
        typical: found.typical,
        script: found.script,
        category: cat || found.category || ""
      });
    }

    markModalInteracted(live.id);
    scheduleSheetSave(live);
    close();
    renderSheetModal(live, { force: true });
  });
}

function bindLanguagesUi(root, player, canEdit) {
  if (!root) return;
  if (root.__langWired) return;
  root.__langWired = true;

  // см. комментарий в openLanguagesPopup — всегда берём актуальную ссылку
  const getLivePlayer = () => {
    try { return getOpenedPlayerSafe() || player; } catch { return player; }
  };

  // Делегирование: кнопка открытия попапа + удаление выученного языка
  root.addEventListener("click", (e) => {
    const openBtn = e.target?.closest?.("[data-lang-popup-open]");
    if (openBtn) {
      e.preventDefault();
      e.stopPropagation();
      if (!canEdit) return;
      openLanguagesPopup(getLivePlayer());
      return;
    }

    const rm = e.target?.closest?.("[data-lang-remove-id]");
    if (rm) {
      e.preventDefault();
      e.stopPropagation();
      if (!canEdit) return;
      const id = String(rm.getAttribute("data-lang-remove-id") || "").trim();
      if (!id) return;
      const live = getLivePlayer();
      const sheet = live?.sheet?.parsed;
      if (!sheet?.info || typeof sheet.info !== "object") return;
      if (!Array.isArray(sheet.info.languagesLearned)) return;

      sheet.info.languagesLearned = sheet.info.languagesLearned.filter(x => {
        const xid = String(x?.id || x?.name || "");
        return xid !== id;
      });

      markModalInteracted(live.id);
      scheduleSheetSave(live);
      renderSheetModal(live, { force: true });
    }
  });
}



  function parseCondList(s) {
    if (!s || typeof s !== "string") return [];
    return s.split(",").map(x => x.trim()).filter(Boolean);
  }
  function setCondList(sheet, arr) {
    const s = Array.from(new Set(arr.map(x => String(x).trim()).filter(Boolean))).join(", ");
    sheet.conditions = s;
    return s;
  }
  // ВАЖНО: "Истощение" и "Состояние" не связаны.
  // sheet.exhaustion хранит только уровень (0..6),
  // sheet.conditions хранит выбранное состояние (строка) или пусто.

  function ensureExhPopup() {
    if (exhPopupEl) return exhPopupEl;
    exhPopupEl = document.createElement("div");
    exhPopupEl.className = "mini-popover hidden";
    exhPopupEl.innerHTML = `
      <div class="mini-popover__backdrop" data-exh-close></div>
      <div class="mini-popover__panel mini-popover__panel--wide" role="dialog" aria-label="Истощение">
        <div class="mini-popover__head">
          <div class="mini-popover__title">Истощение</div>
          <button class="mini-popover__x" type="button" data-exh-close>✕</button>
        </div>
        <div class="mini-popover__body">
          <div class="exh-table">
            <div class="exh-row exh-row--head">
              <div>Уровень</div><div>Эффект</div>
            </div>
            ${EXHAUSTION_LEVELS.map(r => `
              <button class="exh-row" type="button" data-exh-set="${r.lvl}">
                <div class="exh-lvl">${r.lvl}</div>
                <div class="exh-txt">${escapeHtml(r.text)}</div>
              </button>
            `).join("")}
          </div>
        </div>
      </div>
    `;
    sheetModal?.appendChild(exhPopupEl);

    exhPopupEl.addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest("[data-exh-close]")) { hideExhPopup(); return; }
      const btn = t.closest("[data-exh-set]");
      if (btn) {
        const lvl = Math.max(0, Math.min(6, safeInt(btn.getAttribute("data-exh-set"), 0)));
        const player = getOpenedPlayerSafe();
        if (!player) return;
        if (!canEditPlayer(player)) return;
        const sheet = player.sheet?.parsed;
        if (!sheet) return;
        sheet.exhaustion = lvl;
        // sync visible input without full re-render
        try {
          const exInput = sheetContent?.querySelector('[data-sheet-path="exhaustion"]');
          if (exInput && exInput instanceof HTMLInputElement) exInput.value = String(lvl);
        } catch {}

        markModalInteracted(player.id);
        scheduleSheetSave(player);
        hideExhPopup();
      }
    });

    exhPopupEl.addEventListener("keydown", (e) => { if (e.key === "Escape") hideExhPopup(); });
    return exhPopupEl;
  }

  function showExhPopup() { ensureExhPopup().classList.remove("hidden"); }
  function hideExhPopup() { exhPopupEl?.classList.add("hidden"); }

  function ensureCondPopup() {
    if (condPopupEl) return condPopupEl;
    condPopupEl = document.createElement("div");
    condPopupEl.className = "mini-popover hidden";
    condPopupEl.innerHTML = `
      <div class="mini-popover__backdrop" data-cond-close></div>
      <div class="mini-popover__panel mini-popover__panel--wide" role="dialog" aria-label="Состояния">
        <div class="mini-popover__head">
          <div class="mini-popover__title">Состояния</div>
          <button class="mini-popover__x" type="button" data-cond-close>✕</button>
        </div>
        <div class="mini-popover__body">
          <button class="cond-clear" type="button" data-cond-clear>Убрать состояние</button>
          <div class="cond-list">
            ${CONDITIONS_DB.map((c, i) => `
              <div class="cond-item" data-cond-name="${escapeHtml(c.name)}">
                <div class="cond-item__row">
                  <button class="cond-item__name" type="button" data-cond-toggle="${escapeHtml(c.name)}">${escapeHtml(c.name)}</button>
                  <button class="cond-item__descbtn" type="button" data-cond-desc="${i}">Описание</button>
                </div>
                <div class="cond-item__desc hidden" data-cond-descbox="${i}">${escapeHtml(c.desc).replace(/\n/g, "<br>")}</div>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    `;
    sheetModal?.appendChild(condPopupEl);

    condPopupEl.addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest("[data-cond-close]")) { hideCondPopup(); return; }

      if (t.closest("[data-cond-clear]")) {
        const player = getOpenedPlayerSafe();
        if (!player) return;
        if (!canEditPlayer(player)) return;
        const sheet = player.sheet?.parsed;
        if (!sheet) return;

        // очищаем только состояние (истощение не трогаем)
        sheet.conditions = "";

        markModalInteracted(player.id);
        scheduleSheetSave(player);

        try {
          const input = sheetContent?.querySelector('[data-sheet-path="conditions"]');
          if (input && input instanceof HTMLInputElement) input.value = sheet.conditions || "";
          const condChip = sheetContent?.querySelector('[data-cond-open]');
          if (condChip) condChip.classList.toggle('has-value', !!String(sheet.conditions || '').trim());
        } catch {}
        return;
      }

      const descBtn = t.closest("[data-cond-desc]");
      if (descBtn) {
        const i = descBtn.getAttribute("data-cond-desc");
        const box = condPopupEl.querySelector(`[data-cond-descbox="${i}"]`);
        if (box) box.classList.toggle("hidden");
        return;
      }

      const tog = t.closest("[data-cond-toggle]");
      if (tog) {
        const name = (tog.getAttribute("data-cond-toggle") || "").trim();
        if (!name) return;
        const player = getOpenedPlayerSafe();
        if (!player) return;
        if (!canEditPlayer(player)) return;
        const sheet = player.sheet?.parsed;
        if (!sheet) return;

        // одиночный выбор: повторный клик по выбранному состоянию = снять
        const cur = String(sheet.conditions || "").trim();
        const already = cur.toLowerCase() === name.toLowerCase();
        sheet.conditions = already ? "" : name;

        markModalInteracted(player.id);
        scheduleSheetSave(player);

        try {
          const input = sheetContent?.querySelector('[data-sheet-path="conditions"]');
          if (input && input instanceof HTMLInputElement) input.value = sheet.conditions || "";
          const condChip = sheetContent?.querySelector('[data-cond-open]');
          if (condChip) condChip.classList.toggle('has-value', !!String(sheet.conditions || '').trim());
        } catch {}
        return;
      }
    });

    condPopupEl.addEventListener("keydown", (e) => { if (e.key === "Escape") hideCondPopup(); });
    return condPopupEl;
  }

  function showCondPopup() { ensureCondPopup().classList.remove("hidden"); }
  function hideCondPopup() { condPopupEl?.classList.add("hidden"); }
function ensureWiredCloseHandlers() {
    sheetClose?.addEventListener('click', closeModal);

    // клик по фону закрывает
    sheetModal?.addEventListener('click', (e) => {
      if (e.target === sheetModal) closeModal();
    });

    // ESC закрывает
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && sheetModal && !sheetModal.classList.contains('hidden')) {
        closeModal();
      }
    });

    // HP chip -> popup (делегирование, без привязки к старым player)
    sheetContent?.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const chip = t.closest('[data-hp-open]');
      if (chip) showHpPopup();
    });

    sheetContent?.addEventListener('keydown', (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const chip = t.closest('[data-hp-open]');
      if (!chip) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showHpPopup();
      }
    });

    // Inspiration chip toggle
    sheetContent?.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const chip = t.closest('[data-hero="insp"]');
      if (!chip) return;
      const player = getOpenedPlayerSafe();
      if (!player) return;
      if (!canEditPlayer(player)) return;
      const sheet = player.sheet?.parsed;
      if (!sheet) return;
      sheet.inspiration = safeInt(sheet.inspiration, 0) ? 0 : 1;
      markModalInteracted(player.id);
      scheduleSheetSave(player);
      updateHeroChips(sheetContent, sheet);
    });

    // Exhaustion/Conditions popups
    sheetContent?.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;

      const ex = t.closest('[data-exh-open]');
      if (ex) { showExhPopup(); return; }

      const co = t.closest('[data-cond-open]');
      if (co) { showCondPopup(); return; }
    });
  }

  // Прямая привязка кликов к текущему DOM (на случай, если делегирование не сработало
  // из-за disabled input / особенностей браузера). Вызывается после каждого рендера модалки.
  function wireQuickBasicInteractions(root) {
    if (!root || root.__basicQuickWired) return;
    root.__basicQuickWired = true;

    // Отдых (короткий/длинный)
    const restChip = root.querySelector('[data-hero="rest"]');
    if (restChip) {
      restChip.addEventListener('click', (e) => {
        const btn = (e.target instanceof Element) ? e.target.closest('[data-rest]') : null;
        if (!btn) return;
        e.stopPropagation();
        const type = btn.getAttribute('data-rest');
        if (type === 'short') showShortRestPopup();
        if (type === 'long') applyLongRest();
      });
    }

    // Вдохновение (звезда)
    const inspChip = root.querySelector('[data-hero="insp"]');
    if (inspChip) {
      inspChip.addEventListener('click', (e) => {
        e.stopPropagation();
        const player = getOpenedPlayerSafe();
        if (!player) return;
        if (!canEditPlayer(player)) return;
        const sheet = player.sheet?.parsed;
        if (!sheet) return;
        sheet.inspiration = safeInt(sheet.inspiration, 0) ? 0 : 1;
        markModalInteracted(player.id);
        scheduleSheetSave(player);
        updateHeroChips(root, sheet);
      });
    }

    // Истощение/Состояние: открытие попапов кликом по рамке
    const exhChip = root.querySelector('[data-exh-open]');
    if (exhChip) exhChip.addEventListener('click', (e) => { e.stopPropagation(); showExhPopup(); });

    const condChip = root.querySelector('[data-cond-open]');
    if (condChip) condChip.addEventListener('click', (e) => { e.stopPropagation(); showCondPopup(); });
  }


  // ================== REST (Short / Long) ==================
  let restPopupEl = null;

  function ensureRestPopup() {
    if (restPopupEl) return restPopupEl;

    restPopupEl = document.createElement('div');
    restPopupEl.className = 'rest-popover hidden';
    restPopupEl.innerHTML = `
      <div class="rest-popover__backdrop" data-rest-close></div>
      <div class="rest-popover__panel" role="dialog" aria-label="Короткий отдых" aria-modal="false">
        <div class="rest-popover__head">
          <div class="rest-popover__title">Короткий отдых</div>
          <button class="rest-popover__x" type="button" data-rest-close title="Закрыть">✕</button>
        </div>
        <div class="rest-popover__body">
          <div class="rest-row">
            <button class="rest-die-btn" type="button" data-rest-die title="Выбрать кости здоровья">
              <svg viewBox="0 0 24 24" width="46" height="46" aria-hidden="true">
                <path d="M12 2 20.5 7v10L12 22 3.5 17V7L12 2Z" fill="rgb(138,0,0)" opacity="0.96"></path>
                <path d="M12 2v20M3.5 7l8.5 5 8.5-5M3.5 17l8.5-5 8.5 5" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1.2"></path>
              </svg>
            </button>
            <div class="rest-hd-info">
              <div class="lbl">Костей здоровья</div>
              <div class="val"><span data-rest-hd-rem>0</span>/<span data-rest-hd-max>0</span> • <span data-rest-hd-die>к8</span></div>
              <div class="lbl" style="margin-top:4px">Мод. телосложения: <span data-rest-conmod>+0</span></div>
            </div>
          </div>
          <div class="rest-dots" data-rest-dots></div>
          <div class="rest-actions">
            <button class="rest-btn" type="button" data-rest-apply>отдохнуть</button>
          </div>
        </div>
      </div>
    `;

    sheetModal?.appendChild(restPopupEl);

    restPopupEl.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest('[data-rest-close]')) { hideShortRestPopup(); return; }
      if (t.closest('[data-rest-die]')) { bumpShortRestSelection(); return; }
      if (t.closest('[data-rest-apply]')) { applyShortRest(); return; }
    });

    restPopupEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideShortRestPopup();
    });

    return restPopupEl;
  }

  let shortRestSelected = 0;

  function getHitDieSides(sheet){
    return Math.max(4, Math.min(12, safeInt(sheet?.vitality?.['hit-die-sides']?.value, 8) || 8));
  }

  function getHitDiceMax(sheet){
    // максимум = уровень
    const lvl = Math.max(1, safeInt(sheet?.info?.level?.value, 1) || 1);
    return lvl;
  }

  function getHitDiceRemaining(sheet){
    // текущее доступное (старое поле)
    const rem = Math.max(0, safeInt(sheet?.vitality?.['hit-dice-total']?.value, getHitDiceMax(sheet)) || 0);
    return rem;
  }

  function setHitDiceRemaining(sheet, v){
    if (!sheet.vitality) sheet.vitality = {};
    if (!sheet.vitality['hit-dice-total']) sheet.vitality['hit-dice-total'] = { value: 0 };
    const max = getHitDiceMax(sheet);
    sheet.vitality['hit-dice-total'].value = Math.max(0, Math.min(max, safeInt(v, 0) || 0));
  }

  function formatSigned(n){
    const x = Number(n) || 0;
    return (x >= 0 ? `+${x}` : `${x}`);
  }

  function syncShortRestPopup(){
    if (!restPopupEl) return;
    const player = getOpenedPlayerSafe();
    if (!player) return;
    const sheet = player.sheet?.parsed;
    if (!sheet) return;

    const max = getHitDiceMax(sheet);
    const rem = getHitDiceRemaining(sheet);
    const sides = getHitDieSides(sheet);
    const conMod = safeInt(sheet?.stats?.con?.modifier, 0) || 0;

    // clamp selection to remaining
    shortRestSelected = Math.max(0, Math.min(rem, safeInt(shortRestSelected, 0) || 0));

    const remEl = restPopupEl.querySelector('[data-rest-hd-rem]');
    const maxEl = restPopupEl.querySelector('[data-rest-hd-max]');
    const dieEl = restPopupEl.querySelector('[data-rest-hd-die]');
    const conEl = restPopupEl.querySelector('[data-rest-conmod]');
    if (remEl) remEl.textContent = String(rem);
    if (maxEl) maxEl.textContent = String(max);
    if (dieEl) dieEl.textContent = `к${sides}`;
    if (conEl) conEl.textContent = formatSigned(conMod);

    const dotsWrap = restPopupEl.querySelector('[data-rest-dots]');
    if (dotsWrap) {
      dotsWrap.innerHTML = Array.from({ length: max }).map((_, i) => {
        const isAvail = i < rem;
        const isSel = i < shortRestSelected;
        const cls = `rest-dot${isSel ? ' is-selected' : ''}${!isAvail ? ' is-disabled' : ''}`;
        return `<span class="${cls}"></span>`;
      }).join('');
    }
  }

  function showShortRestPopup(){
    const player = getOpenedPlayerSafe();
    if (!player) return;
    if (!canEditPlayer(player)) return;

    const sheet = player.sheet?.parsed;
    if (!sheet) return;
    if (!sheet.vitality) sheet.vitality = {};
    if (!sheet.vitality['hit-die-sides']) sheet.vitality['hit-die-sides'] = { value: 8 };
    if (!sheet.vitality['hit-dice-total']) {
      // по умолчанию даём максимум (уровень)
      sheet.vitality['hit-dice-total'] = { value: getHitDiceMax(sheet) };
    } else {
      // clamp в пределах 0..max (на случай старых данных)
      setHitDiceRemaining(sheet, sheet.vitality['hit-dice-total'].value);
    }

    shortRestSelected = 0;
    ensureRestPopup();
    syncShortRestPopup();
    restPopupEl.classList.remove('hidden');
  }

  function hideShortRestPopup(){
    restPopupEl?.classList.add('hidden');
    shortRestSelected = 0;
  }

  function bumpShortRestSelection(){
    const player = getOpenedPlayerSafe();
    if (!player) return;
    const sheet = player.sheet?.parsed;
    if (!sheet) return;
    const rem = getHitDiceRemaining(sheet);
    if (rem <= 0) { shortRestSelected = 0; syncShortRestPopup(); return; }
    shortRestSelected = (shortRestSelected < rem) ? (shortRestSelected + 1) : 0;
    syncShortRestPopup();
  }

  async function applyShortRest(){
    const player = getOpenedPlayerSafe();
    if (!player) return;
    if (!canEditPlayer(player)) return;
    const sheet = player.sheet?.parsed;
    if (!sheet?.vitality) return;

    const maxHp = safeInt(sheet?.vitality?.['hp-max']?.value, 0) || 0;
    const curHp = safeInt(sheet?.vitality?.['hp-current']?.value, 0) || 0;

    const rem = getHitDiceRemaining(sheet);
    const spend = Math.max(0, Math.min(rem, safeInt(shortRestSelected, 0) || 0));
    const sides = getHitDieSides(sheet);
    const conMod = safeInt(sheet?.stats?.con?.modifier, 0) || 0;

    let totalHeal = 0;

    if (spend > 0) {
      // DicePanel: sum of dice + spend*conMod
      if (window.DicePanel?.roll) {
        const kindText = `Короткий отдых: ${spend}d${sides}${conMod ? ` ${conMod>=0?'+':''}${conMod} (за каждый)` : ''}`;
        const res = await window.DicePanel.roll({ sides, count: spend, bonus: conMod * spend, kindText });
        totalHeal = safeInt(res?.total, 0) || 0;
      }
      if (!Number.isFinite(totalHeal) || totalHeal <= 0) {
        // fallback
        for (let i = 0; i < spend; i++) {
          totalHeal += (Math.floor(Math.random() * sides) + 1) + conMod;
        }
        totalHeal = Math.max(0, Math.trunc(totalHeal));
      }
    }

    // apply heal (can be 0)
    if (!sheet.vitality['hp-current']) sheet.vitality['hp-current'] = { value: 0 };
    const nextHp = Math.max(0, Math.min(maxHp, curHp + Math.max(0, totalHeal)));
    sheet.vitality['hp-current'].value = nextHp;

    // spend hit dice
    if (spend > 0) setHitDiceRemaining(sheet, rem - spend);

    markModalInteracted(player.id);
    scheduleSheetSave(player);
    if (sheetContent) updateHeroChips(sheetContent, sheet);
    hideShortRestPopup();
  }

  function applyLongRest(){
    const player = getOpenedPlayerSafe();
    if (!player) return;
    if (!canEditPlayer(player)) return;
    const sheet = player.sheet?.parsed;
    if (!sheet) return;
    if (!sheet.vitality) sheet.vitality = {};

    // hp
    const maxHp = safeInt(sheet?.vitality?.['hp-max']?.value, 0) || 0;
    if (!sheet.vitality['hp-current']) sheet.vitality['hp-current'] = { value: 0 };
    sheet.vitality['hp-current'].value = maxHp;
    if (!sheet.vitality['hp-temp']) sheet.vitality['hp-temp'] = { value: 0 };
    sheet.vitality['hp-temp'].value = 0;

    // spell slots: make all available (filled = 0)
    if (!sheet.spells || typeof sheet.spells !== 'object') sheet.spells = {};
    for (let lvlN = 1; lvlN <= 9; lvlN++) {
      const k = `slots-${lvlN}`;
      const total = safeInt(sheet?.spells?.[k]?.value, 0) || 0;
      if (!sheet.spells[k] || typeof sheet.spells[k] !== 'object') sheet.spells[k] = { value: total, filled: 0 };
      sheet.spells[k].filled = 0;
      // keep value as-is
      if (typeof sheet.spells[k].value !== 'number') sheet.spells[k].value = total;
    }

    // hit dice: restore половину от максимума (уровня), в меньшую сторону
    if (!sheet.vitality['hit-dice-total']) sheet.vitality['hit-dice-total'] = { value: getHitDiceMax(sheet) };
    const max = getHitDiceMax(sheet);
    const rem = getHitDiceRemaining(sheet);
    const gain = Math.floor(max / 2);
    setHitDiceRemaining(sheet, Math.min(max, rem + gain));

    markModalInteracted(player.id);
    scheduleSheetSave(player);
    if (sheetContent) updateHeroChips(sheetContent, sheet);
    // закрываем короткий отдых если был открыт
    hideShortRestPopup();
  }

  // keep condition chip highlight in sync when user edits the field manually
  sheetContent?.addEventListener('input', (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const inp = t.closest('[data-sheet-path="conditions"]');
    if (!inp) return;
    const chip = sheetContent?.querySelector('[data-cond-open]');
    if (chip) chip.classList.toggle('has-value', !!String(inp.value || '').trim());
  });



  // ================== POPUP HELPERS (внутренние окна) ==================
  function openPopup({ title="", bodyHtml="" } = {}) {
    const overlay = document.createElement("div");
    overlay.className = "popup-overlay";
    overlay.innerHTML = `
      <div class="popup-card" role="dialog" aria-modal="true">
        <div class="popup-head">
          <div class="popup-title">${escapeHtml(String(title||""))}</div>
          <button class="popup-close" type="button" data-popup-close>✕</button>
        </div>
        <div class="popup-body">${bodyHtml}</div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => {
      overlay.remove();
    };
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
      if (e.target?.closest?.("[data-popup-close]")) close();
    });
    document.addEventListener("keydown", function onEsc(ev){
      if (ev.key === "Escape") {
        document.removeEventListener("keydown", onEsc);
        if (overlay.isConnected) close();
      }
    });
    return { overlay, close };
  }
