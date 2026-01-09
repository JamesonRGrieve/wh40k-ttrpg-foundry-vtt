/**
 * Ship Weapons Pack Data Cleanup Script
 * 
 * This script cleans up ship weapon pack data:
 * 1. Removes legacy "type" field (keep only weaponType)
 * 2. Converts "-" string values to 0 for numeric fields
 * 3. Ensures hullType is array format
 * 4. Validates special field is array
 * 
 * Usage: node scripts/clean-ship-weapons.mjs [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PACK_DIR = path.join(__dirname, '../src/packs/rt-items-ship-weapons/_source');
const DRY_RUN = process.argv.includes('--dry-run');

// Statistics
let stats = {
  total: 0,
  cleaned: 0,
  errors: 0,
  changes: {
    removedType: 0,
    fixedDashes: 0,
    fixedHullType: 0,
    fixedSpecial: 0
  }
};

function cleanWeaponData(data, filename) {
  let modified = false;
  const changes = [];
  
  // 1. Remove legacy "type" field
  if (data.system.type !== undefined) {
    console.log(`  - Removing legacy "type" field: "${data.system.type}"`);
    delete data.system.type;
    modified = true;
    stats.changes.removedType++;
    changes.push('removed type field');
  }
  
  // 2. Convert "-" strings to 0 for numeric fields
  const numericFields = ['power', 'space', 'shipPoints', 'crit', 'strength'];
  for (const field of numericFields) {
    if (data.system[field] === '-' || data.system[field] === null) {
      console.log(`  - Converting ${field} from "${data.system[field]}" to 0`);
      data.system[field] = 0;
      modified = true;
      stats.changes.fixedDashes++;
      changes.push(`fixed ${field} dash`);
    }
  }
  
  // 3. Ensure hullType is array
  if (typeof data.system.hullType === 'string') {
    const original = data.system.hullType;
    data.system.hullType = [data.system.hullType.toLowerCase()];
    console.log(`  - Converting hullType from "${original}" to array:`, data.system.hullType);
    modified = true;
    stats.changes.fixedHullType++;
    changes.push('fixed hullType');
  }
  
  // 4. Ensure special is array
  if (!Array.isArray(data.system.special)) {
    if (typeof data.system.special === 'string') {
      data.system.special = data.system.special.split(',').map(s => s.trim()).filter(Boolean);
      console.log(`  - Converting special from string to array:`, data.system.special);
      modified = true;
      stats.changes.fixedSpecial++;
      changes.push('fixed special');
    } else if (data.system.special === undefined || data.system.special === null) {
      data.system.special = [];
      modified = true;
      stats.changes.fixedSpecial++;
      changes.push('initialized special');
    }
  }
  
  return { modified, changes };
}

function processFile(filename) {
  const filepath = path.join(PACK_DIR, filename);
  
  try {
    // Read file
    const raw = fs.readFileSync(filepath, 'utf8');
    const data = JSON.parse(raw);
    
    console.log(`\n📄 Processing: ${filename}`);
    console.log(`   Name: ${data.name}`);
    
    // Clean data
    const { modified, changes } = cleanWeaponData(data, filename);
    
    if (modified) {
      if (DRY_RUN) {
        console.log(`   [DRY RUN] Would modify file with changes: ${changes.join(', ')}`);
      } else {
        // Write back with pretty formatting
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2) + '\n');
        console.log(`   ✅ Cleaned: ${changes.join(', ')}`);
      }
      stats.cleaned++;
    } else {
      console.log(`   ✓ Already clean`);
    }
    
    stats.total++;
    
  } catch (error) {
    console.error(`   ❌ Error processing ${filename}:`, error.message);
    stats.errors++;
  }
}

function main() {
  console.log('🚀 Ship Weapons Pack Data Cleanup');
  console.log('==================================\n');
  
  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No files will be modified\n');
  }
  
  // Check if pack directory exists
  if (!fs.existsSync(PACK_DIR)) {
    console.error(`❌ Pack directory not found: ${PACK_DIR}`);
    process.exit(1);
  }
  
  // Get all JSON files
  const files = fs.readdirSync(PACK_DIR).filter(f => f.endsWith('.json'));
  
  if (files.length === 0) {
    console.error(`❌ No JSON files found in ${PACK_DIR}`);
    process.exit(1);
  }
  
  console.log(`Found ${files.length} weapon files\n`);
  
  // Process each file
  for (const file of files) {
    processFile(file);
  }
  
  // Print summary
  console.log('\n==================================');
  console.log('📊 Cleanup Summary');
  console.log('==================================');
  console.log(`Total files processed: ${stats.total}`);
  console.log(`Files cleaned: ${stats.cleaned}`);
  console.log(`Errors: ${stats.errors}`);
  console.log('\nChanges breakdown:');
  console.log(`  - Removed "type" fields: ${stats.changes.removedType}`);
  console.log(`  - Fixed "-" dashes: ${stats.changes.fixedDashes}`);
  console.log(`  - Fixed hullType: ${stats.changes.fixedHullType}`);
  console.log(`  - Fixed special: ${stats.changes.fixedSpecial}`);
  
  if (DRY_RUN) {
    console.log('\n💡 Run without --dry-run to apply changes');
  } else {
    console.log('\n✅ Cleanup complete!');
  }
}

// Run the script
main();
