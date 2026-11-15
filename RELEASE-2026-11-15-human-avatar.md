# Human male 3D character — 2026-11-15

- Added an original articulated human male miniature for characters whose sheet race is Human/Человек and gender is male. Other races, monsters and active wild shapes keep their existing representation.
- The appearance comes directly from worn inventory slots. Every armor entry in `equipment_srd5_ru.json` has its own construction/material: leather, studded leather, hide, chain shirt, scale mail, breastplate, half plate, ring mail, chain mail, splint and plate. Equipped shields and swords attach to the hands; a shield occupies the left hand visually. Unequipped characters wear opaque boxer shorts with a bare torso.
- Added six hairstyles and a custom hair color picker with seven palette choices. Appearance is stored in the existing character sheet JSON and uses the same automatic saves, permissions, imports and saved bases as other sheet fields.
- Reorganized Character/Персонаж with a rotating, zoomable 3D preview, a walk preview button, customization controls and worn equipment. Kept the 2D image/token settings. The narrow layout uses a compact navigation rail and one content column.
- Real movement animates translation, facing, alternating legs/knees/arms and body motion on each client. Visual routes avoid walls, occupied cells and hidden regions. Unroutable or newly hidden movement snaps safely. Changing maps or leaving 3D clears animation. Stationary characters stop rendering; model replacement and modal closing dispose GPU resources.

Validation: 75 JavaScript syntax checks and 31 unit/regression tests passed. The isolated five-browser suite covers every database armor entry, equipment and hair changes reaching peers, save/reopen, preview rotation and walking, resource replacement, read-only access, desktop/mobile widths and real map movement on owner/GM clients. Existing multiplayer, character sheet and 3D regressions remain covered. Tests do not write to production rooms.

Deploy the frontend to https://l1galek.github.io/D20-Initiative/. No backend or database migration is required.
