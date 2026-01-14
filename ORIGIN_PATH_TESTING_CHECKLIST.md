# Origin Path System - Implementation Checklist

**Status**: ✅ COMPLETE - Ready for Build & Test  
**Date**: January 13, 2026

---

## Pre-Build Verification ✅

### Code Changes
- [x] Added `positions` field to origin-path.mjs data model
- [x] Added `allPositions` getter to origin-path.mjs
- [x] Simplified `_calculateConnections()` in origin-chart-layout.mjs
- [x] Updated `_isValidNext()` for multi-position support
- [x] Updated `_computeStepLayout()` to create cards per position
- [x] Updated `getValidNextOptions()` for multi-position validation

### Data Updates
- [x] Fringe Survivor: positions [1, 5]
- [x] Unnatural Origin: positions [2, 3]
- [x] In Service to Throne: positions [4, 6]
- [x] Hunter: positions [1, 4]
- [x] Crusade: positions [2, 3]
- [x] New Horizons: positions [5, 6]
- [x] Darkness: positions [1, 6]
- [x] A Product of Upbringing: positions [2, 5]
- [x] Lost Worlds: positions [3, 5]
- [x] Devotion: positions [1, 4]
- [x] Exhilaration: positions [2, 6]
- [x] Knowledge: positions [3, 5]
- [x] Fear: positions [0, 1, 2, 3, 4, 5, 6]

### Documentation
- [x] Updated AGENTS.md with multi-position system
- [x] Created ORIGIN_PATH_MULTI_POSITION_REFACTOR.md
- [x] Created ORIGIN_PATH_MULTI_POSITION_VISUAL.md
- [x] Created this checklist

---

## Build Instructions

```bash
# From project root
npm run build
```

This will:
1. Compile SCSS
2. Copy source files
3. **Compile origin path JSON files into LevelDB packs** ← Critical!
4. Create distribution archive

---

## Testing Checklist

### 1. Basic Navigation (Guided Mode)

#### Home World Selection
- [ ] Can select any Home World origin
- [ ] Selected Home World highlights
- [ ] Birthright step shows available options

#### Single-Position Origins
- [ ] Select Home World at position 3
- [ ] Verify Birthright origins at positions 2, 3, 4 are enabled
- [ ] Verify Birthright origins at other positions are grayed out
- [ ] Select one and verify it works

#### Multi-Position Origin Display
- [ ] Fringe Survivor appears ONCE at position 1 (not duplicated at position 5)
- [ ] Unnatural Origin appears ONCE at position 2 (not duplicated at position 3)
- [ ] In Service to Throne appears ONCE at position 4 (not duplicated at position 6)
- [ ] Each card has `isMultiPosition: true` flag
- [ ] Each card has `allPositions` array showing all reachable positions
- [ ] No duplicate cards in any step

### 2. Multi-Position Connectivity

#### Fringe Survivor (pos 1 + 5)
- [ ] Select Home World at position 0, 1, or 2
- [ ] Fringe Survivor (displays at position 1) is enabled
- [ ] Select Home World at position 4, 5, or 6
- [ ] Fringe Survivor (still at position 1) is enabled
- [ ] Select Home World at position 3
- [ ] Fringe Survivor is grayed out (position 3→[2,3,4] doesn't include 1 or 5)

#### Unnatural Origin (pos 2 + 3)
- [ ] Select Home World at position 1, 2, or 3
- [ ] Unnatural Origin is enabled (connects to pos 2)
- [ ] Select Home World at position 2, 3, or 4
- [ ] Unnatural Origin is enabled (connects to pos 3)

#### In Service to Throne (pos 4 + 6)
- [ ] Select Home World at position 3, 4, or 5
- [ ] In Service to Throne is enabled (connects to pos 4)
- [ ] Select Home World at position 5, 6, or 7
- [ ] In Service to Throne is enabled (connects to pos 6)

### 3. Full Path Tests

#### Linear Path
- [ ] Home World (pos 3) → Standard Birthright (pos 3) → Standard Lure (pos 3) → Standard Trials (pos 3) → Standard Motivation (pos 3) → Career (pos 3)
- [ ] All selections work smoothly

#### Multi-Position Path (Accessible via Multiple Routes)
- [ ] Home World (pos 1) → Fringe Survivor (at pos 1, accessible from 1 or 5)
- [ ] Fringe Survivor is enabled even though it could also be reached from position 5
- [ ] Continue to next step normally

#### Fear Path (Accept from ANY)
- [ ] Select ANY combination leading to Trials and Travails
- [ ] Fear appears once at position 0
- [ ] Fear is enabled regardless of which Trials origin is selected (positions 1-6)
- [ ] Selecting Fear allows continuing to Career

### 4. Edge Cases

#### Fear (Position 0 with 7 reachable positions)
- [ ] Fear appears ONCE at position 0
- [ ] Fear has `isMultiPosition: true` and `allPositions: [0,1,2,3,4,5,6]`
- [ ] Fear is enabled regardless of which Trials origin is selected
- [ ] Selecting Fear allows continuing to Career at positions 0 or 1

#### Position 8 (if any)
- [ ] Origins at position 8 connect to [7, 8]
- [ ] Previous selections at 7, 8 can connect to position 8

#### Cascade Reset Warning
- [ ] Select a full path through all 6 steps
- [ ] Go back and change Birthright selection
- [ ] System warns that Lure, Trials, Motivation, and Career will be reset
- [ ] Confirm and verify later steps are cleared

### 5. Free Mode

- [ ] Toggle Free Mode on
- [ ] All origins should be selectable regardless of position
- [ ] Can select incompatible combinations
- [ ] Multi-position origins still appear at all their positions

### 6. Choice and Roll Features

- [ ] Select an origin with choices (e.g., Fringe Survivor)
- [ ] Choice dialog appears
- [ ] Can view item sheets for all grant types
- [ ] Select choices and verify they're saved

- [ ] Select an origin with roll formulas
- [ ] Roll dialog appears
- [ ] Can roll wounds/fate
- [ ] Results are saved and displayed

### 7. Commit Path

- [ ] Complete a full 6-step path
- [ ] Click "Commit Path" button
- [ ] Verify all characteristics are applied
- [ ] Verify all skills are granted
- [ ] Verify all talents/traits are added
- [ ] Verify wounds/fate bonuses applied
- [ ] Verify equipment is added

---

## Verification Commands

### Check Build Output
```bash
# Verify packs were compiled
ls -lh dist/packs/rt-items-origin-path/

# Should see .ldb files (LevelDB format)
```

### Check in Foundry
```javascript
// In Foundry console

// Get Fringe Survivor from pack
const pack = game.packs.get("rogue-trader.rt-items-origin-path");
const fringe = await pack.getDocument("LeGYSdFJFK9PVSBL");

// Check positions field
console.log(fringe.system.position);     // Should be 1
console.log(fringe.system.positions);    // Should be [5]
console.log(fringe.system.allPositions); // Should be [1, 5]

// Check Fear (all 7 positions)
const fear = await pack.getDocument("zyEUfSFLQb2XFJko");
console.log(fear.system.position);       // Should be 0
console.log(fear.system.positions);      // Should be [1, 2, 3, 4, 5, 6]
console.log(fear.system.allPositions);   // Should be [0, 1, 2, 3, 4, 5, 6]
```

---

## Known Behaviors

### Known Behaviors (Updated)
✅ Multi-position origins appear ONCE at their primary position  
✅ Each origin has `isMultiPosition` flag and `allPositions` array for UI indicators  
✅ No duplicate cards - each origin appears exactly once  
✅ Validation checks if ANY position can connect (not just primary)  
✅ Fear has 7 positions but displays once at position 0  

### Optional UI Enhancements
Consider adding visual indicators for multi-position origins:
- Badge showing "2 Paths" or "Multiple Paths"
- Icon indicating alternate accessibility
- Tooltip showing all accessible positions: "Also reachable from position 5"
- Subtle border or glow effect

---

## Rollback Plan (If Issues Found)

If critical issues are discovered:

1. **Revert Data Model**:
   - Remove `positions` field from schema
   - Remove `allPositions` getter

2. **Revert Chart Layout**:
   - Restore original `_calculateConnections()` logic
   - Restore original `_isValidNext()` logic
   - Restore original `_computeStepLayout()` card creation

3. **Revert Data Files**:
   ```bash
   git checkout src/packs/rt-items-origin-path/_source/*.json
   ```

4. **Rebuild**:
   ```bash
   npm run build
   ```

---

## Success Criteria

The implementation is successful if:

- ✅ All 13 multi-position origins display correctly
- ✅ Navigation validation works (guided mode)
- ✅ Connections follow ±1 rule properly
- ✅ Fear accepts from ANY Trials position
- ✅ Selection and commit work correctly
- ✅ No errors in console
- ✅ No duplicate grants
- ✅ UI is responsive and intuitive

---

## Support Documentation

- **AGENTS.md** - Updated system documentation
- **ORIGIN_PATH_MULTI_POSITION_REFACTOR.md** - Technical implementation details
- **ORIGIN_PATH_MULTI_POSITION_VISUAL.md** - Visual examples and diagrams

---

**Ready to proceed with build and test!**
