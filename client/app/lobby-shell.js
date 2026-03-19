// Lobby / tavern shell helpers extracted from client/dom-and-setup.js.

function updateLobbyModeClass() {
  try {
    const loginVisible = !!(loginDiv && loginDiv.style.display !== 'none');
    const roomsVisible = !!(roomsDiv && roomsDiv.style.display !== 'none');
    const tavernVisible = !!(tavernDiv && !tavernDiv.classList.contains('hidden') && tavernDiv.style.display !== 'none');
    const inLobby = loginVisible || roomsVisible || tavernVisible;
    document.body.classList.toggle('lobby-active', inLobby);
    try { lobbyAmbientAudio.sync(); } catch {}
  } catch {}
}

function watchLobbyVisibility() {
  try {
    const sync = () => updateLobbyModeClass();
    const observer = new MutationObserver(sync);
    [loginDiv, roomsDiv, tavernDiv, gameUI].forEach((el) => {
      if (!el) return;
      observer.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
    });
    sync();
  } catch {
    updateLobbyModeClass();
  }
}

function getProjectAssetBasePath() {
  try {
    const script = Array.from(document.scripts || []).find((node) => {
      const src = String(node?.getAttribute?.('src') || node?.src || '');
      return /(?:^|\/)dom-and-setup\.js(?:[?#].*)?$/.test(src);
    });
    const src = String(script?.src || script?.getAttribute?.('src') || '');
    if (src) {
      const url = new URL(src, window.location.href);
      const match = url.pathname.match(/^(.*)\/client\/dom-and-setup\.js(?:$|[?#])/);
      if (match) return String(match[1] || '');
      return url.pathname.replace(/\/client\/[^/]+$/, '');
    }
  } catch {}

  try {
    const path = String(window.location.pathname || '/');
    const clean = path.replace(/[?#].*$/, '');
    if (/\.(html?)$/i.test(clean)) return clean.replace(/\/[^/]*$/, '');
    return clean.endsWith('/') ? clean.replace(/\/$/, '') : clean;
  } catch {}

  return '';
}

function buildLobbyVideoCandidates(fileName) {
  const name = String(fileName || '').trim();
  if (!name) return [];
  const basePath = String(getProjectAssetBasePath() || '');
  return [((basePath || '') + '/lobby/' + name).replace(/\/+/g, '/')];
}

function applyVideoSourceWithFallback(video, sources) {
  if (!video) return;
  const list = Array.isArray(sources) ? sources.filter(Boolean) : [];
  if (!list.length) return;
  let sourceIndex = 0;

  const applySource = (src) => {
    if (!src) return;
    if (video.getAttribute('src') === src) return;
    video.setAttribute('src', src);
    try { video.load(); } catch {}
    const playPromise = video.play?.();
    if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(() => {});
  };

  video.addEventListener('error', () => {
    sourceIndex += 1;
    const fallback = list[sourceIndex] || '';
    if (fallback) applySource(fallback);
  });

  applySource(list[sourceIndex] || '');
}

function initLobbyVideoBackground() {
  const video = document.getElementById('lobby-bg-video');
  if (!video) return;

  const files = [
    'lobby-d1.mp4',
    'lobby-n1.mp4',
    'lobby-n2.mp4'
  ];

  let pickedFile = files[0];
  try {
    const last = String(getAppStorageItem('int_lobby_last_video_file') || '');
    const pool = files.filter(file => file !== last);
    const list = pool.length ? pool : files;
    pickedFile = list[Math.floor(Math.random() * list.length)] || files[0];
    setAppStorageItem('int_lobby_last_video_file', pickedFile);
  } catch {}

  applyVideoSourceWithFallback(video, buildLobbyVideoCandidates(pickedFile));
}

function initTavernVideoBackground() {
  if (!tavernBgVideo) return;
  applyVideoSourceWithFallback(tavernBgVideo, buildLobbyVideoCandidates('taverna.mp4'));
}

function buildLobbyAmbientCandidates(fileName) {
  const normalizedFile = String(fileName || '').trim();
  if (!normalizedFile) return [];
  const basePath = String(getProjectAssetBasePath() || '');
  return [((basePath || '') + '/lobby/ambient/' + normalizedFile).replace(/\/+/g, '/')];
}


const lobbyAmbientAudio = (() => {
  const audio = document.createElement('audio');
  audio.id = 'lobby-ambient-audio';
  audio.preload = 'auto';
  audio.loop = false;
  audio.autoplay = false;
  audio.hidden = true;
  try { audio.crossOrigin = 'anonymous'; } catch {}
  try { audio.playsInline = true; } catch {}
  try { audio.setAttribute('playsinline', ''); } catch {}
  try { audio.setAttribute('webkit-playsinline', ''); } catch {}
  try { document.body.appendChild(audio); } catch {}

  const LS_VOL = 'int_lobby_ambient_volume';
  const LS_VOL_LEGACY = 'dnd_bg_music_volume';
  const LS_LAST_TAVERN = 'int_last_tavern_ambient_file';
  const lobbyTrack = 'lobby.mp3';
  const tavernTracks = ['taverna.mp3', 'taverna1.mp3', 'taverna2.mp3'];
  const failedTavernTracks = new Set();

  let activeMode = '';
  let activeFile = '';
  let unlocked = false;
  let hadUserGesture = false;
  let globalBound = false;
  let sourceCandidates = [];
  let sourceIndex = 0;
  let pendingGestureStart = false;

  function clamp01(v, fallback = 0.4) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(1, n));
  }

  function loadVolume() {
    try {
      const own = (typeof getAppStorageItem === 'function' ? getAppStorageItem(LS_VOL) : localStorage.getItem(LS_VOL));
      if (own !== null && own !== '') return clamp01(own);
    } catch {}
    try {
      const legacy = (typeof getAppStorageItem === 'function' ? getAppStorageItem(LS_VOL_LEGACY) : localStorage.getItem(LS_VOL_LEGACY));
      if (legacy !== null && legacy !== '') {
        const v = clamp01(legacy);
        try { (typeof setAppStorageItem === 'function' ? setAppStorageItem(LS_VOL, String(v > 0 ? v : 0.4)) : localStorage.setItem(LS_VOL, String(v > 0 ? v : 0.4))); } catch {}
        return v > 0 ? v : 0.4;
      }
    } catch {}
    return 0.4;
  }

  function applyVolume() {
    const vol = loadVolume();
    try { audio.muted = false; } catch {}
    try { audio.defaultMuted = false; } catch {}
    try { audio.volume = vol; } catch {}
    return vol;
  }

  function chooseTavernTrack() {
    const availableTracks = tavernTracks.filter((file) => !failedTavernTracks.has(file));
    const sourceTracks = availableTracks.length ? availableTracks : tavernTracks;

    try {
      const last = String(localStorage.getItem(LS_LAST_TAVERN) || '');
      const pool = sourceTracks.filter((file) => file !== last);
      const list = pool.length ? pool : sourceTracks;
      const picked = list[Math.floor(Math.random() * list.length)] || sourceTracks[0] || tavernTracks[0];
      localStorage.setItem(LS_LAST_TAVERN, picked);
      return picked;
    } catch {
      return sourceTracks[Math.floor(Math.random() * sourceTracks.length)] || tavernTracks[0];
    }
  }

  function getAudioSrc() {
    return String(audio.currentSrc || audio.src || audio.getAttribute?.('src') || '');
  }

  function setAudioSourceCandidates(sources, preferredSrc = '') {
    sourceCandidates = Array.isArray(sources) ? sources.filter(Boolean) : [];
    const preferred = String(preferredSrc || '');
    const foundIndex = preferred ? sourceCandidates.indexOf(preferred) : -1;
    sourceIndex = foundIndex >= 0 ? foundIndex : 0;
  }

  function getCurrentCandidate() {
    return String(sourceCandidates[sourceIndex] || '');
  }

  function applyCurrentSource() {
    const nextSrc = String(sourceCandidates[sourceIndex] || '');
    if (!nextSrc) return false;
    if (getAudioSrc() === nextSrc) return true;
    try { audio.pause(); } catch {}
    try { audio.src = nextSrc; } catch {}
    try { audio.load(); } catch {}
    return true;
  }

  function advanceSource() {
    if (!Array.isArray(sourceCandidates) || !sourceCandidates.length) return false;
    sourceIndex += 1;
    if (sourceIndex >= sourceCandidates.length) return false;
    return applyCurrentSource();
  }

  async function playPromiseSafe() {
    try {
      applyVolume();
      const p = audio.play?.();
      if (p && typeof p.catch === 'function') {
        return p.catch(() => false);
      }
      return Promise.resolve(true);
    } catch {
      return Promise.resolve(false);
    }
  }

  async function tryUnlock({ pauseAfter = false } = {}) {
    applyVolume();
    const ok = await playPromiseSafe();
    if (!ok) {
      unlocked = false;
      return false;
    }
    unlocked = true;
    if (pauseAfter) {
      try { audio.pause(); } catch {}
    }
    return true;
  }

  async function ensurePlaybackAfterGesture() {
    pendingGestureStart = false;
    hadUserGesture = true;
    if (!activeMode) return false;
    if (!getAudioSrc() && !applyCurrentSource()) return false;
    return await tryUnlock({ pauseAfter: false });
  }

  async function start(mode, options = {}) {
    const nextMode = String(mode || '');
    const fromGesture = !!options.fromGesture;
    if (nextMode !== 'lobby' && nextMode !== 'tavern') {
      stop();
      return;
    }

    applyVolume();
    const fileName = nextMode === 'lobby'
      ? lobbyTrack
      : (activeMode === 'tavern' && activeFile && !failedTavernTracks.has(activeFile) ? activeFile : chooseTavernTrack());
    const sources = buildLobbyAmbientCandidates(fileName);
    const preferredSrc = getAudioSrc() || getCurrentCandidate() || sources[0] || '';

    if (!sources.length) {
      stop();
      return;
    }

    if (activeMode !== nextMode || activeFile !== fileName || !sources.includes(preferredSrc)) {
      activeMode = nextMode;
      activeFile = fileName;
      setAudioSourceCandidates(sources, preferredSrc);
      if (!applyCurrentSource()) {
        stop();
        return;
      }
    }

    if (fromGesture) {
      await ensurePlaybackAfterGesture();
      return;
    }

    if (!unlocked) {
      if (hadUserGesture) {
        await ensurePlaybackAfterGesture();
        return;
      }
      pendingGestureStart = true;
      return;
    }

    await playPromiseSafe();
  }

  function stop() {
    activeMode = '';
    activeFile = '';
    sourceCandidates = [];
    sourceIndex = 0;
    pendingGestureStart = false;
    try { audio.pause(); } catch {}
    try {
      audio.removeAttribute('src');
      audio.src = '';
      audio.load();
    } catch {}
  }

  function sync(options = {}) {
    const startOpts = options && typeof options === 'object' ? options : {};
    const loginVisible = !!(loginDiv && loginDiv.style.display !== 'none');
    const tavernVisible = !!(tavernDiv && !tavernDiv.classList.contains('hidden') && tavernDiv.style.display !== 'none');
    const gameVisible = !!(gameUI && gameUI.style.display !== 'none');

    if (gameVisible) {
      stop();
      return;
    }
    if (tavernVisible) {
      if (activeMode !== 'tavern' && failedTavernTracks.size >= tavernTracks.length) {
        failedTavernTracks.clear();
      }
      start('tavern', startOpts);
      return;
    }
    if (loginVisible) {
      start('lobby', startOpts);
      return;
    }
    stop();
  }

  async function nudgeFromGesture() {
    hadUserGesture = true;
    applyVolume();
    if (!activeMode) {
      sync({ fromGesture: true });
      return;
    }
    await ensurePlaybackAfterGesture();
    if (pendingGestureStart) {
      sync({ fromGesture: true });
    }
  }

  function bindGlobalUnlock() {
    if (globalBound) return;
    globalBound = true;

    const onGesture = async () => {
      hadUserGesture = true;
      await nudgeFromGesture();
    };

    const opts = { capture: true, passive: true };
    window.addEventListener('pointerdown', onGesture, opts);
    window.addEventListener('click', onGesture, opts);
    window.addEventListener('touchstart', onGesture, opts);
    window.addEventListener('keydown', onGesture, { capture: true });
    window.addEventListener('storage', (e) => {
      if (e?.key === LS_VOL || e?.key === LS_VOL_LEGACY) {
        applyVolume();
        sync();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') sync();
      else {
        try { audio.pause(); } catch {}
      }
    });
  }

  audio.addEventListener('loadeddata', async () => {
    applyVolume();
    if (!activeMode) return;
    if (unlocked) {
      await playPromiseSafe();
      return;
    }
    if (hadUserGesture) {
      await ensurePlaybackAfterGesture();
    }
  });

  audio.addEventListener('canplay', async () => {
    applyVolume();
    if (!activeMode) return;
    if (unlocked) {
      await playPromiseSafe();
      return;
    }
    if (hadUserGesture) {
      await ensurePlaybackAfterGesture();
    }
  });

  audio.addEventListener('ended', () => {
    if (activeMode !== 'tavern') return;
    activeFile = chooseTavernTrack();
    start('tavern', { fromGesture: unlocked });
  });

  audio.addEventListener('error', () => {
    if (advanceSource()) {
      if (activeMode) start(activeMode, { fromGesture: unlocked });
      return;
    }
    if (activeMode === 'tavern') {
      if (activeFile) failedTavernTracks.add(activeFile);
      const nextTrack = chooseTavernTrack();
      if (nextTrack && (!activeFile || nextTrack !== activeFile || failedTavernTracks.size < tavernTracks.length)) {
        activeFile = nextTrack;
        start('tavern', { fromGesture: unlocked });
        return;
      }
      activeFile = lobbyTrack;
      const lobbySources = buildLobbyAmbientCandidates(lobbyTrack);
      setAudioSourceCandidates(lobbySources, lobbySources[0] || '');
      if (applyCurrentSource()) {
        playPromiseSafe();
        return;
      }
      stop();
      return;
    }
    if (activeMode === 'lobby') {
      stop();
    }
  });

  bindGlobalUnlock();
  applyVolume();

  return { sync, start, stop, nudgeFromGesture, audio };
})();

