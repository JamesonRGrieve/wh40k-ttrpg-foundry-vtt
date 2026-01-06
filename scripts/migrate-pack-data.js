#!/usr/bin/env node

/**
 * Migrate pack JSON files from old schema to V13 DataModel schema
 * 
 * CHANGES:
 * 1. Weapon/Armour: class/type capitalized -> lowercase
 * 2. Damage: damageType -> damage.type (lowercase)
 * 3. Availability: Capitalized -> lowercase kebab-case
 * 4. Craftsmanship: Capitalized -> lowercase
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Mapping tables
const WEAPON_CLASS_MAP = {
  'Melee': 'melee',
  'Pistol': 'pistol',
  'Basic': 'basic',
  'Heavy': 'heavy',
  'Thrown': 'thrown',
  'Exotic': 'exotic',
  'Chain': 'chain',
  'Power': 'power',
  'Shock': 'shock',
  'Force': 'force',
  'Vehicle': 'vehicle',
  'Mounted': 'mounted'
};

const WEAPON_TYPE_MAP = {
  'Primitive': 'primitive',
  'Las': 'las',
  'SP': 'solid-projectile',
  'Bolt': 'bolt',
  'Melta': 'melta',
  'Plasma': 'plasma',
  'Flame': 'flame',
  'Launcher': 'launcher',
  'Grenade': 'explosive',
  'Explosive': 'explosive',
  'Power': 'power',
  'Chain': 'chain',
  'Shock': 'shock',
  'Force': 'force',
  'Exotic': 'exotic',
  'Exotic - Ork': 'exotic',
  'Exotic - Eldar': 'exotic',
  'Exotic - DEldar': 'exotic',
  'Exotic - Tau': 'exotic',
  'Exotic - Necron': 'exotic',
  'Exotic - Tyranid': 'exotic',
  'Exotic - Astartes': 'exotic',
  'Relic - Astartes': 'exotic',
  'Relic': 'exotic',
  'Xenos': 'xenos'
};

const ARMOUR_TYPE_MAP = {
  'Flak': 'flak',
  'Mesh': 'mesh',
  'Carapace': 'carapace',
  'Power': 'power',
  'Power (Astartes)': 'power',
  'Power Relic (Astartes)': 'power',
  'Force Field': 'void',
  'Force Field (Astartes)': 'void',
  'Force Field Relic Astartes': 'void',
  'Primitive': 'primitive',
  'Void': 'void',
  'Other': 'flak',
  'Ork': 'xenos',
  'Eldar': 'xenos',
  'Dark Eldar': 'xenos',
  'Eldar (Force Field)': 'xenos',
  'Dark Eldar (Force Field)': 'xenos',
  'Tau': 'xenos',
  'Carapace (Astartes)': 'carapace'
};

const DAMAGE_TYPE_MAP = {
  'Impact': 'impact',
  'Rending': 'rending',
  'Explosive': 'explosive',
  'Energy': 'energy',
  'Fire': 'fire',
  'Shock': 'shock',
  'Cold': 'cold',
  'Toxic': 'toxic',
  'I': 'impact',
  'R': 'rending',
  'X': 'explosive',
  'E': 'energy'
};

const AVAILABILITY_MAP = {
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
  'Unique': 'unique'
};

const CRAFTSMANSHIP_MAP = {
  'Poor': 'poor',
  'Common': 'common',
  'Good': 'good',
  'Best': 'best'
};

function migrateFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    
    if (!data.system) return false;
    
    let modified = false;
    const changes = [];
    
    // Fix weapon class
    if (data.system.class && WEAPON_CLASS_MAP[data.system.class]) {
      changes.push(`class: ${data.system.class} -> ${WEAPON_CLASS_MAP[data.system.class]}`);
      data.system.class = WEAPON_CLASS_MAP[data.system.class];
      modified = true;
    }
    
    // Fix weapon/armour type
    if (data.system.type && (WEAPON_TYPE_MAP[data.system.type] || ARMOUR_TYPE_MAP[data.system.type])) {
      const newType = WEAPON_TYPE_MAP[data.system.type] || ARMOUR_TYPE_MAP[data.system.type];
      changes.push(`type: ${data.system.type} -> ${newType}`);
      data.system.type = newType;
      modified = true;
    }
    // Catch-all: Any "Exotic - *" or "Relic*" becomes "exotic"
    else if (data.system.type && (data.system.type.startsWith('Exotic') || data.system.type.startsWith('Relic'))) {
      changes.push(`type: ${data.system.type} -> exotic`);
      data.system.type = 'exotic';
      modified = true;
    }
    // Catch-all: Any Xenos race variants become "xenos"
    else if (data.system.type && (data.system.type.includes('Ork') || data.system.type.includes('Tau') || 
             data.system.type.includes('Kroot') || data.system.type.includes('Eldar') || 
             data.system.type.includes('Kabalite') || data.system.type.includes('Necron') || 
             data.system.type.includes('Tyranid') || data.system.type.includes('Stryxis') ||
             data.system.type.includes("Rak'Gol") || data.system.type.includes('Kursian') ||
             data.system.type.includes("Q'Sal") || data.system.type.includes('Egerian'))) {
      changes.push(`type: ${data.system.type} -> xenos`);
      data.system.type = 'xenos';
      modified = true;
    }
    
    // Fix damage type
    if (data.system.damageType && DAMAGE_TYPE_MAP[data.system.damageType]) {
      changes.push(`damageType: ${data.system.damageType} -> damage.type: ${DAMAGE_TYPE_MAP[data.system.damageType]}`);
      if (!data.system.damage) data.system.damage = {};
      data.system.damage.type = DAMAGE_TYPE_MAP[data.system.damageType];
      // Keep old field for now to avoid breaking things
      modified = true;
    }
    
    // Fix availability
    if (data.system.availability && AVAILABILITY_MAP[data.system.availability]) {
      changes.push(`availability: ${data.system.availability} -> ${AVAILABILITY_MAP[data.system.availability]}`);
      data.system.availability = AVAILABILITY_MAP[data.system.availability];
      modified = true;
    }
    
    // Fix craftsmanship
    if (data.system.craftsmanship && CRAFTSMANSHIP_MAP[data.system.craftsmanship]) {
      changes.push(`craftsmanship: ${data.system.craftsmanship} -> ${CRAFTSMANSHIP_MAP[data.system.craftsmanship]}`);
      data.system.craftsmanship = CRAFTSMANSHIP_MAP[data.system.craftsmanship];
      modified = true;
    }
    
    if (modified) {
      console.log(`\n${path.basename(filePath)}:`);
      changes.forEach(c => console.log(`  - ${c}`));
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
      return true;
    }
    
    return false;
  } catch (err) {
    console.error(`Error processing ${filePath}:`, err.message);
    return false;
  }
}

function main() {
  const packDir = path.join(__dirname, '..', 'src', 'packs');
  
  glob('**/*.json', { cwd: packDir, absolute: true }, (err, files) => {
    if (err) {
      console.error('Glob error:', err);
      return;
    }
    
    console.log(`Found ${files.length} JSON files in ${packDir}\n`);
    console.log('='.repeat(70));
    
    let fixedCount = 0;
    for (const file of files) {
      if (migrateFile(file)) fixedCount++;
    }
    
    console.log('\n' + '='.repeat(70));
    console.log(`\nMigrated ${fixedCount} files`);
  });
}

main();
