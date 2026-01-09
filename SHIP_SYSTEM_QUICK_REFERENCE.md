# Ship System Refactor - Quick Reference

**Related Documents**:
- 📖 [SHIP_SYSTEM_DEEP_DIVE.md](./SHIP_SYSTEM_DEEP_DIVE.md) - Comprehensive analysis (48KB)
- 🔧 [scripts/migrate-ship-items.mjs](./scripts/migrate-ship-items.mjs) - Migration script (17KB)

---

## 🎯 The Problem

**171 ship components** and **56 ship weapons** have **field name mismatches** between pack data and DataModels:

| Issue | Pack Data | DataModel Expects | Result |
|-------|-----------|-------------------|--------|
| Component type | `type: "(es.) Bridge"` | `componentType: "bridge"` | `[object Object]` |
| Hull type | `hullType: "Raiders, Frigates"` | `hullType: ["raider", "frigate"]` | Broken filters |
| Power | `powerUsage: -40` | `power: { used: 0, generated: 40 }` | Shows "-40" not "+40" |
| Space | `spaceUsage: 1` | `space: 1` | `undefined` |
| Ship Points | `spCost: 1` | `shipPoints: 1` | `undefined` |
| Crit (weapons) | `critRating: 5` | `crit: 5` | `undefined` |

---

## ⚡ Quick Start

### Run Migration (Dry Run First)

```bash
# Preview changes without modifying files
node scripts/migrate-ship-items.mjs --dry-run --verbose

# Run actual migration (creates backup automatically)
node scripts/migrate-ship-items.mjs

# Migrate only components
node scripts/migrate-ship-items.mjs --components

# Migrate only weapons
node scripts/migrate-ship-items.mjs --weapons
```

### What the Script Does

1. ✅ **Backs up** all original files to `src/packs/_backups/ship-items-{timestamp}/`
2. ✅ **Renames fields**: `powerUsage` → `power.used`/`power.generated`, `spaceUsage` → `space`, `spCost` → `shipPoints`
3. ✅ **Parses types**: `"(es.) Bridge"` → `componentType: "bridge"`, `essential: true`
4. ✅ **Converts hull types**: `"Raiders, Frigates"` → `["raider", "frigate"]`
5. ✅ **Adds missing fields**: `condition: "functional"`, `voidShields: 0`, `morale: 0`, `crewRating: 0`
6. ✅ **Generates identifiers**: Creates kebab-case identifiers from item names
7. ✅ **Reports results**: Shows migrated count, skipped (already migrated), errors

---

## 📋 Field Migration Map

### Ship Components

| Old Field | New Field | Transformation |
|-----------|-----------|----------------|
| `system.type` | `system.componentType` | `"(es.) Bridge"` → `"bridge"` + extract `essential: true` |
| `system.powerUsage` | `system.power.used` / `system.power.generated` | Split negative values: `-40` → `{ used: 0, generated: 40 }` |
| `system.spaceUsage` | `system.space` | Direct rename |
| `system.spCost` | `system.shipPoints` | Direct rename |
| `system.hullType` | `system.hullType` | Parse string → array: `"Raiders, Frigates"` → `["raider", "frigate"]` |
| *(missing)* | `system.condition` | Add: `"functional"` |
| *(missing)* | `system.essential` | Extract from `type` prefix `(es.)` |
| *(missing)* | `system.modifiers.voidShields` | Add: `0` |
| *(missing)* | `system.modifiers.morale` | Add: `0` |
| *(missing)* | `system.modifiers.crewRating` | Add: `0` |

### Ship Weapons

| Old Field | New Field | Transformation |
|-----------|-----------|----------------|
| `system.type` | `system.weaponType` | `"Macrocannon"` → `"macrobattery"` |
| `system.powerUsage` | `system.power` | Direct rename |
| `system.spaceUsage` | `system.space` | Direct rename |
| `system.spCost` | `system.shipPoints` | Direct rename |
| `system.critRating` | `system.crit` | Direct rename |
| `system.hullType` | `system.hullType` | Parse string → array: `"All Ships"` → `["all"]` |
| *(missing)* | `system.special` | Add: `[]` (empty Set) |

---

## 🔧 Next Steps After Migration

### 1. Update DataModels (Add Migration Logic)

**File**: `src/module/data/item/ship-component.mjs`

Add `migrateData()` method to handle any remaining legacy data:

```javascript
static migrateData(source) {
  const migrated = super.migrateData(source);
  
  // Handle powerUsage if still present
  if ('powerUsage' in migrated && !migrated.power) {
    const usage = migrated.powerUsage;
    migrated.power = {
      used: usage >= 0 ? usage : 0,
      generated: usage < 0 ? Math.abs(usage) : 0
    };
    delete migrated.powerUsage;
  }
  
  // ... handle other legacy fields
  
  return migrated;
}
```

### 2. Update Templates

**File**: `src/templates/actor/panel/ship-components-panel.hbs`

Change references:

```handlebars
{{!-- OLD (BROKEN) --}}
<div>{{item.system.powerUsage}}</div>
<div>{{item.system.spaceUsage}}</div>
<div>{{item.system.spCost}}</div>

{{!-- NEW (WORKING) --}}
<div>{{item.system.powerDisplay}}</div>  {{!-- Use computed property --}}
<div>{{item.system.space}}</div>
<div>{{item.system.shipPoints}}</div>
```

### 3. Update StarshipSheet

**File**: `src/module/applications/actor/starship-sheet.mjs`

Change `_prepareShipData()`:

```javascript
// OLD
context.powerUsed += component.system.powerUsage || 0;
context.spaceUsed += component.system.spaceUsage || 0;

// NEW
context.powerGenerated += component.system.power?.generated || 0;
context.powerUsed += component.system.power?.used || 0;
context.spaceUsed += component.system.space || 0;
```

---

## 🧪 Testing Checklist

After migration + code updates:

### Visual Tests

- [ ] Open Foundry, navigate to Compendia
- [ ] Open `rt-items-ship-components` compendium
- [ ] **NO** `[object Object]` in component list
- [ ] Component types show as proper labels ("Bridge", "Plasma Drive", not "(es.) Bridge")
- [ ] Hull types show as labels ("Raider, Frigate", not "Raiders, Frigates")

### Starship Actor Tests

- [ ] Create new Starship actor
- [ ] Drag component from compendium to ship
- [ ] **Component panel displays**:
  - [ ] Component type (not `[object Object]`)
  - [ ] Power (shows `+40` for generators, not `-40`)
  - [ ] Space (shows number, not `undefined`)
  - [ ] Ship Points (shows number, not `undefined`)
  - [ ] Condition badge (shows "Functional")
  - [ ] Essential badge (if applicable)

- [ ] **Power/Space calculations work**:
  - [ ] Power available = generated - used
  - [ ] Space available = total - used
  - [ ] Shows warning if shortage

- [ ] Drag weapon from compendium to ship
- [ ] **Weapon panel displays**:
  - [ ] Weapon type (not `[object Object]`)
  - [ ] Location
  - [ ] Strength, Damage, Crit, Range (all populated)

### Data Integrity Tests

- [ ] Check 5-10 migrated components in compendium
- [ ] Open JSON for migrated items (inspect `system` object)
- [ ] **Verify structure**:
  ```json
  {
    "system": {
      "componentType": "bridge",      // ✅ Not "type": "(es.) Bridge"
      "essential": true,               // ✅ Present
      "power": {                       // ✅ Nested object
        "used": 2,
        "generated": 0
      },
      "space": 1,                      // ✅ Not "spaceUsage"
      "shipPoints": 1,                 // ✅ Not "spCost"
      "hullType": ["raider", "frigate"], // ✅ Array, not string
      "condition": "functional",       // ✅ Present
      "modifiers": {
        "voidShields": 0,              // ✅ Present
        "morale": 0,                   // ✅ Present
        "crewRating": 0                // ✅ Present
      }
    }
  }
  ```

---

## 📊 Expected Results

### Before Migration

**Compendium List**:
```
Command Bridge
  Type: [object Object]
  Power: 2
  Space: [object Object]
```

**Starship Sheet Component Panel**:
```
Name: Command Bridge
Type: undefined
Power: 2 (wrong - should use DataModel field)
Space: undefined
SP: undefined
```

### After Migration + Code Updates

**Compendium List**:
```
Command Bridge
  Type: Bridge
  Power: −2
  Space: 1
```

**Starship Sheet Component Panel**:
```
Name: Command Bridge [ES]
Type: Bridge
Power: −2
Space: 1
SP: 1
Condition: Functional
```

---

## ⚠️ Common Issues

### Issue 1: Migration script errors on some items

**Cause**: Unexpected data format in pack files  
**Fix**: Check error message, manually inspect JSON, update script patterns

### Issue 2: Still seeing `[object Object]` after migration

**Cause**: Templates not updated to use new field names  
**Fix**: Update all template references (see "Update Templates" above)

### Issue 3: Power shows as `0` for generators

**Cause**: Template not using `powerDisplay` computed property  
**Fix**: Change `{{item.system.power}}` → `{{item.system.powerDisplay}}`

### Issue 4: Hull type still shows as string

**Cause**: DataModel `cleanData()` not converting string → array  
**Fix**: Add `cleanData()` method to ShipComponentData/ShipWeaponData

---

## 🎯 Success Criteria

| Metric | Target | Check |
|--------|--------|-------|
| Components migrated | 171 / 171 (100%) | ✅ |
| Weapons migrated | 56 / 56 (100%) | ✅ |
| Migration errors | 0 | ✅ |
| `[object Object]` in UI | 0 instances | ✅ |
| Power/space calculations | Working | ✅ |
| Component type labels | Localized | ✅ |
| Hull type filters | Working | ✅ |
| Essential components | Can't be deleted | ✅ |
| Condition badges | Displaying | ✅ |

---

## 📚 Resources

- **SHIP_SYSTEM_DEEP_DIVE.md** - Full analysis, all phases, edge cases
- **scripts/migrate-ship-items.mjs** - Migration script with validation
- **AGENTS.md** - System architecture reference
- **resources/RogueTraderInfo.md** - Rules reference for ship combat

---

## 🚀 Timeline

| Phase | Duration | Description |
|-------|----------|-------------|
| **1. Migration** | 1 day | Run script, validate results |
| **2. DataModel** | 1 day | Add migrateData(), display properties |
| **3. Templates** | 1 day | Update all ship panels |
| **4. Testing** | 1 day | Visual + data integrity tests |
| **TOTAL** | **4 days** | Full ship system fix |

Optional (add 2-3 days):
- Create ship component/weapon item sheets (ApplicationV2)
- Add compendium filtering/sorting
- Implement weapon capacity tracking

---

**Status**: ✅ Ready to execute  
**Risk**: 🟢 Low (proven migration pattern, full backup)  
**Impact**: 🟢 High (fixes critical display issues for entire ship system)
