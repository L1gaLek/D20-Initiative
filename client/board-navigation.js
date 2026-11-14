function getOffscreenTokenPointer(x, y, bounds) {
  const { left, top, right, bottom } = bounds;
  if (right <= left || bottom <= top) return null;
  if (x >= left && x <= right && y >= top && y <= bottom) return null;
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const dx = x - cx;
  const dy = y - cy;
  const t = Math.min(dx ? (right - left) / (2 * Math.abs(dx)) : Infinity,
    dy ? (bottom - top) / (2 * Math.abs(dy)) : Infinity);
  if (!Number.isFinite(t)) return null;
  return { x: cx + dx * t, y: cy + dy * t, angle: Math.atan2(dy, dx) * 180 / Math.PI + 90 };
}

(function () {
  const wrapper = document.getElementById('board-wrapper');
  if (!wrapper) return;
  let drag = null;
  let frame = 0;
  let previousTime = 0;
  let targetX = 0;
  let targetY = 0;
  function animatePan(time) {
    frame = 0;
    const dt = previousTime ? Math.min(50, time - previousTime) : 16;
    previousTime = time;
    const alpha = 1 - Math.exp(-dt / 45);
    targetX = Math.max(0, Math.min(wrapper.scrollWidth - wrapper.clientWidth, targetX));
    targetY = Math.max(0, Math.min(wrapper.scrollHeight - wrapper.clientHeight, targetY));
    const dx = targetX - wrapper.scrollLeft;
    const dy = targetY - wrapper.scrollTop;
    // Browsers round scroll offsets to pixels. Finish the last few pixels exactly
    // so interpolation cannot stall forever on a fractional increment.
    wrapper.scrollLeft += Math.abs(dx) <= 4 ? dx : dx * alpha;
    wrapper.scrollTop += Math.abs(dy) <= 4 ? dy : dy * alpha;
    schedulePointers();
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) frame = requestAnimationFrame(animatePan);
    else previousTime = 0;
  }
  // Capture middle-button gestures before tokens, walls, marks, or fog tools see them.
  wrapper.addEventListener('mousedown', event => {
    if (event.button !== 1 || event.ctrlKey || event.target.closest('input,textarea,select,button,[contenteditable="true"]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
    targetX = wrapper.scrollLeft;
    targetY = wrapper.scrollTop;
    drag = { x: event.clientX, y: event.clientY, scrollX: targetX, scrollY: targetY };
    wrapper.classList.add('board-view--panning');
  }, true);
  window.addEventListener('mousemove', event => {
    if (!drag) return;
    if (!(event.buttons & 4)) { endPan(); return; }
    targetX = Math.max(0, Math.min(wrapper.scrollWidth - wrapper.clientWidth, drag.scrollX + drag.x - event.clientX));
    targetY = Math.max(0, Math.min(wrapper.scrollHeight - wrapper.clientHeight, drag.scrollY + drag.y - event.clientY));
    if (!frame) frame = requestAnimationFrame(animatePan);
    event.preventDefault();
  }, true);
  function endPan() {
    drag = null;
    wrapper.classList.remove('board-view--panning');
  }
  window.addEventListener('mouseup', event => { if (event.button === 1) endPan(); });
  window.addEventListener('blur', endPan);
  wrapper.addEventListener('auxclick', event => { if (event.button === 1) event.preventDefault(); });
  window.addEventListener('board-view-mode-changed', endPan);

  const layer = document.createElement('div');
  layer.className = 'token-nav-layer';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);
  const indicators = new Map();
  let pointerFrame = 0;
  function schedulePointers() {
    if (pointerFrame) return;
    pointerFrame = requestAnimationFrame(() => { pointerFrame = 0; updatePointers(); });
  }
  function updatePointers() {
    const rect = wrapper.getBoundingClientRect();
    const bounds = { left: Math.max(0, rect.left) + 22, top: Math.max(0, rect.top) + 22,
      right: Math.min(window.innerWidth, rect.left + wrapper.clientWidth) - 22,
      bottom: Math.min(window.innerHeight, rect.top + wrapper.clientHeight) - 22 };
    const used = new Set();
    const positions = [];
    const sheetOpen = document.getElementById('sheet-modal')?.classList.contains('hidden') === false;
    const visible = !sheetOpen && wrapper.clientWidth > 0 && wrapper.clientHeight > 0 && rect.width > 0;
    for (const player of (visible && typeof players !== 'undefined' ? players : [])) {
      const ownBase = !!player.isBase && String(player.ownerId) === String(myId);
      const ally = !player.isEnemy && (player.isAlly || (player.isBase && String(player.ownerRole) !== 'GM'));
      if (!ownBase && !ally) continue;
      if (player.x == null || player.y == null) continue;
      const token = playerElements.get(player.id);
      if (!token || token.style.display === 'none' || token.style.visibility === 'hidden' || token.dataset.fogGhost === '1') continue;
      if (window.FogWar?.isEnabled?.() && !window.FogWar.canInteractWithToken(player)) continue;
      const tokenRect = token.getBoundingClientRect();
      if (!tokenRect.width || !tokenRect.height) continue;
      const tokenX = tokenRect.left + tokenRect.width / 2;
      const tokenY = tokenRect.top + tokenRect.height / 2;
      const point = getOffscreenTokenPointer(tokenX, tokenY, bounds);
      if (!point) continue;
      let el = indicators.get(String(player.id));
      if (!el) {
        el = document.createElement('div');
        el.className = 'token-nav-pointer';
        const arrow = document.createElement('i');
        const label = document.createElement('span');
        el.append(arrow, label);
        layer.appendChild(el);
        indicators.set(String(player.id), el);
      }
      used.add(String(player.id));
      el.dataset.tokenId = String(player.id);
      el.classList.toggle('token-nav-pointer--base', ownBase);
      el.lastChild.textContent = ownBase ? '' : String(player.name || 'Союзник');
      // Keep neighboring names legible when several allies lie in the same direction.
      const vertical = Math.abs(point.x - bounds.left) < 1 || Math.abs(point.x - bounds.right) < 1;
      for (let tries = 0; tries < 12 && positions.some(p => Math.abs(p.x - point.x) < 30 && Math.abs(p.y - point.y) < 28); tries++) {
        if (vertical) point.y = Math.min(bounds.bottom, Math.max(bounds.top, point.y + (tries % 2 ? -1 : 1) * (tries + 1) * 30));
        else point.x = Math.min(bounds.right, Math.max(bounds.left, point.x + (tries % 2 ? -1 : 1) * (tries + 1) * 95));
      }
      positions.push(point);
      el.style.left = `${point.x}px`;
      el.style.top = `${point.y}px`;
      el.firstChild.style.transform = `rotate(${Math.atan2(tokenY - point.y, tokenX - point.x) * 180 / Math.PI + 90}deg)`;
      el.classList.toggle('token-nav-pointer--right', point.x > (bounds.left + bounds.right) / 2);
      el.classList.toggle('token-nav-pointer--bottom', point.y > bounds.bottom - 35);
    }
    for (const [id, el] of indicators) if (!used.has(id)) { el.remove(); indicators.delete(id); }
  }
  wrapper.addEventListener('scroll', schedulePointers, { passive: true });
  window.addEventListener('resize', schedulePointers);
  window.addEventListener('board-view-mode-changed', schedulePointers);
  window.__updateBaseNavArrow = schedulePointers;
  setInterval(schedulePointers, 250);
  schedulePointers();
})();
