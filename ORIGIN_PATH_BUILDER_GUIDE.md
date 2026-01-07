# Origin Path Visual Builder - User Guide

**Version**: 1.0  
**Feature Status**: ✅ Complete (Showcase #10)  
**Tier**: 2.4 - Advanced Interactive Features

---

## 🌟 Overview

The **Origin Path Visual Builder** is an interactive flowchart interface for Rogue Trader character creation. It provides a visual, drag-and-drop experience for building your character's lifepath through six critical steps, from humble origins to their ultimate career aboard a Rogue Trader's vessel.

### Key Features

✨ **Visual Flowchart** - See your character's journey at a glance  
🎯 **Drag & Drop** - Drag origin path items from compendium to slots  
📊 **Real-Time Preview** - See cumulative bonuses as you build  
🎲 **Randomize** - Generate random character backgrounds instantly  
💾 **Import/Export** - Save and share character builds as JSON  
🔒 **Validation** - Only compatible items can be placed in each slot  
🎨 **Gothic 40K Theme** - Immersive Warhammer 40K aesthetic

---

## 📖 The Six Steps

### 1. Home World
Your character's planet of origin determines baseline characteristics and background.

**Examples**: Death World, Void Born, Forge World, Hive World, Imperial World, Noble Born

### 2. Birthright
Early life circumstances that shaped your formative years.

**Examples**: Scavenger, Scapegrace, Stubjack, Child of the Creed, Savant, Vaunted

### 3. Lure of the Void
What drew you away from your home and into the stars.

**Examples**: Tainted, Criminal, Renegade, Duty Bound, Zealot, Chosen by Destiny

### 4. Trials and Travails
A major life event that tested your resolve.

**Examples**: Press-ganged, Calamity, Ship-Lorn, Dark Voyage, High Vendetta

### 5. Motivation
The core driving force behind your actions.

**Examples**: Endurance, Fortune, Vengeance, Renown, Pride, Prestige

### 6. Career
Your role and specialty aboard the Rogue Trader's ship.

**Examples**: Rogue Trader, Seneschal, Arch-Militant, Void-Master, Explorator, Missionary, Navigator, Astropath

---

## 🚀 How to Use

### Opening the Builder

**From Character Sheet**:
```javascript
// Add a button to your sheet that calls:
OriginPathBuilder.show(this.actor);
```

**From Console**:
```javascript
const actor = game.actors.getName("My Character");
OriginPathBuilder.show(actor);
```

**Toggle (open/close)**:
```javascript
OriginPathBuilder.toggle(actor);
```

### Building Your Path

#### Method 1: Drag from Compendium

1. **Open the origin path compendium**: `rogue-trader.rt-items-origin-path`
2. **Drag an item** to the appropriate step slot
3. The builder **validates** that the item matches the step type
4. **Invalid drops** show a warning message

#### Method 2: Browse Button

1. Click the **"Browse"** button on an empty slot
2. The compendium opens filtered to that step
3. Drag the item from the compendium to the slot

#### Method 3: Randomize

1. Click the **"Randomize"** button in the toolbar
2. Confirm the action
3. The builder randomly selects one item for each step
4. Review and modify as needed

### Managing Selections

**View Item Details**: Click the eye icon (👁️) on a filled slot  
**Clear a Slot**: Click the × icon on a filled slot  
**Reset All**: Click "Reset" in toolbar (requires confirmation)  
**Drag to Reorder**: Drag items between slots (must be compatible)

### Preview Panel

The preview panel shows **cumulative bonuses** from all selected items:

- **Characteristics**: +/- to WS, BS, S, T, Ag, Int, Per, WP, Fel
- **Skills**: Bonuses to specific skills
- **Special Abilities**: Text descriptions of granted abilities

**Color Coding**:
- 🟢 **Green**: Positive bonuses
- 🔴 **Red**: Negative bonuses/penalties

### Committing Changes

1. Review your selections in the flowchart
2. Check the preview panel for total bonuses
3. Click **"Commit to Character"** in the footer
4. Confirm the action
5. The builder:
   - Removes existing origin path items from actor
   - Adds new selections to actor
   - Closes automatically

**Status Indicators**:
- ✅ **Complete**: All 6 steps filled
- ⚠️ **Incomplete**: Some steps empty
- ✏️ **Unsaved Changes**: Different from actor's current items

---

## 🔧 Advanced Features

### Import/Export

**Export**:
1. Click the download icon in the toolbar
2. A JSON file is saved: `{character-name}-origin-path.json`
3. Contains item UUIDs and names

**Import**:
1. Click the upload icon in the toolbar
2. Select a previously exported JSON file
3. Items are loaded by UUID (must exist in compendiums)

**Use Cases**:
- Share character builds with friends
- Backup character creation choices
- Template characters for quick creation

### Validation Rules

The builder enforces these rules:

1. **Step Matching**: Items can only be dropped in their designated step
2. **Item Type**: Only origin path items are accepted
3. **Unique Slots**: Each slot holds exactly one item

**Error Messages**:
- "This item is not an origin path item"
- "Expected {step}, but item is for {actual step}"

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Escape` | Close builder |
| `Ctrl+S` | Commit changes (if any) |

---

## 🎨 Visual Design

### Flowchart Layout

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Home World  │ ──→ │  Birthright  │ ──→ │ Lure of Void │
└──────────────┘     └──────────────┘     └──────────────┘
                              ↓
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    Career    │ ←── │  Motivation  │ ←── │    Trials    │
└──────────────┘     └──────────────┘     └──────────────┘
```

### Item Card Elements

**Empty Slot**:
- Dashed border
- "+" icon
- "Drag Here" text
- Browse button

**Filled Slot**:
- Solid gold border
- Item image (48x48)
- Item name in gold text
- Bonus badges (characteristics, skills, abilities)
- Action buttons (view, clear)

### Color Scheme

| Element | Color | Usage |
|---------|-------|-------|
| **Gold** | `#d4af37` | Headers, borders, highlights |
| **Bronze** | `#cd7f32` | Secondary borders, buttons |
| **Bone** | `#e8dcc8` | Text |
| **Iron** | `#3e3e3e` | Backgrounds |
| **Black** | `#0a0a0a` | Deep backgrounds |

---

## 💻 Developer Reference

### Class Structure

```javascript
class OriginPathBuilder extends ApplicationV2 {
    constructor(actor, options)
    
    // Properties
    actor: Actor              // Character being built
    selections: Object        // {stepKey: itemId}
    itemCache: Object         // {stepKey: Item}
    
    // Methods
    static show(actor)        // Open builder
    static close(actor)       // Close builder
    static toggle(actor)      // Toggle builder
}
```

### Static Configuration

```javascript
OriginPathBuilder.STEPS = [
    { key: "homeWorld", label: "RT.OriginPath.HomeWorld", step: "Home World", icon: "fa-globe" },
    { key: "birthright", label: "RT.OriginPath.Birthright", step: "Birthright", icon: "fa-baby" },
    { key: "lureOfTheVoid", label: "RT.OriginPath.LureOfTheVoid", step: "Lure of the Void", icon: "fa-rocket" },
    { key: "trialsAndTravails", label: "RT.OriginPath.TrialsAndTravails", step: "Trials and Travails", icon: "fa-skull" },
    { key: "motivation", label: "RT.OriginPath.Motivation", step: "Motivation", icon: "fa-heart" },
    { key: "career", label: "RT.OriginPath.Career", step: "Career", icon: "fa-briefcase" }
];
```

### Action Handlers

| Action | Method | Description |
|--------|--------|-------------|
| `clearSlot` | `#clearSlot` | Remove item from slot |
| `randomize` | `#randomize` | Randomize all slots |
| `reset` | `#reset` | Clear all slots |
| `export` | `#export` | Export as JSON |
| `import` | `#import` | Import from JSON |
| `openCompendium` | `#openCompendium` | Open filtered compendium |
| `viewItem` | `#viewItem` | Show item sheet |
| `commitPath` | `#commitPath` | Save to actor |

### Context Data

```javascript
{
    steps: [
        {
            key: "homeWorld",
            label: "Home World",
            step: "Home World",
            icon: "fa-globe",
            item: {...} || null,
            isEmpty: boolean
        },
        // ... 5 more steps
    ],
    preview: {
        characteristics: { weaponSkill: 5, strength: 10, ... },
        skills: { dodge: 10, ... },
        abilities: [{ source: "Item Name", text: "Description" }]
    },
    isComplete: boolean,
    hasChanges: boolean
}
```

---

## 🐛 Troubleshooting

### Common Issues

**"Compendium not found" error**
- Ensure the `rogue-trader.rt-items-origin-path` compendium exists
- Check compendium is properly packed in the system

**Items don't show bonuses**
- Verify items have `system.modifiers.characteristics` or `system.modifiers.skills`
- Check item structure matches expected schema

**Drag-drop not working**
- Ensure items have `isOriginPath` flag set
- Check `item.originPathStep` matches step label exactly

**Preview shows wrong bonuses**
- Clear cache and re-render
- Verify item modifiers are numbers, not strings

### Debug Commands

```javascript
// Check builder state
const builder = Object.values(ui.windows).find(w => w instanceof OriginPathBuilder);
console.log(builder.selections);
console.log(builder.itemCache);

// Manually set selection
builder.selections.homeWorld = "itemId";
builder.render();

// Force re-fetch item
delete builder.itemCache.homeWorld;
builder.render();
```

---

## 📝 Localization Keys

Add these to your `lang/en.json`:

```json
{
    "RT.OriginPath.BuilderTitle": "Origin Path Builder - {name}",
    "RT.OriginPath.YourJourney": "Your Journey Through the Imperium",
    "RT.OriginPath.Randomize": "Randomize",
    "RT.OriginPath.RandomizeHint": "Generate random origin path",
    "RT.OriginPath.Reset": "Reset",
    "RT.OriginPath.ResetHint": "Clear all selections",
    "RT.OriginPath.ExportHint": "Export to JSON",
    "RT.OriginPath.ImportHint": "Import from JSON",
    "RT.OriginPath.DragHere": "Drag origin path item here",
    "RT.OriginPath.Browse": "Browse",
    "RT.OriginPath.ViewDetails": "View Details",
    "RT.OriginPath.Clear": "Clear",
    "RT.OriginPath.TotalBonuses": "Total Bonuses",
    "RT.OriginPath.SpecialAbilities": "Special Abilities",
    "RT.OriginPath.NoBonusesYet": "No bonuses yet - start building your path!",
    "RT.OriginPath.PathComplete": "Path Complete",
    "RT.OriginPath.PathIncomplete": "Path Incomplete",
    "RT.OriginPath.UnsavedChanges": "Unsaved Changes",
    "RT.OriginPath.CommitToCharacter": "Commit to Character",
    "RT.OriginPath.InvalidItem": "This item is not an origin path item",
    "RT.OriginPath.WrongStep": "{item} cannot be placed in {expected} (it's for {actual})",
    "RT.OriginPath.RandomizeTitle": "Randomize Origin Path",
    "RT.OriginPath.RandomizeConfirm": "This will replace all current selections with random choices. Continue?",
    "RT.OriginPath.Randomized": "Origin path randomized!",
    "RT.OriginPath.ResetTitle": "Reset Origin Path",
    "RT.OriginPath.ResetConfirm": "This will clear all selections. Continue?",
    "RT.OriginPath.Reset": "Origin path reset",
    "RT.OriginPath.Exported": "Origin path exported",
    "RT.OriginPath.Imported": "Origin path imported",
    "RT.OriginPath.ImportFailed": "Failed to import origin path",
    "RT.OriginPath.CompendiumNotFound": "Compendium {pack} not found",
    "RT.OriginPath.NoSelections": "No items selected",
    "RT.OriginPath.CommitTitle": "Commit Origin Path",
    "RT.OriginPath.CommitConfirm": "This will replace your character's current origin path items. Continue?",
    "RT.OriginPath.Committed": "Committed {count} origin path items to character",
    "RT.OriginPath.HomeWorld": "Home World",
    "RT.OriginPath.Birthright": "Birthright",
    "RT.OriginPath.LureOfTheVoid": "Lure of the Void",
    "RT.OriginPath.TrialsAndTravails": "Trials and Travails",
    "RT.OriginPath.Motivation": "Motivation",
    "RT.OriginPath.Career": "Career"
}
```

---

## 🎯 Best Practices

### For Users

1. **Start from the top**: Fill Home World first, then work through the steps
2. **Read item descriptions**: Hover/click to see full details before committing
3. **Experiment**: Use Export to save builds, then try different combinations
4. **Review preview**: Check total bonuses match your character concept

### For GMs

1. **Pre-gen characters**: Create templates and export for quick NPC creation
2. **Restrict access**: Only show to players during character creation
3. **Validate builds**: Review final selections before committing
4. **Backup**: Export important character builds before major changes

### For Developers

1. **Extend validation**: Add custom rules in `_onDrop()` method
2. **Add hooks**: Fire hooks on commit for other modules to react
3. **Custom previews**: Override `_calculatePreview()` for house rules
4. **Theming**: Modify SCSS variables for custom appearance

---

## 🚀 Future Enhancements

Potential improvements for future versions:

- **Tooltips**: Hover over bonuses for detailed descriptions
- **Undo/Redo**: Track history of changes
- **Templates**: Save common builds as templates
- **Validation Messages**: More detailed feedback on incompatible choices
- **Mobile Optimization**: Better touch support for tablets
- **Sound Effects**: Audio feedback for actions
- **Animation**: Smoother transitions between states
- **Multi-Path Support**: Handle alternative path systems

---

## 📊 Statistics

**Code Metrics**:
- JavaScript: 732 lines
- Template: 254 lines
- SCSS: 606 lines
- **Total**: 1,592 lines

**Features**:
- 6 origin path steps
- 8 action buttons
- 3 panels (canvas, preview, footer)
- Real-time validation
- Drag & drop support
- Import/export functionality

---

## 🙏 Acknowledgments

Built with:
- **Foundry V13 ApplicationV2** - Modern application framework
- **Handlebars** - Templating engine
- **SCSS** - Styling
- **Font Awesome 6** - Icons

Inspired by:
- Classic CRPG character creation screens
- **Baldur's Gate** / **Pathfinder** builders
- Modern UI/UX patterns

---

## 📄 License

Part of the Rogue Trader VTT system.  
See LICENSE.txt for full details.

---

**For the Emperor and the Warrant of Trade! ⚔️**

*Created: 2026-01-07*  
*Version: 1.0*  
*Status: Production Ready*
