# Personal cabinet, prepared characters and game statistics

My Settings is available both in the tavern and beside Room Details. Its three
tabs are My Characters, Statistics and Settings. Users can create a base outside
a room, edit the full sheet, import JSON, save changes, create independent saved
versions and later load them through the existing room saved-base interface.

Inside a room, the selected saved sheet also offers Add to Game. The backend
loads the authenticated user's own save and, under the room lock, verifies room
membership, Player/GM role and absence of an existing owned base. Duplicate
requests are idempotent; concurrent imports cannot create two bases. The new
base is broadcast through the existing playerCreated event, without automatic
placement or combat participation. Saved sheets and in-game sheets remain copies.

The server collects statistics from authenticated live dice events, committed
sheet changes and connected room sessions. Multiple tabs count time once;
duplicate HTTP/WS dice delivery counts once. Statistics include room time and
visits, favorite race/class by played time, rolls/D20/natural 20/1, per-game
critical records, damage totals and records, knockdowns, deaths and stabilization.
A game ends after 30 minutes of inactivity for that user's room session. Damage
means rolled base-character damage during combat, before mitigation; the turn
record sums rolls during that character's own logical turn. The UI explains
these definitions and the start date. No historical statistics are invented.

Account preferences cover critical/chat sounds, notification volume, critical
effects and reduced dice animation. They apply locally immediately and sync
through the authenticated profile API. Failed synchronization is visible and
retryable; existing critical-sound opt-outs are retained.

Statistics and settings are stored privately on Timeweb in
`backend/data/user-profiles.json`, excluded from Git and frontend assets. Writes
use a temporary file plus atomic rename and a previous backup; settings flush
immediately, statistics every 15 seconds and on process shutdown. No Supabase
schema changes, extra Realtime subscriptions, or per-action statistics queries
are introduced. Preserve this directory across deployments and server backups.

Validation: 117 unit/regression tests, backend syntax, five-browser personal
cabinet and dice scenarios, full multiplayer/3D/Studio regression. Tests use
isolated database/profile adapters; production player records are not test data.
