# Rogue Trader VTT - Bug Fix & Enhancement Plan

## Document Purpose
This document outlines the comprehensive plan to fix identified bugs and implement enhancements across multiple tabs of the Rogue Trader VTT character sheet system. Each task is structured with a preamble containing essential context that agents need to complete the work correctly.

---

## Universal Preamble (Include with Every Task)

### Project Context
- **System ID**: `rogue-trader`
- **Foundry Version**: V13+
- **Architecture**: dnd5e V13 pattern (DataModel-heavy, slim Documents, ApplicationV2)
- **Build Command**: `npm run build` (Gulp → dist/) - DO NOT RUN BUILD, user will test manually

### Key File Locations
| Component | Location |
|-----------|----------|
| Data Models | `src/module/data/actor/` and `src/module/data/item/` |
| Documents | `src/module/documents/` |
| ApplicationV2 Sheets | `src/module/applications/actor/` |
| Templates | `src/templates/` |
| SCSS Styles | `src/scss/` |
| Handlebars Helpers | `src/module/handlebars/handlebars-helpers.mjs` |
| Handlebars Manager | `src/module/handlebars/handlebars-manager.mjs` |
| Config | `src/module/config.mjs` |

### Architecture Pattern
```
DataModels (heavy) → Documents (slim) → ApplicationV2 Sheets (medium)
```

### SCSS Variables (use these for styling)
```scss
// Colors - Imperial Gothic Theme
$rt-color-gold: #c9a227;
$rt-color-crimson: #8b0000;
$rt-color-success: #2d5016;
$rt-color-failure: #6b1010;

// Backgrounds
$rt-bg-paper: rgba(30, 25, 20, 0.9);
$rt-bg-input: rgba(0, 0, 0, 0.3);

// Typography
$rt-font-display: 'Cinzel', serif;
$rt-font-heading: 'IM Fell DW Pica', serif;
$rt-font-body: 'Lusitana', serif;
$rt-font-ui: 'Roboto', sans-serif;

// Spacing Scale
$rt-space-xs: 4px;
$rt-space-sm: 8px;
$rt-space-md: 12px;
$rt-space-lg: 16px;
$rt-space-xl: 24px;
```

### ApplicationV2 Action Pattern
```javascript
static DEFAULT_OPTIONS = {
  actions: {
    myAction: MySheet.#myAction
  }
};

// Static private method - 'this' bound to sheet instance
static async #myAction(event, target) {
  const data = target.dataset;
  await this.actor.update({ ... });
}
```

### Template Data Attributes
```handlebars
{{!-- V2 action handler --}}
<button data-action="actionName" data-field="system.field.path">Button</button>

{{!-- Stat adjustment --}}
<button data-action="increment" data-field="system.wounds.value">+</button>
```

### Handlebars Helper Registration
All helpers are registered in `src/module/handlebars/handlebars-helpers.mjs` in the `registerHandlebarsHelpers()` function.

---

## Task 1: Fix Max Wounds/Fate Not Registering (Combat Tab)

### Problem
The Max Wounds and Max Fate inputs in the Combat Tab's expandable sections don't register changes. The inputs appear to be broken.

### Root Cause Analysis
The input fields in `combat-station-panel.hbs` have a conditional `disabled` attribute that prevents them from saving when the panel is collapsed:
```handlebars
{{#unless (isExpanded 'combat_wounds_details' actor)}}disabled{{/unless}}
```

However, when expanded, the inputs should work. The issue is likely that:
1. The inputs don't have proper `data-dtype="Number"` attributes
2. Form submission isn't being triggered properly
3. The field path may be incorrect

### Files to Modify
- `src/templates/actor/panel/combat-station-panel.hbs` (lines 76-110, 219-242)

### Solution
1. Ensure all input fields have proper `data-dtype="Number"` attribute
2. Remove the `disabled` conditional OR move it to a CSS-based approach
3. Verify field names match the schema: `system.wounds.max`, `system.wounds.value`, `system.fate.max`, `system.fate.value`

### Verification
- Open Combat tab
- Expand Wounds section
- Change Max Wounds value
- Verify the change persists after closing/reopening the sheet

---

## Task 2: Add Plus/Minus Buttons to Fatigue Panel (Combat Tab)

### Problem
The Fatigue section in the Combat Tab's Vitals column lacks +/- buttons for quick adjustment, unlike Wounds and Fate which have them.

### Files to Modify
- `src/templates/actor/panel/combat-station-panel.hbs` (lines 116-180)

### Solution
Add increment/decrement buttons to the Fatigue vital stat section, matching the pattern used for Wounds:

```handlebars
<div class="rt-vital-controls">
    <button type="button" class="rt-vital-ctrl-btn" data-action="decrement" data-field="system.fatigue.value" data-min="0" title="Decrease">
        <i class="fas fa-minus"></i>
    </button>
    <button type="button" class="rt-vital-ctrl-btn" data-action="increment" data-field="system.fatigue.value" title="Increase">
        <i class="fas fa-plus"></i>
    </button>
</div>
```

### Verification
- Open Combat tab
- Use +/- buttons on Fatigue
- Verify fatigue value changes and fatigue bolt indicators update

---

## Task 3: Reduce Left Column Width (Combat Tab)

### Problem
The left column (Vitals HUD) in the Combat tab is too wide.

### Files to Modify
- `src/scss/panels/_combat-station.scss` (or relevant SCSS file for combat tab)

### Solution
Find the `.rt-combat-grid` or `.rt-combat-vitals` class and reduce the width. Change from current (likely ~300px or 30%) to approximately 250px or 25%.

Look for grid-template-columns or similar width definitions.

### Verification
- Open Combat tab
- Verify left column is narrower while still displaying all vitals legibly

---

## Task 4: Move Movement Speeds to Vitals Column (Combat Tab)

### Problem
The nice-looking `rt-mobility-speeds` visual (4 boxes: Half/Full/Charge/Run with colored icons) should be in the Vitals column instead of the current movement panel on the right.

### Reference
- Good visual: `src/templates/actor/panel/movement-panel-full.hbs` → `.rt-mobility-speeds` section
- Current compact: `src/templates/actor/panel/movement-panel-compact.hbs` → `.rt-movement-modern-compact`

### Files to Modify
- `src/templates/actor/panel/combat-station-panel.hbs`
- `src/scss/panels/_combat-station.scss` (for styling)

### Solution
1. Add the mobility speeds section to the Vitals column (after Fate section)
2. Use the same markup structure as `.rt-mobility-speeds` from `movement-panel-full.hbs`
3. Style as 4 compact squares matching the vitals aesthetic
4. Remove the `{{> movement-panel-compact.hbs}}` partial from the right column

### Verification
- Open Combat tab
- Verify 4 movement speed boxes appear in the Vitals column
- Verify they have the colored icon styling
- Verify the old movement panel on the right is removed

---

## Task 5: Add Active Effects Panel to Vitals Column (Combat Tab)

### Problem
The Active Effects panel (rt-zone-effects) from Overview tab should also appear in the Combat tab's Vitals column.

### Files to Modify
- `src/templates/actor/panel/combat-station-panel.hbs`

### Solution
Add the active effects panel partial to the Vitals column:
```handlebars
{{> systems/rogue-trader/templates/actor/panel/active-effects-panel.hbs}}
```

Position it at the bottom of the vitals column, after the movement speeds.

### Verification
- Open Combat tab
- Verify Active Effects panel appears in the Vitals column
- Verify effects can be toggled, edited, and deleted

---

## Task 6: Remove Old Movement Panel from Right Column (Combat Tab)

### Problem
The old movement panel on the right side should be removed after movement speeds are added to vitals.

### Files to Modify
- `src/templates/actor/panel/combat-station-panel.hbs` (line 292)

### Solution
Remove the line:
```handlebars
{{> systems/rogue-trader/templates/actor/panel/movement-panel-compact.hbs}}
```

### Verification
- Open Combat tab
- Verify no duplicate movement information appears

---

## Task 7: Remove Favorites and Always Expand Combat Actions (Combat Tab)

### Problem
- The favorites system for combat actions should be removed
- The combat actions panel should always be expanded, showing all actions

### Files to Modify
- `src/templates/actor/panel/combat-actions-panel.hbs`
- `src/scss/panels/_combat-actions.scss` (if needed)

### Solution
1. Remove the collapsed/favorites view (lines 13-63)
2. Remove the collapsible behavior from the panel header
3. Remove the favorite toggle buttons from each action
4. Show all action groups unconditionally (Attack, Movement, Reactions, Utility)
5. Remove `{{hideIfNot (isExpanded 'combat_actions_details' actor)}}` from the details section

### Verification
- Open Combat tab
- Verify all combat actions are visible immediately
- Verify no favorite stars or expand/collapse chevron

---

## Task 8: Fix Combat Actions Warning (Combat Tab)

### Problem
Console warning: `[RT] Combat actions not found in context.dh, using ROGUE_TRADER directly`

### Files to Modify
- `src/module/applications/actor/acolyte-sheet.mjs` (line 327-333)
- `src/module/config.mjs` (verify combatActions is properly exported)

### Solution
1. Verify that `CONFIG.rt.combatActions` is properly populated during init
2. Ensure the config is registered before sheets are rendered
3. Either fix the timing issue or remove the warning if using ROGUE_TRADER directly is acceptable

### Verification
- Open character sheet
- Check console for no warnings about combat actions

---

## Task 9: Remove Blue/Yellow Stars from Skills (Skills Tab)

### Problem
The blue/yellow favorite stars next to skill labels should be removed. Font styling has also become inconsistent.

### Files to Modify
- `src/templates/actor/panel/skills-panel.hbs`
- `src/templates/actor/panel/skills-specialist-panel.hbs`
- `src/scss/panels/_skills.scss`

### Solution
1. Remove the favorite button elements from both panels:
```handlebars
<button type="button" class="rt-favorite-btn ...">
    <i class="{{#if entry.[1].isFavorite}}fas{{else}}far{{/if}} fa-star"></i>
</button>
```
2. Remove associated CSS for `.rt-favorite-btn`
3. Ensure font styling uses consistent `$rt-font-body` or `$rt-font-ui` per the design system

### Verification
- Open Skills tab
- Verify no stars appear next to skill names
- Verify fonts are consistent across all skills

---

## Task 10: Add Visual Indicator for Advanced Skills (Skills Tab)

### Problem
Advanced skills need a visual indicator to distinguish them from Basic skills. The data model already has this information (`advanced: true`), but it's not being displayed.

### Reference
Per SKILL_TABLE.md, advanced skills include:
- Acrobatics, Blather, Chem-Use, Commerce, Demolition, Interrogation, Invocation, Literacy, Medicae, Psyniscience, Security, Shadowing, Sleight of Hand, Survival, Tracking, Wrangling
- All specialist skill groups (Ciphers, Common Lore, Drive, Forbidden Lore, Navigation, Performer, Pilot, Scholastic Lore, Secret Tongue, Speak Language, Tech-Use, Trade)

### Files to Modify
- `src/templates/actor/panel/skills-panel.hbs`
- `src/templates/actor/panel/skills-specialist-panel.hbs`
- `src/scss/panels/_skills.scss`

### Solution
1. The template already has `{{#if entry.[1].advanced}} rt-skill-row--advanced{{/if}}` class
2. Add CSS styling for `.rt-skill-row--advanced`:
   - Different background color (subtle)
   - Optional badge or icon indicator
   - Consider a small "ADV" label or icon

3. Verify the `advanced` flag is being passed correctly from the data model to the template

### Verification
- Open Skills tab
- Verify Acrobatics shows as Advanced
- Verify Awareness shows as Basic (no indicator)
- All skills match SKILL_TABLE.md classification

---

## Task 11: Audit and Fix Skills Against SKILL_TABLE.md (Skills Tab + Data Model + Packs)

### Problem
Skills in the data model and compendium packs may not match SKILL_TABLE.md. Need to verify Type, Characteristic, Descriptor, and IsSkillGroup for all skills.

### Reference: SKILL_TABLE.md
```
| Skill Name      | Type     | Characteristic | Descriptor              | Is Skill Group |
| Acrobatics      | Advanced | Agility        | Movement                | false          |
| Awareness       | Basic    | Perception     | Exploration             | false          |
| Barter          | Basic    | Fellowship     | Interaction             | false          |
| Blather         | Advanced | Fellowship     | Interaction             | false          |
| Carouse         | Basic    | Toughness      | —                       | false          |
| Charm           | Basic    | Fellowship     | Interaction             | false          |
| Chem-Use        | Advanced | Intelligence   | Crafting, Investigation | false          |
| Ciphers         | Advanced | Intelligence   | —                       | true           |
| Climb           | Basic    | Strength       | Movement                | false          |
| Commerce        | Advanced | Fellowship     | —                       | false          |
| Command         | Basic    | Fellowship     | Interaction             | false          |
| Common Lore     | Advanced | Intelligence   | Investigation           | true           |
| Concealment     | Basic    | Agility        | —                       | false          |
| Contortionist   | Basic    | Agility        | Movement                | false          |
| Deceive         | Basic    | Fellowship     | Interaction             | false          |
| Demolition      | Advanced | Intelligence   | Crafting                | false          |
| Disguise        | Basic    | Fellowship     | —                       | false          |
| Dodge           | Basic    | Agility        | —                       | false          |
| Drive           | Advanced | Agility        | Operator                | true           |
| Evaluate        | Basic    | Intelligence   | Investigation           | false          |
| Forbidden Lore  | Advanced | Intelligence   | Investigation           | true           |
| Gamble          | Basic    | Intelligence   | —                       | false          |
| Inquiry         | Basic    | Fellowship     | Investigation           | false          |
| Interrogation   | Advanced | Willpower      | Investigation           | false          |
| Intimidate      | Basic    | Strength       | Interaction             | false          |
| Invocation      | Advanced | Willpower      | —                       | false          |
| Literacy        | Advanced | Intelligence   | —                       | false          |
| Logic           | Basic    | Intelligence   | Investigation           | false          |
| Medicae         | Advanced | Intelligence   | —                       | false          |
| Navigation      | Advanced | Intelligence   | Exploration             | true           |
| Performer       | Advanced | Fellowship     | —                       | true           |
| Pilot           | Advanced | Agility        | Operator                | true           |
| Psyniscience    | Advanced | Perception     | —                       | false          |
| Scholastic Lore | Advanced | Intelligence   | Investigation           | true           |
| Scrutiny        | Basic    | Perception     | —                       | false          |
| Search          | Basic    | Perception     | Exploration             | false          |
| Secret Tongue   | Advanced | Intelligence   | —                       | true           |
| Security        | Advanced | Agility        | Exploration             | false          |
| Shadowing       | Advanced | Agility        | —                       | false          |
| Silent Move     | Basic    | Agility        | Movement                | false          |
| Sleight of Hand | Advanced | Agility        | —                       | false          |
| Speak Language  | Advanced | Intelligence   | —                       | true           |
| Survival        | Advanced | Intelligence   | Exploration             | false          |
| Swim            | Basic    | Strength       | Movement                | false          |
| Tech-Use        | Advanced | Intelligence   | Exploration             | true           |
| Tracking        | Advanced | Intelligence   | Exploration             | false          |
| Trade           | Advanced | Intelligence   | Crafting, Exploration   | true           |
| Wrangling       | Advanced | Intelligence   | —                       | false          |
```

### Files to Modify
- `src/module/data/actor/templates/creature.mjs` (skill definitions)
- `src/packs/rt-items-skills/_source/*.json` (skill item packs)

### Current Data Model (from creature.mjs lines 103-158):
Some skills need verification/correction:
- `acrobatics`: Should be Advanced=true ✓ (line 104)
- Need to verify all skills match the table

### Solution
1. Audit each skill in creature.mjs against SKILL_TABLE.md
2. Correct any mismatched Type (advanced/basic), Characteristic, or IsSkillGroup
3. Update pack JSON files if they exist with incorrect data
4. Remove any skills that shouldn't exist (already removed: lipReading per line 262)

### Verification
- Create a new character
- Verify all skills have correct Type and Characteristic
- Advanced skills should show with visual indicator

---

## Task 12: Fix Talents/Traits Table Layout (Talents Tab)

### Problem
The table structure for talents and traits layout is broken.

### Files to Modify
- `src/templates/actor/acolyte/tab-talents.hbs`
- `src/templates/actor/panel/talent-panel.hbs`
- `src/templates/actor/panel/trait-panel.hbs`
- `src/scss/panels/_talents.scss` and `_traits.scss`

### Solution
1. Inspect the current grid/flexbox layout
2. Fix the 2-column layout: `rt-talents-grid--2col`
3. Ensure talent rows have proper alignment
4. Fix trait grouping display

### Verification
- Open Talents tab
- Verify two-column layout works
- Talents table displays properly on left
- Traits grouped by category display properly on right

---

## Task 13: Register Missing `signedNumber` Handlebars Helper

### Problem
Error when opening Talent/Trait/Origin Path sheets:
```
Missing helper: "signedNumber"
```

The templates use `{{signedNumber this}}` but the helper is not registered.

### Files to Modify
- `src/module/handlebars/handlebars-helpers.mjs`

### Solution
Add the `signedNumber` helper to `registerHandlebarsHelpers()`:

```javascript
/**
 * Format a number with a + or - sign
 * Usage: {{signedNumber 5}} → "+5", {{signedNumber -3}} → "-3"
 */
Handlebars.registerHelper('signedNumber', function(value) {
    const num = Number(value) || 0;
    if (num >= 0) return `+${num}`;
    return `${num}`;
});
```

### Verification
- Open a Talent item sheet
- Verify modifiers display with proper +/- signs
- Open a Trait item sheet - verify same
- Open an Origin Path item sheet - verify same

---

## Task 14: Redesign Armour Item Sheet (Equipment Tab)

### Problem
The Armour Item sheet has layout issues:
- Cannot scroll
- The `rt-armour-diagram` covers the whole sheet
- Overall design/layout is broken

### Files to Modify
- `src/templates/item/item-armour-sheet-modern.hbs`
- `src/scss/item/_armour-sheet.scss` (or create if doesn't exist)

### Solution
1. Add proper scroll container to the sheet body
2. Fix the armour diagram positioning (should be a section, not cover everything)
3. Restructure layout:
   - Header (fixed)
   - Body diagram (fixed or scrollable based on space)
   - Tab content (scrollable)
4. Ensure proper z-index layering
5. Add `overflow-y: auto` to appropriate container

### Reference Structure
```
.rt-armour-sheet
  header.rt-armour-header (fixed)
  .rt-armour-diagram (fixed height, constrained)
  .rt-armour-coverage-bar
  nav.rt-armour-tabs
  section.rt-armour-content (scrollable)
    .rt-armour-panel[data-tab]
```

### Verification
- Open an Armour item
- Verify all sections are visible
- Verify scrolling works when content exceeds viewport
- Verify tabs switch properly

---

## Task 15: Redesign Force Field Item Sheet (Equipment Tab)

### Problem
Force Field sheet has a broken layout because the properties panel is too long.

### Files to Modify
- `src/templates/item/item-force-field-sheet.hbs`
- `src/scss/item/_force-field-sheet.scss` (create if needed)

### Solution
Take design inspiration from the Armour sheet structure:
1. Add scrollable body container
2. Organize panels into logical groups
3. Consider a tabbed interface like Armour if content is extensive
4. Or use collapsible panels to save space

### Suggested Structure
```
.rt-force-field-sheet
  header (with status badge)
  .rt-item-body (scrollable)
    Panel: Core Properties (Protection Rating, Overload)
    Panel: Physical Properties (Weight, Availability)
    Panel: Description
    Panel: Effects (if applicable)
```

### Verification
- Open a Force Field item
- Verify all fields are accessible
- Verify scrolling works
- Verify status badge updates properly

---

## Task 16: Redesign Cybernetic Item Sheet (Equipment Tab)

### Problem
Cybernetic sheet is broken in design/layout. Data model may also need updating.

### Files to Modify
- `src/templates/item/item-cybernetic-sheet.hbs`
- `src/module/data/item/cybernetic.mjs` (if data model needs updating)
- `src/scss/item/_cybernetic-sheet.scss` (create if needed)

### Current Data Model Fields (to verify)
- name, img
- source, weight
- availability, craftsmanship
- equipped
- hasArmourPoints, armourPoints (by location)
- description

### Solution
1. Redesign template following the Armour sheet pattern
2. Verify data model has all needed fields for cybernetics:
   - Location/slot (where implanted)
   - Modifiers (stat bonuses)
   - Requirements
   - Malfunction chance (optional)
3. Add proper scrolling and panel structure

### Suggested Structure
```
.rt-cybernetic-sheet
  header (with equipped toggle)
  .rt-item-body (scrollable)
    Panel: Implant Properties (slot, requirements)
    Panel: Stat Modifiers (if any)
    Panel: Physical Properties (weight, availability)
    Panel: Armour (if hasArmourPoints)
    Panel: Description
    Panel: Effects
```

### Verification
- Open a Cybernetic item
- Verify all fields are editable
- Verify layout is clean and scrollable
- Verify equipped toggle works

---

## Task 17: Fix Origin Path Panel Update on Drop (Biography Tab)

### Problem
The Origin Path panel doesn't update when drag-and-dropping an origin path item.

### Files to Modify
- `src/module/applications/actor/acolyte-sheet.mjs`
- `src/module/applications/actor/base-actor-sheet.mjs` (if drop handler is there)

### Solution
1. Find the drop handler for origin path items
2. Ensure it triggers a re-render of the biography part after drop
3. Or ensure the item creation triggers proper reactivity

Look for `_onDrop`, `_onDropItem`, or similar methods.

### Verification
- Open Biography tab
- Drag an Origin Path from compendium
- Drop on appropriate step
- Verify the panel updates immediately to show the dropped item

---

## Task Summary Checklist

### Combat Tab
- [ ] Task 1: Fix Max Wounds/Fate input registration
- [ ] Task 2: Add +/- buttons to Fatigue panel
- [ ] Task 3: Reduce left column width
- [ ] Task 4: Move movement speeds to Vitals column
- [ ] Task 5: Add Active Effects panel to Vitals column
- [ ] Task 6: Remove old Movement panel from right column
- [ ] Task 7: Remove favorites and always expand Combat Actions
- [ ] Task 8: Fix combat actions warning

### Skills Tab
- [ ] Task 9: Remove blue/yellow stars from skills
- [ ] Task 10: Add visual indicator for Advanced skills
- [ ] Task 11: Audit skills against SKILL_TABLE.md

### Talents Tab
- [ ] Task 12: Fix talents/traits table layout
- [ ] Task 13: Register missing `signedNumber` helper

### Equipment Tab (Item Sheets)
- [ ] Task 14: Redesign Armour item sheet
- [ ] Task 15: Redesign Force Field item sheet
- [ ] Task 16: Redesign Cybernetic item sheet

### Biography Tab
- [ ] Task 17: Fix Origin Path panel update on drop

---

## Priority Order (Suggested)

### Critical (Blocking Functionality)
1. Task 1: Fix Max Wounds/Fate
2. Task 13: Register `signedNumber` helper (breaks item sheets)

### High (Major UX Issues)
3. Task 11: Skills audit (data correctness)
4. Task 14: Armour sheet redesign
5. Task 17: Origin Path drop update

### Medium (Enhancements)
6. Task 2: Fatigue +/- buttons
7. Task 4: Movement speeds to Vitals
8. Task 7: Combat actions always expanded
9. Task 10: Advanced skills indicator
10. Task 12: Talents/traits layout

### Low (Polish)
11. Task 3: Left column width
12. Task 5: Active Effects in Vitals
13. Task 6: Remove old Movement panel
14. Task 8: Combat actions warning
15. Task 9: Remove favorite stars
16. Task 15: Force Field sheet
17. Task 16: Cybernetic sheet
