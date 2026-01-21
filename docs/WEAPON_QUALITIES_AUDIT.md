# Weapon Qualities Audit and Categorization

## Overview

Categorization of all 72 weapon qualities from CSV by implementation complexity.

## Category A - Display Only (Informational/Flavor)

**No mechanical effects, just need CONFIG + tooltips**

1. **SM Wep** - Designed for Space Marines (flavor)
2. **Integrated Weapon** - Weapon attached to user (flavor)
3. **Ogryn-Proof** - Characters with Clumsy trait can use without penalty
4. **Sanctified** - Weapon damage counts as "Holy" (context-dependent)
5. **Tainted** - Weapon bears the Mark of Chaos (flavor)
6. **Daemon Wep** - Contains imprisoned daemon (requires Daemonic Mastery test)
7. **Rune Wep** - Daemon weapon survived daemon escaping (flavor)
8. **Rune Wep (alt.)** - Alternative description (duplicate entry)
9. **Necron Wep** - Special when not used by Necron

**Count: 9 qualities**
**Effort: 1-2 hours**

---

## Category B - Simple Stat Modifiers

**Basic +/- modifiers to attack/parry tests**

10. **Accurate** - +10 when Aiming
11. **Inaccurate** - Cannot use Aim action
12. **Balanced** - +10 to WS parry tests
13. **Defensive** - +15 to parry tests
14. **Fast** - Enemies suffer -20 to parry this weapon
15. **Unbalanced** - -10 to parry attempts
16. **Unwieldy** - Cannot parry with this weapon
17. **Flexible** - Cannot be parried
18. **Customised** - Half reload time

**Count: 9 qualities**
**Effort: 4-6 hours**
**Dependencies: Aim action, parry system**

---

## Category C - Damage Roll Modifications

**Modify damage dice, min/max values, penetration**

19. **Tearing** - Roll extra d10, drop lowest
20. **Proven(X)** - Damage rolls below X count as X
21. **Primitive(X)** - Damage rolls above X count as X (except RF)
22. **Felling(X)** - Reduce Unnatural Toughness by X
23. **Melta** - Double penetration at short range
24. **Power Field** - +damage/pen in stats, 75% destroy weapon on parry
25. **Razor-Sharp** - Special effect on 3+ DoS

**Count: 7 qualities**
**Effort: 8-12 hours**
**Dependencies: Range system, damage roll system**

---

## Category D - Complex Conditional Effects (Status/AoE)

**Multi-target, area effects, ongoing conditions, save tests**

26. **Blast(X)** - AoE explosion X metres, single damage roll for all in area
27. **Flame** - Target makes WP test or catches fire
28. **Cleansing Fire** - Target makes WP test or catches fire (similar to Flame)
29. **Shocking** - Target makes T test or stunned
30. **Toxic** - Target takes wounds, applies effect
31. **Toxic(X)** - Target makes T test -10\*X or takes additional damage
32. **Corrosive** - Reduce AP by 1d10
33. **Haywire(X)** - Effects X metre radius, damages electronics
34. **Smoke(X)** - Creates X metre smoke screen lasting 1d10+10 rounds
35. **Snare(X)** - Target makes Ag test -10\*X or immobilized
36. **Hallucinogenic(X)** - Target makes T test -10\*X
37. **Concussive(X)** - Target makes T test -10\*X
38. **Crippling(X)** - If target suffers 1+ wound
39. **Decay(X)** - Critical damage causes -10\*X T test or instant death
40. **Irradiated(X)** - When hit by weapon
41. **Devastating(X)** - Reduces horde magnitude by additional X
42. **Graviton** - Special effect when hits

**Count: 17 qualities**
**Effort: 20-30 hours**
**Dependencies: Active effects, AoE targeting, condition tracking, horde rules**

---

## Category E - Advanced Roll Mechanics

**Modifies RoF, ammo, jam mechanics, RF threshold, range effects**

43. **Reliable** - If weapon would jam, counts as miss instead
44. **Unreliable** - Jams on 91+
45. **Overheats** - On 91+ attack roll
46. **Storm** - Double hits and ammo (2 hits per DoS, up to 2x RoF)
47. **Twin-Linked** - +20 to hit, 2x ammo consumption
48. **Scatter** - Point blank +10 hit +3 dmg, long range -3 dmg
49. **Lance** - Increase pen by base pen per DoS after first
50. **Overcharge** - Expend 3x ammo for Concussive(2)
51. **Overcharge(X)** - Increase damage by X
52. **Maximal** - Fire on maximal setting
53. **Recharge** - Cannot fire if fired previous round
54. **Gyro-Stabilised** - Never counts as Extreme range, -20 heavy weapon penalty instead of -30
55. **Indirect** - Fire without LoS with spotter, scatter on hit/miss
56. **Indirect(X)** - Fire without LoS, full action -10, scatter
57. **Reactive** - Fires in straight line, -10 to hit second target within 2m
58. **Spray** - Do not roll BS test when attacking
59. **Gauss** - Righteous Fury on 9-10
60. **Vengeful(X)** - Righteous Fury on X or higher

**Count: 18 qualities**
**Effort: 15-25 hours**
**Dependencies: RoF system, range brackets, ammo tracking, RF system, round tracking**

---

## Category F - Exotic/Unique Mechanics

**Psyker integration, special actor type checks, unique mechanics**

61. **Force** - Counts as Best Mono for non-psykers, adds Psy Rating to pen/damage
62. **Warp Weapon** - Ignores cover and non-warded armour
63. **Witch-Edge** - Adds 2x Strength Bonus (requires "Secret of Seers" talent, Eldar)
64. **Living Ammunition** - Weapon grows/regenerates ammo
65. **Daemonbane** - Special effects vs Daemons
66. **Unstable** - Special effect when weapon hits

**Count: 6 qualities**
**Effort: 10-15 hours**
**Dependencies: Psyker system, actor type detection, special talent checks**

---

## Summary

| Category  | Count  | Description        | Effort     | Priority |
| --------- | ------ | ------------------ | ---------- | -------- |
| A         | 9      | Display Only       | 1-2h       | P3       |
| B         | 9      | Simple Modifiers   | 4-6h       | P2       |
| C         | 7      | Damage Mods        | 8-12h      | P1       |
| D         | 17     | Complex Effects    | 20-30h     | P1       |
| E         | 18     | Advanced Mechanics | 15-25h     | P1       |
| F         | 6      | Exotic             | 10-15h     | P2       |
| **Total** | **66** |                    | **58-90h** |          |

**Note:** CSV shows 72 lines but some are duplicates or header rows. Actual unique qualities: ~66-70.

---

## Phase 1 Scope (This Session)

Focus on foundational work:

1. ✅ Complete audit and categorization (this document)
2. ⬜ Add ALL 72 qualities to CONFIG (with category metadata)
3. ⬜ Add ALL localization keys
4. ⬜ Validate pack data quality identifiers
5. ⬜ Implement Category B qualities (simple modifiers)
6. ⬜ Implement Tearing + Melta from Category C (most common)
7. ⬜ Document implementation status

---

## Notes

### Duplicates/Variants

-   "Rune Wep" appears twice (lines 47 and 72)
-   "Indirect" has two variants (with and without X parameter)
-   "Overcharge" has two variants (Concussive vs damage increase)
-   "Toxic" has two variants (with and without X parameter)

### Missing Details

Some CSV entries have incomplete effect descriptions:

-   Crippling(X), Irradiated(X), Unstable, Graviton, Living Ammunition
-   These need rulebook reference for full mechanical details

### Naming Conventions

Pack data uses various identifier formats:

-   Lowercase with hyphens: "razor-sharp"
-   Lowercase: "tearing"
-   With level suffix: "blast-3", "toxic-2"
-   Need to standardize to kebab-case for all

### Mechanical Complexity Order

For implementation priority within this session:

1. Category B (simple, high frequency)
2. Tearing (Category C, very common)
3. Melta (Category C, common on special weapons)
4. Balanced/Defensive/Fast (Category B, melee combat)
5. Accurate/Inaccurate (Category B, affects aim)
