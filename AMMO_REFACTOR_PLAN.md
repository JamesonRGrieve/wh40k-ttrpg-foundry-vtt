# Ammunition System Deep Dive & Refactor Plan

## Executive Summary

After analyzing 133 ammunition items, I've identified **critical misalignments** similar to weapons:
- **Pack Data Structure** (legacy flat fields with string descriptions)
- **DataModel Schema** (modern V13 with structured modifiers)
- **Template Rendering** (using wrong field names)

**Root Cause**: Pack data uses legacy descriptive strings while DataModel expects structured modifier objects.

---

## 🔍 Current State Analysis

### Pack Data Structure (Legacy Format)

```json
{
  "name": "Blessed Ammunition",
  "type": "ammunition",
  "system": {
    "usedWith": "Any Weapon with Ammo (may limt to Bolt/Flamer/SP)",  // ❌ String description
    "damageOrEffect": "Weapon gains Sanctified Quality when firing...", // ❌ String description
    "qualities": "Sanctified",                                         // ❌ String, not Set
    "weight": "10% wep",                                               // ❌ String, not number
    "availability": "extremely-rare",                                  // ✅ GOOD
    "cost": "50T Each",                                                // ❌ String, not object
    "source": "RT: Faith and Coin",                                    // ✅ GOOD (but not in schema)
    "damageModifier": 0,                                               // ❌ Wrong name (should be modifiers.damage)
    "penetrationModifier": 0,                                          // ❌ Wrong name (should be modifiers.penetration)
    "specialRules": []                                                 // ❌ Wrong field
  }
}
```

### DataModel Schema (Modern V13 Format)

```javascript
class AmmunitionData {
  static defineSchema() {
    return {
      identifier: IdentifierField,
      
      // What weapon types can use this ammo
      weaponTypes: SetField,  // Set of type identifiers
      
      // Structured modifiers
      modifiers: {
        damage: NumberField,           // +2, -1, etc.
        penetration: NumberField,      // +1, -2, etc.
        range: NumberField,            // Modifier to range
        rateOfFire: {
          single: NumberField,
          semi: NumberField,
          full: NumberField
        }
      },
      
      // Special qualities management
      addedQualities: SetField,     // Qualities this ammo adds
      removedQualities: SetField,   // Qualities this ammo removes
      
      // Clip size modifier
      clipModifier: NumberField,
      
      // Effect description
      effect: HTMLField,
      
      // Notes
      notes: StringField,
      
      // From PhysicalItemTemplate
      weight: NumberField,
      availability: StringField,
      craftsmanship: StringField,
      cost: { value: NumberField, currency: StringField },
      
      // From DamageTemplate (for override damage)
      damage: {
        formula: FormulaField,
        type: StringField,
        bonus: NumberField,
        penetration: NumberField
      },
      special: SetField
    };
  }
}
```

### Pack Data Issues

1. **`usedWith`** - String description → Should parse into `weaponTypes` Set
   - "Bolt/Primitive: Bolt Weapons and Crossbows" → `["bolt", "primitive"]`
   - "Any Weapon with Ammo" → `[]` (empty = all)
   - "SP/Bolt: Shotguns, ..." → `["solid-projectile", "bolt"]`

2. **`damageOrEffect`** - String description → Should parse into structured data
   - "+2 Damage" → `modifiers.damage = 2`
   - "Does 2d10 E Pen 0 Damage" → `damage = { formula: "2d10", type: "energy", penetration: 0 }`
   - "Gain Crippling (2)" → `addedQualities = ["crippling-2"]`
   - "Lose Reliable" → `removedQualities = ["reliable"]`

3. **`qualities`** - String → Should parse into `addedQualities` Set
   - "Sanctified" → `["sanctified"]`
   - "Crippling (2), Tainted, Reliable (lose), Sanctified (lose)" → Parse gains/losses

4. **`weight`** - String with units → Number
   - "10% wep" → 0 (special case, weapon-relative)
   - "1kg" → 1

5. **`damageModifier`/`penetrationModifier`** - Flat fields → Nested
   - Move to `modifiers.damage` and `modifiers.penetration`

6. **`specialRules`** - Wrong field → Should be `notes` or `effect`

### Template Issues

Current template (`item-ammo-sheet.hbs`) has:
- ❌ `dh.items.availability` (should be `CONFIG.ROGUE_TRADER.availabilities`)
- ❌ `system.weapon_type` (should be `system.weaponTypes` Set)
- ❌ `system.effect` as textarea (should be ProseMirror HTML editor)
- ❌ No modifiers fields
- ❌ No qualities management

---

## 📋 Implementation Plan

### Phase 1: Schema Analysis & Migration Script

**Create**: `scripts/migrate-ammo-pack.mjs`

Key parsing functions:

```javascript
// Parse "Bolt/Primitive: Bolt Weapons and Crossbows" → ["bolt", "primitive"]
function parseWeaponTypes(usedWithString) {
  if (!usedWithString) return [];
  
  const str = usedWithString.toLowerCase();
  
  // Check for "Any" or "All"
  if (str.includes('any') || str.includes('all')) return [];
  
  const types = [];
  const typeMap = {
    'bolt': 'bolt',
    'las': 'las',
    'sp': 'solid-projectile',
    'solid': 'solid-projectile',
    'solid-projectile': 'solid-projectile',
    'melta': 'melta',
    'plasma': 'plasma',
    'flame': 'flame',
    'flamer': 'flame',
    'launcher': 'launcher',
    'primitive': 'primitive',
    'power': 'power',
    'chain': 'chain',
    'shock': 'shock',
    'exotic': 'exotic'
  };
  
  // Extract type prefixes before colon
  const beforeColon = str.split(':')[0];
  const parts = beforeColon.split(/[,\/]/).map(p => p.trim());
  
  for (const part of parts) {
    for (const [key, value] of Object.entries(typeMap)) {
      if (part.includes(key)) {
        if (!types.includes(value)) types.push(value);
      }
    }
  }
  
  return types;
}

// Parse effect description into structured modifiers
function parseEffectDescription(damageOrEffect, qualities) {
  const result = {
    modifiers: { damage: 0, penetration: 0, range: 0 },
    overrideDamage: null,
    addedQualities: [],
    removedQualities: [],
    effect: ""
  };
  
  if (!damageOrEffect) return result;
  
  const str = String(damageOrEffect);
  
  // Check for damage modifier: "+2 Damage", "-1 Damage"
  const damageMatch = str.match(/([+\-]\d+)\s*Damage/i);
  if (damageMatch) {
    result.modifiers.damage = parseInt(damageMatch[1]);
  }
  
  // Check for penetration modifier: "+1 Pen", "+2 Penetration"
  const penMatch = str.match(/([+\-]\d+)\s*Pen(?:etration)?/i);
  if (penMatch) {
    result.modifiers.penetration = parseInt(penMatch[1]);
  }
  
  // Check for override damage: "Does 2d10 E, Pen 0"
  const overrideMatch = str.match(/Does\s+(\d+d\d+(?:[+\-]\d+)?)\s+([A-Z])/i);
  if (overrideMatch) {
    const dmgParts = overrideMatch[1].match(/(\d+d\d+)([+\-]\d+)?/);
    const penMatch = str.match(/Pen\s+(\d+)/i);
    
    result.overrideDamage = {
      formula: dmgParts[1],
      bonus: dmgParts[2] ? parseInt(dmgParts[2]) : 0,
      type: parseDamageTypeLetter(overrideMatch[2]),
      penetration: penMatch ? parseInt(penMatch[1]) : 0
    };
  }
  
  // Parse qualities from qualities field
  if (qualities) {
    const qualitiesStr = String(qualities);
    const parts = qualitiesStr.split(',').map(q => q.trim());
    
    for (const part of parts) {
      // Check for "lose" indicator
      if (part.toLowerCase().includes('lose')) {
        const qualityName = part.replace(/\(lose\)/i, '').trim();
        result.removedQualities.push(normalizeQuality(qualityName));
      } else {
        result.addedQualities.push(normalizeQuality(part));
      }
    }
  }
  
  // Check for "Gain" and "Lose" in description
  const gainMatch = str.match(/Gain\s+([^.]+)/i);
  if (gainMatch) {
    const qualities = gainMatch[1].split(/(?:and|,)/).map(q => q.trim());
    for (const q of qualities) {
      result.addedQualities.push(normalizeQuality(q));
    }
  }
  
  const loseMatch = str.match(/Lose\s+([^.]+)/i);
  if (loseMatch) {
    const qualities = loseMatch[1].split(/(?:and|,)/).map(q => q.trim());
    for (const q of qualities) {
      result.removedQualities.push(normalizeQuality(q));
    }
  }
  
  // Store full description as effect HTML
  result.effect = `<p>${str}</p>`;
  
  return result;
}

// Normalize quality name to identifier
function normalizeQuality(qualityStr) {
  if (!qualityStr) return "";
  
  // Match "Quality (rating)" pattern
  const match = qualityStr.match(/^([^\(]+)(?:\(([^\)]+)\))?/);
  if (!match) return qualityStr.toLowerCase().replace(/\s+/g, '-');
  
  const name = match[1].trim().toLowerCase().replace(/\s+/g, '-');
  const rating = match[2]?.trim();
  
  // Only append rating if it's a number
  if (rating && /^\d+$/.test(rating)) {
    return `${name}-${rating}`;
  }
  
  return name;
}

// Parse damage type letter
function parseDamageTypeLetter(letter) {
  const typeMap = {
    'I': 'impact',
    'R': 'rending', 
    'X': 'explosive',
    'E': 'energy',
    'F': 'fire',
    'S': 'shock',
    'C': 'cold',
    'T': 'toxic'
  };
  return typeMap[letter.toUpperCase()] || 'impact';
}
```

### Phase 2: DataModel Enhancement

**Update**: `src/module/data/item/ammunition.mjs`

```javascript
/** @override */
static migrateData(source) {
  const migrated = super.migrateData(source);
  
  // Parse legacy usedWith → weaponTypes
  if (migrated.usedWith && !migrated.weaponTypes) {
    migrated.weaponTypes = parseWeaponTypes(migrated.usedWith);
    delete migrated.usedWith;
  }
  
  // Parse legacy damageOrEffect + qualities → structured data
  if (migrated.damageOrEffect || migrated.qualities) {
    const parsed = parseEffectDescription(
      migrated.damageOrEffect,
      migrated.qualities
    );
    
    migrated.modifiers = migrated.modifiers || {};
    Object.assign(migrated.modifiers, parsed.modifiers);
    
    if (parsed.overrideDamage) {
      migrated.damage = parsed.overrideDamage;
    }
    
    migrated.addedQualities = parsed.addedQualities;
    migrated.removedQualities = parsed.removedQualities;
    migrated.effect = parsed.effect;
    
    delete migrated.damageOrEffect;
    delete migrated.qualities;
  }
  
  // Migrate flat modifier fields → nested
  if (migrated.damageModifier !== undefined) {
    migrated.modifiers = migrated.modifiers || {};
    migrated.modifiers.damage = migrated.damageModifier;
    delete migrated.damageModifier;
  }
  
  if (migrated.penetrationModifier !== undefined) {
    migrated.modifiers = migrated.modifiers || {};
    migrated.modifiers.penetration = migrated.penetrationModifier;
    delete migrated.penetrationModifier;
  }
  
  // Move specialRules → notes
  if (migrated.specialRules && !migrated.notes) {
    migrated.notes = Array.isArray(migrated.specialRules) 
      ? migrated.specialRules.join(', ')
      : String(migrated.specialRules);
    delete migrated.specialRules;
  }
  
  return migrated;
}

// Add source field to schema
source: new fields.StringField({ required: false, blank: true })
```

### Phase 3: Template Modernization

**Create**: `templates/item/item-ammo-sheet-modern.hbs`

```handlebars
<div class="rt-item-sheet">
    <form autocomplete="off">
        <!-- Header with name and type -->
        <header class="rt-item-header">
            <div class="rt-item-image" data-edit="img">
                <img src="{{item.img}}" alt="{{item.name}}" />
            </div>
            <div class="rt-item-title">
                <input type="text" name="name" value="{{item.name}}" placeholder="Ammunition Name" />
                <div class="rt-item-subtitle">
                    <i class="fas fa-bullseye"></i> Ammunition
                </div>
            </div>
        </header>

        <!-- Quick Stats -->
        <div class="rt-quick-stats">
            {{#if item.system.modifiers.damage}}
            <div class="rt-stat-badge">
                <span class="rt-stat-badge__label">DMG</span>
                <span class="rt-stat-badge__value">{{#if (gt item.system.modifiers.damage 0)}}+{{/if}}{{item.system.modifiers.damage}}</span>
            </div>
            {{/if}}
            
            {{#if item.system.modifiers.penetration}}
            <div class="rt-stat-badge">
                <span class="rt-stat-badge__label">PEN</span>
                <span class="rt-stat-badge__value">{{#if (gt item.system.modifiers.penetration 0)}}+{{/if}}{{item.system.modifiers.penetration}}</span>
            </div>
            {{/if}}
            
            {{#if item.system.weaponTypes.size}}
            <div class="rt-stat-badge">
                <span class="rt-stat-badge__label">For</span>
                <span class="rt-stat-badge__value">{{item.system.weaponTypesLabel}}</span>
            </div>
            {{/if}}
        </div>

        <!-- Tabs -->
        <nav class="rt-tabs" data-group="primary">
            <a class="rt-tab active" data-tab="stats">
                <i class="fas fa-chart-bar"></i> Stats
            </a>
            <a class="rt-tab" data-tab="qualities">
                <i class="fas fa-star"></i> Qualities
            </a>
            <a class="rt-tab" data-tab="description">
                <i class="fas fa-scroll"></i> Description
            </a>
        </nav>

        <!-- Tab Content -->
        <section class="rt-tab-content">
            <!-- Stats Tab -->
            <div class="tab active" data-tab="stats">
                <div class="rt-panel">
                    <div class="rt-panel__header">
                        <h3>Modifiers</h3>
                    </div>
                    <div class="rt-panel__content">
                        <div class="rt-field-grid rt-field-grid--3">
                            <div class="rt-field">
                                <label>Damage Modifier</label>
                                <input type="number" name="system.modifiers.damage" value="{{item.system.modifiers.damage}}" />
                            </div>
                            <div class="rt-field">
                                <label>Penetration Modifier</label>
                                <input type="number" name="system.modifiers.penetration" value="{{item.system.modifiers.penetration}}" />
                            </div>
                            <div class="rt-field">
                                <label>Range Modifier</label>
                                <input type="number" name="system.modifiers.range" value="{{item.system.modifiers.range}}" />
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="rt-panel">
                    <div class="rt-panel__header">
                        <h3>Compatibility</h3>
                    </div>
                    <div class="rt-panel__content">
                        <div class="rt-field">
                            <label>Weapon Types</label>
                            <select name="system.weaponTypes" multiple>
                                <option value="las" {{#if (arrayIncludes "las" item.system.weaponTypes)}}selected{{/if}}>Las</option>
                                <option value="solid-projectile" {{#if (arrayIncludes "solid-projectile" item.system.weaponTypes)}}selected{{/if}}>Solid Projectile</option>
                                <option value="bolt" {{#if (arrayIncludes "bolt" item.system.weaponTypes)}}selected{{/if}}>Bolt</option>
                                <option value="melta" {{#if (arrayIncludes "melta" item.system.weaponTypes)}}selected{{/if}}>Melta</option>
                                <option value="plasma" {{#if (arrayIncludes "plasma" item.system.weaponTypes)}}selected{{/if}}>Plasma</option>
                                <option value="flame" {{#if (arrayIncludes "flame" item.system.weaponTypes)}}selected{{/if}}>Flame</option>
                                <option value="launcher" {{#if (arrayIncludes "launcher" item.system.weaponTypes)}}selected{{/if}}>Launcher</option>
                            </select>
                            <p class="rt-help-text">Leave empty for universal ammo</p>
                        </div>
                    </div>
                </div>
                
                <div class="rt-panel">
                    <div class="rt-panel__header">
                        <h3>Physical Properties</h3>
                    </div>
                    <div class="rt-panel__content">
                        <div class="rt-field-grid rt-field-grid--4">
                            <div class="rt-field">
                                <label>Weight (kg)</label>
                                <input type="number" name="system.weight" value="{{item.system.weight}}" step="0.1" />
                            </div>
                            <div class="rt-field">
                                <label>Availability</label>
                                <select name="system.availability">
                                    {{selectOptions (arrayToObject CONFIG.ROGUE_TRADER.availabilities) selected=item.system.availability}}
                                </select>
                            </div>
                            <div class="rt-field">
                                <label>Craftsmanship</label>
                                <select name="system.craftsmanship">
                                    {{selectOptions (arrayToObject CONFIG.ROGUE_TRADER.craftsmanships) selected=item.system.craftsmanship}}
                                </select>
                            </div>
                            <div class="rt-field">
                                <label>Source</label>
                                <input type="text" name="system.source" value="{{item.system.source}}" placeholder="RT: Core" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Qualities Tab -->
            <div class="tab" data-tab="qualities">
                <div class="rt-panel">
                    <div class="rt-panel__header">
                        <h3>Added Qualities</h3>
                    </div>
                    <div class="rt-panel__content">
                        <div class="rt-tags">
                            {{#each item.system.addedQualities as |quality|}}
                            <span class="rt-tag rt-tag--success">{{quality}}</span>
                            {{/each}}
                        </div>
                        <p class="rt-help-text">Qualities this ammo adds to the weapon</p>
                    </div>
                </div>
                
                <div class="rt-panel">
                    <div class="rt-panel__header">
                        <h3>Removed Qualities</h3>
                    </div>
                    <div class="rt-panel__content">
                        <div class="rt-tags">
                            {{#each item.system.removedQualities as |quality|}}
                            <span class="rt-tag rt-tag--danger">{{quality}}</span>
                            {{/each}}
                        </div>
                        <p class="rt-help-text">Qualities this ammo removes from the weapon</p>
                    </div>
                </div>
            </div>

            <!-- Description Tab -->
            <div class="tab" data-tab="description">
                <div class="rt-panel">
                    <div class="rt-panel__header">
                        <h3>Effect</h3>
                    </div>
                    <div class="rt-panel__content">
                        {{editor item.system.effect target="system.effect" button=true editable=true engine="prosemirror"}}
                    </div>
                </div>
            </div>
        </section>
    </form>
</div>
```

### Phase 4: AmmoSheet Context

**Update**: `src/module/applications/item/ammo-sheet.mjs`

```javascript
async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.CONFIG = CONFIG;
    return context;
}
```

---

## 🎯 Success Criteria

- [ ] All 133 ammo items migrated
- [ ] 100% validation success
- [ ] Structured modifiers working
- [ ] Weapon type filtering working
- [ ] Quality management working
- [ ] No `[object Object]` displays
- [ ] Proper effect descriptions

---

## 📊 Complexity Assessment

**Difficulty**: ⭐⭐⭐ (Medium-High)

**Challenges**:
1. Parsing natural language descriptions into structured data
2. Quality string parsing with "lose" indicators
3. Damage override vs. modifier logic
4. Weapon type string parsing (many variations)
5. Weight field has special "10% wep" values

**Estimated Time**: 45-60 minutes

---

*Ready to proceed with Phase 1 (migration script)?*
