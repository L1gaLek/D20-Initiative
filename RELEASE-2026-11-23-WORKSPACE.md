# Horizontal room workspace and character roster

The creation controls and character roster now sit in a full-width lower row
under the journal/dice column, map and turn queue. Creation stays compact while
the roster has substantially more room. Character cards run horizontally by
owner with native scrolling. All is the initial view; Mine and Others remain
available. A local, debounced search matches character or owner names and shows
the result count and an empty state without any database requests.

The journal and dice table occupy equal halves of the left column. The map,
turn queue and initiative choices share the upper row. The row can grow with a
larger personal board frame, retaining the expandable initiative panel. Laptop
and phone layouts adapt without overflowing the room; on mobile the floating
tool rail is horizontal and flyouts open above it. The room header, map surround
and tool rail use the existing quiet green/bronze palette. Existing sheet,
character card, journal, dice and turn-panel themes remain intact.

An empty viewport preference previously became numeric zero and was clamped to
five cells. Missing values now retain the documented ten-cell default; explicit
saved sizes are preserved.

No backend, database, realtime or large media changes are involved.

Validation:

- Root `npm test`: 117 tests passed.
- Full five-client multiplayer, initiative, health/access, 3D and Studio browser
  regression passed, including initiative-panel growth with the board.
- Shared dice browser suite passed.
- Workspace browser checks cover bottom-row placement under all three panes,
  equal journal/table heights, 29-character horizontal roster, All/Mine and
  name/owner search, empty state, sheet opening and laptop/mobile fit.
- Explicit checks verify missing/invalid viewport preferences use the default
  while a saved size is retained.
