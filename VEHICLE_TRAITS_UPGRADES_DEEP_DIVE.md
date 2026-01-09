# Vehicle Traits & Upgrades System Deep Dive

**Date**: 2026-01-09  
**Status**: Schema Mismatches - Models Don't Match Pack Data  
**Scope**: 50 vehicle traits, 13 vehicle upgrades

## Executive Summary

The vehicle traits and upgrades have **major schema mismatches** between data models and pack data. The data models define fields that don't exist in packs, and packs have critical fields missing from models. This causes:

1. **Missing modifiers system** - Traits/upgrades can't modify vehicle stats
2. **Lost metadata** - Type, difficulty, install cost data ignored
3. **Broken UI** - Templates reference non-existent fields
4. **No functionality** - Items don't actually affect vehicles

## Problem Analysis

### Vehicle Trait Issues

| Field | Pack Data | Data Model | Issue |
|-------|-----------|------------|-------|
| `descriptionText` | ✅ Has (string) | ❌ Missing | Plain text description lost |
| `description.value` | ✅ Has (HTML) | ✅ Has (via mixin) | ✅ OK |
| `modifiers` | ✅ Has (4 stats) | ❌ Missing | **CRITICAL: Can't modify vehicle!** |
| `identifier` | ❌ Missing | ✅ Has | Unused field |
| `hasLevel` | ❌ Missing | ✅ Has | Some traits need levels |
| `level` | ❌ Missing | ✅ Has | Some traits need levels |
| `effect` | ❌ Missing | ✅ Has (HTML) | Duplicate of description? |
| `notes` | ❌ Missing | ✅ Has | No notes in packs |

**Critical Issue**: Pack data has `modifiers` object with 4 stats (speed, manoeuvrability, armour, integrity) but the data model doesn't define this field!

### Vehicle Upgrade Issues

| Field | Pack Data | Data Model | Issue |
|-------|-----------|------------|-------|
| `type` | ✅ Has (string) | ❌ Missing | "Standard" or "Integral" lost |
| `allowedVehicles` | ✅ Has (string) | ❌ Missing | Vehicle restrictions lost |
| `difficulty` | ✅ Has (string) | ❌ Missing | Installation difficulty lost |
| `descriptionText` | ✅ Has (string) | ❌ Missing | Plain text lost |
| `availability` | ✅ Has | ✅ Has | ✅ OK |
| `source` | ✅ Has (string) | ❌ Missing | Source book reference lost |
| `description.value` | ✅ Has (HTML) | ✅ Has (via mixin) | ✅ OK |
| `installCost` | ✅ Has (number) | ❌ Missing | Installation cost lost |
| `modifiers` | ✅ Has (4 stats) | ✅ Has | ✅ OK |
| `identifier` | ❌ Missing | ✅ Has | Unused field |
| `effect` | ❌ Missing | ✅ Has (HTML) | Duplicate of description? |
| `notes` | ❌ Missing | ✅ Has | No notes in packs |

**Critical Issue**: Pack data has meaningful metadata (type, difficulty, install cost, allowed vehicles) that the data model ignores!

## Pack Data Examples

### Vehicle Trait: "Open-Topped"

```json
{
  "name": "Open-Topped",
  "type": "vehicleTrait",
  "system": {
    "descriptionText": "Crew and Passengers can be targetted...",
    "description": {
      "value": "<p>Crew and Passengers can be targetted...</p>"
    },
    "modifiers": {
      "speed": 0,
      "manoeuvrability": 0,
      "armour": 0,
      "integrity": 0
    }
  }
}
```

**Usage**: No stat modifiers, but grants special rules (crew targetable, can shoot).

### Vehicle Trait: "Super-Heavy"

```json
{
  "system": {
    "descriptionText": "Vehicle is immune to Crew Shaken and Crew Stunned results...",
    "modifiers": {
      "speed": -10,
      "manoeuvrability": -20,
      "armour": 0,
      "integrity": 0
    }
  }
}
```

**Usage**: Reduces speed by 10 and manoeuvrability by 20.

### Vehicle Upgrade: "Superior Plating"

```json
{
  "name": "Superior Plating",
  "type": "vehicleUpgrade",
  "system": {
    "type": "Integral",
    "allowedVehicles": "Any",
    "difficulty": "-30",
    "descriptionText": "Vehicle Gains +2 Armour to all locations...",
    "availability": "extremely-rare",
    "source": "OW: Shield of Humanity",
    "installCost": 0,
    "modifiers": {
      "speed": 0,
      "manoeuvrability": 0,
      "armour": 0,
      "integrity": 0
    }
  }
}
```

**Usage**: Integral upgrade, very difficult to install (-30), adds +2 armour (not in modifiers!).

## Solution: Comprehensive Refactor

### Phase 1: Enhanced Data Models

#### VehicleTraitData Enhanced Schema

```javascript
export default class VehicleTraitData extends ItemDataModel.mixin(DescriptionTemplate) {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      // Identifier (for compendium/automation)
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // Plain text description (for search/tooltips)
      descriptionText: new fields.StringField({ required: false, initial: "", blank: true }),
      
      // Stat modifiers (CRITICAL - missing from current model!)
      modifiers: new fields.SchemaField({
        speed: new fields.NumberField({ required: true, initial: 0, integer: true }),
        manoeuvrability: new fields.NumberField({ required: true, initial: 0, integer: true }),
        armour: new fields.NumberField({ required: true, initial: 0, integer: true }),
        integrity: new fields.NumberField({ required: true, initial: 0, integer: true })
      }),
      
      // Level support (for traits like "Super-Heavy X")
      hasLevel: new fields.BooleanField({ required: true, initial: false }),
      level: new fields.NumberField({ required: false, initial: null, min: 0, integer: true }),
      
      // Notes
      notes: new fields.StringField({ required: false, initial: "", blank: true })
    };
  }
  
  // Add derived properties
  get hasModifiers() {
    return Object.values(this.modifiers).some(v => v !== 0);
  }
  
  get modifiersList() {
    const list = [];
    for (const [key, value] of Object.entries(this.modifiers)) {
      if (value !== 0) {
        list.push({
          key,
          label: game.i18n.localize(`RT.VehicleStat.${key.capitalize()}`),
          value,
          formatted: `${value >= 0 ? '+' : ''}${value}`
        });
      }
    }
    return list;
  }
  
  get fullName() {
    let name = this.parent?.name ?? "";
    if (this.hasLevel && this.level !== null) {
      name += ` ${this.level}`;
    }
    return name;
  }
}
```

#### VehicleUpgradeData Enhanced Schema

```javascript
export default class VehicleUpgradeData extends ItemDataModel.mixin(DescriptionTemplate) {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      // Identifier
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // Upgrade type (Standard, Integral, etc.)
      upgradeType: new fields.StringField({
        required: true,
        initial: "standard",
        choices: ["standard", "integral", "custom"],
        label: "RT.VehicleUpgrade.Type"
      }),
      
      // Allowed vehicles (Any, Ground Only, etc.)
      allowedVehicles: new fields.StringField({
        required: false,
        initial: "any",
        blank: true,
        label: "RT.VehicleUpgrade.AllowedVehicles"
      }),
      
      // Installation difficulty modifier
      difficulty: new fields.NumberField({
        required: true,
        initial: 0,
        integer: true,
        label: "RT.VehicleUpgrade.Difficulty"
      }),
      
      // Plain text description
      descriptionText: new fields.StringField({ required: false, initial: "", blank: true }),
      
      // Availability
      availability: new fields.StringField({
        required: true,
        initial: "common",
        label: "RT.Availability"
      }),
      
      // Source book reference
      source: new fields.StringField({ required: false, initial: "", blank: true }),
      
      // Installation cost (Throne Gelt or Influence)
      installCost: new fields.NumberField({
        required: true,
        initial: 0,
        min: 0,
        integer: true,
        label: "RT.VehicleUpgrade.InstallCost"
      }),
      
      // Stat modifiers
      modifiers: new fields.SchemaField({
        speed: new fields.NumberField({ required: true, initial: 0, integer: true }),
        manoeuvrability: new fields.NumberField({ required: true, initial: 0, integer: true }),
        armour: new fields.NumberField({ required: true, initial: 0, integer: true }),
        integrity: new fields.NumberField({ required: true, initial: 0, integer: true })
      }),
      
      // Notes
      notes: new fields.StringField({ required: false, initial: "", blank: true })
    };
  }
  
  // Add derived properties
  get hasModifiers() {
    return Object.values(this.modifiers).some(v => v !== 0);
  }
  
  get modifiersList() {
    const list = [];
    for (const [key, value] of Object.entries(this.modifiers)) {
      if (value !== 0) {
        list.push({
          key,
          label: game.i18n.localize(`RT.VehicleStat.${key.capitalize()}`),
          value,
          formatted: `${value >= 0 ? '+' : ''}${value}`
        });
      }
    }
    return list;
  }
  
  get upgradeTypeLabel() {
    const types = CONFIG.rt?.vehicleUpgradeTypes || {};
    return types[this.upgradeType]?.label || this.upgradeType;
  }
  
  get difficultyFormatted() {
    if (this.difficulty === 0) return "+0";
    return `${this.difficulty > 0 ? '+' : ''}${this.difficulty}`;
  }
}
```

### Phase 2: Config Additions

```javascript
/* -------------------------------------------- */
/*  Vehicle Upgrade Types                       */
/* -------------------------------------------- */

ROGUE_TRADER.vehicleUpgradeTypes = {
  standard: { label: "RT.VehicleUpgradeType.Standard" },
  integral: { label: "RT.VehicleUpgradeType.Integral" },
  custom: { label: "RT.VehicleUpgradeType.Custom" }
};

/* -------------------------------------------- */
/*  Vehicle Stat Labels                         */
/* -------------------------------------------- */

ROGUE_TRADER.vehicleStats = {
  speed: { label: "RT.VehicleStat.Speed", abbreviation: "Spd" },
  manoeuvrability: { label: "RT.VehicleStat.Manoeuvrability", abbreviation: "Man" },
  armour: { label: "RT.VehicleStat.Armour", abbreviation: "AP" },
  integrity: { label: "RT.VehicleStat.Integrity", abbreviation: "Int" }
};
```

### Phase 3: Migration Script

**File**: `scripts/migrate-vehicle-items.mjs`

```javascript
#!/usr/bin/env node
/**
 * Migrate vehicle trait and upgrade pack data to enhanced schemas.
 * Adds missing fields and ensures compatibility.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRAITS_DIR = path.join(__dirname, '../src/packs/rt-items-vehicle-traits/_source');
const UPGRADES_DIR = path.join(__dirname, '../src/packs/rt-items-vehicle-upgrades/_source');

/**
 * Migrate a vehicle trait.
 */
function migrateTrait(trait) {
  const migrated = { ...trait };
  const old = trait.system;
  
  // Ensure all fields exist
  migrated.system = {
    // Keep existing
    descriptionText: old.descriptionText || "",
    description: old.description || { value: "" },
    modifiers: old.modifiers || { speed: 0, manoeuvrability: 0, armour: 0, integrity: 0 },
    
    // Add missing
    identifier: old.identifier || "",
    hasLevel: old.hasLevel || false,
    level: old.level || null,
    notes: old.notes || ""
  };
  
  return migrated;
}

/**
 * Migrate a vehicle upgrade.
 */
function migrateUpgrade(upgrade) {
  const migrated = { ...upgrade };
  const old = upgrade.system;
  
  // Parse difficulty (string like "+10" or "-30")
  let difficulty = 0;
  if (old.difficulty) {
    const match = old.difficulty.match(/([+-]?\d+)/);
    difficulty = match ? parseInt(match[1]) : 0;
  }
  
  // Map old type to new upgradeType
  let upgradeType = "standard";
  if (old.type) {
    const typeLower = old.type.toLowerCase();
    if (typeLower === "integral") upgradeType = "integral";
    else if (typeLower === "custom") upgradeType = "custom";
  }
  
  // Ensure all fields exist
  migrated.system = {
    // Keep existing
    descriptionText: old.descriptionText || "",
    description: old.description || { value: "" },
    availability: old.availability || "common",
    source: old.source || "",
    installCost: old.installCost || 0,
    modifiers: old.modifiers || { speed: 0, manoeuvrability: 0, armour: 0, integrity: 0 },
    
    // Transform
    upgradeType: upgradeType,
    difficulty: difficulty,
    allowedVehicles: old.allowedVehicles || "any",
    
    // Add missing
    identifier: old.identifier || "",
    notes: old.notes || ""
  };
  
  return migrated;
}

async function migrateAll() {
  console.log("\n" + "=".repeat(60));
  console.log("Vehicle Traits & Upgrades Migration");
  console.log("=".repeat(60) + "\n");
  
  // Migrate traits
  const traitFiles = fs.readdirSync(TRAITS_DIR).filter(f => f.endsWith('.json'));
  console.log(`Migrating ${traitFiles.length} vehicle traits...`);
  
  let traitsSuccess = 0;
  for (const file of traitFiles) {
    try {
      const filePath = path.join(TRAITS_DIR, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const migrated = migrateTrait(data);
      fs.writeFileSync(filePath, JSON.stringify(migrated, null, 2));
      traitsSuccess++;
    } catch (err) {
      console.error(`  ✗ ${file}: ${err.message}`);
    }
  }
  
  // Migrate upgrades
  const upgradeFiles = fs.readdirSync(UPGRADES_DIR).filter(f => f.endsWith('.json'));
  console.log(`\nMigrating ${upgradeFiles.length} vehicle upgrades...`);
  
  let upgradesSuccess = 0;
  for (const file of upgradeFiles) {
    try {
      const filePath = path.join(UPGRADES_DIR, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const migrated = migrateUpgrade(data);
      fs.writeFileSync(filePath, JSON.stringify(migrated, null, 2));
      upgradesSuccess++;
    } catch (err) {
      console.error(`  ✗ ${file}: ${err.message}`);
    }
  }
  
  console.log("\n" + "=".repeat(60));
  console.log(`✓ Traits: ${traitsSuccess}/${traitFiles.length}`);
  console.log(`✓ Upgrades: ${upgradesSuccess}/${upgradeFiles.length}`);
  console.log("=".repeat(60) + "\n");
}

migrateAll().catch(console.error);
```

### Phase 4: Vehicle Data Preparation

**Add to VehicleData.prepareDerivedData()**:

```javascript
prepareDerivedData() {
  super.prepareDerivedData();
  
  // Apply trait and upgrade modifiers
  this._applyItemModifiers();
}

_applyItemModifiers() {
  if (!this.parent?.items) return;
  
  // Reset modifier tracking
  this._modifierSources = {
    speed: [],
    manoeuvrability: [],
    armour: [],
    integrity: []
  };
  
  // Apply trait modifiers
  for (const item of this.parent.items) {
    if (item.type === 'vehicleTrait' || item.type === 'vehicleUpgrade') {
      const modifiers = item.system.modifiers;
      if (!modifiers) continue;
      
      for (const [stat, value] of Object.entries(modifiers)) {
        if (value !== 0 && this._modifierSources[stat]) {
          this._modifierSources[stat].push({
            name: item.name,
            value: value
          });
        }
      }
    }
  }
  
  // Apply modifiers to base stats
  const speedMod = this._modifierSources.speed.reduce((sum, m) => sum + m.value, 0);
  const manMod = this._modifierSources.manoeuvrability.reduce((sum, m) => sum + m.value, 0);
  const armourMod = this._modifierSources.armour.reduce((sum, m) => sum + m.value, 0);
  const integrityMod = this._modifierSources.integrity.reduce((sum, m) => sum + m.value, 0);
  
  // Apply to stats
  this.speed.cruising += speedMod;
  this.speed.tactical += Math.floor(speedMod / 10); // Rough conversion
  this.manoeuverability += manMod;
  this.armour.front.value += armourMod;
  this.armour.side.value += armourMod;
  this.armour.rear.value += armourMod;
  this.integrity.max += integrityMod;
}
```

### Phase 5: Templates

**Update vehicle-upgrades-panel.hbs**:

```handlebars
<div class="rt-panel spacer rt-grid-col-6 rt-grid-row-1">
    <h1 class="rt-panel-header">
        <i class="fas fa-cogs"></i>
        {{localize "RT.Vehicle.Upgrades.Header"}}
    </h1>
    <div class="rt-table--border">
        <div class="table-row--head">
            <div class="table-cell--span2">{{localize "RT.Vehicle.Upgrades.Name"}}</div>
            <div class="table-cell">{{localize "RT.Vehicle.Upgrades.Type"}}</div>
            <div class="table-cell">{{localize "RT.Vehicle.Upgrades.Difficulty"}}</div>
            <div class="table-cell--span2">{{localize "RT.Vehicle.Upgrades.Modifiers"}}</div>
            <div class="table-cell--last">
                <button class="rt-control-button item-create" data-type="vehicleUpgrade">
                    <i class="fas fa-plus"></i>
                </button>
            </div>
        </div>
        {{#each upgrades as |item|}}
        <div class="table-row">
            <div class="table-cell--span2">
                <button class="item-name rt-item-button" data-item-id="{{item.id}}" type="button">
                    <img class="rt-item-img" src="{{item.img}}" alt="{{item.name}}" />
                    {{item.name}}
                </button>
            </div>
            <div class="table-cell">{{item.system.upgradeTypeLabel}}</div>
            <div class="table-cell">{{item.system.difficultyFormatted}}</div>
            <div class="table-cell--span2 rt-modifier-list">
                {{#each item.system.modifiersList as |mod|}}
                <span class="rt-modifier {{#if (lt mod.value 0)}}negative{{else}}positive{{/if}}">
                    {{mod.label}}: {{mod.formatted}}
                </span>
                {{/each}}
                {{#unless item.system.hasModifiers}}
                <em class="rt-text-muted">No stat modifiers</em>
                {{/unless}}
            </div>
            <div class="table-cell--last">
                <button class="rt-control-button item-delete" data-item-id="{{item.id}}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
        {{/each}}
    </div>
</div>
```

## Implementation Checklist

### ✅ Phase 1: Data Models (1 hour)
- [ ] Update VehicleTraitData with modifiers schema
- [ ] Add descriptionText field
- [ ] Add derived properties (hasModifiers, modifiersList, fullName)
- [ ] Update VehicleUpgradeData with all missing fields
- [ ] Add upgradeType, difficulty, allowedVehicles, source, installCost
- [ ] Add derived properties

### ✅ Phase 2: Config (30 min)
- [ ] Add vehicleUpgradeTypes
- [ ] Add vehicleStats
- [ ] Add localization keys

### ✅ Phase 3: Migration (1 hour)
- [ ] Create migration script
- [ ] Test on sample items
- [ ] Run full migration (50 traits + 13 upgrades)

### ✅ Phase 4: Vehicle Integration (1 hour)
- [ ] Add _applyItemModifiers() to VehicleData
- [ ] Call from prepareDerivedData()
- [ ] Test modifiers apply correctly

### ✅ Phase 5: Templates (1 hour)
- [ ] Update vehicle-upgrades-panel.hbs
- [ ] Create vehicle-traits-panel.hbs (if missing)
- [ ] Show modifiers in UI
- [ ] Test drag-drop

### ✅ Testing (1 hour)
- [ ] Drag trait onto vehicle → stats update
- [ ] Drag upgrade onto vehicle → stats update
- [ ] Multiple modifiers stack correctly
- [ ] Tooltip shows modifier sources

## Success Criteria

1. ✅ All traits have modifiers schema
2. ✅ All upgrades have full metadata
3. ✅ Traits/upgrades apply modifiers to vehicles
4. ✅ UI shows modifier effects
5. ✅ Tooltips show modifier sources
6. ✅ No data loss during migration

## Total Time: 5-6 hours
