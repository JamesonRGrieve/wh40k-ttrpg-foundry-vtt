# Rogue Trader VTT - Sheet Improvements Task Plan

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
Each tab part uses container `{ classes: ["rt-body"], id: "tab-body" }` for stacking.

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
$rt-accent-combat: #a82020;      // Combat/danger
$rt-accent-skills: #2a7a9a;      // Skills
$rt-accent-talents: #a07818;     // Talents
$rt-accent-equipment: #3a5f5f;   // Equipment
$rt-accent-powers: #6a2090;      // Powers

// Fonts
$rt-font-display: 'Cinzel', serif;
$rt-font-heading: 'IM Fell DW Pica', serif;
$rt-font-body: 'Lusitana', serif;
$rt-font-alt: 'Modesto Condensed', 'Palatino Linotype', serif;

// Border radius
$rt-radius-sm: 2px;
$rt-radius-md: 4px;
$rt-radius-lg: 8px;
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
  const itemId = target.dataset.itemId;
  // ...
}
```

### Template Action Binding
```handlebars
<button data-action="actionName" data-item-id="{{item.id}}">Click</button>
```

### Expandable Panel Pattern (from wounds-panel-v2.hbs)
```handlebars
{{!-- Header with toggle --}}
<div class="rt-panel-header rt-panel-header--clickable sheet-control__hide-control"
     data-toggle="panel_key"
     title="Click to {{#if (isExpanded 'panel_key' actor)}}collapse{{else}}expand{{/if}}">
    <span class="rt-panel-title">
        <i class="fas fa-icon"></i> Title
    </span>
    <i class="fas fa-chevron-down rt-panel-chevron {{#if (isExpanded 'panel_key' actor)}}rt-panel-chevron--open{{/if}}"></i>
</div>

{{!-- Expandable content --}}
<div class="rt-panel-details panel_key" {{hideIfNot (isExpanded 'panel_key' actor)}}>
    {{!-- Expanded content with editable fields --}}
</div>
```

### Tooltip Pattern (from skills-panel.hbs)
```handlebars
<button data-tooltip aria-label="Label: Value"
        data-rt-tooltip="tooltipType" data-rt-tooltip-data="{{tooltipData}}">
```

### Dropzone Pattern
```handlebars
<div class="rt-dropzone" data-action="itemCreate" data-type="itemType">
    <i class="fas fa-icon rt-dropzone-icon"></i>
    <span class="rt-dropzone-text">Drop items here or click to create</span>
</div>
```

### Favorite Skills Data Storage
Store favorites in actor flags: `actor.flags.rt.favoriteSkills = ["dodge", "awareness", ...]`

### Combat Actions Reference (from COMBAT_ACTIONS.md)
| Action | Type | Subtypes | Description |
|--------|------|----------|-------------|
| Aim | Half/Full | Concentration | +10/+20 bonus to next attack |
| Standard Attack | Half | Attack, Melee or Ranged | Make one attack |
| Charge | Full | Attack, Melee, Movement | Move 4m+, +10 WS |
| Full Auto Burst | Full | Attack, Ranged | +20 BS, +1 hit per DoS |
| Dodge | Reaction | Movement | Ag test to negate hit |
| Parry | Reaction | Defence, Melee | WS test to negate hit |
| ... and 30+ more actions |

---

## Task 1: Overview Tab - Remove Characteristics Panel

### Description
Remove the characteristics panel from the Overview tab. The characteristics are already displayed in the header HUD, so this is redundant.

### Files to Modify
- `src/templates/actor/acolyte/tab-overview.hbs`

### Changes Required
1. Delete lines 114-148 (Zone 2: Characteristics panel)
2. Adjust grid layout if needed (currently 3-column top row)

### Estimated Effort
Low - Template deletion only

---

## Task 2: Overview Tab - Replace Key Skills with Favorite Skills

### Description
Replace the hardcoded "Key Skills" panel with a dynamic "Favorite Skills" panel that displays user-selected favorite skills.

### Files to Modify
- `src/templates/actor/acolyte/tab-overview.hbs` (lines 150-237)
- `src/module/applications/actor/acolyte-sheet.mjs` (add context preparation)
- `src/scss/panels/_overview-dashboard.scss` (styling if needed)

### Changes Required
1. **Template**: Replace hardcoded skill list with dynamic favorites
   ```handlebars
   {{#each favoriteSkills as |skill|}}
     <div class="rt-skill-row-compact" data-tooltip 
          data-rt-tooltip="skill" data-rt-tooltip-data="{{skill.tooltipData}}">
       <span class="rt-skill-name-compact">{{skill.label}}</span>
       <span class="rt-skill-value-compact">{{skill.current}}</span>
       <button type="button" class="rt-skill-roll-btn"
               data-action="roll" data-roll-type="skill" 
               data-roll-target="{{skill.key}}" title="Roll {{skill.label}}">
         <i class="fas fa-dice"></i>
       </button>
     </div>
   {{/each}}
   ```

2. **Sheet JS**: Add `_prepareFavoriteSkills()` method in context prep
   - Read from `actor.flags.rt.favoriteSkills` array
   - Return skill objects with label, current value, tooltipData

3. **Tooltip**: Add tooltips showing skill breakdown (characteristic + training + modifiers)

### Estimated Effort
Medium - Template + JS changes + tooltip integration

---

## Task 3: Skills Tab - Add Favorite Button

### Description
Add a favorite button (star icon) to each skill row that toggles the skill as a favorite.

### Files to Modify
- `src/templates/actor/panel/skills-panel.hbs`
- `src/module/applications/actor/acolyte-sheet.mjs` (add action handler)
- `src/scss/panels/_skills.scss` (styling)

### Changes Required
1. **Template**: Add favorite toggle button before skill name
   ```handlebars
   <button type="button" class="rt-favorite-btn {{#if entry.[1].isFavorite}}rt-favorite--active{{/if}}"
           data-action="toggleSkillFavorite" data-skill="{{entry.[0]}}"
           title="{{#if entry.[1].isFavorite}}Remove from favorites{{else}}Add to favorites{{/if}}">
     <i class="{{#if entry.[1].isFavorite}}fas{{else}}far{{/if}} fa-star"></i>
   </button>
   ```

2. **Sheet JS**: Add `#toggleSkillFavorite` action handler
   ```javascript
   static async #toggleSkillFavorite(event, target) {
     const skill = target.dataset.skill;
     const favorites = this.actor.getFlag("rt", "favoriteSkills") || [];
     if (favorites.includes(skill)) {
       await this.actor.setFlag("rt", "favoriteSkills", favorites.filter(s => s !== skill));
     } else {
       await this.actor.setFlag("rt", "favoriteSkills", [...favorites, skill]);
     }
   }
   ```

3. **Context Prep**: Add `isFavorite` to each skill entry in `_prepareSkillsContext()`

4. **SCSS**: Add styling for favorite button
   ```scss
   .rt-favorite-btn {
     width: 20px;
     height: 20px;
     padding: 0;
     background: transparent;
     border: none;
     color: $rt-text-muted;
     cursor: pointer;
     transition: all 0.2s ease;
     
     &:hover { color: $rt-accent-gold; transform: scale(1.1); }
     &.rt-favorite--active { color: $rt-accent-gold; }
   }
   ```

### Estimated Effort
Medium - Template + JS action + styling

---

## Task 4: Combat Tab - Expandable Vitals Panels

### Description
Make the wounds/fatigue/fate panels in the Combat tab expandable to allow setting max values, similar to the Status tab panels.

### Files to Modify
- `src/templates/actor/panel/combat-station-panel.hbs` (lines 10-118)
- `src/scss/panels/_combat-station.scss`

### Changes Required
1. **Template**: Refactor vitals section to use expandable pattern
   - Add clickable header with chevron for each vital (wounds, fatigue, fate)
   - Add collapsed/expanded states using `isExpanded` helper
   - Add edit fields for max values in expanded state

2. **Pattern to follow**: Use wounds-panel-v2.hbs as reference
   ```handlebars
   <div class="rt-vital-stat rt-vital-wounds">
     <div class="rt-vital-stat-header rt-panel-header--clickable sheet-control__hide-control"
          data-toggle="combat_wounds_details">
       {{!-- Current compact display --}}
     </div>
     <div class="rt-panel-details combat_wounds_details" {{hideIfNot (isExpanded 'combat_wounds_details' actor)}}>
       {{!-- Max wounds input field --}}
     </div>
   </div>
   ```

### Estimated Effort
Medium - Template restructuring with existing pattern

---

## Task 5: Combat Tab - Add Critical Wounds Pips to Wounds Vital

### Description
Add the critical damage pip display to the wounds vital panel in combat tab.

### Files to Modify
- `src/templates/actor/panel/combat-station-panel.hbs` (around line 48)

### Changes Required
1. **Template**: Add critical pips section after wounds display
   ```handlebars
   {{!-- Critical Damage Pips (inline compact) --}}
   {{#if (or (gt system.wounds.critical 0) (eq system.wounds.value 0))}}
   <div class="rt-vital-critical-inline">
     <span class="rt-crit-label"><i class="fas fa-skull"></i></span>
     <div class="rt-critical-pips-compact">
       {{#each (array 1 2 3 4 5 6 7 8 9 10) as |level|}}
         <button type="button"
                 class="rt-crit-pip-mini {{#if (lte level ../system.wounds.critical)}}rt-crit-pip-mini--filled{{/if}}"
                 data-action="setCriticalPip"
                 data-crit-level="{{level}}"
                 title="Critical Level {{level}}">
         </button>
       {{/each}}
     </div>
   </div>
   {{/if}}
   ```

2. **SCSS**: Style compact critical pips for combat tab
   ```scss
   .rt-vital-critical-inline {
     display: flex;
     align-items: center;
     gap: 6px;
     padding: 4px 0;
   }
   .rt-critical-pips-compact {
     display: flex;
     gap: 2px;
   }
   .rt-crit-pip-mini {
     width: 10px;
     height: 10px;
     // ... compact styling
   }
   ```

### Estimated Effort
Low - Template addition + minor styling

---

## Task 6: Combat Tab - Fix Weapons Panel Values

### Description
The weapons panel is not showing values properly. Investigate and fix the data binding.

### Files to Modify
- `src/templates/actor/panel/combat-station-panel.hbs` (lines 233-279)
- Possibly `src/module/applications/actor/acolyte-sheet.mjs`

### Investigation Required
1. Check what values are missing/broken:
   - `item.system.damage` - damage formula
   - `item.system.damageType` - damage type
   - `item.system.class` - weapon class
   - `item.system.range` - range in meters

2. Compare with weapon data model schema
3. Check if context preparation is missing weapon enrichment

### Changes Required
(Pending investigation)

### Estimated Effort
Medium - Requires debugging

---

## Task 7: Combat Tab - Redesign Actions Panel

### Description
Completely redesign the actions panel using COMBAT_ACTIONS.md as reference. Create a comprehensive combat actions reference/quick-access panel.

### Files to Modify
- `src/templates/actor/panel/combat-station-panel.hbs` (lines 170-203)
- `src/templates/actor/panel/combat-actions-panel.hbs` (NEW)
- `src/scss/panels/_combat-station.scss`
- `src/module/config.mjs` (add combat actions config)

### Design Concept
Group actions by type with quick-reference tooltips:

```
┌─────────────────────────────────────────┐
│ ⚔ COMBAT ACTIONS                        │
├─────────────────────────────────────────┤
│ ATTACKS                                 │
│ [Standard] [Called Shot] [All Out]      │
│ [Semi-Auto] [Full Auto] [Suppressing]   │
├─────────────────────────────────────────┤
│ MOVEMENT                                │
│ [Move] [Charge] [Run] [Disengage]       │
│ [Jump/Leap] [Tactical Advance]          │
├─────────────────────────────────────────┤
│ REACTIONS                               │
│ [Dodge] [Parry]                         │
├─────────────────────────────────────────┤
│ UTILITY                                 │
│ [Aim] [Ready] [Reload] [Delay]          │
│ [Feint] [Grapple] [Overwatch]           │
└─────────────────────────────────────────┘
```

### Changes Required
1. **Config**: Add combat actions definition to config.mjs
   ```javascript
   ROGUE_TRADER.combatActions = {
     attacks: [
       { key: "standardAttack", label: "Standard Attack", type: "half", 
         description: "Make one melee or ranged attack", icon: "fa-crosshairs" },
       // ...
     ],
     movement: [...],
     reactions: [...],
     utility: [...]
   };
   ```

2. **New Template**: Create combat-actions-panel.hbs with grouped buttons
3. **Tooltips**: Each action button shows rules summary on hover
4. **SCSS**: Style action buttons with category colors

### Estimated Effort
High - New feature with significant design work

---

## Task 8: Talents Tab - Remove Count from Headers

### Description
Remove the calculated number badges from the Talents and Traits panel headers.

### Files to Modify
- `src/templates/actor/panel/talent-panel.hbs` (lines 5-8)
- `src/templates/actor/panel/trait-panel.hbs` (lines 5-8)

### Changes Required
1. **talent-panel.hbs**: Remove count badge
   ```handlebars
   {{!-- BEFORE --}}
   <span class="rt-panel-title">
     <i class="fas fa-star"></i> Talents
     {{#if talentsCount}}
     <span class="rt-count-badge">{{talentsCount}}</span>
     {{/if}}
   </span>
   
   {{!-- AFTER --}}
   <span class="rt-panel-title">
     <i class="fas fa-star"></i> Talents
   </span>
   ```

2. **trait-panel.hbs**: Same change
   ```handlebars
   {{!-- Remove count badge from header --}}
   ```

### Estimated Effort
Low - Template deletion only

---

## Task 9: Talents Tab - Rework Table Entries

### Description
Rework the table entries in the talents and traits panels for better visual presentation.

### Files to Modify
- `src/templates/actor/panel/talent-panel.hbs`
- `src/templates/actor/panel/trait-panel.hbs`
- `src/scss/panels/_talents.scss`

### Investigation Required
1. Current card-based design - what's the issue?
2. Review what information should be displayed
3. Consider compact vs expanded views

### Design Options
- Compact list view with expand on click
- Card grid with essential info only
- Table format with columns

### Estimated Effort
Medium - Design decisions + implementation

---

## Task 10: Equipment Tab - Add Dropzones to Panels

### Description
Add dropzones back to each equipment category panel while keeping the new table row style.

### Files to Modify
- `src/templates/actor/panel/loadout-equipment-panel.hbs` (lines 150-328)

### Changes Required
1. Add dropzone after each equipment table:
   ```handlebars
   {{!-- After armour table --}}
   <div class="rt-dropzone-compact" data-action="itemCreate" data-type="armour">
     <i class="fas fa-plus-circle"></i>
     <span>Drop armour here</span>
   </div>
   ```

2. Current structure has "Add Armour" buttons - convert to dropzone pattern:
   - Armour panel (line 185)
   - Force Fields panel (line 232)
   - Cybernetics panel (line 270)
   - Gear panel (line 325)

### Estimated Effort
Low - Template additions

---

## Task 11: Biography Tab - Fix Content Rendering Issue

### Description
The bio tab content renders in every tab. This is likely a template structure issue with missing section wrapper.

### Files to Modify
- `src/templates/actor/acolyte/tab-biography.hbs`

### Investigation Required
1. Check if section wrapper is missing `data-tab` attribute
2. Compare with other tab templates
3. Verify tab switching logic

### Expected Fix
```handlebars
{{!-- BEFORE (missing section wrapper) --}}
<div class="rt-bio-grid">
  ...
</div>

{{!-- AFTER (proper section wrapper) --}}
<section class="tab {{#if tab.active}}active{{/if}} {{ tab.cssClass }}" 
         data-tab="{{ tab.id }}" data-group="{{ tab.group }}">
  <div class="rt-bio-grid">
    ...
  </div>
</section>
```

### Estimated Effort
Low - Template fix

---

## Task 12: Biography Tab - Add Experience Panel

### Description
Add the experience panel from the Status tab to the top of the right column of the Biography tab.

### Files to Modify
- `src/templates/actor/acolyte/tab-biography.hbs`

### Changes Required
1. Add partial include at start of right column (after line 120):
   ```handlebars
   <div class="rt-bio-col">
     {{!-- Experience Panel --}}
     {{> systems/rogue-trader/templates/actor/panel/experience-panel-v2.hbs}}
     
     {{!-- Character Notes / Journal --}}
     <div class="rt-panel rt-panel-journal">
       ...
     </div>
   </div>
   ```

### Estimated Effort
Low - Single partial include

---

## Priority Order

### High Priority (Core Functionality)
1. Task 11: Biography Tab - Fix Content Rendering Issue (blocking bug)
2. Task 6: Combat Tab - Fix Weapons Panel Values (broken feature)

### Medium Priority (User Experience)
3. Task 1: Remove Characteristics from Overview (cleanup)
4. Task 4: Combat Tab - Expandable Vitals (consistency)
5. Task 5: Combat Tab - Critical Wounds Pips (missing feature)
6. Task 10: Equipment Tab - Add Dropzones (UX improvement)
7. Task 12: Biography Tab - Add Experience Panel (feature)

### Lower Priority (Enhancements)
8. Task 2: Favorite Skills in Overview (new feature)
9. Task 3: Skills Tab - Favorite Button (supports Task 2)
10. Task 8: Talents Tab - Remove Count (polish)
11. Task 9: Talents Tab - Rework Entries (design work)
12. Task 7: Combat Tab - Redesign Actions (significant new feature)

---

## Completion Checklist

- [ ] Task 1: Overview Tab - Remove Characteristics Panel
- [ ] Task 2: Overview Tab - Favorite Skills Panel
- [ ] Task 3: Skills Tab - Favorite Button
- [ ] Task 4: Combat Tab - Expandable Vitals
- [ ] Task 5: Combat Tab - Critical Wounds Pips
- [ ] Task 6: Combat Tab - Fix Weapons Panel
- [ ] Task 7: Combat Tab - Redesign Actions Panel
- [ ] Task 8: Talents Tab - Remove Count from Headers
- [ ] Task 9: Talents Tab - Rework Table Entries
- [ ] Task 10: Equipment Tab - Add Dropzones
- [ ] Task 11: Biography Tab - Fix Rendering Bug
- [ ] Task 12: Biography Tab - Add Experience Panel
