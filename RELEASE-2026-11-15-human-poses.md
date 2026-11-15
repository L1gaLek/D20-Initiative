# Human stances, fitted hand equipment and female characters

- Swords now align to a palm frame derived from finger joints. Fingers wrap the
  grip and the thumb closes across it. Both hands and all sword variants use the
  same attachment, which remains aligned throughout the walk cycle.
- Shields follow the lower arm, face along the palm, and have two fitted forearm
  straps plus a separate back grip. The curved wooden back clears the arm and
  bracer. Right-hand and left-hand shields are mirrored consistently.
- Added automatic unarmed, single-weapon, dual-weapon and shield stances for
  both bodies. Walking keeps the selected stance and returns to it when stopped.
- A shield occupies one hand. Equipping a weapon in that hand moves the shield
  to the other hand and clears that weapon slot to `—`. Removing the shield
  permits two weapons again. Legacy conflicting saves resolve safely on display.
- Added a locally bundled anatomical female human, matching the male model's
  13,380 vertices, 26,756 base triangles and 163 joints. All 11 armor variants,
  swords, shields, colors and walking work on both models. Female underwear and
  soft armor span the torso smoothly.
- Male hairstyles: short, side part, slicked back, ponytail, mohawk, bald. Female
  hairstyles: pixie, bob, long waves, braid, bun, ponytail, bald. Each gender's
  selected style is remembered when switching; existing saves retain compatible
  styles and color. The ponytail and bald choices are shared.
- Both assets retain their pinned CC0 source/license and reproducible converter.
  Added optional `appearance.slots.shieldHand` and
  `appearance.model3d.hairStyles` inside the existing saved-sheet JSON. No backend
  deployment or database migration is required.

Validation: 37 automated tests, including both bodies/all armor, hairstyle
fallback/history, conflicting equipment, actual fingertip-to-hilt alignment,
shield clearance during walking, valid geometry/weights and skeleton disposal.
Multiplayer browser checks cover hand swapping and persisted empty slots, all
female armor and hair choices, gender switches, GPU replacement, mobile layout,
read-only sheets and walking on owner/GM clients. Visual QA includes palm/back
views of the grip, shield straps and both bodies in all four stances. Player data
is not used or modified by these isolated checks.
