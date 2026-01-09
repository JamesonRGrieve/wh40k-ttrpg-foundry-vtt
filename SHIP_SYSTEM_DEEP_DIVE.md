# Ship System Deep Dive & Refactor Plan

**Date**: 2026-01-09  
**Scope**: Complete analysis and modernization of Starship system for Rogue Trader VTT  
**Status**: 🔴 Critical - Multiple "[object Object]" issues, schema mismatches, legacy field names

---

## 📋 Executive Summary

The ship system suffers from **systematic field name mismatches** between pack data (legacy structure) and DataModels (V13 structure). This causes `[object Object]` displays throughout the UI in:

1. **Starship actor sheet** - Component/weapon panels
2. **Ship component/weapon compendium items** - Type/hull type fields
3. **Item sheets** (if they exist - none found yet)
4. **Chat messages** - Roll outputs

### Root Causes

| Issue | Impact |
|-------|--------|
| **Legacy field names in pack data** | `powerUsage`, `spaceUsage`, `spCost`, `type`, `hullType` (string) |
| **V13 schema expects different names** | `power.used`, `power.generated`, `space`, `shipPoints`, `componentType`, `hullType` (Set) |
| **No migrateData() logic** | DataModel can't auto-fix mismatched field names |
| **Templates reference legacy names** | `item.system.powerUsage` instead of `item.system.power.used` |
| **No item sheets exist** | Ship components/weapons use base ItemSheet (no customization) |

---

## 📊 Current State Inventory

### Pack Data Statistics

| Pack | Item Count | Structure |
|------|------------|-----------|
| `rt-items-ship-components` | ~171 items | Legacy field names, flat structure |
| `rt-items-ship-weapons` | ~56 items | Legacy field names, flat structure |
| `rt-items-ship-upgrades` | Unknown | Not examined yet |

### Data Model vs Pack Data Mismatch

#### Ship Components

| DataModel Field | Type | Pack Data Field | Type | Status |
|-----------------|------|-----------------|------|--------|
| `componentType` | String (enum) | `type` | String (free text) | ❌ **BROKEN** |
| `hullType` | Set\<String\> | `hullType` | String | ❌ **BROKEN** |
| `power.used` | Number | `powerUsage` | Number (negative for gen) | ❌ **BROKEN** |
| `power.generated` | Number | *(calculated from negative powerUsage)* | - | ❌ **MISSING** |
| `space` | Number | `spaceUsage` | Number | ❌ **BROKEN** |
| `shipPoints` | Number | `spCost` | Number | ❌ **BROKEN** |
| `modifiers.voidShields` | Number | *(missing in pack)* | - | ⚠️ **INCOMPLETE** |
| `modifiers.morale` | Number | *(missing in pack)* | - | ⚠️ **INCOMPLETE** |
| `modifiers.crewRating` | Number | *(missing in pack)* | - | ⚠️ **INCOMPLETE** |
| `condition` | String (enum) | *(missing)* | - | ⚠️ **MISSING** |
| `essential` | Boolean | *(missing)* | - | ⚠️ **MISSING** |

**Example from pack (Command Bridge)**:
```json
{
  "system": {
    "type": "(es.) Bridge",                    // ❌ Should be componentType: "bridge"
    "hullType": "Raiders, Frigates",          // ❌ Should be Set ["raider", "frigate"]
    "powerUsage": 2,                          // ❌ Should be power.used: 2
    "spaceUsage": 1,                          // ❌ Should be space: 1
    "spCost": 1,                              // ❌ Should be shipPoints: 1
    "modifiers": {                             // ⚠️ Missing morale, voidShields, crewRating
      "speed": 0,
      "manoeuvrability": 0,
      "detection": 0,
      "armour": 0,
      "hullIntegrity": 0,
      "turretRating": 0
    }
  }
}
```

**DataModel expects**:
```json
{
  "system": {
    "componentType": "bridge",                          // Enum: essential, supplemental, bridge, etc.
    "hullType": ["raider", "frigate"],                 // Set of hull types
    "power": { "used": 2, "generated": 0 },            // Nested object
    "space": 1,                                        // Flat number
    "shipPoints": 1,                                   // Renamed from spCost
    "modifiers": {
      "speed": 0,
      "manoeuvrability": 0,
      "detection": 0,
      "armour": 0,
      "hullIntegrity": 0,
      "turretRating": 0,
      "voidShields": 0,                                // Missing in pack
      "morale": 0,                                     // Missing in pack
      "crewRating": 0                                  // Missing in pack
    },
    "condition": "functional",                         // Missing in pack
    "essential": false                                 // Missing in pack
  }
}
```

#### Ship Weapons

| DataModel Field | Type | Pack Data Field | Type | Status |
|-----------------|------|-----------------|------|--------|
| `weaponType` | String (enum) | `type` | String (free text) OR `weaponType` | ⚠️ **MIXED** |
| `location` | String (enum) | `location` | String | ✅ OK |
| `hullType` | Set\<String\> | `hullType` | String | ❌ **BROKEN** |
| `power` | Number | `powerUsage` | Number | ❌ **BROKEN** |
| `space` | Number | `spaceUsage` | Number | ❌ **BROKEN** |
| `shipPoints` | Number | `spCost` | Number | ❌ **BROKEN** |
| `strength` | Number | `strength` | Number | ✅ OK |
| `damage` | String | `damage` | String | ✅ OK |
| `crit` | Number | `critRating` | Number | ⚠️ **NAME MISMATCH** |
| `range` | Number | `range` | Number | ✅ OK |
| `special` | Set\<String\> | *(missing)* | - | ⚠️ **MISSING** |

**Example from pack (Mars Pattern Macrocannon)**:
```json
{
  "system": {
    "type": "Macrocannon",                    // ❌ Should be weaponType
    "hullType": "All Ships",                  // ❌ Should be Set ["all"]
    "powerUsage": 4,                          // ❌ Should be power: 4
    "spaceUsage": 2,                          // ❌ Should be space: 2
    "spCost": 1,                              // ❌ Should be shipPoints: 1
    "critRating": 5,                          // ⚠️ Should be crit: 5
    "weaponType": "Macrobattery"              // ✅ Correct field name (inconsistent with type field above)
  }
}
```

---

## 🔍 Problem Analysis

### Problem 1: Legacy Field Names

**Severity**: 🔴 Critical  
**Impact**: 100% of ship components and weapons display incorrectly

**Details**:
- Pack data uses legacy flat field names (`powerUsage`, `spaceUsage`, `spCost`)
- DataModel schema defines V13 nested/renamed fields (`power.used`, `space`, `shipPoints`)
- Foundry's auto-migration can't rename fields (only transform types)
- Result: All power/space/SP values show as `undefined` in UI

**Evidence**:
```javascript
// Template tries to access:
{{item.system.power.used}}              // undefined (pack has powerUsage)
{{item.system.power.generated}}         // undefined (pack has negative powerUsage)
{{item.system.space}}                   // undefined (pack has spaceUsage)
{{item.system.shipPoints}}              // undefined (pack has spCost)

// Pack has:
item.system.powerUsage                  // -40 (for generators)
item.system.spaceUsage                  // 12
item.system.spCost                      // 1
```

### Problem 2: Component Type Field Collision

**Severity**: 🔴 Critical  
**Impact**: Component type displays as free text like "(es.) Bridge" instead of enum

**Details**:
- Pack data has `system.type = "(es.) Bridge"` (human-readable label)
- DataModel expects `system.componentType = "bridge"` (enum key)
- Templates can't localize or filter on free text
- `(es.)` prefix indicates "essential" component (should be separate boolean field)

**Evidence**:
```json
// Pack data:
"type": "(es.) Plasma Drive"      // ❌ Free text with prefix
"type": "(es.) Bridge"             // ❌ Free text with prefix
"type": "(es.) Void Shield"        // ❌ Free text with prefix
"type": "Augment"                  // ⚠️ Valid enum but wrong field name

// Should be:
"componentType": "plasmaDrive"     // ✅ Enum key
"essential": true                  // ✅ Separate boolean
```

### Problem 3: Hull Type String vs Set

**Severity**: 🔴 Critical  
**Impact**: Hull type restrictions don't work, filters broken

**Details**:
- Pack data has `hullType = "Raiders, Frigates"` (comma-separated string)
- DataModel expects `hullType = Set(["raider", "frigate"])` (Set of enum keys)
- Can't filter by hull type in compendium
- Can't check compatibility when equipping components

**Evidence**:
```json
// Pack variations:
"hullType": "All Ships"                    // ❌ String
"hullType": "Raiders, Frigates"            // ❌ String
"hullType": "Transports"                   // ❌ String
"hullType": "Cruiser, Battlecruiser"       // ❌ String

// Should be:
"hullType": ["all"]                        // ✅ Set with enum
"hullType": ["raider", "frigate"]          // ✅ Set with enums
"hullType": ["transport"]                  // ✅ Set with enum
"hullType": ["cruiser", "battlecruiser"]   // ✅ Set with enums
```

### Problem 4: Missing Modifier Fields

**Severity**: 🟡 Medium  
**Impact**: 3 ship stats can't be modified by components

**Details**:
- DataModel defines 9 modifier fields (speed, manoeuvrability, detection, armour, hullIntegrity, turretRating, voidShields, morale, crewRating)
- Pack data only has 6 modifier fields (missing voidShields, morale, crewRating)
- Components that should modify these stats can't (e.g., crew quality affects morale/crewRating)

### Problem 5: Power Generation Logic

**Severity**: 🟡 Medium  
**Impact**: Power budget calculations confusing

**Details**:
- Pack data uses negative `powerUsage` for generators (e.g., `-40` means generates 40 power)
- DataModel has separate `power.used` and `power.generated` fields
- Current logic in StarshipData.prepareEmbeddedData() tries to split negative values
- Confusing UI (shows "-40" instead of "+40 Power")

**Evidence**:
```json
// Pack data for Lathe Pattern Class 1 Drive:
"powerUsage": -40                   // ❌ Negative = generates

// Should be:
"power": {
  "used": 0,
  "generated": 40                   // ✅ Explicit generation
}
```

### Problem 6: No Item Sheets

**Severity**: 🟡 Medium  
**Impact**: Can't edit ship components/weapons properly

**Details**:
- No `ship-component-sheet.mjs` or `ship-weapon-sheet.mjs` files exist
- Items fall back to base ItemSheet (generic, no type-specific fields)
- Can't create new ship items from UI
- Can't properly edit existing items

### Problem 7: Template References Legacy Fields

**Severity**: 🔴 Critical  
**Impact**: Templates display `undefined` or `[object Object]`

**Details**:
- `ship-components-panel.hbs` references `item.system.powerUsage`, `item.system.spaceUsage`, `item.system.spCost`
- `ship-weapons-panel.hbs` references `item.system.powerUsage`, `item.system.spaceUsage`, `item.system.critRating`
- StarshipSheet._prepareShipData() uses legacy field names
- No computed properties to bridge gap

**Evidence**:
```handlebars
{{!-- ship-components-panel.hbs --}}
<div class="table-cell">{{item.system.componentType}}</div>  {{!-- undefined (pack has "type") --}}
<div class="table-cell">{{item.system.powerUsage}}</div>     {{!-- works but wrong field --}}
<div class="table-cell">{{item.system.spaceUsage}}</div>     {{!-- works but wrong field --}}
<div class="table-cell">{{item.system.spCost}}</div>         {{!-- works but wrong field --}}

{{!-- ship-weapons-panel.hbs --}}
<div class="table-cell">{{item.system.critRating}}</div>     {{!-- works but should be crit --}}
```

---

## 🎯 Refactor Strategy

### Phase 1: Pack Data Migration ⚡ **CRITICAL PATH**

**Goal**: Transform all ship component/weapon pack data to match V13 DataModel schema

**Approach**: 
1. Create migration script (similar to weapon/gear migrations)
2. Transform field names systematically
3. Parse and convert data types (strings → Sets, negative powerUsage → power.generated)
4. Add missing fields (condition, essential, special)
5. Validate migrated data

**Migration Script Tasks**:

```javascript
// scripts/migrate-ship-items.mjs

// SHIP COMPONENTS (171 items)
1. Rename: type → componentType
2. Parse componentType:
   - "(es.) Bridge" → componentType: "bridge", essential: true
   - "(es.) Plasma Drive" → componentType: "plasmaDrive", essential: true
   - "Augment" → componentType: "augment", essential: false
   - Map all variants to enum keys

3. Rename: powerUsage → power.used / power.generated
   - If powerUsage < 0: power.generated = Math.abs(powerUsage), power.used = 0
   - If powerUsage >= 0: power.used = powerUsage, power.generated = 0

4. Rename: spaceUsage → space

5. Rename: spCost → shipPoints

6. Parse hullType string → Set
   - "All Ships" → ["all"]
   - "Raiders, Frigates" → ["raider", "frigate"]
   - "Transports" → ["transport"]
   - Normalize to lowercase, replace spaces with hyphens

7. Add missing modifiers fields:
   - modifiers.voidShields: 0
   - modifiers.morale: 0
   - modifiers.crewRating: 0

8. Add missing fields:
   - condition: "functional"
   - essential: (extracted from type prefix)
   - notes: (preserve from existing notes field)

// SHIP WEAPONS (56 items)
1. Rename: type → weaponType (if not already weaponType)
2. Normalize weaponType values:
   - "Macrocannon" → "macrobattery"
   - "Lance" → "lance"
   - "Torpedo" → "torpedo"
   - etc.

3. Rename: powerUsage → power
4. Rename: spaceUsage → space
5. Rename: spCost → shipPoints
6. Rename: critRating → crit

7. Parse hullType string → Set (same as components)

8. Add special field: Set<String>
   - Parse from notes field if contains special qualities
   - Default to empty Set

9. Add missing fields:
   - notes: (preserve)
```

**Validation**:
- All 171 components migrate successfully
- All 56 weapons migrate successfully
- No `null` or `undefined` values in required fields
- All Sets are valid (not empty for hullType unless "all")
- All enums match choices in DataModel

**Success Criteria**:
- ✅ 100% pack data matches DataModel schema
- ✅ All power/space/SP values correct
- ✅ All component types are valid enums
- ✅ All hull types are valid Sets
- ✅ No data loss (preserve notes, descriptions, etc.)

---

### Phase 2: DataModel Enhancement 🔧

**Goal**: Add computed properties and migration logic to DataModels

**ShipComponentData enhancements**:

```javascript
// Add to ship-component.mjs

/**
 * Migrate legacy pack data to V13 schema.
 * @param {object} source  Candidate source data
 * @returns {object}       Migrated data
 */
static migrateData(source) {
  const migrated = super.migrateData(source);
  
  // Rename powerUsage → power.used/generated
  if ('powerUsage' in migrated && !migrated.power) {
    const usage = migrated.powerUsage;
    migrated.power = {
      used: usage >= 0 ? usage : 0,
      generated: usage < 0 ? Math.abs(usage) : 0
    };
    delete migrated.powerUsage;
  }
  
  // Rename spaceUsage → space
  if ('spaceUsage' in migrated) {
    migrated.space = migrated.spaceUsage;
    delete migrated.spaceUsage;
  }
  
  // Rename spCost → shipPoints
  if ('spCost' in migrated) {
    migrated.shipPoints = migrated.spCost;
    delete migrated.spCost;
  }
  
  // Rename type → componentType
  if ('type' in migrated && !migrated.componentType) {
    // Parse "(es.) Bridge" → "bridge"
    let type = migrated.type.replace(/^\(es\.\)\s*/, '');
    type = type.toLowerCase().replace(/\s+/g, '-');
    migrated.componentType = type;
    
    // Extract essential flag
    if (migrated.type.startsWith('(es.)')) {
      migrated.essential = true;
    }
    delete migrated.type;
  }
  
  // Parse hullType string → Set
  if (typeof migrated.hullType === 'string') {
    const types = migrated.hullType.toLowerCase()
      .replace(/all ships?/i, 'all')
      .split(/[,\s]+/)
      .map(s => s.trim().replace(/\s+/g, '-'))
      .filter(Boolean);
    migrated.hullType = types.length ? types : ['all'];
  }
  
  // Ensure modifiers has all fields
  if (migrated.modifiers && typeof migrated.modifiers === 'object') {
    const defaults = {
      speed: 0, manoeuvrability: 0, detection: 0, armour: 0,
      hullIntegrity: 0, turretRating: 0, voidShields: 0, morale: 0, crewRating: 0
    };
    migrated.modifiers = { ...defaults, ...migrated.modifiers };
  }
  
  return migrated;
}

/**
 * Clean data to ensure proper types.
 * @param {object} source  Candidate source data
 * @param {object} options Cleaning options
 * @returns {object}       Cleaned data
 */
static cleanData(source, options) {
  // Ensure hullType is an array (for Set field)
  if (source.hullType && !Array.isArray(source.hullType)) {
    if (typeof source.hullType === 'string') {
      source.hullType = [source.hullType];
    } else if (source.hullType instanceof Set) {
      source.hullType = Array.from(source.hullType);
    }
  }
  
  return super.cleanData(source, options);
}

// Add display properties
get powerDisplay() {
  if (this.power.generated > 0) return `+${this.power.generated}`;
  if (this.power.used > 0) return `−${this.power.used}`;
  return '0';
}

get componentTypeLabel() {
  // Use existing or enhance
  const key = `RT.ShipComponent.Type.${this.componentType.charAt(0).toUpperCase() + this.componentType.slice(1)}`;
  return game.i18n.has(key) ? game.i18n.localize(key) : this.componentType;
}

get hullTypeLabel() {
  if (this.hullType.has('all')) return game.i18n.localize('RT.HullType.All');
  const labels = Array.from(this.hullType).map(type => {
    const key = `RT.HullType.${type.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')}`;
    return game.i18n.localize(key);
  });
  return labels.join(', ');
}
```

**ShipWeaponData enhancements**:

```javascript
// Add to ship-weapon.mjs

static migrateData(source) {
  const migrated = super.migrateData(source);
  
  // Rename powerUsage → power
  if ('powerUsage' in migrated) {
    migrated.power = migrated.powerUsage;
    delete migrated.powerUsage;
  }
  
  // Rename spaceUsage → space
  if ('spaceUsage' in migrated) {
    migrated.space = migrated.spaceUsage;
    delete migrated.spaceUsage;
  }
  
  // Rename spCost → shipPoints
  if ('spCost' in migrated) {
    migrated.shipPoints = migrated.spCost;
    delete migrated.spCost;
  }
  
  // Rename critRating → crit
  if ('critRating' in migrated) {
    migrated.crit = migrated.critRating;
    delete migrated.critRating;
  }
  
  // Rename type → weaponType (if needed)
  if ('type' in migrated && !migrated.weaponType) {
    const typeMap = {
      'macrocannon': 'macrobattery',
      'lance': 'lance',
      'torpedo': 'torpedo',
      'nova cannon': 'nova-cannon',
      'bombardment cannon': 'bombardment-cannon',
      'landing bay': 'landing-bay',
      'attack craft': 'attack-craft'
    };
    const normalized = migrated.type.toLowerCase();
    migrated.weaponType = typeMap[normalized] || normalized;
    delete migrated.type;
  }
  
  // Parse hullType string → Set
  if (typeof migrated.hullType === 'string') {
    const types = migrated.hullType.toLowerCase()
      .replace(/all ships?/i, 'all')
      .split(/[,\s]+/)
      .map(s => s.trim().replace(/\s+/g, '-'))
      .filter(Boolean);
    migrated.hullType = types.length ? types : ['all'];
  }
  
  // Initialize special if missing
  if (!migrated.special) {
    migrated.special = [];
  }
  
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

---

### Phase 3: Template Modernization 🎨

**Goal**: Update all templates to use correct field names and display properties

**ship-components-panel.hbs updates**:

```handlebars
<div class="rt-panel spacer rt-grid-col-6 rt-grid-row-2">
    <h1 class="rt-panel-header">{{localize "RT.Starship.Components.Header"}}</h1>
    <div class="rt-table--border">
        <div class="table-row--head">
            <div class="table-cell--span2">{{localize "RT.Starship.Components.Name"}}</div>
            <div class="table-cell">{{localize "RT.Starship.Components.Type"}}</div>
            <div class="table-cell">{{localize "RT.Starship.Components.Power"}}</div>
            <div class="table-cell">{{localize "RT.Starship.Components.Space"}}</div>
            <div class="table-cell">{{localize "RT.Starship.Components.SP"}}</div>
            <div class="table-cell">{{localize "RT.Starship.Components.Condition"}}</div>
            <div class="table-cell--last">
                <label class="rt-control-button" data-action="itemCreate" data-item-type="shipComponent">
                    <span class="rt-control-button__span material-icons">add_circle</span>
                </label>
            </div>
        </div>
        {{#each shipComponents as |item|}}
            <div class="table-row {{#unless item.system.isOperational}}rt-component-damaged{{/unless}}">
                <div class="table-cell--span2">
                    <button class="item-name rt-item-button" data-action="itemEdit" data-item-id="{{item.id}}" type="button">
                        <img class="rt-item-img" src="{{item.img}}" alt="{{item.name}}" />
                        {{item.name}}
                        {{#if item.system.essential}}
                            <span class="rt-badge rt-badge--essential" title="{{localize 'RT.ShipComponent.Essential'}}">ES</span>
                        {{/if}}
                    </button>
                </div>
                <div class="table-cell" title="{{item.system.componentTypeLabel}}">
                    {{item.system.componentTypeLabel}}
                </div>
                <div class="table-cell {{#if (gt item.system.power.generated 0)}}rt-power-gen{{else if (gt item.system.power.used 0)}}rt-power-use{{/if}}">
                    {{item.system.powerDisplay}}
                </div>
                <div class="table-cell">{{item.system.space}}</div>
                <div class="table-cell">{{item.system.shipPoints}}</div>
                <div class="table-cell">
                    <span class="rt-badge rt-badge--{{item.system.condition}}">
                        {{localize (concat "RT.ShipComponent.Condition." (capitalize item.system.condition))}}
                    </span>
                </div>
                <div class="table-cell--last">
                    <label class="rt-control-button" data-action="itemEdit" data-item-id="{{item.id}}">
                        <span class="rt-control-button__span material-icons">settings</span>
                    </label>
                    {{#unless item.system.essential}}
                        <label class="rt-control-button" data-action="itemDelete" data-item-id="{{item.id}}">
                            <span class="rt-control-button__span material-icons">delete</span>
                        </label>
                    {{/unless}}
                </div>
            </div>
        {{/each}}
    </div>
    
    {{!-- Component Status Summary --}}
    <div class="rt-component-summary">
        <div class="rt-summary-item">
            <span class="rt-summary-label">{{localize "RT.Starship.Components.TotalPower"}}</span>
            <span class="rt-summary-value {{#if actor.system.hasPowerShortage}}rt-text-danger{{/if}}">
                {{powerGenerated}} / {{powerUsed}} ({{powerAvailable}})
            </span>
        </div>
        <div class="rt-summary-item">
            <span class="rt-summary-label">{{localize "RT.Starship.Components.TotalSpace"}}</span>
            <span class="rt-summary-value {{#if actor.system.hasSpaceShortage}}rt-text-danger{{/if}}">
                {{spaceUsed}} / {{actor.system.space.total}} ({{spaceAvailable}})
            </span>
        </div>
    </div>
</div>
```

**ship-weapons-panel.hbs updates**:

```handlebars
<div class="rt-panel spacer rt-grid-col-6 rt-grid-row-2">
    <h1 class="rt-panel-header">{{localize "RT.Starship.Weapons.Header"}}</h1>
    <div class="rt-table--border">
        <div class="table-row--head">
            <div class="table-cell--span2">{{localize "RT.Starship.Weapons.Name"}}</div>
            <div class="table-cell">{{localize "RT.Starship.Weapons.Type"}}</div>
            <div class="table-cell">{{localize "RT.Starship.Weapons.Location"}}</div>
            <div class="table-cell">{{localize "RT.Starship.Weapons.Strength"}}</div>
            <div class="table-cell">{{localize "RT.Starship.Weapons.Damage"}}</div>
            <div class="table-cell">{{localize "RT.Starship.Weapons.Crit"}}</div>
            <div class="table-cell">{{localize "RT.Starship.Weapons.Range"}}</div>
            <div class="table-cell--last">
                <label class="rt-control-button" data-action="itemCreate" data-item-type="shipWeapon">
                    <span class="rt-control-button__span material-icons">add_circle</span>
                </label>
            </div>
        </div>
        {{#each shipWeapons as |item|}}
            <div class="table-row">
                <div class="table-cell--span2">
                    <button class="item-name rt-item-button" data-action="itemEdit" data-item-id="{{item.id}}" type="button">
                        <img class="rt-item-img" src="{{item.img}}" alt="{{item.name}}" />
                        {{item.name}}
                    </button>
                </div>
                <div class="table-cell" title="{{item.system.weaponTypeLabel}}">
                    {{item.system.weaponTypeLabel}}
                </div>
                <div class="table-cell">{{item.system.locationLabel}}</div>
                <div class="table-cell">{{item.system.strength}}</div>
                <div class="table-cell">{{item.system.damage}}</div>
                <div class="table-cell">{{item.system.crit}}+</div>
                <div class="table-cell">{{item.system.range}} VU</div>
                <div class="table-cell--last">
                    <label class="rt-control-button" data-action="fireShipWeapon" data-item-id="{{item.id}}" title="{{localize 'RT.Starship.Weapons.Fire'}}">
                        <span class="rt-control-button__span material-icons">gps_fixed</span>
                    </label>
                    <label class="rt-control-button" data-action="itemDelete" data-item-id="{{item.id}}">
                        <span class="rt-control-button__span material-icons">delete</span>
                    </label>
                </div>
            </div>
        {{/each}}
    </div>
    
    {{!-- Weapon Capacity Summary --}}
    <div class="rt-weapon-capacity">
        <h3>{{localize "RT.Starship.WeaponCapacity.Header"}}</h3>
        <div class="rt-capacity-grid">
            {{#each weaponCapacity as |cap location|}}
                <div class="rt-capacity-item">
                    <span class="rt-capacity-label">{{localize (concat "RT.Starship.WeaponCapacity." (capitalize location))}}</span>
                    <span class="rt-capacity-value">{{cap.used}} / {{cap.max}}</span>
                </div>
            {{/each}}
        </div>
    </div>
</div>
```

**StarshipSheet._prepareShipData() updates**:

```javascript
_prepareShipData(context) {
    const items = this.actor.items;

    // Get ship items grouped by type
    context.shipComponents = items.filter(item => item.type === "shipComponent");
    context.shipWeapons = items.filter(item => item.type === "shipWeapon");
    context.shipUpgrades = items.filter(item => item.type === "shipUpgrade");
    context.shipRoles = items.filter(item => item.type === "shipRole");

    // Calculate power and space (use DataModel fields)
    context.powerGenerated = 0;
    context.powerUsed = 0;
    context.spaceUsed = 0;

    for (const component of context.shipComponents) {
        if (component.system.condition === 'functional') {
            context.powerGenerated += component.system.power?.generated || 0;
            context.powerUsed += component.system.power?.used || 0;
            context.spaceUsed += component.system.space || 0;
        }
    }

    for (const weapon of context.shipWeapons) {
        context.powerUsed += weapon.system.power || 0;
        context.spaceUsed += weapon.system.space || 0;
    }

    for (const upgrade of context.shipUpgrades) {
        context.powerGenerated += upgrade.system.power?.generated || 0;
        context.powerUsed += upgrade.system.power?.used || 0;
        context.spaceUsed += upgrade.system.space || 0;
    }

    context.powerAvailable = context.powerGenerated - context.powerUsed;
    context.spaceAvailable = (this.actor.system.space?.total || 0) - context.spaceUsed;
    
    // Calculate weapon capacity by location
    context.weaponCapacity = {
        prow: { max: this.actor.system.weaponCapacity.prow, used: 0 },
        dorsal: { max: this.actor.system.weaponCapacity.dorsal, used: 0 },
        port: { max: this.actor.system.weaponCapacity.port, used: 0 },
        starboard: { max: this.actor.system.weaponCapacity.starboard, used: 0 },
        keel: { max: this.actor.system.weaponCapacity.keel, used: 0 }
    };
    
    for (const weapon of context.shipWeapons) {
        const loc = weapon.system.location;
        if (context.weaponCapacity[loc]) {
            context.weaponCapacity[loc].used++;
        }
    }
}
```

---

### Phase 4: Item Sheets Creation 📝

**Goal**: Create dedicated ApplicationV2 item sheets for ship components and weapons

**File**: `src/module/applications/item/ship-component-sheet.mjs`

```javascript
import BaseItemSheet from "./base-item-sheet.mjs";

export default class ShipComponentSheet extends BaseItemSheet {
    static DEFAULT_OPTIONS = {
        classes: ["ship-component"],
        position: { width: 600, height: 700 }
    };

    static PARTS = {
        header: {
            template: "systems/rogue-trader/templates/item/ship-component/header.hbs"
        },
        tabs: {
            template: "systems/rogue-trader/templates/item/ship-component/tabs.hbs"
        },
        details: {
            template: "systems/rogue-trader/templates/item/ship-component/tab-details.hbs",
            container: { classes: ["rt-body"], id: "tab-body" },
            scrollable: [""]
        },
        effects: {
            template: "systems/rogue-trader/templates/item/ship-component/tab-effects.hbs",
            container: { classes: ["rt-body"], id: "tab-body" },
            scrollable: [""]
        }
    };

    static TABS = [
        { tab: "details", label: "RT.Item.Tabs.Details", group: "primary" },
        { tab: "effects", label: "RT.Item.Tabs.Effects", group: "primary" }
    ];

    tabGroups = { primary: "details" };

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        
        // Add CONFIG choices
        context.componentTypes = CONFIG.rt.shipComponentTypes;
        context.hullTypes = CONFIG.rt.hullTypes;
        context.availabilities = CONFIG.rt.availability;
        context.conditions = CONFIG.rt.shipConditions;
        
        return context;
    }
}
```

**File**: `src/module/applications/item/ship-weapon-sheet.mjs`

```javascript
import BaseItemSheet from "./base-item-sheet.mjs";

export default class ShipWeaponSheet extends BaseItemSheet {
    static DEFAULT_OPTIONS = {
        classes: ["ship-weapon"],
        position: { width: 600, height: 700 }
    };

    static PARTS = {
        header: {
            template: "systems/rogue-trader/templates/item/ship-weapon/header.hbs"
        },
        tabs: {
            template: "systems/rogue-trader/templates/item/ship-weapon/tabs.hbs"
        },
        details: {
            template: "systems/rogue-trader/templates/item/ship-weapon/tab-details.hbs",
            container: { classes: ["rt-body"], id: "tab-body" },
            scrollable: [""]
        },
        effects: {
            template: "systems/rogue-trader/templates/item/ship-weapon/tab-effects.hbs",
            container: { classes: ["rt-body"], id: "tab-body" },
            scrollable: [""]
        }
    };

    static TABS = [
        { tab: "details", label: "RT.Item.Tabs.Details", group: "primary" },
        { tab: "effects", label: "RT.Item.Tabs.Effects", group: "primary" }
    ];

    tabGroups = { primary: "details" };

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        
        // Add CONFIG choices
        context.weaponTypes = CONFIG.rt.shipWeaponTypes;
        context.locations = CONFIG.rt.shipWeaponLocations;
        context.hullTypes = CONFIG.rt.hullTypes;
        context.availabilities = CONFIG.rt.availability;
        context.specialQualities = CONFIG.rt.shipWeaponSpecial;
        
        return context;
    }
}
```

**Register in `_module.mjs`**:

```javascript
export { default as ShipComponentSheet } from "./ship-component-sheet.mjs";
export { default as ShipWeaponSheet } from "./ship-weapon-sheet.mjs";
```

---

### Phase 5: CONFIG Integration 🔧

**Goal**: Add ship-specific CONFIG entries for dropdowns and labels

**File**: `src/module/config.mjs`

Add to `CONFIG.rt`:

```javascript
// Ship Component Types
rt.shipComponentTypes = {
  essential: "RT.ShipComponent.Type.Essential",
  supplemental: "RT.ShipComponent.Type.Supplemental",
  weapons: "RT.ShipComponent.Type.Weapons",
  auger: "RT.ShipComponent.Type.Auger",
  gellarField: "RT.ShipComponent.Type.GellarField",
  voidShields: "RT.ShipComponent.Type.VoidShields",
  warpDrive: "RT.ShipComponent.Type.WarpDrive",
  lifeSupport: "RT.ShipComponent.Type.LifeSupport",
  quarters: "RT.ShipComponent.Type.Quarters",
  bridge: "RT.ShipComponent.Type.Bridge",
  generatorum: "RT.ShipComponent.Type.Generatorum",
  plasmaDrive: "RT.ShipComponent.Type.PlasmaDrive",
  augment: "RT.ShipComponent.Type.Augment",
  archeotech: "RT.ShipComponent.Type.Archeotech",
  xenotech: "RT.ShipComponent.Type.Xenotech"
};

// Hull Types
rt.hullTypes = {
  all: "RT.HullType.All",
  transport: "RT.HullType.Transport",
  raider: "RT.HullType.Raider",
  frigate: "RT.HullType.Frigate",
  "light-cruiser": "RT.HullType.LightCruiser",
  cruiser: "RT.HullType.Cruiser",
  battlecruiser: "RT.HullType.Battlecruiser",
  "grand-cruiser": "RT.HullType.GrandCruiser"
};

// Ship Weapon Types
rt.shipWeaponTypes = {
  macrobattery: "RT.ShipWeapon.Type.Macrobattery",
  lance: "RT.ShipWeapon.Type.Lance",
  "nova-cannon": "RT.ShipWeapon.Type.NovaCannon",
  torpedo: "RT.ShipWeapon.Type.Torpedo",
  "bombardment-cannon": "RT.ShipWeapon.Type.BombardmentCannon",
  "landing-bay": "RT.ShipWeapon.Type.LandingBay",
  "attack-craft": "RT.ShipWeapon.Type.AttackCraft"
};

// Ship Weapon Locations
rt.shipWeaponLocations = {
  prow: "RT.ShipLocation.Prow",
  dorsal: "RT.ShipLocation.Dorsal",
  port: "RT.ShipLocation.Port",
  starboard: "RT.ShipLocation.Starboard",
  keel: "RT.ShipLocation.Keel"
};

// Ship Component Conditions
rt.shipConditions = {
  functional: "RT.ShipComponent.Condition.Functional",
  damaged: "RT.ShipComponent.Condition.Damaged",
  unpowered: "RT.ShipComponent.Condition.Unpowered",
  destroyed: "RT.ShipComponent.Condition.Destroyed"
};

// Ship Weapon Special Qualities
rt.shipWeaponSpecial = {
  "high-damage": "RT.ShipWeapon.Special.HighDamage",
  "accurate": "RT.ShipWeapon.Special.Accurate",
  "unreliable": "RT.ShipWeapon.Special.Unreliable",
  "slow": "RT.ShipWeapon.Special.Slow",
  // ... add more as needed
};
```

---

### Phase 6: Localization 🌍

**Goal**: Add all missing i18n keys

**File**: `src/lang/en.json`

Add to existing Starship section:

```json
{
  "RT": {
    "ShipComponent": {
      "Type": {
        "Essential": "Essential",
        "Supplemental": "Supplemental",
        "Weapons": "Weapons",
        "Auger": "Auger Array",
        "GellarField": "Gellar Field",
        "VoidShields": "Void Shields",
        "WarpDrive": "Warp Drive",
        "LifeSupport": "Life Support",
        "Quarters": "Crew Quarters",
        "Bridge": "Bridge",
        "Generatorum": "Generatorum",
        "PlasmaDrive": "Plasma Drive",
        "Augment": "Augmentation",
        "Archeotech": "Archeotech",
        "Xenotech": "Xenotech"
      },
      "Condition": {
        "Functional": "Functional",
        "Damaged": "Damaged",
        "Unpowered": "Unpowered",
        "Destroyed": "Destroyed"
      },
      "Essential": "Essential Component",
      "Power": "Power",
      "Space": "Space",
      "ShipPoints": "SP"
    },
    "ShipWeapon": {
      "Type": {
        "Macrobattery": "Macrobattery",
        "Lance": "Lance Weapon",
        "NovaCannon": "Nova Cannon",
        "Torpedo": "Torpedo Tubes",
        "BombardmentCannon": "Bombardment Cannon",
        "LandingBay": "Landing Bay",
        "AttackCraft": "Attack Craft"
      },
      "Special": {
        "HighDamage": "High Damage",
        "Accurate": "Accurate",
        "Unreliable": "Unreliable",
        "Slow": "Slow"
      }
    },
    "HullType": {
      "All": "All Ships",
      "Transport": "Transport",
      "Raider": "Raider",
      "Frigate": "Frigate",
      "LightCruiser": "Light Cruiser",
      "Cruiser": "Cruiser",
      "Battlecruiser": "Battlecruiser",
      "GrandCruiser": "Grand Cruiser"
    },
    "ShipLocation": {
      "Prow": "Prow",
      "Dorsal": "Dorsal",
      "Port": "Port",
      "Starboard": "Starboard",
      "Keel": "Keel"
    }
  }
}
```

---

### Phase 7: Compendium Integration 📚

**Goal**: Ensure ship items display properly in compendium browser

**Considerations**:
- Component type should be filterable
- Hull type should be filterable (multi-select for Set field)
- Power/space/SP should be sortable
- Condition badge should show in compendium list

**If compendium browser exists**, add ship item type handlers.

---

## 🧪 Testing Strategy

### Unit Tests

**Test Pack Data Migration**:
```javascript
// Test 1: Component field rename
const source = {
  type: "(es.) Bridge",
  powerUsage: 2,
  spaceUsage: 1,
  spCost: 1,
  hullType: "Raiders, Frigates"
};

const migrated = ShipComponentData.migrateData(source);
assert.equal(migrated.componentType, "bridge");
assert.equal(migrated.essential, true);
assert.equal(migrated.power.used, 2);
assert.equal(migrated.space, 1);
assert.equal(migrated.shipPoints, 1);
assert.deepEqual(Array.from(migrated.hullType), ["raider", "frigate"]);

// Test 2: Power generation
const generator = {
  type: "Plasma Drive",
  powerUsage: -40,
  spaceUsage: 12,
  spCost: 8
};

const migratedGen = ShipComponentData.migrateData(generator);
assert.equal(migratedGen.power.used, 0);
assert.equal(migratedGen.power.generated, 40);

// Test 3: Weapon migration
const weaponSource = {
  type: "Macrocannon",
  powerUsage: 4,
  spaceUsage: 2,
  spCost: 1,
  critRating: 5,
  hullType: "All Ships"
};

const migratedWeapon = ShipWeaponData.migrateData(weaponSource);
assert.equal(migratedWeapon.weaponType, "macrobattery");
assert.equal(migratedWeapon.power, 4);
assert.equal(migratedWeapon.space, 2);
assert.equal(migratedWeapon.shipPoints, 1);
assert.equal(migratedWeapon.crit, 5);
assert.deepEqual(Array.from(migratedWeapon.hullType), ["all"]);
```

### Integration Tests

1. **Load Starship Actor**
   - Verify all components load without errors
   - Verify power/space calculations correct
   - Verify no `[object Object]` in UI

2. **Add Component to Ship**
   - Drag component from compendium to ship
   - Verify power/space updates
   - Verify component shows in panel with correct data

3. **Edit Component**
   - Open component sheet (if implemented)
   - Change fields
   - Verify changes persist

4. **Delete Component**
   - Remove component from ship
   - Verify power/space recalculates
   - Verify essential components can't be deleted

5. **Ship Weapon Tests**
   - Add weapon to ship
   - Verify location capacity updates
   - Fire weapon (if roll handler exists)
   - Verify chat output shows correct data

### Visual Tests

**Before Migration**: Take screenshots showing:
- `[object Object]` displays in component panel
- `undefined` in power/space fields
- Broken type labels

**After Migration**: Take screenshots showing:
- Clean component type labels
- Proper power display (+40, -2, etc.)
- Hull type labels (not "All Ships" string)
- Condition badges
- Essential badges

---

## 📦 Deliverables

### Phase 1: Migration Script
- [ ] `scripts/migrate-ship-items.mjs` - Migration script
- [ ] Backup of original pack data
- [ ] Migration report (items migrated, errors, warnings)
- [ ] Validated pack data (171 components + 56 weapons)

### Phase 2: DataModel Updates
- [ ] `ship-component.mjs` - Add migrateData(), cleanData(), display properties
- [ ] `ship-weapon.mjs` - Add migrateData(), cleanData(), display properties
- [ ] Unit tests for migration logic

### Phase 3: Template Updates
- [ ] `ship-components-panel.hbs` - Use correct field names, add badges
- [ ] `ship-weapons-panel.hbs` - Use correct field names, add capacity
- [ ] `starship-sheet.mjs` - Update _prepareShipData()

### Phase 4: Item Sheets (Optional but Recommended)
- [ ] `ship-component-sheet.mjs` - ApplicationV2 sheet
- [ ] `ship-weapon-sheet.mjs` - ApplicationV2 sheet
- [ ] Template files for each sheet (header, tabs, details)

### Phase 5: CONFIG
- [ ] `config.mjs` - Add ship-specific CONFIG entries
- [ ] Register new CONFIG keys

### Phase 6: Localization
- [ ] `en.json` - Add all ship-related i18n keys
- [ ] Verify all labels display correctly

### Phase 7: Documentation
- [ ] Update AGENTS.md with ship system details
- [ ] Update ROADMAP.md to mark ship system complete
- [ ] Create SHIP_SYSTEM_REFACTOR_COMPLETE.md

---

## 🎯 Success Criteria

### Must Have ✅
1. ✅ **Zero** `[object Object]` displays in ship UI
2. ✅ **100%** pack data migrated (171 components + 56 weapons)
3. ✅ **All** power/space/SP values display correctly
4. ✅ **All** component types show as localized labels
5. ✅ **All** hull types show as localized labels
6. ✅ **Power generation** shows as `+40` not `-40`
7. ✅ **Essential components** can't be deleted
8. ✅ **Condition badges** show component state

### Should Have 🎨
1. Component/weapon item sheets (ApplicationV2)
2. Compendium filtering by type/hull
3. Weapon capacity tracking per location
4. Power/space shortage warnings

### Nice to Have 🚀
1. Component condition toggle in sheet
2. Weapon firing roll dialog
3. Component damage effects on ship stats
4. Hull compatibility warnings when equipping

---

## 🔄 Migration Path

### Recommended Order

1. **Week 1**: Pack data migration
   - Day 1-2: Write migration script
   - Day 3: Run migration, validate
   - Day 4: Manual spot-check 20+ items
   - Day 5: Commit migrated pack data

2. **Week 2**: DataModel & templates
   - Day 1-2: Add migrateData()/cleanData() to DataModels
   - Day 3: Update ship-components-panel.hbs
   - Day 4: Update ship-weapons-panel.hbs
   - Day 5: Test in Foundry, fix issues

3. **Week 3**: Polish & item sheets (optional)
   - Day 1-2: Create ship-component-sheet.mjs
   - Day 3-4: Create ship-weapon-sheet.mjs
   - Day 5: Final testing & documentation

---

## 🐛 Known Issues & Edge Cases

### Issue 1: Dual Type Fields in Weapons
Some weapons have both `type: "Macrocannon"` and `weaponType: "Macrobattery"`. Migration should:
- Prioritize `weaponType` if present
- Otherwise migrate `type` → `weaponType`

### Issue 2: Special Qualities in Notes
Many weapons have special qualities in `notes` field like "Lance Weapons Ignore Armour". These should:
- Be preserved in `notes`
- Optionally extracted to `special` Set field

### Issue 3: Hull Type Variations
Pack data has inconsistent hull type strings:
- "All Ships"
- "Raiders, Frigates"
- "Transports"
- "Cruiser, Battlecruiser, Grand Cruiser"

Migration must normalize all to lowercase hyphenated enums:
- ["all"]
- ["raider", "frigate"]
- ["transport"]
- ["cruiser", "battlecruiser", "grand-cruiser"]

### Issue 4: Component Type Prefixes
Pack uses `(es.)` prefix for essential. Migration must:
- Strip prefix
- Set `essential: true`
- Map clean type name to enum

---

## 📚 Reference Materials

### Pack Data Samples

**Component (Command Bridge)**:
```json
{
  "name": "Command Bridge",
  "type": "shipComponent",
  "system": {
    "type": "(es.) Bridge",
    "hullType": "Raiders, Frigates",
    "powerUsage": 2,
    "spaceUsage": 1,
    "spCost": 1,
    "effect": "Where characters command the ship...",
    "modifiers": { "speed": 0, "manoeuvrability": 0, ... }
  }
}
```

**Component (Plasma Drive)**:
```json
{
  "name": "Lathe Pattern Class 1 Drive",
  "type": "shipComponent",
  "system": {
    "type": "(es.) Plasma Drive",
    "hullType": "Transports",
    "powerUsage": -40,
    "spaceUsage": 12,
    "spCost": 1,
    "effect": "Generates power rather than using it.",
    "modifiers": { ... }
  }
}
```

**Weapon (Macrocannon)**:
```json
{
  "name": "Mars Pattern Macrocannon",
  "type": "shipWeapon",
  "system": {
    "type": "Macrocannon",
    "weaponType": "Macrobattery",
    "location": "Dorsal",
    "hullType": "All Ships",
    "powerUsage": 4,
    "spaceUsage": 2,
    "spCost": 1,
    "strength": 3,
    "damage": "1d10+2",
    "critRating": 5,
    "range": 6
  }
}
```

### DataModel Schema

**ShipComponentData (Current)**:
```javascript
{
  componentType: StringField (enum),           // ❌ Pack has "type"
  hullType: SetField(StringField),             // ❌ Pack has String
  power: SchemaField({                         // ❌ Pack has "powerUsage" flat
    used: NumberField,
    generated: NumberField
  }),
  space: NumberField,                          // ❌ Pack has "spaceUsage"
  shipPoints: NumberField,                     // ❌ Pack has "spCost"
  modifiers: SchemaField({
    speed, manoeuvrability, detection,
    armour, hullIntegrity, turretRating,
    voidShields, morale, crewRating           // ⚠️ Last 3 missing in pack
  }),
  condition: StringField (enum),              // ⚠️ Missing in pack
  essential: BooleanField,                    // ⚠️ Missing in pack (in prefix)
  effect: HTMLField,
  notes: StringField
}
```

**ShipWeaponData (Current)**:
```javascript
{
  weaponType: StringField (enum),             // ⚠️ Pack has "type" or "weaponType"
  location: StringField (enum),               // ✅ OK
  hullType: SetField(StringField),            // ❌ Pack has String
  power: NumberField,                         // ❌ Pack has "powerUsage"
  space: NumberField,                         // ❌ Pack has "spaceUsage"
  shipPoints: NumberField,                    // ❌ Pack has "spCost"
  strength: NumberField,                      // ✅ OK
  damage: StringField,                        // ✅ OK
  crit: NumberField,                          // ⚠️ Pack has "critRating"
  range: NumberField,                         // ✅ OK
  special: SetField(StringField),             // ⚠️ Missing in pack
  notes: StringField
}
```

---

## 🚀 Next Steps

1. **Review this analysis** with team/stakeholders
2. **Prioritize phases** - Can skip item sheets if time-constrained
3. **Create migration script** - Start with 5-10 test items
4. **Run migration** - Full pack migration once script validated
5. **Update DataModels** - Add migrateData() and display properties
6. **Update templates** - Fix field references
7. **Test thoroughly** - Load ships, add/remove components, check UI
8. **Document completion** - Update AGENTS.md with final patterns

---

## 💡 Notes

- This refactor follows the **same pattern as weapon/gear migrations** (proven approach)
- Migration script can be **reusable** for future pack updates
- DataModel migrateData() provides **automatic migration** on item load
- Display properties provide **clean UI separation** from data structure
- Item sheets can be **added later** without breaking existing functionality

---

**Total Estimated Time**: 2-3 weeks (can be compressed to 1 week if item sheets skipped)  
**Risk Level**: 🟢 Low (using proven migration patterns, non-destructive with backups)  
**Impact**: 🟢 High (fixes critical display issues, enables future ship features)
