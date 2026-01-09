#!/usr/bin/env node
/**
 * Migrate all armour customisation pack entries to modern V13 schema.
 * 
 * This script:
 * - Converts armourTypes string → restrictions.armourTypes array
 * - Converts armourModifier → modifiers.armourPoints
 * - Converts maxDexBonus → modifiers.maxAgility
 * - Converts weight string → modifiers.weight number
 * - Extracts AP/Agility from effect text when fields are empty
 * - Removes unused modifiers.characteristics and modifiers.skills
 * 
 * Run with: node scripts/migrate-armour-customisations.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PACK_DIR = path.join(__dirname, '..', 'src', 'packs', 'rt-items-armour-customisations', '_source');
const BACKUP_DIR = path.join(__dirname, '..', 'src', 'packs', 'rt-items-armour-customisations', '_source.backup-' + Date.now());

// Statistics
let stats = {
  total: 0,
  migrated: 0,
  errors: 0,
  skipped: 0,
  apExtracted: 0,
  agilityExtracted: 0,
  restrictionsParsed: 0,
  weightParsed: 0
};

/**
 * Parse armour types string into array of standardized keys.
 * @param {string} str - Raw armour types string from pack data
 * @returns {string[]} Array of standardized armour type keys
 */
function parseArmourTypes(str) {
  if (!str || typeof str !== 'string') return ['any'];
  
  const normalized = str.toLowerCase();
  const types = [];
  
  // Check for "any" patterns
  if ((normalized.includes('any armour') || normalized.includes('any armor')) && !normalized.includes('except')) {
    return ['any'];
  }
  
  // Map common type names to standardized keys
  const typeMap = {
    'flak': 'flak',
    'mesh': 'mesh',
    'carapace': 'carapace',
    'power armour': 'power',
    'power armor': 'power',
    'power': 'power',
    'light-power': 'light-power',
    'light power': 'light-power',
    'storm trooper': 'storm-trooper',
    'storm-trooper': 'storm-trooper',
    'feudal': 'feudal-world',
    'primitive': 'primitive',
    'xenos': 'xenos',
    'void': 'void',
    'enforcer': 'enforcer',
    'hostile environment': 'hostile-environment'
  };
  
  for (const [key, value] of Object.entries(typeMap)) {
    if (normalized.includes(key)) {
      if (!types.includes(value)) types.push(value);
    }
  }
  
  // Handle special cases
  if (normalized.includes('helmet')) {
    types.push('helmet');
  }
  if (normalized.includes('non-primitive')) {
    types.push('non-primitive');
  }
  
  stats.restrictionsParsed++;
  return types.length > 0 ? types : ['any'];
}

/**
 * Parse weight string into numeric value.
 * @param {string|number} str - Weight string like "+1.5kg" or "0kg"
 * @returns {number} Numeric weight value
 */
function parseWeight(str) {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  
  // Handle special cases
  if (str.includes('wep')) return 0; // Variable weight (weapon weight)
  
  // Extract numeric value from strings like "+1.5kg", "0kg", "+15kg"
  const match = str.match(/[+-]?\d+\.?\d*/);
  if (match) {
    stats.weightParsed++;
    return parseFloat(match[0]);
  }
  
  return 0;
}

/**
 * Extract AP modifier from effect text.
 * @param {string} effect - Effect description text
 * @returns {number|null} AP modifier value or null if not found
 */
function extractAPModifier(effect) {
  if (!effect || typeof effect !== 'string') return null;
  
  // Look for patterns like "+5 AP", "Gain +3 AP", "add +2 AP"
  const patterns = [
    /(?:gain|add|gives?)\s*\+(\d+)\s*AP/i,
    /\+(\d+)\s*AP/i,
    /(?:increase|boost).*?(?:by|of)\s*\+?(\d+)\s*AP/i
  ];
  
  for (const pattern of patterns) {
    const match = effect.match(pattern);
    if (match) {
      stats.apExtracted++;
      return parseInt(match[1]);
    }
  }
  
  return null;
}

/**
 * Extract Agility modifier from effect text.
 * @param {string} effect - Effect description text
 * @returns {number|null} Agility modifier value or null if not found
 */
function extractAgilityModifier(effect) {
  if (!effect || typeof effect !== 'string') return null;
  
  // Look for "-5 max agility", "-10 to Agility", "+5 agility", etc.
  const patterns = [
    /([+-]\d+)\s*max\s*ag(?:ility)?/i,
    /([+-]\d+)\s*to.*agility/i,
    /agility.*?([+-]\d+)/i,
    /([+-]\d+).*?agility/i
  ];
  
  for (const pattern of patterns) {
    const match = effect.match(pattern);
    if (match) {
      stats.agilityExtracted++;
      return parseInt(match[1]);
    }
  }
  
  return null;
}

/**
 * Migrate a single armour customisation entry.
 * @param {object} data - Entry data
 * @returns {object} Migrated data
 */
function migrateEntry(data) {
  const migrated = JSON.parse(JSON.stringify(data)); // Deep clone
  const system = migrated.system;
  let changed = false;
  
  // 1. Migrate armourTypes string → restrictions.armourTypes array
  if (typeof system.armourTypes === 'string') {
    system.restrictions = system.restrictions || {};
    system.restrictions.armourTypes = parseArmourTypes(system.armourTypes);
    delete system.armourTypes;
    changed = true;
  }
  
  // 2. Initialize modifiers if not present
  if (!system.modifiers || typeof system.modifiers !== 'object') {
    system.modifiers = { armourPoints: 0, maxAgility: 0, weight: 0 };
    changed = true;
  }
  
  // 3. Migrate armourModifier → modifiers.armourPoints
  if (typeof system.armourModifier === 'number') {
    system.modifiers.armourPoints = system.armourModifier;
    delete system.armourModifier;
    changed = true;
  }
  
  // 4. Try to extract AP from effect if armourPoints is 0
  if ((!system.modifiers.armourPoints || system.modifiers.armourPoints === 0) && system.effect) {
    const extracted = extractAPModifier(system.effect);
    if (extracted !== null && extracted > 0) {
      system.modifiers.armourPoints = extracted;
      changed = true;
    }
  }
  
  // 5. Migrate maxDexBonus → modifiers.maxAgility
  if (typeof system.maxDexBonus === 'number') {
    system.modifiers.maxAgility = system.maxDexBonus;
    delete system.maxDexBonus;
    changed = true;
  }
  
  // 6. Try to extract Agility from effect if maxAgility is 0
  if ((!system.modifiers.maxAgility || system.modifiers.maxAgility === 0) && system.effect) {
    const extracted = extractAgilityModifier(system.effect);
    if (extracted !== null && extracted !== 0) {
      system.modifiers.maxAgility = extracted;
      changed = true;
    }
  }
  
  // 7. Migrate weight string → modifiers.weight number
  if (typeof system.weight === 'string') {
    system.modifiers.weight = parseWeight(system.weight);
    delete system.weight;
    changed = true;
  }
  
  // 8. Clean up unused modifiers fields
  if (system.modifiers?.characteristics) {
    delete system.modifiers.characteristics;
    changed = true;
  }
  if (system.modifiers?.skills) {
    delete system.modifiers.skills;
    changed = true;
  }
  
  // 9. Initialize empty arrays for properties if not present
  if (!system.addedProperties) {
    system.addedProperties = [];
    changed = true;
  }
  if (!system.removedProperties) {
    system.removedProperties = [];
    changed = true;
  }
  
  // 10. Ensure restrictions exists
  if (!system.restrictions) {
    system.restrictions = { armourTypes: ['any'] };
    changed = true;
  }
  
  // 11. Ensure modifiers exists with all fields
  if (!system.modifiers.armourPoints) system.modifiers.armourPoints = 0;
  if (!system.modifiers.maxAgility) system.modifiers.maxAgility = 0;
  if (!system.modifiers.weight) system.modifiers.weight = 0;
  
  return { data: migrated, changed };
}

/**
 * Process all files in the pack directory.
 */
function migrateAllEntries() {
  console.log('🛡️  Armour Customisations Migration Script');
  console.log('==========================================\n');
  
  // Check if pack directory exists
  if (!fs.existsSync(PACK_DIR)) {
    console.error(`❌ Pack directory not found: ${PACK_DIR}`);
    process.exit(1);
  }
  
  // Create backup
  console.log(`📦 Creating backup at: ${BACKUP_DIR}`);
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  
  // Get all JSON files
  const files = fs.readdirSync(PACK_DIR).filter(f => f.endsWith('.json'));
  stats.total = files.length;
  
  console.log(`📄 Found ${files.length} customisation entries\n`);
  console.log('Processing...\n');
  
  for (const file of files) {
    const filePath = path.join(PACK_DIR, file);
    const backupPath = path.join(BACKUP_DIR, file);
    
    try {
      // Read entry
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      // Backup original
      fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));
      
      // Migrate
      const { data: migrated, changed } = migrateEntry(data);
      
      if (changed) {
        // Write migrated data
        fs.writeFileSync(filePath, JSON.stringify(migrated, null, 2));
        console.log(`✅ ${data.name}`);
        stats.migrated++;
      } else {
        console.log(`⏭️  ${data.name} (already migrated)`);
        stats.skipped++;
      }
      
    } catch (err) {
      console.error(`❌ Error processing ${file}: ${err.message}`);
      stats.errors++;
    }
  }
  
  // Print summary
  console.log('\n==========================================');
  console.log('📊 Migration Summary');
  console.log('==========================================\n');
  console.log(`Total entries:        ${stats.total}`);
  console.log(`Migrated:             ${stats.migrated}`);
  console.log(`Already migrated:     ${stats.skipped}`);
  console.log(`Errors:               ${stats.errors}`);
  console.log('');
  console.log('Extraction Statistics:');
  console.log(`  AP extracted:       ${stats.apExtracted}`);
  console.log(`  Agility extracted:  ${stats.agilityExtracted}`);
  console.log(`  Restrictions parsed: ${stats.restrictionsParsed}`);
  console.log(`  Weight parsed:      ${stats.weightParsed}`);
  console.log('');
  
  if (stats.errors > 0) {
    console.log('⚠️  Migration completed with errors');
    console.log(`Backup saved at: ${BACKUP_DIR}`);
    process.exit(1);
  } else {
    console.log('✅ Migration completed successfully!');
    console.log(`Backup saved at: ${BACKUP_DIR}`);
    process.exit(0);
  }
}

// Run migration
migrateAllEntries();
