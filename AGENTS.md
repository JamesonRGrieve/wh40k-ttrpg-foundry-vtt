# Rogue Trader VTT - Agent Reference

Foundry VTT V13 game system for Rogue Trader RPG (Warhammer 40K, Dark Heresy 2e rules).

## Quick Facts

| Key | Value |
|-----|-------|
| System ID | `rogue-trader` |
| Foundry | V13+ |
| Build | `npm run build` → `dist/` |
| Entry | `src/module/rogue-trader.mjs` |
| Architecture | dnd5e V13 pattern: DataModel-heavy, slim Documents, ApplicationV2 |

## Game Mechanics

- **d100 roll-under**: roll ≤ target = success
- **Degrees**: `floor((target - roll) / 10) + 1`
- **Critical**: 01-05 success, 96-00 failure, OR 3+ degrees
- **10 Characteristics**: WS, BS, S, T, Ag, Int, Per, WP, Fel, Inf
- **Characteristic Bonus**: tens digit (42 → 4)
- **Unnatural**: bonus multiplier (×2, ×3)

## Directory Structure

```
src/
├── module/
│   ├── actions/        # Combat action managers
│   ├── applications/   # ApplicationV2 sheets, dialogs
│   ├── data/           # DataModels (actors/, items/, shared/)
│   ├── dice/           # D100Roll, BasicRollRT
│   ├── documents/      # Actor, Item, ActiveEffect classes
│   ├── handlebars/     # 60+ helpers
│   ├── helpers/        # SkillKeyHelper, SkillUuidHelper
│   └── utils/          # Calculators, processors
├── packs/              # Compendium JSON → LevelDB
├── scss/               # ~105 files, variables in abstracts/
└── templates/          # ~150 .hbs files
```

## Architecture Layers

| Layer | Purpose | Key Files |
|-------|---------|-----------|
| **DataModels** | Schema, calculations, derived data | `data/actor/*.mjs`, `data/item/*.mjs` |
| **Documents** | Roll methods, API surface | `documents/*.mjs` |
| **Sheets** | UI, events, 8-mixin stack | `applications/actor/*.mjs` |

### Actor Hierarchy

```
DataModels: CommonTemplate → CreatureTemplate → CharacterData/NPCData
Documents:  RogueTraderBaseActor → RogueTraderAcolyte/NPC/Vehicle/Starship
Sheets:     BaseActorSheet (8 mixins) → AcolyteSheet/NpcSheet/etc.
```

### Data Prep Flow

```
Actor.prepareData() → DataModel.prepareBaseData() → prepareDerivedData()
  → Document calls system.prepareEmbeddedData()
  → Apply item modifiers, compute armour, encumbrance
```

## Actor Types

| Type | Document | DataModel | Sheet |
|------|----------|-----------|-------|
| acolyte | RogueTraderAcolyte | CharacterData | AcolyteSheet |
| npc | RogueTraderNPC | NPCData | NpcSheet |
| vehicle | RogueTraderVehicle | VehicleData | VehicleSheet |
| starship | RogueTraderStarship | StarshipData | StarshipSheet |

## Item Types (36)

**Equipment**: weapon, armour, ammunition, gear, cybernetic, forceField, backpack, storageLocation
**Features**: talent, trait, skill, originPath, aptitude, peer, enemy
**Powers**: psychicPower, navigatorPower, ritual, order
**Ship**: shipComponent, shipWeapon, shipUpgrade, shipRole, vehicleTrait, vehicleUpgrade
**Mods**: weaponModification, armourModification, weaponQuality, attackSpecial
**Conditions**: condition, criticalInjury, mutation, malignancy, mentalDisorder

## Sheet System (ApplicationV2)

### 8-Mixin Stack (bottom to top)
ApplicationV2Mixin → PrimarySheetMixin → TooltipMixin → VisualFeedbackMixin → EnhancedAnimationsMixin → CollapsiblePanelMixin → ContextMenuMixin → DragDropVisualMixin → WhatIfMixin

### PARTS System
```javascript
static PARTS = {
  header: { template: "...header.hbs" },
  tabs: { template: "...tabs.hbs" },
  overview: { template: "...tab-overview.hbs", scrollable: [""] }
};
```

### Action Handlers
```javascript
static DEFAULT_OPTIONS = {
  actions: { roll: ClassName.#onRoll }
};
static async #onRoll(event, target) {
  await this.actor.rollCharacteristic(target.dataset.rollTarget);
}
```

### Template Data
```handlebars
{{!-- Use system.xxx in templates (NOT actor.system.xxx) --}}
<input name="system.wounds.value" value="{{system.wounds.value}}" />
```

## Key Patterns

### Roll Methods (RogueTraderAcolyte)
```javascript
actor.rollCharacteristic("weaponSkill", "Melee Attack");
actor.rollSkill("dodge");
actor.rollSkill("commonLore", "Imperium");
actor.rollItem(itemId);
```

### Modifiers (from talents, traits, conditions, equipped items)
```javascript
system.modifiers = {
  characteristics: { strength: 10 },
  skills: { dodge: 10 },
  combat: { attack: 5, damage: 2, defense: 10 },
  resources: { wounds: 5, fate: 1 }
};
```

### Skill Schema
```javascript
skills: {
  dodge: { characteristic, trained, plus10, plus20, current },
  commonLore: { ..., entries: [{ name, trained, plus10, plus20, current }] }
}
```

### Armour by Location
```javascript
armour: { head, body, leftArm, rightArm, leftLeg, rightLeg }
  // each: { total, toughnessBonus, traitBonus, value }
```

## SCSS

**Entry**: `scss/rogue-trader.scss`
**Variables**: `scss/abstracts/_variables.scss`
**Components**: `scss/abstracts/_unified-components.scss` (single source of truth)

**Key Classes**: `.rt-panel`, `.rt-vital-stat`, `.rt-dropzone`, `.rt-btn-*`, `.rt-input`
**Modifiers**: `.rt-panel--wounds`, `.rt-panel--combat`, etc.
**Prefix**: All classes use `.rt-` prefix

## Origin Path System

6-step character creation flowchart: homeWorld(0) → birthright(1) → lureOfTheVoid(2) → trialsAndTravails(3) → motivation(4) → career(5)

**Files**:
- DataModel: `data/item/origin-path.mjs`
- Builder: `applications/character-creation/origin-path-builder.mjs`
- Processor: `utils/origin-grants-processor.mjs`

**Navigation**: Position N connects to [N-1, N, N+1] in adjacent steps (computed dynamically)

**Grants Schema**:
```javascript
grants: { characteristics, skills, talents, traits, equipment, aptitudes, woundsFormula, fateFormula, choices }
```

**Formulas**: `2xTB+1d5` (wounds), `(1-5|=2),(6-10|=3)` (fate)

## Helpers

### Skill Key Helper (`helpers/skill-key-helper.mjs`)
```javascript
SkillKeyHelper.nameToKey("Common Lore")  // "commonLore"
SkillKeyHelper.isSpecialist("commonLore") // true
SkillKeyHelper.getCharacteristic("dodge") // "Ag"
```

### Skill UUID Helper (`helpers/skill-uuid-helper.mjs`)
```javascript
findSkillUuid("Awareness")
findSkillUuid("Common Lore", "Imperium")
```

### Handlebars Helpers
**Logic**: eq, ne, gt, lt, and, or, not
**Math**: add, subtract, multiply, divide, floor, ceil, percent
**Arrays**: join, length, includes, filter, sort
**System**: localize, signedNumber, romanNumeral, characteristicLabel

## Common Gotchas

1. **Templates**: Use `{{system.xxx}}` not `{{actor.system.xxx}}`
2. **No caching**: Sheets compute fresh on each render
3. **All templates preloaded**: No lazy loading
4. **Field names**: Template names must match schema exactly
5. **jQuery**: Use `element.dataset.xxx` not `$(element).data('xxx')`
6. **prepareEmbeddedData**: Called after items ready, from Document.prepareData()
7. **Tab property**: Use `tab:` not `id:` in TABS array
8. **V2 classes**: Include `"sheet"` in classes array
9. **Integer fields**: V13 strict validation, use migrateData() to coerce
10. **Pack IDs**: Exactly 16 alphanumeric characters

## Build Commands

```bash
npm run build     # Full: clean → scss → copy → packs → archive
gulp scss         # SCSS only
gulp packs        # Packs only
```

## Compendium Packs

35 packs in `src/packs/`. Key packs:
- `rt-items-*`: weapons, armour, talents, traits, skills, conditions, origin-path
- `rt-actors-*`: bestiary, ships, vehicles
- `rt-journals-*`: rules references
- `rt-rolltables-*`: random tables

## Testing Checklist

- [ ] `npm run build` succeeds
- [ ] Browser console clean
- [ ] Skill training buttons work
- [ ] Stat adjustments work (wounds, fate, fatigue)
- [ ] Armour displays all 6 locations
- [ ] Weapon attacks roll correctly
- [ ] Drag/drop functions
