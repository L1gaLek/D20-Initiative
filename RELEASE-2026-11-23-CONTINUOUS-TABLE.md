# Continuous room table and actual room-entry fix

The production joinedRoom handler previously set the main container to block,
overriding its column flex layout. That bypassed viewport height distribution
and pushed panels out of view. The handler now uses flex. Browser fixtures
enter through this real handler rather than manually forcing the layout.

Header, workspace and footer have no gaps. A single wood perimeter and shared
panel surface surround fine continuous internal dividers. Panel corner radii,
separate outer shadows and sidebar gaps are removed; inner controls and sheets
retain their own styling. The tool rail shares the table's outer surface.

Footer height follows a viewport fraction instead of a fixed minimum, leaving
room for all panels in short windows and at larger browser zoom. Long contents
scroll inside their panels. Exploration still reclaims the turn-column width.

Validation:

- Root npm test: 117 passed.
- Workspace matrix through actual room entry: 14 viewport sizes, including
  short windows and CSS viewport equivalents for 50–200% desktop zoom. Every
  frame's bounds stay inside the window in all phases for GM and player.
- Continuous header/workspace/footer and left-column joins are asserted.
- Horizontal roster, owner/name search and sheet opening remain functional.
- Shared dice browser regression passed with the real room-entry path.
- Full five-client multiplayer, character-sheet, 3D and Studio regression passed.

No backend, database or additional network subscription changes.
