# Ship System Refactor - Documentation Index

**Date Created**: 2026-01-09  
**Status**: 📦 Ready for Implementation  
**Priority**: 🔴 Critical

---

## 📚 Document Overview

This refactor addresses **critical `[object Object]` display issues** in the ship system affecting 227 items (171 components + 56 weapons).

### Document Hierarchy

```
SHIP_SYSTEM_REFACTOR_INDEX.md (This File)
├── SHIP_SYSTEM_EXECUTIVE_SUMMARY.md     ← Start Here (Management)
├── SHIP_SYSTEM_QUICK_REFERENCE.md       ← Start Here (Developers)
├── SHIP_SYSTEM_DEEP_DIVE.md             ← Technical Reference (48KB)
├── SHIP_SYSTEM_IMPLEMENTATION_CHECKLIST.md ← Execution Guide
└── scripts/migrate-ship-items.mjs       ← Migration Tool
```

---

## 🎯 Quick Navigation

### For Management

**Start Here**: [SHIP_SYSTEM_EXECUTIVE_SUMMARY.md](./SHIP_SYSTEM_EXECUTIVE_SUMMARY.md) (8KB, 5 min read)

- Problem statement
- Impact assessment
- Solution overview
- Timeline (4 days)
- Risk analysis
- Go/No-Go decision

**Key Takeaways**:
- 227 items have broken displays (`[object Object]`)
- Automated migration script ready
- Low risk, high impact fix
- 4-day implementation window

---

### For Developers

**Start Here**: [SHIP_SYSTEM_QUICK_REFERENCE.md](./SHIP_SYSTEM_QUICK_REFERENCE.md) (10KB, 10 min read)

- The problem explained
- Quick start commands
- Field migration map
- Next steps after migration
- Testing checklist
- Expected results

**For Implementation**:
1. Read Quick Reference
2. Follow [SHIP_SYSTEM_IMPLEMENTATION_CHECKLIST.md](./SHIP_SYSTEM_IMPLEMENTATION_CHECKLIST.md)
3. Reference Deep Dive as needed

---

### For Deep Understanding

**Read**: [SHIP_SYSTEM_DEEP_DIVE.md](./SHIP_SYSTEM_DEEP_DIVE.md) (48KB, 30 min read)

- Complete analysis
- All 7 problem areas explained
- Field-by-field comparison (DataModel vs Pack)
- Full migration strategy (7 phases)
- Edge cases and gotchas
- Reference materials

**When to Use**:
- Understanding root causes
- Planning custom modifications
- Troubleshooting migration issues
- Learning V13 patterns

---

## 📋 Implementation Workflow

### Phase 0: Preparation (30 min)

1. Read [SHIP_SYSTEM_EXECUTIVE_SUMMARY.md](./SHIP_SYSTEM_EXECUTIVE_SUMMARY.md)
2. Read [SHIP_SYSTEM_QUICK_REFERENCE.md](./SHIP_SYSTEM_QUICK_REFERENCE.md)
3. Review [SHIP_SYSTEM_IMPLEMENTATION_CHECKLIST.md](./SHIP_SYSTEM_IMPLEMENTATION_CHECKLIST.md)
4. Set up git branch

### Phase 1: Migration (2 hours)

**Tool**: [scripts/migrate-ship-items.mjs](./scripts/migrate-ship-items.mjs)

```bash
# Dry run (preview)
node scripts/migrate-ship-items.mjs --dry-run --verbose

# Execute migration
node scripts/migrate-ship-items.mjs
```

**Deliverable**: Migrated pack data (227 items)

### Phase 2: Code Updates (3 hours)

**Files to Modify**:
- `src/module/data/item/ship-component.mjs` (+~50 lines)
- `src/module/data/item/ship-weapon.mjs` (+~45 lines)
- `src/templates/actor/panel/ship-components-panel.hbs` (~10 changes)
- `src/templates/actor/panel/ship-weapons-panel.hbs` (~5 changes)
- `src/module/applications/actor/starship-sheet.mjs` (~15 lines changed)

**Deliverable**: Updated code + successful build

### Phase 3: Testing (2 hours)

**Test Cases**:
- [ ] Visual: Compendium displays
- [ ] Visual: Ship actor panels
- [ ] Data: Field structure validation
- [ ] Regression: Old actors still work

**Deliverable**: Passing tests + screenshots

### Phase 4: Documentation (1 hour)

**Updates**:
- AGENTS.md (add to recent changes)
- ROADMAP.md (mark complete)
- Create SHIP_SYSTEM_REFACTOR_COMPLETE.md

**Deliverable**: Updated documentation

### Total Time: **8 hours** (1 day actual work across 4-day window)

---

## 🔍 Problem Summary

### What's Broken

| UI Element | Current Display | Expected Display |
|------------|-----------------|------------------|
| Component type | `[object Object]` | "Bridge" |
| Hull type | `[object Object]` | "Raider, Frigate" |
| Power (generator) | `-40` or `undefined` | `+40` |
| Space | `undefined` | `1` |
| Ship Points | `undefined` | `1` |

### Root Cause

**Field name mismatch** between pack data (legacy) and DataModel schema (V13):

- Pack: `powerUsage`, `spaceUsage`, `spCost`, `type`
- Schema: `power.used`, `power.generated`, `space`, `shipPoints`, `componentType`

### Solution

1. **Migrate pack data** to match schema (automated)
2. **Add migration logic** to DataModels (handles legacy)
3. **Update templates** to use correct field names
4. **Test thoroughly** to ensure no regressions

---

## 📊 Impact Analysis

### Affected Items

- **171 ship components** (all broken)
- **56 ship weapons** (all broken)
- **~50+ `[object Object]` instances** in UI

### Affected Code

- 2 DataModel files (ship-component, ship-weapon)
- 2 template files (component panel, weapon panel)
- 1 actor sheet file (starship-sheet)
- 227 pack data JSON files

### User Impact

**Before Fix**:
- ❌ Can't browse ship items in compendium
- ❌ Can't see component stats on ship sheet
- ❌ Power/space calculations broken
- ❌ Ship sheet effectively unusable

**After Fix**:
- ✅ Clean, readable compendium
- ✅ All component stats visible
- ✅ Accurate power/space tracking
- ✅ Fully functional ship sheet

---

## ✅ Success Criteria

### Must Have

1. ✅ **227/227 items migrated** (0 errors)
2. ✅ **0 `[object Object]` displays** in UI
3. ✅ **Power generation shows correctly** (`+40` not `-40`)
4. ✅ **All stats visible** (space, shipPoints, etc.)
5. ✅ **Compendium filtering works** (by type, hull)

### Should Have

1. Essential component badges
2. Condition badges
3. Power/space shortage warnings
4. Weapon capacity tracking

### Nice to Have

1. Dedicated item sheets (ApplicationV2)
2. Advanced compendium filters
3. Component condition toggle
4. Hull compatibility warnings

---

## 🚀 Getting Started

### For First-Time Readers

1. **Management** → Read Executive Summary (5 min)
2. **Developers** → Read Quick Reference (10 min)
3. **Both** → Review Implementation Checklist (scan, 5 min)

### For Implementation

1. **Prepare** → Read Quick Reference + Checklist
2. **Execute** → Follow checklist phase-by-phase
3. **Validate** → Run all test cases
4. **Document** → Update AGENTS.md + create completion doc

### For Troubleshooting

1. **Check** → Implementation Checklist (find current phase)
2. **Reference** → Deep Dive (problem areas section)
3. **Debug** → Migration script has verbose mode
4. **Validate** → Spot-check JSON structure against Deep Dive examples

---

## 📖 Related Documentation

### System Documentation

- **AGENTS.md** - System architecture, patterns, recent changes
- **ROADMAP.md** - Project roadmap, upcoming features
- **resources/RogueTraderInfo.md** - Game rules reference

### Similar Refactors

- **WEAPON_REFACTOR_COMPLETE.md** - Weapon migration (successful)
- **GEAR_REFACTOR_SUMMARY.md** - Gear migration (successful)
- **ARMOUR_MIGRATION_COMPLETE.md** - Armour migration (successful)

**Pattern**: Same migration approach proven successful 3 times

---

## 🛠️ Tools & Scripts

### Migration Script

**File**: `scripts/migrate-ship-items.mjs` (17KB)

**Features**:
- Automatic backup before changes
- Dry-run mode (preview without modifying)
- Verbose mode (show all transformations)
- Component/weapon filtering
- Validation and error reporting

**Usage**:
```bash
# Preview only
node scripts/migrate-ship-items.mjs --dry-run --verbose

# Execute full migration
node scripts/migrate-ship-items.mjs

# Migrate only components
node scripts/migrate-ship-items.mjs --components

# Migrate only weapons
node scripts/migrate-ship-items.mjs --weapons
```

**Output**:
- Backup directory: `src/packs/_backups/ship-items-{timestamp}/`
- Migration report: Console output with stats
- Modified files: 227 JSON files in `_source/` dirs

---

## ⚠️ Important Notes

### Before Starting

- **Commit all changes** - Create clean git state
- **Create branch** - `feature/ship-system-refactor`
- **Read docs** - At minimum: Executive Summary + Quick Reference
- **Test environment** - Have Foundry instance ready for testing

### During Migration

- **Don't skip dry-run** - Always preview first
- **Check backup** - Verify backup dir exists
- **Spot-check files** - Manually inspect 5-10 migrated items
- **Build frequently** - Run `npm run build` after code changes

### After Migration

- **Test thoroughly** - Complete all test cases in checklist
- **Take screenshots** - Before/after for documentation
- **Update docs** - AGENTS.md, ROADMAP.md, completion doc
- **Merge carefully** - Review all changes before merging

---

## 🎯 Key Takeaways

1. **Problem**: 227 ship items have field name mismatches → `[object Object]` everywhere
2. **Solution**: Automated migration + DataModel enhancements + template updates
3. **Duration**: 4 days (8 hours actual work)
4. **Risk**: Low (proven pattern, automatic backup)
5. **Impact**: High (fixes critical usability issues)
6. **Status**: Ready for implementation

---

## 📞 Support

### Questions?

- **Technical details** → See [SHIP_SYSTEM_DEEP_DIVE.md](./SHIP_SYSTEM_DEEP_DIVE.md)
- **Implementation** → See [SHIP_SYSTEM_IMPLEMENTATION_CHECKLIST.md](./SHIP_SYSTEM_IMPLEMENTATION_CHECKLIST.md)
- **Quick answers** → See [SHIP_SYSTEM_QUICK_REFERENCE.md](./SHIP_SYSTEM_QUICK_REFERENCE.md)

### Issues During Implementation?

1. Check checklist for current phase guidance
2. Review Deep Dive for edge cases
3. Run migration script with `--verbose` flag
4. Check `src/packs/_backups/` for original data
5. Review similar successful refactors (weapon/gear/armour)

---

## 📅 Document History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-09 | 1.0 | Initial documentation created |

---

**Next Step**: Read [SHIP_SYSTEM_EXECUTIVE_SUMMARY.md](./SHIP_SYSTEM_EXECUTIVE_SUMMARY.md) (management) or [SHIP_SYSTEM_QUICK_REFERENCE.md](./SHIP_SYSTEM_QUICK_REFERENCE.md) (developers)
