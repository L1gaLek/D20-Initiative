# Anatomical human mesh

`male.mjs` contains a continuous adult male body with authored skin weights and
163 joints. It is bundled locally; rendering does not contact an asset service.
The mesh has 13,380 vertices / 26,756 triangles before clothing and equipment.
Armor, hair, eyes, swords, shield, material detail and the walk cycle are built
by the D20 client. Existing character appearance fields remain compatible.

## Source and license

The base mesh, morph targets and rig are **CC0** graphical assets from the
official [MakeHuman repository](https://github.com/makehumancommunity/makehuman),
pinned to revision `a8bc2d54ff0ac92e78ff71431b1023eda42bf482`:

- `makehuman/data/3dobjs/base.obj`
- `makehuman/data/targets/macrodetails/caucasian-male-young.target`
- `makehuman/data/targets/macrodetails/universal-male-young-maxmuscle-averageweight.target`
- `makehuman/data/rigs/default.mhskel`
- `makehuman/data/rigs/default_weights.mhw`

The graphical asset license is distinct from the MakeHuman application's source
code license. No application source code is incorporated. See the upstream
[license](https://github.com/makehumancommunity/makehuman/blob/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/LICENSE.md)
and the bundled [CC0 dedication](CC0.txt). Original asset authors include Manuel
Bastioni, Data Collection AB, Joel Palmius and Jonas Hauquier.

## Rebuilding

Download these five files from that revision into a local directory, together
with upstream `LICENSE.ASSETS.md`, then run:

```sh
node scripts/build-human-model.cjs /path/to/source-directory
```

The converter applies the male target and 0.38 of the muscle target, keeps only
the `body` face group, normalizes height to the token scale, preserves the four
strongest joint weights per vertex and writes the local module. Helpers, joint
cubes and proxy geometry are excluded. `source-hashes.json` records SHA-256 of
the downloaded sources. The character always wears opaque underwear or armor.
