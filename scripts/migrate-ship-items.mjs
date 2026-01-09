#!/usr/bin/env node

/**
 * Ship Items Migration Script
 * 
 * Migrates ship components and weapons from legacy field structure to V13 DataModel schema.
 * 
 * WHAT THIS FIXES:
 * - Field name mismatches (powerUsage → power.used/generated, spaceUsage → space, spCost → shipPoints)
 * - Type field collision (type → componentType/weaponType)
 * - Hull type format (string → Set array)
 * - Missing fields (condition, essential, special)
 * - Power generation display (negative powerUsage → power.generated)
 * 
 * USAGE:
 *   node scripts/migrate-ship-items.mjs [--dry-run] [--components] [--weapons] [--verbose]
 * 
 * OPTIONS:
 *   --dry-run     Preview changes without writing files
 *   --components  Only migrate ship components
 *   --weapons     Only migrate ship weapons
 *   --verbose     Show detailed migration info for each item
 * 
 * EXAMPLES:
 *   node scripts/migrate-ship-items.mjs --dry-run --verbose
 *   node scripts/migrate-ship-items.mjs --components
 *   node scripts/migrate-ship-items.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
const COMPONENTS_ONLY = args.includes('--components');
const WEAPONS_ONLY = args.includes('--weapons');

// Paths
const COMPONENTS_DIR = path.join(__dirname, '../src/packs/rt-items-ship-components/_source');
const WEAPONS_DIR = path.join(__dirname, '../src/packs/rt-items-ship-weapons/_source');
const BACKUP_DIR = path.join(__dirname, '../src/packs/_backups/ship-items-' + Date.now());

// Statistics
const stats = {
  components: { total: 0, migrated: 0, skipped: 0, errors: 0 },
  weapons: { total: 0, migrated: 0, skipped: 0, errors: 0 },
  warnings: []
};

/**
 * Component type mapping from legacy strings to enum keys
 */
const COMPONENT_TYPE_MAP = {
  // Essential components (with prefix)
  '(es.) bridge': 'bridge',
  '(es.) plasma drive': 'plasmaDrive',
  '(es.) warp drive': 'warpDrive',
  '(es.) gellar field': 'gellarField',
  '(es.) void shield': 'voidShields',
  '(es.) life sustainer': 'lifeSupport',
  '(es.) crew quarters': 'quarters',
  '(es.) augur array': 'auger',
  
  // Supplemental (no prefix)
  'bridge': 'bridge',
  'plasma drive': 'plasmaDrive',
  'warp drive': 'warpDrive',
  'gellar field': 'gellarField',
  'void shield': 'voidShields',
  'life sustainer': 'lifeSupport',
  'crew quarters': 'quarters',
  'augur array': 'auger',
  'auger': 'auger',
  'life support': 'lifeSupport',
  'quarters': 'quarters',
  'augment': 'augment',
  'supplemental': 'supplemental',
  'weapons': 'weapons',
  'generatorum': 'generatorum',
  'archeotech': 'archeotech',
  'xenotech': 'xenotech'
};

/**
 * Weapon type mapping from legacy strings to enum keys
 */
const WEAPON_TYPE_MAP = {
  'macrocannon': 'macrobattery',
  'macrobattery': 'macrobattery',
  'lance': 'lance',
  'lance weapon': 'lance',
  'torpedo': 'torpedo',
  'torpedo tubes': 'torpedo',
  'nova cannon': 'nova-cannon',
  'bombardment cannon': 'bombardment-cannon',
  'landing bay': 'landing-bay',
  'attack craft': 'attack-craft'
};

/**
 * Hull type normalization patterns
 */
const HULL_TYPE_PATTERNS = [
  { pattern: /all\s*ships?/i, key: 'all' },
  { pattern: /transport/i, key: 'transport' },
  { pattern: /raider/i, key: 'raider' },
  { pattern: /frigate/i, key: 'frigate' },
  { pattern: /light[- ]?cruiser/i, key: 'light-cruiser' },
  { pattern: /battle[- ]?cruiser/i, key: 'battlecruiser' },
  { pattern: /grand[- ]?cruiser/i, key: 'grand-cruiser' },
  { pattern: /cruiser/i, key: 'cruiser' }
];

/**
 * Parse hull type string into array of normalized enum keys
 */
function parseHullType(hullTypeStr) {
  if (!hullTypeStr || typeof hullTypeStr !== 'string') {
    return ['all'];
  }
  
  const types = new Set();
  const str = hullTypeStr.toLowerCase();
  
  for (const { pattern, key } of HULL_TYPE_PATTERNS) {
    if (pattern.test(str)) {
      types.add(key);
    }
  }
  
  return types.size > 0 ? Array.from(types) : ['all'];
}

/**
 * Parse component type from legacy string
 */
function parseComponentType(typeStr) {
  if (!typeStr || typeof typeStr !== 'string') {
    return { componentType: 'supplemental', essential: false };
  }
  
  const lowerType = typeStr.toLowerCase().trim();
  const essential = lowerType.startsWith('(es.)');
  
  // Remove (es.) prefix if present
  const cleanType = lowerType.replace(/^\(es\.\)\s*/, '');
  
  // Map to enum key
  const componentType = COMPONENT_TYPE_MAP[cleanType] || 
                       COMPONENT_TYPE_MAP[lowerType] || 
                       'supplemental';
  
  return { componentType, essential };
}

/**
 * Parse weapon type from legacy string
 */
function parseWeaponType(typeStr) {
  if (!typeStr || typeof typeStr !== 'string') {
    return 'macrobattery';
  }
  
  const lowerType = typeStr.toLowerCase().trim();
  return WEAPON_TYPE_MAP[lowerType] || 'macrobattery';
}

/**
 * Migrate ship component data
 */
function migrateComponent(component) {
  const migrated = { ...component };
  const system = { ...migrated.system };
  const changes = [];
  
  // 1. Rename type → componentType
  if ('type' in system && !system.componentType) {
    const parsed = parseComponentType(system.type);
    system.componentType = parsed.componentType;
    system.essential = parsed.essential;
    delete system.type;
    changes.push(`type → componentType: "${system.componentType}" (essential: ${system.essential})`);
  }
  
  // 2. Rename powerUsage → power.used/generated
  if ('powerUsage' in system && !system.power) {
    const usage = system.powerUsage;
    system.power = {
      used: usage >= 0 ? usage : 0,
      generated: usage < 0 ? Math.abs(usage) : 0
    };
    delete system.powerUsage;
    changes.push(`powerUsage → power: { used: ${system.power.used}, generated: ${system.power.generated} }`);
  }
  
  // 3. Rename spaceUsage → space
  if ('spaceUsage' in system && !system.space) {
    system.space = system.spaceUsage;
    delete system.spaceUsage;
    changes.push(`spaceUsage → space: ${system.space}`);
  }
  
  // 4. Rename spCost → shipPoints
  if ('spCost' in system && !system.shipPoints) {
    system.shipPoints = system.spCost;
    delete system.spCost;
    changes.push(`spCost → shipPoints: ${system.shipPoints}`);
  }
  
  // 5. Parse hullType string → array
  if (typeof system.hullType === 'string') {
    const originalHullType = system.hullType;
    system.hullType = parseHullType(system.hullType);
    changes.push(`hullType: "${originalHullType}" → [${system.hullType.map(h => `"${h}"`).join(', ')}]`);
  }
  
  // 6. Ensure modifiers has all fields
  if (system.modifiers && typeof system.modifiers === 'object') {
    const defaults = {
      speed: 0,
      manoeuvrability: 0,
      detection: 0,
      armour: 0,
      hullIntegrity: 0,
      turretRating: 0,
      voidShields: 0,
      morale: 0,
      crewRating: 0
    };
    
    const oldModifiers = { ...system.modifiers };
    system.modifiers = { ...defaults, ...system.modifiers };
    
    // Check for new fields
    const addedFields = [];
    for (const key of ['voidShields', 'morale', 'crewRating']) {
      if (!(key in oldModifiers)) {
        addedFields.push(key);
      }
    }
    if (addedFields.length > 0) {
      changes.push(`modifiers: added fields [${addedFields.join(', ')}]`);
    }
  }
  
  // 7. Add condition if missing
  if (!system.condition) {
    system.condition = 'functional';
    changes.push(`condition: added "functional"`);
  }
  
  // 8. Add essential if missing (default false if not parsed from type)
  if (system.essential === undefined) {
    system.essential = false;
  }
  
  // 9. Preserve notes
  if (!system.notes) {
    system.notes = '';
  }
  
  // 10. Add identifier if missing
  if (!system.identifier) {
    system.identifier = component.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    changes.push(`identifier: generated "${system.identifier}"`);
  }
  
  migrated.system = system;
  
  return { migrated, changes };
}

/**
 * Migrate ship weapon data
 */
function migrateWeapon(weapon) {
  const migrated = { ...weapon };
  const system = { ...migrated.system };
  const changes = [];
  
  // 1. Rename type → weaponType (if weaponType doesn't exist)
  if ('type' in system && !system.weaponType) {
    system.weaponType = parseWeaponType(system.type);
    delete system.type;
    changes.push(`type → weaponType: "${system.weaponType}"`);
  } else if (system.weaponType) {
    // Normalize existing weaponType
    const normalized = parseWeaponType(system.weaponType);
    if (normalized !== system.weaponType) {
      system.weaponType = normalized;
      changes.push(`weaponType: normalized to "${system.weaponType}"`);
    }
  }
  
  // 2. Rename powerUsage → power
  if ('powerUsage' in system && system.power === undefined) {
    system.power = system.powerUsage;
    delete system.powerUsage;
    changes.push(`powerUsage → power: ${system.power}`);
  }
  
  // 3. Rename spaceUsage → space
  if ('spaceUsage' in system && system.space === undefined) {
    system.space = system.spaceUsage;
    delete system.spaceUsage;
    changes.push(`spaceUsage → space: ${system.space}`);
  }
  
  // 4. Rename spCost → shipPoints
  if ('spCost' in system && system.shipPoints === undefined) {
    system.shipPoints = system.spCost;
    delete system.spCost;
    changes.push(`spCost → shipPoints: ${system.shipPoints}`);
  }
  
  // 5. Rename critRating → crit
  if ('critRating' in system && system.crit === undefined) {
    system.crit = system.critRating;
    delete system.critRating;
    changes.push(`critRating → crit: ${system.crit}`);
  }
  
  // 6. Parse hullType string → array
  if (typeof system.hullType === 'string') {
    const originalHullType = system.hullType;
    system.hullType = parseHullType(system.hullType);
    changes.push(`hullType: "${originalHullType}" → [${system.hullType.map(h => `"${h}"`).join(', ')}]`);
  }
  
  // 7. Initialize special if missing
  if (!system.special) {
    system.special = [];
    changes.push(`special: initialized to []`);
  }
  
  // 8. Preserve notes
  if (system.notes === null || system.notes === undefined) {
    system.notes = '';
  }
  
  // 9. Add identifier if missing
  if (!system.identifier) {
    system.identifier = weapon.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    changes.push(`identifier: generated "${system.identifier}"`);
  }
  
  migrated.system = system;
  
  return { migrated, changes };
}

/**
 * Process a single file
 */
function processFile(filePath, type) {
  const fileName = path.basename(filePath);
  
  try {
    // Read file
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    
    // Migrate
    const result = type === 'component' ? migrateComponent(data) : migrateWeapon(data);
    
    // Check if any changes were made
    if (result.changes.length === 0) {
      if (VERBOSE) {
        console.log(`  ⏭️  ${fileName}: Already migrated (no changes needed)`);
      }
      stats[type === 'component' ? 'components' : 'weapons'].skipped++;
      return null;
    }
    
    // Log changes
    console.log(`  ✅ ${fileName}:`);
    if (VERBOSE) {
      result.changes.forEach(change => console.log(`     - ${change}`));
    } else {
      console.log(`     ${result.changes.length} changes`);
    }
    
    stats[type === 'component' ? 'components' : 'weapons'].migrated++;
    
    return result.migrated;
    
  } catch (error) {
    console.error(`  ❌ ${fileName}: ${error.message}`);
    stats[type === 'component' ? 'components' : 'weapons'].errors++;
    stats.warnings.push({ file: fileName, error: error.message });
    return null;
  }
}

/**
 * Process all files in a directory
 */
function processDirectory(dirPath, type) {
  const typeName = type === 'component' ? 'Components' : 'Weapons';
  console.log(`\n🚢 Migrating Ship ${typeName}...`);
  console.log(`📁 Directory: ${dirPath}`);
  
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
  stats[type === 'component' ? 'components' : 'weapons'].total = files.length;
  
  console.log(`📊 Found ${files.length} items\n`);
  
  const migratedItems = [];
  
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const migrated = processFile(filePath, type);
    
    if (migrated) {
      migratedItems.push({ file, data: migrated });
    }
  }
  
  return migratedItems;
}

/**
 * Write migrated files
 */
function writeMigratedFiles(items, dirPath) {
  if (DRY_RUN) {
    console.log(`\n🔍 DRY RUN: Would write ${items.length} files to ${dirPath}`);
    return;
  }
  
  console.log(`\n💾 Writing ${items.length} migrated files...`);
  
  for (const { file, data } of items) {
    const filePath = path.join(dirPath, file);
    const content = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, content, 'utf-8');
  }
  
  console.log(`✅ Written ${items.length} files`);
}

/**
 * Create backup
 */
function createBackup() {
  if (DRY_RUN) {
    console.log(`\n🔍 DRY RUN: Would create backup at ${BACKUP_DIR}`);
    return;
  }
  
  console.log(`\n💾 Creating backup at ${BACKUP_DIR}...`);
  
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  
  if (!WEAPONS_ONLY) {
    const componentsBackup = path.join(BACKUP_DIR, 'components');
    fs.mkdirSync(componentsBackup, { recursive: true });
    
    const componentFiles = fs.readdirSync(COMPONENTS_DIR).filter(f => f.endsWith('.json'));
    for (const file of componentFiles) {
      fs.copyFileSync(
        path.join(COMPONENTS_DIR, file),
        path.join(componentsBackup, file)
      );
    }
    console.log(`  ✅ Backed up ${componentFiles.length} components`);
  }
  
  if (!COMPONENTS_ONLY) {
    const weaponsBackup = path.join(BACKUP_DIR, 'weapons');
    fs.mkdirSync(weaponsBackup, { recursive: true });
    
    const weaponFiles = fs.readdirSync(WEAPONS_DIR).filter(f => f.endsWith('.json'));
    for (const file of weaponFiles) {
      fs.copyFileSync(
        path.join(WEAPONS_DIR, file),
        path.join(weaponsBackup, file)
      );
    }
    console.log(`  ✅ Backed up ${weaponFiles.length} weapons`);
  }
}

/**
 * Print summary
 */
function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 MIGRATION SUMMARY');
  console.log('='.repeat(60));
  
  if (!WEAPONS_ONLY) {
    console.log(`\n🔧 Ship Components:`);
    console.log(`   Total:    ${stats.components.total}`);
    console.log(`   Migrated: ${stats.components.migrated}`);
    console.log(`   Skipped:  ${stats.components.skipped}`);
    console.log(`   Errors:   ${stats.components.errors}`);
  }
  
  if (!COMPONENTS_ONLY) {
    console.log(`\n⚔️  Ship Weapons:`);
    console.log(`   Total:    ${stats.weapons.total}`);
    console.log(`   Migrated: ${stats.weapons.migrated}`);
    console.log(`   Skipped:  ${stats.weapons.skipped}`);
    console.log(`   Errors:   ${stats.weapons.errors}`);
  }
  
  const totalMigrated = stats.components.migrated + stats.weapons.migrated;
  const totalErrors = stats.components.errors + stats.weapons.errors;
  
  console.log(`\n📈 Overall:`);
  console.log(`   Successfully migrated: ${totalMigrated} items`);
  console.log(`   Errors: ${totalErrors}`);
  
  if (stats.warnings.length > 0) {
    console.log(`\n⚠️  Warnings:`);
    stats.warnings.forEach(w => {
      console.log(`   - ${w.file}: ${w.error}`);
    });
  }
  
  if (DRY_RUN) {
    console.log(`\n🔍 DRY RUN MODE - No files were modified`);
    console.log(`   Remove --dry-run flag to apply changes`);
  } else {
    console.log(`\n✅ Migration complete!`);
    console.log(`   Backup created at: ${BACKUP_DIR}`);
  }
  
  console.log('='.repeat(60) + '\n');
}

/**
 * Main execution
 */
function main() {
  console.log('\n🚀 Ship Items Migration Script');
  console.log('================================\n');
  
  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - Preview only, no changes will be made\n');
  }
  
  if (COMPONENTS_ONLY) {
    console.log('📦 Mode: Components only\n');
  } else if (WEAPONS_ONLY) {
    console.log('📦 Mode: Weapons only\n');
  } else {
    console.log('📦 Mode: Components and Weapons\n');
  }
  
  // Create backup
  createBackup();
  
  // Process components
  let componentItems = [];
  if (!WEAPONS_ONLY) {
    componentItems = processDirectory(COMPONENTS_DIR, 'component');
    if (componentItems.length > 0) {
      writeMigratedFiles(componentItems, COMPONENTS_DIR);
    }
  }
  
  // Process weapons
  let weaponItems = [];
  if (!COMPONENTS_ONLY) {
    weaponItems = processDirectory(WEAPONS_DIR, 'weapon');
    if (weaponItems.length > 0) {
      writeMigratedFiles(weaponItems, WEAPONS_DIR);
    }
  }
  
  // Print summary
  printSummary();
  
  // Exit code
  const hasErrors = stats.components.errors > 0 || stats.weapons.errors > 0;
  process.exit(hasErrors ? 1 : 0);
}

// Run script
main();
