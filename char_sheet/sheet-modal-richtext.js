// ================== RICH TEXT + TEXTAREA PERSISTENCE MODULE ==================
// Extracted from sheet-modal-bindings.js to reduce file size and isolate
// editor/persistence concerns while preserving the same global APIs.

function normalizeHref(href) {
  const h = String(href || '').trim();
  if (!h) return '';
  if (/^(https?:\/\/|mailto:|tel:)/i.test(h)) return h;
  if (/^www\./i.test(h)) return 'https://' + h;
  if (/^[a-z0-9.-]+\.[a-z]{2,}([\/?#].*)?$/i.test(h)) return 'https://' + h;
  return h;
}
// ================== RICH TEXT (modal editor) ==================
// ===================== RTE height persistence =====================
// For the main "Описание" field (and some other large fields) the source textarea
// often does NOT have data-sheet-path, so a key based only on data-sheet-path was empty
// and height couldn't persist across tab switches (DOM is re-rendered).
// Build a stable per-player key from data attributes / surrounding metadata.
const RTE_HEIGHT_LS_KEY = 'int_sheet_rte_heights_v1';

function loadRteHeights() {
  try {
    const raw = (typeof getAppStorageItem === 'function' ? getAppStorageItem(RTE_HEIGHT_LS_KEY) : localStorage.getItem(RTE_HEIGHT_LS_KEY));
    const obj = raw ? JSON.parse(raw) : {};
    return (obj && typeof obj === 'object') ? obj : {};
  } catch {
    return {};
  }
}

function saveRteHeights(obj) {
  try {
    (typeof setAppStorageItem === 'function' ? setAppStorageItem(RTE_HEIGHT_LS_KEY, JSON.stringify(obj || {})) : localStorage.setItem(RTE_HEIGHT_LS_KEY, JSON.stringify(obj || {})));
  } catch {}
}

function rtePersistKey(player, ta, fallbackIndex) {
  const pid = String(player?.id || player?.name || 'unknown');
  const prefix = `p:${pid}|`;

  const sp = ta?.getAttribute?.('data-sheet-path');
  if (sp) return prefix + `path:${sp}`;

  // Main description on the sheet (often uses data-wm-desc)
  if (ta?.hasAttribute?.('data-wm-desc')) return prefix + 'wmDesc:main';

  // Notes / misc fields
  if (ta?.hasAttribute?.('data-note-text')) {
    const idx = ta?.getAttribute?.('data-note-text') ?? '';
    return prefix + `noteText:${idx || fallbackIndex}`;
  }

  // Popup manual description field
  if (ta?.hasAttribute?.('data-manual-desc')) return prefix + 'manualDesc:main';

  // Weapon fields with idx
  const wf = ta?.getAttribute?.('data-weapon-field');
  if (wf) {
    const card = ta.closest?.('.weapon-card[data-weapon-idx]');
    const idx = card?.getAttribute?.('data-weapon-idx') ?? '';
    return prefix + `weapon:${idx}:${wf}`;
  }

  // Combat ability text
  if (ta?.hasAttribute?.('data-combat-ability-text')) {
    const item = ta.closest?.('.combat-ability-item[data-combat-ability-idx]');
    const idx = item?.getAttribute?.('data-combat-ability-idx') ?? '';
    return prefix + `combatAbility:${idx}:text`;
  }

  // Spell description editor
  if (ta?.hasAttribute?.('data-spell-desc-editor')) {
    const item = ta.closest?.('.spell-item[data-spell-url]');
    const href = item?.getAttribute?.('data-spell-url') || '';
    return prefix + `spellDesc:${href}`;
  }

  // id/name
  if (ta?.id) return prefix + `id:${ta.id}`;
  if (ta?.name) return prefix + `name:${ta.name}`;

  // last resort
  return prefix + `idx:${fallbackIndex}`;
}

function upgradeSheetTextareasToRte(root, player, canEdit) {
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
        if (!a.closest('.rte-editor') && !a.closest('.rte-modal') && !a.closest('#sheet-modal') && !a.closest('.sheet-modal')) return;
        const href = normalizeHref(a.getAttribute('href'));
        if (!href) return;

        // Stop in-app routers from hijacking. Do NOT preventDefault —
        // we want native link behavior (context menu etc.).
        e.stopPropagation();
        try { e.stopImmediatePropagation?.(); } catch {}

        // Force-open on normal left click in a NEW TAB (even if target=_blank already).
        const isEditable = !!a.closest('[contenteditable="true"]');
        const isPlainLeftDown = ((e.type === 'pointerdown' || e.type === 'mousedown') && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey);
        if (isPlainLeftDown && !isEditable) {
          e.preventDefault();
          try {
            const tmp = document.createElement('a');
            tmp.href = href;
            tmp.target = '_blank';
            tmp.rel = 'noopener noreferrer';
            tmp.style.position = 'fixed';
            tmp.style.left = '-9999px';
            document.body.appendChild(tmp);
            tmp.click();
            tmp.remove();
          } catch {}
          return;
        }

        const isPlainLeft = (e.type === 'click' && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey);
        if (isPlainLeft) {
          e.preventDefault();
          try {
            // Use a real <a target=_blank>.click() to mimic native "Open link in new tab".
            const tmp = document.createElement('a');
            tmp.href = href;
            tmp.target = '_blank';
            tmp.rel = 'noopener noreferrer';
            tmp.style.position = 'fixed';
            tmp.style.left = '-9999px';
            document.body.appendChild(tmp);
            tmp.click();
            tmp.remove();
          } catch {}
        }
      } catch {}
    };

    document.addEventListener('pointerdown', stopHijack, true);
    document.addEventListener('mousedown', stopHijack, true);
    document.addEventListener('click', stopHijack, true);
  }

  const htmlEscape = (s) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const LINK_COLOR = 'rgb(204,130,36)';

  // Ensure link hover/hand cursor styling exists even if global CSS doesn't include it.
  if (!window.__rteLinkStyleInstalled) {
    window.__rteLinkStyleInstalled = true;
    try {
      const st = document.createElement('style');
      st.setAttribute('data-rte-link-style', '1');
      st.textContent = `
        .rte-editor a.rte-link, .rte-modal a.rte-link {
          cursor: pointer;
          text-decoration: underline;
          font-weight: 700;
        }
        .rte-editor a.rte-link:hover, .rte-modal a.rte-link:hover {
          filter: brightness(1.15);
        }
      `;
      document.head.appendChild(st);
    } catch {}
  }

  const makeLinkAnchorHTML = (href, label) => {
    const safeHref = htmlEscape(String(href || ''));
    const safeLabel = htmlEscape(String(label || ''));
    // Keep link styling consistent with the UI (bold + underline + custom color).
    return `<a class="rte-link" href="${safeHref}" target="_blank" rel="noopener noreferrer" style="color:${LINK_COLOR}"><b><u>${safeLabel}</u></b></a>`;
  };

  const linkifyPlain = (plain) => {
    const t = String(plain || '');
    const esc = htmlEscape(t);
    const urlRe = /((https?:\/\/|www\.)[^\s<]+)|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
    return esc.replace(urlRe, (m) => {
      if (m.includes('@') && !m.startsWith('http')) {
        const href = 'mailto:' + m;
        return makeLinkAnchorHTML(href, m);
      }
      const href = normalizeHref(m);
      return makeLinkAnchorHTML(href, m);
    }).replace(/\n/g, '<br>');
  };

  const ALLOWED_TAGS = new Set([
    'B','STRONG','I','EM','U','BR','UL','OL','LI','A',
    'P','DIV','SPAN',
    // Tables (for paste + stored content)
    'TABLE','THEAD','TBODY','TFOOT','TR','TD','TH'
  ]);

  // sanitizeHtml
  // Modes:
  // - paste: keep structure (p/div/ul/ol/li), keep semantic formatting (b/i/u), keep links,
  //          optionally keep font-size (clamped) but drop foreign fonts/colors/backgrounds.
  // - store: same as paste, but also preserves our internal font-size spans.
  // - flatten: legacy mode (p/div -> <br>)
  const sanitizeHtml = (html, opts = {}) => {
    try {
      const mode = opts && opts.mode ? String(opts.mode) : '';
      const tpl = document.createElement('template');
      tpl.innerHTML = String(html || '');

      const walk = (node, parentTag = '') => {
        const children = Array.from(node.childNodes || []);
        for (const ch of children) {
          if (ch.nodeType === Node.TEXT_NODE) continue;
          if (ch.nodeType !== Node.ELEMENT_NODE) { ch.remove(); continue; }

          const tag = (ch.tagName || '').toUpperCase();

          // Block tags
          // - legacy: flatten p/div into <br>
          // - paste/store: keep paragraphs so formatting survives Save/Load
          if (tag === 'P' || tag === 'DIV') {
            if (mode === 'flatten') {
              const frag = document.createDocumentFragment();
              while (ch.firstChild) frag.appendChild(ch.firstChild);
              ch.replaceWith(frag);
              if (parentTag !== 'TD' && parentTag !== 'TH') {
                node.insertBefore(document.createElement('br'), frag.nextSibling);
              }
              continue;
            }

            // Normalize DIV -> P (cleaner storage)
            if (tag === 'DIV') {
              const p = document.createElement('p');
              while (ch.firstChild) p.appendChild(ch.firstChild);
              ch.replaceWith(p);
              walk(p, parentTag);
              continue;
            }

            // P: keep it, just strip attrs (handled below) and recurse
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

          // Tables: keep structure but remove foreign styling and apply our site class.
          if (tag === 'TABLE') {
            ch.classList.add('rte-table');
            // Remove inline style/class from the source if any slipped through
            ch.removeAttribute('style');
          }
          if (tag === 'TD' || tag === 'TH') {
            ch.removeAttribute('style');
          }


          if (tag === 'SPAN') {
            // Allow only a very small safe subset of inline styles.
            // - paste/store: allow font-size: 12..30px (clamped)
            // - paste: also convert common inline styles (bold/italic/underline) to semantic tags, then strip styles
            // - color is only allowed for our link marker and will be normalized anyway
            const st = String(ch.getAttribute('style') || '');

            // If an external site uses <span style="font-weight:700"> instead of <b>/<strong>,
            // we preserve the meaning but not the foreign styling.
            if (mode === 'paste' && st) {
              const fwM = st.match(/font-weight\s*:\s*([^;]+)/i);
              const fsItalic = /font-style\s*:\s*italic/i.test(st);
              const tdUnderline = /text-decoration\s*:\s*[^;]*underline/i.test(st);

              let isBold = false;
              if (fwM) {
                const v = String(fwM[1] || '').trim().toLowerCase();
                if (v === 'bold' || v === 'bolder') isBold = true;
                else {
                  const n = parseInt(v, 10);
                  if (Number.isFinite(n) && n >= 600) isBold = true;
                }
              }

              if (isBold || fsItalic || tdUnderline) {
                const frag = document.createDocumentFragment();
                while (ch.firstChild) frag.appendChild(ch.firstChild);

                // Wrap inner-most first
                let inner = frag;
                if (tdUnderline) {
                  const u = document.createElement('u');
                  u.appendChild(inner);
                  inner = u;
                }
                if (fsItalic) {
                  const i = document.createElement('i');
                  i.appendChild(inner);
                  inner = i;
                }
                if (isBold) {
                  const b = document.createElement('b');
                  b.appendChild(inner);
                  inner = b;
                }

                ch.replaceWith(inner);
                walk(inner, parentTag);
                continue;
              }
            }

            // Font size from external sources can be px or pt; keep it "по возможности"
            const sizePxM = st.match(/font-size\s*:\s*([0-9]+)px/i);
            const sizePtM = st.match(/font-size\s*:\s*([0-9]+)pt/i);
            const colorM = st.match(/color\s*:\s*([^;]+)/i);

            const out = [];
            // Keep font-size in both paste and store (but nothing else from foreign styles)
            const pxRaw = sizePxM ? Number(sizePxM[1]) : (sizePtM ? (Number(sizePtM[1]) * 4/3) : null);
            if (pxRaw && Number.isFinite(pxRaw)) {
              const px = Math.max(12, Math.min(30, Math.round(pxRaw)));
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


          walk(ch, tag);
          }
      };

      walk(tpl.content, '');

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

    // Prevent stacking overlays if something goes wrong (or user dblclicks many times).
    try {
      document.querySelectorAll('.rte-modal-overlay').forEach((n) => n.remove());
    } catch {}

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

      // In many browsers, <a> inside contenteditable won't navigate on click.
      // So we open it explicitly and prevent any in-app click hijackers.
      const href = normalizeHref(a.getAttribute('href') || a.href || '');
      if (!href) return;

      e.stopPropagation();
      try { e.stopImmediatePropagation?.(); } catch {}

      // Let context menu / right click work normally.
      if (e.type === 'pointerdown' && (e.button !== 0)) return;

      const isPlainLeft = (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey);

      // Fallback: some routers cancel the final click; open early for non-editable areas.
      if ((e.type === 'pointerdown' || e.type === 'mousedown') && isPlainLeft && !a.closest('[contenteditable="true"]')) {
        e.preventDefault();
        try {
          const tmp = document.createElement('a');
          tmp.href = href;
          tmp.target = '_blank';
          tmp.rel = 'noopener noreferrer';
          tmp.style.position = 'fixed';
          tmp.style.left = '-9999px';
          document.body.appendChild(tmp);
          tmp.click();
          tmp.remove();
        } catch {}
        return;
      }

      if (e.type === 'click' && isPlainLeft) {
        e.preventDefault();
        try {
          const tmp = document.createElement('a');
          tmp.href = href;
          tmp.target = '_blank';
          tmp.rel = 'noopener noreferrer';
          tmp.style.position = 'fixed';
          tmp.style.left = '-9999px';
          document.body.appendChild(tmp);
          tmp.click();
          tmp.remove();
        } catch {}
      }
    };

    // Use capture to beat any global click routers.
    editor.addEventListener('pointerdown', stopLinkBubble, true);
    editor.addEventListener('mousedown', stopLinkBubble, true);
    editor.addEventListener('click', stopLinkBubble, true);

    const close = () => { try { overlay.remove(); } catch {} };

    btnClose?.addEventListener('click', close);
    btnCancel?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    btnSave?.addEventListener('click', () => {
      // Important: store mode keeps paragraphs/lists so they don't "ломаются" after Save.
      const html = sanitizeHtml(editor.innerHTML || '', { mode: 'store' });
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

  const rteStore = loadRteHeights();
  let rteSaveTimer = null;
  const scheduleRteSave = () => {
    try {
      if (rteSaveTimer) clearTimeout(rteSaveTimer);
      rteSaveTimer = setTimeout(() => saveRteHeights(rteStore), 160);
    } catch {}
  };

  const textareas = Array.from(root.querySelectorAll(selector));
  textareas.forEach((ta, idx) => {
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
      ? (raw.includes('<') ? sanitizeHtml(raw, { mode: 'store' }) : htmlEscape(raw).replace(/\n/g, '<br>'))
      : '';

    try {
      const rows = Number(ta.getAttribute('rows') || 0);
      if (rows) editor.style.minHeight = `${Math.max(3, rows) * 18}px`;
    } catch {}

    // Allow resizing the description frame by height and persist it.
    // (So it doesn't auto-grow strictly by text length.)
    // Persist key MUST exist even when there is no data-sheet-path (main "Описание" field).
    const heightKey = rtePersistKey(player, ta, idx);

    // Persist height helper (ResizeObserver doesn't reliably fire for CSS resize in some browsers).
    const persistEditorHeight = () => {
      try {
        if (!heightKey) return;
        const h = Math.round(editor.getBoundingClientRect().height || 0);
        if (h >= 40) {
          rteStore[heightKey] = h;
          scheduleRteSave();
        }
      } catch {}
    };

    // Apply persisted height immediately after creation.
    try {
      const saved = Number(rteStore[heightKey] || 0);
      if (saved && Number.isFinite(saved)) {
        const h = Math.max(60, Math.min(900, saved));
        editor.style.height = `${h}px`;
      }
    } catch {}

    try {
      if (heightKey && window.ResizeObserver) {
        let t = 0;
        const ro = new ResizeObserver(() => {
          try {
            clearTimeout(t);
            t = setTimeout(() => {
              persistEditorHeight();
            }, 120);
          } catch {}
        });
        ro.observe(editor);
      }
    } catch {}

    // Fallback: save on user interaction end (works even when ResizeObserver doesn't trigger).
    try {
      editor.addEventListener('pointerup', persistEditorHeight);
      editor.addEventListener('mouseup', persistEditorHeight);
      editor.addEventListener('touchend', persistEditorHeight, { passive: true });
      editor.addEventListener('mouseleave', persistEditorHeight);
    } catch {}

    // Extra-robust: during CSS resize the mouseup often happens outside the element,
    // so local listeners won't fire. Track last interacted editor and persist on global mouseup.
    try {
      if (!window.__rteHeightPersistGlobalInstalled) {
        window.__rteHeightPersistGlobalInstalled = true;
        const persistLast = () => {
          try {
            const fn = window.__rteHeightPersistLastFn;
            if (typeof fn === 'function') fn();
          } catch {}
        };
        window.addEventListener('mouseup', persistLast, true);
        window.addEventListener('pointerup', persistLast, true);
        window.addEventListener('touchend', persistLast, { passive: true, capture: true });
      }
      const markLast = () => {
        try { window.__rteHeightPersistLastFn = persistEditorHeight; } catch {}
      };
      editor.addEventListener('pointerdown', markLast, true);
      editor.addEventListener('mousedown', markLast, true);
      editor.addEventListener('touchstart', markLast, { passive: true, capture: true });
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
        try { ta.value = sanitizeHtml(editor.innerHTML || '', { mode: 'store' }); } catch {}
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

    // NOTE: "Владение" toggle for armor was removed from UI (no longer needed).

    // Upgrade large textareas to a lightweight rich-text editor (toolbar + contenteditable).
    // This is used for backstory/notes/descriptions etc.
    try { upgradeSheetTextareasToRte(root, player, canEdit); } catch {}

    const deathBtn = root.querySelector('[data-death-save-roll]');
    if (deathBtn) {
      if (!canEdit) deathBtn.disabled = true;
      deathBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!canEdit) return;
        const sheet = player.sheet?.parsed;
        if (!sheet) return;
        if (!isDeathSavesActiveSheet(sheet)) return;

        let roll = null;
        try {
          if (window.DicePanel?.roll) {
            const res = await window.DicePanel.roll({ sides: 20, count: 1, bonus: 0, kindText: 'Спасбросок от смерти: d20' });
            roll = Number(res?.rolls?.[0]);
          }
        } catch {}
        if (!Number.isFinite(roll)) roll = 1 + Math.floor(Math.random() * 20);

        const result = applyDeathSaveRoll(sheet, roll);
        if (result.outcome === 'inactive') return;
        syncDeathSavesUi(root, sheet, canEdit);
        updateHeroChips(root, sheet);
        markModalInteracted(player.id);
        scheduleSheetSave(player);
      });
    }

    const deathDots = root.querySelectorAll('[data-death-dot]');
    deathDots.forEach((dot) => {
      if (!canEdit) {
        try { dot.disabled = true; } catch {}
        return;
      }
      dot.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const sheet = player.sheet?.parsed;
        if (!sheet) return;
        const ds = ensureDeathSavesState(sheet);
        const key = String(dot.getAttribute('data-death-dot') || '');
        const m = key.match(/^(fail|success)-(\d)$/);
        if (!m) return;
        const side = m[1];
        const idx = Math.max(1, Math.min(3, safeInt(m[2], 1)));
        const curVal = Math.max(0, Math.min(3, side === 'fail' ? ds.fail : ds.success));
        const nextVal = (curVal === idx) ? (idx - 1) : idx;
        if (side === 'fail') ds.fail = nextVal;
        else ds.success = nextVal;
        if (ds.fail >= 3) {
          ds.fail = 3;
          ds.stabilized = false;
          ds.lastOutcome = 'dead';
        } else if (ds.success >= 3) {
          ds.success = 3;
          ds.stabilized = true;
          ds.lastOutcome = 'stabilized';
        } else {
          ds.stabilized = false;
          ds.lastOutcome = side === 'fail' ? 'manual-fail' : 'manual-success';
        }
        markModalInteracted(player.id);
        syncDeathSavesUi(root, sheet, canEdit);
        updateHeroChips(root, sheet);
        scheduleSheetSave(player);
      });
    });

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
        const sheetBefore = player.sheet.parsed;
        const oldLevel = Math.max(1, safeInt(getByPath(sheetBefore, 'info.level.value'), 1) || 1);
        const oldHdMax = oldLevel;
        const oldHdRem = Math.max(0, safeInt(getByPath(sheetBefore, 'vitality.hit-dice-total.value'), oldHdMax) || 0);

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

        // Keep hit dice max (= level) in sync when user changes level.
        // We store only remaining in vitality.hit-dice-total.value.
        if (path === 'info.level.value') {
          const sheet = player.sheet.parsed;
          const newLevel = Math.max(1, safeInt(getByPath(sheet, 'info.level.value'), 1) || 1);
          const newHdMax = newLevel;
          let rem = Math.max(0, safeInt(getByPath(sheet, 'vitality.hit-dice-total.value'), newHdMax) || 0);
          // If it was full before, keep it full on level-up.
          if (oldHdRem >= oldHdMax) rem = newHdMax;
          // Clamp for level-down.
          rem = Math.max(0, Math.min(newHdMax, rem));
          setByPath(sheet, 'vitality.hit-dice-total.value', rem);
        }

        // If armor selection changes, sync meta inputs immediately (КД/Мод./Макс.).
        const syncAppearanceArmorUi = () => {
          try {
            const sheet = player.sheet.parsed;
            const baseInp = root.querySelector('[data-sheet-path="appearance.armorRules.base"]');
            const modSel = root.querySelector('[data-sheet-path="appearance.armorRules.modStat"]');
            const maxInp = root.querySelector('[data-sheet-path="appearance.armorRules.max"]');
            const shieldBonusInp = root.querySelector('[data-sheet-path="appearance.shieldRules.bonus"]');

            if (baseInp) baseInp.value = String(getByPath(sheet, 'appearance.armorRules.base') ?? '');
            if (modSel) modSel.value = String(getByPath(sheet, 'appearance.armorRules.modStat') ?? '-');
            if (maxInp) {
              const v = getByPath(sheet, 'appearance.armorRules.max');
              maxInp.value = (v === 0 ? '' : String(v ?? ''));
            }
            if (shieldBonusInp) shieldBonusInp.value = String(getByPath(sheet, 'appearance.shieldRules.bonus') ?? '');
          } catch {}
        };

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

          // After auto-syncing rules from equipped items, update meta inputs right away
          // so user doesn't need to re-open the Appearance tab.
          if (path.startsWith('appearance.slots.')) {
            try { syncAppearanceArmorUi(); } catch {}
          }
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

    // Initial sync for Appearance meta inputs is handled by applyAutoAcToSheet on render.

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
const TA_HEIGHT_LS_KEY = 'int_sheet_ta_heights_v1';

function loadTextareaHeights() {
  try {
    const raw = (typeof getAppStorageItem === 'function' ? getAppStorageItem(TA_HEIGHT_LS_KEY) : localStorage.getItem(TA_HEIGHT_LS_KEY));
    const obj = raw ? JSON.parse(raw) : {};
    return (obj && typeof obj === 'object') ? obj : {};
  } catch {
    return {};
  }
}

function saveTextareaHeights(obj) {
  try {
    (typeof setAppStorageItem === 'function' ? setAppStorageItem(TA_HEIGHT_LS_KEY, JSON.stringify(obj || {})) : localStorage.setItem(TA_HEIGHT_LS_KEY, JSON.stringify(obj || {})));
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
  const resizableTextareaMeta = new Map();
  allTextareas.forEach((ta, i) => {
    try {
      const cs = window.getComputedStyle ? getComputedStyle(ta) : null;
      if (cs && cs.resize === 'none') return; // сохраняем только те, которые можно тянуть

      const key = textareaPersistKey(player, ta, i);
      resizableTextareaMeta.set(ta, { key });
      const h = store[key];
      if (Number.isFinite(h) && h >= 40) {
        ta.style.height = `${Math.round(h)}px`;
      }
    } catch {}
  });

  const getTextareaMeta = (ta) => resizableTextareaMeta.get(ta) || null;

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
        const meta = getTextareaMeta(ta);
        if (!meta?.key) continue;
        const h = Math.round(ta.getBoundingClientRect().height);
        if (h >= 40) {
          store[meta.key] = h;
          scheduleSave();
        }
      }
    });

    // наблюдаем только за теми, которые реально можно тянуть
    for (const ta of resizableTextareaMeta.keys()) {
      try {
        ro.observe(ta);
      } catch {}
    }

    root.__taResizeObserver = ro;
  } else {
    // Fallback (без ResizeObserver): сохраняем высоту по mouseup/touchend
    const handler = (e) => {
      const ta = e.target?.closest?.('textarea');
      if (!ta) return;
      try {
        const meta = getTextareaMeta(ta);
        if (!meta?.key) return;
        const h = Math.round(ta.getBoundingClientRect().height);
        if (h >= 40) {
          store[meta.key] = h;
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
