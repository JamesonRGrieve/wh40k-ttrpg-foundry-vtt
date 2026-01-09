/**
 * Ammunition Pack Migration Script
 * Migrates 133 legacy ammunition items to V13 schema
 * 
 * Usage: node scripts/migrate-ammo-pack.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AMMO_DIR = path.resolve(__dirname, '../src/packs/rt-items-ammo/_source');

/* -------------------------------------------- */
/*  Parsing Functions                           */
/* -------------------------------------------- */

/**
 * Parse weapon types from usedWith string
 * "Bolt/Primitive: Bolt Weapons and Crossbows" → ["bolt", "primitive"]
 */
function parseWeaponTypes(usedWithString) {
  if (!usedWithString) return [];
  
  const str = String(usedWithString).toLowerCase();
  
  // Check for "Any" or "All" (universal ammo)
  if (str.includes('any') || str.includes('all')) return [];
  
  const types = [];
  const typeMap = {
    'bolt': 'bolt',
    'las': 'las',
    'sp': 'solid-projectile',
    'solid': 'solid-projectile',
    'solid-projectile': 'solid-projectile',
    'melta': 'melta',
    'plasma': 'plasma',
    'flame': 'flame',
    'flamer': 'flame',
    'launcher': 'launcher',
    'primitive': 'primitive',
    'power': 'power',
    'chain': 'chain',
    'shock': 'shock',
    'exotic': 'exotic'
  };
  
  // Extract type prefixes before colon
  const beforeColon = str.split(':')[0];
  const parts = beforeColon.split(/[,\/]/).map(p => p.trim());
  
  for (const part of parts) {
    for (const [key, value] of Object.entries(typeMap)) {
      if (part.includes(key)) {
        if (!types.includes(value)) types.push(value);
      }
    }
  }
  
  return types;
}

/**
 * Parse damage type letter
 */
function parseDamageTypeLetter(letter) {
  const typeMap = {
    'I': 'impact',
    'R': 'rending', 
    'X': 'explosive',
    'E': 'energy',
    'F': 'fire',
    'S': 'shock',
    'C': 'cold',
    'T': 'toxic'
  };
  return typeMap[letter?.toUpperCase()] || 'impact';
}

/**
 * Normalize quality name to identifier
 * "Crippling (2)" → "crippling-2"
 * "Sanctified" → "sanctified"
 */
function normalizeQuality(qualityStr) {
  if (!qualityStr) return "";
  
  const str = String(qualityStr).trim();
  
  // Match "Quality (rating)" pattern
  const match = str.match(/^([^\(]+)(?:\(([^\)]+)\))?/);
  if (!match) return str.toLowerCase().replace(/\s+/g, '-');
  
  const name = match[1].trim().toLowerCase().replace(/\s+/g, '-');
  const rating = match[2]?.trim();
  
  // Only append rating if it's a number
  if (rating && /^\d+$/.test(rating)) {
    return `${name}-${rating}`;
  }
  
  return name;
}

/**
 * Parse effect description into structured modifiers
 */
function parseEffectDescription(damageOrEffect, qualitiesStr) {
  const result = {
    modifiers: { damage: 0, penetration: 0, range: 0 },
    overrideDamage: null,
    addedQualities: [],
    removedQualities: [],
    effect: ""
  };
  
  if (!damageOrEffect && !qualitiesStr) return result;
  
  const str = String(damageOrEffect || "");
  
  // Check for simple damage modifier: "+2 Damage", "-1 Damage"
  const damageMatch = str.match(/([+\-]\d+)\s*Damage/i);
  if (damageMatch) {
    result.modifiers.damage = parseInt(damageMatch[1]);
  }
  
  // Check for penetration modifier: "+1 Pen", "+2 Penetration"
  const penMatch = str.match(/([+\-]\d+)\s*Pen(?:etration)?/i);
  if (penMatch) {
    result.modifiers.penetration = parseInt(penMatch[1]);
  }
  
  // Check for range modifier: "Halve weapon range" 
  if (str.match(/halve.*range/i)) {
    result.modifiers.range = -50; // percentage
  } else if (str.match(/double.*range/i)) {
    result.modifiers.range = 100; // percentage
  }
  
  // Check for override damage: "Does 2d10 E, Pen 0"
  const overrideMatch = str.match(/Does\s+(\d+d\d+(?:[+\-]\d+)?)\s+([A-Z])/i);
  if (overrideMatch) {
    const dmgParts = overrideMatch[1].match(/(\d+d\d+)([+\-]\d+)?/);
    const penOverride = str.match(/Pen\s+(\d+)/i);
    
    result.overrideDamage = {
      formula: dmgParts[1],
      bonus: dmgParts[2] ? parseInt(dmgParts[2]) : 0,
      type: parseDamageTypeLetter(overrideMatch[2]),
      penetration: penOverride ? parseInt(penOverride[1]) : 0
    };
  }
  
  // Parse qualities from qualities field
  if (qualitiesStr) {
    const parts = String(qualitiesStr).split(',').map(q => q.trim()).filter(Boolean);
    
    for (const part of parts) {
      // Check for "lose" indicator
      if (part.toLowerCase().includes('lose') || part.match(/\(lose\)/i)) {
        const qualityName = part.replace(/\(lose\)/i, '').replace(/lose/i, '').trim();
        if (qualityName && qualityName !== '-') {
          result.removedQualities.push(normalizeQuality(qualityName));
        }
      } else if (part !== '-') {
        result.addedQualities.push(normalizeQuality(part));
      }
    }
  }
  
  // Check for "Gain" and "Lose" in description
  const gainMatch = str.match(/Gain(?:s?)?\s+([^.]+)/i);
  if (gainMatch) {
    const qualities = gainMatch[1].split(/(?:\s+and\s+|,)/).map(q => q.trim());
    for (const q of qualities) {
      const cleaned = q.replace(/Quality/i, '').trim();
      if (cleaned && cleaned !== '-') {
        const normalized = normalizeQuality(cleaned);
        if (!result.addedQualities.includes(normalized)) {
          result.addedQualities.push(normalized);
        }
      }
    }
  }
  
  const loseMatch = str.match(/Lose(?:s?)?\s+([^.]+)/i);
  if (loseMatch) {
    const qualities = loseMatch[1].split(/(?:\s+and\s+|,)/).map(q => q.trim());
    for (const q of qualities) {
      const cleaned = q.replace(/Qualit(?:y|ies)/i, '').trim();
      if (cleaned && cleaned !== '-') {
        const normalized = normalizeQuality(cleaned);
        if (!result.removedQualities.includes(normalized)) {
          result.removedQualities.push(normalized);
        }
      }
    }
  }
  
  // Store full description as effect HTML
  result.effect = str ? `<p>${str}</p>` : "";
  
  return result;
}

/**
 * Parse weight "10% wep" or "1kg" → number
 */
function parseWeight(weightString) {
  if (typeof weightString === 'number') return weightString;
  if (!weightString) return 0;
  
  const str = String(weightString).toLowerCase();
  
  // Check for "10% wep" or similar (weapon-relative weight)
  if (str.includes('%') || str.includes('wep')) {
    return 0; // Special case - weight depends on weapon
  }
  
  // Parse numeric weight with optional unit
  const match = str.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

/**
 * Parse cost "50T Each" → {value: 50, currency: "throne"}
 */
function parseCost(costString) {
  if (!costString || costString === '-' || costString === null) {
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
 * Normalize availability
 */
function normalizeAvailability(availability) {
  if (!availability) return "common";
  
  const normalized = String(availability).toLowerCase().replace(/\s+/g, '-');
  
  const validChoices = [
    "ubiquitous", "abundant", "plentiful", "common", "average",
    "scarce", "rare", "very-rare", "extremely-rare", "near-unique", "unique"
  ];
  
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

/* -------------------------------------------- */
/*  Main Migration Function                     */
/* -------------------------------------------- */

/**
 * Migrate a single ammo item to V13 schema
 */
function migrateAmmo(ammo) {
  const system = ammo.system || {};
  
  // Parse weapon types
  const weaponTypes = parseWeaponTypes(system.usedWith);
  
  // Parse effect description
  const parsed = parseEffectDescription(system.damageOrEffect, system.qualities);
  
  // Parse physical properties
  const weight = parseWeight(system.weight);
  const cost = parseCost(system.cost);
  const availability = normalizeAvailability(system.availability);
  
  // Merge existing modifiers with parsed ones
  const modifiers = {
    damage: system.damageModifier || parsed.modifiers.damage || 0,
    penetration: system.penetrationModifier || parsed.modifiers.penetration || 0,
    range: parsed.modifiers.range || 0,
    rateOfFire: {
      single: 0,
      semi: 0,
      full: 0
    }
  };
  
  // Build identifier from name
  const identifier = system.identifier || ammo.name.toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 64);
  
  // Build modern schema
  const migrated = {
    ...ammo,
    system: {
      identifier: identifier,
      
      // Weapon type compatibility
      weaponTypes: weaponTypes,
      
      // Modifiers
      modifiers: modifiers,
      
      // Qualities management
      addedQualities: parsed.addedQualities,
      removedQualities: parsed.removedQualities,
      
      // Clip size modifier
      clipModifier: 0,
      
      // Effect and notes
      effect: parsed.effect || "",
      notes: system.specialRules && Array.isArray(system.specialRules) 
        ? system.specialRules.join(', ')
        : (system.notes || ""),
      
      // Physical properties
      weight: weight,
      availability: availability,
      craftsmanship: system.craftsmanship || "common",
      quantity: system.quantity || 1,
      cost: cost,
      
      // Equippable properties
      equipped: Boolean(system.equipped),
      stowed: Boolean(system.stowed),
      container: system.container || "",
      
      // Description
      description: system.description || { value: "" },
      
      // Source
      source: system.source || ""
    }
  };
  
  // Add override damage if present
  if (parsed.overrideDamage) {
    migrated.system.damage = parsed.overrideDamage;
    migrated.system.special = []; // Will be handled by addedQualities
  } else {
    // No override damage - use template defaults
    migrated.system.damage = {
      formula: "",
      type: "impact",
      bonus: 0,
      penetration: 0
    };
    migrated.system.special = [];
  }
  
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
 * Process all ammo files
 */
async function migrateAllAmmo() {
  console.log('🔧 Ammunition Pack Migration Script');
  console.log('===================================\n');
  
  // Check if directory exists
  if (!fs.existsSync(AMMO_DIR)) {
    console.error(`❌ Error: Ammo directory not found: ${AMMO_DIR}`);
    process.exit(1);
  }
  
  const files = fs.readdirSync(AMMO_DIR);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  
  console.log(`📂 Found ${jsonFiles.length} ammo files\n`);
  
  let successCount = 0;
  let errorCount = 0;
  const errors = [];
  const warnings = [];
  
  for (const file of jsonFiles) {
    try {
      const filepath = path.join(AMMO_DIR, file);
      const raw = fs.readFileSync(filepath, 'utf8');
      const ammo = JSON.parse(raw);
      
      // Check if already migrated
      if (ammo.system?.weaponTypes !== undefined && Array.isArray(ammo.system.weaponTypes)) {
        warnings.push({ file, message: 'Already migrated (skipped)' });
        continue;
      }
      
      // Migrate
      const migrated = migrateAmmo(ammo);
      
      // Write back
      fs.writeFileSync(filepath, JSON.stringify(migrated, null, 2), 'utf8');
      successCount++;
      
      if (successCount % 25 === 0) {
        console.log(`✓ Migrated ${successCount} ammo items...`);
      }
    } catch (err) {
      errorCount++;
      errors.push({ file, error: err.message });
      console.error(`❌ Error migrating ${file}:`, err.message);
    }
  }
  
  console.log('\n===================================');
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

migrateAllAmmo().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
