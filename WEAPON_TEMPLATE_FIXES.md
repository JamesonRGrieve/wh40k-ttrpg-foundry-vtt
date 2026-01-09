# Weapon Template Modernization Plan

## Overview

After migrating pack data, templates still reference old flat structure. This causes `[object Object]` displays.

**Status**: Ready to implement (do AFTER pack migration)  
**Files to Update**: 6 template files + 1 helper file  
**Impact**: Fixes all weapon display issues  

---

## File Updates Required

### 1. templates/actor/panel/weapon-panel.hbs

**Problem**: Uses flat `item.system.damage`, `item.system.range`, etc.

**Current (BROKEN)**:
```handlebars
<span class="rt-field__span">{{item.system.damage}}</span>         <!-- [object Object] -->
<span class="rt-field__span">{{item.system.damageType}}</span>     <!-- [object Object] -->
<span class="rt-field__span">{{item.system.range}}</span>          <!-- [object Object] -->
<span class="rt-field__span">{{rateOfFireDisplay item.system.rateOfFire}}</span>
<span class="rt-field__span">{{item.system.clip.value}} / {{item.system.clip.max}}</span>
```

**Fixed**:
```handlebars
<span class="rt-field__span">{{weapon.system.damageLabel}}</span>
<span class="rt-field__span">{{weapon.system.damageTypeLabel}}</span>
<span class="rt-field__span">{{weapon.system.rangeLabel}}</span>
<span class="rt-field__span">{{weapon.system.rateOfFireLabel}}</span>
<span class="rt-field__span">{{weapon.system.clip.value}}/{{weapon.system.clip.max}}</span>
```

**Changes**:
1. Replace all `{{item.system.damage}}` with `{{weapon.system.damageLabel}}`
2. Replace all `{{item.system.range}}` with `{{weapon.system.rangeLabel}}`
3. Replace `{{rateOfFireDisplay ...}}` with `{{weapon.system.rateOfFireLabel}}`
4. Keep `{{weapon.system.clip.value}}` (already correct path)
5. Add ammo warning color: `{{#if weapon.system.isOutOfAmmo}}rt-text-danger{{/if}}`

### 2. templates/item/item-weapon-sheet-modern.hbs

**Problem**: Input fields point to flat paths

**Current (BROKEN)**:
```handlebars
<input name="system.damage" value="{{item.system.damage}}" />
<select name="system.damageType">...</select>
<input name="system.penetration" value="{{item.system.penetration}}" />
<input name="system.range" value="{{item.system.range}}" />
```

**Fixed**:
```handlebars
<input name="system.damage.formula" value="{{item.system.damage.formula}}" />
<select name="system.damage.type">...</select>
<input name="system.damage.penetration" value="{{item.system.damage.penetration}}" />
<input name="system.attack.range.value" value="{{item.system.attack.range.value}}" />
<input name="system.attack.range.special" value="{{item.system.attack.range.special}}" />
```

**Changes**:
1. Update ALL input `name` attributes to nested paths
2. Update ALL input `value` attributes to nested paths
3. Split range into numeric + special inputs
4. Add RoF checkboxes/inputs for single/semi/full
5. Update damage type select to use lowercase options

### 3. templates/actor/acolyte/tab-equipment.hbs (if exists)

**Check**: Does equipment tab display weapon stats?

**If yes**: Apply same fixes as weapon-panel.hbs

### 4. templates/actor/panel/combat-station-panel.hbs

**Problem**: Combat tab weapon display uses flat paths

**Changes**: Same as weapon-panel.hbs

### 5. templates/chat/weapon-card.hbs (needs creation)

**Purpose**: Display weapon in chat with attack button

**Content**:
```handlebars
<div class="rt-chat-card rt-weapon-card">
    <header class="rt-card-header">
        <img src="{{item.img}}" alt="{{item.name}}" />
        <div class="rt-card-title">
            <h3>{{item.name}}</h3>
            <span class="rt-card-subtitle">{{item.system.classLabel}} {{item.system.typeLabel}}</span>
        </div>
    </header>
    
    <div class="rt-card-body">
        <div class="rt-card-stats rt-card-stats--grid-3">
            <div class="rt-stat">
                <span class="rt-stat__label">Damage</span>
                <span class="rt-stat__value rt-stat__value--damage">
                    {{item.system.damageLabel}}
                </span>
            </div>
            <div class="rt-stat">
                <span class="rt-stat__label">Pen</span>
                <span class="rt-stat__value">{{item.system.damage.penetration}}</span>
            </div>
            <div class="rt-stat">
                <span class="rt-stat__label">Range</span>
                <span class="rt-stat__value">{{item.system.rangeLabel}}</span>
            </div>
            <div class="rt-stat">
                <span class="rt-stat__label">RoF</span>
                <span class="rt-stat__value">{{item.system.rateOfFireLabel}}</span>
            </div>
            <div class="rt-stat">
                <span class="rt-stat__label">Type</span>
                <span class="rt-stat__value">{{item.system.damageTypeLabel}}</span>
            </div>
            {{#if item.system.usesAmmo}}
            <div class="rt-stat">
                <span class="rt-stat__label">Clip</span>
                <span class="rt-stat__value {{#if item.system.isOutOfAmmo}}rt-text-danger{{/if}}">
                    {{item.system.clip.value}}/{{item.system.clip.max}}
                </span>
            </div>
            {{/if}}
        </div>
        
        {{#if item.system.special.size}}
        <div class="rt-card-section">
            <h4>Special Qualities</h4>
            <div class="rt-tags">
                {{#each (setToArray item.system.special) as |special|}}
                <span class="rt-tag rt-tag--special">{{special}}</span>
                {{/each}}
            </div>
        </div>
        {{/if}}
        
        {{#if item.system.description.value}}
        <div class="rt-card-section rt-card-section--description">
            {{{item.system.description.value}}}
        </div>
        {{/if}}
    </div>
    
    {{#if actor}}
    <footer class="rt-card-footer">
        <button class="rt-btn rt-btn--primary rt-btn--attack" 
                data-action="weaponAttack" 
                data-item-id="{{item.id}}">
            <i class="fas fa-crosshairs"></i> Attack
        </button>
        {{#if item.system.usesAmmo}}
        <button class="rt-btn rt-btn--secondary" 
                data-action="weaponReload" 
                data-item-id="{{item.id}}">
            <i class="fas fa-sync"></i> Reload
        </button>
        {{/if}}
    </footer>
    {{/if}}
</div>
```

### 6. templates/prompt/weapon-roll-prompt.hbs

**Problem**: Attack dialog reads flat structure

**Changes**: Update all data access to nested paths

---

## Handlebars Helper Updates

### src/module/handlebars/handlebars-helpers.mjs

**Remove Deprecated Helpers**:
```javascript
// DELETE THESE (no longer needed):
Handlebars.registerHelper('rateOfFireDisplay', function(rof) { ... });
Handlebars.registerHelper('specialDisplay', function(special) { ... });
```

**Add New Helper**:
```javascript
/**
 * Convert Set to Array for Handlebars iteration
 * (Sets don't iterate properly in templates)
 */
Handlebars.registerHelper('setToArray', function(set) {
  return set ? Array.from(set) : [];
});
```

---

## WeaponData Computed Properties

**Already exist** (defined in weapon.mjs):

```javascript
// These work after migration:
weapon.system.damageLabel       // "1d10+3 E"
weapon.system.rangeLabel        // "30m" or "SBx3"
weapon.system.rateOfFireLabel   // "S/2/-"
weapon.system.classLabel        // "Pistol"
weapon.system.typeLabel         // "Las"
weapon.system.damageTypeLabel   // "Energy"
weapon.system.reloadLabel       // "Full Action"
weapon.system.isRangedWeapon    // true/false
weapon.system.isMeleeWeapon     // true/false
weapon.system.usesAmmo          // true/false
weapon.system.isOutOfAmmo       // true/false
```

---

## Implementation Steps

### Step 1: Update weapon-panel.hbs
```bash
# Edit file
vim src/templates/actor/panel/weapon-panel.hbs

# Find/replace:
# {{item.system.damage}} → {{weapon.system.damageLabel}}
# {{item.system.range}} → {{weapon.system.rangeLabel}}
# {{rateOfFireDisplay item.system.rateOfFire}} → {{weapon.system.rateOfFireLabel}}
```

### Step 2: Update item-weapon-sheet-modern.hbs
```bash
# Edit file
vim src/templates/item/item-weapon-sheet-modern.hbs

# Update all name attributes:
# name="system.damage" → name="system.damage.formula"
# name="system.damageType" → name="system.damage.type"
# name="system.penetration" → name="system.damage.penetration"
# name="system.range" → name="system.attack.range.value"
```

### Step 3: Create weapon-card.hbs
```bash
# Create new file
vim src/templates/chat/weapon-card.hbs

# Paste content from section 5 above
```

### Step 4: Update handlebars-helpers.mjs
```bash
# Edit file
vim src/module/handlebars/handlebars-helpers.mjs

# Remove deprecated helpers
# Add setToArray helper
```

### Step 5: Test
```bash
# Rebuild
npm run build

# Start Foundry
# Check weapon panel
# Check weapon sheet
# Check chat cards
```

---

## Testing Checklist

After template updates:

### Actor Sheet
- [ ] Weapon panel shows damage correctly (not [object Object])
- [ ] Weapon panel shows range correctly
- [ ] Weapon panel shows RoF correctly
- [ ] Clip display shows current/max
- [ ] Out-of-ammo weapons show red text
- [ ] Click weapon name expands details
- [ ] Special qualities display as tags

### Item Sheet
- [ ] Damage formula input shows value
- [ ] Damage type dropdown works
- [ ] Penetration input shows value
- [ ] Range inputs show numeric/special values
- [ ] RoF inputs show single/semi/full
- [ ] Clip inputs show current/max
- [ ] Reload dropdown shows options
- [ ] All fields save correctly

### Chat Cards
- [ ] Weapon cards render properly
- [ ] All stats display correctly
- [ ] Special qualities show as tags
- [ ] Attack button appears
- [ ] Reload button appears (if ammo weapon)

### Compendium Browser
- [ ] Weapon list shows correct columns
- [ ] Damage column shows formatted damage
- [ ] Range column shows range label
- [ ] Filters work
- [ ] Sorting works

---

## Quick Reference: Field Mappings

| Old Path | New Path | Type |
|----------|----------|------|
| `system.damage` | `system.damage.formula` | string |
| `system.damageType` | `system.damage.type` | string (lowercase) |
| `system.penetration` | `system.damage.penetration` | number |
| `system.range` | `system.attack.range.value` + `.special` | object |
| `system.rof` | `system.attack.rateOfFire.*` | object |
| `system.clip` | `system.clip.{max,value,type}` | object |
| `system.special` | `system.special` | Set (array in JSON) |

---

## Display Properties to Use

| Display Need | Property to Use | Example Output |
|--------------|-----------------|----------------|
| Damage | `damageLabel` | "1d10+3 E" |
| Damage Type | `damageTypeLabel` | "Energy" |
| Penetration | `damage.penetration` | 2 |
| Range | `rangeLabel` | "30m" or "SBx3" |
| Rate of Fire | `rateOfFireLabel` | "S/2/-" |
| Weapon Class | `classLabel` | "Pistol" |
| Weapon Type | `typeLabel` | "Las" |
| Reload Time | `reloadLabel` | "Full Action" |
| Clip Status | `clip.value` + `clip.max` | "14/14" |

---

## Estimated Time

**Per File**: 10-15 minutes  
**Total Time**: ~1.5 hours  
- weapon-panel.hbs: 20 minutes
- item-weapon-sheet-modern.hbs: 30 minutes
- weapon-card.hbs: 20 minutes (creation)
- Other panels: 10 minutes each
- handlebars-helpers.mjs: 5 minutes
- Testing: 15 minutes

---

## Rollout Order

1. ✅ Migrate pack data (already done)
2. 🔧 Update weapon-panel.hbs (most visible impact)
3. 🔧 Update item-weapon-sheet-modern.hbs (editing)
4. 🔧 Create weapon-card.hbs (chat)
5. 🔧 Update other weapon displays
6. 🔧 Update handlebars helpers
7. ✅ Test all scenarios
8. 📝 Commit changes

---

## Success Criteria

✅ No more `[object Object]` in weapon displays  
✅ All weapon stats show correct values  
✅ Weapon sheet inputs work properly  
✅ Chat cards render beautifully  
✅ Compendium browser displays correctly  
✅ No console errors  

---

## Notes

- **DO NOT** run templates before pack migration (will break worse)
- **DO** test each template individually
- **DO** check both actor sheet and item sheet
- **DO** verify chat cards work
- **DO** test with multiple weapon types (melee, ranged, thrown)

---

Ready to implement after pack migration succeeds! 🎨
