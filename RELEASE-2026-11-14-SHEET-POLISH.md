# Sheet controls and compact damage previews — 14 November 2026

- Ownership transfer and delegated control share one header row at desktop widths, with compact labels and flexible selects. Narrow screens wrap the controls.
- Character JSON import and saved-base actions are grouped in a bordered toolbar. The native file picker remains accessible behind a styled upload label, and the three controls use matching spacing, icons, and focus states. The toolbar includes an automatic-save hint.
- Both character and monster weapon summaries display one small chip per extra damage modifier beside the main dice, including while details are collapsed. Dice, fixed values, signs, and descriptions in tooltips are preserved. Chips wrap without hiding additional modifiers and update as the weapon is edited. Damage calculations and logs are unchanged.
- The wild-shape activation control is now the “Импорт монстра” button at the top of its import card. Its tooltip explains the effect. Inactive is gray; active uses the saved-base buttons' gold gradient. Clicking again restores the base statistics. The button exposes its state through `aria-pressed`; read-only viewers can see the state but cannot toggle it. Ordinary monster import panels retain their existing behavior.

Validation: `npm test` passed 55 syntax checks and 26 regression tests. The five-context browser regression passed transfer-row alignment, collapsed modifier chips for character and monster weapons, file-toolbar alignment, wild-shape stat switching, save/reopen/deactivation, and read-only permissions, alongside the existing multiplayer/navigation/chat scenarios. Header, collapsed weapon, and both wild-shape state screenshots were visually inspected. Fixtures do not write production player data.

Publish the static frontend to GitHub Pages and reload all clients with Ctrl+F5. No backend or database changes are required.
