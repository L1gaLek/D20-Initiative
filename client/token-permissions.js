// Ownership stays separate from the permission to play a character.
function canControlToken(player, userId = myId, role = myRole) {
  if (!player) return false;
  if (String(role) === 'GM') return true;
  if (String(role) !== 'Player' || !String(userId || '')) return false;
  return String(player.ownerId || '') === String(userId)
    || String(player.controllerId || '') === String(userId);
}
window.canControlToken = canControlToken;

function mergeNewestTokenAccess(target, source) {
  const current = new Map((source?.players || []).map(player => [String(player.id), player]));
  for (const player of (target?.players || [])) {
    const previous = current.get(String(player.id));
    if (previous && Number(previous.affiliationUpdatedAt || 0) > Number(player.affiliationUpdatedAt || 0)) {
      for (const key of ['isAlly', 'isEnemy', 'affiliationUpdatedAt']) player[key] = previous[key];
    }
    if (!previous || Number(previous.accessUpdatedAt || 0) <= Number(player.accessUpdatedAt || 0)) continue;
    for (const key of ['ownerId', 'ownerName', 'ownerRole', 'controllerId', 'controllerName', 'accessUpdatedAt']) {
      player[key] = previous[key] ?? null;
    }
  }
  return target;
}
