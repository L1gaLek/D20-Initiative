(function () {
  const MONSTER_JSON_URL = './srd5_1_monsters_extracted.json';
  let monsterDbPromise = null;
  let monsterSheetStylesReady = false;
  const saveTimers = new Map();
  const DEFAULT_ALLY_BASE_URL = 'token/sheet/souz.png';
  const DEFAULT_MONSTER_BASE_URL = 'token/sheet/monstr.png';

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

  function isMonsterStyleAlly(player) {
    return !!player && !!player?.isAlly && !player?.isEnemy && !player?.isBase;
  }

  function getMonsterSheetTypeLabel(player) {
    return isMonsterStyleAlly(player) ? 'союзник' : 'враг';
  }

  function getMonsterSheetTitleLabel(player) {
    return isMonsterStyleAlly(player) ? 'Лист союзника' : 'Лист монстра';
  }

  function shouldUseMonsterStyleSheet(player) {
    if (!player) return false;
    if (player?.isBase) return false;
    const ownerRole = String(player?.ownerRole || '').trim();
    const isRegularPlayerOwned = ownerRole && ownerRole !== 'GM';
    return !!player?.isEnemy || isMonsterStyleAlly(player) || isRegularPlayerOwned;
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
    if (!text) return { value: 0, text: '', count: 0, sides: 0, bonus: 0 };
    const averageMatch = text.match(/(\d+)/);
    const formulaMatch = text.match(/\((\d+)\s*[кkхx*d]\s*(\d+)\s*([+\-−]\s*\d+)?\)/i);
    const count = formulaMatch ? Math.max(0, toInt(formulaMatch[1], 0)) : 0;
    const sides = formulaMatch ? Math.max(0, toInt(formulaMatch[2], 0)) : 0;
    const bonusRaw = formulaMatch ? String(formulaMatch[3] || '').replace(/\s+/g, '').replace('−', '-') : '';
    return {
      value: averageMatch ? Math.max(0, toInt(averageMatch[1], 0)) : 0,
      text,
      count,
      sides,
      bonus: bonusRaw ? toInt(bonusRaw, 0) : 0
    };
  }

  function normalizeMonsterHpRollConfig(config = {}, fallback = {}) {
    const count = Math.max(0, toInt(config.count, fallback.count || 0));
    const sides = Math.max(0, toInt(config.sides, fallback.sides || 0));
    const bonus = toInt(config.bonus, fallback.bonus || 0);
    const lastTotal = Math.max(0, toInt(config.lastTotal, fallback.lastTotal || 0));
    return { count, sides, bonus, lastTotal };
  }

  function rollMonsterHp(config, rng = Math.random) {
    const normalized = normalizeMonsterHpRollConfig(config);
    if (!normalized.count || !normalized.sides) return { total: Math.max(0, normalized.bonus), rolls: [] };
    const rolls = [];
    let total = normalized.bonus;
    for (let i = 0; i < normalized.count; i++) {
      const roll = 1 + Math.floor(Math.max(0, Math.min(0.999999, Number(rng()) || 0)) * normalized.sides);
      rolls.push(roll);
      total += roll;
    }
    return { total: Math.max(0, total), rolls };
  }

  function getMonsterHpRange(config) {
    const normalized = normalizeMonsterHpRollConfig(config);
    const hasDice = normalized.count > 0 && normalized.sides > 0;
    const minBase = hasDice ? normalized.count : 0;
    const maxBase = hasDice ? normalized.count * normalized.sides : 0;
    return {
      min: Math.max(0, minBase + normalized.bonus),
      max: Math.max(0, maxBase + normalized.bonus),
      received: Math.max(0, normalized.lastTotal)
    };
  }

  function ensureMonsterHpRollConfig(sheet, monster) {
    if (!sheet || typeof sheet !== 'object') return normalizeMonsterHpRollConfig();
    const parsed = parseHpFormula(monster?.hp || get(sheet, 'monster.hp', ''));
    const fallback = { count: parsed.count, sides: parsed.sides, bonus: parsed.bonus, lastTotal: parsed.value };
    const current = normalizeMonsterHpRollConfig(get(sheet, 'monsterHpRoll', {}), fallback);
    set(sheet, 'monsterHpRoll', current);
    return current;
  }

  function applyMonsterHpRoll(sheet, monster, rng = Math.random) {
    const config = ensureMonsterHpRollConfig(sheet, monster);
    const rolled = rollMonsterHp(config, rng);
    const next = { ...config, lastTotal: rolled.total };
    set(sheet, 'monsterHpRoll', next);
    set(sheet, 'vitality.hp-max.value', rolled.total);
    set(sheet, 'vitality.hp-current.value', rolled.total);
    return next;
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
    if (/^\/\S+/i.test(candidate)) candidate = `https://dnd.su${candidate}`;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate) && /^[\w.-]+\.[a-z]{2,}(?:\/|$)/i.test(candidate)) {
      candidate = `https://${candidate}`;
    }
    try {
      const parsed = new URL(candidate);
      if (!/^https?:$/i.test(parsed.protocol)) return '';
      parsed.hash = '';
      return parsed.toString();
    } catch {
      return '';
    }
  }

  function extractBestiaryUrl(input) {
    const raw = String(input || '').trim();
    if (!raw) return '';
    const direct = normalizeBestiaryUrl(raw);
    if (direct) return direct;
    const matches = raw.match(/(?:https?:\/\/[^\s<>"')\]]+|(?:^|[\s(])(?:[\w.-]+\.[a-z]{2,}\/[^\s<>"')\]]+)|(?:^|[\s(])(?:\/bestiary\/[^\s<>"')\]]+))/ig) || [];
    for (const match of matches) {
      const candidate = String(match || '')
        .trim()
        .replace(/^[\s(]+/, '')
        .replace(/[),.;!?]+$/, '');
      const normalized = normalizeBestiaryUrl(candidate);
      if (normalized) return normalized;
    }
    return '';
  }

  async function fetchMonsterPage(url) {
    const targetUrl = normalizeBestiaryUrl(url);
    if (!targetUrl) throw new Error('Нужна корректная ссылка на страницу с текстом монстра');

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

    const proxyUrl = `https://r.jina.ai/${targetUrl}`;
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
      [
        'script',
        'style',
        'noscript',
        'svg',
        'iframe',
        'header',
        'footer',
        'nav',
        'aside',
        'form',
        '.comments-block',
        '.comments',
        '#comments',
        '[data-comments]',
        '.comment-list',
        '.breadcrumbs',
        '.breadcrumb',
        '.menu',
        '.navbar',
        '.nav',
        '.pagination',
        '.share',
        '.social',
        '.gallery',
        '.sidebar'
      ].forEach((selector) => {
        doc.querySelectorAll(selector).forEach((node) => node.remove());
      });

      const candidates = [
        'article',
        '.card',
        '.card__article',
        '.card__article-body',
        '.monster',
        '.monster-block',
        '.page-content',
        'main',
        'body'
      ];
      const relevantPattern = /(Класс Доспеха|Хиты|Скорость|Опасность|Действия|Бонусные действия|Реакции|Легендарные действия)/i;
      let bestText = '';
      for (const selector of candidates) {
        doc.querySelectorAll(selector).forEach((node) => {
          const textValue = cleanupMonsterText(node?.innerText || node?.textContent || '');
          if (!textValue) return;
          const score = (relevantPattern.test(textValue) ? 100000 : 0) + textValue.length;
          const bestScore = (relevantPattern.test(bestText) ? 100000 : 0) + bestText.length;
          if (score > bestScore) bestText = textValue;
        });
      }

      return bestText || cleanupMonsterText(doc.body?.innerText || doc.body?.textContent || src);
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

  function normalizeMonsterLine(line) {
    return String(line || '')
      .replace(/^[-*•]\s*/, '')
      .replace(/^#+\s*/, '')
      .trim();
  }

  function isMonsterCommentBoundary(line) {
    return /^(?:Комментарии(?:\s*\(\d+\))?|Комментари[йия](?:\s*[:.].*)?|Comments?(?:\s*\(\d+\))?|Comment section|Leave a comment|Add comment|Discussion(?:\s*\(\d+\))?|Disqus|Авторизуйтесь, чтобы оставлять комментарии|Log in to leave a comment|Log in to post comments?)$/i.test(normalizeMonsterLine(line));
  }

  function isMonsterChromeStopLine(line) {
    return /^(?:Галерея|Распечатать|Поделиться|Поделиться:|Наверх|Назад|Вперёд|Следующая запись|Предыдущая запись|Похожие материалы|Смотрите также|Показать комментарии|Оставить комментарий|Toggle navigation|Меню|Главная|Бестиарий|Заклинания|Снаряжение|Предметы|Контакты|О сайте|Все права защищены|Источник:|Подробности|Обсуждение|Версия для печати)$/i.test(normalizeMonsterLine(line));
  }

  function isMonsterSubtitleLine(line) {
    return /,/.test(String(line || '')) && /(крош|мал|сред|больш|огром|испол|tiny|small|medium|large|huge|gargantuan)/i.test(String(line || ''));
  }

  function isMonsterTitleCandidate(line) {
    const normalized = normalizeMonsterLine(line);
    if (!normalized) return false;
    if (isMonsterCommentBoundary(normalized) || isMonsterChromeStopLine(normalized)) return false;
    if (/^(?:DnD\.su|Официальные|Homebrew|Справочники|Новичку|Статьи|Пользователь|Партнёры|Разное|Регистрация)$/i.test(normalized)) return false;
    if (/^(?:Boosty|Discord|Новости сообщества|Контакты|Помощь сайту)$/i.test(normalized)) return false;
    if (/^(?:Удав|.+)\s+—\s+Бестиарий$/i.test(normalized) && !/[\[(]/.test(normalized)) return false;
    if (/^(?:Класс Доспеха|Armor Class|Хиты|Hit Points|Скорость|Speed|Чувства|Senses|Опасность|Challenge)\b/i.test(normalized)) return false;
    if (/^(?:Сил|Лов|Тел|Инт|Мдр|Хар)$/i.test(normalized)) return false;
    return true;
  }

  function findMonsterTitleLine(lines, subtitleIndex) {
    if (!Array.isArray(lines) || !lines.length) return '';
    if (subtitleIndex > 0) {
      for (let i = subtitleIndex - 1; i >= 0; i--) {
        const candidate = normalizeMonsterLine(lines[i]);
        if (!candidate) continue;
        if (!isMonsterTitleCandidate(candidate)) continue;
        return candidate;
      }
    }
    return lines.find((line) => /\[[^\]]+\]/.test(line) || /\([^)]+\)/.test(line) || /(?:—|\|)\s*Бестиарий/i.test(line) || isMonsterTitleCandidate(line)) || '';
  }

  function detectMonsterSourceLabel(sourceUrl) {
    const raw = String(sourceUrl || '').trim();
    if (!raw) return 'external';
    try {
      if (typeof URL === 'function') {
        const host = new URL(raw).hostname.toLowerCase();
        return host.replace(/^www\./, '') || 'external';
      }
    } catch {}
    const match = raw.match(/^[a-z]+:\/\/([^/]+)/i);
    return match ? String(match[1] || '').toLowerCase().replace(/^www\./, '') || 'external' : 'external';
  }

  function cleanupMonsterTitle(rawTitle) {
    return String(rawTitle || '')
      .replace(/[–—-]\s*Бестиарий.*$/i, '')
      .replace(/\|\s*Бестиарий.*$/i, '')
      .replace(/\|\s*Monster Manual.*$/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function paragraphToEntry(paragraph) {
    const text = String(paragraph || '').trim();
    if (!text) return null;
    const normalized = text.replace(/\n+/g, ' ').trim();
    const match = normalized.match(/^([^.!?:]{2,120}[.!?:])\s+([\s\S]+)$/);
    if (match) {
      return {
        name_ru: match[1].replace(/[.!?:]+$/, '').trim(),
        text_ru: match[2].trim()
      };
    }
    return { name_ru: '', text_ru: normalized };
  }

  function parseSignedPrimaryNumber(raw, fallback = 0) {
    const text = String(raw || '').replace(/−/g, '-');
    const match = text.match(/([+\-]?\d+)/);
    return match ? toInt(match[1], fallback) : fallback;
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

  function parseMonsterAbilities(lines, plainText) {
    const map = {
      'Сил': 'str',
      'Лов': 'dex',
      'Тел': 'con',
      'Инт': 'int',
      'Мдр': 'wis',
      'Хар': 'cha'
    };
    const orderedLabels = ['Сил', 'Лов', 'Тел', 'Инт', 'Мдр', 'Хар'];

    const inlineMatches = Array.from(String(plainText || '').matchAll(/(Сил|Лов|Тел|Инт|Мдр|Хар)\s*(-?\d+)\s*\(([+−\-]?\d+)\)/g));
    if (inlineMatches.length >= 3) {
      return inlineMatches.reduce((acc, match) => {
        const key = map[match[1]];
        if (!key) return acc;
        acc[key] = {
          score: toInt(match[2], 0),
          mod: toInt(String(match[3] || '').replace('−', '-'), 0)
        };
        return acc;
      }, {});
    }

    const labelLineIndex = lines.findIndex((line) => orderedLabels.every((label) => String(line || '').includes(label)));
    if (labelLineIndex >= 0) {
      const valueSource = [lines[labelLineIndex + 1], lines[labelLineIndex + 2]].filter(Boolean).join(' ');
      const valueMatches = Array.from(valueSource.matchAll(/(-?\d+)\s*\(([+−\-]?\d+)\)/g));
      if (valueMatches.length >= orderedLabels.length) {
        return orderedLabels.reduce((acc, label, index) => {
          const match = valueMatches[index];
          const key = map[label];
          if (!match || !key) return acc;
          acc[key] = {
            score: toInt(match[1], 0),
            mod: toInt(String(match[2] || '').replace('−', '-'), 0)
          };
          return acc;
        }, {});
      }
    }

    const abilityStart = lines.findIndex((line) => orderedLabels.includes(line));
    if (abilityStart >= 0) {
      return parseAbilityBlock(lines, abilityStart).abilities;
    }
    return {};
  }

  function parseMonsterText(raw, sourceUrl = '') {
    const plainText = htmlToMonsterText(raw);
    const paragraphs = splitMonsterParagraphs(plainText);
    const allLines = plainText.split('\n').map(normalizeMonsterLine).filter(Boolean);
    const subtitleIndex = allLines.findIndex(isMonsterSubtitleLine);
    const titleLine = findMonsterTitleLine(allLines, subtitleIndex);
    const titleLineIndex = titleLine ? allLines.indexOf(titleLine) : -1;
    const stopLineIndex = allLines.findIndex((line, index) => index > titleLineIndex && isMonsterCommentBoundary(line));
    const contentLines = allLines.slice(titleLineIndex >= 0 ? titleLineIndex : 0, stopLineIndex >= 0 ? stopLineIndex : allLines.length);
    const lines = contentLines.length ? contentLines : allLines;

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
      source: sourceUrl ? detectMonsterSourceLabel(sourceUrl) : 'external',
      source_url: sourceUrl
    };

    if (titleLine) {
      const cleanTitle = cleanupMonsterTitle(titleLine);
      const nameMatch = cleanTitle.match(/^(.+?)\s*\[([^\]]+)\]\s*([A-Z0-9 ._/-]+)?$/);
      if (nameMatch) {
        data.name_ru = nameMatch[1].trim();
        data.name_en = nameMatch[2].trim();
        if (nameMatch[3]) data.source = nameMatch[3].trim();
      } else {
        const parenMatch = cleanTitle.match(/^(.+?)\s*\(([^)]+)\)\s*([A-Z0-9 ._/-]+)?$/);
        if (parenMatch) {
          data.name_ru = parenMatch[1].trim();
          data.name_en = parenMatch[2].trim();
          if (parenMatch[3]) data.source = parenMatch[3].trim();
        } else {
          data.name_ru = cleanTitle.trim();
        }
      }
    }
    if (!data.name_ru) {
      const fallbackTitle = paragraphs.find((item) => /\[[^\]]+\]/.test(item) || /\([^)]+\)/.test(item) || /(?:—|\|)\s*Бестиарий/i.test(item)) || '';
      const cleanFallbackTitle = cleanupMonsterTitle(fallbackTitle);
      const parenMatch = cleanFallbackTitle.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
      if (parenMatch) {
        data.name_ru = parenMatch[1].trim();
        data.name_en = parenMatch[2].trim();
      } else {
        data.name_ru = cleanFallbackTitle.trim();
      }
    }

    const sizeLine = lines.find(isMonsterSubtitleLine) || '';
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
      ['ac', /^Armor Class\s+(.+)$/i],
      ['hp', /^Hit Points\s+(.+)$/i],
      ['speed', /^Speed\s+(.+)$/i],
      ['saving_throws', /^Спасброски\s+(.+)$/i],
      ['skills', /^Навыки\s+(.+)$/i],
      ['damage_vulnerabilities', /^Уязвим(?:ость|ости) к урону\s+(.+)$/i],
      ['damage_resistances', /^Сопротивл(?:ение|ения) к урону\s+(.+)$/i],
      ['damage_immunities', /^Иммунитет к урону\s+(.+)$/i],
      ['condition_immunities', /^Иммунитет к состояни(?:ю|ям)\s+(.+)$/i],
      ['senses', /^Чувства\s+(.+)$/i],
      ['languages', /^Языки\s+(.+)$/i],
      ['proficiency_bonus', /^Бонус мастерства\s+(.+)$/i],
      ['saving_throws', /^Saving Throws\s+(.+)$/i],
      ['skills', /^Skills\s+(.+)$/i],
      ['damage_vulnerabilities', /^Damage Vulnerabilities\s+(.+)$/i],
      ['damage_resistances', /^Damage Resistances\s+(.+)$/i],
      ['damage_immunities', /^Damage Immunities\s+(.+)$/i],
      ['condition_immunities', /^Condition Immunities\s+(.+)$/i],
      ['senses', /^Senses\s+(.+)$/i],
      ['languages', /^Languages\s+(.+)$/i],
      ['proficiency_bonus', /^Proficiency Bonus\s+(.+)$/i]
    ];

    for (const line of lines) {
      for (const [key, regex] of fieldMatchers) {
        const match = line.match(regex);
        if (match) data[key] = match[1].trim();
      }
      const crMatch = line.match(/^(?:Опасность|Challenge)\s+([^()]+?)(?:\(([^)]+)\))?$/i);
      if (crMatch) {
        data.cr = crMatch[1].trim();
        const xpMatch = String(crMatch[2] || '').replace(/\s+/g, ' ').match(/([\d\s,]+)\s*(?:опыта|XP)/i);
        if (xpMatch) data.xp = toInt(xpMatch[1].replace(/\s+/g, ''), 0);
      }
    }

    data.abilities = parseMonsterAbilities(lines, plainText);

    const sectionMap = {
      'черты': 'traits',
      'особые черты': 'traits',
      'traits': 'traits',
      'действия': 'actions',
      'actions': 'actions',
      'бонусные действия': 'bonus_actions',
      'bonus actions': 'bonus_actions',
      'реакции': 'reactions',
      'reactions': 'reactions',
      'легендарные действия': 'legendary_actions',
      'legendary actions': 'legendary_actions'
    };

    const rawLines = lines.slice();
    const abilityStatLabels = new Set(['Сил', 'Лов', 'Тел', 'Инт', 'Мдр', 'Хар']);
    const abilityLabelRowPattern = /^Сил\s+Лов\s+Тел\s+Инт\s+Мдр\s+Хар$/i;
    const abilityValueRowPattern = /(-?\d+)\s*\(([+−\-]?\d+)\)/g;
    const hasAbilityValues = (line) => Array.from(String(line || '').matchAll(abilityValueRowPattern)).length >= 3;
    const isSingleAbilityValueLine = (line) => /^-?\d+\s*\(([+−\-]?\d+)\)$/.test(String(line || '').trim());

    let currentSection = '';
    let contentStarted = false;
    let buffer = [];
    const flushBuffer = () => {
      const paragraph = buffer.join(' ').trim();
      buffer = [];
      if (!paragraph || !currentSection || !Array.isArray(data[currentSection])) return;
      const entry = paragraphToEntry(paragraph);
      if (entry) data[currentSection].push(entry);
    };

    for (const rawLine of rawLines) {
      const line = normalizeMonsterLine(rawLine);
      if (!line) {
        flushBuffer();
        continue;
      }
      if (isMonsterCommentBoundary(line)) {
        flushBuffer();
        break;
      }
      if (isMonsterChromeStopLine(line)) {
        flushBuffer();
        if (currentSection) break;
        continue;
      }
      if (line === titleLine || /—\s*Бестиарий/i.test(line) || line === sizeLine) {
        contentStarted = true;
        flushBuffer();
        continue;
      }
      if (fieldMatchers.some(([, regex]) => regex.test(line)) || /^Опасность\s+/i.test(line) || /^Бонус мастерства\s+/i.test(line)) {
        contentStarted = true;
        flushBuffer();
        if (!currentSection) currentSection = 'traits';
        continue;
      }
      if (abilityStatLabels.has(line) || abilityLabelRowPattern.test(line) || hasAbilityValues(line) || isSingleAbilityValueLine(line)) {
        contentStarted = true;
        flushBuffer();
        if (!currentSection) currentSection = 'traits';
        continue;
      }
      const normalizedSectionLine = line
        .replace(/[—–-]/g, ' ')
        .replace(/[:.!?]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      if (Object.prototype.hasOwnProperty.call(sectionMap, normalizedSectionLine)) {
        contentStarted = true;
        flushBuffer();
        currentSection = sectionMap[normalizedSectionLine] || currentSection;
        continue;
      }
      if (!contentStarted) continue;
      if (!currentSection) currentSection = 'traits';
      if (buffer.length && /^[^.]{1,120}\.\s/.test(line)) flushBuffer();
      buffer.push(line);
    }
    flushBuffer();

    const hasCoreMonsterData = !!(data.name_ru || data.name_en || data.ac || data.hp || data.speed || Object.keys(data.abilities || {}).length);
    if (!hasCoreMonsterData && !data.actions.length && !data.bonus_actions.length && !data.reactions.length && !data.legendary_actions.length) {
      throw new Error('Не удалось распознать данные монстра на странице');
    }

    if (sourceUrl && !data.id) {
      const slug = sourceUrl.split('/').filter(Boolean).pop() || '';
      data.id = slug.replace(/^\d+-/, '');
    }

    return data;
  }

  async function importMonsterFromUrl(url) {
    const normalized = extractBestiaryUrl(url) || normalizeBestiaryUrl(url);
    if (normalized) {
      const rawPage = await fetchMonsterPage(normalized);
      return parseMonsterText(rawPage, normalized);
    }
    const rawText = String(url || '').trim();
    if (!rawText) throw new Error('Нужна ссылка или текст с описанием монстра');
    return parseMonsterText(rawText, '');
  }

  function ensureImportedMonsterStats(sheet, monster) {
    if (!sheet || !monster) return;
    const hpInfo = parseHpFormula(monster.hp);
    const acInfo = parseAc(monster.ac);
    const speedInfo = parseSpeed(monster.speed);
    const proficiencyBonus = parseSignedPrimaryNumber(monster.proficiency_bonus, toInt(get(sheet, 'proficiency', 0), 0));
    const importedName = String(monster.name_ru || monster.name_en || '').trim();
    if (importedName) set(sheet, 'name.value', importedName);
    set(sheet, 'monster', monster);
    set(sheet, 'monsterHpRoll', normalizeMonsterHpRollConfig({ count: hpInfo.count, sides: hpInfo.sides, bonus: hpInfo.bonus, lastTotal: 0 }));
    set(sheet, 'vitality.hp-max.value', 0);
    set(sheet, 'vitality.hp-current.value', 0);
    set(sheet, 'vitality.ac.value', Math.max(0, acInfo.value));
    set(sheet, 'vitality.speed.value', Math.max(0, speedInfo.value));
    set(sheet, 'proficiency', proficiencyBonus);
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
      <div class="monster-import-card">
        <div class="monster-import-card__title">Импорт монстра</div>
        <div class="monster-import-card__subtitle">Вставь ссылку на страницу монстра или готовый текст статблока.</div>
        <div class="monster-import">
          <input type="text" class="popup-field monster-import__input" placeholder="Ссылка или текст статблока монстра" data-monster-import-url value="${esc(sourceUrl || '')}">
          <button type="button" class="btn" data-monster-import-btn>Импортировать</button>
        </div>
      </div>
    `;
  }

  function ensureMonsterStyles() {
    if (monsterSheetStylesReady) return;
    monsterSheetStylesReady = true;
    const style = document.createElement('style');
    style.textContent = `
      .monster-sheet{display:flex;flex-direction:column;gap:16px;color:#f6ead7}
      .monster-sheet__hero{display:flex;flex-direction:column;gap:14px;padding:16px;border-radius:18px;background:linear-gradient(180deg,rgba(79,24,20,.96),rgba(29,12,10,.94));border:1px solid rgba(255,216,183,.16);box-shadow:0 16px 38px rgba(0,0,0,.28)}
      .monster-sheet__title{font-size:30px;font-weight:800;line-height:1.05;color:#fff2df}
      .monster-sheet__title-input{width:100%;background:transparent;border:none;border-bottom:1px solid rgba(255,226,197,.16);color:#fff2df;font-size:30px;font-weight:800;line-height:1.05;padding:0 0 6px;outline:none}
      .monster-sheet__title-input:focus{border-bottom-color:rgba(255,226,197,.42)}
      .monster-sheet__title-input:disabled{opacity:1;cursor:url("/D20-Initiative/cursor/normalcursor.cur"), default}
      .monster-sheet__subtitle{margin-top:6px;color:rgba(255,238,215,.82);font-size:14px}
      .monster-sheet__summary{margin-top:12px;display:flex;flex-wrap:wrap;gap:8px}
      .monster-chip{display:inline-flex;align-items:center;gap:6px;padding:7px 11px;border-radius:999px;border:1px solid rgba(255,224,194,.14);background:rgba(255,255,255,.05);font-size:12px;color:#ffe6ca}
      .monster-hero-cards{display:flex;flex-wrap:nowrap;gap:10px;align-items:stretch}
      .monster-hero-card{padding:12px;border-radius:14px;background:rgba(10,8,8,.28);border:1px solid rgba(255,233,205,.11);min-width:0}
      .monster-hero-card--hp{flex:0 0 306px;min-width:0}
      .monster-hero-card--stack{display:grid;grid-template-rows:repeat(3,minmax(0,1fr));gap:6px;flex:0 0 88px;min-width:88px}
      .monster-hero-card--compact{padding:5px 6px;text-align:center}
      .monster-hero-card--compact .monster-hero-card__label{font-size:9px;line-height:1.05;margin-bottom:4px}
      .monster-hero-card--compact .monster-hero-card__input{padding:4px 3px;font-size:15px;text-align:center}
      .monster-hero-card--compact .monster-hero-card__sub{font-size:8px;line-height:1.05;word-break:break-word;margin-top:3px}
      .monster-hero-card--stats{display:flex;flex:1 1 auto;flex-direction:column;min-width:0}
      .monster-hero-card--stats .monster-panel__title{margin-bottom:12px}
      .monster-hero-card__label{font-size:12px;color:rgba(255,236,212,.72);margin-bottom:7px}
      .monster-hero-card__value{font-size:22px;font-weight:800;color:#fff7ef}
      .monster-hero-card__sub{font-size:12px;color:rgba(255,236,212,.7);margin-top:5px}
      .monster-hero-card__input{width:100%;background:rgba(255,255,255,.08);border:1px solid rgba(255,230,207,.16);border-radius:10px;color:#fff8ef;padding:8px 10px;font-size:20px;font-weight:700}
      .monster-hp-top-grid{display:grid;grid-template-columns:minmax(84px,.9fr) minmax(98px,1fr) minmax(66px,.64fr);gap:6px;align-items:end}
      .monster-hp-summary-field{display:flex;flex-direction:column;gap:4px;min-width:0}
      .monster-hp-summary-field span{font-size:10px;color:rgba(255,236,212,.72)}
      .monster-hp-summary-value{width:100%;background:rgba(255,255,255,.08);border:1px solid rgba(255,230,207,.16);border-radius:10px;color:#fff8ef;padding:7px 7px;font-size:14px;font-weight:700;line-height:1.15;min-height:39px;display:flex;align-items:center}
      .monster-hero-card--hp .monster-hero-card__mini-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) auto;gap:8px;align-items:end;margin-top:10px}
      .monster-hero-card--hp .monster-die-btn{width:42px;height:42px}
      .monster-hp-adjust{display:grid;grid-template-columns:42px minmax(0,1fr) 42px;gap:8px;align-items:end;margin-top:10px}
      .monster-hp-adjust-btn{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border:none;border-radius:12px;background:linear-gradient(180deg,#c53929,#7d150d);color:#fff;font-size:24px;cursor:pointer;box-shadow:0 10px 20px rgba(0,0,0,.24)}
      .monster-hp-adjust-btn:hover{filter:brightness(1.06)}
      .monster-hp-adjust-btn:disabled{opacity:.5;cursor:url("/D20-Initiative/cursor/normalcursor.cur"), default;filter:none}
      .monster-hp-adjust .monster-hero-card__mini-field{gap:6px}
      .monster-hero-card__mini-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) auto;gap:8px;align-items:end;margin-top:10px}
      .monster-hero-card__mini-field{display:flex;flex-direction:column;gap:4px}
      .monster-hero-card__mini-field span{font-size:11px;color:rgba(255,236,212,.72)}
      .monster-hero-card__mini-field input{width:100%;background:rgba(255,255,255,.08);border:1px solid rgba(255,230,207,.16);border-radius:10px;color:#fff8ef;padding:7px 8px;font-size:13px}
      .monster-die-btn{display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;border:none;border-radius:14px;background:linear-gradient(180deg,#c53929,#7d150d);color:#fff;cursor:pointer;box-shadow:0 10px 20px rgba(0,0,0,.3)}
      .monster-die-btn:hover{filter:brightness(1.06)}
      .monster-die-btn:disabled{opacity:.5;cursor:url("/D20-Initiative/cursor/normalcursor.cur"), default;filter:none}
      .monster-die-btn svg{display:block;width:28px;height:28px}
      .monster-hero-card input{width:100%;background:rgba(255,255,255,.08);border:1px solid rgba(255,230,207,.16);border-radius:10px;color:#fff8ef;padding:8px 10px;font-size:19px;font-weight:700}
      .monster-layout{display:grid;grid-template-columns:240px minmax(0,1fr);gap:14px;min-height:420px}
      .monster-sidebar{display:flex;flex-direction:column;gap:8px}
      .monster-sidebar__btn{padding:12px 14px;text-align:left;border-radius:14px;border:1px solid rgba(255,226,197,.12);background:rgba(39,20,14,.9);color:#ffe9ce;cursor:pointer;font-weight:700}
      .monster-sidebar__btn.active{background:linear-gradient(180deg,rgba(146,64,44,.95),rgba(104,36,23,.95));border-color:rgba(255,219,180,.28);box-shadow:0 8px 18px rgba(0,0,0,.25)}
      .monster-main{min-height:0;overflow:auto;border-radius:18px;border:1px solid rgba(255,220,188,.12);background:linear-gradient(180deg,rgba(24,14,11,.98),rgba(17,10,8,.98));padding:16px}
      .monster-import-card{width:100%;margin:0 auto;padding:10px 14px;border-radius:16px;border:1px solid rgba(255,221,191,.16);background:linear-gradient(180deg,rgba(48,22,16,.9),rgba(28,14,11,.94));box-shadow:0 12px 28px rgba(0,0,0,.2);text-align:center}
      .monster-import-card__title{font-size:18px;font-weight:800;color:#fff1de}
      .monster-import-card__subtitle{margin-top:3px;color:rgba(255,233,210,.72);font-size:12px;line-height:1.35}
      .monster-import{display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:nowrap;margin-top:8px}
      .monster-import__input{min-width:0;flex:1 1 auto}
      .monster-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
      .monster-panel{border:1px solid rgba(255,224,197,.11);background:rgba(255,255,255,.03);border-radius:16px;padding:14px}
      .monster-panel--wide{grid-column:1/-1}
      .monster-panel__title{font-size:15px;font-weight:800;color:#fff1de;margin-bottom:10px}
      .monster-stat-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .monster-stat{border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,228,204,.1);padding:10px;text-align:center}
      .monster-stat__label{font-size:12px;color:rgba(255,236,219,.72)}
      .monster-stat__score{margin-top:6px;font-size:20px;font-weight:800;color:#fff}
      .monster-stat__mod{margin-top:4px;font-size:12px;color:#ffd5a0}
      .monster-stat__input{margin-top:6px;width:100%;background:rgba(255,255,255,.08);border:1px solid rgba(255,230,207,.16);border-radius:10px;color:#fff8ef;padding:4px 3px;font-size:15px;font-weight:700;text-align:center}
      .monster-stat__rolls{margin-top:7px;display:grid;gap:4px}
      .monster-stat__roll-row{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:4px;padding:3px 5px;border-radius:8px;border:1px solid rgba(255,228,204,.12);background:rgba(0,0,0,.16);min-width:0}
      .monster-stat__roll-label{font-size:9px;letter-spacing:.04em;color:rgba(255,236,219,.72);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left}
      .monster-stat__roll-value{font-size:11px;font-weight:700;color:#ffe2b9;line-height:1}
      .monster-stat__roll-die{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:6px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff3de;cursor:url("/D20-Initiative/cursor/pointer.cur"), pointer;padding:0}
      .monster-stat__roll-die:hover{background:rgba(255,255,255,.10);border-color:rgba(255,255,255,.22)}
      .monster-stat__roll-die:active{transform:translateY(1px)}
      .monster-stat__roll-die svg{display:block;width:12px;height:12px}
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
      .monster-quick-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .monster-edit-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .monster-edit-field{display:flex;flex-direction:column;gap:6px}
      .monster-edit-field span{font-size:12px;color:rgba(255,236,219,.72)}
      .monster-edit-field input{width:100%;background:rgba(255,255,255,.08);border:1px solid rgba(255,228,204,.14);border-radius:10px;color:#fff7ed;padding:9px 10px}
      .monster-empty{padding:14px;border-radius:12px;background:rgba(255,255,255,.03);border:1px dashed rgba(255,228,204,.14);color:#ddc9b2}
      .monster-manual-toolbar{display:flex;justify-content:flex-end;margin-bottom:14px}
      .monster-manual-list{display:grid;gap:12px}
      .monster-manual-card{border:1px solid rgba(255,224,197,.11);background:rgba(255,255,255,.03);border-radius:16px;padding:14px}
      .monster-manual-card.is-collapsed .monster-manual-card__body{display:none}
      .monster-manual-card__head{display:flex;align-items:center;justify-content:space-between;gap:10px}
      .monster-manual-card__title{min-width:0;flex:1 1 auto}
      .monster-manual-card__title-input{width:100%;background:transparent;border:none;color:#fff1de;font-size:15px;font-weight:800;padding:0;outline:none}
      .monster-manual-card__title-input::placeholder{color:rgba(255,241,222,.68)}
      .monster-manual-card__actions{display:flex;align-items:center;gap:8px;flex-shrink:0}
      .monster-manual-icon{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;border:1px solid rgba(255,221,191,.12);background:rgba(255,255,255,.05);color:#ffe6ca;cursor:pointer;font-size:15px}
      .monster-manual-icon:hover{filter:brightness(1.08)}
      .monster-manual-card__body{display:grid;gap:10px;margin-top:12px}
      .monster-manual-field{display:flex;flex-direction:column;gap:6px}
      .monster-manual-field span{font-size:12px;color:rgba(255,236,219,.72)}
      .monster-manual-field input,.monster-manual-field textarea{width:100%;background:rgba(255,255,255,.08);border:1px solid rgba(255,228,204,.14);border-radius:10px;color:#fff7ed;padding:10px}
      .monster-manual-field textarea{min-height:140px;resize:vertical;line-height:1.5}
      .monster-token-layout{display:grid;grid-template-columns:minmax(220px,320px) minmax(0,1fr);gap:14px}
      .monster-token-card{border:1px solid rgba(255,224,197,.11);background:rgba(255,255,255,.03);border-radius:16px;padding:14px}
      .monster-token-card__title{font-size:15px;font-weight:800;color:#fff1de;margin-bottom:10px}
      .monster-token-preview-wrap{border-radius:18px;padding:12px;background:rgba(12,8,8,.3);border:1px solid rgba(255,233,205,.11)}
      .monster-token-preview-wrap .appearance-preview{width:100%;aspect-ratio:1/1;object-fit:contain;border-radius:14px;background:rgba(255,255,255,.04)}
      @media (max-width: 980px){
        .monster-sheet__hero,.monster-layout{grid-template-columns:1fr}
        .monster-grid,.monster-meta,.monster-edit-grid,.monster-quick-grid,.monster-hp-roll-grid,.monster-hero-card__mini-grid,.monster-token-layout{grid-template-columns:1fr}
        .monster-stat-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
      }
      @media (max-width: 760px){
        .monster-hero-cards{flex-direction:column}
        .monster-hero-card--hp,.monster-hero-card--stack,.monster-hero-card--stats{flex:auto;width:100%}
        .monster-hero-card--stack{grid-template-columns:1fr;min-width:0}
        .monster-hp-top-grid{grid-template-columns:1fr}
        .monster-hero-card--hp .monster-hero-card__mini-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
        .monster-hp-adjust{grid-template-columns:42px minmax(0,1fr) 42px}
        .monster-import{flex-direction:column;flex-wrap:wrap}
        .monster-import__input{min-width:100%;width:100%}
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
    if (!sheet.appearance || typeof sheet.appearance !== 'object') sheet.appearance = {};
    if (!sheet.appearance.token || typeof sheet.appearance.token !== 'object') sheet.appearance.token = {};
    if (!sheet.appearance.token.crop || typeof sheet.appearance.token.crop !== 'object') {
      sheet.appearance.token.crop = { x: 50, y: 35, zoom: 140 };
    }
    if (sheet.appearance.token.crop.x === undefined) sheet.appearance.token.crop.x = 50;
    if (sheet.appearance.token.crop.y === undefined) sheet.appearance.token.crop.y = 35;
    if (sheet.appearance.token.crop.zoom === undefined) sheet.appearance.token.crop.zoom = 140;
    const baseUrl = String(sheet.appearance.baseUrl || '').trim();
    if (!baseUrl) {
      sheet.appearance.baseUrl = player?.isEnemy
        ? DEFAULT_MONSTER_BASE_URL
        : (player?.isAlly ? DEFAULT_ALLY_BASE_URL : DEFAULT_MONSTER_BASE_URL);
    }
    if (!String(sheet.appearance.token.mode || '').trim()) sheet.appearance.token.mode = 'full';
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
    const hpRoll = ensureMonsterHpRollConfig(sheet, monster);
    const hpRange = getMonsterHpRange(hpRoll);
    const currentHp = Math.max(0, toInt(get(sheet, 'vitality.hp-current.value', hpRoll.lastTotal || hpInfo.value || vm.hpCur || 0), hpRoll.lastTotal || hpInfo.value || vm.hpCur || 0));
    const maxHp = Math.max(0, toInt(get(sheet, 'vitality.hp-max.value', hpRoll.lastTotal || hpInfo.value || vm.hp || 0), hpRoll.lastTotal || hpInfo.value || vm.hp || 0));
    const acValue = Math.max(0, toInt(get(sheet, 'vitality.ac.value', acInfo.value || vm.ac || 0), acInfo.value || vm.ac || 0));
    const speedFeet = Math.max(0, toInt(get(sheet, 'vitality.speed.value', speedInfo.value || vm.spd || 0), speedInfo.value || vm.spd || 0));
    const proficiencyBonus = toInt(get(sheet, 'proficiency', parseSignedPrimaryNumber(monster?.proficiency_bonus, 0)), parseSignedPrimaryNumber(monster?.proficiency_bonus, 0));

    return {
      playerName: String(get(sheet, 'name.value', '') || player?.name || vm.name || 'Враг').trim() || 'Враг',
      subtitle: [monster?.size_ru || monster?.size_en, monster?.type_ru || monster?.type_en, monster?.alignment_ru || monster?.alignment_en].filter(Boolean).join(', ') || `Лист ${getMonsterSheetTypeLabel(player)}`,
      source: monster?.source || '',
      challenge: monster?.cr != null ? `CR ${monster.cr}` : '',
      xp: monster?.xp ? `${monster.xp} XP` : '',
      proficiencyBonus,
      senses: monster?.senses || '',
      languages: monster?.languages || '',
      acValue,
      acText: monster?.ac || '',
      currentHp,
      maxHp,
      hpText: hpInfo.text,
      hpRoll,
      hpRange,
      speedValue: speedFeet,
      speedText: speedInfo.text || monster?.speed || '',
      saves: monster?.saving_throws || '',
      skills: monster?.skills || '',
      damageVulnerabilities: monster?.damage_vulnerabilities || '',
      damageResistances: monster?.damage_resistances || '',
      damageImmunities: monster?.damage_immunities || '',
      conditionImmunities: monster?.condition_immunities || '',
      traits: normalizeMonsterEntries(monster?.traits),
      description: monster?.description_ru || '',
      actions: normalizeMonsterEntries(monster?.actions),
      reactions: normalizeMonsterEntries(monster?.reactions),
      legendaryActions: normalizeMonsterEntries(monster?.legendary_actions),
      bonusActions: normalizeMonsterEntries(monster?.bonus_actions),
      stats: statOrder.map(([key, label]) => {
        const monsterStat = abilities?.[key] || null;
        const score = toInt(get(sheet, `stats.${key}.score`, monsterStat?.score), toInt(monsterStat?.score, 10));
        const modifier = toInt(get(sheet, `stats.${key}.modifier`, Math.floor((score - 10) / 2)), Math.floor((score - 10) / 2));
        return {
          key,
          label,
          score,
          modifier,
          checkBonus: modifier,
          saveBonus: modifier
        };
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

  function renderMainTraitPanels(entries) {
    if (!entries?.length) return '';
    const titledEntries = entries.filter((entry) => String(entry?.title || '').trim());
    const untitledEntries = entries.filter((entry) => !String(entry?.title || '').trim());
    return `
      ${titledEntries.map((entry) => `
        <div class="monster-panel">
          <div class="monster-panel__title">${esc(entry.title || 'Особенность')}</div>
          <div class="monster-desc">${esc(entry.text || '')}</div>
        </div>
      `).join('')}
      ${untitledEntries.length ? renderEntries('Особенности', untitledEntries) : ''}
    `;
  }

  function renderMainTab(vm, canEdit) {
    return `
      <div class="monster-grid">
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
        ${vm.description ? `
          <div class="monster-panel monster-panel--wide">
            <div class="monster-panel__title">Описание</div>
            <div class="monster-desc">${esc(vm.description)}</div>
          </div>
        ` : ''}
        ${renderMainTraitPanels(vm.traits)}
      </div>
    `;
  }

  function renderExtraTab(vm) {
    const hasEntries = vm.actions.length || vm.reactions.length || vm.legendaryActions.length || vm.bonusActions.length;
    if (!hasEntries) {
      return `<div class="monster-empty">Для этого врага пока нет расширенных данных монстра. Если токен создан из библиотеки SRD, они появятся автоматически.</div>`;
    }
    return `
      <div class="monster-grid">
        ${renderEntries('Действия', vm.actions)}
        ${renderEntries('Бонусные действия', vm.bonusActions)}
        ${renderEntries('Реакции', vm.reactions)}
        ${renderEntries('Легендарные действия', vm.legendaryActions)}
      </div>
    `;
  }

  function normalizeManualDescriptionEntries(entries) {
    if (!Array.isArray(entries)) return [];
    return entries.map((entry) => ({
      title: String(entry?.title || '').trim(),
      text: String(entry?.text || '').trim(),
      collapsed: !!entry?.collapsed
    }));
  }

  function ensureMonsterManualState(sheet) {
    if (!sheet || typeof sheet !== 'object') return { entries: [] };
    if (!sheet.monsterManual || typeof sheet.monsterManual !== 'object') sheet.monsterManual = {};
    if (!Array.isArray(sheet.monsterManual.entries)) sheet.monsterManual.entries = [];
    sheet.monsterManual.entries = normalizeManualDescriptionEntries(sheet.monsterManual.entries);
    return sheet.monsterManual;
  }

  function renderManualDescriptionsTab(player, canEdit) {
    const sheet = ensureEnemySheet(player);
    const manual = ensureMonsterManualState(sheet);
    const entries = manual.entries || [];
    return `
      <div class="monster-panel monster-panel--wide">
        <div class="monster-panel__title">Ручное описание</div>
        ${canEdit ? `
          <div class="monster-manual-toolbar">
            <button type="button" class="btn" data-monster-manual-add>Добавить описание</button>
          </div>
        ` : ''}
        ${entries.length ? `
          <div class="monster-manual-list">
            ${entries.map((entry, index) => `
              <div class="monster-manual-card ${entry.collapsed ? 'is-collapsed' : ''}" data-monster-manual-item="${index}">
                <div class="monster-manual-card__head">
                  <label class="monster-manual-card__title">
                    <input
                      class="monster-manual-card__title-input"
                      type="text"
                      ${canEdit ? '' : 'disabled'}
                      data-monster-manual-title="${index}"
                      value="${esc(entry.title || `Описание ${index + 1}`)}"
                      placeholder="Описание ${index + 1}"
                    >
                  </label>
                  <div class="monster-manual-card__actions">
                    <button type="button" class="monster-manual-icon" data-monster-manual-toggle="${index}" title="${entry.collapsed ? 'Развернуть описание' : 'Свернуть описание'}" aria-label="${entry.collapsed ? 'Развернуть описание' : 'Свернуть описание'}">${entry.collapsed ? '▸' : '▾'}</button>
                    ${canEdit ? `<button type="button" class="monster-manual-icon" data-monster-manual-delete="${index}" title="Удалить описание" aria-label="Удалить описание">✕</button>` : ''}
                  </div>
                </div>
                <div class="monster-manual-card__body">
                  <label class="monster-manual-field">
                    <span>Описание</span>
                    <textarea ${canEdit ? '' : 'disabled'} data-monster-manual-text="${index}" placeholder="Подробное описание">${esc(entry.text || '')}</textarea>
                  </label>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `<div class="monster-empty">Пока нет ручных описаний. Добавь отдельный блок, чтобы записать слабости, тактику или лор врага.</div>`}
      </div>
    `;
  }

  function renderTokenTab(player, canEdit) {
    const sheet = ensureEnemySheet(player);
    const baseUrl = esc(String(get(sheet, 'appearance.baseUrl', '') || '').trim());
    return `
      <div class="monster-token-layout" data-appearance-root>
        <div class="monster-token-card">
          <div class="monster-token-card__title">Персонаж</div>
          <div class="monster-token-preview-wrap">
            <img class="appearance-preview" data-appearance-preview src="${baseUrl}" alt="Токен монстра" />
          </div>
          <label class="monster-manual-field" style="margin-top:12px">
            <span>Ссылка на картинку или GIF</span>
            <input type="text" data-sheet-path="appearance.baseUrl" data-appearance-base-override ${canEdit ? '' : 'disabled'} value="${baseUrl}" placeholder="https://...">
          </label>
        </div>
        <div class="monster-token-card">
          <div class="appearance-tokenbox" data-tokenbox>
            <div class="appearance-tokenbox__title">Токен на поле</div>
            <div class="appearance-tokenbox__body">
              <div class="appearance-tokenbox__preview" data-token-preview aria-label="Превью токена"></div>
              <div class="appearance-tokenbox__controls">
                <div class="appearance-tokenbox__modes">
                  <label class="token-mode">
                    <input type="radio" name="monsterTokenMode" value="color" data-sheet-path="appearance.token.mode" ${canEdit ? '' : 'disabled'}>
                    <span>Цвет</span>
                  </label>
                  <label class="token-mode">
                    <input type="radio" name="monsterTokenMode" value="full" data-sheet-path="appearance.token.mode" ${canEdit ? '' : 'disabled'}>
                    <span>Персонаж целиком</span>
                  </label>
                  <label class="token-mode">
                    <input type="radio" name="monsterTokenMode" value="crop" data-sheet-path="appearance.token.mode" ${canEdit ? '' : 'disabled'}>
                    <span>Выбрать область</span>
                  </label>
                </div>
                <div class="appearance-tokenbox__crop" data-token-crop>
                  <div class="token-crop-row">
                    <div class="token-crop-lbl">X</div>
                    <input type="range" min="0" max="100" step="1" data-sheet-path="appearance.token.crop.x" ${canEdit ? '' : 'disabled'}>
                  </div>
                  <div class="token-crop-row">
                    <div class="token-crop-lbl">Y</div>
                    <input type="range" min="0" max="100" step="1" data-sheet-path="appearance.token.crop.y" ${canEdit ? '' : 'disabled'}>
                  </div>
                  <div class="token-crop-row">
                    <div class="token-crop-lbl">Зум</div>
                    <input type="range" min="80" max="220" step="1" data-sheet-path="appearance.token.crop.zoom" ${canEdit ? '' : 'disabled'}>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderMonsterTabContent(tabId, player, vm, canEdit) {
    if (tabId === 'monster-extra') return renderExtraTab(vm);
    if (tabId === 'monster-manual') return renderManualDescriptionsTab(player, canEdit);
    if (tabId === 'monster-token') return renderTokenTab(player, canEdit);
    return renderMainTab(vm, canEdit);
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

        const statMatch = String(path).match(/^stats\.(str|dex|con|int|wis|cha)\.score$/);
        if (statMatch) {
          const statKey = statMatch[1];
          const mod = Math.floor((next - 10) / 2);
          const prof = toInt(get(sheet, 'proficiency', 0), 0);
          set(sheet, `stats.${statKey}.modifier`, mod);
          const modEl = root.querySelector(`[data-monster-stat-mod="${statKey}"]`);
          if (modEl) modEl.textContent = signed(mod);
          const checkEl = root.querySelector(`[data-monster-stat-check="${statKey}"]`);
          if (checkEl) checkEl.textContent = signed(mod);
          const saveEl = root.querySelector(`[data-monster-stat-save="${statKey}"]`);
          if (saveEl) saveEl.textContent = signed(mod);
        }

        const maxHp = Math.max(0, toInt(get(sheet, 'vitality.hp-max.value', get(sheet, 'monsterHpRoll.lastTotal', next)), get(sheet, 'monsterHpRoll.lastTotal', next)));
        const curHp = Math.max(0, Math.min(maxHp, toInt(get(sheet, 'vitality.hp-current.value', 0), 0)));
        set(sheet, 'vitality.hp-max.value', maxHp);
        set(sheet, 'vitality.hp-current.value', curHp);
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

  function bindMonsterNameInput(root, player, canEdit) {
    const input = root.querySelector('[data-monster-player-name]');
    if (!input) return;
    input.value = String(get(player, 'sheet.parsed.name.value', player?.name || '') || player?.name || '').trim() || 'Враг';
    if (!canEdit) {
      input.disabled = true;
      return;
    }
    if (input.__monsterNameBound) return;
    input.__monsterNameBound = true;

    input.addEventListener('input', () => {
      const nextName = String(input.value || '').trimStart();
      const sheet = ensureEnemySheet(player);
      set(sheet, 'name.value', nextName);
      player.name = nextName || 'Враг';
      if (sheetTitle) sheetTitle.textContent = `${getMonsterSheetTitleLabel(player)}: ${player.name}`;
      markModalInteracted(player.id);
      scheduleSave(player);
    });
  }

  function bindMonsterHpRollControls(root, player, canEdit) {
    if (!canEdit) return;
    const inputs = Array.from(root.querySelectorAll('[data-monster-hp-roll-field]'));
    const rerollBtn = root.querySelector('[data-monster-hp-roll]');
    const hpRangeEl = root.querySelector('[data-monster-hp-range]');
    const hpReceivedEl = root.querySelector('[data-monster-hp-received]');
    if (!inputs.length || !rerollBtn) return;

    const syncConfig = () => {
      const sheet = ensureEnemySheet(player);
      const current = ensureMonsterHpRollConfig(sheet, sheet?.monster || null);
      const next = {
        count: Math.max(0, toInt(root.querySelector('[data-monster-hp-roll-field="count"]')?.value, current.count)),
        sides: Math.max(0, toInt(root.querySelector('[data-monster-hp-roll-field="sides"]')?.value, current.sides)),
        bonus: toInt(root.querySelector('[data-monster-hp-roll-field="bonus"]')?.value, current.bonus),
        lastTotal: current.lastTotal
      };
      const normalized = normalizeMonsterHpRollConfig(next, current);
      set(sheet, 'monsterHpRoll', normalized);
      const range = getMonsterHpRange(normalized);
      if (hpRangeEl) hpRangeEl.textContent = `${range.min} / ${range.max}`;
      if (hpReceivedEl) hpReceivedEl.textContent = String(range.received);
      markModalInteracted(player.id);
      scheduleSave(player);
      return sheet;
    };

    inputs.forEach((input) => {
      input.addEventListener('input', () => {
        syncConfig();
      });
    });

    rerollBtn.addEventListener('click', async () => {
      const sheet = syncConfig();
      applyMonsterHpRoll(sheet, sheet?.monster || null);
      try {
        const tokenEl = playerElements?.get?.(String(player?.id || ''));
        if (tokenEl) updateHpBar?.(player, tokenEl);
      } catch {}
      scheduleSave(player);
      await render(player, { canEdit, force: true });
    });
  }

  function bindMonsterHpAdjustControls(root, player, canEdit) {
    if (!canEdit) return;
    const valueInput = root.querySelector('[data-monster-hp-adjust-value]');
    const buttons = Array.from(root.querySelectorAll('[data-monster-hp-adjust]'));
    const hpInput = root.querySelector('[data-monster-sheet-path="vitality.hp-current.value"]');
    if (!valueInput || !buttons.length || !hpInput) return;

    const normalizeAdjustValue = () => {
      const value = Math.max(0, toInt(valueInput.value, 0));
      if (toInt(valueInput.value, 0) !== value) valueInput.value = String(value);
      return value;
    };

    valueInput.addEventListener('input', () => {
      normalizeAdjustValue();
    });

    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const deltaSign = toInt(button.getAttribute('data-monster-hp-adjust') || '0', 0);
        if (!deltaSign) return;
        const amount = normalizeAdjustValue();
        const sheet = ensureEnemySheet(player);
        const received = Math.max(0, toInt(get(sheet, 'monsterHpRoll.lastTotal', get(sheet, 'vitality.hp-max.value', 0)), get(sheet, 'vitality.hp-max.value', 0)));
        const currentHp = Math.max(0, toInt(get(sheet, 'vitality.hp-current.value', 0), 0));
        const nextHp = deltaSign < 0
          ? Math.max(0, currentHp - amount)
          : Math.min(received, currentHp + amount);

        set(sheet, 'vitality.hp-max.value', received);
        set(sheet, 'vitality.hp-current.value', nextHp);
        hpInput.value = String(nextHp);

        try {
          const tokenEl = playerElements?.get?.(String(player?.id || ''));
          if (tokenEl) updateHpBar?.(player, tokenEl);
        } catch {}

        markModalInteracted(player.id);
        scheduleSave(player);
      });
    });
  }

  function bindMonsterStatRollButtons(root, player) {
    if (!root || !player?.sheet?.parsed) return;
    const buttons = Array.from(root.querySelectorAll('[data-monster-roll-kind][data-monster-roll-stat]'));
    if (!buttons.length) return;

    buttons.forEach((btn) => {
      btn.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const statKey = String(btn.getAttribute('data-monster-roll-stat') || '').trim();
        const kind = String(btn.getAttribute('data-monster-roll-kind') || '').trim();
        if (!statKey || !kind) return;

        const sheet = ensureEnemySheet(player);
        const statLabel = String(get(sheet, `stats.${statKey}.label`, statKey.toUpperCase()) || statKey.toUpperCase());
        const statMod = toInt(get(sheet, `stats.${statKey}.modifier`, 0), 0);
        const bonus = statMod;
        const kindText = kind === 'save'
          ? `${statLabel}: Спасбросок d20${bonus ? signed(bonus) : ''}`
          : `${statLabel}: Проверка d20${bonus ? signed(bonus) : ''}`;

        if (window.DicePanel?.roll) {
          await window.DicePanel.roll({ sides: 20, count: 1, bonus, kindText });
        }
      });
    });
  }


  function bindManualDescriptionTab(root, player, vm, canEdit) {
    const main = root.querySelector('#sheet-main');
    if (!main) return;

    const rerenderTab = () => {
      main.innerHTML = renderMonsterTabContent('monster-manual', player, vm, canEdit);
      bindMonsterNameInput(root, player, canEdit);
      bindMonsterSheetInputs(root, player);
      bindMonsterStatRollButtons(root, player);
      bindMonsterHpRollControls(root, player, canEdit);
      bindMonsterHpAdjustControls(root, player, canEdit);
      if (typeof bindEditableInputs === 'function') bindEditableInputs(root, player, canEdit);
      if (typeof bindAppearanceUi === 'function') bindAppearanceUi(root, player, canEdit);
      bindManualDescriptionTab(root, player, vm, canEdit);
      markModalInteracted(player.id);
    };

    const addBtn = main.querySelector('[data-monster-manual-add]');
    if (addBtn && canEdit) {
      addBtn.addEventListener('click', () => {
        const sheet = ensureEnemySheet(player);
        const manual = ensureMonsterManualState(sheet);
        manual.entries.push({ title: `Описание ${manual.entries.length + 1}`, text: '', collapsed: false });
        scheduleSave(player);
        rerenderTab();
      });
    }

    main.querySelectorAll('[data-monster-manual-title]').forEach((input) => {
      input.addEventListener('input', () => {
        const idx = Math.max(0, toInt(input.getAttribute('data-monster-manual-title') || '0', 0));
        const sheet = ensureEnemySheet(player);
        const manual = ensureMonsterManualState(sheet);
        if (!manual.entries[idx]) return;
        manual.entries[idx].title = String(input.value || '');
        markModalInteracted(player.id);
        scheduleSave(player);
      });
    });

    main.querySelectorAll('[data-monster-manual-text]').forEach((textarea) => {
      textarea.addEventListener('input', () => {
        const idx = Math.max(0, toInt(textarea.getAttribute('data-monster-manual-text') || '0', 0));
        const sheet = ensureEnemySheet(player);
        const manual = ensureMonsterManualState(sheet);
        if (!manual.entries[idx]) return;
        manual.entries[idx].text = String(textarea.value || '');
        markModalInteracted(player.id);
        scheduleSave(player);
      });
    });

    main.querySelectorAll('[data-monster-manual-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const idx = Math.max(0, toInt(button.getAttribute('data-monster-manual-toggle') || '0', 0));
        const sheet = ensureEnemySheet(player);
        const manual = ensureMonsterManualState(sheet);
        if (!manual.entries[idx]) return;
        manual.entries[idx].collapsed = !manual.entries[idx].collapsed;
        scheduleSave(player);
        rerenderTab();
      });
    });

    main.querySelectorAll('[data-monster-manual-delete]').forEach((button) => {
      button.addEventListener('click', () => {
        const idx = Math.max(0, toInt(button.getAttribute('data-monster-manual-delete') || '0', 0));
        const sheet = ensureEnemySheet(player);
        const manual = ensureMonsterManualState(sheet);
        if (!manual.entries[idx]) return;
        manual.entries.splice(idx, 1);
        scheduleSave(player);
        rerenderTab();
      });
    });
  }

  function bindTabs(root, player, vm, canEdit) {
    const buttons = Array.from(root.querySelectorAll('[data-monster-tab]'));
    const main = root.querySelector('#sheet-main');
    if (!buttons.length || !main) return;

    const bindCurrentTab = () => {
      bindMonsterNameInput(root, player, canEdit);
      bindMonsterSheetInputs(root, player);
      bindMonsterStatRollButtons(root, player);
      bindMonsterHpRollControls(root, player, canEdit);
      bindMonsterHpAdjustControls(root, player, canEdit);
      if (typeof bindEditableInputs === 'function') bindEditableInputs(root, player, canEdit);
      if (typeof bindAppearanceUi === 'function') bindAppearanceUi(root, player, canEdit);
      if (player._activeSheetTab === 'monster-manual') bindManualDescriptionTab(root, player, vm, canEdit);
    };

    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const tabId = String(button.getAttribute('data-monster-tab') || 'monster-main');
        player._activeSheetTab = tabId;
        const st = getUiState(player.id);
        st.activeTab = tabId;
        buttons.forEach((btn) => btn.classList.toggle('active', btn === button));
        main.innerHTML = renderMonsterTabContent(tabId, player, vm, canEdit);
        bindCurrentTab();
        markModalInteracted(player.id);
      });
    });

    bindCurrentTab();
  }

  function bindImportControls(player, canEdit) {
    if (!canEdit) return;
    const input = sheetContent?.querySelector?.('[data-monster-import-url]');
    const button = sheetContent?.querySelector?.('[data-monster-import-btn]');
    if (!input || !button) return;

    const setBusy = (busy) => {
      input.disabled = !!busy;
      button.disabled = !!busy;
      button.textContent = busy ? 'Импорт…' : 'Импортировать';
    };

    button.addEventListener('click', async () => {
      const href = extractBestiaryUrl(input.value) || normalizeBestiaryUrl(input.value);
      setBusy(true);
      try {
        const monster = await importMonsterFromUrl(href || input.value);
        const sheet = ensureEnemySheet(player);
        ensureImportedMonsterStats(sheet, monster);
        const importedName = String(monster?.name_ru || monster?.name_en || '').trim();
        if (importedName) {
          player.name = importedName;
          set(sheet, 'name.value', importedName);
        }
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
    if (!['monster-main', 'monster-extra', 'monster-manual', 'monster-token'].includes(activeTab)) activeTab = 'monster-main';
    player._activeSheetTab = activeTab;
    activeUi.activeTab = activeTab;

    sheetTitle.textContent = `${getMonsterSheetTitleLabel(player)}: ${player.name}`;
    sheetSubtitle.textContent = player.ownerName
      ? `Владелец: ${player.ownerName} • Тип: ${getMonsterSheetTypeLabel(player)}`
      : `Тип: ${getMonsterSheetTypeLabel(player)}`;

    sheetActions.innerHTML = '';
    const note = document.createElement('div');
    note.className = 'sheet-note';
    note.textContent = canEdit
      ? `Это отдельный лист ${getMonsterSheetTypeLabel(player)}. Основные боевые параметры можно менять сразу здесь.`
      : `Просмотр листа ${getMonsterSheetTypeLabel(player)}. Изменять параметры может только GM.`;
    sheetActions.appendChild(note);

    sheetContent.innerHTML = '<div class="monster-note">Загружаю данные монстра…</div>';

    const monster = await resolveMonsterRecord(player);
    if (openedSheetPlayerId !== player.id) return true;

    const vm = buildMonsterViewModel(player, sheet, monster);
    sheetContent.innerHTML = `
      <div class="monster-sheet">
        ${renderImportControls(canEdit, player?.sheet?.parsed?.monster?.source_url || '')}
        <div class="monster-sheet__hero">
          <div>
            <input
              class="monster-sheet__title-input"
              type="text"
              ${canEdit ? '' : 'disabled'}
              data-monster-player-name
              value="${esc(vm.playerName)}"
              placeholder="Имя персонажа"
            >
            <div class="monster-sheet__subtitle">${esc(vm.subtitle || 'Лист врага')}</div>
            <div class="monster-sheet__summary">
              ${vm.challenge ? `<span class="monster-chip">${esc(vm.challenge)}</span>` : ''}
              ${vm.xp ? `<span class="monster-chip">${esc(vm.xp)}</span>` : ''}
              ${vm.languages ? `<span class="monster-chip">${esc(vm.languages)}</span>` : ''}
              ${vm.source ? `<span class="monster-chip">${esc(vm.source)}</span>` : ''}
            </div>
          </div>
          <div class="monster-hero-cards">
            <div class="monster-hero-card monster-hero-card--hp">
              <div class="monster-hp-top-grid">
                <label class="monster-hp-summary-field">
                  <span>Текущее здоровье</span>
                  <input class="monster-hero-card__input" type="number" min="0" ${canEdit ? '' : 'disabled'} data-monster-sheet-path="vitality.hp-current.value" value="${esc(String(vm.currentHp))}">
                </label>
                <div class="monster-hp-summary-field">
                  <span>Мин/Макс здоровья</span>
                  <div class="monster-hp-summary-value" data-monster-hp-range>${esc(`${vm.hpRange.min} / ${vm.hpRange.max}`)}</div>
                </div>
                <div class="monster-hp-summary-field">
                  <span>Получено</span>
                  <div class="monster-hp-summary-value" data-monster-hp-received>${esc(String(vm.hpRange.received))}</div>
                </div>
              </div>
              <div class="monster-hero-card__sub">${esc(vm.hpText || 'HP будет выбран после броска кубика')}</div>
              <div class="monster-hero-card__mini-grid">
                <label class="monster-hero-card__mini-field">
                  <span>Кубики</span>
                  <input type="number" min="0" ${canEdit ? '' : 'disabled'} data-monster-hp-roll-field="count" value="${esc(String(vm.hpRoll?.count || 0))}">
                </label>
                <label class="monster-hero-card__mini-field">
                  <span>Грани</span>
                  <input type="number" min="0" ${canEdit ? '' : 'disabled'} data-monster-hp-roll-field="sides" value="${esc(String(vm.hpRoll?.sides || 0))}">
                </label>
                <label class="monster-hero-card__mini-field">
                  <span>Бонус</span>
                  <input type="number" ${canEdit ? '' : 'disabled'} data-monster-hp-roll-field="bonus" value="${esc(String(vm.hpRoll?.bonus || 0))}">
                </label>
                <button type="button" class="monster-die-btn" ${canEdit ? '' : 'disabled'} data-monster-hp-roll title="Бросить HP" aria-label="Бросить HP">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 2 20.5 7v10L12 22 3.5 17V7L12 2Z" fill="currentColor"></path>
                    <path d="M12 2v20M3.5 7l8.5 5 8.5-5M3.5 17l8.5-5 8.5 5" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.2"></path>
                  </svg>
                </button>
              </div>
              <div class="monster-hp-adjust">
                <button type="button" class="monster-hp-adjust-btn" ${canEdit ? '' : 'disabled'} data-monster-hp-adjust="-1" aria-label="Убавить здоровье">−</button>
                <label class="monster-hero-card__mini-field">
                  <span>Изменить здоровье</span>
                  <input type="number" min="0" ${canEdit ? '' : 'disabled'} data-monster-hp-adjust-value value="1">
                </label>
                <button type="button" class="monster-hp-adjust-btn" ${canEdit ? '' : 'disabled'} data-monster-hp-adjust="1" aria-label="Добавить здоровье">+</button>
              </div>
            </div>
            <div class="monster-hero-card--stack">
              <div class="monster-hero-card monster-hero-card--compact">
                <div class="monster-hero-card__label">Бонус мастерства</div>
                <input class="monster-hero-card__input" type="number" ${canEdit ? '' : 'disabled'} data-monster-sheet-path="proficiency" value="${esc(String(vm.proficiencyBonus || 0))}">
                <div class="monster-hero-card__sub">${esc(monster?.proficiency_bonus || 'Без уточнений')}</div>
              </div>
              <div class="monster-hero-card monster-hero-card--compact">
                <div class="monster-hero-card__label">КД</div>
                <input class="monster-hero-card__input" type="number" min="0" ${canEdit ? '' : 'disabled'} data-monster-sheet-path="vitality.ac.value" value="${esc(String(vm.acValue || 0))}">
                <div class="monster-hero-card__sub">${esc(vm.acText || 'Без уточнений')}</div>
              </div>
              <div class="monster-hero-card monster-hero-card--compact">
                <div class="monster-hero-card__label">Скорость</div>
                <input class="monster-hero-card__input" type="number" min="0" ${canEdit ? '' : 'disabled'} data-monster-sheet-path="vitality.speed.value" value="${esc(String(vm.speedValue || 0))}">
                <div class="monster-hero-card__sub">${esc(vm.speedText || vm.senses || 'Без уточнений')}</div>
              </div>
            </div>
            <div class="monster-hero-card monster-hero-card--stats">
              <div class="monster-panel__title">Характеристики</div>
              <div class="monster-stat-grid">
                ${vm.stats.map((stat) => `
                  <div class="monster-stat">
                    <div class="monster-stat__label">${esc(stat.label)}</div>
                    <input class="monster-stat__input" type="number" min="0" ${canEdit ? '' : 'disabled'} data-monster-sheet-path="stats.${esc(stat.key)}.score" value="${esc(String(stat.score))}">
                    <div class="monster-stat__mod" data-monster-stat-mod="${esc(stat.key)}">${esc(signed(stat.modifier))}</div>
                    <div class="monster-stat__rolls">
                      <div class="monster-stat__roll-row">
                        <span class="monster-stat__roll-label">ПРОВЕРКА</span>
                        <span class="monster-stat__roll-value" data-monster-stat-check="${esc(stat.key)}">${esc(signed(stat.checkBonus))}</span>
                        <button type="button" class="monster-stat__roll-die" data-monster-roll-kind="check" data-monster-roll-stat="${esc(stat.key)}" title="Проверка d20" aria-label="Проверка ${esc(stat.label)}">
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 2 20.5 7v10L12 22 3.5 17V7L12 2Z" fill="currentColor"></path>
                            <path d="M12 2v20M3.5 7l8.5 5 8.5-5M3.5 17l8.5-5 8.5 5" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"></path>
                          </svg>
                        </button>
                      </div>
                      <div class="monster-stat__roll-row">
                        <span class="monster-stat__roll-label">СПАСБРОСОК</span>
                        <span class="monster-stat__roll-value" data-monster-stat-save="${esc(stat.key)}">${esc(signed(stat.saveBonus))}</span>
                        <button type="button" class="monster-stat__roll-die" data-monster-roll-kind="save" data-monster-roll-stat="${esc(stat.key)}" title="Спасбросок d20" aria-label="Спасбросок ${esc(stat.label)}">
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 2 20.5 7v10L12 22 3.5 17V7L12 2Z" fill="currentColor"></path>
                            <path d="M12 2v20M3.5 7l8.5 5 8.5-5M3.5 17l8.5-5 8.5 5" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"></path>
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>

        <div class="monster-layout">
          <div class="monster-sidebar">
            <button type="button" class="monster-sidebar__btn ${activeTab === 'monster-main' ? 'active' : ''}" data-monster-tab="monster-main">Основное</button>
            <button type="button" class="monster-sidebar__btn ${activeTab === 'monster-extra' ? 'active' : ''}" data-monster-tab="monster-extra">Дополнительно</button>
            <button type="button" class="monster-sidebar__btn ${activeTab === 'monster-manual' ? 'active' : ''}" data-monster-tab="monster-manual">Ручное описание</button>
            <button type="button" class="monster-sidebar__btn ${activeTab === 'monster-token' ? 'active' : ''}" data-monster-tab="monster-token">Токен</button>
          </div>
          <div class="monster-main" id="sheet-main">
            ${renderMonsterTabContent(activeTab, player, vm, canEdit)}
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

    bindTabs(sheetContent, player, vm, canEdit);
    bindImportControls(player, canEdit);
    return true;
  }

  function shouldUseForPlayer(player) {
    return shouldUseMonsterStyleSheet(player);
  }

  window.MonsterSheetModal = {
    shouldUseForPlayer,
    render,
    preload: loadMonsterDatabase,
    importFromUrl: importMonsterFromUrl,
    parseText: parseMonsterText
  };
})();
