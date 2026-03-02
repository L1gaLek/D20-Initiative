// client/bg-music.js
// Фоновая музыка (Supabase Storage + синхронизация состояния)
// Разрешены ЛЮБЫЕ расширения, ограничение только 50 МБ и максимум 10 треков

(function () {
  const MAX_TRACKS = 10;
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
  const BUCKET = "room-audio";

  let currentState = null;
  let audio = new Audio();
  audio.loop = true;
  audio.volume = 0.4;

  // ================= UI =================
  const openBtn = document.getElementById("bg-music-open");
  const toggleBtn = document.getElementById("bg-music-toggle");
  const stopBtn = document.getElementById("bg-music-stop");
  const volumeSlider = document.getElementById("bg-music-volume");
  const nowLabel = document.getElementById("bg-music-now");

  let modal = null;

  // ================= MODAL =================
  function openModal() {
    if (modal) return;

    modal = document.createElement("div");
    modal.className = "modal-overlay";

    modal.innerHTML = `
      <div class="modal" style="max-width:600px;">
        <div class="modal-header">
          <div class="modal-title">Список музыки</div>
          <button class="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <button id="bgm-upload-btn">Загрузить</button>
          <input type="file" id="bgm-file-input" multiple style="display:none;">
          <div id="bgm-list" style="margin-top:12px; display:flex; flex-direction:column; gap:10px;"></div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector(".modal-close").onclick = closeModal;

    const uploadBtn = modal.querySelector("#bgm-upload-btn");
    const fileInput = modal.querySelector("#bgm-file-input");

    // ВАЖНО: нет accept — можно загружать любые расширения
    uploadBtn.onclick = () => fileInput.click();

    fileInput.onchange = async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;

      const existing = currentState?.bgMusic?.tracks?.length || 0;

      if (existing + files.length > MAX_TRACKS) {
        alert("Максимум 10 треков на комнату.");
        return;
      }

      for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
          alert(`Файл "${file.name}" больше 50 МБ.`);
          continue;
        }
        await uploadTrack(file);
      }

      renderList();
    };

    renderList();
  }

  function closeModal() {
    if (modal) {
      modal.remove();
      modal = null;
    }
  }

  function renderList() {
    if (!modal) return;

    const list = modal.querySelector("#bgm-list");
    list.innerHTML = "";

    const tracks = currentState?.bgMusic?.tracks || [];

    tracks.forEach(track => {
      const item = document.createElement("div");
      item.style.border = "1px solid #555";
      item.style.padding = "8px";
      item.style.borderRadius = "6px";

      item.innerHTML = `
        <div style="font-weight:700;">${track.name}</div>
        <input type="text" value="${track.description || ""}" placeholder="Описание..." style="width:100%; margin-top:6px;">
        <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">
          <button data-play="${track.id}">▶</button>
          <button data-set="${track.id}">Сделать текущим</button>
          <button data-del="${track.id}">Удалить</button>
        </div>
      `;

      const descInput = item.querySelector("input");
      descInput.onchange = () => {
        track.description = descInput.value;
        syncState();
      };

      item.querySelector("[data-play]").onclick = () => {
        setCurrent(track.id, true);
      };

      item.querySelector("[data-set]").onclick = () => {
        setCurrent(track.id, false);
      };

      item.querySelector("[data-del]").onclick = async () => {
        await deleteTrack(track);
        renderList();
      };

      list.appendChild(item);
    });
  }

  // ================= UPLOAD =================
  async function uploadTrack(file) {
    if (!window.supabase) {
      alert("Supabase не инициализирован.");
      return;
    }

    const roomId = currentState?.roomId || "default";
    const id = crypto.randomUUID();
    const path = `music/${roomId}/${id}_${file.name}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file);

    if (error) {
      alert("Ошибка загрузки: " + error.message);
      return;
    }

    const { data } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(path);

    const track = {
      id,
      name: file.name,
      description: "",
      url: data.publicUrl
    };

    if (!currentState.bgMusic) {
      currentState.bgMusic = {
        tracks: [],
        currentTrackId: null,
        isPlaying: false,
        startedAt: 0
      };
    }

    currentState.bgMusic.tracks.push(track);
    syncState();
  }

  async function deleteTrack(track) {
    const parts = track.url.split(`${BUCKET}/`);
    if (parts.length < 2) return;

    const path = parts[1];
    await supabase.storage.from(BUCKET).remove([path]);

    currentState.bgMusic.tracks =
      currentState.bgMusic.tracks.filter(t => t.id !== track.id);

    syncState();
  }

  // ================= PLAY CONTROL =================
  function setCurrent(id, play) {
    currentState.bgMusic.currentTrackId = id;
    currentState.bgMusic.isPlaying = play;
    currentState.bgMusic.startedAt = Date.now();
    syncState();
  }

  function stopMusic() {
    currentState.bgMusic.isPlaying = false;
    syncState();
  }

  function applyState(state) {
    currentState = state;

    if (!state?.bgMusic) return;

    const music = state.bgMusic;
    const track = music.tracks?.find(t => t.id === music.currentTrackId);

    if (!track) {
      audio.pause();
      nowLabel.textContent = "Трек: —";
      toggleBtn.disabled = true;
      stopBtn.disabled = true;
      return;
    }

    toggleBtn.disabled = false;
    stopBtn.disabled = false;
    nowLabel.textContent = "Трек: " + track.name;

    if (audio.src !== track.url) {
      audio.src = track.url;
    }

    if (music.isPlaying) {
      const offset = (Date.now() - music.startedAt) / 1000;
      audio.currentTime = offset % (audio.duration || 1);
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }

  function syncState() {
    if (!window.sendMessage) return;
    sendMessage({
      type: "bgMusicSet",
      bgMusic: currentState.bgMusic
    });
  }

  // ================= BUTTONS =================
  openBtn?.addEventListener("click", openModal);

  toggleBtn?.addEventListener("click", () => {
    const music = currentState.bgMusic;
    music.isPlaying = !music.isPlaying;
    music.startedAt = Date.now();
    syncState();
  });

  stopBtn?.addEventListener("click", stopMusic);

  volumeSlider?.addEventListener("input", () => {
    audio.volume = volumeSlider.value / 100;
  });

  // ================= EXPORT =================
  window.MusicManager = {
    applyState
  };

})();
