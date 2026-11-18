# Fitted human armor library

Eleven armor constructions, with separate male and female patterns. Geometry
is finished in Blender 4.5.16 LTS and used by both D20 Initiative and D20 Studio.
Rings, scales, stitched edges, shaped panels, buckles and overlapping defenses
are real mesh surfaces. Models use the existing 163-joint anatomical rig.

`client/board-3d/armor-assets.mjs` lazily loads only the selected suit. Plate
retains its legacy asset paths; its library copy is the same geometry. The
game batches fittings by material and weights each rigid part to its joint.
Studio retains editable part groups and their attached edging.

Soft torso patterns use cross-sections of the actual anatomical mesh, excluding
arms and metacarpals. The geometry regression checks front, side and back
clearance, shell thickness, calf enclosure and weapon/forearm clearance.

Rebuild all 22 suits and editable Blender sources:

```powershell
node scripts/build-armor-library.mjs '--blender=C:/tools/Blender/blender.exe' '--sources=C:/models/D20 Armor Sources'
node scripts/export-plate-glb.mjs
```

`--sex=male|female` and `--kinds=leather,plate,...` support targeted iteration.
Use a complete rebuild before release. `source-hashes.json` pins the pattern,
Blender finishing script and anatomical inputs. Source `.blend` files retain
separate pieces, non-destructive bevel modifiers and the humanoid skeleton.

The patterns are authored for this project. The underlying human mesh and rig
retain the MakeHuman CC0 attribution in `assets/models/human/README.md`.
