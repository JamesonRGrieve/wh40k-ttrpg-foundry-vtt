# Rogue Trader VTT - Agent Documentation

This document provides context for AI agents working on this Foundry VTT V13 game system.

## System Overview

**Rogue Trader VTT** is a Foundry VTT game system for the Rogue Trader RPG (a Warhammer 40K derivative based on Dark Heresy 2e rules). It's built for Foundry V13 using modern DataModel architecture.

- **System ID**: `rogue-trader`
- **Foundry Version**: V13+
- **Build Command**: `npm run build` (uses Gulp)
- **Output**: `dist/` folder

## Architecture (V13 Pattern)

This system follows the dnd5e V13 architecture pattern where **Data Models do the heavy lifting** and **Documents are slim**.

### Inheritance Hierarchy

```
Data Models (src/module/data/actor/):
  ActorDataModel
    └── CommonTemplate (templates/common.mjs)
          └── CreatureTemplate (templates/creature.mjs)
                ├── CharacterData (character.mjs)
                └── NPCData (npc.mjs)

Documents (src/module/documents/):
  Actor
    └── RogueTraderBaseActor (base-actor.mjs)
          ├── RogueTraderAcolyte (acolyte.mjs) - Characters
          ├── RogueTraderNPC (npc.mjs)
          ├── RogueTraderStarship (starship.mjs)
          └── RogueTraderVehicle (vehicle.mjs)
```

### Data Model Responsibilities

| Layer | File | Responsibility |
|-------|------|----------------|
| **CommonTemplate** | `templates/common.mjs` | Base schema: characteristics, wounds, initiative, movement, size |
| **CreatureTemplate** | `templates/creature.mjs` | Skills, fatigue, fate, psy, armour, encumbrance, item modifiers |
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

## Key Files

### Data Models

| File | Lines | Description |
|------|-------|-------------|
| `data/actor/templates/common.mjs` | ~180 | Base characteristics, wounds, initiative |
| `data/actor/templates/creature.mjs` | ~670 | Skills, fatigue, fate, psy, item modifiers |
| `data/actor/character.mjs` | ~340 | Character schema + experience/origin path |
| `data/actor/npc.mjs` | ~42 | NPC-specific fields |

### Documents

| File | Lines | Description |
|------|-------|-------------|
| `documents/acolyte.mjs` | ~390 | Roll/action methods only |
| `documents/base-actor.mjs` | ~160 | Shared actor functionality |
| `documents/npc.mjs` | ~21 | NPC document (minimal) |

### Utilities

| File | Description |
|------|-------------|
| `utils/armour-calculator.mjs` | Armour calculation logic |
| `utils/encumbrance-calculator.mjs` | Weight/carry capacity logic |

### Application Sheets (ApplicationV2)

All sheets use the modern Foundry V13 ApplicationV2 framework.

| File | Description |
|------|-------------|
| `applications/api/application-v2-mixin.mjs` | Core V2 mixin for RT applications |
| `applications/api/primary-sheet-mixin.mjs` | Sheet modes, tabs, document actions |
| `applications/api/dialog.mjs` | Base dialog class for V2 dialogs |
| `applications/actor/base-actor-sheet.mjs` | Base actor sheet with common handlers |
| `applications/actor/acolyte-sheet.mjs` | Character sheet |
| `applications/actor/npc-sheet.mjs` | NPC sheet |
| `applications/actor/vehicle-sheet.mjs` | Vehicle sheet |
| `applications/actor/starship-sheet.mjs` | Starship sheet |
| `applications/item/base-item-sheet.mjs` | Base item sheet |
| `applications/item/container-item-sheet.mjs` | Items that hold other items |
| `applications/prompts/base-roll-dialog.mjs` | Base roll configuration dialog |

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

## Event Handler Patterns

### V2 Action Handlers

ApplicationV2 uses static action handlers defined in `DEFAULT_OPTIONS.actions`:

```javascript
static DEFAULT_OPTIONS = {
    actions: {
        roll: ClassName.#onRoll,
        itemEdit: ClassName.#onItemEdit
    }
};

// Static private method with 'this' bound to sheet instance
static async #onRoll(event, target) {
    await this.actor.rollCharacteristic(target.dataset.rollTarget);
}
```

### Data Attributes

Templates use `data-action` for V2 action handlers:

```html
<button data-action="roll" data-roll-target="weaponSkill">Roll WS</button>
<button data-action="itemEdit" data-item-id="{{item.id}}">Edit</button>
```

Legacy `data-*` attributes still work for custom handlers:

```javascript
const action = event.currentTarget.dataset.action;
const target = event.currentTarget.dataset.target;
```

### Tab Configuration (V2)

Tabs use the `static TABS` array with consistent `tab` property naming:

```javascript
// Define available tabs
static TABS = [
    { tab: "overview", group: "primary", label: "Overview" },
    { tab: "combat", group: "primary", label: "Combat" },
    { tab: "equipment", group: "primary", label: "Equipment", condition: doc => doc.isOwner }
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

## File Organization

```
src/
├── module/
│   ├── applications/           # ApplicationV2 sheets and dialogs
│   │   ├── api/               # Mixins and base classes
│   │   ├── actor/             # Actor sheets (V2)
│   │   ├── item/              # Item sheets (V2)
│   │   └── prompts/           # Roll dialogs (V2)
│   ├── data/
│   │   ├── actor/
│   │   │   ├── templates/     # Schema templates (V13 pattern)
│   │   │   │   ├── common.mjs
│   │   │   │   └── creature.mjs
│   │   │   ├── character.mjs  # Character data model
│   │   │   └── npc.mjs        # NPC data model
│   │   └── item/              # Item data models
│   ├── documents/             # Actor/Item document classes
│   ├── prompts/               # Legacy exports (re-exports from applications/prompts)
│   ├── utils/                 # Utility functions
│   ├── rolls/                 # Roll handling
│   └── actions/               # Combat actions
├── templates/                 # Handlebars templates
│   └── actor/
│       ├── acolyte/           # Character sheet template parts (V2 PARTS)
│       │   ├── header.hbs     # Character header with portrait & characteristics
│       │   ├── tabs.hbs       # Tab navigation bar
│       │   ├── tab-overview.hbs     # Overview tab
│       │   ├── tab-combat.hbs       # Combat tab
│       │   ├── tab-skills.hbs       # Skills tab
│       │   ├── tab-talents.hbs      # Talents tab
│       │   ├── tab-equipment.hbs    # Equipment tab
│       │   ├── tab-powers.hbs       # Powers tab
│       │   ├── tab-dynasty.hbs      # Dynasty tab
│       │   └── tab-biography.hbs    # Biography tab
│       └── panel/             # Reusable panel partials
├── styles/                    # SCSS styles
└── packs/                     # Compendium source data
```

## ApplicationV2 Template Parts (PARTS System)

The Acolyte sheet uses the modern ApplicationV2 PARTS system for modular, independently-renderable template sections.

### How PARTS Work

Each part in `static PARTS` can be:
- Rendered independently for performance
- Has its own context preparation via `_preparePartContext()`
- Can use container configuration to specify parent elements

```javascript
static PARTS = {
    header: {
        template: "systems/rogue-trader/templates/actor/acolyte/header.hbs"
    },
    overview: {
        template: "systems/rogue-trader/templates/actor/acolyte/tab-overview.hbs",
        container: { classes: ["rt-body"], id: "tab-body" },
        scrollable: [""]
    }
    // ... more parts
};
```

### Context Preparation Flow

1. `_prepareContext()` - Prepares shared context data for all parts
2. `_preparePartContext(partId, context)` - Routes to part-specific preparation:
   - `_prepareHeaderContext()` - Header-specific data
   - `_prepareOverviewContext()` - Overview tab data
   - `_prepareCombatTabContext()` - Combat tab data
   - etc.

### Part Files (Acolyte Sheet)

| Part | File | Description |
|------|------|-------------|
| header | `acolyte/header.hbs` | Portrait, name, career, characteristics HUD |
| tabs | `acolyte/tabs.hbs` | Tab navigation bar |
| overview | `acolyte/tab-overview.hbs` | Wounds, fatigue, fate, movement |
| combat | `acolyte/tab-combat.hbs` | Weapons, reactions, hit locations |
| skills | `acolyte/tab-skills.hbs` | Standard skills panel |
| talents | `acolyte/tab-talents.hbs` | Specialist skills, talents, traits |
| equipment | `acolyte/tab-equipment.hbs` | Loadout manager |
| powers | `acolyte/tab-powers.hbs` | Psychic, navigator, orders, rituals |
| dynasty | `acolyte/tab-dynasty.hbs` | Profit factor, acquisitions, endeavours |
| biography | `acolyte/tab-biography.hbs` | Identity, origin path, journal |

## Recent Changes (January 2026)

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
    - 10 separate template parts (header, tabs, 8 tab content parts)
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
- Fatigue (threshold/current, exhaustion warning)
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
