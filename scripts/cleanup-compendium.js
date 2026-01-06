#!/usr/bin/env node
/**
 * Compendium Data Cleanup Script
 * 
 * Cleans up skills, talents, and traits compendium entries:
 * 1. Skills: Parse legacy 'type' field, extract aptitudes, set proper skillType
 * 2. Talents: Consolidate effect/benefit, parse requirements
 * 3. Traits: Consolidate effects/effect, set proper categories
 * 4. Remove non-skill items from skills pack
 */

const fs = require('fs');
const path = require('path');

const PACKS_DIR = path.join(__dirname, '..', 'src/packs');

// Valid characteristics for skills
const VALID_CHARACTERISTICS = [
  'weaponSkill', 'ballisticSkill', 'strength', 'toughness', 'agility',
  'intelligence', 'perception', 'willpower', 'fellowship',
  'Weapon Skill', 'Ballistic Skill', 'Strength', 'Toughness', 'Agility',
  'Intelligence', 'Perception', 'Willpower', 'Fellowship'
];

// Map display names to internal names
const CHAR_MAP = {
  'Weapon Skill': 'weaponSkill',
  'Ballistic Skill': 'ballisticSkill',
  'Strength': 'strength',
  'Toughness': 'toughness',
  'Agility': 'agility',
  'Intelligence': 'intelligence',
  'Perception': 'perception',
  'Willpower': 'willpower',
  'Fellowship': 'fellowship'
};

// Items that should be REMOVED from skills pack (not actual skills)
const SKILLS_TO_REMOVE = [
  // Characteristics
  'Agility (AG)', 'Ballistic Skill (BS)', 'Fellowship (FEL)', 'Intelligence (INT)',
  'Perception (PER)', 'Strength (S)', 'Toughness (T)', 'Weapon Skill (WS)', 'Willpower (WP)',
  // Aptitudes
  'Khorne', 'Nurgle', 'Slaanesh', 'Tzeentch', 'Unaligned',
  // Elite Advances (have XP costs in characteristic field)
  'Agent of the Throne', 'Astropath', 'Cog Whisperer', 'Glimpse from Beyond',
  'Hexicar', 'Inquisitor', 'Nascent Psyker', 'Psyker', 'Sanctioned Xenos',
  'Sister of Battle', 'Sorcerer', 'Untouchable', 'Void-Mad Prophet',
  'Cybernetic Resurrection (Cyber-Rebuild)', 'Cybernetic Resurrection (Full Resurrection)',
  'Rite of Duplessence', 'The Cult of the Red Redemption', 'Medicae (add.)'
];

function parseAptitudesFromType(typeField) {
  if (!typeField) return [];
  
  // Look for "Apt:" or "Aptitude:" pattern
  const aptMatch = typeField.match(/Apt(?:itude)?s?:\s*([^\n]+)/i);
  if (aptMatch) {
    return aptMatch[1].split(',').map(a => a.trim()).filter(a => a);
  }
  return [];
}

function parseSkillTypeFromType(typeField) {
  if (!typeField) return 'basic';
  
  const lower = typeField.toLowerCase();
  if (lower.includes('advanced')) return 'advanced';
  if (lower.includes('specialist')) return 'specialist';
  return 'basic';
}

function cleanSkill(data) {
  const system = data.system || {};
  
  // Normalize characteristic
  let char = system.characteristic || '';
  if (CHAR_MAP[char]) {
    char = CHAR_MAP[char];
  } else if (!VALID_CHARACTERISTICS.includes(char)) {
    // If characteristic contains description text, try to extract from rollConfig
    if (system.rollConfig?.characteristic && CHAR_MAP[system.rollConfig.characteristic]) {
      char = CHAR_MAP[system.rollConfig.characteristic];
    } else {
      char = ''; // Invalid, leave blank
    }
  }
  
  // Parse aptitudes from legacy type field
  const aptitudes = parseAptitudesFromType(system.type);
  
  // Determine skill type
  let skillType = system.skillType;
  if (!skillType || skillType === '') {
    skillType = parseSkillTypeFromType(system.type);
    // Check name for (X) pattern indicating specialist
    if (data.name && data.name.includes('(X)')) {
      skillType = 'specialist';
    }
  }
  
  // Clean descriptor - use existing or pull from description
  let descriptor = system.descriptor;
  if (!descriptor && system.description?.value) {
    // Strip HTML tags and use first 200 chars
    descriptor = system.description.value.replace(/<[^>]*>/g, '').substring(0, 200);
  }
  
  return {
    ...data,
    system: {
      ...system,
      characteristic: char.toLowerCase(),
      skillType: skillType,
      aptitudes: aptitudes.length > 0 ? aptitudes : (system.aptitudes || []),
      descriptor: descriptor || '',
      source: system.source || '',
      // Remove legacy type field content but keep field for compatibility
      type: ''
    }
  };
}

function cleanTalent(data) {
  const system = data.system || {};
  
  // Consolidate effect and benefit
  let effect = system.benefit || system.effect || '';
  
  // Parse tier from requirements if missing
  let tier = system.tier || 1;
  const req = system.requirements || '';
  if (req.toLowerCase().includes('tier 2') || req.includes('T2')) tier = 2;
  if (req.toLowerCase().includes('tier 3') || req.includes('T3')) tier = 3;
  
  // Parse aptitudes from requirements if missing
  let aptitudes = system.aptitudes || [];
  if ((!aptitudes || aptitudes.length === 0) && req) {
    const aptMatch = req.match(/Apt(?:itude)?s?:\s*([^;]+)/i);
    if (aptMatch) {
      aptitudes = aptMatch[1].split(',').map(a => a.trim()).filter(a => a);
    }
  }
  
  return {
    ...data,
    system: {
      ...system,
      tier: tier,
      effect: effect,
      benefit: '', // Consolidate to effect field
      aptitudes: aptitudes,
      source: system.source || '',
      requirements: system.requirements || ''
    }
  };
}

function cleanTrait(data) {
  const system = data.system || {};
  
  // Consolidate effects fields
  let effect = system.effect || system.effects || system.descriptionText || '';
  
  // Determine category
  let category = system.category || 'creature';
  const name = data.name?.toLowerCase() || '';
  if (name.includes('mutation')) category = 'mutation';
  if (system.requirements?.includes('Origin')) category = 'origin';
  
  // Parse level from name if present (e.g., "Unnatural Strength (2)")
  let level = system.level;
  const levelMatch = data.name?.match(/\((\d+)\)$/);
  if (levelMatch && !level) {
    level = parseInt(levelMatch[1]);
  }
  
  return {
    ...data,
    system: {
      ...system,
      category: category,
      effect: effect,
      effects: '', // Clear legacy field
      descriptionText: '', // Clear legacy field
      level: level || null,
      source: system.source || ''
    }
  };
}

function processDirectory(packPath, cleanFn, removeList = []) {
  const sourceDir = path.join(packPath, '_source');
  if (!fs.existsSync(sourceDir)) {
    console.log(`  Skipping ${packPath} - no _source directory`);
    return { processed: 0, removed: 0 };
  }
  
  const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.json'));
  let processed = 0;
  let removed = 0;
  
  for (const file of files) {
    const filePath = path.join(sourceDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    
    // Check if should be removed
    if (removeList.includes(data.name)) {
      console.log(`  REMOVING: ${data.name}`);
      fs.unlinkSync(filePath);
      removed++;
      continue;
    }
    
    // Clean the data
    const cleaned = cleanFn(data);
    
    // Write back
    fs.writeFileSync(filePath, JSON.stringify(cleaned, null, 2));
    processed++;
  }
  
  return { processed, removed };
}

function main() {
  console.log('=== Compendium Data Cleanup ===\n');
  
  // Process Skills
  console.log('Processing Skills...');
  const skillsPath = path.join(PACKS_DIR, 'rt-items-skills');
  const skillsResult = processDirectory(skillsPath, cleanSkill, SKILLS_TO_REMOVE);
  console.log(`  Processed: ${skillsResult.processed}, Removed: ${skillsResult.removed}\n`);
  
  // Process Talents
  console.log('Processing Talents...');
  const talentsPath = path.join(PACKS_DIR, 'rt-items-talents');
  const talentsResult = processDirectory(talentsPath, cleanTalent);
  console.log(`  Processed: ${talentsResult.processed}\n`);
  
  // Process Traits
  console.log('Processing Traits...');
  const traitsPath = path.join(PACKS_DIR, 'rt-items-traits');
  const traitsResult = processDirectory(traitsPath, cleanTrait);
  console.log(`  Processed: ${traitsResult.processed}\n`);
  
  console.log('=== Cleanup Complete ===');
  console.log('Run `npm run build` to recompile the packs.');
}

main();
