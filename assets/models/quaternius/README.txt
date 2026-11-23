Quaternius Modular Character Outfits - Fantasy — Standard 2.1

Source: https://quaternius.itch.io/modular-character-outfits-fantasy
Author: Quaternius. License: CC0-1.0 (see LICENSE.txt).
Included real source outfits: Male/Female Ranger, Male/Female Peasant.

In the game: Character sheet → Character → Clothing style → Quaternius Standard.
Without armor, Peasant clothing is shown. Leather, Studded leather and Hide use
Ranger clothing. The other armor types keep the existing D20 model. The hood is
optional. The inventory, armor class and other item rules stay authoritative.
The same clothing style and hood controls are available in Studio. Studio preset
imports keep the selected collection, and individual source pieces remain editable.

Clothing is fitted to the native D20 163-joint rig. Native head, body proportions,
hands and weapon grip remain. Covered skin is culled to avoid intersections; the
source hand covering is removed where it conflicts with the native grip. Source
UVs and PBR color, normal and ORM maps are preserved. Runtime maps are reduced to
1024px and loaded only when this collection is selected.

Rebuild: node scripts/build-quaternius.mjs --source=/path/to/extracted/Standard
--blender=/path/to/blender --sharp=/path/to/sharp/module
The converter writes fitted meshes, source hashes and optimized textures. Optional
--work and --sources choose scratch and editable Blender output directories.
The paid Source archive is not included or required for these four Standard outfits.
