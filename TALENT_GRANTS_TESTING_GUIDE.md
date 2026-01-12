# Talent Grants System - Testing Guide

## Quick Test Procedure

### Test 1: Basic Talent Grant

**Goal**: Verify that a talent automatically grants another talent.

1. Open Foundry VTT with Rogue Trader system
2. Create a test character or open existing character
3. Open the "rt-items-talents" compendium
4. Find "Credo Omnissiah (Forge World)" talent
5. Drag it to the character's talent tab

**Expected Result**:
- Character receives "Credo Omnissiah (Forge World)" talent
- **Automatically**, character receives "Technical Knock" talent
- Info notification shows: "Credo Omnissiah (Forge World) granted: • Talent: Technical Knock"
- "Technical Knock" has a gold gift badge indicating it was granted
- "Credo Omnissiah (Forge World)" has a "Grants" indicator in its metadata

**Verification**:
- Open "Technical Knock" sheet → check it exists
- Hover over the gift badge → tooltip shows "Granted by Credo Omnissiah (Forge World)"
- Open "Credo Omnissiah (Forge World)" sheet → Effects tab shows Grants section

---

### Test 2: Specialized Talent Grant

**Goal**: Verify that specializations are applied correctly.

1. Find "If It Bleeds, I Can Kill It (Death World)" talent in compendium
2. Drag it to the character's talent tab

**Expected Result**:
- Character receives "If It Bleeds, I Can Kill It (Death World)" talent
- **Automatically**, character receives "Melee Weapon Training (Primitive)" talent
- The specialization "(Primitive)" is correctly applied to the name
- Info notification shows the grant

**Verification**:
- Check "Melee Weapon Training (Primitive)" exists (not just "Melee Weapon Training")
- Verify the gift badge is present

---

### Test 3: Talent with Choice

**Goal**: Verify that special abilities display correctly.

1. Find "Supremely Connected (Noble Born)" talent in compendium
2. Drag it to the character's talent tab

**Expected Result**:
- Character receives "Supremely Connected (Noble Born)" talent
- **Automatically**, character receives "Peer (Nobility)" talent
- Info notification shows the grant
- "Peer (Nobility)" has gift badge

**Verification**:
- Open "Supremely Connected (Noble Born)" sheet
- Go to Effects tab → Grants section
- Verify "Special Abilities" section shows:
  - "Additional Peer Choice"
  - Description about choosing second Peer talent
- Manually add second Peer talent as player choice (system shows reminder, doesn't force choice)

---

### Test 4: Duplicate Prevention

**Goal**: Verify system prevents duplicate grants.

1. Add "Credo Omnissiah (Forge World)" to character (**already added in Test 1**)
2. Delete "Technical Knock" from character
3. Try to add "Credo Omnissiah (Forge World)" again

**Expected Result**:
- Error: "Character already has Credo Omnissiah (Forge World)"
- OR: Talent not added (duplicate talent check by Foundry)

**Alternative Test**:
1. Manually add "Technical Knock" to character
2. Add "Credo Omnissiah (Forge World)"

**Expected Result**:
- "Credo Omnissiah (Forge World)" is added
- System logs: "Talent Technical Knock already exists, skipping grant"
- No duplicate "Technical Knock" created
- No error notification (silent skip)

---

### Test 5: Removal Cascade

**Goal**: Verify optional removal of granted items.

1. Ensure character has "Credo Omnissiah (Forge World)" and granted "Technical Knock"
2. Delete "Credo Omnissiah (Forge World)" from character

**Expected Result**:
- **Confirmation dialog appears** titled "Remove Granted Abilities?"
- Dialog lists: "Technical Knock"
- Dialog asks: "Do you want to remove these granted abilities as well?"
- Two buttons: "Yes" and "No"

**Test 5a: Click "Yes"**
- "Credo Omnissiah (Forge World)" is deleted
- "Technical Knock" is **also deleted**
- Info notification: "Removed 1 granted abilities from Credo Omnissiah (Forge World)"

**Test 5b: Click "No"**
- "Credo Omnissiah (Forge World)" is deleted
- "Technical Knock" **remains** (now independent)
- Gift badge disappears from "Technical Knock" (flags removed)

---

### Test 6: Visual Indicators

**Goal**: Verify all UI elements display correctly.

1. Add talents with grants to character (Tests 1-3)
2. Open character sheet → Talents tab

**Expected Result**:
- **Granted talents** (Technical Knock, Melee Weapon Training, Peer) show gold gift badge
- **Granting talents** (Credo Omnissiah, If It Bleeds, Supremely Connected) show "Grants" indicator in metadata
- Hover over gift badge → tooltip displays source talent name

**Verification**:
- Gift badges are visible and gold-themed
- Grants indicators appear in talent metadata row
- Tooltips work on hover

---

### Test 7: Talent Sheet Display

**Goal**: Verify grants section displays in talent sheets.

1. Open "Credo Omnissiah (Forge World)" sheet
2. Go to **Effects** tab

**Expected Result**:
- "Grants" section appears after "Benefit" section
- Shows icon and header "Grants"
- Displays:
  - **Talents** subheading with book icon
  - List item: "Technical Knock"
- Styled with gold accents and proper layout

**Verification**:
1. Open "Supremely Connected (Noble Born)" sheet
2. Go to Effects tab
3. Verify **two sections**:
   - Talents: "Peer (Nobility)"
   - Special Abilities: "Additional Peer Choice" with description

---

### Test 8: Skill Grants (Future)

**Goal**: Verify skill grants work (when implemented in compendium).

**Manual Test Setup**:
1. Open "Credo Omnissiah (Forge World)" JSON in compendium source
2. Add to grants:
```json
"skills": [
  {
    "name": "Tech-Use",
    "specialization": "",
    "level": "trained"
  }
]
```
3. Rebuild compendium packs: `npm run build`
4. Reload Foundry

**Test**:
1. Create new test character
2. Add "Credo Omnissiah (Forge World)" to character

**Expected Result**:
- Character receives talent
- Character receives "Technical Knock" (existing grant)
- Character's Tech-Use skill is set to **Trained**
- Info notification includes "Skill: Tech-Use (trained)"

**Verification**:
- Open character sheet → Skills tab
- Check Tech-Use has "T" toggle active
- Verify skill test uses trained target number

---

### Test 9: Trait Grants (Future)

**Goal**: Verify trait grants work (when implemented in compendium).

**Manual Test Setup**:
Similar to Test 8, add trait grant to a talent's JSON.

**Test**:
1. Add talent to character

**Expected Result**:
- Trait item created on character
- Gift badge appears on trait
- Info notification includes trait name

---

### Test 10: Console Logging

**Goal**: Verify debug logging works.

1. Open browser console (F12)
2. Enable system debug: `game.rt.debug = true`
3. Perform Tests 1-5 again

**Expected Result**:
- Console shows "Processing grants from talent: [name]"
- Console shows "Granted talent: [name]" for each grant
- Console shows "Granted skill: [name] (level)" for skill grants
- Console shows skipped duplicates

**Verification**:
- No errors in console
- All grants logged with proper details
- Timing shows grants process after item creation

---

## Browser Console Tests

Quick verification commands:

```javascript
// Check if grants utility is loaded
game.rt

// Enable debug logging
game.rt.debug = true

// Get test actor
const actor = game.actors.getName("Test Character")

// Check for talent
const talent = actor.items.find(i => i.name === "Credo Omnissiah (Forge World)")

// Check grants structure
talent?.system?.grants

// Check if talent has grants
talent?.system?.hasGrants

// Check grants summary
talent?.system?.grantsSummary

// Find granted items
actor.items.filter(i => i.flags['rogue-trader']?.autoGranted)
```

---

## Common Issues & Solutions

### Issue: Grants not processing

**Symptoms**: Talent added but no granted items created.

**Check**:
1. Browser console for errors
2. Verify talent has `system.grants` structure
3. Enable debug: `game.rt.debug = true`
4. Check if `hasGrants` returns true: `talent.system.hasGrants`

**Solution**:
- Verify JSON structure matches schema
- Ensure UUID is correct or name fallback works
- Check compendium is unlocked

---

### Issue: Duplicate grants created

**Symptoms**: Multiple copies of granted items.

**Check**:
1. Multiple users connected?
2. Talent added multiple times?
3. Check flags: `item.flags['rogue-trader']?.grantedById`

**Solution**:
- System should prevent this via `existing` check
- If happening, report as bug with steps to reproduce

---

### Issue: Confirmation dialog not showing

**Symptoms**: Talent deleted but no dialog appears.

**Check**:
1. Does talent have grants? `talent.system.hasGrants`
2. Are there granted items? `actor.items.filter(...)`
3. Is user the owner? `game.user.id === userId`

**Solution**:
- Dialog only shows if talent has grants AND granted items exist
- Dialog only shows for user who deleted the item

---

### Issue: Styles not applied

**Symptoms**: Grants section has no styling.

**Check**:
1. SCSS compiled? Run `npm run build`
2. Browser cache cleared? Hard refresh (Ctrl+Shift+R)
3. Check dist/styles/ for compiled CSS

**Solution**:
- Rebuild: `npm run build`
- Clear cache and reload Foundry
- Check for SCSS compilation errors

---

## Performance Testing

### Large Character Test

1. Create character with 50+ talents
2. Add 10 talents that grant items
3. Measure performance:
   - Time to add talent: <500ms
   - Time to show grants: <200ms
   - No lag during grant processing

### Multiple Grants Test

1. Create talent that grants 5+ items
2. Add to character
3. Verify all grants process correctly
4. No timing conflicts or race conditions

### Rapid Operations Test

1. Add 5 talents rapidly (spam drag-drop)
2. All grants should process
3. No duplicate grants created
4. No console errors

---

## Regression Testing

After any code changes, verify:

- [x] Basic talent grants still work (Test 1)
- [x] Specializations still applied (Test 2)
- [x] Duplicate prevention still works (Test 4)
- [x] Removal cascade still works (Test 5)
- [x] UI still displays correctly (Test 6-7)
- [x] No console errors
- [x] No memory leaks (check with Chrome DevTools)

---

## Manual QA Checklist

Before marking as complete:

- [ ] All 10 tests pass
- [ ] No console errors
- [ ] No visual glitches
- [ ] Tooltips work
- [ ] Dialogs display correctly
- [ ] Notifications clear and helpful
- [ ] Performance acceptable (<500ms grant processing)
- [ ] Works in Chrome, Firefox, Edge
- [ ] Works with multiple users connected
- [ ] Documentation accurate and complete

---

**Testing Date**: ___________  
**Tested By**: ___________  
**System Version**: ___________  
**Result**: ☐ Pass  ☐ Fail  ☐ Needs Fixes

**Notes**:
