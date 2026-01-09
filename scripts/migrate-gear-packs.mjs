#!/usr/bin/env node

/**
 * Gear Pack Migration Script
 * 
 * Migrates all 749 gear items from corrupted pack format to correct schema.
 * 
 * BEFORE RUNNING:
 * - Backup src/packs/rt-items-gear/_source/
 * - Review GEAR_REFACTOR_PLAN.md
 * - Test on sample items first with --dry-run
 * 
 * Usage:
 *   node scripts/migrate-gear-packs.mjs --dry-run  # Test without writing
 *   node scripts/migrate-gear-packs.mjs            # Execute migration
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Configuration
const PACK_DIR = path.join(ROOT, 'src/packs/rt-items-gear/_source');
const BACKUP_DIR = path.join(ROOT, 'src/packs/rt-items-gear/_backup');
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

// Type → Category Mapping
const TYPE_TO_CATEGORY = {
  'Tool - Device': 'tools',
  'Tool - Handheld': 'tools',
  'Tool - Misc': 'tools',
  'Tool - Worn': 'tools',
  'Tool - Structure': 'tools',
  'Tool - Tome': 'tools',
  'Tool - Astartes': 'tools',
  'Tool - Infantry Gear': 'survival',
  'Consumable': 'consumable',
  'Drug': 'drugs',
  'Clothing': 'clothing',
  'Clothing (Astartes)': 'clothing',
  'Cybernetic': 'tech',
  'Service': 'general',
  'Medal': 'general',
  'Familiar': 'tech',
  'Poison': 'drugs',
  'Disease': 'consumable',
  'exotic': 'luxury',
  'xenos': 'luxury'
};

// Availability Normalization
const NORMALIZE_AVAILABILITY = {
  'Ubiquitous': 'ubiquitous',
  'Abundant': 'abundant',
  'Plentiful': 'plentiful',
  'Common': 'common',
  'Average': 'average',
  'Scarce': 'scarce',
  'Rare': 'rare',
  'Very Rare': 'very-rare',
  'Extremely Rare': 'extremely-rare',
  'Near Unique': 'near-unique',
  'Unique': 'unique',
  'Special': 'average',
  'Initiated': 'average'
};

// Statistics
const stats = {
  total: 0,
  migrated: 0,
  errors: 0,
  warnings: [],
  byCategory: {}
};

/**
 * Parse weight string to number
 * @param {string} weightStr - Weight string like "1.5kg", "-", "?"
 * @returns {number}
 */
function parseWeight(weightStr) {
  if (!weightStr || weightStr === '-' || weightStr === '?') return 0;
  
  const cleaned = String(weightStr).replace(/kg|g|\s/gi, '').trim();
  const num = parseFloat(cleaned);
  
  if (isNaN(num)) {
    stats.warnings.push(`Invalid weight: "${weightStr}" → defaulting to 0`);
    return 0;
  }
  
  return num;
}

/**
 * Parse cost from notes field
 * @param {string} notes - Notes field like "750 T", "1,500 T"
 * @returns {{value: number, currency: string} | null}
 */
function parseCost(notes) {
  if (!notes) return null;
  
  const costMatch = String(notes).match(/(\d+(?:,\d+)?)\s*T(?:hrone)?/i);
  if (costMatch) {
    return {
      value: parseInt(costMatch[1].replace(/,/g, ''), 10),
      currency: 'throne'
    };
  }
  
  return null;
}

/**
 * Detect craftsmanship from text
 * @param {string} text - Any text field
 * @returns {string}
 */
function detectCraftsmanship(text) {
  if (!text) return 'common';
  
  const lower = String(text).toLowerCase();
  if (lower.includes('best craft')) return 'best';
  if (lower.includes('good craft')) return 'good';
  if (lower.includes('poor craft')) return 'poor';
  
  return 'common';
}

/**
 * Build rich description from scattered text fields
 * @param {object} oldSystem - Old system data
 * @returns {string}
 */
function buildDescription(oldSystem) {
  const parts = [];
  
  // Main effect/description (from availability field)
  if (oldSystem.availability && String(oldSystem.availability).length > 50) {
    parts.push(`<p>${oldSystem.availability}</p>`);
  }
  
  // Requirements (from cost field)
  if (oldSystem.cost && String(oldSystem.cost).length > 10) {
    parts.push(`<h3>Requirements</h3><p>${oldSystem.cost}</p>`);
  }
  
  // Existing description
  if (oldSystem.description?.value) {
    parts.push(oldSystem.description.value);
  }
  
  return parts.join('\n');
}

/**
 * Migrate a single gear item
 * @param {object} item - Raw item JSON
 * @returns {object} - Migrated item JSON
 */
function migrateGearItem(item) {
  const old = item.system;
  const migrated = {
    name: item.name,
    type: 'gear',
    img: item.img,
    system: {
      // Mapped fields
      category: TYPE_TO_CATEGORY[old.type] || 'general',
      weight: parseWeight(old.weight),
      availability: NORMALIZE_AVAILABILITY[old.effects] || 'average',
      craftsmanship: detectCraftsmanship(old.cost) || 'common',
      
      // Structured fields
      cost: parseCost(old.notes) || { value: 0, currency: 'throne' },
      quantity: old.quantity || 1,
      
      // Description (consolidated)
      description: {
        value: buildDescription(old),
        chat: '',
        summary: String(old.availability || '').substring(0, 200)
      },
      
      // Source (parse old source string)
      source: {
        book: old.source || '',
        page: '',
        custom: ''
      },
      
      // Equippable
      equipped: old.equipped || false,
      inBackpack: old.inBackpack || false,
      container: old.container || '',
      
      // Consumable
      consumable: old.consumable || false,
      uses: {
        value: old.charges?.value || 0,
        max: old.charges?.max || 0
      },
      
      // Gear-specific
      effect: String(old.availability || '').length > 50 ? old.availability : '',
      duration: '',
      notes: old.notes && !parseCost(old.notes) ? old.notes : '',
      identifier: ''
    },
    effects: item.effects || [],
    flags: item.flags || {},
    _id: item._id
  };
  
  // Track category stats
  const category = migrated.system.category;
  stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
  
  if (VERBOSE) {
    console.log(`  ${item.name}`);
    console.log(`    type: "${old.type}" → category: "${category}"`);
    console.log(`    availability: "${old.effects}" → "${migrated.system.availability}"`);
    console.log(`    weight: "${old.weight}" → ${migrated.system.weight}`);
  }
  
  return migrated;
}

/**
 * Main migration function
 */
async function migrate() {
  console.log('=' .repeat(80));
  console.log('GEAR PACK MIGRATION');
  console.log('=' .repeat(80));
  console.log();
  
  if (DRY_RUN) {
    console.log('🧪 DRY RUN MODE - No files will be modified\n');
  } else {
    console.log('⚠️  LIVE MODE - Files will be modified!\n');
    
    // Create backup
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      console.log(`📦 Created backup directory: ${BACKUP_DIR}`);
    }
  }
  
  // Read all gear files
  const files = fs.readdirSync(PACK_DIR).filter(f => f.endsWith('.json'));
  stats.total = files.length;
  
  console.log(`📊 Found ${files.length} gear items\n`);
  console.log('🔄 Processing...\n');
  
  for (const filename of files) {
    const filepath = path.join(PACK_DIR, filename);
    
    try {
      // Read original
      const raw = fs.readFileSync(filepath, 'utf8');
      const original = JSON.parse(raw);
      
      // Backup original
      if (!DRY_RUN) {
        const backupPath = path.join(BACKUP_DIR, filename);
        fs.writeFileSync(backupPath, raw, 'utf8');
      }
      
      // Migrate
      const migrated = migrateGearItem(original);
      
      // Write migrated
      if (!DRY_RUN) {
        fs.writeFileSync(filepath, JSON.stringify(migrated, null, 2), 'utf8');
      }
      
      stats.migrated++;
      
    } catch (error) {
      stats.errors++;
      console.error(`❌ Error processing ${filename}: ${error.message}`);
    }
  }
  
  // Print results
  console.log();
  console.log('=' .repeat(80));
  console.log('MIGRATION COMPLETE');
  console.log('=' .repeat(80));
  console.log();
  console.log(`✅ Migrated: ${stats.migrated}/${stats.total}`);
  console.log(`❌ Errors: ${stats.errors}`);
  console.log();
  
  console.log('📊 Items by Category:');
  for (const [category, count] of Object.entries(stats.byCategory).sort()) {
    console.log(`   ${category.padEnd(15)} ${count}`);
  }
  
  if (stats.warnings.length > 0) {
    console.log();
    console.log(`⚠️  Warnings (${stats.warnings.length}):`);
    const uniqueWarnings = [...new Set(stats.warnings)];
    uniqueWarnings.slice(0, 10).forEach(w => console.log(`   - ${w}`));
    if (uniqueWarnings.length > 10) {
      console.log(`   ... and ${uniqueWarnings.length - 10} more`);
    }
  }
  
  console.log();
  
  if (DRY_RUN) {
    console.log('🧪 This was a DRY RUN - no files were modified');
    console.log('   Remove --dry-run flag to execute migration');
  } else {
    console.log('✨ Migration complete!');
    console.log(`   Backups saved to: ${BACKUP_DIR}`);
    console.log('   Review changes and commit to git');
  }
  
  console.log();
}

// Run migration
migrate().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
