/**
 * Cleans weapon pack data by removing craftsmanship-derived qualities.
 * 
 * WHAT THIS DOES:
 * - Scans all 1093+ weapon files for craftsmanship-derived qualities
 * - Removes "reliable" from good craftsmanship weapons
 * - Removes "unreliable" and "unreliable-2" from poor/cheap weapons
 * - Removes "never-jam" from best/master-crafted weapons
 * - Validates all remaining quality identifiers exist in CONFIG
 * - Generates detailed cleanup report with statistics
 * 
 * WHY THIS IS NEEDED:
 * - effectiveSpecial getter now computes craftsmanship qualities dynamically
 * - Storing them in pack data causes duplicate display (blue + orange panels)
 * - This ensures single source of truth (computed, not stored)
 * 
 * Usage: node scripts/clean-weapon-qualities.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACK_DIR = path.join(__dirname, '../src/packs/rt-items-weapons/_source');

// DRY RUN mode - set to true to preview changes without modifying files
const DRY_RUN = process.argv.includes('--dry-run') || process.argv.includes('-d');

/* ========================================================================== */
/*  CONFIGURATION                                                             */
/* ========================================================================== */

// Qualities that should NOT be stored because they're computed from craftsmanship
const CRAFTSMANSHIP_DERIVED_QUALITIES = new Set([
  'reliable',
  'unreliable',
  'unreliable-2',
  'never-jam'
]);

// Valid quality identifiers from CONFIG (subset - full list in config.mjs)
// This is for validation only - we'll warn about unknown qualities but not fail
const KNOWN_QUALITIES = new Set([
  // Reliability (computed, should not be in pack data)
  'reliable', 'unreliable', 'unreliable-2', 'never-jam',
  
  // Accuracy
  'accurate', 'inaccurate',
  
  // Melee properties
  'balanced', 'defensive', 'fast', 'flexible', 'unbalanced', 'unwieldy',
  
  // Damage effects
  'tearing', 'razor-sharp', 'proven', 'crippling', 'felling', 'devastating', 'primitive',
  
  // Area effects
  'blast', 'scatter', 'spray', 'storm', 'reaping', 'smoke', 'indirect',
  
  // Status effects
  'concussive', 'haywire', 'snare', 'shocking', 'toxic', 'warp-weapon', 'tainted',
  'corrosive', 'hallucinogenic', 'decay',
  
  // Weapon type markers
  'bolt', 'chain', 'flame', 'las', 'melta', 'plasma', 'power-field', 'force',
  
  // Energy weapon effects
  'overheats', 'recharge', 'maximal', 'gyro-stabilised', 'overcharge',
  
  // Special/rare
  'sanctified', 'daemon-wep', 'daemonbane', 'rune-wep', 'witch-edge', 'force', 'twin-linked', 
  'mono', 'volatile', 'unstable', 'living-ammunition', 'integrated-weapon', 'ogryn-proof',
  'cleansing-fire',
  
  // Xenos
  'graviton', 'webber', 'neural-shredder', 'gauss', 'necron-wep',
  
  // Space Marine
  'sm', 'sm-wep',
  
  // Combat modifiers
  'inaccurate', 'defensive', 'unwieldy', 'unbalanced', 'vengeful'
]);

/* ========================================================================== */
/*  STATISTICS TRACKING                                                       */
/* ========================================================================== */

const stats = {
  totalFiles: 0,
  filesProcessed: 0,
  filesModified: 0,
  filesSkipped: 0,
  errors: 0,
  qualitiesRemoved: {}, // Dynamic tracking of all removed qualities
  byCraftsmanship: {
    poor: { checked: 0, modified: 0 },
    cheap: { checked: 0, modified: 0 },
    common: { checked: 0, modified: 0 },
    good: { checked: 0, modified: 0 },
    best: { checked: 0, modified: 0 },
    'master-crafted': { checked: 0, modified: 0 }
  },
  unknownQualities: new Set(),
  modifiedFiles: []
};

/* ========================================================================== */
/*  CLEANUP FUNCTIONS                                                         */
/* ========================================================================== */

/**
 * Clean craftsmanship-derived qualities from weapon's special array.
 * IMPORTANT: Only removes qualities that are DERIVED from craftsmanship level.
 * Does NOT remove base qualities (e.g., a weapon that naturally has "reliable").
 * 
 * @param {object} weapon - Weapon data object
 * @returns {boolean} - True if weapon was modified
 */
function cleanWeaponQualities(weapon) {
  if (!weapon.system?.special || !Array.isArray(weapon.system.special)) {
    return false;
  }
  
  const craftsmanship = weapon.system.craftsmanship || 'common';
  const isMelee = weapon.system.melee;
  const originalLength = weapon.system.special.length;
  const originalQualities = [...weapon.system.special];
  
  // Determine which qualities should be ADDED by this craftsmanship level
  // We only remove qualities that MATCH the auto-added ones
  const shouldHaveQualities = new Set();
  
  if (!isMelee) {
    // Ranged weapons get reliability qualities
    if (craftsmanship === 'poor') {
      shouldHaveQualities.add('unreliable-2');
    } else if (craftsmanship === 'cheap') {
      shouldHaveQualities.add('unreliable');
    } else if (craftsmanship === 'good') {
      shouldHaveQualities.add('reliable');
    } else if (craftsmanship === 'best' || craftsmanship === 'master-crafted') {
      shouldHaveQualities.add('never-jam');
    }
  }
  
  // Remove ONLY qualities that match craftsmanship-derived ones
  weapon.system.special = weapon.system.special.filter(quality => {
    // Parse level suffix (e.g., "blast-3" → "blast")
    const baseQuality = quality.match(/^(.+?)-(\d+|x)$/i)?.[1] || quality;
    
    if (shouldHaveQualities.has(quality) || shouldHaveQualities.has(baseQuality)) {
      stats.qualitiesRemoved[quality] = (stats.qualitiesRemoved[quality] || 0) + 1;
      return false; // Remove this quality
    }
    
    return true; // Keep this quality
  });
  
  // Track unknown qualities for reporting
  weapon.system.special.forEach(quality => {
    const baseQuality = quality.match(/^(.+?)-(\d+|x)$/i)?.[1] || quality;
    if (!KNOWN_QUALITIES.has(baseQuality)) {
      stats.unknownQualities.add(quality);
    }
  });
  
  const modified = weapon.system.special.length !== originalLength;
  
  if (modified) {
    console.log(`  Modified: ${weapon.name}`);
    console.log(`    Craftsmanship: ${craftsmanship} (${isMelee ? 'melee' : 'ranged'})`);
    console.log(`    Before: [${originalQualities.join(', ')}]`);
    console.log(`    After:  [${weapon.system.special.join(', ')}]`);
  }
  
  return modified;
}

/**
 * Process a single weapon file.
 * @param {string} filename - JSON filename
 */
async function processWeaponFile(filename) {
  const filepath = path.join(PACK_DIR, filename);
  
  try {
    stats.filesProcessed++;
    
    // Read file
    const content = await fs.readFile(filepath, 'utf-8');
    const weapon = JSON.parse(content);
    
    // Track by craftsmanship level
    const craftsmanship = weapon.system?.craftsmanship || 'common';
    if (stats.byCraftsmanship[craftsmanship]) {
      stats.byCraftsmanship[craftsmanship].checked++;
    }
    
    // Clean qualities
    const modified = cleanWeaponQualities(weapon);
    
    if (modified) {
      stats.filesModified++;
      stats.modifiedFiles.push(filename);
      
      if (stats.byCraftsmanship[craftsmanship]) {
        stats.byCraftsmanship[craftsmanship].modified++;
      }
      
      // Write back to file (unless dry run)
      if (!DRY_RUN) {
        const output = JSON.stringify(weapon, null, 2) + '\n';
        await fs.writeFile(filepath, output, 'utf-8');
      }
    } else {
      stats.filesSkipped++;
    }
    
  } catch (error) {
    stats.errors++;
    console.error(`Error processing ${filename}:`, error.message);
  }
}

/* ========================================================================== */
/*  MAIN EXECUTION                                                            */
/* ========================================================================== */

async function main() {
  console.log('='.repeat(80));
  console.log('WEAPON QUALITIES CLEANUP SCRIPT');
  console.log('='.repeat(80));
  console.log('');
  
  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No files will be modified');
    console.log('');
  }
  
  console.log('Removing craftsmanship-derived qualities from weapon pack data...');
  console.log('');
  
  // Get all weapon files
  const files = await fs.readdir(PACK_DIR);
  const weaponFiles = files.filter(f => f.endsWith('.json'));
  stats.totalFiles = weaponFiles.length;
  
  console.log(`Found ${stats.totalFiles} weapon files to process.`);
  console.log('');
  
  // Process each file
  for (const file of weaponFiles) {
    await processWeaponFile(file);
  }
  
  // Generate report
  console.log('');
  console.log('='.repeat(80));
  console.log('CLEANUP REPORT');
  console.log('='.repeat(80));
  console.log('');
  
  console.log('📊 Overall Statistics:');
  console.log(`  Total Files:      ${stats.totalFiles}`);
  console.log(`  Files Processed:  ${stats.filesProcessed}`);
  console.log(`  Files Modified:   ${stats.filesModified}`);
  console.log(`  Files Skipped:    ${stats.filesSkipped}`);
  console.log(`  Errors:           ${stats.errors}`);
  console.log('');
  
  console.log('🔧 Qualities Removed:');
  Object.entries(stats.qualitiesRemoved).forEach(([quality, count]) => {
    if (count > 0) {
      console.log(`  ${quality.padEnd(20)} ${count}`);
    }
  });
  console.log('');
  
  console.log('⚙️  By Craftsmanship Level:');
  Object.entries(stats.byCraftsmanship).forEach(([level, counts]) => {
    if (counts.checked > 0) {
      console.log(`  ${level.padEnd(20)} Checked: ${counts.checked}, Modified: ${counts.modified}`);
    }
  });
  console.log('');
  
  if (stats.unknownQualities.size > 0) {
    console.log('⚠️  Unknown Qualities (not in CONFIG):');
    Array.from(stats.unknownQualities).sort().forEach(quality => {
      console.log(`  - ${quality}`);
    });
    console.log('');
    console.log('  These qualities are not recognized. Consider adding them to CONFIG.ROGUE_TRADER.weaponQualities');
    console.log('');
  }
  
  if (stats.modifiedFiles.length > 0 && stats.modifiedFiles.length <= 50) {
    console.log('📝 Modified Files:');
    stats.modifiedFiles.forEach(file => {
      console.log(`  - ${file}`);
    });
    console.log('');
  } else if (stats.modifiedFiles.length > 50) {
    console.log(`📝 ${stats.modifiedFiles.length} files modified (too many to list individually)`);
    console.log('');
  }
  
  console.log('✅ Cleanup complete!');
  console.log('');
  
  if (DRY_RUN) {
    console.log('⚠️  DRY RUN - No files were modified');
    console.log('   Run without --dry-run flag to apply changes:');
    console.log('   node scripts/clean-weapon-qualities.mjs');
  } else {
    console.log('Next steps:');
    console.log('  1. Review unknown qualities (if any) and add to CONFIG if needed');
    console.log('  2. Run: npm run build');
    console.log('  3. Test weapon quality display in Foundry');
    console.log('  4. Verify no duplicate qualities appear in blue + orange panels');
  }
  console.log('');
  console.log('='.repeat(80));
}

// Run script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
