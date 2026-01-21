# Weapon Reload Action System

## Overview

The Weapon Reload Action system integrates with the Combat Actions system (RogueTraderVTT-7jh) to provide validated, action-economy-aware weapon reloading.

## Features

-   ✅ Reload time validation (free/half/full/2-full/3-full)
-   ✅ Action economy checking (validates available actions in combat)
-   ✅ Customised quality support (halves reload time)
-   ✅ Clip restoration (restores clip.value to clip.max)
-   ✅ Chat card output with reload details
-   ✅ Reload button on weapon sheet with tooltip
-   ✅ Shift-click to skip validation (for GMs/out-of-combat)

## Architecture

### Core Files

-   **`src/module/actions/reload-action-manager.mjs`** - Main reload action manager
    -   Validates reload actions
    -   Checks action economy
    -   Handles Customised quality
    -   Sends results to chat
-   **`src/module/data/item/weapon.mjs`** - Enhanced with:

    -   `effectiveReloadTime` getter (accounts for Customised)
    -   `effectiveReloadLabel` getter
    -   `reload()` method (uses ReloadActionManager)
    -   `reloadSimple()` method (legacy, no validation)

-   **`src/module/applications/item/weapon-sheet.mjs`** - Updated to:

    -   Use ReloadActionManager for reload button
    -   Show reload time in button tooltip
    -   Show Customised bonus in UI
    -   Disable button when fully loaded

-   **`src/templates/chat/reload-action-chat.hbs`** - Chat card template

### Integration Points

-   **Combat Actions System**: Ready to integrate with RogueTraderVTT-7jh action tracking
-   **Ammunition Tracking**: Can be extended with RogueTraderVTT-mdh magazine system

## Usage

### In-Game (Players)

1. Open weapon sheet
2. Click "Reload" button
3. System validates:
    - Weapon uses ammo
    - Not already fully loaded
    - Actor has required actions (in combat)
4. Performs reload and shows chat card

### In-Game (GMs)

-   **Shift-click** reload button to skip validation
-   Useful for out-of-combat reloads or correcting errors

### API Usage

```javascript
// Reload a weapon with validation
const result = await ReloadActionManager.reloadWeapon(weapon);
if (result.success) {
    console.log(result.message);
    console.log('Actions spent:', result.actionsSpent);
}

// Skip validation (for out-of-combat)
const result = await ReloadActionManager.reloadWeapon(weapon, {
    skipValidation: true,
});

// Force reload even if full
const result = await ReloadActionManager.reloadWeapon(weapon, {
    force: true,
});

// Check effective reload time
const effectiveTime = ReloadActionManager.getEffectiveReloadTime(weapon);
console.log('Base:', weapon.system.reload);
console.log('Effective:', effectiveTime);

// Check if has Customised quality
const hasCustomised = ReloadActionManager.hasCustomisedQuality(weapon);
```

## Reload Time Mapping

### Base Reload Times

| Reload Value | Action Cost | Description    |
| ------------ | ----------- | -------------- |
| `-`          | None        | Cannot reload  |
| `free`       | Free Action | No action cost |
| `half`       | Half Action | 1 half action  |
| `full`       | Full Action | 1 full action  |
| `2-full`     | 2 Full      | 2 full actions |
| `3-full`     | 3 Full      | 3 full actions |

### Customised Quality Effect

When weapon has **Customised** quality, reload time is halved:

-   `3-full` → `2-full`
-   `2-full` → `full`
-   `full` → `half`
-   `half` → `half` (minimum, no further reduction)
-   `free` → `free`

## Action Economy Validation

### In Combat

1. Checks if actor is in active combat
2. Validates it's the actor's turn (warns if not)
3. Reports required action cost
4. TODO: Track and deduct available actions when combat action tracking is complete

### Out of Combat

-   Allows reload without action cost
-   Shows notification: "Out of combat - no action cost"

## Chat Card Output

The reload chat card shows:

-   **Ammunition Status**: Current/max with progress bar
-   **Action Cost**: Base vs effective (if Customised)
-   **Actions Spent**: Full/Half actions used
-   **Result Message**: Success/failure message
-   **Actor Info**: Who performed the reload

## Testing

### Manual Test Checklist

-   [ ] Reload weapon with ammo (should succeed)
-   [ ] Reload weapon without ammo (should fail)
-   [ ] Reload already-full weapon (should fail)
-   [ ] Reload with Customised quality (should halve time)
-   [ ] Reload in combat on actor's turn (should validate)
-   [ ] Reload out of turn (should warn)
-   [ ] Reload out of combat (should skip validation)
-   [ ] Shift-click reload (should skip validation)
-   [ ] Check chat card formatting

### Test Weapons

1. **Autogun** (Full reload, no Customised)
2. **Laspistol** (Half reload, no Customised)
3. **Custom Lasgun** (Full reload WITH Customised → becomes Half)

## Future Enhancements

### Planned (RogueTraderVTT-mdh)

-   [ ] Magazine tracking in inventory
-   [ ] Consume magazines on reload
-   [ ] Track multiple magazine types
-   [ ] Reload from specific magazine

### Possible Extensions

-   [ ] Rapid Reload talent integration (halves reload time like Customised)
-   [ ] Tactical reload (partial reload option)
-   [ ] Reload interruption mechanics
-   [ ] Reload progress tracking for multi-turn reloads

## Dependencies

-   **RogueTraderVTT-7jh** (Combat Actions System) - ✅ COMPLETE
-   **RogueTraderVTT-mdh** (Ammunition Tracking) - ⚠️ IN PARALLEL

## Localization Keys

All reload strings are localized under `RT.Reload`:

-   `RT.Reload.Free` - "Free Action"
-   `RT.Reload.Half` - "Half Action"
-   `RT.Reload.Full` - "Full Action"
-   `RT.Reload.2Full` - "2 Full Actions"
-   `RT.Reload.3Full` - "3 Full Actions"
-   `RT.Reload.Title` - "Reload Weapon"
-   `RT.Reload.CustomisedBonus` - "Customised quality halves reload time"
-   etc.

## Notes

-   The reload system is designed to be extensible for future magazine/ammo tracking
-   Action economy integration is ready but waiting for full combat action tracking
-   The system validates but doesn't block reloads (allows GM override)
-   Chat cards provide audit trail for reload actions
