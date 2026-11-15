# Anatomical human mesh

`male.mjs` and `female.mjs` contain continuous adult human bodies with authored
skin weights and 163 joints each. Both are bundled locally; rendering does not
contact an asset service. Each mesh has 13,380 vertices / 26,756 triangles before
clothing and equipment.
Armor, hair, eyes, swords, shield, material detail and the walk cycle are built
by the D20 client. Existing character appearance fields remain compatible.

## Source and license

The base mesh, morph targets and rig are **CC0** graphical assets from the
official [MakeHuman repository](https://github.com/makehumancommunity/makehuman),
pinned to revision `a8bc2d54ff0ac92e78ff71431b1023eda42bf482`:

- `makehuman/data/3dobjs/base.obj`
- `makehuman/data/targets/macrodetails/caucasian-male-young.target`
- `makehuman/data/targets/macrodetails/universal-male-young-maxmuscle-averageweight.target`
- `makehuman/data/targets/macrodetails/caucasian-female-young.target`
- `makehuman/data/targets/macrodetails/universal-female-young-averagemuscle-averageweight.target`
- `makehuman/data/rigs/default.mhskel`
- `makehuman/data/rigs/default_weights.mhw`

The graphical asset license is distinct from the MakeHuman application's source
code license. No application source code is incorporated. See the upstream
[license](https://github.com/makehumancommunity/makehuman/blob/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/LICENSE.md)
and the bundled [CC0 dedication](CC0.txt). Original asset authors include Manuel
Bastioni, Data Collection AB, Joel Palmius and Jonas Hauquier.

## Rebuilding

Download these seven files from that revision into a local directory, together
with upstream `LICENSE.ASSETS.md`, then run:

```sh
node scripts/build-human-model.cjs /path/to/source-directory
node scripts/build-human-model.cjs /path/to/source-directory female
```

The converter applies the male target and 0.38 of the muscle target, or the female
target and its average-muscle target for the female mesh. It keeps only
the `body` face group, normalizes height to the token scale, preserves the four
strongest joint weights per vertex and writes the local module. Helpers, joint
cubes and proxy geometry are excluded. `source-hashes.json` and
`female-source-hashes.json` record SHA-256 of the downloaded sources. Both
characters always wear opaque underwear or armor.

The client solves each arm's resting pose for unarmed, single-weapon,
dual-weapon and shield stances. Palm grip frames are derived from the authored
finger joints. Swords share the wrist joint; the shield and its forearm straps
share the lower-arm joint, with its rear grip aligned to the curled hand.
