# Central footer and personal board/dice appearance

The lower character panels now belong to the central map column. Desktop
journal/tray and combat/initiative columns span from the header to the bottom.
The journal/tray height ratio is 40/60, and initiative queue/rolls is 55/45.
The room remains viewport-sized with internal scrolling and a narrow layout.

Personal settings include local board background/grid colors and ten dice
sets with distinct surface patterns, typography, metal edges and materials.
D20 faces retain their numerical labels, with a crown on 20 and skull on 1.
Existing critical halos/sounds and results remain unchanged. Settings include
previews and a reset; selection persists in the account's private VPS profile.
2D applies colors via CSS. 3D changes uniforms/material colors without rebuilding
terrain or changing fog, walls or map imagery.

The procedural art uses CanvasTexture atlases and a bounded ten-set cache.
No external image assets, new Supabase columns or subscriptions are needed.
Only a validated diceStyle ID accompanies live dice events. The authenticated
account's preferences remain independent from other users' board settings.

Backend deployment touches server.js, shared/user-profiles.js and adds
shared/appearance.js. Preserve data/user-profiles.json, its backups, .env,
uploads and PM2 configuration.

Validation includes the 14-size viewport matrix, all ten skins on five clients,
personal color isolation/profile reload, live 2D/3D changes without terrain
rebuild, mixed damage/percentile/critical dice, and full multiplayer/3D/Studio.
