// Shared helpers for room-scoped Supabase realtime channels.
// Keeps existing transport behavior intact while reducing repeated
// subscribe/unsubscribe boilerplate across network modules.

async function replaceRealtimeChannelSlot(getCurrent, setCurrent, buildNext) {
  const current = (typeof getCurrent === 'function') ? getCurrent() : null;
  if (current) {
    try { await current.unsubscribe(); } catch {}
    try { setCurrent(null); } catch {}
  }

  const next = (typeof buildNext === 'function') ? buildNext() : null;
  try { setCurrent(next || null); } catch {}
  if (!next || typeof next.subscribe !== 'function') return null;
  await next.subscribe();
  return next;
}


async function unsubscribeRealtimeChannelSlots(slots = []) {
  const seen = new Set();
  for (const slot of (Array.isArray(slots) ? slots : [])) {
    const getCurrent = (slot && typeof slot.getCurrent === 'function') ? slot.getCurrent : null;
    const setCurrent = (slot && typeof slot.setCurrent === 'function') ? slot.setCurrent : null;
    const current = getCurrent ? getCurrent() : null;
    if (current && !seen.has(current)) {
      seen.add(current);
      try { await current.unsubscribe(); } catch {}
    }
    if (setCurrent) {
      try { setCurrent(null); } catch {}
    }
  }
}

async function subscribeRoomScopedTableChannel(options = {}) {
  const {
    roomId,
    table,
    channelName = '',
    event = '*',
    schema = 'public',
    onPayload = null,
    getCurrent = null,
    setCurrent = null
  } = options || {};

  if (!USE_SUPABASE_REALTIME) {
    await stopSupabaseRealtimeChannels();
    return null;
  }

  await ensureSupabaseReady();

  const rid = String(roomId || '').trim();
  if (!rid || !table || typeof onPayload !== 'function') return null;

  const name = String(channelName || `db-${table}-${rid}`);
  return replaceRealtimeChannelSlot(
    getCurrent,
    setCurrent,
    () => sbClient
      .channel(name)
      .on(
        'postgres_changes',
        { event, schema, table, filter: `room_id=eq.${rid}` },
        (payload) => {
          try { onPayload(payload || {}); } catch {}
        }
      )
  );
}

window.replaceRealtimeChannelSlot = replaceRealtimeChannelSlot;
window.unsubscribeRealtimeChannelSlots = unsubscribeRealtimeChannelSlots;
window.subscribeRoomScopedTableChannel = subscribeRoomScopedTableChannel;
