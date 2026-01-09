# Talents System - Comprehensive Deep Dive & Refactor Plan

**Date**: 2026-01-09  
**Focus**: Talents (& Traits) System  
**Goal**: Eliminate "Object [object]" displays, modernize V13 architecture  
**Scope**: Pack data, DataModel, Templates, Vocalization, V2 App API  

---

## Executive Summary

The **Talents system** has similar issues to Skills but with different patterns. Pack data contains **legacy fields** (`requirements`, `effect`) instead of structured DataModel fields (`prerequisites`, `benefit`). Traits are mixed in with Talents in the pack, creating confusion. "Object [object]" displays occur when templates try to render object/array fields directly.

**Key Issues**:
1. **650 talents** + **82 traits** in talents pack (should be separated)
2. **100% of talents** have empty `benefit` field (data is in `effect` legacy field)
3. **329/650 talents** have empty `aptitudes` array
4. **Category field mixes type + tier** (e.g. "Talent (T3)" not "combat")
5. **646/650 have legacy `requirements`** text not structured `prerequisites`
6. **No specialization data** in pack (Weapon Training, etc.)
7. **No toChat() method** in TalentData model
8. **Template directly renders objects** causing "[object Object]"

---

## Table of Contents

1. [Pack Data Audit](#pack-data-audit)
2. [Data Model Analysis](#data-model-analysis)
3. [Template Analysis](#template-analysis)
4. [Compendium Display Issues](#compendium-display-issues)
5. [Sheet Integration](#sheet-integration)
6. [Vocalization System](#vocalization-system)
7. [Root Causes](#root-causes)
8. [Refactor Plan (7 Phases)](#refactor-plan)
9. [Implementation Details](#implementation-details)
10. [Testing Strategy](#testing-strategy)

---

## 1. Pack Data Audit

### 1.1 File Statistics

```
Total Talent Files: 650
├── Pure Talents: ~568
└── Traits (misplaced): 82

Pack Location: src/packs/rt-items-talents/_source/
Traits Pack: src/packs/rt-items-traits/_source/ (77 files - should have 82+)
```

### 1.2 Field Presence Analysis

| Field | Present | Empty | Type Distribution |
|-------|---------|-------|-------------------|
| `category` | 650 (100%) | 0 | string(650) |
| `tier` | 650 (100%) | 0 | number(650) |
| `source` | 650 (100%) | 0 | string(650) |
| `description.value` | 650 (100%) | 0 | HTML string(650) |
| `requirements` | 650 (100%) | 4 | **LEGACY** string(646) |
| `effect` | 650 (100%) | 0 | **LEGACY** string(650) |
| `benefit` | 650 (100%) | **650** | **EMPTY** empty_string(650) |
| `aptitudes` | 650 (100%) | **329** | empty_array(329), array(321) |
| `modifiers` | 100 (15%) | 100 | object(100) - all empty |
| `isPassive` | 100 (15%) | 0 | boolean(100) |
| `isRollable` | 100 (15%) | 0 | boolean(100) |

**KEY FINDINGS**:
- ✅ `tier` field is consistent (0-3 range)
- ❌ `benefit` is **always empty** (data in `effect` instead)
- ❌ `requirements` is **legacy text** (should be structured `prerequisites`)
- ❌ `category` has tier info ("Talent (T3)") that duplicates `tier` field
- ❌ `aptitudes` missing in 50% of talents
- ❌ Only 15% have `modifiers`/`isPassive`/`isRollable` (partial migration)

### 1.3 Category Analysis

```
Talent                      133  (no tier info - assume T1 or generic)
Talent (T2)                 114  (tier in category name)
Talent (T3)                 100  (tier in category name)
Talent (T1)                  85  (tier in category name)
Talent (Unique)              85  (special talents)
Trait                        82  (SHOULD BE IN TRAIT PACK!)
Trait (Unique)                9  (SHOULD BE IN TRAIT PACK!)
Trait (Elite)                 8  (SHOULD BE IN TRAIT PACK!)
Talent (Elite - Inq) (T2)     5  (elite archetype-specific)
Talent (Elite - Ast) (T2)     5  
Talent (Elite - SoB) (T1-3)   9  (Sisters of Battle)
Talent (Elite - Unt) (T1-3)   8  (Untouchables)
Talent  (Elite)               3  (has typo - double space)
```

**ISSUES**:
1. Category should be **semantic** (combat, social, knowledge, leadership, psychic)
2. Tier info is **redundant** (already have `tier` field)
3. **99 items are Traits** not Talents (wrong pack)
4. Elite archetypes could be a separate field

### 1.4 Sample Talent Data

**Example: Adamantium Faith (Clean)**
```json
{
  "name": "Adamantium Faith",
  "type": "talent",
  "system": {
    "category": "Talent (T3)",              // ❌ Has tier + "Talent" prefix
    "tier": 3,                               // ✅ Correct
    "requirements": "Tier 3; Jaded...",      // ❌ LEGACY - should be prerequisites
    "effect": "Character can subtract...",   // ❌ LEGACY - should be benefit
    "benefit": "",                           // ❌ EMPTY
    "aptitudes": ["Willpower", "Defence"],   // ✅ Correct
    "description": { "value": "<p>..." },    // ✅ Correct (duplicates effect)
    "modifiers": { ... },                    // ✅ Present (partially migrated)
    "isPassive": true,                       // ✅ Present
    "isRollable": true                       // ✅ Present
  }
}
```

**Example: Ambidextrous (Typical)**
```json
{
  "name": "Ambidextrous",
  "system": {
    "category": "Talent (T1)",              // ❌ Has tier info
    "tier": 1,
    "requirements": "Tier 1; Agility 30...", // ❌ LEGACY
    "effect": "Character can use...",        // ❌ LEGACY
    "benefit": "",                           // ❌ EMPTY
    "aptitudes": [],                         // ❌ EMPTY (should have data)
    "modifiers": { ... },                    // ❌ Empty object
    "isPassive": true,
    "isRollable": false
  }
}
```

**Example: Weapon Training (X) (Stackable)**
```json
{
  "name": "Weapon Training (X)",
  "system": {
    "category": "Talent (T1)",
    "tier": 1,
    "requirements": "Tier 1; None...",
    "effect": "Character can use all weapons...",
    "benefit": "",
    "aptitudes": ["General", "Finesse", "Unaligned"]
  }
  // ❌ NO specialization field in pack
  // ❌ NO stackable field
  // ❌ NO rank field
}
```

---

## 2. Data Model Analysis

### 2.1 TalentData Schema (talent.mjs)

**Current Schema** (235 lines):
```javascript
{
  identifier: IdentifierField,          // ✅ Good
  category: StringField,                 // ⚠️ Should be semantic not "Talent (T3)"
  tier: NumberField (0-3),               // ✅ Good
  
  prerequisites: SchemaField {           // ✅ Good structure BUT EMPTY IN PACK
    text: StringField,                   // Legacy fallback
    characteristics: ObjectField,        // {ws: 30, bs: 40}
    skills: ArrayField<StringField>,     // ["dodge", "parry"]
    talents: ArrayField<StringField>     // ["ambidextrous"]
  },
  
  aptitudes: ArrayField<StringField>,    // ✅ Good BUT 50% EMPTY IN PACK
  cost: NumberField,                     // ❌ NOT IN PACK DATA
  benefit: HTMLField,                    // ❌ ALWAYS EMPTY IN PACK
  
  isPassive: BooleanField,               // ✅ Good BUT ONLY 15% IN PACK
  rollConfig: SchemaField { ... },       // ❌ NOT IN PACK DATA
  stackable: BooleanField,               // ❌ NOT IN PACK DATA
  rank: NumberField,                     // ❌ NOT IN PACK DATA
  specialization: StringField,           // ❌ NOT IN PACK DATA
  notes: StringField                     // ❌ NOT IN PACK DATA
}
```

**Problems**:
1. **Schema is well-designed** BUT pack data doesn't use it
2. Pack has `requirements` (string) instead of `prerequisites` (object)
3. Pack has `effect` (string) instead of `benefit` (HTML)
4. Pack missing: cost, stackable, rank, specialization
5. Only 15% of pack files have modifiers/isPassive/isRollable

### 2.2 TalentData Computed Properties

**Good Properties**:
- ✅ `isRollable` - checks if talent can be activated
- ✅ `tierLabel` - converts tier number to localized string
- ✅ `categoryLabel` - localizes category
- ✅ `fullName` - includes specialization + rank
- ✅ `hasPrerequisites` - checks if any prereqs exist
- ✅ `prerequisitesLabel` - formats prereqs as string
- ✅ `chatProperties` - array of properties for chat cards
- ✅ `headerLabels` - labels for item header

**Missing**:
- ❌ `toChat()` method (exists in SkillData but not TalentData)
- ❌ `aptitudesLabel` - formatted aptitudes string
- ❌ `costLabel` - formatted XP cost
- ❌ Icon mapping helper

### 2.3 Migration Logic

**Current migrateData()**:
```javascript
// Migrates flat prerequisites string to structured object
if ( typeof source.prerequisites === "string" ) {
  source.prerequisites = {
    text: source.prerequisites,
    characteristics: {},
    skills: [],
    talents: []
  };
}

// Migrates flat aptitudes string to array
if ( typeof source.aptitudes === "string" && source.aptitudes ) {
  source.aptitudes = source.aptitudes.split(",").map(a => a.trim()).filter(Boolean);
}
```

**Issues**:
- Migration expects `prerequisites` field BUT pack has `requirements`
- Migration expects aptitudes as string BUT pack has empty array
- No migration for `effect` → `benefit`
- No migration for category cleanup

---

## 3. Template Analysis

### 3.1 Talent Panel Template (talent-panel.hbs)

**Current Template** (38 lines):
```handlebars
<div class="rt-panel rt-panel-talents-list">
    <div class="rt-panel-header">
        <span class="rt-panel-title"><i class="fas fa-star"></i> Talents</span>
    </div>
    <div class="rt-panel-body">
        {{#if talentsCount}}
        <div class="rt-talents-list">
            {{#each actor.items as |item|}}
                {{#if item.isTalent}}
                <div class="rt-talent-card">
                    <img src="{{item.img}}" />
                    <span data-action="itemEdit">{{item.name}}</span>
                    {{#if item.system.tier}}
                    <span class="rt-card-meta">Tier {{item.system.tier}}</span>
                    {{/if}}
                    <button data-action="itemVocalize"><i class="fas fa-comment"></i></button>
                    <button data-action="itemDelete"><i class="fas fa-trash"></i></button>
                </div>
                {{/if}}
            {{/each}}
        </div>
        {{/if}}
    </div>
</div>
```

**Issues**:
- ✅ Simple list display (no "Object [object]" here)
- ❌ No category display
- ❌ No aptitudes display
- ❌ No prerequisites display
- ❌ No search/filter functionality
- ❌ No grouping by category/tier
- ❌ Doesn't show specialization or rank

### 3.2 Talents Tab Template (tab-talents.hbs)

**Current Structure** (18 lines):
```handlebars
<section class="tab" data-tab="talents">
    <div class="rt-talents-grid">
        {{!-- Left: Specialist Skills --}}
        <div class="rt-talents-col-left">
            {{> skills-specialist-panel.hbs}}
        </div>
        
        {{!-- Right: Talents & Traits --}}
        <div class="rt-talents-col-right">
            {{> talent-panel.hbs}}
            {{> trait-panel.hbs}}
        </div>
    </div>
</section>
```

**Issues**:
- ✅ Clean 60/40 split layout
- ❌ No filters at tab level
- ❌ No talent search
- ❌ Specialist skills in wrong tab (should be in Skills tab)

### 3.3 Item Vocalize Template (item-vocalize-chat.hbs)

**Current Template** (20 lines - GENERIC):
```handlebars
<div class="rt-chat">
    <div class="rt-item-card">
        <div class="rt-item-card__header">
            <h2>{{name}}</h2>
            <span>{{actor}} • {{type}}</span>
        </div>
        <div class="rt-item-card__body">
            <div class="rt-item-card__description">{{{description}}}</div>
        </div>
    </div>
</div>
```

**Issues**:
- ✅ Works as fallback
- ❌ No talent-specific layout
- ❌ Doesn't show tier, aptitudes, prerequisites
- ❌ Doesn't show cost or category
- ❌ Compare to skills-card.hbs (60 lines, rich layout)

---

## 4. Compendium Display Issues

### 4.1 Where "Object [object]" Appears

**Likely Locations**:
1. **Compendium list view** - when showing aptitudes array
2. **Item sheet** - when rendering prerequisites object
3. **Chat cards** - when vocalizing talents
4. **Tooltips** - when hovering over talent references

### 4.2 Root Cause Analysis

**Example Issue**:
```handlebars
{{!-- Template tries to render object directly --}}
<span>Prerequisites: {{item.system.prerequisites}}</span>
{{!-- Outputs: "Prerequisites: [object Object]" --}}

{{!-- Template tries to render array directly --}}
<span>Aptitudes: {{item.system.aptitudes}}</span>
{{!-- Outputs: "Aptitudes: General,Finesse,Unaligned" (works BUT no spaces) --}}
```

**Fixes Needed**:
1. Use `{{join item.system.aptitudes ", "}}` helper
2. Use `{{item.system.prerequisitesLabel}}` computed property
3. Create talent-specific chat template (like skill-card.hbs)

---

## 5. Sheet Integration

### 5.1 Current Sheet Preparation

**NO talent-specific preparation found**:
```bash
grep -r "prepareTalent" src/module/applications/actor/*.mjs
# No results
```

**BaseActorSheet**: Has generic item handlers
- `#itemEdit` - opens item sheet
- `#itemDelete` - deletes item with confirmation
- `#itemVocalize` - calls `item.displayCard()`
- `#itemRoll` - calls `actor.rollItem(itemId)`

**AcolyteSheet**: Inherits from BaseActorSheet
- No talent-specific preparation
- No talent filtering/grouping
- No talent context augmentation

### 5.2 Needed Sheet Methods

Following Skills pattern from `base-actor-sheet.mjs`:

```javascript
/**
 * Prepare talents context for rendering.
 * @returns {Object} Talents data with filtering and grouping
 */
async _prepareTalentsContext() {
  const talents = this.actor.items.filter(i => i.type === "talent");
  const traits = this.actor.items.filter(i => i.type === "trait");
  
  return {
    talents: talents.map(t => this._augmentTalentData(t)),
    traits: traits.map(t => this._augmentTraitData(t)),
    categories: this._getTalentCategories(talents),
    tiers: [0, 1, 2, 3],
    talentsCount: talents.length,
    traitsCount: traits.length
  };
}

/**
 * Augment talent with display properties.
 */
_augmentTalentData(talent) {
  return {
    ...talent,
    tierLabel: talent.system.tierLabel,
    categoryLabel: talent.system.categoryLabel,
    fullName: talent.system.fullName,
    aptitudesLabel: this._formatAptitudes(talent.system.aptitudes),
    prerequisitesLabel: talent.system.prerequisitesLabel,
    hasPrerequisites: talent.system.hasPrerequisites,
    costLabel: talent.system.cost ? `${talent.system.cost} XP` : "-"
  };
}
```

---

## 6. Vocalization System

### 6.1 Current Implementation

**Item.displayCard()** (from base item.mjs):
```javascript
async displayCard() {
  const chatData = {
    name: this.name,
    type: this.type,
    actor: this.actor?.name,
    description: this.system.description.value || ""
  };
  
  const html = await renderTemplate(
    "systems/rogue-trader/templates/chat/item-vocalize-chat.hbs",
    chatData
  );
  
  await ChatMessage.create({ content: html });
}
```

**Issues**:
- Generic template (20 lines)
- Doesn't use talent-specific fields
- No tier, aptitudes, prerequisites display
- Compare to skills (60-line dedicated template)

### 6.2 Needed: toChat() Method in TalentData

Following SkillData pattern (skill.mjs lines 174-197):

```javascript
/**
 * Post this talent to chat with rich formatting.
 * @returns {Promise<ChatMessage>}
 */
async toChat() {
  const templateData = {
    talent: {
      id: this.parent.id,
      name: this.parent.name,
      img: this.parent.img,
      type: "Talent",
      tier: this.tier,
      tierLabel: this.tierLabel,
      category: this.categoryLabel,
      aptitudes: this.aptitudes,
      aptitudesLabel: this.aptitudes.join(", "),
      hasPrerequisites: this.hasPrerequisites,
      prerequisitesLabel: this.prerequisitesLabel,
      benefit: this.benefit || this.effect || this.parent.system.description.value,
      cost: this.cost,
      costLabel: this.cost ? `${this.cost} XP` : "—",
      isPassive: this.isPassive ? "Passive" : "Active",
      specialization: this.specialization,
      rank: this.rank,
      stackable: this.stackable
    },
    timestamp: new Date().toLocaleString()
  };
  
  const html = await renderTemplate(
    "systems/rogue-trader/templates/chat/talent-card.hbs",
    templateData
  );
  
  return ChatMessage.create({
    content: html,
    speaker: ChatMessage.getSpeaker({ actor: this.parent.actor })
  });
}
```

### 6.3 Needed: Talent Chat Card Template

**New File**: `src/templates/chat/talent-card.hbs` (60+ lines)

Should include:
- Header: Name, Tier badge, Category badge
- Prerequisites section (if any)
- Benefit/Effect section (HTML)
- Footer: Aptitudes, Cost, Type (Passive/Active)
- Specialization display (if applicable)
- Rank display (if stackable)

---

## 7. Root Causes Summary

### 7.1 Primary Issues

| # | Issue | Impact | Affected Files |
|---|-------|--------|----------------|
| 1 | Pack data uses `requirements` not `prerequisites` | Migration fails | 650 pack files |
| 2 | Pack data uses `effect` not `benefit` | Field always empty | 650 pack files |
| 3 | Pack data missing aptitudes (50%) | Display incomplete | 329 pack files |
| 4 | Category has tier info ("Talent (T3)") | Redundant, not semantic | 437 pack files |
| 5 | 99 Traits in Talents pack | Organizational confusion | 99 pack files |
| 6 | No `toChat()` method in TalentData | Generic vocalization | talent.mjs |
| 7 | No talent-specific chat template | Poor chat display | templates/chat/ |
| 8 | No talent preparation in sheets | No filtering/grouping | base-actor-sheet.mjs |
| 9 | Templates render objects directly | "Object [object]" displays | Multiple .hbs |
| 10 | No search/filter UI | Poor UX | tab-talents.hbs |

### 7.2 Secondary Issues

- Pack missing: cost, stackable, rank, specialization fields
- Only 15% of talents have modifiers/isPassive/isRollable
- No icon mapping for talent types
- No grouping by category/tier in UI
- No autocomplete for specializations (like specialist skills)

---

## 8. Refactor Plan (7 Phases)

### Phase 1: Clean Compendium Data ⚙️
**Goal**: Normalize all 650 talent files to match DataModel schema  
**Time**: 30 minutes  
**Approach**: Automated script

**Script Tasks**:
1. Migrate `requirements` → `prerequisites.text`
2. Migrate `effect` → `benefit`
3. Clean `category` field (remove tier info, make semantic)
4. Parse aptitudes from `requirements` text if `aptitudes` is empty
5. Add missing fields: `isPassive: true`, `cost: 0`
6. Move 99 Traits to traits pack
7. Validate all files against schema

**Example Transformation**:
```javascript
// BEFORE
{
  "category": "Talent (T3)",
  "requirements": "Tier 3; Jaded, Resistance (Fear), WP 45\nAptitudes: Willpower, Defence",
  "effect": "Character can subtract their Willpower Bonus...",
  "benefit": "",
  "aptitudes": []
}

// AFTER
{
  "category": "combat",  // semantic category
  "tier": 3,
  "prerequisites": {
    "text": "Jaded, Resistance (Fear), WP 45",
    "characteristics": { "wp": 45 },
    "skills": [],
    "talents": ["Jaded", "Resistance (Fear)"]
  },
  "benefit": "<p>Character can subtract their Willpower Bonus...</p>",
  "aptitudes": ["Willpower", "Defence"],
  "cost": 750,  // tier 3 = 750 XP base
  "isPassive": true
}
```

**Validation**:
- All 650 files processed
- 0 empty `benefit` fields
- 0 empty `aptitudes` arrays (or intentionally empty)
- 0 category fields with tier info
- 99 files moved to traits pack

---

### Phase 2: Handlebars Helpers 🛠️
**Goal**: Register helpers to prevent "Object [object]" displays  
**Time**: 15 minutes  
**File**: `src/module/handlebars/handlebars-helpers.mjs`

**Helpers Needed**:
```javascript
/**
 * Get icon for talent category.
 * @param {string} category - Talent category
 * @returns {string} Font Awesome icon class
 */
Handlebars.registerHelper("talentIcon", function(category) {
  const icons = {
    combat: "fa-sword",
    social: "fa-users",
    knowledge: "fa-book",
    leadership: "fa-crown",
    psychic: "fa-brain",
    technical: "fa-cog",
    defense: "fa-shield",
    unique: "fa-star"
  };
  return icons[category] || "fa-star";
});

/**
 * Get color for talent tier.
 * @param {number} tier - Talent tier (1-3)
 * @returns {string} CSS class for color
 */
Handlebars.registerHelper("tierColor", function(tier) {
  const colors = {
    1: "tier-bronze",
    2: "tier-silver",
    3: "tier-gold",
    0: "tier-none"
  };
  return colors[tier] || "tier-none";
});

/**
 * Format talent prerequisites.
 * @param {Object} prereqs - Prerequisites object
 * @returns {string} Formatted string
 */
Handlebars.registerHelper("formatPrerequisites", function(prereqs) {
  if (!prereqs) return "";
  if (prereqs.text) return prereqs.text;
  
  const parts = [];
  for (const [char, value] of Object.entries(prereqs.characteristics || {})) {
    parts.push(`${char.toUpperCase()} ${value}+`);
  }
  parts.push(...(prereqs.skills || []));
  parts.push(...(prereqs.talents || []));
  
  return parts.join(", ");
});
```

**Note**: `join` helper already exists (used in skills)

---

### Phase 3: Refactor Sheet Preparation 🔄
**Goal**: Extract modular talent preparation methods  
**Time**: 45 minutes  
**File**: `src/module/applications/actor/base-actor-sheet.mjs`

**New Methods**:
1. `_prepareTalentsContext()` - Main talent prep (80 lines)
2. `_augmentTalentData()` - Add display properties (30 lines)
3. `_augmentTraitData()` - Add trait display properties (20 lines)
4. `_getTalentCategories()` - Extract unique categories (10 lines)
5. `_formatAptitudes()` - Format aptitudes array (10 lines)

**Integration**:
```javascript
// In _prepareContext() or _preparePartContext()
if (partId === "talents") {
  context.talentsData = await this._prepareTalentsContext();
}
```

**Benefits**:
- Reusable across all actor sheets
- Cached talent categorization
- Consistent display properties
- Easy to extend with filters

---

### Phase 4: Search/Filter UI 🔍
**Goal**: Add filtering for talents like skills  
**Time**: 45 minutes  
**Files**: 
- `src/templates/actor/acolyte/tab-talents.hbs`
- `src/module/applications/actor/acolyte-sheet.mjs`

**Filter Types**:
1. **Search** - Filter by name (case-insensitive)
2. **Category** - Filter by semantic category
3. **Tier** - Filter by tier (0-3)
4. **Aptitudes** - Filter by aptitude

**Template Addition** (40 lines):
```handlebars
<div class="rt-talents-filters">
  <input type="text" name="talents-search" placeholder="Search talents..." />
  
  <select name="talents-category">
    <option value="">All Categories</option>
    {{#each categories as |cat|}}
    <option value="{{cat}}">{{cat}}</option>
    {{/each}}
  </select>
  
  <select name="talents-tier">
    <option value="">All Tiers</option>
    <option value="1">Tier 1</option>
    <option value="2">Tier 2</option>
    <option value="3">Tier 3</option>
  </select>
  
  <button type="button" data-action="clearTalentsFilter">
    <i class="fas fa-times"></i> Clear
  </button>
</div>
```

**Handler** (30 lines):
```javascript
static async #filterTalents(event, target) {
  const input = target.closest(".rt-talents-filters");
  const search = input.querySelector("[name=talents-search]").value;
  const category = input.querySelector("[name=talents-category]").value;
  const tier = input.querySelector("[name=talents-tier]").value;
  
  this._talentsFilter = { search, category, tier };
  await this.render({ parts: ["talents"] });
}
```

---

### Phase 5: Vocalization System 💬
**Goal**: Create rich talent chat cards  
**Time**: 60 minutes  
**Files**:
- `src/module/data/item/talent.mjs` (+30 lines)
- `src/templates/chat/talent-card.hbs` (new, 70 lines)

**talent.mjs additions**:
```javascript
/**
 * Post this talent to chat.
 * @returns {Promise<ChatMessage>}
 */
async toChat() {
  const templateData = {
    talent: {
      id: this.parent.id,
      name: this.parent.name,
      img: this.parent.img,
      tier: this.tier,
      tierLabel: this.tierLabel,
      category: this.categoryLabel,
      aptitudes: this.aptitudes,
      aptitudesLabel: this.aptitudes.join(", "),
      hasPrerequisites: this.hasPrerequisites,
      prerequisitesLabel: this.prerequisitesLabel,
      benefit: this.benefit,
      cost: this.cost,
      costLabel: this.cost ? `${this.cost} XP` : "—",
      isPassive: this.isPassive,
      specialization: this.specialization,
      rank: this.rank
    },
    timestamp: new Date().toLocaleString()
  };
  
  const html = await renderTemplate(
    "systems/rogue-trader/templates/chat/talent-card.hbs",
    templateData
  );
  
  return ChatMessage.create({
    content: html,
    speaker: ChatMessage.getSpeaker({ actor: this.parent.actor })
  });
}
```

**talent-card.hbs structure**:
```handlebars
<div class="rt-chat rt-talent-card">
  {{!-- Header --}}
  <div class="rt-card-header">
    <img src="{{talent.img}}" />
    <h3>{{talent.name}}</h3>
    <span class="tier-badge {{tierColor talent.tier}}">{{talent.tierLabel}}</span>
    <span class="category-badge">{{talent.category}}</span>
  </div>
  
  {{!-- Prerequisites --}}
  {{#if talent.hasPrerequisites}}
  <div class="rt-card-section">
    <strong>Prerequisites:</strong> {{talent.prerequisitesLabel}}
  </div>
  {{/if}}
  
  {{!-- Benefit --}}
  <div class="rt-card-section">
    <strong>Benefit:</strong>
    <div class="rt-card-benefit">{{{talent.benefit}}}</div>
  </div>
  
  {{!-- Footer --}}
  <div class="rt-card-footer">
    <span><strong>Aptitudes:</strong> {{talent.aptitudesLabel}}</span>
    <span><strong>Cost:</strong> {{talent.costLabel}}</span>
    <span><strong>Type:</strong> {{#if talent.isPassive}}Passive{{else}}Active{{/if}}</span>
  </div>
</div>
```

---

### Phase 6: Enhanced Talent UI 🎨
**Goal**: Improve talent panel with grouping and details  
**Time**: 60 minutes  
**File**: `src/templates/actor/panel/talent-panel.hbs`

**Enhancements**:
1. **Group by tier** (collapsible sections)
2. **Show aptitudes** in card
3. **Show prerequisites** badge
4. **Color-coded tier badges**
5. **Specialization input** (for stackable talents)

**New Template** (80 lines):
```handlebars
<div class="rt-panel rt-panel-talents-modern">
  <div class="rt-panel-header">
    <span class="rt-panel-title"><i class="fas fa-star"></i> Talents ({{talentsCount}})</span>
  </div>
  
  <div class="rt-panel-body">
    {{#each groupedTalents as |group|}}
    <div class="rt-talent-group" data-tier="{{group.tier}}">
      <h4 class="rt-group-header {{tierColor group.tier}}">
        Tier {{group.tier}} ({{group.talents.length}})
      </h4>
      
      <div class="rt-talent-list">
        {{#each group.talents as |talent|}}
        <div class="rt-talent-card" data-item-id="{{talent.id}}">
          <div class="rt-card-main">
            <img class="rt-card-icon" src="{{talent.img}}" />
            
            <div class="rt-card-info">
              <span class="rt-card-name" data-action="itemEdit" data-item-id="{{talent.id}}">
                {{talent.fullName}}
              </span>
              <span class="rt-card-meta">{{talent.categoryLabel}}</span>
              
              {{#if talent.aptitudes.length}}
              <div class="rt-card-aptitudes">
                {{#each talent.aptitudes as |apt|}}
                <span class="rt-badge rt-badge-aptitude">{{apt}}</span>
                {{/each}}
              </div>
              {{/if}}
            </div>
          </div>
          
          <div class="rt-card-actions">
            <button type="button" class="rt-card-btn" data-action="itemVocalize" data-item-id="{{talent.id}}" title="Send to Chat">
              <i class="fas fa-comment"></i>
            </button>
            <button type="button" class="rt-card-btn rt-btn-danger" data-action="itemDelete" data-item-id="{{talent.id}}" title="Delete">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
        {{/each}}
      </div>
    </div>
    {{/each}}
    
    <div class="rt-dropzone" data-action="itemCreate" data-type="talent">
      <i class="fas fa-star rt-dropzone-icon"></i>
      <span class="rt-dropzone-text">Drop Talent or Click to Create</span>
    </div>
  </div>
</div>
```

---

### Phase 7: Specialization Support (Optional) 🎯
**Goal**: Add specialization UI for stackable talents  
**Time**: 60 minutes  
**Complexity**: Medium-High

**For talents like**:
- Weapon Training (X)
- Peer (X)
- Enemy (X)
- Rival (X)

**Approach**:
1. Add `specialization` input field when adding talent
2. Support multiple instances with different specializations
3. Show specialization in parentheses: "Weapon Training (Bolt)"
4. Allow incrementing rank for truly stackable talents

**UI Pattern**:
```handlebars
{{#if talent.stackable}}
  <div class="rt-talent-specialization">
    <label>Specialization:</label>
    <input type="text" value="{{talent.specialization}}" data-action="updateSpecialization" />
    
    {{#if talent.rank}}
    <div class="rt-rank-controls">
      <label>Rank:</label>
      <button data-action="decrementRank"><i class="fas fa-minus"></i></button>
      <span>{{talent.rank}}</span>
      <button data-action="incrementRank"><i class="fas fa-plus"></i></button>
    </div>
    {{/if}}
  </div>
{{/if}}
```

**Note**: This is lower priority - most talents aren't stackable.

---

## 9. Implementation Details

### 9.1 Pack Cleaning Script

**File**: `scripts/clean-talents-pack.mjs`

```javascript
import fs from 'fs';
import path from 'path';

const PACK_DIR = './src/packs/rt-items-talents/_source/';
const TRAITS_DIR = './src/packs/rt-items-traits/_source/';

// Category mapping (from legacy to semantic)
const CATEGORY_MAP = {
  'Talent (T1)': 'general',
  'Talent (T2)': 'general',
  'Talent (T3)': 'general',
  'Talent (Unique)': 'unique',
  'Talent': 'general'
};

// Semantic categories based on talent name/effect
const SEMANTIC_CATEGORIES = {
  combat: ['weapon', 'attack', 'damage', 'defense', 'reaction'],
  social: ['charm', 'deceive', 'interrogat', 'command', 'fellowship'],
  knowledge: ['lore', 'logic', 'tech', 'medicae', 'intelligence'],
  leadership: ['command', 'inspire', 'rally', 'order'],
  psychic: ['psy', 'warp', 'psychic', 'power'],
  technical: ['tech', 'craft', 'repair', 'operate'],
  defense: ['armor', 'dodge', 'parry', 'resist', 'toughness']
};

// XP cost by tier
const TIER_COSTS = { 0: 0, 1: 300, 2: 600, 3: 900 };

function parseAptitudesFromRequirements(reqText) {
  const match = reqText.match(/Aptitudes?:\s*([^\n]+)/i);
  if (!match) return [];
  return match[1].split(',').map(s => s.trim()).filter(Boolean);
}

function parsePrerequisites(reqText) {
  // Parse characteristics (e.g. "WP 45")
  const charMatches = reqText.matchAll(/(\w+)\s+(\d+)\+?/g);
  const characteristics = {};
  for (const [, char, value] of charMatches) {
    if (char.length <= 3) characteristics[char.toLowerCase()] = parseInt(value);
  }
  
  // Parse talent requirements
  const talents = [];
  // TODO: More sophisticated parsing
  
  return {
    text: reqText.split('\n')[0].replace(/Tier \d+;\s*/, ''),
    characteristics,
    skills: [],
    talents
  };
}

function determineSemanticCategory(name, effect, category) {
  const text = (name + ' ' + effect).toLowerCase();
  
  for (const [cat, keywords] of Object.entries(SEMANTIC_CATEGORIES)) {
    if (keywords.some(kw => text.includes(kw))) {
      return cat;
    }
  }
  
  return 'general';
}

function cleanTalentFile(filename) {
  const filepath = path.join(PACK_DIR, filename);
  const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  const sys = data.system;
  
  // Check if this is actually a Trait
  if (sys.category?.includes('Trait')) {
    const newPath = path.join(TRAITS_DIR, filename);
    fs.writeFileSync(newPath, JSON.stringify(data, null, 2));
    fs.unlinkSync(filepath);
    return { moved: true, filename };
  }
  
  // Migrate requirements → prerequisites
  if (sys.requirements && typeof sys.requirements === 'string') {
    sys.prerequisites = parsePrerequisites(sys.requirements);
    delete sys.requirements;
  }
  
  // Migrate effect → benefit
  if (sys.effect && !sys.benefit) {
    sys.benefit = `<p>${sys.effect}</p>`;
    delete sys.effect;
  }
  
  // Parse aptitudes from requirements if empty
  if (!sys.aptitudes || sys.aptitudes.length === 0) {
    const oldReq = data.system.requirements || '';
    sys.aptitudes = parseAptitudesFromRequirements(oldReq);
  }
  
  // Clean category (remove tier info, make semantic)
  if (sys.category) {
    sys.category = determineSemanticCategory(data.name, sys.benefit || '', sys.category);
  }
  
  // Add cost if missing
  if (!sys.cost) {
    sys.cost = TIER_COSTS[sys.tier] || 0;
  }
  
  // Add isPassive if missing
  if (sys.isPassive === undefined) {
    sys.isPassive = true; // Default to passive
  }
  
  // Write back
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  return { cleaned: true, filename };
}

// Main execution
const files = fs.readdirSync(PACK_DIR);
let cleaned = 0, moved = 0, errors = 0;

for (const file of files) {
  try {
    const result = cleanTalentFile(file);
    if (result.moved) moved++;
    else if (result.cleaned) cleaned++;
  } catch (err) {
    console.error(`Error processing ${file}:`, err.message);
    errors++;
  }
}

console.log(`\nCleaning Complete!`);
console.log(`  Cleaned: ${cleaned}`);
console.log(`  Moved to Traits: ${moved}`);
console.log(`  Errors: ${errors}`);
```

### 9.2 Testing Checklist

**Pre-Build Verification**:
- [ ] All 650 talent files processed without errors
- [ ] 99 trait files moved to traits pack
- [ ] No empty `benefit` fields remain
- [ ] No `requirements` fields remain (all migrated to `prerequisites`)
- [ ] All `aptitudes` arrays populated or intentionally empty
- [ ] All `category` fields are semantic (no tier info)

**Build & Launch**:
- [ ] `npm run build` succeeds
- [ ] No build errors/warnings
- [ ] Foundry starts without console errors
- [ ] System loads successfully

**Compendium Tests**:
- [ ] Open rt-items-talents compendium
- [ ] Verify no "Object [object]" displays
- [ ] Aptitudes show as: "Willpower, Defence" (comma-separated)
- [ ] Prerequisites show as readable text
- [ ] Drag talent onto character sheet → no errors
- [ ] Right-click talent → "Post to Chat" option
- [ ] Chat card displays correctly with all fields

**Sheet Tests**:
- [ ] Talents tab shows all talents
- [ ] Talents grouped by tier
- [ ] Tier badges color-coded (bronze/silver/gold)
- [ ] Aptitude badges display correctly
- [ ] Filter by search works
- [ ] Filter by category works
- [ ] Filter by tier works
- [ ] Clear filter button resets all filters

**Vocalization Tests**:
- [ ] Click vocalize button on talent
- [ ] Chat card renders with rich layout
- [ ] All sections display: tier, category, prerequisites, benefit, aptitudes, cost
- [ ] HTML in benefit renders correctly
- [ ] No "Object [object]" in chat
- [ ] Timestamp shows in footer

**Integration Tests**:
- [ ] Talent modifiers apply to character
- [ ] Stackable talents can be added multiple times
- [ ] Specialization field works (if implemented)
- [ ] Rank increment/decrement works (if implemented)
- [ ] Delete talent with confirmation
- [ ] Edit talent opens item sheet

---

## 10. Decision Log

### 10.1 Category System

**Decision**: Use semantic categories instead of "Talent (T1)" format  
**Rationale**:
- Tier info is redundant (already have `tier` field)
- Semantic categories enable better filtering/grouping
- More user-friendly ("Combat" vs "Talent (T3)")
- Aligns with modern UI/UX patterns

**Categories**:
- combat
- social
- knowledge
- leadership
- psychic
- technical
- defense
- unique
- general (fallback)

### 10.2 Prerequisites Migration

**Decision**: Migrate `requirements` text → structured `prerequisites` object  
**Rationale**:
- Enables programmatic checking
- Better UX (can highlight missing prereqs)
- Consistent with DataModel schema
- Fallback to `prerequisites.text` for complex cases

**Approach**:
- Parse characteristics: "WP 45" → `{ wp: 45 }`
- Parse talents: Extract from comma-separated list
- Store original text in `prerequisites.text` as fallback

### 10.3 Traits Separation

**Decision**: Move 99 Traits from talents pack to traits pack  
**Rationale**:
- Organizational clarity
- Different UI patterns (Traits have levels, not tiers)
- Easier filtering in compendium
- Matches user mental model

**Migration**:
- Automated script moves files during Phase 1
- No data loss
- Update references if any

### 10.4 Vocalization Pattern

**Decision**: Add `toChat()` method to TalentData (like SkillData)  
**Rationale**:
- Consistent with Skills refactor
- Gives DataModel full control over display
- Easier to maintain than sheet logic
- Enables rich chat cards

**Alternative Considered**: Keep generic `displayCard()` in Item  
**Rejected Because**: Too generic, loses talent-specific fields

### 10.5 Phase 7 Optionality

**Decision**: Make specialization support optional (Phase 7)  
**Rationale**:
- Only ~20 talents are stackable/specialized
- Complex UI for edge case
- Can be added later based on user feedback
- Phases 1-6 provide 90% of value

---

## 11. Risk Assessment

### 11.1 High Risk

**Data Loss During Migration**:
- **Risk**: Script error could corrupt pack files
- **Mitigation**: Git commit before running, backup pack directory
- **Recovery**: `git reset --hard HEAD`

**Breaking Existing Characters**:
- **Risk**: Field name changes break existing actor data
- **Mitigation**: DataModel `migrateData()` handles old format
- **Recovery**: Migration runs automatically on actor load

### 11.2 Medium Risk

**Category Mapping Errors**:
- **Risk**: Automated category detection assigns wrong category
- **Mitigation**: Manual review of high-profile talents, fallback to "general"
- **Recovery**: Easy to fix in pack file, re-run script

**Aptitudes Parsing Failures**:
- **Risk**: Regex fails to extract aptitudes from requirements text
- **Mitigation**: Leave empty, manual review after script run
- **Recovery**: Add aptitudes manually to affected talents

### 11.3 Low Risk

**Template Rendering Issues**:
- **Risk**: New helpers cause Handlebars errors
- **Mitigation**: Test helpers in isolation before integration
- **Recovery**: Remove helper, revert to simple display

**Performance Impact**:
- **Risk**: Filtering/grouping slows sheet rendering
- **Mitigation**: Cache categorization, use efficient filters
- **Recovery**: Optimize if needed, very unlikely issue

---

## 12. Success Metrics

### 12.1 Quantitative

- ✅ 650/650 talent files cleaned (100%)
- ✅ 0 empty `benefit` fields (was 650)
- ✅ 0 legacy `requirements` fields (was 646)
- ✅ 0 "Object [object]" displays (user-reported)
- ✅ 99 traits moved to correct pack
- ✅ 321+ aptitudes populated (was 321, should be 650)
- ✅ 3 new Handlebars helpers registered
- ✅ 6 new sheet preparation methods
- ✅ 1 new chat card template
- ✅ 1 new `toChat()` method

### 12.2 Qualitative

- ✅ Talents display correctly in compendium
- ✅ Talents display correctly on character sheet
- ✅ Talents vocalize with rich chat cards
- ✅ Aptitudes/prerequisites human-readable
- ✅ Filtering/search works intuitively
- ✅ Code is modular and maintainable
- ✅ Follows V13 ApplicationV2 patterns
- ✅ Consistent with Skills refactor

---

## 13. Future Enhancements

### 13.1 Short Term (Post-Refactor)

- [ ] Specialization autocomplete (like specialist skills)
- [ ] Bulk talent actions (delete multiple, etc.)
- [ ] Talent prerequisites checking (highlight missing)
- [ ] Talent advancement cost calculator
- [ ] Custom talent icon mapping

### 13.2 Medium Term

- [ ] Talent trees visualization
- [ ] Talent recommendations based on character
- [ ] Talent import/export
- [ ] Talent macros (drag to hotbar)
- [ ] Talent tags/keywords for better search

### 13.3 Long Term

- [ ] Dynamic talents (add custom via flags)
- [ ] Talent effects automation (auto-apply modifiers)
- [ ] Talent synergies system
- [ ] Talent progression tracking
- [ ] Talent shopping cart (plan character build)

---

## Conclusion

The **Talents system refactor** mirrors the successful Skills refactor but with unique challenges (traits mixing, category system, prerequisites parsing). The **7-phase plan** provides a clear path from messy legacy data to a modern, maintainable V13 system.

**Key Takeaway**: The pack data is the root cause. Clean it first, everything else becomes easier.

**Estimated Total Time**: ~4.5 hours  
**High Priority Phases**: 1-5 (core functionality)  
**Optional Phases**: 6-7 (enhancements)  

**Ready to implement!** 🚀

