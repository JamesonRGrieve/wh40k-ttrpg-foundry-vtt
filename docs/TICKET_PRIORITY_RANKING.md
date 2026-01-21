# Rogue Trader VTT - Ticket Priority Ranking

## Session Date

2026-01-20

## Overview

This document provides a recommended completion order for all open feature tickets, organized by priority tier and dependencies. The ranking considers:

-   **User Impact** - How much this affects gameplay
-   **Foundational vs Feature** - Building blocks vs nice-to-haves
-   **Dependencies** - What needs to be done first
-   **Effort vs Value** - ROI on development time
-   **Completeness** - Getting core systems working before expanding

---

## 🔴 TIER 1: CRITICAL FOUNDATION (Complete First)

These are foundational systems that other features depend on. Must be completed before most other work.

### 1. RogueTraderVTT-4vg - Weapon Qualities: Import and Parse CSV Data

**Priority:** P1  
**Estimated Time:** 15-22 hours (manual, quality by quality)  
**Why First:**

-   Blocks RogueTraderVTT-9rl (quality mechanics)
-   Blocks proper weapon functionality
-   72 qualities affect most combat mechanics
-   Pack data must be validated before implementing mechanics

**Deliverables:**

-   All 72 qualities in CONFIG.weaponQualities
-   Pack data validated and updated
-   Quality identifiers standardized
-   Audit document of which qualities have mechanical effects

**Dependencies:** None (foundation)

---

### 2. RogueTraderVTT-xyj - Weapon Training Talent Integration

**Priority:** P1  
**Estimated Time:** 6-8 hours  
**Why Second:**

-   Core rulebook mechanic (-20 penalty without training)
-   Affects every weapon attack roll
-   System already has requiredTraining field
-   Relatively self-contained implementation

**Deliverables:**

-   Check actor talents for Weapon Training
-   Apply -20 penalty if untrained
-   Display trained/untrained indicator on weapon sheet
-   Handle specialized training (e.g., "Weapon Training (Las)")

**Dependencies:** Talent system (already implemented)

---

### 3. RogueTraderVTT-7jh - Combat Actions System Integration with Items

**Priority:** P1  
**Estimated Time:** 10-15 hours  
**Why Third:**

-   Foundation for proper combat flow
-   Actions directory exists but needs item integration
-   Required for aim, reload, fire modes, etc.
-   Blocks many Category B-E quality implementations

**Deliverables:**

-   Register item usage as actions (half/full)
-   Track action economy per turn
-   Validate action availability
-   Reset actions on turn start

**Dependencies:** Existing actions/ directory structure

---

### 4. RogueTraderVTT-hdm - Strength Bonus Auto-Application to Melee Damage

**Priority:** P1  
**Estimated Time:** 4-6 hours  
**Why Fourth:**

-   Core rulebook mechanic for all melee weapons
-   Currently missing from damage calculations
-   Relatively simple implementation
-   High user visibility (every melee attack)

**Deliverables:**

-   Include actor Strength Bonus in melee damage rolls
-   Include SB for thrown weapons (non-grenades)
-   Update effectiveDamageFormula to consider SB
-   Display SB in damage formula on sheet

**Dependencies:** Actor characteristic access in damage context

---

## 🟠 TIER 2: CORE COMBAT SYSTEMS (Complete Second)

These implement essential combat mechanics that make the game playable.

### 5. RogueTraderVTT-b7j - Righteous Fury / Zealous Hatred System

**Priority:** P1  
**Estimated Time:** 8-12 hours  
**Why Fifth:**

-   Iconic 40K mechanic (critical success on damage)
-   Affects combat excitement and drama
-   Required for Gauss, Vengeful qualities
-   Foundation for critical damage system

**Deliverables:**

-   Detect natural 10 on damage die
-   Confirmation roll on d100
-   Additional d10 damage on confirm
-   Check for critical effects
-   Quality modifiers (Gauss: 9-10, Vengeful: X+)

**Dependencies:** Basic damage roll system (exists)

---

### 6. RogueTraderVTT-9rl - Weapon Qualities: Implement Mechanical Effects (Phase 1)

**Priority:** P1  
**Estimated Time:** 15-20 hours (Category B + Tearing/Melta only)  
**Why Sixth:**

-   Start with simple stat modifiers (Accurate, Balanced, etc.)
-   Add most common damage modifiers (Tearing, Melta)
-   Validates quality handler architecture
-   Builds momentum for complex qualities

**Deliverables (Phase 1 Only):**

-   Category B: Accurate, Balanced, Defensive, Fast, Unbalanced, Unwieldy
-   Category C: Tearing, Melta (most common)
-   Quality handler system architecture
-   Test suite for implemented qualities

**Dependencies:** RogueTraderVTT-4vg (MUST be complete first), RogueTraderVTT-7jh (for Aim action)

---

### 7. RogueTraderVTT-zlo - Weapon Range Brackets and Modifiers

**Priority:** P2  
**Estimated Time:** 6-8 hours  
**Why Seventh:**

-   Core ranged combat mechanic
-   Required for Melta (short range 2x pen)
-   Required for Scatter quality
-   Affects every ranged attack

**Deliverables:**

-   Define range brackets (Point Blank, Short, Standard, Long, Extreme)
-   Calculate range from combat tracker positions
-   Apply automatic modifiers to BS tests
-   Handle Gyro-Stabilised exception

**Dependencies:** Combat tracker for positioning

---

### 8. RogueTraderVTT-b8j - Weapon Rate of Fire (RoF) Action Integration

**Priority:** P1  
**Estimated Time:** 10-15 hours  
**Why Eighth:**

-   Core shooting mechanic (single/semi/full auto)
-   Required for Storm, Twin-Linked qualities
-   Foundation for proper ammo consumption
-   High user visibility

**Deliverables:**

-   Show available fire modes on weapon sheet
-   Select fire mode in attack dialog
-   Apply RoF rules (Semi: +20 hit, Full: spray)
-   Consume correct ammo per mode
-   Handle Storm quality (double RoF)

**Dependencies:** RogueTraderVTT-7jh (action system), RogueTraderVTT-mdh (ammo tracking)

---

### 9. RogueTraderVTT-mdh - Weapon Ammunition Loading and Tracking

**Priority:** P1  
**Estimated Time:** 8-12 hours  
**Why Ninth:**

-   Foundation for ammo-dependent mechanics
-   Required for proper reload system
-   Ammo types can affect weapon stats
-   Currently partially implemented

**Deliverables:**

-   Drag ammo items to weapons
-   Track loaded ammo item (not just count)
-   Apply ammo-specific modifiers
-   Consume ammo on shots
-   Eject/reload ammo

**Dependencies:** Weapon clip system (exists)

---

### 10. RogueTraderVTT-2ac - Weapon Reload Action and Mechanics

**Priority:** P1  
**Estimated Time:** 6-8 hours  
**Why Tenth:**

-   Essential for ranged weapon gameplay
-   Uses existing reload field
-   Integrates with action economy
-   Handles Customised quality

**Deliverables:**

-   Check reload time requirement (half/full/2-full/3-full)
-   Validate action economy
-   Restore clip.value to clip.max
-   Handle Customised quality (half reload time)
-   Track magazines in inventory

**Dependencies:** RogueTraderVTT-7jh (action system), RogueTraderVTT-mdh (ammo tracking)

---

## 🟡 TIER 3: ADVANCED COMBAT MECHANICS (Complete Third)

These add depth and complexity to combat.

### 11. RogueTraderVTT-9rl - Weapon Qualities: Implement Mechanical Effects (Phase 2)

**Priority:** P1  
**Estimated Time:** 20-30 hours (Category D: Blast, Flame, Toxic)  
**Why Eleventh:**

-   Most impactful complex qualities
-   Blast: Essential for grenades/explosives
-   Flame: Common weapon type
-   Establishes AoE/condition patterns

**Deliverables (Phase 2):**

-   Blast(X): AoE targeting and damage
-   Flame: Fire condition and ongoing damage
-   Toxic(X), Shocking: Save tests and conditions
-   Corrosive: AP reduction
-   Active effect integration

**Dependencies:** Active effects system, targeting system, RogueTraderVTT-9rl Phase 1

---

### 12. RogueTraderVTT-61x - Critical Damage and Injury System

**Priority:** P1  
**Estimated Time:** 15-20 hours  
**Why Twelfth:**

-   Essential for lethal combat
-   Makes damage meaningful beyond 0 wounds
-   Uses existing criticalInjury item type
-   Dramatic gameplay moments

**Deliverables:**

-   Critical damage tables (by location and damage type)
-   Roll on table when damage exceeds wounds
-   Create criticalInjury items on actors
-   Apply mechanical effects (penalties, conditions)
-   Different tables per creature type

**Dependencies:** Damage type system (exists), hit location system (exists)

---

### 13. RogueTraderVTT-z3z - Weapon Roll Logic: Poor + Unreliable Jamming

**Priority:** P2  
**Estimated Time:** 3-4 hours  
**Why Thirteenth:**

-   Completes Poor craftsmanship rules
-   Relatively simple implementation
-   Adds risk to poor-quality weapons
-   Low effort, nice flavor

**Deliverables:**

-   Detect Poor craftsmanship + Unreliable combination
-   Jam on any failed attack (not just 91+)
-   Display warning on weapon sheet
-   Integrate with jam/malfunction system

**Dependencies:** Basic jamming system (exists)

---

### 14. RogueTraderVTT-g39 - Weapon Roll Logic: Best Craftsmanship Never Jam/Overheat

**Priority:** P2  
**Estimated Time:** 3-4 hours  
**Why Fourteenth:**

-   Completes Best craftsmanship rules
-   Convert jam/overheat to miss
-   Already indicated by Reliable quality
-   Low effort, nice flavor

**Deliverables:**

-   Detect Best craftsmanship weapons
-   Convert jam results (91+) to misses
-   Convert overheat triggers to misses
-   Display "never jams" indicator

**Dependencies:** Jamming/overheating system

---

### 15. RogueTraderVTT-9rl - Weapon Qualities: Implement Mechanical Effects (Phase 3)

**Priority:** P1-P2  
**Estimated Time:** 15-25 hours (Category E: Storm, Lance, Overcharge, etc.)  
**Why Fifteenth:**

-   Advanced mechanics requiring mature systems
-   Storm/Twin-Linked common but complex
-   Lance: Penetration scaling
-   Requires solid foundation

**Deliverables (Phase 3):**

-   Storm: Double RoF mechanics
-   Twin-Linked: +20 hit, 2x ammo
-   Scatter: Range-dependent modifiers
-   Lance: Penetration per DoS
-   Overcharge, Maximal: Fire mode dialogs
-   Indirect: Spotting and scatter

**Dependencies:** RoF system, Range brackets, Ammo tracking, RogueTraderVTT-9rl Phase 1-2

---

## 🟢 TIER 4: ARMOR & PROTECTION SYSTEMS (Complete Fourth)

Armor and defensive mechanics.

### 16. RogueTraderVTT-zwl - Implement Armour Craftsmanship System

**Priority:** P2  
**Estimated Time:** 6-8 hours  
**Why Sixteenth:**

-   Extends craftsmanship to armor
-   Completes the craftsmanship system
-   Dynamic implementation like weapons
-   Moderate complexity

**Deliverables:**

-   Poor: -10 Agility tests
-   Good: +1 AP on first attack each round
-   Best: Half weight, +1 AP
-   Extend ArmourData DataModel
-   Update armor sheet display

**Dependencies:** Weapon craftsmanship pattern (complete)

---

### 17. RogueTraderVTT-fqh - Good Armour First Attack +1 AP Mechanic

**Priority:** P2  
**Estimated Time:** 5-7 hours  
**Why Seventeenth:**

-   Implements Good armor special rule
-   Requires combat round tracking
-   Moderate complexity
-   Interesting tactical decision

**Deliverables:**

-   Track first attack per round per actor
-   Apply +1 AP to all locations on first attack
-   Reset counter each round
-   Display status on actor sheet

**Dependencies:** RogueTraderVTT-zwl, Combat tracker integration

---

### 18. RogueTraderVTT-0a8 - Armour Concealment/Silent Move Penalties

**Priority:** P2  
**Estimated Time:** 4-5 hours  
**Why Eighteenth:**

-   Armor trade-off mechanic
-   Simple stat penalty
-   Adds tactical depth
-   Low complexity

**Deliverables:**

-   Check if any armor location AP > 7
-   Flag for -30 penalty
-   Apply to Concealment/Stealth (Silent Move) tests
-   Display penalty indicator on sheet

**Dependencies:** RogueTraderVTT-zwl (armor system)

---

### 19. RogueTraderVTT-mop - Primitive Armour vs Non-Primitive Weapons

**Priority:** P2  
**Estimated Time:** 4-6 hours  
**Why Nineteenth:**

-   Primitive equipment rules
-   Affects damage calculation
-   Relatively simple logic
-   Niche but important

**Deliverables:**

-   Add primitive flag to armor
-   Check weapon vs armor primitive status
-   Halve armor AP if primitive vs non-primitive (round up)
-   Define primitive weapon types

**Dependencies:** Damage calculation system

---

### 20. RogueTraderVTT-g4d - Force Field Protection Roll System

**Priority:** P2  
**Estimated Time:** 8-12 hours  
**Why Twentieth:**

-   Unique protection mechanic
-   Dialog/automation for protection roll
-   Foundation for overload system
-   Moderate complexity

**Deliverables:**

-   d100 protection roll dialog
-   If roll <= Protection Value, negate attack
-   Track overload status
-   Display force field status on sheet

**Dependencies:** Damage flow integration

---

### 21. RogueTraderVTT-b1z - Force Field Overload and Recharge System

**Priority:** P2  
**Estimated Time:** 6-8 hours  
**Why Twenty-First:**

-   Completes force field mechanics
-   Overload ranges by craftsmanship
-   Recharge actions (Luminen Charge, Tech-Use)
-   Moderate complexity

**Deliverables:**

-   Check protection roll vs overload range
-   Overloaded shields inactive until recharged
-   Luminen Charge Talent instant recharge
-   -30 Tech-Use Test action recharge
-   Display overload status

**Dependencies:** RogueTraderVTT-g4d (protection system), RogueTraderVTT-1ki (craftsmanship overload ranges)

---

### 22. RogueTraderVTT-1ki - Implement Force Field Craftsmanship (Overload Values)

**Priority:** P3  
**Estimated Time:** 3-4 hours  
**Why Twenty-Second:**

-   Data definition for overload ranges
-   Simple config addition
-   Completes force field craftsmanship

**Deliverables:**

-   Poor: 01-20 overload
-   Common: 01-10 overload
-   Good: 01-05 overload
-   Best: 01 overload (1% chance)
-   Implement in ForceFieldData

**Dependencies:** Force field system foundation

---

## 🔵 TIER 5: POLISH & REFINEMENT (Complete Fifth)

Quality of life, edge cases, and polish.

### 23. RogueTraderVTT-99m - Weapon Modification: Validation and Restrictions UI

**Priority:** P2  
**Estimated Time:** 4-6 hours  
**Why Twenty-Third:**

-   UX improvement for existing system
-   Visual feedback for drop zones
-   Category icons for modifications
-   Polish work

**Deliverables:**

-   Show compatible modification types before drop
-   Modification slot indicators
-   Drop zone visual acceptance criteria
-   Category icons (scope, barrel, stock)

**Dependencies:** Existing modification system (complete)

---

### 24. RogueTraderVTT-uhs - Weapon Qualities: Display in Tooltips/Chat

**Priority:** P2  
**Estimated Time:** 5-7 hours  
**Why Twenty-Fourth:**

-   Enhances quality visibility
-   Uses existing TooltipMixin
-   Shows mechanical effects to players
-   Polish work

**Deliverables:**

-   Rich tooltips on quality badges
-   Full descriptions from CSV
-   Mechanical effect details
-   Source rulebook references

**Dependencies:** RogueTraderVTT-4vg (quality CONFIG complete)

---

### 25. RogueTraderVTT-9rl - Weapon Qualities: Implement Mechanical Effects (Phase 4)

**Priority:** P2-P3  
**Estimated Time:** 10-15 hours (Category F: Exotic qualities)  
**Why Twenty-Fifth:**

-   Rare/niche qualities
-   Complex special cases
-   Force, Warp Weapon, Witch-Edge
-   Lower priority due to rarity

**Deliverables (Phase 4):**

-   Force: Psyker Psy Rating bonus
-   Warp Weapon: Ignore non-warded armor
-   Witch-Edge: Eldar Strength Bonus modifier
-   Gauss/Vengeful: RF threshold modifiers
-   Daemonbane: vs Daemon bonuses

**Dependencies:** Psyker system, Actor type detection, RogueTraderVTT-b7j

---

## 🟣 TIER 6: ADVANCED FEATURES (Complete Sixth)

Nice-to-haves and advanced systems.

### 26. RogueTraderVTT-aue - Implement Gear Craftsmanship System

**Priority:** P3  
**Estimated Time:** 4-6 hours  
**Why Twenty-Sixth:**

-   Completes craftsmanship across all items
-   Mostly flavor/weight modifiers
-   Lower gameplay impact
-   Nice to have

**Deliverables:**

-   Define specific rules for gear
-   Poor: Weight penalty, functionality issues
-   Good: Weight reduction, improved function
-   Best: Significant weight reduction, superior performance
-   Implement in GearData DataModel

**Dependencies:** Craftsmanship pattern established

---

### 27. RogueTraderVTT-p0f - Astartes Weapon Craftsmanship (Exceptional/Master)

**Priority:** P3  
**Estimated Time:** 5-7 hours  
**Why Twenty-Seventh:**

-   Space Marine specific rules
-   Niche weapons (Astartes only)
-   Extends craftsmanship system
-   Lower priority due to niche usage

**Deliverables:**

-   Exceptional: Melee (+1 dmg, +5 WS), Ranged (Reliable/cancel Unreliable)
-   Master: Melee (+2 dmg, +10 WS), Ranged (never jam/overheat)
-   Add to CONFIG.craftsmanships
-   Extend weapon craftsmanshipModifiers

**Dependencies:** Weapon craftsmanship system (complete)

---

### 28. RogueTraderVTT-z35 - Centralize Craftsmanship Rules in CONFIG

**Priority:** P3  
**Estimated Time:** 6-8 hours  
**Why Twenty-Eighth:**

-   Refactoring/cleanup work
-   Improves maintainability
-   No new functionality
-   Technical debt reduction

**Deliverables:**

-   Create CONFIG.ROGUE_TRADER.craftsmanshipRules
-   Centralize weapon/armor/gear rules
-   Refactor DataModels to query CONFIG
-   Single source of truth

**Dependencies:** All craftsmanship systems implemented

---

### 29. RogueTraderVTT-38w - Create CraftsmanshipHelper Utility Class

**Priority:** P3  
**Estimated Time:** 4-5 hours  
**Why Twenty-Ninth:**

-   Refactoring/cleanup work
-   Reduces code duplication
-   Helper utility for shared logic
-   Technical improvement

**Deliverables:**

-   Create src/module/helpers/craftsmanship-helper.mjs
-   getModifiers(item), getQualities(item) methods
-   DataModels use helper instead of inline logic
-   Easier to extend

**Dependencies:** RogueTraderVTT-z35 (centralized CONFIG)

---

## Summary: Recommended Completion Order

### Phase 1: Foundation (Weeks 1-3)

1. ✅ RogueTraderVTT-4vg - Weapon Qualities CSV Integration
2. ✅ RogueTraderVTT-xyj - Weapon Training Integration
3. ✅ RogueTraderVTT-7jh - Combat Actions Integration
4. ✅ RogueTraderVTT-hdm - Strength Bonus for Melee

**Deliverable:** Basic weapon combat working with training checks and action economy.

---

### Phase 2: Core Combat (Weeks 4-6)

5. ✅ RogueTraderVTT-b7j - Righteous Fury
6. ✅ RogueTraderVTT-9rl Phase 1 - Simple Quality Mechanics (Tearing, Balanced, etc.)
7. ✅ RogueTraderVTT-zlo - Range Brackets
8. ✅ RogueTraderVTT-b8j - Rate of Fire
9. ✅ RogueTraderVTT-mdh - Ammunition Tracking
10. ✅ RogueTraderVTT-2ac - Reload Actions

**Deliverable:** Full ranged combat system with RoF, ammo, reloading, and basic qualities.

---

### Phase 3: Advanced Combat (Weeks 7-9)

11. ✅ RogueTraderVTT-9rl Phase 2 - Complex Qualities (Blast, Flame, Toxic)
12. ✅ RogueTraderVTT-61x - Critical Damage System
13. ✅ RogueTraderVTT-z3z - Poor Jamming Logic
14. ✅ RogueTraderVTT-g39 - Best Never Jam Logic
15. ✅ RogueTraderVTT-9rl Phase 3 - Advanced Qualities (Storm, Lance, Overcharge)

**Deliverable:** Deep combat with AoE, conditions, criticals, and advanced weapon qualities.

---

### Phase 4: Armor & Protection (Weeks 10-11)

16. ✅ RogueTraderVTT-zwl - Armor Craftsmanship
17. ✅ RogueTraderVTT-fqh - Good Armor +1 AP Mechanic
18. ✅ RogueTraderVTT-0a8 - Armor Concealment Penalties
19. ✅ RogueTraderVTT-mop - Primitive Armor Rules
20. ✅ RogueTraderVTT-g4d - Force Field Protection
21. ✅ RogueTraderVTT-b1z - Force Field Overload
22. ✅ RogueTraderVTT-1ki - Force Field Craftsmanship

**Deliverable:** Complete armor and force field systems.

---

### Phase 5: Polish (Weeks 12-13)

23. ✅ RogueTraderVTT-99m - Modification UI Enhancement
24. ✅ RogueTraderVTT-uhs - Quality Tooltips
25. ✅ RogueTraderVTT-9rl Phase 4 - Exotic Qualities (Force, Warp, etc.)

**Deliverable:** Polished UX and rare quality support.

---

### Phase 6: Advanced Features (Weeks 14+)

26. ✅ RogueTraderVTT-aue - Gear Craftsmanship
27. ✅ RogueTraderVTT-p0f - Astartes Craftsmanship
28. ✅ RogueTraderVTT-z35 - Centralize Craftsmanship CONFIG
29. ✅ RogueTraderVTT-38w - CraftsmanshipHelper Utility

**Deliverable:** Complete system with all edge cases and technical improvements.

---

## Total Estimated Timeline

-   **Foundation:** 3 weeks (35-45 hours)
-   **Core Combat:** 3 weeks (50-70 hours)
-   **Advanced Combat:** 3 weeks (55-75 hours)
-   **Armor Systems:** 2 weeks (35-50 hours)
-   **Polish:** 2 weeks (20-30 hours)
-   **Advanced Features:** 1-2 weeks (20-30 hours)

**TOTAL: 14-15 weeks (215-300 hours)**

---

## Critical Path Dependencies

```
RogueTraderVTT-4vg (CSV Import)
    ↓
RogueTraderVTT-xyj (Training) + RogueTraderVTT-7jh (Actions)
    ↓
RogueTraderVTT-hdm (Strength Bonus) + RogueTraderVTT-b7j (RF)
    ↓
RogueTraderVTT-9rl Phase 1 (Simple Qualities)
    ↓
RogueTraderVTT-zlo (Range) + RogueTraderVTT-b8j (RoF) + RogueTraderVTT-mdh (Ammo)
    ↓
RogueTraderVTT-9rl Phase 2 (Blast/Flame)
    ↓
RogueTraderVTT-61x (Criticals) + RogueTraderVTT-9rl Phase 3 (Advanced)
    ↓
RogueTraderVTT-zwl (Armor) → RogueTraderVTT-fqh/0a8/mop/g4d/b1z (Armor features)
    ↓
Polish & Advanced Features (parallel, no blockers)
```

---

## Notes

-   This ranking assumes one developer working sequentially
-   Parallel work possible if multiple developers
-   Some tickets can be broken into smaller sub-tickets
-   Testing should happen continuously, not just at end
-   User feedback may shift priorities after Phase 2-3
