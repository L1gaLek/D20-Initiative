// client/bg-music.js
// Полная механика фоновой музыки (Supabase Storage + синхронизация state)

(function () {
  const MAX_TRACKS = 10;
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
  const BUCKET = "room-audio";

  let currentState = null;
  let audio = new Audio();
  audio.loop = true;

  // ================= UI ELEMENTS =================
  const box = document.getElementById("bg-music-box");
  const openBtn = document.getElementById("bg-music-open");
  const toggleBtn = document.getElementById("bg-music-toggle");
  const stopBtn = document.getElementById("bg-music-stop");
  const volumeSlider = document.getElementById("bg-music-volume");
  const nowLabel = document.getElementById("bg-music-now");

  // ===== Modal =====
  let modal = null;

  function createModal() {
    modal = document.createElement("div");
    modal.className = "modal-overlay";

    modal.innerHTML = `
      <div class="modal" style="max-width:600px;">
        <div class="modal-header">
          <div>
            <div class="modal-title">Список музыки</div>
          </div>
          <button class="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <button id="bgm-upload">Загрузить</button>
          <input type="file" id="bgm-file" multiple style="display:none;">
          <div id="bgm-list" style="margin-top:12px; display:flex; flex-direction:column; gap:10px;"></div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector(".modal-close").onclick = () => {
      modal.remove();
      modal = null;
    };

    const uploadBtn = modal.querySelector("#bgm-upload");
    const fileInput = modal.querySelector("#bgm-file");

    // ⬇️ ВАЖНО: accept НЕ указываем — можно любые расширения
    uploadBtn.onclick = () => fileInput.click();

    fileInput.onchange = async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;

      if ((currentState?.bgMusic?.tracks?.length || 0) + files.length > MAX_TRACKS) {
        alert("Максимум 10 треков.");
        return;
      }

      for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
          alert(`Файл ${file.name} больше 50 МБ.`);
          continue;
        }

        await uploadTrack(file);
      }

      renderList();
    };

    renderList();
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

      item.querySelector("[data-play]")?.addEventListener("click", () => {
        setCurrent(track.id, true);
      });

      item.querySelector("[data-set]")?.addEventListener("click", () => {
        setCurrent(track.id, false);
      });

      item.querySelector("[data-del]")?.addEventListener("click", async () => {
        await deleteTrack(track);
        renderList();
      });

      list.appendChild(item);
    });
  }

  // ================= UPLOAD =================
  async function uploadTrack(file) {
    if (!window.supabase) {
      alert("Supabase не найден.");
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

    currentState.bgMusic.tracks.push(track);
    syncState();
  }

  async function deleteTrack(track) {
    const urlParts = track.url.split(`${BUCKET}/`);
    if (urlParts.length < 2) return;

    const path = urlParts[1];

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

    const music = state.bgMusic;
    if (!music) return;

    const track = music.tracks.find(t => t.id === music.currentTrackId);

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
  openBtn?.addEventListener("click", createModal);

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
