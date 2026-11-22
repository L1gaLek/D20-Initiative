# Shared physical dice tray — 2026-11-22

The **Броски других** frame now contains a 3D felt tray. Dice fall, rotate,
collide and settle, with a separate total and player color for each throw.
The roller also sees their dice. The existing numerical results and journal
remain authoritative: the animation consumes the existing dice event and assigns
its confirmed values to the physically resting faces without rerolling.

- d2, d4, d6, d8, d10, d12, d20 and percentile d100 (two d10 dice).
- Multiple dice, mixed weapon damage and fixed bonuses retain their exact values.
- Nearby simultaneous throws can share the tray; later throws use a bounded
  queue. Large throws are displayed in batches of up to 40 physical dice.
- A button expands the same canvas into a larger dialog. The compact tray also
  fits the mobile layout.
- Duplicate deliveries do not replay the same throw. Initial history is recorded
  without animating old rolls; leaving a room clears its tray and pending work.
- Physics runs in a dedicated worker using vendored Cannon ES 0.20.0 (MIT).
  Three.js is reused from the existing vendor directory. Both load lazily.
- Rendering stops after settling or when hidden. Reduced-motion preferences and
  browsers without WebGL preserve a static numerical result.
- A multi-die roll keeps one short legacy numerical animation instead of waiting
  for every die sequentially before broadcasting the event.

This release changes only the client. It adds no database writes, subscriptions
or network messages for animation frames; each browser simulates locally from
the existing event. Backend and Supabase configuration remain unchanged.

Validation: 98 unit tests passed, including convex geometry, percentile/mixed
event parsing and deterministic physical settlement. The five-browser dice suite
checked real dice relays, matching resting values/positions, twenty-die controls,
forty percentile meshes, concurrent actors, duplicate echoes, sleeping rendering,
resource bounds, expanded/mobile layouts and WebGL fallback. The complete existing
multiplayer/3D/Studio regression suite also passed. Tests used isolated room data.

Cache tag: `20261122-dice-1`.
