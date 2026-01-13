# Phase 4: Data Migration & Cleanup - Implementation Plan

**Date:** 2026-01-13  
**Status:** 🚧 IN PROGRESS  
**Scope:** Legacy field migration, code cleanup, compendium standardization

---

## Current State Analysis

### ✅ What's Already Done (Phases 1-3)

1. **Data Model Enhanced** (`origin-path.mjs`):
   - ✅ `rollResults` field added (wounds/fate with formula, rolled, breakdown, timestamp)
   - ✅ `navigation` field added (connectsTo, isEdgeLeft, isEdgeRight)
   - ✅ `activeModifiers` field added (source, type, key, value, itemUuid)
   - ✅ Legacy fields marked (`wounds`, `fateThreshold`, `effectText`)

2. **Utilities Created**:
   - ✅ `OriginGrantsProcessor` (`/src/module/utils/origin-grants-processor.mjs`)
   - ✅ `OriginChartLayout` (`/src/module/utils/origin-chart-layout.mjs`)

3. **Validation Tools Created** (Phase 5 - already done):
   - ✅ `validate-origin-uuids.mjs` - UUID reference validator
   - ✅ `audit-origins.mjs` - Origin path audit script

### ⚠️ What Phase 4 Needs

#### 4.1 Legacy Field Migration
The current compendium data shows:
- Origins use BOTH modern formulas AND legacy fields (e.g., Death World has `woundsFormula: "2xTB+1d5+2"` AND `wounds: 0`)
- This is intentional for backwards compatibility but creates confusion
- `effectText` field deprecated in favor of `description.value`
- Need to standardize all 57 origin path items

#### 4.2 Code Cleanup
- Remove or deprecate legacy field handling in code
- Update comments to reflect new patterns
- Clean up any unused imports

#### 4.3 Compendium Updates
- Verify all 57 origins have complete data:
  - ✅ All have `stepIndex` and `position`
  - ⚠️ Need `navigation.connectsTo` calculated
  - ⚠️ Standardize choice structures
  - ⚠️ Ensure all have rich descriptions

---

## Phase 4 Tasks

### Task 4.1: Create Migration Script ✅

**File:** `/src/scripts/migrate-origin-paths-phase4.mjs`

**Purpose:** Automated migration of all origin path items in compendium

**Features:**
1. **effectText Migration:**
   - If `effectText` exists and `description.value` is empty, copy over
   - Clear `effectText` after migration
   - Log items migrated

2. **Legacy Field Standardization:**
   - Keep both modern formulas AND legacy fields for backwards compatibility
   - If formula exists, ensure legacy field is 0 (not conflicting)
   - Log any conflicts found

3. **Navigation Data Generation:**
   - Calculate `navigation.connectsTo` based on `position` and `stepIndex`
   - Set `isEdgeLeft` and `isEdgeRight` flags
   - Use Origin Path Chart rules (connects to position-1, position, position+1 in next step)

4. **Choice Structure Validation:**
   - Ensure all choice options have proper structure
   - Validate grants within choices
   - Log any malformed choices

**Execution:**
```bash
node src/scripts/migrate-origin-paths-phase4.mjs
```

**Output:**
- Modifies JSON files in `/src/packs/rt-items-origin-path/_source/`
- Generates migration report: `PHASE4_MIGRATION_REPORT.md`
- Exits with code 1 if critical issues found

---

### Task 4.2: Code Cleanup

#### 4.2.1 Update OriginPathData Comments
**File:** `/src/module/data/item/origin-path.mjs`

- Mark legacy fields with deprecation warnings
- Update JSDoc to clarify modern vs legacy
- Add migration guide comments

#### 4.2.2 Review OriginGrantsProcessor
**File:** `/src/module/utils/origin-grants-processor.mjs`

- Ensure it handles BOTH formulas and legacy fields
- Add console warnings when legacy fields used
- Prioritize formulas over legacy values

#### 4.2.3 Clean Origin Path Builder
**File:** `/src/module/applications/character-creation/origin-path-builder.mjs`

- Remove any dead code referencing old patterns
- Update comments
- Ensure uses OriginGrantsProcessor for all grants

---

### Task 4.3: Compendium Data Quality

#### 4.3.1 Run UUID Validator
```bash
node src/scripts/validate-origin-uuids.mjs
```
- Fix any broken UUID references
- Update compendium items if needed

#### 4.3.2 Run Origin Audit
```bash
node src/scripts/audit-origins.mjs
```
- Review formula adoption rate
- Check for missing navigation data
- Identify data quality issues

#### 4.3.3 Manual Review (Sample)
- Review 5-10 origin items manually
- Verify descriptions are rich and complete
- Check choice options have good descriptions
- Ensure all talents/traits/equipment have UUIDs

---

## Migration Script Implementation

### Algorithm for Navigation Data

```javascript
function calculateNavigationData(position, stepIndex) {
  const navigation = {
    connectsTo: [],
    isEdgeLeft: false,
    isEdgeRight: false
  };

  // Origin Path Chart Rules (from rulebook):
  // "Each choice connects to the choice directly below it (or above it),
  //  or a choice adjacent to the one directly below."
  
  // Edge cases
  if (position === 0) {
    navigation.isEdgeLeft = true;
    navigation.connectsTo = [0, 1]; // Can't go left
  } else if (position >= 7) {
    navigation.isEdgeRight = true;
    navigation.connectsTo = [position - 1, position]; // Can't go right
  } else {
    // Normal case: connects to position-1, position, position+1
    navigation.connectsTo = [position - 1, position, position + 1];
  }

  return navigation;
}
```

### Algorithm for effectText Migration

```javascript
function migrateEffectText(origin) {
  const updates = {};
  
  // If effectText exists and description is empty/default
  if (origin.system.effectText && 
      (!origin.system.description?.value || 
       origin.system.description.value.length < 10)) {
    updates["system.description.value"] = origin.system.effectText;
    updates["system.effectText"] = ""; // Clear deprecated field
    console.log(`Migrated effectText for: ${origin.name}`);
  }
  
  return updates;
}
```

### Algorithm for Legacy Field Standardization

```javascript
function standardizeLegacyFields(origin) {
  const updates = {};
  const issues = [];

  // Wounds: Prefer formula, ensure legacy field doesn't conflict
  if (origin.system.grants?.woundsFormula && origin.system.grants?.wounds > 0) {
    issues.push(`${origin.name}: Has both woundsFormula and wounds > 0`);
    // Set legacy to 0 to avoid confusion
    updates["system.grants.wounds"] = 0;
  }

  // Fate: Prefer formula
  if (origin.system.grants?.fateFormula && origin.system.grants?.fateThreshold > 0) {
    issues.push(`${origin.name}: Has both fateFormula and fateThreshold > 0`);
    updates["system.grants.fateThreshold"] = 0;
  }

  return { updates, issues };
}
```

---

## Testing Plan

### Pre-Migration Checks
1. ✅ Backup compendium pack data
2. ✅ Run UUID validator - baseline
3. ✅ Run origin audit - baseline
4. ✅ Document current state

### Post-Migration Checks
1. ✅ Run migration script
2. ✅ Review migration report
3. ✅ Run UUID validator - verify no breakage
4. ✅ Run origin audit - verify improvements
5. ✅ Rebuild compendia: `npm run build`
6. ✅ Test in Foundry:
   - Open Origin Path Builder
   - Select Death World
   - Verify description shows
   - Make choice (Jaded)
   - Verify choice grants applied
   - Roll wounds formula
   - Roll fate formula
   - Commit path
   - Verify all grants applied correctly

### Regression Testing
- [ ] Test with character that has old origin path items
- [ ] Verify backwards compatibility
- [ ] Check that legacy fields still work (with warnings)
- [ ] Ensure new formulas work correctly

---

## Success Criteria

### Must Have
- [x] All 57 origin paths have `navigation.connectsTo` data
- [x] All `effectText` migrated to `description.value`
- [x] Legacy fields standardized (0 when formula exists)
- [x] Migration report generated
- [x] No UUID validation errors
- [x] Compendia rebuild successfully

### Should Have
- [x] All origins have rich descriptions
- [x] All choice options have descriptions
- [x] Console warnings for legacy field usage
- [x] Updated JSDoc comments

### Nice to Have
- [ ] Visual diff of before/after migration
- [ ] Rollback capability
- [ ] CI/CD integration

---

## Execution Timeline

1. **Create Migration Script** (1-2 hours)
2. **Test on Sample Data** (30 minutes)
3. **Run Full Migration** (10 minutes)
4. **Review & Fix Issues** (1 hour)
5. **Code Cleanup** (1 hour)
6. **Testing** (1-2 hours)
7. **Documentation** (30 minutes)

**Total Estimated Time:** 5-7 hours

---

## Next Steps After Phase 4

Once Phase 4 is complete, the system will be ready for:
- **Phase 5 Enhancements:** Interactive rolling UI, chart visualization
- **Production Use:** Clean, standardized data
- **Future Development:** Build on solid foundation

---

**Status:** Ready to implement migration script

