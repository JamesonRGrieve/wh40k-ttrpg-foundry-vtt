# Weapon System Migration Summary

## Quick Reference

**Status**: Ready to execute  
**Files Created**: 3 (Deep Dive, Migration Script, Test Script)  
**Weapons Affected**: 1093 pack entries  
**Estimated Time**: 2-3 seconds to migrate all files  

---

## What's Wrong

The weapon system has a **critical schema mismatch**:

- **Pack Data**: Legacy flat strings (`"damage": "1d10+3"`, `"range": "30m"`)
- **Data Model**: V13 nested objects (`damage.formula`, `attack.range.value`)
- **Result**: `[object Object]` displayed everywhere in UI

---

## What's Been Created

### 1. WEAPON_SYSTEM_DEEP_DIVE.md ✅
**Purpose**: Comprehensive analysis document

**Contents**:
- Current architecture breakdown
- Schema mapping requirements
- Problem area identification
- Full modernization plan (7 phases)
- Testing strategy
- Rollout procedure

**Key Insights**:
- WeaponData extends 5 templates (Attack, Damage, Physical, Equippable, Description)
- 1093 weapons use legacy flat schema
- Templates expect computed properties (`damageLabel`, `rangeLabel`)
- Need migration + template updates + V2 integration

### 2. scripts/migrate-weapon-packs.mjs ✅
**Purpose**: Automated pack data migration

**Features**:
- Transforms all 1093 weapon JSON files
- Parses legacy strings → structured V13 schema
- Handles edge cases (special ranges, exotic RoF formats)
- Validates before/after
- Pretty JSON output with newlines
- Colorful console output with status icons

**Transformations**:
```
"range": "30m"          → attack.range.value: 30
"rof": "S/2/-"          → attack.rateOfFire: {single:true, semi:2, full:0}
"damage": "1d10+3"      → damage.formula: "1d10+3"
"damageType": "Energy"  → damage.type: "energy"
"clip": 14              → clip: {max:14, value:14, type:""}
"special": "Tearing"    → special: ["tearing"]
"weight": "5.5kg"       → weight: 5.5
```

**Safety**:
- Skips already-migrated files
- Catches and reports errors per-file
- Doesn't crash on individual failures
- Summary report at end

### 3. scripts/test-weapon-migration.mjs ✅
**Purpose**: Validate migration logic before full run

**Features**:
- Tests 5 diverse weapon samples
- Validates all required V13 schema fields
- Shows before/after comparison
- Reports validation errors
- Prevents bad migrations from running

**Test Coverage**:
- Pistol with numeric range
- Bolt weapon with semi-auto
- Melee weapon (no ammo)
- Thrown weapon with special range (SBx3)
- Exotic weapon with complex qualities

---

## Execution Plan

### Step 0: Backup (CRITICAL) 🔐
```bash
cd /home/aqui/RogueTraderVTT
cp -r src/packs/rt-items-weapons src/packs/rt-items-weapons.BACKUP
```

### Step 1: Test Migration 🧪
```bash
node scripts/test-weapon-migration.mjs
```

**Expected Output**:
```
╔════════════════════════════════════════════════════════════╗
║   Weapon Migration Test Suite                             ║
╚════════════════════════════════════════════════════════════╝

Testing: archeotech-laspistol_ewMZ9cfYzfXDpnip.json
  📋 Original:
     range: 90m
     rof: S/3/-
     damage: 1d10+3
  ✨ Migrated:
     attack.range: {"value":90,"units":"m","special":""}
  🔍 Validation:
     ✅ All checks passed!

[... more tests ...]

╔════════════════════════════════════════════════════════════╗
║   Test Results                                             ║
╚════════════════════════════════════════════════════════════╝
  ✅ Passed: 5
  ❌ Failed: 0
  📊 Total:  5

✨ All tests passed! Ready to run full migration.
```

### Step 2: Run Full Migration 🚀
```bash
node scripts/migrate-weapon-packs.mjs
```

**Expected Output**:
```
╔════════════════════════════════════════════════════════════╗
║   Rogue Trader Weapon Pack Migration Script               ║
╚════════════════════════════════════════════════════════════╝

📦 Found 1093 weapon files

✅ Abyssal Charge
✅ Accursed Crozius (Daemonic)
✅ Accursed Crozius
✅ Aetheme Blade
[... 1089 more weapons ...]

╔════════════════════════════════════════════════════════════╗
║   Migration Complete                                       ║
╚════════════════════════════════════════════════════════════╝
  ✅ Migrated: 1093
  ⏭️  Skipped:  0
  ❌ Errors:   0
  📦 Total:    1093

✨ Migration successful! Run `npm run build` to rebuild packs.
```

### Step 3: Verify Sample Files 🔍
```bash
# Check a few migrated files manually
cat src/packs/rt-items-weapons/_source/archeotech-laspistol_ewMZ9cfYzfXDpnip.json | jq '.system.attack'
cat src/packs/rt-items-weapons/_source/archeotech-laspistol_ewMZ9cfYzfXDpnip.json | jq '.system.damage'
```

**Expected Structure**:
```json
{
  "attack": {
    "type": "ranged",
    "characteristic": "ballisticSkill",
    "modifier": 0,
    "range": {
      "value": 90,
      "units": "m",
      "special": ""
    },
    "rateOfFire": {
      "single": true,
      "semi": 3,
      "full": 0
    }
  },
  "damage": {
    "formula": "1d10+3",
    "type": "energy",
    "bonus": 0,
    "penetration": 2
  }
}
```

---

## Next Steps (Not Included Yet)

After migration completes successfully, you'll need to:

### Phase 2: Template Updates 🎨
- Update `templates/actor/panel/weapon-panel.hbs`
- Update `templates/item/item-weapon-sheet-modern.hbs`
- Use computed properties (`weapon.system.damageLabel`)
- Remove legacy helpers (`rateOfFireDisplay`)

### Phase 3: V2 Action Handlers ⚡
- Add `weaponAttack` action to BaseActorSheet
- Add `weaponReload` action
- Add `weaponFire` action (consume ammo)

### Phase 4: Chat Integration 💬
- Update weapon chat cards
- Use structured data for display
- Add attack roll integration

### Phase 5: Compendium Browser 📚
- Update column renderers for nested data
- Add weapon-specific filters
- Enable proper sorting

**But these are NOT part of this migration!** This migration ONLY fixes the pack data.

---

## Rollback Procedure

If anything goes wrong:

```bash
# Remove migrated files
rm -rf src/packs/rt-items-weapons/_source

# Restore backup
cp -r src/packs/rt-items-weapons.BACKUP src/packs/rt-items-weapons/_source

# Rebuild
npm run build
```

---

## Technical Details

### Schema Changes

| Field | Before | After | Type Change |
|-------|--------|-------|-------------|
| `range` | `"30m"` | `attack.range.value: 30` | string → object |
| `rof` | `"S/2/-"` | `attack.rateOfFire: {...}` | string → object |
| `damage` | `"1d10+3"` | `damage.formula: "1d10+3"` | string → object.string |
| `damageType` | `"Energy"` | `damage.type: "energy"` | string → object.string |
| `penetration` | `5` | `damage.penetration: 5` | number → object.number |
| `clip` | `14` | `clip: {max:14, value:14}` | number → object |
| `special` | `"Tearing"` | `special: ["tearing"]` | string → array |
| `weight` | `"5.5kg"` | `weight: 5.5` | string → number |

### New Fields Added

- `identifier`: Lowercase kebab-case weapon ID
- `melee`: Boolean flag (derived from class)
- `twoHanded`: Boolean flag (derived from class + specials)
- `qualities`: Empty array (for future weapon qualities)
- `modifications`: Empty array (for future weapon mods)
- `notes`: Moved from `note` field

### Removed Fields

- `note` → moved to `notes`
- Top-level `range`, `rof`, `damageType` → nested in `attack`/`damage`

---

## Success Criteria

✅ All 1093 weapons migrate without errors  
✅ Validation passes on random samples  
✅ JSON structure matches WeaponData schema  
✅ No data loss (all original values preserved)  
✅ System loads in Foundry without console errors  
✅ Weapon compendium opens without crashes  

---

## Risk Assessment

**Risk Level**: 🟡 Medium

**Mitigations**:
- Backup created before migration
- Test script validates logic
- Migration skips already-migrated files (idempotent)
- Individual file errors don't crash whole migration
- Rollback procedure documented

**Failure Modes**:
1. **Parse Error**: Bad JSON format → Script catches, reports, continues
2. **Schema Mismatch**: Missing field → Validation catches, reports
3. **Data Loss**: Field not mapped → Backup allows restoration
4. **Foundry Load Error**: Bad schema → Check console, rollback if needed

---

## Post-Migration Checklist

After migration completes:

- [ ] Run `npm run build`
- [ ] Start Foundry dev server
- [ ] Check browser console for errors
- [ ] Open rt-items-weapons compendium
- [ ] Drag a weapon to an actor sheet
- [ ] Check weapon panel displays correctly
- [ ] Open weapon sheet (edit mode)
- [ ] Verify all fields show proper values (not [object Object])
- [ ] Test weapon attack roll
- [ ] Check chat output

If ALL checks pass → Commit migration  
If ANY checks fail → Rollback, investigate, fix, retry

---

## Timeline

**Backup**: 5 seconds  
**Test**: 10 seconds  
**Migrate**: 2-3 seconds (1093 files)  
**Verify**: 30 seconds  
**Build**: 30 seconds  
**Test in Foundry**: 5 minutes  

**Total**: ~7 minutes

---

## Questions & Answers

**Q**: Will this break existing worlds?  
**A**: No. Foundry's DataModel will auto-migrate on first load.

**Q**: Do I need to update my templates?  
**A**: Not immediately. But you'll still see `[object Object]` until templates are updated.

**Q**: Can I run this multiple times?  
**A**: Yes. Script skips already-migrated files.

**Q**: What if I have custom weapons?  
**A**: They'll migrate too. The script processes all JSON files in the pack directory.

**Q**: Can I migrate just one weapon for testing?  
**A**: Yes. Comment out the `for` loop in the script and hardcode a single filename.

**Q**: What about other item types (armour, gear)?  
**A**: Those need separate migration scripts. This is ONLY for weapons.

---

## Support

If you encounter issues:

1. Check console output for specific error messages
2. Verify backup exists before attempting fixes
3. Review WEAPON_SYSTEM_DEEP_DIVE.md for architecture details
4. Test individual weapon files with `node -e` to isolate parse errors
5. Compare migrated JSON to WeaponData schema in `src/module/data/item/weapon.mjs`

---

## Credits

**Analysis**: AI Deep Dive (2026-01-09)  
**Implementation**: Comprehensive migration with safety checks  
**Testing**: 5-sample validation suite  
**Documentation**: This summary + 34KB deep dive doc  

---

**Ready to execute?** Start with Step 0 (Backup) above! 🚀
