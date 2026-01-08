# Codebase Cleanup Suggestions

**Date:** 2026-01-08  
**Status:** Recommendations for future cleanup sessions  

---

## 1. Deprecated Prompt Files (Low-Hanging Fruit)

**Location:** `src/module/prompts/`  
**Status:** All marked `@deprecated`, only re-export from V2 implementations  

### Files to Delete (6 files)
```
src/module/prompts/
├── simple-prompt.mjs           (deprecated re-export)
├── weapon-prompt.mjs           (deprecated re-export)
├── psychic-power-prompt.mjs    (deprecated re-export)
├── force-field-prompt.mjs      (deprecated re-export)
├── damage-prompt.mjs           (deprecated re-export)
└── assign-damage-prompt.mjs    (deprecated re-export)
```

**Impact:** Only 2 imports still use old paths  
**Effort:** Low - Update 2 imports, delete 6 files  
**Benefit:** Cleaner import paths, less confusion  

**Migration:** Change imports from:
```javascript
import { prepareSimpleRoll } from "./prompts/simple-prompt.mjs";
```
To:
```javascript
import { prepareSimpleRoll } from "./applications/prompts/simple-roll-dialog.mjs";
```

---

## 2. Empty Directories

**Found:** 2 empty directories  

```
src/module/applications/dice/     (empty)
src/icons/fantasy/                 (empty)
```

**Effort:** Trivial  
**Benefit:** Cleaner file tree  

---

## 3. Template Directory Consolidation

**Issue:** Duplicate/inconsistent naming  

### Dialog Templates Split Across Two Dirs
```
src/templates/dialog/              (1 file: acquisition-dialog.hbs)
src/templates/dialogs/             (1 file: loadout-preset-dialog.hbs)
```

**Recommendation:** Merge into one `dialogs/` directory (plural, matches code convention)  

**Effort:** Low - Move 1 file, update 1 import  
**Benefit:** Consistency, easier navigation  

---

## 4. SCSS Cleanup - Old Panel Styles

**Issue:** Both old and V2 panel styles exist, causing potential conflicts  

### Old Panel SCSS Still Present
```
src/scss/panels/
├── _wounds.scss        (14K - old style)
├── _fatigue.scss       (13K - old style)
├── _fate.scss          (13K - old style)
├── _corruption.scss    (3.7K - old style)
└── (no old insanity - good!)
```

### V2 Versions Exist
```
src/scss/panels/
├── _wounds.scss → used by _wounds-panel-v2.hbs (acolyte)
├── _fatigue.scss → used by _fatigue-panel-v2.hbs (acolyte)
├── _fate.scss → used by _fate-panel-v2.hbs (acolyte)
├── _corruption-v2.scss → used by _corruption-panel-v2.hbs (acolyte)
└── _insanity-v2.scss → used by _insanity-panel-v2.hbs (acolyte)
```

**Problem:** Old SCSS still imported in `_index.scss` (lines 11-13, 18)  
**Risk:** NPC sheet still uses old `wounds-panel.hbs`, `fatigue-panel.hbs`, `fate-panel.hbs`  

**Recommendation:**
- **Phase 2 (After NPC Migration):** Rename V2 SCSS to remove `-v2` suffix, delete old versions
- Consolidate into single set of modern panel styles
- Clean up `_index.scss` imports

**Effort:** Medium (depends on NPC migration)  
**Benefit:** ~50KB SCSS reduction, eliminate style conflicts  

---

## 5. Mixin Consolidation

**Issue:** Two drag-drop mixins exist  

### Current State
```
src/module/applications/api/
├── drag-drop-mixin.mjs          (basic drag-drop, ~150 lines)
└── enhanced-drag-drop-mixin.mjs (visual feedback version, ~180 lines)
```

**Usage:**
- `drag-drop-mixin.mjs` - Used by `PrimarySheetMixin` (base functionality)
- `enhanced-drag-drop-mixin.mjs` - Used by `BaseActorSheet` (visual layer)

**Analysis:** Both are needed - they serve different purposes  
- Basic mixin: Core drag/drop API
- Enhanced mixin: Adds visual feedback layer on top

**Recommendation:** Keep both, but rename for clarity:
- `drag-drop-mixin.mjs` → `drag-drop-api-mixin.mjs`
- `enhanced-drag-drop-mixin.mjs` → `drag-drop-visual-mixin.mjs`

**Effort:** Low  
**Benefit:** Clearer naming, easier to understand layer separation  

---

## 6. TODO/FIXME Comments

**Found:** 4 TODO comments in code  

```javascript
// src/module/documents/item-container.mjs
// TODO see how to avoid this - here to make sure the contained items is correctly setup

// src/module/actions/basic-action-manager.mjs
//TODO: Cleanup all rolls older than ? minutes

// src/module/applications/hud/combat-quick-panel.mjs
// TODO: Show weapon selection dialog
// TODO: Implement consumable use logic
```

**Recommendation:** Either implement or remove  
**Effort:** Varies (some may be future features)  
**Benefit:** Cleaner code, clearer roadmap  

---

## 7. Console.log Debug Statements

**Found:** Legitimate logging (hooks-manager.mjs uses debug flag)  

```javascript
// src/module/hooks-manager.mjs
log: (s, o) => (!!game.rt.debug ? console.log(...) : undefined)
```

**Status:** ✅ Already properly gated behind `game.rt.debug` flag  
**Action:** None needed - this is good practice  

---

## 8. Large SCSS Files

**Potential for Splitting:**

```
rogue-trader.scss        915 lines (main entry - imports only)
_dialogs.scss           807 lines (could split by dialog type)
_corruption-v2.scss     757 lines (modern, keep as-is)
_insanity-v2.scss       750 lines (modern, keep as-is)
_sheet-base.scss        697 lines (could extract sections)
_dynasty-modern.scss    689 lines (modern, keep as-is)
_loadout.scss           688 lines (modern, keep as-is)
_combat-station.scss    663 lines (modern, keep as-is)
```

**Recommendation:** Most are fine - modern panel SCSS is complex by nature  
**Possible Split:** `_dialogs.scss` could become multiple files (roll-dialog, prompt-dialog, etc.)  

**Effort:** Medium  
**Benefit:** Marginal - only if maintenance becomes difficult  

---

## 9. Utils Directory

**Status:** ✅ Clean - Only 3 utilities, all actively used  

```
src/module/utils/
├── roll-table-utils.mjs        (238 lines)
├── armour-calculator.mjs       (212 lines)
└── encumbrance-calculator.mjs  (80 lines)
```

**Action:** None needed  

---

## 10. Future: Complete V2 Migration ✅ COMPLETED (2026-01-08)

**Status:** All 3 actor sheets migrated to PARTS system!

**What Was Done:**
- Created `npc/`, `starship/`, `vehicle/` template directories
- Split monolithic templates into modular tab parts
- All sheets now use ApplicationV2 PARTS rendering
- Old monolithic templates deleted

**Created Template Structure:**
```
src/templates/actor/
├── acolyte/                   (12 template parts)
├── npc/                       (7 template parts)
│   ├── header.hbs
│   ├── tabs.hbs
│   ├── tab-combat.hbs
│   ├── tab-abilities.hbs
│   ├── tab-gear.hbs
│   ├── tab-powers.hbs
│   └── tab-notes.hbs
├── starship/                  (7 template parts)
│   ├── header.hbs
│   ├── tabs.hbs
│   ├── tab-stats.hbs
│   ├── tab-components.hbs
│   ├── tab-weapons.hbs
│   ├── tab-crew.hbs
│   └── tab-history.hbs
├── vehicle/                   (5 template parts)
│   ├── header.hbs
│   ├── tabs.hbs
│   ├── tab-stats.hbs
│   ├── tab-weapons.hbs
│   └── tab-traits.hbs
└── panel/                     (44 reusable panel partials)
```

**Benefits Achieved:**
- ✅ Consistent architecture across all sheets
- ✅ Better performance (selective re-rendering)
- ✅ Easier maintenance
- ✅ Ready for Phase 2 SCSS cleanup

---

## Priority Ranking

### High Priority (Quick Wins) ✅ COMPLETED
1. ✅ **Delete empty directories** (2 dirs) - DONE
   - Removed `src/module/applications/dice/`
   - Removed `src/icons/fantasy/`
2. ✅ **Consolidate dialog templates** - DONE
   - Moved `dialog/acquisition-dialog.hbs` → `dialogs/`
   - Updated import path in acquisition-dialog.mjs
   - Removed empty `dialog/` directory
3. ✅ **Delete deprecated prompts** (6 files, 6 import updates) - DONE
   - Updated imports in:
     - `documents/acolyte.mjs` (2 imports)
     - `actions/basic-action-manager.mjs` (1 import)
     - `actions/targeted-action-manager.mjs` (2 imports)
     - `applications/actor/acolyte-sheet.mjs` (already using new path)
   - Deleted entire `src/module/prompts/` directory (6 files)
   - All imports now point to `applications/prompts/*-dialog.mjs`

### Medium Priority ✅ COMPLETED
4. **TODO/FIXME cleanup** - ✅ EVALUATED
   - Reviewed all 4 TODO comments in codebase
   - 2 valid future features in combat-quick-panel.mjs (weapon selection dialog, consumable logic)
   - No action needed - legitimate placeholders
5. ✅ **Mixin renaming** - DONE (2026-01-08)
   - Renamed `drag-drop-mixin.mjs` → `drag-drop-api-mixin.mjs`
   - Renamed `enhanced-drag-drop-mixin.mjs` → `drag-drop-visual-mixin.mjs`
   - Updated 3 import statements:
     - `applications/api/primary-sheet-mixin.mjs`
     - `applications/api/_module.mjs`
     - `applications/actor/base-actor-sheet.mjs`
   - Clearer naming distinguishes API layer from visual feedback layer

### Low Priority (After NPC Migration) - NOW READY
6. **SCSS V2 consolidation** - Can now proceed!
7. **Split large SCSS files** - Only if needed

### Future (Multi-session effort) ✅ COMPLETED
8. ✅ **Complete V2 migration** - NPC, Starship, Vehicle sheets (DONE 2026-01-08)

---

## Estimated Impact

### Phase 1 (Completed)
- **Removed:** 15 template files, 2 directories
- **Saved:** ~65KB

### Quick Wins (Suggested Above)
- **Remove:** 6 deprecated prompt files, 2 empty dirs
- **Consolidate:** 2 dialog template dirs → 1
- **Effort:** 1-2 hours
- **Saved:** ~5KB, improved organization

### Phase 2 (Post-NPC Migration) - NOW READY
- **Remove:** 7 legacy panel templates, 4 old SCSS files
- **Consolidate:** V2 → standard naming (drop -v2 suffix)
- **Effort:** 2-3 hours
- **Saved:** ~50KB SCSS, eliminates style conflicts

### Phase 3 (V2 Migration Complete) ✅ DONE
- ✅ **Modernized:** 3 monolithic actor sheets → PARTS
- ✅ NPC sheet: 5 tabs (combat, abilities, gear, powers, notes)
- ✅ Starship sheet: 5 tabs (stats, components, weapons, crew, history)
- ✅ Vehicle sheet: 3 tabs (stats, weapons, traits)
- **Benefit:** Architectural consistency, performance, maintainability

---

## Notes

- All suggestions preserve functionality
- No breaking changes to current sheets
- Prioritizes low-effort, high-impact cleanups
- Respects ongoing work (NPC migration dependency)
- Maintains backward compatibility where needed

---

## Related Documents
- `TEMPLATE_CLEANUP_TRACKING.md` - Template cleanup progress
- `AGENTS.md` - Architecture documentation
- `APPLICATIONV2_PROGRESS.md` - V2 migration status
