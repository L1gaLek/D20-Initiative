# Locally fitted humanoid outfits

`createHuman(config, {outfit: loadedGLTF})` accepts a locally loaded garment on
the existing D20 humanoid. This is a renderer API; it does not upload a file or
add an item to the shared character sheet. The ordinary equipment path remains
the default when no outfit is provided.

An outfit contains an `anatomical-body` skinned mesh with covered body regions
removed, and garment meshes marked with the glTF extra `d20OutfitPart: true`.
Keep the same humanoid bind positions, bone hierarchy and metre scale as the
corresponding male or female model. Export Y-up GLB with embedded textures.
Provide normalized weights with at most four influences per vertex. Joint
indices may be reordered: the loader maps joints by their canonical Three.js
names, since GLTFLoader removes punctuation such as dots from node names.

The renderer retains its own skeleton and replaces the fitted body and clothing.
Sword grips, shield straps, idle poses, walking and studio actions therefore use
the native game controls. Extra shield clearance accommodates thicker imported
bracers. Weapons and hair continue to come from the character configuration.
Invalid weights or missing joints are rejected before replacing the body.

`tests/human-outfit.test.cjs` covers both bodies, reordered joint indices, live
wrist motion and rejection without modifying the existing character.

The earlier local Skyrim leather experiment stays outside the repository.
The separately supplied GirlHeavyArmor cuirass is integrated as the female
breastplate; see `assets/models/outfits/README.md` for its source and bind-space
format. This replacement uses static frontend assets and does not require a
backend or database migration.
