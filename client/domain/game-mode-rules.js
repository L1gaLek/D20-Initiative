(function exposeGameModeRules(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.D20GameModeRules = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis, function createGameModeRules() {
  const PHASES = Object.freeze({
    EXPLORATION: 'exploration',
    INITIATIVE: 'initiative',
    COMBAT: 'combat'
  });

  function getCurrentTurnActorId(state) {
    if (String(state?.phase || '') !== PHASES.COMBAT) return '';
    const turnOrder = Array.isArray(state?.turnOrder) ? state.turnOrder : [];
    const index = Math.max(0, Number(state?.currentTurnIndex) || 0);
    return String(turnOrder[index] || '');
  }

  function isTokenUnplaced(player) {
    return player?.x === null
      || typeof player?.x === 'undefined'
      || player?.y === null
      || typeof player?.y === 'undefined';
  }

  function canUserMovePlayer({ player, state, userId, role, forInitialPlacement = false } = {}) {
    if (!player || !player.id) return false;
    if (String(role || '') === 'GM') return true;
    if (String(player.ownerId || '') !== String(userId || '')) return false;

    const phase = String(state?.phase || '');
    if (phase === PHASES.INITIATIVE) return false;
    if (phase !== PHASES.COMBAT) return true;
    if (String(player.id) === getCurrentTurnActorId(state)) return true;
    return !!forInitialPlacement && isTokenUnplaced(player);
  }

  function resetForExploration(state) {
    if (!state || typeof state !== 'object') return state;
    state.phase = PHASES.EXPLORATION;
    state.turnOrder = [];
    state.currentTurnIndex = 0;
    state.round = 1;
    state.turnEpoch = 0;
    return state;
  }

  function startInitiative(state, options = {}) {
    if (!state || typeof state !== 'object') return null;
    const isEligible = typeof options.isEligible === 'function' ? options.isEligible : () => true;
    state.phase = PHASES.INITIATIVE;
    state.turnOrder = [];
    state.currentTurnIndex = 0;
    state.round = 1;
    state.turnEpoch = 0;
    state.initiativeEpoch = Number(options.initiativeEpoch) || Date.now();

    (Array.isArray(state.players) ? state.players : []).forEach((player) => {
      if (!player) return;
      const placed = !isTokenUnplaced(player);
      player.inCombat = placed && isEligible(player, state);
      player.initiative = null;
      player.hasRolledInitiative = false;
      player.pendingInitiativeChoice = false;
      player.willJoinNextRound = false;
      const mode = String(player.initiativeMode || 'normal');
      player.initiativeMode = mode === 'advantage' || mode === 'disadvantage' ? mode : 'normal';
    });
    return state;
  }

  function getReadyCombatants(state, isEligible = () => true) {
    const players = Array.isArray(state?.players) ? state.players : [];
    return players.filter((player) => player && player.inCombat && isEligible(player, state));
  }

  function canStartCombat(state, isEligible = () => true) {
    const combatants = getReadyCombatants(state, isEligible);
    return combatants.length > 0 && combatants.every((player) => !!player.hasRolledInitiative);
  }

  function buildCombatTurnOrder(state, isEligible = () => true) {
    return getReadyCombatants(state, isEligible)
      .filter((player) => player.initiative !== null && typeof player.initiative !== 'undefined' && player.hasRolledInitiative)
      .sort((a, b) => (Number(b.initiative) || 0) - (Number(a.initiative) || 0))
      .map((player) => player.id);
  }

  function startCombat(state, options = {}) {
    if (!state || typeof state !== 'object') return { ok: false, reason: 'invalid-state' };
    const allowedPhases = new Set([PHASES.EXPLORATION, PHASES.INITIATIVE, 'placement']);
    if (!allowedPhases.has(String(state.phase || ''))) return { ok: false, reason: 'invalid-phase' };
    const isEligible = typeof options.isEligible === 'function' ? options.isEligible : () => true;

    if (state.phase !== PHASES.INITIATIVE) {
      (Array.isArray(state.players) ? state.players : []).forEach((player) => {
        if (player && typeof player.inCombat !== 'boolean') player.inCombat = !isTokenUnplaced(player);
      });
    }
    if (!canStartCombat(state, isEligible)) return { ok: false, reason: 'initiative-required' };

    state.turnOrder = buildCombatTurnOrder(state, isEligible);
    state.phase = PHASES.COMBAT;
    state.currentTurnIndex = 0;
    state.round = 1;
    state.turnEpoch = Number(options.turnEpoch) || Date.now();
    return { ok: true, firstActorId: String(state.turnOrder[0] || '') };
  }

  function advanceCombatTurn(state, isEligible = () => true) {
    if (!state || state.phase !== PHASES.COMBAT) return null;
    if (!Array.isArray(state.turnOrder) || state.turnOrder.length === 0) return null;

    const previousIndex = Number(state.currentTurnIndex) || 0;
    const nextIndex = (previousIndex + 1) % state.turnOrder.length;
    const wrapped = previousIndex === state.turnOrder.length - 1 && nextIndex === 0;

    if (wrapped) {
      state.round = (Number(state.round) || 1) + 1;
      const joining = (state.players || []).filter((player) => player && player.willJoinNextRound);
      if (joining.length) {
        joining.forEach((player) => { player.willJoinNextRound = false; });
        state.turnOrder = [...new Set(buildCombatTurnOrder(state, isEligible))];
      }
    }

    state.currentTurnIndex = wrapped ? 0 : nextIndex;
    return {
      actorId: String(state.turnOrder[state.currentTurnIndex] || ''),
      wrapped,
      round: Number(state.round) || 1
    };
  }

  return {
    PHASES,
    advanceCombatTurn,
    buildCombatTurnOrder,
    canStartCombat,
    canUserMovePlayer,
    getReadyCombatants,
    getCurrentTurnActorId,
    isTokenUnplaced,
    resetForExploration,
    startCombat,
    startInitiative
  };
});
