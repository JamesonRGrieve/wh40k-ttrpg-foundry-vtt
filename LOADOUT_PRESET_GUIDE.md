# Equipment Loadout Preset System - Implementation Guide

**Status**: ✅ Complete  
**Date**: 2026-01-08  
**Priority**: Item 23 (Long-term Strategic)

---

## Overview

The Equipment Loadout Preset System allows players to save and quickly switch between different equipment configurations. This is particularly useful for Rogue Trader characters who need different gear setups for combat, social encounters, exploration, and stealth missions.

---

## Features

### Core Functionality

1. **Save Current Loadout as Preset**
   - Captures equipped status of all equipment items
   - Captures activated status (force fields, etc.)
   - Prompts for custom preset name
   - Prevents duplicate names with overwrite confirmation

2. **Load Preset**
   - One-click restoration of saved equipment configuration
   - Unequips all current items first
   - Equips items from preset
   - Activates items from preset
   - Handles missing items gracefully

3. **Manage Presets**
   - Rename presets with new names
   - Delete presets with confirmation
   - Export presets to JSON file
   - Import presets from JSON file

4. **Visual Preset Cards**
   - Gold icon with preset name
   - Timestamp display
   - Item counts (equipped/activated)
   - Thumbnail grid of equipped items
   - Action buttons (Load, Rename, Export, Delete)

---

## User Interface

### Access

The preset system is accessed via the **"Loadout Presets"** button in the Equipment tab's bulk operations bar.

```
Equipment Tab → Bulk Operations → [Loadout Presets] button
```

### Dialog Layout

```
┌──────────────────────────────────────────────────┐
│  Equipment Loadout Presets               [x]     │
├──────────────────────────────────────────────────┤
│  ┌────────────┐  ┌────────────┐  ┌────────────┐ │
│  │ Combat     │  │ Social     │  │ Exploration│ │
│  │ 🛡️ 6 Eq    │  │ 🛡️ 2 Eq    │  │ 🛡️ 4 Eq    │ │
│  │ ⚡ 1 Active │  │ ⚡ 0 Active │  │ ⚡ 1 Active │ │
│  │ [Items...]  │  │ [Items...]  │  │ [Items...]  │ │
│  │ [Load][✏️][📤][🗑️] │  │ [Load][✏️][📤][🗑️] │  │ [Load][✏️][📤][🗑️] │ │
│  └────────────┘  └────────────┘  └────────────┘ │
├──────────────────────────────────────────────────┤
│           [📥 Import Preset from File]           │
├──────────────────────────────────────────────────┤
│  [💾 Save Current as Preset]          [Close]   │
└──────────────────────────────────────────────────┘
```

---

## Usage Examples

### Creating a Combat Preset

1. Equip your combat gear (power armor, bolter, chainsword, force field)
2. Activate force field
3. Click **Loadout Presets** button
4. Click **Save Current as Preset**
5. Enter name: "Combat"
6. Preset saved!

### Loading a Social Preset

1. Click **Loadout Presets** button
2. Find "Social" preset card
3. Click **Load** button
4. Confirm load dialog
5. Equipment automatically changes!

### Sharing a Build

1. Click **Loadout Presets** button
2. Find preset to share
3. Click **Export** button (📤)
4. File downloads: `combat-loadout.json`
5. Share file with party members
6. They click **Import** and select the file

---

## Technical Implementation

### Data Structure

Presets are stored in actor flags:

```javascript
// Actor flag path
actor.flags["rogue-trader"].equipmentPresets

// Preset structure
{
  id: "abc123",                    // Unique ID
  name: "Combat",                  // User-provided name
  timestamp: 1704704400000,        // Creation/update time
  loadout: {
    equipped: [
      {
        id: "itemId1",
        name: "Power Armour",
        type: "armour",
        img: "path/to/img.png"
      },
      // ... more items
    ],
    activated: [
      {
        id: "itemId2",
        name: "Rosarius"
      }
    ]
  }
}
```

### Dialog Class

```javascript
// LoadoutPresetDialog.mjs
export default class LoadoutPresetDialog extends ApplicationV2Mixin(DialogV2) {
    static async show(actor) {
        const dialog = new LoadoutPresetDialog(actor);
        dialog.render(true);
        return dialog;
    }
    
    _captureCurrentLoadout() {
        // Captures equipped/activated state
    }
    
    async _applyPreset(preset) {
        // Applies preset to actor
    }
}
```

### Action Handlers

```javascript
// Save preset
static async #onSavePreset(event, target) {
    const name = await DialogV2.prompt({...});
    const loadout = this._captureCurrentLoadout();
    const presets = this.actor.getFlag("rogue-trader", "equipmentPresets") || [];
    presets.push({id, name, loadout, timestamp});
    await this.actor.setFlag("rogue-trader", "equipmentPresets", presets);
}

// Load preset
static async #onLoadPreset(event, target) {
    const presetId = target.dataset.presetId;
    const preset = presets.find(p => p.id === presetId);
    await this._applyPreset(preset);
}

// Delete preset
static async #onDeletePreset(event, target) {
    const confirmed = await DialogV2.confirm({...});
    if (confirmed) {
        const newPresets = presets.filter(p => p.id !== presetId);
        await this.actor.setFlag("rogue-trader", "equipmentPresets", newPresets);
    }
}
```

---

## Styling

### Preset Card

```scss
.rt-preset-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--rt-bg-paper);
  border: 1px solid var(--rt-border-light);
  border-radius: 6px;
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--rt-accent-gold);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transform: translateY(-2px);
  }
}
```

### Gold Accent

The system uses gold accent colors throughout:
- Preset icon background and border
- Load button
- Hover states
- Import button icon

---

## File Structure

### New Files

| File | Lines | Description |
|------|-------|-------------|
| `loadout-preset-dialog.mjs` | 535 | Dialog class with all handlers |
| `loadout-preset-dialog.hbs` | 79 | Dialog template |
| `_loadout-preset-dialog.scss` | 353 | Dialog styling |

### Modified Files

| File | Changes |
|------|---------|
| `acolyte-sheet.mjs` | Import dialog, add managePresets action handler |
| `loadout-equipment-panel.hbs` | Add "Loadout Presets" button |
| `rogue-trader.scss` | Import dialog styles |

**Total**: ~967 lines of code

---

## Integration Points

### Equipment Panel

```handlebars
<div class="rt-bulk-operations">
    <button type="button" class="rt-bulk-btn rt-bulk-preset" 
            data-action="managePresets" 
            title="Manage loadout presets">
        <i class="fas fa-layer-group"></i>
        <span>Loadout Presets</span>
    </button>
    <!-- Other bulk operation buttons -->
</div>
```

### Acolyte Sheet

```javascript
static DEFAULT_OPTIONS = {
    actions: {
        managePresets: AcolyteSheet.#managePresets,
        // ... other actions
    }
};

static async #managePresets(event, target) {
    event.preventDefault();
    await LoadoutPresetDialog.show(this.actor);
}
```

---

## Common Use Cases

### 1. Mission Prep

**Scenario**: Team is about to infiltrate a noble's gala.

```
Current: Combat loadout (heavy armor, visible weapons)
Action: Load "Social" preset
Result: Light clothing, concealed autopistol, social items
```

### 2. Build Sharing

**Scenario**: New player wants to try a proven build.

```
Experienced Player: Exports "Tank Build" preset
New Player: Imports JSON file
Result: New player has exact equipment setup
```

### 3. Quick Swapping

**Scenario**: Party ambushed while in social gear.

```
In Combat: Character turn starts
Action: Load "Combat" preset
Result: Full armor and weapons equipped in one click
```

### 4. Experimentation

**Scenario**: Testing different equipment combinations.

```
Save: "Current Build" before experimenting
Try: Different weapon/armor combinations
Revert: Load "Current Build" if worse
```

---

## Error Handling

### Missing Items

If a preset references items that no longer exist (deleted/lost):

```javascript
// In _applyPreset()
for (const equipped of loadout.equipped) {
    const item = this.actor.items.get(equipped.id);
    if (item) {
        // Item exists, equip it
    } else {
        // Item missing, skip silently
    }
}
```

No error shown to user - preset applies what it can.

### Invalid Preset Format

```javascript
try {
    const preset = JSON.parse(text);
    if (!preset.name || !preset.loadout) {
        throw new Error("Invalid preset format");
    }
} catch (err) {
    Toast.error(`Failed to import preset: ${err.message}`);
}
```

---

## Performance Considerations

- **Preset Storage**: Stored in actor flags (no database impact)
- **Item Updates**: Batch updates where possible to minimize renders
- **Lazy Loading**: Dialog only loads when opened
- **Thumbnail Caching**: Item images cached by Foundry
- **Grid Layout**: Responsive auto-fill, no fixed columns

---

## Future Enhancements

### Potential Additions

1. **Quick Preset Bar**
   - Add preset quick-select dropdown to equipment panel
   - Click preset name to load instantly (skip dialog)

2. **Preset Sharing in Compendium**
   - Allow exporting presets to compendium packs
   - Share common builds system-wide

3. **Loadout Comparison**
   - Visual diff between current loadout and preset
   - Shows what will change before loading

4. **Conditional Presets**
   - Auto-load preset based on scene/combat state
   - "Auto-equip combat gear when combat starts"

5. **Preset Templates**
   - System-provided preset templates
   - "Heavy Armor", "Stealth", "Social" pre-configured

6. **Encumbrance Preview**
   - Show preset's encumbrance before loading
   - Warn if would exceed carry capacity

7. **Item Set Bonuses**
   - Track if preset activates special item synergies
   - Display set bonus indicators

---

## Testing Checklist

- [x] Save preset with custom name
- [x] Load preset restores equipment correctly
- [x] Rename preset updates name
- [x] Delete preset removes from list
- [x] Export preset downloads JSON file
- [x] Import preset from JSON file works
- [x] Overwrite confirmation for duplicate names
- [x] Empty state displays helpful message
- [x] Preset cards show correct item counts
- [x] Item thumbnails display correctly
- [x] Missing items handled gracefully
- [x] Dialog styles match theme
- [x] Button in equipment panel opens dialog

---

## References

- **Actor Flags API**: `actor.getFlag()`, `actor.setFlag()`
- **DialogV2 API**: `foundry.applications.api.DialogV2`
- **ApplicationV2 Mixin**: `ApplicationV2Mixin`
- **File Export**: `saveDataToFile()`
- **Toast Notifications**: `foundry.applications.api.Toast`

---

**Last Updated**: 2026-01-08  
**Implementation Time**: ~2.5 hours  
**Build Status**: ✅ Passing
