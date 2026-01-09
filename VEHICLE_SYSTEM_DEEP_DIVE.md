# Vehicle System Deep Dive & Refactor Plan

**Date**: 2026-01-09  
**Status**: CRITICAL - Complete Schema Mismatch Between Pack Data and Data Model  
**Scope**: 63 vehicle actors, 50 traits, 13 upgrades

## Executive Summary

The vehicle system is **completely broken** due to a fundamental mismatch between pack data field names and the VehicleData model schema. The pack data uses legacy field names (e.g., `frontArmour`, `tacticalSpeed`, `structuralIntegrity`) while the data model expects different names (e.g., `front`, `speed.tactical`, `integrity.max`). This causes:

1. **"Object [object]" displayed everywhere** - String values shown for number fields
2. **Missing data** - Required fields not populated from pack data
3. **Type mismatches** - Strings where numbers expected (e.g., "20m" for size, "120kph" for speed)
4. **Template failures** - Templates reference wrong paths (e.g., `actor.front` vs `actor.system.front`)
5. **Broken compendium display** - Vehicles show no meaningful information

## Problem Analysis

### 1. Pack Data vs Data Model Field Mapping

| Pack Field | Pack Value Example | Model Field | Model Type | Status |
|------------|-------------------|-------------|------------|---------|
| `class` | "Land Vehicle" | ❌ **MISSING** | N/A | **DELETE or add to model** |
| `size` | "20m" (string) | ❌ **MISSING** | N/A | **PARSE + add size field** |
| `tacticalSpeed` | "120kph" (string) | `speed.tactical` | NumberField (integer) | **PARSE to number** |
| `cruisingSpeed` | "+15" (string) | `speed.cruising` | NumberField (integer) | **PARSE to number** |
| `maneuverability` | "20" (string) | `manoeuverability` | NumberField (integer) | **PARSE + RENAME** |
| `frontArmour` | "Enormous (+20)" (string) | `front` | StringField | **RENAME field** |
| `sideArmour` | "Front 16\nSide 14\nRear 14" | `side` | StringField | **RENAME field** |
| `rearArmour` | "Driver, Gunner" | `rear` | StringField | **RENAME field** |
| `structuralIntegrity` | "None" (string) | `integrity.max` | NumberField (integer) | **PARSE + RENAME** |
| `crew` | "Pintle: Heavy Flamer..." | `crew` | StringField | ✅ **OK** |
| `passengers` | "Traits: Enhanced Motive..." | ❌ **MISSING** | N/A | **Store in description/notes** |
| `cargo` | "Scarce" | ❌ **MISSING** | N/A | **Store as notes/description** |
| `availability` | "OW: Shield of Humanity" | `availability` | StringField | ⚠️ **CLEAN (remove source)** |
| `source` | null | ❌ **MISSING** | N/A | **Store in description** |
| ❌ **MISSING** | N/A | `faction` | StringField | **NEW field** |
| ❌ **MISSING** | N/A | `subfaction` | StringField | **NEW field** |
| ❌ **MISSING** | N/A | `type` | StringField | **NEW field (default: "troop")** |
| ❌ **MISSING** | N/A | `threatLevel` | NumberField | **NEW field** |
| ❌ **MISSING** | N/A | `carryingCapacity` | NumberField | **NEW field** |
| ❌ **MISSING** | N/A | `integrity.value` | NumberField | **NEW field (= max)** |
| ❌ **MISSING** | N/A | `integrity.critical` | NumberField | **NEW field (= 0)** |

### 2. Data Model Schema (vehicle.mjs)

```javascript
// Current VehicleData schema
{
  faction: StringField,              // NEW - not in packs
  subfaction: StringField,           // NEW - not in packs
  type: StringField (default: "troop"), // NEW - not in packs
  threatLevel: NumberField (integer), // NEW - not in packs
  
  // Armour (StringField - allows text descriptions)
  front: StringField,                // Pack has "frontArmour"
  side: StringField,                 // Pack has "sideArmour"
  rear: StringField,                 // Pack has "rearArmour"
  
  // Availability
  availability: StringField,         // Pack has (with source mixed in)
  
  // Speed (nested schema)
  speed: {
    cruising: NumberField (integer), // Pack has "cruisingSpeed" (string)
    tactical: NumberField (integer)  // Pack has "tacticalSpeed" (string)
  },
  
  // Crew
  crew: StringField,                 // Pack has (correct)
  
  // Manoeuverability
  manoeuverability: NumberField (integer), // Pack has "maneuverability" (string)
  
  // Carrying capacity
  carryingCapacity: NumberField (integer), // Pack MISSING
  
  // Structural Integrity (nested schema)
  integrity: {
    max: NumberField (integer),      // Pack has "structuralIntegrity" (string)
    value: NumberField (integer),    // Pack MISSING
    critical: NumberField (integer)  // Pack MISSING
  }
}
```

### 3. Pack Data Issues in Detail

**Example Vehicle**: Tauros Assault Vehicle

```json
{
  "system": {
    "class": "Land Vehicle",              // ❌ Not in model - meaningful data lost
    "size": "20m",                        // ❌ Not in model - meaningful data lost
    "tacticalSpeed": "120kph",            // ⚠️ String, needs parse to 120
    "cruisingSpeed": "+15",               // ⚠️ String modifier, needs context
    "maneuverability": "20",              // ⚠️ String, needs parse to 20
    "frontArmour": "Enormous (+20)",      // ⚠️ Mixed string (descriptive + numeric)
    "sideArmour": "Front 16\nSide 14\nRear 14", // ⚠️ ALL THREE ARMOURS in one field!
    "rearArmour": "Driver, Gunner",       // ⚠️ Actually CREW data!
    "structuralIntegrity": "None",        // ⚠️ String, needs parse or default
    "crew": "Pintle: Heavy Flamer...",    // ⚠️ Actually WEAPONS data!
    "passengers": "Traits: Enhanced Motive...", // ❌ Contains TRAITS and SPECIAL RULES
    "cargo": "Scarce",                    // ❌ Availability of cargo space?
    "availability": "OW: Shield of Humanity" // ⚠️ Source book, not item availability
  }
}
```

**Critical Observations**:
1. **Field data is scrambled** - `rearArmour` contains crew, `crew` contains weapons, `passengers` contains traits
2. **Composite data** - `sideArmour` contains front/side/rear armour values all in one string
3. **Missing structure** - No way to represent vehicle class, size, or carrying capacity
4. **Type confusion** - Numbers stored as strings with units ("120kph", "20m")

### 4. Template Issues

**vehicle-armour-panel.hbs**:
```handlebars
{{!-- WRONG: Uses actor.front instead of actor.system.front --}}
<input name="system.front" value="{{actor.front}}" />
{{!-- Should be --}}
<input name="system.front" value="{{actor.system.front}}" />
```

**vehicle-integrity-panel.hbs**:
```handlebars
{{!-- WRONG: Uses actor.integrity instead of actor.system.integrity --}}
<input name="system.integrity.max" value="{{actor.integrity.max}}" />
{{!-- Should be --}}
<input name="system.integrity.max" value="{{actor.system.integrity.max}}" />
```

**vehicle-movement-panel.hbs**:
```handlebars
{{!-- WRONG: Uses actor.system.size (doesn't exist) --}}
<select name="system.size">
  {{selectOptions dh.sizes selected=actor.system.size}}
</select>
{{!-- Should reference proper size field (needs to be added to model) --}}
```

### 5. Header Template Issues

**vehicle/header.hbs**:
```handlebars
{{!-- Line 15: References non-existent dh.items.vehicle_types --}}
<select name="system.type">
  {{selectOptions (arrayToObject dh.items.vehicle_types) selected=actor.system.type}}
</select>
{{!-- Config doesn't have vehicle_types defined! --}}

{{!-- Lines 27-29: Uses system.integrity directly --}}
<input name="system.integrity.value" value="{{system.integrity.value}}" />
{{!-- Should be actor.system.integrity.value --}}
```

### 6. Config Missing Vehicle Types

**config.mjs** - No vehicle types defined:
```javascript
// ❌ MISSING in config.mjs
ROGUE_TRADER.vehicleTypes = {
  // Needs to be added
};

// ❌ MISSING in config.mjs
ROGUE_TRADER.vehicleClasses = {
  // Needs to be added
};
```

## Solution: Comprehensive Refactor

### Phase 1: Data Model Enhancement

**Goal**: Expand VehicleData to capture all meaningful pack data

```javascript
// Enhanced VehicleData schema
export default class VehicleData extends ActorDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      // === NEW: Vehicle Classification ===
      vehicleClass: new fields.StringField({
        required: true,
        initial: "ground",
        choices: ["ground", "air", "water", "space", "walker"]
      }),
      
      // === NEW: Size (numeric for mechanical effects) ===
      size: new fields.NumberField({
        required: true,
        initial: 4,
        integer: true,
        min: 1,
        max: 10,
        label: "RT.Vehicle.Size"
      }),
      
      // === NEW: Size descriptor (for display) ===
      sizeDescriptor: new fields.StringField({
        required: false,
        initial: "",
        blank: true,
        label: "RT.Vehicle.SizeDescriptor"
      }),
      
      // === Threat Classification (from NPC template) ===
      faction: new fields.StringField({ required: false, initial: "", blank: true }),
      subfaction: new fields.StringField({ required: false, initial: "", blank: true }),
      type: new fields.StringField({
        required: true,
        initial: "vehicle",
        choices: ["vehicle", "walker", "flyer", "skimmer", "bike", "tank"]
      }),
      threatLevel: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      
      // === Armour by Facing ===
      armour: new fields.SchemaField({
        front: new fields.SchemaField({
          value: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
          descriptor: new fields.StringField({ required: false, initial: "", blank: true })
        }),
        side: new fields.SchemaField({
          value: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
          descriptor: new fields.StringField({ required: false, initial: "", blank: true })
        }),
        rear: new fields.SchemaField({
          value: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
          descriptor: new fields.StringField({ required: false, initial: "", blank: true })
        })
      }),
      
      // === Speed ===
      speed: new fields.SchemaField({
        cruising: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
        tactical: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
        notes: new fields.StringField({ required: false, initial: "", blank: true })
      }),
      
      // === Crew & Passengers ===
      crew: new fields.SchemaField({
        required: new fields.NumberField({ required: true, initial: 1, min: 0, integer: true }),
        notes: new fields.StringField({ required: false, initial: "", blank: true })
      }),
      
      passengers: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      
      // === Manoeuverability ===
      manoeuverability: new fields.NumberField({ required: true, initial: 0, integer: true }),
      
      // === Carrying Capacity ===
      carryingCapacity: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      
      // === Structural Integrity ===
      integrity: new fields.SchemaField({
        max: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
        value: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
        critical: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true })
      }),
      
      // === Weapons (as HTML field for rich text) ===
      weapons: new fields.HTMLField({ required: true, blank: true }),
      
      // === Special Rules ===
      specialRules: new fields.HTMLField({ required: true, blank: true }),
      
      // === Traits (stored as text, but should be items) ===
      traitsText: new fields.StringField({ required: false, initial: "", blank: true }),
      
      // === Availability & Source ===
      availability: new fields.StringField({ required: false, initial: "common", blank: true }),
      source: new fields.StringField({ required: false, initial: "", blank: true })
    };
  }
  
  // === Derived Properties ===
  
  get isDamaged() {
    return this.integrity.value < this.integrity.max;
  }
  
  get isCritical() {
    return this.integrity.critical > 0;
  }
  
  get armourSummary() {
    return `F:${this.armour.front.value} / S:${this.armour.side.value} / R:${this.armour.rear.value}`;
  }
  
  get speedSummary() {
    return `Cruising: ${this.speed.cruising} kph / Tactical: ${this.speed.tactical}m`;
  }
  
  get sizeLabel() {
    const sizeLabels = CONFIG.rt.sizes || {};
    const sizeData = sizeLabels[this.size];
    return sizeData?.label || `Size ${this.size}`;
  }
  
  get vehicleClassLabel() {
    const classes = CONFIG.rt.vehicleClasses || {};
    return classes[this.vehicleClass]?.label || this.vehicleClass;
  }
}
```

### Phase 2: Config.mjs Additions

```javascript
/* -------------------------------------------- */
/*  Vehicle Types                               */
/* -------------------------------------------- */

/**
 * Vehicle type classifications.
 * @type {Object<string, {label: string, icon: string}>}
 */
ROGUE_TRADER.vehicleTypes = {
  vehicle: { label: "RT.VehicleType.Vehicle", icon: "fa-car" },
  walker: { label: "RT.VehicleType.Walker", icon: "fa-robot" },
  flyer: { label: "RT.VehicleType.Flyer", icon: "fa-plane" },
  skimmer: { label: "RT.VehicleType.Skimmer", icon: "fa-helicopter" },
  bike: { label: "RT.VehicleType.Bike", icon: "fa-motorcycle" },
  tank: { label: "RT.VehicleType.Tank", icon: "fa-tank" }
};

/**
 * Vehicle class categories.
 * @type {Object<string, {label: string}>}
 */
ROGUE_TRADER.vehicleClasses = {
  ground: { label: "RT.VehicleClass.Ground" },
  air: { label: "RT.VehicleClass.Air" },
  water: { label: "RT.VehicleClass.Water" },
  space: { label: "RT.VehicleClass.Space" },
  walker: { label: "RT.VehicleClass.Walker" }
};

/**
 * Vehicle size categories (aligned with creature sizes).
 * @type {Object<number, {label: string, modifier: number, descriptor: string}>}
 */
ROGUE_TRADER.vehicleSizes = {
  1: { label: "RT.Size.Miniscule", modifier: -30, descriptor: "~1m" },
  2: { label: "RT.Size.Puny", modifier: -20, descriptor: "~2m" },
  3: { label: "RT.Size.Scrawny", modifier: -10, descriptor: "~3-5m" },
  4: { label: "RT.Size.Average", modifier: 0, descriptor: "~6-10m" },
  5: { label: "RT.Size.Hulking", modifier: 10, descriptor: "~11-15m" },
  6: { label: "RT.Size.Enormous", modifier: 20, descriptor: "~16-20m" },
  7: { label: "RT.Size.Massive", modifier: 30, descriptor: "~21-30m" },
  8: { label: "RT.Size.Immense", modifier: 40, descriptor: "~31-50m" },
  9: { label: "RT.Size.Monumental", modifier: 50, descriptor: "~51-100m" },
  10: { label: "RT.Size.Titanic", modifier: 60, descriptor: "100m+" }
};
```

### Phase 3: Pack Data Migration Script

**Script**: `scripts/migrate-vehicles.mjs`

```javascript
/**
 * Migrate vehicle pack data from legacy schema to V13 schema.
 * Run with: node scripts/migrate-vehicles.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACK_DIR = path.join(__dirname, '../src/packs/rt-actors-vehicles/_source');

// Size string to numeric mapping
const SIZE_MAP = {
  '1m': 1, '2m': 2, '3m': 3, '4m': 3, '5m': 3,
  '6m': 4, '7m': 4, '8m': 4, '9m': 4, '10m': 4,
  '11m': 5, '12m': 5, '13m': 5, '14m': 5, '15m': 5,
  '16m': 6, '17m': 6, '18m': 6, '19m': 6, '20m': 6,
  '21m': 7, '25m': 7, '30m': 7,
  '35m': 8, '40m': 8, '45m': 8, '50m': 8,
  '60m': 9, '70m': 9, '80m': 9, '90m': 9, '100m': 9
};

// Armour descriptor to value mapping
const ARMOUR_MAP = {
  'none': 0,
  'puny (-20)': 2,
  'scrawny (-10)': 4,
  'average (+0)': 6,
  'hulking (+10)': 8,
  'enormous (+20)': 10,
  'massive (+30)': 12,
  'immense (+40)': 14,
  'monumental (+50)': 16,
  'titanic (+60)': 18
};

/**
 * Parse armour value from string.
 * Examples: "Enormous (+20)" -> 10, "Front 16\nSide 14\nRear 14" -> {front: 16, side: 14, rear: 14}
 */
function parseArmour(armourStr) {
  if (!armourStr || armourStr === 'None') return { value: 0, descriptor: '' };
  
  const lower = armourStr.toLowerCase();
  
  // Check for descriptor format "Enormous (+20)"
  for (const [key, value] of Object.entries(ARMOUR_MAP)) {
    if (lower.includes(key)) {
      return { value, descriptor: armourStr };
    }
  }
  
  // Check for multi-line format "Front 16\nSide 14\nRear 14"
  if (armourStr.includes('\n')) {
    const lines = armourStr.split('\n');
    const result = {};
    for (const line of lines) {
      const match = line.match(/(front|side|rear)\s+(\d+)/i);
      if (match) {
        result[match[1].toLowerCase()] = parseInt(match[2]);
      }
    }
    return result;
  }
  
  // Try to parse as number
  const num = parseInt(armourStr);
  return { value: isNaN(num) ? 0 : num, descriptor: armourStr };
}

/**
 * Parse speed value from string.
 * Examples: "120kph" -> 120, "+15" -> 15, "-10" -> -10
 */
function parseSpeed(speedStr) {
  if (!speedStr) return 0;
  const match = speedStr.match(/([+-]?\d+)/);
  return match ? parseInt(match[1]) : 0;
}

/**
 * Parse size from string to numeric value.
 * Example: "20m" -> 6
 */
function parseSize(sizeStr) {
  if (!sizeStr) return 4; // Default to Average
  const lower = sizeStr.toLowerCase();
  return SIZE_MAP[lower] || 4;
}

/**
 * Extract crew count from crew text.
 * Example: "Driver, Gunner, Commander" -> 3
 */
function parseCrewCount(crewStr) {
  if (!crewStr) return 1;
  // Count commas + 1
  const count = (crewStr.match(/,/g) || []).length + 1;
  return Math.max(1, count);
}

/**
 * Migrate a single vehicle actor.
 */
function migrateVehicle(vehicle) {
  const old = vehicle.system;
  const migrated = { ...vehicle };
  
  // Parse armour (handle composite sideArmour field)
  let frontArmour, sideArmour, rearArmour;
  
  if (old.sideArmour && old.sideArmour.includes('\n')) {
    // Multi-line format contains all three armour values
    const armours = parseArmour(old.sideArmour);
    frontArmour = { value: armours.front || 0, descriptor: '' };
    sideArmour = { value: armours.side || 0, descriptor: '' };
    rearArmour = { value: armours.rear || 0, descriptor: '' };
  } else {
    // Separate fields
    frontArmour = parseArmour(old.frontArmour);
    sideArmour = parseArmour(old.sideArmour);
    rearArmour = parseArmour(old.rearArmour);
  }
  
  // Parse speeds
  const cruisingSpeed = parseSpeed(old.cruisingSpeed);
  const tacticalSpeed = parseSpeed(old.tacticalSpeed);
  
  // Parse size
  const size = parseSize(old.size);
  
  // Parse crew
  const crewCount = parseCrewCount(old.rearArmour); // rearArmour actually contains crew!
  
  // Parse integrity
  const integrityMax = old.structuralIntegrity === 'None' ? 0 : parseInt(old.structuralIntegrity) || 0;
  
  // Determine vehicle class
  let vehicleClass = 'ground';
  const classLower = (old.class || '').toLowerCase();
  if (classLower.includes('air') || classLower.includes('flyer')) vehicleClass = 'air';
  else if (classLower.includes('water') || classLower.includes('sea')) vehicleClass = 'water';
  else if (classLower.includes('walker')) vehicleClass = 'walker';
  else if (classLower.includes('space')) vehicleClass = 'space';
  
  // Build migrated system data
  migrated.system = {
    // Vehicle classification
    vehicleClass: vehicleClass,
    size: size,
    sizeDescriptor: old.size || '',
    
    // NPC-style fields
    faction: '',
    subfaction: '',
    type: 'vehicle',
    threatLevel: 0,
    
    // Armour
    armour: {
      front: frontArmour,
      side: sideArmour,
      rear: rearArmour
    },
    
    // Speed
    speed: {
      cruising: cruisingSpeed,
      tactical: tacticalSpeed,
      notes: ''
    },
    
    // Crew
    crew: {
      required: crewCount,
      notes: old.rearArmour || '' // Actual crew text
    },
    
    passengers: 0, // No data in packs
    
    // Manoeuverability
    manoeuverability: parseInt(old.maneuverability) || 0,
    
    // Carrying capacity
    carryingCapacity: 0, // No data in packs
    
    // Integrity
    integrity: {
      max: integrityMax,
      value: integrityMax, // Start at full
      critical: 0
    },
    
    // Weapons (from crew field which has weapons!)
    weapons: old.crew || '',
    
    // Special rules (from passengers field)
    specialRules: old.passengers || '',
    
    // Traits text
    traitsText: old.passengers || '',
    
    // Availability
    availability: (old.cargo || 'common').toLowerCase(),
    
    // Source
    source: old.availability || ''
  };
  
  return migrated;
}

/**
 * Migrate all vehicles in pack.
 */
async function migrateAllVehicles() {
  const files = fs.readdirSync(PACK_DIR).filter(f => f.endsWith('.json'));
  
  console.log(`Migrating ${files.length} vehicles...`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const file of files) {
    try {
      const filePath = path.join(PACK_DIR, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      
      const migrated = migrateVehicle(data);
      
      // Backup original
      const backupPath = filePath.replace('_source', '_backup');
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));
      
      // Write migrated
      fs.writeFileSync(filePath, JSON.stringify(migrated, null, 2));
      
      console.log(`✓ ${data.name}`);
      successCount++;
    } catch (err) {
      console.error(`✗ ${file}: ${err.message}`);
      errorCount++;
    }
  }
  
  console.log(`\nMigration complete: ${successCount} success, ${errorCount} errors`);
}

// Run migration
migrateAllVehicles().catch(console.error);
```

### Phase 4: Template Refactor

**New template structure**:

1. **vehicle/header.hbs** - Fix all `actor.X` to `actor.system.X`
2. **panel/vehicle-armour-panel.hbs** - Show front/side/rear with numeric values + descriptors
3. **panel/vehicle-integrity-panel.hbs** - Fix path references
4. **panel/vehicle-movement-panel.hbs** - Add size selector, fix speed fields
5. **panel/vehicle-stats-panel.hbs** - NEW comprehensive stats panel
6. **panel/vehicle-crew-panel.hbs** - NEW crew management panel

### Phase 5: Compendium Display

**Enhance compendium-browser.mjs** to show vehicle data properly:

```javascript
// In _prepareContext for vehicles
if (doc.type === 'vehicle') {
  const system = doc.system;
  return {
    ...baseData,
    vehicleClass: system.vehicleClass,
    size: system.sizeLabel,
    armour: system.armourSummary,
    speed: system.speedSummary,
    integrity: `${system.integrity.value}/${system.integrity.max}`,
    manoeuverability: system.manoeuverability
  };
}
```

### Phase 6: V2 Integration

**VehicleSheet enhancements**:

1. Add proper action handlers for integrity adjustment
2. Add vehicle trait drag/drop
3. Add vehicle upgrade drag/drop
4. Add weapon mount system
5. Add crew position tracking

## Implementation Checklist

### ✅ Prerequisites
- [ ] Review all 63 vehicle JSON files
- [ ] Document any special cases or unique patterns
- [ ] Create backup of entire pack directory

### 📝 Phase 1: Data Model (1-2 hours)
- [ ] Update `src/module/data/actor/vehicle.mjs` with enhanced schema
- [ ] Add derived properties (armourSummary, speedSummary, etc.)
- [ ] Add `prepareBaseData()` for calculations
- [ ] Add `prepareDerivedData()` for computed values
- [ ] Test with mock data

### ⚙️ Phase 2: Config (30 min)
- [ ] Add `ROGUE_TRADER.vehicleTypes` to config.mjs
- [ ] Add `ROGUE_TRADER.vehicleClasses` to config.mjs
- [ ] Add `ROGUE_TRADER.vehicleSizes` to config.mjs
- [ ] Add localization keys to en.json

### 🔄 Phase 3: Migration Script (2-3 hours)
- [ ] Create `scripts/migrate-vehicles.mjs`
- [ ] Add parsing functions (armour, speed, size, crew)
- [ ] Add validation logic
- [ ] Test on 3-5 sample vehicles
- [ ] Run full migration on all 63 vehicles
- [ ] Verify migrated data manually

### 🎨 Phase 4: Templates (2-3 hours)
- [ ] Fix `vehicle/header.hbs` paths
- [ ] Refactor `panel/vehicle-armour-panel.hbs`
- [ ] Refactor `panel/vehicle-integrity-panel.hbs`
- [ ] Refactor `panel/vehicle-movement-panel.hbs`
- [ ] Create `panel/vehicle-stats-panel.hbs`
- [ ] Create `panel/vehicle-crew-panel.hbs`
- [ ] Create `panel/vehicle-weapons-panel.hbs`
- [ ] Test all templates in-game

### 🔍 Phase 5: Compendium (1 hour)
- [ ] Update compendium browser vehicle rendering
- [ ] Add vehicle type filter
- [ ] Add vehicle class filter
- [ ] Test vehicle search and display

### 🎮 Phase 6: Sheet Enhancements (2-3 hours)
- [ ] Add integrity adjustment actions
- [ ] Add crew position management
- [ ] Add weapon mount system
- [ ] Add trait/upgrade drag-drop
- [ ] Add damage tracking UI
- [ ] Test all interactions

### 🧪 Testing (2-3 hours)
- [ ] Test vehicle creation (blank)
- [ ] Test vehicle import from compendium
- [ ] Test vehicle sheet rendering
- [ ] Test all stat adjustments
- [ ] Test drag-drop for traits/upgrades/weapons
- [ ] Test token bar display (integrity)
- [ ] Test vehicle roll actions
- [ ] Test vehicle compendium display

### 📚 Documentation (1 hour)
- [ ] Update AGENTS.md with vehicle schema
- [ ] Create VEHICLE_SYSTEM_GUIDE.md
- [ ] Document migration process
- [ ] Add vehicle creation guide

## Total Estimated Time: 12-16 hours

## Risk Assessment

**HIGH RISK**:
- Data loss during migration (mitigated by backups)
- Breaking existing vehicles in active games (mitigated by version check)

**MEDIUM RISK**:
- Template rendering issues (mitigated by thorough testing)
- Compendium browser breaking (mitigated by fallback rendering)

**LOW RISK**:
- Localization missing (easy to add later)
- Minor UI polish (can iterate)

## Success Criteria

1. ✅ All 63 vehicles migrated without data loss
2. ✅ Vehicle sheets display all data correctly
3. ✅ No "Object [object]" displayed anywhere
4. ✅ Compendium browser shows meaningful vehicle info
5. ✅ All numeric fields accept and display numbers
6. ✅ Integrity bar shows on tokens
7. ✅ Traits and upgrades can be dragged onto vehicles
8. ✅ Vehicle weapons can be rolled by crew

## Post-Implementation

### Follow-up Tasks
1. Add vehicle damage critical table
2. Add vehicle repair system
3. Add vehicle modification system
4. Add vehicle combat automation
5. Add vehicle squadron support

### Future Enhancements
1. Vehicle customization builder (like origin path builder)
2. Vehicle loadout presets (combat/transport/recon)
3. Vehicle maintenance tracking
4. Vehicle upgrade tree visualization
5. Vehicle vs vehicle combat rules

---

## Appendix A: Example Migrated Vehicle

**Before (Pack Data)**:
```json
{
  "name": "Tauros Assault Vehicle",
  "type": "vehicle",
  "system": {
    "class": "Land Vehicle",
    "size": "20m",
    "tacticalSpeed": "120kph",
    "cruisingSpeed": "+15",
    "maneuverability": "20",
    "frontArmour": "Enormous (+20)",
    "sideArmour": "Front 16\nSide 14\nRear 14",
    "rearArmour": "Driver, Gunner",
    "structuralIntegrity": "None",
    "crew": "Pintle: Heavy Flamer or Tauros Grenade Launcher",
    "passengers": "Traits: Enhanced Motive Systems, Open-Topped, Rugged",
    "cargo": "Scarce",
    "availability": "OW: Shield of Humanity"
  }
}
```

**After (Migrated Data)**:
```json
{
  "name": "Tauros Assault Vehicle",
  "type": "vehicle",
  "system": {
    "vehicleClass": "ground",
    "size": 6,
    "sizeDescriptor": "20m",
    "faction": "",
    "subfaction": "",
    "type": "vehicle",
    "threatLevel": 0,
    "armour": {
      "front": { "value": 16, "descriptor": "" },
      "side": { "value": 14, "descriptor": "" },
      "rear": { "value": 14, "descriptor": "" }
    },
    "speed": {
      "cruising": 15,
      "tactical": 120,
      "notes": ""
    },
    "crew": {
      "required": 2,
      "notes": "Driver, Gunner"
    },
    "passengers": 0,
    "manoeuverability": 20,
    "carryingCapacity": 0,
    "integrity": {
      "max": 0,
      "value": 0,
      "critical": 0
    },
    "weapons": "Pintle: Heavy Flamer or Tauros Grenade Launcher",
    "specialRules": "Traits: Enhanced Motive Systems, Open-Topped, Rugged",
    "traitsText": "Enhanced Motive Systems, Open-Topped, Rugged",
    "availability": "scarce",
    "source": "OW: Shield of Humanity"
  }
}
```

## Appendix B: Template Context Structure

```javascript
// VehicleSheet _prepareContext() output
{
  actor: {
    id: "...",
    name: "Tauros Assault Vehicle",
    type: "vehicle",
    img: "...",
    system: {
      vehicleClass: "ground",
      size: 6,
      armour: {
        front: { value: 16, descriptor: "" },
        side: { value: 14, descriptor: "" },
        rear: { value: 14, descriptor: "" }
      },
      speed: { cruising: 15, tactical: 120 },
      crew: { required: 2, notes: "..." },
      integrity: { max: 0, value: 0, critical: 0 },
      // ... etc
    }
  },
  dh: CONFIG.rt,
  editable: true,
  isEditable: true,
  isOwner: true,
  // Categorized items
  weapons: [...],
  traits: [...],
  upgrades: [...],
  // Computed properties
  armourSummary: "F:16 / S:14 / R:14",
  speedSummary: "Cruising: 15 kph / Tactical: 120m",
  sizeLabel: "Enormous",
  vehicleClassLabel: "Ground Vehicle"
}
```
