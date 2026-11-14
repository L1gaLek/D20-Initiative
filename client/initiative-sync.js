const initiativeRequestsInFlight = new Set();

// All three roll buttons use the same confirmed, token-scoped operation.
async function rollInitiativeAndSync(message) {
  const state = lastState;
  if (!currentRoomId || state?.phase !== 'initiative') return;
  const roomId = String(currentRoomId);
  const epoch = Number(state.initiativeEpoch) || 0;
  const selectedId = message.type === 'rollInitiativeFor' ? String(message.id || '') : '';
  const candidates = (state.players || []).filter(player => player
    && (selectedId ? String(player.id) === selectedId : canControlToken(player))
    && canControlToken(player)
    && isPlayerEligibleForCurrentMapCombat(player, state)
    && !player.hasRolledInitiative && !initiativeRequestsInFlight.has(String(player.id)));
  if (!candidates.length) return;
  const rolls = candidates.map(player => ({ player, roll: buildInitiativeRollForPlayer(player) }));
  candidates.forEach(player => initiativeRequestsInFlight.add(String(player.id)));
  try {
    const result = await window.vpsApi(`/rooms/${encodeURIComponent(roomId)}/initiative`, {
      method: 'POST', retries: 2,
      body: { epoch, mapId: state.currentMapId, updates: rolls.map(({ player, roll }) => ({ playerId: player.id, total: roll.total })) }
    });
    if (String(currentRoomId) !== roomId) return;
    handleMessage({ type: 'initiativeApplied', roomId, epoch: result.epoch, updates: result.updates });
    for (const { player, roll } of rolls) {
      const accepted = result.updates?.find(update => String(update.playerId) === String(player.id));
      if (!accepted) continue;
      await broadcastDiceEventOnly({
        fromId: String(myId), fromName: player.name, kindText: roll.kindText,
        sides: 20, count: roll.rolls.length, bonus: roll.dexMod,
        rolls: roll.rolls, total: accepted.total, crit: ''
      });
    }
  } catch (error) {
    showAppToast(`Инициатива не сохранена: ${error?.message || 'проверьте соединение'}. Можно повторить бросок.`, { tone: 'error' });
  } finally {
    candidates.forEach(player => initiativeRequestsInFlight.delete(String(player.id)));
    refreshInitiativeRealtimeUi(lastState);
  }
}
