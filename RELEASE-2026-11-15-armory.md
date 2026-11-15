# Fitted armor and weapon stances

The sword-and-shield stance now holds the blade diagonally down across the
body, with the shield arm lower and closer to the torso. The shield hand's palm
faces the wearer and its knuckles face the wooden back. The shield retains its
own outward facing, curved back clearance, straps and hand grip on either arm.

All 11 armor types now have distinct construction on male and female humans:

- Leather has inset panels, double stitching, center lacing and framed buckles;
  studded leather adds staggered metal studs over the complete torso.
- Hide uses rawhide panels, contrasting sides, a fringed collar and hem.
- Chain shirts and mail use a woven metallic surface with procedural normal
  detail and actual links at the edges; the shirt has shorter sleeves. Ring mail
  has larger individual rings mounted on a leather backing.
- Scale mail uses beveled, overlapping curved metal scales and fastening studs.
- Breastplates have a fitted rigid cuirass, rolled edges, flutes and fauld lames.
  Half plate adds layered shoulders and greaves. Full plate adds articulated
  arm/thigh protection, poleyns and gauntlets.
- Splint armor has separate vertical steel strips and rivets over leather,
  matching splinted bracers and greaves.

Female versions use a separate fitted torso profile, lower neckline, open
shoulders/waist and shorter split skirts over opaque shorts. Both bodies remain
continuous beneath the individual armor pieces. Fittings share the skeleton;
armor changes stay within 20 figure draw calls and 150,000 triangles.

Weapon slots now recognize the actual two-handed property, including Russian
and Unicode-hyphenated English strings in the item database. Equipping such an
item clears the other hand and shield, and the existing armor-class calculation
removes the shield bonus in the same save. Selecting a new one-handed weapon or
shield replaces the incompatible two-handed item. Nothing is deleted from the
inventory. Legacy conflicting sheets resolve safely for read-only viewers.

The greatsword has a 1.08 m blade (versus the longsword's 0.51 m), a wider blade,
larger guard and extended two-hand grip. Both palms/fingers hold the same hilt in
a new mirrored stance, including during walking. The portrait frames the whole
weapon automatically and restores the regular viewing distance when removed.

Validation: 39 automated tests cover all armor on both models, valid geometry
and skinning, draw/triangle budgets, actual grip/fingertip placement, palm facing,
shield clearance, both greatsword hands during walking, all two-handed database
weapons, shield AC removal and competing equip choices. The full isolated
multiplayer browser suite passes, including persistence/reopening, owner/GM
sync, read-only access, all armor/hair variants, mobile layout and GPU disposal.
Visual review covers every armor pair, front/side shield poses and both hands of
the enlarged greatsword. No backend deployment or database migration is needed.
