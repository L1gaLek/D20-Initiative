# Fitted female breastplate

Selecting **Человек → женский пол → Кираса** uses `female-breastplate.mjs` in
both the browser game and D20 Studio. The male breastplate keeps its existing
model. Item statistics and inventory identifiers are unchanged.

The source is the project owner's supplied **Girl's Heavy Armors (UUNP),
91248 / 1.6.1** archive (`GirlHeavyArmor.bsa`, `GirlHeavyArmor.esp`). The selected
addon is `SteelCuirassAA`, using `armor/gigaduex/steel/f/cuirasslight_1.nif`,
with its matching gauntlets and boots. Meshes and textures retain their source
attribution; this conversion does not declare the original assets public domain.

The runtime file contains the fitted clothing and the project's own anatomical
body with normalized four-influence weights. All 163 joint names refer to the
existing D20 skeleton; the Skyrim/UNP body and skeleton are excluded. Geometry is
in metres, Y-up, in native D20 bind space. Original diffuse textures, tangent
normal maps and alpha cutouts are converted to local browser images under
`assets/materials/cuirass`. Texture hashes and source names are recorded there.

`client/board-3d/fitted-outfit.mjs` retains native weapons, hands, hairstyles,
walking and studio actions. In Studio each imported piece also has an editable
transform proxy; edits change its bind-space vertices while retaining skinning.
The project owner received a full editable Blender source and animated GLB in
the local `D20 Cuirass` output package.
