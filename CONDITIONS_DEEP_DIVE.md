# CONDITIONS System - Deep Dive & Refactor Plan

**Date**: 2026-01-09  
**Status**: Planning Phase  
**Scope**: Comprehensive refactor of CONDITIONS system following V13 patterns

---

## 🔍 CURRENT STATE ANALYSIS

### Architecture Problems

**Critical Issue**: CONDITIONS are **not a proper item type** — they're **traits with flags**!

```javascript
// Current structure (BROKEN)
{
  "name": "Stunned",
  "type": "trait",              // ❌ Wrong type!
  "system": {
    "requirements": "-",        // ❌ Trait schema fields
    "descriptionText": "...",   // ❌ Legacy field
    "effects": "",              // ❌ Legacy field  
    "source": "...",            // ❌ String not object
    "description": { ... },     // ✅ OK (DescriptionTemplate)
    "severity": 1,              // ❌ Not in trait schema!
    "stackable": false,         // ❌ Not in trait schema!
    "modifiers": { ... },       // ✅ OK (ModifiersTemplate)
    "autoRemove": false         // ❌ Not in trait schema!
  },
  "flags": {
    "rt": {
      "kind": "condition",      // ❌ Hack to mark as condition
      "appliesTo": "target"     // ❌ Not standardized
    }
  }
}
```

### Schema Mismatches

| Pack Field | TraitData Schema | ConditionData Schema | Status |
|------------|------------------|----------------------|--------|
| `type` | ✅ `trait` | ✅ `condition` (if existed) | ❌ Wrong type |
| `requirements` | ✅ Trait field | ❌ Not needed | ❌ Wrong schema |
| `descriptionText` | ❌ Legacy | ❌ Legacy | ❌ Should remove |
| `effects` | ❌ Legacy | ❌ Legacy | ❌ Should remove |
| `severity` | ❌ Not in schema | ✅ Should be | ❌ Wrong schema |
| `stackable` | ❌ Not in schema | ✅ Should be | ❌ Wrong schema |
| `stacks` | ❌ Not in schema | ✅ Should be | ❌ Missing from pack |
| `autoRemove` | ❌ Not in schema | ❌ Not in schema | ❌ Undefined field |
| `nature` | ❌ Not in schema | ✅ In ConditionData | ❌ Missing from pack |
| `effect` | ❌ Not in schema | ✅ HTMLField in ConditionData | ❌ Missing from pack |
| `removal` | ❌ Not in schema | ✅ HTMLField in ConditionData | ❌ Missing from pack |
| `notes` | ❌ Not in schema | ✅ In ConditionData | ❌ Missing from pack |

### Data Model Issues

**ConditionData exists** but **CONDITIONS use TraitData**!

```javascript
// src/module/data/item/condition.mjs (EXISTS but UNUSED)
export default class ConditionData extends ItemDataModel.mixin(
  DescriptionTemplate,
  ModifiersTemplate
) {
  static defineSchema() {
    return {
      identifier: new IdentifierField(),
      nature: new fields.StringField({           // ✅ Good: beneficial/harmful/neutral
        choices: ["beneficial", "harmful", "neutral"]
      }),
      effect: new fields.HTMLField(),            // ✅ Good: rich text description
      removal: new fields.HTMLField(),           // ✅ Good: how to remove
      stackable: new fields.BooleanField(),      // ✅ Good: can stack
      stacks: new fields.NumberField(),          // ✅ Good: stack count
      notes: new fields.StringField()            // ✅ Good: GM notes
    };
  }
  
  // ❌ PROBLEM: natureLabel uses game.i18n.localize() without checking if key exists!
  get natureLabel() {
    return game.i18n.localize(`RT.Condition.${this.nature.capitalize()}`);
  }
}
```

### Pack Data Problems

**8 conditions** in `rt-items-conditions`:
1. `concealed` — Attacks against concealed targets: -20
2. `fatigued` — Any test while fatigued: -10
3. `grappled` — Hitting a target engaged in a grapple: +20
4. `helpless` — Attacks against helpless targets: Autohit
5. `pinned` — Attacks against pinned targets: +20
6. `prone` — Complex (melee +10, ranged -10, dodge -20)
7. `stunned` — Attacks against stunned targets: +20
8. `surprised-unaware` — No Reactions, cannot dodge or parry

**All conditions have**:
- ❌ Wrong `type: "trait"` (should be `type: "condition"`)
- ❌ Legacy `descriptionText`, `effects`, `source` as string
- ❌ Undefined `severity`, `stackable`, `autoRemove` fields
- ❌ Missing `nature`, `effect`, `removal`, `stacks` fields
- ❌ Hack flag `flags.rt.kind = "condition"` to identify them
- ❌ Generic icon (`icons/svg/aura.svg`) for all

### Display Problems

**"Object [object]" likely appears when**:
1. `natureLabel` calls `game.i18n.localize()` on non-existent keys
2. `chatProperties` or `headerLabels` return objects instead of strings
3. Templates try to display nested objects directly

**Missing localization**:
```javascript
// These keys don't exist in en.json:
RT.Condition.Beneficial
RT.Condition.Harmful
RT.Condition.Neutral
RT.Condition.Nature
RT.Condition.Effect
RT.Condition.Removal
RT.Condition.Stackable
RT.Condition.Stacks
RT.Condition.AppliesTo
// ... etc
```

### Template Problems

**No condition-specific sheet** — they use `item-trait-sheet-modern.hbs`:
- ❌ Shows trait-specific fields (level, requirements)
- ❌ Doesn't show condition-specific fields (nature, stackable, removal)
- ❌ No visual distinction from regular traits
- ❌ No stacking UI

### Compendium Browser

**Should work but** conditions will display incorrectly:
- Source will show "Object [object]" (if source is object not string in pack)
- Nature will show "RT.Condition.Harmful" instead of "Harmful"
- Missing visual indicators for nature (beneficial vs harmful)

---

## 📋 PROPER CONDITIONS SYSTEM DESIGN

### The Decision: Keep as Traits or Make Proper Type?

**Option A: Keep as Traits with Better Flags** (MINIMAL)
- ✅ No schema changes needed
- ✅ No template.json changes
- ✅ Smaller pack migration
- ❌ Conditions remain second-class citizens
- ❌ Confusion between traits and conditions
- ❌ Limited UI customization

**Option B: Create Proper `condition` Item Type** (RECOMMENDED) ✅
- ✅ Clean separation of concerns
- ✅ Custom UI tailored for conditions
- ✅ Proper schema for condition-specific fields
- ✅ Better user experience
- ✅ Follows V13 best practices
- ❌ Requires template.json update
- ❌ More complex pack migration

**DECISION: Option B** — Create proper `condition` type following Critical Injuries pattern

### Core Condition Schema

```javascript
// src/module/data/item/condition.mjs (UPDATED)
export default class ConditionData extends ItemDataModel.mixin(
  DescriptionTemplate,
  ModifiersTemplate
) {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      // Unique identifier (kebab-case)
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // Nature: beneficial, harmful, neutral
      nature: new fields.StringField({
        required: true,
        initial: "harmful",
        choices: ["beneficial", "harmful", "neutral"]
      }),
      
      // Effect description (rich text)
      effect: new fields.HTMLField({ required: true, blank: true }),
      
      // How to remove (rich text)
      removal: new fields.HTMLField({ required: false, blank: true }),
      
      // Stacking
      stackable: new fields.BooleanField({ required: true, initial: false }),
      stacks: new fields.NumberField({ required: true, initial: 1, min: 1, integer: true }),
      
      // Who does it apply to?
      appliesTo: new fields.StringField({
        required: true,
        initial: "self",
        choices: ["self", "target", "both", "area"]
      }),
      
      // Duration tracking
      duration: new fields.SchemaField({
        value: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
        units: new fields.StringField({
          required: true,
          initial: "permanent",
          choices: ["rounds", "minutes", "hours", "days", "permanent"]
        })
      }),
      
      // Notes
      notes: new fields.StringField({ required: false, blank: true })
    };
  }

  /* -------------------------------------------- */
  /*  Computed Properties (with safe fallbacks)   */
  /* -------------------------------------------- */

  /**
   * Get localized nature label.
   * @type {string}
   */
  get natureLabel() {
    const key = `RT.Condition.Nature.${this.nature.capitalize()}`;
    return game.i18n.has(key) ? game.i18n.localize(key) : this.nature.capitalize();
  }

  /**
   * Get nature icon class.
   * @type {string}
   */
  get natureIcon() {
    const icons = {
      beneficial: "fa-plus-circle",
      harmful: "fa-exclamation-triangle",
      neutral: "fa-info-circle"
    };
    return icons[this.nature] || "fa-question-circle";
  }

  /**
   * Get nature CSS class.
   * @type {string}
   */
  get natureClass() {
    return `nature-${this.nature}`;
  }

  /**
   * Get localized appliesTo label.
   * @type {string}
   */
  get appliesToLabel() {
    const key = `RT.Condition.AppliesTo.${this.appliesTo.capitalize()}`;
    return game.i18n.has(key) ? game.i18n.localize(key) : this.appliesTo.capitalize();
  }

  /**
   * Get appliesTo icon.
   * @type {string}
   */
  get appliesToIcon() {
    const icons = {
      self: "fa-user",
      target: "fa-crosshairs",
      both: "fa-users",
      area: "fa-circle-notch"
    };
    return icons[this.appliesTo] || "fa-question";
  }

  /**
   * Get full name with stacks.
   * @type {string}
   */
  get fullName() {
    let name = this.parent?.name ?? "";
    if ( this.stackable && this.stacks > 1 ) {
      name += ` (×${this.stacks})`;
    }
    return name;
  }

  /**
   * Get duration display string.
   * @type {string}
   */
  get durationDisplay() {
    if ( this.duration.units === "permanent" ) {
      return game.i18n.localize("RT.Condition.Duration.Permanent");
    }
    const unitKey = `RT.Condition.Duration.${this.duration.units.capitalize()}`;
    const unit = game.i18n.has(unitKey) ? game.i18n.localize(unitKey) : this.duration.units;
    return `${this.duration.value} ${unit}`;
  }

  /**
   * Is this condition temporary?
   * @type {boolean}
   */
  get isTemporary() {
    return this.duration.units !== "permanent";
  }

  /* -------------------------------------------- */
  /*  Chat Properties                             */
  /* -------------------------------------------- */

  /** @override */
  get chatProperties() {
    const props = [
      this.natureLabel,
      this.appliesToLabel
    ];
    
    if ( this.stackable ) {
      props.push(`${game.i18n.localize("RT.Condition.Stacks")}: ${this.stacks}`);
    }
    
    if ( this.isTemporary ) {
      props.push(`${game.i18n.localize("RT.Condition.Duration.Label")}: ${this.durationDisplay}`);
    }
    
    return props;
  }

  /* -------------------------------------------- */
  /*  Header Labels                               */
  /* -------------------------------------------- */

  /** @override */
  get headerLabels() {
    return {
      nature: this.natureLabel,
      stacks: this.stackable ? this.stacks : "-",
      duration: this.durationDisplay
    };
  }
}
```

---

## 🎨 CONDITION ICONS & VISUAL DESIGN

### Icon Assignments

```javascript
// Condition-specific icons (Font Awesome)
const CONDITION_ICONS = {
  // Core combat conditions
  "stunned": "fa-dizzy",
  "prone": "fa-angle-down",
  "grappled": "fa-hand-rock",
  "pinned": "fa-thumbtack",
  "helpless": "fa-bed",
  "surprised": "fa-user-slash",
  "concealed": "fa-eye-slash",
  
  // Fatigue & exhaustion
  "fatigued": "fa-tired",
  "exhausted": "fa-bed-pulse",
  
  // Mental conditions
  "frightened": "fa-face-fearful",
  "shocked": "fa-bolt",
  "confused": "fa-circle-question",
  "berserk": "fa-fire-flame-curved",
  
  // Movement
  "immobilized": "fa-chain",
  "slowed": "fa-snail",
  "hastened": "fa-running",
  
  // Senses
  "blinded": "fa-eye-slash",
  "deafened": "fa-ear-deaf",
  
  // Beneficial
  "inspired": "fa-star",
  "blessed": "fa-hands-praying",
  "reinforced": "fa-shield-halved"
};
```

### Nature Color Coding

```scss
// Nature badges
.rt-nature-badge {
  &--beneficial {
    background: linear-gradient(135deg, #2ecc71, #27ae60);
    color: white;
  }
  
  &--harmful {
    background: linear-gradient(135deg, #e74c3c, #c0392b);
    color: white;
  }
  
  &--neutral {
    background: linear-gradient(135deg, #95a5a6, #7f8c8d);
    color: white;
  }
}
```

### AppliesTo Badges

```scss
// AppliesTo indicators
.rt-applies-badge {
  &--self {
    background: $rt-accent-blue;
    &::before { content: "\f007"; /* fa-user */ }
  }
  
  &--target {
    background: $rt-accent-red;
    &::before { content: "\f05b"; /* fa-crosshairs */ }
  }
  
  &--both {
    background: $rt-accent-purple;
    &::before { content: "\f0c0"; /* fa-users */ }
  }
  
  &--area {
    background: $rt-accent-orange;
    &::before { content: "\f111"; /* fa-circle */ }
  }
}
```

---

## 📝 LOCALIZATION KEYS

### Complete i18n Structure

```json
{
  "RT": {
    "Condition": {
      "Label": "Condition",
      "Type": "Condition",
      "Description": "Status effect that modifies gameplay",
      
      "Nature": {
        "Label": "Nature",
        "Beneficial": "Beneficial",
        "Harmful": "Harmful",
        "Neutral": "Neutral",
        "Description": "Is this condition helpful or harmful?"
      },
      
      "Effect": {
        "Label": "Effect",
        "Placeholder": "Describe the mechanical effect...",
        "Description": "What does this condition do?"
      },
      
      "Removal": {
        "Label": "Removal",
        "Placeholder": "How is this condition removed?",
        "Description": "Conditions for removal"
      },
      
      "Stackable": {
        "Label": "Stackable",
        "Description": "Can this condition stack multiple times?"
      },
      
      "Stacks": {
        "Label": "Stacks",
        "Current": "Current Stacks",
        "Description": "How many times is this condition applied?"
      },
      
      "AppliesTo": {
        "Label": "Applies To",
        "Self": "Self",
        "Target": "Target",
        "Both": "Both",
        "Area": "Area",
        "Description": "Who is affected by this condition?"
      },
      
      "Duration": {
        "Label": "Duration",
        "Value": "Value",
        "Units": "Units",
        "Permanent": "Permanent",
        "Rounds": "Rounds",
        "Minutes": "Minutes",
        "Hours": "Hours",
        "Days": "Days",
        "Description": "How long does this last?"
      },
      
      "Notes": {
        "Label": "Notes",
        "Placeholder": "Additional notes..."
      },
      
      "Chat": {
        "Applied": "{name} applied to {target}",
        "Removed": "{name} removed from {target}",
        "Stacked": "{name} stacked on {target} (×{stacks})"
      }
    }
  }
}
```

---

## 🗂️ PACK DATA STRUCTURE

### Current 8 Conditions (to migrate)

| Identifier | Name | Nature | AppliesTo | Effect Summary |
|------------|------|--------|-----------|----------------|
| `concealed` | Concealed | harmful | target | Attacks: -20 |
| `fatigued` | Fatigued | harmful | self | All tests: -10 |
| `grappled` | Grappled | harmful | target | Attacks vs grappled: +20 |
| `helpless` | Helpless | harmful | target | Attacks: Autohit |
| `pinned` | Pinned | harmful | target | Attacks: +20 |
| `prone` | Prone | harmful | both | Melee vs: +10, Ranged vs: -10, Dodge while: -20 |
| `stunned` | Stunned | harmful | target | Attacks: +20 |
| `surprised` | Surprised/Unaware | harmful | self | No Reactions, cannot Dodge/Parry |

### Additional Core Conditions (to add)

| Identifier | Name | Nature | AppliesTo | Source |
|------------|------|--------|-----------|--------|
| `blinded` | Blinded | harmful | self | Core pg. 249 |
| `deafened` | Deafened | harmful | self | Core pg. 249 |
| `on-fire` | On Fire | harmful | self | Core pg. 243 |
| `bleeding` | Bleeding | harmful | self | Common houserule |
| `frightened` | Frightened | harmful | self | Fear rules |
| `inspired` | Inspired | beneficial | self | Leadership |

### Target JSON Structure

```json
{
  "name": "Stunned",
  "type": "condition",
  "img": "systems/rogue-trader/assets/icons/conditions/stunned.svg",
  "system": {
    "identifier": "stunned",
    
    "nature": "harmful",
    
    "effect": "<p>A stunned character loses their next Action. Attacks against stunned targets gain a +20 bonus.</p>",
    
    "removal": "<p>The condition is automatically removed at the start of the character's next turn.</p>",
    
    "stackable": false,
    "stacks": 1,
    
    "appliesTo": "target",
    
    "duration": {
      "value": 1,
      "units": "rounds"
    },
    
    "description": {
      "value": "<p>Stunned characters are disoriented and unable to act effectively.</p>",
      "source": {
        "book": "Rogue Trader Core",
        "page": "249",
        "custom": ""
      }
    },
    
    "modifiers": {
      "characteristics": {},
      "skills": {},
      "combat": {}
    },
    
    "notes": ""
  },
  "effects": [],
  "flags": {
    "rt": {
      "generated": true,
      "version": "2.0"
    }
  },
  "_id": "t5wkuApqsrmTeadP"
}
```

---

## 🔧 IMPLEMENTATION PHASES

### Phase 1: Data Model Update ✅

**File**: `src/module/data/item/condition.mjs`

**Tasks**:
1. Add computed properties with safe fallbacks:
   - `natureLabel` — With `game.i18n.has()` check
   - `natureIcon` — FA icon class
   - `natureClass` — CSS class
   - `appliesToLabel` — With fallback
   - `appliesToIcon` — FA icon class
   - `durationDisplay` — Formatted string
   - `isTemporary` — Boolean
2. Add `appliesTo` field to schema
3. Add `duration` SchemaField to schema
4. Fix `chatProperties` to return string array
5. Fix `headerLabels` to return flat strings
6. Update `fullName` to use `×` symbol for stacks

**File**: `src/lang/en.json`

**Tasks**:
1. Add all `RT.Condition.*` localization keys (~40 keys)
2. Add nature labels (Beneficial, Harmful, Neutral)
3. Add appliesTo labels (Self, Target, Both, Area)
4. Add duration unit labels (Rounds, Minutes, Hours, Days, Permanent)
5. Add field labels and descriptions

**Validation**:
- ✅ All computed properties return strings/primitives
- ✅ All localization keys exist before use
- ✅ No "Object [object]" errors possible

---

### Phase 2: Template.json Update

**File**: `src/template.json`

**Tasks**:
1. Add `"condition"` to Item types array (line ~1000)
2. Create `condition` schema section:

```json
"condition": {
  "templates": [
    "itemDescription"
  ],
  "identifier": "",
  "nature": "harmful",
  "effect": "",
  "removal": "",
  "stackable": false,
  "stacks": 1,
  "appliesTo": "self",
  "duration": {
    "value": 0,
    "units": "permanent"
  },
  "notes": ""
}
```

**Validation**:
- ✅ Schema matches ConditionData exactly
- ✅ All fields have default values
- ✅ Templates array includes "itemDescription"

---

### Phase 3: Modern Condition Sheet

**File**: `src/module/applications/item/condition-sheet.mjs` (NEW)

```javascript
import BaseItemSheet from "./base-item-sheet.mjs";

export default class ConditionSheet extends BaseItemSheet {
    static DEFAULT_OPTIONS = {
        classes: ["condition"],
        position: {
            width: 560,
            height: 480
        }
    };

    static PARTS = {
        sheet: {
            template: "systems/rogue-trader/templates/item/item-condition-sheet-v2.hbs",
            scrollable: [".rt-tab-content"]
        }
    };

    static TABS = [
        { tab: "details", group: "primary", label: "Details" },
        { tab: "description", group: "primary", label: "Description" },
        { tab: "effects", group: "primary", label: "Effects" }
    ];

    tabGroups = {
        primary: "details"
    };
}
```

**File**: `src/templates/item/item-condition-sheet-v2.hbs` (NEW)

**Template Structure**:
1. **Header** (compact)
   - Image with nature icon overlay
   - Name input
   - Nature badge
   - AppliesTo badge
2. **Details Grid**
   - Nature select (beneficial/harmful/neutral)
   - AppliesTo select (self/target/both/area)
   - Stackable checkbox + stacks input
   - Duration inputs (value + units select)
3. **Effect Editor** (ProseMirror)
4. **Removal Editor** (ProseMirror)
5. **Notes Textarea**
6. **Source Panel** (book/page/custom)
7. **Description Editor** (ProseMirror)

**Key Features**:
- Visual nature indicators (green/red/gray)
- Stacking UI (conditional show)
- Duration tracking (conditional show)
- Icon preview in header

**File**: `src/module/applications/item/_module.mjs`

**Tasks**:
1. Add export: `export { default as ConditionSheet } from "./condition-sheet.mjs";`

**File**: `src/module/config.mjs`

**Tasks**:
1. Register ConditionSheet in DocumentSheetConfig

---

### Phase 4: Pack Data Migration

**File**: `scripts/migrate-conditions.mjs` (NEW)

**Script Purpose**:
Migrate 8 existing conditions from `type: "trait"` to `type: "condition"`

**Migration Logic**:
```javascript
import fs from "fs";
import path from "path";

const PACK_DIR = "./src/packs/rt-items-conditions/_source";

// Condition metadata
const CONDITIONS = {
  "concealed": {
    nature: "harmful",
    appliesTo: "target",
    effect: "<p>Attacks against concealed targets suffer a -20 penalty.</p>",
    removal: "<p>Removed when the target is no longer obscured or hidden.</p>",
    stackable: false,
    duration: { value: 0, units: "permanent" },
    icon: "fa-eye-slash",
    source: { book: "Rogue Trader Core", page: "249", custom: "" }
  },
  "fatigued": {
    nature: "harmful",
    appliesTo: "self",
    effect: "<p>All Tests suffer a -10 penalty while fatigued.</p>",
    removal: "<p>Removed after 1 hour of rest, or instantly with specific abilities.</p>",
    stackable: false,
    duration: { value: 0, units: "permanent" },
    icon: "fa-tired",
    source: { book: "Rogue Trader Core", page: "232", custom: "" }
  },
  "grappled": {
    nature: "harmful",
    appliesTo: "target",
    effect: "<p>Attacks against targets engaged in a grapple gain a +20 bonus.</p>",
    removal: "<p>Removed when the grapple ends (Opposed Strength Test).</p>",
    stackable: false,
    duration: { value: 0, units: "permanent" },
    icon: "fa-hand-rock",
    source: { book: "Rogue Trader Core", page: "247", custom: "" }
  },
  "helpless": {
    nature: "harmful",
    appliesTo: "target",
    effect: "<p>Attacks against helpless targets automatically hit.</p>",
    removal: "<p>Removed when the target can act again (unconscious, bound, etc).</p>",
    stackable: false,
    duration: { value: 0, units: "permanent" },
    icon: "fa-bed",
    source: { book: "Rogue Trader Core", page: "249", custom: "" }
  },
  "pinned": {
    nature: "harmful",
    appliesTo: "target",
    effect: "<p>Attacks against pinned targets gain a +20 bonus. Pinned characters cannot move.</p>",
    removal: "<p>Removed by going prone, breaking line of sight, or suppression ending.</p>",
    stackable: false,
    duration: { value: 0, units: "permanent" },
    icon: "fa-thumbtack",
    source: { book: "Rogue Trader Core", page: "249", custom: "" }
  },
  "prone": {
    nature: "harmful",
    appliesTo: "both",
    effect: "<p>Melee attacks against prone targets: +10. Ranged attacks against prone: -10. Dodging while prone: -20.</p>",
    removal: "<p>Removed by standing up (Half Action).</p>",
    stackable: false,
    duration: { value: 0, units: "permanent" },
    icon: "fa-angle-down",
    source: { book: "Rogue Trader Core", page: "249", custom: "" }
  },
  "stunned": {
    nature: "harmful",
    appliesTo: "target",
    effect: "<p>Stunned characters lose their next Action. Attacks against stunned targets gain a +20 bonus.</p>",
    removal: "<p>Automatically removed at the start of the character's next turn.</p>",
    stackable: false,
    duration: { value: 1, units: "rounds" },
    icon: "fa-dizzy",
    source: { book: "Rogue Trader Core", page: "249", custom: "" }
  },
  "surprised-unaware": {
    nature: "harmful",
    appliesTo: "self",
    effect: "<p>Surprised characters cannot take Reactions and cannot Dodge or Parry.</p>",
    removal: "<p>Removed at the end of the first round of combat.</p>",
    stackable: false,
    duration: { value: 1, units: "rounds" },
    icon: "fa-user-slash",
    source: { book: "Rogue Trader Core", page: "249", custom: "" }
  }
};

// Read all condition files
const files = fs.readdirSync(PACK_DIR).filter(f => f.endsWith(".json"));

files.forEach(file => {
  const filePath = path.join(PACK_DIR, file);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  
  // Extract identifier from filename (e.g., "stunned_xxxxx.json" -> "stunned")
  const identifier = file.split("_")[0];
  const meta = CONDITIONS[identifier];
  
  if (!meta) {
    console.warn(`No metadata for ${identifier}, skipping...`);
    return;
  }
  
  // Transform to condition type
  const updated = {
    name: data.name,
    type: "condition",  // ✅ Change type
    img: data.img,      // Keep existing icon for now
    system: {
      identifier: identifier,
      nature: meta.nature,
      effect: meta.effect,
      removal: meta.removal,
      stackable: meta.stackable,
      stacks: 1,
      appliesTo: meta.appliesTo,
      duration: meta.duration,
      description: {
        value: meta.effect,  // Copy effect to description
        source: meta.source
      },
      modifiers: {
        characteristics: {},
        skills: {},
        combat: {}
      },
      notes: ""
    },
    effects: [],
    flags: {
      rt: {
        generated: true,
        version: "2.0"
      }
    },
    _id: data._id
  };
  
  // Write updated file
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
  console.log(`✅ Migrated: ${data.name}`);
});

console.log(`\n✅ Migration complete! ${files.length} conditions updated.`);
```

**Run Command**:
```bash
node scripts/migrate-conditions.mjs
```

**Validation**:
- ✅ All 8 conditions have `type: "condition"`
- ✅ All have proper `system` schema
- ✅ All have `source` as object
- ✅ No legacy fields remain
- ✅ All identifiers match filenames

---

### Phase 5: Additional Conditions

**File**: `scripts/generate-additional-conditions.mjs` (NEW)

**Generate 6 more conditions**:
1. **Blinded** — Cannot see, auto-fail sight tests, attacks -30
2. **Deafened** — Cannot hear, auto-fail hearing tests
3. **On Fire** — 1d10 damage per round, Agility test to extinguish
4. **Bleeding** — Lose 1 wound per round until staunched
5. **Frightened** — -10 to all tests, may be required to flee
6. **Inspired** — +10 to Willpower tests, reroll failed Fear tests

**Total conditions**: 14 (8 existing + 6 new)

---

### Phase 6: Chat Card Template

**File**: `src/templates/chat/condition-card.hbs` (NEW)

**Structure**:
```handlebars
<div class="rt-condition-card {{system.natureClass}}">
  <!-- Header -->
  <header class="rt-condition-header rt-condition-header--{{system.nature}}">
    <div class="rt-condition-icon">
      <i class="fas {{system.natureIcon}}"></i>
    </div>
    <div class="rt-condition-title">
      <h3>{{item.name}}</h3>
      <span class="rt-condition-subtitle">{{system.natureLabel}} Condition</span>
    </div>
    {{#if system.stackable}}
    <div class="rt-condition-stacks">
      <span class="rt-stack-badge">×{{system.stacks}}</span>
    </div>
    {{/if}}
  </header>

  <!-- Meta Info -->
  <div class="rt-condition-meta">
    <span class="rt-meta-tag rt-meta-tag--applies">
      <i class="fas {{system.appliesToIcon}}"></i> {{system.appliesToLabel}}
    </span>
    {{#if system.isTemporary}}
    <span class="rt-meta-tag rt-meta-tag--duration">
      <i class="fas fa-clock"></i> {{system.durationDisplay}}
    </span>
    {{/if}}
  </div>

  <!-- Effect -->
  <div class="rt-condition-effect">
    <h4>Effect</h4>
    <div class="rt-prose">{{{system.effect}}}</div>
  </div>

  <!-- Removal -->
  {{#if system.removal}}
  <div class="rt-condition-removal">
    <h4>Removal</h4>
    <div class="rt-prose">{{{system.removal}}}</div>
  </div>
  {{/if}}

  <!-- Source -->
  {{#if system.description.source.book}}
  <footer class="rt-condition-footer">
    <span class="rt-source-ref">
      {{system.description.source.book}}{{#if system.description.source.page}}, pg. {{system.description.source.page}}{{/if}}
    </span>
  </footer>
  {{/if}}
</div>
```

**Key Features**:
- Nature-specific header colors
- Stacking indicator
- AppliesTo badge
- Duration display (if temporary)
- Effect and removal sections
- Source reference footer

---

### Phase 7: SCSS Styling

**File**: `src/scss/item/_condition.scss` (NEW)

**Sections**:
1. **Sheet Styles** (~150 lines)
   - Form layout (2-column grid)
   - Nature select with colored options
   - AppliesTo select with icons
   - Stacking UI (conditional)
   - Duration inputs (inline)
   - Badge previews in header
2. **Chat Card Styles** (~180 lines)
   - Nature-specific header themes:
     - Beneficial: Green gradient
     - Harmful: Red gradient
     - Neutral: Gray gradient
   - Meta tag badges (applies, duration)
   - Effect/removal sections with borders
   - Source footer styling
3. **Badge System** (~40 lines)
   - Nature badges (colored circles with icons)
   - AppliesTo badges (colored tags)
   - Stack indicators (×N badge)
4. **Animations** (~20 lines)
   - Fade-in for temporary conditions
   - Pulse for harmful conditions

**File**: `src/scss/item/_index.scss`

**Tasks**:
1. Add `@import 'condition';`

**Variables Needed** (already exist):
- `$rt-accent-green: #2ecc71;` (beneficial)
- `$rt-accent-red: #e74c3c;` (harmful)
- `$rt-accent-gray: #95a5a6;` (neutral)
- `$rt-accent-blue: #3498db;` (self/target)
- `$rt-accent-purple: #9b59b6;` (both)
- `$rt-accent-orange: #f39c12;` (area)

---

### Phase 8: System Registration

**File**: `src/module/config.mjs`

**Tasks**:
1. Add ConditionSheet to DocumentSheetConfig:

```javascript
DocumentSheetConfig.registerSheet(Item, "rogue-trader", ConditionSheet, {
  types: ["condition"],
  makeDefault: true,
  label: "RT.SheetType.Condition"
});
```

**File**: `src/lang/en.json`

**Tasks**:
1. Add `"RT.SheetType.Condition": "Condition Sheet"`

---

## 🧪 TESTING CHECKLIST

### Build & Load
- [ ] `npm run build` succeeds
- [ ] No console errors on Foundry startup
- [ ] Pack loads (8 conditions initially, 14 after Phase 5)

### Data Model
- [ ] `game.items.find(i => i.type === "condition")` returns conditions
- [ ] `condition.system.natureLabel` returns string (not "Object [object]")
- [ ] `condition.system.appliesToLabel` returns string
- [ ] `condition.system.durationDisplay` returns formatted string
- [ ] `condition.system.fullName` includes stacks if stackable

### Sheet Display
- [ ] Condition sheet opens (not trait sheet)
- [ ] All fields editable
- [ ] Nature select shows 3 options with icons
- [ ] AppliesTo select shows 4 options with icons
- [ ] Stackable checkbox toggles stacks input visibility
- [ ] Duration inputs work (value + units)
- [ ] ProseMirror editors work (effect, removal, description)
- [ ] Source panel displays correctly

### Compendium Browser
- [ ] Conditions appear in browser
- [ ] Nature badge displays with correct color
- [ ] AppliesTo badge displays
- [ ] No "Object [object]" errors
- [ ] Source displays correctly

### Drag & Drop
- [ ] Can drag condition from compendium to character
- [ ] Condition appears in character items
- [ ] Can drag condition from character to chat
- [ ] Chat card displays correctly

### Chat Cards
- [ ] Nature-specific header color
- [ ] Effect section displays HTML
- [ ] Removal section displays (if present)
- [ ] Stack indicator shows (if stackable)
- [ ] Duration displays (if temporary)
- [ ] Source footer displays

### Localization
- [ ] All labels display in English (no RT.* keys visible)
- [ ] Nature options show: Beneficial, Harmful, Neutral
- [ ] AppliesTo options show: Self, Target, Both, Area
- [ ] Duration units show: Rounds, Minutes, Hours, Days, Permanent

---

## 📊 MIGRATION STATISTICS

**Existing Conditions**: 8  
**New Conditions (Phase 5)**: +6  
**Total Conditions**: 14

**Code Changes**:
- **Modified Files**: 7
  - `condition.mjs` — +140 lines
  - `template.json` — +15 lines
  - `en.json` — +45 keys
  - `_index.scss` — +1 import
  - `config.mjs` — +5 lines
  - `item/_module.mjs` — +1 export
- **New Files**: 6
  - `condition-sheet.mjs` — ~45 lines
  - `item-condition-sheet-v2.hbs` — ~220 lines
  - `condition-card.hbs` — ~60 lines
  - `_condition.scss` — ~400 lines
  - `migrate-conditions.mjs` — ~120 lines
  - `generate-additional-conditions.mjs` — ~180 lines

**Total Lines**: ~1200 lines of new/modified code

**Localization Keys**: 45+ new keys

**Time Estimate**: ~4-5 hours for complete implementation

---

## 🎯 SUCCESS CRITERIA

✅ **No "Object [object]" errors anywhere**  
✅ **Conditions are proper item type (not trait hack)**  
✅ **All 8 existing conditions migrated successfully**  
✅ **6 additional core conditions added**  
✅ **Modern V2 sheet with full UI**  
✅ **Chat cards with nature-specific styling**  
✅ **Complete localization (45+ keys)**  
✅ **Proper schema matching DataModel**  
✅ **Compendium browser integration**  
✅ **Full SCSS styling with badges/themes**

---

## 📚 REFERENCE IMPLEMENTATION

This refactor follows the **Critical Injuries pattern**:
- ✅ Proper item type (not trait hack)
- ✅ DataModel with computed properties + safe fallbacks
- ✅ Modern V2 ApplicationV2 sheet
- ✅ Template.json schema matching DataModel
- ✅ Script-based pack generation/migration
- ✅ Complete localization with fallbacks
- ✅ Chat card template with visual design
- ✅ SCSS with color coding and badges
- ✅ Source as structured object
- ✅ ProseMirror for rich text fields

**Files to Reference**:
- `CRITICAL_INJURIES_DEEP_DIVE.md` — Full pattern documentation
- `CRITICAL_INJURIES_IMPLEMENTATION_SUMMARY.md` — Implementation checklist
- `src/module/data/item/critical-injury.mjs` — DataModel pattern
- `scripts/generate-critical-injuries.mjs` — Pack generation pattern

---

**Next Step**: Begin Phase 1 (Data Model & Localization)
