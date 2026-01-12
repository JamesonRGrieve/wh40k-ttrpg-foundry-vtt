# Origin Path Formulas - Quick Reference

## Wounds Formula Notation

### Format: `"NxTB+MdX+Z"`

Where:
- **N** = Multiplier for Toughness Bonus
- **TB** = Character's Toughness Bonus (tens digit of Toughness)
- **M** = Number of dice to roll
- **X** = Die type (e.g., 5 for d5, 10 for d10)
- **Z** = Flat modifier

### Examples:

| Formula | Meaning | Example (TB=3) |
|---------|---------|----------------|
| `"2xTB+1d5+2"` | Double TB, roll 1d5, add 2 | (3×2) + 3 (rolled) + 2 = **11 wounds** |
| `"2xTB+1d5"` | Double TB, roll 1d5 | (3×2) + 2 (rolled) = **8 wounds** |
| `"2xTB+1d5+1"` | Double TB, roll 1d5, add 1 | (3×2) + 4 (rolled) + 1 = **11 wounds** |

### Homeworld Wounds Formulas:

| Homeworld | Formula | Average Wounds (TB=3) |
|-----------|---------|------------------------|
| Death World | `"2xTB+1d5+2"` | 11-12 (hardy survivors) |
| Void Born | `"2xTB+1d5"` | 9-10 (weakened by void) |
| Forge World | `"2xTB+1d5+1"` | 10-11 (augmented) |
| Hive World | `"2xTB+1d5+1"` | 10-11 (tough but polluted) |
| Imperial World | `"2xTB+1d5"` | 9-10 (average) |
| Noble Born | `"2xTB+1d5"` | 9-10 (pampered) |

---

## Fate Formula Notation

### Format: `"(range|=value),(range|=value),..."`

Where:
- **range** = Dice roll range (e.g., `1-5`, `6-10`, `10`)
- **value** = Fate Points granted for that range

### Roll Interpretation:

When a character is created, roll **1d10**. Compare to the ranges in the formula to determine starting Fate Points.

### Examples:

| Formula | Meaning |
|---------|---------|
| `"(1-5\|=2),(6-10\|=3)"` | Roll 1-5 → 2 FP, Roll 6-10 → 3 FP |
| `"(1-5\|=3),(6-10\|=4)"` | Roll 1-5 → 3 FP, Roll 6-10 → 4 FP |
| `"(1-5\|=2),(6-9\|=3),(10\|=4)"` | Roll 1-5 → 2 FP, Roll 6-9 → 3 FP, Roll 10 → 4 FP |

### Homeworld Fate Formulas:

| Homeworld | Formula | 1d10 Roll Results |
|-----------|---------|-------------------|
| **Death World** | `"(1-5\|=2),(6-10\|=3)"` | 50% chance 2 FP, 50% chance 3 FP |
| **Void Born** | `"(1-5\|=3),(6-10\|=4)"` | 50% chance 3 FP, 50% chance 4 FP ⭐ |
| **Forge World** | `"(1-5\|=2),(6-9\|=3),(10\|=4)"` | 50% → 2 FP, 40% → 3 FP, 10% → 4 FP |
| **Hive World** | `"(1-5\|=2),(6-8\|=3),(9-10\|=4)"` | 50% → 2 FP, 30% → 3 FP, 20% → 4 FP |
| **Imperial World** | `"(1-8\|=3),(9-10\|=4)"` | 80% chance 3 FP, 20% chance 4 FP ⭐ |
| **Noble Born** | `"(1-3\|=2),(4-9\|=3),(10\|=4)"` | 30% → 2 FP, 60% → 3 FP, 10% → 4 FP |

⭐ = Best fate point chances

---

## Implementation Guide

### Parsing Wounds Formula

```javascript
/**
 * Parse wounds formula like "2xTB+1d5+2"
 * @param {string} formula - The wounds formula
 * @param {number} toughnessBonus - Character's TB
 * @returns {number} - Calculated wounds
 */
function parseWoundsFormula(formula, toughnessBonus) {
  if (!formula) return 0;
  
  let total = 0;
  const parts = formula.split(/(?=[+-])/); // Split on + or - but keep the sign
  
  for (let part of parts) {
    part = part.trim();
    
    // Handle "NxTB" (multiply TB)
    if (part.includes('xTB')) {
      const multiplier = parseInt(part.replace('xTB', '')) || 1;
      total += multiplier * toughnessBonus;
    }
    // Handle "MdX" (dice roll)
    else if (part.includes('d')) {
      const [count, sides] = part.replace(/[+-]/g, '').split('d').map(Number);
      for (let i = 0; i < count; i++) {
        total += Math.floor(Math.random() * sides) + 1;
      }
    }
    // Handle flat modifiers "+Z" or "-Z"
    else {
      total += parseInt(part) || 0;
    }
  }
  
  return Math.max(0, total); // Never negative
}

// Example usage:
const wounds = parseWoundsFormula("2xTB+1d5+2", 3);
// Result: 6 (2×3) + [1-5] + 2 = 9-13 wounds
```

### Parsing Fate Formula

```javascript
/**
 * Parse fate formula like "(1-5|=2),(6-10|=3)"
 * @param {string} formula - The fate formula
 * @returns {number} - Fate points (after rolling 1d10)
 */
function parseFateFormula(formula) {
  if (!formula) return 0;
  
  const roll = Math.floor(Math.random() * 10) + 1; // Roll 1d10
  
  // Parse each condition: "(range|=value)"
  const conditions = formula.match(/\(([^)]+)\)/g);
  
  for (const condition of conditions) {
    const match = condition.match(/\((\d+)(?:-(\d+))?\|=(\d+)\)/);
    if (!match) continue;
    
    const [_, minStr, maxStr, valueStr] = match;
    const min = parseInt(minStr);
    const max = maxStr ? parseInt(maxStr) : min;
    const value = parseInt(valueStr);
    
    if (roll >= min && roll <= max) {
      return value;
    }
  }
  
  return 0; // Fallback
}

// Example usage:
const fate = parseFateFormula("(1-5|=2),(6-10|=3)");
// Roll 1d10: if 1-5 → return 2, if 6-10 → return 3
```

---

## Character Creation Flow

### Step 1: Select Homeworld
Player selects a homeworld origin path (e.g., Death World)

### Step 2: Apply Characteristic Modifiers
Apply from `origin.system.modifiers.characteristics`:
```javascript
character.characteristics.strength += 5;
character.characteristics.toughness += 5;
character.characteristics.willpower -= 5;
character.characteristics.fellowship -= 5;
```

### Step 3: Calculate Starting Wounds
```javascript
const tb = character.characteristics.toughness.bonus; // e.g., 3
const woundsFormula = origin.system.grants.woundsFormula; // "2xTB+1d5+2"
const startingWounds = parseWoundsFormula(woundsFormula, tb);
character.wounds.max = startingWounds;
character.wounds.value = startingWounds;
```

### Step 4: Determine Starting Fate
```javascript
const fateFormula = origin.system.grants.fateFormula; // "(1-5|=2),(6-10|=3)"
const startingFate = parseFateFormula(fateFormula);
character.fate.max = startingFate;
character.fate.value = startingFate;
```

### Step 5: Grant Skills
```javascript
for (const skill of origin.system.grants.skills) {
  // Add skill to character with appropriate training level
  grantSkill(character, skill.name, skill.specialization, skill.level);
}
```

### Step 6: Grant Talents
```javascript
for (const talent of origin.system.grants.talents) {
  // Add talent item to character
  const talentItem = await fromUuid(talent.uuid);
  await character.createEmbeddedDocuments("Item", [talentItem.toObject()]);
}
```

### Step 7: Present Choices (if any)
```javascript
if (origin.system.grants.choices.length > 0) {
  // Display dialog for player to make selections
  // e.g., "Choose Jaded or Resistance (Poisons)"
  await presentChoiceDialog(character, origin.system.grants.choices);
}
```

---

## Testing Examples

### Test Case 1: Death World Character (TB=4)

**Wounds Calculation:**
- Formula: `"2xTB+1d5+2"`
- TB = 4
- Roll 1d5 = 3
- Result: (4×2) + 3 + 2 = **13 wounds**

**Fate Determination:**
- Formula: `"(1-5|=2),(6-10|=3)"`
- Roll 1d10 = 7
- Result: **3 Fate Points**

**Applied Talents:**
- If It Bleeds, I Can Kill It (Death World) → Melee Training (Primitive)
- Paranoid (Death World) → -10 Interaction in formal settings
- Survivor (Death World) → +10 resist Pinning/Shock
- Player Choice: Jaded OR Resistance (Poisons)

---

### Test Case 2: Void Born Character (TB=2)

**Wounds Calculation:**
- Formula: `"2xTB+1d5"`
- TB = 2
- Roll 1d5 = 4
- Result: (2×2) + 4 = **8 wounds**

**Fate Determination:**
- Formula: `"(1-5|=3),(6-10|=4)"`
- Roll 1d10 = 9
- Result: **4 Fate Points** (best possible!)

**Applied Talents:**
- Charmed (Void Born) → Fate point recovery chance
- Ill-Omened (Void Born) → -5 Fellowship with non-void born
- Shipwise (Void Born) → Navigation/Pilot become Basic Skills
- Void Accustomed (Void Born) → Zero-G benefits

---

## Edge Cases & Notes

### Minimum Values
- Wounds should never be less than 1
- Fate should never be less than 0 (though 1 is practical minimum)

### Rounding
- Always round DOWN for dice rolls (use `Math.floor()`)
- TB is already an integer (tens digit)

### Formula Validation
- Check formulas for valid syntax during data validation
- Provide sensible defaults if formulas are malformed
- Log warnings for GM if formula parsing fails

### Legacy Support
If `woundsFormula` or `fateFormula` are empty, fall back to:
- `origin.system.grants.wounds` (legacy flat modifier)
- `origin.system.grants.fateThreshold` (legacy flat value)
