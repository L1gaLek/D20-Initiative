(function initTokenIsoMini() {
  function normalizeTokenMode(rawMode) {
    const mode = String(rawMode || '').trim().toLowerCase();
    if (!mode) return 'portrait';
    if (mode === 'full' || mode === 'crop') return 'portrait';
    if (mode === 'color' || mode === 'portrait' || mode === 'iso-mini') return mode;
    return 'portrait';
  }

  function getTokenState(player) {
    const sheet = player?.sheet?.parsed || null;
    const token = sheet?.appearance?.token || player?.appearance?.token || player?.token || null;
    return { sheet, token };
  }

  function getIsoMiniImageUrl(player) {
    const { sheet, token } = getTokenState(player);
    const isoMiniUrl = String(token?.isoMiniUrl || '').trim();
    if (isoMiniUrl) return isoMiniUrl;
    const baseUrl = String(sheet?.appearance?.baseUrl || player?.appearance?.baseUrl || player?.baseUrl || '').trim();
    return baseUrl || '';
  }

  function getEffectiveMode(player, explicitMode) {
    const mode = normalizeTokenMode(explicitMode);
    const boardMode = String(window.__boardViewMode || '').trim();
    if (boardMode === 'isometric') return 'iso-mini';
    return mode;
  }

  function ensureIsoMiniLayer(tokenEl) {
    if (!tokenEl) return null;
    let layer = tokenEl.querySelector('.token-iso-mini');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'token-iso-mini';
      layer.innerHTML = [
        '<div class="token-iso-mini__shadow"></div>',
        '<div class="token-iso-mini__base"></div>',
        '<div class="token-iso-mini__figure"></div>'
      ].join('');
      tokenEl.appendChild(layer);
    }
    return layer;
  }

  function clearIsoMiniLayer(tokenEl) {
    if (!tokenEl) return;
    tokenEl.classList.remove('token-mode-iso-mini');
    const layer = tokenEl.querySelector('.token-iso-mini');
    if (layer) layer.style.display = 'none';
  }

  function applyIsoMiniVisual(tokenEl, player) {
    if (!tokenEl || !player) return false;
    const layer = ensureIsoMiniLayer(tokenEl);
    if (!layer) return false;

    const figure = layer.querySelector('.token-iso-mini__figure');
    const base = layer.querySelector('.token-iso-mini__base');
    const shadow = layer.querySelector('.token-iso-mini__shadow');
    const color = String(player?.color || '#888');
    const src = getIsoMiniImageUrl(player);

    tokenEl.classList.add('token-mode-iso-mini');
    layer.style.display = '';
    tokenEl.style.backgroundImage = 'none';
    tokenEl.style.backgroundColor = 'transparent';

    if (base) base.style.background = color;
    if (shadow) shadow.style.background = 'rgba(0,0,0,0.42)';

    if (figure) {
      if (src) {
        figure.style.backgroundImage = `url("${src}")`;
        figure.style.backgroundSize = 'contain';
        figure.style.backgroundPosition = 'center bottom';
        figure.style.backgroundRepeat = 'no-repeat';
        figure.style.backgroundColor = 'transparent';
      } else {
        figure.style.backgroundImage = 'none';
        figure.style.background = `linear-gradient(180deg, ${color}, rgba(0,0,0,.22))`;
      }
    }
    return true;
  }

  function applyTokenVisualOverride(tokenEl, player, requestedMode) {
    const effectiveMode = getEffectiveMode(player, requestedMode);
    if (effectiveMode === 'iso-mini') {
      return applyIsoMiniVisual(tokenEl, player);
    }
    clearIsoMiniLayer(tokenEl);
    return false;
  }

  window.TokenIsoMini = {
    normalizeTokenMode,
    getEffectiveMode,
    applyTokenVisualOverride,
    getIsoMiniImageUrl
  };
})();

