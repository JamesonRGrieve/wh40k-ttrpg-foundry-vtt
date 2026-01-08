# Advanced Tooltip System with Enrichers - Implementation Guide

**Status**: ✅ Complete  
**Date**: 2026-01-08  
**Priority**: Item 19 (Long-term Strategic)

---

## Overview

The Rogue Trader system now features a comprehensive enricher system for inline content with click-to-roll functionality and rich tooltips. This allows GMs and players to embed interactive elements directly in text fields (descriptions, journals, chat messages, etc.).

---

## Features

### Text Enrichers

#### 1. Characteristic Enrichers
Embed clickable characteristic references with automatic tooltips and roll functionality.

**Syntax**:
```
[[/characteristic ws]]              // Weapon Skill (short code)
[[/characteristic weaponSkill]]     // Weapon Skill (full name)
[[/characteristic bs]]{BS Test}     // Custom label
```

**Short Codes**: `ws`, `bs`, `s`, `t`, `ag`, `int`, `per`, `wp`, `fel`

**Features**:
- Shows characteristic value and bonus
- Click to roll characteristic test
- Tooltip displays breakdown (base, advances, modifiers, bonus)
- Gold accent color

#### 2. Skill Enrichers
Embed clickable skill references with specialization support.

**Syntax**:
```
[[/skill dodge]]                           // Basic skill
[[/skill commonLore:imperium]]             // Specialist skill with spec
[[/skill acrobatics]]{Acrobatics Check}    // Custom label
```

**Features**:
- Shows skill value percentage
- Click to roll skill test
- Supports specialist skills with specializations
- Tooltip displays training level and modifiers
- Skills accent color

#### 3. Modifier Enrichers
Display stat modifiers with color-coded values.

**Syntax**:
```
[[/modifier strength +10]]          // Positive modifier
[[/modifier agility -5]]            // Negative modifier
[[/modifier willpower +15]]{WP}     // Custom label
```

**Features**:
- Green for positive, red for negative
- Up/down arrow icons
- Display-only (no click action)
- Compact inline display

#### 4. Armor Enrichers
Display armor protection values.

**Syntax**:
```
[[/armor head]]                     // Single location
[[/armor all]]                      // All locations (range)
[[/armor body]]{Body AP}            // Custom label
```

**Locations**: `head`, `body`, `leftArm`, `rightArm`, `leftLeg`, `rightLeg`, `all`

**Features**:
- Shows AP value
- Tooltip displays breakdown (TB, armor value, trait bonuses)
- Display-only (no click action)
- Combat accent color

---

## Usage Examples

### In Item Descriptions

```handlebars
**Crimson Guard Power Armor**

This ancient suit provides [[/armor all]] protection across all locations. 
When worn, it grants [[/modifier strength +20]] to all Strength tests.

To don the armor requires a [[/skill tech-use]] test at -10.
```

### In Character Biography

```markdown
# Combat Abilities

Marcus excels in close combat with [[/characteristic ws]] of 45 and [[/skill parry]] 
at 50%. His powered gauntlets add [[/modifier strength +15]] when grappling.

His armor provides [[/armor head]] protection to the head and [[/armor body]] to the torso.
```

### In Journal Entries

```markdown
## Skill Challenge

To navigate the asteroid field, the pilot must succeed on a [[/skill pilot:spacecraft]] 
test. The dense debris field imposes [[/modifier agility -20]].

Characters with [[/characteristic per]] over 40 can spot the safe corridor automatically.
```

### In Chat Messages

```javascript
ChatMessage.create({
    content: `The ritual requires a [[/skill forbidden-lore:daemonology]] test with 
    [[/modifier willpower -30]] due to the warp's influence.`
});
```

---

## Technical Implementation

### Enricher Registration

```javascript
// In enrichers.mjs
CONFIG.TextEditor.enrichers.push({
    pattern: /\[\[\/characteristic (?<config>[^\]]+)]](?:{(?<label>[^}]+)})?/gi,
    enricher: enrichCharacteristic
});
```

### Enricher Function

```javascript
async function enrichCharacteristic(match, options) {
    let { config, label } = match.groups;
    const actor = options.relativeTo;
    
    // Get characteristic data
    const charData = actor.system.characteristics?.[charKey];
    
    // Create enriched element
    const span = document.createElement("span");
    span.className = "rt-enricher rt-enricher-characteristic";
    span.dataset.enricherType = "characteristic";
    span.dataset.actorUuid = actor.uuid;
    span.innerHTML = `<i class="fas fa-dice-d20"></i> ${displayLabel}`;
    
    return span;
}
```

### Click Handler

```javascript
document.body.addEventListener("click", async (event) => {
    const enricher = event.target.closest(".rt-enricher");
    if (!enricher) return;
    
    const actor = await fromUuid(enricher.dataset.actorUuid);
    const type = enricher.dataset.enricherType;
    
    switch (type) {
        case "characteristic":
            await actor.rollCharacteristic(config);
            break;
        case "skill":
            await actor.rollSkill(skillKey, specialization);
            break;
    }
});
```

---

## Styling

### Enricher Base Styles

```scss
.rt-enricher {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s ease;
  
  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  }
}
```

### Type-Specific Colors

| Type | Background | Border | Icon |
|------|-----------|--------|------|
| Characteristic | Gold (15% opacity) | Gold (30% opacity) | Gold |
| Skill | Skills accent (15%) | Skills accent (30%) | Skills accent |
| Modifier (+) | Success green (15%) | Success green (30%) | Green |
| Modifier (-) | Combat red (15%) | Combat red (30%) | Red |
| Armor | Combat red (15%) | Combat red (30%) | Combat red |

---

## Integration with Existing Systems

### Works With:
- ✅ ProseMirror rich text editor (Biography tab)
- ✅ Item descriptions (all item types)
- ✅ Journal entries
- ✅ Chat messages
- ✅ Active effect descriptions
- ✅ Talent/trait descriptions

### Context Requirements:
- Enrichers require `relativeTo: actor` in TextEditor options
- Without actor context, displays error element
- Actor must have appropriate data fields (characteristics, skills, etc.)

---

## Error Handling

### Error Element Display

```html
<span class="rt-enricher rt-enricher-error" title="No actor context">
    [[/characteristic ws]]
</span>
```

**Error Types**:
- No actor context
- Unknown characteristic/skill
- Invalid modifier format
- Missing armor data
- Unknown armor location

---

## Existing Tooltip System

The RTTooltip system (583 lines) is **preserved** and **enhanced** for hover-based tooltips. It provides:

- Characteristic breakdowns (base, advances, modifiers, bonus)
- Skill calculations (characteristic, training, modifiers)
- Armor details (AP, TB, trait bonuses)
- Weapon statistics
- Modifier source attribution

**Usage**:
```html
<div data-rt-tooltip="characteristic" 
     data-rt-tooltip-data="{{tooltipData}}">
    Weapon Skill: 45
</div>
```

The enricher system **complements** the tooltip system by providing inline interactive elements.

---

## File Changes

### New Files

| File | Description | Lines |
|------|-------------|-------|
| `src/module/enrichers.mjs` | Enricher registration and handlers | 340 |
| `src/scss/components/_enrichers.scss` | Enricher styling | 170 |

### Modified Files

| File | Changes |
|------|---------|
| `src/module/rogue-trader.mjs` | Import and register enrichers |
| `src/scss/rogue-trader.scss` | Import enricher styles |

**Total**: ~510 lines of code

---

## Performance Considerations

- Enrichers are processed during TextEditor.enrichHTML() calls
- Pattern matching uses optimized regex
- Click handlers use event delegation (single listener on document.body)
- Actor UUID lookup is cached by Foundry
- No performance impact on sheets without enriched content

---

## Testing Checklist

- [x] Characteristic enrichers render with correct styling
- [x] Clicking characteristic enrichers triggers rolls
- [x] Skill enrichers work for basic skills
- [x] Skill enrichers work for specialist skills with specs
- [x] Modifier enrichers display positive/negative correctly
- [x] Armor enrichers show correct AP values
- [x] Error elements display for invalid syntax
- [x] Enrichers work in ProseMirror editor
- [x] Enrichers work in item descriptions
- [x] Enrichers work in chat messages
- [x] Tooltips display on hover
- [x] Click-to-roll functions correctly

---

## Usage Examples (Real-World)

### Talent Description
```
**Master Orator**

When making [[/skill charm]] or [[/skill deceive]] tests in social situations, 
gain [[/modifier fellowship +10]]. This bonus increases to [[/modifier fellowship +20]] 
when addressing crowds of 10 or more.
```

### Item Effect
```
**Rosarius Force Field**

Provides [[/armor all]] 4+ invulnerable save. When activated, test [[/characteristic wp]]. 
Success grants [[/modifier willpower +10]] to resist psychic powers for 1 round.
```

### Journal Entry
```
**Infiltration Mission**

The team must use [[/skill stealth]] to bypass the guards. The main character needs 
[[/characteristic bs]] 40+ to disable the defense turret from range. Heavy armor 
([[/armor all]] 6+) imposes [[/modifier agility -20]] on all stealth tests.
```

---

## Future Enhancements

### Potential Additions
- Combat action enrichers (`[[/attack]]{Attack}`)
- Psychic power enrichers (`[[/power smite]]{Smite}`)
- Item link enrichers (`[[/gear]]{Laspistol}`)
- Condition enrichers (`[[/condition stunned]]`)
- Roll enrichers with inline modifiers (`[[/roll 1d100+10]]`)

### Integration Opportunities
- Auto-enrichment during item creation
- Template insertion in editors
- Context-aware suggestions
- Copy-paste preservation

---

## Comparison with dnd5e

| Feature | dnd5e | Rogue Trader |
|---------|-------|--------------|
| Attack enrichers | ✅ `[[/attack]]` | ❌ (future) |
| Damage enrichers | ✅ `[[/damage]]` | ❌ (future) |
| Skill enrichers | ✅ `[[/skill]]` | ✅ `[[/skill]]` |
| Save enrichers | ✅ `[[/save]]` | ❌ (N/A) |
| Check enrichers | ✅ `[[/check]]` | ❌ (future) |
| Custom enrichers | ✅ Multiple | ✅ 4 types |
| Characteristic enrichers | ❌ | ✅ `[[/characteristic]]` |
| Modifier enrichers | ❌ | ✅ `[[/modifier]]` |
| Armor enrichers | ❌ | ✅ `[[/armor]]` |

---

## References

- **Foundry V13 TextEditor API**: `CONFIG.TextEditor.enrichers`
- **EnrichmentOptions**: `{ relativeTo, secrets, rollData }`
- **dnd5e Enrichers**: `/home/aqui/dnd5e/module/enrichers.mjs`
- **RT Tooltip System**: `src/module/applications/components/rt-tooltip.mjs`

---

**Last Updated**: 2026-01-08  
**Implementation Time**: ~2 hours  
**Build Status**: ✅ Passing
