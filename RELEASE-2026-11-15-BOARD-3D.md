# 3D board, walls and fog of war

The personal map selector now offers **3D · объёмное поле** alongside 2D and
isometric views. Open the map button (🗺️) and choose the display mode. Existing
rooms and maps work without conversion or database migrations.

## Playing in 3D

- Right drag: orbit, with damping and a restricted pitch that keeps the camera
  above the map. Hold the middle button to pan. The wheel zooms toward the cursor
  with easing. One-finger touch rotates; two fingers pan and zoom.
- Left click a figure, then a cell to move. The existing movement, collision,
  combat-turn, ownership and delegated-control handlers enforce the same rules.
  Double click opens the token's existing quick card and character sheet actions.
- The toolbar provides overview, selected/own-base focus, overhead view, zoom,
  personal translucent walls, fullscreen and a control reference. F/Home/+/-
  keyboard shortcuts work with the canvas focused.
- View mode survives reload. Camera positions are remembered per room/map for
  this session. Switching to 2D restores its scroll position. Hidden game panels
  and the 2D mode stop issuing WebGL frames.
- Tokens currently use volumetric game figures with names, token colors,
  affiliation bases and a selection ring. Custom GLB characters, race/equipment
  meshes and appearance editing are a separate next stage.

## Existing map tools

Walls use the existing segments, materials, thickness, transparency and draft
state. They are extruded to 1.35 cell units with visible caps. Point/line/rectangle
and poly tools, preview, publishing drafts and erasing use raycast coordinates
passed to the existing editor. Wall height is a visual constant in this release;
the collision and visibility rules stay on the common 2D grid.

Manual fog painting also receives raycast coordinates and uses the existing
stamp batching and WebSocket row synchronization. Dynamic fog uses the existing
party LOS, wall occlusion and explored-cell memory. Unknown terrain has a dark,
animated volume; explored terrain is dimmed. GM view retains the party-fog
overlay and NPC-vision tint, and the player-preview/open-for-GM options work.
Undiscovered tokens and interior walls are excluded from player geometry and
raycasts. A last-known silhouette uses its old DOM position, never a hidden live
position. Rotation cannot reveal unknown actors.

Shared rectangles, circles, polygons and pins render on the floor. Existing
annotation drawing, drag previews and editing work through the same coordinate
adapter; geometry is clipped against the known-cell mask.

## Runtime and validation

Three.js 0.187.0 and OrbitControls are vendored with the MIT license and loaded
only when 3D is selected. WebGL 2 failure returns to a usable 2D board with an
explanation. No new backend routes, credentials, tables or player-data writes are
needed for the renderer. Instanced walls/fog, merged known-terrain rectangles,
incremental pawn movement, limited pixel ratio/frame rate and GPU resource
disposal keep the scene bounded.

Validated with `npm test` (66 JavaScript syntax checks and 29 regression tests)
and the isolated multiplayer Playwright suite in Edge with real WebGL rendering.
Five independent browser contexts cover camera gestures, touch orbit/pinch,
token movement/card opening, wall point/line tools and previews, manual/dynamic
fog, GM player preview, shared annotation drawing/dragging, per-map cameras,
2D/lobby suspension, GPU resource counts, unsupported-WebGL fallback, persisted
mode and the GitHub Pages URL subpath. The suite also reruns initiative,
delegation, sheet saving/navigation, damage and message-notification regressions.
It uses an isolated room transport/database adapter and never production player
data. Screenshots were inspected for the GM and player fog views.

Primary publication target: https://l1galek.github.io/D20-Initiative/.
