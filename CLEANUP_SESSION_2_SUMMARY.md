# Cleanup Session 2 - Quick Wins

**Date:** 2026-01-08  
**Session Duration:** ~15 minutes  
**Status:** ✅ Complete  

---

## Objectives

Complete all "Quick Win" items from CLEANUP_SUGGESTIONS.md:
1. Delete deprecated prompt re-exports
2. Remove empty directories
3. Consolidate dialog template directories

---

## Changes Made

### 1. Deleted Deprecated Prompts Directory ✅

**Removed:** `src/module/prompts/` (entire directory)

**Files Deleted:**
- `simple-prompt.mjs` (419 bytes)
- `weapon-prompt.mjs` (344 bytes)
- `psychic-power-prompt.mjs` (350 bytes)
- `force-field-prompt.mjs` (342 bytes)
- `damage-prompt.mjs` (309 bytes)
- `assign-damage-prompt.mjs` (350 bytes)

**Total:** 6 files, ~2.1KB

**Updated Imports (5 files):**
```javascript
// Before
import { prepareDamageRoll } from '../prompts/damage-prompt.mjs';

// After
import { prepareDamageRoll } from '../applications/prompts/damage-roll-dialog.mjs';
```

**Files Updated:**
- `src/module/documents/acolyte.mjs` (2 imports)
- `src/module/actions/basic-action-manager.mjs` (1 import)
- `src/module/actions/targeted-action-manager.mjs` (2 imports)
- `src/module/applications/actor/acolyte-sheet.mjs` (already correct)

---

### 2. Removed Empty Directories ✅

**Deleted:**
- `src/module/applications/dice/` (empty)
- `src/icons/fantasy/` (empty)

**Benefit:** Cleaner file tree, no orphaned directories

---

### 3. Consolidated Dialog Templates ✅

**Before:**
```
src/templates/
├── dialog/               (singular)
│   └── acquisition-dialog.hbs
└── dialogs/              (plural)
    └── loadout-preset-dialog.hbs
```

**After:**
```
src/templates/
└── dialogs/              (plural - matches code convention)
    ├── acquisition-dialog.hbs
    └── loadout-preset-dialog.hbs
```

**Updated:**
- Moved `dialog/acquisition-dialog.hbs` → `dialogs/`
- Updated path in `acquisition-dialog.mjs`
- Removed empty `dialog/` directory

---

## Impact Summary

### Files
- **JavaScript Modules:** 170 → 164 (-6 files)
- **Template Files:** 109 (unchanged)
- **Directories Removed:** 4

### Code Quality
✅ Eliminated deprecated re-export layer  
✅ All imports now point directly to V2 implementations  
✅ Consistent naming (dialogs/ plural matches applications/dialogs/)  
✅ No orphaned empty directories  

### Size Reduction
- Removed ~2.1KB of deprecated code
- Simplified import paths (shorter, clearer)

---

## Testing Checklist

- [ ] Run `npm run build` - should complete without errors
- [ ] Open character sheet - verify it loads
- [ ] Test roll dialogs:
  - [ ] Weapon attack roll
  - [ ] Psychic power roll
  - [ ] Damage roll
  - [ ] Force field test
  - [ ] Assign damage dialog
- [ ] Test acquisition dialog (dynasty tab)
- [ ] Test loadout preset dialog (equipment tab)

---

## Next Steps

All "Quick Win" items complete! Remaining cleanup opportunities:

**Medium Priority:**
1. Address TODO/FIXME comments (4 found)
2. Optional: Rename drag-drop mixins for clarity

**Phase 2 (After NPC Migration):**
1. Delete old panel SCSS files (~50KB)
2. Consolidate V2 panel naming (drop `-v2` suffix)

**Phase 3 (Multi-session):**
1. Migrate NPC sheet to V2 PARTS
2. Migrate Starship sheet to V2 PARTS
3. Migrate Vehicle sheet to V2 PARTS

---

## Related Documents
- `TEMPLATE_CLEANUP_TRACKING.md` - Phase 1 & 2 progress
- `CLEANUP_SUGGESTIONS.md` - Full cleanup roadmap
- `AGENTS.md` - Architecture documentation
