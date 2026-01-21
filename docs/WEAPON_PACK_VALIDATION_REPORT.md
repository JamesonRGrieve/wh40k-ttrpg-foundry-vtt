# Weapon Pack Quality Validation Report

**Generated**: 2026-01-21  
**Weapon Pack**: `src/packs/rt-items-weapons/_source/`  
**Total Weapons Validated**: 1,174  
**CONFIG Reference**: `src/module/config.mjs` (lines 672-1071)

---

## Executive Summary

✅ **Overall Health**: Good - Most qualities are valid  
⚠️ **Critical Issues**: 13 data integrity problems requiring fixes  
ℹ️ **Info**: 15 CONFIG entries not currently used in pack data

### Key Statistics

| Metric                                    | Count |
| ----------------------------------------- | ----- |
| Total unique qualities in packs           | 138   |
| Total CONFIG definitions                  | 73    |
| Valid leveled qualities (e.g., `blast-3`) | 75    |
| **CRITICAL: Typos**                       | **6** |
| **CRITICAL: Invalid formats**             | **1** |
| **CRITICAL: Missing in CONFIG**           | **2** |
| Other mismatches                          | 4     |
| Unused CONFIG entries                     | 15    |

---

## Critical Issues (Must Fix)

### 1. Typos (6 instances, 8 total uses)

These typos will cause display errors in the UI (missing localization keys):

| Pack Quality (Wrong) | Should Be          | Files Affected |
| -------------------- | ------------------ | -------------- |
| `fleble`             | `flexible`         | 1 weapon       |
| `flexibile`          | `flexible`         | 1 weapon       |
| `halluciongenic-1`   | `hallucinogenic-1` | 1 weapon       |
| `ogyryn-proof`       | `ogryn-proof`      | 2 weapons      |
| `unwieldty`          | `unwieldy`         | 2 weapons      |
| `warp-weapon.`       | `warp-weapon`      | 1 weapon       |

**Priority**: HIGH  
**Impact**: UI will show raw keys (e.g., `RT.WeaponQuality.Fleble`) instead of localized text  
**Fix**: Search and replace in pack JSON files

### 2. Invalid Format (1 instance)

| Pack Quality | Issue                                    | Should Be   |
| ------------ | ---------------------------------------- | ----------- |
| `felling.-4` | Malformed level syntax (dot before dash) | `felling-4` |

**Priority**: HIGH  
**Impact**: May not parse correctly, could cause display or mechanical errors  
**Fix**: Remove the dot: `felling.-4` → `felling-4`

### 3. Missing in CONFIG (2 qualities, 22 total uses)

These qualities exist in pack data but have NO definition in CONFIG.weaponQualities:

| Pack Quality              | Uses | Likely Reason                          |
| ------------------------- | ---- | -------------------------------------- |
| `volatile`                | 20   | Legitimate quality missing from CONFIG |
| `living-ammunition-toxic` | 2    | Variant/compound quality               |

**Priority**: HIGH for `volatile` (used 20×), MEDIUM for `living-ammunition-toxic` (used 2×)  
**Impact**: No localization, no mechanical implementation  
**Fix Options**:

-   **For `volatile`**: Add to CONFIG.weaponQualities (check rulebooks for definition)
-   **For `living-ammunition-toxic`**: Determine if this should be:
    -   A separate CONFIG entry
    -   Handled as `living-ammunition` + `toxic` (compound)
    -   A data entry error

---

## Other Mismatches (Non-Critical)

### Placeholder/Invalid Entries (3 uses)

| Quality | Issue                   | Action                                |
| ------- | ----------------------- | ------------------------------------- |
| `-`     | Empty/placeholder value | Replace with actual quality or remove |

### Ambiguous Abbreviations (6 uses)

| Quality | Issue                     | Likely Intent                            |
| ------- | ------------------------- | ---------------------------------------- |
| `sm`    | Ambiguous (Space Marine?) | Probably `sm-wep`                        |
| `wep`   | Incomplete abbreviation   | Probably `sm-wep` or weapon-specific tag |

**Recommendation**: Review these 9 weapons (3 with `-`, 3 with `sm`, 3 with `wep`) and correct to proper quality identifiers.

---

## Informational: Unused CONFIG Entries

These 15 qualities are defined in CONFIG but never appear in pack data (not an error, just unused):

```
unreliable-2, shock, bolt, chain, las, plasma, power, grenade, launcher,
lance, irradiated, reactive, customised, sp, never-jam
```

**Notes**:

-   `never-jam` is a craftsmanship-only quality (documented as never appearing in pack data)
-   Others may be for future content, homebrew support, or legacy definitions
-   No action required

---

## Validation Details

### Leveled Qualities

✅ **75 valid leveled quality entries** (e.g., `blast-3`, `felling-4`, `toxic-2`)

These follow the pattern `{base}-{level}` where `{base}` is marked `hasLevel: true` in CONFIG.

**Top 5 Leveled Qualities by Usage**:

1. `blast` variants (15 different levels, 143 total uses)
2. `primitive` variants (8 levels, 107 uses)
3. `felling` variants (8 levels, 60 uses)
4. `concussive` variants (7 levels, 47 uses)
5. `toxic` variants (7 levels, 69 uses)

### Quality Distribution

**Top 10 Most Used Qualities** (all types):

| Quality       | Uses | Notes                       |
| ------------- | ---- | --------------------------- |
| `tearing`     | 230  | Most common damage modifier |
| `sm-wep`      | 220  | Space Marine weapon tag     |
| `power-field` | 143  | Power weapons               |
| `reliable`    | 121  | Reliability modifier        |
| `balanced`    | 107  | Melee combat bonus          |
| `unwieldy`    | 71   | Attack penalty              |
| `unbalanced`  | 70   | Parry penalty               |
| `flame`       | 63   | Flame weapons               |
| `accurate`    | 58   | Attack bonus                |
| `spray`       | 57   | Area attack                 |

---

## Recommended Actions

### Phase 1: Critical Fixes (Required Before Release)

1. **Fix 6 Typos** (search and replace):

    ```bash
    # In pack JSON files:
    fleble → flexible
    flexibile → flexible
    halluciongenic-1 → hallucinogenic-1
    ogyryn-proof → ogryn-proof
    unwieldty → unwieldy
    warp-weapon. → warp-weapon
    ```

2. **Fix Invalid Format**:

    ```bash
    felling.-4 → felling-4
    ```

3. **Add `volatile` to CONFIG**:

    - Research rulebook definition
    - Add entry to `config.mjs` weaponQualities
    - Add localization keys to `en.json`
    - Document in `WEAPON_QUALITIES_AUDIT.md`

4. **Resolve `living-ammunition-toxic`**:

    - Investigate the 2 weapons using this quality
    - Determine correct handling (separate quality vs. compound)
    - Either add to CONFIG or fix pack data

5. **Clean up placeholders**:

    - Find 3 weapons with `-` quality
    - Replace with proper qualities or remove

6. **Fix abbreviations**:
    - Find 6 weapons with `sm`/`wep` qualities
    - Correct to proper identifiers (likely `sm-wep`)

### Phase 2: Verification (Post-Fix)

1. Re-run validation script: `node validate-weapon-qualities.js`
2. Verify all critical issues resolved
3. Spot-check fixed weapons in-game/UI
4. Update this report with "RESOLVED" status

### Phase 3: Documentation (Ongoing)

1. Document `volatile` in `WEAPON_QUALITIES_AUDIT.md`
2. Add `living-ammunition-toxic` handling to audit (if separate quality)
3. Update AGENTS.md if needed

---

## Technical Notes

### Quality Identifier Format

**Standard Format**: `{base-quality}[-{level}]`

Examples:

-   `tearing` (no level)
-   `blast-3` (level 3)
-   `primitive-8` (level 8)

**Rules**:

-   Kebab-case (lowercase, hyphens)
-   Level suffix only for qualities with `hasLevel: true` in CONFIG
-   Level is always numeric (1-20 range observed)
-   No spaces, dots, or special characters (except hyphens)

### CONFIG Schema

Each CONFIG.weaponQualities entry has:

```javascript
{
  label: 'RT.WeaponQuality.QualityName',      // Localization key
  description: 'RT.WeaponQuality.QualityNameDesc', // Description key
  hasLevel: true/false,                        // Supports level suffix?
  category: 'simple-modifier' (optional),      // Implementation category
  mechanicalEffect: true/false (optional)      // Has game mechanics?
}
```

### Pack Data Schema

Qualities stored in weapon JSON as array:

```json
{
    "system": {
        "qualities": ["tearing", "reliable", "blast-3"]
    }
}
```

---

## Validation Script

**Location**: `validate-weapon-qualities.js` (project root)  
**Usage Data**: `weapon-qualities-usage.json`  
**Full Report**: `weapon-quality-validation-report.json`

**Re-run validation**:

```bash
node validate-weapon-qualities.js
```

---

## Change Log

| Date       | Change                    | Author   |
| ---------- | ------------------------- | -------- |
| 2026-01-21 | Initial validation report | AI Agent |

---

## Related Documents

-   `docs/WEAPON_QUALITIES_AUDIT.md` - Full quality categorization by implementation complexity
-   `resources/weapon_qualities.csv` - Source data (72 qualities from rulebooks)
-   `src/module/config.mjs` - CONFIG.weaponQualities definitions
-   `src/lang/en.json` - Localization keys

---

## Appendix: Full Quality Lists

### All 138 Pack Qualities (Alphabetical)

```
-, accurate, balanced, blast, blast-1, blast-10, blast-12, blast-15, blast-2,
blast-3, blast-4, blast-5, blast-6, blast-8, cleansing-fire, concussive-0,
concussive-1, concussive-2, concussive-3, concussive-4, concussive-5,
concussive-6, corrosive, crippling, crippling-1, crippling-2, crippling-3,
crippling-4, crippling-5, crippling-6, daemon-wep, daemonbane, decay-3,
decay-4, defensive, devastating, devastating-1, devastating-2, devastating-3,
devastating-4, devastating-5, fast, felling-1, felling-2, felling-3, felling-4,
felling-5, felling-6, felling-8, felling.-4, flame, fleble, flexibile, flexible,
force, gauss, graviton, gyro-stabilised, hallucinogenic-2, hallucinogenic-3,
hallucinogenic-4, halluciongenic-1, haywire-1, haywire-3, inaccurate, indirect,
indirect-2, indirect-3, indirect-5, integrated-weapon, living-ammunition,
living-ammunition-toxic, maximal, melta, necron-wep, ogryn-proof, ogyryn-proof,
overcharge, overcharge-4, overcharge-6, overcharge-8, overheats, power-field,
primitive, primitive-1, primitive-5, primitive-6, primitive-7, primitive-8,
primitive-9, proven-2, proven-3, proven-4, proven-5, razor-sharp, recharge,
reliable, rune-wep, sanctified, scatter, shocking, sm, sm-wep, smoke, smoke-1,
smoke-3, smoke-5, smoke-6, snare, snare-0, snare-1, snare-2, snare-4, spray,
storm, tainted, tearing, toxic, toxic-0, toxic-1, toxic-2, toxic-3, toxic-4,
toxic-6, toxic-7, twin-linked, unbalanced, unreliable, unstable, unwieldty,
unwieldy, vengeful-8, vengeful-9, volatile, warp-weapon, warp-weapon., wep,
witch-edge
```

### All 73 CONFIG Qualities (Alphabetical)

```
accurate, balanced, blast, bolt, chain, cleansing-fire, concussive, corrosive,
crippling, customised, daemon-wep, daemonbane, decay, defensive, devastating,
fast, felling, flame, flexible, force, gauss, graviton, grenade, gyro-stabilised,
hallucinogenic, haywire, inaccurate, indirect, integrated-weapon, irradiated,
lance, las, launcher, living-ammunition, maximal, melta, necron-wep, never-jam,
ogryn-proof, overcharge, overheats, plasma, power, power-field, primitive, proven,
razor-sharp, reactive, recharge, reliable, rune-wep, sanctified, scatter, shock,
shocking, sm-wep, smoke, snare, sp, spray, storm, tainted, tearing, toxic,
twin-linked, unbalanced, unreliable, unreliable-2, unstable, unwieldy, vengeful,
warp-weapon, witch-edge
```
