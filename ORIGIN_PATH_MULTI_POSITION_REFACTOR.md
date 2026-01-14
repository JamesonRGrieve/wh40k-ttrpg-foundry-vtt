# Origin Path Multi-Position Refactor - Complete

**Date**: January 13, 2026  
**Status**: ✅ Complete - Ready for Testing

---

## Problem Statement

The Origin Path Builder had incorrect navigation data for 13 origins that can be reached from multiple parent positions in the flowchart. The previous system only tracked forward connections (`connectsTo`), not which positions could connect backwards.

---

## Solution: Simple ±1 Multi-Position System

Instead of complex bidirectional tracking, we implemented a clean solution:

### Core Rule
**Each position N connects to positions [N-1, N, N+1] in both directions.**

### Multi-Position Origins
Origins with multiple parents simply list all positions they occupy:
```javascript
{
  position: 1,          // Primary position
  positions: [5],       // Also appears at position 5
  step: "birthright"
}
```

---

## Changes Made

### 1. Data Model (`src/module/data/item/origin-path.mjs`)

**Added**:
- `positions` field: ArrayField for additional positions
- `allPositions` getter: Returns `[position, ...positions]` as unified array

**Simplified**:
- Removed complex `acceptsFrom` logic
- Navigation now auto-calculated from positions using ±1 rule

### 2. Chart Layout Utility (`src/module/utils/origin-chart-layout.mjs`)

**Simplified**:
- `_calculateConnections()`: Pure ±1 rule with 0-8 clamping
- `_isValidNext()`: Check if ANY origin position can connect
- `_computeStepLayout()`: Create card for EACH position
- `getValidNextOptions()`: Multi-position aware validation

**Added**:
- `isMultiPosition` flag to card data
- `allPositions` array to card metadata

### 3. Origin Path Data (13 JSON Files Updated)

| Origin | Step | Primary | Additional | Description |
|--------|------|---------|------------|-------------|
| **Fringe Survivor** | Birthright | 1 | +5 | Nomads, tech-heretics, pit-fighters |
| **Unnatural Origin** | Birthright | 2 | +3 | Contaminated, false-men, warp-tainted |
| **In Service to the Throne** | Birthright | 4 | +6 | Tithed, born to lead, faceless billions |
| **Hunter** | Lure of the Void | 1 | +4 | Bounty hunters, trophy collectors |
| **Crusade** | Lure of the Void | 2 | +3 | Holy warriors, pilgrims |
| **New Horizons** | Lure of the Void | 5 | +6 | Explorers, pioneers |
| **Darkness** | Trials/Travails | 1 | +6 | Haunted by darkness |
| **The Product of Upbringing** | Trials/Travails | 2 | +5 | Shaped by environment |
| **Lost Worlds** | Trials/Travails | 3 | +5 | Discovered lost civilizations |
| **Devotion** | Motivation | 1 | +4 | Faith-driven |
| **Exhilaration** | Motivation | 2 | +6 | Thrill-seekers |
| **Knowledge** | Motivation | 3 | +5 | Seekers of forbidden lore |
| **Fear** | Motivation | 0 | +[1,2,3,4,5,6] | Can follow ANY Trials path |

---

## Navigation Logic

### Forward Navigation (Home World → Career)
```
Previous at position 3 connects to [2, 3, 4]
↓
Current origin at positions [2, 5] is selectable because 2 is in [2, 3, 4]
```

### Backward Navigation (Career → Home World)
```
Next at position 4 needs connection from current
↓
Current origin at positions [1, 5] can connect because 5→[4, 5, 6] includes 4
```

### Edge Cases
- Position 0: connects to [0, 1]
- Position 8: connects to [7, 8]
- Fear (pos 0 + [1-6]): Accepts from ANY Trials position

---

## Code Architecture

### Data Model Layer
```javascript
// In origin-path.mjs
get allPositions() {
  const positions = [this.position];
  if (this.positions && this.positions.length > 0) {
    positions.push(...this.positions);
  }
  return [...new Set(positions)].sort((a, b) => a - b);
}
```

### Layout Calculation
```javascript
// In origin-chart-layout.mjs
static _calculateConnections(position) {
  const connections = [];
  if (position > 0) connections.push(position - 1);
  connections.push(position);
  if (position < 8) connections.push(position + 1);
  return connections;
}
```

### Validation
```javascript
static _isValidNext(origin, adjacentSelection, direction) {
  const originPositions = origin.system?.allPositions || [origin.system?.position || 0];
  const adjacentPos = adjacentSelection.system?.position || 0;
  
  if (direction === DIRECTION.FORWARD) {
    const adjacentConnections = this._calculateConnections(adjacentPos);
    return originPositions.some(pos => adjacentConnections.includes(pos));
  } else {
    return originPositions.some(pos => {
      const connections = this._calculateConnections(pos);
      return connections.includes(adjacentPos);
    });
  }
}
```

---

## UI Behavior

### Multi-Position Display
- Origins with multiple positions appear ONCE at their primary position
- The card includes `isMultiPosition: true` flag for visual indicators
- The card includes `allPositions` array showing all reachable positions
- Templates can display badges like "2 Paths" or tooltips showing alternate routes
- No duplicate cards - each origin appears exactly once per step

### Guided Mode
- Checks if previous selection can connect to ANY of origin's positions
- Grays out invalid options
- Respects `requirements.previousSteps` and `excludedSteps`

### Free Mode
- All origins selectable regardless of position
- Useful for custom/houserule paths

---

## Testing Checklist

### Navigation Testing
- [ ] Select Home World at position 0, verify Birthright options at 0, 1
- [ ] Select Home World at position 4, verify Birthright options at 3, 4, 5
- [ ] Select Home World at position 1, verify Fringe Survivor (1+5) is selectable
- [ ] Select Home World at position 5, verify Fringe Survivor (1+5) is selectable
- [ ] Verify Home World at position 2 does NOT connect to Fringe Survivor

### Multi-Position Origins
- [ ] Fringe Survivor appears at both positions 1 and 5
- [ ] Unnatural Origin appears at both positions 2 and 3
- [ ] In Service to Throne appears at both positions 4 and 6
- [ ] Fear appears at positions 0, 1, 2, 3, 4, 5, 6 (7 cards!)

### Edge Cases
- [ ] Position 0 (Fear) connects correctly
- [ ] Position 8 (if any) connects correctly
- [ ] Changing selection triggers cascade reset warnings
- [ ] Guided mode properly grays out invalid options
- [ ] Free mode allows any selection

### Grants Processing
- [ ] Multi-position origins apply grants correctly
- [ ] No duplicate items created
- [ ] Choices work correctly
- [ ] Roll formulas evaluate properly

---

## Documentation Updated

### AGENTS.md
- ✅ Added `positions` field to Data Model Schema section
- ✅ Added "Multi-Position Origins" subsection with full table
- ✅ Updated Navigation System section with ±1 rule explanation
- ✅ Documented 13 affected origins with their positions

### This Document
- ✅ Complete refactor summary
- ✅ Architecture explanation
- ✅ Testing checklist
- ✅ Code examples

---

## Files Modified

### Core System
1. `src/module/data/item/origin-path.mjs` - Added positions field and allPositions getter
2. `src/module/utils/origin-chart-layout.mjs` - Simplified navigation logic
3. `AGENTS.md` - Updated documentation

### Origin Path Data (13 files)
1. `src/packs/rt-items-origin-path/_source/fringe-survivor_LeGYSdFJFK9PVSBL.json`
2. `src/packs/rt-items-origin-path/_source/unnatural-origin_XaJWGdKgLzRqNqVz.json`
3. `src/packs/rt-items-origin-path/_source/in-service-to-the-throne_JxQxQaWboYI1sb16.json`
4. `src/packs/rt-items-origin-path/_source/hunter_dMpRSRKSGorFLqGC.json`
5. `src/packs/rt-items-origin-path/_source/crusade_8eZLFtwOGCx9IOC5.json`
6. `src/packs/rt-items-origin-path/_source/new-horizons_AltBtMSAeWOjKMIC.json`
7. `src/packs/rt-items-origin-path/_source/darkness_sRvYGgUsCiZPnbho.json`
8. `src/packs/rt-items-origin-path/_source/the-product-of-upbringing_lygxZbY7Vy3yBTo7.json`
9. `src/packs/rt-items-origin-path/_source/lost-worlds_ZRAqpUCN29Gzv0vY.json`
10. `src/packs/rt-items-origin-path/_source/devotion_FrjpkfY761rgTn4w.json`
11. `src/packs/rt-items-origin-path/_source/exhilaration_lcuT3rio1pb0nPHb.json`
12. `src/packs/rt-items-origin-path/_source/knowledge_HOv4DlMTBBdgQ5jG.json`
13. `src/packs/rt-items-origin-path/_source/fear_zyEUfSFLQb2XFJko.json`

---

## Why This Solution Works

### Simplicity
- No complex bidirectional logic
- ±1 rule is intuitive and easy to validate
- Single source of truth: the `positions` array

### Flexibility
- Easily add more multi-position origins
- Works with any number of positions
- Edge cases (0, 8) handled naturally

### Performance
- No expensive lookups or calculations
- Simple array operations
- Scales well with origin count

### Maintainability
- Clean, readable code
- Self-documenting (positions array is explicit)
- Easy to debug and test

---

## Next Steps

1. **Build**: Run `npm run build` to compile packs with new data
2. **Test**: Follow testing checklist above
3. **Verify**: Check all 13 multi-position origins display correctly
4. **Visual**: Consider adding UI indicator for multi-position origins

---

**Implementation Complete** ✅  
Ready for user testing and validation.
