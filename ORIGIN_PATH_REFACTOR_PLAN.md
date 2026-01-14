# Origin Path System - Complete Refactor Plan

## Bug Analysis

**User Report**: After selecting Noble Born (pos 6) and Savant (pos 5), the next step (lureOfTheVoid) shows:
- **Actual**: Renegade(3), Duty Bound(4), Zealot(5)
- **Expected**: Duty Bound(4), Zealot(5), Chosen by Destiny(6)

**Root Cause**: The connectivity check is working against position 4 instead of position 5. The logic shows [3,4,5] which is position 4's connections [4-1, 4, 4+1].

## The Fix Strategy

### 1. Simplify Connectivity - Remove All Direction Logic
The ±1 connectivity rule is **bidirectional by nature**. If position 5 connects to [4,5,6], then:
- Position 4 connects to 5 ✓
- Position 5 connects to 5 ✓
- Position 6 connects to 5 ✓

Direction (forward vs backward navigation) only affects UI flow, NOT connectivity rules.

### 2. Core Principle
**"Only the LAST confirmed selection matters for determining valid next options."**

When at step N:
- Get the last confirmed selection (in navigation order)
- Calculate its connections: [pos-1, pos, pos+1]
- Show only origins at those positions (plus requirements check)

### 3. Implementation Changes

**origin-chart-layout.mjs**:
1. Remove `direction` parameter from `_canConnect`, `_isValidNext`, `_isSelectable`
2. Simplify `_computeStepLayout`:
   - Always look at the previous step in the step order array
   - In FORWARD: previous = stepIndex - 1
   - In BACKWARD: previous = stepIndex + 1 (because we're going backwards through the array)
   - Wait no... this is the issue!

**THE ACTUAL BUG**: When in BACKWARD mode and at stepIndex=0 (career in backward order), the code tries to look at stepIndex+1. But if we're navigating BACKWARD and currently at index 2 in our navigation, we should look at index 1 (the one we just came from).

Actually, the simplest fix: **Always get the last confirmed selection, regardless of direction!**

```javascript
// Get last confirmed selection in navigation order
let lastSelection = null;
for (let i = stepIndex - 1; i >= 0; i--) {
  const prevStepKey = this._getStepOrder()[i];
  if (currentSelections.has(prevStepKey)) {
    lastSelection = currentSelections.get(prevStepKey);
    break;
  }
}
```

This finds the ACTUAL last confirmed selection, not just the adjacent one.

### 4. Remove Deprecated Fields

**origin-path.mjs**:
- Remove `effectText` field
- Remove legacy `wounds` and `fateThreshold` fields (or mark deprecated)
- Clean up migration logic

### 5. Fix JSON Data
All 57 origin JSONs have stepIndex off by 1 (using 1-6 instead of 0-5). Fix them all.

## Implementation Order

1. **Fix origin-chart-layout.mjs** - Core connectivity bug
2. **Simplify builder direction handling**  
3. **Fix JSON stepIndex values**
4. **Clean up data model**
5. **Test thoroughly**
