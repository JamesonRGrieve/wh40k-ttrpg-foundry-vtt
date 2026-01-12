# Origin Path Builder - Complete Overhaul Plan

**Date**: January 12, 2026  
**Status**: 🚧 PLANNING COMPLETE - Ready for Implementation

---

## CRITICAL PROBLEMS IDENTIFIED

### 1. **Legacy Data Structure** ❌
- Origin path items are stored as **trait** type with data in `flags.rt`
- Modern `OriginPathData` model exists but items don't use it
- Items have no `step`, `stepIndex`, or `grants` data
- All data is in plaintext `description` field

### 2. **Missing Localization** ❌
- All labels show as `RT.OriginPath.TotalBonuses` (unlocalized keys)
- No localization strings in `en.json` for origin path builder

### 3. **Broken Drag-and-Drop** ❌
- No drag handlers implemented
- No drop handlers implemented
- `dragSelector` and `dropSelector` defined but methods missing

### 4. **No Choice Support** ❌
- Many origin paths have choices (e.g., "Choose 1 of 3 skills")
- No UI for making choices
- No tracking of selected choices

### 5. **No Compendium Integration** ❌
- "Browse" button exists but `openCompendium` not implemented
- Can't select items from compendium

### 6. **Incomplete Context** ❌
- Preview doesn't calculate actual bonuses
- Uses legacy `isOriginPath` flag check instead of proper type
- Missing available options for each step

---

## OVERHAUL PLAN

### Phase 1: Data Migration ✅
**Migrate legacy trait-based origin paths to proper OriginPathData model**

1. Create migration script to convert 57 items
2. Parse plaintext descriptions to extract:
   - Skills, talents, traits grants
   - Characteristic modifiers
   - Special abilities
   - Equipment
   - Choices (where applicable)
3. Update item type from `trait` to `originPath`
4. Set proper `step` and `stepIndex` fields
5. Remove legacy `flags.rt` data

### Phase 2: Localization ✅
**Add all missing localization strings**

1. Add to `src/lang/en.json`:
   - Step labels (Home World, Birthright, etc.)
   - UI labels (Total Bonuses, Drag Here, etc.)
   - Action labels (Randomize, Reset, Export, etc.)
   - Status labels (Complete, Incomplete, etc.)

### Phase 3: Drag-and-Drop Implementation ✅
**Implement full drag-and-drop functionality**

1. Override `_onDragStart` - allow dragging filled slots
2. Override `_onDragOver` - highlight valid drop zones
3. Override `_onDrop` - handle item drops
4. Support both:
   - Item drops from compendium
   - Item drops from other slots (reordering)
5. Validate step compatibility

### Phase 4: Choice Dialog ✅
**Create choice selection dialog for origins with choices**

1. Create `OriginPathChoiceDialog` class
2. Show modal when origin with choices is dropped
3. Present available options
4. Track selections in item's `selectedChoices` field
5. Apply modifiers from `activeModifiers` field

### Phase 5: Compendium Browser ✅
**Add compendium browser integration**

1. Filter origin path compendium by step
2. Show only valid items for current slot
3. Drag from browser to slot
4. Search/filter functionality

### Phase 6: Bonuses Calculation ✅
**Calculate actual bonuses from selected origins**

1. Parse all selected origins
2. Aggregate characteristic modifiers
3. Aggregate skill grants
4. Aggregate talent/trait grants
5. List special abilities
6. Display in preview panel

### Phase 7: Apply to Character ✅
**Implement "Commit to Character" functionality**

1. Add all selected origin items to actor
2. Remove old origin items
3. Apply characteristic advances
4. Add skill training
5. Add talents and traits
6. Add equipment
7. Create journal entry with path summary

---

## IMPLEMENTATION TASKS

### Task 1: Create Migration Script
**File**: `scripts/migrate-origin-paths.mjs`

- Read all 57 origin path items from pack
- Parse description text to extract grants
- Create new items with OriginPathData
- Handle special cases (choices, equipment, etc.)

### Task 2: Add Localization
**File**: `src/lang/en.json`

```json
{
  "RT.OriginPath": {
    "BuilderTitle": "{name}'s Origin Path",
    "HomeWorld": "Home World",
    "Birthright": "Birthright", 
    "LureOfTheVoid": "Lure of the Void",
    "TrialsAndTravails": "Trials and Travails",
    "Motivation": "Motivation",
    "Career": "Career",
    
    "YourJourney": "Your Journey Through the Void",
    "DragHere": "Drag an origin here or click Browse",
    "Browse": "Browse",
    "Randomize": "Randomize Path",
    "RandomizeHint": "Fill empty slots with random choices",
    "Reset": "Reset All",
    "ResetHint": "Clear all selections",
    "Clear": "Remove",
    "ViewDetails": "View Details",
    
    "TotalBonuses": "Total Bonuses",
    "SpecialAbilities": "Special Abilities",
    "NoBonusesYet": "Select origin path steps to see bonuses",
    
    "PathComplete": "Path Complete",
    "PathIncomplete": "Path Incomplete ({{count}}/6 steps)",
    "UnsavedChanges": "Unsaved Changes",
    "CommitToCharacter": "Apply to Character",
    
    "Export": "Export Path",
    "ExportHint": "Save path configuration",
    "Import": "Import Path",
    "ImportHint": "Load path configuration"
  }
}
```

### Task 3: Rebuild OriginPathBuilder
**File**: `src/module/applications/character-creation/origin-path-builder.mjs`

**Complete Rewrite** (current: 734 lines, target: ~500 lines):

```javascript
import ConfirmationDialog from "../dialogs/confirmation-dialog.mjs";
import OriginPathChoiceDialog from "./origin-path-choice-dialog.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export default class OriginPathBuilder extends HandlebarsApplicationMixin(ApplicationV2) {
    
    static DEFAULT_OPTIONS = {
        id: "origin-path-builder-{id}",
        classes: ["rogue-trader", "origin-path-builder"],
        tag: "form",
        window: {
            title: "RT.OriginPath.BuilderTitle",
            icon: "fa-solid fa-route"
        },
        position: { width: 1000, height: 800 },
        actions: {
            clearSlot: OriginPathBuilder.#clearSlot,
            randomize: OriginPathBuilder.#randomize,
            reset: OriginPathBuilder.#reset,
            browseCompendium: OriginPathBuilder.#browseCompendium,
            viewItem: OriginPathBuilder.#viewItem,
            commitPath: OriginPathBuilder.#commitPath
        },
        dragDrop: [{ 
            dragSelector: ".origin-step-slot.filled",
            dropSelector: ".origin-step-slot"
        }]
    };
    
    static PARTS = {
        form: {
            template: "systems/rogue-trader/templates/character-creation/origin-path-builder.hbs",
            scrollable: [".path-canvas", ".preview-content"]
        }
    };
    
    static STEPS = [
        { key: "homeWorld", step: "homeWorld", icon: "fa-globe" },
        { key: "birthright", step: "birthright", icon: "fa-baby" },
        { key: "lureOfTheVoid", step: "lureOfTheVoid", icon: "fa-rocket" },
        { key: "trialsAndTravails", step: "trialsAndTravails", icon: "fa-skull" },
        { key: "motivation", step: "motivation", icon: "fa-heart" },
        { key: "career", step: "career", icon: "fa-briefcase" }
    ];
    
    constructor(actor, options = {}) {
        super(options);
        this.actor = actor;
        this.selections = new Map(); // stepKey -> Item
        this._initializeFromActor();
    }
    
    // Context preparation
    async _prepareContext(options) { ... }
    async _prepareSteps() { ... }
    async _getAvailableOrigins(stepKey) { ... }
    _calculateBonuses() { ... }
    
    // Drag-drop handlers
    _onDragStart(event) { ... }
    _onDrop(event) { ... }
    async _handleOriginDrop(stepKey, itemData) { ... }
    async _showChoiceDialog(item) { ... }
    
    // Action handlers
    static async #clearSlot(event, target) { ... }
    static async #randomize(event, target) { ... }
    static async #reset(event, target) { ... }
    static async #browseCompendium(event, target) { ... }
    static async #viewItem(event, target) { ... }
    static async #commitPath(event, target) { ... }
}
```

### Task 4: Create Choice Dialog
**File**: `src/module/applications/character-creation/origin-path-choice-dialog.mjs`

```javascript
export default class OriginPathChoiceDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        classes: ["rogue-trader", "origin-choice-dialog"],
        tag: "form",
        window: { title: "RT.OriginPath.MakeChoices" },
        position: { width: 600, height: 400 },
        actions: {
            selectOption: OriginPathChoiceDialog.#selectOption,
            confirm: OriginPathChoiceDialog.#confirm
        }
    };
    
    constructor(item, actor, options = {}) {
        super(options);
        this.item = item;
        this.actor = actor;
        this.choices = new Map();
    }
    
    async _prepareContext(options) {
        return {
            item: this.item,
            pendingChoices: this.item.system.pendingChoices,
            selectedChoices: this.choices
        };
    }
    
    static async show(item, actor) {
        const dialog = new OriginPathChoiceDialog(item, actor);
        await dialog.render(true);
        return dialog.waitForSubmit();
    }
}
```

### Task 5: Update Template
**File**: `src/templates/character-creation/origin-path-builder.hbs`

**Complete Redesign**:

- Remove hardcoded text, use localization
- Add step options selector (dropdown + drag zone)
- Add choice indicators
- Add pending choices badge
- Improve preview panel
- Add validation messages

### Task 6: Commit Logic
**Method**: `OriginPathBuilder.#commitPath`

```javascript
static async #commitPath(event, target) {
    const builder = this;
    const actor = builder.actor;
    const selections = Array.from(builder.selections.values());
    
    // Confirm action
    const confirmed = await ConfirmationDialog.prompt({
        title: "Apply Origin Path",
        content: "This will replace your current origin path. Continue?",
        yes: "Apply",
        no: "Cancel"
    });
    
    if (!confirmed) return;
    
    // Remove existing origin paths
    const existing = actor.items.filter(i => i.type === "originPath");
    await actor.deleteEmbeddedDocuments("Item", existing.map(i => i.id));
    
    // Add new origins
    const itemData = selections.map(item => item.toObject());
    await actor.createEmbeddedDocuments("Item", itemData);
    
    // Apply characteristic advances
    const charUpdates = {};
    for (const item of selections) {
        const mods = item.system.modifiers.characteristics;
        for (const [char, value] of Object.entries(mods)) {
            if (value !== 0) {
                const current = actor.system.characteristics[char].advance || 0;
                charUpdates[`system.characteristics.${char}.advance`] = current + value;
            }
        }
    }
    
    // Apply updates
    if (Object.keys(charUpdates).length) {
        await actor.update(charUpdates);
    }
    
    // Add skills, talents, traits (create items)
    const grantedItems = [];
    for (const item of selections) {
        // Skills
        for (const skill of item.system.grants.skills) {
            grantedItems.push({
                type: "skill",
                name: skill.name,
                // ... skill data
            });
        }
        
        // Talents
        for (const talent of item.system.grants.talents) {
            // Fetch from compendium if uuid provided
            if (talent.uuid) {
                const doc = await fromUuid(talent.uuid);
                if (doc) grantedItems.push(doc.toObject());
            }
        }
        
        // Similar for traits, equipment
    }
    
    if (grantedItems.length) {
        await actor.createEmbeddedDocuments("Item", grantedItems);
    }
    
    // Create journal entry
    const journal = {
        type: "journalEntry",
        name: `${actor.name}'s Origin Path`,
        system: {
            description: {
                value: builder._generateJournalHTML(selections)
            }
        }
    };
    await actor.createEmbeddedDocuments("Item", [journal]);
    
    ui.notifications.info("Origin path applied to character!");
    builder.close();
}
```

---

## FILE STRUCTURE

### New Files to Create:
1. `scripts/migrate-origin-paths.mjs` - Migration script
2. `src/module/applications/character-creation/origin-path-choice-dialog.mjs` - Choice dialog
3. `src/templates/character-creation/origin-path-choice-dialog.hbs` - Choice dialog template
4. `src/scss/components/_origin-path-choice-dialog.scss` - Choice dialog styles

### Files to Modify:
1. `src/module/applications/character-creation/origin-path-builder.mjs` - Complete rebuild
2. `src/templates/character-creation/origin-path-builder.hbs` - Redesign
3. `src/scss/components/_origin-path-builder.scss` - Already fixed
4. `src/lang/en.json` - Add localization
5. `src/packs/rt-items-origin-path/_source/*.json` - Migrate 57 items

### Files to Delete:
- None (origin path builder is relatively new, no legacy versions)

---

## MIGRATION STRATEGY

### Origin Path Pack Migration

**Approach**: Manual curation (semi-automated)

1. Parse each of the 57 items
2. Extract data from description using regex patterns:
   - "Skills: X, Y, Z" → `grants.skills`
   - "Talents: A, B, C" → `grants.talents`
   - "Characteristics: +5 WS, +10 BS" → `modifiers.characteristics`
   - "Special Ability: X" → `grants.specialAbilities`
   - "Choose one of:" → `grants.choices`
3. Create new JSON with OriginPathData structure
4. Verify each item manually
5. Rebuild compendium pack

**Example Transformation**:

```javascript
// OLD (trait with flags)
{
  "type": "trait",
  "flags": { "rt": { "step": "Career", "stepIndex": 6 } },
  "system": {
    "description": { "value": "Skills: Dodge, Intimidate..." }
  }
}

// NEW (originPath with structured data)
{
  "type": "originPath",
  "system": {
    "step": "career",
    "stepIndex": 5,
    "grants": {
      "skills": [
        { "name": "dodge", "level": "trained" },
        { "name": "intimidate", "level": "trained" }
      ],
      "talents": [
        { "name": "Basic Weapon Training", "specialization": "Universal" }
      ],
      "choices": [
        {
          "type": "equipment",
          "label": "Choose starting weapon",
          "options": ["Hellgun (Good)", "Longlas (Best)", "2x Boltpistol (Common)"],
          "count": 1
        }
      ]
    }
  }
}
```

---

## TESTING PLAN

### Unit Tests:
1. Drag-drop from compendium
2. Drag-drop between slots
3. Choice dialog flow
4. Bonuses calculation
5. Commit to character

### Integration Tests:
1. Full origin path creation (6 steps)
2. Path with choices
3. Path with requirements
4. Export/import path
5. Randomize path

### Edge Cases:
1. Origins with multiple choices
2. Origins with conditional grants
3. Invalid origin combinations
4. Existing path replacement

---

## TIMELINE ESTIMATE

- **Phase 1 (Migration)**: 2-3 hours
- **Phase 2 (Localization)**: 30 minutes
- **Phase 3 (Drag-Drop)**: 1 hour
- **Phase 4 (Choice Dialog)**: 1 hour
- **Phase 5 (Compendium)**: 1 hour
- **Phase 6 (Bonuses)**: 1 hour
- **Phase 7 (Commit)**: 1-2 hours

**Total**: 7-10 hours of focused work

---

## SUCCESS CRITERIA

✅ All 57 origin paths migrated to OriginPathData model
✅ All UI text localized
✅ Drag-drop works from compendium and between slots
✅ Choice dialogs appear for origins with choices
✅ Bonuses calculate correctly
✅ Commit applies all grants to character
✅ No legacy code remaining
✅ Full test coverage

---

## PRIORITY: Execute in One Session

This plan is designed for **complete execution in a single focused session**. All phases build on each other and must be completed together to avoid partial/broken states.

**Ready to proceed with implementation?**
