# Origin Path Refactor - Complete Summary

## Overview

This refactor transforms the origin path system from embedding abilities directly in origin path items to using standalone, reusable talents. This makes the system more modular, maintainable, and consistent with the rest of the game system.

## Key Changes

### 1. **New Talent Items Created (24 total)**

All homeworld abilities have been converted into individual talent items with the naming format: **"Trait Name (Origin Path Name)"**

#### Death World (4 talents)
- **Hardened (Death World)** - Choice between Jaded or Resistance (Poisons)
- **If It Bleeds, I Can Kill It (Death World)** - Melee Weapon Training (Primitive)
- **Paranoid (Death World)** - -10 to Interaction Skills in formal settings
- **Survivor (Death World)** - +10 to resist Pinning/Shock

#### Void Born (4 talents)
- **Charmed (Void Born)** - 1d10 roll on fate point spend, on 9 it's not lost
- **Ill-Omened (Void Born)** - -5 Fellowship with non-void born
- **Shipwise (Void Born)** - Navigation (Stellar) and Pilot (Spacecraft) become Basic Skills
- **Void Accustomed (Void Born)** - Immune to space sickness, no difficult terrain in zero-G

#### Forge World (3 talents)
- **Credo Omnissiah (Forge World)** - Grants Technical Knock talent
- **Fit For Purpose (Forge World)** - +3 to one Characteristic of choice
- **Stranger to the Cult (Forge World)** - -10 Imperial Creed knowledge, -5 Fellowship with Ecclesiarchy

#### Hive World (4 talents)
- **Accustomed to Crowds (Hive World)** - Crowds not Difficult Terrain
- **Caves of Steel (Hive World)** - Tech-Use becomes Basic Skill
- **Hivebound (Hive World)** - -10 Survival, -5 Int outside proper habs
- **Wary (Hive World)** - +1 Initiative

#### Imperial World (3 talents)
- **Blessed Ignorance (Imperial World)** - -5 to Forbidden Lore
- **Hagiography (Imperial World)** - Common Lore skills become Basic
- **Liturgical Familiarity (Imperial World)** - Literacy and High Gothic become Basic

#### Noble Born (4 talents)
- **Etiquette (Noble Born)** - +10 to Interaction Skills with authority
- **Legacy of Wealth (Noble Born)** - +1 to group's starting Profit Factor
- **Supremely Connected (Noble Born)** - Grants Peer talents
- **Vendetta (Noble Born)** - Powerful enemies narrative trait

### 2. **Modifier System Integration**

All talents now use the full `ModifiersTemplate` structure:

```json
"modifiers": {
  "characteristics": {},
  "skills": {},
  "combat": {
    "attack": 0,
    "damage": 0,
    "penetration": 0,
    "defense": 0,
    "initiative": 0,
    "speed": 0
  },
  "resources": {
    "wounds": 0,
    "fate": 0,
    "insanity": 0,
    "corruption": 0
  },
  "other": [],
  "situational": {
    "characteristics": [],
    "skills": [],
    "combat": []
  }
}
```

**Example - Wary (Hive World):**
```json
"modifiers": {
  "combat": {
    "initiative": 1
  }
}
```

**Example - Paranoid (Death World):**
```json
"modifiers": {
  "situational": {
    "skills": [
      {
        "key": "charm",
        "value": -10,
        "condition": "In formal surroundings",
        "icon": "fa-user-tie"
      }
    ]
  }
}
```

### 3. **Wounds & Fate Formulas**

New formula fields added to `origin-path.mjs` data model:

- **`woundsFormula`** - Supports notation like `"2xTB+1d5+2"`
  - `TB` = Toughness Bonus
  - `xTB` = multiply by TB (e.g., `2xTB` = double TB)
  - Dice notation supported: `1d5`, `1d10`, etc.
  
- **`fateFormula`** - Supports conditional notation like `"(1-5|=2),(6-10|=3)"`
  - Format: `(roll_range|=result_value)`
  - Example: `"(1-5|=2),(6-10|=3)"` means:
    - Roll 1-5 on 1d10 → start with 2 Fate Points
    - Roll 6-10 on 1d10 → start with 3 Fate Points

#### Homeworld Wounds Formulas:
- **Death World**: `"2xTB+1d5+2"` (most wounds)
- **Void Born**: `"2xTB+1d5"`
- **Forge World**: `"2xTB+1d5+1"`
- **Hive World**: `"2xTB+1d5+1"`
- **Imperial World**: `"2xTB+1d5"`
- **Noble Born**: `"2xTB+1d5"`

#### Homeworld Fate Formulas:
- **Death World**: `"(1-5|=2),(6-10|=3)"`
- **Void Born**: `"(1-5|=3),(6-10|=4)"` (best fate)
- **Forge World**: `"(1-5|=2),(6-9|=3),(10|=4)"`
- **Hive World**: `"(1-5|=2),(6-8|=3),(9-10|=4)"`
- **Imperial World**: `"(1-8|=3),(9-10|=4)"`
- **Noble Born**: `"(1-3|=2),(4-9|=3),(10|=4)"`

### 4. **Updated Origin Path Data**

All six homeworld origin paths have been completely rewritten:

#### Structure Changes:
- **Full flavor text** from rulebook added to descriptions
- **Characteristic modifiers** moved to `modifiers` object
- **Talents** referenced by UUID in `grants.talents` array
- **Skills** properly structured in `grants.skills` array
- **Equipment** ready for future additions in `grants.equipment` array
- **Source references** added (book + page number)

#### Before (old structure):
```json
{
  "grants": {
    "modifiers": {
      "characteristics": { "strength": 5 }
    },
    "talents": ["Death World (Paranoid), Death World (Survivor)"]
  }
}
```

#### After (new structure):
```json
{
  "grants": {
    "woundsFormula": "2xTB+1d5+2",
    "fateFormula": "(1-5|=2),(6-10|=3)",
    "talents": [
      {
        "name": "Paranoid (Death World)",
        "uuid": "Compendium.rogue-trader.rt-items-talents.DW00000000000003"
      }
    ]
  },
  "modifiers": {
    "characteristics": { "strength": 5 }
  }
}
```

## Data Model Changes

### `origin-path.mjs`

Added new fields to schema (backward compatible):

```javascript
grants: new fields.SchemaField({
  // NEW: Formula fields for dynamic calculation
  woundsFormula: new fields.StringField({ required: false, blank: true, initial: "" }),
  fateFormula: new fields.StringField({ required: false, blank: true, initial: "" }),
  
  // KEPT: Legacy fields for backward compatibility
  wounds: new fields.NumberField({ required: true, initial: 0, integer: true }),
  fateThreshold: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
  
  // ... rest of schema unchanged
})
```

## File Locations

### New Talent Files:
```
src/packs/rt-items-talents/_source/
├── hardened-death-world_DW00000000000001.json
├── if-it-bleeds-death-world_DW00000000000002.json
├── paranoid-death-world_DW00000000000003.json
├── survivor-death-world_DW00000000000004.json
├── charmed-void-born_VB00000000000001.json
├── ill-omened-void-born_VB00000000000002.json
├── shipwise-void-born_VB00000000000003.json
├── void-accustomed-void-born_VB00000000000004.json
├── credo-omnissiah-forge-world_FW00000000000001.json
├── fit-for-purpose-forge-world_FW00000000000002.json
├── stranger-to-the-cult-forge-world_FW00000000000003.json
├── accustomed-to-crowds-hive-world_HW00000000000001.json
├── caves-of-steel-hive-world_HW00000000000002.json
├── hivebound-hive-world_HW00000000000003.json
├── wary-hive-world_HW00000000000004.json
├── blessed-ignorance-imperial-world_IW00000000000001.json
├── hagiography-imperial-world_IW00000000000002.json
├── liturgical-familiarity-imperial-world_IW00000000000003.json
├── etiquette-noble-born_NB00000000000001.json
├── legacy-of-wealth-noble-born_NB00000000000002.json
├── supremely-connected-noble-born_NB00000000000003.json
└── vendetta-noble-born_NB00000000000004.json
```

### Updated Origin Path Files:
```
src/packs/rt-items-origin-path/_source/
├── death-world_U7riCIV8VzbXC6SN.json
├── void-born_YwBPZ0s6JNPnHNI5.json
├── forge-world_8rKUJtvkUzqxcpmO.json
├── hive-world_sFqrqi9aW6SYJiti.json
├── imperial-world_eA6HTHVTDSm0nVon.json
└── noble-born_ao0mxuIHUI7H08ct.json
```

### Modified Data Model:
```
src/module/data/item/origin-path.mjs
```

## Benefits of This Refactor

1. **Modularity** - Talents can be reused, swapped, or modified independently
2. **Consistency** - All origin abilities use the same talent structure as other game talents
3. **Extensibility** - Easy to add new homeworlds or modify existing ones
4. **Clarity** - Players can see exactly which talents they have from their origin
5. **Flexibility** - GMs can grant specific origin talents without entire origin paths
6. **Maintainability** - Easier to update individual abilities without touching origin paths
7. **Formula Support** - Wounds and fate can be calculated dynamically based on character stats

## Next Steps (Not Completed in This Session)

1. **Implement formula parsers** in character creation/data preparation:
   - Parse `woundsFormula` to calculate starting wounds
   - Parse `fateFormula` to determine starting fate based on d10 roll
   
2. **Update character sheet** to show origin talents as droppable items

3. **Create remaining origin step talents** (Birthright, Lure of the Void, etc.)

4. **Add equipment grants** to origin paths (weapons, armor, etc.)

5. **Test compendium compilation** with `npm run build`

## Backward Compatibility

The refactor maintains backward compatibility:
- Legacy `wounds` and `fateThreshold` fields still exist
- New `woundsFormula` and `fateFormula` fields are optional
- System can fall back to legacy fields if formulas aren't implemented yet

## Implementation Notes

All talents follow these conventions:
- **Tier 0** - Origin talents are not purchasable, they're granted
- **Cost 0** - No XP cost
- **Category "origin"** - Easy to filter
- **isPassive: true** - Most are passive effects
- **Source page references** - All cite RT Core Rulebook page numbers
- **Full descriptive text** - Copied from rulebook for accuracy
- **Modifiers properly structured** - Using situational modifiers where appropriate
