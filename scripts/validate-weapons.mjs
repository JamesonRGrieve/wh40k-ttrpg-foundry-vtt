/**
 * Weapon Data Validation Script
 * Validates all 1093 migrated weapons against V13 schema
 * 
 * Usage: node scripts/validate-weapons.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEAPON_DIR = path.resolve(__dirname, '../src/packs/rt-items-weapons/_source');

const REQUIRED_FIELDS = [
  'identifier',
  'class',
  'type',
  'attack',
  'attack.type',
  'attack.characteristic',
  'attack.range',
  'attack.rateOfFire',
  'damage',
  'damage.formula',
  'damage.type',
  'damage.penetration',
  'clip',
  'reload',
  'weight',
  'availability'
];

const VALID_ENUMS = {
  class: ['melee', 'pistol', 'basic', 'heavy', 'thrown', 'exotic'],
  type: ['primitive', 'las', 'solid-projectile', 'bolt', 'melta', 'plasma', 'flame', 'launcher', 'explosive', 'power', 'chain', 'shock', 'force', 'exotic', 'xenos'],
  'attack.type': ['melee', 'ranged', 'thrown', 'psychic'],
  'attack.characteristic': ['weaponSkill', 'ballisticSkill', 'willpower', 'perception'],
  'damage.type': ['impact', 'rending', 'explosive', 'energy', 'fire', 'shock', 'cold', 'toxic'],
  reload: ['-', 'free', 'half', 'full', '2-full', '3-full'],
  availability: ['ubiquitous', 'abundant', 'plentiful', 'common', 'average', 'scarce', 'rare', 'very-rare', 'extremely-rare', 'near-unique', 'unique']
};

function getNestedValue(obj, path) {
  return path.split('.').reduce((current, prop) => current?.[prop], obj);
}

function validateWeapon(weapon, filename) {
  const errors = [];
  const warnings = [];
  const system = weapon.system;
  
  if (!system) {
    errors.push('Missing system object');
    return { errors, warnings };
  }
  
  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    const value = getNestedValue(system, field);
    if (value === undefined || value === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  // Validate enums
  for (const [field, validValues] of Object.entries(VALID_ENUMS)) {
    const value = getNestedValue(system, field);
    if (value !== undefined && value !== null && !validValues.includes(value)) {
      errors.push(`Invalid ${field}: "${value}" (valid: ${validValues.join(', ')})`);
    }
  }
  
  // Type checks
  if (typeof system.weight !== 'number') {
    errors.push(`weight must be number, got: ${typeof system.weight}`);
  }
  
  if (typeof system.damage?.penetration !== 'number') {
    errors.push(`damage.penetration must be number, got: ${typeof system.damage?.penetration}`);
  }
  
  if (!system.clip || typeof system.clip !== 'object') {
    errors.push(`clip must be object with {max, value, type}`);
  } else {
    if (typeof system.clip.max !== 'number') {
      errors.push(`clip.max must be number, got: ${typeof system.clip.max}`);
    }
    if (typeof system.clip.value !== 'number') {
      errors.push(`clip.value must be number, got: ${typeof system.clip.value}`);
    }
  }
  
  if (!system.attack?.range || typeof system.attack.range !== 'object') {
    errors.push(`attack.range must be object with {value, units, special}`);
  }
  
  if (!system.attack?.rateOfFire || typeof system.attack.rateOfFire !== 'object') {
    errors.push(`attack.rateOfFire must be object with {single, semi, full}`);
  }
  
  // Check for legacy flat fields
  if (system.damage && typeof system.damage === 'string') {
    warnings.push('Legacy flat damage field detected');
  }
  
  if (system.damageType !== undefined) {
    warnings.push('Legacy damageType field detected (should be damage.type)');
  }
  
  if (system.penetration !== undefined && system.damage?.penetration === undefined) {
    warnings.push('Legacy flat penetration field detected');
  }
  
  if (system.range && typeof system.range === 'string') {
    warnings.push('Legacy flat range field detected');
  }
  
  if (system.rof && typeof system.rof === 'string') {
    warnings.push('Legacy flat rof field detected');
  }
  
  // Check special qualities
  if (system.special && !Array.isArray(system.special)) {
    errors.push(`special must be array, got: ${typeof system.special}`);
  }
  
  return { errors, warnings };
}

async function validateAllWeapons() {
  console.log('🔍 Weapon Data Validation');
  console.log('=========================\n');
  
  const files = fs.readdirSync(WEAPON_DIR);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  
  console.log(`📂 Validating ${jsonFiles.length} weapons...\n`);
  
  let validCount = 0;
  let invalidCount = 0;
  const allErrors = [];
  const allWarnings = [];
  
  for (const file of jsonFiles) {
    const filepath = path.join(WEAPON_DIR, file);
    const raw = fs.readFileSync(filepath, 'utf8');
    const weapon = JSON.parse(raw);
    
    const { errors, warnings } = validateWeapon(weapon, file);
    
    if (errors.length > 0) {
      invalidCount++;
      allErrors.push({ file: weapon.name || file, errors });
    } else {
      validCount++;
    }
    
    if (warnings.length > 0) {
      allWarnings.push({ file: weapon.name || file, warnings });
    }
  }
  
  console.log('=========================');
  console.log('✅ Validation Complete!\n');
  console.log(`   Valid: ${validCount}`);
  console.log(`   Invalid: ${invalidCount}`);
  console.log(`   Warnings: ${allWarnings.length}`);
  
  if (allErrors.length > 0) {
    console.log('\n❌ Errors Found:');
    allErrors.slice(0, 10).forEach(({ file, errors }) => {
      console.log(`\n   ${file}:`);
      errors.forEach(e => console.log(`      - ${e}`));
    });
    
    if (allErrors.length > 10) {
      console.log(`\n   ... and ${allErrors.length - 10} more files with errors`);
    }
  }
  
  if (allWarnings.length > 0 && allWarnings.length <= 5) {
    console.log('\n⚠️  Warnings:');
    allWarnings.forEach(({ file, warnings }) => {
      console.log(`\n   ${file}:`);
      warnings.forEach(w => console.log(`      - ${w}`));
    });
  } else if (allWarnings.length > 5) {
    console.log(`\n⚠️  ${allWarnings.length} weapons with warnings`);
  }
  
  console.log('\n');
  
  return invalidCount === 0;
}

validateAllWeapons()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });
