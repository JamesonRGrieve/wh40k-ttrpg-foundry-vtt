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
 *   --dry-run             Show changes without writing files
 *   --icons-only          Only update icon paths
 *   --craftsmanship-only  Only create craftsmanship variants
 *   --twoHanded-only      Only fix twoHanded flags
 *   --source-only         Only standardize sources
 *   --validate            Only validate existing data
 *   --verbose             Show detailed progress
 *   --no-backup           Skip backup creation
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

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
    craftsmanshipOnly: process.argv.includes('--craftsmanship-only'),
    twoHandedOnly: process.argv.includes('--twoHanded-only'),
    sourceOnly: process.argv.includes('--source-only'),
    validate: process.argv.includes('--validate'),
    verbose: process.argv.includes('--verbose'),
    backup: !process.argv.includes('--no-backup'),
};

// Statistics tracking
const stats = {
    totalWeapons: 0,
    iconsUpdated: 0,
    craftsmanshipVariantsCreated: {
        best: 0,
        master: 0,
        good: 0,
        poor: 0,
    },
    twoHandedCorrected: 0,
    sourcesStandardized: 0,
    proficiencyMigrated: 0,
    errors: [],
    warnings: [],
    validationIssues: [],
    iconBreakdown: {},
    twoHandedBreakdown: {},
    sourceBreakdown: {},
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

// Weapons to create BEST quality variants (by identifier patterns)
const BEST_QUALITY_PATTERNS = [
    // Bolter Family
    /bolt-pistol.*godwyn/i,
    /bolter.*godwyn/i,
    /heavy-bolter.*devastator/i,
    /storm-bolter/i,
    /combi-bolter.*plasma/i,
    /bolt-carbine.*ceres/i,

    // Power Weapons
    /^power-sword$/i,
    /^power-axe$/i,
    /^power-maul$/i,
    /thunder-hammer$/i,
    /power-fist$/i,
    /lightning-claw/i,
    /power-lance$/i,
    /eviscerator$/i,

    // Chain Weapons
    /^chainsword$/i,
    /^chainaxe$/i,
    /chain-glaive/i,
    /^chainblade$/i,

    // Las Weapons
    /laspistol.*lucius/i,
    /lasgun.*accatran.*mk.*ii/i,
    /long-las$/i,
    /hot-shot-lasgun$/i,
    /hellgun$/i,

    // Plasma Weapons
    /^plasma-pistol$/i,
    /^plasma-gun$/i,
    /^plasma-cannon$/i,

    // Special
    /^meltagun$/i,
    /melta-lance/i,
    /inferno-pistol$/i,
    /multi-melta$/i,
];

// Weapons to upgrade to MASTER CRAFTED (named/unique weapons)
const MASTER_CRAFTED_PATTERNS = [
    /almace.*last.*conquest/i,
    /ascension/i,
    /blade.*laer/i,
    /fang.*emperor/i,
    /seraph.*kiss/i,
    /relic-blade/i,
    /nemesis.*force/i,
    /frost-blade/i,
    /crozius-arcanum/i,
    /archeotech/i,
    /phoenix-spear/i,
    /guardian-spear/i,
    /relic/i, // Any weapon with "relic" in name
];

// Weapons to create GOOD quality variants
const GOOD_QUALITY_PATTERNS = [
    // Autoguns
    /autogun.*accatran/i,
    /autogun.*armageddon/i,
    /autogun.*kantrael/i,
    /autogun.*locke/i,
    /autogun.*voss/i,
    /auto-carbine/i,
    /combat-shotgun/i,

    // Shotguns
    /shotgun.*mauler/i,
    /shotgun.*ripper/i,
    /assault-shotgun/i,

    // Lasguns (non-special variants)
    /lasgun.*accatran(?!.*mk.*ii)/i,
    /lasgun.*armageddon/i,
    /lasgun.*kantrael/i,
    /lasgun.*lucius/i,
    /lasgun.*ryza/i,
    /lasgun.*triplex/i,
    /lasgun.*voss/i,
    /assault-lasgun/i,

    // Laspistols
    /laspistol.*kantrael/i,
    /laspistol.*accatran/i,

    // Standard melee
    /combat-blade/i,
    /combat-knife/i,
    /mono.*knife/i,
];

// Weapons to create POOR quality variants
const POOR_QUALITY_PATTERNS = [
    // Primitive
    /^club$/i,
    /^knife$/i,
    /^spear$/i,
    /^axe$/i,
    /^sword(?!.*power|.*chain)/i,
    /^hammer(?!.*thunder)/i,
    /^bow$/i,
    /^crossbow$/i,

    // Basic solid projectile
    /stub-revolver/i,
    /^autopistol$/i,
    /hand-cannon/i,
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
    /two[\s-]handed/i,
    /eviscerator/i,
    /thunder\s*hammer/i,
    /chain\s*great/i,
    /force\s*staff/i,
    /power\s*lance(?!.*mounted)/i, // Not if mounted
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
    'HB': 'Homebrew',
};

const BOOK_TITLE_STANDARDIZATION = {
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
    'Enemies Beyond': 'Enemies Beyond',
    'Enemies Within': 'Enemies Within',
    'Enemies Without': 'Enemies Without',
    "Inquisitor's Handbook": "Inquisitor's Handbook",
    'Rites of Battle': 'Rites of Battle',
    'Mark of the Xenos': 'Mark of the Xenos',
    'First Founding': 'First Founding',
    'Honour the Chapter': 'Honour the Chapter',
    'Errata': 'Errata',
    'Hammer of the Emperor': 'Hammer of the Emperor',
    'Shield of Humanity': 'Shield of Humanity',
    'Tome of Blood': 'Tome of Blood',
    'Tome of Decay': 'Tome of Decay',
    'Tome of Excess': 'Tome of Excess',
    'Tome of Fate': 'Tome of Fate',
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function log(message, level = 'info') {
    if (level === 'verbose' && !args.verbose) return;
    const prefix =
        {
            info: '→',
            success: '✓',
            warning: '⚠',
            error: '✗',
            verbose: '  ',
        }[level] || '→';
    console.log(`${prefix} ${message}`);
}

function generateId() {
    return randomBytes(8).toString('hex').slice(0, 16);
}

function matchesPatterns(identifier, name, patterns) {
    return patterns.some((pattern) => pattern.test(identifier) || pattern.test(name));
}

// ============================================================================
// ICON ASSIGNMENT
// ============================================================================

function getIconPath(weapon) {
    const weaponClass = weapon.system.class;
    const weaponType = weapon.system.type;
    const weaponName = weapon.name;

    // Priority 1: Exact class+type match
    const exactMatch = ICON_MAP[weaponClass]?.[weaponType];
    if (exactMatch) {
        const key = `${weaponClass}:${weaponType}`;
        stats.iconBreakdown[key] = (stats.iconBreakdown[key] || 0) + 1;
        return exactMatch;
    }

    // Priority 2: Class fallback
    const classFallback = ICON_MAP[weaponClass]?.default;
    if (classFallback) {
        const key = `${weaponClass}:default`;
        stats.iconBreakdown[key] = (stats.iconBreakdown[key] || 0) + 1;
        return classFallback;
    }

    // Priority 3: System default (shouldn't reach here)
    stats.warnings.push(`No icon mapping found for ${weaponName} (${weaponClass}:${weaponType})`);
    return 'icons/svg/sword.svg';
}

function updateIcon(weapon) {
    const oldIcon = weapon.img;
    const newIcon = getIconPath(weapon);

    if (oldIcon !== newIcon) {
        weapon.img = newIcon;
        stats.iconsUpdated++;
        log(`Updated icon: ${weapon.name} → ${newIcon}`, 'verbose');
        return true;
    }
    return false;
}

// ============================================================================
// TWO-HANDED DETECTION
// ============================================================================

function calculateTwoHanded(weapon) {
    const weaponClass = weapon.system.class;
    const weaponType = weapon.system.type;
    const identifier = weapon.system.identifier;
    const name = weapon.name;

    // Rule 1: Heavy weapons are always two-handed
    if (weaponClass === 'heavy') {
        return true;
    }

    // Rule 2: Thrown and pistol always false
    if (weaponClass === 'thrown' || weaponClass === 'pistol') {
        return false;
    }

    // Rule 3: Basic weapons - check for exceptions
    if (weaponClass === 'basic') {
        // Exception: Astartes can use basic weapons one-handed
        if (identifier.startsWith('astartes-') || name.toLowerCase().includes('astartes')) {
            return false;
        }
        // Exception: Flamers can be one-handed
        if (weaponType === 'flame') {
            return false;
        }
        // Default: basic weapons are two-handed (rifles)
        return true;
    }

    // Rule 4: Melee weapons - check name patterns
    if (weaponClass === 'melee') {
        return TWO_HANDED_MELEE_PATTERNS.some((pattern) => pattern.test(name));
    }

    // Rule 5: Exotic - check patterns
    if (weaponClass === 'exotic') {
        return TWO_HANDED_MELEE_PATTERNS.some((pattern) => pattern.test(name));
    }

    // Default: false
    return false;
}

function updateTwoHanded(weapon) {
    const oldValue = weapon.system.twoHanded;
    const newValue = calculateTwoHanded(weapon);

    if (oldValue !== newValue) {
        weapon.system.twoHanded = newValue;
        stats.twoHandedCorrected++;

        const key = `${weapon.system.class}:${newValue}`;
        stats.twoHandedBreakdown[key] = (stats.twoHandedBreakdown[key] || 0) + 1;

        log(`Updated twoHanded: ${weapon.name} → ${newValue}`, 'verbose');
        return true;
    }
    return false;
}

// ============================================================================
// SOURCE STANDARDIZATION
// ============================================================================

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
        // Try to infer from content
        if (originalSource.includes('Rogue Trader')) return 'RT: Core Rulebook';
        if (originalSource.includes('Dark Heresy 2')) return 'DH2: Core Rulebook';
        if (originalSource.includes('Dark Heresy')) return 'DH: Core Rulebook';
        if (originalSource.includes('Deathwatch')) return 'DW: Core Rulebook';
        if (originalSource.includes('Only War')) return 'OW: Core Rulebook';
        if (originalSource.includes('Black Crusade')) return 'BC: Black Crusade Core';

        // Can't parse, return as-is
        return originalSource;
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

function updateSource(weapon) {
    const oldSource = weapon.system.source || '';
    const newSource = standardizeSource(oldSource);

    if (oldSource !== newSource) {
        weapon.system.source = newSource;
        stats.sourcesStandardized++;

        const key = newSource.split(':')[0] || 'Unknown';
        stats.sourceBreakdown[key] = (stats.sourceBreakdown[key] || 0) + 1;

        log(`Updated source: ${weapon.name} → ${newSource}`, 'verbose');
        return true;
    }
    return false;
}

// ============================================================================
// PROFICIENCY MIGRATION
// ============================================================================

function migrateProficiency(weapon) {
    if ('proficiency' in weapon.system) {
        const oldValue = weapon.system.proficiency || '';
        weapon.system.requiredTraining = oldValue;
        delete weapon.system.proficiency;
        stats.proficiencyMigrated++;
        log(`Migrated proficiency: ${weapon.name}`, 'verbose');
        return true;
    }
    return false;
}

// ============================================================================
// CRAFTSMANSHIP VARIANTS
// ============================================================================

function createCraftsmanshipVariant(weapon, quality) {
    const qualityMultipliers = {
        poor: 0.5,
        good: 1.5,
        best: 2,
        master: 5,
    };

    const variant = JSON.parse(JSON.stringify(weapon)); // Deep clone

    // Update identifying fields
    const qualityLabel = quality.charAt(0).toUpperCase() + quality.slice(1);
    variant.name = `${weapon.name} [${qualityLabel} Quality]`;
    variant.system.identifier = `${weapon.system.identifier}-${quality}`;
    variant.system.craftsmanship = quality;
    variant._id = generateId();

    // Update cost
    const multiplier = qualityMultipliers[quality] || 1;
    variant.system.cost.value = Math.round(weapon.system.cost.value * multiplier);

    // Update availability (one step harder to find for better quality)
    if (quality === 'best' || quality === 'master') {
        const availabilities = ['abundant', 'plentiful', 'common', 'average', 'scarce', 'rare', 'very-rare', 'extremely-rare', 'near-unique'];
        const currentIndex = availabilities.indexOf(weapon.system.availability);
        if (currentIndex >= 0 && currentIndex < availabilities.length - 1) {
            variant.system.availability = availabilities[currentIndex + 1];
        }
    }

    return variant;
}

function shouldCreateVariant(weapon, quality) {
    const identifier = weapon.system.identifier;
    const name = weapon.name;

    // Don't create variants of already-variant weapons
    if (weapon.system.craftsmanship !== 'common') {
        return false;
    }

    // Don't create variants of already unique/named items for best/good/poor
    if ((quality === 'best' || quality === 'good' || quality === 'poor') && matchesPatterns(identifier, name, MASTER_CRAFTED_PATTERNS)) {
        return false;
    }

    switch (quality) {
        case 'best':
            return matchesPatterns(identifier, name, BEST_QUALITY_PATTERNS);
        case 'master':
            return matchesPatterns(identifier, name, MASTER_CRAFTED_PATTERNS);
        case 'good':
            return matchesPatterns(identifier, name, GOOD_QUALITY_PATTERNS);
        case 'poor':
            return matchesPatterns(identifier, name, POOR_QUALITY_PATTERNS);
        default:
            return false;
    }
}

// ============================================================================
// FILE OPERATIONS
// ============================================================================

function loadWeapons() {
    log('Loading weapons from pack...', 'info');

    if (!fs.existsSync(PACK_SOURCE_DIR)) {
        log(`Pack directory not found: ${PACK_SOURCE_DIR}`, 'error');
        process.exit(1);
    }

    const files = fs.readdirSync(PACK_SOURCE_DIR).filter((f) => f.endsWith('.json'));
    const weapons = [];

    for (const file of files) {
        const filePath = path.join(PACK_SOURCE_DIR, file);
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const weapon = JSON.parse(content);
            weapons.push({ weapon, filename: file });
        } catch (error) {
            stats.errors.push(`Failed to load ${file}: ${error.message}`);
            log(`Failed to load ${file}: ${error.message}`, 'error');
        }
    }

    return weapons;
}

function saveWeapon(weapon, filename) {
    const filePath = path.join(PACK_SOURCE_DIR, filename);
    const content = JSON.stringify(weapon, null, 2) + '\n';
    fs.writeFileSync(filePath, content, 'utf8');
}

function createBackup() {
    log('Creating backup...', 'info');

    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const files = fs.readdirSync(PACK_SOURCE_DIR);
    for (const file of files) {
        const src = path.join(PACK_SOURCE_DIR, file);
        const dest = path.join(BACKUP_DIR, file);
        fs.copyFileSync(src, dest);
    }

    log(`Backup created at: ${BACKUP_DIR}`, 'success');
}

// ============================================================================
// MAIN PROCESSING
// ============================================================================

function processWeapons(weaponData) {
    log('Processing weapons...', 'info');

    const newVariants = [];

    for (const { weapon, filename } of weaponData) {
        let modified = false;

        // Apply transformations based on flags
        if (!args.sourceOnly && !args.twoHandedOnly && !args.craftsmanshipOnly) {
            // Icons (always update unless specific flag set)
            if (updateIcon(weapon)) modified = true;
        }

        if (!args.iconsOnly && !args.sourceOnly && !args.craftsmanshipOnly) {
            // Two-handed flags
            if (updateTwoHanded(weapon)) modified = true;
        }

        if (!args.iconsOnly && !args.twoHandedOnly && !args.craftsmanshipOnly) {
            // Source standardization
            if (updateSource(weapon)) modified = true;
        }

        if (!args.iconsOnly && !args.sourceOnly && !args.twoHandedOnly && !args.craftsmanshipOnly) {
            // Proficiency migration (always do this)
            if (migrateProficiency(weapon)) modified = true;
        }

        // Craftsmanship variants
        if (!args.iconsOnly && !args.sourceOnly && !args.twoHandedOnly) {
            if (args.craftsmanshipOnly || !args.iconsOnly) {
                for (const quality of ['best', 'master', 'good', 'poor']) {
                    if (shouldCreateVariant(weapon, quality)) {
                        const variant = createCraftsmanshipVariant(weapon, quality);
                        const variantFilename = `${variant.system.identifier}_${variant._id}.json`;
                        newVariants.push({ weapon: variant, filename: variantFilename });
                        stats.craftsmanshipVariantsCreated[quality]++;
                        log(`Created ${quality} variant: ${variant.name}`, 'verbose');
                    }
                }
            }
        }

        // Save modified weapon
        if (modified && !args.dryRun) {
            saveWeapon(weapon, filename);
        }
    }

    // Save new variants
    if (newVariants.length > 0 && !args.dryRun) {
        log(`Saving ${newVariants.length} craftsmanship variants...`, 'info');
        for (const { weapon, filename } of newVariants) {
            saveWeapon(weapon, filename);
        }
    }

    return newVariants;
}

// ============================================================================
// VALIDATION
// ============================================================================

function validateWeapons(weaponData) {
    log('Validating weapons...', 'info');

    for (const { weapon } of weaponData) {
        // Check required fields
        if (!weapon._id || weapon._id.length !== 16) {
            stats.validationIssues.push(`Invalid _id: ${weapon.name}`);
        }
        if (!weapon.system.identifier) {
            stats.validationIssues.push(`Missing identifier: ${weapon.name}`);
        }
        if (!weapon.system.class) {
            stats.validationIssues.push(`Missing class: ${weapon.name}`);
        }
        if (weapon.system.proficiency !== undefined) {
            stats.validationIssues.push(`Proficiency field still exists: ${weapon.name}`);
        }
    }

    if (stats.validationIssues.length === 0) {
        log('All weapons pass validation', 'success');
    } else {
        log(`Found ${stats.validationIssues.length} validation issues`, 'warning');
    }
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateReport() {
    log('Generating report...', 'info');

    const totalCraftsmanship = Object.values(stats.craftsmanshipVariantsCreated).reduce((a, b) => a + b, 0);

    let report = `# Weapon Pack Data Cleanup Report

**Date**: ${new Date().toISOString().split('T')[0]} ${new Date().toTimeString().split(' ')[0]}
**Script**: migrate-weapon-pack.mjs
**Mode**: ${args.dryRun ? 'DRY RUN' : 'LIVE'}

## Summary Statistics

- Total Weapons Processed: ${stats.totalWeapons}
- Icons Updated: ${stats.iconsUpdated}
- twoHanded Flags Corrected: ${stats.twoHandedCorrected}
- Sources Standardized: ${stats.sourcesStandardized}
- Proficiency Fields Migrated: ${stats.proficiencyMigrated}
- Craftsmanship Variants Created: ${totalCraftsmanship}
  - Best Quality: ${stats.craftsmanshipVariantsCreated.best}
  - Master-Crafted: ${stats.craftsmanshipVariantsCreated.master}
  - Good Quality: ${stats.craftsmanshipVariantsCreated.good}
  - Poor Quality: ${stats.craftsmanshipVariantsCreated.poor}

## Icon Breakdown

`;

    // Sort icon breakdown by count
    const sortedIcons = Object.entries(stats.iconBreakdown).sort((a, b) => b[1] - a[1]);
    for (const [key, count] of sortedIcons) {
        report += `- ${key}: ${count} weapons\n`;
    }

    report += `\n## twoHanded Corrections\n\n`;
    const sortedTwoHanded = Object.entries(stats.twoHandedBreakdown).sort((a, b) => b[1] - a[1]);
    for (const [key, count] of sortedTwoHanded) {
        report += `- ${key}: ${count} weapons\n`;
    }

    report += `\n## Source Standardization\n\n`;
    const sortedSources = Object.entries(stats.sourceBreakdown).sort((a, b) => b[1] - a[1]);
    for (const [key, count] of sortedSources) {
        report += `- ${key}: ${count} weapons\n`;
    }

    report += `\n## Warnings\n\n`;
    if (stats.warnings.length === 0) {
        report += 'None\n';
    } else {
        for (const warning of stats.warnings.slice(0, 50)) {
            // Limit to 50
            report += `- ${warning}\n`;
        }
        if (stats.warnings.length > 50) {
            report += `\n... and ${stats.warnings.length - 50} more warnings\n`;
        }
    }

    report += `\n## Errors\n\n`;
    if (stats.errors.length === 0) {
        report += 'None\n';
    } else {
        for (const error of stats.errors) {
            report += `- ${error}\n`;
        }
    }

    report += `\n## Validation Results\n\n`;
    if (stats.validationIssues.length === 0) {
        report += '✓ All weapons pass validation\n';
    } else {
        for (const issue of stats.validationIssues.slice(0, 50)) {
            report += `- ${issue}\n`;
        }
        if (stats.validationIssues.length > 50) {
            report += `\n... and ${stats.validationIssues.length - 50} more issues\n`;
        }
    }

    if (args.backup && !args.dryRun) {
        report += `\n## Backup Location\n\n${BACKUP_DIR}\n`;
    }

    // Write report
    if (!args.dryRun) {
        fs.writeFileSync(REPORT_PATH, report, 'utf8');
        log(`Report saved to: ${REPORT_PATH}`, 'success');
    } else {
        console.log('\n' + '='.repeat(80));
        console.log(report);
    }
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

function main() {
    console.log('='.repeat(80));
    console.log('WEAPON PACK DATA CLEANUP');
    console.log('='.repeat(80));
    console.log(`Mode: ${args.dryRun ? 'DRY RUN (no files will be modified)' : 'LIVE'}`);
    console.log(`Backup: ${args.backup && !args.dryRun ? 'ENABLED' : 'DISABLED'}`);

    if (args.iconsOnly) console.log('Filter: Icons only');
    if (args.craftsmanshipOnly) console.log('Filter: Craftsmanship variants only');
    if (args.twoHandedOnly) console.log('Filter: twoHanded flags only');
    if (args.sourceOnly) console.log('Filter: Source standardization only');
    if (args.validate) console.log('Mode: Validation only');

    console.log('');

    try {
        // Phase 1: Backup
        if (args.backup && !args.dryRun && !args.validate) {
            createBackup();
        }

        // Phase 2: Load all weapons
        const weaponData = loadWeapons();
        stats.totalWeapons = weaponData.length;
        log(`Loaded ${weaponData.length} weapons`, 'success');

        // Phase 3: Process weapons
        if (!args.validate) {
            const variants = processWeapons(weaponData);
            if (variants.length > 0) {
                log(`Created ${variants.length} craftsmanship variants`, 'success');
            }
        }

        // Phase 4: Validate
        validateWeapons(weaponData);

        // Phase 5: Generate report
        generateReport();

        console.log('\n' + '='.repeat(80));
        console.log('CLEANUP COMPLETE');
        console.log('='.repeat(80));
        console.log(`Total weapons: ${stats.totalWeapons}`);
        console.log(`Icons updated: ${stats.iconsUpdated}`);
        console.log(`twoHanded corrected: ${stats.twoHandedCorrected}`);
        console.log(`Sources standardized: ${stats.sourcesStandardized}`);
        console.log(`Craftsmanship variants: ${Object.values(stats.craftsmanshipVariantsCreated).reduce((a, b) => a + b, 0)}`);
        console.log(`Errors: ${stats.errors.length}`);
        console.log(`Warnings: ${stats.warnings.length}`);
        console.log(`Validation issues: ${stats.validationIssues.length}`);

        if (args.dryRun) {
            console.log('\n⚠ DRY RUN - No files were modified');
        }
    } catch (error) {
        log(`Fatal error: ${error.message}`, 'error');
        console.error(error);
        process.exit(1);
    }
}

// ============================================================================
// EXECUTE
// ============================================================================

main();
