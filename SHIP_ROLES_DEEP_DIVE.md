# Ship Roles System - Deep Dive Analysis

**Date**: 2026-01-09  
**System**: Rogue Trader VTT V13  
**Scope**: Ship Role items (22 total)

---

## 📋 Executive Summary

The Ship Roles system currently has **significant data model mismatches** causing `[object Object]` displays. Unlike Ship Components/Weapons which stored legacy pack data, Ship Roles have a **schema vs pack mismatch** where:

1. **Pack data uses STRING fields** (`careerPreferences`, `subordinates`, `importantSkills`)
2. **DataModel expects ARRAY fields** (ArrayField with StringField elements)
3. **Display logic broken** - Templates expect arrays, pack has strings
4. **Missing modern features** - No abilities array, shipBonuses unused, no skillBonuses

**Status**: 🔴 **BROKEN** - Requires full refactor similar to ship components

---

## 🔍 Problem Analysis

### Issue #1: Field Type Mismatches

#### Pack Data (Current - STRINGS):
```json
{
  "careerPreferences": "Usually Explorator, any but Missionary/Void-Master.",
  "subordinates": "Ship Tech-Priests, Arch-Magi, and Lesser Enginseers.",
  "importantSkills": "Tech-Use, Chem-Use, Common Lore (Mechine Cult), Forbidden Lore (Mechanicus)"
}
```

#### DataModel Schema (Expected - ARRAYS):
```javascript
careerPreferences: new fields.ArrayField(
  new fields.StringField({ required: true }),
  { required: true, initial: [] }
),
subordinates: new fields.ArrayField(
  new fields.StringField({ required: true }),
  { required: true, initial: [] }
),
importantSkills: new fields.ArrayField(
  new fields.StringField({ required: true }),
  { required: true, initial: [] }
)
```

**Impact**: When DataModel receives strings, ArrayField expects arrays. Templates call `.join(", ")` on strings, causing `[object Object]` or errors.

---

### Issue #2: Abilities Not Used

#### Pack Data:
```json
{
  "effect": "+10 to Emergency Repairs Extended Actions",
  "specialAbility": ""
}
```

#### DataModel Schema:
```javascript
abilities: new fields.ArrayField(
  new fields.SchemaField({
    name: new fields.StringField({ required: true }),
    description: new fields.HTMLField({ required: true }),
    action: new fields.StringField({ required: false, blank: true }),
    skill: new fields.StringField({ required: false, blank: true })
  }),
  { required: true, initial: [] }
)
```

**Problem**: 
- Pack stores `effect` as HTML string (legacy)
- DataModel has `abilities` array (structured)
- Templates display `effect` directly
- `abilities` array never populated → modern structure unused

---

### Issue #3: Bonus Systems Unused

#### Pack Data:
```json
{
  "skillBonuses": {},
  "shipBonuses": {
    "manoeuvrability": 0,
    "detection": 0,
    "ballisticSkill": 0,
    "crewRating": 0
  }
}
```

**Problems**:
1. `skillBonuses` is empty object (should be structured with skill keys)
2. `shipBonuses` all zeros (no roles actually provide numeric bonuses)
3. Effect text like "+5 to Ship Crew Rating" stored in `effect` string, not `shipBonuses.crewRating: 5`

**Root Cause**: Legacy data entry never used modern DataModel schema

---

### Issue #4: Display Properties Return `[object Object]`

#### DataModel Getters:
```javascript
get careerPreferencesLabel() {
    if ( !this.careerPreferences.length ) return "-";
    return this.careerPreferences.join(", ");
}
```

**When Pack Data is String**:
```javascript
// Pack: "Usually Explorator, any but Missionary/Void-Master."
this.careerPreferences // → STRING "Usually..."
this.careerPreferences.length // → 50 (string length, not array length)
this.careerPreferences.join(", ") // → ERROR or [object Object]
```

**Result**: Templates displaying `{{role.system.careerPreferencesLabel}}` show `[object Object]`

---

## 📊 Current State Audit

### Pack Data Inventory (22 Items)

| Role Name | Rank | Career | Subordinates | Skills | Effect Type |
|-----------|------|--------|--------------|--------|-------------|
| Lord-Captain | 1 | String | String | String | Extended Action +10 |
| Enginseer Prime | 2 | String | String | String | Extended Action +10 |
| First Officer | 2 | String | String | String | Skill bonus (Command) |
| High Factotum | 2 | String | String | String | Endeavour bonus |
| Master Helmsman | 3 | String | String | String | Extended Action +10 |
| Master of Ordnance | 3 | String | String | String | BS bonus +5 |
| Choir-Master Telepathica | 3 | String | String | String | Astropathic range |
| Master-At-Arms | 3 | String | String | String | Extended Action +10 |
| Warp Guide/Navigator Primaris | 3 | String | String | String | Navigation skill +5 |
| Chief Chirurgeon | 3 | String | String | String | Extended Action +10 |
| Carto-Artifex | 4 | String | String | String | Awareness/Perception +10 |
| Chief Bosun | 4 | String | String | String | Crew Rating +5 |
| Drivesmaster | 4 | String | String | String | Extended Action +10 |
| Infernus Master | 4 | String | String | String | Command +20 (fires) |
| Master of Etherics | 4 | String | String | String | Detection bonus +5 |
| Master of the Vox | 4 | String | String | String | Interaction tests +10 |
| Master of Whispers | 4 | String | String | String | Interrogation/inquiry +10 |
| Omnissianic Congregator | 4 | String | String | String | Morale tests +10 |
| Purser | 4 | String | String | String | Acquisition tests +10 |
| Ship's Confessor | 4 | String | String | String | Fear tests +10 |
| Ship's Steward | 4 | String | String | String | Interaction tests +10 |
| Twistcatcher | 4 | String | String | String | Psyniscience +20 |

**All 22 items** have same structure issues.

---

## 🎯 Solution Design

### Approach: Full Pack Migration + DataModel Enhancement

Following the successful Ship Components/Weapons pattern:

1. **Parse string fields → arrays**
2. **Extract structured abilities from effect text**
3. **Populate bonus fields from effect descriptions**
4. **Add migration logic to DataModel**
5. **Update templates to handle both legacy and new data**
6. **Create comprehensive migration script**

---

### Phase 1: Pack Data Transformation

#### Step 1.1: Parse Career Preferences

**Input** (string):
```
"Usually Explorator, any but Missionary/Void-Master."
```

**Output** (array):
```json
{
  "careerPreferences": [
    "Explorator",
    "Seneschal",
    "Arch-Militant",
    "Void-Master",
    "Navigator",
    "Astropath Transcendent"
  ],
  "careerExclusions": ["Missionary", "Void-Master"],
  "careerNote": "Usually Explorator"
}
```

**Parsing Strategy**:
```javascript
function parseCareerPreferences(text) {
  const careers = [];
  const exclusions = [];
  let note = "";
  
  // Handle special cases
  if (text.includes("Only")) {
    // "Only Rogue Trader" → just that career
    const match = text.match(/Only\s+([^,\.]+)/i);
    if (match) return { careers: [match[1].trim()], exclusions: [], note: "Exclusive role" };
  }
  
  // Extract "Usually X"
  const usuallyMatch = text.match(/Usually\s+([^,]+)/i);
  if (usuallyMatch) note = `Typically ${usuallyMatch[1].trim()}`;
  
  // Extract "any but X, Y"
  const exclusionMatch = text.match(/any but\s+([^\.]+)/i);
  if (exclusionMatch) {
    const excluded = exclusionMatch[1].split(/[,\/]/).map(s => s.trim());
    exclusions.push(...excluded);
    
    // If "any but", add all careers except excluded
    const allCareers = [
      "Rogue Trader", "Arch-Militant", "Astropath Transcendent",
      "Explorator", "Missionary", "Navigator", "Seneschal", "Void-Master"
    ];
    careers.push(...allCareers.filter(c => !exclusions.some(ex => c.includes(ex))));
  }
  
  return { careers, exclusions, note };
}
```

#### Step 1.2: Parse Subordinates

**Input** (string):
```
"Ship Tech-Priests, Arch-Magi, and Lesser Enginseers."
```

**Output** (array):
```json
{
  "subordinates": [
    "Ship Tech-Priests",
    "Arch-Magi",
    "Lesser Enginseers"
  ]
}
```

**Parsing Strategy**:
```javascript
function parseSubordinates(text) {
  // Remove terminal punctuation
  text = text.replace(/\.$/, '');
  
  // Split on commas and "and"
  const parts = text.split(/,\s*|\s+and\s+/i);
  
  return parts.map(s => s.trim()).filter(s => s.length > 0);
}
```

#### Step 1.3: Parse Important Skills

**Input** (string):
```
"Tech-Use, Chem-Use, Common Lore (Mechine Cult), Forbidden Lore (Mechanicus)"
```

**Output** (array):
```json
{
  "importantSkills": [
    { "name": "Tech-Use", "specialization": null },
    { "name": "Chem-Use", "specialization": null },
    { "name": "Common Lore", "specialization": "Machine Cult" },
    { "name": "Forbidden Lore", "specialization": "Mechanicus" }
  ]
}
```

**Parsing Strategy**:
```javascript
function parseImportantSkills(text) {
  // Split on commas (but respect parentheses)
  const skills = [];
  const regex = /([^,(]+(?:\([^)]+\))?)/g;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    const skillText = match[1].trim();
    
    // Check for specialization in parentheses
    const specMatch = skillText.match(/^([^(]+)\(([^)]+)\)$/);
    if (specMatch) {
      skills.push({
        name: specMatch[1].trim(),
        specialization: specMatch[2].trim()
      });
    } else {
      skills.push({
        name: skillText,
        specialization: null
      });
    }
  }
  
  return skills;
}
```

#### Step 1.4: Extract Abilities from Effect

**Input** (string):
```
"+10 to Emergency Repairs Extended Actions"
```

**Output** (structured):
```json
{
  "abilities": [
    {
      "name": "Emergency Repairs Expertise",
      "description": "<p>Grants +10 bonus to Emergency Repairs Extended Actions</p>",
      "bonus": 10,
      "action": "Emergency Repairs",
      "actionType": "extended"
    }
  ]
}
```

**Parsing Strategy**:
```javascript
function parseEffectToAbility(effectText, roleName) {
  const abilities = [];
  
  // Pattern: "+X to [Action]"
  const bonusMatch = effectText.match(/([+-]\d+)\s+to\s+(.+?)(?:\s+Extended\s+Actions?|$)/i);
  if (bonusMatch) {
    const bonus = parseInt(bonusMatch[1]);
    const action = bonusMatch[2].trim();
    const isExtended = /Extended\s+Actions?/i.test(effectText);
    
    abilities.push({
      name: `${action} Expertise`,
      description: `<p>${effectText}</p>`,
      bonus: bonus,
      action: action,
      actionType: isExtended ? "extended" : "standard"
    });
  }
  
  // Pattern: "can [do something]"
  const specialMatch = effectText.match(/can\s+(.+?)(?:\.|$)/i);
  if (specialMatch) {
    abilities.push({
      name: `${roleName} Authority`,
      description: `<p>${effectText}</p>`,
      action: specialMatch[1].trim()
    });
  }
  
  // Pattern: "+X to Ship Crew Rating"
  const crewMatch = effectText.match(/([+-]\d+)\s+to\s+Ship\s+Crew\s+Rating/i);
  if (crewMatch) {
    abilities.push({
      name: "Crew Rating Bonus",
      description: `<p>${effectText}</p>`,
      bonus: parseInt(crewMatch[1]),
      appliesTo: "crewRating"
    });
  }
  
  return abilities;
}
```

#### Step 1.5: Extract Ship Bonuses

Extract numeric bonuses from `effect` text and populate `shipBonuses`:

**Examples**:
- "+5 to Ship Crew Rating" → `shipBonuses.crewRating: 5`
- "+5 to Navigation (Stellar) Skill" → `skillBonuses.navigation: 5`
- "Additional +5 to BS Tests on Ship Weapons" → `shipBonuses.ballisticSkill: 5`

```javascript
function extractShipBonuses(effectText) {
  const shipBonuses = {
    manoeuvrability: 0,
    detection: 0,
    ballisticSkill: 0,
    crewRating: 0
  };
  
  // Crew Rating bonus
  const crewMatch = effectText.match(/([+-]\d+)\s+to\s+Ship\s+Crew\s+Rating/i);
  if (crewMatch) shipBonuses.crewRating = parseInt(crewMatch[1]);
  
  // Detection bonus
  const detMatch = effectText.match(/([+-]\d+)\s+(?:to\s+)?Detection/i);
  if (detMatch) shipBonuses.detection = parseInt(detMatch[1]);
  
  // BS bonus
  const bsMatch = effectText.match(/([+-]\d+)\s+to\s+BS\s+Tests\s+on\s+Ship\s+Weapons/i);
  if (bsMatch) shipBonuses.ballisticSkill = parseInt(bsMatch[1]);
  
  return shipBonuses;
}
```

---

### Phase 2: DataModel Enhancement

#### Step 2.1: Add migrateData() Method

```javascript
// src/module/data/item/ship-role.mjs

/** @override */
static migrateData(source) {
  const migrated = super.migrateData?.(source) ?? foundry.utils.deepClone(source);
  
  // Migrate careerPreferences: string → array
  if ('careerPreferences' in migrated && typeof migrated.careerPreferences === 'string') {
    const parsed = parseCareerPreferences(migrated.careerPreferences);
    migrated.careerPreferences = parsed.careers;
    migrated.careerNote = parsed.note; // Store note separately
    delete source.careerPreferences; // Prevent double-migration
  }
  
  // Migrate subordinates: string → array
  if ('subordinates' in migrated && typeof migrated.subordinates === 'string') {
    migrated.subordinates = parseSubordinates(migrated.subordinates);
    delete source.subordinates;
  }
  
  // Migrate importantSkills: string → array
  if ('importantSkills' in migrated && typeof migrated.importantSkills === 'string') {
    migrated.importantSkills = parseImportantSkills(migrated.importantSkills);
    delete source.importantSkills;
  }
  
  // Migrate effect → abilities array (if abilities empty)
  if ('effect' in migrated && migrated.effect && (!migrated.abilities || migrated.abilities.length === 0)) {
    migrated.abilities = parseEffectToAbility(migrated.effect, migrated.name || 'Ship Role');
    // Keep effect for backward compatibility
  }
  
  // Extract ship bonuses from effect text
  if ('effect' in migrated && migrated.effect) {
    const bonuses = extractShipBonuses(migrated.effect);
    if (!migrated.shipBonuses) migrated.shipBonuses = {};
    Object.assign(migrated.shipBonuses, bonuses);
  }
  
  return migrated;
}
```

#### Step 2.2: Update Schema to Support Both Formats

Add optional fields for transition period:

```javascript
static defineSchema() {
  const fields = foundry.data.fields;
  return {
    ...super.defineSchema(),
    
    identifier: new IdentifierField({ required: true, blank: true }),
    
    // Role rank/priority
    rank: new fields.NumberField({ required: true, initial: 1, min: 1, integer: true }),
    
    // Role purpose/function
    purpose: new fields.HTMLField({ required: true, blank: true }),
    
    // Career preferences (modern: array, legacy: string)
    careerPreferences: new fields.ArrayField(
      new fields.StringField({ required: true }),
      { required: true, initial: [] }
    ),
    
    // Career note (for "Usually X" text)
    careerNote: new fields.StringField({ required: false, blank: true }),
    
    // Subordinate roles (modern: array, legacy: string)
    subordinates: new fields.ArrayField(
      new fields.StringField({ required: true }),
      { required: true, initial: [] }
    ),
    
    // Important skills (modern: array of objects, legacy: string)
    importantSkills: new fields.ArrayField(
      new fields.SchemaField({
        name: new fields.StringField({ required: true }),
        specialization: new fields.StringField({ required: false, blank: true })
      }),
      { required: true, initial: [] }
    ),
    
    // Special abilities/actions (modern structured data)
    abilities: new fields.ArrayField(
      new fields.SchemaField({
        name: new fields.StringField({ required: true }),
        description: new fields.HTMLField({ required: true }),
        bonus: new fields.NumberField({ required: false, integer: true }),
        action: new fields.StringField({ required: false, blank: true }),
        actionType: new fields.StringField({ 
          required: false, 
          blank: true,
          choices: ["standard", "extended", "free", "reaction", "passive"]
        }),
        appliesTo: new fields.StringField({ required: false, blank: true }),
        skill: new fields.StringField({ required: false, blank: true })
      }),
      { required: true, initial: [] }
    ),
    
    // Legacy effect field (kept for backward compatibility)
    effect: new fields.HTMLField({ required: false, blank: true }),
    
    // Skill bonuses (structured)
    skillBonuses: new fields.SchemaField({
      command: new fields.NumberField({ required: false, initial: 0, integer: true }),
      navigation: new fields.NumberField({ required: false, initial: 0, integer: true }),
      awareness: new fields.NumberField({ required: false, initial: 0, integer: true }),
      perception: new fields.NumberField({ required: false, initial: 0, integer: true }),
      // ... add more as needed
    }, { required: false }),
    
    // Ship bonuses (structured)
    shipBonuses: new fields.SchemaField({
      manoeuvrability: new fields.NumberField({ required: true, initial: 0, integer: true }),
      detection: new fields.NumberField({ required: true, initial: 0, integer: true }),
      ballisticSkill: new fields.NumberField({ required: true, initial: 0, integer: true }),
      crewRating: new fields.NumberField({ required: true, initial: 0, integer: true })
    }, { required: true }),
    
    // Notes
    notes: new fields.StringField({ required: false, blank: true })
  };
}
```

#### Step 2.3: Update Display Getters

```javascript
/**
 * Get formatted career preferences.
 * @type {string}
 */
get careerPreferencesLabel() {
  // Handle both array and string (legacy)
  if (Array.isArray(this.careerPreferences)) {
    if (!this.careerPreferences.length) return "-";
    let label = this.careerPreferences.join(", ");
    if (this.careerNote) label = `${this.careerNote}; ${label}`;
    return label;
  }
  // Legacy string handling
  return this.careerPreferences || "-";
}

/**
 * Get formatted important skills.
 * @type {string}
 */
get importantSkillsLabel() {
  // Handle both array of objects and string (legacy)
  if (Array.isArray(this.importantSkills)) {
    if (!this.importantSkills.length) return "-";
    return this.importantSkills.map(skill => {
      if (skill.specialization) {
        return `${skill.name} (${skill.specialization})`;
      }
      return skill.name;
    }).join(", ");
  }
  // Legacy string handling
  return this.importantSkills || "-";
}

/**
 * Get formatted subordinates.
 * @type {string}
 */
get subordinatesLabel() {
  // Handle both array and string (legacy)
  if (Array.isArray(this.subordinates)) {
    if (!this.subordinates.length) return "-";
    return this.subordinates.join(", ");
  }
  // Legacy string handling
  return this.subordinates || "-";
}

/**
 * Get primary ability description.
 * @type {string}
 */
get primaryAbility() {
  if (this.abilities && this.abilities.length > 0) {
    const ability = this.abilities[0];
    return ability.description || ability.name;
  }
  // Fallback to legacy effect
  return this.effect || "";
}

/**
 * Get all ship bonuses as array for display.
 * @type {Array<{label: string, value: number}>}
 */
get shipBonusesArray() {
  const bonuses = [];
  const labels = {
    manoeuvrability: "Manoeuvrability",
    detection: "Detection",
    ballisticSkill: "Ballistic Skill",
    crewRating: "Crew Rating"
  };
  
  for (const [key, label] of Object.entries(labels)) {
    const value = this.shipBonuses?.[key] || 0;
    if (value !== 0) {
      bonuses.push({ 
        label, 
        value,
        display: value > 0 ? `+${value}` : `${value}`
      });
    }
  }
  
  return bonuses;
}
```

---

### Phase 3: Template Updates

#### Step 3.1: Update ship-role-panel.hbs

Current template:
```handlebars
<div class="rt-ship-role-details">
    {{#each shipRoles as |role|}}
        <div class="rt-ship-role-detail">
            <h3>{{role.name}}</h3>
            <p><strong>{{localize "RT.ShipRole.Purpose"}}:</strong> {{role.system.purpose}}</p>
            <p><strong>{{localize "RT.ShipRole.Effect"}}:</strong> {{role.system.effect}}</p>
        </div>
    {{/each}}
</div>
```

**New template (enhanced with all fields)**:
```handlebars
<div class="rt-panel spacer rt-grid-col-3 rt-grid-row-1 rt-panel-ship-roles">
    <div class="rt-panel-header collapsible-header" data-panel="ship-roles">
        <i class="fas fa-user-tie"></i>
        <span class="rt-panel-title">{{localize "RT.ShipRole.Header"}}</span>
        <span class="rt-panel-count">{{shipRoles.length}}</span>
        <i class="fas fa-chevron-down collapse-icon"></i>
    </div>
    
    <div class="rt-panel-body collapsible-body" data-panel-body="ship-roles">
        {{#if shipRoles.length}}
            <div class="rt-ship-roles-list">
                {{#each shipRoles as |role|}}
                    <div class="rt-ship-role-card">
                        <div class="rt-ship-role-header">
                            <button class="rt-ship-role-name" data-action="itemEdit" data-item-id="{{role._id}}" type="button">
                                <img class="rt-item-img" src="{{role.img}}" alt="{{role.name}}" />
                                <span class="rt-role-name-text">{{role.name}}</span>
                            </button>
                            <span class="rt-role-rank-badge" data-tooltip="Rank {{role.system.rank}}">
                                R{{role.system.rank}}
                            </span>
                            <button class="rt-control-icon" data-action="itemDelete" data-item-id="{{role._id}}" data-tooltip="Remove Role">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                        
                        <div class="rt-ship-role-body">
                            {{#if role.system.purpose}}
                            <div class="rt-role-section">
                                <strong>{{localize "RT.ShipRole.Purpose"}}:</strong>
                                <span>{{{role.system.purpose}}}</span>
                            </div>
                            {{/if}}
                            
                            {{#if role.system.careerPreferencesLabel}}
                            <div class="rt-role-section">
                                <strong>{{localize "RT.ShipRole.CareerPreferences"}}:</strong>
                                <span>{{role.system.careerPreferencesLabel}}</span>
                            </div>
                            {{/if}}
                            
                            {{#if role.system.subordinatesLabel}}
                            <div class="rt-role-section">
                                <strong>{{localize "RT.ShipRole.Subordinates"}}:</strong>
                                <span>{{role.system.subordinatesLabel}}</span>
                            </div>
                            {{/if}}
                            
                            {{#if role.system.importantSkillsLabel}}
                            <div class="rt-role-section">
                                <strong>{{localize "RT.ShipRole.ImportantSkills"}}:</strong>
                                <span class="rt-role-skills">{{role.system.importantSkillsLabel}}</span>
                            </div>
                            {{/if}}
                            
                            {{!-- Abilities (modern) --}}
                            {{#if role.system.abilities.length}}
                            <div class="rt-role-section rt-role-abilities">
                                <strong>{{localize "RT.ShipRole.Abilities"}}:</strong>
                                <ul class="rt-role-abilities-list">
                                    {{#each role.system.abilities as |ability|}}
                                    <li class="rt-role-ability">
                                        <span class="rt-ability-name">{{ability.name}}</span>
                                        {{#if ability.bonus}}
                                        <span class="rt-ability-bonus">{{#if (gt ability.bonus 0)}}+{{/if}}{{ability.bonus}}</span>
                                        {{/if}}
                                        <div class="rt-ability-desc">{{{ability.description}}}</div>
                                    </li>
                                    {{/each}}
                                </ul>
                            </div>
                            {{else if role.system.effect}}
                            {{!-- Legacy effect fallback --}}
                            <div class="rt-role-section rt-role-effect">
                                <strong>{{localize "RT.ShipRole.Effect"}}:</strong>
                                <span>{{{role.system.effect}}}</span>
                            </div>
                            {{/if}}
                            
                            {{!-- Ship Bonuses --}}
                            {{#if role.system.shipBonusesArray.length}}
                            <div class="rt-role-section rt-role-bonuses">
                                <strong>{{localize "RT.ShipRole.ShipBonuses"}}:</strong>
                                <div class="rt-bonus-badges">
                                    {{#each role.system.shipBonusesArray as |bonus|}}
                                    <span class="rt-bonus-badge {{#if (gt bonus.value 0)}}rt-bonus-positive{{else}}rt-bonus-negative{{/if}}">
                                        {{bonus.label}}: {{bonus.display}}
                                    </span>
                                    {{/each}}
                                </div>
                            </div>
                            {{/if}}
                        </div>
                    </div>
                {{/each}}
            </div>
        {{else}}
            <div class="rt-empty-state">
                <i class="fas fa-user-tie fa-3x"></i>
                <p>No ship roles assigned</p>
                <button type="button" data-action="itemCreate" data-item-type="shipRole" class="rt-btn-create">
                    <i class="fas fa-plus"></i> Add Ship Role
                </button>
            </div>
        {{/if}}
        
        <div class="rt-panel-footer">
            <button type="button" data-action="itemCreate" data-item-type="shipRole" class="rt-btn-secondary">
                <i class="fas fa-plus"></i> {{localize "RT.ShipRole.AddRole"}}
            </button>
        </div>
    </div>
</div>
```

#### Step 3.2: Update Compendium Browser

Add shipRole-specific metadata display in `compendium-browser.mjs`:

```javascript
// In _prepareFilteredResults()
if (entry.type === "shipRole" && entry.system) {
    result.shipRoleData = this._prepareShipRoleData(entry.system);
}

/**
 * Prepare ship role-specific display data.
 * @param {object} system  The ship role system data
 * @returns {object}       Prepared ship role data
 */
_prepareShipRoleData(system) {
    const rank = system.rank || 0;
    const rankLabel = `Rank ${rank}`;
    
    // Get career preferences label (handle both array and string)
    let careersLabel = "-";
    if (Array.isArray(system.careerPreferences)) {
        careersLabel = system.careerPreferences.slice(0, 2).join(", ");
        if (system.careerPreferences.length > 2) {
            careersLabel += ` +${system.careerPreferences.length - 2} more`;
        }
    } else if (typeof system.careerPreferences === 'string') {
        // Truncate long strings
        careersLabel = system.careerPreferences.length > 40 
            ? system.careerPreferences.substring(0, 37) + "..." 
            : system.careerPreferences;
    }
    
    // Get abilities summary
    let abilitiesSummary = "";
    if (system.abilities && system.abilities.length > 0) {
        const firstAbility = system.abilities[0];
        abilitiesSummary = firstAbility.name || "";
        if (firstAbility.bonus) {
            abilitiesSummary += ` (${firstAbility.bonus > 0 ? '+' : ''}${firstAbility.bonus})`;
        }
    } else if (system.effect) {
        // Fallback to legacy effect (truncated)
        abilitiesSummary = system.effect.length > 60 
            ? system.effect.substring(0, 57) + "..." 
            : system.effect;
    }
    
    // Get ship bonuses count
    const bonusCount = Object.values(system.shipBonuses || {}).filter(v => v !== 0).length;
    
    return {
        rank,
        rankLabel,
        careersLabel,
        abilitiesSummary,
        hasBonuses: bonusCount > 0,
        bonusCount
    };
}
```

**Template update** (`compendium-browser.hbs`):
```handlebars
{{!-- Ship Role-specific metadata --}}
{{#if shipRoleData}}
<div class="item-stats item-stats--ship-role">
    <span class="stat-badge stat-badge--rank">
        <i class="fas fa-star"></i> {{shipRoleData.rankLabel}}
    </span>
    <span class="stat-badge stat-badge--careers" title="{{shipRoleData.careersLabel}}">
        <i class="fas fa-users"></i> {{shipRoleData.careersLabel}}
    </span>
    {{#if shipRoleData.hasBonuses}}
    <span class="stat-badge stat-badge--bonuses">
        <i class="fas fa-arrow-up"></i> {{shipRoleData.bonusCount}} Bonus{{#if (gt shipRoleData.bonusCount 1)}}es{{/if}}
    </span>
    {{/if}}
</div>
{{#if shipRoleData.abilitiesSummary}}
<div class="item-ability-preview">
    {{shipRoleData.abilitiesSummary}}
</div>
{{/if}}
{{/if}}
```

---

### Phase 4: Migration Script

Create `scripts/migrate-ship-roles.mjs`:

```javascript
#!/usr/bin/env node

/**
 * Ship Roles Migration Script
 * Migrates all 22 ship role items from legacy string fields to V13 array schema
 * 
 * Usage:
 *   node scripts/migrate-ship-roles.mjs [--dry-run] [--verbose]
 * 
 * Options:
 *   --dry-run   Preview changes without modifying files
 *   --verbose   Show detailed transformation logs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PACK_PATH = path.join(__dirname, '../src/packs/rt-items-ship-roles/_source');
const BACKUP_ROOT = path.join(__dirname, '../src/packs/_backups');

// CLI flags
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');

// Career list for "any but" parsing
const ALL_CAREERS = [
    "Rogue Trader",
    "Arch-Militant",
    "Astropath Transcendent",
    "Explorator",
    "Missionary",
    "Navigator",
    "Seneschal",
    "Void-Master"
];

/**
 * Parse career preferences string to structured array
 */
function parseCareerPreferences(text) {
    const careers = [];
    let note = "";
    
    if (!text || text.trim() === "") {
        return { careers: [], note: "" };
    }
    
    // Handle "Only X" (exclusive role)
    const onlyMatch = text.match(/Only\s+([^,\.]+)/i);
    if (onlyMatch) {
        return {
            careers: [onlyMatch[1].trim()],
            note: "Exclusive role"
        };
    }
    
    // Extract "Usually X"
    const usuallyMatch = text.match(/Usually\s+([^,]+)/i);
    if (usuallyMatch) {
        note = `Typically ${usuallyMatch[1].trim()}`;
    }
    
    // Handle "any but X, Y, Z"
    const anyButMatch = text.match(/any but\s+([^\.]+)/i);
    if (anyButMatch) {
        const excludedText = anyButMatch[1];
        const excluded = excludedText.split(/[,\/]/).map(s => s.trim());
        
        // Add all careers except excluded ones
        ALL_CAREERS.forEach(career => {
            const isExcluded = excluded.some(ex => 
                career.toLowerCase().includes(ex.toLowerCase()) || 
                ex.toLowerCase().includes(career.toLowerCase())
            );
            if (!isExcluded) {
                careers.push(career);
            }
        });
    } else {
        // Try to extract explicit career list
        const explicitCareers = text.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g);
        if (explicitCareers) {
            explicitCareers.forEach(c => {
                const career = c.trim();
                if (ALL_CAREERS.some(ac => ac.includes(career) || career.includes(ac))) {
                    if (!careers.includes(career)) careers.push(career);
                }
            });
        }
    }
    
    // If no careers extracted, add note as fallback
    if (careers.length === 0 && !note) {
        note = text.trim();
    }
    
    return { careers, note };
}

/**
 * Parse subordinates string to array
 */
function parseSubordinates(text) {
    if (!text || text.trim() === "") return [];
    
    // Remove terminal punctuation
    text = text.replace(/\.$/, '');
    
    // Split on commas and "and"
    const parts = text.split(/,\s*|\s+and\s+/i);
    
    return parts.map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Parse important skills string to structured array
 */
function parseImportantSkills(text) {
    if (!text || text.trim() === "") return [];
    
    const skills = [];
    
    // Match skill patterns including parentheses
    const regex = /([^,(]+(?:\([^)]+\))?)/g;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
        const skillText = match[1].trim();
        if (!skillText) continue;
        
        // Check for specialization in parentheses
        const specMatch = skillText.match(/^([^(]+)\(([^)]+)\)$/);
        if (specMatch) {
            skills.push({
                name: specMatch[1].trim(),
                specialization: specMatch[2].trim()
            });
        } else {
            skills.push({
                name: skillText,
                specialization: ""
            });
        }
    }
    
    return skills;
}

/**
 * Extract structured abilities from effect text
 */
function parseEffectToAbilities(effectText, roleName) {
    if (!effectText || effectText.trim() === "") return [];
    
    const abilities = [];
    
    // Pattern: "+X to [Action] Extended Actions"
    const extendedMatch = effectText.match(/([+-]\d+)\s+to\s+"?([^"]+?)"?\s+Extended\s+Actions?/i);
    if (extendedMatch) {
        const bonus = parseInt(extendedMatch[1]);
        const action = extendedMatch[2].trim();
        
        abilities.push({
            name: `${action} Expertise`,
            description: `<p>${effectText}</p>`,
            bonus: bonus,
            action: action,
            actionType: "extended"
        });
        
        return abilities;
    }
    
    // Pattern: "+X to [Skill/Test]"
    const skillBonusMatch = effectText.match(/([+-]\d+)\s+to\s+(?:all\s+)?([^\.]+?)(?:\s+(?:Tests?|Checks?|Skill))?(?:\s+made)?/i);
    if (skillBonusMatch) {
        const bonus = parseInt(skillBonusMatch[1]);
        const target = skillBonusMatch[2].trim();
        
        abilities.push({
            name: `${roleName} Bonus`,
            description: `<p>${effectText}</p>`,
            bonus: bonus,
            skill: target,
            actionType: "passive"
        });
        
        return abilities;
    }
    
    // Pattern: "can [do something]"
    const specialMatch = effectText.match(/can\s+(.+?)(?:\.|$)/i);
    if (specialMatch) {
        abilities.push({
            name: `${roleName} Authority`,
            description: `<p>${effectText}</p>`,
            action: specialMatch[1].trim(),
            actionType: "special"
        });
        
        return abilities;
    }
    
    // Fallback: create generic ability
    abilities.push({
        name: `${roleName} Effect`,
        description: `<p>${effectText}</p>`,
        actionType: "passive"
    });
    
    return abilities;
}

/**
 * Extract ship bonuses from effect text
 */
function extractShipBonuses(effectText) {
    const bonuses = {
        manoeuvrability: 0,
        detection: 0,
        ballisticSkill: 0,
        crewRating: 0
    };
    
    if (!effectText) return bonuses;
    
    // Crew Rating bonus
    const crewMatch = effectText.match(/([+-]\d+)\s+to\s+Ship\s+Crew\s+Rating/i);
    if (crewMatch) bonuses.crewRating = parseInt(crewMatch[1]);
    
    // Detection bonus
    const detMatch = effectText.match(/([+-]\d+)\s+(?:to\s+)?Detection/i);
    if (detMatch) bonuses.detection = parseInt(detMatch[1]);
    
    // BS bonus (ship weapons)
    const bsMatch = effectText.match(/([+-]\d+)\s+to\s+BS\s+Tests?\s+on\s+Ship\s+Weapons/i);
    if (bsMatch) bonuses.ballisticSkill = parseInt(bsMatch[1]);
    
    return bonuses;
}

/**
 * Migrate a single ship role item
 */
function migrateShipRole(item) {
    const migrated = JSON.parse(JSON.stringify(item)); // Deep clone
    
    // Track changes
    const changes = [];
    
    // Migrate careerPreferences
    if (typeof migrated.system.careerPreferences === 'string') {
        const original = migrated.system.careerPreferences;
        const parsed = parseCareerPreferences(original);
        migrated.system.careerPreferences = parsed.careers;
        if (parsed.note) {
            migrated.system.careerNote = parsed.note;
        }
        changes.push(`careerPreferences: "${original}" → [${parsed.careers.length} items]`);
        if (parsed.note) changes.push(`careerNote: "${parsed.note}"`);
    }
    
    // Migrate subordinates
    if (typeof migrated.system.subordinates === 'string') {
        const original = migrated.system.subordinates;
        const parsed = parseSubordinates(original);
        migrated.system.subordinates = parsed;
        changes.push(`subordinates: "${original}" → [${parsed.length} items]`);
    }
    
    // Migrate importantSkills
    if (typeof migrated.system.importantSkills === 'string') {
        const original = migrated.system.importantSkills;
        const parsed = parseImportantSkills(original);
        migrated.system.importantSkills = parsed;
        changes.push(`importantSkills: "${original}" → [${parsed.length} items]`);
    }
    
    // Extract abilities from effect (if abilities empty)
    if (migrated.system.effect && (!migrated.system.abilities || migrated.system.abilities.length === 0)) {
        const abilities = parseEffectToAbilities(migrated.system.effect, item.name);
        migrated.system.abilities = abilities;
        changes.push(`abilities: extracted ${abilities.length} from effect`);
    }
    
    // Extract ship bonuses
    if (migrated.system.effect) {
        const bonuses = extractShipBonuses(migrated.system.effect);
        const oldBonuses = migrated.system.shipBonuses || {};
        migrated.system.shipBonuses = bonuses;
        
        const nonZero = Object.entries(bonuses).filter(([k, v]) => v !== 0);
        if (nonZero.length > 0) {
            changes.push(`shipBonuses: ${nonZero.map(([k, v]) => `${k}=${v}`).join(', ')}`);
        }
    }
    
    return { migrated, changes };
}

/**
 * Create timestamped backup
 */
function createBackup() {
    const timestamp = Date.now();
    const backupDir = path.join(BACKUP_ROOT, `ship-roles-${timestamp}`);
    
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
    
    // Copy all source files
    const files = fs.readdirSync(PACK_PATH).filter(f => f.endsWith('.json'));
    for (const file of files) {
        const src = path.join(PACK_PATH, file);
        const dest = path.join(backupDir, file);
        fs.copyFileSync(src, dest);
    }
    
    console.log(`✅ Backup created: ${backupDir}`);
    return backupDir;
}

/**
 * Main migration function
 */
function main() {
    console.log("=".repeat(60));
    console.log("  Ship Roles Migration Script");
    console.log("  Migrating 22 ship role items to V13 schema");
    console.log("=".repeat(60));
    console.log("");
    
    if (DRY_RUN) {
        console.log("⚠️  DRY RUN MODE - No files will be modified");
        console.log("");
    }
    
    // Read all ship role files
    const files = fs.readdirSync(PACK_PATH).filter(f => f.endsWith('.json'));
    console.log(`📂 Found ${files.length} ship role files`);
    console.log("");
    
    // Create backup (unless dry run)
    if (!DRY_RUN) {
        createBackup();
        console.log("");
    }
    
    // Process each file
    let successCount = 0;
    let errorCount = 0;
    const allChanges = [];
    
    for (const file of files) {
        const filePath = path.join(PACK_PATH, file);
        
        try {
            // Read and parse
            const content = fs.readFileSync(filePath, 'utf8');
            const item = JSON.parse(content);
            
            // Migrate
            const { migrated, changes } = migrateShipRole(item);
            
            // Log changes
            if (VERBOSE || DRY_RUN) {
                console.log(`📝 ${item.name} (${file})`);
                if (changes.length > 0) {
                    changes.forEach(c => console.log(`   • ${c}`));
                } else {
                    console.log(`   ✓ No changes needed`);
                }
                console.log("");
            }
            
            allChanges.push({ name: item.name, file, changes });
            
            // Write migrated data (unless dry run)
            if (!DRY_RUN) {
                fs.writeFileSync(filePath, JSON.stringify(migrated, null, 2));
            }
            
            successCount++;
            
        } catch (error) {
            console.error(`❌ Error processing ${file}:`, error.message);
            errorCount++;
        }
    }
    
    // Summary
    console.log("");
    console.log("=".repeat(60));
    console.log("  Migration Summary");
    console.log("=".repeat(60));
    console.log(`✅ Successfully processed: ${successCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📊 Total changes: ${allChanges.reduce((sum, c) => sum + c.changes.length, 0)}`);
    
    if (DRY_RUN) {
        console.log("");
        console.log("⚠️  This was a DRY RUN - no files were modified");
        console.log("   Run without --dry-run to apply changes");
    } else {
        console.log("");
        console.log("✅ Migration complete!");
        console.log(`   Backup available in: ${BACKUP_ROOT}`);
    }
    
    console.log("=".repeat(60));
}

// Run migration
main();
```

**Usage**:
```bash
# Preview changes
node scripts/migrate-ship-roles.mjs --dry-run --verbose

# Execute migration
node scripts/migrate-ship-roles.mjs

# Just execute (minimal output)
node scripts/migrate-ship-roles.mjs
```

---

## 📝 Localization Updates

Add to `en.json`:

```json
{
  "RT.ShipRole": {
    "Header": "Ship Roles",
    "Role": "Role",
    "Rank": "Rank",
    "Purpose": "Purpose",
    "Effect": "Effect",
    "CareerPreferences": "Career Preferences",
    "Subordinates": "Subordinates",
    "ImportantSkills": "Important Skills",
    "Abilities": "Abilities",
    "ShipBonuses": "Ship Bonuses",
    "AddRole": "Add Ship Role",
    "ExclusiveRole": "Exclusive Role",
    "TypicallyRole": "Typically {role}"
  }
}
```

---

## 🧪 Testing Plan

### Phase 1: Data Migration Testing

1. **Dry Run Validation**
   - Run `node scripts/migrate-ship-roles.mjs --dry-run --verbose`
   - Verify all 22 items show expected transformations
   - Check for parsing errors in career/skill fields

2. **Career Parsing Tests**
   - "Only Rogue Trader" → `["Rogue Trader"]`
   - "Usually Explorator, any but Missionary/Void-Master" → `["Rogue Trader", "Arch-Militant", ...]`
   - "Seneschal, Navigator, Explorers, or other scholars" → `["Seneschal", "Navigator", "Explorator"]`

3. **Skills Parsing Tests**
   - "Tech-Use, Common Lore (Machine Cult)" → `[{name: "Tech-Use", spec: ""}, {name: "Common Lore", spec: "Machine Cult"}]`
   - Verify all 22 items parse without errors

4. **Abilities Extraction Tests**
   - "+10 to Emergency Repairs Extended Actions" → structured ability with bonus
   - "+5 to Ship Crew Rating" → ability + shipBonuses.crewRating = 5
   - "can grant Exceptional Leader Ability" → special ability

5. **Execute Migration**
   - Run `node scripts/migrate-ship-roles.mjs`
   - Verify backup created
   - Verify all 22 JSON files updated

### Phase 2: Build Testing

1. **Build Pack**
   - Run `npm run build`
   - Verify no compilation errors
   - Check pack output for 22 items

2. **Data Integrity**
   - Open Foundry VTT
   - Check Items sidebar → Ship Roles compendium
   - Verify all 22 items load

### Phase 3: UI Testing

1. **Compendium Browser**
   - Open RT Compendium Browser
   - Filter by "shipRole"
   - Verify no `[object Object]` displays
   - Check rank badges, career labels, ability summaries

2. **Character Sheet**
   - Create/open Acolyte
   - Navigate to Dynasty tab
   - Verify Ship Role panel displays correctly
   - Drag ship role from compendium → dynasty tab
   - Check role card displays all fields
   - Verify careerPreferences, subordinates, skills show as readable text

3. **Item Sheet**
   - Open ship role item sheet
   - Verify all fields editable
   - Check arrays display correctly
   - Add/remove skills, careers, abilities

### Phase 4: Regression Testing

1. **Legacy Data Compatibility**
   - Test with old actor data (if any actors have ship roles)
   - Verify migrateData() handles strings gracefully
   - Check display properties return strings for both formats

2. **Tooltip/Hover States**
   - Hover over role cards
   - Check tooltips display correctly
   - Verify no console errors

---

## 📚 Documentation Updates

### AGENTS.md

Add to "Item Types" section:
```markdown
| Type | Description | Notes |
|------|-------------|-------|
| `shipRole` | Ship officer roles | Arrays for careers/subordinates/skills, abilities array for structured bonuses |
```

### ROADMAP.md

Update:
```markdown
## V13 Refactors

- [x] Ship Components (262 items)
- [x] Ship Weapons (50 items)
- [ ] Ship Roles (22 items) ← IN PROGRESS
- [ ] Skills system
- [ ] Talents system
```

---

## 🎯 Success Metrics

| Metric | Target | Current Status |
|--------|--------|----------------|
| **`[object Object]` Instances** | 0 | TBD (likely 20+) |
| **Items Migrated** | 22 | 0 |
| **Migration Errors** | 0 | N/A |
| **Build Status** | Pass | Pass (pre-migration) |
| **Compendium Browsable** | Yes | TBD |
| **Fields Parseable** | 100% | 0% (strings) |
| **Abilities Structured** | 22/22 | 0/22 |
| **Ship Bonuses Populated** | ~8/22 | 0/22 |

---

## 🚀 Implementation Timeline

**Estimated Duration**: 2-3 hours

1. **Phase 1: Migration Script** (45 min)
   - Write parsing functions
   - Test on sample items
   - Dry-run validation

2. **Phase 2: DataModel Updates** (30 min)
   - Add migrateData() method
   - Update getters for backward compatibility
   - Add new display properties

3. **Phase 3: Template Updates** (30 min)
   - Modernize ship-role-panel.hbs
   - Add compendium browser metadata
   - Test rendering

4. **Phase 4: Testing & Refinement** (45 min)
   - Execute migration
   - Build and test in Foundry
   - Fix any edge cases
   - Document completion

---

## 🔄 Rollback Plan

If issues arise:

1. **Stop using migrated data**
   - Restore from backup: `src/packs/_backups/ship-roles-{timestamp}/`
   - Copy all `.json` files back to `_source/`

2. **Rebuild packs**
   - Run `npm run build`
   - Restart Foundry

3. **Revert code changes**
   - Revert DataModel changes
   - Revert template changes
   - Keep migration script for later fixes

---

## ✅ Completion Checklist

- [ ] Migration script created and tested
- [ ] Dry-run validation passed (all 22 items)
- [ ] DataModel migrateData() added
- [ ] Display getters updated
- [ ] ship-role-panel.hbs modernized
- [ ] Compendium browser enhanced
- [ ] Localization strings added
- [ ] Migration executed successfully
- [ ] Build passed
- [ ] Foundry testing passed
- [ ] No `[object Object]` displays
- [ ] Documentation updated (AGENTS.md, ROADMAP.md)
- [ ] Completion report created

---

**Status**: 🟡 **PLANNING COMPLETE** - Ready for implementation  
**Next Step**: Execute Phase 1 (Migration Script Creation)

---

*Analysis completed 2026-01-09*
