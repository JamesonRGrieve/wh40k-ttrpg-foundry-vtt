# Origin Path Builder - Fix Implementation Plan

## Overview

This document outlines all standing issues with the Origin Path Builder system and the implementation plan to fix them.

---

## Issue 1: Origin Item Sheet Render Error

**Error:**
```
Uncaught (in promise) TypeError: Cannot read properties of null (reading 'render')
    at Compendium._onClickEntry (foundry.mjs:104257:20)
```

**Root Cause:** The `OriginPathSheet` class extends `ApplicationV2` but doesn't properly implement the sheet interface expected by Foundry's compendium browser.

**Fix:** Update `OriginPathSheet` to properly extend `ItemSheetV2` or ensure it handles the document reference correctly.

**File:** `src/module/applications/item/origin-path-sheet.mjs`

---

## Issue 2: Backward Navigation Logic Broken

**Problem:** When working backward (Career → Homeworld), the chart layout doesn't show correct available choices.

**Root Cause:** The `OriginChartLayout._computeStepLayout()` logic for determining valid origins in backward mode needs fixing. The adjacentStep calculation and connectivity checks are inverted.

**Current Logic (Broken):**
- Forward: previous = stepIndex - 1
- Backward: previous = stepIndex + 1

**Correct Logic:**
When navigating backward, we're selecting steps in reverse order (career first, then motivation, etc.). The "previous" step in navigation order is actually the next step in the array. The connectivity check should verify that the origin we're selecting CAN connect TO the already-selected next step.

**File:** `src/module/utils/origin-chart-layout.mjs`

**Fix Details:**
1. In `_computeStepLayout()`, when `direction === BACKWARD`:
   - For step N, we need to check against selection at step N+1 (already selected)
   - Verify that origin at step N has `connectsTo` that includes the position of selection at N+1

---

## Issue 3: Roll Dialog Re-roll Behavior

**Problem:** When clicking "Re-roll" button, it should return to the initial state where player can choose "Roll For Me" or "I'll Roll Myself". Instead, it just re-rolls automatically.

**Current Behavior:** `#reroll()` clears `rollResult` and re-renders, which correctly shows the initial state.

**Actually Working:** Looking at the code, the reroll handler already sets `this.rollResult = null` and re-renders. This should work correctly. Need to verify in testing.

**File:** `src/module/applications/character-creation/origin-roll-dialog.mjs`

---

## Issue 4: Choice Bonus Tallying

**Problem:** When selecting "Criminal" origin and choosing "Hunted by a Crime Baron", the total bonuses don't show the talent or characteristic bonuses from the granted talents.

**Root Cause:** The Criminal origin's choice grants reference talents by UUID, but those talents themselves have characteristic modifiers. The `_calculatePreview()` method only extracts what's directly in the choice grants, not what the granted talents provide.

**Two-Part Fix:**

### Part A: Update Criminal Pack Data
The "Hunted by a Crime Baron" choice should include the +3 Perception directly in its grants:

```json
{
  "label": "Hunted by a Crime Baron: +3 Perception and Enemy (Underworld)",
  "value": "hunted",
  "grants": {
    "characteristics": {
      "perception": 3
    },
    "talents": [...]
  }
}
```

### Part B: Ensure All Origins Use Consistent Grant Structure
All characteristic bonuses should be in `grants.characteristics` OR `modifiers.characteristics`, not hidden inside referenced talent items.

**Files:**
- `src/packs/rt-items-origin-path/_source/criminal_TKW8s7sCRjsjNgql.json`
- Other origins with similar issues

---

## Issue 5: Special Abilities → Talents Conversion

**Problem:** Some origins use `specialAbilities` array for passive effects that should be talents for proper tracking.

**Origins with specialAbilities to convert:**

| Origin | Special Ability | Action |
|--------|-----------------|--------|
| Calamity | Echo of Hard Times | Convert to talent (Profit Factor -1 effect) |
| Dark Voyage | Things Man Was Not Meant to Know | Already has choice - remove redundant specialAbility |
| Dark Voyage | Marked by Darkness | Convert to talent (1d5 Insanity) |
| Forge World | Starting Skills | Convert to trait or note (skill access) |
| High Vendetta | TBD | Review and convert |
| Press-ganged | TBD | Review and convert |
| Pride | TBD | Review and convert |
| Ship-lorn | TBD | Review and convert |
| Stubjack | Battle-Scarred | Convert to talent (1d5 Insanity) |
| The Hand of War | TBD | Review and convert |
| Vaunted | TBD | Review and convert |

**Process:**
1. Create corresponding talents in `rt-items-talents` pack
2. Update origin JSON to reference new talents
3. Clear `specialAbilities` array

**Files:**
- `src/packs/rt-items-origin-path/_source/*.json` (10 files)
- `src/packs/rt-items-talents/_source/*.json` (new talents)

---

## Issue 6: Biography Tab Origin Panel Redesign

**Problem:** The current origin path panel in the Biography tab needs a complete redesign for a modern, sleek, compact display.

**Current Issues:**
- Visual design is dated
- Doesn't show accumulated bonuses well
- Step indicators could be more intuitive

**New Design Requirements:**
1. Modern, compact layout
2. Visual step indicators (6 icons in a row with connectors)
3. Quick-view of selected origins (icon + name)
4. Collapsible bonus summary section showing:
   - Characteristic totals (chips with +/- values)
   - Skills granted (tags)
   - Talents granted (tags)
   - Traits granted (tags)
   - Wounds/Fate rolled values
5. "Build Path" button to open builder

**Files:**
- `src/templates/actor/acolyte/tab-biography.hbs`
- `src/scss/actor/_biography.scss` (or new `_origin-panel.scss`)

---

## Implementation Order

### Phase 1: Critical Fixes (JavaScript)
1. Fix Origin Item Sheet render error
2. Fix backward navigation logic in OriginChartLayout
3. Verify roll dialog re-roll behavior

### Phase 2: Data Consistency (Pack Data)
1. Update Criminal origin choice grants
2. Audit and fix other origins with missing characteristic bonuses in choices
3. Convert specialAbilities to talents (manual, one-by-one)

### Phase 3: UI Redesign
1. Redesign Biography tab origin panel
2. Update SCSS styling

---

## File Change Summary

| File | Changes |
|------|---------|
| `src/module/applications/item/origin-path-sheet.mjs` | Fix sheet rendering for compendium |
| `src/module/utils/origin-chart-layout.mjs` | Fix backward navigation connectivity |
| `src/module/applications/character-creation/origin-roll-dialog.mjs` | Verify/fix reroll behavior |
| `src/templates/actor/acolyte/tab-biography.hbs` | Redesign origin panel |
| `src/scss/actor/_biography.scss` | Update styling |
| `src/packs/rt-items-origin-path/_source/criminal_*.json` | Add characteristics to choice grants |
| `src/packs/rt-items-origin-path/_source/calamity_*.json` | Convert specialAbilities |
| `src/packs/rt-items-origin-path/_source/dark-voyage_*.json` | Convert specialAbilities |
| `src/packs/rt-items-origin-path/_source/forge-world_*.json` | Convert specialAbilities |
| `src/packs/rt-items-origin-path/_source/stubjack_*.json` | Convert specialAbilities |
| + 6 more origin files | Convert specialAbilities |

---

## Testing Checklist

- [ ] Open origin path item from compendium (no render error)
- [ ] Build path forward (homeworld → career) - connectivity works
- [ ] Build path backward (career → homeworld) - connectivity works
- [ ] Select Criminal origin, choose "Hunted by a Crime Baron" - see +3 Per in preview
- [ ] Roll wounds/fate, click re-roll, see initial options again
- [ ] Complete full origin path, see all bonuses in Biography tab
- [ ] Commit origin path to character, verify all grants applied
