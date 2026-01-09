# Rogue Trader VTT - Agent Documentation

This document provides context for AI agents working on this Foundry VTT V13 game system.

## Quick Reference

**System**: Rogue Trader VTT (Warhammer 40K RPG based on Dark Heresy 2e)  
**Foundry Version**: V13+  
**Architecture**: dnd5e V13 pattern (DataModel-heavy, slim Documents, ApplicationV2 sheets)  
**Build**: `npm run build` (Gulp → `dist/` folder)  

### Key Patterns

- **Data Models** (src/module/data/) - All calculations, schema, derived data
- **Documents** (src/module/documents/) - Roll methods, API surface only
- **ApplicationV2 Sheets** (src/module/applications/) - UI, events, 8-mixin stack
- **PARTS System** - Modular template rendering (10 parts for AcolyteSheet)
- **Panel Partials** (templates/actor/panel/) - 38 reusable panel components

### Sheet Architecture

```
BaseActorSheet = 8 mixins + ActorSheetV2
  ├── ApplicationV2Mixin      (Core V2 setup)
  ├── PrimarySheetMixin        (Tabs, modes, CRUD)
  ├── TooltipMixin             (RTTooltip integration)
  ├── VisualFeedbackMixin      (Flash/pulse animations)
  ├── EnhancedAnimationsMixin  (Counter/bar animations)
  ├── CollapsiblePanelMixin    (Panel state + presets)
  ├── ContextMenuMixin         (Right-click menus)
  ├── DragDropVisualMixin      (Visual drag feedback)
  └── WhatIfMixin              (Preview stat changes)
```

### Character Sheet Structure

**AcolyteSheet** (1740 lines) uses 11 PARTS:
- `header` - Portrait, name, player, career, rank
- `tabs` - 9-tab navigation bar
- 9 tab content parts: overview (dashboard), status (detailed tracking), combat, skills, talents, equipment, powers, dynasty, biography

**Context Flow**: `_prepareContext()` → `_preparePartContext(partId)` → part-specific methods

**Caching**: `_cachedItems` (categorized), `_cachedOriginPath` (steps), invalidated on actor updates

## System Overview

**Rogue Trader VTT** is a Foundry VTT game system for the Rogue Trader RPG (a Warhammer 40K derivative based on Dark Heresy 2e rules). It's built for Foundry V13 using modern DataModel architecture.

- **System ID**: `rogue-trader`
- **Foundry Version**: V13+
- **Build Command**: `npm run build` (uses Gulp)
- **Output**: `dist/` folder

## Architecture (V13 Pattern)

This system follows the **dnd5e V13 architecture pattern** where:
- **Data Models** do the heavy lifting (calculations, derived data, schema)
- **Documents** are slim (API surface, roll methods, actions)
- **ApplicationV2 Sheets** handle UI/UX (rendering, events, animations)

### Inheritance Hierarchy

```
Data Models (src/module/data/actor/):
  ActorDataModel
    └── CommonTemplate (templates/common.mjs) - ~180 lines
          └── CreatureTemplate (templates/creature.mjs) - ~670 lines
                ├── CharacterData (character.mjs) - ~340 lines
                └── NPCData (npc.mjs) - ~42 lines

Documents (src/module/documents/):
  Actor
    └── RogueTraderBaseActor (base-actor.mjs) - ~160 lines
          ├── RogueTraderAcolyte (acolyte.mjs) - ~390 lines
          ├── RogueTraderNPC (npc.mjs) - ~21 lines
          ├── RogueTraderStarship (starship.mjs)
          └── RogueTraderVehicle (vehicle.mjs)

ApplicationV2 Sheets (src/module/applications/actor/):
  ActorSheetV2
    └── BaseActorSheet (base-actor-sheet.mjs) - 8 mixins
          ├── AcolyteSheet (acolyte-sheet.mjs) - ~1740 lines
          ├── NpcSheet (npc-sheet.mjs)
          ├── StarshipSheet (starship-sheet.mjs)
          └── VehicleSheet (vehicle-sheet.mjs)
```

### Data Model Responsibilities

| Layer | File | Responsibility |
|-------|------|----------------|
| **CommonTemplate** | `templates/common.mjs` | Base schema: characteristics, wounds, initiative, movement, size |
| **CreatureTemplate** | `templates/creature.mjs` | Skills, fatigue (TB-based), fate, psy, armour, encumbrance, item modifiers |
| **CharacterData** | `character.mjs` | Character-specific: bio, experience, origin path, rogueTrader extras |
| **NPCData** | `npc.mjs` | NPC-specific: faction, subfaction, type, threatLevel |

### Document Responsibilities

| Document | Responsibility |
|----------|----------------|
| **RogueTraderBaseActor** | Token setup, characteristic getters, legacy compatibility |
| **RogueTraderAcolyte** | Roll methods, action methods, skill helpers, API surface |

### Data Preparation Flow

1. `Actor.prepareData()` calls `super.prepareData()`
2. DataModel's `prepareBaseData()` runs (initialize tracking)
3. DataModel's `prepareDerivedData()` runs (characteristics, skills, psy, movement)
4. Document calls `this.system.prepareEmbeddedData()` (item-based calculations)
5. `prepareEmbeddedData()` computes: item modifiers, armour, encumbrance, experience spent, origin path effects

### Sheet Architecture (ApplicationV2)

All sheets use **Foundry V13 ApplicationV2** framework with **8 mixins** stacked on `ActorSheetV2`:

```javascript
// BaseActorSheet = 8-layer mixin stack
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

#### Mixin Responsibilities

| Mixin | File | Purpose |
|-------|------|---------|
| **ApplicationV2Mixin** | `application-v2-mixin.mjs` | Core V2 setup, collapse tracking, base classes |
| **PrimarySheetMixin** | `primary-sheet-mixin.mjs` | Sheet modes (PLAY/EDIT), tab handling, document actions |
| **DragDropAPIMixin** | Included in PrimarySheet | Core drag/drop API handlers |
| **TooltipMixin** | `tooltip-mixin.mjs` | Rich tooltips with RTTooltip component |
| **VisualFeedbackMixin** | `visual-feedback-mixin.mjs` | Flash effects, pulse animations, state changes |
| **EnhancedAnimationsMixin** | `enhanced-animations-mixin.mjs` | Counter animations, bar fills, bonus pulses |
| **CollapsiblePanelMixin** | `collapsible-panel-mixin.mjs` | Panel state persistence, presets (combat/social/exploration) |
| **ContextMenuMixin** | `context-menu-mixin.mjs` | Right-click context menus for items/skills |
| **DragDropVisualMixin** | `drag-drop-visual-mixin.mjs` | Visual drag feedback, drop zones |
| **WhatIfMixin** | `what-if-mixin.mjs` | "What-if" mode for previewing stat changes |

## Key Files

### Data Models (src/module/data/)

| File | Lines | Description |
|------|-------|-------------|
| `actor/templates/common.mjs` | ~180 | Base characteristics, wounds, initiative |
| `actor/templates/creature.mjs` | ~670 | Skills, fatigue (TB), fate, psy, item modifiers |
| `actor/character.mjs` | ~340 | Character schema + experience/origin path |
| `actor/npc.mjs` | ~42 | NPC-specific fields |

### Documents (src/module/documents/)

| File | Lines | Description |
|------|-------|-------------|
| `acolyte.mjs` | ~390 | Roll/action methods only |
| `base-actor.mjs` | ~160 | Shared actor functionality |
| `npc.mjs` | ~21 | NPC document (minimal) |

### Utilities (src/module/utils/)

| File | Description |
|------|-------------|
| `armour-calculator.mjs` | Armour calculation logic |
| `encumbrance-calculator.mjs` | Weight/carry capacity logic |

### ApplicationV2 Sheets (src/module/applications/)

All sheets use the modern **Foundry V13 ApplicationV2** framework with **PARTS system** for modular rendering.

#### Mixins (applications/api/)

| File | Lines | Purpose |
|------|-------|---------|
| `application-v2-mixin.mjs` | ~150 | Core V2 setup, HandlebarsApplicationMixin integration |
| `primary-sheet-mixin.mjs` | ~250 | Modes (PLAY/EDIT), tabs, document CRUD actions |
| `tooltip-mixin.mjs` | ~180 | RTTooltip integration, tooltip data helpers |
| `visual-feedback-mixin.mjs` | ~120 | Flash/pulse animations for state changes |
| `enhanced-animations-mixin.mjs` | ~340 | Counter animations, bar fills, mutation observers |
| `collapsible-panel-mixin.mjs` | ~200 | Panel collapse state + presets (combat/social/exploration) |
| `context-menu-mixin.mjs` | ~140 | Right-click context menus |
| `drag-drop-api-mixin.mjs` | ~150 | Core drag/drop API handlers |
| `drag-drop-visual-mixin.mjs` | ~180 | Visual drag feedback, drop zones, animations |
| `what-if-mixin.mjs` | ~160 | Preview stat changes before committing |

#### Actor Sheets (applications/actor/)

| File | Lines | Description |
|------|-------|-------------|
| `base-actor-sheet.mjs` | ~400 | Base sheet with 8 mixins stacked, common actions |
| `acolyte-sheet.mjs` | ~1740 | Character sheet with 8 tabs, PARTS rendering |
| `npc-sheet.mjs` | ~450 | NPC sheet |
| `vehicle-sheet.mjs` | ~380 | Vehicle sheet |
| `starship-sheet.mjs` | ~520 | Starship sheet |

#### Item Sheets (applications/item/)

| File | Description |
|------|-------------|
| `base-item-sheet.mjs` | Base item sheet with common handlers |
| 17 type-specific sheets | One per item type (weapon, armour, talent, etc.) |

#### Dialogs (applications/prompts/)

| File | Description |
|------|-------------|
| `base-roll-dialog.mjs` | Base roll configuration dialog |
| `weapon-roll-dialog.mjs` | Weapon attack configuration |
| `psychic-roll-dialog.mjs` | Psychic power roll configuration |
| `force-field-roll-dialog.mjs` | Force field test dialog |
| Plus 5 more specialized dialogs | Damage assignment, tests, etc. |

## Schema Patterns

### Characteristics

```javascript
characteristics: {
  weaponSkill: { label, short, base, advance, modifier, unnatural, cost, total, bonus },
  // ... 10 characteristics total
}
```

**Calculation**: `total = base + (advance * 5) + modifier`  
**Bonus**: `bonus = floor(total / 10) * (unnatural >= 2 ? unnatural : 1)`

### Skills

```javascript
skills: {
  acrobatics: { label, characteristic, trained, plus10, plus20, bonus, current, ... },
  commonLore: { ..., entries: [{ name, trained, plus10, plus20, bonus, current }] },
  // Specialist skills have entries array for specializations
}
```

**Training Levels**: untrained (half char), trained (full char), +10, +20

### Armour

```javascript
armour: {
  head: { total, toughnessBonus, traitBonus, value },
  // body, leftArm, rightArm, leftLeg, rightLeg
}
```

**Calculation**: `total = TB + traitBonus (Machine/Natural) + cybernetic AP + max equipped armour`

### Fatigue System (Core Rules)

```javascript
fatigue: {
  max: { type: Number },    // Threshold = Toughness Bonus (auto-calculated)
  value: { type: Number }    // Current fatigue levels
}
```

**Rules** (Rogue Trader Core, p. 232):
1. **Threshold**: Toughness Bonus (TB). Character can take TB levels of fatigue before collapsing.
2. **Any Fatigue**: –10 penalty to **all Tests** (does NOT stack; 1 or more levels = –10).
3. **Exceeds TB**: Character collapses unconscious for (10 – TB) minutes.
4. **Upon Waking**: Fatigue resets to TB (threshold level).
5. **Recovery**: 1 hour rest = –1 fatigue. 8 consecutive hours = all fatigue removed.

**Note**: Fatigue does NOT affect characteristic values or bonuses, only Test rolls.

## Event Handler Patterns

### V2 Action Handlers

ApplicationV2 uses **static action handlers** defined in `DEFAULT_OPTIONS.actions`:

```javascript
static DEFAULT_OPTIONS = {
    actions: {
        roll: ClassName.#onRoll,              // Private static method
        itemEdit: ClassName.#onItemEdit,
        adjustStat: ClassName.#adjustStat
    }
};

// Static private method with 'this' bound to sheet instance
static async #onRoll(event, target) {
    // 'this' is the sheet instance
    await this.actor.rollCharacteristic(target.dataset.rollTarget);
}

// Public wrapper for external calls (optional)
static async onRoll(event, target) {
    return this.#onRoll(event, target);
}
```

### Data Attributes

Templates use `data-action` for V2 action handlers:

```handlebars
{{!-- Triggers roll action --}}
<button data-action="roll" data-roll-target="weaponSkill">Roll WS</button>

{{!-- Triggers itemEdit action --}}
<button data-action="itemEdit" data-item-id="{{item.id}}">Edit</button>

{{!-- Triggers adjustStat with parameters --}}
<button data-action="adjustStat" 
        data-field="system.wounds.value" 
        data-delta="1">+1 Wound</button>
```

Legacy `data-*` attributes still work for custom handlers:

```javascript
const action = event.currentTarget.dataset.action;
const target = event.currentTarget.dataset.target;
```

### Action Handler Types

**Combat Actions** (AcolyteSheet):
- `combatAction` - Trigger combat action (dodge, parry, etc.)
- `rollInitiative` - Roll initiative
- `rollHitLocation` - Roll d100 hit location

**Stat Adjustments**:
- `adjustStat` - Generic stat adjustment (wounds, fatigue, etc.)
- `increment` - Increment value by 1
- `decrement` - Decrement value by 1
- `setCriticalPip` - Toggle critical injury pip
- `setFateStar` - Set fate point star
- `restoreFate` - Restore fate point
- `spendFate` - Spend fate point

**Equipment Actions**:
- `toggleEquip` - Equip/unequip item
- `stowItem` - Stow item in container
- `unstowItem` - Remove item from container
- `toggleActivate` - Activate/deactivate item (force field)
- `filterEquipment` - Filter equipment list
- `bulkEquip` - Equip multiple items

**Item CRUD** (BaseActorSheet):
- `itemCreate` - Create new item
- `itemEdit` - Open item sheet
- `itemDelete` - Delete item
- `itemRoll` - Roll item (weapon attack, power, etc.)

**Skills**:
- `toggleTraining` - Toggle skill training level (untrained/trained/+10/+20)
- `addSpecialistSkill` - Add specialist skill entry
- `deleteSpecialization` - Remove specialist skill entry
- `filterSkills` - Filter skills list

**Panel Management**:
- `togglePanel` - Collapse/expand panel (CollapsiblePanelMixin)
- `applyPreset` - Apply panel preset (combat/social/exploration)

**Active Effects**:
- `effectCreate` - Create new effect
- `effectEdit` - Edit effect
- `effectDelete` - Delete effect
- `effectToggle` - Enable/disable effect

### Throttling Actions

Use `_throttle()` to prevent rapid-fire button clicks:

```javascript
static async #increment(event, target) {
    return this._throttle('increment', 300, async () => {
        const field = target.dataset.field;
        const max = target.dataset.max ? parseInt(target.dataset.max) : Infinity;
        const current = foundry.utils.getProperty(this.actor, field) ?? 0;
        const newValue = Math.min(current + 1, max);
        await this._updateSystemField(field, newValue);
    }, this, []);
}
```

### Tab Configuration (V2)

Tabs use the `static TABS` array with consistent `tab` property naming:

```javascript
// Define available tabs
static TABS = [
    { tab: "overview", label: "RT.Tabs.Overview", group: "primary", cssClass: "tab-overview" },
    { tab: "combat", label: "RT.Tabs.Combat", group: "primary", cssClass: "tab-combat" },
    { tab: "equipment", label: "RT.Tabs.Equipment", group: "primary", cssClass: "tab-equipment", 
      condition: doc => doc.isOwner }
];

// Set default active tab
tabGroups = {
    primary: "overview"
};
```

**Important:** Always use `tab:` property (not `id:`). The `condition` function is optional for conditional tabs.

For actor sheets using legacy V1-style templates with `data-tab` attributes, include a tabs config in DEFAULT_OPTIONS:

```javascript
static DEFAULT_OPTIONS = {
    tabs: [
        { navSelector: ".rt-navigation", contentSelector: ".rt-body", initial: "overview" }
    ]
};
```

The `_activateLegacyTabs()` method in PrimarySheetMixin handles these V1-style tabs.

### Container Configuration

Tab content parts share the **same container** element, stacking in place. Foundry V2 handles visibility automatically:

```javascript
static PARTS = {
    overview: {
        template: "path/to/tab-overview.hbs",
        container: { classes: ["rt-body"], id: "tab-body" },  // Shared container
        scrollable: [""]
    },
    combat: {
        template: "path/to/tab-combat.hbs",
        container: { classes: ["rt-body"], id: "tab-body" },  // Same container
        scrollable: [""]
    }
};
```

Each tab part is rendered into `#tab-body` with `data-tab` attribute matching the part ID. CSS `[data-tab]:not([data-tab="active-tab"])` hides inactive tabs.

## Item Types

| Type | Description |
|------|-------------|
| `weapon` | Ranged/melee weapons |
| `armour` | Protective gear |
| `gear` | General equipment |
| `talent` | Character abilities |
| `trait` | Innate characteristics |
| `psychicPower` | Psyker abilities |
| `cybernetic` | Augmetics |
| `condition` | Status effects |
| `originPath` | Character creation choices |

### Item Flags

```javascript
item.isTalent      // type === 'talent'
item.isTrait       // type === 'trait'
item.isOriginPath  // trait with flags.rt.kind === 'origin'
item.isCondition   // type === 'condition'
item.isPsychicPower // type === 'psychicPower'
```

## Modifier System

Items can have modifiers that apply to characteristics, skills, and combat:

```javascript
item.system.modifiers = {
  characteristics: { strength: 10, agility: -5 },
  skills: { dodge: 10 },
  combat: { toHit: 5, damage: 0, initiative: 0, defence: 0 },
  wounds: 2,
  fate: 1,
  movement: 0
}
```

Modifiers are tracked in `system.modifierSources` for transparency/tooltips.

## Weapon Qualities & Craftsmanship System

### Overview

Weapon qualities are modular attributes that modify weapon behavior (e.g., "Tearing", "Blast (3)", "Reliable"). The system uses a **computed properties pattern** where qualities from base weapon design are combined with craftsmanship-derived qualities dynamically.

### Architecture

```javascript
// WeaponData getters (src/module/data/item/weapon.mjs)
weapon.special                    // Set<string> - Base qualities from pack data
weapon.effectiveSpecial           // Set<string> - Base + craftsmanship-derived (computed)
weapon.craftsmanshipModifiers     // {toHit, damage, weight} - Stat bonuses
weapon.hasCraftsmanshipQualities  // boolean - Has auto-applied qualities
```

### Quality Identifier Format

- **Base**: `"tearing"`, `"razor-sharp"`, `"balanced"`
- **Parametric**: `"blast-3"`, `"crippling-2"` (base + "-" + level)
- **Variable**: `"blast-x"` (level determined at use)

### CONFIG Definitions

All qualities defined in `CONFIG.ROGUE_TRADER.weaponQualities`:

```javascript
weaponQualities: {
  'tearing': {
    label: "RT.WeaponQuality.Tearing",          // i18n key
    description: "RT.WeaponQuality.TearingDesc", // i18n key
    hasLevel: false
  },
  'blast': {
    label: "RT.WeaponQuality.Blast",
    description: "RT.WeaponQuality.BlastDesc",
    hasLevel: true  // Supports level suffix (e.g., "blast-3")
  }
  // ... 70+ qualities total
}
```

### Craftsmanship Integration

Craftsmanship levels automatically add/remove qualities and apply stat modifiers:

**Ranged Weapons** (quality changes):
- **Poor** → adds `unreliable-2` (jams on 90+)
- **Cheap** → adds `unreliable` (jams on 96+)
- **Common** → no change
- **Good** → adds `reliable` (jams on 95+), removes unreliable variants
- **Best/Master** → adds `never-jam`, removes unreliable/overheats
- **Master** → also +10 BS

**Melee Weapons** (stat modifiers only):
- **Poor** → -15 WS
- **Cheap** → -10 WS
- **Good** → +5 WS
- **Best** → +10 WS, +1 Damage
- **Master** → +20 WS, +2 Damage

### Handlebars Helpers

Five helpers convert quality identifiers to rich display objects:

```handlebars
{{!-- Convert Set of identifiers to quality objects --}}
{{#each (specialQualities item.system.special) as |quality|}}
  {{quality.label}} {{!-- "Tearing" --}}
  {{quality.description}} {{!-- "Reroll 1s and 2s on damage" --}}
  {{quality.level}} {{!-- 3 (for "blast-3") --}}
{{/each}}

{{!-- Get craftsmanship-derived qualities --}}
{{#each (craftsmanshipQualities item.system) as |quality|}}
  {{quality.label}} {{!-- "Reliable" for good craftsmanship --}}
{{/each}}

{{!-- Conditional checks --}}
{{#if (hasCraftsmanshipQualities item.system)}}
  <div>Shows orange panel for auto-applied qualities</div>
{{/if}}

{{#if (hasEmbeddedQualities items)}}
  <div>Shows purple panel for custom AttackSpecial items</div>
{{/if}}

{{!-- Single quality lookup --}}
{{qualityLookup "tearing"}} {{!-- Returns rich object --}}
```

### Template Structure (5-Panel System)

Weapon sheet qualities tab uses color-coded panels:

1. **Craftsmanship Banner** (gold #d4af37) - Shows level + stat modifiers
2. **Base Qualities Panel** (blue #4a9eff) - From weapon design (circle icons)
3. **Craftsmanship Qualities Panel** (orange #ff9f40) - Auto-applied (cog icons, conditional)
4. **Effective Qualities Panel** (green #4bc073) - Combined view (check icons, emphasized)
5. **Custom Qualities Panel** (purple #c084fc) - User-added AttackSpecial items (sparkle icons, conditional)

### Helper Functions (config.mjs)

```javascript
CONFIG.ROGUE_TRADER.getQualityDefinition(identifier)  // Get definition object
CONFIG.ROGUE_TRADER.getQualityLabel(identifier)       // Get localized label
CONFIG.ROGUE_TRADER.getQualityDescription(identifier) // Get localized description
CONFIG.ROGUE_TRADER.getJamThreshold(weapon)           // Calculate jam threshold (94-100, 91-100, etc.)
```

### Key Implementation Files

| File | Purpose |
|------|---------|
| `src/module/config.mjs` (lines 632-1029) | 70+ quality definitions + helper functions |
| `src/module/data/item/weapon.mjs` (lines 133-209) | effectiveSpecial, craftsmanshipModifiers, hasCraftsmanshipQualities getters |
| `src/module/handlebars/handlebars-helpers.mjs` (lines 641-778) | 5 quality display helpers |
| `src/templates/item/item-weapon-sheet-modern.hbs` (lines 280-459) | 5-panel qualities tab |
| `src/lang/en.json` (lines 554-740) | Localization for craftsmanship + 70+ qualities |

### Status: 90% Complete

**Completed**:
- ✅ CONFIG definitions (70+ qualities)
- ✅ DataModel computed properties
- ✅ Handlebars helpers (5 helpers)
- ✅ Template 5-panel display
- ✅ Localization (all common qualities)
- ✅ Chat integration (qualities in attack messages)
- ✅ Pack cleanup (verified no duplicates)
- ✅ Compendium browser (quality item display)

**Pending**:
- ⏳ Pack data migration (109 quality items - optional)
- ⏳ Testing & validation

See `WEAPON_QUALITIES_TODO.md` for detailed checklist.

## Recent Changes (January 2026)

### Major Refactors

1. **V13 Architecture Migration** (Dec 2025)
   - Moved all calculation logic from Document → DataModel
   - Created `CommonTemplate` and `CreatureTemplate` mixins
   - Slimmed Documents (acolyte.mjs: 709 → 388 lines)
   - Extracted armour/encumbrance to utility modules

2. **ApplicationV2 Migration** (Dec 2025)
   - Migrated all sheets from deprecated V1 → V2
   - All actor sheets (Acolyte, NPC, Vehicle, Starship)
   - All item sheets (18 sheet classes)
   - All roll dialogs (8 dialog classes)
   - CompendiumBrowser migrated to V2
   - Uses DocumentSheetConfig API for sheet registration
   - Eliminates V1 Application deprecation warnings

3. **Template Parts Refactor** (Jan 2026)
   - Acolyte sheet uses proper ApplicationV2 PARTS system
   - 10 separate template parts (header + tabs + 8 tab contents)
   - Each part can be re-rendered independently
   - Implemented `_preparePartContext()` for targeted context preparation
   - Created `templates/actor/acolyte/` directory

4. **8-Mixin Stack** (Dec 2025 - Jan 2026)
   - Created 8 reusable mixins for BaseActorSheet
   - TooltipMixin → RTTooltip component integration
   - VisualFeedbackMixin → Flash/pulse animations
   - EnhancedAnimationsMixin → Counter animations, bar fills
   - CollapsiblePanelMixin → Panel state persistence + presets
   - ContextMenuMixin → Right-click context menus
   - DragDropAPIMixin → Core drag/drop API (Jan 2026 renamed)
   - DragDropVisualMixin → Visual drag feedback (Jan 2026 renamed)
   - WhatIfMixin → "What-if" mode for previewing changes

### UI Enhancements

5. **Panel System V2** (Jan 2026)
   - Modern collapsible panels with state persistence
   - `wounds-panel-v2.hbs` - Pip system, progress bars
   - `fatigue-panel-v2.hbs` - TB-based threshold, -10 penalty display, collapse warning
   - `fate-panel-v2.hbs` - Golden star pips, spend/restore menu
   - `corruption-panel-v2.hbs` - Degree badges, threshold warnings
   - `insanity-panel-v2.hbs` - Degree badges, disorder tracking
   - All panels use collapsible headers with chevron icons

6. **Equipment Tab Redesign** (Jan 2026)
   - "Loadout Manager" with visual containers
   - Card-based equipment display
   - Encumbrance bar with percentage display
   - Drag/drop between containers
   - Equipped/stowed status badges

7. **Combat Tab Redesign** (Jan 2026)
   - "Battle Station" with tactical overlay
   - Weapon slots with equipped indicators
   - Vitals monitors (wounds/fatigue bars)
   - Reaction buttons (dodge, parry, etc.)
   - Hit location roller with d100 visual

### Character Features

8. **Movement Enhancements** (Dec 2025)
   - Added Leap/Jump calculations (SB-based)
   - Auto-calculated Lift/Carry/Push (SB multipliers)
   - Movement panel shows all movement types

9. **Header Improvements** (Dec 2025)
   - Added Player Name field
   - Added Rank field (editable)
   - Portrait click → edit image dialog

10. **Armour Display** (Dec 2025)
    - Fixed missing Body location
    - Added hit location roll bands (d100 ranges)
    - Displays AP + TB + Trait bonuses per location

### NPC & Starship

11. **NPC Actor Enhancements** (Dec 2025)
    - Enhanced NPCData with type choices (troop/elite/master/horde/swarm/creature/daemon/xenos)
    - Added allegiance, faction, subfaction fields
    - Description/tactics HTML editor fields
    - Fixed field name mismatches in template
    - Threat level display

12. **Starship Bug Fixes** (Dec 2025)
    - Fixed swapped `hasPowerShortage`/`hasSpaceShortage` getters
    - Added `prepareEmbeddedData()` for component calculations
    - Added `detectionBonus`, `hullPercentage`, `moralePercentage`
    - Starship initiative roller (1d10 + Detection Bonus)
    - Power/space status indicators with shortage warnings

### Weapon System

13. **Weapon Qualities & Craftsmanship Refactor** (Jan 2026)
    - Fixed `[object Object]` display issues (109 weapon quality items had legacy data)
    - Added CONFIG.ROGUE_TRADER.weaponQualities with 70+ quality definitions
    - Implemented computed `effectiveSpecial` getter (base + craftsmanship-derived)
    - Added `craftsmanshipModifiers` getter for stat bonuses
    - Created 5 Handlebars helpers for quality display
    - Completely rewrote weapon sheet qualities tab with 5-panel visual hierarchy
    - Integrated craftsmanship rules: Poor/Cheap add unreliable, Good adds reliable, Best/Master add never-jam
    - Added comprehensive localization for all qualities
    - **Chat integration**: Weapon attack messages now show active qualities in green-themed section
    - **Pack cleanup**: Created cleanup script, verified no duplicate qualities in pack data
    - **Compendium browser**: Quality items now show descriptions instead of page numbers
    - Status: 90% complete, fully testable

### Localization

14. **i18n Additions** (Dec 2025 - Jan 2026)
    - NPC types (`RT.NPCType.*`)
    - Threat levels (`RT.Threat.*`)
    - Starship UI strings
    - Tab labels (`RT.Tabs.*`)
    - Craftsmanship levels (`RT.Craftsmanship.*`)
    - Weapon qualities (`RT.WeaponQuality.*` - 70+ entries)

### Technical Improvements

14. **Caching System** (Jan 2026)
    - `_cachedItems` - Categorized item cache
    - `_cachedOriginPath` - Origin path steps cache
    - `_cacheVersion` tracking for invalidation
    - Invalidates on actor updates

15. **Context Preparation** (Jan 2026)
    - `_prepareContext()` - Shared data for all parts
    - `_preparePartContext()` - Routes to part-specific methods
    - `_getCategorizedItems()` - Cached item categorization
    - `_prepareLoadoutData()` - Equipment/encumbrance
    - `_prepareCombatData()` - Weapons/armour/reactions

16. **Update Helpers** (Jan 2026)
    - `_updateSystemField()` - Safe nested updates
    - `_throttle()` - Prevent rapid-fire clicks
    - `_notify()` - Toast/notification fallback

17. **Mixin Naming Clarification** (Jan 2026)
    - Renamed `drag-drop-mixin.mjs` → `drag-drop-api-mixin.mjs` (core API layer)
    - Renamed `enhanced-drag-drop-mixin.mjs` → `drag-drop-visual-mixin.mjs` (visual layer)
    - Updated all 3 import locations
    - Clearer separation of concerns between API and visual layers

### Code Quality

18. **TODO/FIXME Cleanup** (Jan 2026)
    - Reviewed all 4 TODO comments in codebase
    - Removed 2 outdated TODOs (item-container.mjs, basic-action-manager.mjs)
    - Kept 2 valid future features (combat-quick-panel.mjs)
    - Remaining TODOs: weapon selection dialog, consumable use logic

## Testing Changes

1. Run `npm run build` - must pass without errors
2. Check Foundry console for runtime errors
3. Test affected functionality:
   - Skill training buttons (T/+10/+20)
   - Stat adjustment buttons (wounds, fate, fatigue)
   - Armour display (all 6 locations)
   - Encumbrance calculation
   - Experience tracking

## Common Gotchas

1. **Template field names must match schema** - If template uses `{{system.endeavour.name}}`, schema must have `endeavour` not `endeavours`

2. **jQuery vs vanilla JS** - Use `element.dataset.xxx` not `$(element).data('xxx')` for data attributes

3. **Duplicate handlers** - Check parent class before adding handlers in child class

4. **DataModel item access** - Use `this.parent.items` in DataModel to access actor's items

5. **prepareEmbeddedData timing** - Called after items are ready, from Document's `prepareData()`

6. **Tab property naming** - Always use `tab:` property in TABS array, not `id:`. PrimarySheetMixin expects `{ tab: "name", ... }`

7. **ApplicationV2 classes** - V2 doesn't auto-add `sheet` class like V1. Include `"sheet"` in classes array for CSS selectors

8. **V2 integer validation** - Foundry V13 is stricter about integer fields. Use `migrateData()` and `cleanData()` to coerce values

## Template Organization

All templates live in `src/templates/` (120 template files after V2 migration complete).

### Directory Structure

```
templates/
├── actor/
│   ├── acolyte/              # Character sheet PARTS (12 files)
│   │   ├── header.hbs        # Portrait, name, player, rank
│   │   ├── tabs.hbs          # Tab navigation bar
│   │   ├── tab-overview.hbs  # Overview tab content
│   │   ├── tab-combat.hbs    # Combat tab content
│   │   ├── tab-skills.hbs    # Skills tab content
│   │   ├── tab-talents.hbs   # Talents tab content
│   │   ├── tab-equipment.hbs # Equipment tab content
│   │   ├── tab-powers.hbs    # Powers tab content
│   │   ├── tab-dynasty.hbs   # Dynasty tab content
│   │   └── tab-biography.hbs # Biography tab content
│   │
│   ├── panel/                # Reusable panel partials (38 files)
│   │   ├── wounds-panel-v2.hbs        # Modern wounds panel
│   │   ├── fatigue-panel-v2.hbs       # Modern fatigue panel
│   │   ├── fate-panel-v2.hbs          # Modern fate panel
│   │   ├── corruption-panel-v2.hbs    # Modern corruption panel
│   │   ├── insanity-panel-v2.hbs      # Modern insanity panel
│   │   ├── characteristic-panel.hbs   # Characteristics grid
│   │   ├── skills-panel.hbs           # Skills with training buttons
│   │   ├── weapon-panel.hbs           # Weapon list
│   │   ├── armour-display-panel.hbs   # Armour by hit location
│   │   ├── loadout-equipment-panel.hbs # Equipment cards
│   │   ├── combat-station-panel.hbs   # Combat overlay
│   │   └── ... 33 more panels
│   │
│   ├── partial/              # Misc partials
│   └── (no legacy monolithic sheets - all migrated to V2 PARTS directories)
│
├── item/                     # Item sheet templates
├── chat/                     # Chat message templates
└── prompts/                  # Dialog templates
```

### Panel Partial System

Panels are **reusable Handlebars partials** included via `{{> path/to/panel.hbs}}`.

**Key V2 Panels** (modernized with collapsible headers, visual feedback):
- `wounds-panel-v2.hbs` - Wounds tracker with +/- buttons, progress bar, critical injury pips
- `fatigue-panel-v2.hbs` - Fatigue tracker with threshold warning
- `fate-panel-v2.hbs` - Fate points with golden star pips, spend/restore buttons
- `corruption-panel-v2.hbs` - Corruption tracker with degree badges, malignancy list
- `insanity-panel-v2.hbs` - Insanity tracker with degree badges, disorder list

**Equipment Panels**:
- `loadout-equipment-panel.hbs` - Card-based equipment display with drag/drop
- `weapon-panel.hbs` - Weapon list with attack buttons
- `armour-display-panel.hbs` - 6-location armour display with roll bands

**Combat Panels**:
- `combat-station-panel.hbs` - Tactical overlay with weapon slots, reactions, vitals

**Specialist Panels**:
- `skills-specialist-panel.hbs` - Specialist skills (Common Lore, Forbidden Lore, etc.)
- `talent-panel.hbs` - Talent list with descriptions
- `trait-panel.hbs` - Trait list

**Dynasty Panels**:
- `profit-factor-panel.hbs` - Profit factor tracker
- `acquisitions-panel.hbs` - Acquisition test history
- `experience-panel.hbs` - XP tracker

## ApplicationV2 Template Parts (PARTS System)

Modern ApplicationV2 sheets use the **PARTS system** for modular, independently-renderable template sections. Each part can be re-rendered individually for performance.

### How PARTS Work

```javascript
// Define parts in static PARTS object
static PARTS = {
    header: {
        template: "path/to/header.hbs"
    },
    overview: {
        template: "path/to/tab-overview.hbs",
        container: { classes: ["rt-body"], id: "tab-body" },
        scrollable: [""]
    }
    // ... more parts
};

// Prepare context for specific parts
async _preparePartContext(partId, context, options) {
    // Route to part-specific context preparation
    switch(partId) {
        case "header": return this._prepareHeaderContext(context);
        case "overview": return this._prepareOverviewContext(context);
        // ...
    }
}
```

### Acolyte Sheet PARTS

The **AcolyteSheet** uses 11 template parts (header + tabs + 9 tab contents):

| Part | Template | Description |
|------|----------|-------------|
| `header` | `acolyte/header.hbs` | Portrait, name, player, career, rank, characteristics HUD |
| `tabs` | `acolyte/tabs.hbs` | Tab navigation bar (9 tabs) |
| `overview` | `acolyte/tab-overview.hbs` | **Ultra-dense dashboard** - at-a-glance vitals, chars, skills, combat stats |
| `status` | `acolyte/tab-status.hbs` | Detailed tracking - wounds, fatigue, fate, corruption, insanity, XP, movement, effects |
| `combat` | `acolyte/tab-combat.hbs` | "Battle Station" - weapons, reactions, vitals, armour display |
| `skills` | `acolyte/tab-skills.hbs` | Standard skills panel with training buttons |
| `talents` | `acolyte/tab-talents.hbs` | Specialist skills, talents, traits panels |
| `equipment` | `acolyte/tab-equipment.hbs` | "Loadout Manager" - equipment cards, encumbrance |
| `powers` | `acolyte/tab-powers.hbs` | Psychic, navigator, orders, rituals |
| `dynasty` | `acolyte/tab-dynasty.hbs` | Profit factor, acquisitions, endeavours |
| `biography` | `acolyte/tab-biography.hbs` | Identity, origin path, journal |

### Context Preparation Flow

```
_prepareContext(options)
  ↓
  Shared data: characteristics, originPath, categorized items
  ↓
_preparePartContext(partId, context, options)
  ↓
  Routes to part-specific methods:
    _prepareHeaderContext()      → Header data
    _prepareOverviewContext()    → Vitals, XP, movement
    _prepareCombatTabContext()   → Weapons, armour, reactions
    _prepareEquipmentContext()   → Loadout, encumbrance
    etc.
```

### Shared Context (_prepareContext)

Computed once for all parts:
- `context.dh` - CONFIG.rt reference
- `context.originPathSteps` - Cached origin path items
- `context.navigatorPowers` - Navigator power items
- `context.shipRoles` - Ship role items
- Categorized items (via `_getCategorizedItems()`)
- Loadout data (via `_prepareLoadoutData()`)
- Combat data (via `_prepareCombatData()`)

### Item Categorization Cache

Items are **cached** and **categorized** on first access, invalidated on actor updates:

```javascript
_cachedItems = {
    all: [],              // All items
    weapons: [],          // Weapons
    armour: [],           // Armour items
    forceField: [],       // Force fields
    cybernetic: [],       // Cybernetics
    gear: [],             // Gear items
    storageLocation: [],  // Containers
    criticalInjury: [],   // Critical injuries
    equipped: []          // Currently equipped items
}
```

Cache is invalidated via `_invalidateCache()` when actor data changes.

## SCSS Architecture

Styles are in `dist/scss/` (compiled from source, organized by feature).

### Directory Structure

```
dist/scss/
├── rogue-trader.scss         # Main entry point (imports all partials)
├── _fonts.scss               # Modesto Condensed font definitions
│
├── abstracts/                # Variables, mixins, themes
│   ├── _variables.scss       # Colors, spacing, breakpoints
│   ├── _mixins.scss          # Reusable SCSS mixins
│   └── _gothic-theme.scss    # Dark gothic theme colors
│
├── base/                     # Base element styles
│   ├── _reset.scss           # CSS reset
│   └── _typography.scss      # Font definitions
│
├── layout/                   # Layout components
│   ├── _grid.scss            # RT grid system
│   └── _sheet-base.scss      # Base sheet styles
│
├── actor/                    # Actor sheet styles
│   ├── _sheet-base.scss      # Base actor sheet
│   ├── _characteristics.scss # Characteristics HUD/panel
│   ├── _skills.scss          # Skills panel
│   ├── _combat.scss          # Combat elements
│   ├── _equipment.scss       # Equipment lists
│   ├── _status.scss          # Status indicators
│   ├── _vitals.scss          # Vitals displays
│   ├── _tables.scss          # Data tables
│   ├── _origin-path.scss     # Origin path builder
│   └── _ship.scss            # Starship styles
│
├── panels/                   # Panel component styles (28 files)
│   ├── _index.scss           # Imports all panel styles
│   ├── _core.scss            # Base panel component (.rt-panel, .rt-panel-header)
│   ├── _grid.scss            # Panel grid layouts
│   ├── _wounds.scss          # Wounds panel V2 styles
│   ├── _fatigue.scss         # Fatigue panel V2 styles
│   ├── _fate.scss            # Fate panel V2 with golden stars
│   ├── _corruption-v2.scss   # Corruption panel V2
│   ├── _insanity-v2.scss     # Insanity panel V2
│   ├── _vitals-modern.scss   # Modern vitals layout
│   ├── _equipment-cards.scss # Equipment card design
│   ├── _loadout.scss         # Loadout Manager styles
│   ├── _combat-station.scss  # Battle Station overlay
│   ├── _dynasty-modern.scss  # Dynasty tab modernization
│   ├── _skills.scss          # Skills panel with training buttons
│   ├── _specialist.scss      # Specialist skills
│   ├── _talents.scss         # Talents & traits
│   ├── _powers.scss          # Powers tab
│   ├── _biography.scss       # Biography tab
│   ├── _effects.scss         # Active effects
│   ├── _movement.scss        # Movement panel
│   └── _accents.scss         # Tab-specific accent colors
│
├── components/               # Reusable UI components
│   ├── _buttons.scss         # Button styles
│   ├── _forms.scss           # Form elements
│   ├── _tooltips.scss        # Tooltip styles
│   └── _animations.scss      # Animation keyframes
│
├── item/                     # Item sheet styles
│   └── _item-sheet.scss      # Base item sheet
│
├── prompts/                  # Dialog styles
│   └── _roll-dialog.scss     # Roll configuration dialogs
│
├── chat/                     # Chat message styles
│   └── _chat-card.scss       # Chat card layouts
│
└── journals.scss             # Journal styles
```

### Key SCSS Files

| File | Purpose |
|------|---------|
| `abstracts/_variables.scss` | All color vars, spacing scale, RT theme colors |
| `abstracts/_gothic-theme.scss` | Dark gothic theme palette (gold accents, parchment bg) |
| `panels/_core.scss` | `.rt-panel`, `.rt-panel-header`, `.rt-panel-body` base styles |
| `panels/_wounds.scss` | Pip system, progress bar gradients, critical warning states |
| `panels/_fate.scss` | Golden star animations, spend/restore button styles |
| `panels/_equipment-cards.scss` | Card layouts, drag states, equipped badges |
| `panels/_loadout.scss` | Loadout Manager grid, encumbrance bar, container zones |
| `panels/_combat-station.scss` | Tactical overlay, weapon slots, vitals monitors |
| `actor/_characteristics.scss` | Characteristic HUD circles, bonus displays |

### Design System Variables

```scss
// Spacing Scale
$rt-space-xs: 4px;
$rt-space-sm: 8px;
$rt-space-md: 12px;
$rt-space-lg: 16px;
$rt-space-xl: 24px;

// Colors
$rt-accent-gold: #d4af37;        // Primary gold accent
$rt-bg-paper: #f4f1e8;           // Parchment background
$rt-text-primary: #2c2417;       // Dark brown text
$rt-border-light: #d4c5a6;       // Light border

// Tab Accent Colors
$rt-accent-overview: #3498db;    // Blue
$rt-accent-combat: #e74c3c;      // Red
$rt-accent-skills: #2ecc71;      // Green
$rt-accent-talents: #9b59b6;     // Purple
$rt-accent-equipment: #f39c12;   // Orange
$rt-accent-powers: #8e44ad;      // Dark purple
$rt-accent-dynasty: #d4af37;     // Gold
$rt-accent-biography: #34495e;   // Dark blue-gray
```

### Panel Component Pattern

```scss
// Base panel structure
.rt-panel {
  background: $rt-bg-paper;
  border: 1px solid $rt-border-light;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.rt-panel-header {
  display: flex;
  align-items: center;
  padding: $rt-space-sm $rt-space-md;
  background: linear-gradient(180deg, rgba($rt-accent-gold, 0.15) 0%, rgba($rt-accent-gold, 0.05) 100%);
  border-bottom: 1px solid $rt-border-light;
}

.rt-panel-body {
  padding: $rt-space-md;
}
```

1. **V13 Architecture Refactor** - Moved all calculation logic from Document to DataModel
2. **Template Mixins** - Created `CommonTemplate` and `CreatureTemplate` for code reuse
3. **Slimmed Documents** - `acolyte.mjs` reduced from 709 → 388 lines
4. **Fixed Armour Display** - Added missing Body location to armour panel
5. **Consolidated Handlers** - Merged duplicate event handlers in sheet classes
6. **Utility Extraction** - Armour and encumbrance calculations in separate utility files
7. **Movement Enhancements** - Added Leap/Jump calculations based on Strength Bonus
8. **Lifting Capacity** - Auto-calculated Lift/Carry/Push from Strength Bonus
9. **Hit Location Roller** - Interactive button to roll 1d100 hit location with visual feedback
10. **Header Improvements** - Added Player Name and Rank fields to character header
11. **NPC Actor Fixes** - Enhanced NPCData with type choices, allegiance, faction, description/tactics HTML fields
12. **NPC Template** - Fixed field name mismatches, added type dropdown select, threat level display
13. **Starship Bug Fixes** - Fixed swapped hasPowerShortage/hasSpaceShortage getters
14. **Starship Data Prep** - Added prepareEmbeddedData() for component-based power/space calculations
15. **Starship Combat Stats** - Added detectionBonus, hullPercentage, moralePercentage calculations
16. **Starship Sheet UI** - Enhanced Stats tab with initiative button, Detection Bonus display, power/space status indicators
17. **Starship Initiative** - Added rollInitiative() method (1d10 + Detection Bonus)
18. **Localization** - Added NPC types (RT.NPCType.*), threat levels (RT.Threat.*), starship UI strings
19. **Equipment Tab Redesign** - New "Loadout Manager" with visual containers, encumbrance bar, item cards
20. **Combat Tab Redesign** - New "Battle Station" with tactical overlay, weapon slots, vitals monitors, reaction buttons
21. **ApplicationV2 Migration** - Migrated all sheets from deprecated V1 Application framework to V2:
    - All actor sheets (AcolyteSheet, NpcSheet, VehicleSheet, StarshipSheet)
    - All item sheets (18 sheet classes for different item types)
    - CompendiumBrowser migrated to V2
    - All roll dialogs (weapon, psychic, force field, damage, etc.)
    - Uses DocumentSheetConfig API for sheet registration
    - Eliminates V1 Application deprecation warning
22. **Template Parts Refactor** - Acolyte sheet now uses proper ApplicationV2 PARTS system:
    - 11 separate template parts (header, tabs, 9 tab content parts)
    - Each part can be re-rendered independently for better performance
    - Implemented `_preparePartContext()` for targeted context preparation
    - Created `templates/actor/acolyte/` directory for part templates

## Feature Audit (vs RogueTraderInfo.md)

### ✅ Fully Implemented
- Identity/Origin Path (Name, Player, Career, Rank, HomeWorld, full Origin Path items)
- 9 Characteristics (WS/BS/S/T/Ag/Int/Per/WP/Fel) with base/advance/unnatural
- Characteristic bonuses (tens digit calculation, unnatural multiplier)
- Skills with training tiers (Basic/Trained/+10/+20)
- Specialist skills with entries (Lore, Pilot, Drive, etc.)
- Wounds (total/current/critical) + Critical Injuries as items
- Fatigue (TB threshold, -10 penalty on any fatigue, collapse > TB)
- Fate Points (total/current)
- Insanity (points, degree, disorders as items)
- Corruption (points, degree, malignancies as items)
- Mutations (as items + text field)
- Armour by hit location (6 locations) with AP/TB/Trait breakdown + roll bands
- Movement (Half/Full/Charge/Run based on AB)
- Leap/Jump (Vertical/Horizontal leap and jump based on SB)
- Lift/Carry/Push (auto-calculated from SB)
- Hit Location Roller (interactive d100 roller with chat output)
- Encumbrance (current/max, auto-calculated from items)
- Profit Factor (starting/current/misfortunes)
- Endeavour tracker (name/AP current/required/reward/notes)
- Acquisitions (list with name/availability/modifier/notes/acquired)
- XP tracking (total/spent/available)
- Bio fields (playerName/gender/age/build/complexion/hair/eyes)
- Peers/Enemies connections as items
- Psychic powers, Navigator powers, Orders, Rituals panels
- Talents/Traits as items
- Weapon panel with attack rolls
- Force field, Cybernetics, Gear panels
- Starship actor type with full component/weapon/crew tracking
- NPC actor with type classification, faction, threat level, description/tactics
- NPC type dropdown (troop/elite/master/horde/swarm/creature/daemon/xenos)
- Starship initiative roller (1d10 + Detection Bonus)
- Starship power/space status indicators with shortage warnings
- Starship Detection Bonus display and calculations
- Combat Tab "Battle Station" with weapon slots, vitals monitors, tactical overlay
- Equipment Tab "Loadout Manager" with visual containers, encumbrance bar, item cards

### ⚠️ Needs Enhancement
| Feature | Current State | Needed |
|---------|---------------|--------|
| DoS/DoF Display | Calculated in rolls | More prominent visual in chat messages |
| Acquisition Helper | Manual rolls | Guided dialog with modifiers |

### ❌ Missing (Future)
- Acquisition test modifier helper dialog
- DoS/DoF prominent display in roll results
- Ship combat automation

### Implementation Priorities

**High Priority:**
1. ~~Add Leap/Jump to movement display~~ ✅ DONE
2. ~~Auto-calculate Lift/Carry/Push from SB~~ ✅ DONE
3. ~~Add hit location roll bands to armour display~~ ✅ DONE
4. ~~Display Rank in character header~~ ✅ DONE
5. ~~Add Player Name field~~ ✅ DONE
6. ~~Fix NPC data model and template field mismatches~~ ✅ DONE
7. ~~Add NPC type classification and threat levels~~ ✅ DONE
8. ~~Fix Starship power/space shortage detection bugs~~ ✅ DONE
9. ~~Add Starship initiative roll and Detection Bonus~~ ✅ DONE
10. ~~Add Starship power/space status indicators~~ ✅ DONE

**Medium Priority:**
1. Enhance DoS/DoF in roll chat messages
2. Acquisition modifier helper dialog

**Low Priority:**
1. Ship combat automation
2. Colony management integration

## Reference

- **Foundry V13 API**: https://foundryvtt.com/api/
- **dnd5e System**: Good reference for V13 patterns (see `/home/aqui/dnd5e/`)
- **DataModel Docs**: https://foundryvtt.com/article/system-data-models/
- **Rogue Trader Rules**: `resources/RogueTraderInfo.md` (comprehensive rules reference)
