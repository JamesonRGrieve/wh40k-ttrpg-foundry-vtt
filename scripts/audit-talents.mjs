/**
 * Automated Talent Audit Script
 * Detects common issues in talent pack data
 *
 * Usage: node scripts/audit-talents.mjs [--category=<category>] [--verbose]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TALENTS_DIR = path.join(__dirname, '../src/packs/rt-items-talents/_source');

// Parse command line arguments
const args = process.argv.slice(2);
const filterCategory = args.find(arg => arg.startsWith('--category='))?.split('=')[1];
const verbose = args.includes('--verbose');

// Issue detectors
const checks = {
  benefitModifierMismatch(talent) {
    const benefit = talent.system.benefit || '';
    const issues = [];

    // Check for +X mentions in benefit (excluding +0 which is not a bonus)
    const plusMatches = benefit.match(/\+([1-9]\d*)/g) || [];
    const modifiers = talent.system.modifiers || {};

    const hasModifiers =
      Object.keys(modifiers.characteristics || {}).length > 0 ||
      Object.keys(modifiers.skills || {}).length > 0 ||
      Object.keys(modifiers.combat || {}).filter(k => modifiers.combat[k] !== 0).length > 0 ||
      Object.keys(modifiers.resources || {}).filter(k => modifiers.resources[k] !== 0).length > 0 ||
      (modifiers.situational?.skills?.length > 0) ||
      (modifiers.situational?.characteristics?.length > 0) ||
      (modifiers.situational?.combat?.length > 0);

    const hasGrants =
      (talent.system.grants?.skills?.length > 0) ||
      (talent.system.grants?.specialAbilities?.length > 0);

    if (plusMatches.length > 0 && !hasModifiers && !hasGrants) {
      issues.push(`Benefit mentions bonuses (${plusMatches.join(', ')}) but modifiers and grants empty`);
    }

    return issues;
  },

  skillGrantMissing(talent) {
    const benefit = talent.system.benefit || '';
    const issues = [];

    // Check for explicit skill grant phrases (avoid false positives from prerequisites)
    const grantPatterns = [
      /gain.*trained/i,
      /become.*trained/i,
      /count as.*trained/i,
      /treat as.*trained/i,
      /grants.*training/i,
      /you are trained/i
    ];
    
    const matchesGrantPattern = grantPatterns.some(pattern => benefit.match(pattern));
    
    if (matchesGrantPattern && !talent.system.grants?.skills?.length) {
      issues.push('Benefit explicitly grants skill training but grants.skills empty');
    }

    return issues;
  },

  emptyModifiers(talent) {
    const modifiers = talent.system.modifiers || {};
    const benefit = talent.system.benefit || '';
    const issues = [];

    const hasAnyModifiers =
      Object.keys(modifiers.characteristics || {}).length > 0 ||
      Object.keys(modifiers.skills || {}).length > 0 ||
      Object.keys(modifiers.combat || {}).filter(k => modifiers.combat[k] !== 0).length > 0 ||
      Object.keys(modifiers.resources || {}).filter(k => modifiers.resources[k] !== 0).length > 0 ||
      (modifiers.other?.length > 0) ||
      (modifiers.situational?.skills?.length > 0) ||
      (modifiers.situational?.characteristics?.length > 0) ||
      (modifiers.situational?.combat?.length > 0);

    const hasGrants =
      (talent.system.grants?.skills?.length > 0) ||
      (talent.system.grants?.specialAbilities?.length > 0) ||
      (talent.system.grants?.talents?.length > 0) ||
      (talent.system.grants?.traits?.length > 0);

    // Skip if has grants or modifiers
    if (hasAnyModifiers || hasGrants) {
      return issues;
    }
    
    // Skip if this is a choice talent (correctly documented in benefit)
    if (benefit.match(/choose|or/i) || benefit.match(/one of the following/i)) {
      return issues;
    }

    // Check if benefit suggests mechanical effect
    const hasMechanicalText = benefit.match(/\+\d+|bonus|penalty|-\d+|damage|attack|defense|initiative/i);

    if (hasMechanicalText) {
      issues.push('Benefit describes mechanical effect but modifiers and grants empty');
    }

    return issues;
  },

  missingIdentifier(talent) {
    return !talent.system.identifier ? ['Missing identifier field'] : [];
  },

  missingCategory(talent) {
    const validCategories = ['combat', 'knowledge', 'general', 'origin', 'social', 'leadership', 'tech', 'psychic'];
    if (!validCategories.includes(talent.system.category)) {
      return [`Invalid category: ${talent.system.category}`];
    }
    return [];
  },

  specializationInName(talent) {
    const issues = [];
    if (talent.name.includes('(X)') && talent.system.specialization) {
      issues.push('Name has (X) but specialization filled - should be blank in template');
    }
    return issues;
  },

  tier0NonOrigin(talent) {
    if (talent.system.tier === 0 && talent.system.category !== 'origin') {
      return ['Tier 0 reserved for origin talents'];
    }
    return [];
  },

  damageBonus(talent) {
    const benefit = talent.system.benefit || '';
    const issues = [];
    const damageMatch = benefit.match(/\+(\d+)\s+damage/i);

    if (damageMatch) {
      const expectedDamage = parseInt(damageMatch[1]);
      const actualDamage = talent.system.modifiers?.combat?.damage || 0;
      const hasSituational = talent.system.modifiers?.situational?.combat?.some(m => m.key === 'damage');

      if (actualDamage === 0 && !hasSituational) {
        issues.push(`Benefit mentions +${expectedDamage} damage but combat.damage = ${actualDamage} and no situational`);
      }
    }

    return issues;
  },

  initiativeBonus(talent) {
    const benefit = talent.system.benefit || '';
    const issues = [];
    const initMatch = benefit.match(/\+(\d+)\s+initiative/i);

    if (initMatch) {
      const expectedInit = parseInt(initMatch[1]);
      const actualInit = talent.system.modifiers?.combat?.initiative || 0;

      if (actualInit === 0) {
        issues.push(`Benefit mentions +${expectedInit} Initiative but combat.initiative = ${actualInit}`);
      }
    }

    return issues;
  },

  characteristicBonus(talent) {
    const benefit = talent.system.benefit || '';
    const issues = [];

    // Skip if this is a choice talent (origin talents with "Choose" or "OR")
    if (benefit.match(/choose|or/i)) {
      return issues;
    }
    
    // Skip if has special abilities describing the choice
    if (talent.system.grants?.specialAbilities?.some(sa => 
      sa.description?.match(/choose|choice/i)
    )) {
      return issues;
    }

    // Common characteristic patterns (excluding +0 which is not a bonus)
    const charPatterns = [
      { regex: /\+([1-9]\d*)\s+(?:to\s+)?Weapon\s+Skill/i, key: 'weaponSkill' },
      { regex: /\+([1-9]\d*)\s+(?:to\s+)?Ballistic\s+Skill/i, key: 'ballisticSkill' },
      { regex: /\+([1-9]\d*)\s+(?:to\s+)?Strength/i, key: 'strength' },
      { regex: /\+([1-9]\d*)\s+(?:to\s+)?Toughness/i, key: 'toughness' },
      { regex: /\+([1-9]\d*)\s+(?:to\s+)?Agility/i, key: 'agility' },
      { regex: /\+([1-9]\d*)\s+(?:to\s+)?Intelligence/i, key: 'intelligence' },
      { regex: /\+([1-9]\d*)\s+(?:to\s+)?Perception/i, key: 'perception' },
      { regex: /\+([1-9]\d*)\s+(?:to\s+)?Willpower/i, key: 'willpower' },
      { regex: /\+([1-9]\d*)\s+(?:to\s+)?Fellowship/i, key: 'fellowship' }
    ];

    for (const pattern of charPatterns) {
      const match = benefit.match(pattern.regex);
      if (match) {
        const expectedBonus = parseInt(match[1]);
        const actualBonus = talent.system.modifiers?.characteristics?.[pattern.key] || 0;
        const hasSituational = talent.system.modifiers?.situational?.characteristics?.some(m => m.key === pattern.key);

        if (actualBonus === 0 && !hasSituational) {
          issues.push(`Benefit mentions +${expectedBonus} to ${pattern.key} but not encoded`);
        }
      }
    }

    return issues;
  },

  woundsBonus(talent) {
    const benefit = talent.system.benefit || '';
    const issues = [];
    const woundsMatch = benefit.match(/\+(\d+)\s+(?:to\s+)?Wounds/i);

    if (woundsMatch) {
      const expectedWounds = parseInt(woundsMatch[1]);
      const actualWounds = talent.system.modifiers?.resources?.wounds || 0;

      if (actualWounds === 0) {
        issues.push(`Benefit mentions +${expectedWounds} Wounds but resources.wounds = ${actualWounds}`);
      }
    }

    return issues;
  }
};

// Main audit
async function auditTalents() {
  const files = fs.readdirSync(TALENTS_DIR).filter(f => f.endsWith('.json'));

  console.log(`\n=== TALENT PACK AUDIT ===`);
  console.log(`Found ${files.length} talent files\n`);
  if (filterCategory) {
    console.log(`Filtering by category: ${filterCategory}\n`);
  }

  const results = {
    total: 0,
    filtered: 0,
    withIssues: 0,
    byCategory: {},
    issueTypes: {},
    talentsWithIssues: []
  };

  for (const file of files) {
    const filePath = path.join(TALENTS_DIR, file);
    const talent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    // Filter by category if specified
    if (filterCategory && talent.system.category !== filterCategory) {
      continue;
    }

    results.filtered++;

    const allIssues = [];
    for (const [checkName, checkFn] of Object.entries(checks)) {
      const issues = checkFn(talent);
      issues.forEach(issue => {
        allIssues.push({ check: checkName, message: issue });
        results.issueTypes[checkName] = (results.issueTypes[checkName] || 0) + 1;
      });
    }

    if (allIssues.length > 0) {
      results.withIssues++;
      results.talentsWithIssues.push({
        file,
        name: talent.name,
        category: talent.system.category,
        issues: allIssues
      });

      if (verbose) {
        console.log(`\n❌ ${talent.name} (${file})`);
        console.log(`   Category: ${talent.system.category}, Tier: ${talent.system.tier}`);
        allIssues.forEach(({ check, message }) => {
          console.log(`   - [${check}] ${message}`);
        });
      }
    }

    // Track by category
    const cat = talent.system.category || 'unknown';
    results.byCategory[cat] = (results.byCategory[cat] || 0) + 1;
  }

  results.total = files.length;

  console.log(`\n\n=== SUMMARY ===`);
  console.log(`Total talents: ${results.total}`);
  if (filterCategory) {
    console.log(`Filtered (${filterCategory}): ${results.filtered}`);
  }
  console.log(`Talents with issues: ${results.withIssues} (${((results.withIssues/results.filtered)*100).toFixed(1)}%)`);
  console.log(`\nBy category:`);
  Object.entries(results.byCategory).sort((a,b) => b[1] - a[1]).forEach(([cat, count]) => {
    console.log(`  ${cat}: ${count}`);
  });
  console.log(`\nIssue types:`);
  Object.entries(results.issueTypes).sort((a,b) => b[1] - a[1]).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });

  if (!verbose && results.withIssues > 0) {
    console.log(`\n💡 Use --verbose flag to see detailed issues for each talent`);
  }

  // Print talent list if not verbose
  if (!verbose && results.withIssues > 0) {
    console.log(`\n\n=== TALENTS WITH ISSUES (${results.withIssues}) ===`);
    const byCategory = {};
    results.talentsWithIssues.forEach(t => {
      if (!byCategory[t.category]) byCategory[t.category] = [];
      byCategory[t.category].push(t);
    });

    Object.entries(byCategory).sort((a,b) => b[1].length - a[1].length).forEach(([cat, talents]) => {
      console.log(`\n${cat.toUpperCase()} (${talents.length}):`);
      talents.forEach(t => {
        console.log(`  - ${t.file.replace('.json', '')}`);
      });
    });
  }

  // Write results to file for copilot batching
  const reportPath = path.join(__dirname, '../docs/talent-audit-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n📊 Detailed report saved to: docs/talent-audit-report.json`);
}

auditTalents();
