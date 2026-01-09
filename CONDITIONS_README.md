# CONDITIONS System Refactor - Complete Documentation

**Status**: 📋 **PLANNING COMPLETE** — Ready for implementation

---

## 🚨 THE PROBLEM

The CONDITIONS system is **critically broken**:

- ❌ Conditions are **traits with a flag hack** (not a proper item type)
- ❌ Use **wrong schema** (TraitData instead of ConditionData)
- ❌ Display **"Object [object]" errors** everywhere
- ❌ Have **undefined fields** (severity, autoRemove)
- ❌ Missing **critical fields** (nature, effect, removal, duration)
- ❌ Show **wrong sheet** (trait sheet instead of condition sheet)
- ❌ Pack data has **legacy fields** and **mismatched schema**

**Impact**: Confusing UX, broken displays, no proper workflow for conditions

---

## ✅ THE SOLUTION

Create **proper `condition` item type** following the proven Critical Injuries pattern:

1. ✅ Update ConditionData with computed properties + safe fallbacks
2. ✅ Add `condition` type to template.json
3. ✅ Create modern ApplicationV2 sheet (ConditionSheet)
4. ✅ Migrate 8 existing conditions (script-based)
5. ✅ Generate 6 additional core conditions
6. ✅ Create styled chat card template
7. ✅ Add comprehensive SCSS styling
8. ✅ Register sheet in system config

**Result**: 14 fully functional conditions, zero errors, modern UI, happy users

---

## 📚 DOCUMENTATION SUITE

| Document | Size | Purpose | Read Time |
|----------|------|---------|-----------|
| **CONDITIONS_INDEX.md** | 11KB | Navigation & quick links | 2 min |
| **CONDITIONS_ANALYSIS_SUMMARY.md** | 11KB | Executive problem summary | 5 min |
| **CONDITIONS_BEFORE_AFTER.md** | 15KB | Visual comparison | 10 min |
| **CONDITIONS_DEEP_DIVE.md** | 33KB | Complete implementation guide | 45 min |
| **CONDITIONS_QUICK_REFERENCE.md** | 8KB | Developer cheat sheet | Reference |
| **CONDITIONS_IMPLEMENTATION_PLAN.md** | 16KB | Project management plan | 15 min |
| **This file** | 5KB | Overview & getting started | 3 min |

**Total**: 7 documents, ~99KB, comprehensive coverage

---

## 🎯 GETTING STARTED

### Quick Start (3 steps)

1. **Read** (10 minutes):
   ```bash
   cat CONDITIONS_ANALYSIS_SUMMARY.md
   # Understand the problem
   
   cat CONDITIONS_BEFORE_AFTER.md
   # See the transformation
   ```

2. **Implement** (5 hours):
   ```bash
   cat CONDITIONS_DEEP_DIVE.md
   # Follow phases 1-8 step by step
   
   cat CONDITIONS_QUICK_REFERENCE.md
   # Keep open for quick lookups
   ```

3. **Test & Deploy** (1 hour):
   ```bash
   npm run build
   # Validate with checklist from deep dive
   ```

---

## 📋 IMPLEMENTATION OVERVIEW

### 8 Phases (~5 hours total)

| Phase | What | Time | Priority |
|-------|------|------|----------|
| 1 | Data Model & Localization | 45 min | 🔴 Critical |
| 2 | Template.json Update | 15 min | 🔴 Critical |
| 3 | Modern Condition Sheet | 60 min | 🔴 Critical |
| 4 | Pack Migration (8 conditions) | 30 min | 🔴 Critical |
| 5 | Additional Conditions (6 new) | 45 min | 🟡 Important |
| 6 | Chat Card Template | 30 min | 🟡 Important |
| 7 | SCSS Styling | 60 min | 🟢 Nice to have |
| 8 | System Registration | 15 min | 🔴 Critical |

### Files Changed

**Modified** (7 files):
- `src/module/data/item/condition.mjs` (+140 lines)
- `src/lang/en.json` (+45 keys)
- `src/template.json` (+15 lines)
- `src/scss/item/_index.scss` (+1 import)
- `src/module/applications/item/_module.mjs` (+1 export)
- `src/module/config.mjs` (+5 lines)
- `src/scss/abstracts/_variables.scss` (already has needed vars)

**Created** (6 files):
- `src/module/applications/item/condition-sheet.mjs` (~45 lines)
- `src/templates/item/item-condition-sheet-v2.hbs` (~220 lines)
- `src/templates/chat/condition-card.hbs` (~60 lines)
- `src/scss/item/_condition.scss` (~400 lines)
- `scripts/migrate-conditions.mjs` (~120 lines)
- `scripts/generate-additional-conditions.mjs` (~180 lines)

**Total**: 13 files, ~1200 lines of code

---

## 🎨 DESIGN HIGHLIGHTS

### Nature Classification

| Nature | Color | Icon | Use |
|--------|-------|------|-----|
| 🟢 Beneficial | Green | fa-plus-circle | Buffs, bonuses |
| 🔴 Harmful | Red | fa-exclamation-triangle | Debuffs, penalties |
| ⚪ Neutral | Gray | fa-info-circle | Situational |

### AppliesTo Classification

| AppliesTo | Color | Icon | Use |
|-----------|-------|------|-----|
| 🔵 Self | Blue | fa-user | Affects bearer |
| 🔴 Target | Red | fa-crosshairs | Affects attacker |
| 🟣 Both | Purple | fa-users | Affects both |
| 🟠 Area | Orange | fa-circle | Affects area |

### Features

- ✅ **Stacking system**: Track multiple instances (×N)
- ✅ **Duration tracking**: Rounds, minutes, hours, days, permanent
- ✅ **Rich text**: ProseMirror for effect/removal/description
- ✅ **Structured source**: Book + page + custom reference
- ✅ **Visual badges**: Nature, AppliesTo, stacks, duration
- ✅ **Themed chat cards**: Color-coded by nature

---

## 📊 BEFORE & AFTER

### Current (Broken)
```javascript
{
  "type": "trait",              // ❌ Wrong type!
  "system": {
    "descriptionText": "...",   // ❌ Legacy
    "severity": 1,              // ❌ Undefined field
    "stackable": false          // ❌ Wrong schema
  },
  "flags": {
    "rt": { "kind": "condition" } // ❌ Hack
  }
}
```

### After (Fixed)
```javascript
{
  "type": "condition",          // ✅ Proper type!
  "system": {
    "nature": "harmful",        // ✅ Proper field
    "effect": "<p>...</p>",     // ✅ HTML field
    "removal": "<p>...</p>",    // ✅ HTML field
    "stackable": false,         // ✅ Proper schema
    "stacks": 1,                // ✅ Proper schema
    "appliesTo": "target",      // ✅ Proper field
    "duration": {               // ✅ Proper field
      "value": 1,
      "units": "rounds"
    }
  }
}
```

---

## 🧪 TESTING

### Critical Tests (Must Pass)
- [ ] Build succeeds
- [ ] No "Object [object]" errors
- [ ] Pack loads with 14 conditions
- [ ] Condition sheet opens (not trait sheet)
- [ ] All fields editable
- [ ] Chat cards display correctly
- [ ] Compendium browser works

### Full Checklist
See `CONDITIONS_DEEP_DIVE.md` → Testing Checklist (40+ tests)

---

## ✅ SUCCESS CRITERIA

**Must Have**:
- ✅ Zero errors
- ✅ Proper condition type
- ✅ 8 conditions migrated
- ✅ Custom sheet
- ✅ Complete localization

**Should Have**:
- ✅ 6 new conditions (14 total)
- ✅ Styled chat cards
- ✅ Visual badges
- ✅ Compendium integration

**Nice to Have**:
- ✅ SCSS animations
- ✅ Rich tooltips
- ✅ Custom icons

---

## 📅 TIMELINE OPTIONS

### Option A: Sprint (1 day)
- Morning: Phases 1-4 (core)
- Afternoon: Phases 5-8 (polish)
- Evening: Test & fix
- **Total**: 8 hours

### Option B: Incremental (3 sessions) ⭐ Recommended
- Session 1: Phases 1-3 (2 hours)
- Session 2: Phases 4-5 (1.5 hours)
- Session 3: Phases 6-8 (1.5 hours)
- **Total**: 5 hours over 2-3 days

### Option C: Phased (1 week)
- 1 hour per day for 5 days
- Test after each day
- **Total**: 5 hours over 1 week

---

## 🎓 LESSONS FROM CRITICAL INJURIES

This refactor **follows the proven pattern** from Critical Injuries:

✅ **What worked**:
- Script-based pack generation
- Safe fallbacks in computed properties
- Complete localization upfront
- Modern V2 ApplicationV2 sheets
- Comprehensive planning

✅ **Apply to CONDITIONS**:
- Same data model patterns
- Same sheet structure
- Same testing approach
- Same documentation style

**Confidence**: **HIGH** — This pattern already works perfectly for Critical Injuries

---

## 🚀 NEXT ACTIONS

### For Project Managers
1. Review `CONDITIONS_IMPLEMENTATION_PLAN.md`
2. Choose timeline option (A/B/C)
3. Assign to developer(s)
4. Track progress with checklist

### For Developers
1. Read `CONDITIONS_ANALYSIS_SUMMARY.md` (5 min)
2. Skim `CONDITIONS_BEFORE_AFTER.md` (10 min)
3. Deep dive `CONDITIONS_DEEP_DIVE.md` (45 min)
4. Bookmark `CONDITIONS_QUICK_REFERENCE.md`
5. Start Phase 1 implementation
6. Test after each phase
7. Complete all 8 phases
8. Run full test plan
9. Update AGENTS.md

### For Stakeholders
1. Read `CONDITIONS_ANALYSIS_SUMMARY.md`
2. Review success criteria
3. Approve implementation
4. Wait for completion

---

## 📞 SUPPORT

### Documentation
- **Index**: `CONDITIONS_INDEX.md` — Find the right doc fast
- **Analysis**: `CONDITIONS_ANALYSIS_SUMMARY.md` — Understand the problem
- **Visual**: `CONDITIONS_BEFORE_AFTER.md` — See the transformation
- **Implementation**: `CONDITIONS_DEEP_DIVE.md` — Complete guide
- **Reference**: `CONDITIONS_QUICK_REFERENCE.md` — Quick lookups
- **Planning**: `CONDITIONS_IMPLEMENTATION_PLAN.md` — Project management

### Reference Implementations
- **Critical Injuries**: Already done, same pattern
- **AGENTS.md**: System architecture reference
- **resources/RogueTraderInfo.md**: Core rules reference

---

## 🎯 THE BOTTOM LINE

**What**: Fix broken CONDITIONS system (currently traits with flag hack)

**Why**: "Object [object]" errors, wrong schema, missing fields, confusing UX

**How**: Create proper `condition` type following Critical Injuries pattern

**Effort**: ~5 hours over 8 phases

**Result**: 14 working conditions, zero errors, modern UI, happy users

**Status**: Planning complete, ready to implement

**Confidence**: High (proven pattern)

**Next**: Read `CONDITIONS_ANALYSIS_SUMMARY.md` → Begin Phase 1

---

**Let's ship this! 🚀**
