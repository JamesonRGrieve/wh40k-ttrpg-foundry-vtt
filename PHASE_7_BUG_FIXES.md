# Phase 7 Bug Fixes

## Issues Fixed

### Issue 1: Missing HandlebarsApplicationMixin Import
**Error:** `404 Not Found - handlebars-application-mixin.mjs`

**Cause:** New dialog files incorrectly imported from non-existent local file.

**Fix:** Changed to use Foundry built-in API:
```javascript
// Before (incorrect)
import HandlebarsApplicationMixin from "../api/handlebars-application-mixin.mjs";

// After (correct)
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
```

**Files Fixed:**
- `src/module/applications/npc/difficulty-calculator-dialog.mjs`
- `src/module/applications/npc/combat-preset-dialog.mjs`

---

### Issue 2: Cannot Set Property toughnessBonus
**Error:** `Cannot set property toughnessBonus of #<NPCDataV2> which has only a getter`

**Cause:** Attempting to set a computed property on the data model directly.

**Fix:** Set the property on the context object instead of `context.system`:
```javascript
// Before (incorrect)
context.system.toughnessBonus = context.system.characteristics?.toughness?.bonus ?? 0;

// After (correct)
context.toughnessBonus = context.system.characteristics?.toughness?.bonus ?? 0;
```

**Files Fixed:**
- `src/module/applications/actor/npc-sheet-v2.mjs` (2 locations)
- `src/templates/actor/npc-v2/header.hbs`
- `src/templates/actor/npc-v2/tab-overview.hbs` (2 locations)
- `src/templates/actor/npc-v2/tab-combat.hbs` (2 locations)

---

### Issue 3: Deprecated {{select}} Helper (Warning Only)
**Warning:** `The {{select}} handlebars helper is deprecated`

**Cause:** Using legacy `{{#select}}` helper in templates.

**Status:** This is a compatibility warning for V12+, not an error. The code still works.

**Note:** The `{{select}}` helper will continue to work until Foundry V14. Migration to `{{selectOptions}}` can be done later if needed, but is not critical for Phase 7.

---

## Testing After Fixes

After applying these fixes, the NPC sheet should:
- [x] Load without 404 errors
- [x] Render without property setter errors
- [x] Display toughness bonus correctly in all locations
- [x] Calculate armor DR correctly (AP + TB)
- [x] Show all Phase 7 features working

## Summary

All **critical** errors have been fixed. The system should now build and run without issues.

The deprecation warning for `{{select}}` is informational only and does not affect functionality.

---

**Date:** 2026-01-15  
**Status:** ✅ All critical issues resolved
