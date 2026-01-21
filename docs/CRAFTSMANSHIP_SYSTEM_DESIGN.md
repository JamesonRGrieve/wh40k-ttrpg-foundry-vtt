# Craftsmanship System Design

## Overview

This document outlines the system-level approach to applying craftsmanship quality modifiers across all item types (weapons, armour, gear) in a consistent, dynamic way that works for:

-   Compendium items
-   User-created items
-   Imported items
-   Any item with a `craftsmanship` field

## Design Philosophy

**DYNAMIC vs STATIC:**

-   ✅ **DYNAMIC** (preferred): Apply modifiers in DataModel `prepareDerivedData()` / getter methods
-   ❌ **STATIC** (avoided): Bake modifiers into pack JSON data

**Why Dynamic?**

1. Works for all items (compendium + user-created)
2. Single source of truth (rules in code, not duplicated in 1000+ JSON files)
3. Easy to update rules (change code once, affects all items)
4. No migration needed when rules change
5. User-created items get modifiers automatically

**Why Not Static?**

1. Requires migration scripts for every rules change
2. User-created items need separate handling
3. Pack data becomes harder to maintain
4. Duplication of logic (pack script + sheet display)

## Architecture

### Layer 1: DataModel (Core Logic)

**Location:** `src/module/data/item/{weapon,armour,gear}.mjs`

Each item DataModel implements:

```javascript
/**
 * Get craftsmanship-derived stat modifiers.
 * @type {object}
 */
get craftsmanshipModifiers() {
    // Return modifiers based on craftsmanship + item type
    return {
        toHit: 0,        // WS/BS modifier
        damage: 0,       // Damage bonus
        armour: 0,       // Armour points bonus
        weight: 1.0,     // Weight multiplier
        // ... other modifiers
    };
}

/**
 * Get effective qualities (base + craftsmanship-derived).
 * @type {Set<string>}
 */
get effectiveSpecial() {
    const qualities = new Set(this.special || []);

    // Add craftsmanship-derived qualities
    // e.g., Poor ranged weapons get "unreliable"

    return qualities;
}

/**
 * Get effective damage (base + craftsmanship + modifications).
 * @type {string}
 */
get effectiveDamageFormula() {
    const base = this.damage.bonus || 0;
    const craft = this.craftsmanshipModifiers.damage;
    const mods = this._modificationModifiers?.damage ?? 0;

    const total = base + craft + mods;
    return `${this.damage.formula}${total > 0 ? '+' : ''}${total}`;
}
```

**Key Points:**

-   Modifiers computed on-demand in getters
-   No stored state (except `_modificationModifiers` for caching)
-   Called during `prepareDerivedData()` or lazily on access
-   Sheet templates use `effective*` getters for display

### Layer 2: CONFIG (Rules Definition)

**Location:** `src/module/config.mjs`

Define craftsmanship rules in a structured way:

```javascript
ROGUE_TRADER.craftsmanshipRules = {
    weapon: {
        melee: {
            poor: { toHit: -10 },
            good: { toHit: +5 },
            best: { toHit: +10, damage: +1 },
        },
        ranged: {
            poor: { qualities: ['unreliable'] },
            good: { qualities: ['reliable'], removeQualities: ['unreliable'] },
            best: { qualities: ['reliable'], removeQualities: ['unreliable', 'overheats'] },
        },
    },
    armour: {
        poor: { armour: -1 },
        good: { armour: +1 },
        best: { armour: +2 },
    },
    gear: {
        poor: { weight: 1.1 },
        good: { weight: 0.9 },
        best: { weight: 0.8 },
    },
};
```

**Benefits:**

-   Centralized rules (easy to audit)
-   Easy to extend (add master-crafted, relic, etc.)
-   Decoupled from implementation (change rules without touching DataModels)

### Layer 3: Helper Utility (Optional)

**Location:** `src/module/helpers/craftsmanship-helper.mjs`

For complex logic shared across item types:

```javascript
export default class CraftsmanshipHelper {
    /**
     * Get craftsmanship modifiers for an item.
     * @param {ItemDataModel} item - Item data model
     * @returns {object} - Modifiers object
     */
    static getModifiers(item) {
        const rules = CONFIG.ROGUE_TRADER.craftsmanshipRules[item.type];
        const craftsmanship = item.craftsmanship;

        if (!rules || !craftsmanship) return {};

        // Return modifiers based on item type + craftsmanship
        return rules[craftsmanship] || {};
    }

    /**
     * Get craftsmanship-derived qualities for weapons.
     * @param {WeaponData} weapon - Weapon data model
     * @returns {Set<string>} - Qualities to add
     */
    static getWeaponQualities(weapon) {
        const isMelee = weapon.melee || weapon.isMeleeWeapon;
        const rules = CONFIG.ROGUE_TRADER.craftsmanshipRules.weapon[isMelee ? 'melee' : 'ranged'];
        const craftsmanshipRules = rules[weapon.craftsmanship];

        return new Set(craftsmanshipRules?.qualities || []);
    }
}
```

## Implementation Plan

### Phase 1: Standardize Weapon Craftsmanship (Current)

-   [x] Weapon DataModel has `craftsmanshipModifiers` getter
-   [x] Weapon DataModel has `effectiveSpecial` getter (adds qualities)
-   [x] `effective*` getters apply craftsmanship modifiers
-   [ ] **FIX**: Poor melee should be -10, not -15
-   [ ] **VERIFY**: All craftsmanship values match rulebook

### Phase 2: Extend to Armour

-   [ ] Armour DataModel: Add `craftsmanshipModifiers` getter
-   [ ] Armour DataModel: Add `effectiveArmourPoints` getter per location
-   [ ] Armour sheet: Display effective armour values

### Phase 3: Extend to Gear

-   [ ] Gear DataModel: Add `craftsmanshipModifiers` getter
-   [ ] Gear DataModel: Apply weight modifier
-   [ ] Gear sheet: Display effective weight

### Phase 4: Centralize Rules (Optional)

-   [ ] Move rules to CONFIG.ROGUE_TRADER.craftsmanshipRules
-   [ ] Create CraftsmanshipHelper utility
-   [ ] Refactor DataModels to use centralized rules

## Current State Analysis

### Weapon DataModel (`weapon.mjs`)

**Lines 254-290: `craftsmanshipModifiers` getter**

-   ✅ Returns `{ toHit, damage, weight }`
-   ✅ Handles melee vs ranged
-   ⚠️ Poor melee: -15 (should be -10 per rulebook?)
-   ⚠️ "Cheap" craftsmanship: Not in CONFIG, custom?
-   ⚠️ "Master-crafted": Not in CONFIG.craftsmanships

**Lines 220-248: `effectiveSpecial` getter**

-   ✅ Adds craftsmanship-derived qualities for ranged weapons
-   ⚠️ Uses custom quality names: `'unreliable-2'`, `'never-jam'`
-   ⚠️ "Cheap" craftsmanship handling

**Lines 305-315: `effectiveDamageFormula` getter**

-   ✅ Applies craftsmanship damage bonus
-   ✅ Applies modification damage bonus
-   ✅ Returns formatted formula string

**Lines 331-335: `effectiveToHit` getter**

-   ✅ Applies craftsmanship to-hit modifier
-   ✅ Applies modification to-hit modifier

### CONFIG.mjs

**Line 59-64: `craftsmanships` object**

```javascript
poor: { label: 'RT.Craftsmanship.Poor', modifier: -10 },
common: { label: 'RT.Craftsmanship.Common', modifier: 0 },
good: { label: 'RT.Craftsmanship.Good', modifier: 5 },
best: { label: 'RT.Craftsmanship.Best', modifier: 10 },
```

**Issues:**

-   ⚠️ No "cheap" or "master-crafted" entries
-   ⚠️ `modifier` field is generic (not clear if it's toHit, damage, armour, etc.)
-   ⚠️ No distinction between melee/ranged/armour rules

**Line 672-698: `weaponQualities` object**

-   ✅ Has `'reliable'`, `'unreliable'`, `'unreliable-2'`
-   ❓ What is `'unreliable-2'`? (not in core rulebook)
-   ❓ What is `'never-jam'`? (not in weaponQualities)

## Questions for Clarification

1. **Craftsmanship Tiers:**

    - Are "cheap" and "master-crafted" official tiers, or custom?
    - Should they be added to CONFIG.craftsmanships?

2. **Poor Melee Penalty:**

    - Rulebook says -10 attack/parry
    - Code has -15
    - Which is correct?

3. **Quality Names:**

    - Is "unreliable-2" a more severe version of "unreliable"?
    - Is "never-jam" a custom quality, or should it be "reliable"?

4. **Best Ranged Weapons:**
    - Rulebook: "Never jam or overheat" (counts as miss)
    - Should this be:
        - A) Add "reliable" quality (existing quality)
        - B) Add custom "never-jam" quality
        - C) Handled in roll logic (not as quality)

## Recommended Approach

### Option A: Minimal Changes (Quick Fix)

1. Fix Poor melee penalty (-15 → -10)
2. Add missing craftsmanship tiers to CONFIG
3. Document which qualities are custom
4. Keep current implementation

**Pros:** Fast, low risk
**Cons:** Technical debt, inconsistency

### Option B: Standardize (Recommended)

1. Audit rulebook for all craftsmanship rules (weapon, armour, gear)
2. Add `craftsmanshipRules` to CONFIG with structured data
3. Refactor DataModels to use centralized rules
4. Use standard quality names only ("reliable" not "never-jam")
5. Document any custom rules clearly

**Pros:** Clean, maintainable, extensible
**Cons:** More work upfront

### Option C: Centralize with Helper

1. Do Option B
2. Create CraftsmanshipHelper utility class
3. DataModels delegate to helper
4. Share logic across weapon/armour/gear

**Pros:** Maximum consistency, easiest to extend
**Cons:** Most work, more abstraction

## Next Steps

1. ✅ Get armour & gear craftsmanship rules from user
2. ✅ Clarify which craftsmanship tiers are official
3. ✅ Clarify custom qualities ("unreliable-2", "never-jam")
4. ⬜ Choose approach (A, B, or C)
5. ⬜ Implement chosen approach
6. ⬜ Test with compendium + user-created items
7. ⬜ Document final system

## Testing Strategy

### Compendium Items

-   [x] Load Poor quality weapon from pack
-   [x] Verify qualities appear (e.g., "unreliable")
-   [x] Verify toHit modifier applied (-10 for melee)
-   [ ] Test Best quality ranged weapon (reliable, never jams)
-   [ ] Test Best quality melee weapon (+10 toHit, +1 damage)

### User-Created Items

-   [ ] Create new Poor quality weapon (not from pack)
-   [ ] Verify modifiers apply automatically
-   [ ] Change craftsmanship field (poor → good → best)
-   [ ] Verify modifiers update in real-time

### Edge Cases

-   [ ] Weapon with existing "unreliable" + Poor craftsmanship (should stack?)
-   [ ] Good weapon with "unreliable" (should cancel out)
-   [ ] Best weapon with "overheats" (should remove it)
-   [ ] Weapon with modifications + craftsmanship (both apply)

## References

-   Rogue Trader Core Rulebook: Weapon Craftsmanship (p. ???)
-   Dark Heresy 2e Core Rulebook: Craftsmanship (p. ???)
-   Current implementation: `src/module/data/item/weapon.mjs:254-290`
-   CONFIG: `src/module/config.mjs:59-64`
