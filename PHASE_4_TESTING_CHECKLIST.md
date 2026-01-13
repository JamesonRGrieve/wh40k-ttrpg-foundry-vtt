# Phase 4 Testing Checklist

**Purpose:** Verify Phase 4 migration and integration before proceeding to Phase 5

---

## Pre-Testing Setup

### Build System
- [ ] Run `npm run build` to rebuild compendia
- [ ] Verify no build errors
- [ ] Check dist/ folder has updated LevelDB packs
- [ ] Verify timestamp on built files

### Foundry Setup
- [ ] Launch Foundry VTT
- [ ] Create clean test world with Rogue Trader system
- [ ] Verify system version
- [ ] Check for console errors on startup

---

## Test 1: Basic Origin Path Builder

### Objective: Verify builder opens and displays correctly

- [ ] Create new test actor (Acolyte type)
- [ ] Open Origin Path Builder from character sheet
- [ ] Verify builder dialog opens
- [ ] Check that all 6 steps show
- [ ] Verify no console errors

**Expected Result:** Builder opens cleanly with empty 6-step display

---

## Test 2: Simple Origin Selection (No Choices)

### Objective: Test origin without choices

- [ ] Select "Imperial World" for Home World (step 1)
- [ ] Verify origin appears in slot
- [ ] Check preview panel shows bonuses
- [ ] Verify characteristics preview correct
- [ ] Note: Imperial World has no choices

**Expected Characteristics:**
- +3 Willpower, +3 Fellowship, -3 Toughness

**Expected Grants:**
- Skills: Common Lore (Imperium, War), Scholastic Lore (Imperial Creed)
- Talents: various

---

## Test 3: Origin With Choices (CRITICAL TEST)

### Objective: Verify choice grants work correctly

#### Step 1: Select Death World
- [ ] Select "Death World" for Home World
- [ ] Verify "Choices Required" badge appears
- [ ] Click to make choice
- [ ] Choice dialog opens

#### Step 2: Make Choice Selection
- [ ] Dialog shows "Hardened: Choose one"
- [ ] Options: Jaded vs Resistance (Poisons)
- [ ] Select "Jaded"
- [ ] Confirm selection
- [ ] Dialog closes

#### Step 3: Verify Choice Recorded
- [ ] Death World slot shows choice badge complete
- [ ] Preview panel shows Jaded in talent list
- [ ] Verify "Jaded" marked with * (from choice)
- [ ] Check browser console for choice tracking

**Expected Death World Grants:**
- +5 Strength, +5 Toughness, -5 Willpower, -5 Fellowship
- Skill: Survival (Trained)
- Talents: If It Bleeds..., Paranoid, Survivor, **Jaded** (from choice)

---

## Test 4: Complete Origin Path

### Objective: Build full 6-step path

- [ ] Step 1 (Home World): Death World ✓ (already selected)
- [ ] Step 2 (Birthright): Select "Savant"
- [ ] Step 3 (Lure of the Void): Select "Duty Bound"
- [ ] Step 4 (Trials): Select "Press-Ganged"
- [ ] Step 5 (Motivation): Select "Fortune"
- [ ] Step 6 (Career): Select "Rogue Trader"

- [ ] Verify all 6 slots filled
- [ ] Check preview totals are aggregated
- [ ] Verify "Ready to Commit" state
- [ ] Note any warnings or validation messages

---

## Test 5: Origin Path Commit (CRITICAL TEST)

### Objective: Verify all grants apply correctly on commit

#### Before Commit
- [ ] Note character's current characteristics (should be base 20s)
- [ ] Note current wounds/fate values
- [ ] Note skills list (should be mostly empty)
- [ ] Note talents list (should be empty)

#### Commit Path
- [ ] Click "Commit to Character" button
- [ ] Confirm commit dialog
- [ ] Wait for processing
- [ ] Builder closes

#### After Commit - Verify Characteristics
- [ ] Strength: 25 (20 base + 5 Death World)
- [ ] Toughness: 25 (20 + 5 DW)
- [ ] Willpower: ~18-20 (varies by other origins)
- [ ] Fellowship: ~18-20 (varies)
- [ ] Other characteristics: verify against origin bonuses

#### After Commit - Verify Items Created
- [ ] 6 origin path items in character's items
- [ ] Death World item present
- [ ] Jaded talent present (from choice!) ← **KEY TEST**
- [ ] Other talents from all origins present
- [ ] Skills created/upgraded correctly
- [ ] Starting equipment present

#### After Commit - Verify Wounds/Fate
- [ ] Wounds.max = base + formula result from origins
- [ ] Fate.max = base + formula result from origins
- [ ] Values seem reasonable

---

## Test 6: Choice Grant Verification (CRITICAL)

### Objective: Confirm choice grants applied automatically

- [ ] Open character sheet
- [ ] Navigate to Talents tab
- [ ] Find "Jaded" talent in list
- [ ] Click to open Jaded item sheet
- [ ] Verify it's the correct talent (no Insanity from mundane events)
- [ ] Check source/origin tracking (if available)

**This is the PROOF that Phase 4 works!** If Jaded is present, choice grants are working.

---

## Test 7: Formula Evaluation

### Objective: Verify wounds/fate formulas evaluate correctly

- [ ] Check character wounds.max value
- [ ] Calculate expected: base + (Death World: 2×TB + 1d5 + 2) + other origins
- [ ] With TB=5: 2×5 + [1-5] + 2 = 12-16 bonus expected
- [ ] Verify value is in reasonable range

- [ ] Check character fate.max value
- [ ] Death World fate: Roll 1d10 → (1-5=2pts, 6-10=3pts)
- [ ] Expected: base + 2 or 3 + other origins
- [ ] Verify value is reasonable

---

## Test 8: Navigation Data

### Objective: Verify navigation metadata present

- [ ] Open browser console
- [ ] Run: `game.packs.get("rogue-trader.rt-items-origin-path")`
- [ ] Get a document: `await pack.getDocument("U7riCIV8VzbXC6SN")` (Death World ID)
- [ ] Check: `doc.system.navigation`
- [ ] Should have: `connectsTo: [0,1,2]`, `isEdgeLeft: false`, `isEdgeRight: false`

---

## Test 9: Legacy Field Warnings

### Objective: Verify deprecation warnings appear

- [ ] Open browser console (clear it first)
- [ ] Create new test character
- [ ] Open Origin Path Builder
- [ ] Select any origin
- [ ] Check console for warnings about legacy fields
- [ ] Should see warnings if any origins use old `wounds` or `fateThreshold`

**Expected:** Either no warnings (all using formulas) or warnings guiding to modern approach

---

## Test 10: Validation Scripts

### Objective: Run validation scripts and review output

```bash
# UUID Validator
node src/scripts/validate-origin-uuids.mjs

# Origin Audit
node src/scripts/audit-origins.mjs
```

- [ ] UUID validator runs successfully
- [ ] No critical UUID errors
- [ ] Audit script runs successfully
- [ ] Review formula adoption rate
- [ ] Check for data quality issues

---

## Test 11: Edge Cases

### Objective: Test unusual scenarios

#### Multiple Choices on One Origin
- [ ] Find origin with multiple choice blocks
- [ ] Make selections for all choices
- [ ] Verify all choices apply correctly

#### Choice with Characteristic Bonus
- [ ] Select Pride motivation
- [ ] Choose "+3 Toughness" option
- [ ] Commit path
- [ ] Verify Toughness increased by 3

#### Advanced Origin (XP Cost)
- [ ] Select an advanced origin (Into The Storm)
- [ ] Verify XP cost displayed
- [ ] Commit path
- [ ] Check if XP deducted (if implemented)

---

## Regression Testing

### Objective: Ensure old functionality still works

#### Existing Character with Old Origins
- [ ] Import character with origin paths from before Phase 4
- [ ] Open character sheet
- [ ] Verify origins still display correctly
- [ ] Check characteristics still calculated
- [ ] Verify no errors in console

#### Origin Without Modern Formulas
- [ ] If any origins still use legacy `wounds` field
- [ ] Verify they still work
- [ ] Check console warning appears
- [ ] Verify value applies correctly

---

## Performance Testing

### Objective: Check for performance issues

- [ ] Open Origin Path Builder
- [ ] Note load time
- [ ] Switch between origins rapidly
- [ ] Check for lag or delays
- [ ] Monitor memory usage in browser console

**Expected:** Smooth, responsive UI with no lag

---

## Bug Checks

### Known Issues to Verify Fixed

- [ ] Choice grants not applying ← **PRIMARY FIX**
- [ ] Active modifiers not calculated
- [ ] Navigation data missing
- [ ] effectText vs description confusion

### New Issues to Watch For

- [ ] Migration breaking existing characters
- [ ] Formula evaluation errors
- [ ] UUID resolution failures
- [ ] Console error spam

---

## Success Criteria

### Must Pass
- ✅ Test 3: Origin with choices (Jaded talent appears)
- ✅ Test 5: Origin path commit (all grants apply)
- ✅ Test 6: Choice grant verification (Jaded is present in talents)
- ✅ No console errors during normal usage

### Should Pass
- ✅ All other functional tests
- ✅ Validation scripts run clean
- ✅ No performance issues

### Can Defer
- ⚠️ Advanced origin XP deduction (if not implemented)
- ⚠️ Full regression test on old characters (sample is OK)

---

## Test Results Log

**Tester:** _____________  
**Date:** _____________  
**System Version:** _____________  
**Foundry Version:** _____________  

### Issues Found

| Test # | Issue Description | Severity | Status |
|--------|------------------|----------|--------|
|        |                  |          |        |
|        |                  |          |        |

### Overall Result

- [ ] ✅ PASS - Ready for Phase 5
- [ ] ⚠️ PASS WITH WARNINGS - Minor issues, can proceed
- [ ] ❌ FAIL - Critical issues, need fixes

---

## Sign-Off

Phase 4 testing complete and approved for:
- [ ] Production use
- [ ] Phase 5 development

**Tested By:** _____________  
**Approved By:** _____________  
**Date:** _____________

