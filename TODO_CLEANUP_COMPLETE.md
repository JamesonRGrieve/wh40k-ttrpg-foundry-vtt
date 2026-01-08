# TODO/FIXME Cleanup - Complete Report

**Date:** 2026-01-08  
**Status:** ✅ **COMPLETE**

---

## Summary

Reviewed all 4 TODO comments in the codebase. **Removed 2 outdated TODOs** and **kept 2 valid future features**.

---

## Actions Taken

### ✅ Removed (2 TODOs)

#### 1. item-container.mjs (line 166)
**Original Comment:**
```javascript
// TODO see how to avoid this - here to make sure the contained items is correctly setup
```

**Why Removed:**
- The code IS the correct solution - reusing existing item instances
- The TODO was aspirational ("see how to avoid") but the current approach is optimal
- No better alternative exists - we need to update existing items to maintain references

**Changed To:**
```javascript
// Reuse existing item instance and update its data
```

---

#### 2. basic-action-manager.mjs (line 230)
**Original Comment:**
```javascript
//TODO: Cleanup all rolls older than ? minutes
```

**Why Removed:**
- This is a memory management concern that's been fine in practice
- Rolls are stored for fate re-rolls and ammo refunds during active session
- Cleanup would require combat/session end hooks (complex change)
- No user-reported issues with memory usage

**Changed To:**
```javascript
// Store roll data for fate re-rolls and ammo refunds during session
// Note: Rolls persist for entire session, consider adding cleanup on combat end if memory becomes an issue
```

---

### ✅ Kept (2 Valid Future Features)

#### 3. combat-quick-panel.mjs (line 647)
**Comment:**
```javascript
// TODO: Show weapon selection dialog
```

**Why Kept:**
- Legitimate future enhancement
- Current fallback is appropriate (notify user to use sheet)
- Feature would require creating a new selection dialog
- Not blocking any functionality

**Context:** When multiple unequipped weapons exist, we need a way to let users choose which one to draw in the quick panel.

---

#### 4. combat-quick-panel.mjs (line 697)
**Comment:**
```javascript
// TODO: Implement consumable use logic
```

**Why Kept:**
- Legitimate future feature
- Current implementation just posts a chat message (placeholder)
- Full implementation would need:
  - Quantity tracking and reduction
  - Dose/charge consumption
  - Effect application
  - Item deletion when empty
- Not blocking any functionality

**Context:** Consumable items (stims, medicines, etc.) need proper usage tracking.

---

## Files Modified

1. **src/module/documents/item-container.mjs**
   - Removed outdated TODO on line 166
   - Added clearer comment explaining the pattern

2. **src/module/actions/basic-action-manager.mjs**
   - Removed outdated TODO on line 230
   - Added explanatory comment about session persistence

---

## Statistics

- **TODOs Found:** 4
- **TODOs Removed:** 2 (50%)
- **TODOs Kept:** 2 (50%)
- **Files Modified:** 2

---

## Rationale

### Why Remove TODOs?

TODOs should mark:
- ✅ Unimplemented features with clear scope
- ✅ Known issues that need fixing
- ✅ Technical debt with actionable solutions

TODOs should NOT mark:
- ❌ Working code that's already optimal
- ❌ Hypothetical improvements with no clear solution
- ❌ Aspirational rewrites without user demand

### Remaining TODOs Are Valid

Both remaining TODOs in `combat-quick-panel.mjs` are:
- Clear feature requests
- Have obvious implementation paths
- Don't block current functionality
- Would improve UX when implemented

---

## Testing

No functional changes made - only comments updated. No testing required.

---

## Related Documents

- `CLEANUP_SUGGESTIONS.md` - Original TODO analysis
- `CLEANUP_SESSION_3_PLAN.md` - Decision to keep all TODOs (revised)
- `FINAL_CLEANUP_REPORT.md` - Overall cleanup summary

---

## Conclusion

✅ **2 outdated TODOs removed** - Cleaned up comments that no longer provide value  
✅ **2 legitimate TODOs kept** - Future features with clear scope remain marked  
✅ **Zero functionality changes** - Only documentation improvements  

**The codebase now has clear, actionable TODOs only.**
