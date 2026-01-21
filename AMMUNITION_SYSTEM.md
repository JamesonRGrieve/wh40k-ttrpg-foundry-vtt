# Ammunition Loading and Tracking System

## Overview

This document describes the ammunition loading and tracking system implemented for RogueTraderVTT. The system allows players to load special ammunition items into weapons, which modify the weapon's stats and qualities dynamically.

## Features

### 1. **Ammunition Item Reference Tracking**

-   Weapons now store a reference to loaded ammunition items (UUID-based)
-   Ammunition modifiers are cached in the weapon schema for performance
-   Modifiers include: damage, penetration, range
-   Quality modifications (added/removed) are tracked

### 2. **Drag-and-Drop Loading**

-   Drag ammunition items from inventory or compendium onto weapon sheets
-   Automatic compatibility checking based on weapon type
-   Visual feedback with drag zones and loaded ammo displays

### 3. **Stat Modification**

-   Loaded ammunition modifiers automatically apply to:
    -   `effectiveDamageFormula` - damage bonus from ammo
    -   `effectivePenetration` - penetration modifier
    -   `effectiveRange` - range modifier
    -   `effectiveSpecial` - adds/removes weapon qualities

### 4. **Ammo Consumption**

-   Ammunition count decreases when weapon fires
-   Rate of Fire (RoF) integration for burst/auto fire
-   Clip automatically refills to max when loading new ammunition

### 5. **Eject/Reload Actions**

-   "Eject Ammunition" button to remove loaded ammo
-   "Reload" button respects weapon reload time
-   Visual indicators for ammo status (empty/critical/low/good)

### 6. **UI Integration**

-   Loaded ammo display on weapon sheet (both overview and properties tabs)
-   Ammo effect summary showing all modifications
-   Drop zone with visual hints when no ammo is loaded
-   Modified stat indicators show ammo contributions

## Schema Changes

### WeaponData (`src/module/data/item/weapon.mjs`)

New schema field:

```javascript
loadedAmmo: new fields.SchemaField(
    {
        uuid: new fields.StringField({ required: false, blank: true }),
        name: new fields.StringField({ required: false, blank: true }),
        modifiers: new fields.SchemaField(
            {
                damage: new fields.NumberField({ required: false, initial: 0, integer: true }),
                penetration: new fields.NumberField({ required: false, initial: 0, integer: true }),
                range: new fields.NumberField({ required: false, initial: 0, integer: true }),
            },
            { required: false },
        ),
        addedQualities: new fields.SetField(new fields.StringField({ required: true }), { required: false, initial: () => new Set() }),
        removedQualities: new fields.SetField(new fields.StringField({ required: true }), { required: false, initial: () => new Set() }),
    },
    { required: false },
);
```

## New Properties

### WeaponData

-   `hasLoadedAmmo` - Boolean indicating if ammunition is loaded
-   `loadedAmmoLabel` - Display name for loaded ammunition (or "Standard")

## New Methods

### WeaponData

-   `loadAmmo(ammoItem)` - Load ammunition into weapon, caches modifiers, refills clip
-   `ejectAmmo()` - Remove loaded ammunition, empties clip

### WeaponSheet

-   `_onDropAmmunition(ammoItem)` - Handle ammunition drag-drop
-   `_canLoadAmmunition(ammoItem)` - Validate ammunition compatibility
-   `#loadAmmo(event, target)` - Action handler for loading ammunition
-   `#ejectAmmo(event, target)` - Action handler for ejecting ammunition

## Modified Methods

### WeaponData

-   `_aggregateModificationModifiers()` - Now includes loaded ammo modifiers
-   `effectiveSpecial` - Now applies ammo quality modifications

### WeaponSheet

-   `_prepareContext()` - Adds loaded ammo data to template context
-   `_onDrop()` - Handles ammunition drops

## Template Changes

### `item-weapon-sheet-modern.hbs`

**Overview Tab:**

-   Added loaded ammunition display section
-   Shows ammo effects (damage, pen, range, qualities)
-   Eject ammunition button

**Properties Tab - Ammunition Section:**

-   Added loaded ammo banner showing current ammo
-   Visual drop zone for ammunition when none is loaded
-   Displays cached modifiers from loaded ammo
-   Eject button for removing ammunition

## Usage Examples

### Loading Ammunition

1. Open weapon sheet
2. Navigate to Properties tab → Ammunition section
3. Drag ammunition item from compendium or inventory
4. Drop onto weapon sheet (drop zone or anywhere on sheet)
5. Ammunition loads, modifiers apply, clip refills to max

### Using Loaded Ammunition

-   Weapon stats automatically reflect ammunition modifiers
-   `effectiveDamageFormula` includes ammo damage bonus
-   `effectivePenetration` includes ammo pen bonus
-   `effectiveSpecial` includes added qualities, removes blocked qualities
-   Modified stats show on weapon sheet and in combat rolls

### Ejecting Ammunition

1. Click "Eject Ammunition" button in overview or properties tab
2. Ammunition reference cleared
3. Modifiers removed from weapon stats
4. Clip empties to 0

## Integration Points

### Roll System

-   `effectiveDamageFormula` - Used by actor's `rollWeaponDamage()` method
-   `effectivePenetration` - Applied in damage roll calculations
-   `effectiveSpecial` - Used for jam checks, quality-based effects
-   `fire(shots)` - Decrements ammo count by shots fired

### Actor System

No changes required - all modifications happen at the DataModel level:

-   `rollItem()` uses weapon's effective stats
-   `rollWeaponDamage()` uses `effectiveDamageFormula`
-   Ammunition modifiers are transparent to the actor

### Action Manager

-   `DHTargetedActionManager.performWeaponAttack()` - Uses effective weapon stats
-   `fire()` method integrates with RoF for burst/auto consumption

## Ammunition Item Schema

The existing `AmmunitionData` schema (`src/module/data/item/ammunition.mjs`) already supports:

-   `weaponTypes` - Set of compatible weapon types
-   `modifiers.damage` - Damage modifier
-   `modifiers.penetration` - Penetration modifier
-   `modifiers.range` - Range modifier
-   `addedQualities` - Set of qualities added by ammo
-   `removedQualities` - Set of qualities removed by ammo
-   `clipModifier` - Modifier to clip size (not yet implemented)

## Future Enhancements

### Potential Additions

1. **Ammo Quantity Tracking** - Track how many rounds of special ammo are available
2. **Auto-eject on Empty** - Automatically eject ammo when clip reaches 0
3. **Clip Modifier** - Apply `clipModifier` from ammunition to weapon clip size
4. **Ammo Inventory** - Actor-level ammo storage and management
5. **Quick Load** - Context menu or hotkey for quick ammo swapping
6. **Ammo Compendium Browser** - Filtered browser for finding compatible ammo
7. **Custom Reload Dialog** - Choose ammunition type when reloading
8. **RoF Modifiers** - Apply ammo modifiers to rate of fire

### Known Limitations

1. Only one ammunition type can be loaded at a time
2. Ejecting ammo empties the clip entirely (no partial eject)
3. No tracking of consumed special ammo rounds
4. Clip modifier from ammunition not yet applied

## Files Modified

### Core Data Models

-   `src/module/data/item/weapon.mjs` (117 lines modified/added)
    -   Added `loadedAmmo` schema field
    -   Added `hasLoadedAmmo`, `loadedAmmoLabel` properties
    -   Added `loadAmmo()`, `ejectAmmo()` methods
    -   Modified `_aggregateModificationModifiers()` to include ammo
    -   Modified `effectiveSpecial` to apply ammo qualities

### UI Components

-   `src/module/applications/item/weapon-sheet.mjs` (98 lines added)
    -   Added `loadAmmo`, `ejectAmmo` action handlers
    -   Added `_onDropAmmunition()`, `_canLoadAmmunition()` methods
    -   Modified `_prepareContext()` to add ammo data
    -   Modified `_onDrop()` to handle ammunition drops

### Templates

-   `src/templates/item/item-weapon-sheet-modern.hbs` (80 lines modified/added)
    -   Added loaded ammo display to overview tab
    -   Added loaded ammo banner to ammunition section
    -   Added drop zone for ammunition
    -   Added eject ammunition buttons

## Testing Checklist

-   [x] Build completes without errors
-   [ ] Ammunition can be dragged onto weapon
-   [ ] Loaded ammo displays correctly on weapon sheet
-   [ ] Ammo modifiers apply to weapon stats
-   [ ] Qualities are added/removed correctly
-   [ ] Eject button removes ammunition
-   [ ] Clip refills when loading new ammo
-   [ ] Weapon type compatibility checking works
-   [ ] Modified stats display in overview tab
-   [ ] Ammunition effects show in properties tab

## Compatibility

-   **Foundry VTT**: V13.351+
-   **System Version**: 1.8.1+
-   **Breaking Changes**: None - schema additions are backward compatible
-   **Data Migration**: Not required - new fields have sensible defaults
