# Rogue Trader VTT - Sheet Improvements Task Plan V2

> **Created**: 2026-01-10
> **Purpose**: Plan and track UI/UX improvements across character sheet tabs

---

## Preamble (Context for Each Task)

This section should be included as context for each individual task to ensure consistency.

### Architecture Overview
- **Framework**: Foundry VTT V13 ApplicationV2 with PARTS system
- **Sheet Class**: `AcolyteSheet` (src/module/applications/actor/acolyte-sheet.mjs, ~1740 lines)
- **Base Class**: `BaseActorSheet` with 8 mixins stacked on ActorSheetV2
- **Templates**: `src/templates/actor/acolyte/` (tab templates) and `src/templates/actor/panel/` (reusable panels)
- **Styles**: `src/scss/panels/` (panel-specific styles) and `src/scss/components/` (shared components)

### Template Parts Structure
```
PARTS = {
  header, tabs, overview, status, combat, skills, talents, equipment, powers, dynasty, biography
}
```

### Design System Variables (src/scss/abstracts/_variables.scss)
```scss
// Spacing
$rt-space-xs: 4px;
$rt-space-sm: 8px;
$rt-space-md: 12px;
$rt-space-lg: 16px;
$rt-space-xl: 24px;

// Colors
$rt-accent-gold: #d4a520;        // Primary accent
$rt-accent-combat: #a82020;      // Combat/danger (wounds)
$rt-accent-skills: #2a7a9a;      // Skills
$rt-accent-talents: #a07818;     // Talents
$rt-accent-equipment: #3a5f5f;   // Equipment
$rt-accent-powers: #6a2090;      // Powers

// Fate color should be BLUE: #3498db

// Degree colors (corruption/insanity)
$rt-degree-pure: #22c55e;        // 0-9 points
$rt-degree-tainted: #eab308;     // 10-19 points
$rt-degree-soiled: #f97316;      // 20-29 points
$rt-degree-debased: #ef4444;     // 30-39 points
$rt-degree-profane: #dc2626;     // 40-49 points
$rt-degree-damned: #7f1d1d;      // 50+ points
```

### Action Handler Pattern (ApplicationV2)
```javascript
static DEFAULT_OPTIONS = {
  actions: {
    actionName: ClassName.#actionHandler
  }
};

static async #actionHandler(event, target) {
  // 'this' is bound to sheet instance
  const itemId = target.dataset.itemId || target.closest("[data-item-id]")?.dataset.itemId;
  // ...
}
```

### Template Action Binding (IMPORTANT)
```handlebars
{{!-- NEW V2 PATTERN - use data-action with data-item-id directly on element --}}
<button data-action="itemDelete" data-item-id="{{item.id}}">Delete</button>

{{!-- OLD LEGACY PATTERN - uses class-based handlers via _onRender --}}
<button class="item-delete" data-item-id="{{item.id}}">Delete</button>
```

The new V2 pattern requires `data-item-id` directly on the button, not on a parent element!

### Expandable Panel Pattern
```handlebars
{{!-- Header with toggle --}}
<div class="rt-panel-header rt-panel-header--clickable sheet-control__hide-control"
     data-toggle="panel_key"
     title="Click to expand/collapse">
    <span class="rt-panel-title">Title</span>
    <i class="fas fa-chevron-down rt-panel-chevron {{#if (isExpanded 'panel_key' actor)}}rt-panel-chevron--open{{/if}}"></i>
</div>

{{!-- Expandable content --}}
<div class="rt-panel-details panel_key" {{hideIfNot (isExpanded 'panel_key' actor)}}>
    {{!-- Expanded content --}}
</div>
```

### Preventing Event Propagation
When buttons are inside clickable headers, use `event.stopPropagation()`:
```javascript
static async #increment(event, target) {
    event.stopPropagation(); // Prevent header toggle
    // ... handler logic
}
```

### Fate Stars - Correct Range Helper Usage
```handlebars
{{!-- WRONG - shows max+1 stars --}}
{{#each (range 1 (add system.fate.max 1)) as |index|}}

{{!-- CORRECT - shows exactly max stars --}}
{{#each (range 1 system.fate.max) as |index|}}
```

The `range` helper is EXCLUSIVE on the end, so `range 1 5` gives [1,2,3,4].

### Combat Actions Config (src/module/config.mjs)
Combat actions are defined in `ROGUE_TRADER.combatActions` with categories:
- `attacks`: standardAttack, calledShot, allOutAttack, charge, semiAutoBurst, fullAutoBurst, etc.
- `movement`: move, run, charge, disengage, jumpLeap, tacticalAdvance
- `reactions`: dodge, parry
- `utility`: aim, ready, reload, delay, feint, grapple, overwatch

---

## Task 1: Overview Tab - Critical Wounds Pips Under Wounds

### Description
The Critical Wounds pips should be displayed right under the wounds vital, not in a separate section.

### Files to Modify
- `src/templates/actor/acolyte/tab-overview.hbs` (lines 84-94)

### Changes Required
1. Move the critical pips inside the wounds vital-row structure
2. Currently critical pips are inside a subsection - move them to be part of the wounds display

### Current Structure (lines 84-94):
```handlebars
{{#if (gt system.wounds.critical 0)}}
<div class="rt-vital-row rt-vital-row--critical">
    <span class="rt-vital-icon"><i class="fas fa-skull"></i></span>
    <span class="rt-vital-label">Critical</span>
    <div class="rt-critical-pips-inline">
        {{!-- pips --}}
    </div>
</div>
{{/if}}
```

### Desired Structure:
Place critical pips directly after the wounds controls, in a compact inline format.

### Estimated Effort
Low - Template restructuring

---

## Task 2: Overview Tab - Style Corruption/Insanity Degrees Like Status Tab

### Description
The degree badges for corruption and insanity in the Overview tab should be styled similar to the Status tab's modern degree badge design.

### Files to Modify
- `src/templates/actor/acolyte/tab-overview.hbs` (lines 97-111)
- `src/scss/panels/_overview-dashboard.scss`

### Current Structure:
```handlebars
<span class="rt-mental-degree {{corruptionDegreeClass system.corruption}}">{{corruptionDegree system.corruption}}</span>
```

### Changes Required
1. Add styled badge classes for each degree level
2. Style the badges with appropriate colors matching `$rt-degree-*` variables

### SCSS to Add:
```scss
.rt-mental-degree {
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    
    &.rt-degree-pure { background: rgba($rt-degree-pure, 0.2); color: $rt-degree-pure; }
    &.rt-degree-tainted { background: rgba($rt-degree-tainted, 0.2); color: $rt-degree-tainted; }
    &.rt-degree-soiled { background: rgba($rt-degree-soiled, 0.2); color: $rt-degree-soiled; }
    &.rt-degree-debased { background: rgba($rt-degree-debased, 0.2); color: $rt-degree-debased; }
    &.rt-degree-profane { background: rgba($rt-degree-profane, 0.2); color: $rt-degree-profane; }
    &.rt-degree-damned { background: rgba($rt-degree-damned, 0.2); color: $rt-degree-damned; }
}
```

### Estimated Effort
Low - SCSS styling

---

## Task 3: Combat Tab - Fix Grid Responsiveness

### Description
The combat grid (`rt-combat-grid`) doesn't flex to page width. The middle section is too large.

### Files to Modify
- `src/scss/panels/_combat-station.scss` (lines 14-20)

### Current CSS:
```scss
.rt-combat-grid {
  display: grid;
  grid-template-columns: 250px 350px 250px;
  gap: $rt-space-md;
  min-height: 0;
}
```

### Changes Required:
```scss
.rt-combat-grid {
  display: grid;
  grid-template-columns: 1fr minmax(280px, 320px) 1fr;  // Flexible outer, constrained middle
  gap: $rt-space-md;
  min-height: 0;
  width: 100%;
}
```

### Estimated Effort
Low - CSS fix

---

## Task 4: Combat Tab - Fix Vitals Panel Expand Behavior

### Description
Multiple issues with vitals panels:
1. Plus/minus buttons trigger panel expansion (should not)
2. Animated border changes color on warning state (should stay consistent, just flash more)
3. Panel width changes when status classes are added (centering issue)

### Files to Modify
- `src/module/applications/actor/acolyte-sheet.mjs` (increment/decrement handlers)
- `src/scss/panels/_combat-station.scss`
- `src/templates/actor/panel/combat-station-panel.hbs`

### Changes Required

#### 4a. Fix Button Click Propagation
In acolyte-sheet.mjs, add `event.stopPropagation()` to increment/decrement handlers:
```javascript
static async #increment(event, target) {
    event.stopPropagation(); // Prevent header toggle
    // ... existing logic
}

static async #decrement(event, target) {
    event.stopPropagation(); // Prevent header toggle
    // ... existing logic
}
```

#### 4b. Alternative: Move buttons outside clickable header
In combat-station-panel.hbs, restructure so buttons are NOT inside the clickable header:
```handlebars
<div class="rt-vital-stat rt-vital-wounds">
    <div class="rt-vital-stat-header">
        {{!-- Label only --}}
        <div class="rt-vital-label">
            <i class="fas fa-heart"></i>
            <span>WOUNDS</span>
        </div>
        {{!-- Chevron for expand --}}
        <button type="button" class="rt-expand-btn sheet-control__hide-control" data-toggle="combat_wounds_details">
            <i class="fas fa-chevron-down rt-panel-chevron"></i>
        </button>
    </div>
    {{!-- Controls outside header --}}
    <div class="rt-vital-controls">
        <button type="button" class="rt-vital-ctrl-btn" data-action="decrement" data-field="system.wounds.value">
            <i class="fas fa-minus"></i>
        </button>
        <span class="rt-vital-value">{{system.wounds.value}} / {{system.wounds.max}}</span>
        <button type="button" class="rt-vital-ctrl-btn" data-action="increment" data-field="system.wounds.value">
            <i class="fas fa-plus"></i>
        </button>
    </div>
    {{!-- Rest of panel --}}
</div>
```

#### 4c. Fix Border Color Consistency
In _combat-station.scss, change the warning states to only pulse, not change color:
```scss
.rt-vital-warning {
  // Don't change border color, just background
  background: rgba(255, 165, 0, 0.05);
  
  &::before {
    // Keep original vital color, just animate intensity
    animation: pulse-warn-intense 1s ease-in-out infinite;
  }
}

@keyframes pulse-warn-intense {
  0%, 100% { opacity: 1; box-shadow: 0 0 8px currentColor; }
  50% { opacity: 0.3; box-shadow: none; }
}
```

#### 4d. Fix Panel Width Shifting
```scss
.rt-vital-stat {
  // Force consistent width
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
  
  // Remove justify-content that might center things
  .rt-vital-stat-body {
    width: 100%;
  }
}
```

### Estimated Effort
Medium - JS + SCSS + Template changes

---

## Task 5: Combat Tab - Fix Fate Stars Count and Color

### Description
1. Fate vital shows one too many stars (should show exactly max stars)
2. Stars should be blue (#3498db), not gold
3. Also fix in Overview tab

### Files to Modify
- `src/templates/actor/panel/combat-station-panel.hbs` (line 206)
- `src/templates/actor/acolyte/tab-overview.hbs` (line 58)
- `src/scss/panels/_combat-station.scss`
- `src/scss/panels/_overview-dashboard.scss`

### Template Fix (both files):
```handlebars
{{!-- BEFORE (wrong) --}}
{{#each (range 1 (add system.fate.max 1)) as |index|}}

{{!-- AFTER (correct) --}}
{{#each (range 1 system.fate.max) as |index|}}
```

### SCSS Fix - Change fate color to blue:
```scss
// In _combat-station.scss
.rt-vital-fate {
  --vital-color: #3498db;  // Blue instead of gold
  --vital-color-rgb: 52, 152, 219;
}

.rt-fate-pip {
  color: rgba(#3498db, 0.25);  // Unfilled: faded blue
  
  &.rt-fate-pip--active {
    color: #3498db;  // Filled: solid blue
    text-shadow: 0 0 8px rgba(#3498db, 0.5);
  }
}

// In _overview-dashboard.scss
.rt-fate-pip--filled {
  color: #3498db !important;  // Override gold
}
```

### Estimated Effort
Low - Template and CSS fixes

---

## Task 6: Combat Tab - Fix Combat Actions Panel

### Description
The combat actions panel only shows Dodge and Parry. The expanded section has no actionable content because `dh.combatActions` may not be in context.

### Files to Modify
- `src/module/applications/actor/acolyte-sheet.mjs` (_prepareContext or _prepareCombatTabContext)
- `src/templates/actor/panel/combat-actions-panel.hbs`

### Investigation
The template references `dh.combatActions.attacks`, `dh.combatActions.movement`, etc.
The `dh` should be `CONFIG.ROGUE_TRADER` which is set up in context as `dh`.

### Changes Required
1. Ensure `dh` is passed to combat tab context
2. Verify `CONFIG.ROGUE_TRADER.combatActions` is properly defined in config.mjs

In `_prepareContext()`:
```javascript
context.dh = CONFIG.ROGUE_TRADER;
```

### Estimated Effort
Low - Context preparation fix

---

## Task 7: Combat Tab - Slim Up Movement Panel

### Description
The movement panel is too tall vertically. Make it more compact.

### Files to Modify
- `src/templates/actor/panel/movement-panel-compact.hbs`
- `src/scss/panels/_movement-v2.scss` (around line 437)

### Changes Required
1. Reduce padding and gaps
2. Make cells more compact

```scss
.rt-panel-movement-compact {
  .rt-panel-body {
    padding: $rt-space-xs;  // Was $rt-space-sm
  }
}

.rt-movement-modern-compact {
  display: grid;
  grid-template-columns: repeat(4, 1fr);  // 4 columns instead of stacked
  gap: $rt-space-xs;
}

.rt-move-modern-cell {
  padding: $rt-space-xs;
  min-height: auto;  // Remove min-height
}
```

### Estimated Effort
Low - CSS changes

---

## Task 8: Combat Tab - Replace Actions Panel with Combat Actions

### Description
Move the Combat Actions panel to replace the current "Actions" panel (which has Attack/Damage buttons). Remove the old Actions panel.

### Files to Modify
- `src/templates/actor/panel/combat-station-panel.hbs` (lines 285-318)

### Changes Required
1. Remove the `rt-panel-quick-actions` panel (lines 289-318)
2. Move `combat-actions-panel.hbs` partial to the right column where Actions was
3. Keep Initiative display somewhere

### New Structure:
```handlebars
{{!-- RIGHT COLUMN: Combat Actions & Info --}}
<div class="rt-combat-col rt-combat-actions">
    {{!-- Initiative (compact inline) --}}
    <div class="rt-initiative-compact">
        <span>Initiative:</span>
        <span class="rt-init-value">{{system.initiative.total}}</span>
        <button data-action="initiative"><i class="fas fa-dice-d20"></i></button>
    </div>
    
    {{!-- Movement Panel --}}
    {{> movement-panel-compact.hbs}}
    
    {{!-- Combat Actions Panel (moved here) --}}
    {{> combat-actions-panel.hbs}}
    
    {{!-- Critical Injuries --}}
    {{> injuries panel --}}
</div>
```

### Estimated Effort
Medium - Template restructuring

---

## Task 9: Skills Tab - Fix Tooltip Characteristic Display

### Description
The tooltip shows the characteristic short name instead of full name, and the value doesn't reflect current stats.

### Files to Modify
- `src/module/applications/actor/acolyte-sheet.mjs` (around line 966)

### Current Code:
```javascript
tooltipData: JSON.stringify({
    name: skill.label || key,
    value: skill.current ?? 0,
    breakdown: this._getSkillBreakdown(skill, char)
})
```

### Changes Required
Add characteristic full name to tooltip data:
```javascript
tooltipData: JSON.stringify({
    name: skill.label || key,
    value: skill.current ?? 0,
    characteristic: char?.label || charKey,  // Full name, not short
    characteristicValue: char?.total ?? 0,
    breakdown: this._getSkillBreakdown(skill, char)
})
```

### Also update `_getSkillBreakdown()` to use full characteristic name:
```javascript
_getSkillBreakdown(skill, char) {
    const parts = [];
    parts.push(`${char?.label ?? 'Characteristic'}: ${char?.total ?? 0}`);
    // ... rest of breakdown
}
```

### Estimated Effort
Low - JS data preparation fix

---

## Task 10: Talents Tab - Fix Delete/Vocalize Buttons

### Description
The delete and vocalize buttons don't work. Error: "RT | itemVocalize: No item ID found"

### Root Cause
The buttons use `data-action="itemDelete"` with `data-item-id` but the item ID lookup in the handler uses `target.closest("[data-item-id]")`. The issue is that `data-item-id` IS on the button but the handler isn't finding it.

### Files to Modify
- `src/templates/actor/panel/talent-panel.hbs` (lines 43-48)

### Current Template:
```handlebars
<button type="button" class="rt-action-btn" data-action="itemVocalize" data-item-id="{{talent.id}}" title="Send to Chat">
```

### Investigation
The handler in base-actor-sheet.mjs line 1278:
```javascript
const itemId = target.closest("[data-item-id]")?.dataset.itemId;
```

This should work since `data-item-id` is on the target button itself. But it's failing.

### Likely Fix
The button might not have `data-item-id` set correctly. Check if `talent.id` is valid.

Alternative: Use legacy class pattern that has working handlers:
```handlebars
<button type="button" class="rt-action-btn item-vocalize" data-item-id="{{talent.id}}" title="Send to Chat">
<button type="button" class="rt-action-btn item-delete" data-item-id="{{talent.id}}" title="Delete">
```

### Estimated Effort
Low - Template fix

---

## Task 11: Talents Tab - Remove Expand Pattern, Use Item Sheet

### Description
Remove the expand chevron and expanded details. Clicking on a talent/trait should open its item sheet instead.

### Files to Modify
- `src/templates/actor/panel/talent-panel.hbs`
- `src/templates/actor/panel/trait-panel.hbs`

### Changes Required
1. Remove the expand button and expanded details section
2. Make the talent/trait name clickable to open item sheet (using `data-action="itemEdit"`)

### New Simplified Structure:
```handlebars
<div class="rt-talent-row item-drag" data-item-id="{{talent.id}}" draggable="true">
    <img class="rt-row-icon" src="{{talent.img}}" alt="" />
    
    <div class="rt-row-main">
        <button type="button" class="rt-row-name" data-action="itemEdit" data-item-id="{{talent.id}}">
            {{talent.fullName}}
        </button>
        <span class="rt-row-meta">{{talent.categoryLabel}}</span>
    </div>
    
    <div class="rt-row-actions">
        <button type="button" class="item-vocalize" data-item-id="{{talent.id}}">
            <i class="fas fa-comment"></i>
        </button>
        <button type="button" class="item-delete" data-item-id="{{talent.id}}">
            <i class="fas fa-trash"></i>
        </button>
    </div>
</div>
```

### Estimated Effort
Medium - Template restructuring

---

## Task 12: Talents Tab - Conditional Dropzone Size

### Description
The dropzone should be smaller when there is at least 1 item in the panel.

### Files to Modify
- `src/templates/actor/panel/talent-panel.hbs`
- `src/templates/actor/panel/trait-panel.hbs`
- `src/scss/panels/_talents.scss`

### Changes Required
Use conditional class based on item count:
```handlebars
<div class="rt-dropzone {{#if talentsCount}}rt-dropzone--compact{{/if}}" data-action="itemCreate" data-type="talent">
    <i class="fas fa-star rt-dropzone-icon"></i>
    <span class="rt-dropzone-text">{{#if talentsCount}}Drop to add{{else}}Drop Talent or Click to Create{{/if}}</span>
</div>
```

```scss
.rt-dropzone--compact {
    padding: $rt-space-sm;
    min-height: 40px;
    
    .rt-dropzone-icon { font-size: 1rem; }
    .rt-dropzone-text { font-size: 0.75rem; }
}
```

### Estimated Effort
Low - Template and CSS

---

## Task 13: Equipment Tab - Add Vocalize Button to Force Fields

### Description
Force fields are missing a vocalize button.

### Files to Modify
- `src/templates/actor/panel/loadout-equipment-panel.hbs` (around line 221)

### Changes Required
Add vocalize button next to other action buttons:
```handlebars
<button type="button" class="rt-equip-btn item-vocalize" data-item-id="{{item.id}}" title="Send to Chat">
    <i class="fas fa-comment"></i>
</button>
```

### Estimated Effort
Low - Template addition

---

## Task 14: Equipment Tab - Fix Delete Buttons

### Description
All panel delete buttons (`data-action="itemDelete"`) do not work.

### Root Cause
Same issue as Task 10 - the V2 action pattern isn't finding the item ID.

### Files to Modify
- `src/templates/actor/panel/loadout-equipment-panel.hbs`

### Changes Required
Replace V2 action pattern with legacy class pattern:
```handlebars
{{!-- BEFORE --}}
<button type="button" class="rt-equip-btn rt-equip-danger" data-action="itemDelete" data-item-id="{{item.id}}">

{{!-- AFTER --}}
<button type="button" class="rt-equip-btn rt-equip-danger item-delete" data-item-id="{{item.id}}">
```

Do this for ALL delete buttons in the equipment panels (armour, force fields, cybernetics, gear).

### Estimated Effort
Low - Template pattern replacement

---

## Task 15: Biography Tab - Create Origin Path Item Sheet

### Description
The origin path item panels (when clicking on origin paths) don't show any info. Need to create a new item sheet for origin path items.

### Files to Create
- `src/module/applications/item/origin-path-sheet.mjs`
- `src/templates/item/item-origin-path-sheet.hbs`

### Files to Modify
- `src/module/applications/item/_module.mjs` (add export)
- Registration in system init

### Sheet Design
Based on the OriginPathData model, display:
- Header: Name, Step type, Image
- Grants section: Characteristics, Wounds, Fate, Skills, Talents, Traits, Aptitudes
- Requirements section (if any)
- Choices section (if any)
- Description/Effect text

### Template Structure:
```handlebars
<div class="rt-item-sheet rt-origin-path-sheet">
    <header class="rt-item-header">
        <img src="{{item.img}}" data-edit="img" />
        <div class="rt-item-title">
            <input type="text" name="name" value="{{item.name}}" />
            <span class="rt-meta-badge">{{item.system.stepLabel}}</span>
        </div>
    </header>
    
    <div class="rt-item-body">
        {{!-- Grants Section --}}
        <div class="rt-section rt-grants-section">
            <h3>Grants</h3>
            {{#if item.system.grantsSummary.length}}
            <ul class="rt-grants-list">
                {{#each item.system.grantsSummary as |grant|}}
                <li>{{grant}}</li>
                {{/each}}
            </ul>
            {{else}}
            <p class="rt-empty">No bonuses</p>
            {{/if}}
        </div>
        
        {{!-- Description --}}
        <div class="rt-section">
            <h3>Description</h3>
            <div class="rt-prose">{{{item.system.description.value}}}</div>
        </div>
        
        {{!-- Effect Text --}}
        {{#if item.system.effectText}}
        <div class="rt-section">
            <h3>Effect</h3>
            <div class="rt-prose">{{{item.system.effectText}}}</div>
        </div>
        {{/if}}
    </div>
</div>
```

### Estimated Effort
High - New sheet class + template + registration

---

## Task 16: Biography Tab - Redesign Journal Entries Table

### Description
The journal entries table style is broken. Redesign this part of the panel.

### Files to Modify
- `src/templates/actor/panel/journal-panel.hbs`
- `src/scss/panels/_biography.scss`

### Current Issues
- Uses Material Icons (`material-icons` class) which may not be loaded
- Table structure is complex with conditional wrappers
- Styling seems incomplete

### Changes Required

#### Template Redesign:
```handlebars
<div class="rt-journal-entries-section">
    <div class="rt-section-header">
        <span class="rt-section-title"><i class="fas fa-book"></i> Journal Entries</span>
        <button type="button" class="rt-add-btn" data-action="itemCreate" data-type="journalEntry">
            <i class="fas fa-plus"></i>
        </button>
    </div>
    
    {{#if journalEntries.length}}
    <div class="rt-journal-list">
        {{#each journalEntries as |entry|}}
        <div class="rt-journal-entry" data-item-id="{{entry.id}}">
            <div class="rt-entry-header">
                <button type="button" class="rt-entry-name item-edit" data-item-id="{{entry.id}}">
                    {{entry.name}}
                </button>
                <span class="rt-entry-meta">
                    {{#if entry.system.time}}{{entry.system.time}}{{/if}}
                    {{#if entry.system.place}} · {{entry.system.place}}{{/if}}
                </span>
                <button type="button" class="rt-entry-delete item-delete" data-item-id="{{entry.id}}">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            {{#if entry.system.description}}
            <div class="rt-entry-preview">
                {{truncate entry.system.description 100}}
            </div>
            {{/if}}
        </div>
        {{/each}}
    </div>
    {{else}}
    <div class="rt-empty-state">
        <i class="fas fa-book-open"></i>
        <p>No journal entries yet</p>
    </div>
    {{/if}}
</div>
```

#### SCSS:
```scss
.rt-journal-entries-section {
    margin-top: $rt-space-md;
}

.rt-journal-list {
    display: flex;
    flex-direction: column;
    gap: $rt-space-xs;
}

.rt-journal-entry {
    padding: $rt-space-sm;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border-secondary);
    border-radius: $rt-radius-md;
}

.rt-entry-header {
    display: flex;
    align-items: center;
    gap: $rt-space-sm;
}

.rt-entry-name {
    flex: 1;
    font-weight: 600;
    cursor: pointer;
    
    &:hover { text-decoration: underline; }
}

.rt-entry-meta {
    font-size: 0.75rem;
    color: var(--color-text-tertiary);
}

.rt-entry-preview {
    margin-top: $rt-space-xs;
    font-size: 0.85rem;
    color: var(--color-text-secondary);
    font-style: italic;
}
```

### Estimated Effort
Medium - Template redesign + SCSS

---

## Priority Order

### Critical (Blocking)
1. Task 10: Fix Delete/Vocalize Buttons (broken functionality)
2. Task 14: Fix Equipment Delete Buttons (broken functionality)

### High Priority (UX Issues)
3. Task 4: Fix Vitals Panel Expand Behavior (annoying behavior)
4. Task 5: Fix Fate Stars Count and Color (visual bug)
5. Task 6: Fix Combat Actions Panel (missing content)
6. Task 3: Fix Grid Responsiveness (layout issue)

### Medium Priority (Polish)
7. Task 1: Critical Wounds Pips Position
8. Task 2: Style Corruption/Insanity Degrees
9. Task 7: Slim Movement Panel
10. Task 8: Replace Actions with Combat Actions
11. Task 9: Fix Skills Tooltip
12. Task 11: Remove Talent Expand Pattern
13. Task 12: Conditional Dropzone Size
14. Task 13: Add Force Field Vocalize

### Lower Priority (New Features)
15. Task 15: Origin Path Item Sheet (new feature)
16. Task 16: Redesign Journal Entries (redesign)

---

## Completion Checklist

- [ ] Task 1: Overview - Critical Wounds Pips Position
- [ ] Task 2: Overview - Style Corruption/Insanity Degrees
- [ ] Task 3: Combat - Fix Grid Responsiveness
- [ ] Task 4: Combat - Fix Vitals Expand Behavior
- [ ] Task 5: Combat - Fix Fate Stars Count/Color
- [ ] Task 6: Combat - Fix Combat Actions Panel
- [ ] Task 7: Combat - Slim Movement Panel
- [ ] Task 8: Combat - Replace Actions Panel
- [ ] Task 9: Skills - Fix Tooltip Display
- [ ] Task 10: Talents - Fix Delete/Vocalize Buttons
- [ ] Task 11: Talents - Remove Expand Pattern
- [ ] Task 12: Talents - Conditional Dropzone Size
- [ ] Task 13: Equipment - Add Force Field Vocalize
- [ ] Task 14: Equipment - Fix Delete Buttons
- [ ] Task 15: Bio - Create Origin Path Sheet
- [ ] Task 16: Bio - Redesign Journal Entries
