# Testing Checklist - Specialist Skills Inheritance Fix

**Status**: Ready for Testing  
**Date**: January 14, 2026

---

## Pre-Test Verification

- [x] All files created
- [x] All syntax validated
- [x] All imports verified
- [x] Documentation complete
- [ ] Build successful
- [ ] Foundry launches without errors

---

## Build Test

```bash
cd /home/aqui/RogueTraderVTT
npm run build
```

**Expected**: No errors, dist/ folder populated

---

## Test 1: New Character with Origin Path

### Steps
1. Launch Foundry, create new world/use test world
2. Create new Rogue Trader character
3. Open character sheet
4. Navigate to Biography tab
5. Open Origin Path Builder
6. Select origin paths that grant specialist skills
   - Examples: Hive World, Void Born, etc.
7. Complete all 6 origin steps
8. Commit path to character

### Verify
- [ ] No console errors during origin path selection
- [ ] Skills appear in Skills tab
- [ ] Specialist skills show in correct section
- [ ] Common Lore (or other specialist) has entries
- [ ] Each entry shows a characteristic (Int, Ag, etc.)
- [ ] Entry values are non-zero (if character has the stat)

### Example Expected Values
**Character with Intelligence 35, Common Lore (Imperium) trained:**
- Common Lore entry should show: 35 (or 37 if has +10, or 55 if has +20)
- Characteristic shown: Int
- Not 0 or undefined

---

## Test 2: Stat Changes Update Skills

### Steps
1. Using character from Test 1
2. Note current Common Lore (Imperium) value
3. Go to Characteristics section
4. Increase/decrease Intelligence
5. Return to Skills tab
6. Check Common Lore (Imperium) value

### Verify
- [ ] Skill value updates immediately
- [ ] New value = Intelligence + training bonus
- [ ] No console errors

### Example
**Before**: Int 35, Common Lore = 35  
**After**: Int 40, Common Lore = 40 (updated automatically)

---

## Test 3: Multiple Specializations

### Steps
1. Grant multiple specializations of same skill
   - Common Lore (Imperium)
   - Common Lore (Tech)
   - Common Lore (War)
2. Check Skills tab

### Verify
- [ ] All specializations appear as separate entries
- [ ] Each has correct characteristic (Int)
- [ ] Each calculates independently
- [ ] Changing Intelligence updates all entries

---

## Test 4: All 12 Specialist Skills

Test each specialist skill type:

- [ ] Ciphers (Int) - e.g., Ciphers (Mercantile)
- [ ] Common Lore (Int) - e.g., Common Lore (Imperium)
- [ ] Drive (Ag) - e.g., Drive (Ground Vehicle)
- [ ] Forbidden Lore (Int) - e.g., Forbidden Lore (Warp)
- [ ] Navigation (Int) - e.g., Navigation (Stellar)
- [ ] Performer (Fel) - e.g., Performer (Musician)
- [ ] Pilot (Ag) - e.g., Pilot (Flyers)
- [ ] Scholastic Lore (Int) - e.g., Scholastic Lore (Occult)
- [ ] Secret Tongue (Int) - e.g., Secret Tongue (Rogue Trader)
- [ ] Speak Language (Int) - e.g., Speak Language (High Gothic)
- [ ] Tech-Use (Int) - e.g., Tech-Use (Archaeotech)
- [ ] Trade (Int) - e.g., Trade (Armourer)

**For each**: Verify characteristic shown and value calculated correctly

---

## Test 5: Existing Character (Migration)

### Steps
1. Load an existing character that has specialist skills
2. Open character sheet
3. Check Skills tab
4. Look at specialist skills

### Verify
- [ ] Existing specialist skills still work
- [ ] No console errors during load
- [ ] Values calculate correctly
- [ ] Characteristic shown for each entry

**Note**: If existing character had broken specialist skills (value 0), they should now be fixed automatically via migration.

---

## Test 6: Training Level Upgrades

### Steps
1. Create character with Common Lore (Imperium) - trained
2. Note value (should be Int value)
3. Upgrade to +10 (via XP spend or manual)
4. Check new value

### Verify
- [ ] Trained: Value = Intelligence
- [ ] +10: Value = Intelligence + 10
- [ ] +20: Value = Intelligence + 20

### Example
**Int 35:**
- Trained: 35
- +10: 45
- +20: 55

---

## Test 7: Grant via Talent/Trait

### Steps
1. Find talent/trait that grants specialist skill
2. Add to character
3. Check Skills tab

### Verify
- [ ] Skill appears with correct metadata
- [ ] Characteristic present
- [ ] Value calculates correctly

---

## Test 8: Console Error Check

Throughout all tests:

### Verify
- [ ] No "undefined characteristic" errors
- [ ] No "cannot read property 'total' of undefined" errors
- [ ] No skill calculation errors
- [ ] SkillKeyHelper logs (if any) are informational, not errors

---

## Test 9: Edge Cases

### A. Untrained Specialist Skill
**Steps**: View specialist skill with trained=false

**Verify**:
- [ ] Value = Intelligence / 2 (Advanced skills use half characteristic when untrained)

### B. Skill with Modifier
**Steps**: Add modifier (from trait/condition) to specialist skill

**Verify**:
- [ ] Value = characteristic + training + modifier
- [ ] Modifier applied correctly

### C. Unnatural Characteristic
**Steps**: Character with Unnatural Intelligence (×2)

**Verify**:
- [ ] Intelligence bonus multiplied
- [ ] Specialist skill reflects multiplied bonus

---

## Browser Console Commands

For debugging during testing:

```javascript
// Check actor's skills
game.actors.get("ACTOR_ID").system.skills.commonLore

// Check specific entry
game.actors.get("ACTOR_ID").system.skills.commonLore.entries[0]

// Should show:
// {
//   name: "Imperium",
//   characteristic: "Int",      // ✅ Present
//   trained: true,
//   current: 35                 // ✅ Calculated
// }

// Test SkillKeyHelper (if exported to game.rt)
game.rt.SkillKeyHelper.getSkillMetadata("commonLore")
```

---

## Success Criteria

### ✅ PASS if:
1. All specialist skills show characteristic field
2. All specialist skills calculate correct values
3. Changing stats updates specialist skills
4. No console errors related to skills
5. Existing characters migrate correctly
6. New origin paths work correctly

### ❌ FAIL if:
1. Any specialist skill shows value 0 (when should have value)
2. Console shows "undefined characteristic" errors
3. Changing Intelligence doesn't update specialist skills
4. Migration causes errors or data loss

---

## Rollback Plan

If tests fail, rollback these files from git:

```bash
git checkout HEAD src/module/data/actor/templates/creature.mjs
git checkout HEAD src/module/utils/grants-processor.mjs
rm src/module/helpers/skill-key-helper.mjs
```

Then investigate issues before re-applying fix.

---

## Test Results Template

```
Test Date: _______________
Foundry Version: _______________
System Version: _______________
Tester: _______________

Test 1 (New Character): [ ] PASS [ ] FAIL
  Notes: _______________________________

Test 2 (Stat Changes): [ ] PASS [ ] FAIL
  Notes: _______________________________

Test 3 (Multiple Specs): [ ] PASS [ ] FAIL
  Notes: _______________________________

Test 4 (All 12 Skills): [ ] PASS [ ] FAIL
  Notes: _______________________________

Test 5 (Migration): [ ] PASS [ ] FAIL
  Notes: _______________________________

Test 6 (Training): [ ] PASS [ ] FAIL
  Notes: _______________________________

Test 7 (Grant via Item): [ ] PASS [ ] FAIL
  Notes: _______________________________

Test 8 (Console): [ ] PASS [ ] FAIL
  Notes: _______________________________

Test 9 (Edge Cases): [ ] PASS [ ] FAIL
  Notes: _______________________________

Overall Result: [ ] APPROVED [ ] NEEDS WORK
```

---

## Documentation References

- **Complete Fix Details**: SPECIALIST_SKILLS_FIX_COMPLETE.md
- **SkillKeyHelper Guide**: SKILL_KEY_HELPER_GUIDE.md
- **Implementation Summary**: IMPLEMENTATION_SUMMARY.md
- **System Documentation**: AGENTS.md (Appendix E)

---

## Support

If issues found during testing:
1. Note exact error messages from console
2. Note steps to reproduce
3. Check character data: `game.actors.get("ID").system.skills`
4. Refer to SPECIALIST_SKILLS_FIX_COMPLETE.md for troubleshooting
