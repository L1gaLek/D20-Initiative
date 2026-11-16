# Prepared human plate suits

Two separately fitted suits for the existing adult male and female human bodies.
The in-game `plate` armor selection uses the baked meshes in `male.mjs` and
`female.mjs`; the other armor families keep their existing models.

Each suit has shaped breast leaves and lower breast plates, layered pauldrons,
pointed front and rear hip defenses, keeled greaves, winged joint guards, leather
fastenings, rolled rims, rivets, finger plates, closed segmented sabatons and an
ivory tabard. The female suit has individually shaped breast plates, shorter hip
and thigh defenses, and an open waist. The male suit has a longer split tabard
and a peaked helmet with a closed, angular visor and straight eye slits.
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

The modelling sources are `scripts/plate-design.mjs` (shells and anatomical fit)
and `scripts/plate-reference-parts.mjs` (armor patterns). LF-normalized source
hashes are recorded in `source-hashes.json`. Runtime meshes share the existing skeletal pose and walking
system; they do not create one draw call per armor plate.

The body is the existing MakeHuman CC0 asset: see `../human/README.md` and
`../human/CC0.txt`. PBR images are derived from ambientCG CC0 assets, documented in
`../../materials/plate/README.md`. The original armor patterns and application
code follow the project's license; upstream CC0 assets retain their own terms.
