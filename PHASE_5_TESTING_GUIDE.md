# Phase 5: Threat Scaler Testing Guide

## Quick Start

1. **Build the system**:
   ```bash
   npm run build
   ```

2. **Launch Foundry** and load a world with the Rogue Trader system

3. **Create or open an NPC** (type: `npcV2`)

4. **Open Threat Scaler**:
   - Click the chart-line icon in the NPC sheet header
   - OR: Right-click NPC token → "Scale Threat"

## Visual Verification

### Initial Load
- [ ] Dialog opens with correct width (550px)
- [ ] NPC portrait displays (80×80px, rounded corners)
- [ ] NPC name shows correctly
- [ ] Current threat level displays
- [ ] Current tier badge shows correct color:
  - 1-5: Green (#4caf50)
  - 6-10: Blue (#2196f3)
  - 11-15: Orange (#ff9800)
  - 16-20: Red (#f44336)
  - 21-30: Purple (#9c27b0)

### Slider Section
- [ ] Color gradient slider displays (green→blue→orange→red→purple)
- [ ] 5 slider marks visible at correct positions
- [ ] Mark labels show: "1 Minor", "10 Standard", "15 Tough", "20 Elite", "30 Boss"
- [ ] Large threat value displays (3rem font)
- [ ] New tier badge shows correct color
- [ ] 5 preset buttons visible: -5, -1, Reset, +1, +5
- [ ] Reset button has gold styling

### Scaling Options
- [ ] 5 checkboxes in grid layout
- [ ] All checkboxes checked by default
- [ ] Checkbox labels: Characteristics, Wounds, Skills, Weapons, Armour
- [ ] Hover states work on all checkboxes

### Preview Section
- [ ] "Preview Changes" heading visible
- [ ] 3 tabs: Characteristics, Combat, Skills
- [ ] Characteristics tab active by default
- [ ] Comparison table shows 10 characteristics
- [ ] Table has 5 columns: Stat, Current, (arrow), New, Change

### Footer
- [ ] Cancel button (gray) on left
- [ ] Apply Scaling button (gold) on right
- [ ] Both buttons have icons

## Interaction Testing

### Slider Tests

1. **Drag slider to different values**:
   - [ ] Threat value updates immediately
   - [ ] New tier badge updates when crossing thresholds
   - [ ] Tier badge color changes at: 6, 11, 16, 21
   - [ ] Preview table updates after 100ms delay

2. **Test boundary values**:
   - [ ] Slider minimum is 1
   - [ ] Slider maximum is 30
   - [ ] Cannot go below 1
   - [ ] Cannot go above 30

### Preset Button Tests

1. **Test -5 button**:
   - [ ] Decreases threat by 5
   - [ ] Updates slider position
   - [ ] Preview updates
   - [ ] Clamps at minimum (1)

2. **Test -1 button**:
   - [ ] Decreases threat by 1
   - [ ] Updates slider position
   - [ ] Preview updates

3. **Test Reset button**:
   - [ ] Returns to original threat level
   - [ ] Updates slider position
   - [ ] Preview resets to original comparison

4. **Test +1 button**:
   - [ ] Increases threat by 1
   - [ ] Updates slider position
   - [ ] Preview updates

5. **Test +5 button**:
   - [ ] Increases threat by 5
   - [ ] Updates slider position
   - [ ] Preview updates
   - [ ] Clamps at maximum (30)

### Checkbox Tests

1. **Uncheck Characteristics**:
   - [ ] Preview shows no change in characteristics
   - [ ] New values = Current values
   - [ ] Change column shows 0
   - [ ] Percentage shows 0%

2. **Uncheck Wounds**:
   - [ ] Combat tab shows no change in wounds
   - [ ] Wounds change = 0

3. **Uncheck Armour**:
   - [ ] Combat tab shows no change in armour
   - [ ] Armour change = 0

4. **Uncheck all options**:
   - [ ] All changes show 0
   - [ ] Threat level still updates
   - [ ] Warning banner still appears for large changes

### Tab Tests

1. **Click Combat tab**:
   - [ ] Characteristics content hides
   - [ ] Combat content shows
   - [ ] Combat tab becomes active (gold underline)
   - [ ] Characteristics tab becomes inactive
   - [ ] Shows 2 rows: Wounds and Armour
   - [ ] Each row shows: Label, Current, Arrow, New, Diff

2. **Click Skills tab**:
   - [ ] Combat content hides
   - [ ] Skills content shows
   - [ ] Skills tab becomes active
   - [ ] Shows informational note

3. **Click Characteristics tab again**:
   - [ ] Returns to characteristics view
   - [ ] Characteristics tab becomes active

### Warning Banner Test

1. **Set threat difference >10**:
   - [ ] Orange warning banner appears
   - [ ] Shows exclamation triangle icon
   - [ ] Shows message: "Large threat change (X levels) - review carefully!"
   - [ ] X = actual threat difference

2. **Set threat difference ≤10**:
   - [ ] Warning banner disappears

## Preview Calculation Tests

### Setup: Create NPC with Threat 5
Expected baseline stats around:
- Characteristics: 20-35
- Wounds: ~10
- Armour: ~2

### Test 1: Scale Up to Threat 10

1. Move slider to 10
2. Verify Characteristics tab:
   - [ ] All characteristics increased
   - [ ] Changes positive (green)
   - [ ] Percentages show ~25-30% increase
3. Verify Combat tab:
   - [ ] Wounds increased (~50%)
   - [ ] Armour increased
   - [ ] Both show positive changes (green)

### Test 2: Scale Down to Threat 1

1. Move slider to 1
2. Verify Characteristics tab:
   - [ ] All characteristics decreased
   - [ ] Changes negative (red)
   - [ ] Percentages show negative values
3. Verify Combat tab:
   - [ ] Wounds decreased
   - [ ] Armour decreased
   - [ ] Both show negative changes (red)

### Test 3: Scale to Same Level

1. Click Reset button (or manually set to original)
2. Verify:
   - [ ] All changes show 0
   - [ ] All values neutral (gray)
   - [ ] Percentages show 0%

### Test 4: Cross Multiple Tiers

1. Start with Threat 5 (Minor)
2. Scale to Threat 25 (Boss)
3. Verify:
   - [ ] Tier badge changes: Green → Purple
   - [ ] Large positive changes
   - [ ] Warning banner appears (20 level difference)
   - [ ] All stats significantly increased

## Form Submission Tests

### Test 1: Apply Scaling

1. Change threat level (e.g., 5 → 10)
2. Click "Apply Scaling"
3. Verify:
   - [ ] Dialog closes
   - [ ] Notification appears: "Scaled [NPC Name] from 5 to 10"
   - [ ] NPC sheet updates
   - [ ] New threat level visible in sheet
   - [ ] Stats reflect new values

### Test 2: Cancel

1. Change threat level
2. Click "Cancel"
3. Verify:
   - [ ] Dialog closes
   - [ ] No notification
   - [ ] NPC unchanged
   - [ ] Original threat level preserved

### Test 3: Apply with Options Disabled

1. Uncheck some scaling options
2. Change threat level
3. Apply scaling
4. Verify:
   - [ ] Only checked options scaled
   - [ ] Unchecked options unchanged
   - [ ] Threat level updated

### Test 4: Apply Same Level

1. Don't change threat level
2. Click Apply
3. Verify:
   - [ ] Notification: "No threat level change specified"
   - [ ] Dialog closes
   - [ ] No changes to actor

## Edge Cases

### Test 1: Threat 1 NPC
- [ ] Can scale up
- [ ] Cannot scale below 1
- [ ] -5 and -1 buttons clamp at 1

### Test 2: Threat 30 NPC
- [ ] Can scale down
- [ ] Cannot scale above 30
- [ ] +5 and +1 buttons clamp at 30

### Test 3: Rapid Interactions
1. Rapidly drag slider back and forth
2. Verify:
   - [ ] UI remains responsive
   - [ ] No visual glitches
   - [ ] Preview updates smoothly (debounced)

### Test 4: Multiple Dialogs
1. Open threat scaler for NPC A
2. Open threat scaler for NPC B (different window)
3. Verify:
   - [ ] Both dialogs work independently
   - [ ] Correct NPC info in each
   - [ ] No state cross-contamination

## Styling Tests

### Hover States
- [ ] Preset buttons darken on hover
- [ ] Checkboxes highlight on hover
- [ ] Tab buttons lighten on hover
- [ ] Apply button brightens on hover
- [ ] Table rows highlight on hover

### Responsive Layout
1. Resize dialog wider:
   - [ ] Content scales appropriately
   - [ ] Checkboxes grid adjusts
   - [ ] Table remains readable

2. Resize dialog narrower:
   - [ ] Content wraps appropriately
   - [ ] No horizontal scrolling
   - [ ] All controls accessible

### Color Consistency
- [ ] Gold accent matches system theme ($rt-accent-gold)
- [ ] Text colors use Foundry variables
- [ ] Backgrounds use Foundry variables
- [ ] Borders use Foundry variables
- [ ] Works in both light and dark themes (if applicable)

## Accessibility Tests

### Keyboard Navigation
- [ ] Tab key moves through controls
- [ ] Enter submits form
- [ ] Escape closes dialog
- [ ] Arrow keys adjust slider
- [ ] Space toggles checkboxes

### Screen Reader
- [ ] Form elements have labels
- [ ] Buttons have descriptive text
- [ ] State changes announced

## Performance Tests

### Render Performance
1. Open dialog
2. Measure initial render time
   - [ ] < 100ms

3. Drag slider continuously
4. Measure update frequency
   - [ ] Smooth, no janky animations
   - [ ] Debounced to ~10 updates/second

### Memory
1. Open and close dialog 10 times
2. Verify:
   - [ ] No memory leaks
   - [ ] No orphaned event listeners

## Browser Compatibility

Test in multiple browsers:

### Chrome
- [ ] All features work
- [ ] Slider styled correctly
- [ ] No console errors

### Firefox
- [ ] All features work
- [ ] Slider styled correctly
- [ ] No console errors

### Edge
- [ ] All features work
- [ ] Slider styled correctly
- [ ] No console errors

### Safari (if available)
- [ ] All features work
- [ ] Slider styled correctly
- [ ] No console errors

## Regression Tests

Verify original functionality still works:

1. **NPC Sheet**:
   - [ ] Opens normally
   - [ ] Shows threat level
   - [ ] Chart-line button visible
   - [ ] Button opens threat scaler

2. **Token Context Menu**:
   - [ ] Right-click NPC token
   - [ ] "Scale Threat" option visible
   - [ ] Opens threat scaler

3. **Programmatic Access**:
   ```javascript
   // In console
   const npc = game.actors.getName("Test NPC");
   await NPCThreatScalerDialog.scale(npc);
   ```
   - [ ] Dialog opens
   - [ ] Works correctly

## Bug Hunt

Common issues to check:

- [ ] No JavaScript errors in console
- [ ] No missing images (404s)
- [ ] No missing translations (RT.XXX showing)
- [ ] No style conflicts with other dialogs
- [ ] No z-index issues
- [ ] No cut-off content
- [ ] No unreachable buttons
- [ ] No stuck hover states
- [ ] No incorrect calculations
- [ ] No data loss on cancel

## Sign-Off Checklist

Before marking Phase 5 complete:

- [ ] All visual verification passed
- [ ] All interaction tests passed
- [ ] All preview calculations correct
- [ ] Form submission works
- [ ] Edge cases handled
- [ ] Styling consistent
- [ ] Accessibility acceptable
- [ ] Performance acceptable
- [ ] No regressions
- [ ] Documentation updated
- [ ] Code commented
- [ ] No console errors

## Known Limitations

Document any known issues here:

1. **Not Implemented**: 
   - Bulk scaling (multiple NPCs)
   - Undo functionality
   - Custom presets

2. **By Design**:
   - No animations on value changes (performance)
   - 100ms debounce on slider (prevents spam)
   - Static tier colors (not theme-adaptive)

## Test Results Template

```
Date: _____________
Tester: ___________
Environment: Foundry VTT v___ | System v___
Browser: ___________

Visual Tests:     ☐ Pass  ☐ Fail  Notes: __________
Interaction Tests: ☐ Pass  ☐ Fail  Notes: __________
Preview Tests:     ☐ Pass  ☐ Fail  Notes: __________
Submission Tests:  ☐ Pass  ☐ Fail  Notes: __________
Edge Cases:        ☐ Pass  ☐ Fail  Notes: __________
Styling Tests:     ☐ Pass  ☐ Fail  Notes: __________
Accessibility:     ☐ Pass  ☐ Fail  Notes: __________
Performance:       ☐ Pass  ☐ Fail  Notes: __________
Regression:        ☐ Pass  ☐ Fail  Notes: __________

Overall: ☐ APPROVED  ☐ NEEDS WORK

Issues Found:
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

Sign-off: __________ Date: __________
```
