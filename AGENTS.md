# Rogue Trader VTT - Agent Reference

Foundry V13 game system for Rogue Trader RPG (Warhammer 40K, Dark Heresy 2e rules).

## Quick Facts

| Key          | Value                                                             |
| ------------ | ----------------------------------------------------------------- |
| System ID    | `rogue-trader`                                                    |
| Foundry      | V13.351+                                                          |
| Version      | 1.8.1                                                             |
| Entry        | `src/module/rogue-trader.mjs`                                     |
| Architecture | DataModel-heavy, slim Documents, ApplicationV2 with 8-mixin stack |

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

-   `data/actor/character.mjs` - CharacterData (player characters)
-   `data/actor/npc-v2.mjs` - NPCDataV2 (CURRENT NPC system)
-   `data/actor/templates/common.mjs` - CommonTemplate (10 characteristics, wounds)
-   `data/actor/templates/creature.mjs` - CreatureTemplate (skills, fate, fatigue)
-   `data/actor/mixins/horde-template.mjs` - Horde mechanics

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

-   Structured prerequisites (characteristics, skills, talents)
-   Grants system (skills, talents, traits, special abilities)
-   Modifiers (characteristics, skills, combat)
-   Tier/category system (Tier 0-3, 10+ categories)
-   Specialization support ("Weapon Training (Las)")
-   Stackable talents (rank tracking)
-   Rollable talents (via rollConfig)

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

-   `isRollable` - Can be rolled/activated
-   `tierLabel` - "Tier 1", "Tier 2", etc.
-   `fullName` - Name + specialization + rank
-   `hasGrants` - Does it grant anything?
-   `grantsSummary` - Array of grant descriptions

**Files**:

-   `data/item/talent.mjs` - DataModel (399 lines)
-   `applications/item/talent-sheet-v2.mjs` - Sheet
-   `utils/talent-grants.mjs` - Grant processor

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

-   `applications/actor/base-actor-sheet.mjs` - Base sheet (1800+ lines)
-   `applications/api/*` - 10 mixin files

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

-   Only render visible tabs
-   Partial updates (only re-render changed parts)
-   Better performance
-   State preservation (scroll positions)

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

-   `prepareDerivedData()` - Collects all modifiers from items
-   `getCharacteristicModifier(char)` - Total modifier for characteristic
-   `getSkillModifier(skill)` - Total modifier for skill
-   `getCombatModifier(type)` - Attack/damage/defense modifiers

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

-   Untrained: `-20` penalty
-   Trained: No penalty
-   +10: +10 bonus
-   +20: +20 bonus

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

-   `.rt-panel` - Main panel container
-   `.rt-vital-stat` - Wounds, fate, fatigue displays
-   `.rt-dropzone` - Drag-drop zones
-   `.rt-btn-*` - Button variants (primary, secondary, danger)
-   `.rt-input` - Form inputs

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

-   ApplicationV2 PARTS system
-   Action handlers (not jQuery `.on()`)
-   V13 toast system (not `ui.notifications`)
-   V13 context menus (native, not custom)
-   ProseMirror rich text editors
-   DataModel `prepareDerivedData()` for calculations
-   8-mixin stack for sheets

**Avoid These (DEPRECATED)**:

-   V1 Application sheets
-   jQuery event binding (`.click()`, `.on()`)
-   `ui.notifications` (use `ui.notifications.toasts`)
-   Custom context menus (use V13 native)
-   TinyMCE editors
-   Logic in sheet classes (move to DataModels)

## Compendium Packs

**30 packs** in `src/packs/` (JSON → LevelDB on build)

**Key Packs**:

-   `rt-items-talents` (300+ talents)
-   `rt-items-traits` (100+ traits)
-   `rt-items-skills` (36 skills)
-   `rt-items-weapons` (100+ weapons)
-   `rt-items-armour` (50+ armour)
-   `rt-items-origin-path` (30+ origin paths)
-   `rt-actors-bestiary` (50+ NPCs)
-   `rt-journals-*` (rules references)
-   `rt-rolltables-*` (random tables)

## Item Sheet Development Guide

### Creating a New Item Sheet

All item sheets extend `BaseItemSheet` (or `ContainerItemSheet` for items that can contain other items) and follow the ApplicationV2 pattern.

#### Basic Structure

```javascript
import BaseItemSheet from './base-item-sheet.mjs';

export default class MyItemSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['rogue-trader', 'sheet', 'item', 'my-item'],
        position: { width: 600, height: 700 },
        actions: {
            // Custom action handlers
            customAction: MyItemSheet.#handleCustomAction,
        },
    };

    /** @override */
    static PARTS = {
        sheet: {
            template: 'systems/rogue-trader/templates/item/item-my-item-sheet.hbs',
            scrollable: ['.rt-tab-content'], // Use unified selector
        },
    };

    /** @override */
    static TABS = [
        { tab: 'properties', group: 'primary', label: 'Properties' },
        { tab: 'description', group: 'primary', label: 'Description' },
        { tab: 'effects', group: 'primary', label: 'Effects' },
    ];

    /** @override */
    tabGroups = {
        primary: 'properties', // Default tab
    };

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        // Add custom context data
        context.myCustomData = this.item.system.someValue;

        return context;
    }

    // Action handlers (static, use arrow notation)
    static async #handleCustomAction(event, target) {
        // 'this' is bound to the sheet instance
        const value = target.dataset.value;
        await this.item.update({ 'system.field': value });
    }
}
```

#### Tab Handling (CURRENT PATTERN)

**DO NOT implement custom tab handlers.** Tabs are automatically managed by `PrimarySheetMixin._activateLegacyTabs()`.

**Template Requirements:**

```handlebars
{{! Nav container with unified classes }}
<nav class='rt-tabs rt-tabs--my-item rt-my-item-tabs' data-group='primary'>
    <button class='rt-tab rt-my-item-tab' data-tab='properties' data-group='primary'>
        Properties
    </button>
    <button class='rt-tab rt-my-item-tab' data-tab='description' data-group='primary'>
        Description
    </button>
</nav>

{{! Content container with unified classes }}
<section class='rt-tab-content rt-tab-content--my-item'>
    <div class='tab rt-my-item-panel' data-tab='properties' data-group='primary'>
        {{! Properties content }}
    </div>
    <div class='tab rt-my-item-panel' data-tab='description' data-group='primary'>
        {{! Description content }}
    </div>
</section>
```

**Key Points:**

-   Use **dual class pattern**: `.rt-tabs` (unified) + `.rt-tabs--{type}` (per-sheet)
-   Always include `data-group="primary"` on nav and buttons
-   Always include `data-tab="{name}"` on buttons and panels
-   Use `.rt-tab-content` for scrollable config

**DEPRECATED PATTERN (DO NOT USE):**

```javascript
// ❌ DO NOT implement custom tab handlers
_setupMyItemTabs() {
    const tabs = this.element.querySelectorAll('.rt-my-item-tabs .rt-my-item-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', (event) => {
            // ... manual tab switching
        });
    });
}
```

#### Action Handlers Pattern

Use static methods with arrow notation for action handlers:

```javascript
static DEFAULT_OPTIONS = {
    actions: {
        addItem: MySheet.#addItem,
        removeItem: MySheet.#removeItem,
        toggleFlag: MySheet.#toggleFlag
    }
};

/**
 * Add an item to the collection.
 * @this {MySheet}
 * @param {PointerEvent} event - Triggering event
 * @param {HTMLElement} target - Action target
 */
static async #addItem(event, target) {
    const itemId = target.dataset.itemId;
    // Access sheet instance via 'this'
    await this.item.update({ 'system.items': [...this.item.system.items, itemId] });
}
```

#### Container Items (Drag-Drop)

For items that can contain other items (weapons with mods, armour with mods), extend `ContainerItemSheet`:

```javascript
import ContainerItemSheet from './container-item-sheet.mjs';

export default class WeaponSheet extends ContainerItemSheet {
    /** @override */
    _canAddItem(item) {
        if (!super._canAddItem(item)) return false;

        // Custom validation
        if (item.type !== 'weaponModification') {
            ui.notifications.warn('Only weapon modifications can be added');
            return false;
        }

        return true;
    }

    /** @override */
    async _onDrop(event) {
        event.preventDefault();

        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData('text/plain'));
        } catch (err) {
            return false;
        }

        if (data.type !== 'Item') return false;

        const droppedItem = await fromUuid(data.uuid);
        if (!droppedItem) return false;

        // Handle custom drop logic
        if (droppedItem.type === 'weaponModification') {
            return this._onDropModification(droppedItem);
        }

        // Fallback to parent
        return super._onDrop(event);
    }
}
```

#### Common Patterns

**Edit Mode Toggle:**

```javascript
// In sheet class
#editMode = false;

get inEditMode() {
    if (this.isCompendiumItem) return false;
    if (!this.isOwnedByActor) return this.isEditable;
    return this.#editMode && this.isEditable;
}

static async #toggleEditMode(event, target) {
    if (!this.canEdit) return;
    this.#editMode = !this.#editMode;
    this.render();
}
```

**Context Preparation:**

```javascript
async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Add CONFIG references
    context.CONFIG = CONFIG;

    // Add edit mode flags
    context.canEdit = this.canEdit;
    context.inEditMode = this.inEditMode;

    // Prepare arrays for templates
    context.itemsArray = Array.from(this.item.system.items || []);

    // Add derived data
    context.effectiveValue = this.item.system.calculateEffectiveValue();

    return context;
}
```

**Modification Systems:**

```javascript
// Store modifications as array of objects with UUIDs
{
    modifications: [
        {
            uuid: "Compendium.rogue-trader.items.xxx",
            name: "Red Dot Sight",
            active: true,
            cachedModifiers: { toHit: 10, range: 5 }
        }
    ]
}

// In DataModel prepareDerivedData()
prepareDerivedData() {
    super.prepareDerivedData();

    // Calculate effective stats with modifications
    this.effectiveToHit = this.baseToHit;
    for (const mod of this.modifications) {
        if (mod.active) {
            this.effectiveToHit += mod.cachedModifiers.toHit || 0;
        }
    }
}
```

### Item Sheet Gotchas

1. **Template Context**: Use `{{system.xxx}}` NOT `{{actor.system.xxx}}` in Handlebars
2. **Scrollable Config**: Always use `.rt-tab-content` for consistent behavior
3. **Tab Management**: Never implement custom tab handlers - use PrimarySheetMixin
4. **Action Naming**: Use `data-action="actionName"` not `onClick` or jQuery bindings
5. **Field Names**: Input `name` attributes must match DataModel schema exactly
6. **Edit Mode**: Check `this.isEditable` and `this.isCompendiumItem` before allowing edits
7. **Array Updates**: Always use `await this.item.update()` - never mutate `system` directly
8. **UUID References**: Store UUIDs for compendium items, not IDs
9. **Cached Data**: Cache expensive lookups (labels, computed values) during prepareContext
10. **Render Cycle**: Don't cache context - sheets re-render fresh each time

### Template Best Practices

1. **Header Structure**: Use existing header partials when possible
2. **Form Inputs**: Bind directly to system properties via `name="system.field"`
3. **Conditional Rendering**: Use `{{#if}}` for optional sections
4. **Icons**: Use Font Awesome 6 (`fa-solid`, `fa-regular`, `fa-brands`)
5. **Badges**: Use `.rt-badge` classes for status indicators
6. **Buttons**: Use `data-action` for all interactive buttons
7. **Tooltips**: Use `data-tooltip` for V13 native tooltips
8. **Drag Zones**: Use `data-drop-zone="name"` for drop targets
9. **Iterators**: Use `{{#each}}` with `@index` for arrays
10. **Localization**: Always use `{{localize "RT.Label"}}` for text

## Beads Issue Tracking

This project uses **Beads** for AI-native issue tracking. Issues live in `.beads/` and sync with git.

### When to Use Beads vs TodoWrite

| Use Beads (`bd`)                    | Use TodoWrite                |
| ----------------------------------- | ---------------------------- |
| Multi-session work                  | Single-session tasks         |
| Work with dependencies              | Simple execution lists       |
| Discovered work that needs tracking | Breaking down immediate work |
| Bugs, features, strategic tasks     | Step-by-step task tracking   |
| Anything that needs persistence     | Temporary session planning   |

**Rule of thumb**: If work might span sessions or has dependencies, use beads. If it's a simple checklist for right now, use TodoWrite.

### Essential Commands

```bash
# Finding Work
bd ready                           # Show issues ready to work (no blockers)
bd list --status=open              # All open issues
bd list --status=in_progress       # Your active work
bd show <id>                       # Detailed issue view with dependencies
bd blocked                         # Show all blocked issues

# Creating Issues
bd create --title="Fix bug X" --type=bug --priority=2
bd create --title="Add feature Y" --type=feature --priority=1

# Priority: 0-4 (NOT "high"/"medium"/"low")
#   0 = P0 (critical)
#   1 = P1 (high)
#   2 = P2 (medium, default)
#   3 = P3 (low)
#   4 = P4 (backlog)

# Updating Issues
bd update <id> --status=in_progress  # Claim work
bd update <id> --assignee=username   # Assign to someone

# Closing Issues
bd close <id>                        # Mark complete
bd close <id1> <id2> <id3>           # Close multiple at once (efficient)
bd close <id> --reason="explanation" # Close with reason
bd reopen <id>                       # Reopen if needed

# Dependencies
bd dep add <issue> <depends-on>      # issue depends on depends-on
bd dep remove <issue> <depends-on>   # Remove dependency

# Sync (REQUIRED at session end)
bd sync                              # Sync with git remote
bd sync --status                     # Check sync status
```

### Agent Delegation

**Default to the beads-task-agent.** For ANY beads work involving multiple commands, use:

```javascript
// Use Task tool with subagent_type: "beads-task-agent"
```

**Delegate to agent for:**

-   Status overviews ("what's next", "what's blocked", "show me progress")
-   Exploring the issue graph (ready + in-progress + blocked queries)
-   Finding and completing ready work
-   Working through multiple issues in sequence
-   Any request requiring 2+ bd commands

**Use CLI directly ONLY for single, atomic operations:**

-   Creating exactly one issue
-   Closing exactly one issue
-   Updating one specific field

**Why delegate?** The agent processes multiple commands internally and returns only a concise summary. Running bd commands directly dumps raw JSON into context, wasting tokens.

### Issue Types

| Type      | Use For                                     |
| --------- | ------------------------------------------- |
| `bug`     | Something broken that needs fixing          |
| `feature` | New functionality to implement              |
| `task`    | General work item (refactoring, docs, etc.) |

### Dependencies & Blocking

Dependencies track work order. If issue A depends on issue B, A is blocked until B is closed.

```bash
# Feature depends on API (API must be done first)
bd create --title="Build API endpoint" --type=task
# Returns: beads-001
bd create --title="Add feature using API" --type=feature
# Returns: beads-002
bd dep add beads-002 beads-001  # Feature depends on API

# Check what's blocked
bd blocked                      # List all blocked issues
bd show beads-002               # See blockers for specific issue
```

### Project Health

```bash
bd stats                         # Open/closed/blocked counts
bd doctor                        # Check for sync issues, missing hooks
```

### Common Workflows

**Starting a session:**

```bash
bd ready                         # Find available work
bd show <id>                     # Review issue details
bd update <id> --status=in_progress  # Claim it
```

**During work:**

```bash
# Discover new work needed? Create an issue
bd create --title="Also need to fix X" --type=bug --priority=2

# Found a blocker? Add dependency
bd dep add <current> <blocker>
```

**Ending a session:**

```bash
bd close <id1> <id2> ...         # Close all completed issues
bd sync                          # Push to remote (MANDATORY)
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Linters
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
    ```bash
    git pull --rebase
    bd sync
    git push
    git status  # MUST show "up to date with origin"
    ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**

-   Work is NOT complete until `git push` succeeds
-   NEVER stop before pushing - that leaves work stranded locally
-   NEVER say "ready to push when you are" - YOU must push
-   If push fails, resolve and retry until it succeeds
