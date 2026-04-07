/* monsters-library.js
   Lightweight "link-safe" SRD monster browser (no external scraping).
   Loads a JSON file created from SRD 5.1 and provides:
   - search by name
   - filter by type and CR
   - view stat block
   - emit event to add monster to board

   Usage:
     await window.MonstersLib.init({
       jsonUrl: './srd5_1_monsters_extracted.json',
       onAddToBoard: (monster) => { ... } // optional
     });
     window.MonstersLib.open();
*/
(function () {
  const DEFAULTS = {
    jsonUrl: './srd5_1_monsters_extracted.json',
    onAddToBoard: null
  };

  let cfg = { ...DEFAULTS };
  let openCfg = {};
  let monsters = [];
  let overlay = null;

  function esc(s) {
    return String(s ?? '')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'","&#039;");
  }

  function parseCr(cr) {
    if (cr == null) return null;
    const t = String(cr).trim();
    if (!t) return null;
    if (t.includes('/')) {
      const [a,b] = t.split('/').map(x => Number(x));
      if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
      return a / b;
    }
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  function ensureOverlay() {
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.className = 'mlib-overlay hidden';
    overlay.innerHTML = `
      <div class="mlib-card" role="dialog" aria-modal="true" aria-label="Монстры SRD">
        <div class="mlib-head">
          <div class="mlib-title">Монстры SRD</div>
          <button class="mlib-x" type="button" title="Закрыть">✕</button>
        </div>

        <div class="mlib-controls">
          <input class="mlib-search" type="search" placeholder="Поиск по имени…">
          <select class="mlib-type">
            <option value="">Тип: все</option>
          </select>
          <select class="mlib-cr">
            <option value="">CR: все</option>
            <option value="0">CR 0</option>
            <option value="0.125">CR 1/8</option>
            <option value="0.25">CR 1/4</option>
            <option value="0.5">CR 1/2</option>
            <option value="1">CR 1+</option>
            <option value="5">CR 5+</option>
            <option value="10">CR 10+</option>
            <option value="15">CR 15+</option>
            <option value="20">CR 20+</option>
          </select>
        </div>

        <div class="mlib-body">
          <div class="mlib-list" role="list"></div>
          <div class="mlib-view hidden"></div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // styles (minimal, isolated)
    const style = document.createElement('style');
    style.textContent = `
      .mlib-overlay{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:12px}
      .mlib-overlay.hidden{display:none}
      .mlib-card{width:min(980px,96vw);height:min(86vh,760px);background:#111;border:1px solid rgba(255,255,255,.12);border-radius:14px;overflow:hidden;display:flex;flex-direction:column}
      .mlib-head{display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.10)}
      .mlib-title{font-weight:700}
      .mlib-x{margin-left:auto;background:transparent;border:1px solid rgba(255,255,255,.18);border-radius:10px;color:#fff;padding:6px 10px;cursor:pointer}
      .mlib-controls{display:flex;gap:10px;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.10)}
      .mlib-controls input,.mlib-controls select{background:#0b0b0b;color:#fff;border:1px solid rgba(255,255,255,.16);border-radius:10px;padding:8px 10px;outline:none}
      .mlib-search{flex:1}
      .mlib-body{display:flex;gap:12px;flex:1;min-height:0;padding:12px 14px}
      .mlib-list{width:360px;max-width:42%;overflow:auto;border:1px solid rgba(255,255,255,.10);border-radius:12px}
      .mlib-row{display:flex;gap:10px;align-items:center;padding:10px 10px;border-bottom:1px solid rgba(255,255,255,.06);cursor:pointer}
      .mlib-row:hover{background:rgba(255,255,255,.05)}
      .mlib-row-name{font-weight:700}
      .mlib-row-meta{opacity:.75;font-size:12px}
      .mlib-view{flex:1;overflow:auto;border:1px solid rgba(255,255,255,.10);border-radius:12px;padding:12px}
      .mlib-view.hidden{display:none}
      .mlib-h1{font-size:18px;font-weight:800;margin:0 0 6px}
      .mlib-sub{opacity:.8;margin:0 0 10px}
      .mlib-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
      .mlib-chip{display:inline-flex;gap:6px;align-items:center;border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:6px 10px;font-size:12px;opacity:.92}
      .mlib-sec{margin-top:12px}
      .mlib-sec h3{margin:0 0 6px;font-size:14px}
      .mlib-sec .mlib-item{margin:0 0 6px;line-height:1.35}
      .mlib-btn{display:inline-flex;gap:8px;align-items:center;background:#1a1a1a;border:1px solid rgba(255,255,255,.16);color:#fff;border-radius:10px;padding:8px 10px;cursor:pointer}
      .mlib-btn:hover{background:#222}
      .mlib-actions{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap}
    `;
    document.head.appendChild(style);

    overlay.querySelector('.mlib-x')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.classList.contains('hidden')) close(); });

    overlay.querySelector('.mlib-search')?.addEventListener('input', renderList);
    overlay.querySelector('.mlib-type')?.addEventListener('change', renderList);
    overlay.querySelector('.mlib-cr')?.addEventListener('change', renderList);

    return overlay;
  }

  function open(options = {}) {
    openCfg = { ...(options || {}) };
    ensureOverlay().classList.remove('hidden');
    renderList();
  }

  function close() {
    openCfg = {};
    overlay?.classList.add('hidden');
  }

  function getFilters() {
    const q = (overlay?.querySelector('.mlib-search')?.value || '').trim().toLowerCase();
    const type = (overlay?.querySelector('.mlib-type')?.value || '').trim().toLowerCase();
    const crMin = (overlay?.querySelector('.mlib-cr')?.value || '').trim();
    const crMinNum = crMin ? Number(crMin) : null;
    return { q, type, crMinNum };
  }

  function match(mon, f) {
    if (f.q) {
      const n = (mon.name_ru || mon.name_en || '').toLowerCase();
      if (!n.includes(f.q)) return false;
    }
    if (f.type) {
      const t = String(mon.type_en || '').toLowerCase();
      if (!t.includes(f.type)) return false;
    }
    if (f.crMinNum != null) {
      const cr = parseCr(mon.cr);
      if (cr == null || cr < f.crMinNum) return false;
    }
    return true;
  }

  function fillTypeOptions() {
    const sel = overlay?.querySelector('.mlib-type');
    if (!sel) return;
    const types = Array.from(new Set(monsters.map(m => (m.type_en || '').toLowerCase()).filter(Boolean))).sort();
    sel.innerHTML = `<option value="">Тип: все</option>` + types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  }

  function renderList() {
    if (!overlay) return;
    const listEl = overlay.querySelector('.mlib-list');
    const viewEl = overlay.querySelector('.mlib-view');
    if (!listEl || !viewEl) return;

    const f = getFilters();
    const arr = monsters.filter(m => match(m, f));

    listEl.innerHTML = arr.map(m => {
      const name = m.name_ru || m.name_en || 'Monster';
      const meta = `${m.size_ru || m.size_en || ''} · ${m.type_ru || m.type_en || ''} · CR ${m.cr ?? '?'}`;
      return `
        <div class="mlib-row" role="listitem" data-mid="${esc(m.id)}">
          <div style="flex:1">
            <div class="mlib-row-name">${esc(name)}</div>
            <div class="mlib-row-meta">${esc(meta)}</div>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.mlib-row').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.getAttribute('data-mid');
        const mon = monsters.find(x => x.id === id);
        if (mon) renderView(mon);
      });
    });

    // auto open first
    if (arr[0]) renderView(arr[0]);
    else {
      viewEl.classList.add('hidden');
      viewEl.innerHTML = '';
    }
  }

  function renderEntries(title, entries) {
    if (!entries || !entries.length) return '';
    return `
      <div class="mlib-sec">
        <h3>${esc(title)}</h3>
        ${entries.map(e => `
          <div class="mlib-item">
            <b>${esc(e.name_ru || e.name_en || '')}.</b>
            <span>${esc(e.text_ru || e.text_en || '')}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderView(mon) {
    const viewEl = overlay?.querySelector('.mlib-view');
    if (!viewEl) return;
    viewEl.classList.remove('hidden');

    const name = mon.name_ru || mon.name_en || 'Monster';
    const sub = `${mon.size_ru || mon.size_en || ''} ${mon.type_ru || mon.type_en || ''}${mon.alignment_ru ? ', ' + mon.alignment_ru : ''}`;
    const ac = mon.ac ? `КД: ${mon.ac}` : '';
    const hp = mon.hp ? `ХП: ${mon.hp}` : '';
    const sp = mon.speed ? `Скорость: ${mon.speed}` : '';
    const cr = mon.cr != null ? `CR: ${mon.cr}` : '';
    const lang = mon.languages ? `Языки: ${mon.languages}` : '';
    const sens = mon.senses ? `Чувства: ${mon.senses}` : '';

    const ab = mon.abilities || {};
    const abRow = (k, label) => ab[k] ? `${label} ${ab[k].score} (${ab[k].mod>=0?'+':''}${ab[k].mod})` : '';
    const abText = [abRow('str','СИЛ'),abRow('dex','ЛОВ'),abRow('con','ТЕЛ'),abRow('int','ИНТ'),abRow('wis','МДР'),abRow('cha','ХАР')].filter(Boolean).join(' · ');

    viewEl.innerHTML = `
      <div class="mlib-h1">${esc(name)}</div>
      <div class="mlib-sub">${esc(sub)}</div>

      <div class="mlib-grid">
        ${ac ? `<div class="mlib-chip">${esc(ac)}</div>` : ''}
        ${hp ? `<div class="mlib-chip">${esc(hp)}</div>` : ''}
        ${sp ? `<div class="mlib-chip">${esc(sp)}</div>` : ''}
        ${cr ? `<div class="mlib-chip">${esc(cr)}</div>` : ''}
        ${abText ? `<div class="mlib-chip" style="grid-column:1/-1">${esc(abText)}</div>` : ''}
        ${sens ? `<div class="mlib-chip" style="grid-column:1/-1">${esc(sens)}</div>` : ''}
        ${lang ? `<div class="mlib-chip" style="grid-column:1/-1">${esc(lang)}</div>` : ''}
      </div>

      ${renderEntries('Особенности', mon.traits)}
      ${renderEntries('Действия', mon.actions)}
      ${renderEntries('Реакции', mon.reactions)}
      ${renderEntries('Легендарные действия', mon.legendary_actions)}

      <div class="mlib-actions">
        <button class="mlib-btn" type="button" data-add>${esc(openCfg?.addButtonLabel || 'Добавить на поле боя')}</button>
      </div>
      <div style="opacity:.65;font-size:12px;margin-top:8px">Источник: ${esc(mon.source || 'SRD')}</div>
    `;

    viewEl.querySelector('[data-add]')?.addEventListener('click', () => {
      try {
        if (typeof openCfg?.onAdd === 'function') openCfg.onAdd(mon);
        else if (typeof cfg.onAddToBoard === 'function') cfg.onAddToBoard(mon);
        window.dispatchEvent(new CustomEvent('monster:addToBoard', { detail: { monster: mon } }));
      } catch {}
      close();
    });
  }

  async function init(options = {}) {
    cfg = { ...DEFAULTS, ...(options || {}) };
    ensureOverlay();

    const res = await fetch(cfg.jsonUrl, { cache: 'no-store' });
    const data = await res.json();
    monsters = Array.isArray(data?.monsters) ? data.monsters : [];
    fillTypeOptions();
  }

  window.MonstersLib = { init, open, close, getMonsters: () => monsters };
})();
