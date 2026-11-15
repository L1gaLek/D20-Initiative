# 3D camera, rendering, backgrounds and cursors

- The map viewport hides native scrolling in 3D, including after size changes.
  Switching back to 2D restores scrolling and the saved position.
- Middle drag follows L1Volt's screen-plane pan: camera Right/Up, scale from
  focus depth, 1.5 sensitivity and 35ms exponential camera follow. Right drag
  rotates; wheel zooms toward the pointer. Touch orbit/pinch remain available.
- Camera rendering follows the display refresh rate, with no 30fps cap.
  Idle scenes sleep; animated fog updates at 10fps when the camera is still.
  Hover no longer snapshots the whole room. Each figure uses shared merged
  body geometry, selection/name changes rebuild only the affected figure, and
  pointer picking uses bounding proxies. A seven-token test scene uses around
  30 draw calls. This is a rendering-work measurement, not a hardware FPS claim.
- Antialiased, two-tone cell boundaries remain readable over map images. The
  personal 3D grid switch is independent of the shared 2D opacity. Known cells
  highlight on hover even without a selected token. Hidden geometry remains
  absent from player scenes.
- Background loading retries transient failures (including stale browser CORS
  cache), cancels superseded requests and supports manual retry. Texture uploads
  preserve aspect ratio and are capped at 4096px / approximately 8 megapixels.
- Native 36px SVG cursors replace the old 46–48px cursors: arrow, selection,
  pressed, open/closed hand, movement, rotation, crosshair, text and unavailable.

## Storage operation

The Timeweb S3 bucket previously had no CORS configuration. Added public-image
GET/HEAD CORS for `https://l1galek.github.io` and the existing Timeweb frontend
origin `https://l1galek-d20-initiative-370c.twc1.net`. Allowed request headers: `*`;
exposed response headers: `Content-Type`, `Content-Length`, `ETag`; max age 3600.
The previous configuration is backed up on the server in
`/root/initiative-server/.codex-backups/board-image-cors-before-20261115.json`.
Verified the actual image response returns the GitHub Pages origin in
`Access-Control-Allow-Origin`. No application restart or database changes.

## Validation

`npm test`: syntax checks and 29 room/visibility regressions.

`npm run test:browser` with Playwright/Edge: isolated five-client HTTP/WebSocket
room; initiative, notes, token permissions, sheets, 2D navigation, 3D camera,
touch, editing, visibility and map switching. Added checks for hidden scrollbars
after resizing, screen-plane pan, native action cursors, visible grid at zero
2D opacity, idle rendering, hover rebuild counters, a real 6200px image,
automatic/manual retry and stale image completion.

Set `D20_3D_ONLY=1` to run the 3D browser scenarios using the same isolated room.
Browser screenshots are in the ignored `test-artifacts/` directory. Tests do
not write to production player data.
