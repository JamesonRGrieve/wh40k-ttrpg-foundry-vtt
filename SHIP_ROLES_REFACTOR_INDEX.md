# Ship Roles Refactor - Documentation Index

**Date**: 2026-01-09  
**Status**: 🟡 Planning Complete, Ready for Implementation

---

## 📋 Quick Links

| Document | Purpose | Size |
|----------|---------|------|
| **[SHIP_ROLES_DEEP_DIVE.md](./SHIP_ROLES_DEEP_DIVE.md)** | Complete technical analysis | 47KB |
| **[SHIP_SYSTEM_REFACTOR_COMPLETE.md](./SHIP_SYSTEM_REFACTOR_COMPLETE.md)** | Previous ship refactor (reference) | 9KB |

---

## 🎯 Problem Summary

**Ship Roles system has 4 critical issues** causing `[object Object]` displays:

1. **Field Type Mismatch**: Pack data uses STRINGS, DataModel expects ARRAYS
   - `careerPreferences`: "Usually Explorator, any but Missionary" → should be `["Explorator", ...]`
   - `subordinates`: "Ship Tech-Priests, Arch-Magi" → should be `["Ship Tech-Priests", "Arch-Magi"]`
   - `importantSkills`: "Tech-Use, Common Lore (Machine Cult)" → should be `[{name, specialization}]`

2. **Abilities Not Structured**: `effect` field is legacy HTML string, `abilities` array unused
   - Effect: "+10 to Emergency Repairs Extended Actions"
   - Should be: `abilities: [{ name, description, bonus: 10, action, actionType }]`

3. **Bonus Systems Empty**: `shipBonuses` all zeros despite effect text describing bonuses
   - Effect says "+5 to Ship Crew Rating"
   - But `shipBonuses.crewRating` = 0 (should be 5)

4. **Display Getters Broken**: Try to call `.join()` on strings → `[object Object]`

---

## 📊 Scope

- **Items Affected**: 22 ship role items
- **Field Transformations**: 3 string → array conversions per item
- **Abilities Extraction**: Parse ~22 effect strings → structured abilities
- **Bonus Population**: Extract numeric bonuses from text → shipBonuses fields

---

## 🛠️ Solution Approach

Following the proven Ship Components/Weapons pattern:

### Phase 1: Pack Data Migration
- Parse career strings → structured arrays
- Parse subordinate strings → arrays
- Parse skill strings → array of objects `{name, specialization}`
- Extract abilities from effect text → structured `abilities` array
- Extract ship bonuses from effect text → populate `shipBonuses` object

### Phase 2: DataModel Enhancement
- Add `migrateData()` method to handle legacy data automatically
- Update display getters to handle both arrays and strings
- Add new properties: `careerNote`, `shipBonusesArray`

### Phase 3: Template Updates
- Modernize `ship-role-panel.hbs` with collapsible card design
- Add compendium browser metadata for ship roles
- Display structured abilities, bonuses

### Phase 4: Testing
- Dry-run migration script
- Execute migration (22 items)
- Build and test in Foundry
- Verify no `[object Object]` displays

---

## 📂 Files to Create/Modify

### New Files (1)
- `scripts/migrate-ship-roles.mjs` - Production migration script

### Modified Files (3-4)
- `src/module/data/item/ship-role.mjs` - Add migration logic
- `src/templates/actor/panel/ship-role-panel.hbs` - Modernize display
- `src/module/applications/compendium-browser.mjs` - Add ship role metadata
- `src/lang/en.json` - Add localization strings

### Pack Data (22 files)
- `src/packs/rt-items-ship-roles/_source/*.json` - All 22 items

---

## 🎯 Success Criteria

- ✅ All 22 ship roles migrated successfully (0 errors)
- ✅ Build passes without warnings
- ✅ No `[object Object]` displays anywhere (compendium, character sheet, tooltips)
- ✅ All arrays display as readable comma-separated text
- ✅ Structured abilities show with bonuses
- ✅ Ship bonuses populate correctly
- ✅ Legacy data migration works automatically (backward compatible)

---

## ⏱️ Estimated Timeline

**Total**: 2-3 hours

1. Phase 1: Migration Script - 45 minutes
2. Phase 2: DataModel Updates - 30 minutes
3. Phase 3: Template Updates - 30 minutes
4. Phase 4: Testing & Refinement - 45 minutes

---

## 🔗 Reference Materials

### Successful Pattern to Follow
- **Ship Components Refactor**: 212 items, 100% success rate
- **Ship Weapons Refactor**: 50 items, 100% success rate
- **Migration Script Pattern**: `scripts/migrate-ship-items.mjs` (proven approach)

### Key Learnings from Previous Refactor
1. ✅ Always create timestamped backups
2. ✅ Dry-run validation before execution
3. ✅ Use regex for pattern extraction
4. ✅ Add migrateData() to DataModel for automatic legacy handling
5. ✅ Keep legacy fields for backward compatibility
6. ✅ Verbose logging for debugging

---

## 🚀 Ready to Execute?

All planning is complete. To begin:

```bash
# Step 1: Create migration script
# (See SHIP_ROLES_DEEP_DIVE.md Phase 4 for full script)

# Step 2: Test dry-run
node scripts/migrate-ship-roles.mjs --dry-run --verbose

# Step 3: Execute migration
node scripts/migrate-ship-roles.mjs

# Step 4: Build and test
npm run build
# Then test in Foundry VTT
```

---

## 📚 Related Documentation

- [SHIP_SYSTEM_DEEP_DIVE.md](./SHIP_SYSTEM_DEEP_DIVE.md) - Component/weapon analysis
- [SHIP_SYSTEM_REFACTOR_COMPLETE.md](./SHIP_SYSTEM_REFACTOR_COMPLETE.md) - Previous success report
- [AGENTS.md](./AGENTS.md) - System architecture reference
- [resources/RogueTraderInfo.md](./resources/RogueTraderInfo.md) - Game rules reference

---

**Status**: 🟡 **READY FOR IMPLEMENTATION**  
**Risk Level**: 🟢 **LOW** (proven pattern, comprehensive backups)  
**Expected Success**: 🟢 **HIGH** (following successful Components/Weapons refactor)

---

*Planning completed 2026-01-09*
