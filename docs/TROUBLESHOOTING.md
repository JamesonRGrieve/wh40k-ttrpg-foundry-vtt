# Current Issues - Troubleshooting Guide

## Editor Crashes (NPC & Talent Sheets)

**Error**: "Cannot read properties of undefined (reading 'hash')"

**Status**: Templates have been fixed with `content=` prefix added to all `{{editor}}` helpers.

**Action Required**: **Restart Foundry VTT**

The template files have been corrected, but Foundry caches compiled templates. You need to:

1. Close Foundry completely
2. Restart Foundry
3. Test the NPC and talent sheets again

If the error persists after restart, check the browser console for the exact line causing the error.

---

## Specialist Skills Panel (0 Height Issue)

**Reported**: Panel collapses to 0 height when adding specialist skills

**Investigation Results**:

-   Template structure is correct (`skills-specialist-panel.hbs`)
-   CSS is correct (`min-height: 40px`, `display: block`)
-   Update logic is correct (`base-actor-sheet.mjs` lines 1644-1705)

**Likely Causes**:

1. ApplicationV2 PART not re-rendering after actor update
2. Cached template
3. Data flow issue with `skillLists.specialist` context

**Debugging Steps**:

1. Open browser console (F12)
2. Add a specialist skill
3. Check console for errors
4. Inspect the `.rt-specialist-entries` element to see if it has height
5. Check if `entry.[1].entries.length` is truthy after adding

**Potential Fix**: Force a full sheet re-render after adding specialist skill by calling `this.render()` instead of relying on actor update trigger.

---

## Specialist Skill Dialog Dropdown

**Reported**: Clicking skill from dropdown doesn't show up properly (style/layout issue)

**Investigation Results**:

-   Dialog template looks correct (`add-speciality-prompt.hbs`)
-   SCSS styling is proper (`_dialogs.scss` lines 1424-1514)

**Likely Causes**:

1. Dropdown value not being read correctly
2. Dialog not closing after selection
3. CSS selector specificity issue

**Debugging Steps**:

1. Open specialist skill dialog
2. Inspect the `<select id="speciality-name">` element
3. Check if selecting an option triggers the dropdown change
4. Check console for errors when clicking "Add"

**Note**: The dropdown selection should work via `addSpecialistSkill` action on line 1660-1665 of `base-actor-sheet.mjs`. It resets the dropdown after selection (line 1665).

---

## Recommended Actions

1. **Restart Foundry** - This should fix the editor crashes
2. **Test each issue** with browser console open (F12)
3. **Report specific errors** from console if issues persist
4. **Check if skill data is actually being saved** - Open actor JSON and verify `system.skills.[skillname].entries` array

If issues persist after restart, we'll need to add debug logging to the JavaScript handlers.
