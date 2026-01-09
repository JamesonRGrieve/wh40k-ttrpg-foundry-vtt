/**
 * Migrate all armour pack entries to V13 schema.
 * Run with: node scripts/migrate-armour-packs.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PACK_DIR = path.join(__dirname, '..', 'src', 'packs', 'rt-items-armour', '_source');

/**
 * Parse legacy AP field to armourPoints object.
 */
function parseLegacyAP(ap) {
  if (ap === undefined || ap === null) return null;
  
  // Handle "Special" or narrative AP
  if (ap === "Special" || (typeof ap === 'string' && ap.toLowerCase().includes('psy'))) {
    return { special: true, value: ap };
  }
  
  // Handle percentage (force fields)
  if (typeof ap === 'string' && ap.includes('%')) {
    const percent = parseFloat(ap);
    return { special: true, value: `${percent}%` };
  }
  
  // Handle decimal (force fields as decimal)
  if (typeof ap === 'number' && ap < 1 && ap > 0) {
    const percent = Math.round(ap * 100);
    return { special: true, value: `${percent}%` };
  }
  
  // Handle single number
  if (typeof ap === 'number' || (typeof ap === 'string' && /^\d+$/.test(ap))) {
    const value = parseInt(ap);
    return { head: value, body: value, leftArm: value, rightArm: value, leftLeg: value, rightLeg: value };
  }
  
  // Handle pattern "H/B/A/L"
  if (typeof ap === 'string' && ap.includes('/')) {
    const parts = ap.split('/').map(p => parseInt(p.trim()));
    if (parts.length === 4 && parts.every(p => !isNaN(p))) {
      return {
        head: parts[0],
        body: parts[1],
        leftArm: parts[2],
        rightArm: parts[2],
        leftLeg: parts[3],
        rightLeg: parts[3]
      };
    }
  }
  
  console.warn(`Could not parse AP value: ${ap}`);
  return { head: 0, body: 0, leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 };
}

/**
 * Parse legacy locations field to coverage array.
 */
function parseLegacyLocations(locations) {
  if (!locations || typeof locations !== 'string') return ["all"];
  
  const normalized = locations.toLowerCase().replace(/[()]/g, '');
  
  // Handle "All" case
  if (normalized.includes('all')) return ["all"];
  
  const coverage = new Set();
  
  // Parse comma-separated tokens
  const tokens = normalized.split(',').map(t => t.trim());
  for (const token of tokens) {
    if (token.includes('head')) coverage.add('head');
    if (token.includes('body') || token.includes('chest') || token.includes('torso')) coverage.add('body');
    if (token.includes('arm')) {
      coverage.add('leftArm');
      coverage.add('rightArm');
    }
    if (token.includes('leg')) {
      coverage.add('leftLeg');
      coverage.add('rightLeg');
    }
  }
  
  return coverage.size ? Array.from(coverage) : ["all"];
}

/**
 * Clean weight field (remove "kg" suffix).
 */
function cleanWeight(weight) {
  if (typeof weight === 'number') return weight;
  if (typeof weight === 'string') {
    const cleaned = parseFloat(weight.replace(/[^\d.]/g, ''));
    return isNaN(cleaned) ? 0 : cleaned;
  }
  return 0;
}

/**
 * Migrate single armour entry.
 */
function migrateArmourEntry(entry) {
  const system = entry.system;
  const updates = {};
  let modified = false;
  
  // 1. Migrate AP
  if (system.ap !== undefined) {
    const parsed = parseLegacyAP(system.ap);
    if (parsed) {
      if (parsed.special) {
        // Preserve special AP in notes
        const specialNote = `[AP: ${parsed.value}]`;
        updates.notes = (system.notes || '').trim() ? `${system.notes} ${specialNote}` : specialNote;
        updates.armourPoints = { head: 0, body: 0, leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 };
      } else {
        updates.armourPoints = parsed;
      }
    }
    delete system.ap;
    modified = true;
  }
  
  // 2. Migrate locations
  if (system.locations !== undefined) {
    updates.coverage = parseLegacyLocations(system.locations);
    delete system.locations;
    modified = true;
  }
  
  // 3. Migrate maxAg
  if (system.maxAg !== undefined) {
    if (system.maxAg === '-' || system.maxAg === '' || system.maxAg === null) {
      updates.maxAgility = null;
    } else {
      const parsed = parseInt(system.maxAg);
      updates.maxAgility = isNaN(parsed) ? null : parsed;
    }
    delete system.maxAg;
    modified = true;
  }
  
  // 4. Clean weight
  if (system.weight !== undefined && typeof system.weight === 'string') {
    updates.weight = cleanWeight(system.weight);
    modified = true;
  }
  
  // 5. Clean cost (remove legacy string cost)
  if (typeof system.cost === 'string') {
    delete system.cost; // Let schema default take over
    modified = true;
  }
  
  // 6. Ensure properties exists as array
  if (!system.properties) {
    updates.properties = [];
    modified = true;
  }
  
  // 7. Ensure modificationSlots exists
  if (system.modificationSlots === undefined) {
    updates.modificationSlots = 2; // Default value
    modified = true;
  }
  
  // 8. Ensure modifications array exists
  if (!system.modifications) {
    updates.modifications = [];
    modified = true;
  }
  
  // 9. Remove installedMods if present (legacy field)
  if (system.installedMods !== undefined) {
    delete system.installedMods;
    modified = true;
  }
  
  // Apply updates
  Object.assign(system, updates);
  
  return { entry, modified };
}

/**
 * Main migration function.
 */
function migrateAllArmour() {
  if (!fs.existsSync(PACK_DIR)) {
    console.error(`Pack directory not found: ${PACK_DIR}`);
    process.exit(1);
  }
  
  const files = fs.readdirSync(PACK_DIR).filter(f => f.endsWith('.json'));
  let migrated = 0;
  let skipped = 0;
  let errors = 0;
  
  console.log(`\n🔍 Found ${files.length} JSON files in armour pack...`);
  console.log(`📦 Pack directory: ${PACK_DIR}\n`);
  
  for (const file of files) {
    const filePath = path.join(PACK_DIR, file);
    
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      // Skip non-armour
      if (data.type !== 'armour') {
        skipped++;
        continue;
      }
      
      const { entry: updated, modified } = migrateArmourEntry(data);
      
      if (modified) {
        // Write back with pretty formatting
        fs.writeFileSync(filePath, JSON.stringify(updated, null, 2) + '\n', 'utf8');
        migrated++;
        console.log(`✓ ${file}`);
      } else {
        skipped++;
        console.log(`⊘ ${file} (already migrated)`);
      }
    } catch (err) {
      errors++;
      console.error(`✗ ${file}: ${err.message}`);
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 Migration Summary:`);
  console.log(`   ✓ Migrated: ${migrated}`);
  console.log(`   ⊘ Skipped:  ${skipped}`);
  console.log(`   ✗ Errors:   ${errors}`);
  console.log(`${'='.repeat(60)}\n`);
  
  if (errors > 0) {
    console.error(`⚠️  Migration completed with ${errors} error(s)`);
    process.exit(1);
  } else {
    console.log(`✅ Migration completed successfully!`);
    process.exit(0);
  }
}

// Run migration
console.log(`\n${'='.repeat(60)}`);
console.log(`🛡️  ARMOUR PACK MIGRATION SCRIPT`);
console.log(`${'='.repeat(60)}`);
migrateAllArmour();
