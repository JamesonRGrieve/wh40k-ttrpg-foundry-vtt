# Rogue Trader VTT - Agent Documentation

Comprehensive documentation for AI agents working on this Foundry VTT V13 game system.

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [System Overview](#system-overview)
3. [Build System](#build-system)
4. [Architecture](#architecture)
5. [Data Models](#data-models)
6. [Documents](#documents)
7. [ApplicationV2 Sheets](#applicationv2-sheets)
8. [Mixins](#mixins)
9. [Templates](#templates)
10. [SCSS Architecture](#scss-architecture)
11. [Configuration](#configuration)
12. [Dice & Rolls](#dice--rolls)
13. [Actions](#actions)
14. [Item Types](#item-types)
15. [Compendium Packs](#compendium-packs)
16. [Coding Style & Patterns](#coding-style--patterns)
17. [Testing Changes](#testing-changes)
18. [Common Gotchas](#common-gotchas)

---

## Quick Reference

| Key | Value |
|-----|-------|
| **System** | Rogue Trader VTT (Warhammer 40K RPG based on Dark Heresy 2e) |
| **System ID** | `rogue-trader` |
| **Foundry Version** | V13+ |
| **Architecture** | dnd5e V13 pattern (DataModel-heavy, slim Documents, ApplicationV2) |
| **Build Command** | `npm run build` (Gulp → dist/) |
| **Source Files** | ~179 .mjs, ~150 .hbs, ~105 .scss |
| **Entry Point** | `src/module/rogue-trader.mjs` |

### Key Patterns

| Pattern | Location | Description |
|---------|----------|-------------|
| **Data Models** | `src/module/data/` | All calculations, schema, derived data |
| **Documents** | `src/module/documents/` | Roll methods, API surface only |
| **ApplicationV2 Sheets** | `src/module/applications/` | UI, events, 8-mixin stack |
| **PARTS System** | Sheet classes | Modular template rendering |
| **Panel Partials** | `templates/actor/panel/` | 44 reusable panel components |
| **Handlebars Helpers** | `handlebars/handlebars-helpers.mjs` | 60+ custom helpers |

---

## System Overview

**Rogue Trader VTT** is a Foundry VTT game system for the Rogue Trader RPG (a Warhammer 40K spinoff using Dark Heresy 2e rules).

### Game Mechanics

- **d100 roll-under** system (roll <= target = success)
- **Degrees of Success/Failure**: `floor((target - roll) / 10) + 1`
- **Critical Success**: Roll 01-05 OR 3+ DoS
- **Critical Failure**: Roll 96-00 OR 3+ DoF
- **10 Characteristics**: WS, BS, S, T, Ag, Int, Per, WP, Fel, Inf
- **Characteristic Bonus**: Tens digit (e.g., 42 → 4)
- **Unnatural Characteristics**: Bonus multiplier (x2, x3, etc.)

### Actor Types

| Type | Document Class | DataModel | Sheet |
|------|---------------|-----------|-------|
| `acolyte`/`character` | RogueTraderAcolyte | CharacterData | AcolyteSheet |
| `npc` | RogueTraderNPC | NPCData | NpcSheet |
| `vehicle` | RogueTraderVehicle | VehicleData | VehicleSheet |
| `starship` | RogueTraderStarship | StarshipData | StarshipSheet |

---

## Build System

### Gulp Tasks

```bash
npm run build     # Full build: clean → scss → copy → packs → archive
npm run default   # Build + watch for changes

# Individual tasks
gulp clean        # Remove build directory
gulp scss         # Compile SCSS → CSS
gulp packs        # Compile pack JSON → LevelDB
gulp copy         # Copy static files
```

### Directory Structure

```
src/
├── icons/          # Item/actor icons
├── images/         # UI images
├── lang/           # Localization (en.json)
├── module/         # JavaScript source
│   ├── actions/          # Combat/basic/targeted action managers
│   ├── applications/     # ApplicationV2 sheets, dialogs, components
│   ├── data/             # DataModels (actors, items, shared templates)
│   ├── dice/             # D100Roll, BasicRollRT
│   ├── documents/        # Document classes (Actor, Item, ActiveEffect)
│   ├── handlebars/       # Handlebars manager & helpers
│   ├── helpers/          # Game icons helper
│   ├── macros/           # Macro manager
│   ├── rolls/            # Roll data classes
│   ├── rules/            # Config rules
│   ├── tours/            # Guided tours
│   └── utils/            # Armour/encumbrance calculators
├── packs/          # Compendium pack source (JSON)
├── scss/           # SCSS source files
├── templates/      # Handlebars templates
├── system.json     # Foundry manifest
└── template.json   # Actor/item templates (deprecated)
```

### Build Output

Build outputs to `dist/` (or configured `BUILD_DIR` in gulpfile.js). The gulpfile:
1. Cleans build directory
2. Compiles SCSS → CSS with autoprefixer
3. Copies static files (module/, templates/, lang/, icons/, images/)
4. Compiles pack JSON → LevelDB format for Foundry V13
5. Creates version-tagged zip archive

---

## Architecture

This system follows the **dnd5e V13 architecture pattern**:

### Layer Responsibilities

| Layer | Responsibility | Size |
|-------|---------------|------|
| **DataModels** | Schema definition, data preparation, derived calculations | Heavy |
| **Documents** | API surface, roll methods, action triggers | Slim |
| **ApplicationV2 Sheets** | UI rendering, event handling, animations | Medium |

### Inheritance Hierarchy

```
Data Models (src/module/data/actor/):
  ActorDataModel (abstract)
    └── CommonTemplate (templates/common.mjs) ~365 lines
          └── CreatureTemplate (templates/creature.mjs) ~713 lines
                ├── CharacterData (character.mjs) ~340 lines
                └── NPCData (npc.mjs) ~100 lines
  
  VehicleData (vehicle.mjs)
  StarshipData (starship.mjs)

Documents (src/module/documents/):
  RogueTraderBaseActor (base-actor.mjs) ~160 lines
    ├── RogueTraderAcolyte (acolyte.mjs) ~470 lines
    ├── RogueTraderNPC (npc.mjs) ~21 lines
    ├── RogueTraderVehicle (vehicle.mjs)
    └── RogueTraderStarship (starship.mjs)

ApplicationV2 Sheets (src/module/applications/actor/):
  ActorSheetV2 (Foundry core)
    └── BaseActorSheet (base-actor-sheet.mjs) = 8 mixins stacked
          ├── AcolyteSheet (acolyte-sheet.mjs) ~1800 lines
          ├── NpcSheet (npc-sheet.mjs) ~450 lines
          ├── VehicleSheet (vehicle-sheet.mjs) ~380 lines
          └── StarshipSheet (starship-sheet.mjs) ~520 lines
```

### Data Preparation Flow

```
Actor.prepareData()
  ↓
DataModel.prepareBaseData()
  → Initialize tracking objects
  ↓
DataModel.prepareDerivedData()
  → Calculate characteristics (total, bonus)
  → Calculate skills (training levels)
  → Prepare psy rating, fatigue threshold
  ↓
Document.prepareData() (continued)
  → Call this.system.prepareEmbeddedData()
  ↓
DataModel.prepareEmbeddedData()
  → Compute item modifiers (talents, traits, conditions)
  → Apply modifiers to characteristics
  → Apply modifiers to skills
  → Compute armour by location
  → Compute encumbrance
```

---

## Data Models

Located in `src/module/data/`

### Actor Data Models

| File | Purpose |
|------|---------|
| `abstract/actor-data-model.mjs` | Base class with common utilities |
| `actor/templates/common.mjs` | CommonTemplate: chars, wounds, initiative, movement |
| `actor/templates/creature.mjs` | CreatureTemplate: skills, fatigue, fate, armour, modifiers |
| `actor/character.mjs` | CharacterData: bio, experience, origin path |
| `actor/npc.mjs` | NPCData: type, faction, threat level |
| `actor/vehicle.mjs` | VehicleData: integrity, movement, upgrades |
| `actor/starship.mjs` | StarshipData: hull, morale, components |

### Item Data Models (36 types)

Located in `src/module/data/item/`:

| Category | Types |
|----------|-------|
| **Equipment** | weapon, armour, ammunition, gear, cybernetic, forceField, backpack, storageLocation |
| **Character Features** | talent, trait, skill, originPath, aptitude, peer, enemy |
| **Powers** | psychicPower, navigatorPower, ritual, order |
| **Ship/Vehicle** | shipComponent, shipWeapon, shipUpgrade, shipRole, vehicleTrait, vehicleUpgrade |
| **Modifications** | weaponModification, armourModification, weaponQuality, attackSpecial |
| **Conditions** | condition, criticalInjury, mutation, malignancy, mentalDisorder |
| **Other** | specialAbility, journalEntry |

### Shared Templates (Mixins)

Located in `src/module/data/shared/`:

| Template | Used By | Fields |
|----------|---------|--------|
| DescriptionTemplate | Most items | description (HTML) |
| PhysicalItemTemplate | Physical items | weight, availability, craftsmanship |
| EquippableTemplate | Wearables | equipped, slot |
| AttackTemplate | Weapons, powers | toHit, range, rateOfFire, special |
| DamageTemplate | Weapons, powers | damage, damageType, penetration |
| ModifiersTemplate | Talents, traits | characteristic/skill/combat modifiers |

### Custom Fields

Located in `src/module/data/fields/`:

| Field | Purpose |
|-------|---------|
| FormulaField | Validated roll formulas (e.g., "2d10+5") |
| IdentifierField | Slugified identifier strings |

### Key Schema Patterns

**Characteristics:**
```javascript
characteristics: {
  weaponSkill: {
    label, short, base, advance, modifier, unnatural, cost,
    total, bonus  // Derived
  }
  // ... 9 more
}
```

**Skills:**
```javascript
skills: {
  acrobatics: { label, characteristic, trained, plus10, plus20, bonus, current },
  commonLore: { ..., entries: [{ name, trained, plus10, plus20, current }] }
  // Specialist skills have entries array
}
```

**Armour by Location:**
```javascript
armour: {
  head: { total, toughnessBonus, traitBonus, value },
  body: { ... }, leftArm: { ... }, rightArm: { ... }, leftLeg: { ... }, rightLeg: { ... }
}
```

---

## Documents

Located in `src/module/documents/`

### Document Responsibilities

| Document | Responsibility |
|----------|---------------|
| **RogueTraderBaseActor** | Token setup, characteristic getters, legacy compatibility |
| **RogueTraderAcolyte** | Roll methods (characteristic, skill, weapon), fate actions |
| **RogueTraderNPC** | Minimal - inherits most from base |
| **RogueTraderStarship** | Ship initiative, component management |
| **RogueTraderVehicle** | Vehicle-specific actions |
| **RogueTraderItem** | Item type flags (isTalent, isTrait, etc.) |
| **RogueTraderActiveEffect** | Effect application |
| **ChatMessageRT** | Enhanced chat messages |

### Key Roll Methods (RogueTraderAcolyte)

```javascript
// Characteristic test with dialog
await actor.rollCharacteristic("weaponSkill", "Melee Attack");

// Skill test with optional specialization
await actor.rollSkill("dodge");
await actor.rollSkill("commonLore", "Imperium");

// Quick roll without dialog
await actor.rollCharacteristicCheck("agility");
await actor.rollCheck(targetNumber);

// Item usage
await actor.rollItem(itemId);  // Weapon attack, power, force field
await actor.damageItem(itemId); // Damage roll only
```

---

## ApplicationV2 Sheets

All sheets use **Foundry V13 ApplicationV2** with the **PARTS system**.

### Sheet Mixin Stack

```javascript
// BaseActorSheet inherits from this 8-mixin stack:
WhatIfMixin(
  DragDropVisualMixin(
    ContextMenuMixin(
      CollapsiblePanelMixin(
        EnhancedAnimationsMixin(
          VisualFeedbackMixin(
            TooltipMixin(
              PrimarySheetMixin(
                ApplicationV2Mixin(ActorSheetV2)
              )
            )
          )
        )
      )
    )
  )
)
```

### PARTS System

Each sheet defines `static PARTS` for modular template rendering:

```javascript
static PARTS = {
  header: {
    template: "systems/rogue-trader/templates/actor/acolyte/header.hbs"
  },
  overview: {
    template: "systems/rogue-trader/templates/actor/acolyte/tab-overview.hbs",
    container: { classes: ["rt-body"], id: "tab-body" },
    scrollable: [""]
  },
  // ... more parts
};
```

### Tab Configuration

```javascript
static TABS = [
  { tab: "overview", label: "RT.Tabs.Overview", group: "primary", cssClass: "tab-overview" },
  { tab: "combat", label: "RT.Tabs.Combat", group: "primary", cssClass: "tab-combat" },
  // ...
];

tabGroups = {
  primary: "overview"  // Default active tab
};
```

### AcolyteSheet PARTS (11 parts)

| Part | Template | Description |
|------|----------|-------------|
| `header` | acolyte/header.hbs | Portrait, name, player, career, rank |
| `tabs` | acolyte/tabs.hbs | 9-tab navigation bar |
| `overview` | acolyte/tab-overview.hbs | Ultra-dense dashboard |
| `status` | acolyte/tab-status.hbs | Detailed tracking (wounds, XP, effects) |
| `combat` | acolyte/tab-combat.hbs | "Battle Station" with weapons/armour |
| `skills` | acolyte/tab-skills.hbs | Skills panel with training buttons |
| `talents` | acolyte/tab-talents.hbs | Specialist skills, talents, traits |
| `equipment` | acolyte/tab-equipment.hbs | "Loadout Manager" with containers |
| `powers` | acolyte/tab-powers.hbs | Psychic, navigator, orders, rituals |
| `dynasty` | acolyte/tab-dynasty.hbs | Profit factor, acquisitions |
| `biography` | acolyte/tab-biography.hbs | Identity, origin path, journal |

### Context Preparation Flow

```
_prepareContext(options)
  ↓ Shared data for ALL parts
  - actor, system, source, fields
  - characteristics with HUD data
  - categorized items (computed fresh)
  ↓
_preparePartContext(partId, context, options)
  ↓ Routes to part-specific methods
  - _prepareHeaderContext()
  - _prepareOverviewContext()
  - _prepareCombatTabContext()
  - _prepareEquipmentContext()
  - etc.
```

**No Sheet-Level Caching**: As of January 2026, sheets do NOT cache computed data (items, origin paths, etc.). Each render computes fresh data. This is simpler and more reliable:
- Trust Foundry's reactive system to trigger re-renders when needed
- Trust DataModel's `prepareDerivedData` for heavy computations
- Avoid cache invalidation bugs and timing issues
- Item categorization (~100 items) is fast enough on modern hardware


### Action Handlers (ApplicationV2 Pattern)

```javascript
static DEFAULT_OPTIONS = {
  actions: {
    roll: ClassName.#onRoll,           // Private static method
    adjustStat: ClassName.#adjustStat,
    itemEdit: ClassName.#itemEdit,
    togglePanel: ClassName._onTogglePanel
  }
};

// Static private method - 'this' bound to sheet instance
static async #onRoll(event, target) {
  await this.actor.rollCharacteristic(target.dataset.rollTarget);
}
```

### Template Data Attributes

```handlebars
{{!-- V2 action handler --}}
<button data-action="roll" data-roll-target="weaponSkill">Roll WS</button>

{{!-- Item operations --}}
<button data-action="itemEdit" data-item-id="{{item.id}}">Edit</button>

{{!-- Stat adjustment --}}
<button data-action="adjustStat" data-field="system.wounds.value" data-delta="1">+1</button>
```

---

## Mixins

Located in `src/module/applications/api/`

| Mixin | File | Purpose |
|-------|------|---------|
| **ApplicationV2Mixin** | application-v2-mixin.mjs | Core V2 setup, collapse tracking |
| **PrimarySheetMixin** | primary-sheet-mixin.mjs | PLAY/EDIT modes, tabs, document CRUD |
| **DragDropAPIMixin** | drag-drop-api-mixin.mjs | Core drag/drop handlers |
| **TooltipMixin** | tooltip-mixin.mjs | RTTooltip integration |
| **VisualFeedbackMixin** | visual-feedback-mixin.mjs | Flash/pulse animations |
| **EnhancedAnimationsMixin** | enhanced-animations-mixin.mjs | Counter animations, bar fills |
| **CollapsiblePanelMixin** | collapsible-panel-mixin.mjs | Panel state persistence + presets |
| **ContextMenuMixin** | context-menu-mixin.mjs | Right-click context menus |
| **DragDropVisualMixin** | drag-drop-visual-mixin.mjs | Visual drag feedback, drop zones |
| **WhatIfMixin** | what-if-mixin.mjs | Preview stat changes before commit |

### CollapsiblePanelMixin Features

- Panel state persisted to user flags
- Panel presets: combat, social, exploration, all, none
- Keyboard shortcuts: Alt+1-9 to toggle panels
- Shift+Click to collapse all except one
- Animated expand/collapse transitions

---

## Templates

Located in `src/templates/` (~150 .hbs files)

### Directory Structure

```
templates/
├── actor/
│   ├── acolyte/           # Character sheet PARTS (13 files)
│   ├── npc/               # NPC sheet templates
│   ├── starship/          # Starship sheet templates
│   ├── vehicle/           # Vehicle sheet templates
│   ├── panel/             # Reusable panel partials (44 files)
│   └── partial/           # Misc partials
├── item/                  # Item sheet templates (30 files)
│   └── panel/             # Item-specific panels
├── chat/                  # Chat message templates (12 files)
├── prompt/                # Roll prompt templates (7 files)
├── prompts/               # Dialog templates
├── dialogs/               # Additional dialogs
├── hud/                   # Token HUD templates
└── applications/          # Misc application templates
```

### Key Panel Partials (templates/actor/panel/)

| Panel | Description |
|-------|-------------|
| wounds-panel-v2.hbs | Wounds tracker with pips, progress bar |
| fatigue-panel-v2.hbs | Fatigue tracker, TB threshold |
| fate-panel-v2.hbs | Golden star pips, spend/restore |
| corruption-panel-v2.hbs | Degree badges, malignancy list |
| insanity-panel-v2.hbs | Degree badges, disorder list |
| experience-panel-v2.hbs | XP tracker (total/spent/available) |
| characteristic-panel.hbs | Characteristics grid with HUD |
| skills-panel.hbs | Skills with training toggles |
| skills-specialist-panel.hbs | Specialist skills with entries |
| weapon-panel.hbs | Weapon list with attack buttons |
| armour-display-panel.hbs | 6-location armour with roll bands |
| combat-station-panel.hbs | Tactical overlay with vitals |
| loadout-equipment-panel.hbs | Card-based equipment display |
| active-effects-panel.hbs | Active effects list |

### Template Loading Strategy

**As of January 2026**: All templates are loaded at system initialization for simplicity and reliability.

The `HandlebarManager.loadTemplates()` preloads all system templates (~120 files) at startup:
- All actor sheet templates (acolyte, npc, starship, vehicle)
- All panel partials
- All chat templates and roll prompts
- All item sheet templates

**Why no lazy loading?**
- Simpler architecture - no tracking of loaded state
- More reliable - no timing issues or missing templates
- Minimal performance impact - modern browsers handle this well
- Eliminates a class of bugs related to template availability

```javascript
// In HandlebarManager
static async loadTemplates() {
    return this.preloadHandlebarsTemplates();
}
```

### Template Data Context

**CRITICAL PATTERN**: Templates receive `system` directly in context from `_prepareContext`:

```javascript
// In BaseActorSheet._prepareContext()
const context = {
    actor: this.actor,
    system: this.actor.system,  // ← Exposed for templates
    source: this.isEditable ? this.actor.system._source : this.actor.system,
    // ...
};
```

**Template Usage**:
```handlebars
{{!-- CORRECT - use system directly --}}
<input name="system.wounds.value" value="{{system.wounds.value}}" />

{{!-- WRONG - do not use actor.system in templates --}}
<input name="system.wounds.value" value="{{actor.system.wounds.value}}" />
```

**JavaScript Usage**:
```javascript
// In sheet methods, use this.actor.system
static async #adjustStat(event, target) {
    const current = this.actor.system.wounds?.value || 0;
    await this.actor.update({ "system.wounds.value": current + 1 });
}
```

---

## SCSS Architecture

Located in `src/scss/` (~105 files)

### Directory Structure

```
scss/
├── rogue-trader.scss      # Main entry (imports all partials)
├── _fonts.scss            # Modesto Condensed font definitions
├── abstracts/             # Variables, mixins, themes
│   ├── _variables.scss    # Design tokens (colors, spacing, typography)
│   ├── _mixins.scss       # Reusable SCSS mixins
│   ├── _gothic-theme.scss # Dark gothic palette
│   ├── _index.scss        # Abstracts barrel
│   └── _unified-components.scss
├── base/                  # Base element styles
├── layout/                # Grid, sheet base
├── actor/                 # Actor sheet styles
├── panels/                # Panel component styles (27 files)
├── components/            # Buttons, forms, tooltips, animations
├── item/                  # Item sheet styles
├── prompts/               # Dialog styles
├── chat/                  # Chat card styles
├── dialogs/               # Dialog-specific styles
└── journals.scss          # Journal styles
```

### Design System Variables

```scss
// Colors - Imperial Gothic Theme
$rt-color-gold: #c9a227;
$rt-color-crimson: #8b0000;
$rt-color-success: #2d5016;
$rt-color-failure: #6b1010;

// Backgrounds (use Foundry CSS vars for theme adaptation)
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

// Tab Accent Colors
$rt-accent-combat: #a82020;
$rt-accent-skills: #2a7a9a;
$rt-accent-talents: #a07818;
$rt-accent-equipment: #3a5f5f;
$rt-accent-powers: #6a2090;
$rt-accent-dynasty: #d4a520;
```

### Panel Component Pattern

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
  cursor: pointer;
}

.rt-panel-body {
  padding: $rt-space-md;
}

.rt-panel.collapsed .rt-panel-body {
  display: none;
}
```

### Unified Component Library

**Location**: `src/scss/abstracts/_unified-components.scss`

This is the **single source of truth** for all reusable UI components. All other files should reference these canonical definitions, not create duplicates.

#### Core Components

| Component | Classes | Purpose |
|-----------|---------|---------|
| **Panel** | `.rt-panel`, `.rt-panel-header`, `.rt-panel-body` | Collapsible content sections |
| **Vital Stat** | `.rt-vital-stat`, `.rt-vital-stat-header`, `.rt-vital-stat-body` | Compact stat cards (wounds, fate, etc.) |
| **Dropzone** | `.rt-dropzone`, `.rt-dropzone-icon`, `.rt-dropzone-text` | Drag-drop target areas |
| **Actions Group** | `.rt-actions-group-header`, `.rt-group-icon` | Section headers |
| **Buttons** | `.rt-btn-primary`, `.rt-btn-control`, `.rt-btn-icon`, `.rt-btn-quick` | All button variants |
| **Inputs** | `.rt-input`, `.rt-input-numeric`, `.rt-input-inline`, `.rt-select`, `.rt-textarea` | All input variants |

#### Panel Accent Modifiers

Use modifiers to apply accent colors to panels:

```handlebars
<div class="rt-panel rt-panel--wounds">...</div>
<div class="rt-panel rt-panel--fatigue">...</div>
<div class="rt-panel rt-panel--skills">...</div>
```

Available modifiers: `--wounds`, `--fatigue`, `--fate`, `--corruption`, `--insanity`, `--skills`, `--talents`, `--equipment`, `--powers`, `--dynasty`, `--bio`, `--combat`, `--xp`

#### Vital Stat Variants

```handlebars
<div class="rt-vital-stat rt-vital-wounds">
  <div class="rt-vital-stat-header">
    <span class="rt-vital-label">
      <i class="fa-solid fa-heart"></i>
      Wounds
    </span>
  </div>
  <div class="rt-vital-stat-body">
    <div class="rt-vital-readout">
      <span class="rt-vital-value">{{system.wounds.value}}</span>
      <span class="rt-vital-max-label">/ {{system.wounds.max}}</span>
    </div>
  </div>
</div>
```

Available variants: `.rt-vital-wounds`, `.rt-vital-fatigue`, `.rt-vital-fate`
Warning states: `.rt-vital-warning`, `.rt-vital-critical`

#### Dropzone States

```handlebars
<div class="rt-dropzone" data-drop-type="weapon">
  <i class="rt-dropzone-icon fa-solid fa-plus"></i>
  <span class="rt-dropzone-text">Drop Weapon Here</span>
</div>

<!-- Compact variant when items exist -->
<div class="rt-dropzone rt-dropzone--compact">...</div>

<!-- Active drag state (applied via JS) -->
<div class="rt-dropzone rt-dropzone--active">...</div>
```

#### Button Variants

```handlebars
<!-- Primary action (roll, use) -->
<button class="rt-btn-primary" data-action="roll">
  <i class="fa-solid fa-dice-d20"></i>
  Roll
</button>

<!-- Stat control (±) -->
<button class="rt-btn-control rt-btn-control--minus">
  <i class="fa-solid fa-minus"></i>
</button>

<!-- Icon button (config, delete) -->
<button class="rt-btn-icon rt-btn-icon--delete">
  <i class="fa-solid fa-trash"></i>
</button>

<!-- Quick action (rest, heal) -->
<button class="rt-btn-quick rt-btn-quick--success">
  <i class="fa-solid fa-bed"></i>
  Rest
</button>
```

#### DO NOT Duplicate

**Never create panel/dropzone/vital-stat styles in individual panel SCSS files.** All these components are defined once in `_unified-components.scss`. If you need panel-specific behavior:

1. Use CSS custom properties (`--panel-accent`, `--vital-color`)
2. Add modifiers to the unified component
3. Extend the unified component with additional classes

**Example of correct extension**:
```scss
// In _combat-station.scss
.rt-vital-header-clickable {
  // Combat-specific extension of unified .rt-vital-stat
  display: flex;
  // ... additional combat-specific styles
}
```

**Example of WRONG duplicate** (DO NOT DO THIS):
```scss
// In _loadout.scss - WRONG!
.rt-dropzone {
  display: flex;
  // ... duplicate definition
}
```

### Naming Conventions

- `.rt-` prefix for all custom classes
- BEM-style: `.rt-panel__header`, `.rt-panel--collapsed`
- Tab-specific: `.tab-combat .rt-panel-header` for accent colors

---

## Configuration

Located in `src/module/config.mjs` and `src/module/rules/config.mjs`

### CONFIG.rt (Game Rules)

Registered to `CONFIG.rt` at init:

| Property | Description |
|----------|-------------|
| characteristics | WS, BS, S, T, Ag, Int, Per, WP, Fel, Inf definitions |
| availabilities | Ubiquitous to Unique with modifiers |
| craftsmanships | Poor, Common, Good, Best with modifiers |
| damageTypes | Impact, Rending, Explosive, Energy, Fire, Shock, Cold, Toxic |
| weaponClasses | Melee, Pistol, Basic, Heavy, Thrown, Exotic |
| weaponTypes | Primitive, Las, Bolt, Melta, Plasma, etc. |
| weaponQualities | 70+ quality definitions with hasLevel flag |
| gearCategories | General, Tools, Drugs, Medical, Tech, etc. |
| armourTypes | Light, Medium, Heavy, Power |
| hitLocations | Head, Body, Left/Right Arm, Left/Right Leg with roll ranges |

### CONFIG.ROGUE_TRADER (System Config)

Alias for `CONFIG.rt`.

### Global Namespace (game.rt)

```javascript
game.rt = {
  debug: false,
  log: (s, o) => ...,      // Debug logging
  warn: (s, o) => ...,
  error: (s, o) => ...,
  
  // Macro helpers
  rollItemMacro,
  rollSkillMacro,
  rollCharacteristicMacro,
  
  // Roll tables
  rollPsychicPhenomena: (actor, mod) => ...,
  rollPerilsOfTheWarp: (actor) => ...,
  rollFearEffects: (fear, dof) => ...,
  rollMutation: () => ...,
  rollMalignancy: () => ...,
  
  // UI
  openCompendiumBrowser: (options) => ...,
  
  // Dice classes
  dice: { BasicRollRT, D100Roll },
  D100Roll,
  BasicRollRT
};
```

---

## Dice & Rolls

Located in `src/module/dice/`

### D100Roll Class

Specialized roll for d100 skill/characteristic tests:

```javascript
const roll = await D100Roll.build({
  actor: this,
  target: char.total,
  baseTarget: char.total,
  flavor: "Weapon Skill Test",
  type: "characteristic",
  characteristic: "weaponSkill"
});

// Properties
roll.target         // Target number
roll.isSuccess      // roll <= target
roll.isFailure      // roll > target
roll.degreesOfSuccess   // floor((target - roll) / 10) + 1
roll.degreesOfFailure   // floor((roll - target) / 10) + 1
roll.isCriticalSuccess  // 01-05 OR 3+ DoS
roll.isCriticalFailure  // 96-00 OR 3+ DoF
roll.isDoubles          // 11, 22, 33, etc.
roll.triggersRighteousFury  // Success + doubles
```

### BasicRollRT Class

Base roll class that D100Roll extends. Handles:
- Configuration dialog display
- Roll evaluation
- Chat message creation
- Roll result serialization

### Roll Data Classes

Located in `src/module/rolls/`:

| Class | Purpose |
|-------|---------|
| RollData | Base roll data |
| ActionData | Action roll configuration |
| DamageData, Hit | Damage roll handling |
| AssignDamageData | Damage assignment to targets |
| ForceFieldData | Force field test data |

---

## Actions

Located in `src/module/actions/`

### Action Managers

| Manager | Purpose |
|---------|---------|
| DHBasicActionManager | Simple chat messages, item vocalization |
| DHCombatActionManager | Combat-specific actions |
| DHTargetedActionManager | Weapon attacks, psychic powers with targeting |

### Targeted Action Flow

```javascript
// Weapon attack
await DHTargetedActionManager.performWeaponAttack(actor, target, weapon);

// Psychic power
await DHTargetedActionManager.performPsychicAttack(actor, target, power);
```

---

## Item Types

### Physical Items

| Type | Has Equipped | Has Weight | Notes |
|------|-------------|------------|-------|
| weapon | ✓ | ✓ | class, type, clip, rateOfFire, special |
| armour | ✓ | ✓ | armourPoints by location, maxAgility |
| gear | ✓ | ✓ | category, quantity |
| cybernetic | ✓ | ✓ | slot, modifiers |
| forceField | ✓ | ✓ | protectionRating, overloadChance |
| ammunition | - | ✓ | quantity, damageModifier |

### Character Features

| Type | Notes |
|------|-------|
| talent | modifiers, prerequisites, tier |
| trait | modifiers, level (stackable) |
| skill | characteristic, training levels |
| originPath | stepIndex (1-6), modifiers |
| psychicPower | discipline, threshold, damage |
| navigatorPower | mutation risk |
| order | rank requirements |
| ritual | extended test |

### Ship/Vehicle Items

| Type | Notes |
|------|-------|
| shipComponent | slot, power, space, essential |
| shipWeapon | arc, strength, damage, crit rating |
| shipUpgrade | bonuses, requirements |
| shipRole | abilities granted |
| vehicleTrait | handling modifiers |
| vehicleUpgrade | stat bonuses |

### Item Flags & Getters

```javascript
item.isTalent       // type === 'talent'
item.isTrait        // type === 'trait'
item.isOriginPath   // trait with flags.rt.kind === 'origin'
item.isCondition    // type === 'condition'
item.isPsychicPower // type === 'psychicPower'
item.isNavigatorPower
item.isShipRole
item.isRanged       // Weapon: pistol/basic/heavy class
item.isMelee        // Weapon: melee class
```

---

## Compendium Packs

Located in `src/packs/` (35 packs)

### Pack Structure

Each pack has a `_source/` folder containing JSON files:
```
src/packs/rt-items-weapons/
└── _source/
    ├── autopistol.json
    ├── bolt-pistol.json
    └── ...
```

### Available Packs

| Pack | Type | Description |
|------|------|-------------|
| rt-items-weapons | Item | 100+ weapons |
| rt-items-armour | Item | Armour sets |
| rt-items-gear | Item | Equipment |
| rt-items-talents | Item | Character talents |
| rt-items-traits | Item | Traits |
| rt-items-psychic-powers | Item | Psychic disciplines |
| rt-items-origin-path | Item | Origin path options (6 steps) |
| rt-items-skills | Item | Skill templates |
| rt-items-conditions | Item | Status conditions |
| rt-items-critical-injuries | Item | Critical injury tables |
| rt-items-ship-components | Item | Ship components |
| rt-items-ship-weapons | Item | Ship weapons |
| rt-actors-bestiary | Actor | NPCs and creatures |
| rt-actors-ships | Actor | Pre-built ships |
| rt-actors-vehicles | Actor | Vehicles |
| rt-journals-* | JournalEntry | Rules references |
| rt-rolltables-* | RollTable | Random tables |

### Pack Compilation

Packs compile to LevelDB format for Foundry V13:

```javascript
// gulpfile.js
async function compilePacks() {
  const db = new ClassicLevel(dbPath, { valueEncoding: 'json' });
  for (const doc of documents) {
    await db.put(`!items!${doc._id}`, doc);
  }
}
```

---

## Coding Style & Patterns

### JavaScript Style

- ES Modules (`.mjs` extension)
- Class-based with static methods for actions
- Private methods with `#` prefix
- JSDoc comments for public APIs
- Foundry V13 field types from `foundry.data.fields`

### ApplicationV2 Action Pattern

```javascript
// Define in DEFAULT_OPTIONS
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

### DataModel Schema Pattern

```javascript
static defineSchema() {
  const fields = foundry.data.fields;
  return {
    ...super.defineSchema(),
    myField: new fields.NumberField({
      required: true,
      initial: 0,
      integer: true,
      min: 0
    }),
    myNestedField: new fields.SchemaField({
      value: new fields.NumberField({ ... }),
      max: new fields.NumberField({ ... })
    })
  };
}
```

### Template Pattern

```handlebars
<div class="rt-panel" data-panel-id="wounds">
  <header class="rt-panel-header" data-action="togglePanel">
    <i class="fa-solid fa-heart"></i>
    <span>{{localize "RT.Wounds"}}</span>
    <i class="fa-solid fa-chevron-down rt-panel-toggle"></i>
  </header>
  <div class="rt-panel-body">
    {{!-- Panel content --}}
  </div>
</div>
```

### SCSS Pattern

```scss
// Use variables from abstracts
.rt-my-component {
  background: $rt-bg-paper;
  padding: $rt-space-md;
  border: 1px solid $rt-border-light;
  border-radius: $rt-radius-md;
  
  &__header {
    color: $rt-color-gold;
    font-family: $rt-font-heading;
  }
  
  &--active {
    box-shadow: $rt-shadow-glow-gold;
  }
}
```

---

## Testing Changes

### Build & Verify

```bash
npm run build           # Full build
gulp scss               # SCSS only
gulp packs              # Packs only
```

### Check for Errors

1. Run `npm run build` - must complete without errors
2. Open Foundry, check browser console for errors
3. Test affected functionality:
   - Open character sheet, check all tabs
   - Test roll buttons
   - Verify item creation/editing
   - Check drag/drop

### Common Test Cases

- [ ] Skill training buttons (T/+10/+20)
- [ ] Stat adjustment buttons (wounds, fate, fatigue)
- [ ] Armour display (all 6 locations)
- [ ] Encumbrance calculation
- [ ] Experience tracking
- [ ] Weapon attacks
- [ ] Psychic power tests

---

## Common Gotchas

### 1. Template Data Context - Use `system.` not `actor.system.`

**CRITICAL**: In Handlebars templates, always use `{{system.xxx}}` not `{{actor.system.xxx}}`.

```handlebars
{{!-- CORRECT --}}
<input name="system.wounds.value" value="{{system.wounds.value}}" />

{{!-- WRONG --}}
<input name="system.wounds.value" value="{{actor.system.wounds.value}}" />
```

The `system` property is exposed directly in template context from `_prepareContext`. In JavaScript action handlers, use `this.actor.system`.

### 2. No Template Lazy Loading

All templates are preloaded at system init. Do NOT call `HandlebarManager.loadAcolyteTabTemplates()` or similar - these methods no longer exist.

### 3. No Sheet-Level Caching

Do NOT cache computed data in sheet properties. Compute fresh on each render. Trust Foundry's reactive system and DataModel caching.

```javascript
// WRONG - do not cache
_cachedItems = null;
_getCategorizedItems() {
    if (this._cachedItems) return this._cachedItems;
    // ...
}

// CORRECT - compute fresh
_getCategorizedItems() {
    const categories = { /* ... */ };
    // compute categories
    return categories;
}
```

### 4. Template Field Names Must Match Schema

If template uses `{{system.endeavour.name}}`, schema must have `endeavour` not `endeavours`.

### 5. jQuery vs Vanilla JS

Use `element.dataset.xxx` not `$(element).data('xxx')` for data attributes.

### 6. Duplicate Handlers

Check parent class before adding handlers in child class - may already exist.

### 7. DataModel Item Access

Use `this.parent.items` in DataModel to access actor's items (not `this.items`).

### 8. prepareEmbeddedData Timing

Called after items are ready, from Document's `prepareData()`. Do NOT call in DataModel's `prepareDerivedData()`.

### 9. Tab Property Naming

Always use `tab:` property in TABS array, not `id:`. PrimarySheetMixin expects `{ tab: "name", ... }`.

### 10. ApplicationV2 Classes

V2 doesn't auto-add `sheet` class like V1. Include `"sheet"` in classes array for CSS selectors.

### 11. V2 Integer Validation

Foundry V13 is stricter about integer fields. Use `migrateData()` and `cleanData()` to coerce values.

### 12. Form Submission

With `submitOnChange: true`, partial form data may overwrite existing values. Use specific field updates.

### 13. Pack IDs

Foundry V13 requires exactly 16 alphanumeric characters for document IDs.

---

## Reference Links

- **Foundry V13 API**: https://foundryvtt.com/api/
- **dnd5e System** (architecture reference): Check `/home/aqui/dnd5e/`
- **DataModel Docs**: https://foundryvtt.com/article/system-data-models/
- **Rogue Trader Rules**: `resources/RogueTraderInfo.md`


---

## Origin Path System

The Origin Path System is a character creation feature that walks players through a 6-step flowchart to define their character's background. Each step grants characteristics, skills, talents, traits, equipment, and special abilities.

### Architecture Overview

| Component | Location | Purpose |
|-----------|----------|---------|
| **Data Model** | `src/module/data/item/origin-path.mjs` | Schema, validation, navigation data |
| **Builder UI** | `src/module/applications/character-creation/origin-path-builder.mjs` | Main ApplicationV2 interface |
| **Grants Processor** | `src/module/utils/origin-grants-processor.mjs` | Applies grants to characters |
| **Formula Evaluator** | `src/module/utils/formula-evaluator.mjs` | Evaluates wounds/fate formulas |
| **Roll Dialog** | `src/module/applications/character-creation/origin-roll-dialog.mjs` | Interactive rolling |
| **Choice Dialog** | `src/module/applications/character-creation/origin-path-choice-dialog.mjs` | Choice selection |
| **Chart Layout** | `src/module/utils/origin-chart-layout.mjs` | Visual flowchart positioning |

### The 6 Steps

| Index | Step | Description |
|-------|------|-------------|
| 0 | `homeWorld` | Origin world (Forge World, Hive World, etc.) |
| 1 | `birthright` | Social position at birth |
| 2 | `lureOfTheVoid` | What drew the character to space |
| 3 | `trialsAndTravails` | Significant event in their past |
| 4 | `motivation` | Core drive or ambition |
| 5 | `career` | Starting career path |

### Data Model Schema

```javascript
// Core fields
{
  stepIndex: NumberField,        // 0-5, which step this origin represents
  position: NumberField,         // 0-8, chart position (center=4, extremes=0/8)
  
  grants: {
    characteristics: {},         // { weaponSkill: 5, toughness: 5, ... }
    skills: {},                  // { athletics: 1, awareness: 1, ... }
    talents: [],                 // ["Weapon Training (Chain)"]
    traits: [],                  // ["Hive-Bound"]
    equipment: [],               // ["Laspistol", "Guard Flak Armour"]
    specialAbilities: [],        // ["Night Vision"]
    aptitudes: [],               // ["Agility", "Finesse"]
    woundsFormula: "",           // "2xTB+1d5" or ""
    fateFormula: "",             // "(1-5|=2),(6-10|=3)" or ""
    corruption: 0,
    insanity: 0,
    choices: []                  // Choice grants (see below)
  },
  
  navigation: {
    connectsTo: []               // Valid next positions [0,1,2,3,4,5,6,7,8]
  },
  
  selectedChoices: {},           // Player's selections { "Choose Skill": ["Awareness"] }
  
  rollResults: {
    wounds: { formula, rolled, breakdown, timestamp },
    fate: { formula, rolled, breakdown, timestamp }
  },
  
  activeModifiers: {}            // Computed from selectedChoices
}
```

### Choice Grants Structure

Origins can offer choices to players. Each choice has a label, selection count, and options:

```javascript
grants.choices: [
  {
    label: "Choose a Skill",
    count: 1,                    // How many options to pick
    options: [
      {
        label: "Awareness +10",
        grants: {
          skills: { awareness: 1 },
          talents: [],
          traits: [],
          equipment: [],
          corruption: 0,
          insanity: 0
        }
      },
      // ... more options
    ]
  }
]
```

### Formula Syntax

**Wounds Formulas** (`grants.woundsFormula`):
- `2xTB+1d5` - 2 × Toughness Bonus + 1d5
- `TB+5` - Toughness Bonus + 5
- Supports: `TB` (Toughness), `WB` (Willpower), `SB` (Strength), `AB` (Agility), `IB` (Intelligence), `PB` (Perception), `FB` (Fellowship)

**Fate Formulas** (`grants.fateFormula`):
- `(1-5|=2),(6-10|=3)` - Roll 1d10; 1-5 = 2 Fate, 6-10 = 3 Fate
- `(1-4|=2),(5-8|=3),(9-10|=4)` - Three-tier conditional
- Format: `(min-max|=value)` segments separated by commas

### Grants Processor

The `OriginGrantsProcessor` utility processes all selected origins and applies their grants:

```javascript
import { OriginGrantsProcessor } from "../utils/origin-grants-processor.mjs";

// Process all origin items for an actor
const result = await OriginGrantsProcessor.processOriginGrants(originItems, actor);

// Result contains:
{
  characteristics: { weaponSkill: 10, toughness: 5, ... },
  itemsToCreate: [ /* skill, talent, trait Item data */ ],
  woundsBonus: 12,               // From woundsFormula evaluation
  fateBonus: 3,                  // From fateFormula evaluation
  corruptionBonus: 5,
  insanityBonus: 0,
  aptitudes: ["Agility", "Finesse", ...]
}
```

### Builder Workflow

1. **Drag origins** from compendium onto the 6 step slots OR click an origin card to preview it
2. **Click "Confirm Selection"** button to lock in the previewed origin
   - If changing an already-selected step, user is warned which later steps will be reset
3. **Make choices** when prompted (skill selection, talent picks, etc.)
   - All choice options now have "View Item Sheet" buttons (talents, traits, equipment, skills)
   - Skill UUIDs are looked up automatically using the Skill UUID Helper
4. **Roll stats** if the origin has wounds/fate formulas
5. **Preview bonuses** in the right-side panel
6. **Navigate steps** freely without warnings (warnings only appear on confirmation)
7. **Commit path** to apply all grants to the character

### Navigation Behavior

- **Click step indicator**: Jump to that step (no warning)
- **Click origin card**: Preview in panel (no selection yet)
- **Click "Confirm Selection"**: Lock in preview, check for cascade resets, warn if needed
- **Change existing selection**: Warns about resetting later steps before confirming

This flow is more intuitive: users can browse freely, but get warned before making destructive changes.

### Key Methods

**OriginPathData (Data Model)**:
- `prepareBaseData()` - Initializes tracking objects
- `prepareDerivedData()` - Calculates activeModifiers from selectedChoices
- `_calculateActiveModifiers()` - Iterates choices and sums grants
- `_prepareNavigationData()` - Sets valid chart connections

**OriginPathBuilder (ApplicationV2)**:
- `#commitPath()` - Processes all origins and updates actor
- `#rollStat()` - Opens OriginRollDialog for wounds/fate
- `#makeChoice()` - Opens OriginPathChoiceDialog
- `_calculateBonuses()` - Computes preview panel data

**OriginGrantsProcessor**:
- `processOriginGrants()` - Main entry point
- `_processChoiceGrants()` - Extracts grants from selectedChoices
- `_collectItems()` - Creates talent/skill/trait item data

### Templates

| Template | Purpose |
|----------|---------|
| `origin-path-builder.hbs` | Main builder with 6-step flowchart |
| `origin-roll-dialog.hbs` | Interactive roll dialog |
| `origin-path-choice-dialog.hbs` | Choice selection modal |
| `origin-roll-chat-card.hbs` | Chat message for roll results |

### SCSS Files

| File | Purpose |
|------|---------|
| `_origin-path-builder.scss` | Builder layout, steps, controls |
| `_origin-path-modern.scss` | Modern item sheet styling |
| `_origin-roll-dialog.scss` | Roll dialog styling |

---

## Appendix A: Handlebars Helpers Reference

Located in `src/module/handlebars/handlebars-helpers.mjs`

### General Helpers

| Helper | Usage | Description |
|--------|-------|-------------|
| `eq` | `{{#if (eq a b)}}` | Equality check |
| `ne` | `{{#if (ne a b)}}` | Not equal check |
| `gt` | `{{#if (gt a b)}}` | Greater than |
| `gte` | `{{#if (gte a b)}}` | Greater than or equal |
| `lt` | `{{#if (lt a b)}}` | Less than |
| `lte` | `{{#if (lte a b)}}` | Less than or equal |
| `and` | `{{#if (and a b)}}` | Logical AND |
| `or` | `{{#if (or a b)}}` | Logical OR |
| `not` | `{{#if (not a)}}` | Logical NOT |

### Math Helpers

| Helper | Usage | Description |
|--------|-------|-------------|
| `add` | `{{add a b}}` | Addition |
| `subtract` | `{{subtract a b}}` | Subtraction |
| `multiply` | `{{multiply a b}}` | Multiplication |
| `divide` | `{{divide a b}}` | Division |
| `abs` | `{{abs value}}` | Absolute value |
| `floor` | `{{floor value}}` | Round down |
| `ceil` | `{{ceil value}}` | Round up |
| `round` | `{{round value}}` | Round to nearest |
| `percent` | `{{percent value max}}` | Calculate percentage |

### String Helpers

| Helper | Usage | Description |
|--------|-------|-------------|
| `capitalize` | `{{capitalize text}}` | Capitalize first letter |
| `uppercase` | `{{uppercase text}}` | UPPERCASE |
| `lowercase` | `{{lowercase text}}` | lowercase |
| `concat` | `{{concat a b c}}` | Concatenate strings |
| `truncate` | `{{truncate text 50}}` | Truncate to length |
| `slugify` | `{{slugify text}}` | Create URL slug |

### Array/Object Helpers

| Helper | Usage | Description |
|--------|-------|-------------|
| `join` | `{{join array ", "}}` | Join array with separator |
| `length` | `{{length array}}` | Array length |
| `includes` | `{{#if (includes array item)}}` | Check array contains |
| `first` | `{{first array}}` | First element |
| `last` | `{{last array}}` | Last element |
| `filter` | `{{#each (filter items "equipped" true)}}` | Filter by property |
| `sort` | `{{#each (sort items "name")}}` | Sort by property |

### System-Specific Helpers

| Helper | Usage | Description |
|--------|-------|-------------|
| `localize` | `{{localize "RT.Label"}}` | Localization |
| `signedNumber` | `{{signedNumber 5}}` → "+5" | Signed number display |
| `romanNumeral` | `{{romanNumeral 3}}` → "III" | Roman numeral |
| `formatWeight` | `{{formatWeight 2.5}}` → "2.5 kg" | Weight formatting |
| `availabilityLabel` | `{{availabilityLabel "rare"}}` | Availability localization |
| `craftsmanshipLabel` | `{{craftsmanshipLabel "good"}}` | Craftsmanship localization |
| `damageTypeLabel` | `{{damageTypeLabel "energy"}}` | Damage type label |
| `characteristicLabel` | `{{characteristicLabel "weaponSkill"}}` | Characteristic label |

### Weapon Quality Helpers

| Helper | Usage | Description |
|--------|-------|-------------|
| `specialQualities` | `{{#each (specialQualities weapon.special)}}` | Convert quality IDs to objects |
| `craftsmanshipQualities` | `{{#each (craftsmanshipQualities weapon)}}` | Get craftsmanship-derived qualities |
| `hasCraftsmanshipQualities` | `{{#if (hasCraftsmanshipQualities weapon)}}` | Check for auto-applied qualities |
| `hasEmbeddedQualities` | `{{#if (hasEmbeddedQualities items)}}` | Check for custom quality items |
| `qualityLookup` | `{{qualityLookup "tearing"}}` | Get single quality definition |

### Armour Helpers

| Helper | Usage | Description |
|--------|-------|-------------|
| `armourPointsForLocation` | `{{armourPointsForLocation armour "head"}}` | Get AP for location |
| `locationLabel` | `{{locationLabel "leftArm"}}` | Hit location label |
| `hitLocationRange` | `{{hitLocationRange "body"}}` | D100 roll range |

---

## Appendix B: Modifier System

### How Modifiers Work

Items can apply modifiers to actor stats via the `modifiers` field:

```javascript
// Item system.modifiers structure
{
  characteristics: {
    strength: 10,    // +10 to Strength
    agility: -5      // -5 to Agility
  },
  skills: {
    dodge: 10,       // +10 to Dodge
    awareness: 5     // +5 to Awareness
  },
  combat: {
    toHit: 5,        // +5 to hit rolls
    damage: 2,       // +2 damage
    initiative: 1,   // +1 initiative
    defence: 10      // +10 to defence (dodge/parry)
  },
  wounds: 2,         // +2 max wounds
  fate: 1,           // +1 max fate
  movement: 1        // +1 to movement rates
}
```

### Modifier Sources

Modifiers are tracked from multiple sources for transparency:

```javascript
actor.system.modifierSources = {
  characteristics: {
    strength: [
      { name: "Power Armour", type: "armour", id: "xxx", value: 10 },
      { name: "Unnatural Strength", type: "trait", id: "yyy", value: 5 }
    ]
  },
  skills: { ... },
  combat: {
    toHit: [...],
    damage: [...],
    initiative: [...],
    defence: [...]
  },
  wounds: [...],
  fate: [...],
  movement: [...]
}
```

### Items That Apply Modifiers

| Item Type | When Applied |
|-----------|--------------|
| `talent` | Always (if item exists) |
| `trait` | Always (if item exists) |
| `condition` | Always (if item exists) |
| `armour` | When `system.equipped === true` |
| `cybernetic` | When `system.equipped === true` |
| `gear` | When `system.equipped === true` |

### Getting Modifier Totals

```javascript
// In Document class
actor.getTotalCharacteristicModifier("strength")  // Returns total modifier
actor.getTotalSkillModifier("dodge")
actor.getTotalCombatModifier("toHit")
actor.getTotalWoundsModifier()
actor.getTotalFateModifier()
actor.getTotalMovementModifier()

// In DataModel
this._getTotalCharacteristicModifier(charKey)
this._getTotalSkillModifier(skillKey)
this._getTotalCombatModifier(combatKey)
```

---

## Appendix C: Fatigue System

### Core Rules (Rogue Trader Core, p. 232)

1. **Threshold**: Equal to Toughness Bonus (TB). Character can take TB levels of fatigue before collapsing.
2. **Any Fatigue**: -10 penalty to ALL Tests (does NOT stack - 1+ levels = -10).
3. **Exceeds TB**: Character collapses unconscious for (10 - TB) minutes.
4. **Upon Waking**: Fatigue resets to TB (threshold level).
5. **Recovery**: 1 hour rest = -1 fatigue. 8 consecutive hours = all fatigue removed.

### Implementation

```javascript
// In CreatureTemplate._prepareFatigue()
this.fatigue.max = this.characteristics.toughness.bonus;  // Auto-calculated

// Fatigue does NOT affect characteristics - only Test rolls
// The -10 penalty is applied at roll time, not to stats
```

---

## Appendix D: Skill UUID Helper

**Location**: `src/module/helpers/skill-uuid-helper.mjs`

Utility for looking up skill UUIDs from compendium packs. See [SKILL_UUID_HELPER.md](SKILL_UUID_HELPER.md) for full documentation.

### Key Functions

| Function | Purpose |
|----------|---------|
| `findSkillUuid(name, spec?)` | Find UUID for a skill by name and optional specialization |
| `batchFindSkillUuids(skills)` | Batch lookup multiple skills |
| `parseSkillName(fullName)` | Parse "Common Lore (Imperium)" into name + spec |
| `getSkillFromUuid(uuid)` | Load skill Item from UUID |
| `clearSkillUuidCache()` | Clear internal cache |

### Usage in Origin Path Builder

The choice dialog uses this helper to enable "View Item Sheet" buttons for skill grants:

```javascript
// Parse skill name and lookup UUID
const skillName = skillData.name || skillData;
const specialization = skillData.specialization || null;
const uuid = await findSkillUuid(skillName, specialization);

// Template can now show view button
{{#if option.uuid}}
    <button data-action="viewItem" data-uuid="{{option.uuid}}">
        <i class="fa-solid fa-eye"></i>
    </button>
{{/if}}
```

Handles specialist skills with specializations:
- `"Awareness"` → looks up standard skill
- `"Common Lore (Imperium)"` → parses and looks up specialist skill
- `"Common Lore", "Imperium"` → same result as above

Results are cached for performance.

---

## Appendix E: Recent Changes Log

### January 13, 2026 - Origin Path Builder Improvements

**Skill UUID Helper:**
- Created `src/module/helpers/skill-uuid-helper.mjs` with comprehensive skill lookup utilities
- Handles standard skills ("Awareness") and specialist skills ("Common Lore (Imperium)")
- Caches results for performance, supports batch lookups
- Full documentation in [SKILL_UUID_HELPER.md](SKILL_UUID_HELPER.md)

**Origin Path Choice Dialog:**
- Added skill UUID lookup for choice grants
- View item sheet buttons now work for all grant types: talents, traits, equipment, AND skills
- Handles specialist skills with specializations properly
- Uses async context preparation for UUID resolution

**Navigation Flow Improvements:**
- Removed "Going back will reset..." warning when clicking previous steps
- Added "Changing this selection will reset..." warning when CONFIRMING a change to an already-selected step
- Warning now shows which specific later steps will be reset
- More intuitive: warning appears when user is about to make a destructive change, not when just browsing

**Biography Tab Cleanup:**
- Removed redundant `rt-origin-selection-card` list from biography tab
- Kept only `rt-origin-steps-visual` (the flowchart display)
- Cleaner, less repetitive UI

**Localization Updates:**
- Added `RT.OriginPath.StepHomeWorld`, `StepBirthright`, `StepLureOfTheVoid`, `StepTrialsAndTravails`, `StepMotivation`, `StepCareer`
- Added `RT.OriginPath.ChangeSelection` and `ChangeSelectionWarning`
- Added `RT.OriginPath.NoPreviewedOrigin` and `ViewDetails`

### January 10, 2026 - Template & Caching Simplification

**Removed all template preloading/lazy-loading complexity:**
- All ~120 templates now load at system init via `HandlebarManager.loadTemplates()`
- Removed `_loadedTemplates` Set tracking
- Removed `loadTemplateOnDemand()` and `loadTemplatesOnDemand()` methods
- Removed `loadAcolyteTabTemplates()` and `loadActorSheetTemplates()` methods
- Removed deferred template loading from all sheet `_prepareContext()` methods

**Removed all sheet-level data caching:**
- Removed `_cachedItems`, `_cachedOriginPath`, `_cacheVersion`, `_lastActorUpdate` properties
- Removed `_invalidateCache()` and `_checkCacheValidity()` methods
- `_getCategorizedItems()` now computes fresh on each call (no caching)
- Simplified `_prepareLoadoutData()` and `_prepareCombatData()` signatures

**Standardized template data access:**
- Replaced all `{{actor.system.xxx}}` with `{{system.xxx}}` in templates (39 instances across 11 files)
  - 2 acolyte tab templates (12 replacements)
  - 5 panel partials (27 replacements)
  - 3 vehicle templates (3 replacements)
  - 1 chat template (1 replacement - bleeding-chat.hbs has fatigue context)
- `system` is exposed directly in context from `_prepareContext()`
- JavaScript action handlers still use `this.actor.system` (correct)

**Why these changes:**
- Simpler architecture - fewer moving parts, less state to track
- More reliable - eliminates timing issues and cache invalidation bugs
- Trust Foundry's reactive system and DataModel caching
- Modern browsers handle ~120 template preloads without performance issues

### January 2026

- **Weapon Qualities System**: Complete 5-panel display, 70+ quality definitions, craftsmanship integration
- **ApplicationV2 Migration**: All sheets migrated from V1 to V2
- **Template Parts Refactor**: AcolyteSheet uses proper PARTS system
- **8-Mixin Stack**: Complete mixin architecture for sheets
- **Panel System V2**: Modern collapsible panels with state persistence
- **Combat Tab "Battle Station"**: Tactical overlay with weapon slots
- **Equipment Tab "Loadout Manager"**: Card-based display with containers

### December 2025

- **V13 Architecture Migration**: DataModel-heavy, slim Documents
- **Movement Enhancements**: Leap/Jump, Lift/Carry/Push calculations
- **Armour Display Fixes**: All 6 locations with roll bands
- **NPC Actor Enhancements**: Type classification, faction, threat level
- **Starship Bug Fixes**: Power/space shortage detection
