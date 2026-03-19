// Room ownership / room lifecycle DB helpers extracted from client/core-helpers-network.js.

function getRoomMetaFromState(state) {
  const meta = (state && typeof state === 'object' && state.roomMeta && typeof state.roomMeta === 'object')
    ? state.roomMeta
    : {};
  return {
    ownerId: String(meta?.ownerId || '').trim(),
    ownerName: String(meta?.ownerName || '').trim(),
    createdAt: String(meta?.createdAt || '').trim(),
    updatedAt: String(meta?.updatedAt || '').trim()
  };
}

function getCurrentStableUserId() {
  return String(getAppStorageItem('int_user_id') || myId || '').trim();
}

async function loadRoomOwnershipMap() {
  const { data, error } = await sbClient
    .from('room_state')
    .select('room_id,state');
  if (error) throw error;

  const result = new Map();
  for (const row of (data || [])) {
    const roomId = String(row?.room_id || '').trim();
    if (!roomId) continue;
    result.set(roomId, getRoomMetaFromState(row?.state));
  }
  return result;
}

async function findOwnedRoomByUserId(userId, excludeRoomId = '') {
  const uid = String(userId || '').trim();
  const excluded = String(excludeRoomId || '').trim();
  if (!uid) return null;
  const ownership = await loadRoomOwnershipMap();
  for (const [roomId, meta] of ownership.entries()) {
    if (excluded && roomId === excluded) continue;
    if (String(meta?.ownerId || '') === uid) return { roomId, meta };
  }
  return null;
}

async function requireOwnedRoom(roomId, userId) {
  const rid = String(roomId || '').trim();
  const uid = String(userId || '').trim();
  if (!rid || !uid) return { ok: false, message: 'Комната не найдена.' };

  const { data, error } = await sbClient
    .from('room_state')
    .select('room_id,phase,current_actor_id,state')
    .eq('room_id', rid)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, message: 'Комната не найдена.' };

  const meta = getRoomMetaFromState(data.state);
  if (!meta.ownerId || meta.ownerId !== uid) {
    return { ok: false, message: 'Вы можете управлять только своей комнатой.' };
  }

  return { ok: true, stateRow: data, meta };
}

async function deleteRoomCascade(roomId) {
  const rid = String(roomId || '').trim();
  if (!rid) return;
  const tables = [
    'room_members',
    'room_log',
    'room_dice_events',
    'room_tokens',
    'room_map_meta',
    'room_walls',
    'room_marks',
    'room_fog',
    'room_music_state',
    'room_bans'
  ];
  for (const table of tables) {
    const { error } = await sbClient.from(table).delete().eq('room_id', rid);
    if (error) throw error;
  }
  const { error: stateErr } = await sbClient.from('room_state').delete().eq('room_id', rid);
  if (stateErr) throw stateErr;
  const { error: roomErr } = await sbClient.from('rooms').delete().eq('id', rid);
  if (roomErr) throw roomErr;
}

