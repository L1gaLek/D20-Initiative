(() => {
  let audio = null;
  let lastSoundAt = -Infinity;
  function unlockAudio() {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      if(window.PersonalPreferences?.get().chatSound===false||window.PersonalPreferences?.get().volume===0)return;
    if (!audio || audio.state === 'closed') audio = new Audio();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
    } catch {}
  }
  document.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });
  document.addEventListener('keydown', unlockAudio, { capture: true, passive: true });
  function ping() {
    // One brief chime per burst; history loads and own messages never call this.
    if (!audio || audio.state !== 'running' || Date.now() - lastSoundAt < 800) return;
    lastSoundAt = Date.now();
    try {
      [660, 880].forEach((frequency, index) => {
        const start = audio.currentTime + index * 0.1;
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.07*(window.PersonalPreferences?.get().volume??70)/70, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.13);
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(start);
        oscillator.stop(start + 0.14);
      });
    } catch {}
  }
  function update(hasUnread) {
    const icon = document.getElementById('room-chat-notification');
    if (icon) icon.hidden = !hasUnread;
  }
  window.RoomChatNotifications = { update, ping };
})();
