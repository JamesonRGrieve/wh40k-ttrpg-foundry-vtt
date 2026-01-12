#!/usr/bin/env node

/**
 * Skill Pack Audit Script
 * Compares skill pack JSON files against SKILL_TABLE.md for inconsistencies
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Authoritative skill data from SKILL_TABLE.md
const SKILL_TABLE = {
  'Acrobatics': { type: 'Advanced', characteristic: 'Agility', descriptor: 'Movement' },
  'Awareness': { type: 'Basic', characteristic: 'Perception', descriptor: 'Exploration' },
  'Barter': { type: 'Basic', characteristic: 'Fellowship', descriptor: 'Interaction' },
  'Blather': { type: 'Advanced', characteristic: 'Fellowship', descriptor: 'Interaction' },
  'Carouse': { type: 'Basic', characteristic: 'Toughness', descriptor: '—' },
  'Charm': { type: 'Basic', characteristic: 'Fellowship', descriptor: 'Interaction' },
  'Chem-Use': { type: 'Advanced', characteristic: 'Intelligence', descriptor: 'Crafting, Investigation' },
  'Ciphers': { type: 'Advanced', characteristic: 'Intelligence', descriptor: '—', isGroup: true },
  'Climb': { type: 'Basic', characteristic: 'Strength', descriptor: 'Movement' },
  'Commerce': { type: 'Advanced', characteristic: 'Fellowship', descriptor: '—' },
  'Command': { type: 'Basic', characteristic: 'Fellowship', descriptor: 'Interaction' },
  'Common Lore': { type: 'Advanced', characteristic: 'Intelligence', descriptor: 'Investigation', isGroup: true },
  'Concealment': { type: 'Basic', characteristic: 'Agility', descriptor: '—' },
  'Contortionist': { type: 'Basic', characteristic: 'Agility', descriptor: 'Movement' },
  'Deceive': { type: 'Basic', characteristic: 'Fellowship', descriptor: 'Interaction' },
  'Demolition': { type: 'Advanced', characteristic: 'Intelligence', descriptor: 'Crafting' },
  'Disguise': { type: 'Basic', characteristic: 'Fellowship', descriptor: '—' },
  'Dodge': { type: 'Basic', characteristic: 'Agility', descriptor: '—' },
  'Drive': { type: 'Advanced', characteristic: 'Agility', descriptor: 'Operator', isGroup: true },
  'Evaluate': { type: 'Basic', characteristic: 'Intelligence', descriptor: 'Investigation' },
  'Forbidden Lore': { type: 'Advanced', characteristic: 'Intelligence', descriptor: 'Investigation', isGroup: true },
  'Gamble': { type: 'Basic', characteristic: 'Intelligence', descriptor: '—' },
  'Inquiry': { type: 'Basic', characteristic: 'Fellowship', descriptor: 'Investigation' },
  'Interrogation': { type: 'Advanced', characteristic: 'Willpower', descriptor: 'Investigation' },
  'Intimidate': { type: 'Basic', characteristic: 'Strength', descriptor: 'Interaction' },
  'Invocation': { type: 'Advanced', characteristic: 'Willpower', descriptor: '—' },
  'Literacy': { type: 'Advanced', characteristic: 'Intelligence', descriptor: '—' },
  'Logic': { type: 'Basic', characteristic: 'Intelligence', descriptor: 'Investigation' },
  'Medicae': { type: 'Advanced', characteristic: 'Intelligence', descriptor: '—' },
  'Navigation': { type: 'Advanced', characteristic: 'Intelligence', descriptor: 'Exploration', isGroup: true },
  'Performer': { type: 'Advanced', characteristic: 'Fellowship', descriptor: '—', isGroup: true },
  'Pilot': { type: 'Advanced', characteristic: 'Agility', descriptor: 'Operator', isGroup: true },
  'Psyniscience': { type: 'Advanced', characteristic: 'Perception', descriptor: '—' },
  'Scholastic Lore': { type: 'Advanced', characteristic: 'Intelligence', descriptor: 'Investigation', isGroup: true },
  'Scrutiny': { type: 'Basic', characteristic: 'Perception', descriptor: '—' },
  'Search': { type: 'Basic', characteristic: 'Perception', descriptor: 'Exploration' },
  'Secret Tongue': { type: 'Advanced', characteristic: 'Intelligence', descriptor: '—', isGroup: true },
  'Security': { type: 'Advanced', characteristic: 'Agility', descriptor: 'Exploration' },
  'Shadowing': { type: 'Advanced', characteristic: 'Agility', descriptor: '—' },
  'Silent Move': { type: 'Basic', characteristic: 'Agility', descriptor: 'Movement' },
  'Sleight of Hand': { type: 'Advanced', characteristic: 'Agility', descriptor: '—' },
  'Speak Language': { type: 'Advanced', characteristic: 'Intelligence', descriptor: '—', isGroup: true },
  'Survival': { type: 'Advanced', characteristic: 'Intelligence', descriptor: 'Exploration' },
  'Swim': { type: 'Basic', characteristic: 'Strength', descriptor: 'Movement' },
  'Tech-Use': { type: 'Advanced', characteristic: 'Intelligence', descriptor: 'Exploration', isGroup: true },
  'Tracking': { type: 'Advanced', characteristic: 'Intelligence', descriptor: 'Exploration' },
  'Trade': { type: 'Advanced', characteristic: 'Intelligence', descriptor: 'Crafting, Exploration', isGroup: true },
  'Wrangling': { type: 'Advanced', characteristic: 'Intelligence', descriptor: '—' }
};

// Characteristic name mappings
const CHAR_MAP = {
  'Agility': 'agility',
  'Ballistic Skill': 'ballisticSkill',
  'Fellowship': 'fellowship',
  'Intelligence': 'intelligence',
  'Perception': 'perception',
  'Strength': 'strength',
  'Toughness': 'toughness',
  'Weapon Skill': 'weaponSkill',
  'Willpower': 'willpower'
};

function normalizeSkillName(name) {
  // Remove specializations in parentheses
  return name.replace(/\s*\([^)]*\)/, '').trim();
}

function auditSkillFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(content);
  
  const skillName = normalizeSkillName(data.name);
  const expected = SKILL_TABLE[skillName];
  
  if (!expected) {
    // Not a core skill (e.g., specialist skill instance)
    return null;
  }
  
  const issues = [];
  const currentType = data.system.skillType;
  const currentIsBasic = data.system.isBasic;
  const currentChar = data.system.characteristic;
  const currentDescriptor = data.system.descriptor || '';
  
  const expectedType = expected.type.toLowerCase();
  const expectedIsBasic = expected.type === 'Basic';
  const expectedChar = CHAR_MAP[expected.characteristic];
  
  // Check skillType
  if (currentType !== expectedType) {
    issues.push({
      field: 'skillType',
      current: currentType,
      expected: expectedType
    });
  }
  
  // Check isBasic
  if (currentIsBasic !== expectedIsBasic) {
    issues.push({
      field: 'isBasic',
      current: currentIsBasic,
      expected: expectedIsBasic
    });
  }
  
  // Check characteristic
  if (currentChar !== expectedChar) {
    issues.push({
      field: 'characteristic',
      current: currentChar,
      expected: expectedChar
    });
  }
  
  // Check descriptor (informational only - not critical)
  if (expected.descriptor !== '—' && !currentDescriptor.includes(expected.descriptor.split(',')[0].trim())) {
    issues.push({
      field: 'descriptor',
      current: currentDescriptor,
      expected: expected.descriptor,
      severity: 'info'
    });
  }
  
  if (issues.length > 0) {
    return {
      file: path.basename(filePath),
      name: data.name,
      skillName,
      id: data._id,
      issues
    };
  }
  
  return null;
}

function main() {
  const packDir = path.join(__dirname, '..', 'src', 'packs', 'rt-items-skills', '_source');
  
  if (!fs.existsSync(packDir)) {
    console.error(`Pack directory not found: ${packDir}`);
    process.exit(1);
  }
  
  const files = fs.readdirSync(packDir).filter(f => f.endsWith('.json'));
  const results = [];
  
  console.log('='.repeat(80));
  console.log('SKILL PACK AUDIT REPORT');
  console.log('='.repeat(80));
  console.log(`\nScanning ${files.length} files in ${packDir}\n`);
  
  for (const file of files) {
    const filePath = path.join(packDir, file);
    const result = auditSkillFile(filePath);
    if (result) {
      results.push(result);
    }
  }
  
  if (results.length === 0) {
    console.log('✅ No issues found! All skills match SKILL_TABLE.md');
    return;
  }
  
  console.log(`❌ Found ${results.length} skill(s) with issues:\n`);
  
  for (const result of results) {
    console.log('-'.repeat(80));
    console.log(`📄 ${result.name} (${result.file})`);
    console.log(`   ID: ${result.id}`);
    console.log('   Issues:');
    for (const issue of result.issues) {
      const severity = issue.severity === 'info' ? 'ℹ️ ' : '❌';
      console.log(`   ${severity} ${issue.field}:`);
      console.log(`      Current:  ${JSON.stringify(issue.current)}`);
      console.log(`      Expected: ${JSON.stringify(issue.expected)}`);
    }
    console.log('');
  }
  
  console.log('='.repeat(80));
  console.log(`Summary: ${results.length} skill(s) need correction`);
  console.log('='.repeat(80));
  
  // Generate correction summary
  const corrections = {};
  for (const result of results) {
    corrections[result.name] = {
      file: result.file,
      corrections: {}
    };
    for (const issue of result.issues) {
      if (issue.severity !== 'info') {
        corrections[result.name].corrections[`system.${issue.field}`] = issue.expected;
      }
    }
  }
  
  // Save corrections to JSON for batch update script
  const outputPath = path.join(__dirname, 'skill-corrections.json');
  fs.writeFileSync(outputPath, JSON.stringify(corrections, null, 2));
  console.log(`\n💾 Corrections saved to: ${outputPath}`);
}

main();
