
// client/bg-music.js
// GM-controlled background music via Supabase Storage + room_state sync.
// Requirements:
// - up to 10 tracks per room
// - each track <= 50 MB
// - GM can upload + manage list, and switch tracks when needed
// - all clients follow current track (play/pause/volume)

// NOTE: This file assumes the project already runs on Supabase (no separate server).
// It uses global sbClient + sendMessage + currentRoomId + isGM().

(function () {
  const BUCKET = 'room-audio'; // create this bucket in Supabase Storage
  const MAX_TRACKS = 10;
  const MAX_BYTES = 50 * 1024 * 1024;

  function uid() {
    return (crypto?.randomUUID ? crypto.randomUUID() : ("aud-" + Math.random().toString(16).slice(2) + "-" + Date.now()));
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function getBgMusic(state) {
    const m = state?.bgMusic;
    if (!m || typeof m !== 'object') return { tracks: [], currentTrackId: null, isPlaying: false, volume: 40 };
    return {
      tracks: Array.isArray(m.tracks) ? m.tracks : [],
      currentTrackId: m.currentTrackId ? String(m.currentTrackId) : null,
      isPlaying: !!m.isPlaying,
      volume: clamp(Number(m.volume), 0, 100) || 40
    };
  }

  function safeName(name) {
    const n = String(name || 'track').trim() || 'track';
    return n.replace(/[^\w.\-() ]+/g, '_').slice(0, 80);
  }

  // ===== Audio engine (all clients) =====
  const audio = new Audio();
  audio.preload = 'auto';
  audio.loop = true;

  let applied = { trackId: null, url: '', isPlaying: false, volume: 40 };
  let enableBtn = null;

  function ensureEnableButton() {
    if (enableBtn) return enableBtn;
    const btn = document.createElement('button');
    btn.textContent = 'Включить звук';
    btn.style.position = 'fixed';
    btn.style.left = '12px';
    btn.style.bottom = '12px';
    btn.style.zIndex = '999999';
    btn.style.padding = '10px 12px';
    btn.style.borderRadius = '10px';
    btn.style.border = '1px solid rgba(255,255,255,.15)';
    btn.style.background = 'rgba(0,0,0,.75)';
    btn.style.color = '#fff';
    btn.style.cursor = 'pointer';
    btn.style.display = 'none';
    btn.title = 'Браузер блокирует автозапуск. Нажмите один раз, чтобы разрешить звук.';
    btn.addEventListener('click', async () => {
      btn.style.display = 'none';
      try { await audio.play(); } catch {}
    });
    document.body.appendChild(btn);
    enableBtn = btn;
    return btn;
  }

  async function tryPlay() {
    try {
      await audio.play();
      if (enableBtn) enableBtn.style.display = 'none';
    } catch (e) {
      // Autoplay blocked => show the enable button.
      const btn = ensureEnableButton();
      btn.style.display = '';
    }
  }

  function applyAudioFromState(state) {
    const m = getBgMusic(state);
    const track = m.currentTrackId ? (m.tracks || []).find(t => String(t.id) === String(m.currentTrackId)) : null;
    const url = track?.url ? String(track.url) : '';

    // volume
    audio.volume = clamp(m.volume, 0, 100) / 100;

    // track switch
    const trackChanged = (String(applied.trackId || '') !== String(m.currentTrackId || '')) || (applied.url !== url);
    if (trackChanged) {
      applied.trackId = m.currentTrackId;
      applied.url = url;
      try { audio.pause(); } catch {}
      audio.currentTime = 0;
      if (url) audio.src = url;
      else audio.removeAttribute('src');
    }

    // play/pause
    if (m.isPlaying && url) {
      if (audio.paused || trackChanged || applied.isPlaying !== true) {
        tryPlay();
      }
    } else {
      try { audio.pause(); } catch {}
    }

    applied.isPlaying = m.isPlaying;
    applied.volume = m.volume;

    // Update GM mini UI
    try {
      const now = document.getElementById('bg-music-now');
      if (now) now.textContent = 'Трек: ' + (track?.name || '—');
    } catch {}
  }

  // Expose for other scripts (message-ui calls applyState on every snapshot)
  window.MusicManager = window.MusicManager || {};
  window.MusicManager.applyState = applyAudioFromState;

  // ===== GM UI =====
  function isGmSafe() {
    try { return (typeof isGM === 'function') ? isGM() : (String(window.myRole || '') === 'GM'); } catch { return false; }
  }

  function sb() {
    if (typeof sbClient !== 'undefined' && sbClient) return sbClient;
    // fallback (should already exist)
    if (window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
      try { return window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY); } catch {}
    }
    return null;
  }

  async function uploadTrackToStorage(roomId, file, trackId) {
    const client = sb();
    if (!client) throw new Error('Supabase не инициализирован');

    const clean = safeName(file?.name || 'track');
    const path = `${roomId}/${trackId}_${clean}`;

    const { error } = await client.storage
      .from(BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type || 'audio/mpeg' });

    if (error) throw error;

    // Public URL (bucket must be public)
    const { data } = client.storage.from(BUCKET).getPublicUrl(path);
    const url = data?.publicUrl ? String(data.publicUrl) : '';
    if (!url) throw new Error('Не удалось получить publicUrl для трека');

    return { path, url };
  }

  async function removeTrackFromStorage(path) {
    const client = sb();
    if (!client) return;
    try { await client.storage.from(BUCKET).remove([String(path || '')]); } catch {}
  }

  function buildModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '99999';

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.maxWidth = '720px';

    modal.innerHTML = `
      <div class="modal-header">
        <div>
          <div class="modal-title">Фоновая музыка</div>
          <div class="modal-subtitle">До ${MAX_TRACKS} треков, каждый до 50 МБ</div>
        </div>
        <button class="modal-close" type="button">✕</button>
      </div>
      <div class="modal-body">
        <div class="sheet-card" style="display:flex; flex-direction:column; gap:10px;">
          <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
            <button id="bgm-upload" type="button">Загрузить</button>
            <input id="bgm-file" type="file" accept="audio/*" style="display:none;" />
            <div style="font-size:12px; opacity:.85;">После загрузки укажите описание (например: «бой», «город», «подземелье»).</div>
          </div>
          <div id="bgm-list" style="display:flex; flex-direction:column; gap:10px;"></div>
        </div>
      </div>
    `;

    overlay.appendChild(modal);

    const close = () => { try { overlay.remove(); } catch {} };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    modal.querySelector('.modal-close')?.addEventListener('click', close);

    return { overlay, close };
  }

  function renderTracks(listEl, state) {
    if (!listEl) return;
    listEl.innerHTML = '';

    const m = getBgMusic(state);
    const tracks = (m.tracks || []).slice(0, MAX_TRACKS);
    if (!tracks.length) {
      const empty = document.createElement('div');
      empty.style.fontSize = '13px';
      empty.style.opacity = '.8';
      empty.textContent = 'Пока нет треков. Нажмите «Загрузить».';
      listEl.appendChild(empty);
      return;
    }

    tracks.forEach((t) => {
      const card = document.createElement('div');
      card.className = 'sheet-card';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.gap = '8px';

      const isCur = String(m.currentTrackId || '') === String(t.id);

      const top = document.createElement('div');
      top.style.display = 'flex';
      top.style.gap = '10px';
      top.style.alignItems = 'center';
      top.style.flexWrap = 'wrap';

      const title = document.createElement('div');
      title.style.fontWeight = '700';
      title.textContent = (t.name || 'Трек') + (isCur ? '  (текущий)' : '');
      top.appendChild(title);

      const btnSet = document.createElement('button');
      btnSet.type = 'button';
      btnSet.textContent = 'Сделать текущим';
      btnSet.disabled = isCur;
      btnSet.addEventListener('click', () => gmSetCurrentAndPlay(t.id));
      top.appendChild(btnSet);

      const btnPlay = document.createElement('button');
      btnPlay.type = 'button';
      btnPlay.textContent = '▶';
      btnPlay.addEventListener('click', () => gmPlay(t.id));
      top.appendChild(btnPlay);

      const btnPause = document.createElement('button');
      btnPause.type = 'button';
      btnPause.textContent = '⏸';
      btnPause.addEventListener('click', () => gmPause());
      top.appendChild(btnPause);

      const btnDel = document.createElement('button');
      btnDel.type = 'button';
      btnDel.textContent = 'Удалить';
      btnDel.addEventListener('click', () => gmDeleteTrack(t.id));
      top.appendChild(btnDel);

      const desc = document.createElement('textarea');
      desc.rows = 2;
      desc.placeholder = 'Описание трека (вводится вручную)';
      desc.value = String(t.desc || '');
      desc.addEventListener('input', () => {
        // debounce-like: update after small pause
        const val = String(desc.value || '');
        clearTimeout(desc._t);
        desc._t = setTimeout(() => gmUpdateDesc(t.id, val), 300);
      });

      card.appendChild(top);
      card.appendChild(desc);

      listEl.appendChild(card);
    });
  }

  function gmPatchBgMusic(patch) {
    if (!isGmSafe()) return;
    if (!currentRoomId) return;
    const cur = getBgMusic(typeof lastState !== 'undefined' ? lastState : null);
    const next = {
      tracks: cur.tracks,
      currentTrackId: cur.currentTrackId,
      isPlaying: cur.isPlaying,
      volume: cur.volume,
      ...(patch || {})
    };
    // Always hard-limit track list
    if (Array.isArray(next.tracks)) next.tracks = next.tracks.slice(0, MAX_TRACKS);
    sendMessage({ type: 'bgMusicSet', bgMusic: next });
  }

  function gmUpdateDesc(trackId, desc) {
    if (!isGmSafe()) return;
    const cur = getBgMusic(typeof lastState !== 'undefined' ? lastState : null);
    const tracks = (cur.tracks || []).map(t => (String(t.id) === String(trackId)) ? { ...t, desc: String(desc || '') } : t);
    gmPatchBgMusic({ tracks });
  }

  function gmSetCurrentAndPlay(trackId) {
    gmPatchBgMusic({ currentTrackId: String(trackId || ''), isPlaying: true });
  }

  function gmPlay(trackId) {
    const tid = trackId ? String(trackId) : null;
    if (tid) gmPatchBgMusic({ currentTrackId: tid, isPlaying: true });
    else gmPatchBgMusic({ isPlaying: true });
  }

  function gmPause() {
    gmPatchBgMusic({ isPlaying: false });
  }

  async function gmDeleteTrack(trackId) {
    if (!isGmSafe()) return;
    if (!confirm('Удалить этот трек?')) return;

    const cur = getBgMusic(typeof lastState !== 'undefined' ? lastState : null);
    const t = (cur.tracks || []).find(x => String(x.id) === String(trackId));
    const tracks = (cur.tracks || []).filter(x => String(x.id) !== String(trackId));

    // stop if current removed
    const patch = { tracks };
    if (String(cur.currentTrackId || '') === String(trackId)) {
      patch.currentTrackId = null;
      patch.isPlaying = false;
    }

    gmPatchBgMusic(patch);

    // async cleanup (no need to wait)
    try { await removeTrackFromStorage(t?.path); } catch {}
  }

  async function gmUploadFlow(file, listEl, close) {
    if (!isGmSafe()) return;
    if (!currentRoomId) return alert('Сначала войдите в комнату');

    const cur = getBgMusic(typeof lastState !== 'undefined' ? lastState : null);
    if ((cur.tracks || []).length >= MAX_TRACKS) {
      alert(`Максимум ${MAX_TRACKS} треков`);
      return;
    }

    if (!file) return;
    if (file.size > MAX_BYTES) {
      alert('Файл слишком большой. Максимум 50 МБ.');
      return;
    }

    const trackId = uid();
    const name = safeName(file.name);

    // optimistic placeholder (without url yet)
    const placeholder = {
      id: trackId,
      name,
      desc: '',
      url: '',
      path: '',
      createdAt: new Date().toISOString()
    };

    // render "loading" in list quickly
    try {
      const st = getBgMusic(typeof lastState !== 'undefined' ? lastState : null);
      gmPatchBgMusic({ tracks: [...(st.tracks || []), placeholder].slice(0, MAX_TRACKS) });
    } catch {}

    try {
      const { path, url } = await uploadTrackToStorage(currentRoomId, file, trackId);

      const fresh = getBgMusic(typeof lastState !== 'undefined' ? lastState : null);
      const tracks = (fresh.tracks || []).map(t => {
        if (String(t.id) !== String(trackId)) return t;
        return { ...t, path, url };
      }).filter(t => t.id);

      gmPatchBgMusic({ tracks });

      // optionally: auto-set current and play on upload
      // gmSetCurrentAndPlay(trackId);

    } catch (e) {
      console.error(e);
      alert('Не удалось загрузить трек в Storage. Проверьте bucket/policies.');
      // rollback placeholder
      const fresh = getBgMusic(typeof lastState !== 'undefined' ? lastState : null);
      gmPatchBgMusic({ tracks: (fresh.tracks || []).filter(t => String(t.id) !== String(trackId)) });
    }
  }

  function hookGmBox() {
    const openBtn = document.getElementById('bg-music-open');
    const toggleBtn = document.getElementById('bg-music-toggle');
    const stopBtn = document.getElementById('bg-music-stop');
    const vol = document.getElementById('bg-music-volume');

    if (toggleBtn) toggleBtn.addEventListener('click', () => {
      const m = getBgMusic(typeof lastState !== 'undefined' ? lastState : null);
      if (!m.currentTrackId) return;
      gmPatchBgMusic({ isPlaying: !m.isPlaying });
    });

    if (stopBtn) stopBtn.addEventListener('click', () => gmPatchBgMusic({ isPlaying: false, currentTrackId: null }));

    if (vol) vol.addEventListener('input', () => {
      const v = clamp(Number(vol.value), 0, 100);
      gmPatchBgMusic({ volume: v });
    });

    function refreshButtonsFromState(state) {
      const m = getBgMusic(state);
      if (toggleBtn) toggleBtn.disabled = !m.currentTrackId;
      if (stopBtn) stopBtn.disabled = (!m.currentTrackId && !m.isPlaying);
      if (vol) vol.value = String(clamp(Number(m.volume), 0, 100) || 40);
    }

    // initial
    try { refreshButtonsFromState(typeof lastState !== 'undefined' ? lastState : null); } catch {}

    // Update on every snapshot (message-ui calls applyState(normalized), so we can also keep buttons in sync there)
    const prevApply = window.MusicManager.applyState;
    window.MusicManager.applyState = (state) => {
      try { prevApply?.(state); } catch {}
      try { refreshButtonsFromState(state); } catch {}
    };

    if (openBtn) {
      openBtn.addEventListener('click', () => {
        if (!isGmSafe()) return;
        const { overlay } = buildModal();

        const uploadBtn = overlay.querySelector('#bgm-upload');
        const fileInp = overlay.querySelector('#bgm-file');
        const listEl = overlay.querySelector('#bgm-list');

        const render = () => { try { renderTracks(listEl, typeof lastState !== 'undefined' ? lastState : null); } catch {} };
        render();

        // re-render when state changes (cheap)
        const prev = window.MusicManager.applyState;
        window.MusicManager.applyState = (state) => {
          try { prev?.(state); } catch {}
          try { renderTracks(listEl, state); } catch {}
        };

        uploadBtn?.addEventListener('click', () => fileInp?.click());
        fileInp?.addEventListener('change', async () => {
          const f = fileInp.files?.[0];
          fileInp.value = '';
          await gmUploadFlow(f, listEl);
        });

        document.body.appendChild(overlay);
      });
    }
  }

  // Cleanup helper (can be called from a future "delete room" action if you add it)
  window.MusicManager.cleanupRoomAudio = async (roomId) => {
    const client = sb();
    if (!client) return;
    const rid = String(roomId || '').trim();
    if (!rid) return;

    // Remove all files under `${roomId}/` (Supabase doesn't support "delete folder", so we list + remove)
    try {
      const { data, error } = await client.storage.from(BUCKET).list(rid, { limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } });
      if (error) return;
      const paths = (data || []).map(it => `${rid}/${it.name}`).filter(Boolean);
      if (paths.length) await client.storage.from(BUCKET).remove(paths);
    } catch {}
  };

  // Init after DOM is ready
  function init() {
    // everyone needs enable button potential
    ensureEnableButton();

    // GM-only: box exists only for GM (right-panel hidden by applyRoleToUI), but keep it safe
    hookGmBox();

    // If state already exists, apply immediately
    try { if (typeof lastState !== 'undefined' && lastState) applyAudioFromState(lastState); } catch {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
