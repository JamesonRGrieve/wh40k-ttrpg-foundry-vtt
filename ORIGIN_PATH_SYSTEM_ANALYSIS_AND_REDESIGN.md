# Origin Path System - Comprehensive Analysis & Redesign Plan

**Date:** 2026-01-12
**Status:** Analysis Complete - Ready for Implementation
**Scope:** Full review and redesign of Origin Path Builder, grants system, and choice tracking

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current System Review](#current-system-review)
3. [Issues Identified](#issues-identified)
4. [Redesign Proposal](#redesign-proposal)
5. [Implementation Plan](#implementation-plan)
6. [Data Migration Strategy](#data-migration-strategy)
7. [Testing Strategy](#testing-strategy)

---

## Executive Summary

The Origin Path system is functional but has several areas for improvement:

### ✅ **What's Working Well**
- **DataModel structure** is solid and follows V13 patterns
- **Grants system** has good foundation with talents, skills, traits, equipment
- **Choice tracking** infrastructure exists with `selectedChoices` and `activeModifiers`
- **Formula system** for wounds/fate is modern and flexible
- **UI builder** has clean ApplicationV2 implementation

### ⚠️ **Critical Issues**
- **Choice grants not fully implemented** - selected choices don't automatically apply their grants
- **No interactive rolling** - wounds/fate formulas evaluate but player can't roll manually
- **Limited UI interactivity** - no tooltips, no inline explanations, no visual feedback
- **Missing "unlock all" mode** - players must follow strict path navigation
- **Incomplete position/stepIndex usage** - chart layout not fully implemented
- **Legacy data coexistence** - old and new fields both present causing confusion

### 🎯 **Goals for Redesign**
1. **Full interactivity** with tooltips, hover states, and explanations
2. **Rolling system** for wounds, fate points, and other starting stats
3. **Working grants from choices** with automatic application
4. **Visual chart navigation** using position/stepIndex data
5. **"Unlock all" toggle** to allow free selection or guided path
6. **Modern, sleek UI** leveraging Foundry V13 features
7. **Remove all legacy code** - clean migration to new structure

---

## Current System Review

### 1. Data Model Structure

**Location:** `src/module/data/item/origin-path.mjs`

#### Schema Overview

```javascript
{
  identifier: IdentifierField,
  step: StringField,        // homeWorld, birthright, etc.
  stepIndex: NumberField,   // 0-5 position in sequence
  position: NumberField,    // 0-8 position in step row
  xpCost: NumberField,      // For advanced origins

  source: {
    book, page, custom
  },

  isAdvancedOrigin: Boolean,
  replacesOrigins: Array<string>,

  requirements: {
    text: String,
    previousSteps: Array<string>,
    excludedSteps: Array<string>
  },

  grants: {
    // Legacy fields (still in use but should migrate)
    wounds: Number,                 // ⚠️ LEGACY
    fateThreshold: Number,          // ⚠️ LEGACY

    // Modern fields
    woundsFormula: String,          // ✅ "2xTB+1d5+2"
    fateFormula: String,            // ✅ "(1-5|=2),(6-10|=3)"

    blessedByEmperor: Boolean,

    skills: [{
      name, specialization, level
    }],

    talents: [{
      name, specialization, uuid
    }],

    traits: [{
      name, level, uuid
    }],

    aptitudes: Array<string>,

    equipment: [{
      name, quantity, uuid
    }],

    specialAbilities: [{
      name, description
    }],

    choices: [{
      type: String,              // talent, skill, characteristic, etc.
      label: String,             // "Choose one talent"
      options: Array<{
        label, value, description,
        grants: { ... }          // ⚠️ NOT AUTOMATICALLY APPLIED
      }>,
      count: Number,             // How many to select
      xpCost: Number
    }]
  },

  modifiers: {
    characteristics: { ... },    // Applied via ModifiersTemplate
    skills: { ... },
    combat: { ... },
    resources: { wounds, fate, insanity, corruption }
  },

  effectText: HTMLField,         // ⚠️ DEPRECATED - use description instead
  notes: StringField,

  selectedChoices: ObjectField,  // ✅ Stores player selections
  activeModifiers: Array         // ⚠️ NOT FULLY IMPLEMENTED
}
```

#### ✅ **Strengths**
- Clean separation between `grants` (what's given) and `modifiers` (stat adjustments)
- Support for both modern formulas and legacy static values
- Flexible choice system structure
- UUID references for compendium items

#### ⚠️ **Issues**
- **`effectText` is deprecated** but still present in many items
- **`activeModifiers` exists but isn't populated** when choices are made
- **Choice `grants` aren't applied** - they're stored in the option but never activate
- **No `rollResults` field** - players can't store rolled wounds/fate values
- **Position data underutilized** - `position` and `stepIndex` could drive visual chart layout

---

### 2. Grants System

**How it currently works:**

1. **Static Grants** (always applied when origin is on character)
   - `grants.skills` → Creates/upgrades skill items
   - `grants.talents` → Creates talent items from UUID
   - `grants.traits` → Creates trait items from UUID
   - `grants.equipment` → Creates equipment items from UUID
   - `modifiers.characteristics` → Adds to base characteristics

2. **Formula Grants** (evaluated when origin is committed)
   - `grants.woundsFormula` → Evaluated using actor's TB
   - `grants.fateFormula` → Evaluated via roll table logic

3. **Choice Grants** (⚠️ NOT WORKING)
   - Choices are displayed in dialog
   - Selections stored in `selectedChoices`
   - BUT: The `grants` inside each option are **never applied**

#### Current Commit Flow

**File:** `src/module/applications/character-creation/origin-path-builder.mjs#commitPath`

```javascript
static async #commitPath() {
  // 1. Remove existing origin path items
  const deleteIds = existingOrigins.map(i => i.id);
  await this.actor.deleteEmbeddedDocuments("Item", deleteIds);

  // 2. Add new origin path items
  const itemDataArray = Array.from(this.selections.values()).map(item => item.toObject());
  const createdItems = await this.actor.createEmbeddedDocuments("Item", itemDataArray);

  // 3. Apply characteristic modifiers to .base
  for (const item of createdItems) {
    const charMods = item.system?.modifiers?.characteristics || {};
    for (const [char, value] of Object.entries(charMods)) {
      charUpdates[`system.characteristics.${char}.base`] = currentBase + value;
    }
  }

  // 4. Evaluate and apply wounds/fate formulas
  if (grants.woundsFormula) {
    const evaluated = evaluateWoundsFormula(grants.woundsFormula, this.actor);
    totalWoundsBonus += evaluated;
  }

  // 5. Apply grants - skills, talents, traits, equipment
  for (const skillGrant of grants.skills || []) {
    // Creates or upgrades skill items
  }

  for (const talentGrant of grants.talents || []) {
    if (talentGrant.uuid) {
      const doc = await fromUuid(talentGrant.uuid);
      grantedItems.push(doc.toObject());
    }
  }

  // ⚠️ MISSING: No processing of grants from selectedChoices!
}
```

#### ⚠️ **Critical Gap: Choice Grants Not Applied**

When a player selects "Jaded" from Death World's choice, the selection is stored:

```javascript
selectedChoices: {
  "Hardened: Choose one": ["jaded"]
}
```

But the talent UUID inside `options[0].grants.talents[0].uuid` is **never fetched or created**!

**What should happen:**
```javascript
// Inside #commitPath, after applying base grants:
for (const choice of item.system.grants.choices) {
  const selected = item.system.selectedChoices[choice.label] || [];

  for (const selectedValue of selected) {
    const option = choice.options.find(opt => opt.value === selectedValue);
    if (!option?.grants) continue;

    // Apply characteristic modifiers from choice
    if (option.grants.characteristics) {
      for (const [char, value] of Object.entries(option.grants.characteristics)) {
        charUpdates[`system.characteristics.${char}.base`] += value;
      }
    }

    // Apply skill grants from choice
    if (option.grants.skills) {
      for (const skillGrant of option.grants.skills) {
        grantedItems.push(/* create skill item */);
      }
    }

    // Apply talent grants from choice
    if (option.grants.talents) {
      for (const talentGrant of option.grants.talents) {
        if (talentGrant.uuid) {
          const doc = await fromUuid(talentGrant.uuid);
          grantedItems.push(doc.toObject());
        }
      }
    }

    // Apply trait grants, equipment grants, etc.
  }
}
```

---

### 3. Choice System

**Current Implementation:**

#### Dialog: `origin-path-choice-dialog.mjs`

- ✅ **Works well** - shows options, tracks selections, validates counts
- ✅ **Returns selected choices** as object: `{ "label": ["value1", "value2"] }`
- ✅ **Supports multi-select** with `count` parameter

#### Builder: `origin-path-builder.mjs#_handleItemWithChoices`

```javascript
async _handleItemWithChoices(item, stepKey) {
  const selectedChoices = await OriginPathChoiceDialog.show(item, this.actor);

  if (!selectedChoices) return; // User cancelled

  // Store selections on item
  const itemData = item.toObject();
  itemData.system.selectedChoices = selectedChoices;

  // ⚠️ ISSUE: activeModifiers is set to empty array, not calculated!
  // This field exists in the schema but is never populated

  if (existingItem) {
    await existingItem.update({ "system.selectedChoices": selectedChoices });
  } else {
    const [createdItem] = await this.actor.createEmbeddedDocuments("Item", [itemData]);
  }
}
```

#### ⚠️ **Missing: Active Modifiers Calculation**

The `activeModifiers` field exists in the schema but is never populated:

```javascript
activeModifiers: new fields.ArrayField(
  new fields.SchemaField({
    source: new fields.StringField({ required: true }),
    type: new fields.StringField({ required: true }),
    key: new fields.StringField({ required: true }),
    value: new fields.NumberField({ required: false })
  }),
  { required: true, initial: [] }
)
```

This should be calculated from `selectedChoices`:

```javascript
// Should happen in _handleItemWithChoices or in DataModel.prepareDerivedData
_calculateActiveModifiers() {
  const activeModifiers = [];

  for (const choice of this.grants.choices) {
    const selected = this.selectedChoices[choice.label] || [];

    for (const selectedValue of selected) {
      const option = choice.options.find(opt => opt.value === selectedValue);
      if (!option?.grants) continue;

      // Extract modifiers from option.grants
      if (option.grants.characteristics) {
        for (const [char, value] of Object.entries(option.grants.characteristics)) {
          activeModifiers.push({
            source: choice.label,
            type: "characteristic",
            key: char,
            value: value
          });
        }
      }

      if (option.grants.talents) {
        for (const talent of option.grants.talents) {
          activeModifiers.push({
            source: choice.label,
            type: "talent",
            key: talent.name,
            value: null
          });
        }
      }

      // ... etc for skills, traits, equipment
    }
  }

  this.activeModifiers = activeModifiers;
}
```

---

### 4. Talents System Integration

**Data Model:** `src/module/data/item/talent.mjs`

#### ✅ **Excellent Integration Points**

Talents have their own `grants` system:

```javascript
grants: {
  skills: [{ name, specialization, level }],
  talents: [{ name, specialization, uuid }],
  traits: [{ name, level, uuid }],
  specialAbilities: [{ name, description }]
}
```

This means:
- A talent granted by an origin can **itself grant more things**
- Talents from choices work exactly like talents from base grants
- UUID-based fetching ensures consistent data

#### Current Usage in Origins

**Example:** Death World grants 3 talents directly:

```json
"grants": {
  "talents": [
    {
      "name": "If It Bleeds, I Can Kill It (Death World)",
      "uuid": "Compendium.rogue-trader.rt-items-talents.DW00000000000002"
    }
  ]
}
```

**Example:** Death World choice grants talent conditionally:

```json
"choices": [{
  "type": "talent",
  "label": "Hardened: Choose one",
  "options": [{
    "label": "Jaded",
    "grants": {
      "talents": [{
        "name": "Jaded",
        "uuid": "Compendium.rogue-trader.rt-items-talents.ldTw7wC9T3dPeOig"
      }]
    }
  }]
}]
```

Both use the **exact same structure** - so the grants system should handle them identically.

#### ⚠️ **Issue: Duplication vs Clarity**

Currently:
- Origins have `grants.talents[]`
- Talents have `grants.talents[]`
- Both can grant skills, traits, special abilities

**Question:** Should we use the existing `grants` structure or introduce origin-specific talent references?

**Answer:** ✅ **Keep unified `grants` structure**
- Simpler to maintain
- Talents granted by origins can themselves grant things
- Consistent with Foundry patterns
- Already working for base grants - just extend to choice grants

---

### 5. UI/UX Current State

**Location:** `src/module/applications/character-creation/origin-path-builder.mjs`

#### ✅ **Good Foundation**
- ApplicationV2 with HandlebarsApplicationMixin
- Drag & drop support
- Clear 6-step visual flow
- Preview panel showing aggregated bonuses
- Import/export functionality
- Randomize feature

#### ⚠️ **Missing/Incomplete**

1. **No Tooltips**
   - Origin items should show tooltip on hover with full description
   - Bonuses should explain what they do
   - Choices should have contextual help

2. **No Visual Chart Navigation**
   - Template shows linear flow (3 top, 3 bottom)
   - But origin paths use a **branching chart structure**
   - `position` and `stepIndex` data exists but isn't used for layout
   - Should show full chart with connections between compatible origins

3. **No Interactive Rolling**
   - Wounds formula like `"2xTB+1d5+2"` is evaluated automatically
   - Player can't see the roll or re-roll
   - No visual feedback showing "You rolled 3 on 1d5!"

4. **No Starting Stats Rolling**
   - Characteristics should be rolled (2d10 per RAW)
   - No UI for this in the builder

5. **No "Unlock All" Mode**
   - Users must follow `requirements.previousSteps` strictly
   - No toggle to say "I just want to pick any 6 I like"
   - Would be useful for experienced players or custom characters

6. **Limited Visual Feedback**
   - No animations when adding/removing origins
   - No highlight when hovering drop zones
   - No validation warnings before commit

7. **Choice Badge but No Inline Editing**
   - Shows "Choices Required" badge
   - But have to re-drop item to make choices
   - Should have "Edit Choices" button on filled slot

---

## Issues Identified

### 🔴 **Critical Issues**

#### 1. Choice Grants Not Applied
**Impact:** HIGH - Players selecting choices don't get the promised abilities

**Current State:**
- Choice selections are stored correctly
- Dialog works perfectly
- But grants inside choice options are ignored during commit

**Fix Required:**
- Extend `#commitPath` to process `selectedChoices`
- Extract grants from selected options
- Apply them exactly like base grants

---

#### 2. Active Modifiers Never Calculated
**Impact:** MEDIUM - Field exists but serves no purpose

**Current State:**
- `activeModifiers` array field is defined in schema
- Never populated anywhere
- Could be useful for debugging/tooltips

**Fix Required:**
- Add `_calculateActiveModifiers()` method to DataModel
- Call in `prepareDerivedData()` or when `selectedChoices` is updated
- Use in UI to show "where did this bonus come from?"

---

#### 3. No Interactive Rolling for Starting Stats
**Impact:** MEDIUM - Players want agency in character creation

**Current State:**
- Formulas evaluate automatically
- No way to roll manually or see the dice

**Fix Required:**
- Add "Roll Wounds" button in builder
- Add "Roll Fate Points" button
- Add "Roll Characteristics" button (2d10 per characteristic)
- Store results in a new field: `rollResults`
- Show dice rolls in chat for transparency

---

### ⚠️ **Medium Issues**

#### 4. Position/StepIndex Underutilized
**Impact:** MEDIUM - Chart navigation not as intended

**Current State:**
- Every origin has `stepIndex` (1-6) and `position` (0-8)
- Builder shows linear 3+3 layout
- Actual origin path is a **branching chart**

**Example from Core Rulebook:**
```
HOME WORLD (step 1, 8 choices)
    Death World (pos 1) → connects to positions 0,1,2 in step 2
    Forge World (pos 2) → connects to positions 1,2,3 in step 2
    ...

BIRTHRIGHT (step 2, 6 choices)
    Scavenger (pos 1) → connects to multiple step 3 options
    ...
```

**Fix Required:**
- Create visual chart layout using CSS Grid
- Position origins based on `position` field
- Draw connection lines between compatible choices
- Highlight valid next steps based on current selection

---

#### 5. No "Unlock All" Toggle
**Impact:** MEDIUM - Limits player freedom

**Current State:**
- `requirements.previousSteps` enforces strict path
- Good for new players following rules
- Restrictive for experienced players or house rules

**Fix Required:**
- Add toggle in toolbar: "Guided Mode" vs "Free Selection"
- In Free Selection mode, ignore requirements
- Still validate that 6 different steps are selected
- Show warning: "You're not following the standard path"

---

#### 6. Limited Tooltips and Help
**Impact:** MEDIUM - New players confused

**Current State:**
- No hover tooltips
- No inline help text
- No explanation of what happens when you pick an origin

**Fix Required:**
- Integrate `RTTooltip` system (already in codebase)
- Add hover states showing full description
- Add "?" icons with expandable help
- Show preview of what you'll get before committing

---

### ℹ️ **Low Issues / Quality of Life**

#### 7. effectText Deprecated But Still Present
**Impact:** LOW - Data cleanup needed

**Current State:**
- Schema has `effectText` field
- Most origins still populate it
- But it's deprecated in favor of `description.value`

**Fix Required:**
- Migration script to move `effectText` → `description.value`
- Remove field from schema
- Update compendium items

---

#### 8. Legacy Wounds/Fate Fields
**Impact:** LOW - Confusion between old and new

**Current State:**
- `grants.wounds` and `grants.fateThreshold` still used
- Modern formulas preferred: `woundsFormula`, `fateFormula`
- Both work but causes confusion

**Fix Required:**
- Migration script to convert static values to formulas
- Keep legacy fields for backwards compatibility
- Warn in console when legacy fields used

---

#### 9. No Validation Before Commit
**Impact:** LOW - Better UX with validation

**Current State:**
- Can commit path with incomplete choices
- Can commit without checking if grants conflict
- No warning about unusual combinations

**Fix Required:**
- Pre-commit validation:
  - All choices complete
  - No duplicate talents/skills
  - XP cost calculated correctly
  - Requirements met (if in guided mode)

---

## Redesign Proposal

### 🎯 **Goals**

1. ✅ **Full Choice Integration** - Selected choices apply their grants automatically
2. ✅ **Interactive Rolling** - Players can roll wounds, fate, characteristics
3. ✅ **Visual Chart Navigation** - See the full origin path chart with connections
4. ✅ **Unlock All Mode** - Toggle between guided and free selection
5. ✅ **Modern UI** - Tooltips, animations, visual feedback
6. ✅ **Clean Data** - Migrate legacy fields, remove deprecated code

---

### 📐 **Enhanced Data Structures**

#### Origin Path Data Model Changes

```javascript
// NEW FIELDS to add to origin-path.mjs
static defineSchema() {
  return {
    ...super.defineSchema(),

    // ===== NEW: Roll Results Storage =====
    rollResults: new fields.SchemaField({
      wounds: new fields.SchemaField({
        formula: new fields.StringField({ required: false, blank: true }),
        rolled: new fields.NumberField({ required: false, initial: null }),
        breakdown: new fields.StringField({ required: false, blank: true }),
        timestamp: new fields.NumberField({ required: false, initial: null })
      }),
      fate: new fields.SchemaField({
        formula: new fields.StringField({ required: false, blank: true }),
        rolled: new fields.NumberField({ required: false, initial: null }),
        breakdown: new fields.StringField({ required: false, blank: true }),
        timestamp: new fields.NumberField({ required: false, initial: null })
      })
    }),

    // ===== ENHANCED: Navigation Metadata =====
    navigation: new fields.SchemaField({
      // Visual layout
      row: new fields.NumberField({ required: true, initial: 0 }), // Derived from stepIndex
      column: new fields.NumberField({ required: true, initial: 0 }), // Same as position

      // Connections - which positions in next step are valid?
      connectsTo: new fields.ArrayField(
        new fields.NumberField({ required: true, min: 0, max: 8 }),
        { required: true, initial: [] }
      ),

      // Visual hints
      isEdgeLeft: new fields.BooleanField({ required: true, initial: false }),
      isEdgeRight: new fields.BooleanField({ required: true, initial: false })
    }),

    // ===== FIX: Active Modifiers with Better Tracking =====
    // (Already exists, just needs population)
    activeModifiers: new fields.ArrayField(
      new fields.SchemaField({
        source: new fields.StringField({ required: true }),  // Which choice
        type: new fields.StringField({ required: true }),    // characteristic/skill/talent/etc
        key: new fields.StringField({ required: true }),     // Identifier
        value: new fields.NumberField({ required: false }),  // Value if applicable
        itemUuid: new fields.StringField({ required: false, blank: true }) // For fetching
      }),
      { required: true, initial: [] }
    )
  };
}
```

#### Origin Path Choice Option Enhanced Structure

**Current:**
```json
{
  "label": "Jaded",
  "value": "jaded",
  "description": "Mundane traumatic events...",
  "grants": {
    "talents": [{ "name": "Jaded", "uuid": "..." }]
  }
}
```

**Enhanced (add tooltip support):**
```json
{
  "label": "Jaded",
  "value": "jaded",
  "description": "Mundane traumatic events do not force you to gain Insanity Points.",
  "longDescription": "<p>Full mechanical description...</p>",
  "tooltip": {
    "title": "Jaded Talent",
    "icon": "fa-brain",
    "mechanics": "No Insanity from mundane events. Warp terrors still affect you.",
    "tags": ["Mental", "Resistance"]
  },
  "grants": {
    "talents": [{ "name": "Jaded", "uuid": "..." }]
  }
}
```

---

### 🎨 **UI/UX Redesign**

#### New Builder Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Origin Path Builder                                    [?][─][×]│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [🎲 Randomize] [↻ Reset]    YOUR JOURNEY    [↓ Export][↑ Import]│
│                                                                 │
│  [ ] Guided Mode  (Follow the chart step by step)              │
│  [×] Free Selection Mode (Choose any origins you like)         │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                   ORIGIN PATH CHART                             │
│                                                                 │
│  ┌─Step 1: HOME WORLD──────────────────────────────────────┐  │
│  │  [Death]  [Forge]  [Hive]  [Imperial]  [Noble]  [Void]   │  │
│  │    ╲        │        │        │          │        ╱      │  │
│  └─────╲───────┼────────┼────────┼──────────┼───────╱───────┘  │
│         ╲      │        │        │          │      ╱            │
│  ┌─Step 2: BIRTHRIGHT──────────────────────╲──────╱─────────┐  │
│  │  [Scav]  [Scap]  [Stub]  [Creed]  [Savant]  [Vaunt]      │  │
│  │                     │                                      │  │
│  └─────────────────────┼──────────────────────────────────────┘ │
│                        │                                         │
│                   (continues for 6 steps)                        │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│               CURRENT SELECTION DETAIL                          │
│                                                                 │
│  [DEATH WORLD] ──────────────────────────────  [👁 View][× Clear]│
│  "Teeming with threats to survival..."                         │
│                                                                 │
│  ✓ Already Granted:                                            │
│    • +5 Strength, +5 Toughness, -5 Willpower, -5 Fellowship   │
│    • Survival (Trained)                                        │
│    • 3 Death World Talents                                     │
│                                                                 │
│  ⚡ Choices Required (1 of 1 complete):                        │
│    ✓ Hardened: Jaded selected                                 │
│       [Edit Choice]                                            │
│                                                                 │
│  🎲 Starting Stats (not yet rolled):                           │
│    Wounds: 2×TB + 1d5 + 2  [🎲 Roll Now!]                     │
│    Fate: Roll 1d10 → (1-5=2pts, 6-10=3pts) [🎲 Roll Now!]     │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                    TOTAL PREVIEW                                │
│                                                                 │
│  Characteristics:  +5 STR, +5 TGH, -5 WP, -5 FEL, +3 WP*      │
│  Wounds: 12 (rolled: TB 4 × 2 + 3 + 2)                        │
│  Fate: 2 points (rolled 4 on 1d10)                            │
│  Skills: Survival, ...                                         │
│  Talents: If It Bleeds, Paranoid, Survivor, Jaded*, ...       │
│            (* = from choices)                                  │
│                                                                 │
│  [✓] All 6 steps selected                                      │
│  [✓] All choices complete                                      │
│  [!] 2 stats need rolling before commit                       │
│                                                                 │
│  [💾 COMMIT TO CHARACTER]                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Key UI Improvements

1. **Chart Visualization**
   - CSS Grid layout based on `stepIndex` and `position`
   - SVG connection lines between valid paths
   - Highlight valid next steps when one is selected
   - Dim/disable incompatible choices in Guided Mode

2. **Interactive Cards**
   - Hover tooltip showing full description
   - Click to view item sheet
   - Drag to slot or drag to reorder
   - Badge indicators: "Choices", "Advanced", "XP Cost"

3. **Choice Management**
   - Inline "Edit Choices" button when item has choices
   - Visual indicator of choices complete/pending
   - Preview what you'll get from each choice

4. **Rolling Interface**
   ```
   ┌─────────────────────────────────────────┐
   │  Roll Starting Wounds                   │
   ├─────────────────────────────────────────┤
   │  Formula: 2×TB + 1d5 + 2                │
   │  Your TB: 4                             │
   │                                         │
   │  Roll: [🎲 Roll 1d5]                   │
   │                                         │
   │  Result: 2×4 + [3] + 2 = 13            │
   │                                         │
   │  [Accept] [Re-roll]                     │
   └─────────────────────────────────────────┘
   ```

5. **Tooltips Everywhere**
   - Characteristics: "What does +5 Strength mean?"
   - Skills: "Survival lets you find food, track, endure harsh conditions"
   - Talents: Full mechanical description
   - Formulas: "This rolls 1d5 and adds it to double your TB"

6. **Mode Toggle**
   - **Guided Mode:**
     - Grays out incompatible choices
     - Shows requirements not met
     - Enforces step order
   - **Free Selection Mode:**
     - All origins available (same step still enforced)
     - Warning badge: "Custom character - not following standard path"
     - Still validates 6 total steps, one per type

---

### ⚙️ **Enhanced Grants System**

#### New: Unified Grant Application

**Create:** `src/module/utils/origin-grants-processor.mjs`

```javascript
/**
 * Centralized processor for origin path grants
 * Handles both base grants and choice grants identically
 */
export class OriginGrantsProcessor {

  /**
   * Process all grants from an origin path item
   * @param {Item} originItem - The origin path item
   * @param {Actor} actor - The character actor
   * @returns {Promise<{
   *   characteristics: Object,
   *   itemsToCreate: Array,
   *   woundsBonus: number,
   *   fateBonus: number
   * }>}
   */
  static async processOriginGrants(originItem, actor) {
    const result = {
      characteristics: {},
      itemsToCreate: [],
      woundsBonus: 0,
      fateBonus: 0
    };

    // 1. Process base modifiers
    await this._processCharacteristicModifiers(originItem, result);

    // 2. Process base grants
    await this._processBaseGrants(originItem, result, actor);

    // 3. Process selected choice grants
    await this._processChoiceGrants(originItem, result, actor);

    return result;
  }

  /**
   * Process characteristic modifiers
   */
  static async _processCharacteristicModifiers(originItem, result) {
    const charMods = originItem.system?.modifiers?.characteristics || {};
    for (const [char, value] of Object.entries(charMods)) {
      if (value !== 0) {
        result.characteristics[char] = (result.characteristics[char] || 0) + value;
      }
    }
  }

  /**
   * Process base grants (always applied)
   */
  static async _processBaseGrants(originItem, result, actor) {
    const grants = originItem.system?.grants || {};

    // Wounds
    if (grants.woundsFormula) {
      result.woundsBonus += await this._evaluateWounds(grants.woundsFormula, actor, originItem);
    } else if (grants.wounds) {
      result.woundsBonus += grants.wounds;
    }

    // Fate
    if (grants.fateFormula) {
      result.fateBonus += await this._evaluateFate(grants.fateFormula, originItem);
    } else if (grants.fateThreshold) {
      result.fateBonus += grants.fateThreshold;
    }

    // Skills
    if (grants.skills) {
      for (const skillGrant of grants.skills) {
        await this._processSkillGrant(skillGrant, result, actor);
      }
    }

    // Talents
    if (grants.talents) {
      for (const talentGrant of grants.talents) {
        await this._processTalentGrant(talentGrant, result);
      }
    }

    // Traits
    if (grants.traits) {
      for (const traitGrant of grants.traits) {
        await this._processTraitGrant(traitGrant, result);
      }
    }

    // Equipment
    if (grants.equipment) {
      for (const equipGrant of grants.equipment) {
        await this._processEquipmentGrant(equipGrant, result);
      }
    }
  }

  /**
   * Process choice grants (from selectedChoices)
   * THIS IS THE CRITICAL NEW FUNCTIONALITY
   */
  static async _processChoiceGrants(originItem, result, actor) {
    const choices = originItem.system?.grants?.choices || [];
    const selectedChoices = originItem.system?.selectedChoices || {};

    for (const choice of choices) {
      const selected = selectedChoices[choice.label] || [];

      for (const selectedValue of selected) {
        // Find the option object
        const option = choice.options.find(opt => opt.value === selectedValue);
        if (!option?.grants) continue;

        // Process option's grants EXACTLY like base grants
        const optionGrants = option.grants;

        // Characteristics from choice
        if (optionGrants.characteristics) {
          for (const [char, value] of Object.entries(optionGrants.characteristics)) {
            result.characteristics[char] = (result.characteristics[char] || 0) + value;
          }
        }

        // Skills from choice
        if (optionGrants.skills) {
          for (const skillGrant of optionGrants.skills) {
            await this._processSkillGrant(skillGrant, result, actor);
          }
        }

        // Talents from choice
        if (optionGrants.talents) {
          for (const talentGrant of optionGrants.talents) {
            await this._processTalentGrant(talentGrant, result);
          }
        }

        // Traits from choice
        if (optionGrants.traits) {
          for (const traitGrant of optionGrants.traits) {
            await this._processTraitGrant(traitGrant, result);
          }
        }

        // Equipment from choice
        if (optionGrants.equipment) {
          for (const equipGrant of optionGrants.equipment) {
            await this._processEquipmentGrant(equipGrant, result);
          }
        }

        // Corruption/Insanity from choice
        if (optionGrants.corruption) {
          // Handle dice rolls like "1d5"
          result.corruptionBonus = (result.corruptionBonus || 0) +
            await this._evaluateDiceFormula(optionGrants.corruption);
        }

        if (optionGrants.insanity) {
          result.insanityBonus = (result.insanityBonus || 0) +
            await this._evaluateDiceFormula(optionGrants.insanity);
        }
      }
    }
  }

  /**
   * Process a single talent grant
   */
  static async _processTalentGrant(talentGrant, result) {
    if (talentGrant.uuid) {
      // Fetch from compendium
      const doc = await fromUuid(talentGrant.uuid);
      if (doc) {
        result.itemsToCreate.push(doc.toObject());
      } else {
        console.warn(`Could not find talent: ${talentGrant.uuid}`);
      }
    } else {
      // Create basic item
      result.itemsToCreate.push({
        type: "talent",
        name: talentGrant.name,
        system: {
          specialization: talentGrant.specialization || ""
        }
      });
    }
  }

  /**
   * Evaluate wounds formula with optional rolling UI
   */
  static async _evaluateWounds(formula, actor, originItem) {
    const storedRoll = originItem.system?.rollResults?.wounds;

    // If already rolled and stored, use that
    if (storedRoll?.rolled !== null && storedRoll?.rolled !== undefined) {
      return storedRoll.rolled;
    }

    // Otherwise evaluate fresh
    const evaluated = evaluateWoundsFormula(formula, actor);
    return evaluated;
  }

  /**
   * Evaluate dice formula like "1d5"
   */
  static async _evaluateDiceFormula(formula) {
    const roll = new Roll(formula);
    await roll.evaluate();
    return roll.total;
  }

  // ... more helper methods
}
```

#### Usage in Builder

```javascript
// In origin-path-builder.mjs
static async #commitPath() {
  // ... existing setup ...

  // Process all grants using unified processor
  let totalCharUpdates = {};
  let allItemsToCreate = [];
  let totalWounds = 0;
  let totalFate = 0;

  for (const item of createdItems) {
    const grants = await OriginGrantsProcessor.processOriginGrants(item, this.actor);

    // Merge characteristics
    for (const [char, value] of Object.entries(grants.characteristics)) {
      totalCharUpdates[char] = (totalCharUpdates[char] || 0) + value;
    }

    // Collect items
    allItemsToCreate.push(...grants.itemsToCreate);

    // Sum bonuses
    totalWounds += grants.woundsBonus;
    totalFate += grants.fateBonus;
  }

  // Apply to actor
  await this._applyCharacteristics(totalCharUpdates);
  await this._applyWoundsAndFate(totalWounds, totalFate);
  await this._createGrantedItems(allItemsToCreate);
}
```

---

### 🎲 **Interactive Rolling System**

#### New: Roll Dialog for Wounds/Fate

**Create:** `src/module/applications/character-creation/origin-roll-dialog.mjs`

```javascript
export default class OriginRollDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    classes: ["rogue-trader", "origin-roll-dialog"],
    window: {
      title: "Roll Starting Stat",
      icon: "fa-dice"
    },
    position: { width: 400, height: "auto" },
    actions: {
      roll: OriginRollDialog.#roll,
      accept: OriginRollDialog.#accept,
      reroll: OriginRollDialog.#reroll
    }
  };

  constructor(type, formula, context, options = {}) {
    super(options);
    this.rollType = type; // "wounds" or "fate"
    this.formula = formula;
    this.context = context; // { actor, originItem }
    this.rollResult = null;
  }

  static async show(type, formula, context) {
    const dialog = new OriginRollDialog(type, formula, context);
    return new Promise(resolve => {
      dialog._resolvePromise = resolve;
      dialog.render(true);
    });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    context.rollType = this.rollType;
    context.formula = this.formula;
    context.description = this._getDescription();
    context.rollResult = this.rollResult;
    context.hasRolled = !!this.rollResult;

    return context;
  }

  static async #roll() {
    // Evaluate the formula
    if (this.rollType === "wounds") {
      this.rollResult = await this._rollWounds();
    } else if (this.rollType === "fate") {
      this.rollResult = await this._rollFate();
    }

    // Send to chat
    await this._postRollToChat();

    await this.render();
  }

  async _rollWounds() {
    const actor = this.context.actor;
    const formula = this.formula; // e.g. "2xTB+1d5+2"

    // Parse formula
    const tb = actor.system.characteristics.toughness.bonus;

    // Replace TB with value
    let diceFormula = formula.replace(/(\d+)xTB/g, (match, multiplier) => {
      return `${multiplier * tb}`;
    });

    // Now we have something like "8+1d5+2"
    // Evaluate the dice part
    const roll = new Roll(diceFormula);
    await roll.evaluate();

    return {
      formula: formula,
      expandedFormula: diceFormula,
      total: roll.total,
      breakdown: this._formatBreakdown(formula, tb, roll),
      roll: roll
    };
  }

  async _rollFate() {
    const formula = this.formula; // e.g. "(1-5|=2),(6-10|=3)"

    // This is a conditional formula
    // Roll 1d10
    const roll = new Roll("1d10");
    await roll.evaluate();
    const value = roll.total;

    // Parse conditions
    const conditions = formula.match(/\((\d+)-(\d+)\|=(\d+)\)/g);
    let result = 0;

    for (const condition of conditions) {
      const [, min, max, outcome] = condition.match(/\((\d+)-(\d+)\|=(\d+)\)/);
      if (value >= parseInt(min) && value <= parseInt(max)) {
        result = parseInt(outcome);
        break;
      }
    }

    return {
      formula: formula,
      rolled: value,
      total: result,
      breakdown: `Rolled ${value} on 1d10 → ${result} Fate Points`,
      roll: roll
    };
  }

  _formatBreakdown(formula, tb, roll) {
    // Create a human-readable breakdown
    // "2×TB + 1d5 + 2 = 2×4 + [3] + 2 = 13"
    let breakdown = formula
      .replace(/(\d+)xTB/g, `$1×${tb}`)
      .replace(/(\d+)d(\d+)/g, (match) => {
        // Find the rolled value from the roll terms
        const term = roll.terms.find(t => t instanceof foundry.dice.terms.Die);
        if (term) {
          return `[${term.total}]`;
        }
        return match;
      });

    return `${breakdown} = ${roll.total}`;
  }

  async _postRollToChat() {
    const templateData = {
      actor: this.context.actor.name,
      origin: this.context.originItem.name,
      type: this.rollType,
      result: this.rollResult
    };

    const html = await renderTemplate(
      "systems/rogue-trader/templates/chat/origin-roll-card.hbs",
      templateData
    );

    await ChatMessage.create({
      content: html,
      speaker: ChatMessage.getSpeaker({ actor: this.context.actor }),
      type: CONST.CHAT_MESSAGE_TYPES.ROLL,
      rolls: [this.rollResult.roll]
    });
  }

  static async #accept() {
    if (this._resolvePromise) {
      this._resolvePromise(this.rollResult);
    }
    this.close();
  }

  static async #reroll() {
    this.rollResult = null;
    await this.#roll.call(this);
  }
}
```

#### Integration with Builder

```javascript
// In origin-path-builder.mjs, add to _prepareSteps()
for (const stepConfig of OriginPathBuilder.STEPS) {
  const item = this.selections.get(stepConfig.step);

  if (item) {
    const needsWoundsRoll = item.system?.grants?.woundsFormula &&
                            !item.system?.rollResults?.wounds?.rolled;
    const needsFateRoll = item.system?.grants?.fateFormula &&
                          !item.system?.rollResults?.fate?.rolled;

    steps.push({
      // ... existing fields ...
      needsWoundsRoll,
      needsFateRoll,
      woundsFormula: item.system?.grants?.woundsFormula,
      fateFormula: item.system?.grants?.fateFormula,
      woundsRolled: item.system?.rollResults?.wounds,
      fateRolled: item.system?.rollResults?.fate
    });
  }
}

// Add action handler
static async #rollStat(event, target) {
  const stepData = target.closest(".origin-step")?.dataset;
  const statType = target.dataset.statType; // "wounds" or "fate"

  const item = this.selections.get(stepData.step);
  if (!item) return;

  const formula = statType === "wounds"
    ? item.system.grants.woundsFormula
    : item.system.grants.fateFormula;

  const result = await OriginRollDialog.show(statType, formula, {
    actor: this.actor,
    originItem: item
  });

  if (result) {
    // Store roll result on item
    await item.update({
      [`system.rollResults.${statType}`]: {
        formula: formula,
        rolled: result.total,
        breakdown: result.breakdown,
        timestamp: Date.now()
      }
    });

    await this.render();
  }
}
```

---

### 📊 **Chart Navigation System**

#### New: Visual Layout Engine

**Create:** `src/module/utils/origin-chart-layout.mjs`

```javascript
/**
 * Computes CSS Grid layout for origin path chart
 * Uses stepIndex and position to arrange origins
 */
export class OriginChartLayout {

  /**
   * Generate layout data for all origins in a step
   * @param {Array<Item>} origins - All origin items for this step
   * @param {string} step - Step identifier
   * @returns {Array<{origin, gridRow, gridColumn, connections}>}
   */
  static computeStepLayout(origins, step) {
    const layout = [];

    for (const origin of origins) {
      const position = origin.system.position || 0;
      const stepIndex = origin.system.stepIndex || 0;

      layout.push({
        origin: origin,
        gridRow: stepIndex + 1, // CSS Grid rows start at 1
        gridColumn: position + 1,
        connections: this._computeConnections(origin, origins)
      });
    }

    return layout;
  }

  /**
   * Compute which positions in the next step this origin connects to
   */
  static _computeConnections(origin, allOrigins) {
    const stepIndex = origin.system.stepIndex;
    const position = origin.system.position;

    // Rule from the book:
    // "Each choice leads to the choice directly below it (or above it),
    //  or a choice adjacent to the one directly below."

    // Connections are: position-1, position, position+1 in next step
    const nextStepIndex = stepIndex + 1;
    const validPositions = [position - 1, position, position + 1].filter(p => p >= 0);

    // Edge handling: edge choices have only two selections beneath them
    const isEdgeLeft = position === 0;
    const isEdgeRight = position === 7; // Assuming max position is 7

    if (isEdgeLeft) {
      return [position, position + 1]; // Can't go left
    } else if (isEdgeRight) {
      return [position - 1, position]; // Can't go right
    } else {
      return validPositions;
    }
  }

  /**
   * Generate SVG paths for connection lines
   * @param {object} fromLayout - Source origin layout
   * @param {Array<object>} toLayouts - Possible next origins
   * @returns {Array<{path, active}>}
   */
  static generateConnectionPaths(fromLayout, toLayouts) {
    const paths = [];

    for (const toLayout of toLayouts) {
      if (fromLayout.connections.includes(toLayout.gridColumn - 1)) {
        const path = this._createSVGPath(fromLayout, toLayout);
        paths.push({
          path: path,
          active: false, // Set to true if this path is selected
          from: fromLayout.origin.id,
          to: toLayout.origin.id
        });
      }
    }

    return paths;
  }

  /**
   * Create an SVG path string from one position to another
   */
  static _createSVGPath(from, to) {
    // Simple quadratic bezier curve
    const x1 = (from.gridColumn - 1) * 150 + 75; // Center of origin card
    const y1 = (from.gridRow - 1) * 200 + 150;
    const x2 = (to.gridColumn - 1) * 150 + 75;
    const y2 = (to.gridRow - 1) * 200 + 50;

    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;

    return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
  }
}
```

#### Template Update for Chart

```handlebars
{{!-- origin-path-chart.hbs --}}
<div class="origin-chart-container">

  {{!-- SVG Layer for Connection Lines --}}
  <svg class="connection-layer" viewBox="0 0 1200 1200">
    <defs>
      <marker id="arrowhead" markerWidth="10" markerHeight="7"
              refX="10" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="var(--rt-color-gold)" />
      </marker>
    </defs>

    {{#each connectionPaths as |conn|}}
      <path d="{{conn.path}}"
            class="connection-path {{#if conn.active}}active{{/if}}"
            stroke="var(--rt-color-gold)"
            stroke-width="2"
            fill="none"
            marker-end="url(#arrowhead)"
            opacity="{{#if conn.active}}1{{else}}0.3{{/if}}" />
    {{/each}}
  </svg>

  {{!-- Grid Layer for Origin Cards --}}
  <div class="origin-grid" style="display: grid; grid-template-columns: repeat(8, 1fr); grid-template-rows: repeat(6, 1fr);">

    {{#each originLayouts as |layout|}}
      <div class="origin-card-wrapper"
           style="grid-row: {{layout.gridRow}}; grid-column: {{layout.gridColumn}};"
           data-origin-id="{{layout.origin.id}}"
           data-step="{{layout.origin.system.step}}"
           data-position="{{layout.origin.system.position}}">

        <div class="origin-card {{#if layout.selected}}selected{{/if}} {{#if layout.disabled}}disabled{{/if}}">
          <img src="{{layout.origin.img}}" alt="{{layout.origin.name}}" />
          <h4>{{layout.origin.name}}</h4>

          {{#if layout.origin.system.xpCost}}
            <div class="xp-badge">{{layout.origin.system.xpCost}} XP</div>
          {{/if}}

          {{#if layout.origin.system.hasChoices}}
            <div class="choice-indicator">
              <i class="fa-solid fa-list-check"></i>
            </div>
          {{/if}}
        </div>

      </div>
    {{/each}}

  </div>

</div>
```

---

## Implementation Plan

### Phase 1: Foundation (Week 1)

#### 1.1 Data Model Enhancements
- [ ] Add `rollResults` field to origin-path.mjs
- [ ] Add `navigation` helper fields (connectsTo, isEdge, etc.)
- [ ] Implement `_calculateActiveModifiers()` in prepareDerivedData
- [ ] Add migration warnings for deprecated fields

#### 1.2 Grants System Refactor
- [ ] Create `OriginGrantsProcessor` utility class
- [ ] Implement `processOriginGrants()` with choice support
- [ ] Move existing `#commitPath` grant logic to processor
- [ ] Add unit tests for grant processing

#### 1.3 Choice Grants Application
- [ ] Update `#commitPath` to use OriginGrantsProcessor
- [ ] Test choice grants for characteristics
- [ ] Test choice grants for talents/skills/traits
- [ ] Test choice grants for corruption/insanity

**Testing:** Create a test character with Death World (has choice), verify Jaded talent is granted.

---

### Phase 2: Interactive Rolling (Week 2)

#### 2.1 Roll Dialog
- [ ] Create `OriginRollDialog` component
- [ ] Implement wounds formula rolling
- [ ] Implement fate formula rolling
- [ ] Create chat card template for rolls
- [ ] Add roll history display

#### 2.2 Builder Integration
- [ ] Add "Roll" buttons to builder UI
- [ ] Store roll results in item's `rollResults`
- [ ] Update preview to show rolled values
- [ ] Add "Re-roll" functionality
- [ ] Validate all rolls before commit

#### 2.3 Characteristic Rolling
- [ ] Add characteristic rolling interface
- [ ] Standard 2d10 per characteristic
- [ ] Support for different rolling methods (point buy, array, etc.)
- [ ] Visual feedback for exceptional rolls

**Testing:** Roll wounds for Death World, verify formula breakdown, store result, commit.

---

### Phase 3: UI/UX Overhaul (Week 3)

#### 3.1 Chart Layout
- [ ] Create `OriginChartLayout` utility
- [ ] Implement CSS Grid layout for chart
- [ ] Add SVG connection paths
- [ ] Implement path highlighting
- [ ] Add selection visual feedback

#### 3.2 Tooltips & Help
- [ ] Integrate RTTooltip system
- [ ] Add tooltips to all origin cards
- [ ] Add hover states with descriptions
- [ ] Add "?" icons with expandable help
- [ ] Add preview tooltips for choices

#### 3.3 Mode Toggle
- [ ] Add "Guided / Free Selection" toggle
- [ ] Implement requirements checking in Guided mode
- [ ] Allow any selection in Free mode
- [ ] Add visual warnings for non-standard paths

#### 3.4 Polish
- [ ] Add animations for adding/removing origins
- [ ] Add transitions for chart navigation
- [ ] Add visual validation before commit
- [ ] Improve mobile responsiveness

**Testing:** Navigate chart visually, test guided vs free mode, verify tooltips.

---

### Phase 4: Data Migration & Cleanup (Week 4)

#### 4.1 Legacy Field Migration
- [ ] Create migration script for `effectText` → `description.value`
- [ ] Create migration script for `wounds` → `woundsFormula`
- [ ] Create migration script for `fateThreshold` → `fateFormula`
- [ ] Run migrations on all compendium packs
- [ ] Update template files

#### 4.2 Code Cleanup
- [ ] Remove deprecated field handling
- [ ] Clean up comments about legacy fields
- [ ] Update documentation
- [ ] Remove unused imports

#### 4.3 Compendium Updates
- [ ] Verify all origin paths have position/stepIndex
- [ ] Add connectsTo metadata where missing
- [ ] Standardize choice structures
- [ ] Add tooltips/descriptions where missing

**Testing:** Import old characters, verify migration, test with new and legacy data.

---

### Phase 5: Testing & Documentation (Week 5)

#### 5.1 Comprehensive Testing
- [ ] Test all 6 steps of origin path
- [ ] Test all choice types (talent, skill, characteristic, etc.)
- [ ] Test all formula types
- [ ] Test guided vs free mode
- [ ] Test drag & drop
- [ ] Test import/export
- [ ] Test randomize

#### 5.2 Edge Cases
- [ ] Test incomplete choices
- [ ] Test invalid UUIDs
- [ ] Test duplicate selections
- [ ] Test advanced origins (XP cost)
- [ ] Test replacesOrigins functionality

#### 5.3 Documentation
- [ ] Update AGENTS.md with new patterns
- [ ] Create user guide for Origin Path Builder
- [ ] Document choice grant structure
- [ ] Document formula syntax
- [ ] Add JSDoc comments

---

## Data Migration Strategy

### Migration Script Structure

```javascript
// scripts/migrate-origin-paths-v2.mjs

/**
 * Migration Tasks:
 * 1. effectText → description.value
 * 2. grants.wounds → grants.woundsFormula (if simple number)
 * 3. grants.fateThreshold → grants.fateFormula (if simple number)
 * 4. Add navigation.connectsTo based on position
 * 5. Standardize choice option structure
 */

async function migrateOriginPath(originDoc) {
  const updates = {};

  // 1. Migrate effectText
  if (originDoc.system.effectText && !originDoc.system.description?.value) {
    updates["system.description.value"] = originDoc.system.effectText;
    updates["system.effectText"] = ""; // Clear after migration
  }

  // 2. Migrate wounds
  if (originDoc.system.grants?.wounds && !originDoc.system.grants?.woundsFormula) {
    const value = originDoc.system.grants.wounds;
    updates["system.grants.woundsFormula"] = `${value}`; // Simple formula
    console.log(`Migrated ${originDoc.name}: wounds ${value} → formula "${value}"`);
  }

  // 3. Migrate fate
  if (originDoc.system.grants?.fateThreshold && !originDoc.system.grants?.fateFormula) {
    const value = originDoc.system.grants.fateThreshold;
    updates["system.grants.fateFormula"] = `${value}`;
    console.log(`Migrated ${originDoc.name}: fateThreshold ${value} → formula "${value}"`);
  }

  // 4. Add navigation connections
  if (!originDoc.system.navigation?.connectsTo) {
    const connectsTo = computeConnections(
      originDoc.system.position,
      originDoc.system.stepIndex
    );
    updates["system.navigation.connectsTo"] = connectsTo;
  }

  // Apply updates
  if (Object.keys(updates).length > 0) {
    await originDoc.update(updates);
    return true;
  }

  return false;
}

function computeConnections(position, stepIndex) {
  // Edge handling
  if (position === 0) return [0, 1];
  if (position >= 7) return [position - 1, position];
  return [position - 1, position, position + 1];
}

// Run migration
const pack = game.packs.get("rogue-trader.rt-items-origin-path");
const documents = await pack.getDocuments();

let migratedCount = 0;
for (const doc of documents) {
  const migrated = await migrateOriginPath(doc);
  if (migrated) migratedCount++;
}

console.log(`Migrated ${migratedCount} of ${documents.length} origin paths.`);
```

### Backwards Compatibility

**Keep legacy fields for 1 version:**
- `effectText` - warn if used, but still render
- `grants.wounds` - warn if used, but still apply
- `grants.fateThreshold` - warn if used, but still apply

**Remove in next major version:**
- After migration script has run
- After users have had chance to update
- After documentation updated

---

## Testing Strategy

### Unit Tests

```javascript
// tests/origin-grants-processor.test.mjs

describe("OriginGrantsProcessor", () => {
  describe("processOriginGrants", () => {
    it("should process base characteristic modifiers", async () => {
      const origin = createOriginWithCharacteristics({ strength: 5 });
      const actor = createTestActor();

      const result = await OriginGrantsProcessor.processOriginGrants(origin, actor);

      expect(result.characteristics.strength).to.equal(5);
    });

    it("should process talent grants from choices", async () => {
      const origin = createOriginWithChoice({
        type: "talent",
        options: [{
          value: "jaded",
          grants: {
            talents: [{ name: "Jaded", uuid: "..." }]
          }
        }]
      });
      origin.system.selectedChoices = { "Choose talent": ["jaded"] };

      const result = await OriginGrantsProcessor.processOriginGrants(origin, actor);

      expect(result.itemsToCreate).to.have.lengthOf(1);
      expect(result.itemsToCreate[0].name).to.equal("Jaded");
    });

    it("should evaluate wounds formulas correctly", async () => {
      const origin = createOriginWithWoundsFormula("2xTB+1d5+2");
      const actor = createTestActor({ toughnessBonus: 4 });

      const result = await OriginGrantsProcessor.processOriginGrants(origin, actor);

      // 2×4 + (1-5) + 2 = 11-15
      expect(result.woundsBonus).to.be.within(11, 15);
    });
  });
});
```

### Integration Tests

```javascript
// tests/integration/origin-path-builder.test.mjs

describe("Origin Path Builder", () => {
  it("should commit full path with choices", async () => {
    const actor = createTestActor();
    const builder = new OriginPathBuilder(actor);

    // Select Death World
    const deathWorld = await getOrigin("death-world");
    await builder._setSelection("homeWorld", deathWorld);

    // Make choice: Jaded
    await builder._handleItemWithChoices(deathWorld, "homeWorld");
    // (Dialog would show here in real usage)
    deathWorld.system.selectedChoices = { "Hardened: Choose one": ["jaded"] };

    // Select remaining 5 steps
    // ...

    // Commit
    await builder.#commitPath();

    // Verify character has Death World item
    expect(actor.items.find(i => i.name === "Death World")).to.exist;

    // Verify characteristics applied
    expect(actor.system.characteristics.strength.base).to.equal(25); // 20 base + 5 from DW

    // Verify Jaded talent granted
    expect(actor.items.find(i => i.name === "Jaded")).to.exist;
  });
});
```

---

## Success Criteria

### Must Have (MVP)

- [x] Choice grants are applied correctly
- [x] Active modifiers are calculated
- [x] Interactive rolling for wounds/fate
- [x] Basic tooltips on origins
- [x] Guided mode enforces requirements
- [x] Free selection mode allows any choice
- [x] All legacy data migrated

### Should Have

- [x] Visual chart layout with connections
- [x] Animated transitions
- [x] Roll history in chat
- [x] Validation before commit
- [x] Mobile responsive design

### Nice to Have

- [ ] Characteristic rolling built-in
- [ ] Alternative rolling methods (point buy, array)
- [ ] Path recommendations based on career
- [ ] "Undo" functionality
- [ ] Auto-save selections

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Breaking existing characters** | HIGH | Thorough migration testing, backwards compatibility for 1 version |
| **Performance with full chart** | MEDIUM | Lazy rendering, virtualization for large datasets |
| **Complex choice structures** | MEDIUM | Comprehensive test suite, clear documentation |
| **Formula evaluation edge cases** | MEDIUM | Robust parser with error handling |
| **Mobile UI complexity** | LOW | Progressive enhancement, simplified mobile view |

---

## Next Steps

1. ✅ **Review this document** with stakeholders
2. **Approve scope** and timeline
3. **Begin Phase 1** - Foundation work
4. **Weekly check-ins** to track progress
5. **User testing** after Phase 3
6. **Release** after Phase 5 complete

---

## Appendix

### A. Example Data Structures

#### Enhanced Origin Path Item

```json
{
  "name": "Death World",
  "type": "originPath",
  "system": {
    "step": "homeWorld",
    "stepIndex": 1,
    "position": 1,

    "navigation": {
      "connectsTo": [0, 1, 2],
      "isEdgeLeft": false,
      "isEdgeRight": false
    },

    "grants": {
      "woundsFormula": "2xTB+1d5+2",
      "fateFormula": "(1-5|=2),(6-10|=3)",
      "skills": [...],
      "talents": [...],
      "choices": [
        {
          "type": "talent",
          "label": "Hardened: Choose one",
          "options": [
            {
              "label": "Jaded",
              "value": "jaded",
              "description": "Mundane traumas don't affect you.",
              "tooltip": {
                "title": "Jaded Talent",
                "mechanics": "No Insanity Points from mundane events.",
                "tags": ["Mental", "Resistance"]
              },
              "grants": {
                "talents": [{
                  "name": "Jaded",
                  "uuid": "Compendium.rogue-trader.rt-items-talents.ldTw7wC9T3dPeOig"
                }]
              }
            }
          ],
          "count": 1
        }
      ]
    },

    "modifiers": {
      "characteristics": {
        "strength": 5,
        "toughness": 5,
        "willpower": -5,
        "fellowship": -5
      }
    },

    "selectedChoices": {
      "Hardened: Choose one": ["jaded"]
    },

    "activeModifiers": [
      {
        "source": "Hardened: Choose one",
        "type": "talent",
        "key": "jaded",
        "itemUuid": "Compendium.rogue-trader.rt-items-talents.ldTw7wC9T3dPeOig"
      }
    ],

    "rollResults": {
      "wounds": {
        "formula": "2xTB+1d5+2",
        "rolled": 13,
        "breakdown": "2×4 + [3] + 2 = 13",
        "timestamp": 1673989234567
      },
      "fate": {
        "formula": "(1-5|=2),(6-10|=3)",
        "rolled": 2,
        "breakdown": "Rolled 4 on 1d10 → 2 Fate Points",
        "timestamp": 1673989245678
      }
    }
  }
}
```

---

### B. Formula Syntax Reference

#### Wounds Formulas

| Formula | Meaning | Example Result (TB 4) |
|---------|---------|----------------------|
| `"2xTB+1d5+2"` | 2 times TB, plus 1d5, plus 2 | 2×4 + 3 + 2 = 13 |
| `"TB+1d5"` | TB plus 1d5 | 4 + 3 = 7 |
| `"1d5+5"` | Just dice, no TB | 3 + 5 = 8 |

#### Fate Formulas

| Formula | Meaning |
|---------|---------|
| `"(1-5|=2),(6-10|=3)"` | Roll 1d10: 1-5 gives 2 fate, 6-10 gives 3 fate |
| `"3"` | Always 3 fate points (static) |

---

### C. References

- **Rogue Trader Core Rulebook** - Pages 18-35 (Origin Path rules)
- **Into The Storm** - Pages 10-28 (Advanced origins)
- **Foundry V13 API** - ApplicationV2, DataModel patterns
- **AGENTS.md** - System architecture reference
- **Current Codebase** - origin-path.mjs, origin-path-builder.mjs

---

**END OF DOCUMENT**
