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

  function ensureBgMusic(state) {
    if (!state || typeof state !== "object") return null;
    if (!state.bgMusic || typeof state.bgMusic !== "object") {
      state.bgMusic = { tracks: [], currentTrackId: null, isPlaying: false, startedAt: 0 };
    }
    if (!Array.isArray(state.bgMusic.tracks)) state.bgMusic.tracks = [];

// Normalize legacy/new fields for track description.
try {
  (state.bgMusic.tracks || []).forEach((t) => {
    if (!t || typeof t !== 'object') return;
    if (typeof t.desc === 'undefined' && typeof t.description !== 'undefined') t.desc = t.description;
    if (typeof t.description === 'undefined' && typeof t.desc !== 'undefined') t.description = t.desc;
  });
} catch {}

    if (typeof state.bgMusic.isPlaying !== "boolean") state.bgMusic.isPlaying = false;
    if (!Number.isFinite(Number(state.bgMusic.startedAt))) state.bgMusic.startedAt = 0;
    return state.bgMusic;
  }

  function uuid() {
    try { return crypto.randomUUID(); } catch {}
    return "t_" + Math.random().toString(16).slice(2) + "_" + Date.now();
  }

  // ---------- Audio ----------
  const audio = new Audio();
  audio.loop = true;

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

  // Autoplay unlock UX (players may need it)
  let unlocked = false;
  async function tryUnlock() {
    if (unlocked) return true;
    try {
      await audio.play();
      audio.pause();
      unlocked = true;
      hideUnlockBtn();
      return true;
    } catch {
      showUnlockBtn();
      return false;
    }
  }

  // ---------- UI ----------
  const openBtn = document.getElementById("bg-music-open");
  const toggleBtn = document.getElementById("bg-music-toggle");
  const stopBtn = document.getElementById("bg-music-stop");
  const volumeSlider = document.getElementById("bg-music-volume");
  const nowLabel = document.getElementById("bg-music-now");
  const musicBox = document.getElementById("bg-music-box");

  // Seek ("эквалайзер") UI (created dynamically under track label)
  let seekWrap = null;
  let seekSlider = null;
  let seekTime = null;
  let _isSeeking = false;
  let _lastSeekSyncAt = 0;

  function fmtTime(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  
function ensureMainUiLayout() {
  if (!musicBox) return;
  if (musicBox._bgmLayoutDone) return;
  musicBox._bgmLayoutDone = true;

  // Layout goal (per latest request):
  // - Volume stays in the top row (under title), but occupies the place where "Список" used to be.
  // - "Список" goes into the same row as "Пуск/Пауза" and "Стоп".
  // - Buttons are same height and compact.
  try {
    const h3 = musicBox.querySelector('h3');

    // ----- Top row: Volume only (left aligned) -----
    if (volumeSlider) {
      volumeSlider.style.width = '150px';
    }
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

    // ----- Controls row: Список + Пуск/Пауза + Стоп -----
    const controlsRow = toggleBtn ? toggleBtn.parentElement : null;
    if (controlsRow) {
      controlsRow.style.display = 'flex';
      controlsRow.style.gap = '8px';
      controlsRow.style.flexWrap = 'nowrap';
      controlsRow.style.alignItems = 'center';
      controlsRow.style.marginTop = '8px';

      if (openBtn) {
        // move button into controls row (first)
        try { openBtn.remove(); } catch {}
        controlsRow.insertBefore(openBtn, controlsRow.firstChild);

        openBtn.style.width = 'auto';
        openBtn.style.padding = '4px 10px';
        openBtn.style.lineHeight = '1.1';
      }

      // equal compact height for all buttons in row
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

      // NOTE: emoji "⏹" often sits lower visually due to font metrics.
      // We compensate only for the stop button to make it perfectly level.
      if (stopBtn) {
        try {
          stopBtn.style.fontSize = '16px';
          stopBtn.style.transform = 'translateY(-2px)';
        } catch {}
      }
    }
  } catch {}

  // ----- Seek bar ("эквалайзер") under the track label -----
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

      // GM seeks are synced to everyone by shifting startedAt.
      if (isGM()) {
        const now = Date.now();
        if (now - _lastSeekSyncAt > 250) {
          _lastSeekSyncAt = now;
          try {
            const bg = ensureBgMusic(currentState || {});
            bg.startedAt = Date.now() - Math.round(cur * 1000);
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
    unlockBtn.addEventListener("click", async () => { await tryUnlock(); });
    musicBox.appendChild(unlockBtn);
  }
  function hideUnlockBtn() {
    if (unlockBtn) {
      try { unlockBtn.remove(); } catch {}
      unlockBtn = null;
    }
  }

  // Modal
  let modal = null;

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

    // If GM is typing in a textarea, don't rerender the whole list.
    // Otherwise the DOM rebuild resets the caret and can "eat" the typed text.
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

      // Dark textarea (requested)
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
          t.description = t.desc; // backward compat
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

    const pub = sb.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = pub?.data?.publicUrl || null;
    if (!publicUrl) {
      alert("Не удалось получить publicUrl. Проверь: bucket public или getPublicUrl доступен.");
      return;
    }

    bg.tracks.push({
      id,
      name: safeName,
      desc: "",
      description: "",
      url: publicUrl,
      path
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

    if (String(bg.currentTrackId || "") === id) {
      bg.currentTrackId = bg.tracks.length ? String(bg.tracks[0].id) : null;
      bg.isPlaying = false;
      bg.startedAt = 0;
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

  // When switching track: start from 0.
  // When just "play current": keep currentTime (rarely used here).
  if (bg.isPlaying) {
    if (changed) {
      bg.startedAt = Date.now();
      try { audio.currentTime = 0; } catch {}
    } else {
      const t = Number(audio.currentTime) || 0;
      bg.startedAt = Date.now() - Math.round(t * 1000);
    }
  } else {
    // paused
    // keep startedAt as-is (not important while paused)
  }

  syncState();
}

  // ---------- Apply state (called from message-ui on each snapshot) ----------
  let currentState = null;

  function applyState(state) {
    currentState = state || currentState || {};

    // Ensure layout once DOM is available
    try { ensureMainUiLayout(); } catch {}

    const bg = ensureBgMusic(currentState || {});
    const tracks = safeArr(bg.tracks);
    const cur = tracks.find(t => String(t?.id || "") === String(bg.currentTrackId || ""));

    if (nowLabel) nowLabel.textContent = "Трек: " + (cur ? String(cur.name || "—") : "—");

    // Seek bar enable/disable
    try {
      if (seekSlider) {
        const has = !!(cur && cur.url);
        // Seeking is GM-only to keep all clients in sync.
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

    if (!cur || !cur.url) {
      try { audio.pause(); } catch {}

      // Reset seek UI
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

    if (audio.src !== cur.url) {
      audio.src = cur.url;
      unlocked = false;
    }

    // Keep seek bar in sync with playback.
    try {
      const syncSeekUi = () => {
        if (!seekSlider || !seekTime) return;
        const dur = Number(audio.duration) || 0;
        const t = Number(audio.currentTime) || 0;
        seekSlider.max = String(dur > 0 ? dur : 0);
        if (!_isSeeking) seekSlider.value = String(t);
        seekTime.textContent = `${fmtTime(_isSeeking ? Number(seekSlider.value) || 0 : t)} / ${fmtTime(dur)}`;
      };

      if (!audio._bgmSeekBound) {
        audio._bgmSeekBound = true;
        audio.addEventListener('loadedmetadata', syncSeekUi);
        audio.addEventListener('timeupdate', syncSeekUi);
        audio.addEventListener('durationchange', syncSeekUi);
        audio.addEventListener('ended', syncSeekUi);
      }
      syncSeekUi();
    } catch {}

    if (bg.isPlaying) {
      tryUnlock().then((ok) => {
        if (!ok) return;
        try {
          const offset = (Date.now() - (Number(bg.startedAt) || Date.now())) / 1000;
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
          audio.play().catch(() => showUnlockBtn());
        } catch {
          showUnlockBtn();
        }
      });
    } else {
      try { audio.pause(); } catch {}
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
      // Pause: keep current position locally, just stop playback for everyone.
      bg.isPlaying = false;
      syncState();
      return;
    }

    // Resume: keep position (do NOT restart from 0).
    // We sync by shifting startedAt so that (now - startedAt) == currentTime.
    const t = Number(audio.currentTime) || 0;
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

    // Stop resets position to 0 for the next play.
    try { audio.pause(); audio.currentTime = 0; } catch {}
    bg.startedAt = Date.now();
    syncState();
  });
}

  // Export
  window.MusicManager = { applyState };
})();