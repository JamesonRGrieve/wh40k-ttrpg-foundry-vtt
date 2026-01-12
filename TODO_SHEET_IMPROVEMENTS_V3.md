# Rogue Trader VTT - Sheet Improvements Task Plan V3

> **Created**: 2026-01-10
> **Purpose**: Comprehensive UI/UX improvements across character sheet tabs
> **Scope**: 25+ tasks covering Overview, Combat, Skills, Talents, Equipment, and Biography tabs

---

## Preamble (Context for Each Task)

This section provides architecture context that applies to ALL tasks. Include this when working on any individual task.

### Architecture Overview

- **Framework**: Foundry VTT V13 ApplicationV2 with PARTS system
- **Sheet Class**: `AcolyteSheet` (src/module/applications/actor/acolyte-sheet.mjs, ~1800 lines)
- **Base Class**: `BaseActorSheet` with 8 mixins stacked on ActorSheetV2
- **Templates**: `src/templates/actor/acolyte/` (tab templates) and `src/templates/actor/panel/` (reusable panels)
- **Styles**: `src/scss/panels/` (panel-specific) and `src/scss/components/` (shared)
- **Data Models**: `src/module/data/actor/` (actor data) and `src/module/data/item/` (item data)

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

// Vital-specific colors
// Wounds: $rt-accent-combat (#a82020)
// Fatigue: #c08020 (amber/lightning)
// Fate: #3498db (BLUE - not gold!)
```

### Action Handler Pattern (ApplicationV2)

```javascript
// In sheet class DEFAULT_OPTIONS
static DEFAULT_OPTIONS = {
  actions: {
    actionName: ClassName.#actionHandler
  }
};

// Handler receives event and target element
static async #actionHandler(event, target) {
  event.stopPropagation(); // If inside clickable parent
  const itemId = target.dataset.itemId || target.closest("[data-item-id]")?.dataset.itemId;
  // ... action logic
}
```

### Template Action Binding

```handlebars
{{!-- V2 Pattern: data-action triggers registered handler --}}
<button data-action="itemDelete" data-item-id="{{item.id}}">Delete</button>

{{!-- For clickable pips/stars that set specific values --}}
<button data-action="setFateStar" data-fate-index="{{index}}">★</button>
```

### Item Creation with Default Arrays

When creating items with array/Set fields, provide defaults in the creation data:

```javascript
const data = {
  name: `New ${itemType}`,
  type: itemType,
  system: {
    coverage: ["body"],      // Default array for SetField
    properties: [],          // Default empty array for SetField
    locations: ["internal"]  // Default for cybernetics
  }
};
```

### Skills Data Model Reference

Skills are defined in `CreatureTemplate` (src/module/data/actor/templates/creature.mjs):
- Standard skills: Single skill with `trained`, `plus10`, `plus20` booleans
- Specialist skills: Have `entries` array for specializations (e.g., commonLore, forbiddenLore)
- Each skill has: `label`, `characteristic` (short name), `basic`, `trained`, `plus10`, `plus20`, `bonus`, `current`

---

## OVERVIEW TAB

### Task 1: Convert Fatigue Display to Lightning Bolt Pips

**Priority**: High
**Complexity**: Medium

**Description**: Change the fatigue display from a numeric value to clickable lightning bolt pips, similar to how fate stars and critical wound pips work.

**Files to Modify**:
- `src/templates/actor/acolyte/tab-overview.hbs` (lines 40-58)
- `src/templates/actor/panel/combat-station-panel.hbs` (lines 114-187)
- `src/scss/panels/_combat-station.scss`
- `src/scss/panels/_overview-dashboard.scss`
- `src/module/applications/actor/acolyte-sheet.mjs` (add setFatigueBolt action)

**Current Template (tab-overview.hbs)**:
```handlebars
<div class="rt-vital-row">
    <span class="rt-vital-icon"><i class="fas fa-bolt"></i></span>
    <span class="rt-vital-label">Fatigue</span>
    <div class="rt-vital-controls">
        <button type="button" class="rt-vital-btn" data-action="decrement" ...>
        <span class="rt-vital-value ...">{{system.fatigue.value}}/{{system.fatigue.max}}</span>
        <button type="button" class="rt-vital-btn" data-action="increment" ...>
    </div>
</div>
```

**New Template Design**:
```handlebars
<div class="rt-vital-row">
    <span class="rt-vital-icon"><i class="fas fa-bolt"></i></span>
    <span class="rt-vital-label">Fatigue</span>
    <div class="rt-fatigue-bolts-inline">
        {{#each (range 1 system.fatigue.max) as |index|}}
            <button type="button"
                    class="rt-fatigue-pip {{#if (lte index ../system.fatigue.value)}}rt-fatigue-pip--filled{{/if}}"
                    data-action="setFatigueBolt"
                    data-fatigue-index="{{index}}"
                    title="Fatigue Level {{index}}">
                <i class="fas fa-bolt"></i>
            </button>
        {{/each}}
    </div>
    {{#if (gt system.fatigue.value 0)}}
    <span class="rt-vital-penalty">−10</span>
    {{/if}}
</div>
```

**SCSS to Add**:
```scss
.rt-fatigue-bolts-inline {
  display: flex;
  align-items: center;
  gap: 2px;
}

.rt-fatigue-pip {
  font-size: 0.9rem;
  color: rgba(#c08020, 0.25);
  transition: all 0.2s ease;
  cursor: pointer;
  background: none;
  border: none;
  padding: 2px;
  
  &:hover {
    transform: scale(1.15);
    color: rgba(#c08020, 0.5);
  }
  
  &.rt-fatigue-pip--filled {
    color: #c08020;
    text-shadow: 0 0 6px rgba(#c08020, 0.5);
    animation: bolt-glow 2s ease-in-out infinite;
  }
}

@keyframes bolt-glow {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.3); }
}
```

**Action Handler to Add** (acolyte-sheet.mjs):
```javascript
static DEFAULT_OPTIONS = {
  actions: {
    // ... existing
    setFatigueBolt: AcolyteSheet.#setFatigueBolt
  }
};

static async #setFatigueBolt(event, target) {
  event.stopPropagation();
  const index = parseInt(target.dataset.fatigueIndex);
  const currentValue = this.actor.system.fatigue.value;
  // Click on filled bolt = reduce to index-1, click on empty = fill to index
  const newValue = (index <= currentValue) ? index - 1 : index;
  await this.actor.update({ "system.fatigue.value": newValue });
}
```

---

## COMBAT TAB

### Task 2: Fix Armour Panel Centering

**Priority**: Medium
**Complexity**: Low

**Description**: The armour silhouette grid is off-center within its panel.

**Files to Modify**:
- `src/scss/components/_armour.scss` (lines 67-79)

**Current CSS**:
```scss
.rt-armour-silhouette {
  display: grid;
  grid-template-columns: 120px 1fr 120px;
  // ...
  max-width: 450px;
  margin: 0 auto;
}
```

**Fix**: The grid columns are asymmetric. Ensure the parent container allows centering:

```scss
.rt-armour-panel {
  .rt-panel-body {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: var(--rt-space-md);
  }
}

.rt-armour-silhouette {
  display: grid;
  grid-template-columns: 1fr minmax(80px, 120px) 1fr;
  grid-template-rows: auto auto auto;
  grid-template-areas:
    ".       head      ."
    "rarm    body      larm"
    "rleg    .         lleg";
  gap: 6px;
  padding: var(--rt-space-sm);
  width: 100%;
  max-width: 320px;
}
```

---

### Task 3: Fix Vitals Panel Button Propagation

**Priority**: High
**Complexity**: Low

**Description**: Clicking +/- buttons on vitals still expands/collapses the panel. The chevron should be the only expand trigger.

**Files to Modify**:
- `src/module/applications/actor/acolyte-sheet.mjs` (increment/decrement handlers)

**Solution**: Add `event.stopPropagation()` to the handlers:

```javascript
static async #increment(event, target) {
  event.stopPropagation(); // Prevent panel toggle
  // ... existing logic
}

static async #decrement(event, target) {
  event.stopPropagation(); // Prevent panel toggle
  // ... existing logic
}
```

---

### Task 4: Fix Vitals Warning State Styling

**Priority**: Medium
**Complexity**: Low

**Description**: The `rt-vital-warning` class is changing content layout/width. It should only add visual emphasis without affecting dimensions.

**Files to Modify**:
- `src/scss/panels/_combat-station.scss` (lines 149-190)

**Current Issue**: The warning/critical classes may be adding borders or padding that shifts content.

**Fix**:
```scss
.rt-vital-warning,
.rt-vital-critical {
  // Remove any width/padding changes, only affect colors and animations
  // Ensure box-sizing is consistent
  box-sizing: border-box;
  
  // Don't add extra borders - just change the existing ::before strip
  &::before {
    // Keep same width (3px), just animate
  }
}

.rt-vital-stat {
  // Ensure consistent sizing regardless of state
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
}
```

---

### Task 5: Remove Status Number from Fate/Fatigue Vitals

**Priority**: Low
**Complexity**: Low

**Description**: Remove the "X / Y" counter from Fate and Fatigue since the pips/stars already show the count.

**Files to Modify**:
- `src/templates/actor/panel/combat-station-panel.hbs` (lines 218-221 for fate, similar for fatigue)

**Current**:
```handlebars
<div class="rt-fate-counter">
    <span class="rt-fate-available">{{system.fate.value}}</span>
    <span class="rt-fate-total">/ {{system.fate.max}}</span>
</div>
```

**Fix**: Remove or conditionally hide:
```handlebars
{{!-- Remove the rt-fate-counter div entirely --}}
{{!-- Stars/bolts are sufficient for counting --}}
```

---

### Task 6: Make Fate Stars Clickable (Combat Tab)

**Priority**: High
**Complexity**: Medium

**Description**: Fate stars in combat tab should be clickable like in the Status tab to toggle fate points.

**Files to Modify**:
- `src/templates/actor/panel/combat-station-panel.hbs` (lines 211-217)
- `src/module/applications/actor/acolyte-sheet.mjs` (ensure setFateStar action exists)

**Current Template**:
```handlebars
<div class="rt-fate-stars">
    {{#each (range 1 system.fate.max) as |index|}}
        <span class="rt-fate-pip {{#if (lte index ../system.fate.value)}}rt-fate-pip--active{{/if}}">
            <i class="fas fa-star"></i>
        </span>
    {{/each}}
</div>
```

**Fix**: Change span to button with action:
```handlebars
<div class="rt-fate-stars">
    {{#each (range 1 system.fate.max) as |index|}}
        <button type="button"
                class="rt-fate-pip {{#if (lte index ../system.fate.value)}}rt-fate-pip--active{{/if}}"
                data-action="setFateStar"
                data-fate-index="{{index}}"
                title="Fate Point {{index}}">
            <i class="fas fa-star"></i>
        </button>
    {{/each}}
</div>
```

**Action Handler** (should already exist, verify):
```javascript
static async #setFateStar(event, target) {
  event.stopPropagation();
  const index = parseInt(target.dataset.fateIndex);
  const currentValue = this.actor.system.fate.value;
  const newValue = (index <= currentValue) ? index - 1 : index;
  await this.actor.update({ "system.fate.value": newValue });
}
```

---

### Task 7: Combat Actions Favorites System

**Priority**: Medium
**Complexity**: High

**Description**: Add ability to "favorite" combat actions so when the panel is collapsed, only favorited actions show in a compact row.

**Files to Modify**:
- `src/module/data/actor/templates/creature.mjs` (add favoriteCombatActions field)
- `src/templates/actor/panel/combat-actions-panel.hbs`
- `src/scss/panels/_combat-station.scss`
- `src/module/applications/actor/acolyte-sheet.mjs` (add toggleFavoriteAction handler)

**Data Model Addition** (creature.mjs):
```javascript
favoriteCombatActions: new ArrayField(
  new StringField({ required: true }),
  { required: true, initial: ["dodge", "parry"] }
)
```

**Template Changes**:
```handlebars
{{!-- Collapsed view: show only favorites --}}
{{#unless (isExpanded 'combat_actions_details' actor)}}
<div class="rt-actions-favorites">
    {{#each favoriteCombatActions as |actionKey|}}
        {{#with (lookup ../dh.combatActions.all actionKey)}}
        <button type="button" class="rt-action-chip" data-action="combatAction" data-combat-action="{{actionKey}}">
            <i class="fas {{this.icon}}"></i>
            <span>{{this.label}}</span>
        </button>
        {{/with}}
    {{/each}}
</div>
{{/unless}}

{{!-- Expanded view: show all with favorite toggle --}}
{{#if (isExpanded 'combat_actions_details' actor)}}
<div class="rt-actions-full">
    {{#each dh.combatActions.attacks as |action key|}}
    <button type="button" class="rt-action-btn" ...>
        <button type="button" class="rt-action-fav" data-action="toggleFavoriteAction" data-action-key="{{key}}">
            <i class="fas {{#if (includes ../favoriteCombatActions key)}}fa-bolt{{else}}fa-circle{{/if}}"></i>
        </button>
        ...
    </button>
    {{/each}}
</div>
{{/if}}
```

---

### Task 8: Slim Movement Panel

**Priority**: Low
**Complexity**: Low

**Description**: Make the movement panel more compact vertically.

**Files to Modify**:
- `src/scss/panels/_combat-station.scss` (movement grid section)
- `src/templates/actor/panel/movement-panel-compact.hbs`

**Fix**:
```scss
.rt-movement-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);  // 4 columns instead of 2x2
  gap: 4px;
}

.rt-move-item {
  padding: 6px 8px;
  min-height: 40px;  // Reduced from 50px
  
  .rt-move-icon {
    font-size: 1rem;  // Smaller icon
  }
  
  .rt-move-value {
    font-size: 1rem;  // Smaller value
  }
  
  .rt-move-label {
    font-size: 0.45rem;  // Smaller label
  }
}
```

---

## SKILLS TAB

### Task 9: Fix Skills Tooltip Characteristic Display

**Priority**: High
**Complexity**: Medium

**Description**: Skill tooltips show characteristic short name (e.g., "Ag") instead of full name ("Agility"), and values don't reflect current actor stats.

**Files to Modify**:
- `src/module/applications/actor/acolyte-sheet.mjs` (skill tooltip data preparation)

**Investigation**: Find where `tooltipData` is built for skills and ensure it includes:
1. Full characteristic name (from `CONFIG.ROGUE_TRADER.characteristics`)
2. Actual calculated skill value
3. Breakdown of calculation

**Fix in `_prepareSkillContext` or similar**:
```javascript
// When building skill data for template
const charKey = skill.characteristic;  // e.g., "Ag"
const char = this.actor.system.characteristics[this._charKeyToFull(charKey)];
const charConfig = CONFIG.ROGUE_TRADER.characteristics[charKey];

skill.tooltipData = JSON.stringify({
  name: skill.label,
  value: skill.current,
  characteristic: charConfig?.label || charKey,  // Full name
  characteristicValue: char?.total || 0,
  bonus: skill.bonus || 0,
  training: skill.trained ? (skill.plus20 ? "+20" : skill.plus10 ? "+10" : "Trained") : "Untrained",
  breakdown: this._getSkillBreakdown(skill, char)
});

// Helper method
_charKeyToFull(short) {
  const map = {
    "WS": "weaponSkill", "BS": "ballisticSkill", "S": "strength",
    "T": "toughness", "Ag": "agility", "Int": "intelligence",
    "Per": "perception", "WP": "willpower", "Fel": "fellowship"
  };
  return map[short] || short.toLowerCase();
}
```

---

### Task 10: Audit Skills Against SKILL_TABLE.md

**Priority**: High
**Complexity**: High

**Description**: Ensure all skills in the data model match SKILL_TABLE.md. Add missing skills, remove extras, and correct Type/Characteristic/Descriptor.

**Reference**: `/home/aqui/RogueTraderVTT/SKILL_TABLE.md`

**Files to Modify**:
- `src/module/data/actor/templates/creature.mjs` (skill definitions, lines 99-154)
- `src/packs/skills/` (skill pack data)

**Skills to Add** (from SKILL_TABLE.md, not in creature.mjs):
- None appear to be missing from quick review

**Skills to Verify/Fix**:
| Skill | Current Char | Correct Char | Type |
|-------|--------------|--------------|------|
| Acrobatics | Ag | Ag | Advanced (not Basic!) |
| Blather | Fel | Fel | Advanced (not Basic!) |
| Commerce | Fel | Fel | Advanced (not Basic!) |
| Literacy | Int | Int | Advanced (not Basic!) |
| Survival | Int | Int | Advanced (not Basic!) |

**Skill Groups (IsSkillGroup=true)** - These should NOT be in standard skills table:
- Ciphers
- Common Lore
- Drive
- Forbidden Lore
- Navigation
- Performer
- Pilot
- Scholastic Lore
- Secret Tongue
- Speak Language
- Tech-Use (verify - table says true)
- Trade

**Changes Needed**:
1. Add `advanced` boolean to skill schema
2. Mark skills as advanced per SKILL_TABLE.md
3. Move skill groups to specialist skills section (already have `entries` but shown in wrong place)

---

### Task 11: Separate Skill Groups from Standard Skills

**Priority**: High
**Complexity**: Medium

**Description**: Skills marked as `IsSkillGroup=true` should appear in the Talents tab under "Specialist Skills", not in the Skills tab.

**Files to Modify**:
- `src/templates/actor/acolyte/tab-skills.hbs`
- `src/templates/actor/acolyte/tab-talents.hbs`
- `src/module/applications/actor/acolyte-sheet.mjs` (context preparation)

**Changes**:
1. In `_prepareSkillsContext()`, separate skills into:
   - `standardSkills` - skills without entries (IsSkillGroup=false)
   - `skillGroups` - skills with entries array (IsSkillGroup=true)

2. Only render `standardSkills` in tab-skills.hbs
3. Add specialist skills panel to tab-talents.hbs using `skillGroups`

---

### Task 12: Mark Advanced Skills Visually

**Priority**: Medium
**Complexity**: Low

**Description**: Advanced skills should be visually distinct. In future, grey them out if actor lacks appropriate talent/trait.

**Files to Modify**:
- `src/module/data/actor/templates/creature.mjs` (add `advanced` to SkillField)
- `src/templates/actor/panel/skills-panel.hbs`
- `src/scss/panels/_skills.scss`

**Data Model Change**:
```javascript
static SkillField(label, charShort, hasEntries = false, isAdvanced = false) {
  const schema = {
    // ... existing
    advanced: new BooleanField({ required: true, initial: isAdvanced })
  };
  // ...
}

// Then update all skill definitions:
acrobatics: this.SkillField("Acrobatics", "Ag", false, true),  // Advanced
awareness: this.SkillField("Awareness", "Per", false, false), // Basic
```

**SCSS**:
```scss
.rt-skill-row--advanced {
  .rt-skill-name {
    font-style: italic;
    
    &::after {
      content: " ★";
      font-size: 0.6em;
      color: $rt-accent-skills;
    }
  }
  
  &.rt-skill-row--unavailable {
    opacity: 0.5;
    filter: grayscale(0.5);
  }
}
```

---

## TALENTS TAB

### Task 13: Add Specialist Skills Panel

**Priority**: High
**Complexity**: Medium

**Description**: Ensure all skill groups (from SKILL_TABLE.md with IsSkillGroup=true) appear in the Talents tab.

**Files to Modify**:
- `src/templates/actor/acolyte/tab-talents.hbs`
- `src/templates/actor/panel/specialist-skills-panel.hbs` (may need to create)

**Skill Groups to Include**:
- Ciphers
- Common Lore
- Drive
- Forbidden Lore
- Navigation
- Performer
- Pilot
- Scholastic Lore
- Secret Tongue
- Speak Language
- Tech-Use
- Trade

---

### Task 14: Remove "No Talents Yet" Empty State

**Priority**: Low
**Complexity**: Low

**Description**: Remove the "No talents yet." text from empty talents panel.

**Files to Modify**:
- `src/templates/actor/panel/talent-panel.hbs` (lines 48-52)

**Current**:
```handlebars
{{else}}
<div class="rt-empty-state">
    <i class="fas fa-star"></i>
    <p>No talents yet.</p>
</div>
{{/if}}
```

**Fix**: Remove the else block entirely, just show the dropzone.

---

### Task 15: Fix Talent/Trait Descriptor Display

**Priority**: Medium
**Complexity**: Medium

**Description**: Talents show un-human-readable descriptors. Review and fix the data model/pack data.

**Files to Modify**:
- `src/module/data/item/talent.mjs`
- `src/module/data/item/trait.mjs`
- `src/packs/talents/` and `src/packs/traits/`
- `src/module/config.mjs` (add talent categories config)

**Changes**:
1. Ensure talent.mjs has proper `category` field with human-readable choices
2. Add `categoryLabel` getter that returns localized string
3. Add CONFIG.ROGUE_TRADER.talentCategories with proper labels

---

### Task 16: Create Talent Item Sheet

**Priority**: High
**Complexity**: High

**Description**: Create a dedicated item sheet for talents that displays all relevant information and allows players to create their own.

**Files to Create**:
- `src/module/applications/item/talent-sheet.mjs`
- `src/templates/item/item-talent-sheet.hbs`

**Files to Modify**:
- `src/module/applications/item/_module.mjs` (add export)
- Registration in system init

**Template Structure**:
```handlebars
<div class="rt-item-sheet talent-sheet">
  <header class="rt-item-header">
    <img src="{{item.img}}" data-edit="img" />
    <div class="rt-item-title">
      <input type="text" name="name" value="{{item.name}}" />
      <span class="rt-meta-badge">{{item.system.categoryLabel}}</span>
    </div>
  </header>
  
  <div class="rt-item-body">
    {{!-- Properties --}}
    <div class="rt-panel">
      <h3>Properties</h3>
      <div class="rt-field-grid">
        <label>Category</label>
        <select name="system.category">{{selectOptions categories}}</select>
        
        <label>Tier</label>
        <input type="number" name="system.tier" value="{{item.system.tier}}" />
        
        <label>Stackable</label>
        <input type="checkbox" name="system.stackable" {{checked item.system.stackable}} />
        
        {{#if item.system.stackable}}
        <label>Current Rank</label>
        <input type="number" name="system.rank" value="{{item.system.rank}}" />
        {{/if}}
      </div>
    </div>
    
    {{!-- Prerequisites --}}
    <div class="rt-panel">
      <h3>Prerequisites</h3>
      {{editor item.system.prerequisites target="system.prerequisites"}}
    </div>
    
    {{!-- Effect --}}
    <div class="rt-panel">
      <h3>Effect</h3>
      {{editor item.system.description.value target="system.description.value"}}
    </div>
  </div>
</div>
```

---

## EQUIPMENT TAB

### Task 17: Fix Armour Item Creation Error

**Priority**: Critical
**Complexity**: Medium

**Description**: Creating armour items fails with validation error: "coverage: must be an Array, properties: must be an Array"

**Root Cause**: SetField expects array but gets undefined on creation.

**Files to Modify**:
- `src/module/applications/actor/base-actor-sheet.mjs` (itemCreate handler)
- `src/module/data/item/armour.mjs` (ensure defaults)

**Fix Option 1** - Provide defaults in itemCreate:
```javascript
static async #itemCreate(event, target) {
  const itemType = target.dataset.type ?? "gear";
  const data = {
    name: `New ${itemType.charAt(0).toUpperCase() + itemType.slice(1)}`,
    type: itemType
  };
  
  // Add type-specific defaults for array/Set fields
  if (itemType === "armour") {
    data.system = {
      coverage: ["body"],
      properties: []
    };
  } else if (itemType === "cybernetic") {
    data.system = {
      locations: ["internal"]
    };
  }
  
  await this.actor.createEmbeddedDocuments("Item", [data], { renderSheet: true });
}
```

**Fix Option 2** - Better defaults in data model:
```javascript
// In armour.mjs defineSchema
coverage: new fields.SetField(
  new fields.StringField({ ... }),
  { required: true, initial: () => new Set(["body"]) }  // Use function for default
),
```

---

### Task 18: Fix Cybernetic Item Creation Error

**Priority**: Critical
**Complexity**: Low

**Description**: Creating cybernetic items fails with: "locations: must be an Array"

**Files to Modify**:
- `src/module/applications/actor/base-actor-sheet.mjs` (add default in itemCreate)

**Fix**: Same as Task 17, add:
```javascript
if (itemType === "cybernetic") {
  data.system = {
    locations: ["internal"]
  };
}
```

---

### Task 19: Fix Gear Item Sheet Error

**Priority**: Critical
**Complexity**: Medium

**Description**: Gear sheet fails to render with: "Cannot convert undefined or null to object" in selectOptions.

**Root Cause**: Template uses `{{selectOptions dh.availabilities ...}}` but `dh.availabilities` is undefined.

**Files to Modify**:
- `src/module/applications/item/gear-sheet.mjs` (_prepareContext)
- OR `src/templates/item/item-gear-sheet-modern.hbs` (fix selectOptions usage)

**Fix in gear-sheet.mjs**:
```javascript
async _prepareContext(options) {
  const context = await super._prepareContext(options);
  
  // Ensure dh has required config
  context.dh = context.dh || {};
  context.dh.availabilities = CONFIG.ROGUE_TRADER.availabilities || {};
  context.dh.craftsmanships = CONFIG.ROGUE_TRADER.craftsmanships || {};
  
  return context;
}
```

---

### Task 20: Redesign Force Field Item Sheet

**Priority**: High
**Complexity**: Medium

**Description**: Force field sheet has broken layout - icon too big, no scroll.

**Files to Modify**:
- `src/templates/item/item-force-field-sheet.hbs` (complete rewrite)
- `src/scss/item/_force-field.scss` (create or update)

**New Template Design**:
```handlebars
<div class="rt-item-sheet force-field-sheet">
  <form autocomplete="off">
    <header class="rt-item-header">
      <div class="rt-item-image" data-edit="img">
        <img src="{{item.img}}" alt="{{item.name}}" />
      </div>
      <div class="rt-item-title">
        <input type="text" name="name" value="{{item.name}}" />
        <div class="rt-item-status">
          <span class="rt-status-badge {{#if item.system.activated}}active{{/if}}">
            {{#if item.system.overloaded}}OVERLOADED{{else if item.system.activated}}ACTIVE{{else}}INACTIVE{{/if}}
          </span>
        </div>
      </div>
    </header>
    
    <div class="rt-item-body">
      <div class="rt-panel">
        <h3>Force Field Properties</h3>
        <div class="rt-field-grid rt-field-grid--2">
          <div class="rt-field">
            <label>Protection Rating</label>
            <input type="number" name="system.protectionRating" value="{{item.system.protectionRating}}" min="0" max="100" />
            <span class="rt-field-hint">Roll under to block</span>
          </div>
          <div class="rt-field">
            <label>Overload Threshold</label>
            <input type="number" name="system.overloadThreshold" value="{{item.system.overloadThreshold}}" min="0" max="100" />
            <span class="rt-field-hint">Roll this or higher = overload</span>
          </div>
        </div>
        
        <div class="rt-field-row">
          <label class="rt-checkbox">
            <input type="checkbox" name="system.activated" {{checked item.system.activated}} />
            <span>Activated</span>
          </label>
          <label class="rt-checkbox">
            <input type="checkbox" name="system.overloaded" {{checked item.system.overloaded}} />
            <span>Overloaded</span>
          </label>
        </div>
        
        <div class="rt-field">
          <label>Overload Duration</label>
          <input type="text" name="system.overloadDuration" value="{{item.system.overloadDuration}}" />
        </div>
      </div>
      
      <div class="rt-panel">
        <h3>Description</h3>
        {{editor item.system.description.value target="system.description.value" button=true editable=true engine="prosemirror"}}
      </div>
    </div>
  </form>
</div>
```

---

## BIOGRAPHY TAB

### Task 21: Create Origin Path Item Sheet

**Priority**: High
**Complexity**: High

**Description**: Origin path items show no info when clicked. Need to create a dedicated sheet.

**Files to Create**:
- `src/module/applications/item/origin-path-sheet.mjs`
- `src/templates/item/item-origin-path-sheet.hbs`
- `src/scss/item/_origin-path.scss`

**Files to Modify**:
- `src/module/applications/item/_module.mjs` (add export)
- System init registration

**Template Structure**:
```handlebars
<div class="rt-item-sheet origin-path-sheet">
  <header class="rt-item-header">
    <img src="{{item.img}}" data-edit="img" />
    <div class="rt-item-title">
      <input type="text" name="name" value="{{item.name}}" />
      <span class="rt-meta-badge rt-step-badge">{{item.system.stepLabel}}</span>
    </div>
  </header>
  
  <div class="rt-item-body">
    {{!-- Grants Summary --}}
    <div class="rt-panel rt-grants-panel">
      <h3><i class="fas fa-gift"></i> Grants</h3>
      {{#if item.system.grantsSummary.length}}
      <ul class="rt-grants-list">
        {{#each item.system.grantsSummary as |grant|}}
        <li class="rt-grant-item">{{grant}}</li>
        {{/each}}
      </ul>
      {{else}}
      <p class="rt-empty">No bonuses granted</p>
      {{/if}}
    </div>
    
    {{!-- Detailed Grants --}}
    {{#if item.system.grants.skills.length}}
    <div class="rt-panel">
      <h4>Skills</h4>
      {{#each item.system.grants.skills as |skill|}}
      <div class="rt-grant-row">
        <span>{{skill.name}}</span>
        <span class="rt-grant-level">{{skill.level}}</span>
      </div>
      {{/each}}
    </div>
    {{/if}}
    
    {{!-- Description --}}
    <div class="rt-panel">
      <h3>Description</h3>
      {{editor item.system.description.value target="system.description.value" button=true editable=true engine="prosemirror"}}
    </div>
    
    {{!-- Effect Text --}}
    {{#if item.system.effectText}}
    <div class="rt-panel">
      <h3>Special Effect</h3>
      <div class="rt-effect-text">{{{item.system.effectText}}}</div>
    </div>
    {{/if}}
  </div>
</div>
```

---

### Task 22: Fix Origin Path Panel Update on Drop

**Priority**: High
**Complexity**: Medium

**Description**: The origin path panel doesn't update when drag-and-dropping an origin path item.

**Files to Modify**:
- `src/module/applications/actor/acolyte-sheet.mjs` (_onDropItem or similar)

**Investigation**: Check if the sheet is re-rendering after item drop. May need to:
1. Invalidate the `_cachedOriginPath` cache after origin path item is added
2. Call `this.render()` or trigger a targeted part render

**Fix**:
```javascript
async _onDropItem(event, data) {
  const result = await super._onDropItem(event, data);
  
  // If dropped item is an origin path, invalidate cache and re-render
  const item = await Item.implementation.fromDropData(data);
  if (item?.type === "originPath") {
    this._invalidateCache();
    this.render({ parts: ["biography"] });
  }
  
  return result;
}
```

---

### Task 23: Fix Journal Notes Height

**Priority**: Low
**Complexity**: Low

**Description**: The journal entries section has too much space above it.

**Files to Modify**:
- `src/scss/panels/_biography.scss`

**Fix**:
```scss
.rt-journal-notes {
  margin-top: $rt-space-sm;  // Reduced from larger value
}

.rt-journal-entries-section {
  margin-top: $rt-space-md;  // Consistent spacing
}
```

---

## ADDITIONAL FIXES

### Task 24: Fix Delete/Vocalize Buttons in All Panels

**Priority**: Critical
**Complexity**: Low

**Description**: Several panels have broken delete/vocalize buttons using data-action pattern that isn't finding item IDs.

**Files to Modify**:
- `src/templates/actor/panel/talent-panel.hbs`
- `src/templates/actor/panel/trait-panel.hbs`
- `src/templates/actor/panel/loadout-equipment-panel.hbs`

**Pattern to Use**: Ensure `data-item-id` is directly on the button:
```handlebars
<button type="button" class="rt-action-btn" 
        data-action="itemDelete" 
        data-item-id="{{item.id}}" 
        title="Delete">
    <i class="fas fa-trash"></i>
</button>
```

If the V2 action pattern still fails, fall back to legacy class pattern:
```handlebars
<button type="button" class="rt-action-btn item-delete" 
        data-item-id="{{item.id}}" 
        title="Delete">
    <i class="fas fa-trash"></i>
</button>
```

---

### Task 25: Vocalize Chat Card Redesign

**Priority**: Medium
**Complexity**: Medium

**Description**: Create a better chat card template for when items are vocalized/sent to chat.

**Files to Modify**:
- `src/templates/chat/item-card.hbs`
- `src/scss/chat/_chat-card.scss`

This should display:
- Item name and image
- Item type badge
- Key properties based on item type
- Description excerpt
- Link to open full item sheet

---

## Priority Summary

### Critical (Blocking Functionality)
1. Task 17: Fix Armour Item Creation Error
2. Task 18: Fix Cybernetic Item Creation Error
3. Task 19: Fix Gear Item Sheet Error
4. Task 24: Fix Delete/Vocalize Buttons

### High Priority (Core UX)
5. Task 1: Convert Fatigue to Lightning Bolt Pips
6. Task 3: Fix Vitals Button Propagation
7. Task 6: Make Fate Stars Clickable
8. Task 9: Fix Skills Tooltip Display
9. Task 10: Audit Skills Against SKILL_TABLE.md
10. Task 11: Separate Skill Groups
11. Task 13: Add Specialist Skills Panel
12. Task 16: Create Talent Item Sheet
13. Task 20: Redesign Force Field Sheet
14. Task 21: Create Origin Path Item Sheet
15. Task 22: Fix Origin Path Update on Drop

### Medium Priority (Polish)
16. Task 2: Fix Armour Panel Centering
17. Task 4: Fix Vitals Warning Styling
18. Task 7: Combat Actions Favorites
19. Task 12: Mark Advanced Skills
20. Task 15: Fix Talent Descriptors
21. Task 25: Vocalize Chat Card

### Low Priority (Nice to Have)
22. Task 5: Remove Status Numbers
23. Task 8: Slim Movement Panel
24. Task 14: Remove Empty Talent State
25. Task 23: Fix Journal Notes Height

---

## Completion Checklist

- [ ] Task 1: Fatigue Lightning Bolt Pips
- [ ] Task 2: Armour Panel Centering
- [ ] Task 3: Vitals Button Propagation
- [ ] Task 4: Vitals Warning Styling
- [ ] Task 5: Remove Status Numbers
- [ ] Task 6: Clickable Fate Stars (Combat)
- [ ] Task 7: Combat Actions Favorites
- [ ] Task 8: Slim Movement Panel
- [ ] Task 9: Skills Tooltip Fix
- [ ] Task 10: Skills Audit
- [ ] Task 11: Separate Skill Groups
- [ ] Task 12: Mark Advanced Skills
- [ ] Task 13: Specialist Skills Panel
- [ ] Task 14: Remove Empty Talent State
- [ ] Task 15: Talent Descriptor Fix
- [ ] Task 16: Talent Item Sheet
- [ ] Task 17: Armour Creation Fix
- [ ] Task 18: Cybernetic Creation Fix
- [ ] Task 19: Gear Sheet Fix
- [ ] Task 20: Force Field Sheet Redesign
- [ ] Task 21: Origin Path Item Sheet
- [ ] Task 22: Origin Path Drop Update
- [ ] Task 23: Journal Notes Height
- [ ] Task 24: Delete/Vocalize Buttons
- [ ] Task 25: Vocalize Chat Card
