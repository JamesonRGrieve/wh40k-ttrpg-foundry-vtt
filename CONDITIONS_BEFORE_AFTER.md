# CONDITIONS System - Before & After Comparison

**Visual guide showing the transformation from broken to fixed**

---

## 📦 PACK DATA COMPARISON

### ❌ BEFORE (Current Broken State)

```json
{
  "name": "Stunned",
  "type": "trait",                    // ❌ WRONG TYPE!
  "img": "icons/svg/aura.svg",        // ❌ Generic icon
  "system": {
    "requirements": "-",              // ❌ Trait field (wrong schema)
    "descriptionText": "Attacks...",  // ❌ Legacy field (should be removed)
    "effects": "",                    // ❌ Legacy field (should be removed)
    "source": "Character Actions",    // ❌ String (should be object)
    "description": {
      "value": "<p>Attacks +20</p>"
    },
    "severity": 1,                    // ❌ Not in trait schema!
    "stackable": false,               // ❌ Not in trait schema!
    "modifiers": {
      "characteristics": {},
      "skills": {},
      "combat": {}
    },
    "autoRemove": false               // ❌ Not in ANY schema!
  },
  "effects": [],
  "flags": {
    "rt": {
      "kind": "condition",            // ❌ Hack to identify as condition
      "appliesTo": "target"           // ❌ Not standardized
    }
  },
  "_id": "t5wkuApqsrmTeadP"
}
```

**Problems**:
- Uses `TraitData` schema but has non-trait fields
- Missing critical condition fields
- Legacy fields should be removed
- Flag hack instead of proper type
- Source as string instead of object
- No nature classification
- No duration tracking
- No removal instructions

---

### ✅ AFTER (Proper Condition Type)

```json
{
  "name": "Stunned",
  "type": "condition",                // ✅ PROPER TYPE!
  "img": "systems/rogue-trader/assets/icons/conditions/stunned.svg",
  "system": {
    "identifier": "stunned",          // ✅ Kebab-case identifier
    
    "nature": "harmful",              // ✅ NEW: beneficial/harmful/neutral
    
    "effect": "<p>A stunned character loses their next Action. Attacks against stunned targets gain a +20 bonus.</p>",
    
    "removal": "<p>The condition is automatically removed at the start of the character's next turn.</p>",
    
    "stackable": false,               // ✅ PROPER SCHEMA
    "stacks": 1,                      // ✅ Stack count
    
    "appliesTo": "target",            // ✅ NEW: self/target/both/area
    
    "duration": {                     // ✅ NEW: Duration tracking
      "value": 1,
      "units": "rounds"
    },
    
    "description": {
      "value": "<p>Stunned characters are disoriented and unable to act effectively.</p>",
      "source": {                     // ✅ STRUCTURED SOURCE
        "book": "Rogue Trader Core",
        "page": "249",
        "custom": ""
      }
    },
    
    "modifiers": {
      "characteristics": {},
      "skills": {},
      "combat": {}
    },
    
    "notes": ""                       // ✅ GM notes field
  },
  "effects": [],
  "flags": {
    "rt": {
      "generated": true,              // ✅ Generation flag
      "version": "2.0"                // ✅ Version tracking
    }
  },
  "_id": "t5wkuApqsrmTeadP"
}
```

**Fixed**:
- ✅ Proper `condition` type (uses ConditionData)
- ✅ Complete condition schema
- ✅ Nature classification
- ✅ Duration tracking
- ✅ Removal instructions
- ✅ AppliesTo standardized
- ✅ Source as structured object
- ✅ Proper flags (no hack)

---

## 🖥️ SHEET COMPARISON

### ❌ BEFORE (Uses Trait Sheet)

```
┌─────────────────────────────────────────┐
│ [img] Stunned              Level: [ 0 ] │  ← Trait-specific field
├─────────────────────────────────────────┤
│ Requirements: [-----------]              │  ← Trait field (wrong)
│                                          │
│ Effect:                                  │
│ ┌────────────────────────────────────┐  │
│ │ [ProseMirror Editor]               │  │
│ └────────────────────────────────────┘  │
│                                          │
│ Source: [Character Actions and Rules]   │  ← String input (wrong)
└─────────────────────────────────────────┘

Missing:
❌ Nature field
❌ AppliesTo field  
❌ Stackable checkbox
❌ Duration inputs
❌ Removal instructions
❌ Visual badges
```

---

### ✅ AFTER (Condition Sheet)

```
┌───────────────────────────────────────────────────────┐
│ [img] 🔴 HARMFUL  Stunned                             │  ← Nature badge
│       🎯 TARGET                           [×1 stacks] │  ← AppliesTo badge
├───────────────────────────────────────────────────────┤
│                                                       │
│ Nature: [Harmful ▼]           AppliesTo: [Target ▼] │
│                                                       │
│ ☐ Stackable     Stacks: [1]                         │
│                                                       │
│ Duration: [1] [Rounds ▼]                             │
│                                                       │
├───────────────────────────────────────────────────────┤
│ Effect:                                               │
│ ┌─────────────────────────────────────────────────┐  │
│ │ A stunned character loses their next Action.    │  │
│ │ Attacks against stunned targets gain +20.       │  │
│ └─────────────────────────────────────────────────┘  │
│                                                       │
│ Removal:                                              │
│ ┌─────────────────────────────────────────────────┐  │
│ │ Removed at the start of the character's next    │  │
│ │ turn.                                            │  │
│ └─────────────────────────────────────────────────┘  │
│                                                       │
│ Notes: [Additional notes...]                         │
│                                                       │
├───────────────────────────────────────────────────────┤
│ Source:                                               │
│ Book: [Rogue Trader Core]  Page: [249]              │
│ Custom: [Additional reference...]                    │
└───────────────────────────────────────────────────────┘

Features:
✅ Nature select with visual badge
✅ AppliesTo select with icon badge
✅ Stackable checkbox + count input
✅ Duration tracking (value + units)
✅ Removal instructions (ProseMirror)
✅ Structured source panel
✅ Visual indicators in header
```

---

## 💬 CHAT CARD COMPARISON

### ❌ BEFORE (Generic/Broken)

```
┌──────────────────────────────┐
│ Stunned                      │
│ Trait                        │
├──────────────────────────────┤
│ [Object object]              │  ← "Object [object]" error!
│                              │
│ Description:                 │
│ Attacks against stunned      │
│ targets: +20                 │
└──────────────────────────────┘

Problems:
❌ Shows as "Trait" (wrong type)
❌ "Object [object]" display errors
❌ No visual distinction
❌ No nature indicator
❌ No metadata (applies, duration)
```

---

### ✅ AFTER (Rich Condition Card)

```
┌─────────────────────────────────────────┐
│ 🔴 HARMFUL CONDITION                    │  ← Color-coded header
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                         │
│  🛡️ STUNNED                             │  ← Condition icon + name
│  Harmful Condition                      │  ← Subtitle
│                                         │
├─────────────────────────────────────────┤
│ 🎯 Target  ⏱️ 1 Round                   │  ← Meta badges
├─────────────────────────────────────────┤
│ Effect                                  │
│ ┌───────────────────────────────────┐   │
│ │ A stunned character loses their   │   │
│ │ next Action. Attacks against      │   │
│ │ stunned targets gain a +20 bonus. │   │
│ └───────────────────────────────────┘   │
│                                         │
│ Removal                                 │
│ ┌───────────────────────────────────┐   │
│ │ Automatically removed at the      │   │
│ │ start of the character's next     │   │
│ │ turn.                              │   │
│ └───────────────────────────────────┘   │
│                                         │
├─────────────────────────────────────────┤
│ Rogue Trader Core, pg. 249             │  ← Source footer
└─────────────────────────────────────────┘

Features:
✅ Nature-specific color (red for harmful)
✅ Icon + name prominent
✅ Meta badges (AppliesTo, Duration)
✅ Structured effect/removal sections
✅ Source reference footer
✅ No display errors
```

---

## 🎨 VISUAL BADGES COMPARISON

### ❌ BEFORE (None)

No badges, no visual indicators, no color coding.

---

### ✅ AFTER (Rich Badges)

#### Nature Badges

```
┌─────────────┬─────────────┬─────────────┐
│ 🟢 BENEFICIAL│ 🔴 HARMFUL  │ ⚪ NEUTRAL   │
│   Green      │   Red       │   Gray      │
│ fa-plus-     │ fa-excla-   │ fa-info-    │
│ circle       │ mation-     │ circle      │
│              │ triangle    │             │
└─────────────┴─────────────┴─────────────┘
```

#### AppliesTo Badges

```
┌────────────┬────────────┬────────────┬────────────┐
│ 🔵 SELF    │ 🔴 TARGET  │ 🟣 BOTH    │ 🟠 AREA    │
│   Blue     │   Red      │   Purple   │   Orange   │
│ fa-user    │ fa-cross-  │ fa-users   │ fa-circle- │
│            │ hairs      │            │ notch      │
└────────────┴────────────┴────────────┴────────────┘
```

#### Stack Badges

```
Stackable Conditions:
[×1] [×2] [×3] [×4] [×5]
 ↑    ↑    ↑    ↑    ↑
Gray Green Yellow Orange Red
```

#### Duration Badges

```
Temporary Conditions:
⏱️ 1 Round
⏱️ 5 Rounds
⏱️ 10 Minutes
⏱️ 1 Hour
∞ Permanent
```

---

## 🗂️ COMPENDIUM BROWSER COMPARISON

### ❌ BEFORE

```
┌────────────────────────────────────────┐
│ Type: Trait | Filter: All             │
├────────────────────────────────────────┤
│ Stunned                                │
│ [Object object]                        │  ← Error!
│ Source: Character Actions              │
│                                        │
│ Prone                                  │
│ [Object object]                        │  ← Error!
│ Source: Character Actions              │
└────────────────────────────────────────┘

Problems:
❌ Listed as "Trait" type
❌ "Object [object]" in metadata
❌ No visual distinction
❌ No nature indicator
```

---

### ✅ AFTER

```
┌──────────────────────────────────────────────┐
│ Type: Condition | Nature: All | Filter: All │
├──────────────────────────────────────────────┤
│ 🛡️ Stunned                    🔴 HARMFUL   │
│ 🎯 Target | ⏱️ 1 Round                     │
│ Source: Rogue Trader Core pg. 249          │
│                                            │
│ 🛡️ Prone                      🔴 HARMFUL   │
│ 🔵 Both | ∞ Permanent                      │
│ Source: Rogue Trader Core pg. 249          │
│                                            │
│ ⭐ Inspired                   🟢 BENEFICIAL │
│ 🔵 Self | ∞ Permanent                      │
│ Source: Custom                             │
└──────────────────────────────────────────────┘

Features:
✅ Proper "Condition" type filter
✅ Nature badges (color-coded)
✅ Meta badges (AppliesTo, Duration)
✅ Structured source display
✅ Visual icons for quick identification
```

---

## 📊 SCHEMA COMPARISON TABLE

| Field | Before (Trait) | After (Condition) | Status |
|-------|----------------|-------------------|--------|
| **type** | `"trait"` | `"condition"` | ✅ Fixed |
| **identifier** | ❌ Missing | ✅ `"stunned"` | ✅ Added |
| **requirements** | ❌ Wrong schema | ❌ Removed | ✅ Fixed |
| **descriptionText** | ❌ Legacy | ❌ Removed | ✅ Fixed |
| **effects** | ❌ Legacy | ❌ Removed | ✅ Fixed |
| **source** | ❌ String | ✅ Object | ✅ Fixed |
| **severity** | ❌ Undefined | ❌ Removed | ✅ Fixed |
| **stackable** | ❌ Wrong schema | ✅ Proper | ✅ Fixed |
| **stacks** | ❌ Missing | ✅ `1` | ✅ Added |
| **autoRemove** | ❌ Undefined | ❌ Removed | ✅ Fixed |
| **nature** | ❌ Missing | ✅ `"harmful"` | ✅ Added |
| **effect** | ❌ Missing | ✅ HTML field | ✅ Added |
| **removal** | ❌ Missing | ✅ HTML field | ✅ Added |
| **appliesTo** | ❌ Flag hack | ✅ `"target"` | ✅ Added |
| **duration** | ❌ Missing | ✅ Object | ✅ Added |
| **notes** | ❌ Missing | ✅ String | ✅ Added |

**Result**: 15/15 fields properly structured ✅

---

## 🎯 KEY IMPROVEMENTS SUMMARY

### Structural
- ✅ Proper item type (not trait hack)
- ✅ Correct schema (ConditionData not TraitData)
- ✅ All fields defined in schema
- ✅ No undefined fields
- ✅ No legacy fields

### Data
- ✅ Nature classification (beneficial/harmful/neutral)
- ✅ AppliesTo standardized (self/target/both/area)
- ✅ Duration tracking (value + units)
- ✅ Removal instructions (rich text)
- ✅ Structured source (object not string)
- ✅ Stacking system (count + flag)

### UI/UX
- ✅ Custom condition sheet (not trait sheet)
- ✅ Visual badges (nature, appliesTo, duration)
- ✅ Color-coded chat cards
- ✅ Rich tooltips
- ✅ Compendium browser integration
- ✅ No "Object [object]" errors

### Technical
- ✅ Computed properties with safe fallbacks
- ✅ Complete localization (45+ keys)
- ✅ Modern ApplicationV2 sheet
- ✅ ProseMirror editors
- ✅ SCSS styling with themes
- ✅ Script-based migration

---

**Status**: Ready to implement all 8 phases  
**Reference**: `CONDITIONS_DEEP_DIVE.md` for full implementation details
