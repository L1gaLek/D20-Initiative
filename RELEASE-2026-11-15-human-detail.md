# Detailed human player miniature

- Replaced the primitive body with a continuous anatomical adult male mesh:
  shaped face, ears, hands/fingers, feet, chest and limbs, with 163 weighted joints.
- Fitted eyes and brows, skin/lip shading, combed hair detail; all six hairstyles
  and existing saved hair colors remain supported.
- Fitted all 11 database armor types to the new body. Added mail rings, scales,
  leather stitching/studs, smooth plate panels, rolled edges, overlapping waist
  plates, straps, rivets, buckle, boots, soles and laces.
- Detailed sword blade cross section, fuller, guard, wrapped grip and pommel;
  curved shield face, metal rim, rivets, wooden rear and leather straps.
- Preserved automatic equipment updates, portrait orbit/zoom and synchronized
  walking. Clothing uses the same skeleton as the body. Opaque underwear remains
  visible when no armor is equipped.
- Batched fittings and clothing by material; omitted hidden armored skin. A fully
  equipped plate model uses 17 draw calls. Skeleton bone textures are disposed
  when replacing a figure or closing its view.
- Bundled the CC0 anatomical asset locally with pinned source, hashes, license
  and a reproducible converter. No new backend, schema or saved-sheet fields.

Validation: JavaScript syntax and 33 automated tests; full isolated multiplayer
browser regression, including all armor variants, persisted appearance, read-only
sheets, walking on both clients, rapid movement commands, mobile layout and GPU
resource replacement. Visually inspected the face, underwear, armor, shield,
sword, gait, character tab and actual map. Tests do not write to player data.
