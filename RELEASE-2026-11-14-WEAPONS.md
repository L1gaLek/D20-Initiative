# Token affiliation and additional weapon damage — 14 November 2026

- The sheet header includes an Ally/Enemy selector beside delegated control. Only the token owner or GM can change affiliation; delegated control does not grant this permission. Confirmed changes have their own version, so stale client or GM snapshots cannot undo them.
- Expanded weapon cards place proficiency beside Hide/Delete in both character and monster sheets.
- Weapons accept any number of additional damage rows. Each row selects dice (with quantity) or a fixed value and has its own description; rows can be edited and removed. Existing sheets need no conversion.
- Sheet and quick-token damage rolls include the base dice, existing ability modifier and every additional row. The client and server share the calculation/validation module. A single dice event records all descriptions, each die result, fixed additions and the total. The complete breakdown is stored in the existing `kind_text` column and survives later history loads, without the old 200-character or 20-total-dice truncation. Animation is limited to the first 20 dice; all dice count toward damage.
- Quick token rolls use pending sheet edits immediately after closing the sheet, while its save is awaiting confirmation.
- The initiative panel fills the remaining height of its frame instead of stopping at 260px. Its list scrolls only when the available space is exhausted.

Validation: `npm test` (54 JavaScript syntax checks and 24 regression tests), backend syntax check, and the five-context browser regression. Browser scenarios cover owner/GM affiliation changes and delivery, both weapon editors, mixed damage logs at the GM, save/reopen/delete, immediate quick rolls after edits, proficiency alignment, panel growth and all previous multiplayer/map controls. Browser fixtures use isolated database and membership adapters, without production player writes.

Deployment updates `backend/server.js` and its new dependency `backend/shared/damage-rolls.js` on Timeweb, and the tracked static sources on GitHub Pages. No database migration or environment/configuration change is required. Reload all clients with Ctrl+F5 after publication.
