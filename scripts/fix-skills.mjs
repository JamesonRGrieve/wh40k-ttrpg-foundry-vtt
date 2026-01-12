#!/usr/bin/env node

/**
 * Skill Pack Fix Script
 * Applies corrections from skill-corrections.json to skill pack files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function applyCorrections() {
  const correctionsPath = path.join(__dirname, 'skill-corrections.json');
  const packDir = path.join(__dirname, '..', 'src', 'packs', 'rt-items-skills', '_source');
  
  if (!fs.existsSync(correctionsPath)) {
    console.error('❌ skill-corrections.json not found. Run audit-skills.mjs first.');
    process.exit(1);
  }
  
  const corrections = JSON.parse(fs.readFileSync(correctionsPath, 'utf8'));
  
  console.log('='.repeat(80));
  console.log('SKILL PACK FIX SCRIPT');
  console.log('='.repeat(80));
  console.log('');
  
  let fixedCount = 0;
  let skippedCount = 0;
  
  for (const [skillName, data] of Object.entries(corrections)) {
    const filePath = path.join(packDir, data.file);
    
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${data.file} (${skillName})`);
      skippedCount++;
      continue;
    }
    
    if (Object.keys(data.corrections).length === 0) {
      // No corrections needed (only info-level issues)
      continue;
    }
    
    // Read file
    const content = fs.readFileSync(filePath, 'utf8');
    const skillData = JSON.parse(content);
    
    console.log(`🔧 Fixing: ${skillName} (${data.file})`);
    
    // Apply corrections
    for (const [field, value] of Object.entries(data.corrections)) {
      const oldValue = field.split('.').reduce((obj, key) => obj[key], skillData);
      console.log(`   ${field}: ${JSON.stringify(oldValue)} → ${JSON.stringify(value)}`);
      
      // Set new value
      const keys = field.split('.');
      let target = skillData;
      for (let i = 0; i < keys.length - 1; i++) {
        target = target[keys[i]];
      }
      target[keys[keys.length - 1]] = value;
    }
    
    // Write back to file
    fs.writeFileSync(filePath, JSON.stringify(skillData, null, 2) + '\n', 'utf8');
    fixedCount++;
  }
  
  console.log('');
  console.log('='.repeat(80));
  console.log(`✅ Fixed ${fixedCount} skill file(s)`);
  if (skippedCount > 0) {
    console.log(`⚠️  Skipped ${skippedCount} file(s) (not found)`);
  }
  console.log('='.repeat(80));
  console.log('');
  console.log('Next steps:');
  console.log('1. Run: node scripts/audit-skills.mjs (verify fixes)');
  console.log('2. Run: npm run build (rebuild packs)');
  console.log('3. Test in Foundry VTT');
}

applyCorrections();
