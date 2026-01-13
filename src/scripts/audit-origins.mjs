#!/usr/bin/env node
/**
 * Origin Path Audit Script
 * 
 * Audits origin path data for migration tracking and data quality.
 * 
 * Usage: node src/scripts/audit-origins.mjs
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
    yellow: '\x1b[33m'
};

/**
 * Audit a single origin
 */
function auditOrigin(origin) {
    const grants = origin.system?.grants || {};
    const step = origin.system?.step || 'unknown';
    
    return {
        name: origin.name,
        step: step,
        stepIndex: origin.system?.stepIndex || 0,
        
        // Formula migration tracking
        hasWoundsFormula: !!grants.woundsFormula,
        hasWoundsLegacy: grants.wounds !== 0,
        woundsFormula: grants.woundsFormula || null,
        woundsLegacy: grants.wounds || 0,
        
        hasFateFormula: !!grants.fateFormula,
        hasFateLegacy: grants.fateThreshold !== 0,
        fateFormula: grants.fateFormula || null,
        fateLegacy: grants.fateThreshold || 0,
        
        // effectText deprecation
        hasEffectText: !!origin.system?.effectText,
        hasDescription: !!origin.system?.description?.value,
        effectTextLength: origin.system?.effectText?.length || 0,
        
        // Special abilities that might be choices
        hasSpecialAbilities: (grants.specialAbilities || []).length > 0,
        specialAbilitiesCount: (grants.specialAbilities || []).length,
        hasChoices: (grants.choices || []).length > 0,
        choicesCount: (grants.choices || []).length,
        
        // Grant counts
        talentsCount: (grants.talents || []).length,
        traitsCount: (grants.traits || []).length,
        skillsCount: (grants.skills || []).length,
        aptitudesCount: (grants.aptitudes || []).length,
        equipmentCount: (grants.equipment || []).length
    };
}

/**
 * Main audit function
 */
function main() {
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.cyan}   Origin Path Audit Tool${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}\n`);
    
    // Load all origins
    const originFiles = fs.readdirSync(ORIGIN_PATH_DIR).filter(f => f.endsWith('.json'));
    const audits = [];
    
    for (const file of originFiles) {
        const filePath = path.join(ORIGIN_PATH_DIR, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const origin = JSON.parse(content);
        audits.push(auditOrigin(origin));
    }
    
    // Sort by step index
    audits.sort((a, b) => a.stepIndex - b.stepIndex);
    
    // Generate statistics
    const stats = {
        total: audits.length,
        
        // Formula migration
        withWoundsFormula: audits.filter(a => a.hasWoundsFormula).length,
        withWoundsLegacy: audits.filter(a => a.hasWoundsLegacy).length,
        woundsNeedsMigration: audits.filter(a => a.hasWoundsLegacy && !a.hasWoundsFormula).length,
        
        withFateFormula: audits.filter(a => a.hasFateFormula).length,
        withFateLegacy: audits.filter(a => a.hasFateLegacy).length,
        fateNeedsMigration: audits.filter(a => a.hasFateLegacy && !a.hasFateFormula).length,
        
        // effectText deprecation
        withEffectText: audits.filter(a => a.hasEffectText).length,
        withoutDescription: audits.filter(a => !a.hasDescription).length,
        
        // Choice candidates
        specialAbilitiesWithoutChoices: audits.filter(a => a.hasSpecialAbilities && !a.hasChoices).length,
        withChoices: audits.filter(a => a.hasChoices).length,
        
        // Grant statistics
        totalTalents: audits.reduce((sum, a) => sum + a.talentsCount, 0),
        totalTraits: audits.reduce((sum, a) => sum + a.traitsCount, 0),
        totalSkills: audits.reduce((sum, a) => sum + a.skillsCount, 0),
        totalAptitudes: audits.reduce((sum, a) => sum + a.aptitudesCount, 0),
        totalEquipment: audits.reduce((sum, a) => sum + a.equipmentCount, 0)
    };
    
    // Display summary
    console.log(`${colors.cyan}Summary Statistics${colors.reset}`);
    console.log(`${'─'.repeat(55)}`);
    console.log(`Total Origins: ${stats.total}\n`);
    
    console.log(`${colors.cyan}Formula Migration Status:${colors.reset}`);
    console.log(`  Wounds Formula: ${colors.green}${stats.withWoundsFormula}${colors.reset} / ${stats.total}`);
    console.log(`  Wounds Legacy:  ${stats.withWoundsLegacy}`);
    console.log(`  Needs Migration: ${stats.woundsNeedsMigration > 0 ? colors.yellow : colors.green}${stats.woundsNeedsMigration}${colors.reset}\n`);
    
    console.log(`  Fate Formula: ${colors.green}${stats.withFateFormula}${colors.reset} / ${stats.total}`);
    console.log(`  Fate Legacy:  ${stats.withFateLegacy}`);
    console.log(`  Needs Migration: ${stats.fateNeedsMigration > 0 ? colors.yellow : colors.green}${stats.fateNeedsMigration}${colors.reset}\n`);
    
    console.log(`${colors.cyan}Content Deprecation:${colors.reset}`);
    console.log(`  With effectText: ${stats.withEffectText > 0 ? colors.yellow : colors.green}${stats.withEffectText}${colors.reset}`);
    console.log(`  Without Description: ${stats.withoutDescription > 0 ? colors.yellow : colors.green}${stats.withoutDescription}${colors.reset}\n`);
    
    console.log(`${colors.cyan}Choice System:${colors.reset}`);
    console.log(`  With Choices: ${colors.green}${stats.withChoices}${colors.reset}`);
    console.log(`  SpecialAbilities without Choices: ${stats.specialAbilitiesWithoutChoices > 0 ? colors.yellow : colors.green}${stats.specialAbilitiesWithoutChoices}${colors.reset}\n`);
    
    console.log(`${colors.cyan}Grant Totals:${colors.reset}`);
    console.log(`  Talents: ${stats.totalTalents}`);
    console.log(`  Traits: ${stats.totalTraits}`);
    console.log(`  Skills: ${stats.totalSkills}`);
    console.log(`  Aptitudes: ${stats.totalAptitudes}`);
    console.log(`  Equipment: ${stats.totalEquipment}\n`);
    
    // Generate detailed report
    const reportPath = path.join(__dirname, '../../ORIGIN_PATH_AUDIT_REPORT.md');
    generateReport(reportPath, audits, stats);
    
    console.log(`${colors.green}Detailed report saved to: ${reportPath}${colors.reset}\n`);
}

/**
 * Generate markdown report
 */
function generateReport(filePath, audits, stats) {
    const lines = [];
    
    lines.push('# Origin Path Audit Report\n');
    lines.push(`**Generated**: ${new Date().toISOString()}\n`);
    lines.push(`**Total Origins**: ${stats.total}\n`);
    lines.push('---\n');
    
    // Summary statistics
    lines.push('## Summary Statistics\n');
    lines.push('### Formula Migration Status\n');
    lines.push('| Metric | Count |');
    lines.push('|--------|-------|');
    lines.push(`| **Wounds Formula** | ${stats.withWoundsFormula} / ${stats.total} |`);
    lines.push(`| Wounds Legacy Only | ${stats.withWoundsLegacy} |`);
    lines.push(`| **Needs Migration** | **${stats.woundsNeedsMigration}** |`);
    lines.push(`| **Fate Formula** | ${stats.withFateFormula} / ${stats.total} |`);
    lines.push(`| Fate Legacy Only | ${stats.withFateLegacy} |`);
    lines.push(`| **Needs Migration** | **${stats.fateNeedsMigration}** |\n`);
    
    lines.push('### Content Deprecation\n');
    lines.push('| Metric | Count |');
    lines.push('|--------|-------|');
    lines.push(`| With effectText | ${stats.withEffectText} |`);
    lines.push(`| Without Description | ${stats.withoutDescription} |\n`);
    
    lines.push('### Choice System\n');
    lines.push('| Metric | Count |');
    lines.push('|--------|-------|');
    lines.push(`| With Choices | ${stats.withChoices} |`);
    lines.push(`| SpecialAbilities without Choices | ${stats.specialAbilitiesWithoutChoices} |\n`);
    
    lines.push('### Grant Totals\n');
    lines.push('| Type | Count |');
    lines.push('|------|-------|');
    lines.push(`| Talents | ${stats.totalTalents} |`);
    lines.push(`| Traits | ${stats.totalTraits} |`);
    lines.push(`| Skills | ${stats.totalSkills} |`);
    lines.push(`| Aptitudes | ${stats.totalAptitudes} |`);
    lines.push(`| Equipment | ${stats.totalEquipment} |\n`);
    
    // Origins needing migration
    const woundsNeedMigration = audits.filter(a => a.hasWoundsLegacy && !a.hasWoundsFormula);
    const fateNeedMigration = audits.filter(a => a.hasFateLegacy && !a.hasFateFormula);
    
    if (woundsNeedMigration.length > 0) {
        lines.push('## Origins Needing Wounds Formula Migration\n');
        for (const audit of woundsNeedMigration) {
            lines.push(`- **${audit.name}** (${audit.step})`);
            lines.push(`  - Legacy wounds: ${audit.woundsLegacy}`);
        }
        lines.push('');
    }
    
    if (fateNeedMigration.length > 0) {
        lines.push('## Origins Needing Fate Formula Migration\n');
        for (const audit of fateNeedMigration) {
            lines.push(`- **${audit.name}** (${audit.step})`);
            lines.push(`  - Legacy fate threshold: ${audit.fateLegacy}`);
        }
        lines.push('');
    }
    
    // SpecialAbilities without choices
    const choiceCandidates = audits.filter(a => a.hasSpecialAbilities && !a.hasChoices);
    if (choiceCandidates.length > 0) {
        lines.push('## Origins with SpecialAbilities but No Choices\n');
        lines.push('*These may be candidates for choice system conversion*\n');
        for (const audit of choiceCandidates) {
            lines.push(`- **${audit.name}** (${audit.step})`);
            lines.push(`  - Special abilities: ${audit.specialAbilitiesCount}`);
        }
        lines.push('');
    }
    
    // Full origin list by step
    lines.push('## Complete Origin List by Step\n');
    
    const byStep = {};
    for (const audit of audits) {
        if (!byStep[audit.step]) byStep[audit.step] = [];
        byStep[audit.step].push(audit);
    }
    
    for (const [step, origins] of Object.entries(byStep)) {
        lines.push(`### ${step.charAt(0).toUpperCase() + step.slice(1)}\n`);
        lines.push('| Name | Wounds | Fate | Choices | Grants |');
        lines.push('|------|--------|------|---------|--------|');
        
        for (const audit of origins) {
            const wounds = audit.hasWoundsFormula ? `✓ ${audit.woundsFormula}` : 
                          audit.hasWoundsLegacy ? `⚠ ${audit.woundsLegacy}` : '—';
            const fate = audit.hasFateFormula ? `✓ ${audit.fateFormula}` : 
                        audit.hasFateLegacy ? `⚠ ${audit.fateLegacy}` : '—';
            const choices = audit.hasChoices ? `${audit.choicesCount} choices` : '—';
            const grants = `T:${audit.talentsCount} Tr:${audit.traitsCount} S:${audit.skillsCount}`;
            
            lines.push(`| ${audit.name} | ${wounds} | ${fate} | ${choices} | ${grants} |`);
        }
        lines.push('');
    }
    
    fs.writeFileSync(filePath, lines.join('\n'));
}

// Run audit
main();
