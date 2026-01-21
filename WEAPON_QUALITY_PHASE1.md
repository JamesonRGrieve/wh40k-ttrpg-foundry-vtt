# Weapon Quality Effects - Phase 1 Implementation

## Overview

This document describes the Phase 1 implementation of mechanical effects for weapon qualities in the Rogue Trader VTT system.

## Implemented Qualities

### Category B: Attack/Parry Modifiers

| Quality        | Effect                          | Implementation Status |
| -------------- | ------------------------------- | --------------------- |
| **Accurate**   | +10 BS when using Aim action    | ✅ Implemented        |
| **Balanced**   | +10 WS for parry                | ✅ Implemented        |
| **Defensive**  | +15 WS for parry, -10 to attack | ✅ Implemented        |
| **Fast**       | Enemies suffer -20 to parry     | ✅ Implemented        |
| **Unbalanced** | -10 to parry attempts           | ✅ Implemented        |
| **Unwieldy**   | Cannot parry with this weapon   | ✅ Implemented        |

### Category C (Subset): Damage/Penetration Modifiers

| Quality     | Effect                            | Implementation Status                 |
| ----------- | --------------------------------- | ------------------------------------- |
| **Tearing** | Roll 2d10 for damage, drop lowest | ✅ Already implemented (pre-existing) |
| **Melta**   | Double penetration at short range | ✅ Implemented                        |

## Architecture

### Core Module

**File:** `src/module/rules/weapon-quality-effects.mjs`

Provides:

-   Quality detection functions
-   Attack modifier calculations
-   Parry modifier calculations
-   Penetration modifier calculations
-   Display helper functions

### Integration Points

#### 1. Attack Roll Modifiers

**File:** `src/module/rules/attack-specials.mjs`

-   **Function:** `calculateAttackSpecialAttackBonuses()`
-   **Integration:** Calls `applyQualityModifiersToRollData()` to apply Accurate bonus when Aim is used

#### 2. Penetration Modifiers

**File:** `src/module/rolls/damage-data.mjs`

-   **Class:** `Hit`
-   **Method:** `_calculatePenetration()`
-   **Integration:** Calls `calculateQualityPenetrationModifiers()` to apply Melta bonus at short range

#### 3. Parry System

**Status:** Functions ready, awaiting parry system integration

-   `getWeaponParryModifier(weapon)` - Returns total parry modifier
-   `canWeaponParry(weapon)` - Checks if weapon can parry
-   `getAttackerWeaponParryPenalty(weapon)` - Returns penalty for enemies parrying

## API Reference

### Quality Detection

```javascript
import { weaponHasQuality } from './weapon-quality-effects.mjs';

// Check if weapon has a quality
const hasAccurate = weaponHasQuality(weapon, 'accurate'); // true/false
```

### Attack Modifiers

```javascript
import { calculateQualityAttackModifiers, applyQualityModifiersToRollData } from './weapon-quality-effects.mjs';

// Get attack modifiers
const modifiers = calculateQualityAttackModifiers(rollData);
// Returns: { "Accurate": 10 } or {}

// Apply to roll data (called automatically in attack flow)
applyQualityModifiersToRollData(rollData);
```

### Parry Modifiers

```javascript
import { getWeaponParryModifier, canWeaponParry, getAttackerWeaponParryPenalty } from './weapon-quality-effects.mjs';

// Get parry modifier for weapon being used to parry
const modifier = getWeaponParryModifier(weapon);
// Returns: 10 (Balanced), 15 (Defensive), -10 (Unbalanced), -999 (Unwieldy)

// Check if weapon can parry
const canParry = canWeaponParry(weapon);
// Returns: true/false (false for Unwieldy)

// Get penalty for enemy trying to parry this weapon
const penalty = getAttackerWeaponParryPenalty(attackerWeapon);
// Returns: -20 (Fast), 0 (others)
```

### Penetration Modifiers

```javascript
import { calculateQualityPenetrationModifiers } from './weapon-quality-effects.mjs';

// Calculate penetration modifiers (called automatically in damage flow)
const penMods = calculateQualityPenetrationModifiers({
    weapon: weapon,
    rangeName: 'Short Range',
    basePenetration: 8,
});
// Returns: { "Melta": 8 } (doubles penetration at short range)
```

### Display Helpers

```javascript
import { getWeaponQualitySummary } from './weapon-quality-effects.mjs';

// Get quality effect summary
const summary = getWeaponQualitySummary(weapon, 'all');
// Returns: [
//   "Accurate: +10 BS when using Aim action",
//   "Fast: Enemies suffer -20 when attempting to parry this weapon"
// ]

// Filter by context
const attackSummary = getWeaponQualitySummary(weapon, 'attack');
const parrySummary = getWeaponQualitySummary(weapon, 'parry');
```

## Technical Details

### Quality Detection Logic

The system checks multiple sources for weapon qualities:

1. **effectiveSpecial Set** - Includes craftsmanship-derived qualities
2. **special Set** - Base weapon qualities
3. **Embedded attackSpecial Items** - Attached special quality items

This ensures compatibility with:

-   Weapons with qualities in `system.special`
-   Weapons with qualities in `system.effectiveSpecial`
-   Weapons with embedded `attackSpecial` items
-   Craftsmanship-derived qualities (Good, Best)

### Range Detection for Melta

Melta doubles penetration at:

-   **Point Blank** range (≤2m)
-   **Short Range** (≤ max range / 2)

Does NOT apply at:

-   Long Range (> max range / 2)
-   Extreme Range
-   Melee range (special case)

### Parry Modifier Stacking

Modifiers stack additively:

-   Balanced (+10) + Defensive (+15) = +25 total
-   Balanced (+10) + Unbalanced (-10) = 0 (cancel out)
-   Unwieldy overrides all (cannot parry, returns -999 flag)

## Testing

See `weapon-quality-effects.test-docs.mjs` for:

-   Test scenarios for each quality
-   Expected outcomes
-   Integration test cases
-   Console API test commands

## Future Enhancements (Phase 2+)

### Planned Features

-   Automatic parry roll integration
-   UI indicators for active quality effects
-   Chat message quality summaries
-   Weapon sheet tooltip integration
-   Quality effect animations
-   GM tools for quality management

### Additional Qualities (Future Phases)

-   **Category A (Complex):** Blast, Flame, Scatter, Spray, Storm
-   **Category C (Full):** Concussive, Corrosive, Crippling, Felling, Flexible, Force, etc.
-   **Category D (Situational):** Haywire, Graviton, Sanctified, Toxic, etc.

## Integration Checklist

-   [x] Core module created (`weapon-quality-effects.mjs`)
-   [x] Attack modifiers integrated (`attack-specials.mjs`)
-   [x] Penetration modifiers integrated (`damage-data.mjs`)
-   [x] Tearing already implemented (pre-existing)
-   [x] Test documentation created
-   [ ] Parry system integration (awaiting parry roll logic updates)
-   [ ] UI integration (tooltips, chat messages)
-   [ ] User documentation

## Files Changed

1. **NEW:** `src/module/rules/weapon-quality-effects.mjs` (370 lines)
    - Core quality effects module
2. **MODIFIED:** `src/module/rules/attack-specials.mjs`
    - Added import for `applyQualityModifiersToRollData`
    - Call quality effects in `calculateAttackSpecialAttackBonuses()`
3. **MODIFIED:** `src/module/rolls/damage-data.mjs`
    - Added import for `calculateQualityPenetrationModifiers`
    - Call quality effects in `Hit._calculatePenetration()`
4. **NEW:** `src/module/rules/weapon-quality-effects.test-docs.mjs` (350 lines)
    - Test scenarios and documentation

## Notes

-   Tearing quality was already implemented in the codebase (damage-data.mjs lines 228-237)
-   Defensive attack penalty (-10) was already implemented (attack-specials.mjs lines 73-75)
-   Accurate quality previously had basic support; now enhanced with proper integration
-   Parry modifier functions are ready but require parry system integration to be fully functional

## Support

For questions or issues:

1. Check test documentation for expected behavior
2. Review API reference for correct function usage
3. Verify quality names are lowercase and match constants
4. Ensure weapon has quality in special/effectiveSpecial set
