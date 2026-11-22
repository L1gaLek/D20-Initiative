// Acknowledged combat commands avoid full room saves for dice and turns.
const initiativeRequestsInFlight = new Set();
const combatRequests = new Map();
const initiativeRollDrafts = new Map();
let combatActionBusy = false;
const remoteInitiativePreviews = new Map();
function handleCombatPreview(msg) {
  if (msg.type === 'combatSync' || msg.type === 'combatCommandError' || msg.type === 'roomResume') {
    for (const [id, entry] of remoteInitiativePreviews) {
      if (msg.type === 'roomResume' || id === msg.requestId || msg.players?.some(p => entry.updates?.some(u => String(u.playerId) === String(p.id)) && p.hasRolledInitiative)) {
        clearTimeout(entry.timer); remoteInitiativePreviews.delete(id);
      }
    }
    return false;
  }
  if (msg.type !== 'combatPreview') return false;
  if (String(msg.roomId) !== String(currentRoomId)) return true;
  const old = remoteInitiativePreviews.get(msg.requestId);
  clearTimeout(old?.timer); remoteInitiativePreviews.delete(msg.requestId);
  if (msg.pending && String(msg.mapId) === String(lastState?.currentMapId) && Number(msg.epoch) === Number(lastState?.initiativeEpoch)) {
    remoteInitiativePreviews.set(msg.requestId, { ...msg, timer: setTimeout(() => {
      remoteInitiativePreviews.delete(msg.requestId); refreshInitiativeRealtimeUi(lastState);
    }, 8000) });
  }
  refreshInitiativeRealtimeUi(lastState);
  return true;
}
function handleCombatSync(msg) {
  const pending = combatRequests.get(msg.requestId);
  if (msg.type === 'combatCommandError') { pending?.reject(new Error(msg.message)); return; }
  if (String(msg.roomId) !== String(currentRoomId)) return;
  const st = lastState;
  if (st && (!msg.mapId || String(msg.mapId) === String(st.currentMapId))
      && Number(msg.fields?.combatRevision || 0) >= Number(st.combatRevision || 0)
      && Number(msg.fields?.phaseEpoch || 0) >= Number(st.phaseEpoch || 0)) {
    const turnChanged = st.phase !== msg.fields.phase || st.turnEpoch !== msg.fields.turnEpoch;
    Object.assign(st, msg.fields);
    for (const update of msg.players || []) {
      const p = (st.players || []).find(p => String(p.id) === String(update.id));
      if (p) for (const key of CombatState.playerFields) if (update[key] !== undefined) p[key] = update[key];
    }
    CombatState.syncMap(st);
    syncVisiblePlayersState(st);
    rememberRoomStateShadow(currentRoomId, st);
    refreshInitiativeRealtimeUi(st);
    if (turnChanged) { try { syncSelectedPlayerUi?.(); renderCombatMoveOverlay?.(); window.Board3D?.requestSync?.(); } catch {} }
  }
  pending?.resolve(msg);
}
window.handleCombatSync = handleCombatSync;
async function requestCombatCommand(action, extra = {}) {
  const roomId = String(currentRoomId || '');
  if (!roomId || !lastState) throw new Error('Комната не открыта');
  const requestId = crypto.randomUUID();
  const body = { action, requestId, mapId: lastState.currentMapId,
    epoch: Number(lastState.initiativeEpoch) || 0, turnEpoch: Number(lastState.turnEpoch) || 0, ...extra };
  let timer;
  try {
    if (typeof wsClient !== 'undefined' && wsClient?.readyState === WebSocket.OPEN && wsClient.__joined === true) {
      const response = new Promise((resolve, reject) => {
        combatRequests.set(requestId, { resolve, reject });
        timer = setTimeout(() => resolve(null), 2200);
      });
      sendWsEnvelope({ type: 'combatCommand', roomId, ...body });
      const result = await response;
      if (result) return result;
    }
    // Retry the SAME command, including ID and dice values, after a lost WS ack.
    const result = await window.vpsApi(`/rooms/${encodeURIComponent(roomId)}/combat`, {
      method: 'POST', retries: 1, timeoutMs: 8000, body
    });
    if (String(currentRoomId) === roomId) handleCombatSync(result);
    return result;
  } finally { clearTimeout(timer); combatRequests.delete(requestId); }
}
async function sendCombatAction(action) {
  if (combatActionBusy) return;
  if (['startInitiative', 'startCombat', 'previousTurn'].includes(action) && myRole !== 'GM') return;
  combatActionBusy = true;
  refreshInitiativeRealtimeUi(lastState);
  try {
    const extra = action === 'startInitiative' ? { combatantIds: (players || []).filter(p =>
      p.x != null && p.y != null && (!isMapScopedPlayer(p) || String(p.mapId) === String(lastState.currentMapId))).map(p => p.id) } : {};
    const result = await requestCombatCommand(action, extra);
    const id = result.fields?.turnOrder?.[result.fields.currentTurnIndex];
    const name = lastState.players?.find(p => String(p.id) === String(id))?.name || '—';
    const line = action === 'startInitiative' ? 'ГМ начал фазу инициативы'
      : action === 'startCombat' ? `Бой начался. Первый ход: ${name}`
      : action === 'previousTurn' ? `ГМ вернул ход: ${name} (круг ${result.fields.round})` : `Ход персонажа ${name}`;
    void appendRoomLogEntry(currentRoomId,line);
  } catch (error) { showAppToast(error.message || 'Не удалось изменить фазу боя', { tone: 'error' }); }
  finally { combatActionBusy = false; refreshInitiativeRealtimeUi(lastState); }
}
async function setManualInitiative(playerId, value) {
  if (myRole !== 'GM' || String(value).trim() === '' || !Number.isInteger(Number(value))) return;
  try { await requestCombatCommand('manual', { updates: [{ playerId, total: Number(value) }] }); }
  catch (error) { showAppToast(error.message, { tone: 'error' }); refreshInitiativeRealtimeUi(lastState); }
}
async function rollInitiativeAndSync(message) {
  const state = lastState;
  if (!currentRoomId || !['initiative', 'combat'].includes(state?.phase)) return;
  const roomId = String(currentRoomId), epoch = Number(state.initiativeEpoch) || 0;
  const selectedId = ['rollInitiativeFor', 'gmRollInitiativeFor', 'combatInitChoice'].includes(message.type) ? String(message.id || '') : '';
  if (message.type === 'gmRollInitiativeFor' && myRole !== 'GM') return;
  const candidates = (state.players || []).filter(p => p && (!selectedId || String(p.id) === selectedId)
    && canControlToken(p) && isPlayerEligibleForCurrentMapCombat(p, state)
    && !p.hasRolledInitiative && !initiativeRequestsInFlight.has(String(p.id)));
  if (!candidates.length) return;
  const rolls = [];
  for (const player of candidates) {
    const key = `${roomId}:${epoch}:${player.id}`;
    let roll = initiativeRollDrafts.get(key);
    if (message.choice === 'base') {
      const base = (state.players || []).find(p => p.isBase && String(p.ownerId) === String(player.ownerId));
      if (!base?.hasRolledInitiative) { showAppToast('Сначала бросьте инициативу основы', { tone: 'error' }); return; }
      roll = { total: Number(base.initiative), kindText: 'Инициатива основы', rolls: [], dexMod: 0 };
    }
    roll ||= buildInitiativeRollForPlayer(player);
    initiativeRollDrafts.set(key, roll); rolls.push({ player, roll, key });
  }
  rolls.forEach(({ player }) => initiativeRequestsInFlight.add(String(player.id)));
  refreshInitiativeRealtimeUi(state);
  try {
    const result = await requestCombatCommand('roll', { updates: rolls.map(({ player, roll }) => ({ playerId: player.id, total: roll.total })) });
    if (String(currentRoomId) !== roomId || Number(lastState.initiativeEpoch) !== epoch) return;
    for (const { player, roll, key } of rolls) {
      initiativeRollDrafts.delete(key);
      const accepted = result.players?.find(p => String(p.id) === String(player.id));
      if (!accepted?.hasRolledInitiative || accepted.initiativeRequestId !== result.requestId) continue;
      void broadcastDiceEventOnly({ fromId: String(myId), fromName: player.name, kindText: roll.kindText,
        sides: 20, count: roll.rolls.length, bonus: roll.dexMod, rolls: roll.rolls, total: accepted.initiative, crit: '' })
        .catch(error => console.warn('Initiative dice log:', error));
    }
  } catch (error) {
    showAppToast('Инициатива не сохранена. Можно повторить отправку броска. ' + (error.message || ''), { tone: 'error' });
  } finally {
    rolls.forEach(({ player }) => initiativeRequestsInFlight.delete(String(player.id)));
    refreshInitiativeRealtimeUi(lastState);
  }
}
function getPendingInitiativeRoll(playerId) {
  if (!initiativeRequestsInFlight.has(String(playerId))) {
    for (const entry of remoteInitiativePreviews.values()) {
      if (entry.roomId !== String(currentRoomId) || entry.mapId !== String(lastState?.currentMapId) || Number(entry.epoch) !== Number(lastState?.initiativeEpoch)) continue;
      const update = entry.updates?.find(item => String(item.playerId) === String(playerId));
      if (update) return { total: update.total };
    }
    return null;
  }
  return initiativeRollDrafts.get(`${currentRoomId}:${Number(lastState?.initiativeEpoch) || 0}:${playerId}`) || null;
}
