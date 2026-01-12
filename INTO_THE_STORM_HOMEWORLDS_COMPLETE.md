# Into the Storm Homeworlds - Complete Refactor Summary

**Date:** January 12, 2026  
**Status:** ✅ COMPLETE - All 6 homeworlds fully refactored with talents and flavor text

---

## What Was Accomplished

### 21 New Origin Talents Created

All talents follow the proper structure with:
- Full rulebook descriptions
- Benefit text
- Proper modifier structures
- Grants schema for cascading abilities
- Source references (Into the Storm pages 10-16)

#### Frontier World (4 talents)
- `tough-as-grox-hide-frontier-world_FR00000000000001.json` - +1 Wound
- `leery-of-outsiders-frontier-world_FR00000000000002.json` - −10 Fellowship with strangers
- `tenacious-survivalist-frontier-world_FR00000000000003.json` - Re-roll Initiative
- `xenos-interaction-frontier-world_FR00000000000004.json` - Immune to Fear (1-2) from xenos, −5 with Imperial Cult

#### Footfallen (4 talents)
- `street-knowledge-footfallen_FF00000000000001.json` - −5 to Scholastic Lore (except Koronus Expanse)
- `web-of-contacts-footfallen_FF00000000000002.json` - Choose Peer Talent
- `port-of-call-footfallen_FF00000000000003.json` - Grants Polyglot
- `sixth-sense-footfallen_FF00000000000004.json` - Grants Psyniscience + Rival (Inquisition)

#### Fortress World (3 talents)
- `hated-enemy-fortress-world_FO00000000000001.json` - Choose Hatred talent
- `constant-combat-training-fortress-world_FO00000000000002.json` - Choose Basic Weapon Training, −5 social on non-combat topics
- `steel-nerve-fortress-world_FO00000000000003.json` - Grants Nerves of Steel

#### Battlefleet (3 talents)
- `officer-on-deck-battlefleet_BF00000000000001.json` - +5 Command aboard spacecraft
- `void-born-ancestry-battlefleet_BF00000000000002.json` - Choose Navigation/Pilot, grants Void Accustomed
- `ship-bound-fighter-battlefleet_BF00000000000003.json` - −2 Initiative and double Long Range penalty planetside

#### Penal World (4 talents)
- `syndicate-penal-world_PW00000000000001.json` - Grants Peer (Underworld)
- `criminal-penal-world_PW00000000000002.json` - −20 Interaction with authorities if origin known
- `nightmares-penal-world_PW00000000000003.json` - 1d5 Insanity + Light Sleeper
- `underground-resources-penal-world_PW00000000000004.json` - Improve Availability via criminal contacts

#### Child of Dynasty (3 talents)
- `dynastic-warrant-child-of-dynasty_CD00000000000001.json` - +3 Ship Points (cannot convert to Profit Factor)
- `honour-amongst-ones-peers-child-of-dynasty_CD00000000000002.json` - +5 Fellowship with officials/nobility
- `unseen-enemy-child-of-dynasty_CD00000000000003.json` - Grants Enemy (unseen foe)

### 6 Homeworld Origin Paths Updated

All homeworlds now use the proper refactored structure matching Death World, Forge World, etc:

#### Frontier World
- **Full flavor text** from Into the Storm page 10
- **Formulas**: Wounds `2xTB+1d5+2`, Fate `(1-5|=2),(6-10|=3)`
- **Characteristics**: +5 Strength, −5 Intelligence
- **Skills**: Survival, Wrangling (trained)
- **Talents**: All 4 Frontier World talents with proper UUIDs
- **Source**: Into the Storm, page 10

#### Footfallen
- **Full flavor text** from Into the Storm page 11
- **Formulas**: Wounds `2xTB+1d5`, Fate `(1-4|=2),(5-7|=3),(8-10|=4)`
- **Characteristics**: −5 BS, −5 T, +5 Ag, +5 Fel
- **Skills**: Common Lore (Koronus Expanse) (trained)
- **Talents**: All 4 Footfallen talents with proper UUIDs
- **Source**: Into the Storm, page 11

#### Fortress World
- **Full flavor text** from Into the Storm page 12
- **Formulas**: Wounds `2xTB+1d5+1`, Fate `(1-9|=3),(10|=4)`
- **Characteristics**: +5 BS, +5 WP, −5 Int, −5 Fel
- **Skills**: Secret Tongue (Military), Common Lore (War) (trained)
- **Talents**: All 3 Fortress World talents with proper UUIDs
- **Source**: Into the Storm, page 12

#### Battlefleet
- **Full flavor text** from Into the Storm page 13
- **Formulas**: Wounds `2xTB+1d5`, Fate `(1-6|=3),(7-10|=4)`
- **Characteristics**: +5 WP, +3 Fel, −5 Per
- **Skills**: Common Lore (Imperial Navy), Speak Language (Battlefleet War Cant) (trained)
- **Talents**: All 3 Battlefleet talents with proper UUIDs
- **Source**: Into the Storm, page 13

#### Penal World
- **Full flavor text** from Into the Storm page 14
- **Formulas**: Wounds `2xTB+1d5+1`, Fate `(1-6|=2),(7-9|=3),(10|=4)`
- **Characteristics**: −5 WP, +5 Per, +5 T, −5 Fel
- **Skills**: Security (untrained)
- **Talents**: All 4 Penal World talents with proper UUIDs
- **Choice**: Deceive or Intimidate (trained)
- **Source**: Into the Storm, page 14

#### Child of Dynasty
- **Full flavor text** from Into the Storm pages 15-16
- **Formulas**: Wounds `2xTB+1d5`, Fate `(1-3|=2),(4-7|=3),(8-10|=4)`
- **Characteristics**: −3 T, +3 Int, −5 WP, +5 Fel
- **Skills**: Literacy, Speak Language (High Gothic) (trained)
- **Talents**: All 3 Child of Dynasty talents with proper UUIDs
- **Source**: Into the Storm, page 15-16

---

## Files Created

### Talent Files (21)
```
src/packs/rt-items-talents/_source/
├── tough-as-grox-hide-frontier-world_FR00000000000001.json
├── leery-of-outsiders-frontier-world_FR00000000000002.json
├── tenacious-survivalist-frontier-world_FR00000000000003.json
├── xenos-interaction-frontier-world_FR00000000000004.json
├── street-knowledge-footfallen_FF00000000000001.json
├── web-of-contacts-footfallen_FF00000000000002.json
├── port-of-call-footfallen_FF00000000000003.json
├── sixth-sense-footfallen_FF00000000000004.json
├── hated-enemy-fortress-world_FO00000000000001.json
├── constant-combat-training-fortress-world_FO00000000000002.json
├── steel-nerve-fortress-world_FO00000000000003.json
├── officer-on-deck-battlefleet_BF00000000000001.json
├── void-born-ancestry-battlefleet_BF00000000000002.json
├── ship-bound-fighter-battlefleet_BF00000000000003.json
├── syndicate-penal-world_PW00000000000001.json
├── criminal-penal-world_PW00000000000002.json
├── nightmares-penal-world_PW00000000000003.json
├── underground-resources-penal-world_PW00000000000004.json
├── dynastic-warrant-child-of-dynasty_CD00000000000001.json
├── honour-amongst-ones-peers-child-of-dynasty_CD00000000000002.json
└── unseen-enemy-child-of-dynasty_CD00000000000003.json
```

### Origin Path Files Updated (6)
```
src/packs/rt-items-origin-path/_source/
├── frontier-world_Jm99HA5E0ip1iAWp.json
├── footfallen_7We3BEMf0PAFsO7S.json
├── fortress-world_kBzm4AAZExdlkqT6.json
├── battlefleet_GRTOTSgUTl1WTPbx.json
├── penal-world_YrNPE9VtthnQHtcF.json
└── child-of-dynasty_xY33i8ZMw9cmlJen.json
```

---

## Data Structure Pattern

Each homeworld now follows the same pattern as the refactored core 6 homeworlds:

### Origin Path Structure
```javascript
{
  "system": {
    "identifier": "frontier-world",
    "step": "homeWorld",
    "stepIndex": 1,
    "description": {
      "value": "<h2>Homeworld Name</h2><blockquote><p><em>\"Flavor quote...\"</em></p></blockquote><p>Full description...</p><h3>Life on a Homeworld</h3><p>Details...</p><h3>Homeworld Characters</h3><p>Character perspective...</p>"
    },
    "grants": {
      "woundsFormula": "2xTB+1d5+2",
      "fateFormula": "(1-5|=2),(6-10|=3)",
      "skills": [
        {
          "name": "Survival",
          "specialization": "",
          "level": "trained"
        }
      ],
      "talents": [
        {
          "name": "Talent Name (Homeworld)",
          "specialization": "",
          "uuid": "Compendium.rogue-trader.rt-items-talents.ID"
        }
      ],
      "choices": [
        {
          "type": "skill",
          "label": "Choose one: Option A or Option B",
          "options": ["Option A", "Option B"],
          "count": 1
        }
      ]
    },
    "modifiers": {
      "characteristics": {
        "strength": 5,
        "intelligence": -5
      }
    },
    "source": {
      "book": "Into the Storm",
      "page": "10"
    }
  }
}
```

### Talent Structure
```javascript
{
  "system": {
    "identifier": "talent-name-homeworld",
    "category": "origin",
    "description": {
      "value": "<p><strong>Talent Name:</strong> Full description from rulebook...</p>"
    },
    "benefit": "<p>Mechanical benefit...</p>",
    "modifiers": {
      "resources": {
        "wounds": 1  // Example
      },
      "situational": {
        "skills": [
          {
            "condition": "When X happens",
            "modifier": -10,
            "type": "Fellowship Test"
          }
        ]
      }
    },
    "grants": {
      "skills": [],
      "talents": [
        {
          "name": "Sub-Talent",
          "specialization": "",
          "uuid": "Compendium.rogue-trader.rt-items-talents.UUID"
        }
      ],
      "specialAbilities": [
        {
          "name": "Special Ability",
          "description": "Description"
        }
      ]
    },
    "source": {
      "book": "Into the Storm",
      "page": "10"
    }
  }
}
```

---

## Talent ID Conventions

Each homeworld uses a 2-letter code + 13 digits:
- **FR** = Frontier World
- **FF** = Footfallen
- **FO** = Fortress World
- **BF** = Battlefleet
- **PW** = Penal World
- **CD** = Child of Dynasty

Format: `[CODE]00000000000001` (incrementing from 1)

---

## Key Features

### Formula Support
All homeworlds now use the formula notation:
- **Wounds**: `2xTB+1d5+2` = (Toughness Bonus × 2) + 1d5 + 2
- **Fate**: `(1-5|=2),(6-10|=3)` = Roll 1d10: 1-5 → 2 FP, 6-10 → 3 FP

### Talent Grants System
Talents can now grant other abilities:
- **Port of Call** grants **Polyglot** talent
- **Steel Nerve** grants **Nerves of Steel** talent
- **Void-Born Ancestry** grants **Void Accustomed** talent
- **Syndicate** grants **Peer (Underworld)** talent
- **Nightmares** grants **Light Sleeper** talent

### Choice System
Some homeworlds offer choices:
- **Penal World**: Choose Deceive OR Intimidate
- **Constant Combat Training**: Choose Basic Weapon Training (Las) OR (SP) (via specialAbilities)
- **Web of Contacts**: Choose Peer Talent from list (via specialAbilities)

---

## Comparison with Core Homeworlds

All 12 homeworlds now follow the same structure:

### Core 6 (Rogue Trader Core Rulebook)
✅ Death World  
✅ Void Born  
✅ Forge World  
✅ Hive World  
✅ Imperial World  
✅ Noble Born  

### Into the Storm 6 (Into the Storm Supplement)
✅ Frontier World  
✅ Footfallen  
✅ Fortress World  
✅ Battlefleet  
✅ Penal World  
✅ Child of Dynasty  

---

## What Still Needs Implementation

### Runtime Implementation
The talents and homeworlds are now data-complete, but runtime support is still needed:

1. **Formula Parsers** (`src/module/utils/formula-parser.mjs`)
   - `parseWoundsFormula(formula, toughnessBonus)` → calculate wounds
   - `parseFateFormula(formula)` → roll 1d10, return fate points

2. **Talent Granting Hook** (`src/module/hooks/talent-grants.mjs`)
   - Auto-grant abilities when talent added to actor
   - Handle cascading grants (granted talents can grant more)

3. **Choice Dialogs** (Optional)
   - Present choice dialogs for talents with multiple options
   - Store selected choices in selectedChoices field

---

## Testing Steps

### 1. Build Compendiums
```bash
npm run build
```

### 2. Verify in Foundry
- Open "Talents" compendium
- Search for new talents (e.g., "Tough as Grox-Hide")
- Verify grants structures are visible
- Open "Origin Paths" compendium
- View Frontier World, Footfallen, etc.
- Verify full flavor text displays
- Verify talent references are correct

### 3. Test Character Creation (After Runtime Implementation)
- Create new character
- Select Frontier World origin
- Verify:
  - +5 Strength, −5 Intelligence applied
  - Survival and Wrangling skills granted as trained
  - All 4 Frontier World talents added
  - Wounds calculated: (TB×2) + 1d5 + 2
  - Fate determined: Roll 1d10 → 2 or 3 FP
  - Cascading grants work (talents grant sub-talents)

---

## Summary

**Total Files Changed:** 27 (21 new talents + 6 updated homeworlds)  
**Total Lines Added:** ~5000+ (talent definitions + homeworld flavor text)  
**Backward Compatible:** ✅ Yes (extends existing system)  
**Production Ready:** ✅ Structure yes, ⏳ Runtime needs implementation  

All 6 Into the Storm homeworlds are now **fully refactored** to match the structure and quality of the core 6 homeworlds. Each has:
- Complete rulebook flavor text and character descriptions
- Proper wound/fate formulas
- Modular talent-based abilities
- Full talent grants support
- Clean, maintainable data structure

The system is now data-complete for all 12 homeworlds (6 core + 6 Into the Storm). Runtime implementation of formula parsing and talent granting hooks will make the system fully functional.

---

**Ready for build and testing!** 🚀
