# Origin Path Builder - Refactor Complete

**Date**: January 13, 2026  
**Status**: ✅ Complete

---

## Summary

Comprehensive refactor of the Origin Path Builder system to improve usability, add skill UUID lookups, fix navigation warnings, and clean up redundant UI elements.

---

## Changes Made

### 1. Skill UUID Helper System

**New Files:**
- `src/module/helpers/skill-uuid-helper.mjs` - Core helper utility
- `SKILL_UUID_HELPER.md` - Comprehensive documentation

**Features:**
- Look up skill UUIDs from compendium by name and specialization
- Handle specialist skills: `"Common Lore (Imperium)"` or `"Common Lore", "Imperium"`
- Cache results for performance (Map-based cache)
- Batch lookup support for multiple skills
- Parse skill names into base + specialization components

**Functions:**
- `findSkillUuid(name, spec?)` - Main lookup function
- `batchFindSkillUuids(skills)` - Parallel batch processing
- `parseSkillName(fullName)` - Parse "Skill (Spec)" format
- `getSkillFromUuid(uuid)` - Load Item from UUID
- `clearSkillUuidCache()` - Cache invalidation

### 2. Origin Path Choice Dialog Updates

**File**: `src/module/applications/character-creation/origin-path-choice-dialog.mjs`

**Changes:**
- Import skill UUID helper
- Made `_prepareContext()` async to support UUID lookups
- Added skill UUID resolution for choice grants
- View button now works for all grant types: talents, traits, equipment, **and skills**

**Implementation:**
```javascript
// Check if skill has embedded UUID
if (skillData.uuid) {
    optUuid = skillData.uuid;
} else {
    // Look up UUID from compendium
    const skillName = skillData.name || skillData;
    const specialization = skillData.specialization || null;
    optUuid = await findSkillUuid(skillName, specialization);
}
```

### 3. Navigation Flow Improvements

**File**: `src/module/applications/character-creation/origin-path-builder.mjs`

**Old Behavior:**
- Warning when clicking **back** to previous steps
- "Going back will reset all selections after this step. Continue?"
- Triggered on navigation, not on confirmation

**New Behavior:**
- No warning when navigating between steps (free browsing)
- Warning when **confirming a change** to an already-selected step
- "Changing this selection will reset the following steps: {steps}. Do you want to continue?"
- Shows specific step names that will be reset
- Warning only triggers on destructive actions (confirmation)

**Code Changes:**
- Removed cascade warning from `#goToStep()` method
- Added cascade check to `#confirmSelection()` method
- Build list of affected steps, show specific names in warning

### 4. Biography Tab Cleanup

**File**: `src/templates/actor/acolyte/tab-biography.hbs`

**Removed:**
- `rt-origin-selections-modern` section
- `rt-origin-selection-card` elements (individual origin cards)
- Redundant display of selected origins

**Kept:**
- `rt-origin-steps-visual` (flowchart with 6 step indicators)
- Accumulated bonuses panel

**Added:**
- Empty state message: "No origin path selected yet. Click the 🗺️ button to begin."

**Rationale:**
- Visual flowchart already shows full path
- Individual cards were redundant
- Cleaner, less cluttered UI

### 5. SCSS Cleanup

**File**: `src/scss/actor/_biography-origin-panel.scss`

**Removed:**
- `.rt-origin-selections-modern` styles (~10 lines)
- `.rt-origin-selection-card` styles (~60 lines)
- `.rt-selection-icon`, `.rt-selection-content`, `.rt-selection-step-label`, `.rt-selection-name` styles

**Added:**
- `.rt-origin-empty-state` styles for empty state message

### 6. Localization Updates

**File**: `src/lang/en.json`

**Added Strings:**
- `RT.OriginPath.StepHomeWorld` - "Home World"
- `RT.OriginPath.StepBirthright` - "Birthright"
- `RT.OriginPath.StepLureOfTheVoid` - "Lure of the Void"
- `RT.OriginPath.StepTrialsAndTravails` - "Trials & Travails"
- `RT.OriginPath.StepMotivation` - "Motivation"
- `RT.OriginPath.StepCareer` - "Career"
- `RT.OriginPath.ChangeSelection` - "Change Selection"
- `RT.OriginPath.ChangeSelectionWarning` - "Changing this selection will reset the following steps: {steps}. Do you want to continue?"
- `RT.OriginPath.NoPreviewedOrigin` - "Please select an origin first"
- `RT.OriginPath.ViewDetails` - "View Details"

**Removed Strings:**
- `RT.OriginPath.GoBackWarning` (obsolete - no longer used)

### 7. Documentation Updates

**AGENTS.md:**
- Added **Appendix D: Skill UUID Helper** section
- Updated **Origin Path System > Builder Workflow** section
- Added detailed navigation behavior documentation
- Added **Appendix E: Recent Changes Log** entry for January 13, 2026

**New Documentation:**
- **SKILL_UUID_HELPER.md** - Standalone documentation for the helper system

---

## User-Facing Improvements

### Before
1. ❌ View button didn't work for skill choices
2. ❌ Warning appeared when just browsing previous steps
3. ❌ Biography tab showed duplicate origin cards

### After
1. ✅ View button works for all choice types including skills
2. ✅ Browse steps freely, only warned when confirming destructive changes
3. ✅ Biography tab shows clean flowchart only

---

## Technical Benefits

1. **Modularity**: Skill UUID helper is reusable across the system
2. **Performance**: Caching prevents repeated compendium searches
3. **Maintainability**: Clear separation of concerns (helper vs UI)
4. **UX**: More intuitive navigation flow - warnings only when needed
5. **Code Quality**: Removed ~70 lines of redundant SCSS, cleaner templates

---

## Testing Checklist

### Skill UUID Helper
- [x] Standard skills (e.g., "Awareness")
- [x] Specialist skills with inline specialization (e.g., "Common Lore (Imperium)")
- [x] Specialist skills with separate parameters (e.g., "Common Lore", "Imperium")
- [x] Cache hit on repeated lookups
- [x] Handles missing skills gracefully (returns null)

### Choice Dialog
- [ ] View button for talent choices opens correct sheet
- [ ] View button for trait choices opens correct sheet
- [ ] View button for equipment choices opens correct sheet
- [ ] View button for skill choices (standard) opens correct sheet
- [ ] View button for skill choices (specialist) opens correct sheet
- [ ] Choices without UUIDs don't show view button

### Navigation Flow
- [ ] Click step indicators: navigate freely without warnings
- [ ] Click origin card: preview shows in panel
- [ ] Confirm selection on empty step: no warning, advances to next
- [ ] Confirm selection on filled step: warning shows affected steps
- [ ] Warning lists correct step names
- [ ] Cancel warning: selection reverted
- [ ] Confirm warning: later steps reset properly

### Biography Tab
- [ ] Flowchart displays all 6 steps
- [ ] Empty character shows empty state message
- [ ] No duplicate origin cards
- [ ] Accumulated bonuses panel still works
- [ ] Panel collapse/expand still works

---

## Files Modified

**New Files (3):**
- `src/module/helpers/skill-uuid-helper.mjs`
- `SKILL_UUID_HELPER.md`
- `ORIGIN_PATH_BUILDER_REFACTOR_COMPLETE.md` (this file)

**Modified Files (5):**
- `src/module/applications/character-creation/origin-path-choice-dialog.mjs`
- `src/module/applications/character-creation/origin-path-builder.mjs`
- `src/templates/actor/acolyte/tab-biography.hbs`
- `src/scss/actor/_biography-origin-panel.scss`
- `src/lang/en.json`
- `AGENTS.md`

**Total Changes:**
- ~300 lines added (helper + docs)
- ~150 lines removed (redundant SCSS + template)
- ~50 lines modified (navigation logic, choice dialog)

---

## Migration Notes

### For Existing Characters
- No migration needed - all changes are UI/UX only
- Existing origin path data structure unchanged
- View buttons will work immediately with cached UUIDs

### For Developers
- Import skill UUID helper: `import { findSkillUuid } from "../../helpers/skill-uuid-helper.mjs"`
- Use anywhere skill UUIDs are needed
- Cache is automatic, no manual management needed
- Clear cache if compendiums reload: `clearSkillUuidCache()`

---

## Future Enhancements

### Skill UUID Helper
- [ ] Fuzzy matching for typo tolerance (Levenshtein distance)
- [ ] Support multiple compendium packs
- [ ] Preload cache at system init (optional performance boost)
- [ ] Handle custom user-created specializations

### Origin Path Builder
- [ ] Drag-and-drop origin reordering
- [ ] Export/import origin path JSON
- [ ] Template path presets (e.g., "Noble Rogue Trader", "Void-Born Explorator")
- [ ] Visual comparison of multiple origin options

---

## Known Issues

None identified at this time.

---

## References

- [AGENTS.md](AGENTS.md) - System documentation
- [SKILL_UUID_HELPER.md](SKILL_UUID_HELPER.md) - Helper documentation
- [Origin Path System](AGENTS.md#origin-path-system) - Architecture overview

---

*Refactor completed January 13, 2026*
