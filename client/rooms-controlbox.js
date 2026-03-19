// Controlbox / board marks bootstrap lives here after room-lobby UI was split into client/rooms/lobby-room-ui.js.

// ================== CONTROLBOX INIT ==================
try {
  if (typeof window.initControlBox === 'function') {
    window.initControlBox({
      sendMessage,
      isGM,
      isSpectator,
      getState: () => lastState,
      onViewportChange: () => {
        // При изменении рамки достаточно обновить CSS wrapper (controlbox делает это),
        // а поле/игроки не нужно пересоздавать.
      },
      boardEl: board,
      boardWrapperEl: boardWrapper
    });
  }
} catch (e) {
  console.warn("controlbox init failed", e);
}

// ================== BOARD MARKS INIT ==================
try {
  if (typeof window.initBoardMarks === 'function') {
    window.initBoardMarks({
      sendMessage,
      isGM,
      isSpectator,
      getState: () => lastState,
      boardEl: board,
      boardWrapperEl: boardWrapper
    });
  }
} catch (e) {
  console.warn('board marks init failed', e);
}
