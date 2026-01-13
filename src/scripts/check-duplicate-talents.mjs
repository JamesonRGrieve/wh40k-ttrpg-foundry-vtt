#!/usr/bin/env node
/**
 * Talent Duplicate Checker
 * 
 * Finds talents granted by multiple origins and identifies potential conflicts.
 * 
 * Usage: node src/scripts/check-duplicate-talents.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const ORIGIN_PATH_DIR = path.join(__dirname, '../../packs/rt-items-origin-path/_source');

// Colors
const colors = {
    reset: '\x1b[0m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m'
};

/**
 * Collect all talent grants from an origin
 */
function collectTalents(origin) {
    const talents = [];
    const grants = origin.system?.grants || {};
    
    // Direct talent grants
    for (const talentGrant of grants.talents || []) {
        talents.push({
            name: talentGrant.name,
            specialization: talentGrant.specialization || null,
            uuid: talentGrant.uuid || null,
            source: 'direct'
        });
    }
    
    // Talents in choice options
    for (const choice of grants.choices || []) {
        for (const option of choice.options || []) {
            const optionGrants = option.grants || {};
            for (const talentGrant of optionGrants.talents || []) {
                talents.push({
                    name: talentGrant.name,
                    specialization: talentGrant.specialization || null,
                    uuid: talentGrant.uuid || null,
                    source: 'choice',
                    choiceLabel: choice.label,
                    optionLabel: option.label
                });
            }
        }
    }
    
    return talents;
}

/**
 * Main function
 */
function main() {
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.cyan}   Talent Duplicate Checker${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}\n`);
    
    // Load all origins
    const originFiles = fs.readdirSync(ORIGIN_PATH_DIR).filter(f => f.endsWith('.json'));
    const talentUsage = new Map(); // Map<talentKey, Array<{origin, talent}>>
    
    for (const file of originFiles) {
        const filePath = path.join(ORIGIN_PATH_DIR, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const origin = JSON.parse(content);
        
        const talents = collectTalents(origin);
        
        for (const talent of talents) {
            // Create unique key for talent
            const key = talent.specialization 
                ? `${talent.name}|${talent.specialization}`
                : talent.name;
            
            if (!talentUsage.has(key)) {
                talentUsage.set(key, []);
            }
            
            talentUsage.get(key).push({
                origin: origin.name,
                step: origin.system?.step || 'unknown',
                talent: talent
            });
        }
    }
    
    // Analyze duplicates
    const duplicates = [];
    const uniqueTalents = talentUsage.size;
    let totalTalentGrants = 0;
    
    for (const [key, usages] of talentUsage) {
        totalTalentGrants += usages.length;
        
        if (usages.length > 1) {
            duplicates.push({
                key: key,
                count: usages.length,
                usages: usages
            });
        }
    }
    
    // Sort by usage count
    duplicates.sort((a, b) => b.count - a.count);
    
    // Display summary
    console.log(`${colors.cyan}Summary${colors.reset}`);
    console.log(`${'─'.repeat(55)}`);
    console.log(`Unique Talents: ${uniqueTalents}`);
    console.log(`Total Talent Grants: ${totalTalentGrants}`);
    console.log(`Talents Used Multiple Times: ${colors.yellow}${duplicates.length}${colors.reset}\n`);
    
    if (duplicates.length > 0) {
        console.log(`${colors.cyan}Most Reused Talents${colors.reset}`);
        console.log(`${'─'.repeat(55)}\n`);
        
        const top10 = duplicates.slice(0, 10);
        for (const dup of top10) {
            const [name, spec] = dup.key.split('|');
            const displayName = spec ? `${name} (${spec})` : name;
            console.log(`${colors.yellow}${displayName}${colors.reset} - ${dup.count} origins`);
            
            for (const usage of dup.usages) {
                const sourceDesc = usage.talent.source === 'choice' 
                    ? `choice: "${usage.talent.choiceLabel}"`
                    : 'direct';
                console.log(`  • ${usage.origin} (${usage.step}) - ${sourceDesc}`);
            }
            console.log('');
        }
    }
    
    // Check for conflicts (same talent, different UUIDs)
    const conflicts = [];
    for (const [key, usages] of talentUsage) {
        const uuids = new Set(usages.map(u => u.talent.uuid).filter(uuid => uuid));
        
        if (uuids.size > 1) {
            conflicts.push({
                key: key,
                uuids: Array.from(uuids),
                usages: usages
            });
        }
    }
    
    if (conflicts.length > 0) {
        console.log(`${colors.red}UUID Conflicts Found: ${conflicts.length}${colors.reset}`);
        console.log(`${'─'.repeat(55)}\n`);
        
        for (const conflict of conflicts) {
            const [name, spec] = conflict.key.split('|');
            const displayName = spec ? `${name} (${spec})` : name;
            console.log(`${colors.red}${displayName}${colors.reset}`);
            console.log(`  Different UUIDs:`);
            for (const uuid of conflict.uuids) {
                console.log(`    - ${uuid}`);
            }
            console.log(`  Used in:`);
            for (const usage of conflict.usages) {
                console.log(`    - ${usage.origin} (UUID: ${usage.talent.uuid || 'none'})`);
            }
            console.log('');
        }
    }
    
    // Generate report
    const reportPath = path.join(__dirname, '../../TALENT_REUSE_REPORT.md');
    generateReport(reportPath, {
        uniqueTalents,
        totalTalentGrants,
        duplicates,
        conflicts
    });
    
    console.log(`${colors.green}Report saved to: ${reportPath}${colors.reset}\n`);
}

/**
 * Generate markdown report
 */
function generateReport(filePath, data) {
    const lines = [];
    
    lines.push('# Talent Reuse Report\n');
    lines.push(`**Generated**: ${new Date().toISOString()}\n`);
    lines.push('---\n');
    
    lines.push('## Summary\n');
    lines.push('| Metric | Count |');
    lines.push('|--------|-------|');
    lines.push(`| Unique Talents | ${data.uniqueTalents} |`);
    lines.push(`| Total Talent Grants | ${data.totalTalentGrants} |`);
    lines.push(`| Talents Used Multiple Times | ${data.duplicates.length} |`);
    lines.push(`| UUID Conflicts | ${data.conflicts.length} |\n`);
    
    // Duplicates
    if (data.duplicates.length > 0) {
        lines.push('## Talents Used by Multiple Origins\n');
        lines.push('*Sorted by usage count*\n');
        
        for (const dup of data.duplicates) {
            const [name, spec] = dup.key.split('|');
            const displayName = spec ? `${name} (${spec})` : name;
            lines.push(`### ${displayName} (${dup.count} origins)\n`);
            
            // Group by source type
            const direct = dup.usages.filter(u => u.talent.source === 'direct');
            const choice = dup.usages.filter(u => u.talent.source === 'choice');
            
            if (direct.length > 0) {
                lines.push('**Direct Grants:**\n');
                for (const usage of direct) {
                    lines.push(`- ${usage.origin} (${usage.step})`);
                }
                lines.push('');
            }
            
            if (choice.length > 0) {
                lines.push('**Choice Options:**\n');
                for (const usage of choice) {
                    lines.push(`- ${usage.origin} (${usage.step}) - "${usage.talent.choiceLabel}"`);
                }
                lines.push('');
            }
        }
    }
    
    // Conflicts
    if (data.conflicts.length > 0) {
        lines.push('## UUID Conflicts\n');
        lines.push('*Same talent with different UUIDs - potential data integrity issue*\n');
        
        for (const conflict of data.conflicts) {
            const [name, spec] = conflict.key.split('|');
            const displayName = spec ? `${name} (${spec})` : name;
            lines.push(`### ${displayName}\n`);
            lines.push('**Different UUIDs:**\n');
            for (const uuid of conflict.uuids) {
                lines.push(`- \`${uuid}\``);
            }
            lines.push('\n**Used in:**\n');
            for (const usage of conflict.usages) {
                const uuid = usage.talent.uuid || 'none';
                lines.push(`- ${usage.origin} - UUID: \`${uuid}\``);
            }
            lines.push('');
        }
    }
    
    fs.writeFileSync(filePath, lines.join('\n'));
}

// Run checker
main();
