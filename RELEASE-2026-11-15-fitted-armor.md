# Natural sword grips and layered armor

Sword grips now solve the shoulder, elbow, forearm and hand together. Wrist
alignment uses the actual knuckle angle of each body and mirrored hand; forearm
pronation follows the palm instead of introducing the twist at the wrist seam.
The one-handed blade rests diagonally down, while both hands keep their own
positions around a shared greatsword grip. The two-handed guard leaves space
between both bracers and the thicker cuirass. Walking preserves the grip.

All 11 armor types now sit above a complete padded undercoat. Torso panels,
collars, shoulder plates and skirt panels have inner surfaces and closed edges
with real thickness. Leather has raised side panels and seams; mail, scales and
splints retain their distinct construction above the underlayer. Plate adds
overlapping waist lames, larger layered pauldrons, beveled knee guards and
articulated steel footwear. Belts and shoulder straps have separate buckles.
Shield clearance and strap sizes account for the thicker forearm protection.

Female sets now cover the waist and upper legs, with a longer split skirt,
fitted knee breeches, cap sleeves and a separate shaped torso and neckline.
Male sets retain their longer sleeves and full-length trousers. Both versions
keep their own fit and underlayer colors. Armor remains batched within the
existing limit of 20 draw calls and 150,000 triangles per equipped figure.

Validation:

- All 42 automated tests pass, including actual wrist bend and forearm twist,
  both hands on the greatsword while walking, forearm clearance against the
  rendered cuirass, armor shell thickness and female waist/upper-leg coverage.
- The complete isolated multiplayer browser suite passes: both bodies, all
  armor and hairstyles, five stances, shield and two-handed rules, persistence,
  owner/GM synchronization, map walking, mobile layout and GPU cleanup.
- Visual review covers all 11 armor pairs, shield poses from front/side/back,
  and close-ups of both greatsword hands on both bodies.
- Cache versions are updated throughout the page and lazy 3D import chain so
  existing sessions load the new pose and armor modules after a page refresh.

This release changes only the static frontend; it requires no backend restart
or database migration. Browser regression tests use isolated room fixtures.
