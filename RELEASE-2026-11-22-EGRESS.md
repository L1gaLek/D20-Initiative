# Shared Pooler Egress and client responsiveness

Room mutations still commit before acknowledging success. Under the existing
transaction/row locks, Postgres returns the room JSON only when its `xmin` row
version differs from the server cache. Each update returns its new version; the
server publishes that cache entry only after commit. External writers, cold
caches and cache eviction fall back to reading the current database row. No
schema migration, new database service or delayed persistence is involved.

Shared read caching coalesces identical map/fog/wall/mark/music reads across
players. Entries expire after 30 seconds and app writes/campaign restoration
invalidate them immediately. In-flight reads invalidated by a write retry once;
continuous painting returns an uncached snapshot instead of repeating SELECTs
indefinitely. Caches are bounded (room JSON: 64 MiB/64 entries; shared rows:
16 MiB/128 entries). Admin changes to detached tables outside this server can
take up to the 30-second read-cache TTL to appear.

Fog/music writes return only their database timestamp, with validated content
forwarded from the server to clients. Map bounds are cached per room/map;
collision checks return only intersecting tokens. Ordinary state updates keep
the existing short membership cache, while ownership/role/moderation events
still invalidate access. Unchanged map metadata is no longer rewritten on every
map switch.

Token updates bypass full board/wall rendering, recompute fog once, and skip
identical preview/confirmation coordinates. Plate models load only when equipped,
with temporary procedural armor while the asset is loading. Quality, skeletons,
Studio integration and on-disk assets are unchanged.

Validation:

- 84 automated tests, plus multiplayer browser, map isolation and full 3D suites.
- A 40-save isolated fixture with approximately 1 MiB of room JSON returned
  42,037,200 bytes before versus 1,050,930 bytes after (97.5% less room JSON).
  This measures that scenario, not total billed egress or all protocol bytes.
- Same local browser fixture (60x45, 12 tokens, 350 walls, dynamic fog): median
  token update 18 ms before versus 8.3 ms after; p95 20.3 versus 9 ms.
- Browser checks confirm no unused plate downloads, one fetch for the selected
  male model, and no duplicate wall/fog render for an unchanged confirmation.

Server logs `[egress-cache]` cumulative cache-hit/load counts and approximate
full room JSON bytes every five minutes when used. They contain no player text,
room identifiers, credentials or authentication tokens. Compare actual Supabase
Shared Pooler usage over similar gaming sessions; existing usage is not reset.

Deploy `backend/server.js` and `backend/shared/room-read-cache.js` together.
Frontend release URL version: `20261122-egress-1`. Keep the server environment,
uploads, database, PM2 settings and S3 configuration intact.
