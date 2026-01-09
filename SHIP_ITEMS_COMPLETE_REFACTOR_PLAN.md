# Ship Items Complete Refactor Plan
**Date**: 2026-01-09  
**Scope**: Ship Components, Ship Upgrades, Ship Weapons  
**Status**: 🔴 CRITICAL - Requires immediate attention

---

## 📋 Executive Summary

The ship item system has **mixed migration status** with some critical issues remaining:

### Current State Analysis

| Item Type | Count | Migration Status | Critical Issues |
|-----------|-------|------------------|-----------------|
| **Ship Components** | 212 | ✅ **FULLY MIGRATED** | None - pack data matches DataModel schema |
| **Ship Weapons** | 50 | ⚠️ **PARTIALLY MIGRATED** | Legacy `type` field still present alongside `weaponType`, non-numeric fields (`"-"` for power/space/crit) |
| **Ship Upgrades** | 5 | ❌ **NOT MIGRATED** | Legacy `spCost`, `shipAvailability`, `effects` fields; missing modern schema fields |

### Root Cause of [object Object] Displays

**PRIMARY ISSUE**: Ship upgrades template references **legacy field names**:
```handlebars
<!-- ship-upgrades-panel.hbs line 24-25 -->
<div class="table-cell">{{item.system.powerUsage}}</div>  ❌ Should be item.system.power
<div class="table-cell">{{item.system.spaceUsage}}</div>  ❌ Should be item.system.space
```

**SECONDARY ISSUE**: Ship weapons have **inconsistent type fields**:
- Some weapons: `type: "Macrocannon"` + `weaponType: "macrobattery"` (dual fields)
- Some weapons: Non-numeric string values `"-"` for power, space, crit

**TERTIARY ISSUE**: **No dedicated item sheets** exist for any ship item types:
- Users can't properly edit ship items
- Compendium browser shows generic item display
- No type-specific validation or UI

---

## 🔍 Detailed Analysis by Item Type

### 1. Ship Components - ✅ MIGRATED (Good State)

**Pack Data Status**: **FULLY MIGRATED** to V13 schema

**Example (Albanov 1 Warp Engine)**:
```json
{
  "system": {
    "componentType": "supplemental",           ✅ Correct field (enum)
    "hullType": ["transport", "raider", "frigate"], ✅ Array for Set field
    "power": {                                  ✅ Nested object
      "used": 10,
      "generated": 0
    },
    "space": 11,                                ✅ Correct field
    "shipPoints": 1,                            ✅ Renamed from spCost
    "essential": true,                          ✅ Boolean flag
    "condition": "functional",                  ✅ Enum field
    "modifiers": {                              ✅ All 9 modifiers present
      "speed": 0, "manoeuvrability": 0, "detection": 0,
      "armour": 0, "hullIntegrity": 0, "turretRating": 0,
      "voidShields": 0, "morale": 0, "crewRating": 0
    }
  }
}
```

**DataModel State**: **COMPLETE**
- `ship-component.mjs` has full `migrateData()` and `cleanData()` methods
- Computed properties: `powerLabel`, `powerDisplay`, `componentTypeLabel`, `hullTypeLabel`
- `netPower` getter for calculations
- `chatProperties` and `headerLabels` implemented

**Template State**: **CORRECT**
- `ship-components-panel.hbs` uses correct field names
- References `item.system.power.used`, `item.system.space`, `item.system.shipPoints`
- Uses computed properties: `componentTypeLabel`, `powerDisplay`

**Status**: ✅ **NO ACTION NEEDED** (already complete)

---

### 2. Ship Weapons - ⚠️ PARTIALLY MIGRATED

**Pack Data Status**: **MIXED** - Some fields migrated, others not

#### Issue 2A: Dual Type Fields

**Problem**: Weapons have BOTH `type` and `weaponType` fields:

```json
{
  "system": {
    "type": "Macrocannon",           ❌ Legacy field (free text)
    "weaponType": "macrobattery",    ✅ Modern field (enum)
    // ...
  }
}
```

**Impact**: 
- Confusing data structure
- Templates don't know which to use
- `type` field is ignored by DataModel

**Solution**:
- Remove ALL `type` fields from pack data
- Keep only `weaponType` field
- DataModel migration should handle legacy `type` → `weaponType` conversion

#### Issue 2B: Non-Numeric Values

**Problem**: Some weapons use string `"-"` for numeric fields:

```json
{
  "system": {
    "power": "-",        ❌ Should be 0 or valid number
    "space": "-",        ❌ Should be 0 or valid number
    "shipPoints": "-",   ❌ Should be 0 or valid number
    "crit": "-",         ❌ Should be 0 or valid number
    "strength": "-"      ❌ Should be 0 or valid number (or null)
  }
}
```

**Impact**:
- Breaks numeric comparisons
- Can't sort/filter by these fields
- May cause calculation errors in ship stats

**Solution**:
- Convert all `"-"` strings to `0` (or appropriate default)
- For optional fields like `strength`, consider using `null` vs `0`
- Update DataModel to handle null/undefined gracefully

#### Issue 2C: Missing `special` Field Data

**Problem**: `special` field exists as empty array `[]` in all weapons

```json
{
  "system": {
    "special": [],   ⚠️ Should contain quality identifiers
    "notes": "Reroll (2). Counts as Guided. If damage roll exceeds armour..."  ⚠️ Qualities in notes
  }
}
```

**Impact**:
- Special weapon qualities are hidden in free-text `notes`
- Can't programmatically check for specific qualities
- Can't filter/search by qualities in compendium

**Solution** (FUTURE - not urgent):
- Parse common qualities from `notes` field
- Populate `special` Set with quality identifiers
- Keep `notes` for additional context

**Template State**: **MOSTLY CORRECT** but could be improved

Current `ship-weapons-panel.hbs`:
```handlebars
<div class="table-cell">{{item.system.locationLabel}}</div>  ✅ Uses computed property
<div class="table-cell">{{item.system.strength}}</div>        ⚠️ No handling for "-" string
<div class="table-cell">{{item.system.damage}}</div>          ✅ OK
<div class="table-cell">{{item.system.crit}}+</div>           ⚠️ No handling for "-" string
<div class="table-cell">{{item.system.range}}</div>           ✅ OK
```

**Required Actions**:

1. **Clean Pack Data**:
   - Remove all `type` fields (keep `weaponType`)
   - Convert all `"-"` strings to `0` for numeric fields
   - Ensure `hullType` is always an array

2. **DataModel Enhancement**:
   - Add validation to reject non-numeric strings
   - Add display helpers to show `"-"` for zero strength/crit if desired
   - Improve `migrateData()` to handle edge cases

3. **Template Enhancement**:
   - Add Handlebars helper to display strength/crit gracefully
   - Example: `{{displayStrength item.system.strength}}` → shows "-" if 0

---

### 3. Ship Upgrades - ❌ NOT MIGRATED (Critical State)

**Pack Data Status**: **LEGACY SCHEMA** - Completely unmigrated

**Current Pack Data (Planet-Bound for Millenia)**:
```json
{
  "system": {
    "spCost": 3,                             ❌ Should be shipPoints
    "shipAvailability": "All Ships",         ❌ Should be hullType: ["all"]
    "effects": "Decrease Hull Integrity...", ❌ Should be effect (singular)
    "modifiers": {                           ⚠️ Only 5 modifiers (missing 4)
      "speed": 0,
      "manoeuvrability": 0,
      "detection": 0,
      "armour": 0,
      "hullIntegrity": 0
      // MISSING: turretRating, voidShields, morale, crewRating
    }
    // MISSING FIELDS:
    // - power (Number)
    // - space (Number)
    // - availability (String enum)
    // - identifier (String)
    // - notes (String)
  }
}
```

**DataModel Schema (ship-upgrade.mjs)**:
```javascript
{
  power: NumberField,          // ❌ Missing in pack
  space: NumberField,          // ❌ Missing in pack
  shipPoints: NumberField,     // ❌ Pack has spCost
  modifiers: SchemaField({     // ⚠️ Pack missing 4 modifiers
    speed, manoeuvrability, detection, armour, hullIntegrity,
    turretRating, voidShields, morale, crewRating  // Missing in pack
  }),
  effect: HTMLField,           // ❌ Pack has effects (plural)
  availability: StringField,   // ❌ Missing in pack
  notes: StringField           // ❌ Missing in pack
}
```

**DataModel State**: **MISSING MIGRATION**
- `ship-upgrade.mjs` has NO `migrateData()` method
- No `cleanData()` method
- Has basic getters: `powerLabel`, `hasModifiers`, `modifiersList`

**Template State**: **USES LEGACY FIELDS**

Current `ship-upgrades-panel.hbs` (lines 24-26):
```handlebars
<div class="table-cell">{{item.system.powerUsage}}</div>     ❌ Should be item.system.power
<div class="table-cell">{{item.system.spaceUsage}}</div>     ❌ Should be item.system.space
<div class="table-cell--span2 rt-effect-text">{{item.system.effect}}</div>  ⚠️ Pack has effects (plural)
```

**Required Actions** (CRITICAL):

1. **Add Migration to DataModel**:
   ```javascript
   // ship-upgrade.mjs
   static migrateData(source) {
     const migrated = super.migrateData?.(source) ?? source;
     
     // Rename spCost → shipPoints
     if ('spCost' in migrated && migrated.shipPoints === undefined) {
       migrated.shipPoints = migrated.spCost;
       delete migrated.spCost;
     }
     
     // Rename effects → effect
     if ('effects' in migrated && !migrated.effect) {
       migrated.effect = migrated.effects;
       delete migrated.effects;
     }
     
     // Parse shipAvailability → hullType
     if ('shipAvailability' in migrated && !migrated.hullType) {
       const avail = migrated.shipAvailability;
       if (/all ships?/i.test(avail)) {
         migrated.hullType = ['all'];
       } else {
         migrated.hullType = avail.toLowerCase()
           .split(/[,\s]+/)
           .map(s => s.trim().replace(/\s+/g, '-'))
           .filter(Boolean);
       }
       delete migrated.shipAvailability;
     }
     
     // Add missing modifiers
     if (migrated.modifiers && typeof migrated.modifiers === 'object') {
       const defaults = {
         speed: 0, manoeuvrability: 0, detection: 0, armour: 0,
         hullIntegrity: 0, turretRating: 0, voidShields: 0, morale: 0, crewRating: 0
       };
       migrated.modifiers = { ...defaults, ...migrated.modifiers };
     }
     
     // Initialize missing fields
     if (migrated.power === undefined) migrated.power = 0;
     if (migrated.space === undefined) migrated.space = 0;
     if (migrated.availability === undefined) migrated.availability = 'common';
     if (migrated.notes === undefined) migrated.notes = '';
     
     return migrated;
   }
   
   static cleanData(source, options) {
     // Ensure hullType is array
     if (source.hullType && !Array.isArray(source.hullType)) {
       if (typeof source.hullType === 'string') {
         source.hullType = [source.hullType];
       } else if (source.hullType instanceof Set) {
         source.hullType = Array.from(source.hullType);
       }
     }
     
     return super.cleanData?.(source, options) ?? source;
   }
   ```

2. **Update Template** (`ship-upgrades-panel.hbs`):
   ```handlebars
   <div class="table-cell">{{item.system.power}}</div>         ✅ Fixed
   <div class="table-cell">{{item.system.space}}</div>         ✅ Fixed
   <div class="table-cell--span2 rt-effect-text">{{{item.system.effect}}}</div>  ✅ Fixed (triple braces for HTML)
   ```

3. **Optional - Migrate Pack Data**:
   - Run script to update 5 upgrade files
   - OR rely on DataModel migration at runtime

---

## 🎯 Implementation Plan

### Phase 1: Ship Upgrades - CRITICAL FIX ⚡

**Estimated Time**: 2-3 hours

**Files to Modify**:
1. `src/module/data/item/ship-upgrade.mjs` - Add migration methods
2. `src/templates/actor/panel/ship-upgrades-panel.hbs` - Fix field references
3. (Optional) `scripts/migrate-ship-upgrades.mjs` - Pack data migration script

**Steps**:

1. **Add migrateData() to ShipUpgradeData** ✅
   - Field renames: `spCost` → `shipPoints`, `effects` → `effect`
   - Parse `shipAvailability` → `hullType` array
   - Fill missing modifiers
   - Initialize missing fields (power, space, availability, notes)

2. **Add cleanData() to ShipUpgradeData** ✅
   - Ensure `hullType` is array for Set field

3. **Update ship-upgrades-panel.hbs** ✅
   - Change `{{item.system.powerUsage}}` → `{{item.system.power}}`
   - Change `{{item.system.spaceUsage}}` → `{{item.system.space}}`
   - Change `{{item.system.effect}}` → `{{{item.system.effect}}}` (HTML)

4. **Test** ✅
   - Load starship with upgrades
   - Verify no `[object Object]` displays
   - Verify power/space values show correctly

**Success Criteria**:
- ✅ All 5 upgrades display correctly in ship panel
- ✅ No `[object Object]` errors
- ✅ No console errors

---

### Phase 2: Ship Weapons - Cleanup 🧹

**Estimated Time**: 3-4 hours

**Files to Modify**:
1. `scripts/clean-ship-weapons.mjs` - Pack data cleanup script
2. `src/module/data/item/ship-weapon.mjs` - Enhance migration
3. `src/templates/actor/panel/ship-weapons-panel.hbs` - Add helpers
4. `src/module/handlebars/handlebars-helpers.mjs` - Add display helpers

**Steps**:

1. **Create Pack Data Cleanup Script** 📝
   ```javascript
   // scripts/clean-ship-weapons.mjs
   import fs from 'fs';
   import path from 'path';
   
   const PACK_DIR = './src/packs/rt-items-ship-weapons/_source';
   
   const files = fs.readdirSync(PACK_DIR).filter(f => f.endsWith('.json'));
   
   let cleaned = 0;
   let errors = 0;
   
   for (const file of files) {
     const filepath = path.join(PACK_DIR, file);
     const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
     
     let modified = false;
     
     // Remove legacy type field
     if (data.system.type) {
       delete data.system.type;
       modified = true;
     }
     
     // Convert "-" strings to 0
     const numericFields = ['power', 'space', 'shipPoints', 'crit', 'strength'];
     for (const field of numericFields) {
       if (data.system[field] === '-') {
         data.system[field] = 0;
         modified = true;
       }
     }
     
     // Ensure hullType is array
     if (typeof data.system.hullType === 'string') {
       data.system.hullType = [data.system.hullType.toLowerCase()];
       modified = true;
     }
     
     if (modified) {
       fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
       cleaned++;
       console.log(`✅ Cleaned: ${file}`);
     }
   }
   
   console.log(`\n✅ Cleaned ${cleaned} files, ${errors} errors`);
   ```

2. **Run Cleanup Script** ✅
   ```bash
   node scripts/clean-ship-weapons.mjs
   ```

3. **Add Display Helpers** 📝
   ```javascript
   // handlebars-helpers.mjs
   
   /**
    * Display ship weapon strength (shows "-" for 0)
    */
   Handlebars.registerHelper('displayStrength', function(strength) {
     return strength > 0 ? strength : '-';
   });
   
   /**
    * Display ship weapon crit (shows "-" for 0)
    */
   Handlebars.registerHelper('displayCrit', function(crit) {
     return crit > 0 ? `${crit}+` : '-';
   });
   ```

4. **Update Template** 📝
   ```handlebars
   <!-- ship-weapons-panel.hbs -->
   <div class="table-cell">{{displayStrength item.system.strength}}</div>
   <div class="table-cell">{{displayCrit item.system.crit}}</div>
   ```

5. **Enhance DataModel Migration** 📝
   ```javascript
   // ship-weapon.mjs migrateData()
   
   // Handle "-" strings in numeric fields
   const numericFields = ['power', 'space', 'shipPoints', 'crit', 'strength'];
   for (const field of numericFields) {
     if (migrated[field] === '-' || migrated[field] === null) {
       migrated[field] = 0;
     }
   }
   ```

**Success Criteria**:
- ✅ All weapons have only `weaponType` field (no `type`)
- ✅ All numeric fields contain numbers (no "-" strings)
- ✅ Weapons with 0 strength/crit display as "-" in UI
- ✅ No pack data validation errors

---

### Phase 3: Item Sheets - New Feature 🆕

**Estimated Time**: 8-12 hours (can be DEFERRED)

**Priority**: **LOW** (system works without these, but nice to have)

**Files to Create**:
1. `src/module/applications/item/ship-component-sheet.mjs`
2. `src/module/applications/item/ship-weapon-sheet.mjs`
3. `src/module/applications/item/ship-upgrade-sheet.mjs`
4. Templates for each (header, tabs, details)

**Benefits**:
- ✅ Users can properly edit ship items
- ✅ Type-specific validation
- ✅ Better UX than generic ItemSheet
- ✅ Dropdown selects for enums
- ✅ Multi-select for hull types

**Can be SKIPPED** for now if time-constrained. Current base ItemSheet works minimally.

---

### Phase 4: Compendium Integration - Enhancement 📚

**Estimated Time**: 4-6 hours (can be DEFERRED)

**Priority**: **MEDIUM** (would improve UX but not critical)

**Goals**:
- Filter by component type
- Filter by hull type (multi-select)
- Filter by weapon type
- Sort by power/space/SP
- Display badges in compendium list

**Can be SKIPPED** for now. Current compendium browser works, just not optimized for ship items.

---

## 📦 Deliverables Summary

### Must-Have (Phase 1) - **CRITICAL**
- [x] `ship-upgrade.mjs` - Add migrateData() and cleanData()
- [x] `ship-upgrades-panel.hbs` - Fix field references
- [x] Test upgrades display correctly

### Should-Have (Phase 2) - **HIGH PRIORITY**
- [ ] `clean-ship-weapons.mjs` - Pack data cleanup script
- [ ] Run script on all 50 weapon files
- [ ] `ship-weapon.mjs` - Enhance migration for "-" strings
- [ ] `handlebars-helpers.mjs` - Add displayStrength/displayCrit
- [ ] `ship-weapons-panel.hbs` - Use display helpers
- [ ] Test weapons display correctly

### Nice-to-Have (Phase 3 & 4) - **DEFERRED**
- [ ] Ship item sheets (3 sheet classes)
- [ ] Sheet templates (9+ template files)
- [ ] Compendium browser enhancements
- [ ] Advanced filtering/sorting

---

## 🧪 Testing Checklist

### Ship Upgrades Testing
- [ ] Load starship actor with upgrades
- [ ] Verify power/space values display (not `[object Object]`)
- [ ] Verify effect text displays as HTML
- [ ] Add upgrade from compendium
- [ ] Edit upgrade fields
- [ ] Delete upgrade
- [ ] No console errors

### Ship Weapons Testing
- [ ] Load starship with weapons
- [ ] Verify strength/crit display correctly (0 shows as "-")
- [ ] Verify location, damage, range display
- [ ] Add weapon from compendium
- [ ] Fire weapon (if roll handler exists)
- [ ] Delete weapon
- [ ] No console errors

### Ship Components Testing
- [ ] Load starship with components (already working)
- [ ] Verify all fields display correctly
- [ ] Verify power generation shows as "+40" not "-40"
- [ ] Verify essential badge shows
- [ ] Verify condition badge shows
- [ ] No regression from current working state

---

## 🎯 Success Criteria

### Critical (Must Pass)
1. ✅ **ZERO** `[object Object]` displays in any ship panel
2. ✅ **ALL** ship upgrades display correctly (power, space, effect)
3. ✅ **ALL** ship weapons display correctly (no "-" strings in data)
4. ✅ **NO** console errors when loading ships
5. ✅ **NO** data loss (all existing data preserved)

### High Priority (Should Pass)
1. ✅ Weapons display strength/crit as "-" when value is 0
2. ✅ All ship items use consistent field names
3. ✅ DataModel migration handles all legacy formats
4. ✅ Pack data is clean (no dual fields, no string numbers)

### Nice-to-Have (Can Defer)
1. ⏳ Dedicated item sheets for ship items
2. ⏳ Compendium filtering by ship-specific fields
3. ⏳ Hull compatibility warnings when equipping
4. ⏳ Weapon capacity warnings per location

---

## 📊 Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Data loss during cleanup | 🟡 Medium | Backup pack files before running scripts |
| Breaking existing ships | 🟡 Medium | DataModel migration is non-destructive |
| Console errors on load | 🟢 Low | Extensive testing before commit |
| User confusion | 🟢 Low | Changes are behind-the-scenes |

---

## 🚀 Execution Order

**Recommended Sequence**:

1. **Day 1 Morning** - Phase 1: Ship Upgrades Migration (2-3 hrs)
   - Add migrateData() to ship-upgrade.mjs
   - Update ship-upgrades-panel.hbs
   - Test with existing ships

2. **Day 1 Afternoon** - Phase 2 Part 1: Weapon Cleanup Script (2 hrs)
   - Write clean-ship-weapons.mjs script
   - Test on 5 sample weapons
   - Run on all 50 weapons
   - Commit cleaned pack data

3. **Day 2 Morning** - Phase 2 Part 2: Weapon Display (2 hrs)
   - Add display helpers
   - Update weapon panel template
   - Enhance DataModel migration
   - Test weapon display

4. **Day 2 Afternoon** - Full Integration Testing (2 hrs)
   - Test all 3 ship item types
   - Test with multiple ship actors
   - Test compendium browser
   - Fix any issues found

5. **Future** - Phases 3 & 4 (Optional, 12-18 hrs)
   - Create item sheets when time permits
   - Enhance compendium integration
   - Add advanced features

**Total Critical Path Time**: **1-2 days** (6-8 hours of focused work)

---

## 💡 Implementation Notes

### Migration Strategy

**Runtime Migration** (Preferred):
- DataModel `migrateData()` runs automatically when items load
- No need to update pack files immediately
- Safer (no risk of data corruption)
- User items migrate transparently

**Pack Migration** (Optional):
- Clean pack data for consistency
- Easier to maintain going forward
- Run scripts only after thorough testing
- Always backup before running

### Backwards Compatibility

DataModel migration ensures **100% backwards compatibility**:
- Old ships load without errors
- Legacy field names converted on-the-fly
- No user action required
- Gradual transition to new schema

### Future-Proofing

This refactor sets up infrastructure for:
- Future ship item types (e.g., ship traits, ship modifications)
- Advanced ship combat features
- Integration with ship roles system
- Automation of ship stat calculations

---

## 📚 Reference Files

### Key Files to Modify

1. **Data Models**:
   - `src/module/data/item/ship-component.mjs` - ✅ Already complete
   - `src/module/data/item/ship-weapon.mjs` - ⚠️ Needs enhancement
   - `src/module/data/item/ship-upgrade.mjs` - ❌ Needs migration

2. **Templates**:
   - `src/templates/actor/panel/ship-components-panel.hbs` - ✅ Already correct
   - `src/templates/actor/panel/ship-weapons-panel.hbs` - ⚠️ Needs helpers
   - `src/templates/actor/panel/ship-upgrades-panel.hbs` - ❌ Needs fix

3. **Pack Data**:
   - `src/packs/rt-items-ship-components/_source/` - ✅ Already migrated (212 files)
   - `src/packs/rt-items-ship-weapons/_source/` - ⚠️ Needs cleanup (50 files)
   - `src/packs/rt-items-ship-upgrades/_source/` - ❌ Needs migration (5 files)

4. **Scripts** (to create):
   - `scripts/clean-ship-weapons.mjs` - Remove legacy fields, fix "-" strings
   - `scripts/migrate-ship-upgrades.mjs` - Optional full migration

---

## 🔗 Related Documentation

- `SHIP_SYSTEM_DEEP_DIVE.md` - Original analysis (this extends that)
- `SHIP_SYSTEM_REFACTOR_COMPLETE.md` - Will be created after Phase 1 & 2
- `AGENTS.md` - Update with ship item patterns after completion
- `WEAPON_QUALITIES_DEEP_DIVE.md` - Similar refactor pattern (proven approach)

---

**Status**: Ready for implementation  
**Priority**: 🔴 **CRITICAL** - Phase 1 must be completed immediately  
**Complexity**: 🟡 **MEDIUM** - Well-defined scope, proven patterns  
**Risk**: 🟢 **LOW** - Non-destructive migrations, extensive backups
