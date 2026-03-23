(function () {
  const MONSTER_JSON_URL = './srd5_1_monsters_extracted.json';
  let monsterDbPromise = null;
  let monsterSheetStylesReady = false;
  const saveTimers = new Map();

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function toInt(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
  }

  function get(obj, path, fallback = null) {
    try {
      const parts = String(path || '').split('.').filter(Boolean);
      let cur = obj;
      for (const part of parts) {
        if (cur == null || typeof cur !== 'object') return fallback;
        cur = cur[part];
      }
      return (typeof cur === 'undefined') ? fallback : cur;
    } catch {
      return fallback;
    }
  }

  function set(obj, path, value) {
    const parts = String(path || '').split('.').filter(Boolean);
    if (!parts.length || !obj || typeof obj !== 'object') return;
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      if (!cur[key] || typeof cur[key] !== 'object') cur[key] = {};
      cur = cur[key];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function signed(value) {
    const n = toInt(value, 0);
    return `${n >= 0 ? '+' : ''}${n}`;
  }

  function normalizeMonsterEntries(entries) {
    if (!Array.isArray(entries)) return [];
    return entries
      .map((entry) => {
        if (!entry) return null;
        if (typeof entry === 'string') return { title: '', text: entry };
        const title = String(entry.name_ru || entry.name_en || entry.title || '').trim();
        const text = String(entry.text_ru || entry.text_en || entry.text || '').trim();
        if (!title && !text) return null;
        return { title, text };
      })
      .filter(Boolean);
  }

  function parseHpFormula(raw) {
    const text = String(raw || '').trim();
    if (!text) return { value: 0, text: '' };
    const match = text.match(/(\d+)/);
    return {
      value: match ? Math.max(0, toInt(match[1], 0)) : 0,
      text
    };
  }

  function parseAc(raw) {
    const text = String(raw || '').trim();
    if (!text) return { value: 0, text: '' };
    const match = text.match(/(\d+)/);
    return {
      value: match ? Math.max(0, toInt(match[1], 0)) : 0,
      text
    };
  }

  function parseSpeed(raw) {
    const text = String(raw || '').trim();
    if (!text) return { value: 0, text: '' };
    const match = text.match(/(\d+)/);
    return {
      value: match ? Math.max(0, toInt(match[1], 0)) : 0,
      text
    };
  }

  function normalizeBestiaryUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    let candidate = raw;
    if (/^\/bestiary\//i.test(candidate)) candidate = `https://dnd.su${candidate}`;
    try {
      const parsed = new URL(candidate);
      const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
      if (host !== 'dnd.su') return '';
      if (!/^\/bestiary\//i.test(parsed.pathname)) return '';
      parsed.hash = '';
      parsed.search = '';
      let href = parsed.toString();
      if (!href.endsWith('/')) href += '/';
      return href;
    } catch {
      return '';
    }
  }

  async function fetchMonsterPage(url) {
    const targetUrl = normalizeBestiaryUrl(url);
    if (!targetUrl) throw new Error('Нужна корректная ссылка вида https://dnd.su/bestiary/...');

    try {
      const fn = (typeof window !== 'undefined' && window.SUPABASE_FETCH_FN) ? String(window.SUPABASE_FETCH_FN) : '';
      const sbGetter = (typeof window !== 'undefined' && typeof window.getSbClient === 'function') ? window.getSbClient : null;
      if (fn && !fn.startsWith('http') && sbGetter) {
        const sb = sbGetter();
        if (sb?.functions?.invoke) {
          const { data, error } = await sb.functions.invoke(fn, { body: { url: targetUrl } });
          if (error) throw error;
          if (typeof data?.html === 'string' && data.html.trim()) return data.html;
        }
      }
    } catch (err) {
      console.warn('MonsterSheetModal: Supabase invoke failed, falling back to proxy', err);
    }

    try {
      const fnUrl = (typeof window !== 'undefined' && window.SUPABASE_FETCH_FN) ? String(window.SUPABASE_FETCH_FN) : '';
      if (fnUrl && fnUrl.startsWith('http')) {
        const res = await fetch(fnUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: targetUrl })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (typeof json?.html === 'string' && json.html.trim()) return json.html;
      }
    } catch (err) {
      console.warn('MonsterSheetModal: Supabase URL fetch failed, falling back to proxy', err);
    }

    const clean = targetUrl.replace(/^https?:\/\//i, '');
    const proxyUrl = `https://r.jina.ai/http://${clean}`;
    const res = await fetch(proxyUrl, { method: 'GET' });
    if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
    return await res.text();
  }

  function cleanupMonsterText(raw) {
    return String(raw || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[?]+/g, '')
      .trim();
  }

  function htmlToMonsterText(raw) {
    const src = String(raw || '');
    if (!src) return '';
    if (!/[<][a-z!/]/i.test(src)) return cleanupMonsterText(src);
    try {
      const doc = new DOMParser().parseFromString(src, 'text/html');
      const root = doc.querySelector('main') || doc.body || doc.documentElement;
      return cleanupMonsterText(root?.innerText || root?.textContent || src);
    } catch {
      return cleanupMonsterText(src.replace(/<[^>]+>/g, ' '));
    }
  }

  function splitMonsterParagraphs(textValue) {
    return cleanupMonsterText(textValue)
      .split(/\n{2,}/)
      .map((part) => part.split('\n').map((line) => line.replace(/^[-*•]\s*/, '').replace(/^#+\s*/, '').trim()).filter(Boolean).join('\n').trim())
      .filter(Boolean);
  }

  function paragraphToEntry(paragraph) {
    const text = String(paragraph || '').trim();
    if (!text) return null;
    const normalized = text.replace(/\n+/g, ' ').trim();
    const match = normalized.match(/^([^.!?]{2,120}[.!?])\s+([\s\S]+)$/);
    if (match) {
      return {
        name_ru: match[1].replace(/[.!?]+$/, '').trim(),
        text_ru: match[2].trim()
      };
    }
    return { name_ru: '', text_ru: normalized };
  }

  function parseAbilityBlock(lines, startIndex) {
    const map = {
      'Сил': 'str',
      'Лов': 'dex',
      'Тел': 'con',
      'Инт': 'int',
      'Мдр': 'wis',
      'Хар': 'cha'
    };
    const abilities = {};
    let i = startIndex;
    while (i < lines.length) {
      const label = String(lines[i] || '').trim();
      const key = map[label];
      if (!key) break;
      const scoreLine = String(lines[i + 1] || '').trim();
      const scoreMatch = scoreLine.match(/(-?\d+)\s*\(([+−\-]?\d+)\)/);
      const score = scoreMatch ? toInt(scoreMatch[1], 0) : toInt(scoreLine, 0);
      const mod = scoreMatch ? toInt(scoreMatch[2].replace('−', '-'), Math.floor((score - 10) / 2)) : Math.floor((score - 10) / 2);
      abilities[key] = { score, mod };
      i += 2;
    }
    return { abilities, nextIndex: i };
  }

  function parseMonsterText(raw, sourceUrl = '') {
    const plainText = htmlToMonsterText(raw);
    const paragraphs = splitMonsterParagraphs(plainText);
    const lines = plainText.split('\n').map((line) => line.replace(/^[-*•]\s*/, '').replace(/^#+\s*/, '').trim()).filter(Boolean);

    const data = {
      id: '',
      name_ru: '',
      name_en: '',
      size_ru: '',
      type_ru: '',
      alignment_ru: '',
      ac: '',
      hp: '',
      speed: '',
      abilities: {},
      saving_throws: '',
      skills: '',
      damage_vulnerabilities: '',
      damage_resistances: '',
      damage_immunities: '',
      condition_immunities: '',
      senses: '',
      languages: '',
      cr: '',
      xp: 0,
      proficiency_bonus: '',
      traits: [],
      actions: [],
      bonus_actions: [],
      reactions: [],
      legendary_actions: [],
      description_ru: '',
      source: 'dnd.su',
      source_url: sourceUrl
    };

    const titleLine = lines.find((line) => /\[[^\]]+\]/.test(line) || /—\s*Бестиарий/i.test(line)) || '';
    if (titleLine) {
      const cleanTitle = titleLine.replace(/—\s*Бестиарий/ig, '').trim();
      const nameMatch = cleanTitle.match(/^(.+?)\s*\[([^\]]+)\]\s*([A-Z0-9 ._-]+)?$/);
      if (nameMatch) {
        data.name_ru = nameMatch[1].trim();
        data.name_en = nameMatch[2].trim();
        if (nameMatch[3]) data.source = nameMatch[3].trim();
      } else {
        data.name_ru = cleanTitle.trim();
      }
    }
    if (!data.name_ru) {
      const fallbackTitle = paragraphs.find((item) => /—\s*Бестиарий/i.test(item)) || '';
      data.name_ru = fallbackTitle.replace(/—\s*Бестиарий/ig, '').trim();
    }

    const sizeLine = lines.find((line) => /,/.test(line) && /(крош|мал|сред|больш|огром|испол|tiny|small|medium|large|huge|gargantuan)/i.test(line)) || '';
    if (sizeLine) {
      const cleaned = sizeLine.replace(/^[-*•]\s*/, '').trim();
      const commaIndex = cleaned.indexOf(',');
      const left = commaIndex >= 0 ? cleaned.slice(0, commaIndex).trim() : cleaned;
      const right = commaIndex >= 0 ? cleaned.slice(commaIndex + 1).trim() : '';
      const parts = left.split(/\s+/);
      data.size_ru = parts.shift() || '';
      data.type_ru = parts.join(' ').trim();
      data.alignment_ru = right;
    }

    const fieldMatchers = [
      ['ac', /^Класс Доспеха\s+(.+)$/i],
      ['hp', /^Хиты\s+(.+)$/i],
      ['speed', /^Скорость\s+(.+)$/i],
      ['saving_throws', /^Спасброски\s+(.+)$/i],
      ['skills', /^Навыки\s+(.+)$/i],
      ['damage_vulnerabilities', /^Уязвим(?:ость|ости) к урону\s+(.+)$/i],
      ['damage_resistances', /^Сопротивл(?:ение|ения) к урону\s+(.+)$/i],
      ['damage_immunities', /^Иммунитет к урону\s+(.+)$/i],
      ['condition_immunities', /^Иммунитет к состояни(?:ю|ям)\s+(.+)$/i],
      ['senses', /^Чувства\s+(.+)$/i],
      ['languages', /^Языки\s+(.+)$/i],
      ['proficiency_bonus', /^Бонус мастерства\s+(.+)$/i]
    ];

    for (const line of lines) {
      for (const [key, regex] of fieldMatchers) {
        const match = line.match(regex);
        if (match) data[key] = match[1].trim();
      }
      const crMatch = line.match(/^Опасность\s+([^()]+?)(?:\(([^)]+)\))?$/i);
      if (crMatch) {
        data.cr = crMatch[1].trim();
        const xpMatch = String(crMatch[2] || '').replace(/\s+/g, ' ').match(/([\d\s]+)\s*опыта/i);
        if (xpMatch) data.xp = toInt(xpMatch[1].replace(/\s+/g, ''), 0);
      }
    }

    const abilityStart = lines.findIndex((line) => ['Сил', 'Лов', 'Тел', 'Инт', 'Мдр', 'Хар'].includes(line));
    if (abilityStart >= 0) {
      data.abilities = parseAbilityBlock(lines, abilityStart).abilities;
    }

    const sectionMap = {
      'Действия': 'actions',
      'Бонусные действия': 'bonus_actions',
      'Реакции': 'reactions',
      'Легендарные действия': 'legendary_actions',
      'Описание': 'description_ru'
    };

    const rawLines = cleanupMonsterText(plainText)
      .split('\n')
      .map((line) => line.replace(/^[-*•]\s*/, '').trim());

    let currentSection = 'traits';
    let buffer = [];
    const flushBuffer = () => {
      const paragraph = buffer.join(' ').trim();
      buffer = [];
      if (!paragraph) return;
      if (currentSection === 'description_ru') {
        data.description_ru = data.description_ru ? `${data.description_ru}\n\n${paragraph}` : paragraph;
      } else {
        const entry = paragraphToEntry(paragraph);
        if (entry) data[currentSection].push(entry);
      }
    };

    for (const rawLine of rawLines) {
      const line = String(rawLine || '').replace(/^#+\s*/, '').trim();
      if (!line) {
        flushBuffer();
        continue;
      }
      if (/^(Распечатать|Комментарии|Галерея)$/i.test(line)) {
        flushBuffer();
        continue;
      }
      if (line === titleLine || /—\s*Бестиарий/i.test(line) || line === sizeLine) {
        flushBuffer();
        continue;
      }
      if (fieldMatchers.some(([, regex]) => regex.test(line)) || /^Опасность\s+/i.test(line) || /^Бонус мастерства\s+/i.test(line)) {
        flushBuffer();
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(sectionMap, line)) {
        flushBuffer();
        currentSection = sectionMap[line] || currentSection;
        continue;
      }
      if (currentSection !== 'description_ru' && buffer.length && /^[^.]{1,120}\.\s/.test(line)) flushBuffer();
      buffer.push(line);
    }
    flushBuffer();

    if (!data.actions.length && !data.traits.length && !data.description_ru) {
      throw new Error('Не удалось распознать данные монстра на странице');
    }

    if (sourceUrl && !data.id) {
      const slug = sourceUrl.split('/').filter(Boolean).pop() || '';
      data.id = slug.replace(/^\d+-/, '');
    }

    return data;
  }

  async function importMonsterFromUrl(url) {
    const normalized = normalizeBestiaryUrl(url);
    if (!normalized) throw new Error('Нужна ссылка формата https://dnd.su/bestiary/...');
    const rawPage = await fetchMonsterPage(normalized);
    return parseMonsterText(rawPage, normalized);
  }

  function ensureImportedMonsterStats(sheet, monster) {
    if (!sheet || !monster) return;
    const hpInfo = parseHpFormula(monster.hp);
    const acInfo = parseAc(monster.ac);
    const speedInfo = parseSpeed(monster.speed);
    set(sheet, 'monster', monster);
    set(sheet, 'vitality.hp-max.value', Math.max(0, hpInfo.value));
    set(sheet, 'vitality.hp-current.value', Math.max(0, hpInfo.value));
    set(sheet, 'vitality.ac.value', Math.max(0, acInfo.value));
    set(sheet, 'vitality.speed.value', Math.max(0, speedInfo.value));
    const labels = { str: 'Сила', dex: 'Ловкость', con: 'Телосложение', int: 'Интеллект', wis: 'Мудрость', cha: 'Харизма' };
    Object.entries(monster.abilities || {}).forEach(([key, entry]) => {
      if (!entry) return;
      set(sheet, `stats.${key}.score`, toInt(entry.score, 10));
      set(sheet, `stats.${key}.modifier`, Number.isFinite(Number(entry.mod)) ? toInt(entry.mod, 0) : Math.floor((toInt(entry.score, 10) - 10) / 2));
      set(sheet, `stats.${key}.label`, labels[key] || String(key || '').toUpperCase());
    });
  }

  function renderImportControls(canEdit, sourceUrl) {
    if (!canEdit) return '';
    return `
      <div class="monster-import" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px;">
        <input type="url" class="popup-field" style="min-width:320px;flex:1;" placeholder="https://dnd.su/bestiary/..." data-monster-import-url value="${esc(sourceUrl || '')}">
        <button type="button" class="btn" data-monster-import-btn>Импортировать по ссылке</button>
      </div>
    `;
  }

  function ensureMonsterStyles() {
    if (monsterSheetStylesReady) return;
    monsterSheetStylesReady = true;
    const style = document.createElement('style');
    style.textContent = `
      .monster-sheet{display:flex;flex-direction:column;gap:16px;color:#f6ead7}
      .monster-sheet__hero{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(280px,.9fr);gap:14px;padding:16px;border-radius:18px;background:linear-gradient(180deg,rgba(79,24,20,.96),rgba(29,12,10,.94));border:1px solid rgba(255,216,183,.16);box-shadow:0 16px 38px rgba(0,0,0,.28)}
      .monster-sheet__title{font-size:30px;font-weight:800;line-height:1.05;color:#fff2df}
      .monster-sheet__subtitle{margin-top:6px;color:rgba(255,238,215,.82);font-size:14px}
      .monster-sheet__summary{margin-top:12px;display:flex;flex-wrap:wrap;gap:8px}
      .monster-chip{display:inline-flex;align-items:center;gap:6px;padding:7px 11px;border-radius:999px;border:1px solid rgba(255,224,194,.14);background:rgba(255,255,255,.05);font-size:12px;color:#ffe6ca}
      .monster-hero-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .monster-hero-card{padding:12px;border-radius:14px;background:rgba(10,8,8,.28);border:1px solid rgba(255,233,205,.11)}
      .monster-hero-card__label{font-size:12px;color:rgba(255,236,212,.72);margin-bottom:7px}
      .monster-hero-card__value{font-size:22px;font-weight:800;color:#fff7ef}
      .monster-hero-card__sub{font-size:12px;color:rgba(255,236,212,.7);margin-top:5px}
      .monster-hero-card input{width:100%;background:rgba(255,255,255,.08);border:1px solid rgba(255,230,207,.16);border-radius:10px;color:#fff8ef;padding:8px 10px;font-size:19px;font-weight:700}
      .monster-layout{display:grid;grid-template-columns:240px minmax(0,1fr);gap:14px;min-height:420px}
      .monster-sidebar{display:flex;flex-direction:column;gap:8px}
      .monster-sidebar__btn{padding:12px 14px;text-align:left;border-radius:14px;border:1px solid rgba(255,226,197,.12);background:rgba(39,20,14,.9);color:#ffe9ce;cursor:pointer;font-weight:700}
      .monster-sidebar__btn.active{background:linear-gradient(180deg,rgba(146,64,44,.95),rgba(104,36,23,.95));border-color:rgba(255,219,180,.28);box-shadow:0 8px 18px rgba(0,0,0,.25)}
      .monster-main{min-height:0;overflow:auto;border-radius:18px;border:1px solid rgba(255,220,188,.12);background:linear-gradient(180deg,rgba(24,14,11,.98),rgba(17,10,8,.98));padding:16px}
      .monster-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
      .monster-panel{border:1px solid rgba(255,224,197,.11);background:rgba(255,255,255,.03);border-radius:16px;padding:14px}
      .monster-panel--wide{grid-column:1/-1}
      .monster-panel__title{font-size:15px;font-weight:800;color:#fff1de;margin-bottom:10px}
      .monster-stat-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}
      .monster-stat{border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,228,204,.1);padding:10px;text-align:center}
      .monster-stat__label{font-size:12px;color:rgba(255,236,219,.72)}
      .monster-stat__score{margin-top:6px;font-size:20px;font-weight:800;color:#fff}
      .monster-stat__mod{margin-top:4px;font-size:12px;color:#ffd5a0}
      .monster-list{display:grid;gap:10px}
      .monster-list-item{padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,226,197,.08)}
      .monster-list-item b{color:#fff2db}
      .monster-list-item div{margin-top:4px;color:#f1dfca;line-height:1.5;white-space:pre-wrap}
      .monster-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .monster-meta__row{padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,226,197,.08)}
      .monster-meta__k{font-size:12px;color:rgba(255,236,219,.68);margin-bottom:4px}
      .monster-meta__v{font-size:14px;color:#fff2dd;line-height:1.45;white-space:pre-wrap}
      .monster-note{padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.04);border:1px dashed rgba(255,223,197,.18);color:#eedcc8;line-height:1.5}
      .monster-desc{color:#efdfca;line-height:1.65;white-space:pre-wrap}
      .monster-edit-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .monster-edit-field{display:flex;flex-direction:column;gap:6px}
      .monster-edit-field span{font-size:12px;color:rgba(255,236,219,.72)}
      .monster-edit-field input{width:100%;background:rgba(255,255,255,.08);border:1px solid rgba(255,228,204,.14);border-radius:10px;color:#fff7ed;padding:9px 10px}
      .monster-empty{padding:14px;border-radius:12px;background:rgba(255,255,255,.03);border:1px dashed rgba(255,228,204,.14);color:#ddc9b2}
      @media (max-width: 980px){
        .monster-sheet__hero,.monster-layout{grid-template-columns:1fr}
        .monster-hero-cards,.monster-grid,.monster-meta,.monster-edit-grid{grid-template-columns:1fr}
        .monster-stat-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
      }
    `;
    document.head.appendChild(style);
  }

  async function loadMonsterDatabase() {
    if (!monsterDbPromise) {
      monsterDbPromise = fetch(MONSTER_JSON_URL, { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => Array.isArray(data?.monsters) ? data.monsters : [])
        .catch((err) => {
          console.warn('MonsterSheetModal: failed to load monster db', err);
          return [];
        });
    }
    return monsterDbPromise;
  }

  async function resolveMonsterRecord(player) {
    const embedded = player?.sheet?.parsed?.monster;
    if (embedded && typeof embedded === 'object') return embedded;

    const monsterId = String(player?.monsterId || '').trim();
    if (!monsterId) return null;

    try {
      const libMonsters = window.MonstersLib?.getMonsters?.();
      if (Array.isArray(libMonsters) && libMonsters.length) {
        const found = libMonsters.find((entry) => String(entry?.id || '') === monsterId);
        if (found) return found;
      }
    } catch {}

    const monsters = await loadMonsterDatabase();
    return monsters.find((entry) => String(entry?.id || '') === monsterId) || null;
  }

  function ensureEnemySheet(player) {
    ensurePlayerSheetWrapper(player);
    let sheet = player?.sheet?.parsed;
    if (!sheet || typeof sheet !== 'object') sheet = createEmptySheet(player?.name || 'Враг');
    sheet = ensureSheetShape(sheet, player?.name || 'Враг');
    if (!player.sheet || typeof player.sheet !== 'object') {
      player.sheet = { source: 'manual', importedAt: Date.now(), raw: null, parsed: sheet };
    } else {
      player.sheet.parsed = sheet;
    }
    return sheet;
  }

  function buildMonsterViewModel(player, sheet, monster) {
    const vm = toViewModel(sheet, player?.name || 'Враг');
    const abilities = monster?.abilities || {};
    const statOrder = [
      ['str', 'СИЛ'],
      ['dex', 'ЛОВ'],
      ['con', 'ТЕЛ'],
      ['int', 'ИНТ'],
      ['wis', 'МДР'],
      ['cha', 'ХАР']
    ];

    const hpInfo = parseHpFormula(monster?.hp);
    const acInfo = parseAc(monster?.ac);
    const speedInfo = parseSpeed(monster?.speed);
    const currentHp = Math.max(0, toInt(get(sheet, 'vitality.hp-current.value', hpInfo.value || vm.hpCur || 0), hpInfo.value || vm.hpCur || 0));
    const maxHp = Math.max(0, toInt(get(sheet, 'vitality.hp-max.value', hpInfo.value || vm.hp || 0), hpInfo.value || vm.hp || 0));
    const acValue = Math.max(0, toInt(get(sheet, 'vitality.ac.value', acInfo.value || vm.ac || 0), acInfo.value || vm.ac || 0));
    const speedFeet = Math.max(0, toInt(get(sheet, 'vitality.speed.value', speedInfo.value || vm.spd || 0), speedInfo.value || vm.spd || 0));

    return {
      playerName: player?.name || vm.name,
      subtitle: [monster?.size_ru || monster?.size_en, monster?.type_ru || monster?.type_en, monster?.alignment_ru || monster?.alignment_en].filter(Boolean).join(', ') || 'Лист врага',
      source: monster?.source || '',
      challenge: monster?.cr != null ? `CR ${monster.cr}` : '',
      xp: monster?.xp ? `${monster.xp} XP` : '',
      senses: monster?.senses || '',
      languages: monster?.languages || '',
      acValue,
      acText: monster?.ac || '',
      currentHp,
      maxHp,
      hpText: hpInfo.text,
      speedValue: speedFeet,
      speedText: speedInfo.text || monster?.speed || '',
      saves: monster?.saving_throws || '',
      skills: monster?.skills || '',
      damageVulnerabilities: monster?.damage_vulnerabilities || '',
      damageResistances: monster?.damage_resistances || '',
      damageImmunities: monster?.damage_immunities || '',
      conditionImmunities: monster?.condition_immunities || '',
      description: monster?.description_ru || monster?.description_en || monster?.desc_ru || monster?.desc_en || '',
      traits: normalizeMonsterEntries(monster?.traits),
      actions: normalizeMonsterEntries(monster?.actions),
      reactions: normalizeMonsterEntries(monster?.reactions),
      legendaryActions: normalizeMonsterEntries(monster?.legendary_actions),
      bonusActions: normalizeMonsterEntries(monster?.bonus_actions),
      stats: statOrder.map(([key, label]) => {
        const monsterStat = abilities?.[key] || null;
        const score = toInt(monsterStat?.score, toInt(get(sheet, `stats.${key}.score`, 10), 10));
        const modifier = Number.isFinite(Number(monsterStat?.mod))
          ? toInt(monsterStat.mod, 0)
          : toInt(get(sheet, `stats.${key}.modifier`, Math.floor((score - 10) / 2)), Math.floor((score - 10) / 2));
        return { key, label, score, modifier };
      })
    };
  }

  function renderMetaRow(label, value) {
    if (!String(value || '').trim()) return '';
    return `
      <div class="monster-meta__row">
        <div class="monster-meta__k">${esc(label)}</div>
        <div class="monster-meta__v">${esc(value)}</div>
      </div>
    `;
  }

  function renderEntries(title, entries) {
    if (!entries?.length) return '';
    return `
      <div class="monster-panel monster-panel--wide">
        <div class="monster-panel__title">${esc(title)}</div>
        <div class="monster-list">
          ${entries.map((entry) => `
            <div class="monster-list-item">
              ${entry.title ? `<b>${esc(entry.title)}</b>` : ''}
              <div>${esc(entry.text || '')}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderMainTab(vm, canEdit) {
    return `
      <div class="monster-grid">
        <div class="monster-panel monster-panel--wide">
          <div class="monster-panel__title">Быстрые параметры</div>
          <div class="monster-edit-grid">
            <label class="monster-edit-field">
              <span>Текущее здоровье</span>
              <input type="number" min="0" ${canEdit ? '' : 'disabled'} data-monster-sheet-path="vitality.hp-current.value" value="${esc(String(vm.currentHp))}">
            </label>
            <label class="monster-edit-field">
              <span>Максимум здоровья</span>
              <input type="number" min="0" ${canEdit ? '' : 'disabled'} data-monster-sheet-path="vitality.hp-max.value" value="${esc(String(vm.maxHp))}">
            </label>
            <label class="monster-edit-field">
              <span>Класс доспеха</span>
              <input type="number" min="0" ${canEdit ? '' : 'disabled'} data-monster-sheet-path="vitality.ac.value" value="${esc(String(vm.acValue))}">
            </label>
            <label class="monster-edit-field">
              <span>Скорость (фт.)</span>
              <input type="number" min="0" ${canEdit ? '' : 'disabled'} data-monster-sheet-path="vitality.speed.value" value="${esc(String(vm.speedValue))}">
            </label>
          </div>
          ${vm.hpText || vm.acText || vm.speedText ? `
            <div class="monster-note" style="margin-top:12px">
              ${vm.hpText ? `Базовое HP из монстра: <b>${esc(vm.hpText)}</b><br>` : ''}
              ${vm.acText ? `Базовый КД из монстра: <b>${esc(vm.acText)}</b><br>` : ''}
              ${vm.speedText ? `Базовая скорость: <b>${esc(vm.speedText)}</b>` : ''}
            </div>
          ` : ''}
        </div>

        <div class="monster-panel monster-panel--wide">
          <div class="monster-panel__title">Характеристики</div>
          <div class="monster-stat-grid">
            ${vm.stats.map((stat) => `
              <div class="monster-stat">
                <div class="monster-stat__label">${esc(stat.label)}</div>
                <div class="monster-stat__score">${esc(String(stat.score))}</div>
                <div class="monster-stat__mod">${esc(signed(stat.modifier))}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="monster-panel monster-panel--wide">
          <div class="monster-panel__title">Подробности</div>
          <div class="monster-meta">
            ${renderMetaRow('Спасброски', vm.saves)}
            ${renderMetaRow('Навыки', vm.skills)}
            ${renderMetaRow('Чувства', vm.senses)}
            ${renderMetaRow('Языки', vm.languages)}
            ${renderMetaRow('Уязвимости', vm.damageVulnerabilities)}
            ${renderMetaRow('Сопротивления', vm.damageResistances)}
            ${renderMetaRow('Иммунитеты к урону', vm.damageImmunities)}
            ${renderMetaRow('Иммунитеты к состояниям', vm.conditionImmunities)}
          </div>
        </div>
      </div>
    `;
  }

  function renderExtraTab(vm) {
    const hasEntries = vm.traits.length || vm.actions.length || vm.reactions.length || vm.legendaryActions.length || vm.bonusActions.length || vm.description;
    if (!hasEntries) {
      return `<div class="monster-empty">Для этого врага пока нет расширенных данных монстра. Если токен создан из библиотеки SRD, они появятся автоматически.</div>`;
    }
    return `
      <div class="monster-grid">
        ${vm.description ? `
          <div class="monster-panel monster-panel--wide">
            <div class="monster-panel__title">Описание</div>
            <div class="monster-desc">${esc(vm.description)}</div>
          </div>
        ` : ''}
        ${renderEntries('Особенности', vm.traits)}
        ${renderEntries('Действия', vm.actions)}
        ${renderEntries('Бонусные действия', vm.bonusActions)}
        ${renderEntries('Реакции', vm.reactions)}
        ${renderEntries('Легендарные действия', vm.legendaryActions)}
      </div>
    `;
  }

  function scheduleSave(player) {
    const pid = String(player?.id || '');
    if (!pid || !ctx?.sendMessage) return;
    clearTimeout(saveTimers.get(pid));
    const timer = setTimeout(() => {
      saveTimers.delete(pid);
      try {
        ctx.sendMessage({ type: 'setPlayerSheet', id: player.id, sheet: player.sheet });
      } catch (err) {
        console.warn('MonsterSheetModal: failed to save sheet', err);
      }
    }, 180);
    saveTimers.set(pid, timer);
  }

  function bindMonsterSheetInputs(root, player) {
    root.querySelectorAll('[data-monster-sheet-path]').forEach((input) => {
      input.addEventListener('input', () => {
        const path = input.getAttribute('data-monster-sheet-path') || '';
        const next = Math.max(0, toInt(input.value, 0));
        const sheet = ensureEnemySheet(player);
        set(sheet, path, next);

        const maxHp = Math.max(0, toInt(get(sheet, 'vitality.hp-max.value', next), next));
        const curHp = Math.max(0, Math.min(maxHp, toInt(get(sheet, 'vitality.hp-current.value', 0), 0)));
        set(sheet, 'vitality.hp-max.value', maxHp);
        set(sheet, 'vitality.hp-current.value', curHp);
        if (String(path) === 'vitality.hp-max.value') {
          const curInput = root.querySelector('[data-monster-sheet-path="vitality.hp-current.value"]');
          if (curInput) curInput.value = String(curHp);
        }
        if (String(path) === 'vitality.hp-current.value' && toInt(input.value, 0) !== curHp) {
          input.value = String(curHp);
        }

        try {
          const tokenEl = playerElements?.get?.(String(player?.id || ''));
          if (tokenEl) updateHpBar?.(player, tokenEl);
        } catch {}

        markModalInteracted(player.id);
        scheduleSave(player);
      });
    });
  }

  function bindTabs(root, player, vm, canEdit) {
    const buttons = Array.from(root.querySelectorAll('[data-monster-tab]'));
    const main = root.querySelector('#sheet-main');
    if (!buttons.length || !main) return;

    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const tabId = String(button.getAttribute('data-monster-tab') || 'monster-main');
        player._activeSheetTab = tabId;
        const st = getUiState(player.id);
        st.activeTab = tabId;
        buttons.forEach((btn) => btn.classList.toggle('active', btn === button));
        main.innerHTML = tabId === 'monster-extra' ? renderExtraTab(vm) : renderMainTab(vm, canEdit);
        bindMonsterSheetInputs(root, player);
        markModalInteracted(player.id);
      });
    });
  }

  function bindImportControls(player, canEdit) {
    if (!canEdit) return;
    const input = sheetActions.querySelector('[data-monster-import-url]');
    const button = sheetActions.querySelector('[data-monster-import-btn]');
    if (!input || !button) return;

    const setBusy = (busy) => {
      input.disabled = !!busy;
      button.disabled = !!busy;
      button.textContent = busy ? 'Импорт…' : 'Импортировать по ссылке';
    };

    button.addEventListener('click', async () => {
      const href = normalizeBestiaryUrl(input.value);
      if (!href) {
        alert('Нужна ссылка вида https://dnd.su/bestiary/...');
        return;
      }

      setBusy(true);
      try {
        const monster = await importMonsterFromUrl(href);
        const sheet = ensureEnemySheet(player);
        ensureImportedMonsterStats(sheet, monster);
        scheduleSave(player);
        markModalInteracted(player.id);
        await render(player, { canEdit, force: true });
      } catch (err) {
        console.error('Monster import failed', err);
        alert(err?.message || 'Не удалось импортировать монстра по ссылке');
      } finally {
        setBusy(false);
      }
    });
  }

  async function render(player, options = {}) {
    if (!sheetTitle || !sheetSubtitle || !sheetActions || !sheetContent) return false;
    ensureMonsterStyles();

    const canEdit = !!options.canEdit;
    const sheet = ensureEnemySheet(player);
    const activeUi = getUiState(player.id);
    let activeTab = String(player?._activeSheetTab || activeUi?.activeTab || 'monster-main');
    if (activeTab !== 'monster-main' && activeTab !== 'monster-extra') activeTab = 'monster-main';
    player._activeSheetTab = activeTab;
    activeUi.activeTab = activeTab;

    sheetTitle.textContent = `Лист монстра: ${player.name}`;
    sheetSubtitle.textContent = player.ownerName
      ? `Владелец: ${player.ownerName} • Тип: враг`
      : 'Тип: враг';

    sheetActions.innerHTML = '';
    const note = document.createElement('div');
    note.className = 'sheet-note';
    note.innerHTML = `${esc(canEdit
      ? 'Это отдельный лист врага. Основные боевые параметры можно менять сразу здесь.'
      : 'Просмотр листа врага. Изменять параметры может только GM.')}${renderImportControls(canEdit, player?.sheet?.parsed?.monster?.source_url || '')}`;
    sheetActions.appendChild(note);

    sheetContent.innerHTML = '<div class="monster-note">Загружаю данные монстра…</div>';

    const monster = await resolveMonsterRecord(player);
    if (openedSheetPlayerId !== player.id) return true;

    const vm = buildMonsterViewModel(player, sheet, monster);
    sheetContent.innerHTML = `
      <div class="monster-sheet">
        <div class="monster-sheet__hero">
          <div>
            <div class="monster-sheet__title">${esc(vm.playerName)}</div>
            <div class="monster-sheet__subtitle">${esc(vm.subtitle || 'Лист врага')}</div>
            <div class="monster-sheet__summary">
              ${vm.challenge ? `<span class="monster-chip">${esc(vm.challenge)}</span>` : ''}
              ${vm.xp ? `<span class="monster-chip">${esc(vm.xp)}</span>` : ''}
              ${vm.languages ? `<span class="monster-chip">${esc(vm.languages)}</span>` : ''}
              ${vm.source ? `<span class="monster-chip">${esc(vm.source)}</span>` : ''}
            </div>
          </div>
          <div class="monster-hero-cards">
            <div class="monster-hero-card">
              <div class="monster-hero-card__label">Текущее здоровье</div>
              <div class="monster-hero-card__value">${esc(String(vm.currentHp))}</div>
              <div class="monster-hero-card__sub">Макс.: ${esc(String(vm.maxHp))}</div>
            </div>
            <div class="monster-hero-card">
              <div class="monster-hero-card__label">Класс доспеха</div>
              <div class="monster-hero-card__value">${esc(String(vm.acValue || '—'))}</div>
              <div class="monster-hero-card__sub">${esc(vm.acText || 'Без уточнений')}</div>
            </div>
            <div class="monster-hero-card">
              <div class="monster-hero-card__label">Скорость</div>
              <div class="monster-hero-card__value">${esc(String(vm.speedValue || '—'))}</div>
              <div class="monster-hero-card__sub">${esc(vm.senses || 'Без особых чувств')}</div>
            </div>
          </div>
        </div>

        <div class="monster-layout">
          <div class="monster-sidebar">
            <button type="button" class="monster-sidebar__btn ${activeTab === 'monster-main' ? 'active' : ''}" data-monster-tab="monster-main">Основное</button>
            <button type="button" class="monster-sidebar__btn ${activeTab === 'monster-extra' ? 'active' : ''}" data-monster-tab="monster-extra">Дополнительно</button>
          </div>
          <div class="monster-main" id="sheet-main">
            ${activeTab === 'monster-extra' ? renderExtraTab(vm) : renderMainTab(vm, canEdit)}
          </div>
        </div>
      </div>
    `;

    restoreUiStateToDom(player);
    const mainEl = sheetContent.querySelector('#sheet-main');
    mainEl?.addEventListener('scroll', () => {
      markModalInteracted(player.id);
      captureUiStateFromDom(player);
    }, { passive: true });

    sheetContent.addEventListener('pointerdown', () => markModalInteracted(player.id), { passive: true });
    sheetContent.addEventListener('keydown', () => markModalInteracted(player.id), { passive: true });

    bindMonsterSheetInputs(sheetContent, player);
    bindTabs(sheetContent, player, vm, canEdit);
    bindImportControls(player, canEdit);
    return true;
  }

  function shouldUseForPlayer(player) {
    return !!player?.isEnemy;
  }

  window.MonsterSheetModal = {
    shouldUseForPlayer,
    render,
    preload: loadMonsterDatabase,
    importFromUrl: importMonsterFromUrl,
    parseText: parseMonsterText
  };
})();
