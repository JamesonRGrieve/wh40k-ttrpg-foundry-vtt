# Ship Items Refactor - Testing & Validation Guide
**Date**: 2026-01-09  
**Phase**: Post-Implementation Testing

---

## 📋 Overview

This document provides step-by-step testing procedures for the ship items refactor. Follow these tests to ensure all ship components, weapons, and upgrades display and function correctly.

---

## ✅ Pre-Testing Checklist

### Files Modified

1. **Data Models**:
   - [x] `src/module/data/item/ship-upgrade.mjs` - Added migrateData() and cleanData()
   - [x] `src/module/data/item/ship-weapon.mjs` - Enhanced migrateData() for "-" strings and type field

2. **Templates**:
   - [x] `src/templates/actor/panel/ship-upgrades-panel.hbs` - Fixed field references
   - [x] `src/templates/actor/panel/ship-weapons-panel.hbs` - Added display helpers

3. **Helpers**:
   - [x] `src/module/handlebars/handlebars-helpers.mjs` - Added displayStrength() and displayCrit()

4. **Scripts** (Created):
   - [x] `scripts/clean-ship-weapons.mjs` - Pack data cleanup utility

### Build System

```bash
# 1. Build the system
npm run build

# Expected output: No errors, successful compilation
```

---

## 🧪 Test Suite

### Test 1: Ship Upgrades Display ⚡ CRITICAL

**Objective**: Verify ship upgrades display correctly (no `[object Object]`)

**Steps**:

1. **Start Foundry** with the built system
2. **Open or create** a Starship actor
3. **Navigate to** the ship sheet Components/Upgrades panel
4. **Verify the following**:

| Field | Expected | ❌ Before | ✅ After |
|-------|----------|-----------|----------|
| Power | Numeric value or `0` | `[object Object]` | `0` or `-2` |
| Space | Numeric value or `0` | `[object Object]` | `2` or `0` |
| Effect | HTML text content | May show raw HTML | Rendered HTML |

**Success Criteria**:
- ✅ No `[object Object]` appears anywhere
- ✅ Power values are numbers (not objects)
- ✅ Space values are numbers
- ✅ Effect text renders as HTML (bold, paragraphs, etc.)

**Test Data**:
- Use existing ship actors in `rt-actors-ships` compendium
- Or drag "Planet-Bound for Millenia" upgrade to a ship

**Screenshot Locations**:
- Before: (if you have screenshots showing the bug)
- After: Take screenshot showing correct display

---

### Test 2: Ship Weapons Display 🎯 HIGH PRIORITY

**Objective**: Verify ship weapons display strength/crit correctly

**Steps**:

1. **Open** a Starship actor with weapons
2. **Navigate to** the Weapons panel
3. **Check each weapon** in the list

**Expected Display**:

| Weapon | Strength | Crit | Notes |
|--------|----------|------|-------|
| **Boarding Torpedo** | `-` | `-` | Should show dash (values are 0 in data) |
| **Bombardment Cannon** | `3` | `2+` | Should show numeric values |
| **Disruption Macrocannons** | `3` | `-` | Crit is 0, shows dash |

**Success Criteria**:
- ✅ Weapons with `strength: 0` display as `-`
- ✅ Weapons with `crit: 0` display as `-`
- ✅ Weapons with numeric strength show the number
- ✅ Weapons with numeric crit show `N+` format (e.g., `5+`)
- ✅ Location displays correctly (Prow, Dorsal, etc.)
- ✅ Damage and Range display correctly

**Test Coverage**:
- Test at least 5 different weapons
- Include weapons with 0 strength
- Include weapons with 0 crit
- Include weapons with valid numeric values

---

### Test 3: Ship Components Display ✅ REGRESSION TEST

**Objective**: Ensure ship components still work (no regressions)

**Steps**:

1. **Open** a Starship actor
2. **Navigate to** the Components panel
3. **Verify existing functionality**

**Expected Behavior**:

| Field | Expected |
|-------|----------|
| Component Type | Localized label (e.g., "Bridge", "Plasma Drive") |
| Power | `+40` for generators, `-2` for consumers, `0` for neutral |
| Space | Numeric value |
| Ship Points (SP) | Numeric value |
| Condition | Badge (Functional/Damaged/Unpowered/Destroyed) |

**Success Criteria**:
- ✅ All components display correctly
- ✅ Power shows `+` for generators, `-` for consumers
- ✅ Essential components have "ES" badge
- ✅ Component type shows localized label
- ✅ No `[object Object]` errors
- ✅ No console errors

**Known Good State**:
- Ship components were already working before this refactor
- This test ensures we didn't break anything

---

### Test 4: Compendium Browser Integration

**Objective**: Verify ship items display in compendium

**Steps**:

1. **Open** Compendium Browser (if available)
2. **Browse** to Ship Components compendium
3. **Browse** to Ship Weapons compendium
4. **Browse** to Ship Upgrades compendium

**Expected**:
- Items display with correct names
- Clicking item opens item sheet
- No errors in console

**Success Criteria**:
- ✅ All ship items visible
- ✅ Item names display correctly
- ✅ Item descriptions show
- ✅ Can drag items to ship actor

---

### Test 5: Adding Items to Ship

**Objective**: Test full workflow of equipping ship items

**Steps**:

1. **Open** a Starship actor
2. **Open** Ship Components compendium
3. **Drag** a component to the ship
4. **Verify** component appears in list
5. **Verify** power/space calculations update

**Repeat for**:
- Ship Weapon (drag from weapons compendium)
- Ship Upgrade (drag from upgrades compendium)

**Success Criteria**:
- ✅ Items add without errors
- ✅ Power budget updates correctly
- ✅ Space usage updates correctly
- ✅ Item displays in panel with all fields correct

---

### Test 6: Editing Ship Items

**Objective**: Verify item sheets work for ship items

**Steps**:

1. **Right-click** a ship component → Edit
2. **Modify** a field (e.g., change power value)
3. **Save** and close sheet
4. **Verify** changes appear in ship panel

**Expected**:
- Item sheet opens (may be generic ItemSheet for now)
- Fields are editable
- Changes save correctly

**Note**: Custom ship item sheets are Phase 3 (deferred). Generic ItemSheet should work minimally.

---

### Test 7: Deleting Ship Items

**Objective**: Verify items can be removed

**Steps**:

1. **Click** delete button on a ship upgrade
2. **Confirm** deletion
3. **Verify** item removed from list
4. **Verify** power/space recalculated

**Success Criteria**:
- ✅ Item deletes without errors
- ✅ Power/space totals update
- ✅ No orphaned data

---

### Test 8: Console Error Check

**Objective**: Ensure no runtime errors

**Steps**:

1. **Open** browser console (F12)
2. **Clear** console log
3. **Open** a starship actor
4. **Navigate** through all tabs
5. **Expand** all panels

**Success Criteria**:
- ✅ No red error messages
- ✅ No yellow warnings (acceptable if pre-existing)
- ✅ No `undefined` property access errors
- ✅ No validation errors

**Common Errors to Watch For**:
- `Cannot read property 'used' of undefined` - Would indicate ship upgrade migration failed
- `Cannot read property 'type' of undefined` - Would indicate weapon migration failed
- `TypeError: X is not a function` - Would indicate missing helper

---

## 🔧 Troubleshooting Guide

### Issue: Ship Upgrades Still Show `[object Object]`

**Diagnosis**:
- DataModel migration not running
- Template still using legacy field names

**Fix**:
1. Check `ship-upgrade.mjs` has `migrateData()` method
2. Check template uses `{{item.system.power}}` not `{{item.system.powerUsage}}`
3. Rebuild system: `npm run build`
4. Hard refresh browser: Ctrl+Shift+R

---

### Issue: Weapons Show `"-"` String Instead of Dash

**Diagnosis**:
- Pack data still has string `"-"` values
- Migration not converting to 0
- Display helper not registered

**Fix**:
1. Run cleanup script: `node scripts/clean-ship-weapons.mjs`
2. Check `displayStrength` and `displayCrit` helpers registered
3. Check template uses `{{displayStrength ...}}` not `{{item.system.strength}}`
4. Rebuild and refresh

---

### Issue: Console Errors About Undefined Properties

**Diagnosis**:
- Migration not handling all edge cases
- Pack data has unexpected structure

**Fix**:
1. Note which item causes error
2. Check that item's pack data structure
3. Add additional migration logic if needed
4. Update cleanData() to handle edge case

---

### Issue: Ship Components No Longer Work

**Diagnosis**:
- Regression from template changes
- Accidentally modified component-related files

**Fix**:
1. **DO NOT MODIFY** `ship-component.mjs` (already working)
2. **DO NOT MODIFY** `ship-components-panel.hbs` (already working)
3. Review git diff to see what changed
4. Revert any unintended changes

---

## 📊 Test Results Template

Use this template to record test results:

```markdown
## Test Results - [Date] - [Tester Name]

### Environment
- Foundry Version: [e.g., V13.330]
- System Version: [e.g., 1.0.0-dev]
- Browser: [e.g., Chrome 120]

### Test 1: Ship Upgrades Display
- Status: ✅ PASS / ❌ FAIL
- Notes: [Any observations]
- Screenshots: [Attach if relevant]

### Test 2: Ship Weapons Display
- Status: ✅ PASS / ❌ FAIL
- Weapons Tested: [List weapon names]
- Notes: [Any observations]

### Test 3: Ship Components Display
- Status: ✅ PASS / ❌ FAIL
- Notes: [Any observations]

### Test 4: Compendium Browser
- Status: ✅ PASS / ❌ FAIL / ⏭️ SKIP
- Notes: [If skipped, why?]

### Test 5: Adding Items
- Status: ✅ PASS / ❌ FAIL
- Items Added: [Component name, weapon name, upgrade name]
- Notes: [Any issues?]

### Test 6: Editing Items
- Status: ✅ PASS / ❌ FAIL
- Notes: [Any observations]

### Test 7: Deleting Items
- Status: ✅ PASS / ❌ FAIL
- Notes: [Any observations]

### Test 8: Console Errors
- Status: ✅ PASS / ❌ FAIL
- Errors Found: [List any errors]
- Screenshots: [Console screenshot if errors]

### Overall Result
- **Status**: ✅ ALL PASS / ⚠️ ISSUES FOUND / ❌ MAJOR FAILURES
- **Ready for Production**: YES / NO / NEEDS WORK
- **Blockers**: [List any critical issues]
- **Minor Issues**: [List any non-critical issues]

### Recommendations
[What should be done next?]
```

---

## 🚀 Post-Testing Actions

### If All Tests Pass ✅

1. **Commit changes**:
   ```bash
   git add src/module/data/item/ship-upgrade.mjs
   git add src/module/data/item/ship-weapon.mjs
   git add src/templates/actor/panel/ship-upgrades-panel.hbs
   git add src/templates/actor/panel/ship-weapons-panel.hbs
   git add src/module/handlebars/handlebars-helpers.mjs
   git add scripts/clean-ship-weapons.mjs
   git commit -m "fix: Ship items display - migrate upgrades, handle weapon edge cases"
   ```

2. **Update documentation**:
   - Mark Phase 1 & 2 complete in `SHIP_ITEMS_COMPLETE_REFACTOR_PLAN.md`
   - Update `AGENTS.md` with new patterns

3. **Optional**: Run weapon cleanup script
   ```bash
   node scripts/clean-ship-weapons.mjs --dry-run  # Preview changes
   node scripts/clean-ship-weapons.mjs             # Apply changes
   git add src/packs/rt-items-ship-weapons/_source/
   git commit -m "chore: Clean ship weapons pack data"
   ```

### If Tests Fail ❌

1. **Document failures** in test results
2. **Do NOT commit** broken code
3. **Review troubleshooting guide** above
4. **Fix issues** and re-test
5. **Repeat** until all tests pass

---

## 📚 Additional Testing (Optional)

### Performance Testing

**Load Test**:
- Create ship with 50+ components
- Verify performance is acceptable
- Check for memory leaks

### Edge Case Testing

**Unusual Data**:
- Weapon with negative power (should work)
- Component with very high SP cost
- Upgrade with HTML in effect field

### Backwards Compatibility

**Legacy Ships**:
- Load ships created before refactor
- Verify they still work
- Verify old data migrates correctly

---

## 🎯 Success Metrics

### Must Achieve (Critical)
- ✅ Zero `[object Object]` displays
- ✅ All ship upgrades display correctly
- ✅ All ship weapons display correctly
- ✅ No console errors
- ✅ No data loss

### Should Achieve (High Priority)
- ✅ Strength/crit show as "-" when 0
- ✅ Power/space values are numeric
- ✅ HTML renders in effect fields
- ✅ Can add/edit/delete items

### Nice to Have (Medium Priority)
- ✅ Compendium browser works
- ✅ Performance is good
- ✅ All edge cases handled

---

**Testing Duration**: 30-60 minutes  
**Critical Path**: Tests 1, 2, 3, 8  
**Can Defer**: Tests 4, 6 (if time-limited)
