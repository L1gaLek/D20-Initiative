# 3D combat, fog and map editor — 2026-11-15

- Removed the isometric renderer and its controls. Only 2D and 3D remain; old saved isometric preferences fall back to 2D.
- Shared the existing combat movement model between both views, including walls, occupied cells, remaining speed, teleportation and dash rules. The 3D view now renders reachable cells and provides a personal Dash button and movement counter. Changing turns clears the previous actor's controls.
- Replaced flat-looking 3D fog with raised animated unknown regions and lower, lighter explored mist. Player scenes still omit undiscovered actors and walls. GM visibility remains personal.
- Preserved magical wall types in the 3D adapter and rendered them as translucent cyan/violet energy with animated runes.
- Reorganized the map editor into view, personal viewport, shared map size and background sections, with consistent spacing, visible steppers, a close button and narrow-screen layout.

Validation: `npm test` passed (70 JavaScript syntax checks and 29 unit/regression tests). The complete isolated five-browser multiplayer suite passed, including real walk/dash movement and peer updates, turn changes, fog privacy, magical walls, desktop/mobile map editor controls and existing initiative, character sheet and 3D camera behavior. No production room data was modified by these tests.

Deployment target: GitHub Pages at https://l1galek.github.io/D20-Initiative/. No backend or database changes are required.
