/**
 * Script to fix weapon quality compendium data
 * Migrates from old schema to new schema
 */

const fs = require('fs');
const path = require('path');

const PACK_DIR = path.join(__dirname, '..', 'src', 'packs', 'rt-items-weapon-qualities', '_source');

console.log('Fixing weapon quality compendium data...');
console.log(`Pack directory: ${PACK_DIR}`);

// Read all JSON files
const files = fs.readdirSync(PACK_DIR).filter((f) => f.endsWith('.json'));
console.log(`Found ${files.length} weapon quality files`);

let fixed = 0;
let errors = 0;

for (const file of files) {
    try {
        const filePath = path.join(PACK_DIR, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        // Skip if already migrated
        if (data.system.identifier && !data.system.rating) {
            console.log(`  ✓ ${file} - Already migrated`);
            continue;
        }

        const system = data.system;
        const oldSystem = { ...system };

        // Generate identifier from name
        const identifier = data.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

        // Migrate to new schema
        const newSystem = {
            identifier: identifier,
            hasLevel: (system.rating && system.rating > 0) || false,
            level: system.rating && system.rating > 0 ? system.rating : null,
            effect: typeof system.effect === 'number' ? `<p>Effect reference: ${system.effect}</p>` : system.effect || '',
            notes: '',
            description: system.description || { value: '', chat: '', summary: '' },
        };

        // Preserve any modifier notes
        if (system.modifiers) {
            const mods = [];
            if (system.modifiers.damage) mods.push(`Damage ${system.modifiers.damage >= 0 ? '+' : ''}${system.modifiers.damage}`);
            if (system.modifiers.penetration) mods.push(`Pen ${system.modifiers.penetration >= 0 ? '+' : ''}${system.modifiers.penetration}`);
            if (system.modifiers.toHit) mods.push(`Hit ${system.modifiers.toHit >= 0 ? '+' : ''}${system.modifiers.toHit}`);
            if (system.modifiers.range) mods.push(`Range ${system.modifiers.range >= 0 ? '+' : ''}${system.modifiers.range}`);
            if (mods.length > 0) {
                newSystem.notes = `Legacy modifiers: ${mods.join(', ')}`;
            }
        }
        if (system.specialEffect) {
            if (newSystem.notes) newSystem.notes += '. ';
            newSystem.notes += `Special: ${system.specialEffect}`;
        }

        // Update data
        data.system = newSystem;

        // Write back
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`  ✓ Fixed ${file} (${identifier})`);
        fixed++;
    } catch (error) {
        console.error(`  ✗ Error processing ${file}:`, error.message);
        errors++;
    }
}

console.log(`\nComplete! Fixed ${fixed} files, ${errors} errors`);
