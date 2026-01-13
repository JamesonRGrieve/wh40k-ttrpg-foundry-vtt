#!/usr/bin/env node
/**
 * UUID Reference Validator
 * 
 * Validates that all UUID references in origin path items point to valid compendium entries.
 * 
 * Usage: node src/scripts/validate-origin-uuids.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PACKS_DIR = path.join(__dirname, '../../packs');
const ORIGIN_PATH_DIR = path.join(PACKS_DIR, 'rt-items-origin-path/_source');
const TALENTS_DIR = path.join(PACKS_DIR, 'rt-items-talents/_source');
const TRAITS_DIR = path.join(PACKS_DIR, 'rt-items-traits/_source');
const GEAR_DIR = path.join(PACKS_DIR, 'rt-items-gear/_source');

// Colors for terminal output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

/**
 * Load all items from a directory as a map of UUID → item
 */
function loadCompendium(directory, packId) {
    const items = new Map();
    
    if (!fs.existsSync(directory)) {
        console.warn(`${colors.yellow}Warning: Directory not found: ${directory}${colors.reset}`);
        return items;
    }
    
    const files = fs.readdirSync(directory).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
        const filePath = path.join(directory, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const item = JSON.parse(content);
        
        // Store by UUID
        const uuid = `Compendium.rogue-trader.${packId}.${item._id}`;
        items.set(uuid, item);
        
        // Also store by ID for quick lookup
        items.set(item._id, item);
    }
    
    return items;
}

/**
 * Validate a single origin path item
 */
function validateOrigin(origin, talents, traits, gear) {
    const issues = [];
    const grants = origin.system?.grants || {};
    
    // Validate talent UUIDs
    for (const talentGrant of grants.talents || []) {
        if (talentGrant.uuid) {
            if (!talents.has(talentGrant.uuid)) {
                issues.push({
                    type: 'talent',
                    name: talentGrant.name,
                    uuid: talentGrant.uuid,
                    message: `Talent UUID not found: ${talentGrant.name}`
                });
            }
        } else {
            issues.push({
                type: 'talent',
                name: talentGrant.name,
                uuid: null,
                message: `Talent missing UUID: ${talentGrant.name} (will use name-based lookup)`
            });
        }
    }
    
    // Validate trait UUIDs
    for (const traitGrant of grants.traits || []) {
        if (traitGrant.uuid) {
            if (!traits.has(traitGrant.uuid)) {
                issues.push({
                    type: 'trait',
                    name: traitGrant.name,
                    uuid: traitGrant.uuid,
                    message: `Trait UUID not found: ${traitGrant.name}`
                });
            }
        } else {
            issues.push({
                type: 'trait',
                name: traitGrant.name,
                uuid: null,
                message: `Trait missing UUID: ${traitGrant.name} (will use name-based lookup)`
            });
        }
    }
    
    // Validate equipment UUIDs
    for (const equipGrant of grants.equipment || []) {
        if (equipGrant.uuid) {
            // Equipment could be in multiple packs, just check gear for now
            if (!gear.has(equipGrant.uuid)) {
                issues.push({
                    type: 'equipment',
                    name: equipGrant.name,
                    uuid: equipGrant.uuid,
                    message: `Equipment UUID not found in gear pack: ${equipGrant.name}`
                });
            }
        } else if (equipGrant.name) {
            issues.push({
                type: 'equipment',
                name: equipGrant.name,
                uuid: null,
                message: `Equipment missing UUID: ${equipGrant.name}`
            });
        }
    }
    
    // Validate choices with nested grants
    for (const choice of grants.choices || []) {
        for (const option of choice.options || []) {
            const optionGrants = option.grants || {};
            
            // Validate talents in choice options
            for (const talentGrant of optionGrants.talents || []) {
                if (talentGrant.uuid && !talents.has(talentGrant.uuid)) {
                    issues.push({
                        type: 'choice-talent',
                        name: talentGrant.name,
                        uuid: talentGrant.uuid,
                        choice: choice.label,
                        message: `Choice talent UUID not found: ${talentGrant.name} (in "${choice.label}")`
                    });
                }
            }
            
            // Validate traits in choice options
            for (const traitGrant of optionGrants.traits || []) {
                if (traitGrant.uuid && !traits.has(traitGrant.uuid)) {
                    issues.push({
                        type: 'choice-trait',
                        name: traitGrant.name,
                        uuid: traitGrant.uuid,
                        choice: choice.label,
                        message: `Choice trait UUID not found: ${traitGrant.name} (in "${choice.label}")`
                    });
                }
            }
        }
    }
    
    return issues;
}

/**
 * Main validation function
 */
function main() {
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.cyan}   Origin Path UUID Reference Validator${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}\n`);
    
    // Load compendia
    console.log('Loading compendia...');
    const talents = loadCompendium(TALENTS_DIR, 'rt-items-talents');
    const traits = loadCompendium(TRAITS_DIR, 'rt-items-traits');
    const gear = loadCompendium(GEAR_DIR, 'rt-items-gear');
    
    console.log(`  ${colors.green}✓${colors.reset} Loaded ${talents.size / 2} talents`);
    console.log(`  ${colors.green}✓${colors.reset} Loaded ${traits.size / 2} traits`);
    console.log(`  ${colors.green}✓${colors.reset} Loaded ${gear.size / 2} gear items\n`);
    
    // Load origin paths
    console.log('Validating origin paths...\n');
    const originFiles = fs.readdirSync(ORIGIN_PATH_DIR).filter(f => f.endsWith('.json'));
    
    let totalOrigins = 0;
    let totalIssues = 0;
    const issuesByOrigin = new Map();
    
    for (const file of originFiles) {
        const filePath = path.join(ORIGIN_PATH_DIR, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const origin = JSON.parse(content);
        
        totalOrigins++;
        const issues = validateOrigin(origin, talents, traits, gear);
        
        if (issues.length > 0) {
            issuesByOrigin.set(origin.name, issues);
            totalIssues += issues.length;
        }
    }
    
    // Report results
    if (issuesByOrigin.size === 0) {
        console.log(`${colors.green}═══════════════════════════════════════════════════════${colors.reset}`);
        console.log(`${colors.green}  ✓ ALL REFERENCES VALID${colors.reset}`);
        console.log(`${colors.green}═══════════════════════════════════════════════════════${colors.reset}\n`);
        console.log(`Validated ${totalOrigins} origin paths - no issues found.\n`);
    } else {
        console.log(`${colors.red}═══════════════════════════════════════════════════════${colors.reset}`);
        console.log(`${colors.red}  ✗ VALIDATION ISSUES FOUND${colors.reset}`);
        console.log(`${colors.red}═══════════════════════════════════════════════════════${colors.reset}\n`);
        
        for (const [originName, issues] of issuesByOrigin) {
            console.log(`${colors.yellow}▸ ${originName}${colors.reset} (${issues.length} issue${issues.length > 1 ? 's' : ''})`);
            
            for (const issue of issues) {
                if (issue.uuid) {
                    console.log(`  ${colors.red}✗${colors.reset} ${issue.message}`);
                    console.log(`    UUID: ${colors.blue}${issue.uuid}${colors.reset}`);
                } else {
                    console.log(`  ${colors.yellow}⚠${colors.reset} ${issue.message}`);
                }
            }
            console.log('');
        }
        
        console.log(`${colors.cyan}Summary:${colors.reset}`);
        console.log(`  Total origins: ${totalOrigins}`);
        console.log(`  Origins with issues: ${colors.yellow}${issuesByOrigin.size}${colors.reset}`);
        console.log(`  Total issues: ${colors.red}${totalIssues}${colors.reset}\n`);
    }
    
    // Generate report file
    const reportPath = path.join(__dirname, '../../UUID_VALIDATION_REPORT.md');
    generateReport(reportPath, totalOrigins, issuesByOrigin);
    
    console.log(`${colors.green}Report saved to: ${reportPath}${colors.reset}\n`);
    
    // Exit with error code if issues found
    process.exit(issuesByOrigin.size > 0 ? 1 : 0);
}

/**
 * Generate markdown report
 */
function generateReport(filePath, totalOrigins, issuesByOrigin) {
    const lines = [];
    
    lines.push('# Origin Path UUID Validation Report\n');
    lines.push(`**Generated**: ${new Date().toISOString()}\n`);
    lines.push(`**Total Origins**: ${totalOrigins}`);
    lines.push(`**Origins with Issues**: ${issuesByOrigin.size}`);
    lines.push(`**Total Issues**: ${Array.from(issuesByOrigin.values()).reduce((sum, issues) => sum + issues.length, 0)}\n`);
    
    if (issuesByOrigin.size === 0) {
        lines.push('## ✅ All References Valid\n');
        lines.push('No UUID validation issues found.\n');
    } else {
        lines.push('## ❌ Validation Issues\n');
        
        for (const [originName, issues] of issuesByOrigin) {
            lines.push(`### ${originName}\n`);
            
            const byType = {};
            for (const issue of issues) {
                const type = issue.type;
                if (!byType[type]) byType[type] = [];
                byType[type].push(issue);
            }
            
            for (const [type, typeIssues] of Object.entries(byType)) {
                lines.push(`**${type.toUpperCase()}** (${typeIssues.length} issue${typeIssues.length > 1 ? 's' : ''}):\n`);
                for (const issue of typeIssues) {
                    lines.push(`- ${issue.message}`);
                    if (issue.uuid) {
                        lines.push(`  - UUID: \`${issue.uuid}\``);
                    }
                }
                lines.push('');
            }
        }
    }
    
    fs.writeFileSync(filePath, lines.join('\n'));
}

// Run validation
main();
