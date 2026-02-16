// ================== MESSAGE HANDLER (used by Supabase subscriptions) ==================
function handleMessage(msg) {

  // ================== VISIBILITY HELPERS ==================
  // Rules requested:
  // 1) "Союзник" is GM-only.
  // 2) GM-created characters are hidden from other players unless isAlly.
  // 3) HP-bar / double-click mini / sheet are only available for visible tokens.
  // 4) GM-created non-base non-ally characters are scoped to the active map (mapId).
  function getOwnerRoleForPlayer(p) {
    const direct = String(p?.ownerRole || '').trim();
    if (direct) return direct;
    const u = p?.ownerId ? usersById.get(String(p.ownerId)) : null;
    return String(u?.role || '').trim();
  }

  function isPlayerVisibleToMe(p, state) {
    if (!p) return false;
    const ownerRole = getOwnerRoleForPlayer(p);
    const curMapId = String(state?.currentMapId || '').trim();

    if (myRole === 'GM') {
      // GM view mode:
      // - 'gm'     : show everything (with map-local scoping)
      // - 'player' : treat visibility like a regular player
      const gmView = String(state?.fog?.gmViewMode || 'gm');
      if (gmView !== 'player') {
        // Map-local GM NPCs/monsters: show only on their map.
        if (ownerRole === 'GM' && !p.isBase && !p.isAlly) {
          const pidMap = String(p?.mapId || '').trim();
          if (pidMap && curMapId && pidMap !== curMapId) return false;
        }
        return true;
      }
      // else: fall through to non-GM rules
    }

    // Non-GM:
    // GM-created non-allies are hidden unless GM explicitly made them public (eye).
    // This must work consistently in ALL phases (including exploration).
    if (ownerRole === 'GM' && !p.isAlly) {
      const pub = !!p.isPublic;
      if (!pub) return false;
    }

    // Safety: if a GM-created map-local somehow leaked as visible, still gate by map.
    const pidMap = String(p?.mapId || '').trim();
    if (ownerRole === 'GM' && pidMap && curMapId && pidMap !== curMapId && !p.isAlly) return false;
    return true;
  }

// ===== Rooms lobby messages =====
if (msg.type === 'rooms' && Array.isArray(msg.rooms)) {
  renderRooms(msg.rooms);
  if (!currentRoomId && diceViz) diceViz.style.display = 'none';
}
if (msg.type === 'joinedRoom' && msg.room) {
  roomsDiv.style.display = 'none';
  gameUI.style.display = 'block';

  currentRoomId = msg.room.id || null;
  if (myRoomSpan) myRoomSpan.textContent = msg.room.name || '-';
  if (myScenarioSpan) myScenarioSpan.textContent = msg.room.scenario || '-';
  if (diceViz) diceViz.style.display = 'block';
  applyRoleToUI();
  startHeartbeat();
  startMembersPolling();
}

if (msg.type === "registered") {
      myId = msg.id;
      localStorage.setItem("dnd_user_id", String(msg.id));
      localStorage.setItem("dnd_user_role", String(msg.role || ""));
      localStorage.setItem("dnd_user_name", String(msg.name || ""));
myRole = msg.role;
      myNameSpan.textContent = msg.name;
      myRoleSpan.textContent = msg.role;
      myRole = String(msg.role || "");

      

      currentRoomId = null;
      stopHeartbeat();
      stopMembersPolling();
      if (diceViz) diceViz.style.display = 'none';
      if (myRoomSpan) myRoomSpan.textContent = '-';
      if (myScenarioSpan) myScenarioSpan.textContent = '-';
loginDiv.style.display = 'none';
      roomsDiv.style.display = 'block';
      gameUI.style.display = 'none';
      roomsError.textContent = '';
      sendMessage({ type: 'listRooms' });

      applyRoleToUI();

      // ИНИЦИАЛИЗАЦИЯ МОДАЛКИ "ИНФА"
      if (window.InfoModal?.init) {
        window.InfoModal.init({
          sendMessage,
          getMyId: () => myId,
          getMyRole: () => myRole
        });
      }
    }

    if (msg.type === "error") {
      const text = String(msg.message || "Ошибка");
      // если мы ещё на экране логина
      if (loginDiv && loginDiv.style.display !== 'none') {
        loginError.textContent = text;
      } else if (roomsDiv && roomsDiv.style.display !== 'none') {
        roomsError.textContent = text;
      } else {
        // в игре — показываем как быстрое уведомление
        alert(text);
      }
    }

    // Сообщения лобби (например, "GM уже в комнате")
    if (msg.type === "roomsError") {
      const text = String(msg.message || "Ошибка");
      if (roomsError) roomsError.textContent = text;
    }

    if (msg.type === "users" && Array.isArray(msg.users)) {
      // Не пересоздаём Map целиком, чтобы не ломать порядок пользователей.
      // Порядок фиксируем по первому появлению пользователя.
      const incoming = new Set();
      msg.users.forEach((u) => {
        if (!u || !u.id) return;
        const uid = String(u.id);
        incoming.add(uid);

        // запоминаем "первый приход" навсегда, чтобы порядок не менялся
        if (!usersOrder.includes(uid)) {
          usersOrder.push(uid);
        }
        userMissingTicks.set(uid, 0);
        usersById.set(uid, { name: u.name, role: u.role });
      });

      // удаляем тех, кто вышел (с задержкой, чтобы не было "прыжков" из‑за кратких сбоев polling)
      // 1) из текущей Map — сразу
      Array.from(usersById.keys()).forEach((id) => {
        if (!incoming.has(String(id))) usersById.delete(id);
      });
      // 2) из порядка — только если отсутствует несколько опросов подряд
      (usersOrder || []).forEach((id) => {
        const sid = String(id);
        if (incoming.has(sid)) return;
        const n = (userMissingTicks.get(sid) || 0) + 1;
        userMissingTicks.set(sid, n);
      });
      const DROP_AFTER = 3; // 3 * 5s = 15s
      usersOrder = (usersOrder || []).filter((id) => {
        const sid = String(id);
        const n = userMissingTicks.get(sid) || 0;
        if (incoming.has(sid)) return true;
        if (n >= DROP_AFTER) {
          userMissingTicks.delete(sid);
          return false;
        }
        return true;
      });
      updatePlayerList();
    }

    if (msg.type === "diceEvent" && msg.event) {
      // NOTE(v4): dice are delivered to everyone via room_dice_events (diceRow).
      // diceEvent is used ONLY for instant local feedback (main dice panel).
      applyDiceEventToMain(msg.event);
    }

    // ===== Saved bases (персонажи, привязанные к userId) =====
    if (msg.type === "savedBasesList" && Array.isArray(msg.list)) {
      window.InfoModal?.onSavedBasesList?.(msg.list);
    }
    if (msg.type === "savedBaseSaved") {
      window.InfoModal?.onSavedBaseSaved?.(msg);
    }
    if (msg.type === "savedBaseApplied") {
      window.InfoModal?.onSavedBaseApplied?.(msg);
    }
    if (msg.type === "savedBaseDeleted") {
      window.InfoModal?.onSavedBaseDeleted?.(msg);
    }

    // ================== v4: LOG (append-only) ==================
    if (msg.type === 'logInit' && Array.isArray(msg.rows)) {
      if (!lastState) lastState = createInitialGameState();
      lastState.log = msg.rows.map(r => String(r?.text || '')).filter(Boolean);
      if (lastState.log.length > 200) lastState.log = lastState.log.slice(-200);
      renderLog(lastState.log);
    }
    if (msg.type === 'logRow' && msg.row) {
      if (!lastState) lastState = createInitialGameState();
      if (!Array.isArray(lastState.log)) lastState.log = [];
      const text = String(msg.row.text || '').trim();
      if (text) {
        lastState.log.push(text);
        if (lastState.log.length > 200) lastState.log.splice(0, lastState.log.length - 200);
        renderLog(lastState.log);
      }
    }

    // ================== v4: TOKENS (positions) ==================
    if (msg.type === 'tokensInit' && Array.isArray(msg.rows)) {
      try {
        msg.rows.forEach(r => applyTokenRowToLocalState(r));
      } catch {}
      // Repaint positions (safe)
      try {
        if (lastState) renderBoard(lastState);
      } catch {}

      // v4: positions come from room_tokens; fog must recompute when tokens snapshot is applied.
      try {
        window.FogWar?.onTokenPositionsChanged?.(lastState);
      } catch {}
    }
    if (msg.type === 'tokenRow' && msg.row) {
      try { applyTokenRowToLocalState(msg.row); } catch {}

      // If visibility changed (GM "eye" mirrored into room_tokens),
      // we must recompute the visible players set immediately.
      if (typeof msg.row.is_public !== 'undefined') {
        try {
          if (lastState && Array.isArray(lastState.players)) {
            const allPlayers = lastState.players;
            const visiblePlayers = allPlayers.filter(p => isPlayerVisibleToMe(p, lastState));
            const existingIds = new Set(visiblePlayers.map(p => String(p?.id)));

            // remove DOM for players that are no longer visible
            playerElements.forEach((el, id) => {
              if (!existingIds.has(String(id))) {
                try { el.remove(); } catch {}
                playerElements.delete(id);
              }
            });
            hpBarElements.forEach((bars, id) => {
              if (!existingIds.has(String(id))) {
                try { bars?.main?.remove?.(); } catch {}
                try { bars?.temp?.remove?.(); } catch {}
                hpBarElements.delete(id);
              }
            });

            players = visiblePlayers;
            renderBoard(lastState);
            updatePlayerList();
            window.InfoModal?.refresh?.(players);
          }
        } catch {}
      }

      // Lightweight DOM update (no full state overwrite)
      try {
        const pid = String(msg.row.token_id || '');
        const p = (players || []).find(pp => String(pp?.id) === pid);
        if (p) {
          const el = playerElements.get(pid);
          if (el) {
            setPlayerPosition(p);
            updateHpBar(p, el);
          }
        }
      } catch {}

      // v4: keep fog-of-war LOS synced to token movement.
      try {
        window.FogWar?.onTokenPositionsChanged?.(lastState);
      } catch {}
    }

    // ================== v4: DICE (append-only) ==================
    if (msg.type === 'diceInit' && Array.isArray(msg.rows)) {
      window._seenDiceIds = window._seenDiceIds || new Set();
      // we show them in "Броски других" as history (newest last)
      try {
        const rows = [...msg.rows].reverse();
        rows.forEach(r => {
          // skip own rolls in "Броски других" (main panel already shows them)
          if (typeof myId !== 'undefined' && String(r.from_id || '') === String(myId)) return;
          const rid = String(r.id || '');
          if (rid && window._seenDiceIds.has(rid)) return;
          if (rid) window._seenDiceIds.add(rid);
          const ev = {
            fromId: r.from_id || '',
            fromName: r.from_name || '',
            kindText: r.kind_text || '',
            sides: r.sides || null,
            count: r.count || null,
            bonus: r.bonus || 0,
            rolls: Array.isArray(r.rolls) ? r.rolls : [],
            total: r.total || null,
            crit: r.crit || ''
          };
          pushOtherDiceEvent?.(ev);
        });
      } catch {}
    }
    if (msg.type === 'diceRow' && msg.row) {
      window._seenDiceIds = window._seenDiceIds || new Set();
      try {
        const r = msg.row;
        // skip own rolls in "Броски других"
        if (typeof myId !== 'undefined' && String(r.from_id || '') === String(myId)) return;
        const rid = String(r.id || '');
        if (rid && window._seenDiceIds.has(rid)) return;
        if (rid) window._seenDiceIds.add(rid);
        const ev = {
          fromId: r.from_id || '',
          fromName: r.from_name || '',
          kindText: r.kind_text || '',
          sides: r.sides || null,
          count: r.count || null,
          bonus: r.bonus || 0,
          rolls: Array.isArray(r.rolls) ? r.rolls : [],
          total: r.total || null,
          crit: r.crit || ''
        };
        pushOtherDiceEvent?.(ev);
      } catch {}
    }

    if (msg.type === "init" || msg.type === "state") {
      // ===== Preserve volatile UI state across room_state snapshots (v4) =====
      // room_state no longer contains authoritative token positions or logs.
      // They arrive via dedicated tables (room_tokens / room_log).
      // If we blindly replace lastState with the room_state snapshot, we would:
      // - wipe the action log (state.log is intentionally empty)
      // - temporarily reset token positions to null until room_tokens catches up
      const prevLog = (lastState && Array.isArray(lastState.log)) ? [...lastState.log] : null;
      const prevPos = new Map();
      try {
        (lastState?.players || []).forEach(p => {
          if (!p || !p.id) return;
          prevPos.set(String(p.id), {
            x: (p.x === null || typeof p.x === 'undefined') ? null : Number(p.x),
            y: (p.y === null || typeof p.y === 'undefined') ? null : Number(p.y),
            size: Number(p.size) || 1,
            color: p.color || null,
            mapId: p.mapId || null
          });
        });
      } catch {}

      // нормализация состояния + поддержка нескольких карт кампании
      const normalized = loadMapToRoot(ensureStateHasMaps(deepClone(msg.state)), msg.state?.currentMapId);

      lastState = normalized;

      // restore append-only log from memory (room_log drives it)
      if (prevLog && (!Array.isArray(lastState.log) || lastState.log.length === 0)) {
        lastState.log = prevLog;
      }

      // restore last-known token positions to avoid "jump" on state updates.
      // room_tokens is authoritative for positions; room_state polling can be stale.
      try {
        (lastState.players || []).forEach(p => {
          if (!p || !p.id) return;
          const snap = prevPos.get(String(p.id));
          if (!snap) return;
          if (snap.x === null || Number.isFinite(snap.x)) p.x = snap.x;
          if (snap.y === null || Number.isFinite(snap.y)) p.y = snap.y;
          if (snap.size && Number.isFinite(Number(snap.size))) p.size = snap.size;
          if (snap.color) p.color = snap.color;
          if (snap.mapId) p.mapId = snap.mapId;
        });
      } catch {}
      boardWidth = normalized.boardWidth;
      boardHeight = normalized.boardHeight;

      // UI карт кампании (селект + подписи)
      try { updateCampaignMapsUI(normalized); } catch {}

      // обновим GM-инпуты (если controlbox подключен)
      try { window.ControlBox?.refreshGmInputsFromState?.(); } catch {}

      // Apply visibility rules (GM-only ally, GM NPC visibility, per-map list scoping)
      const allPlayers = Array.isArray(normalized.players) ? normalized.players : [];
      const visiblePlayers = allPlayers.filter(p => isPlayerVisibleToMe(p, normalized));

      // Удаляем DOM-элементы игроков, которых больше нет (или скрыты правилами видимости)
      const existingIds = new Set(visiblePlayers.map(p => p.id));
      playerElements.forEach((el, id) => {
        if (!existingIds.has(id)) {
          el.remove();
          playerElements.delete(id);
          // очищаем last-known кэш для всех карт (ключи вида "<mapId>:<playerId>")
          try {
            const pid = String(id);
            const m = window._fogLastKnown;
            if (m && typeof m.forEach === 'function') {
              const toDel = [];
              m.forEach((_, k) => {
                if (String(k).endsWith(`:${pid}`)) toDel.push(k);
              });
              toDel.forEach(k => { try { m.delete(k); } catch {} });
            } else {
              window._fogLastKnown?.delete?.(String(id));
            }
          } catch {}
        }
      });

      hpBarElements.forEach((bars, id) => {
        if (!existingIds.has(id)) {
          try { bars?.main?.remove?.(); } catch {}
          try { bars?.temp?.remove?.(); } catch {}
          hpBarElements.delete(id);
        }
      });

      players = visiblePlayers;

      // Основа одна на пользователя — блокируем чекбокс
      if (isBaseCheckbox) {
        const baseExistsForMe = players.some(p => p.isBase && p.ownerId === myId);
        isBaseCheckbox.disabled = baseExistsForMe;
        if (baseExistsForMe) isBaseCheckbox.checked = false;
      }

      if (selectedPlayer && !existingIds.has(selectedPlayer.id)) {
        selectedPlayer = null;
      }

      renderBoard(normalized);
      updatePhaseUI(normalized);
      updatePlayerList();
      updateCurrentPlayer(normalized);
      renderTurnOrderBox(normalized);

      // v4: log is append-only in room_log.
      // Do NOT clear the UI log on every room_state snapshot update.
      if (lastState && Array.isArray(lastState.log) && lastState.log.length) {
        renderLog(lastState.log);
      }

      // если "Инфа" открыта — обновляем ее по свежему state
      window.InfoModal?.refresh?.(players);
    }
}

/*
startInitiativeBtn?.addEventListener("click", () => {
  if (!isGM()) return;
  sendMessage({ type: "startInitiative" });
});


*/
/*
startExplorationBtn?.addEventListener("click", () => {
  if (!isGM()) return;
  sendMessage({ type: "startExploration" });
});


*/
/*
startCombatBtn?.addEventListener("click", () => {
  if (!isGM()) return;
  sendMessage({ type: "startCombat" });
});


*/
nextTurnBtn?.addEventListener("click", () => {
  // "Конец хода" — перейти к следующему по инициативе
  sendMessage({ type: "endTurn" });
});

// ================== ROLE UI ==================
function setupRoleUI(role) {
  const r = normalizeRoleForUi(role);
  const gm = (r === "GM");
  const spectator = (r === "Spectator");

  // всегда применяем основную логику ГМ/не-ГМ
  applyRoleToUI();

  // Наблюдатель — прячем активные элементы управления
  if (spectator) {
    if (addPlayerBtn) addPlayerBtn.style.display = 'none';
    if (rollBtn) rollBtn.style.display = 'none';
    if (endTurnBtn) endTurnBtn.style.display = 'none';
    if (rollInitiativeBtn) rollInitiativeBtn.style.display = 'none';
    if (createBoardBtn) createBoardBtn.style.display = 'none';
    if (resetGameBtn) resetGameBtn.style.display = 'none';
    if (clearBoardBtn) clearBoardBtn.style.display = 'none';
    if (nextTurnBtn) nextTurnBtn.style.display = 'none';
  } else {
    // остальные — показываем (глобальные disabled уже выставлены в applyRoleToUI)
    if (addPlayerBtn) addPlayerBtn.style.display = '';
    if (rollBtn) rollBtn.style.display = '';
    if (endTurnBtn) endTurnBtn.style.display = '';
    if (rollInitiativeBtn) rollInitiativeBtn.style.display = '';
    if (createBoardBtn) createBoardBtn.style.display = '';
    if (resetGameBtn) resetGameBtn.style.display = '';
    if (clearBoardBtn) clearBoardBtn.style.display = '';
    if (nextTurnBtn) nextTurnBtn.style.display = '';
  }
}

//
// ================== LOG ==================
function renderLog(logs) {
  const wasNearBottom =
    (logList.scrollTop + logList.clientHeight) >= (logList.scrollHeight - 30);

  logList.innerHTML = '';
  logs.slice(-50).forEach(line => {
    const li = document.createElement('li');
    li.textContent = line;
    logList.appendChild(li);
  });

  if (wasNearBottom) {
    logList.scrollTop = logList.scrollHeight;
  }
}

// ================== CURRENT PLAYER ==================
function updateCurrentPlayer(state) {
  const inCombat = (state && state.phase === 'combat');

  // по умолчанию
  if (nextTurnBtn) {
    nextTurnBtn.style.display = inCombat ? 'inline-block' : 'none';
    nextTurnBtn.disabled = true;
    nextTurnBtn.classList.remove('is-active');
  }

  if (!inCombat || !state || !state.turnOrder || state.turnOrder.length === 0) {
    currentPlayerSpan.textContent = '-';
    highlightCurrentTurn(null);
    return;
  }

  const id = state.turnOrder[state.currentTurnIndex];
  const p = players.find(pl => pl.id === id);
  currentPlayerSpan.textContent = p ? p.name : '-';

  highlightCurrentTurn(id);

  // кнопку "Следующий ход" может нажимать GM или владелец текущего персонажа
  if (nextTurnBtn) {
    const canNext = (myRole === 'GM') || (p && p.ownerId === myId);
    nextTurnBtn.disabled = !canNext;
    if (canNext) nextTurnBtn.classList.add('is-active');
  }
}

// ================== TURN ORDER BOX ==================
function renderTurnOrderBox(state) {
  if (!turnOrderBox || !turnOrderList) return;
  const phase = String(state?.phase || "");
  const show = (phase === "initiative" || phase === "combat");
  turnOrderBox.style.display = show ? '' : 'none';
  if (!show) return;

  const round = Number(state?.round) || 1;
  if (turnOrderRound) turnOrderRound.textContent = String(round);

  // Use already-filtered players[] so hidden GM NPCs do not appear for other users.
  const stPlayers = Array.isArray(players) ? players : (Array.isArray(state?.players) ? state.players : []);

  const isGM = (String(myRole || '') === 'GM');

  // Helper: stable sort by initiative (desc), then name
  const sortByInit = (arr) => (arr || []).slice().sort((a, b) => {
    const ai = Number(a?.initiative) || 0;
    const bi = Number(b?.initiative) || 0;
    if (bi !== ai) return bi - ai;
    return String(a?.name || '').localeCompare(String(b?.name || ''));
  });

  const combatants = stPlayers.filter(p => p && p.inCombat);
  const nonCombatants = stPlayers.filter(p => p && !p.inCombat);

  let orderedCombatants = [];
  if (phase === "combat" && Array.isArray(state?.turnOrder) && state.turnOrder.length) {
    orderedCombatants = state.turnOrder
      .map(id => combatants.find(p => p && String(p.id) === String(id)))
      .filter(Boolean);
  } else {
    // In initiative phase show "live" order for selected combatants
    const rolled = combatants.filter(p => p && p.hasRolledInitiative);
    const pending = combatants.filter(p => p && !p.hasRolledInitiative);
    orderedCombatants = [...sortByInit(rolled), ...sortByInit(pending)];
  }

  const currentId = (phase === "combat" && Array.isArray(state?.turnOrder) && state.turnOrder.length)
    ? state.turnOrder[state.currentTurnIndex]
    : null;

  const renderRow = (p, { isInCombatList }) => {
    const li = document.createElement('li');
    li.className = 'turn-order-item';
    if (currentId && String(p.id) === String(currentId)) li.classList.add('is-current');
    if (isInCombatList && !p.hasRolledInitiative) li.classList.add('is-pending');
    if (!isInCombatList) li.style.opacity = '0.55';

    const left = document.createElement('span');
    left.textContent = String(p.name || '-');
    left.style.display = 'inline-flex';
    left.style.alignItems = 'center';
    left.style.gap = '6px';

    const dot = document.createElement('span');
    dot.style.width = '10px';
    dot.style.height = '10px';
    dot.style.borderRadius = '999px';
    dot.style.background = String(p.color || '#888');
    dot.style.border = '1px solid rgba(255,255,255,0.25)';
    left.prepend(dot);

    // GM: checkbox "В бою"
    if (isGM) {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!p.inCombat;
      cb.title = 'Участник боя';
      cb.style.marginRight = '6px';
      cb.addEventListener('click', (e) => e.stopPropagation());
      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        sendMessage({ type: 'setPlayerInCombat', id: p.id, inCombat: !!cb.checked });
      });
      left.prepend(cb);
    }

    const right = document.createElement('span');
    const iv = (p.initiative !== null && p.initiative !== undefined) ? p.initiative : null;
    right.textContent = (p.hasRolledInitiative && Number.isFinite(Number(iv))) ? String(iv) : '—';
    right.style.opacity = '0.9';

    // GM: quick roll buttons for selected combatants that haven't rolled yet
    if (isGM && p.inCombat && !p.hasRolledInitiative) {
      const wrap = document.createElement('span');
      wrap.style.display = 'inline-flex';
      wrap.style.alignItems = 'center';
      wrap.style.gap = '6px';

      const btnRoll = document.createElement('button');
      btnRoll.type = 'button';
      btnRoll.className = 'mini-action-btn';
      btnRoll.textContent = '🎲';
      btnRoll.title = 'GM бросить инициативу за персонажа';
      btnRoll.addEventListener('click', (e) => {
        e.stopPropagation();
        sendMessage({ type: 'gmRollInitiativeFor', id: p.id, choice: 'roll' });
      });

      const btnBase = document.createElement('button');
      btnBase.type = 'button';
      btnBase.className = 'mini-action-btn';
      btnBase.textContent = '👤';
      btnBase.title = 'GM: инициатива основы';
      btnBase.disabled = !!p.isBase;
      btnBase.addEventListener('click', (e) => {
        e.stopPropagation();
        sendMessage({ type: 'gmRollInitiativeFor', id: p.id, choice: 'base' });
      });

      wrap.appendChild(btnRoll);
      wrap.appendChild(btnBase);
      right.textContent = '';
      right.appendChild(wrap);
    }

    li.appendChild(left);
    li.appendChild(right);
    return li;
  };

  turnOrderList.innerHTML = '';

  // Header controls (GM): select all / none / only on board
  if (isGM) {
    const controlsLi = document.createElement('li');
    controlsLi.className = 'turn-order-item';
    controlsLi.style.justifyContent = 'flex-start';
    controlsLi.style.gap = '8px';
    controlsLi.style.padding = '6px 8px';
    controlsLi.style.opacity = '1';

    const mkBtn = (txt, title, onClick) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mini-action-btn';
      b.textContent = txt;
      b.title = title;
      b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
      return b;
    };

    const btnAll = mkBtn('Все', 'Включить всех в бой', () => {
      stPlayers.forEach(p => sendMessage({ type: 'setPlayerInCombat', id: p.id, inCombat: true }));
    });
    const btnNone = mkBtn('Никто', 'Исключить всех из боя', () => {
      stPlayers.forEach(p => sendMessage({ type: 'setPlayerInCombat', id: p.id, inCombat: false }));
    });
    const btnOnBoard = mkBtn('На поле', 'В бою только те, кто стоит на поле', () => {
      stPlayers.forEach(p => {
        const placed = (p && p.x !== null && p.y !== null);
        sendMessage({ type: 'setPlayerInCombat', id: p.id, inCombat: !!placed });
      });
    });

    controlsLi.appendChild(btnAll);
    controlsLi.appendChild(btnNone);
    controlsLi.appendChild(btnOnBoard);
    turnOrderList.appendChild(controlsLi);
  }

  // Combatants
  orderedCombatants.forEach(p => {
    turnOrderList.appendChild(renderRow(p, { isInCombatList: true }));
  });

  // Non-combatants (collapsed style)
  if (nonCombatants.length) {
    const sep = document.createElement('li');
    sep.className = 'turn-order-item';
    sep.style.justifyContent = 'flex-start';
    sep.style.opacity = '0.7';
    sep.style.fontSize = '12px';
    sep.textContent = 'Не в бою';
    turnOrderList.appendChild(sep);
    sortByInit(nonCombatants).forEach(p => {
      turnOrderList.appendChild(renderRow(p, { isInCombatList: false }));
    });
  }
}

function highlightCurrentTurn(playerId) {
  playerElements.forEach((el) => el.classList.remove('current-turn'));
  if (!playerId) return;
  const el = playerElements.get(playerId);
  if (el) el.classList.add('current-turn');
}

// ================== PLAYER LIST ==================
function roleToLabel(role) {
  const r = normalizeRoleForUi(role);
  if (r === "GM") return "GM";
  if (r === "DnD-Player") return "DnD-P";
  if (r === "Spectator") return "Spectator";
  return "-";
}

function roleToClass(role) {
  const r = normalizeRoleForUi(role);
  if (r === "GM") return "role-gm";
  if (r === "DnD-Player") return "role-player";
  if (r === "Spectator") return "role-spectator";
  return "role-unknown";
}

// ===== Tabs state for "Пользователи и персонажи" =====
let playerListView = (window.PLAYER_LIST_VIEW === 'others') ? 'others' : 'mine';
window.PLAYER_LIST_VIEW = playerListView;

function applyPlayerListTabUI() {
  try {
    const mineBtn = document.getElementById('player-tab-mine');
    const othersBtn = document.getElementById('player-tab-others');
    if (mineBtn) {
      mineBtn.classList.toggle('active', playerListView === 'mine');
      mineBtn.setAttribute('aria-selected', playerListView === 'mine' ? 'true' : 'false');
    }
    if (othersBtn) {
      othersBtn.classList.toggle('active', playerListView === 'others');
      othersBtn.setAttribute('aria-selected', playerListView === 'others' ? 'true' : 'false');
    }
  } catch {}
}

window.setPlayerListView = (view) => {
  playerListView = (view === 'others') ? 'others' : 'mine';
  window.PLAYER_LIST_VIEW = playerListView;
  applyPlayerListTabUI();
  updatePlayerList();
};
window.getPlayerListView = () => playerListView;

function updatePlayerList() {
  if (!playerList) return;

  // Ensure the current user is shown immediately after joining a room,
  // even before the first users polling snapshot arrives.
  try {
    const myIdStr = (typeof myId !== 'undefined' && myId !== null) ? String(myId) : '';
    if (myIdStr) {
      if (!usersById.has(myIdStr)) {
        const name = (typeof safeGetUserName === 'function')
          ? safeGetUserName()
          : (String(myNameSpan?.textContent || '').replace(/^\s*Вы:\s*/i, '').trim() || 'Player');
        const role = (typeof safeGetUserRoleDb === 'function') ? safeGetUserRoleDb() : (String(myRole || 'Player'));
        usersById.set(myIdStr, { name, role });
      }
      if (!Array.isArray(usersOrder)) usersOrder = [];
      if (!usersOrder.includes(myIdStr)) usersOrder.push(myIdStr);
    }
  } catch {}

  // sync from global (in case dom-and-setup changed it before this file loaded)
  playerListView = (window.PLAYER_LIST_VIEW === 'others') ? 'others' : 'mine';
  applyPlayerListTabUI();
  playerList.innerHTML = '';

  const currentTurnId = (lastState && lastState.phase === 'combat' && Array.isArray(lastState.turnOrder) && lastState.turnOrder.length)
    ? lastState.turnOrder[lastState.currentTurnIndex]
    : null;

  // Стабильный порядок пользователей:
  // 1) GM всегда сверху
  // 2) затем DnD-P (Player)
  // 3) затем Spectator
  // 4) внутри каждой группы — по времени первого подключения (usersOrder)
  const gmIds = [];
  const playerIds = [];
  const spectrIds = [];
  const otherIds = [];

  (usersOrder || []).forEach((ownerId) => {
    const u = usersById.get(String(ownerId));
    if (!u) return; // сейчас не подключён
    const r = normalizeRoleForUi(u.role);
    if (r === 'GM') gmIds.push(String(ownerId));
    else if (r === 'DnD-Player') playerIds.push(String(ownerId));
    else if (r === 'Spectator') spectrIds.push(String(ownerId));
    else otherIds.push(String(ownerId));
  });
  let orderedOwnerIds = [...gmIds, ...playerIds, ...spectrIds, ...otherIds];

  // ===== Filter: mine / others =====
  const myIdStr = (typeof myId !== 'undefined' && myId !== null) ? String(myId) : '';
  if (playerListView === 'mine') {
    orderedOwnerIds = myIdStr ? [myIdStr] : [];
  } else {
    orderedOwnerIds = orderedOwnerIds.filter((oid) => String(oid) !== myIdStr);
  }

  // Группируем в Map, чтобы порядок не "прыгал"
  const grouped = new Map(); // ownerId -> { ownerName, players: [] }

  // Сначала создаём группы по пользователям (даже если у них ещё нет персонажей)
  orderedOwnerIds.forEach((ownerId) => {
    const u = usersById.get(String(ownerId));
    grouped.set(String(ownerId), {
      ownerName: (u && u.name) ? u.name : 'Unknown',
      players: []
    });
  });

  // Добавляем персонажей в соответствующие группы
  players.forEach((p) => {
    // if view is filtered, skip non-matching players
    if (playerListView === 'mine') {
      if (String(p.ownerId || '') !== myIdStr) return;
    } else {
      if (String(p.ownerId || '') === myIdStr) return;
    }
    const oid = String(p.ownerId || '');
    if (!grouped.has(oid)) {
      // на случай старых данных/неизвестного владельца — добавляем в конец
      grouped.set(oid, { ownerName: p.ownerName || 'Unknown', players: [] });
    }
    grouped.get(oid).players.push(p);
  });

  Array.from(grouped.entries()).forEach(([ownerId, group]) => {
    const userInfo = ownerId ? usersById.get(ownerId) : null;

    const ownerLi = document.createElement('li');
    ownerLi.className = 'owner-group';

    const ownerHeader = document.createElement('div');
    ownerHeader.className = 'owner-header';

    const ownerNameSpan = document.createElement('span');
    ownerNameSpan.className = 'owner-name';
    ownerNameSpan.textContent = userInfo?.name || group.ownerName;
    ownerNameSpan.title = ownerNameSpan.textContent;

    const role = userInfo?.role;
    const badge = document.createElement('span');
    badge.className = `role-badge ${roleToClass(role)}`;
    badge.textContent = `(${roleToLabel(role)})`;

    ownerHeader.appendChild(ownerNameSpan);
    ownerHeader.appendChild(badge);

    const ul = document.createElement('ul');
    ul.className = 'owner-players';

    if (!group.players || group.players.length === 0) {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'player-list-item';
      const text = document.createElement('span');
      text.classList.add('player-name-text');
      text.textContent = 'Персонажей нет';
      emptyLi.appendChild(text);
      ul.appendChild(emptyLi);
    }

    // Visibility is already applied at the state level (players array contains only visible tokens).
    const listPlayers = group.players;

    listPlayers.forEach(p => {
      const li = document.createElement('li');
      li.className = 'player-list-item';

      if (currentTurnId && p.id === currentTurnId) {
        li.classList.add('is-current-turn');
      }

      const indicator = document.createElement('span');
      indicator.classList.add('placement-indicator');
      const placed = (p.x !== null && p.y !== null);
      indicator.classList.add(placed ? 'placed' : 'not-placed');

      const text = document.createElement('span');
      text.classList.add('player-name-text');
      const initVal = (p.initiative !== null && p.initiative !== undefined) ? p.initiative : 0;
      text.textContent = `${p.name} (${initVal})`;
      text.title = p.name;

      const nameWrap = document.createElement('div');
      nameWrap.classList.add('player-name-wrap');
      nameWrap.appendChild(indicator);
      nameWrap.appendChild(text);

      if (p.isBase) {
        const baseBadge = document.createElement('span');
        baseBadge.className = 'base-badge';
        baseBadge.textContent = 'основа';
        nameWrap.appendChild(baseBadge);
      }

      if (p.isAlly) {
        const allyBadge = document.createElement('span');
        allyBadge.className = 'ally-badge';
        allyBadge.textContent = 'союзник';
        nameWrap.appendChild(allyBadge);
      }

      // GM visibility "eye" for GM-created non-allies (default hidden for others)
      const ownerRole = getOwnerRoleForPlayerUI(p);
      // GM visibility "eye" for GM-created non-allies.
      // Requested: also show for "Основа" when it is NOT союзник.
      if (myRole === 'GM' && ownerRole === 'GM' && !p.isAlly) {
        const eyeBtn = document.createElement('button');
        eyeBtn.type = 'button';
        eyeBtn.className = 'eye-btn';
        const isOpen = !!p.isPublic;
        eyeBtn.setAttribute('aria-pressed', isOpen ? 'true' : 'false');
        eyeBtn.title = isOpen ? 'Видно игрокам' : 'Скрыто от игроков';
        eyeBtn.textContent = isOpen ? '👁' : '🙈';
        eyeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const next = !p.isPublic;
          // optimistic
          p.isPublic = next;
          sendMessage({ type: 'setPlayerPublic', id: p.id, isPublic: next });
          updatePlayerList();
        });
        nameWrap.appendChild(eyeBtn);
      }

      li.appendChild(nameWrap);

      const actions = document.createElement('div');
      actions.className = 'player-actions';

      // ===== Верхняя кнопка "Лист персонажа" (на всю ширину карточки) =====
      const topActions = document.createElement('div');
      topActions.className = 'player-actions-top';
      if (!p.isMonster) {
        if (canViewSensitiveInfo(p)) {
          const sheetBtn = document.createElement('button');
          sheetBtn.textContent = 'Лист персонажа';
          sheetBtn.className = 'sheet-btn';
          sheetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.InfoModal?.open?.(p);
          });
          topActions.appendChild(sheetBtn);
        }
      }
      actions.appendChild(topActions);

      // ===== Выбор инициативы для участника боя (в инициативе или позднее в бою) =====
      const phaseNow = String(lastState?.phase || '');
      const canPickInit = (phaseNow === 'initiative' || phaseNow === 'combat');
      if (lastState && canPickInit && p.inCombat && !p.hasRolledInitiative && (myRole === 'GM' || p.ownerId === myId)) {
        const box = document.createElement('div');
        box.className = 'init-choice-box';

        const rollInitBtn = document.createElement('button');
        rollInitBtn.className = 'init-choice-btn';
        rollInitBtn.textContent = 'Бросить инициативу';
        rollInitBtn.classList.add('mini-action-btn');
        rollInitBtn.title = 'd20 + модификатор Ловкости';
        rollInitBtn.onclick = (e) => {
          e.stopPropagation();
          sendMessage({ type: 'combatInitChoice', id: p.id, choice: 'roll' });
        };

        const baseInitBtn = document.createElement('button');
        baseInitBtn.className = 'init-choice-btn';
        baseInitBtn.textContent = 'Инициатива основы';
        baseInitBtn.classList.add('mini-action-btn');
        baseInitBtn.title = 'Взять инициативу из персонажа "основа" владельца';
        baseInitBtn.disabled = !!p.isBase;
        baseInitBtn.onclick = (e) => {
          e.stopPropagation();
          sendMessage({ type: 'combatInitChoice', id: p.id, choice: 'base' });
        };

        box.appendChild(rollInitBtn);
        box.appendChild(baseInitBtn);
        actions.appendChild(box);
      }

      // ===== Ряд управления: размер + цвет + быстрые кнопки =====
      const midRow = document.createElement('div');
      midRow.className = 'player-actions-row player-actions-row--controls';

      if (myRole === "GM" || p.ownerId === myId) {
        // размер
        const sizeSelect = document.createElement('select');
        sizeSelect.className = 'size-select';
        for (let s = 1; s <= 5; s++) {
          const opt = document.createElement('option');
          opt.value = String(s);
          opt.textContent = `${s}x${s}`;
          if (s === p.size) opt.selected = true;
          sizeSelect.appendChild(opt);
        }
        sizeSelect.addEventListener('click', (e) => e.stopPropagation());
        sizeSelect.addEventListener('change', (e) => {
          e.stopPropagation();
          sendMessage({ type: 'updatePlayerSize', id: p.id, size: parseInt(sizeSelect.value, 10) });
        });
        midRow.appendChild(sizeSelect);

        // цвет
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.className = 'player-color-input';
        colorInput.value = String(p.color || '#ff0000');
        colorInput.addEventListener('click', (e) => e.stopPropagation());
        colorInput.addEventListener('change', (e) => {
          e.stopPropagation();
          sendMessage({ type: 'updatePlayerColor', id: p.id, color: colorInput.value });
        });
        midRow.appendChild(colorInput);
      }
      // Быстрые кнопки: "С поля" / "Удалить" — в один ряд с размером/цветом
      if (myRole === "GM" || p.ownerId === myId) {
        const removeFromBoardBtn = document.createElement('button');
        removeFromBoardBtn.textContent = 'С поля';
        removeFromBoardBtn.classList.add('mini-action-btn','mini-action-btn--secondary');
        removeFromBoardBtn.onclick = (e) => {
          e.stopPropagation();
          sendMessage({ type: 'removePlayerFromBoard', id: p.id });
        };

        const removeCompletelyBtn = document.createElement('button');
        removeCompletelyBtn.textContent = 'Удалить';
        removeCompletelyBtn.classList.add('mini-action-btn','mini-action-btn--danger');
        removeCompletelyBtn.onclick = (e) => {
          e.stopPropagation();
          sendMessage({ type: 'removePlayerCompletely', id: p.id });
        };

        const spacer = document.createElement('span');
        spacer.className = 'player-actions-spacer';
        midRow.appendChild(spacer);
        midRow.appendChild(removeFromBoardBtn);
        midRow.appendChild(removeCompletelyBtn);
      }

      actions.appendChild(midRow);

      li.addEventListener('click', () => {
        selectedPlayer = p;
        if (p.x === null || p.y === null) {
          const size = Number(p.size) || 1;
          const spot = findFirstFreeSpotClient(size);
          if (!spot) {
            alert("Нет свободных клеток для размещения персонажа");
            return;
          }
          sendMessage({ type: 'movePlayer', id: p.id, x: spot.x, y: spot.y });
        }
      });

      // Нижний ряд больше не нужен — кнопки перенесены в ряд управления

      li.appendChild(actions);
      ul.appendChild(li);
    });

    ownerLi.appendChild(ownerHeader);
    ownerLi.appendChild(ul);
    playerList.appendChild(ownerLi);
  });
}

// ================== UI PERMISSIONS HELPERS ==================
function getOwnerRoleForPlayerUI(p) {
  const direct = String(p?.ownerRole || '').trim();
  if (direct) return direct;
  const u = p?.ownerId ? usersById.get(String(p.ownerId)) : null;
  return String(u?.role || '').trim();
}

// "Sensitive" = sheet modal, HP, dblclick mini.
// We keep existing behavior for non-GM-owned characters, but restrict GM-created public NPCs.
function canViewSensitiveInfo(p) {
  if (!p) return false;
  if (myRole === 'GM') return true;
  if (String(p.ownerId || '') === String(myId || '')) return true;
  if (p.isAlly) return true;
  const ownerRole = getOwnerRoleForPlayerUI(p);
  if (ownerRole === 'GM') return false;
  return true;
}

