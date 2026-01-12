# Scripts Directory

Utility scripts for maintaining and validating the Rogue Trader VTT system.

## Skill System Scripts

### `audit-skills.mjs`

Audits all skill pack files against the authoritative SKILL_TABLE.md reference.

**Purpose:**
- Identifies inconsistencies in skill data
- Compares pack files to authoritative source
- Generates correction manifest

**Usage:**
```bash
node scripts/audit-skills.mjs
```

**Output:**
- Console report of all issues found
- `skill-corrections.json` - correction manifest for fix script

**What it checks:**
- `skillType` (basic/advanced/specialist)
- `isBasic` (true/false)
- `characteristic` (agility, fellowship, etc.)
- `descriptor` (informational only)

---

### `fix-skills.mjs`

Applies corrections from audit to skill pack files.

**Purpose:**
- Batch update skill JSON files
- Fix inconsistencies identified by audit

**Prerequisites:**
- Must run `audit-skills.mjs` first to generate `skill-corrections.json`

**Usage:**
```bash
node scripts/fix-skills.mjs
```

**What it does:**
1. Reads `skill-corrections.json`
2. Updates each affected JSON file
3. Reports progress and summary

**Safety:**
- Only modifies files with corrections needed
- Preserves JSON formatting
- Reports each change made

---

### `validate-skills.mjs`

Validates skill system integrity (suitable for CI/CD).

**Purpose:**
- Continuous validation of skill system
- Ensures DataModel matches SKILL_TABLE.md
- Prevents configuration drift

**Usage:**
```bash
node scripts/validate-skills.mjs
```

**Exit codes:**
- `0` - All validations passed
- `1` - Validation failed

**What it validates:**
1. **DataModel (creature.mjs)**: All skill definitions match SKILL_TABLE.md
2. **SkillData schema**: Required fields exist and are properly configured

**Use in CI/CD:**
```yaml
# .github/workflows/validate.yml
- name: Validate Skill System
  run: node scripts/validate-skills.mjs
```

---

## Typical Workflow

### After Modifying Skills

1. **Audit** to find issues:
   ```bash
   node scripts/audit-skills.mjs
   ```

2. **Review** the report and `skill-corrections.json`

3. **Fix** the issues:
   ```bash
   node scripts/fix-skills.mjs
   ```

4. **Validate** the fixes:
   ```bash
   node scripts/validate-skills.mjs
   ```

5. **Rebuild** compendium packs:
   ```bash
   npm run build
   # or
   gulp packs
   ```

6. **Test** in Foundry VTT

### Adding New Skills

1. Add to `SKILL_TABLE.md` with complete specification
2. Add to `src/module/data/actor/templates/creature.mjs`
3. Create compendium JSON in `src/packs/rt-items-skills/_source/`
4. Run validation: `node scripts/validate-skills.mjs`
5. Build and test

### Before Release

```bash
# Full validation check
node scripts/validate-skills.mjs && \
node scripts/audit-skills.mjs && \
npm run build
```

---

## Skill Data Fields Reference

### Required Fields (Pack JSON)

| Field | Type | Valid Values | Description |
|-------|------|--------------|-------------|
| `system.skillType` | String | "basic", "advanced", "specialist" | Mechanical skill type |
| `system.isBasic` | Boolean | true, false | Can use untrained? |
| `system.characteristic` | String | "agility", "fellowship", etc. | Governing characteristic |
| `system.descriptor` | String | Free text | Category/usage description |
| `system.specializations` | Array | String[] | For specialist skills only |

### Consistency Rules

- **Basic skills**: `skillType: "basic"`, `isBasic: true`
- **Advanced skills**: `skillType: "advanced"`, `isBasic: false`
- **Specialist skills**: `skillType: "advanced"`, `isBasic: false`
  - Note: Specialist skill instances use "advanced" type

### Characteristic Values

Valid characteristic identifiers (camelCase):
- `agility`
- `ballisticSkill`
- `fellowship`
- `intelligence`
- `perception`
- `strength`
- `toughness`
- `weaponSkill`
- `willpower`

---

## Troubleshooting

### "skill-corrections.json not found"

Run `audit-skills.mjs` first to generate the corrections file.

### Validation fails after fixes

1. Check that all fixes were applied: `node scripts/audit-skills.mjs`
2. Verify DataModel hasn't been modified incorrectly
3. Check for typos in characteristic names
4. Ensure SKILL_TABLE.md is up to date

### Audit shows 100+ issues

This is expected before fixes - run `fix-skills.mjs` to correct them.

### Informational (ℹ️) issues remain

Descriptor text differences are informational only - they don't affect game mechanics. These can be safely ignored or fixed manually for consistency.

---

## Related Files

- **SKILL_TABLE.md** - Authoritative skill reference
- **src/module/data/actor/templates/creature.mjs** - DataModel schema
- **src/module/data/item/skill.mjs** - Skill item DataModel
- **src/packs/rt-items-skills/_source/** - Skill pack JSON files
- **SKILL_SYSTEM_FIX_COMPLETE.md** - Resolution documentation

---

## Future Enhancements

Potential script improvements:

1. **Auto-sync descriptors** from SKILL_TABLE.md to pack files
2. **DataModel generator** from SKILL_TABLE.md
3. **Pack file generator** for new skills
4. **Migration script** for existing world data
5. **Compendium validation** - check for duplicate IDs, missing fields
6. **Localization check** - ensure all skills have translations

---

**Maintained by**: Rogue Trader VTT Development Team  
**Last updated**: 2026-01-10
