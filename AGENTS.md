# Rogue Trader VTT - Agent Reference

Foundry V13 game system for Rogue Trader RPG (Warhammer 40K, Dark Heresy 2e rules).

## Quick Facts

| Key          | Value                                                             |
| ------------ | ----------------------------------------------------------------- |
| System ID    | `rogue-trader`                                                    |
| Foundry      | V13.351+                                                          |
| Version      | 1.8.1                                                             |
| Build        | `npm run build` → `dist/`                                         |
| Entry        | `src/module/rogue-trader.mjs`                                     |
| Architecture | DataModel-heavy, slim Documents, ApplicationV2 with 8-mixin stack |

## Game Mechanics

- **d100 roll-under**: roll ≤ target = success
- **Degrees**: `floor((target - roll) / 10) + 1`
- **Critical**: 01-05 auto-success, 96-00 auto-fail, OR 3+ degrees
- **10 Characteristics**: WS, BS, S, T, Ag, Int, Per, WP, Fel, Inf
- **Characteristic Bonus**: tens digit (42 → CB 4)
- **Unnatural**: bonus multiplier (×2, ×3) - affects CB

## Directory Structure

```
src/module/
├── actions/            # Combat action managers (Full/Half/Reaction)
├── applications/       # ApplicationV2 sheets + dialogs
│   ├── actor/          # Actor sheets (Acolyte, NPC V2, Vehicle, Starship)
│   ├── api/            # 8-mixin stack + base classes
│   ├── character-creation/  # Origin path builder
│   ├── dialogs/        # Roll config, confirmation, stat importer
│   ├── item/           # Item sheets (talent, weapon, etc.)
│   ├── npc/            # NPC tools (encounter builder, threat scaler)
│   └── prompts/        # Effect/roll prompts
├── data/               # DataModels (heart of system)
│   ├── abstract/       # Base classes (ActorDataModel, ItemDataModel)
│   ├── actor/          # Actor DataModels + templates + mixins
│   ├── fields/         # Custom field types (IdentifierField, FormulaField)
│   ├── item/           # 36+ item type DataModels
│   └── shared/         # Shared templates (ModifiersTemplate, DescriptionTemplate)
├── dice/               # D100Roll, BasicRollRT
├── documents/          # Document classes (roll methods, API)
├── handlebars/         # 60+ Handlebars helpers
├── helpers/            # SkillKeyHelper, SkillUuidHelper, GameIcons
└── utils/              # Calculators (armour, encumbrance), processors (grants)
```

## Architecture Layers

**DataModel-Heavy Philosophy**: Most logic lives in DataModels (schema, calculations, derived data). Documents are thin wrappers (roll methods, API). Sheets are UI-focused (no business logic).

| Layer          | Purpose                            | Key Pattern                                         |
| -------------- | ---------------------------------- | --------------------------------------------------- |
| **DataModels** | Schema, calculations, derived data | `prepareBaseData()` → `prepareDerivedData()`        |
| **Documents**  | Roll methods, API surface          | `rollCharacteristic()`, `rollSkill()`, `rollItem()` |
| **Sheets**     | UI, events, 8-mixin stack          | PARTS system, action handlers                       |

### Data Prep Flow

```
Actor.prepareData()
  → DataModel.prepareBaseData()           // Base values
  → DataModel.prepareDerivedData()        // Computed properties
  → Document.prepareEmbeddedDocuments()   // Items loaded
  → Document.prepareEmbeddedData()        // Apply item modifiers
  → Compute armour, encumbrance, etc.
```

## Actor Types (CURRENT)

| Type          | DataModel     | Document            | Sheet          | Notes                                    |
| ------------- | ------------- | ------------------- | -------------- | ---------------------------------------- |
| **acolyte**   | CharacterData | RogueTraderAcolyte  | AcolyteSheet   | Player characters                        |
| **character** | CharacterData | RogueTraderAcolyte  | AcolyteSheet   | Alias for acolyte                        |
| **npcV2**     | NPCDataV2     | RogueTraderNPCV2    | NPCSheetV2     | **CURRENT NPC** (simplified, GM-focused) |
| **vehicle**   | VehicleData   | RogueTraderVehicle  | VehicleSheetV2 | Ground/air vehicles                      |
| **starship**  | StarshipData  | RogueTraderStarship | StarshipSheet  | Void ships                               |

⚠️ **DEPRECATED**: Legacy `npc` type (use `npcV2` instead)

### Actor DataModel Hierarchy

```
ActorDataModel (abstract base)
├── CommonTemplate
│   ├── 10 characteristics (WS, BS, S, T, Ag, Int, Per, WP, Fel, Inf)
│   ├── wounds, initiative, size
│   └── CreatureTemplate
│       ├── fatigue, fate, psy rating
│       ├── backpack, encumbrance
│       ├── skills (standard + specialist)
│       └── CharacterData
│           ├── bio, origin paths
│           ├── XP, insanity, corruption
│           └── profit factor, ship points
│
└── NPCDataV2 (independent, with HordeTemplate mixin)
    ├── Simplified for GMs (no XP, no origin paths)
    ├── Sparse skill storage (only trained skills)
    ├── Simple weapons/armour (inline OR embedded)
    ├── threatLevel, role, type
    └── Horde mechanics (magnitude, damage per hit)
```

**Key Files**:

- `data/actor/character.mjs` - CharacterData (player characters)
- `data/actor/npc-v2.mjs` - NPCDataV2 (CURRENT NPC system)
- `data/actor/templates/common.mjs` - CommonTemplate (10 characteristics, wounds)
- `data/actor/templates/creature.mjs` - CreatureTemplate (skills, fate, fatigue)
- `data/actor/mixins/horde-template.mjs` - Horde mechanics

### NPC V2 System (CURRENT)

**Philosophy**: Minimal complexity, GM-centric, fast creation/editing.

**Key Features**:

- **Sparse skills**: Only store trained skills (not all 36)
- **Simple weapons**: Inline array OR embedded items (toggle mode)
- **Simple armour**: Total value OR location-based
- **Custom stats**: Manual overrides for special NPCs
- **Threat scaling**: Auto-scale stats by threat level (1-30)
- **Horde mechanics**: Magnitude, damage per hit
- **Stat block I/O**: Import/export text stat blocks

**Schema**:

```javascript
{
  faction, subfaction, allegiance,
  primaryUse: "npc" | "vehicle" | "ship",
  role: "bruiser" | "sniper" | "caster" | "support" | "commander" | "specialist",
  type: "troop" | "elite" | "master" | "horde" | "swarm" | "creature" | "daemon" | "xenos",
  threatLevel: 1-30,

  trainedSkills: { "awareness": { trained: true, plus10: false, bonus: 0, current: 45 } },

  weapons: {
    mode: "simple" | "embedded",
    simple: [{ name, damage, pen, range, rof, clip, reload, special, class }]
  },

  armour: {
    mode: "simple" | "locations",
    total: 4,
    locations: { head, body, leftArm, rightArm, leftLeg, rightLeg }
  },

  customStats: { enabled: boolean, characteristics: {}, skills: {} },

  horde: { enabled, magnitude: { max, current }, damagePerHit }
}
```

**Methods**:

- `getSkillTarget(skillName)` - Calculate skill test target
- `addTrainedSkill(name, char, level, bonus)` - Add a skill
- `addSimpleWeapon(data)` - Add inline weapon
- `switchWeaponMode("simple" | "embedded")` - Toggle weapon mode
- `scaleToThreat(newThreatLevel)` - Auto-scale stats
- `exportStatBlock()` - Export as text block

**Files**:

- `data/actor/npc-v2.mjs` - DataModel (901 lines)
- `documents/npc-v2.mjs` - Document (477 lines)
- `applications/actor/npc-sheet-v2.mjs` - Sheet
- `applications/npc/` - Tools (8 files: encounter builder, threat calculator, stat block parser, etc.)

## Item Types (36+)

**Equipment**: weapon, armour, ammunition, gear, cybernetic, forceField, backpack, storageLocation, tool, consumable, drug

**Character Features**: talent, trait, skill, originPath, aptitude, peer, enemy, combatAction, specialAbility

**Conditions**: condition, criticalInjury, mutation, malignancy, mentalDisorder

**Powers**: psychicPower, navigatorPower, ritual, order

**Ship & Vehicle**: shipComponent, shipWeapon, shipUpgrade, shipRole, vehicleTrait, vehicleUpgrade

**Modifications**: weaponModification, armourModification, weaponQuality, attackSpecial

**Misc**: npcTemplate, journalEntry

### Talent System (Post-Overhaul)

**Key Features**:

- Structured prerequisites (characteristics, skills, talents)
- Grants system (skills, talents, traits, special abilities)
- Modifiers (characteristics, skills, combat)
- Tier/category system (Tier 0-3, 10+ categories)
- Specialization support ("Weapon Training (Las)")
- Stackable talents (rank tracking)
- Rollable talents (via rollConfig)

**Schema**:

```javascript
{
  identifier: "rapid-reload",
  category: "combat" | "general" | "leadership" | "social" | ...,
  tier: 0-3,

  prerequisites: {
    text: "Agility 30",
    characteristics: { agility: 30 },
    skills: ["Security"],
    talents: ["Weapon Training (Las)"]
  },

  aptitudes: ["Agility", "Finesse"],
  cost: 300,
  benefit: "<p>Benefit text...</p>",

  isPassive: true,
  rollConfig: { characteristic: "agility", modifier: 10, description: "..." },

  stackable: false,
  rank: 1,

  hasSpecialization: false,
  specialization: "",

  grants: {
    skills: [{ name: "Awareness", specialization: "", level: "trained" }],
    talents: [{ name: "Weapon Training", specialization: "Las", uuid: "..." }],
    traits: [{ name: "Dark Sight", level: null, uuid: "..." }],
    specialAbilities: [{ name: "...", description: "<p>...</p>" }]
  },

  modifiers: {
    characteristics: { strength: 5 },
    skills: { dodge: 10 },
    combat: { attack: 5, damage: 2, defense: 10 },
    other: [{ key: "initiative", value: 2 }]
  }
}
```

**Properties**:

- `isRollable` - Can be rolled/activated
- `tierLabel` - "Tier 1", "Tier 2", etc.
- `fullName` - Name + specialization + rank
- `hasGrants` - Does it grant anything?
- `grantsSummary` - Array of grant descriptions

**Files**:

- `data/item/talent.mjs` - DataModel (399 lines)
- `applications/item/talent-sheet-v2.mjs` - Sheet
- `utils/talent-grants.mjs` - Grant processor

### Origin Path System (Post-Rework)

**6-Step Flowchart**: homeWorld(0) → birthright(1) → lureOfTheVoid(2) → trialsAndTravails(3) → motivation(4) → career(5)

**Key Features**:

- **Multi-position support**: Origins can occupy multiple positions in flowchart (`positions: [1, 5]`)
- **Formula-based wounds**: `"2xTB+1d5"`, `"1d10+2"`, etc.
- **Formula-based fate**: `"(1-5|=2),(6-10|=3)"` (conditional rolls)
- **Interactive rolling**: Roll results stored with breakdown
- **Choice system**: Player decisions (e.g., "Choose +5 to one of: WS, BS, or S")
- **Active modifiers**: Calculated from choices in `prepareDerivedData`

**Schema**:

```javascript
{
  identifier: "death-world",
  step: "homeWorld" | "birthright" | "lureOfTheVoid" | "trialsAndTravails" | "motivation" | "career",
  stepIndex: 0-5,

  positions: [4],  // Array of positions (0-8) this origin occupies

  xpCost: 0,  // For Into The Storm advanced origins
  isAdvancedOrigin: false,
  replacesOrigins: [],

  source: { book: "Core Rulebook", page: "17", custom: "" },

  grants: {
    woundsFormula: "2xTB+1d5",  // NEW: Formula-based
    fateFormula: "(1-5|=2),(6-10|=3)",  // NEW: Conditional

    wounds: 0,  // Legacy (backward compat)
    fateThreshold: 0,  // Legacy

    blessedByEmperor: false,

    skills: [{ name: "Survival", specialization: "", level: "trained" }],
    talents: [{ name: "Weapon Training", specialization: "Las", uuid: "..." }],
    traits: [{ name: "Size (Hulking)", level: 5, uuid: "..." }],
    aptitudes: ["Strength", "Toughness"],
    equipment: [{ name: "Stub Revolver", quantity: 1, uuid: "..." }],
    specialAbilities: [{ name: "Wilderness Savvy", description: "<p>...</p>" }],

    choices: [{
      type: "characteristic" | "skill" | "talent" | "equipment",
      label: "Choose Combat Characteristic",
      options: [
        { value: "ws", label: "+5 WS", grants: { characteristics: { weaponSkill: 5 } } },
        { value: "bs", label: "+5 BS", grants: { characteristics: { ballisticSkill: 5 } } }
      ],
      count: 1,
      xpCost: 0
    }]
  },

  selectedChoices: { "Choose Combat Characteristic": ["ws"] },

  activeModifiers: [
    { source: "Choose Combat Characteristic", type: "characteristic", key: "weaponSkill", value: 5 }
  ],

  rollResults: {
    wounds: { formula: "2xTB+1d5", rolled: 14, breakdown: "2×4+1d5(6) = 14", timestamp: 1704... },
    fate: { formula: "(1-5|=2),(6-10|=3)", rolled: 2, breakdown: "1d10(3) → 2", timestamp: 1704... }
  }
}
```

**Files**:

- `data/item/origin-path.mjs` - DataModel (546 lines)
- `applications/character-creation/origin-path-builder.mjs` - Visual flowchart builder
- `applications/character-creation/origin-roll-dialog.mjs` - Interactive rolling
- `applications/character-creation/origin-path-choice-dialog.mjs` - Choice selection
- `utils/origin-grants-processor.mjs` - Grant processor
- `utils/formula-evaluator.mjs` - Formula evaluation
- `utils/origin-chart-layout.mjs` - Flowchart layout calculation

## ApplicationV2 Sheet System

### 8-Mixin Stack

**BaseActorSheet** extends this stack (bottom to top):

```
ApplicationV2Mixin        → Base V2 (PARTS, actions)
  PrimarySheetMixin       → Tab state, focus management
    TooltipMixin          → Advanced tooltips with enrichers
      VisualFeedbackMixin → Stat change animations
        EnhancedAnimationsMixin → CSS transitions
          CollapsiblePanelMixin → Panel collapse/expand
            ContextMenuMixin → V13 context menus
              EnhancedDragDropMixin → Drag-drop visuals
                WhatIfMixin → "What-if" mode for testing changes
```

**Each Mixin**:

| Mixin                   | Purpose                  | Key Features                                     |
| ----------------------- | ------------------------ | ------------------------------------------------ |
| ApplicationV2Mixin      | Core V2 functionality    | PARTS system, action handlers, state persistence |
| PrimarySheetMixin       | Primary sheet management | Tab navigation, focus restore, window state      |
| TooltipMixin            | Advanced tooltips        | Characteristic/skill tooltips, text enrichers    |
| VisualFeedbackMixin     | Visual feedback          | Stat change indicators, success/fail feedback    |
| EnhancedAnimationsMixin | CSS animations           | Smooth transitions, rolling effects, fade-ins    |
| CollapsiblePanelMixin   | Panel collapsing         | State persistence, smooth expand/collapse        |
| ContextMenuMixin        | V13 context menus        | Item actions, quick actions, native menus        |
| EnhancedDragDropMixin   | Drag-drop visuals        | Drop zones, visual feedback, hover states        |
| WhatIfMixin             | Temporary changes        | Preview stat changes without committing          |

**Files**:

- `applications/actor/base-actor-sheet.mjs` - Base sheet (1800+ lines)
- `applications/api/*` - 10 mixin files

### PARTS System

Sheets are composed of template parts (lazy-loaded, partial re-rendering):

```javascript
static PARTS = {
  header: { template: "systems/rogue-trader/templates/actor/acolyte/header.hbs" },
  tabs: { template: "systems/rogue-trader/templates/actor/acolyte/tabs.hbs" },
  overview: {
    template: "systems/rogue-trader/templates/actor/acolyte/tab-overview.hbs",
    scrollable: [""]
  },
  skills: {
    template: "systems/rogue-trader/templates/actor/acolyte/tab-skills.hbs",
    scrollable: [".rt-skills-columns"]
  },
  combat: { template: "systems/rogue-trader/templates/actor/acolyte/tab-combat.hbs" }
};
```

**Benefits**:

- Only render visible tabs
- Partial updates (only re-render changed parts)
- Better performance
- State preservation (scroll positions)

### Action Handlers

All interactivity via `static DEFAULT_OPTIONS.actions`:

```javascript
static DEFAULT_OPTIONS = {
  actions: {
    roll: BaseActorSheet.#roll,
    itemRoll: BaseActorSheet.#itemRoll,
    itemEdit: BaseActorSheet.#itemEdit,
    itemDelete: BaseActorSheet.#itemDelete,
    toggleTraining: BaseActorSheet.#toggleTraining,
    addSpecialistSkill: BaseActorSheet.#addSpecialistSkill,
    enterWhatIf: BaseActorSheet.#enterWhatIf
    // ... 20+ actions
  }
};

static async #roll(event, target) {
  const rollType = target.dataset.rollType;
  const rollTarget = target.dataset.rollTarget;

  if (rollType === "characteristic") {
    await this.actor.rollCharacteristic(rollTarget);
  } else if (rollType === "skill") {
    await this.actor.rollSkill(rollTarget);
  }
}
```

**In templates**:

```handlebars
<button data-action='roll' data-roll-type='characteristic' data-roll-target='weaponSkill'>
    Roll WS
</button>
```

## Key Patterns

### Roll Methods

```javascript
// Characteristic test
await actor.rollCharacteristic('weaponSkill', 'Melee Attack');

// Skill test (standard)
await actor.rollSkill('dodge');

// Skill test (specialist with specialization)
await actor.rollSkill('commonLore', 'Imperium');

// Item roll (weapon attack)
await actor.rollItem(itemId);
```

### Modifiers System

Applied automatically by items (talents, traits, conditions, equipped gear):

```javascript
// In TalentData, TraitData, or condition items
modifiers: {
  characteristics: { strength: 10 },
  skills: { dodge: 10 },
  combat: { attack: 5, damage: 2, defense: 10 },
  other: [{ key: "initiative", value: 2 }]
}
```

**Applied in**:

- `prepareDerivedData()` - Collects all modifiers from items
- `getCharacteristicModifier(char)` - Total modifier for characteristic
- `getSkillModifier(skill)` - Total modifier for skill
- `getCombatModifier(type)` - Attack/damage/defense modifiers

### Skill Schema

```javascript
skills: {
  // Standard skill (single target)
  dodge: {
    characteristic: "Ag",
    trained: false,
    plus10: false,
    plus20: false,
    bonus: 0,
    current: 30  // Calculated: base + training + bonus
  },

  // Specialist skill (multiple specializations)
  commonLore: {
    characteristic: "Int",
    trained: false,
    plus10: false,
    plus20: false,
    bonus: 0,
    entries: [
      {
        name: "Imperium",
        trained: true,
        plus10: false,
        plus20: false,
        bonus: 0,
        current: 42
      },
      { name: "Adeptus Mechanicus", trained: false, plus10: false, plus20: false, bonus: 0, current: 32 }
    ]
  }
}
```

**Training Levels**:

- Untrained: `-20` penalty
- Trained: No penalty
- +10: +10 bonus
- +20: +20 bonus

### Armour by Location

```javascript
armour: {
  head: {
    total: 4,          // From equipped armour items
    toughnessBonus: 4, // Toughness Bonus
    traitBonus: 0,     // From traits (Machine, Daemonic, etc.)
    value: 8           // total + toughnessBonus + traitBonus
  },
  body: { total: 6, toughnessBonus: 4, traitBonus: 0, value: 10 },
  leftArm: { total: 4, toughnessBonus: 4, traitBonus: 0, value: 8 },
  rightArm: { total: 4, toughnessBonus: 4, traitBonus: 0, value: 8 },
  leftLeg: { total: 4, toughnessBonus: 4, traitBonus: 0, value: 8 },
  rightLeg: { total: 4, toughnessBonus: 4, traitBonus: 0, value: 8 }
}
```

**Calculated by**: `utils/armour-calculator.mjs` in `prepareEmbeddedData()`

## Utilities & Helpers

### Helpers (`helpers/`)

#### SkillKeyHelper (`skill-key-helper.mjs`)

Converts skill names ↔ keys.

```javascript
SkillKeyHelper.nameToKey('Common Lore'); // → "commonLore"
SkillKeyHelper.keyToName('commonLore'); // → "Common Lore"
SkillKeyHelper.isSpecialist('commonLore'); // → true
SkillKeyHelper.getCharacteristic('dodge'); // → "Ag"
```

#### SkillUuidHelper (`skill-uuid-helper.mjs`)

Finds skill UUIDs in compendiums.

```javascript
await findSkillUuid('Awareness'); // → "Compendium.rogue-trader.rt-items-skills...."
await findSkillUuid('Common Lore', 'Imperium'); // → with specialization
```

#### GameIcons (`game-icons.mjs`)

Icon mapping for items/abilities.

### Utils (`utils/`)

#### OriginGrantsProcessor (`origin-grants-processor.mjs`)

Processes origin path grants and applies to actors.

```javascript
await OriginGrantsProcessor.applyOriginPath(actor, originPathItem);
// Applies: characteristics, skills, talents, traits, aptitudes, equipment, wounds, fate, choices
```

#### FormulaEvaluator (`formula-evaluator.mjs`)

Evaluates complex formulas.

```javascript
// Wounds formulas
FormulaEvaluator.evaluateWounds(actor, '2xTB+1d5');
// → { result: 14, breakdown: "2×4+1d5(6) = 14" }

// Fate formulas (conditional)
FormulaEvaluator.evaluateFate(actor, '(1-5|=2),(6-10|=3)');
// → { result: 2, breakdown: "1d10(3) → 2 fate points" }
```

#### ArmourCalculator (`armour-calculator.mjs`)

Calculates total armour by location from equipped items.

```javascript
ArmourCalculator.calculate(actor);
// Returns: { head: { total, items, toughnessBonus, traitBonus, value }, body: {...}, ... }
```

#### EncumbranceCalculator (`encumbrance-calculator.mjs`)

Calculates carrying capacity and encumbrance.

```javascript
EncumbranceCalculator.calculate(actor);
// Returns: { current: 42, max: 90, percentage: 47, status: "normal" | "encumbered" | "overencumbered" }
```

#### TalentGrants (`talent-grants.mjs`)

Processes talent grants (skills, talents, traits).

```javascript
await TalentGrants.applyTalent(actor, talentItem);
```

#### OriginChartLayout (`origin-chart-layout.mjs`)

Calculates flowchart layout and connections for origin path builder.

```javascript
OriginChartLayout.calculateLayout(originPathItems, currentStep);
// Returns: { positions, connections, validNextSteps, ... }
```

### Handlebars Helpers

**Logic**: `eq`, `ne`, `gt`, `lt`, `gte`, `lte`, `and`, `or`, `not`
**Math**: `add`, `subtract`, `multiply`, `divide`, `floor`, `ceil`, `percent`
**Arrays**: `join`, `length`, `includes`, `filter`, `sort`, `unique`
**System**: `localize`, `signedNumber`, `romanNumeral`, `characteristicLabel`, `characteristicBonus`

## SCSS System

**Entry**: `scss/rogue-trader.scss` (imports all partials)
**Variables**: `scss/abstracts/_variables.scss` (colors, spacing, fonts)
**Components**: `scss/abstracts/_unified-components.scss` (single source of truth for all components)
**Theme**: `scss/abstracts/_gothic-theme.scss` (40K gothic aesthetic)

**File Count**: 138 SCSS files

**Key Classes**:

- `.rt-panel` - Main panel container
- `.rt-vital-stat` - Wounds, fate, fatigue displays
- `.rt-dropzone` - Drag-drop zones
- `.rt-btn-*` - Button variants (primary, secondary, danger)
- `.rt-input` - Form inputs

**Modifiers**: `.rt-panel--wounds`, `.rt-panel--combat`, `.rt-panel--skills`, etc.

**Prefix**: All classes use `.rt-` prefix to avoid conflicts.

## Template Data Context

**IMPORTANT**: In Handlebars templates, use `{{system.xxx}}` NOT `{{actor.system.xxx}}`

```handlebars
{{! CORRECT }}
<input name='system.wounds.value' value='{{system.wounds.value}}' />
<p>{{system.characteristics.weaponSkill.total}}</p>

{{! INCORRECT }}
<input name='actor.system.wounds.value' value='{{actor.system.wounds.value}}' />
```

**Context Structure**:

```javascript
{
  actor: this.actor,                 // The actor document
  system: this.actor.system,         // Direct access to DataModel
  source: this.actor.system._source, // Source data (editable)
  fields: this.actor.system.schema.fields, // Schema fields
  effects: [...],                    // Active effects
  items: [...],                      // Items array
  limited: false,                    // Is view limited?
  rollableClass: "rollable",         // CSS class for rollable

  // Prepared data (from _prepareContext)
  skillLists: { standard, specialist, standardColumns },
  itemsByType: { weapon: [...], armour: [...], talent: [...] },
  combatStats: { attack, damage, defense },
  // ... etc
}
```

## Common Gotchas

1. **Templates**: Use `{{system.xxx}}` not `{{actor.system.xxx}}`
2. **Action handlers**: Use `data-action="actionName"` not jQuery event binding
3. **Field names**: Template input names must match schema exactly
4. **Integer fields**: V13 strict validation - use `migrateData()` to coerce
5. **Tab property**: Use `tab:` not `id:` in TABS array
6. **V2 classes**: Include `"sheet"` in classes array
7. **Pack IDs**: Exactly 16 alphanumeric characters
8. **prepareEmbeddedData**: Called after items ready, from `Document.prepareData()`
9. **No caching**: Sheets compute fresh on each render (use memoization for expensive calculations)
10. **Lazy loading**: Templates only render when PART is visible

## V13 Modern Patterns

**Use These (CURRENT)**:

- `npcV2` actor type (not legacy `npc`)
- ApplicationV2 PARTS system
- Action handlers (not jQuery `.on()`)
- V13 toast system (not `ui.notifications`)
- V13 context menus (native, not custom)
- ProseMirror rich text editors
- DataModel `prepareDerivedData()` for calculations
- 8-mixin stack for sheets

**Avoid These (DEPRECATED)**:

- Legacy `npc` actor type
- V1 Application sheets
- jQuery event binding (`.click()`, `.on()`)
- `ui.notifications` (use `ui.notifications.toasts`)
- Custom context menus (use V13 native)
- TinyMCE editors
- Logic in sheet classes (move to DataModels)

## Build Commands

```bash
npm run build     # Full build: clean → scss → copy → packs → archive
gulp scss         # SCSS only
gulp packs        # Compendium packs only
gulp watch        # Watch for changes
```

## Compendium Packs

**30 packs** in `src/packs/` (JSON → LevelDB on build)

**Key Packs**:

- `rt-items-talents` (300+ talents)
- `rt-items-traits` (100+ traits)
- `rt-items-skills` (36 skills)
- `rt-items-weapons` (100+ weapons)
- `rt-items-armour` (50+ armour)
- `rt-items-origin-path` (30+ origin paths)
- `rt-actors-bestiary` (50+ NPCs)
- `rt-journals-*` (rules references)
- `rt-rolltables-*` (random tables)

## Testing Checklist

**Build**:

- [ ] `npm run build` succeeds without errors
- [ ] Browser console clean (no errors)

**Actors**:

- [ ] Create acolyte/npcV2/vehicle/starship actors
- [ ] Characteristic rolls work
- [ ] Skill training toggles work (trained/+10/+20)
- [ ] Stat adjustments work (wounds, fate, fatigue)

**Items**:

- [ ] Drag talents to actor → modifiers apply
- [ ] Weapon attacks roll correctly
- [ ] Armour displays all 6 locations
- [ ] Origin paths apply grants correctly

**UI**:

- [ ] Drag/drop functions (items, effects)
- [ ] Context menus work (right-click)
- [ ] Tooltips display on hover
- [ ] What-if mode toggles correctly

**Sheets**:

- [ ] All tabs render without errors
- [ ] Scroll positions preserved on re-render
- [ ] Panel collapse/expand works
- [ ] Action handlers fire correctly
