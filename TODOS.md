# Outstanding Work

## CSS Class Renames (~10K occurrences)
- [ ] Rename `rt-` CSS class prefix to `wh40k-` in all HBS templates (~6,570 occurrences across templates)
- [ ] Rename `rt-` CSS class prefix to `wh40k-` in all SCSS files (~3,703 occurrences across stylesheets)
- [ ] Must be done atomically — templates and SCSS must stay in sync

## JS Class Name Renames
- [ ] `BasicRollRT` → `BasicRollWH40K` (dice/basic-roll.mjs, dice/_module.mjs, dice/d100-roll.mjs, hooks-manager.mjs)
- [ ] `ChatMessageRT` → `ChatMessageWH40K` (documents/chat-message.mjs, hooks-manager.mjs)
- [ ] `TokenDocumentRT` → `TokenDocumentWH40K` (documents/token.mjs, hooks-manager.mjs)
- [ ] `TokenRulerRT` → `TokenRulerWH40K` (canvas/ruler.mjs, hooks-manager.mjs)
- [ ] `D100Roll` — no rename needed, already generic

## SCSS Variable Renames
- [ ] Audit `$rt-` prefixed SCSS variables and rename to `$wh40k-`
- [ ] Audit `.rt-` selectors in SCSS that match the template class renames above

## Template Directory Cleanup
- [ ] `src/templates/actor/npc-v2/` — consider renaming to `npc/` (no legacy NPC type exists)
- [ ] `src/templates/actor/vehicle-v2/` — consider renaming to `vehicle/` (no legacy vehicle type exists)
- [ ] Update all template path references in sheet JS after any directory rename

## Data Model Cleanup
- [ ] `src/module/data/actor/npc-v2.mjs` — consider renaming to `npc.mjs`
- [ ] `src/module/documents/npc-v2.mjs` — consider renaming to `npc.mjs`
- [ ] `NPCDataV2` class name → `NPCData`
- [ ] `WH40KNPCV2` class name → `WH40KNPC`
- [ ] Update all imports after renames

## Sheet Cleanup
- [ ] `src/module/applications/actor/npc-sheet-v2.mjs` — rename to `npc-sheet.mjs`
- [ ] `src/module/applications/actor/vehicle-sheet-v2.mjs` — rename to `vehicle-sheet.mjs`
- [ ] Remove legacy `vehicle-sheet.mjs` (old vehicle sheet)
- [ ] Remove legacy NPC document/data (`src/module/documents/npc.mjs`, `src/module/data/actor/npc.mjs`)

## Compendium Content
- [ ] Audit RT-specific compendium content (skills, talents, origin paths) for DH2e applicability
- [ ] Add DH2e-specific compendium packs where skills/talents differ from RT
- [ ] Remove or tag RT-only content (Navigator Powers, Ship Orders, Colonies, etc.) as game-specific

## `rogueTraderExtras` Template Block
- [ ] Rename `rogueTraderExtras` in template.json to a generic name (e.g. `gameExtras`)
- [ ] Update all code referencing `system.rogueTraderExtras` or `rogueTrader` nested data paths

## Foundry V14 Compatibility
- [ ] Test full system on Foundry V14 (14.359) — verify no deprecation warnings or broken APIs
- [ ] Check if `template.json` is still needed alongside `documentTypes` in system.json for V14
- [ ] Review ApplicationV2 API changes in V14 release notes
