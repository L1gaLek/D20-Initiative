  // ================== RENDER
  // ================== RENDER ==================
  function renderAbilitiesGrid(vm) {
    const d20SvgMini = `
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="M12 2 20.5 7v10L12 22 3.5 17V7L12 2Z" fill="currentColor" opacity="0.95"></path>
        <path d="M12 2v20M3.5 7l8.5 5 8.5-5M3.5 17l8.5-5 8.5 5" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"></path>
      </svg>
    `;

    const blocks = vm.stats.map(s => {
      const skillRows = (s.skills || []).map(sk => {
        const dotClass = (sk.boostLevel === 1) ? "boost1" : (sk.boostLevel === 2) ? "boost2" : "";
        return `
          <div class="lss-skill-row">
            <div class="lss-skill-left">
              <span class="lss-dot ${dotClass}" data-skill-key="${escapeHtml(sk.key)}"></span>
              <span class="lss-skill-name" title="${escapeHtml(sk.label)}">
                <span class="lss-skill-name-text">
                  ${escapeHtml(sk.label)}
                  <span class="lss-boost">${sk.boostStars ? ` ${escapeHtml(sk.boostStars)}` : ""}</span>
                </span>
              </span>
              <button class="lss-dice-btn" type="button" data-roll-kind="skill" data-skill-key="${escapeHtml(sk.key)}" title="Бросок: d20${escapeHtml(formatMod(sk.bonus))}">${d20SvgMini}</button>
            </div>
            <input class="lss-skill-val lss-skill-val-input" type="text" value="${escapeHtml(formatMod(sk.bonus))}" data-skill-key="${escapeHtml(sk.key)}">
          </div>
        `;
      }).join("");

      return `
        <div class="lss-ability">
          <div class="lss-ability-head">
            <div class="lss-ability-name">${escapeHtml(s.label.toUpperCase())}</div>
            <input class="lss-ability-score lss-ability-score-input" type="number" min="1" max="30" value="${escapeHtml(String(s.score))}" data-stat-key="${escapeHtml(s.k)}">
          </div>

          <div class="lss-ability-actions">
            <div class="lss-pill">
              <div class="lss-pill-label-row">
                <span class="lss-pill-label">ПРОВЕРКА</span>
                <button class="lss-dice-btn" type="button" data-roll-kind="check" data-stat-key="${escapeHtml(s.k)}" title="Бросок проверки">
                  ${d20SvgMini}
                </button>
              </div>
              <input class="lss-pill-val lss-pill-val-input" type="text" value="${escapeHtml(formatMod(s.check))}" data-stat-key="${escapeHtml(s.k)}" data-kind="check">
            </div>
            <div class="lss-pill">
              <div class="lss-pill-label-row">
                <button class="lss-save-dot ${s.saveProf ? "active" : ""}" type="button" data-save-key="${escapeHtml(s.k)}" title="Владение спасброском"></button>
                <span class="lss-pill-label">СПАСБРОСОК</span>
                <button class="lss-dice-btn" type="button" data-roll-kind="save" data-stat-key="${escapeHtml(s.k)}" title="Бросок спасброска">
                  ${d20SvgMini}
                </button>
              </div>
              <input class="lss-pill-val lss-pill-val-input" type="text" value="${escapeHtml(formatMod(s.save))}" data-stat-key="${escapeHtml(s.k)}" data-kind="save">
            </div>
          </div>

          <div class="lss-ability-divider"></div>

          <div class="lss-skill-list">
            ${skillRows || `<div class="sheet-note">Нет навыков</div>`}
          </div>
        </div>
      `;
    }).join("");

    return `<div class="lss-abilities-grid">${blocks}</div>`;
  }

  function renderPassives(vm) {
    const rows = vm.passive.map(p => `
      <div class="lss-passive-row" data-passive-key="${escapeHtml(String(p.key || ''))}">
        <div class="lss-passive-val" data-passive-val="${escapeHtml(String(p.key || ''))}">${escapeHtml(String(p.value))}</div>
        <div class="lss-passive-label">${escapeHtml(p.label)}</div>
      </div>
    `).join("");

    return `
      <div class="lss-passives">
        <div class="lss-passives-title">ПАССИВНЫЕ ЧУВСТВА</div>
        <div class="lss-passive-rowlist">
          ${rows}
        </div>
      </div>
    `;
  }

  function renderProfBox(vm) {
  const hint = String(vm.languagesHint || "").trim();
  const learned = Array.isArray(vm.languagesLearned) ? vm.languagesLearned : [];

  const learnedHtml = learned.length
    ? learned.map(l => `
        <div class="lss-lang-pill">
          <div class="lss-lang-pill-head">
            <div class="lss-lang-pill-name">${escapeHtml(l.name)}</div>
            <button class="lss-lang-pill-x" type="button" title="Удалить язык" data-lang-remove-id="${escapeHtml(String(l.id || l.name || ""))}">✕</button>
          </div>
          <div class="lss-lang-pill-meta"><span class="lss-lang-lbl">Типичный представитель</span> - ${escapeHtml(l.typical || "-")}; <span class="lss-lang-lbl">Письменность</span> - ${escapeHtml(l.script || "-")}</div>
        </div>
      `).join("")
    : `<div class="sheet-note">Пока языки не выбраны</div>`;

  // всегда показываем блок, даже без загруженного файла
  return `
    <div class="lss-profbox">
      <div class="lss-passives-title">ПРОЧИЕ ВЛАДЕНИЯ И ЗАКЛИНАНИЯ</div>

      <!-- Языки: на всю ширину блока -->
      <div class="lss-langbox lss-langbox--full">
        <div class="lss-langbox-head">
          <div class="lss-langbox-head-left">
            <div class="lss-langbox-title">ЯЗЫКИ</div>
            <div class="lss-langbox-head-hint ${hint ? "" : "hidden"}">
              <span class="lss-langbox-head-hint-label">Знание языков:</span>
              <span class="lss-langbox-head-hint-val">${escapeHtml(hint)}</span>
            </div>
          </div>
          <button class="lss-lang-learn-btn" type="button" data-lang-popup-open>Выучить язык</button>
        </div>

        <div class="lss-langbox-list lss-langbox-list--cols3">
          ${learnedHtml}
        </div>
      </div>

      <!-- Прочие владения/заклинания: тоже на всю ширину -->
      <textarea data-rtf="1" class="lss-prof-text lss-prof-text--full" rows="8" data-sheet-path="text.profPlain.value"
        placeholder="Например: владения, инструменты, языки, заклинания...">${escapeHtml(vm.profText || "")}</textarea>
    </div>
  `;
}


  function renderBasicTab(vm, canEdit) {
    const RACES = [
      "Аасимар","Ааракокра","Багбир","Ведалкен","Вердан","Гифф","Гит","Гном","Грунг","Гоблин","Голиаф","Дварф",
      "Дженази","Драконорожденный","Зайцегон","Калаштар","Кенку","Кобольд","Кованый","Кентавр","Леонин","Локата","Локсодон",
      "Людокрыса","Людоящер","Мурлок","Минотавр","Орк","Полурослик","Полуорк","Полуэльф","Плазмоид","Сатир","Совлин","Табакси",
      "Тифлинг","Тортл","Тритон","Три-крин","Фирболг","Фэйри","Хобгоблин","Человек","Чейнджлинг","Эладрин","Эльф","Юань-Ти"
    ];

    const raceVal = String(vm?.race || "-");
    const raceOptions = [
      `<option value="">—</option>`,
      ...RACES.map(r => `<option value="${escapeHtml(r)}" ${r===raceVal ? "selected" : ""}>${escapeHtml(r)}</option>`)
    ].join("");

    return `
      <div class="sheet-section">
        <div class="sheet-topline">
          <div class="sheet-chip sheet-chip--exh" data-exh-open title="Истощение">
            <div class="k">Истощение</div>
            <!-- readonly: выбор идёт через список; так клик по полю тоже открывает окно -->
            <input class="sheet-chip-input" type="number" min="0" max="6" ${canEdit ? "" : "disabled"} readonly data-sheet-path="exhaustion" value="${escapeHtml(String(vm.exhaustion))}">
          </div>
          <div class="sheet-chip sheet-chip--cond ${String(vm.conditions||"").trim() ? "has-value" : ""}" data-cond-open title="Состояние">
            <div class="k">Состояние</div>
            <!-- readonly: состояние выбирается из списка (и очищается кнопкой) -->
            <input class="sheet-chip-input sheet-chip-input--wide" type="text" ${canEdit ? "" : "disabled"} readonly data-sheet-path="conditions" value="${escapeHtml(String(vm.conditions || ""))}">
          </div>
        </div>

        <h3>Основное</h3>

        <div class="sheet-card sheet-card--profile">
          <h4>Профиль</h4>

          <div class="profile-grid">
            <div class="profile-col">
              <div class="kv"><div class="k">Имя</div><div class="v"><input type="text" data-sheet-path="name.value" style="width:180px"></div></div>
              <div class="kv"><div class="k">Класс</div><div class="v"><input type="text" data-sheet-path="info.charClass.value" style="width:180px"></div></div>
              <div class="kv"><div class="k">Архетип класса</div><div class="v"><input type="text" data-sheet-path="info.classArchetype.value" style="width:180px"></div></div>
              <div class="kv"><div class="k">Уровень</div><div class="v"><input type="number" min="1" max="20" data-sheet-path="info.level.value" style="width:90px"></div></div>
            </div>

            <div class="profile-col">
              <div class="kv"><div class="k">Раса</div><div class="v"><select data-sheet-path="info.race.value" data-race-select style="width:190px" ${canEdit ? "" : "disabled"}>${raceOptions}</select></div></div>
              <div class="kv"><div class="k">Архетип расы</div><div class="v"><input type="text" data-sheet-path="info.raceArchetype.value" style="width:180px"></div></div>
              <div class="kv"><div class="k">Предыстория</div><div class="v"><input type="text" data-sheet-path="info.background.value" style="width:180px"></div></div>
              <div class="kv"><div class="k">Мировоззрение</div><div class="v"><input type="text" data-sheet-path="info.alignment.value" style="width:180px"></div></div>
            </div>
          </div>
        </div>

        <div class="sheet-section" style="margin-top:12px;">
          <h3>Характеристики и навыки</h3>
          ${renderAbilitiesGrid(vm)}
        </div>

        <div class="lss-bottom-stack">
          ${renderPassives(vm)}
          ${renderProfBox(vm)}
        </div>
      </div>
    `;
  }

  // ================== RENDER: SPELLS ==================

  
function renderSpellCard({ level, name, href, desc }) {
    const safeHref = escapeHtml(href || "");
    const safeName = escapeHtml(name || href || "(без названия)");
    const text = cleanupSpellDesc(desc || "");
    const lvl = safeInt(level, 0);

    const isHttp = /^https?:\/\//i.test(String(href || ""));
    const titleHtml = isHttp
      ? `<a class="spell-item-link" href="${safeHref}" target="_blank" rel="noopener noreferrer">${safeName}</a>`
      : `<span class="spell-item-title">${safeName}</span>`;

    const diceSvg = `
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="M12 2 20.5 7v10L12 22 3.5 17V7L12 2Z" fill="currentColor" opacity="0.95"></path>
        <path d="M12 2v20M3.5 7l8.5 5 8.5-5M3.5 17l8.5-5 8.5 5" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"></path>
      </svg>
    `;

    return `
      <div class="spell-item" data-spell-url="${safeHref}" data-spell-level="${lvl}">
        <div class="spell-item-head">
          ${titleHtml}
          <button class="spell-dice-btn" type="button" data-spell-roll title="Бросок атаки">${diceSvg}</button>
          <div class="spell-item-actions">
            <button class="spell-desc-btn" type="button" data-spell-desc-toggle>Описание</button>
            <button class="spell-del-btn" type="button" data-spell-delete>Удалить</button>
          </div>
        </div>
        <div class="spell-item-desc hidden">
          <textarea data-rtf="1" class="spell-desc-editor" data-spell-desc-editor rows="6" placeholder="Описание (можно редактировать)…">${escapeHtml(text)}</textarea>
          <div class="sheet-note" style="margin-top:6px;">Сохраняется автоматически.</div>
        </div>
      </div>
    `;
  }

  function renderSlots(vm) {
    const slots = Array.isArray(vm?.slots) ? vm.slots : [];
    if (!slots.length) return `<div class="sheet-note">Ячейки заклинаний не указаны.</div>`;

    const countByLevel = {};
    (vm.spellsByLevel || []).forEach(b => {
      const lvl = Number(b.level);
      if (!Number.isFinite(lvl)) return;
      countByLevel[lvl] = Array.isArray(b.items) ? b.items.length : 0;
    });

    const cells = slots.slice(0, 9).map(s => {
      const total = Math.max(0, Math.min(12, numLike(s.total, 0)));
      const filled = Math.max(0, Math.min(total, numLike(s.filled, 0)));
      const current = Math.max(0, total - filled); // доступные (для кружков)
      const spellsCount = countByLevel[s.level] || 0;

      const dots = Array.from({ length: total })
        .map((_, i) => {
          const on = i < current;
          return `<span class="slot-dot${on ? " is-available" : ""}" data-slot-level="${s.level}"></span>`;
        })
        .join("");

      return `
        <div class="slot-cell" data-slot-level="${s.level}">
          <div class="slot-top">
            <div class="slot-level">Ур. ${s.level}</div>
            <div class="slot-nums">
              <span class="slot-spells" title="Кол-во заклинаний уровня">${spellsCount}</span>
              <span class="slot-sep">/</span>
              <input class="slot-current slot-current-input" type="number" min="0" max="12" value="${escapeHtml(String(total))}" data-slot-level="${s.level}" title="Всего ячеек (редактируемое)">
            </div>
          </div>
          <div class="slot-dots" data-slot-dots="${s.level}">
            ${dots || `<span class="slot-dots-empty">—</span>`}
          </div>
        </div>
      `;
    }).join("");

    return `
      <div class="slots-frame">
        <div class="slots-grid">
          ${cells}
        </div>
      </div>
    `;
  }

  function renderSpellsByLevel(vm) {
    const spellNameByHref = (vm?.spellNameByHref && typeof vm.spellNameByHref === "object") ? vm.spellNameByHref : {};
    const spellDescByHref = (vm?.spellDescByHref && typeof vm.spellDescByHref === "object") ? vm.spellDescByHref : {};
    const blocks = (vm?.spellsByLevel || []).map(b => {
      const lvl = safeInt(b.level, 0);
      const title = (lvl === 0) ? "Заговоры (0)" : `Уровень ${lvl}`;

      const items = (b.items || []).map(it => {
        if (it.href) {
          const name = spellNameByHref[it.href] || it.text;
          const desc = spellDescByHref[it.href] || "";
          return renderSpellCard({ level: lvl, name, href: it.href, desc });
        }
        return `<span class="sheet-pill">${escapeHtml(it.text)}</span>`;
      }).join("");

      return `
        <div class="sheet-card">
          <div class="spells-level-header">
            <h4 style="margin:0">${escapeHtml(title)}</h4>
            <button class="spell-add-btn" type="button" data-spell-add data-spell-level="${lvl}">${lvl === 0 ? "Добавить заговор" : "Добавить заклинание"}</button>
          </div>

          <div class="spells-level-pills">
            ${items || `<div class="sheet-note">Пока пусто. Добавляй кнопкой выше или через «Выбор из базы».</div>`}
          </div>
        </div>
      `;
    }).join("");

    return `<div class="sheet-grid-1">${blocks}</div>`;
  }

  function renderSpellsTab(vm) {
    const base = (vm?.spellsInfo?.base || "").trim() || "int";

    const statScoreByKey = {};
    (vm?.stats || []).forEach(s => { statScoreByKey[s.k] = safeInt(s.score, 10); });

    const prof = safeInt(vm?.profBonus, 0);
    const abilScore = safeInt(statScoreByKey[base], 10);
    const abilMod = abilityModFromScore(abilScore);

    const computedAttack = prof + abilMod;
    const computedSave = 8 + prof + abilMod;

    const rawSave = (vm?.spellsInfo?.save ?? "").toString().trim();
    const saveVal = rawSave !== "" ? String(numLike(rawSave, computedSave)) : String(computedSave);

    // Бонус атаки: всегда по формуле Владение + модификатор выбранной характеристики
    // (ручной оверрайд хранится в sheet.spellsInfo.mod.customModifier и применяется в updateSpellsMetrics)
    const atkVal = String(computedAttack);

    const abilityOptions = [
      ["str","Сила"],
      ["dex","Ловкость"],
      ["con","Телосложение"],
      ["int","Интеллект"],
      ["wis","Мудрость"],
      ["cha","Харизма"],
    ];

    return `
      <div class="sheet-section">
        <h3>Заклинания</h3>

        <div class="sheet-card spells-metrics-card fullwidth">
          <div class="spell-metric spell-metric-full">
            <div class="spell-metric-label">Характеристика</div>
            <div class="spell-metric-val spell-metric-control">
              <select class="spell-ability-select" data-spell-base-ability>
                ${abilityOptions.map(([k,l]) => `<option value="${k}" ${k===base?'selected':''}>${l}</option>`).join("")}
              </select>
            </div>
          </div>

          <div class="spell-metrics">
            <div class="spell-metric">
              <div class="spell-metric-label">СЛ спасброска</div>
              <div class="spell-metric-val">${escapeHtml(String(saveVal))}</div>
            </div>

            <div class="spell-metric">
              <div class="spell-metric-label spell-metric-label-row">Бонус атаки
  <button class="spell-dice-btn spell-dice-btn--header" type="button" data-spell-roll-header title="Бросок атаки">
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M12 2 20.5 7v10L12 22 3.5 17V7L12 2Z" fill="currentColor" opacity="0.95"></path>
      <path d="M12 2v20M3.5 7l8.5 5 8.5-5M3.5 17l8.5-5 8.5 5" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"></path>
    </svg>
  </button>
</div>
              <div class="spell-metric-val spell-metric-control">
                <input class="spell-attack-input" data-spell-attack-bonus type="number" step="1" min="-20" max="30" value="${escapeHtml(String(atkVal))}" />
              </div>
            </div>
          </div>
          <div class="sheet-note" style="margin-top:8px;">
            Бонус атаки по умолчанию: <b>Владение</b> (${prof}) + <b>модификатор выбранной характеристики</b> (${formatMod(abilMod)}).
          </div>
        </div>

        <div class="sheet-card fullwidth" style="margin-top:10px;">
          <h4>Ячейки</h4>
          ${renderSlots(vm)}
          <div class="sheet-note" style="margin-top:6px;">
            Формат: <b>кол-во заклинаний</b> / <b>всего ячеек</b> (второе число редактируемое, max 12). Кружки показывают доступные (неиспользованные) ячейки.
          </div>
        </div>

        <div class="sheet-section" style="margin-top:10px;">
          <div class="spells-list-header"><h3 style="margin:0">Заклинания</h3><button class="spell-db-btn" type="button" data-spell-db>База SRD</button></div>
          ${renderSpellsByLevel(vm)}
          <div class="sheet-note" style="margin-top:8px;">
            Подсказка: если в твоём .json ссылки на dnd.su — они кликабельны.
          </div>
        </div>
      </div>
    `;
  }

  // ================== OTHER TABS ==================
  
function renderCombatTab(vm) {
  const statModByKey = {};
  (vm?.stats || []).forEach(s => { statModByKey[s.k] = safeInt(s.mod, 0); });

  const profBonus = safeInt(vm?.profBonus, 2);

  const abilityOptions = [
    { k: "str", label: "Сила" },
    { k: "dex", label: "Ловкость" },
    { k: "con", label: "Телосложение" },
    { k: "int", label: "Интеллект" },
    { k: "wis", label: "Мудрость" },
    { k: "cha", label: "Харизма" }
  ];

  const diceOptions = ["к4","к6","к8","к10","к12","к20"];

  const calcAtk = (w) => {
    const statMod = safeInt(statModByKey[w.ability] ?? 0, 0);
    const prof = w.prof ? profBonus : 0;
    const extra = safeInt(w.extraAtk, 0);
    return statMod + prof + extra;
  };

  const dmgText = (w) => {
    const n = Math.max(0, safeInt(w.dmgNum, 1));
    const dice = String(w.dmgDice || "к6");
    const type = String(w.dmgType || "").trim();
    return `${n}${dice}${type ? ` ${type}` : ""}`.trim();
  };

  const d20Svg = `
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M12 2 20.5 7v10L12 22 3.5 17V7L12 2Z" fill="currentColor" opacity="0.95"></path>
      <path d="M12 2v20M3.5 7l8.5 5 8.5-5M3.5 17l8.5-5 8.5 5" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"></path>
    </svg>
  `;

  const weapons = Array.isArray(vm?.weapons) ? vm.weapons : [];

  const listHtml = weapons.length
    ? weapons.map(w => {
        if (w.kind === "legacy") {
          // на всякий случай
          return `
            <div class="sheet-card weapon-card legacy">
              <div class="sheet-note">Оружие legacy. Перезагрузи json или добавь оружие через кнопку «Добавить оружие».</div>
            </div>
          `;
        }

        const atk = calcAtk(w);
        const collapsed = !!w.collapsed;
        const title = String(w.name || "");

        return `
          <div class="sheet-card weapon-card" data-weapon-idx="${w.idx}">
            <div class="weapon-head ${collapsed ? "is-collapsed" : "is-expanded"}">
              <input class="weapon-title-input"
                     type="text"
                     value="${escapeHtml(title)}"
                     title="${escapeHtml(title)}"
                     placeholder="Название"
                     data-weapon-field="name">

              <div class="weapon-actions">
                <button class="weapon-btn" type="button" data-weapon-toggle-desc>${collapsed ? "Показать" : "Скрыть"}</button>
                <button class="weapon-btn danger" type="button" data-weapon-del>Удалить</button>
              </div>
            </div>

            <!-- рамка под названием: Бонус атаки + Урон (всегда видима) -->
            <div class="weapon-summary">
              <div class="weapon-sum-item">
                <div class="weapon-sum-label">
                  <span>Атака</span>
                  <button class="weapon-dice-btn" type="button" data-weapon-roll-atk title="Бросок атаки">${d20Svg}</button>
                </div>
                <div class="weapon-sum-val" data-weapon-atk>${escapeHtml(formatMod(atk))}</div>
              </div>

              <div class="weapon-sum-item">
                <div class="weapon-sum-label">
                  <span>Урон</span>
                  <button class="weapon-dice-btn" type="button" data-weapon-roll-dmg title="Бросок урона">${d20Svg}</button>
                </div>
                <div class="weapon-sum-val" data-weapon-dmg>${escapeHtml(dmgText(w))}</div>
              </div>
            </div>

            <!-- всё ниже скрывается кнопкой Скрыть -->
            <div class="weapon-details ${collapsed ? "collapsed" : ""}">
              <div class="weapon-details-grid">
                <div class="weapon-fieldbox weapon-ability">
                  <div class="weapon-fieldlabel">Характеристика</div>
                  <select class="weapon-select" data-weapon-field="ability">
                    ${abilityOptions.map(o => `<option value="${o.k}" ${o.k === w.ability ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}
                  </select>
                </div>

                <div class="weapon-fieldbox weapon-fieldbox-inline">
                  <div class="weapon-fieldlabel">Бонус владения</div>
                  <button class="weapon-prof-dot ${w.prof ? "active" : ""}" type="button" data-weapon-prof title="Владение: +${profBonus} к бонусу атаки"></button>
                </div>

                <div class="weapon-fieldbox">
                  <div class="weapon-fieldlabel">Доп. модификатор</div>
                  <input class="weapon-num weapon-extra" type="number" step="1"
                         value="${escapeHtml(String(safeInt(w.extraAtk, 0)))}"
                         data-weapon-field="extraAtk">
                </div>

                <div class="weapon-fieldbox weapon-dmg-edit">
                  <div class="weapon-fieldlabel">Урон (редакт.)</div>
                  <div class="weapon-dmg-mini">
                    <input class="weapon-num weapon-dmg-num" type="number" min="0" step="1"
                           value="${escapeHtml(String(Math.max(0, safeInt(w.dmgNum, 1))))}"
                           data-weapon-field="dmgNum">
                    <select class="weapon-select weapon-dice" data-weapon-field="dmgDice">
                      ${diceOptions.map(d => `<option value="${d}" ${d === w.dmgDice ? "selected" : ""}>${escapeHtml(d)}</option>`).join("")}
                    </select>
                  </div>
                  <input class="weapon-text weapon-dmg-type weapon-dmg-type-full" type="text"
                         value="${escapeHtml(String(w.dmgType || ""))}"
                         placeholder="вид урона (колющий/рубящий/...)"
                         data-weapon-field="dmgType">
                </div>
              </div>

              <div class="weapon-desc">
                <textarea data-rtf="1" class="sheet-textarea weapon-desc-text" rows="4"
                          placeholder="Описание оружия..."
                          data-weapon-field="desc">${escapeHtml(String(w.desc || ""))}</textarea>
              </div>
            </div>
          </div>
        `;
      }).join("")
    : `<div class="sheet-note">Оружие пока не добавлено. Нажми «Добавить оружие».</div>`;

  return `
    <div class="sheet-section" data-combat-root>
      <div class="combat-toolbar">
        <h3>Бой</h3>
        <button class="weapon-add-btn" type="button" data-weapon-add>Добавить оружие</button>
      </div>

      <div class="weapons-list">
        ${listHtml}
      </div>

      <div class="sheet-card combat-abilities-card">
        <div class="combat-abilities-head">
          <h4 style="margin:0;">Умения и способности</h4>
          <button class="weapon-add-btn" type="button" data-combat-ability-add>Добавить</button>
        </div>

        <div class="combat-abilities-list">
          ${(() => {
            const arr = Array.isArray(vm?.combatAbilitiesEntries) ? vm.combatAbilitiesEntries : [];
            if (!arr.length) return `<div class="sheet-note">Пока пусто. Нажми «Добавить».</div>`;
            return arr.map((e, idx) => {
              const title = escapeHtml(String(e?.title || `Умение-${idx+1}`));
              const text = escapeHtml(String(e?.text || ""));
              const collapsed = !!e?.collapsed;
              return `
                <div class="combat-ability-item" data-combat-ability-idx="${idx}">
                  <div class="combat-ability-head">
                    <input class="weapon-title-input combat-ability-title" type="text"
                           value="${title}" placeholder="Название" data-combat-ability-title>
                    <div class="weapon-actions">
                      <button class="weapon-btn" type="button" data-combat-ability-toggle>${collapsed ? "Показать" : "Скрыть"}</button>
                      <button class="weapon-btn danger" type="button" data-combat-ability-del>Удалить</button>
                    </div>
                  </div>
                  <div class="combat-ability-body ${collapsed ? "collapsed" : ""}">
                    <textarea data-rtf="1" class="sheet-textarea combat-ability-text" rows="4"
                              placeholder="Описание..."
                              data-combat-ability-text>${text}</textarea>
                  </div>
                </div>
              `;
            }).join("");
          })()}
        </div>
      </div>
    </div>
  `;
}

  const EQUIP_TAB_DEFS = [
    { id: "weapons", label: "Оружие" },
    { id: "armor", label: "Доспехи" },
    { id: "adventuring_gear", label: "Снаряжение" },
    { id: "tools", label: "Инструменты" },
    { id: "mounts_animals", label: "Животные" },
    { id: "tack_vehicles", label: "Упряжь/Повозки" },
    { id: "water_vehicles", label: "Водный транспорт" },
    { id: "trade_goods", label: "Товары" },
    { id: "lifestyle_expenses", label: "Образ жизни" },
    { id: "other", label: "Другое" }
  ];

  function fmtCost(cost) {
    if (!cost || typeof cost !== "object") return "—";
    const a = (cost.amount ?? cost.value ?? "");
    const c = String(cost.coin || cost.coin_ru || "").toLowerCase();
    const RU = { cp: "мм", sp: "см", ep: "эм", gp: "зм", pp: "пм" };
    const coin = cost.coin_ru || RU[c] || cost.coin || "";
    if (a === "" && !coin) return "—";
    return `${escapeHtml(String(a))} ${escapeHtml(String(coin))}`.trim();
  }
function renderInvItemCard(item, tabId, idx, canEdit) {
  const it = item && typeof item === "object" ? item : {};
  const name = it.name_ru || it.name || it.name_en || "(без названия)";
  const qty = safeInt(it.qty, 1);

  const costObj = (it.cost && typeof it.cost === "object") ? it.cost : { amount: 0, coin: "gp" };
  const coinCode = String(costObj.coin || costObj.coin_ru || "gp").toLowerCase();
  const RU = { cp: "мм", sp: "см", ep: "эм", gp: "зм", pp: "пм" };
  const costText = fmtCost(costObj);

  const wObj = (it.weight && typeof it.weight === "object") ? it.weight : { lb: 0, text: "" };
  const wLb = (wObj.lb != null && wObj.lb !== "") ? safeInt(wObj.lb, 0) : 0;
  const wText = (wObj.text || (wObj.lb != null ? `${wLb} фн.` : "")) || "—";

  const desc = String(it.description_ru || it.desc_ru || it.desc || "").trim();
  const details = String(it.details_ru || it.long_description_ru || it.long_desc_ru || "").trim();

  const descCollapsed = !!it.descCollapsed;
  const detailsOpen = !!it.detailsOpen;

  const extra = (() => {
    if (it.type === "weapon" && it.weapon) {
      const dmg = it.weapon.damage ? `Урон: ${escapeHtml(String(it.weapon.damage))} (${escapeHtml(String(it.weapon.damage_type || ""))})` : "";
      const props = it.weapon.properties_ru ? `Свойства: ${escapeHtml(String(it.weapon.properties_ru))}` : "";
      return [dmg, props].filter(Boolean).map(t => `<div class="equip-meta">${t}</div>`).join("");
    }
    if (it.type === "armor" && it.armor) {
      const ac = it.armor.ac ? `КД: ${escapeHtml(String(it.armor.ac))}` : "";
      const st = (it.armor.str_req != null && String(it.armor.str_req).trim() !== "") ? `Сила: ${escapeHtml(String(it.armor.str_req))}` : "";
      const dis = it.armor.stealth_disadv ? `Помеха скрытности` : "";
      return [ac, st, dis].filter(Boolean).map(t => `<div class="equip-meta">${t}</div>`).join("");
    }
    return "";
  })();

  const costEditor = canEdit ? `
    <div class="equip-editline equip-editline--row">
      <div class="equip-editlbl">Цена</div>
      <input class="equip-editnum" type="number" min="0" max="999999" value="${escapeHtml(String(costObj.amount ?? 0))}"
        data-sheet-path="inventory.${escapeHtml(tabId)}.${idx}.cost.amount">
      <select class="equip-editcoin" data-sheet-path="inventory.${escapeHtml(tabId)}.${idx}.cost.coin">
        <option value="cp" ${coinCode==="cp"?"selected":""}>мм</option>
        <option value="sp" ${coinCode==="sp"?"selected":""}>см</option>
        <option value="ep" ${coinCode==="ep"?"selected":""}>эм</option>
        <option value="gp" ${coinCode==="gp"?"selected":""}>зм</option>
        <option value="pp" ${coinCode==="pp"?"selected":""}>пм</option>
      </select>

      <div class="equip-editspacer"></div>

      <div class="equip-editlbl">Вес</div>
      <input class="equip-editnum" type="number" min="0" max="999999" value="${escapeHtml(String(wLb))}"
        data-sheet-path="inventory.${escapeHtml(tabId)}.${idx}.weight.lb">
      <div class="equip-editunit">фн.</div>
    </div>
  ` : `
    <div class="equip-sub">
      <span class="equip-pill">Цена: ${costText}</span>
      <span class="equip-pill">Вес: ${escapeHtml(String(wText))}</span>
    </div>
  `;

  const descToggleBtn = `
    <button class="weapon-btn" type="button" data-inv-toggle-desc data-tab="${escapeHtml(tabId)}" data-idx="${idx}" title="Свернуть/развернуть описание">
      ${descCollapsed ? "Показать" : "Скрыть"}
    </button>
  `;

  const detailsToggleBtn = details ? `
    <button class="weapon-btn" type="button" data-inv-toggle-details data-tab="${escapeHtml(tabId)}" data-idx="${idx}" title="Подробное описание">
      ${detailsOpen ? "Скрыть описание" : "Описание"}
    </button>
  ` : "";

  const descBlock = canEdit
    ? `<textarea data-rtf="1" class="sheet-textarea equip-descedit ${descCollapsed ? "collapsed" : ""}" rows="3" data-sheet-path="inventory.${escapeHtml(tabId)}.${idx}.description_ru"
         placeholder="Описание...">${escapeHtml(desc)}</textarea>`
    : `<div class="equip-desc ${descCollapsed ? "collapsed" : ""}">${desc ? escapeHtml(desc) : `<span class="equip-desc--empty">—</span>`}</div>`;


  const detailsBlock = details
    ? `<div class="equip-details ${detailsOpen ? "" : "collapsed"}">${escapeHtml(details)}</div>`
    : "";

  return `
    <div class="equip-card" data-inv-item data-inv-tabid="${escapeHtml(tabId)}" data-inv-idx="${idx}">
      <div class="equip-head">
        <div class="equip-title">
          ${canEdit ? `<input class="equip-name" type="text" value="${escapeHtml(String(name))}" data-sheet-path="inventory.${escapeHtml(tabId)}.${idx}.name_ru">`
                   : `<div class="equip-name ro">${escapeHtml(String(name))}</div>`}
          ${costEditor}
        </div>

        <div class="equip-actions">
          <div class="equip-qty">
            <span class="equip-qty-lbl">x</span>
            <input class="equip-qty-in" type="number" min="1" max="999" value="${escapeHtml(String(qty))}" ${canEdit ? "" : "disabled"} data-sheet-path="inventory.${escapeHtml(tabId)}.${idx}.qty">
          </div>
          <button class="weapon-btn" type="button" ${canEdit ? "" : "disabled"} data-inv-sell data-tab="${escapeHtml(tabId)}" data-idx="${idx}">Продать</button>
          <button class="weapon-btn danger" type="button" ${canEdit ? "" : "disabled"} data-inv-del data-tab="${escapeHtml(tabId)}" data-idx="${idx}">Удалить</button>
          ${descToggleBtn}
          ${detailsToggleBtn}
        </div>
      </div>

      ${extra ? `<div class="equip-extra">${extra}</div>` : ""}
      ${descBlock}
      ${detailsBlock}
    </div>
  `;
}


  function renderInventoryTab(vm, canEdit) {
    const denom = String(vm?.coinsViewDenom || "gp").toLowerCase();

    const exchangeTooltip = `
      <div class="exchange-tooltip" role="tooltip">
        <div class="exchange-title">Обменный курс</div>
        <div class="exchange-table">
          <div class="ex-row ex-head">
            <div class="ex-cell">Монета</div>
            <div class="ex-cell">ММ</div>
            <div class="ex-cell">СМ</div>
            <div class="ex-cell">ЭМ</div>
            <div class="ex-cell">ЗМ</div>
            <div class="ex-cell">ПМ</div>
          </div>
          <div class="ex-row">
            <div class="ex-cell ex-coin ex-coin--cp">Медная (мм)</div>
            <div class="ex-cell">1</div>
            <div class="ex-cell">1/10</div>
            <div class="ex-cell">1/50</div>
            <div class="ex-cell">1/100</div>
            <div class="ex-cell">1/1,000</div>
          </div>
          <div class="ex-row">
            <div class="ex-cell ex-coin ex-coin--sp">Серебряная (см)</div>
            <div class="ex-cell">10</div>
            <div class="ex-cell">1</div>
            <div class="ex-cell">1/5</div>
            <div class="ex-cell">1/10</div>
            <div class="ex-cell">1/100</div>
          </div>
          <div class="ex-row">
            <div class="ex-cell ex-coin ex-coin--ep">Электрумовая (эм)</div>
            <div class="ex-cell">50</div>
            <div class="ex-cell">5</div>
            <div class="ex-cell">1</div>
            <div class="ex-cell">1/2</div>
            <div class="ex-cell">1/20</div>
          </div>
          <div class="ex-row">
            <div class="ex-cell ex-coin ex-coin--gp">Золотая (зм)</div>
            <div class="ex-cell">100</div>
            <div class="ex-cell">10</div>
            <div class="ex-cell">2</div>
            <div class="ex-cell">1</div>
            <div class="ex-cell">1/10</div>
          </div>
          <div class="ex-row">
            <div class="ex-cell ex-coin ex-coin--pp">Платиновая (пм)</div>
            <div class="ex-cell">1,000</div>
            <div class="ex-cell">100</div>
            <div class="ex-cell">20</div>
            <div class="ex-cell">10</div>
            <div class="ex-cell">1</div>
          </div>
        </div>
      </div>
    `;


    const coinBox = (key, title, abbr, row) => `
      <div class="coin-box" data-coin-box="${escapeHtml(key)}" data-coin-row="${row}">
        <div class="coin-top">
          <div class="coin-pill coin-pill--${escapeHtml(key)}">${escapeHtml(title)} <span class="coin-pill__abbr">(${escapeHtml(abbr)})</span></div>
        </div>

        <div class="coin-line">
          <input
            class="coin-value"
            type="number"
            min="0"
            max="999999"
            data-sheet-path="coins.${escapeHtml(key)}.value"
          />

          <div class="coin-adjust">
            <button class="coin-btn coin-btn--minus" data-coin-op="minus" data-coin-key="${escapeHtml(key)}">-</button>
            <input class="coin-delta" type="number" min="0" max="999999" value="1" data-coin-delta="${escapeHtml(key)}" />
            <button class="coin-btn coin-btn--plus" data-coin-op="plus" data-coin-key="${escapeHtml(key)}">+</button>
          </div>
        </div>
      </div>
    `;

    const totalBox = `
      <div class="coin-box coin-box--total" data-coin-box="total">
        <div class="coin-top coin-top--between">
          <div class="coin-pill">Итог</div>
          <select class="coin-select" data-coins-total-denom data-sheet-path="coinsView.denom">
            <option value="cp" ${denom === "cp" ? "selected" : ""}>мм</option>
            <option value="sp" ${denom === "sp" ? "selected" : ""}>см</option>
            <option value="ep" ${denom === "ep" ? "selected" : ""}>эм</option>
            <option value="gp" ${denom === "gp" ? "selected" : ""}>зм</option>
            <option value="pp" ${denom === "pp" ? "selected" : ""}>пм</option>
          </select>
        </div>

        <div class="coin-line">
          <input class="coin-value coin-total" type="text" readonly data-coins-total value="0" />
          <div class="coin-total-hint">по курсу D&D</div>
        </div>
      </div>
    `;

    return `
      <div class="sheet-section">
        <h3>Инвентарь</h3>

        <div class="sheet-card fullwidth coins-card">
          <div class="coins-head">
            <h4 style="margin:0">Монеты</h4>
            <div class="exchange-pill" tabindex="0">
              Обменный курс
              ${exchangeTooltip}
            </div>
          </div>

          <div class="coins-grid coins-grid--row1">
            ${coinBox("cp", "Медная", "мм", 1)}
            ${coinBox("sp", "Серебряная", "см", 1)}
            ${coinBox("gp", "Золотая", "зм", 1)}
          </div>

          <div class="coins-grid coins-grid--row2">
            ${coinBox("ep", "Электрумовая", "эм", 2)}
            ${coinBox("pp", "Платиновая", "пм", 2)}
            ${totalBox}
          </div>
        </div>

        <div class="sheet-card fullwidth" style="margin-top:10px" data-inventory-root>
          <div class="equip-topline">
            <h4 style="margin:0">База предметов (инвентарь)</h4>
            <div class="equip-top-actions">
              <button class="weapon-btn" type="button" ${canEdit ? "" : "disabled"} data-inv-open-db>База предметов</button>
              <button class="weapon-btn" type="button" ${canEdit ? "" : "disabled"} data-inv-add-manual>Добавить вручную</button>
            </div>
          </div>

          <div class="equip-subtabs" role="tablist">
            ${(EQUIP_TAB_DEFS).map(t => {
              const active = String(vm?.inventory?.activeTab || "weapons") === t.id;
              return `<button class="equip-subtab ${active ? "active" : ""}" type="button" data-inv-subtab="${escapeHtml(t.id)}">${escapeHtml(t.label)}</button>`;
            }).join("")}
          </div>

          <div class="equip-list" data-inv-list>
            ${(() => {
              const inv = vm?.inventory && typeof vm.inventory === "object" ? vm.inventory : null;
              const tabId = String(inv?.activeTab || "weapons");
              const arr = Array.isArray(inv?.[tabId]) ? inv[tabId] : [];
              if (!arr.length) return `<div class="sheet-note">Пока пусто. Нажми «База предметов» или «Добавить вручную».</div>`;
              return arr.map((it, idx) => renderInvItemCard(it, tabId, idx, canEdit)).join("");
            })()}
          </div>

          <div class="sheet-note" style="margin-top:10px; opacity:0.85">
            Legacy-поля ниже оставлены для совместимости старых сохранений (можно не использовать).
          </div>
          <div class="equip-legacy">
            <div class="kv" style="margin-top:8px"><div class="k">Предметы (legacy)</div><div class="v" style="width:100%"><textarea data-rtf="1" class="sheet-textarea" rows="4" data-sheet-path="text.inventoryItems.value" placeholder="Список предметов..."></textarea></div></div>
            <div class="kv" style="margin-top:8px"><div class="k">Сокровища (legacy)</div><div class="v" style="width:100%"><textarea data-rtf="1" class="sheet-textarea" rows="4" data-sheet-path="text.inventoryTreasures.value" placeholder="Сокровища..."></textarea></div></div>
          </div>
        </div>
      </div>
    `;
  }
function renderShopTab(vm, canEdit) {
  return `
    <div class="sheet-section" data-shop-root>
      <h3>Магазин</h3>

      <div class="sheet-card fullwidth">
        <div class="equip-topline">
          <h4 style="margin:0">Каталог SRD</h4>
          <div class="equip-top-actions">
            <button class="weapon-btn" type="button" ${canEdit ? "" : "disabled"} data-shop-open-db>Открыть снова</button>
          </div>
        </div>

        <div class="sheet-note">
          Каталог открывается поверх листа персонажа. Выбирай предметы и покупай за монеты — они сразу попадут в инвентарь (и оружие — в «Бой»).
        </div>
      </div>
    </div>
  `;
}


  function renderPersonalityTab(vm) {
    const genderVal = String(vm?.gender || "male");
    return `
      <div class="sheet-section">
        <h3>Личность</h3>

        <div class="sheet-grid-2">
          <div class="sheet-card">
            <h4>Внешность</h4>
            <div class="notes-details-grid">
              <div class="kv"><div class="k">Пол</div><div class="v">
                <select data-sheet-path="notes.details.gender.value" data-gender-select style="width:150px">
                  <option value="male" ${genderVal==="male"?"selected":""}>Мужской</option>
                  <option value="female" ${genderVal==="female"?"selected":""}>Женский</option>
                </select>
              </div></div>
              <div class="kv"><div class="k">Рост</div><div class="v"><input type="text" data-sheet-path="notes.details.height.value" style="width:140px"></div></div>
              <div class="kv"><div class="k">Вес</div><div class="v"><input type="text" data-sheet-path="notes.details.weight.value" style="width:140px"></div></div>
              <div class="kv"><div class="k">Возраст</div><div class="v"><input type="text" data-sheet-path="notes.details.age.value" style="width:140px"></div></div>
              <div class="kv"><div class="k">Глаза</div><div class="v"><input type="text" data-sheet-path="notes.details.eyes.value" style="width:140px"></div></div>
              <div class="kv"><div class="k">Кожа</div><div class="v"><input type="text" data-sheet-path="notes.details.skin.value" style="width:140px"></div></div>
              <div class="kv"><div class="k">Волосы</div><div class="v"><input type="text" data-sheet-path="notes.details.hair.value" style="width:140px"></div></div>
            </div>
          </div>

          <div class="sheet-card">
            <h4>Предыстория персонажа</h4>
            <textarea data-rtf="1" class="sheet-textarea" rows="6" data-sheet-path="personality.backstory.value" placeholder="Кратко опиши предысторию..."></textarea>
          </div>

          <div class="sheet-card">
            <h4>Союзники и организации</h4>
            <textarea data-rtf="1" class="sheet-textarea" rows="6" data-sheet-path="personality.allies.value" placeholder="Союзники, контакты, гильдии..."></textarea>
          </div>

          <div class="sheet-card">
            <h4>Черты характера</h4>
            <textarea data-rtf="1" class="sheet-textarea" rows="5" data-sheet-path="personality.traits.value"></textarea>
          </div>

          <div class="sheet-card">
            <h4>Идеалы</h4>
            <textarea data-rtf="1" class="sheet-textarea" rows="5" data-sheet-path="personality.ideals.value"></textarea>
          </div>

          <div class="sheet-card">
            <h4>Привязанности</h4>
            <textarea data-rtf="1" class="sheet-textarea" rows="5" data-sheet-path="personality.bonds.value"></textarea>
          </div>

          <div class="sheet-card">
            <h4>Слабости</h4>
            <textarea data-rtf="1" class="sheet-textarea" rows="5" data-sheet-path="personality.flaws.value"></textarea>
          </div>
        </div>
      </div>
    `;
  }

  function renderNotesTab(vm) {
    const entries = Array.isArray(vm?.notesEntries) ? vm.notesEntries : [];
    const renderEntry = (e, idx) => {
      const title = (e && typeof e.title === "string" && e.title) ? e.title : `Заметка-${idx + 1}`;
      const text = (e && typeof e.text === "string") ? e.text : "";
      const collapsed = !!(e && e.collapsed);
      return `
        <div class="note-card" data-note-idx="${idx}">
          <div class="note-header">
            <input class="note-title" type="text" value="${escapeHtml(title)}" data-note-title="${idx}" />
            <div class="note-actions">
              <button class="note-btn" data-note-toggle="${idx}">${collapsed ? "Показать" : "Скрыть"}</button>
              <button class="note-btn danger" data-note-del="${idx}">Удалить</button>
            </div>
          </div>
          <div class="note-body ${collapsed ? "collapsed" : ""}">
            <textarea data-rtf="1" class="sheet-textarea note-text" rows="6" data-note-text="${idx}" placeholder="Текст заметки...">${escapeHtml(text)}</textarea>
          </div>
        </div>
      `;
    };

    return `
      <div class="sheet-section">
        <h3>Заметки</h3>

        <div class="sheet-card notes-fullwidth">
          <h4>Быстрые заметки</h4>
          <div class="notes-toolbar">
            <button class="note-add-btn" data-note-add>Добавить заметку</button>
          </div>
          <div class="notes-list">
            ${entries.length ? entries.map(renderEntry).join("") : `<div class="sheet-note">Пока нет заметок. Нажми «Добавить заметку».</div>`}
          </div>
        </div>
      </div>
    `;
  }

  function renderAppearanceTab(vm, canEdit) {
    const baseUrl = String(vm?.appearanceBaseUrl || "");
    // Inventory lists (new format): vm.inventory.weapons / vm.inventory.armor
    const inv = (vm?.inventory && typeof vm.inventory === 'object') ? vm.inventory : {};
    const weapons = Array.isArray(inv.weapons) ? inv.weapons : [];
    const armor = Array.isArray(inv.armor) ? inv.armor : [];

    const optNone = `<option value="">—</option>`;
    const weaponOptions = optNone + weapons.map((it, i) => {
      const name = escapeHtml(String(it?.name_ru || it?.name || it?.title || it?.name_en || `Оружие-${i+1}`));
      const val = escapeHtml(String(it?.id || it?.name_ru || it?.name || it?.title || ""));
      return `<option value="${val}">${name}</option>`;
    }).join('');
    const armorOptions = optNone + armor
      .filter(a => String(a?.armor?.type || '').toLowerCase() !== 'shield' && !/щит/i.test(String(a?.name_ru||a?.name||a?.title||"")))
      .map((it, i) => {
        const name = escapeHtml(String(it?.name_ru || it?.name || it?.title || it?.name_en || `Доспех-${i+1}`));
        const val = escapeHtml(String(it?.id || it?.name_ru || it?.name || it?.title || ""));
        return `<option value="${val}">${name}</option>`;
      }).join('');
    const shieldOptions = optNone + armor
      .filter(a => String(a?.armor?.type || '').toLowerCase() === 'shield' || /щит/i.test(String(a?.name_ru||a?.name||a?.title||"")))
      .map((it, i) => {
        const name = escapeHtml(String(it?.name_ru || it?.name || it?.title || it?.name_en || `Щит-${i+1}`));
        const val = escapeHtml(String(it?.id || it?.name_ru || it?.name || it?.title || ""));
        return `<option value="${val}">${name}</option>`;
      }).join('');

    return `
      <div class="sheet-section" data-appearance-root>
        <h3>Облик</h3>

        <div class="sheet-card fullwidth">
          <div class="appearance-layout">
            <div class="appearance-left">
              <div class="appearance-preview-wrap">
                <img class="appearance-preview" data-appearance-preview src="${escapeHtml(baseUrl)}" alt="Облик" />
              </div>
              <div class="kv" style="margin-top:10px">
                <div class="k">Ссылка на базовую картинку</div>
                <div class="v" style="width:100%">
                  <input type="text" data-sheet-path="appearance.baseUrl" placeholder="(необязательно)" ${canEdit ? "" : "disabled"} style="width:100%" data-appearance-base-override>
                </div>
              </div>
            </div>

            <div class="appearance-right">
              <div class="appearance-slots">
                <div class="appearance-slot">
                  <div class="lbl">Правая рука</div>
                  <select data-sheet-path="appearance.slots.right" data-appearance-slot="right" ${canEdit ? "" : "disabled"}>${weaponOptions}</select>
                </div>
                <div class="appearance-slot">
                  <div class="lbl">Левая рука</div>
                  <select data-sheet-path="appearance.slots.left" data-appearance-slot="left" ${canEdit ? "" : "disabled"}>${weaponOptions}</select>
                </div>
                <div class="appearance-slot">
                  <div class="lbl">Щит</div>
                  <select data-sheet-path="appearance.slots.shield" data-appearance-slot="shield" ${canEdit ? "" : "disabled"}>${shieldOptions}</select>
                  <div class="appearance-armor-meta" data-armor-meta="shield">
                    <div class="meta-grid">
                      <div class="meta-item">
                        <div class="meta-lbl">Тип</div>
                        <div class="meta-val">Щит</div>
                      </div>
                      <div class="meta-item">
                        <div class="meta-lbl">Щит КД</div>
                        <input class="meta-input" type="number" min="0" max="20" data-sheet-path="appearance.shieldRules.bonus" ${canEdit ? "" : "disabled"}>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="appearance-slot">
                  <div class="lbl appearance-lbl-row">
                    <span>Доспех</span>
                    <label class="appearance-prof-toggle" title="Добавить бонус владения к КД (если выбран доспех)">
                      <input type="checkbox" data-sheet-path="appearance.armorRules.addProf" data-armor-prof ${canEdit ? "" : "disabled"}>
                      <span>Владение</span>
                    </label>
                  </div>
                  <select data-sheet-path="appearance.slots.armor" data-appearance-slot="armor" ${canEdit ? "" : "disabled"}>${armorOptions}</select>
                  <div class="appearance-armor-meta" data-armor-meta="armor">
                    <div class="meta-grid">
                      <div class="meta-item">
                        <div class="meta-lbl">Тип</div>
                        <div class="meta-val">Доспехи</div>
                      </div>
                      <div class="meta-item">
                        <div class="meta-lbl">КД</div>
                        <input class="meta-input" type="number" min="0" max="30" data-sheet-path="appearance.armorRules.base" ${canEdit ? "" : "disabled"}>
                      </div>
                      <div class="meta-item">
                        <div class="meta-lbl">Мод.</div>
                        <select class="meta-select" data-sheet-path="appearance.armorRules.modStat" ${canEdit ? "" : "disabled"}>
                          <option value="-">—</option>
                          <option value="str">СИЛ</option>
                          <option value="dex">ЛОВ</option>
                          <option value="con">ТЕЛ</option>
                          <option value="int">ИНТ</option>
                          <option value="wis">МДР</option>
                          <option value="cha">ХАР</option>
                        </select>
                      </div>
                      <div class="meta-item">
                        <div class="meta-lbl">Макс.</div>
                        <input class="meta-input" type="number" min="1" max="10" data-sheet-path="appearance.armorRules.max" placeholder="—" ${canEdit ? "" : "disabled"}>
                      </div>
                    </div>
                  </div>

                  <!-- Token display settings (separate framed box) -->
                  <div class="appearance-tokenbox" data-tokenbox>
                    <div class="appearance-tokenbox__title">Токен на поле</div>
                    <div class="appearance-tokenbox__body">
                      <div class="appearance-tokenbox__preview" data-token-preview aria-label="Превью токена"></div>

                      <div class="appearance-tokenbox__controls">
                        <div class="appearance-tokenbox__modes">
                          <label class="token-mode">
                            <input type="radio" name="tokenMode" value="color" data-sheet-path="appearance.token.mode" ${canEdit ? "" : "disabled"}>
                            <span>Цвет</span>
                          </label>
                          <label class="token-mode">
                            <input type="radio" name="tokenMode" value="full" data-sheet-path="appearance.token.mode" ${canEdit ? "" : "disabled"}>
                            <span>Облик целиком</span>
                          </label>
                          <label class="token-mode">
                            <input type="radio" name="tokenMode" value="crop" data-sheet-path="appearance.token.mode" ${canEdit ? "" : "disabled"}>
                            <span>Выбрать область</span>
                          </label>
                        </div>

                        <div class="appearance-tokenbox__crop" data-token-crop>
                          <div class="token-crop-row">
                            <div class="token-crop-lbl">X</div>
                            <input type="range" min="0" max="100" step="1" data-sheet-path="appearance.token.crop.x" ${canEdit ? "" : "disabled"}>
                          </div>
                          <div class="token-crop-row">
                            <div class="token-crop-lbl">Y</div>
                            <input type="range" min="0" max="100" step="1" data-sheet-path="appearance.token.crop.y" ${canEdit ? "" : "disabled"}>
                          </div>
                          <div class="token-crop-row">
                            <div class="token-crop-lbl">Зум</div>
                            <input type="range" min="80" max="220" step="1" data-sheet-path="appearance.token.crop.zoom" ${canEdit ? "" : "disabled"}>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }


  function renderActiveTab(tabId, vm, canEdit) {
    if (tabId === "basic") return renderBasicTab(vm, canEdit);
    if (tabId === "spells") return renderSpellsTab(vm);
    if (tabId === "combat") return renderCombatTab(vm);
    if (tabId === "inventory") return renderInventoryTab(vm, canEdit);
    if (tabId === "shop") return renderShopTab(vm, canEdit);
    if (tabId === "personality") return renderPersonalityTab(vm);
    if (tabId === "appearance") return renderAppearanceTab(vm, canEdit);
    if (tabId === "notes") return renderNotesTab(vm);
    return `<div class="sheet-note">Раздел в разработке</div>`;
  }

  // ================== RENDER MODAL ==================
  function renderSheetModal(player, opts = {}) {
    if (!sheetTitle || !sheetSubtitle || !sheetActions || !sheetContent) return;
    if (!ctx) return;

    const force = !!opts.force;
    // Если пользователь сейчас редактирует что-то внутри модалки — не перерисовываем, чтобы не прыгал скролл/вкладка.
    if (!force && player?.id && isModalBusy(player.id)) {
      return;
    }

    // сохраняем текущую вкладку/скролл перед любым ререндером
    captureUiStateFromDom(player);

    const myRole = ctx.getMyRole?.();
    const myId = ctx.getMyId?.();
    const canEdit = (myRole === "GM" || String(player.ownerId) === String(myId));
    lastCanEdit = !!canEdit;

    const shieldEquipped = !!String(player?.sheet?.parsed?.appearance?.slots?.shield || '').trim();

    sheetTitle.textContent = `Инфа: ${player.name}`;
    sheetSubtitle.textContent = `Владелец: ${player.ownerName || 'Unknown'} • Тип: ${player.isBase ? 'Основа' : '-'}`;

    ensurePlayerSheetWrapper(player);

    sheetActions.innerHTML = '';
    const note = document.createElement('div');
    note.className = 'sheet-note';
    note.textContent = canEdit
      ? "Можно загрузить .json (Long Story Short/Charbox) или редактировать поля вручную — всё сохраняется."
      : "Просмотр. Редактировать может только владелец или GM.";
    sheetActions.appendChild(note);

    if (canEdit) {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.json,application/json';

      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;

        try {
          const text = await file.text();
          const sheet = parseCharboxFileText(text);
          player.sheet = sheet;
          ctx.sendMessage({ type: "setPlayerSheet", id: player.id, sheet });

          // Мгновенно обновляем UI (не ждём round-trip через сервер)
          // и при этом не сбрасываем вкладку/скролл.
          markModalInteracted(player.id);
          renderSheetModal(player, { force: true });

          const tmp = document.createElement('div');
          tmp.className = 'sheet-note';
          tmp.textContent = "Файл отправлен. Сейчас обновится состояние…";
          sheetActions.appendChild(tmp);
        } catch (err) {
          alert("Не удалось прочитать/распарсить файл .json");
          console.error(err);
        } finally {
          fileInput.value = '';
        }
      });

      sheetActions.appendChild(fileInput);

      // ===== Мои сохранённые персонажи (привязка к уникальному userId) =====
      // Работает даже если пользователь заходит под разными никами.
      // Сохраняем/загружаем только для персонажа "Основа".
      const savedWrap = document.createElement('div');
      savedWrap.className = 'saved-bases-actions';

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.textContent = 'Сохранить основу';
      saveBtn.title = 'Сохранить текущую "Инфу" в ваш личный список (по userId)';

      const loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.textContent = 'Загрузить основу';
      loadBtn.title = 'Открыть список сохранённых персонажей и выбрать, кого загрузить';

      // доступно только если это действительно "Основа"
      if (!player.isBase) {
        saveBtn.disabled = true;
        loadBtn.disabled = true;
      }

      saveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!player.isBase) return;
        try {
          const raw = player.sheet || { parsed: createEmptySheet(player.name) };
          // normalize before saving so that fresh bases always contain skills/stats/etc.
          try {
            if (raw && raw.parsed) raw.parsed = ensureSheetShape(raw.parsed, player.name);
          } catch {}
          const sheet = raw;
          ctx?.sendMessage?.({
            type: 'saveSavedBase',
            playerId: player.id,
            sheet
          });
        } catch (err) {
          console.error(err);
          alert('Не удалось сохранить');
        }
      });

      loadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!player.isBase) return;
        openSavedBasesOverlay({ loading: true, playerId: player.id });
        try {
          ctx?.sendMessage?.({ type: 'listSavedBases' });
        } catch (err) {
          console.error(err);
        }
      });

      savedWrap.appendChild(saveBtn);
      savedWrap.appendChild(loadBtn);
      sheetActions.appendChild(savedWrap);
    }

    // Players created without importing a .json may carry a minimal sheet payload.
    // Normalize it once here so both render + bindings can rely on a full structure.
    let sheet = player.sheet?.parsed;
    if (!sheet || typeof sheet !== 'object') sheet = createEmptySheet(player.name);
    sheet = ensureSheetShape(sheet, player.name);
    if (!player.sheet || typeof player.sheet !== 'object') player.sheet = { source: 'manual', importedAt: Date.now(), raw: null, parsed: sheet };
    else player.sheet.parsed = sheet;

    const vm = toViewModel(sheet, player.name);

    const tabs = [
      { id: "basic", label: "Основное" },
      { id: "spells", label: "Заклинания" },
      { id: "combat", label: "Бой" },
      { id: "inventory", label: "Инвентарь" },
      { id: "shop", label: "Магазин" },
      { id: "personality", label: "Личность" },
      { id: "appearance", label: "Облик" },
      { id: "notes", label: "Заметки" }
    ];

    // восстановление вкладки (если была)
    const st = player?.id ? getUiState(player.id) : null;
    if (!player._activeSheetTab) player._activeSheetTab = (st?.activeTab || "basic");
    let activeTab = player._activeSheetTab;

    const hero = `
      <div class="sheet-hero">
        <div class="sheet-hero-top">
          <div>
            <div class="sheet-hero-title">${escapeHtml(vm.name)}</div>
            <div class="sheet-hero-sub">
              ${escapeHtml(vm.cls)} • lvl ${escapeHtml(vm.lvl)} • ${escapeHtml(vm.race)}
            </div>
          </div>
          <div class="sheet-chips">
            <div class="sheet-chip sheet-chip--insp" data-hero="insp" title="Вдохновение" ${canEdit ? "" : "data-readonly"}>
              <div class="k">Вдохновение</div>
              <svg class="insp-star ${vm.inspiration ? "on" : ""}" viewBox="0 0 24 24" aria-label="Вдохновение" role="img">
                <path d="M12 2.6l2.93 5.94 6.56.95-4.75 4.63 1.12 6.53L12 17.9l-5.86 3.08 1.12-6.53L2.5 9.49l6.56-.95L12 2.6z"></path>
              </svg>
            </div>
            <div class="sheet-chip" data-hero="prof" title="Бонус мастерства">
              <div class="k">Владение</div>
              <input class="sheet-chip-input" type="number" min="0" max="10" ${canEdit ? "" : "disabled"} data-sheet-path="proficiency" value="${escapeHtml(String(vm.profBonus))}">
            </div>

            <div class="sheet-chip" data-hero="ac">
              <div class="k">Броня
                <svg class="ac-shield-icon ${shieldEquipped ? "on" : ""}" data-ac-shield-icon viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2l8 4v6c0 5-3.5 9.5-8 10-4.5-.5-8-5-8-10V6l8-4z"></path>
                </svg>
              </div>
              <input class="sheet-chip-input" type="number" min="0" max="40" ${canEdit ? "" : "disabled"} data-sheet-path="vitality.ac.value" data-hero-val="ac" value="${escapeHtml(String(vm.ac))}">
            </div>
            <div class="sheet-chip sheet-chip--hp" data-hero="hp" data-hp-open role="button" tabindex="0" style="--hp-fill-pct:${escapeHtml(String(vm.hp ? Math.max(0, Math.min(100, Math.round((Number(vm.hpCur) / Math.max(1, Number(vm.hp))) * 100))) : 0))}%">
              <div class="hp-liquid" aria-hidden="true"></div>
              <div class="k">Здоровье</div>
              <div class="v" data-hero-val="hp">${escapeHtml(String((Number(vm.hpTemp)||0)>0 ? `(${Number(vm.hpTemp)}) ${vm.hpCur}/${vm.hp}` : `${vm.hpCur}/${vm.hp}`))}</div>
            </div>
            <div class="sheet-chip" data-hero="speed">
              <div class="k">Скорость</div>
              <input class="sheet-chip-input" type="number" min="0" max="200" ${canEdit ? "" : "disabled"} data-sheet-path="vitality.speed.value" data-hero-val="speed" value="${escapeHtml(String(vm.spd))}">
            </div>
          </div>
          </div>
        </div>
      </div>
    `;

    const shopTab = tabs.find(t => t.id === "shop");
    const mainTabs = tabs.filter(t => t.id !== "shop");

    const sidebarHtml = `
      <div class="sheet-sidebar">
        ${mainTabs.map(t => `
          <button class="sheet-tab ${t.id === activeTab ? "active" : ""}" data-tab="${t.id}">
            ${escapeHtml(t.label)}
          </button>
        `).join("")}

        <div class="sheet-tab-sep"></div>

        ${shopTab ? `
          <button class="sheet-tab sheet-tab--shop ${shopTab.id === activeTab ? "active" : ""}" data-tab="${shopTab.id}">
            ${escapeHtml(shopTab.label)}
          </button>
        ` : ""}
      </div>
    `;

    const mainHtml = `
      <div class="sheet-main" id="sheet-main">
        ${renderActiveTab(activeTab, vm, canEdit)}
      </div>
    `;

    sheetContent.innerHTML = `
      ${hero}
      <div class="sheet-layout">
        ${sidebarHtml}
        ${mainHtml}
      </div>
    `;

    // восстанавливаем скролл после рендера
    restoreUiStateToDom(player);

    // отмечаем взаимодействие, чтобы state-обновления не ломали скролл
    const mainEl = sheetContent.querySelector('#sheet-main');
    mainEl?.addEventListener('scroll', () => {
      markModalInteracted(player.id);
      // и сохраняем текущий скролл в uiState
      captureUiStateFromDom(player);
    }, { passive: true });

    sheetContent.addEventListener('pointerdown', () => markModalInteracted(player.id), { passive: true });
    sheetContent.addEventListener('keydown', () => markModalInteracted(player.id), { passive: true });

    bindEditableInputs(sheetContent, player, canEdit);
    bindLanguagesUi(sheetContent, player, canEdit);
    bindSkillBoostDots(sheetContent, player, canEdit);
    bindSaveProfDots(sheetContent, player, canEdit);
    bindStatRollButtons(sheetContent, player);
    bindAbilityAndSkillEditors(sheetContent, player, canEdit);
    bindNotesEditors(sheetContent, player, canEdit);
    bindSlotEditors(sheetContent, player, canEdit);
    bindSpellAddAndDesc(sheetContent, player, canEdit);
    bindCombatEditors(sheetContent, player, canEdit);
    bindInventoryEditors(sheetContent, player, canEdit);
    bindEquipmentUi(sheetContent, player, canEdit);
    bindAppearanceUi(sheetContent, player, canEdit);
    updateCoinsTotal(sheetContent, player.sheet?.parsed);
    // Авто-открытие магазина поверх листа при выборе вкладки
    // (раньше тут по ошибке использовался tabId вне области видимости)
    if (activeTab === "shop") {
      try { window.__equipUi?.open?.("buy"); } catch {}
    }

    // важное: быстрые клики "Вдохновение" / "Истощение" / "Состояние"
    // (на некоторых браузерах клики по input могут не доходить, если он disabled)
    wireQuickBasicInteractions(sheetContent);

    const tabButtons = sheetContent.querySelectorAll(".sheet-tab");
    const main = sheetContent.querySelector("#sheet-main");

    tabButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        const tabId = btn.dataset.tab;
        if (!tabId) return;

        activeTab = tabId;
        player._activeSheetTab = tabId;
        if (player?.id) { const st = getUiState(player.id); st.activeTab = tabId; }

        tabButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        if (main) {
          const freshSheet = player.sheet?.parsed || createEmptySheet(player.name);
          const freshVm = toViewModel(freshSheet, player.name);
          main.innerHTML = renderActiveTab(activeTab, freshVm, canEdit);

          bindEditableInputs(sheetContent, player, canEdit);
          bindSkillBoostDots(sheetContent, player, canEdit);
          bindSaveProfDots(sheetContent, player, canEdit);
          bindStatRollButtons(sheetContent, player);
          bindAbilityAndSkillEditors(sheetContent, player, canEdit);
          bindNotesEditors(sheetContent, player, canEdit);
          bindSlotEditors(sheetContent, player, canEdit);
          bindSpellAddAndDesc(sheetContent, player, canEdit);
          bindCombatEditors(sheetContent, player, canEdit);
          bindInventoryEditors(sheetContent, player, canEdit);
          bindEquipmentUi(sheetContent, player, canEdit);
          bindLanguagesUi(sheetContent, player, canEdit);
          updateCoinsTotal(sheetContent, player.sheet?.parsed);
    // Авто-открытие магазина поверх листа при выборе вкладки
    // (раньше тут по ошибке использовался tabId вне области видимости)
    if (activeTab === "shop") {
      try { window.__equipUi?.open?.("buy"); } catch {}
    }
        }
      });
    });

    // (скролл/взаимодействия уже повешены выше)
  }

  // ================== PUBLIC API ==================
  function init(context) {
    ctx = context || null;
    // expose for split modules (saved bases, etc.)
    window.__sheetCtx = ctx;
    ensureWiredCloseHandlers();
  }

  function open(player) {
    if (!player) return;
    openedSheetPlayerId = player.id;
    rememberPlayersSnapshot([player]);
    renderSheetModal(player);
    openModal();
  }

  function refresh(players) {
    if (!openedSheetPlayerId) return;
    if (!Array.isArray(players)) return;
    rememberPlayersSnapshot(players);
    const pl = players.find(x => x.id === openedSheetPlayerId);
    if (pl) renderSheetModal(pl);
  }

  // callbacks are called from client.js when server answers
  function onSavedBasesList(list) {
    // если модалка уже открыта — показываем список поверх
    openSavedBasesOverlay({ loading: false, playerId: savedBasesOverlayPlayerId || openedSheetPlayerId });
    renderSavedBasesList(list);
  }

  function onSavedBaseSaved(msg) {
    try {
      // лёгкое уведомление в actions
      const t = document.createElement('div');
      t.className = 'sheet-note';
      t.textContent = `Сохранено: ${msg?.name || 'Персонаж'}`;
      sheetActions?.appendChild(t);
      setTimeout(() => { try { t.remove(); } catch {} }, 2600);
    } catch {}
  }

  function onSavedBaseApplied() {
    // сервер уже применил sheet и разошлёт state
    closeSavedBasesOverlay();
  }

  function onSavedBaseDeleted(msg) {
    // удалили — просто перезапросим список
    try {
      openSavedBasesOverlay({ loading: true, playerId: savedBasesOverlayPlayerId || openedSheetPlayerId });
      ctx?.sendMessage?.({ type: 'listSavedBases' });
    } catch {}
  }

  window.InfoModal = {
    init,
    open,
    refresh,
    close: closeModal,
    onSavedBasesList,
    onSavedBaseSaved,
    onSavedBaseApplied,
    onSavedBaseDeleted
  };
