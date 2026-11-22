# Dice journal timing and expanded controls — 2026-11-22

Live dice results enter the visible event journal when their dice finish on the
shared tray. Persistence and event delivery still happen immediately. Dice logs
carry a correlation nonce through the existing log relay, so delivery order does
not reveal results before animation and repeated equal results remain distinct.
Other game events and chat remain immediate. Historical snapshots defer only
already pending throws; missing visual events and stalled rendering have bounded
fallbacks. Leaving a room drops its pending display callbacks.

The expanded tray now has a die selector, quantity input with minus/plus buttons
(1–20), and a throw button. It shares the existing standard-roll implementation,
random result generation, journal, relay and role/busy guards. The selected values
also update the main dice controls. The dialog stays open during and after a roll.
The controls fit mobile widths and spectators cannot submit throws.

No backend/schema changes, extra database requests or animation-frame broadcasts.
The renderer and physics assets retain their cache versions; changed client
scripts/styles use `20261122-dice-controls-1`.

Validation:

- `npm test`: 105 tests passed, including log settlement, reversed delivery,
  identical throws, history, cancellation, bounded memory and fallback timeouts.
- Isolated five-browser dice suite: journals update after their local tray
  settles, unrelated events stay immediate, expanded controls roll the selected
  type/count through the real relay, spectators are blocked, and mobile steppers
  keep the existing count limit.
- Existing multiplayer/3D/Studio regression suite passed using isolated storage.
