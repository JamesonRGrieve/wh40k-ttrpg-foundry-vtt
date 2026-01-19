/**
 * Remap Non-Standard Talent Categories
 * Converts non-standard categories to the 8 valid categories:
 * combat, knowledge, general, origin, social, leadership, tech, psychic
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TALENTS_DIR = path.join(__dirname, '../src/packs/rt-items-talents/_source');

// Category remapping rules
const categoryMap = {
  'defense': 'combat',      // Defensive combat talents
  'career': 'general',      // Career-specific talents (will keep origin if tier 0)
  'technical': 'tech',      // Technical abilities
  'movement': 'combat',     // Movement-related combat abilities
  'willpower': 'general',   // Willpower-based abilities
  'unique': 'general'       // Unique/miscellaneous talents
};

async function remapCategories() {
  const files = fs.readdirSync(TALENTS_DIR).filter(f => f.endsWith('.json'));
  
  console.log(`\n=== REMAPPING TALENT CATEGORIES ===\n`);
  
  let remappedCount = 0;
  const remappedTalents = {};
  
  for (const file of files) {
    const filePath = path.join(TALENTS_DIR, file);
    const talent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    
    const oldCategory = talent.system.category;
    
    // Skip if already valid
    if (!categoryMap[oldCategory]) {
      continue;
    }
    
    // Special case: career talents with tier 0 should be origin
    let newCategory = categoryMap[oldCategory];
    if (oldCategory === 'career' && talent.system.tier === 0) {
      newCategory = 'origin';
    }
    
    // Update category
    talent.system.category = newCategory;
    
    // Write back to file
    fs.writeFileSync(filePath, JSON.stringify(talent, null, 2) + '\n', 'utf-8');
    
    remappedCount++;
    remappedTalents[oldCategory] = remappedTalents[oldCategory] || [];
    remappedTalents[oldCategory].push({
      name: talent.name,
      file,
      oldCategory,
      newCategory
    });
    
    console.log(`✅ ${talent.name}`);
    console.log(`   ${oldCategory} → ${newCategory}`);
  }
  
  console.log(`\n=== SUMMARY ===`);
  console.log(`Total talents remapped: ${remappedCount}\n`);
  
  for (const [oldCat, talents] of Object.entries(remappedTalents)) {
    console.log(`${oldCat} (${talents.length} talents):`);
    const newCats = [...new Set(talents.map(t => t.newCategory))];
    console.log(`  → ${newCats.join(', ')}\n`);
  }
  
  console.log(`Run audit script to verify: node scripts/audit-talents.mjs`);
}

remapCategories().catch(console.error);
