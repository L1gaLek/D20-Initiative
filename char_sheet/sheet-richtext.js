/* sheet-richtext.js
   Lightweight rich-text editor overlay for all sheet description fields.
   Works by enhancing <textarea data-rtf="1"> elements:
   - keeps textarea as data source (HTML string)
   - renders sanitized HTML in a preview div
   - on click/focus opens a popup editor with toolbar
   - on save writes HTML back to textarea and dispatches input event

   Exposes: window.SheetRichText = { enhance(root) }
*/

(function(){
  const ALLOW_TAGS = new Set(["P","BR","B","STRONG","U","UL","OL","LI","A","SPAN","DIV"]);
  const ALLOW_ATTR = {
    "A": new Set(["href","target","rel","title","class"]),
    "SPAN": new Set(["style","class"]),
    "DIV": new Set(["style","class"]),
    "P": new Set(["style","class"]),
    "UL": new Set(["class"]),
    "OL": new Set(["class"]),
    "LI": new Set(["class"])
  };

  function clamp(n, a, b){ n = Number(n); return Math.max(a, Math.min(b, n)); }

  function isProbablyUrl(s){
    const t = String(s||"").trim();
    return /^https?:\/\//i.test(t) || /^www\./i.test(t);
  }

  function normalizeHref(href){
    let h = String(href||"").trim();
    if (!h) return "";
    if (h.startsWith("www.")) h = "https://" + h;
    return h;
  }

  function sanitizeHtml(html){
    const doc = new DOMParser().parseFromString(`<div>${String(html||"")}</div>`, "text/html");
    const root = doc.body.firstElementChild;
    if (!root) return "";

    const walk = (node) => {
      if (!node) return;
      // remove comments
      if (node.nodeType === Node.COMMENT_NODE) { node.remove(); return; }
      if (node.nodeType === Node.TEXT_NODE) return;
      if (node.nodeType !== Node.ELEMENT_NODE) { node.remove(); return; }

      const el = node;
      const tag = el.tagName;

      // drop dangerous tags
      if (!ALLOW_TAGS.has(tag)) {
        // unwrap unknown tags but keep text
        const frag = doc.createDocumentFragment();
        while (el.firstChild) frag.appendChild(el.firstChild);
        el.replaceWith(frag);
        return;
      }

      // strip attributes
      const allowed = ALLOW_ATTR[tag] || new Set();
      [...el.attributes].forEach(a => {
        const name = a.name.toLowerCase();
        if (!allowed.has(name)) el.removeAttribute(a.name);
      });

      if (tag === "A") {
        const href = normalizeHref(el.getAttribute("href"));
        if (!href) {
          // unwrap empty links
          const frag = doc.createDocumentFragment();
          while (el.firstChild) frag.appendChild(el.firstChild);
          el.replaceWith(frag);
          return;
        }
        el.setAttribute("href", href);
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
        el.classList.add("rtf-link");
      }

      // recurse
      [...el.childNodes].forEach(walk);
    };

    [...root.childNodes].forEach(walk);
    return root.innerHTML;
  }

  function linkifyPlainText(text){
    const t = String(text||"");
    // Split on URLs and keep them
    const urlRe = /(https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+|www\.[\w\-._~:/?#[\]@!$&'()*+,;=%]+)/ig;
    const parts = t.split(urlRe);
    const out = parts.map(p => {
      if (urlRe.test(p)) {
        urlRe.lastIndex = 0;
        const href = normalizeHref(p);
        const safe = escapeHtml(p);
        const safeHref = escapeAttr(href);
        return `<a class="rtf-link" href="${safeHref}" target="_blank" rel="noopener noreferrer"><b><u>${safe}</u></b></a>`;
      }
      return escapeHtml(p);
    }).join("");
    // keep line breaks
    return out.replace(/\n/g, "<br>");
  }

  function escapeHtml(s){
    return String(s)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }
  function escapeAttr(s){
    return escapeHtml(s).replaceAll("`","&#096;");
  }

  // ===== Popup editor (singleton) =====
  let overlay = null;
  let editorBox = null;
  let editorArea = null;
  let fontSel = null;
  let currentTextarea = null;
  let currentPreview = null;

  function ensurePopup(){
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.className = 'rtf-overlay hidden';
    overlay.setAttribute('aria-hidden','true');
    overlay.innerHTML = `
      <div class="rtf-backdrop" data-rtf-close></div>
      <div class="rtf-panel" role="dialog" aria-label="Редактор текста" aria-modal="false">
        <div class="rtf-head">
          <div class="rtf-title">Редактор текста</div>
          <div class="rtf-head-actions">
            <button type="button" class="rtf-btn" data-rtf-save title="Сохранить">Сохранить</button>
            <button type="button" class="rtf-btn danger" data-rtf-close title="Закрыть">✕</button>
          </div>
        </div>

        <div class="rtf-toolbar" role="toolbar" aria-label="Форматирование">
          <label class="rtf-tool">
            <span class="rtf-tool-lbl">Размер</span>
            <select class="rtf-font" data-rtf-font>
              <option value="14">14</option>
              <option value="16" selected>16</option>
              <option value="18">18</option>
              <option value="20">20</option>
              <option value="24">24</option>
            </select>
          </label>
          <button type="button" class="rtf-btn" data-rtf-cmd="bold"><b>B</b></button>
          <button type="button" class="rtf-btn" data-rtf-cmd="underline"><u>U</u></button>
          <button type="button" class="rtf-btn" data-rtf-cmd="insertUnorderedList">• Список</button>
          <button type="button" class="rtf-btn" data-rtf-cmd="insertOrderedList">1. Список</button>
          <button type="button" class="rtf-btn" data-rtf-link>Ссылка</button>
        </div>

        <div class="rtf-editor" data-rtf-editor contenteditable="true" spellcheck="true"></div>

        <div class="rtf-foot">
          <div class="rtf-hint">Подсказка: вставляй текст — ссылки будут распознаны и станут кликабельными.</div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    editorBox = overlay.querySelector('.rtf-panel');
    editorArea = overlay.querySelector('[data-rtf-editor]');
    fontSel = overlay.querySelector('[data-rtf-font]');

    overlay.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest('[data-rtf-close]')) { closePopup(false); return; }
      if (t.closest('[data-rtf-save]')) { closePopup(true); return; }

      const cmdBtn = t.closest('[data-rtf-cmd]');
      if (cmdBtn) {
        const cmd = cmdBtn.getAttribute('data-rtf-cmd');
        if (!cmd) return;
        try { document.execCommand(cmd, false, null); } catch {}
        editorArea?.focus();
        return;
      }

      const linkBtn = t.closest('[data-rtf-link]');
      if (linkBtn) {
        const url = prompt('Вставь ссылку (https://...)');
        if (!url) return;
        const href = normalizeHref(url);
        if (!href) return;
        try { document.execCommand('createLink', false, href); } catch {}
        // normalize created <a>
        try {
          editorArea?.querySelectorAll('a[href]')?.forEach(a => {
            a.setAttribute('target','_blank');
            a.setAttribute('rel','noopener noreferrer');
            a.classList.add('rtf-link');
          });
        } catch {}
        editorArea?.focus();
      }
    });

    fontSel?.addEventListener('change', () => {
      const px = clamp(fontSel.value, 12, 40);
      applyFontSize(px);
      editorArea?.focus();
    });

    // Smart paste
    editorArea?.addEventListener('paste', (e) => {
      try {
        const cd = e.clipboardData;
        if (!cd) return;
        const html = cd.getData('text/html');
        const text = cd.getData('text/plain');

        e.preventDefault();

        let insert = '';
        if (html && html.trim()) {
          // keep links if present
          insert = sanitizeHtml(html);
          if (!insert.trim()) insert = linkifyPlainText(text);
        } else {
          insert = linkifyPlainText(text);
        }

        // insert at caret
        try {
          document.execCommand('insertHTML', false, insert);
        } catch {
          // fallback
          const sel = window.getSelection();
          if (sel && sel.rangeCount) {
            sel.getRangeAt(0).deleteContents();
            const frag = document.createRange().createContextualFragment(insert);
            sel.getRangeAt(0).insertNode(frag);
          } else {
            editorArea.innerHTML += insert;
          }
        }

        // ensure anchors are styled
        try {
          editorArea.querySelectorAll('a[href]')?.forEach(a => {
            a.setAttribute('target','_blank');
            a.setAttribute('rel','noopener noreferrer');
            a.classList.add('rtf-link');
            // make them bold+underlined visually
            if (!a.querySelector('b')) {
              const b = document.createElement('b');
              const u = document.createElement('u');
              while (a.firstChild) u.appendChild(a.firstChild);
              b.appendChild(u);
              a.appendChild(b);
            }
          });
        } catch {}
      } catch {}
    });

    return overlay;
  }

  function applyFontSize(px){
    px = clamp(px, 12, 40);
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      // set base font size on container
      editorArea?.style?.setProperty('--rtf-font-size', `${px}px`);
      return;
    }
    const range = sel.getRangeAt(0);
    if (range.collapsed) {
      editorArea?.style?.setProperty('--rtf-font-size', `${px}px`);
      return;
    }
    const span = document.createElement('span');
    span.style.fontSize = `${px}px`;
    span.appendChild(range.extractContents());
    range.insertNode(span);
    sel.removeAllRanges();
    const r = document.createRange();
    r.selectNodeContents(span);
    r.collapse(false);
    sel.addRange(r);
  }

  function openPopup(textarea, preview){
    ensurePopup();
    currentTextarea = textarea;
    currentPreview = preview;

    const raw = String(textarea?.value ?? "");
    const safe = sanitizeHtml(raw);
    editorArea.innerHTML = safe || "";

    // try to read font size from last used on this field
    const fs = preview?.getAttribute('data-rtf-font') || "16";
    try { if (fontSel) fontSel.value = String(fs); } catch {}

    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden','false');

    setTimeout(() => editorArea?.focus(), 0);
  }

  function closePopup(save){
    if (!overlay) return;

    if (save && currentTextarea) {
      const html = sanitizeHtml(editorArea?.innerHTML || "");
      // Write back
      currentTextarea.value = html;
      try {
        currentTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        currentTextarea.dispatchEvent(new Event('change', { bubbles: true }));
      } catch {}

      if (currentPreview) {
        currentPreview.innerHTML = html || `<span class="rtf-placeholder">${escapeHtml(currentTextarea.getAttribute('placeholder') || "")}</span>`;
        // store last font size
        const fs = String(fontSel?.value || "16");
        currentPreview.setAttribute('data-rtf-font', fs);
        currentPreview.style.setProperty('--rtf-font-size', `${clamp(fs, 12, 40)}px`);
      }
    }

    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden','true');
    currentTextarea = null;
    currentPreview = null;
  }

  function buildPreviewForTextarea(ta){
    const wrap = document.createElement('div');
    wrap.className = 'rtf-wrap';

    const prev = document.createElement('div');
    prev.className = 'rtf-preview';
    prev.tabIndex = 0;

    const raw = String(ta.value || "");
    const safe = sanitizeHtml(raw);
    if (safe.trim()) prev.innerHTML = safe;
    else prev.innerHTML = `<span class="rtf-placeholder">${escapeHtml(ta.getAttribute('placeholder') || "")}</span>`;

    // default font size (can be adjusted in popup)
    prev.style.setProperty('--rtf-font-size', '16px');

    wrap.appendChild(prev);

    // keep original textarea in DOM but hidden
    ta.classList.add('rtf-source');
    ta.style.display = 'none';
    ta.parentNode.insertBefore(wrap, ta);

    // Open editor ONLY on double click (per UX request)
    const open = () => {
      if (ta.disabled) return;
      openPopup(ta, prev);
    };
    prev.addEventListener('dblclick', (e) => {
      e.preventDefault();
      open();
    });

    // Accessibility: allow Enter/Space to open when focused
    prev.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });

    return prev;
  }

  function enhance(root){
    if (!root) return;
    ensurePopup();

    const areas = Array.from(root.querySelectorAll('textarea[data-rtf="1"]'));
    areas.forEach(ta => {
      if (!(ta instanceof HTMLTextAreaElement)) return;
      if (ta.dataset.rtfInited === '1') return;
      ta.dataset.rtfInited = '1';
      buildPreviewForTextarea(ta);
    });
  }

  window.SheetRichText = { enhance, sanitizeHtml };
})();
