# Armour System Deep Dive & Refactor Plan

**Date**: 2026-01-09  
**Scope**: Complete armour system modernization (data models, pack migration, sheets, compendium display)  
**Files Affected**: 174 armour pack entries, data models, sheets, templates, scripts

---

## 🔍 Current State Analysis

### Pack Data Issues (174 Armour Entries)

**Legacy Fields Present**:
```json
{
  "system": {
    "locations": "All",              // String format (legacy)
    "ap": 7,                          // Number, string, percentage, or pattern
    "maxAg": 50,                      // Number or "-" string
    "weight": "35kg",                 // String with units (should be number)
    "cost": "-",                      // String (should be structured)
    "notes": "...",                   // Freeform text
    "source": "DH 2E: Enemies Within" // String
  }
}
```

**AP Field Variations Found** (43 unique formats):
- **Numbers**: `0`, `1`, `2`, `3`, `4`, `5`, `6`, `7`, `8`, `9`, `10`, `12`, `14`
- **Decimals**: `0.25`, `0.3`, `0.35`, `0.4`, `0.5`, `0.55`, `0.6`, `0.65`, `0.8` (force fields, percentage as decimal)
- **Percentages**: `"40%"`, `"50%"`, `"55%"`, `"60%"`, `"65%"`, `"70%"`, `"75%"`, `"80%"` (force fields)
- **Special**: `"Special"`, `"Psy*9%"` (narrative armor)
- **Patterns**: `"4/3/3/3"`, `"4/4/3/3"`, `"5/14/9/9"`, `"6/7/7/5"`, `"6/8/8/4"`, `"7/9/7/7"`, `"8/10/8/8"`, `"8/11/8/8"`, `"8/14/10/10"`, `"8/9/8/8"`, `"9/10/9/9"`, `"0/7/7/5"` (Head/Body/Arms/Legs format)

**Locations Field Variations** (13 unique formats):
- `"All"`
- `"All (H/B/A/L)"` (with notation)
- `"Head"`
- `"Body"`
- `"Chest"` (synonym for body)
- `"Arms"`
- `"Legs"`
- `"Arms, Body"`
- `"Arms, Body, Legs"`
- `"Body, Arms, Legs"` (order variation)
- `"Body, Legs"`
- `"Head, Arms, Body, Legs"` (explicit all)
- `"Arm, Body"` (singular/plural inconsistency)

**New Fields Present** (already in some entries):
```json
{
  "coverage": ["all"],               // Array (should be Set)
  "armourPoints": {                  // Object with location keys
    "head": 7,
    "body": 7,
    "leftArm": 7,
    "rightArm": 7,
    "leftLeg": 7,
    "rightLeg": 7
  },
  "modifications": [],               // Array of installed mods
  "maxAgility": 50                   // Numeric (cleaned up)
}
```

### Data Model State

**File**: `src/module/data/item/armour.mjs` (305 lines)

**Schema** (Lines 21-86):
- ✅ `identifier` field
- ✅ `type` field (13 choices including void/xenos/enforcer/hostile-environment)
- ✅ `armourPoints` SchemaField (6 locations as NumberFields)
- ✅ `coverage` SetField (should store Set of location strings)
- ✅ `maxAgility` NumberField (nullable)
- ✅ `properties` SetField (special properties like "sealed", "auto-stabilized")
- ✅ `modificationSlots` NumberField
- ✅ `modifications` ArrayField (installed mod references)

**Legacy Compatibility Layer** (Lines 109-235):
- ✅ `_getLegacyField()` - Access legacy `ap`/`locations` from `_source`
- ✅ `_hasCustomArmourPoints()` - Check if new fields populated
- ✅ `_parseLegacyLocations()` - Parse string locations → Set
- ✅ `_parseLegacyAP()` - Parse ap field (number, string, pattern)
- ✅ `_getLegacyArmourProfile()` - Combine legacy parsing
- ✅ `_getEffectiveCoverage()` - Use new or fallback to legacy
- ✅ `getAPForLocation(location)` - Get AP considering legacy or new
- ✅ `apSummary` getter - Display string (e.g., "All: 7" or "H: 7, B: 8, LA: 6...")

**Properties** (Lines 90-108, 237-267):
- ✅ `typeLabel` - Localized type name
- ✅ `coversAll` - Boolean check
- ✅ `availableModSlots` - Remaining modification slots
- ✅ `chatProperties` - Array for chat card display
- ✅ `headerLabels` - Object for sheet header

**Issues**:
1. **SetField Serialization**: `coverage` and `properties` are defined as `SetField` but pack data stores arrays
2. **Weight Field**: Pack data has strings like `"35kg"`, schema expects number
3. **Cost Field**: Pack data has strings like `"-"`, schema has structured object
4. **Missing Properties**: No armour in packs uses `properties` SetField
5. **Display Issues**: `Set` objects display as `[object Set]` when stringified

### Sheet State

**File**: `src/module/applications/item/armour-sheet.mjs` (45 lines)

**Current Structure**:
- Extends `ContainerItemSheet` (allows embedded mods)
- 3 tabs: protection, description, effects
- Uses template `item-armour-sheet-modern.hbs`

**Template**: `src/templates/item/item-armour-sheet-modern.hbs` (260 lines)

**Features**:
- ✅ Quick stats bar (6 location badges + equipped indicator)
- ✅ Armour points grid (6 location inputs)
- ✅ Type/availability/craftsmanship/weight selects
- ✅ Modification tab (list embedded mods)
- ✅ Description tab (ProseMirror editor)
- ✅ Effects tab (active effects panel)

**Issues**:
1. **Weight Input**: Uses `type="number"` but pack data has strings
2. **Coverage Display**: No visual indication of which locations are covered
3. **Properties**: No UI to add/remove special properties
4. **Max Agility**: Input but no validation
5. **AP Summary**: Not displayed in header
6. **Type Dropdown**: Uses `dh.combat.armour_type` which may not exist

### Compendium Browser

**File**: `src/module/applications/compendium-browser.mjs` (300+ lines)

**Current Display** (template line 66-78):
```handlebars
<div class="compendium-item" data-uuid="{{uuid}}" draggable="true">
    <img src="{{img}}" alt="{{name}}" class="item-image" />
    <div class="item-details">
        <h4 class="item-name">{{name}}</h4>
        <div class="item-meta">
            <span class="item-type">{{type}}</span>
            {{#if sourceLabel}}
            <span class="item-source">{{sourceLabel}}</span>
            {{/if}}
            <span class="item-pack">{{pack}}</span>
        </div>
    </div>
</div>
```

**Issues**:
1. **No Type-Specific Display**: All items show same metadata
2. **Missing AP Summary**: Armour should show AP values
3. **Missing Coverage**: Armour should show covered locations
4. **Missing Type Badge**: Armour type (flak/mesh/carapace) not shown
5. **[object Object] Display**: If Set/complex objects accessed, displays as string

---

## 🎯 Goals

### 1. Data Integrity
- ✅ All 174 armour entries validated and normalized
- ✅ Legacy fields (`ap`, `locations`, `cost`, `notes`) removed
- ✅ New fields (`armourPoints`, `coverage`, `maxAgility`) populated correctly
- ✅ Weight values as numbers (remove "kg" suffix)
- ✅ Cost structured as `{value, currency}` or null
- ✅ Properties populated where appropriate

### 2. Data Model Enhancement
- ✅ SetField properly serialized/deserialized for `coverage` and `properties`
- ✅ Migration method to update old data on load
- ✅ Validation for AP values (0-20 range)
- ✅ Validation for coverage (must have at least one location or "all")
- ✅ Helper methods for common queries

### 3. Sheet Modernization
- ✅ Visual coverage indicator (body diagram or badge list)
- ✅ Properties tag editor (add/remove special properties)
- ✅ AP summary in header (e.g., "All: 7" or "Mixed")
- ✅ Type badge in header with color coding
- ✅ Weight input accepts number only
- ✅ Modification slot indicator (2/4 available)

### 4. Compendium Integration
- ✅ Type-specific item cards with relevant metadata
- ✅ Armour cards show: type badge, AP summary, coverage icons
- ✅ Filtering by armour type (flak/mesh/carapace/power/etc.)
- ✅ Filtering by coverage (all/partial/specific locations)
- ✅ Sorting by AP value

### 5. Localization
- ✅ Armour type labels (`RT.ArmourType.*`)
- ✅ Body location labels (`RT.BodyLocation.*`)
- ✅ Property labels (`RT.ArmourProperty.*`)
- ✅ Coverage labels (`RT.Coverage.*`)

---

## 📋 Implementation Plan

### Phase 1: Data Model Refinement (HIGH PRIORITY)

#### A. SetField Handling

**Problem**: `coverage` and `properties` are `SetField` but pack data uses arrays.

**Solution**: Add custom serialization/deserialization

```javascript
// In armour.mjs, add static methods

static migrateData(source) {
  // Convert array to Set for coverage
  if (Array.isArray(source.coverage)) {
    source.coverage = new Set(source.coverage);
  }
  
  // Convert array to Set for properties
  if (Array.isArray(source.properties)) {
    source.properties = new Set(source.properties);
  }
  
  return source;
}

static cleanData(source, options) {
  // Ensure Sets are serialized as arrays for storage
  if (source.coverage instanceof Set) {
    source.coverage = Array.from(source.coverage);
  }
  
  if (source.properties instanceof Set) {
    source.properties = Array.from(source.properties);
  }
  
  return super.cleanData(source, options);
}
```

#### B. Legacy Data Migration

**Add migration helper** to auto-update on document load:

```javascript
/**
 * Migrate legacy armour data to V13 schema.
 * Called automatically by Foundry when document loads with old data.
 * @param {object} source  The source data
 * @returns {object}       Migrated data
 */
static migrateData(source) {
  const updates = {};
  
  // 1. Migrate `ap` → `armourPoints`
  if (source.ap !== undefined && !this._hasCustomArmourPoints(source)) {
    const parsed = this._parseLegacyAP({ system: source });
    if (parsed?.pointsByLocation) {
      updates.armourPoints = parsed.pointsByLocation;
    } else if (parsed?.defaultValue !== undefined) {
      const ap = parsed.defaultValue;
      updates.armourPoints = {
        head: ap, body: ap, leftArm: ap, 
        rightArm: ap, leftLeg: ap, rightLeg: ap
      };
    }
  }
  
  // 2. Migrate `locations` → `coverage`
  if (typeof source.locations === 'string' && !source.coverage) {
    const parsed = this._parseLegacyLocations({ system: source });
    if (parsed?.size) {
      updates.coverage = Array.from(parsed);
    }
  }
  
  // 3. Migrate `maxAg` string → `maxAgility` number
  if (typeof source.maxAg === 'string') {
    if (source.maxAg === '-' || source.maxAg === '') {
      updates.maxAgility = null;
    } else {
      const parsed = parseInt(source.maxAg);
      if (!isNaN(parsed)) updates.maxAgility = parsed;
    }
  }
  
  // 4. Clean weight (remove "kg" suffix)
  if (typeof source.weight === 'string') {
    const cleaned = parseFloat(source.weight.replace(/[^\d.]/g, ''));
    if (!isNaN(cleaned)) updates.weight = cleaned;
  }
  
  // 5. Structure cost field
  if (typeof source.cost === 'string') {
    if (source.cost === '-' || source.cost === '') {
      updates.cost = { value: 0, currency: 'throne' };
    } else {
      // Parse "1000 T" → {value: 1000, currency: 'throne'}
      const match = source.cost.match(/(\d+)\s*([A-Z])/i);
      if (match) {
        updates.cost = {
          value: parseInt(match[1]),
          currency: match[2].toLowerCase() === 't' ? 'throne' : 'other'
        };
      }
    }
  }
  
  // Apply updates
  foundry.utils.mergeObject(source, updates);
  
  // Handle Sets (must be after merge)
  if (Array.isArray(source.coverage)) {
    source.coverage = new Set(source.coverage);
  }
  if (Array.isArray(source.properties)) {
    source.properties = new Set(source.properties);
  }
  
  return source;
}
```

#### C. Enhanced Helper Methods

```javascript
/**
 * Get human-readable coverage description.
 * @returns {string}
 */
get coverageLabel() {
  const coverage = this._getEffectiveCoverage();
  if (coverage.has("all")) return game.i18n.localize("RT.Coverage.All");
  
  const locations = ["head", "body", "leftArm", "rightArm", "leftLeg", "rightLeg"];
  const covered = locations.filter(loc => coverage.has(loc));
  
  if (covered.length === 0) return game.i18n.localize("RT.Coverage.None");
  if (covered.length === 6) return game.i18n.localize("RT.Coverage.All");
  
  // Check for symmetrical coverage
  const hasArms = covered.includes("leftArm") && covered.includes("rightArm");
  const hasLegs = covered.includes("leftLeg") && covered.includes("rightLeg");
  
  const parts = [];
  if (covered.includes("head")) parts.push("Head");
  if (covered.includes("body")) parts.push("Body");
  if (hasArms) parts.push("Arms");
  else {
    if (covered.includes("leftArm")) parts.push("L.Arm");
    if (covered.includes("rightArm")) parts.push("R.Arm");
  }
  if (hasLegs) parts.push("Legs");
  else {
    if (covered.includes("leftLeg")) parts.push("L.Leg");
    if (covered.includes("rightLeg")) parts.push("R.Leg");
  }
  
  return parts.join(", ");
}

/**
 * Get coverage as icon string for compact display.
 * @returns {string}
 */
get coverageIcons() {
  const coverage = this._getEffectiveCoverage();
  if (coverage.has("all")) return "●●●●●●";
  
  const icons = [];
  if (coverage.has("head")) icons.push("●"); else icons.push("○");
  if (coverage.has("body")) icons.push("●"); else icons.push("○");
  if (coverage.has("leftArm") || coverage.has("rightArm")) icons.push("●"); else icons.push("○");
  if (coverage.has("leftLeg") || coverage.has("rightLeg")) icons.push("●"); else icons.push("○");
  
  return icons.join("");
}

/**
 * Get available special properties.
 * @returns {string[]}
 */
static get AVAILABLE_PROPERTIES() {
  return [
    "sealed",              // Vacuum-sealed
    "auto-stabilized",     // Auto-stabilization system
    "hexagrammic",         // Hexagrammic wards
    "blessed",             // Blessed by Ecclesiarchy
    "camouflage",          // Camo coating
    "lightweight",         // Reduced weight
    "reinforced",          // Extra protection
    "agility-bonus",       // Improved agility
    "strength-bonus"       // Strength assistance
  ];
}

/**
 * Get properties as localized labels array.
 * @returns {string[]}
 */
get propertyLabels() {
  return Array.from(this.properties).map(prop => 
    game.i18n.localize(`RT.ArmourProperty.${prop.capitalize()}`)
  );
}
```

#### D. Validation

```javascript
/**
 * Validate armour data.
 * @param {object} changes  Proposed changes
 * @throws {Error}          If validation fails
 */
static validateJoint(data) {
  super.validateJoint(data);
  
  // Validate AP values (0-20 reasonable range)
  const locations = ["head", "body", "leftArm", "rightArm", "leftLeg", "rightLeg"];
  for (const loc of locations) {
    const ap = data.armourPoints?.[loc];
    if (ap !== undefined && (ap < 0 || ap > 20)) {
      throw new Error(`Armour point value for ${loc} must be between 0 and 20`);
    }
  }
  
  // Validate coverage is not empty
  if (data.coverage?.size === 0) {
    throw new Error("Armour must cover at least one location");
  }
  
  // Validate maxAgility
  if (data.maxAgility !== null && (data.maxAgility < 0 || data.maxAgility > 100)) {
    throw new Error("Max Agility must be between 0 and 100");
  }
}
```

### Phase 2: Pack Data Migration Script

#### Create Migration Script

**File**: `scripts/migrate-armour-packs.mjs`

```javascript
/**
 * Migrate all armour pack entries to V13 schema.
 * Run with: node scripts/migrate-armour-packs.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PACK_DIR = path.join(__dirname, '..', 'src', 'packs', 'rt-items-armour', '_source');

/**
 * Parse legacy AP field to armourPoints object.
 */
function parseLegacyAP(ap) {
  if (ap === undefined || ap === null) return null;
  
  // Handle "Special" or narrative AP
  if (ap === "Special" || typeof ap === 'string' && ap.includes('Psy')) {
    return { special: true, head: 0, body: 0, leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 };
  }
  
  // Handle percentage (force fields)
  if (typeof ap === 'string' && ap.includes('%')) {
    const percent = parseFloat(ap) / 100;
    return { percentage: percent, head: 0, body: 0, leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 };
  }
  
  // Handle single number
  if (typeof ap === 'number' || (typeof ap === 'string' && /^\d+$/.test(ap))) {
    const value = parseInt(ap);
    return { head: value, body: value, leftArm: value, rightArm: value, leftLeg: value, rightLeg: value };
  }
  
  // Handle pattern "H/B/A/L"
  if (typeof ap === 'string' && ap.includes('/')) {
    const parts = ap.split('/').map(p => parseInt(p.trim()));
    if (parts.length === 4) {
      return {
        head: parts[0],
        body: parts[1],
        leftArm: parts[2],
        rightArm: parts[2],
        leftLeg: parts[3],
        rightLeg: parts[3]
      };
    }
  }
  
  return null;
}

/**
 * Parse legacy locations field to coverage array.
 */
function parseLegacyLocations(locations) {
  if (!locations || typeof locations !== 'string') return ["all"];
  
  const normalized = locations.toLowerCase().replace(/[()]/g, '');
  
  // Handle "All" case
  if (normalized.includes('all')) return ["all"];
  
  const coverage = new Set();
  
  // Parse comma-separated tokens
  const tokens = normalized.split(',').map(t => t.trim());
  for (const token of tokens) {
    if (token.includes('head')) coverage.add('head');
    if (token.includes('body') || token.includes('chest') || token.includes('torso')) coverage.add('body');
    if (token.includes('arm')) {
      coverage.add('leftArm');
      coverage.add('rightArm');
    }
    if (token.includes('leg')) {
      coverage.add('leftLeg');
      coverage.add('rightLeg');
    }
  }
  
  return coverage.size ? Array.from(coverage) : ["all"];
}

/**
 * Clean weight field (remove "kg" suffix).
 */
function cleanWeight(weight) {
  if (typeof weight === 'number') return weight;
  if (typeof weight === 'string') {
    const cleaned = parseFloat(weight.replace(/[^\d.]/g, ''));
    return isNaN(cleaned) ? 0 : cleaned;
  }
  return 0;
}

/**
 * Migrate single armour entry.
 */
function migrateArmourEntry(entry) {
  const system = entry.system;
  const updates = {};
  
  // 1. Migrate AP
  if (system.ap !== undefined) {
    const parsed = parseLegacyAP(system.ap);
    if (parsed) {
      if (parsed.special) {
        updates.notes = (system.notes || '') + ' [AP: Special]';
        updates.armourPoints = { head: 0, body: 0, leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 };
      } else if (parsed.percentage !== undefined) {
        updates.notes = (system.notes || '') + ` [AP: ${Math.round(parsed.percentage * 100)}%]`;
        updates.armourPoints = { head: 0, body: 0, leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 };
      } else {
        updates.armourPoints = parsed;
      }
    }
    delete system.ap;
  }
  
  // 2. Migrate locations
  if (system.locations) {
    updates.coverage = parseLegacyLocations(system.locations);
    delete system.locations;
  }
  
  // 3. Migrate maxAg
  if (system.maxAg !== undefined) {
    if (system.maxAg === '-' || system.maxAg === '' || system.maxAg === null) {
      updates.maxAgility = null;
    } else {
      const parsed = parseInt(system.maxAg);
      updates.maxAgility = isNaN(parsed) ? null : parsed;
    }
    delete system.maxAg;
  }
  
  // 4. Clean weight
  if (system.weight !== undefined) {
    updates.weight = cleanWeight(system.weight);
  }
  
  // 5. Clean cost
  if (typeof system.cost === 'string') {
    delete system.cost; // Remove legacy cost, use new schema default
  }
  
  // 6. Ensure properties exists
  if (!system.properties) {
    updates.properties = [];
  }
  
  // Apply updates
  Object.assign(system, updates);
  
  return entry;
}

/**
 * Main migration function.
 */
function migrateAllArmour() {
  const files = fs.readdirSync(PACK_DIR).filter(f => f.endsWith('.json'));
  let migrated = 0;
  let errors = 0;
  
  console.log(`Found ${files.length} armour entries to migrate...`);
  
  for (const file of files) {
    const filePath = path.join(PACK_DIR, file);
    
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      // Skip non-armour
      if (data.type !== 'armour') continue;
      
      const updated = migrateArmourEntry(data);
      
      // Write back
      fs.writeFileSync(filePath, JSON.stringify(updated, null, 2) + '\n', 'utf8');
      
      migrated++;
      console.log(`✓ ${file}`);
    } catch (err) {
      errors++;
      console.error(`✗ ${file}: ${err.message}`);
    }
  }
  
  console.log(`\nMigration complete: ${migrated} migrated, ${errors} errors`);
}

// Run migration
migrateAllArmour();
```

**Run Command**:
```bash
node scripts/migrate-armour-packs.mjs
```

### Phase 3: Sheet Enhancement

#### A. Armour Sheet Updates

**File**: `src/module/applications/item/armour-sheet.mjs`

**Add context preparation**:
```javascript
async _prepareContext(options) {
  const context = await super._prepareContext(options);
  
  // Add armour-specific context
  context.armourTypes = Object.keys(CONFIG.ROGUE_TRADER.armourTypes);
  context.bodyLocations = CONFIG.ROGUE_TRADER.bodyLocations;
  context.availableProperties = CONFIG.ROGUE_TRADER.armourProperties;
  context.apSummary = this.item.system.apSummary;
  context.coverageLabel = this.item.system.coverageLabel;
  context.coverageIcons = this.item.system.coverageIcons;
  context.propertyLabels = this.item.system.propertyLabels;
  
  return context;
}
```

**Add actions**:
```javascript
static DEFAULT_OPTIONS = {
  // ...existing options...
  actions: {
    toggleCoverage: ArmourSheet.#toggleCoverage,
    addProperty: ArmourSheet.#addProperty,
    removeProperty: ArmourSheet.#removeProperty
  }
};

static async #toggleCoverage(event, target) {
  const location = target.dataset.location;
  const coverage = new Set(this.item.system.coverage);
  
  if (coverage.has(location)) {
    coverage.delete(location);
  } else {
    coverage.add(location);
  }
  
  await this.item.update({ "system.coverage": Array.from(coverage) });
}

static async #addProperty(event, target) {
  const property = target.value;
  if (!property) return;
  
  const properties = new Set(this.item.system.properties);
  properties.add(property);
  
  await this.item.update({ "system.properties": Array.from(properties) });
  target.value = "";
}

static async #removeProperty(event, target) {
  const property = target.dataset.property;
  const properties = new Set(this.item.system.properties);
  properties.delete(property);
  
  await this.item.update({ "system.properties": Array.from(properties) });
}
```

#### B. Template Updates

**File**: `src/templates/item/item-armour-sheet-modern.hbs`

**Add coverage visual** (after quick stats bar):
```handlebars
<!-- Coverage Indicator -->
<div class="rt-coverage-display">
    <div class="rt-coverage-header">
        <h4>Coverage</h4>
        <span class="rt-coverage-summary">{{item.system.coverageLabel}}</span>
    </div>
    <div class="rt-coverage-grid">
        {{#each bodyLocations as |location key|}}
        <button type="button" 
                class="rt-coverage-badge {{#if (includes item.system.coverage key)}}rt-coverage-badge--active{{/if}}"
                data-action="toggleCoverage"
                data-location="{{key}}">
            <i class="fas {{location.icon}}"></i>
            <span>{{location.label}}</span>
        </button>
        {{/each}}
    </div>
</div>
```

**Add properties editor** (in protection tab):
```handlebars
<!-- Properties -->
<div class="rt-panel">
    <div class="rt-panel__header">
        <h3><i class="fas fa-star"></i> Special Properties</h3>
    </div>
    <div class="rt-panel__content">
        <div class="rt-property-list">
            {{#each propertyLabels as |label|}}
            <span class="rt-tag rt-tag--property">
                {{label}}
                <button type="button" class="rt-tag__remove" data-action="removeProperty" data-property="{{@key}}">
                    <i class="fas fa-times"></i>
                </button>
            </span>
            {{/each}}
        </div>
        
        <div class="rt-field-grid rt-field-grid--2" style="margin-top: 1rem;">
            <select class="rt-field__select" name="new-property">
                <option value="">— Add Property —</option>
                {{#each availableProperties as |prop|}}
                <option value="{{prop}}">{{localize (concat "RT.ArmourProperty." prop)}}</option>
                {{/each}}
            </select>
            <button type="button" class="rt-btn rt-btn--primary" data-action="addProperty">
                <i class="fas fa-plus"></i> Add
            </button>
        </div>
    </div>
</div>
```

**Update header** (show type badge and AP summary):
```handlebars
<div class="rt-item-meta">
    <span class="rt-meta-badge rt-meta-badge--type rt-meta-badge--{{item.system.type}}">
        <i class="fas fa-shield"></i> {{item.system.typeLabel}}
    </span>
    <span class="rt-meta-badge rt-meta-badge--ap">
        <i class="fas fa-shield-halved"></i> {{apSummary}}
    </span>
    {{#if item.system.maxAgility}}
    <span class="rt-meta-badge rt-meta-badge--agility">
        <i class="fas fa-person-running"></i> Max Ag: {{item.system.maxAgility}}
    </span>
    {{/if}}
    {{#if item.system.craftsmanship}}
    <span class="rt-meta-badge rt-meta-badge--craft">
        <i class="fas fa-hammer"></i> {{item.system.craftsmanship}}
    </span>
    {{/if}}
</div>
```

### Phase 4: Compendium Browser Enhancement

#### A. Type-Specific Item Cards

**File**: `src/templates/applications/compendium-browser.hbs`

**Update item display** (lines 65-79):
```handlebars
<div class="compendium-item compendium-item--{{type}}" data-uuid="{{uuid}}" draggable="true">
    <img src="{{img}}" alt="{{name}}" class="item-image" />
    <div class="item-details">
        <h4 class="item-name">{{name}}</h4>
        
        {{!-- Type-specific metadata --}}
        {{#if (eq type "armour")}}
        <div class="item-stats item-stats--armour">
            <span class="stat-badge stat-badge--type">{{system.typeLabel}}</span>
            <span class="stat-badge stat-badge--ap">AP: {{system.apSummary}}</span>
            <span class="stat-badge stat-badge--coverage" title="{{system.coverageLabel}}">
                {{system.coverageIcons}}
            </span>
        </div>
        {{/if}}
        
        <div class="item-meta">
            <span class="item-type">{{type}}</span>
            {{#if sourceLabel}}
            <span class="item-source">{{sourceLabel}}</span>
            {{/if}}
        </div>
    </div>
</div>
```

#### B. Enhanced Filtering

**File**: `src/module/applications/compendium-browser.mjs`

**Add armour-specific filters**:
```javascript
async _prepareContext(options) {
  const context = await super._prepareContext(options);
  
  // Add armour-specific filters
  if (this._filters.type === 'armour') {
    context.armourTypes = Object.keys(CONFIG.ROGUE_TRADER.armourTypes);
    context.filters.armourType = this._filters.armourType || 'all';
    context.filters.minAP = this._filters.minAP || 0;
    context.filters.coverage = this._filters.coverage || 'all';
  }
  
  return context;
}

_passesFilters(entry, pack) {
  // ...existing filters...
  
  // Armour-specific filters
  if (entry.type === 'armour') {
    if (this._filters.armourType !== 'all') {
      if (entry.system?.type !== this._filters.armourType) return false;
    }
    
    if (this._filters.minAP > 0) {
      // Check if any location meets minimum AP
      const points = entry.system?.armourPoints || {};
      const maxAP = Math.max(...Object.values(points));
      if (maxAP < this._filters.minAP) return false;
    }
    
    if (this._filters.coverage !== 'all') {
      const coverage = entry.system?.coverage || [];
      if (this._filters.coverage === 'full' && !coverage.includes('all')) return false;
      if (this._filters.coverage === 'partial' && coverage.includes('all')) return false;
    }
  }
  
  return true;
}
```

**Add filter UI** (in template sidebar):
```handlebars
{{#if (eq filters.type "armour")}}
<div class="filter-group">
    <label>Armour Type</label>
    <select class="filter-armour-type">
        <option value="all">All Types</option>
        {{#each armourTypes as |type|}}
        <option value="{{type}}" {{#if (eq ../filters.armourType type)}}selected{{/if}}>
            {{localize (concat "RT.ArmourType." type)}}
        </option>
        {{/each}}
    </select>
</div>

<div class="filter-group">
    <label>Minimum AP</label>
    <input type="number" class="filter-min-ap" min="0" max="20" value="{{filters.minAP}}">
</div>

<div class="filter-group">
    <label>Coverage</label>
    <select class="filter-coverage">
        <option value="all">All Coverage</option>
        <option value="full" {{#if (eq filters.coverage "full")}}selected{{/if}}>Full Body</option>
        <option value="partial" {{#if (eq filters.coverage "partial")}}selected{{/if}}>Partial</option>
    </select>
</div>
{{/if}}
```

### Phase 5: Localization

**File**: `src/lang/en.json`

**Add missing keys**:
```json
{
  "RT": {
    "ArmourType": {
      "Flak": "Flak Armour",
      "Mesh": "Mesh Armour",
      "Carapace": "Carapace Armour",
      "Power": "Power Armour",
      "LightPower": "Light Power Armour",
      "StormTrooper": "Storm Trooper Carapace",
      "FeudalWorld": "Feudal World Armour",
      "Primitive": "Primitive Armour",
      "Xenos": "Xenos Armour",
      "Void": "Void Suit",
      "Enforcer": "Enforcer Light Carapace",
      "HostileEnvironment": "Hostile Environment Suit"
    },
    "ArmourProperty": {
      "Sealed": "Sealed",
      "AutoStabilized": "Auto-Stabilized",
      "Hexagrammic": "Hexagrammic Wards",
      "Blessed": "Blessed",
      "Camouflage": "Camouflage",
      "Lightweight": "Lightweight",
      "Reinforced": "Reinforced",
      "AgilityBonus": "Agility Bonus",
      "StrengthBonus": "Strength Bonus"
    },
    "Coverage": {
      "All": "All Locations",
      "None": "No Coverage",
      "Head": "Head",
      "Body": "Body",
      "Arms": "Arms",
      "Legs": "Legs"
    },
    "BodyLocation": {
      "Head": "Head",
      "RightArm": "Right Arm",
      "LeftArm": "Left Arm",
      "Body": "Body",
      "RightLeg": "Right Leg",
      "LeftLeg": "Left Leg"
    }
  }
}
```

### Phase 6: CONFIG Updates

**File**: `src/module/config.mjs`

**Add missing configurations**:
```javascript
// After existing armourTypes (lines 132-141)

/**
 * Armour special properties.
 * @type {Object<string, {label: string, description: string}>}
 */
ROGUE_TRADER.armourProperties = {
  sealed: { 
    label: "RT.ArmourProperty.Sealed",
    description: "RT.ArmourProperty.SealedDesc"
  },
  "auto-stabilized": { 
    label: "RT.ArmourProperty.AutoStabilized",
    description: "RT.ArmourProperty.AutoStabilizedDesc"
  },
  hexagrammic: { 
    label: "RT.ArmourProperty.Hexagrammic",
    description: "RT.ArmourProperty.HexagrammicDesc"
  },
  blessed: { 
    label: "RT.ArmourProperty.Blessed",
    description: "RT.ArmourProperty.BlessedDesc"
  },
  camouflage: { 
    label: "RT.ArmourProperty.Camouflage",
    description: "RT.ArmourProperty.CamouflageDesc"
  },
  lightweight: { 
    label: "RT.ArmourProperty.Lightweight",
    description: "RT.ArmourProperty.LightweightDesc"
  },
  reinforced: { 
    label: "RT.ArmourProperty.Reinforced",
    description: "RT.ArmourProperty.ReinforcedDesc"
  },
  "agility-bonus": { 
    label: "RT.ArmourProperty.AgilityBonus",
    description: "RT.ArmourProperty.AgilityBonusDesc"
  },
  "strength-bonus": { 
    label: "RT.ArmourProperty.StrengthBonus",
    description: "RT.ArmourProperty.StrengthBonusDesc"
  }
};

// Update bodyLocations with icons (lines 151-158)
ROGUE_TRADER.bodyLocations = {
  head: { label: "RT.BodyLocation.Head", roll: "1-10", icon: "fa-head-side" },
  rightArm: { label: "RT.BodyLocation.RightArm", roll: "11-20", icon: "fa-hand" },
  leftArm: { label: "RT.BodyLocation.LeftArm", roll: "21-30", icon: "fa-hand" },
  body: { label: "RT.BodyLocation.Body", roll: "31-70", icon: "fa-person" },
  rightLeg: { label: "RT.BodyLocation.RightLeg", roll: "71-85", icon: "fa-socks" },
  leftLeg: { label: "RT.BodyLocation.LeftLeg", roll: "86-100", icon: "fa-socks" }
};
```

### Phase 7: SCSS Styling

**File**: `dist/scss/item/_armour.scss` (NEW)

```scss
// Armour Sheet Styles

.rt-coverage-display {
  margin: 1rem 0;
  padding: 1rem;
  background: linear-gradient(180deg, rgba($rt-accent-gold, 0.05) 0%, transparent 100%);
  border: 1px solid $rt-border-light;
  border-radius: 8px;
}

.rt-coverage-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
  
  h4 {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .rt-coverage-summary {
    font-size: 0.85rem;
    color: $rt-text-secondary;
  }
}

.rt-coverage-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 0.5rem;
}

.rt-coverage-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem;
  background: $rt-bg-paper;
  border: 2px solid $rt-border-light;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  
  i {
    font-size: 1.25rem;
    color: $rt-text-secondary;
  }
  
  span {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    color: $rt-text-secondary;
  }
  
  &:hover {
    border-color: $rt-accent-gold;
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  }
  
  &--active {
    background: linear-gradient(135deg, rgba($rt-accent-gold, 0.2) 0%, rgba($rt-accent-gold, 0.1) 100%);
    border-color: $rt-accent-gold;
    
    i {
      color: $rt-accent-gold;
    }
    
    span {
      color: $rt-text-primary;
    }
  }
}

.rt-property-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.rt-tag--property {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.75rem;
  background: linear-gradient(135deg, rgba($rt-accent-gold, 0.15) 0%, rgba($rt-accent-gold, 0.05) 100%);
  border: 1px solid rgba($rt-accent-gold, 0.3);
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 600;
  
  .rt-tag__remove {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: $rt-text-secondary;
    transition: color 0.2s ease;
    
    &:hover {
      color: $rt-danger;
    }
  }
}

// Compendium browser armour cards
.compendium-item--armour {
  .item-stats--armour {
    display: flex;
    gap: 0.5rem;
    margin: 0.5rem 0;
    
    .stat-badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      background: rgba($rt-accent-gold, 0.1);
      border: 1px solid rgba($rt-accent-gold, 0.3);
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      
      &--type {
        background: linear-gradient(135deg, rgba($rt-accent-gold, 0.2) 0%, rgba($rt-accent-gold, 0.1) 100%);
      }
      
      &--ap {
        font-family: $rt-font-mono;
      }
      
      &--coverage {
        font-family: monospace;
        letter-spacing: 2px;
      }
    }
  }
}
```

**Import in main SCSS** (`dist/scss/rogue-trader.scss`):
```scss
// Item Sheets
@import 'item/item-sheet';
@import 'item/armour';  // NEW
```

---

## 🧪 Testing Plan

### 1. Data Model Tests

```javascript
// Test migration
const testArmour = {
  type: "armour",
  system: {
    ap: 7,
    locations: "All",
    maxAg: "50",
    weight: "35kg"
  }
};

const migrated = ArmourData.migrateData(testArmour.system);
console.assert(migrated.armourPoints.head === 7);
console.assert(migrated.coverage.has("all"));
console.assert(migrated.maxAgility === 50);
console.assert(migrated.weight === 35);
```

### 2. Sheet Tests

- Open armour sheet, verify all fields display correctly
- Toggle coverage locations, verify Set updates
- Add/remove properties, verify Set updates
- Verify AP summary displays in header
- Verify type badge displays with correct color

### 3. Compendium Browser Tests

- Open browser, filter by armour type
- Verify type-specific cards show AP summary and coverage
- Verify drag/drop still works
- Verify filtering by minimum AP works

### 4. Pack Data Validation

```bash
# After migration, validate all pack entries
node scripts/validate-armour-packs.mjs
```

Validation script checks:
- All entries have `armourPoints` object
- All entries have `coverage` array
- No entries have legacy `ap` or `locations` fields
- Weight values are numbers
- maxAgility is number or null

---

## 📊 Success Metrics

1. **Data Integrity**: 174/174 armour entries migrated with 0 errors
2. **No [object Object]**: Zero instances of stringified objects in UI
3. **Sheet Functionality**: All CRUD operations work on armour properties/coverage
4. **Compendium Display**: Type-specific metadata displays correctly for all armour
5. **Backwards Compatibility**: Legacy armour items still load and display (via migration)
6. **Performance**: No rendering slowdown with 174 entries in browser

---

## 🚀 Rollout Plan

### Week 1: Data Model & Migration
- [ ] Implement SetField serialization (Day 1)
- [ ] Implement migrateData method (Day 1-2)
- [ ] Create migration script (Day 2)
- [ ] Run migration on all 174 entries (Day 3)
- [ ] Validate migrated data (Day 3)
- [ ] Test legacy compatibility (Day 4)

### Week 2: Sheet Enhancement
- [ ] Add coverage visual indicator (Day 1)
- [ ] Add properties editor (Day 2)
- [ ] Update header with badges (Day 2)
- [ ] Add SCSS styling (Day 3)
- [ ] Test all sheet interactions (Day 4)

### Week 3: Compendium Integration
- [ ] Implement type-specific item cards (Day 1)
- [ ] Add armour-specific filters (Day 2)
- [ ] Add SCSS for compendium cards (Day 2)
- [ ] Test filtering and display (Day 3)
- [ ] Performance testing with all items (Day 4)

### Week 4: Localization & Polish
- [ ] Add all missing i18n keys (Day 1)
- [ ] Add property descriptions (Day 1)
- [ ] Add CONFIG entries (Day 2)
- [ ] Final testing pass (Day 3-4)
- [ ] Documentation update (Day 4)

---

## 📝 Future Enhancements

1. **Active Effects Integration**: Armour properties trigger Active Effects
2. **Modification System**: Full armour mod crafting/installation UI
3. **Damage Tracking**: Track armour degradation by location
4. **Custom Properties**: Allow users to define custom armour properties
5. **Visual Body Diagram**: SVG body diagram for coverage selection
6. **AP Calculation**: Auto-calculate AP from base + mods + effects
7. **Compendium Sorting**: Sort by AP value, weight, availability
8. **Export/Import**: Export armour profiles for sharing

---

## 🔗 Related Files

**Data Models**:
- `src/module/data/item/armour.mjs` (305 lines)
- `src/module/data/item/armour-modification.mjs` (120 lines)

**Sheets**:
- `src/module/applications/item/armour-sheet.mjs` (45 lines → ~150 lines after)
- `src/templates/item/item-armour-sheet-modern.hbs` (260 lines → ~350 lines after)

**Compendium**:
- `src/module/applications/compendium-browser.mjs` (300+ lines)
- `src/templates/applications/compendium-browser.hbs` (~90 lines)

**Packs**:
- `src/packs/rt-items-armour/_source/*.json` (174 files)

**Config**:
- `src/module/config.mjs` (lines 125-158)
- `src/lang/en.json` (add ~40 keys)

**Styles**:
- `dist/scss/item/_armour.scss` (NEW, ~150 lines)

**Scripts**:
- `scripts/migrate-armour-packs.mjs` (NEW, ~200 lines)
- `scripts/validate-armour-packs.mjs` (NEW, ~100 lines)

---

## ✅ Checklist

### Data Model
- [ ] Implement SetField serialization
- [ ] Implement migrateData method
- [ ] Add validation method
- [ ] Add helper methods (coverageLabel, coverageIcons, propertyLabels)
- [ ] Update chatProperties
- [ ] Update headerLabels

### Migration Script
- [ ] Create migrate-armour-packs.mjs
- [ ] Implement parseLegacyAP
- [ ] Implement parseLegacyLocations
- [ ] Implement cleanWeight
- [ ] Run migration on all 174 entries
- [ ] Create validate-armour-packs.mjs
- [ ] Run validation

### Sheet
- [ ] Add context preparation
- [ ] Add toggleCoverage action
- [ ] Add addProperty action
- [ ] Add removeProperty action
- [ ] Update template with coverage visual
- [ ] Update template with properties editor
- [ ] Update header with badges
- [ ] Test all interactions

### Compendium Browser
- [ ] Add type-specific item card template
- [ ] Add armour-specific filters
- [ ] Update _passesFilters method
- [ ] Add filter UI in template
- [ ] Test filtering
- [ ] Test display

### Configuration
- [ ] Add armourProperties to CONFIG
- [ ] Update bodyLocations with icons
- [ ] Add i18n keys for armour types
- [ ] Add i18n keys for properties
- [ ] Add i18n keys for coverage
- [ ] Add i18n descriptions

### Styling
- [ ] Create _armour.scss
- [ ] Style coverage display
- [ ] Style coverage badges
- [ ] Style property tags
- [ ] Style compendium armour cards
- [ ] Import in main SCSS

### Testing
- [ ] Test data migration
- [ ] Test SetField serialization
- [ ] Test sheet coverage toggle
- [ ] Test sheet properties editor
- [ ] Test compendium display
- [ ] Test compendium filtering
- [ ] Test legacy compatibility
- [ ] Performance testing

### Documentation
- [ ] Update AGENTS.md
- [ ] Update ARMOUR_MIGRATION_COMPLETE.md
- [ ] Create user guide for armour properties
- [ ] Document migration process

---

**END OF PLAN**
