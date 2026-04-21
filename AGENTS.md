# Rogue Trader VTT - Agent Reference

Foundry V13 game system for Rogue Trader RPG (Warhammer 40K, Dark Heresy 2e rules).

| Key       | Value                                          |
| --------- | ---------------------------------------------- |
| System ID | `rogue-trader`                                 |
| Foundry   | V13.351+                                       |
| Entry     | `src/module/rogue-trader.mjs`                  |
| Style     | DataModel-heavy, slim Documents, ApplicationV2 |

---

## Work Tracking

Track work in the repository itself. Use issues, pull requests, or a local Markdown checklist when the task spans multiple sessions. Do not assume any external task-tracking CLI is available.

### Task Requirements

When documenting a bug, feature, task, or epic, include:

-   **Title**: Clear and actionable
-   **Priority**: Critical, high, normal, or backlog
-   **Description**: What is broken or needed, and why it matters
-   **Design Notes**: Intended approach and likely files to touch
-   **Acceptance Criteria**: Flat checklist of done conditions
-   **Dependencies**: Blocking work, if any

### Session Workflow

```bash
# START: inspect repo state
git status

# DURING: keep notes in the issue, PR, or local session summary

# END: verify, commit intentionally, and push
git status
git add <files>
git commit -m "<clear summary>"
git pull --rebase
git push
```

### When to Use Persistent Tracking vs Todo Lists

| Persistent tracking           | Todo lists                   |
| ----------------------------- | ---------------------------- |
| Multi-session work            | Single-session task lists    |
| Work with dependencies        | Breaking down immediate work |
| Bugs, features, strategic work| Step-by-step execution       |
| Anything needing history      | Temporary planning           |

### Agent Delegation

Use direct CLI and repository-native documentation. Do not depend on any external task-tracking agent or workflow tool.

---

## Project Structure

```
src/module/
├── applications/       # ApplicationV2 sheets + dialogs
│   ├── actor/          # Actor sheets (Acolyte, NPC, Vehicle, Starship)
│   ├── api/            # 8-mixin stack for sheets
│   └── item/           # Item sheets (base, weapon, talent, etc.)
├── data/               # DataModels (business logic lives here)
│   ├── actor/          # Actor DataModels + templates + mixins
│   └── item/           # 36+ item type DataModels
├── documents/          # Thin Document wrappers (roll methods, API)
├── dice/               # D100Roll, BasicRollRT
└── utils/              # Calculators, processors, helpers
```

**Key principle**: Logic in DataModels, not sheets. Sheets are UI only.

---

## Architecture Patterns

### 3-Layer Architecture

| Layer         | Purpose               | Example                              |
| ------------- | --------------------- | ------------------------------------ |
| **DataModel** | Schema, calculations  | `data/item/weapon.mjs`               |
| **Document**  | Roll methods, API     | `documents/item.mjs`                 |
| **Sheet**     | UI, events, rendering | `applications/item/weapon-sheet.mjs` |

### Data Prep Flow

```
Actor.prepareData()
  → DataModel.prepareBaseData()         // Base values
  → DataModel.prepareDerivedData()      // Computed properties
  → Document.prepareEmbeddedDocuments() // Items loaded
  → Document.prepareEmbeddedData()      // Apply item modifiers
```

---

## Creating Components

### Item Sheets

**Exemplar files**:

-   Complex: `applications/item/weapon-sheet.mjs`
-   Simple: `applications/item/condition-sheet.mjs`
-   Base class: `applications/item/base-item-sheet.mjs`

**Required patterns**:

```javascript
// Extend BaseItemSheet (inherits edit mode, tabs, actions)
export default class MySheet extends BaseItemSheet {
    static DEFAULT_OPTIONS = {
        classes: ['rogue-trader', 'sheet', 'item', 'my-type'],
        position: { width: 600, height: 700 },
        actions: { myAction: MySheet.#myAction }, // Static methods
    };

    static PARTS = {
        sheet: { template: '...', scrollable: ['.rt-tab-content'] },
    };

    static TABS = [{ tab: 'details', group: 'primary', label: 'Details' }];

    tabGroups = { primary: 'details' }; // Default tab
}
```

**Edit mode is inherited** - never reimplement. Properties: `canEdit`, `inEditMode`, `isCompendiumItem`, `isOwnedByActor`

### DataModels

**Exemplar files**:

-   Complex: `data/item/talent.mjs`, `data/item/weapon.mjs`
-   Simple: `data/item/condition.mjs`
-   Templates: `data/shared/modifiers-template.mjs`

### Actor Sheets

**Exemplar files**:

-   Player: `applications/actor/acolyte-sheet.mjs`
-   NPC: `applications/actor/npc-sheet-v2.mjs`
-   Base: `applications/actor/base-actor-sheet.mjs`

---

## Key Patterns

### Roll Methods (on Documents)

```javascript
await actor.rollCharacteristic('weaponSkill');
await actor.rollSkill('dodge');
await actor.rollSkill('commonLore', 'Imperium'); // Specialist
await actor.rollItem(itemId);
```

### Modifiers System

Items with modifiers (talents, traits, conditions) use `ModifiersTemplate`.
See: `data/shared/modifiers-template.mjs`

### Skills

Standard skills: single value. Specialist skills: array of entries.
See: `data/actor/templates/creature.mjs`

---

## SCSS & Templates

### Shared Components

-   Variables & base: `scss/item/_item-shared-base.scss`
-   Components: `scss/item/_item-shared-components.scss`
-   Unified system: `scss/abstracts/_unified-components.scss`

### Template Partials

Reusable partials in `templates/item/panel/`:

-   `item-header.hbs`, `description-panel.hbs`, `active-effects-panel.hbs`
-   `stat-bar.hbs`, `modifier-row.hbs`, `quality-tags.hbs`

### Class Naming

All classes use `.rt-{panel_abbreviation}` prefix. 
YOU MUST also prepend the panel abbreviation for uniqueness.
Pattern: `.rt-{panel_abbreviation}_{component}--{modifier}`

### Template Context Rule

**CRITICAL**: Use `{{system.xxx}}` NOT `{{actor.system.xxx}}` in templates.

```handlebars
{{! CORRECT }}
<input name='system.wounds.value' value='{{system.wounds.value}}' />

{{! WRONG }}
<input name='actor.system.wounds.value' value='{{actor.system.wounds.value}}' />
```

---

## Common Gotchas

1. **Templates**: Use `{{system.xxx}}` not `{{actor.system.xxx}}`
2. **Actions**: Use `data-action="name"` not jQuery event binding
3. **Field names**: Input `name` must match DataModel schema exactly
4. **Tab property**: Use `tab:` not `id:` in TABS array
5. **V2 classes**: Include `"sheet"` in classes array
6. **Integer fields**: V13 strict validation - use `migrateData()` to coerce
7. **ProseMirror**: Wrap editors with `{{#if inEditMode}}` for compendium safety
8. **Edit mode**: Never reimplement - inherit from BaseItemSheet
9. **Pack IDs**: Exactly 16 alphanumeric characters
10. **Tabs**: Never implement custom tab handlers - use PrimarySheetMixin

---

## Actor & Item Types

### Actors

| Type     | DataModel     | Sheet         | Notes              |
| -------- | ------------- | ------------- | ------------------ |
| acolyte  | CharacterData | AcolyteSheet  | Player characters  |
| npcV2    | NPCDataV2     | NPCSheetV2    | Current NPC system |
| vehicle  | VehicleData   | VehicleSheet  | Ground/air         |
| starship | StarshipData  | StarshipSheet | Void ships         |

### Items (36+ types)

See `data/item/` for all DataModels. Key categories:

-   Equipment: weapon, armour, ammunition, gear, cybernetic
-   Features: talent, trait, skill, originPath, specialAbility
-   Conditions: condition, criticalInjury, mutation
-   Powers: psychicPower, navigatorPower, ritual

### Compendium Packs

30 packs in `src/packs/`. Key: `rt-items-talents`, `rt-items-traits`, `rt-items-weapons`, `rt-actors-bestiary`

---

## Session Completion (CRITICAL)

**Work is NOT complete until `git push` succeeds.**

```bash
# 1. Review changes
git status

# 2. Commit and push (MANDATORY)
git pull --rebase && git push
git status  # MUST show "up to date with origin"
```

**Rules**:

-   NEVER stop before pushing
-   NEVER say "ready to push when you are" - YOU push
-   If push fails, resolve and retry until success
-   Document any remaining work in the repo before ending
