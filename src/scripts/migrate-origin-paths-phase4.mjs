#!/usr/bin/env node

/**
 * Phase 4 Migration Script for Origin Path System
 * 
 * This script performs comprehensive migration on all origin path compendium items:
 * 1. Migrates effectText → description.value
 * 2. Standardizes legacy fields (wounds/fateThreshold)
 * 3. Generates navigation data (connectsTo, isEdge flags)
 * 4. Validates choice structures
 * 5. Generates detailed migration report
 * 
 * Usage: node src/scripts/migrate-origin-paths-phase4.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const PACK_SOURCE_DIR = path.join(__dirname, '..', 'packs', 'rt-items-origin-path', '_source');
const REPORT_PATH = path.join(__dirname, '..', '..', 'PHASE4_MIGRATION_REPORT.md');

// Statistics
const stats = {
  totalOrigins: 0,
  effectTextMigrated: 0,
  legacyFieldsStandardized: 0,
  navigationGenerated: 0,
  choicesValidated: 0,
  issues: [],
  warnings: []
};

// Step definitions (from the rulebook)
const STEP_INFO = {
  homeWorld: { stepIndex: 1, maxPosition: 8 },
  birthright: { stepIndex: 2, maxPosition: 6 },
  lureOfTheVoid: { stepIndex: 3, maxPosition: 6 },
  trialsAndTravails: { stepIndex: 4, maxPosition: 5 },
  motivation: { stepIndex: 5, maxPosition: 6 },
  career: { stepIndex: 6, maxPosition: 8 }
};

/**
 * Calculate navigation data based on position and step
 */
function calculateNavigationData(position, stepIndex, step) {
  const navigation = {
    connectsTo: [],
    isEdgeLeft: false,
    isEdgeRight: false
  };

  // Get max position for this step
  const maxPosition = STEP_INFO[step]?.maxPosition || 8;

  // Origin Path Chart Rules (from Rogue Trader Core Rulebook):
  // "Each choice connects to the choice directly below it (or above it),
  //  or a choice adjacent to the one directly below."
  
  // Edge cases
  if (position === 0) {
    navigation.isEdgeLeft = true;
    navigation.connectsTo = [0, 1]; // Can't go left
  } else if (position >= maxPosition - 1) {
    navigation.isEdgeRight = true;
    navigation.connectsTo = [Math.max(0, position - 1), position]; // Can't go right
  } else {
    // Normal case: connects to position-1, position, position+1
    navigation.connectsTo = [position - 1, position, position + 1];
  }

  return navigation;
}

/**
 * Migrate effectText to description.value
 */
function migrateEffectText(origin) {
  const updates = {};
  
  // Check if effectText exists and has content
  if (origin.system.effectText && origin.system.effectText.trim().length > 0) {
    // Check if description is empty or very short (likely placeholder)
    const currentDesc = origin.system.description?.value || "";
    
    if (currentDesc.length < 50) {
      // Description is empty or minimal, use effectText
      updates["system.description.value"] = origin.system.effectText;
      updates["system.effectText"] = ""; // Clear deprecated field
      stats.effectTextMigrated++;
      console.log(`  ✓ Migrated effectText for: ${origin.name}`);
    } else if (currentDesc !== origin.system.effectText) {
      // Both exist and differ - keep description, warn about effectText
      stats.warnings.push({
        origin: origin.name,
        type: "effectText",
        message: "Has both description and effectText with different content. Keeping description, clearing effectText."
      });
      updates["system.effectText"] = ""; // Clear deprecated field anyway
    } else {
      // They're the same, just clear effectText
      updates["system.effectText"] = "";
    }
  }
  
  return updates;
}

/**
 * Standardize legacy fields (prefer formulas)
 */
function standardizeLegacyFields(origin) {
  const updates = {};

  // Wounds: Prefer woundsFormula, ensure legacy wounds field is 0
  if (origin.system.grants?.woundsFormula) {
    if (origin.system.grants.wounds > 0) {
      stats.warnings.push({
        origin: origin.name,
        type: "wounds",
        message: `Has both woundsFormula ('${origin.system.grants.woundsFormula}') and wounds (${origin.system.grants.wounds}). Setting wounds to 0.`
      });
      updates["system.grants.wounds"] = 0;
      stats.legacyFieldsStandardized++;
    }
  }

  // Fate: Prefer fateFormula
  if (origin.system.grants?.fateFormula) {
    if (origin.system.grants.fateThreshold > 0) {
      stats.warnings.push({
        origin: origin.name,
        type: "fate",
        message: `Has both fateFormula ('${origin.system.grants.fateFormula}') and fateThreshold (${origin.system.grants.fateThreshold}). Setting fateThreshold to 0.`
      });
      updates["system.grants.fateThreshold"] = 0;
      stats.legacyFieldsStandardized++;
    }
  }

  return updates;
}

/**
 * Generate navigation data
 */
function generateNavigationData(origin) {
  const updates = {};

  // Check if navigation data already exists and is complete
  const hasCompleteNav = origin.system.navigation?.connectsTo && 
                         origin.system.navigation.connectsTo.length > 0;

  if (!hasCompleteNav) {
    const navigation = calculateNavigationData(
      origin.system.position,
      origin.system.stepIndex,
      origin.system.step
    );

    updates["system.navigation"] = navigation;
    stats.navigationGenerated++;
    console.log(`  ✓ Generated navigation for: ${origin.name} (connects to: [${navigation.connectsTo.join(', ')}])`);
  }

  return updates;
}

/**
 * Validate choice structures
 */
function validateChoices(origin) {
  const choices = origin.system.grants?.choices || [];
  
  for (const [idx, choice] of choices.entries()) {
    // Check basic structure
    if (!choice.type || !choice.label || !choice.options) {
      stats.issues.push({
        origin: origin.name,
        type: "choice",
        message: `Choice ${idx} missing required fields (type, label, or options)`
      });
      continue;
    }

    // Validate each option
    for (const [optIdx, option] of choice.options.entries()) {
      if (!option.label || !option.value) {
        stats.issues.push({
          origin: origin.name,
          type: "choice",
          message: `Choice "${choice.label}" option ${optIdx} missing label or value`
        });
      }

      // Check if option has grants
      if (!option.grants || Object.keys(option.grants).length === 0) {
        stats.warnings.push({
          origin: origin.name,
          type: "choice",
          message: `Choice "${choice.label}" option "${option.label}" has no grants defined`
        });
      }

      // Validate UUID references in grants
      if (option.grants?.talents) {
        for (const talent of option.grants.talents) {
          if (!talent.uuid) {
            stats.warnings.push({
              origin: origin.name,
              type: "choice-uuid",
              message: `Choice "${choice.label}" → "${option.label}" → talent "${talent.name}" missing UUID`
            });
          }
        }
      }

      if (option.grants?.traits) {
        for (const trait of option.grants.traits) {
          if (!trait.uuid) {
            stats.warnings.push({
              origin: origin.name,
              type: "choice-uuid",
              message: `Choice "${choice.label}" → "${option.label}" → trait "${trait.name}" missing UUID`
            });
          }
        }
      }

      if (option.grants?.equipment) {
        for (const equip of option.grants.equipment) {
          if (!equip.uuid) {
            stats.warnings.push({
              origin: origin.name,
              type: "choice-uuid",
              message: `Choice "${choice.label}" → "${option.label}" → equipment "${equip.name}" missing UUID`
            });
          }
        }
      }
    }

    stats.choicesValidated++;
  }

  return {}; // No automatic updates for choices, just validation
}

/**
 * Process a single origin file
 */
function processOriginFile(filename) {
  const filepath = path.join(PACK_SOURCE_DIR, filename);
  
  try {
    // Read file
    const content = fs.readFileSync(filepath, 'utf8');
    const origin = JSON.parse(content);

    stats.totalOrigins++;
    console.log(`\nProcessing: ${origin.name} (${origin.system.step})`);

    // Collect all updates
    let allUpdates = {};

    // 1. Migrate effectText
    const effectTextUpdates = migrateEffectText(origin);
    Object.assign(allUpdates, effectTextUpdates);

    // 2. Standardize legacy fields
    const legacyUpdates = standardizeLegacyFields(origin);
    Object.assign(allUpdates, legacyUpdates);

    // 3. Generate navigation data
    const navUpdates = generateNavigationData(origin);
    Object.assign(allUpdates, navUpdates);

    // 4. Validate choices
    validateChoices(origin);

    // Apply updates to origin object
    for (const [key, value] of Object.entries(allUpdates)) {
      const keys = key.split('.');
      let obj = origin;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]]) obj[keys[i]] = {};
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
    }

    // Write back if there were updates
    if (Object.keys(allUpdates).length > 0) {
      fs.writeFileSync(filepath, JSON.stringify(origin, null, 2) + '\n', 'utf8');
      console.log(`  ✓ Saved updates to: ${filename}`);
    } else {
      console.log(`  ⊘ No updates needed`);
    }

  } catch (error) {
    stats.issues.push({
      origin: filename,
      type: "processing",
      message: `Failed to process: ${error.message}`
    });
    console.error(`  ✗ Error processing ${filename}: ${error.message}`);
  }
}

/**
 * Generate migration report
 */
function generateReport() {
  const timestamp = new Date().toISOString();
  
  let report = `# Phase 4 Migration Report\n\n`;
  report += `**Date:** ${timestamp}\n`;
  report += `**Script:** migrate-origin-paths-phase4.mjs\n\n`;
  report += `---\n\n`;
  
  report += `## Summary\n\n`;
  report += `| Metric | Count |\n`;
  report += `|--------|-------|\n`;
  report += `| **Total Origins Processed** | ${stats.totalOrigins} |\n`;
  report += `| **effectText Migrated** | ${stats.effectTextMigrated} |\n`;
  report += `| **Legacy Fields Standardized** | ${stats.legacyFieldsStandardized} |\n`;
  report += `| **Navigation Data Generated** | ${stats.navigationGenerated} |\n`;
  report += `| **Choices Validated** | ${stats.choicesValidated} |\n`;
  report += `| **Warnings** | ${stats.warnings.length} |\n`;
  report += `| **Issues** | ${stats.issues.length} |\n\n`;

  report += `---\n\n`;

  if (stats.warnings.length > 0) {
    report += `## Warnings (${stats.warnings.length})\n\n`;
    
    // Group by type
    const warningsByType = {};
    for (const warn of stats.warnings) {
      if (!warningsByType[warn.type]) warningsByType[warn.type] = [];
      warningsByType[warn.type].push(warn);
    }

    for (const [type, warnings] of Object.entries(warningsByType)) {
      report += `### ${type.charAt(0).toUpperCase() + type.slice(1)} Warnings\n\n`;
      for (const warn of warnings) {
        report += `- **${warn.origin}:** ${warn.message}\n`;
      }
      report += `\n`;
    }
  }

  if (stats.issues.length > 0) {
    report += `## Issues (${stats.issues.length})\n\n`;
    
    for (const issue of stats.issues) {
      report += `### ⚠️ ${issue.origin}\n`;
      report += `**Type:** ${issue.type}\n`;
      report += `**Message:** ${issue.message}\n\n`;
    }
  }

  if (stats.issues.length === 0 && stats.warnings.length === 0) {
    report += `## ✅ All Clear!\n\n`;
    report += `All origin paths processed successfully with no issues or warnings.\n\n`;
  }

  report += `---\n\n`;
  report += `## Next Steps\n\n`;
  report += `1. Review warnings and issues above\n`;
  report += `2. Fix any critical issues manually\n`;
  report += `3. Rebuild compendia: \`npm run build\`\n`;
  report += `4. Test in Foundry with Origin Path Builder\n`;
  report += `5. Run validation scripts:\n`;
  report += `   - \`node src/scripts/validate-origin-uuids.mjs\`\n`;
  report += `   - \`node src/scripts/audit-origins.mjs\`\n\n`;

  fs.writeFileSync(REPORT_PATH, report, 'utf8');
  console.log(`\n✓ Migration report written to: ${REPORT_PATH}`);
}

/**
 * Main execution
 */
function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  Phase 4 Migration Script - Origin Path System               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // Check if source directory exists
  if (!fs.existsSync(PACK_SOURCE_DIR)) {
    console.error(`Error: Pack source directory not found: ${PACK_SOURCE_DIR}`);
    process.exit(1);
  }

  // Get all JSON files
  const files = fs.readdirSync(PACK_SOURCE_DIR)
    .filter(f => f.endsWith('.json'));

  console.log(`Found ${files.length} origin path files to process\n`);

  // Process each file
  for (const file of files) {
    processOriginFile(file);
  }

  // Generate report
  console.log('\n' + '─'.repeat(65));
  console.log('Migration Complete!');
  console.log('─'.repeat(65) + '\n');
  
  console.log(`📊 Statistics:`);
  console.log(`   Total Origins:        ${stats.totalOrigins}`);
  console.log(`   effectText Migrated:  ${stats.effectTextMigrated}`);
  console.log(`   Legacy Fields Fixed:  ${stats.legacyFieldsStandardized}`);
  console.log(`   Navigation Generated: ${stats.navigationGenerated}`);
  console.log(`   Choices Validated:    ${stats.choicesValidated}`);
  console.log(`   Warnings:             ${stats.warnings.length}`);
  console.log(`   Issues:               ${stats.issues.length}\n`);

  generateReport();

  // Exit with error code if there are issues
  if (stats.issues.length > 0) {
    console.error(`\n⚠️  Migration completed with ${stats.issues.length} issue(s). Review the report.`);
    process.exit(1);
  }

  console.log(`\n✅ Migration successful! Review ${REPORT_PATH} for details.`);
  process.exit(0);
}

// Run main
main();
