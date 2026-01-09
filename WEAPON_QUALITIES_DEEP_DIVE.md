# Weapon Qualities/Customizations - Deep Dive & Refactor Plan

## Executive Summary

The weapon quality system is **completely broken** due to critical misalignments between:
1. **Pack Data Structure** - Legacy numeric/string "effect" field storing page numbers instead of actual data
2. **DataModel Schema** - Modern WeaponQualityData expecting identifier, hasLevel, level, effect (HTML), notes
3. **Display Logic** - System expects embedded AttackSpecial items on weapons, not string identifiers
4. **CONFIG Integration** - No centralized quality definitions exist in CONFIG for lookup/localization

**Result**: `[object Object]` displays everywhere, qualities show as "213" or page numbers, no actual effect text visible.

---

## 🔍 Current State Analysis

### 1. Pack Data Structure (Legacy Format)

**109 Weapon Quality Items** in `rt-items-weapon-qualities/_source/`

**Current Schema** (Completely Wrong):
```json
{
  "name": "Tearing",
  "type": "weaponQuality",
  "system": {
    "effect": 213,                    // ❌ PAGE NUMBER, not effect text!
    "description": {
      "value": "<p>213</p>"          // ❌ Page number repeated
    },
    "rating": 0,                     // ❌ Legacy field, unused
    "modifiers": {                    // ❌ Flat modifiers, should be structured
      "damage": 0,
      "penetration": 0,
      "toHit": 0,
      "range": 0
    },
    "specialEffect": ""              // ❌ Empty string
  }
}
```

**Data Quality Issues**:
- **88 items** (81%) have integer `effect` values (page numbers from rulebook: 3, 60, 117, 151, 167, 213, etc.)
- **21 items** (19%) have string `effect` values (actual descriptive text)
- **ALL items** missing proper `identifier` field (needed for lookups)
- **ALL items** missing proper `hasLevel`/`level` implementation
- **Description field** just repeats the page number
- **Modifiers** are flat numbers, not integrated into system

**Example Breakdown**:

| Quality Name | effect Type | effect Value | Status |
|-------------|-------------|--------------|--------|
| Tearing | `int` | `213` | ❌ Page number |
| Accurate | `int` | `117` | ❌ Page number |
| Blast (X) | `str` | "Weapon hit creates Area of Effect..." | ⚠️ Has text but no identifier |
| Crippling (X) | `str` | "If target suffers at least 1 Wound..." | ⚠️ Has text but wrong level handling |

---

### 2. DataModel Schema (Modern V13 Format)

**WeaponQualityData** (`src/module/data/item/weapon-quality.mjs`) expects:

```javascript
class WeaponQualityData {
  static defineSchema() {
    return {
      identifier: IdentifierField,        // ✅ Required for lookups
      hasLevel: BooleanField,              // ✅ Does this quality have rating/level?
      level: NumberField,                  // ✅ The level value (X in "Blast (X)")
      effect: HTMLField,                   // ✅ Rich text effect description
      notes: StringField                   // ✅ Additional notes
    };
  }
  
  get fullName() {
    // "Blast (3)" if hasLevel=true, level=3
    return this.hasLevel && this.level !== null 
      ? `${this.parent.name} (${this.level})`
      : this.parent.name;
  }
}
```

**Misalignments**:
1. Pack data has no `identifier` → Lookups fail
2. Pack data `effect` is `int|string`, not `HTMLField` → Type mismatch
3. Pack data `hasLevel` never set → Can't distinguish "Blast" from "Blast (X)"
4. Pack data `level` never set → No way to store the "(X)" value
5. Pack data `notes` doesn't exist → Lost attribution data

---

### 3. How Qualities Are Used (Weapons)

**In Weapons Pack Data** (after migration):
```json
{
  "name": "Bolt Pistol",
  "system": {
    "special": ["tearing", "reliable"]   // ✅ Array of identifier strings
  }
}
```

**In DamageTemplate Mixin**:
```javascript
class DamageTemplate {
  special: SetField(StringField)  // ✅ Set of identifier strings
  
  hasSpecial(quality) {
    return this.special?.has(quality.toLowerCase());
  }
}
```

**Problem**: Weapons store identifiers (`"tearing"`, `"blast-3"`), but:
- No CONFIG mapping exists from identifier → quality definition
- Can't look up quality effect text
- Can't look up quality modifiers
- Can't display localized quality names
- Template shows raw identifiers or tries to fetch items (fails)

---

### 4. Display in Templates

**Weapon Sheet** (`item-weapon-sheet-modern.hbs` lines 262-283):
```handlebars
<div class="rt-tags">
  {{#each item.items as |embedded|}}
  {{#if embedded.isAttackSpecial}}
  <span class="rt-tag rt-tag--special">
    {{embedded.name}}                           <!-- Expects embedded items -->
    {{#if embedded.system.level}}({{embedded.system.level}}){{/if}}
    <i class="fas fa-times item-delete" data-item-id="{{embedded.id}}"></i>
  </span>
  {{/if}}
  {{/each}}
</div>
```

**Current System**:
- Expects weapon to have **embedded AttackSpecial items** as children
- User must manually drag qualities from compendium onto weapon
- Qualities stored as full Item documents in weapon's `items` collection
- Works for user-added qualities but not for built-in weapon qualities

**Problem**:
- Built-in weapon qualities (from pack data `special` array) are **identifiers only**
- Template can't display them because they're not embedded items
- No way to look up quality definitions from identifiers
- Can't show effect text, modifiers, or rich tooltips

---

## 🎯 Root Causes

### Cause 1: Legacy Data Import
Pack data appears to be imported from original compendium where:
- `effect` field stored **page reference numbers** for manual rulebook lookup
- Actual effect text was in printed rulebooks, not database
- System expected humans to read page 213 to understand "Tearing"

### Cause 2: Missing CONFIG Definitions
Unlike damage types, weapon classes, availabilities, etc., there is **no** `CONFIG.ROGUE_TRADER.weaponQualities` object:

```javascript
// These exist and work:
CONFIG.ROGUE_TRADER.damageTypes = { impact: {label, abbr}, ... }
CONFIG.ROGUE_TRADER.weaponClasses = { melee: {label}, ... }
CONFIG.ROGUE_TRADER.availabilities = { rare: {label, modifier}, ... }

// This is MISSING:
CONFIG.ROGUE_TRADER.weaponQualities = undefined  // ❌ DOES NOT EXIST
```

Without CONFIG definitions:
- Can't look up quality from identifier
- Can't display localized labels
- Can't access effect descriptions
- Can't show modifiers or mechanical effects

### Cause 3: Dual Quality Systems
System has **two incompatible approaches**:

**Approach A** (Built-in Qualities):
- Weapon has `special: ["tearing", "reliable"]` array
- Identifiers only, no embedded items
- Fast, compact, good for pack data
- **But**: Can't look up definitions, no display support

**Approach B** (User-Added Qualities):
- User drags AttackSpecial item from compendium onto weapon
- Full Item document embedded in weapon
- Rich data available (name, effect, level, modifiers)
- **But**: Slow, bloated, duplicates data, hard to manage

**Neither approach works properly** because:
- Approach A has no lookup mechanism
- Approach B doesn't sync with `special` array
- Template tries to use Approach B for everything
- Pack data uses Approach A
- Result: `[object Object]` everywhere

---

## 📋 Comprehensive Solution Plan

### Phase 1: Pack Data Migration

**Goal**: Transform 109 quality items from legacy page numbers to proper V13 schema.

**Migration Script** (`scripts/migrate-weapon-qualities-pack.mjs`):

```javascript
// 1. IDENTIFIER GENERATION
function generateIdentifier(name) {
  // "Blast (X)" → "blast-x"
  // "Tearing" → "tearing"
  // "SM Wep" → "sm-wep"
  return name
    .toLowerCase()
    .replace(/\s*\([^)]+\)\s*/g, '')  // Remove (X) suffixes
    .replace(/[*]/g, '')                // Remove asterisks
    .replace(/\s+/g, '-')               // Spaces to dashes
    .replace(/[^a-z0-9-]/g, '');        // Remove special chars
}

// 2. LEVEL DETECTION
function detectLevel(name) {
  // "Blast (X)" → hasLevel=true, level=null (variable)
  // "Blast (3)" → hasLevel=true, level=3
  // "Tearing" → hasLevel=false, level=null
  
  const variableLevelMatch = name.match(/\(X\)$/i);
  if (variableLevelMatch) {
    return { hasLevel: true, level: null };
  }
  
  const fixedLevelMatch = name.match(/\((\d+)\)$/);
  if (fixedLevelMatch) {
    return { hasLevel: true, level: parseInt(fixedLevelMatch[1]) };
  }
  
  return { hasLevel: false, level: null };
}

// 3. EFFECT TEXT HANDLING
function migrateEffect(currentEffect, name, rulebookData) {
  if (typeof currentEffect === 'string' && currentEffect.length > 20) {
    // Already has descriptive text, keep it
    return `<p>${currentEffect}</p>`;
  }
  
  // Effect is page number - look up actual text
  const identifier = generateIdentifier(name);
  const definitionText = QUALITY_DEFINITIONS[identifier];
  
  if (definitionText) {
    return `<p>${definitionText}</p>`;
  }
  
  // Fallback: indicate missing definition
  return `<p><em>Effect definition pending (see rulebook page ${currentEffect})</em></p>`;
}

// 4. MODIFIERS MIGRATION
function migrateModifiers(legacyModifiers, name) {
  // Some qualities have mechanical modifiers that should be preserved
  // But these need to be properly structured
  
  const result = {
    damage: legacyModifiers?.damage ?? 0,
    penetration: legacyModifiers?.penetration ?? 0,
    toHit: legacyModifiers?.toHit ?? 0,
    range: legacyModifiers?.range ?? 0
  };
  
  // Clean up - if all zeros, we may want to indicate "see effect text"
  const hasAnyModifier = Object.values(result).some(v => v !== 0);
  
  return hasAnyModifier ? result : null;
}

// 5. FULL MIGRATION
async function migrateQualityItem(filepath) {
  const data = JSON.parse(await fs.readFile(filepath, 'utf-8'));
  
  const { hasLevel, level } = detectLevel(data.name);
  const identifier = generateIdentifier(data.name);
  const effect = migrateEffect(data.system.effect, data.name);
  const modifiers = migrateModifiers(data.system.modifiers, data.name);
  
  const migratedSystem = {
    identifier,
    hasLevel,
    level,
    effect,                           // HTML field with actual effect text
    notes: data.system.notes || "",
    // Remove legacy fields
    // rating: DELETED
    // specialEffect: DELETED
    // modifiers: Can be preserved in notes or deleted if not used
  };
  
  // Preserve description but update it
  if (data.system.description) {
    migratedSystem.description = {
      value: effect  // Use same HTML as effect for now
    };
  }
  
  return {
    ...data,
    system: migratedSystem
  };
}
```

**Quality Definitions Source** (Manual curation needed):
```javascript
// This data must be manually extracted from Rogue Trader rulebooks
const QUALITY_DEFINITIONS = {
  'tearing': 'The weapon is designed to rip and tear through flesh. The attacker may re-roll any dice in the damage roll that score a 1 or 2, but must accept the second result.',
  
  'reliable': 'This weapon is very well made and rarely jams or fails. The weapon never jams on a roll of 94 or less.',
  
  'blast': 'When a weapon with this Quality hits a target, it affects a large area. Any creature within the blast radius (measured from the point of impact) must make an Agility Test or suffer a hit from the weapon.',
  
  'blast-x': 'When a weapon with this Quality hits a target, it affects an area with a radius of X metres. Any creature within this area must make an Agility Test or suffer a hit from the weapon.',
  
  'accurate': 'Accurate weapons are easier to fire at a single target. The attacker may take a Half Action to Aim before making an attack with this weapon, gaining a +10 bonus to the attack.',
  
  // ... 104 more definitions needed
};
```

**Migration Statistics** (Estimated):
- 109 quality items total
- 88 items need effect text lookup (currently page numbers)
- 21 items have text, need identifier/level extraction
- ~30 items need `hasLevel: true` detection ("Blast (X)", "Crippling (X)", etc.)
- ~10 items have fixed levels ("Blast (3)", "Crippling (2)")

---

### Phase 2: DataModel Enhancement

**Goal**: Ensure WeaponQualityData can handle all quality types and provide rich getters.

**File**: `src/module/data/item/weapon-quality.mjs`

**Changes Needed**:

```javascript
export default class WeaponQualityData extends ItemDataModel.mixin(DescriptionTemplate) {
  
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: false }),  // ✅ Now required
      
      hasLevel: new fields.BooleanField({ required: true, initial: false }),
      level: new fields.NumberField({ required: false, initial: null, min: 0, integer: true }),
      
      effect: new fields.HTMLField({ required: true, blank: false }),  // ✅ Now required
      
      notes: new fields.StringField({ required: false, blank: true }),
      
      // NEW: Mechanical modifiers (optional)
      modifiers: new fields.SchemaField({
        damage: new fields.NumberField({ required: true, initial: 0, integer: true }),
        penetration: new fields.NumberField({ required: true, initial: 0, integer: true }),
        toHit: new fields.NumberField({ required: true, initial: 0, integer: true }),
        range: new fields.NumberField({ required: true, initial: 0, integer: true })
      }, { required: false })
    };
  }

  /**
   * Migration from legacy pack data.
   */
  static migrateData(source) {
    // Handle legacy "rating" field (delete it)
    if ('rating' in source) {
      delete source.rating;
    }
    
    // Handle legacy "specialEffect" field (delete it)
    if ('specialEffect' in source) {
      delete source.specialEffect;
    }
    
    // Handle legacy integer/page number "effect" field
    if (typeof source.effect === 'number') {
      source.effect = `<p><em>See rulebook page ${source.effect}</em></p>`;
    }
    
    // Ensure identifier exists
    if (!source.identifier) {
      // Generate from name
      source.identifier = this.generateIdentifier(source.name || 'unknown');
    }
    
    // Detect hasLevel/level from name if not set
    if (source.hasLevel === undefined && source.name) {
      const levelInfo = this.detectLevel(source.name);
      source.hasLevel = levelInfo.hasLevel;
      source.level = levelInfo.level;
    }
    
    return super.migrateData(source);
  }
  
  static generateIdentifier(name) {
    return name
      .toLowerCase()
      .replace(/\s*\([^)]+\)\s*/g, '')
      .replace(/[*]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }
  
  static detectLevel(name) {
    const variableLevelMatch = name.match(/\(X\)$/i);
    if (variableLevelMatch) {
      return { hasLevel: true, level: null };
    }
    
    const fixedLevelMatch = name.match(/\((\d+)\)$/);
    if (fixedLevelMatch) {
      return { hasLevel: true, level: parseInt(fixedLevelMatch[1]) };
    }
    
    return { hasLevel: false, level: null };
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  get fullName() {
    let name = this.parent?.name ?? "";
    if (this.hasLevel && this.level !== null) {
      name += ` (${this.level})`;
    } else if (this.hasLevel) {
      name += ` (X)`;
    }
    return name;
  }
  
  /**
   * Get short identifier with level suffix.
   * @type {string}
   * @example "blast-3", "tearing", "crippling-x"
   */
  get fullIdentifier() {
    if (this.hasLevel && this.level !== null) {
      return `${this.identifier}-${this.level}`;
    } else if (this.hasLevel) {
      return `${this.identifier}-x`;
    }
    return this.identifier;
  }
  
  /**
   * Check if quality has any non-zero modifiers.
   * @type {boolean}
   */
  get hasModifiers() {
    if (!this.modifiers) return false;
    return Object.values(this.modifiers).some(v => v !== 0);
  }
  
  /**
   * Get modifier summary string.
   * @type {string}
   */
  get modifiersSummary() {
    if (!this.hasModifiers) return "";
    
    const parts = [];
    const m = this.modifiers;
    
    if (m.damage !== 0) parts.push(`Dmg ${m.damage > 0 ? '+' : ''}${m.damage}`);
    if (m.penetration !== 0) parts.push(`Pen ${m.penetration > 0 ? '+' : ''}${m.penetration}`);
    if (m.toHit !== 0) parts.push(`Hit ${m.toHit > 0 ? '+' : ''}${m.toHit}`);
    if (m.range !== 0) parts.push(`Rng ${m.range > 0 ? '+' : ''}${m.range}m`);
    
    return parts.join(', ');
  }

  /* -------------------------------------------- */
  /*  Chat Properties                             */
  /* -------------------------------------------- */

  get chatProperties() {
    const props = [];
    if (this.hasLevel) {
      if (this.level !== null) {
        props.push(`Level: ${this.level}`);
      } else {
        props.push(`Variable Level (X)`);
      }
    }
    if (this.hasModifiers) {
      props.push(this.modifiersSummary);
    }
    return props;
  }

  /* -------------------------------------------- */
  /*  Header Labels                               */
  /* -------------------------------------------- */

  get headerLabels() {
    const labels = [];
    if (this.hasLevel) {
      const value = this.level !== null ? this.level : 'X';
      labels.push({ label: value.toString(), icon: "fa-layer-group" });
    }
    return labels;
  }
}
```

---

### Phase 3: CONFIG Integration

**Goal**: Create centralized quality definitions for lookup, similar to damage types and weapon classes.

**File**: `src/module/config.mjs`

**Add New Section**:

```javascript
/* -------------------------------------------- */
/*  Weapon Qualities                            */
/* -------------------------------------------- */

/**
 * Weapon qualities (special properties).
 * @type {Object<string, {label: string, description: string, hasLevel: boolean}>}
 */
ROGUE_TRADER.weaponQualities = {
  'accurate': {
    label: "RT.WeaponQuality.Accurate",
    description: "RT.WeaponQuality.AccurateDesc",
    hasLevel: false
  },
  
  'balanced': {
    label: "RT.WeaponQuality.Balanced",
    description: "RT.WeaponQuality.BalancedDesc",
    hasLevel: false
  },
  
  'blast': {
    label: "RT.WeaponQuality.Blast",
    description: "RT.WeaponQuality.BlastDesc",
    hasLevel: true,  // Blast (X)
    unit: "metres"
  },
  
  'bolt': {
    label: "RT.WeaponQuality.Bolt",
    description: "RT.WeaponQuality.BoltDesc",
    hasLevel: false
  },
  
  'chain': {
    label: "RT.WeaponQuality.Chain",
    description: "RT.WeaponQuality.ChainDesc",
    hasLevel: false
  },
  
  'concussive': {
    label: "RT.WeaponQuality.Concussive",
    description: "RT.WeaponQuality.ConcussiveDesc",
    hasLevel: true   // Concussive (X)
  },
  
  'crippling': {
    label: "RT.WeaponQuality.Crippling",
    description: "RT.WeaponQuality.CripplingDesc",
    hasLevel: true   // Crippling (X)
  },
  
  'corrosive': {
    label: "RT.WeaponQuality.Corrosive",
    description: "RT.WeaponQuality.CorrosiveDesc",
    hasLevel: false
  },
  
  'daemon-wep': {
    label: "RT.WeaponQuality.DaemonWep",
    description: "RT.WeaponQuality.DaemonWepDesc",
    hasLevel: false
  },
  
  'daemonbane': {
    label: "RT.WeaponQuality.Daemonbane",
    description: "RT.WeaponQuality.DaemonbaneDesc",
    hasLevel: false
  },
  
  'decay': {
    label: "RT.WeaponQuality.Decay",
    description: "RT.WeaponQuality.DecayDesc",
    hasLevel: true   // Decay (X)
  },
  
  'defensive': {
    label: "RT.WeaponQuality.Defensive",
    description: "RT.WeaponQuality.DefensiveDesc",
    hasLevel: false
  },
  
  'devastating': {
    label: "RT.WeaponQuality.Devastating",
    description: "RT.WeaponQuality.DevastatingDesc",
    hasLevel: true   // Devastating (X)
  },
  
  'fast': {
    label: "RT.WeaponQuality.Fast",
    description: "RT.WeaponQuality.FastDesc",
    hasLevel: false
  },
  
  'felling': {
    label: "RT.WeaponQuality.Felling",
    description: "RT.WeaponQuality.FellingDesc",
    hasLevel: true   // Felling (X)
  },
  
  'flame': {
    label: "RT.WeaponQuality.Flame",
    description: "RT.WeaponQuality.FlameDesc",
    hasLevel: false
  },
  
  'flexible': {
    label: "RT.WeaponQuality.Flexible",
    description: "RT.WeaponQuality.FlexibleDesc",
    hasLevel: false
  },
  
  'force': {
    label: "RT.WeaponQuality.Force",
    description: "RT.WeaponQuality.ForceDesc",
    hasLevel: false
  },
  
  'gauss': {
    label: "RT.WeaponQuality.Gauss",
    description: "RT.WeaponQuality.GaussDesc",
    hasLevel: false
  },
  
  'graviton': {
    label: "RT.WeaponQuality.Graviton",
    description: "RT.WeaponQuality.GravitonDesc",
    hasLevel: false
  },
  
  'grenade': {
    label: "RT.WeaponQuality.Grenade",
    description: "RT.WeaponQuality.GrenadeDesc",
    hasLevel: false
  },
  
  'gyro-stabilised': {
    label: "RT.WeaponQuality.GyroStabilised",
    description: "RT.WeaponQuality.GyroStabilisedDesc",
    hasLevel: false
  },
  
  'hallucinogenic': {
    label: "RT.WeaponQuality.Hallucinogenic",
    description: "RT.WeaponQuality.HallucinogenicDesc",
    hasLevel: true   // Hallucinogenic (X)
  },
  
  'haywire': {
    label: "RT.WeaponQuality.Haywire",
    description: "RT.WeaponQuality.HaywireDesc",
    hasLevel: true   // Haywire (X)
  },
  
  'inaccurate': {
    label: "RT.WeaponQuality.Inaccurate",
    description: "RT.WeaponQuality.InaccurateDesc",
    hasLevel: false
  },
  
  'indirect': {
    label: "RT.WeaponQuality.Indirect",
    description: "RT.WeaponQuality.IndirectDesc",
    hasLevel: true   // Indirect (X)
  },
  
  'integrated-weapon': {
    label: "RT.WeaponQuality.IntegratedWeapon",
    description: "RT.WeaponQuality.IntegratedWeaponDesc",
    hasLevel: false
  },
  
  'irradiated': {
    label: "RT.WeaponQuality.Irradiated",
    description: "RT.WeaponQuality.IrradiatedDesc",
    hasLevel: true   // Irradiated (X)
  },
  
  'lance': {
    label: "RT.WeaponQuality.Lance",
    description: "RT.WeaponQuality.LanceDesc",
    hasLevel: false
  },
  
  'las': {
    label: "RT.WeaponQuality.Las",
    description: "RT.WeaponQuality.LasDesc",
    hasLevel: false
  },
  
  'launcher': {
    label: "RT.WeaponQuality.Launcher",
    description: "RT.WeaponQuality.LauncherDesc",
    hasLevel: false
  },
  
  'living-ammunition': {
    label: "RT.WeaponQuality.LivingAmmunition",
    description: "RT.WeaponQuality.LivingAmmunitionDesc",
    hasLevel: false
  },
  
  'maximal': {
    label: "RT.WeaponQuality.Maximal",
    description: "RT.WeaponQuality.MaximalDesc",
    hasLevel: false
  },
  
  'melta': {
    label: "RT.WeaponQuality.Melta",
    description: "RT.WeaponQuality.MeltaDesc",
    hasLevel: false
  },
  
  'necron-wep': {
    label: "RT.WeaponQuality.NecronWep",
    description: "RT.WeaponQuality.NecronWepDesc",
    hasLevel: false
  },
  
  'ogryn-proof': {
    label: "RT.WeaponQuality.OgrynProof",
    description: "RT.WeaponQuality.OgrynProofDesc",
    hasLevel: false
  },
  
  'overcharge': {
    label: "RT.WeaponQuality.Overcharge",
    description: "RT.WeaponQuality.OverchargeDesc",
    hasLevel: true   // Overcharge (X)
  },
  
  'overheats': {
    label: "RT.WeaponQuality.Overheats",
    description: "RT.WeaponQuality.OverheatsDesc",
    hasLevel: false
  },
  
  'plasma': {
    label: "RT.WeaponQuality.Plasma",
    description: "RT.WeaponQuality.PlasmaDesc",
    hasLevel: false
  },
  
  'power': {
    label: "RT.WeaponQuality.Power",
    description: "RT.WeaponQuality.PowerDesc",
    hasLevel: false
  },
  
  'power-field': {
    label: "RT.WeaponQuality.PowerField",
    description: "RT.WeaponQuality.PowerFieldDesc",
    hasLevel: false
  },
  
  'primitive': {
    label: "RT.WeaponQuality.Primitive",
    description: "RT.WeaponQuality.PrimitiveDesc",
    hasLevel: true   // Primitive (X)
  },
  
  'proven': {
    label: "RT.WeaponQuality.Proven",
    description: "RT.WeaponQuality.ProvenDesc",
    hasLevel: true   // Proven (X)
  },
  
  'razor-sharp': {
    label: "RT.WeaponQuality.RazorSharp",
    description: "RT.WeaponQuality.RazorSharpDesc",
    hasLevel: false
  },
  
  'reactive': {
    label: "RT.WeaponQuality.Reactive",
    description: "RT.WeaponQuality.ReactiveDesc",
    hasLevel: false
  },
  
  'recharge': {
    label: "RT.WeaponQuality.Recharge",
    description: "RT.WeaponQuality.RechargeDesc",
    hasLevel: false
  },
  
  'reliable': {
    label: "RT.WeaponQuality.Reliable",
    description: "RT.WeaponQuality.ReliableDesc",
    hasLevel: false
  },
  
  'rune-wep': {
    label: "RT.WeaponQuality.RuneWep",
    description: "RT.WeaponQuality.RuneWepDesc",
    hasLevel: false
  },
  
  'sanctified': {
    label: "RT.WeaponQuality.Sanctified",
    description: "RT.WeaponQuality.SanctifiedDesc",
    hasLevel: false
  },
  
  'scatter': {
    label: "RT.WeaponQuality.Scatter",
    description: "RT.WeaponQuality.ScatterDesc",
    hasLevel: false
  },
  
  'shock': {
    label: "RT.WeaponQuality.Shock",
    description: "RT.WeaponQuality.ShockDesc",
    hasLevel: false
  },
  
  'shocking': {
    label: "RT.WeaponQuality.Shocking",
    description: "RT.WeaponQuality.ShockingDesc",
    hasLevel: false
  },
  
  'sm-wep': {
    label: "RT.WeaponQuality.SMWep",
    description: "RT.WeaponQuality.SMWepDesc",
    hasLevel: false
  },
  
  'smoke': {
    label: "RT.WeaponQuality.Smoke",
    description: "RT.WeaponQuality.SmokeDesc",
    hasLevel: true   // Smoke (X)
  },
  
  'snare': {
    label: "RT.WeaponQuality.Snare",
    description: "RT.WeaponQuality.SnareDesc",
    hasLevel: true   // Snare (X)
  },
  
  'sp': {
    label: "RT.WeaponQuality.SP",
    description: "RT.WeaponQuality.SPDesc",
    hasLevel: false
  },
  
  'spray': {
    label: "RT.WeaponQuality.Spray",
    description: "RT.WeaponQuality.SprayDesc",
    hasLevel: false
  },
  
  'storm': {
    label: "RT.WeaponQuality.Storm",
    description: "RT.WeaponQuality.StormDesc",
    hasLevel: false
  },
  
  'tainted': {
    label: "RT.WeaponQuality.Tainted",
    description: "RT.WeaponQuality.TaintedDesc",
    hasLevel: false
  },
  
  'tearing': {
    label: "RT.WeaponQuality.Tearing",
    description: "RT.WeaponQuality.TearingDesc",
    hasLevel: false
  },
  
  'toxic': {
    label: "RT.WeaponQuality.Toxic",
    description: "RT.WeaponQuality.ToxicDesc",
    hasLevel: true   // Toxic (X)
  },
  
  'twin-linked': {
    label: "RT.WeaponQuality.TwinLinked",
    description: "RT.WeaponQuality.TwinLinkedDesc",
    hasLevel: false
  },
  
  'unbalanced': {
    label: "RT.WeaponQuality.Unbalanced",
    description: "RT.WeaponQuality.UnbalancedDesc",
    hasLevel: false
  },
  
  'unreliable': {
    label: "RT.WeaponQuality.Unreliable",
    description: "RT.WeaponQuality.UnreliableDesc",
    hasLevel: false
  },
  
  'unstable': {
    label: "RT.WeaponQuality.Unstable",
    description: "RT.WeaponQuality.UnstableDesc",
    hasLevel: false
  },
  
  'unwieldy': {
    label: "RT.WeaponQuality.Unwieldy",
    description: "RT.WeaponQuality.UnwieldyDesc",
    hasLevel: false
  },
  
  'vengeful': {
    label: "RT.WeaponQuality.Vengeful",
    description: "RT.WeaponQuality.VengefulDesc",
    hasLevel: true   // Vengeful (X)
  },
  
  'warp-weapon': {
    label: "RT.WeaponQuality.WarpWeapon",
    description: "RT.WeaponQuality.WarpWeaponDesc",
    hasLevel: false
  },
  
  'witch-edge': {
    label: "RT.WeaponQuality.WitchEdge",
    description: "RT.WeaponQuality.WitchEdgeDesc",
    hasLevel: false
  }
};

/**
 * Get quality definition from identifier.
 * @param {string} identifier    Quality identifier (e.g., "tearing", "blast-3")
 * @returns {object|null}        Quality definition or null
 */
ROGUE_TRADER.getQualityDefinition = function(identifier) {
  // Strip level suffix if present
  const baseId = identifier.replace(/-\d+$/, '').replace(/-x$/, '');
  return this.weaponQualities[baseId] ?? null;
};

/**
 * Get localized quality label.
 * @param {string} identifier    Quality identifier
 * @param {number} [level]       Optional level for qualities with (X)
 * @returns {string}             Localized label
 */
ROGUE_TRADER.getQualityLabel = function(identifier, level = null) {
  const def = this.getQualityDefinition(identifier);
  if (!def) return identifier;
  
  let label = game.i18n.localize(def.label);
  if (def.hasLevel && level !== null) {
    label += ` (${level})`;
  } else if (def.hasLevel) {
    label += ` (X)`;
  }
  
  return label;
};

/**
 * Get localized quality description.
 * @param {string} identifier    Quality identifier
 * @returns {string}             Localized description
 */
ROGUE_TRADER.getQualityDescription = function(identifier) {
  const def = this.getQualityDefinition(identifier);
  if (!def) return "";
  
  return game.i18n.localize(def.description);
};
```

**Benefits**:
- Centralized quality definitions
- Localization support via i18n keys
- Easy lookup from identifier
- Type safety (know which qualities have levels)
- Consistent with existing CONFIG patterns

---

### Phase 4: Template Updates

**Goal**: Fix weapon sheet to display both built-in and user-added qualities properly.

**File**: `src/templates/item/item-weapon-sheet-modern.hbs`

**Current Qualities Tab** (Lines 262-283):
```handlebars
<div class="tab" data-tab="qualities" data-group="primary">
  <div class="rt-panel">
    <div class="rt-panel__header">
      <h3><i class="fas fa-star"></i> Weapon Qualities</h3>
      <div class="rt-panel__actions">
        <button type="button" class="rt-btn rt-btn--primary add-quality">
          <i class="fas fa-plus"></i> Add Quality
        </button>
      </div>
    </div>
    <div class="rt-panel__content">
      <div class="rt-tags">
        {{#each item.items as |embedded|}}
        {{#if embedded.isAttackSpecial}}
        <span class="rt-tag rt-tag--special" data-item-id="{{embedded.id}}">
          {{embedded.name}}
          {{#if embedded.system.level}}({{embedded.system.level}}){{/if}}
          <i class="fas fa-times item-delete" data-item-id="{{embedded.id}}"></i>
        </span>
        {{/if}}
        {{/each}}
      </div>
    </div>
  </div>
</div>
```

**New Qualities Tab** (Unified Approach):
```handlebars
<div class="tab" data-tab="qualities" data-group="primary">
  <div class="rt-panel">
    <div class="rt-panel__header">
      <h3><i class="fas fa-star"></i> Weapon Qualities</h3>
      <div class="rt-panel__actions">
        <button type="button" class="rt-btn rt-btn--primary" data-action="addQuality">
          <i class="fas fa-plus"></i> Add Quality
        </button>
      </div>
    </div>
    <div class="rt-panel__content">
      
      {{!-- Built-in Qualities (from special array) --}}
      {{#if item.system.special.size}}
      <h4 class="rt-section-header">Built-in Qualities</h4>
      <div class="rt-tags rt-tags--qualities">
        {{#each (specialQualities item.system.special) as |quality|}}
        <span class="rt-tag rt-tag--quality {{#if quality.hasLevel}}rt-tag--leveled{{/if}}" 
              data-quality-id="{{quality.identifier}}"
              data-tooltip="{{quality.description}}">
          <i class="fas fa-star"></i>
          <span class="rt-tag__label">{{quality.label}}</span>
          {{#if quality.level}}
          <span class="rt-tag__badge">{{quality.level}}</span>
          {{/if}}
          <button type="button" class="rt-tag__remove" 
                  data-action="removeSpecial" 
                  data-quality-id="{{quality.identifier}}"
                  title="Remove Quality">
            <i class="fas fa-times"></i>
          </button>
        </span>
        {{/each}}
      </div>
      {{else}}
      <p class="rt-empty-state">
        <i class="fas fa-info-circle"></i>
        No built-in qualities. Add qualities from the compendium or use the "Add Quality" button.
      </p>
      {{/if}}
      
      {{!-- User-Added Qualities (embedded AttackSpecial items) --}}
      {{#if (hasEmbeddedQualitiesweapon item.items)}}
      <h4 class="rt-section-header" style="margin-top: 1rem;">Custom Qualities</h4>
      <div class="rt-quality-list">
        {{#each item.items as |embedded|}}
        {{#if embedded.isAttackSpecial}}
        <div class="rt-quality-card">
          <div class="rt-quality-card__header">
            <h5 class="rt-quality-card__name">
              <i class="fas fa-sparkles"></i>
              {{embedded.name}}
              {{#if embedded.system.level}}
              <span class="rt-badge rt-badge--level">{{embedded.system.level}}</span>
              {{/if}}
            </h5>
            <div class="rt-quality-card__actions">
              <button type="button" class="rt-btn rt-btn--icon-only" 
                      data-action="itemEdit" 
                      data-item-id="{{embedded.id}}"
                      title="Edit Quality">
                <i class="fas fa-edit"></i>
              </button>
              <button type="button" class="rt-btn rt-btn--icon-only rt-btn--danger" 
                      data-action="itemDelete" 
                      data-item-id="{{embedded.id}}"
                      title="Remove Quality">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
          <div class="rt-quality-card__body">
            {{{embedded.system.effect}}}
          </div>
          {{#if embedded.system.hasModifiers}}
          <div class="rt-quality-card__modifiers">
            <i class="fas fa-calculator"></i>
            <span>{{embedded.system.modifiersSummary}}</span>
          </div>
          {{/if}}
        </div>
        {{/if}}
        {{/each}}
      </div>
      {{/if}}
      
    </div>
  </div>
  
  {{!-- Weapon Modifications Panel (unchanged) --}}
  <div class="rt-panel">
    <div class="rt-panel__header">
      <h3><i class="fas fa-wrench"></i> Weapon Modifications</h3>
      <div class="rt-panel__actions">
        <button type="button" class="rt-btn" data-action="addModification">
          <i class="fas fa-plus"></i> Add Mod
        </button>
      </div>
    </div>
    <div class="rt-panel__content">
      {{#each item.items as |embedded|}}
      {{#if embedded.isWeaponModification}}
      <div class="rt-mod-card">
        <div class="rt-mod-card__header">
          <strong>{{embedded.name}}</strong>
          <span class="rt-badge">{{embedded.system.craftsmanship}}</span>
        </div>
        <div class="rt-mod-card__body">
          {{#if embedded.system.hasModifiers}}
          <div class="rt-mod-card__modifiers">
            {{#if embedded.system.modifiers.damage}}
            <span>Dmg {{embedded.system.modifiers.damage}}</span>
            {{/if}}
            {{#if embedded.system.modifiers.penetration}}
            <span>Pen {{embedded.system.modifiers.penetration}}</span>
            {{/if}}
            {{#if embedded.system.modifiers.toHit}}
            <span>Hit {{embedded.system.modifiers.toHit}}</span>
            {{/if}}
          </div>
          {{/if}}
        </div>
        <button type="button" class="rt-btn rt-btn--icon-only rt-btn--danger" 
                data-action="itemDelete" 
                data-item-id="{{embedded.id}}">
          <i class="fas fa-trash"></i>
        </button>
      </div>
      {{/if}}
      {{/each}}
    </div>
  </div>
</div>
```

**New Handlebars Helper** (`src/module/handlebars/handlebars-helpers.mjs`):

```javascript
/**
 * Convert special Set to rich quality objects with lookups.
 * @param {Set<string>} specialSet    Set of quality identifiers
 * @returns {object[]}                Array of quality definition objects
 */
Handlebars.registerHelper('specialQualities', function(specialSet) {
  if (!specialSet || !specialSet.size) return [];
  
  const CONFIG = game.system.config.ROGUE_TRADER;
  const qualities = [];
  
  for (const identifier of specialSet) {
    // Parse identifier (e.g., "blast-3" → base="blast", level=3)
    const levelMatch = identifier.match(/^(.+?)-(\d+|x)$/i);
    const baseId = levelMatch ? levelMatch[1] : identifier;
    const level = levelMatch ? (levelMatch[2].toLowerCase() === 'x' ? null : parseInt(levelMatch[2])) : null;
    
    // Look up definition
    const def = CONFIG.weaponQualities[baseId];
    if (!def) {
      // Unknown quality, show raw identifier
      qualities.push({
        identifier: identifier,
        label: identifier,
        description: "Unknown quality",
        hasLevel: false,
        level: null
      });
      continue;
    }
    
    // Build rich quality object
    let label = game.i18n.localize(def.label);
    if (def.hasLevel && level !== null) {
      label += ` (${level})`;
    } else if (def.hasLevel) {
      label += ` (X)`;
    }
    
    qualities.push({
      identifier: identifier,
      baseIdentifier: baseId,
      label: label,
      description: game.i18n.localize(def.description),
      hasLevel: def.hasLevel,
      level: level
    });
  }
  
  return qualities;
});

/**
 * Check if item has embedded quality items.
 * @param {object[]} items    Array of embedded items
 * @returns {boolean}
 */
Handlebars.registerHelper('hasEmbeddedQualities', function(items) {
  if (!items || !items.length) return false;
  return items.some(item => item.isAttackSpecial);
});
```

---

### Phase 5: Compendium Display

**Goal**: Fix quality items in compendium browser to show effect text instead of page numbers.

**File**: `src/module/applications/compendium-browser.mjs`

**Current Issue**: Quality items show integer effect values (page numbers) in compendium list.

**Solution**: Override display logic for weaponQuality type to show effect HTML or summary.

```javascript
// In CompendiumBrowser._prepareItemData()
if (item.type === 'weaponQuality') {
  // Don't show raw effect field (might be page number)
  // Show description or effect HTML instead
  
  data.effect = item.system.effect;
  
  // If effect looks like a page number (integer < 500), show description instead
  if (typeof data.effect === 'number' && data.effect < 500) {
    data.effectDisplay = item.system.description?.value || `Page ${data.effect}`;
  } else if (typeof data.effect === 'string') {
    // Strip HTML tags for list view
    data.effectDisplay = data.effect.replace(/<[^>]+>/g, '').substring(0, 100);
  } else {
    data.effectDisplay = "—";
  }
  
  // Add level badge
  if (item.system.hasLevel) {
    data.levelBadge = item.system.level !== null 
      ? `(${item.system.level})` 
      : `(X)`;
  }
}
```

**Compendium List Template Update**:
```handlebars
{{#if item.type === 'weaponQuality'}}
<div class="compendium-item__quality">
  <h4>
    {{item.name}}
    {{#if item.levelBadge}}
    <span class="badge">{{item.levelBadge}}</span>
    {{/if}}
  </h4>
  <p class="compendium-item__effect">{{item.effectDisplay}}</p>
</div>
{{/if}}
```

---

### Phase 6: Vocalization / Chat Display

**Goal**: Rich quality display in chat messages (weapon attacks, item cards).

**Weapon Attack Roll Chat Card**:
```handlebars
{{!-- In weapon attack chat card template --}}
<div class="rt-chat-card__qualities">
  <h4><i class="fas fa-star"></i> Weapon Qualities</h4>
  <div class="rt-chat-qualities">
    {{#each weapon.system.special as |qualityId|}}
    {{#with (qualityLookup qualityId) as |quality|}}
    <div class="rt-chat-quality">
      <strong class="rt-chat-quality__name">{{quality.label}}</strong>
      <p class="rt-chat-quality__desc">{{quality.description}}</p>
    </div>
    {{/with}}
    {{/each}}
  </div>
</div>
```

**Handlebars Helper**:
```javascript
/**
 * Look up quality definition and return rich object.
 * @param {string} identifier    Quality identifier
 * @returns {object}
 */
Handlebars.registerHelper('qualityLookup', function(identifier) {
  const CONFIG = game.system.config.ROGUE_TRADER;
  
  const levelMatch = identifier.match(/^(.+?)-(\d+|x)$/i);
  const baseId = levelMatch ? levelMatch[1] : identifier;
  const level = levelMatch ? (levelMatch[2].toLowerCase() === 'x' ? null : parseInt(levelMatch[2])) : null;
  
  const def = CONFIG.weaponQualities[baseId];
  if (!def) {
    return {
      identifier,
      label: identifier,
      description: "Unknown quality"
    };
  }
  
  let label = game.i18n.localize(def.label);
  if (def.hasLevel && level !== null) {
    label += ` (${level})`;
  } else if (def.hasLevel) {
    label += ` (X)`;
  }
  
  return {
    identifier,
    baseIdentifier: baseId,
    label,
    description: game.i18n.localize(def.description),
    hasLevel: def.hasLevel,
    level
  };
});
```

---

## 📊 Summary: Files to Create/Modify

### Scripts to Create:
1. `scripts/migrate-weapon-qualities-pack.mjs` - Migration script (full pack data transformation)
2. `scripts/validate-weapon-qualities.mjs` - Validation script
3. `scripts/extract-quality-definitions.mjs` - Helper to extract effect text from rulebook references

### DataModels to Modify:
1. `src/module/data/item/weapon-quality.mjs` - Add migration, enhance getters
2. `src/module/data/item/attack-special.mjs` - Ensure compatibility (may be fine as-is)

### CONFIG to Modify:
1. `src/module/config.mjs` - Add `ROGUE_TRADER.weaponQualities` object with 109 quality definitions

### Templates to Modify:
1. `src/templates/item/item-weapon-sheet-modern.hbs` - Fix qualities tab (lines 262-320)
2. `src/templates/chat/weapon-attack-card.hbs` - Add quality display
3. `src/templates/compendium/item-list-quality.hbs` - Fix quality display in compendium

### Handlebars Helpers to Add:
1. `src/module/handlebars/handlebars-helpers.mjs` - Add `specialQualities`, `hasEmbeddedQualities`, `qualityLookup` helpers

### Styles to Add:
1. `src/scss/panels/_qualities.scss` - Quality tag styles, quality card styles

### Localization to Add:
1. `src/lang/en.json` - Add ~109 quality labels and descriptions:
   - `RT.WeaponQuality.Tearing` = "Tearing"
   - `RT.WeaponQuality.TearingDesc` = "The weapon is designed to rip and tear through flesh. The attacker may re-roll any dice in the damage roll that score a 1 or 2, but must accept the second result."
   - (Repeat for all 109 qualities)

---

## 🎯 Success Criteria

After full refactor:

✅ **Pack Data**:
- All 109 quality items have proper `identifier` field
- All quality items have correct `hasLevel`/`level` values
- All quality items have rich HTML `effect` text (not page numbers)
- All legacy fields removed

✅ **DataModel**:
- WeaponQualityData validates all migrated items
- `migrateData()` handles any remaining legacy data
- Rich getters provide `fullName`, `fullIdentifier`, `modifiersSummary`

✅ **CONFIG**:
- `CONFIG.ROGUE_TRADER.weaponQualities` defined with 109 entries
- Helper functions `getQualityDefinition()`, `getQualityLabel()`, `getQualityDescription()` work

✅ **Templates**:
- Weapon sheet qualities tab shows both built-in and custom qualities
- Built-in qualities display with proper labels, descriptions, tooltips
- User can add/remove qualities via UI
- No more `[object Object]` displays

✅ **Compendium**:
- Quality items show effect text, not page numbers
- Level badges display correctly
- Filtering/searching works

✅ **Chat**:
- Weapon attack rolls show quality names and descriptions
- Qualities properly formatted with level indicators
- Tooltips provide full effect text

✅ **V2 Integration**:
- ApplicationV2 action handlers for add/remove quality
- Quality picker dialog (select from CONFIG definitions)
- Level input for qualities with `hasLevel: true`
- Drag/drop from compendium still works

---

## 📝 Implementation Order

1. **Phase 1**: Create CONFIG definitions (manual curation of 109 qualities from rulebooks)
2. **Phase 2**: Write migration script with quality text lookups
3. **Phase 3**: Run migration on pack data, validate
4. **Phase 4**: Update DataModel with migration logic
5. **Phase 5**: Add handlebars helpers
6. **Phase 6**: Update weapon sheet template
7. **Phase 7**: Test in Foundry, iterate
8. **Phase 8**: Add compendium display fixes
9. **Phase 9**: Add chat display
10. **Phase 10**: Create quality picker dialog UI

**Estimated Effort**: 8-12 hours (mainly quality definition curation)

---

## 🚨 Critical Notes

### Manual Curation Required
The biggest blocker is **extracting 109 quality definitions from Rogue Trader rulebooks**. The pack data has page numbers (3, 60, 117, 213, etc.) that reference physical rulebook pages. Someone needs to:
1. Look up each page
2. Find the quality definition text
3. Transcribe to JSON/JavaScript
4. Add to CONFIG

**Alternative**: Use the 21 quality items that already have string effect text as a starting point, and progressively add others from rulebooks.

### Backwards Compatibility
After migration, old weapons with string identifiers in `special` array will still work. They'll just get richer display via CONFIG lookups.

### Performance
Using `special` array (identifiers) is much faster than embedded AttackSpecial items. Keep this as primary approach, use embedded items only for truly custom user-added qualities.

---

## End of Deep Dive

This document provides complete analysis and actionable plan to fix the weapon qualities system from scratch. Ready to begin implementation when user approves approach.
