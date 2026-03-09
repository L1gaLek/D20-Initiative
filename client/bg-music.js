// client/bg-music.js
// Фоновая музыка (Supabase Storage + синхронизация состояния комнаты)
// - 1 трек одновременно
// - список/описания треков хранится в room_state.bgMusic
// - загрузка в Supabase Storage bucket: "room-audio"
// - максимум 10 треков; размер файла <= 50MB
// - фильтра расширений НЕТ (можно любые), но проигрывание зависит от браузера.
//
// Supabase client в проекте: sbClient, доступ через window.getSbClient() (см. dom-and-setup.js)

(function () {
  const MAX_TRACKS = 10;
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
  const BUCKET = "room-audio";
  const STORAGE_PREFIX = "music"; // path: music/<roomId>/<trackId>_<name>
  const SIGNED_URL_TTL_SEC = 60 * 60 * 6; // 6h

  // ---------- Helpers ----------
  function getSb() {
    try {
      if (typeof window.getSbClient === "function") return window.getSbClient();
    } catch {}
    return window.sbClient || window.supabase || null;
  }

  function getRoomId() {
    try { if (typeof currentRoomId !== "undefined" && currentRoomId) return String(currentRoomId); } catch {}
    try { if (window.currentRoomId) return String(window.currentRoomId); } catch {}
    return "room";
  }

  function isGM() {
    try { if (typeof myRole !== "undefined") return String(myRole) === "GM"; } catch {}
    try { return String(window.myRole || "") === "GM"; } catch {}
    return false;
  }

  function clamp01(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }

  function safeArr(x) { return Array.isArray(x) ? x : []; }
  function safeNum(x, fb = 0) {
    const n = Number(x);
    return Number.isFinite(n) ? n : fb;
  }

  function ensureBgMusic(state) {
    if (!state || typeof state !== "object") return null;
    if (!state.bgMusic || typeof state.bgMusic !== "object") {
      state.bgMusic = {
        tracks: [],
        currentTrackId: null,
        isPlaying: false,
        startedAt: 0,
        pausedAt: 0,
        volume: 40
      };
    }
    if (!Array.isArray(state.bgMusic.tracks)) state.bgMusic.tracks = [];

    try {
      (state.bgMusic.tracks || []).forEach((t) => {
        if (!t || typeof t !== 'object') return;
        if (typeof t.desc === 'undefined' && typeof t.description !== 'undefined') t.desc = t.description;
        if (typeof t.description === 'undefined' && typeof t.desc !== 'undefined') t.description = t.desc;
      });
    } catch {}

    if (typeof state.bgMusic.isPlaying !== "boolean") state.bgMusic.isPlaying = false;
    if (!Number.isFinite(Number(state.bgMusic.startedAt))) state.bgMusic.startedAt = 0;
    if (!Number.isFinite(Number(state.bgMusic.pausedAt))) state.bgMusic.pausedAt = 0;
    const v = Number(state.bgMusic.volume);
    state.bgMusic.volume = Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 40;
    return state.bgMusic;
  }

  function uuid() {
    try { return crypto.randomUUID(); } catch {}
    return "t_" + Math.random().toString(16).slice(2) + "_" + Date.now();
  }

  // ---------- Audio ----------
  const audio = new Audio();
  audio.loop = true;
  audio.preload = 'auto';
  try { audio.crossOrigin = 'anonymous'; } catch {}

  // local volume (per user)
  const LS_VOL = "dnd_bg_music_volume";
  function loadLocalVol() {
    const raw = localStorage.getItem(LS_VOL);
    const n = Number(raw);
    return Number.isFinite(n) ? clamp01(n) : 0.4;
  }
  function saveLocalVol(v) {
    try { localStorage.setItem(LS_VOL, String(clamp01(v))); } catch {}
  }
  audio.volume = loadLocalVol();

  let unlocked = false;
  let modal = null;
  let currentState = null;
  let _isSeeking = false;
  let _lastSeekSyncAt = 0;
  let _applyToken = 0;
  let _globalUnlockBound = false;
  const resolvedUrlCache = new Map(); // key -> { url, expiresAt }

  function normalizeAudioOutput() {
    try { audio.muted = false; } catch {}
    try { audio.defaultMuted = false; } catch {}
    try { audio.volume = clamp01(loadLocalVol()); } catch {}
    try {
      const ap = Number(audio.playbackRate);
      if (!Number.isFinite(ap) || ap <= 0) audio.playbackRate = 1;
    } catch {}
  }

  function bindGlobalUnlockHandlers() {
    if (_globalUnlockBound) return;
    _globalUnlockBound = true;

    const onGesture = async () => {
      normalizeAudioOutput();
      const bg = ensureBgMusic(currentState || {});
      const cur = getCurTrackFromState(currentState || {});
      if (!bg?.isPlaying || !cur) return;
      await tryUnlock({ resumeAfter: true });
    };

    const opts = { capture: true, passive: true };
    window.addEventListener('pointerdown', onGesture, opts);
    window.addEventListener('click', onGesture, opts);
    window.addEventListener('touchstart', onGesture, opts);
    window.addEventListener('keydown', onGesture, { capture: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        normalizeAudioOutput();
        const bg = ensureBgMusic(currentState || {});
        if (bg?.isPlaying) {
          Promise.resolve(applyState(currentState || {})).catch(() => {});
        }
      }
    });
  }

  function fmtTime(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  function getCurTrackFromState(state) {
    const bg = ensureBgMusic(state || {});
    const tracks = safeArr(bg?.tracks);
    return tracks.find(t => String(t?.id || "") === String(bg?.currentTrackId || "")) || null;
  }

  async function tryUnlock({ resumeAfter = false } = {}) {
    if (unlocked) {
      if (resumeAfter) applyState(currentState || {});
      return true;
    }
    try {
      await audio.play();
      audio.pause();
      unlocked = true;
      hideUnlockBtn();
      if (resumeAfter) applyState(currentState || {});
      return true;
    } catch {
      showUnlockBtn();
      return false;
    }
  }

  async function resolveTrackUrl(track) {
    const t = track || {};
    const directUrl = String(t.url || '').trim();
    const path = String(t.path || '').trim();
    const now = Date.now();
    const cacheKey = String(t.id || path || directUrl || '');
    const cached = cacheKey ? resolvedUrlCache.get(cacheKey) : null;
    if (cached && cached.url && cached.expiresAt > now + 5000) {
      return cached.url;
    }

    const sb = getSb();
    if (path && sb?.storage?.from) {
      try {
        const signed = await sb.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SEC);
        const signedUrl = String(signed?.data?.signedUrl || '').trim();
        if (signedUrl) {
          if (cacheKey) resolvedUrlCache.set(cacheKey, {
            url: signedUrl,
            expiresAt: now + (SIGNED_URL_TTL_SEC * 1000)
          });
          return signedUrl;
        }
      } catch {}

      try {
        const pub = sb.storage.from(BUCKET).getPublicUrl(path);
        const publicUrl = String(pub?.data?.publicUrl || '').trim();
        if (publicUrl) {
          if (cacheKey) resolvedUrlCache.set(cacheKey, {
            url: publicUrl,
            expiresAt: now + (12 * 60 * 60 * 1000)
          });
          return publicUrl;
        }
      } catch {}
    }

    if (directUrl) {
      if (cacheKey) resolvedUrlCache.set(cacheKey, {
        url: directUrl,
        expiresAt: now + (60 * 60 * 1000)
      });
      return directUrl;
    }

    return '';
  }

  // ---------- UI ----------
  const openBtn = document.getElementById("bg-music-open");
  const toggleBtn = document.getElementById("bg-music-toggle");
  const stopBtn = document.getElementById("bg-music-stop");
  const volumeSlider = document.getElementById("bg-music-volume");
  const nowLabel = document.getElementById("bg-music-now");
  const musicBox = document.getElementById("bg-music-box");

  let seekWrap = null;
  let seekSlider = null;
  let seekTime = null;

  function ensureMainUiLayout() {
    if (!musicBox) return;
    if (musicBox._bgmLayoutDone) return;
    musicBox._bgmLayoutDone = true;

    try {
      const h3 = musicBox.querySelector('h3');

      if (volumeSlider) volumeSlider.style.width = '150px';
      const volLabel = volumeSlider ? volumeSlider.closest('label') : null;

      const topRow = document.createElement('div');
      topRow.style.display = 'flex';
      topRow.style.alignItems = 'center';
      topRow.style.justifyContent = 'flex-start';
      topRow.style.gap = '10px';
      topRow.style.flexWrap = 'nowrap';
      topRow.style.marginTop = '6px';

      if (volLabel) {
        try {
          const span = volLabel.querySelector('span');
          if (span) {
            span.textContent = 'Громк.';
            span.style.minWidth = 'auto';
            span.style.fontSize = '12px';
          }
          volLabel.style.marginTop = '0';
          volLabel.style.gap = '6px';
        } catch {}
        topRow.appendChild(volLabel);
      }

      if (h3 && h3.parentNode) {
        if (h3.nextSibling) h3.parentNode.insertBefore(topRow, h3.nextSibling);
        else h3.parentNode.appendChild(topRow);
      } else {
        musicBox.insertBefore(topRow, musicBox.firstChild);
      }

      const controlsRow = toggleBtn ? toggleBtn.parentElement : null;
      if (controlsRow) {
        controlsRow.style.display = 'flex';
        controlsRow.style.gap = '8px';
        controlsRow.style.flexWrap = 'nowrap';
        controlsRow.style.alignItems = 'center';
        controlsRow.style.marginTop = '8px';

        if (openBtn) {
          try { openBtn.remove(); } catch {}
          controlsRow.insertBefore(openBtn, controlsRow.firstChild);
          openBtn.style.width = 'auto';
          openBtn.style.padding = '4px 10px';
          openBtn.style.lineHeight = '1.1';
        }

        const btns = controlsRow.querySelectorAll('button');
        btns.forEach(b => {
          try {
            b.style.padding = '4px 10px';
            b.style.lineHeight = '1';
            b.style.height = '28px';
            b.style.display = 'inline-flex';
            b.style.alignItems = 'center';
            b.style.justifyContent = 'center';
            b.style.margin = '0';
          } catch {}
        });

        if (stopBtn) {
          try {
            stopBtn.style.fontSize = '16px';
            stopBtn.style.transform = 'translateY(-2px)';
          } catch {}
        }
      }
    } catch {}

    try {
      if (!nowLabel) return;
      seekWrap = document.createElement('div');
      seekWrap.style.marginTop = '6px';
      seekWrap.style.display = 'flex';
      seekWrap.style.flexDirection = 'column';
      seekWrap.style.gap = '4px';

      const top = document.createElement('div');
      top.style.display = 'flex';
      top.style.alignItems = 'center';
      top.style.justifyContent = 'space-between';
      top.style.gap = '8px';

      seekTime = document.createElement('div');
      seekTime.style.fontSize = '12px';
      seekTime.style.opacity = '0.85';
      seekTime.textContent = '0:00 / 0:00';

      seekSlider = document.createElement('input');
      seekSlider.type = 'range';
      seekSlider.min = '0';
      seekSlider.max = '0';
      seekSlider.value = '0';
      seekSlider.step = '0.01';
      seekSlider.style.width = '100%';
      seekSlider.disabled = true;

      top.appendChild(seekTime);
      seekWrap.appendChild(top);
      seekWrap.appendChild(seekSlider);

      if (nowLabel.parentNode) {
        if (nowLabel.nextSibling) nowLabel.parentNode.insertBefore(seekWrap, nowLabel.nextSibling);
        else nowLabel.parentNode.appendChild(seekWrap);
      }

      seekSlider.addEventListener('input', () => {
        _isSeeking = true;
        const dur = Number(audio.duration) || 0;
        const cur = Number(seekSlider.value) || 0;
        if (seekTime) seekTime.textContent = `${fmtTime(cur)} / ${fmtTime(dur)}`;
      });

      seekSlider.addEventListener('change', () => {
        const dur = Number(audio.duration) || 0;
        const cur = Math.max(0, Math.min(dur || 0, Number(seekSlider.value) || 0));
        try { audio.currentTime = cur; } catch {}

        if (isGM()) {
          const now = Date.now();
          if (now - _lastSeekSyncAt > 250) {
            _lastSeekSyncAt = now;
            try {
              const bg = ensureBgMusic(currentState || {});
              bg.pausedAt = cur;
              if (bg.isPlaying) bg.startedAt = Date.now() - Math.round(cur * 1000);
              syncState();
            } catch {}
          }
        }
        _isSeeking = false;
      });
    } catch {}
  }

  let unlockBtn = null;
  function showUnlockBtn() {
    if (!musicBox) return;
    if (unlockBtn) return;
    unlockBtn = document.createElement("button");
    unlockBtn.type = "button";
    unlockBtn.textContent = "Включить звук";
    unlockBtn.style.marginTop = "8px";
    unlockBtn.addEventListener("click", async () => {
      await tryUnlock({ resumeAfter: true });
    });
    musicBox.appendChild(unlockBtn);
  }
  function hideUnlockBtn() {
    if (unlockBtn) {
      try { unlockBtn.remove(); } catch {}
      unlockBtn = null;
    }
  }

  function openModal() {
    if (!isGM()) return;
    if (modal) return;

    modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal" style="max-width:640px;">
        <div class="modal-header">
          <div>
            <div class="modal-title">Список музыки</div>
            <div class="modal-subtitle" style="opacity:.8; font-size:12px; margin-top:2px;">
              До ${MAX_TRACKS} треков, каждый до 50 МБ. Описание вводится вручную.
            </div>
          </div>
          <button class="modal-close" type="button">✕</button>
        </div>
        <div class="modal-body">
          <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
            <button id="bgm-upload-btn" type="button">Загрузить</button>
            <input id="bgm-file-input" type="file" multiple style="display:none;">
            <div style="font-size:12px; opacity:.8;">MP3/OGG почти всегда проигрываются. Другие форматы — зависит от браузера.</div>
          </div>
          <div id="bgm-list" style="margin-top:12px; display:flex; flex-direction:column; gap:10px;"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector(".modal-close")?.addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

    const uploadBtn = modal.querySelector("#bgm-upload-btn");
    const fileInput = modal.querySelector("#bgm-file-input");

    uploadBtn?.addEventListener("click", () => fileInput?.click());

    fileInput.addEventListener("change", async () => {
      const files = Array.from(fileInput.files || []);
      if (!files.length) return;

      const bg = ensureBgMusic(currentState || {});
      const existing = safeArr(bg?.tracks).length;

      if (existing >= MAX_TRACKS) {
        alert(`Достигнут лимит: ${MAX_TRACKS} треков.`);
        fileInput.value = "";
        return;
      }

      for (const f of files) {
        if ((ensureBgMusic(currentState).tracks || []).length >= MAX_TRACKS) break;
        if (f.size > MAX_FILE_SIZE) {
          alert(`Файл "${f.name}" больше 50 МБ и не будет загружен.`);
          continue;
        }
        await uploadTrack(f);
      }

      fileInput.value = "";
      renderList();
    });

    renderList();
  }

  function closeModal() {
    if (modal) {
      try { modal.remove(); } catch {}
      modal = null;
    }
  }

  function renderList() {
    if (!modal) return;

    try {
      const ae = document.activeElement;
      if (ae && modal.contains(ae) && ae.tagName === 'TEXTAREA') return;
    } catch {}

    const listEl = modal.querySelector("#bgm-list");
    if (!listEl) return;
    listEl.innerHTML = "";

    const bg = ensureBgMusic(currentState || {});
    const tracks = safeArr(bg.tracks);

    if (!tracks.length) {
      const empty = document.createElement("div");
      empty.style.opacity = "0.8";
      empty.textContent = "Треков пока нет. Нажмите «Загрузить» и добавьте музыку.";
      listEl.appendChild(empty);
      return;
    }

    tracks.forEach((t) => {
      const item = document.createElement("div");
      item.style.border = "1px solid #555";
      item.style.borderRadius = "10px";
      item.style.padding = "10px";
      item.style.background = "rgba(0,0,0,0.15)";

      const isCurrent = String(bg.currentTrackId || "") === String(t.id || "");
      item.innerHTML = `
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
          <div style="min-width:0;">
            <div style="font-weight:900; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(String(t.name || "Без названия"))}</div>
            <div style="font-size:12px; opacity:.8; margin-top:2px;">${isCurrent ? "Текущий трек" : ""}</div>
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button type="button" data-act="play">▶</button>
            <button type="button" data-act="set">Сделать текущим</button>
            <button type="button" data-act="del">Удалить</button>
          </div>
        </div>
        <div style="margin-top:8px;">
          <div style="font-size:12px; opacity:.85; margin-bottom:4px;">Описание (вручную):</div>
          <textarea data-act="desc" rows="3" style="width:100%; resize:vertical;">${escapeHtml(String((t.desc ?? t.description) || ""))}</textarea>
        </div>
      `;

      try {
        const ta = item.querySelector('textarea[data-act="desc"]');
        if (ta) {
          ta.style.background = '#222';
          ta.style.color = '#fff';
          ta.style.border = '1px solid rgba(255,255,255,0.18)';
          ta.style.borderRadius = '8px';
          ta.style.padding = '8px 10px';
        }
      } catch {}

      const desc = item.querySelector('textarea[data-act="desc"]');
      if (desc) {
        const handler = () => {
          t.desc = String(desc.value || '');
          t.description = t.desc;
          debounceSync();
        };
        desc.addEventListener("input", handler);
        desc.addEventListener("change", handler);
      }

      item.querySelector('[data-act="play"]')?.addEventListener("click", () => setCurrent(t.id, true));
      item.querySelector('[data-act="set"]')?.addEventListener("click", () => setCurrent(t.id, false));
      item.querySelector('[data-act="del"]')?.addEventListener("click", async () => {
        if (!confirm("Удалить трек?")) return;
        await deleteTrack(t);
        renderList();
      });

      listEl.appendChild(item);
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ---------- Storage ops ----------
  async function uploadTrack(file) {
    const sb = getSb();
    if (!sb || !sb.storage) {
      alert("Supabase client не инициализирован (sbClient отсутствует).");
      return;
    }

    const roomId = getRoomId();
    const bg = ensureBgMusic(currentState || {});
    if (safeArr(bg.tracks).length >= MAX_TRACKS) return;

    const id = uuid();
    const safeName = String(file.name || "track").replaceAll("/", "_").replaceAll("\\", "_");
    const path = `${STORAGE_PREFIX}/${roomId}/${id}_${safeName}`;

    const up = await sb.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false
    });

    if (up?.error) {
      alert("Ошибка загрузки: " + (up.error.message || up.error));
      return;
    }

    let bestUrl = '';
    try { bestUrl = await resolveTrackUrl({ id, path }); } catch {}

    bg.tracks.push({
      id,
      name: safeName,
      desc: "",
      description: "",
      url: bestUrl || '',
      path,
      createdAt: new Date().toISOString()
    });

    if (!bg.currentTrackId) bg.currentTrackId = id;
    syncState();
  }

  async function deleteTrack(track) {
    const sb = getSb();
    if (!sb || !sb.storage) {
      alert("Supabase client не инициализирован.");
      return;
    }

    const bg = ensureBgMusic(currentState || {});
    const id = String(track?.id || "");
    if (!id) return;

    const p = String(track?.path || "");
    if (p) {
      const rm = await sb.storage.from(BUCKET).remove([p]);
      if (rm?.error) console.warn("bg-music: remove failed", rm.error);
    }

    bg.tracks = safeArr(bg.tracks).filter(t => String(t?.id || "") !== id);
    try { resolvedUrlCache.delete(String(id)); } catch {}

    if (String(bg.currentTrackId || "") === id) {
      bg.currentTrackId = bg.tracks.length ? String(bg.tracks[0].id) : null;
      bg.isPlaying = false;
      bg.startedAt = 0;
      bg.pausedAt = 0;
    }

    syncState();
  }

  // ---------- Sync (room_state) ----------
  let debounceTimer = null;
  function debounceSync() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      syncState();
    }, 350);
  }

  function syncState() {
    if (!isGM()) return;
    const sm = (typeof sendMessage === "function") ? sendMessage : window.sendMessage;
    if (typeof sm !== "function") return;

    const bg = ensureBgMusic(currentState || {});
    sm({ type: "bgMusicSet", bgMusic: bg });
  }

  function setCurrent(trackId, play) {
    if (!isGM()) return;
    const bg = ensureBgMusic(currentState || {});
    const nextId = String(trackId || "");
    const changed = String(bg.currentTrackId || "") !== nextId;

    bg.currentTrackId = nextId;
    bg.isPlaying = !!play;

    if (bg.isPlaying) {
      if (changed) {
        bg.pausedAt = 0;
        bg.startedAt = Date.now();
        try { audio.currentTime = 0; } catch {}
      } else {
        const t = Number(audio.currentTime) || Number(bg.pausedAt) || 0;
        bg.pausedAt = t;
        bg.startedAt = Date.now() - Math.round(t * 1000);
      }
    } else {
      const t = changed ? 0 : (Number(audio.currentTime) || 0);
      bg.pausedAt = Math.max(0, t);
      if (changed) bg.startedAt = 0;
    }

    syncState();
  }

  function syncSeekUi() {
    if (!seekSlider || !seekTime) return;
    const dur = Number(audio.duration) || 0;
    const t = Number(audio.currentTime) || 0;
    seekSlider.max = String(dur > 0 ? dur : 0);
    if (!_isSeeking) seekSlider.value = String(t);
    seekTime.textContent = `${fmtTime(_isSeeking ? Number(seekSlider.value) || 0 : t)} / ${fmtTime(dur)}`;
  }

  if (!audio._bgmSeekBound) {
    audio._bgmSeekBound = true;
    audio.addEventListener('loadedmetadata', syncSeekUi);
    audio.addEventListener('timeupdate', syncSeekUi);
    audio.addEventListener('durationchange', syncSeekUi);
    audio.addEventListener('ended', syncSeekUi);
    audio.addEventListener('canplay', async () => {
      normalizeAudioOutput();
      const bg = ensureBgMusic(currentState || {});
      if (!bg?.isPlaying) return;
      if (!unlocked) return;
      try {
        normalizeAudioOutput();
        await audio.play();
        hideUnlockBtn();
      } catch {
        showUnlockBtn();
      }
    });
  }

  // ---------- Apply state (called from message-ui on each snapshot) ----------
  async function applyState(state) {
    currentState = state || currentState || {};
    const applyToken = ++_applyToken;

    try { ensureMainUiLayout(); } catch {}
    try { bindGlobalUnlockHandlers(); } catch {}
    normalizeAudioOutput();

    const bg = ensureBgMusic(currentState || {});
    const cur = getCurTrackFromState(currentState);

    if (nowLabel) nowLabel.textContent = "Трек: " + (cur ? String(cur.name || "—") : "—");

    try {
      if (seekSlider) {
        const has = !!cur;
        seekSlider.disabled = !has || !isGM();
      }
    } catch {}

    if (toggleBtn) toggleBtn.disabled = !isGM() || !cur;
    if (stopBtn) stopBtn.disabled = !isGM() || !cur;

    if (volumeSlider && !volumeSlider._bgmInited) {
      volumeSlider._bgmInited = true;
      const v = loadLocalVol();
      volumeSlider.value = String(Math.round(v * 100));
      volumeSlider.addEventListener("input", () => {
        const vv = clamp01(Number(volumeSlider.value) / 100);
        audio.volume = vv;
        saveLocalVol(vv);
      });
    }

    if (!cur) {
      try { audio.pause(); } catch {}
      try {
        audio.removeAttribute('src');
        audio.load();
      } catch {}
      try {
        if (seekSlider) {
          seekSlider.max = '0';
          seekSlider.value = '0';
          seekSlider.disabled = true;
        }
        if (seekTime) seekTime.textContent = '0:00 / 0:00';
      } catch {}
      return;
    }

    const resolvedUrl = await resolveTrackUrl(cur);
    if (applyToken !== _applyToken) return;

    if (!resolvedUrl) {
      try { audio.pause(); } catch {}
      showUnlockBtn();
      return;
    }

    if (audio.src !== resolvedUrl) {
      try {
        audio.pause();
      } catch {}
      audio.src = resolvedUrl;
      try { audio.load(); } catch {}
      unlocked = false;
    }

    syncSeekUi();

    if (bg.isPlaying) {
      const offset = Math.max(0, (Date.now() - safeNum(bg.startedAt, Date.now())) / 1000);
      try {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          audio.currentTime = (offset % audio.duration);
        } else {
          const handler = () => {
            audio.removeEventListener("loadedmetadata", handler);
            try {
              if (Number.isFinite(audio.duration) && audio.duration > 0) {
                audio.currentTime = (offset % audio.duration);
              }
            } catch {}
          };
          audio.addEventListener("loadedmetadata", handler);
        }
      } catch {}

      const ok = await tryUnlock();
      normalizeAudioOutput();
      if (!ok || applyToken !== _applyToken) return;
      try {
        await audio.play();
        hideUnlockBtn();
      } catch {
        showUnlockBtn();
      }
    } else {
      normalizeAudioOutput();
      try { audio.pause(); } catch {}
      const pausedAt = Math.max(0, safeNum(bg.pausedAt, 0));
      try {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          audio.currentTime = Math.min(pausedAt, audio.duration);
        } else if (pausedAt > 0) {
          const handler = () => {
            audio.removeEventListener('loadedmetadata', handler);
            try {
              if (Number.isFinite(audio.duration) && audio.duration > 0) {
                audio.currentTime = Math.min(pausedAt, audio.duration);
              }
            } catch {}
          };
          audio.addEventListener('loadedmetadata', handler);
        }
      } catch {}
    }

    try { if (modal) renderList(); } catch {}
  }

  // ---------- Top-level UI handlers ----------
  if (openBtn) openBtn.addEventListener("click", openModal);

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      if (!isGM()) return;
      const bg = ensureBgMusic(currentState || {});
      if (!bg.currentTrackId) return;

      if (bg.isPlaying) {
        bg.pausedAt = Number(audio.currentTime) || Number(bg.pausedAt) || 0;
        bg.isPlaying = false;
        syncState();
        return;
      }

      const t = Number(audio.currentTime) || Number(bg.pausedAt) || 0;
      bg.pausedAt = t;
      bg.isPlaying = true;
      bg.startedAt = Date.now() - Math.round(t * 1000);
      syncState();
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      if (!isGM()) return;
      const bg = ensureBgMusic(currentState || {});
      bg.isPlaying = false;
      bg.pausedAt = 0;
      try { audio.pause(); audio.currentTime = 0; } catch {}
      bg.startedAt = Date.now();
      syncState();
    });
  }

  window.MusicManager = { applyState };
})();
