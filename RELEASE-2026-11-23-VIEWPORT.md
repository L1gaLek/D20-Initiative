# Room viewport fit

The room now fills the browser viewport instead of adding fixed-height panels
below the fold. Header, map workspace and lower character panels stay visible
at 100% zoom. Long journals, rosters, creation controls and initiative lists
scroll inside their own panels. Journal and dice table retain equal heights.

Exploration uses two columns, with the map reaching the header/footer's right
edge. Initiative and combat insert the turn column and reduce the map width;
returning to exploration releases the space immediately for every role.
The actual map viewport fills its container without green side strips.

Old personal cell-count preferences no longer set frame pixel dimensions. The
map editor explains automatic sizing; the GM's actual map size controls and
2D pan/zoom are preserved. A viewport meta tag enables native mobile sizing.
Combat header height is consistent between GM and players despite GM-only
controls. Phase selection closes its flyout to keep the queue accessible.

The room background is a lightweight CSS wood surface. Existing panel and
sheet themes remain intact. On narrow screens, map/queue share the upper area,
journal/table share the next area, and the toolbar has its own clear space.

No backend, database, subscription or media changes were needed.

Validation:

- Root npm test: 117 passed.
- Full five-client multiplayer, character sheet, 3D and Studio regression passed.
- Workspace browser matrix: 1920x1080, 1536x864, 1366x768, 1280x720,
  1024x768 and 390x844; GM/player geometry matches despite different saved
  viewport preferences, all phases fit, exploration reclaims queue space.
- Horizontal roster/search/empty state/sheet opening remain functional.
