#!/usr/bin/env node

/**
 * Ship Roles Migration Script
 * Migrates all 22 ship role items from legacy string fields to V13 array schema
 * 
 * Usage:
 *   node scripts/migrate-ship-roles.mjs [--dry-run] [--verbose]
 * 
 * Options:
 *   --dry-run   Preview changes without modifying files
 *   --verbose   Show detailed transformation logs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PACK_PATH = path.join(__dirname, '../src/packs/rt-items-ship-roles/_source');
const BACKUP_ROOT = path.join(__dirname, '../src/packs/_backups');

// CLI flags
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');

// Career list for "any but" parsing
const ALL_CAREERS = [
    "Rogue Trader",
    "Arch-Militant",
    "Astropath Transcendent",
    "Explorator",
    "Missionary",
    "Navigator",
    "Seneschal",
    "Void-Master"
];

/**
 * Parse career preferences string to structured array
 */
function parseCareerPreferences(text) {
    const careers = [];
    let note = "";
    
    if (!text || text.trim() === "") {
        return { careers: [], note: "" };
    }
    
    // Handle "Only X" (exclusive role)
    const onlyMatch = text.match(/Only\s+([^,\.]+)/i);
    if (onlyMatch) {
        return {
            careers: [onlyMatch[1].trim()],
            note: "Exclusive role"
        };
    }
    
    // Extract "Usually X"
    const usuallyMatch = text.match(/Usually\s+([^,]+)/i);
    if (usuallyMatch) {
        note = `Typically ${usuallyMatch[1].trim()}`;
    }
    
    // Handle "any but X, Y, Z"
    const anyButMatch = text.match(/any but\s+([^\.]+)/i);
    if (anyButMatch) {
        const excludedText = anyButMatch[1];
        const excluded = excludedText.split(/[,\/]/).map(s => s.trim());
        
        // Add all careers except excluded ones
        ALL_CAREERS.forEach(career => {
            const isExcluded = excluded.some(ex => 
                career.toLowerCase().includes(ex.toLowerCase()) || 
                ex.toLowerCase().includes(career.toLowerCase())
            );
            if (!isExcluded) {
                careers.push(career);
            }
        });
    } else {
        // Try to extract explicit career list
        const explicitCareers = text.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g);
        if (explicitCareers) {
            explicitCareers.forEach(c => {
                const career = c.trim();
                if (ALL_CAREERS.some(ac => ac.includes(career) || career.includes(ac))) {
                    if (!careers.includes(career)) careers.push(career);
                }
            });
        }
    }
    
    // If no careers extracted, store note as fallback
    if (careers.length === 0 && !note) {
        note = text.trim();
    }
    
    return { careers, note };
}

/**
 * Parse subordinates string to array
 */
function parseSubordinates(text) {
    if (!text || text.trim() === "") return [];
    
    // Remove terminal punctuation
    text = text.replace(/\.$/, '');
    
    // Split on commas and "and"
    const parts = text.split(/,\s*|\s+and\s+/i);
    
    return parts.map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Parse important skills string to structured array
 */
function parseImportantSkills(text) {
    if (!text || text.trim() === "") return [];
    
    const skills = [];
    
    // Match skill patterns including parentheses
    const regex = /([^,(]+(?:\([^)]+\))?)/g;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
        const skillText = match[1].trim();
        if (!skillText) continue;
        
        // Check for specialization in parentheses
        const specMatch = skillText.match(/^([^(]+)\(([^)]+)\)$/);
        if (specMatch) {
            skills.push({
                name: specMatch[1].trim(),
                specialization: specMatch[2].trim()
            });
        } else {
            skills.push({
                name: skillText,
                specialization: ""
            });
        }
    }
    
    return skills;
}

/**
 * Extract structured abilities from effect text
 */
function parseEffectToAbilities(effectText, roleName) {
    if (!effectText || effectText.trim() === "") return [];
    
    const abilities = [];
    
    // Pattern: "+X to [Action] Extended Actions"
    const extendedMatch = effectText.match(/([+-]\d+)\s+to\s+"?([^"]+?)"?\s+Extended\s+Actions?/i);
    if (extendedMatch) {
        const bonus = parseInt(extendedMatch[1]);
        const action = extendedMatch[2].trim();
        
        abilities.push({
            name: `${action} Expertise`,
            description: `<p>${effectText}</p>`,
            bonus: bonus,
            action: action,
            actionType: "extended"
        });
        
        return abilities;
    }
    
    // Pattern: "+X to [Skill/Test]"
    const skillBonusMatch = effectText.match(/([+-]\d+)\s+to\s+(?:all\s+)?([^\.]+?)(?:\s+(?:Tests?|Checks?|Skill))?(?:\s+made)?/i);
    if (skillBonusMatch) {
        const bonus = parseInt(skillBonusMatch[1]);
        const target = skillBonusMatch[2].trim();
        
        abilities.push({
            name: `${roleName} Bonus`,
            description: `<p>${effectText}</p>`,
            bonus: bonus,
            skill: target,
            actionType: "passive"
        });
        
        return abilities;
    }
    
    // Pattern: "can [do something]"
    const specialMatch = effectText.match(/can\s+(.+?)(?:\.|$)/i);
    if (specialMatch) {
        abilities.push({
            name: `${roleName} Authority`,
            description: `<p>${effectText}</p>`,
            action: specialMatch[1].trim(),
            actionType: "special"
        });
        
        return abilities;
    }
    
    // Pattern: "May [do something]"
    const mayMatch = effectText.match(/May\s+(.+?)(?:\.|$)/i);
    if (mayMatch) {
        abilities.push({
            name: `${roleName} Ability`,
            description: `<p>${effectText}</p>`,
            action: mayMatch[1].trim(),
            actionType: "special"
        });
        
        return abilities;
    }
    
    // Fallback: create generic ability
    abilities.push({
        name: `${roleName} Effect`,
        description: `<p>${effectText}</p>`,
        actionType: "passive"
    });
    
    return abilities;
}

/**
 * Extract ship bonuses from effect text
 */
function extractShipBonuses(effectText) {
    const bonuses = {
        manoeuvrability: 0,
        detection: 0,
        ballisticSkill: 0,
        crewRating: 0
    };
    
    if (!effectText) return bonuses;
    
    // Crew Rating bonus
    const crewMatch = effectText.match(/([+-]\d+)\s+to\s+Ship\s+Crew\s+Rating/i);
    if (crewMatch) bonuses.crewRating = parseInt(crewMatch[1]);
    
    // Detection bonus
    const detMatch = effectText.match(/([+-]\d+)\s+(?:to\s+)?Detection/i);
    if (detMatch) bonuses.detection = parseInt(detMatch[1]);
    
    // BS bonus (ship weapons)
    const bsMatch = effectText.match(/([+-]\d+)\s+to\s+BS\s+Tests?\s+on\s+Ship\s+Weapons/i);
    if (bsMatch) bonuses.ballisticSkill = parseInt(bsMatch[1]);
    
    return bonuses;
}

/**
 * Migrate a single ship role item
 */
function migrateShipRole(item) {
    const migrated = JSON.parse(JSON.stringify(item)); // Deep clone
    
    // Track changes
    const changes = [];
    
    // Migrate careerPreferences
    if (typeof migrated.system.careerPreferences === 'string') {
        const original = migrated.system.careerPreferences;
        const parsed = parseCareerPreferences(original);
        migrated.system.careerPreferences = parsed.careers;
        if (parsed.note) {
            migrated.system.careerNote = parsed.note;
        }
        changes.push(`careerPreferences: string → array[${parsed.careers.length}]`);
        if (parsed.note) changes.push(`careerNote: "${parsed.note}"`);
    }
    
    // Migrate subordinates
    if (typeof migrated.system.subordinates === 'string') {
        const original = migrated.system.subordinates;
        const parsed = parseSubordinates(original);
        migrated.system.subordinates = parsed;
        changes.push(`subordinates: string → array[${parsed.length}]`);
    }
    
    // Migrate importantSkills
    if (typeof migrated.system.importantSkills === 'string') {
        const original = migrated.system.importantSkills;
        const parsed = parseImportantSkills(original);
        migrated.system.importantSkills = parsed;
        changes.push(`importantSkills: string → array[${parsed.length}]`);
    }
    
    // Extract abilities from effect (if abilities empty)
    if (migrated.system.effect && (!migrated.system.abilities || migrated.system.abilities.length === 0)) {
        const abilities = parseEffectToAbilities(migrated.system.effect, item.name);
        migrated.system.abilities = abilities;
        changes.push(`abilities: extracted ${abilities.length} from effect`);
    }
    
    // Extract ship bonuses
    if (migrated.system.effect) {
        const bonuses = extractShipBonuses(migrated.system.effect);
        const oldBonuses = migrated.system.shipBonuses || {};
        migrated.system.shipBonuses = bonuses;
        
        const nonZero = Object.entries(bonuses).filter(([k, v]) => v !== 0);
        if (nonZero.length > 0) {
            changes.push(`shipBonuses: ${nonZero.map(([k, v]) => `${k}=${v}`).join(', ')}`);
        }
    }
    
    return { migrated, changes };
}

/**
 * Create timestamped backup
 */
function createBackup() {
    const timestamp = Date.now();
    const backupDir = path.join(BACKUP_ROOT, `ship-roles-${timestamp}`);
    
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
    
    // Copy all source files
    const files = fs.readdirSync(PACK_PATH).filter(f => f.endsWith('.json'));
    for (const file of files) {
        const src = path.join(PACK_PATH, file);
        const dest = path.join(backupDir, file);
        fs.copyFileSync(src, dest);
    }
    
    console.log(`✅ Backup created: ${backupDir}`);
    return backupDir;
}

/**
 * Main migration function
 */
function main() {
    console.log("=".repeat(60));
    console.log("  Ship Roles Migration Script");
    console.log("  Migrating 22 ship role items to V13 schema");
    console.log("=".repeat(60));
    console.log("");
    
    if (DRY_RUN) {
        console.log("⚠️  DRY RUN MODE - No files will be modified");
        console.log("");
    }
    
    // Read all ship role files
    const files = fs.readdirSync(PACK_PATH).filter(f => f.endsWith('.json'));
    console.log(`📂 Found ${files.length} ship role files`);
    console.log("");
    
    // Create backup (unless dry run)
    if (!DRY_RUN) {
        createBackup();
        console.log("");
    }
    
    // Process each file
    let successCount = 0;
    let errorCount = 0;
    const allChanges = [];
    
    for (const file of files) {
        const filePath = path.join(PACK_PATH, file);
        
        try {
            // Read and parse
            const content = fs.readFileSync(filePath, 'utf8');
            const item = JSON.parse(content);
            
            // Migrate
            const { migrated, changes } = migrateShipRole(item);
            
            // Log changes
            if (VERBOSE || DRY_RUN) {
                console.log(`📝 ${item.name} (${file})`);
                if (changes.length > 0) {
                    changes.forEach(c => console.log(`   • ${c}`));
                } else {
                    console.log(`   ✓ No changes needed`);
                }
                console.log("");
            }
            
            allChanges.push({ name: item.name, file, changes });
            
            // Write migrated data (unless dry run)
            if (!DRY_RUN) {
                fs.writeFileSync(filePath, JSON.stringify(migrated, null, 2));
            }
            
            successCount++;
            
        } catch (error) {
            console.error(`❌ Error processing ${file}:`, error.message);
            errorCount++;
        }
    }
    
    // Summary
    console.log("");
    console.log("=".repeat(60));
    console.log("  Migration Summary");
    console.log("=".repeat(60));
    console.log(`✅ Successfully processed: ${successCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📊 Total changes: ${allChanges.reduce((sum, c) => sum + c.changes.length, 0)}`);
    
    if (DRY_RUN) {
        console.log("");
        console.log("⚠️  This was a DRY RUN - no files were modified");
        console.log("   Run without --dry-run to apply changes");
    } else {
        console.log("");
        console.log("✅ Migration complete!");
        console.log(`   Backup available in: ${BACKUP_ROOT}`);
    }
    
    console.log("=".repeat(60));
}

// Run migration
main();
