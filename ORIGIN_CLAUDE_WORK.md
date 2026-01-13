# Final Origins & Talents System Review and Refactor Plan

**Date:** 2026-01-12
**Task:** Comprehensive review and refinement of the origins/talents grant system
**Status:** Planning Complete - Ready for User Approval

---

## Executive Summary

The user has completed a significant rewrite of all 62 origin paths and created 9 new career-specific talents to use the talent-based grants system. This plan identifies remaining issues, legacy code to remove, and improvements needed to make the system production-ready.

**Key Finding:** The system architecture is sound, but there are 7 critical areas needing attention: formula evaluation, legacy code removal, data redundancy, validation tooling, error handling, and edge case fixes.

---

## Phase 1: Formula Evaluation System (HIGH PRIORITY)

### Problem
Origin paths define `woundsFormula` ("2xTB+1d5+2") and `fateFormula` ("(1-5|=2),(6-10|=3)") but these formulas are **NEVER evaluated**. The system falls back to static `grants.wounds` and `grants.fateThreshold` fields which are always 0.

**Impact:** Characters from Death World should get `2xTB+1d5+2` wounds but instead get 0.

### Implementation

**Files to Modify:**
- `/src/module/applications/character-creation/origin-path-builder.mjs`
- `/src/module/utils/formula-evaluator.mjs` (NEW FILE)

**Step 1: Create Formula Evaluator Utility**

Create `/src/module/utils/formula-evaluator.mjs`:
- `evaluateWoundsFormula(formula, actor)` - Evaluates wound formulas with TB reference
  - Supports: `2xTB+1d5+2`, `TB+1d5`, `3xWB+1d10`
  - Returns: numeric value
- `evaluateFateFormula(formula)` - Evaluates fate formulas with d10 roll
  - Supports: `(1-5|=2),(6-8|=3),(9-10|=4)`
  - Returns: numeric value based on d10 result
- `parseTBMultiplier(formula)` - Extracts bonus multiplier (e.g., "2xTB" → 2)
- `parseDiceRoll(formula)` - Evaluates dice notation (e.g., "1d5+2")

**Step 2: Integrate into Origin Path Builder**

Modify `origin-path-builder.mjs` `#commitPath` method (~line 750-850):

```javascript
// BEFORE (lines ~810):
const woundsModifier = grants.wounds || 0;
const fateModifier = grants.fateThreshold || 0;

// AFTER:
import { evaluateWoundsFormula, evaluateFateFormula } from "../../utils/formula-evaluator.mjs";

const woundsModifier = grants.woundsFormula
  ? evaluateWoundsFormula(grants.woundsFormula, tempActor)
  : (grants.wounds || 0);

const fateModifier = grants.fateFormula
  ? evaluateFateFormula(grants.fateFormula)
  : (grants.fateThreshold || 0);
```

**Step 3: Update Bonus Preview Calculation**

Modify `_calculateBonuses()` method (~line 321-405) to show formula-evaluated wounds/fate in the preview panel.

---

## Phase 2: Legacy Code Removal (HIGH PRIORITY)

### Problem
Multiple legacy fields and code paths exist that should be migrated or removed.

### Areas to Clean

**1. Remove Legacy Wound/Fate Fields (Data Migration)**

**Files:**
- `/src/module/data/item/origin-path.mjs` (lines 75-82)
- All origin path JSON files

**Action:**
- Keep `grants.wounds` and `grants.fateThreshold` for backward compatibility BUT mark as deprecated
- Add migration code in `OriginPathData.migrateData()` to convert old format → formula format
- Add console warnings when legacy fields are used
- Document migration path in AGENTS.md

**2. Remove Redundant Special Abilities in Talents**

**Problem:** Career talents have `grants.specialAbilities` that duplicate the talent's own effect.

**Example from `exceptional-leader-rogue-trader_CA00000000000001.json`:**
```json
"grants": {
  "specialAbilities": [
    {
      "name": "Inspiring Leadership",
      "description": "Once per round as a Free Action..."
    }
  ]
}
```

This is redundant - the talent's `benefit` field already describes this.

**Action:**
- Remove `grants.specialAbilities` from all 9 career talents
- The talent item itself IS the special ability
- Update talent-grants.mjs to handle specialAbilities only for origin paths (not talents)

**3. Remove Unused effectText Field**

**Files:** Origin path JSON files

**Problem:** `effectText` field duplicates `description.value` content.

**Action:**
- Deprecate `effectText` field in schema
- Migrate existing effectText → description if description is empty
- Remove from all JSON files

---

## Phase 3: Choice System Validation (MEDIUM PRIORITY)

### Problem
Choice system works but has edge cases and incomplete validation.

### Improvements Needed

**1. Press-Ganged Origin Has No Choices**

**File:** `/src/packs/rt-items-origin-path/_source/press-ganged_HNETunUVNx8Fg4RJ.json`

**Problem:** Has `specialAbilities` describing choices but no `choices` array.

**Action:**
- Add proper choices array for skill selection
- Remove text-based special ability description
- Test choice dialog appears correctly

**2. Nested Choice Grants Not Fully Tested**

**Problem:** Death World has choice options with nested `grants.talents` structure - needs verification this works.

**File:** `/src/packs/rt-items-origin-path/_source/death-world_U7riCIV8VzbXC6SN.json` (lines 51-87)

**Action:**
- Verify choice dialog processes nested grants correctly
- Ensure selected choice talents are actually created on actor
- Test with Death World → Jaded vs Resistance (Poisons) choice

**3. Add Choice Validation to Origin Path Builder**

**File:** `/src/module/applications/character-creation/origin-path-builder.mjs`

**Action:**
- Before allowing commit, validate all origins with `hasChoices === true` have `choicesComplete === true`
- Show warning UI if choices incomplete
- Add "Make Choices" button for origins with pending choices

---

## Phase 4: Grant Processing Improvements (MEDIUM PRIORITY)

### Problem
Talent grants system is solid but has inefficiencies and missing features.

### Improvements

**1. Add Error Logging for Missing UUIDs**

**File:** `/src/module/utils/talent-grants.mjs` (lines 93-117)

**Current Behavior:** Silently fails if UUID doesn't resolve.

**Improvement:**
- Log console.error with talent name and UUID
- Optionally show UI notification (configurable)
- Track failed grants for debugging

**2. Recursive Grant Processing**

**Problem:** If Talent A grants Talent B, and Talent B grants Talent C, only B is created (not C).

**File:** `/src/module/utils/talent-grants.mjs`

**Action:**
- After creating granted talent, check if IT has grants
- Recursively process grants (with max depth limit to prevent infinite loops)
- Add flag to track grant chain depth

**3. Optimize Skill Grant Batching**

**File:** `/src/module/utils/talent-grants.mjs` (lines 140-220)

**Current:** Updates actor skills one at a time via accumulator.

**Improvement:**
- Batch all skill updates from all origin steps into single actor.update() call
- Reduces database writes from 6+ to 1 during character creation

---

## Phase 5: Data Validation & Tooling (MEDIUM PRIORITY)

### Problem
No automated tools to verify data integrity across 62 origins + 650+ talents.

### Tools to Create

**1. UUID Reference Validator**

**File:** `/src/scripts/validate-origin-uuids.mjs` (NEW)

**Purpose:**
- Iterate through all origin path compendium items
- Check every `grants.talents[].uuid` exists in talents compendium
- Check every `grants.traits[].uuid` exists in traits compendium
- Check every `grants.equipment[].uuid` exists in gear compendium
- Generate report of missing references

**Usage:** `node src/scripts/validate-origin-uuids.mjs`

**2. Origin Path Audit Script**

**File:** `/src/scripts/audit-origins.mjs` (NEW)

**Purpose:**
- List all origins with `woundsFormula` vs `wounds` (for migration tracking)
- List all origins with `fateFormula` vs `fateThreshold`
- Identify origins with empty `choices` but populated `specialAbilities` (candidates for conversion)
- Generate markdown report

**3. Talent Duplicate Checker**

**File:** `/src/scripts/check-duplicate-talents.mjs` (NEW)

**Purpose:**
- Find talents granted by multiple origins
- Identify potential conflicts (different specializations of same talent)
- Generate reusability report

---

## Phase 6: Origin Path Builder UX (LOW PRIORITY)

### Improvements

**1. Formula Preview**

**File:** `/src/module/applications/character-creation/origin-path-builder.mjs`

**Enhancement:**
- In bonus preview panel, show wound formula alongside calculated value
- Example: "Wounds: 2xTB+1d5+2 = 14" instead of just "14"
- Same for fate formula

**2. Choice Status Indicators**

**Enhancement:**
- Add visual indicator on origin card if it has pending choices
- Show "⚠ Choices Required" badge
- Highlight origins that block commit

**3. Drag-and-Drop from Compendium**

**Current:** Only supports dragging existing origin items from actor.

**Enhancement:**
- Support dragging directly from origin path compendium
- Auto-open choice dialog immediately after drop

---

## Phase 7: Testing & Documentation (REQUIRED)

### Testing Checklist

**Character Creation Flow:**
- [ ] Create Death World character - verify wound formula evaluates correctly
- [ ] Create Death World character - verify fate formula evaluates (d10 roll)
- [ ] Test Death World choice dialog (Jaded vs Resistance) - verify selected talent is granted
- [ ] Create Rogue Trader career - verify all 4 talents are granted
- [ ] Create Explorator career - verify Mechanicus Implants talent grants trait
- [ ] Create character with all 6 origins - verify no errors in console
- [ ] Test origin with nested choices (Hunter) - verify sub-choices work
- [ ] Test replacing origin - verify old grants are removed

**Grant Processing:**
- [ ] Add talent with grants - verify granted items appear
- [ ] Remove talent with grants - verify granted items are offered for removal
- [ ] Test skill grants - verify skill training levels update
- [ ] Test trait grants - verify traits are created

**Edge Cases:**
- [ ] Origin with missing UUID - verify warning appears
- [ ] Duplicate talent grant - verify no duplicate created
- [ ] Recursive grant chain - verify depth limit prevents infinite loop

### Documentation Updates

**Files to Update:**
- `/AGENTS.md` - Add section on formula evaluation system
- `/AGENTS.md` - Document grant processing flow with formulas
- `/AGENTS.md` - Update "Common Gotchas" with formula syntax
- `/resources/RogueTraderInfo.md` - Add origin path formula syntax reference
- Create `/docs/ORIGIN_PATH_FORMULAS.md` - Complete formula syntax guide

---

## Phase 8: Code Quality & Architecture (LOW PRIORITY)

### Refactoring Opportunities

**1. Extract Grant Application Logic**

**Current:** Grant processing split between:
- `origin-path-builder.mjs` (origin path grants)
- `talent-grants.mjs` (talent grants)

**Improvement:**
- Create `/src/module/utils/grant-processor.mjs`
- Unified `applyGrants(grants, actor, source)` method
- Shared code for talent/skill/trait/equipment grants
- Reduces duplication

**2. Type Safety for Formulas**

**Enhancement:**
- Add formula validation in `OriginPathData.defineSchema()`
- Use custom `FormulaField` that validates syntax on data entry
- Prevents invalid formulas from being saved

**3. Grant Tracking System**

**Enhancement:**
- Add `system.grantChain` to track full chain of grants
- Example: "Rogue Trader → Exceptional Leader → [none]"
- Useful for debugging and UI display

---

## Critical Files Reference

### Core System Files

| File | Purpose | Changes Needed |
|------|---------|----------------|
| `/src/module/data/item/origin-path.mjs` | Origin path data model | Add migration, deprecate legacy fields |
| `/src/module/data/item/talent.mjs` | Talent data model | No changes needed (solid) |
| `/src/module/applications/character-creation/origin-path-builder.mjs` | Origin path UI | Add formula evaluation, choice validation |
| `/src/module/utils/talent-grants.mjs` | Talent grant processor | Add error logging, recursive processing |

### New Files to Create

| File | Purpose |
|------|---------|
| `/src/module/utils/formula-evaluator.mjs` | Wound/fate formula evaluation |
| `/src/scripts/validate-origin-uuids.mjs` | UUID reference validator |
| `/src/scripts/audit-origins.mjs` | Origin path data audit |
| `/src/scripts/check-duplicate-talents.mjs` | Talent reusability report |
| `/docs/ORIGIN_PATH_FORMULAS.md` | Formula syntax documentation |

### Data Files to Modify

| Files | Changes |
|-------|---------|
| 9 career talents (`CA00000000000001` - `CA00000000000008` + `CD00000000000002`) | Remove redundant `grants.specialAbilities` |
| `press-ganged_HNETunUVNx8Fg4RJ.json` | Add choices array for skills |
| All origins with `effectText` | Migrate to description, remove field |

---

## Implementation Priority

### Must Do (Blocks Production Use)
1. **Formula Evaluation** - Characters get wrong wound/fate values without this
2. **Press-Ganged Choices** - Origin is broken without choices
3. **UUID Validation** - Prevents runtime errors from missing talents
4. **Testing Checklist** - Ensure no regressions

### Should Do (Quality Improvements)
1. **Legacy Code Removal** - Reduces confusion and technical debt
2. **Grant Processing Improvements** - Better error messages and reliability
3. **Choice Validation** - Better UX for character creation

### Nice to Have (Polish)
1. **Validation Tooling** - Makes future maintenance easier
2. **UX Improvements** - Formula preview, choice indicators
3. **Code Refactoring** - Cleaner architecture

---

## Verification Strategy

### After Each Phase

**Phase 1 (Formulas):**
- Manual test: Create Death World character in-game
- Verify wounds calculated correctly
- Verify fate points rolled correctly
- Check console for errors

**Phase 2 (Legacy Removal):**
- Run full build: `npm run build`
- Check no compendium errors
- Verify old origins still work (migration successful)

**Phase 3 (Choices):**
- Test all origins with choices
- Verify Death World, Press-Ganged, Hunter choices work
- Check choice state persists

**Phase 4 (Grants):**
- Test talent with grants
- Verify recursive grants work
- Check error messages appear for missing UUIDs

**Phase 5 (Validation):**
- Run validation scripts
- Fix any issues identified
- Re-run until clean

**Phase 6-8:**
- Manual UX testing
- Code review
- Performance check

---

## Risk Assessment

### Low Risk
- Formula evaluation (new code, no breaking changes)
- Validation tooling (dev tools only)
- UX improvements (additive changes)

### Medium Risk
- Legacy code removal (requires migration, but well-tested)
- Choice system changes (existing code, careful testing needed)

### High Risk
- Recursive grant processing (potential for infinite loops - needs depth limit)

### Mitigation
- Implement depth limit (max 5 levels) for recursive grants
- Add comprehensive error handling
- Test with all 62 origins before release
- Keep legacy fields for one version (deprecation period)

---

## Success Criteria

✅ All wound/fate formulas evaluate correctly
✅ No missing UUID errors in console
✅ All origins with choices have proper choice arrays
✅ Career talents no longer have redundant grants.specialAbilities
✅ Validation scripts report clean
✅ All test checklist items pass
✅ Documentation updated
✅ Build completes without errors

---

## Estimated Scope

- **High Priority Changes:** ~8-12 hours
  - Formula evaluator: 3-4 hours
  - Origin path builder integration: 2-3 hours
  - Testing: 3-4 hours
  - Bug fixes: 1-2 hours

- **Medium Priority Changes:** ~6-8 hours
  - Legacy removal: 2-3 hours
  - Choice system: 2-3 hours
  - Grant improvements: 2 hours

- **Low Priority Changes:** ~4-6 hours
  - Validation tools: 2-3 hours
  - UX polish: 1-2 hours
  - Documentation: 1 hour

**Total:** 18-26 hours for complete implementation

---

## Notes for Implementation

- User requested: "Do not be afraid of planning entire refactors. I DO NOT WANT SHORTCUTS."
- User requested: "if there is legacy/old code lets remove and migrate it as a part of the task!"
- User stated: "Do not attempt to build, I will build and test manually"

Therefore this plan is comprehensive and targets complete system refinement, not minimal fixes.

