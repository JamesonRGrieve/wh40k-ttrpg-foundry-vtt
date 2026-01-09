# CONDITIONS System - Analysis Summary

**Date**: 2026-01-09  
**Status**: 🔴 **CRITICALLY BROKEN**  
**Recommendation**: ✅ **FULL REFACTOR REQUIRED**

---

## 🚨 CRITICAL PROBLEMS IDENTIFIED

### 1. **NOT A REAL ITEM TYPE** — Biggest Problem!

Conditions are **traits with a flag hack**:
```javascript
{
  "type": "trait",              // ❌ WRONG!
  "flags": {
    "rt": { "kind": "condition" }  // ❌ Hack to identify them
  }
}
```

**Impact**:
- ❌ Use wrong schema (TraitData instead of ConditionData)
- ❌ Show wrong sheet (trait sheet, not condition sheet)
- ❌ Have undefined fields (severity, stackable, autoRemove)
- ❌ Missing condition-specific fields (nature, effect, removal)
- ❌ User confusion (conditions vs traits)

### 2. **ConditionData EXISTS But Is UNUSED**

File: `src/module/data/item/condition.mjs` — **96 lines, fully implemented, NEVER USED!**

```javascript
// ConditionData is perfectly valid...
export default class ConditionData extends ItemDataModel.mixin(
  DescriptionTemplate,
  ModifiersTemplate
) {
  // Has proper schema: nature, effect, removal, stackable, stacks, notes
  // Has computed properties: natureLabel, fullName
  // Has chat/header methods
}

// ...but conditions use TraitData instead!
{
  "type": "trait",  // ❌ Uses TraitData, ignores ConditionData
}
```

### 3. **Schema Mismatches**

| Field | Pack Has | TraitData Has | ConditionData Has | Status |
|-------|----------|---------------|-------------------|--------|
| `type` | `"trait"` | ✅ | ✅ `"condition"` | ❌ Wrong type |
| `requirements` | ✅ | ✅ | ❌ | ❌ Wrong schema |
| `descriptionText` | ✅ | ❌ Legacy | ❌ Legacy | ❌ Should remove |
| `effects` | ✅ | ❌ Legacy | ❌ Legacy | ❌ Should remove |
| `source` | `string` | ❌ | ❌ | ❌ Should be object |
| `severity` | ✅ | ❌ | ❌ | ❌ Undefined field |
| `stackable` | ✅ | ❌ | ✅ | ❌ Wrong type |
| `autoRemove` | ✅ | ❌ | ❌ | ❌ Undefined field |
| `nature` | ❌ | ❌ | ✅ | ❌ Missing from pack |
| `effect` | ❌ | ❌ | ✅ HTMLField | ❌ Missing from pack |
| `removal` | ❌ | ❌ | ✅ HTMLField | ❌ Missing from pack |
| `stacks` | ❌ | ❌ | ✅ | ❌ Missing from pack |
| `notes` | ❌ | ❌ | ✅ | ❌ Missing from pack |

**Result**: Pack data doesn't match either schema!

### 4. **"Object [object]" Display Issues**

**Root Cause**: `natureLabel` getter calls `game.i18n.localize()` without checking if key exists:

```javascript
// src/module/data/item/condition.mjs:56
get natureLabel() {
  return game.i18n.localize(`RT.Condition.${this.nature.capitalize()}`);
  //     ❌ No game.i18n.has() check!
  //     ❌ Returns object if key doesn't exist!
}
```

**Missing Keys**:
- `RT.Condition.Beneficial` ❌
- `RT.Condition.Harmful` ❌
- `RT.Condition.Neutral` ❌
- All 40+ other `RT.Condition.*` keys ❌

### 5. **No Condition-Specific Sheet**

Conditions use `item-trait-sheet-modern.hbs`:
- ❌ Shows trait fields (level, requirements)
- ❌ Hides condition fields (nature, stackable, removal)
- ❌ No visual distinction from traits
- ❌ No stacking UI

### 6. **Pack Data Is Messy**

All 8 conditions have:
- ❌ Wrong type (`trait` not `condition`)
- ❌ Legacy fields (`descriptionText`, `effects`)
- ❌ Undefined fields (`severity`, `autoRemove`)
- ❌ Missing fields (`nature`, `effect`, `removal`, `duration`)
- ❌ `source` as string (should be object)
- ❌ Generic icon (`icons/svg/aura.svg`)
- ❌ Flag hack (`flags.rt.kind = "condition"`)

---

## 📊 CURRENT PACK INVENTORY

**Location**: `src/packs/rt-items-conditions/_source/`  
**Count**: 8 conditions  
**All Broken**: Yes ❌

| Filename | Name | Problem Summary |
|----------|------|-----------------|
| `concealed_QqoNdgRcW3haCt0J.json` | Concealed | Wrong type, legacy fields, missing nature |
| `fatigued_1Hl4rLyG2M80WJiC.json` | Fatigued | Wrong type, legacy fields, missing nature |
| `grappled_YXbbdp31kNz8uPcL.json` | Grappled | Wrong type, legacy fields, missing nature |
| `helpless_w4AfoJKYXQuJUshP.json` | Helpless | Wrong type, legacy fields, missing nature |
| `pinned_JxjyPOYkTRVSbkhk.json` | Pinned | Wrong type, legacy fields, missing nature |
| `prone_6TAh3wRSkTHVS2zh.json` | Prone | Wrong type, legacy fields, missing nature |
| `stunned_t5wkuApqsrmTeadP.json` | Stunned | Wrong type, legacy fields, missing nature |
| `surprised-unaware_ZMe3DmjXJ9nXVL8W.json` | Surprised/Unaware | Wrong type, legacy fields, missing nature |

---

## ✅ RECOMMENDED SOLUTION

### Make CONDITIONS a Proper Item Type

**Follow Critical Injuries pattern** (already implemented and proven):

1. ✅ **Phase 1**: Update ConditionData with computed properties + safe fallbacks
2. ✅ **Phase 2**: Add `"condition"` to template.json types
3. ✅ **Phase 3**: Create modern condition sheet (ApplicationV2)
4. ✅ **Phase 4**: Migrate 8 pack items (script-based)
5. ✅ **Phase 5**: Generate 6 additional conditions
6. ✅ **Phase 6**: Create chat card template
7. ✅ **Phase 7**: SCSS styling (nature badges, themes)
8. ✅ **Phase 8**: Register sheet in config.mjs

**Total Time**: ~4-5 hours  
**Total Code**: ~1200 lines  
**Localization**: 45+ keys

---

## 🎨 PROPOSED DESIGN

### Nature Classification

Replace trait-style with **3 nature types**:

| Nature | Color | Icon | Examples |
|--------|-------|------|----------|
| **Beneficial** | 🟢 Green | `fa-plus-circle` | Inspired, Blessed |
| **Harmful** | 🔴 Red | `fa-exclamation-triangle` | Stunned, Prone, Fatigued |
| **Neutral** | ⚪ Gray | `fa-info-circle` | Surprised (situational) |

### AppliesTo Classification

Who is affected:

| AppliesTo | Color | Icon | Examples |
|-----------|-------|------|----------|
| **Self** | 🔵 Blue | `fa-user` | Fatigued, Blinded |
| **Target** | 🔴 Red | `fa-crosshairs` | Stunned, Helpless |
| **Both** | 🟣 Purple | `fa-users` | Prone, Grappled |
| **Area** | 🟠 Orange | `fa-circle` | Darkness, Fog |

### Stacking System

```javascript
{
  stackable: true,
  stacks: 3,
  fullName: "Fatigued (×3)"
}
```

### Duration Tracking

```javascript
{
  duration: {
    value: 1,
    units: "rounds"  // rounds|minutes|hours|days|permanent
  }
}
```

---

## 📋 WHAT GETS FIXED

### Before (Current Broken State)

```json
{
  "name": "Stunned",
  "type": "trait",                           // ❌ Wrong!
  "system": {
    "requirements": "-",                     // ❌ Trait field
    "descriptionText": "Attacks: +20",       // ❌ Legacy
    "effects": "",                           // ❌ Legacy
    "source": "Character Actions",           // ❌ String
    "severity": 1,                           // ❌ Undefined
    "stackable": false,                      // ❌ Wrong schema
    "autoRemove": false                      // ❌ Undefined
  },
  "flags": {
    "rt": { "kind": "condition" }            // ❌ Hack
  }
}
```

### After (Proper Condition)

```json
{
  "name": "Stunned",
  "type": "condition",                       // ✅ Correct type!
  "system": {
    "identifier": "stunned",                 // ✅ Proper
    "nature": "harmful",                     // ✅ New field
    "effect": "<p>Attacks: +20...</p>",      // ✅ HTML field
    "removal": "<p>Next turn...</p>",        // ✅ HTML field
    "stackable": false,                      // ✅ Proper schema
    "stacks": 1,                             // ✅ Proper schema
    "appliesTo": "target",                   // ✅ New field
    "duration": {                            // ✅ New field
      "value": 1,
      "units": "rounds"
    },
    "description": {
      "value": "<p>...</p>",
      "source": {                            // ✅ Object
        "book": "Rogue Trader Core",
        "page": "249",
        "custom": ""
      }
    },
    "modifiers": { ... },
    "notes": ""
  },
  "flags": {
    "rt": {
      "generated": true,                     // ✅ Proper flag
      "version": "2.0"
    }
  }
}
```

---

## 🔧 MIGRATION SCRIPT PREVIEW

**File**: `scripts/migrate-conditions.mjs`

```javascript
// Condition metadata (proper schema)
const CONDITIONS = {
  "stunned": {
    nature: "harmful",
    appliesTo: "target",
    effect: "<p>Stunned characters lose their next Action...</p>",
    removal: "<p>Removed at start of next turn...</p>",
    stackable: false,
    duration: { value: 1, units: "rounds" },
    source: { book: "Rogue Trader Core", page: "249", custom: "" }
  },
  // ... 7 more
};

// Transform all 8 conditions from trait → condition
files.forEach(file => {
  const data = JSON.parse(fs.readFileSync(file));
  const identifier = file.split("_")[0];
  
  const updated = {
    name: data.name,
    type: "condition",           // ✅ Change type!
    img: data.img,
    system: {
      identifier: identifier,
      ...CONDITIONS[identifier]  // ✅ Proper schema
    },
    effects: [],
    flags: { rt: { generated: true, version: "2.0" } },
    _id: data._id
  };
  
  fs.writeFileSync(file, JSON.stringify(updated, null, 2));
});
```

**Output**: 8 properly formatted condition files

---

## 🎯 IMPLEMENTATION PHASES

| Phase | Tasks | Files | Status |
|-------|-------|-------|--------|
| **1. Data Model** | Update ConditionData + localization | 2 | 📝 Ready |
| **2. Template.json** | Add condition type + schema | 1 | 📝 Ready |
| **3. Sheet** | Create ConditionSheet + template | 3 | 📝 Ready |
| **4. Migration** | Convert 8 conditions to proper type | 1 script | 📝 Ready |
| **5. Additional** | Generate 6 more conditions | 1 script | 📝 Ready |
| **6. Chat Card** | Create condition chat template | 1 | 📝 Ready |
| **7. SCSS** | Styling (badges, themes, colors) | 2 | 📝 Ready |
| **8. Registration** | Register sheet in config | 1 | 📝 Ready |

**Total**: 8 phases, ~12 files modified/created, ~1200 lines

---

## 📚 REFERENCE

**Full Documentation**: `CONDITIONS_DEEP_DIVE.md` (33KB)

**Sections**:
1. Current State Analysis (detailed breakdown)
2. Schema Design (complete field definitions)
3. Visual Design (colors, icons, badges)
4. Localization Keys (45+ keys with examples)
5. Pack Structure (before/after comparison)
6. Implementation Phases (8 phases with code examples)
7. Migration Scripts (complete JavaScript)
8. Testing Checklist (comprehensive validation)

**Pattern Reference**: `CRITICAL_INJURIES_DEEP_DIVE.md`  
**Similar Implementation**: Critical Injuries system (160 items, 7 phases, proven successful)

---

## ✅ SUCCESS METRICS

After implementation:

- ✅ Zero "Object [object]" errors
- ✅ Conditions are proper item type (not trait hack)
- ✅ All 8 existing conditions migrated
- ✅ 6 additional core conditions added (total: 14)
- ✅ Modern ApplicationV2 sheet
- ✅ Complete localization (45+ keys)
- ✅ Proper schema matching DataModel
- ✅ Visual badges (nature, appliesTo, stacks, duration)
- ✅ Chat cards with nature-specific styling
- ✅ Compendium browser integration

---

**Status**: Ready to implement (all phases planned)  
**Next Step**: Begin Phase 1 (Data Model & Localization)
