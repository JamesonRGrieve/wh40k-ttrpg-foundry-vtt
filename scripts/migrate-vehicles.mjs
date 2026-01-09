#!/usr/bin/env node
/**
 * Migrate vehicle pack data from legacy schema to V13 schema.
 * Run with: node scripts/migrate-vehicles.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACK_DIR = path.join(__dirname, '../src/packs/rt-actors-vehicles/_source');
const BACKUP_DIR = path.join(__dirname, '../src/packs/rt-actors-vehicles/_backup_pre_migration');

// Size string to numeric mapping
const SIZE_MAP = {
  '1m': 1, '2m': 2, '3m': 3, '4m': 3, '5m': 3,
  '6m': 4, '7m': 4, '8m': 4, '9m': 4, '10m': 4,
  '11m': 5, '12m': 5, '13m': 5, '14m': 5, '15m': 5,
  '16m': 6, '17m': 6, '18m': 6, '19m': 6, '20m': 6,
  '21m': 7, '25m': 7, '30m': 7,
  '35m': 8, '40m': 8, '45m': 8, '50m': 8,
  '60m': 9, '70m': 9, '80m': 9, '90m': 9, '100m': 9
};

// Armour descriptor to value mapping
const ARMOUR_MAP = {
  'none': 0,
  'puny (-20)': 2,
  'puny': 2,
  'scrawny (-10)': 4,
  'scrawny': 4,
  'average (+0)': 6,
  'average': 6,
  'hulking (+10)': 8,
  'hulking': 8,
  'enormous (+20)': 10,
  'enormous': 10,
  'massive (+30)': 12,
  'massive': 12,
  'immense (+40)': 14,
  'immense': 14,
  'monumental (+50)': 16,
  'monumental': 16,
  'titanic (+60)': 18,
  'titanic': 18
};

/**
 * Parse armour value from string.
 * Examples: "Enormous (+20)" -> {value: 10, descriptor: "Enormous (+20)"}
 *           "Front 16\nSide 14\nRear 14" -> {front: 16, side: 14, rear: 14}
 */
function parseArmour(armourStr) {
  if (!armourStr || armourStr.toLowerCase() === 'none') {
    return { value: 0, descriptor: '' };
  }
  
  const lower = armourStr.toLowerCase();
  
  // Check for descriptor format "Enormous (+20)"
  for (const [key, value] of Object.entries(ARMOUR_MAP)) {
    if (lower.includes(key)) {
      return { value, descriptor: armourStr.trim() };
    }
  }
  
  // Check for multi-line format "Front 16\nSide 14\nRear 14"
  if (armourStr.includes('\n')) {
    const lines = armourStr.split('\n');
    const result = {};
    for (const line of lines) {
      const match = line.match(/(front|side|rear)\s+(\d+)/i);
      if (match) {
        result[match[1].toLowerCase()] = parseInt(match[2]);
      }
    }
    if (Object.keys(result).length > 0) {
      return result;
    }
  }
  
  // Try to parse as number
  const num = parseInt(armourStr);
  if (!isNaN(num)) {
    return { value: num, descriptor: '' };
  }
  
  // Fallback: return descriptor as-is with 0 value
  return { value: 0, descriptor: armourStr.trim() };
}

/**
 * Parse speed value from string.
 * Examples: "120kph" -> 120, "+15" -> 15, "-10" -> -10
 */
function parseSpeed(speedStr) {
  if (!speedStr) return 0;
  const match = speedStr.match(/([+-]?\d+)/);
  return match ? parseInt(match[1]) : 0;
}

/**
 * Parse size from string to numeric value.
 * Example: "20m" -> 6, 4 -> 4
 */
function parseSize(sizeValue) {
  // Already a number
  if (typeof sizeValue === 'number') return Math.max(1, Math.min(10, sizeValue));
  
  // Null/undefined - default to Average
  if (!sizeValue) return 4;
  
  // String - parse
  const str = String(sizeValue).toLowerCase().trim();
  return SIZE_MAP[str] || 4;
}

/**
 * Parse crew count from crew text.
 * Example: "Driver, Gunner, Commander" -> 3
 */
function parseCrewCount(crewStr) {
  if (!crewStr) return 1;
  // Count commas + 1
  const count = (crewStr.match(/,/g) || []).length + 1;
  return Math.max(1, count);
}

/**
 * Parse integrity from string.
 * Example: "None" -> 0, "30" -> 30
 */
function parseIntegrity(integrityStr) {
  if (!integrityStr || integrityStr.toLowerCase() === 'none') return 0;
  const num = parseInt(integrityStr);
  return isNaN(num) ? 0 : num;
}

/**
 * Determine vehicle class from class string.
 */
function determineVehicleClass(classStr) {
  if (!classStr) return 'ground';
  const lower = classStr.toLowerCase();
  if (lower.includes('air') || lower.includes('flyer') || lower.includes('aircraft')) return 'air';
  if (lower.includes('water') || lower.includes('sea') || lower.includes('naval')) return 'water';
  if (lower.includes('walker') || lower.includes('mech')) return 'walker';
  if (lower.includes('space') || lower.includes('orbital')) return 'space';
  return 'ground';
}

/**
 * Determine vehicle type from various clues.
 */
function determineVehicleType(name, classStr, traitsStr) {
  const nameLower = (name || '').toLowerCase();
  const classLower = (classStr || '').toLowerCase();
  const traitsLower = (traitsStr || '').toLowerCase();
  
  if (nameLower.includes('bike') || traitsLower.includes('bike')) return 'bike';
  if (nameLower.includes('walker') || classLower.includes('walker') || traitsLower.includes('walker')) return 'walker';
  if (nameLower.includes('flyer') || nameLower.includes('aircraft') || classLower.includes('air')) return 'flyer';
  if (traitsLower.includes('skimmer')) return 'skimmer';
  if (nameLower.includes('tank') || nameLower.includes('leman russ') || nameLower.includes('baneblade')) return 'tank';
  return 'vehicle';
}

/**
 * Convert HTML entities and format text.
 */
function formatHTML(text) {
  if (!text) return '';
  if (typeof text !== 'string') text = String(text);
  // Convert newlines to <p> tags for better HTML formatting
  return text.split('\n').filter(line => line.trim()).map(line => `<p>${line.trim()}</p>`).join('\n');
}

/**
 * Migrate a single vehicle actor.
 */
function migrateVehicle(vehicle) {
  const old = vehicle.system;
  const migrated = { ...vehicle };
  
  console.log(`\n  Migrating: ${vehicle.name}`);
  console.log(`    Class: ${old.class}`);
  console.log(`    Size: ${old.size}`);
  
  // Parse armour (handle composite sideArmour field)
  let frontArmour, sideArmour, rearArmour;
  
  if (old.sideArmour && old.sideArmour.includes('\n') && old.sideArmour.toLowerCase().includes('front')) {
    // Multi-line format contains all three armour values
    console.log(`    Parsing composite armour from sideArmour field`);
    const armours = parseArmour(old.sideArmour);
    frontArmour = { value: armours.front || 0, descriptor: '' };
    sideArmour = { value: armours.side || 0, descriptor: '' };
    rearArmour = { value: armours.rear || 0, descriptor: '' };
  } else {
    // Separate fields
    frontArmour = parseArmour(old.frontArmour);
    sideArmour = parseArmour(old.sideArmour);
    rearArmour = parseArmour(old.rearArmour);
  }
  
  console.log(`    Armour: F:${frontArmour.value} S:${sideArmour.value} R:${rearArmour.value}`);
  
  // Parse speeds
  const cruisingSpeed = parseSpeed(old.cruisingSpeed);
  const tacticalSpeed = parseSpeed(old.tacticalSpeed);
  console.log(`    Speed: Cruising ${cruisingSpeed}, Tactical ${tacticalSpeed}`);
  
  // Parse size
  const size = parseSize(old.size);
  console.log(`    Size numeric: ${size}`);
  
  // Parse crew (note: rearArmour field actually contains crew data!)
  const crewCount = parseCrewCount(old.rearArmour);
  const crewNotes = old.rearArmour || '';
  console.log(`    Crew: ${crewCount} (${crewNotes.substring(0, 30)}...)`);
  
  // Parse integrity
  const integrityMax = parseIntegrity(old.structuralIntegrity);
  console.log(`    Integrity: ${integrityMax}`);
  
  // Determine vehicle class and type
  const vehicleClass = determineVehicleClass(old.class);
  const vehicleType = determineVehicleType(vehicle.name, old.class, old.passengers);
  console.log(`    Type: ${vehicleType}, Class: ${vehicleClass}`);
  
  // Extract availability (remove source book reference)
  let availability = 'common';
  if (old.cargo) {
    availability = old.cargo.toLowerCase().replace(/[^a-z-]/g, '');
  }
  
  // Build migrated system data
  migrated.system = {
    // Vehicle classification
    vehicleClass: vehicleClass,
    size: size,
    sizeDescriptor: old.size || '',
    
    // NPC-style fields
    faction: '',
    subfaction: '',
    type: vehicleType,
    threatLevel: 0,
    
    // Armour (nested structure)
    armour: {
      front: frontArmour,
      side: sideArmour,
      rear: rearArmour
    },
    
    // Speed
    speed: {
      cruising: cruisingSpeed,
      tactical: tacticalSpeed,
      notes: ''
    },
    
    // Crew (nested structure)
    crew: {
      required: crewCount,
      notes: crewNotes
    },
    
    passengers: 0, // No data in packs
    
    // Manoeuverability
    manoeuverability: parseInt(old.maneuverability) || 0,
    
    // Carrying capacity
    carryingCapacity: 0, // No data in packs
    
    // Integrity
    integrity: {
      max: integrityMax,
      value: integrityMax, // Start at full
      critical: 0
    },
    
    // Weapons (from crew field which has weapons!) - convert to HTML
    weapons: formatHTML(old.crew || ''),
    
    // Special rules (from passengers field) - convert to HTML
    specialRules: formatHTML(old.passengers || ''),
    
    // Traits text (from passengers field)
    traitsText: old.passengers || '',
    
    // Availability
    availability: availability,
    
    // Source
    source: old.availability || ''
  };
  
  console.log(`    ✓ Migration complete`);
  
  return migrated;
}

/**
 * Migrate all vehicles in pack.
 */
async function migrateAllVehicles() {
  // Create backup directory
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  
  const files = fs.readdirSync(PACK_DIR).filter(f => f.endsWith('.json'));
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Vehicle Migration Script - V13 Schema Update`);
  console.log(`${'='.repeat(60)}`);
  console.log(`\nFound ${files.length} vehicles to migrate`);
  console.log(`Backup directory: ${BACKUP_DIR}`);
  console.log(`\nStarting migration...\n`);
  
  let successCount = 0;
  let errorCount = 0;
  const errors = [];
  
  for (const file of files) {
    try {
      const filePath = path.join(PACK_DIR, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      
      // Backup original
      const backupPath = path.join(BACKUP_DIR, file);
      fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));
      
      // Migrate
      const migrated = migrateVehicle(data);
      
      // Write migrated
      fs.writeFileSync(filePath, JSON.stringify(migrated, null, 2));
      
      successCount++;
    } catch (err) {
      console.error(`  ✗ ${file}: ${err.message}`);
      errors.push({ file, error: err.message });
      errorCount++;
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Migration Summary`);
  console.log(`${'='.repeat(60)}`);
  console.log(`✓ Successful: ${successCount}`);
  console.log(`✗ Errors: ${errorCount}`);
  
  if (errors.length > 0) {
    console.log(`\nErrors:`);
    errors.forEach(({ file, error }) => {
      console.log(`  - ${file}: ${error}`);
    });
  }
  
  console.log(`\nBackups saved to: ${BACKUP_DIR}`);
  console.log(`\nMigration complete!\n`);
}

// Run migration
migrateAllVehicles().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
