// ================== SPELLS MODULE ==================
// Extracted from sheet-modal-bindings.js to keep spell parsing/fetch/UI logic isolated
// while preserving the same global function names and initialization order.

// ===== add spells by URL + toggle descriptions =====
function normalizeDndSuUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  // accept  links only (spells)
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    
    // normalize trailing slash
    let href = parsed.href;
    if (!href.endsWith("/")) href += "/";
    return href;
  } catch {
    return "";
  }
}

async function fetchSpellHtml(url) {
  // GitHub Pages = статик: прямой fetch к  блокируется CORS.
  // Поэтому порядок такой:
  // 1) Supabase Edge Function (invoke) если доступен
  // 2) Supabase Edge Function по полному URL (если так задано)
  // 3) Fallback через r.jina.ai (read-only прокси)
  // НИКАКИХ /api/fetch и НИКАКИХ прямых запросов к  на статике.

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



function deleteSpellSaved(sheet, href, onlyLevel) {
  if (!sheet || !href) return;

  if (!sheet.text || typeof sheet.text !== "object") sheet.text = {};

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

  function removeFromLevel(lvl) {
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

  // Back-compat: если уровень не указан — удаляем везде (как раньше)
  const lvlNum = (onlyLevel === undefined || onlyLevel === null || onlyLevel === "") ? null : safeInt(onlyLevel, -1);

  if (lvlNum === null) {
    for (let lvl = 0; lvl <= 9; lvl++) removeFromLevel(lvl);
    delete sheet.text[`spell-name:${href}`];
    delete sheet.text[`spell-desc:${href}`];
    return;
  }

  // Новое поведение: удалить ТОЛЬКО из выбранного уровня
  if (lvlNum >= 0 && lvlNum <= 9) removeFromLevel(lvlNum);

  // Meta (name/desc) удаляем только если ссылка больше не встречается НИГДЕ
  const stillUsed = (() => {
    for (let lvl = 0; lvl <= 9; lvl++) {
      // plain list
      const plainKey = `spells-level-${lvl}-plain`;
      const cur = String(sheet.text?.[plainKey]?.value ?? "");
      if (cur && cur.includes(href)) return true;

      // tiptap doc
      const tipKey = `spells-level-${lvl}`;
      const tip = sheet.text?.[tipKey];
      const docRaw = tip?.value?.data;
      const doc = normalizeDoc(docRaw);
      if (doc && Array.isArray(doc.content) && doc.content.some(block => docHasHref(block))) return true;
    }
    return false;
  })();

  if (!stillUsed) {
    delete sheet.text[`spell-name:${href}`];
    delete sheet.text[`spell-desc:${href}`];
    try {
      if (sheet.spellActions && typeof sheet.spellActions === 'object') delete sheet.spellActions[href];
    } catch {}
  }
}

function getSpellActionConfig(sheet, href) {
  try {
    if (!sheet || !href) return null;
    const raw = sheet?.spellActions?.[href];
    if (!raw || typeof raw !== 'object') return null;
    const type = String(raw.type || '').trim().toLowerCase();
    const rangeFeet = Math.max(0, safeInt(raw.rangeFeet, 0));
    if (!type && !rangeFeet) return null;
    return { type, rangeFeet };
  } catch {
    return null;
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
  const openSpellUrls = new Set(
    Array.from(main.querySelectorAll('.spell-item[data-spell-url] .spell-item-desc:not(.hidden)'))
      .map(el => el.closest('.spell-item')?.getAttribute('data-spell-url') || '')
      .filter(Boolean)
  );

  const freshVm = toViewModel(sheet, player.name);
  main.innerHTML = renderSpellsTab(freshVm);

  if (openSpellUrls.size) {
    main.querySelectorAll('.spell-item[data-spell-url]').forEach(item => {
      const href = item.getAttribute('data-spell-url') || '';
      if (!href || !openSpellUrls.has(href)) return;
      item.querySelector('.spell-item-desc')?.classList.remove('hidden');
      item.querySelector('[data-spell-desc-toggle]')?.classList.add('is-open');
    });
  }

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

    // 0) актуальная разметка  (список классов):
    // <li class="if-list__item" data-value="21"><div class="if-list__item-title">Волшебник</div></li>
    // выбранный класс: class="if-list__item active"
    const liItems = Array.from(doc.querySelectorAll('li.if-list__item[data-value]'));
    if (liItems.length) {
      liItems.forEach(li => {
        const val = String(li.getAttribute('data-value') || '').trim();
        const label = (li.querySelector('.if-list__item-title')?.textContent || li.textContent || '').trim();
        if (!val || !label) return;
        out.push({ value: val, label, url: `/spells/?class=${encodeURIComponent(val)}` });
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
        out.push({ value: val, label, url: `/spells/?class=${encodeURIComponent(val)}` });
      });
    }

    // 2) fallback: ищем ссылки ?class=
    if (!out.length) {
      const seen = new Set();
      doc.querySelectorAll('a[href*="?class="]').forEach(a => {
        const href = a.getAttribute("href") || "";
        try {
          const u = new URL(href, "");
          const val = u.searchParams.get("class");
          const label = (a.textContent || "").trim();
          if (!val || !label) return;
          if (seen.has(val)) return;
          seen.add(val);
          out.push({ value: val, label, url: `/spells/?class=${encodeURIComponent(val)}` });
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
    const u = new URL(String(href || ""), "");
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
        <div class="sheet-note">Вставь ссылку на  (пример: /spells/9-bless/)</div>
        <input class="popup-field" type="text" placeholder="/spells/..." data-link-input>
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
        alert("Нужна корректная ссылка/spells/... (пример: /spells/9-bless/)");
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
        alert("Не удалось получить описание по ссылке. Проверь ссылку.");
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

