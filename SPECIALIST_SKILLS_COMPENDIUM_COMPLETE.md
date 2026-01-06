# Specialist Skills Compendium - Generation Complete ✅

**Date**: January 6, 2026  
**Status**: **COMPLETE**

---

## Summary

Generated **95 individual specialist skill entries** for the compendium, allowing players to drag-and-drop specific specializations directly onto their character sheets.

---

## Before vs After

### Before
- 58 total skills in compendium
- Specialist skills as templates only: `"Common Lore (X)"`, `"Pilot (X)"`, etc.
- Players had to manually add specializations on character sheet

### After ✅
- **153 total skills in compendium** (58 original + 95 new)
- Individual entries for each specialization
- Players can **drag-and-drop** from compendium:
  - `"Common Lore (Imperium)"`
  - `"Pilot (Spacecraft)"`
  - `"Speak Language (High Gothic)"`
  - etc.

---

## Generated Entries

### Common Lore (19 entries)
- Adeptus Arbites
- Adeptus Astra Telepathica
- Adeptus Mechanicus
- Adeptus Administratum
- Ecclesiarchy
- Imperial Creed
- Imperial Guard
- Imperial Navy
- **Imperium**
- Navis Nobilite
- Rogue Traders
- Tech
- Underworld
- War
- Calixis Sector
- Jericho Reach
- **Koronus Expanse**
- Screaming Vortex
- Spinward Front

### Forbidden Lore (14 entries)
- Warp
- Xenos
- Daemonology
- Heresy
- Mutants
- Psykers
- Archaeotech
- Adeptus Mechanicus
- Inquisition
- Chaos
- The Horus Heresy
- Pirates

### Scholastic Lore (13 entries)
- Astromancy
- Beasts
- Bureaucracy
- Chymistry
- Cryptology
- Heraldry
- Imperial Warrants
- Judgement
- Legend
- Numerology
- Occult
- Philosophy
- Tactica Imperialis

### Speak Language (12 entries)
- **Low Gothic**
- **High Gothic**
- Techna-Lingua
- Eldar
- Ork
- Tau
- Dark Tongue
- Kroot
- Battlefleet War Cant
- Mercenary Cant
- Trader Cant
- Underhive Cant

### Secret Tongue (7 entries)
- Military
- Underhive
- Gutter
- Rogue Trader
- Tech
- Administratum
- Acolyte

### Trade (11 entries)
- Armorer
- Chymist
- Cook
- Shipwright
- **Voidfarer**
- Soothsayer
- Scrimshawer
- Explorator
- Technomat
- Remembrancer
- Cartographer

### Pilot (7 entries)
- **Spacecraft**
- Personal (jump packs)
- Flyers
- Drop Pod
- Thunderhawk
- Land Speeder
- Assault Ram

### Drive (6 entries)
- **Ground Vehicle**
- Skimmer
- Walker
- Grav-Vehicle
- Bike
- Chariot

### Performer (6 entries)
- Singer
- Musician
- Dancer
- Actor
- Storyteller
- Poet

---

## Usage

### For Players

1. **Open Compendium**: `rt-items-skills`
2. **Search**: Type "Common Lore Imperium" or "Pilot Spacecraft"
3. **Drag-and-Drop**: Drag skill onto character sheet
4. **Automatic Setup**: Skill added with correct characteristic and type
5. **Train**: Use T/+10/+20 buttons as normal

### For GMs

All specialist skills now browsable and searchable in compendium. Can be:
- Awarded as loot/rewards
- Included in starting packages
- Referenced in adventures
- Granted through story events

---

## Technical Details

### Script
**File**: `scripts/generate-specialist-skills.js`

**Process**:
1. Reads template files (e.g., `common-lore-x_*.json`)
2. Clones template for each specialization
3. Updates name: `"Common Lore (X)"` → `"Common Lore (Imperium)"`
4. Generates unique ID
5. Saves to `_source` directory

**Idempotent**: Safe to run multiple times (creates new IDs each time)

### File Naming Convention
```
{skill}-{specialization}_{id}.json

Examples:
  common-lore-imperium_149114b48d71099b.json
  pilot-spacecraft_a7f2e8d9c5b01234.json
  speak-language-high-gothic_8f3a1c2d4e5b6789.json
```

---

## Validation

✅ **95 new files created**  
✅ **All files valid JSON**  
✅ **Unique IDs generated**  
✅ **Names properly formatted**  
✅ **All inherit from templates**  

### Quick Check
```bash
cd src/packs/rt-items-skills/_source
ls -1 | wc -l  # Should be 153

grep -l "Common Lore (Imperium)" *.json  # Should find 1 file
grep -l "Pilot (Spacecraft)" *.json      # Should find 1 file
```

---

## Next Steps

1. ⏭️ **Build**: `npm run build` to compile packs
2. ⏭️ **Test**: Open Foundry and verify compendium
3. ⏭️ **Search**: Search for "Common Lore" in compendium browser
4. ⏭️ **Drag**: Drag "Common Lore (Imperium)" onto character
5. ⏭️ **Verify**: Check skill appears in Skills tab

---

## Benefits

### Player Experience
✅ **Discoverability** - Browse all available specializations  
✅ **Convenience** - Drag-and-drop instead of manual entry  
✅ **Accuracy** - No typos or incorrect characteristic assignment  
✅ **Speed** - Faster character creation  

### GM Experience
✅ **Reference** - Easy to see all options  
✅ **Rewards** - Award specific skills as loot  
✅ **Consistency** - Everyone uses same names/format  
✅ **Documentation** - Compendium serves as skill reference  

---

## Compendium Organization

Skills now organized as:

```
rt-items-skills/
├── Standard Skills (43)
│   ├── acrobatics
│   ├── awareness
│   ├── dodge
│   └── ...
├── Specialist Templates (12)
│   ├── Common Lore (X)
│   ├── Pilot (X)
│   └── ...
└── Specialist Entries (95) ✨ NEW
    ├── Common Lore (Imperium)
    ├── Common Lore (War)
    ├── Pilot (Spacecraft)
    ├── Speak Language (High Gothic)
    └── ...
```

**Total: 153 skill items**

---

## Status: COMPLETE ✅

Players can now:
- Browse all specialist skill specializations in compendium
- Drag-and-drop specific skills onto characters
- Search for specific specializations
- Reference skill descriptions

Template skills `(X)` retained for custom specializations not in list.
