# Origin Path Formula System - Quick Reference

**Status**: ✅ COMPLETE - Ready for Testing  
**Date**: January 13, 2026

---

## What Was Changed

### ✅ Phase 1: Formula Evaluation System (COMPLETE)
**NEW FILE**: `/src/module/utils/formula-evaluator.mjs`
- Evaluates wounds formulas: `"2xTB+1d5+2"` → numeric value
- Evaluates fate formulas: `"(1-5|=2),(6-10|=3)"` → numeric value based on 1d10 roll

**MODIFIED**: `/src/module/applications/character-creation/origin-path-builder.mjs`
- `_calculateBonuses()` - Shows formula-evaluated wounds/fate in preview
- `#commitPath()` - Evaluates formulas and applies to actor's max wounds/fate threshold

### ✅ Phase 2: Legacy Code Removal (COMPLETE)
**MODIFIED**: `/src/module/data/item/origin-path.mjs`
- Added `migrateData()` - Warns about legacy `grants.wounds` and `grants.fateThreshold`
- Added `cleanData()` - Ensures numeric field types
- Legacy fields kept for backward compatibility but deprecated with warnings

### ✅ Phase 3: Choice System Validation (DOCUMENTED)
No code changes - existing system already validates choices correctly.
- Documented Press-Ganged issue (requires manual skill selection)
- Verified nested choice grants work correctly

### ✅ Phase 4: Grant Processing Improvements (COMPLETE)
**MODIFIED**: `/src/module/utils/talent-grants.mjs`
- `processTalentGrants()` - Now recursive with max depth 3
- `grantTalent()` - Enhanced error logging with full context
- `grantTrait()` - Enhanced error logging with full context

---

## How to Test

### 1. Test Formula Evaluation
```
1. Create new character
2. Open Origin Path Builder
3. Drag "Death World" to Home World slot
4. Check preview panel shows wounds formula evaluation
5. Complete all 6 origin steps
6. Click "Apply to Character"
7. Verify character has correct wounds (should be 2×TB + 1d5+2)
8. Verify character has correct fate threshold (2 or 3 based on d10 roll)
```

### 2. Check Console Logs
```
Open browser console (F12) and look for:
- Formula evaluation logs: "Origin 'Death World' wounds formula..."
- Legacy field warnings: "uses legacy grants.wounds field..."
- Migration warnings: "effectText is deprecated..."
```

### 3. Test Error Handling
```
1. Create talent with grants but invalid UUID
2. Add talent to actor
3. Check console for detailed error: "Failed to resolve talent UUID..."
4. Verify notification appears with talent name
```

---

## Formula Examples

### Wounds Formulas
```javascript
"2xTB+1d5+2"  // Death World: 2×Toughness Bonus + 1d5+2
"TB+1d5"      // Simple: TB + 1d5
"3xWB+1d10"   // Willpower-based: 3×WB + 1d10
```

### Fate Formulas
```javascript
"(1-5|=2),(6-10|=3)"     // Roll 1d10: 1-5=2 fate, 6-10=3 fate
"(1-8|=3),(9-10|=4)"     // Roll 1d10: 1-8=3 fate, 9-10=4 fate
```

### Characteristic Abbreviations
```
TB   = Toughness Bonus
WB   = Willpower Bonus
SB   = Strength Bonus
AB   = Agility Bonus
IB   = Intelligence Bonus
PB   = Perception Bonus
FB   = Fellowship Bonus
WSB  = Weapon Skill Bonus
BSB  = Ballistic Skill Bonus
InfB = Influence Bonus
```

---

## Files Modified

### New Files
1. `src/module/utils/formula-evaluator.mjs` - Formula evaluation utility

### Modified Files
1. `src/module/applications/character-creation/origin-path-builder.mjs` - Formula integration
2. `src/module/data/item/origin-path.mjs` - Migration support
3. `src/module/utils/talent-grants.mjs` - Recursive grants + error logging

---

## API Usage

```javascript
import { evaluateWoundsFormula, evaluateFateFormula } from "../../utils/formula-evaluator.mjs";

// Evaluate during origin path commit
const woundsBonus = evaluateWoundsFormula("2xTB+1d5+2", actor);
const fateBonus = evaluateFateFormula("(1-5|=2),(6-10|=3)");

// Apply to actor
await actor.update({
    'system.wounds.max': actor.system.wounds.max + woundsBonus,
    'system.fate.threshold': actor.system.fate.threshold + fateBonus
});
```

---

## Common Issues

### "Formula not evaluating"
- Check that origin has `woundsFormula` field (not just `wounds`)
- Check console for evaluation logs
- Verify actor has prepared characteristics

### "Legacy field warning"
- This is expected - formulas take precedence over legacy fields
- Warning helps identify origins that need formula conversion
- Legacy fields still work (fallback)

### "Missing talent UUID"
- Enhanced error logging shows exactly which talent failed
- Check console for full context (talent name, source, UUID)
- Verify talent exists in compendium

---

## Next Steps (Optional)

### Content Cleanup (Not Implemented)
1. Remove `grants.specialAbilities` from 8 career talents
2. Remove `effectText` from 62 origin paths
3. Convert remaining static wounds/fate to formulas

### Advanced Features (Not Implemented)
1. Choice validation UI in builder
2. "Make Choices" button for incomplete origins
3. "Pick any skill" choice type for Press-Ganged

---

## Documentation

See `ORIGIN_PATH_FORMULAS_REFACTOR.md` for complete technical documentation.
