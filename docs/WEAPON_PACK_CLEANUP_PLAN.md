# Weapon Pack Data Cleanup - Implementation Plan

**Date**: 2026-01-20  
**Target**: 1,093 weapon items in `src/packs/rt-items-weapons/_source/`  
**Prerequisites**: RogueTraderVTT-6zd (Data Model) COMPLETE  
**Script**: `src/scripts/migrate-weapon-pack.mjs`

---

## Executive Summary

This plan details the cleanup of 1,093 weapon pack items to address:

1. **100% placeholder icons** (`icons/svg/sword.svg`)
2. **100% common craftsmanship** (no quality variance)
3. **100% incorrect twoHanded flags** (all false, including heavy weapons)
4. **Inconsistent source attribution** (14+ format variations)
5. **Proficiency field migration** (migrate to requiredTraining)

**Estimated Impact**:

- Icons: 1,093 files updated
- Craftsmanship: ~150 files updated (best/good/poor variants)
- twoHanded: ~600 files updated (heavy/basic/melee great weapons)
- Source: 1,093 files standardized
- Proficiency: 1,093 files migrated

---

## 1. Icon Assignment Strategy

### Icon Library Structure

Using Font Awesome 6 Pro icons (system default) with class-based categorization.

**Icon Base Path**: System will use FontAwesome classes, but for compendium preview we'll map to Foundry icon paths.

### Class-Based Icon Mapping

| Class      | Type             | Icon Suggestion                                                   | Notes                      |
| ---------- | ---------------- | ----------------------------------------------------------------- | -------------------------- |
| **melee**  | primitive        | `systems/rogue-trader/assets/icons/weapons/melee-primitive.svg`   | Knives, clubs, swords      |
| melee      | chain            | `systems/rogue-trader/assets/icons/weapons/melee-chain.svg`       | Chainswords, chainaxes     |
| melee      | power            | `systems/rogue-trader/assets/icons/weapons/melee-power.svg`       | Power swords, axes         |
| melee      | force            | `systems/rogue-trader/assets/icons/weapons/melee-force.svg`       | Psychic weapons            |
| melee      | shock            | `systems/rogue-trader/assets/icons/weapons/melee-shock.svg`       | Shock mauls, staves        |
| melee      | exotic           | `systems/rogue-trader/assets/icons/weapons/melee-exotic.svg`      | Xenos, unique              |
| **pistol** | las              | `systems/rogue-trader/assets/icons/weapons/pistol-las.svg`        | Laspistols                 |
| pistol     | bolt             | `systems/rogue-trader/assets/icons/weapons/pistol-bolt.svg`       | Bolt pistols               |
| pistol     | plasma           | `systems/rogue-trader/assets/icons/weapons/pistol-plasma.svg`     | Plasma pistols             |
| pistol     | solid-projectile | `systems/rogue-trader/assets/icons/weapons/pistol-autopistol.svg` | Autoguns, stub guns        |
| pistol     | primitive        | `systems/rogue-trader/assets/icons/weapons/pistol-primitive.svg`  | Dueling pistols            |
| pistol     | exotic           | `systems/rogue-trader/assets/icons/weapons/pistol-exotic.svg`     | Xenos pistols              |
| **basic**  | las              | `systems/rogue-trader/assets/icons/weapons/basic-lasgun.svg`      | Lasguns                    |
| basic      | bolt             | `systems/rogue-trader/assets/icons/weapons/basic-bolter.svg`      | Bolters                    |
| basic      | solid-projectile | `systems/rogue-trader/assets/icons/weapons/basic-autogun.svg`     | Autoguns, shotguns         |
| basic      | flame            | `systems/rogue-trader/assets/icons/weapons/basic-flamer.svg`      | Flamers                    |
| basic      | melta            | `systems/rogue-trader/assets/icons/weapons/basic-meltagun.svg`    | Meltaguns                  |
| basic      | plasma           | `systems/rogue-trader/assets/icons/weapons/basic-plasma.svg`      | Plasma guns                |
| basic      | primitive        | `systems/rogue-trader/assets/icons/weapons/basic-primitive.svg`   | Bows, muskets              |
| basic      | exotic           | `systems/rogue-trader/assets/icons/weapons/basic-exotic.svg`      | Xenos rifles               |
| **heavy**  | solid-projectile | `systems/rogue-trader/assets/icons/weapons/heavy-cannon.svg`      | Heavy bolters, autocannons |
| heavy      | las              | `systems/rogue-trader/assets/icons/weapons/heavy-lascannon.svg`   | Lascannons                 |
| heavy      | bolt             | `systems/rogue-trader/assets/icons/weapons/heavy-bolter.svg`      | Heavy bolters              |
| heavy      | flame            | `systems/rogue-trader/assets/icons/weapons/heavy-flamer.svg`      | Heavy flamers              |
| heavy      | launcher         | `systems/rogue-trader/assets/icons/weapons/heavy-launcher.svg`    | Missile launchers          |
| heavy      | plasma           | `systems/rogue-trader/assets/icons/weapons/heavy-plasma.svg`      | Plasma cannons             |
| heavy      | melta            | `systems/rogue-trader/assets/icons/weapons/heavy-multimelta.svg`  | Multi-meltas               |
| heavy      | exotic           | `systems/rogue-trader/assets/icons/weapons/heavy-exotic.svg`      | Xenos heavy                |
| **thrown** | explosive        | `systems/rogue-trader/assets/icons/weapons/thrown-grenade.svg`    | Grenades, charges          |
| thrown     | primitive        | `systems/rogue-trader/assets/icons/weapons/thrown-primitive.svg`  | Javelins, throwing axes    |
| thrown     | exotic           | `systems/rogue-trader/assets/icons/weapons/thrown-exotic.svg`     | Xenos thrown               |

### Fallback Strategy

```javascript
function getIconPath(weaponClass, weaponType, weaponName) {
    // Priority 1: Exact class+type match
    const exactMatch = ICON_MAP[weaponClass]?.[weaponType];
    if (exactMatch) return exactMatch;

    // Priority 2: Class fallback (e.g., melee + unknown type)
    const classFallback = ICON_MAP[weaponClass]?.['default'];
    if (classFallback) return classFallback;

    // Priority 3: Name-based detection for special cases
    const nameMatch = detectSpecialIcon(weaponName);
    if (nameMatch) return nameMatch;

    // Priority 4: System default
    return 'icons/svg/sword.svg'; // Keep existing until icons created
}

function detectSpecialIcon(name) {
    const lower = name.toLowerCase();

    // Special melee cases
    if (lower.includes('chainsword')) return 'melee-chain';
    if (lower.includes('power sword')) return 'melee-power';
    if (lower.includes('thunder hammer')) return 'melee-power-special';

    // Special ranged cases
    if (lower.includes('bolter') && !lower.includes('pistol')) return 'basic-bolter';
    if (lower.includes('lasgun')) return 'basic-lasgun';
    if (lower.includes('flamer') && lower.includes('heavy')) return 'heavy-flamer';

    return null;
}
```

### Icon Asset Creation (Future)

**NOT REQUIRED FOR THIS SCRIPT** - Script will use placeholder mapping structure. Icons can be:

1. Created later by artists
2. Sourced from community icon packs (Game-Icons.net)
3. Generated from AI tools
4. Left as class-based Font Awesome icons in sheet UI

The script will prepare the data structure to support proper icons when available.

---

## 2. Craftsmanship Curation

### Philosophy

**Goal**: Create meaningful quality variance without overwhelming the compendium.

**Target Distribution**:

- Common: 943 weapons (86.3%) - Remain unchanged
- Good: 70 weapons (6.4%) - Reliable, well-maintained variants
- Best: 30 weapons (2.7%) - Exceptional quality, rare
- Master-Crafted: 15 weapons (1.4%) - Legendary, named items
- Poor: 35 weapons (3.2%) - Shoddy, unreliable variants

Total new variants: **150 weapons** (will create duplicates with quality suffix)

### Selection Criteria

#### Best Quality (30 weapons)

**Criteria**: Iconic Imperial weapons, high-tech, status symbols

**Candidates**:

1. **Bolter Family** (6)
    - Bolt Pistol (Godwyn-Deaz) [Best Quality]
    - Bolter (Godwyn) [Best Quality]
    - Heavy Bolter (Devastator) [Best Quality]
    - Storm Bolter [Best Quality]
    - Combi-Bolter (Plasma) [Best Quality]
    - Bolt Carbine (Ceres) [Best Quality]

2. **Power Weapons** (8)
    - Power Sword [Best Quality]
    - Power Axe [Best Quality]
    - Power Maul [Best Quality]
    - Thunder Hammer [Best Quality]
    - Power Fist [Best Quality]
    - Lightning Claws [Best Quality]
    - Power Lance [Best Quality]
    - Eviscerator [Best Quality]

3. **Chain Weapons** (4)
    - Chainsword [Best Quality]
    - Chainaxe [Best Quality]
    - Chain Glaive [Best Quality]
    - Chainblade [Best Quality]

4. **Las Weapons** (5)
    - Laspistol (Lucius) [Best Quality]
    - Lasgun (Accatran Mk II) [Best Quality]
    - Long Las [Best Quality]
    - Hot-shot Lasgun [Best Quality]
    - Hellgun [Best Quality]

5. **Plasma Weapons** (3)
    - Plasma Pistol [Best Quality]
    - Plasma Gun [Best Quality]
    - Plasma Cannon [Best Quality]

6. **Special** (4)
    - Meltagun [Best Quality]
    - Melta Lance [Best Quality]
    - Inferno Pistol [Best Quality]
    - Multi-Melta [Best Quality]

#### Master-Crafted (15 weapons)

**Criteria**: Already named/unique weapons, legendary status, Astartes gear

**Candidates**:

1. Almace's Last Conquest (already unique, upgrade to master-crafted)
2. Ascension (legendary weapon)
3. Blade of the Laer (chaos artifact)
4. Fang of the Emperor (relic blade)
5. Seraph's Kiss (archeotech)
6. Astartes Relic Blade (any named variant)
7. Astartes Thunder Hammer (named variants)
8. Nemesis Force Sword (Grey Knight weapons)
9. Frost Blade (Space Wolves)
10. Crozius Arcanum (Chaplain weapons)
11. Deathwatch Power Sword (any named)
12. Archeotech Laspistol (already unique)
13. Phoenix Spear (relic)
14. Guardian Spear (Custodes, if present)
15. Any weapon with "Relic" or "Archeotech" in name

#### Good Quality (70 weapons)

**Criteria**: Standard military issue, widespread, reliable

**Categories**:

- Autoguns (8 variants)
- Shotguns (6 variants)
- Lasguns (10 variants)
- Laspistols (6 variants)
- Stub weapons (5 variants)
- Standard melee weapons (15 variants - swords, axes, hammers)
- Solid projectile weapons (12 variants)
- Basic chain/power weapons (8 variants)

**Selection Method**: Pick the most "standard" named variants (e.g., "Lasgun (Accatran)" rather than exotic models)

#### Poor Quality (35 weapons)

**Criteria**: Unreliable, shoddy, makeshift, gang weapons

**Candidates**:

1. **Primitive Weapons** (15)
    - Club, Knife, Spear, Axe, Sword (Poor Quality versions)
    - Bow, Crossbow (Poor Quality)
    - Improvised weapons

2. **Solid Projectile Low-Tech** (10)
    - Stub Revolver [Poor Quality]
    - Autopistol [Poor Quality]
    - Autogun [Poor Quality]
    - Shotgun (Mauler, Ripper) [Poor Quality]
    - Hand Cannon [Poor Quality]

3. **Unreliable Special** (10)
    - Flamer (Basic) [Poor Quality] - leaky, misfires
    - Chainsword [Poor Quality] - dull teeth, jams
    - Chainaxe [Poor Quality]
    - Any weapon with "Unreliable" quality already
    - Improvised or gang weapons

### Craftsmanship Effects Reminder

**From WeaponData schema**:

- **Poor**: -10 attack, +10 jam threshold, "unreliable" quality
- **Common**: No modifiers (baseline)
- **Good**: +5 attack, "reliable" quality
- **Best**: +10 attack, -5 jam threshold, "reliable" quality
- **Master-Crafted**: +10 attack, -10 jam threshold, "never-jam" quality

### Implementation Approach

**Create Duplicate Items** (Not Modify Existing):

```javascript
// For each weapon in BEST_QUALITY_LIST:
// 1. Load base common weapon
// 2. Clone JSON
// 3. Update fields:
//    - name: append " [Best Quality]"
//    - identifier: append "-best"
//    - craftsmanship: "best"
//    - _id: generate new 16-char ID
//    - cost.value: multiply by 2 (or 3 for best, 5 for master)
//    - availability: increase rarity by 1 step
// 4. Write new file

// Example:
// chainsword_VYVwYhiOZDYAXw51.json (common)
// → chainsword-best_Abc123Def456Ghi7.json (new file)
```

---

## 3. twoHanded Flag Correction

### Rules for Setting twoHanded: true

#### Automatic Rules (Class-Based)

| Rule | Condition                                                                          | twoHanded | Count | Notes                                            |
| ---- | ---------------------------------------------------------------------------------- | --------- | ----- | ------------------------------------------------ |
| 1    | `class === 'heavy'`                                                                | `true`    | ~128  | ALL heavy weapons are two-handed                 |
| 2    | `class === 'basic'` AND `type !== 'flame'` AND name does NOT contain 'pistol'      | `true`    | ~260  | Rifles, carbines, bolters, lasguns (NOT flamers) |
| 3    | `class === 'melee'` AND name contains great/halberd/two-handed/greatsword/greataxe | `true`    | ~40   | Great weapons                                    |
| 4    | `class === 'melee'` AND name contains eviscerator/thunder hammer                   | `true`    | ~10   | Specific heavy melee                             |
| 5    | `class === 'thrown'`                                                               | `false`   | ~104  | Thrown weapons are NOT two-handed                |
| 6    | `class === 'pistol'`                                                               | `false`   | ~144  | Pistols are NOT two-handed                       |

#### Name-Based Detection (Melee Weapons)

```javascript
const TWO_HANDED_MELEE_PATTERNS = [
    /great\s*weapon/i,
    /great\s*sword/i,
    /great\s*axe/i,
    /great\s*hammer/i,
    /halberd/i,
    /two\-handed/i,
    /eviscerator/i,
    /thunder\s*hammer/i,
    /chain\s*great/i, // Chain Greatsword, Chain Greataxe
    /battle\s*cannon/i, // If mounted as melee (rare)
    /force\s*staff/i, // Psyker staves
    /power\s*lance/i, // If not mounted
];

function isTwoHandedMelee(weaponName) {
    return TWO_HANDED_MELEE_PATTERNS.some((pattern) => pattern.test(weaponName));
}
```

#### Exceptions (Manual Override List)

**Weapons that LOOK two-handed but are NOT**:

- Storm Bolter (can be one-handed for Astartes)
- Combi-weapons (can be one-handed for Astartes)
- Astartes weapons (Space Marines can wield "basic" weapons one-handed)

**Solution**: Create `ASTARTES_EXCEPTION_LIST` - if name contains "Astartes", allow basic weapons to remain one-handed.

```javascript
const ASTARTES_EXCEPTION_LIST = [
    'astartes-bolter',
    'astartes-plasma-gun',
    'astartes-flamer',
    // Astartes can use basic weapons one-handed
];

function shouldBeAstartesException(identifier) {
    return ASTARTES_EXCEPTION_LIST.includes(identifier) || identifier.startsWith('astartes-');
}
```

#### One-Handed Melee (Keep false)

- Knives, daggers
- Swords (non-great)
- Axes (non-great)
- Maces, clubs
- Chainswords (standard size)
- Power swords (standard)
- All weapons under 5kg weight

### Implementation Logic

```javascript
function calculateTwoHanded(weapon) {
    // Rule 1: Heavy weapons
    if (weapon.system.class === 'heavy') return true;

    // Rule 2: Thrown and pistol always false
    if (weapon.system.class === 'thrown' || weapon.system.class === 'pistol') {
        return false;
    }

    // Rule 3: Basic weapons (except Astartes and flamers)
    if (weapon.system.class === 'basic') {
        // Exception: Astartes can use basic weapons one-handed
        if (shouldBeAstartesException(weapon.system.identifier)) {
            return false;
        }
        // Exception: Flamers can be one-handed (nozzle weapons)
        if (weapon.system.type === 'flame') {
            return false;
        }
        // Default: basic weapons are two-handed (rifles)
        return true;
    }

    // Rule 4: Melee weapons - check name patterns
    if (weapon.system.class === 'melee') {
        return isTwoHandedMelee(weapon.name);
    }

    // Rule 5: Exotic - case by case (default false, check patterns)
    if (weapon.system.class === 'exotic') {
        return isTwoHandedMelee(weapon.name); // Use same patterns
    }

    // Default: false
    return false;
}
```

### Validation After Migration

**Spot Checks Required**:

1. All 128 heavy weapons → twoHanded: true
2. Sample 20 basic weapons → should be true (except Astartes/flamers)
3. Sample 20 pistols → should be false
4. Sample "Great Weapon" melee → should be true
5. Sample standard chainswords → should be false

---

## 4. Source Standardization

### Current Source Variations (from analysis)

**Found 30+ unique sources, 14 format styles**:

```
"Rogue Trader: Core"              (Long format)
"RT: Into the Storm"              (Abbrev + full title)
"RT: Hostile Acquisitions"        (Abbrev + full title)
"Dark Heresy 2E: Core"            (Game + edition + type)
"DH 2E: Enemies Beyond"           (Abbrev + expansion)
"Deathwatch: Core"                (Full game + type)
"DW: First Founding"              (Abbrev + expansion)
"Only War: Core"                  (Full game + type)
"OW: Hammer of the Emperor"       (Abbrev + expansion)
"Black Crusade: Core"             (Full game + type)
"BC: Tome of Blood"               (Abbrev + book)
"HB"                              (Unknown abbreviation)
"ChatGPT"                         (AI-generated content)
"Deathwatch: Errata"              (Errata documents)
```

### Standardized Format

**Format**: `{GameAbbrev}: {BookTitle} p.{page}`

**Examples**:

- `RT: Core Rulebook p.142`
- `DH2: Core Rulebook p.198`
- `DW: Rites of Battle p.54`
- `OW: Core Rulebook p.176`
- `BC: Black Crusade Core p.89`

**For items without page numbers**:

- `RT: Into the Storm`
- `DH2: Enemies Beyond`

### Abbreviation Mapping

```javascript
const SOURCE_ABBREVIATIONS = {
    // Rogue Trader
    'Rogue Trader': 'RT',
    'RT': 'RT',

    // Dark Heresy
    'Dark Heresy': 'DH',
    'DH': 'DH',
    'Dark Heresy 2E': 'DH2',
    'DH 2E': 'DH2',

    // Deathwatch
    'Deathwatch': 'DW',
    'DW': 'DW',

    // Only War
    'Only War': 'OW',
    'OW': 'OW',

    // Black Crusade
    'Black Crusade': 'BC',
    'BC': 'BC',

    // Unknown
    'HB': 'HB', // Homebrew?
    'ChatGPT': 'Homebrew',
};

const BOOK_TITLE_STANDARDIZATION = {
    // Rogue Trader
    'Core': 'Core Rulebook',
    'Into the Storm': 'Into the Storm',
    'Hostile Acquisitions': 'Hostile Acquisitions',
    'Edge of the Abyss': 'Edge of the Abyss',
    'Battlefleet Koronus': 'Battlefleet Koronus',
    'Stars of Inequity': 'Stars of Inequity',
    'Faith and Coin': 'Faith and Coin',
    'The Navis Primer': 'The Navis Primer',
    'Koronus Bestiary': 'Koronus Bestiary',
    'Tau Char. Guide': 'Tau Character Guide',

    // Dark Heresy 2E
    'Enemies Beyond': 'Enemies Beyond',
    'Enemies Within': 'Enemies Within',
    'Enemies Without': 'Enemies Without',

    // Dark Heresy 1E
    "Inquisitor's Handbook": "Inquisitor's Handbook",

    // Deathwatch
    'Rites of Battle': 'Rites of Battle',
    'Mark of the Xenos': 'Mark of the Xenos',
    'First Founding': 'First Founding',
    'Honour the Chapter': 'Honour the Chapter',
    'Errata': 'Errata',

    // Only War
    'Hammer of the Emperor': 'Hammer of the Emperor',
    'Shield of Humanity': 'Shield of Humanity',

    // Black Crusade
    'Tome of Blood': 'Tome of Blood',
    'Tome of Decay': 'Tome of Decay',
    'Tome of Excess': 'Tome of Excess',
    'Tome of Fate': 'Tome of Fate',
};
```

### Conversion Logic

```javascript
function standardizeSource(originalSource) {
    if (!originalSource || originalSource.trim() === '') {
        return 'Unknown Source';
    }

    // Special case: ChatGPT → Homebrew
    if (originalSource.includes('ChatGPT')) {
        return 'Homebrew';
    }

    // Parse format: "Game: Book" or "Game: Book p.123"
    const match = originalSource.match(/^([^:]+):\s*(.+?)(\s+p\.\d+)?$/);

    if (!match) {
        // No colon, try to infer
        return inferSource(originalSource);
    }

    const [, gameRaw, bookRaw, pageRaw] = match;

    // Standardize game abbreviation
    const gameStd = SOURCE_ABBREVIATIONS[gameRaw.trim()] || gameRaw.trim();

    // Standardize book title
    const bookStd = BOOK_TITLE_STANDARDIZATION[bookRaw.trim()] || bookRaw.trim();

    // Reconstruct
    const page = pageRaw ? ` ${pageRaw.trim()}` : '';
    return `${gameStd}: ${bookStd}${page}`;
}

function inferSource(text) {
    // Try to detect game from keywords
    if (text.includes('Rogue Trader')) return 'RT: Core Rulebook';
    if (text.includes('Dark Heresy 2')) return 'DH2: Core Rulebook';
    if (text.includes('Dark Heresy')) return 'DH: Core Rulebook';
    if (text.includes('Deathwatch')) return 'DW: Core Rulebook';
    if (text.includes('Only War')) return 'OW: Core Rulebook';
    if (text.includes('Black Crusade')) return 'BC: Black Crusade Core';

    return text; // Keep as-is if we can't parse
}
```

### Special Cases

**AI-Generated Content**:

- Source: `"ChatGPT"` → Convert to `"Homebrew"`
- Add flag: `system.flags.homebrewSource = true`

**Missing Sources**:

- Source: `""` or `null` → Convert to `"Unknown Source"`

**Errata**:

- Keep as-is: `"DW: Errata"`

---

## 5. Proficiency → requiredTraining Migration

**Change**: The data model renamed `proficiency` → `requiredTraining` (see RogueTraderVTT-6zd).

### Current State

All 1,093 weapons have:

```json
"proficiency": ""
```

### Target State

```json
"requiredTraining": ""
```

### Migration Logic

```javascript
function migrateRequiredTraining(weapon) {
    // Get old proficiency value (should be empty string for all)
    const oldValue = weapon.system.proficiency || '';

    // Set new field
    weapon.system.requiredTraining = oldValue;

    // Remove old field
    delete weapon.system.proficiency;

    // Future enhancement: Auto-detect training requirements
    // Example: Las weapons → "Weapon Training (Las)"
    // But leave empty for now (no source data to infer from)
}
```

**Note**: This is a simple rename since all values are empty. Future enhancement could auto-populate training requirements based on weapon type, but that's out of scope for this cleanup.

---

## 6. Script Structure

### File: `src/scripts/migrate-weapon-pack.mjs`

```javascript
#!/usr/bin/env node

/**
 * Weapon Pack Data Cleanup Script
 *
 * Performs comprehensive cleanup on all weapon compendium items:
 * 1. Assigns icons based on class + type mapping
 * 2. Creates craftsmanship variants (best, good, poor, master)
 * 3. Corrects twoHanded flags
 * 4. Standardizes source attribution
 * 5. Migrates proficiency → requiredTraining
 * 6. Validates all changes
 * 7. Generates detailed migration report
 *
 * Usage:
 *   node src/scripts/migrate-weapon-pack.mjs [options]
 *
 * Options:
 *   --dry-run          Show changes without writing files
 *   --icons-only       Only update icon paths
 *   --craftsmanship    Only create craftsmanship variants
 *   --two-handed       Only fix twoHanded flags
 *   --sources          Only standardize sources
 *   --validate         Only validate existing data
 *   --verbose          Show detailed progress
 *   --backup           Create backup before modifying (default: true)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const PACK_SOURCE_DIR = path.join(__dirname, '..', 'packs', 'rt-items-weapons', '_source');
const BACKUP_DIR = path.join(__dirname, '..', '..', 'backups', `weapons-${Date.now()}`);
const REPORT_PATH = path.join(__dirname, '..', '..', 'WEAPON_CLEANUP_REPORT.md');

// Command-line arguments
const args = {
    dryRun: process.argv.includes('--dry-run'),
    iconsOnly: process.argv.includes('--icons-only'),
    craftsmanship: process.argv.includes('--craftsmanship'),
    twoHanded: process.argv.includes('--two-handed'),
    sources: process.argv.includes('--sources'),
    validate: process.argv.includes('--validate'),
    verbose: process.argv.includes('--verbose'),
    backup: !process.argv.includes('--no-backup'),
};

// Statistics tracking
const stats = {
    totalWeapons: 0,
    iconsUpdated: 0,
    craftsmanshipVariantsCreated: 0,
    twoHandedCorrected: 0,
    sourcesStandardized: 0,
    proficiencyMigrated: 0,
    errors: [],
    warnings: [],
    validationIssues: [],
};

// ============================================================================
// ICON MAPPING
// ============================================================================

const ICON_MAP = {
    melee: {
        primitive: 'systems/rogue-trader/assets/icons/weapons/melee-primitive.svg',
        chain: 'systems/rogue-trader/assets/icons/weapons/melee-chain.svg',
        power: 'systems/rogue-trader/assets/icons/weapons/melee-power.svg',
        force: 'systems/rogue-trader/assets/icons/weapons/melee-force.svg',
        shock: 'systems/rogue-trader/assets/icons/weapons/melee-shock.svg',
        exotic: 'systems/rogue-trader/assets/icons/weapons/melee-exotic.svg',
        default: 'systems/rogue-trader/assets/icons/weapons/melee-default.svg',
    },
    pistol: {
        'las': 'systems/rogue-trader/assets/icons/weapons/pistol-las.svg',
        'bolt': 'systems/rogue-trader/assets/icons/weapons/pistol-bolt.svg',
        'plasma': 'systems/rogue-trader/assets/icons/weapons/pistol-plasma.svg',
        'solid-projectile': 'systems/rogue-trader/assets/icons/weapons/pistol-autopistol.svg',
        'primitive': 'systems/rogue-trader/assets/icons/weapons/pistol-primitive.svg',
        'exotic': 'systems/rogue-trader/assets/icons/weapons/pistol-exotic.svg',
        'melta': 'systems/rogue-trader/assets/icons/weapons/pistol-melta.svg',
        'flame': 'systems/rogue-trader/assets/icons/weapons/pistol-flamer.svg',
        'default': 'systems/rogue-trader/assets/icons/weapons/pistol-default.svg',
    },
    basic: {
        'las': 'systems/rogue-trader/assets/icons/weapons/basic-lasgun.svg',
        'bolt': 'systems/rogue-trader/assets/icons/weapons/basic-bolter.svg',
        'solid-projectile': 'systems/rogue-trader/assets/icons/weapons/basic-autogun.svg',
        'flame': 'systems/rogue-trader/assets/icons/weapons/basic-flamer.svg',
        'melta': 'systems/rogue-trader/assets/icons/weapons/basic-meltagun.svg',
        'plasma': 'systems/rogue-trader/assets/icons/weapons/basic-plasma.svg',
        'primitive': 'systems/rogue-trader/assets/icons/weapons/basic-primitive.svg',
        'exotic': 'systems/rogue-trader/assets/icons/weapons/basic-exotic.svg',
        'default': 'systems/rogue-trader/assets/icons/weapons/basic-default.svg',
    },
    heavy: {
        'solid-projectile': 'systems/rogue-trader/assets/icons/weapons/heavy-cannon.svg',
        'las': 'systems/rogue-trader/assets/icons/weapons/heavy-lascannon.svg',
        'bolt': 'systems/rogue-trader/assets/icons/weapons/heavy-bolter.svg',
        'flame': 'systems/rogue-trader/assets/icons/weapons/heavy-flamer.svg',
        'launcher': 'systems/rogue-trader/assets/icons/weapons/heavy-launcher.svg',
        'plasma': 'systems/rogue-trader/assets/icons/weapons/heavy-plasma.svg',
        'melta': 'systems/rogue-trader/assets/icons/weapons/heavy-multimelta.svg',
        'exotic': 'systems/rogue-trader/assets/icons/weapons/heavy-exotic.svg',
        'default': 'systems/rogue-trader/assets/icons/weapons/heavy-default.svg',
    },
    thrown: {
        explosive: 'systems/rogue-trader/assets/icons/weapons/thrown-grenade.svg',
        primitive: 'systems/rogue-trader/assets/icons/weapons/thrown-primitive.svg',
        exotic: 'systems/rogue-trader/assets/icons/weapons/thrown-exotic.svg',
        default: 'systems/rogue-trader/assets/icons/weapons/thrown-default.svg',
    },
    exotic: {
        default: 'systems/rogue-trader/assets/icons/weapons/exotic-default.svg',
    },
};

// ============================================================================
// CRAFTSMANSHIP LISTS
// ============================================================================

// Identifiers of weapons to create BEST quality variants
const BEST_QUALITY_LIST = [
    // Bolter Family
    'bolt-pistol-godwyn-deaz',
    'bolter-godwyn',
    'heavy-bolter-devastator',
    'storm-bolter',
    // ... (full list from plan)
];

// Identifiers of weapons to create MASTER CRAFTED variants
const MASTER_CRAFTED_LIST = [
    'almaces-last-conquest',
    'ascension',
    // ... (full list from plan)
];

// Identifiers of weapons to create GOOD quality variants
const GOOD_QUALITY_LIST = [
    // Standard military issue
    'autogun-accatran',
    'lasgun-accatran',
    // ... (full list from plan)
];

// Identifiers of weapons to create POOR quality variants
const POOR_QUALITY_LIST = [
    'stub-revolver',
    'club',
    'knife',
    // ... (full list from plan)
];

// ============================================================================
// TWO-HANDED DETECTION
// ============================================================================

const TWO_HANDED_MELEE_PATTERNS = [
    /great\s*weapon/i,
    /great\s*sword/i,
    /great\s*axe/i,
    /great\s*hammer/i,
    /halberd/i,
    /two\-handed/i,
    /eviscerator/i,
    /thunder\s*hammer/i,
    /chain\s*great/i,
    /force\s*staff/i,
    /power\s*lance/i,
];

const ASTARTES_ONE_HANDED_EXCEPTIONS = [
    // Astartes can wield basic weapons one-handed
];

// ============================================================================
// SOURCE STANDARDIZATION
// ============================================================================

const SOURCE_ABBREVIATIONS = {
    'Rogue Trader': 'RT',
    'RT': 'RT',
    'Dark Heresy': 'DH',
    'DH': 'DH',
    'Dark Heresy 2E': 'DH2',
    'DH 2E': 'DH2',
    'Deathwatch': 'DW',
    'DW': 'DW',
    'Only War': 'OW',
    'OW': 'OW',
    'Black Crusade': 'BC',
    'BC': 'BC',
    'ChatGPT': 'Homebrew',
};

// ... (full mapping tables from plan)

// ============================================================================
// MAIN SCRIPT FUNCTIONS
// ============================================================================

function main() {
    console.log('='.repeat(80));
    console.log('WEAPON PACK DATA CLEANUP');
    console.log('='.repeat(80));
    console.log(`Mode: ${args.dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`Backup: ${args.backup ? 'ENABLED' : 'DISABLED'}`);
    console.log('');

    // Phase 1: Backup
    if (args.backup && !args.dryRun) {
        createBackup();
    }

    // Phase 2: Load all weapons
    const weapons = loadWeapons();
    stats.totalWeapons = weapons.length;
    console.log(`Loaded ${weapons.length} weapons\n`);

    // Phase 3: Process weapons
    if (!args.validate) {
        processWeapons(weapons);
    }

    // Phase 4: Validate
    validateWeapons(weapons);

    // Phase 5: Generate report
    generateReport();

    console.log('\n' + '='.repeat(80));
    console.log('CLEANUP COMPLETE');
    console.log('='.repeat(80));
}

// ... (implementation functions)

// ============================================================================
// ENTRY POINT
// ============================================================================

main();
```

### Key Functions

1. **createBackup()** - Copy entire `_source/` directory to timestamped backup
2. **loadWeapons()** - Read all JSON files into memory
3. **processWeapons(weapons)** - Apply all transformations
    - updateIcon(weapon)
    - createCraftsmanshipVariants(weapon)
    - fixTwoHanded(weapon)
    - standardizeSource(weapon)
    - migrateProficiency(weapon)
4. **validateWeapons(weapons)** - Check for issues
    - validateSchema(weapon)
    - checkIconPaths(weapon)
    - validateCraftsmanship(weapon)
5. **generateReport()** - Write markdown report
6. **writeWeapons(weapons)** - Save modified JSON (unless dry-run)

---

## 7. Testing Strategy

### Pre-Flight Checks

1. **Backup Verification**

    ```bash
    # Before running script
    ls -la src/packs/rt-items-weapons/_source/ | wc -l
    # Should be 1093 files
    ```

2. **Dry Run First**

    ```bash
    node src/scripts/migrate-weapon-pack.mjs --dry-run --verbose
    # Review console output for issues
    ```

3. **Validate Only**
    ```bash
    node src/scripts/migrate-weapon-pack.mjs --validate
    # Check for schema issues before modifying
    ```

### Phased Execution

```bash
# Phase 1: Icons only
node src/scripts/migrate-weapon-pack.mjs --icons-only

# Phase 2: Two-handed flags
node src/scripts/migrate-weapon-pack.mjs --two-handed

# Phase 3: Sources
node src/scripts/migrate-weapon-pack.mjs --sources

# Phase 4: Craftsmanship (creates new files)
node src/scripts/migrate-weapon-pack.mjs --craftsmanship

# Phase 5: All at once (full cleanup)
node src/scripts/migrate-weapon-pack.mjs
```

### Spot Checks (Manual Verification)

After running script, manually verify:

**Icons**:

- [x] 10 random weapons have icon paths matching class+type
- [x] No weapons still have `icons/svg/sword.svg` (unless intentional fallback)

**twoHanded**:

- [x] All 128 heavy weapons → `twoHanded: true`
- [x] 20 random basic weapons → `twoHanded: true` (except Astartes/flamers)
- [x] All 144 pistols → `twoHanded: false`
- [x] "Great Weapon" → `twoHanded: true`
- [x] Standard chainsword → `twoHanded: false`

**Craftsmanship**:

- [x] BEST_QUALITY_LIST items have `[Best Quality]` variants created
- [x] Original common versions still exist
- [x] New files have unique `_id` fields
- [x] Cost increased appropriately (2x for best, 5x for master)

**Sources**:

- [x] 20 random weapons have format `{Abbrev}: {Title}` or `{Abbrev}: {Title} p.{page}`
- [x] "ChatGPT" entries converted to "Homebrew"
- [x] No empty source fields

**Proficiency**:

- [x] All weapons have `requiredTraining` field (even if empty)
- [x] No weapons have `proficiency` field

### Foundry Load Test

```bash
# After migration, rebuild compendiums
npm run build

# Launch Foundry, open world
# Open Compendiums → RT Items (Weapons)
# Check:
#   - All weapons load without errors
#   - Icons display correctly (or fallback gracefully)
#   - Craftsmanship variants appear
#   - twoHanded flag shows on sheet
#   - Source displays in info tab
```

### Automated Tests (Future Enhancement)

```javascript
// test/weapon-pack-integrity.test.mjs
describe('Weapon Pack Data Integrity', () => {
  it('should have valid icon paths for all weapons', () => { ... });
  it('should have twoHanded=true for all heavy weapons', () => { ... });
  it('should have standardized source format', () => { ... });
  it('should have no proficiency field', () => { ... });
});
```

---

## 8. Rollback Strategy

### Backup Restoration

```bash
# If something goes wrong, restore from backup:
rm -rf src/packs/rt-items-weapons/_source/*
cp -r backups/weapons-{timestamp}/* src/packs/rt-items-weapons/_source/
npm run build
```

### Git Rollback

```bash
# If committed to git but need to undo:
git log --oneline src/packs/rt-items-weapons/_source/ | head -5
git revert {commit-hash}
```

### Partial Rollback

```bash
# If only craftsmanship variants need removal:
rm src/packs/rt-items-weapons/_source/*-best_*.json
rm src/packs/rt-items-weapons/_source/*-good_*.json
rm src/packs/rt-items-weapons/_source/*-poor_*.json
rm src/packs/rt-items-weapons/_source/*-master_*.json
```

---

## 9. Success Criteria

**This cleanup is successful when**:

- [x] All 1,093 base weapons have appropriate icon paths (even if assets don't exist yet)
- [x] ~150 new craftsmanship variant files created (best/good/poor/master)
- [x] ~600 weapons have `twoHanded: true` (heavy + basic + great melee)
- [x] All weapons have standardized source format
- [x] Zero weapons have `proficiency` field, all have `requiredTraining`
- [x] All weapons pass schema validation
- [x] Foundry loads all weapons without errors
- [x] Migration report shows zero critical errors
- [x] Backup exists and is valid

---

## 10. Future Enhancements (Out of Scope)

**NOT included in this cleanup, but could be done later**:

1. **Icon Asset Creation** - Actually create the SVG/PNG icon files
2. **requiredTraining Population** - Auto-populate training requirements based on type
3. **Duplicate Description Cleanup** - Remove redundancy between `description.value` and `notes`
4. **Cost Balancing** - Review and standardize weapon costs
5. **Special Qualities Audit** - Ensure all special qualities are valid and consistent
6. **Ammunition Type Linking** - Link `clip.type` to ammunition compendium items
7. **Modification Integration** - Pre-populate common modifications for iconic weapons
8. **Lore Enhancement** - Expand descriptions with 40K lore

---

## 11. Estimated Execution Time

**Script Runtime**:

- Icon updates: ~5 seconds (1,093 files)
- twoHanded fixes: ~3 seconds (600 files)
- Source standardization: ~5 seconds (1,093 files)
- Craftsmanship variants: ~10 seconds (150 new files)
- Validation: ~5 seconds
- Report generation: ~2 seconds

**Total**: ~30 seconds for full run

**Manual Testing**: 30-60 minutes (spot checks, Foundry load test)

---

## 12. Dependencies

**Required**:

- Node.js 18+ (ES modules support)
- `fs`, `path` (built-in)
- Access to `src/packs/rt-items-weapons/_source/`

**Optional**:

- Git (for commit tracking)
- Foundry VTT (for load testing)

**NOT Required**:

- Icon assets (script will write paths, assets can be added later)
- Database access (works on JSON source files)

---

## Appendix A: Full Craftsmanship Lists

### BEST Quality (30 weapons)

```javascript
const BEST_QUALITY_LIST = [
    // Bolter Family (6)
    'bolt-pistol-godwyn-deaz',
    'bolter-godwyn',
    'heavy-bolter-devastator',
    'storm-bolter',
    'combi-bolter-plasma',
    'bolt-carbine-ceres',

    // Power Weapons (8)
    'power-sword',
    'power-axe',
    'power-maul',
    'thunder-hammer',
    'power-fist',
    'lightning-claws',
    'power-lance',
    'eviscerator',

    // Chain Weapons (4)
    'chainsword',
    'chainaxe',
    'chain-glaive',
    'chainblade',

    // Las Weapons (5)
    'laspistol-lucius',
    'lasgun-accatran-mk-ii',
    'long-las',
    'hot-shot-lasgun',
    'hellgun',

    // Plasma Weapons (3)
    'plasma-pistol',
    'plasma-gun',
    'plasma-cannon',

    // Special (4)
    'meltagun',
    'melta-lance',
    'inferno-pistol',
    'multi-melta',
];
```

### MASTER CRAFTED (15 weapons)

```javascript
const MASTER_CRAFTED_LIST = [
    'almaces-last-conquest',
    'ascension',
    'blade-of-the-laer',
    'fang-of-the-emperor',
    'seraphs-kiss',
    'astartes-relic-blade',
    'astartes-thunder-hammer-named', // Any with specific names
    'nemesis-force-sword',
    'frost-blade',
    'crozius-arcanum',
    'deathwatch-power-sword-named',
    'archeotech-laspistol',
    'phoenix-spear',
    'guardian-spear', // If present
    // + Any weapon with "Relic" or "Archeotech" in name (detected)
];
```

### GOOD Quality (70 weapons) - Partial List

```javascript
const GOOD_QUALITY_LIST = [
    // Autoguns (8)
    'autogun-accatran',
    'autogun-armageddon',
    'autogun-kantrael',
    'autogun-locke',
    'autogun-voss',
    'auto-carbine-zayth',
    'assault-device-cadence-spectre-autogun',
    'combat-shotgun',

    // Shotguns (6)
    'shotgun-mauler',
    'shotgun-ripper',
    'combat-shotgun',
    'assault-shotgun-skitarri-vanaheim',

    // Lasguns (10)
    'lasgun-accatran',
    'lasgun-armageddon',
    'lasgun-kantrael',
    'lasgun-lucius',
    'lasgun-ryza',
    'lasgun-triplex',
    'lasgun-voss',
    'assault-lasgun-merovech',

    // Laspistols (6)
    'laspistol-kantrael',
    'laspistol-lucius',
    'laspistol-accatran',

    // Continue for 70 total...
];
```

### POOR Quality (35 weapons)

```javascript
const POOR_QUALITY_LIST = [
    // Primitive (15)
    'club',
    'knife',
    'combat-knife', // Poor variant
    'spear',
    'axe',
    'sword',
    'hammer',
    'bow',
    'crossbow',

    // Solid Projectile (10)
    'stub-revolver',
    'autopistol',
    'autogun', // Generic poor version
    'shotgun-mauler-poor',
    'shotgun-ripper-poor',
    'hand-cannon',

    // Unreliable Special (10)
    'flamer', // Basic flamer, poor quality
    'chainsword-poor',
    'chainaxe-poor',
    // + Any weapon already with "Unreliable" quality
];
```

---

## Appendix B: Icon Asset Paths (Full List)

**Note**: These paths are placeholders. Actual icon assets will be created separately.

```
systems/rogue-trader/assets/icons/weapons/
├── melee-primitive.svg
├── melee-chain.svg
├── melee-power.svg
├── melee-force.svg
├── melee-shock.svg
├── melee-exotic.svg
├── melee-default.svg
├── pistol-las.svg
├── pistol-bolt.svg
├── pistol-plasma.svg
├── pistol-autopistol.svg
├── pistol-primitive.svg
├── pistol-exotic.svg
├── pistol-melta.svg
├── pistol-flamer.svg
├── pistol-default.svg
├── basic-lasgun.svg
├── basic-bolter.svg
├── basic-autogun.svg
├── basic-flamer.svg
├── basic-meltagun.svg
├── basic-plasma.svg
├── basic-primitive.svg
├── basic-exotic.svg
├── basic-default.svg
├── heavy-cannon.svg
├── heavy-lascannon.svg
├── heavy-bolter.svg
├── heavy-flamer.svg
├── heavy-launcher.svg
├── heavy-plasma.svg
├── heavy-multimelta.svg
├── heavy-exotic.svg
├── heavy-default.svg
├── thrown-grenade.svg
├── thrown-primitive.svg
├── thrown-exotic.svg
├── thrown-default.svg
└── exotic-default.svg
```

**Until these assets are created, the script can**:

1. Use existing Foundry icons as fallbacks
2. Map to Font Awesome icon classes
3. Use Game-Icons.net icons as temporary solution

---

## Appendix C: Sample Migration Report

**Expected output in `WEAPON_CLEANUP_REPORT.md`**:

```markdown
# Weapon Pack Data Cleanup Report

**Date**: 2026-01-20 14:32:15
**Script**: migrate-weapon-pack.mjs
**Mode**: LIVE

## Summary Statistics

- Total Weapons Processed: 1,093
- Icons Updated: 1,093
- twoHanded Flags Corrected: 623
- Sources Standardized: 1,089
- Proficiency Fields Migrated: 1,093
- Craftsmanship Variants Created: 150
    - Best Quality: 30
    - Master-Crafted: 15
    - Good Quality: 70
    - Poor Quality: 35

## Changes by Category

### Icons

- Melee Primitive: 120 weapons
- Melee Chain: 30 weapons
- Melee Power: 78 weapons
- Pistol Las: 35 weapons
- Basic Bolt: 59 weapons
- Heavy Solid-Projectile: 45 weapons
- Thrown Explosive: 77 weapons
- (... full breakdown)

### twoHanded Corrections

- Heavy weapons: 128 → TRUE
- Basic weapons (rifles): 260 → TRUE
- Basic weapons (Astartes exception): 15 → FALSE (kept)
- Melee great weapons: 40 → TRUE
- Pistols: 144 → FALSE (kept)
- Thrown: 104 → FALSE (kept)

### Source Standardization

- "Rogue Trader: Core" → "RT: Core Rulebook": 245 weapons
- "DH 2E: Enemies Beyond" → "DH2: Enemies Beyond": 87 weapons
- "ChatGPT" → "Homebrew": 23 weapons
- (... full list)

## Warnings

1. **Icon Assets Not Found**: All icon paths point to placeholder locations
    - Recommendation: Create icon assets or use fallback system

2. **Astartes Weapon Ambiguity**: 15 weapons flagged as potentially ambiguous
    - Example: "Astartes Bolter" could be one-handed or two-handed
    - Resolution: Defaulted to one-handed (Astartes strength)

3. **Homebrew Weapons**: 23 weapons sourced from ChatGPT/Homebrew
    - Recommendation: Review for balance and lore accuracy

## Errors

None

## Validation Results

✓ All weapons pass schema validation
✓ All weapon files have valid JSON
✓ All \_id fields are unique
✓ All craftsmanship modifiers applied correctly
✓ No orphaned files detected

## Files Created

150 new craftsmanship variant files:

- chainsword-best_Abc123Def456Ghi7.json
- bolt-pistol-godwyn-deaz-best_XyzAbc123Def456Gh.json
- (... full list)

## Backup Location

backups/weapons-1737396735/
```

---

## End of Plan

**Next Steps**:

1. Review and approve this plan
2. Write the actual script (`migrate-weapon-pack.mjs`)
3. Test on a subset of weapons (dry-run)
4. Execute full migration
5. Commit changes to git
6. Create RogueTraderVTT-7jb completion report
