# Skills System Deep Dive & Refactor Plan

**Date**: 2026-01-09  
**Scope**: Complete skills system audit and modernization plan for V13 ApplicationV2 architecture

---

## Current Architecture Analysis

### Data Flow Overview

```
Pack (Compendium) → Data Model (Actor) → Sheet Preparation → Template Rendering
    ↓                    ↓                     ↓                      ↓
skill.mjs          creature.mjs        base-actor-sheet.mjs     skills-panel.hbs
(item type)        (actor schema)      (_prepareSkills)         (template)
```

### Component Inventory

| Component | File | Status | Issues |
|-----------|------|--------|--------|
| **Item Data Model** | `data/item/skill.mjs` | ✅ Good | Modern DataModel, well-structured |
| **Item Sheet** | `applications/item/skill-sheet.mjs` | ✅ Good | V2 sheet, minimal but functional |
| **Actor Schema** | `data/actor/templates/creature.mjs` | ⚠️ Needs work | Skills hardcoded in schema |
| **Sheet Prep** | `applications/actor/base-actor-sheet.mjs` | ⚠️ Needs work | Mixed concerns, missing methods |
| **Compendium Data** | `packs/rt-items-skills/_source/*.json` | ❌ Broken | Duplicate/conflicting fields |
| **Templates** | `templates/actor/panel/skills-*.hbs` | ⚠️ Mixed | Some good, some missing data |
| **Tooltip System** | `applications/components/rt-tooltip.mjs` | ✅ Good | Well-designed, async loading |
| **Vocalization** | N/A | ❌ Missing | No skill-to-chat implementation |

---

## Critical Issues Identified

### 1. **Compendium Data Inconsistencies**

**Problem**: Pack data has redundant/conflicting fields:

```json
{
  "system": {
    "characteristic": "agility",           // ✅ Correct - used by SkillData model
    "rollConfig": {
      "characteristic": "Agility",         // ❌ Duplicate - capitalized variant
      "modifier": 0                        // ❌ Belongs in actor instance, not item
    },
    "skillType": "basic",                  // ✅ Correct
    "isBasic": true,                       // ✅ Correct
    "aptitudes": ["Agility", "General"],   // ✅ Correct
    "type": "",                            // ❌ Legacy - always empty
    "source": ""                           // ⚠️ Rarely filled
  }
}
```

**Impact**: Templates may be trying to render `Object [object]` from malformed data structures.

### 2. **Actor Schema Rigidity**

**Problem**: Skills are **hardcoded** in `creature.mjs` schema (lines 99-154):

```javascript
skills: new SchemaField({
  acrobatics: this.SkillField("Acrobatics", "Ag"),
  awareness: this.SkillField("Awareness", "Per"),
  // ... 50+ hardcoded skills
})
```

**Issues**:
- Cannot add custom skills dynamically
- Specialist skills limited to predefined list
- Heavy schema bloat (~55 skill definitions)
- No flexibility for homebrew/campaign-specific skills

**Current Workaround**: Specialist skills use `entries: []` array for specializations, but parent skill must exist in schema.

### 3. **Sheet Preparation Gaps**

**File**: `base-actor-sheet.mjs` lines 438-508

**Issues**:
- `_prepareSkills()` method exists in **DataModel** (creature.mjs:377-406) ✅
- `_prepareSkillLists()` method does NOT exist in sheet class ❌
- Inline skill list preparation in `_prepareContext()` (lines 410-508) ❌
- Calls `this.prepareSkillTooltip()` which **is** defined in TooltipMixin ✅
- BUT: Mixed concerns - DataModel does calculation, Sheet does presentation prep

**Missing Methods**:
- Dedicated `_prepareSkillsContext()` method
- Skill filtering logic (search/characteristic/training filters defined but unused)
- Skill categorization helpers

### 4. **"Object [object]" Display Issue**

**Root Cause**: Templates trying to render complex objects as strings.

**Likely Culprits**:
1. `rollConfig` object being passed to template instead of scalar value
2. `aptitudes` array not being joined
3. Missing `toString()` serialization in data prep
4. Broken Handlebars helper (`{{join}}` used in item-skill-sheet-modern.hbs line 25,38)

**Evidence**: Template uses `{{join item.system.aptitudes ", "}}` but `join` helper may not be registered.

### 5. **Tooltip Data Serialization**

**Working**: TooltipMixin properly calls `prepareSkillTooltipData()` which returns JSON string.

**Issue**: Tooltip data contains raw object references that may not serialize cleanly:

```javascript
// rt-tooltip.mjs:718-750
data.tooltipData = this.prepareSkillTooltip(key, data, characteristics);
// Returns: JSON.stringify({ name, label, characteristic, ... })
```

Template uses: `data-rt-tooltip-data="{{entry.[1].tooltipData}}"`

**Problem**: If `tooltipData` is already a JSON string, Handlebars will HTML-escape it, breaking parsing.

---

## Compendium Pack Analysis

### Pack Statistics
- **Total skills**: 153 items
- **Basic skills**: ~40
- **Specialist skills**: ~15 parent types (Common Lore, Forbidden Lore, Scholastic Lore, Speak Language, Trade, etc.)
- **Specialist variants**: ~98 (individual specializations as separate pack entries)

### Pack Data Structure Issues

**Found in**: `/src/packs/rt-items-skills/_source/*.json`

#### Issue 1: Duplicate Characteristic Fields

```json
// acrobatics_SdZkMMrVzF2lK0FL.json
{
  "system": {
    "characteristic": "agility",        // Used by model
    "rollConfig": {
      "characteristic": "Agility"       // Duplicate, unused
    }
  }
}
```

**Fix**: Remove `rollConfig.characteristic`, keep only `system.characteristic`.

#### Issue 2: Empty Legacy Fields

```json
{
  "system": {
    "type": "",          // Always empty
    "source": ""         // Rarely filled
  }
}
```

**Fix**: Remove `type` field entirely. Populate or remove `source`.

#### Issue 3: Specialist Skill Variants

**Current**:
- `common-lore-x.json` (parent) - has `specializations: [...]`
- `common-lore-adeptus-administratum.json` (child) - full duplicate item

**Problem**: Pack has both parent templates AND individual variants. This creates confusion:
- Should we drop parent skill onto actor, or specific variant?
- If parent, how do we instantiate a specialization?
- If variant, where does `specializations` list come from?

**Recommendation**: Keep **only parent templates** in pack. Specializations should be actor-instance data, not separate compendium items.

---

## Data Model Analysis

### SkillData (Item Data Model)

**File**: `src/module/data/item/skill.mjs`

**Schema** (lines 15-85):
```javascript
{
  identifier: IdentifierField,            // ✅ Good
  characteristic: StringField,            // ✅ Good - normalized lowercase
  skillType: StringField,                 // ✅ Good - basic/advanced/specialist
  isBasic: BooleanField,                  // ✅ Good - can use untrained
  aptitudes: ArrayField<StringField>,     // ✅ Good
  specializations: ArrayField<StringField>, // ✅ Good - predefined variants
  descriptor: StringField,                // ✅ Good - short description
  uses: HTMLField,                        // ✅ Good - usage examples
  specialRules: HTMLField,                // ✅ Good
  exampleDifficulties: ArrayField<SchemaField>, // ✅ Good
  useTime: StringField,                   // ✅ Good
  rollConfig: SchemaField {               // ⚠️ Belongs on actor instance
    defaultModifier: NumberField,
    canBeUsedUntrained: BooleanField,
    untrainedPenalty: NumberField
  },
  // Legacy fields
  type: StringField,                      // ❌ Remove
  requirements: StringField,              // ❌ Remove or document
  source: StringField                     // ⚠️ Use or remove
}
```

**Computed Properties** (lines 90-136):
- ✅ `characteristicLabel` - localized
- ✅ `characteristicAbbr` - WS/BS/S/T/Ag/Int/Per/WP/Fel
- ✅ `skillTypeLabel` - localized
- ✅ `hasSpecializations` - check if specialist with predefined list
- ✅ `chatProperties` - for chat cards
- ✅ `headerLabels` - for item sheet header

**Status**: ✅ Excellent. Data model is well-designed and follows V13 best practices.

### CreatureTemplate (Actor Schema)

**File**: `src/module/data/actor/templates/creature.mjs`

**Skill Schema** (lines 25-61):
```javascript
static SkillField(label, charShort, hasEntries = false) {
  return new SchemaField({
    label: StringField,         // Display name
    characteristic: StringField, // Linked characteristic key
    basic: BooleanField,        // Can use untrained
    trained: BooleanField,      // Trained tier
    plus10: BooleanField,       // +10 tier
    plus20: BooleanField,       // +20 tier
    bonus: NumberField,         // Additional bonuses
    notes: StringField,         // Custom notes
    hidden: BooleanField,       // Show/hide in UI
    cost: NumberField,          // XP cost
    current: NumberField,       // Computed total
    entries: ArrayField<SchemaField> // Specialist entries (if hasEntries=true)
  })
}
```

**Specialist Entry Schema** (lines 42-56):
```javascript
entries: ArrayField(new SchemaField({
  name: StringField,          // Specialization name (e.g., "Imperium")
  slug: StringField,          // Normalized key
  characteristic: StringField, // Can override parent characteristic
  trained: BooleanField,
  plus10: BooleanField,
  plus20: BooleanField,
  bonus: NumberField,
  notes: StringField,
  cost: NumberField,
  current: NumberField        // Computed total
}))
```

**Skill Calculation** (lines 377-406):
```javascript
_prepareSkills() {
  for (const [key, skill] of Object.entries(this.skills)) {
    const char = this.getCharacteristic(skill.characteristic);
    const charTotal = char?.total ?? 0;
    
    // Training level: 0=untrained, 1=trained, 2=+10, 3=+20
    const level = skill.plus20 ? 3 : skill.plus10 ? 2 : skill.trained ? 1 : 0;
    
    // Base value: full char if trained, half if not
    const baseValue = level > 0 ? charTotal : Math.floor(charTotal / 2);
    
    // Training bonus: +10 or +20
    const trainingBonus = level >= 3 ? 20 : level >= 2 ? 10 : 0;
    
    // Total = base + training + bonuses
    skill.current = baseValue + trainingBonus + (skill.bonus || 0);
    
    // Process specialist entries recursively
    if (Array.isArray(skill.entries)) {
      for (const entry of skill.entries) {
        // Same calculation for each entry
      }
    }
  }
}
```

**Status**: ⚠️ Functional but rigid. Hardcoded 55 skills with no dynamic expansion.

---

## Sheet Preparation Analysis

### Current Flow

**File**: `base-actor-sheet.mjs`

**Method**: `_prepareContext()` → inline skills prep (lines 410-508)

```javascript
// Line 410: Filter visible skills
const visibleSkills = Object.entries(this.actor.skills ?? {})
    .filter(([key, data]) => !data.hidden);

// Line 425: Sort by label
visibleSkills.sort((a, b) => labelA.localeCompare(labelB));

// Line 438: Split into standard vs specialist
context.skillLists = {
    standard: visibleSkills.filter(([, data]) => !Array.isArray(data.entries)),
    specialist: visibleSkills.filter(([, data]) => Array.isArray(data.entries))
};

// Line 451: Augment standard skills with display data
context.skillLists.standard.forEach(([key, data]) => {
    data.trainingLevel = trainingLevel(data);  // 0-3
    data.charShort = characteristicShorts[data.characteristic];
    data.tooltipData = this.prepareSkillTooltip(key, data, characteristics);
    data.breakdown = calculateBreakdown();  // "Ag: 45, Training: +10, Bonus: +5"
});

// Line 476: Split standard into two columns for UI
context.skillLists.standardColumns = [
    standardSkills.slice(0, splitIndex),
    standardSkills.slice(splitIndex)
];

// Line 484: Augment specialist skills
context.skillLists.specialist.forEach(([key, data]) => {
    data.tooltipData = this.prepareSkillTooltip(key, data, characteristics);
    data.entries?.forEach(entry => {
        entry.trainingLevel = trainingLevel(entry);
        entry.breakdown = calculateBreakdown();
    });
});
```

**Issues**:
1. **Too much inline logic** - should be extracted to `_prepareSkillsContext()` method
2. **No filtering applied** - `_skillsFilter` defined but never used
3. **Breakdown calculation duplicated** - done for standard and specialist separately
4. **No skill search** - `#filterSkills` action defined but incomplete
5. **Column split hardcoded** - should be responsive

---

## Template Analysis

### skills-panel.hbs (Standard Skills)

**File**: `src/templates/actor/panel/skills-panel.hbs`

**Structure**:
```handlebars
<div class="rt-skills-panel">
  <div class="rt-skills-columns">
    <!-- Left Column -->
    <div class="rt-skills-column">
      {{#each skillLists.standardColumns.[0] as |entry|}}
        <div class="rt-skill-row" data-skill="{{entry.[0]}}">
          <!-- Skill icon -->
          <span class="rt-skill-icon" style="--icon-url: url('{{skillIcon entry.[0]}}');"></span>
          
          <!-- Skill name (rollable button) -->
          <button data-action="roll" data-roll-type="skill" data-roll-target="{{entry.[0]}}"
                  data-rt-tooltip="skill" data-rt-tooltip-data="{{entry.[1].tooltipData}}">
            {{entry.[1].label}} ({{entry.[1].charShort}})
          </button>
          
          <!-- Training buttons (T/+10/+20) -->
          <div class="rt-spec-training">
            <button data-action="toggleTraining" data-skill="{{entry.[0]}}" data-level="1"
                    class="{{#if (gte entry.[1].trainingLevel 1)}}active{{/if}}">T</button>
            <button data-action="toggleTraining" data-skill="{{entry.[0]}}" data-level="2"
                    class="{{#if (gte entry.[1].trainingLevel 2)}}active{{/if}}">+10</button>
            <button data-action="toggleTraining" data-skill="{{entry.[0]}}" data-level="3"
                    class="{{#if (gte entry.[1].trainingLevel 3)}}active{{/if}}">+20</button>
          </div>
          
          <!-- Current total -->
          <div class="rt-skill-total" title="{{entry.[1].breakdown}}">
            <span>{{entry.[1].current}}</span>
          </div>
        </div>
      {{/each}}
    </div>
    <!-- Right Column (identical structure) -->
  </div>
</div>
```

**Issues**:
- ✅ Uses `entry.[0]` (key) and `entry.[1]` (data) correctly
- ❌ `skillIcon` helper not defined - likely returns undefined
- ✅ `gte` helper used correctly
- ✅ Tooltip data passed as string
- ⚠️ No search/filter UI
- ⚠️ Hardcoded 2-column layout

### skills-specialist-panel.hbs

**Structure**:
```handlebars
{{#each skillLists.specialist as |entry|}}
  <div class="rt-specialist-group" data-skill="{{entry.[0]}}">
    <!-- Group Header -->
    <div class="rt-specialist-header">
      <span>{{entry.[1].label}}</span>
      <button data-action="addSpecialistSkill" data-skill="{{entry.[0]}}">
        <i class="fas fa-plus"></i>
      </button>
    </div>
    
    <!-- Entries List -->
    {{#each entry.[1].entries as |spec idx|}}
      <div class="rt-specialist-entry">
        <input name="system.skills.{{../entry.[0]}}.entries.{{idx}}.name" 
               value="{{spec.name}}" />
        <!-- Training buttons T/+10/+20 -->
        <!-- Bonus input -->
        <div class="rt-spec-total">{{spec.current}}</div>
        <button data-action="deleteSpecialization" 
                data-skill="{{../entry.[0]}}" data-index="{{idx}}">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    {{/each}}
  </div>
{{/each}}
```

**Issues**:
- ✅ Structure is clean
- ✅ Actions properly defined
- ⚠️ No empty state guidance (which specialization to add?)
- ⚠️ No autocomplete from compendium specializations list
- ❌ Should show `system.specializations` from compendium as suggestions

### item-skill-sheet-modern.hbs (Compendium Display)

**File**: `src/templates/item/item-skill-sheet-modern.hbs`

**Issues**:
```handlebars
Line 25: <input name="system.aptitudes" value="{{join item.system.aptitudes ", "}}" />
Line 38: <input name="system.specializations" value="{{join item.system.specializations ", "}}" />
```

**Problem**: `join` helper not registered. Should use:
```handlebars
{{#each item.system.aptitudes as |apt|}}{{apt}}{{#unless @last}}, {{/unless}}{{/each}}
```

Or register custom helper:
```javascript
Handlebars.registerHelper('join', (array, separator) => {
    return Array.isArray(array) ? array.join(separator) : '';
});
```

---

## Vocalization (Skill-to-Chat) - MISSING

**Current State**: ❌ No implementation found

**Required**: When clicking skill in compendium or using `itemVocalize` action, should post skill to chat.

**What's Needed**:

1. **Chat Card Template**: `templates/chat/skill-card.hbs`
2. **Vocalize Handler**: In `SkillData` or Document
3. **Chat Message Creation**: Using `ChatMessage.create()`

**Example Chat Card Content**:
```
╔═══════════════════════════════════╗
║  Acrobatics (Ag)                  ║
║  Basic Skill                      ║
╠═══════════════════════════════════╣
║  Descriptor:                      ║
║  The ability to perform precise   ║
║  bodily actions...                ║
╠═══════════════════════════════════╣
║  Uses:                            ║
║  • Leaping across chasms          ║
║  • Contortionist: Full Action...  ║
╠═══════════════════════════════════╣
║  Time: Usually Full Action        ║
║  Aptitudes: Agility, General      ║
╚═══════════════════════════════════╝
```

---

## Proposed Solutions

### Phase 1: Clean Up Compendium Data (CRITICAL)

**Goal**: Fix all 153 skill pack entries to have consistent, clean data.

**Script**: `scripts/clean-skills-pack.mjs`

```javascript
/**
 * Clean up skills pack data - remove duplicates, fix structure
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.join(__dirname, '../src/packs/rt-items-skills/_source');

// Get all skill JSON files
const files = fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith('.json'));

console.log(`Processing ${files.length} skill files...`);

let cleaned = 0;
let errors = 0;

for (const file of files) {
    try {
        const filePath = path.join(SKILLS_DIR, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        if (data.type !== 'skill') {
            console.warn(`Skipping non-skill: ${file}`);
            continue;
        }
        
        let modified = false;
        
        // Fix 1: Remove duplicate rollConfig.characteristic
        if (data.system.rollConfig?.characteristic) {
            delete data.system.rollConfig.characteristic;
            modified = true;
        }
        
        // Fix 2: Remove rollConfig.modifier (belongs on actor instance)
        if ('modifier' in (data.system.rollConfig ?? {})) {
            delete data.system.rollConfig.modifier;
            modified = true;
        }
        
        // Fix 3: Remove empty rollConfig object
        if (data.system.rollConfig && Object.keys(data.system.rollConfig).length === 0) {
            delete data.system.rollConfig;
            modified = true;
        }
        
        // Fix 4: Remove legacy 'type' field
        if ('type' in data.system) {
            delete data.system.type;
            modified = true;
        }
        
        // Fix 5: Normalize characteristic to lowercase
        if (data.system.characteristic) {
            const normalized = data.system.characteristic.toLowerCase();
            if (normalized !== data.system.characteristic) {
                data.system.characteristic = normalized;
                modified = true;
            }
        }
        
        // Fix 6: Ensure skillType is set
        if (!data.system.skillType) {
            // Infer from presence of specializations
            data.system.skillType = (data.system.specializations?.length > 0) 
                ? 'specialist' 
                : 'basic';
            modified = true;
        }
        
        // Fix 7: Ensure aptitudes is array
        if (!Array.isArray(data.system.aptitudes)) {
            data.system.aptitudes = [];
            modified = true;
        }
        
        // Fix 8: Ensure specializations is array (for specialist skills)
        if (data.system.skillType === 'specialist' && !Array.isArray(data.system.specializations)) {
            data.system.specializations = [];
            modified = true;
        }
        
        if (modified) {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
            cleaned++;
            console.log(`✓ Cleaned: ${file}`);
        }
        
    } catch (err) {
        console.error(`✗ Error processing ${file}:`, err.message);
        errors++;
    }
}

console.log(`\nDone! Cleaned ${cleaned} files, ${errors} errors`);
```

**Run**:
```bash
cd /home/aqui/RogueTraderVTT
node scripts/clean-skills-pack.mjs
```

### Phase 2: Add Missing Handlebars Helpers

**File**: `src/module/handlebars/handlebars-manager.mjs`

**Add**:
```javascript
/**
 * Register custom Handlebars helpers
 */
export function registerHelpers() {
    // ... existing helpers ...
    
    /**
     * Join array elements with separator
     * @example {{join array ", "}}
     */
    Handlebars.registerHelper('join', function(array, separator) {
        if (!Array.isArray(array)) return '';
        return array.join(separator || ', ');
    });
    
    /**
     * Get skill icon path
     * @example {{skillIcon "acrobatics"}}
     */
    Handlebars.registerHelper('skillIcon', function(skillKey) {
        const icons = {
            acrobatics: 'systems/rogue-trader/assets/icons/skills/acrobatics.svg',
            awareness: 'systems/rogue-trader/assets/icons/skills/awareness.svg',
            // ... map all skills to icons (or use default)
        };
        return icons[skillKey] || 'icons/svg/book.svg';
    });
}
```

### Phase 3: Refactor Sheet Preparation

**File**: `src/module/applications/actor/base-actor-sheet.mjs`

**Extract skill prep to dedicated method**:

```javascript
/**
 * Prepare skills context for rendering.
 * @param {object} context  Context being prepared.
 * @protected
 */
_prepareSkillsContext(context) {
    const skills = this.actor.skills ?? {};
    const characteristics = this.actor.characteristics ?? {};
    
    // Apply filters
    const filters = this._skillsFilter;
    let visibleSkills = Object.entries(skills).filter(([key, data]) => {
        if (data.hidden) return false;
        
        // Search filter
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            const label = (data.label || key).toLowerCase();
            if (!label.includes(searchLower)) return false;
        }
        
        // Characteristic filter
        if (filters.characteristic && data.characteristic !== filters.characteristic) {
            return false;
        }
        
        // Training filter
        if (filters.training) {
            const level = this._getTrainingLevel(data);
            if (filters.training === 'trained' && level < 1) return false;
            if (filters.training === 'untrained' && level > 0) return false;
        }
        
        return true;
    });
    
    // Sort by label
    visibleSkills.sort((a, b) => {
        const labelA = a[1].label || a[0];
        const labelB = b[1].label || b[0];
        return labelA.localeCompare(labelB, game.i18n.lang);
    });
    
    // Split into categories
    const standard = [];
    const specialist = [];
    
    for (const [key, data] of visibleSkills) {
        // Augment with computed properties
        this._augmentSkillData(key, data, characteristics);
        
        if (Array.isArray(data.entries)) {
            // Specialist skill - process entries
            data.entries.forEach(entry => {
                this._augmentSkillData(key, entry, characteristics, data);
            });
            specialist.push([key, data]);
        } else {
            // Standard skill
            standard.push([key, data]);
        }
    }
    
    // Split standard into columns
    const splitIndex = Math.ceil(standard.length / 2);
    const standardColumns = [
        standard.slice(0, splitIndex),
        standard.slice(splitIndex)
    ];
    
    context.skillLists = { standard, specialist, standardColumns };
}

/**
 * Augment skill data with computed display properties.
 * @param {string} key  Skill key
 * @param {object} data  Skill or entry data
 * @param {object} characteristics  Actor characteristics
 * @param {object} [parentSkill]  Parent skill for specialist entries
 * @protected
 */
_augmentSkillData(key, data, characteristics, parentSkill = null) {
    const charKey = data.characteristic || parentSkill?.characteristic || 'strength';
    const char = characteristics[charKey];
    
    // Training level (0-3)
    data.trainingLevel = this._getTrainingLevel(data);
    
    // Characteristic short name
    data.charShort = char?.short || charKey;
    
    // Breakdown string for tooltip/title
    data.breakdown = this._getSkillBreakdown(data, char);
    
    // Tooltip data (JSON string)
    data.tooltipData = this.prepareSkillTooltip(key, data, characteristics);
}

/**
 * Get training level from skill data.
 * @param {object} skill  Skill or entry data
 * @returns {number}  Training level (0-3)
 * @protected
 */
_getTrainingLevel(skill) {
    if (skill.plus20) return 3;
    if (skill.plus10) return 2;
    if (skill.trained) return 1;
    return 0;
}

/**
 * Get skill breakdown string for display.
 * @param {object} skill  Skill data
 * @param {object} char  Characteristic data
 * @returns {string}  Breakdown string
 * @protected
 */
_getSkillBreakdown(skill, char) {
    const charTotal = char?.total ?? 0;
    const level = this._getTrainingLevel(skill);
    const baseValue = level > 0 ? charTotal : Math.floor(charTotal / 2);
    const trainingBonus = level >= 3 ? 20 : level >= 2 ? 10 : 0;
    const bonus = skill.bonus || 0;
    
    const parts = [];
    if (level > 0) {
        parts.push(`${char?.short || skill.characteristic}: ${charTotal}`);
    } else {
        parts.push(`${char?.short || skill.characteristic}: ${charTotal}/2 = ${baseValue}`);
    }
    if (trainingBonus > 0) parts.push(`Training: +${trainingBonus}`);
    if (bonus !== 0) parts.push(`Bonus: ${bonus >= 0 ? '+' : ''}${bonus}`);
    
    return parts.join(', ');
}
```

**Update `_prepareContext()`**:
```javascript
async _prepareContext(options) {
    const context = await super._prepareContext(options);
    // ... other prep ...
    
    // Use dedicated method
    this._prepareSkillsContext(context);
    
    return context;
}
```

### Phase 4: Implement Skill Search/Filter

**Template**: Add filter UI to `tab-skills.hbs`

```handlebars
<section class="tab active" data-tab="skills">
  <div class="rt-panel">
    <div class="rt-panel-header">
      <span class="rt-panel-title"><i class="fas fa-book"></i> Skills</span>
      
      <!-- Filter Controls -->
      <div class="rt-panel-actions">
        <input type="text" class="rt-search-input" 
               placeholder="Search skills..." 
               data-action="filterSkills" 
               value="{{skillsFilter.search}}" />
        
        <select class="rt-filter-select" data-action="filterSkills" name="characteristic">
          <option value="">All Characteristics</option>
          <option value="weaponSkill">WS</option>
          <option value="ballisticSkill">BS</option>
          <!-- ... all characteristics ... -->
        </select>
        
        <select class="rt-filter-select" data-action="filterSkills" name="training">
          <option value="">All Training</option>
          <option value="trained">Trained Only</option>
          <option value="untrained">Untrained Only</option>
        </select>
        
        {{#if (or skillsFilter.search skillsFilter.characteristic skillsFilter.training)}}
        <button type="button" class="rt-btn-clear" data-action="clearSkillsSearch">
          <i class="fas fa-times"></i> Clear
        </button>
        {{/if}}
      </div>
    </div>
    
    <div class="rt-panel-body">
      {{> systems/rogue-trader/templates/actor/panel/skills-panel.hbs}}
    </div>
  </div>
  
  <!-- Specialist Skills Panel -->
  <div class="rt-panel">
    <div class="rt-panel-header">
      <span class="rt-panel-title"><i class="fas fa-graduation-cap"></i> Specialist Skills</span>
    </div>
    <div class="rt-panel-body">
      {{> systems/rogue-trader/templates/actor/panel/skills-specialist-panel.hbs}}
    </div>
  </div>
</section>
```

**Handler** (in `AcolyteSheet`):

```javascript
/**
 * Handle skill filtering.
 * @param {Event} event
 * @param {HTMLElement} target
 */
static async #filterSkills(event, target) {
    const input = event.currentTarget;
    const name = input.name || 'search';
    const value = input.value || '';
    
    this._skillsFilter[name] = value;
    
    // Re-render skills tab only
    await this.render({ parts: ['skills'] });
}

/**
 * Clear all skill filters.
 * @param {Event} event
 * @param {HTMLElement} target
 */
static async #clearSkillsSearch(event, target) {
    this._skillsFilter = { search: '', characteristic: '', training: '' };
    await this.render({ parts: ['skills'] });
}
```

### Phase 5: Implement Skill Vocalization

**Create Chat Card Template**: `src/templates/chat/skill-card.hbs`

```handlebars
<div class="rt-chat-card rt-chat-card--skill">
  <header class="rt-chat-header">
    <img class="rt-chat-icon" src="{{skill.img}}" alt="{{skill.name}}" />
    <div class="rt-chat-title">
      <h3>{{skill.name}}</h3>
      <div class="rt-chat-meta">
        <span class="rt-badge rt-badge--{{skill.system.skillType}}">
          {{skill.system.skillTypeLabel}}
        </span>
        <span class="rt-badge rt-badge--characteristic">
          {{skill.system.characteristicLabel}} ({{skill.system.characteristicAbbr}})
        </span>
        {{#if skill.system.isBasic}}
        <span class="rt-badge rt-badge--basic">
          <i class="fas fa-check-circle"></i> Untrained
        </span>
        {{/if}}
      </div>
    </div>
  </header>
  
  {{#if skill.system.descriptor}}
  <div class="rt-chat-section">
    <p class="rt-chat-descriptor">{{skill.system.descriptor}}</p>
  </div>
  {{/if}}
  
  {{#if skill.system.uses}}
  <div class="rt-chat-section">
    <h4><i class="fas fa-list-check"></i> Uses</h4>
    <div class="rt-chat-content">{{{skill.system.uses}}}</div>
  </div>
  {{/if}}
  
  {{#if skill.system.specialRules}}
  <div class="rt-chat-section">
    <h4><i class="fas fa-book-open"></i> Special Rules</h4>
    <div class="rt-chat-content">{{{skill.system.specialRules}}}</div>
  </div>
  {{/if}}
  
  <footer class="rt-chat-footer">
    {{#if skill.system.useTime}}
    <span><strong>Time:</strong> {{skill.system.useTime}}</span>
    {{/if}}
    {{#if skill.system.aptitudes.length}}
    <span><strong>Aptitudes:</strong> {{join skill.system.aptitudes ", "}}</span>
    {{/if}}
    {{#if skill.system.hasSpecializations}}
    <span><strong>Specializations:</strong> {{join skill.system.specializations ", "}}</span>
    {{/if}}
  </footer>
</div>
```

**Add Vocalize Method** to `SkillData`:

```javascript
// In src/module/data/item/skill.mjs

/**
 * Post this skill to chat.
 * @returns {Promise<ChatMessage|null>}
 */
async toChat() {
    const messageData = {
        type: CONST.CHAT_MESSAGE_TYPES.OTHER,
        speaker: ChatMessage.getSpeaker(),
        content: await renderTemplate(
            'systems/rogue-trader/templates/chat/skill-card.hbs',
            { skill: this.parent }
        ),
        flags: {
            'rogue-trader': {
                skillId: this.parent.id,
                skillName: this.parent.name,
                type: 'skill-card'
            }
        }
    };
    
    return ChatMessage.create(messageData);
}
```

**Wire Up in BaseActorSheet**:

```javascript
/**
 * Handle item vocalize action.
 * @param {Event} event
 * @param {HTMLElement} target
 */
static async #itemVocalize(event, target) {
    const itemId = target.closest('[data-item-id]')?.dataset.itemId;
    if (!itemId) return;
    
    const item = this.actor.items.get(itemId);
    if (!item) return;
    
    // If item has toChat method, use it
    if (typeof item.system.toChat === 'function') {
        await item.system.toChat();
    } else {
        ui.notifications.warn(`${item.name} cannot be posted to chat.`);
    }
}
```

### Phase 6: Enhanced Specialist Skill UI

**Goal**: Show available specializations from compendium when adding new specialist skill entry.

**Approach**: Autocomplete dropdown sourced from `system.specializations` array in parent skill compendium item.

**Implementation**:

1. **Load Compendium Skill Data** in TooltipMixin (already done for tooltips)
2. **Pass to Context**:

```javascript
// In _prepareSkillsContext()
context.skillLists.specialist.forEach(([key, data]) => {
    // ... existing augmentation ...
    
    // Get suggested specializations from compendium
    const compendiumSkill = game.rt.tooltips?.getSkillDescription(key);
    data.suggestedSpecializations = compendiumSkill?.specializations || [];
});
```

3. **Update Template** (`skills-specialist-panel.hbs`):

```handlebars
<div class="rt-specialist-header">
  <span>{{entry.[1].label}}</span>
  
  {{#if entry.[1].suggestedSpecializations.length}}
  <!-- Dropdown to select from predefined specializations -->
  <select class="rt-spec-select" data-action="addSpecialistSkill" data-skill="{{entry.[0]}}">
    <option value="">-- Add Specialization --</option>
    {{#each entry.[1].suggestedSpecializations as |spec|}}
    <option value="{{spec}}">{{spec}}</option>
    {{/each}}
  </select>
  {{else}}
  <!-- Freeform button if no suggestions -->
  <button type="button" class="rt-specialist-add" data-action="addSpecialistSkill" data-skill="{{entry.[0]}}">
    <i class="fas fa-plus"></i> Add
  </button>
  {{/if}}
</div>
```

4. **Update Handler**:

```javascript
/**
 * Add a specialist skill entry.
 * @param {Event} event
 * @param {HTMLElement} target
 */
static async #addSpecialistSkill(event, target) {
    const skillKey = target.dataset.skill;
    if (!skillKey) return;
    
    const skill = this.actor.system.skills[skillKey];
    if (!skill || !Array.isArray(skill.entries)) {
        ui.notifications.error(`Skill ${skillKey} is not a specialist skill.`);
        return;
    }
    
    // Get name from dropdown value or prompt user
    let name = '';
    if (target.tagName === 'SELECT') {
        name = target.value;
        if (!name) return; // "-- Add Specialization --" selected
    } else {
        // Prompt for freeform entry
        name = await Dialog.prompt({
            title: `Add ${skill.label} Specialization`,
            content: '<input type="text" name="specialization" placeholder="Enter specialization name..." autofocus />',
            callback: (html) => html.find('input[name="specialization"]').val(),
            rejectClose: false
        });
        if (!name) return;
    }
    
    // Add new entry
    const entries = foundry.utils.deepClone(skill.entries);
    entries.push({
        name: name,
        slug: name.slugify(),
        characteristic: skill.characteristic,
        trained: false,
        plus10: false,
        plus20: false,
        bonus: 0,
        notes: '',
        cost: 0,
        current: 0
    });
    
    await this.actor.update({
        [`system.skills.${skillKey}.entries`]: entries
    });
    
    ui.notifications.info(`Added ${skill.label} (${name}) specialization.`);
}
```

### Phase 7: Responsive Column Layout

**Goal**: Skills panel should adapt columns based on available width.

**CSS** (in `dist/scss/panels/_skills.scss`):

```scss
.rt-skills-panel {
  --rt-skill-columns: 2; // Default
  
  @container (max-width: 600px) {
    --rt-skill-columns: 1;
  }
  
  @container (min-width: 900px) {
    --rt-skill-columns: 3;
  }
}

.rt-skills-columns {
  display: grid;
  grid-template-columns: repeat(var(--rt-skill-columns), 1fr);
  gap: var(--rt-space-md);
}

.rt-skills-column {
  display: flex;
  flex-direction: column;
  gap: var(--rt-space-xs);
}
```

**Sheet Prep** (update `_prepareSkillsContext`):

```javascript
// Split standard into dynamic columns based on container width
const columnCount = this._skillColumnCount || 2;
const standardColumns = [];
const chunkSize = Math.ceil(standard.length / columnCount);

for (let i = 0; i < columnCount; i++) {
    const start = i * chunkSize;
    const end = start + chunkSize;
    standardColumns.push(standard.slice(start, end));
}

context.skillLists.standardColumns = standardColumns;
```

**ResizeObserver** (in sheet `_onRender`):

```javascript
// Observe skills panel width and adjust column count
const skillsPanel = this.element.querySelector('.rt-skills-panel');
if (skillsPanel && !this._skillsPanelObserver) {
    this._skillsPanelObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
            const width = entry.contentRect.width;
            const columns = width < 600 ? 1 : width < 900 ? 2 : 3;
            if (this._skillColumnCount !== columns) {
                this._skillColumnCount = columns;
                this.render({ parts: ['skills'] });
            }
        }
    });
    this._skillsPanelObserver.observe(skillsPanel);
}
```

---

## Implementation Checklist

### Immediate Fixes (Must Do)
- [ ] Run `scripts/clean-skills-pack.mjs` to fix compendium data
- [ ] Register `join` Handlebars helper
- [ ] Register `skillIcon` Handlebars helper (or remove from template)
- [ ] Extract `_prepareSkillsContext()` method from inline code
- [ ] Fix "Object [object]" display issues

### High Priority
- [ ] Implement skill vocalization (toChat method + template)
- [ ] Implement skill search/filter functionality
- [ ] Add specialist skill autocomplete from compendium
- [ ] Test tooltip data serialization (ensure JSON escaping works)

### Medium Priority
- [ ] Add responsive column layout
- [ ] Improve empty state for specialist skills
- [ ] Add skill icons (or use fallback gracefully)
- [ ] Document skill system in AGENTS.md

### Low Priority / Future
- [ ] Consider dynamic skill system (allow custom skills not in schema)
- [ ] Add skill XP cost tracking
- [ ] Add skill advancement dialog
- [ ] Bulk skill import from templates

---

## Testing Plan

### Test Cases

1. **Compendium Display**
   - [ ] Open skills compendium in browser
   - [ ] Verify no "Object [object]" displays
   - [ ] Verify aptitudes show as comma-separated list
   - [ ] Verify specializations show for specialist skills
   - [ ] Drag skill onto actor sheet

2. **Actor Sheet Display**
   - [ ] All standard skills show in alphabetical order
   - [ ] Training buttons (T/+10/+20) work and highlight correctly
   - [ ] Current total calculates correctly
   - [ ] Tooltips show on hover with breakdown
   - [ ] Specialist skills show with empty state
   - [ ] Add specialization button/dropdown works

3. **Skill Rolling**
   - [ ] Click skill name to trigger roll dialog
   - [ ] Roll respects training level (half char if untrained)
   - [ ] Roll includes bonuses
   - [ ] Roll posts to chat with result

4. **Specialist Skills**
   - [ ] Add new specialization (freeform or from dropdown)
   - [ ] Training buttons work on specialist entries
   - [ ] Delete specialization removes entry
   - [ ] Specialist skill rolls with correct spec name

5. **Filters**
   - [ ] Search box filters skills by name
   - [ ] Characteristic dropdown filters by linked characteristic
   - [ ] Training filter shows trained/untrained only
   - [ ] Clear button resets all filters

6. **Vocalization**
   - [ ] Right-click skill in compendium → Post to Chat
   - [ ] Chat card shows skill details correctly
   - [ ] Chat card is readable and well-formatted

---

## Final Recommendations

### Architecture Improvements

1. **Separate Concerns**:
   - DataModel: Pure calculation, no presentation
   - Sheet: Presentation preparation, no business logic
   - Template: Display only, minimal logic

2. **Extract Helpers**:
   - Move skill-related logic to `src/module/utils/skill-helpers.mjs`
   - Training level calculation
   - Breakdown generation
   - Filtering logic

3. **Improve Caching**:
   - Cache compendium skill data in TooltipsRT
   - Use for autocomplete, tooltips, vocalization

4. **Future-Proof**:
   - Consider flags-based custom skills for homebrew
   - Design API for skill advancement
   - Plan for skill macros

### Code Quality

1. **Add JSDoc**: All methods should have full JSDoc comments
2. **Add Type Checking**: Consider TypeScript or JSDoc types
3. **Add Unit Tests**: Test calculation logic in isolation
4. **Add Integration Tests**: Test sheet rendering with sample data

### Documentation

1. **Update AGENTS.md**: Add skills system section
2. **Create SKILLS_API.md**: Document for module developers
3. **Add Comments**: Inline comments for complex logic
4. **Update ROADMAP.md**: Mark skills system as complete

---

## Conclusion

The skills system is **structurally sound** but needs **cleanup and completion**:

- ✅ **Data models** are well-designed (V13 best practices)
- ⚠️ **Compendium data** has duplicates and legacy fields (fixable with script)
- ⚠️ **Sheet preparation** is functional but needs extraction and refactoring
- ❌ **Vocalization** is completely missing (needs implementation)
- ⚠️ **Specialist skills** work but lack autocomplete UX
- ⚠️ **Filtering** is defined but not implemented

**Priority Order**:
1. Clean compendium data (script)
2. Fix Handlebars helpers (join/skillIcon)
3. Extract sheet prep to dedicated method
4. Implement vocalization
5. Add specialist skill autocomplete
6. Add filtering UI

**Estimated Effort**: 8-12 hours for all phases

**Risk**: Low. Changes are isolated and won't break existing functionality.

**Testing**: Extensive manual testing required after each phase.

---

**Next Steps**: Review this document, approve phases, then execute systematically.
