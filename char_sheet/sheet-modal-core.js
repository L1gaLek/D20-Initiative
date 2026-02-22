/* info-dnd-player.js
   UI/логика модалки "Инфа" вынесены сюда.
   Экспортирует window.InfoModal:
   - init(context)
   - open(player)
   - refresh(players)
*/

  // ===== MODAL ELEMENTS =====
  const sheetModal = document.getElementById('sheet-modal');
  const sheetClose = document.getElementById('sheet-close');
  const sheetTitle = document.getElementById('sheet-title');
  const sheetSubtitle = document.getElementById('sheet-subtitle');
  const sheetActions = document.getElementById('sheet-actions');
  const sheetContent = document.getElementById('sheet-content');

  // context from client.js
  let ctx = null;

  function canEditPlayer(player) {
    // client.js передаёт в init() функции getMyRole()/getMyId().
    // Важно: не полагаемся на ctx.myRole/ctx.myId (их может не быть),
    // иначе у игроков отключаются клики/выборы в "Основное".
    const myRole = (typeof ctx?.getMyRole === "function")
      ? (ctx.getMyRole() || "")
      : (ctx?.myRole || ctx?.role || "");
    const myId = (typeof ctx?.getMyId === "function")
      ? (ctx.getMyId() ?? "")
      : (ctx?.myId ?? "");
    if (myRole === "GM") return true;
    const owner = player?.ownerId ?? "";
    return String(owner) && String(myId) && String(owner) === String(myId);
  }


  // состояние модалки
  let openedSheetPlayerId = null;
  let lastCanEdit = false; // GM или владелец текущего открытого персонажа

  
  // (saved bases overlay вынесен в char_sheet/sheet-saved-bases.js)


  
  // (utils/ui state/debounce вынесены в char_sheet/sheet-utils.js)

// ================== MODAL HELPERS ==================
  function openModal() {
    if (!sheetModal) return;
    sheetModal.classList.remove('hidden');
    sheetModal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    if (!sheetModal) return;
    hideHpPopup();
    hideExhPopup();
    hideCondPopup();
    sheetModal.classList.add('hidden');
    sheetModal.setAttribute('aria-hidden', 'true');
    openedSheetPlayerId = null;

    if (sheetTitle) sheetTitle.textContent = "Информация о персонаже";
    if (sheetSubtitle) sheetSubtitle.textContent = "";
    if (sheetActions) sheetActions.innerHTML = "";
    if (sheetContent) sheetContent.innerHTML = "";
  }
