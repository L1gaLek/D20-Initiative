# Anatomical human mesh

`male.mjs` and `female.mjs` contain continuous adult human bodies with authored
skin weights and 163 joints each. The female surface is fitted to the supplied CBBE body as described below. Both are bundled locally; rendering does not
contact an asset service. Each mesh has 13,380 vertices / 26,756 triangles before
clothing and equipment.
Armor, hair, eyes, swords, shield, material detail and the walk cycle are built
by the D20 client. Existing character appearance fields remain compatible.

## Source and license

`male.mjs` and the original `female-base.mjs`, their morph targets and native rig are **CC0** graphical assets from the
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

## Supplied female CBBE shape

`female.mjs` now transfers the shape of the owner's supplied
`CBBE_fizicka_2-4/1-Бри/Data/meshes/actors/character/character assets/femalebody_1.nif`
to the original seamless D20 topology. It is a surface transfer, not a direct
replacement with the Skyrim skeleton. Native face, hair attachment, hands, feet,
indices and 163-joint animation weights remain compatible. Wrist, ankle and neck
transitions blend into the original mesh. The supplied body's shape is adapted
to D20 limb lengths; opaque underwear remains part of the avatar.

The supplied CBBE source is **not covered by the MakeHuman CC0 dedication**.
Its provenance and SHA-256 are recorded in `female-body-source.json`. Only mesh
and bone reference data are read; game plugins, physics and source animations
are not included. Existing D20 skin shading is used; importing the source skin
textures is a separate step and is not implied by this geometry conversion.

Rebuild using Blender with the PyNifly addon available locally:

```sh
blender --background --factory-startup --disable-autoexec --python scripts/fit-female-body.py -- --source /path/to/femalebody_1.nif --pynifly /path/containing/io_scene_nifly --native assets/models/human/female-base.mjs --output assets/models/human/female.mjs
```

The source directory must also contain `femalehands_1.nif` and
`femalefeet_1.nif`; these supply skeleton reference points. Their geometry is
not substituted for the D20 grip mesh. `female-base.mjs` is a build reference
and is never downloaded by the runtime. The original MakeHuman build command
above recreates the original female module; save that result as `female-base.mjs`
before running the CBBE transfer.

After changing the body, rebuild female armor with
`scripts/build-armor-library.mjs --sex=female`, refit imported outfits with
`scripts/refit-outfit-body.py`, and regenerate the portable plate GLB with
`scripts/export-plate-glb.mjs`. Both the browser and Studio use the same modules.
