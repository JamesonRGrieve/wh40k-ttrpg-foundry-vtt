# Specialist Skills - Status Report ✅

**Date**: January 6, 2026  
**Status**: **ALL PRESENT AND WORKING**

---

## Summary

All specialist skills are present in the compendium and functioning correctly. The system uses a **template-based approach** where compendium items with `(X)` placeholders allow players to add specific specializations on their character sheets.

---

## Specialist Skills in Compendium

✅ **All 12 specialist skill types present**:

| Skill | Characteristic | Compendium File |
|-------|----------------|-----------------|
| **Common Lore** | Intelligence | `common-lore-x_1I8VwbtfaXIi6DF5.json` |
| **Forbidden Lore** | Intelligence | `forbidden-lore-x_dcFOoPyKaSVG2qbh.json` |
| **Scholastic Lore** | Intelligence | `scholastic-lore-x_jPfXcl9ip3yPxdjE.json` |
| **Speak Language** | Intelligence | `speak-language-x_d5Gx07FbLbo0pQqL.json` |
| **Secret Tongue** | Intelligence | `secret-tongue-x_8Ytvc5E5EIAFDDd0.json` |
| **Trade** | Intelligence | `trade-x_heE9hGFUIrGsGUw7.json` |
| **Pilot** | Agility | `pilot-x_dVj4QK82PMgrjVZ4.json` |
| **Drive** | Agility | `drive-x_XwbDQ1DmvW3T7zEa.json` |
| **Performer** | Fellowship | `performer-x_g8QU7c251CRmvRPF.json` |
| **Linguistics** | Intelligence | `linguistics-x_53oPvg4HRppJqCKt.json` |
| **Navigate** | Intelligence | `navigate-x_oyPZHhsiPDIhmAq6.json` |
| **Operate** | Intelligence | `operate-x_bwsxYu2rSpnJ5dMr.json` |

---

## How Specialist Skills Work

### 1. Compendium Items (Templates)

Each specialist skill in the compendium is a **template** with:
- Name ending in `(X)` placeholder
- Predefined list of common specializations
- Descriptive text

**Example** (`Common Lore (X)`):
```json
{
  "name": "Common Lore (X)",
  "system": {
    "characteristic": "intelligence",
    "skillType": "specialist",
    "specializations": [
      "Adeptus Arbites",
      "Adeptus Mechanicus",
      "Imperial Guard",
      "Imperium",
      "Rogue Traders",
      "War",
      ...
    ]
  }
}
```

### 2. Character Sheet Implementation

On the character sheet, specialist skills have an **entries array**:

```javascript
skills: {
  commonLore: {
    label: "Common Lore",
    characteristic: "Int",
    entries: [
      { name: "Imperium", trained: true, plus10: false, ... },
      { name: "Imperial Guard", trained: true, plus10: true, ... }
    ]
  }
}
```

### 3. User Interface

The **Specialist Skills Panel** (`skills-specialist-panel.hbs`) provides:

✅ **Group Headers** - Show skill name and characteristic
✅ **Add Button** (+) - Add new specialization
✅ **Specialization Entries** - Editable name field
✅ **Training Buttons** - T / +10 / +20 toggles
✅ **Roll Button** - Roll specific specialization
✅ **Delete Button** - Remove specialization

---

## Example Workflow

1. **Player opens character sheet**
2. **Navigates to Skills tab → Specialist Skills section**
3. **Sees "Common Lore"** with a (+) button
4. **Clicks (+)** to add a new entry
5. **Types "Imperium"** in the name field
6. **Clicks "T"** to mark as Trained
7. **Rolls d100** using the dice button
8. **System calculates**: Intelligence + Trained bonus + modifiers

---

## Pre-defined Specializations

Each template includes common specializations for reference:

### Common Lore
- Adeptus Arbites, Adeptus Mechanicus, Ecclesiarchy
- Imperial Guard, Imperial Navy, Imperium
- Navis Nobilite, Rogue Traders, Tech, Underworld, War
- Calixis Sector, Jericho Reach, Koronus Expanse, etc.

### Forbidden Lore
- Warp, Xenos, Daemonology, Heresy, Mutants, Psykers
- Archaeotech, Adeptus Mechanicus, Inquisition

### Scholastic Lore
- Astromancy, Beasts, Bureaucracy, Chymistry
- Cryptology, Heraldry, Judgment, Legend, Numerology
- Occult, Philosophy, Tactica Imperialis

### Speak Language
- Low Gothic, High Gothic, Techna-Lingua
- Battlefleet War Cant, Mercenary Cant
- Eldar, Ork, Tau, various regional dialects

### Trade
- Armorer, Chymist, Cook, Shipwright
- Voidfarer, Soothsayer, Scrimshawer, etc.

### Pilot/Drive
- Spacecraft, Personal (jump packs), Flyers
- Ground vehicles, Skimmers, Walkers

---

## Character Sheet Display

Specialist skills are displayed in a dedicated panel with:

```
┌─────────────────────────────────────────┐
│ Common Lore (Int)                    [+]│
├─────────────────────────────────────────┤
│ ○ Imperium        [T][+10][+20]  45 🎲 🗑│
│ ○ War             [T][  ][  ]    35 🎲 🗑│
└─────────────────────────────────────────┘
```

---

## Verification

✅ All 12 specialist skill types present in compendium  
✅ Schema supports `entries` array for specializations  
✅ UI template exists for adding/managing specializations  
✅ Roll functionality integrated  
✅ Training progression (Untrained → T → +10 → +20)  

---

## Common User Questions

**Q: Why don't I see "Common Lore (Imperium)" in the compendium?**  
A: The compendium has templates `"Common Lore (X)"`. You add specific specializations on your character sheet.

**Q: How do I add a specialization?**  
A: Click the (+) button next to the specialist skill name, then type your specialization.

**Q: Can I add custom specializations?**  
A: Yes! Type any specialization name you want. The predefined list is just for reference.

**Q: Do I need to import from compendium?**  
A: No, specialist skills are built into every character. Just add specializations directly.

---

## Status: WORKING AS DESIGNED ✅

The specialist skills system is functioning correctly. Players can:
1. View all specialist skill categories
2. Add custom specializations
3. Train them to different levels
4. Roll them in gameplay
5. Delete specializations they don't need

No migration or fixes needed.
