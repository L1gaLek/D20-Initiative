# Room panels and inline dice table

The event journal and Users and Characters panel use compact themed headers,
readable entries, grouped owner cards and quieter selection states. Their outer
widths stay unchanged: 522 px and 282 px in the desktop room layout. Initiative
is shown as a separate small badge; unassigned initiative is a dash.

The separate Roll frame and its legacy canvas/result DOM are removed. Its die
selector, quantity stepper and submit button now belong to the renamed Dice
Table, directly below the journal. The table matches the journal's width and
has a taller 250 px stage. The enlarged dialog remains available and shares the
same roll handler, choices, permissions and busy state. Removed legacy canvas
references are already optional; rolls use the one existing shared renderer.

No backend, database, realtime or media asset changes. Dice results and journal
timing continue through the existing event relay. Unrelated local documentation
and uncommitted asset work remain untouched.

Validation:

- Browser measurements verify unchanged journal/player widths and a wider,
  taller shared table on GM and Player clients.
- Inline 2d8 sends one real event and reaches five separate clients without
  opening a dialog; quantities stay within 1–20 and spectator submissions fail.
- Long names and controls stay inside cards. Shared dialog selection and mobile
  control layout are checked, with visual review of journal/cards/table.
- Shared dice browser suite checks every die shape, critical effects/audio,
  journal settlement, duplicate delivery, mixed damage, resource cleanup,
  expanded controls and WebGL fallback.
- Root tests and full multiplayer/3D/Studio browser regression are run before
  publication to the existing GitHub Pages site.
