#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACK_DIR = path.join(__dirname, '..', 'src', 'packs', 'rt-items-origin-path', '_source');

console.log('Origin Path Refactor Verification\n==================================\n');

const files = fs.readdirSync(PACK_DIR).filter(f => f.endsWith('.json'));

let passed = 0, failed = 0;
const issues = [];

for (const file of files) {
  const filePath = path.join(PACK_DIR, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(content);
  
  if (data.type !== 'originPath') continue;
  
  // Check 1: No position field
  if (data.system.position !== undefined) {
    issues.push(`${data.name}: Still has 'position' field`);
    failed++;
    continue;
  }
  
  // Check 2: No navigation field
  if (data.system.navigation !== undefined) {
    issues.push(`${data.name}: Still has 'navigation' field`);
    failed++;
    continue;
  }
  
  // Check 3: Has positions array
  if (!data.system.positions || !Array.isArray(data.system.positions)) {
    issues.push(`${data.name}: Missing 'positions' array`);
    failed++;
    continue;
  }
  
  // Check 4: Positions array not empty
  if (data.system.positions.length === 0) {
    issues.push(`${data.name}: Empty 'positions' array`);
    failed++;
    continue;
  }
  
  // Check 5: All positions in valid range
  for (const pos of data.system.positions) {
    if (pos < 0 || pos > 8) {
      issues.push(`${data.name}: Invalid position ${pos} (must be 0-8)`);
      failed++;
      continue;
    }
  }
  
  passed++;
}

console.log(`Verified ${files.length} origin files:\n`);
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}\n`);

if (issues.length > 0) {
  console.log('Issues Found:');
  issues.forEach(issue => console.log(`  • ${issue}`));
  console.log('');
  process.exit(1);
} else {
  console.log('🎉 All checks passed!\n');
  console.log('Refactor verification complete:');
  console.log('  ✓ No legacy position fields');
  console.log('  ✓ No navigation fields');
  console.log('  ✓ All origins have valid positions arrays');
  console.log('  ✓ All positions in valid range (0-8)\n');
}
