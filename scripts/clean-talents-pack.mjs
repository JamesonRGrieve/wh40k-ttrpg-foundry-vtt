/**
 * Clean Talents Pack - Phase 1
 * Normalizes all 650 talent files to match DataModel schema
 * 
 * Tasks:
 * 1. Migrate requirements → prerequisites.text
 * 2. Migrate effect → benefit
 * 3. Clean category field (make semantic)
 * 4. Parse aptitudes from requirements if empty
 * 5. Add missing fields: isPassive, cost
 * 6. Move Traits to traits pack
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PACK_DIR = path.resolve(__dirname, '../src/packs/rt-items-talents/_source/');
const TRAITS_DIR = path.resolve(__dirname, '../src/packs/rt-items-traits/_source/');

// Semantic categories based on talent name/effect
const SEMANTIC_CATEGORIES = {
  combat: ['weapon', 'attack', 'damage', 'melee', 'ranged', 'two-weapon', 'swift attack', 'lightning attack', 'furious assault', 'devastating', 'marksman', 'crack shot', 'deadeye', 'rapid reload', 'mighty shot'],
  social: ['charm', 'deceive', 'interrogat', 'command', 'fellowship', 'peer', 'rival', 'enemy', 'air of authority', 'inspire', 'into the jaws'],
  knowledge: ['lore', 'logic', 'tech', 'medicae', 'intelligence', 'scholastic', 'polyglot'],
  leadership: ['command', 'inspire', 'rally', 'order', 'master and commander', 'battlesuit', 'unto the anvil'],
  psychic: ['psy', 'warp', 'psychic', 'power', 'minor power', 'major power', 'push', 'favoured by the warp'],
  technical: ['tech-use', 'craft', 'repair', 'operate', 'weapon-tech', 'armorer', 'mechadendrite'],
  defense: ['armor', 'dodge', 'parry', 'resist', 'toughness', 'step aside', 'hard target', 'nerves of steel', 'jaded', 'resistance'],
  willpower: ['willpower', 'faith', 'hatred', 'frenzy', 'true grit', 'fearless', 'adamantium'],
  movement: ['sprint', 'leap', 'catfall', 'wall of steel', 'crippling strike'],
  unique: ['touched by the fates', 'flesh renders', 'unnatural']
};

// XP cost by tier (base costs)
const TIER_COSTS = { 0: 0, 1: 300, 2: 600, 3: 900 };

// Statistics
const stats = {
  total: 0,
  cleaned: 0,
  moved: 0,
  errors: 0,
  fixedBenefit: 0,
  fixedPrerequisites: 0,
  fixedAptitudes: 0,
  fixedCategory: 0,
  addedCost: 0,
  addedIsPassive: 0
};

/**
 * Parse aptitudes from requirements text.
 */
function parseAptitudesFromRequirements(reqText) {
  if (!reqText) return [];
  
  // Match "Aptitudes: X, Y, Z" or "Aptitude: X"
  const match = reqText.match(/Aptitudes?:\s*([^\n]+)/i);
  if (!match) return [];
  
  return match[1]
    .split(',')
    .map(s => s.trim())
    .filter(s => s && s.toLowerCase() !== 'none');
}

/**
 * Parse prerequisites from requirements text.
 */
function parsePrerequisites(reqText) {
  if (!reqText) {
    return {
      text: "",
      characteristics: {},
      skills: [],
      talents: []
    };
  }
  
  // Remove tier info and aptitudes
  let cleanText = reqText
    .replace(/Tier \d+;\s*/gi, '')
    .replace(/Aptitudes?:\s*[^\n]+/gi, '')
    .trim();
  
  // Parse characteristics (e.g. "WP 45", "Agility 30")
  const charMatches = cleanText.matchAll(/\b([A-Z]{2,3}|Agility|Strength|Toughness|Willpower|Intelligence|Perception|Fellowship|Weapon Skill|Ballistic Skill)\s+(\d+)\+?/gi);
  const characteristics = {};
  
  for (const match of charMatches) {
    let char = match[1].toLowerCase();
    const value = parseInt(match[2]);
    
    // Normalize characteristic names
    if (char === 'weapon skill' || char === 'weaponskill') char = 'ws';
    if (char === 'ballistic skill' || char === 'ballisticskill') char = 'bs';
    if (char === 'agility') char = 'ag';
    if (char === 'strength') char = 's';
    if (char === 'toughness') char = 't';
    if (char === 'willpower') char = 'wp';
    if (char === 'intelligence') char = 'int';
    if (char === 'perception') char = 'per';
    if (char === 'fellowship') char = 'fel';
    
    characteristics[char] = value;
  }
  
  // Store clean text for display
  const textLines = cleanText.split('\n').filter(l => l.trim());
  const displayText = textLines[0] || "";
  
  return {
    text: displayText,
    characteristics,
    skills: [],  // Could parse skill names but complex
    talents: []  // Could parse talent names but complex
  };
}

/**
 * Determine semantic category from talent name and effect.
 */
function determineSemanticCategory(name, effect) {
  const text = (name + ' ' + effect).toLowerCase();
  
  for (const [category, keywords] of Object.entries(SEMANTIC_CATEGORIES)) {
    if (keywords.some(kw => text.includes(kw))) {
      return category;
    }
  }
  
  return 'general';
}

/**
 * Clean a single talent file.
 */
function cleanTalentFile(filename) {
  const filepath = path.join(PACK_DIR, filename);
  
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse JSON: ${err.message}`);
  }
  
  const sys = data.system;
  
  // Check if this is actually a Trait
  if (sys.category && (sys.category.includes('Trait') || data.type === 'trait')) {
    const newPath = path.join(TRAITS_DIR, filename);
    fs.writeFileSync(newPath, JSON.stringify(data, null, 2) + '\n');
    fs.unlinkSync(filepath);
    stats.moved++;
    return { moved: true };
  }
  
  let changed = false;
  
  // 1. Migrate requirements → prerequisites
  if (sys.requirements && typeof sys.requirements === 'string') {
    sys.prerequisites = parsePrerequisites(sys.requirements);
    delete sys.requirements;
    stats.fixedPrerequisites++;
    changed = true;
  } else if (!sys.prerequisites) {
    sys.prerequisites = {
      text: "",
      characteristics: {},
      skills: [],
      talents: []
    };
    changed = true;
  }
  
  // 2. Migrate effect → benefit
  if (sys.effect && !sys.benefit) {
    sys.benefit = sys.effect.startsWith('<') ? sys.effect : `<p>${sys.effect}</p>`;
    delete sys.effect;
    stats.fixedBenefit++;
    changed = true;
  } else if (!sys.benefit && sys.description?.value) {
    sys.benefit = sys.description.value;
    stats.fixedBenefit++;
    changed = true;
  }
  
  // 3. Parse aptitudes from old requirements if empty
  if (!sys.aptitudes || sys.aptitudes.length === 0) {
    const oldReq = data.system.requirements || sys.prerequisites?.text || '';
    const parsed = parseAptitudesFromRequirements(oldReq);
    if (parsed.length > 0) {
      sys.aptitudes = parsed;
      stats.fixedAptitudes++;
      changed = true;
    } else {
      sys.aptitudes = [];
      changed = true;
    }
  }
  
  // 4. Clean category (make semantic)
  if (sys.category && (sys.category.includes('Talent') || sys.category.includes('T1') || sys.category.includes('T2') || sys.category.includes('T3'))) {
    sys.category = determineSemanticCategory(data.name, sys.benefit || '');
    stats.fixedCategory++;
    changed = true;
  } else if (!sys.category) {
    sys.category = 'general';
    stats.fixedCategory++;
    changed = true;
  }
  
  // 5. Add cost if missing
  if (sys.cost === undefined || sys.cost === null) {
    sys.cost = TIER_COSTS[sys.tier] || 0;
    stats.addedCost++;
    changed = true;
  }
  
  // 6. Add isPassive if missing
  if (sys.isPassive === undefined) {
    sys.isPassive = true; // Default to passive
    stats.addedIsPassive++;
    changed = true;
  }
  
  // 7. Remove empty modifiers object if present
  if (sys.modifiers && typeof sys.modifiers === 'object') {
    const isEmpty = Object.keys(sys.modifiers).length === 0 || 
                   (Object.keys(sys.modifiers).every(k => {
                     const v = sys.modifiers[k];
                     return !v || (typeof v === 'object' && Object.keys(v).length === 0) ||
                            (Array.isArray(v) && v.length === 0);
                   }));
    if (isEmpty) {
      delete sys.modifiers;
      changed = true;
    }
  }
  
  // Write back only if changed
  if (changed) {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2) + '\n');
    stats.cleaned++;
  }
  
  return { cleaned: changed };
}

/**
 * Main execution
 */
function main() {
  console.log('Talents Pack Cleaning Script');
  console.log('=' .repeat(60));
  
  // Ensure traits directory exists
  if (!fs.existsSync(TRAITS_DIR)) {
    fs.mkdirSync(TRAITS_DIR, { recursive: true });
  }
  
  const files = fs.readdirSync(PACK_DIR).filter(f => f.endsWith('.json'));
  stats.total = files.length;
  
  console.log(`\nProcessing ${stats.total} files...\n`);
  
  for (const file of files) {
    try {
      cleanTalentFile(file);
    } catch (err) {
      console.error(`❌ Error processing ${file}:`, err.message);
      stats.errors++;
    }
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('CLEANING COMPLETE');
  console.log('=' .repeat(60));
  console.log(`Total Files:              ${stats.total}`);
  console.log(`Files Cleaned:            ${stats.cleaned}`);
  console.log(`Traits Moved:             ${stats.moved}`);
  console.log(`Errors:                   ${stats.errors}`);
  console.log(`\nFixes Applied:`);
  console.log(`  Fixed benefit:          ${stats.fixedBenefit}`);
  console.log(`  Fixed prerequisites:    ${stats.fixedPrerequisites}`);
  console.log(`  Fixed aptitudes:        ${stats.fixedAptitudes}`);
  console.log(`  Fixed category:         ${stats.fixedCategory}`);
  console.log(`  Added cost:             ${stats.addedCost}`);
  console.log(`  Added isPassive:        ${stats.addedIsPassive}`);
  console.log('=' .repeat(60));
}

// Run the script
main();
