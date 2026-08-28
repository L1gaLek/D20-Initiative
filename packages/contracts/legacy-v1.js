(function exposeLegacyV1(root, factory) {
  const contract = factory();
  if (typeof module === 'object' && module.exports) module.exports = contract;
  if (root) root.D20LegacyV1Contract = contract;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createLegacyV1Contract() {
  'use strict';

  function route(method, path, auth = true) {
    return Object.freeze({ method, path, auth });
  }

  const HTTP_ROUTES = Object.freeze([
    route('POST', '/session', false),
    route('GET', '/rooms'),
    route('POST', '/rooms'),
    route('POST', '/rooms/:roomId/update'),
    route('DELETE', '/rooms/:roomId'),
    route('POST', '/rooms/:roomId/join'),
    route('POST', '/rooms/:roomId/leave'),
    route('POST', '/rooms/:roomId/kick'),
    route('POST', '/rooms/:roomId/ban'),
    route('GET', '/rooms/:roomId/state'),
    route('POST', '/rooms/:roomId/state'),
    route('GET', '/rooms/:roomId/rows/:table'),
    route('POST', '/rooms/:roomId/log'),
    route('POST', '/rooms/:roomId/dice'),
    route('POST', '/rooms/:roomId/detached/replace'),
    route('GET', '/characters'),
    route('POST', '/characters'),
    route('GET', '/characters/:characterId'),
    route('DELETE', '/characters/:characterId'),
    route('POST', '/characters/migrate-legacy'),
    route('GET', '/campaign-saves'),
    route('POST', '/campaign-saves'),
    route('GET', '/campaign-saves/:saveId'),
    route('DELETE', '/campaign-saves/:saveId'),
    route('GET', '/tavern/chat'),
    route('POST', '/tavern/chat'),
    route('GET', '/tavern/announcements'),
    route('POST', '/tavern/announcements'),
    route('PUT', '/tavern/announcements/:announcementId'),
    route('DELETE', '/tavern/announcements/:announcementId')
  ]);

  const WS_CLIENT_TYPES = Object.freeze([
    'joinRoom', 'joinTavern', 'leaveRoom', 'ping', 'pong', 'presenceTouch',
    'state', 'startInitiative', 'startCombat', 'startExploration', 'endTurn',
    'rollInitiative', 'rollInitiativeAllOwned', 'initiativeApplied', 'initiativeReset',
    'setPlayerInCombat', 'setPlayersInCombatBulk', 'setInitiativeMode',
    'movePlayer', 'moveToken', 'removeTokenFromBoard', 'setTokenVisibility',
    'addPlayer', 'playerCreate', 'playerPatch', 'playerDelete',
    'addWall', 'removeWall', 'wallRow', 'wallDelete',
    'addMark', 'moveMark', 'removeMark', 'clearMarks', 'markRow', 'markDelete', 'marksReplace',
    'setFogSettings', 'fogStampBatch', 'fogFill', 'fogClearExplored', 'fogAddExplored', 'fogRow',
    'mapMetaRow', 'mapMetaDelete', 'musicRow', 'bgMusicSet',
    'logRow', 'tavernLogRow', 'diceEvent', 'inventoryTransferOffer',
    'inventoryTransferResult', 'coinsTransfer', 'setPlayerSheet'
  ]);

  const WS_SERVER_TYPES = Object.freeze([
    'joinedWsRoom', 'rooms', 'roomsError', 'joinedRoom', 'roomUpdated', 'users',
    'state', 'statePatch', 'tokensInit', 'tokenRow', 'tokenRowDeleted',
    'playerCreate', 'playerPatch', 'playerDelete', 'initiativeApplied', 'initiativeReset',
    'mapMetaRow', 'mapMetaDelete', 'wallRow', 'wallDelete', 'markRow', 'markDelete',
    'marksReplace', 'fogRow', 'musicRow', 'logInit', 'logRow', 'diceInit', 'diceEvent',
    'moderationEvent', 'inventoryTransferOffer', 'inventoryTransferResult',
    'coinsTransferResult', 'error', 'ping', 'pong'
  ]);

  function hasUniqueValues(values) {
    return Array.isArray(values) && new Set(values).size === values.length;
  }

  return Object.freeze({
    version: 1,
    HTTP_ROUTES,
    WS_CLIENT_TYPES,
    WS_SERVER_TYPES,
    hasUniqueValues
  });
});
