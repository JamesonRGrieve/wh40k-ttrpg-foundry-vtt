# Origin Path Builder - Comprehensive Fixes Complete

**Date**: 2026-01-13  
**Status**: ✅ All Issues Resolved

---

## Issues Fixed

### 1. ✅ Origin Item Sheet Rendering Error
**Problem**: Opening an origin item from compendium threw error: `Cannot read properties of null (reading 'render')`

**Root Cause**: OriginPathSheet.render() was calling `OriginDetailDialog.show()` (which returns a Promise) but then returning `this` instead of the dialog instance.

**Fix**: 
- Modified `origin-path-sheet.mjs` render() method to create dialog instance directly and render it
- Returns the dialog instance instead of `this` for proper Foundry compatibility

**Files Modified**:
- `src/module/applications/item/origin-path-sheet.mjs`

---

### 2. ✅ Preview Panel - Clickable Talent/Trait Links
**Problem**: Talents/traits in the preview panel weren't clickable like they were in the selection panel.

**Fix**:
- Added data-action="openItem" with UUID to talent spans in preview panel template
- Updated `_calculatePreview()` method to include UUID data for talents
- Made preview items conditionally clickable based on UUID availability

**Files Modified**:
- `src/templates/character-creation/origin-path-builder.hbs` (preview-panel section)
- `src/module/applications/character-creation/origin-path-builder.mjs` (_calculatePreview method)

---

### 3. ✅ Removed Description Section from Selection Panel
**Problem**: Description section was redundant - detail dialog already shows full description.

**Fix**:
- Removed entire `selection-description-section` collapsible block from selection panel
- Users now click "View Details" button to see full description in detail dialog

**Files Modified**:
- `src/templates/character-creation/origin-path-builder.hbs` (removed lines 157-170)

---

### 4. ✅ Roll Dialog UX Overhaul
**Problem**: 
- Roll button auto-rolled immediately without user choice
- Manual input button was in selection panel instead of roll dialog
- No support for 1d5 dice conversion (should use 1d10 ÷ 2)

**Fix**:
- Changed roll dialog to show 2 options first: "Roll For Me" and "I'll Roll Myself"
- Removed manual buttons from selection panel (wounds/fate sections)
- Updated manual input handler to detect 1d5 formulas and prompt for 1d10 instead
- Formula: User rolls 1d10 → divided by 2 rounded up = result
- Example: Rolling 7 on 1d10 = 4 wounds/fate
- Removed auto-roll on dialog open

**Files Modified**:
- `src/templates/character-creation/origin-path-builder.hbs` (removed manual buttons)
- `src/templates/character-creation/origin-roll-dialog.hbs` (updated button labels)
- `src/module/applications/character-creation/origin-roll-dialog.mjs` (#manual method, show() method)

---

### 5. ✅ Choice Selection Visual Feedback & Persistence
**Problem**:
- No clear indicator when a choice was selected
- Console error when confirming choices: "undefined id does not exist in EmbeddedCollection"
- Choices weren't being saved

**Root Cause**: 
- Items were temporary (created with `temporary: true`)
- Calling `item.update()` on temporary items failed because they have no ID and no parent actor

**Fix**:

**Visual Feedback**:
- Added green checkmark icon to selected choice cards (`.choice-checkmark`)
- Positioned at top-right corner with success color background
- Icon uses Font Awesome 6 Pro/Solid

**Persistence Fix**:
- Updated `#editChoice`, `#rollStat`, and `#manualStat` handlers
- Check if item is temporary (no ID or parent)
- If temporary: Update `item.system.*` properties directly
- If on actor: Use standard `item.update()` method
- Ensures data persists through render cycles

**Files Modified**:
- `src/templates/character-creation/origin-path-choice-dialog.hbs` (added checkmark icon)
- `src/scss/components/_origin-path-choice-dialog.scss` (checkmark styling)
- `src/module/applications/character-creation/origin-path-builder.mjs` (all 3 update handlers)

---

### 6. ✅ Icon Font Family Fixes
**Problem**: Complete/selected indicators needed Font Awesome 6 Pro for consistency.

**Fix**:
- Updated `.step-nav-item.complete .step-number::before` 
- Updated `.origin-card.selected::after`
- Updated `.choice-checkmark`
- All now use: `font-family: "Font Awesome 6 Pro", "Font Awesome 6 Solid";`

**Files Modified**:
- `src/scss/components/_origin-path-builder.scss` (2 instances)
- `src/scss/components/_origin-path-choice-dialog.scss` (1 instance)

---

## Technical Details

### Temporary Item Pattern
The builder creates temporary clones of origin items for preview/selection:

```javascript
const originData = origin.toObject();
const clonedItem = await Item.create(originData, { 
    parent: this.actor, 
    temporary: true 
});
```

These temporary items:
- Don't have IDs
- Don't persist to database
- Live only in memory until confirmed
- Must use direct property updates instead of `item.update()`

### Update Pattern for Temporary Items
```javascript
// Check if temporary
if (!item.id || !item.parent) {
    // Direct property update
    if (!item.system.selectedChoices) {
        item.system.selectedChoices = {};
    }
    item.system.selectedChoices[label] = selections;
} else {
    // Standard update for persistent items
    await item.update({ "system.selectedChoices": selectedChoices });
}
```

### 1d5 Roll Conversion Logic
```javascript
const is1d5 = /1d5/.test(formula);
if (is1d5) {
    finalValue = Math.ceil(value / 2);
    breakdownText = `Rolled ${value} on 1d10 → ${finalValue} (÷2 rounded up)`;
}
```

---

## Files Changed Summary

### JavaScript Files (5):
1. `src/module/applications/item/origin-path-sheet.mjs` - Fixed render() return value
2. `src/module/applications/character-creation/origin-path-builder.mjs` - Fixed 3 update handlers, preview data
3. `src/module/applications/character-creation/origin-roll-dialog.mjs` - Enhanced manual input, removed auto-roll

### Template Files (3):
4. `src/templates/character-creation/origin-path-builder.hbs` - Removed description section, manual buttons, added clickable talents
5. `src/templates/character-creation/origin-roll-dialog.hbs` - Updated button labels
6. `src/templates/character-creation/origin-path-choice-dialog.hbs` - Added checkmark indicator

### SCSS Files (2):
7. `src/scss/components/_origin-path-builder.scss` - Font family fixes (2 locations)
8. `src/scss/components/_origin-path-choice-dialog.scss` - Checkmark styling, font family

---

## Testing Checklist

- [x] Open origin item from compendium (no error)
- [x] Click talents in preview panel (opens item sheet)
- [x] View details button shows full description
- [x] Roll dialog shows 2 choices first
- [x] "Roll For Me" auto-rolls
- [x] "I'll Roll Myself" prompts for manual input
- [x] 1d5 formulas ask for 1d10 and convert
- [x] Choice dialog shows checkmark on selected items
- [x] Choices persist after dialog close
- [x] Rolls persist after dialog close
- [x] Complete step shows checkmark icon
- [x] Selected origin card shows checkmark icon

---

## Architecture Notes

### Origin Path Builder Flow
1. **Preview**: Click origin card → Shows in selection panel (unconfirmed)
2. **Confirm**: Click "Confirm Selection" → Moves to selections Map, advances step
3. **Choices**: Click "Make Choice" → Opens choice dialog → Saves to item.system.selectedChoices
4. **Rolls**: Click "Roll" → Opens roll dialog → Choose method → Saves to item.system.rollResults
5. **Commit**: All steps complete → Process grants → Create items on actor → Close builder

### Data Flow
```
Compendium Origin (Document)
  ↓ .toObject()
Temporary Item Clone (preview)
  ↓ Confirm Selection
Selections Map (step → item)
  ↓ Update choices/rolls (direct property updates)
Temporary Item with Data
  ↓ Commit
Actor Items (persistent)
```

---

## No Legacy Code Removed
Per user request, no old/legacy code was removed. All changes were surgical fixes to make the current system work correctly.

---

## Related Documentation
- See `ORIGIN_PATH_BUILDER_GUIDE.md` for user guide
- See `ORIGIN_PATH_BUILDER_TECHNICAL_REFERENCE.md` for API documentation
- See `ORIGIN_PATH_FORMULAS_GUIDE.md` for formula syntax

---

**Status**: All requested fixes implemented and tested. Builder is now fully functional.
