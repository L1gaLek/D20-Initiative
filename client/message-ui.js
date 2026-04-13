// ================== MESSAGE HANDLER (used by Supabase subscriptions) ==================
function makeDiceDedupKey(ev) {
  try {
    const rolls = Array.isArray(ev?.rolls) ? ev.rolls.map(n => Number(n) || 0).join(',') : '';
    return [
      String(ev?.fromId || ''),
      String(ev?.fromName || ''),
      String(ev?.kindText || ''),
      String(ev?.sides ?? ''),
      String(ev?.count ?? ''),
      String(Number(ev?.bonus) || 0),
      rolls,
      String(ev?.total ?? ''),
      String(ev?.crit || '')
    ].join('|');
  } catch {
    return '';
  }
}

function shouldSkipDuplicateOtherDice(ev, explicitId) {
  try {
    const now = Date.now();
    const ttlMs = 1500;
    window._recentOtherDiceKeys = window._recentOtherDiceKeys || new Map();
    const recent = window._recentOtherDiceKeys;

    for (const [k, ts] of recent.entries()) {
      if ((now - Number(ts || 0)) > ttlMs) recent.delete(k);
    }

    const idKey = explicitId ? `id:${String(explicitId)}` : '';
    const sigKey = `sig:${makeDiceDedupKey(ev)}`;
    if (idKey && recent.has(idKey)) return true;
    if (sigKey && recent.has(sigKey)) return true;
    if (idKey) recent.set(idKey, now);
    if (sigKey) recent.set(sigKey, now);
    return false;
  } catch {
    return false;
  }
}

function syncUsersSnapshot(users) {
  const incoming = new Set();
  (Array.isArray(users) ? users : []).forEach((u) => {
    if (!u || !u.id) return;
    const uid = String(u.id);
    incoming.add(uid);
    if (!usersOrder.includes(uid)) usersOrder.push(uid);
    userMissingTicks.set(uid, 0);
    usersById.set(uid, { name: u.name, role: u.role });
  });

  Array.from(usersById.keys()).forEach((id) => {
    if (!incoming.has(String(id))) usersById.delete(id);
  });

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
}

function refreshUsersUi() {
  updatePlayerList();
  try { window.RoomChat?.refreshUsers?.(); } catch {}
  try { window.TavernChat?.refreshUsers?.(); } catch {}
}

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
  const pidMap = String(p?.mapId || '').trim();
  const isEnemy = !!p.isEnemy;

  if (myRole === 'GM') {
    const gmView = String(state?.fog?.gmViewMode || 'gm');
    if (gmView !== 'player') {
      if (isEnemy && pidMap && curMapId && pidMap !== curMapId) return false;
      return true;
    }
  }

  if (ownerRole === 'GM' && !p.isAlly) {
    const pub = !!p.isPublic;
    if (!pub) return false;
  }

  if (isEnemy && pidMap && curMapId && pidMap !== curMapId) return false;
  return true;
}

let __mapTokensReloadSeq = 0;
const __combatPlacementReady = new Set(); // playerId, local marker for "created during combat, should be placed once"

function isMapScopedPlayerForUi(player) {
  return !!(player && player.isEnemy && !player.isBase);
}

function canCurrentUserMovePlayerNow(player, { forInitialPlacement = false } = {}) {
  try {
    if (!player || !player.id) return false;
    if (String(myRole || '') === 'GM') return true;
    const mine = String(player?.ownerId || '') === String(myId || '');
    if (!mine) return false;
    const phaseNow = String(lastState?.phase || '');
    if (phaseNow !== 'combat') return true;
    const currentId = String(lastState?.turnOrder?.[lastState?.currentTurnIndex] || '');
    const isCurrent = String(player.id) === currentId;
    if (isCurrent) return true;
    if (!forInitialPlacement) return false;
    const unplaced = (player.x === null || typeof player.x === 'undefined' || player.y === null || typeof player.y === 'undefined');
    return unplaced;
  } catch {
    return false;
  }
}

function rememberCombatPlacementCandidates(prevIds, stateLike) {
  const st = stateLike && typeof stateLike === 'object' ? stateLike : null;
  const list = Array.isArray(st?.players) ? st.players : [];
  const nowIds = new Set();
  list.forEach((p) => {
    const pid = String(p?.id || '').trim();
    if (!pid) return;
    nowIds.add(pid);
    const isNew = !prevIds.has(pid);
    const createdInCombat = String(st?.phase || '') === 'combat';
    const mine = String(p?.ownerId || '') === String(myId || '');
    const isGmNow = String(myRole || '') === 'GM';
    const unplaced = (p?.x === null || typeof p?.x === 'undefined' || p?.y === null || typeof p?.y === 'undefined');
    if (isNew && createdInCombat && mine && !isGmNow && unplaced) __combatPlacementReady.add(pid);
    if (!unplaced) __combatPlacementReady.delete(pid);
  });
  Array.from(__combatPlacementReady).forEach((pid) => {
    if (!nowIds.has(pid)) __combatPlacementReady.delete(pid);
  });
  if (String(st?.phase || '') !== 'combat') __combatPlacementReady.clear();
}

window.canCurrentUserMovePlayerNow = canCurrentUserMovePlayerNow;
window.isCombatPlacementPendingForPlayer = (playerOrId) => {
  const pid = (typeof playerOrId === 'object')
    ? String(playerOrId?.id || '').trim()
    : String(playerOrId || '').trim();
  if (!pid) return false;
  return __combatPlacementReady.has(pid);
};
window.consumeCombatPlacementForPlayer = (playerOrId) => {
  const pid = (typeof playerOrId === 'object')
    ? String(playerOrId?.id || '').trim()
    : String(playerOrId || '').trim();
  if (!pid) return;
  __combatPlacementReady.delete(pid);
};

const __pendingCombatSelectionOverlay = new Map(); // playerId -> { inCombat, updatedAt }

function rememberPendingCombatSelection(playerId, inCombat) {
  const pid = String(playerId || '').trim();
  if (!pid) return;
  __pendingCombatSelectionOverlay.set(pid, {
    inCombat: !!inCombat,
    updatedAt: Date.now()
  });
}

function applyPendingCombatSelectionOverlay(stateLike) {
  const st = stateLike && typeof stateLike === 'object' ? stateLike : null;
  if (!st || !Array.isArray(st.players) || __pendingCombatSelectionOverlay.size === 0) return st;
  const now = Date.now();
  st.players.forEach((p) => {
    if (!p || !p.id) return;
    const pid = String(p.id);
    const ov = __pendingCombatSelectionOverlay.get(pid);
    if (!ov) return;
    if ((now - Number(ov.updatedAt || 0)) > 8000) {
      __pendingCombatSelectionOverlay.delete(pid);
      return;
    }
    if (!!p.inCombat === !!ov.inCombat) {
      __pendingCombatSelectionOverlay.delete(pid);
      return;
    }
    p.inCombat = !!ov.inCombat;
    if (!p.inCombat) {
      p.pendingInitiativeChoice = false;
      p.willJoinNextRound = false;
    }
  });
  return st;
}

function syncVisiblePlayersState(state) {
  const normalized = state || lastState || null;
  const allPlayers = Array.isArray(normalized?.players) ? normalized.players : [];
  const visiblePlayers = allPlayers.filter(p => isPlayerVisibleToMe(p, normalized));
  const existingIds = new Set(visiblePlayers.map(p => String(p?.id || '')));

  playerElements.forEach((el, id) => {
    if (!existingIds.has(String(id))) {
      try { el.remove(); } catch {}
      playerElements.delete(id);
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
          window._fogLastKnown?.delete?.(pid);
        }
      } catch {}
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

  if (isBaseCheckbox) {
    const baseExistsForMe = players.some(p => p.isBase && p.ownerId === myId);
    isBaseCheckbox.disabled = baseExistsForMe;
    if (baseExistsForMe) isBaseCheckbox.checked = false;
  }

  if (selectedPlayer && !existingIds.has(String(selectedPlayer.id || ''))) {
    selectedPlayer = null;
  }

  return { visiblePlayers, existingIds };
}

function getCellFeetValue(state) {
  return Math.max(1, Math.min(100, Number(state?.cellFeet) || 10));
}

function updateCellFeetUi(state) {
  const value = getCellFeetValue(state);
  const gmInput = document.getElementById('cell-feet-gm');
  if (gmInput && document.activeElement !== gmInput) gmInput.value = String(value);
  const playerValue = document.getElementById('cell-feet-player-value');
  if (playerValue) playerValue.textContent = String(value);
}

function handleMessage(msg) {

// ===== Rooms lobby messages =====
try { handleLobbyRoomMessage?.(msg); } catch {}
try { handleSessionUiMessage?.(msg); } catch {}

    if (msg.type === 'moderationEvent') {
      if (handleOwnModerationEvent(msg.event || msg)) return;
    }

    if (msg.type === "users" && Array.isArray(msg.users)) {
      syncUsersSnapshot(msg.users);
      refreshUsersUi();
    }

    if (msg.type === "diceEvent" && msg.event) {
      const fromId = String(msg?.event?.fromId || '');
      if (fromId && String(fromId) !== String(myId || '')) {
        try {
          if (!shouldSkipDuplicateOtherDice(msg.event, msg?.event?.id || msg?.event?.localNonce || '')) {
            pushOtherDiceEvent?.(msg.event);
          }
        } catch {}
      } else {
        applyDiceEventToMain(msg.event);
      }
    }

    if (msg.type === 'initiativeReset') {
      try { window.clearPendingInitiativeOverlay?.(currentRoomId); } catch {}
      if (lastState && Array.isArray(lastState.players)) {
        lastState.phase = 'initiative';
        lastState.turnOrder = [];
        lastState.currentTurnIndex = 0;
        lastState.round = 1;
        if (Number(msg?.epoch) > 0) lastState.initiativeEpoch = Number(msg.epoch);
        (lastState.players || []).forEach((p) => {
          if (!p) return;
          p.initiative = null;
          p.hasRolledInitiative = false;
          p.pendingInitiativeChoice = false;
          p.willJoinNextRound = false;
        });
        updateTurnOrderBoxVisibility(lastState);
        renderTurnOrderBox(lastState);
      }
    }

    if (msg.type === 'initiativeApplied' && Array.isArray(msg.updates)) {
      const updates = msg.updates
        .map((u) => ({
          playerId: String(u?.playerId || '').trim(),
          total: Number(u?.total)
        }))
        .filter((u) => !!u.playerId && Number.isFinite(u.total));
      if (updates.length && lastState && Array.isArray(lastState.players)) {
        if (Number(msg?.epoch) > 0) {
          const curEpoch = Number(lastState?.initiativeEpoch) || 0;
          if (curEpoch > 0 && curEpoch !== Number(msg.epoch)) return;
        }
        (lastState.players || []).forEach((p) => {
          if (!p || !p.id) return;
          const u = updates.find((it) => it.playerId === String(p.id));
          if (!u) return;
          if (!p.inCombat) return;
          p.initiative = Number(u.total);
          p.hasRolledInitiative = true;
          p.pendingInitiativeChoice = false;
        });
        try { window.rememberPendingInitiativeOverlay?.(currentRoomId, updates, { epoch: Number(msg?.epoch) || 0 }); } catch {}
        updateTurnOrderBoxVisibility(lastState);
        renderTurnOrderBox(lastState);
      }
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

    if (msg.type === 'inventoryTransferOffer') {
      try { window.__inventoryTransfer?.onTransferOffer?.(msg); } catch {}
    }
    if (msg.type === 'inventoryTransferResult') {
      try { window.__inventoryTransfer?.onTransferResult?.(msg); } catch {}
    }
    if (msg.type === 'coinsTransferResult') {
      try { window.__inventoryTransfer?.onCoinsTransferResult?.(msg); } catch {}
    }

    // ================== v4: LOG (append-only) ==================
    if (msg.type === 'tavernLogRow' && msg.row) {
      try {
        window.TavernChat?.receiveRealtime?.(msg);
      } catch {}
    }

    if (msg.type === 'logInit' && Array.isArray(msg.rows)) {
      if (!lastState) lastState = createInitialGameState();
      try { window.RoomChat?.hydrateFromRows?.(msg.rows); } catch {}
      lastState.log = msg.rows
        .map(r => String(r?.text || ''))
        .filter((text) => text && !window.RoomChat?.isChatLogText?.(text));
      if (lastState.log.length > 200) lastState.log = lastState.log.slice(-200);
      renderLog(lastState.log);
    }
    if (msg.type === 'logRow' && msg.row) {
      if (!lastState) lastState = createInitialGameState();
      if (!Array.isArray(lastState.log)) lastState.log = [];
      const text = String(msg.row.text || '').trim();
      if (text) {
        if (window.RoomChat?.isChatLogText?.(text)) {
          try {
            const item = window.RoomChat.decodeLogText(text);
            if (item) window.RoomChat.pushMessage(item);
          } catch {}
          return;
        }
        // Анти-дубль: иногда один и тот же лог приходит дважды подряд (optimistic + realtime или повторный bind).
        // Скрываем повтор, если он совпадает с предыдущей строкой и пришёл почти сразу.
        try {
          const now = Date.now();
          const prev = lastState.log.length ? String(lastState.log[lastState.log.length - 1] || '') : '';
          if (prev === text) {
            const lastTs = Number(window.__lastLogRowTs || 0);
            if (now - lastTs < 1500) return;
          }
          window.__lastLogRowTs = now;
        } catch {}
        lastState.log.push(text);
        if (lastState.log.length > 200) lastState.log.splice(0, lastState.log.length - 200);
        renderLog(lastState.log);
      }
    }

    // ================== v4: TOKENS (positions) ==================
    if (msg.type === 'tokensInit' && Array.isArray(msg.rows)) {
      try {
        const targetMapId = String(msg.mapId || lastState?.currentMapId || '').trim();
        const activeMapId = String(lastState?.currentMapId || '').trim();
        if (targetMapId && activeMapId && targetMapId !== activeMapId) return;

        const tokenIds = new Set((msg.rows || []).map((row) => String(row?.token_id || '').trim()).filter(Boolean));
        (lastState?.players || []).forEach((p) => {
          const pid = String(p?.id || '').trim();
          if (!pid || tokenIds.has(pid)) return;
          p.x = null;
          p.y = null;
          if (!isMapScopedPlayerForUi(p)) p.mapId = null;
        });

        msg.rows.forEach(r => applyTokenRowToLocalState(r));
      } catch {}
      try { syncVisiblePlayersState(lastState); } catch {}
      // Repaint positions (safe)
      try {
        if (lastState) renderBoard(lastState);
      } catch {}

      // v4: positions come from room_tokens; fog must recompute when tokens snapshot is applied.
      try {
        window.FogWar?.onTokenPositionsChanged?.(lastState);
      } catch {}
    }
    if (msg.type === 'tokenRowDeleted' && msg.row) {
      try { applyTokenDeleteToLocalState(msg.row); } catch {}

      try {
        const pid = String(msg.row.token_id || '');
        const p = (lastState?.players || []).find(pp => String(pp?.id) === pid);
        if (p) {
          p.x = null;
          p.y = null;
        }
        try { syncVisiblePlayersState(lastState); } catch {}
        renderBoard(lastState);
      } catch {}

      try {
        window.FogWar?.onTokenPositionsChanged?.(lastState);
      } catch {}
    }
    if (msg.type === 'tokenRow' && msg.row) {
      try { applyTokenRowToLocalState(msg.row); } catch {}
      try {
        syncVisiblePlayersState(lastState);
        renderBoard(lastState);
        updatePlayerList();
        window.InfoModal?.refresh?.(players);
      } catch {}

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
            id: rid,
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
          if (shouldSkipDuplicateOtherDice(ev, rid)) return;
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
          id: rid,
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
        if (shouldSkipDuplicateOtherDice(ev, rid)) return;
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
      const prevPlayerIds = new Set((lastState?.players || []).map((p) => String(p?.id || '').trim()).filter(Boolean));
      const prevPhase = String(lastState?.phase || '');
      const prevInitiativeEpoch = Number(lastState?.initiativeEpoch) || 0;
      const prevMapId = String(lastState?.currentMapId || '').trim();
      const prevPos = new Map();
      const prevSheets = new Map();
      const prevInitiatives = new Map();
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
          prevSheets.set(String(p.id), {
            sheet: deepClone(p.sheet),
            sheetUpdatedAt: Number(p.sheetUpdatedAt) || 0,
            name: p.name || ''
          });
          prevInitiatives.set(String(p.id), {
            inCombat: !!p.inCombat,
            hasRolledInitiative: !!p.hasRolledInitiative,
            pendingInitiativeChoice: !!p.pendingInitiativeChoice,
            willJoinNextRound: !!p.willJoinNextRound,
            initiative: (p.initiative === null || typeof p.initiative === 'undefined') ? null : Number(p.initiative),
            initiativeMode: String(p.initiativeMode || 'normal')
          });
        });
      } catch {}

      // нормализация состояния + поддержка нескольких карт кампании
      let normalized = loadMapToRoot(ensureStateHasMaps(deepClone(msg.state)), msg.state?.currentMapId);
      try { normalized = window.applyDetachedPayloadToState?.(normalized) || normalized; } catch {}
      try { normalized = window.applyPendingInitiativeOverlayToState?.(normalized) || normalized; } catch {}
      try { normalized = applyPendingCombatSelectionOverlay(normalized) || normalized; } catch {}
      try { normalized = window.stripRoomSecretsFromState?.(normalized) || normalized; } catch {}

      try {
        const prevBg = (lastState && typeof lastState.bgMusic === 'object') ? lastState.bgMusic : null;
        const nextBg = (normalized && typeof normalized.bgMusic === 'object') ? normalized.bgMusic : null;
        const nextLooksDetachedPlaceholder = !!nextBg
          && Array.isArray(nextBg.tracks)
          && nextBg.tracks.length === 0
          && !String(nextBg.currentTrackId || '').trim()
          && !nextBg.isPlaying
          && !(Number(nextBg.startedAt) > 0)
          && !(Number(nextBg.pausedAt) > 0);
        const prevLooksMeaningful = !!prevBg
          && ((Array.isArray(prevBg.tracks) && prevBg.tracks.length > 0)
            || !!String(prevBg.currentTrackId || '').trim()
            || !!prevBg.isPlaying
            || Number(prevBg.startedAt) > 0
            || Number(prevBg.pausedAt) > 0);
        if (nextLooksDetachedPlaceholder && prevLooksMeaningful) {
          normalized.bgMusic = deepClone(prevBg);
        }
      } catch {}

      try {
        const modEvent = getRoomModerationEventForUi(normalized);
        if (handleOwnModerationEvent(modEvent)) return;
      } catch {}

      lastState = normalized;
      try { window.rememberRoomStateShadow?.(currentRoomId, normalized); } catch {}
      const nextMapId = String(lastState?.currentMapId || '').trim();
      const mapChanged = !!prevMapId && !!nextMapId && prevMapId !== nextMapId;

      // Preserve newer local character sheets if an incoming room_state snapshot is older.
      try {
        const ownUserId = String(getAppStorageItem?.('int_user_id') || window.myId || '').trim();
        (lastState.players || []).forEach(p => {
          if (!p || !p.id) return;
          if (!ownUserId || String(p.ownerId || '') !== ownUserId) return;
          const prev = prevSheets.get(String(p.id));
          if (!prev) return;
          const incomingTs = Number(p.sheetUpdatedAt) || 0;
          const prevTs = Number(prev.sheetUpdatedAt) || 0;
          if (prevTs > incomingTs) {
            p.sheet = deepClone(prev.sheet);
            p.sheetUpdatedAt = prevTs;
            if (typeof prev.name === 'string' && prev.name.trim()) p.name = prev.name;
          }
        });
      } catch {}

      // Preserve already-known initiative results against stale room_state snapshots.
      // This matters when several players roll initiative almost simultaneously and a slightly
      // older snapshot arrives after a fresher local/appended result.
      try {
        const incomingPhase = String(lastState?.phase || '');
        const sameInitiativeWindow = (
          (prevPhase === 'initiative' || prevPhase === 'combat') &&
          (incomingPhase === 'initiative' || incomingPhase === 'combat')
        );
        const isFreshInitiativeReset = (
          incomingPhase === 'initiative' && (
            (
              (Number(lastState?.round) || 1) === 1 &&
              Array.isArray(lastState?.turnOrder) &&
              lastState.turnOrder.length === 0
            ) ||
            (
              (Number(lastState?.initiativeEpoch) || 0) > 0 &&
              (Number(lastState?.initiativeEpoch) || 0) !== prevInitiativeEpoch
            )
          )
        );
        if (sameInitiativeWindow && !isFreshInitiativeReset) {
          (lastState.players || []).forEach(p => {
            if (!p || !p.id) return;
            const prev = prevInitiatives.get(String(p.id));
            if (!prev) return;
            const incomingRolled = !!p.hasRolledInitiative;
            const incomingInit = (p.initiative === null || typeof p.initiative === 'undefined') ? null : Number(p.initiative);
            if (p.inCombat && prev.hasRolledInitiative && (!incomingRolled || incomingInit === null)) {
              p.initiative = prev.initiative;
              p.hasRolledInitiative = true;
              p.pendingInitiativeChoice = !!prev.pendingInitiativeChoice && !prev.hasRolledInitiative;
              p.willJoinNextRound = !!prev.willJoinNextRound;
            }
            if (!String(p.initiativeMode || '').trim() && String(prev.initiativeMode || '').trim()) {
              p.initiativeMode = prev.initiativeMode;
            }
          });
        }
      } catch {}

      // restore append-only log from memory (room_log drives it)
      if (prevLog && (!Array.isArray(lastState.log) || lastState.log.length === 0)) {
        lastState.log = prevLog;
      }

      // restore last-known token positions from local cache.
      // room_state snapshots may still contain stale x/y (legacy clients or older saves).
      // Token positions are authoritative in room_tokens, so we ALWAYS prefer the cached
      // positions we already have (they are updated by realtime tokenRow events).
      try {
        (lastState.players || []).forEach(p => {
          if (!p || !p.id) return;
          const snap = prevPos.get(String(p.id));
          const cached = (typeof window.getTokenSnapshotCached === 'function')
            ? window.getTokenSnapshotCached(String(p.id), String(lastState?.currentMapId || ''))
            : ((window.__tokenPositionSnapshotCache instanceof Map)
              ? window.__tokenPositionSnapshotCache.get(String(p.id))
              : null);
          const chosen = cached || snap;
          if (!chosen) return;
          const chosenMapId = String(chosen?.mapId || '').trim();
          const activeMapId = String(lastState?.currentMapId || '').trim();
          const canApplyCoords = (
            !mapChanged ||
            (!!activeMapId && !!chosenMapId && chosenMapId === activeMapId)
          );
          // On same-map updates we preserve local token coordinates until room_tokens catches up.
          // On map switch we apply only snapshots that explicitly belong to the new active map.
          if (canApplyCoords) {
            if (chosen.x === null || Number.isFinite(chosen.x)) p.x = chosen.x;
            if (chosen.y === null || Number.isFinite(chosen.y)) p.y = chosen.y;
            if (chosenMapId) p.mapId = chosenMapId;
          }
          if (Number.isFinite(chosen.size) && chosen.size > 0) p.size = chosen.size;
          if (chosen.color && typeof chosen.color === 'string') p.color = chosen.color;
        });
      } catch {}
      boardWidth = normalized.boardWidth;
      boardHeight = normalized.boardHeight;

      // UI карт кампании (селект + подписи)
      try { updateCampaignMapsUI(normalized); } catch {}
      try { updateCellFeetUi(normalized); } catch {}

      if (mapChanged && currentRoomId && typeof loadRoomTokens === 'function') {
        const seq = ++__mapTokensReloadSeq;
        Promise.resolve(loadRoomTokens(currentRoomId, nextMapId))
          .then((rows) => {
            if (seq !== __mapTokensReloadSeq) return;
            if (String(lastState?.currentMapId || '').trim() !== nextMapId) return;
            handleMessage({ type: 'tokensInit', rows: Array.isArray(rows) ? rows : [], mapId: nextMapId });
          })
          .catch((e) => {
            console.warn('map switch tokens load failed', e);
          });
      }

      // обновим GM-инпуты (если controlbox подключен)
      try { window.ControlBox?.refreshGmInputsFromState?.(); } catch {}

      // Sync background music from room_state
      try { window.MusicManager?.applyState?.(normalized); } catch {}

      // Apply visibility rules (GM-only ally, GM NPC visibility, per-map list scoping)
      syncVisiblePlayersState(normalized);
      rememberCombatPlacementCandidates(prevPlayerIds, normalized);

      renderBoard(normalized);
      updatePhaseUI(normalized);
      updatePlayerList();
      updateCurrentPlayer(normalized);
      renderTurnOrderBox(normalized);
      renderInitiativePlayersBox(normalized);

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
  const r = normalizeRoleForApp(role);
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
  if (!logList) return;

  // Avoid flicker: do NOT fully re-render the log on every update.
  // Keep last 50 lines and update incrementally.
  const lines = (Array.isArray(logs) ? logs : []).slice(-50).map(v => String(v ?? ''));
  const prev = Array.isArray(renderLog._last) ? renderLog._last : [];
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  if (same(lines, prev)) return;

  const wasNearBottom =
    (logList.scrollTop + logList.clientHeight) >= (logList.scrollHeight - 30);

  // Case A: only last line changed (server corrected text) -> update last <li>.
  if (
    prev.length &&
    lines.length === prev.length &&
    lines.slice(0, -1).every((v, i) => v === prev[i])
  ) {
    const lastLi = logList.lastElementChild;
    if (lastLi) lastLi.textContent = lines[lines.length - 1] || '';
    renderLog._last = lines;
    if (wasNearBottom) logList.scrollTop = logList.scrollHeight;
    return;
  }

  // Case B: append-only -> add missing <li> nodes.
  if (prev.length && lines.length >= prev.length && lines.slice(0, prev.length).every((v, i) => v === prev[i])) {
    for (let i = prev.length; i < lines.length; i++) {
      const li = document.createElement('li');
      li.textContent = lines[i] || '';
      logList.appendChild(li);
    }
    // Trim DOM if window moved
    while (logList.children.length > 50) {
      try { logList.removeChild(logList.firstChild); } catch { break; }
    }
    renderLog._last = lines;
    if (wasNearBottom) logList.scrollTop = logList.scrollHeight;
    return;
  }

  // Fallback: rebuild (rare)
  logList.innerHTML = '';
  lines.forEach(line => {
    const li = document.createElement('li');
    li.textContent = line;
    logList.appendChild(li);
  });
  renderLog._last = lines;
  if (wasNearBottom) logList.scrollTop = logList.scrollHeight;
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
        rememberPendingCombatSelection(p.id, !!cb.checked);
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
      const items = stPlayers.map((p) => ({ id: p.id, inCombat: true }));
      items.forEach((it) => rememberPendingCombatSelection(it.id, it.inCombat));
      sendMessage({ type: 'setPlayersInCombatBulk', items });
    });
    const btnNone = mkBtn('Никто', 'Исключить всех из боя', () => {
      const items = stPlayers.map((p) => ({ id: p.id, inCombat: false }));
      items.forEach((it) => rememberPendingCombatSelection(it.id, it.inCombat));
      sendMessage({ type: 'setPlayersInCombatBulk', items });
    });
    const btnOnBoard = mkBtn('На поле', 'В бою только те, кто стоит на поле', () => {
      const items = stPlayers.map((p) => {
        const placed = (p && p.x !== null && p.y !== null);
        return { id: p.id, inCombat: !!placed };
      });
      items.forEach((it) => rememberPendingCombatSelection(it.id, it.inCombat));
      sendMessage({ type: 'setPlayersInCombatBulk', items });
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

function renderInitiativePlayersBox(state) {
  if (!initiativePlayersBox || !initiativePlayersList) return;
  const phase = String(state?.phase || '');
  const show = (phase === 'initiative');
  initiativePlayersBox.style.display = show ? '' : 'none';
  if (!show) return;

  const ownId = String(myId || '');
  const mine = (Array.isArray(players) ? players : [])
    .filter((p) => p && String(p.ownerId || '') === ownId)
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));

  initiativePlayersList.innerHTML = '';
  if (!mine.length) {
    const li = document.createElement('li');
    li.className = 'initiative-player-item';
    li.textContent = 'У вас нет персонажей.';
    initiativePlayersList.appendChild(li);
    if (rollInitiativeAllBtn) rollInitiativeAllBtn.disabled = true;
    return;
  }

  let canRollAny = false;
  mine.forEach((p) => {
    const li = document.createElement('li');
    li.className = 'initiative-player-item';

    const name = document.createElement('div');
    name.className = 'initiative-player-name';
    name.textContent = String(p?.name || '—');

    const controls = document.createElement('div');
    controls.className = 'initiative-player-controls';

    const advSelect = document.createElement('select');
    const mode = String(p?.initiativeMode || 'normal');
    advSelect.innerHTML = `
      <option value="normal">Стандартно</option>
      <option value="advantage">С преимуществом</option>
      <option value="disadvantage">С помехой</option>
    `;
    advSelect.value = (mode === 'advantage' || mode === 'disadvantage') ? mode : 'normal';
    advSelect.addEventListener('change', (e) => {
      e.stopPropagation();
      sendMessage({ type: 'setInitiativeMode', id: p.id, mode: advSelect.value });
    });

    const canRoll = !p.hasRolledInitiative;
    if (canRoll) canRollAny = true;
    const rollBtn = document.createElement('button');
    rollBtn.type = 'button';
    rollBtn.className = 'mini-action-btn';
    rollBtn.textContent = '🎲';
    rollBtn.title = canRoll ? 'Бросить инициативу' : 'Инициатива уже назначена';
    rollBtn.disabled = !canRoll && myRole !== 'GM';
    rollBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sendMessage({ type: 'rollInitiativeFor', id: p.id });
    });

    controls.appendChild(advSelect);
    controls.appendChild(rollBtn);
    li.appendChild(name);
    li.appendChild(controls);
    initiativePlayersList.appendChild(li);
  });

  if (rollInitiativeAllBtn) {
    rollInitiativeAllBtn.disabled = !canRollAny;
  }
}

function highlightCurrentTurn(playerId) {
  playerElements.forEach((el) => el.classList.remove('current-turn'));
  if (!playerId) return;
  const el = playerElements.get(playerId);
  if (el) el.classList.add('current-turn');
}

function syncSelectedPlayerUi() {
  const selectedId = String(selectedPlayer?.id || '').trim();

  try {
    playerElements.forEach((el, id) => {
      if (!el) return;
      el.classList.toggle('selected', !!selectedId && String(id) === selectedId);
      try {
        const player = (Array.isArray(players) ? players : []).find((p) => String(p?.id || '') === String(id));
        window.updateTokenCombatActions?.(player, el);
      } catch {}
    });
  } catch {}

  try {
    if (!playerList) return;
    playerList.querySelectorAll('.player-list-item.is-selected').forEach((el) => el.classList.remove('is-selected'));
    if (!selectedId) return;
    playerList.querySelectorAll('.player-list-item[data-player-id]').forEach((el) => {
      if (String(el.getAttribute('data-player-id') || '') === selectedId) el.classList.add('is-selected');
    });
  } catch {}
}

try { window.syncSelectedPlayerUi = syncSelectedPlayerUi; } catch {}

// ================== PLAYER LIST ==================
function roleToLabel(role) {
  const r = normalizeRoleForApp(role);
  if (r === "GM") return "ГМ";
  if (r === "Player") return "Игрок";
  if (r === "Spectator") return "Зритель";
  return "-";
}

function roleToClass(role) {
  const r = normalizeRoleForApp(role);
  if (r === "GM") return "role-gm";
  if (r === "Player") return "role-player";
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


function getRoomModerationEventForUi(state) {
  try {
    const access = state?.roomAccess;
    return (access && typeof access === 'object' && access.moderationEvent && typeof access.moderationEvent === 'object')
      ? access.moderationEvent
      : null;
  } catch {
    return null;
  }
}


function handleOwnModerationEvent(modEvent) {
  try {
    const modId = String(modEvent?.id || '');
    const targetUserId = String(modEvent?.targetUserId || '');
    const myUserId = String(myId || '');
    const roomId = String(modEvent?.roomId || '');
    const currentRid = String(currentRoomId || '');
    if (!modId || !targetUserId || !myUserId || targetUserId !== myUserId) return false;
    if (!roomId || roomId !== currentRid) return false;
    const joinedAt = Number(window.__currentRoomJoinedAtMs || 0);
    const createdAtMs = Date.parse(String(modEvent?.createdAt || ''));
    if (Number.isFinite(createdAtMs) && joinedAt > 0 && createdAtMs <= joinedAt) return false;
    const lastSeenModId = String(window.__lastHandledRoomModerationEventId || '');
    if (modId === lastSeenModId) return true;
    window.__lastHandledRoomModerationEventId = modId;
    const roomName = String(modEvent?.roomName || myRoomSpan?.textContent || 'комната');
    const reason = String(modEvent?.reason || '').trim();
    const type = String(modEvent?.type || '');
    const popupTitle = (type === 'ban') ? 'Вы забанены' : 'Вы выгнаны из комнаты';
    const popupText = (type === 'ban')
      ? `Вы забанены в комнате «${roomName}». Причина: ${reason || 'Не указана'}. Время бана: ${formatModerationRemaining(modEvent?.bannedUntil) || 'уточняется'}.`
      : `Вы выгнаны из комнаты «${roomName}».`;
    Promise.resolve(window.returnToTavernFromRoom?.()).finally(() => {
      try { window.showRoomAccessPopup?.(popupText, popupTitle); } catch {}
    });
    return true;
  } catch {
    return false;
  }
}

function formatModerationRemaining(iso) {
  try {
    const untilMs = Date.parse(String(iso || ''));
    if (!Number.isFinite(untilMs)) return '';
    const totalMinutes = Math.max(1, Math.ceil(Math.max(0, untilMs - Date.now()) / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0 && minutes > 0) return `${hours} ч. ${minutes} мин.`;
    if (hours > 0) return `${hours} ч.`;
    return `${minutes} мин.`;
  } catch {
    return '';
  }
}

function ensureBanUserModal() {
  let overlay = document.getElementById('banUserModal');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'banUserModal';
  overlay.className = 'modal-overlay hidden';
  overlay.innerHTML = `
    <div class="modal tavern-modal room-entry-modal" style="max-width:460px;">
      <div class="modal-header">
        <div>
          <div class="modal-title">Забанить пользователя</div>
          <div class="modal-subtitle" id="banUserModalSubtitle">Укажите причину и время бана</div>
        </div>
        <button id="banUserModalClose" class="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="sheet-card room-entry-card" style="display:flex; flex-direction:column; gap:10px;">
          <label class="room-entry-field">
            <span>Причина</span>
            <input id="banUserReason" class="room-entry-input" type="text" maxlength="220" placeholder="Например: нарушение правил">
          </label>
          <div class="room-entry-field" style="display:flex; flex-direction:column; gap:8px;">
            <span>Время бана</span>
            <div style="display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:10px;">
              <label class="room-entry-field" style="margin:0;">
                <span>Часы (0–24)</span>
                <input id="banUserHours" class="room-entry-input" type="number" min="0" max="24" step="1" value="0">
              </label>
              <label class="room-entry-field" style="margin:0;">
                <span>Минуты (0–59)</span>
                <input id="banUserMinutes" class="room-entry-input" type="number" min="0" max="59" step="1" value="5">
              </label>
            </div>
          </div>
          <div id="banUserModalError" class="room-entry-error" style="color:#ff6b6b;"></div>
          <div class="room-entry-actions" style="display:flex; gap:10px; justify-content:flex-end; margin-top:6px;">
            <button id="banUserModalCancel" type="button">Отмена</button>
            <button id="banUserModalSubmit" type="button">Забанить</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.classList.add('hidden');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#banUserModalClose')?.addEventListener('click', close);
  overlay.querySelector('#banUserModalCancel')?.addEventListener('click', close);
  overlay.querySelector('#banUserModalSubmit')?.addEventListener('click', () => {
    const targetUserId = String(overlay.dataset.targetUserId || '').trim();
    if (!targetUserId) return close();
    const reason = String(document.getElementById('banUserReason')?.value || '').trim();
    const hoursRaw = Number(document.getElementById('banUserHours')?.value || 0);
    const minutesRaw = Number(document.getElementById('banUserMinutes')?.value || 0);
    const hours = Math.max(0, Math.min(24, Math.trunc(Number.isFinite(hoursRaw) ? hoursRaw : 0)));
    const minutes = Math.max(0, Math.min(59, Math.trunc(Number.isFinite(minutesRaw) ? minutesRaw : 0)));
    const totalMinutes = (hours * 60) + minutes;
    const err = document.getElementById('banUserModalError');
    if (!reason) {
      if (err) err.textContent = 'Укажите причину бана.';
      return;
    }
    if (totalMinutes <= 0) {
      if (err) err.textContent = 'Укажите время бана больше 0 минут.';
      return;
    }
    if (err) err.textContent = '';
    sendMessage({ type: 'banRoomUser', roomId: currentRoomId, targetUserId, reason, hours, minutes });
    close();
  });
  return overlay;
}

function openBanUserModal(userId, userName) {
  const overlay = ensureBanUserModal();
  overlay.dataset.targetUserId = String(userId || '');
  const subtitle = document.getElementById('banUserModalSubtitle');
  const reason = document.getElementById('banUserReason');
  const hours = document.getElementById('banUserHours');
  const minutes = document.getElementById('banUserMinutes');
  const err = document.getElementById('banUserModalError');
  if (subtitle) subtitle.textContent = `Пользователь: ${String(userName || 'игрок')}`;
  if (reason) reason.value = '';
  if (hours) hours.value = '0';
  if (minutes) minutes.value = '5';
  if (err) err.textContent = '';
  overlay.classList.remove('hidden');
  setTimeout(() => reason?.focus?.(), 0);
}

function updatePlayerList() {
  if (!playerList) return;
  // sync from global (in case dom-and-setup changed it before this file loaded)
  playerListView = (window.PLAYER_LIST_VIEW === 'others') ? 'others' : 'mine';
  applyPlayerListTabUI();
  playerList.innerHTML = '';

  const currentTurnId = (lastState && lastState.phase === 'combat' && Array.isArray(lastState.turnOrder) && lastState.turnOrder.length)
    ? lastState.turnOrder[lastState.currentTurnIndex]
    : null;

  // Стабильный порядок пользователей:
  // 1) GM всегда сверху
  // 2) затем Игрок
  // 3) затем Зритель
  // 4) внутри каждой группы — по времени первого подключения (usersOrder)
  const gmIds = [];
  const playerIds = [];
  const spectrIds = [];
  const otherIds = [];

  (usersOrder || []).forEach((ownerId) => {
    const u = usersById.get(String(ownerId));
    if (!u) return; // сейчас не подключён
    const r = normalizeRoleForApp(u.role);
    if (r === 'GM') gmIds.push(String(ownerId));
    else if (r === 'Player') playerIds.push(String(ownerId));
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

    if (myRole === 'GM' && currentRoomId && ownerId && String(ownerId) !== String(myId || '')) {
      const modActions = document.createElement('div');
      modActions.className = 'owner-header-actions';

      const kickBtn = document.createElement('button');
      kickBtn.type = 'button';
      kickBtn.className = 'moderation-btn moderation-btn--kick';
      kickBtn.title = `Выгнать пользователя ${ownerNameSpan.textContent}`;
      kickBtn.setAttribute('aria-label', kickBtn.title);
      kickBtn.textContent = '⤴';
      kickBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sendMessage({ type: 'kickRoomUser', roomId: currentRoomId, targetUserId: ownerId });
      });

      const banBtn = document.createElement('button');
      banBtn.type = 'button';
      banBtn.className = 'moderation-btn moderation-btn--ban';
      banBtn.title = `Забанить пользователя ${ownerNameSpan.textContent}`;
      banBtn.setAttribute('aria-label', banBtn.title);
      banBtn.textContent = '⛔';
      banBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openBanUserModal(ownerId, ownerNameSpan.textContent || 'игрок');
      });

      modActions.appendChild(kickBtn);
      modActions.appendChild(banBtn);
      ownerHeader.appendChild(modActions);
    }

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
      li.setAttribute('data-player-id', String(p?.id || ''));
      const isCombatPlacementReady = !!window.isCombatPlacementPendingForPlayer?.(p);
      if (isCombatPlacementReady) li.classList.add('player-list-item--combat-place-ready');

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

      if (p.isEnemy) {
        const enemyBadge = document.createElement('span');
        enemyBadge.className = 'enemy-badge';
        enemyBadge.textContent = 'враг';
        nameWrap.appendChild(enemyBadge);
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
      actions.appendChild(topActions);

      // ===== Выбор инициативы для участника боя (ТОЛЬКО для добавленных в бой во время боя) =====
      const phaseNow = String(lastState?.phase || '');
      const canPickInit = (phaseNow === 'initiative' || phaseNow === 'combat');
      // В фазе инициативы кнопки "Бросить инициативу"/"Инициатива основы" мешают: они должны
      // появляться только для персонажей, которых добавили в бой уже ПОСЛЕ старта боя.
      // Такой сценарий помечается флагом pendingInitiativeChoice (ставится сервером в setPlayerInCombat,
      // когда next.phase === 'combat').
      const isLateJoiner = !!p.pendingInitiativeChoice;
      if (lastState && canPickInit && isLateJoiner && p.inCombat && !p.hasRolledInitiative && (myRole === 'GM' || p.ownerId === myId)) {
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
          // Safety: prevent accidental deletion
          if (!confirm(`Удалить персонажа "${p.name}"?`)) return;
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
        const cur = (players || []).find(pp => String(pp?.id) === String(p?.id)) || p;
        const canMoveNow = !!window.canCurrentUserMovePlayerNow?.(cur, { forInitialPlacement: true });
        if (!canMoveNow) {
          if (String(lastState?.phase || '') === 'combat' && String(cur?.ownerId || '') === String(myId || '') && String(myRole || '') !== 'GM') {
            alert('Сейчас нельзя перемещать этого персонажа: дождитесь его хода в фазе боя.');
          }
          return;
        }
        selectedPlayer = cur;
        try { syncSelectedPlayerUi(); } catch {}
        try { window.updateMovePreview?.(); } catch {}
        try { window.renderCombatMoveOverlay?.(); } catch {}
        if (isCombatPlacementReady && (cur?.x === null || cur?.y === null)) {
          alert('Персонаж создан во время фазы боя. Выберите клетку на поле, чтобы разместить токен.');
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

  try { syncSelectedPlayerUi(); } catch {}
  try { renderInitiativePlayersBox(lastState || null); } catch {}
}

// ================== UI PERMISSIONS HELPERS ==================
function getOwnerRoleForPlayerUI(p) {
  return getOwnerRoleForPlayer(p);
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



window.refreshDetachedStateView = function refreshDetachedStateView() {
  try {
    if (!lastState) return;
    handleMessage({ type: 'state', state: window.applyDetachedPayloadToState?.(deepClone(lastState)) || deepClone(lastState) });
  } catch (e) {
    console.warn('refreshDetachedStateView failed', e);
  }
};
