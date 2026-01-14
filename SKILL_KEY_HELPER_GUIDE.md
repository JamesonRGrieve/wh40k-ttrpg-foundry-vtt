# Skill Key Helper - Quick Reference

**Location**: `src/module/helpers/skill-key-helper.mjs`

Comprehensive utility for skill name/key conversion, validation, and metadata retrieval.

---

## Quick Examples

```javascript
import { SkillKeyHelper } from "../helpers/skill-key-helper.mjs";

// Convert name to key
SkillKeyHelper.nameToKey("Common Lore")  // → "commonLore"
SkillKeyHelper.nameToKey("Chem-Use")     // → "chemUse"

// Convert key to name
SkillKeyHelper.keyToName("commonLore")   // → "Common Lore"

// Check if specialist
SkillKeyHelper.isSpecialist("commonLore")     // → true
SkillKeyHelper.isSpecialist("Common Lore")    // → true (accepts both)
SkillKeyHelper.isSpecialist("awareness")      // → false

// Get characteristic
SkillKeyHelper.getCharacteristic("dodge")     // → "Ag"
SkillKeyHelper.getCharacteristic("Medicae")   // → "Int"

// Get complete metadata
SkillKeyHelper.getSkillMetadata("commonLore")
// Returns:
// {
//   key: "commonLore",
//   name: "Common Lore",
//   characteristic: "Int",
//   isAdvanced: true,
//   isSpecialist: true
// }

// Validate against actor
SkillKeyHelper.validateKey("awareness", actor)  // → true/false
```

---

## All Methods

### Primary Conversion

| Method | Input | Output | Example |
|--------|-------|--------|---------|
| `nameToKey(name)` | Display name | Internal key | `"Common Lore"` → `"commonLore"` |
| `keyToName(key)` | Internal key | Display name | `"commonLore"` → `"Common Lore"` |

### Validation & Metadata

| Method | Input | Output | Example |
|--------|-------|--------|---------|
| `validateKey(key, actor)` | Key + actor | Boolean | Checks if skill exists on actor |
| `isSpecialist(keyOrName)` | Key or name | Boolean | `"commonLore"` → `true` |
| `getCharacteristic(keyOrName)` | Key or name | Char abbr | `"dodge"` → `"Ag"` |
| `isAdvanced(keyOrName)` | Key or name | Boolean | `"acrobatics"` → `true` |
| `getSkillMetadata(keyOrName)` | Key or name | Object | Complete metadata |

### List Utilities

| Method | Output | Example |
|--------|--------|---------|
| `getAllSkillNames()` | String[] | All 54 display names |
| `getAllSkillKeys()` | String[] | All 54 internal keys |
| `getAllSpecialistKeys()` | String[] | 12 specialist keys |
| `getAllSpecialistNames()` | String[] | 12 specialist names |
| `findSkillsByCharacteristic(char)` | Object[] | All skills for characteristic |

---

## All 54 Skills

### Standard Skills - Basic (22)
```
Awareness, Barter, Carouse, Charm, Climb, Command, Concealment, 
Contortionist, Deceive, Disguise, Dodge, Evaluate, Gamble, Inquiry, 
Intimidate, Literacy, Logic, Scrutiny, Search, Silent Move, Survival, Swim
```

### Standard Skills - Advanced (14)
```
Acrobatics, Blather, Chem-Use, Commerce, Demolition, Interrogation, 
Invocation, Medicae, Psyniscience, Security, Shadowing, Sleight of Hand, 
Tracking, Wrangling
```

### Specialist Skills - Advanced (12)
```
Ciphers, Common Lore, Drive, Forbidden Lore, Navigation, Performer, 
Pilot, Scholastic Lore, Secret Tongue, Speak Language, Tech-Use, Trade
```

### Compatibility Skills - Basic (3)
```
Athletics, Parry, Stealth
```

---

## Key to Characteristic Mapping

```javascript
// Agility-based (11 skills)
acrobatics, concealment, contortionist, dodge, security, shadowing, 
silentMove, sleightOfHand, drive, pilot, stealth

// Strength-based (4 skills)
climb, intimidate, swim, athletics

// Toughness-based (1 skill)
carouse

// Intelligence-based (19 skills)
chemUse, demolition, evaluate, gamble, literacy, logic, medicae, 
survival, tracking, wrangling, ciphers, commonLore, forbiddenLore, 
navigation, scholasticLore, secretTongue, speakLanguage, techUse, trade

// Perception-based (4 skills)
awareness, psyniscience, scrutiny, search

// Willpower-based (2 skills)
interrogation, invocation

// Fellowship-based (9 skills)
barter, blather, charm, command, commerce, deceive, disguise, 
inquiry, performer

// Weapon Skill-based (1 skill)
parry
```

---

## Usage in GrantsProcessor

The SkillKeyHelper is integrated into `GrantsProcessor._processSkillGrant()`:

```javascript
static async _processSkillGrant(skillGrant, context) {
  const normalized = typeof skillGrant === 'string' 
    ? { name: skillGrant, level: 'trained' }
    : skillGrant;

  // Use SkillKeyHelper for validation and metadata
  const skillKey = SkillKeyHelper.nameToKey(normalized.name);
  const metadata = SkillKeyHelper.getSkillMetadata(skillKey);
  
  if (!metadata) {
    console.warn(`Unknown skill: ${normalized.name}`);
    return;
  }
  
  // Validate specialist skills have specialization
  if (metadata.isSpecialist && !normalized.specialization) {
    console.warn(`Specialist skill requires specialization: ${metadata.name}`);
    return;
  }
  
  // Create skill item with proper metadata
  const skillData = {
    type: "skill",
    name: metadata.name,  // Canonical name
    system: {
      characteristic: metadata.characteristic,  // ✅ Always set!
      skillType: metadata.isSpecialist ? "specialist" : 
                 (metadata.isAdvanced ? "advanced" : "basic"),
      isBasic: !metadata.isAdvanced,
      specialization: normalized.specialization || "",
      trained: ...,
      plus10: ...,
      plus20: ...
    }
  };
  
  // ...
}
```

---

## Benefits

### 1. Correctness
- ✅ Canonical skill name mapping (no typos)
- ✅ Correct characteristic assignment
- ✅ Proper advanced/basic classification

### 2. Validation
- ✅ Detects unknown skill names
- ✅ Enforces specialist skill requirements
- ✅ Validates against actor schema

### 3. Consistency
- ✅ Single source of truth
- ✅ All skill metadata in one place
- ✅ Matches creature.mjs schema exactly

### 4. Maintainability
- ✅ Easy to add new skills
- ✅ Easy to query skill metadata
- ✅ Clear API for all skill operations

---

## Common Patterns

### Creating a Skill Grant

```javascript
// Standard skill
const grant = { name: "Awareness", level: "trained" };

// Specialist skill
const grant = { 
  name: "Common Lore", 
  specialization: "Imperium",
  level: "plus10" 
};

// Process grant
await GrantsProcessor._processSkillGrant(grant, context);
```

### Validating User Input

```javascript
// User enters skill name
const userInput = "common lore";

// Find closest match (case-insensitive)
const skillKey = SkillKeyHelper.nameToKey(userInput);
const metadata = SkillKeyHelper.getSkillMetadata(skillKey);

if (!metadata) {
  // Show error: "Unknown skill"
  return;
}

// Use canonical name
const canonicalName = metadata.name;  // "Common Lore"
```

### Building Skill Autocomplete

```javascript
// Get all skill names for autocomplete
const allSkills = SkillKeyHelper.getAllSkillNames();

// Get only specialist skills
const specialistSkills = SkillKeyHelper.getAllSpecialistNames();

// Get skills for a specific characteristic
const agilitySkills = SkillKeyHelper.findSkillsByCharacteristic("Ag");
// Returns: [
//   {key: "acrobatics", name: "Acrobatics"},
//   {key: "dodge", name: "Dodge"},
//   // ... 9 more
// ]
```

### Filtering Skills by Type

```javascript
const allKeys = SkillKeyHelper.getAllSkillKeys();

// Get only basic skills
const basicSkills = allKeys.filter(key => !SkillKeyHelper.isAdvanced(key));

// Get only specialist skills
const specialistSkills = allKeys.filter(key => SkillKeyHelper.isSpecialist(key));

// Get only standard (non-specialist) advanced skills
const standardAdvanced = allKeys.filter(key => 
  SkillKeyHelper.isAdvanced(key) && !SkillKeyHelper.isSpecialist(key)
);
```

---

## Data Structures

### SKILL_NAME_TO_KEY
```javascript
{
  "Awareness": "awareness",
  "Common Lore": "commonLore",
  "Chem-Use": "chemUse",
  // ... 54 total mappings
}
```

### SKILL_KEY_TO_NAME
```javascript
{
  "awareness": "Awareness",
  "commonLore": "Common Lore",
  "chemUse": "Chem-Use",
  // ... 54 total mappings (reverse of above)
}
```

### SPECIALIST_KEYS (Set)
```javascript
Set([
  "ciphers", "commonLore", "drive", "forbiddenLore",
  "navigation", "performer", "pilot", "scholasticLore",
  "secretTongue", "speakLanguage", "techUse", "trade"
])
```

### SKILL_CHARACTERISTICS
```javascript
{
  "awareness": "Per",
  "commonLore": "Int",
  "dodge": "Ag",
  // ... 54 total mappings
}
```

### SKILL_TYPES
```javascript
{
  "awareness": false,      // Basic
  "acrobatics": true,      // Advanced
  "commonLore": true,      // Advanced (all specialist skills are advanced)
  // ... 54 total mappings
}
```

---

## Testing

### Unit Test Examples

```javascript
// Test name to key conversion
assert.equal(SkillKeyHelper.nameToKey("Common Lore"), "commonLore");
assert.equal(SkillKeyHelper.nameToKey("Chem-Use"), "chemUse");

// Test key to name conversion
assert.equal(SkillKeyHelper.keyToName("commonLore"), "Common Lore");

// Test specialist detection
assert.equal(SkillKeyHelper.isSpecialist("commonLore"), true);
assert.equal(SkillKeyHelper.isSpecialist("awareness"), false);

// Test characteristic lookup
assert.equal(SkillKeyHelper.getCharacteristic("dodge"), "Ag");
assert.equal(SkillKeyHelper.getCharacteristic("commonLore"), "Int");

// Test metadata
const meta = SkillKeyHelper.getSkillMetadata("commonLore");
assert.equal(meta.key, "commonLore");
assert.equal(meta.name, "Common Lore");
assert.equal(meta.characteristic, "Int");
assert.equal(meta.isAdvanced, true);
assert.equal(meta.isSpecialist, true);
```

---

## Related Files

- `src/module/data/actor/templates/creature.mjs` - Skill schema definition
- `src/module/utils/grants-processor.mjs` - Uses SkillKeyHelper
- `resources/SKILL_TABLE.md` - Canonical skill reference document
- `SPECIALIST_SKILLS_FIX_COMPLETE.md` - Complete fix documentation

---

## Future Enhancements

### Potential Uses
1. **Skill Compendium Validation**: Verify all compendium skills have correct metadata
2. **Sheet Autocomplete**: Dynamic skill name autocomplete in character sheets
3. **Migration Tool**: Admin tool to fix skills missing characteristics
4. **Roll Dialog**: Pre-populate available skills for roll dialogs
5. **Characteristic Display**: Group skills by characteristic in UI

### Not Implemented
- ❌ Localization support (skill names are canonical English)
- ❌ Custom skill support (only supports official 54 skills)
- ❌ Dynamic skill registration (skills are hardcoded)
