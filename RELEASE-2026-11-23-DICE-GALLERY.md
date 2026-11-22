# Fixed creation panel and collapsible twenty-set dice catalog

The player-management width is fixed for each responsive breakpoint, so only
the character roster gains the space released by the combat column. The size
label sits immediately beside its selector; the selector grows from 60 to 80px.

Personal dice selection is a full-width native details/summary control showing
the selected set and catalog count. It starts closed when opening the dialog,
supports keyboard open/close, and builds the gallery only on first expansion.
An async profile refresh preserves an already open picker.

Ten new procedural designs join the previous ten: honey/bee, mushrooms,
porcelain, tide, stained glass, sakura, dunes, malachite, citrus and tarot.
All retain numeric D20 results with crown/skull critical accents. Busy patterns
use contrasting face medallions. No vendor photos are bundled or downloaded
by the application. The material cache now evicts unused sets beyond eight,
disposing their textures/materials before the next throw.

Visual references used for original Canvas designs:

- Honey/bee: https://urwizards.com/products/inner-dice-handmade-sharp-edge-resin-dice-set-sweet-honey
- Mushrooms: https://urwizards.com/products/luminous-white-mushroom-resin-dice-setglow-in-the-dark
- Porcelain: https://miniplanetdice.com/products/porcelain-dice-handmade-sharp-edge-7-piece-dice-set
- Tide: https://siriusdice.com/products/celestial-blue-sandstone-glass-dnd-dice-set
- Stained glass: https://dryad-games.com/shop/rosewindow-7-piece-iconic-dice-set/
- Sakura: https://dnddice.com/products/japanese-cherry-blossom-petals
- Dunes: https://www.arcknight.com/collections/signature-resins/products/sands-of-time-11-piece
- Malachite: https://urwizards.com/collections/full-set-of-dice?page=2
- Citrus: orange-jelly and fruit resin designs at https://urwizards.com/
- Tarot: https://urwizards.com/products/urwizards-d-d-blue-sandstone-engraved-dice-set-tarot

Validation: 118 root tests, backend syntax, 14-size/all-phase viewport and
fixed-width checks, twenty unique previews and critical faces, keyboard picker,
five-client style relay, bounded GPU textures, dice regression and combat/3D HUD.

Backend deployment changes shared/appearance.js only, with backup and restart
to refresh its in-memory validation catalog. Private profiles, .env and uploads
are preserved; no database or subscription changes are needed.
