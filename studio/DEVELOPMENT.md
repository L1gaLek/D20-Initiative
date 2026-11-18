# D20 Studio 0.2.0

The desktop and game share the same human geometry, equipment fitting and
`client/board-3d/studio-state.mjs` project format. The desktop does not connect
to the live database or contain backend credentials.

## Run and build

Use Node.js 24 and an extracted Electron 45.3.4 distribution. Run:

```powershell
& 'C:/path/to/electron/electron.exe' ./studio
```

Blender 4.5.16 LTS can be selected from the UI, supplied through
`D20_BLENDER_EXEC`, or placed beside the executable at `Tools/Blender`.
No Blender Python packages or persistent add-ons are required. `panel.py`
registers a panel for the launched Blender session only.

Build a portable Windows folder outside this repository:

```powershell
node studio/build-portable.cjs '--electron=C:/tools/electron/dist' '--blender=C:/tools/blender-4.5.16-windows-x64' '--output=C:/build/D20 Studio'
```

The build copies only an explicit list of frontend assets, Studio source,
Electron and Blender. It preserves upstream license files and records resource
SHA-256 hashes in `D20-Studio-build.json`. Runtime binaries and build outputs
must stay outside Git. Use a clean output folder when removing source files.

Pinned upstream distributions:

- Electron: <https://github.com/electron/electron/releases/tag/v45.3.4>
- Blender: <https://download.blender.org/release/Blender4.5/blender-4.5.16-windows-x64.zip>
- Blender checksums: <https://download.blender.org/release/Blender4.5/blender-4.5.16.sha256>
- Blender ZIP SHA-256: `e258e90a1ebc14798ad65b3426bc5f11f5e0e013541c61cc7c3ee9bbf4ca0ce6`
- Three.js and its matching addons: vendored 0.187.0; see `vendor/three/README.md`.

## Validation

`npm test` covers project parsing, animation sampling, equipment occupation,
editable/compiled geometry parity, game action lifecycle and existing room
regressions. `npm run test:browser` runs the multiplayer fixture without any
production accounts or database writes.

For native desktop and real Blender roundtrip tests, set:

```powershell
$env:D20_PLAYWRIGHT_MODULE='C:/tools/node_modules/playwright'
$env:D20_ELECTRON_EXEC='C:/build/D20 Studio/D20 Studio.exe'
$env:D20_STUDIO_APP='C:/build/D20 Studio/resources/app'
$env:D20_BLENDER_EXEC='C:/build/D20 Studio/Tools/Blender/blender.exe'
$env:D20_STUDIO_TEST_ROOT='C:/tests/d20-studio-unique-run'
node tests/studio-desktop.cjs
node tests/studio-roundtrip.cjs
```

Use a separate test root per run. Tests isolate preferences, recovery and
project files, exercise native dialogs through Playwright Electron, and export
real `.blend`/GLB assets. The roundtrip test changes a plate vertex and a joint
translation, renders Blender, returns the asset to Studio, then re-exports and
reopens its portable package.

## Scope and asset exchange

Only human male/female currently have ready geometry. Other sheet races are
explicit catalog placeholders. All 11 game armor types can be previewed;
individual piece fitting covers all 22 Blender-finished human suits. The timeline edits
bone rotation offsets; topology, skin weighting and arbitrary mesh editing
belong in Blender.

Procedural presets travel to the existing character sheet without changing
item statistics. Inventory equipment remains authoritative. Imported Blender
geometry is preserved in local projects and portable GLB packages. A hosted
custom-model library, access policies, race retargeting and multiplayer model
downloads remain future work; game preset import deliberately rejects a full
mesh asset instead of silently claiming to install it.
