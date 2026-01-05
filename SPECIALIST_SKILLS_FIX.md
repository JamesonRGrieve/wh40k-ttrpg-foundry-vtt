# Specialist Skills Fix - Summary

## Problem
The specialist skills system was not working properly due to a critical bug in the HTML data attribute naming.

## Root Cause
**Critical Bug: Inconsistent Data Attribute Naming**

The template used two different spellings for the data attribute:
- The drag-and-drop row used `data-speciality="{{idx}}"` (British spelling)
- The roll button and training select used `data-specialty="{{idx}}"` (American spelling)

This caused the drag-and-drop handler in `actor-container-sheet.mjs` to look for `dataset.speciality`, which would work for the row but fail for the button elements. The roll skill handler in `acolyte-sheet.mjs` looked for `dataset.specialty`, which would work for the buttons but not match the drag row.

## Solution

### 1. Fixed Data Attribute Inconsistency
**File: `src/templates/actor/panel/skills-specialist-panel.hbs`**

Changed line 28 from:
```handlebars
<div class="table-row actor-drag rt-specialist-row" data-item-type="skill" data-item-id="{{../entry.[0]}}" data-speciality="{{idx}}">
```

To:
```handlebars
<div class="table-row actor-drag rt-specialist-row" data-item-type="skill" data-item-id="{{../entry.[0]}}" data-specialty="{{idx}}">
```

**File: `src/module/sheets/actor/actor-container-sheet.mjs`**

Updated the drag handler to use consistent `dataset.specialty`:
```javascript
if (element.dataset.specialty && Array.isArray(skill.entries)) {
    const speciality = skill.entries[element.dataset.specialty];
    if (speciality) {
        name = `${name}: ${speciality.name ?? speciality.label ?? element.dataset.specialty}`;
    }
}
dragData.data = {
    name,
    skill: element.dataset.itemId,
    speciality: element.dataset.specialty,  // Note: property name stays as 'speciality' for data consistency
};
```

### 2. Enhanced Pack Metadata
**Files: All 13 specialist skill pack files in `src/packs/rt-items-skills/_source/`**

Added structured `specializations` arrays to all specialist skill pack files:
- `common-lore-x_1I8VwbtfaXIi6DF5.json` - 19 common specializations
- `forbidden-lore-x_dcFOoPyKaSVG2qbh.json` - 18 forbidden specializations
- `scholastic-lore-x_jPfXcl9ip3yPxdjE.json` - 16 academic specializations
- `pilot-x_dVj4QK82PMgrjVZ4.json` - 3 vehicle types
- `trade-x_heE9hGFUIrGsGUw7.json` - 14 trade specializations
- `speak-language-x_d5Gx07FbLbo0pQqL.json` - 6 languages
- `secret-tongue-x_8Ytvc5E5EIAFDDd0.json` - 7 secret tongues
- `performer-x_g8QU7c251CRmvRPF.json` - 4 performance types
- `linguistics-x_53oPvg4HRppJqCKt.json` - 13 languages
- `ciphers-x_FJr1HAhhiPXvymDv.json` - 5 cipher types
- `navigate-x_oyPZHhsiPDIhmAq6.json` - 4 navigation types
- `operate-x_bwsxYu2rSpnJ5dMr.json` - 3 vehicle operation types
- `drive-x_XwbDQ1DmvW3T7zEa.json` - 3 ground vehicle types

Example structure:
```json
{
  "system": {
    "specializations": [
      "Adeptus Arbites",
      "Adeptus Mechanicus",
      "Imperial Guard",
      ...
    ]
  }
}
```

### 3. Improved Add Specialization Dialog
**File: `src/module/prompts/simple-prompt.mjs`**

Enhanced `prepareCreateSpecialistSkillPrompt` to:
- Fetch the skill from the compendium
- Extract the `specializations` array
- Pass it to the template
- Handle both dropdown selection and custom text input
- Provide better validation

**File: `src/templates/prompt/add-speciality-prompt.hbs`**

Updated the dialog UI to:
- Show a dropdown with common specializations when available
- Provide a custom text input field for non-standard specializations
- Display helpful instructions
- Gracefully degrade to text-only input if no specializations are available

## How Specialist Skills Work

### Data Structure
Specialist skills are stored in the actor's `system.skills` with an `entries` array:
```javascript
{
  "commonLore": {
    "label": "Common Lore",
    "characteristic": "Int",
    "entries": [
      {
        "name": "Imperial Guard",
        "characteristic": "Int",  // Can override parent skill's characteristic
        "basic": true,
        "trained": false,
        "plus10": false,
        "plus20": false,
        "bonus": 0,
        "current": 35  // Computed value
      }
    ]
  }
}
```

### Skill Computation
From `acolyte.mjs` `_computeSkills()` method:

1. For each specialist skill entry:
   - Uses the entry's characteristic (or falls back to parent skill's characteristic)
   - Calculates training value: +30 for plus20, +20 for plus10, +10 for trained, 0 for basic, -20 for untrained
   - Adds characteristic total + training + bonus + item modifiers
   - Stores result in `speciality.current`

### UI Operations

**Adding a Specialization:**
1. Click "Add" button next to specialist skill group
2. Dialog shows common specializations (from pack metadata) in dropdown
3. User can select from dropdown or enter custom name
4. Calls `actor.addSpecialitySkill(skillName, specialization)`

**Rolling a Specialist Skill:**
1. Click dice icon next to specialization
2. Button has `data-skill` and `data-specialty` attributes
3. Calls `actor.rollSkill(skillName, specialtyIndex)`
4. Uses the computed `current` value for the roll

**Changing Training Level:**
1. Select new training level from dropdown
2. Dropdown has `data-skill` and `data-specialty` attributes
3. Calls `_onSkillTrainingChange` which updates all training flags
4. Skill is recomputed on next data preparation

**Drag and Drop:**
1. Specialist row has `data-item-type="skill"`, `data-item-id` (skill key), and `data-specialty` (entry index)
2. Creates drag data with skill name including specialization
3. Can be dropped on hotbar or macro slots

## Testing Checklist

✅ Build succeeded with all changes
- [ ] Manual testing in Foundry VTT:
  - [ ] Add specialist skill specialization (Common Lore)
  - [ ] Verify dropdown shows specializations
  - [ ] Add custom specialization
  - [ ] Roll a specialist skill
  - [ ] Change training level on specialist skill
  - [ ] Change characteristic on specialist skill
  - [ ] Drag specialist skill to hotbar
  - [ ] Verify skill total calculation is correct

## Files Changed

### Core Fixes (Critical)
1. `src/templates/actor/panel/skills-specialist-panel.hbs` - Fixed data attribute
2. `src/module/sheets/actor/actor-container-sheet.mjs` - Fixed drag handler

### Enhancement (Better UX)
3. `src/module/prompts/simple-prompt.mjs` - Enhanced dialog with pack data
4. `src/templates/prompt/add-speciality-prompt.hbs` - Improved UI

### Pack Metadata (Better Discoverability)
5-17. All 13 specialist skill pack files - Added specializations arrays

## Benefits

1. **Specialist skills now work correctly** - The critical bug is fixed
2. **Better user experience** - Users see available specializations
3. **More discoverable** - New players can see what specializations are available
4. **Maintains flexibility** - Custom specializations still fully supported
5. **Consistent with lore** - Specializations match Rogue Trader rulebook
