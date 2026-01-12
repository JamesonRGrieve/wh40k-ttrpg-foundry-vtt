# Ship Inventory Feature - Complete Implementation

**Implementation Date**: January 10, 2026  
**Status**: ✅ COMPLETE - Ready for Testing

---

## Overview

This feature adds a **split-panel inventory management system** that allows players to separate personal gear from ship storage. Items stored on the ship do not count toward the character's carry weight, making this essential for managing heavy equipment that isn't needed in the field.

### Key Benefits

1. **Weight Management** - Ship-stowed items don't count toward encumbrance
2. **Clear Organization** - Visual separation of personal vs ship items
3. **Modern UX** - Drag-and-drop between panels with visual feedback
4. **Automatic Filtering** - Ship items excluded from armour/gear/forceField panels
5. **Foundry V13 Architecture** - Follows dnd5e patterns with DataModel-heavy design

---

## Architecture Changes

### 1. Data Model (`EquippableTemplate`)

**File**: `src/module/data/shared/equippable-template.mjs`

Added new `inShipStorage` boolean field to schema:

```javascript
static defineSchema() {
  const fields = foundry.data.fields;
  return {
    equipped: new fields.BooleanField({ required: true, initial: false }),
    inBackpack: new fields.BooleanField({ required: true, initial: false }),
    inShipStorage: new fields.BooleanField({ required: true, initial: false }), // NEW
    container: new fields.StringField({ required: false, blank: true })
  };
}
```

**New Methods**:
- `isInShipStorage` - Getter property for ship storage state
- `stowInShipStorage()` - Async method to move item to ship
- `removeFromShipStorage()` - Async method to return item to personal inventory
- Updated `isCarried` getter to exclude ship-stowed items

**Migration**: No migration needed - new field defaults to `false` for existing items.

---

### 2. Encumbrance Calculator

**File**: `src/module/utils/encumbrance-calculator.mjs`

Updated `computeEncumbrance()` to filter out ship-stowed items:

```javascript
// Filter out storage location items and ship-stowed items
const carriedItems = actor.items.filter((item) => {
    if (item.isStorageLocation) return false;
    if (item.system?.inShipStorage === true) return false; // NEW
    return true;
});
```

**Result**: Items with `system.inShipStorage = true` are completely excluded from weight calculations.

---

### 3. Item Categorization

**File**: `src/module/applications/actor/acolyte-sheet.mjs`

Updated `_getCategorizedItems()` method:

```javascript
const categories = {
    all: [],          // All equipment items
    allCarried: [],   // NEW - Personal/backpack items only
    allShip: [],      // NEW - Ship storage items only
    weapons: [],
    armour: [],       // Filtered - excludes ship items
    forceField: [],   // Filtered - excludes ship items
    cybernetic: [],   // Filtered - excludes ship items
    gear: [],         // Filtered - excludes ship items
    // ...
};
```

**Key Logic**:
- Armour, forceField, cybernetic, and gear categories **exclude ship-stowed items**
- Only personal/backpack items can be equipped or displayed in protection panels
- Weapons are not filtered (for future weapon locker feature)

---

### 4. Action Handlers

**File**: `src/module/applications/actor/acolyte-sheet.mjs`

Added four new action handlers:

```javascript
static DEFAULT_OPTIONS = {
  actions: {
    // ... existing actions
    stowToShip: AcolyteSheet.#stowToShip,           // NEW
    unstowFromShip: AcolyteSheet.#unstowFromShip,   // NEW
  }
};
```

**Handler Implementations**:

```javascript
static async #stowToShip(event, target) {
    const item = this.actor.items.get(itemId);
    await item.update({ 
        "system.equipped": false,
        "system.inBackpack": false,
        "system.inShipStorage": true 
    });
}

static async #unstowFromShip(event, target) {
    const item = this.actor.items.get(itemId);
    await item.update({ "system.inShipStorage": false });
}
```

Also updated `#stowItem` to clear ship storage flag when moving to backpack.

---

## User Interface

### 5. Split Backpack Panel Template

**File**: `src/templates/actor/panel/backpack-split-panel.hbs`

**Features**:
- Split-panel layout (Personal | Ship Storage)
- Encumbrance bar at top (only personal items counted)
- Search box filters both panels
- Card-based item display with drag handles
- Visual badges (Equipped, Backpack, Ship)
- Action buttons on each card
- Empty state messaging
- Footer with item counts

**Structure**:
```handlebars
<div class="rt-panel-backpack-split">
  <div class="rt-panel-header">
    <!-- Encumbrance bar -->
  </div>
  <div class="rt-backpack-controls">
    <!-- Search box -->
  </div>
  <div class="rt-panel-body rt-split-container">
    <!-- LEFT: Personal Inventory -->
    <div class="rt-split-column rt-personal-inventory" data-drop-zone="personal">
      <!-- Cards for allCarriedItems -->
    </div>
    
    <!-- CENTER: Divider with exchange icon -->
    <div class="rt-split-divider">
      <i class="fas fa-exchange-alt"></i>
    </div>
    
    <!-- RIGHT: Ship Storage -->
    <div class="rt-split-column rt-ship-storage" data-drop-zone="ship">
      <!-- Cards for allShipItems -->
    </div>
  </div>
  <div class="rt-panel-footer">
    <!-- Item counts -->
  </div>
</div>
```

---

### 6. Equipment Tab Integration

**File**: `src/templates/actor/panel/loadout-equipment-panel.hbs`

Replaced old backpack header panel with:
```handlebars
{{> systems/rogue-trader/templates/actor/panel/backpack-split-panel.hbs}}
```

The new panel **replaces** the old single-column backpack. Equipment categories (Armour, Force Fields, Cybernetics, Gear) remain below and automatically filter out ship-stowed items.

---

## Styling

### 7. SCSS Styles

**File**: `src/scss/panels/_backpack-split-panel.scss` (NEW - 550+ lines)

**Design System**:
- Imperial Gothic theme with gold accents
- Personal side: Gold-themed
- Ship side: Blue-themed (#6a9bdc)
- Smooth animations and transitions
- Responsive design (stacks vertically on mobile)

**Key Components**:

| Component | Description |
|-----------|-------------|
| `.rt-panel-backpack-split` | Main container with shadow and border |
| `.rt-backpack-header` | Gold gradient header with encumbrance bar |
| `.rt-encumbrance-bar-fill` | Animated bar with 4 states (normal/caution/warning/danger) |
| `.rt-split-container` | Flexbox split layout (1:auto:1 ratio) |
| `.rt-split-column` | Left/right panels with scroll |
| `.rt-split-divider` | Center divider with exchange icon |
| `.rt-inventory-grid` | CSS Grid for item cards (auto-fill, 140px min) |
| `.rt-inventory-card` | Item card with image, name, badges, actions |
| `.rt-card-equipped` | Green border for equipped items |
| `.rt-card-stowed` | Gold border for backpack items |
| `.rt-card-ship` | Blue border for ship items |
| `.rt-empty-state` | Centered empty state with icon and hint |
| `.rt-drag-over` | Visual feedback during drag operation |

**Responsive Breakpoint**:
- < 768px: Stacks vertically, divider rotates horizontal

---

## Drag & Drop

### 8. Enhanced Drop Handling

**File**: `src/module/applications/api/drag-drop-visual-mixin.mjs`

Updated `_onEnhancedDrop()` method to recognize drop zones:

```javascript
async _onEnhancedDrop(event) {
    const zoneType = zone.dataset.dropZone;
    
    if (zoneType === "personal") {
        // Move from ship to personal
        await item.update({ "system.inShipStorage": false });
    } else if (zoneType === "ship") {
        // Move from personal to ship
        await item.update({ 
            "system.equipped": false,
            "system.inBackpack": false,
            "system.inShipStorage": true 
        });
    }
    // ... existing equipment slot handling
}
```

Updated `_onEnhancedDragOver()` to add visual feedback:

```javascript
_onEnhancedDragOver(event) {
    const zoneType = zone.dataset.dropZone;
    
    if (zoneType === "personal" || zoneType === "ship") {
        zone.classList.add("rt-drag-over"); // NEW
        event.dataTransfer.dropEffect = "move";
    }
}
```

**Visual Feedback**:
- Drop zone highlights on drag over
- Different colors for personal (gold) vs ship (blue)
- Animated pseudo-content with drop hint
- Cursor changes to "move" icon

---

## Files Modified

### JavaScript (5 files)

1. `src/module/data/shared/equippable-template.mjs` - Added `inShipStorage` field and methods
2. `src/module/utils/encumbrance-calculator.mjs` - Filter ship items from weight
3. `src/module/applications/actor/acolyte-sheet.mjs` - Item categorization + action handlers
4. `src/module/applications/api/drag-drop-visual-mixin.mjs` - Drop zone handling

### Templates (2 files)

1. `src/templates/actor/panel/backpack-split-panel.hbs` - NEW - Split panel template
2. `src/templates/actor/panel/loadout-equipment-panel.hbs` - Integrated new panel

### SCSS (2 files)

1. `src/scss/panels/_backpack-split-panel.scss` - NEW - Complete styling
2. `src/scss/panels/_index.scss` - Import new styles

---

## Data Flow

### Moving Item to Ship Storage

1. User drags item from personal panel to ship panel **OR** clicks "Stow in Ship" button
2. `#stowToShip()` action handler or `_onEnhancedDrop()` triggered
3. Item updated: `{ "system.inShipStorage": true, "system.equipped": false, "system.inBackpack": false }`
4. Actor `prepareData()` runs → calls `computeEncumbrance()`
5. Encumbrance calculator filters out ship items
6. `_getCategorizedItems()` splits items into `allCarried` and `allShip`
7. Sheet re-renders with item moved to ship panel
8. Encumbrance bar updates (weight reduced)

### Moving Item to Personal

1. User drags item from ship panel to personal panel **OR** clicks "Move to Personal" button
2. `#unstowFromShip()` action handler or `_onEnhancedDrop()` triggered
3. Item updated: `{ "system.inShipStorage": false }`
4. Actor data preparation runs
5. Item now included in encumbrance calculation
6. Item appears in personal panel
7. Encumbrance bar updates (weight increased)

---

## Testing Checklist

### Manual Testing

- [ ] **Weight Calculation**
  - [ ] Personal items count toward encumbrance
  - [ ] Ship items do NOT count toward encumbrance
  - [ ] Moving item to ship reduces weight
  - [ ] Moving item to personal increases weight
  - [ ] Encumbrance bar updates correctly

- [ ] **Panel Display**
  - [ ] Split panel renders correctly
  - [ ] Items appear in correct column
  - [ ] Cards show correct badges (Equipped/Backpack/Ship)
  - [ ] Empty state displays when no items
  - [ ] Footer counts are accurate

- [ ] **Drag & Drop**
  - [ ] Can drag from personal to ship
  - [ ] Can drag from ship to personal
  - [ ] Drop zones highlight on drag over
  - [ ] Visual feedback is clear
  - [ ] Item moves to correct panel after drop

- [ ] **Action Buttons**
  - [ ] "Stow in Ship" button works from personal items
  - [ ] "Move to Personal" button works from ship items
  - [ ] Flash animation shows on button click
  - [ ] Item state updates correctly

- [ ] **Item Filtering**
  - [ ] Armour panel excludes ship-stowed items
  - [ ] Force Field panel excludes ship-stowed items
  - [ ] Cybernetics panel excludes ship-stowed items
  - [ ] Gear panel excludes ship-stowed items
  - [ ] Ship-stowed armour cannot be equipped

- [ ] **Search & Filters**
  - [ ] Search box filters both personal and ship panels
  - [ ] Clear button works

- [ ] **Responsive Design**
  - [ ] Desktop layout (side-by-side)
  - [ ] Mobile layout (stacked)
  - [ ] Scrolling works in both panels

### Edge Cases

- [ ] Item with `inShipStorage: true` cannot be equipped
- [ ] Equipped item moved to ship automatically unequips
- [ ] Backpack item moved to ship clears backpack flag
- [ ] Empty character inventory displays empty states
- [ ] Drag-drop from external source (compendium) works
- [ ] Item deletion from ship panel works
- [ ] Item editing from ship panel works

---

## User Guide

### How to Use

1. **Open Character Sheet** → Navigate to **Equipment** tab
2. **View Inventory** - The backpack panel is now split:
   - **Left side** = Personal Inventory (carried or in backpack)
   - **Right side** = Ship Storage (not counted in weight)

3. **Move Items to Ship**:
   - **Drag & Drop**: Drag item card from left to right
   - **Button**: Click the blue arrow button on item card

4. **Retrieve Items from Ship**:
   - **Drag & Drop**: Drag item card from right to left
   - **Button**: Click the gold arrow button on item card

5. **View Weight Impact**:
   - Watch encumbrance bar at top of panel
   - Ship items are excluded from weight calculation
   - Personal item count shown in footer

### Visual Indicators

| Badge | Meaning |
|-------|---------|
| <span style="color: #2d5016">✓ Equipped</span> | Item is currently worn/wielded |
| <span style="color: #c9a227">🎒 Backpack</span> | Item is in character's backpack |
| <span style="color: #6a9bdc">📦 Ship</span> | Item is in ship storage |

### Pro Tips

- **Heavy items** (power armour, heavy weapons) → Ship storage when not in combat
- **Quest items** that aren't needed now → Ship storage
- **Multiple weapon sets** → Keep one personal, rest on ship
- **Bulk trade goods** → Ship storage to avoid encumbrance
- **Search works across both panels** - type to find items anywhere

---

## Future Enhancements

### Potential Additions

1. **Ship Cargo Capacity Limit**
   - Add max cargo weight to ship actors
   - Show cargo bar like encumbrance bar
   - Warning when approaching limit

2. **Multiple Storage Locations**
   - Safe house storage
   - Vault/bank storage
   - Different ship compartments

3. **Quick Transfer Buttons**
   - "Stow All Gear" → Move all gear to ship
   - "Retrieve Combat Gear" → Move weapons/armour to personal

4. **Storage Location Actors**
   - Create Ship actor type with cargo bay
   - Link character to ship
   - Track actual ship inventory

5. **Container Upgrades**
   - Backpack capacity upgrades
   - Ship cargo hold expansions
   - Special storage (cold, secure, etc.)

6. **Transfer History**
   - Log when items moved
   - Track who moved what
   - Audit trail for group play

---

## Technical Notes

### Performance Considerations

- **No Caching** - Item categorization computed fresh each render (per AGENTS.md standard)
- **Reactive Updates** - Foundry's reactive system triggers re-renders on item updates
- **DataModel Efficiency** - Encumbrance calculation happens in `prepareEmbeddedData()` once per actor update
- **Drag Performance** - Drag ghost is temporary DOM element, removed after drag start

### Compatibility

- **Foundry Version**: V13+ (uses ApplicationV2 pattern)
- **Breaking Changes**: None - existing items work without migration
- **Module Compatibility**: Should work with any module that doesn't override equipment panel
- **Save Compatibility**: Forward and backward compatible

### Known Limitations

1. **Ship-stowed items cannot be equipped** - This is intentional and by design
2. **No ship cargo capacity limit** - Future enhancement
3. **Single ship storage** - No per-ship tracking yet
4. **Weapons not filtered** - Deliberate choice for weapon locker feature later

---

## Support

### Debugging

If items aren't appearing correctly:

1. Check browser console for errors
2. Verify `system.inShipStorage` field exists on item
3. Ensure SCSS compiled correctly (`npm run build`)
4. Check template loaded: `game.templates` in console
5. Verify drop zones have `data-drop-zone` attribute

### Common Issues

| Issue | Solution |
|-------|----------|
| Weight not updating | Refresh sheet after moving item |
| Drag not working | Check `draggable="true"` on cards |
| Styles not applied | Run `gulp scss` and refresh |
| Empty panels | Check `allCarriedItems` / `allShipItems` in context |

---

## Credits

**Implementation**: January 10, 2026  
**Architecture**: dnd5e V13 pattern  
**Design**: Imperial Gothic 40K theme  
**System**: Rogue Trader VTT for Foundry VTT V13+

---

## Changelog

### v1.0.0 - January 10, 2026

- ✅ Added `inShipStorage` field to EquippableTemplate
- ✅ Updated encumbrance calculator to exclude ship items
- ✅ Modified item categorization to filter ship-stowed items
- ✅ Created split backpack panel UI
- ✅ Implemented drag-drop between personal/ship
- ✅ Added action handlers for ship storage
- ✅ Created modern Gothic-themed SCSS
- ✅ Integrated with equipment tab
- ✅ Enhanced visual feedback on drag operations
