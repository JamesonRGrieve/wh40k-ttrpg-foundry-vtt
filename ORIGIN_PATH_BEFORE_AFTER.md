# Origin Path System - Before & After

## Data Model Changes

### BEFORE (Old Structure)
```javascript
{
  stepIndex: 2,
  position: 1,              // Primary position
  positions: [5],           // Additional positions
  navigation: {
    connectsTo: [0, 1, 2],  // Stored connections
    isEdgeLeft: false,
    isEdgeRight: false
  },
  grants: { ... }
}
```

### AFTER (New Structure)
```javascript
{
  stepIndex: 2,
  positions: [1, 5],        // All positions in one array
  grants: { ... }
  // navigation computed dynamically - no stored data!
}
```

---

## Compendium Example

### BEFORE - Fringe Survivor
```json
{
  "name": "Fringe Survivor",
  "type": "originPath",
  "system": {
    "step": "birthright",
    "stepIndex": 2,
    "position": 1,
    "positions": [5],
    "navigation": {
      "connectsTo": [0, 1, 2],
      "isEdgeLeft": false,
      "isEdgeRight": false
    },
    "grants": { ... }
  }
}
```

### AFTER - Fringe Survivor
```json
{
  "name": "Fringe Survivor",
  "type": "originPath",
  "system": {
    "step": "birthright",
    "stepIndex": 2,
    "positions": [1, 5],
    "grants": { ... }
  }
}
```

**Lines removed**: 6  
**Clarity**: ✅ Much clearer that this origin occupies positions 1 and 5

---

## Code Changes

### BEFORE - Data Model
```javascript
class OriginPathData {
  static defineSchema() {
    return {
      position: new NumberField({ initial: 0 }),
      positions: new ArrayField(new NumberField(), { initial: [] }),
      navigation: new SchemaField({
        connectsTo: new ArrayField(new NumberField()),
        isEdgeLeft: new BooleanField(),
        isEdgeRight: new BooleanField()
      })
    };
  }
  
  prepareDerivedData() {
    super.prepareDerivedData?.();
    this._calculateActiveModifiers();
    this._prepareNavigationData(); // Compute and store navigation
  }
  
  _prepareNavigationData() {
    // 30 lines of code to compute and store connectsTo
    const position = this.position;
    let connectsTo = [];
    if (position === 0) {
      connectsTo = [0, 1];
      this.navigation.isEdgeLeft = true;
    } else if (position >= 7) {
      connectsTo = [position - 1, position];
      this.navigation.isEdgeRight = true;
    } else {
      connectsTo = [position - 1, position, position + 1];
    }
    this.navigation.connectsTo = connectsTo;
  }
  
  get allPositions() {
    const positions = [this.position];
    if (this.positions?.length) {
      positions.push(...this.positions);
    }
    return [...new Set(positions)].sort();
  }
}
```

### AFTER - Data Model
```javascript
class OriginPathData {
  static defineSchema() {
    return {
      positions: new ArrayField(new NumberField(), { initial: [4] })
      // That's it! No navigation field needed
    };
  }
  
  prepareDerivedData() {
    super.prepareDerivedData?.();
    this._calculateActiveModifiers();
    // No navigation preparation needed!
  }
  
  get allPositions() {
    return this.positions?.length > 0 ? [...this.positions].sort() : [4];
  }
  
  get primaryPosition() {
    return this.allPositions[0] || 4;
  }
}
```

**Lines of code removed**: ~35  
**Complexity**: Significantly reduced

---

### BEFORE - Chart Layout
```javascript
static _computeStepLayout(origins, stepIndex) {
  // ...
  const position = origin.system?.position || 0;
  const positions = origin.system?.allPositions || [position];
  const connectsTo = origin.system?.navigation?.connectsTo || 
                     this._calculateConnections(position);
  
  cards.push({
    position,
    connectsTo,
    isEdgeLeft: position === 0,
    isEdgeRight: position >= 8,
    allPositions: positions
  });
}

static _isValidNext(origin, adjacentSelection, direction) {
  const adjacentPos = adjacentSelection.system?.position || 0;
  const originPositions = origin.system?.allPositions || [origin.system?.position || 0];
  
  if (direction === DIRECTION.FORWARD) {
    const adjacentConnections = adjacentSelection.system?.navigation?.connectsTo ||
                                this._calculateConnections(adjacentPos);
    return originPositions.some(pos => adjacentConnections.includes(pos));
  } else {
    // More complex backward logic...
  }
}
```

### AFTER - Chart Layout
```javascript
static _computeStepLayout(origins, stepIndex) {
  // ...
  const positions = origin.system?.allPositions || [4];
  const position = origin.system?.primaryPosition || 4;
  
  cards.push({
    position,
    allPositions: positions
    // connectsTo computed on-demand, not stored!
  });
}

static _canConnect(origin, adjacentSelection, direction) {
  // Simple bidirectional check
  const originPositions = origin.system?.allPositions || [4];
  const adjacentPositions = adjacentSelection.system?.allPositions || [4];
  
  for (const originPos of originPositions) {
    const connectsTo = this._calculateConnections(originPos);
    for (const adjacentPos of adjacentPositions) {
      if (connectsTo.includes(adjacentPos)) return true;
    }
  }
  return false;
}
```

**Simplification**: No more direction-dependent logic, bidirectional by default

---

## Summary of Improvements

| Aspect | Before | After | Improvement |
|--------|--------|-------|-------------|
| **Fields per origin** | 3 (position, positions, navigation) | 1 (positions) | 67% reduction |
| **Data redundancy** | High (position stored 2-3 ways) | None | Eliminated |
| **Connectivity source** | Stored in compendium | Computed dynamically | DRY principle |
| **Lines per pack file** | ~180 | ~174 | 3% smaller |
| **Code complexity** | Medium-High | Low | Much simpler |
| **Maintainability** | Must sync data | Single source of truth | Much easier |
| **Migration needed** | N/A | Automatic | Transparent |

---

## Real-World Examples

### Single Position Origin
**Hive World** (most common case):
```javascript
// BEFORE: position: 4, positions: [], navigation: { connectsTo: [3,4,5] }
// AFTER:  positions: [4]
```

### Multi-Position Origin
**Fringe Survivor** (appears at 2 positions):
```javascript
// BEFORE: position: 1, positions: [5], navigation: { connectsTo: [0,1,2] }
// AFTER:  positions: [1, 5]
```

### Wildcard Origin
**Fear** (connects to all motivations):
```javascript
// BEFORE: position: 0, positions: [1,2,3,4,5,6], navigation: { connectsTo: [0,1] }
// AFTER:  positions: [0, 1, 2, 3, 4, 5, 6]
```

---

## The ±1 Rule

The entire navigation system is now based on one simple rule:

**Position N connects to positions [N-1, N, N+1]** (clamped to 0-8)

### Examples:
- Position 0 → connects to [0, 1]
- Position 4 → connects to [3, 4, 5]
- Position 8 → connects to [7, 8]

### Multi-Position:
- Fringe Survivor at [1, 5]:
  - Position 1 → [0, 1, 2]
  - Position 5 → [4, 5, 6]
  - Combined: can connect from positions 0-2 OR 4-6 ✓

This rule is applied uniformly in both forward and backward navigation!

---

