# Weapon System Deep Dive & Refactor Plan

## Executive Summary

After comprehensive analysis of the weapon system (1093 weapons, data models, sheets, templates, and pack data), I've identified **critical misalignments** between:
- **Pack Data Structure** (legacy flat fields)
- **DataModel Schema** (modern V13 nested objects)
- **Template Rendering** (attempting to access nested properties)
- **CONFIG Integration** (helper functions expecting arrays)

**Root Cause**: Pack data uses legacy flat schema while code expects modern nested schema.

---

## 🔍 Current State Analysis

### Pack Data Structure (Legacy Format)

```json
{
  "name": "Astartes Bolt Pistol",
  "type": "weapon",
  "system": {
    "class": "pistol",              // ✅ GOOD - matches DataModel
    "type": "bolt",                 // ✅ GOOD - matches DataModel
    "range": "30m",                 // ❌ BAD - should be { value: 30, units: "m" }
    "rof": "S/3/4",                 // ❌ BAD - should be { single: true, semi: 3, full: 4 }
    "damage": "2d10+5",             // ❌ BAD - should be { formula: "2d10+5", bonus: 0, ... }
    "damageType": "Explosive",      // ❌ BAD - should be damage.type
    "penetration": 5,               // ❌ BAD - should be damage.penetration
    "clip": 14,                     // ❌ BAD - should be { max: 14, value: 14, type: "" }
    "reload": "Full",               // ✅ GOOD - matches DataModel
    "special": "SM Wep, Tearing",   // ❌ BAD - should be Set of identifiers
    "weight": "5.5kg",              // ❌ BAD - should be 5.5 (number)
    "availability": "Initiated",    // ❌ BAD - not in CONFIG choices
    "cost": "5 R",                  // ❌ BAD - should be { value: 5, currency: "renown" }
    "source": "Deathwatch: Core",   // ✅ GOOD - but not in DataModel
    "note": "...",                  // ✅ GOOD - but not in DataModel (should be notes)
    "description": { "value": "..." } // ✅ GOOD - matches DataModel
  }
}
```

### DataModel Schema (Modern V13 Format)

```javascript
// weapon.mjs - WeaponData extends:
// - DescriptionTemplate (description.value)
// - PhysicalItemTemplate (weight, availability, craftsmanship, quantity, cost)
// - EquippableTemplate (equipped, stowed)
// - AttackTemplate (attack.type, attack.characteristic, attack.range, attack.rateOfFire)
// - DamageTemplate (damage.formula, damage.type, damage.bonus, damage.penetration, special Set)

class WeaponData {
  static defineSchema() {
    return {
      identifier: IdentifierField,
      class: StringField,  // melee, pistol, basic, heavy, thrown, exotic
      type: StringField,   // primitive, las, bolt, melta, plasma, etc.
      twoHanded: BooleanField,
      melee: BooleanField,
      
      // From AttackTemplate
      attack: {
        type: StringField,  // melee, ranged, thrown, psychic
        characteristic: StringField,  // weaponSkill, ballisticSkill, etc.
        modifier: NumberField,
        range: {
          value: NumberField,
          units: StringField,
          special: StringField  // "SBx3", etc.
        },
        rateOfFire: {
          single: BooleanField,
          semi: NumberField,
          full: NumberField
        }
      },
      
      // From DamageTemplate
      damage: {
        formula: FormulaField,  // "2d10"
        type: StringField,      // impact, rending, explosive, energy, etc.
        bonus: NumberField,     // +5
        penetration: NumberField
      },
      special: SetField,  // Set of identifier strings
      
      // Ammo
      clip: {
        max: NumberField,
        value: NumberField,
        type: StringField
      },
      reload: StringField,  // "-", "free", "half", "full", "2-full", "3-full"
      
      // From PhysicalItemTemplate
      weight: NumberField,  // 5.5
      availability: StringField,  // choices from CONFIG
      craftsmanship: StringField,
      quantity: NumberField,
      cost: {
        value: NumberField,
        currency: StringField
      },
      
      // From EquippableTemplate
      equipped: BooleanField,
      stowed: BooleanField,
      container: StringField,
      
      // From DescriptionTemplate
      description: {
        value: StringField  // HTML
      },
      
      // Additional fields
      qualities: SetField,  // DUPLICATE of 'special' - needs cleanup
      modifications: ArrayField,  // weapon mods
      proficiency: StringField,
      notes: StringField
    };
  }
}
```

### Template Issues (item-weapon-sheet-modern.hbs)

```handlebars
{{!-- Lines 116, 129, 135, 186, 231, 237 --}}
{{selectOptions (arrayToObject dh.combat.damage_types) selected=item.system.damageType}}
```

**Problems**:
1. `dh` should be `CONFIG.ROGUE_TRADER` (but made available as `dh` in context)
2. `damage_types` doesn't exist - should be `damageTypes` (camelCase)
3. `arrayToObject` expects array/iterable, but CONFIG objects are already objects
4. `item.system.damageType` flat field doesn't exist - should be `item.system.damage.type`

**arrayToObject Helper** (line 137 handlebars-helpers.mjs):
```javascript
Handlebars.registerHelper('arrayToObject', function(array) {
    const obj = {};
    if (array == null || typeof array[Symbol.iterator] !== 'function') return obj;
    for (let a of array) {
        obj[a] = a;  // Creates {value: "value", ...}
    }
    return obj;
});
```

**Issue**: CONFIG.ROGUE_TRADER.damageTypes is already an object like:
```javascript
{
  impact: { label: "RT.DamageType.Impact", abbreviation: "I" },
  rending: { label: "RT.DamageType.Rending", abbreviation: "R" }
}
```

But `selectOptions` helper expects: `{value: "Label"}` or just string keys.

---

## 🎯 Refactor Goals

### 1. **Data Migration** - Align Pack Data with DataModel
- Parse legacy flat fields → nested schema
- Handle special cases (range formulas, RoF strings, special qualities)
- Validate all 1093 weapons
- Preserve source/note fields in appropriate locations

### 2. **DataModel Enhancement** - Handle Legacy & Modern Formats
- Add migration logic in `migrateData()` and `cleanData()`
- Add computed properties for backward compatibility
- Add proper validation
- Remove `qualities` field duplicate (consolidate to `special`)

### 3. **Template Modernization** - Fix Display Issues
- Fix CONFIG references (`dh` → proper context variable)
- Fix property paths (flat → nested)
- Remove broken `arrayToObject` usage
- Add proper localization

### 4. **Handlebars Helpers** - Fix selectOptions Integration
- Fix `arrayToObject` to handle CONFIG objects
- Or create new helper for CONFIG → selectOptions conversion
- Add proper null/undefined handling

### 5. **Compendium Display** - Proper Weapon Presentation
- Rich weapon cards with stats
- Proper labeling (use CONFIG labels)
- Damage/pen/range/RoF visual display
- Quality badges
- Source attribution

### 6. **Vocalization** - Chat Message Enhancement
- Weapon stat blocks in chat
- Roll result formatting
- Damage type icons
- Quality descriptions

---

## 📋 Implementation Plan

### Phase 1: Schema Analysis & Migration Script

**Create**: `scripts/migrate-weapons-pack.mjs`

```javascript
/**
 * Weapon Pack Migration Script
 * Migrates 1093 legacy weapons to V13 schema
 */

import fs from 'fs';
import path from 'path';

const WEAPON_DIR = 'src/packs/rt-items-weapons/_source';

// Parse legacy RoF string "S/3/-" → {single: true, semi: 3, full: 0}
function parseRoF(rofString) {
  if (!rofString || rofString === '-') {
    return { single: false, semi: 0, full: 0 };
  }
  const parts = rofString.split('/').map(p => p.trim());
  return {
    single: parts[0] === 'S' || parts[0] === 's',
    semi: parts[1] && parts[1] !== '-' ? parseInt(parts[1]) : 0,
    full: parts[2] && parts[2] !== '-' ? parseInt(parts[2]) : 0
  };
}

// Parse legacy range "30m" or "SBx3" → {value, units, special}
function parseRange(rangeString) {
  if (!rangeString || rangeString === '-') {
    return { value: 0, units: "m", special: "" };
  }
  
  // Check for formula ranges (SBx3, etc.)
  if (/[a-zA-Z]/.test(rangeString) && !rangeString.endsWith('m')) {
    return { value: 0, units: "m", special: rangeString };
  }
  
  // Parse numeric range
  const match = rangeString.match(/^(\d+(?:\.\d+)?)\s*(m|meters?)?$/i);
  if (match) {
    return { value: parseFloat(match[1]), units: "m", special: "" };
  }
  
  return { value: 0, units: "m", special: rangeString };
}

// Parse damage "2d10+5" → {formula: "2d10", bonus: 5}
function parseDamage(damageString) {
  if (!damageString) return { formula: "", bonus: 0 };
  
  const match = damageString.match(/^([^+\-]+)([\+\-]\d+)?$/);
  if (!match) return { formula: damageString, bonus: 0 };
  
  return {
    formula: match[1].trim(),
    bonus: match[2] ? parseInt(match[2]) : 0
  };
}

// Parse special qualities string → Set of identifiers
function parseSpecialQualities(specialString) {
  if (!specialString) return [];
  
  // Split by comma, clean, lowercase, convert to identifiers
  return specialString
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      // Remove parenthetical ratings: "Blast (3)" → "blast-3"
      const match = s.match(/^([^\(]+)(?:\((\d+)\))?/);
      if (!match) return s.toLowerCase().replace(/\s+/g, '-');
      
      const name = match[1].trim().toLowerCase().replace(/\s+/g, '-');
      const rating = match[2];
      return rating ? `${name}-${rating}` : name;
    });
}

// Parse weight "5.5kg" → 5.5
function parseWeight(weightString) {
  if (typeof weightString === 'number') return weightString;
  if (!weightString) return 0;
  
  const match = String(weightString).match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

// Parse clip value (can be number or "-")
function parseClip(clipValue) {
  if (clipValue === '-' || clipValue === null || clipValue === undefined) {
    return { max: 0, value: 0, type: "" };
  }
  if (typeof clipValue === 'number') {
    return { max: clipValue, value: clipValue, type: "" };
  }
  const num = parseInt(clipValue);
  return { max: num, value: num, type: "" };
}

// Normalize availability to match CONFIG choices
function normalizeAvailability(availability) {
  if (!availability) return "common";
  
  const normalized = availability.toLowerCase().replace(/\s+/g, '-');
  const validChoices = [
    "ubiquitous", "abundant", "plentiful", "common", "average",
    "scarce", "rare", "very-rare", "extremely-rare", "near-unique", "unique"
  ];
  
  // Map legacy values
  const mappings = {
    "initiated": "very-rare",
    "hero": "extremely-rare",
    "legendary": "near-unique"
  };
  
  const mapped = mappings[normalized] || normalized;
  return validChoices.includes(mapped) ? mapped : "common";
}

// Parse cost "5 R" or "120 T" → {value: 5, currency: "renown"}
function parseCost(costString) {
  if (!costString || costString === '-') {
    return { value: 0, currency: "throne" };
  }
  
  const match = String(costString).match(/(\d+)\s*([A-Z])/);
  if (!match) return { value: 0, currency: "throne" };
  
  const currencyMap = {
    'T': 'throne',
    'R': 'renown',
    'G': 'gelt'
  };
  
  return {
    value: parseInt(match[1]),
    currency: currencyMap[match[2]] || 'throne'
  };
}

// Normalize damage type
function normalizeDamageType(damageType) {
  if (!damageType) return "impact";
  
  const normalized = damageType.toLowerCase();
  const validTypes = ["impact", "rending", "explosive", "energy", "fire", "shock", "cold", "toxic"];
  
  return validTypes.includes(normalized) ? normalized : "impact";
}

// Determine attack type from weapon class
function getAttackType(weaponClass) {
  if (weaponClass === "melee") return "melee";
  if (weaponClass === "thrown") return "thrown";
  return "ranged";
}

// Determine attack characteristic
function getAttackCharacteristic(weaponClass) {
  if (weaponClass === "melee") return "weaponSkill";
  return "ballisticSkill";
}

// Main migration function
function migrateWeapon(weapon) {
  const system = weapon.system || {};
  
  // Parse legacy fields
  const damage = parseDamage(system.damage);
  const range = parseRange(system.range);
  const rof = parseRoF(system.rof);
  const clip = parseClip(system.clip);
  const weight = parseWeight(system.weight);
  const cost = parseCost(system.cost);
  const availability = normalizeAvailability(system.availability);
  const damageType = normalizeDamageType(system.damageType);
  const special = parseSpecialQualities(system.special);
  
  // Determine attack properties
  const attackType = getAttackType(system.class);
  const attackChar = getAttackCharacteristic(system.class);
  
  // Build modern schema
  const migrated = {
    ...weapon,
    system: {
      // Core weapon fields
      identifier: system.identifier || weapon.name.toLowerCase().replace(/\s+/g, '-'),
      class: system.class || "melee",
      type: system.type || "primitive",
      twoHanded: system.twoHanded || false,
      melee: system.class === "melee" || system.melee || false,
      
      // Attack properties (from AttackTemplate)
      attack: {
        type: attackType,
        characteristic: attackChar,
        modifier: system.attackModifier || 0,
        range: range,
        rateOfFire: rof
      },
      
      // Damage properties (from DamageTemplate)
      damage: {
        formula: damage.formula,
        type: damageType,
        bonus: damage.bonus,
        penetration: typeof system.penetration === 'number' ? system.penetration : 0
      },
      
      // Special qualities (use single 'special' field, remove 'qualities' duplicate)
      special: special,
      
      // Ammunition
      clip: clip,
      reload: system.reload || "-",
      
      // Physical properties (from PhysicalItemTemplate)
      weight: weight,
      availability: availability,
      craftsmanship: system.craftsmanship || "common",
      quantity: system.quantity || 1,
      cost: cost,
      
      // Equippable properties
      equipped: system.equipped || false,
      stowed: system.stowed || false,
      container: system.container || "",
      
      // Description
      description: system.description || { value: "" },
      
      // Additional fields
      modifications: system.modifications || [],
      proficiency: system.proficiency || "",
      notes: system.note || system.notes || "",  // Preserve note/notes
      source: system.source || ""  // Preserve source attribution
    }
  };
  
  return migrated;
}

// Process all weapon files
async function migrateAllWeapons() {
  const files = fs.readdirSync(WEAPON_DIR);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  
  console.log(`Found ${jsonFiles.length} weapon files to migrate`);
  
  let successCount = 0;
  let errorCount = 0;
  const errors = [];
  
  for (const file of jsonFiles) {
    try {
      const filepath = path.join(WEAPON_DIR, file);
      const raw = fs.readFileSync(filepath, 'utf8');
      const weapon = JSON.parse(raw);
      
      // Migrate
      const migrated = migrateWeapon(weapon);
      
      // Write back
      fs.writeFileSync(filepath, JSON.stringify(migrated, null, 2), 'utf8');
      successCount++;
      
      if (successCount % 100 === 0) {
        console.log(`Migrated ${successCount} weapons...`);
      }
    } catch (err) {
      errorCount++;
      errors.push({ file, error: err.message });
      console.error(`Error migrating ${file}:`, err.message);
    }
  }
  
  console.log(`\n✅ Migration complete!`);
  console.log(`   Successful: ${successCount}`);
  console.log(`   Errors: ${errorCount}`);
  
  if (errors.length > 0) {
    console.log(`\nErrors:`);
    errors.forEach(e => console.log(`  - ${e.file}: ${e.error}`));
  }
}

// Run migration
migrateAllWeapons().catch(console.error);
```

### Phase 2: DataModel Enhancement

**Update**: `src/module/data/item/weapon.mjs`

```javascript
// Add migration methods
class WeaponData extends ItemDataModel.mixin(...) {
  
  /** @override */
  static migrateData(source) {
    const migrated = super.migrateData(source);
    
    // Handle legacy flat damage field
    if (typeof migrated.damage === 'string') {
      const parsed = this._parseLegacyDamage(migrated.damage);
      migrated.damage = {
        formula: parsed.formula,
        bonus: parsed.bonus,
        type: migrated.damageType || "impact",
        penetration: migrated.penetration || 0
      };
      delete migrated.damageType;
      delete migrated.penetration;
    }
    
    // Handle legacy flat range field
    if (typeof migrated.range === 'string') {
      migrated.attack = migrated.attack || {};
      migrated.attack.range = this._parseLegacyRange(migrated.range);
      delete migrated.range;
    }
    
    // Handle legacy RoF string
    if (typeof migrated.rof === 'string') {
      migrated.attack = migrated.attack || {};
      migrated.attack.rateOfFire = this._parseLegacyRoF(migrated.rof);
      delete migrated.rof;
    }
    
    // Handle legacy clip number
    if (typeof migrated.clip === 'number' || migrated.clip === '-') {
      migrated.clip = this._parseLegacyClip(migrated.clip);
    }
    
    // Handle legacy weight string
    if (typeof migrated.weight === 'string') {
      migrated.weight = parseFloat(migrated.weight.match(/[\d.]+/)?.[0] || 0);
    }
    
    // Handle legacy special string
    if (typeof migrated.special === 'string') {
      migrated.special = this._parseLegacySpecial(migrated.special);
    }
    
    // Consolidate qualities → special
    if (migrated.qualities && migrated.qualities.size > 0) {
      migrated.special = migrated.special || new Set();
      for (const q of migrated.qualities) {
        migrated.special.add(q);
      }
      delete migrated.qualities;
    }
    
    // Move note → notes
    if (migrated.note && !migrated.notes) {
      migrated.notes = migrated.note;
      delete migrated.note;
    }
    
    return migrated;
  }
  
  /** @override */
  static cleanData(source, options) {
    // Ensure attack object exists
    if (!source.attack) {
      source.attack = {
        type: source.class === "melee" ? "melee" : "ranged",
        characteristic: source.class === "melee" ? "weaponSkill" : "ballisticSkill",
        modifier: 0,
        range: { value: 0, units: "m", special: "" },
        rateOfFire: { single: true, semi: 0, full: 0 }
      };
    }
    
    // Ensure damage object exists
    if (!source.damage || typeof source.damage === 'string') {
      source.damage = {
        formula: "",
        type: "impact",
        bonus: 0,
        penetration: 0
      };
    }
    
    // Ensure clip object
    if (typeof source.clip !== 'object') {
      source.clip = { max: 0, value: 0, type: "" };
    }
    
    // Ensure special is Set
    if (Array.isArray(source.special)) {
      source.special = new Set(source.special);
    } else if (!source.special) {
      source.special = new Set();
    }
    
    return super.cleanData(source, options);
  }
  
  // Helper methods for parsing
  static _parseLegacyDamage(damageString) {
    // ... (same as migration script)
  }
  
  static _parseLegacyRange(rangeString) {
    // ... (same as migration script)
  }
  
  static _parseLegacyRoF(rofString) {
    // ... (same as migration script)
  }
  
  static _parseLegacyClip(clipValue) {
    // ... (same as migration script)
  }
  
  static _parseLegacySpecial(specialString) {
    // ... (same as migration script)
  }
  
  /* -------------------------------------------- */
  /*  Backward Compatibility Properties           */
  /* -------------------------------------------- */
  
  /**
   * Legacy flat damage field (read-only)
   * @type {string}
   * @deprecated Use damage.formula + damage.bonus
   */
  get legacyDamage() {
    const dmg = this.damage;
    if (!dmg.formula) return "";
    let str = dmg.formula;
    if (dmg.bonus > 0) str += `+${dmg.bonus}`;
    else if (dmg.bonus < 0) str += dmg.bonus;
    return str;
  }
  
  /**
   * Legacy flat range field (read-only)
   * @type {string}
   * @deprecated Use attack.range
   */
  get legacyRange() {
    const r = this.attack.range;
    if (r.special) return r.special;
    if (r.value) return `${r.value}${r.units}`;
    return "-";
  }
  
  /**
   * Legacy RoF string (read-only)
   * @type {string}
   * @deprecated Use attack.rateOfFire
   */
  get legacyRoF() {
    const rof = this.attack.rateOfFire;
    const parts = [];
    parts.push(rof.single ? "S" : "-");
    parts.push(rof.semi > 0 ? rof.semi.toString() : "-");
    parts.push(rof.full > 0 ? rof.full.toString() : "-");
    return parts.join("/");
  }
}
```

### Phase 3: Template Fixes

**Update**: `src/templates/item/item-weapon-sheet-modern.hbs`

```handlebars
{{!-- BEFORE (line 116) --}}
<select class="rt-field__select" name="system.damageType">
    {{selectOptions (arrayToObject dh.combat.damage_types) selected=item.system.damageType}}
</select>

{{!-- AFTER --}}
<select class="rt-field__select" name="system.damage.type">
    {{selectOptions CONFIG.ROGUE_TRADER.damageTypes selected=item.system.damage.type localize=true labelAttr="label" valueAttr="@key"}}
</select>

{{!-- BEFORE (line 111) --}}
<input type="text" name="system.damage" value="{{item.system.damage}}" />

{{!-- AFTER --}}
<input type="text" name="system.damage.formula" value="{{item.system.damage.formula}}" placeholder="1d10" />
<input type="number" name="system.damage.bonus" value="{{item.system.damage.bonus}}" placeholder="+0" />

{{!-- BEFORE (line 121) --}}
<input type="text" name="system.penetration" value="{{item.system.penetration}}" />

{{!-- AFTER --}}
<input type="number" name="system.damage.penetration" value="{{item.system.damage.penetration}}" />

{{!-- Fix all range/rof/clip fields similarly --}}
```

**Create**: Enhanced selectOptions helper

```javascript
// In handlebars-helpers.mjs
Handlebars.registerHelper('selectOptions', function(choices, options) {
    const hash = options.hash || {};
    const selected = hash.selected;
    const localize = hash.localize || false;
    const blank = hash.blank || null;
    const labelAttr = hash.labelAttr || 'label';
    const valueAttr = hash.valueAttr || '@key';  // @key means use object key
    
    let html = "";
    
    // Add blank option if requested
    if (blank !== null) {
        const label = localize ? game.i18n.localize(blank) : blank;
        html += `<option value="">${label}</option>`;
    }
    
    // Handle CONFIG-style objects
    if (choices && typeof choices === 'object' && !Array.isArray(choices)) {
        for (const [key, data] of Object.entries(choices)) {
            const value = valueAttr === '@key' ? key : data[valueAttr];
            let label = labelAttr === '@key' ? key : data[labelAttr];
            
            if (localize && label) {
                label = game.i18n.localize(label);
            }
            
            const isSelected = value === selected ? ' selected' : '';
            html += `<option value="${value}"${isSelected}>${label}</option>`;
        }
    }
    
    return new Handlebars.SafeString(html);
});
```

### Phase 4: Context Preparation

**Update**: `src/module/applications/item/weapon-sheet.mjs`

```javascript
/** @override */
async _prepareContext(options) {
    const context = await super._prepareContext(options);
    
    // Add CONFIG reference for templates
    context.CONFIG = CONFIG.ROGUE_TRADER;
    
    // Add formatted weapon stats
    context.weaponStats = {
        damageDisplay: this.item.system.damageLabel,
        rangeDisplay: this.item.system.rangeLabel,
        rofDisplay: this.item.system.rateOfFireLabel,
        penDisplay: this.item.system.damage.penetration,
        classLabel: this.item.system.classLabel,
        typeLabel: this.item.system.typeLabel
    };
    
    // Add special qualities with descriptions
    context.specialQualities = this._prepareSpecialQualities();
    
    return context;
}

_prepareSpecialQualities() {
    const qualities = [];
    for (const identifier of this.item.system.special) {
        // Look up quality in compendium or CONFIG
        const quality = this._getQualityData(identifier);
        qualities.push({
            identifier,
            name: quality?.name || identifier,
            description: quality?.description || "",
            hasRating: identifier.match(/-\d+$/),  // "blast-3" format
            rating: identifier.match(/-(\d+)$/)?.[1] || null
        });
    }
    return qualities;
}
```

### Phase 5: Compendium Display

**Create**: Rich weapon card template for compendium browser

```handlebars
{{!-- templates/compendium/weapon-card.hbs --}}
<div class="rt-weapon-card">
    <div class="rt-weapon-card__header">
        <img src="{{item.img}}" alt="{{item.name}}" />
        <div class="rt-weapon-card__title">
            <h3>{{item.name}}</h3>
            <span class="rt-weapon-card__type">
                {{item.system.classLabel}} ({{item.system.typeLabel}})
            </span>
        </div>
    </div>
    
    <div class="rt-weapon-card__stats">
        <div class="rt-stat">
            <span class="rt-stat__label">Damage</span>
            <span class="rt-stat__value">{{item.system.damageLabel}}</span>
        </div>
        <div class="rt-stat">
            <span class="rt-stat__label">Pen</span>
            <span class="rt-stat__value">{{item.system.damage.penetration}}</span>
        </div>
        {{#if item.system.isRangedWeapon}}
        <div class="rt-stat">
            <span class="rt-stat__label">Range</span>
            <span class="rt-stat__value">{{item.system.rangeLabel}}</span>
        </div>
        <div class="rt-stat">
            <span class="rt-stat__label">RoF</span>
            <span class="rt-stat__value">{{item.system.rateOfFireLabel}}</span>
        </div>
        {{/if}}
    </div>
    
    {{#if item.system.special.size}}
    <div class="rt-weapon-card__qualities">
        {{#each specialQualities as |quality|}}
        <span class="rt-quality-badge" data-tooltip="{{quality.description}}">
            {{quality.name}}
            {{#if quality.hasRating}}({{quality.rating}}){{/if}}
        </span>
        {{/each}}
    </div>
    {{/if}}
    
    <div class="rt-weapon-card__footer">
        {{#if item.system.source}}
        <span class="rt-source">{{item.system.source}}</span>
        {{/if}}
        <span class="rt-availability">{{item.system.availabilityLabel}}</span>
    </div>
</div>
```

### Phase 6: Chat Vocalization

**Update**: Weapon chat card template

```javascript
// In weapon.mjs or acolyte.mjs
async rollAttack(options = {}) {
    // ... existing roll logic ...
    
    // Enhanced chat message
    const chatData = {
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: `${this.name} Attack`,
        content: await renderTemplate(
            "systems/rogue-trader/templates/chat/weapon-attack.hbs",
            {
                weapon: this,
                roll: roll,
                target: options.target,
                stats: {
                    damage: this.system.damageLabel,
                    pen: this.system.damage.penetration,
                    damageType: game.i18n.localize(`RT.DamageType.${this.system.damage.type.capitalize()}`),
                    qualities: Array.from(this.system.special).map(q => ({
                        name: q,
                        // Look up description from compendium
                    }))
                }
            }
        )
    };
    
    return ChatMessage.create(chatData);
}
```

---

## 🧪 Validation & Testing

### Automated Tests

**Create**: `scripts/validate-weapons.mjs`

```javascript
// Load all 1093 weapons
// Check each weapon against WeaponData schema
// Report missing required fields
// Report invalid enum values
// Report type mismatches

async function validateAllWeapons() {
    const weapons = // ... load from packs
    
    for (const weapon of weapons) {
        try {
            // Attempt to create WeaponData instance
            const data = new WeaponData(weapon.system);
            
            // Validate computed properties
            assert(data.damageLabel, "Missing damageLabel");
            assert(data.rangeLabel, "Missing rangeLabel");
            assert(data.classLabel, "Missing classLabel");
            
        } catch (err) {
            console.error(`❌ ${weapon.name}:`, err.message);
        }
    }
}
```

### Manual Testing Checklist

- [ ] Create new weapon from scratch
- [ ] Edit existing weapon
- [ ] Drag weapon to actor sheet
- [ ] Equip/unequip weapon
- [ ] Roll weapon attack
- [ ] Fire weapon (consume ammo)
- [ ] Reload weapon
- [ ] View weapon in compendium
- [ ] Search/filter weapons
- [ ] Export/import weapon
- [ ] Apply weapon modification
- [ ] View weapon in chat

---

## 📊 Migration Statistics

**Expected Results**:
- 1093 weapons migrated
- ~15 special qualities cataloged
- ~200 unique weapon names
- 15 weapon types
- 6 weapon classes

**Validation Metrics**:
- 100% schema compliance
- 0 [object Object] displays
- 0 undefined values in UI
- All dropdowns populated correctly
- All calculations working

---

## 🚀 Rollout Strategy

### Step 1: Backup
```bash
cp -r src/packs/rt-items-weapons src/packs/rt-items-weapons.backup
```

### Step 2: Run Migration Script
```bash
node scripts/migrate-weapons-pack.mjs
```

### Step 3: Validate Data
```bash
node scripts/validate-weapons.mjs
```

### Step 4: Update Code
- Apply DataModel enhancements
- Fix templates
- Update helpers
- Test in Foundry

### Step 5: Build & Test
```bash
npm run build
# Launch Foundry, test weapons
```

### Step 6: Document Changes
- Update AGENTS.md
- Update RogueTraderInfo.md
- Create WEAPON_SYSTEM.md guide

---

## 🎨 Future Enhancements

### Quality of Life
- [ ] Visual weapon picker (card grid)
- [ ] Weapon comparison tool
- [ ] Favorite weapons system
- [ ] Weapon loadout presets
- [ ] Quick equip from compendium

### Advanced Features
- [ ] Weapon crafting system
- [ ] Ammunition management
- [ ] Weapon degradation
- [ ] Custom weapon creator
- [ ] Weapon modification builder

### Integration
- [ ] Active Effects on weapons
- [ ] Conditional modifiers
- [ ] Talent interactions
- [ ] Ship weapon integration
- [ ] Vehicle weapon compatibility

---

## 📝 Notes

### Design Decisions

1. **Keep source/notes fields**: Important for GM reference
2. **Consolidate qualities**: Single `special` Set, remove duplicate `qualities`
3. **Backward compatibility**: Legacy getters for old code
4. **Migration in DataModel**: Handle both old and new formats gracefully
5. **CONFIG-first**: All labels/choices from CONFIG, not hardcoded

### Known Limitations

1. Some weapons have custom rules in `notes` that need manual implementation
2. Weapon qualities need full compendium with descriptions
3. Attack modifiers from talents/effects not yet integrated
4. Ship weapons use different schema (separate system)

### Related Systems

- **Ammunition**: Separate item type, needs similar treatment
- **Weapon Mods**: Separate item type, embedded in weapons
- **Weapon Qualities**: Should be separate compendium items
- **Attack Specials**: Related to qualities, need cataloging

---

## ✅ Success Criteria

- [ ] Zero `[object Object]` displays in weapon sheets
- [ ] All dropdowns show proper labels (not keys)
- [ ] All 1093 weapons load without errors
- [ ] Weapon attacks roll correctly
- [ ] Damage calculations accurate
- [ ] Compendium displays rich weapon cards
- [ ] Chat messages show proper weapon stats
- [ ] No console errors related to weapons
- [ ] All tests pass
- [ ] Documentation complete

---

*This is a comprehensive, surgical refactor focused solely on the weapon system. No shortcuts, full modernization, V13-native patterns throughout.*
