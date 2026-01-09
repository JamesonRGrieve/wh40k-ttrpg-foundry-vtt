/**
 * Migrates all weapon pack data from legacy flat schema to V13 nested schema.
 * 
 * WHAT THIS DOES:
 * - Transforms flat strings (range: "30m") → nested objects (attack.range.value: 30)
 * - Parses rate of fire (rof: "S/2/-") → structured data (rateOfFire: {single:true, semi:2, full:0})
 * - Moves damage fields to nested damage object
 * - Converts special strings to Set of identifiers
 * - Normalizes weight to numbers
 * - Adds required V13 fields (identifier, melee flag, etc.)
 * 
 * Usage: node scripts/migrate-weapon-packs.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACK_DIR = path.join(__dirname, '../src/packs/rt-items-weapons/_source');

/* ========================================================================== */
/*  CONFIGURATION                                                             */
/* ========================================================================== */

// Damage type mapping (proper casing → lowercase for schema)
const DAMAGE_TYPE_MAP = {
  'Impact': 'impact',
  'Rending': 'rending',
  'Explosive': 'explosive',
  'Energy': 'energy',
  'Fire': 'fire',
  'Shock': 'shock',
  'Cold': 'cold',
  'Toxic': 'toxic'
};

// Reload action mapping
const RELOAD_MAP = {
  'Free': 'free',
  'Free Action': 'free',
  'Half': 'half',
  'Half Action': 'half',
  'Full': 'full',
  'Full Action': 'full',
  '2 Full': '2-full',
  '2 Full Actions': '2-full',
  '3 Full': '3-full',
  '3 Full Actions': '3-full',
  '-': '-',
  'N/A': '-'
};

/* ========================================================================== */
/*  PARSING FUNCTIONS                                                         */
/* ========================================================================== */

/**
 * Parse range string into structured range object.
 * @param {string} rangeStr - Range like "30m", "SBx3", "110m"
 * @returns {{value: number, units: string, special: string}}
 */
function parseRange(rangeStr) {
  if (!rangeStr || rangeStr === '-' || rangeStr === 'N/A') {
    return { value: 0, units: 'm', special: '' };
  }
  
  // Check for special ranges (SB, TB, AB, PR, etc.)
  if (rangeStr.match(/SB|TB|AB|metres|Psyker|PR|point blank|self/i)) {
    return { value: 0, units: 'm', special: rangeStr };
  }
  
  // Parse numeric range (30m, 110m, etc.)
  const numericMatch = rangeStr.match(/^(\d+)m?$/i);
  if (numericMatch) {
    return { value: parseInt(numericMatch[1]), units: 'm', special: '' };
  }
  
  // Fallback to special for any other format
  return { value: 0, units: 'm', special: rangeStr };
}

/**
 * Parse rate of fire string into structured RoF object.
 * @param {string} rofStr - Rate like "S/2/-", "S/3/10", "-/-/-"
 * @returns {{single: boolean, semi: number, full: number}}
 */
function parseRateOfFire(rofStr) {
  if (!rofStr || rofStr === '-' || rofStr === 'N/A') {
    return { single: false, semi: 0, full: 0 };
  }
  
  // Parse S/2/- or S/3/10 format
  const parts = rofStr.split('/').map(s => s.trim());
  
  return {
    single: parts[0] === 'S',
    semi: parts[1] && parts[1] !== '-' ? parseInt(parts[1]) : 0,
    full: parts[2] && parts[2] !== '-' ? parseInt(parts[2]) : 0
  };
}

/**
 * Parse clip value into structured clip object.
 * @param {number|string} clipValue - Clip like 30, "60", "60 (box)", "-"
 * @returns {{max: number, value: number, type: string}}
 */
function parseClip(clipValue) {
  if (!clipValue || clipValue === '-' || clipValue === 'N/A') {
    return { max: 0, value: 0, type: '' };
  }
  
  if (typeof clipValue === 'number') {
    return { max: clipValue, value: clipValue, type: '' };
  }
  
  // Handle strings like "30" or "60 (box)" or "14 shots"
  const match = String(clipValue).match(/^(\d+)/);
  const max = match ? parseInt(match[1]) : 0;
  return { max, value: max, type: '' };
}

/**
 * Parse special qualities string into Set of identifiers.
 * @param {string} specialStr - Specials like "Tearing, Blast (3), Accurate"
 * @returns {string[]} Array of lowercase identifiers (for JSON serialization)
 */
function parseSpecials(specialStr) {
  if (!specialStr || specialStr === '-' || specialStr === 'null') return [];
  
  // Split by comma, trim, lowercase, normalize identifiers
  const specials = specialStr.split(',').map(s => {
    const trimmed = s.trim();
    // Extract quality name (e.g., "Blast (3)" → "blast")
    const match = trimmed.match(/^([^\(]+)/);
    const name = match ? match[1].trim() : trimmed;
    return name.toLowerCase().replace(/\s+/g, '-');
  });
  
  return specials.filter(s => s.length > 0);
}

/**
 * Parse weight string into number.
 * @param {string|number} weightStr - Weight like "5.5kg", "16kg", 5.5
 * @returns {number}
 */
function parseWeight(weightStr) {
  if (!weightStr || weightStr === '-') return 0;
  
  if (typeof weightStr === 'number') return weightStr;
  
  // Parse "5.5kg" → 5.5
  const match = String(weightStr).match(/^([\d.]+)/);
  return match ? parseFloat(match[1]) : 0;
}

/**
 * Generate identifier from weapon name.
 * @param {string} name - Weapon name
 * @returns {string} Lowercase kebab-case identifier
 */
function generateIdentifier(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-')          // Spaces to dashes
    .replace(/-+/g, '-')           // Collapse multiple dashes
    .trim();
}

/**
 * Normalize reload value.
 * @param {string} reloadStr - Reload like "Full", "2 Full", "Half Action"
 * @returns {string}
 */
function normalizeReload(reloadStr) {
  if (!reloadStr || reloadStr === '-' || reloadStr === 'N/A') return '-';
  return RELOAD_MAP[reloadStr] || reloadStr.toLowerCase();
}

/**
 * Determine if weapon is two-handed based on class, type, or special qualities.
 * @param {string} weaponClass - Weapon class
 * @param {string} weaponType - Weapon type
 * @param {string[]} specials - Special qualities
 * @returns {boolean}
 */
function isTwoHanded(weaponClass, weaponType, specials) {
  // Heavy weapons are always two-handed
  if (weaponClass === 'heavy') return true;
  
  // Basic weapons are usually two-handed unless special
  if (weaponClass === 'basic') {
    // Check for one-handed specials (rare)
    return !specials.some(s => s.includes('one-hand'));
  }
  
  // Check specials for explicit two-handed marker
  return specials.some(s => s.includes('two-hand'));
}

/* ========================================================================== */
/*  MIGRATION LOGIC                                                           */
/* ========================================================================== */

/**
 * Migrate a single weapon JSON file.
 * @param {string} weaponPath - Path to weapon JSON file
 * @returns {Promise<boolean>} True if migrated, false if skipped
 */
async function migrateWeapon(weaponPath) {
  const content = await fs.readFile(weaponPath, 'utf-8');
  const weapon = JSON.parse(content);
  
  // Skip if already migrated (has nested damage.formula)
  if (weapon.system?.damage?.formula !== undefined) {
    console.log(`⏭️  ${weapon.name} - already migrated`);
    return false;
  }
  
  const system = weapon.system;
  const specials = parseSpecials(system.special);
  
  // Build migrated system object
  const migrated = {
    // Core identification
    identifier: generateIdentifier(weapon.name),
    
    // Weapon classification (keep existing)
    class: system.class || 'melee',
    type: system.type || 'primitive',
    
    // Physical properties
    weight: parseWeight(system.weight),
    availability: system.availability || 'common',
    craftsmanship: system.craftsmanship || '',
    source: system.source || '',
    
    // Equipment state
    equipped: system.equipped || false,
    twoHanded: isTwoHanded(system.class, system.type, specials),
    melee: system.class === 'melee',
    
    // Attack data (NESTED)
    attack: {
      type: system.class === 'melee' ? 'melee' : 
            system.class === 'thrown' ? 'thrown' : 'ranged',
      characteristic: system.class === 'melee' ? 'weaponSkill' : 'ballisticSkill',
      modifier: 0,
      range: parseRange(system.range),
      rateOfFire: parseRateOfFire(system.rof)
    },
    
    // Damage data (NESTED)
    damage: {
      formula: system.damage || '',
      type: DAMAGE_TYPE_MAP[system.damageType] || 'impact',
      bonus: 0,
      penetration: parseInt(system.penetration) || 0
    },
    
    // Ammunition
    clip: parseClip(system.clip),
    reload: normalizeReload(system.reload),
    
    // Special qualities (as array for JSON, will become Set in Foundry)
    special: specials,
    
    // Weapon qualities (separate from specials)
    qualities: [],
    
    // Modifications
    modifications: [],
    
    // Proficiency requirement
    proficiency: system.proficiency || '',
    
    // Notes
    notes: system.note || '',
    
    // Description (keep existing)
    description: system.description || { value: '' },
    
    // Backpack tracking (keep if exists)
    backpack: system.backpack || { inBackpack: false }
  };
  
  weapon.system = migrated;
  
  // Write back with pretty formatting
  await fs.writeFile(weaponPath, JSON.stringify(weapon, null, 2) + '\n');
  console.log(`✅ ${weapon.name}`);
  return true;
}

/* ========================================================================== */
/*  MAIN EXECUTION                                                            */
/* ========================================================================== */

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Rogue Trader Weapon Pack Migration Script               ║');
  console.log('║   Legacy Flat Schema → V13 Nested DataModel               ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  // Check if pack directory exists
  try {
    await fs.access(PACK_DIR);
  } catch (err) {
    console.error(`❌ Pack directory not found: ${PACK_DIR}`);
    process.exit(1);
  }
  
  const files = await fs.readdir(PACK_DIR);
  const weaponFiles = files.filter(f => f.endsWith('.json'));
  
  console.log(`📦 Found ${weaponFiles.length} weapon files\n`);
  
  let migrated = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const file of weaponFiles) {
    try {
      const filePath = path.join(PACK_DIR, file);
      const wasMigrated = await migrateWeapon(filePath);
      if (wasMigrated) migrated++;
      else skipped++;
    } catch (err) {
      console.error(`❌ ${file}: ${err.message}`);
      errors++;
    }
  }
  
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║   Migration Complete                                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`  ✅ Migrated: ${migrated}`);
  console.log(`  ⏭️  Skipped:  ${skipped}`);
  console.log(`  ❌ Errors:   ${errors}`);
  console.log(`  📦 Total:    ${weaponFiles.length}`);
  
  if (errors > 0) {
    console.log('\n⚠️  Some files had errors. Review output above.');
    process.exit(1);
  } else if (migrated > 0) {
    console.log('\n✨ Migration successful! Run `npm run build` to rebuild packs.');
  } else {
    console.log('\n✨ All weapons already migrated!');
  }
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});
