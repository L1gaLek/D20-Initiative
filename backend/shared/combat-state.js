/* Shared authoritative combat snapshots; also loaded by the browser. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CombatState = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const fields = ['phase', 'phaseEpoch', 'combatSelectionEpoch', 'initiativeEpoch', 'turnEpoch',
    'turnOrder', 'currentTurnIndex', 'round', 'combatRevision', 'turnHistory'];
  const playerFields = ['inCombat', 'initiative', 'initiativeRevision', 'initiativeRequestId', 'hasRolledInitiative',
    'pendingInitiativeChoice', 'willJoinNextRound', 'initiativeMode'];
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const onMap = (p, state) => !(p.isEnemy && !p.isBase) || String(p.mapId) === String(state.currentMapId);
  const eligible = (p, state) => p && p.inCombat && onMap(p,state);
  const compareInitiative = (a,b) => Number(b.initiative || 0) - Number(a.initiative || 0)
    || String(a.name || '').localeCompare(String(b.name || ''),'ru') || String(a.id).localeCompare(String(b.id));
  function snapshot(state) {
    return { fields: Object.fromEntries(fields.filter(k => state[k] !== undefined).map(k => [k, clone(state[k])])),
      players: (state.players || []).map(p => ({ id: p.id,
        ...Object.fromEntries(playerFields.filter(k => p[k] !== undefined).map(k => [k, clone(p[k])])) })) };
  }
  function syncMap(state) {
    const map = (state.maps || []).find(m => String(m.id || m.map_id) === String(state.currentMapId));
    if (map) {
      const combat = snapshot(state);
      Object.assign(map, combat.fields);
      map.playerStates = Object.fromEntries(combat.players.map(({ id, ...p }) => [id, p]));
    }
    return state;
  }
  // Unrelated full-room saves must not roll back committed combat commands.
  function preserve(next, current) {
    if (!next || !current) return next;
    for (const map of next.maps || []) {
      const previous = (current.maps || []).find(m => String(m.id || m.map_id) === String(map.id || map.map_id));
      if (previous && Number(previous.combatRevision || 0) > Number(map.combatRevision || 0)
          && Number(previous.phaseEpoch || 0) >= Number(map.phaseEpoch || 0)) {
        for (const k of [...fields, 'playerStates']) if (previous[k] !== undefined) map[k] = clone(previous[k]);
      }
    }
    if (String(next.currentMapId) !== String(current.currentMapId)) {
      const map = (next.maps || []).find(m => String(m.id || m.map_id) === String(next.currentMapId));
      if (map && Number(map.combatRevision || 0) > Number(next.combatRevision || 0)) {
        for (const k of fields) if (map[k] !== undefined) next[k] = clone(map[k]);
        for (const p of next.players || []) {
          const saved = map.playerStates?.[p.id];
          if (saved) for (const k of playerFields) if (saved[k] !== undefined) p[k] = clone(saved[k]);
        }
      }
      return next;
    }
    if (Number(current.combatRevision || 0) > Number(next.combatRevision || 0)
        && Number(current.phaseEpoch || 0) >= Number(next.phaseEpoch || 0)) {
      Object.assign(next, snapshot(current).fields);
      for (const p of next.players || []) {
        const previous = (current.players || []).find(x => String(x.id) === String(p.id));
        if (previous) for (const k of playerFields) if (previous[k] !== undefined) p[k] = clone(previous[k]);
      }
    } else if (Number(next.initiativeEpoch) === Number(current.initiativeEpoch)) {
      for (const p of next.players || []) {
        const previous = (current.players || []).find(x => String(x.id) === String(p.id));
        if (previous && Number(previous.initiativeRevision || 0) > Number(p.initiativeRevision || 0)) {
          for (const k of ['initiative', 'initiativeRevision', 'initiativeRequestId', 'hasRolledInitiative', 'pendingInitiativeChoice']) p[k] = clone(previous[k]);
        }
      }
    }
    return syncMap(next);
  }
  function command(state, data, ctx, canControl) {
    const action = String(data.action || '');
    const gm = ctx.role === 'GM';
    if (!['startInitiative', 'roll', 'manual', 'select', 'mode', 'startCombat', 'endTurn', 'previousTurn'].includes(action)) throw new Error('Unknown combat command');
    if (['startInitiative', 'manual', 'select', 'startCombat', 'previousTurn'].includes(action) && !gm) throw new Error('GM role required');
    if (data.mapId && String(data.mapId) !== String(state.currentMapId)) throw new Error('Карта уже изменилась');
    if (Number(data.epoch) !== Number(state.initiativeEpoch || 0)) throw new Error('Фаза инициативы уже изменилась');
    const revision = Number(state.combatRevision || 0) + 1;
    const combatants = () => (state.players || []).filter(p => eligible(p, state));
    const order = () => combatants().filter(p => p.hasRolledInitiative && Number.isFinite(Number(p.initiative)))
      .sort(compareInitiative).map(p => p.id);
    if (action === 'startInitiative') {
      state.phase = 'initiative';
      state.phaseEpoch = Math.max(Date.now(), Number(state.phaseEpoch || 0) + 1);
      state.initiativeEpoch = Math.max(state.phaseEpoch, Number(state.initiativeEpoch || 0) + 1);
      state.combatSelectionEpoch = state.phaseEpoch;
      state.turnOrder = []; state.currentTurnIndex = 0; state.round = 1; state.turnHistory = [];
      for (const p of state.players || []) {
        // Positions are detached on the server; selection comes from the GM's visible map.
        p.inCombat = (data.combatantIds || []).map(String).includes(String(p.id)) && onMap(p,state);
        p.initiative = null; p.hasRolledInitiative = false; p.initiativeRevision = revision; p.initiativeRequestId = '';
        p.pendingInitiativeChoice = false; p.willJoinNextRound = false;
      }
    } else if (action === 'select' || action === 'mode') {
      for (const u of (data.updates || []).slice(0,200)) {
        const p = (state.players || []).find(p => String(p.id) === String(u.playerId));
        if (!p || !onMap(p,state)) continue;
        if (action === 'mode') {
          if (!canControl(ctx,p)) throw new Error('Нельзя менять этого персонажа');
          p.initiativeMode = ['advantage','disadvantage'].includes(u.mode) ? u.mode : 'normal';
        } else {
          p.inCombat = !!u.inCombat;
          p.pendingInitiativeChoice = p.inCombat && !p.hasRolledInitiative && state.phase === 'combat';
          p.willJoinNextRound = p.inCombat && state.phase === 'combat' && !(state.turnOrder || []).includes(p.id);
        }
      }
      if (action === 'select') state.combatSelectionEpoch = Math.max(Date.now(),Number(state.combatSelectionEpoch || 0)+1);
    } else if (action === 'roll' || action === 'manual') {
      if (!['initiative', 'combat'].includes(state.phase)) throw new Error('Сейчас нельзя назначить инициативу');
      let accepted = 0;
      for (const u of (data.updates || []).slice(0,200)) {
        const p = (state.players || []).find(p => String(p.id) === String(u.playerId));
        if (!eligible(p, state) || !canControl(ctx, p)) continue;
        if (u.total === '' || u.total === null || !Number.isFinite(Number(u.total))) throw new Error('Введите число инициативы');
        if (action === 'manual' || !p.hasRolledInitiative) {
          p.initiative = Math.max(-100, Math.min(200, Math.trunc(Number(u.total))));
          p.hasRolledInitiative = true; p.pendingInitiativeChoice = false; p.initiativeRevision = revision;
          p.initiativeRequestId = data.requestId;
          if (state.phase === 'combat' && !(state.turnOrder || []).includes(p.id)) p.willJoinNextRound = true;
        }
        accepted++;
      }
      if (!accepted) throw new Error('Нет доступных участников для инициативы');
    } else if (action === 'startCombat') {
      if (state.phase !== 'initiative') throw new Error('Сначала начните инициативу');
      if (!combatants().length || combatants().some(p => !p.hasRolledInitiative || p.initiative == null)) throw new Error('Сначала назначьте инициативу всем участникам');
      state.turnOrder = order(); state.phase = 'combat'; state.round = 1; state.currentTurnIndex = 0; state.turnHistory = [];
      state.phaseEpoch = Math.max(Date.now(), Number(state.phaseEpoch || 0) + 1);
    } else {
      if (state.phase !== 'combat' || !state.turnOrder?.length) throw new Error('Бой ещё не начат');
      if (Number(data.turnEpoch || 0) !== Number(state.turnEpoch || 0)) throw new Error('Ход уже изменился');
      const actor = (state.players || []).find(p => String(p.id) === String(state.turnOrder[state.currentTurnIndex]));
      if (!gm && (!actor || !canControl(ctx, actor))) throw new Error('Сейчас ход другого персонажа');
      state.turnHistory ||= [];
      if (action === 'previousTurn') {
        const previous = state.turnHistory.pop();
        if (!previous) throw new Error('Это первый ход боя');
        state.turnOrder = previous.turnOrder; state.currentTurnIndex = previous.currentTurnIndex; state.round = previous.round;
        for (const p of state.players || []) p.willJoinNextRound = (previous.pending || []).includes(String(p.id));
      } else {
        state.turnHistory.push({ turnOrder: [...state.turnOrder], currentTurnIndex: state.currentTurnIndex,
          round: state.round || 1, pending: (state.players || []).filter(p => p.willJoinNextRound).map(p => String(p.id)) });
        const wrapped = Number(state.currentTurnIndex || 0) + 1 >= state.turnOrder.length;
        state.currentTurnIndex = wrapped ? 0 : Number(state.currentTurnIndex || 0) + 1;
        if (wrapped) {
          state.round = Number(state.round || 1) + 1;
          state.turnOrder = order();
          for (const p of state.players || []) p.willJoinNextRound = false;
          if (!state.turnOrder.length) { state.phase = 'initiative'; state.currentTurnIndex = 0; }
        }
      }
    }
    if (['startInitiative', 'startCombat', 'endTurn', 'previousTurn'].includes(action)) {
      state.turnEpoch = Math.max(Date.now(), Number(state.turnEpoch || 0) + 1);
    }
    state.combatRevision = revision;
    return syncMap(state);
  }
  return { fields, playerFields, snapshot, syncMap, preserve, command, eligible, compareInitiative };
});
