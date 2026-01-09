# Weapon System Deep Dive & Modernization Plan

## Executive Summary

**Problem**: The weapon system has a **critical schema mismatch** between pack data (legacy flat strings) and the V13 DataModel (nested structured objects). This causes `[object Object]` displays throughout the UI.

**Root Cause**: Pack data uses flat strings (`"range": "30m"`, `"damage": "1d10+3"`) but WeaponData extends templates expecting nested objects (`attack.range.value`, `damage.formula`).

**Impact**: 1093 weapon entries are incompatible with current data model.

---

## Current Architecture Analysis

### Data Model Structure (V13)

```mjs
// WeaponData extends 5 templates:
WeaponData extends ItemDataModel.mixin(
  DescriptionTemplate,      // description.value
  PhysicalItemTemplate,     // weight, availability, craftsmanship
  EquippableTemplate,       // equipped, twoHanded
  AttackTemplate,           // attack.* (nested SchemaField)
  DamageTemplate            // damage.* (nested SchemaField)
)
```

#### AttackTemplate Schema (attack-template.mjs)

```javascript
attack: new fields.SchemaField({
  type: StringField,          // "melee" | "ranged" | "thrown" | "psychic"
  characteristic: StringField, // "weaponSkill" | "ballisticSkill"
  modifier: NumberField,       // Integer modifier to attack
  range: new fields.SchemaField({
    value: NumberField,        // Numeric range in meters
    units: StringField,        // "m" (meters)
    special: StringField       // "SBx3" or other special ranges
  }),
  rateOfFire: new fields.SchemaField({
    single: BooleanField,      // true if single shot available
    semi: NumberField,         // Rounds per semi-auto (0 if N/A)
    full: NumberField          // Rounds per full-auto (0 if N/A)
  })
})
```

#### DamageTemplate Schema (damage-template.mjs)

```javascript
damage: new fields.SchemaField({
  formula: FormulaField,       // "1d10" or "2d10+5" (validated Roll formula)
  type: StringField,           // "impact" | "rending" | "explosive" | "energy" | etc.
  bonus: NumberField,          // Integer bonus damage (separate from formula)
  penetration: NumberField     // AP penetration value
}),
special: SetField             // Set of special quality identifiers
```

### Pack Data Structure (Legacy)

**Example**: `astartes-bolt-pistol-alt_PmmotPB9vs78lX1O.json`

```json
{
  "name": "Astartes Bolt Pistol (alt.)",
  "type": "weapon",
  "system": {
    "class": "pistol",              // ✅ CORRECT (flat string)
    "type": "bolt",                 // ✅ CORRECT (flat string)
    "range": "30m",                 // ❌ WRONG (expects attack.range.value)
    "rof": "S/2/-",                 // ❌ WRONG (expects attack.rateOfFire.*)
    "damage": "1d10+9",             // ❌ WRONG (expects damage.formula)
    "damageType": "Explosive",      // ❌ WRONG (expects damage.type)
    "penetration": 5,               // ❌ WRONG (expects damage.penetration)
    "clip": 14,                     // ❌ WRONG (expects clip.max and clip.value)
    "reload": "Full",               // ✅ CORRECT (flat string)
    "special": "SM Wep, Tearing",   // ❌ WRONG (expects Set of identifiers)
    "weight": "5.5kg",              // ⚠️ PARTIAL (should be number, not string)
    "availability": "Initiated",    // ✅ CORRECT
    "source": "Deathwatch: Errata", // ✅ CORRECT
    "note": "Space Marines Only...", // ✅ CORRECT
    "description": { "value": "..." } // ✅ CORRECT
  }
}
```

### Schema Mapping Requirements

| Pack Field | Target Schema Path | Transformation |
|------------|-------------------|----------------|
| `range` | `attack.range.value` + `attack.range.special` | Parse: "30m" → value:30, or "SBx3" → special:"SBx3" |
| `rof` | `attack.rateOfFire.{single,semi,full}` | Parse: "S/2/-" → {single:true, semi:2, full:0} |
| `damage` | `damage.formula` | Direct: "1d10+9" → formula |
| `damageType` | `damage.type` | Map: "Explosive" → "explosive" (lowercase) |
| `penetration` | `damage.penetration` | Direct copy |
| `clip` (number) | `clip.max` + `clip.value` | Copy to both max and value |
| `special` (string) | `special` (Set) | Parse: "Tearing, Blast (3)" → Set of identifiers |
| `weight` | `weight` | Parse: "5.5kg" → 5.5 (number) |

---

## Problem Areas

### 1. **Template Display Issues** (`[object Object]`)

**weapon-panel.hbs** (lines 54-82):

```handlebars
<span class="rt-field__span">{{item.system.damage}}</span>      <!-- [object Object] -->
<span class="rt-field__span">{{item.system.damageType}}</span>  <!-- [object Object] -->
<span class="rt-field__span">{{item.system.range}}</span>       <!-- [object Object] -->
<span class="rt-field__span">{{rateOfFireDisplay item.system.rateOfFire}}</span>
<span class="rt-field__span">{{item.system.clip.value}} / {{item.system.clip.max}}</span>
```

**Fix Required**: Use computed properties from WeaponData:
- `{{item.system.damageLabel}}` instead of `{{item.system.damage}}`
- `{{item.system.rangeLabel}}` instead of `{{item.system.range}}`
- `{{item.system.rateOfFireLabel}}` instead of helper

### 2. **Item Sheet Template Issues**

**item-weapon-sheet-modern.hbs** (lines 111-122):

```handlebars
<input name="system.damage" value="{{item.system.damage}}" />          <!-- Wrong path -->
<select name="system.damageType">...</select>                          <!-- Wrong path -->
<input name="system.penetration" value="{{item.system.penetration}}" /><!-- Wrong path -->
```

**Fix Required**: Update to nested paths:
- `name="system.damage.formula"`
- `name="system.damage.type"`
- `name="system.damage.penetration"`

### 3. **Migration Gap**

**No migration script exists** to transform 1093 pack weapons from legacy → V13 schema.

---

## Modernization Plan

### Phase 1: Data Model Enhancement ✅ (Already Solid)

**Status**: WeaponData schema is correctly designed using AttackTemplate + DamageTemplate mixins.

**Enhancement Needed**: Add migration helpers to WeaponData:

```javascript
// Add to weapon.mjs
static migrateData(source) {
  const migrated = super.migrateData(source);
  
  // Migrate flat range → attack.range
  if (typeof source.range === 'string') {
    migrated.attack ??= {};
    migrated.attack.range = this._parseRange(source.range);
    delete migrated.range;
  }
  
  // Migrate flat rof → attack.rateOfFire
  if (typeof source.rof === 'string') {
    migrated.attack ??= {};
    migrated.attack.rateOfFire = this._parseRateOfFire(source.rof);
    delete migrated.rof;
  }
  
  // Migrate flat damage → damage.formula
  if (typeof source.damage === 'string') {
    migrated.damage ??= {};
    migrated.damage.formula = source.damage;
    delete migrated.damage;
  }
  
  // ... etc
  return migrated;
}
```

### Phase 2: Pack Data Migration Script 🔧

**Create**: `scripts/migrate-weapon-packs.mjs`

```javascript
/**
 * Migrates all weapon pack data from legacy flat schema to V13 nested schema.
 * 
 * Usage: node scripts/migrate-weapon-packs.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACK_DIR = path.join(__dirname, '../src/packs/rt-items-weapons/_source');

// Damage type mapping (proper casing → lowercase)
const DAMAGE_TYPE_MAP = {
  'Impact': 'impact',
  'Rending': 'rending',
  'Explosive': 'explosive',
  'Energy': 'energy',
  'Fire': 'fire',
  'Shock': 'shock',
  'Cold': 'cold',
  'Toxic': 'toxic'
};

function parseRange(rangeStr) {
  if (!rangeStr || rangeStr === '-' || rangeStr === 'N/A') {
    return { value: 0, units: 'm', special: '' };
  }
  
  // Check for special ranges (SBx3, SBx5, etc.)
  if (rangeStr.match(/SB|TB|AB|metres|Psyker PR/i)) {
    return { value: 0, units: 'm', special: rangeStr };
  }
  
  // Parse numeric range (30m, 110m, etc.)
  const match = rangeStr.match(/^(\d+)m?$/);
  if (match) {
    return { value: parseInt(match[1]), units: 'm', special: '' };
  }
  
  // Fallback to special
  return { value: 0, units: 'm', special: rangeStr };
}

function parseRateOfFire(rofStr) {
  if (!rofStr || rofStr === '-') {
    return { single: false, semi: 0, full: 0 };
  }
  
  // Parse S/2/- or S/3/10 format
  const parts = rofStr.split('/');
  return {
    single: parts[0] === 'S',
    semi: parts[1] && parts[1] !== '-' ? parseInt(parts[1]) : 0,
    full: parts[2] && parts[2] !== '-' ? parseInt(parts[2]) : 0
  };
}

function parseClip(clipValue) {
  if (!clipValue || clipValue === '-' || clipValue === 'N/A') {
    return { max: 0, value: 0, type: '' };
  }
  
  if (typeof clipValue === 'number') {
    return { max: clipValue, value: clipValue, type: '' };
  }
  
  // Handle strings like "30" or "60 (box)"
  const match = String(clipValue).match(/^(\d+)/);
  const max = match ? parseInt(match[1]) : 0;
  return { max, value: max, type: '' };
}

function parseSpecials(specialStr) {
  if (!specialStr || specialStr === '-') return new Set();
  
  // Split by comma, trim, lowercase, normalize identifiers
  const specials = specialStr.split(',').map(s => {
    const trimmed = s.trim();
    // Extract quality name (e.g., "Blast (3)" → "blast")
    const match = trimmed.match(/^([^\(]+)/);
    return match ? match[1].trim().toLowerCase().replace(/\s+/g, '-') : trimmed.toLowerCase();
  });
  
  return new Set(specials);
}

function parseWeight(weightStr) {
  if (!weightStr || weightStr === '-') return 0;
  
  if (typeof weightStr === 'number') return weightStr;
  
  // Parse "5.5kg" → 5.5
  const match = String(weightStr).match(/^([\d.]+)/);
  return match ? parseFloat(match[1]) : 0;
}

async function migrateWeapon(weaponPath) {
  const content = await fs.readFile(weaponPath, 'utf-8');
  const weapon = JSON.parse(content);
  
  // Skip if already migrated (has nested damage.formula)
  if (weapon.system.damage?.formula) {
    console.log(`✓ ${weapon.name} already migrated`);
    return false;
  }
  
  const system = weapon.system;
  const migrated = {
    ...system,
    
    // Migrate attack data
    attack: {
      type: system.class === 'melee' ? 'melee' : 'ranged',
      characteristic: system.class === 'melee' ? 'weaponSkill' : 'ballisticSkill',
      modifier: 0,
      range: parseRange(system.range),
      rateOfFire: parseRateOfFire(system.rof)
    },
    
    // Migrate damage data
    damage: {
      formula: system.damage || '',
      type: DAMAGE_TYPE_MAP[system.damageType] || 'impact',
      bonus: 0,
      penetration: parseInt(system.penetration) || 0
    },
    
    // Migrate clip data
    clip: parseClip(system.clip),
    
    // Migrate special qualities
    special: parseSpecials(system.special),
    
    // Migrate weight
    weight: parseWeight(system.weight),
    
    // Add new fields
    identifier: weapon.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
    melee: system.class === 'melee',
    twoHanded: false, // Default, can be set via qualities
    qualities: new Set(), // Weapon qualities (separate from special)
    modifications: [],
    proficiency: '',
    notes: system.note || ''
  };
  
  // Remove legacy fields
  delete migrated.range;
  delete migrated.rof;
  delete migrated.damageType;
  delete migrated.note;
  
  weapon.system = migrated;
  
  // Write back
  await fs.writeFile(weaponPath, JSON.stringify(weapon, null, 2));
  console.log(`✓ Migrated ${weapon.name}`);
  return true;
}

async function main() {
  const files = await fs.readdir(PACK_DIR);
  const weaponFiles = files.filter(f => f.endsWith('.json'));
  
  console.log(`Found ${weaponFiles.length} weapon files`);
  
  let migrated = 0;
  let skipped = 0;
  
  for (const file of weaponFiles) {
    try {
      const filePath = path.join(PACK_DIR, file);
      const wasMigrated = await migrateWeapon(filePath);
      if (wasMigrated) migrated++;
      else skipped++;
    } catch (err) {
      console.error(`✗ Error migrating ${file}:`, err.message);
    }
  }
  
  console.log(`\nMigration complete:`);
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Total: ${weaponFiles.length}`);
}

main().catch(console.error);
```

### Phase 3: Template Modernization 🎨

**Update**: `templates/actor/panel/weapon-panel.hbs`

```handlebars
<div class="rt-panel rt-grid-col-4">
    <div class="rt-panel-header">
        <span class="rt-panel-title"><i class="fas fa-sword"></i> Weapons</span>
    </div>
    <div class="rt-panel-body">
        <div class="rt-table--border rt-weapontable--border">
        <div class="table-row--head">
            <div class="table-cell--span2">Name</div>
            <div class="table-cell">Damage</div>
            <div class="table-cell">Pen</div>
            <div class="table-cell">Range</div>
            <div class="table-cell">RoF</div>
            <div class="table-cell">Clip</div>
            <div class="table-cell--last">
                <label class="rt-control-button" data-action="itemCreate" data-item-type="weapon">
                    <span class="rt-control-button__span material-icons">add_circle</span>
                </label>
            </div>
        </div>
        {{#each categorizedItems.weapons as |weapon|}}
            <div class="table-row item-drag" data-item-id="{{weapon.id}}" data-item-type="weapon">
                <div class="table-cell--settingstoggle">
                    <label class="rt-control-button" data-action="itemEdit" data-item-id="{{weapon.id}}">
                        <span class="rt-control-button__span material-icons">settings</span>
                    </label>
                </div>
                <div class="table-cell--left">
                    {{> systems/rogue-trader/templates/actor/partial/trait-toggle.hbs 
                        toggle=(concat 'description_' weapon.id) 
                        text=weapon.name}}
                </div>
                <div class="table-cell">
                    <span class="display">{{weapon.system.damageLabel}}</span>
                </div>
                <div class="table-cell">
                    <span class="display">{{weapon.system.damage.penetration}}</span>
                </div>
                <div class="table-cell">
                    <span class="display">{{weapon.system.rangeLabel}}</span>
                </div>
                <div class="table-cell">
                    <span class="display">{{weapon.system.rateOfFireLabel}}</span>
                </div>
                <div class="table-cell">
                    {{#if weapon.system.usesAmmo}}
                    <span class="display {{#if weapon.system.isOutOfAmmo}}rt-text-danger{{/if}}">
                        {{weapon.system.clip.value}}/{{weapon.system.clip.max}}
                    </span>
                    {{else}}
                    <span class="display rt-text-muted">-</span>
                    {{/if}}
                </div>
                <div class="table-cell--last">
                    <label class="rt-control-button" data-action="itemRoll" data-item-id="{{weapon.id}}" 
                           title="Attack Roll">
                        <span class="rt-control-button__span material-icons">casino</span>
                    </label>
                    {{#if weapon.system.usesAmmo}}
                    <label class="rt-control-button" data-action="weaponReload" data-item-id="{{weapon.id}}"
                           title="Reload Weapon">
                        <span class="rt-control-button__span material-icons">autorenew</span>
                    </label>
                    {{/if}}
                    <label class="rt-control-button" data-action="itemDelete" data-item-id="{{weapon.id}}">
                        <span class="rt-control-button__span material-icons">delete</span>
                    </label>
                </div>
                
                <!-- Expanded Description Row -->
                <div class="table-cell--description description_{{weapon.id}}" 
                     {{hideIfNot (isExpanded (concat 'description_' weapon.id))}}>
                    <div class="rt-weapon-details">
                        <div class="rt-detail-grid">
                            <div class="rt-detail">
                                <span class="rt-detail__label">Class:</span>
                                <span class="rt-detail__value">{{weapon.system.classLabel}}</span>
                            </div>
                            <div class="rt-detail">
                                <span class="rt-detail__label">Type:</span>
                                <span class="rt-detail__value">{{weapon.system.typeLabel}}</span>
                            </div>
                            <div class="rt-detail">
                                <span class="rt-detail__label">Damage Type:</span>
                                <span class="rt-detail__value">{{weapon.system.damageTypeLabel}}</span>
                            </div>
                            {{#if weapon.system.usesAmmo}}
                            <div class="rt-detail">
                                <span class="rt-detail__label">Reload:</span>
                                <span class="rt-detail__value">{{weapon.system.reloadLabel}}</span>
                            </div>
                            {{/if}}
                        </div>
                        
                        {{#if weapon.system.qualities.size}}
                        <div class="rt-qualities">
                            <span class="rt-detail__label">Qualities:</span>
                            <div class="rt-tags">
                                {{#each weapon.system.qualities as |quality|}}
                                <span class="rt-tag rt-tag--quality">{{quality}}</span>
                                {{/each}}
                            </div>
                        </div>
                        {{/if}}
                        
                        {{#if weapon.system.special.size}}
                        <div class="rt-specials">
                            <span class="rt-detail__label">Special:</span>
                            <div class="rt-tags">
                                {{#each weapon.system.special as |special|}}
                                <span class="rt-tag rt-tag--special">{{special}}</span>
                                {{/each}}
                            </div>
                        </div>
                        {{/if}}
                    </div>
                </div>
            </div>
        {{/each}}
        </div>
    </div>
</div>
```

**Update**: `templates/item/item-weapon-sheet-modern.hbs`

```handlebars
<!-- Combat Statistics Panel -->
<div class="rt-panel">
    <div class="rt-panel__header">
        <h3><i class="fas fa-swords"></i> Combat Statistics</h3>
    </div>
    <div class="rt-panel__content">
        <div class="rt-field-grid rt-field-grid--3">
            <div class="rt-field">
                <label class="rt-field__label">Damage Formula</label>
                <input type="text" class="rt-field__input" 
                       name="system.damage.formula" 
                       value="{{item.system.damage.formula}}" 
                       placeholder="1d10+3" />
                <span class="rt-field__hint">Roll formula (e.g., 1d10, 2d10+5)</span>
            </div>
            <div class="rt-field">
                <label class="rt-field__label">Damage Type</label>
                <select class="rt-field__select" name="system.damage.type">
                    {{selectOptions dh.damageTypes selected=item.system.damage.type}}
                </select>
            </div>
            <div class="rt-field">
                <label class="rt-field__label">Penetration</label>
                <input type="number" class="rt-field__input" 
                       name="system.damage.penetration" 
                       value="{{item.system.damage.penetration}}" 
                       placeholder="0" min="0" />
            </div>
        </div>
        
        <div class="rt-field-grid rt-field-grid--2" style="margin-top: 1rem;">
            <div class="rt-field">
                <label class="rt-field__label">Weapon Class</label>
                <select class="rt-field__select" name="system.class">
                    {{selectOptions dh.weaponClasses selected=item.system.class}}
                </select>
            </div>
            <div class="rt-field">
                <label class="rt-field__label">Weapon Type</label>
                <select class="rt-field__select" name="system.type">
                    {{selectOptions dh.weaponTypes selected=item.system.type}}
                </select>
            </div>
        </div>
    </div>
</div>

<!-- Ranged Attack Panel -->
{{#if item.system.isRangedWeapon}}
<div class="rt-panel">
    <div class="rt-panel__header">
        <h3><i class="fas fa-crosshairs"></i> Ranged Attack</h3>
    </div>
    <div class="rt-panel__content">
        <div class="rt-field-grid rt-field-grid--2">
            <div class="rt-field">
                <label class="rt-field__label">Range (meters)</label>
                <input type="number" class="rt-field__input" 
                       name="system.attack.range.value" 
                       value="{{item.system.attack.range.value}}" 
                       placeholder="30" min="0" />
            </div>
            <div class="rt-field">
                <label class="rt-field__label">Special Range</label>
                <input type="text" class="rt-field__input" 
                       name="system.attack.range.special" 
                       value="{{item.system.attack.range.special}}" 
                       placeholder="SBx3" />
                <span class="rt-field__hint">Leave blank for numeric range</span>
            </div>
        </div>
        
        <div class="rt-field-grid rt-field-grid--3" style="margin-top: 1rem;">
            <div class="rt-field">
                <label class="rt-field__checkbox">
                    <input type="checkbox" name="system.attack.rateOfFire.single" 
                           {{checked item.system.attack.rateOfFire.single}} />
                    <span>Single Shot</span>
                </label>
            </div>
            <div class="rt-field">
                <label class="rt-field__label">Semi-Auto</label>
                <input type="number" class="rt-field__input" 
                       name="system.attack.rateOfFire.semi" 
                       value="{{item.system.attack.rateOfFire.semi}}" 
                       placeholder="0" min="0" />
            </div>
            <div class="rt-field">
                <label class="rt-field__label">Full-Auto</label>
                <input type="number" class="rt-field__input" 
                       name="system.attack.rateOfFire.full" 
                       value="{{item.system.attack.rateOfFire.full}}" 
                       placeholder="0" min="0" />
            </div>
        </div>
    </div>
</div>

<!-- Ammunition Panel -->
<div class="rt-panel">
    <div class="rt-panel__header">
        <h3><i class="fas fa-database"></i> Ammunition</h3>
    </div>
    <div class="rt-panel__content">
        <div class="rt-field-grid rt-field-grid--3">
            <div class="rt-field">
                <label class="rt-field__label">Current</label>
                <input type="number" class="rt-field__input" 
                       name="system.clip.value" 
                       value="{{item.system.clip.value}}" 
                       min="0" />
            </div>
            <div class="rt-field">
                <label class="rt-field__label">Maximum</label>
                <input type="number" class="rt-field__input" 
                       name="system.clip.max" 
                       value="{{item.system.clip.max}}" 
                       min="0" />
            </div>
            <div class="rt-field">
                <label class="rt-field__label">Reload Time</label>
                <select class="rt-field__select" name="system.reload">
                    <option value="-">-</option>
                    <option value="free" {{selected item.system.reload "free"}}>Free Action</option>
                    <option value="half" {{selected item.system.reload "half"}}>Half Action</option>
                    <option value="full" {{selected item.system.reload "full"}}>Full Action</option>
                    <option value="2-full" {{selected item.system.reload "2-full"}}>2 Full Actions</option>
                    <option value="3-full" {{selected item.system.reload "3-full"}}>3 Full Actions</option>
                </select>
            </div>
        </div>
    </div>
</div>
{{/if}}
```

### Phase 4: Compendium Display Enhancement 📚

**Issue**: CompendiumBrowser needs to understand nested weapon data for filtering and display.

**Update**: `src/module/applications/compendium-browser.mjs`

```javascript
// Add weapon-specific column renderers
_renderWeaponColumns(weapon) {
  return {
    damage: weapon.system.damageLabel,
    penetration: weapon.system.damage.penetration,
    range: weapon.system.rangeLabel,
    rof: weapon.system.rateOfFireLabel,
    class: weapon.system.classLabel,
    type: weapon.system.typeLabel
  };
}

// Add weapon filters
_getWeaponFilters() {
  return {
    class: {
      label: 'Weapon Class',
      options: Object.keys(CONFIG.ROGUE_TRADER.weaponClasses)
    },
    type: {
      label: 'Weapon Type',
      options: Object.keys(CONFIG.ROGUE_TRADER.weaponTypes)
    },
    damageType: {
      label: 'Damage Type',
      path: 'system.damage.type',
      options: Object.keys(CONFIG.ROGUE_TRADER.damageTypes)
    }
  };
}
```

### Phase 5: Handlebars Helper Updates 🔧

**Issue**: Legacy helpers expect flat structure.

**Update**: `src/module/handlebars/handlebars-helpers.mjs`

```javascript
// Remove legacy helper (no longer needed)
Handlebars.registerHelper('rateOfFireDisplay', function(rof) {
  // DEPRECATED - use weapon.system.rateOfFireLabel instead
  console.warn('rateOfFireDisplay helper is deprecated');
  return rof?.single ? `S/${rof.semi || '-'}/${rof.full || '-'}` : '-/-/-';
});

// Remove legacy helper (no longer needed)
Handlebars.registerHelper('specialDisplay', function(special) {
  // DEPRECATED - use weapon.system.special directly
  console.warn('specialDisplay helper is deprecated');
  return Array.isArray(special) ? special.join(', ') : (special || '-');
});

// Add new Set display helper
Handlebars.registerHelper('setToArray', function(set) {
  return set ? Array.from(set) : [];
});
```

### Phase 6: Vocalization & Chat Integration 💬

**Enhance**: `src/module/documents/item.mjs` chat properties

```javascript
// Add to RogueTraderItem class
async sendWeaponToChat() {
  const cardData = {
    item: this,
    actor: this.actor,
    weapon: {
      name: this.name,
      class: this.system.classLabel,
      type: this.system.typeLabel,
      damage: this.system.damageLabel,
      damageType: this.system.damageTypeLabel,
      penetration: this.system.damage.penetration,
      range: this.system.rangeLabel,
      rof: this.system.rateOfFireLabel,
      clip: this.system.usesAmmo 
        ? `${this.system.clip.value}/${this.system.clip.max}` 
        : 'N/A',
      reload: this.system.reloadLabel,
      qualities: Array.from(this.system.qualities || []),
      specials: Array.from(this.system.special || [])
    }
  };
  
  const html = await renderTemplate(
    'systems/rogue-trader/templates/chat/weapon-card.hbs', 
    cardData
  );
  
  return ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
    content: html,
    flags: {
      'rogue-trader': {
        itemCard: true,
        itemId: this.id,
        weaponData: cardData.weapon
      }
    }
  });
}
```

**Create**: `templates/chat/weapon-card.hbs`

```handlebars
<div class="rt-chat-card rt-weapon-card">
    <header class="rt-card-header">
        <img src="{{item.img}}" alt="{{weapon.name}}" />
        <div class="rt-card-title">
            <h3>{{weapon.name}}</h3>
            <span class="rt-card-subtitle">{{weapon.class}} {{weapon.type}}</span>
        </div>
    </header>
    
    <div class="rt-card-body">
        <div class="rt-card-stats">
            <div class="rt-stat">
                <span class="rt-stat__label">Damage</span>
                <span class="rt-stat__value rt-stat__value--damage">{{weapon.damage}}</span>
            </div>
            <div class="rt-stat">
                <span class="rt-stat__label">Pen</span>
                <span class="rt-stat__value">{{weapon.penetration}}</span>
            </div>
            <div class="rt-stat">
                <span class="rt-stat__label">Range</span>
                <span class="rt-stat__value">{{weapon.range}}</span>
            </div>
            <div class="rt-stat">
                <span class="rt-stat__label">RoF</span>
                <span class="rt-stat__value">{{weapon.rof}}</span>
            </div>
            {{#if weapon.clip}}
            <div class="rt-stat">
                <span class="rt-stat__label">Clip</span>
                <span class="rt-stat__value">{{weapon.clip}}</span>
            </div>
            <div class="rt-stat">
                <span class="rt-stat__label">Reload</span>
                <span class="rt-stat__value">{{weapon.reload}}</span>
            </div>
            {{/if}}
        </div>
        
        {{#if weapon.qualities.length}}
        <div class="rt-card-section">
            <h4>Qualities</h4>
            <div class="rt-tags">
                {{#each weapon.qualities as |quality|}}
                <span class="rt-tag rt-tag--quality">{{quality}}</span>
                {{/each}}
            </div>
        </div>
        {{/if}}
        
        {{#if weapon.specials.length}}
        <div class="rt-card-section">
            <h4>Special</h4>
            <div class="rt-tags">
                {{#each weapon.specials as |special|}}
                <span class="rt-tag rt-tag--special">{{special}}</span>
                {{/each}}
            </div>
        </div>
        {{/if}}
    </div>
    
    <footer class="rt-card-footer">
        {{#if actor}}
        <button class="rt-btn rt-btn--primary" data-action="weaponAttack" data-item-id="{{item.id}}">
            <i class="fas fa-crosshairs"></i> Attack
        </button>
        {{/if}}
    </footer>
</div>
```

### Phase 7: V2 Application Integration 🚀

**Action Handlers**: Add to BaseActorSheet

```javascript
static DEFAULT_OPTIONS = {
  actions: {
    weaponAttack: BaseActorSheet.#onWeaponAttack,
    weaponReload: BaseActorSheet.#onWeaponReload,
    weaponFire: BaseActorSheet.#onWeaponFire
  }
};

static async #onWeaponAttack(event, target) {
  const itemId = target.dataset.itemId;
  const weapon = this.actor.items.get(itemId);
  if (!weapon || !weapon.isWeapon) return;
  
  // Check ammo
  if (weapon.system.isOutOfAmmo) {
    ui.notifications.warn(`${weapon.name} is out of ammunition!`);
    return;
  }
  
  // Open attack dialog
  const dialog = new WeaponAttackDialog(weapon, this.actor);
  return dialog.render(true);
}

static async #onWeaponReload(event, target) {
  const itemId = target.dataset.itemId;
  const weapon = this.actor.items.get(itemId);
  if (!weapon || !weapon.system.usesAmmo) return;
  
  await weapon.system.reload();
  this._notify(`${weapon.name} reloaded`);
}

static async #onWeaponFire(event, target) {
  const itemId = target.dataset.itemId;
  const shots = parseInt(target.dataset.shots) || 1;
  const weapon = this.actor.items.get(itemId);
  if (!weapon || !weapon.system.usesAmmo) return;
  
  await weapon.system.fire(shots);
  this.render();
}
```

---

## Migration Testing Plan

### Test Cases

1. **Schema Validation**
   - ✅ Parse 100 sample weapons through migration script
   - ✅ Validate all fields match WeaponData schema
   - ✅ Confirm no errors on Foundry load

2. **Display Testing**
   - ✅ Weapon panel shows correct damage, range, RoF
   - ✅ Weapon sheet displays all fields properly
   - ✅ Compendium browser filters work
   - ✅ Chat cards render correctly

3. **Functional Testing**
   - ✅ Weapon attacks roll correctly
   - ✅ Ammo consumption works
   - ✅ Reload action functions
   - ✅ Drag/drop weapons to actors
   - ✅ Edit weapon properties persist

4. **Edge Cases**
   - ✅ Special ranges (SBx3) parse correctly
   - ✅ Exotic RoF formats handle gracefully
   - ✅ Missing/null fields default properly
   - ✅ Legacy weapons migrate on first load

---

## Rollout Strategy

### Step 1: Backup 🔐
```bash
cp -r src/packs/rt-items-weapons src/packs/rt-items-weapons.backup
```

### Step 2: Run Migration 🔧
```bash
node scripts/migrate-weapon-packs.mjs
```

### Step 3: Rebuild 🏗️
```bash
npm run build
```

### Step 4: Test in Foundry ✅
- Load system
- Check console for errors
- Open compendium browser
- Drag weapon to actor
- Test attack rolls

### Step 5: Commit 📝
```bash
git add src/packs/rt-items-weapons
git commit -m "Migrate weapon packs to V13 schema

- Transform 1093 weapons from legacy flat structure to nested V13 DataModel
- Update all templates to use computed properties
- Add weapon-specific action handlers
- Enhance chat card display
"
```

---

## Future Enhancements

### Quality System Integration
- Weapon Qualities compendium pack (Accurate, Balanced, Tearing, etc.)
- Quality effects as Active Effects
- Drag/drop qualities onto weapons

### Modification System
- Weapon Modifications compendium (scopes, suppressors, etc.)
- Modification effects stack with base weapon
- Visual indicators for modified weapons

### Ammunition Types
- Ammunition compendium (man-stopper, tox, etc.)
- Load different ammo types (changes damage/pen)
- Track ammo inventory separately

### Advanced Attack Dialog
- Range modifiers (Point Blank, Long Range, Extreme)
- Aim action bonuses
- Called shots (hit location selection)
- Burst/Full-Auto hit distribution

---

## Summary

**Current State**: 1093 weapon pack entries incompatible with V13 DataModel, causing display issues throughout system.

**Solution**: Comprehensive migration script + template updates + V2 integration.

**Effort**: ~8 hours
- Script creation: 2 hours
- Template updates: 2 hours
- Testing: 2 hours
- Documentation: 1 hour
- Iteration/polish: 1 hour

**Impact**: ✨ Fully functional weapon system with modern V13 architecture, clean displays, proper typing, and excellent UX.
