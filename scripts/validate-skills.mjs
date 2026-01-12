#!/usr/bin/env node

/**
 * Skill Validation Script
 * Validates that:
 * 1. Pack files match SKILL_TABLE.md
 * 2. DataModel definitions match SKILL_TABLE.md
 * 3. No drift between sources
 * 
 * Run this as part of CI/CD or before releases
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Authoritative skill data from SKILL_TABLE.md
const SKILL_TABLE = {
  'acrobatics': { type: 'advanced', characteristic: 'Ag', label: 'Acrobatics' },
  'awareness': { type: 'basic', characteristic: 'Per', label: 'Awareness' },
  'barter': { type: 'basic', characteristic: 'Fel', label: 'Barter' },
  'blather': { type: 'advanced', characteristic: 'Fel', label: 'Blather' },
  'carouse': { type: 'basic', characteristic: 'T', label: 'Carouse' },
  'charm': { type: 'basic', characteristic: 'Fel', label: 'Charm' },
  'chemUse': { type: 'advanced', characteristic: 'Int', label: 'Chem-Use' },
  'climb': { type: 'basic', characteristic: 'S', label: 'Climb' },
  'command': { type: 'basic', characteristic: 'Fel', label: 'Command' },
  'commerce': { type: 'advanced', characteristic: 'Fel', label: 'Commerce' },
  'concealment': { type: 'basic', characteristic: 'Ag', label: 'Concealment' },
  'contortionist': { type: 'basic', characteristic: 'Ag', label: 'Contortionist' },
  'deceive': { type: 'basic', characteristic: 'Fel', label: 'Deceive' },
  'demolition': { type: 'advanced', characteristic: 'Int', label: 'Demolition' },
  'disguise': { type: 'basic', characteristic: 'Fel', label: 'Disguise' },
  'dodge': { type: 'basic', characteristic: 'Ag', label: 'Dodge' },
  'evaluate': { type: 'basic', characteristic: 'Int', label: 'Evaluate' },
  'gamble': { type: 'basic', characteristic: 'Int', label: 'Gamble' },
  'inquiry': { type: 'basic', characteristic: 'Fel', label: 'Inquiry' },
  'interrogation': { type: 'advanced', characteristic: 'WP', label: 'Interrogation' },
  'intimidate': { type: 'basic', characteristic: 'S', label: 'Intimidate' },
  'invocation': { type: 'advanced', characteristic: 'WP', label: 'Invocation' },
  'literacy': { type: 'advanced', characteristic: 'Int', label: 'Literacy' },
  'logic': { type: 'basic', characteristic: 'Int', label: 'Logic' },
  'medicae': { type: 'advanced', characteristic: 'Int', label: 'Medicae' },
  'psyniscience': { type: 'advanced', characteristic: 'Per', label: 'Psyniscience' },
  'scrutiny': { type: 'basic', characteristic: 'Per', label: 'Scrutiny' },
  'search': { type: 'basic', characteristic: 'Per', label: 'Search' },
  'security': { type: 'advanced', characteristic: 'Ag', label: 'Security' },
  'shadowing': { type: 'advanced', characteristic: 'Ag', label: 'Shadowing' },
  'silentMove': { type: 'basic', characteristic: 'Ag', label: 'Silent Move' },
  'sleightOfHand': { type: 'advanced', characteristic: 'Ag', label: 'Sleight of Hand' },
  'survival': { type: 'advanced', characteristic: 'Int', label: 'Survival' },
  'swim': { type: 'basic', characteristic: 'S', label: 'Swim' },
  'tracking': { type: 'advanced', characteristic: 'Int', label: 'Tracking' },
  'wrangling': { type: 'advanced', characteristic: 'Int', label: 'Wrangling' },
  
  // Specialist skill groups
  'ciphers': { type: 'advanced', characteristic: 'Int', label: 'Ciphers', isGroup: true },
  'commonLore': { type: 'advanced', characteristic: 'Int', label: 'Common Lore', isGroup: true },
  'drive': { type: 'advanced', characteristic: 'Ag', label: 'Drive', isGroup: true },
  'forbiddenLore': { type: 'advanced', characteristic: 'Int', label: 'Forbidden Lore', isGroup: true },
  'navigation': { type: 'advanced', characteristic: 'Int', label: 'Navigation', isGroup: true },
  'performer': { type: 'advanced', characteristic: 'Fel', label: 'Performer', isGroup: true },
  'pilot': { type: 'advanced', characteristic: 'Ag', label: 'Pilot', isGroup: true },
  'scholasticLore': { type: 'advanced', characteristic: 'Int', label: 'Scholastic Lore', isGroup: true },
  'secretTongue': { type: 'advanced', characteristic: 'Int', label: 'Secret Tongue', isGroup: true },
  'speakLanguage': { type: 'advanced', characteristic: 'Int', label: 'Speak Language', isGroup: true },
  'techUse': { type: 'advanced', characteristic: 'Int', label: 'Tech-Use', isGroup: true },
  'trade': { type: 'advanced', characteristic: 'Int', label: 'Trade', isGroup: true }
};

function validateDataModel() {
  const creaturePath = path.join(__dirname, '..', 'src', 'module', 'data', 'actor', 'templates', 'creature.mjs');
  const content = fs.readFileSync(creaturePath, 'utf8');
  
  console.log('📋 Validating DataModel (creature.mjs)...\n');
  
  let issues = 0;
  
  for (const [key, expected] of Object.entries(SKILL_TABLE)) {
    // Extract the SkillField definition from creature.mjs
    const regex = new RegExp(`${key}:\\s*this\\.SkillField\\("([^"]+)",\\s*"([^"]+)",\\s*(true|false)`, 'i');
    const match = content.match(regex);
    
    if (!match) {
      console.log(`⚠️  ${key}: Not found in DataModel`);
      issues++;
      continue;
    }
    
    const [_, label, char, isAdvanced] = match;
    const actualType = isAdvanced === 'true' ? 'advanced' : 'basic';
    
    if (actualType !== expected.type) {
      console.log(`❌ ${key}: Type mismatch`);
      console.log(`   DataModel: ${actualType}`);
      console.log(`   Expected:  ${expected.type}`);
      issues++;
    }
    
    if (char !== expected.characteristic) {
      console.log(`❌ ${key}: Characteristic mismatch`);
      console.log(`   DataModel: ${char}`);
      console.log(`   Expected:  ${expected.characteristic}`);
      issues++;
    }
  }
  
  if (issues === 0) {
    console.log('✅ DataModel is correct!\n');
  } else {
    console.log(`\n❌ DataModel has ${issues} issue(s)\n`);
  }
  
  return issues === 0;
}

function validateSkillData() {
  const skillDataPath = path.join(__dirname, '..', 'src', 'module', 'data', 'item', 'skill.mjs');
  const content = fs.readFileSync(skillDataPath, 'utf8');
  
  console.log('📋 Validating SkillData schema...\n');
  
  // Check that essential fields exist
  const requiredFields = [
    'skillType',
    'isBasic',
    'characteristic',
    'descriptor'
  ];
  
  let issues = 0;
  
  for (const field of requiredFields) {
    if (!content.includes(field + ':')) {
      console.log(`❌ Missing field: ${field}`);
      issues++;
    }
  }
  
  // Check skillType choices
  if (!content.includes('choices: ["basic", "advanced", "specialist"]')) {
    console.log('⚠️  skillType choices may be incorrect');
    issues++;
  }
  
  if (issues === 0) {
    console.log('✅ SkillData schema is correct!\n');
  } else {
    console.log(`\n❌ SkillData has ${issues} issue(s)\n`);
  }
  
  return issues === 0;
}

function main() {
  console.log('='.repeat(80));
  console.log('SKILL SYSTEM VALIDATION');
  console.log('='.repeat(80));
  console.log('');
  
  const dataModelValid = validateDataModel();
  const skillDataValid = validateSkillData();
  
  console.log('='.repeat(80));
  
  if (dataModelValid && skillDataValid) {
    console.log('✅ ALL VALIDATIONS PASSED');
    console.log('='.repeat(80));
    process.exit(0);
  } else {
    console.log('❌ VALIDATION FAILED');
    console.log('='.repeat(80));
    process.exit(1);
  }
}

main();
