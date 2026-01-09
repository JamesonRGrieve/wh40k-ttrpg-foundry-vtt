/**
 * Clean up skills pack data - remove duplicates, fix structure
 * Run: node scripts/clean-skills-pack.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.join(__dirname, '../src/packs/rt-items-skills/_source');

// Get all skill JSON files
const files = fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith('.json'));

console.log(`Processing ${files.length} skill files...`);

let cleaned = 0;
let errors = 0;
const changes = {
    removedRollConfigChar: 0,
    removedRollConfigMod: 0,
    removedEmptyRollConfig: 0,
    removedTypeField: 0,
    normalizedChar: 0,
    setSkillType: 0,
    fixedAptitudes: 0,
    fixedSpecializations: 0
};

for (const file of files) {
    try {
        const filePath = path.join(SKILLS_DIR, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        if (data.type !== 'skill') {
            console.warn(`Skipping non-skill: ${file}`);
            continue;
        }
        
        let modified = false;
        
        // Fix 1: Remove duplicate rollConfig.characteristic
        if (data.system.rollConfig?.characteristic) {
            delete data.system.rollConfig.characteristic;
            modified = true;
            changes.removedRollConfigChar++;
        }
        
        // Fix 2: Remove rollConfig.modifier (belongs on actor instance)
        if ('modifier' in (data.system.rollConfig ?? {})) {
            delete data.system.rollConfig.modifier;
            modified = true;
            changes.removedRollConfigMod++;
        }
        
        // Fix 3: Remove empty rollConfig object
        if (data.system.rollConfig && Object.keys(data.system.rollConfig).length === 0) {
            delete data.system.rollConfig;
            modified = true;
            changes.removedEmptyRollConfig++;
        }
        
        // Fix 4: Remove legacy 'type' field
        if ('type' in data.system) {
            delete data.system.type;
            modified = true;
            changes.removedTypeField++;
        }
        
        // Fix 5: Normalize characteristic to lowercase
        if (data.system.characteristic) {
            const normalized = data.system.characteristic.toLowerCase();
            if (normalized !== data.system.characteristic) {
                data.system.characteristic = normalized;
                modified = true;
                changes.normalizedChar++;
            }
        }
        
        // Fix 6: Ensure skillType is set
        if (!data.system.skillType) {
            // Infer from presence of specializations
            data.system.skillType = (data.system.specializations?.length > 0) 
                ? 'specialist' 
                : 'basic';
            modified = true;
            changes.setSkillType++;
        }
        
        // Fix 7: Ensure aptitudes is array
        if (!Array.isArray(data.system.aptitudes)) {
            data.system.aptitudes = [];
            modified = true;
            changes.fixedAptitudes++;
        }
        
        // Fix 8: Ensure specializations is array (for specialist skills)
        if (data.system.skillType === 'specialist' && !Array.isArray(data.system.specializations)) {
            data.system.specializations = [];
            modified = true;
            changes.fixedSpecializations++;
        }
        
        if (modified) {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
            cleaned++;
            console.log(`✓ Cleaned: ${file}`);
        }
        
    } catch (err) {
        console.error(`✗ Error processing ${file}:`, err.message);
        errors++;
    }
}

console.log('\n' + '='.repeat(60));
console.log('CLEANING SUMMARY');
console.log('='.repeat(60));
console.log(`Files processed: ${files.length}`);
console.log(`Files cleaned: ${cleaned}`);
console.log(`Errors: ${errors}`);
console.log('\nChanges made:');
console.log(`  - Removed rollConfig.characteristic: ${changes.removedRollConfigChar}`);
console.log(`  - Removed rollConfig.modifier: ${changes.removedRollConfigMod}`);
console.log(`  - Removed empty rollConfig: ${changes.removedEmptyRollConfig}`);
console.log(`  - Removed legacy type field: ${changes.removedTypeField}`);
console.log(`  - Normalized characteristic: ${changes.normalizedChar}`);
console.log(`  - Set skillType: ${changes.setSkillType}`);
console.log(`  - Fixed aptitudes array: ${changes.fixedAptitudes}`);
console.log(`  - Fixed specializations array: ${changes.fixedSpecializations}`);
console.log('='.repeat(60));
console.log('\n✓ Done! Commit these changes before building.');
