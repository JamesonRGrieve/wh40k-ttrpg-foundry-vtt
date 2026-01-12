# Rogue Trader VTT - Style & Data Model Audit Plan

> **Created**: January 12, 2026
> **Status**: Planning Phase
> **Goal**: Consolidate and standardize all item sheets and actor panels for consistent UI/UX

---

## Preamble (Apply to ALL Tasks)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AGENT TASK PREAMBLE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PHILOSOPHY:                                                                │
│  • NO SHORTCUTS - Every task must be completed thoroughly                   │
│  • PRO-REFACTOR - Legacy/old code should be removed and migrated, not      │
│    patched or worked around                                                 │
│  • CONSISTENCY FIRST - All similar components must use identical patterns  │
│  • SINGLE SOURCE OF TRUTH - No duplicate definitions allowed               │
│                                                                             │
│  CONTEXT:                                                                   │
│  • System: Rogue Trader VTT (Foundry V13, ApplicationV2)                   │
│  • Architecture: DataModel-heavy, slim Documents, 8-mixin sheet stack     │
│  • Build: `npm run build` (Gulp → dist/)                                   │
│  • Entry: src/module/rogue-trader.mjs                                      │
│                                                                             │
│  KEY FILES:                                                                 │
│  • Data Models: src/module/data/                                           │
│  • Templates: src/templates/                                               │
│  • SCSS: src/scss/                                                         │
│  • Shared Templates: src/module/data/shared/                               │
│                                                                             │
│  CANONICAL STYLE REFERENCES:                                                │
│  • Panel Style: src/scss/panels/_core.scss (.rt-panel)                     │
│  • Vital Stat: src/scss/panels/_combat-station.scss (.rt-vital-stat)       │
│  • Dropzone: TO BE CREATED in src/scss/abstracts/_unified-components.scss  │
│  • Item Sheet (Physical): item-weapon-sheet-modern.hbs                     │
│  • Item Sheet (Talent): item-skill-sheet-modern.hbs / item-talent-*        │
│                                                                             │
│  DOCUMENTATION:                                                             │
│  • Read AGENTS.md before starting any task                                 │
│  • Read resources/RogueTraderInfo.md for game rules                        │
│  • Update AGENTS.md if you add new patterns/conventions                    │
│                                                                             │
│  DO NOT:                                                                    │
│  • Create duplicate style definitions                                       │
│  • Leave legacy code "for backwards compatibility"                         │
│  • Use inline styles in templates                                          │
│  • Create one-off panel styles                                             │
│  • Skip updating templates when data models change                         │
│                                                                             │
│  ALWAYS:                                                                    │
│  • Remove old/duplicate files after migration                              │
│  • Update _module.mjs exports when adding/removing files                   │
│  • Test both "PLAY" and "EDIT" modes in sheets                             │
│  • Ensure all data model fields appear in sheet templates                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Executive Summary

### Current State Analysis

**Data Models (36 item types)**:
- `source` field EXISTS in `DescriptionTemplate` (all items inherit it)
- Templates inconsistently display source (some use `system.source.*`, some ignore it)
- `ModifiersTemplate` lacks situational flag for conditional modifiers
- `CriticalInjuryData` missing `ModifiersTemplate` mixin

**SCSS (105+ files)**:
- 3 competing `.rt-panel` definitions (legacy, modern, gothic)
- 6+ `.rt-dropzone` definitions scattered across panel files
- No unified component library
- Mixed BEM vs simple class naming

**Item Sheets (30+ templates)**:
- Inconsistent naming: `-modern.hbs`, `-v2.hbs`, no suffix
- Duplicate files: armour, cybernetic, force-field, gear all have 2+ versions
- No shared base templates
- Wildly different styling patterns per sheet type

---

## Audit 1: Data Model Reconfiguration

### Task DM-1: Add Situational Flag to ModifiersTemplate

**File**: `src/module/data/shared/modifiers-template.mjs`

**Current State**:
```javascript
modifiers: {
  characteristics: ObjectField,  // { strength: 10, agility: -5 }
  skills: ObjectField,           // { dodge: 10 }
  combat: SchemaField,
  resources: SchemaField,
  other: ArrayField
}
```

**Required Change**:
Add `situational` flag per modifier type so bonuses can be marked as "only shown in roll dialog, not auto-applied":

```javascript
// Proposed structure for characteristics/skills
modifiers: {
  characteristics: new fields.ObjectField({...}),  // For always-active mods
  skills: new fields.ObjectField({...}),
  situational: new fields.SchemaField({
    characteristics: new fields.ArrayField(
      new fields.SchemaField({
        key: new fields.StringField({ required: true }),
        value: new fields.NumberField({ required: true, initial: 0 }),
        condition: new fields.StringField({ required: true }),  // "When dealing with rivals"
        icon: new fields.StringField({ required: false, initial: "fa-exclamation-triangle" })
      })
    ),
    skills: new fields.ArrayField(
      new fields.SchemaField({
        key: new fields.StringField({ required: true }),
        value: new fields.NumberField({ required: true, initial: 0 }),
        condition: new fields.StringField({ required: true }),
        icon: new fields.StringField({ required: false, initial: "fa-exclamation-triangle" })
      })
    ),
    combat: new fields.ArrayField(
      new fields.SchemaField({
        key: new fields.StringField({ required: true }),
        value: new fields.NumberField({ required: true, initial: 0 }),
        condition: new fields.StringField({ required: true }),
        icon: new fields.StringField({ required: false, initial: "fa-exclamation-triangle" })
      })
    )
  })
}
```

**Affected Files**:
- `src/module/data/shared/modifiers-template.mjs` - Add schema
- `src/module/dice/d100-roll.mjs` - Display situational modifiers in dialog
- `src/templates/prompt/roll-config.hbs` - Add UI for situational mods
- `src/templates/item/panel/modifiers-panel.hbs` - Create shared modifiers UI

---

### Task DM-2: Ensure Source Field Usage Everywhere

**Current State**: `DescriptionTemplate` already defines:
```javascript
source: new fields.SchemaField({
  book: StringField,
  page: StringField,
  custom: StringField
})
```

**Problem**: Not all templates display it, and some use wrong path (`system.description.source.*` vs `system.source.*`)

**Action Items**:
1. Audit all item templates for source field presence
2. Fix incorrect paths (should be `system.source.*`)
3. Add source panel partial for reuse
4. Default empty source to display "Core Rulebook"

**Files to Update**:
- Create: `src/templates/item/panel/source-panel.hbs`
- Update: All item sheet templates to include source panel

---

### Task DM-3: Add ModifiersTemplate to CriticalInjuryData

**File**: `src/module/data/item/critical-injury.mjs`

**Current State**:
```javascript
export default class CriticalInjuryData extends ItemDataModel.mixin(
  DescriptionTemplate
  // Missing: ModifiersTemplate
)
```

**Required Change**:
```javascript
export default class CriticalInjuryData extends ItemDataModel.mixin(
  DescriptionTemplate,
  ModifiersTemplate
)
```

**Rationale**: Critical injuries should be able to apply penalties (e.g., -10 WS for arm injury)

---

### Task DM-4: Enhance OriginPathData for Choice Tracking

**File**: `src/module/data/item/origin-path.mjs`

**Current State**: Has `grants.choices` array but no tracking of which choices were selected

**Required Enhancement**:
```javascript
// Add to schema
selectedChoices: new fields.ObjectField({ 
  required: true, 
  initial: {} 
  // Structure: { "choiceLabel": ["selected option 1", "selected option 2"] }
}),

// Flag for which modifiers are active (from choices)
activeModifiers: new fields.ArrayField(
  new fields.SchemaField({
    source: new fields.StringField({ required: true }),  // Which choice this came from
    type: new fields.StringField({ required: true }),    // characteristic/skill/talent
    key: new fields.StringField({ required: true }),
    value: new fields.NumberField({ required: false })
  }),
  { required: true, initial: [] }
)
```

**UI Requirement**: Origin path sheet needs choice selection UI that:
1. Displays available choices
2. Allows player to select options
3. Tracks selections
4. Enables/disables modifiers based on selections

---

### Task DM-5: Audit All Item Models for Field Completeness

For each item type, ensure:
1. All defined schema fields appear in the sheet template
2. `sourceReference` getter is used for display
3. Proper labels/icons are defined for all enums

**Items to Audit**:
| Item Type | Data Model | Current Template | Status |
|-----------|-----------|------------------|--------|
| talent | TalentData | item-talent-sheet-modern.hbs | AUDIT |
| trait | TraitData | item-trait-sheet-modern.hbs | AUDIT |
| skill | SkillData | item-skill-sheet-modern.hbs | GOOD (reference) |
| condition | ConditionData | item-condition-sheet-v2.hbs | AUDIT |
| criticalInjury | CriticalInjuryData | item-critical-injury-sheet-v2.hbs | AUDIT |
| originPath | OriginPathData | item-origin-path-sheet.hbs | NEEDS REDESIGN |
| gear | GearData | item-gear-sheet-modern.hbs | AUDIT |
| armour | ArmourData | item-armour-sheet-modern.hbs | REDESIGN |
| weapon | WeaponData | item-weapon-sheet-modern.hbs | GOOD (reference) |
| cybernetic | CyberneticData | item-cybernetic-sheet-v2.hbs | REDESIGN |
| forceField | ForceFieldData | item-force-field-sheet-v2.hbs | REDESIGN |
| ammunition | AmmunitionData | item-ammo-sheet.hbs | AUDIT |

---

## Audit 2: Style Reconfiguration

### Task ST-1: Create Unified Component Library

**File**: `src/scss/abstracts/_unified-components.scss`

Create canonical definitions for ALL reusable components:

```scss
// ============================================
// UNIFIED COMPONENT LIBRARY
// Single source of truth for all RT components
// ============================================

// ===========================================
// RT-PANEL - Collapsible content sections
// ===========================================
.rt-panel { ... }
.rt-panel-header { ... }
.rt-panel-header--clickable { ... }
.rt-panel-chevron { ... }
.rt-panel-body { ... }
.rt-panel-details { ... }

// Accent variants
.rt-panel--wounds { --panel-accent: #{$rt-accent-combat}; }
.rt-panel--fatigue { --panel-accent: #{$rt-color-gold}; }
// ... etc

// ===========================================
// RT-VITAL-STAT - Compact stat cards
// ===========================================
.rt-vital-stat { ... }
.rt-vital-stat-header { ... }
.rt-vital-stat-body { ... }
.rt-vital-value { ... }
.rt-vital-max-label { ... }

// Color variants
.rt-vital--wounds { --vital-color: #{$rt-accent-combat}; }
.rt-vital--fate { --vital-color: #{$rt-fate-secondary}; }
// ... etc

// ===========================================
// RT-DROPZONE - Drag-drop target areas
// ===========================================
.rt-dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: $rt-space-sm;
  padding: $rt-space-lg;
  border: 2px dashed var(--rt-border-color-light);
  border-radius: $rt-radius-md;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.02) 25%,
    transparent 25%,
    transparent 50%,
    rgba(255, 255, 255, 0.02) 50%,
    rgba(255, 255, 255, 0.02) 75%,
    transparent 75%,
    transparent
  );
  background-size: 20px 20px;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    border-color: $rt-accent-gold;
    background-color: rgba($rt-accent-gold, 0.05);
  }
  
  &--compact,
  &.has-items {
    padding: $rt-space-sm $rt-space-md;
    flex-direction: row;
    gap: $rt-space-xs;
    
    .rt-dropzone-icon { font-size: 0.9rem; }
    .rt-dropzone-text { font-size: 0.7rem; }
  }
  
  &--active {
    border-color: $rt-accent-gold;
    background-color: rgba($rt-accent-gold, 0.1);
    box-shadow: inset 0 0 10px rgba($rt-accent-gold, 0.2);
  }
}

.rt-dropzone-icon {
  font-size: 1.5rem;
  color: var(--rt-text-muted);
  transition: color 0.2s ease;
  
  .rt-dropzone:hover & { color: $rt-accent-gold; }
}

.rt-dropzone-text {
  font-size: 0.75rem;
  color: var(--rt-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  
  .rt-dropzone:hover & { color: var(--rt-text-light); }
}

// ===========================================
// RT-ACTIONS-GROUP-HEADER - Section headers
// ===========================================
.rt-actions-group-header {
  display: flex;
  align-items: center;
  gap: $rt-space-xs;
  padding: 6px $rt-space-sm;
  background: linear-gradient(135deg, rgba($rt-accent-gold, 0.08) 0%, rgba($rt-accent-gold, 0.03) 100%);
  border-left: 3px solid $rt-accent-gold;
  border-radius: 0 $rt-radius-sm $rt-radius-sm 0;
  margin-bottom: $rt-space-sm;
}

.rt-group-icon {
  font-size: 0.85rem;
  color: $rt-accent-gold;
}

.rt-actions-group-label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--rt-text-secondary);
}
```

---

### Task ST-2: Remove All Duplicate Panel Definitions

**Files to Modify**:

1. **DELETE** duplicate definitions from:
   - `src/scss/components/_panel.scss` - Legacy, remove `.rt-panel`
   - `src/scss/panels/_loadout.scss` - Remove `.rt-dropzone` (lines 473-503)
   - `src/scss/panels/_talents.scss` - Remove `.rt-dropzone` (lines 429-475)
   - `src/scss/panels/_combat-station.scss` - Remove `.rt-dropzone` (keep `.rt-vital-stat`)
   - `src/scss/panels/_corruption-v2.scss` - Remove `.rt-dropzone-*`
   - `src/scss/panels/_insanity-v2.scss` - Remove `.rt-dropzone-*`
   - `src/scss/panels/_backpack-split-panel.scss` - Remove `.rt-dropzone-area`
   - `src/scss/panels/_powers-v2.scss` - Remove `.rt-dropzone`
   - `src/scss/actor/_characteristics.scss` - Remove `.rt-dropzone-*`

2. **KEEP & CONSOLIDATE** into `_unified-components.scss`:
   - `src/scss/panels/_core.scss` - Move `.rt-panel` definition here
   - `src/scss/panels/_combat-station.scss` - Move `.rt-vital-stat` here

3. **UPDATE IMPORTS** in `src/scss/rogue-trader.scss`:
   - Ensure `_unified-components.scss` is imported before all other partials
   - Remove imports of deleted/empty files

---

### Task ST-3: Standardize Panel Styling Across Character Sheet

**Goal**: All panels should use consistent styling from unified components

**Panels to Update** (in `src/templates/actor/panel/`):
- wounds-panel-v2.hbs → Use `.rt-vital-stat` pattern
- fatigue-panel-v2.hbs → Use `.rt-vital-stat` pattern  
- fate-panel-v2.hbs → Use `.rt-vital-stat` pattern
- corruption-panel-v2.hbs → Use `.rt-vital-stat` + `.rt-panel` for items
- insanity-panel-v2.hbs → Use `.rt-vital-stat` + `.rt-panel` for items
- experience-panel-v2.hbs → Use `.rt-vital-stat` pattern
- weapon-panel.hbs → Use `.rt-panel` with `.rt-dropzone`
- armour-display-panel.hbs → Use `.rt-panel`
- active-effects-panel.hbs → Use `.rt-panel` with `.rt-dropzone`
- talents-panel.hbs → Use `.rt-panel` with `.rt-dropzone`
- All other panels...

**CSS Updates** (in respective SCSS files):
- Remove one-off panel styles
- Use only unified component classes
- Apply accent colors via CSS custom properties

---

### Task ST-4: Create Base Item Sheet Templates

#### ST-4a: Create Talent-Base Template

**File**: `src/templates/item/base/talent-base.hbs`

**Purpose**: Base template for items that provide modifiers (talents, traits, conditions, injuries)

**Structure**:
```handlebars
{{!-- Talent-Base Item Sheet Template --}}
<div class="rt-item-sheet rt-talent-sheet rt-{{item.type}}-sheet">
  <form autocomplete="off">
    
    {{!-- HEADER: Image + Name + Type Badge --}}
    {{> systems/rogue-trader/templates/item/panel/item-header.hbs}}
    
    {{!-- MODIFIERS SUMMARY BAR (if has modifiers) --}}
    {{#if item.system.hasModifiers}}
    {{> systems/rogue-trader/templates/item/panel/modifiers-summary.hbs}}
    {{/if}}
    
    {{!-- TAB NAVIGATION --}}
    <nav class="rt-item-tabs" data-group="primary">
      <button type="button" class="rt-item-tab active" data-tab="details" data-group="primary">
        <i class="fas fa-info-circle"></i>
        <span>Details</span>
      </button>
      <button type="button" class="rt-item-tab" data-tab="modifiers" data-group="primary">
        <i class="fas fa-sliders-h"></i>
        <span>Modifiers</span>
      </button>
      <button type="button" class="rt-item-tab" data-tab="effects" data-group="primary">
        <i class="fas fa-magic"></i>
        <span>Effects</span>
      </button>
    </nav>
    
    {{!-- TAB CONTENT --}}
    <section class="rt-item-content">
      
      {{!-- DETAILS TAB --}}
      <div class="rt-item-panel active" data-tab="details" data-group="primary">
        {{!-- Type-specific content injected here via partial --}}
        {{> @partial-block}}
        
        {{!-- DESCRIPTION --}}
        {{> systems/rogue-trader/templates/item/panel/description-panel.hbs}}
        
        {{!-- SOURCE --}}
        {{> systems/rogue-trader/templates/item/panel/source-panel.hbs}}
      </div>
      
      {{!-- MODIFIERS TAB --}}
      <div class="rt-item-panel" data-tab="modifiers" data-group="primary">
        {{> systems/rogue-trader/templates/item/panel/modifiers-panel.hbs}}
      </div>
      
      {{!-- EFFECTS TAB --}}
      <div class="rt-item-panel" data-tab="effects" data-group="primary">
        {{> systems/rogue-trader/templates/item/panel/active-effects-panel.hbs}}
      </div>
      
    </section>
  </form>
</div>
```

#### ST-4b: Create Item-Base Template

**File**: `src/templates/item/base/item-base.hbs`

**Purpose**: Base template for physical items (weapons, armour, gear, cybernetics, etc.)

**Structure**:
```handlebars
{{!-- Item-Base Physical Item Sheet Template --}}
<div class="rt-item-sheet rt-physical-sheet rt-{{item.type}}-sheet">
  <form autocomplete="off">
    
    {{!-- HEADER: Image + Name + Badges (Class, Type, Craftsmanship) --}}
    {{> systems/rogue-trader/templates/item/panel/item-header-physical.hbs}}
    
    {{!-- STAT BAR: Quick-reference metrics --}}
    {{> @partial-block name="stats"}}
    
    {{!-- TAB NAVIGATION --}}
    <nav class="rt-item-tabs" data-group="primary">
      <button type="button" class="rt-item-tab active" data-tab="stats" data-group="primary">
        <i class="fas fa-chart-bar"></i>
        <span>Stats</span>
      </button>
      <button type="button" class="rt-item-tab" data-tab="properties" data-group="primary">
        <i class="fas fa-cogs"></i>
        <span>Properties</span>
      </button>
      <button type="button" class="rt-item-tab" data-tab="description" data-group="primary">
        <i class="fas fa-scroll"></i>
        <span>Info</span>
      </button>
      <button type="button" class="rt-item-tab" data-tab="effects" data-group="primary">
        <i class="fas fa-magic"></i>
        <span>Effects</span>
      </button>
    </nav>
    
    {{!-- TAB CONTENT --}}
    <section class="rt-item-content">
      
      {{!-- STATS TAB --}}
      <div class="rt-item-panel active" data-tab="stats" data-group="primary">
        {{> @partial-block name="stats-tab"}}
      </div>
      
      {{!-- PROPERTIES TAB --}}
      <div class="rt-item-panel" data-tab="properties" data-group="primary">
        {{!-- Acquisition Section (Weight, Availability, Craftsmanship) --}}
        {{> systems/rogue-trader/templates/item/panel/acquisition-panel.hbs}}
        
        {{!-- Type-specific properties --}}
        {{> @partial-block name="properties-tab"}}
      </div>
      
      {{!-- DESCRIPTION TAB --}}
      <div class="rt-item-panel" data-tab="description" data-group="primary">
        {{> systems/rogue-trader/templates/item/panel/description-panel.hbs}}
        {{> systems/rogue-trader/templates/item/panel/source-panel.hbs}}
      </div>
      
      {{!-- EFFECTS TAB --}}
      <div class="rt-item-panel" data-tab="effects" data-group="primary">
        {{> systems/rogue-trader/templates/item/panel/active-effects-panel.hbs}}
      </div>
      
    </section>
  </form>
</div>
```

---

### Task ST-5: Create Shared Panel Partials

Create reusable partials in `src/templates/item/panel/`:

| Partial | Purpose |
|---------|---------|
| `item-header.hbs` | Image + Name + Type badge for talent-base items |
| `item-header-physical.hbs` | Image + Name + Class/Type/Craftsmanship badges |
| `modifiers-summary.hbs` | Quick bar showing active modifiers |
| `modifiers-panel.hbs` | Full modifier editing UI with situational support |
| `description-panel.hbs` | ProseMirror editor for description |
| `source-panel.hbs` | Book/Page/Custom source fields |
| `acquisition-panel.hbs` | Weight, Availability, Craftsmanship |
| `active-effects-panel.hbs` | (Already exists, standardize) |

---

### Task ST-6: Redesign Armour Sheet

**Current Issues**:
- Multiple conflicting versions
- Doesn't match weapon sheet styling
- Location-based AP display is inconsistent

**Files**:
- Delete: `item-armour-sheet-modern.hbs.bak`
- Keep/Redesign: `item-armour-sheet-v2.hbs` → rename to `-modern.hbs`
- Update SCSS: `src/scss/item/_armour-v2.scss`

**Required Features**:
- Use `item-base.hbs` structure
- Stat bar: Total AP (all locations), Weight, Max Agility
- Location grid showing AP per hit location
- Coverage badges (what locations it covers)
- Properties list (power armour, subsystems, etc.)
- Modification slots with dropzone

---

### Task ST-7: Redesign Cybernetic Sheet

**Current Issues**:
- V1 and V2 exist with completely different styles
- Doesn't follow weapon sheet patterns
- Missing modifiers display

**Files**:
- Delete: `item-cybernetic-sheet.hbs` (old)
- Redesign: `item-cybernetic-sheet-v2.hbs` → `-modern.hbs`
- Update SCSS: `src/scss/item/_cybernetic-v2.scss`

**Required Features**:
- Use hybrid of `item-base.hbs` and `talent-base.hbs` (has modifiers + physical stats)
- Header: Type badge (replacement/implant/augmetic/bionic/mechadendrite)
- Stat bar: Weight, Locations affected
- Modifiers display (from ModifiersTemplate)
- Installation requirements section
- Effect/drawbacks descriptions

---

### Task ST-8: Redesign Force Field Sheet

**Current Issues**:
- V1 and V2 exist
- Inconsistent with other sheets
- Missing proper stat display

**Files**:
- Delete: `item-force-field-sheet.hbs` (old), `.bak`
- Redesign: `item-force-field-sheet-v2.hbs` → `-modern.hbs`
- Update SCSS: `src/scss/item/_force-field-v2.scss`

**Required Features**:
- Use `item-base.hbs` structure
- Stat bar: Protection Rating, Overload Threshold, Weight
- Status indicators: Activated, Overloaded
- Effect description
- Clear overload duration display

---

### Task ST-9: Redesign Condition/Injury Sheets

**Current State**:
- `item-condition-sheet-v2.hbs` exists but styling differs
- `item-critical-injury-sheet-v2.hbs` exists but no modifiers

**Files**:
- Redesign both to use `talent-base.hbs` pattern
- Update to show modifiers panel
- Consistent styling with talent sheet

---

### Task ST-10: Redesign Origin Path Sheet

**Current Issues**:
- Basic template without choice selection UI
- No tracking of selected choices
- Modifiers not editable

**Files**:
- Major redesign: `item-origin-path-sheet.hbs`
- Create supporting JS for choice logic
- Delete `.bak` file

**Required Features**:
- Step indicator (1-6, which step this is)
- Grants summary panel (what this origin provides)
- Choice selection UI:
  - Display available choices from `grants.choices`
  - Dropdown/buttons to select options
  - Track selections in `selectedChoices`
  - Show which modifiers become active based on selections
- Active modifiers panel (from both `modifiers` and `activeModifiers`)
- Prerequisites display

---

### Task ST-11: Clean Up Duplicate/Legacy Files

**Files to DELETE**:
```
src/templates/item/
├── item-armour-sheet-modern.hbs.bak
├── item-cybernetic-sheet.hbs (old version)
├── item-force-field-sheet.hbs (old version)
├── item-critical-injury-sheet.hbs (old version)
├── item-gear-sheet-v2.hbs (keep -modern)
├── item-gear-sheet-modern-old.hbs
├── item-origin-path-sheet.hbs.bak
├── item-talent-sheet-modern.hbs.bak
├── item-trait-sheet-modern.hbs.bak
├── item-weapon-sheet-modern.hbs.bak

src/scss/item/
├── _armour.scss.bak
├── _force-field.scss.bak
├── _cybernetic-v2.scss.old
├── _gear-v2.scss.old
```

---

### Task ST-12: Update Item Sheet SCSS Index

**File**: `src/scss/item/_index.scss`

Ensure only current files are imported, in correct order:
```scss
// Item Sheet Styles
@forward 'base';        // Shared base styles
@forward 'header';      // Header component
@forward 'stats';       // Stat bar component
@forward 'tabs';        // Tab navigation
@forward 'forms';       // Form fields
@forward 'buttons';     // Action buttons
@forward 'tables';      // Data tables
@forward 'tags';        // Badge/tag styles

// Item Type Specific
@forward 'weapon';      // Weapon sheet
@forward 'armour-v2';   // Armour sheet (renamed from -v2 to base)
@forward 'gear-v2';     // Gear sheet
@forward 'cybernetic-v2'; // Cybernetic sheet
@forward 'force-field-v2'; // Force field sheet
@forward 'skill';       // Skill sheet
@forward 'talent-sheet'; // Talent sheet
@forward 'trait-sheet';  // Trait sheet
@forward 'condition';   // Condition sheet
@forward 'critical-injury'; // Critical injury sheet
@forward 'origin-path-modern'; // Origin path sheet
@forward 'armour-modification'; // Armour mod sheet
```

---

## Implementation Order

### Phase 1: Foundation (Data Models)
1. DM-1: Add situational modifiers to ModifiersTemplate
2. DM-2: Audit/fix source field usage
3. DM-3: Add ModifiersTemplate to CriticalInjuryData
4. DM-4: Enhance OriginPathData for choices

### Phase 2: Style Unification
5. ST-1: Create unified component library
6. ST-2: Remove duplicate panel definitions
7. ST-3: Standardize actor sheet panels

### Phase 3: Item Sheet Templates
8. ST-4a: Create talent-base template
9. ST-4b: Create item-base template
10. ST-5: Create shared panel partials

### Phase 4: Individual Sheet Redesigns
11. ST-6: Redesign Armour sheet
12. ST-7: Redesign Cybernetic sheet
13. ST-8: Redesign Force Field sheet
14. ST-9: Redesign Condition/Injury sheets
15. ST-10: Redesign Origin Path sheet

### Phase 5: Cleanup
16. DM-5: Final audit of all data models
17. ST-11: Delete legacy files
18. ST-12: Update SCSS index

### Phase 6: Extension (Lower Priority)
- Apply patterns to Ship component sheets
- Apply patterns to Vehicle item sheets
- Update NPC sheet panels for consistency
- Update Starship sheet panels for consistency

---

## Success Criteria

- [ ] All item sheets use either `talent-base.hbs` or `item-base.hbs`
- [ ] All panels use unified `.rt-panel`, `.rt-vital-stat`, `.rt-dropzone` classes
- [ ] No duplicate SCSS definitions exist
- [ ] All items display source field
- [ ] Situational modifiers appear in roll dialogs
- [ ] Origin path choices can be selected and tracked
- [ ] Critical injuries can apply stat penalties
- [ ] Zero `.bak` or `.old` files remain
- [ ] Build completes without SCSS warnings
- [ ] All data model fields appear in sheet templates

---

## Appendix: Current File Inventory

### Item Data Models (src/module/data/item/)
| File | Mixins Used | Has Source | Has Modifiers |
|------|-------------|------------|---------------|
| talent.mjs | Description, Modifiers | ✅ (via Description) | ✅ |
| trait.mjs | Description, Modifiers | ✅ | ✅ |
| skill.mjs | Description | ✅ | ❌ |
| condition.mjs | Description, Modifiers | ✅ | ✅ |
| critical-injury.mjs | Description | ✅ | ❌ (NEEDS) |
| origin-path.mjs | Description, Modifiers | ✅ | ✅ |
| gear.mjs | Description, Physical, Equippable | ✅ | ❌ |
| armour.mjs | Description, Physical, Equippable | ✅ | ❌ |
| weapon.mjs | Description, Physical, Equippable, Attack, Damage | ✅ | ❌ |
| cybernetic.mjs | Description, Physical, Equippable, Modifiers | ✅ | ✅ |
| force-field.mjs | Description, Physical, Equippable | ✅ | ❌ |
| ammunition.mjs | Description, Physical, Damage | ✅ | ❌ |

### Item Templates (src/templates/item/)
| Current File | Status | Target Pattern |
|--------------|--------|----------------|
| item-weapon-sheet-modern.hbs | ✅ REFERENCE | item-base |
| item-skill-sheet-modern.hbs | ✅ REFERENCE | talent-base |
| item-talent-sheet-modern.hbs | AUDIT | talent-base |
| item-trait-sheet-modern.hbs | AUDIT | talent-base |
| item-condition-sheet-v2.hbs | REDESIGN | talent-base |
| item-critical-injury-sheet-v2.hbs | REDESIGN | talent-base |
| item-origin-path-sheet.hbs | REDESIGN | talent-base (special) |
| item-gear-sheet-modern.hbs | AUDIT | item-base |
| item-armour-sheet-v2.hbs | REDESIGN | item-base |
| item-cybernetic-sheet-v2.hbs | REDESIGN | item-base + modifiers |
| item-force-field-sheet-v2.hbs | REDESIGN | item-base |
| item-ammo-sheet.hbs | AUDIT | item-base |

---

*Document generated by AI audit. Review and approve before implementation.*
