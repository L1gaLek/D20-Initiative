# Prepared human plate suits

Two separately fitted suits for the existing adult male and female human bodies.
The in-game `plate` armor selection uses the baked meshes in `male.mjs` and
`female.mjs`; the other armor families keep their existing models.

Each suit has separate breast/back plates, overlapping waist and shoulder lames,
fitted limb defenses, leather fastenings, rolled rims, rivets, finger plates,
segmented sabatons and cloth underlayers. The female suit has a shorter cuirass,
shorter thigh defenses and an open waist. The male suit includes a visored helmet.
These are game meshes with a PBR finish, not scanned historical artifacts.

`male.glb` and `female.glb` are portable glTF 2.0 versions with the whole character,
163-joint skin, embedded 512 px material maps and a looping `Walk` animation.
They can be opened in Blender or a glTF viewer without external images.
Game-specific hair/skin/quilt shader effects and the studio environment are not
part of the portable files. Weapons and shields remain separate game equipment.

## Rebuild

```sh
node scripts/build-plate-armor.mjs
node scripts/export-plate-glb.mjs
```

The modelling source is `scripts/plate-design.mjs`. Source hashes are recorded in
`source-hashes.json`. Runtime meshes share the existing skeletal pose and walking
system; they do not create one draw call per armor plate.

The body is the existing MakeHuman CC0 asset: see `../human/README.md` and
`../human/CC0.txt`. PBR images are derived from ambientCG CC0 assets, documented in
`../../materials/plate/README.md`. The original armor patterns and application
code follow the project's license; upstream CC0 assets retain their own terms.
