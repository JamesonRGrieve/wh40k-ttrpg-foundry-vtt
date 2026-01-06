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

### Sheets

| File | Description |
|------|-------------|
| `sheets/actor/acolyte-sheet.mjs` | Character sheet UI |
| `sheets/actor/actor-container-sheet.mjs` | Parent sheet class with shared handlers |

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

### Sheet Event Handlers

Event handlers are in parent class (`actor-container-sheet.mjs`) when shared:

```javascript
// Skill training toggle (handles both patterns)
_toggleTraining(event) {
  // Pattern 1: data-field/data-value (specialist skills)
  // Pattern 2: data-skill/data-level (standard skills)
}

// Consolidated stat button handler
_onStatButtonClick(event) {
  // Handles wounds, fatigue, fate, critical, insanity, corruption
  const target = element.dataset.target;  // e.g., "wounds.value"
  const delta = element.dataset.action === 'increase' ? 1 : -1;
}
```

### Data Attributes

Templates use `data-*` attributes, JS reads via `element.dataset.*`:

```html
<button data-action="increase" data-target="wounds.value">+</button>
```

```javascript
const action = event.currentTarget.dataset.action;
const target = event.currentTarget.dataset.target;
```

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

## File Organization

```
src/
├── module/
│   ├── data/
│   │   ├── actor/
│   │   │   ├── templates/      # Schema templates (V13 pattern)
│   │   │   │   ├── common.mjs
│   │   │   │   └── creature.mjs
│   │   │   ├── character.mjs   # Character data model
│   │   │   └── npc.mjs         # NPC data model
│   │   └── item/               # Item data models
│   ├── documents/              # Actor/Item document classes
│   ├── sheets/                 # Application sheets
│   ├── utils/                  # Utility functions
│   ├── rolls/                  # Roll handling
│   ├── actions/                # Combat actions
│   └── prompts/                # Roll dialogs
├── templates/                  # Handlebars templates
├── styles/                     # SCSS styles
└── packs/                      # Compendium source data
```

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
