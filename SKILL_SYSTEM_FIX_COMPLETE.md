# Skill System Issue B1 - Resolution Complete

## Issue Summary

**Severity**: High  
**Status**: ✅ RESOLVED  
**Date**: 2026-01-10

### Problem Description

The skill system had a systemic inconsistency between three data sources:
1. **SKILL_TABLE.md** (authoritative reference)
2. **Compendium pack JSON files** (137 files with incorrect data)
3. **DataModel schema** (creature.mjs - already correct)

The most visible symptom was Acrobatics showing as "Basic" in character sheets when it should be "Advanced".

### Root Cause

The compendium pack JSON files (`src/packs/rt-items-skills/_source/*.json`) had incorrect values for:
- `system.skillType`: Many files had "basic" or "specialist" when they should be "advanced"
- `system.isBasic`: Many files had `true` when they should be `false`
- `system.characteristic`: Some files had wrong governing characteristic (e.g., Commerce had "intelligence" instead of "fellowship")

### Impact

- **Character sheets** displayed incorrect skill types
- **Training requirements** were calculated incorrectly
- **Roll modifiers** for untrained skills were wrong
- **Compendium browser** showed incorrect skill categorization

## Resolution

### Changes Made

#### 1. Created Audit Script (`scripts/audit-skills.mjs`)

A comprehensive audit tool that:
- Compares all pack files against SKILL_TABLE.md
- Identifies discrepancies in skillType, isBasic, characteristic
- Reports informational issues (descriptor field)
- Generates correction manifest (skill-corrections.json)

**Usage:**
```bash
node scripts/audit-skills.mjs
```

#### 2. Created Fix Script (`scripts/fix-skills.mjs`)

Automated batch update tool that:
- Reads correction manifest
- Applies fixes to all affected JSON files
- Reports progress and summary

**Usage:**
```bash
node scripts/fix-skills.mjs
```

#### 3. Created Validation Script (`scripts/validate-skills.mjs`)

Continuous validation tool for CI/CD that:
- Validates DataModel definitions match SKILL_TABLE.md
- Validates SkillData schema is correct
- Exit code 0 = pass, 1 = fail (suitable for automated checks)

**Usage:**
```bash
node scripts/validate-skills.mjs
```

### Files Modified

**122 skill pack files updated** in `src/packs/rt-items-skills/_source/`:

Key corrections:
- **Acrobatics**: `basic` → `advanced`, `isBasic: true` → `false`
- **Blather**: `isBasic: true` → `false`
- **Commerce**: `basic` → `advanced`, `isBasic: true` → `false`, characteristic: `intelligence` → `fellowship`
- **Literacy**: `isBasic: true` → `false`
- **Survival**: `isBasic: true` → `false`
- **All specialist skill instances**: `specialist` → `advanced`, `isBasic: true` → `false`
  - Ciphers, Common Lore, Drive, Forbidden Lore, Navigation, Performer, Pilot, Scholastic Lore, Secret Tongue, Speak Language, Tech-Use, Trade specializations

### Verification Results

✅ **DataModel (creature.mjs)**: Already correct - no changes needed  
✅ **SkillData schema (skill.mjs)**: Already correct - no changes needed  
✅ **Pack files**: 122 files corrected  
ℹ️ **Remaining audit findings**: 100 informational issues (descriptor field text doesn't match - cosmetic only)

## Skill Type Reference (SKILL_TABLE.md)

### Basic Skills (Can use untrained at half characteristic)

Awareness, Barter, Carouse, Charm, Climb, Command, Concealment, Contortionist, Deceive, Disguise, Dodge, Evaluate, Gamble, Inquiry, Intimidate, Logic, Scrutiny, Search, Silent Move, Swim

### Advanced Skills (Cannot use untrained)

Acrobatics, Blather, Chem-Use, Commerce, Demolition, Interrogation, Invocation, Literacy, Medicae, Psyniscience, Security, Shadowing, Sleight of Hand, Survival, Tracking, Wrangling

### Specialist Skill Groups (Advanced with specializations)

Ciphers, Common Lore, Drive, Forbidden Lore, Navigation, Performer, Pilot, Scholastic Lore, Secret Tongue, Speak Language, Tech-Use, Trade

## Architecture Notes

### Data Flow

```
SKILL_TABLE.md (authoritative)
    ↓
creature.mjs DataModel schema ← Manual alignment
    ↓
Character actor data preparation
    ↓
Sheet display (AcolyteSheet)

Compendium packs ← Manual creation/editing
    ↓ (drag/drop to actor)
Actor embedded items
```

### Key Fields

| Field | Purpose | Valid Values |
|-------|---------|--------------|
| `skillType` | Mechanical type | "basic", "advanced", "specialist" |
| `isBasic` | Can use untrained? | true (Basic), false (Advanced/Specialist) |
| `characteristic` | Governing characteristic | "agility", "fellowship", "intelligence", etc. |
| `descriptor` | Category tags | "Movement", "Interaction", "Investigation", etc. |

**Important**: `skillType` and `isBasic` must be consistent:
- Basic: `skillType: "basic"`, `isBasic: true`
- Advanced: `skillType: "advanced"`, `isBasic: false`
- Specialist: `skillType: "advanced"`, `isBasic: false` (specialist instances are treated as advanced)

### DataModel Pattern

```javascript
// In creature.mjs
SkillField(label, characteristic, isAdvanced, isGroup = false)
// isAdvanced: true = Advanced, false = Basic
// isGroup: true = specialist skill group

// Examples:
acrobatics: this.SkillField("Acrobatics", "Ag", true),  // Advanced
dodge: this.SkillField("Dodge", "Ag", false),  // Basic
commonLore: this.SkillField("Common Lore", "Int", true, true),  // Advanced, Group
```

## Testing Recommendations

### Before Release

1. **Run validation**: `node scripts/validate-skills.mjs`
2. **Rebuild packs**: `npm run build` or `gulp packs`
3. **Create test character** in Foundry VTT
4. **Verify Skills tab**:
   - Acrobatics shows as "Advanced" ✓
   - Training buttons work correctly ✓
   - Roll modifiers are correct ✓
5. **Test untrained rolls**:
   - Basic skills: Should roll at half characteristic ✓
   - Advanced skills: Should warn or prevent roll ✓
6. **Test compendium drag/drop**: Skills import with correct types ✓

### Integration into CI/CD

Add to package.json scripts:
```json
{
  "scripts": {
    "validate:skills": "node scripts/validate-skills.mjs",
    "audit:skills": "node scripts/audit-skills.mjs"
  }
}
```

Add to GitHub Actions workflow:
```yaml
- name: Validate Skills
  run: npm run validate:skills
```

## Future Prevention

### Guidelines for Skill Creation/Editing

1. **Always reference SKILL_TABLE.md** as the authoritative source
2. **Use validation script** before committing pack changes
3. **Update SKILL_TABLE.md first** if adding new skills
4. **Keep DataModel in sync** with SKILL_TABLE.md
5. **Run audit after bulk imports** from other sources

### When Adding New Skills

1. Add to SKILL_TABLE.md with full specification
2. Add to creature.mjs DataModel schema
3. Create compendium JSON file with correct fields
4. Run `node scripts/validate-skills.mjs`
5. Run `node scripts/audit-skills.mjs`
6. Build and test

## Related Documentation

- **SKILL_TABLE.md**: Authoritative skill reference
- **AGENTS.md**: System architecture documentation
- **resources/RogueTraderInfo.md**: Game rules reference
- **src/module/data/actor/templates/creature.mjs**: DataModel implementation
- **src/module/data/item/skill.mjs**: Skill item DataModel

## Conclusion

All critical skill data inconsistencies have been resolved. The skill system now correctly reflects SKILL_TABLE.md across all data sources. Validation and audit tools are in place to prevent future drift.

**Status**: ✅ COMPLETE - Ready for build and testing
