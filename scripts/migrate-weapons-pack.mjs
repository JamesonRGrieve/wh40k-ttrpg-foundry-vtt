/**
 * Weapon Pack Migration Script
 * Migrates 1093 legacy weapons to V13 schema
 * 
 * Usage: node scripts/migrate-weapons-pack.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEAPON_DIR = path.resolve(__dirname, '../src/packs/rt-items-weapons/_source');

/* -------------------------------------------- */
/*  Parsing Functions                           */
/* -------------------------------------------- */

/**
 * Parse legacy RoF string "S/3/-" → {single: true, semi: 3, full: 0}
 */
function parseRoF(rofString) {
  if (!rofString || rofString === '-' || rofString === '') {
    return { single: false, semi: 0, full: 0 };
  }
  
  const parts = String(rofString).split('/').map(p => p.trim());
  
  return {
    single: parts[0] === 'S' || parts[0] === 's',
    semi: parts[1] && parts[1] !== '-' ? parseInt(parts[1]) : 0,
    full: parts[2] && parts[2] !== '-' ? parseInt(parts[2]) : 0
  };
}

/**
 * Parse legacy range "30m" or "SBx3" → {value, units, special}
 */
function parseRange(rangeString) {
  if (!rangeString || rangeString === '-' || rangeString === '') {
    return { value: 0, units: "m", special: "" };
  }
  
  const str = String(rangeString).trim();
  
  // Check for formula ranges (SBx3, SB×3, etc.)
  if (/[a-zA-Z]/.test(str) && !str.endsWith('m')) {
    return { value: 0, units: "m", special: str };
  }
  
  // Parse numeric range "30m" or "30 m" or "30"
  const match = str.match(/^(\d+(?:\.\d+)?)\s*(m|meters?)?$/i);
  if (match) {
    return { value: parseFloat(match[1]), units: "m", special: "" };
  }
  
  // Fallback to special
  return { value: 0, units: "m", special: str };
}

/**
 * Parse damage "2d10+5" → {formula: "2d10", bonus: 5}
 */
function parseDamage(damageString) {
  if (!damageString) return { formula: "", bonus: 0 };
  
  const str = String(damageString).trim();
  
  // Match formula with optional +/- bonus
  const match = str.match(/^([^+\-]+)([\+\-]\d+)?$/);
  if (!match) return { formula: str, bonus: 0 };
  
  return {
    formula: match[1].trim(),
    bonus: match[2] ? parseInt(match[2]) : 0
  };
}

/**
 * Parse special qualities string → Array of identifiers
 * "Blast (3), Tearing" → ["blast-3", "tearing"]
 */
function parseSpecialQualities(specialString) {
  if (!specialString) return [];
  
  return String(specialString)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      // Match "Quality (rating)" pattern
      const match = s.match(/^([^\(]+)(?:\(([^\)]+)\))?/);
      if (!match) return s.toLowerCase().replace(/\s+/g, '-');
      
      const name = match[1].trim().toLowerCase().replace(/\s+/g, '-');
      const rating = match[2]?.trim();
      
      // Only append rating if it's a number
      if (rating && /^\d+$/.test(rating)) {
        return `${name}-${rating}`;
      }
      
      return name;
    });
}

/**
 * Parse weight "5.5kg" → 5.5
 */
function parseWeight(weightString) {
  if (typeof weightString === 'number') return weightString;
  if (!weightString) return 0;
  
  const match = String(weightString).match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

/**
 * Parse clip value (can be number or "-")
 */
function parseClip(clipValue) {
  if (clipValue === '-' || clipValue === null || clipValue === undefined || clipValue === '') {
    return { max: 0, value: 0, type: "" };
  }
  
  if (typeof clipValue === 'object' && clipValue.max !== undefined) {
    // Already migrated
    return clipValue;
  }
  
  const num = parseInt(clipValue);
  if (isNaN(num)) {
    return { max: 0, value: 0, type: "" };
  }
  
  return { max: num, value: num, type: "" };
}

/**
 * Normalize availability to match CONFIG choices
 */
function normalizeAvailability(availability) {
  if (!availability) return "common";
  
  const normalized = String(availability).toLowerCase().replace(/\s+/g, '-');
  
  const validChoices = [
    "ubiquitous", "abundant", "plentiful", "common", "average",
    "scarce", "rare", "very-rare", "extremely-rare", "near-unique", "unique"
  ];
  
  // Map legacy values
  const mappings = {
    "initiated": "very-rare",
    "hero": "extremely-rare",
    "legendary": "near-unique",
    "veryrare": "very-rare",
    "extremelyrare": "extremely-rare",
    "nearunique": "near-unique"
  };
  
  const mapped = mappings[normalized] || normalized;
  return validChoices.includes(mapped) ? mapped : "common";
}

/**
 * Parse cost "5 R" or "120 T" → {value: 5, currency: "renown"}
 */
function parseCost(costString) {
  if (!costString || costString === '-' || costString === '') {
    return { value: 0, currency: "throne" };
  }
  
  const str = String(costString).trim();
  const match = str.match(/(\d+)\s*([A-Z])/);
  if (!match) return { value: 0, currency: "throne" };
  
  const currencyMap = {
    'T': 'throne',
    'R': 'renown',
    'G': 'gelt'
  };
  
  return {
    value: parseInt(match[1]),
    currency: currencyMap[match[2]] || 'throne'
  };
}

/**
 * Normalize damage type
 */
function normalizeDamageType(damageType) {
  if (!damageType) return "impact";
  
  const normalized = String(damageType).toLowerCase();
  const validTypes = ["impact", "rending", "explosive", "energy", "fire", "shock", "cold", "toxic"];
  
  return validTypes.includes(normalized) ? normalized : "impact";
}

/**
 * Determine attack type from weapon class
 */
function getAttackType(weaponClass) {
  if (!weaponClass) return "ranged";
  if (weaponClass === "melee") return "melee";
  if (weaponClass === "thrown") return "thrown";
  return "ranged";
}

/**
 * Determine attack characteristic from weapon class
 */
function getAttackCharacteristic(weaponClass) {
  if (!weaponClass) return "ballisticSkill";
  if (weaponClass === "melee") return "weaponSkill";
  return "ballisticSkill";
}

/**
 * Normalize weapon class
 */
function normalizeWeaponClass(weaponClass) {
  if (!weaponClass) return "melee";
  
  const normalized = String(weaponClass).toLowerCase();
  const validClasses = ["melee", "pistol", "basic", "heavy", "thrown", "exotic"];
  
  return validClasses.includes(normalized) ? normalized : "melee";
}

/**
 * Normalize weapon type
 */
function normalizeWeaponType(weaponType) {
  if (!weaponType) return "primitive";
  
  const normalized = String(weaponType).toLowerCase();
  const validTypes = [
    "primitive", "las", "solid-projectile", "bolt", "melta", "plasma",
    "flame", "launcher", "explosive", "power", "chain", "shock",
    "force", "exotic", "xenos"
  ];
  
  return validTypes.includes(normalized) ? normalized : "primitive";
}

/**
 * Normalize reload time
 */
function normalizeReload(reload) {
  if (!reload) return "-";
  
  const normalized = String(reload).toLowerCase().trim();
  const validChoices = ["-", "free", "half", "full", "2-full", "3-full"];
  
  const mappings = {
    "2full": "2-full",
    "3full": "3-full",
    "twofull": "2-full",
    "threefull": "3-full",
    "2 full": "2-full",
    "3 full": "3-full"
  };
  
  const mapped = mappings[normalized] || normalized;
  return validChoices.includes(mapped) ? mapped : "-";
}

/* -------------------------------------------- */
/*  Main Migration Function                     */
/* -------------------------------------------- */

/**
 * Migrate a single weapon to V13 schema
 */
function migrateWeapon(weapon) {
  const system = weapon.system || {};
  
  // Parse legacy fields
  const damage = parseDamage(system.damage);
  const range = parseRange(system.range);
  const rof = parseRoF(system.rof);
  const clip = parseClip(system.clip);
  const weight = parseWeight(system.weight);
  const cost = parseCost(system.cost);
  const availability = normalizeAvailability(system.availability);
  const damageType = normalizeDamageType(system.damageType);
  const special = parseSpecialQualities(system.special);
  const weaponClass = normalizeWeaponClass(system.class);
  const weaponType = normalizeWeaponType(system.type);
  const reload = normalizeReload(system.reload);
  
  // Determine attack properties
  const attackType = getAttackType(weaponClass);
  const attackChar = getAttackCharacteristic(weaponClass);
  
  // Parse penetration
  let penetration = 0;
  if (typeof system.penetration === 'number') {
    penetration = system.penetration;
  } else if (system.penetration) {
    penetration = parseInt(system.penetration) || 0;
  }
  
  // Build identifier from name
  const identifier = system.identifier || weapon.name.toLowerCase()
    .replace(/[^\w\s-]/g, '')  // Remove special chars
    .replace(/\s+/g, '-')       // Replace spaces with hyphens
    .replace(/-+/g, '-')        // Collapse multiple hyphens
    .substring(0, 64);          // Limit length
  
  // Build modern schema
  const migrated = {
    ...weapon,
    system: {
      // Core weapon fields
      identifier: identifier,
      class: weaponClass,
      type: weaponType,
      twoHanded: Boolean(system.twoHanded),
      melee: weaponClass === "melee" || Boolean(system.melee),
      
      // Attack properties (from AttackTemplate)
      attack: {
        type: attackType,
        characteristic: attackChar,
        modifier: system.attackModifier || system.modifier || 0,
        range: range,
        rateOfFire: rof
      },
      
      // Damage properties (from DamageTemplate)
      damage: {
        formula: damage.formula,
        type: damageType,
        bonus: damage.bonus,
        penetration: penetration
      },
      
      // Special qualities (single Set field)
      special: special,
      
      // Ammunition
      clip: clip,
      reload: reload,
      
      // Physical properties (from PhysicalItemTemplate)
      weight: weight,
      availability: availability,
      craftsmanship: system.craftsmanship || "common",
      quantity: system.quantity || 1,
      cost: cost,
      
      // Equippable properties (from EquippableTemplate)
      equipped: Boolean(system.equipped),
      stowed: Boolean(system.stowed),
      container: system.container || "",
      
      // Description (from DescriptionTemplate)
      description: system.description || { value: "" },
      
      // Additional fields
      modifications: system.modifications || [],
      proficiency: system.proficiency || "",
      notes: system.note || system.notes || "",
      source: system.source || ""
    }
  };
  
  // Ensure description is object
  if (typeof migrated.system.description === 'string') {
    migrated.system.description = { value: migrated.system.description };
  }
  
  return migrated;
}

/* -------------------------------------------- */
/*  Batch Processing                            */
/* -------------------------------------------- */

/**
 * Process all weapon files
 */
async function migrateAllWeapons() {
  console.log('🔧 Weapon Pack Migration Script');
  console.log('================================\n');
  
  // Check if directory exists
  if (!fs.existsSync(WEAPON_DIR)) {
    console.error(`❌ Error: Weapon directory not found: ${WEAPON_DIR}`);
    process.exit(1);
  }
  
  const files = fs.readdirSync(WEAPON_DIR);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  
  console.log(`📂 Found ${jsonFiles.length} weapon files\n`);
  
  let successCount = 0;
  let errorCount = 0;
  const errors = [];
  const warnings = [];
  
  for (const file of jsonFiles) {
    try {
      const filepath = path.join(WEAPON_DIR, file);
      const raw = fs.readFileSync(filepath, 'utf8');
      const weapon = JSON.parse(raw);
      
      // Check if already migrated (has nested damage.formula)
      if (weapon.system?.damage?.formula !== undefined) {
        warnings.push({ file, message: 'Already migrated (skipped)' });
        continue;
      }
      
      // Migrate
      const migrated = migrateWeapon(weapon);
      
      // Write back
      fs.writeFileSync(filepath, JSON.stringify(migrated, null, 2), 'utf8');
      successCount++;
      
      if (successCount % 100 === 0) {
        console.log(`✓ Migrated ${successCount} weapons...`);
      }
    } catch (err) {
      errorCount++;
      errors.push({ file, error: err.message });
      console.error(`❌ Error migrating ${file}:`, err.message);
    }
  }
  
  console.log('\n================================');
  console.log('✅ Migration Complete!\n');
  console.log(`   Successful: ${successCount}`);
  console.log(`   Errors: ${errorCount}`);
  console.log(`   Warnings: ${warnings.length}`);
  
  if (warnings.length > 0 && warnings.length <= 10) {
    console.log('\n⚠️  Warnings:');
    warnings.forEach(w => console.log(`   - ${w.file}: ${w.message}`));
  } else if (warnings.length > 10) {
    console.log(`\n⚠️  ${warnings.length} warnings (already migrated files)`);
  }
  
  if (errors.length > 0) {
    console.log('\n❌ Errors:');
    errors.forEach(e => console.log(`   - ${e.file}: ${e.error}`));
  }
  
  console.log('\n');
}

/* -------------------------------------------- */
/*  Run Migration                               */
/* -------------------------------------------- */

migrateAllWeapons().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
