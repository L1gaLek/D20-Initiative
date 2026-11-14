# Sheet header and separate additional damage — 15 November 2026

- Character and monster sheets share a warm header treatment with a clear title, color-coded affiliation, owner/type metadata chips, and matching controls. Ownership and delegated control occupy adjacent panels at desktop widths, with stacking on narrow screens. Their permissions and save endpoints are unchanged.
- Additional weapon damage now appears in its own compact row below the entire attack/damage summary frame. The main damage value contains only its base dice and damage type. Every additional modifier retains its signed value and description tooltip, and the row remains visible when weapon details are collapsed. Empty rows are hidden; edits and deletions update the preview immediately. Both character and monster weapon cards use the same helpers.

Validation: `npm test` passed 55 JavaScript syntax checks and 26 regression tests. The five-context browser regression passed the existing multiplayer, permissions, sheet navigation, wild-shape and notification scenarios, plus checks that all modifier chips are outside/below the main summary frame and update after deletion. Header and collapsed weapon screenshots were visually inspected. The fixture uses isolated database/membership adapters and does not write production player data.

Deploy static sources to the primary GitHub Pages site. Asset versions are updated; reload clients with Ctrl+F5. No backend or database changes are needed. The proposed full 3D board is a separate design discussion, not included in this interface release.
