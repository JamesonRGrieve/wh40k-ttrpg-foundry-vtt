# Weapon Modifications - Test Plan

**Issue**: RogueTraderVTT-q2w  
**Implementation Date**: 2026-01-20

---

## Pre-Test Setup

1. **Start Foundry VTT**
2. **Load the Rogue Trader system** (version 1.8.1+)
3. **Create a test world** or use existing world
4. **Import weapon modification compendium** (if available)
5. **Create or open an actor** with weapons

---

## Test Cases

### 1. Display Tests (Visual Verification)

#### 1.1 Overview Tab - Modifications Banner

-   [ ] Open a weapon sheet
-   [ ] Verify "Modifications" section appears when mods are installed
-   [ ] Verify modification count badge shows correct number
-   [ ] Verify modification badges display active mod names
-   [ ] Verify banner has proper styling (gradient, border)

#### 1.2 Properties Tab - Modifications Section

-   [ ] Navigate to Properties tab
-   [ ] Verify "Modifications" section appears
-   [ ] Verify count badge shows in section header
-   [ ] Verify empty state shows when no mods (icon + "No modifications installed")
-   [ ] Verify empty hint text appears in edit mode

#### 1.3 Stat Bar - Modified Indicators

-   [ ] Add an active modification that affects damage
-   [ ] Verify wrench icon badge appears on Damage stat
-   [ ] Verify damage value shows in gold color
-   [ ] Verify same for Penetration if modified
-   [ ] Verify indicator disappears when mod is deactivated

### 2. Drag-Drop Tests

#### 2.1 Add Modification from Compendium

-   [ ] Open weapon sheet in edit mode
-   [ ] Open weaponModification compendium
-   [ ] Drag a compatible modification onto weapon sheet
-   [ ] Verify notification: "{mod name} installed."
-   [ ] Verify modification appears in Properties tab list
-   [ ] Verify modification appears in Overview tab banner
-   [ ] Verify stats update immediately (if mod affects stats)

#### 2.2 Duplicate Prevention

-   [ ] Try to drag the same modification again
-   [ ] Verify notification: "{mod name} is already installed."
-   [ ] Verify modification is NOT added twice

#### 2.3 Weapon Class Restriction

-   [ ] Drag a pistol-only mod onto a melee weapon
-   [ ] Verify warning: "{mod name} cannot be installed on {class} weapons."
-   [ ] Verify modification is NOT added

#### 2.4 Weapon Type Restriction

-   [ ] Drag a las-only mod onto a bolt weapon
-   [ ] Verify warning: "{mod name} is not compatible with {type} weapons."
-   [ ] Verify modification is NOT added

### 3. Toggle Active/Inactive

#### 3.1 Toggle Off

-   [ ] Open weapon sheet with at least one active modification
-   [ ] Navigate to Properties tab
-   [ ] Click the toggle button (should be green with toggle-on icon)
-   [ ] Verify notification: "{mod name} deactivated."
-   [ ] Verify button turns gray with toggle-off icon
-   [ ] Verify modification name gets strikethrough
-   [ ] Verify card opacity reduces to 50%
-   [ ] Verify stats revert to base + other active mods
-   [ ] Verify modified indicator disappears from stat bar

#### 3.2 Toggle On

-   [ ] Click the toggle button again (should be gray with toggle-off icon)
-   [ ] Verify notification: "{mod name} activated."
-   [ ] Verify button turns green with toggle-on icon
-   [ ] Verify strikethrough removed from name
-   [ ] Verify card opacity returns to 100%
-   [ ] Verify stats include this mod's modifiers
-   [ ] Verify modified indicator reappears on stat bar

### 4. View Modification Details

#### 4.1 Open Modification Sheet

-   [ ] Click the eye icon on any modification card
-   [ ] Verify weaponModification item sheet opens
-   [ ] Verify correct modification is displayed
-   [ ] Verify full details visible (modifiers, restrictions, description)

#### 4.2 Missing Modification Handling

-   [ ] Manually edit weapon data to reference a deleted modification UUID
-   [ ] Open weapon sheet
-   [ ] Try to click eye icon
-   [ ] Verify error notification: "Modification '{name}' not found. It may have been deleted."

### 5. Remove Modification

#### 5.1 Confirm Removal

-   [ ] Enter edit mode (if on actor-owned weapon)
-   [ ] Click trash icon on a modification card
-   [ ] Verify confirmation dialog appears: "Remove {name} from this weapon?"
-   [ ] Click "Yes"
-   [ ] Verify notification: "{mod name} removed."
-   [ ] Verify modification disappears from list
-   [ ] Verify stats revert to base + remaining mods
-   [ ] Verify count badge updates

#### 5.2 Cancel Removal

-   [ ] Click trash icon
-   [ ] Click "No" in confirmation dialog
-   [ ] Verify modification remains in list
-   [ ] Verify stats unchanged

### 6. Modification Effects Display

#### 6.1 Effects Badges

-   [ ] Add a modification with damage bonus
-   [ ] Verify "Damage +X" badge appears in effects row
-   [ ] Add a modification with penetration bonus
-   [ ] Verify "Pen +X" badge appears
-   [ ] Add a modification with to-hit bonus
-   [ ] Verify "To Hit +X" badge appears
-   [ ] Add a modification with range bonus
-   [ ] Verify "Range +Xm" badge appears
-   [ ] Add a modification with weight penalty
-   [ ] Verify "Weight +Xkg" badge appears

#### 6.2 No Effects

-   [ ] Add a modification with all zero modifiers
-   [ ] Verify effects row is NOT displayed (hasEffects = false)

### 7. Stat Aggregation

#### 7.1 Single Modification

-   [ ] Start with unmodified weapon (10 damage, 2 pen)
-   [ ] Add mod with +2 damage
-   [ ] Verify effective damage shows "1d10+2"
-   [ ] Add mod with +1 pen
-   [ ] Verify effective pen shows "3"

#### 7.2 Multiple Modifications

-   [ ] Add mod A (+2 damage, +1 pen)
-   [ ] Add mod B (+1 damage, +2 pen)
-   [ ] Verify effective damage shows "1d10+3"
-   [ ] Verify effective pen shows "5"
-   [ ] Toggle mod A off
-   [ ] Verify effective damage shows "1d10+1"
-   [ ] Verify effective pen shows "3"

#### 7.3 Stacking with Craftsmanship

-   [ ] Set weapon craftsmanship to "Good" (+1 damage)
-   [ ] Add mod with +2 damage
-   [ ] Verify effective damage includes both: "1d10+3"
-   [ ] Set craftsmanship to "Master-Crafted" (+10 to hit)
-   [ ] Add mod with +5 to hit
-   [ ] Verify effective to hit shows "+15"

### 8. Edit Mode Integration

#### 8.1 Actor-Owned Weapon (Edit Mode Required)

-   [ ] Open weapon sheet on actor
-   [ ] Verify weapon is in view mode by default
-   [ ] Verify remove buttons are NOT visible
-   [ ] Click edit mode toggle
-   [ ] Verify remove buttons appear
-   [ ] Click trash icon
-   [ ] Verify removal works

#### 8.2 World Item (Always Editable)

-   [ ] Open weapon sheet from Items sidebar
-   [ ] Verify modifications section is editable
-   [ ] Verify remove buttons visible (no edit mode needed)

#### 8.3 Compendium Item (Read-Only)

-   [ ] Open weapon sheet from compendium
-   [ ] Verify modifications display in read-only mode
-   [ ] Verify no edit/remove buttons

### 9. Empty State Tests

#### 9.1 View Mode

-   [ ] Open weapon with no modifications (not in edit mode)
-   [ ] Navigate to Properties tab
-   [ ] Verify empty state shows: "No modifications installed"
-   [ ] Verify NO drag-drop hint text

#### 9.2 Edit Mode

-   [ ] Enter edit mode
-   [ ] Navigate to Properties tab
-   [ ] Verify empty state shows icon
-   [ ] Verify hint text: "Drag weapon modifications here from compendium"

### 10. Performance Tests

#### 10.1 Multiple Modifications

-   [ ] Add 5+ modifications to a weapon
-   [ ] Toggle each on/off
-   [ ] Verify no lag or stuttering
-   [ ] Verify stats update smoothly

#### 10.2 Sheet Render Speed

-   [ ] Open weapon sheet with 5+ modifications
-   [ ] Verify sheet opens quickly (<1 second)
-   [ ] Switch between tabs
-   [ ] Verify tab switches are instant

### 11. Persistence Tests

#### 11.1 Save and Reload

-   [ ] Add 3 modifications to a weapon
-   [ ] Toggle one off
-   [ ] Close weapon sheet
-   [ ] Refresh browser (F5)
-   [ ] Reopen weapon sheet
-   [ ] Verify all 3 modifications still present
-   [ ] Verify active/inactive states preserved
-   [ ] Verify stats correct

#### 11.2 Actor Sheet Integration

-   [ ] Open actor sheet with weapon
-   [ ] Verify effective damage displays in weapons list
-   [ ] Roll weapon attack
-   [ ] Verify attack roll uses effective to-hit
-   [ ] Roll damage
-   [ ] Verify damage roll uses effective damage formula

---

## Edge Cases

### E1. Missing UUID

-   [ ] Manually edit weapon to have invalid UUID in modifications array
-   [ ] Open weapon sheet
-   [ ] Verify no errors in console
-   [ ] Verify modification shows with "missing" indicator or is skipped

### E2. Malformed Data

-   [ ] Manually edit weapon to have modification without cachedModifiers
-   [ ] Open weapon sheet
-   [ ] Verify no errors
-   [ ] Verify modification displays with zero effects

### E3. Negative Modifiers

-   [ ] Add modification with negative values (e.g., -5 to hit, -2 damage)
-   [ ] Verify effects badges display correctly (no "+" sign)
-   [ ] Verify stats decrease appropriately

### E4. Very Long Names

-   [ ] Add modification with 50+ character name
-   [ ] Verify card doesn't break layout
-   [ ] Verify name truncates or wraps properly

---

## Regression Tests

### R1. Existing Weapon Features

-   [ ] Verify equipped/unequipped toggle still works
-   [ ] Verify reload button still works
-   [ ] Verify attack/damage buttons still work
-   [ ] Verify craftsmanship display still works
-   [ ] Verify quality tags still work

### R2. Template Rendering

-   [ ] Verify all tabs still render correctly
-   [ ] Verify form fields still editable
-   [ ] Verify description editor still works
-   [ ] Verify effects tab still works

---

## Browser Compatibility

Test in all supported browsers:

-   [ ] Chrome/Edge
-   [ ] Firefox
-   [ ] Safari (if applicable)

---

## Accessibility

-   [ ] Verify keyboard navigation works (Tab through buttons)
-   [ ] Verify tooltips appear on hover
-   [ ] Verify screen reader labels present (if applicable)

---

## Expected Results Summary

**All tests should pass with:**

-   ✅ No console errors
-   ✅ No visual glitches
-   ✅ Smooth interactions
-   ✅ Correct stat calculations
-   ✅ Proper validation messages
-   ✅ Data persistence across sessions

---

## Bug Reporting Template

If any test fails, report using this format:

**Test Case**: [e.g., 2.1 - Add Modification from Compendium]  
**Expected Result**: [e.g., Modification added to list]  
**Actual Result**: [e.g., No modification added, no notification]  
**Steps to Reproduce**:

1. [Step 1]
2. [Step 2]
3. [etc.]

**Console Errors**: [Paste any errors]  
**Screenshots**: [Attach if relevant]

---

## Sign-Off

**Tester Name**: ********\_********  
**Date**: ********\_********  
**Tests Passed**: **_ / _**  
**Critical Bugs Found**: **_  
**Minor Bugs Found**: _**

**Overall Assessment**: [ ] Pass [ ] Fail [ ] Pass with Minor Issues

**Notes**:
