# Critical D20 feedback and personal character library — 2026-11-22

Natural 20 and 1 are classified per physical D20, including initiative, attacks,
checks and multiple dice. Gold/red halos surround the affected dice after landing;
short synthesized success/failure sounds share the tray's event deduplication.
Historical rolls stay silent. Effects stop animating after 1.5 seconds, dispose
their geometry/materials on the next throw, and respect reduced motion. Numerical
fallbacks keep critical highlighting. Sounds can be disabled in My Settings.

The tavern's distinct My Settings button opens the user's saved base characters.
The list fetches metadata only; selecting a character loads one complete sheet.
The existing full editor uses a private transport with automatic changed-field
saves. Versions remain independent and New Save creates a new snapshot in the
same family. Legacy saves group by normalized name; subsequent edits retain the
family across renames. Newly saved room bases use a stable character key, which
also survives loading into another room. Token access controls and room actions
are unavailable in the personal editor. Closing restores the room context while
unacknowledged private drafts retain their own retry transport.

The authenticated PATCH character endpoint restricts edits to parsed sheet paths
and checks ownership on reads and writes. A bounded 16 MiB/64-entry cache avoids
reading the full sheet on each warm edit. xmin compare-and-swap retries merge
independent edits from multiple tabs; bounded request receipts make retries
idempotent. Responses contain small acknowledgements, not complete sheets.
No database schema, RLS, connection or subscription changes are required.

Player Management keeps the existing controls and IDs in a compact themed card.
Browser measurements verify that its outer width and height do not increase.

Validation:

- `npm test`: 111 tests passed.
- Backend syntax check passed.
- Five-browser shared dice suite: per-die critical effects, real audio scheduling,
  deduplication, idle rendering, all dice shapes, journal timing, expanded controls,
  mixed damage, reduced motion, mobile and WebGL fallback passed.
- Personal library browser suite: scoped lists, editable notes, independent
  snapshots, close/reopen, transient write retry, mobile, room isolation and
  management dimensions passed.
- Full multiplayer/3D/Studio browser regression passed.
- Live Supabase metadata projection was checked with LIMIT 0, without reading or
  modifying player sheets.

Deployment: back up and replace only backend/server.js and add
backend/shared/character-store.js on Timeweb; publish the frontend to the existing
GitHub Pages subpath. Existing model/texture asset versions remain unchanged.
