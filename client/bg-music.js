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
          <textarea data-act="desc" rows="3" style="width:100%; resize:vertical;">${escapeHtml(String(t.description || ""))}</textarea>
        </div>
      `;

      const desc = item.querySelector('textarea[data-act="desc"]');
      if (desc) {
        desc.addEventListener("input", () => {
          t.description = desc.value;
          debounceSync();
        });
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
    bg.currentTrackId = String(trackId || "");
    bg.isPlaying = !!play;
    bg.startedAt = Date.now();
    syncState();
  }

  // ---------- Apply state (called from message-ui on each snapshot) ----------
  let currentState = null;

  function applyState(state) {
    currentState = state || currentState || {};

    const bg = ensureBgMusic(currentState || {});
    const tracks = safeArr(bg.tracks);
    const cur = tracks.find(t => String(t?.id || "") === String(bg.currentTrackId || ""));

    if (nowLabel) nowLabel.textContent = "Трек: " + (cur ? String(cur.name || "—") : "—");

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
      return;
    }

    if (audio.src !== cur.url) {
      audio.src = cur.url;
      unlocked = false;
    }

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
      bg.isPlaying = !bg.isPlaying;
      bg.startedAt = Date.now();
      syncState();
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      if (!isGM()) return;
      const bg = ensureBgMusic(currentState || {});
      bg.isPlaying = false;
      bg.startedAt = Date.now();
      syncState();
    });
  }

  // ---------- Passive sync for ALL clients ----------
  // В проекте lastState обновляется в message-ui.js / core-helpers-network.js.
  // Чтобы не править эти файлы, делаем лёгкий "наблюдатель" за глобальным состоянием
  // и применяем bgMusic на каждом клиенте (включая игроков).
  let _lastAppliedSig = null;
  function _stateSig(st) {
    try {
      const bg = ensureBgMusic(st || {});
      const tracks = safeArr(bg.tracks).map(t => `${String(t?.id||'')}:${String(t?.url||'')}`).join('|');
      return [
        String(bg.currentTrackId || ''),
        bg.isPlaying ? '1' : '0',
        String(Number(bg.startedAt) || 0),
        tracks
      ].join('::');
    } catch {
      return null;
    }
  }
  function _getGlobalState() {
    try {
      // основной глобальный стейт проекта
      if (window.lastState) return window.lastState;
    } catch {}
    try {
      // fallback (если где-то хранится иначе)
      if (typeof lastState !== 'undefined') return lastState;
    } catch {}
    return null;
  }
  function _tickApplyFromGlobal() {
    const st = _getGlobalState();
    if (!st) return;
    const sig = _stateSig(st);
    if (!sig || sig === _lastAppliedSig) return;
    _lastAppliedSig = sig;
    try { applyState(st); } catch {}
  }
  // периодически проверяем изменения; интервал небольшой, нагрузка минимальная
  try { setInterval(_tickApplyFromGlobal, 500); } catch {}
  try { setTimeout(_tickApplyFromGlobal, 80); } catch {}

  // Export
  window.MusicManager = { applyState };
})();