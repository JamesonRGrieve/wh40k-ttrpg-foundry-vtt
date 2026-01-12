# Rogue Trader VTT - Issue Resolution Plan

## Document Version: 1.0
## Date: 2026-01-10

---

## PREAMBLE (Task-Agnostic Context)

This preamble MUST be included with each task handed off to an agent or developer. It provides critical context for proper implementation.

### System Architecture

| Key | Value |
|-----|-------|
| **System** | Rogue Trader VTT (Warhammer 40K RPG based on Dark Heresy 2e) |
| **System ID** | `rogue-trader` |
| **Foundry Version** | V13+ |
| **Architecture** | dnd5e V13 pattern (DataModel-heavy, slim Documents, ApplicationV2) |
| **Build Command** | `npm run build` (Gulp → dist/) |
| **Entry Point** | `src/module/rogue-trader.mjs` |

### Core Design Principles

1. **NO SHORTCUTS** - All solutions must be complete, well-architected, and maintainable
2. **PRO-REFACTOR** - Legacy code must be migrated/modernized as part of any task touching it
3. **Theming Consistency** - All UI follows the Imperial Gothic theme with proper SCSS variables
4. **ApplicationV2 Pattern** - All sheets use the V13 PARTS system with proper action handlers
5. **DataModel First** - Schema changes happen in DataModels, Documents remain slim

### Key File Locations

| Component | Location |
|-----------|----------|
| **Actor DataModels** | `src/module/data/actor/` |
| **Item DataModels** | `src/module/data/item/` |
| **Actor Sheets** | `src/module/applications/actor/` |
| **Item Sheets** | `src/module/applications/item/` |
| **Templates** | `src/templates/` |
| **SCSS** | `src/scss/` |
| **Compendium Packs** | `src/packs/` |
| **Handlebars Manager** | `src/module/handlebars/handlebars-manager.mjs` |

### Styling Guidelines

```scss
// Colors - Imperial Gothic Theme
$rt-color-gold: #c9a227;
$rt-color-crimson: #8b0000;
$rt-color-success: #2d5016;
$rt-color-failure: #6b1010;

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

### ApplicationV2 Action Handler Pattern

```javascript
// In DEFAULT_OPTIONS.actions
static DEFAULT_OPTIONS = {
  actions: {
    myAction: MySheet.#myAction  // Private static method
  }
};

// Static private method - 'this' is bound to sheet instance
static async #myAction(event, target) {
  const data = target.dataset;
  await this.actor.update({ ... });
}
```

### Template Data Attribute Pattern

```handlebars
{{!-- V2 action handler --}}
<button type="button" data-action="myAction" data-item-id="{{item.id}}">Button</button>

{{!-- Form inputs for auto-submission --}}
<input type="number" name="system.wounds.max" value="{{system.wounds.max}}" />
```

### SCSS Panel Component Pattern

```scss
.rt-panel {
  background: $rt-bg-paper;
  border: 1px solid $rt-border-light;
  border-radius: $rt-radius-lg;
  box-shadow: $rt-shadow-sm;
}

.rt-panel-header {
  display: flex;
  align-items: center;
  padding: $rt-space-sm $rt-space-md;
  background: linear-gradient(180deg, rgba($rt-color-gold, 0.15), rgba($rt-color-gold, 0.05));
}

.rt-panel-body {
  padding: $rt-space-md;
}
```

### Reference Documents

- `AGENTS.md` - Full system documentation
- `resources/RogueTraderInfo.md` - Game rules reference
- `SKILL_TABLE.md` - Authoritative skill type/characteristic mapping

---

## ISSUE CATEGORIES

### Category A: Combat Tab Issues
### Category B: Skills Tab Issues  
### Category C: Talents Tab Issues
### Category D: Equipment Tab Issues

---

## CATEGORY A: COMBAT TAB ISSUES

### Issue A1: Max Wounds/Fate Form Not Submitting

**Severity:** Critical  
**Affected Files:**
- `src/templates/actor/panel/combat-station-panel.hbs`
- `src/module/applications/actor/base-actor-sheet.mjs`
- Possibly `src/module/applications/actor/acolyte-sheet.mjs`

**Problem Description:**
The expandable details panels for Wounds and Fate in the Combat tab contain input fields for Max Wounds and Max Fate, but changes are not being saved. The form submission appears to be completely broken for these specific inputs.

**Root Cause Analysis:**
1. ApplicationV2 with `submitOnChange: true` should auto-submit form changes
2. Possible issues:
   - Inputs may not be inside a `<form>` element
   - Input names may not match the schema path
   - Event propagation may be blocked
   - The expandable panel's visibility toggle may be interfering

**Current Template Structure (combat-station-panel.hbs):**
```handlebars
<div class="rt-panel-details combat_wounds_details" {{hideIfNot (isExpanded 'combat_wounds_details' actor)}}>
  <div class="rt-vital-edit-section">
    <label class="rt-vital-edit-field">
      <span class="rt-vital-edit-label">Max Wounds</span>
      <input type="number" data-dtype="Number" class="rt-vital-edit-input"
             name="system.wounds.max" value="{{system.wounds.max}}" min="1" placeholder="Max" />
    </label>
    ...
  </div>
</div>
```

**Solution Approach:**

1. **Verify Form Wrapper:** Ensure the combat tab template is wrapped in a proper `<form>` element that ApplicationV2 can detect
2. **Check Input Registration:** Ensure inputs have proper `name` attributes and `data-dtype="Number"` 
3. **Debug Event Flow:** Add logging to trace form submission events
4. **Test Input Accessibility:** Verify that hidden/collapsed elements don't prevent form submission

**Tasks:**
- [ ] Audit `combat-station-panel.hbs` for proper form structure
- [ ] Ensure `<form autocomplete="off">` wraps all form content
- [ ] Test that `name="system.wounds.max"` correctly maps to DataModel
- [ ] Check if `hideIfNot` helper interferes with form submission
- [ ] Add explicit form change handler if needed

---

### Issue A2: Mobility Panel Height Too Tall

**Severity:** Low  
**Affected Files:**
- `src/templates/actor/panel/combat-station-panel.hbs` (lines 253-299)
- `src/scss/panels/_combat-station.scss`

**Problem Description:**
The Mobility panel in the Combat tab's vitals column is too tall. The current layout has speed values on separate lines with icons above them.

**Current Layout:**
```
MOBILITY
[icon] [icon] [icon] [icon]
 5m     10m    15m    30m
Half   Full  Charge  Run
```

**Desired Layout:**
- Move the meters value inline with the icon
- Make the speed boxes more compact/slimmer
- Reduce overall panel height

**Solution Approach:**

1. **Template Refactor:** Restructure the `.rt-speed-box` elements to be horizontal inline
2. **SCSS Update:** Create more compact speed display with inline values

**Proposed New Structure:**
```handlebars
<div class="rt-mobility-speeds-inline">
  <div class="rt-speed-inline">
    <i class="fas fa-walking"></i>
    <span class="rt-speed-value">{{system.movement.half}}m</span>
    <span class="rt-speed-label">Half</span>
  </div>
  <!-- ... more speeds ... -->
</div>
```

**Tasks:**
- [ ] Refactor `combat-station-panel.hbs` mobility section (lines 253-299)
- [ ] Update SCSS in `_combat-station.scss` for inline layout
- [ ] Reduce padding and gap values
- [ ] Test on various window sizes

---

### Issue A3: Active Effects Style Mismatch in Vitals Column

**Severity:** Medium  
**Affected Files:**
- `src/templates/actor/panel/combat-station-panel.hbs` (line 302)
- `src/templates/actor/panel/active-effects-panel.hbs`
- `src/scss/panels/_effects.scss`
- Possibly need new combat-specific effects styles

**Problem Description:**
The Active Effects panel included in the Combat tab's vitals column uses the same full-size card-based layout as the Overview tab's `rt-zone-effects`. This doesn't fit the compact vitals HUD aesthetic.

**Solution Approach:**

1. **Create Compact Effects Variant:** Design a more compact effects list for the combat vitals
2. **Match Active Effects Panel Style:** The Overview tab has a cleaner card-based style that should be replicated
3. **Consider Zone Effects Pattern:** Reference `rt-zone-effects` class for styling cues

**Tasks:**
- [ ] Analyze Overview tab's `rt-zone-effects` styling
- [ ] Create a compact variant or update the effects panel to be context-aware
- [ ] Update SCSS to support compact mode in combat vitals
- [ ] Ensure visual consistency with other vitals cards

---

### Issue A4: Move Initiative Action to Combat Actions Panel

**Severity:** Low  
**Affected Files:**
- `src/templates/actor/panel/combat-station-panel.hbs` (lines 335-342)
- `src/templates/actor/panel/combat-actions-panel.hbs`

**Problem Description:**
The Initiative roll action is currently a standalone compact element in the Combat Actions column. It should be moved inside the Combat Actions Panel, under the Utility Actions section.

**Current Location (combat-station-panel.hbs lines 335-342):**
```handlebars
{{!-- Initiative (compact inline) --}}
<div class="rt-initiative-compact">
  <span class="rt-initiative-label">Initiative:</span>
  <span class="rt-init-value">{{system.initiative.total}}</span>
  <button type="button" class="rt-init-roll-btn" data-action="initiative" title="Roll Initiative">
    <i class="fas fa-dice-d20"></i>
  </button>
</div>
```

**Solution Approach:**

1. **Move to combat-actions-panel.hbs:** Add Initiative as a utility action
2. **Remove from combat-station-panel.hbs:** Clean up the standalone element
3. **Style consistently:** Match other utility action buttons

**Tasks:**
- [ ] Add Initiative action to `combat-actions-panel.hbs` utility section
- [ ] Remove standalone initiative element from `combat-station-panel.hbs`
- [ ] Ensure proper action handler wiring
- [ ] Update styling if needed

---

### Issue A5: Weapons Panel Layout - Span Across Columns

**Severity:** Medium  
**Affected Files:**
- `src/templates/actor/panel/combat-station-panel.hbs`
- `src/scss/panels/_combat-station.scss`

**Problem Description:**
The Combat Actions panel is quite long, making the current column layout cramped. The Weapons Arsenal panel should span across both the Vitals and Tactical columns, fitting under their content.

**Current Grid Layout:**
```
| Vitals | Armour | Actions |
|   ...  |  ...   |   ...   |
|--------|--------|---------|
| Weapons (full width below) |
```

**Desired Layout:**
The weapons panel should span the first two columns (Vitals + Tactical/Armour) while Actions remains in the third column, continuing as long as needed.

**Solution Approach:**

1. **Restructure Grid:** Use CSS Grid `grid-column: span 2` for weapons
2. **Move Weapons Panel:** Position it after the 3-column grid content
3. **Alternative:** Nest Vitals/Armour in a sub-grid with weapons below

**Tasks:**
- [ ] Analyze current grid structure in `_combat-station.scss`
- [ ] Implement new grid layout with weapons spanning columns
- [ ] Test responsiveness
- [ ] Ensure actions column remains full-height

---

## CATEGORY B: SKILLS TAB ISSUES

### Issue B1: Skill Type/Characteristic/Descriptor Inconsistency

**Severity:** High  
**Affected Files:**
- `src/module/data/actor/templates/creature.mjs`
- `src/module/data/item/skill.mjs`
- `src/packs/rt-items-skills/_source/*.json`

**Problem Description:**
The Acrobatics skill is showing as Basic in the sheet when it should be Advanced according to `SKILL_TABLE.md`. This indicates a systemic mismatch between:
1. The DataModel schema
2. The compendium pack data
3. The display logic

**Authoritative Reference (SKILL_TABLE.md):**
```markdown
| Skill Name      | Type     | Characteristic | Descriptor              | Is Skill Group |
| --------------- | -------- | -------------- | ----------------------- | -------------- |
| Acrobatics      | Advanced | Agility        | Movement                | false          |
| Awareness       | Basic    | Perception     | Exploration             | false          |
| Blather         | Advanced | Fellowship     | Interaction             | false          |
| Commerce        | Advanced | Fellowship     | —                       | false          |
| Literacy        | Advanced | Intelligence   | —                       | false          |
| Survival        | Advanced | Intelligence   | Exploration             | false          |
...
```

**Current Issues Found:**

1. **DataModel (creature.mjs line 104):** `acrobatics: this.SkillField("Acrobatics", "Ag", true)` - CORRECT (true = Advanced)
2. **Pack Data (acrobatics.json):** `"skillType": "basic", "isBasic": true` - INCORRECT

**Root Cause:** The compendium pack JSON files have incorrect `skillType` and `isBasic` values that don't match the SKILL_TABLE.md specification.

**Solution Approach:**

This is a PRO-REFACTOR task. We need to:

1. **Audit All Pack Files:** Compare every skill JSON against SKILL_TABLE.md
2. **Update SkillData Model:** Ensure `descriptor` field exists and is used
3. **Migrate Pack Data:** Update all incorrect skills
4. **Add Validation:** Create a validation script to prevent future drift

**Tasks:**
- [ ] Create a comprehensive audit of all skill pack files
- [ ] Update `src/module/data/item/skill.mjs` to include `descriptor` field properly
- [ ] Batch update all skill JSON files with correct:
  - `skillType`: "basic" | "advanced" | "specialist"
  - `isBasic`: boolean matching skillType
  - `characteristic`: correct governing characteristic
  - `descriptor`: from SKILL_TABLE.md
- [ ] Update creature.mjs if any discrepancies found
- [ ] Create migration script for existing world data

**Skills Requiring Update (from SKILL_TABLE.md comparison):**

| Skill | Current | Should Be |
|-------|---------|-----------|
| Acrobatics | basic | advanced |
| Blather | needs verification | advanced |
| Commerce | needs verification | advanced |
| Literacy | needs verification | advanced |
| Survival | needs verification | advanced |
| (full audit needed) | | |

---

### Issue B2: Skill Item Sheet Redesign

**Severity:** Medium  
**Affected Files:**
- `src/templates/item/item-skill-sheet-modern.hbs`
- `src/scss/item/_skill-sheet.scss` (may not exist - create)
- `src/module/applications/item/skill-sheet.mjs` (may need creation)
- `src/module/data/item/skill.mjs`

**Problem Description:**
The current Skill item sheet is bland and lacks proper styling/layout. It uses a minimal compact design that doesn't showcase the skill's information effectively.

**Current Template Analysis (item-skill-sheet-modern.hbs):**
- Uses basic `.rt-item-sheet.rt-compact` layout
- Simple inline fields without proper grouping
- Description displayed as raw text, not rich editor
- No visual hierarchy or categorization
- Missing descriptor display
- Specializations only shown conditionally

**DataModel Fields Available (skill.mjs):**
- `identifier`: Slugified identifier
- `characteristic`: Governing characteristic
- `skillType`: basic | advanced | specialist
- `isBasic`: Can be used untrained
- `aptitudes`: Array of aptitudes
- `specializations`: Array for specialist skills
- `descriptor`: Short usage description
- `uses`: HTML field for common uses
- `specialRules`: HTML field
- `exampleDifficulties`: Array of difficulty examples
- `useTime`: Time to use
- `rollConfig`: Default roll settings

**Solution Approach:**

Complete redesign following the Imperial Gothic theme:

1. **Header:** Skill name, type badge, characteristic badge
2. **Properties Panel:** Governing characteristic, skill type, aptitudes
3. **Descriptor Panel:** Short description/purpose
4. **Uses Panel:** Detailed usage with rich text
5. **Difficulties Panel:** Example difficulties table
6. **Special Rules Panel:** Optional special rules
7. **Roll Config Panel:** Default modifiers, untrained penalty

**Proposed Layout:**
```
┌──────────────────────────────────────┐
│ [IMG] Skill Name                     │
│       [Advanced] [Agility] [Movement]│
├──────────────────────────────────────┤
│ PROPERTIES                           │
│ ├─ Characteristic: Agility           │
│ ├─ Type: Advanced                    │
│ ├─ Use Time: Full Action            │
│ └─ Aptitudes: Agility, General       │
├──────────────────────────────────────┤
│ DESCRIPTOR                           │
│ Movement, acrobatic maneuvers...     │
├──────────────────────────────────────┤
│ USES & RULES          [ProseMirror]  │
│ ...                                  │
├──────────────────────────────────────┤
│ DIFFICULTY EXAMPLES                  │
│ ├─ Trivial (+60): Walking            │
│ ├─ Challenging (+0): Somersault      │
│ └─ Hard (-20): Triple flip           │
└──────────────────────────────────────┘
```

**Tasks:**
- [ ] Create new `src/scss/item/_skill-sheet.scss`
- [ ] Completely redesign `item-skill-sheet-modern.hbs`
- [ ] Add descriptor field styling and display
- [ ] Add example difficulties table
- [ ] Ensure scroll works properly
- [ ] Add to Handlebars preload list if needed
- [ ] Create/update SkillSheet application class if needed

---

### Issue B3: ADV Badge Incorrectly Showing on Basic Skills

**Severity:** High  
**Affected Files:**
- `src/templates/actor/panel/skills-panel.hbs`
- `src/module/data/actor/templates/creature.mjs`
- Template logic for skill type display

**Problem Description:**
The "ADV" badge (indicating Advanced skill) is showing on ALL skills in the Skills tab, including Basic skills. Every skill appears as advanced when that is incorrect per the rules.

**Root Cause Analysis:**

1. **DataModel Definition (creature.mjs):** The SkillField factory correctly sets `advanced: true/false`
2. **Display Logic Issue:** The template is likely checking the wrong property or not checking at all
3. **Potential Logic Error:** The condition `{{#if skill.advanced}}` might always be truthy

**Investigation Points:**
- Check `skills-panel.hbs` for the ADV badge condition
- Verify the `advanced` field is being passed correctly in context
- Check if there's a display helper overriding the value

**Solution Approach:**

1. **Template Audit:** Find and fix the ADV badge conditional
2. **Context Verification:** Ensure skills context includes `advanced` boolean correctly
3. **Test Both Types:** Verify Basic skills show no badge, Advanced show ADV

**Tasks:**
- [ ] Locate ADV badge display logic in `skills-panel.hbs`
- [ ] Fix conditional to properly check `skill.advanced === true`
- [ ] Verify context preparation passes correct values
- [ ] Test with known Basic skills (Awareness, Dodge, etc.)
- [ ] Test with known Advanced skills (Medicae, Tech-Use, etc.)

---

## CATEGORY C: TALENTS TAB ISSUES

### Issue C1: Talent/Trait Item Sheets - Navigation & Scroll Broken

**Severity:** High  
**Affected Files:**
- `src/templates/item/item-talent-sheet-modern.hbs`
- `src/templates/item/item-trait-sheet-modern.hbs`
- `src/scss/item/_talent-sheet.scss` (or relevant)
- Possibly sheet application classes

**Problem Description:**
1. The Talent and Trait item sheets are hard to navigate
2. Cannot scroll within the item sheet
3. Layout is not sleek/modern

**Current Template Analysis (item-talent-sheet-modern.hbs):**
- Uses `.rt-item-sheet.rt-talent-sheet` wrapper
- Contains `<form>` with direct panel stacking
- No explicit scrollable container
- Panels include: Properties, Prerequisites, Modifiers, Effect, Description, Notes

**Scroll Issue Root Cause:**
- Missing `overflow-y: auto` on body container
- No max-height set on content area
- Form/body may not be flex layout

**Solution Approach:**

Complete redesign for better UX:

1. **Add Scrollable Content Area:** Wrap panels in scrollable container
2. **Tab Navigation:** Consider adding tabs for complex items
3. **Streamlined Layout:** Group related fields, reduce visual noise
4. **Fixed Header:** Keep item name/image visible while scrolling

**Proposed Structure:**
```html
<div class="rt-item-sheet rt-talent-sheet">
  <form autocomplete="off">
    <!-- FIXED HEADER -->
    <header class="rt-item-header">...</header>
    
    <!-- SCROLLABLE CONTENT -->
    <div class="rt-item-content rt-scrollable">
      <!-- Panels -->
    </div>
  </form>
</div>
```

**Tasks:**
- [ ] Add scrollable container with proper CSS
- [ ] Streamline panel organization
- [ ] Improve visual hierarchy
- [ ] Test scroll behavior
- [ ] Ensure form submission still works
- [ ] Apply same fixes to trait sheet

---

### Issue C2: Clicking Talent/Trait Rows Doesn't Open Item Sheet

**Severity:** High  
**Affected Files:**
- `src/templates/actor/panel/talent-panel.hbs`
- `src/templates/actor/panel/trait-panel.hbs`
- `src/module/applications/actor/base-actor-sheet.mjs`
- `src/module/applications/actor/acolyte-sheet.mjs`

**Problem Description:**
Clicking on talent/trait entries in the Talents tab tables does not open the corresponding item sheet.

**Current Template (talent-panel.hbs):**
```handlebars
<button type="button" class="rt-row-name" data-action="itemEdit" data-item-id="{{talent.id}}" title="Click to open item sheet">
  {{talent.fullName}}
</button>
```

**Action Handler (base-actor-sheet.mjs):**
```javascript
static DEFAULT_OPTIONS = {
  actions: {
    itemEdit: BaseActorSheet.#itemEdit,
    ...
  }
};

static async #itemEdit(event, target) {
  const itemId = target.dataset.itemId;
  const item = this.actor.items.get(itemId);
  if (item) item.sheet.render(true);
}
```

**Investigation Points:**
1. Verify `data-action="itemEdit"` is on the clickable element
2. Check if `data-item-id` is populated with valid ID
3. Verify action handler is registered and working
4. Check for event propagation issues or CSS pointer-events

**Solution Approach:**

1. **Debug Action Binding:** Add logging to verify actions fire
2. **Check Data Attributes:** Ensure item IDs are correctly populated
3. **Verify Handler:** Test itemEdit action manually
4. **CSS Check:** Ensure no overlapping elements block clicks

**Tasks:**
- [ ] Add console logging to `#itemEdit` handler
- [ ] Verify talent/trait context includes valid `id` property
- [ ] Check for CSS issues (z-index, pointer-events)
- [ ] Test action handler independently
- [ ] Fix any binding or data issues found

---

### Issue C3: Vocalize and Delete Buttons Not Working

**Severity:** High  
**Affected Files:**
- `src/templates/actor/panel/talent-panel.hbs`
- `src/templates/actor/panel/trait-panel.hbs`
- `src/module/applications/actor/base-actor-sheet.mjs`

**Problem Description:**
The Vocalize (send to chat) and Delete buttons on talent/trait table rows do not function. Common fixes have not resolved this, suggesting a deeper issue.

**Current Template (talent-panel.hbs):**
```handlebars
<div class="rt-row-actions">
  <button type="button" class="rt-action-btn" data-action="itemVocalize" data-item-id="{{talent.id}}" title="Send to Chat">
    <i class="fas fa-comment"></i>
  </button>
  <button type="button" class="rt-action-btn rt-btn-danger" data-action="itemDelete" data-item-id="{{talent.id}}" title="Delete">
    <i class="fas fa-trash"></i>
  </button>
</div>
```

**Action Handlers (base-actor-sheet.mjs):**
```javascript
actions: {
  itemVocalize: BaseActorSheet.#itemVocalize,
  itemDelete: BaseActorSheet.#itemDelete,
}
```

**Potential Root Causes:**

1. **Action Not Registered:** Actions may not be in DEFAULT_OPTIONS
2. **Handler Error:** Handler may be throwing silently
3. **Event Delegation Issue:** V2 action system may not be finding the target
4. **Context Issue:** `this` binding may be incorrect

**Deep Investigation Required:**

1. Check if actions are in the sheet's merged options
2. Add try/catch with logging to handlers
3. Verify button is direct child of element with form attribute
4. Check if there's a conflicting event listener

**Solution Approach:**

1. **Comprehensive Logging:** Add detailed logging to all item action handlers
2. **Action Registration Audit:** Verify all actions are properly merged
3. **Handler Validation:** Ensure handlers exist and are callable
4. **Event Flow Tracing:** Track event from click to handler

**Tasks:**
- [ ] Add detailed logging to `#itemVocalize` and `#itemDelete`
- [ ] Verify actions appear in sheet's merged DEFAULT_OPTIONS
- [ ] Check for JavaScript errors in browser console
- [ ] Test with simple alert to verify handler fires
- [ ] Audit ApplicationV2 action delegation system
- [ ] Fix root cause (likely action registration or binding)

---

### Issue C4: Talent/Trait Table Layout Broken

**Severity:** Medium  
**Affected Files:**
- `src/templates/actor/panel/talent-panel.hbs`
- `src/templates/actor/panel/trait-panel.hbs`
- `src/scss/panels/_talents.scss`

**Problem Description:**
The table structure of the talents and traits layout is broken. Specific visual issues need investigation.

**Current Structure (talent-panel.hbs):**
```handlebars
<div class="rt-talents-table" data-drop-zone="talents" data-accepts="talent">
  {{#each talents as |talent|}}
  <div class="rt-talent-row item-drag" data-item-id="{{talent.id}}" draggable="true">
    <img class="rt-row-icon" ... />
    <div class="rt-row-main">
      <button class="rt-row-name" ...>{{talent.fullName}}</button>
      <div class="rt-row-meta">...</div>
    </div>
    <div class="rt-row-actions">...</div>
  </div>
  {{/each}}
</div>
```

**Investigation Points:**
1. Check CSS grid/flexbox layout
2. Verify column widths and alignment
3. Check for overflow issues
4. Verify trait grouping structure

**Solution Approach:**

1. **Audit Current CSS:** Review `_talents.scss` for layout rules
2. **Fix Grid/Flex Issues:** Ensure proper layout declarations
3. **Test with Various Content:** Test with long names, many items
4. **Responsive Check:** Verify works at different widths

**Tasks:**
- [ ] Review `_talents.scss` for layout issues
- [ ] Fix any broken CSS grid/flex declarations
- [ ] Ensure consistent row heights
- [ ] Test overflow handling
- [ ] Verify trait grouping CSS

---

## CATEGORY D: EQUIPMENT TAB ISSUES

### Issue D1: Armour Item Sheet - Complete Redesign Required

**Severity:** Critical  
**Affected Files:**
- `src/templates/item/item-armour-sheet-modern.hbs`
- `src/scss/item/_armour-sheet.scss` (needs creation/update)
- `src/module/applications/item/armour-sheet.mjs`

**Problem Description:**
1. Cannot scroll in the armour item sheet
2. The `rt-armour-diagram` covers the entire sheet
3. Layout/design is fundamentally broken

**Current Template Analysis:**
The template has several structural issues:
- Diagram panel may have absolute positioning issues
- No scroll container for content
- Tab system may not be working properly
- Content sections may have z-index problems

**Solution Approach:**

Complete redesign with proper structure:

1. **Fixed Header:** Item name, image, badges
2. **Scrollable Body:** Contains all panels
3. **Compact Diagram:** Visual AP by location (not full-screen)
4. **Tab Navigation:** Protection, Properties, Mods, Description, Effects
5. **Proper Form Handling:** Ensure all inputs work

**Proposed Structure:**
```html
<div class="rt-item-sheet rt-armour-sheet">
  <form autocomplete="off">
    <header class="rt-item-header">
      <!-- Image, name, type badges, equipped toggle -->
    </header>
    
    <div class="rt-item-content rt-scrollable">
      <!-- Compact inline diagram OR tab-based diagram -->
      <div class="rt-armour-diagram-compact">...</div>
      
      <!-- Tab navigation -->
      <nav class="rt-tabs">...</nav>
      
      <!-- Tab content panels -->
      <div class="rt-tab-content">...</div>
    </div>
  </form>
</div>
```

**Tasks:**
- [ ] Create new SCSS file with proper layout
- [ ] Redesign template with scrollable content
- [ ] Make diagram compact and contained
- [ ] Implement working tab system
- [ ] Test all form inputs save correctly
- [ ] Ensure full scrollability

---

### Issue D2: Force Field Item Sheet - Broken Layout

**Severity:** High  
**Affected Files:**
- `src/templates/item/item-force-field-sheet.hbs`
- `src/scss/item/_force-field-sheet.scss` (may need creation)

**Problem Description:**
The Force Field item sheet has a broken layout, specifically the Properties panel is too long, causing layout issues.

**Current Template Analysis (item-force-field-sheet.hbs):**
- Uses `.rt-item-sheet.rt-force-field-sheet` wrapper
- Has `.rt-item-body` as main content area
- Multiple panels stacked vertically
- No explicit scroll handling

**Solution Approach:**

Apply lessons from armour sheet redesign:

1. **Add Scroll Container:** Wrap content in scrollable area
2. **Compact Panel Layout:** Use 2-column grid for properties
3. **Visual Status Display:** Emphasize active/overloaded state
4. **Consistent Styling:** Match other modern item sheets

**Tasks:**
- [ ] Add scrollable content container
- [ ] Redesign properties panel to be more compact
- [ ] Add/update SCSS for proper layout
- [ ] Test at various window sizes
- [ ] Ensure form inputs work correctly

---

### Issue D3: Cybernetic Sheet - Missing modifiers-editor-panel.hbs

**Severity:** Critical  
**Affected Files:**
- `src/templates/item/item-cybernetic-sheet.hbs`
- `src/templates/item/panel/modifiers-editor-panel.hbs` (MISSING)
- `src/module/handlebars/handlebars-manager.mjs`

**Problem Description:**
The Cybernetic item sheet fails to load with error:
```
Error: Failed to render Application "CyberneticSheet-...":
Failed to render template part "sheet":
The partial systems/rogue-trader/templates/item/panel/modifiers-editor-panel.hbs could not be found
```

**Root Cause:**
The template references a partial that either:
1. Does not exist in the filesystem
2. Is not being preloaded by HandlebarManager
3. Has incorrect path

**Current Usage (item-cybernetic-sheet.hbs line 161):**
```handlebars
{{> systems/rogue-trader/templates/item/panel/modifiers-editor-panel.hbs}}
```

**Solution Approach:**

1. **Check if file exists:** Verify the partial exists at the expected path
2. **Create if missing:** Create the modifiers-editor-panel.hbs template
3. **Add to preload:** Ensure HandlebarManager includes it in core templates
4. **Test loading:** Verify cybernetic sheets render correctly

**Tasks:**
- [ ] Check if `src/templates/item/panel/modifiers-editor-panel.hbs` exists
- [ ] If missing, create the template with modifier editing UI
- [ ] Add to HandlebarManager core templates list
- [ ] Test cybernetic sheet rendering
- [ ] Audit other templates for similar missing partial references

---

## IMPLEMENTATION PRIORITY

### Phase 1: Critical Blockers (Do First)
1. **D3:** Cybernetic Sheet Missing Partial - Blocking all cybernetic editing
2. **A1:** Form Submission Broken - Critical functionality
3. **C3:** Buttons Not Working - Deep investigation needed

### Phase 2: High Priority Fixes
4. **B1:** Skill Type Inconsistency - Data integrity issue
5. **B3:** ADV Badge Wrong - Visual correctness
6. **C2:** Item Sheet Click Broken - Core functionality
7. **D1:** Armour Sheet Redesign - Major usability

### Phase 3: Medium Priority Improvements
8. **C1:** Talent/Trait Sheet UX - User experience
9. **C4:** Table Layout Issues - Visual polish
10. **D2:** Force Field Sheet - Usability
11. **A3:** Effects Style Mismatch - Visual consistency
12. **A5:** Weapons Panel Layout - Layout improvement

### Phase 4: Low Priority Polish
13. **A2:** Mobility Panel Height - Visual refinement
14. **A4:** Initiative Move - Organization improvement
15. **B2:** Skill Sheet Redesign - Enhancement

---

## TESTING CHECKLIST

After each fix, verify:

- [ ] Build completes without errors (`npm run build`)
- [ ] Sheet loads without console errors
- [ ] Affected functionality works correctly
- [ ] Form inputs save on change
- [ ] Scroll behavior works
- [ ] Visual styling matches theme
- [ ] No regressions in related features

---

## NOTES FOR AGENTS

1. **Always include the PREAMBLE** when starting a task
2. **Follow the NO SHORTCUTS principle** - complete solutions only
3. **Embrace PRO-REFACTOR** - fix legacy code when touched
4. **Use SCSS variables** - never hardcode colors or spacing
5. **Test form submission** - V2 auto-submit can be tricky
6. **Check Handlebars preload** - missing partials cause hard errors
7. **Verify action handlers** - ensure proper registration and binding
8. **Document changes** - update AGENTS.md if architecture changes
