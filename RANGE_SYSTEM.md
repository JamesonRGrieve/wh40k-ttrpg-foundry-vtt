# Weapon Range Brackets and Modifiers System

## Overview

Implements a comprehensive range bracket system for Rogue Trader weapon attacks with automatic modifiers, quality-based adjustments (Gyro-Stabilised, Melta), and integration with the combat tracker.

## Range Brackets

| Bracket            | Distance           | Modifier | Description               |
| ------------------ | ------------------ | -------- | ------------------------- |
| **Point Blank**    | ≤ 2m               | **+30**  | Extremely close range     |
| **Short Range**    | ≤ weapon range ÷ 2 | **+10**  | Half weapon range or less |
| **Standard Range** | ≤ weapon range × 2 | **±0**   | Normal engagement range   |
| **Long Range**     | ≤ weapon range × 3 | **-10**  | Extended range            |
| **Extreme Range**  | > weapon range × 3 | **-30**  | Maximum effective range   |

## Features Implemented

### 1. Range Calculator Utility (`utils/range-calculator.mjs`)

Core utility for calculating range brackets and modifiers:

-   **`calculateRangeBracket(distance, weaponRange)`** - Determines range bracket from distance
-   **`calculateRangeModifier(options)`** - Main entry point with quality support
-   **`applyQualityModifiers(rangeInfo, weaponQualities)`** - Handles weapon qualities
-   **`calculateTokenDistance(token1, token2)`** - 3D distance calculation with elevation
-   **`isAtMeltaRange(bracket)`** - Check if at Melta effective range
-   **`formatRangeDisplay(rangeInfo)`** - Format for UI display

### 2. Weapon Quality Support

#### Gyro-Stabilised

-   **Effect**: Never worse than Long Range penalty
-   **Implementation**: Caps negative modifiers at -10
-   Extreme Range (-30) becomes Long Range (-10)
-   Displayed in attack dialog with blue info hint

#### Melta

-   **Effect**: Double penetration at short range (Point Blank or Short)
-   **Implementation**:
    -   Adds `isMeltaRange` flag to rollData
    -   Doubles base penetration in damage calculation
    -   Displayed in attack dialog with fire-themed hint

### 3. Combat Tracker Integration

-   **Automatic Distance Calculation**: Uses token positions when available
-   **3D Distance Support**: Accounts for elevation differences
-   **Manual Override**: Distance field in attack dialog for out-of-combat rolls
-   **Real-time Updates**: Range bracket updates as distance changes

### 4. Updated Files

#### New Files

-   `src/module/utils/range-calculator.mjs` - Core range calculation system

#### Modified Files

-   `src/module/rules/range.mjs` - Integrated new range calculator
-   `src/module/rolls/damage-data.mjs` - Updated Melta penetration logic
-   `src/module/actions/targeted-action-manager.mjs` - Use new distance calculator
-   `src/templates/prompt/weapon-roll-prompt.hbs` - Added range hints
-   `src/scss/prompts/_dialogs.scss` - Added hint styles

## Usage Examples

### In Code

```javascript
import { calculateRangeModifier } from './utils/range-calculator.mjs';

// Calculate range modifier
const rangeInfo = calculateRangeModifier({
    distance: 25,
    weaponRange: 30,
    weaponQualities: new Set(['gyro-stabilised']),
    isRangedWeapon: true,
});

// Result:
// {
//     bracket: 'standard',
//     label: 'Standard Range',
//     modifier: 0,
//     description: 'Up to double weapon range',
//     modifiedBy: null,
//     isMeltaRange: false
// }
```

### In Combat

1. **With Tokens**:

    - Select attacker token
    - Target enemy token
    - Click Attack button
    - Distance calculated automatically
    - Range bracket shown in dialog

2. **Without Tokens**:
    - Open weapon attack dialog
    - Enter distance manually (meters)
    - Range bracket calculated on input
    - Modifier applied to attack roll

## Range Bracket Logic

```
distance = 25m, weapon range = 30m

Point Blank: distance <= 2m                  → NO
Short Range: distance <= 30m * 0.5 = 15m    → NO
Standard Range: distance <= 30m * 2 = 60m   → YES ✓
Result: Standard Range (±0)
```

## Gyro-Stabilised Example

```
distance = 120m, weapon range = 30m

Without Gyro-Stabilised:
- Range bracket: Extreme Range
- Base modifier: -30

With Gyro-Stabilised:
- Range bracket: Extreme Range
- Base modifier: -30
- Capped to: -10 (Long Range max)
- Displayed: "Extreme Range" with "Modified by Gyro-Stabilised" hint
```

## Melta Example

```
Melta Weapon (Pen 12) at 15m, weapon range 30m

Short Range (distance <= 15m):
- Base penetration: 12
- Melta bonus: +12 (double)
- Total penetration: 24

Standard Range (distance > 15m):
- Base penetration: 12
- Melta bonus: 0
- Total penetration: 12
```

## UI Indicators

### Range Display

-   **Green (+30, +10)**: Positive modifiers
-   **Gray (±0)**: Neutral
-   **Red (-10, -30)**: Negative modifiers

### Range Hints

-   **Blue Info**: "Range modifier affected by gyro-stabilised"
-   **Orange Fire**: "Melta: Double penetration at this range" (animated pulse)

## Technical Details

### Range Calculation Priority

1. Melee weapons → No range brackets
2. Self-targeting → No modifier
3. Point Blank (≤ 2m) → Always +30
4. Calculate relative to weapon range
5. Apply quality modifiers (Gyro-Stabilised)
6. Check Melta eligibility

### Distance Calculation

-   Uses Foundry's `canvas.grid.measurePath()`
-   Accounts for grid type (square, hex)
-   3D distance: `sqrt(horizontal² + elevation²)`
-   Rounded down to nearest meter

### Data Flow

```
Token Selection
    ↓
Calculate Distance (3D)
    ↓
Get Weapon Range (base + modifiers)
    ↓
Calculate Range Bracket
    ↓
Apply Quality Modifiers (Gyro-Stabilised)
    ↓
Check Melta Range
    ↓
Store in RollData
    ↓
Display in Dialog
    ↓
Apply to Attack Roll
    ↓
Apply to Damage/Penetration
```

## Integration Points

### RollData Properties

-   `rollData.maxRange` - Weapon's effective range
-   `rollData.distance` - Distance to target
-   `rollData.rangeName` - Range bracket label
-   `rollData.rangeBonus` - Modifier value
-   `rollData.rangeBracket` - Bracket identifier
-   `rollData.rangeModifiedBy` - Quality that modified it
-   `rollData.isMeltaRange` - Melta effective range flag

### Template Context

All RollData properties available in Handlebars:

```handlebars
{{rangeName}}
- "Short Range"
{{rangeBonus}}
- 10
{{#if isMeltaRange}}...{{/if}}
```

## Future Enhancements

Potential improvements for future versions:

1. **Sniper Talent**: Reduce range penalties
2. **Ballistic Mechadendrite**: Auto-stabilization
3. **Weather Effects**: Range penalty modifications
4. **Gravity Variations**: Distance adjustments
5. **Weapon Modifications**: Range extenders
6. **Ship Combat**: Scale to void combat ranges
7. **Area Effects**: Range-based coverage
8. **Sound Cues**: Audio feedback for range changes

## Testing

### Manual Test Cases

1. **Point Blank Test**:

    - Set distance: 2m
    - Expected: Point Blank (+30)

2. **Gyro-Stabilised Test**:

    - Distance: 100m, Weapon Range: 30m
    - Without quality: Extreme (-30)
    - With quality: Extreme (-10, capped)

3. **Melta Test**:

    - Distance: 15m, Weapon Range: 30m, Pen: 12
    - Short Range: Pen becomes 24
    - Standard Range: Pen stays 12

4. **Elevation Test**:

    - Horizontal: 30m, Vertical: 40m
    - Distance: sqrt(30² + 40²) = 50m

5. **Dialog Update Test**:
    - Change distance field
    - Range bracket updates immediately
    - Modifiers recalculated

## Compatibility

-   **Foundry VTT**: V13.351+
-   **System Version**: 1.8.1+
-   **Dependencies**: Core system only
-   **Conflicts**: None known

## Credits

Implementation follows Dark Heresy 2e/Rogue Trader RPG rules for range brackets and weapon qualities.
