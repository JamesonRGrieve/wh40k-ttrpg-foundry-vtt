# GEAR System Refactor - Implementation Guide

## Overview

This document provides step-by-step instructions for implementing the complete GEAR system refactor. All necessary files have been created and are ready for integration.

---

## Created Files

### 1. Planning & Analysis
- ✅ **GEAR_REFACTOR_PLAN.md** - Complete refactor plan with problem analysis
- ✅ **GEAR_REFACTOR_IMPLEMENTATION.md** - This file

### 2. Migration Script
- ✅ **scripts/migrate-gear-packs.mjs** - Automated pack migration script
  - Migrates all 749 gear items
  - Supports --dry-run and --verbose flags
  - Creates automatic backups
  - Generates migration report

### 3. Updated DataModel
- ✅ **src/module/data/item/gear-v2.mjs** - Complete refactored DataModel
  - Built-in migrateData() for legacy format
  - cleanData() for type coercion
  - Enhanced properties and methods
  - Consume/reset use actions

### 4. Updated Sheet Template
- ✅ **src/templates/item/item-gear-sheet-v2.hbs** - Modern ApplicationV2 template
  - Category selector with 13 options
  - Consumable settings panel
  - Effect HTML editor
  - Duration field
  - Uses tracking with consume/reset buttons
  - Structured source fields

### 5. Configuration Snippets
- ✅ Config addition for gear categories (see /tmp/gear-config-addition.mjs)
- ✅ Localization additions (see /tmp/gear-localization-addition.json)

---

## Implementation Steps

### Phase 1: Test Migration Script (1 hour)

#### Step 1.1: Review the Plan
```bash
# Read the full plan
cat GEAR_REFACTOR_PLAN.md
```

#### Step 1.2: Backup Current State
```bash
# Create full backup before any changes
cp -r src/packs/rt-items-gear src/packs/rt-items-gear.backup-$(date +%Y%m%d)
```

#### Step 1.3: Test Migration (Dry Run)
```bash
# Run migration in dry-run mode
node scripts/migrate-gear-packs.mjs --dry-run --verbose

# Review output - look for:
# - Total items processed
# - Category distribution
# - Any warnings about bad data
```

#### Step 1.4: Test Sample Items
```bash
# Create test directory with 10 sample items
mkdir -p src/packs/rt-items-gear-test/_source
cp src/packs/rt-items-gear/_source/*.json src/packs/rt-items-gear-test/_source/ | head -10

# Edit script temporarily to point to test dir, run migration
# Verify output JSON structure manually
```

**Success Criteria**:
- ✅ Script runs without errors
- ✅ Output JSON has correct field structure
- ✅ No data loss
- ✅ Category mappings correct
- ✅ Availability normalized correctly

---

### Phase 2: Run Full Migration (30 minutes)

#### Step 2.1: Final Backup
```bash
# One more backup before live migration
tar -czf rt-items-gear-backup-$(date +%Y%m%d-%H%M%S).tar.gz src/packs/rt-items-gear
```

#### Step 2.2: Execute Migration
```bash
# Run full migration
node scripts/migrate-gear-packs.mjs

# Review migration report
# Verify backup created in src/packs/rt-items-gear/_backup/
```

#### Step 2.3: Validate Results
```bash
# Check a few random files
cat src/packs/rt-items-gear/_source/cogitator-systems-personal_jpP8DYUhfi4pjwzl.json

# Verify structure:
# - system.category is enum (not "Tool - Device")
# - system.availability is enum (not description text)
# - system.weight is number (not "1.5kg")
# - system.uses exists (not system.charges)
# - system.effect has description text
```

#### Step 2.4: Git Commit
```bash
git add src/packs/rt-items-gear
git commit -m "refactor: migrate all 749 gear items to correct schema

- Map type → category (20 types → 13 categories)
- Normalize availability enum
- Parse weight strings to numbers
- Consolidate description fields
- Rename charges → uses
- Parse costs from notes field

Fixes all [object Object] display issues"
```

**Success Criteria**:
- ✅ All 749 files migrated
- ✅ No JSON syntax errors
- ✅ Backup created successfully
- ✅ Changes committed to git

---

### Phase 3: Update DataModel (30 minutes)

#### Step 3.1: Replace GearData
```bash
# Backup old file
cp src/module/data/item/gear.mjs src/module/data/item/gear-old.mjs

# Replace with new version
mv src/module/data/item/gear-v2.mjs src/module/data/item/gear.mjs
```

#### Step 3.2: Update Module Export
Edit `src/module/data/item/_module.mjs` - verify GearData is exported:
```javascript
export { default as GearData } from "./gear.mjs";
```

#### Step 3.3: Test in Foundry
1. Start Foundry
2. Open compendium "RT Items: Gear"
3. Open any gear item
4. Verify console has no errors
5. Check DataModel migration runs on load

**Success Criteria**:
- ✅ No console errors
- ✅ Items load correctly
- ✅ migrateData() runs on pack items
- ✅ Fields display correct data types

---

### Phase 4: Update Sheet (1 hour)

#### Step 4.1: Replace Sheet Template
```bash
# Backup old template
cp src/templates/item/item-gear-sheet-modern.hbs src/templates/item/item-gear-sheet-modern-old.hbs

# Replace with new version
mv src/templates/item/item-gear-sheet-v2.hbs src/templates/item/item-gear-sheet-modern.hbs
```

#### Step 4.2: Update GearSheet Class
Edit `src/module/applications/item/gear-sheet.mjs`:

```javascript
/** @override */
static DEFAULT_OPTIONS = {
    classes: ["gear"],
    actions: {
        resetUses: GearSheet.#onResetUses,
        consumeUse: GearSheet.#onConsumeUse
    },
    position: {
        width: 600,
        height: 700
    }
};

/* -------------------------------------------- */

/**
 * Handle reset uses action
 * @param {Event} event
 * @param {HTMLElement} target
 */
static async #onResetUses(event, target) {
    await this.item.system.resetUses();
}

/**
 * Handle consume use action
 * @param {Event} event
 * @param {HTMLElement} target
 */
static async #onConsumeUse(event, target) {
    await this.item.system.consume();
}
```

#### Step 4.3: Test Sheet in Foundry
1. Open any gear item sheet
2. Verify all fields display correctly
3. Test category dropdown
4. Test consumable settings
5. Test consume/reset buttons
6. Verify no `[object Object]` displays

**Success Criteria**:
- ✅ Sheet renders without errors
- ✅ All fields display correct values
- ✅ Category shows as dropdown
- ✅ Availability shows as label
- ✅ Weight shows as number
- ✅ Consume button works
- ✅ NO `[object Object]` anywhere

---

### Phase 5: Add Config & Localization (30 minutes)

#### Step 5.1: Update Config
Edit `src/module/config.mjs` - add gear categories section:

```javascript
// Copy content from /tmp/gear-config-addition.mjs
// Insert after craftsmanships section
```

#### Step 5.2: Update Localization
Edit `src/lang/en.json` - add gear strings:

```json
// Copy content from /tmp/gear-localization-addition.json
// Merge into appropriate sections
```

#### Step 5.3: Verify Localization
1. Reload Foundry
2. Open gear item sheet
3. Verify all labels show translated text (not RT.Gear.Category keys)
4. Check category dropdown shows proper labels

**Success Criteria**:
- ✅ All RT.Gear.* keys resolve
- ✅ Category labels show correctly
- ✅ Tooltips work
- ✅ No missing translation warnings

---

### Phase 6: Update Compendium Browser (1 hour)

Edit `src/module/applications/compendium-browser.mjs`:

#### Step 6.1: Add Gear Filters
```javascript
async _getFilterOptions() {
    // ... existing code ...
    
    // Add gear category filter
    if (this._filters.type === "gear") {
        return {
            categories: CONFIG.ROGUE_TRADER.gearCategories,
            availabilities: CONFIG.ROGUE_TRADER.availabilities,
            craftsmanships: CONFIG.ROGUE_TRADER.craftsmanships
        };
    }
}
```

#### Step 6.2: Update Item Cards
Update gear item card template to show:
- Category badge with icon
- Availability badge
- Uses indicator (if consumable)
- Effect preview tooltip

#### Step 6.3: Test Browser
1. Open Compendium Browser
2. Filter by gear type
3. Verify category filter works
4. Test search by name
5. Check item cards display correctly

**Success Criteria**:
- ✅ Gear category filter shows 13 categories
- ✅ Filtering by category works
- ✅ Item cards show category badge
- ✅ Availability displays correctly
- ✅ Search works

---

### Phase 7: Update Actor Integration (1 hour)

#### Step 7.1: Update Loadout Panel
Edit `src/templates/actor/panel/loadout-equipment-panel.hbs`:

Add gear-specific displays:
- Category icon in item cards
- Uses indicator (5/10) for consumables
- Quick consume button
- Effect tooltip

#### Step 7.2: Add Consume Handler
Edit `src/module/applications/actor/acolyte-sheet.mjs`:

```javascript
static DEFAULT_OPTIONS = {
    actions: {
        ...existing,
        consumeGear: AcolyteSheet.#onConsumeGear
    }
};

static async #onConsumeGear(event, target) {
    const itemId = target.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (item) await item.system.consume();
}
```

#### Step 7.3: Test Actor Sheet
1. Add gear items to actor
2. Verify items show in equipment tab
3. Test consume button
4. Verify encumbrance updates
5. Check uses decrement correctly

**Success Criteria**:
- ✅ Gear displays in equipment tab
- ✅ Category icons show
- ✅ Uses display correctly
- ✅ Consume button works from loadout
- ✅ Encumbrance calculates correctly

---

### Phase 8: Testing & Validation (2 hours)

#### Test Checklist

**Data Integrity**:
- [ ] All 749 items load without errors
- [ ] No `[object Object]` displays anywhere
- [ ] All categories mapped correctly
- [ ] All availabilities normalized
- [ ] All weights are numbers

**Sheet Functionality**:
- [ ] Open/edit gear items
- [ ] Category dropdown works
- [ ] Availability dropdown works
- [ ] Craftsmanship dropdown works
- [ ] Weight input accepts numbers
- [ ] Consumable checkbox works
- [ ] Uses increment/decrement
- [ ] Consume button works
- [ ] Reset button works
- [ ] Effect editor works
- [ ] Duration field saves
- [ ] Description editor works
- [ ] Source fields save

**Actor Integration**:
- [ ] Add gear to actor
- [ ] Items show in equipment tab
- [ ] Category icons display
- [ ] Uses show correctly
- [ ] Consume from loadout works
- [ ] Encumbrance calculates
- [ ] Equipped status toggles
- [ ] Stowed status toggles

**Compendium Browser**:
- [ ] Browse gear compendium
- [ ] Filter by category
- [ ] Filter by availability
- [ ] Search by name
- [ ] Item cards display correctly
- [ ] Category badges show
- [ ] Availability badges show

**Edge Cases**:
- [ ] Zero weight items
- [ ] Unlimited uses (max: 0)
- [ ] Exhausted uses (value: 0)
- [ ] Missing description
- [ ] Missing effect
- [ ] Long item names
- [ ] Special characters in names

---

## Rollback Plan

If major issues discovered:

### Option 1: Restore Pack Backup
```bash
# Restore from backup
rm -rf src/packs/rt-items-gear/_source
cp -r src/packs/rt-items-gear/_backup/* src/packs/rt-items-gear/_source/
```

### Option 2: Restore from Tarball
```bash
# Extract backup
tar -xzf rt-items-gear-backup-YYYYMMDD-HHMMSS.tar.gz
```

### Option 3: Git Revert
```bash
# Revert migration commit
git revert HEAD

# Restore old DataModel
mv src/module/data/item/gear-old.mjs src/module/data/item/gear.mjs

# Restore old template
mv src/templates/item/item-gear-sheet-modern-old.hbs src/templates/item/item-gear-sheet-modern.hbs
```

---

## Expected Results

### Before Refactor
- ❌ 749 items show `[object Object]` in availability
- ❌ Weight shows as "1.5kg" string
- ❌ Effects field has "Average" (availability value)
- ❌ Availability field has effect description text
- ❌ Cost and notes are swapped
- ❌ Category shows as "Tool - Device" (not schema field)
- ❌ Compendium browser can't filter properly
- ❌ No consumable/uses functionality

### After Refactor
- ✅ All items display clean, readable data
- ✅ Weight shows as number (1.5 kg)
- ✅ Availability shows as badge ("Average", "Rare", etc.)
- ✅ Effect shows rich HTML description
- ✅ Category shows as icon badge
- ✅ Consumables have uses tracking
- ✅ Consume button works
- ✅ Compendium browser filters by category/availability
- ✅ Actor sheet shows proper gear info
- ✅ Encumbrance calculates correctly
- ✅ Tooltips show full effects

---

## Performance Impact

**Pack Load Time**: Minimal increase (~50ms) due to migrateData() on first load  
**Memory Usage**: No significant change  
**Render Time**: Slightly faster due to cleaner data structure  

---

## Future Enhancements

After refactor is stable, consider:

1. **Active Effects Integration**
   - Link gear effects to character buffs
   - Auto-apply modifiers from equipped gear

2. **Smart Tooltips**
   - Show effect preview on hover
   - Display requirements
   - Show uses remaining

3. **Bulk Actions**
   - Bulk consume multiple uses
   - Bulk reset all consumables
   - Quick equip/unequip sets

4. **Category Presets**
   - "Survival Kit" preset (tent, rations, etc.)
   - "Combat Loadout" preset
   - "Social Event" preset

5. **Acquisition Integration**
   - Link to Profit Factor tests
   - Track acquisition history
   - Suggest availability modifiers

---

## Support

If issues arise:
1. Check console for errors
2. Review migration report
3. Verify pack JSON structure
4. Test with single item first
5. Check AGENTS.md for system architecture
6. Review GEAR_REFACTOR_PLAN.md for mapping tables

---

## Success Metrics

- ✅ **Zero** `[object Object]` displays
- ✅ **100%** items load correctly (749/749)
- ✅ **Zero** console errors
- ✅ **All** tests pass
- ✅ **Compendium browser** fully functional
- ✅ **Actor integration** working
- ✅ **Consumables** functional

---

## Timeline

| Phase | Task | Duration | Status |
|-------|------|----------|--------|
| 1 | Test migration script | 1 hour | ⏳ Pending |
| 2 | Run full migration | 30 min | ⏳ Pending |
| 3 | Update DataModel | 30 min | ⏳ Pending |
| 4 | Update sheet | 1 hour | ⏳ Pending |
| 5 | Config & i18n | 30 min | ⏳ Pending |
| 6 | Compendium browser | 1 hour | ⏳ Pending |
| 7 | Actor integration | 1 hour | ⏳ Pending |
| 8 | Testing | 2 hours | ⏳ Pending |

**Total Estimated Time**: 7.5 hours

---

## Notes

- This is a **major refactor** - test thoroughly before committing
- All changes are **one-way** - migration cannot be automatically reversed
- **Backup everything** before starting
- Test in a **separate Foundry instance** first
- **Document any issues** encountered during migration
- **Update AGENTS.md** after completion

---

## Completion Checklist

- [ ] Migration script tested (dry-run)
- [ ] Sample migration successful
- [ ] Full migration completed
- [ ] DataModel updated
- [ ] Sheet template updated
- [ ] Sheet class updated with actions
- [ ] Config updated with categories
- [ ] Localization added
- [ ] Compendium browser updated
- [ ] Actor integration updated
- [ ] All tests pass
- [ ] No console errors
- [ ] No `[object Object]` displays
- [ ] Documentation updated
- [ ] Changes committed to git
- [ ] AGENTS.md updated

---

**Ready to begin implementation!** 🚀

Start with Phase 1: Test Migration Script
