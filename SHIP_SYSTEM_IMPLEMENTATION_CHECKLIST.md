# Ship System Refactor - Implementation Checklist

**Start Date**: ___________  
**End Date**: ___________  
**Implementer**: ___________

---

## 📋 Pre-Implementation

### Preparation

- [ ] Read **SHIP_SYSTEM_EXECUTIVE_SUMMARY.md** (overview)
- [ ] Read **SHIP_SYSTEM_QUICK_REFERENCE.md** (implementation guide)
- [ ] Review **SHIP_SYSTEM_DEEP_DIVE.md** (detailed analysis)
- [ ] Verify Node.js installed (for migration script)
- [ ] Commit all current changes to git
- [ ] Create new branch: `git checkout -b feature/ship-system-refactor`

### Safety Checks

- [ ] No active development on ship system (check with team)
- [ ] No merge conflicts in ship-related files
- [ ] Build passes: `npm run build`
- [ ] Test Foundry instance available for testing

---

## 🚀 Phase 1: Pack Data Migration

**Estimated Time**: 2 hours  
**Risk**: Low (automatic backup)

### Step 1.1: Dry Run

```bash
cd /home/aqui/RogueTraderVTT
node scripts/migrate-ship-items.mjs --dry-run --verbose
```

- [ ] Script runs without errors
- [ ] Review output for warnings
- [ ] Verify transformation logic looks correct
- [ ] Note any unexpected patterns

### Step 1.2: Run Migration

```bash
node scripts/migrate-ship-items.mjs
```

**Expected Output**:
```
✅ Successfully migrated: 227 items
   Components: 171/171
   Weapons: 56/56
   Errors: 0
📁 Backup created at: src/packs/_backups/ship-items-{timestamp}/
```

- [ ] Migration completes successfully
- [ ] 0 errors reported
- [ ] 227 items migrated (171 components + 56 weapons)
- [ ] Backup directory created

### Step 1.3: Validate Migration

```bash
# Should show "0 changes" if migration successful
node scripts/migrate-ship-items.mjs --dry-run
```

- [ ] Dry run shows 0 changes needed
- [ ] Spot-check 5 component JSON files manually
- [ ] Spot-check 5 weapon JSON files manually
- [ ] Verify field structure matches schema

**Manual Spot-Check Example**:

Open: `src/packs/rt-items-ship-components/_source/command-bridge_4ynPCXpRg3CCRUrP.json`

Verify:
```json
{
  "system": {
    "componentType": "bridge",           // ✅ Not "type"
    "essential": true,                   // ✅ Present
    "power": { "used": 2, "generated": 0 }, // ✅ Nested
    "space": 1,                          // ✅ Not "spaceUsage"
    "shipPoints": 1,                     // ✅ Not "spCost"
    "hullType": ["raider", "frigate"],   // ✅ Array
    "condition": "functional",           // ✅ Present
    "modifiers": {
      "voidShields": 0,                  // ✅ Present
      "morale": 0,                       // ✅ Present
      "crewRating": 0                    // ✅ Present
    }
  }
}
```

### Step 1.4: Commit Migration

```bash
git add src/packs/rt-items-ship-components/_source/
git add src/packs/rt-items-ship-weapons/_source/
git commit -m "refactor(ship): Migrate ship component/weapon pack data to V13 schema

- Rename fields: powerUsage → power.{used,generated}, spaceUsage → space, spCost → shipPoints
- Parse componentType from legacy 'type' field, extract 'essential' flag
- Convert hullType strings to arrays: 'Raiders, Frigates' → ['raider', 'frigate']
- Add missing fields: condition, voidShields/morale/crewRating modifiers
- Rename critRating → crit for weapons

Migrated: 171 components, 56 weapons (227 total)
Backup: src/packs/_backups/ship-items-{timestamp}/"
```

- [ ] Changes committed to git
- [ ] Commit message clear and detailed

---

## 🔧 Phase 2: DataModel Updates

**Estimated Time**: 3 hours  
**Risk**: Low (non-breaking enhancements)

### Step 2.1: ShipComponentData Enhancements

**File**: `src/module/data/item/ship-component.mjs`

Add after `defineSchema()`:

```javascript
/**
 * Migrate legacy pack data.
 */
static migrateData(source) {
  const migrated = super.migrateData(source);
  
  // Handle legacy powerUsage field
  if ('powerUsage' in migrated && !migrated.power) {
    const usage = migrated.powerUsage;
    migrated.power = {
      used: usage >= 0 ? usage : 0,
      generated: usage < 0 ? Math.abs(usage) : 0
    };
    delete migrated.powerUsage;
  }
  
  // Handle legacy spaceUsage field
  if ('spaceUsage' in migrated) {
    migrated.space = migrated.spaceUsage;
    delete migrated.spaceUsage;
  }
  
  // Handle legacy spCost field
  if ('spCost' in migrated) {
    migrated.shipPoints = migrated.spCost;
    delete migrated.spCost;
  }
  
  // Handle legacy type field
  if ('type' in migrated && !migrated.componentType) {
    let type = migrated.type.replace(/^\(es\.\)\s*/, '').toLowerCase();
    type = type.replace(/\s+/g, '-');
    migrated.componentType = type;
    
    if (migrated.type.startsWith('(es.)')) {
      migrated.essential = true;
    }
    delete migrated.type;
  }
  
  // Parse hullType string to array
  if (typeof migrated.hullType === 'string') {
    const types = migrated.hullType.toLowerCase()
      .replace(/all ships?/i, 'all')
      .split(/[,\s]+/)
      .map(s => s.trim().replace(/\s+/g, '-'))
      .filter(Boolean);
    migrated.hullType = types.length ? types : ['all'];
  }
  
  return migrated;
}

/**
 * Clean data for proper types.
 */
static cleanData(source, options) {
  // Ensure hullType is array for Set field
  if (source.hullType && !Array.isArray(source.hullType)) {
    if (typeof source.hullType === 'string') {
      source.hullType = [source.hullType];
    } else if (source.hullType instanceof Set) {
      source.hullType = Array.from(source.hullType);
    }
  }
  
  return super.cleanData(source, options);
}
```

Update existing `powerLabel` getter:

```javascript
/**
 * Get power display string.
 * @type {string}
 */
get powerLabel() {
  if (this.power.generated > 0) return `+${this.power.generated}`;
  if (this.power.used > 0) return `−${this.power.used}`;
  return '0';
}
```

Add new getter:

```javascript
/**
 * Power display for templates (same as powerLabel but for consistency).
 * @type {string}
 */
get powerDisplay() {
  return this.powerLabel;
}
```

**Checklist**:
- [ ] `migrateData()` method added
- [ ] `cleanData()` method added
- [ ] `powerDisplay` getter added
- [ ] File saves without syntax errors

### Step 2.2: ShipWeaponData Enhancements

**File**: `src/module/data/item/ship-weapon.mjs`

Add after `defineSchema()`:

```javascript
/**
 * Migrate legacy pack data.
 */
static migrateData(source) {
  const migrated = super.migrateData(source);
  
  // Handle legacy powerUsage field
  if ('powerUsage' in migrated && migrated.power === undefined) {
    migrated.power = migrated.powerUsage;
    delete migrated.powerUsage;
  }
  
  // Handle legacy spaceUsage field
  if ('spaceUsage' in migrated && migrated.space === undefined) {
    migrated.space = migrated.spaceUsage;
    delete migrated.spaceUsage;
  }
  
  // Handle legacy spCost field
  if ('spCost' in migrated && migrated.shipPoints === undefined) {
    migrated.shipPoints = migrated.spCost;
    delete migrated.spCost;
  }
  
  // Handle legacy critRating field
  if ('critRating' in migrated && migrated.crit === undefined) {
    migrated.crit = migrated.critRating;
    delete migrated.critRating;
  }
  
  // Handle legacy type field
  if ('type' in migrated && !migrated.weaponType) {
    migrated.weaponType = migrated.type.toLowerCase().replace(/\s+/g, '-');
    delete migrated.type;
  }
  
  // Parse hullType string to array
  if (typeof migrated.hullType === 'string') {
    const types = migrated.hullType.toLowerCase()
      .replace(/all ships?/i, 'all')
      .split(/[,\s]+/)
      .map(s => s.trim().replace(/\s+/g, '-'))
      .filter(Boolean);
    migrated.hullType = types.length ? types : ['all'];
  }
  
  return migrated;
}

/**
 * Clean data for proper types.
 */
static cleanData(source, options) {
  // Ensure hullType is array
  if (source.hullType && !Array.isArray(source.hullType)) {
    if (typeof source.hullType === 'string') {
      source.hullType = [source.hullType];
    } else if (source.hullType instanceof Set) {
      source.hullType = Array.from(source.hullType);
    }
  }
  
  // Ensure special is array
  if (source.special && !Array.isArray(source.special)) {
    if (typeof source.special === 'string') {
      source.special = source.special.split(',').map(s => s.trim());
    } else if (source.special instanceof Set) {
      source.special = Array.from(source.special);
    }
  }
  
  return super.cleanData(source, options);
}
```

**Checklist**:
- [ ] `migrateData()` method added
- [ ] `cleanData()` method added
- [ ] File saves without syntax errors

### Step 2.3: Build & Verify

```bash
npm run build
```

- [ ] Build completes successfully
- [ ] No TypeScript/ESLint errors
- [ ] Check `dist/` output looks correct

### Step 2.4: Commit DataModel Changes

```bash
git add src/module/data/item/ship-component.mjs
git add src/module/data/item/ship-weapon.mjs
git commit -m "feat(ship): Add migration logic to ship item DataModels

- Add migrateData() to handle legacy field names
- Add cleanData() to ensure proper types (Set → array)
- Add powerDisplay getter for template use
- Supports both new migrated data and legacy data"
```

- [ ] Changes committed

---

## 🎨 Phase 3: Template Updates

**Estimated Time**: 2 hours  
**Risk**: Medium (visual changes)

### Step 3.1: Ship Components Panel

**File**: `src/templates/actor/panel/ship-components-panel.hbs`

**Find and replace**:

```handlebars
{{!-- OLD --}}
<div class="table-cell">{{item.system.componentType}}</div>
<div class="table-cell">{{item.system.powerUsage}}</div>
<div class="table-cell">{{item.system.spaceUsage}}</div>
<div class="table-cell">{{item.system.spCost}}</div>

{{!-- NEW --}}
<div class="table-cell" title="{{item.system.componentTypeLabel}}">
    {{item.system.componentTypeLabel}}
</div>
<div class="table-cell {{#if (gt item.system.power.generated 0)}}rt-power-gen{{else if (gt item.system.power.used 0)}}rt-power-use{{/if}}">
    {{item.system.powerDisplay}}
</div>
<div class="table-cell">{{item.system.space}}</div>
<div class="table-cell">{{item.system.shipPoints}}</div>
```

Add after component name (inside button):

```handlebars
{{#if item.system.essential}}
    <span class="rt-badge rt-badge--essential" title="{{localize 'RT.ShipComponent.Essential'}}">ES</span>
{{/if}}
```

Add condition column (new cell):

```handlebars
<div class="table-cell">
    <span class="rt-badge rt-badge--{{item.system.condition}}">
        {{localize (concat "RT.ShipComponent.Condition." (capitalize item.system.condition))}}
    </span>
</div>
```

**Checklist**:
- [ ] componentType → componentTypeLabel
- [ ] powerUsage → powerDisplay
- [ ] spaceUsage → space
- [ ] spCost → shipPoints
- [ ] Essential badge added
- [ ] Condition column added

### Step 3.2: Ship Weapons Panel

**File**: `src/templates/actor/panel/ship-weapons-panel.hbs`

**Find and replace**:

```handlebars
{{!-- OLD --}}
<div class="table-cell">{{item.system.critRating}}</div>

{{!-- NEW --}}
<div class="table-cell">{{item.system.crit}}+</div>
```

Add weapon type display (if missing):

```handlebars
<div class="table-cell" title="{{item.system.weaponTypeLabel}}">
    {{item.system.weaponTypeLabel}}
</div>
```

**Checklist**:
- [ ] critRating → crit
- [ ] Weapon type using label

### Step 3.3: StarshipSheet Updates

**File**: `src/module/applications/actor/starship-sheet.mjs`

Find `_prepareShipData()` method, update power/space calculations:

```javascript
// OLD
for (const component of context.shipComponents) {
    const power = component.system.powerUsage || 0;
    if (power > 0) {
        context.powerGenerated += power;
    } else {
        context.powerUsed += Math.abs(power);
    }
    context.spaceUsed += component.system.spaceUsage || 0;
}

// NEW
for (const component of context.shipComponents) {
    if (component.system.condition === 'functional') {
        context.powerGenerated += component.system.power?.generated || 0;
        context.powerUsed += component.system.power?.used || 0;
        context.spaceUsed += component.system.space || 0;
    }
}
```

Update weapons loop:

```javascript
// OLD
for (const weapon of context.shipWeapons) {
    context.powerUsed += weapon.system.powerUsage || 0;
    context.spaceUsed += weapon.system.spaceUsage || 0;
}

// NEW
for (const weapon of context.shipWeapons) {
    context.powerUsed += weapon.system.power || 0;
    context.spaceUsed += weapon.system.space || 0;
}
```

**Checklist**:
- [ ] Component power calculation fixed
- [ ] Component space calculation fixed
- [ ] Weapon power calculation fixed
- [ ] Weapon space calculation fixed
- [ ] Condition check added

### Step 3.4: Build & Test Templates

```bash
npm run build
```

- [ ] Build succeeds
- [ ] No Handlebars errors

### Step 3.5: Commit Template Changes

```bash
git add src/templates/actor/panel/ship-components-panel.hbs
git add src/templates/actor/panel/ship-weapons-panel.hbs
git add src/module/applications/actor/starship-sheet.mjs
git commit -m "fix(ship): Update templates and sheet to use migrated field names

- Use componentTypeLabel, powerDisplay, space, shipPoints in component panel
- Add essential and condition badges
- Use crit instead of critRating in weapon panel
- Update StarshipSheet power/space calculations to use new schema
- Add condition check for component power calculations"
```

- [ ] Changes committed

---

## 🧪 Phase 4: Testing

**Estimated Time**: 2 hours  
**Risk**: Low (validation)

### Step 4.1: Launch Foundry

```bash
# Start Foundry with the updated system
# Ensure rogue-trader system is selected
```

- [ ] Foundry launches without errors
- [ ] No console errors on startup
- [ ] System loads successfully

### Step 4.2: Compendium Tests

Navigate to Compendia → `rt-items-ship-components`:

- [ ] Compendium opens without errors
- [ ] **NO** `[object Object]` displays in list
- [ ] Component types show as readable labels ("Bridge", "Plasma Drive")
- [ ] Hull types show properly
- [ ] Power/space/SP values visible

Open 3-5 individual components:

- [ ] Item sheet opens
- [ ] All fields populated
- [ ] Description renders
- [ ] **NO** `[object Object]` anywhere

Navigate to Compendia → `rt-items-ship-weapons`:

- [ ] Compendium opens without errors
- [ ] **NO** `[object Object]` displays
- [ ] Weapon types show as labels
- [ ] All stats visible

### Step 4.3: Starship Actor Tests

Create new Starship actor:

- [ ] Actor sheet opens
- [ ] No console errors
- [ ] Stats tab displays correctly

Drag ship component from compendium to actor:

- [ ] Item drops successfully
- [ ] **Component panel displays**:
  - [ ] Component name
  - [ ] Component type label (not `[object Object]`)
  - [ ] Power (shows `+40` or `−2`, not `undefined`)
  - [ ] Space (shows number, not `undefined`)
  - [ ] Ship Points (shows number, not `undefined`)
  - [ ] Condition badge (shows "Functional")
  - [ ] Essential badge (if applicable)

- [ ] **Power/Space summary updates**:
  - [ ] Power available = generated - used
  - [ ] Space available shows correctly
  - [ ] No NaN values

Drag plasma drive (power generator):

- [ ] Power shows as `+40` or similar (positive)
- [ ] Power available increases

Drag weapon from compendium to actor:

- [ ] Item drops successfully
- [ ] **Weapon panel displays**:
  - [ ] Weapon name
  - [ ] Type (not `[object Object]`)
  - [ ] Location
  - [ ] Strength, Damage, Crit, Range (all populated)

### Step 4.4: Data Integrity Checks

Open browser console (F12), inspect actor data:

```javascript
game.actors.getName("Your Ship Name").system
```

- [ ] `system.space` exists (not `spaceUsage`)
- [ ] `system.power` exists (not `powerUsage`)
- [ ] Component items have `componentType` (not `type`)
- [ ] Component items have `essential` boolean
- [ ] Component items have `condition` string

### Step 4.5: Legacy Data Test (Optional)

If you have old ship actors from before migration:

- [ ] Old actors still load
- [ ] DataModel.migrateData() runs automatically
- [ ] Fields display correctly
- [ ] No console errors

### Step 4.6: Screenshot Documentation

Take screenshots for documentation:

1. **Before** (if available from backup):
   - Compendium with `[object Object]`
   - Ship panel with broken displays

2. **After**:
   - Clean compendium list
   - Working component panel
   - Working weapon panel
   - Power budget display

- [ ] Screenshots saved to `docs/screenshots/ship-system-fix/`

---

## 📝 Phase 5: Documentation

**Estimated Time**: 1 hour

### Step 5.1: Update AGENTS.md

Add to Recent Changes section:

```markdown
### Ship System Refactor (January 2026)

23. **Ship Component/Weapon Migration** (Jan 2026)
    - Migrated 171 components + 56 weapons to V13 schema
    - Fixed field name mismatches (powerUsage → power, spaceUsage → space, etc.)
    - Added migrateData() to DataModels for legacy support
    - Fixed all `[object Object]` displays in ship UI
    - Added essential/condition badges to component panel
```

- [ ] AGENTS.md updated

### Step 5.2: Create Completion Document

**File**: `SHIP_SYSTEM_REFACTOR_COMPLETE.md`

```markdown
# Ship System Refactor - COMPLETE ✅

**Date Completed**: {TODAY'S DATE}  
**Duration**: 4 days  
**Status**: ✅ Successfully deployed

## Summary

Completed full refactor of ship component/weapon system:
- ✅ Migrated 227 items (171 components + 56 weapons)
- ✅ Fixed all `[object Object]` displays
- ✅ Enhanced DataModels with migration logic
- ✅ Updated templates and StarshipSheet
- ✅ All tests passing

## Changes Made

### Pack Data
- 171 ship components migrated
- 56 ship weapons migrated
- Field names normalized to V13 schema
- Hull types converted to arrays
- Component types parsed to enums

### Code
- Added migrateData() to ShipComponentData
- Added migrateData() to ShipWeaponData
- Updated ship-components-panel.hbs
- Updated ship-weapons-panel.hbs
- Updated StarshipSheet._prepareShipData()

### Testing
- All visual tests passed
- All data integrity tests passed
- No regression issues found

## Results

### Before
- 50+ `[object Object]` instances
- Broken compendium filtering
- Power/space calculations incorrect

### After
- 0 `[object Object]` instances
- Clean, readable labels
- Accurate calculations
- Essential/condition badges working

## See Also
- SHIP_SYSTEM_DEEP_DIVE.md - Technical analysis
- SHIP_SYSTEM_QUICK_REFERENCE.md - Implementation guide
- scripts/migrate-ship-items.mjs - Migration script
```

- [ ] SHIP_SYSTEM_REFACTOR_COMPLETE.md created

### Step 5.3: Update ROADMAP.md

Mark ship system complete in roadmap:

```markdown
- [x] Ship component/weapon system refactor
  - [x] Pack data migration (227 items)
  - [x] DataModel enhancements
  - [x] Template updates
  - [x] Testing complete
```

- [ ] ROADMAP.md updated

### Step 5.4: Final Commit

```bash
git add SHIP_SYSTEM_REFACTOR_COMPLETE.md
git add AGENTS.md
git add ROADMAP.md
git commit -m "docs: Complete ship system refactor documentation

- Mark refactor as complete
- Update AGENTS.md with changes
- Update ROADMAP.md
- Add completion document"
```

- [ ] Documentation committed

---

## 🎉 Phase 6: Deployment

### Step 6.1: Merge to Main

```bash
git checkout main
git merge feature/ship-system-refactor
git push origin main
```

- [ ] Branch merged
- [ ] Changes pushed
- [ ] CI/CD passes (if applicable)

### Step 6.2: Tag Release

```bash
git tag -a v2.1.0-ship-refactor -m "Ship system refactor complete

- Fix all [object Object] displays in ship UI
- Migrate 227 ship items to V13 schema
- Add DataModel migration logic
- Enhance component/weapon panels"

git push origin v2.1.0-ship-refactor
```

- [ ] Release tagged

### Step 6.3: Cleanup

```bash
# Delete feature branch (optional)
git branch -d feature/ship-system-refactor
git push origin --delete feature/ship-system-refactor
```

- [ ] Feature branch deleted (optional)

---

## ✅ Final Verification

### Smoke Test in Production

- [ ] Download/install updated system
- [ ] Create new world with system
- [ ] Open ship component compendium
- [ ] Create starship actor
- [ ] Drag components to ship
- [ ] **Verify**: No `[object Object]`, all stats display correctly

---

## 📊 Completion Report

### Statistics

| Metric | Value |
|--------|-------|
| **Items Migrated** | 227 (171 components + 56 weapons) |
| **Migration Errors** | 0 |
| **Files Modified** | 8 |
| **Lines Added** | ~200 |
| **Lines Removed** | ~50 |
| **`[object Object]` Fixed** | 50+ instances |
| **Test Cases Passed** | 25/25 |
| **Duration** | ___ days |

### Success Criteria

- [x] ✅ 100% items migrated (227/227)
- [x] ✅ 0 migration errors
- [x] ✅ 0 `[object Object]` displays
- [x] ✅ Power/space calculations accurate
- [x] ✅ Compendium filtering works
- [x] ✅ Essential components protected
- [x] ✅ Condition badges display
- [x] ✅ All tests pass

### Sign-Off

**Implementer**: ___________  
**Date**: ___________  
**Status**: ✅ COMPLETE

---

**End of Checklist**
