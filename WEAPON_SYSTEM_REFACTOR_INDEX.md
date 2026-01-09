# Weapon System Refactor - Complete Index

**Date**: 2026-01-09  
**Scope**: Complete weapon system analysis, migration, and modernization  
**Status**: ✅ Ready for Execution  

---

## 📚 Documentation Created

### 1. WEAPON_SYSTEM_DEEP_DIVE.md (34KB)
**Purpose**: Comprehensive technical analysis

**Contents**:
- Executive summary
- Current architecture breakdown (data models, documents, sheets)
- Pack data structure analysis
- Schema mapping requirements
- Problem identification with examples
- 7-phase modernization plan
- Testing strategy
- Rollout procedure
- Future enhancements roadmap

**Use When**: Understanding the full scope, planning enhancements, troubleshooting issues

### 2. WEAPON_MIGRATION_SUMMARY.md (10KB)
**Purpose**: Quick reference and execution guide

**Contents**:
- Quick reference (status, files, impact)
- What's wrong (brief problem statement)
- What's been created (overview of all files)
- Step-by-step execution plan
- Rollback procedure
- Technical details (schema changes table)
- Post-migration checklist
- Q&A section

**Use When**: Ready to execute migration, need quick answers, checking status

### 3. WEAPON_TEMPLATE_FIXES.md (12KB)
**Purpose**: Template modernization plan (post-migration)

**Contents**:
- File-by-file update plan
- Before/after code examples
- Handlebars helper updates
- Computed property reference
- Implementation steps
- Testing checklist
- Quick reference tables

**Use When**: After pack migration, fixing display issues, updating templates

### 4. WEAPON_SYSTEM_REFACTOR_INDEX.md (this file)
**Purpose**: Navigation hub for all weapon system documentation

---

## 🔧 Scripts Created

### 1. scripts/migrate-weapon-packs.mjs (11KB)
**Purpose**: Automated pack data migration

**Features**:
- Processes all 1093 weapon JSON files
- Transforms legacy flat schema → V13 nested schema
- Parses special ranges, RoF formats, weight strings
- Validates and normalizes all fields
- Skips already-migrated files (idempotent)
- Colorful console output with status
- Error handling per file

**Usage**: `node scripts/migrate-weapon-packs.mjs`

**Output**: Migrated JSON files in `src/packs/rt-items-weapons/_source/`

### 2. scripts/test-weapon-migration.mjs (10KB)
**Purpose**: Validation suite for migration logic

**Features**:
- Tests 5 diverse weapon samples
- Validates all V13 schema requirements
- Shows before/after comparison
- Reports validation errors
- Prevents bad migrations

**Usage**: `node scripts/test-weapon-migration.mjs`

**Output**: Test results with pass/fail status

---

## 🗺️ Execution Roadmap

### Phase 1: Pack Data Migration ⏳ NEXT
**Goal**: Transform all weapon pack data to V13 schema

**Steps**:
1. Backup weapon pack directory
2. Run test migration script
3. Run full migration script
4. Verify sample files
5. Rebuild packs with `npm run build`
6. Test load in Foundry

**Docs**: WEAPON_MIGRATION_SUMMARY.md  
**Scripts**: test-weapon-migration.mjs, migrate-weapon-packs.mjs  
**Time**: ~10 minutes  
**Risk**: 🟡 Medium (mitigated by backup)

### Phase 2: Template Modernization ⏸️ WAITING
**Goal**: Fix [object Object] displays in all templates

**Steps**:
1. Update weapon-panel.hbs
2. Update item-weapon-sheet-modern.hbs
3. Create weapon-card.hbs
4. Update other weapon displays
5. Update handlebars helpers
6. Test all scenarios

**Docs**: WEAPON_TEMPLATE_FIXES.md  
**Time**: ~1.5 hours  
**Risk**: 🟢 Low (no data changes)

### Phase 3: V2 Action Handlers ⏸️ FUTURE
**Goal**: Add weapon-specific actions to sheets

**Tasks**:
- Add `weaponAttack` action
- Add `weaponReload` action
- Add `weaponFire` action (ammo consumption)
- Integrate with WeaponAttackDialog

**Docs**: WEAPON_SYSTEM_DEEP_DIVE.md (Phase 7)  
**Time**: ~2 hours  
**Risk**: 🟡 Medium (new functionality)

### Phase 4: Chat Integration ⏸️ FUTURE
**Goal**: Enhance weapon chat cards

**Tasks**:
- Create weapon-card.hbs template
- Update sendWeaponToChat() method
- Add attack roll integration
- Add damage roll integration

**Docs**: WEAPON_SYSTEM_DEEP_DIVE.md (Phase 6)  
**Time**: ~1 hour  
**Risk**: 🟢 Low (isolated feature)

### Phase 5: Compendium Browser ⏸️ FUTURE
**Goal**: Update browser for nested weapon data

**Tasks**:
- Add weapon column renderers
- Add weapon-specific filters
- Enable proper sorting
- Test all filter combinations

**Docs**: WEAPON_SYSTEM_DEEP_DIVE.md (Phase 4)  
**Time**: ~1.5 hours  
**Risk**: 🟡 Medium (complex filtering)

### Phase 6: Quality System ⏸️ FUTURE
**Goal**: Implement weapon qualities as items

**Tasks**:
- Create weapon-quality item type
- Build quality compendium
- Enable drag/drop onto weapons
- Apply quality effects

**Docs**: WEAPON_SYSTEM_DEEP_DIVE.md (Future Enhancements)  
**Time**: ~4 hours  
**Risk**: 🔴 High (new subsystem)

### Phase 7: Modification System ⏸️ FUTURE
**Goal**: Full weapon modification support

**Tasks**:
- Enhance weapon-modification item type
- Build modification compendium
- Implement effect stacking
- Visual indicators

**Docs**: WEAPON_SYSTEM_DEEP_DIVE.md (Future Enhancements)  
**Time**: ~3 hours  
**Risk**: 🟡 Medium (existing type enhancement)

---

## 📋 Quick Command Reference

### Backup
```bash
cp -r src/packs/rt-items-weapons src/packs/rt-items-weapons.BACKUP
```

### Test Migration
```bash
node scripts/test-weapon-migration.mjs
```

### Run Migration
```bash
node scripts/migrate-weapon-packs.mjs
```

### Verify Migration
```bash
cat src/packs/rt-items-weapons/_source/archeotech-laspistol_ewMZ9cfYzfXDpnip.json | jq '.system.attack'
```

### Rebuild Packs
```bash
npm run build
```

### Rollback
```bash
rm -rf src/packs/rt-items-weapons/_source
cp -r src/packs/rt-items-weapons.BACKUP src/packs/rt-items-weapons/_source
npm run build
```

---

## 🎯 Current Status

### ✅ Completed
- Deep dive analysis (34KB document)
- Migration script (production-ready)
- Test script (5 samples)
- Documentation (67KB total)
- Rollback plan
- Risk assessment

### ⏳ Ready to Execute
- Pack data migration (Phase 1)

### ⏸️ Blocked (Waiting on Phase 1)
- Template fixes (Phase 2)
- V2 actions (Phase 3)
- Chat integration (Phase 4)
- Compendium browser (Phase 5)

### ⏸️ Future Work
- Quality system (Phase 6)
- Modification system (Phase 7)
- Ammunition types
- Advanced attack dialog

---

## 🔍 Key Insights

### Architecture
- WeaponData extends 5 templates (modular, clean)
- AttackTemplate + DamageTemplate handle combat stats
- EquippableTemplate handles equipment state
- PhysicalItemTemplate handles acquisition/weight
- DescriptionTemplate handles rich text

### Schema Mismatch
- Pack data uses flat strings (legacy)
- DataModel expects nested objects (V13)
- Templates reference both (inconsistent)
- Result: `[object Object]` everywhere

### Migration Strategy
- Transform at pack level (source of truth)
- Add migrateData() to WeaponData (automatic migration)
- Update templates to use computed properties
- Remove legacy helpers
- Test thoroughly before commit

### Risk Mitigation
- Backup before migration
- Test script validates logic
- Migration is idempotent
- Individual file errors don't crash migration
- Rollback procedure documented
- No data loss (all values preserved)

---

## 📊 Metrics

**Documentation**: 67KB across 4 files  
**Scripts**: 21KB across 2 files  
**Weapons Affected**: 1093 pack entries  
**Templates to Update**: 6 files  
**Helpers to Update**: 1 file  
**Schema Fields Changed**: 8 major fields  
**New Fields Added**: 6 fields  
**Estimated Total Time**: 5-6 hours (all phases)  
**Phase 1 Time**: ~10 minutes  

---

## 🚨 Critical Warnings

1. **ALWAYS backup before migration** - No exceptions
2. **Test script MUST pass** before full migration
3. **DO NOT update templates** before pack migration
4. **Check Foundry console** after migration
5. **Verify compendium loads** before committing
6. **Test multiple weapon types** (melee, ranged, thrown)
7. **Rollback immediately** if Foundry crashes

---

## 🎓 Learning Resources

### Foundry V13 Patterns
- Read: `dnd5e` system source code
- Focus: DataModel mixins, template parts
- Study: AttackTemplate, DamageTemplate patterns

### Data Migration
- Foundry Docs: System Data Migrations
- Pattern: `migrateData()` static method
- Best Practice: Preserve original values

### ApplicationV2
- Foundry Docs: ApplicationV2 API
- Pattern: PARTS system for modular rendering
- Pattern: Static action handlers

---

## 📞 Support Contacts

**System Reference**: resources/RogueTraderInfo.md  
**Agent Documentation**: AGENTS.md  
**V13 Rework**: V13REWORK.md  
**Deep Dive**: WEAPON_SYSTEM_DEEP_DIVE.md  
**Migration Guide**: WEAPON_MIGRATION_SUMMARY.md  
**Template Guide**: WEAPON_TEMPLATE_FIXES.md  

---

## ✅ Pre-Flight Checklist

Before running migration:

- [ ] Read WEAPON_MIGRATION_SUMMARY.md
- [ ] Understand schema changes
- [ ] Backup created
- [ ] Test script runs successfully
- [ ] No uncommitted changes in git
- [ ] Foundry is closed
- [ ] Adequate disk space (>100MB free)

After migration:

- [ ] Migration script completed without errors
- [ ] Sample files verified manually
- [ ] Packs rebuilt successfully
- [ ] Foundry loads without console errors
- [ ] Compendium opens successfully
- [ ] Random weapon inspected (correct structure)

---

## 🎉 Success Criteria

### Pack Migration (Phase 1)
✅ All 1093 weapons migrate without errors  
✅ Validation passes on all samples  
✅ JSON structure matches schema  
✅ No data loss  
✅ Foundry loads successfully  
✅ Compendium opens without crashes  

### Template Fixes (Phase 2)
✅ No more `[object Object]` displays  
✅ All weapon stats show correct values  
✅ Weapon sheet inputs work  
✅ Chat cards render properly  
✅ Compendium browser works  
✅ No console errors  

---

## 📝 Next Actions

1. **Review** WEAPON_MIGRATION_SUMMARY.md
2. **Backup** weapon pack directory
3. **Run** test-weapon-migration.mjs
4. **Execute** migrate-weapon-packs.mjs
5. **Verify** sample files
6. **Rebuild** with npm run build
7. **Test** in Foundry
8. **Commit** if successful
9. **Move to** Phase 2 (templates)

---

**Ready to begin?** Start with WEAPON_MIGRATION_SUMMARY.md! 🚀

---

## 📁 File Structure

```
/home/aqui/RogueTraderVTT/
├── WEAPON_SYSTEM_DEEP_DIVE.md      (34KB - Technical analysis)
├── WEAPON_MIGRATION_SUMMARY.md     (10KB - Execution guide)
├── WEAPON_TEMPLATE_FIXES.md        (12KB - Post-migration fixes)
├── WEAPON_SYSTEM_REFACTOR_INDEX.md (This file - Navigation hub)
├── scripts/
│   ├── migrate-weapon-packs.mjs    (11KB - Migration script)
│   └── test-weapon-migration.mjs   (10KB - Validation suite)
├── src/
│   ├── module/
│   │   └── data/
│   │       ├── item/
│   │       │   └── weapon.mjs      (WeaponData model)
│   │       └── shared/
│   │           ├── attack-template.mjs
│   │           └── damage-template.mjs
│   ├── templates/
│   │   ├── actor/
│   │   │   └── panel/
│   │   │       └── weapon-panel.hbs (To be updated)
│   │   ├── item/
│   │   │   └── item-weapon-sheet-modern.hbs (To be updated)
│   │   └── chat/
│   │       └── weapon-card.hbs (To be created)
│   └── packs/
│       └── rt-items-weapons/
│           └── _source/            (1093 JSON files to migrate)
└── resources/
    └── RogueTraderInfo.md          (Rules reference)
```

---

*End of Index - Weapon System Refactor Complete Documentation*
