#!/usr/bin/env node

/**
 * Fix capitalized availability values in pack JSON files
 * Converts "Common" -> "common", "Very Rare" -> "very-rare", etc.
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

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

async function fixFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    
    let modified = false;
    
    // Fix availability
    if (data.system?.availability && AVAILABILITY_MAP[data.system.availability]) {
      console.log(`${filePath}: availability "${data.system.availability}" -> "${AVAILABILITY_MAP[data.system.availability]}"`);
      data.system.availability = AVAILABILITY_MAP[data.system.availability];
      modified = true;
    }
    
    // Fix craftsmanship
    if (data.system?.craftsmanship && CRAFTSMANSHIP_MAP[data.system.craftsmanship]) {
      console.log(`${filePath}: craftsmanship "${data.system.craftsmanship}" -> "${CRAFTSMANSHIP_MAP[data.system.craftsmanship]}"`);
      data.system.craftsmanship = CRAFTSMANSHIP_MAP[data.system.craftsmanship];
      modified = true;
    }
    
    if (modified) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
      return 1;
    }
    
    return 0;
  } catch (err) {
    console.error(`Error processing ${filePath}:`, err.message);
    return 0;
  }
}

async function main() {
  const packDir = path.join(__dirname, '..', 'src', 'packs');
  
  return new Promise((resolve, reject) => {
    glob('**/*.json', { cwd: packDir, absolute: true }, async (err, files) => {
      if (err) return reject(err);
      
      console.log(`Found ${files.length} JSON files in ${packDir}`);
      
      let fixedCount = 0;
      for (const file of files) {
        fixedCount += await fixFile(file);
      }
      
      console.log(`\nFixed ${fixedCount} files`);
      resolve();
    });
  });
}

main().catch(console.error);
