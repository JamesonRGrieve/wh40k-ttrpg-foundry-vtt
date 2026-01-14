# Origin Path Duplicate Card Fix

**Date**: January 14, 2026  
**Status**: ✅ Complete

---

## Issue

Multi-position origins (those accessible from multiple parent positions) were displaying as duplicate cards. For example, Fringe Survivor would appear twice - once at position 1 and once at position 5.

---

## Root Cause

The original implementation created a separate card for each position in the `allPositions` array. This was intended to show the origin at multiple flowchart positions, but resulted in duplicate/confusing display.

---

## Solution

Changed the layout logic to display each origin **exactly once** at its primary position, while retaining all positions for validation logic.

### Code Changes

**File**: `src/module/utils/origin-chart-layout.mjs`

**Before**:
```javascript
for (const origin of origins) {
  const positions = origin.system?.allPositions || [origin.system?.position || 0];
  
  // Create a card for each position
  for (const position of positions) {
    cards.push({
      id: origin.id,
      position: position,
      // ... card data
    });
  }
}
```

**After**:
```javascript
const seenOrigins = new Set(); // Track which origins we've already added

for (const origin of origins) {
  // Skip if we've already added this origin (prevent duplicates)
  if (seenOrigins.has(origin.id)) continue;
  seenOrigins.add(origin.id);

  const positions = origin.system?.allPositions || [origin.system?.position || 0];
  const position = origin.system?.position || 0; // Use primary position
  
  cards.push({
    id: origin.id,
    position: position,           // Display at primary position
    allPositions: positions,      // Keep all positions for validation
    isMultiPosition: positions.length > 1,
    // ... card data
  });
}
```

---

## Behavior Changes

### Display

| Origin | Primary Pos | Additional Pos | OLD Behavior | NEW Behavior |
|--------|-------------|----------------|--------------|--------------|
| Fringe Survivor | 1 | 5 | 2 cards (pos 1 and 5) | 1 card (pos 1) |
| Unnatural Origin | 2 | 3 | 2 cards (pos 2 and 3) | 1 card (pos 2) |
| Fear | 0 | 1,2,3,4,5,6 | 7 cards | 1 card (pos 0) |

### Validation (No Change)

Validation logic still checks **ALL positions** in `allPositions` array:
- Home World at position 5 connects to [4, 5, 6]
- Fringe Survivor has `allPositions: [1, 5]`
- Validation: Does [4, 5, 6] intersect [1, 5]? YES (position 5)
- Result: Fringe Survivor is enabled ✓

---

## Card Data Structure

Each card now includes:

```javascript
{
  id: "LeGYSdFJFK9PVSBL",
  position: 1,                    // Where it displays
  allPositions: [1, 5],           // All reachable positions
  isMultiPosition: true,          // UI can show indicator
  isSelectable: true,
  isValidNext: true,
  // ... other fields
}
```

---

## Recommended UI Enhancements

Add visual indicators to show multi-position origins:

### Option 1: Badge
```handlebars
{{#if card.isMultiPosition}}
  <span class="rt-badge rt-badge-multipath">
    {{card.allPositions.length}} Paths
  </span>
{{/if}}
```

### Option 2: Tooltip
```handlebars
<div class="rt-origin-card" 
     data-tooltip="{{#if card.isMultiPosition}}Also reachable from positions: {{join card.allPositions}}{{/if}}">
```

### Option 3: Icon
```handlebars
{{#if card.isMultiPosition}}
  <i class="fa-solid fa-code-branch rt-multipath-icon"></i>
{{/if}}
```

### Option 4: CSS Highlight
```scss
.rt-origin-card.multi-position {
  border: 2px solid $rt-color-gold;
  box-shadow: 0 0 8px rgba($rt-color-gold, 0.3);
  
  &::after {
    content: "Multiple Paths";
    position: absolute;
    top: 4px;
    right: 4px;
    font-size: 10px;
    background: $rt-color-gold;
    color: black;
    padding: 2px 6px;
    border-radius: 3px;
  }
}
```

---

## Testing Verification

### No Duplicates
- [ ] Each origin appears exactly once per step
- [ ] No duplicate cards at any position
- [ ] seenOrigins Set prevents duplicates

### Multi-Position Validation
- [ ] Home World pos 1 → Fringe Survivor (at pos 1) is enabled
- [ ] Home World pos 5 → Fringe Survivor (at pos 1) is enabled
- [ ] Home World pos 3 → Fringe Survivor (at pos 1) is disabled

### Fear Special Case
- [ ] Fear appears once at position 0 (not 7 times)
- [ ] Fear is enabled from ANY Trials position (1-6)
- [ ] Fear connects forward to Career positions 0-1

---

## Documentation Updated

- ✅ `AGENTS.md` - Updated multi-position section
- ✅ `ORIGIN_PATH_MULTI_POSITION_REFACTOR.md` - Updated UI behavior
- ✅ `ORIGIN_PATH_MULTI_POSITION_VISUAL.md` - Updated diagrams
- ✅ `ORIGIN_PATH_TESTING_CHECKLIST.md` - Updated test cases
- ✅ `ORIGIN_PATH_DUPLICATE_FIX.md` - This document

---

## Migration Notes

### For Developers
- No data migration needed
- No API changes
- Validation logic unchanged
- Templates may need updates to show multi-path indicators

### For Users
- Origins now appear once (cleaner UI)
- Functionality unchanged (same paths still valid)
- Optional: Add UI indicators for multi-path origins

---

## Files Modified

1. `src/module/utils/origin-chart-layout.mjs` - Core fix
2. `AGENTS.md` - Documentation
3. `ORIGIN_PATH_MULTI_POSITION_REFACTOR.md` - Documentation
4. `ORIGIN_PATH_MULTI_POSITION_VISUAL.md` - Documentation
5. `ORIGIN_PATH_TESTING_CHECKLIST.md` - Documentation
6. `ORIGIN_PATH_DUPLICATE_FIX.md` - This document

---

**Fix Complete - Ready for Testing**
