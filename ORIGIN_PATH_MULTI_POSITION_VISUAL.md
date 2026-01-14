# Origin Path Multi-Position Visual Reference

This document provides visual examples of how the multi-position navigation system works.

---

## Connectivity Rule

```
Position N connects to [N-1, N, N+1]
(clamped to 0-8 range)
```

**Example: Position 3**
```
Position 3 connects to:
  ↙ 2
  ↓ 3
  ↘ 4
```

**Edge Cases:**
```
Position 0 connects to: [0, 1]
Position 8 connects to: [7, 8]
```

---

## Single-Position Origin (Normal)

```
Step 1: Home World
┌─────┐
│  3  │  Death World
└─────┘
  ↓ ↓ ↓
 2  3  4

Step 2: Birthright
┌─────┐ ┌─────┐ ┌─────┐
│  2  │ │  3  │ │  4  │
└─────┘ └─────┘ └─────┘
```

Death World at position 3 can connect to Birthright origins at positions 2, 3, or 4.

---

## Multi-Position Origin (Two Parents)

```
Step 1: Home World
┌─────┐           ┌─────┐
│  1  │           │  5  │  (Two different Home Worlds)
└─────┘           └─────┘
  ↓ ↓ ↓             ↓ ↓
 0  1  2           4  5  6

Step 2: Birthright
        ┌─────────┐
        │    1    │  Fringe Survivor (displays at primary position 1)
        │  [1,5]  │  Badge or indicator shows "2 Paths" or "Also from pos 5"
        └─────────┘
```

**Fringe Survivor** has `position: 1` and `positions: [5]`, so it's reachable from:
- Home World at position 0, 1, or 2 (connects to position 1)
- Home World at position 4, 5, or 6 (connects to position 5)

The card displays ONCE at position 1, but the UI can show indicators that it's accessible from multiple paths.

---

## Complex Example: Fear (Multiple Parents)

Fear is special - it accepts from ANY Trials and Travails position.

```
Step 4: Trials and Travails
┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐
│  1  │ │  2  │ │  3  │ │  4  │ │  5  │ │  6  │
└─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘
   ↓       ↓       ↓       ↓       ↓       ↓
   └───────┴───────┴───────┴───────┴───────┘
                    ↓
Step 5: Motivation
┌─────────────────┐
│        0        │  Fear (displays once at position 0)
│  [0,1,2,3,4,5,6]│  Badge: "Any Path" or "7 Paths"
└─────────────────┘
```

**Fear** has `position: 0` and `positions: [1, 2, 3, 4, 5, 6]`.

In the UI, Fear appears ONCE at position 0, with a special indicator showing it's reachable from any Trials path.

---

## Full Birthright Example

This shows how the three multi-position Birthright origins display:

```
Step 1: Home World (Positions 0-8)
┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐
│  0  │ │  1  │ │  2  │ │  3  │ │  4  │ │  5  │ │  6  │ │  7  │ │  8  │
└─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘
         ↓ ↓ ↓   ↓ ↓ ↓   ↓ ↓ ↓   ↓ ↓ ↓   ↓ ↓ ↓   ↓ ↓ ↓   ↓ ↓ ↓
        0  1  2  1  2  3  2  3  4  3  4  5  4  5  6  5  6  7  6  7  8

Step 2: Birthright
┌─────┐ ┌────────┐ ┌────────┐ ┌─────┐ ┌────────┐ ┌─────┐ ┌────────┐
│  0  │ │   1    │ │   2    │ │  3  │ │   4    │ │  5  │ │   6    │
└─────┘ │ [1,5]  │ │ [2,3]  │ └─────┘ │ [4,6]  │ └─────┘ │ [5,7]  │
        │ Fringe │ │ Unnat. │         │Service │         │        │
        │ Surviv.│ │  Orig. │         │ Throne │         │        │
        └────────┘ └────────┘         └────────┘         └────────┘
```

**Key Points:**
- **Fringe Survivor** displays once at position 1 (but accessible from positions around 1 OR 5)
- **Unnatural Origin** displays once at position 2 (but accessible from positions around 2 OR 3)
- **In Service to Throne** displays once at position 4 (but accessible from positions around 4 OR 6)
- Cards show `isMultiPosition: true` for UI indicators
- No duplicate cards - each origin appears exactly once

---

## Validation Examples

### Valid Connection ✅
```
Home World: Position 1
  ↓
Birthright: Fringe Survivor at positions [1, 5]

✅ Valid: Position 1 connects to [0, 1, 2], includes Fringe Survivor's position 1
```

### Valid Connection (Alternate Path) ✅
```
Home World: Position 5
  ↓
Birthright: Fringe Survivor at positions [1, 5]

✅ Valid: Position 5 connects to [4, 5, 6], includes Fringe Survivor's position 5
```

### Invalid Connection ❌
```
Home World: Position 7
  ↓
Birthright: Fringe Survivor at positions [1, 5]

❌ Invalid: Position 7 connects to [6, 7, 8], does not include 1 or 5
```

---

## Guided Mode Behavior

When in **Guided Mode**, the system:

1. Gets the previous selection's position (e.g., Home World at 3)
2. Calculates valid connections: [2, 3, 4]
3. For each Birthright origin:
   - Gets its `allPositions` (e.g., [1, 5] for Fringe Survivor)
   - Checks if ANY position overlaps with [2, 3, 4]
   - Enables or grays out accordingly

**Example with Home World at Position 3:**
- ✅ Origins at position 2: Enabled (3 → [2, 3, 4])
- ✅ Origins at position 3: Enabled (3 → [2, 3, 4])
- ✅ Origins at position 4: Enabled (3 → [2, 3, 4])
- ❌ Fringe Survivor [1, 5]: Grayed (neither 1 nor 5 in [2, 3, 4])

---

## UI Implementation

### Card Rendering
```javascript
// Each origin appears once, but tracks all its positions
const seenOrigins = new Set();

for (const origin of origins) {
  if (seenOrigins.has(origin.id)) continue;
  seenOrigins.add(origin.id);

  const positions = origin.system?.allPositions || [origin.system?.position];
  const primaryPosition = origin.system?.position || 0;

  cards.push({
    id: origin.id,
    position: primaryPosition,           // Where the card displays
    isMultiPosition: positions.length > 1,
    allPositions: positions,             // For validation and UI indicators
    // ... other card data
  });
}
```

### Selection Behavior
- Each origin appears once at its primary position
- Card includes `allPositions` array for validation
- Validation checks if ANY position can connect to previous selection

### Visual Indicators (Optional)
Consider adding indicators for multi-position origins:
- Badge showing "2 Paths" or "Multiple Routes"
- Tooltip: "Also reachable from position 5"
- Icon or subtle highlight
- Different border style

---

## Data Structure Example

```json
{
  "name": "Fringe Survivor",
  "system": {
    "step": "birthright",
    "stepIndex": 2,
    "position": 1,
    "positions": [5],
    "navigation": {
      "connectsTo": [0, 1, 2],
      "isEdgeLeft": false,
      "isEdgeRight": false
    }
  }
}
```

**Computed at runtime:**
```javascript
origin.system.allPositions  // → [1, 5]
```

**Connectivity for each position:**
- Position 1 → connects to [0, 1, 2]
- Position 5 → connects to [4, 5, 6]

---

## Testing Scenarios

### Scenario 1: Linear Path
```
Home World (pos 3) → Birthright (pos 3) → Lure (pos 3) → Trials (pos 3) → Motivation (pos 3) → Career (pos 3)
```
Should work without any issues.

### Scenario 2: Zigzag Path
```
Home World (pos 1) → Fringe Survivor (pos 1) → Hunter (pos 1) → Darkness (pos 1) → Devotion (pos 1) → Career (pos 1)
```
All are at or near position 1, should connect smoothly.

### Scenario 3: Wide Jump with Multi-Position
```
Home World (pos 1) → Fringe Survivor (pos 5) → New Horizons (pos 5) → Lost Worlds (pos 5) → Knowledge (pos 5) → Career (pos 5)
```
Fringe Survivor "jumps" from position 1 to 5, then continues linearly.

### Scenario 4: Fear from Any Path
```
Home World (any) → Birthright (any) → Lure (any) → Trials (any position 1-6) → Fear (matches that position) → Career (pos 0-1)
```
Fear should be selectable regardless of which Trials origin was chosen.

---

**This visual reference complements the technical documentation and should help understand the multi-position navigation system at a glance.**
