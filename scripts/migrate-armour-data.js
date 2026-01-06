#!/usr/bin/env node

/**
 * Migrate armour pack data from legacy schema to V13 schema
 * 
 * CHANGES:
 * 1. locations (string) -> coverage (Set<string>)
 * 2. ap (number/string) -> armourPoints (object with head/body/arms/legs)
 * 3. installedMods -> modifications
 * 4. maxAg: "-" or null -> maxAgility: null
 * 5. Handle special AP values (percentages, "Special")
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

/**
 * Parse legacy location string into coverage array
 */
function parseLocations(locationsStr) {
  if (!locationsStr || typeof locationsStr !== 'string') return ['body'];
  
  const normalized = locationsStr.toLowerCase();
  if (normalized.includes('all')) {
    return ['all'];
  }
  
  const coverage = [];
  const tokens = normalized.split(',').map(t => t.trim()).filter(Boolean);
  
  for (const token of tokens) {
    if (token.includes('head')) coverage.push('head');
    if (token.includes('body') || token.includes('chest') || token.includes('torso')) {
      coverage.push('body');
    }
    if (token.includes('arm')) {
      if (!coverage.includes('leftArm')) coverage.push('leftArm');
      if (!coverage.includes('rightArm')) coverage.push('rightArm');
    }
    if (token.includes('leg')) {
      if (!coverage.includes('leftLeg')) coverage.push('leftLeg');
      if (!coverage.includes('rightLeg')) coverage.push('rightLeg');
    }
  }
  
  return coverage.length ? coverage : ['body'];
}

/**
 * Parse legacy AP value into armourPoints object
 */
function parseAP(apValue, coverage) {
  const armourPoints = {
    head: 0,
    body: 0,
    leftArm: 0,
    rightArm: 0,
    leftLeg: 0,
    rightLeg: 0
  };
  
  // Handle null/undefined
  if (apValue === null || apValue === undefined) return armourPoints;
  
  // Handle number
  if (typeof apValue === 'number') {
    // Apply to all covered locations
    if (coverage.includes('all')) {
      Object.keys(armourPoints).forEach(loc => armourPoints[loc] = apValue);
    } else {
      coverage.forEach(loc => {
        if (armourPoints.hasOwnProperty(loc)) {
          armourPoints[loc] = apValue;
        }
      });
    }
    return armourPoints;
  }
  
  // Handle string
  if (typeof apValue === 'string') {
    // Skip special values (force fields, percentages)
    if (apValue.includes('%') || apValue.toLowerCase().includes('special') || 
        apValue.toLowerCase().includes('psy')) {
      // Leave as 0, game logic will handle force fields differently
      return armourPoints;
    }
    
    // Extract numbers
    const values = apValue.match(/-?\d+/g);
    if (!values) return armourPoints;
    
    const parsed = values.map(v => Number(v));
    
    if (parsed.length === 1) {
      // Single value, apply to covered locations
      if (coverage.includes('all')) {
        Object.keys(armourPoints).forEach(loc => armourPoints[loc] = parsed[0]);
      } else {
        coverage.forEach(loc => {
          if (armourPoints.hasOwnProperty(loc)) {
            armourPoints[loc] = parsed[0];
          }
        });
      }
    } else if (parsed.length === 4) {
      // Format: head/body/arms/legs
      armourPoints.head = parsed[0];
      armourPoints.body = parsed[1];
      armourPoints.leftArm = parsed[2];
      armourPoints.rightArm = parsed[2];
      armourPoints.leftLeg = parsed[3];
      armourPoints.rightLeg = parsed[3];
    } else if (parsed.length >= 6) {
      // Format: head/body/leftArm/rightArm/leftLeg/rightLeg
      armourPoints.head = parsed[0];
      armourPoints.body = parsed[1];
      armourPoints.leftArm = parsed[2];
      armourPoints.rightArm = parsed[3];
      armourPoints.leftLeg = parsed[4];
      armourPoints.rightLeg = parsed[5];
    }
  }
  
  return armourPoints;
}

function migrateArmour(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    
    if (data.type !== 'armour' || !data.system) return false;
    
    let modified = false;
    const changes = [];
    
    // Migrate locations -> coverage
    if (data.system.locations !== undefined && data.system.coverage === undefined) {
      const coverage = parseLocations(data.system.locations);
      data.system.coverage = coverage;
      changes.push(`locations: "${data.system.locations}" -> coverage: [${coverage.join(', ')}]`);
      modified = true;
    }
    
    // Migrate ap -> armourPoints
    if (data.system.ap !== undefined && data.system.armourPoints === undefined) {
      const coverage = data.system.coverage || parseLocations(data.system.locations);
      const armourPoints = parseAP(data.system.ap, coverage);
      data.system.armourPoints = armourPoints;
      const apStr = typeof data.system.ap === 'string' ? `"${data.system.ap}"` : data.system.ap;
      changes.push(`ap: ${apStr} -> armourPoints: ${JSON.stringify(armourPoints)}`);
      modified = true;
    }
    
    // Migrate installedMods -> modifications
    if (data.system.installedMods !== undefined && data.system.modifications === undefined) {
      data.system.modifications = data.system.installedMods;
      changes.push(`installedMods -> modifications (${data.system.installedMods.length} items)`);
      modified = true;
    }
    
    // Migrate maxAg -> maxAgility
    if (data.system.maxAg !== undefined && data.system.maxAgility === undefined) {
      const maxAg = data.system.maxAg;
      data.system.maxAgility = (maxAg === '-' || maxAg === null || maxAg === undefined) ? null : Number(maxAg);
      changes.push(`maxAg: "${maxAg}" -> maxAgility: ${data.system.maxAgility}`);
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
  const armourDir = path.join(__dirname, '..', 'src', 'packs', 'rt-items-armour', '_source');
  
  glob('*.json', { cwd: armourDir, absolute: true }, (err, files) => {
    if (err) {
      console.error('Glob error:', err);
      return;
    }
    
    console.log(`Found ${files.length} armour files in ${armourDir}\n`);
    console.log('='.repeat(70));
    
    let fixedCount = 0;
    for (const file of files) {
      if (migrateArmour(file)) fixedCount++;
    }
    
    console.log('\n' + '='.repeat(70));
    console.log(`\nMigrated ${fixedCount} armour items`);
  });
}

main();
