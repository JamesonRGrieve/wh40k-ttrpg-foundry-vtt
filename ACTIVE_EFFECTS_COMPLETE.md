# Active Effects Foundation - Implementation Complete

**Date**: 2026-01-07  
**Priority**: 2 (Medium Priority - Item 12)  
**Status**: ✅ COMPLETE  
**Build Status**: ✅ Passing  

---

## Overview

Implemented a comprehensive Active Effects system for the Rogue Trader VTT, providing proper Foundry V13 integration with visual UI, helper functions, and seamless integration with the existing modifier system.

---

## What Was Implemented

### 1. Custom ActiveEffect Document Class

Created `RogueTraderActiveEffect` extending Foundry's `ActiveEffect` class with Rogue Trader-specific functionality:

**File**: `src/module/documents/active-effect.mjs` (360 lines)

**Key Features**:
- Nature classification (beneficial/harmful/neutral)
- Custom apply logic for RT-specific data paths (characteristics, skills, combat stats)
- Duration tracking with expiring warnings
- Source attribution for transparency
- Changes summary formatting for display
- Remaining duration calculations

**Properties**:
- `isTemporary` - Check if effect has a duration
- `source` - Get the originating actor/item
- `sourceName` - Human-readable source name
- `nature` - Effect classification
- `durationLabel` - Formatted duration string
- `remainingDuration` - Rounds/turns left
- `isExpiring` - Warning for about-to-expire effects

### 2. Helper Functions

Expanded `src/module/rules/active-effects.mjs` from 42 → 250+ lines with comprehensive helper functions:

**Generic Helpers**:
- `createEffect(actor, effectData, options)` - Create any effect
- `removeEffects(actor, filter)` - Bulk removal with filter
- `removeEffectByName(actor, name)` - Remove by name
- `toggleEffect(actor, effectId)` - Enable/disable

**Specific Effect Creators**:
- `createCharacteristicEffect(actor, characteristic, value, options)` - Modify characteristics (e.g., +10 Strength)
- `createSkillEffect(actor, skill, value, options)` - Modify skills (e.g., +20 Dodge)
- `createCombatEffect(actor, type, value, options)` - Modify combat stats (attack/damage/defense/initiative)
- `createTemporaryEffect(actor, name, changes, rounds, options)` - Duration-based effects
- `createConditionEffect(actor, condition, options)` - Predefined conditions

**Predefined Conditions** (7 total):
- **Stunned**: -20 attack, -20 defense
- **Prone**: -20 defense
- **Blinded**: -30 WS, -30 BS
- **Deafened**: -20 Perception
- **Grappled**: -20 WS, -20 Agility
- **Inspired**: +10 Willpower, +10 Fellowship
- **Blessed**: +10 defense

### 3. Effects Panel UI

Created visual effects panel template showing all active effects on an actor:

**File**: `src/templates/actor/panel/effects-panel.hbs` (73 lines)

**Features**:
- Color-coded effect cards (green=beneficial, red=harmful, white=neutral)
- Effect icon display
- Source attribution
- Duration indicators with expiring warnings
- Changes summary showing all modifications
- Enable/disable toggles
- Delete buttons (for owners)
- Empty state message
- "Add Effect" button

### 4. Sheet Integration

**Modified**: `src/module/applications/actor/acolyte-sheet.mjs`

**Action Handlers**:
- `#createEffect` - Create new blank effect
- `#toggleEffect` - Enable/disable effect
- `#deleteEffect` - Remove effect with confirmation

**Context Preparation**:
- `_prepareOverviewContext()` - Adds effects array to context

**Added to Overview Tab**:
- Effects panel displays below Movement & Capacity

### 5. Styling

**File**: `src/scss/panels/_effects.scss` (replaced old styles)

**Visual Design**:
- Nature-based border colors (left border: 3px)
- Disabled state: grayscale + opacity
- Expiring animation: pulsing red warning
- Hover states for interactivity
- Badge count display
- Empty state styling
- Responsive button layouts

### 6. System Integration

**Modified Files**:
- `src/module/documents/_module.mjs` - Added ActiveEffect export
- `src/module/hooks-manager.mjs` - Registered `CONFIG.ActiveEffect.documentClass`
- `src/templates/actor/acolyte/tab-overview.hbs` - Added effects panel

---

## Usage Examples

### Creating Effects from Code

```javascript
// Character boost: +10 to Strength
await game.rt.activeEffects.createCharacteristicEffect(
    actor, 
    "strength", 
    10, 
    { name: "Power of the Emperor", duration: { rounds: 3 } }
);

// Skill bonus: +20 to Dodge
await game.rt.activeEffects.createSkillEffect(
    actor,
    "dodge",
    20,
    { name: "Combat Reflexes", icon: "icons/skills/movement/feet-winged-boots-brown.webp" }
);

// Apply stunned condition
await game.rt.activeEffects.createConditionEffect(actor, "stunned", {
    duration: { rounds: 2 }
});

// Combat modifier: +10 attack
await game.rt.activeEffects.createCombatEffect(
    actor,
    "attack",
    10,
    { name: "Aimed Shot", duration: { rounds: 1 } }
);

// Generic effect
await game.rt.activeEffects.createEffect(actor, {
    name: "Psychic Phenomenon",
    icon: "icons/magic/fire/flame-burning-hand-purple.webp",
    changes: [
        { key: "system.characteristics.willpower.modifier", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -10 },
        { key: "system.psy.rating", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: 2 }
    ],
    flags: { "rogue-trader": { nature: "harmful" } }
});
```

### Creating Effects from UI

1. Open character sheet
2. Go to Overview tab
3. Click "Add Effect" button at bottom of Active Effects panel
4. Effect sheet opens - configure:
   - Name and icon
   - Changes (key/mode/value)
   - Duration (rounds/turns/seconds)
   - Flags (for nature classification)

### Effect Change Keys

Common change keys for the RT system:

**Characteristics**:
- `system.characteristics.strength.modifier`
- `system.characteristics.weaponSkill.modifier`
- etc. (all 9 characteristics)

**Skills**:
- `system.skills.dodge.bonus`
- `system.skills.awareness.bonus`
- etc. (all skills)

**Combat**:
- `system.combat.attack`
- `system.combat.damage`
- `system.combat.defense`
- `system.combat.initiative`

**Resources**:
- `system.wounds.max`
- `system.fate.max`

**Movement**:
- `system.movement.modifier`

---

## Integration with Existing System

### Modifier System Compatibility

The Active Effects system works **alongside** the existing item modifier system:

1. **Item Modifiers** (from talents/traits/equipment) - Applied in `CreatureTemplate.prepareEmbeddedData()`
2. **Active Effects** - Applied by Foundry automatically during `Actor.applyActiveEffects()`

Both systems contribute to final character stats. Active Effects are ideal for:
- Temporary buffs/debuffs
- Combat conditions
- Psychic powers
- Environmental effects
- Status effects

Item modifiers are ideal for:
- Permanent equipment bonuses
- Talent effects
- Trait abilities

### Data Flow

```
Actor.prepareData()
  ├─> prepareBaseData()
  ├─> applyActiveEffects() ← Active Effects applied here
  └─> prepareDerivedData()
        └─> prepareEmbeddedData() ← Item modifiers applied here
```

---

## Testing Checklist

### Manual Testing

- [ ] Open character sheet → Overview tab
- [ ] Verify Active Effects panel displays
- [ ] Click "Add Effect" - effect sheet opens
- [ ] Create effect with characteristic modifier
- [ ] Verify characteristic value updates
- [ ] Toggle effect disabled - value reverts
- [ ] Toggle effect enabled - value reapplies
- [ ] Delete effect - confirmation dialog appears
- [ ] Confirm deletion - effect removed
- [ ] Create temporary effect with 3 rounds duration
- [ ] Start combat - verify duration counts down
- [ ] Verify expiring animation when 1 round left
- [ ] Create beneficial effect - verify green border
- [ ] Create harmful effect - verify red border

### Script Testing

```javascript
// Test characteristic effect
const actor = game.actors.getName("Test Character");
await game.rt.activeEffects.createCharacteristicEffect(actor, "strength", 10);
console.log(actor.system.characteristics.strength.modifier); // Should be +10

// Test condition
await game.rt.activeEffects.createConditionEffect(actor, "stunned");
console.log(actor.effects.getName("Stunned")); // Should exist

// Test removal
await game.rt.activeEffects.removeEffectByName(actor, "Stunned");
console.log(actor.effects.getName("Stunned")); // Should be null
```

---

## Future Enhancements

Potential improvements for future iterations:

1. **Automatic Effect Application**:
   - Talents/traits automatically create effects when added
   - Equipment bonuses as toggleable effects
   - Psychic powers create temporary effects

2. **Effect Templates**:
   - Library of common effects (buffs, debuffs, conditions)
   - One-click application from compendium
   - Drag-and-drop from compendium to actors

3. **Effect Stacking Rules**:
   - Define which effects stack
   - Automatic suppression of weaker effects
   - Stack limit configuration

4. **Advanced Duration Options**:
   - Until rest/sleep
   - Until specific trigger
   - Concentration-based (end if unconscious)

5. **Effect Automation**:
   - Auto-apply on combat start
   - Auto-remove on combat end
   - Conditional effects (only when wounded, etc.)

6. **Effect Icons**:
   - Token status icons for active effects
   - Visual indicators on character portrait
   - Color overlays on tokens

---

## Known Limitations

1. **Manual Creation**: Effects must be created manually through UI or scripts. No automatic application from items yet.

2. **No Stacking Rules**: Multiple effects with same key will all apply (might need stacking logic).

3. **Limited Automation**: Effects don't automatically trigger from game events (needs hook integration).

4. **No Transfer**: Effects on items don't automatically transfer to equipped character (V13 feature not implemented yet).

---

## API Reference

### Helper Functions

All functions available in `game.rt.activeEffects.*` (after exposing in hooks-manager):

```javascript
// Generic
createEffect(actor, effectData, options)
removeEffects(actor, filterFn)
removeEffectByName(actor, name)
toggleEffect(actor, effectId)

// Specific
createCharacteristicEffect(actor, characteristic, value, options)
createSkillEffect(actor, skill, value, options)
createCombatEffect(actor, type, value, options)
createConditionEffect(actor, condition, options)
createTemporaryEffect(actor, name, changes, rounds, options)
```

### RogueTraderActiveEffect Properties

```javascript
effect.isTemporary          // boolean
effect.source               // Actor|Item|null
effect.sourceName           // string
effect.nature               // "beneficial" | "harmful" | "neutral"
effect.natureClass          // "rt-effect-beneficial" | etc.
effect.durationLabel        // string
effect.remainingDuration    // number|null
effect.isExpiring           // boolean
effect.changesSummary       // Array<{key, label, value, mode}>
```

---

## Files Modified

### Created
- `src/module/documents/active-effect.mjs` (360 lines)
- `src/templates/actor/panel/effects-panel.hbs` (73 lines)

### Modified
- `src/module/documents/_module.mjs` (+1 line)
- `src/module/hooks-manager.mjs` (+1 line)
- `src/module/rules/active-effects.mjs` (+210 lines)
- `src/module/applications/actor/acolyte-sheet.mjs` (+80 lines)
- `src/templates/actor/acolyte/tab-overview.hbs` (+3 lines)
- `src/scss/panels/_effects.scss` (replaced, ~220 lines)

**Total**: ~650 new lines of code

---

## Conclusion

Active Effects foundation is **complete and ready for testing**. The system provides:

✅ Full V13 ActiveEffect integration  
✅ Visual UI with nature indicators  
✅ Comprehensive helper functions  
✅ Predefined conditions  
✅ Duration tracking  
✅ Source attribution  
✅ Enable/disable functionality  
✅ Clean integration with existing modifiers  

The foundation is solid and extensible, ready for future automation and enhancement features.

---

**Next Steps**: Test in Foundry, gather feedback, consider automation hooks for automatic effect application from items/talents.
