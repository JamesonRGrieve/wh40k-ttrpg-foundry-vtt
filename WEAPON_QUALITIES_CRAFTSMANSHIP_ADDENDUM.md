# Weapon Qualities & Craftsmanship Integration - Addendum

## Critical Discovery: Craftsmanship Affects Qualities

After reviewing the craftsmanship table, I discovered that **craftsmanship levels dynamically add/remove weapon qualities**. This is a core game mechanic that must be integrated into the quality system.

---

## 📊 Craftsmanship → Quality Mapping

### Ranged Weapons

| Craftsmanship | Cost | Avail | Quality Effect |
|--------------|------|-------|----------------|
| **Poor** | ×1/4 | +2 Step | Adds **Unreliable (90-100)** - Jams on 90+ |
| **Cheap** | ×1/2 | +1 Step | Adds **Unreliable** - Jams on 96+ |
| **Common** | ×1 | - | No change (baseline) |
| **Good** | ×3 | -1 Step | Adds **Reliable** - Never jams below 95 |
| **Best** | ×10 | -2 Step | Adds **Never Jam/Overheat** - Immune to jamming |
| **Master-Crafted** | GM disc. | GM disc. | Adds **Never Jam/Overheat + +10 BS** - Immune + attack bonus |

### Melee Weapons

| Craftsmanship | Cost | Avail | Modifier Effect |
|--------------|------|-------|-----------------|
| **Poor** | ×1/4 | +2 Step | **-15 WS** modifier |
| **Cheap** | ×1/2 | +1 Step | **-10 WS** modifier |
| **Common** | ×1 | - | No change (baseline) |
| **Good** | ×3 | -1 Step | **+5 WS** modifier |
| **Best** | ×10 | -2 Step | **+10 WS, +1 Damage** modifiers |
| **Master-Crafted** | GM disc. | GM disc. | **+20 WS, +2 Damage** modifiers |

### Armour

| Craftsmanship | Armour Effect |
|--------------|---------------|
| **Poor** | **-2 AP** to all locations |
| **Cheap** | **-1 AP** to all locations |
| **Common** | No change |
| **Good** | **+1 AP** on first attack of round |
| **Best** | **+1 AP** and **1/2 weight** |
| **Master-Crafted** | **+2 AP** and **1/2 weight** |

### Gear

| Craftsmanship | Gear Effect |
|--------------|-------------|
| **Poor** | **-15%** to related skill tests or varies |
| **Cheap** | **-10%** to related skill tests or varies |
| **Common** | No change |
| **Good** | **+10%** to related skill tests or varies |
| **Best** | **+20%** to related skill tests or varies |
| **Master-Crafted** | **+30%** to related skill tests or varies |

---

## 🎯 Key Implications

### 1. Qualities Are Dynamic, Not Static

**Problem**: Current pack data has `special: ["tearing", "reliable"]` as a static array.

**Reality**: A weapon with `craftsmanship: "good"` should **automatically gain "reliable"** quality, but a weapon with `craftsmanship: "poor"` should **automatically gain "unreliable"** quality.

**Solution**: Weapons need a `baseSpecial` array (from pack data) and a computed `effectiveSpecial` getter that adds craftsmanship-derived qualities.

### 2. Unreliable Has Variants

**Unreliable** quality comes in **two flavors**:
- **Unreliable (Standard)** - Jams on 96-100 (from "Cheap" craftsmanship)
- **Unreliable (90-100)** - Jams on 90-100 (from "Poor" craftsmanship)

This should be stored as:
- `unreliable` - Standard variant (96+)
- `unreliable-2` - Severe variant (90+) - "2" = severity level

### 3. Best/Master-Crafted Are Special

**"Never Jam/Overheat"** isn't a standard quality, it's an **immunity**:
- Weapons with these craftsmanship levels **cannot** have "Unreliable" or "Overheats" qualities
- They **override** any jamming/overheating mechanics

This should be a computed property:
```javascript
get canJam() {
  return !['best', 'master-crafted'].includes(this.craftsmanship);
}
```

### 4. Modifiers Stack

Craftsmanship provides **stat modifiers** that must be tracked separately from qualities:
- Melee WS modifiers (-15, -10, +5, +10, +20)
- Melee damage bonuses (+1, +2)
- BS modifiers (+10 for master-crafted)
- Armour AP modifiers (-2, -1, +1, +2)
- Weight multipliers (1/2 for best/master-crafted armour)

These should go into a separate `craftsmanshipModifiers` getter.

---

## 🔧 Revised DataModel Design

### WeaponData Changes

**Current**:
```javascript
class WeaponData {
  special: SetField(StringField)  // Static qualities
}
```

**New**:
```javascript
class WeaponData {
  // Pack data stores BASE qualities only (from weapon itself)
  special: SetField(StringField)  // Renamed to baseSpecial for clarity
  
  // COMPUTED: Effective qualities = base + craftsmanship-derived
  get effectiveSpecial() {
    const qualities = new Set(this.baseSpecial);
    
    // Add craftsmanship-derived qualities
    if (this.craftsmanship === 'poor') {
      if (!this.melee) qualities.add('unreliable-2');  // Severe jamming
    } else if (this.craftsmanship === 'cheap') {
      if (!this.melee) qualities.add('unreliable');    // Standard jamming
    } else if (this.craftsmanship === 'good') {
      if (!this.melee) qualities.add('reliable');
    } else if (['best', 'master-crafted'].includes(this.craftsmanship)) {
      if (!this.melee) {
        // Remove unreliable/overheats if present
        qualities.delete('unreliable');
        qualities.delete('unreliable-2');
        qualities.delete('overheats');
      }
    }
    
    return qualities;
  }
  
  // COMPUTED: Craftsmanship-derived stat modifiers
  get craftsmanshipModifiers() {
    const mods = {
      toHit: 0,      // WS/BS modifier
      damage: 0,     // Damage bonus
      weight: 1.0    // Weight multiplier
    };
    
    if (this.melee) {
      // Melee WS modifiers
      switch(this.craftsmanship) {
        case 'poor': mods.toHit = -15; break;
        case 'cheap': mods.toHit = -10; break;
        case 'good': mods.toHit = 5; break;
        case 'best': mods.toHit = 10; mods.damage = 1; break;
        case 'master-crafted': mods.toHit = 20; mods.damage = 2; break;
      }
    } else {
      // Ranged BS modifiers
      if (this.craftsmanship === 'master-crafted') {
        mods.toHit = 10;
      }
    }
    
    return mods;
  }
}
```

---

## 📝 Updated CONFIG Design

### Reliability Quality Variants

```javascript
ROGUE_TRADER.weaponQualities = {
  // ... other qualities
  
  'reliable': {
    label: "RT.WeaponQuality.Reliable",
    description: "RT.WeaponQuality.ReliableDesc",  // "Never jams on 94 or below"
    hasLevel: false,
    jamThreshold: 95  // Jams on 95+
  },
  
  'unreliable': {
    label: "RT.WeaponQuality.Unreliable",
    description: "RT.WeaponQuality.UnreliableDesc",  // "Jams on 96-100"
    hasLevel: false,
    jamThreshold: 96  // Jams on 96+
  },
  
  'unreliable-2': {
    label: "RT.WeaponQuality.Unreliable2",
    description: "RT.WeaponQuality.Unreliable2Desc",  // "Jams on 90-100 (Poor quality)"
    hasLevel: false,
    jamThreshold: 90  // Jams on 90+
  },
  
  'overheats': {
    label: "RT.WeaponQuality.Overheats",
    description: "RT.WeaponQuality.OverheatsDesc",
    hasLevel: false
  }
};

// Helper to check if weapon can jam
ROGUE_TRADER.getJamThreshold = function(weapon) {
  const qualities = weapon.system.effectiveSpecial;
  
  // Best/Master-crafted never jam
  if (['best', 'master-crafted'].includes(weapon.system.craftsmanship)) {
    return null;  // Cannot jam
  }
  
  // Check for reliability qualities
  if (qualities.has('unreliable-2')) return 90;
  if (qualities.has('unreliable')) return 96;
  if (qualities.has('reliable')) return 95;
  
  return 100;  // Normal jamming threshold
};
```

---

## 🎨 Updated Template Display

### Weapon Sheet Qualities Tab

**Show Both Base and Craftsmanship-Derived Qualities**:

```handlebars
<div class="rt-panel">
  <div class="rt-panel__header">
    <h3><i class="fas fa-star"></i> Weapon Qualities</h3>
  </div>
  <div class="rt-panel__content">
    
    {{!-- Craftsmanship Badge --}}
    <div class="rt-craftsmanship-banner rt-craftsmanship--{{item.system.craftsmanship}}">
      <i class="fas fa-hammer"></i>
      <strong>{{item.system.craftsmanshipLabel}}</strong>
      {{#if (ne item.system.craftsmanship "common")}}
      <span class="rt-craftsmanship__effects">
        {{#if item.system.craftsmanshipModifiers.toHit}}
        <span class="rt-badge">{{item.system.craftsmanshipModifiers.toHit}} Hit</span>
        {{/if}}
        {{#if item.system.craftsmanshipModifiers.damage}}
        <span class="rt-badge">+{{item.system.craftsmanshipModifiers.damage}} Dmg</span>
        {{/if}}
      </span>
      {{/if}}
    </div>
    
    {{!-- Base Qualities --}}
    <h4 class="rt-section-header">
      <i class="fas fa-star"></i> Base Qualities
      <span class="rt-help-text">(From weapon design)</span>
    </h4>
    <div class="rt-tags rt-tags--qualities">
      {{#if item.system.special.size}}
        {{#each (specialQualities item.system.special) as |quality|}}
        <span class="rt-tag rt-tag--quality rt-tag--base" 
              data-quality-id="{{quality.identifier}}"
              data-tooltip="{{quality.description}}">
          <i class="fas fa-circle"></i>
          <span class="rt-tag__label">{{quality.label}}</span>
          {{#if quality.level}}
          <span class="rt-tag__badge">{{quality.level}}</span>
          {{/if}}
        </span>
        {{/each}}
      {{else}}
        <p class="rt-empty-state">No base qualities</p>
      {{/if}}
    </div>
    
    {{!-- Craftsmanship-Derived Qualities --}}
    {{#if (hasCraftsmanshipQualities item.system)}}
    <h4 class="rt-section-header">
      <i class="fas fa-hammer"></i> Craftsmanship Qualities
      <span class="rt-help-text">(Auto-applied from {{item.system.craftsmanshipLabel}})</span>
    </h4>
    <div class="rt-tags rt-tags--qualities">
      {{#each (craftsmanshipQualities item.system) as |quality|}}
      <span class="rt-tag rt-tag--quality rt-tag--craftsmanship" 
            data-quality-id="{{quality.identifier}}"
            data-tooltip="{{quality.description}}">
        <i class="fas fa-cog"></i>
        <span class="rt-tag__label">{{quality.label}}</span>
      </span>
      {{/each}}
    </div>
    {{/if}}
    
    {{!-- Effective (Combined) Qualities --}}
    <h4 class="rt-section-header">
      <i class="fas fa-layer-group"></i> Effective Qualities
      <span class="rt-help-text">(All active qualities)</span>
    </h4>
    <div class="rt-tags rt-tags--qualities rt-tags--effective">
      {{#each (specialQualities item.system.effectiveSpecial) as |quality|}}
      <span class="rt-tag rt-tag--quality rt-tag--effective" 
            data-quality-id="{{quality.identifier}}"
            data-tooltip="{{quality.description}}">
        <i class="fas fa-check-circle"></i>
        <span class="rt-tag__label">{{quality.label}}</span>
        {{#if quality.level}}
        <span class="rt-tag__badge">{{quality.level}}</span>
        {{/if}}
      </span>
      {{/each}}
    </div>
    
  </div>
</div>
```

**Visual Hierarchy**:
- **Base Qualities** - Blue tags, circle icon
- **Craftsmanship Qualities** - Orange tags, cog icon
- **Effective Qualities** - Green tags, check icon (final computed set)

---

## 🔨 New Handlebars Helpers

```javascript
/**
 * Get qualities added by craftsmanship.
 * @param {object} weaponSystem    Weapon system data
 * @returns {object[]}             Array of quality objects
 */
Handlebars.registerHelper('craftsmanshipQualities', function(weaponSystem) {
  const CONFIG = game.system.config.ROGUE_TRADER;
  const qualities = [];
  const craft = weaponSystem.craftsmanship;
  const isMelee = weaponSystem.melee;
  
  if (isMelee) {
    // Melee weapons don't get quality changes, only stat mods
    return [];
  }
  
  // Ranged weapons get reliability qualities
  if (craft === 'poor') {
    const def = CONFIG.weaponQualities['unreliable-2'];
    qualities.push({
      identifier: 'unreliable-2',
      label: game.i18n.localize(def.label),
      description: game.i18n.localize(def.description),
      hasLevel: false,
      level: null
    });
  } else if (craft === 'cheap') {
    const def = CONFIG.weaponQualities['unreliable'];
    qualities.push({
      identifier: 'unreliable',
      label: game.i18n.localize(def.label),
      description: game.i18n.localize(def.description),
      hasLevel: false,
      level: null
    });
  } else if (craft === 'good') {
    const def = CONFIG.weaponQualities['reliable'];
    qualities.push({
      identifier: 'reliable',
      label: game.i18n.localize(def.label),
      description: game.i18n.localize(def.description),
      hasLevel: false,
      level: null
    });
  } else if (['best', 'master-crafted'].includes(craft)) {
    // "Never Jam" - show as special immunity badge
    qualities.push({
      identifier: 'never-jam',
      label: game.i18n.localize("RT.WeaponQuality.NeverJam"),
      description: game.i18n.localize("RT.WeaponQuality.NeverJamDesc"),
      hasLevel: false,
      level: null
    });
  }
  
  return qualities;
});

/**
 * Check if weapon has craftsmanship-derived qualities.
 * @param {object} weaponSystem    Weapon system data
 * @returns {boolean}
 */
Handlebars.registerHelper('hasCraftsmanshipQualities', function(weaponSystem) {
  const craft = weaponSystem.craftsmanship;
  const isMelee = weaponSystem.melee;
  
  if (isMelee) return false;  // Melee only gets stat mods
  
  return ['poor', 'cheap', 'good', 'best', 'master-crafted'].includes(craft);
});
```

---

## 📊 Updated Migration Strategy

### Pack Data Does NOT Need Craftsmanship Qualities

**Important**: Pack data should **NOT** include "reliable" or "unreliable" in the `special` array if they come from craftsmanship.

**Example** (Correct):
```json
{
  "name": "Good Craftsmanship Bolt Pistol",
  "system": {
    "craftsmanship": "good",
    "special": ["tearing"]       // ✅ No "reliable" - auto-added by craftsmanship
  }
}
```

**Example** (Wrong):
```json
{
  "name": "Good Craftsmanship Bolt Pistol",
  "system": {
    "craftsmanship": "good",
    "special": ["tearing", "reliable"]   // ❌ Duplicate! "reliable" from craftsmanship
  }
}
```

### Migration Script Must Clean Duplicates

```javascript
function cleanCraftsmanshipQualities(data) {
  const craft = data.system.craftsmanship;
  const special = new Set(data.system.special || []);
  
  // Remove qualities that should come from craftsmanship
  if (craft === 'poor' || craft === 'cheap') {
    // Poor/cheap should not have "reliable"
    special.delete('reliable');
  }
  
  if (craft === 'good') {
    // Good should not have "unreliable"
    special.delete('unreliable');
    special.delete('unreliable-2');
  }
  
  if (['best', 'master-crafted'].includes(craft)) {
    // Best/master should not have any jam-related qualities
    special.delete('unreliable');
    special.delete('unreliable-2');
    special.delete('overheats');
  }
  
  return Array.from(special);
}
```

---

## 🎯 Impact on Quality Count

### Original Estimate: 109 Qualities

With craftsmanship integration, we need to add:
- `unreliable-2` (Poor craftsmanship variant)
- `never-jam` (Best/Master-crafted immunity marker)

**New Total**: **111 quality definitions** (109 original + 2 craftsmanship-specific)

### Quality Categories

1. **Standard Qualities** (105) - Normal weapon properties
2. **Reliability Qualities** (4):
   - `reliable` - Good craftsmanship
   - `unreliable` - Cheap craftsmanship
   - `unreliable-2` - Poor craftsmanship
   - `never-jam` - Best/Master-crafted
3. **Other Special** (2):
   - `overheats` - Plasma/energy weapons (suppressed by best/master)
   - (Any others found during curation)

---

## 🔄 Roll Integration: Jam Checks

### When Rolling Attack

```javascript
// In weapon attack roll handler
async function rollWeaponAttack(weapon, actor) {
  const roll = await new Roll("1d100").roll();
  const jamThreshold = CONFIG.ROGUE_TRADER.getJamThreshold(weapon);
  
  // Check for jam
  if (jamThreshold !== null && roll.total >= jamThreshold) {
    // Weapon jammed!
    ui.notifications.warn(`${weapon.name} has jammed!`);
    
    // Create chat message with jam details
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({actor}),
      content: `
        <div class="rt-chat-card rt-chat-card--jam">
          <h3><i class="fas fa-exclamation-triangle"></i> Weapon Jam!</h3>
          <p><strong>${weapon.name}</strong> has jammed (rolled ${roll.total}, threshold ${jamThreshold}).</p>
          <p>Requires a Full Action to clear the jam.</p>
        </div>
      `
    });
    
    return null;  // Attack fails
  }
  
  // Continue with normal attack...
}
```

---

## 📝 Localization Keys to Add

```json
{
  "RT.WeaponQuality.Reliable": "Reliable",
  "RT.WeaponQuality.ReliableDesc": "This weapon is very well made and rarely jams. It only jams on a roll of 95 or higher.",
  
  "RT.WeaponQuality.Unreliable": "Unreliable",
  "RT.WeaponQuality.UnreliableDesc": "This weapon is prone to jamming. It jams on a roll of 96 or higher (cheap craftsmanship).",
  
  "RT.WeaponQuality.Unreliable2": "Unreliable (Severe)",
  "RT.WeaponQuality.Unreliable2Desc": "This weapon is extremely prone to jamming. It jams on a roll of 90 or higher (poor craftsmanship).",
  
  "RT.WeaponQuality.NeverJam": "Never Jams",
  "RT.WeaponQuality.NeverJamDesc": "This weapon is of such high quality that it never jams or overheats (best or master-crafted).",
  
  "RT.WeaponQuality.Overheats": "Overheats",
  "RT.WeaponQuality.OverheatsDesc": "On a roll of 91 or higher, this weapon overheats and cannot be fired until it cools (one round). Best or master-crafted versions do not overheat.",
  
  "RT.Craftsmanship.Poor": "Poor",
  "RT.Craftsmanship.Cheap": "Cheap",
  "RT.Craftsmanship.Common": "Common",
  "RT.Craftsmanship.Good": "Good",
  "RT.Craftsmanship.Best": "Best",
  "RT.Craftsmanship.MasterCrafted": "Master-Crafted"
}
```

---

## 🎯 Revised Success Criteria

✅ **Craftsmanship Integration**:
- Weapons compute `effectiveSpecial` from base + craftsmanship
- Poor/Cheap weapons auto-gain "unreliable" variants
- Good weapons auto-gain "reliable"
- Best/Master weapons immune to jamming/overheating
- Craftsmanship stat modifiers computed (WS/BS/damage)

✅ **Display**:
- Weapon sheet shows **3 sections**: Base Qualities, Craftsmanship Qualities, Effective Qualities
- Visual distinction (colors, icons) between quality sources
- Craftsmanship banner shows modifiers

✅ **Roll Integration**:
- Attack rolls check jam threshold based on effective qualities
- Jam notifications show threshold and cause
- Best/Master weapons skip jam checks entirely

✅ **Migration**:
- Pack data cleaned of duplicate craftsmanship qualities
- No "reliable" stored if craftsmanship="good"
- No "unreliable" stored if craftsmanship="cheap/poor"

---

## 📌 Summary

**The craftsmanship system is integral to weapon qualities and MUST be implemented alongside the quality refactor.** 

Key changes from original plan:
1. Rename `special` → `baseSpecial` (pack data only)
2. Add `effectiveSpecial` getter (base + craftsmanship)
3. Add `craftsmanshipModifiers` getter (stat bonuses)
4. Add 2 new quality definitions (unreliable-2, never-jam)
5. Clean pack data of craftsmanship-derived qualities
6. Update templates to show quality sources
7. Integrate jam checks into roll handlers

This addendum supersedes relevant sections of the main deep dive document.
