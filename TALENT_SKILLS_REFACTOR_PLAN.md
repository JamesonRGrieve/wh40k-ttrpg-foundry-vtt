# Talent Pack & Skills System Refactor Plan

**Date**: 2026-01-14
**Status**: Planning Complete - Ready for Implementation
**Scope**: 652 talent files, grants system unification, skills system cleanup

---

## Executive Summary

This refactor addresses critical architectural debt in the Talent and Skills systems:

1. **Dual Grants Implementation**: Two separate grant processors with different logic (`talent-grants.mjs` vs `origin-grants-processor.mjs`)
2. **Talent Data Quality**: 652 talents with inconsistent modifiers/grants vs benefit text
3. **Skills System Issues**: Specialist skills missing characteristic inheritance, redundant fields, fragile name conversion
4. **Modifier System**: Situational modifiers defined but never displayed in roll dialogs

**Priority**: Fix system foundation FIRST, then audit talent data. This prevents rework and ensures correct data structure.

---

## Current State Analysis

### Grants System - The Core Problem

**Two Separate Implementations**:

| Feature | talent-grants.mjs (395 lines) | origin-grants-processor.mjs (479 lines) |
|---------|------------------------------|----------------------------------------|
| **Use Case** | Immediate talent application | Batch origin path processing |
| **Recursion** | 3-level depth for nested talents | No recursion |
| **UUID Lookup** | Compendium search with fallback | UUID-first with fallback |
| **Skill Handling** | Direct actor.system.skills update | Item creation approach |
| **Choice Grants** | ❌ No support | ✅ Full support |
| **Error Handling** | Console errors + notifications | Silent fallbacks with warnings |
| **Sophistication** | Basic | Advanced (stored rolls, preview) |

**Critical Differences**:
- Origin processor has choice grant support, preview mode, stored roll handling
- Talent processor has recursive grant support for talents that grant talents
- Different skill application strategies (embedded data vs item creation)
- Different error handling philosophies

### Talent Data Model (talent.mjs)

**Current Schema** (370 lines):
```javascript
{
  identifier: IdentifierField,
  category: StringField,
  tier: NumberField (0-3),
  prerequisites: {
    text: StringField,
    characteristics: ObjectField,
    skills: ArrayField,
    talents: ArrayField
  },
  aptitudes: ArrayField,
  cost: NumberField,
  benefit: HTMLField,  // ⚠️ Often doesn't match actual modifiers
  isPassive: BooleanField,
  rollConfig: {
    characteristic: StringField,
    skill: StringField,
    modifier: NumberField,
    description: StringField
  },
  stackable: BooleanField,
  rank: NumberField,
  specialization: StringField,
  notes: StringField,
  grants: {
    skills: ArrayField,      // { name, specialization, level }
    talents: ArrayField,     // { name, specialization, uuid }
    traits: ArrayField,      // { name, level, uuid }
    specialAbilities: ArrayField  // { name, description }
  },
  modifiers: ModifiersTemplate  // From mixin
}
```

**Issues**:
1. `benefit` field is plain text that doesn't drive mechanics
2. Many talents have modifiers in benefit but not in `modifiers` field
3. No validation that benefit matches grants/modifiers
4. `rollConfig` rarely used (only 5-10 talents are rollable)

### Skills System (creature.mjs)

**Current Structure**:
```javascript
skills: {
  // Standard skills
  acrobatics: {
    label: "Acrobatics",
    characteristic: "Ag",
    advanced: true,
    basic: false,         // ⚠️ Redundant (inverse of advanced)
    trained: false,
    plus10: false,
    plus20: false,
    bonus: 0,
    notes: "",
    hidden: false,
    cost: 0,
    current: 0           // Derived
  },
  
  // Specialist skill groups
  commonLore: {
    label: "Common Lore",
    characteristic: "Int",
    advanced: true,
    basic: false,
    // ... (parent fields mostly unused)
    entries: [
      {
        name: "Imperium",
        slug: "imperium",
        characteristic: "Int",  // ⚠️ Must manually copy from parent
        advanced: true,         // ⚠️ Must manually copy from parent
        basic: false,
        trained: true,
        plus10: false,
        plus20: false,
        bonus: 0,
        notes: "",
        cost: 0,
        current: 0
      }
    ]
  }
}
```

**Issues**:
1. **Characteristic Inheritance**: Specialist entries must manually copy `characteristic` from parent
2. **Redundant Fields**: `basic` is always `!advanced`
3. **Fragile Name Conversion**: `skillGrant.name.toLowerCase().replace(/\s+/g, '').replace(/-/g, '')` fails on edge cases
4. **Hidden Skills**: Three legacy skills (athletics, parry, stealth) kept for compatibility
5. **No Validation**: No checks that specialist entries match parent type

### Modifier System (modifiers-template.mjs)

**Current Schema**:
```javascript
modifiers: {
  characteristics: { ws: 10, bs: 5, ... },
  skills: { dodge: 10, awareness: 5, ... },
  combat: {
    attack: 0,
    damage: 0,
    penetration: 0,
    defense: 0,
    initiative: 0,
    speed: 0
  },
  resources: {
    wounds: 0,
    fate: 0,
    insanity: 0,
    corruption: 0
  },
  other: [
    { key: "", label: "", value: 0, mode: "add" }
  ],
  situational: {
    characteristics: [
      { key: "ws", value: 10, condition: "when charging", icon: "fa-bolt" }
    ],
    skills: [...],
    combat: [...]
  }
}
```

**Issues**:
1. **Situational Modifiers Hidden**: Defined in data but never shown in roll dialogs
2. **No Conditional Logic**: `condition` field is display-only text
3. **Limited Modes**: Only 5 modes (add, multiply, override, downgrade, upgrade) - no "use better of"
4. **No Stacking Rules**: Multiple sources just add together

---

## Implementation Phases

### PHASE 1: Core System Fixes (Foundation)

**Goal**: Fix all critical system issues before touching talent data

#### 1.1 Unify Grants Processors ⭐ CRITICAL

**Approach**: Merge both processors into single `grants-processor.mjs` with mode switching

**New Unified Architecture**:

```javascript
// src/module/utils/grants-processor.mjs

export class GrantsProcessor {
  
  /**
   * Main entry point - supports both immediate and batch modes.
   * 
   * @param {Item|Item[]} items - Single item or array of items with grants
   * @param {Actor} actor - Target actor
   * @param {Object} options
   * @param {string} options.mode - "immediate" or "batch"
   * @param {number} options.depth - Recursion depth (max 3)
   * @param {boolean} options.dryRun - Preview without applying
   * @param {boolean} options.showNotification - Show UI notification
   * @returns {Promise<GrantsResult>}
   */
  static async processGrants(items, actor, options = {}) {
    const opts = {
      mode: "immediate",
      depth: 0,
      dryRun: false,
      showNotification: true,
      ...options
    };
    
    // Normalize input to array
    const itemArray = Array.isArray(items) ? items : [items];
    
    // Initialize result accumulator
    const result = this._initializeResult();
    
    // Process each item
    for (const item of itemArray) {
      await this._processItemGrants(item, actor, result, opts);
    }
    
    // Apply results (unless dry run)
    if (!opts.dryRun) {
      await this._applyResults(result, actor, opts);
    }
    
    return result;
  }
  
  /**
   * Process grants from a single item.
   * @private
   */
  static async _processItemGrants(item, actor, result, opts) {
    // 1. Process modifiers (always-on)
    this._processModifiers(item, result);
    
    // 2. Process base grants
    await this._processBaseGrants(item, result, actor, opts);
    
    // 3. Process choice grants (for origin paths)
    if (item.type === 'originPath' || item.system.grants?.choices) {
      await this._processChoiceGrants(item, result, actor, opts);
    }
  }
  
  /**
   * Process base grants (skills, talents, traits, equipment).
   * @private
   */
  static async _processBaseGrants(item, result, actor, opts) {
    const grants = item.system?.grants || {};
    
    // Wounds/Fate formulas
    if (grants.woundsFormula) {
      result.woundsBonus += await this._evaluateWoundsFormula(
        grants.woundsFormula, 
        actor, 
        item
      );
    }
    if (grants.fateFormula) {
      result.fateBonus += await this._evaluateFateFormula(
        grants.fateFormula, 
        item
      );
    }
    
    // Skills
    for (const skillGrant of grants.skills || []) {
      await this._processSkillGrant(skillGrant, result, actor, opts);
    }
    
    // Talents (may recurse)
    for (const talentGrant of grants.talents || []) {
      await this._processTalentGrant(talentGrant, result, actor, opts);
    }
    
    // Traits (may recurse if trait has grants)
    for (const traitGrant of grants.traits || []) {
      await this._processTraitGrant(traitGrant, result, actor, opts);
    }
    
    // Equipment
    for (const equipGrant of grants.equipment || []) {
      await this._processEquipmentGrant(equipGrant, result, actor, opts);
    }
    
    // Special abilities (text only)
    for (const abilityGrant of grants.specialAbilities || []) {
      result.specialAbilities.push(abilityGrant);
    }
  }
  
  /**
   * Process skill grant with lookup strategy.
   * @private
   */
  static async _processSkillGrant(skillGrant, result, actor, opts) {
    const skillKey = this._skillNameToKey(skillGrant.name);
    const actorSkill = actor.system?.skills?.[skillKey];
    
    if (!actorSkill) {
      console.warn(`Unknown skill: ${skillGrant.name} (key: ${skillKey})`);
      return;
    }
    
    // Handle specialist skills
    if (actorSkill.entries && skillGrant.specialization) {
      result.skillUpdates.push({
        type: "specialist",
        skillKey,
        specialization: skillGrant.specialization,
        level: skillGrant.level
      });
      return;
    }
    
    // Handle standard skills
    result.skillUpdates.push({
      type: "standard",
      skillKey,
      level: skillGrant.level
    });
  }
  
  /**
   * Process talent grant with recursion support.
   * @private
   */
  static async _processTalentGrant(talentGrant, result, actor, opts) {
    // Prevent infinite recursion
    if (opts.depth >= 3) {
      console.warn(`Max recursion depth reached for talent: ${talentGrant.name}`);
      return;
    }
    
    // Check for duplicates
    const existing = actor.items.find(i =>
      i.type === 'talent' &&
      i.name === talentGrant.name &&
      (!talentGrant.specialization || i.system.specialization === talentGrant.specialization)
    );
    
    if (existing) {
      console.log(`Talent ${talentGrant.name} already exists, skipping`);
      return;
    }
    
    // Load talent from compendium
    const talentDoc = await this._loadFromCompendium(
      talentGrant,
      'talent',
      'rogue-trader.rt-items-talents'
    );
    
    if (!talentDoc) {
      console.error(`Could not find talent: ${talentGrant.name}`);
      return;
    }
    
    // Add to creation queue
    const itemData = talentDoc.toObject();
    if (talentGrant.specialization) {
      itemData.system.specialization = talentGrant.specialization;
      itemData.name = `${itemData.name} (${talentGrant.specialization})`;
    }
    
    // Mark as granted
    itemData.flags = itemData.flags || {};
    itemData.flags['rogue-trader'] = {
      ...(itemData.flags['rogue-trader'] || {}),
      autoGranted: true,
      grantedBy: opts.sourceName || "Unknown"
    };
    
    result.itemsToCreate.push(itemData);
    
    // Recurse if talent has grants (immediate mode only)
    if (opts.mode === "immediate" && talentDoc.system?.hasGrants) {
      await this.processGrants(talentDoc, actor, {
        ...opts,
        depth: opts.depth + 1,
        showNotification: false  // Only notify at top level
      });
    }
  }
  
  /**
   * Convert skill name to key using canonical mapping.
   * @private
   */
  static _skillNameToKey(name) {
    // Use canonical skill name mapping
    const SKILL_NAME_TO_KEY = {
      "Acrobatics": "acrobatics",
      "Awareness": "awareness",
      "Chem-Use": "chemUse",
      "Silent Move": "silentMove",
      "Sleight of Hand": "sleightOfHand",
      "Tech-Use": "techUse",
      "Common Lore": "commonLore",
      "Forbidden Lore": "forbiddenLore",
      "Scholastic Lore": "scholasticLore",
      "Speak Language": "speakLanguage",
      "Secret Tongue": "secretTongue",
      // ... complete mapping
    };
    
    return SKILL_NAME_TO_KEY[name] || name.toLowerCase().replace(/[\s-]/g, '');
  }
  
  /**
   * Apply results to actor.
   * @private
   */
  static async _applyResults(result, actor, opts) {
    const updates = {};
    
    // 1. Apply characteristic modifiers
    for (const [char, value] of Object.entries(result.characteristics)) {
      if (value !== 0) {
        const current = actor.system.characteristics[char]?.modifier || 0;
        updates[`system.characteristics.${char}.modifier`] = current + value;
      }
    }
    
    // 2. Apply skill updates
    for (const skillUpdate of result.skillUpdates) {
      if (skillUpdate.type === "standard") {
        const path = `system.skills.${skillUpdate.skillKey}`;
        if (skillUpdate.level === "trained" || skillUpdate.level === "plus10" || skillUpdate.level === "plus20") {
          updates[`${path}.trained`] = true;
        }
        if (skillUpdate.level === "plus10" || skillUpdate.level === "plus20") {
          updates[`${path}.plus10`] = true;
        }
        if (skillUpdate.level === "plus20") {
          updates[`${path}.plus20`] = true;
        }
      } else if (skillUpdate.type === "specialist") {
        // Handle specialist skill entries
        const skill = actor.system.skills[skillUpdate.skillKey];
        const entries = skill.entries || [];
        const existing = entries.find(e => e.name === skillUpdate.specialization);
        
        if (!existing) {
          entries.push({
            name: skillUpdate.specialization,
            slug: skillUpdate.specialization.toLowerCase().replace(/\s+/g, '-'),
            characteristic: skill.characteristic,  // Inherit from parent
            advanced: skill.advanced,              // Inherit from parent
            basic: skill.basic,                    // Inherit from parent
            trained: true,
            plus10: skillUpdate.level === "plus10" || skillUpdate.level === "plus20",
            plus20: skillUpdate.level === "plus20",
            bonus: 0,
            notes: "",
            cost: 0,
            current: 0
          });
          updates[`system.skills.${skillUpdate.skillKey}.entries`] = entries;
        }
      }
    }
    
    // 3. Apply resource bonuses
    if (result.woundsBonus !== 0) {
      updates['system.wounds.max'] = (actor.system.wounds?.max || 0) + result.woundsBonus;
    }
    if (result.fateBonus !== 0) {
      updates['system.fate.max'] = (actor.system.fate?.max || 0) + result.fateBonus;
    }
    
    // 4. Update actor
    if (Object.keys(updates).length > 0) {
      await actor.update(updates);
    }
    
    // 5. Create granted items
    if (result.itemsToCreate.length > 0) {
      await actor.createEmbeddedDocuments('Item', result.itemsToCreate);
    }
    
    // 6. Show notification
    if (opts.showNotification && opts.depth === 0) {
      const summary = this._formatSummary(result);
      if (summary) {
        ui.notifications.info(summary, { permanent: false });
      }
    }
  }
}
```

**Migration Strategy**:

1. **Create new unified processor**:
   - `src/module/utils/grants-processor.mjs` (new)
   
2. **Update talent-grants.mjs** (backward compatibility wrapper):
   ```javascript
   import { GrantsProcessor } from './grants-processor.mjs';
   
   export async function processTalentGrants(talent, actor, depth = 0) {
     return GrantsProcessor.processGrants(talent, actor, {
       mode: "immediate",
       depth,
       showNotification: true
     });
   }
   
   export async function handleTalentRemoval(talent, actor) {
     // Keep existing removal logic
   }
   ```

3. **Update origin-grants-processor.mjs** (backward compatibility wrapper):
   ```javascript
   import { GrantsProcessor } from './grants-processor.mjs';
   
   export class OriginGrantsProcessor {
     static async processOriginGrants(originItem, actor) {
       return GrantsProcessor.processGrants(originItem, actor, {
         mode: "batch",
         showNotification: false
       });
     }
     
     static async getSummary(originItem, actor) {
       return GrantsProcessor.processGrants(originItem, actor, {
         mode: "batch",
         dryRun: true
       });
     }
   }
   ```

**Files Modified**:
- NEW: `src/module/utils/grants-processor.mjs` (~600 lines)
- MODIFY: `src/module/utils/talent-grants.mjs` (reduce to ~50 lines - wrappers only)
- MODIFY: `src/module/utils/origin-grants-processor.mjs` (reduce to ~50 lines - wrappers only)
- TEST: Both talent and origin grant flows thoroughly

**Benefits**:
- Single source of truth for grant logic
- Backward compatible (wrappers preserve existing APIs)
- Support for both immediate and batch modes
- Consistent error handling and notifications
- Easier to maintain and extend

---

#### 1.2 Skills System Cleanup

**Goal**: Fix specialist skill inheritance, remove redundancies, add canonical name mapping

**Changes**:

1. **Remove redundant `basic` field**:
   ```javascript
   // In creature.mjs SkillField()
   static SkillField(label, charShort, advanced = false, hasEntries = false) {
     const schema = {
       label: new StringField({ required: true, initial: label }),
       characteristic: new StringField({ required: true, initial: charShort }),
       advanced: new BooleanField({ required: true, initial: advanced }),
       // REMOVE: basic field
       trained: new BooleanField({ required: true, initial: false }),
       // ...
     };
     
     if (hasEntries) {
       schema.entries = new ArrayField(
         new SchemaField({
           name: new StringField({ required: true }),
           slug: new StringField({ required: false }),
           // REMOVE: characteristic (inherit from parent)
           // REMOVE: advanced (inherit from parent)
           // REMOVE: basic (inherit from parent)
           trained: new BooleanField({ required: true, initial: false }),
           plus10: new BooleanField({ required: true, initial: false }),
           plus20: new BooleanField({ required: true, initial: false }),
           bonus: new NumberField({ required: true, initial: 0, integer: true }),
           notes: new StringField({ required: false, blank: true }),
           cost: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
           current: new NumberField({ required: true, initial: 0, integer: true })
         }),
         { required: true, initial: [] }
       );
     }
     
     return new SchemaField(schema);
   }
   ```

2. **Add characteristic inheritance for specialist entries**:
   ```javascript
   // In creature.mjs prepareDerivedData()
   _prepareSkills() {
     for (const [key, skill] of Object.entries(this.skills)) {
       if (skill.entries) {
         // Inherit parent fields to entries
         for (const entry of skill.entries) {
           entry.characteristic = entry.characteristic || skill.characteristic;
           entry.advanced = skill.advanced;
           
           // Calculate current value
           const char = this.characteristics[entry.characteristic];
           const charValue = char?.total || 0;
           
           let current = charValue;
           if (!entry.trained && entry.advanced) {
             current = 0;  // Advanced skills require training
           }
           if (entry.plus10) current += 10;
           if (entry.plus20) current += 20;
           current += entry.bonus;
           
           entry.current = current;
         }
       }
       
       // Calculate parent skill current value
       // ...
     }
   }
   ```

3. **Add canonical skill name mapping**:
   ```javascript
   // src/module/utils/skill-name-mapping.mjs
   export const SKILL_NAME_TO_KEY = {
     // Standard skills with special casing
     "Acrobatics": "acrobatics",
     "Awareness": "awareness",
     "Barter": "barter",
     "Blather": "blather",
     "Carouse": "carouse",
     "Charm": "charm",
     "Chem-Use": "chemUse",
     "Climb": "climb",
     "Command": "command",
     "Commerce": "commerce",
     "Concealment": "concealment",
     "Contortionist": "contortionist",
     "Deceive": "deceive",
     "Demolition": "demolition",
     "Disguise": "disguise",
     "Dodge": "dodge",
     "Evaluate": "evaluate",
     "Gamble": "gamble",
     "Inquiry": "inquiry",
     "Interrogation": "interrogation",
     "Intimidate": "intimidate",
     "Invocation": "invocation",
     "Literacy": "literacy",
     "Logic": "logic",
     "Medicae": "medicae",
     "Psyniscience": "psyniscience",
     "Scrutiny": "scrutiny",
     "Search": "search",
     "Security": "security",
     "Shadowing": "shadowing",
     "Silent Move": "silentMove",
     "Sleight of Hand": "sleightOfHand",
     "Survival": "survival",
     "Swim": "swim",
     "Tracking": "tracking",
     "Wrangling": "wrangling",
     
     // Specialist skill groups
     "Ciphers": "ciphers",
     "Common Lore": "commonLore",
     "Drive": "drive",
     "Forbidden Lore": "forbiddenLore",
     "Navigation": "navigation",
     "Performer": "performer",
     "Pilot": "pilot",
     "Scholastic Lore": "scholasticLore",
     "Secret Tongue": "secretTongue",
     "Speak Language": "speakLanguage",
     "Tech-Use": "techUse",
     "Trade": "trade",
     
     // Hidden skills (legacy)
     "Athletics": "athletics",
     "Parry": "parry",
     "Stealth": "stealth"
   };
   
   export const SPECIALIST_SKILLS = [
     "ciphers",
     "commonLore",
     "drive",
     "forbiddenLore",
     "navigation",
     "performer",
     "pilot",
     "scholasticLore",
     "secretTongue",
     "speakLanguage",
     "techUse",
     "trade"
   ];
   
   export function skillNameToKey(name) {
     return SKILL_NAME_TO_KEY[name] || name.toLowerCase().replace(/[\s-]/g, '');
   }
   
   export function isSpecialistSkill(key) {
     return SPECIALIST_SKILLS.includes(key);
   }
   ```

4. **Add migration for existing data**:
   ```javascript
   // In creature.mjs migrateData()
   static migrateData(source) {
     // Migrate specialist skill entries to inherit characteristic
     if (source.skills) {
       for (const [key, skill] of Object.entries(source.skills)) {
         if (skill.entries) {
           for (const entry of skill.entries) {
             if (!entry.characteristic) {
               entry.characteristic = skill.characteristic;
             }
             // Remove redundant fields if present
             delete entry.basic;
           }
         }
       }
     }
     
     return super.migrateData(source);
   }
   ```

**Files Modified**:
- NEW: `src/module/utils/skill-name-mapping.mjs` (~100 lines)
- MODIFY: `src/module/data/actor/templates/creature.mjs` (schema + migration)
- MODIFY: `src/module/utils/grants-processor.mjs` (use canonical mapping)
- UPDATE: All templates that access `skill.basic` (replace with `!skill.advanced`)

**Benefits**:
- Specialist entries automatically inherit parent characteristic
- No more manual field copying
- Canonical name mapping prevents lookup failures
- Cleaner data model (less redundancy)

---

#### 1.3 Situational Modifiers Display

**Goal**: Make situational modifiers visible and useful in roll dialogs

**Implementation**:

1. **Add to roll dialog context**:
   ```javascript
   // In enhanced-skill-dialog.mjs
   _prepareContext(options) {
     const context = {
       // ... existing context
       
       // Gather situational modifiers
       situationalModifiers: this._getSituationalModifiers()
     };
     
     return context;
   }
   
   _getSituationalModifiers() {
     const modifiers = [];
     const rollType = this.rollData.type;  // "skill", "characteristic", "combat"
     const rollKey = this.rollData.key;    // e.g., "dodge", "weaponSkill"
     
     // Gather from all items with modifiers
     for (const item of this.actor.items) {
       if (!item.system.modifiers?.situational) continue;
       
       const sit = item.system.modifiers.situational;
       
       if (rollType === "skill" && sit.skills) {
         for (const mod of sit.skills) {
           if (mod.key === rollKey) {
             modifiers.push({
               source: item.name,
               value: mod.value,
               condition: mod.condition,
               icon: mod.icon,
               active: false  // User toggles in dialog
             });
           }
         }
       }
       
       if (rollType === "characteristic" && sit.characteristics) {
         for (const mod of sit.characteristics) {
           if (mod.key === rollKey) {
             modifiers.push({
               source: item.name,
               value: mod.value,
               condition: mod.condition,
               icon: mod.icon,
               active: false
             });
           }
         }
       }
       
       // Similar for combat
     }
     
     return modifiers;
   }
   ```

2. **Update dialog template**:
   ```handlebars
   {{!-- In enhanced-skill-dialog.hbs --}}
   
   {{#if situationalModifiers.length}}
     <div class="rt-situational-modifiers">
       <h3 class="rt-section-header">
         <i class="fa-solid fa-exclamation-triangle"></i>
         Situational Modifiers
       </h3>
       
       {{#each situationalModifiers as |mod|}}
         <label class="rt-situational-mod">
           <input type="checkbox" 
                  name="situationalMods.{{@index}}" 
                  {{checked mod.active}}>
           <span class="rt-mod-source">{{mod.source}}</span>
           <span class="rt-mod-condition">{{mod.condition}}</span>
           <span class="rt-mod-value {{#if (gt mod.value 0)}}positive{{else}}negative{{/if}}">
             {{signedNumber mod.value}}
           </span>
         </label>
       {{/each}}
     </div>
   {{/if}}
   ```

3. **Apply selected modifiers**:
   ```javascript
   // In enhanced-skill-dialog.mjs
   static async #onRoll(event, target) {
     const form = this.element.querySelector('form');
     const formData = new FormDataExtended(form).object;
     
     // Sum base modifier
     let modifier = parseInt(formData.modifier) || 0;
     
     // Add active situational modifiers
     if (formData.situationalMods) {
       for (const [index, active] of Object.entries(formData.situationalMods)) {
         if (active) {
           const mod = this.situationalModifiers[parseInt(index)];
           modifier += mod.value;
         }
       }
     }
     
     // Create roll with combined modifier
     // ...
   }
   ```

**Files Modified**:
- MODIFY: `src/module/applications/prompts/enhanced-skill-dialog.mjs`
- MODIFY: `src/templates/prompts/enhanced-skill-dialog.hbs`
- NEW: `src/scss/prompts/_situational-modifiers.scss`

**Benefits**:
- Situational modifiers finally visible to players
- User-controlled toggle (they decide if condition applies)
- Clear attribution (which item grants the modifier)
- Better informed rolling decisions

---

### PHASE 2: Talent Audit Tools

**Goal**: Build semi-automated tools to detect issues and suggest fixes

#### 2.1 Talent Audit Script

**Tool**: `scripts/audit-talents.mjs`

```javascript
/**
 * Audit all talent JSON files for common issues.
 * Usage: node scripts/audit-talents.mjs [--fix]
 */

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

const TALENTS_DIR = 'src/packs/rt-items-talents/_source';

const ISSUES = {
  MISSING_IDENTIFIER: "missing_identifier",
  MISSING_BENEFIT: "missing_benefit",
  EMPTY_MODIFIERS: "empty_modifiers",
  BENEFIT_MISMATCH: "benefit_mismatch",
  MISSING_TIER: "missing_tier",
  INVALID_PREREQUISITES: "invalid_prerequisites",
  MISSING_APTITUDES: "missing_aptitudes",
  NO_COST: "no_cost"
};

class TalentAuditor {
  constructor() {
    this.results = {
      total: 0,
      issues: {},
      suggestions: []
    };
    
    for (const issue of Object.values(ISSUES)) {
      this.results.issues[issue] = [];
    }
  }
  
  async audit() {
    const files = await glob(`${TALENTS_DIR}/*.json`);
    console.log(`Auditing ${files.length} talent files...`);
    
    for (const file of files) {
      await this.auditFile(file);
    }
    
    this.printReport();
  }
  
  async auditFile(filePath) {
    this.results.total++;
    
    const content = await fs.readFile(filePath, 'utf-8');
    const talent = JSON.parse(content);
    
    const fileName = path.basename(filePath);
    
    // Check identifier
    if (!talent.system?.identifier) {
      this.addIssue(ISSUES.MISSING_IDENTIFIER, fileName, talent.name);
    }
    
    // Check benefit
    const benefit = talent.system?.benefit?.trim();
    if (!benefit || benefit === "") {
      this.addIssue(ISSUES.MISSING_BENEFIT, fileName, talent.name);
    }
    
    // Check if modifiers are empty but benefit suggests modifiers
    const hasModifiers = this.hasAnyModifiers(talent.system?.modifiers);
    if (!hasModifiers && this.benefitSuggestsModifiers(benefit)) {
      this.addIssue(ISSUES.BENEFIT_MISMATCH, fileName, talent.name, {
        suggestion: this.extractModifiersFromBenefit(benefit)
      });
    }
    
    // Check tier
    if (talent.system?.tier === 0 || talent.system?.tier == null) {
      this.addIssue(ISSUES.MISSING_TIER, fileName, talent.name);
    }
    
    // Check prerequisites
    if (talent.system?.prerequisites) {
      const prereqs = talent.system.prerequisites;
      if (typeof prereqs === 'string') {
        this.addIssue(ISSUES.INVALID_PREREQUISITES, fileName, talent.name, {
          note: "Prerequisites is string, should be object"
        });
      }
    }
    
    // Check aptitudes
    if (!talent.system?.aptitudes || talent.system.aptitudes.length === 0) {
      this.addIssue(ISSUES.MISSING_APTITUDES, fileName, talent.name);
    }
    
    // Check cost
    if (talent.system?.cost == null || talent.system.cost === 0) {
      this.addIssue(ISSUES.NO_COST, fileName, talent.name);
    }
  }
  
  hasAnyModifiers(modifiers) {
    if (!modifiers) return false;
    
    if (modifiers.characteristics && Object.keys(modifiers.characteristics).length > 0) return true;
    if (modifiers.skills && Object.keys(modifiers.skills).length > 0) return true;
    if (modifiers.combat && Object.values(modifiers.combat).some(v => v !== 0)) return true;
    if (modifiers.resources && Object.values(modifiers.resources).some(v => v !== 0)) return true;
    
    return false;
  }
  
  benefitSuggestsModifiers(benefit) {
    if (!benefit) return false;
    
    const lowerBenefit = benefit.toLowerCase();
    
    // Check for modifier patterns
    const modifierPatterns = [
      /\+\d+\s+to\s+\w+/i,              // "+10 to Dodge"
      /\+\d+\s+\w+\s+(test|check)/i,    // "+10 Awareness Test"
      /-\d+\s+to\s+\w+/i,               // "-10 to enemy attacks"
      /gain\s+\+?\d+/i,                 // "gain +5"
      /bonus\s+of\s+\+?\d+/i,           // "bonus of +10"
      /\d+\s+bonus/i                    // "10 bonus"
    ];
    
    return modifierPatterns.some(pattern => pattern.test(lowerBenefit));
  }
  
  extractModifiersFromBenefit(benefit) {
    // Simple extraction - can be enhanced
    const suggestions = [];
    
    // Look for "+10 to Dodge" style
    const skillPattern = /\+(\d+)\s+to\s+(\w+(?:\s+\w+)?)/gi;
    let match;
    while ((match = skillPattern.exec(benefit)) !== null) {
      suggestions.push({
        type: "skill",
        key: match[2].toLowerCase().replace(/\s+/g, ''),
        value: parseInt(match[1])
      });
    }
    
    // Look for characteristic modifiers
    const charPattern = /\+(\d+)\s+(WS|BS|S|T|Ag|Int|Per|WP|Fel|Inf)/gi;
    while ((match = charPattern.exec(benefit)) !== null) {
      suggestions.push({
        type: "characteristic",
        key: match[2].toLowerCase(),
        value: parseInt(match[1])
      });
    }
    
    return suggestions;
  }
  
  addIssue(issueType, fileName, talentName, extra = {}) {
    this.results.issues[issueType].push({
      file: fileName,
      name: talentName,
      ...extra
    });
  }
  
  printReport() {
    console.log('\n' + '='.repeat(80));
    console.log('TALENT AUDIT REPORT');
    console.log('='.repeat(80));
    console.log(`Total talents audited: ${this.results.total}`);
    console.log('');
    
    for (const [issue, items] of Object.entries(this.results.issues)) {
      if (items.length > 0) {
        console.log(`\n${issue.toUpperCase().replace(/_/g, ' ')} (${items.length}):`);
        console.log('-'.repeat(80));
        
        // Show first 10 examples
        for (const item of items.slice(0, 10)) {
          console.log(`  • ${item.name} (${item.file})`);
          if (item.suggestion) {
            console.log(`    Suggested modifiers:`, JSON.stringify(item.suggestion, null, 2));
          }
          if (item.note) {
            console.log(`    Note: ${item.note}`);
          }
        }
        
        if (items.length > 10) {
          console.log(`  ... and ${items.length - 10} more`);
        }
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log(`Total issues found: ${Object.values(this.results.issues).reduce((sum, arr) => sum + arr.length, 0)}`);
    console.log('='.repeat(80));
  }
}

// Run audit
const auditor = new TalentAuditor();
await auditor.audit();
```

**Usage**:
```bash
node scripts/audit-talents.mjs > talent-audit-report.txt
```

---

#### 2.2 Interactive Talent Fixer

**Tool**: `scripts/fix-talent.mjs`

```javascript
/**
 * Interactive tool to fix a single talent.
 * Usage: node scripts/fix-talent.mjs <talent-file-name>
 */

import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

class TalentFixer {
  constructor(filePath) {
    this.filePath = filePath;
  }
  
  async load() {
    const content = await fs.readFile(this.filePath, 'utf-8');
    this.talent = JSON.parse(content);
    this.original = JSON.stringify(this.talent, null, 2);
  }
  
  async fix() {
    console.log(`\nFixing talent: ${this.talent.name}`);
    console.log('='.repeat(80));
    
    // Show current state
    console.log(`\nCurrent benefit:`);
    console.log(this.talent.system.benefit);
    
    console.log(`\nCurrent modifiers:`);
    console.log(JSON.stringify(this.talent.system.modifiers, null, 2));
    
    console.log(`\nCurrent grants:`);
    console.log(JSON.stringify(this.talent.system.grants, null, 2));
    
    // Menu
    while (true) {
      console.log('\n' + '-'.repeat(80));
      console.log('Options:');
      console.log('1. Add characteristic modifier');
      console.log('2. Add skill modifier');
      console.log('3. Add combat modifier');
      console.log('4. Add skill grant');
      console.log('5. Add talent grant');
      console.log('6. Set tier');
      console.log('7. Set aptitudes');
      console.log('8. Preview changes');
      console.log('9. Save and exit');
      console.log('0. Exit without saving');
      
      const choice = await question('\nChoose option: ');
      
      switch (choice) {
        case '1':
          await this.addCharacteristicModifier();
          break;
        case '2':
          await this.addSkillModifier();
          break;
        case '3':
          await this.addCombatModifier();
          break;
        case '4':
          await this.addSkillGrant();
          break;
        case '5':
          await this.addTalentGrant();
          break;
        case '6':
          await this.setTier();
          break;
        case '7':
          await this.setAptitudes();
          break;
        case '8':
          this.preview();
          break;
        case '9':
          await this.save();
          console.log('Saved!');
          return;
        case '0':
          console.log('Exiting without saving.');
          return;
        default:
          console.log('Invalid choice.');
      }
    }
  }
  
  async addCharacteristicModifier() {
    console.log('\nCharacteristics: ws, bs, s, t, ag, int, per, wp, fel, inf');
    const char = await question('Characteristic key: ');
    const value = await question('Modifier value: ');
    
    this.talent.system.modifiers = this.talent.system.modifiers || {};
    this.talent.system.modifiers.characteristics = this.talent.system.modifiers.characteristics || {};
    this.talent.system.modifiers.characteristics[char] = parseInt(value);
    
    console.log(`Added: +${value} to ${char}`);
  }
  
  async addSkillModifier() {
    const skill = await question('Skill key (e.g., dodge, awareness): ');
    const value = await question('Modifier value: ');
    
    this.talent.system.modifiers = this.talent.system.modifiers || {};
    this.talent.system.modifiers.skills = this.talent.system.modifiers.skills || {};
    this.talent.system.modifiers.skills[skill] = parseInt(value);
    
    console.log(`Added: +${value} to ${skill}`);
  }
  
  async addCombatModifier() {
    console.log('\nCombat types: attack, damage, penetration, defense, initiative, speed');
    const type = await question('Combat type: ');
    const value = await question('Modifier value: ');
    
    this.talent.system.modifiers = this.talent.system.modifiers || {};
    this.talent.system.modifiers.combat = this.talent.system.modifiers.combat || {};
    this.talent.system.modifiers.combat[type] = parseInt(value);
    
    console.log(`Added: +${value} to combat ${type}`);
  }
  
  async addSkillGrant() {
    const name = await question('Skill name: ');
    const level = await question('Level (trained/plus10/plus20): ');
    const spec = await question('Specialization (or blank): ');
    
    this.talent.system.grants = this.talent.system.grants || {};
    this.talent.system.grants.skills = this.talent.system.grants.skills || [];
    
    this.talent.system.grants.skills.push({
      name,
      level,
      specialization: spec || undefined
    });
    
    console.log(`Added skill grant: ${name} (${level})`);
  }
  
  async setTier() {
    const tier = await question('Tier (1-3): ');
    this.talent.system.tier = parseInt(tier);
    console.log(`Set tier to: ${tier}`);
  }
  
  async setAptitudes() {
    const aptitudes = await question('Aptitudes (comma-separated): ');
    this.talent.system.aptitudes = aptitudes.split(',').map(a => a.trim()).filter(Boolean);
    console.log(`Set aptitudes: ${this.talent.system.aptitudes.join(', ')}`);
  }
  
  preview() {
    console.log('\n' + '='.repeat(80));
    console.log('PREVIEW OF CHANGES');
    console.log('='.repeat(80));
    console.log(JSON.stringify(this.talent, null, 2));
  }
  
  async save() {
    const json = JSON.stringify(this.talent, null, 2);
    await fs.writeFile(this.filePath, json + '\n', 'utf-8');
  }
}

// Main
const fileName = process.argv[2];
if (!fileName) {
  console.error('Usage: node scripts/fix-talent.mjs <talent-file-name>');
  process.exit(1);
}

const filePath = path.join('src/packs/rt-items-talents/_source', fileName);
const fixer = new TalentFixer(filePath);
await fixer.load();
await fixer.fix();
rl.close();
```

---

### PHASE 3: Talent Data Migration

**Goal**: Systematically fix all 652 talents using priority order

#### 3.1 Priority Categories

**Priority 1: Combat Talents (~150 talents)**
- Direct combat impact
- Most commonly used by players
- Clear mechanical effects

Examples:
- Weapon Training
- Melee Master
- Crack Shot
- Two-Weapon Wielder
- Lightning Attack

**Priority 2: Skill-Granting Talents (~80 talents)**
- Grant skills or skill bonuses
- Often taken during character creation
- Clear mechanical effects

Examples:
- Air of Authority (Command +10)
- Keen Intuition (Awareness +10)
- Talented (various skills)

**Priority 3: Situational Modifier Talents (~200 talents)**
- Apply in specific situations
- Need situational modifier support (Phase 1.3)
- Complex conditions

Examples:
- Ambidextrous
- Sprint
- Sure Strike
- Wall of Steel

**Priority 4: General Talents (~222 talents)**
- Passive benefits
- Edge cases and special rules
- Require manual review

Examples:
- Blessed Ignorance
- Disturbing Voice
- Hatred
- Sound Constitution

#### 3.2 Migration Process

For each priority category:

1. **Run audit tool**:
   ```bash
   node scripts/audit-talents.mjs > combat-talents-audit.txt
   ```

2. **Review audit results**: Identify common patterns

3. **Create category-specific fix script**:
   ```bash
   node scripts/fix-category.mjs combat-talents combat-talents-fixes.json
   ```

4. **Batch apply fixes**:
   ```bash
   node scripts/apply-fixes.mjs combat-talents-fixes.json
   ```

5. **Manual review**: Check 10% sample for accuracy

6. **Test in-game**: Create test character with all talents in category

7. **Commit**: One commit per priority category

---

### PHASE 4: Testing &amp; Validation

#### 4.1 Automated Tests

Create test suite for grants system:

```javascript
// tests/grants-processor.test.mjs

describe('GrantsProcessor', () => {
  
  describe('Skill Grants', () => {
    it('should grant standard skill', async () => {
      const talent = createMockTalent({
        grants: {
          skills: [{ name: "Dodge", level: "trained" }]
        }
      });
      
      const actor = createMockActor();
      await GrantsProcessor.processGrants(talent, actor);
      
      expect(actor.system.skills.dodge.trained).toBe(true);
    });
    
    it('should grant specialist skill', async () => {
      const talent = createMockTalent({
        grants: {
          skills: [{ 
            name: "Common Lore", 
            specialization: "Imperium",
            level: "trained"
          }]
        }
      });
      
      const actor = createMockActor();
      await GrantsProcessor.processGrants(talent, actor);
      
      const entry = actor.system.skills.commonLore.entries
        .find(e => e.name === "Imperium");
      expect(entry.trained).toBe(true);
      expect(entry.characteristic).toBe("Int");  // Inherited
    });
  });
  
  describe('Talent Recursion', () => {
    it('should recursively grant talents', async () => {
      // Talent A grants Talent B
      // Talent B grants Skill C
      // Final result: actor has A, B, and Skill C
    });
    
    it('should prevent infinite recursion', async () => {
      // Talent A grants Talent A
      // Should stop at depth 3
    });
  });
  
  describe('Origin Batch Mode', () => {
    it('should process multiple origins in batch', async () => {
      // Test origin path processing
    });
  });
  
});
```

#### 4.2 Manual Test Checklist

- [ ] Create test character with 50 varied talents
- [ ] Verify all skill grants applied correctly
- [ ] Verify all characteristic modifiers visible
- [ ] Verify situational modifiers show in roll dialog
- [ ] Test talent removal (granted items dialog)
- [ ] Test origin path with choice grants
- [ ] Test recursive talent grants (Talent Training grants Weapon Training)
- [ ] Verify no performance regression (large talent lists)

---

## Migration Schedule

### Week 1: Phase 1 (Core System)
- Days 1-2: Unified grants processor
- Days 3-4: Skills system cleanup
- Day 5: Situational modifiers display

### Week 2: Phase 2 (Tools)
- Days 1-2: Audit script
- Days 3-4: Interactive fixer
- Day 5: Category-specific automation

### Week 3-6: Phase 3 (Talent Data)
- Week 3: Priority 1 (Combat talents)
- Week 4: Priority 2 (Skill-granting talents)
- Week 5: Priority 3 (Situational talents)
- Week 6: Priority 4 (General talents)

### Week 7: Phase 4 (Testing)
- Days 1-3: Automated tests
- Days 4-5: Manual testing &amp; fixes

---

## Risk Mitigation

### Risk 1: Breaking Existing Grants

**Mitigation**:
- Keep backward compatibility wrappers
- Extensive testing before removing old code
- One commit per major change

### Risk 2: Talent Data Corruption

**Mitigation**:
- Always backup before batch changes
- Git commit after each category
- Validate JSON after every change
- Keep audit trail of all automated fixes

### Risk 3: Performance Regression

**Mitigation**:
- Benchmark current performance
- Test with 100+ talent characters
- Profile grants processor
- Optimize hot paths if needed

### Risk 4: Incomplete Migration

**Mitigation**:
- Track progress per category
- Document any skipped talents
- Keep issue tracker for edge cases
- Accept that some talents need manual review

---

## Success Criteria

### Phase 1 Complete When:
- [x] Single grants processor handles both immediate and batch modes
- [x] All existing talent/origin grants still work
- [x] Specialist skills inherit characteristic automatically
- [x] Situational modifiers visible in roll dialogs
- [x] All Phase 1 tests pass

### Phase 2 Complete When:
- [x] Audit tool identifies all issue types
- [x] Interactive fixer works for manual review
- [x] Category-specific automation scripts complete

### Phase 3 Complete When:
- [x] All 652 talents audited
- [x] Priority 1-4 categories processed
- [x] Manual review of 10% sample per category
- [x] All talents have valid tier, aptitudes, cost

### Phase 4 Complete When:
- [x] Automated test suite passes
- [x] Manual test checklist complete
- [x] No performance regression
- [x] Documentation updated

---

## Post-Migration

### Ongoing Maintenance

1. **New Talent Checklist**:
   - [ ] Fill in all required fields
   - [ ] Add modifiers OR grants (not just benefit text)
   - [ ] Set tier appropriately
   - [ ] Add aptitudes
   - [ ] Set XP cost
   - [ ] Test grants work correctly

2. **Code Review Guidelines**:
   - All grants use unified GrantsProcessor
   - No direct skill.entries manipulation
   - Use canonical skill name mapping
   - Document situational modifier conditions

3. **Compendium Updates**:
   - Run audit script before release
   - Fix critical issues immediately
   - Schedule cleanup of minor issues

---

## Appendix A: Canonical Skill Names

See `SKILL_TABLE.md` for complete reference.

**53 Total Skills**:
- 39 standard skills
- 13 specialist skill groups
- 1 hidden skill (3 legacy skills for compatibility)

**Specialist Skills** (have .entries array):
- Ciphers (Int, Advanced)
- Common Lore (Int, Advanced)
- Drive (Ag, Advanced)
- Forbidden Lore (Int, Advanced)
- Navigation (Int, Advanced)
- Performer (Fel, Advanced)
- Pilot (Ag, Advanced)
- Scholastic Lore (Int, Advanced)
- Secret Tongue (Int, Advanced)
- Speak Language (Int, Advanced)
- Tech-Use (Int, Advanced)
- Trade (Int, Advanced)

---

## Appendix B: Modifier Template Reference

**Always-On Modifiers** (applied automatically):
```javascript
modifiers: {
  characteristics: { ws: 10, bs: 5 },  // +10 WS, +5 BS
  skills: { dodge: 10 },               // +10 Dodge
  combat: {
    attack: 5,                         // +5 to all attacks
    damage: 2,                         // +2 damage
    penetration: 0,
    defense: 10,                       // +10 to dodge/parry
    initiative: 1,
    speed: 0
  },
  resources: {
    wounds: 2,                         // +2 max wounds
    fate: 1,
    insanity: 0,
    corruption: 0
  }
}
```

**Situational Modifiers** (user-toggle in dialog):
```javascript
modifiers: {
  situational: {
    characteristics: [
      {
        key: "ws",
        value: 20,
        condition: "when charging",
        icon: "fa-bolt"
      }
    ],
    skills: [
      {
        key: "dodge",
        value: 10,
        condition: "when fighting multiple enemies",
        icon: "fa-users"
      }
    ],
    combat: [
      {
        key: "attack",
        value: 10,
        condition: "against psykers",
        icon: "fa-brain"
      }
    ]
  }
}
```

---

## Appendix C: Grants Schema Reference

**Skill Grant**:
```javascript
{
  name: "Dodge",              // Display name
  specialization: "",         // For specialist skills only
  level: "trained"            // "trained", "plus10", or "plus20"
}
```

**Talent Grant**:
```javascript
{
  name: "Weapon Training",
  specialization: "Las",      // Optional
  uuid: "Compendium.rogue-trader.rt-items-talents.xxx"  // Preferred
}
```

**Trait Grant**:
```javascript
{
  name: "Dark Sight",
  level: 1,                   // Optional (for stackable traits)
  uuid: "Compendium.rogue-trader.rt-items-traits.xxx"
}
```

**Equipment Grant**:
```javascript
{
  name: "Laspistol",
  quantity: 1,
  uuid: "Compendium.rogue-trader.rt-items-weapons.xxx"
}
```

**Choice Grant** (origin paths only):
```javascript
{
  label: "Choose a Skill",
  count: 1,
  options: [
    {
      value: "awareness",
      label: "Awareness +10",
      grants: {
        skills: [{ name: "Awareness", level: "plus10" }]
      }
    },
    {
      value: "dodge",
      label: "Dodge",
      grants: {
        skills: [{ name: "Dodge", level: "trained" }]
      }
    }
  ]
}
```

---

## Questions for User

Before implementation, confirm:

1. **Scope**: Proceed with full refactor (Phases 1-4)?
2. **Timeline**: 7-week schedule acceptable?
3. **Priority**: Combat talents first, or different order?
4. **Automation**: How much manual review vs automated fixes?
5. **Backward Compatibility**: Keep old talent-grants.mjs wrapper indefinitely?
6. **Testing**: Manual testing only, or set up automated test framework?

---

**END OF PLAN**
