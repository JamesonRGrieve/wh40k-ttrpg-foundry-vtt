# GEAR System Refactor - Executive Summary

## The Problem

**ALL 749 gear items have corrupted field mappings**. Fields are systematically misaligned between pack data and the DataModel schema, causing `[object Object]` displays everywhere.

### Field Corruption Pattern

| Current Pack Field | Contains | Should Contain |
|-------------------|----------|----------------|
| `system.type` | "Tool - Device" | Category enum |
| `system.availability` | **Effect description (80+ chars)** | Availability enum ("average") |
| `system.effects` | **Availability enum ("Average")** | Effect description |
| `system.notes` | **Cost value ("750 T")** | GM notes |
| `system.weight` | **String ("1.5kg")** | Number (1.5) |
| `system.charges` | {max, value} | → Should be `uses` |

**Visual Result**: Sheets display `[object Object]` because availability field contains long description text instead of enum values.

---

## The Solution

Complete migration of all 749 items + updated DataModel + modern sheet + enhanced features.

---

## Created Deliverables

### 1. **GEAR_REFACTOR_PLAN.md** (13KB)
- Complete problem analysis
- Field mapping tables (20 types → 13 categories)
- Availability normalization (11 values)
- 7-phase implementation plan
- Testing strategy
- Risk mitigation

### 2. **scripts/migrate-gear-packs.mjs** (9KB)
- Automated migration script
- Migrates all 749 items in one pass
- Handles all field transformations:
  - Type → Category mapping
  - Weight string → number parsing
  - Availability text → effect/description
  - Effects enum → availability
  - Notes cost → cost.value parsing
  - charges → uses rename
- Supports `--dry-run` and `--verbose` flags
- Creates automatic backups
- Generates detailed migration report

### 3. **src/module/data/item/gear-v2.mjs** (10KB)
- Complete refactored DataModel
- Built-in `migrateData()` for legacy format compatibility
- Enhanced properties:
  - `categoryLabel` / `categoryIcon`
  - `hasLimitedUses` / `usesExhausted`
  - `usesDisplay` ("5/10")
- Actions:
  - `consume()` - Decrement uses
  - `resetUses()` - Reset to max
- Proper V13 patterns (cleanData, validation)

### 4. **src/templates/item/item-gear-sheet-v2.hbs** (18KB)
- Modern ApplicationV2 template
- Category selector (13 categories with icons)
- Consumable settings panel
- Effect HTML editor (ProseMirror)
- Duration field
- Uses tracking with buttons
- Structured source fields
- Quick stats bar
- Meta badges

### 5. **Config & Localization Additions**
- Gear categories config (13 categories)
- 30+ localization keys
- Category icons (Font Awesome)

### 6. **GEAR_REFACTOR_IMPLEMENTATION.md** (15KB)
- Step-by-step implementation guide
- 8 phases with success criteria
- Testing checklist (50+ items)
- Rollback procedures
- Timeline estimates

---

## Implementation Quick Start

### Step 1: Test Migration (1 hour)
```bash
# Backup everything
cp -r src/packs/rt-items-gear src/packs/rt-items-gear.backup-$(date +%Y%m%d)

# Test migration (dry-run)
node scripts/migrate-gear-packs.mjs --dry-run --verbose
```

### Step 2: Run Migration (30 min)
```bash
# Execute full migration
node scripts/migrate-gear-packs.mjs

# Commit changes
git add src/packs/rt-items-gear
git commit -m "refactor: migrate all 749 gear items to correct schema"
```

### Step 3: Update Code (3 hours)
1. Replace DataModel: `gear.mjs` ← `gear-v2.mjs`
2. Replace template: `item-gear-sheet-modern.hbs` ← `item-gear-sheet-v2.hbs`
3. Add actions to `gear-sheet.mjs`
4. Add config to `config.mjs`
5. Add localization to `en.json`

### Step 4: Test Everything (2 hours)
- [ ] No `[object Object]` displays
- [ ] All 749 items load correctly
- [ ] Sheet displays all fields
- [ ] Consumables work
- [ ] Compendium browser filters work
- [ ] Actor integration works

**Total Time**: ~7.5 hours

---

## Key Mappings

### Type → Category (20 → 13)
```
Tool - Device/Handheld/Misc/Worn/Structure/Tome/Astartes → tools
Tool - Infantry Gear → survival
Consumable/Disease → consumable
Drug/Poison → drugs
Clothing/Clothing (Astartes) → clothing
Cybernetic/Familiar → tech
Service/Medal → general
exotic/xenos → luxury
```

### Availability Normalization (11 values)
```
Ubiquitous → ubiquitous
Common → common
Average → average
Scarce → scarce
Rare → rare
Very Rare → very-rare
Extremely Rare → extremely-rare
Near Unique → near-unique
Unique → unique
Special/Initiated → average (default)
```

---

## Expected Outcomes

### ❌ Before
- `[object Object]` displays everywhere
- Weight: "1.5kg" (string)
- Availability: Effect description text
- Effects: "Average" (availability enum)
- No category field
- No consumable functionality
- Broken compendium filters

### ✅ After
- Clean, readable data displays
- Weight: 1.5 kg (number)
- Availability: "Average" badge
- Effect: Rich HTML description
- Category: "Tools & Devices" with icon
- Consumable uses tracking (5/10)
- Consume button works
- Compendium filters by category/availability
- Actor integration complete

---

## File Locations

All new files are ready in the repository:

```
/home/aqui/RogueTraderVTT/
├── GEAR_REFACTOR_PLAN.md                           # Problem analysis
├── GEAR_REFACTOR_IMPLEMENTATION.md                 # Step-by-step guide
├── GEAR_REFACTOR_SUMMARY.md                        # This file
├── scripts/migrate-gear-packs.mjs                  # Migration script
├── src/module/data/item/gear-v2.mjs               # New DataModel
└── src/templates/item/item-gear-sheet-v2.hbs      # New template

Config/localization additions (for manual integration):
├── /tmp/gear-config-addition.mjs                   # Config snippet
└── /tmp/gear-localization-addition.json            # i18n snippet
```

---

## Risk Mitigation

### Backups Created
1. Manual backup: `cp -r src/packs/rt-items-gear ...`
2. Tarball backup: Migration script creates before running
3. Git commits: Incremental commits for each phase
4. Automatic backup directory: `_backup/` subfolder

### Rollback Options
1. Restore from `_backup/` directory
2. Restore from tarball
3. Git revert migration commit
4. Restore old DataModel/template from `-old` files

### Testing Strategy
- Dry-run migration first
- Test on 10 sample items
- Verify JSON structure manually
- Test in Foundry before full deployment
- Comprehensive checklist (50+ items)

---

## Success Metrics

- ✅ **Zero** `[object Object]` displays
- ✅ **100%** items load correctly (749/749)
- ✅ **Zero** console errors
- ✅ **All** field types correct (no strings in number fields)
- ✅ **Compendium browser** fully functional
- ✅ **Actor integration** working
- ✅ **Consumables** functional with uses tracking
- ✅ **Categories** display with icons
- ✅ **Tooltips** show full effect text

---

## Next Steps

1. **Read** GEAR_REFACTOR_PLAN.md for full context
2. **Follow** GEAR_REFACTOR_IMPLEMENTATION.md step-by-step
3. **Start** with Phase 1: Test migration script (--dry-run)
4. **Verify** output before proceeding
5. **Execute** full migration
6. **Update** DataModel/Sheet/Config
7. **Test** thoroughly
8. **Document** any issues
9. **Commit** changes
10. **Update** AGENTS.md with new schema

---

## Questions & Support

### Common Issues

**Q: Migration fails on some items**  
A: Check migration report for warnings. Script handles most edge cases (missing fields, null values, weird formats). Review specific items that failed.

**Q: [object Object] still showing after migration**  
A: Verify DataModel migrateData() is running. Check console for errors. Ensure pack files actually got migrated (not using old cached version).

**Q: Compendium browser broken**  
A: Update browser filters to use new category field. Add gear-specific filters from implementation guide.

**Q: Consumables not working**  
A: Check uses field is populated (max > 0). Verify consume action is bound in sheet class. Check DataModel consume() method.

### Debug Commands

```bash
# Check migration output
cat src/packs/rt-items-gear/_source/ITEMID.json | python3 -m json.tool

# Count migrated fields
grep -r '"category"' src/packs/rt-items-gear/_source/*.json | wc -l

# Find any remaining old format
grep -r '"type":.*"Tool' src/packs/rt-items-gear/_source/*.json
```

---

## Documentation Updates

After completion, update:

1. **AGENTS.md** - Add new gear schema
2. **README.md** - Note gear system refactor
3. **PROGRESS.md** - Mark gear refactor complete
4. **ROADMAP.md** - Remove from todo list

---

## Timeline

| Day | Phase | Tasks | Hours |
|-----|-------|-------|-------|
| 1 | Test & Migrate | Phases 1-2 | 1.5 |
| 1-2 | Code Updates | Phases 3-5 | 2.0 |
| 2 | Integration | Phases 6-7 | 2.0 |
| 2-3 | Testing | Phase 8 | 2.0 |
| **Total** | | | **7.5** |

---

## Benefits

### Immediate
- ✅ Fix all `[object Object]` displays
- ✅ Clean, readable gear item sheets
- ✅ Proper data types (numbers, enums, HTML)
- ✅ Working compendium filters

### Short-term
- ✅ Consumable uses tracking
- ✅ Consume/reset functionality
- ✅ Category-based organization
- ✅ Enhanced tooltips with effects

### Long-term
- ✅ Foundation for active effects integration
- ✅ Smart acquisition helpers
- ✅ Inventory presets
- ✅ Bulk actions
- ✅ Enhanced character sheet integration

---

## Technical Debt Eliminated

- ❌ Field misalignment between pack and schema
- ❌ String types in numeric fields
- ❌ Description text in enum fields
- ❌ Missing category structure
- ❌ No consumable functionality
- ❌ Broken tooltips
- ❌ Unusable compendium filters

All resolved with this refactor. ✅

---

**Status**: Ready for implementation  
**Priority**: High (blocks proper gear functionality)  
**Risk**: Medium (requires pack migration)  
**Effort**: 7.5 hours  
**Impact**: Resolves all gear display/functionality issues  

---

## Quick Command Reference

```bash
# Test migration
node scripts/migrate-gear-packs.mjs --dry-run --verbose

# Run migration
node scripts/migrate-gear-packs.mjs

# Backup packs
tar -czf gear-backup-$(date +%Y%m%d).tar.gz src/packs/rt-items-gear

# Restore backup
tar -xzf gear-backup-YYYYMMDD.tar.gz

# Check specific item
cat src/packs/rt-items-gear/_source/FILENAME.json | python3 -m json.tool

# Count by category
grep -r '"category"' src/packs/rt-items-gear/_source | cut -d'"' -f4 | sort | uniq -c

# Verify migration complete
grep -r '"type":.*"Tool' src/packs/rt-items-gear/_source || echo "Migration complete"
```

---

**Ready to proceed!** Start with GEAR_REFACTOR_IMPLEMENTATION.md Phase 1. 🚀
