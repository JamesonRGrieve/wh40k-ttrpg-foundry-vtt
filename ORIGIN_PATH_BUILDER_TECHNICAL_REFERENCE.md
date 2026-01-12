# Origin Path Builder - Technical Reference

## Architecture Overview

The Origin Path Builder follows Foundry V13 ApplicationV2 patterns with complete drag-drop support, choice dialogs, and bonus calculation.

### Key Components

1. **OriginPathBuilder** - Main builder application (ApplicationV2)
2. **OriginPathChoiceDialog** - Modal for selecting choices (ApplicationV2)
3. **OriginPathData** - DataModel for origin path items
4. **Migration Script** - One-time data conversion utility

---

## Data Model: OriginPathData

**Location**: `src/module/data/item/origin-path.mjs`

### Schema Fields

```javascript
{
  identifier: IdentifierField,           // Slugified identifier
  step: StringField,                     // homeWorld|birthright|lureOfTheVoid|trialsAndTravails|motivation|career
  stepIndex: NumberField,                // 0-5 for ordering
  description: HTMLField,                // Item description
  requirements: {
    text: StringField,                   // Human-readable requirements
    previousSteps: ArrayField,           // Required previous step keys
    excludedSteps: ArrayField            // Incompatible step keys
  },
  modifiers: ModifiersTemplate,          // Characteristic/skill/combat modifiers
  grants: {
    wounds: NumberField,                 // Wound modifier
    fateThreshold: NumberField,          // Fate point threshold modifier
    blessedByEmperor: BooleanField,      // Special fate mechanic
    skills: [{                           // Skills granted
      name: StringField,
      specialization: StringField,
      level: "trained"|"plus10"|"plus20"
    }],
    talents: [{                          // Talents granted
      name: StringField,
      specialization: StringField,
      uuid: StringField                  // Optional compendium UUID
    }],
    traits: [{                           // Traits granted
      name: StringField,
      level: NumberField,
      uuid: StringField
    }],
    aptitudes: [StringField],            // Aptitudes granted
    equipment: [{                        // Equipment granted
      name: StringField,
      quantity: NumberField,
      uuid: StringField
    }],
    specialAbilities: [{                 // Special abilities
      name: StringField,
      description: HTMLField
    }],
    choices: [{                          // Player choices required
      type: "skill"|"talent"|"characteristic"|"equipment",
      label: StringField,                // Description of choice
      options: [StringField],            // Available options
      count: NumberField                 // Number of selections allowed
    }]
  },
  effectText: HTMLField,                 // Legacy effect text
  notes: StringField,                    // GM notes
  selectedChoices: ObjectField,          // Player's selections (runtime)
  activeModifiers: ArrayField            // Modifiers from choices (runtime)
}
```

### Computed Properties

```javascript
// From OriginPathData
item.system.stepLabel              // Localized step name
item.system.hasRequirements        // Boolean
item.system.hasChoices             // Boolean
item.system.pendingChoices         // Array of incomplete choices
item.system.choicesComplete        // Boolean
item.system.derivedModifiers       // Modifiers from selected choices
item.system.grantsSummary          // Array of formatted grant strings

// From RogueTraderItem
item.isOriginPath                  // Boolean (type check)
item.originPathStep                // Step key (legacy compatible)
```

---

## OriginPathBuilder Class

**Location**: `src/module/applications/character-creation/origin-path-builder.mjs`

### Constructor

```javascript
const builder = new OriginPathBuilder(actor, options);
```

**Parameters:**
- `actor` (Actor) - The character actor
- `options` (Object) - Additional ApplicationV2 options

### Static Properties

```javascript
OriginPathBuilder.DEFAULT_OPTIONS  // ApplicationV2 options
OriginPathBuilder.PARTS             // Template parts config
OriginPathBuilder.STEPS             // Step configuration array
```

### Instance Properties

```javascript
builder.actor                       // Actor reference
builder.selections                  // Map<stepKey, Item>
builder.originPack                  // CompendiumCollection reference
```

### Public Methods

```javascript
// Factory methods
OriginPathBuilder.show(actor)       // Open or focus builder
OriginPathBuilder.close(actor)      // Close builder for actor
OriginPathBuilder.toggle(actor)     // Toggle builder open/closed

// Instance methods (inherited from ApplicationV2)
await builder.render(force, options)
builder.close(options)
builder.bringToFront()
```

### Private Methods

```javascript
// Initialization
_initializeFromActor()              // Load existing origins from actor

// Context preparation
_prepareContext(options)            // Prepare template data
_prepareSteps()                     // Prepare step array
_prepareItemData(item)              // Format item for template
_extractItemBonuses(item)           // Extract bonuses for display
_calculateBonuses()                 // Aggregate all bonuses
_hasChanges()                       // Check for unsaved changes

// Drag-drop handlers
_onDragStart(event)                 // Enable dragging filled slots
_onDrop(event)                      // Handle dropped items
_handleItemWithChoices(item, step)  // Show choice dialog
_setSelection(stepKey, item)        // Set slot selection

// Action handlers (static)
#clearSlot(event, target)           // Remove origin from slot
#randomize(event, target)           // Fill with random origins
#reset(event, target)               // Clear all selections
#export(event, target)              // Export path config
#import(event, target)              // Import path config
#openCompendium(event, target)      // Open compendium browser
#viewItem(event, target)            // View item sheet
#commitPath(event, target)          // Apply path to character
#onFormSubmit(event, form, data)    // Form submission (no-op)
```

---

## OriginPathChoiceDialog Class

**Location**: `src/module/applications/character-creation/origin-path-choice-dialog.mjs`

### Usage

```javascript
// Show dialog and await result
const selectedChoices = await OriginPathChoiceDialog.show(item, actor);

if (selectedChoices) {
  // User confirmed selections
  // selectedChoices = { "choiceLabel": ["option1", "option2"], ... }
} else {
  // User cancelled
}
```

### Constructor

```javascript
const dialog = new OriginPathChoiceDialog(item, actor, options);
```

### Instance Properties

```javascript
dialog.item                         // Origin path item with choices
dialog.actor                        // Actor reference
dialog.pendingChoices               // Array of choice configs
dialog.selections                   // Map<choiceLabel, Set<options>>
```

### Static Factory

```javascript
OriginPathChoiceDialog.show(item, actor)  // Returns Promise<Object|null>
```

### Private Methods

```javascript
_prepareContext(options)            // Prepare choice data
#toggleOption(event, target)        // Toggle option selection
#confirm(event, target)             // Confirm and close
#cancel(event, target)              // Cancel and close
#onSubmit(event, form, data)        // Form submission handler
```

---

## Migration Script

**Location**: `scripts/migrate-origin-paths.mjs`

### Purpose

One-time conversion of 57 origin path items from legacy `trait` type with `flags.rt` to modern `originPath` type with structured `OriginPathData`.

### Running

```bash
cd /path/to/RogueTraderVTT
node scripts/migrate-origin-paths.mjs
```

### Functions

```javascript
parseDescriptionForGrants(description)  // Extract structured data from text
convertItem(item)                       // Convert single item
migrateOriginPaths()                    // Main migration flow
```

### Migration Logic

1. Read all JSON files from `src/packs/rt-items-origin-path/_source/`
2. Skip items already migrated (type === 'originPath')
3. Skip non-origin items (type !== 'trait' || !flags.rt.kind === 'origin')
4. Parse description text using regex patterns:
   - Skills: `/(?:Gain|Skills?:)\s*([^.]+?)(?:Skill|Talent|\.|$)/gi`
   - Talents: `/(?:Talent|Talents?:)\s*([^.]+?)(?:Skill|Trait|\.|$)/gi`
   - Traits: `/(?:Trait|Traits?:)\s*([^.]+?)(?:Skill|Talent|\.|$)/gi`
   - Choices: `/(?:Choose|Select)\s+(?:one|1|any)/gi`
   - Wounds: `/([+-]\d+)\s*Wounds?/i`
   - Fate: `/Fate(?:\s*Threshold)?:?\s*([+-]?\d+)/i`
5. Create new item structure with OriginPathData schema
6. Write back to same file
7. Report success/errors

---

## Template Structure

### Main Builder Template

**Location**: `src/templates/character-creation/origin-path-builder.hbs`

**Structure:**
```handlebars
<div class="origin-path-builder-content">
  {{!-- Toolbar --}}
  <div class="builder-toolbar">...</div>
  
  {{!-- Path Canvas (Flowchart) --}}
  <div class="path-canvas">
    {{!-- Row 1: Steps 0-2 --}}
    <div class="path-row">
      {{#each (slice steps 0 3)}}
        <div class="origin-step" data-step="{{step}}">
          {{#if isEmpty}}
            <div class="origin-step-slot empty">...</div>
          {{else}}
            <div class="origin-step-slot filled" draggable="true">...</div>
          {{/if}}
        </div>
      {{/each}}
    </div>
    
    {{!-- Row 2: Steps 3-5 (reversed) --}}
    <div class="path-row path-row-reverse">...</div>
  </div>
  
  {{!-- Preview Panel --}}
  <div class="preview-panel">...</div>
  
  {{!-- Footer --}}
  <div class="builder-footer">...</div>
</div>
```

### Choice Dialog Template

**Location**: `src/templates/character-creation/origin-path-choice-dialog.hbs`

**Structure:**
```handlebars
<div class="origin-choice-dialog-content">
  {{!-- Item Header --}}
  <div class="choice-header">...</div>
  
  {{!-- Choices List --}}
  <div class="choices-list">
    {{#each choices}}
      <div class="choice-group">
        <div class="choice-label">...</div>
        <div class="choice-options">
          {{#each options}}
            <button class="choice-option" data-action="toggleOption">...</button>
          {{/each}}
        </div>
      </div>
    {{/each}}
  </div>
  
  {{!-- Footer Actions --}}
  <div class="choice-footer">...</div>
</div>
```

---

## SCSS Architecture

### Builder Styles

**Location**: `src/scss/components/_origin-path-builder.scss`

**Key Classes:**
- `.origin-path-builder` - Main window
- `.origin-path-builder-content` - Content container
- `.builder-toolbar` - Top action bar
- `.path-canvas` - Flowchart area
- `.path-row` - Horizontal step row
- `.path-row-reverse` - Reversed row (right-to-left)
- `.origin-step` - Single step container
- `.origin-step-slot` - Droppable slot
- `.origin-step-slot.empty` - Empty state
- `.origin-step-slot.filled` - Filled with item
- `.preview-panel` - Bonuses preview
- `.builder-footer` - Bottom actions

### Choice Dialog Styles

**Location**: `src/scss/components/_origin-path-choice-dialog.scss`

**Key Classes:**
- `.origin-choice-dialog` - Dialog window
- `.choice-header` - Item preview header
- `.choices-list` - Scrollable choices
- `.choice-group` - Single choice section
- `.choice-option` - Selectable option button
- `.choice-option.selected` - Selected state
- `.choice-option.disabled` - Disabled state

---

## Integration Points

### Actor Sheet Integration

The builder is typically opened from the actor sheet:

```javascript
// In actor sheet action handler
static async #openOriginPathBuilder(event, target) {
  OriginPathBuilder.show(this.actor);
}
```

### Item Document Integration

The `RogueTraderItem` document provides helper properties:

```javascript
// Check if item is origin path (legacy compatible)
if (item.isOriginPath) {
  const step = item.originPathStep;
}
```

### Handlebars Helpers

Used in templates:
- `localize` - Localization
- `capitalize` - Capitalize first letter
- `slice` - Array slicing
- `gt` - Greater than comparison
- Standard conditionals: `if`, `unless`, `each`

---

## Localization Keys

All strings use `RT.OriginPath.*` namespace:

```
RT.OriginPath.BuilderTitle
RT.OriginPath.HomeWorld
RT.OriginPath.Birthright
RT.OriginPath.LureOfTheVoid
RT.OriginPath.TrialsAndTravails
RT.OriginPath.Motivation
RT.OriginPath.Career
RT.OriginPath.YourJourney
RT.OriginPath.DragHere
RT.OriginPath.Browse
RT.OriginPath.Randomize
RT.OriginPath.RandomizeHint
RT.OriginPath.Reset
RT.OriginPath.ResetHint
RT.OriginPath.Clear
RT.OriginPath.ViewDetails
RT.OriginPath.TotalBonuses
RT.OriginPath.SpecialAbilities
RT.OriginPath.NoBonusesYet
RT.OriginPath.PathComplete
RT.OriginPath.PathIncomplete
RT.OriginPath.UnsavedChanges
RT.OriginPath.CommitToCharacter
RT.OriginPath.Export
RT.OriginPath.ExportHint
RT.OriginPath.Import
RT.OriginPath.ImportHint
RT.OriginPath.MakeChoices
RT.OriginPath.ChoicesRequired
RT.OriginPath.ChoicesRemaining
RT.OriginPath.SelectOption
RT.OriginPath.ConfirmChoices
RT.OriginPath.InvalidStep
RT.OriginPath.ConfirmReset
RT.OriginPath.ConfirmCommit
RT.OriginPath.CommitSuccess
```

---

## Commit Flow Details

When `#commitPath` is called:

1. **Validation**: Check all 6 steps filled
2. **Confirmation**: Show ConfirmationDialog
3. **Remove Old**: Delete existing originPath items from actor
4. **Add New**: Create new originPath items from selections
5. **Apply Characteristics**: Add bonuses to `system.characteristics.*.base`
6. **Apply Skills**: Create or upgrade skill items
7. **Apply Talents**: Fetch from compendium or create basic items
8. **Apply Traits**: Fetch from compendium or create basic items
9. **Apply Equipment**: Fetch from compendium and set quantity
10. **Notify**: Show success message
11. **Close**: Close builder window

### Characteristic Application

```javascript
// Add to base, not advance, to preserve purchased advances
const charUpdates = {};
charUpdates[`system.characteristics.strength.base`] = 
  actor.system.characteristics.strength.base + 5;
await actor.update(charUpdates);
```

### Skill Application

```javascript
// Check if skill exists
const existingSkill = actor.items.find(i => 
  i.type === "skill" && 
  i.name.toLowerCase() === "dodge"
);

if (existingSkill) {
  // Upgrade existing
  await existingSkill.update({
    "system.trained": true,
    "system.plus10": true
  });
} else {
  // Create new
  await actor.createEmbeddedDocuments("Item", [{
    type: "skill",
    name: "Dodge",
    system: { trained: true }
  }]);
}
```

---

## Testing Checklist

### Unit Tests
- [ ] OriginPathData schema validates correctly
- [ ] Bonuses calculate correctly from multiple origins
- [ ] Choice dialog validates all selections
- [ ] Drag-drop data transfer works
- [ ] Export/import preserves configuration

### Integration Tests
- [ ] Builder opens from actor sheet
- [ ] Items drag from compendium to slots
- [ ] Choice dialog appears when needed
- [ ] Preview panel updates on selection change
- [ ] Commit applies all bonuses to character
- [ ] Randomize fills all slots with valid items
- [ ] Reset clears all selections

### Edge Cases
- [ ] Invalid item type dragged to slot
- [ ] Wrong step dragged to mismatched slot
- [ ] Partial choice selections (incomplete)
- [ ] Character already has some origin items
- [ ] Character already has some skills/talents
- [ ] Compendium not available
- [ ] Item with malformed grants data

---

## Performance Considerations

### Optimization Strategies

1. **No Sheet-Level Caching**: Selections stored in Map, computed fresh on render
2. **Lazy Compendium Loading**: Pack loaded on first use, cached in instance
3. **Efficient Drag-Drop**: Data transfer uses UUID strings, not full documents
4. **Selective Re-render**: Only affected parts re-render on changes
5. **Batched Updates**: All character updates in single `actor.update()` call

### Known Bottlenecks

1. **Compendium Loading**: First access loads all 57 items (~200ms)
2. **Item Fetching**: `fromUuid()` calls can be slow for remote packs
3. **Bonus Calculation**: Iterates all selections (minimal with 6 items)

---

## Future Enhancements

### Planned Features

1. **Custom Compendium Browser**: Step-filtered item browser
2. **Smart Choice Application**: Auto-apply modifier from selected choices
3. **Requirements Validation**: Check prerequisites and exclusions
4. **Aptitude System**: Apply aptitudes to character
5. **Journal Generation**: Create formatted journey summary
6. **Path Templates**: Save/load preset paths
7. **Path Sharing**: Export/import between players
8. **Undo/Redo**: Revert changes before commit

### API Extensions

```javascript
// Potential future methods
builder.validateRequirements()      // Check prerequisites
builder.generateJournalEntry()      // Create journey narrative
builder.applyAptitudes()            // Apply aptitude bonuses
builder.saveAsTemplate(name)        // Save as reusable template
builder.loadTemplate(name)          // Load template
```

---

## Debugging Tips

### Common Issues

**Builder won't open:**
```javascript
// Check actor type
if (actor.type !== "acolyte" && actor.type !== "character") {
  console.error("Wrong actor type:", actor.type);
}
```

**Items won't drag:**
```javascript
// Verify item type
console.log("Item type:", item.type);
console.log("Is origin:", item.isOriginPath);
console.log("Step:", item.system.step);
```

**Bonuses not applying:**
```javascript
// Check grants structure
console.log("Grants:", item.system.grants);
console.log("Modifiers:", item.system.modifiers);
```

**Choice dialog not appearing:**
```javascript
// Check choices array
console.log("Has choices:", item.system.hasChoices);
console.log("Pending:", item.system.pendingChoices);
```

### Debug Mode

Enable debug logging:
```javascript
CONFIG.debug.applications = true;
```

View builder state:
```javascript
// In browser console
const builder = Object.values(ui.windows).find(w => w instanceof OriginPathBuilder);
console.log("Selections:", builder.selections);
console.log("Context:", await builder._prepareContext({}));
```

---

## Code Style & Patterns

### ApplicationV2 Patterns

- Static `DEFAULT_OPTIONS` for configuration
- Static action handlers with `#` private methods
- Context preparation in `_prepareContext`
- Template parts in `PARTS` config
- Drag-drop in `dragDrop` array

### Naming Conventions

- Public methods: camelCase
- Private methods: _camelCase prefix
- Static private methods: #camelCase with # prefix
- Constants: UPPER_SNAKE_CASE
- Template data: lowercase

### Error Handling

```javascript
// Validate inputs
if (!actor) {
  ui.notifications.error("No actor provided");
  return;
}

// Try-catch for async operations
try {
  const item = await fromUuid(uuid);
} catch (err) {
  console.error("Failed to load item:", err);
  ui.notifications.warn("Item not found");
}
```

---

**End of Technical Reference**
