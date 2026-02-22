// ===== Sheet Rich Text Popup =====
// Opens a lightweight rich editor for any textarea marked with data-rte="1".
// Stores back into the textarea as a small Markdown-like text.

(function(){
  "use strict";

  const RTE_FLAG = 'data-rte';

  function esc(s){
    return String(s||'')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  function sanitizeHtml(html){
    const tmp = document.createElement('div');
    tmp.innerHTML = String(html || '');

    const allowed = new Set(['A','B','STRONG','U','UL','OL','LI','P','BR','DIV','SPAN']);

    const walk = (node) => {
      const kids = Array.from(node.childNodes);
      for (const ch of kids){
        if (ch.nodeType === 1){
          const tag = ch.tagName;
          if (!allowed.has(tag)){
            // unwrap
            const frag = document.createDocumentFragment();
            while (ch.firstChild) frag.appendChild(ch.firstChild);
            node.replaceChild(frag, ch);
            continue;
          }

          // normalize tags: DIV/SPAN -> P
          if (tag === 'DIV' || tag === 'SPAN'){
            // keep inline spans only if empty styles; otherwise unwrap
            const hasAttrs = ch.attributes && ch.attributes.length;
            if (tag === 'DIV'){
              const p = document.createElement('p');
              while (ch.firstChild) p.appendChild(ch.firstChild);
              node.replaceChild(p, ch);
              walk(p);
              continue;
            }
            if (tag === 'SPAN' && hasAttrs){
              // strip attributes
              while (ch.attributes.length) ch.removeAttribute(ch.attributes[0].name);
            }
          }

          // strip attributes except href on links
          if (tag !== 'A'){
            while (ch.attributes.length) ch.removeAttribute(ch.attributes[0].name);
          } else {
            const href = String(ch.getAttribute('href') || '').trim();
            while (ch.attributes.length) ch.removeAttribute(ch.attributes[0].name);
            if (href) ch.setAttribute('href', href);
            ch.setAttribute('target','_blank');
            ch.setAttribute('rel','noopener noreferrer');
          }

          walk(ch);
        }
      }
    };

    walk(tmp);
    return tmp.innerHTML;
  }

  function linkifyPlainText(text){
    const s = String(text || '');
    // very simple url matcher
    const urlRe = /((https?:\/\/|www\.)[^\s<]+[^\s<\.)\]\}])/gi;
    return esc(s).replace(urlRe, (m) => {
      const href = m.startsWith('http') ? m : ('https://' + m);
      return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(m)}</a>`;
    }).replace(/\n/g,'<br>');
  }

  function markdownToHtml(md){
    let s = String(md || '');
    // normalize line endings
    s = s.replace(/\r\n/g,'\n');

    // lists
    const lines = s.split('\n');
    let out = '';
    let inUl = false;
    let inOl = false;

    const closeLists = () => {
      if (inUl){ out += '</ul>'; inUl = false; }
      if (inOl){ out += '</ol>'; inOl = false; }
    };

    const inline = (t) => {
      let x = String(t || '');
      // links [text](url)
      x = x.replace(/\[([^\]]+?)\]\((https?:\/\/[^)\s]+)\)/g, (m,txt,url)=>{
        return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(txt)}</a>`;
      });
      // bold **x**
      x = x.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      // underline __x__
      x = x.replace(/__([^_]+)__/g, '<u>$1</u>');
      // linkify bare urls
      x = linkifyPlainText(x);
      return x;
    };

    for (const raw of lines){
      const line = raw || '';
      const ul = line.match(/^\s*[-*]\s+(.*)$/);
      const ol = line.match(/^\s*(\d+)\.\s+(.*)$/);

      if (ul){
        if (inOl) { out += '</ol>'; inOl = false; }
        if (!inUl){ out += '<ul>'; inUl = true; }
        out += `<li>${inline(ul[1])}</li>`;
        continue;
      }
      if (ol){
        if (inUl) { out += '</ul>'; inUl = false; }
        if (!inOl){ out += '<ol>'; inOl = true; }
        out += `<li>${inline(ol[2])}</li>`;
        continue;
      }

      closeLists();
      if (line.trim() === ''){
        out += '<p><br></p>';
      } else {
        out += `<p>${inline(line)}</p>`;
      }
    }

    closeLists();
    return sanitizeHtml(out);
  }

  function htmlToMarkdown(html){
    const tmp = document.createElement('div');
    tmp.innerHTML = sanitizeHtml(html);

    const mdFromNode = (node) => {
      if (!node) return '';
      if (node.nodeType === 3) return node.nodeValue || '';
      if (node.nodeType !== 1) return '';

      const tag = node.tagName;

      if (tag === 'BR') return '\n';
      if (tag === 'P'){
        const inner = Array.from(node.childNodes).map(mdFromNode).join('');
        return inner.replace(/\n+$/,'') + '\n';
      }
      if (tag === 'STRONG' || tag === 'B'){
        const inner = Array.from(node.childNodes).map(mdFromNode).join('');
        return inner ? `**${inner}**` : '';
      }
      if (tag === 'U'){
        const inner = Array.from(node.childNodes).map(mdFromNode).join('');
        return inner ? `__${inner}__` : '';
      }
      if (tag === 'A'){
        const href = String(node.getAttribute('href') || '').trim();
        const txt = Array.from(node.childNodes).map(mdFromNode).join('') || href;
        if (!href) return txt;
        return `[${txt}](${href})`;
      }
      if (tag === 'UL'){
        const items = Array.from(node.querySelectorAll(':scope > li'))
          .map(li => `- ${Array.from(li.childNodes).map(mdFromNode).join('').trim()}`)
          .join('\n');
        return items + '\n';
      }
      if (tag === 'OL'){
        const lis = Array.from(node.querySelectorAll(':scope > li'));
        const items = lis.map((li,i)=> `${i+1}. ${Array.from(li.childNodes).map(mdFromNode).join('').trim()}`).join('\n');
        return items + '\n';
      }
      if (tag === 'LI'){
        return Array.from(node.childNodes).map(mdFromNode).join('');
      }

      // fallback: inline
      return Array.from(node.childNodes).map(mdFromNode).join('');
    };

    const parts = Array.from(tmp.childNodes).map(mdFromNode).join('');
    return parts
      .replace(/\n{3,}/g,'\n\n')
      .replace(/[ \t]+\n/g,'\n')
      .trim();
  }

  function ensureUi(){
    let root = document.getElementById('sheet-rte-popover');
    if (root) return root;

    root = document.createElement('div');
    root.id = 'sheet-rte-popover';
    root.className = 'rte-popover hidden';
    root.innerHTML = `
      <div class="rte-popover__backdrop" data-rte-close></div>
      <div class="rte-popover__panel" role="dialog" aria-modal="true">
        <div class="rte-popover__head">
          <div class="rte-popover__title">Редактор текста</div>
          <button class="rte-popover__x" type="button" data-rte-close>×</button>
        </div>
        <div class="rte-popover__body">
          <div class="rte" data-rte-box>
            <div class="rte-toolbar">
              <button class="rte-btn" type="button" data-rte-cmd="bold"><b>B</b></button>
              <button class="rte-btn" type="button" data-rte-cmd="underline"><u>U</u></button>
              <button class="rte-btn" type="button" data-rte-cmd="insertUnorderedList">• список</button>
              <button class="rte-btn" type="button" data-rte-cmd="insertOrderedList">1. список</button>
              <button class="rte-btn" type="button" data-rte-link>Ссылка</button>
              <button class="rte-btn" type="button" data-rte-unlink>Убрать ссылку</button>

              <select class="rte-select" data-rte-font title="Размер текста">
                <option value="14">14px</option>
                <option value="15" selected>15px</option>
                <option value="16">16px</option>
                <option value="18">18px</option>
              </select>
              <select class="rte-select" data-rte-line title="Высота строки">
                <option value="1.2">1.2</option>
                <option value="1.35" selected>1.35</option>
                <option value="1.5">1.5</option>
                <option value="1.65">1.65</option>
              </select>
            </div>
            <div class="rte-editor" contenteditable="true" data-rte-editor data-placeholder="Пиши здесь… (двойной клик по полю открывает этот редактор)"></div>
          </div>
          <div class="rte-popover__hint">
            Подсказка: <b>Ctrl+E</b> или <b>двойной клик</b> по полю — открыть редактор. При вставке текста ссылки сохраняются/распознаются.
          </div>
        </div>
        <div class="rte-popover__foot">
          <button class="rte-popover__btn" type="button" data-rte-cancel>Отмена</button>
          <button class="rte-popover__btn primary" type="button" data-rte-save>Сохранить</button>
        </div>
      </div>
    `;

    document.body.appendChild(root);
    return root;
  }

  let activeTextarea = null;
  let lastFocusEl = null;

  function openFor(textarea){
    if (!textarea) return;
    activeTextarea = textarea;
    lastFocusEl = textarea;

    const pop = ensureUi();
    pop.classList.remove('hidden');

    const editor = pop.querySelector('[data-rte-editor]');
    const fontSel = pop.querySelector('[data-rte-font]');
    const lineSel = pop.querySelector('[data-rte-line]');

    // build html from textarea value
    const md = String(textarea.value || '');
    editor.innerHTML = markdownToHtml(md);

    // apply current size
    const applyTypo = () => {
      const fs = Number(fontSel?.value || 15);
      const lh = Number(lineSel?.value || 1.35);
      editor.style.fontSize = `${fs}px`;
      editor.style.lineHeight = String(lh);
    };
    applyTypo();

    fontSel?.addEventListener('change', applyTypo, { once: true });
    lineSel?.addEventListener('change', applyTypo, { once: true });

    // focus
    setTimeout(() => {
      try{ editor.focus(); }catch{}
    }, 0);
  }

  function closePopover(){
    const pop = document.getElementById('sheet-rte-popover');
    if (pop) pop.classList.add('hidden');
    activeTextarea = null;
    try{ lastFocusEl?.focus?.(); }catch{}
  }

  function saveToTextarea(){
    const pop = document.getElementById('sheet-rte-popover');
    if (!pop || !activeTextarea) return;

    const editor = pop.querySelector('[data-rte-editor]');
    const md = htmlToMarkdown(editor?.innerHTML || '');

    activeTextarea.value = md;

    // notify bindings
    try{
      activeTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      activeTextarea.dispatchEvent(new Event('change', { bubbles: true }));
    }catch{}

    closePopover();
  }

  function init(){
    const pop = ensureUi();

    // close / cancel
    pop.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest('[data-rte-close]')) return closePopover();
      if (t.closest('[data-rte-cancel]')) return closePopover();
      if (t.closest('[data-rte-save]')) return saveToTextarea();

      const cmdBtn = t.closest('[data-rte-cmd]');
      if (cmdBtn){
        const cmd = String(cmdBtn.getAttribute('data-rte-cmd')||'');
        try{
          document.execCommand(cmd, false, null);
        }catch{}
        return;
      }

      if (t.closest('[data-rte-link]')){
        const url = prompt('Ссылка (URL):', 'https://');
        if (!url) return;
        try{ document.execCommand('createLink', false, String(url).trim()); }catch{}
        // ensure target blank
        try{
          const sel = window.getSelection();
          const a = sel && sel.anchorNode ? (sel.anchorNode.parentElement?.closest('a') || null) : null;
          if (a){
            a.setAttribute('target','_blank');
            a.setAttribute('rel','noopener noreferrer');
          }
        }catch{}
        return;
      }

      if (t.closest('[data-rte-unlink]')){
        try{ document.execCommand('unlink', false, null); }catch{}
        return;
      }
    });

    // paste handling for links
    const editor = pop.querySelector('[data-rte-editor]');
    editor.addEventListener('paste', (e) => {
      try{
        const cd = e.clipboardData;
        if (!cd) return;
        const html = cd.getData('text/html');
        const text = cd.getData('text/plain');

        if (html && /<a\b/i.test(html)){
          e.preventDefault();
          const safe = sanitizeHtml(html);
          document.execCommand('insertHTML', false, safe);
          return;
        }
        if (text){
          e.preventDefault();
          const ins = linkifyPlainText(text);
          document.execCommand('insertHTML', false, ins);
          return;
        }
      } catch {}
    });

    // keyboard: Esc closes, Ctrl+Enter saves
    document.addEventListener('keydown', (e) => {
      const popEl = document.getElementById('sheet-rte-popover');
      const open = popEl && !popEl.classList.contains('hidden');
      if (!open) return;

      if (e.key === 'Escape'){
        e.preventDefault();
        closePopover();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter'){
        e.preventDefault();
        saveToTextarea();
      }
    });

    // trigger: dblclick / Ctrl+E
    document.addEventListener('dblclick', (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const ta = t.closest(`textarea[${RTE_FLAG}="1"]`);
      if (!ta) return;
      openFor(ta);
    });

    document.addEventListener('keydown', (e) => {
      if (!((e.ctrlKey || e.metaKey) && (e.key === 'e' || e.key === 'E'))) return;
      const a = document.activeElement;
      if (a && a instanceof HTMLTextAreaElement && a.getAttribute(RTE_FLAG) === '1'){
        e.preventDefault();
        openFor(a);
      }
    });

    // mark fields for convenience: if a textarea is in sheet modal and looks like description, auto-flag
    document.addEventListener('focusin', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLTextAreaElement)) return;
      const inSheet = !!t.closest('#sheet-modal');
      if (!inSheet) return;
      // auto-set flag for any textarea inside sheet modal
      if (!t.getAttribute(RTE_FLAG)) t.setAttribute(RTE_FLAG, '1');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.SheetRichTextPopup = { openFor };
})();
