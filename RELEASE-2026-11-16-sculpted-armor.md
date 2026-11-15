# Shoulder carry, lowered sword and sculpted armor

Two-handed swords now use a relaxed carry pose: the blade points up and back
over the wielding shoulder, the elbow bends below the hilt, and the free hand
rests at the hip. Either hand and both human bodies have a mirrored pose. Hilt
roll is solved together with the elbow to retain a natural wrist and a curled
grip. The blade clears the head and neck. Carrying does not change equipment
rules: a two-handed weapon still occupies both slots and excludes a shield.

One-handed swords point down outside the wielding leg, with or without a
shield. The shield sits higher in front of the body and has a broader, taller
face; its wooden back, grip and straps retain clearance around the new bracers.

All 11 armor types have a stronger silhouette. Solid, bevel-edged shoulder
shells are steel lames, padded leather or a mail mantle according to the set.
Steel cuirasses have a raised, faceted front, leather has shaped overlapping
panels, scales have thicker beveled edges, and ring mail retains individual
metal links. Closed, tapered bracers replace cuts copied from the skin. Greaves
have an asymmetric calf profile, rolled rims and separate knee guards. Torso
and skirt panels have thicker walls, with contrasting trim and rivets.

Female armor uses its own fitted torso and lower neckline, exposed shoulders,
a narrow open waist and shorter split tassets over opaque shorts. Heavy sets
retain visible metal protection at the shoulders, arms, hips, knees and shins.
Male sets retain their longer underlayers. Anatomical bodies and appearance
controls remain available under the new equipment.

Validation: all 43 automated tests and the complete isolated multiplayer
browser regression pass. Coverage includes mirrored shoulder carry during
walking, curled fingertips, neutral wrists, blade/head clearance, sword-facing
direction, shield clearance, thick armor walls, female chest/hip coverage and
waist opening, calf enclosure, persistence, equipment rules, owner/GM sync,
mobile layout and GPU cleanup. Both bodies and every armor type remain below
the existing 150,000-triangle / 20-draw-call budget per equipped figure.

Visual review includes all 11 armor pairs, weapon poses from both sides and
behind, and close-ups of hands and shield fittings. All page and lazy 3D imports
use a new cache version. This release needs no backend or database changes.
