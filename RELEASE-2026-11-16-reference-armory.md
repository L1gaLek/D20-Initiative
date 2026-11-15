# Reference guards and human armor construction

The three weapon presets now follow the supplied stance sheet: a lowered sword
outside the leg with a forward shield, an outward raised one-handed sword with
a closed free hand, and a two-handed guard in front of the waist. The stance is
mirrored for the other weapon hand. Feet use a narrower spread. Both palms and
curled fingers stay on the greatsword's extended hilt while walking. Grip roll
also considers clearance along the forearm, rather than checking only the elbow.
The round hilt allows the blade face to remain visible in the front view.

Armor follows the supplied human armor sheet with separate silhouettes:

- Leather has fitted seams, lacing and split coat panels; hide adds a fur collar
  and uneven hems; studded leather has visible metal fasteners.
- Scale armor has overlapping shaped scales on both torso and skirt. A chain
  shirt has a short split hem, while the mail hauberk extends below the knee.
  Ring armor uses rings over separate plaques on the torso and hip panels.
- Splint armor uses overlapping riveted bands. Breastplates, half plate and
  full plate have smooth shaped cuirasses, compact articulated pauldrons,
  metal hip protection and separate cloth tabards. Full male plate includes a
  closed helmet and gorget; stored hairstyle choices return with other armor.
- Knee guards have pointed, beveled outlines. Female sets have shaped bodices,
  open shoulders, narrow front/back panels, opaque shorts, thigh straps and
  separate thigh guards. Light sets use fitted high boots.

Split panels attach to the corresponding thigh joint so their halves follow
the walking legs. Greave rims follow the calf profile. Every armor type retains
the existing geometry and draw-call budgets, with shared skeleton batches.

Validation includes 44 automatic checks: both bodies and every armor type,
valid geometry and weights, mirrored grips and walking, distinct sword angles,
wrist bend versus forearm twist, actual cuirass clearance, opaque clothing,
calf enclosure, long/short mail hems and the plate helmet. Browser validation
covers all equipment and hairstyles, persistence, owner/GM synchronization,
movement, mobile layout, GPU cleanup and GitHub Pages asset paths. Visual review
includes all armor pairs, both sides/back and a three-guard comparison.

Page and lazy-import cache versions are updated. This static frontend release
requires no backend deployment or database migration.
