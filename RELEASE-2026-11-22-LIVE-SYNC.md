# Live room synchronization — 2026-11-22

## Behavior

- Character sheets send changed paths rather than complete sheets. Health,
  temporary health, death saves, conditions and appearance changes flush at once;
  ordinary text keeps its 450 ms debounce and recoverable local draft.
- Each character has one unacknowledged batch. Later input waits for its receipt,
  then sends only the remaining changes. Acknowledged health values cannot be
  resubmitted with later notes. Editor snapshots distinguish local edits from
  changes made through another window or controller. Mini-card HP uses this path.
- Short-lived sheet/equipment and initiative previews are separate from game
  state. They expire or roll back after rejection; pending initiative never
  counts toward starting combat. Both 2D and 3D tokens show live sheet visuals.
- Pure combat/sheet commands use an atomic UPDATE conditioned on the cached
  PostgreSQL row version. A warm command takes one database query instead of the
  five-query transaction path. Conflicts reload and retry; repeated contention
  falls back to the existing locked transaction. Complex inventory/access writes
  retain their transactions. Success is acknowledged only after persistence.
- Exploration deltas publish after 60 ms, independently of their 650 ms batched
  save. Manual fog changes also publish previews. Commits preserve newer pending
  deltas; failed saves restore authoritative fog. Maps retain separate masks.
- WebSocket control/presentation traffic bypasses slow game writes. Room lifecycle
  transitions fence both queues, and AsyncLocalStorage keeps reply metadata local
  to its request. Ordered game commands retain their order.
- Reconnecting clients replay missed public events from a separate stream cursor.
  Private replies do not create false gaps. The journal is bounded to 16 MiB
  globally, 2 MiB / 512 events per room, 128 rooms and a 120-second window. Epoch
  changes, expiry and overflow use a snapshot plus events committed during its
  load. Commits remain journaled while every socket is disconnected.
- The new initial handshake supplies the room snapshot once; it replaces the
  client's duplicate table hydration. Older clients keep their existing path.
  Room log snapshots return the most recent entries in chronological order.

## Supabase usage

No migrations, additional subscriptions, polling loops or database event journals.
Existing versioned room caching, bounded read caching and lazy model loading stay
in use. Reconnect replay and live previews run on Timeweb. Database writes return
small version/timestamp receipts, not complete sheets. Actual billed savings
depend on play patterns and must be assessed in subsequent usage periods.

## Validation

- `npm test`: 95 tests passed, including concurrency, foreign writers, duplicate
  commands, failed persistence, draft recovery and bounded replay.
- `npm --prefix backend test`: syntax passed.
- Full isolated five-browser suite: combat, ownership/control, sheets, equipment,
  chat, 2D/3D, models, Studio and movement passed.
- `D20_SYNC_ONLY=1`: real backend WS dispatcher, scheduler and reconnect handlers
  with isolated storage: held database write, 2D/3D HP preview, heartbeat,
  concurrent notes/HP, mini-card changes, short reconnect, restart snapshot and
  map-local fog deltas passed.
- Player-room writes in tests use isolated adapters, not production data.

Frontend cache tag: `20261122-sync-1`. Backend is deployed before the matching
frontend, and legacy events remain supported for already-open clients.
