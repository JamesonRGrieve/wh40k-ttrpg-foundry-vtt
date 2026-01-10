# Active Effect Creation Dialog - Redesign Complete

**Date**: 2026-01-10  
**Status**: ✅ COMPLETE - Ready for Testing  

---

## Overview

Replaced the generic Foundry ActiveEffect sheet with a **thematic, streamlined dialog** specifically designed for Rogue Trader. The new dialog provides quick-access conditions, simple modifiers, and minimal clutter while maintaining the gothic 40K aesthetic.

---

## What Changed

### 1. New Dialog Class

**File**: `src/module/applications/prompts/effect-creation-dialog.mjs` (15.5 KB)

A custom `DialogV2`-based dialog with 5 category tabs:

1. **Conditions** - Quick-apply common status effects (Stunned, Prone, Blinded, etc.)
2. **Characteristics** - Modify characteristics (WS, BS, S, T, Ag, Int, Per, WP, Fel)
3. **Skills** - Modify skills (Dodge, Parry, Awareness, etc.)
4. **Combat** - Modify combat stats (Attack, Damage, Defense, Initiative)
5. **Custom** - Create blank effect for advanced configuration

### 2. New Template

**File**: `src/templates/dialogs/effect-creation-dialog.hbs` (10 KB)

Clean, category-based form with:
- Tab navigation at top
- Condition cards grid (3×3, color-coded by nature)
- Dropdown selectors for characteristics/skills/combat
- Modifier input fields with +/- indicators
- Duration field (rounds) for all effect types
- Info boxes with helpful hints
- Integrated footer buttons (Create/Cancel)

### 3. Thematic Styling

**File**: `src/scss/dialogs/_effect-creation-dialog.scss` (8 KB)

Gothic 40K aesthetic with:
- Dark gradient background (#1a1612 → #2c2417)
- Gold accent colors throughout
- Category tabs with hover animations
- Condition cards (red for harmful, green for beneficial)
- Glowing focus states
- Animated hover effects

### 4. Updated Integration

**Modified Files**:
- `src/module/applications/actor/base-actor-sheet.mjs` - Import and use new dialog
- `src/module/applications/prompts/_module.mjs` - Export new dialog
- `src/scss/rogue-trader.scss` - Import dialog styles
- `src/lang/en.json` - Add localization strings

---

## Features

### Quick Conditions

9 pre-configured conditions with one-click application:

| Condition | Effects | Nature |
|-----------|---------|--------|
| **Stunned** | -20 Attack, -20 Defense | Harmful |
| **Prone** | -20 Defense | Harmful |
| **Blinded** | -30 WS, -30 BS | Harmful |
| **Deafened** | -20 Perception | Harmful |
| **Grappled** | -20 WS, -20 Agility | Harmful |
| **Bleeding** | Requires processing | Harmful |
| **On Fire** | Requires processing | Harmful |
| **Inspired** | +10 Willpower, +10 Fellowship | Beneficial |
| **Blessed** | +10 Defense | Beneficial |

### Modifier Creation

Simple forms for creating characteristic/skill/combat modifiers:
- **Dropdown selector** for target (characteristic/skill/combat stat)
- **Number input** for modifier value (+10, -20, etc.)
- **Optional duration** in rounds
- **Auto-naming** (e.g., "Strength +10", "Dodge -20")
- **Auto nature detection** (positive = beneficial, negative = harmful)

### Duration Support

All effect types support optional duration:
- **Permanent** - Leave duration blank
- **Temporary** - Enter number of rounds
- **Combat tracking** - Automatically uses current combat round/turn

### Custom Effects

For advanced users:
- Create blank effect with custom name
- Effect sheet opens for manual configuration
- Full access to Foundry's ActiveEffect properties

---

## User Flow

### Creating a Condition

1. Click "Add Effect" button on actor sheet
2. Dialog opens to **Conditions** tab by default
3. Click a condition card (e.g., "Stunned")
4. Optionally enter duration in rounds
5. Effect is created instantly

### Creating a Modifier

1. Click "Add Effect" button
2. Click **Characteristics** / **Skills** / **Combat** tab
3. Select target from dropdown (e.g., "Strength")
4. Enter modifier value (e.g., "+10" or "-20")
5. Optionally enter duration
6. Click "Create Effect"

### Creating a Custom Effect

1. Click "Add Effect" button
2. Click **Custom** tab
3. Enter effect name
4. Click "Create Effect"
5. Effect sheet opens for manual configuration

---

## Visual Design

### Color Palette

- **Background**: Dark gradient (#1a1612 → #2c2417)
- **Gold Accent**: #d4af37 (primary theme color)
- **Harmful**: #e74c3c (red borders/icons)
- **Beneficial**: #2ecc71 (green borders/icons)
- **Text**: rgba(255, 255, 255, 0.9)

### Key Elements

- **Category Tabs**: Gradient backgrounds, gold highlights when active
- **Condition Cards**: 3×3 grid, color-coded borders, hover animations
- **Form Inputs**: Dark transparent backgrounds, gold focus glow
- **Buttons**: Gradient gold (primary), transparent white (secondary)

---

## Technical Details

### Architecture

```
EffectCreationDialog (DialogV2)
  ├─ 5 Category Tabs (conditions, characteristics, skills, combat, custom)
  ├─ Dynamic Form Rendering (Handlebars conditionals)
  ├─ Form Handler (processes form data)
  └─ Effect Data Generators (convert form → ActiveEffect data)
```

### Form Handler Flow

```javascript
formHandler(event, form, formData)
  ↓
  Detect effect type (condition/characteristic/skill/combat/custom)
  ↓
  Call appropriate data generator
  ↓
  Create effect on actor
  ↓
  Show notification & close dialog
```

### Data Generators

- `_createConditionData()` - Predefined condition effects
- `_createCharacteristicData()` - Characteristic modifiers
- `_createSkillData()` - Skill modifiers
- `_createCombatData()` - Combat stat modifiers
- `_createCustomData()` - Blank effect for manual config

---

## Benefits Over Default Sheet

| Aspect | Default Foundry Sheet | New RT Dialog |
|--------|----------------------|---------------|
| **Speed** | 5+ clicks to configure | 1-2 clicks for common effects |
| **Complexity** | Exposed all Foundry options | Only RT-relevant options |
| **Theming** | Generic Foundry styling | Gothic 40K aesthetic |
| **UX** | Technical field names | User-friendly categories |
| **Presets** | None | 9 pre-configured conditions |
| **Learning Curve** | Steep (understand change modes, keys) | Shallow (pick category, fill form) |

---

## Testing Checklist

### Quick Conditions
- [ ] Click "Add Effect" on character sheet → dialog opens
- [ ] Click "Stunned" condition card → effect created instantly
- [ ] Verify effect shows -20 Attack, -20 Defense
- [ ] Add duration (3 rounds) → verify duration tracked
- [ ] Test all 9 conditions → verify correct modifiers

### Characteristic Modifiers
- [ ] Switch to Characteristics tab
- [ ] Select "Strength" from dropdown
- [ ] Enter "+10" modifier → click Create
- [ ] Verify "Strength +10" effect created
- [ ] Check character sheet → Strength increased by 10
- [ ] Test negative modifier (-20) → verify decrease

### Skill Modifiers
- [ ] Switch to Skills tab
- [ ] Select "Dodge" from dropdown
- [ ] Enter "+20" modifier → click Create
- [ ] Verify "Dodge +20" effect created

### Combat Modifiers
- [ ] Switch to Combat tab
- [ ] Select "Defense" from dropdown
- [ ] Enter "+10" modifier → click Create
- [ ] Verify "Defense +10" effect created

### Custom Effects
- [ ] Switch to Custom tab
- [ ] Enter "Test Effect" as name
- [ ] Click Create → effect sheet opens
- [ ] Verify blank effect created

### Visual/UX
- [ ] Verify category tabs switch correctly
- [ ] Hover over condition cards → animations work
- [ ] Focus on inputs → gold glow appears
- [ ] Click Cancel → dialog closes without creating effect

---

## Future Enhancements

Potential improvements for future iterations:

1. **More Conditions**: Add Fear levels, Fatigue states, Pinning
2. **Tooltips**: Show condition descriptions on hover
3. **Templates**: Save custom effects as reusable templates
4. **Icons**: Custom condition icons (currently using Font Awesome)
5. **Stacking**: Configure stack limits for conditions
6. **Triggers**: Auto-apply effects on certain events
7. **Favorites**: Star frequently-used conditions for quick access

---

## Files Created/Modified

### Created (3 files)
- `src/module/applications/prompts/effect-creation-dialog.mjs` (433 lines)
- `src/templates/dialogs/effect-creation-dialog.hbs` (265 lines)
- `src/scss/dialogs/_effect-creation-dialog.scss` (382 lines)

### Modified (4 files)
- `src/module/applications/actor/base-actor-sheet.mjs` (+2 lines imports, modified #effectCreate handler)
- `src/module/applications/prompts/_module.mjs` (+3 lines export)
- `src/scss/rogue-trader.scss` (+1 line import)
- `src/lang/en.json` (+10 lines localization)

**Total**: ~1100 lines of new code

---

## Conclusion

The new Active Effect creation dialog provides a **streamlined, thematic experience** for Rogue Trader players and GMs. Quick-access conditions and simple modifier forms reduce complexity while maintaining full flexibility through the custom option.

**Status**: Ready for testing. Manual build required: `npm run build`

---

**Next Steps**: 
1. Build and test in Foundry
2. Gather user feedback on UX
3. Consider adding more predefined conditions
4. Evaluate adding effect templates/favorites system
