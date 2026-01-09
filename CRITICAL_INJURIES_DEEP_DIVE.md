# Critical Injuries System - Deep Dive Analysis & Refactor Plan

**Date**: 2026-01-09  
**Status**: 🔴 BROKEN - Multiple Issues Identified  
**Priority**: HIGH - Core combat feature broken

---

## 🎯 Executive Summary

The Critical Injuries system is **fundamentally broken** with data model mismatches, missing localization, template/schema discrepancies, and "Object [object]" display issues throughout. This document outlines a complete modern refactor following Foundry V13 best practices.

### Current Problems

1. **❌ Template.json vs DataModel Mismatch**
   - Template.json has `type` and `part` (legacy string fields)
   - DataModel has `damageType`, `bodyPart`, `severity`, `effect`, `permanent`, `notes`
   - Sheet template uses wrong field names

2. **❌ Missing Localization**
   - No `RT.DamageType.*` keys defined
   - No `RT.BodyPart.*` keys defined
   - No `RT.CriticalInjury.Permanent` key defined
   - Data model tries to localize non-existent keys → "Object [object]" errors

3. **❌ Legacy Sheet Template**
   - Still uses deprecated field names from template.json
   - No modern panel design
   - Missing proper form controls

4. **❌ No Pack Data**
   - No critical injury compendium pack exists
   - 234 lines of hardcoded critical tables in `critical-damage.mjs`
   - No way to drag/drop injuries onto characters

5. **❌ Display Issues**
   - `chatProperties` returns objects instead of strings
   - `headerLabels` returns objects instead of strings
   - Compendium browser shows "Object [object]"

---

## 📊 Current State Analysis

### Data Model (critical-injury.mjs)

**Schema (✅ GOOD - Modern V13)**:
```javascript
{
  identifier: IdentifierField,
  damageType: StringField { choices: ["impact", "rending", "explosive", "energy"] },
  bodyPart: StringField { choices: ["head", "arm", "body", "leg"] },
  severity: NumberField { min: 1, integer: true },
  effect: HTMLField { blank: true }, // Description of the injury effect
  permanent: BooleanField,
  notes: StringField { blank: true }
}
```

**Mixins**: ✅ DescriptionTemplate (provides `description` SchemaField and `source` SchemaField)

**Computed Properties**:
- ❌ `damageTypeLabel` - tries to localize undefined keys
- ❌ `bodyPartLabel` - tries to localize undefined keys
- ⚠️ `chatProperties` - returns label objects, not strings
- ⚠️ `headerLabels` - returns objects, causing display issues

### Template.json (❌ LEGACY SCHEMA)

```json
"criticalInjury": {
  "templates": ["itemDescription"],
  "type": "impact",     // ← Wrong field name (should be damageType)
  "part": "body"        // ← Wrong field name (should be bodyPart)
}
```

**Problem**: template.json has NOT been updated to match DataModel schema!

### Sheet Template (item-critical-injury-sheet.hbs)

**Current State (❌ BROKEN)**:
```handlebars
<input name="system.source" value="{{item.system.source}}" />  {{!-- ❌ Wrong - source is object}}
<input name="system.type" value="{{item.system.type}}" />      {{!-- ❌ Should be damageType}}
<input name="system.part" value="{{item.system.part}}" />      {{!-- ❌ Should be bodyPart}}
<textarea name="system.description">...</textarea>             {{!-- ❌ Wrong - description is object}}
```

### Critical Damage Tables (critical-damage.mjs)

**234 lines of hardcoded data**:
```javascript
export function criticalDamage() {
  return {
    "Energy": {
      "Arm": {
        1: 'The attack grazes the target's arm...',
        2: 'The attack smashes into the arm...',
        // ... up to 10
      },
      "Body": { ... },
      "Head": { ... },
      "Leg": { ... }
    },
    "Explosive": { ... },
    "Impact": { ... },
    "Rending": { ... }
  }
}
```

**Structure**: 4 damage types × 4 body parts × 10 severity levels = **160 injury variants**

---

## 🎨 Design Vision - Modern V13 System

### 1. Data Model Enhancements

**Current Schema**: ✅ Keep as-is (well-designed)

**New Computed Properties**:
```javascript
// Display labels (safe fallbacks)
get damageTypeLabel() {
  const key = `RT.DamageType.${this.damageType.capitalize()}`;
  return game.i18n.has(key) ? game.i18n.localize(key) : this.damageType.capitalize();
}

get bodyPartLabel() {
  const key = `RT.BodyPart.${this.bodyPart.capitalize()}`;
  return game.i18n.has(key) ? game.i18n.localize(key) : this.bodyPart.capitalize();
}

get severityLabel() {
  return `${game.i18n.localize("RT.CriticalInjury.Severity")}: ${this.severity}`;
}

// Chat display (return STRINGS, not objects)
get chatProperties() {
  const props = [
    this.damageTypeLabel,  // String
    this.bodyPartLabel,    // String
    this.severityLabel     // String
  ];
  
  if (this.permanent) {
    props.push(game.i18n.localize("RT.CriticalInjury.Permanent"));
  }
  
  return props;
}

// Header labels (return flat structure)
get headerLabels() {
  return {
    type: this.damageTypeLabel,      // String
    location: this.bodyPartLabel,    // String
    severity: `${this.severity}/10`  // String
  };
}

// Full injury description (combines effect + notes)
get fullDescription() {
  let desc = this.effect || "";
  if (this.notes) {
    desc += desc ? `\n\n<strong>Notes:</strong> ${this.notes}` : this.notes;
  }
  return desc;
}

// Icon selection based on damage type
get damageTypeIcon() {
  const icons = {
    impact: "fa-hammer",
    rending: "fa-cut",
    explosive: "fa-bomb",
    energy: "fa-bolt"
  };
  return icons[this.damageType] || "fa-band-aid";
}

// Body part icon
get bodyPartIcon() {
  const icons = {
    head: "fa-head-side-brain",
    arm: "fa-hand-paper",
    body: "fa-user",
    leg: "fa-shoe-prints"
  };
  return icons[this.bodyPart] || "fa-user";
}

// Severity color coding
get severityClass() {
  if (this.severity <= 3) return "severity-minor";
  if (this.severity <= 6) return "severity-moderate";
  if (this.severity <= 9) return "severity-severe";
  return "severity-fatal";
}
```

### 2. Localization (en.json)

**Add ALL missing keys**:
```json
{
  "RT.DamageType": {
    "Label": "Damage Type",
    "Impact": "Impact",
    "Rending": "Rending",
    "Explosive": "Explosive",
    "Energy": "Energy"
  },
  
  "RT.BodyPart": {
    "Label": "Body Location",
    "Head": "Head",
    "Arm": "Arm",
    "Body": "Body",
    "Leg": "Leg"
  },
  
  "RT.CriticalInjury": {
    "Label": "Critical Injury",
    "Severity": "Severity",
    "Permanent": "Permanent",
    "Effect": "Effect",
    "Notes": "Notes",
    "DamageType": "Damage Type",
    "BodyPart": "Body Location",
    "Create": "Create Critical Injury",
    "Edit": "Edit Critical Injury",
    "Delete": "Delete Critical Injury",
    "None": "No critical injuries",
    "Add": "Add Injury",
    "SeverityLevels": {
      "1": "Minor",
      "2-3": "Light",
      "4-6": "Moderate",
      "7-9": "Severe",
      "10": "Fatal"
    }
  }
}
```

### 3. Template.json Update

**Replace legacy schema**:
```json
"criticalInjury": {
  "templates": ["itemDescription"],
  "identifier": "",
  "damageType": "impact",
  "bodyPart": "body",
  "severity": 1,
  "effect": "",
  "permanent": false,
  "notes": ""
}
```

### 4. Modern Sheet Template

**New Design (item-critical-injury-sheet-v2.hbs)**:

```handlebars
{{!-- Modern Critical Injury Sheet --}}
<form class="rt-item-sheet rt-injury-sheet" autocomplete="off">
  
  {{!-- Header with Image and Title --}}
  <div class="rt-item-sheet__header">
    <div class="rt-item-sheet__image-wrapper">
      <img class="rt-item-sheet__image" 
           src="{{item.img}}" 
           data-edit="img" 
           alt="{{item.name}}" />
      <i class="fas {{item.system.damageTypeIcon}} rt-damage-icon"></i>
    </div>
    
    <div class="rt-item-sheet__title-area">
      <input class="rt-item-sheet__name-input" 
             name="name" 
             type="text" 
             value="{{item.name}}" 
             placeholder="Injury Name" />
      
      <div class="rt-injury-badges">
        <span class="rt-badge rt-badge--{{item.system.severityClass}}">
          {{item.system.severityLabel}}
        </span>
        {{#if item.system.permanent}}
        <span class="rt-badge rt-badge--permanent">
          <i class="fas fa-infinity"></i> Permanent
        </span>
        {{/if}}
      </div>
    </div>
  </div>
  
  {{!-- Main Panel - Injury Details --}}
  <div class="rt-item-sheet__panel">
    <div class="rt-injury-grid">
      
      {{!-- Damage Type --}}
      <div class="rt-field">
        <label class="rt-field__label">
          <i class="fas {{item.system.damageTypeIcon}}"></i>
          {{localize "RT.CriticalInjury.DamageType"}}
        </label>
        <select class="rt-field__select" name="system.damageType" data-dtype="String">
          {{#select item.system.damageType}}
          <option value="impact">{{localize "RT.DamageType.Impact"}}</option>
          <option value="rending">{{localize "RT.DamageType.Rending"}}</option>
          <option value="explosive">{{localize "RT.DamageType.Explosive"}}</option>
          <option value="energy">{{localize "RT.DamageType.Energy"}}</option>
          {{/select}}
        </select>
      </div>
      
      {{!-- Body Part --}}
      <div class="rt-field">
        <label class="rt-field__label">
          <i class="fas {{item.system.bodyPartIcon}}"></i>
          {{localize "RT.CriticalInjury.BodyPart"}}
        </label>
        <select class="rt-field__select" name="system.bodyPart" data-dtype="String">
          {{#select item.system.bodyPart}}
          <option value="head">{{localize "RT.BodyPart.Head"}}</option>
          <option value="arm">{{localize "RT.BodyPart.Arm"}}</option>
          <option value="body">{{localize "RT.BodyPart.Body"}}</option>
          <option value="leg">{{localize "RT.BodyPart.Leg"}}</option>
          {{/select}}
        </select>
      </div>
      
      {{!-- Severity --}}
      <div class="rt-field">
        <label class="rt-field__label">
          <i class="fas fa-chart-line"></i>
          {{localize "RT.CriticalInjury.Severity"}}
        </label>
        <input class="rt-field__input" 
               type="number" 
               name="system.severity" 
               value="{{item.system.severity}}" 
               min="1" 
               max="10"
               data-dtype="Number" />
      </div>
      
      {{!-- Permanent Checkbox --}}
      <div class="rt-field rt-field--checkbox">
        <label class="rt-field__label">
          <input type="checkbox" 
                 name="system.permanent" 
                 {{checked item.system.permanent}} />
          <span>{{localize "RT.CriticalInjury.Permanent"}}</span>
        </label>
      </div>
    </div>
  </div>
  
  {{!-- Effect Description (Rich HTML) --}}
  <div class="rt-item-sheet__panel">
    <div class="rt-field">
      <label class="rt-field__label">
        <i class="fas fa-file-medical"></i>
        {{localize "RT.CriticalInjury.Effect"}}
      </label>
      {{editor item.system.effect 
               target="system.effect" 
               button=true 
               editable=isEditable 
               engine="prosemirror"}}
    </div>
  </div>
  
  {{!-- Notes Field --}}
  <div class="rt-item-sheet__panel">
    <div class="rt-field">
      <label class="rt-field__label">
        <i class="fas fa-sticky-note"></i>
        {{localize "RT.CriticalInjury.Notes"}}
      </label>
      <textarea class="rt-field__textarea" 
                name="system.notes" 
                rows="3"
                placeholder="Additional notes...">{{item.system.notes}}</textarea>
    </div>
  </div>
  
  {{!-- Source Reference --}}
  <div class="rt-item-sheet__panel rt-source-panel">
    <div class="rt-field">
      <label class="rt-field__label">
        <i class="fas fa-book"></i>
        Source Book
      </label>
      <input class="rt-field__input" 
             name="system.source.book" 
             type="text" 
             value="{{item.system.source.book}}" 
             placeholder="Rogue Trader Core" />
    </div>
    
    <div class="rt-field">
      <label class="rt-field__label">Page</label>
      <input class="rt-field__input rt-field__input--short" 
             name="system.source.page" 
             type="text" 
             value="{{item.system.source.page}}" 
             placeholder="254" />
    </div>
    
    <div class="rt-field">
      <label class="rt-field__label">Custom Reference</label>
      <input class="rt-field__input" 
             name="system.source.custom" 
             type="text" 
             value="{{item.system.source.custom}}" 
             placeholder="Homebrew / Variant" />
    </div>
  </div>
  
  {{!-- Description (Legacy field for chat display) --}}
  <div class="rt-item-sheet__panel">
    <div class="rt-field">
      <label class="rt-field__label">
        <i class="fas fa-align-left"></i>
        Description (for chat)
      </label>
      {{editor item.system.description.value 
               target="system.description.value" 
               button=true 
               editable=isEditable 
               engine="prosemirror"}}
    </div>
  </div>
</form>
```

### 5. Pack Data Generation

**Create**: `src/packs/rt-items-critical-injuries/`

**Script to Generate 160 Injury Items**:

```javascript
// scripts/generate-critical-injuries.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { criticalDamage } from '../src/module/rules/critical-damage.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, '../src/packs/rt-items-critical-injuries/_source');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Mapping for body part naming
const bodyPartMap = {
  "Arm": "arm",
  "Body": "body",
  "Head": "head",
  "Leg": "leg"
};

// Mapping for damage type naming
const damageTypeMap = {
  "Energy": "energy",
  "Explosive": "explosive",
  "Impact": "impact",
  "Rending": "rending"
};

// Icon mapping
const damageIcons = {
  impact: "systems/rogue-trader/icons/injuries/impact.svg",
  rending: "systems/rogue-trader/icons/injuries/rending.svg",
  explosive: "systems/rogue-trader/icons/injuries/explosive.svg",
  energy: "systems/rogue-trader/icons/injuries/energy.svg"
};

// Get critical damage tables
const tables = criticalDamage();

let count = 0;

// Iterate through all combinations
for (const [damageTypeName, bodyParts] of Object.entries(tables)) {
  const damageType = damageTypeMap[damageTypeName];
  
  for (const [bodyPartName, severities] of Object.entries(bodyParts)) {
    const bodyPart = bodyPartMap[bodyPartName];
    
    for (const [severity, effect] of Object.entries(severities)) {
      const severityNum = parseInt(severity);
      
      // Generate item name
      const name = `${damageTypeName} ${bodyPartName} Critical ${severityNum}`;
      
      // Generate unique ID
      const id = `${damageType}_${bodyPart}_${severity}_${foundry.utils.randomID(8)}`;
      
      // Determine if permanent (severity 7+)
      const permanent = severityNum >= 7;
      
      // Create item data
      const itemData = {
        name: name,
        type: "criticalInjury",
        img: damageIcons[damageType] || "icons/svg/blood.svg",
        system: {
          identifier: `crit_${damageType}_${bodyPart}_${severity}`,
          damageType: damageType,
          bodyPart: bodyPart,
          severity: severityNum,
          effect: `<p>${effect}</p>`,
          permanent: permanent,
          notes: "",
          description: {
            value: `<p><strong>${damageTypeName} Damage to ${bodyPartName} (Severity ${severityNum})</strong></p><p>${effect}</p>`,
            chat: "",
            summary: `${damageTypeName} ${bodyPartName} injury`
          },
          source: {
            book: "Rogue Trader Core Rulebook",
            page: "254-257",
            custom: ""
          }
        },
        effects: [],
        flags: {
          rt: {
            generated: true,
            version: "1.0"
          }
        },
        _id: id
      };
      
      // Write to file
      const filename = `${name.toLowerCase().replace(/\s+/g, '-')}_${id}.json`;
      const filepath = path.join(outputDir, filename);
      fs.writeFileSync(filepath, JSON.stringify(itemData, null, 2));
      
      count++;
    }
  }
}

console.log(`✅ Generated ${count} critical injury items in ${outputDir}`);
```

**Run**:
```bash
node scripts/generate-critical-injuries.mjs
```

### 6. System.json Pack Registration

**Add to packs array**:
```json
{
  "name": "rt-items-critical-injuries",
  "label": "Critical Injuries",
  "path": "packs/rt-items-critical-injuries",
  "system": "rogue-trader",
  "type": "Item",
  "ownership": {
    "PLAYER": "OBSERVER",
    "ASSISTANT": "OWNER"
  },
  "flags": {
    "rt": {
      "types": ["criticalInjury"]
    }
  }
}
```

**Add to folder groups**:
```json
{
  "name": "Combat",
  "color": "#8B0000",
  "sorting": "a",
  "packs": [
    "rt-items-critical-injuries",
    "rt-items-conditions"
  ]
}
```

### 7. Compendium Browser Enhancements

**Update `_getEntrySource()` to handle source objects**:

```javascript
_getEntrySource(entry) {
  const source = entry.system?.source;
  
  // Handle object source (new format)
  if (typeof source === 'object' && source !== null) {
    const { book, page, custom } = source;
    if (custom) return custom;
    if (book && page) return `${book}, p.${page}`;
    if (book) return book;
    return "";
  }
  
  // Handle string source (legacy)
  return source || "";
}
```

**Add injury-specific display metadata**:

```javascript
async _prepareItemDisplay(item) {
  const display = {
    uuid: item.uuid,
    name: item.name,
    img: item.img,
    type: game.i18n.localize(CONFIG.Item.typeLabels[item.type] || item.type),
    pack: item.pack?.metadata?.label || "",
    sourceLabel: this._getEntrySource(item)
  };
  
  // Add critical injury specific badges
  if (item.type === "criticalInjury") {
    const system = item.system;
    display.badges = [
      {
        label: system.damageTypeLabel || system.damageType,
        icon: system.damageTypeIcon || "fa-band-aid",
        class: `badge-${system.damageType}`
      },
      {
        label: system.bodyPartLabel || system.bodyPart,
        icon: system.bodyPartIcon || "fa-user",
        class: "badge-body-part"
      },
      {
        label: `Severity ${system.severity}`,
        icon: "fa-chart-line",
        class: system.severityClass || "severity-moderate"
      }
    ];
    
    if (system.permanent) {
      display.badges.push({
        label: "Permanent",
        icon: "fa-infinity",
        class: "badge-permanent"
      });
    }
  }
  
  return display;
}
```

### 8. Chat Card Template

**Create `templates/chat/critical-injury-card.hbs`**:

```handlebars
{{!-- Critical Injury Chat Card --}}
<div class="rt-chat-card rt-injury-card">
  <header class="rt-card-header rt-card-header--{{damageType}}">
    <img src="{{img}}" alt="{{name}}" class="rt-card-icon" />
    <div class="rt-card-title-area">
      <h3 class="rt-card-title">{{name}}</h3>
      <div class="rt-card-badges">
        <span class="rt-badge rt-badge--{{severityClass}}">
          <i class="fas fa-chart-line"></i> Severity {{severity}}
        </span>
        {{#if permanent}}
        <span class="rt-badge rt-badge--permanent">
          <i class="fas fa-infinity"></i> Permanent
        </span>
        {{/if}}
      </div>
    </div>
  </header>
  
  <div class="rt-card-body">
    <div class="rt-injury-meta">
      <span class="rt-meta-item">
        <i class="fas {{damageTypeIcon}}"></i>
        {{damageTypeLabel}}
      </span>
      <span class="rt-meta-item">
        <i class="fas {{bodyPartIcon}}"></i>
        {{bodyPartLabel}}
      </span>
    </div>
    
    <div class="rt-injury-effect">
      {{{effect}}}
    </div>
    
    {{#if notes}}
    <div class="rt-injury-notes">
      <strong>Notes:</strong> {{notes}}
    </div>
    {{/if}}
    
    {{#if description}}
    <div class="rt-injury-description">
      {{{description}}}
    </div>
    {{/if}}
  </div>
  
  {{#if source}}
  <footer class="rt-card-footer">
    <span class="rt-source-ref">
      <i class="fas fa-book"></i> {{source}}
    </span>
  </footer>
  {{/if}}
</div>
```

### 9. Styling (SCSS)

**Create `src/scss/item/_critical-injury.scss`**:

```scss
// Critical Injury Sheet Styles

.rt-injury-sheet {
  .rt-item-sheet__header {
    position: relative;
    background: linear-gradient(135deg, 
                rgba($rt-accent-red, 0.1) 0%, 
                rgba($rt-accent-red, 0.05) 100%);
  }
  
  .rt-damage-icon {
    position: absolute;
    bottom: 4px;
    right: 4px;
    font-size: 20px;
    color: $rt-accent-red;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }
  
  .rt-injury-badges {
    display: flex;
    gap: $rt-space-sm;
    margin-top: $rt-space-sm;
    flex-wrap: wrap;
  }
  
  .rt-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    
    &--severity-minor {
      background: rgba($rt-accent-green, 0.2);
      color: darken($rt-accent-green, 20%);
    }
    
    &--severity-moderate {
      background: rgba($rt-accent-orange, 0.2);
      color: darken($rt-accent-orange, 20%);
    }
    
    &--severity-severe {
      background: rgba($rt-accent-red, 0.2);
      color: darken($rt-accent-red, 15%);
    }
    
    &--severity-fatal {
      background: rgba($rt-accent-dark-red, 0.3);
      color: $rt-accent-dark-red;
      animation: pulse-danger 2s ease-in-out infinite;
    }
    
    &--permanent {
      background: rgba($rt-accent-purple, 0.2);
      color: darken($rt-accent-purple, 15%);
    }
  }
  
  .rt-injury-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: $rt-space-md;
    
    .rt-field--checkbox {
      grid-column: 1 / -1;
    }
  }
}

// Chat Card Styles
.rt-injury-card {
  .rt-card-header {
    &--impact {
      background: linear-gradient(135deg, 
                  rgba(#795548, 0.2) 0%, 
                  rgba(#795548, 0.1) 100%);
    }
    
    &--rending {
      background: linear-gradient(135deg, 
                  rgba(#e74c3c, 0.2) 0%, 
                  rgba(#e74c3c, 0.1) 100%);
    }
    
    &--explosive {
      background: linear-gradient(135deg, 
                  rgba(#f39c12, 0.2) 0%, 
                  rgba(#f39c12, 0.1) 100%);
    }
    
    &--energy {
      background: linear-gradient(135deg, 
                  rgba(#3498db, 0.2) 0%, 
                  rgba(#3498db, 0.1) 100%);
    }
  }
  
  .rt-injury-meta {
    display: flex;
    gap: $rt-space-md;
    margin-bottom: $rt-space-md;
    padding: $rt-space-sm;
    background: rgba(0, 0, 0, 0.05);
    border-radius: 4px;
    
    .rt-meta-item {
      display: flex;
      align-items: center;
      gap: $rt-space-xs;
      font-size: 13px;
      font-weight: 500;
    }
  }
  
  .rt-injury-effect {
    padding: $rt-space-md;
    background: rgba(#fef5e7, 0.5);
    border-left: 3px solid $rt-accent-red;
    border-radius: 4px;
    
    p:last-child {
      margin-bottom: 0;
    }
  }
  
  .rt-injury-notes {
    margin-top: $rt-space-md;
    padding: $rt-space-sm;
    background: rgba(0, 0, 0, 0.03);
    border-radius: 4px;
    font-size: 13px;
  }
}

@keyframes pulse-danger {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba($rt-accent-red, 0.7);
  }
  50% {
    box-shadow: 0 0 8px 2px rgba($rt-accent-red, 0.3);
  }
}
```

---

## 🔧 Implementation Plan

### Phase 1: Data Model & Localization (2 hours)

**Tasks**:
1. ✅ Keep current data model schema (already good)
2. 🔧 Fix `damageTypeLabel` and `bodyPartLabel` getters with fallbacks
3. 🔧 Fix `chatProperties` to return strings, not objects
4. 🔧 Fix `headerLabels` to return flat strings
5. 🔧 Add new computed properties (severityLabel, icons, classes)
6. 📝 Add ALL localization keys to `en.json`

**Files to Edit**:
- `src/module/data/item/critical-injury.mjs`
- `src/lang/en.json`

### Phase 2: Template.json Update (15 minutes)

**Tasks**:
1. 🔧 Replace legacy `type` and `part` fields
2. 🔧 Add all DataModel fields to template.json
3. ✅ Verify field names match DataModel schema

**Files to Edit**:
- `src/template.json`

### Phase 3: Modern Sheet Template (1 hour)

**Tasks**:
1. 🔧 Create new `item-critical-injury-sheet-v2.hbs`
2. 🔧 Use proper field names (damageType, bodyPart, etc.)
3. 🔧 Add proper form controls (selects, number input)
4. 🔧 Use ProseMirror editor for `effect` field
5. 🔧 Add source reference fields (book, page, custom)
6. 🔧 Add visual badges and icons
7. 🔧 Update `critical-injury-sheet.mjs` to use new template

**Files to Edit/Create**:
- `src/templates/item/item-critical-injury-sheet-v2.hbs` (CREATE)
- `src/module/applications/item/critical-injury-sheet.mjs` (UPDATE)

### Phase 4: Pack Data Generation (2 hours)

**Tasks**:
1. 📁 Create `src/packs/rt-items-critical-injuries/_source/` directory
2. 📝 Write `scripts/generate-critical-injuries.mjs` script
3. ▶️ Run script to generate 160 injury JSON files
4. 🔧 Update `system.json` with new pack registration
5. ✅ Verify pack loads in Foundry

**Files to Create/Edit**:
- `scripts/generate-critical-injuries.mjs` (CREATE)
- `src/packs/rt-items-critical-injuries/_source/*.json` (GENERATE 160 files)
- `src/system.json` (UPDATE packs array)

### Phase 5: Compendium Browser Integration (1 hour)

**Tasks**:
1. 🔧 Fix `_getEntrySource()` to handle source objects
2. 🔧 Add injury-specific display badges
3. 🔧 Add injury filtering/grouping
4. ✅ Test compendium browser display

**Files to Edit**:
- `src/module/applications/compendium-browser.mjs`
- `src/templates/applications/compendium-browser.hbs`

### Phase 6: Chat Card Template (1 hour)

**Tasks**:
1. 📝 Create chat card template
2. 🔧 Update item.mjs to use chat card for injuries
3. 🔧 Add roll-to-chat button on item sheet
4. ✅ Test chat display

**Files to Create/Edit**:
- `src/templates/chat/critical-injury-card.hbs` (CREATE)
- `src/module/documents/item.mjs` (UPDATE)

### Phase 7: Styling (1 hour)

**Tasks**:
1. 📝 Create `_critical-injury.scss`
2. 🔧 Add sheet styles
3. 🔧 Add chat card styles
4. 🔧 Add panel styles for wounds-panel-v2
5. 🔧 Import in main SCSS

**Files to Create/Edit**:
- `src/scss/item/_critical-injury.scss` (CREATE)
- `src/scss/rogue-trader.scss` (IMPORT)

### Phase 8: Testing & Validation (1 hour)

**Tasks**:
1. ✅ Create test injury item
2. ✅ Verify all fields save correctly
3. ✅ Test drag/drop from compendium
4. ✅ Verify wounds panel display
5. ✅ Test chat card display
6. ✅ Verify no "Object [object]" errors
7. ✅ Test compendium browser filtering

---

## 🎯 Success Criteria

### Must Have
- [ ] No "Object [object]" display errors anywhere
- [ ] All 160 critical injuries generated and loadable
- [ ] Injury sheet uses correct field names
- [ ] Injuries display properly in compendium browser
- [ ] Injuries can be dragged onto characters
- [ ] Wounds panel shows injury list correctly
- [ ] Chat cards display injury information
- [ ] All localization keys defined

### Should Have
- [ ] Visual badges for severity levels
- [ ] Color coding by damage type
- [ ] Icons for body parts and damage types
- [ ] Permanent injury indicator
- [ ] Source reference display

### Nice to Have
- [ ] Auto-apply injury from critical damage tables
- [ ] Injury templates for common criticals
- [ ] Healing/recovery tracking
- [ ] Active effects for stat penalties

---

## 🚧 Migration Strategy

### For Existing Worlds

**Create migration script** (`scripts/migrate-critical-injuries.mjs`):

```javascript
// Migrate old injury items to new schema
export async function migrateCriticalInjuries() {
  const actors = game.actors.contents;
  let migratedCount = 0;
  
  for (const actor of actors) {
    const injuries = actor.items.filter(i => i.type === "criticalInjury");
    
    for (const injury of injuries) {
      const updates = {};
      
      // Migrate type → damageType
      if (injury.system.type && !injury.system.damageType) {
        updates["system.damageType"] = injury.system.type;
      }
      
      // Migrate part → bodyPart
      if (injury.system.part && !injury.system.bodyPart) {
        updates["system.bodyPart"] = injury.system.part;
      }
      
      // Migrate flat description → description.value
      if (typeof injury.system.description === "string") {
        updates["system.description"] = {
          value: injury.system.description,
          chat: "",
          summary: ""
        };
      }
      
      // Migrate flat source → source object
      if (typeof injury.system.source === "string") {
        updates["system.source"] = {
          book: "",
          page: "",
          custom: injury.system.source
        };
      }
      
      // Default severity if missing
      if (!injury.system.severity) {
        updates["system.severity"] = 1;
      }
      
      if (Object.keys(updates).length > 0) {
        await injury.update(updates);
        migratedCount++;
      }
    }
  }
  
  ui.notifications.info(`Migrated ${migratedCount} critical injury items`);
}
```

---

## 📚 Documentation Updates

### For Players

**Add to QUICKSTART.md**:
```markdown
### Critical Injuries

When your character takes damage beyond 0 wounds, you suffer **Critical Injuries**. The GM will assign you an injury item based on:

1. **Damage Type**: Impact, Rending, Explosive, or Energy
2. **Body Location**: Where you were hit (Head, Arm, Body, Leg)
3. **Severity**: How much damage beyond 0 (1-10)

**To add a critical injury**:
1. Open the Compendium Browser
2. Filter to "Critical Injuries"
3. Find the matching injury (e.g., "Impact Body Critical 3")
4. Drag it onto your character sheet
5. The injury appears in your Wounds panel

**Permanent Injuries**: Severity 7+ injuries are permanent and may require cybernetics or healing to remove.
```

### For GMs

**Add to rulebook**:
```markdown
## Critical Damage System

When a character is reduced to 0 wounds, they enter **Critical Damage**. Further damage increases their Critical Damage value (max 10).

### Assigning Critical Injuries

1. **Determine Damage Type**: Impact, Rending, Explosive, or Energy
2. **Determine Hit Location**: Roll d100 on hit location table
3. **Determine Severity**: Equal to Critical Damage value (1-10)
4. **Find the Injury**: Open Critical Injuries compendium
5. **Apply the Injury**: Drag onto character sheet

### Critical Damage Tables

The system includes 160 pre-generated injury items (4 types × 4 locations × 10 severities). Each has:

- **Effect**: Full mechanical description
- **Permanent**: Whether it requires cybernetics/healing
- **Source**: Rogue Trader Core pg. 254-257

### Custom Injuries

You can create custom injuries:
1. Right-click the Critical Injuries folder
2. Create New Item → Critical Injury
3. Fill in damage type, body part, severity, and effect
4. Drag onto character

### Healing Critical Injuries

- **Temporary** (Severity 1-6): Healed with Extended Care
- **Permanent** (Severity 7-10): Require cybernetics or miraculous healing
```

---

## 🔍 Testing Checklist

### Unit Tests

- [ ] DataModel creates with all fields
- [ ] DataModel validates choices correctly
- [ ] Computed properties return strings
- [ ] Icons return valid FA class names
- [ ] Severity classes match ranges
- [ ] chatProperties returns array of strings
- [ ] headerLabels returns flat object

### Integration Tests

- [ ] Item sheet loads without errors
- [ ] All form controls save correctly
- [ ] ProseMirror editor works for effect field
- [ ] Source object saves correctly
- [ ] Localization keys all resolve
- [ ] Compendium browser displays injuries
- [ ] Drag/drop works from compendium
- [ ] Injuries appear in wounds panel
- [ ] Chat cards display correctly

### Visual Tests

- [ ] Sheet has proper layout
- [ ] Badges display with correct colors
- [ ] Icons appear correctly
- [ ] Severity color coding works
- [ ] Permanent badge shows when appropriate
- [ ] Chat card renders cleanly
- [ ] No layout breaking on long text

---

## 📊 Estimated Effort

| Phase | Time | Complexity |
|-------|------|------------|
| Phase 1: Data Model | 2 hours | Medium |
| Phase 2: Template.json | 15 min | Low |
| Phase 3: Sheet Template | 1 hour | Medium |
| Phase 4: Pack Generation | 2 hours | Medium |
| Phase 5: Browser Integration | 1 hour | Low |
| Phase 6: Chat Cards | 1 hour | Medium |
| Phase 7: Styling | 1 hour | Low |
| Phase 8: Testing | 1 hour | Medium |
| **Total** | **~10 hours** | **Medium** |

---

## 🎯 Next Steps

1. **Review this plan** with the team
2. **Create GitHub issue** linking to this document
3. **Set up development branch**: `feature/critical-injuries-refactor`
4. **Begin Phase 1**: Fix data model and add localization
5. **Iterate through phases**: Test each phase before moving to next
6. **Create PR** when all phases complete
7. **Document in changelog**: Breaking changes for template.json

---

## 📝 Notes

### Design Decisions

1. **Keep existing DataModel schema**: It's well-designed and modern
2. **Generate 160 items**: Better than hardcoded tables, allows customization
3. **Use ProseMirror**: For rich injury descriptions with dice rolls
4. **Severity as 1-10**: Matches core rules and critical damage system
5. **Permanent flag**: Simplifies tracking vs checking severity >= 7
6. **Source as object**: Consistent with other items, allows proper attribution

### Future Enhancements

1. **Active Effects Integration**: Auto-apply stat penalties from injuries
2. **Healing Tracker**: Track recovery time and medical care
3. **Cybernetic Replacement**: Auto-suggest cybernetics for permanent injuries
4. **Random Injury Macro**: Roll random injury from severity + location
5. **Injury Templates**: Pre-made injury bundles for common scenarios

---

**Document Version**: 1.0  
**Last Updated**: 2026-01-09  
**Author**: AI Assistant  
**Status**: 📋 PLANNING - READY FOR IMPLEMENTATION
