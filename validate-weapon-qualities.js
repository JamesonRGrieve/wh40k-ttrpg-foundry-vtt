/**
 * Weapon Pack Quality Validation Script
 * Compares weapon pack quality identifiers against CONFIG.weaponQualities
 */

import fs from 'fs';
import path from 'path';

// Load usage data
const usageData = JSON.parse(fs.readFileSync('weapon-qualities-usage.json', 'utf8'));

// CONFIG weaponQualities keys (extracted from config.mjs lines 672-1075)
const configQualities = [
    'accurate',
    'inaccurate',
    'reliable',
    'unreliable',
    'unreliable-2',
    'balanced',
    'defensive',
    'fast',
    'flexible',
    'unbalanced',
    'unwieldy',
    'tearing',
    'razor-sharp',
    'proven',
    'felling',
    'crippling',
    'devastating',
    'blast',
    'scatter',
    'spray',
    'storm',
    'concussive',
    'corrosive',
    'toxic',
    'hallucinogenic',
    'snare',
    'shocking',
    'shock',
    'bolt',
    'chain',
    'flame',
    'force',
    'las',
    'melta',
    'plasma',
    'power',
    'power-field',
    'primitive',
    'grenade',
    'launcher',
    'indirect',
    'haywire',
    'overheats',
    'overcharge',
    'recharge',
    'maximal',
    'sanctified',
    'tainted',
    'daemon-wep',
    'daemonbane',
    'warp-weapon',
    'witch-edge',
    'rune-wep',
    'gauss',
    'graviton',
    'necron-wep',
    'smoke',
    'living-ammunition',
    'twin-linked',
    'gyro-stabilised',
    'vengeful',
    'lance',
    'decay',
    'irradiated',
    'reactive',
    'unstable',
    'volatile',
    'integrated-weapon',
    'ogryn-proof',
    'sm-wep',
    'customised',
    'sp',
    'cleansing-fire',
    'never-jam',
];

// Qualities with levels (hasLevel: true in CONFIG)
const leveledQualities = [
    'proven',
    'felling',
    'crippling',
    'devastating',
    'blast',
    'concussive',
    'toxic',
    'hallucinogenic',
    'snare',
    'indirect',
    'haywire',
    'overcharge',
    'primitive',
    'smoke',
    'vengeful',
    'decay',
    'irradiated',
];

// Pack qualities
const packQualities = usageData.qualities;

// Results
const results = {
    totalPackQualities: packQualities.length,
    totalConfigQualities: configQualities.length,
    mismatches: [],
    typos: [],
    missingInConfig: [],
    unusedInPacks: [],
    invalidLevelFormats: [],
    validLeveled: [],
};

// Helper to extract base quality and level
function parseQuality(qualityStr) {
    const match = qualityStr.match(/^(.+?)(?:-(\d+))?$/);
    if (!match) return { base: qualityStr, level: null };
    return { base: match[1], level: match[2] ? parseInt(match[2]) : null };
}

// Validate each pack quality
for (const packQuality of packQualities) {
    // Skip placeholder
    if (packQuality === '-') {
        results.mismatches.push({
            packQuality,
            issue: 'Placeholder/invalid quality',
            usage: usageData.usage[packQuality],
        });
        continue;
    }

    const parsed = parseQuality(packQuality);

    // Check for obvious typos
    if (packQuality === 'fleble' || packQuality === 'flexibile') {
        results.typos.push({
            packQuality,
            suggestion: 'flexible',
            usage: usageData.usage[packQuality],
        });
        continue;
    }

    if (packQuality === 'unwieldty') {
        results.typos.push({
            packQuality,
            suggestion: 'unwieldy',
            usage: usageData.usage[packQuality],
        });
        continue;
    }

    if (packQuality === 'ogyryn-proof') {
        results.typos.push({
            packQuality,
            suggestion: 'ogryn-proof',
            usage: usageData.usage[packQuality],
        });
        continue;
    }

    if (packQuality === 'halluciongenic-1') {
        results.typos.push({
            packQuality,
            suggestion: 'hallucinogenic-1',
            usage: usageData.usage[packQuality],
        });
        continue;
    }

    if (packQuality === 'warp-weapon.') {
        results.typos.push({
            packQuality,
            suggestion: 'warp-weapon',
            usage: usageData.usage[packQuality],
        });
        continue;
    }

    if (packQuality === 'felling.-4') {
        results.invalidLevelFormats.push({
            packQuality,
            suggestion: 'felling-4 (remove dot)',
            usage: usageData.usage[packQuality],
        });
        continue;
    }

    // Check for unknown abbreviations
    if (packQuality === 'sm' || packQuality === 'wep') {
        results.mismatches.push({
            packQuality,
            issue: 'Ambiguous abbreviation (should be sm-wep?)',
            usage: usageData.usage[packQuality],
        });
        continue;
    }

    // Check if base quality exists in CONFIG
    if (parsed.level !== null) {
        // This is a leveled quality like "blast-3"
        if (!leveledQualities.includes(parsed.base)) {
            results.missingInConfig.push({
                packQuality,
                base: parsed.base,
                level: parsed.level,
                issue: 'Base quality not marked as leveled in CONFIG',
                usage: usageData.usage[packQuality],
            });
        } else {
            results.validLeveled.push({
                packQuality,
                base: parsed.base,
                level: parsed.level,
                usage: usageData.usage[packQuality],
            });
        }
    } else {
        // Base quality without level
        if (!configQualities.includes(packQuality)) {
            results.missingInConfig.push({
                packQuality,
                issue: 'Not found in CONFIG.weaponQualities',
                usage: usageData.usage[packQuality],
            });
        }
    }
}

// Check for CONFIG qualities never used in packs
for (const configQuality of configQualities) {
    const isUsed = packQualities.includes(configQuality) || packQualities.some((pq) => parseQuality(pq).base === configQuality);

    if (!isUsed) {
        results.unusedInPacks.push(configQuality);
    }
}

// Special case: living-ammunition-toxic is a variant
const specialVariants = packQualities.filter((q) => q === 'living-ammunition-toxic');

if (specialVariants.length > 0) {
    results.mismatches.push({
        packQuality: 'living-ammunition-toxic',
        issue: 'Variant not in CONFIG (may need separate entry or handled specially)',
        usage: usageData.usage['living-ammunition-toxic'],
    });
}

// Generate report
const report = {
    summary: {
        totalPackQualities: results.totalPackQualities,
        totalConfigQualities: results.totalConfigQualities,
        typosFound: results.typos.length,
        missingInConfig: results.missingInConfig.length,
        invalidFormats: results.invalidLevelFormats.length,
        validLeveled: results.validLeveled.length,
        unusedInPacks: results.unusedInPacks.length,
        otherMismatches: results.mismatches.length,
    },
    critical: {
        typos: results.typos,
        invalidLevelFormats: results.invalidLevelFormats,
        missingInConfig: results.missingInConfig,
        mismatches: results.mismatches,
    },
    info: {
        unusedInPacks: results.unusedInPacks,
        validLeveledSample: results.validLeveled.slice(0, 10),
    },
};

// Write detailed report
fs.writeFileSync('weapon-quality-validation-report.json', JSON.stringify(report, null, 2));

// Console summary
console.log('=== WEAPON QUALITY VALIDATION REPORT ===\n');
console.log(`Total pack qualities: ${report.summary.totalPackQualities}`);
console.log(`Total CONFIG qualities: ${report.summary.totalConfigQualities}`);
console.log(`\n--- CRITICAL ISSUES ---`);
console.log(`Typos found: ${report.summary.typosFound}`);
console.log(`Invalid formats: ${report.summary.invalidFormats}`);
console.log(`Missing in CONFIG: ${report.summary.missingInConfig}`);
console.log(`Other mismatches: ${report.summary.otherMismatches}`);
console.log(`\n--- INFO ---`);
console.log(`Valid leveled qualities: ${report.summary.validLeveled}`);
console.log(`CONFIG qualities unused in packs: ${report.summary.unusedInPacks}`);

console.log('\n\n--- TYPOS (HIGH PRIORITY) ---');
results.typos.forEach((t) => {
    console.log(`  "${t.packQuality}" → "${t.suggestion}" (used ${t.usage}x)`);
});

console.log('\n--- INVALID FORMATS ---');
results.invalidLevelFormats.forEach((i) => {
    console.log(`  "${i.packQuality}" → "${i.suggestion}" (used ${i.usage}x)`);
});

console.log('\n--- MISSING IN CONFIG ---');
results.missingInConfig.forEach((m) => {
    console.log(`  "${m.packQuality}" (used ${m.usage}x) - ${m.issue}`);
});

console.log('\n--- OTHER MISMATCHES ---');
results.mismatches.forEach((m) => {
    console.log(`  "${m.packQuality}" (used ${m.usage}x) - ${m.issue}`);
});

console.log('\n--- UNUSED IN PACKS (INFO ONLY) ---');
console.log(`  ${results.unusedInPacks.join(', ')}`);

console.log('\n\nFull report written to: weapon-quality-validation-report.json');
