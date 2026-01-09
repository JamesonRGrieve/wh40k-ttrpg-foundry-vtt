# CONDITIONS System - Quick Implementation Reference

**Fast lookup for implementing the CONDITIONS refactor**

---

## 🚀 QUICK START

```bash
# 1. Read the deep dive
cat CONDITIONS_DEEP_DIVE.md

# 2. Implement phases 1-8 in order
# 3. Run migration script
node scripts/migrate-conditions.mjs

# 4. Build and test
npm run build
```

---

## 📁 FILES TO MODIFY (7)

| File | Action | Lines |
|------|--------|-------|
| `src/module/data/item/condition.mjs` | Update | +140 |
| `src/lang/en.json` | Add keys | +45 keys |
| `src/template.json` | Add schema | +15 |
| `src/scss/item/_index.scss` | Import | +1 |
| `src/scss/abstracts/_variables.scss` | Already has vars | 0 |
| `src/module/applications/item/_module.mjs` | Export | +1 |
| `src/module/config.mjs` | Register | +5 |

## 📄 FILES TO CREATE (6)

| File | Purpose | Lines |
|------|---------|-------|
| `src/module/applications/item/condition-sheet.mjs` | V2 Sheet | ~45 |
| `src/templates/item/item-condition-sheet-v2.hbs` | Template | ~220 |
| `src/templates/chat/condition-card.hbs` | Chat card | ~60 |
| `src/scss/item/_condition.scss` | Styling | ~400 |
| `scripts/migrate-conditions.mjs` | Migration | ~120 |
| `scripts/generate-additional-conditions.mjs` | Generator | ~180 |

**Total**: 7 modified + 6 created = **13 files**

---

## 🔑 KEY SCHEMA FIELDS

```javascript
// ConditionData schema
{
  identifier: "",           // Kebab-case ID
  nature: "harmful",        // beneficial|harmful|neutral
  effect: "",               // HTMLField
  removal: "",              // HTMLField (optional)
  stackable: false,         // Boolean
  stacks: 1,                // Integer (min: 1)
  appliesTo: "self",        // self|target|both|area
  duration: {
    value: 0,               // Integer
    units: "permanent"      // rounds|minutes|hours|days|permanent
  },
  notes: ""                 // String
}
```

---

## 🎨 COMPUTED PROPERTIES (Add to ConditionData)

```javascript
// All must use safe fallbacks with game.i18n.has()
get natureLabel()        // "Harmful" (not "RT.Condition.Harmful")
get natureIcon()         // "fa-exclamation-triangle"
get natureClass()        // "nature-harmful"
get appliesToLabel()     // "Target"
get appliesToIcon()      // "fa-crosshairs"
get fullName()           // "Stunned (×3)" if stackable
get durationDisplay()    // "1 Round" or "Permanent"
get isTemporary()        // true if not permanent
```

---

## 🌈 COLOR VARIABLES (Already in _variables.scss)

```scss
// Nature colors
$rt-accent-green: #2ecc71;   // Beneficial
$rt-accent-red: #e74c3c;     // Harmful
$rt-accent-gray: #95a5a6;    // Neutral

// AppliesTo colors
$rt-accent-blue: #3498db;    // Self
$rt-accent-red: #e74c3c;     // Target (reuse)
$rt-accent-purple: #9b59b6;  // Both
$rt-accent-orange: #f39c12;  // Area
```

---

## 🏷️ LOCALIZATION KEYS (45 total)

### Essential Keys

```json
{
  "RT.Condition.Label": "Condition",
  "RT.Condition.Nature.Label": "Nature",
  "RT.Condition.Nature.Beneficial": "Beneficial",
  "RT.Condition.Nature.Harmful": "Harmful",
  "RT.Condition.Nature.Neutral": "Neutral",
  "RT.Condition.Effect.Label": "Effect",
  "RT.Condition.Removal.Label": "Removal",
  "RT.Condition.Stackable.Label": "Stackable",
  "RT.Condition.Stacks.Label": "Stacks",
  "RT.Condition.AppliesTo.Label": "Applies To",
  "RT.Condition.AppliesTo.Self": "Self",
  "RT.Condition.AppliesTo.Target": "Target",
  "RT.Condition.AppliesTo.Both": "Both",
  "RT.Condition.AppliesTo.Area": "Area",
  "RT.Condition.Duration.Label": "Duration",
  "RT.Condition.Duration.Permanent": "Permanent",
  "RT.Condition.Duration.Rounds": "Rounds",
  "RT.Condition.Duration.Minutes": "Minutes",
  "RT.Condition.Duration.Hours": "Hours",
  "RT.Condition.Duration.Days": "Days",
  "RT.Condition.Notes.Label": "Notes"
}
```

See `CONDITIONS_DEEP_DIVE.md` for complete list.

---

## 📦 PACK MIGRATION MAP

### Current 8 Conditions

| Filename | Identifier | Nature | AppliesTo | Duration |
|----------|------------|--------|-----------|----------|
| `concealed_*.json` | `concealed` | harmful | target | permanent |
| `fatigued_*.json` | `fatigued` | harmful | self | permanent |
| `grappled_*.json` | `grappled` | harmful | target | permanent |
| `helpless_*.json` | `helpless` | harmful | target | permanent |
| `pinned_*.json` | `pinned` | harmful | target | permanent |
| `prone_*.json` | `prone` | harmful | both | permanent |
| `stunned_*.json` | `stunned` | harmful | target | 1 round |
| `surprised-unaware_*.json` | `surprised` | harmful | self | 1 round |

### New 6 Conditions (Phase 5)

| Identifier | Nature | AppliesTo | Duration | Icon |
|------------|--------|-----------|----------|------|
| `blinded` | harmful | self | permanent | fa-eye-slash |
| `deafened` | harmful | self | permanent | fa-ear-deaf |
| `on-fire` | harmful | self | permanent | fa-fire |
| `bleeding` | harmful | self | permanent | fa-droplet |
| `frightened` | harmful | self | permanent | fa-face-fearful |
| `inspired` | beneficial | self | permanent | fa-star |

---

## 🔧 MIGRATION SCRIPT TEMPLATE

```javascript
// scripts/migrate-conditions.mjs
import fs from "fs";
import path from "path";

const PACK_DIR = "./src/packs/rt-items-conditions/_source";

const CONDITIONS = {
  "identifier": {
    nature: "harmful",
    appliesTo: "target",
    effect: "<p>HTML effect...</p>",
    removal: "<p>How to remove...</p>",
    stackable: false,
    duration: { value: 0, units: "permanent" },
    source: { book: "Rogue Trader Core", page: "249", custom: "" }
  }
};

fs.readdirSync(PACK_DIR)
  .filter(f => f.endsWith(".json"))
  .forEach(file => {
    const data = JSON.parse(fs.readFileSync(path.join(PACK_DIR, file)));
    const identifier = file.split("_")[0];
    const meta = CONDITIONS[identifier];
    
    if (!meta) return;
    
    const updated = {
      name: data.name,
      type: "condition",  // ✅ Change!
      img: data.img,
      system: {
        identifier,
        ...meta,
        stacks: 1,
        description: {
          value: meta.effect,
          source: meta.source
        },
        modifiers: { characteristics: {}, skills: {}, combat: {} },
        notes: ""
      },
      effects: [],
      flags: { rt: { generated: true, version: "2.0" } },
      _id: data._id
    };
    
    fs.writeFileSync(path.join(PACK_DIR, file), JSON.stringify(updated, null, 2));
    console.log(`✅ ${data.name}`);
  });
```

---

## 🎯 PHASE CHECKLIST

- [ ] **Phase 1**: Update condition.mjs + en.json (2 files)
- [ ] **Phase 2**: Update template.json (1 file)
- [ ] **Phase 3**: Create ConditionSheet + template (2 files)
- [ ] **Phase 4**: Run migration script (8 files updated)
- [ ] **Phase 5**: Generate 6 new conditions (6 files created)
- [ ] **Phase 6**: Create chat card template (1 file)
- [ ] **Phase 7**: Create SCSS + import (2 files)
- [ ] **Phase 8**: Register sheet in config (2 files)

---

## ✅ VALIDATION COMMANDS

```bash
# Build
npm run build

# Check for errors
grep -r "Object \[object\]" dist/

# Count conditions
ls src/packs/rt-items-conditions/_source/*.json | wc -l
# Should show: 14 (8 migrated + 6 new)

# Check type
grep -h "\"type\":" src/packs/rt-items-conditions/_source/*.json | sort | uniq
# Should only show: "type": "condition",
```

---

## 🧪 TESTING CHECKLIST

### Quick Tests
- [ ] Build succeeds
- [ ] Pack loads (14 conditions)
- [ ] Drag condition to character
- [ ] Open condition sheet (not trait sheet!)
- [ ] All fields editable
- [ ] No "Object [object]" errors
- [ ] Chat card displays correctly

### Visual Tests
- [ ] Nature badge shows (green/red/gray)
- [ ] AppliesTo badge shows
- [ ] Stacking UI works
- [ ] Duration displays
- [ ] Chat card colors match nature

### Data Tests
- [ ] All computed properties return strings
- [ ] All localization keys resolve
- [ ] Source object displays correctly
- [ ] Modifiers apply correctly

---

## 📚 REFERENCE DOCUMENTS

| Document | Purpose | Size |
|----------|---------|------|
| `CONDITIONS_DEEP_DIVE.md` | Complete implementation guide | 33KB |
| `CONDITIONS_ANALYSIS_SUMMARY.md` | Problem analysis | 11KB |
| `CONDITIONS_BEFORE_AFTER.md` | Visual comparison | ~15KB |
| `CONDITIONS_QUICK_REFERENCE.md` | This document | 8KB |

**Start Here**: `CONDITIONS_DEEP_DIVE.md` → Complete all 8 phases

---

## ⚡ FASTEST PATH TO DONE

1. **Read**: `CONDITIONS_DEEP_DIVE.md` Phase 1
2. **Code**: Update `condition.mjs` (140 lines)
3. **Code**: Update `en.json` (45 keys)
4. **Read**: Phase 2
5. **Code**: Update `template.json` (15 lines)
6. **Read**: Phase 3
7. **Code**: Create `condition-sheet.mjs` (45 lines)
8. **Code**: Create `item-condition-sheet-v2.hbs` (220 lines)
9. **Read**: Phase 4
10. **Code**: Create `migrate-conditions.mjs` (120 lines)
11. **Run**: `node scripts/migrate-conditions.mjs`
12. **Read**: Phases 5-8
13. **Code**: Remaining files
14. **Build**: `npm run build`
15. **Test**: Follow checklist above

**Total Time**: ~4-5 hours (experienced developer)

---

**Status**: Complete planning, ready to implement  
**Next**: Begin Phase 1 in `CONDITIONS_DEEP_DIVE.md`
